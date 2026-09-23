import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cloudSyncInternals} from './cloud-sync.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const cloudSource = readFileSync(new URL('./cloud-sync.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
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
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true, localChangedSinceSync: true, localUpdatedAt: '2026-09-23T01:00:00Z', remoteUpdatedAt: '2026-09-23T00:00:00Z'}), 'upload');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true, localChangedSinceSync: false, localUpdatedAt: '2026-09-23T01:00:00Z', remoteUpdatedAt: '2026-09-23T00:00:00Z'}), 'download');
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
console.log('boss roster, preset, migration, backup, reset, rollover, income and cloud sync regression checks passed');
