'use strict';

const KEY = 'maple-income-vercel-v1';
const BACKUP_KEY = `${KEY}-before-v2`;
const MIGRATION_SYNC_KEY = `${KEY}-migration-sync-pending`;
const STATE_VERSION = 9;
const LOCAL_CHANGE_EVENT = 'maple-income:local-change';
const THEME_STORAGE_KEY = 'maple-income-theme';
const THEME_PREFERENCES = ['system', 'light', 'dark'];
const THEME_LABELS = {system: '시스템 설정', light: '라이트', dark: '다크'};
const THEME_COLORS = {light: '#f5f7f9', dark: '#0d151c'};
let themePreference = 'system', themeMediaQuery = null;
function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
}
function resolveTheme(preference = 'system', systemDark = false) {
  const normalized = normalizeThemePreference(preference);
  return normalized === 'system' ? (systemDark ? 'dark' : 'light') : normalized;
}
function readThemePreference(storage = localStorage) {
  try { return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY)); }
  catch { return 'system'; }
}
function applyTheme(preference = themePreference, systemDark = themeMediaQuery?.matches === true) {
  const resolved = resolveTheme(preference, systemDark);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
  }
  return resolved;
}
function renderThemeSettings() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-theme-preference]').forEach(button => {
    const selected = button.dataset.themePreference === themePreference;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const summary = document.querySelector('#settingsThemeSummary');
  if (summary) summary.textContent = THEME_LABELS[themePreference];
}
function setThemePreference(value, storage = localStorage) {
  themePreference = normalizeThemePreference(value);
  try { storage.setItem(THEME_STORAGE_KEY, themePreference); } catch {}
  const resolved = applyTheme(themePreference);
  renderThemeSettings();
  return resolved;
}
function handleSystemThemeChange(event) {
  if (themePreference === 'system') return applyTheme(themePreference, event.matches === true);
  return resolveTheme(themePreference, event.matches === true);
}
function setupThemeController() {
  themePreference = readThemePreference();
  themeMediaQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  themeMediaQuery?.addEventListener?.('change', handleSystemThemeChange);
  applyTheme(themePreference, themeMediaQuery?.matches === true);
  renderThemeSettings();
}
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
const nexonDifficulties = {
  '이지': '이지', '노멀': '노멀', '노말': '노멀', '하드': '하드', '카오스': '카오스', '익스트림': '익스트림',
  easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림'
};
const nexonWeeklyActivityDefinitions = [
  {id: 'epic-dungeon', type: 'epic-dungeon', label: '계정 공용', name: '에픽 던전', scope: 'account', tokens: ['하이마운틴', '앵글러컴퍼니', '악몽선경', '아우룸레기스']},
  {id: 'guild', type: 'guild', label: '캐릭터별', name: '길드', scope: 'character', tokens: ['지하수로', '플래그레이스']},
  {id: 'dojang', type: 'mu-lung-dojo', label: '캐릭터별', name: '무릉', scope: 'character', tokens: ['무릉도장']}
];
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
function normalizeSaleFeeRate(value) { return Number(value) === 0.03 ? 0.03 : 0.05; }
function saleFeePercent(value) { return normalizeSaleFeeRate(value) === 0.03 ? 3 : 5; }
function saleAmounts(quantity, unitPrice, feeRate) {
  const qty = n(quantity), price = n(unitPrice), grossSale = qty * price;
  if (!Number.isSafeInteger(qty) || qty < 1 || !Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(grossSale)) return null;
  const normalizedRate = normalizeSaleFeeRate(feeRate), percent = saleFeePercent(normalizedRate);
  const feeAmount = Math.floor(grossSale / 100) * percent + Math.floor((grossSale % 100) * percent / 100);
  return {feeRate: normalizedRate, grossSale, feeAmount, netSale: grossSale - feeAmount};
}
function koreanMeso(value) {
  let rest = Math.abs(Math.trunc(n(value))); const parts = [];
  for (const [size, unit] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    const group = Math.floor(rest / size); rest -= group * size;
    if (group) parts.push(unit === '만' && group % 1000 === 0 ? `${group / 1000}천만` : `${won(group)}${unit}`);
  }
  if (rest) parts.push(won(rest));
  return `${n(value) < 0 ? '−' : ''}${parts.join(' ') || '0'}`;
}
function koreanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '정보 없음';
  let rest = Math.abs(Math.trunc(number)); const parts = [];
  for (const [size, unit] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    const group = Math.floor(rest / size); rest -= group * size;
    if (group) parts.push(`${group.toLocaleString('ko-KR')}${unit}`);
  }
  if (rest) parts.push(rest.toLocaleString('ko-KR'));
  return `${number < 0 ? '−' : ''}${parts.join(' ') || '0'}`;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[c])); }
function safeNexonImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function safeOptionalInteger(value) {
  if (value === null || value === undefined || value === '' || !['string', 'number'].includes(typeof value)) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
function safeOptionalNumber(value) {
  if (value === null || value === undefined || value === '' || !['string', 'number'].includes(typeof value)) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
const NEXON_STAT_GROUPS = [
  {id: 'combat', title: '전투', items: [
    ['bossDamage', '보스 데미지', 'percent'], ['ignoreDefense', '방어율 무시', 'percent'],
    ['criticalRate', '크리티컬 확률', 'percent'], ['criticalDamage', '크리티컬 데미지', 'percent'],
    ['damage', '데미지', 'percent'], ['finalDamage', '최종 데미지', 'percent']
  ]},
  {id: 'ability', title: '능력치', items: [
    ['str', 'STR', 'integer'], ['dex', 'DEX', 'integer'], ['int', 'INT', 'integer'], ['luk', 'LUK', 'integer'],
    ['hp', 'HP', 'integer'], ['attackPower', '공격력', 'integer'], ['magicPower', '마력', 'integer']
  ]},
  {id: 'growth', title: '성장', items: [
    ['starForce', '스타포스', 'integer'], ['arcaneForce', '아케인포스', 'integer'], ['authenticForce', '어센틱포스', 'integer']
  ]},
  {id: 'other', title: '기타', items: [
    ['itemDropRate', '아이템 드롭률', 'percent'], ['mesoAcquisitionRate', '메소 획득량', 'percent']
  ]}
];
const NEXON_PERCENT_STATS = new Set(NEXON_STAT_GROUPS.flatMap(group => group.items.filter(item => item[2] === 'percent').map(item => item[0])));
const NEXON_INTEGER_STATS = new Set(NEXON_STAT_GROUPS.flatMap(group => group.items.filter(item => item[2] === 'integer').map(item => item[0])));
function normalizeNexonStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries([...NEXON_PERCENT_STATS, ...NEXON_INTEGER_STATS].map(key => [key,
    NEXON_PERCENT_STATS.has(key) ? safeOptionalNumber(value[key]) : safeOptionalInteger(value[key])
  ]));
}
function normalizeNexonCharacter(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {...value};
  for (const key of ['ocid', 'characterName', 'world', 'className', 'unionGrade', 'linkedAt', 'lastCheckedAt', 'lastCheckedWeek', 'profileCheckedAt', 'statsCheckedAt', 'status']) {
    if (result[key] != null) result[key] = String(result[key]);
  }
  for (const key of ['level', 'combatPower', 'unionLevel']) {
    if (result[key] != null) result[key] = safeOptionalInteger(result[key]);
  }
  if (Object.hasOwn(result, 'stats')) result.stats = normalizeNexonStats(result.stats);
  result.image = safeNexonImageUrl(result.image);
  return result;
}
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${year}년 ${n(month)}월` : String(value || '');
}
function weekEndReference(weekId, fallback = new Date()) {
  if (!validWeek(weekId)) return fallback;
  const end = weekId.split('~')[1], date = new Date(`${end}T12:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
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
  const monthlyCompletions = normalizeMonthlyCompletions(source.monthlyCompletions);
  return {
    bossId, name, difficulty, party: partySize, partySize,
    price: source.price == null ? referencePrice(name, difficulty) : n(source.price),
    done,
    ...(!done || source.completedIncome == null ? {} : {completedIncome: n(source.completedIncome)}),
    ...(Object.keys(monthlyCompletions).length ? {monthlyCompletions} : {}),
    ...(typeof source.apiCompleted === 'boolean' ? {apiCompleted: source.apiCompleted} : {}),
    ...(typeof source.manualOverride === 'boolean' ? {manualOverride: source.manualOverride} : {}),
    ...(typeof source.manualOverrideMonth === 'string' ? {manualOverrideMonth: source.manualOverrideMonth} : {}),
    ...(['manual', 'nexon-api', 'migration'].includes(source.completionSource) ? {completionSource: source.completionSource} : {}),
    ...(typeof source.apiCheckedWeek === 'string' ? {apiCheckedWeek: source.apiCheckedWeek} : {}),
    ...(typeof source.apiCheckedMonth === 'string' ? {apiCheckedMonth: source.apiCheckedMonth} : {}),
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
  if (kind !== 'sold') return 0;
  if (r.netSale != null) return n(r.netSale);
  if (r.netIncome != null) return n(r.netIncome);
  return n(r.qty ?? r.quantity) * n(r.salePrice ?? r.price ?? r.unitPrice) - n(r.materialCost);
}
function summarizeHuntRecords(records, weekId = '') {
  const summary = {mesoAcquired: 0, solErdaPieces: 0};
  for (const row of records || []) {
    if (row?.category !== 'hunt') continue;
    if (weekId && validWeek(row.weekId) && row.weekId !== weekId) continue;
    const kind = recordKind(row);
    if (row.item === '메소' && kind === 'income' && row.recordType !== 'sold' && row.saleState !== 'sold' && row.type !== 'sale') {
      summary.mesoAcquired += n(row.amount ?? row.netIncome);
    } else if (row.item === '솔 에르다 조각' && kind === 'acquired') {
      summary.solErdaPieces += Math.max(0, n(row.qty ?? row.quantity));
    }
  }
  return summary;
}
function bossValue(b) { return Math.floor(n(b.price) / Math.max(1, n(b.party ?? b.partySize) || 1)); }
function isMonthlyBoss(boss) { return boss?.bossId === 'black-mage' || canonicalBossName(boss?.name) === '검은 마법사'; }
function normalizeMonthlyCompletions(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [month, raw] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !raw || typeof raw !== 'object' || !validWeek(raw.weekId)) continue;
    const entry = {weekId: raw.weekId, income: Math.max(0, Math.trunc(n(raw.income)))};
    if (typeof raw.completedAt === 'string' && !Number.isNaN(Date.parse(raw.completedAt))) entry.completedAt = raw.completedAt;
    if (['manual', 'nexon-api', 'migration'].includes(raw.source)) entry.source = raw.source;
    result[month] = entry;
  }
  return result;
}
function monthlyBossIncomeForWeek(boss, weekId = '') {
  return Object.values(normalizeMonthlyCompletions(boss?.monthlyCompletions))
    .filter(entry => !weekId || entry.weekId === weekId)
    .reduce((sum, entry) => sum + n(entry.income), 0);
}
function syncMonthlyBossCurrentState(boss, now = new Date()) {
  if (!isMonthlyBoss(boss)) return false;
  const before = JSON.stringify(boss), currentMonth = monthKey(now);
  boss.monthlyCompletions = normalizeMonthlyCompletions(boss.monthlyCompletions);
  if (boss.manualOverrideMonth && boss.manualOverrideMonth !== currentMonth) {
    delete boss.manualOverride;
    delete boss.manualOverrideMonth;
  }
  if (boss.apiCheckedMonth && boss.apiCheckedMonth !== currentMonth) {
    delete boss.apiCompleted;
    delete boss.apiCheckedMonth;
    delete boss.apiCompletedAt;
  }
  const entry = boss.monthlyCompletions[currentMonth];
  const blocked = boss.manualOverride === false && boss.manualOverrideMonth === currentMonth;
  boss.done = !!entry && !blocked;
  if (boss.done) {
    boss.completedIncome = n(entry.income);
    boss.completionSource = entry.source || boss.completionSource || 'manual';
  } else {
    delete boss.completedIncome;
    if (!blocked) delete boss.completionSource;
  }
  return before !== JSON.stringify(boss);
}
function recordMonthlyBossCompletion(boss, completionMonth, weekId, options = {}) {
  if (!isMonthlyBoss(boss) || !/^\d{4}-\d{2}$/.test(completionMonth) || !validWeek(weekId)) return false;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const history = normalizeMonthlyCompletions(boss.monthlyCompletions);
  const entry = {weekId, income: Math.max(0, Math.trunc(n(options.income ?? bossValue(boss))))};
  if (typeof options.completedAt === 'string' && !Number.isNaN(Date.parse(options.completedAt))) entry.completedAt = options.completedAt;
  if (['manual', 'nexon-api', 'migration'].includes(options.source)) entry.source = options.source;
  history[completionMonth] = entry;
  boss.monthlyCompletions = history;
  if (completionMonth === monthKey(now)) {
    boss.done = true;
    boss.completedIncome = entry.income;
    boss.completionSource = entry.source || 'manual';
  }
  return true;
}
function clearMonthlyBossCompletion(boss, completionMonth, now = new Date()) {
  if (!isMonthlyBoss(boss)) return false;
  const history = normalizeMonthlyCompletions(boss.monthlyCompletions), existed = Object.hasOwn(history, completionMonth);
  delete history[completionMonth];
  boss.monthlyCompletions = history;
  if (completionMonth === monthKey(now)) {
    boss.done = false;
    delete boss.completedIncome;
    delete boss.completionSource;
  }
  return existed;
}
function resetBossWeeklyState(boss) {
  if (isMonthlyBoss(boss)) return;
  boss.done = false;
  delete boss.completedIncome;
  delete boss.apiCompleted;
  delete boss.manualOverride;
  delete boss.completionSource;
  delete boss.apiCheckedWeek;
  delete boss.apiCompletedAt;
}
function resetBossCurrentPeriodState(boss, now = new Date()) {
  if (!isMonthlyBoss(boss)) { resetBossWeeklyState(boss); return; }
  const currentMonth = monthKey(now);
  clearMonthlyBossCompletion(boss, currentMonth, now);
  delete boss.apiCompleted;
  delete boss.manualOverride;
  delete boss.manualOverrideMonth;
  delete boss.apiCheckedMonth;
  delete boss.apiCheckedWeek;
  delete boss.apiCompletedAt;
}
function resetWeeklyActivityState(activity) {
  activity.done = false;
  delete activity.apiCompleted;
  delete activity.manualOverride;
  delete activity.completionSource;
  delete activity.apiCheckedWeek;
  delete activity.apiCompletedAt;
}
function weeklyActivityDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || ''), type = String(value.type || '');
  if (id === 'epic-dungeon' || id.startsWith('epic-dungeon:') || type === 'epic-dungeon') return nexonWeeklyActivityDefinitions.find(item => item.id === 'epic-dungeon');
  if (id === 'guild' || id.startsWith('guild:') || type === 'guild') return nexonWeeklyActivityDefinitions.find(item => item.id === 'guild');
  if (['dojang', 'mu-lung-dojo'].includes(id) || type === 'mu-lung-dojo') return nexonWeeklyActivityDefinitions.find(item => item.id === 'dojang');
  return nexonWeeklyActivityDefinitions.find(item => item.id === id) || null;
}
function normalizeWeeklyActivity(value) {
  const definition = weeklyActivityDefinition(value);
  if (!definition) return null;
  const manualOverride = typeof value.manualOverride === 'boolean' ? value.manualOverride : undefined;
  const done = manualOverride == null ? !!value.done : manualOverride;
  return {
    id: definition.id, type: definition.type, scope: definition.scope,
    label: definition.label, name: definition.name,
    done,
    ...(typeof value.apiCompleted === 'boolean' ? {apiCompleted: value.apiCompleted} : {}),
    ...(typeof manualOverride === 'boolean' ? {manualOverride} : {}),
    ...(['manual', 'nexon-api'].includes(value.completionSource) ? {completionSource: value.completionSource} : {}),
    ...(typeof value.apiCheckedWeek === 'string' ? {apiCheckedWeek: value.apiCheckedWeek} : {}),
    ...(typeof value.apiCompletedAt === 'string' ? {apiCompletedAt: value.apiCompletedAt} : {})
  };
}
function mergeWeeklyActivityState(previous, next) {
  if (!previous) return next;
  const merged = {...previous, ...next, done: previous.done || next.done, apiCompleted: !!previous.apiCompleted || !!next.apiCompleted};
  if (previous.manualOverride === true || next.manualOverride === true) merged.manualOverride = true;
  else if (previous.manualOverride === false && next.manualOverride === false) merged.manualOverride = false;
  else delete merged.manualOverride;
  if (merged.done && !merged.completionSource) merged.completionSource = previous.completionSource || next.completionSource;
  return merged;
}
function normalizeWeeklyActivities(source, scope = null, includeDefaults = false) {
  const unique = new Map();
  for (const value of Array.isArray(source) ? source : []) {
    const activity = normalizeWeeklyActivity(value);
    if (activity && (!scope || activity.scope === scope)) unique.set(activity.id, mergeWeeklyActivityState(unique.get(activity.id), activity));
  }
  if (includeDefaults) for (const definition of nexonWeeklyActivityDefinitions.filter(item => !scope || item.scope === scope)) {
    if (!unique.has(definition.id)) unique.set(definition.id, normalizeWeeklyActivity({...definition, done: false}));
  }
  return [...unique.values()];
}
function normalizeNexonText(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function normalizeNexonDifficulty(value) {
  const normalized = normalizeNexonText(value).replace(/\s+/g, '');
  return nexonDifficulties[normalized.toLowerCase()] || normalized;
}
function nexonBossCycle(value) {
  const normalized = normalizeNexonText(value).replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('daily') || normalized === 'day' || normalized.includes('일간')) return 'daily';
  if (normalized.includes('monthly') || normalized.includes('month') || normalized.includes('월간')) return 'monthly';
  if (normalized.includes('weekly') || normalized.includes('week') || normalized.includes('주간')) return 'weekly';
  return 'weekly';
}
function isNexonWeeklyCycle(value) { return nexonBossCycle(value) === 'weekly'; }
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
function mapNexonWeeklyActivity(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const contentName = normalizeNexonText(entry.contentName ?? entry.content_name);
  const compactName = contentName.replace(/[\s·:()\[\]_-]+/g, '').toLowerCase();
  const definition = nexonWeeklyActivityDefinitions.find(item => item.tokens.some(token => compactName.includes(token.toLowerCase())));
  if (!definition) return null;
  return {
    id: definition.id, type: definition.type, scope: definition.scope, label: definition.label,
    name: definition.name, contentName,
    registered: nexonFlag(entry.registered ?? entry.registration_flag),
    complete: nexonFlag(entry.complete),
    nowCount: n(entry.nowCount ?? entry.now_count),
    maxCount: n(entry.maxCount ?? entry.max_count),
    questState: normalizeNexonText(entry.questState ?? entry.quest_state)
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
  const responseDate = parseNexonDate(response.requestedDate || response.date) || parseNexonDate(checkedAt) || new Date();
  const responseWeek = currentWeekKey(responseDate), responseMonth = monthKey(responseDate);
  const checkedDate = parseNexonDate(checkedAt) || new Date();
  const diagnosticCharacter = {
    character: character.name,
    nexonCharacter: response.character?.name || character.nexonCharacter?.characterName || ''
  };
  const diagnostics = {
    fetched: response.bosses.length,
    apiCompleted: response.bosses.filter(entry => nexonFlag(entry?.complete ?? entry?.complete_flag)).length,
    matched: 0, matchedCompleted: 0, autoCompleted: 0, monthlyAutoCompleted: 0,
    unknown: [], difficultyMismatch: [], unselectedDifficulty: [], ambiguous: [], notConfigured: [], localNotFound: [], ignoredCycle: [],
    completedItems: [], blockedByManualOverride: [],
    activitiesFetched: Array.isArray(response.activities) ? response.activities.length : 0,
    apiActivitiesCompleted: Array.isArray(response.activities) ? response.activities.filter(entry => nexonFlag(entry?.complete)).length : 0,
    activityMatched: 0, activityMatchedCompleted: 0, activityAutoCompleted: 0,
    unsupportedActivity: [], activityCompletedItems: [], activityBlockedByManualOverride: []
  };
  const addCompletedItem = (item, result) => diagnostics.completedItems.push({...diagnosticCharacter, contentName: item.contentName, difficulty: item.difficulty, cycle: item.cycle, result});
  const localBosses = (character.bosses || []).map((boss, index) => ({boss, index}));
  const matches = new Map(), unknownNames = new Set(), seenApiBossIds = new Set();
  for (const entry of response.bosses) {
    const value = mapNexonBossEntry(entry);
    if (!value) {
      const name = normalizeNexonText(entry?.contentName ?? entry?.content_name);
      const unknownItem = {...diagnosticCharacter, contentName: name, difficulty: normalizeNexonDifficulty(entry?.difficulty), cycle: normalizeNexonText(entry?.cycle)};
      if (name && !unknownNames.has(name)) {
        unknownNames.add(name);
        diagnostics.unknown.push(unknownItem);
      }
      if (nexonFlag(entry?.complete ?? entry?.complete_flag)) addCompletedItem(unknownItem, 'unknown-name');
      continue;
    }
    const cycle = nexonBossCycle(value.cycle);
    const expectedCycle = value.bossId === 'black-mage' ? 'monthly' : 'weekly';
    if (cycle !== expectedCycle) {
      diagnostics.ignoredCycle.push({...diagnosticCharacter, bossId: value.bossId, contentName: value.contentName, difficulty: value.difficulty, cycle: value.cycle, complete: value.complete});
      if (value.complete) addCompletedItem(value, 'ignored-cycle');
      continue;
    }
    seenApiBossIds.add(value.bossId);
    const validDifficulties = Object.keys(bossDB[bossNameFor(value.bossId)] || {});
    if (!value.difficulty || !validDifficulties.includes(value.difficulty)) {
      diagnostics.difficultyMismatch.push({...diagnosticCharacter, bossId: value.bossId, contentName: value.contentName, apiDifficulty: value.difficulty, cycle: value.cycle, validDifficulties, localDifficulties: localBosses.filter(item => item.boss.bossId === value.bossId).map(item => item.boss.difficulty), complete: value.complete});
      if (value.complete) addCompletedItem(value, 'difficulty-mismatch');
      continue;
    }
    const candidates = localBosses.filter(item => item.boss.bossId === value.bossId);
    if (!candidates.length) {
      diagnostics.notConfigured.push({...diagnosticCharacter, contentName: value.contentName, difficulty: value.difficulty, cycle: value.cycle, complete: value.complete});
      if (value.complete) addCompletedItem(value, 'not-configured');
      continue;
    }
    let target = null, unmatchedResult = 'unselected-difficulty';
    const exact = candidates.filter(item => normalizeNexonDifficulty(item.boss.difficulty) === value.difficulty);
    if (exact.length === 1) target = exact[0];
    else if (exact.length > 1) {
      unmatchedResult = 'ambiguous';
      diagnostics.ambiguous.push({...diagnosticCharacter, bossId: value.bossId, contentName: value.contentName, difficulty: value.difficulty, cycle: value.cycle, localDifficulties: exact.map(item => item.boss.difficulty), complete: value.complete});
    } else diagnostics.unselectedDifficulty.push({...diagnosticCharacter, bossId: value.bossId, contentName: value.contentName, difficulty: value.difficulty, cycle: value.cycle, localDifficulties: candidates.map(item => item.boss.difficulty), complete: value.complete});
    if (!target) {
      if (value.complete) addCompletedItem(value, unmatchedResult);
      continue;
    }
    const previous = matches.get(target.index);
    matches.set(target.index, {boss: target.boss, api: {...value, complete: value.complete || !!previous?.api.complete}});
  }
  diagnostics.matched = matches.size;
  diagnostics.matchedCompleted = [...matches.values()].filter(match => match.api.complete).length;
  diagnostics.localNotFound = localBosses.filter(item => !seenApiBossIds.has(item.boss.bossId)).map(item => ({...diagnosticCharacter, bossId: item.boss.bossId, name: item.boss.name, difficulty: item.boss.difficulty}));
  let bossesChanged = false, activitiesChanged = false, newlyCompleted = 0, newlyCompletedActivities = 0;
  for (const {boss, api: apiBoss} of matches.values()) {
    const before = JSON.stringify(boss), monthly = isMonthlyBoss(boss);
    const monthlyHistory = monthly ? normalizeMonthlyCompletions(boss.monthlyCompletions) : {};
    const wasDoneBefore = monthly ? !!monthlyHistory[responseMonth] : boss.done === true;
    const wasApiCompleted = monthly
      ? boss.apiCompleted === true && boss.apiCheckedMonth === responseMonth
      : boss.apiCompleted === true && boss.apiCheckedWeek === data.currentWeek;
    boss.apiCompleted = apiBoss.complete;
    if (monthly) {
      boss.apiCheckedMonth = responseMonth;
      delete boss.apiCheckedWeek;
    } else {
      boss.apiCheckedWeek = data.currentWeek;
    }
    if (apiBoss.complete) {
      const blocked = boss.manualOverride === false && (!monthly || boss.manualOverrideMonth === responseMonth);
      const result = blocked ? 'blocked-manual-override' : wasDoneBefore ? 'matched-already-done' : 'matched-auto-completed';
      addCompletedItem(apiBoss, result);
      if (result === 'blocked-manual-override') diagnostics.blockedByManualOverride.push({...diagnosticCharacter, contentName: apiBoss.contentName, difficulty: apiBoss.difficulty, cycle: apiBoss.cycle});
      if (result === 'matched-auto-completed') {
        diagnostics.autoCompleted++;
        if (monthly) diagnostics.monthlyAutoCompleted++;
      }
      if (!wasApiCompleted) boss.apiCompletedAt = checkedAt;
      if (!blocked) {
        if (!wasDoneBefore) newlyCompleted++;
        if (monthly) {
          recordMonthlyBossCompletion(boss, responseMonth, responseWeek, {
            income: bossValue(boss), completedAt: checkedAt, source: 'nexon-api', now: checkedDate
          });
          if (boss.manualOverride !== true || boss.manualOverrideMonth !== responseMonth) boss.completionSource = 'nexon-api';
        } else {
          boss.done = true;
          if (boss.manualOverride !== true) boss.completionSource = 'nexon-api';
          if (boss.completedIncome == null || boss.completionSource === 'nexon-api') boss.completedIncome = bossValue(boss);
        }
      }
    }
    if (monthly) syncMonthlyBossCurrentState(boss, checkedDate);
    if (before !== JSON.stringify(boss)) bossesChanged = true;
  }
  character.weeklyActivities = normalizeWeeklyActivities(character.weeklyActivities, 'character', true);
  data.accountWeeklyActivities = normalizeWeeklyActivities(data.accountWeeklyActivities, 'account', true);
  const mappedActivities = new Map();
  for (const entry of Array.isArray(response.activities) ? response.activities : []) {
    const activity = mapNexonWeeklyActivity(entry);
    if (!activity) {
      diagnostics.unsupportedActivity.push({...diagnosticCharacter, contentName: normalizeNexonText(entry?.contentName ?? entry?.content_name), apiType: normalizeNexonText(entry?.type), complete: nexonFlag(entry?.complete)});
      continue;
    }
    diagnostics.activityMatched++;
    if (activity.complete) diagnostics.activityMatchedCompleted++;
    const previous = mappedActivities.get(activity.id);
    mappedActivities.set(activity.id, previous ? {...previous, complete: previous.complete || activity.complete, registered: previous.registered || activity.registered, contentName: activity.complete ? activity.contentName : previous.contentName} : activity);
  }
  for (const activity of mappedActivities.values()) {
    const collection = activity.scope === 'account' ? data.accountWeeklyActivities : character.weeklyActivities;
    let local = collection.find(item => item.id === activity.id);
    if (!local) { local = normalizeWeeklyActivity(activity); collection.push(local); activitiesChanged = true; }
    const before = JSON.stringify(local), wasDoneBefore = local.done === true;
    local.apiCompleted = activity.complete;
    local.apiCheckedWeek = data.currentWeek;
    if (activity.complete) {
      const result = local.manualOverride === false ? 'blocked-manual-override' : wasDoneBefore ? 'matched-already-done' : 'matched-auto-completed';
      diagnostics.activityCompletedItems.push({...diagnosticCharacter, contentName: activity.contentName || activity.name, activityType: activity.type, activityScope: activity.scope, result});
      if (result === 'blocked-manual-override') diagnostics.activityBlockedByManualOverride.push({...diagnosticCharacter, contentName: activity.contentName || activity.name, activityType: activity.type, activityScope: activity.scope});
      if (result === 'matched-auto-completed') diagnostics.activityAutoCompleted++;
      if (local.manualOverride !== false) {
        if (!local.done) newlyCompletedActivities++;
        local.done = true;
        if (local.manualOverride !== true) local.completionSource = 'nexon-api';
        local.apiCompletedAt = local.apiCompletedAt || checkedAt;
      }
    }
    if (before !== JSON.stringify(local)) activitiesChanged = true;
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
  return {changed: bossesChanged || activitiesChanged || previousLink !== JSON.stringify(character.nexonCharacter), bossesChanged, activitiesChanged, newlyCompleted, newlyCompletedActivities, ...diagnostics};
}
function applyNexonProfileState(data, characterId, response, checkedAt = new Date().toISOString()) {
  if (!data || !Array.isArray(data.characters) || !response?.character || typeof response.character !== 'object') throw new Error('NEXON 캐릭터 기본정보 응답을 적용할 수 없습니다.');
  const character = data.characters.find(item => item.id === characterId);
  if (!character?.nexonCharacter?.ocid) throw new Error('프로필을 저장할 연동 캐릭터를 찾을 수 없습니다.');
  const profile = response.character, previous = JSON.stringify(character.nexonCharacter);
  const resourceState = response.resources && typeof response.resources === 'object' ? response.resources : null;
  const basicOk = resourceState ? resourceState.basic?.ok === true : true;
  const statOk = resourceState ? resourceState.stat?.ok === true : Object.hasOwn(profile, 'combatPower');
  const unionOk = resourceState ? resourceState.union?.ok === true : Object.hasOwn(profile, 'unionLevel');
  const level = Number(profile.level);
  const nextProfile = {
    ...character.nexonCharacter,
    ...(basicOk && profile.name ? {characterName: profile.name} : {}),
    ...(basicOk && profile.world ? {world: profile.world} : {}),
    ...(basicOk ? {
      className: typeof profile.className === 'string' ? profile.className : character.nexonCharacter.className || '',
      level: Number.isInteger(level) && level >= 0 ? level : character.nexonCharacter.level ?? null,
      image: safeNexonImageUrl(profile.image),
      profileCheckedAt: checkedAt
    } : {}),
    ...(statOk ? {
      combatPower: safeOptionalInteger(profile.combatPower),
      ...(Object.hasOwn(profile, 'stats') ? {stats: normalizeNexonStats(profile.stats)} : {})
    } : {}),
    ...(unionOk ? {
      unionLevel: safeOptionalInteger(profile.unionLevel),
      unionGrade: typeof profile.unionGrade === 'string' ? profile.unionGrade : ''
    } : {}),
    ...(statOk ? {statsCheckedAt: checkedAt} : {})
  };
  character.nexonCharacter = normalizeNexonCharacter(nextProfile);
  return previous !== JSON.stringify(character.nexonCharacter);
}
function applyNexonLinkProfileState(data, characterId, response, checkedAt = new Date().toISOString()) {
  const character = data?.characters?.find(item => item.id === characterId);
  const profile = response?.character;
  const basicOk = response?.resources ? response.resources.basic?.ok === true : true;
  if (!character || !basicOk || !response?.ocid || !profile?.name) throw new Error('NEXON 캐릭터 기본정보를 확인하지 못했습니다.');
  character.nexonCharacter = normalizeNexonCharacter({
    ...(character.nexonCharacter || {}),
    ocid: response.ocid,
    characterName: profile.name,
    linkedAt: character.nexonCharacter?.linkedAt || checkedAt,
    status: 'ok'
  });
  return applyNexonProfileState(data, characterId, response, checkedAt);
}
function characterStats(c) {
  const list = normalizeBosses(c.bosses).filter(boss => !isMonthlyBoss(boss)), completed = list.filter(b => b.done);
  const expected = list.reduce((sum, b) => sum + bossValue(b), 0);
  const earned = completed.reduce((sum, b) => sum + (b.completedIncome == null ? bossValue(b) : n(b.completedIncome)), 0);
  return {count: list.length, done: completed.length, expected, earned, remaining: expected - earned};
}
function bossIncomeForWeek(character, weekId = '') {
  return normalizeBosses(character?.bosses).reduce((sum, boss) => {
    if (isMonthlyBoss(boss)) {
      const recorded = monthlyBossIncomeForWeek(boss, weekId);
      if (recorded || weekId) return sum + recorded;
      return sum + (boss.done ? n(boss.completedIncome ?? bossValue(boss)) : 0);
    }
    return sum + (boss.done ? n(boss.completedIncome ?? bossValue(boss)) : 0);
  }, 0);
}
function totalsFor(data) {
  const weekId = data?.weekId || data?.currentWeek || '';
  const t = {boss: (data.characters || []).reduce((sum, c) => sum + bossIncomeForWeek(c, weekId), 0), hunt: 0, gather: 0, drop: 0};
  for (const row of data.incomes || []) t[Object.hasOwn(items, row.category) ? row.category : 'drop'] += incomeValue(row);
  t.total = t.boss + t.hunt + t.gather + t.drop; return t;
}
function snapshotTotals(s) {
  const computed = totalsFor(s);
  return {...computed, ...(s.totals || {}), total: n(s.totals?.total ?? s.totalIncome ?? s.total ?? computed.total)};
}
function emptyState(now = new Date()) {
  return {version: STATE_VERSION, updatedAt: now.toISOString(), currentWeek: currentWeekKey(now), accountWeeklyActivities: normalizeWeeklyActivities([], 'account', true), characters: [{id: uid(), name: '본캐', bosses: presetGroups.middle.bosses.map(makeBoss), weeklyActivities: normalizeWeeklyActivities([], 'character', true)}], incomes: [], weeklyHistory: {}, presets: [], settings: {defaultSaleFeeRate: 0.05}, saleState: 'acquired'};
}
function stateHasMeaningfulUserData(data) {
  if (!data || typeof data !== 'object') return false;
  if ((data.incomes || []).length || Object.keys(data.weeklyHistory || {}).length || (data.presets || []).length) return true;
  if ((data.unassignedIncomes || []).length || (data.recoveredWeeks || []).length) return true;
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  if (Object.keys(settings).some(key => key !== 'defaultSaleFeeRate')) return true;
  if (settings.defaultSaleFeeRate != null && normalizeSaleFeeRate(settings.defaultSaleFeeRate) !== 0.05) return true;
  const characters = Array.isArray(data.characters) ? data.characters : [];
  if (characters.length !== 1) return characters.length > 0;
  const character = characters[0];
  if (!character || character.name !== '본캐' || character.nexonCharacter) return true;
  if ((data.accountWeeklyActivities || []).some(activity => activity.done || activity.manualOverride != null || activity.apiCompleted)) return true;
  if ((character.weeklyActivities || []).some(activity => activity.done || activity.manualOverride != null || activity.apiCompleted)) return true;
  const bossShape = bosses => normalizeBosses(bosses).map(boss => ({
    bossId: boss.bossId, difficulty: boss.difficulty, partySize: boss.partySize, price: boss.price,
    done: boss.done, completedIncome: boss.completedIncome, manualOverride: boss.manualOverride,
    manualOverrideMonth: boss.manualOverrideMonth, monthlyCompletions: boss.monthlyCompletions,
    apiCompleted: boss.apiCompleted, apiCheckedMonth: boss.apiCheckedMonth, completionSource: boss.completionSource
  }));
  return JSON.stringify(bossShape(character.bosses)) !== JSON.stringify(bossShape(presetGroups.middle.bosses.map(makeBoss)));
}
function recordWeek(r, fallback) {
  if (validWeek(r.weekId)) return r.weekId;
  if (r.createdAt != null) { const d = new Date(r.createdAt); if (!Number.isNaN(d.getTime())) return currentWeekKey(d); }
  return fallback;
}
function normalizeCharacterState(character, legacy = false) {
  const result = {...character, id: character.id || uid(), bosses: normalizeBosses(character.bosses, legacy && !Array.isArray(character.bosses)), weeklyActivities: normalizeWeeklyActivities(character.weeklyActivities, 'character', true)};
  const nexonCharacter = normalizeNexonCharacter(character.nexonCharacter);
  if (nexonCharacter) result.nexonCharacter = nexonCharacter;
  else delete result.nexonCharacter;
  return result;
}
function migrateMonthlyBossState(character, {weekId = '', now = new Date(), syncCurrent = true} = {}) {
  if (!character || !Array.isArray(character.bosses)) return character;
  for (const boss of character.bosses) {
    if (!isMonthlyBoss(boss)) continue;
    const history = normalizeMonthlyCompletions(boss.monthlyCompletions);
    if (boss.done && !Object.keys(history).length && validWeek(weekId)) {
      const apiDate = parseNexonDate(boss.apiCompletedAt);
      const reference = apiDate || weekEndReference(weekId, now);
      const completionMonth = monthKey(reference);
      history[completionMonth] = {
        weekId,
        income: Math.max(0, Math.trunc(n(boss.completedIncome ?? bossValue(boss)))),
        ...(typeof boss.apiCompletedAt === 'string' && !Number.isNaN(Date.parse(boss.apiCompletedAt)) ? {completedAt: boss.apiCompletedAt} : {}),
        source: ['manual', 'nexon-api'].includes(boss.completionSource) ? boss.completionSource : 'migration'
      };
    }
    boss.monthlyCompletions = history;
    if (typeof boss.manualOverride === 'boolean' && !boss.manualOverrideMonth) {
      const reference = parseNexonDate(boss.apiCompletedAt) || weekEndReference(weekId, now);
      boss.manualOverrideMonth = monthKey(reference);
    }
    if (syncCurrent) syncMonthlyBossCurrentState(boss, now);
  }
  return character;
}
function restoreMonthlyHistory(characters, weeklyHistory) {
  const current = new Map((characters || []).map(character => [character.id, character]));
  for (const [historyKey, snapshot] of Object.entries(weeklyHistory || {}).sort(([left], [right]) => left.localeCompare(right))) {
    const weekId = validWeek(snapshot?.weekId) ? snapshot.weekId : validWeek(historyKey) ? historyKey : '';
    if (!weekId) continue;
    for (const historicalCharacter of snapshot?.characters || []) {
      const targetCharacter = current.get(historicalCharacter.id);
      if (!targetCharacter) continue;
      for (const historicalBoss of historicalCharacter.bosses || []) {
        if (!isMonthlyBoss(historicalBoss)) continue;
        const targetBoss = targetCharacter.bosses.find(boss => boss.bossId === historicalBoss.bossId);
        if (!targetBoss) continue;
        const targetHistory = normalizeMonthlyCompletions(targetBoss.monthlyCompletions);
        for (const [month, entry] of Object.entries(normalizeMonthlyCompletions(historicalBoss.monthlyCompletions))) {
          if (!targetHistory[month]) targetHistory[month] = entry;
        }
        targetBoss.monthlyCompletions = targetHistory;
      }
    }
  }
}
function refreshMonthlyBossStates(data, now = new Date()) {
  let changed = false;
  for (const character of data?.characters || []) for (const boss of character.bosses || []) {
    if (isMonthlyBoss(boss) && syncMonthlyBossCurrentState(boss, now)) changed = true;
  }
  return changed;
}
function migrationCollectionManifest(data) {
  const characters = Array.isArray(data?.characters) ? data.characters : [];
  return {
    incomes: (Array.isArray(data?.incomes) ? data.incomes : []).map(item => String(item?.id || '')).filter(Boolean),
    characters: characters.map(character => String(character?.id || '')).filter(Boolean),
    bosses: characters.flatMap(character => (Array.isArray(character?.bosses) ? character.bosses : [])
      .map(boss => character?.id && boss?.bossId ? `${character.id}::${boss.bossId}` : '')).filter(Boolean),
    accountActivities: (Array.isArray(data?.accountWeeklyActivities) ? data.accountWeeklyActivities : [])
      .map(activity => String(activity?.id || '')).filter(Boolean),
    activities: characters.flatMap(character => (Array.isArray(character?.weeklyActivities) ? character.weeklyActivities : [])
      .map(activity => character?.id && activity?.id ? `${character.id}::${activity.id}` : '')).filter(Boolean),
    presets: (Array.isArray(data?.presets) ? data.presets : []).map(preset => String(preset?.id || '')).filter(Boolean),
    weeklyHistory: Object.entries(data?.weeklyHistory && typeof data.weeklyHistory === 'object' ? data.weeklyHistory : {})
      .map(([key, value]) => String(value?.weekId || key)).filter(Boolean)
  };
}
function createMigrationSyncInfo(fromVersion, data, at = new Date()) {
  return {fromVersion: Number(fromVersion) || 0, toVersion: STATE_VERSION, migratedAt: at.toISOString(), baseline: migrationCollectionManifest(data)};
}
function migrateState(raw, now = new Date()) {
  if (!raw) return emptyState(now);
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.characters) || !Array.isArray(raw.incomes)) throw new Error('저장 데이터 형식을 읽을 수 없습니다.');
  if (raw.version > STATE_VERSION) throw new Error('더 최신 버전의 데이터입니다. 페이지를 새로고침해 주세요.');
  const result = copy(raw), legacy = !raw.version || raw.version < 2;
  result.version = STATE_VERSION;
  result.updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : now.toISOString();
  result.currentWeek = validWeek(raw.currentWeek) ? raw.currentWeek : validWeek(raw.weekId) ? raw.weekId : currentWeekKey(now);
  const sourceCharacters = copy(result.characters);
  result.characters = result.characters.map(c => normalizeCharacterState(c, legacy));
  result.accountWeeklyActivities = normalizeWeeklyActivities([
    ...(Array.isArray(raw.accountWeeklyActivities) ? raw.accountWeeklyActivities : []),
    ...sourceCharacters.flatMap(character => Array.isArray(character?.weeklyActivities) ? character.weeklyActivities : [])
  ], 'account', true);
  result.settings ||= {}; result.settings.defaultSaleFeeRate = normalizeSaleFeeRate(result.settings.defaultSaleFeeRate); result.presets ||= [];
  result.weeklyHistory = Array.isArray(raw.weeklyHistory) ? Object.fromEntries(raw.weeklyHistory.map((s, i) => [s.weekId || s.id || `legacy-${i}`, copy(s)])) : copy(raw.weeklyHistory || {});
  if (!Array.isArray(result.presets)) result.presets = Object.entries(result.presets).map(([name, p]) => ({id: uid(), name, bosses: Array.isArray(p) ? p : p.bosses || []}));
  result.presets = result.presets.map(normalizePreset);
  for (const [historyKey, snapshot] of Object.entries(result.weeklyHistory)) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    const weekId = validWeek(snapshot.weekId) ? snapshot.weekId : validWeek(historyKey) ? historyKey : '';
    const reference = weekEndReference(weekId, now);
    const sourceSnapshotCharacters = copy(Array.isArray(snapshot.characters) ? snapshot.characters : []);
    snapshot.characters = sourceSnapshotCharacters.map(c => {
      const normalized = normalizeCharacterState(c, legacy);
      return migrateMonthlyBossState(normalized, {weekId, now: reference, syncCurrent: false});
    });
    snapshot.accountWeeklyActivities = normalizeWeeklyActivities([
      ...(Array.isArray(snapshot.accountWeeklyActivities) ? snapshot.accountWeeklyActivities : []),
      ...sourceSnapshotCharacters.flatMap(character => Array.isArray(character?.weeklyActivities) ? character.weeklyActivities : [])
    ], 'account', true);
  }
  restoreMonthlyHistory(result.characters, result.weeklyHistory);
  result.characters.forEach(character => migrateMonthlyBossState(character, {weekId: result.currentWeek, now, syncCurrent: true}));
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
  const target = currentWeekKey(now);
  let changed = false;
  while (data.currentWeek < target) {
    const closing = data.currentWeek, rows = data.incomes.filter(r => recordWeek(r, closing) <= closing);
    if (!Object.hasOwn(data.weeklyHistory, closing)) {
      const snapshot = {weekId: closing, accountWeeklyActivities: copy(data.accountWeeklyActivities || []), characters: copy(data.characters), incomes: copy(rows), closedAt: now.toISOString()};
      snapshot.totals = totalsFor(snapshot); data.weeklyHistory[closing] = snapshot;
    } else if (rows.length || data.accountWeeklyActivities?.some(activity => activity.done) || data.characters.some(c => characterStats(c).done || bossIncomeForWeek(c, closing) > 0 || c.weeklyActivities?.some(activity => activity.done))) {
      (data.recoveredWeeks ||= []).push({weekId: closing, accountWeeklyActivities: copy(data.accountWeeklyActivities || []), characters: copy(data.characters), incomes: copy(rows)});
    }
    data.incomes = data.incomes.filter(r => recordWeek(r, closing) > closing);
    data.characters.forEach(c => {
      c.bosses.forEach(resetBossWeeklyState);
      const activities = normalizeWeeklyActivities(c.weeklyActivities, 'character', true);
      activities.forEach(resetWeeklyActivityState);
      c.weeklyActivities = activities;
    });
    data.accountWeeklyActivities = normalizeWeeklyActivities(data.accountWeeklyActivities, 'account', true);
    data.accountWeeklyActivities.forEach(resetWeeklyActivityState);
    const next = new Date(`${closing.slice(0, 10)}T12:00:00`); next.setDate(next.getDate() + 7); data.currentWeek = currentWeekKey(next);
    changed = true;
  }
  return refreshMonthlyBossStates(data, now) || changed;
}

