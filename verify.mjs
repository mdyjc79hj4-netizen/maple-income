import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cloudSyncInternals} from './cloud-sync.js';
import nexonSchedulerHandler, {nexonProxyInternals} from './api/nexon-scheduler.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const cloudSource = readFileSync(new URL('./cloud-sync.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const nexonApiSource = readFileSync(new URL('./api/nexon-scheduler.js', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('./.env.example', import.meta.url), 'utf8');
const context = vm.createContext({console, crypto: webcrypto, document: undefined, structuredClone, setTimeout, clearTimeout});
vm.runInContext(source, context);
const run = expression => vm.runInContext(expression, context);
const json = expression => JSON.parse(run(`JSON.stringify(${expression})`));

assert.equal(run('validatePresetIntegrity()'), true);
assert.equal(run('presetGroups.all.bosses.length'), run('Object.keys(bossDB).length'));
assert.equal(run('new Set(presetGroups.all.bosses.map(b => b.bossId)).size'), run('Object.keys(bossDB).length'));
assert.throws(() => run("validatePresetIntegrity({...presetGroups, all: {...presetGroups.all, bosses: presetGroups.all.bosses.slice(1)}})"), /전체 보스/);
assert.throws(() => run("validatePresetIntegrity({...presetGroups, early: {...presetGroups.early, bosses: [...presetGroups.early.bosses, presetGroups.early.bosses[0]]}})"), /중복 bossId/);
assert.throws(() => run("validatePresetIntegrity({...presetGroups, early: {...presetGroups.early, bosses: presetGroups.early.bosses.map((b,i) => i ? b : {...b,difficulty:'없는 난이도'})}})"), /유효하지 않은 난이도/);
assert.throws(() => run("validatePresetIntegrity({...presetGroups, early: {...presetGroups.early, bosses: presetGroups.early.bosses.map((b,i) => i ? b : {...b,partySize:7})}})"), /유효하지 않은 파티 인원/);

const expectedEndgame = ['검은 마법사', '선택받은 세렌', '감시자 칼로스', '카링', '벨로나', '림보', '발드릭스', '최초의 대적자', '찬란한 흉성', '유피테르'];
assert.deepEqual(json('presetGroups.end.bosses.map(b => bossNameFor(b.bossId))'), expectedEndgame);

const expectedDifficulties = {
  '검은 마법사': ['하드', '익스트림'], '선택받은 세렌': ['노멀', '하드', '익스트림'],
  '감시자 칼로스': ['이지', '노멀', '카오스', '익스트림'], '카링': ['이지', '노멀', '하드', '익스트림'],
  '벨로나': ['이지', '노멀', '하드'], '림보': ['노멀', '하드'], '발드릭스': ['노멀', '하드'],
  '최초의 대적자': ['이지', '노멀', '하드', '익스트림'], '찬란한 흉성': ['노멀', '하드'], '유피테르': ['노멀', '하드']
};
for (const [name, difficulties] of Object.entries(expectedDifficulties)) assert.deepEqual(json(`Object.keys(bossDB[${JSON.stringify(name)}])`), difficulties);

const legacy = {
  version: 3,
  currentWeek: '2026-09-17~2026-09-23',
  characters: [{id: 'c1', name: '본캐', bosses: [
    {bossId: 'seren', name: '세렌', difficulty: '하드', partySize: 2, party: 2, price: 302000000, done: true, completedIncome: 151000000},
    {bossId: 'kalos', name: '칼로스', difficulty: '카오스', partySize: 3, party: 3, price: 1230000000, done: false}
  ]}],
  incomes: [{id: 'i1', item: '메소', category: 'hunt', amount: 82000000, netIncome: 82000000, createdAt: 1}],
  weeklyHistory: {'2026-09-10~2026-09-16': {weekId: '2026-09-10~2026-09-16', characters: [], incomes: [], totals: {total: 10}}},
  presets: [{id: 'p1', name: '상위', bosses: [{bossId: 'seren', difficulty: '익스트림', partySize: 4}, {bossId: 'seren', difficulty: '노멀', partySize: 1}]}],
  settings: {itemPrices: {'조각': 6500000}}, saleState: 'acquired'
};
context.__legacy = legacy;
const migrated = json("migrateState(__legacy, new Date('2026-09-20T12:00:00'))");
assert.equal(migrated.version, 5);
assert.ok(!Number.isNaN(Date.parse(migrated.updatedAt)));
assert.deepEqual(migrated.characters[0].bosses.map(b => [b.bossId, b.name, b.difficulty, b.partySize]), [
  ['seren', '선택받은 세렌', '하드', 2], ['kalos', '감시자 칼로스', '카오스', 3]
]);
assert.equal(migrated.characters[0].bosses[0].done, true);
assert.equal(migrated.characters[0].bosses[0].completedIncome, 151000000);
assert.equal(migrated.presets[0].bosses.length, 1);
assert.deepEqual(migrated.presets[0].bosses[0], {bossId: 'seren', difficulty: '익스트림', partySize: 4});
assert.equal(migrated.weeklyHistory['2026-09-10~2026-09-16'].totals.total, 10);
assert.equal(migrated.incomes[0].amount, 82000000);

const nexonNames = {
  '자쿰': 'zakum', '피에르': 'pierre', '반반': 'vonbon', '블러디 퀸': 'bloodyqueen', '벨룸': 'vellum',
  '매그너스': 'magnus', '파풀라투스': 'papulatus', '스우': 'lotus', '데미안': 'damien',
  '가디언 엔젤 슬라임': 'guardian-angel-slime', '루시드': 'lucid', '윌': 'will', '더스크': 'gloom',
  '듄켈': 'darknell', '진 힐라': 'verus-hilla', '검은 마법사': 'black-mage', '선택받은 세렌': 'seren',
  '감시자 칼로스': 'kalos', '카링': 'kaling', '벨로나': 'bellona', '림보': 'limbo', '발드릭스': 'baldrix',
  '최초의 대적자': 'first-adversary', '찬란한 흉성': 'shining-calamity', '유피테르': 'jupiter'
};
for (const [name, bossId] of Object.entries(nexonNames)) {
  context.__nexonEntry = {contentName: name, difficulty: '하드', cycle: '주간', complete: true};
  assert.equal(run('mapNexonBossEntry(__nexonEntry)?.bossId'), bossId);
}

const schedulerState = {
  version: 5, updatedAt: '2026-09-23T00:00:00.000Z', currentWeek: '2026-09-17~2026-09-23',
  characters: [{id: 'c1', name: '본캐', bosses: [
    {bossId: 'lotus', name: '스우', difficulty: '하드', party: 2, partySize: 2, price: 48900000, done: false},
    {bossId: 'damien', name: '데미안', difficulty: '하드', party: 1, partySize: 1, price: 46400000, done: true, completedIncome: 46400000, completionSource: 'manual', manualOverride: true}
  ]}], incomes: [], weeklyHistory: {}, presets: [], settings: {}
};
const schedulerResponse = {
  date: '2026-09-23',
  character: {ocid: '0123456789abcdef0123456789abcdef', name: '넥슨본캐', world: '루나'},
  bosses: [
    {contentName: '스우', difficulty: '하드', cycle: '주간', complete: false},
    {contentName: '스우', difficulty: '하드', cycle: '주간', complete: true},
    {contentName: '데미안', difficulty: '하드', cycle: '주간', complete: false},
    {contentName: '알 수 없는 신규 보스', difficulty: '하드', cycle: '주간', complete: true}
  ]
};
context.__schedulerState = structuredClone(schedulerState);
context.__schedulerResponse = structuredClone(schedulerResponse);
const appliedScheduler = json("applyNexonSchedulerState(__schedulerState, 'c1', __schedulerResponse, '2026-09-23T01:00:00.000Z')");
assert.equal(appliedScheduler.newlyCompleted, 1);
assert.equal(appliedScheduler.matched, 2);
assert.deepEqual(appliedScheduler.unknown, ['알 수 없는 신규 보스']);
assert.equal(context.__schedulerState.characters[0].bosses[0].done, true);
assert.equal(context.__schedulerState.characters[0].bosses[0].completionSource, 'nexon-api');
assert.equal(context.__schedulerState.characters[0].bosses[0].completedIncome, 24450000);
assert.equal(context.__schedulerState.characters[0].bosses[1].done, true);
assert.equal(context.__schedulerState.characters[0].bosses[1].completionSource, 'manual');

// Re-reading the same result does not rewrite boss state.
const bossesBeforeRepeat = JSON.stringify(context.__schedulerState.characters[0].bosses);
const repeatedScheduler = json("applyNexonSchedulerState(__schedulerState, 'c1', __schedulerResponse, '2026-09-23T01:05:00.000Z')");
assert.equal(repeatedScheduler.bossesChanged, false);
assert.equal(JSON.stringify(context.__schedulerState.characters[0].bosses), bossesBeforeRepeat);

// Manual incomplete override wins over an API completion until weekly reset.
context.__manualState = structuredClone(schedulerState);
context.__manualState.characters[0].bosses[0].manualOverride = false;
context.__manualState.characters[0].bosses[0].completionSource = 'manual';
context.__manualResponse = {date: '2026-09-23', character: schedulerResponse.character, bosses: [{contentName: '스우', difficulty: '하드', cycle: '주간', complete: true}]};
run("applyNexonSchedulerState(__manualState, 'c1', __manualResponse, '2026-09-23T02:00:00.000Z')");
assert.equal(context.__manualState.characters[0].bosses[0].apiCompleted, true);
assert.equal(context.__manualState.characters[0].bosses[0].done, false);

// Cloud field-level merges are normalized so a manual incomplete override cannot be revived by API metadata.
context.__mergedOverride = structuredClone(context.__manualState);
context.__mergedOverride.characters[0].bosses[0].done = true;
context.__mergedOverride.characters[0].bosses[0].completedIncome = 24450000;
const normalizedOverride = json('migrateState(__mergedOverride)');
assert.equal(normalizedOverride.characters[0].bosses[0].done, false);
assert.equal('completedIncome' in normalizedOverride.characters[0].bosses[0], false);

// Invalid/error-shaped scheduler data leaves existing state untouched.
context.__invalidState = structuredClone(schedulerState);
const invalidBefore = JSON.stringify(context.__invalidState);
assert.throws(() => run("applyNexonSchedulerState(__invalidState, 'c1', {error:'failed'})"), /응답/);
assert.equal(JSON.stringify(context.__invalidState), invalidBefore);
context.__wrongWeekResponse = {...structuredClone(schedulerResponse), date: '2026-09-16'};
assert.throws(() => run("applyNexonSchedulerState(__invalidState, 'c1', __wrongWeekResponse)"), /주차/);
assert.equal(JSON.stringify(context.__invalidState), invalidBefore);

context.__v1 = {characters:[{name:'구버전',bosses:{세렌:{difficulty:'하드',price:302000000,done:false},칼로스:{difficulty:'카오스',price:1230000000,done:false}}}],incomes:[],weeklyHistory:{},presets:{},settings:{}};
const migratedV1 = json("migrateState(__v1, new Date('2026-09-20T12:00:00'))");
assert.equal(migratedV1.characters[0].bosses.filter(b => b.bossId === 'seren').length, 1);
assert.equal(migratedV1.characters[0].bosses.find(b => b.bossId === 'seren').price, 302000000);
assert.equal(migratedV1.characters[0].bosses.find(b => b.bossId === 'kalos').price, 1230000000);

context.__backup = JSON.stringify(legacy);
assert.equal(run("prepareImportedState(__backup, new Date('2026-09-20T12:00:00')).version"), 5);
assert.throws(() => run("prepareImportedState('{broken')"), /JSON/);
assert.throws(() => run("prepareImportedState('{}')"), /저장 데이터 형식/);

context.__reset = JSON.parse(JSON.stringify(migrated));
run('resetCurrentWeek(__reset)');
const reset = context.__reset;
assert.equal(reset.incomes.length, 0);
assert.equal(reset.characters[0].bosses[0].done, false);
assert.equal('completedIncome' in reset.characters[0].bosses[0], false);
assert.equal(reset.characters[0].bosses[0].difficulty, '하드');
assert.equal(reset.characters[0].bosses[0].partySize, 2);
assert.equal(reset.presets.length, 1);
assert.equal(Object.keys(reset.weeklyHistory).length, 1);

context.__roll = JSON.parse(JSON.stringify(migrated));
run("rollover(__roll, new Date('2026-09-24T00:00:00'))");
const rolled = context.__roll;
assert.ok(rolled.weeklyHistory['2026-09-17~2026-09-23']);
assert.equal(rolled.weeklyHistory['2026-09-17~2026-09-23'].incomes[0].amount, 82000000);
assert.equal(rolled.characters[0].bosses[0].done, false);
assert.equal(rolled.characters[0].bosses[0].difficulty, '하드');
assert.equal(rolled.characters[0].bosses[0].partySize, 2);
assert.equal(rolled.presets.length, 1);

context.__nexonRoll = structuredClone(context.__schedulerState);
run("rollover(__nexonRoll, new Date('2026-09-24T00:00:00'))");
assert.equal(context.__nexonRoll.weeklyHistory['2026-09-17~2026-09-23'].characters[0].bosses[0].completionSource, 'nexon-api');
assert.equal(context.__nexonRoll.characters[0].bosses[0].done, false);
assert.equal('apiCompleted' in context.__nexonRoll.characters[0].bosses[0], false);
assert.equal(context.__nexonRoll.characters[0].nexonCharacter.ocid, schedulerResponse.character.ocid);

assert.equal(run('incomeValue({item:"메소",category:"hunt",amount:82000000})'), 82000000);
assert.equal(run('incomeValue({item:"조각",category:"hunt",recordType:"sold",qty:30,price:6500000,materialCost:5000000})'), 190000000);
assert.equal(run("historyFilter='unsold'; historyMatches({item:'조각',category:'hunt',recordType:'acquired'})"), true);
assert.equal(run("historyMatches({item:'조각',category:'hunt',recordType:'sold'})"), false);
assert.equal(run("historyFilter='gather'; historyMatches({item:'씨앗',category:'gather',recordType:'acquired'})"), true);
assert.equal(cloudSyncInternals.meaningfulLocalData({characters: [{name: '본캐', bosses: []}], incomes: [], weeklyHistory: {}, presets: [], settings: {}}), false);
assert.equal(cloudSyncInternals.meaningfulLocalData({characters: [{name: '본캐', bosses: []}], incomes: [{id: 'i1'}], weeklyHistory: {}, presets: [], settings: {}}), true);
assert.equal(await cloudSyncInternals.contentHash({version: 5, value: 1}), await cloudSyncInternals.contentHash({version: 5, value: 1}));
assert.notEqual(await cloudSyncInternals.contentHash({version: 5, value: 1}), await cloudSyncInternals.contentHash({version: 5, value: 2}));
assert.ok(cloudSyncInternals.timestamp('2026-09-23T00:00:00.000Z') > cloudSyncInternals.timestamp('2026-09-22T00:00:00.000Z'));
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: false}), 'upload');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: true}), 'noop');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: false, initial: true, hasLocalData: true}), 'choose');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true}), 'merge');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true, localChangedSinceSync: false}), 'merge');
assert.deepEqual(cloudSyncInternals.normalizeMeta(null), {});
assert.deepEqual(cloudSyncInternals.normalizeMeta('{broken'), {});
assert.equal(cloudSyncInternals.authErrorMessage({message: 'Email not confirmed'}, '로그인'), '이메일 인증이 아직 완료되지 않았습니다. 인증 메일을 확인해주세요.');

