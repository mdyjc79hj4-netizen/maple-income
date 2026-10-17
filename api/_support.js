const SUPPORT_CATEGORIES = Object.freeze(['bug', 'data', 'feature', 'account', 'other']);
const SUPPORT_STATUSES = Object.freeze(['pending', 'answered', 'closed']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicError(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function sendJson(res, status, body) {
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

function requestQuery(req) {
  return req?.query && typeof req.query === 'object' ? req.query : {};
}

function singleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeUuid(value, code = 'INVALID_REQUEST') {
  const result = String(value || '').trim();
  if (!UUID_PATTERN.test(result)) throw publicError(400, code, '요청 식별자를 확인해주세요.');
  return result;
}

function detectsSensitiveContent(value) {
  const text = String(value || '');
  const patterns = [
    /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bx-nxopen-api-key\s*[:=]\s*[^\s,;]{16,}/i,
    /\bNEXON_OPEN_API_KEY\s*[:=]\s*[^\s,;]{16,}/i,
    /(?:NEXON\s*(?:Open\s*)?API\s*Key|API\s*Key|access[_ -]?token|refresh[_ -]?token|인증\s*토큰|복구\s*코드|비밀번호)\s*[:=]\s*[^\s,;]{16,}/i
  ];
  return patterns.some(pattern => pattern.test(text));
}

function normalizeContent(value, {field = '내용', max = 5000} = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length < 1 || result.length > max) throw publicError(400, 'INVALID_REQUEST', `${field}은 1~${max}자로 입력해주세요.`);
  if (detectsSensitiveContent(result)) {
    throw publicError(400, 'SENSITIVE_CONTENT_DETECTED', '비밀번호, API Key, 인증 토큰 등 인증정보는 문의 내용에 포함할 수 없습니다.');
  }
  return result;
}

function normalizeTicketInput(body) {
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  if (!SUPPORT_CATEGORIES.includes(category)) throw publicError(400, 'INVALID_REQUEST', '문의 유형을 확인해주세요.');
  return {
    category,
    title: normalizeContent(body?.title, {field: '제목', max: 100}),
    content: normalizeContent(body?.content, {field: '내용', max: 5000}),
    isPrivate: body?.isPrivate !== false
  };
}

function normalizeReplyInput(body) {
  return {ticketId: normalizeUuid(body?.ticketId), content: normalizeContent(body?.content, {field: '답변', max: 5000})};
}

function ticketSummary(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    status: row.status,
    isPrivate: !!row.is_private,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicTicketSummary(row) {
  const {isPrivate: _isPrivate, ...summary} = ticketSummary(row);
  return summary;
}

function ticketDetail(row, replies = [], permissions = {}) {
  return {
    ...ticketSummary(row),
    content: row.content,
    replies: replies.map(reply => ({
      id: reply.id,
      authorRole: reply.author_role === 'admin' ? 'admin' : 'user',
      content: reply.content,
      createdAt: reply.created_at
    })),
    permissions: {
      canReply: !!permissions.canReply,
      canDelete: !!permissions.canDelete,
      canManage: !!permissions.canManage
    }
  };
}

function safeStatus(error, allowed = [400, 401, 403, 404, 409, 429, 500, 503]) {
  return allowed.includes(Number(error?.status)) ? Number(error.status) : 500;
}

function sendSupportError(res, error, fallbackCode = 'SUPPORT_REQUEST_FAILED') {
  const status = safeStatus(error);
  const code = error?.code || (status === 401 ? 'AUTH_REQUIRED' : fallbackCode);
  const safeMessages = new Set([
    'AUTH_REQUIRED', 'ADMIN_REQUIRED', 'ADMIN_NOT_CONFIGURED', 'TICKET_NOT_FOUND', 'FORBIDDEN',
    'RATE_LIMITED', 'SENSITIVE_CONTENT_DETECTED', 'INVALID_REQUEST', 'TICKET_CLOSED'
  ]);
  const message = safeMessages.has(code) && error?.message ? error.message : '문의 요청을 처리하지 못했습니다.';
  return sendJson(res, status, {ok: false, code, message});
}

export {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  UUID_PATTERN,
  detectsSensitiveContent,
  normalizeContent,
  normalizeReplyInput,
  normalizeTicketInput,
  normalizeUuid,
  publicTicketSummary,
  publicError,
  requestBody,
  requestQuery,
  safeStatus,
  sendJson,
  sendSupportError,
  singleQueryValue,
  ticketDetail,
  ticketSummary
};

export const supportInternals = {
  detectsSensitiveContent,
  normalizeContent,
  normalizeReplyInput,
  normalizeTicketInput,
  normalizeUuid,
  publicTicketSummary,
  ticketDetail,
  ticketSummary
};
