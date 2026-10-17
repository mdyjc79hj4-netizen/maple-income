import {authenticateRequest, bearerToken, createAdminClient} from './_nexon-credential-store.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredAdminUserId(env = process.env) {
  const value = String(env.ADMIN_USER_ID || '').trim();
  return UUID_PATTERN.test(value) ? value.toLowerCase() : '';
}

function isAdminUser(user, env = process.env) {
  const adminId = configuredAdminUserId(env);
  return !!adminId && String(user?.id || '').toLowerCase() === adminId;
}

async function optionalAuthenticatedUser(req, adminClient, authenticate = authenticateRequest) {
  if (!bearerToken(req)) return null;
  try { return await authenticate(req, adminClient); } catch { return null; }
}

async function requireAdmin(req, dependencies = {}) {
  const env = dependencies.env || process.env;
  const adminId = configuredAdminUserId(env);
  if (!adminId) {
    throw Object.assign(new Error('관리자 환경 설정을 확인해주세요.'), {status: 503, code: 'ADMIN_NOT_CONFIGURED'});
  }
  const adminClient = dependencies.adminClient || (dependencies.createAdminClient || createAdminClient)(env);
  const user = await (dependencies.authenticateRequest || authenticateRequest)(req, adminClient);
  if (!isAdminUser(user, env)) {
    throw Object.assign(new Error('관리자 권한이 필요합니다.'), {status: 403, code: 'ADMIN_REQUIRED'});
  }
  return {user, adminClient};
}

export {configuredAdminUserId, isAdminUser, optionalAuthenticatedUser, requireAdmin, UUID_PATTERN};

export const adminAuthInternals = {configuredAdminUserId, isAdminUser, optionalAuthenticatedUser, UUID_PATTERN};
