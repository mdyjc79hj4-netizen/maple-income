import {createClient} from '@supabase/supabase-js';

const META_KEY = 'maple-income-vercel-v1-sync';
const BASE_KEY_PREFIX = META_KEY + ':base:';
const RECOVERY_KEY_PREFIX = META_KEY + ':recovery:';
const TABLE = 'maple_income_sync';
const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const MAX_CONFLICT_LOG = 50;

const copy = value => value == null ? value : structuredClone(value);
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safeJson = (value, fallback = {}) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const normalizeMeta = value => asObject(typeof value === 'string' ? safeJson(value, {}) : value);
const timestamp = value => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};
const isoMax = (...values) => new Date(Math.max(0, ...values.map(timestamp))).toISOString();
const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

async function contentHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function emptySync() {
  return {
    schema: 1,
    revisions: {root: '', settings: '', incomes: {}, characters: {}, bosses: {}, activities: {}, presets: {}, weeklyHistory: {}},
    tombstones: {incomes: {}, characters: {}, bosses: {}, activities: {}, presets: {}, weeklyHistory: {}},
    conflicts: []
  };
}

function normalizeSync(value) {
  const result = emptySync();
  const source = asObject(value);
  const revisions = asObject(source.revisions);
  const tombstones = asObject(source.tombstones);
  result.revisions.root = typeof revisions.root === 'string' ? revisions.root : '';
  result.revisions.settings = typeof revisions.settings === 'string' ? revisions.settings : '';
  for (const key of ['incomes', 'characters', 'bosses', 'activities', 'presets', 'weeklyHistory']) {
    result.revisions[key] = {...asObject(revisions[key])};
    result.tombstones[key] = {...asObject(tombstones[key])};
  }
  result.conflicts = Array.isArray(source.conflicts) ? source.conflicts.slice(-MAX_CONFLICT_LOG) : [];
  return result;
}

function meaningfulLocalData(state) {
  if (!state) return false;
  if (state.incomes?.length || Object.keys(state.weeklyHistory || {}).length || state.presets?.length) return true;
  if (Object.keys(state.settings || {}).length || state.characters?.length !== 1) return true;
  const character = state.characters?.[0];
  return !!character && !!(character.name !== '본캐' || character.bosses?.some(boss => boss.done) || character.weeklyActivities?.some(activity => activity.done));
}

function chooseSyncAction({remoteExists, sameContent, knownDevice, initial, hasLocalData}) {
  if (!remoteExists) return 'upload';
  if (sameContent) return 'noop';
  if (!knownDevice && initial && hasLocalData) return 'choose';
  return 'merge';
}

const mapBy = (items, key = 'id') => new Map((Array.isArray(items) ? items : []).filter(item => item?.[key]).map(item => [String(item[key]), item]));
const historyMap = history => new Map(Object.entries(asObject(history)).map(([key, value]) => [String(value?.weekId || key), value]));
const rootData = state => {
  const value = {...asObject(state)};
  for (const key of ['incomes', 'characters', 'presets', 'weeklyHistory', 'settings', 'sync', 'updatedAt']) delete value[key];
  return value;
};
const characterData = character => {
  const value = {...asObject(character)};
  delete value.bosses;
  delete value.weeklyActivities;
  return value;
};
const bossKey = (characterId, bossId) => characterId + '::' + bossId;
const activityKey = (characterId, activityId) => characterId + '::' + activityId;
const revisionFor = (sync, group, id, fallback = '') => sync.revisions[group]?.[id] || fallback;
const tombstoneFor = (sync, group, id) => sync.tombstones[group]?.[id] || '';

function markCollectionChanges(currentMap, baseMap, sync, group, changedAt) {
  for (const [id, value] of currentMap) {
    if (!same(value, baseMap.get(id))) sync.revisions[group][id] = isoMax(sync.revisions[group][id], changedAt);
    if (timestamp(tombstoneFor(sync, group, id)) < timestamp(revisionFor(sync, group, id))) delete sync.tombstones[group][id];
  }
  for (const id of baseMap.keys()) {
    if (!currentMap.has(id)) sync.tombstones[group][id] = isoMax(sync.tombstones[group][id], changedAt);
  }
}

