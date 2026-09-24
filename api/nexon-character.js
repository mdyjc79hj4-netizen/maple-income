const NEXON_BASE_URL = 'https://open.api.nexon.com';
const PROFILE_CACHE_TTL_MS = 30 * 60_000;
const cache = new Map();

const statusMessages = {
  400: '캐릭터 식별 정보를 확인해주세요.',
  403: 'NEXON Open API 권한을 확인해주세요.',
  429: 'NEXON API 호출 한도를 초과했습니다. 잠시 후 다시 확인해주세요.',
  500: 'NEXON API에 일시적인 장애가 발생했습니다.',
  503: 'NEXON API가 일시적으로 응답하지 않습니다.'
};

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function publicError(status) {
  return {
    code: status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'UPSTREAM_ERROR',
    message: statusMessages[status] || 'NEXON 캐릭터 기본정보를 확인하지 못했습니다.'
  };
}

function validOcid(value) {
  return /^[A-Za-z0-9_-]{16,80}$/.test(value);
}

function upstreamErrorCode(payload) {
  const value = payload?.error?.name || payload?.code;
  return typeof value === 'string' && value.length <= 80 ? value : '';
}

function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function sanitizeProfile(payload) {
  if (!payload || typeof payload !== 'object') {
    throw Object.assign(new Error('NEXON 캐릭터 기본정보 응답 구조가 변경되었습니다.'), {status: 502});
  }
  const level = Number(payload.character_level);
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    date: typeof payload.date === 'string' ? payload.date : '',
    character: {
      name: typeof payload.character_name === 'string' ? payload.character_name : '',
      world: typeof payload.world_name === 'string' ? payload.world_name : '',
      className: typeof payload.character_class === 'string' ? payload.character_class : '',
      level: Number.isInteger(level) && level >= 0 ? level : null,
      image: safeImageUrl(payload.character_image)
    }
  };
}

async function requestProfile(ocid, apiKey) {
  const target = new URL('/maplestory/v1/character/basic', NEXON_BASE_URL);
  target.searchParams.set('ocid', ocid);
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
    throw Object.assign(new Error(publicError(status).message), {status, code: upstreamErrorCode(payload) || publicError(status).code});
  }
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error('NEXON API 응답 형식이 올바르지 않습니다.'), {status: 502});
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
  const apiKey = process.env.NEXON_OPEN_API_KEY;
  if (!apiKey) return send(res, 503, {ok: false, code: 'NOT_CONFIGURED', message: 'NEXON Open API 환경변수가 설정되지 않았습니다.'});
  const ocid = String(req.query.ocid || '').trim();
  if (!validOcid(ocid)) return send(res, 400, {ok: false, ...publicError(400)});

  const cached = cache.get(ocid);
  if (cached && Date.now() - cached.savedAt < PROFILE_CACHE_TTL_MS) return send(res, 200, {...cached.value, cached: true});
  try {
    const value = sanitizeProfile(await requestProfile(ocid, apiKey));
    cache.set(ocid, {savedAt: Date.now(), value});
    return send(res, 200, value);
  } catch (error) {
    const status = Number(error?.status) || 502;
    const fallback = publicError(status);
    const code = typeof error?.code === 'string' ? error.code : fallback.code;
    const message = error?.message || fallback.message;
    console.error('NEXON character profile request failed', {status, code, message});
    return send(res, status, {ok: false, ...fallback, code, message});
  }
}

export const nexonCharacterInternals = {PROFILE_CACHE_TTL_MS, publicError, safeImageUrl, sanitizeProfile, upstreamErrorCode, validOcid};
