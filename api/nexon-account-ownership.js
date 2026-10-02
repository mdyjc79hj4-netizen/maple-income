const CHARACTER_LIST_URL = 'https://open.api.nexon.com/maplestory/v1/character/list';

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function validOcid(value) {
  return /^[A-Za-z0-9_-]{16,80}$/.test(value);
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

function publicError(status, payload) {
  const upstreamCode = typeof payload?.error?.name === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(payload.error.name)
    ? payload.error.name
    : status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'UPSTREAM_ERROR';
  const upstreamMessage = sanitizeUpstreamText(payload?.error?.message);
  const category = upstreamCode === 'OPENAPI00005'
    ? 'invalid_api_key'
    : status === 403 ? 'forbidden' : status === 429 ? 'rate_limited' : status >= 500 ? 'upstream_unavailable' : 'unknown_upstream_error';
  return {
    ok: false,
    code: upstreamCode,
    category,
    source: 'nexon_upstream',
    message: 'NEXON API Key 계정 확인 요청을 처리하지 못했습니다.',
    ...(upstreamMessage ? {upstreamMessage} : {})
  };
}

function summarizeOwnership(payload, selectedOcid) {
  if (!payload || !Array.isArray(payload.account_list)) {
    throw Object.assign(new Error('NEXON 캐릭터 목록 응답 구조가 올바르지 않습니다.'), {status: 502, code: 'INVALID_CHARACTER_LIST_RESPONSE'});
  }
  let characterCount = 0;
  let characterOwnedByServerKey = false;
  for (const account of payload.account_list) {
    const characters = Array.isArray(account?.character_list) ? account.character_list : [];
    characterCount += characters.length;
    if (characters.some(character => character?.ocid === selectedOcid)) characterOwnedByServerKey = true;
  }
  return {
    ok: true,
    characterOwnedByServerKey,
    accountCount: payload.account_list.length,
    characterCount,
    applicationCategory: characterOwnedByServerKey ? '' : 'scheduler_account_restriction',
    checkedAt: new Date().toISOString()
  };
}

async function requestCharacterList(apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(CHARACTER_LIST_URL, {
      headers: {'x-nxopen-api-key': apiKey, accept: 'application/json'},
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(new Error('NEXON API Key 계정 확인 요청을 처리하지 못했습니다.'), {status: response.status, payload});
    return payload;
  } catch (error) {
    if (error?.status) throw error;
    const status = error?.name === 'AbortError' ? 503 : 502;
    throw Object.assign(new Error('NEXON API Key 계정 확인 요청을 처리하지 못했습니다.'), {status});
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
  const apiKey = process.env.NEXON_OPEN_API_KEY;
  if (!apiKey) return send(res, 503, {ok: false, code: 'NOT_CONFIGURED', message: 'NEXON Open API 환경변수가 설정되지 않았습니다.'});
  const ocid = String(req.query.ocid || '').trim();
  if (!validOcid(ocid)) return send(res, 400, {ok: false, code: 'BAD_REQUEST', category: 'invalid_request', source: 'proxy_validation', message: '캐릭터 식별자를 확인해주세요.'});
  try {
    const payload = await requestCharacterList(apiKey);
    return send(res, 200, summarizeOwnership(payload, ocid));
  } catch (error) {
    const status = [400, 403, 429, 500, 503].includes(Number(error?.status)) ? Number(error.status) : 502;
    const details = error?.payload ? publicError(status, error.payload) : {
      ok: false,
      code: error?.code || (status === 503 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_ERROR'),
      category: 'upstream_unavailable',
      source: 'proxy_runtime',
      message: sanitizeUpstreamText(error?.message) || 'NEXON API Key 계정 확인 요청을 처리하지 못했습니다.'
    };
    console.error('NEXON character list ownership diagnostic failed', {
      endpoint: 'character/list', status, code: details.code, category: details.category
    });
    return send(res, status, details);
  }
}

export const nexonAccountOwnershipInternals = {CHARACTER_LIST_URL, publicError, requestCharacterList, sanitizeUpstreamText, summarizeOwnership, validOcid};