function prepareStateForMerge(input, baseInput = null, now = new Date().toISOString()) {
  const state = copy(asObject(input));
  const base = copy(asObject(baseInput));
  state.incomes = Array.isArray(state.incomes) ? state.incomes : [];
  state.characters = Array.isArray(state.characters) ? state.characters : [];
  state.presets = Array.isArray(state.presets) ? state.presets : [];
  state.weeklyHistory = asObject(state.weeklyHistory);
  state.settings = asObject(state.settings);
  const sync = normalizeSync(state.sync);
  const baseSync = normalizeSync(base.sync);
  const changedAt = timestamp(state.updatedAt) ? new Date(timestamp(state.updatedAt)).toISOString() : now;

  for (const group of Object.keys(sync.tombstones)) sync.tombstones[group] = {...baseSync.tombstones[group], ...sync.tombstones[group]};

  if (!same(rootData(state), rootData(base))) sync.revisions.root = isoMax(sync.revisions.root, changedAt);
  if (!same(state.settings, base.settings || {})) sync.revisions.settings = isoMax(sync.revisions.settings, changedAt);
  for (const group of ['incomes', 'presets']) markCollectionChanges(mapBy(state[group]), mapBy(base[group]), sync, group, changedAt);
  markCollectionChanges(historyMap(state.weeklyHistory), historyMap(base.weeklyHistory), sync, 'weeklyHistory', changedAt);

  const characters = mapBy(state.characters);
  const baseCharacters = mapBy(base.characters);
  markCollectionChanges(
    new Map([...characters].map(([id, value]) => [id, characterData(value)])),
    new Map([...baseCharacters].map(([id, value]) => [id, characterData(value)])),
    sync, 'characters', changedAt
  );
  for (const [characterId, character] of characters) {
    const bosses = mapBy(character.bosses, 'bossId');
    const baseBosses = mapBy(baseCharacters.get(characterId)?.bosses, 'bossId');
    for (const [id, value] of bosses) {
      const key = bossKey(characterId, id);
      if (!same(value, baseBosses.get(id))) sync.revisions.bosses[key] = isoMax(sync.revisions.bosses[key], changedAt);
      if (timestamp(sync.tombstones.bosses[key]) < timestamp(sync.revisions.bosses[key])) delete sync.tombstones.bosses[key];
    }
    for (const id of baseBosses.keys()) {
      if (!bosses.has(id)) {
        const key = bossKey(characterId, id);
        sync.tombstones.bosses[key] = isoMax(sync.tombstones.bosses[key], changedAt);
      }
    }
    const activities = mapBy(character.weeklyActivities);
    const baseActivities = mapBy(baseCharacters.get(characterId)?.weeklyActivities);
    for (const [id, value] of activities) {
      const key = activityKey(characterId, id);
      if (!same(value, baseActivities.get(id))) sync.revisions.activities[key] = isoMax(sync.revisions.activities[key], changedAt);
      if (timestamp(sync.tombstones.activities[key]) < timestamp(sync.revisions.activities[key])) delete sync.tombstones.activities[key];
    }
    for (const id of baseActivities.keys()) {
      if (!activities.has(id)) {
        const key = activityKey(characterId, id);
        sync.tombstones.activities[key] = isoMax(sync.tombstones.activities[key], changedAt);
      }
    }
  }
  for (const [characterId, character] of baseCharacters) {
    if (characters.has(characterId)) continue;
    for (const boss of Array.isArray(character.bosses) ? character.bosses : []) {
      if (boss?.bossId) {
        const key = bossKey(characterId, boss.bossId);
        sync.tombstones.bosses[key] = isoMax(sync.tombstones.bosses[key], changedAt);
      }
    }
    for (const activity of Array.isArray(character.weeklyActivities) ? character.weeklyActivities : []) {
      if (activity?.id) {
        const key = activityKey(characterId, activity.id);
        sync.tombstones.activities[key] = isoMax(sync.tombstones.activities[key], changedAt);
      }
    }
  }
  state.updatedAt = changedAt;
  state.sync = sync;
  return state;
}

