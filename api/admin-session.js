import {authenticateRequest, createAdminClient} from './_nexon-credential-store.js';
import {isAdminUser} from './_admin-auth.js';
import {sendJson} from './_support.js';

function createAdminSessionHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  return async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
    try {
      const adminClient = dependencies.adminClient || (dependencies.createAdminClient || createAdminClient)(env);
      const user = await (dependencies.authenticateRequest || authenticateRequest)(req, adminClient);
      return sendJson(res, 200, {ok: true, isAdmin: isAdminUser(user, env)});
    } catch {
      return sendJson(res, 401, {ok: false, code: 'AUTH_REQUIRED', message: '로그인 세션을 확인해주세요.'});
    }
  };
}

const handler = createAdminSessionHandler();
export default handler;
export const adminSessionInternals = {createAdminSessionHandler};
