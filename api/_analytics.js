import {createHmac} from 'node:crypto';

const VISITOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export {VISITOR_UUID_PATTERN, analyticsSecret, dateRangeEnding, kstDate, normalizeVisitorId, visitorHash};
export const analyticsInternals = {analyticsSecret, dateRangeEnding, kstDate, normalizeVisitorId, visitorHash};
