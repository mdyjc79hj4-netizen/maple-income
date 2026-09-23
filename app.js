'use strict';

const KEY = 'maple-income-vercel-v1';
const BACKUP_KEY = `${KEY}-before-v2`;
const STATE_VERSION = 5;
const LOCAL_CHANGE_EVENT = 'maple-income:local-change';
const items = {hunt: ['메소', '솔 에르다 조각', '코어 젬스톤'], gather: ['쥬니퍼베리 씨앗', '쥬니퍼베리 씨앗 오일', '소형 재물 획득의 비약'], drop: ['보스 드랍 아이템', '칠흑 아이템', '기타 드랍 아이템']};
const labels = {boss: '보스', hunt: '재획', gather: '채집', drop: '드랍·기타'};
// KMS reference: https://gi.maplestory.nexon.com/Update/813, 2026-09-17.
// Keep manually saved prices; Black Mage's new prices start on October 1.
const bossDB = {
  '자쿰': {카오스: 4040000}, '피에르': {카오스: 4080000}, '반반': {카오스: 4070000},
  '블러디퀸': {카오스: 4070000}, '벨룸': {카오스: 4640000}, '매그너스': {하드: 4280000}, '파풀라투스': {카오스: 6550000},
  '스우': {노멀: 8350000, 하드: 48900000, 익스트림: 545000000}, '데미안': {노멀: 8750000, 하드: 46400000},
  '가디언 엔젤 슬라임': {노멀: 12700000, 카오스: 71300000}, '루시드': {이지: 14900000, 노멀: 17800000, 하드: 59700000},
  '윌': {이지: 16100000, 노멀: 20500000, 하드: 73200000}, '더스크': {노멀: 22000000, 카오스: 66300000},
  '듄켈': {노멀: 23700000, 하드: 89600000}, '진 힐라': {노멀: 67600000, 하드: 100000000},
  '검은 마법사': {하드: 665000000, 익스트림: 8740000000},
  '선택받은 세렌': {노멀: 167000000, 하드: 302000000, 익스트림: 1840000000},
  '감시자 칼로스': {이지: 238000000, 노멀: 479000000, 카오스: 1230000000, 익스트림: 4104000000},
  '카링': {이지: 320000000, 노멀: 593000000, 하드: 1560000000, 익스트림: 5387000000},
  '벨로나': {이지: 396000000, 노멀: 824000000, 하드: 2950000000},
  '림보': {노멀: 995000000, 하드: 2385000000},
  '발드릭스': {노멀: 1320000000, 하드: 3078000000},
  '최초의 대적자': {이지: 261000000, 노멀: 532000000, 하드: 1390000000, 익스트림: 4712000000},
  '찬란한 흉성': {노멀: 576000000, 하드: 2678000000},
  '유피테르': {노멀: 1560000000, 하드: 4845000000}
};
const bossIds = {
  '자쿰': 'zakum', '피에르': 'pierre', '반반': 'vonbon', '블러디퀸': 'bloodyqueen', '벨룸': 'vellum',
  '매그너스': 'magnus', '파풀라투스': 'papulatus', '스우': 'lotus', '데미안': 'damien',
  '가디언 엔젤 슬라임': 'guardian-angel-slime', '루시드': 'lucid', '윌': 'will', '더스크': 'gloom',
  '듄켈': 'darknell', '진 힐라': 'verus-hilla', '검은 마법사': 'black-mage', '선택받은 세렌': 'seren',
  '감시자 칼로스': 'kalos', '카링': 'kaling', '벨로나': 'bellona', '림보': 'limbo',
  '발드릭스': 'baldrix', '최초의 대적자': 'first-adversary', '찬란한 흉성': 'shining-calamity', '유피테르': 'jupiter'
};
const bossNames = Object.fromEntries(Object.entries(bossIds).map(([name, id]) => [id, name]));
const bossAliases = {'세렌': '선택받은 세렌', '칼로스': '감시자 칼로스'};
const nexonBossAliases = {'블러디 퀸': '블러디퀸', '세렌': '선택받은 세렌', '칼로스': '감시자 칼로스'};
const nexonDifficulties = {'이지': '이지', '노멀': '노멀', '노말': '노멀', '하드': '하드', '카오스': '카오스', '익스트림': '익스트림'};
const legacyBossNames = ['스우', '데미안', '가디언 엔젤 슬라임', '루시드', '윌', '더스크', '듄켈', '진 힐라', '검은 마법사', '세렌', '칼로스', '카링'];
const presetGroups = {
  all: {name: '전체 보스', bosses: presetBosses(Object.keys(bossDB))},
  early: {name: '카루타 ~ 스데미', bosses: presetBosses(['피에르', '반반', '블러디퀸', '벨룸', '스우', '데미안'])},
  middle: {name: '스데미 ~ 루윌', bosses: presetBosses(['스우', '데미안', '가디언 엔젤 슬라임', '루시드', '윌'])},
  late: {name: '루윌 ~ 진듄더', bosses: presetBosses(['루시드', '윌', '더스크', '듄켈', '진 힐라'])},
  end: {name: '검은 마법사 이상', bosses: presetBosses(['검은 마법사', '선택받은 세렌', '감시자 칼로스', '카링', '벨로나', '림보', '발드릭스', '최초의 대적자', '찬란한 흉성', '유피테르'])}
};
function validatePresetIntegrity(groups = presetGroups) {
  const masterIds = Object.keys(bossDB).map(bossIdFor), errors = [];
  if (new Set(masterIds).size !== masterIds.length) errors.push('보스 마스터 DB의 bossId가 중복됩니다.');
  if (masterIds.some(id => id.startsWith('legacy:'))) errors.push('보스 마스터 DB에 안정적인 bossId가 없는 항목이 있습니다.');
  if (groups.all?.bosses.length !== masterIds.length) errors.push('전체 보스 프리셋 개수가 마스터 DB와 다릅니다.');
  for (const [key, preset] of Object.entries(groups)) {
    const seen = new Set();
    for (const boss of preset.bosses || []) {
      const name = bossNameFor(boss.bossId);
      if (!masterIds.includes(boss.bossId)) errors.push(`${key}: 존재하지 않는 bossId ${boss.bossId}`);
      if (seen.has(boss.bossId)) errors.push(`${key}: 중복 bossId ${boss.bossId}`); else seen.add(boss.bossId);
      if (!Object.hasOwn(bossDB[name] || {}, boss.difficulty)) errors.push(`${key}: ${name}의 유효하지 않은 난이도 ${boss.difficulty}`);
      if (!Number.isInteger(boss.partySize) || boss.partySize < 1 || boss.partySize > 6) errors.push(`${key}: ${name}의 유효하지 않은 파티 인원`);
    }
  }
  const allIds = new Set(groups.all?.bosses.map(b => b.bossId));
  for (const id of masterIds) if (!allIds.has(id)) errors.push(`전체 보스 프리셋 누락: ${id}`);
  if (errors.length) throw new Error(`프리셋 무결성 오류: ${errors.join(' / ')}`);
  return true;
}
const copy = value => JSON.parse(JSON.stringify(value));
const uid = () => crypto.randomUUID();
function n(value) { const result = Number(String(value ?? 0).replace(/,/g, '')); return Number.isFinite(result) ? result : 0; }
function won(value) { return Math.trunc(n(value)).toLocaleString('ko-KR'); }
function koreanMeso(value) {
  let rest = Math.abs(Math.trunc(n(value))); const parts = [];
  for (const [size, unit] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    const group = Math.floor(rest / size); rest -= group * size;
    if (group) parts.push(unit === '만' && group % 1000 === 0 ? `${group / 1000}천만` : `${won(group)}${unit}`);
  }
  if (rest) parts.push(won(rest));
  return `${n(value) < 0 ? '−' : ''}${parts.join(' ') || '0'}`;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[c])); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