const syncBase = {
  version: 5, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z',
  settings: {theme: 'dark'},
  incomes: [{id: 'income-base', category: 'hunt', item: '메소', amount: 100, createdAt: 1}],
  characters: [{id: 'char-a', name: '본캐', bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1, done: false}]}],
  presets: [{id: 'preset-a', name: '기본', bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1}]}],
  weeklyHistory: {'week-old': {weekId: 'week-old', incomes: [], characters: []}}
};
const clone = value => structuredClone(value);

// Two devices add different records from the same remote version.
const addLocal = clone(syncBase);
addLocal.updatedAt = '2026-09-23T01:00:00.000Z';
addLocal.incomes.push({id: 'income-local', category: 'hunt', item: '메소', amount: 200, createdAt: 2});
const addRemote = clone(syncBase);
addRemote.updatedAt = '2026-09-23T02:00:00.000Z';
addRemote.incomes.push({id: 'income-remote', category: 'gather', item: '씨앗', qty: 3, createdAt: 3});
const additions = cloudSyncInternals.mergeStates(syncBase, addLocal, addRemote, '2026-09-23T03:00:00.000Z').state;
assert.deepEqual(new Set(additions.incomes.map(item => item.id)), new Set(['income-base', 'income-local', 'income-remote']));

// Same income ID: independent fields merge; same-field conflict keeps the newer revision and is audited.
const editLocal = clone(syncBase);
editLocal.updatedAt = '2026-09-23T01:00:00.000Z';
editLocal.incomes[0].amount = 150;
editLocal.incomes[0].memo = 'local memo';
const editRemote = clone(syncBase);
editRemote.updatedAt = '2026-09-23T02:00:00.000Z';
editRemote.incomes[0].amount = 175;
editRemote.incomes[0].qty = 4;
const edited = cloudSyncInternals.mergeStates(syncBase, editLocal, editRemote, '2026-09-23T03:00:00.000Z');
assert.equal(edited.state.incomes[0].amount, 175);
assert.equal(edited.state.incomes[0].memo, 'local memo');
assert.equal(edited.state.incomes[0].qty, 4);
assert.ok(edited.conflicts.some(conflict => conflict.scope === 'incomes' && conflict.id === 'income-base' && conflict.field === 'amount'));