function addConflict(conflicts, scope, id, field, localValue, remoteValue, winner, at) {
  conflicts.push({scope, id, field, winner, at, local: copy(localValue), remote: copy(remoteValue)});
  if (conflicts.length > MAX_CONFLICT_LOG) conflicts.splice(0, conflicts.length - MAX_CONFLICT_LOG);
}

function mergeRecord(baseValue, localValue, remoteValue, localRevision, remoteRevision, scope, id, conflicts, now) {
  if (localValue == null) return copy(remoteValue);
  if (remoteValue == null) return copy(localValue);
  if (same(localValue, remoteValue)) return copy(localValue);
  const base = asObject(baseValue);
  const local = asObject(localValue);
  const remote = asObject(remoteValue);
  const result = {};
  const fields = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const field of fields) {
    const baseField = base[field];
    const localField = local[field];
    const remoteField = remote[field];
    const localChanged = !same(localField, baseField);
    const remoteChanged = !same(remoteField, baseField);
    if (localChanged && !remoteChanged) result[field] = copy(localField);
    else if (remoteChanged && !localChanged) result[field] = copy(remoteField);
    else if (!localChanged && !remoteChanged) result[field] = copy(baseField);
    else if (same(localField, remoteField)) result[field] = copy(localField);
    else {
      const localWins = timestamp(localRevision) > timestamp(remoteRevision);
      result[field] = copy(localWins ? localField : remoteField);
      addConflict(conflicts, scope, id, field, localField, remoteField, localWins ? 'local' : 'remote', now);
    }
  }
  return result;
}

function mergeCollection({baseMap, localMap, remoteMap, localSync, remoteSync, group, scope = group, conflicts, now}) {
  const result = new Map();
  const revisions = {};
  const tombstones = {};
  const ids = new Set([
    ...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys(),
    ...Object.keys(localSync.tombstones[group] || {}), ...Object.keys(remoteSync.tombstones[group] || {})
  ]);
  for (const id of ids) {
    const localRevision = revisionFor(localSync, group, id, localMap.has(id) ? localSync.revisions.root : '');
    const remoteRevision = revisionFor(remoteSync, group, id, remoteMap.has(id) ? remoteSync.revisions.root : '');
    const deletion = isoMax(tombstoneFor(localSync, group, id), tombstoneFor(remoteSync, group, id));
    const newestItemRevision = isoMax(localRevision, remoteRevision);
    if (timestamp(deletion) >= timestamp(newestItemRevision) && timestamp(deletion) > 0) {
      tombstones[id] = deletion;
      continue;
    }
    const value = mergeRecord(baseMap.get(id), localMap.get(id), remoteMap.get(id),
      localRevision, remoteRevision, scope, id, conflicts, now);
    if (value != null) {
      result.set(id, value);
      revisions[id] = isoMax(localRevision, remoteRevision, now);
    }
    if (timestamp(deletion) > 0) tombstones[id] = deletion;
  }
  return {result, revisions, tombstones};
}

