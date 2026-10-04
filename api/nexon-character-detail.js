import {
  authenticateRequest,
  createAdminClient,
  loadUserNexonCredential
} from './_nexon-credential-store.js';

const NEXON_BASE_URL = 'https://open.api.nexon.com';
const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 500;
const detailCache = new Map();

const HEXA_SKILL_RESOURCE = Object.freeze({
  path: '/maplestory/v1/character/skill',
  query: Object.freeze({character_skill_grade: '6'})
});

const DETAIL_RESOURCES = Object.freeze({
  equipment: Object.freeze({
    path: '/maplestory/v1/character/item-equipment',
    ttl: DETAIL_CACHE_TTL_MS,
    sanitize: sanitizeEquipmentPayload
  }),
  symbol: Object.freeze({
    path: '/maplestory/v1/character/symbol-equipment',
    ttl: DETAIL_CACHE_TTL_MS,
    sanitize: sanitizeSymbolPayload
  }),
  hexa: Object.freeze({
    path: '/maplestory/v1/character/hexamatrix',
    ttl: DETAIL_CACHE_TTL_MS,
    sanitize: sanitizeHexaPayload
  }),
  'hexa-stat': Object.freeze({
    path: '/maplestory/v1/character/hexamatrix-stat',
    ttl: DETAIL_CACHE_TTL_MS,
    sanitize: sanitizeHexaStatPayload
  })
});

const OPTION_KEYS = Object.freeze([
  'str', 'dex', 'int', 'luk', 'max_hp', 'max_mp', 'max_hp_rate', 'max_mp_rate',
  'attack_power', 'magic_power', 'armor', 'speed', 'jump', 'boss_damage',
  'ignore_monster_armor', 'all_stat', 'damage', 'equipment_level_decrease',
  'base_equipment_level'
]);

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function validOcid(value) {
  return /^[A-Za-z0-9_-]{16,80}$/.test(value);
}

function safeText(value, maxLength = 300) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeImageUrl(value) {
  const text = safeText(value, 500);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function safeInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function safeDecimal(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeOptionValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return safeText(value, 80) || null;
  return null;
}

function sanitizeOptionObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of OPTION_KEYS) {
    const option = safeOptionValue(value[key]);
    if (option !== null) result[key] = option;
  }
  return result;
}

function sanitizeTitle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = {
    name: safeText(value.title_name, 120),
    icon: safeImageUrl(value.title_icon),
    description: safeText(value.title_description, 500),
    expiresAt: safeText(value.date_expire, 40),
    optionExpiresAt: safeText(value.date_option_expire, 40)
  };
  return Object.values(title).some(Boolean) ? title : null;
}

function compactOptions(...values) {
  return values.map(value => safeText(value, 180)).filter(Boolean);
}

function sanitizeEquipmentItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = {
    part: safeText(value.item_equipment_part, 80),
    slot: safeText(value.item_equipment_slot, 80),
    name: safeText(value.item_name, 160),
    icon: safeImageUrl(value.item_icon),
    description: safeText(value.item_description, 500),
    shapeName: safeText(value.item_shape_name, 160),
    shapeIcon: safeImageUrl(value.item_shape_icon),
    gender: safeText(value.item_gender, 40),
    starforce: safeInteger(value.starforce),
    scrollUpgrade: safeInteger(value.scroll_upgrade),
    exceptionalUpgrade: safeInteger(value.exceptional_upgrade),
    specialRingLevel: safeInteger(value.special_ring_level),
    equipmentLevelIncrease: safeInteger(value.equipment_level_increase),
    growthLevel: safeInteger(value.growth_level),
    growthExp: safeDecimal(value.growth_exp),
    cuttableCount: safeInteger(value.cuttable_count),
    expiresAt: safeText(value.date_expire, 40),
    potential: {
      grade: safeText(value.potential_option_grade, 40),
      options: compactOptions(value.potential_option_1, value.potential_option_2, value.potential_option_3)
    },
    additionalPotential: {
      grade: safeText(value.additional_potential_option_grade, 40),
      options: compactOptions(value.additional_potential_option_1, value.additional_potential_option_2, value.additional_potential_option_3)
    },
    soul: {
      name: safeText(value.soul_name, 120),
      option: safeText(value.soul_option, 180)
    },
    options: {
      base: sanitizeOptionObject(value.item_base_option),
      add: sanitizeOptionObject(value.item_add_option),
      scroll: sanitizeOptionObject(value.item_etc_option),
      starforce: sanitizeOptionObject(value.item_starforce_option),
      exceptional: sanitizeOptionObject(value.item_exceptional_option),
      total: sanitizeOptionObject(value.item_total_option)
    }
  };
  return item.name || item.part || item.slot ? item : null;
}

