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

const migrationGroups = ['incomes', 'characters', 'bosses', 'activities', 'presets', 'weeklyHistory'];
function normalizeMigrationGuard(value) {
  const baseline = asObject(value?.baseline || value);
  return Object.fromEntries(migrationGroups.map(group => [
    group,
    new Set(Array.isArray(baseline[group]) ? baseline[group].map(String) : [])
  ]));
}
const shouldRecordDeletion = (guard, group, id) => !guard || guard[group]?.has(String(id));

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
  const settings = asObject(state.settings);
  if (Object.keys(settings).some(key => key !== 'defaultSaleFeeRate')) return true;
  if (settings.defaultSaleFeeRate != null && Number(settings.defaultSaleFeeRate) !== 0.05) return true;
  if (state.characters?.length !== 1) return !!state.characters?.length;
  const character = state.characters?.[0];
  return !!character && !!(
    character.name !== '본캐' || character.nexonCharacter ||
    character.bosses?.some(boss => boss.done || boss.manualOverride != null || boss.apiCompleted) ||
    character.weeklyActivities?.length
  );
}

function chooseSyncAction({remoteExists, sameContent, knownDevice, hasLocalData, hasRemoteData}) {
  if (!remoteExists) return 'create';
  if (sameContent) return 'noop';
  if (knownDevice) return 'merge';
  if (!hasLocalData) return 'download';
  if (!hasRemoteData) return 'upload';
  return 'choose';
}

const mapBy = (items, key = 'id') => new Map((Array.isArray(items) ? items : []).filter(item => item?.[key]).map(item => [String(item[key]), item]));
const historyMap = history => new Map(Object.entries(asObject(history)).map(([key, value]) => [String(value?.weekId || key), value]));
const rootData = state => {
  const value = {...asObject(state)};
  for (const key of ['incomes', 'characters', 'presets', 'weeklyHistory', 'settings', 'sync', 'updatedAt', 'version', 'migrationNote']) delete value[key];
  return value;
};
const characterData = character => {
  const value = {...asObject(character)};
  delete value.bosses;
  delete value.weeklyActivities;
  const nexonCharacter = asObject(value.nexonCharacter);
  delete value.nexonCharacter;
  for (const [key, fieldValue] of Object.entries(nexonCharacter)) value['nexonCharacter.' + key] = fieldValue;
  return value;
};
const restoreCharacterData = character => {
  const value = {...asObject(character)};
  const nexonCharacter = {};
  for (const key of Object.keys(value)) {
    if (!key.startsWith('nexonCharacter.')) continue;
    if (value[key] !== undefined) nexonCharacter[key.slice('nexonCharacter.'.length)] = value[key];
    delete value[key];
  }
  if (Object.keys(nexonCharacter).length) value.nexonCharacter = nexonCharacter;
  return value;
};
const latestNexonStatSnapshot = (...characters) => {
  let selected = null;
  for (const character of characters) {
    const nexonCharacter = asObject(character?.nexonCharacter);
    if (!nexonCharacter.stats || typeof nexonCharacter.stats !== 'object' || Array.isArray(nexonCharacter.stats)) continue;
    if (!selected || timestamp(nexonCharacter.statsCheckedAt) >= timestamp(selected.statsCheckedAt)) selected = nexonCharacter;
  }
  return selected ? {
    combatPower: copy(selected.combatPower),
    stats: copy(selected.stats),
    statsCheckedAt: selected.statsCheckedAt
  } : null;
};
const bossKey = (characterId, bossId) => characterId + '::' + bossId;
const activityKey = (characterId, activityId) => characterId + '::' + activityId;
const revisionFor = (sync, group, id, fallback = '') => sync.revisions[group]?.[id] || fallback;
const tombstoneFor = (sync, group, id) => sync.tombstones[group]?.[id] || '';

