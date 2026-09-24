const NEXON_BASE_URL = 'https://open.api.nexon.com';
const PROFILE_CACHE_TTL_MS = 30 * 60_000;
const STAT_CACHE_TTL_MS = 15 * 60_000;
const UNION_CACHE_TTL_MS = 60 * 60_000;
const resourceCaches = {basic: new Map(), stat: new Map(), union: new Map()};
const statDefinitions = Object.freeze({
  bossDamage: {name: '보스 몬스터 데미지', type: 'percent'},
  ignoreDefense: {name: '방어율 무시', type: 'percent'},
  criticalRate: {name: '크리티컬 확률', type: 'percent'},
  criticalDamage: {name: '크리티컬 데미지', type: 'percent'},
  damage: {name: '데미지', type: 'percent'},
  finalDamage: {name: '최종 데미지', type: 'percent'},
  str: {name: 'STR', type: 'integer'},
  dex: {name: 'DEX', type: 'integer'},
  int: {name: 'INT', type: 'integer'},
  luk: {name: 'LUK', type: 'integer'},
  hp: {name: 'HP', type: 'integer'},
  attackPower: {name: '공격력', type: 'integer'},
  magicPower: {name: '마력', type: 'integer'},
  starForce: {name: '스타포스', type: 'integer'},
  arcaneForce: {name: '아케인포스', type: 'integer'},
  authenticForce: {name: '어센틱포스', type: 'integer'},
  itemDropRate: {name: '아이템 드롭률', type: 'percent'},
  mesoAcquisitionRate: {name: '메소 획득량', type: 'percent'}
});

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
    message: statusMessages[status] || 'NEXON 캐릭터 정보를 확인하지 못했습니다.'
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

function safeInteger(value) {
  if (value === null || value === undefined || value === '' || !['string', 'number'].includes(typeof value)) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) && Number.isInteger(number) && number >= 0 ? number : null;
}

function safeDecimal(value) {
  if (value === null || value === undefined || value === '' || !['string', 'number'].includes(typeof value)) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sanitizeBasic(payload) {
  if (!payload || typeof payload !== 'object') throw Object.assign(new Error('NEXON 캐릭터 기본정보 응답 구조가 변경되었습니다.'), {status: 502});
  return {
    date: typeof payload.date === 'string' ? payload.date : '',
    name: typeof payload.character_name === 'string' ? payload.character_name : '',
    world: typeof payload.world_name === 'string' ? payload.world_name : '',
    className: typeof payload.character_class === 'string' ? payload.character_class : '',
    level: safeInteger(payload.character_level),
    image: safeImageUrl(payload.character_image)
  };
}

function sanitizeStat(payload) {
  if (!payload || typeof payload !== 'object') throw Object.assign(new Error('NEXON 캐릭터 능력치 응답 구조가 변경되었습니다.'), {status: 502});
  const entries = new Map((Array.isArray(payload.final_stat) ? payload.final_stat : [])
    .filter(item => item && typeof item.stat_name === 'string')
    .map(item => [item.stat_name, item.stat_value]));
  const stats = Object.fromEntries(Object.entries(statDefinitions).map(([key, definition]) => {
    const value = entries.get(definition.name);
    return [key, definition.type === 'percent' ? safeDecimal(value) : safeInteger(value)];
  }));
  return {combatPower: safeInteger(entries.get('전투력')), stats};
}

function sanitizeUnion(payload) {
  if (!payload || typeof payload !== 'object') throw Object.assign(new Error('NEXON 유니온 응답 구조가 변경되었습니다.'), {status: 502});
  return {
    unionLevel: safeInteger(payload.union_level),
    unionGrade: typeof payload.union_grade === 'string' ? payload.union_grade : ''
  };
}

function sanitizeProfile(payload) {
  const basic = sanitizeBasic(payload);
  return {ok: true, fetchedAt: new Date().toISOString(), date: basic.date, character: {
    name: basic.name, world: basic.world, className: basic.className, level: basic.level, image: basic.image
  }};
}

async function requestNexon(path, ocid, apiKey) {
  const target = new URL(path, NEXON_BASE_URL);
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
    const fallback = publicError(status);
    throw Object.assign(new Error(fallback.message), {status, code: upstreamErrorCode(payload) || fallback.code});
  }
  try {
    return await response.json();
  } catch {
    throw Object.assign(new Error('NEXON API 응답 형식이 올바르지 않습니다.'), {status: 502});
  }
}

