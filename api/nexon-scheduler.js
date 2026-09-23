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

function publicError(status) {
  return {
    code: status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'UPSTREAM_ERROR',
    message: statusMessages[status] || 'NEXON API 요청을 처리하지 못했습니다.'
  };
}

async function requestNexon(path, params, apiKey) {
  const target = new URL(path, NEXON_BASE_URL);
  for (const [key, value] of Object.entries(params)) if (value) target.searchParams.set(key, value);
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
    throw Object.assign(new Error(publicError(status).message), {status});
  }
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error('NEXON API 응답 형식이 올바르지 않습니다.'), {status: 502});
  }
}

function sanitizeScheduler(payload, ocid) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.boss_contents)) {
    throw Object.assign(new Error('NEXON 스케줄러 응답 구조가 변경되었습니다.'), {status: 502});
  }
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    date: typeof payload.date === 'string' ? payload.date : '',
    character: {
      ocid,
      name: typeof payload.character_name === 'string' ? payload.character_name : '',
      world: typeof payload.world_name === 'string' ? payload.world_name : ''
    },
    bosses: payload.boss_contents.filter(item => item && typeof item === 'object').map(item => ({
      contentName: typeof item.content_name === 'string' ? item.content_name : '',
      difficulty: typeof item.difficulty === 'string' ? item.difficulty : '',
      cycle: typeof item.cycle === 'string' ? item.cycle : '',
      registered: item.registration_flag === true || item.registration_flag === 'true',
      complete: item.complete_flag === true || item.complete_flag === 'true'
    }))
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
  const apiKey = process.env.NEXON_OPEN_API_KEY;
  if (!apiKey) return send(res, 503, {ok: false, code: 'NOT_CONFIGURED', message: 'NEXON Open API 환경변수가 설정되지 않았습니다.'});
  const characterName = String(req.query.characterName || '').trim();
  let ocid = String(req.query.ocid || '').trim();
  const date = String(req.query.date || '').trim();
  if ((!characterName && !ocid) || characterName.length > 40 || (ocid && !/^[A-Za-z0-9_-]{16,80}$/.test(ocid)) || !validDate(date)) {
    return send(res, 400, {ok: false, ...publicError(400)});
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
    const value = sanitizeScheduler(payload, ocid);
    cache.set(cacheKey, {savedAt: Date.now(), value});
    return send(res, 200, value);
  } catch (error) {
    const status = Number(error?.status) || 502;
    return send(res, status, {ok: false, ...publicError(status), message: error?.message || publicError(status).message});
  }
}

export const nexonProxyInternals = {publicError, sanitizeScheduler, validDate};
