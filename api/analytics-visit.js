import {createAdminClient} from './_nexon-credential-store.js';
import {isAdminUser, optionalAuthenticatedUser} from './_admin-auth.js';
import {analyticsSecret, kstDate, normalizeVisitorId, visitorHash} from './_analytics.js';
import {requestBody, sendJson} from './_support.js';

async function recordVisit(adminClient, visitDate, hash) {
  const {error} = await adminClient.rpc('record_site_visit', {p_visit_date: visitDate, p_visitor_hash: hash});
  if (error) throw Object.assign(new Error('방문 통계를 기록하지 못했습니다.'), {status: 500, code: 'ANALYTICS_WRITE_FAILED'});
}

function createAnalyticsVisitHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 사용할 수 있습니다.'});
    try {
      const adminClient = dependencies.adminClient || (dependencies.createAdminClient || createAdminClient)(env);
      const user = await optionalAuthenticatedUser(req, adminClient, dependencies.authenticateRequest);
      if (isAdminUser(user, env)) return res.status(204).end();
      const visitorId = normalizeVisitorId(requestBody(req).visitorId);
      const date = (dependencies.kstDate || kstDate)();
      const hash = visitorHash(date, visitorId, analyticsSecret(env));
      await (dependencies.recordVisit || recordVisit)(adminClient, date, hash);
      return res.status(204).end();
    } catch (error) {
      const status = [400, 500, 503].includes(Number(error?.status)) ? Number(error.status) : 500;
      return sendJson(res, status, {ok: false, code: error?.code || 'ANALYTICS_REQUEST_FAILED', message: status === 400 ? '방문 식별자를 확인해주세요.' : '방문 통계를 기록하지 못했습니다.'});
    }
  };
}

const handler = createAnalyticsVisitHandler();
export default handler;
export const analyticsVisitInternals = {createAnalyticsVisitHandler, recordVisit};