async function loadResource(resource, path, ttl, sanitizer, ocid, apiKey) {
  const cache = resourceCaches[resource];
  const cached = cache.get(ocid);
  if (cached && Date.now() - cached.savedAt < ttl) return {...cached, cached: true};
  const payload = await requestNexon(path, ocid, apiKey);
  // Validate before caching so a transient malformed upstream response does not
  // remain successful for the full resource TTL.
  const value = {savedAt: Date.now(), data: sanitizer(payload)};
  cache.set(ocid, value);
  return {...value, cached: false};
}

function resourceWarning(resource, reason) {
  const status = Number(reason?.status) || 502;
  const fallback = publicError(status);
  return {
    resource,
    status,
    code: typeof reason?.code === 'string' ? reason.code : fallback.code,
    message: reason?.message || fallback.message
  };
}

function clearCaches() {
  for (const cache of Object.values(resourceCaches)) cache.clear();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
  const apiKey = process.env.NEXON_OPEN_API_KEY;
  if (!apiKey) return send(res, 503, {ok: false, code: 'NOT_CONFIGURED', message: 'NEXON Open API 환경변수가 설정되지 않았습니다.'});
  const ocid = String(req.query.ocid || '').trim();
  if (!validOcid(ocid)) return send(res, 400, {ok: false, ...publicError(400)});

  const requests = [
    ['basic', '/maplestory/v1/character/basic', PROFILE_CACHE_TTL_MS, sanitizeBasic],
    ['stat', '/maplestory/v1/character/stat', STAT_CACHE_TTL_MS, sanitizeStat],
    ['union', '/maplestory/v1/user/union', UNION_CACHE_TTL_MS, sanitizeUnion]
  ];
  const settled = await Promise.allSettled(requests.map(([resource, path, ttl, sanitizer]) => loadResource(resource, path, ttl, sanitizer, ocid, apiKey)));
  const resources = {}, warnings = [], parts = {};
  settled.forEach((result, index) => {
    const [resource] = requests[index];
    if (result.status === 'fulfilled') {
      parts[resource] = result.value.data;
      resources[resource] = {ok: true, cached: result.value.cached};
    } else {
      resources[resource] = {ok: false};
      warnings.push(resourceWarning(resource, result.reason));
    }
  });

  if (!Object.values(resources).some(resource => resource.ok)) {
    const first = warnings[0] || resourceWarning('basic', null);
    console.error('NEXON character requests failed', {warnings});
    return send(res, first.status, {ok: false, code: first.code, message: first.message, warnings});
  }

  const basic = parts.basic || {}, stat = parts.stat || {}, union = parts.union || {};
  return send(res, 200, {
    ok: true,
    fetchedAt: new Date().toISOString(),
    date: basic.date || '',
    character: {
      name: basic.name || '',
      world: basic.world || '',
      className: basic.className || '',
      level: basic.level ?? null,
      image: basic.image || '',
      combatPower: stat.combatPower ?? null,
      stats: stat.stats ?? null,
      unionLevel: union.unionLevel ?? null,
      unionGrade: union.unionGrade || ''
    },
    resources,
    warnings
  });
}

export const nexonCharacterInternals = {
  PROFILE_CACHE_TTL_MS, STAT_CACHE_TTL_MS, UNION_CACHE_TTL_MS,
  clearCaches, publicError, resourceWarning, safeDecimal, safeImageUrl, safeInteger, statDefinitions,
  sanitizeBasic, sanitizeProfile, sanitizeStat, sanitizeUnion, upstreamErrorCode, validOcid
};