function sanitizeEquipmentList(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw Object.assign(new Error('NEXON 장비 응답 구조가 올바르지 않습니다.'), {status: 502, code: 'INVALID_EQUIPMENT_RESPONSE'});
  return value.map(sanitizeEquipmentItem).filter(Boolean);
}

function sanitizeEquipmentPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'item_equipment')) {
    throw Object.assign(new Error('NEXON 장비 응답 구조가 올바르지 않습니다.'), {status: 502, code: 'INVALID_EQUIPMENT_RESPONSE'});
  }
  return {
    date: safeText(payload.date, 40),
    characterGender: safeText(payload.character_gender, 40),
    characterClass: safeText(payload.character_class, 80),
    presetNo: safeInteger(payload.preset_no),
    equipment: sanitizeEquipmentList(payload.item_equipment),
    presets: {
      1: sanitizeEquipmentList(payload.item_equipment_preset_1),
      2: sanitizeEquipmentList(payload.item_equipment_preset_2),
      3: sanitizeEquipmentList(payload.item_equipment_preset_3)
    },
    dragonEquipment: sanitizeEquipmentList(payload.dragon_equipment),
    mechanicEquipment: sanitizeEquipmentList(payload.mechanic_equipment),
    title: sanitizeTitle(payload.title),
    presetTitles: {
      1: sanitizeTitle(payload.item_equipment_preset_1_title),
      2: sanitizeTitle(payload.item_equipment_preset_2_title),
      3: sanitizeTitle(payload.item_equipment_preset_3_title)
    }
  };
}

function invalidDetailResponse(code, label) {
  return Object.assign(new Error(`NEXON ${label} 응답 구조가 올바르지 않습니다.`), {status: 502, code});
}

function requireArray(value, code, label) {
  if (!Array.isArray(value)) throw invalidDetailResponse(code, label);
  return value;
}

function sanitizeSymbolItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidDetailResponse('INVALID_SYMBOL_RESPONSE', '심볼');
  const item = {
    name: safeText(value.symbol_name, 160),
    icon: safeImageUrl(value.symbol_icon),
    description: safeText(value.symbol_description, 500),
    otherEffect: safeText(value.symbol_other_effect_description, 500),
    force: safeOptionValue(value.symbol_force),
    level: safeInteger(value.symbol_level),
    stats: {
      str: safeOptionValue(value.symbol_str),
      dex: safeOptionValue(value.symbol_dex),
      int: safeOptionValue(value.symbol_int),
      luk: safeOptionValue(value.symbol_luk),
      hp: safeOptionValue(value.symbol_hp),
      dropRate: safeOptionValue(value.symbol_drop_rate),
      mesoRate: safeOptionValue(value.symbol_meso_rate),
      expRate: safeOptionValue(value.symbol_exp_rate)
    },
    growth: safeInteger(value.symbol_growth_count),
    requiredGrowth: safeInteger(value.symbol_require_growth_count)
  };
  item.stats = Object.fromEntries(Object.entries(item.stats).filter(([, stat]) => stat !== null));
  if (!item.name) throw invalidDetailResponse('INVALID_SYMBOL_RESPONSE', '심볼');
  return item;
}

function sanitizeSymbolPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'symbol')) {
    throw invalidDetailResponse('INVALID_SYMBOL_RESPONSE', '심볼');
  }
  return {
    date: safeText(payload.date, 40),
    characterClass: safeText(payload.character_class, 80),
    symbols: requireArray(payload.symbol, 'INVALID_SYMBOL_RESPONSE', '심볼').map(sanitizeSymbolItem).filter(Boolean)
  };
}

