import {createHmac} from 'node:crypto';

const VISITOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function analyticsOriginError() {
  return Object.assign(new Error('허용되지 않은 방문 통계 요청입니다.'), {status: 403, code: 'ANALYTICS_ORIGIN_FORBIDDEN'});
}

function requestHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()] ?? req?.headers?.[name.toUpperCase()] ?? req?.get?.(name);
  return Array.isArray(value) ? value[0] : String(value || '');
}

function validateAnalyticsOrigin(req) {
  const originValue = requestHeader(req, 'origin').trim();
  const forwardedHost = requestHeader(req, 'x-forwarded-host').split(',')[0].trim();
  const requestHost = (forwardedHost || requestHeader(req, 'host')).trim().toLowerCase();
  if (!originValue || !requestHost) throw analyticsOriginError();
  let origin;
  try { origin = new URL(originValue); } catch { throw analyticsOriginError(); }
  const hostname = origin.hostname.toLowerCase();
  const localDevelopment = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (origin.host.toLowerCase() !== requestHost) throw analyticsOriginError();
  if (origin.protocol !== 'https:' && !(localDevelopment && origin.protocol === 'http:')) throw analyticsOriginError();
  return true;
}

function kstDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
}

function analyticsSecret(env = process.env) {
  const secret = String(env.VISITOR_HASH_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw Object.assign(new Error('방문 통계 secret 설정을 확인해주세요.'), {status: 503, code: 'ANALYTICS_NOT_CONFIGURED'});
  }
  return secret;
}

function visitorHash(date, visitorId, secret) {
  return createHmac('sha256', secret).update(`${date}:${visitorId}`, 'utf8').digest('hex');
}

function normalizeVisitorId(value) {
  const visitorId = String(value || '').trim().toLowerCase();
  if (!VISITOR_UUID_PATTERN.test(visitorId)) {
    throw Object.assign(new Error('방문 식별자를 확인해주세요.'), {status: 400, code: 'INVALID_VISITOR_ID'});
  }
  return visitorId;
}

function dateRangeEnding(endDate, days) {
  const [year, month, day] = endDate.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day));
  return Array.from({length: days}, (_, index) => {
    const value = new Date(end.getTime() - (days - index - 1) * 86400000);
    return value.toISOString().slice(0, 10);
  });
}

export {VISITOR_UUID_PATTERN, analyticsSecret, dateRangeEnding, kstDate, normalizeVisitorId, validateAnalyticsOrigin, visitorHash};
export const analyticsInternals = {analyticsSecret, dateRangeEnding, kstDate, normalizeVisitorId, validateAnalyticsOrigin, visitorHash};