let state, savedRaw = null, storageBlocked = false, migrationSyncInfo = null;
let selectedWeek = '', bossFilter = 'pending', historyFilter = 'all', selectedBossCharacterId = '', selectedActivityCharacterId = '', characterMode = 'preset', presetApplyMode = 'add';
let editingIncomeId = '', editSaleState = 'acquired', incomeFeeRateDraft = null;
let selectedHubCharacterId = '', activeCharacterHubTab = 'overview';
let nexonApiState = {status: 'idle', message: '연동할 캐릭터를 선택해주세요.', diagnostics: null};
let nexonSchedulerDiagnosticState = {status: 'idle', characterId: '', result: null, message: '진단을 실행하면 두 요청 결과를 비교합니다.'};
let nexonCredentialAuthBridge = null;
let nexonCredentialState = {status: 'signed-out', hasCredential: false, editing: false, message: ''};
const NEXON_DETAIL_CLIENT_TTL_MS = 5 * 60 * 1000;
const nexonDetailRuntimeCache = new Map();
const nexonEquipmentPresetSelection = new Map();
const nexonEquipmentItemSelection = new Map();
const nexonEquipmentDialogItems = new Map();
let cloudAuthUiState = {initialized: false, signedIn: false, ready: false};
let onboardingWasActive = false, onboardingDismissed = false;
let onboardingCharacterCandidate = null;
let activeMainTab = 'summary', returnTabAfterIncome = 'summary';
const mainNavigationPages = ['summary', 'boss', 'history', 'settings'];
const NEXON_CHECK_COOLDOWN_MS = 60_000;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function message(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
const syncBadgeLabels = {
  '이 기기에 저장': ['이 기기에 저장 중', 'local'],
  '이 기기에 저장 중': ['이 기기에 저장 중', 'local'],
  '동기화 대기': ['클라우드 동기화 대기', 'pending'],
  '동기화 중': ['클라우드 동기화 중…', 'pending'],
  '최신 상태': ['클라우드 동기화 완료', 'synced'],
  '오프라인 저장 중': ['오프라인 · 이 기기에 저장 중', 'offline'],
  '충돌 병합 완료': ['클라우드 병합 완료', 'synced'],
  '동기화 실패': ['동기화 확인 필요', 'error']
};
function normalizeSyncBadge() {
  const badge = $('#syncBadge'), label = badge?.querySelector('span');
  if (!badge || !label) return;
  const mapped = syncBadgeLabels[label.textContent.trim()];
  if (!mapped) return;
  const [text, stateName] = mapped;
  badge.dataset.syncState = stateName;
  if (label.textContent !== text) label.textContent = text;
}
function watchSyncBadge() {
  const badge = $('#syncBadge'), label = badge?.querySelector('span');
  if (!badge || !label || typeof MutationObserver === 'undefined') return;
  normalizeSyncBadge();
  const observer = new MutationObserver(normalizeSyncBadge);
  observer.observe(label, {childList: true, characterData: true, subtree: true});
}
function resolveAppExperience({initialized = false, signedIn = false, cloudReady = false, credentialStatus = '', hasCredential = false, linkedCharacterCount = 0} = {}, {wasOnboarding = false, dismissed = false} = {}) {
  if (!initialized) return 'sync';
  if (!signedIn) return 'login';
  if (!cloudReady || credentialStatus === 'loading') return 'sync';
  if (!hasCredential) return 'credential';
  if (linkedCharacterCount < 1) return 'character';
  return wasOnboarding && !dismissed ? 'complete' : 'app';
}
function moveSharedOnboardingUi(stage) {
  const cloud = $('.cloud-section');
  const cloudMount = stage === 'login' ? $('#onboardingAuthMount') : $('#settingsAccountMount');
  if (cloud && cloudMount && cloud.parentElement !== cloudMount) cloudMount.append(cloud);
  const credential = $('.nexon-credential');
  const credentialMount = stage === 'credential' ? $('#onboardingCredentialMount') : $('#settingsCredentialMount');
  if (credential && credentialMount && credential.parentElement !== credentialMount) credentialMount.append(credential);
  const diagnostics = $('#nexonDiagnostics'), diagnosticMount = $('#settingsDiagnosticsMount');
  if (diagnostics && diagnosticMount && diagnostics.parentElement !== diagnosticMount) diagnosticMount.append(diagnostics);
}
function renderOnboardingCharacters() {
  const select = $('#onboardingLocalCharacter');
  if (!select || !state) return;
  const unlinked = state.characters.filter(character => !character.nexonCharacter?.ocid);
  const choices = unlinked.length ? unlinked : state.characters;
  select.innerHTML = choices.map(character => option(character.id, character.name)).join('');
  select.disabled = !choices.length;
  $('#onboardingCharacterSubmit').disabled = !choices.length || nexonApiState.status === 'checking';
  if (!choices.length) $('#onboardingCharacterResult').textContent = '먼저 메기 캐릭터를 추가해야 합니다. 설정에서 캐릭터를 추가한 뒤 다시 연결해주세요.';
}
function resetOnboardingCharacterCandidate() {
  onboardingCharacterCandidate = null;
  const button = $('#onboardingCharacterSubmit'), result = $('#onboardingCharacterResult');
  if (button) button.textContent = '캐릭터 확인';
  if (result) { result.className = 'onboarding-character-result muted'; result.textContent = '캐릭터명을 입력하면 연결 전에 프로필을 확인합니다.'; }
}
function renderAppExperience() {
  if (!state || !$('#onboardingShell')) return;
  const input = {
    initialized: cloudAuthUiState.initialized,
    signedIn: cloudAuthUiState.signedIn,
    cloudReady: cloudAuthUiState.ready,
    credentialStatus: nexonCredentialState.status,
    hasCredential: nexonCredentialState.hasCredential === true,
    linkedCharacterCount: state.characters.filter(character => character.nexonCharacter?.ocid).length
  };
  let stage = resolveAppExperience(input, {wasOnboarding: onboardingWasActive, dismissed: onboardingDismissed});
  if (['login', 'credential', 'character'].includes(stage)) onboardingWasActive = true;
  if (stage === 'app') onboardingDismissed = true;
  moveSharedOnboardingUi(stage);
  $('#onboardingShell').classList.toggle('hidden', stage === 'app');
  $('#appShell').classList.toggle('hidden', stage !== 'app');
  $$('#onboardingShell [data-onboarding-stage]').forEach(section => section.classList.toggle('hidden', section.dataset.onboardingStage !== stage));
  $('#onboardingIntro').classList.toggle('hidden', !['login', 'sync'].includes(stage));
  $('#onboardingSteps').classList.toggle('hidden', !['credential', 'character', 'complete'].includes(stage));
  const rank = {account: 1, credential: 2, character: 3};
  const current = stage === 'credential' ? 2 : stage === 'character' ? 3 : stage === 'complete' || stage === 'app' ? 4 : 1;
  $$('[data-onboarding-indicator]').forEach(item => {
    const value = rank[item.dataset.onboardingIndicator];
    item.classList.toggle('active', value === current);
    item.classList.toggle('done', value < current);
    item.querySelector('i').textContent = value < current ? '✓' : String(value);
  });
  if (stage === 'character') renderOnboardingCharacters();
}
function navigationSurfaceFor(page, mainTab = activeMainTab) {
  if (page === 'income') return 'income';
  if (page === 'character') return 'summary';
  return mainNavigationPages.includes(page) ? page : mainTab;
}
function applyNavigationState(buttons, surface) {
  buttons.forEach(button => {
    const target = button.dataset.navigationSurface || button.dataset.tab || '';
    const active = target === surface;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}
function activatePage(page, {updateNavigation = true} = {}) {
  if (!document.querySelector(`[data-page="${page}"]`)) return;
  if (updateNavigation && mainNavigationPages.includes(page)) activeMainTab = page;
  applyNavigationState($$('.tabs [data-tab], .tabs [data-navigation-surface]'), navigationSurfaceFor(page));
  $$('[data-page]').forEach(target => target.classList.toggle('hidden', target.dataset.page !== page));
  checkWeek();
}
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
    if (migrated) {
      migrationSyncInfo = createMigrationSyncInfo(parsed.version, next);
      localStorage.setItem(MIGRATION_SYNC_KEY, JSON.stringify(migrationSyncInfo));
    } else {
      try {
        const pending = JSON.parse(localStorage.getItem(MIGRATION_SYNC_KEY) || 'null');
        migrationSyncInfo = pending?.toVersion === STATE_VERSION && pending?.baseline ? pending : null;
        if (!migrationSyncInfo) localStorage.removeItem(MIGRATION_SYNC_KEY);
      } catch { migrationSyncInfo = null; localStorage.removeItem(MIGRATION_SYNC_KEY); }
    }
    const rolled = rollover(next); persist(next, {touch: rolled || !parsed, notify: false}); storageBlocked = false;
  } catch (error) { storageBlocked = true; state ||= emptyState(); message(`저장 중단: ${error.message} 원본을 덮어쓰지 않았습니다.`, true); }
}
function isPast() { return selectedWeek && selectedWeek !== state.currentWeek; }
function viewData() { return isPast() ? state.weeklyHistory[selectedWeek] : state; }
function transaction(change) {
  if (storageBlocked) { message('저장소를 사용할 수 없습니다. 백업을 내려받고 새로고침해 주세요.', true); return false; }
  if (isPast()) { message('과거 주차는 읽기 전용입니다. 이번 주로 돌아와 주세요.', true); return false; }
  try {
    if (localStorage.getItem(KEY) !== savedRaw) { loadState(); render(); message('다른 탭의 변경을 불러왔습니다. 확인 후 다시 입력해 주세요.', true); return false; }
    const next = copy(state), previousWeek = state.currentWeek; rollover(next); const changedWeek = previousWeek !== next.currentWeek;
    change(next); persist(next); selectedWeek = '';
    render(); message(changedWeek ? '지난 주를 마감하고 이번 주에 저장했습니다.' : '이 기기에 저장했습니다.'); return true;
  } catch (error) { message(`저장하지 못했습니다: ${error.message}`, true); return false; }
}
function checkWeek() {
  if (storageBlocked) return;
  try {
    if (localStorage.getItem(KEY) !== savedRaw) { loadState(); render(); return; }
    const next = copy(state), previousWeek = state.currentWeek;
    if (rollover(next)) {
      persist(next); render();
      message(previousWeek !== next.currentWeek ? '지난 주 기록을 보관하고 새 주차를 시작했습니다.' : '새 달 기준으로 월간 보스 상태를 갱신했습니다.');
    }
  } catch (error) { message(`주차 마감을 저장하지 못했습니다: ${error.message}`, true); }
}
function reconcileCloudSelection(previousBossCharacterId, previousWeek, nextState, previousActivityCharacterId = '') {
  const characters = Array.isArray(nextState?.characters) ? nextState.characters : [];
  const bossCharacterId = previousBossCharacterId && characters.some(character => character.id === previousBossCharacterId)
    ? previousBossCharacterId
    : characters[0]?.id || '';
  const week = previousWeek && nextState?.weeklyHistory?.[previousWeek] ? previousWeek : '';
  const activityCharacterId = previousActivityCharacterId && characters.some(character => character.id === previousActivityCharacterId)
    ? previousActivityCharacterId
    : characters[0]?.id || '';
  return {bossCharacterId, activityCharacterId, week};
}
function applyCloudState(raw) {
  if (storageBlocked) throw new Error('로컬 저장소를 사용할 수 없어 클라우드 데이터를 적용할 수 없습니다.');
  const previousBossCharacterId = selectedBossCharacterId, previousActivityCharacterId = selectedActivityCharacterId, previousWeek = selectedWeek;
  const next = migrateState(raw), previousDataWeek = next.currentWeek, rolled = rollover(next);
  const changedWeek = previousDataWeek !== next.currentWeek;
  persist(next, {touch: rolled, notify: rolled});
  const selection = reconcileCloudSelection(previousBossCharacterId, previousWeek, state, previousActivityCharacterId);
  selectedBossCharacterId = selection.bossCharacterId; selectedActivityCharacterId = selection.activityCharacterId; selectedWeek = selection.week;
  renderIncomeForm(true); render();
  message(changedWeek ? '클라우드 데이터를 불러오고 새 주차를 시작했습니다.' : rolled ? '클라우드 데이터를 불러오고 월간 보스 상태를 갱신했습니다.' : '클라우드의 최신 데이터를 반영했습니다.');
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
function weeklyActivityApiBadge(activity) {
  if (activity.apiCompleted && activity.manualOverride === false) return '<small class="api-badge manual">API 완료 · 수동 미완료</small>';
  if (activity.completionSource === 'nexon-api') return '<small class="api-badge">API 확인</small>';
  return '';
}
function nexonProfileAvatar(character, size = '') {
  const image = safeNexonImageUrl(character?.nexonCharacter?.image);
  if (!image) return '';
  return `<span class="nexon-profile-image ${escapeHtml(size)}" aria-hidden="true"><img data-nexon-profile-image src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
}
function nexonProfileLines(character) {
  const profile = character?.nexonCharacter;
  if (!profile?.ocid) return {primary: '', world: ''};
  const remoteName = profile.characterName && profile.characterName !== character.name ? profile.characterName : '';
  const levelClass = [Number.isInteger(profile.level) ? `Lv. ${profile.level}` : '', profile.className || ''].filter(Boolean).join(' ');
  return {primary: [remoteName, levelClass].filter(Boolean).join(' · '), world: profile.world || ''};
}
function nexonProfileCopy(character, className = '') {
  const profile = nexonProfileLines(character);
  return `${profile.primary ? `<span class="nexon-profile-primary ${escapeHtml(className)}">${escapeHtml(profile.primary)}</span>` : ''}${profile.world ? `<span class="nexon-profile-world">${escapeHtml(profile.world)}</span>` : ''}`;
}
function nexonStatValue(value, type) {
  if (!Number.isFinite(value)) return '';
  const formatted = value.toLocaleString('ko-KR', {maximumFractionDigits: 20});
  return type === 'percent' ? `${formatted}%` : formatted;
}
function nexonSpecSummary(character) {
  const profile = character?.nexonCharacter;
  const combatPower = Number.isInteger(profile?.combatPower) ? koreanNumber(profile.combatPower) : '정보 없음';
  const unionLevel = Number.isInteger(profile?.unionLevel) ? profile.unionLevel.toLocaleString('ko-KR') : '정보 없음';
  return `<span class="character-spec"><span><small>전투력</small><b>${escapeHtml(combatPower)}</b></span><span><small>유니온</small><b>${escapeHtml(unionLevel)}</b></span></span>`;
}
function nexonHomeCombatPower(character) {
  const combatPower = Number.isInteger(character?.nexonCharacter?.combatPower) ? koreanNumber(character.nexonCharacter.combatPower) : '정보 없음';
  return `<span class="character-spec character-home-spec"><span><small>전투력</small><b>${escapeHtml(combatPower)}</b></span></span>`;
}
function nexonStatDetails(character) {
  const stats = normalizeNexonStats(character?.nexonCharacter?.stats);
  const groups = NEXON_STAT_GROUPS.map(group => ({...group, items: group.items.filter(([key]) => Number.isFinite(stats?.[key]))})).filter(group => group.items.length);
  const detailsId = `character-stats-${character?.id || ''}`;
  if (!groups.length) return `<section id="${escapeHtml(detailsId)}" class="character-stat-details"><b>상세 스펙</b><p class="muted">상세 스펙 정보가 없습니다.</p></section>`;
  return `<section id="${escapeHtml(detailsId)}" class="character-stat-details"><b>상세 스펙</b><div class="character-stat-groups">${groups.map(group => `<section class="character-stat-group" data-stat-group="${escapeHtml(group.id)}"><h4>${escapeHtml(group.title)}</h4><dl>${group.items.map(([key, label, type]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(nexonStatValue(stats[key], type))}</dd></div>`).join('')}</dl></section>`).join('')}</div></section>`;
}
function nexonDetailCacheKey(resource, ocid) {
  return `${resource}:${ocid}`;
}
function nexonDetailCacheEntry(resource, ocid, now = Date.now()) {
  const entry = nexonDetailRuntimeCache.get(nexonDetailCacheKey(resource, ocid));
  if (!entry) return null;
  if (entry.status === 'ready' && now - entry.receivedAt >= NEXON_DETAIL_CLIENT_TTL_MS) {
    nexonDetailRuntimeCache.delete(nexonDetailCacheKey(resource, ocid));
    return null;
  }
  return entry;
}
function clearNexonDetailRuntimeCache() {
  nexonDetailRuntimeCache.clear();
  nexonEquipmentPresetSelection.clear();
  nexonEquipmentItemSelection.clear();
  nexonEquipmentDialogItems.clear();
}
function nexonDetailErrorMessage(error) {
  if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return '장비 정보는 메기 계정에 로그인한 뒤 확인할 수 있습니다.';
  if (error?.status === 409 || error?.code === 'NEXON_CREDENTIAL_REQUIRED') return '장비 정보를 보려면 NEXON 개인 API Key를 등록해주세요.';
  if (error?.status === 429 || error?.category === 'rate_limited') return 'NEXON API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  if (error?.category === 'data_preparing') return 'NEXON 장비 데이터가 아직 준비 중입니다. 잠시 후 다시 시도해주세요.';
  return error?.message || 'NEXON 장비 정보를 불러오지 못했습니다.';
}
async function fetchNexonCharacterDetail(resource, ocid, {force = false} = {}) {
  const key = nexonDetailCacheKey(resource, ocid);
  const existing = nexonDetailCacheEntry(resource, ocid);
  if (!force && existing?.status === 'ready') return existing.data;
  if (existing?.status === 'loading') return existing.promise;
  if (!nexonCredentialAuthBridge?.isSignedIn?.()) throw Object.assign(new Error('장비 정보는 메기 계정에 로그인한 뒤 확인할 수 있습니다.'), {status: 401, code: 'AUTH_REQUIRED'});
  const params = new URLSearchParams({resource, ocid});
  const promise = (async () => {
    const token = await nexonCredentialAuthBridge.getAccessToken();
    if (!token) throw Object.assign(new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.'), {status: 401, code: 'AUTH_REQUIRED'});
    const response = await fetch('/api/nexon-character-detail?' + params, {headers: {Authorization: `Bearer ${token}`}});
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok || !payload?.ok) throw Object.assign(new Error(payload?.message || 'NEXON 장비 정보를 불러오지 못했습니다.'), {
      status: response.status,
      code: payload?.code || 'NEXON_DETAIL_REQUEST_FAILED',
      category: payload?.category || '',
      source: payload?.source || '',
      upstreamMessage: payload?.upstreamMessage || ''
    });
    const data = {...payload.data, fetchedAt: payload.fetchedAt || ''};
    nexonDetailRuntimeCache.set(key, {status: 'ready', data, receivedAt: Date.now()});
    return data;
  })().catch(error => {
    nexonDetailRuntimeCache.set(key, {status: 'error', error, receivedAt: Date.now()});
    throw error;
  });
  nexonDetailRuntimeCache.set(key, {status: 'loading', promise, receivedAt: Date.now()});
  return promise;
}
async function ensureCharacterHubEquipment({force = false} = {}) {
  if (activeCharacterHubTab !== 'equipment') return;
  const character = selectedHubCharacter(viewData());
  const ocid = character?.nexonCharacter?.ocid;
  if (!ocid || !nexonCredentialAuthBridge?.isSignedIn?.() || !nexonCredentialState.hasCredential) return;
  const existing = nexonDetailCacheEntry('equipment', ocid);
  if (!force && ['loading', 'ready'].includes(existing?.status)) return existing?.promise || existing?.data;
  const request = fetchNexonCharacterDetail('equipment', ocid, {force});
  renderCharacterHub(viewData());
  try { await request; } catch {}
  if (activeCharacterHubTab === 'equipment' && selectedHubCharacter()?.id === character.id) renderCharacterHub(viewData());
}
const NEXON_EQUIPMENT_SLOT_ORDER = Object.freeze([
  '모자', '얼굴장식', '눈장식', '귀고리', '상의', '한벌옷', '하의', '신발', '장갑', '망토',
  '벨트', '포켓 아이템', '펜던트', '펜던트2', '반지1', '반지2', '반지3', '반지4',
  '무기', '보조무기', '엠블렘', '뱃지', '훈장', '안드로이드', '기계 심장'
]);
const NEXON_EQUIPMENT_SLOT_GROUPS = Object.freeze([
  {id: 'accessory', label: '장신구', slots: ['반지1', '반지2', '반지3', '반지4', '펜던트', '펜던트2', '얼굴장식', '눈장식', '귀고리', '포켓 아이템', '벨트', '뱃지', '훈장']},
  {id: 'armor', label: '방어구', slots: ['모자', '어깨장식', '상의', '한벌옷', '하의', '장갑', '신발', '망토']},
  {id: 'weapon', label: '무기·보조', slots: ['무기', '보조무기', '엠블렘', '안드로이드', '기계 심장']}
]);
const NEXON_KNOWN_EQUIPMENT_SLOTS = new Set(NEXON_EQUIPMENT_SLOT_GROUPS.flatMap(group => group.slots));
function equipmentSlotOrder(item) {
  const slot = item?.slot || item?.part || '';
  const exact = NEXON_EQUIPMENT_SLOT_ORDER.indexOf(slot);
  if (exact >= 0) return exact;
  const ring = /^반지\s*(\d)$/u.exec(slot);
  return ring ? 14 + Number(ring[1]) - 1 : NEXON_EQUIPMENT_SLOT_ORDER.length + 1;
}
function sortNexonEquipment(items) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => equipmentSlotOrder(left) - equipmentSlotOrder(right) || String(left?.slot || left?.part || '').localeCompare(String(right?.slot || right?.part || ''), 'ko'));
}
function equipmentPresetOptions(equipment) {
  return [
    {value: 'current', label: `현재 장비${Number.isInteger(equipment?.presetNo) ? ` · 프리셋 ${equipment.presetNo}` : ''}`, disabled: false},
    ...[1, 2, 3].map(number => ({value: String(number), label: `프리셋 ${number}`, disabled: !equipment?.presets?.[number]?.length}))
  ];
}
function selectedEquipmentView(ocid, equipment) {
  let selection = nexonEquipmentPresetSelection.get(ocid) || 'current';
  if (selection !== 'current' && !equipment?.presets?.[selection]?.length) {
    selection = 'current';
    nexonEquipmentPresetSelection.set(ocid, selection);
  }
  const preset = selection === 'current' ? equipment?.equipment : equipment?.presets?.[selection];
  const title = selection === 'current' ? equipment?.title : equipment?.presetTitles?.[selection];
  return {selection, items: sortNexonEquipment(preset), title};
}
function equipmentBadge(item) {
  const labels = [];
  if (Number.isInteger(item?.starforce) && item.starforce > 0) labels.push(`${item.starforce}성`);
  if (item?.potential?.grade) labels.push(item.potential.grade);
  if (item?.additionalPotential?.grade) labels.push(`에디 ${item.additionalPotential.grade}`);
  return labels.slice(0, 3).map(label => `<small>${escapeHtml(label)}</small>`).join('');
}
function equipmentImage(item, className = '') {
  const icon = typeof item?.icon === 'string' && /^https?:\/\//i.test(item.icon) ? item.icon : '';
  return icon ? `<img class="${escapeHtml(className)}" src="${escapeHtml(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="equipment-icon-placeholder" aria-hidden="true">◇</span>`;
}
function equipmentEntries(items, group) {
  return items.map((item, index) => {
    const ref = `${group}:${index}`;
    nexonEquipmentDialogItems.set(ref, item);
    return {item, ref};
  });
}
function equipmentSelectionKey(ocid, preset) {
  return `${ocid}:${preset}`;
}
function resolveEquipmentSelection(ocid, preset, entries) {
  const key = equipmentSelectionKey(ocid, preset);
  let ref = nexonEquipmentItemSelection.get(key);
  if (!entries.some(entry => entry.ref === ref)) ref = entries[0]?.ref || '';
  if (ref) nexonEquipmentItemSelection.set(key, ref);
  return ref;
}
function renderEquipmentCards(entries, selectedRef = '') {
  if (!entries.length) return '<p class="empty compact-empty">표시할 장비가 없습니다.</p>';
  return `<div class="equipment-grid">${entries.map(({item, ref}) => `<button type="button" class="equipment-card ${ref === selectedRef ? 'selected' : ''}" data-equipment-item="${escapeHtml(ref)}" aria-pressed="${ref === selectedRef}" aria-label="${escapeHtml(item.name || item.slot || '장비')} 상세 보기">${equipmentImage(item, 'equipment-card-icon')}<span><small>${escapeHtml(item.slot || item.part || '기타 장비')}</small><b>${escapeHtml(item.name || '이름 없는 장비')}</b><span class="equipment-card-badges">${equipmentBadge(item)}</span></span></button>`).join('')}</div>`;
}
function renderEquipmentSlot(entry, slot, selectedRef) {
  if (!entry) return `<div class="equipment-slot empty" aria-label="${escapeHtml(slot)} 장비 없음"><span class="equipment-slot-icon" aria-hidden="true">◇</span><small>${escapeHtml(slot)}</small></div>`;
  const {item, ref} = entry;
  return `<button type="button" class="equipment-slot ${ref === selectedRef ? 'selected' : ''}" data-equipment-item="${escapeHtml(ref)}" aria-pressed="${ref === selectedRef}" aria-label="${escapeHtml(item.name || slot)} 상세 보기">${equipmentImage(item, 'equipment-slot-icon')}<span class="equipment-slot-copy"><small>${escapeHtml(slot)}</small><b>${escapeHtml(item.name || '이름 없는 장비')}</b><span class="equipment-card-badges">${equipmentBadge(item)}</span></span></button>`;
}
function renderEquipmentSlotBoard(entries, selectedRef) {
  const bySlot = new Map(entries.map(entry => [String(entry.item?.slot || entry.item?.part || '').trim(), entry]));
  return `<div class="equipment-slot-board">${NEXON_EQUIPMENT_SLOT_GROUPS.map(group => `<section class="equipment-slot-group" data-equipment-slot-group="${group.id}"><h5>${group.label}</h5><div class="equipment-slot-grid">${group.slots.map(slot => renderEquipmentSlot(bySlot.get(slot), slot, selectedRef)).join('')}</div></section>`).join('')}</div>`;
}
function renderEquipmentExtraSection(entries, selectedRef, title = '추가 장비') {
  if (!entries.length) return '';
  return `<section class="equipment-extra-section"><h5>${escapeHtml(title)} <small>${entries.length}개</small></h5><div class="equipment-extra-list">${entries.map(entry => renderEquipmentSlot(entry, entry.item?.slot || entry.item?.part || '기타 장비', selectedRef)).join('')}</div></section>`;
}
function renderCharacterHubEquipment(character) {
  const profile = character?.nexonCharacter;
  if (!profile?.ocid) return '<div class="character-hub-equipment-state"><h3>장비</h3><p class="muted">NEXON 캐릭터를 연동하면 현재 장비를 확인할 수 있습니다.</p></div>';
  if (!nexonCredentialAuthBridge?.isSignedIn?.()) return '<div class="character-hub-equipment-state"><h3>장비</h3><p class="muted">장비 정보는 메기 계정에 로그인한 뒤 확인할 수 있습니다.</p></div>';
  if (!nexonCredentialState.hasCredential) return '<div class="character-hub-equipment-state"><h3>장비</h3><p class="muted">장비 정보를 보려면 NEXON 개인 API Key를 등록해주세요.</p><button type="button" class="ghost compact" data-equipment-open-settings>설정에서 API Key 등록</button></div>';
  const entry = nexonDetailCacheEntry('equipment', profile.ocid);
  if (!entry || entry.status === 'loading') return '<div class="character-hub-equipment-state" aria-busy="true"><span class="equipment-loading" aria-hidden="true"></span><p>장비 정보를 불러오는 중…</p></div>';
  if (entry.status === 'error') return `<div class="character-hub-equipment-state"><h3>장비 정보를 불러오지 못했습니다.</h3><p class="muted">${escapeHtml(nexonDetailErrorMessage(entry.error))}</p><button type="button" class="ghost compact" data-equipment-retry>다시 시도</button></div>`;
  nexonEquipmentDialogItems.clear();
  const equipment = entry.data || {}, view = selectedEquipmentView(profile.ocid, equipment);
  const selectOptions = equipmentPresetOptions(equipment).map(item => `<option value="${item.value}" ${item.value === view.selection ? 'selected' : ''} ${item.disabled ? 'disabled' : ''}>${escapeHtml(item.label)}</option>`).join('');
  const mainEntries = equipmentEntries(view.items, 'main');
  const dragonEntries = equipmentEntries(sortNexonEquipment(equipment.dragonEquipment || []), 'dragon');
  const mechanicEntries = equipmentEntries(sortNexonEquipment(equipment.mechanicEquipment || []), 'mechanic');
  const allEntries = [...mainEntries, ...dragonEntries, ...mechanicEntries];
  const selectedRef = resolveEquipmentSelection(profile.ocid, view.selection, allEntries);
  const selectedItem = allEntries.find(item => item.ref === selectedRef)?.item;
  const extraEntries = mainEntries.filter(entry => !NEXON_KNOWN_EQUIPMENT_SLOTS.has(String(entry.item?.slot || entry.item?.part || '').trim()));
  const fetchedAt = nexonCheckedLabel(equipment.fetchedAt);
  const titleMarkup = view.title ? `<section class="equipment-title-card"><div>${equipmentImage(view.title, 'equipment-title-icon')}</div><span><small>칭호</small><b>${escapeHtml(view.title.name || '칭호')}</b>${view.title.description ? `<p>${escapeHtml(view.title.description)}</p>` : ''}</span></section>` : '';
  const dragonMobile = dragonEntries.length ? `<section class="equipment-section"><h4>용 장비 <small>${dragonEntries.length}개</small></h4>${renderEquipmentCards(dragonEntries, selectedRef)}</section>` : '';
  const mechanicMobile = mechanicEntries.length ? `<section class="equipment-section"><h4>메카닉 장비 <small>${mechanicEntries.length}개</small></h4>${renderEquipmentCards(mechanicEntries, selectedRef)}</section>` : '';
  const specialDesktop = `${renderEquipmentExtraSection(dragonEntries, selectedRef, '용 장비')}${renderEquipmentExtraSection(mechanicEntries, selectedRef, '메카닉 장비')}`;
  return `<div class="character-hub-equipment"><div class="equipment-toolbar"><div><h3>장비</h3><p class="muted">NEXON 현재 조회 기준${fetchedAt ? ` · ${escapeHtml(fetchedAt)}` : ''}</p></div><label>장비 프리셋<select data-equipment-preset aria-label="장비 프리셋 선택">${selectOptions}</select><small>적용 중 · ${escapeHtml(equipmentPresetOptions(equipment).find(item => item.value === view.selection)?.label || '현재 장비')}</small></label></div>${isPast() ? '<p class="notice equipment-history-notice">장비는 과거 주차 스냅샷이 아닌 현재 NEXON 조회 결과입니다.</p>' : ''}${titleMarkup}<div class="equipment-mobile-list"><section class="equipment-section"><h4>장착 장비 <small>${view.items.length}개</small></h4>${renderEquipmentCards(mainEntries, selectedRef)}</section>${dragonMobile}${mechanicMobile}</div><div class="equipment-desktop-viewer"><div class="equipment-loadout"><div class="equipment-loadout-head"><h4>장착 장비</h4><small>슬롯을 선택하면 오른쪽에서 상세 옵션을 확인할 수 있습니다.</small></div>${renderEquipmentSlotBoard(mainEntries, selectedRef)}${renderEquipmentExtraSection(extraEntries, selectedRef)}${specialDesktop}</div><aside class="equipment-inline-detail" aria-label="선택 장비 상세" aria-live="polite">${selectedItem ? renderEquipmentDetailMarkup(selectedItem) : '<p class="empty compact-empty">선택할 장비가 없습니다.</p>'}</aside></div></div>`;
}
const EQUIPMENT_OPTION_LABELS = Object.freeze({
  str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', max_hp: '최대 HP', max_mp: '최대 MP',
  max_hp_rate: '최대 HP(%)', max_mp_rate: '최대 MP(%)', attack_power: '공격력', magic_power: '마력',
  armor: '방어력', speed: '이동속도', jump: '점프력', boss_damage: '보스 데미지',
  ignore_monster_armor: '방어율 무시', all_stat: '올스탯', damage: '데미지',
  equipment_level_decrease: '착용 레벨 감소', base_equipment_level: '기본 장비 레벨'
});
function equipmentHasValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== '0';
}
function renderEquipmentOptionRows(options) {
  const rows = Object.entries(options || {}).filter(([key, value]) => Object.hasOwn(EQUIPMENT_OPTION_LABELS, key) && equipmentHasValue(value));
  if (!rows.length) return '';
  return `<dl class="equipment-option-list">${rows.map(([key, value]) => `<div><dt>${escapeHtml(EQUIPMENT_OPTION_LABELS[key])}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}
