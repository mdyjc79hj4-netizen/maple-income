const NEXON_BASE_URL = 'https://open.api.nexon.com';
const CACHE_TTL_MS = 60_000;
const cache = new Map();

const statusMessages = {
  400: '캐릭터 정보나 조회 날짜를 확인해주세요.',
  403: 'NEXON Open API 권한을 확인해주세요.',
  429: 'NEXON API 호출 한도를 초과했습니다. 잠시 후 다시 확인해주세요.',
  500: 'NEXON API에 일시적인 장애가 발생했습니다.',
  503: 'NEXON API가 일시적으로 응답하지 않습니다.'
};

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const requested = Date.parse(value + 'T00:00:00+09:00');
  if (Number.isNaN(requested)) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date()).map(part => [part.type, part.value]));
  const todayKst = Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T00:00:00+09:00');
  const days = Math.round((todayKst - requested) / 86_400_000);
  return days >= 0 && days <= 14;
}

function validOcid(value) {
  return /^[A-Za-z0-9_-]{16,80}$/.test(value);
}

function publicError(status) {
  return {
    code: status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'UPSTREAM_ERROR',
    message: statusMessages[status] || 'NEXON API 요청을 처리하지 못했습니다.'
  };
}

function sanitizeUpstreamText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/(bearer|x-nxopen-api-key)\s*[:=]?\s*[^\s,;]+/gi, '$1 [숨김]')
    .replace(/[A-Za-z0-9_-]{16,}/g, '[식별자 숨김]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function upstreamErrorDetails(payload, status) {
  const rawCode = payload?.error?.name;
  const upstreamCode = typeof rawCode === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(rawCode) ? rawCode : '';
  const upstreamMessage = sanitizeUpstreamText(payload?.error?.message);
  const categoryByCode = {
    OPENAPI00003: 'invalid_identifier',
    OPENAPI00004: 'invalid_parameter',
    OPENAPI00005: 'invalid_api_key',
    OPENAPI00006: 'invalid_path',
    OPENAPI00009: 'data_preparing',
    OPENAPI00010: 'game_maintenance',
    OPENAPI00011: 'upstream_unavailable'
  };
  const category = categoryByCode[upstreamCode]
    || (status === 403 ? 'forbidden' : status === 429 ? 'rate_limited' : status >= 500 ? 'upstream_unavailable' : 'unknown_upstream_error');
  return {upstreamCode, upstreamMessage, category};
}

function schedulerErrorMessage(status, details) {
  if (details.category === 'invalid_identifier') return 'NEXON scheduler에서 이 캐릭터를 조회할 수 없습니다. API Key 소유 계정의 캐릭터인지 확인해주세요.';
  if (details.category === 'invalid_parameter') return 'NEXON scheduler 요청 파라미터가 유효하지 않습니다.';
  if (details.category === 'invalid_api_key') return 'NEXON Open API Key 설정을 확인해주세요.';
  if (details.category === 'invalid_path') return 'NEXON scheduler API 경로가 유효하지 않습니다.';
  if (details.category === 'data_preparing') return 'NEXON scheduler 데이터가 아직 준비 중입니다. 잠시 후 다시 확인해주세요.';
  if (details.category === 'game_maintenance') return '메이플스토리 점검 중에는 주간 기록을 조회할 수 없습니다.';
  return publicError(status).message;
}

function buildNexonUrl(path, params = {}) {
  const target = new URL(path, NEXON_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') target.searchParams.set(key, String(value));
  }
  return target;
}

async function requestNexon(path, params, apiKey) {
  const target = buildNexonUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response;
  try {
    response = await fetch(target, {headers: {'x-nxopen-api-key': apiKey, accept: 'application/json'}, signal: controller.signal});
  } catch (error) {
    const status = error?.name === 'AbortError' ? 503 : 500;
    throw Object.assign(new Error(statusMessages[status]), {status});
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const status = [400, 403, 429, 500, 503].includes(response.status) ? response.status : 502;
    let payload = null;
    try { payload = await response.json(); } catch {}
    const details = upstreamErrorDetails(payload, status);
    console.error('NEXON scheduler upstream request failed', {
      endpoint: path.replace(/^\/maplestory\/v1\//, ''),
      status,
      upstreamCode: details.upstreamCode,
      upstreamMessage: details.upstreamMessage
    });
    throw Object.assign(new Error(schedulerErrorMessage(status, details)), {
      status,
      code: details.upstreamCode || publicError(status).code,
      category: details.category,
      source: 'nexon_upstream',
      upstreamMessage: details.upstreamMessage
    });
  }
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error('NEXON API 응답 형식이 올바르지 않습니다.'), {status: 502});
  }
}