function sanitizeHexaCore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidDetailResponse('INVALID_HEXA_RESPONSE', 'HEXA 코어');
  if (!Array.isArray(value.linked_skill)) throw invalidDetailResponse('INVALID_HEXA_RESPONSE', 'HEXA 코어');
  const core = {
    name: safeText(value.hexa_core_name, 160),
    level: safeInteger(value.hexa_core_level),
    eventLevel: safeInteger(value.hexa_core_event_level),
    type: safeText(value.hexa_core_type, 80),
    linkedSkills: value.linked_skill.map(skill => {
      if (!skill || typeof skill !== 'object' || Array.isArray(skill)) throw invalidDetailResponse('INVALID_HEXA_RESPONSE', 'HEXA 코어');
      return safeText(skill.hexa_skill_id, 160);
    }).filter(Boolean)
  };
  if (!core.name) throw invalidDetailResponse('INVALID_HEXA_RESPONSE', 'HEXA 코어');
  return core;
}

function sanitizeHexaPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'character_hexa_core_equipment')) {
    throw invalidDetailResponse('INVALID_HEXA_RESPONSE', 'HEXA 코어');
  }
  return {
    date: safeText(payload.date, 40),
    cores: requireArray(payload.character_hexa_core_equipment, 'INVALID_HEXA_RESPONSE', 'HEXA 코어').map(sanitizeHexaCore).filter(Boolean)
  };
}

function sanitizeHexaSkill(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidDetailResponse('INVALID_HEXA_SKILL_RESPONSE', '6차 스킬');
  const skill = {
    name: safeText(value.skill_name, 160),
    icon: safeImageUrl(value.skill_icon),
    description: safeText(value.skill_description, 1200)
  };
  if (!skill.name) throw invalidDetailResponse('INVALID_HEXA_SKILL_RESPONSE', '6차 스킬');
  return skill;
}

function sanitizeHexaSkillPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'character_skill')) {
    throw invalidDetailResponse('INVALID_HEXA_SKILL_RESPONSE', '6차 스킬');
  }
  return requireArray(payload.character_skill, 'INVALID_HEXA_SKILL_RESPONSE', '6차 스킬').map(sanitizeHexaSkill);
}

function enrichHexaWithSkills(data, skills) {
  const exactSkills = new Map((Array.isArray(skills) ? skills : []).map(skill => [skill.name, skill]));
  return {
    ...data,
    cores: (data?.cores || []).map(core => {
      const exactNames = [...new Set([core.name, ...(core.linkedSkills || [])].filter(Boolean))];
      const skillMetadata = exactNames.map(name => exactSkills.get(name)).filter(Boolean);
      return {...core, skillMetadata};
    })
  };
}

function sanitizeHexaStatCore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidDetailResponse('INVALID_HEXA_STAT_RESPONSE', 'HEXA 스탯');
  const core = {
    slotId: safeText(value.slot_id, 80),
    mainStatName: safeText(value.main_stat_name, 120),
    subStatName1: safeText(value.sub_stat_name_1, 120),
    subStatName2: safeText(value.sub_stat_name_2, 120),
    mainStatLevel: safeInteger(value.main_stat_level),
    subStatLevel1: safeInteger(value.sub_stat_level_1),
    subStatLevel2: safeInteger(value.sub_stat_level_2),
    grade: safeInteger(value.stat_grade)
  };
  if (!core.slotId && !core.mainStatName && !core.subStatName1 && !core.subStatName2) throw invalidDetailResponse('INVALID_HEXA_STAT_RESPONSE', 'HEXA 스탯');
  return core;
}

function sanitizeHexaStatList(payload, key) {
  return requireArray(payload[key], 'INVALID_HEXA_STAT_RESPONSE', 'HEXA 스탯').map(sanitizeHexaStatCore).filter(Boolean);
}