function renderEquipmentDetailSection(title, content) {
  return content ? `<section class="equipment-detail-section"><h3>${escapeHtml(title)}</h3>${content}</section>` : '';
}
function renderEquipmentDetailMarkup(item) {
  const potential = Array.isArray(item?.potential?.options) ? item.potential.options : [];
  const additionalPotential = Array.isArray(item?.additionalPotential?.options) ? item.additionalPotential.options : [];
  const enhancements = [
    [Number.isInteger(item.starforce), '스타포스', `${item.starforce}성`],
    [Number.isInteger(item.scrollUpgrade), '업그레이드', `${item.scrollUpgrade}회`],
    [Number.isInteger(item.exceptionalUpgrade), '익셉셔널', `${item.exceptionalUpgrade}회`],
    [Number.isInteger(item.specialRingLevel), '특수 반지 Lv.', String(item.specialRingLevel)]
  ].filter(([visible]) => visible);
  return `<header class="equipment-detail-head">${equipmentImage(item, 'equipment-detail-icon')}<div><small>${escapeHtml(item.slot || item.part || '기타 장비')}</small><b>${escapeHtml(item.name || '이름 없는 장비')}</b>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}</div></header>${renderEquipmentDetailSection('강화', enhancements.length ? `<dl class="equipment-enhancement-list">${enhancements.map(([, label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '')}${renderEquipmentDetailSection(item.potential?.grade ? `잠재능력 · ${item.potential.grade}` : '잠재능력', potential.map(value => `<p>${escapeHtml(value)}</p>`).join(''))}${renderEquipmentDetailSection(item.additionalPotential?.grade ? `에디셔널 잠재능력 · ${item.additionalPotential.grade}` : '에디셔널 잠재능력', additionalPotential.map(value => `<p>${escapeHtml(value)}</p>`).join(''))}${renderEquipmentDetailSection('소울', [item.soul?.name, item.soul?.option].filter(Boolean).map(value => `<p>${escapeHtml(value)}</p>`).join(''))}${renderEquipmentDetailSection('총 옵션', renderEquipmentOptionRows(item.options?.total))}${item.expiresAt ? `<p class="muted equipment-expiry">유효기간 ${escapeHtml(item.expiresAt)}</p>` : ''}`;
}
function openEquipmentDetail(item) {
  const dialog = $('#equipmentDetailDialog');
  if (!dialog || !item) return;
  $('#equipmentDetailTitle').textContent = item.name || item.slot || '장비 상세';
  $('#equipmentDetailBody').innerHTML = renderEquipmentDetailMarkup(item);
  dialog.showModal();
}
function equipmentUsesInlineDetail() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1100px)').matches;
}
function selectedHubCharacter(data = viewData()) {
  const list = data?.characters || [];
  if (!list.some(character => character.id === selectedHubCharacterId)) selectedHubCharacterId = list[0]?.id || '';
  return list.find(character => character.id === selectedHubCharacterId) || null;
}
function renderHomeCharacterCard(character, data) {
  const stats = characterStats(character);
  const weekId = data?.weekId || data?.currentWeek || '';
  return `<article class="character character-summary-card" data-character="${escapeHtml(character.id)}"><span class="character-main"><span class="character-identity">${nexonProfileAvatar(character, 'summary-art')}<span class="character-identity-copy"><b>${escapeHtml(character.name)}</b>${nexonProfileCopy(character)}</span></span></span>${nexonHomeCombatPower(character)}<span class="character-progress"><span class="character-progress-head"><small>보스 ${stats.done} / ${stats.count}</small><span class="character-weekly-income"><small>보스 수익</small><strong class="mint">${money(bossIncomeForWeek(character, weekId))}</strong></span></span><progress value="${stats.done}" max="${stats.count || 1}" aria-label="${escapeHtml(character.name)} 주간 보스 진행률"></progress></span><button type="button" class="character-detail-button" data-character-detail aria-label="${escapeHtml(character.name)} 캐릭터 상세 보기">상세 보기 <span aria-hidden="true">›</span></button></article>`;
}
function characterHubHero(character) {
  const profile = character?.nexonCharacter, linked = !!profile?.ocid;
  const combatPower = Number.isInteger(profile?.combatPower) ? koreanNumber(profile.combatPower) : '정보 없음';
  const unionLevel = Number.isInteger(profile?.unionLevel) ? profile.unionLevel.toLocaleString('ko-KR') : '정보 없음';
  const unionGrade = profile?.unionGrade ? ` · ${escapeHtml(profile.unionGrade)}` : '';
  return `<div class="character-hub-identity">${nexonProfileAvatar(character, 'hub-art')}<div><span class="character-hub-link-state ${linked ? 'linked' : ''}">NEXON ${linked ? '● 연결됨' : '미연동'}</span><h2 id="characterHubTitle">${escapeHtml(character.name)}</h2>${nexonProfileCopy(character, 'hub-profile-line')}</div></div><dl class="character-hub-core-stats"><div><dt>전투력</dt><dd>${escapeHtml(combatPower)}</dd></div><div><dt>유니온</dt><dd>${escapeHtml(unionLevel)}${unionGrade}</dd></div></dl>`;
}
function renderCharacterHubOverview(character, data) {
  const stats = characterStats(character), percent = stats.count ? Math.round(stats.done / stats.count * 100) : 0;
  const activities = normalizeWeeklyActivities(character.weeklyActivities, 'character', true);
  const accountActivities = normalizeWeeklyActivities(data?.accountWeeklyActivities, 'account', true);
  const characterDone = activities.filter(activity => activity.done).length, accountDone = accountActivities.filter(activity => activity.done).length;
  const profile = character.nexonCharacter, checkedAt = profile?.profileCheckedAt || profile?.statsCheckedAt || profile?.lastCheckedAt;
  return `<div class="character-hub-overview"><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>이번 주 보스</h3><p class="muted">주간 보스 진행과 수익</p></div><strong>${stats.done} / ${stats.count}</strong></div><progress value="${stats.done}" max="${stats.count || 1}" aria-label="${escapeHtml(character.name)} 주간 보스 진행률"></progress><dl class="character-hub-income-grid"><div><dt>완료 수익</dt><dd>${money(stats.earned)}</dd></div><div><dt>예상 수익</dt><dd>${money(stats.expected)}</dd></div><div><dt>남은 수익</dt><dd>${money(stats.remaining)}</dd></div></dl><small class="muted">진행률 ${percent}%</small></section><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>주간 콘텐츠</h3><p class="muted">범위별 완료 상태</p></div></div><dl class="character-hub-activity-summary"><div><dt>캐릭터별 콘텐츠</dt><dd>${characterDone} / ${activities.length}</dd></div><div><dt>계정 공용 콘텐츠</dt><dd>${accountDone} / ${accountActivities.length}</dd></div></dl></section><section class="character-hub-section character-hub-nexon-info"><div class="character-hub-section-head"><div><h3>NEXON 정보</h3><p class="muted">저장된 프로필 기준</p></div></div><dl><div><dt>연동 상태</dt><dd>${profile?.ocid ? '연결됨' : '미연동'}</dd></div><div><dt>마지막 프로필 확인</dt><dd>${escapeHtml(nexonCheckedLabel(checkedAt))}</dd></div></dl></section><button type="button" class="ghost character-hub-manage" data-hub-boss-manage>보스 관리 ›</button></div>`;
}
function renderCharacterHubStats(character) {
  return `<div class="character-hub-stats">${nexonSpecSummary(character)}${nexonStatDetails(character)}</div>`;
}
function characterHubBossRows(character, data, monthly = false) {
  const weekId = data?.weekId || data?.currentWeek || selectedWeek || '';
  const bosses = normalizeBosses(character.bosses).filter(boss => isMonthlyBoss(boss) === monthly);
  if (!bosses.length) return '<p class="empty compact-empty">등록된 보스가 없습니다.</p>';
  return `<div class="character-hub-status-list">${bosses.map(boss => {
    const done = bossDoneForView(boss, data);
    const value = monthly && isPast() ? monthlyBossIncomeForWeek(boss, weekId) || bossValue(boss) : done && boss.completedIncome != null ? boss.completedIncome : bossValue(boss);
    return `<div class="character-hub-status-row ${done ? 'completed' : ''}"><span class="character-hub-status-icon" aria-hidden="true">${done ? '✓' : '○'}</span><b>${escapeHtml(boss.name)}</b><small>${escapeHtml(boss.difficulty)}</small><span>${done ? '완료' : '미완료'}</span><strong>${money(value)}</strong></div>`;
  }).join('')}</div>`;
}
function characterHubActivityRows(activities) {
  if (!activities.length) return '<p class="empty compact-empty">표시할 주간 콘텐츠가 없습니다.</p>';
  return `<div class="character-hub-status-list">${activities.map(activity => `<div class="character-hub-status-row activity ${activity.done ? 'completed' : ''}"><span class="character-hub-status-icon" aria-hidden="true">${activity.done ? '✓' : '○'}</span><b>${escapeHtml(activity.name)}</b><span>${activity.done ? '완료' : '미완료'}</span></div>`).join('')}</div>`;
}
function renderCharacterHubContent(character, data) {
  const activities = normalizeWeeklyActivities(character.weeklyActivities, 'character', true);
  const accountActivities = normalizeWeeklyActivities(data?.accountWeeklyActivities, 'account', true);
  return `<div class="character-hub-content"><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>주간 보스</h3><p class="muted">선택한 난이도와 현재 완료 상태</p></div></div>${characterHubBossRows(character, data)}</section><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>월간 보스</h3><p class="muted">기존 월간 완료 기록 기준</p></div></div>${characterHubBossRows(character, data, true)}</section><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>캐릭터별 주간 콘텐츠</h3></div></div>${characterHubActivityRows(activities)}</section><section class="character-hub-section"><div class="character-hub-section-head"><div><h3>계정 공용 콘텐츠</h3></div></div>${characterHubActivityRows(accountActivities)}</section><button type="button" class="ghost character-hub-manage" data-hub-boss-manage>보스 관리 ›</button></div>`;
}
function renderCharacterHub(data = viewData()) {
  const character = selectedHubCharacter(data), characters = data?.characters || [];
  const selector = $('#characterHubSelect'), hero = $('#characterHubHero'), panel = $('#characterHubPanel');
  if (!selector || !hero || !panel) return;
  selector.innerHTML = characters.map(item => option(item.id, item.name, item.id === character?.id)).join('');
  selector.disabled = !characters.length;
  $$('[data-character-hub-tab]').forEach(button => {
    const active = button.dataset.characterHubTab === activeCharacterHubTab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  });
  if (!character) {
    hero.innerHTML = '<h2 id="characterHubTitle">캐릭터 허브</h2><p class="empty">저장된 캐릭터가 없습니다.</p>';
    panel.innerHTML = '<p class="empty">캐릭터를 추가하면 프로필과 주간 현황을 확인할 수 있습니다.</p>';
    return;
  }
  hero.innerHTML = characterHubHero(character);
  panel.innerHTML = activeCharacterHubTab === 'stats'
    ? renderCharacterHubStats(character)
    : activeCharacterHubTab === 'equipment'
      ? renderCharacterHubEquipment(character)
    : activeCharacterHubTab === 'content'
      ? renderCharacterHubContent(character, data)
      : renderCharacterHubOverview(character, data);
}
function openCharacterHub(characterId) {
  const characters = viewData()?.characters || [];
  selectedHubCharacterId = characters.some(character => character.id === characterId) ? characterId : characters[0]?.id || '';
  activeCharacterHubTab = 'overview';
  renderCharacterHub(viewData());
  activatePage('character');
}
function render() {
  if (selectedWeek && !state.weeklyHistory[selectedWeek]) selectedWeek = '';
  const data = viewData(), totals = isPast() ? snapshotTotals(data) : totalsFor(state), current = totalsFor(state);
  const huntSummary = summarizeHuntRecords(data.incomes, data.weekId || data.currentWeek || '');
  $('#headerTotal').textContent = koreanMeso(current.total + Object.values(state.weeklyHistory).reduce((sum, s) => sum + snapshotTotals(s).total, 0));
  $('#headerWeek').textContent = koreanMeso(current.total); $('#weekLabel').textContent = shortWeek(state.currentWeek);
  $('#weekSelect').innerHTML = option('', `이번 주 · ${shortWeek(state.currentWeek)}`, !isPast()) + Object.keys(state.weeklyHistory).sort().reverse().map(key => option(key, `${key.slice(0, 4)} · ${validWeek(key) ? shortWeek(key) : key}`, key === selectedWeek)).join('');
  $('#weekStatus').textContent = isPast() ? '마감한 주차 · 읽기 전용' : '진행 중 · 현지 시간 목요일 00:00 자동 마감';
  $('#returnCurrent').classList.toggle('hidden', !isPast());
  $('#summaryTitle').textContent = isPast() ? '조회 주차 수익' : '이번 주 수익';
  $('#totalIncome').textContent = koreanMeso(totals.total); $('#totalIncomeText').textContent = `${won(totals.total)} 메소`;
  const bossProgress = (data.characters || []).reduce((result, character) => {
    const stats = characterStats(character); result.done += stats.done; result.total += stats.count; return result;
  }, {done: 0, total: 0});
  const activityRows = [...(data.accountWeeklyActivities || []), ...(data.characters || []).flatMap(character => character.weeklyActivities || [])];
  const activityProgress = {done: activityRows.filter(activity => activity.done).length, total: activityRows.length};
  $('#homeProgress').innerHTML = `<span><small>보스</small><b>${bossProgress.done} / ${bossProgress.total}</b></span><span><small>주간 콘텐츠</small><b>${activityProgress.done} / ${activityProgress.total}</b></span>`;
  $('#metrics').innerHTML = Object.entries(labels).map(([key, label]) => `<div class="metric${key === 'hunt' ? ' metric-hunt' : ''}"><small>${label}</small><b>${money(totals[key])}</b>${key === 'hunt' ? `<dl class="hunt-resource-summary"><div><dt>메소 획득</dt><dd title="${won(huntSummary.mesoAcquired)} 메소">${koreanMeso(huntSummary.mesoAcquired)} 메소</dd></div><div><dt>솔 에르다 조각</dt><dd>${won(huntSummary.solErdaPieces)}개 획득</dd></div></dl>` : ''}</div>`).join('');
  $('#characterList').innerHTML = (data.characters || []).map(character => renderHomeCharacterCard(character, data)).join('') || '<p class="empty">저장된 캐릭터가 없습니다.</p>';
  $('#addCharacter').disabled = !!isPast() || storageBlocked; $('#incomeFields').disabled = !!isPast() || storageBlocked;
  $('#incomeReadOnly').classList.toggle('hidden', !isPast()); $('#resetAll').disabled = !!isPast(); $('#resetWeek').disabled = !!isPast();
  renderWeeklyActivities(data); renderBosses(data); renderCharacterHub(data); renderHistory(data); renderHomeRecent(data); renderPrices(); renderSettings();
  const homeNexon = $('#homeNexonStatus');
  if (homeNexon) {
    const summary = nexonConnectionStatusSummary(state.characters, nexonCredentialState, cloudAuthUiState.signedIn, nexonApiState);
    const normal = summary.character.tone === 'success' && summary.credential.tone === 'success' && !['warning', 'error'].includes(nexonApiState.status);
    homeNexon.textContent = normal ? 'NEXON ● 정상' : 'NEXON 확인 필요';
    homeNexon.classList.toggle('warning', !normal);
  }
  $('#migrationNote').textContent = state.migrationNote || '기존 기록과 캐릭터 설정을 이 기기에 보관합니다.';
  const recovery = (state.unassignedIncomes?.length || 0) + (state.recoveredWeeks?.length || 0);
  $('#recoveryNote').textContent = recovery ? `마감 기록과 겹칠 수 있는 이전 데이터 ${recovery}건은 중복 합산 없이 백업에 별도 보관했습니다.` : '';
  if (!$('#characterDialog').open) $('#characterPreset').innerHTML = presetOptions();
  if (!$('#presetDialog').open) $('#presetSelect').innerHTML = presetOptions();
  renderAppExperience();
}
function bossDoneForView(boss, data) {
  if (!isMonthlyBoss(boss)) return !!boss.done;
  if (!isPast()) return !!boss.done;
  const weekId = data?.weekId || selectedWeek || '';
  return Object.values(normalizeMonthlyCompletions(boss.monthlyCompletions)).some(entry => entry.weekId === weekId);
}
function renderBossRows(entries, data, disabled = '') {
  return entries.map(({b, bi}) => {
    const done = bossDoneForView(b, data), diffs = Object.keys(bossDB[b.name] || {[b.difficulty]: b.price});
    const value = isMonthlyBoss(b) && isPast()
      ? monthlyBossIncomeForWeek(b, data?.weekId || selectedWeek || '') || bossValue(b)
      : done && b.completedIncome != null ? b.completedIncome : bossValue(b);
    return `<div class="boss-line ${done ? 'completed' : ''}" data-bi="${bi}"><label class="boss-name"><input type="checkbox" data-field="done" aria-label="${escapeHtml(b.name)} 완료" ${done ? 'checked' : ''} ${disabled}><span>${escapeHtml(b.name)}${bossApiBadge(b)}</span></label><strong class="boss-earned mint">${money(value)}</strong><div class="boss-controls"><select data-field="difficulty" aria-label="${escapeHtml(b.name)} 난이도" ${disabled}>${diffs.map(d => option(d, d, d === b.difficulty)).join('')}</select><select data-field="party" aria-label="${escapeHtml(b.name)} 파티 인원" ${disabled}>${Array.from({length: Math.max(6, b.party)}, (_, i) => option(i + 1, i === 0 ? '솔로' : `${i + 1}인`, i + 1 === b.party)).join('')}</select><button class="icon danger" data-action="remove-boss" aria-label="${escapeHtml(b.name)} 삭제" ${disabled}>×</button></div><details class="boss-price-detail"><summary>결정석 ${won(b.price)} · 가격 수정</summary><label>결정석 전체 가격<input class="money-input" data-field="price" inputmode="numeric" value="${won(b.price)}" ${disabled}><small class="money-hint">${koreanMeso(b.price)} 메소</small></label></details></div>`;
  }).join('');
}
function renderBosses(data) {
  const disabled = isPast() || storageBlocked ? 'disabled' : '';
  const characters = data.characters || [], c = selectedCharacter(data), ci = c ? characters.findIndex(x => x.id === c.id) : -1;
  $('#bossCharacterSelect').innerHTML = characters.map(character => option(character.id, character.name, character.id === c?.id)).join('');
  $('#bossCharacterSelect').disabled = !characters.length;
  $('#addCharacterFromBoss').disabled = !!disabled;
  $('#characterMenu').classList.toggle('hidden', !c || !!disabled);
  if (!c) { $('#bossEditor').innerHTML = '<p class="empty">캐릭터를 추가해 주세요.</p>'; return; }
  const list = normalizeBosses(c.bosses), stats = characterStats(c), viewWeek = data.weekId || data.currentWeek || '';
  const entries = list.map((b, bi) => ({b, bi}));
  const filterEntries = source => source.filter(({b}) => {
    const done = bossDoneForView(b, data);
    return bossFilter === 'all' || (bossFilter === 'done' ? done : !done);
  });
  const weekly = filterEntries(entries.filter(({b}) => !isMonthlyBoss(b)));
  const monthly = filterEntries(entries.filter(({b}) => isMonthlyBoss(b)));
  const monthlyAll = entries.filter(({b}) => isMonthlyBoss(b)), monthlyDone = monthlyAll.filter(({b}) => bossDoneForView(b, data)).length;
  const monthlyMeta = isPast() ? '조회 주차에 완료한 월간 기록' : `${monthLabel(monthKey(new Date()))} · 매월 1일 00:00 초기화`;
  $('#bossEditor').innerHTML = `<section class="boss-char" data-ci="${ci}"><div class="panel-head boss-profile-head"><div class="boss-profile-identity">${nexonProfileAvatar(c, 'boss-art')}<div><h3>${escapeHtml(c.name)}</h3>${nexonProfileCopy(c)}<small class="muted">주간 ${stats.done} / ${stats.count} 완료 · 이번 주 보스 수익 ${koreanMeso(bossIncomeForWeek(c, viewWeek))}</small></div></div></div><section class="boss-cycle-section weekly-cycle"><div class="boss-cycle-head"><div><h3>주간 보스</h3><p class="muted">목요일 00:00 초기화</p></div><strong>${stats.done} / ${stats.count}</strong></div>${renderBossRows(weekly, data, disabled) || '<p class="empty compact-empty">이 필터에 해당하는 주간 보스가 없습니다.</p>'}<div class="boss-actions"><button class="ghost" data-action="add-boss" ${disabled}>+ 보스 등록</button></div></section><section class="boss-cycle-section monthly-cycle"><div class="boss-cycle-head"><div><h3>월간 보스</h3><p class="muted">${escapeHtml(monthlyMeta)}</p></div><strong>${monthlyDone} / ${monthlyAll.length}</strong></div>${renderBossRows(monthly, data, disabled) || '<p class="empty compact-empty">이 필터에 해당하는 월간 보스가 없습니다.</p>'}</section></section>`;
}
function renderWeeklyActivities(data) {
  const target = $('#weeklyActivityList');
  if (!target) return;
  const disabled = isPast() || storageBlocked ? 'disabled' : '', characters = data?.characters || [];
  const accountActivities = normalizeWeeklyActivities(data?.accountWeeklyActivities, 'account', true);
  const accountDone = accountActivities.filter(activity => activity.done).length;
  const progressBadge = (done, total) => `<span class="weekly-activity-progress ${total > 0 && done === total ? 'complete' : done > 0 ? 'partial' : ''}">${done} / ${total} 완료</span>`;
  const activityRows = (activities, scope) => `<div class="weekly-activity-card">${activities.map((activity, index) => `<label class="weekly-activity-row ${activity.done ? 'completed' : ''}" data-ai="${index}"><input type="checkbox" data-activity-done data-activity-scope="${scope}" aria-label="${escapeHtml(activity.name)} 완료" ${activity.done ? 'checked' : ''} ${disabled}><span class="weekly-activity-name"><b>${escapeHtml(activity.name)}</b></span>${weeklyActivityApiBadge(activity)}<strong>${activity.done ? '완료' : '미완료'}</strong></label>`).join('')}</div>`;
  const accountHtml = `<section class="weekly-activity-scope account-scope"><div class="weekly-activity-scope-head"><div class="weekly-activity-scope-copy"><div class="weekly-activity-scope-title"><b>계정 공용</b>${progressBadge(accountDone, accountActivities.length)}</div><small>캐릭터 선택과 관계없이 함께 적용됩니다.</small></div></div>${activityRows(accountActivities, 'account')}</section>`;
  if (!characters.length) {
    selectedActivityCharacterId = '';
    target.innerHTML = `${accountHtml}<section class="weekly-activity-scope character-scope"><div class="weekly-activity-scope-head"><div class="weekly-activity-scope-copy"><div class="weekly-activity-scope-title"><b>캐릭터별</b></div><small>선택한 캐릭터의 주간 콘텐츠</small></div></div><p class="empty compact-empty">캐릭터를 등록하면 캐릭터별 주간 콘텐츠를 관리할 수 있습니다.</p></section>`;
    return;
  }
  if (!characters.some(character => character.id === selectedActivityCharacterId)) selectedActivityCharacterId = characters[0].id;
  const character = characters.find(item => item.id === selectedActivityCharacterId) || characters[0];
  const activities = normalizeWeeklyActivities(character.weeklyActivities, 'character', true), done = activities.filter(activity => activity.done).length;
  const characterOptions = characters.map(item => option(item.id, item.name, item.id === character.id)).join('');
  const characterHtml = `<section class="weekly-activity-scope character-scope" data-activity-character-id="${escapeHtml(character.id)}"><div class="weekly-activity-scope-head character-picker-head"><div class="weekly-activity-scope-copy"><div class="weekly-activity-scope-title"><b>캐릭터별</b>${progressBadge(done, activities.length)}</div><small>선택한 캐릭터의 주간 콘텐츠</small></div><label class="weekly-activity-character-picker"><span class="sr-only">주간 콘텐츠 캐릭터 선택</span><select id="weeklyActivityCharacterSelect" aria-label="주간 콘텐츠 캐릭터 선택" ${disabled}>${characterOptions}</select></label></div>${activityRows(activities, 'character')}</section>`;
  target.innerHTML = `${accountHtml}${characterHtml}`;
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
function renderHomeRecent(data) {
  const target = $('#homeRecentRecords');
  if (!target) return;
  const rows = (data.incomes || []).map((row, index) => ({row, index})).sort((a, b) => n(b.row.createdAt) - n(a.row.createdAt) || b.index - a.index).slice(0, 3);
  target.innerHTML = rows.map(({row}) => {
    const value = incomeValue(row), kind = recordKind(row);
    const category = labels[row.category] || row.categoryLabel || '기타';
    const detail = kind === 'income' ? '직접 획득' : kind === 'acquired' ? `${won(row.qty ?? row.quantity)}개 · 미판매` : `${won(row.qty ?? row.quantity)}개 판매`;
    return `<div class="home-recent-row"><b>${escapeHtml(row.item)}</b><strong class="${kind === 'acquired' ? 'muted' : value < 0 ? 'negative' : 'mint'}">${kind === 'acquired' ? '—' : `${value >= 0 ? '+' : ''}${koreanMeso(value)}`}</strong><small class="home-recent-detail">${escapeHtml(category)} · ${escapeHtml(detail)}</small><small class="home-recent-time">${escapeHtml(historyDate(row))}</small></div>`;
  }).join('') || '<p class="empty compact-empty">아직 저장된 수익 기록이 없습니다.</p>';
}
function renderHistory(data) {
  const rows = (data.incomes || []).map((row, index) => ({row, index})).filter(({row}) => historyMatches(row)).sort((a, b) => n(b.row.createdAt) - n(a.row.createdAt) || b.index - a.index);
  $('#incomeHistory').innerHTML = rows.map(({row: r}) => {
    const kind = recordKind(r), value = incomeValue(r), qty = won(r.qty ?? r.quantity);
    const feeRecorded = kind === 'sold' && r.feeRate != null && r.grossSale != null && r.feeAmount != null && r.netSale != null;
    const category = escapeHtml(labels[r.category] || r.categoryLabel || '기타');
    const item = escapeHtml(r.item);
    const unitPrice = n(r.salePrice ?? r.price ?? r.unitPrice);
    const detail = kind === 'income'
      ? '직접 획득'
      : kind === 'acquired'
        ? `${qty}개 · 미판매`
        : feeRecorded
          ? `${qty}개 판매 · 개당 ${koreanMeso(unitPrice)} · 수수료 ${saleFeePercent(r.feeRate)}%`
          : `${qty}개 판매 · 기존 계산값`;
    const result = kind === 'income'
      ? `<small>획득</small><span class="${value < 0 ? 'negative' : 'mint'}">${value >= 0 ? '+' : ''}${koreanMeso(value)}</span>`
      : kind === 'sold'
        ? `<small>실수령</small><span class="${value < 0 ? 'negative' : 'mint'}">${value >= 0 ? '+' : ''}${koreanMeso(value)}</span>`
        : '<span class="muted">—</span>';
    const disabled = isPast() || storageBlocked;
    return `<article class="history-item compact-record"><span class="record-category">${category}</span><div class="record-item"><b><span class="record-category-inline">${category} · </span>${item}</b>${r.memo ? `<small class="record-memo muted">${escapeHtml(r.memo)}</small>` : ''}</div><p class="record-detail ${kind === 'acquired' ? 'pending' : value < 0 ? 'negative' : 'mint'}">${escapeHtml(detail)}</p><strong class="record-value">${result}</strong><small class="record-time muted">${escapeHtml(historyDate(r))}</small><details class="more-menu record-more ${disabled ? 'hidden' : ''}"><summary aria-label="${item} 기록 메뉴">⋯</summary><div class="more-menu-popover"><button type="button" data-income-action="edit" data-income-id="${escapeHtml(r.id)}">수정</button><button type="button" class="danger-text" data-income-action="delete" data-income-id="${escapeHtml(r.id)}">삭제</button></div></details></article>`;
  }).join('') || '<p class="empty">이 필터에 해당하는 기록이 없습니다.</p>';
}
function renderPrices() {
  $('#priceList').innerHTML = Object.entries(state.settings.itemPrices || {}).map(([name, price]) => `<div class="history-item"><b>${escapeHtml(name)}</b><span>${money(price)}</span></div>`).join('') || '<p class="empty">판매를 기록하면 최근 단가가 여기에 표시됩니다.</p>';
}
function nexonCheckedLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '확인 전';
  const part = value => String(value).padStart(2, '0');
  return `${part(date.getMonth() + 1)}.${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}
function nexonCheckedTimeLabel(value) {
  const label = nexonCheckedLabel(value);
  return label === '확인 전' ? label : label.slice(-5);
}
function latestNexonCheckedAt(characters = []) {
  return characters.map(character => character.nexonCharacter?.lastCheckedAt).filter(value => !Number.isNaN(Date.parse(value || ''))).sort((left, right) => Date.parse(right) - Date.parse(left))[0] || '';
}
function nexonDefaultStatusMessage(characters = []) {
  if (!characters.some(character => character.nexonCharacter?.ocid)) return '연동할 캐릭터를 선택해주세요.';
  return latestNexonCheckedAt(characters) ? '최신 상태' : '주간 기록을 확인해주세요.';
}
function nexonProfileNeedsBackfill(character) {
  const profile = character?.nexonCharacter;
  if (!profile?.ocid) return false;
  const missingStats = !profile.stats || typeof profile.stats !== 'object' || Array.isArray(profile.stats);
  return !profile.profileCheckedAt || !profile.statsCheckedAt || missingStats || !profile.className || !Number.isInteger(profile.level) || !safeNexonImageUrl(profile.image);
}
function nexonSyncPlan(character, {characterName = '', ignoreCooldown = false, now = Date.now()} = {}) {
  const lastChecked = Date.parse(character?.nexonCharacter?.lastCheckedAt || '');
  const schedulerCooldown = !characterName && !ignoreCooldown && !Number.isNaN(lastChecked) && now - lastChecked < NEXON_CHECK_COOLDOWN_MS;
  return {schedulerCooldown, fetchScheduler: !schedulerCooldown, fetchProfile: !schedulerCooldown || nexonProfileNeedsBackfill(character)};
}
function nexonProfileFailure(character, error, nexonCharacter = '') {
  return {
    character: character?.name || '',
    nexonCharacter: nexonCharacter || character?.nexonCharacter?.characterName || '',
    status: Number(error?.status) || 0,
    code: typeof error?.code === 'string' ? error.code : 'PROFILE_ERROR',
    message: error?.message || '프로필 갱신 실패'
  };
}
function isSchedulerAccountRestriction(error) {
  return error?.category === 'account_restriction'
    && error?.source === 'nexon_upstream';
}
function nexonSchedulerWarning(character, error) {
  const status = Number(error?.status) || 0;
  const accountRestricted = isSchedulerAccountRestriction(error);
  const message = error?.code === 'AUTH_REQUIRED'
    ? '주간 자동 확인은 로그인 후 사용할 수 있습니다.'
    : error?.code === 'NEXON_CREDENTIAL_REQUIRED'
      ? '주간 자동 확인을 사용하려면 NEXON 개인 API Key를 등록해주세요.'
      : accountRestricted
    ? '캐릭터 연동은 정상적으로 완료되었습니다. 선택한 캐릭터가 등록한 개인 API Key 계정에 포함되어 있는지 확인해주세요.'
    : status === 400 && error?.category === 'invalid_parameter'
    ? '주간 자동 확인 요청을 처리하지 못했습니다. 고급 진단 정보에서 자세한 내용을 확인할 수 있습니다.'
    : status === 400 && error?.category && error.category !== 'unknown_upstream_error'
    ? `NEXON 캐릭터 연동 완료 · ${error.message}`
    : status === 403
    ? 'NEXON 캐릭터 연동 완료 · 주간 기록 조회 권한을 확인해주세요.'
    : status === 429
      ? 'NEXON 캐릭터 연동 완료 · 잠시 후 주간 기록을 다시 확인해주세요.'
      : status >= 500
        ? 'NEXON 캐릭터 연동 완료 · NEXON 장애로 주간 기록을 조회하지 못했습니다.'
        : '캐릭터 연동은 완료되었습니다. 주간 기록은 아직 조회할 수 없습니다.';
  return {
    character: character?.name || '',
    nexonCharacter: character?.nexonCharacter?.characterName || '',
    status,
    code: typeof error?.code === 'string' ? error.code : 'SCHEDULER_ERROR',
    category: typeof error?.category === 'string' ? error.category : '',
    applicationCategory: accountRestricted ? 'scheduler_account_restriction' : '',
    source: typeof error?.source === 'string' ? error.source : '',
    upstreamMessage: typeof error?.upstreamMessage === 'string' ? error.upstreamMessage : '',
    message
  };
}
function nexonLinkUiState(result, characterId) {
  const schedulerWarningIds = result?.schedulerWarning ? [characterId] : [];
  const schedulerRestrictedIds = result?.schedulerWarning?.applicationCategory === 'scheduler_account_restriction' ? [characterId] : [];
  return {
    status: result?.schedulerWarning ? 'warning' : 'ok',
    message: result?.schedulerWarning?.message || nexonUserStatusMessage(result),
    diagnostics: result,
    profileFailureIds: result?.profileError ? [characterId] : [],
    schedulerWarningIds,
    schedulerRestrictedIds
  };
}
function nexonDiagnosticGroups(result) {
  return {
    unknownName: result?.unknown || [],
    difficultyMismatch: result?.difficultyMismatch || [],
    unselectedDifficulty: result?.unselectedDifficulty || [],
    ambiguous: result?.ambiguous || [],
    localMissing: result?.notConfigured || [],
    apiMissing: result?.localNotFound || [],
    ignoredCycle: result?.ignoredCycle || [],
    blockedByManualOverride: result?.blockedByManualOverride || [],
    unsupportedActivity: result?.unsupportedActivity || [],
    activityBlockedByManualOverride: result?.activityBlockedByManualOverride || [],
    profileFailures: result?.profileFailures || []
  };
}
const nexonDiagnosticGroupLabels = {
  unknownName: '지원하지 않는 보스',
  difficultyMismatch: '난이도 불일치',
  unselectedDifficulty: '선택하지 않은 난이도',
  ambiguous: '매칭 모호',
  localMissing: '로컬 미등록',
  apiMissing: 'API에 없음',
  ignoredCycle: '일일 보스 제외',
  blockedByManualOverride: '수동 해제 보호',
  unsupportedActivity: '지원 대상 외 콘텐츠',
  activityBlockedByManualOverride: '콘텐츠 수동 해제 보호',
  profileFailures: '프로필 갱신 실패'
};
function nexonDiagnosticGroupTone(key) {
  if (['unknownName', 'difficultyMismatch', 'ambiguous', 'profileFailures'].includes(key)) return 'error';
  if (['blockedByManualOverride', 'activityBlockedByManualOverride'].includes(key)) return 'protected';
  return 'info';
}
function groupNexonDiagnosticItems(key, items = []) {
  const grouped = new Map();
  for (const item of items) {
    const name = item.contentName || item.name || item.bossId || '(이름 없음)';
    const difficulty = item.apiDifficulty || item.difficulty || '';
    const cycle = item.cycle || '';
    const profileReason = key === 'profileFailures' ? [item.character, item.nexonCharacter, item.status, item.code, item.message].join('|') : '';
    const groupKey = [key, name, difficulty, cycle, profileReason].join('\u0000');
    const current = grouped.get(groupKey) || {item, count: 0, characters: []};
    current.count++;
    const character = item.character || item.nexonCharacter || '';
    if (character && !current.characters.includes(character)) current.characters.push(character);
    grouped.set(groupKey, current);
  }
  return [...grouped.values()];
}
function appendNexonDiagnostics(total, result) {
  for (const key of ['fetched', 'apiCompleted', 'matched', 'matchedCompleted', 'autoCompleted', 'monthlyAutoCompleted', 'activitiesFetched', 'apiActivitiesCompleted', 'activityMatched', 'activityMatchedCompleted', 'activityAutoCompleted']) total[key] = (total[key] || 0) + (result[key] || 0);
  for (const key of ['unknown', 'difficultyMismatch', 'unselectedDifficulty', 'ambiguous', 'notConfigured', 'localNotFound', 'ignoredCycle', 'completedItems', 'blockedByManualOverride', 'diagnosticSamples', 'unsupportedActivity', 'activityCompletedItems', 'activityBlockedByManualOverride', 'diagnosticActivitySamples']) (total[key] ||= []).push(...(result[key] || []));
  return total;
}
function prioritizeNexonDiagnosticSamples(samples, limit = 30) {
  return (samples || []).map((item, index) => ({item, index})).sort((left, right) => Number(nexonFlag(right.item.complete)) - Number(nexonFlag(left.item.complete)) || left.index - right.index).slice(0, limit).map(({item}) => item);
}
function diagnosticRawLabel(value, type) {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return `${type || typeof value}: ${text}`;
}
function diagnosticEntryLabel(key, item) {
  const name = item.contentName || item.name || item.bossId || '(이름 없음)';
  const cycle = item.cycle || '(cycle 없음)';
  if (key === 'profileFailures') return `${item.character || '(메기 캐릭터 없음)'}${item.nexonCharacter ? ` → ${item.nexonCharacter}` : ''} · HTTP ${item.status || '-'} · ${item.code || 'PROFILE_ERROR'} · ${item.message || '프로필 갱신 실패'}`;
  if (key === 'unknownName') return `${name} · ${item.difficulty || '(난이도 없음)'} · ${cycle}`;
  if (key === 'difficultyMismatch') return `${name} · API ${item.apiDifficulty || '(없음)'} · 유효 ${(item.validDifficulties || []).join(', ') || '(없음)'} · 선택 ${(item.localDifficulties || []).join(', ') || '(없음)'} · ${cycle}`;
  if (key === 'unselectedDifficulty') return `${name} · API ${item.difficulty || '(없음)'} · 선택 ${(item.localDifficulties || []).join(', ') || '(없음)'} · ${cycle}`;
  if (key === 'ambiguous') return `${name} · API ${item.difficulty || '(없음)'} · 로컬 ${(item.localDifficulties || []).join(', ') || '(없음)'} · ${cycle}`;
  if (key === 'ignoredCycle') return `${name} · ${item.difficulty || '(난이도 없음)'} · ${item.cycle || '(cycle 없음)'}`;
  return `${name}${item.difficulty ? ` · ${item.difficulty}` : ''}`;
}
function groupedDiagnosticEntryLabel(key, group) {
  const suffix = group.characters.length > 1 ? ` · ${group.characters.length}개 캐릭터` : group.count > 1 ? ` · ${group.count}건` : '';
  return `${diagnosticEntryLabel(key, group.item)}${suffix}`;
}
function nexonCompletionResultLabel(result) {
  return ({
    'matched-auto-completed': '자동 완료',
    'matched-already-done': '이미 완료',
    'blocked-manual-override': '수동 해제 보호',
    'difficulty-mismatch': '난이도 불일치',
    'unselected-difficulty': '선택하지 않은 난이도',
    'ambiguous': '매칭 모호',
    'not-configured': '로컬 미등록',
    'ignored-cycle': '일일 보스 제외',
    'unknown-name': '이름 미지원'
  })[result] || result;
}
function nexonSchedulerDiagnosticSummary(result) {
  const liveOk = result?.live?.ok === true, yesterdayOk = result?.yesterday?.ok === true;
  if (liveOk && yesterdayOk) return '두 Scheduler 조회가 모두 정상입니다.';
  if (!liveOk && yesterdayOk) return '실시간 조회에서만 오류가 발생했습니다.';
  if (liveOk && !yesterdayOk) return '과거 날짜 조회에서만 오류가 발생했습니다.';
  return '실시간 및 과거 날짜 조회 모두 오류가 발생했습니다.';
}
function nexonSchedulerDiagnosticCard(title, item) {
  if (!item) return '';
  const statusClass = item.ok ? 'success' : 'warning';
  const rows = [
    ['상태', item.ok ? '정상' : '오류'],
    ['HTTP', String(item.status || '-')],
    ['Code', item.code || '-'],
    ['Category', item.category || '-'],
    ['Source', item.source || '-']
  ];
  if (item.requestedDate) rows.push(['조회일', item.requestedDate]);
  if (item.ok) {
    rows.push(['응답일', item.responseDate || '-'], ['보스', `${n(item.bossCount)}개`], ['주간 콘텐츠', `${n(item.weeklyContentCount)}개`]);
  } else rows.push(['Message', item.upstreamMessage || item.message || '-']);
  return `<article class="nexon-scheduler-diagnostic-card ${statusClass}"><div><b>${escapeHtml(title)}</b><span>${item.ok ? '성공' : '실패'}</span></div><dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></article>`;
}
function nexonAccountOwnershipCard(item) {
  if (!item) return '';
  const confirmed = item.ok && item.characterOwnedByServerKey === true;
  const mismatch = item.ok && item.characterOwnedByServerKey === false;
  const label = confirmed ? '확인됨' : mismatch ? '불일치' : '오류';
  const message = confirmed
    ? '선택한 캐릭터가 등록한 개인 API Key 계정에 포함되어 있습니다.'
    : mismatch
      ? '선택한 캐릭터가 등록한 개인 API Key 계정에 포함되어 있지 않습니다.'
      : '개인 API Key 계정 확인 요청을 처리하지 못했습니다.';
  const detail = item.ok
    ? `<small>계정 ${n(item.accountCount)}개 · 캐릭터 ${n(item.characterCount)}개</small>`
    : `<small>HTTP ${escapeHtml(String(item.status || '-'))} · ${escapeHtml(item.code || 'OWNERSHIP_CHECK_FAILED')}${item.category ? ` · ${escapeHtml(item.category)}` : ''}</small>`;
  return `<article class="nexon-api-key-ownership ${confirmed ? 'confirmed' : mismatch ? 'mismatch' : 'error'}"><div><b>개인 API Key 계정 확인</b><span>${label}</span></div><p>${escapeHtml(message)}</p>${detail}</article>`;
}
function renderNexonSchedulerComparison() {
  const select = $('#nexonSchedulerDiagnosticCharacter'), button = $('#runNexonSchedulerDiagnostic');
  const status = $('#nexonSchedulerDiagnosticStatus'), results = $('#nexonSchedulerDiagnosticResults');
  if (!select || !button || !status || !results) return;
  const linked = state.characters.filter(character => character.nexonCharacter?.ocid);
  if (!linked.some(character => character.id === nexonSchedulerDiagnosticState.characterId)) {
    nexonSchedulerDiagnosticState.characterId = linked[0]?.id || '';
  }
  select.innerHTML = linked.map(character => `<option value="${escapeHtml(character.id)}" ${character.id === nexonSchedulerDiagnosticState.characterId ? 'selected' : ''}>${escapeHtml(character.name)}${character.nexonCharacter?.characterName && character.nexonCharacter.characterName !== character.name ? ` · ${escapeHtml(character.nexonCharacter.characterName)}` : ''}</option>`).join('');
  select.disabled = !linked.length || nexonSchedulerDiagnosticState.status === 'checking';
  button.disabled = !linked.length || nexonSchedulerDiagnosticState.status === 'checking';
  status.textContent = linked.length ? nexonSchedulerDiagnosticState.message : '연동된 NEXON 캐릭터가 없습니다.';
  status.className = nexonSchedulerDiagnosticState.status === 'error' ? 'negative' : nexonSchedulerDiagnosticState.status === 'checking' ? 'pending' : nexonSchedulerDiagnosticState.status === 'done' ? 'mint' : 'muted';
  const result = nexonSchedulerDiagnosticState.result;
  results.innerHTML = result ? `${nexonSchedulerDiagnosticCard('LIVE', result.live)}${nexonSchedulerDiagnosticCard('어제 날짜', result.yesterday)}${nexonAccountOwnershipCard(result.ownership)}` : '';
}
function renderNexonDiagnostics() {
  const details = $('#nexonDiagnostics'), content = $('#nexonDiagnosticsContent');
  if (!details || !content) return;
  const result = nexonApiState.diagnostics;
  const hasLinkedCharacter = state.characters.some(character => character.nexonCharacter?.ocid);
  details.classList.toggle('hidden', !result && !hasLinkedCharacter);
  renderNexonSchedulerComparison();
  if (!result) { content.innerHTML = ''; return; }
  const groups = nexonDiagnosticGroups(result);
  const samples = (result.diagnosticSamples || []).slice(0, 30), completedItems = result.completedItems || [];
  const activitySamples = (result.diagnosticActivitySamples || []).slice(0, 30), completedActivities = result.activityCompletedItems || [];
  const schedulerWarningHtml = result.schedulerWarning ? `<section class="nexon-completed-items"><b>주간 기록 조회 경고</b><p>${escapeHtml(result.schedulerWarning.message || '')}</p><small>HTTP ${escapeHtml(String(result.schedulerWarning.status || '-'))} · ${escapeHtml(result.schedulerWarning.code || 'SCHEDULER_ERROR')}${result.schedulerWarning.category ? ` · ${escapeHtml(result.schedulerWarning.category)}` : ''}${result.schedulerWarning.source ? ` · ${escapeHtml(result.schedulerWarning.source)}` : ''}</small>${result.schedulerWarning.upstreamMessage ? `<p class="muted">NEXON 응답: ${escapeHtml(result.schedulerWarning.upstreamMessage)}</p>` : ''}</section>` : '';
  const summary = [
    ['보스 조회', result.fetched], ['보스 완료', result.apiCompleted], ['보스 매칭', result.matched], ['보스 자동 완료', result.autoCompleted],
    ['콘텐츠 조회', result.activitiesFetched], ['콘텐츠 완료', result.apiActivitiesCompleted], ['콘텐츠 자동 완료', result.activityAutoCompleted],
    ['실제 매칭 오류', nexonDiagnosticFailureCount(result), 'error'], ['선택하지 않은 난이도', groups.unselectedDifficulty.length, 'info'], ['로컬 미등록', groups.localMissing.length, 'info'],
    ['지원 대상 외', groups.unsupportedActivity.length, 'info'], ['프로필 실패', result.profileFailures?.length || 0]
  ];
  const completedHtml = `<section class="nexon-completed-items"><b>완료 항목 ${completedItems.length}</b>${completedItems.length ? completedItems.map(item => `<article class="nexon-completed-item"><small>${escapeHtml(item.character || '(메기 캐릭터 없음)')}${item.nexonCharacter ? ` → ${escapeHtml(item.nexonCharacter)}` : ''}</small><p>${escapeHtml(item.contentName || '(이름 없음)')} · ${escapeHtml(item.difficulty || '(난이도 없음)')} · ${escapeHtml(item.cycle || '(cycle 없음)')}</p><strong>→ ${escapeHtml(nexonCompletionResultLabel(item.result))}</strong></article>`).join('') : '<p class="muted">완료로 반환된 항목이 없습니다.</p>'}</section>`;
  const activityCompletedHtml = `<section class="nexon-completed-items"><b>완료 콘텐츠 ${completedActivities.length}</b>${completedActivities.length ? completedActivities.map(item => `<article class="nexon-completed-item"><small>${escapeHtml(item.character || '(메기 캐릭터 없음)')}${item.nexonCharacter ? ` → ${escapeHtml(item.nexonCharacter)}` : ''}</small><p>${escapeHtml(item.contentName || '(이름 없음)')} · ${escapeHtml(item.activityType || '(유형 없음)')}</p><strong>→ ${escapeHtml(nexonCompletionResultLabel(item.result))}</strong></article>`).join('') : '<p class="muted">완료로 확인된 지원 콘텐츠가 없습니다.</p>'}</section>`;
  const sampleHtml = samples.map(item => `<article class="nexon-diagnostic-item">${item.character || item.nexonCharacter ? `<small class="nexon-diagnostic-character">${escapeHtml(item.character || '(메기 캐릭터 없음)')}${item.nexonCharacter ? ` → ${escapeHtml(item.nexonCharacter)}` : ''}</small>` : ''}<b>${escapeHtml(item.contentName || '(content_name 없음)')}</b><p>difficulty: ${escapeHtml(item.difficulty || '(없음)')} · cycle: ${escapeHtml(item.cycle || '(없음)')}</p><p>registered: ${escapeHtml(String(item.registered))} <small>(${escapeHtml(diagnosticRawLabel(item.rawRegistrationValue, item.rawRegistrationType))})</small></p><p>complete: ${escapeHtml(String(item.complete))} <small>(${escapeHtml(diagnosticRawLabel(item.rawCompleteValue, item.rawCompleteType))})</small></p></article>`).join('');
  const groupHtml = Object.entries(groups).filter(([, items]) => items.length).map(([key, items]) => {
    const grouped = groupNexonDiagnosticItems(key, items);
    return `<details class="nexon-diagnostic-group tone-${nexonDiagnosticGroupTone(key)}"><summary><span>${escapeHtml(nexonDiagnosticGroupLabels[key] || key)}</span><strong>${items.length}건</strong></summary><ul>${grouped.map(group => `<li><span>${escapeHtml(groupedDiagnosticEntryLabel(key, group))}</span>${group.characters.length ? `<small>대상: ${escapeHtml(group.characters.join(', '))}</small>` : ''}</li>`).join('')}</ul></details>`;
  }).join('');
  const summaryHtml = `<div class="nexon-diagnostic-summary">${summary.map(([label, value, tone = 'default']) => `<span class="tone-${tone}">${escapeHtml(label)} <b>${n(value)}</b></span>`).join('')}</div>`;
  const samplesHtml = `<details class="nexon-diagnostic-sample-section"><summary><span>응답 샘플</span><strong>${samples.length}건</strong></summary>${sampleHtml ? `<div class="nexon-diagnostic-samples">${sampleHtml}</div>` : '<p class="muted">응답 샘플이 없습니다.</p>'}</details>`;
  const activitySamplesHtml = `<details class="nexon-diagnostic-sample-section"><summary><span>주간 콘텐츠 응답 샘플</span><strong>${activitySamples.length}건</strong></summary>${activitySamples.length ? `<div class="nexon-diagnostic-samples">${activitySamples.map(item => `<article class="nexon-diagnostic-item"><small class="nexon-diagnostic-character">${escapeHtml(item.character || '')}${item.nexonCharacter ? ` → ${escapeHtml(item.nexonCharacter)}` : ''}</small><b>${escapeHtml(item.contentName || '(content_name 없음)')}</b><p>type: ${escapeHtml(item.type || '(없음)')} · ${escapeHtml(String(item.nowCount || 0))}/${escapeHtml(String(item.maxCount || 0))} · quest_state: ${escapeHtml(item.questState || '(없음)')}</p><p>registered: ${escapeHtml(String(item.registered))} · complete: ${escapeHtml(String(item.complete))}</p></article>`).join('')}</div>` : '<p class="muted">주간 콘텐츠 응답 샘플이 없습니다.</p>'}</details>`;
  content.innerHTML = `${schedulerWarningHtml}${completedHtml}${activityCompletedHtml}${summaryHtml}${groupHtml ? `<div class="nexon-diagnostic-groups">${groupHtml}</div>` : '<p class="mint nexon-diagnostic-empty">확인할 진단 항목이 없습니다.</p>'}${samplesHtml}${activitySamplesHtml}`;
}
function nexonCredentialErrorMessage(error) {
  const code = String(error?.code || '');
  if (code === 'AUTH_REQUIRED') return '로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.';
  if (['OPENAPI00005', 'INVALID_API_KEY_FORMAT'].includes(code)) return 'NEXON Open API Key를 확인해주세요.';
  if (code === 'RATE_LIMITED' || Number(error?.status) === 429) return 'NEXON API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  if (Number(error?.status) === 403) return 'NEXON Open API Key의 메이플스토리 API 권한을 확인해주세요.';
  return error?.message || 'NEXON API Key 요청을 처리하지 못했습니다.';
}
function nexonCredentialCheckedLabel(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}
function nexonCredentialViewState({signedIn = false, hasCredential = false, editing = false} = {}) {
  const showInput = !!signedIn && (!hasCredential || editing);
  return {
    showSignedOut: !signedIn,
    showInput,
    showRegistered: !!signedIn && !!hasCredential && !editing,
    showInputHelp: showInput
  };
}
function renderNexonCredentialSettings() {
  const signedOut = $('#nexonCredentialSignedOut'), form = $('#nexonCredentialForm'), registered = $('#nexonCredentialRegistered');
  if (!signedOut || !form || !registered) return;
  const signedIn = !!nexonCredentialAuthBridge?.isSignedIn?.();
  const busy = ['loading', 'saving', 'deleting'].includes(nexonCredentialState.status);
  const hasCredential = signedIn && nexonCredentialState.hasCredential;
  const view = nexonCredentialViewState({signedIn, hasCredential, editing: nexonCredentialState.editing});
  const editing = view.showInput;
  signedOut.classList.toggle('hidden', !view.showSignedOut);
  form.classList.toggle('hidden', !view.showInput);
  registered.classList.toggle('hidden', !view.showRegistered);
  const intro = $('.nexon-credential-input-intro'), guide = $('.nexon-credential-guide'), security = $('.nexon-credential-security');
  intro?.classList.toggle('hidden', !view.showInputHelp);
  guide?.classList.toggle('hidden', !view.showInputHelp);
  security?.classList.toggle('hidden', !view.showInputHelp);
  if (guide && !view.showInputHelp) guide.open = false;
  const badge = $('#nexonCredentialBadge');
  const badgeState = !signedIn ? ['로그인 필요', ''] : busy ? ['확인 중', 'pending'] : hasCredential ? ['등록됨', 'registered'] : nexonCredentialState.status === 'error' ? ['확인 필요', 'error'] : ['미등록', ''];
  badge.textContent = badgeState[0];
  badge.className = `nexon-credential-badge ${badgeState[1]}`.trim();
  $('#saveNexonCredential').disabled = busy;
  $('#saveNexonCredential').textContent = busy && nexonCredentialState.status === 'saving' ? '확인·저장 중…' : hasCredential ? '새 API Key 확인 및 저장' : 'API Key 확인 및 등록';
  $('#cancelNexonCredentialChange').classList.toggle('hidden', !hasCredential || !nexonCredentialState.editing);
  $('#changeNexonCredential').disabled = busy;
  $('#deleteNexonCredential').disabled = busy;
  $('#nexonCredentialCounts').textContent = hasCredential ? `계정 ${n(nexonCredentialState.accountCount)}개 · 캐릭터 ${n(nexonCredentialState.characterCount)}개` : '';
  const checked = nexonCredentialCheckedLabel(nexonCredentialState.verifiedAt);
  $('#nexonCredentialVerifiedAt').textContent = checked ? `확인: ${checked}` : '';
  const status = $('#nexonCredentialMessage');
  status.textContent = busy ? nexonCredentialState.message || '처리 중…' : nexonCredentialState.message || '';
  status.className = nexonCredentialState.status === 'error' ? 'negative' : nexonCredentialState.status === 'saved' ? 'mint' : 'muted';
}
async function nexonCredentialRequest(method, body) {
  const token = await nexonCredentialAuthBridge?.getAccessToken?.();
  if (!token) throw Object.assign(new Error('NEXON 개인 API Key 등록은 로그인 후 사용할 수 있습니다.'), {status: 401, code: 'AUTH_REQUIRED'});
  const response = await fetch('/api/nexon-credential', {
    method,
    headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.message || 'NEXON API Key 요청을 처리하지 못했습니다.'), {
    status: response.status,
    code: data?.code || 'CREDENTIAL_REQUEST_FAILED'
  });
  return data;
}
async function refreshNexonCredentialStatus() {
  if (!nexonCredentialAuthBridge?.isSignedIn?.()) {
    nexonCredentialState = {status: 'signed-out', hasCredential: false, editing: false, message: ''};
    renderNexonCredentialSettings(); renderAppExperience();
    return;
  }
  nexonCredentialState = {...nexonCredentialState, status: 'loading', message: '등록 상태 확인 중…'};
  renderNexonCredentialSettings(); renderAppExperience();
  try {
    const result = await nexonCredentialRequest('GET');
    nexonCredentialState = {...result, status: 'ready', editing: false, message: ''};
  } catch (error) {
    nexonCredentialState = {status: 'error', hasCredential: false, editing: false, message: nexonCredentialErrorMessage(error)};
  }
  renderNexonCredentialSettings(); renderAppExperience();
}
function setNexonCredentialAuthBridge(bridge) {
  nexonCredentialAuthBridge = bridge && typeof bridge.getAccessToken === 'function' ? bridge : null;
  renderNexonCredentialSettings(); renderAppExperience();
}
function onNexonCredentialAuthChanged({signedIn = false} = {}) {
  cloudAuthUiState = {initialized: true, signedIn: !!signedIn, ready: !signedIn};
  if (!signedIn) {
    onboardingCharacterCandidate = null;
    clearNexonDetailRuntimeCache();
    nexonCredentialState = {status: 'signed-out', hasCredential: false, editing: false, message: ''};
    const input = $('#nexonCredentialInput');
    if (input) input.value = '';
    renderNexonCredentialSettings(); renderAppExperience();
    return;
  }
  renderAppExperience();
  refreshNexonCredentialStatus();
}
function onCloudSyncReady({signedIn = false} = {}) {
  cloudAuthUiState = {...cloudAuthUiState, initialized: true, signedIn: !!signedIn, ready: true};
  renderAppExperience();
}
function nexonConnectionStatusSummary(characters, credentialState, signedIn, apiState) {
  const linked = characters.some(character => character.nexonCharacter?.ocid);
  const credentialReady = signedIn && credentialState?.hasCredential === true;
  const credentialBusy = ['loading', 'saving', 'deleting'].includes(credentialState?.status);
  const character = linked ? {label: '정상', tone: 'success'} : {label: '미연동', tone: 'muted'};
  const credential = !signedIn
    ? {label: '로그인 필요', tone: 'muted'}
    : ['loading', 'saving', 'deleting'].includes(credentialState?.status)
      ? {label: '확인 중', tone: 'pending'}
      : credentialReady
        ? {label: '등록 완료', tone: 'success'}
        : credentialState?.status === 'error'
          ? {label: '확인 필요', tone: 'warning'}
          : {label: '미등록', tone: 'muted'};
  let automation = {label: '캐릭터 연동 필요', tone: 'muted'};
  if (linked && !signedIn) automation = {label: '로그인 필요', tone: 'muted'};
  else if (linked && credentialBusy) automation = {label: '확인 중', tone: 'pending'};
  else if (linked && credentialState?.status === 'error') automation = {label: '확인 필요', tone: 'warning'};
  else if (linked && !credentialReady) automation = {label: 'API Key 등록 필요', tone: 'muted'};
  else if (linked && apiState?.status === 'checking') automation = {label: '확인 중', tone: 'pending'};
  else if (linked && apiState?.status === 'ok') automation = {label: '정상', tone: 'success'};
  else if (linked && ['warning', 'error'].includes(apiState?.status)) automation = {label: '확인 실패', tone: 'warning'};
  else if (linked) automation = {label: '확인 전', tone: 'muted'};
  return {character, credential, automation, showPreparationNotice: linked && credentialReady && apiState?.status === 'warning'};
}
function renderNexonConnectionStatus() {
  const signedIn = !!nexonCredentialAuthBridge?.isSignedIn?.();
  const summary = nexonConnectionStatusSummary(state.characters, nexonCredentialState, signedIn, nexonApiState);
  for (const [id, value] of [
    ['nexonCharacterConnectionState', summary.character],
    ['nexonCredentialConnectionState', summary.credential],
    ['nexonAutomationConnectionState', summary.automation]
  ]) {
    const element = $('#' + id);
    if (!element) continue;
    element.textContent = value.label;
    element.className = value.tone;
  }
  $('#nexonAutomationNotice')?.classList.toggle('hidden', !summary.showPreparationNotice);
}
function renderNexonSettings() {
  const list = $('#nexonCharacterList');
  if (!list) return;
  const disabled = isPast() || storageBlocked ? 'disabled' : '';
  list.innerHTML = state.characters.map(character => {
    const link = character.nexonCharacter;
    const linked = !!link?.ocid;
    const profileFailed = (nexonApiState.profileFailureIds || []).includes(character.id);
    const profileMissing = linked && nexonProfileNeedsBackfill(character);
    const schedulerWarning = (nexonApiState.schedulerWarningIds || []).includes(character.id);
    const schedulerRestricted = (nexonApiState.schedulerRestrictedIds || []).includes(character.id);
    const hasError = nexonApiState.errorCharacterId === character.id || profileFailed;
    const badge = linked ? '<span class="nexon-link-badge linked">연동됨</span>' : hasError ? '<span class="nexon-link-badge error">오류</span>' : '<span class="nexon-link-badge">미연동</span>';
    const levelClass = [Number.isInteger(link?.level) ? `Lv. ${link.level}` : '', link?.className || ''].filter(Boolean).join(' ');
    const profileStatus = profileFailed ? '프로필 갱신 실패' : profileMissing ? '프로필 갱신 필요' : schedulerRestricted || schedulerWarning ? '주간 자동 확인 준비 중' : '';
    const detail = linked ? `<p>${escapeHtml(link.characterName || '')}</p>${levelClass || link.world ? `<small class="nexon-character-profile">${escapeHtml([levelClass, link.world || ''].filter(Boolean).join(' · '))}</small>` : ''}<small>마지막 확인 ${escapeHtml(nexonCheckedTimeLabel(link.lastCheckedAt))}${profileStatus ? ` · ${profileStatus}` : ''}</small>` : '<p class="muted">NEXON 캐릭터 미연동</p>';
    return `<div class="nexon-character-row" data-nexon-character="${escapeHtml(character.id)}"><div class="nexon-character-info">${nexonProfileAvatar(character, 'settings-avatar')}<div class="nexon-character-copy"><div class="nexon-character-heading"><b>${escapeHtml(character.name)}</b>${badge}</div>${detail}</div></div><div class="nexon-character-actions"><button type="button" class="ghost" data-nexon-action="link" ${disabled}>${linked ? '변경' : '연동'}</button>${linked ? `<button type="button" class="text-button" data-nexon-action="unlink" ${disabled}>해제</button>` : ''}</div></div>`;
  }).join('') || '<p class="empty">먼저 캐릭터를 추가해주세요.</p>';
  const lastCheckedAt = latestNexonCheckedAt(state.characters);
  $('#nexonLastChecked').textContent = lastCheckedAt ? `마지막 확인 ${nexonCheckedLabel(lastCheckedAt)}` : '마지막 확인 없음';
  const status = $('#nexonApiStatus');
  const credentialReady = !!nexonCredentialAuthBridge?.isSignedIn?.() && nexonCredentialState.hasCredential;
  status.textContent = nexonApiState.status === 'idle'
    ? nexonDefaultStatusMessage(state.characters)
    : nexonApiState.status === 'warning' && credentialReady
      ? '주간 자동 확인 요청을 확인해주세요.'
      : nexonApiState.message;
  status.className = nexonApiState.status === 'error' ? 'negative' : ['checking', 'warning'].includes(nexonApiState.status) ? 'pending' : nexonApiState.status === 'ok' ? 'mint' : 'muted';
  const button = $('#checkNexonBosses');
  button.disabled = nexonApiState.status === 'checking' || isPast() || storageBlocked || !state.characters.some(character => character.nexonCharacter?.ocid);
  renderNexonCredentialSettings();
  renderNexonConnectionStatus();
  renderNexonDiagnostics();
}
function renderSettings() {
  $('#defaultSaleFeeRate').value = String(normalizeSaleFeeRate(state.settings.defaultSaleFeeRate));
  $('#presetManager').innerHTML = state.presets.map(preset => `<div class="preset-row" data-preset-id="${escapeHtml(preset.id)}"><div><b>${escapeHtml(preset.name)}</b><small class="muted">보스 ${preset.bosses.length}개</small></div><div><button class="ghost" type="button" data-preset-action="rename">이름 변경</button><button class="ghost danger-text" type="button" data-preset-action="delete">삭제</button></div></div>`).join('') || '<p class="empty">저장한 사용자 프리셋이 없습니다.</p>';
  renderNexonSettings();
  const accountSummary = $('#settingsAccountSummary');
  if (accountSummary) accountSummary.textContent = cloudAuthUiState.signedIn ? ($('#cloudEmail')?.textContent || '로그인됨') + ' · 동기화' : '로그인 필요';
  const nexonSummary = $('#settingsNexonSummary');
  if (nexonSummary) {
    const linked = state.characters.filter(character => character.nexonCharacter?.ocid);
    nexonSummary.textContent = linked.length ? `${linked[0].nexonCharacter?.characterName || linked[0].name}${linked.length > 1 ? ` 외 ${linked.length - 1}` : ''} · ${nexonApiState.status === 'ok' ? '자동 확인 정상' : '연결됨'}` : '캐릭터 연결 필요';
  }
  renderThemeSettings();
}

async function nexonAuthenticatedFetch(url) {
  const token = await nexonCredentialAuthBridge?.getAccessToken?.();
  if (!token) throw Object.assign(new Error('주간 자동 확인은 로그인 후 사용할 수 있습니다.'), {status: 401, code: 'AUTH_REQUIRED'});
  return fetch(url, {headers: {Authorization: `Bearer ${token}`}});
}
async function fetchNexonScheduler(character, characterName = '', requestDate = '') {
  const params = new URLSearchParams();
  if (characterName) params.set('characterName', characterName);
  else params.set('ocid', character.nexonCharacter.ocid);
  if (requestDate) params.set('date', requestDate);
  const response = await nexonAuthenticatedFetch('/api/nexon-scheduler?' + params);
  let data;
  try { data = await response.json(); } catch { throw new Error('NEXON API 응답을 읽지 못했습니다.'); }
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.message || 'NEXON 주간 기록을 확인하지 못했습니다.');
    error.status = response.status;
    error.code = data?.code || 'SCHEDULER_REQUEST_FAILED';
    error.category = data?.category || '';
    error.source = data?.source || '';
    error.upstreamMessage = data?.upstreamMessage || '';
    throw error;
  }
  return data;
}
async function fetchNexonSchedulerComparison(character) {
  const params = new URLSearchParams({ocid: character.nexonCharacter.ocid, diagnostic: 'compare'});
  const response = await nexonAuthenticatedFetch('/api/nexon-scheduler?' + params);
  let data;
  try { data = await response.json(); } catch { throw new Error('NEXON Scheduler 진단 응답을 읽지 못했습니다.'); }
  if (!response.ok || !data?.ok || !data?.diagnostic) throw Object.assign(new Error(data?.message || 'NEXON Scheduler 진단을 실행하지 못했습니다.'), {
    status: response.status,
    code: data?.code || 'SCHEDULER_DIAGNOSTIC_FAILED',
    category: data?.category || '',
    source: data?.source || '',
    upstreamMessage: data?.upstreamMessage || ''
  });
  return data;
}
async function fetchNexonAccountOwnership(character) {
  const params = new URLSearchParams({ocid: character.nexonCharacter.ocid});
  const response = await nexonAuthenticatedFetch('/api/nexon-account-ownership?' + params);
  let data;
  try { data = await response.json(); } catch { throw new Error('NEXON API Key 계정 확인 응답을 읽지 못했습니다.'); }
  return {
    ok: response.ok && data?.ok === true,
    status: response.status,
    characterOwnedByServerKey: data?.characterOwnedByServerKey === true,
    accountCount: Number(data?.accountCount) || 0,
    characterCount: Number(data?.characterCount) || 0,
    applicationCategory: typeof data?.applicationCategory === 'string' ? data.applicationCategory : '',
    code: typeof data?.code === 'string' ? data.code : '',
    category: typeof data?.category === 'string' ? data.category : '',
    source: typeof data?.source === 'string' ? data.source : '',
    upstreamMessage: typeof data?.upstreamMessage === 'string' ? data.upstreamMessage : ''
  };
}
async function runNexonSchedulerDiagnosticComparison() {
  if (nexonSchedulerDiagnosticState.status === 'checking') return;
  const character = state.characters.find(item => item.id === nexonSchedulerDiagnosticState.characterId && item.nexonCharacter?.ocid);
  if (!character) {
    nexonSchedulerDiagnosticState = {...nexonSchedulerDiagnosticState, status: 'error', result: null, message: '진단할 연동 캐릭터를 선택해주세요.'};
    renderNexonSchedulerComparison();
    return;
  }
  nexonSchedulerDiagnosticState = {status: 'checking', characterId: character.id, result: null, message: 'Scheduler 요청과 API Key 계정 정보를 확인 중…'};
  renderNexonSchedulerComparison();
  const [schedulerRequest, ownershipRequest] = await Promise.allSettled([
    fetchNexonSchedulerComparison(character),
    fetchNexonAccountOwnership(character)
  ]);
  const ownership = ownershipRequest.status === 'fulfilled'
    ? ownershipRequest.value
    : {ok: false, status: 0, code: 'OWNERSHIP_CHECK_FAILED', category: 'network_error'};
  if (schedulerRequest.status === 'fulfilled') {
    const result = {...schedulerRequest.value, ownership};
    nexonSchedulerDiagnosticState = {status: 'done', characterId: character.id, result, message: nexonSchedulerDiagnosticSummary(result)};
  } else {
    nexonSchedulerDiagnosticState = {status: 'error', characterId: character.id, result: {ownership}, message: schedulerRequest.reason?.message || 'NEXON Scheduler 진단을 실행하지 못했습니다.'};
  }
  renderNexonSchedulerComparison();
}
async function fetchNexonProfile(ocid = '', characterName = '') {
  const params = new URLSearchParams();
  if (ocid) params.set('ocid', ocid);
  else if (characterName) params.set('characterName', characterName);
  const response = await fetch('/api/nexon-character?' + params);
  let data;
  try { data = await response.json(); }
  catch {
    const error = new Error('NEXON 캐릭터 프로필 응답을 읽지 못했습니다.');
    error.status = response.status; error.code = 'INVALID_RESPONSE'; throw error;
  }
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.message || 'NEXON 캐릭터 프로필을 확인하지 못했습니다.');
    error.status = response.status; error.code = data?.code || 'PROFILE_REQUEST_FAILED'; throw error;
  }
  return data;
}
function nexonDiagnosticFailureCount(result) {
  const groups = nexonDiagnosticGroups(result);
  return ['unknownName', 'difficultyMismatch', 'ambiguous'].reduce((sum, key) => sum + groups[key].length, 0);
}
function nexonDiagnosticMessage(result) {
  const parts = [`NEXON 조회 ${result.fetched || 0}개`, `완료 ${result.apiCompleted || 0}개`, `메기 매칭 ${result.matched || 0}개`, `완료 매칭 ${result.matchedCompleted || 0}개`, `자동 완료 ${result.autoCompleted || 0}개`];
  if (result.activitiesFetched) parts.push(`주간 콘텐츠 ${result.activitiesFetched}개`, `콘텐츠 자동 완료 ${result.activityAutoCompleted || 0}개`);
  if (result.blockedByManualOverride?.length) parts.push(`수동 해제 보호로 자동 완료 차단 ${result.blockedByManualOverride.length}개`);
  const failures = nexonDiagnosticFailureCount(result);
  const groups = nexonDiagnosticGroups(result);
  if (failures) parts.push(`실제 매칭 오류 ${failures}개`);
  if (groups.unselectedDifficulty.length) parts.push(`선택하지 않은 난이도 ${groups.unselectedDifficulty.length}개`);
  if (groups.localMissing.length) parts.push(`로컬 미등록 ${groups.localMissing.length}개`);
  if (groups.unsupportedActivity.length) parts.push(`지원 대상 외 ${groups.unsupportedActivity.length}개`);
  return parts.join(' · ');
}
function nexonUserStatusMessage(result, cooldown = false) {
  if (cooldown && result?.profileUpdated) return `캐릭터 프로필 ${result.profileUpdated}개를 갱신했습니다.`;
  if (cooldown) return '최근 확인한 기록입니다.';
  const monthly = result?.monthlyAutoCompleted || 0;
  const weekly = Math.max(0, (result?.autoCompleted || 0) - monthly);
  const activities = result?.activityAutoCompleted || 0;
  const parts = [];
  if (weekly) parts.push(`주간 보스 ${weekly}개`);
  if (monthly) parts.push(`월간 보스 ${monthly}개`);
  if (activities) parts.push(`주간 콘텐츠 ${activities}개`);
  return parts.length ? `${parts.join(' · ')}를 자동 확인했습니다.` : '새로 확인된 기록이 없습니다.';
}
async function syncNexonCharacter(characterId, {characterName = '', requestDate = '', ignoreCooldown = false} = {}) {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) throw new Error('메기 캐릭터를 찾을 수 없습니다.');
  if (!characterName && !character.nexonCharacter?.ocid) throw new Error('먼저 NEXON 캐릭터를 연동해주세요.');
  if (characterName) {
    const profileResponse = await fetchNexonProfile('', characterName);
    const basicOk = profileResponse?.resources ? profileResponse.resources.basic?.ok === true : true;
    if (!basicOk || !profileResponse?.ocid || !profileResponse?.character?.name) throw new Error('NEXON 캐릭터 정보를 확인하지 못했습니다.');
    let profileChanged = false, profileApplyError = null;
    const saved = transaction(next => {
      try { profileChanged = applyNexonLinkProfileState(next, characterId, profileResponse, profileResponse.fetchedAt); }
      catch (error) { profileApplyError = error; throw error; }
    });
    if (!saved) throw profileApplyError || new Error('NEXON 캐릭터 연동 정보를 이 기기에 저장하지 못했습니다.');
    const linkedCharacter = state.characters.find(item => item.id === characterId);
    const nexonCharacter = linkedCharacter?.nexonCharacter?.characterName || profileResponse.character.name;
    const partialProfileFailures = Array.isArray(profileResponse.warnings)
      ? profileResponse.warnings.map(warning => nexonProfileFailure(linkedCharacter, warning, nexonCharacter))
      : [];
    try {
      const response = await fetchNexonScheduler(linkedCharacter, '', requestDate);
      let applied = {}, applyError = null;
      const schedulerSaved = transaction(next => {
        try { applied = applyNexonSchedulerState(next, characterId, response, response.fetchedAt); }
        catch (error) { applyError = error; throw error; }
      });
      if (!schedulerSaved) throw applyError || new Error('NEXON 주간 기록을 이 기기에 저장하지 못했습니다.');
      return {...applied, character: character.name, nexonCharacter, profileChanged, profileUpdated: Number(profileChanged), profileFailures: partialProfileFailures, profileError: partialProfileFailures[0]?.message || ''};
    } catch (error) {
      const warning = nexonSchedulerWarning(linkedCharacter, error);
      const result = {character: character.name, nexonCharacter, profileChanged, profileUpdated: Number(profileChanged), profileFailures: partialProfileFailures, profileError: partialProfileFailures[0]?.message || '', schedulerWarning: warning};
      console.info('NEXON scheduler sync diagnostics', result);
      return result;
    }
  }
  const plan = nexonSyncPlan(character, {characterName, ignoreCooldown});
  if (!plan.fetchScheduler && !plan.fetchProfile) return {cooldown: true, character: character.name};
  const response = plan.fetchScheduler ? await fetchNexonScheduler(character, characterName, requestDate) : null;
  let profileResponse = null, profileFailure = null;
  const nexonCharacter = response?.character?.name || character.nexonCharacter?.characterName || '';
  const profileOcid = response?.character?.ocid || character.nexonCharacter?.ocid;
  if (profileOcid) {
    try { profileResponse = await fetchNexonProfile(profileOcid); }
    catch (error) { profileFailure = nexonProfileFailure(character, error, nexonCharacter); }
  }
  let applied = {}, applyError, profileChanged = false, saved = true;
  if (response || profileResponse) saved = transaction(next => {
    if (response) {
      try { applied = applyNexonSchedulerState(next, characterId, response, response.fetchedAt); }
      catch (error) { applyError = error; throw error; }
    }
    if (profileResponse) {
      try { profileChanged = applyNexonProfileState(next, characterId, profileResponse, profileResponse.fetchedAt); }
      catch (error) { profileFailure = nexonProfileFailure(character, error, nexonCharacter); }
    }
  });
  if (!saved) throw applyError || new Error('NEXON 확인 결과를 이 기기에 저장하지 못했습니다.');
  const diagnosticSamples = Array.isArray(response?.diagnostics?.samples) ? response.diagnostics.samples.map(sample => ({...sample, character: character.name, nexonCharacter})) : [];
  const diagnosticActivitySamples = Array.isArray(response?.diagnostics?.activitySamples) ? response.diagnostics.activitySamples.map(sample => ({...sample, character: character.name, nexonCharacter})) : [];
  const partialProfileFailures = Array.isArray(profileResponse?.warnings)
    ? profileResponse.warnings.map(warning => nexonProfileFailure(character, warning, nexonCharacter))
    : [];
  const profileFailures = [...(profileFailure ? [profileFailure] : []), ...partialProfileFailures];
  const result = {...applied, diagnosticSamples, diagnosticActivitySamples, character: character.name, nexonCharacter, cooldown: plan.schedulerCooldown, profileChanged, profileUpdated: Number(profileChanged), profileError: profileFailures[0]?.message || '', profileFailures};
  console.info('NEXON scheduler sync diagnostics', result);
  return result;
}
async function syncAllNexonCharacters() {
  if (nexonApiState.status === 'checking') return;
  if (isPast()) { nexonApiState = {status: 'error', message: '과거 주차는 읽기 전용입니다. 이번 주로 돌아와주세요.'}; renderNexonSettings(); return; }
  const linked = state.characters.filter(character => character.nexonCharacter?.ocid);
  if (!linked.length) { nexonApiState = {status: 'error', message: '연동된 NEXON 캐릭터가 없습니다.'}; renderNexonSettings(); return; }
  nexonApiState = {status: 'checking', message: '보스·주간 콘텐츠 확인 중…', diagnostics: null}; renderNexonSettings();
  let checked = 0, cooldown = 0, checkingCharacterId = '';
  const profileFailureIds = [];
  const total = {fetched: 0, apiCompleted: 0, matched: 0, matchedCompleted: 0, autoCompleted: 0, monthlyAutoCompleted: 0, activitiesFetched: 0, apiActivitiesCompleted: 0, activityMatched: 0, activityMatchedCompleted: 0, activityAutoCompleted: 0, profileUpdated: 0, unknown: [], difficultyMismatch: [], unselectedDifficulty: [], ambiguous: [], notConfigured: [], localNotFound: [], ignoredCycle: [], completedItems: [], blockedByManualOverride: [], diagnosticSamples: [], unsupportedActivity: [], activityCompletedItems: [], activityBlockedByManualOverride: [], diagnosticActivitySamples: [], profileFailures: []};
  try {
    for (const character of linked) {
      checkingCharacterId = character.id;
      const result = await syncNexonCharacter(character.id);
      total.profileUpdated += result.profileUpdated || 0;
      if (result.profileFailures?.length) {
        total.profileFailures.push(...result.profileFailures);
        profileFailureIds.push(character.id);
      }
      if (result.cooldown) cooldown++;
      else {
        checked++;
        appendNexonDiagnostics(total, result);
      }
    }
    total.diagnosticSamples = prioritizeNexonDiagnosticSamples(total.diagnosticSamples);
    nexonApiState = {status: 'ok', message: nexonUserStatusMessage(total, !checked), diagnostics: checked || total.profileFailures.length ? total : null, profileFailureIds};
  } catch (error) {
    const warning = nexonSchedulerWarning(state.characters.find(item => item.id === checkingCharacterId), error);
    nexonApiState = {
      status: 'warning', message: warning.message, diagnostics: {schedulerWarning: warning},
      schedulerWarningIds: [checkingCharacterId],
      schedulerRestrictedIds: warning.applicationCategory === 'scheduler_account_restriction' ? [checkingCharacterId] : []
    };
  }
  renderNexonSettings();
}
function renderIncomeForm(resetItems = false) {
  const category = $('#incomeCategory').value;
  if (resetItems || !$('#incomeItem').options.length) $('#incomeItem').innerHTML = items[category].map(item => option(item, item)).join('');
  const meso = $('#incomeItem').value === '메소', acquired = !meso && state.saleState !== 'sold';
  incomeFeeRateDraft = normalizeSaleFeeRate(incomeFeeRateDraft ?? state.settings.defaultSaleFeeRate);
  $('#incomeFeeRate').value = String(incomeFeeRateDraft);
  for (const [id, hide] of Object.entries({mesoWrap: !meso, qtyWrap: meso, priceWrap: meso || acquired, feeWrap: meso || acquired, saleStateWrap: meso, sourceWrap: meso || !acquired, incomeResult: acquired, customItemWrap: category !== 'drop'})) {
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
  return {category, item, kind: meso ? 'income' : state.saleState === 'sold' ? 'sold' : 'acquired', amount: n($('#mesoAmount').value), qty: n($('#incomeQty').value), price: n($('#incomePrice').value), feeRate: normalizeSaleFeeRate($('#incomeFeeRate').value)};
}
function updateIncomePreview() {
  const d = incomeDraft(), sold = d.kind === 'sold';
  $('#incomeResultSimple').classList.toggle('hidden', sold); $('#saleResult').classList.toggle('hidden', !sold);
  if (sold) {
    const amounts = saleAmounts(d.qty, d.price, d.feeRate) || {grossSale: 0, feeAmount: 0, netSale: 0, feeRate: d.feeRate};
    $('#saleGrossValue').textContent = `${koreanMeso(amounts.grossSale)} 메소`;
    $('#saleFeeLabel').textContent = `수수료 ${saleFeePercent(amounts.feeRate)}%`;
    $('#saleFeeValue').textContent = `-${koreanMeso(amounts.feeAmount)} 메소`;
    $('#saleNetValue').textContent = `${koreanMeso(amounts.netSale)} 메소`;
    return amounts;
  }
  const amount = d.kind === 'income' ? d.amount : 0;
  $('#incomeResultValue').textContent = `${koreanMeso(amount)} 메소`; $('#incomeResultLabel').textContent = '즉시 반영할 수익';
  $('#incomeResultDetail').textContent = `${won(amount)} 메소`;
  return {grossSale: amount, feeAmount: 0, netSale: amount, feeRate: 0};
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
function resetCurrentWeek(data, now = new Date()) {
  data.incomes = [];
  data.accountWeeklyActivities = normalizeWeeklyActivities(data.accountWeeklyActivities, 'account', true);
  data.accountWeeklyActivities.forEach(resetWeeklyActivityState);
  const currentMonth = monthKey(now);
  data.characters.forEach(character => {
    character.bosses.forEach(boss => {
      if (!isMonthlyBoss(boss)) { resetBossWeeklyState(boss); return; }
      const history = normalizeMonthlyCompletions(boss.monthlyCompletions);
      for (const [month, entry] of Object.entries(history)) if (entry.weekId === data.currentWeek) delete history[month];
      boss.monthlyCompletions = history;
      if (boss.manualOverrideMonth === currentMonth) {
        delete boss.manualOverride;
        delete boss.manualOverrideMonth;
      }
      syncMonthlyBossCurrentState(boss, now);
    });
    character.weeklyActivities = normalizeWeeklyActivities(character.weeklyActivities, 'character', true);
    character.weeklyActivities.forEach(resetWeeklyActivityState);
  });
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
  $('#editPrice').value = editSaleState === 'sold' ? won(row.salePrice ?? row.price ?? row.unitPrice) : '';
  $('#editFeeRate').value = String(row.feeRate == null ? normalizeSaleFeeRate(state.settings.defaultSaleFeeRate) : normalizeSaleFeeRate(row.feeRate));
  $('#editSource').value = row.source || ''; $('#editMemo').value = row.memo || '';
  $('#incomeEditDialog').dataset.meso = meso ? 'true' : 'false'; updateIncomeEditUI(); $('#incomeEditDialog').showModal();
}
function updateIncomeEditUI() {
  const meso = $('#incomeEditDialog').dataset.meso === 'true', sold = editSaleState === 'sold';
  for (const [id, hide] of Object.entries({editCategoryWrap: meso, editItemWrap: meso, editSaleStateWrap: meso, editAmountWrap: !meso, editQtyWrap: meso, editPriceWrap: meso || !sold, editFeeWrap: meso || !sold, editSaleResult: meso || !sold, editSourceWrap: meso || sold, editMemoWrap: meso})) $('#' + id).classList.toggle('hidden', hide);
  $$('[data-edit-sale]').forEach(button => { const active = button.dataset.editSale === editSaleState; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  updateIncomeEditPreview();
}
function updateIncomeEditPreview() {
  if ($('#incomeEditDialog').dataset.meso === 'true' || editSaleState !== 'sold') return null;
  const amounts = saleAmounts(n($('#editQty').value), n($('#editPrice').value), $('#editFeeRate').value) || {grossSale: 0, feeAmount: 0, netSale: 0, feeRate: normalizeSaleFeeRate($('#editFeeRate').value)};
  $('#editGrossValue').textContent = `${koreanMeso(amounts.grossSale)} 메소`;
  $('#editFeeLabel').textContent = `수수료 ${saleFeePercent(amounts.feeRate)}%`;
  $('#editFeeValue').textContent = `-${koreanMeso(amounts.feeAmount)} 메소`;
  $('#editNetValue').textContent = `${koreanMeso(amounts.netSale)} 메소`;
  return amounts;
}
function saveIncomeEdit() {
  const index = state.incomes.findIndex(row => row.id === editingIncomeId); if (index < 0) return false;
  const current = state.incomes[index], meso = recordKind(current) === 'income';
  const amount = n($('#editAmount').value), qty = n($('#editQty').value), price = n($('#editPrice').value), feeRate = normalizeSaleFeeRate($('#editFeeRate').value);
  if (meso ? !Number.isSafeInteger(amount) || amount <= 0 : !Number.isSafeInteger(qty) || qty < 1) { message('금액 또는 수량을 올바르게 입력해 주세요.', true); return false; }
  const sale = !meso && editSaleState === 'sold' ? saleAmounts(qty, price, feeRate) : null;
  if (!meso && editSaleState === 'sold' && !sale) { message('판매가와 수량을 올바르게 입력해 주세요.', true); return false; }
  return transaction(next => {
    const row = next.incomes[index]; row.memo = $('#editMemo').value.trim();
    if (meso) Object.assign(row, {amount, netIncome: amount, recordType: 'income', saleState: 'direct'});
    else {
      const category = $('#editCategory').value, item = $('#editItem').value.trim(); if (!item) throw new Error('아이템명을 입력해 주세요.');
      Object.assign(row, {category, categoryLabel: labels[category], item, qty, quantity: qty, recordType: editSaleState, saleState: editSaleState});
      delete row.amount; delete row.grossIncome;
      if (editSaleState === 'acquired') {
        Object.assign(row, {netIncome: 0, source: $('#editSource').value.trim()});
        for (const key of ['type', 'salePrice', 'price', 'unitPrice', 'materialCost', 'feeRate', 'grossSale', 'feeAmount', 'netSale', 'grossIncome']) delete row[key];
      } else {
        Object.assign(row, {type: 'sale', salePrice: price, price, unitPrice: price, ...sale, grossIncome: sale.grossSale, netIncome: sale.netSale});
        delete row.source; (next.settings.itemPrices ||= {})[item] = price;
      }
    }
  });
}
async function linkNexonCharacter(character, characterName) {
  if (!character || !characterName || nexonApiState.status === 'checking') return null;
  nexonApiState = {status: 'checking', message: `${character.name} 연동 확인 중…`, diagnostics: null};
  renderNexonSettings(); renderAppExperience();
  try {
    const result = await syncNexonCharacter(character.id, {characterName});
    nexonApiState = nexonLinkUiState(result, character.id);
    return result;
  } catch (error) {
    nexonApiState = {status: 'error', message: error.message, diagnostics: null, errorCharacterId: character.id};
    throw error;
  } finally {
    renderNexonSettings(); renderAppExperience();
  }
}
function init() {
  validatePresetIntegrity();
  setupThemeController();
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.matches?.('[data-nexon-profile-image]')) {
      const avatar = image.closest('.nexon-profile-image');
      image.hidden = true;
      if (avatar) avatar.hidden = true;
    }
  }, true);
  loadState(); watchSyncBadge(); renderIncomeForm(true); render(); if (!storageBlocked) message('이 기기에 자동 저장됩니다.');
  $('#weekSelect').addEventListener('change', e => { selectedWeek = e.target.value; render(); });
  $('#returnCurrent').addEventListener('click', () => { selectedWeek = ''; render(); });
  $('#characterList').addEventListener('click', e => {
    const button = e.target.closest('[data-character-detail]'), card = button?.closest('[data-character]');
    if (card) openCharacterHub(card.dataset.character);
  });
  $('#characterHubBack').addEventListener('click', () => activatePage('summary'));
  $('#characterHubSelect').addEventListener('change', e => { selectedHubCharacterId = e.target.value; renderCharacterHub(viewData()); ensureCharacterHubEquipment(); });
  $$('[data-character-hub-tab]').forEach(button => button.addEventListener('click', () => {
    activeCharacterHubTab = button.dataset.characterHubTab;
    renderCharacterHub(viewData());
    ensureCharacterHubEquipment();
  }));
  $('#characterHubTab').addEventListener('click', e => {
    const equipmentItem = e.target.closest('[data-equipment-item]');
    if (equipmentItem) {
      const ref = equipmentItem.dataset.equipmentItem, item = nexonEquipmentDialogItems.get(ref);
      const character = selectedHubCharacter(viewData()), ocid = character?.nexonCharacter?.ocid;
      if (ocid) nexonEquipmentItemSelection.set(equipmentSelectionKey(ocid, nexonEquipmentPresetSelection.get(ocid) || 'current'), ref);
      if (equipmentUsesInlineDetail()) renderCharacterHub(viewData());
      else openEquipmentDetail(item);
      return;
    }
    if (e.target.closest('[data-equipment-retry]')) { ensureCharacterHubEquipment({force: true}); return; }
    if (e.target.closest('[data-equipment-open-settings]')) {
      activatePage('settings');
      const route = $('[data-settings-route="nexon"]');
      if (route?.tagName === 'DETAILS') route.open = true;
      return;
    }
    if (!e.target.closest('[data-hub-boss-manage]')) return;
    const character = selectedHubCharacter(viewData());
    if (!character) return;
    selectedBossCharacterId = character.id;
    activatePage('boss');
    renderBosses(viewData());
  });
  $('#characterHubTab').addEventListener('change', e => {
    const select = e.target.closest('[data-equipment-preset]');
    if (!select) return;
    const character = selectedHubCharacter(viewData()), ocid = character?.nexonCharacter?.ocid;
    if (!ocid) return;
    nexonEquipmentPresetSelection.set(ocid, select.value);
    renderCharacterHub(viewData());
  });
  $$('[data-tab]').forEach(button => button.addEventListener('click', () => activatePage(button.dataset.tab)));
  const openIncomeEntry = () => { returnTabAfterIncome = activeMainTab; activatePage('income', {updateNavigation: false}); };
  $$('[data-open-income], [data-income-action]').forEach(button => button.addEventListener('click', openIncomeEntry));
  $('#closeIncomeEntry').addEventListener('click', () => activatePage(returnTabAfterIncome || activeMainTab));
  $$('[data-open-page]').forEach(button => button.addEventListener('click', () => activatePage(button.dataset.openPage)));
  $$('[data-open-settings]').forEach(button => button.addEventListener('click', () => {
    activatePage('settings');
    const route = $(`[data-settings-route="${button.dataset.openSettings}"]`);
    if (route?.tagName === 'DETAILS') route.open = true;
  }));
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
  $('#nexonCredentialForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#nexonCredentialInput');
    if (!event.currentTarget.reportValidity()) return;
    const apiKey = input.value.trim();
    const previous = {...nexonCredentialState};
    nexonCredentialState = {...previous, status: 'saving', editing: true, message: 'NEXON에서 API Key를 확인하고 암호화하여 저장하는 중…'};
    renderNexonCredentialSettings();
    try {
      const result = await nexonCredentialRequest('POST', {apiKey});
      input.value = '';
      clearNexonDetailRuntimeCache();
      nexonCredentialState = {...result, status: 'saved', editing: false, message: '개인 NEXON API Key가 안전하게 등록되었습니다.'};
    } catch (error) {
      nexonCredentialState = {...previous, status: 'error', editing: true, message: nexonCredentialErrorMessage(error)};
    }
    renderNexonCredentialSettings(); renderAppExperience();
  });
  $('#changeNexonCredential').addEventListener('click', () => {
    nexonCredentialState = {...nexonCredentialState, editing: true, message: '새 API Key가 검증된 경우에만 기존 Key를 교체합니다.'};
    renderNexonCredentialSettings(); renderAppExperience();
    $('#nexonCredentialInput').focus();
  });
  $('#cancelNexonCredentialChange').addEventListener('click', () => {
    $('#nexonCredentialInput').value = '';
    nexonCredentialState = {...nexonCredentialState, status: 'ready', editing: false, message: ''};
    renderNexonCredentialSettings(); renderAppExperience();
  });
  $('#deleteNexonCredential').addEventListener('click', async () => {
    if (!confirm('저장된 NEXON API Key를 삭제할까요?\n캐릭터와 수익 기록은 삭제되지 않습니다.')) return;
    const previous = {...nexonCredentialState};
    nexonCredentialState = {...previous, status: 'deleting', message: '저장된 API Key를 삭제하는 중…'};
    renderNexonCredentialSettings();
    try {
      await nexonCredentialRequest('DELETE');
      $('#nexonCredentialInput').value = '';
      onboardingCharacterCandidate = null;
      clearNexonDetailRuntimeCache();
      nexonCredentialState = {status: 'ready', hasCredential: false, editing: true, message: 'NEXON API Key 연결을 해제했습니다.'};
    } catch (error) {
      nexonCredentialState = {...previous, status: 'error', editing: false, message: nexonCredentialErrorMessage(error)};
    }
    renderNexonCredentialSettings(); renderAppExperience();
  });
  $('#runNexonSchedulerDiagnostic').addEventListener('click', runNexonSchedulerDiagnosticComparison);
  $('#nexonSchedulerDiagnosticCharacter').addEventListener('change', event => {
    nexonSchedulerDiagnosticState = {status: 'idle', characterId: event.target.value, result: null, message: '진단을 실행하면 두 요청 결과를 비교합니다.'};
    renderNexonSchedulerComparison();
  });
  $('#nexonCharacterList').addEventListener('click', async e => {
    const button = e.target.closest('[data-nexon-action]'); if (!button || nexonApiState.status === 'checking') return;
    const row = button.closest('[data-nexon-character]'), character = state.characters.find(item => item.id === row?.dataset.nexonCharacter);
    if (!character) return;
    if (button.dataset.nexonAction === 'unlink') {
      if (confirm(`${character.name}의 NEXON 캐릭터 연동을 해제할까요? 이미 확인된 이번 주 기록은 유지됩니다.`)) transaction(next => { delete next.characters.find(item => item.id === character.id).nexonCharacter; });
      return;
    }
    const characterName = prompt('연동할 NEXON 메이플스토리 캐릭터명', character.nexonCharacter?.characterName || character.name)?.trim();
    if (!characterName) return;
    try { await linkNexonCharacter(character, characterName); } catch {}
  });
  $('#onboardingCharacterForm').addEventListener('submit', async event => {
    event.preventDefault();
    const character = state.characters.find(item => item.id === $('#onboardingLocalCharacter').value);
    const characterName = $('#onboardingCharacterName').value.trim();
    if (!character || !characterName) return;
    const result = $('#onboardingCharacterResult'), button = $('#onboardingCharacterSubmit');
    if (!onboardingCharacterCandidate || onboardingCharacterCandidate.characterId !== character.id || onboardingCharacterCandidate.characterName !== characterName) {
      result.className = 'onboarding-character-result pending'; result.textContent = `${characterName} 캐릭터 정보를 확인하고 있습니다…`;
      button.disabled = true;
      try {
        const response = await fetchNexonProfile('', characterName), profile = response?.character || {};
        if (!response?.ocid || !profile.name) throw new Error('NEXON 캐릭터 정보를 확인하지 못했습니다.');
        onboardingCharacterCandidate = {characterId: character.id, characterName, response};
        result.className = 'onboarding-character-result mint';
        const preview = {nexonCharacter: {ocid: response.ocid, characterName: profile.name, world: profile.world, className: profile.className, level: profile.level, image: profile.image}};
        result.innerHTML = `${nexonProfileAvatar(preview, 'settings-avatar')}<span><b>${escapeHtml(profile.name)}</b><small>${escapeHtml([[Number.isInteger(profile.level) ? `Lv. ${profile.level}` : '', profile.className || ''].filter(Boolean).join(' '), profile.world || ''].filter(Boolean).join(' · '))}</small></span>`;
        button.textContent = '이 캐릭터 연결';
      } catch (error) {
        onboardingCharacterCandidate = null;
        result.className = 'onboarding-character-result negative'; result.textContent = error.message || '캐릭터 정보를 확인하지 못했습니다.';
      } finally { button.disabled = false; }
      return;
    }
    result.className = 'onboarding-character-result pending'; result.textContent = `${characterName} 캐릭터를 연결하고 있습니다…`;
    try {
      await linkNexonCharacter(character, characterName);
      const linked = state.characters.find(item => item.id === character.id);
      const profile = linked?.nexonCharacter || {};
      result.className = 'onboarding-character-result mint';
      result.innerHTML = `${nexonProfileAvatar(linked, 'settings-avatar')}<span><b>${escapeHtml(profile.characterName || characterName)}</b><small>${escapeHtml([[Number.isInteger(profile.level) ? `Lv. ${profile.level}` : '', profile.className || ''].filter(Boolean).join(' '), profile.world || ''].filter(Boolean).join(' · '))}</small></span>`;
      onboardingCharacterCandidate = null;
      renderAppExperience();
    } catch (error) {
      result.className = 'onboarding-character-result negative'; result.textContent = error.message || '캐릭터 정보를 확인하지 못했습니다.';
    }
  });
  $('#onboardingCharacterName').addEventListener('input', resetOnboardingCharacterCandidate);
  $('#onboardingLocalCharacter').addEventListener('change', resetOnboardingCharacterCandidate);
  $('#finishOnboarding').addEventListener('click', () => { onboardingDismissed = true; activeMainTab = 'summary'; activatePage('summary'); renderAppExperience(); });
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
    if (transaction(next => next.characters.push({id, name, bosses, weeklyActivities: normalizeWeeklyActivities([], 'character', true)}))) { $('#characterForm').reset(); $('#characterDialog').close(); }
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
      const b = next.characters[ci].bosses[bi], now = new Date();
      if (field === 'done') {
        if (isMonthlyBoss(b)) {
          const currentMonth = monthKey(now);
          if (value) {
            b.manualOverride = true; b.manualOverrideMonth = currentMonth; b.completionSource = 'manual';
            recordMonthlyBossCompletion(b, currentMonth, next.currentWeek, {income: bossValue(b), completedAt: now.toISOString(), source: 'manual', now});
          } else {
            clearMonthlyBossCompletion(b, currentMonth, now);
            b.manualOverride = false; b.manualOverrideMonth = currentMonth; b.completionSource = 'manual';
          }
          syncMonthlyBossCurrentState(b, now);
        } else {
          b.done = value; b.manualOverride = value; b.completionSource = 'manual';
          if (value) b.completedIncome = bossValue(b); else delete b.completedIncome;
        }
      } else {
        b[field] = field === 'difficulty' ? value : Math.max(field === 'party' ? 1 : 0, n(value));
        if (field === 'party') b.partySize = b.party;
        if (field === 'difficulty') b.price = referencePrice(b.name, value);
        resetBossCurrentPeriodState(b, now);
      }
    });
  });
  $('#bossEditor').addEventListener('click', e => {
    const button = e.target.closest('[data-action]'); if (!button || isPast()) return;
    const ci = n(button.closest('[data-ci]').dataset.ci), c = state.characters[ci];
    if (button.dataset.action === 'add-boss') openBossDialog(ci);
    if (button.dataset.action === 'remove-boss') { const bi = n(button.closest('[data-bi]').dataset.bi); if (confirm(`${c.name}의 ${c.bosses[bi].name}을 삭제할까요? 보스 수익 기록에서도 제외됩니다.`)) transaction(next => next.characters[ci].bosses.splice(bi, 1)); }
  });
  $('#weeklyActivityList').addEventListener('change', e => {
    if (e.target.matches('#weeklyActivityCharacterSelect')) {
      selectedActivityCharacterId = e.target.value;
      renderWeeklyActivities(viewData());
      return;
    }
    if (!e.target.matches('[data-activity-done]')) return;
    const scope = e.target.dataset.activityScope, section = e.target.closest('[data-activity-character-id]'), row = e.target.closest('[data-ai]');
    const activityId = scope === 'character' ? section?.dataset.activityCharacterId : '', ai = n(row?.dataset.ai), done = e.target.checked;
    transaction(next => {
      const collection = scope === 'account'
        ? next.accountWeeklyActivities
        : next.characters.find(character => character.id === activityId)?.weeklyActivities;
      const activity = collection?.[ai];
      if (!activity) throw new Error('주간 콘텐츠를 찾을 수 없습니다.');
      activity.done = done;
      activity.manualOverride = done;
      activity.completionSource = 'manual';
    });
  });
  $('#bossToAdd').addEventListener('change', updateBossDialogOptions);
  $('#bossForm').addEventListener('submit', e => { e.preventDefault(); const ci = n($('#bossDialog').dataset.ci), name = $('#bossToAdd').value, difficulty = $('#bossDifficulty').value, partySize = n($('#bossPartySize').value); if (transaction(next => { if (!next.characters[ci].bosses.some(b => b.bossId === bossIdFor(name))) next.characters[ci].bosses.push(makeBoss({bossId: bossIdFor(name), difficulty, partySize})); })) $('#bossDialog').close(); });
  $('#incomeCategory').addEventListener('change', () => { incomeFeeRateDraft = null; renderIncomeForm(true); });
  $('#incomeItem').addEventListener('change', () => { incomeFeeRateDraft = null; renderIncomeForm(); });
  $$('[data-sale]').forEach(b => b.addEventListener('click', () => { state.saleState = b.dataset.sale; if (state.saleState === 'sold') incomeFeeRateDraft = normalizeSaleFeeRate(state.settings.defaultSaleFeeRate); renderIncomeForm(); }));
  $('#incomeFeeRate').addEventListener('change', () => { incomeFeeRateDraft = normalizeSaleFeeRate($('#incomeFeeRate').value); updateIncomePreview(); });
  document.addEventListener('input', e => {
    if (e.target.classList.contains('money-input')) formatMoneyInput(e.target);
    if (e.target.closest('#incomeForm')) updateIncomePreview();
    if (e.target.closest('#incomeEditForm')) updateIncomeEditPreview();
  });
  $('#editFeeRate').addEventListener('change', updateIncomeEditPreview);
  $('#incomeForm').addEventListener('submit', e => {
    e.preventDefault(); const d = incomeDraft();
    if (d.kind === 'income' ? !Number.isSafeInteger(d.amount) || d.amount <= 0 : !Number.isSafeInteger(d.qty) || d.qty < 1) { message('금액 또는 수량을 올바르게 입력해 주세요.', true); return; }
    const sale = d.kind === 'sold' ? saleAmounts(d.qty, d.price, d.feeRate) : null;
    if (d.kind === 'sold' && !sale) { message('판매가와 수량을 올바르게 입력해 주세요.', true); return; }
    const ok = transaction(next => {
      const row = {id: uid(), date: new Date().toLocaleString('ko-KR'), createdAt: Date.now(), weekId: next.currentWeek, category: d.category, categoryLabel: labels[d.category], item: d.item, recordType: d.kind, memo: $('#incomeMemo').value.trim()};
      if (d.kind === 'income') Object.assign(row, {amount: d.amount, netIncome: d.amount, saleState: 'direct'});
      else if (d.kind === 'acquired') Object.assign(row, {qty: d.qty, quantity: d.qty, netIncome: 0, saleState: 'acquired', source: $('#incomeSource').value.trim()});
      else { Object.assign(row, {type: 'sale', qty: d.qty, quantity: d.qty, salePrice: d.price, price: d.price, unitPrice: d.price, ...sale, grossIncome: sale.grossSale, netIncome: sale.netSale, saleState: 'sold'}); (next.settings.itemPrices ||= {})[d.item] = d.price; }
      next.incomes.push(row);
    });
    if (ok) { for (const id of ['mesoAmount', 'incomePrice', 'incomeSource', 'incomeMemo']) $('#' + id).value = ''; $('#incomeQty').value = '1'; incomeFeeRateDraft = normalizeSaleFeeRate(state.settings.defaultSaleFeeRate); $$('#incomeForm .money-hint').forEach(el => { el.textContent = ''; }); renderIncomeForm(); }
  });
  $('#incomeHistory').addEventListener('click', e => {
    const button = e.target.closest('[data-income-action]'); if (!button || isPast()) return;
    const row = state.incomes.find(item => item.id === button.dataset.incomeId); if (!row) return;
    if (button.dataset.incomeAction === 'edit') openIncomeEdit(row.id);
    if (button.dataset.incomeAction === 'delete' && confirm(`${labels[row.category] || '기타'} · ${row.item} 기록을 삭제할까요? 수익 합계에서 즉시 제외됩니다.`)) transaction(next => { next.incomes = next.incomes.filter(item => item.id !== row.id); });
  });
  $$('[data-edit-sale]').forEach(button => button.addEventListener('click', () => { editSaleState = button.dataset.editSale; updateIncomeEditUI(); }));
  $('#incomeEditForm').addEventListener('submit', e => { e.preventDefault(); if (saveIncomeEdit()) { editingIncomeId = ''; $('#incomeEditDialog').close(); } });
  $('#defaultSaleFeeRate').addEventListener('change', () => {
    const feeRate = normalizeSaleFeeRate($('#defaultSaleFeeRate').value);
    if (transaction(next => { next.settings.defaultSaleFeeRate = feeRate; })) { incomeFeeRateDraft = feeRate; renderIncomeForm(); }
  });
  $$('[data-theme-preference]').forEach(button => button.addEventListener('click', () => setThemePreference(button.dataset.themePreference)));
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
  window.addEventListener('storage', e => {
    if (e.key === KEY) { loadState(); render(); renderIncomeForm(); message('다른 탭에서 저장한 변경을 반영했습니다.'); }
    if (e.key === THEME_STORAGE_KEY) { themePreference = normalizeThemePreference(e.newValue); applyTheme(themePreference); renderThemeSettings(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkWeek(); }); setInterval(checkWeek, 15000);
}
if (typeof window !== 'undefined') window.mapleIncomeApp = {
  storageKey: KEY,
  changeEvent: LOCAL_CHANGE_EVENT,
  getState: () => copy(state),
  hasMeaningfulData: raw => stateHasMeaningfulUserData(raw),
  getMigrationInfo: () => copy(migrationSyncInfo),
  completeMigrationSync: () => { migrationSyncInfo = null; localStorage.removeItem(MIGRATION_SYNC_KEY); },
  normalizeCloudState: raw => migrateState(raw),
  applyCloudState,
  setCloudAuthBridge: setNexonCredentialAuthBridge,
  onCloudAuthChanged: onNexonCredentialAuthChanged,
  onCloudSyncReady
};
if (typeof document !== 'undefined') init();