function parseFlag(value) {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function diagnosticText(value) {
  return typeof value === 'string' ? value.slice(0, 120) : '';
}

function diagnosticRaw(value) {
  const type = value === null ? 'null' : typeof value;
  if (type === 'string') return {type, value: value.slice(0, 80)};
  if (type === 'boolean' || type === 'number' || type === 'null') return {type, value};
  return {type, value: '[unsupported]'};
}

function diagnosticSample(item) {
  const complete = diagnosticRaw(item.complete_flag);
  const registered = diagnosticRaw(item.registration_flag);
  return {
    contentName: diagnosticText(item.content_name),
    difficulty: diagnosticText(item.difficulty),
    cycle: diagnosticText(item.cycle),
    registered: parseFlag(item.registration_flag),
    complete: parseFlag(item.complete_flag),
    rawCompleteType: complete.type,
    rawCompleteValue: complete.value,
    rawRegistrationType: registered.type,
    rawRegistrationValue: registered.value
  };
}

function sanitizeWeeklyContent(item) {
  const type = diagnosticText(item.type);
  const nowCount = Number.isFinite(Number(item.now_count)) ? Number(item.now_count) : 0;
  const maxCount = Number.isFinite(Number(item.max_count)) ? Number(item.max_count) : 0;
  const questState = diagnosticText(item.quest_state);
  return {
    contentName: diagnosticText(item.content_name),
    type, cycle: 'weekly',
    registered: parseFlag(item.registration_flag),
    nowCount,
    maxCount,
    questState,
    complete: type.trim().toLowerCase() === 'quest' ? questState === '2' : nowCount > 0
  };
}

function sanitizeScheduler(payload, ocid, requestedDate = '') {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.boss_contents)) {
    throw Object.assign(new Error('NEXON 스케줄러 응답 구조가 변경되었습니다.'), {status: 502});
  }
  const bossContents = payload.boss_contents.filter(item => item && typeof item === 'object');
  const weeklyContents = Array.isArray(payload.weekly_contents)
    ? payload.weekly_contents.filter(item => item && typeof item === 'object')
    : [];
  const diagnosticContents = bossContents.map((item, index) => ({item, index})).sort((left, right) => Number(parseFlag(right.item.complete_flag)) - Number(parseFlag(left.item.complete_flag)) || left.index - right.index);
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    date: typeof payload.date === 'string' ? payload.date : '',
    requestedDate: requestedDate || null,
    mode: requestedDate ? 'historical' : 'live',
    character: {
      ocid,
      name: typeof payload.character_name === 'string' ? payload.character_name : '',
      world: typeof payload.world_name === 'string' ? payload.world_name : ''
    },
    bosses: bossContents.map(item => ({
      contentName: typeof item.content_name === 'string' ? item.content_name : '',
      difficulty: typeof item.difficulty === 'string' ? item.difficulty : '',
      cycle: typeof item.cycle === 'string' ? item.cycle : '',
      registered: parseFlag(item.registration_flag),
      complete: parseFlag(item.complete_flag)
    })),
    activities: weeklyContents.map(sanitizeWeeklyContent),
    diagnostics: {
      samples: diagnosticContents.slice(0, 20).map(({item}) => diagnosticSample(item)),
      activitySamples: weeklyContents.slice(0, 20).map(sanitizeWeeklyContent)
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
  const apiKey = process.env.NEXON_OPEN_API_KEY;
  if (!apiKey) return send(res, 503, {ok: false, code: 'NOT_CONFIGURED', message: 'NEXON Open API 환경변수가 설정되지 않았습니다.'});
  const characterName = String(req.query.characterName || '').trim();
  let ocid = String(req.query.ocid || '').trim();
  const date = String(req.query.date || '').trim();
  if ((!characterName && !ocid) || characterName.length > 40 || (ocid && !validOcid(ocid)) || !validDate(date)) {
    return send(res, 400, {ok: false, ...publicError(400), category: 'invalid_request', source: 'proxy_validation'});
  }
  const cacheKey = (ocid || 'name:' + characterName) + ':' + (date || 'live');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return send(res, 200, {...cached.value, cached: true});
  try {
    if (!ocid) {
      const identity = await requestNexon('/maplestory/v1/id', {character_name: characterName}, apiKey);
      if (!identity || typeof identity.ocid !== 'string' || !identity.ocid) throw Object.assign(new Error('캐릭터 식별자를 확인하지 못했습니다.'), {status: 502});
      ocid = identity.ocid;
    }
    const payload = await requestNexon('/maplestory/v1/scheduler/character-state', {ocid, date}, apiKey);
    const value = sanitizeScheduler(payload, ocid, date);
    cache.set(cacheKey, {savedAt: Date.now(), value});
    return send(res, 200, value);
  } catch (error) {
    const status = Number(error?.status) || 502;
    const fallback = publicError(status);
    return send(res, status, {
      ok: false,
      code: error?.code || fallback.code,
      message: error?.message || fallback.message,
      category: error?.category || (status >= 500 ? 'upstream_unavailable' : 'unknown_upstream_error'),
      source: error?.source || 'proxy_runtime',
      ...(error?.upstreamMessage ? {upstreamMessage: error.upstreamMessage} : {})
    });
  }
}

export const nexonProxyInternals = {buildNexonUrl, diagnosticRaw, diagnosticSample, parseFlag, publicError, sanitizeScheduler, sanitizeUpstreamText, sanitizeWeeklyContent, schedulerErrorMessage, upstreamErrorDetails, validDate, validOcid};