function sanitizeHexaStatPayload(payload) {
  const keys = [
    'character_hexa_stat_core', 'character_hexa_stat_core_2', 'character_hexa_stat_core_3',
    'preset_hexa_stat_core', 'preset_hexa_stat_core_2', 'preset_hexa_stat_core_3'
  ];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || keys.some(key => !Object.hasOwn(payload, key))) {
    throw invalidDetailResponse('INVALID_HEXA_STAT_RESPONSE', 'HEXA 스탯');
  }
  return {
    date: safeText(payload.date, 40),
    characterClass: safeText(payload.character_class, 80),
    current: {
      1: sanitizeHexaStatList(payload, 'character_hexa_stat_core'),
      2: sanitizeHexaStatList(payload, 'character_hexa_stat_core_2'),
      3: sanitizeHexaStatList(payload, 'character_hexa_stat_core_3')
    },
    presets: {
      1: sanitizeHexaStatList(payload, 'preset_hexa_stat_core'),
      2: sanitizeHexaStatList(payload, 'preset_hexa_stat_core_2'),
      3: sanitizeHexaStatList(payload, 'preset_hexa_stat_core_3')
    }
  };
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

function upstreamErrorDetails(payload, status) {
  const rawCode = payload?.error?.name;
  const code = typeof rawCode === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(rawCode)
    ? rawCode
    : status === 429 ? 'RATE_LIMITED' : status === 403 ? 'FORBIDDEN' : 'UPSTREAM_ERROR';
  const categories = {
    OPENAPI00003: 'invalid_identifier',
    OPENAPI00004: 'invalid_parameter',
    OPENAPI00005: 'invalid_api_key',
    OPENAPI00009: 'data_preparing',
    OPENAPI00010: 'game_maintenance',
    OPENAPI00011: 'upstream_unavailable'
  };
  return {
    code,
    category: categories[code] || (status === 403 ? 'forbidden' : status === 429 ? 'rate_limited' : status >= 500 ? 'upstream_unavailable' : 'unknown_upstream_error'),
    upstreamMessage: sanitizeUpstreamText(payload?.error?.message)
  };
}

