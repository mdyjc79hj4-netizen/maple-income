import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const TABLE = 'nexon_api_credentials';
const KEY_VERSION = 1;
const IV_BYTES = 12;

function serverConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {url, secret};
}

function encryptionKey(value = process.env.NEXON_CREDENTIAL_ENCRYPTION_KEY) {
  const input = String(value || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(input)) key = Buffer.from(input, 'hex');
  else if (input.startsWith('base64:')) key = Buffer.from(input.slice(7), 'base64');
  else {
    const decoded = Buffer.from(input, 'base64');
    key = decoded.length === 32 ? decoded : Buffer.from(input, 'utf8');
  }
  if (key.length !== 32) {
    throw Object.assign(new Error('NEXON credential 암호화 키 설정을 확인해주세요.'), {
      status: 503,
      code: 'CREDENTIAL_ENCRYPTION_NOT_CONFIGURED'
    });
  }
  return key;
}

function encryptCredential(plaintext, userId, key = encryptionKey()) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(userId), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
    key_version: KEY_VERSION
  };
}

function decryptCredential(record, userId, key = encryptionKey()) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAAD(Buffer.from(String(userId), 'utf8'));
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function createAdminClient(env = process.env) {
  const {url, secret} = serverConfig(env);
  if (!url || !secret) {
    throw Object.assign(new Error('서버의 Supabase secret 설정을 확인해주세요.'), {
      status: 503,
      code: 'SUPABASE_SERVER_NOT_CONFIGURED'
    });
  }
  return createClient(url, secret, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}
  });
}

function bearerToken(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1] || '';
}

async function authenticateRequest(req, adminClient) {
  const token = bearerToken(req);
  if (!token) {
    throw Object.assign(new Error('NEXON 개인 API Key 등록은 로그인 후 사용할 수 있습니다.'), {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  const {data, error} = await adminClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw Object.assign(new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.'), {
      status: 401,
      code: 'AUTH_REQUIRED'
    });
  }
  return data.user;
}

function credentialStatus(record) {
  if (!record) return {ok: true, hasCredential: false};
  return {
    ok: true,
    hasCredential: true,
    verifiedAt: record.verified_at || null,
    accountCount: Number.isInteger(record.account_count) ? record.account_count : Number(record.account_count) || 0,
    characterCount: Number.isInteger(record.character_count) ? record.character_count : Number(record.character_count) || 0
  };
}

async function loadCredentialStatus(adminClient, userId) {
  const {data, error} = await adminClient.from(TABLE)
    .select('verified_at,account_count,character_count')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw Object.assign(new Error('NEXON API Key 등록 상태를 확인하지 못했습니다.'), {status: 500, code: 'CREDENTIAL_READ_FAILED'});
  return credentialStatus(data);
}

async function loadUserNexonCredential(adminClient, userId, key) {
  const {data, error} = await adminClient.from(TABLE)
    .select('ciphertext,iv,auth_tag,key_version,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw Object.assign(new Error('NEXON 개인 API Key를 불러오지 못했습니다.'), {
      status: 500,
      code: 'CREDENTIAL_READ_FAILED',
      category: 'credential_store',
      source: 'credential_store'
    });
  }
  if (!data) {
    throw Object.assign(new Error('주간 자동 확인을 사용하려면 NEXON 개인 API Key를 등록해주세요.'), {
      status: 409,
      code: 'NEXON_CREDENTIAL_REQUIRED',
      category: 'credential_required',
      source: 'credential_store'
    });
  }
  try {
    const apiKey = decryptCredential(data, userId, key || encryptionKey()).trim();
    if (!apiKey) throw new Error('empty credential');
    return {
      apiKey,
      credentialRevision: typeof data.updated_at === 'string' && data.updated_at
        ? data.updated_at
        : `key-version-${Number(data.key_version) || KEY_VERSION}`
    };
  } catch {
    throw Object.assign(new Error('저장된 NEXON 개인 API Key를 확인하지 못했습니다.'), {
      status: 500,
      code: 'CREDENTIAL_DECRYPT_FAILED',
      category: 'credential_store',
      source: 'credential_store'
    });
  }
}

async function storeCredential(adminClient, userId, encrypted, verification) {
  const row = {
    user_id: userId,
    ...encrypted,
    verified_at: verification.verifiedAt,
    account_count: verification.accountCount,
    character_count: verification.characterCount,
    updated_at: new Date().toISOString()
  };
  const {data, error} = await adminClient.from(TABLE)
    .upsert(row, {onConflict: 'user_id'})
    .select('verified_at,account_count,character_count')
    .single();
  if (error) throw Object.assign(new Error('NEXON API Key를 안전하게 저장하지 못했습니다.'), {status: 500, code: 'CREDENTIAL_WRITE_FAILED'});
  return credentialStatus(data || row);
}

async function deleteCredential(adminClient, userId) {
  const {error} = await adminClient.from(TABLE).delete().eq('user_id', userId);
  if (error) throw Object.assign(new Error('NEXON API Key 연결을 해제하지 못했습니다.'), {status: 500, code: 'CREDENTIAL_DELETE_FAILED'});
  return {ok: true, hasCredential: false};
}

export {
  TABLE,
  authenticateRequest,
  bearerToken,
  createAdminClient,
  credentialStatus,
  decryptCredential,
  deleteCredential,
  encryptCredential,
  encryptionKey,
  loadCredentialStatus,
  loadUserNexonCredential,
  serverConfig,
  storeCredential
};

export const nexonCredentialStoreInternals = {
  IV_BYTES,
  KEY_VERSION,
  authenticateRequest,
  bearerToken,
  credentialStatus,
  decryptCredential,
  encryptCredential,
  encryptionKey,
  loadUserNexonCredential,
  serverConfig
};