// Preserve the previous local-time boundary. Calendar arithmetic also handles DST.
function weekRange(date = new Date()) {
  const start = new Date(date); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() + 3) % 7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return {start: dateKey(start), end: dateKey(end)};
}
function currentWeekKey(date = new Date()) { const w = weekRange(date); return `${w.start}~${w.end}`; }
function validWeek(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(value) && currentWeekKey(new Date(`${value.slice(0, 10)}T12:00:00`)) === value; }
function shortWeek(value) { return value.split('~').map(d => { const [, m, day] = d.split('-'); return `${n(m)}월 ${n(day)}일`; }).join(' ~ '); }
function referencePrice(name, difficulty, date = new Date()) {
  name = canonicalBossName(name);
  if (name === '검은 마법사' && dateKey(date) >= '2026-10-01') return difficulty === '하드' ? 465000000 : difficulty === '익스트림' ? 5680000000 : 0;
  return bossDB[name]?.[difficulty] ?? 0;
}
function canonicalBossName(name) { return bossAliases[name] || name; }
function bossIdFor(name) { return bossIds[canonicalBossName(name)] || `legacy:${name}`; }
function bossNameFor(id, fallback = '') { return bossNames[id] || canonicalBossName(id?.startsWith('legacy:') ? id.slice(7) : fallback); }
function validDifficulty(name, difficulty) {
  const valid = Object.keys(bossDB[canonicalBossName(name)] || {});
  return valid.includes(difficulty) ? difficulty : valid[0] || difficulty || '노멀';
}
function presetBoss(name, difficulty = Object.keys(bossDB[name] || {노멀: 0})[0], partySize = 1) {
  name = canonicalBossName(name);
  return {bossId: bossIdFor(name), difficulty: validDifficulty(name, difficulty), partySize: Math.min(6, Math.max(1, Math.trunc(Number(partySize) || 1)))};
}
function presetBosses(names) { return names.map(name => presetBoss(name)); }
function presetEntry(boss) {
  const normalized = normalizeBosses([boss])[0];
  return normalized ? {bossId: normalized.bossId, difficulty: normalized.difficulty, partySize: normalized.partySize} : null;
}
function normalizePreset(preset, index = 0) {
  const source = Array.isArray(preset) ? preset : preset?.bosses || preset?.bossIds || [];
  const unique = new Map();
  source.map(value => typeof value === 'string' ? presetBoss(bossNameFor(value, value)) : presetEntry(value)).filter(Boolean).forEach(boss => {
    if (!unique.has(boss.bossId)) unique.set(boss.bossId, boss);
  });
  const bosses = [...unique.values()];
  return {id: preset?.id || uid(), name: preset?.name || `프리셋 ${index + 1}`, bosses};
}
function makeBoss(nameOrPreset, settings = {}) {
  const source = typeof nameOrPreset === 'object' ? nameOrPreset : settings;
  const name = canonicalBossName(typeof nameOrPreset === 'string' ? nameOrPreset : bossNameFor(source.bossId, source.name || source.bossName));
  const difficulty = validDifficulty(name, source.difficulty);
  const partySize = Math.min(6, Math.max(1, Math.trunc(n(source.partySize ?? source.party) || 1)));
  const bossId = Object.hasOwn(bossDB, name) ? bossIdFor(name) : source.bossId || bossIdFor(name);
  const manualOverride = typeof source.manualOverride === 'boolean' ? source.manualOverride : undefined;
  const done = manualOverride == null ? !!source.done : manualOverride;
  return {
    bossId, name, difficulty, party: partySize, partySize,
    price: source.price == null ? referencePrice(name, difficulty) : n(source.price),
    done,
    ...(!done || source.completedIncome == null ? {} : {completedIncome: n(source.completedIncome)}),
    ...(typeof source.apiCompleted === 'boolean' ? {apiCompleted: source.apiCompleted} : {}),
    ...(typeof source.manualOverride === 'boolean' ? {manualOverride: source.manualOverride} : {}),
    ...(['manual', 'nexon-api'].includes(source.completionSource) ? {completionSource: source.completionSource} : {}),
    ...(typeof source.apiCheckedWeek === 'string' ? {apiCheckedWeek: source.apiCheckedWeek} : {}),
    ...(typeof source.apiCompletedAt === 'string' ? {apiCompletedAt: source.apiCompletedAt} : {})
  };
}
function normalizeBosses(source, legacy = false) {
  if (Array.isArray(source)) {
    const unique = new Map();
    for (const value of source) {
      const b = typeof value === 'string' ? makeBoss(bossNameFor(value, value)) : makeBoss(value);
      if (b.name && !unique.has(b.bossId)) unique.set(b.bossId, b);
    }
    return [...unique.values()];
  }
  const keys = Object.keys(source || {}), names = legacy ? [...new Set([...legacyBossNames, ...keys])] : keys;
  return names.map(name => {
    const b = source?.[name] || {};
    // v1 credited price directly and had no party field. Never replace it with DB prices.
    return makeBoss(name, {...b, price: n(b.price), difficulty: b.difficulty || '노멀'});
  });
}
function recordKind(r) { return r.item === '메소' && r.category !== 'drop' ? 'income' : r.recordType || (r.saleState === 'sold' ? 'sold' : 'acquired'); }
function incomeValue(r) {
  const kind = recordKind(r);
  if (kind === 'income') return n(r.netIncome ?? r.amount);
  return kind === 'sold' ? n(r.netIncome ?? (n(r.qty ?? r.quantity) * n(r.price ?? r.unitPrice) - n(r.materialCost))) : 0;
}
function bossValue(b) { return Math.floor(n(b.price) / Math.max(1, n(b.party ?? b.partySize) || 1)); }
function resetBossWeeklyState(boss) {
  boss.done = false;
  delete boss.completedIncome;
  delete boss.apiCompleted;
  delete boss.manualOverride;
  delete boss.completionSource;
  delete boss.apiCheckedWeek;
  delete boss.apiCompletedAt;
}
function normalizeNexonText(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function normalizeNexonDifficulty(value) {
  const normalized = normalizeNexonText(value).replace(/\s+/g, '');
  return nexonDifficulties[normalized] || normalized;
}
function nexonFlag(value) { return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true'); }
function mapNexonBossEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const contentName = normalizeNexonText(entry.contentName ?? entry.content_name);
  const canonicalName = nexonBossAliases[contentName] || contentName;
  const bossId = bossIds[canonicalName];
  if (!bossId) return null;
  const difficulty = normalizeNexonDifficulty(entry.difficulty);
  return {
    bossId, contentName, difficulty, cycle: normalizeNexonText(entry.cycle),
    registered: nexonFlag(entry.registered ?? entry.registration_flag),
    complete: nexonFlag(entry.complete ?? entry.complete_flag)
  };
}
function parseNexonDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim(), dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const parsed = new Date(year, month - 1, day, 12);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}
function applyNexonSchedulerState(data, characterId, response, checkedAt = new Date().toISOString()) {
  if (!data || !Array.isArray(data.characters) || !response || !Array.isArray(response.bosses)) throw new Error('NEXON 스케줄러 응답을 적용할 수 없습니다.');
  const historical = response.mode === 'historical' || !!response.requestedDate;
  if (historical) {
    const requestedDate = parseNexonDate(response.requestedDate || response.date);
    if (!requestedDate) throw new Error('NEXON 과거 조회 날짜를 확인할 수 없습니다.');
    if (currentWeekKey(requestedDate) !== data.currentWeek) throw new Error('NEXON 과거 조회 주차가 현재 주차와 일치하지 않습니다.');
  }
  const character = data.characters.find(item => item.id === characterId);
  if (!character) throw new Error('연동할 메기 캐릭터를 찾을 수 없습니다.');
  const diagnostics = {
    fetched: response.bosses.length,
    apiCompleted: response.bosses.filter(entry => nexonFlag(entry?.complete ?? entry?.complete_flag)).length,
    matched: 0, matchedCompleted: 0, autoCompleted: 0,
    unknown: [], difficultyMismatch: [], ambiguous: [], notConfigured: [], localNotFound: []
  };
  const localBosses = (character.bosses || []).map((boss, index) => ({boss, index}));
  const matches = new Map(), unknownNames = new Set(), seenApiBossIds = new Set();
  for (const entry of response.bosses) {
    const value = mapNexonBossEntry(entry);
    if (!value) {
      const name = normalizeNexonText(entry?.contentName ?? entry?.content_name);
      if (name && !unknownNames.has(name)) {
        unknownNames.add(name);
        diagnostics.unknown.push({contentName: name, difficulty: normalizeNexonDifficulty(entry?.difficulty), cycle: normalizeNexonText(entry?.cycle)});
      }
      continue;
    }
    seenApiBossIds.add(value.bossId);
    const candidates = localBosses.filter(item => item.boss.bossId === value.bossId);
    if (!candidates.length) {
      diagnostics.notConfigured.push({contentName: value.contentName, difficulty: value.difficulty, cycle: value.cycle, complete: value.complete});
      continue;
    }
    let target = null;
    if (value.difficulty) {
      const exact = candidates.filter(item => normalizeNexonDifficulty(item.boss.difficulty) === value.difficulty);
      if (exact.length === 1) target = exact[0];
      else diagnostics.difficultyMismatch.push({bossId: value.bossId, contentName: value.contentName, apiDifficulty: value.difficulty, localDifficulties: candidates.map(item => item.boss.difficulty), complete: value.complete});
    } else if (candidates.length === 1) target = candidates[0];
    else diagnostics.ambiguous.push({contentName: value.contentName, localDifficulties: candidates.map(item => item.boss.difficulty), complete: value.complete});
    if (!target) continue;
    const previous = matches.get(target.index);
    matches.set(target.index, {boss: target.boss, api: {...value, complete: value.complete || !!previous?.api.complete}});
  }
  diagnostics.matched = matches.size;
  diagnostics.matchedCompleted = [...matches.values()].filter(match => match.api.complete).length;
  diagnostics.localNotFound = localBosses.filter(item => !seenApiBossIds.has(item.boss.bossId)).map(item => ({bossId: item.boss.bossId, name: item.boss.name, difficulty: item.boss.difficulty}));
  let bossesChanged = false, newlyCompleted = 0;
  for (const {boss, api: apiBoss} of matches.values()) {
    const before = JSON.stringify(boss);
    const wasApiCompleted = boss.apiCompleted === true && boss.apiCheckedWeek === data.currentWeek;
    boss.apiCompleted = apiBoss.complete;
    boss.apiCheckedWeek = data.currentWeek;
    if (apiBoss.complete) {
      if (!wasApiCompleted) boss.apiCompletedAt = checkedAt;
      if (boss.manualOverride !== false) {
        if (!boss.done) newlyCompleted++;
        boss.done = true;
        if (boss.manualOverride !== true) boss.completionSource = 'nexon-api';
        if (boss.completionSource === 'nexon-api') diagnostics.autoCompleted++;
        if (boss.completedIncome == null || boss.completionSource === 'nexon-api') boss.completedIncome = bossValue(boss);
      }
    }
    if (before !== JSON.stringify(boss)) bossesChanged = true;
  }
  const previousLink = JSON.stringify(character.nexonCharacter || null);
  const remoteCharacter = response.character || {};
  character.nexonCharacter = {
    ...(character.nexonCharacter || {}),
    ...(remoteCharacter.ocid ? {ocid: remoteCharacter.ocid} : {}),
    ...(remoteCharacter.name ? {characterName: remoteCharacter.name} : {}),
    ...(remoteCharacter.world ? {world: remoteCharacter.world} : {}),
    linkedAt: character.nexonCharacter?.linkedAt || checkedAt,
    lastCheckedAt: checkedAt,
    lastCheckedWeek: data.currentWeek,
    status: 'ok'
  };
  return {changed: bossesChanged || previousLink !== JSON.stringify(character.nexonCharacter), bossesChanged, newlyCompleted, ...diagnostics};
}
function characterStats(c) {
  const list = normalizeBosses(c.bosses), completed = list.filter(b => b.done);
  const expected = list.reduce((sum, b) => sum + bossValue(b), 0);
  const earned = completed.reduce((sum, b) => sum + (b.completedIncome == null ? bossValue(b) : n(b.completedIncome)), 0);
  return {count: list.length, done: completed.length, expected, earned, remaining: expected - earned};
}
function totalsFor(data) {
  const t = {boss: (data.characters || []).reduce((sum, c) => sum + characterStats(c).earned, 0), hunt: 0, gather: 0, drop: 0};
  for (const row of data.incomes || []) t[Object.hasOwn(items, row.category) ? row.category : 'drop'] += incomeValue(row);
  t.total = t.boss + t.hunt + t.gather + t.drop; return t;
}
function snapshotTotals(s) {
  const computed = totalsFor(s);
  return {...computed, ...(s.totals || {}), total: n(s.totals?.total ?? s.totalIncome ?? s.total ?? computed.total)};
}
function emptyState(now = new Date()) {
  return {version: STATE_VERSION, updatedAt: now.toISOString(), currentWeek: currentWeekKey(now), characters: [{id: uid(), name: '본캐', bosses: presetGroups.middle.bosses.map(makeBoss)}], incomes: [], weeklyHistory: {}, presets: [], settings: {}, saleState: 'acquired'};
}
function recordWeek(r, fallback) {
  if (validWeek(r.weekId)) return r.weekId;
  if (r.createdAt != null) { const d = new Date(r.createdAt); if (!Number.isNaN(d.getTime())) return currentWeekKey(d); }
  return fallback;
}
function migrateState(raw, now = new Date()) {
  if (!raw) return emptyState(now);
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.characters) || !Array.isArray(raw.incomes)) throw new Error('저장 데이터 형식을 읽을 수 없습니다.');
  if (raw.version > STATE_VERSION) throw new Error('더 최신 버전의 데이터입니다. 페이지를 새로고침해 주세요.');
  const result = copy(raw), legacy = !raw.version || raw.version < 2;
  result.version = STATE_VERSION;
  result.updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : now.toISOString();
  result.currentWeek = validWeek(raw.currentWeek) ? raw.currentWeek : validWeek(raw.weekId) ? raw.weekId : currentWeekKey(now);
  result.characters = result.characters.map(c => ({...c, id: c.id || uid(), bosses: normalizeBosses(c.bosses, legacy && !Array.isArray(c.bosses))}));
  result.settings ||= {}; result.presets ||= [];
  result.weeklyHistory = Array.isArray(raw.weeklyHistory) ? Object.fromEntries(raw.weeklyHistory.map((s, i) => [s.weekId || s.id || `legacy-${i}`, copy(s)])) : copy(raw.weeklyHistory || {});
  if (!Array.isArray(result.presets)) result.presets = Object.entries(result.presets).map(([name, p]) => ({id: uid(), name, bosses: Array.isArray(p) ? p : p.bosses || []}));
  result.presets = result.presets.map(normalizePreset);
  for (const snapshot of Object.values(result.weeklyHistory)) {
    if (Array.isArray(snapshot?.characters)) snapshot.characters = snapshot.characters.map(c => ({...c, id: c.id || uid(), bosses: normalizeBosses(c.bosses, legacy && !Array.isArray(c.bosses))}));
  }
  if (legacy) {
    result.migrationNote = '이전 보스 완료 기록은 저장된 주차가 없으면 이전한 주에 유지됩니다. 수익 기록은 저장된 주차·작성일을 따릅니다.';
    const active = [], newHistory = new Set();
    for (const original of result.incomes) {
      const row = {...original, id: original.id || uid(), weekId: recordWeek(original, result.currentWeek)};
      if (row.weekId < result.currentWeek && !Object.hasOwn(result.weeklyHistory, row.weekId)) {
        result.weeklyHistory[row.weekId] = {weekId: row.weekId, characters: [], incomes: [], migrated: true}; newHistory.add(row.weekId);
      }
      const history = result.weeklyHistory[row.weekId];
      if (newHistory.has(row.weekId)) history.incomes.push(row);
      else if (row.weekId < result.currentWeek && history) {
        // Existing snapshots are immutable. Keep unmatched rows without double counting.
        if (!(history.incomes || []).some(x => x.id && x.id === row.id)) (result.unassignedIncomes ||= []).push(row);
      } else active.push(row);
    }
    result.incomes = active;
  }
  return result;
}
function rollover(data, now = new Date()) {
  const target = currentWeekKey(now); if (data.currentWeek >= target) return false;
  while (data.currentWeek < target) {
    const closing = data.currentWeek, rows = data.incomes.filter(r => recordWeek(r, closing) <= closing);
    if (!Object.hasOwn(data.weeklyHistory, closing)) {
      const snapshot = {weekId: closing, characters: copy(data.characters), incomes: copy(rows), closedAt: now.toISOString()};
      snapshot.totals = totalsFor(snapshot); data.weeklyHistory[closing] = snapshot;
    } else if (rows.length || data.characters.some(c => characterStats(c).done)) {
      (data.recoveredWeeks ||= []).push({weekId: closing, characters: copy(data.characters), incomes: copy(rows)});
    }
    data.incomes = data.incomes.filter(r => recordWeek(r, closing) > closing);
    data.characters.forEach(c => c.bosses.forEach(resetBossWeeklyState));
    const next = new Date(`${closing.slice(0, 10)}T12:00:00`); next.setDate(next.getDate() + 7); data.currentWeek = currentWeekKey(next);
  }
  return true;
}