function markCollectionChanges(currentMap, baseMap, sync, group, changedAt, migrationGuard = null) {
  for (const [id, value] of currentMap) {
    if (!same(value, baseMap.get(id))) sync.revisions[group][id] = isoMax(sync.revisions[group][id], changedAt);
    if (timestamp(tombstoneFor(sync, group, id)) < timestamp(revisionFor(sync, group, id))) delete sync.tombstones[group][id];
  }
  for (const id of baseMap.keys()) {
    if (!currentMap.has(id) && shouldRecordDeletion(migrationGuard, group, id)) {
      sync.tombstones[group][id] = isoMax(sync.tombstones[group][id], changedAt);
    }
  }
}

function prepareStateForMerge(input, baseInput = null, now = new Date().toISOString(), options = {}) {
  const state = copy(asObject(input));
  const base = copy(asObject(baseInput));
  state.incomes = Array.isArray(state.incomes) ? state.incomes : [];
  state.characters = Array.isArray(state.characters) ? state.characters : [];
  state.presets = Array.isArray(state.presets) ? state.presets : [];
  state.weeklyHistory = asObject(state.weeklyHistory);
  state.settings = asObject(state.settings);
  const sync = normalizeSync(state.sync);
  const baseSync = normalizeSync(base.sync);
  const migrationGuard = options.migrationGuard ? normalizeMigrationGuard(options.migrationGuard) : null;
  const changedAt = timestamp(state.updatedAt) ? new Date(timestamp(state.updatedAt)).toISOString() : now;

  for (const group of Object.keys(sync.tombstones)) sync.tombstones[group] = {...baseSync.tombstones[group], ...sync.tombstones[group]};

  if (!same(rootData(state), rootData(base))) sync.revisions.root = isoMax(sync.revisions.root, changedAt);
  if (!same(state.settings, base.settings || {})) sync.revisions.settings = isoMax(sync.revisions.settings, changedAt);
  for (const group of ['incomes', 'presets']) markCollectionChanges(mapBy(state[group]), mapBy(base[group]), sync, group, changedAt, migrationGuard);
  markCollectionChanges(historyMap(state.weeklyHistory), historyMap(base.weeklyHistory), sync, 'weeklyHistory', changedAt, migrationGuard);

  const characters = mapBy(state.characters);
  const baseCharacters = mapBy(base.characters);
  markCollectionChanges(
    new Map([...characters].map(([id, value]) => [id, characterData(value)])),
    new Map([...baseCharacters].map(([id, value]) => [id, characterData(value)])),
    sync, 'characters', changedAt, migrationGuard
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
        if (shouldRecordDeletion(migrationGuard, 'bosses', key)) {
          sync.tombstones.bosses[key] = isoMax(sync.tombstones.bosses[key], changedAt);
        }
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
        if (shouldRecordDeletion(migrationGuard, 'activities', key)) {
          sync.tombstones.activities[key] = isoMax(sync.tombstones.activities[key], changedAt);
        }
      }
    }
  }
  for (const [characterId, character] of baseCharacters) {
    if (characters.has(characterId)) continue;
    for (const boss of Array.isArray(character.bosses) ? character.bosses : []) {
      if (boss?.bossId) {
        const key = bossKey(characterId, boss.bossId);
        if (shouldRecordDeletion(migrationGuard, 'bosses', key)) {
          sync.tombstones.bosses[key] = isoMax(sync.tombstones.bosses[key], changedAt);
        }
      }
    }
    for (const activity of Array.isArray(character.weeklyActivities) ? character.weeklyActivities : []) {
      if (activity?.id) {
        const key = activityKey(characterId, activity.id);
        if (shouldRecordDeletion(migrationGuard, 'activities', key)) {
          sync.tombstones.activities[key] = isoMax(sync.tombstones.activities[key], changedAt);
        }
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
  delete value.version;
  delete value.migrationNote;
  return value;
}

function mergeStates(baseInput, localInput, remoteInput, now = new Date().toISOString(), options = {}) {
  const base = copy(asObject(baseInput));
  const local = prepareStateForMerge(localInput, base, now, {migrationGuard: options.localMigrationGuard});
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
    const restoredBody = restoreCharacterData(body);
    const statSnapshot = latestNexonStatSnapshot(
      baseCharacters.get(characterId), localCharacters.get(characterId), remoteCharacters.get(characterId)
    );
    if (statSnapshot && restoredBody.nexonCharacter) restoredBody.nexonCharacter = {...restoredBody.nexonCharacter, ...statSnapshot};
    characters.push({...restoredBody, bosses: [...bossResult.result.values()], weeklyActivities: [...activityResult.result.values()]});
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

function syncError(kind, error) {
  const wrapped = new Error(String(error?.message || error || '알 수 없는 오류'));
  wrapped.name = 'CloudSyncError';
  wrapped.syncKind = kind;
  wrapped.code = error?.code || error?.status || '';
  return wrapped;
}

function syncErrorMessage(error) {
  const message = String(error?.message || '');
  if (/network|fetch|failed to fetch|load failed/i.test(message)) return '네트워크 연결을 확인한 뒤 다시 시도해주세요.';
  if (/rate limit|too many requests/i.test(message) || error?.code === '429') return '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
  if (error?.code === '42501' || /row.level.security|permission denied|rls/i.test(message)) return '클라우드 저장 권한을 확인하지 못했습니다. Supabase RLS 설정을 확인해주세요.';
  const labels = {
    'remote-read': '클라우드 데이터를 불러오지 못했습니다.',
    'initial-insert': '최초 클라우드 저장 공간을 만들지 못했습니다.',
    'remote-update': '클라우드 데이터를 저장하지 못했습니다.',
    'session-recovery': '로그인 세션을 복구하지 못했습니다.',
    'selection-stale': '다른 기기에서 데이터가 변경되었습니다. 다시 동기화해주세요.'
  };
  return labels[error?.syncKind] || authErrorMessage(error, '동기화');
}

function signupResult(data) {
  if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
    return {kind: 'existing', message: '이미 가입된 이메일입니다.\n로그인하거나 인증 메일을 다시 보내주세요.', error: true};
  }
  if (data?.session) return {kind: 'session', message: '계정 생성이 완료되었습니다.\n클라우드 저장을 준비하고 있습니다.', error: false};
  if (data?.user) return {kind: 'confirmation', message: '인증 메일을 보냈습니다.\n이메일 인증을 완료한 뒤 로그인해주세요.', error: false};
  return {kind: 'invalid', message: '회원가입 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', error: true};
}

export function startCloudSync(app) {
  const elements = {
    badge: document.querySelector('#syncBadge'), unavailable: document.querySelector('#cloudUnavailable'),
    form: document.querySelector('#authForm'), email: document.querySelector('#authEmail'), password: document.querySelector('#authPassword'),
    signUp: document.querySelector('#signUp'), resend: document.querySelector('#resendConfirmation'),
    account: document.querySelector('#cloudAccount'), cloudEmail: document.querySelector('#cloudEmail'),
    status: document.querySelector('#cloudStatus'), authMessage: document.querySelector('#authMessage'),
    syncNow: document.querySelector('#syncNow'), signOut: document.querySelector('#signOut'),
    choiceDialog: document.querySelector('#cloudChoiceDialog'), choiceStep: document.querySelector('#cloudChoiceStep'),
    overwriteStep: document.querySelector('#cloudOverwriteStep')
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
  let choiceResolver = null;
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
  const normalizePayload = payload => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return typeof app.normalizeCloudState === 'function' ? app.normalizeCloudState(payload) : copy(payload);
  };
  const finishMigrationSync = () => {
    if (typeof app.completeMigrationSync === 'function') app.completeMigrationSync();
  };
  const meaningfulPayload = payload => {
    const normalized = normalizePayload(payload) || payload;
    return typeof app.hasMeaningfulData === 'function' ? app.hasMeaningfulData(normalized) : meaningfulLocalData(normalized);
  };
  const resetChoiceDialog = () => {
    elements.choiceStep?.classList.remove('hidden');
    elements.overwriteStep?.classList.add('hidden');
  };
  const finishChoice = choice => {
    const resolve = choiceResolver;
    choiceResolver = null;
    if (elements.choiceDialog?.open) elements.choiceDialog.close();
    resetChoiceDialog();
    resolve?.(choice);
  };
  const requestDataChoice = () => new Promise(resolve => {
    if (!elements.choiceDialog) { resolve('remote'); return; }
    if (choiceResolver) { resolve(null); return; }
    choiceResolver = resolve;
    resetChoiceDialog();
    elements.choiceDialog.showModal();
  });
  const showSession = session => {
    user = session?.user || null;
    if (!user && choiceResolver) finishChoice(null);
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
    if (error) throw syncError('remote-read', error);
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
      const result = await supabase.from(TABLE).insert({user_id: user.id, ...values}).select('payload,version,updated_at,state_updated_at,content_hash').single();
      return result.error ? {...result, error: syncError('initial-insert', result.error)} : result;
    }
    const result = await supabase.from(TABLE).update(values).eq('user_id', user.id).eq('version', expectedVersion)
      .select('payload,version,updated_at,state_updated_at,content_hash').maybeSingle();
    return result.error ? {...result, error: syncError('remote-update', result.error)} : result;
  };

  const writeRemote = async (localState, remoteRow = null, attempt = 0) => {
    setStatus('syncing');
    const latest = remoteRow || await readRemote();
    const migrationInfo = typeof app.getMigrationInfo === 'function' ? app.getMigrationInfo() : null;
    const base = normalizePayload(loadBase());
    const normalizedLocal = normalizePayload(localState) || localState;
    const normalizedRemote = normalizePayload(latest?.payload);
    let candidate = prepareStateForMerge(normalizedLocal, base, new Date().toISOString(), {
      migrationGuard: migrationInfo?.baseline
    });
    let mergeResult = null;
    if (latest) {
      mergeResult = mergeStates(base, candidate, normalizedRemote || latest.payload, new Date().toISOString(), {
        localMigrationGuard: migrationInfo?.baseline
      });
      candidate = mergeResult.state;
    }
    if (typeof app.normalizeCloudState === 'function') candidate = app.normalizeCloudState(candidate);
    const hash = await contentHash(candidate);
    if (latest && hash === (latest.content_hash || await contentHash(latest.payload))) {
      await applyRemote(latest, mergeResult?.merged ? 'merged' : 'synced');
      finishMigrationSync();
      return latest;
    }
    const result = await persistRemote(candidate, Number(latest?.version) || 0);
    if (!result.error && result.data) {
      if (mergeResult?.differsFromLocal || !same(candidate, app.getState())) app.applyCloudState(candidate);
      await rememberRemote(result.data);
      finishMigrationSync();
      setStatus(mergeResult?.merged ? 'merged' : 'synced',
        mergeResult?.merged ? '다른 기기의 변경사항을 병합했습니다.' : '');
      return result.data;
    }
    if (result.error) {
      if (result.error.code === '23505' && attempt < 2) {
        const server = await readRemote();
        if (server) return writeRemote(localState, server, attempt + 1);
      }
      saveRecovery(localState);
      throw result.error;
    }
    if (attempt >= 2) {
      saveRecovery(localState);
      const server = await readRemote();
      if (server) await applyRemote(server, 'failed');
      throw syncError('selection-stale', new Error('동시에 변경되어 서버 상태를 적용하고 이 기기의 변경은 복구용으로 보관했습니다.'));
    }
    const server = await readRemote();
    if (!server) {
      return writeRemote(localState, null, attempt + 1);
    }
    return writeRemote(localState, server, attempt + 1);
  };

  const replaceRemoteWithLocal = async (localState, remoteRow) => {
    setStatus('syncing');
    const candidate = prepareStateForMerge(normalizePayload(localState) || localState, null);
    const result = await persistRemote(candidate, Number(remoteRow?.version) || 0);
    if (result.error) {
      saveRecovery(localState);
      throw result.error;
    }
    if (!result.data) {
      saveRecovery(localState);
      throw syncError('selection-stale', new Error('선택 중 다른 기기에서 데이터가 변경되었습니다.'));
    }
    app.applyCloudState(candidate);
    await rememberRemote(result.data);
    finishMigrationSync();
    setStatus('synced');
    return result.data;
  };

  const reconcile = async ({initial = false} = {}) => {
    if (!user) return;
    const local = app.getState();
    const localHash = await contentHash(local);
    const remote = await readRemote();
    const remoteHash = remote?.content_hash || (remote ? await contentHash(remote.payload) : '');
    const knownDevice = meta.userId === user.id && Number(meta.cloudVersion) > 0;
    const migrationInfo = typeof app.getMigrationInfo === 'function' ? app.getMigrationInfo() : null;
    const normalizedLocal = normalizePayload(local) || local;
    const normalizedRemote = normalizePayload(remote?.payload);
    const semanticSame = !!remote && same(semanticState(normalizedLocal), semanticState(normalizedRemote));
    const hasLocalData = meaningfulPayload(normalizedLocal);
    const hasRemoteData = meaningfulPayload(normalizedRemote);
    let action = chooseSyncAction({
      remoteExists: !!remote, sameContent: migrationInfo ? remoteHash === localHash : semanticSame,
      knownDevice, initial, hasLocalData, hasRemoteData
    });
    if (migrationInfo && remote && action !== 'noop') action = knownDevice || hasLocalData ? 'merge' : 'download';
    if (action === 'create') {
      await writeRemote(local, remote);
      setMessage(meaningfulPayload(local)
        ? '이 기기의 기존 데이터를 클라우드에 안전하게 저장했습니다.'
        : '클라우드 저장을 준비했습니다.');
      return;
    }
    if (action === 'noop') {
      await rememberRemote(remote);
      finishMigrationSync();
      setStatus('synced');
      return;
    }
    if (action === 'download') {
      await applyRemote(remote);
      finishMigrationSync();
      setMessage('클라우드 데이터를 이 기기에 불러왔습니다.');
      return;
    }
    if (action === 'upload') {
      await replaceRemoteWithLocal(local, remote);
      setMessage('이 기기의 기록을 클라우드에 저장했습니다.');
      return;
    }
    if (action === 'choose') {
      setStatus('waiting', '데이터 선택이 필요합니다.');
      const choice = await requestDataChoice();
      if (choice === 'remote') {
        await applyRemote(remote);
        finishMigrationSync();
        setMessage('클라우드 데이터를 이 기기에 불러왔습니다.');
      } else if (choice === 'local') {
        await replaceRemoteWithLocal(local, remote);
        setMessage('이 기기의 기록을 클라우드에 저장했습니다.');
      } else {
        setStatus('waiting', '데이터 선택이 필요합니다.');
        setMessage('동기화할 데이터를 선택하지 않아 어느 쪽도 변경하지 않았습니다.');
      }
      return;
    }
    await writeRemote(local, remote);
  };

  const enqueue = task => {
    syncQueue = syncQueue.then(task, task).catch(error => {
      console.error('Cloud sync failed', {name: error?.name, code: error?.code, kind: error?.syncKind, message: error?.message});
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(offline ? 'offline' : 'failed');
      setMessage(offline ? '인터넷 연결이 없어 이 기기에 저장 중입니다.' : syncErrorMessage(error), true);
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

  elements.choiceDialog?.addEventListener('click', event => {
    const choice = event.target.closest('[data-cloud-choice]')?.dataset.cloudChoice;
    if (choice === 'remote') finishChoice('remote');
    if (choice === 'local') {
      elements.choiceStep?.classList.add('hidden');
      elements.overwriteStep?.classList.remove('hidden');
    }
    const overwrite = event.target.closest('[data-cloud-overwrite]')?.dataset.cloudOverwrite;
    if (overwrite === 'cancel') resetChoiceDialog();
    if (overwrite === 'confirm') finishChoice('local');
  });
  elements.choiceDialog?.addEventListener('cancel', event => { event.preventDefault(); finishChoice(null); });

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
      else {
        const outcome = signupResult(data);
        elements.password.value = '';
        setMessage(outcome.message, outcome.error);
      }
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
    if (error) setMessage(syncErrorMessage(syncError('session-recovery', error)), true);
    else activate(data.session);
  }).catch(error => setMessage(syncErrorMessage(syncError('session-recovery', error)), true));
}

export const cloudSyncInternals = {
  authErrorMessage, chooseSyncAction, contentHash, meaningfulLocalData, mergeStates,
  normalizeMeta, prepareStateForMerge, signupResult, syncError, syncErrorMessage, timestamp
};