async function requestNexonDetail(config, ocid, apiKey) {
  const target = new URL(config.path, NEXON_BASE_URL);
  target.searchParams.set('ocid', ocid);
  for (const [key, value] of Object.entries(config.query || {})) {
    if (value !== null && value !== undefined && String(value) !== '') target.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(target, {
      headers: {'x-nxopen-api-key': apiKey, accept: 'application/json'},
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const status = [400, 403, 429, 500, 502, 503].includes(response.status) ? response.status : 502;
      const details = upstreamErrorDetails(payload, status);
      console.error('NEXON character detail request failed', {
        endpoint: config.path.replace(/^\/maplestory\/v1\//, ''), status, code: details.code, category: details.category
      });
      throw Object.assign(new Error('NEXON 캐릭터 상세 정보를 불러오지 못했습니다.'), {status, ...details, source: 'nexon_upstream'});
    }
    return payload;
  } catch (error) {
    if (error?.status) throw error;
    const status = error?.name === 'AbortError' ? 503 : 502;
    throw Object.assign(new Error('NEXON 캐릭터 상세 정보를 불러오지 못했습니다.'), {
      status, code: status === 503 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', category: 'upstream_unavailable', source: 'proxy_runtime'
    });
  } finally {
    clearTimeout(timeout);
  }
}

function detailCacheKey(userId, credentialRevision, ocid, resource) {
  return JSON.stringify([String(userId), String(credentialRevision), String(ocid), String(resource)]);
}

function pruneDetailCache(now = Date.now()) {
  for (const [key, value] of detailCache) {
    if (!value || now - value.cachedAt >= (value.ttl || DETAIL_CACHE_TTL_MS)) detailCache.delete(key);
  }
  while (detailCache.size > DETAIL_CACHE_MAX_ENTRIES) detailCache.delete(detailCache.keys().next().value);
}

function createNexonCharacterDetailHandler(dependencies = {}) {
  const getAdminClient = dependencies.createAdminClient || createAdminClient;
  const authenticate = dependencies.authenticateRequest || authenticateRequest;
  const loadCredential = dependencies.loadUserNexonCredential || loadUserNexonCredential;
  const requestDetail = dependencies.requestNexonDetail || requestNexonDetail;
  const now = dependencies.now || Date.now;

  return async function handler(req, res) {
    if (req.method !== 'GET') return send(res, 405, {ok: false, code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 사용할 수 있습니다.'});
    try {
      const resource = safeText(req.query.resource, 40);
      const config = DETAIL_RESOURCES[resource];
      if (!config) return send(res, 400, {ok: false, code: 'INVALID_RESOURCE', category: 'invalid_request', source: 'proxy_validation', message: '지원하지 않는 상세 정보입니다.'});
      const ocid = String(req.query.ocid || '').trim();
      if (!validOcid(ocid)) return send(res, 400, {ok: false, code: 'BAD_REQUEST', category: 'invalid_request', source: 'proxy_validation', message: '캐릭터 식별자를 확인해주세요.'});

      const adminClient = getAdminClient();
      const user = await authenticate(req, adminClient);
      const {apiKey, credentialRevision} = await loadCredential(adminClient, user.id);
      const timestamp = Number(now());
      pruneDetailCache(timestamp);
      const cacheKey = detailCacheKey(user.id, credentialRevision, ocid, resource);
      const cached = detailCache.get(cacheKey);
      if (cached && timestamp - cached.cachedAt < config.ttl) {
        detailCache.delete(cacheKey);
        detailCache.set(cacheKey, cached);
        return send(res, 200, {...cached.body, cached: true});
      }

      const payload = await requestDetail(config, ocid, apiKey);
      let data = config.sanitize(payload);
      if (resource === 'hexa') {
        try {
          const skillPayload = await requestDetail(HEXA_SKILL_RESOURCE, ocid, apiKey);
          data = enrichHexaWithSkills(data, sanitizeHexaSkillPayload(skillPayload));
        } catch (error) {
          data = enrichHexaWithSkills(data, []);
          console.warn('NEXON HEXA skill metadata unavailable', {
            endpoint: 'character/skill', status: Number(error?.status) || 502, code: safeText(error?.code, 80) || 'INVALID_HEXA_SKILL_RESPONSE'
          });
        }
      }
      const body = {ok: true, resource, ocid, fetchedAt: new Date(timestamp).toISOString(), cached: false, data};
      detailCache.set(cacheKey, {cachedAt: timestamp, ttl: config.ttl, body});
      pruneDetailCache(timestamp);
      return send(res, 200, body);
    } catch (error) {
      const status = [400, 401, 403, 409, 429, 500, 502, 503].includes(Number(error?.status)) ? Number(error.status) : 502;
      const message = error?.code === 'AUTH_REQUIRED'
        ? '캐릭터 상세 정보는 로그인 후 사용할 수 있습니다.'
        : error?.code === 'NEXON_CREDENTIAL_REQUIRED'
          ? '캐릭터 상세 정보를 보려면 NEXON 개인 API Key를 등록해주세요.'
          : sanitizeUpstreamText(error?.message) || 'NEXON 캐릭터 상세 정보를 불러오지 못했습니다.';
      return send(res, status, {
        ok: false,
        code: error?.code || (status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR'),
        category: error?.category || (status === 401 ? 'auth_required' : status === 409 ? 'credential_required' : 'upstream_unavailable'),
        source: error?.source || (status === 401 ? 'proxy_auth' : status === 409 ? 'credential_store' : 'proxy_runtime'),
        message,
        ...(error?.upstreamMessage ? {upstreamMessage: sanitizeUpstreamText(error.upstreamMessage)} : {})
      });
    }
  };
}

const handler = createNexonCharacterDetailHandler();
export default handler;

export const nexonCharacterDetailInternals = {
  DETAIL_CACHE_MAX_ENTRIES,
  DETAIL_CACHE_TTL_MS,
  DETAIL_RESOURCES,
  HEXA_SKILL_RESOURCE,
  OPTION_KEYS,
  createNexonCharacterDetailHandler,
  detailCache,
  detailCacheKey,
  enrichHexaWithSkills,
  pruneDetailCache,
  requestNexonDetail,
  safeDecimal,
  safeImageUrl,
  safeInteger,
  safeText,
  sanitizeEquipmentItem,
  sanitizeEquipmentPayload,
  sanitizeHexaCore,
  sanitizeHexaPayload,
  sanitizeHexaSkill,
  sanitizeHexaSkillPayload,
  sanitizeHexaStatCore,
  sanitizeHexaStatPayload,
  sanitizeOptionObject,
  sanitizeSymbolItem,
  sanitizeSymbolPayload,
  sanitizeTitle,
  sanitizeUpstreamText,
  upstreamErrorDetails,
  validOcid
};
