import {
  authenticateRequest,
  createAdminClient,
  deleteCredential,
  encryptCredential,
  encryptionKey,
  loadCredentialStatus,
  storeCredential
} from './_nexon-credential-store.js';

const CHARACTER_LIST_URL = 'https://open.api.nexon.com/maplestory/v1/character/list';

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}

function requestBody(req) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}

function normalizeApiKey(value) {
  const apiKey = typeof value === 'string' ? value.trim() : '';
  if (apiKey.length < 16 || apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw Object.assign(new Error('NEXON Open API Key를 확인해주세요.'), {status: 400, code: 'INVALID_API_KEY_FORMAT'});
  }
  return apiKey;
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

function summarizeCharacterList(payload, now = new Date()) {
  if (!payload || !Array.isArray(payload.account_list)) {
    throw Object.assign(new Error('NEXON 캐릭터 목록 응답을 확인하지 못했습니다.'), {status: 502, code: 'INVALID_CHARACTER_LIST_RESPONSE'});
  }
  return {
    verifiedAt: now.toISOString(),
    accountCount: payload.account_list.length,
    characterCount: payload.account_list.reduce((total, account) => total + (Array.isArray(account?.character_list) ? account.character_list.length : 0), 0)
  };
}

function upstreamError(status, payload) {
  const code = typeof payload?.error?.name === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(payload.error.name)
    ? payload.error.name
    : status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : 'NEXON_VERIFICATION_FAILED';
  const invalidKey = code === 'OPENAPI00005' || status === 401;
  const message = invalidKey
    ? 'NEXON Open API Key를 확인해주세요.'
    : status === 429
      ? 'NEXON API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      : status === 403
        ? 'NEXON Open API Key의 메이플스토리 API 권한을 확인해주세요.'
        : 'NEXON Open API Key를 확인하지 못했습니다.';
  const upstreamMessage = sanitizeUpstreamText(payload?.error?.message);
  return {ok: false, code, message, ...(upstreamMessage ? {upstreamMessage} : {})};
}

async function verifyNexonApiKey(apiKey, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(CHARACTER_LIST_URL, {
      headers: {'x-nxopen-api-key': apiKey, accept: 'application/json'},
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(new Error('NEXON Open API Key 검증에 실패했습니다.'), {
      status: response.status,
      publicError: upstreamError(response.status, payload)
    });
    return summarizeCharacterList(payload);
  } catch (error) {
    if (error?.publicError) throw error;
    const unavailable = error?.name === 'AbortError';
    throw Object.assign(new Error('NEXON Open API Key 검증 요청을 처리하지 못했습니다.'), {
      status: unavailable ? 503 : 502,
      code: unavailable ? 'NEXON_VERIFICATION_TIMEOUT' : 'NEXON_VERIFICATION_UNAVAILABLE'
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createCredentialHandler(dependencies = {}) {
  const getAdminClient = dependencies.createAdminClient || createAdminClient;
  const verifyKey = dependencies.verifyNexonApiKey || verifyNexonApiKey;
  const getEncryptionKey = dependencies.encryptionKey || encryptionKey;
  const encrypt = dependencies.encryptCredential || encryptCredential;
  const loadStatus = dependencies.loadCredentialStatus || loadCredentialStatus;
  const saveCredential = dependencies.storeCredential || storeCredential;
  const removeCredential = dependencies.deleteCredential || deleteCredential;

  return async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, DELETE 요청만 사용할 수 있습니다.'});
    }
    try {
      const adminClient = getAdminClient();
      const user = await authenticateRequest(req, adminClient);
      if (req.method === 'GET') return send(res, 200, await loadStatus(adminClient, user.id));
      if (req.method === 'DELETE') return send(res, 200, await removeCredential(adminClient, user.id));

      const apiKey = normalizeApiKey(requestBody(req).apiKey);
      const verification = await verifyKey(apiKey);
      const encrypted = encrypt(apiKey, user.id, getEncryptionKey());
      const status = await saveCredential(adminClient, user.id, encrypted, verification);
      return send(res, 200, status);
    } catch (error) {
      const status = [400, 401, 403, 429, 500, 502, 503].includes(Number(error?.status)) ? Number(error.status) : 500;
      const body = error?.publicError || {
        ok: false,
        code: error?.code || (status === 401 ? 'AUTH_REQUIRED' : 'CREDENTIAL_REQUEST_FAILED'),
        message: sanitizeUpstreamText(error?.message) || 'NEXON API Key 요청을 처리하지 못했습니다.'
      };
      console.error('NEXON credential request failed', {method: req.method, status, code: body.code});
      return send(res, status, body);
    }
  };
}

const handler = createCredentialHandler();
export default handler;

export const nexonCredentialInternals = {
  CHARACTER_LIST_URL,
  createCredentialHandler,
  normalizeApiKey,
  requestBody,
  sanitizeUpstreamText,
  summarizeCharacterList,
  upstreamError,
  verifyNexonApiKey
};