// A character change and an income created on another device both survive.
const characterLocal = clone(syncBase);
characterLocal.updatedAt = '2026-09-23T01:00:00.000Z';
characterLocal.characters[0].name = '부캐';
const incomeRemote = clone(syncBase);
incomeRemote.updatedAt = '2026-09-23T02:00:00.000Z';
incomeRemote.incomes.push({id: 'income-other-device', category: 'drop', item: '아이템', qty: 1, createdAt: 4});
const crossType = cloudSyncInternals.mergeStates(syncBase, characterLocal, incomeRemote, '2026-09-23T03:00:00.000Z').state;
assert.equal(crossType.characters[0].name, '부캐');
assert.ok(crossType.incomes.some(item => item.id === 'income-other-device'));

// Bosses are merged by bossId inside each character.
const bossLocal = clone(syncBase);
bossLocal.updatedAt = '2026-09-23T01:00:00.000Z';
bossLocal.characters[0].bosses[0].partySize = 2;
const bossRemote = clone(syncBase);
bossRemote.updatedAt = '2026-09-23T02:00:00.000Z';
bossRemote.characters[0].bosses.push({bossId: 'damien', difficulty: '하드', partySize: 1, done: false});
const bossesMerged = cloudSyncInternals.mergeStates(syncBase, bossLocal, bossRemote, '2026-09-23T03:00:00.000Z').state.characters[0].bosses;
assert.equal(bossesMerged.find(boss => boss.bossId === 'lotus').partySize, 2);
assert.ok(bossesMerged.some(boss => boss.bossId === 'damien'));