function prefixedSync(sync, characterId) {
  const prefix = characterId + '::';
  const result = normalizeSync(sync);
  result.revisions.bosses = Object.fromEntries(Object.entries(sync.revisions.bosses).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
  result.tombstones.bosses = Object.fromEntries(Object.entries(sync.tombstones.bosses).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
  result.revisions.activities = Object.fromEntries(Object.entries(sync.revisions.activities).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
  result.tombstones.activities = Object.fromEntries(Object.entries(sync.tombstones.activities).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
  return result;
}

function semanticState(state) {
  const value = copy(asObject(state));
  delete value.sync;
  delete value.updatedAt;
  return value;
}

function mergeStates(baseInput, localInput, remoteInput, now = new Date().toISOString()) {
  const base = copy(asObject(baseInput));
  const local = prepareStateForMerge(localInput, base, now);
  const remote = prepareStateForMerge(remoteInput, base, now);
  const localSync = normalizeSync(local.sync);
  const remoteSync = normalizeSync(remote.sync);
  const conflicts = [];
  const root = mergeRecord(rootData(base), rootData(local), rootData(remote),
    localSync.revisions.root, remoteSync.revisions.root, 'state', 'root', conflicts, now);
  const settings = mergeRecord(base.settings, local.settings, remote.settings,
    localSync.revisions.settings, remoteSync.revisions.settings, 'settings', 'settings', conflicts, now);
  const sync = emptySync();
  sync.revisions.root = isoMax(localSync.revisions.root, remoteSync.revisions.root);
  sync.revisions.settings = isoMax(localSync.revisions.settings, remoteSync.revisions.settings);

  const collections = {};
  for (const group of ['incomes', 'presets']) {
    collections[group] = mergeCollection({
      baseMap: mapBy(base[group]), localMap: mapBy(local[group]), remoteMap: mapBy(remote[group]),
      localSync, remoteSync, group, conflicts, now
    });
    sync.revisions[group] = collections[group].revisions;
    sync.tombstones[group] = collections[group].tombstones;
  }
  const history = mergeCollection({
    baseMap: historyMap(base.weeklyHistory), localMap: historyMap(local.weeklyHistory), remoteMap: historyMap(remote.weeklyHistory),
    localSync, remoteSync, group: 'weeklyHistory', conflicts, now
  });
  sync.revisions.weeklyHistory = history.revisions;
  sync.tombstones.weeklyHistory = history.tombstones;

  const baseCharacters = mapBy(base.characters);
  const localCharacters = mapBy(local.characters);
  const remoteCharacters = mapBy(remote.characters);
  const characterBodies = mergeCollection({
    baseMap: new Map([...baseCharacters].map(([id, value]) => [id, characterData(value)])),
    localMap: new Map([...localCharacters].map(([id, value]) => [id, characterData(value)])),
    remoteMap: new Map([...remoteCharacters].map(([id, value]) => [id, characterData(value)])),
    localSync, remoteSync, group: 'characters', conflicts, now
  });
  sync.revisions.characters = characterBodies.revisions;
  sync.tombstones.characters = characterBodies.tombstones;

  const characters = [];
  for (const [characterId, body] of characterBodies.result) {
    const bossResult = mergeCollection({
      baseMap: mapBy(baseCharacters.get(characterId)?.bosses, 'bossId'),
      localMap: mapBy(localCharacters.get(characterId)?.bosses, 'bossId'),
      remoteMap: mapBy(remoteCharacters.get(characterId)?.bosses, 'bossId'),
      localSync: prefixedSync(localSync, characterId), remoteSync: prefixedSync(remoteSync, characterId),
      group: 'bosses', scope: 'character.bosses', conflicts, now
    });
    for (const [id, value] of Object.entries(bossResult.revisions)) sync.revisions.bosses[bossKey(characterId, id)] = value;
    for (const [id, value] of Object.entries(bossResult.tombstones)) sync.tombstones.bosses[bossKey(characterId, id)] = value;
    const activityResult = mergeCollection({
      baseMap: mapBy(baseCharacters.get(characterId)?.weeklyActivities),
      localMap: mapBy(localCharacters.get(characterId)?.weeklyActivities),
      remoteMap: mapBy(remoteCharacters.get(characterId)?.weeklyActivities),
      localSync: prefixedSync(localSync, characterId), remoteSync: prefixedSync(remoteSync, characterId),
      group: 'activities', scope: 'character.weeklyActivities', conflicts, now
    });
    for (const [id, value] of Object.entries(activityResult.revisions)) sync.revisions.activities[activityKey(characterId, id)] = value;
    for (const [id, value] of Object.entries(activityResult.tombstones)) sync.tombstones.activities[activityKey(characterId, id)] = value;
    characters.push({...body, bosses: [...bossResult.result.values()], weeklyActivities: [...activityResult.result.values()]});
  }
  for (const source of [localSync, remoteSync]) {
    for (const group of ['bosses', 'activities']) for (const [key, value] of Object.entries(source.tombstones[group])) {
      if (!sync.tombstones[group][key] || timestamp(value) > timestamp(sync.tombstones[group][key])) sync.tombstones[group][key] = value;
    }
  }

  sync.conflicts = [...localSync.conflicts, ...remoteSync.conflicts, ...conflicts].slice(-MAX_CONFLICT_LOG);
  const state = {
    ...root,
    settings,
    incomes: [...collections.incomes.result.values()],
    characters,
    presets: [...collections.presets.result.values()],
    weeklyHistory: Object.fromEntries([...history.result].map(([id, value]) => [id, {...value, weekId: value?.weekId || id}])),
    updatedAt: isoMax(local.updatedAt, remote.updatedAt, now),
    sync
  };
  const differsFromLocal = !same(semanticState(state), semanticState(local));
  const differsFromRemote = !same(semanticState(state), semanticState(remote));
  return {
    state, conflicts,
    merged: (differsFromLocal && differsFromRemote) || conflicts.length > 0,
    differsFromLocal, differsFromRemote
  };
}

function authErrorMessage(error, action = '요청') {
  const message = String(error?.message || error || '');
  if (/email not confirmed/i.test(message)) return '이메일 인증이 아직 완료되지 않았습니다. 인증 메일을 확인해주세요.';
  if (/invalid login credentials|invalid.*password/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/user already registered|already been registered|already exists/i.test(message)) return '이미 가입된 이메일입니다. 로그인하거나 인증 메일을 다시 보내주세요.';
  if (/password.*(least|weak)|weak password/i.test(message)) return '비밀번호는 6자 이상으로 설정해주세요.';
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
  if (/network|fetch|failed to fetch|load failed/i.test(message)) return '네트워크 연결을 확인한 뒤 다시 시도해주세요.';
  return action + '에 실패했습니다' + (message ? ': ' + message : '.');
}

export function startCloudSync(app) {
  const elements = {
    badge: document.querySelector('#syncBadge'), unavailable: document.querySelector('#cloudUnavailable'),
    form: document.querySelector('#authForm'), email: document.querySelector('#authEmail'), password: document.querySelector('#authPassword'),
    signUp: document.querySelector('#signUp'), resend: document.querySelector('#resendConfirmation'),
    account: document.querySelector('#cloudAccount'), cloudEmail: document.querySelector('#cloudEmail'),
    status: document.querySelector('#cloudStatus'), authMessage: document.querySelector('#authMessage'),
    syncNow: document.querySelector('#syncNow'), signOut: document.querySelector('#signOut')
  };
  const loginButton = elements.form?.querySelector('button[type="submit"]');
  if (!app || !elements.form) return;

  const setBadge = (label, mode = 'local') => {
    elements.badge?.classList.toggle('sync-pending', mode === 'pending');
    elements.badge?.classList.toggle('sync-error', mode === 'error');
    const text = elements.badge?.querySelector('span');
    if (text) text.textContent = label;
  };
  const statusLabels = {
    waiting: ['동기화 대기', 'pending'], syncing: ['동기화 중', 'pending'],
    synced: ['최신 상태', 'synced'], offline: ['오프라인 저장 중', 'error'],
    merged: ['충돌 병합 완료', 'synced'], failed: ['동기화 실패', 'error']
  };
  const setStatus = (kind, detail = '') => {
    const [label, mode] = statusLabels[kind] || statusLabels.failed;
    elements.status.textContent = detail ? label + ' · ' + detail : label;
    setBadge(label, mode);
  };
  const setMessage = (text, error = false) => {
    if (!elements.authMessage) return;
    elements.authMessage.textContent = text;
    elements.authMessage.classList.toggle('negative', error);
  };
  const setAuthBusy = busy => {
    if (loginButton) loginButton.disabled = busy;
    if (elements.signUp) elements.signUp.disabled = busy;
    if (elements.resend) elements.resend.disabled = busy;
    elements.email.disabled = busy;
    elements.password.disabled = busy;
  };
  if (!url || !publishableKey) {
    elements.unavailable?.classList.remove('hidden');
    elements.form.classList.add('hidden');
    setMessage('Vercel에 Supabase URL과 publishable key를 설정하면 로그인이 활성화됩니다.');
    return;
  }

  const supabase = createClient(url, publishableKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  let user = null;
  let syncQueue = Promise.resolve();
  let pushTimer = 0;
  let resendTimer = 0;
  let meta = normalizeMeta(localStorage.getItem(META_KEY));
  if (!meta.clientId) meta.clientId = crypto.randomUUID();
  const saveMeta = changes => {
    meta = {...normalizeMeta(meta), ...changes};
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  };
  saveMeta({clientId: meta.clientId});

  const baseKey = () => BASE_KEY_PREFIX + (user?.id || '');
  const loadBase = () => {
    if (!user) return null;
    const value = safeJson(localStorage.getItem(baseKey()), null);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  };
  const saveBase = payload => {
    if (user) localStorage.setItem(baseKey(), JSON.stringify(payload));
  };
  const saveRecovery = payload => {
    if (user) localStorage.setItem(RECOVERY_KEY_PREFIX + user.id, JSON.stringify({savedAt: new Date().toISOString(), payload}));
  };
  const showSession = session => {
    user = session?.user || null;
    elements.form.classList.toggle('hidden', !!user);
    elements.account.classList.toggle('hidden', !user);
    elements.cloudEmail.textContent = user?.email || '';
    if (!user) {
      elements.status.textContent = '';
      setBadge('이 기기에 저장');
    }
  };
  const readRemote = async () => {
    const {data, error} = await supabase.from(TABLE).select('payload,version,updated_at,state_updated_at,content_hash').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const rememberRemote = async row => {
    const hash = row.content_hash || await contentHash(row.payload);
    saveMeta({userId: user.id, cloudVersion: Number(row.version) || 0, lastHash: hash, cloudUpdatedAt: row.updated_at});
    saveBase(row.payload);
    return hash;
  };
  const applyRemote = async (row, kind = 'synced') => {
    const hash = await rememberRemote(row);
    if (hash !== await contentHash(app.getState())) app.applyCloudState(row.payload);
    setStatus(kind, kind === 'merged' ? '다른 기기의 변경사항을 병합했습니다.' : '');
  };
  const persistRemote = async (state, expectedVersion) => {
    const hash = await contentHash(state);
    const values = {
      payload: state, version: expectedVersion + 1, state_updated_at: state.updatedAt,
      client_id: meta.clientId, content_hash: hash
    };
    if (!expectedVersion) {
      return supabase.from(TABLE).insert({user_id: user.id, ...values}).select('payload,version,updated_at,state_updated_at,content_hash').single();
    }
    return supabase.from(TABLE).update(values).eq('user_id', user.id).eq('version', expectedVersion)
      .select('payload,version,updated_at,state_updated_at,content_hash').maybeSingle();
  };

  const writeRemote = async (localState, remoteRow = null, attempt = 0) => {
    setStatus('syncing');
    const latest = remoteRow || await readRemote();
    const base = loadBase();
    let candidate = prepareStateForMerge(localState, base);
    let mergeResult = null;
    if (latest) {
      mergeResult = mergeStates(base, candidate, latest.payload);
      candidate = mergeResult.state;
    }
    if (typeof app.normalizeCloudState === 'function') candidate = app.normalizeCloudState(candidate);
    const hash = await contentHash(candidate);
    if (latest && hash === (latest.content_hash || await contentHash(latest.payload))) {
      await applyRemote(latest, mergeResult?.merged ? 'merged' : 'synced');
      return latest;
    }
    const result = await persistRemote(candidate, Number(latest?.version) || 0);
    if (!result.error && result.data) {
      if (mergeResult?.differsFromLocal || !same(candidate, app.getState())) app.applyCloudState(candidate);
      await rememberRemote(result.data);
      setStatus(mergeResult?.merged ? 'merged' : 'synced',
        mergeResult?.merged ? '다른 기기의 변경사항을 병합했습니다.' : '');
      return result.data;
    }
    if (attempt >= 2) {
      saveRecovery(localState);
      const server = await readRemote();
      if (server) await applyRemote(server, 'failed');
      throw result.error || new Error('동시에 변경되어 자동 병합을 완료하지 못했습니다. 서버 상태를 적용하고 이 기기의 변경은 복구용으로 보관했습니다.');
    }
    const server = await readRemote();
    if (!server) {
      if (result.error) throw result.error;
      return writeRemote(localState, null, attempt + 1);
    }
    return writeRemote(localState, server, attempt + 1);
  };

  const reconcile = async ({initial = false} = {}) => {
    if (!user) return;
    const local = app.getState();
    const localHash = await contentHash(local);
    const remote = await readRemote();
    const remoteHash = remote?.content_hash || (remote ? await contentHash(remote.payload) : '');
    const knownDevice = meta.userId === user.id && Number(meta.cloudVersion) > 0;
    const action = chooseSyncAction({
      remoteExists: !!remote, sameContent: remoteHash === localHash, knownDevice, initial,
      hasLocalData: meaningfulLocalData(local)
    });
    if (action === 'upload') {
      await writeRemote(local, remote);
      if (!remote) setMessage('이 기기의 기존 데이터를 클라우드로 이전했습니다.');
      return;
    }
    if (action === 'noop') {
      await rememberRemote(remote);
      setStatus('synced');
      return;
    }
    if (action === 'choose') {
      const useLocal = confirm('이 기기와 클라우드에 서로 다른 데이터가 있습니다.\n\n확인: 이 기기의 데이터를 클라우드에 저장\n취소: 클라우드 데이터를 이 기기에 적용');
      if (useLocal) {
        const prepared = prepareStateForMerge(local, null);
        const result = await persistRemote(prepared, Number(remote.version) || 0);
        if (!result.error && result.data) {
          app.applyCloudState(prepared);
          await rememberRemote(result.data);
          setStatus('synced');
          setMessage('이 기기의 데이터를 클라우드로 이전했습니다.');
        } else {
          await writeRemote(local, await readRemote());
        }
      } else await applyRemote(remote);
      return;
    }
    await writeRemote(local, remote);
  };

  const enqueue = task => {
    syncQueue = syncQueue.then(task, task).catch(error => {
      console.error('Cloud sync failed', error);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(offline ? 'offline' : 'failed');
      setMessage(authErrorMessage(error, '동기화'), true);
    });
    return syncQueue;
  };
  const schedulePush = () => {
    if (!user) return;
    clearTimeout(pushTimer);
    setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'waiting');
    pushTimer = window.setTimeout(() => enqueue(() => reconcile()), 600);
  };
  const activate = session => {
    const changedUser = session?.user?.id !== user?.id;
    showSession(session);
    if (session && changedUser) enqueue(() => reconcile({initial: true}));
  };

  elements.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true);
    setMessage('로그인 중…');
    try {
      const {error} = await supabase.auth.signInWithPassword({email: elements.email.value.trim(), password: elements.password.value});
      if (error) setMessage(authErrorMessage(error, '로그인'), true);
      else {
        elements.password.value = '';
        setMessage('로그인했습니다. 데이터를 확인하고 있습니다.');
      }
    } catch (error) {
      console.error('Supabase sign-in failed', error);
      setMessage(authErrorMessage(error, '로그인'), true);
    } finally {
      setAuthBusy(false);
    }
  });

  elements.signUp?.addEventListener('click', async () => {
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true);
    setMessage('계정 생성 중…');
    try {
      const {data, error} = await supabase.auth.signUp({
        email: elements.email.value.trim(), password: elements.password.value,
        options: {emailRedirectTo: window.location.origin}
      });
      if (error) setMessage(authErrorMessage(error, '회원가입'), true);
      else if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        setMessage('이미 가입된 이메일입니다. 로그인하거나 인증 메일을 다시 보내주세요.', true);
      } else if (data.session) {
        elements.password.value = '';
        setMessage('회원가입과 로그인이 완료되었습니다.');
      } else if (data.user) {
        elements.password.value = '';
        setMessage('인증 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.');
      } else setMessage('회원가입 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', true);
    } catch (error) {
      console.error('Supabase sign-up failed', error);
      setMessage(authErrorMessage(error, '회원가입'), true);
    } finally {
      setAuthBusy(false);
    }
  });

  elements.resend?.addEventListener('click', async () => {
    const email = elements.email.value.trim();
    if (!email || !elements.email.checkValidity()) {
      elements.email.reportValidity();
      setMessage('인증 메일을 받을 이메일을 입력해주세요.', true);
      return;
    }
    clearTimeout(resendTimer);
    setAuthBusy(true);
    setMessage('인증 메일을 다시 보내는 중…');
    try {
      const {error} = await supabase.auth.resend({
        type: 'signup', email, options: {emailRedirectTo: window.location.origin}
      });
      if (error) {
        setMessage(authErrorMessage(error, '인증 메일 재전송'), true);
        setAuthBusy(false);
      } else {
        setMessage('인증 메일을 다시 보냈습니다. 받은편지함을 확인해주세요.');
        if (loginButton) loginButton.disabled = false;
        if (elements.signUp) elements.signUp.disabled = false;
        elements.email.disabled = false;
        elements.password.disabled = false;
        elements.resend.disabled = true;
        resendTimer = window.setTimeout(() => { if (elements.resend) elements.resend.disabled = false; }, 30000);
      }
    } catch (error) {
      console.error('Supabase resend failed', error);
      setMessage(authErrorMessage(error, '인증 메일 재전송'), true);
      setAuthBusy(false);
    }
  });

  elements.signOut?.addEventListener('click', async () => {
    const {error} = await supabase.auth.signOut();
    if (error) setMessage(authErrorMessage(error, '로그아웃'), true);
    else setMessage('로그아웃했습니다. 이 기기의 데이터는 그대로 사용할 수 있습니다.');
  });
  elements.syncNow?.addEventListener('click', () => enqueue(() => reconcile()));
  window.addEventListener(app.changeEvent, schedulePush);
  window.addEventListener('storage', event => { if (event.key === app.storageKey) schedulePush(); });
  window.addEventListener('online', () => user && enqueue(() => reconcile()));
  window.addEventListener('offline', () => user && setStatus('offline'));
  window.addEventListener('focus', () => user && enqueue(() => reconcile()));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && user) enqueue(() => reconcile()); });
  supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => activate(session), 0));
  supabase.auth.getSession().then(({data, error}) => {
    if (error) setMessage(authErrorMessage(error, '로그인 상태 확인'), true);
    else activate(data.session);
  }).catch(error => setMessage(authErrorMessage(error, '로그인 상태 확인'), true));
}

export const cloudSyncInternals = {
  authErrorMessage, chooseSyncAction, contentHash, meaningfulLocalData, mergeStates,
  normalizeMeta, prepareStateForMerge, timestamp
};