let state, savedRaw = null, storageBlocked = false;
let selectedWeek = '', bossFilter = 'pending', historyFilter = 'all', selectedBossCharacterId = '', characterMode = 'preset', presetApplyMode = 'add';
let editingIncomeId = '', editSaleState = 'acquired';
let nexonApiState = {status: 'idle', message: '연동할 캐릭터를 선택해주세요.', diagnostics: null};
const NEXON_CHECK_COOLDOWN_MS = 60_000;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function message(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
function nextUpdatedAt(previous) {
  const prior = Date.parse(previous || '');
  return new Date(Math.max(Date.now(), Number.isNaN(prior) ? 0 : prior + 1)).toISOString();
}
function persist(next, {touch = true, notify = true} = {}) {
  next.version = STATE_VERSION;
  if (touch || !next.updatedAt) next.updatedAt = nextUpdatedAt(next.updatedAt);
  const raw = JSON.stringify(next); localStorage.setItem(KEY, raw); savedRaw = raw; state = next;
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, {detail: {updatedAt: next.updatedAt}}));
}
function loadState() {
  try {
    savedRaw = localStorage.getItem(KEY); const parsed = savedRaw ? JSON.parse(savedRaw) : null;
    const next = migrateState(parsed);
    const migrated = !!parsed && parsed.version !== STATE_VERSION;
    if (migrated && !localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, savedRaw);
    const rolled = rollover(next); persist(next, {touch: migrated || rolled || !parsed, notify: false}); storageBlocked = false;
  } catch (error) { storageBlocked = true; state ||= emptyState(); message(`저장 중단: ${error.message} 원본을 덮어쓰지 않았습니다.`, true); }
}
function isPast() { return selectedWeek && selectedWeek !== state.currentWeek; }
function viewData() { return isPast() ? state.weeklyHistory[selectedWeek] : state; }
function transaction(change) {
  if (storageBlocked) { message('저장소를 사용할 수 없습니다. 백업을 내려받고 새로고침해 주세요.', true); return false; }
  if (isPast()) { message('과거 주차는 읽기 전용입니다. 이번 주로 돌아와 주세요.', true); return false; }
  try {
    if (localStorage.getItem(KEY) !== savedRaw) { loadState(); render(); message('다른 탭의 변경을 불러왔습니다. 확인 후 다시 입력해 주세요.', true); return false; }
    const next = copy(state), changedWeek = rollover(next); change(next); persist(next); selectedWeek = '';
    render(); message(changedWeek ? '지난 주를 마감하고 이번 주에 저장했습니다.' : '이 기기에 저장했습니다.'); return true;
  } catch (error) { message(`저장하지 못했습니다: ${error.message}`, true); return false; }
}
function checkWeek() {
  if (storageBlocked) return;
  try {
    if (localStorage.getItem(KEY) !== savedRaw) { loadState(); render(); return; }
    const next = copy(state); if (rollover(next)) { persist(next); render(); message('지난 주 기록을 보관하고 새 주차를 시작했습니다.'); }
  } catch (error) { message(`주차 마감을 저장하지 못했습니다: ${error.message}`, true); }
}
function applyCloudState(raw) {
  if (storageBlocked) throw new Error('로컬 저장소를 사용할 수 없어 클라우드 데이터를 적용할 수 없습니다.');
  const next = migrateState(raw), rolled = rollover(next);
  persist(next, {touch: rolled, notify: rolled});
  selectedWeek = ''; selectedBossCharacterId = '';
  renderIncomeForm(true); render();
  message(rolled ? '클라우드 데이터를 불러오고 새 주차를 시작했습니다.' : '클라우드의 최신 데이터를 반영했습니다.');
  return copy(state);
}
function option(value, text, selected = false) { return `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(text)}</option>`; }
function money(value) { return `<span title="${won(value)} 메소">${koreanMeso(value)}</span>`; }
function presetOptions(selected = '') {
  return Object.entries(presetGroups).map(([key, p]) => option(key, p.name, key === selected)).join('') + state.presets.map(p => option(`user:${p.id}`, p.name, `user:${p.id}` === selected)).join('');
}
function presetConfig(value) {
  if (value.startsWith('user:')) return copy(state.presets.find(p => p.id === value.slice(5))?.bosses || []);
  return copy(presetGroups[value]?.bosses || []);
}
function applyPresetBosses(existingBosses, settings, mode = 'add') {
  const incoming = normalizeBosses(settings.map(makeBoss)).map(b => ({...b, done: false}));
  if (mode === 'replace') return incoming;
  const existing = new Set(existingBosses.map(b => b.bossId || bossIdFor(b.name)));
  return [...existingBosses, ...incoming.filter(b => !existing.has(b.bossId))];
}
function selectedCharacter(data = viewData()) {
  const list = data.characters || [];
  if (!list.some(c => c.id === selectedBossCharacterId)) selectedBossCharacterId = list[0]?.id || '';
  return list.find(c => c.id === selectedBossCharacterId) || null;
}
function currentCharacterIndex() { return state.characters.findIndex(c => c.id === selectedBossCharacterId); }
function bossApiBadge(boss) {
  if (boss.apiCompleted && boss.manualOverride === false) return '<small class="api-badge manual">API 완료 · 수동 미완료</small>';
  if (boss.completionSource === 'nexon-api') return '<small class="api-badge">API 확인</small>';
  return '';
}
function render() {
  if (selectedWeek && !state.weeklyHistory[selectedWeek]) selectedWeek = '';
  const data = viewData(), totals = isPast() ? snapshotTotals(data) : totalsFor(state), current = totalsFor(state);
  $('#headerTotal').textContent = koreanMeso(current.total + Object.values(state.weeklyHistory).reduce((sum, s) => sum + snapshotTotals(s).total, 0));
  $('#headerWeek').textContent = koreanMeso(current.total); $('#weekLabel').textContent = shortWeek(state.currentWeek);
  $('#weekSelect').innerHTML = option('', `이번 주 · ${shortWeek(state.currentWeek)}`, !isPast()) + Object.keys(state.weeklyHistory).sort().reverse().map(key => option(key, `${key.slice(0, 4)} · ${validWeek(key) ? shortWeek(key) : key}`, key === selectedWeek)).join('');
  $('#weekStatus').textContent = isPast() ? '마감한 주차 · 읽기 전용' : '진행 중 · 현지 시간 목요일 00:00 자동 마감';
  $('#returnCurrent').classList.toggle('hidden', !isPast());
  $('#summaryTitle').textContent = isPast() ? '조회 주차 수익' : '이번 주 수익';
  $('#totalIncome').textContent = koreanMeso(totals.total); $('#totalIncomeText').textContent = `${won(totals.total)} 메소`;
  $('#metrics').innerHTML = Object.entries(labels).map(([key, label]) => `<div class="metric"><small>${label}</small><b>${money(totals[key])}</b></div>`).join('');
  $('#characterList').innerHTML = (data.characters || []).map(c => {
    const s = characterStats(c), percent = s.count ? Math.round(s.done / s.count * 100) : 0;
    return `<button type="button" class="character" data-character="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.name)} 주간 보스 관리"><span class="character-main"><span><b>${escapeHtml(c.name)}</b><small>${s.done} / ${s.count} 완료 · 진행률 ${percent}%</small></span><strong class="character-income mint">${money(s.earned)}</strong></span><span class="character-detail"><progress value="${s.done}" max="${s.count || 1}" aria-label="${escapeHtml(c.name)} 보스 진행률"></progress><dl><div><dt>완료 수익</dt><dd>${money(s.earned)}</dd></div><div><dt>예상 수익</dt><dd>${money(s.expected)}</dd></div><div><dt>남은 수익</dt><dd>${money(s.remaining)}</dd></div></dl></span></button>`;
  }).join('') || '<p class="empty">저장된 캐릭터가 없습니다.</p>';
  $('#addCharacter').disabled = !!isPast() || storageBlocked; $('#incomeFields').disabled = !!isPast() || storageBlocked;
  $('#incomeReadOnly').classList.toggle('hidden', !isPast()); $('#resetAll').disabled = !!isPast(); $('#resetWeek').disabled = !!isPast();
  renderBosses(data); renderHistory(data); renderPrices(); renderSettings();
  $('#migrationNote').textContent = state.migrationNote || '기존 기록과 캐릭터 설정을 이 기기에 보관합니다.';
  const recovery = (state.unassignedIncomes?.length || 0) + (state.recoveredWeeks?.length || 0);
  $('#recoveryNote').textContent = recovery ? `마감 기록과 겹칠 수 있는 이전 데이터 ${recovery}건은 중복 합산 없이 백업에 별도 보관했습니다.` : '';
  if (!$('#characterDialog').open) $('#characterPreset').innerHTML = presetOptions();
  if (!$('#presetDialog').open) $('#presetSelect').innerHTML = presetOptions();
}
function renderBosses(data) {
  const disabled = isPast() || storageBlocked ? 'disabled' : '';
  const characters = data.characters || [], c = selectedCharacter(data), ci = c ? characters.findIndex(x => x.id === c.id) : -1;
  $('#bossCharacterSelect').innerHTML = characters.map(character => option(character.id, character.name, character.id === c?.id)).join('');
  $('#bossCharacterSelect').disabled = !characters.length;
  $('#addCharacterFromBoss').disabled = !!disabled;
  $('#characterMenu').classList.toggle('hidden', !c || !!disabled);
  if (!c) { $('#bossEditor').innerHTML = '<p class="empty">캐릭터를 추가해 주세요.</p>'; return; }
  const list = normalizeBosses(c.bosses), stats = characterStats(c);
  const shown = list.map((b, bi) => ({b, bi})).filter(({b}) => bossFilter === 'all' || (bossFilter === 'done' ? b.done : !b.done));
  $('#bossEditor').innerHTML = `<section class="boss-char" data-ci="${ci}"><div class="panel-head"><div><h3>${escapeHtml(c.name)}</h3><small class="muted">${stats.done} / ${stats.count} 완료 · ${koreanMeso(stats.earned)}</small></div></div>${shown.map(({b, bi}) => {
    const diffs = Object.keys(bossDB[b.name] || {[b.difficulty]: b.price});
    return `<div class="boss-line ${b.done ? 'completed' : ''}" data-bi="${bi}"><label class="boss-name"><input type="checkbox" data-field="done" aria-label="${escapeHtml(b.name)} 완료" ${b.done ? 'checked' : ''} ${disabled}><span>${escapeHtml(b.name)}${bossApiBadge(b)}</span></label><strong class="boss-earned mint">${money(b.done && b.completedIncome != null ? b.completedIncome : bossValue(b))}</strong><div class="boss-controls"><select data-field="difficulty" aria-label="${escapeHtml(b.name)} 난이도" ${disabled}>${diffs.map(d => option(d, d, d === b.difficulty)).join('')}</select><select data-field="party" aria-label="${escapeHtml(b.name)} 파티 인원" ${disabled}>${Array.from({length: Math.max(6, b.party)}, (_, i) => option(i + 1, i === 0 ? '솔로' : `${i + 1}인`, i + 1 === b.party)).join('')}</select><button class="icon danger" data-action="remove-boss" aria-label="${escapeHtml(b.name)} 삭제" ${disabled}>×</button></div><details class="boss-price-detail"><summary>결정석 ${won(b.price)} · 가격 수정</summary><label>결정석 전체 가격<input class="money-input" data-field="price" inputmode="numeric" value="${won(b.price)}" ${disabled}><small class="money-hint">${koreanMeso(b.price)} 메소</small></label></details></div>`;
  }).join('') || '<p class="empty">이 필터에 해당하는 보스가 없습니다.</p>'}<div class="boss-actions"><button class="ghost" data-action="add-boss" ${disabled}>+ 보스 등록</button></div></section>`;
}
function historyDate(row) {
  const date = row.createdAt ? new Date(row.createdAt) : null;
  if (!date || Number.isNaN(date.getTime())) return row.date || '';
  const now = new Date(), sameDay = dateKey(date) === dateKey(now);
  return `${sameDay ? '오늘' : `${date.getMonth() + 1}월 ${date.getDate()}일`} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function historyMatches(row) {
  const kind = recordKind(row);
  if (historyFilter === 'all') return true;
  if (historyFilter === 'sold') return kind === 'sold';
  if (historyFilter === 'unsold') return kind === 'acquired';
  return row.category === historyFilter;
}
function renderHistory(data) {
  const rows = (data.incomes || []).map((row, index) => ({row, index})).filter(({row}) => historyMatches(row)).sort((a, b) => n(b.row.createdAt) - n(a.row.createdAt) || b.index - a.index);
  $('#incomeHistory').innerHTML = rows.map(({row: r}) => {
    const kind = recordKind(r), value = incomeValue(r), qty = won(r.qty ?? r.quantity);
    const detail = kind === 'income' ? `${value >= 0 ? '+' : ''}${won(value)} 메소` : kind === 'acquired' ? `${qty}개 · 미판매` : `${qty}개 판매${n(r.materialCost) ? ` · 소재비 ${won(r.materialCost)}` : ''}`;
    const disabled = isPast() || storageBlocked;
    return `<article class="history-item compact-record"><div class="record-copy"><b>${escapeHtml(labels[r.category] || r.categoryLabel || '기타')} · ${escapeHtml(r.item)}</b><p class="${kind === 'acquired' ? 'pending' : value < 0 ? 'negative' : 'mint'}">${escapeHtml(detail)}</p><small class="muted">${escapeHtml(historyDate(r))}${r.memo ? ` · ${escapeHtml(r.memo)}` : ''}</small></div>${kind === 'sold' ? `<strong class="${value < 0 ? 'negative' : 'mint'}">${value >= 0 ? '+' : ''}${koreanMeso(value)}</strong>` : ''}<details class="more-menu record-more ${disabled ? 'hidden' : ''}"><summary aria-label="${escapeHtml(r.item)} 기록 메뉴">⋯</summary><div class="more-menu-popover"><button type="button" data-income-action="edit" data-income-id="${escapeHtml(r.id)}">수정</button><button type="button" class="danger-text" data-income-action="delete" data-income-id="${escapeHtml(r.id)}">삭제</button></div></details></article>`;
  }).join('') || '<p class="empty">이 필터에 해당하는 기록이 없습니다.</p>';
}
function renderPrices() {
  $('#priceList').innerHTML = Object.entries(state.settings.itemPrices || {}).map(([name, price]) => `<div class="history-item"><b>${escapeHtml(name)}</b><span>${money(price)}</span></div>`).join('') || '<p class="empty">판매를 기록하면 최근 단가가 여기에 표시됩니다.</p>';
}
function nexonCheckedLabel(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}) : '확인 전';
}
function nexonDiagnosticGroups(result) {
  return {
    unknownName: result?.unknown || [],
    difficultyMismatch: result?.difficultyMismatch || [],
    ambiguous: result?.ambiguous || [],
    localMissing: result?.notConfigured || [],
    apiMissing: result?.localNotFound || []
  };
}
function diagnosticRawLabel(value, type) {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return `${type || typeof value}: ${text}`;
}
function diagnosticEntryLabel(key, item) {
  const name = item.contentName || item.name || item.bossId || '(이름 없음)';
  if (key === 'difficultyMismatch') return `${name} · API ${item.apiDifficulty || '(없음)'} · 로컬 ${(item.localDifficulties || []).join(', ') || '(없음)'}`;
  if (key === 'ambiguous') return `${name} · 로컬 ${(item.localDifficulties || []).join(', ') || '(없음)'}`;
  return `${name}${item.difficulty ? ` · ${item.difficulty}` : ''}`;
}
function renderNexonDiagnostics() {
  const details = $('#nexonDiagnostics'), content = $('#nexonDiagnosticsContent');
  if (!details || !content) return;
  const result = nexonApiState.diagnostics;
  details.classList.toggle('hidden', !result);
  if (!result) { content.innerHTML = ''; return; }
  const groups = nexonDiagnosticGroups(result);
  const samples = (result.diagnosticSamples || []).slice(0, 20);
  const summary = `조회 ${result.fetched || 0} · 완료 ${result.apiCompleted || 0} · 매칭 ${result.matched || 0} · 실패 ${nexonDiagnosticFailureCount(result)}`;
  const sampleHtml = samples.map(item => `<article class="nexon-diagnostic-item"><b>${escapeHtml(item.contentName || '(content_name 없음)')}</b><p>difficulty: ${escapeHtml(item.difficulty || '(없음)')} · cycle: ${escapeHtml(item.cycle || '(없음)')}</p><p>registered: ${escapeHtml(String(item.registered))} <small>(${escapeHtml(diagnosticRawLabel(item.rawRegistrationValue, item.rawRegistrationType))})</small></p><p>complete: ${escapeHtml(String(item.complete))} <small>(${escapeHtml(diagnosticRawLabel(item.rawCompleteValue, item.rawCompleteType))})</small></p></article>`).join('');
  const groupHtml = Object.entries(groups).filter(([, items]) => items.length).map(([key, items]) => `<section class="nexon-diagnostic-group"><b>${escapeHtml(key)} ${items.length}</b><ul>${items.slice(0, 20).map(item => `<li>${escapeHtml(diagnosticEntryLabel(key, item))}</li>`).join('')}</ul>${items.length > 20 ? `<small>외 ${items.length - 20}개</small>` : ''}</section>`).join('');
  content.innerHTML = `<p class="nexon-diagnostic-summary">${escapeHtml(summary)}</p>${sampleHtml ? `<div class="nexon-diagnostic-samples">${sampleHtml}</div>` : '<p class="muted">응답 샘플이 없습니다.</p>'}${groupHtml || '<p class="mint nexon-diagnostic-empty">매칭 실패 분류가 없습니다.</p>'}`;
}
function renderNexonSettings() {
  const list = $('#nexonCharacterList');
  if (!list) return;
  const disabled = isPast() || storageBlocked ? 'disabled' : '';
  list.innerHTML = state.characters.map(character => {
    const link = character.nexonCharacter;
    const linked = !!link?.ocid;
    const detail = linked ? `${escapeHtml(link.characterName || '')}${link.world ? ` · ${escapeHtml(link.world)}` : ''}<small>마지막 확인 ${escapeHtml(nexonCheckedLabel(link.lastCheckedAt))}</small>` : '<span class="muted">연동되지 않음</span>';
    return `<div class="nexon-character-row" data-nexon-character="${escapeHtml(character.id)}"><div><b>${escapeHtml(character.name)}</b><p>${detail}</p></div><div><button type="button" class="ghost" data-nexon-action="link" ${disabled}>${linked ? '변경' : '연동'}</button>${linked ? `<button type="button" class="text-button" data-nexon-action="unlink" ${disabled}>해제</button>` : ''}</div></div>`;
  }).join('') || '<p class="empty">먼저 캐릭터를 추가해주세요.</p>';
  const status = $('#nexonApiStatus');
  status.textContent = nexonApiState.message;
  status.className = nexonApiState.status === 'error' ? 'negative' : nexonApiState.status === 'checking' ? 'pending' : nexonApiState.status === 'ok' ? 'mint' : 'muted';
  const button = $('#checkNexonBosses');
  button.disabled = nexonApiState.status === 'checking' || isPast() || storageBlocked || !state.characters.some(character => character.nexonCharacter?.ocid);
  renderNexonDiagnostics();
}
function renderSettings() {
  $('#presetManager').innerHTML = state.presets.map(preset => `<div class="preset-row" data-preset-id="${escapeHtml(preset.id)}"><div><b>${escapeHtml(preset.name)}</b><small class="muted">보스 ${preset.bosses.length}개</small></div><div><button class="ghost" type="button" data-preset-action="rename">이름 변경</button><button class="ghost danger-text" type="button" data-preset-action="delete">삭제</button></div></div>`).join('') || '<p class="empty">저장한 사용자 프리셋이 없습니다.</p>';
  renderNexonSettings();
}

async function fetchNexonScheduler(character, characterName = '', requestDate = '') {
  const params = new URLSearchParams();
  if (characterName) params.set('characterName', characterName);
  else params.set('ocid', character.nexonCharacter.ocid);
  if (requestDate) params.set('date', requestDate);
  const response = await fetch('/api/nexon-scheduler?' + params);
  let data;
  try { data = await response.json(); } catch { throw new Error('NEXON API 응답을 읽지 못했습니다.'); }
  if (!response.ok || !data?.ok) throw new Error(data?.message || 'NEXON 보스 기록을 확인하지 못했습니다.');
  return data;
}
function nexonDiagnosticFailureCount(result) {
  return Object.values(nexonDiagnosticGroups(result)).slice(0, 4).reduce((sum, items) => sum + items.length, 0);
}
function nexonDiagnosticMessage(result) {
  const parts = [`NEXON 조회 ${result.fetched || 0}개`, `완료 ${result.apiCompleted || 0}개`, `메기 매칭 ${result.matched || 0}개`, `자동 완료 ${result.autoCompleted || 0}개`];
  const failures = nexonDiagnosticFailureCount(result);
  if (failures) parts.push(`매칭 실패 ${failures}개`);
  return parts.join(' · ');
}
async function syncNexonCharacter(characterId, {characterName = '', requestDate = '', ignoreCooldown = false} = {}) {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) throw new Error('메기 캐릭터를 찾을 수 없습니다.');
  if (!characterName && !character.nexonCharacter?.ocid) throw new Error('먼저 NEXON 캐릭터를 연동해주세요.');
  const lastChecked = Date.parse(character.nexonCharacter?.lastCheckedAt || '');
  if (!characterName && !ignoreCooldown && !Number.isNaN(lastChecked) && Date.now() - lastChecked < NEXON_CHECK_COOLDOWN_MS) return {cooldown: true, character: character.name};
  const response = await fetchNexonScheduler(character, characterName, requestDate);
  let applied, applyError;
  const saved = transaction(next => {
    try { applied = applyNexonSchedulerState(next, characterId, response, response.fetchedAt); }
    catch (error) { applyError = error; throw error; }
  });
  if (!saved) throw applyError || new Error('NEXON 확인 결과를 이 기기에 저장하지 못했습니다.');
  const result = {...applied, diagnosticSamples: Array.isArray(response.diagnostics?.samples) ? response.diagnostics.samples.slice(0, 20) : [], character: character.name};
  console.info('NEXON scheduler sync diagnostics', result);
  return result;
}
async function syncAllNexonCharacters() {
  if (nexonApiState.status === 'checking') return;
  if (isPast()) { nexonApiState = {status: 'error', message: '과거 주차는 읽기 전용입니다. 이번 주로 돌아와주세요.'}; renderNexonSettings(); return; }
  const linked = state.characters.filter(character => character.nexonCharacter?.ocid);
  if (!linked.length) { nexonApiState = {status: 'error', message: '연동된 NEXON 캐릭터가 없습니다.'}; renderNexonSettings(); return; }
  nexonApiState = {status: 'checking', message: '보스 기록 확인 중…', diagnostics: null}; renderNexonSettings();
  let checked = 0, cooldown = 0;
  const total = {fetched: 0, apiCompleted: 0, matched: 0, autoCompleted: 0, unknown: [], difficultyMismatch: [], ambiguous: [], notConfigured: [], localNotFound: [], diagnosticSamples: []};
  try {
    for (const character of linked) {
      const result = await syncNexonCharacter(character.id);
      if (result.cooldown) cooldown++;
      else {
        checked++;
        for (const key of ['fetched', 'apiCompleted', 'matched', 'autoCompleted']) total[key] += result[key] || 0;
        for (const key of ['unknown', 'difficultyMismatch', 'ambiguous', 'notConfigured', 'localNotFound']) total[key].push(...(result[key] || []));
        total.diagnosticSamples.push(...(result.diagnosticSamples || []).slice(0, Math.max(0, 20 - total.diagnosticSamples.length)));
      }
    }
    const summary = checked ? nexonDiagnosticMessage(total) : '최근 확인 후 1분 이내라 다시 조회하지 않았습니다.';
    nexonApiState = {status: 'ok', message: cooldown && checked ? `${summary} · 쿨다운 ${cooldown}개` : summary, diagnostics: checked ? total : null};
  } catch (error) {
    nexonApiState = {status: 'error', message: error.message, diagnostics: null};
  }
  renderNexonSettings();
}
function renderIncomeForm(resetItems = false) {
  const category = $('#incomeCategory').value;
  if (resetItems || !$('#incomeItem').options.length) $('#incomeItem').innerHTML = items[category].map(item => option(item, item)).join('');
  const meso = $('#incomeItem').value === '메소', acquired = !meso && state.saleState !== 'sold';
  for (const [id, hide] of Object.entries({mesoWrap: !meso, qtyWrap: meso, priceWrap: meso || acquired, saleStateWrap: meso, costWrap: meso || acquired, sourceWrap: meso || !acquired, incomeResult: acquired, customItemWrap: category !== 'drop'})) {
    $('#' + id).classList.toggle('hidden', hide);
    // Hidden numeric fields must not block a different record type's native validation.
    $$('#' + id + ' input').forEach(input => { input.disabled = hide; });
  }
  $$('[data-sale]').forEach(b => { b.classList.toggle('active', b.dataset.sale === (state.saleState === 'sold' ? 'sold' : 'acquired')); b.setAttribute('aria-pressed', b.classList.contains('active')); });
  $('#incomeSubmit').textContent = meso ? '메소 수익 기록' : acquired ? '획득 기록 추가' : '판매 수익 기록'; updateIncomePreview();
}
function incomeDraft() {
  const category = $('#incomeCategory').value, item = category === 'drop' ? $('#customItem').value.trim() || $('#incomeItem').value : $('#incomeItem').value;
  const meso = category === 'hunt' && item === '메소';
  return {category, item, kind: meso ? 'income' : state.saleState === 'sold' ? 'sold' : 'acquired', amount: n($('#mesoAmount').value), qty: n($('#incomeQty').value), price: n($('#incomePrice').value), materialCost: n($('#materialCost').value)};
}
function updateIncomePreview() {
  const d = incomeDraft(), gross = d.kind === 'income' ? d.amount : d.qty * d.price, cost = d.kind === 'sold' ? d.materialCost : 0;
  $('#incomeResultValue').textContent = `${koreanMeso(gross - cost)} 메소`; $('#incomeResultLabel').textContent = d.kind === 'income' ? '즉시 반영할 수익' : '판매 순수익';
  $('#incomeResultDetail').textContent = d.kind === 'sold' ? `판매액 ${won(gross)} − 소재비 ${won(cost)}` : `${won(gross)} 메소`;
}
function formatMoneyInput(input) {
  const count = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length, digits = input.value.replace(/\D/g, '');
  input.value = digits ? won(digits) : ''; let position = 0, seen = 0;
  while (position < input.value.length && seen < count) { if (/\d/.test(input.value[position])) seen++; position++; }
  input.setSelectionRange(position, position);
  const hint = input.parentElement.querySelector('.money-hint'); if (hint) hint.textContent = digits ? `${koreanMeso(digits)} 메소` : '';
}
function renderDirectBosses() {
  $('#customBosses').innerHTML = Object.entries(bossDB).map(([name, prices]) => {
    const difficulty = Object.keys(prices)[0];
    return `<div class="direct-boss-row" data-direct-boss="${escapeHtml(bossIdFor(name))}"><label><input type="checkbox" value="${escapeHtml(bossIdFor(name))}"><span>${escapeHtml(name)}</span></label><select data-direct-field="difficulty" aria-label="${escapeHtml(name)} 난이도">${Object.keys(prices).map(value => option(value, value, value === difficulty)).join('')}</select><select data-direct-field="partySize" aria-label="${escapeHtml(name)} 파티 인원">${Array.from({length: 6}, (_, i) => option(i + 1, i ? `${i + 1}인` : '솔로', i === 0)).join('')}</select></div>`;
  }).join('');
}
function updateCharacterCreateUI() {
  const direct = characterMode === 'direct';
  $('#characterPresetWrap').classList.toggle('hidden', direct);
  $('#customBosses').classList.toggle('hidden', !direct);
  const count = direct ? $$('#customBosses input[type="checkbox"]:checked').length : presetConfig($('#characterPreset').value).length;
  $('#characterBossCount').textContent = `포함 보스 ${count}개`;
  $$('[data-character-mode]').forEach(button => {
    const active = button.dataset.characterMode === characterMode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
}
function openCharacterDialog() {
  $('#characterForm').reset(); $('#characterPreset').innerHTML = presetOptions('middle'); characterMode = 'preset';
  renderDirectBosses(); updateCharacterCreateUI(); $('#characterDialog').showModal(); $('#characterName').focus();
}
function selectedDirectBosses() {
  return $$('#customBosses [data-direct-boss]').filter(row => row.querySelector('input').checked).map(row => ({
    bossId: row.dataset.directBoss,
    difficulty: row.querySelector('[data-direct-field="difficulty"]').value,
    partySize: n(row.querySelector('[data-direct-field="partySize"]').value)
  }));
}
function updateBossDialogOptions() {
  const name = $('#bossToAdd').value, difficulties = Object.keys(bossDB[name] || {});
  $('#bossDifficulty').innerHTML = difficulties.map(value => option(value, value)).join('');
  $('#bossPartySize').innerHTML = Array.from({length: 6}, (_, i) => option(i + 1, i ? `${i + 1}인` : '솔로', i === 0)).join('');
}
function openPresetDialog() {
  if (currentCharacterIndex() < 0) return;
  $('#presetSelect').innerHTML = presetOptions('middle'); presetApplyMode = 'add';
  $$('[data-preset-mode]').forEach(button => { const active = button.dataset.presetMode === 'add'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  $('#presetReplaceWarning').classList.add('hidden'); $('#presetDialog').showModal();
}
function saveCurrentPreset() {
  const ci = currentCharacterIndex(), c = state.characters[ci]; if (!c) return;
  const name = prompt('저장할 프리셋 이름', `${c.name} 구성`)?.trim(); if (!name) return;
  transaction(next => {
    const bosses = next.characters[ci].bosses.map(presetEntry).filter(Boolean);
    next.presets.push({id: uid(), name, bosses});
  });
}
function openBossDialog(ci) {
  const c = state.characters[ci], available = Object.keys(bossDB).filter(name => !c.bosses.some(b => b.name === name));
  if (!available.length) { message('등록할 수 있는 보스가 모두 추가되어 있습니다.'); return; }
  $('#bossDialog').dataset.ci = ci; $('#bossToAdd').innerHTML = available.map(name => option(name, name)).join(''); updateBossDialogOptions(); $('#bossDialog').showModal();
}
function downloadBackup(original = false) {
  const raw = original ? localStorage.getItem(BACKUP_KEY) || localStorage.getItem(KEY) : storageBlocked ? localStorage.getItem(KEY) : JSON.stringify(state, null, 2);
  const url = URL.createObjectURL(new Blob([raw || '{}'], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `maple-income-${original ? 'original-' : ''}${dateKey(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function validateImportedState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('백업 최상위 형식이 올바르지 않습니다.');
  if (!Array.isArray(data.characters) || !Array.isArray(data.incomes)) throw new Error('캐릭터 또는 수익 기록 배열이 없습니다.');
  if (!data.weeklyHistory || typeof data.weeklyHistory !== 'object' || Array.isArray(data.weeklyHistory)) throw new Error('과거 주차 데이터 형식이 올바르지 않습니다.');
  if (!Array.isArray(data.presets) || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('설정 또는 프리셋 형식이 올바르지 않습니다.');
  for (const character of data.characters) if (!character || typeof character.name !== 'string' || !Array.isArray(character.bosses)) throw new Error('손상된 캐릭터 데이터가 있습니다.');
  for (const row of data.incomes) if (!row || typeof row !== 'object' || typeof row.item !== 'string') throw new Error('손상된 수익 기록이 있습니다.');
  for (const preset of data.presets) if (!preset || typeof preset.name !== 'string' || !Array.isArray(preset.bosses)) throw new Error('손상된 사용자 프리셋이 있습니다.');
  return true;
}
function prepareImportedState(text, now = new Date()) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽을 수 없습니다.'); }
  const migrated = migrateState(parsed, now); validateImportedState(migrated); validatePresetIntegrity();
  return migrated;
}
function resetCurrentWeek(data) {
  data.incomes = [];
  data.characters.forEach(character => character.bosses.forEach(resetBossWeeklyState));
  return data;
}
function openIncomeEdit(id) {
  const row = state.incomes.find(item => item.id === id); if (!row || isPast()) return;
  editingIncomeId = id; editSaleState = recordKind(row) === 'sold' ? 'sold' : 'acquired';
  const meso = recordKind(row) === 'income';
  $('#incomeEditLabel').textContent = `${labels[row.category] || row.categoryLabel || '기타'} · ${row.item}`;
  $('#editCategory').value = row.category || 'drop'; $('#editItem').value = row.item || '';
  $('#editAmount').value = meso ? won(row.amount ?? row.netIncome) : '';
  $('#editQty').value = meso ? 1 : n(row.qty ?? row.quantity) || 1;
  $('#editPrice').value = editSaleState === 'sold' ? won(row.price ?? row.unitPrice) : '';
  $('#editCost').value = editSaleState === 'sold' ? won(row.materialCost) : '';
  $('#editSource').value = row.source || ''; $('#editMemo').value = row.memo || '';
  $('#incomeEditDialog').dataset.meso = meso ? 'true' : 'false'; updateIncomeEditUI(); $('#incomeEditDialog').showModal();
}
function updateIncomeEditUI() {
  const meso = $('#incomeEditDialog').dataset.meso === 'true', sold = editSaleState === 'sold';
  for (const [id, hide] of Object.entries({editCategoryWrap: meso, editItemWrap: meso, editSaleStateWrap: meso, editAmountWrap: !meso, editQtyWrap: meso, editPriceWrap: meso || !sold, editCostWrap: meso || !sold, editSourceWrap: meso || sold, editMemoWrap: meso})) $('#' + id).classList.toggle('hidden', hide);
  $$('[data-edit-sale]').forEach(button => { const active = button.dataset.editSale === editSaleState; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
}
function saveIncomeEdit() {
  const index = state.incomes.findIndex(row => row.id === editingIncomeId); if (index < 0) return false;
  const current = state.incomes[index], meso = recordKind(current) === 'income';
  const amount = n($('#editAmount').value), qty = n($('#editQty').value), price = n($('#editPrice').value), materialCost = n($('#editCost').value);
  if (meso ? !Number.isSafeInteger(amount) || amount <= 0 : !Number.isSafeInteger(qty) || qty < 1) { message('금액 또는 수량을 올바르게 입력해 주세요.', true); return false; }
  if (!meso && editSaleState === 'sold' && (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(materialCost) || materialCost < 0 || !Number.isSafeInteger(qty * price))) { message('판매가와 소재비를 올바르게 입력해 주세요.', true); return false; }
  return transaction(next => {
    const row = next.incomes[index]; row.memo = $('#editMemo').value.trim();
    if (meso) Object.assign(row, {amount, netIncome: amount, recordType: 'income', saleState: 'direct'});
    else {
      const category = $('#editCategory').value, item = $('#editItem').value.trim(); if (!item) throw new Error('아이템명을 입력해 주세요.');
      Object.assign(row, {category, categoryLabel: labels[category], item, qty, quantity: qty, recordType: editSaleState, saleState: editSaleState});
      delete row.amount; delete row.grossIncome;
      if (editSaleState === 'acquired') { Object.assign(row, {netIncome: 0, source: $('#editSource').value.trim()}); delete row.price; delete row.unitPrice; delete row.materialCost; }
      else { Object.assign(row, {price, unitPrice: price, materialCost, grossIncome: qty * price, netIncome: qty * price - materialCost}); delete row.source; (next.settings.itemPrices ||= {})[item] = price; }
    }
  });
}
function init() {
  validatePresetIntegrity();
  loadState(); renderIncomeForm(true); render(); if (!storageBlocked) message('이 기기에 자동 저장됩니다.');
  $('#weekSelect').addEventListener('change', e => { selectedWeek = e.target.value; render(); });
  $('#returnCurrent').addEventListener('click', () => { selectedWeek = ''; render(); });
  $('#characterList').addEventListener('click', e => {
    const card = e.target.closest('[data-character]'); if (!card) return;
    selectedBossCharacterId = card.dataset.character; $('[data-tab="boss"]').click(); renderBosses(viewData());
  });
  $$('[data-tab]').forEach(button => button.addEventListener('click', () => {
    $$('[data-tab]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-current', b === button ? 'page' : 'false'); });
    $$('[data-page]').forEach(page => page.classList.toggle('hidden', page.dataset.page !== button.dataset.tab)); checkWeek();
  }));
  $$('[data-open-income]').forEach(b => b.addEventListener('click', () => $('[data-tab="income"]').click()));
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    bossFilter = button.dataset.filter; $$('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', b === button); }); renderBosses(viewData());
  }));
  $$('[data-history-filter]').forEach(button => button.addEventListener('click', () => {
    historyFilter = button.dataset.historyFilter;
    $$('[data-history-filter]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', active); });
    renderHistory(viewData());
  }));
  $('#addCharacter').addEventListener('click', openCharacterDialog);
  $('#addCharacterFromBoss').addEventListener('click', openCharacterDialog);
  $('#checkNexonBosses').addEventListener('click', syncAllNexonCharacters);
  $('#nexonCharacterList').addEventListener('click', async e => {
    const button = e.target.closest('[data-nexon-action]'); if (!button || nexonApiState.status === 'checking') return;
    const row = button.closest('[data-nexon-character]'), character = state.characters.find(item => item.id === row?.dataset.nexonCharacter);
    if (!character) return;
    if (button.dataset.nexonAction === 'unlink') {
      if (confirm(`${character.name}의 NEXON 캐릭터 연동을 해제할까요? 이미 확인된 이번 주 보스 완료 상태는 유지됩니다.`)) transaction(next => { delete next.characters.find(item => item.id === character.id).nexonCharacter; });
      return;
    }
    const characterName = prompt('연동할 NEXON 메이플스토리 캐릭터명', character.nexonCharacter?.characterName || character.name)?.trim();
    if (!characterName) return;
    nexonApiState = {status: 'checking', message: `${character.name} 연동 확인 중…`, diagnostics: null}; renderNexonSettings();
    try {
      const result = await syncNexonCharacter(character.id, {characterName});
      nexonApiState = {status: 'ok', message: nexonDiagnosticMessage(result), diagnostics: result};
    } catch (error) {
      nexonApiState = {status: 'error', message: error.message, diagnostics: null};
    }
    renderNexonSettings();
  });
  $('#bossCharacterSelect').addEventListener('change', e => { selectedBossCharacterId = e.target.value; renderBosses(viewData()); });
  $$('[data-character-mode]').forEach(button => button.addEventListener('click', () => { characterMode = button.dataset.characterMode; updateCharacterCreateUI(); }));
  $('#characterPreset').addEventListener('change', updateCharacterCreateUI);
  $('#customBosses').addEventListener('change', updateCharacterCreateUI);
  $$('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).close()));
  $('#characterForm').addEventListener('submit', e => {
    e.preventDefault(); const name = $('#characterName').value.trim(); if (!name) return;
    const settings = characterMode === 'direct' ? selectedDirectBosses() : presetConfig($('#characterPreset').value);
    if (!settings.length) { message('보스를 한 개 이상 선택해 주세요.', true); return; }
    const bosses = normalizeBosses(settings.map(makeBoss));
    bosses.forEach(b => { b.done = false; delete b.completedIncome; });
    const id = uid(), previousCharacterId = selectedBossCharacterId; selectedBossCharacterId = id;
    if (transaction(next => next.characters.push({id, name, bosses}))) { $('#characterForm').reset(); $('#characterDialog').close(); }
    else selectedBossCharacterId = previousCharacterId;
  });
  $$('[data-preset-mode]').forEach(button => button.addEventListener('click', () => {
    presetApplyMode = button.dataset.presetMode;
    $$('[data-preset-mode]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', active); });
    $('#presetReplaceWarning').classList.toggle('hidden', presetApplyMode !== 'replace');
  }));
  $('#presetForm').addEventListener('submit', e => {
    e.preventDefault(); const ci = currentCharacterIndex(), settings = presetConfig($('#presetSelect').value);
    if (ci < 0 || !settings.length) return;
    if (presetApplyMode === 'replace' && !confirm('현재 보스 구성을 선택한 프리셋으로 교체할까요? 완료 체크도 초기화됩니다.')) return;
    if (transaction(next => {
      next.characters[ci].bosses = applyPresetBosses(next.characters[ci].bosses, settings, presetApplyMode);
    })) $('#presetDialog').close();
  });
  $('#characterMenu').addEventListener('click', e => {
    const button = e.target.closest('[data-character-action]'); if (!button || isPast()) return;
    const ci = currentCharacterIndex(), c = state.characters[ci]; if (!c) return;
    $('#characterMenu').open = false;
    if (button.dataset.characterAction === 'rename') { const name = prompt('캐릭터 이름', c.name)?.trim(); if (name) transaction(next => { next.characters[ci].name = name; }); }
    if (button.dataset.characterAction === 'apply-preset') openPresetDialog();
    if (button.dataset.characterAction === 'save-preset') saveCurrentPreset();
    if (button.dataset.characterAction === 'delete' && confirm(`${c.name} 캐릭터를 삭제할까요? 현재 주차의 보스 진행 상태도 함께 삭제됩니다.`)) {
      transaction(next => next.characters.splice(ci, 1)); selectedBossCharacterId = state.characters[0]?.id || '';
    }
  });
  $('#bossEditor').addEventListener('change', e => {
    const field = e.target.dataset.field; if (!field) return;
    const ci = n(e.target.closest('[data-ci]').dataset.ci), bi = n(e.target.closest('[data-bi]').dataset.bi), value = field === 'done' ? e.target.checked : e.target.value;
    transaction(next => {
      const b = next.characters[ci].bosses[bi];
      if (field === 'done') { b.done = value; b.manualOverride = value; b.completionSource = 'manual'; if (value) b.completedIncome = bossValue(b); else delete b.completedIncome; }
      else { b[field] = field === 'difficulty' ? value : Math.max(field === 'party' ? 1 : 0, n(value)); if (field === 'party') b.partySize = b.party; if (field === 'difficulty') b.price = referencePrice(b.name, value); resetBossWeeklyState(b); }
    });
  });
  $('#bossEditor').addEventListener('click', e => {
    const button = e.target.closest('[data-action]'); if (!button || isPast()) return;
    const ci = n(button.closest('[data-ci]').dataset.ci), c = state.characters[ci];
    if (button.dataset.action === 'add-boss') openBossDialog(ci);
    if (button.dataset.action === 'remove-boss') { const bi = n(button.closest('[data-bi]').dataset.bi); if (confirm(`${c.name}의 ${c.bosses[bi].name}을 삭제할까요? 이번 주 완료 수익에서도 제외됩니다.`)) transaction(next => next.characters[ci].bosses.splice(bi, 1)); }
  });
  $('#bossToAdd').addEventListener('change', updateBossDialogOptions);
  $('#bossForm').addEventListener('submit', e => { e.preventDefault(); const ci = n($('#bossDialog').dataset.ci), name = $('#bossToAdd').value, difficulty = $('#bossDifficulty').value, partySize = n($('#bossPartySize').value); if (transaction(next => { if (!next.characters[ci].bosses.some(b => b.bossId === bossIdFor(name))) next.characters[ci].bosses.push(makeBoss({bossId: bossIdFor(name), difficulty, partySize})); })) $('#bossDialog').close(); });
  $('#incomeCategory').addEventListener('change', () => { $('#materialCost').value = ''; $('#materialCostHint').textContent = ''; renderIncomeForm(true); });
  $('#incomeItem').addEventListener('change', () => { $('#materialCost').value = ''; $('#materialCostHint').textContent = ''; renderIncomeForm(); });
  $$('[data-sale]').forEach(b => b.addEventListener('click', () => { state.saleState = b.dataset.sale; renderIncomeForm(); }));
  document.addEventListener('input', e => { if (e.target.classList.contains('money-input')) formatMoneyInput(e.target); if (e.target.closest('#incomeForm')) updateIncomePreview(); });
  $('#incomeForm').addEventListener('submit', e => {
    e.preventDefault(); const d = incomeDraft();
    if (d.kind === 'income' ? !Number.isSafeInteger(d.amount) || d.amount <= 0 : !Number.isSafeInteger(d.qty) || d.qty < 1) { message('금액 또는 수량을 올바르게 입력해 주세요.', true); return; }
    if (d.kind === 'sold' && (!Number.isSafeInteger(d.price) || d.price <= 0 || !Number.isSafeInteger(d.materialCost) || d.materialCost < 0 || !Number.isSafeInteger(d.qty * d.price))) { message('판매가와 소재비를 올바르게 입력해 주세요.', true); return; }
    const ok = transaction(next => {
      const row = {id: uid(), date: new Date().toLocaleString('ko-KR'), createdAt: Date.now(), weekId: next.currentWeek, category: d.category, categoryLabel: labels[d.category], item: d.item, recordType: d.kind, memo: $('#incomeMemo').value.trim()};
      if (d.kind === 'income') Object.assign(row, {amount: d.amount, netIncome: d.amount, saleState: 'direct'});
      else if (d.kind === 'acquired') Object.assign(row, {qty: d.qty, quantity: d.qty, netIncome: 0, saleState: 'acquired', source: $('#incomeSource').value.trim()});
      else { Object.assign(row, {qty: d.qty, quantity: d.qty, price: d.price, unitPrice: d.price, materialCost: d.materialCost, grossIncome: d.qty * d.price, netIncome: d.qty * d.price - d.materialCost, saleState: 'sold'}); (next.settings.itemPrices ||= {})[d.item] = d.price; }
      next.incomes.push(row);
    });
    if (ok) { for (const id of ['mesoAmount', 'incomePrice', 'materialCost', 'incomeSource', 'incomeMemo']) $('#' + id).value = ''; $('#incomeQty').value = '1'; $$('#incomeForm .money-hint').forEach(el => { el.textContent = ''; }); renderIncomeForm(); }
  });
  $('#incomeHistory').addEventListener('click', e => {
    const button = e.target.closest('[data-income-action]'); if (!button || isPast()) return;
    const row = state.incomes.find(item => item.id === button.dataset.incomeId); if (!row) return;
    if (button.dataset.incomeAction === 'edit') openIncomeEdit(row.id);
    if (button.dataset.incomeAction === 'delete' && confirm(`${labels[row.category] || '기타'} · ${row.item} 기록을 삭제할까요? 수익 합계에서 즉시 제외됩니다.`)) transaction(next => { next.incomes = next.incomes.filter(item => item.id !== row.id); });
  });
  $$('[data-edit-sale]').forEach(button => button.addEventListener('click', () => { editSaleState = button.dataset.editSale; updateIncomeEditUI(); }));
  $('#incomeEditForm').addEventListener('submit', e => { e.preventDefault(); if (saveIncomeEdit()) { editingIncomeId = ''; $('#incomeEditDialog').close(); } });
  $('#exportData').addEventListener('click', () => downloadBackup()); $('#exportOriginal').addEventListener('click', () => downloadBackup(true));
  $('#importData').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const next = prepareImportedState(await file.text());
      if (!confirm(`백업을 복원할까요? 현재 데이터는 교체됩니다.\n캐릭터 ${next.characters.length}개 · 수익 기록 ${next.incomes.length}개`)) return;
      rollover(next); persist(next); selectedWeek = ''; selectedBossCharacterId = ''; renderIncomeForm(true); render(); message('백업을 복원하고 화면을 다시 계산했습니다.');
    } catch (error) { message(`복원하지 못했습니다: ${error.message} 현재 데이터는 변경하지 않았습니다.`, true); }
  });
  $('#presetManager').addEventListener('click', e => {
    const button = e.target.closest('[data-preset-action]'), row = e.target.closest('[data-preset-id]'); if (!button || !row) return;
    const preset = state.presets.find(item => item.id === row.dataset.presetId); if (!preset) return;
    if (button.dataset.presetAction === 'rename') { const name = prompt('프리셋 이름', preset.name)?.trim(); if (name) transaction(next => { next.presets.find(item => item.id === preset.id).name = name; }); }
    if (button.dataset.presetAction === 'delete' && confirm(`사용자 프리셋 '${preset.name}'을 삭제할까요? 캐릭터의 현재 보스 구성은 유지됩니다.`)) transaction(next => { next.presets = next.presets.filter(item => item.id !== preset.id); });
  });
  $('#resetWeek').addEventListener('click', () => { if (!isPast() && confirm('이번 주 보스 완료 체크와 수익 기록만 초기화할까요? 캐릭터 구성, 프리셋, 과거 주차는 유지됩니다.')) transaction(resetCurrentWeek); });
  $('#resetAll').addEventListener('click', () => { if (!isPast() && confirm('현재 데이터와 과거 주차를 모두 초기화할까요? 먼저 백업을 권장합니다. 이전 버전 원본 백업은 유지됩니다.')) { try { persist(emptyState()); selectedWeek = ''; selectedBossCharacterId = ''; renderIncomeForm(true); render(); message('전체 데이터를 초기화했습니다.'); } catch (error) { message(error.message, true); } } });
  window.addEventListener('focus', checkWeek);
  window.addEventListener('storage', e => { if (e.key === KEY) { loadState(); render(); renderIncomeForm(); message('다른 탭에서 저장한 변경을 반영했습니다.'); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkWeek(); }); setInterval(checkWeek, 15000);
}
if (typeof window !== 'undefined') window.mapleIncomeApp = {
  storageKey: KEY,
  changeEvent: LOCAL_CHANGE_EVENT,
  getState: () => copy(state),
  normalizeCloudState: raw => migrateState(raw),
  applyCloudState
};
if (typeof document !== 'undefined') init();