// A tombstone beats a stale copy, so deleted data does not reappear.
const deleteLocal = clone(syncBase);
deleteLocal.updatedAt = '2026-09-23T03:00:00.000Z';
deleteLocal.incomes = [];
const staleRemote = clone(syncBase);
staleRemote.updatedAt = '2026-09-23T01:00:00.000Z';
const deleted = cloudSyncInternals.mergeStates(syncBase, deleteLocal, staleRemote, '2026-09-23T04:00:00.000Z').state;
assert.equal(deleted.incomes.some(item => item.id === 'income-base'), false);
assert.ok(deleted.sync.tombstones.incomes['income-base']);

// A stale local state cannot overwrite a newer remote edit.
const unchangedLocal = clone(syncBase);
const newerRemote = clone(syncBase);
newerRemote.updatedAt = '2026-09-23T05:00:00.000Z';
newerRemote.incomes[0].amount = 999;
const remoteWins = cloudSyncInternals.mergeStates(syncBase, unchangedLocal, newerRemote, '2026-09-23T06:00:00.000Z').state;
assert.equal(remoteWins.incomes[0].amount, 999);

// Offline local work and a remote change are merged on reconnect.
const offlineLocal = clone(syncBase);
offlineLocal.updatedAt = '2026-09-23T02:00:00.000Z';
offlineLocal.presets.push({id: 'preset-offline', name: '오프라인', bosses: []});
const onlineRemote = clone(syncBase);
onlineRemote.updatedAt = '2026-09-23T03:00:00.000Z';
onlineRemote.weeklyHistory['week-remote'] = {weekId: 'week-remote', incomes: [], characters: []};
const reconnected = cloudSyncInternals.mergeStates(syncBase, offlineLocal, onlineRemote, '2026-09-23T04:00:00.000Z').state;
assert.ok(reconnected.presets.some(preset => preset.id === 'preset-offline'));
assert.ok(reconnected.weeklyHistory['week-remote']);

// NEXON character metadata remains a normal character field in the existing 3-way merge.
const nexonLocal = clone(syncBase);
nexonLocal.updatedAt = '2026-09-23T04:00:00.000Z';
nexonLocal.characters[0].nexonCharacter = {ocid: schedulerResponse.character.ocid, characterName: '넥슨본캐'};
const nexonRemote = clone(syncBase);
nexonRemote.updatedAt = '2026-09-23T05:00:00.000Z';
nexonRemote.incomes.push({id: 'income-with-nexon', category: 'hunt', item: '메소', amount: 10, createdAt: 5});
const nexonCloudMerge = cloudSyncInternals.mergeStates(syncBase, nexonLocal, nexonRemote, '2026-09-23T06:00:00.000Z').state;
assert.equal(nexonCloudMerge.characters[0].nexonCharacter.ocid, schedulerResponse.character.ocid);
assert.ok(nexonCloudMerge.incomes.some(item => item.id === 'income-with-nexon'));

const sanitizedScheduler = nexonProxyInternals.sanitizeScheduler({
  date: '2026-09-23', character_name: '넥슨본캐', world_name: '루나',
  boss_contents: [{content_name: '스우', difficulty: '하드', cycle: '주간', registration_flag: 'true', complete_flag: 'true'}]
}, schedulerResponse.character.ocid);
assert.deepEqual(sanitizedScheduler.bosses[0], {contentName: '스우', difficulty: '하드', cycle: '주간', registered: true, complete: true});
assert.throws(() => nexonProxyInternals.sanitizeScheduler({boss_contents: null}, 'ocid'), /응답 구조/);
assert.equal(nexonProxyInternals.publicError(400).code, 'BAD_REQUEST');
assert.equal(nexonProxyInternals.publicError(403).code, 'FORBIDDEN');
assert.equal(nexonProxyInternals.publicError(429).code, 'RATE_LIMITED');
assert.equal(nexonProxyInternals.publicError(500).code, 'UPSTREAM_ERROR');
assert.equal(nexonProxyInternals.publicError(503).code, 'UPSTREAM_ERROR');
assert.match(nexonApiSource, /process\.env\.NEXON_OPEN_API_KEY/);
assert.doesNotMatch(nexonApiSource, /VITE_NEXON/);
assert.match(nexonApiSource, /'x-nxopen-api-key': apiKey/);
assert.match(nexonApiSource, /\/maplestory\/v1\/scheduler\/character-state/);
assert.match(envExample, /^NEXON_OPEN_API_KEY=$/m);
const originalNexonKey = process.env.NEXON_OPEN_API_KEY;
delete process.env.NEXON_OPEN_API_KEY;
let missingKeyStatus = 0, missingKeyBody = null;
await nexonSchedulerHandler(
  {method: 'GET', query: {characterName: '넥슨본캐'}},
  {status(code) { missingKeyStatus = code; return this; }, json(body) { missingKeyBody = body; return this; }, setHeader() {}}
);
if (originalNexonKey === undefined) delete process.env.NEXON_OPEN_API_KEY;
else process.env.NEXON_OPEN_API_KEY = originalNexonKey;
assert.equal(missingKeyStatus, 503);
assert.equal(missingKeyBody.code, 'NOT_CONFIGURED');
assert.match(cloudSource, /auth\.resend\(\{/);
assert.match(cloudSource, /emailRedirectTo: window\.location\.origin/);
assert.match(html, /id="resendConfirmation"/);
const referencedIds = [...source.matchAll(/\$\('#([A-Za-z][A-Za-z0-9_-]*)'\)/g)].map(match => match[1]);
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
assert.deepEqual([...new Set(referencedIds)].filter(id => !htmlIds.has(id)), []);
const cloudIds = [...cloudSource.matchAll(/querySelector\('#([A-Za-z][A-Za-z0-9_-]*)'\)/g)].map(match => match[1]);
assert.deepEqual([...new Set(cloudIds)].filter(id => !htmlIds.has(id)), []);
assert.match(css, /\.chip-scroll\{[^}]*overflow-x:auto/);
assert.match(css, /@media\(max-width:430px\)/);
assert.match(css, /\.danger-action button\{width:100%;min-height:44px\}/);
assert.match(css, /\.cloud-actions button\{[^}]*min-height:44px/);
assert.match(schema, /alter table public\.maple_income_sync enable row level security/i);
assert.equal((schema.match(/create policy/gi) || []).length, 3);
assert.match(schema, /auth\.uid\(\)\) = user_id/);
console.log('boss roster, preset, migration, backup, reset, rollover, income, NEXON scheduler and multi-device cloud sync regression checks passed');
