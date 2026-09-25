import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cloudSyncInternals} from './cloud-sync.js';
import nexonSchedulerHandler, {nexonProxyInternals} from './api/nexon-scheduler.js';
import nexonCharacterHandler, {nexonCharacterInternals} from './api/nexon-character.js';

const statKeys = Object.keys(nexonCharacterInternals.statDefinitions);
const emptyDetailStats = Object.fromEntries(statKeys.map(key => [key, null]));
const detailStatsFixture = {
  ...emptyDetailStats,
  bossDamage: 412, ignoreDefense: 96.42, criticalRate: 100, criticalDamage: 92.5, damage: 85, finalDamage: 74.3,
  str: 62340, dex: 8210, int: 5140, luk: 4980, hp: 125430, attackPower: 4820, magicPower: 1250,
  starForce: 420, arcaneForce: 1320, authenticForce: 660, itemDropRate: 217, mesoAcquisitionRate: 100
};

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const cloudSource = readFileSync(new URL('./cloud-sync.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const nexonApiSource = readFileSync(new URL('./api/nexon-scheduler.js', import.meta.url), 'utf8');
const nexonCharacterApiSource = readFileSync(new URL('./api/nexon-character.js', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('./.env.example', import.meta.url), 'utf8');
const context = vm.createContext({console, crypto: webcrypto, document: undefined, structuredClone, setTimeout, clearTimeout, URL, URLSearchParams});
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
assert.equal(migrated.version, 7);
assert.equal(migrated.settings.defaultSaleFeeRate, 0.05);
assert.deepEqual(migrated.characters[0].weeklyActivities, []);
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

context.__legacySaleState = {
  version: 6, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z',
  characters: [{id:'c1',name:'본캐',bosses:[]}], presets: [], weeklyHistory: {}, settings: {},
  incomes: [{id:'legacy-sale',item:'조각',category:'hunt',recordType:'sold',saleState:'sold',qty:30,price:6500000,materialCost:5000000,grossIncome:195000000,netIncome:190000000}]
};
const migratedLegacySale = json("migrateState(__legacySaleState, new Date('2026-09-23T12:00:00'))");
assert.equal(migratedLegacySale.settings.defaultSaleFeeRate, 0.05);
assert.equal(migratedLegacySale.incomes[0].netIncome, 190000000);
assert.equal(migratedLegacySale.incomes[0].materialCost, 5000000);
assert.equal('feeRate' in migratedLegacySale.incomes[0], false);
assert.equal(run('incomeValue(__legacySaleState.incomes[0])'), 190000000);

context.__legacyProfileState = {
  version: 6, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z',
  characters: [{id: 'c1', name: '본캐', bosses: [], nexonCharacter: {ocid: 'abcdefghijklmnop', characterName: '넥슨본캐', world: '루나'}}],
  incomes: [], weeklyHistory: {}, presets: [], settings: {}
};
const migratedProfileState = json("migrateState(__legacyProfileState, new Date('2026-09-23T12:00:00'))");
assert.equal(migratedProfileState.characters[0].nexonCharacter.characterName, '넥슨본캐');
assert.equal(migratedProfileState.characters[0].nexonCharacter.image, '');
assert.equal('className' in migratedProfileState.characters[0].nexonCharacter, false);
assert.equal('combatPower' in migratedProfileState.characters[0].nexonCharacter, false);
assert.equal('unionLevel' in migratedProfileState.characters[0].nexonCharacter, false);
assert.deepEqual(json("normalizeNexonCharacter({ocid:'abcdefghijklmnop',combatPower:'284300000',unionLevel:'9450',unionGrade:'그랜드 마스터 유니온',statsCheckedAt:'2026-09-24T00:00:00.000Z'})"), {
  ocid: 'abcdefghijklmnop', combatPower: 284300000, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온', statsCheckedAt: '2026-09-24T00:00:00.000Z', image: ''
});
assert.deepEqual(json("normalizeNexonCharacter({ocid:'abcdefghijklmnop',combatPower:'',unionLevel:'invalid'})"), {
  ocid: 'abcdefghijklmnop', combatPower: null, unionLevel: null, image: ''
});
context.__legacyStatsState = structuredClone(context.__legacyProfileState);
context.__legacyStatsState.characters[0].nexonCharacter.stats = {bossDamage: '412', ignoreDefense: '96.42', str: '62340', hp: 'invalid'};
const migratedStats = json("migrateState(__legacyStatsState, new Date('2026-09-23T12:00:00'))").characters[0].nexonCharacter.stats;
assert.equal(migratedStats.bossDamage, 412);
assert.equal(migratedStats.ignoreDefense, 96.42);
assert.equal(migratedStats.str, 62340);
assert.equal(migratedStats.hp, null);
assert.equal(Object.keys(migratedStats).length, statKeys.length);
assert.equal(run("safeNexonImageUrl('https://example.com/avatar.png')"), 'https://example.com/avatar.png');
assert.equal(run("safeNexonImageUrl('javascript:alert(1)')"), '');
assert.equal(run("nexonProfileAvatar({name:'본캐',nexonCharacter:{ocid:'abcdefghijklmnop'}})"), '');
const avatarMarkup = run("nexonProfileAvatar({name:'본캐',nexonCharacter:{ocid:'abcdefghijklmnop',image:'https://example.com/avatar.png'}},'summary-art')");
assert.match(avatarMarkup, /data-nexon-profile-image/);
assert.match(avatarMarkup, /nexon-profile-image summary-art/);
assert.equal((avatarMarkup.match(/<span/g) || []).length, 1);
assert.doesNotMatch(avatarMarkup, />본</);
context.__profileUiCharacter = {name: '본캐', id: 'c1', nexonCharacter: {ocid: 'abcdefghijklmnop', characterName: '넥슨본캐', world: '루나', className: '나이트로드', level: 285, image: 'https://example.com/avatar.png', profileCheckedAt: '2026-09-23T01:00:00.000Z', combatPower: 284300000, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온', stats: detailStatsFixture, statsCheckedAt: '2026-09-23T01:00:00.000Z'}};
const profileUiMarkup = run("nexonProfileAvatar(__profileUiCharacter, 'summary-art') + nexonProfileCopy(__profileUiCharacter)");
assert.match(profileUiMarkup, /data-nexon-profile-image/);
assert.match(profileUiMarkup, /넥슨본캐/);
assert.match(profileUiMarkup, /Lv\. 285/);
assert.match(profileUiMarkup, /나이트로드/);
assert.match(profileUiMarkup, /루나/);
context.__profileUiCharacter.nexonCharacter.image = '';
const profileUiWithoutImage = run('nexonProfileAvatar(__profileUiCharacter) + nexonProfileCopy(__profileUiCharacter)');
assert.doesNotMatch(profileUiWithoutImage, /<img/);
assert.match(profileUiWithoutImage, /Lv\. 285/);
assert.match(profileUiWithoutImage, /나이트로드/);
assert.match(profileUiWithoutImage, /루나/);
assert.equal(run('koreanNumber(284300000)'), '2억 8,430만');
assert.equal(run('koreanNumber(null)'), '0');
const specSummaryMarkup = run('nexonSpecSummary(__profileUiCharacter)');
assert.match(specSummaryMarkup, /2억 8,430만/);
assert.match(specSummaryMarkup, /9,450/);
assert.doesNotMatch(specSummaryMarkup, /메소/);
assert.doesNotMatch(specSummaryMarkup, /스펙 요약/);
assert.match(specSummaryMarkup, /스펙 상세 보기/);
assert.match(specSummaryMarkup, /aria-expanded="false"/);
assert.match(run('nexonSpecSummary(__profileUiCharacter, true)'), /스펙 상세 닫기/);
assert.match(run('nexonSpecSummary(__profileUiCharacter, true)'), /aria-expanded="true"/);
const statDetailsMarkup = run('nexonStatDetails(__profileUiCharacter)');
assert.match(statDetailsMarkup, /상세 스펙/);
assert.match(statDetailsMarkup, /보스 데미지/);
assert.match(statDetailsMarkup, /412%/);
assert.match(statDetailsMarkup, /96\.42%/);
assert.match(statDetailsMarkup, /62,340/);
assert.match(statDetailsMarkup, /1,320/);
assert.match(statDetailsMarkup, /217%/);
assert.equal((statDetailsMarkup.match(/data-stat-group=/g) || []).length, 4);
context.__partialStatUiCharacter = {id: 'partial', nexonCharacter: {stats: {bossDamage: 300}}};
const partialStatDetails = run('nexonStatDetails(__partialStatUiCharacter)');
assert.match(partialStatDetails, /보스 데미지/);
assert.doesNotMatch(partialStatDetails, /방어율 무시/);
assert.equal((partialStatDetails.match(/data-stat-group=/g) || []).length, 1);
context.__emptyStatUiCharacter = {id: 'empty', nexonCharacter: {stats: {}}};
assert.match(run('nexonStatDetails(__emptyStatUiCharacter)'), /상세 스펙 정보가 없습니다/);
assert.doesNotMatch(run('nexonStatDetails(__emptyStatUiCharacter)'), /data-stat-group=/);
assert.equal(run("nexonStatValue(96.42, 'percent')"), '96.42%');
assert.equal(run("nexonStatValue(62340, 'integer')"), '62,340');
assert.equal(run("nexonStatValue(null, 'percent')"), '');
const combatOnlySpec = run("nexonSpecSummary({nexonCharacter:{combatPower:284300000,unionLevel:null}})");
assert.match(combatOnlySpec, /2억 8,430만/);
assert.equal((combatOnlySpec.match(/정보 없음/g) || []).length, 1);
const unionOnlySpec = run("nexonSpecSummary({nexonCharacter:{combatPower:null,unionLevel:9450}})");
assert.match(unionOnlySpec, /9,450/);
assert.equal((unionOnlySpec.match(/정보 없음/g) || []).length, 1);
const emptySpec = run("nexonSpecSummary({nexonCharacter:{combatPower:null,unionLevel:null}})");
assert.equal((emptySpec.match(/정보 없음/g) || []).length, 2);
assert.match(run("nexonSpecSummary({nexonCharacter:{combatPower:9876543210123,unionLevel:12345}})"), /9조 8,765억 4,321만 123/);
context.__emptyCharacterStats = {bosses: []};
assert.deepEqual(json('characterStats(__emptyCharacterStats)'), {count: 0, done: 0, expected: 0, earned: 0, remaining: 0});
context.__completedCharacterStats = {bosses: [
  {bossId: 'lotus', difficulty: '하드', partySize: 1, done: true},
  {bossId: 'damien', difficulty: '하드', partySize: 1, done: true},
  {bossId: 'lucid', difficulty: '하드', partySize: 1, done: false}
]};
const completedCharacterStats = json('characterStats(__completedCharacterStats)');
assert.equal(completedCharacterStats.count, 3);
assert.equal(completedCharacterStats.done, 2);
assert.ok(completedCharacterStats.earned > 0);
context.__longProfileUiCharacter = {name: '아주긴메기캐릭터별칭테스트', nexonCharacter: {ocid: 'abcdefghijklmnop', characterName: '아주긴넥슨캐릭터이름테스트', world: '크로아', className: '아크메이지(불,독)', level: 300}};
assert.match(run('nexonProfileCopy(__longProfileUiCharacter)'), /아주긴넥슨캐릭터이름테스트/);

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
for (const [name, bossId] of [['  블러디   퀸  ', 'bloodyqueen'], ['세렌', 'seren'], ['칼로스', 'kalos']]) {
  context.__nexonEntry = {contentName: name, difficulty: '하드', cycle: '주간', complete: true};
  assert.equal(run('mapNexonBossEntry(__nexonEntry)?.bossId'), bossId);
}
context.__nexonEntry = {content_name: '스우', difficulty: ' 노말 ', cycle: '일간', registration_flag: 'false', complete_flag: 'true'};
assert.deepEqual(json('mapNexonBossEntry(__nexonEntry)'), {bossId: 'lotus', contentName: '스우', difficulty: '노멀', cycle: '일간', registered: false, complete: true});
const englishDifficulties = {easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림'};
for (const [apiDifficulty, localDifficulty] of Object.entries(englishDifficulties)) {
  context.__apiDifficulty = apiDifficulty;
  assert.equal(run('normalizeNexonDifficulty(__apiDifficulty)'), localDifficulty);
  context.__apiDifficulty = apiDifficulty.toUpperCase();
  assert.equal(run('normalizeNexonDifficulty(__apiDifficulty)'), localDifficulty);
}
context.__apiDifficulty = ' hard ';
assert.equal(run('normalizeNexonDifficulty(__apiDifficulty)'), '하드');
assert.equal(run("isNexonWeeklyCycle('bossWeekly')"), true);
assert.equal(run("isNexonWeeklyCycle('bossDaily')"), false);

const schedulerState = {
  version: 5, updatedAt: '2026-09-23T00:00:00.000Z', currentWeek: '2026-09-17~2026-09-23',
  characters: [{id: 'c1', name: '본캐', bosses: [
    {bossId: 'lotus', name: '스우', difficulty: '하드', party: 2, partySize: 2, price: 48900000, done: false},
    {bossId: 'damien', name: '데미안', difficulty: '하드', party: 1, partySize: 1, price: 46400000, done: true, completedIncome: 46400000, completionSource: 'manual', manualOverride: true}
  ]}], incomes: [], weeklyHistory: {}, presets: [], settings: {}
};
const schedulerResponse = {
  date: '2026-09-23',
  requestedDate: null,
  mode: 'live',
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
assert.equal(appliedScheduler.fetched, 4);
assert.equal(appliedScheduler.apiCompleted, 2);
assert.equal(appliedScheduler.matched, 2);
assert.equal(appliedScheduler.matchedCompleted, 1);
assert.equal(appliedScheduler.autoCompleted, 1);
assert.equal(appliedScheduler.autoCompleted, appliedScheduler.completedItems.filter(item => item.result === 'matched-auto-completed').length);
assert.equal(appliedScheduler.unknown[0].contentName, '알 수 없는 신규 보스');
assert.equal(context.__schedulerState.characters[0].bosses[0].done, true);
assert.equal(context.__schedulerState.characters[0].bosses[0].completionSource, 'nexon-api');
assert.equal(context.__schedulerState.characters[0].bosses[0].completedIncome, 24450000);
assert.equal(context.__schedulerState.characters[0].bosses[1].done, true);
assert.equal(context.__schedulerState.characters[0].bosses[1].completionSource, 'manual');
assert.equal(JSON.stringify(context.__schedulerState).includes('completedItems'), false);
context.__appliedDiagnostics = appliedScheduler;
assert.equal(run('nexonDiagnosticMessage(__appliedDiagnostics)'), 'NEXON 조회 4개 · 완료 2개 · 메기 매칭 2개 · 완료 매칭 1개 · 자동 완료 1개 · 매칭 실패 1개');
assert.deepEqual(json('Object.keys(nexonDiagnosticGroups(__appliedDiagnostics))'), ['unknownName', 'difficultyMismatch', 'ambiguous', 'localMissing', 'apiMissing', 'ignoredCycle', 'blockedByManualOverride', 'unsupportedActivity', 'activityBlockedByManualOverride', 'profileFailures']);
assert.equal(run('nexonDiagnosticGroups(__appliedDiagnostics).unknownName.length'), 1);
assert.deepEqual(appliedScheduler.completedItems.map(item => item.result).sort(), ['matched-auto-completed', 'unknown-name'].sort());
assert.equal(run('nexonUserStatusMessage(__appliedDiagnostics)'), '주간 보스 1개를 자동 확인했습니다.');
assert.equal(run('nexonUserStatusMessage({...__appliedDiagnostics, autoCompleted: 0})'), '새로 확인된 주간 기록이 없습니다.');
assert.equal(run('nexonUserStatusMessage(__appliedDiagnostics, true)'), '최근 확인한 기록입니다.');
assert.equal(run("latestNexonCheckedAt([{nexonCharacter:{lastCheckedAt:'2026-09-23T01:00:00.000Z'}},{nexonCharacter:{lastCheckedAt:'2026-09-24T02:00:00.000Z'}}])"), '2026-09-24T02:00:00.000Z');
assert.equal(run("nexonDefaultStatusMessage([{nexonCharacter:{ocid:'linked',lastCheckedAt:'2026-09-24T02:00:00.000Z'}}])"), '최신 상태');
assert.equal(run('nexonDefaultStatusMessage([{id:"unlinked"}])'), '연동할 캐릭터를 선택해주세요.');
assert.equal(JSON.stringify(context.__schedulerState).includes('diagnostics'), false);

context.__recentMissingProfile = {name: '본캐', nexonCharacter: {ocid: 'abcdefghijklmnop', characterName: '넥슨본캐', world: '루나', lastCheckedAt: '2026-09-24T00:00:00.000Z'}};
assert.equal(run('nexonProfileNeedsBackfill(__recentMissingProfile)'), true);
assert.deepEqual(json("nexonSyncPlan(__recentMissingProfile, {now: Date.parse('2026-09-24T00:00:30.000Z')})"), {schedulerCooldown: true, fetchScheduler: false, fetchProfile: true});
context.__recentCompleteProfile = structuredClone(context.__profileUiCharacter);
context.__recentCompleteProfile.nexonCharacter.lastCheckedAt = '2026-09-24T00:00:00.000Z';
context.__recentCompleteProfile.nexonCharacter.image = 'https://example.com/avatar.png';
assert.equal(run('nexonProfileNeedsBackfill(__recentCompleteProfile)'), false);
assert.deepEqual(json("nexonSyncPlan(__recentCompleteProfile, {now: Date.parse('2026-09-24T00:00:30.000Z')})"), {schedulerCooldown: true, fetchScheduler: false, fetchProfile: false});
context.__legacyStatsProfile = structuredClone(context.__recentCompleteProfile);
delete context.__legacyStatsProfile.nexonCharacter.stats;
assert.equal(run('nexonProfileNeedsBackfill(__legacyStatsProfile)'), true);
assert.deepEqual(json("nexonSyncPlan(__legacyStatsProfile, {now: Date.parse('2026-09-24T00:00:30.000Z')})"), {schedulerCooldown: true, fetchScheduler: false, fetchProfile: true});
assert.deepEqual(json("nexonSyncPlan(__recentMissingProfile, {ignoreCooldown:true, now: Date.parse('2026-09-24T00:00:30.000Z')})"), {schedulerCooldown: false, fetchScheduler: true, fetchProfile: true});
context.__profileFailure = run("nexonProfileFailure({name:'본캐',nexonCharacter:{characterName:'넥슨본캐'}}, Object.assign(new Error('권한 오류'), {status:403,code:'OPENAPI00003'}))");
assert.deepEqual(json('__profileFailure'), {character: '본캐', nexonCharacter: '넥슨본캐', status: 403, code: 'OPENAPI00003', message: '권한 오류'});
assert.equal(JSON.stringify(context.__profileFailure).includes('abcdefghijklmnop'), false);
assert.equal(run("diagnosticEntryLabel('profileFailures', __profileFailure)"), '본캐 → 넥슨본캐 · HTTP 403 · OPENAPI00003 · 권한 오류');

context.__profileResponse = {
  ok: true, fetchedAt: '2026-09-23T01:00:10.000Z',
  character: {name: '넥슨본캐', world: '루나', className: '나이트로드', level: 285, image: 'https://example.com/maple-character.png', combatPower: 284300000, stats: detailStatsFixture, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온'},
  resources: {basic: {ok: true}, stat: {ok: true}, union: {ok: true}}, warnings: []
};
assert.equal(run("applyNexonProfileState(__schedulerState, 'c1', __profileResponse, __profileResponse.fetchedAt)"), true);
assert.deepEqual(json('__schedulerState.characters[0].nexonCharacter'), {
  ocid: schedulerResponse.character.ocid, characterName: '넥슨본캐', world: '루나', linkedAt: '2026-09-23T01:00:00.000Z',
  lastCheckedAt: '2026-09-23T01:00:00.000Z', lastCheckedWeek: '2026-09-17~2026-09-23', status: 'ok',
  className: '나이트로드', level: 285, image: 'https://example.com/maple-character.png', profileCheckedAt: '2026-09-23T01:00:10.000Z',
  combatPower: 284300000, stats: detailStatsFixture, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온', statsCheckedAt: '2026-09-23T01:00:10.000Z'
});
context.__partialStatsProfile = {character: {name: '', world: '', className: '', level: null, image: '', combatPower: 300000000, unionLevel: null, unionGrade: ''}, resources: {basic: {ok: false}, stat: {ok: true}, union: {ok: false}}};
run("applyNexonProfileState(__schedulerState, 'c1', __partialStatsProfile, '2026-09-23T01:30:00.000Z')");
assert.equal(context.__schedulerState.characters[0].nexonCharacter.characterName, '넥슨본캐');
assert.equal(context.__schedulerState.characters[0].nexonCharacter.image, 'https://example.com/maple-character.png');
assert.equal(context.__schedulerState.characters[0].nexonCharacter.combatPower, 300000000);
assert.equal(context.__schedulerState.characters[0].nexonCharacter.unionLevel, 9450);
assert.equal(context.__schedulerState.characters[0].nexonCharacter.stats.ignoreDefense, 96.42);
context.__profileWithoutImage = {character: {name: '넥슨본캐', world: '루나', className: '나이트로드', level: 286, image: ''}};
run("applyNexonProfileState(__schedulerState, 'c1', __profileWithoutImage, '2026-09-23T02:00:00.000Z')");
assert.equal(context.__schedulerState.characters[0].nexonCharacter.image, '');
context.__unsafeProfile = {character: {image: 'javascript:alert(1)', level: 286}};
run("applyNexonProfileState(__schedulerState, 'c1', __unsafeProfile, '2026-09-23T02:01:00.000Z')");
assert.equal(context.__schedulerState.characters[0].nexonCharacter.image, '');
const schedulerBossesBeforeProfileFailure = JSON.stringify(context.__schedulerState.characters[0].bosses);
assert.throws(() => run("applyNexonProfileState(__schedulerState, 'c1', null)"), /기본정보 응답/);
assert.equal(JSON.stringify(context.__schedulerState.characters[0].bosses), schedulerBossesBeforeProfileFailure);

// Official weekly_contents fields are mapped into supported weekly activities without changing boss behavior.
context.__activityState = structuredClone(schedulerState);
context.__activityResponse = {
  ...structuredClone(schedulerResponse), bosses: [], activities: [
    {contentName: '에픽 던전 : 아우룸 레기스', type: 'quest', registered: true, nowCount: 0, maxCount: 1, questState: '2', complete: true},
    {contentName: '무릉도장', type: 'contents', registered: true, nowCount: 54, maxCount: 100, questState: '0', complete: true},
    {contentName: '길드 지하 수로', type: 'contents', registered: true, nowCount: 0, maxCount: 1, questState: '0', complete: false},
    {contentName: '새 주간 콘텐츠', type: 'contents', registered: true, nowCount: 1, maxCount: 1, questState: '0', complete: true}
  ]
};
const activityApplied = json("applyNexonSchedulerState(__activityState, 'c1', __activityResponse, '2026-09-23T02:10:00.000Z')");
assert.equal(activityApplied.activitiesFetched, 4);
assert.equal(activityApplied.activityMatched, 3);
assert.equal(activityApplied.activityAutoCompleted, 2);
assert.equal(activityApplied.unsupportedActivity[0].contentName, '새 주간 콘텐츠');
assert.deepEqual(JSON.parse(JSON.stringify(context.__activityState.characters[0].weeklyActivities.map(item => [item.type, item.done]))), [
  ['epic-dungeon', true], ['mu-lung-dojo', true], ['guild', false]
]);
assert.equal(context.__activityState.characters[0].weeklyActivities[0].completionSource, 'nexon-api');
assert.equal(JSON.stringify(context.__activityState).includes('activityCompletedItems'), false);
assert.equal(run('nexonUserStatusMessage({autoCompleted:2,activityAutoCompleted:1})'), '주간 보스 2개 · 주간 콘텐츠 1개를 자동 확인했습니다.');
assert.equal(run('nexonUserStatusMessage({autoCompleted:0,activityAutoCompleted:1})'), '주간 콘텐츠 1개를 자동 확인했습니다.');

context.__activityManualState = structuredClone(context.__activityState);
Object.assign(context.__activityManualState.characters[0].weeklyActivities[0], {done: false, manualOverride: false, completionSource: 'manual'});
context.__activityManualResponse = {...structuredClone(schedulerResponse), bosses: [], activities: [structuredClone(context.__activityResponse.activities[0])]};
const activityManual = json("applyNexonSchedulerState(__activityManualState, 'c1', __activityManualResponse, '2026-09-23T02:11:00.000Z')");
assert.equal(context.__activityManualState.characters[0].weeklyActivities[0].done, false);
assert.equal(activityManual.activityBlockedByManualOverride.length, 1);
assert.equal(activityManual.activityAutoCompleted, 0);

context.__duplicateUnknown = [
  {character: '본캐', contentName: '힐라', difficulty: '노멀', cycle: 'bossWeekly'},
  {character: '부캐1', contentName: '힐라', difficulty: '노멀', cycle: 'bossWeekly'},
  {character: '부캐2', contentName: '힐라', difficulty: '노멀', cycle: 'bossWeekly'},
  {character: '부캐3', contentName: '힐라', difficulty: '노멀', cycle: 'bossWeekly'}
];
const groupedUnknown = json("groupNexonDiagnosticItems('unknownName', __duplicateUnknown)");
assert.equal(groupedUnknown.length, 1);
assert.equal(groupedUnknown[0].count, 4);
assert.deepEqual(groupedUnknown[0].characters, ['본캐', '부캐1', '부캐2', '부캐3']);
assert.equal(run("groupedDiagnosticEntryLabel('unknownName', groupNexonDiagnosticItems('unknownName', __duplicateUnknown)[0])"), '힐라 · 노멀 · 4개 캐릭터');
assert.equal(run("nexonDiagnosticGroupLabels.unknownName"), '지원하지 않는 보스');
assert.equal(run("nexonDiagnosticGroupLabels.blockedByManualOverride"), '수동 해제 보호');

// Multi-character aggregation collects every sample before completion-first limiting.
context.__diagnosticTotal = {
  fetched: 0, apiCompleted: 0, matched: 0, matchedCompleted: 0, autoCompleted: 0,
  unknown: [], difficultyMismatch: [], ambiguous: [], notConfigured: [], localNotFound: [], ignoredCycle: [], completedItems: [], blockedByManualOverride: [], diagnosticSamples: []
};
context.__diagnosticA = {
  fetched: 20, apiCompleted: 0, matched: 4, matchedCompleted: 0, autoCompleted: 0,
  diagnosticSamples: Array.from({length: 20}, (_, index) => ({character: 'A', nexonCharacter: '넥슨A', contentName: `미완료 ${index}`, complete: false}))
};
context.__diagnosticB = {
  fetched: 1, apiCompleted: 1, matched: 1, matchedCompleted: 1, autoCompleted: 1,
  diagnosticSamples: [{character: 'B', nexonCharacter: '넥슨B', contentName: '완료 보스', complete: true}]
};
run('appendNexonDiagnostics(__diagnosticTotal, __diagnosticA)');
run('appendNexonDiagnostics(__diagnosticTotal, __diagnosticB)');
assert.equal(run('__diagnosticTotal.apiCompleted'), 1);
assert.equal(run('__diagnosticTotal.matchedCompleted'), 1);
const prioritizedMultiCharacterSamples = json('prioritizeNexonDiagnosticSamples(__diagnosticTotal.diagnosticSamples)');
assert.equal(prioritizedMultiCharacterSamples.length, 21);
assert.equal(prioritizedMultiCharacterSamples[0].character, 'B');
assert.equal(prioritizedMultiCharacterSamples[0].contentName, '완료 보스');

// The live API's English difficulty codes match the app's Korean canonical values.
context.__englishDifficultyState = {
  ...structuredClone(schedulerState),
  characters: [{id: 'c1', name: '본캐', bosses: [
    {bossId: 'lucid', name: '루시드', difficulty: '이지', party: 1, price: 100, done: false},
    {bossId: 'damien', name: '데미안', difficulty: '노멀', party: 1, price: 100, done: false},
    {bossId: 'lotus', name: '스우', difficulty: '하드', party: 1, price: 100, done: false},
    {bossId: 'guardian-angel-slime', name: '가디언 엔젤 슬라임', difficulty: '카오스', party: 1, price: 100, done: false},
    {bossId: 'black-mage', name: '검은 마법사', difficulty: '익스트림', party: 1, price: 100, done: false}
  ]}]
};
context.__englishDifficultyResponse = {
  ...structuredClone(schedulerResponse),
  bosses: [
    {contentName: '루시드', difficulty: 'easy', cycle: 'bossWeekly', complete: 'false'},
    {contentName: '데미안', difficulty: 'normal', cycle: 'bossWeekly', complete: 'false'},
    {contentName: '스우', difficulty: 'HARD', cycle: 'bossWeekly', complete: 'false'},
    {contentName: '가디언 엔젤 슬라임', difficulty: 'chaos', cycle: 'bossWeekly', complete: 'false'},
    {contentName: '검은 마법사', difficulty: 'extreme', cycle: 'bossWeekly', complete: 'false'}
  ]
};
const englishDifficultyResult = json("applyNexonSchedulerState(__englishDifficultyState, 'c1', __englishDifficultyResponse, '2026-09-23T01:01:00.000Z')");
assert.equal(englishDifficultyResult.matched, 5);
assert.equal(englishDifficultyResult.difficultyMismatch.length, 0);
assert.equal(englishDifficultyResult.notConfigured.length, 0);
assert.equal(englishDifficultyResult.localNotFound.length, 0);
assert.equal(context.__englishDifficultyState.characters[0].bosses.some(boss => boss.done), false);

// Multiple API difficulties for one boss only apply the exact local difficulty.
context.__multiDifficultyState = structuredClone(schedulerState);
context.__multiDifficultyState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__multiDifficultyResponse = {...structuredClone(schedulerResponse), bosses: [
  {contentName: '스우', difficulty: 'normal', cycle: 'bossWeekly', complete: 'false'},
  {contentName: '스우', difficulty: ' hard ', cycle: 'bossWeekly', complete: 'true'},
  {contentName: '스우', difficulty: 'extreme', cycle: 'bossWeekly', complete: 'true'}
]};
const multiDifficultyResult = json("applyNexonSchedulerState(__multiDifficultyState, 'c1', __multiDifficultyResponse, '2026-09-23T01:01:30.000Z')");
assert.equal(multiDifficultyResult.matched, 1);
assert.equal(multiDifficultyResult.matchedCompleted, 1);
assert.equal(multiDifficultyResult.difficultyMismatch.length, 2);
assert.deepEqual(multiDifficultyResult.completedItems.map(item => item.result).sort(), ['matched-auto-completed', 'difficulty-mismatch'].sort());
assert.equal(context.__multiDifficultyState.characters[0].bosses[0].done, true);
assert.equal(context.__multiDifficultyState.characters[0].bosses[0].completionSource, 'nexon-api');
assert.equal(context.__multiDifficultyState.characters[0].bosses[0].completedIncome, 24450000);

// Known daily scheduler rows are diagnostic-only and never auto-complete a weekly boss.
context.__dailyCycleState = structuredClone(schedulerState);
context.__dailyCycleState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__dailyCycleResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: 'hard', cycle: 'bossDaily', complete: 'true'}]};
const dailyCycleResult = json("applyNexonSchedulerState(__dailyCycleState, 'c1', __dailyCycleResponse, '2026-09-23T01:01:40.000Z')");
assert.equal(dailyCycleResult.matched, 0);
assert.equal(dailyCycleResult.ignoredCycle.length, 1);
assert.equal(dailyCycleResult.completedItems[0].result, 'ignored-cycle');
assert.equal(context.__dailyCycleState.characters[0].bosses[0].done, false);

// Unknown names remain diagnostic-only even when the API marks them complete.
context.__unknownOnlyState = structuredClone(schedulerState);
const unknownBossesBefore = JSON.stringify(context.__unknownOnlyState.characters[0].bosses);
context.__unknownOnlyResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '시즌 보스 메이린', difficulty: 'hard', cycle: 'bossWeekly', complete: 'true'}]};
const unknownOnlyResult = json("applyNexonSchedulerState(__unknownOnlyState, 'c1', __unknownOnlyResponse, '2026-09-23T01:01:50.000Z')");
assert.equal(unknownOnlyResult.unknown.length, 1);
assert.equal(unknownOnlyResult.matched, 0);
assert.equal(unknownOnlyResult.completedItems[0].result, 'unknown-name');
assert.equal(JSON.stringify(context.__unknownOnlyState.characters[0].bosses), unknownBossesBefore);

// A completed known boss absent from the local character remains diagnostic-only.
context.__notConfiguredState = structuredClone(schedulerState);
context.__notConfiguredState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__notConfiguredResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '루시드', difficulty: 'hard', cycle: 'bossWeekly', complete: 'true'}]};
const notConfiguredResult = json("applyNexonSchedulerState(__notConfiguredState, 'c1', __notConfiguredResponse, '2026-09-23T01:01:55.000Z')");
assert.equal(notConfiguredResult.completedItems[0].result, 'not-configured');

// Missing difficulty is safe only when the local bossId has one candidate.
context.__missingDifficultyState = structuredClone(schedulerState);
context.__missingDifficultyState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__missingDifficultyResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '', cycle: '주간', registered: false, complete: true}]};
const missingDifficulty = json("applyNexonSchedulerState(__missingDifficultyState, 'c1', __missingDifficultyResponse, '2026-09-23T01:02:00.000Z')");
assert.equal(missingDifficulty.matched, 1);
assert.equal(missingDifficulty.autoCompleted, 1);
assert.equal(context.__missingDifficultyState.characters[0].bosses[0].done, true);

// The same bossId with multiple local difficulties is ambiguous when the API omits difficulty.
context.__ambiguousState = structuredClone(schedulerState);
context.__ambiguousState.characters[0].bosses = [
  {...structuredClone(schedulerState.characters[0].bosses[0]), difficulty: '노멀', price: 8350000},
  {...structuredClone(schedulerState.characters[0].bosses[0]), difficulty: '하드', price: 48900000}
];
context.__ambiguousResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '', cycle: '주간', registered: true, complete: true}]};
const ambiguousResult = json("applyNexonSchedulerState(__ambiguousState, 'c1', __ambiguousResponse, '2026-09-23T01:03:00.000Z')");
assert.equal(ambiguousResult.matched, 0);
assert.equal(ambiguousResult.ambiguous.length, 1);
assert.equal(context.__ambiguousState.characters[0].bosses.some(boss => boss.done), false);

// A known name with a different difficulty is diagnosed and never applied to the wrong local row.
context.__difficultyMismatchState = structuredClone(schedulerState);
context.__difficultyMismatchResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '노멀', cycle: '주간', registered: true, complete: true}]};
const difficultyMismatch = json("applyNexonSchedulerState(__difficultyMismatchState, 'c1', __difficultyMismatchResponse, '2026-09-23T01:04:00.000Z')");
assert.equal(difficultyMismatch.matched, 0);
assert.equal(difficultyMismatch.difficultyMismatch.length, 1);
assert.equal(context.__difficultyMismatchState.characters[0].bosses[0].done, false);

// The existing Korean spelling alias matches the app's canonical 노멀 difficulty.
context.__difficultyAliasState = structuredClone(schedulerState);
context.__difficultyAliasState.characters[0].bosses[0].difficulty = '노멀';
context.__difficultyAliasResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '노말', cycle: '주간', registered: true, complete: true}]};
const difficultyAlias = json("applyNexonSchedulerState(__difficultyAliasState, 'c1', __difficultyAliasResponse, '2026-09-23T01:04:30.000Z')");
assert.equal(difficultyAlias.matchedCompleted, 1);
assert.equal(context.__difficultyAliasState.characters[0].bosses[0].done, true);

context.__incompleteState = structuredClone(schedulerState);
context.__incompleteResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '하드', cycle: '주간', registered: true, complete: false}]};
const incompleteResult = json("applyNexonSchedulerState(__incompleteState, 'c1', __incompleteResponse, '2026-09-23T01:04:40.000Z')");
assert.equal(incompleteResult.matched, 1);
assert.equal(incompleteResult.matchedCompleted, 0);
assert.equal(context.__incompleteState.characters[0].bosses[0].done, false);
assert.equal(incompleteResult.localNotFound.some(item => item.bossId === 'damien'), true);

// Live responses always apply to the active week. Their response date is metadata only.
for (const responseDate of ['2026-09-16', '2026-09-16T23:59:59+09:00', 'not-a-date']) {
  context.__liveDateState = structuredClone(schedulerState);
  context.__liveDateResponse = {...structuredClone(schedulerResponse), date: responseDate};
  run("applyNexonSchedulerState(__liveDateState, 'c1', __liveDateResponse, '2026-09-23T01:10:00.000Z')");
  assert.equal(context.__liveDateState.characters[0].bosses[0].done, true);
}

// Only an explicitly requested historical date is validated against the active week.
context.__historicalState = structuredClone(schedulerState);
context.__historicalResponse = {...structuredClone(schedulerResponse), mode: 'historical', requestedDate: '2026-09-20'};
run("applyNexonSchedulerState(__historicalState, 'c1', __historicalResponse, '2026-09-23T01:20:00.000Z')");
assert.equal(context.__historicalState.characters[0].bosses[0].done, true);
context.__historicalIsoState = structuredClone(schedulerState);
context.__historicalIsoResponse = {...structuredClone(schedulerResponse), mode: 'historical', requestedDate: '2026-09-20T12:30:00+09:00'};
run("applyNexonSchedulerState(__historicalIsoState, 'c1', __historicalIsoResponse, '2026-09-23T01:21:00.000Z')");
assert.equal(context.__historicalIsoState.characters[0].bosses[0].done, true);

// Re-reading the same result does not rewrite boss state.
const bossesBeforeRepeat = JSON.stringify(context.__schedulerState.characters[0].bosses);
const repeatedScheduler = json("applyNexonSchedulerState(__schedulerState, 'c1', __schedulerResponse, '2026-09-23T01:05:00.000Z')");
assert.equal(repeatedScheduler.bossesChanged, false);
assert.equal(repeatedScheduler.autoCompleted, 0);
assert.equal(repeatedScheduler.completedItems.find(item => item.contentName === '스우').result, 'matched-already-done');
assert.equal(JSON.stringify(context.__schedulerState.characters[0].bosses), bossesBeforeRepeat);

// Manual incomplete override wins over an API completion until weekly reset.
context.__manualState = structuredClone(schedulerState);
context.__manualState.characters[0].bosses[0].manualOverride = false;
context.__manualState.characters[0].bosses[0].completionSource = 'manual';
context.__manualResponse = {date: '2026-09-23', character: schedulerResponse.character, bosses: [{contentName: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: 'true'}]};
const manualResult = json("applyNexonSchedulerState(__manualState, 'c1', __manualResponse, '2026-09-23T02:00:00.000Z')");
assert.equal(context.__manualState.characters[0].bosses[0].apiCompleted, true);
assert.equal(context.__manualState.characters[0].bosses[0].done, false);
assert.equal(manualResult.matchedCompleted, 1);
assert.equal(manualResult.autoCompleted, 0);
assert.equal(manualResult.blockedByManualOverride.length, 1);
assert.equal(manualResult.blockedByManualOverride[0].character, '본캐');
assert.equal(manualResult.completedItems[0].result, 'blocked-manual-override');
context.__manualDiagnostics = manualResult;
assert.match(run('nexonDiagnosticMessage(__manualDiagnostics)'), /수동 해제 보호로 자동 완료 차단 1개/);

// A completed local boss is reported separately from a newly auto-completed boss.
context.__alreadyDoneState = structuredClone(schedulerState);
context.__alreadyDoneResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '데미안', difficulty: 'hard', cycle: 'bossWeekly', complete: 'true'}]};
const alreadyDoneResult = json("applyNexonSchedulerState(__alreadyDoneState, 'c1', __alreadyDoneResponse, '2026-09-23T02:01:00.000Z')");
assert.equal(alreadyDoneResult.completedItems[0].result, 'matched-already-done');
assert.equal(alreadyDoneResult.autoCompleted, 0);
assert.equal(context.__alreadyDoneState.characters[0].bosses[1].done, true);

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
context.__wrongWeekResponse = {...structuredClone(schedulerResponse), mode: 'historical', requestedDate: '2026-09-16'};
assert.throws(() => run("applyNexonSchedulerState(__invalidState, 'c1', __wrongWeekResponse)"), /주차/);
assert.equal(JSON.stringify(context.__invalidState), invalidBefore);
context.__badHistoricalResponse = {...structuredClone(schedulerResponse), mode: 'historical', requestedDate: 'invalid-date'};
assert.throws(() => run("applyNexonSchedulerState(__invalidState, 'c1', __badHistoricalResponse)"), /날짜/);
assert.equal(JSON.stringify(context.__invalidState), invalidBefore);

context.__v1 = {characters:[{name:'구버전',bosses:{세렌:{difficulty:'하드',price:302000000,done:false},칼로스:{difficulty:'카오스',price:1230000000,done:false}}}],incomes:[],weeklyHistory:{},presets:{},settings:{}};
const migratedV1 = json("migrateState(__v1, new Date('2026-09-20T12:00:00'))");
assert.equal(migratedV1.characters[0].bosses.filter(b => b.bossId === 'seren').length, 1);
assert.equal(migratedV1.characters[0].bosses.find(b => b.bossId === 'seren').price, 302000000);
assert.equal(migratedV1.characters[0].bosses.find(b => b.bossId === 'kalos').price, 1230000000);

context.__backup = JSON.stringify(legacy);
assert.equal(run("prepareImportedState(__backup, new Date('2026-09-20T12:00:00')).version"), 7);
assert.equal(run("prepareImportedState(__backup, new Date('2026-09-20T12:00:00')).settings.defaultSaleFeeRate"), 0.05);
assert.throws(() => run("prepareImportedState('{broken')"), /JSON/);
assert.throws(() => run("prepareImportedState('{}')"), /저장 데이터 형식/);

context.__feeBackup = JSON.stringify({...legacy, version: 7, incomes: [{
  id: 'sale-fee', item: '조각', category: 'hunt', recordType: 'sold', saleState: 'sold', type: 'sale',
  qty: 1, quantity: 1, salePrice: 7000000, price: 7000000, unitPrice: 7000000,
  feeRate: 0.03, grossSale: 7000000, feeAmount: 210000, netSale: 6790000,
  grossIncome: 7000000, netIncome: 6790000
}], settings: {itemPrices: {}, defaultSaleFeeRate: 0.03}});
const restoredFeeSale = json("prepareImportedState(__feeBackup, new Date('2026-09-20T12:00:00'))");
assert.equal(restoredFeeSale.settings.defaultSaleFeeRate, 0.03);
assert.deepEqual(restoredFeeSale.incomes[0], JSON.parse(context.__feeBackup).incomes[0]);

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
context.__postRolloverResponse = {...structuredClone(schedulerResponse), date: '2026-09-23', mode: 'live', requestedDate: null};
run("applyNexonSchedulerState(__nexonRoll, 'c1', __postRolloverResponse, '2026-09-24T00:01:00.000Z')");
assert.equal(context.__nexonRoll.characters[0].bosses[0].done, true);
assert.equal(context.__nexonRoll.characters[0].bosses[0].apiCheckedWeek, '2026-09-24~2026-09-30');

context.__activityRoll = structuredClone(context.__activityState);
run("rollover(__activityRoll, new Date('2026-09-24T00:00:00'))");
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].characters[0].weeklyActivities[0].done, true);
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].characters[0].weeklyActivities[0].completionSource, 'nexon-api');
assert.equal(context.__activityRoll.characters[0].weeklyActivities[0].done, false);
assert.equal('apiCompleted' in context.__activityRoll.characters[0].weeklyActivities[0], false);

context.__activityReset = structuredClone(context.__activityState);
run('resetCurrentWeek(__activityReset)');
assert.equal(context.__activityReset.characters[0].weeklyActivities.every(activity => !activity.done), true);
assert.equal(context.__activityReset.characters[0].weeklyActivities.every(activity => !('manualOverride' in activity)), true);

assert.equal(run('incomeValue({item:"메소",category:"hunt",amount:82000000})'), 82000000);
assert.deepEqual(json('saleAmounts(1, 7000000, 0.05)'), {feeRate: 0.05, grossSale: 7000000, feeAmount: 350000, netSale: 6650000});
assert.deepEqual(json('saleAmounts(1, 7000000, 0.03)'), {feeRate: 0.03, grossSale: 7000000, feeAmount: 210000, netSale: 6790000});
assert.deepEqual(json('saleAmounts(2, 7000000, 0.03)'), {feeRate: 0.03, grossSale: 14000000, feeAmount: 420000, netSale: 13580000});
assert.deepEqual(json('saleAmounts(17, 123456789, 0.05)'), {feeRate: 0.05, grossSale: 2098765413, feeAmount: 104938270, netSale: 1993827143});
assert.deepEqual(json('saleAmounts(1, 101, 0.03)'), {feeRate: 0.03, grossSale: 101, feeAmount: 3, netSale: 98});
assert.equal(run('saleAmounts(2, Number.MAX_SAFE_INTEGER, 0.05)'), null);
assert.equal(run('saleFeePercent(0.05)'), 5);
assert.equal(run('saleFeePercent(0.03)'), 3);
assert.equal(run('incomeValue({item:"메소",category:"hunt",amount:82000000,feeRate:0.05,netSale:1})'), 82000000);
assert.equal(run('incomeValue({item:"조각",category:"hunt",recordType:"acquired",qty:30,feeRate:0.05,netSale:999})'), 0);
assert.equal(run('incomeValue({item:"조각",category:"hunt",recordType:"sold",qty:1,salePrice:7000000,feeRate:0.03,grossSale:7000000,feeAmount:210000,netSale:6790000})'), 6790000);
// Legacy sales keep their stored value and never receive a retroactive fee.
assert.equal(run('incomeValue({item:"조각",category:"hunt",recordType:"sold",qty:30,price:6500000,materialCost:5000000,netIncome:190000000})'), 190000000);
assert.equal(run('incomeValue({item:"조각",category:"hunt",recordType:"sold",qty:30,price:6500000,materialCost:5000000})'), 190000000);
context.__feeTotals = {characters: [], incomes: [
  {id:'fee-sale',item:'조각',category:'hunt',recordType:'sold',netSale:6790000,grossSale:7000000,feeAmount:210000,feeRate:0.03},
  {id:'meso',item:'메소',category:'hunt',amount:82000000}
]};
assert.equal(run('totalsFor(__feeTotals).hunt'), 88790000);
assert.equal(run('totalsFor(__feeTotals).total'), 88790000);
context.__feeRoll = {
  version: 7, currentWeek: '2026-09-17~2026-09-23', characters: [], presets: [], settings: {defaultSaleFeeRate: 0.05}, weeklyHistory: {},
  incomes: [{id:'fee-roll',item:'조각',category:'hunt',recordType:'sold',saleState:'sold',qty:1,salePrice:7000000,feeRate:0.03,grossSale:7000000,feeAmount:210000,netSale:6790000,weekId:'2026-09-17~2026-09-23'}]
};
run("rollover(__feeRoll, new Date('2026-09-24T00:00:00'))");
assert.equal(context.__feeRoll.weeklyHistory['2026-09-17~2026-09-23'].totals.hunt, 6790000);
assert.equal(context.__feeRoll.weeklyHistory['2026-09-17~2026-09-23'].totals.total, 6790000);
assert.equal(run("historyFilter='unsold'; historyMatches({item:'조각',category:'hunt',recordType:'acquired'})"), true);
assert.equal(run("historyMatches({item:'조각',category:'hunt',recordType:'sold'})"), false);
assert.equal(run("historyFilter='gather'; historyMatches({item:'씨앗',category:'gather',recordType:'acquired'})"), true);
assert.equal(cloudSyncInternals.meaningfulLocalData({characters: [{name: '본캐', bosses: []}], incomes: [], weeklyHistory: {}, presets: [], settings: {}}), false);
assert.equal(cloudSyncInternals.meaningfulLocalData({version: 7, migrationNote: 'schema', characters: [{name: '본캐', bosses: []}], incomes: [], weeklyHistory: {}, presets: [], settings: {defaultSaleFeeRate: 0.05}}), false);
assert.equal(cloudSyncInternals.meaningfulLocalData({characters: [{name: '본캐', bosses: []}], incomes: [{id: 'i1'}], weeklyHistory: {}, presets: [], settings: {}}), true);
assert.equal(run("stateHasMeaningfulUserData(emptyState(new Date('2026-09-24T12:00:00')))"), false);
assert.equal(run("stateHasMeaningfulUserData({...emptyState(new Date('2026-09-24T12:00:00')),settings:{defaultSaleFeeRate:0.03}})"), true);
assert.equal(run("stateHasMeaningfulUserData({...emptyState(new Date('2026-09-24T12:00:00')),incomes:[{id:'user-income'}]})"), true);
assert.equal(await cloudSyncInternals.contentHash({version: 5, value: 1}), await cloudSyncInternals.contentHash({version: 5, value: 1}));
assert.notEqual(await cloudSyncInternals.contentHash({version: 5, value: 1}), await cloudSyncInternals.contentHash({version: 5, value: 2}));
assert.ok(cloudSyncInternals.timestamp('2026-09-23T00:00:00.000Z') > cloudSyncInternals.timestamp('2026-09-22T00:00:00.000Z'));
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: false}), 'create');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: true}), 'noop');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: false, hasLocalData: false, hasRemoteData: true}), 'download');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: false, hasLocalData: true, hasRemoteData: false}), 'upload');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: false, hasLocalData: true, hasRemoteData: true}), 'choose');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true, hasLocalData: true, hasRemoteData: true}), 'merge');
assert.equal(cloudSyncInternals.chooseSyncAction({remoteExists: true, sameContent: false, knownDevice: true, hasLocalData: false, hasRemoteData: true}), 'merge');
assert.deepEqual(cloudSyncInternals.normalizeMeta(null), {});
assert.deepEqual(cloudSyncInternals.normalizeMeta('{broken'), {});
assert.equal(cloudSyncInternals.authErrorMessage({message: 'Email not confirmed'}, '로그인'), '이메일 인증이 아직 완료되지 않았습니다. 인증 메일을 확인해주세요.');
assert.equal(cloudSyncInternals.authErrorMessage({message: 'User already registered'}, '회원가입'), '이미 가입된 이메일입니다. 로그인하거나 인증 메일을 다시 보내주세요.');
assert.match(cloudSyncInternals.authErrorMessage({message: 'Too many requests'}, '회원가입'), /요청이 너무 잦습니다/);
assert.match(cloudSyncInternals.authErrorMessage({message: 'Failed to fetch'}, '회원가입'), /네트워크 연결/);
assert.equal(cloudSyncInternals.signupResult({user: {identities: []}}).kind, 'existing');
assert.equal(cloudSyncInternals.signupResult({user: {identities: [{}]}}).kind, 'confirmation');
assert.equal(cloudSyncInternals.signupResult({user: {identities: [{}]}, session: {access_token: 'hidden'}}).kind, 'session');
assert.match(cloudSyncInternals.signupResult({user: {identities: [{}]}}).message, /이메일 인증을 완료한 뒤 로그인/);
assert.match(cloudSyncInternals.signupResult({user: {identities: [{}]}, session: {}}).message, /클라우드 저장을 준비/);
assert.match(cloudSyncInternals.syncErrorMessage(cloudSyncInternals.syncError('initial-insert', {code: '42501', message: 'row-level security policy'})), /RLS/);
assert.match(cloudSyncInternals.syncErrorMessage(cloudSyncInternals.syncError('initial-insert', {message: 'insert failed'})), /최초 클라우드 저장 공간/);
assert.match(cloudSyncInternals.syncErrorMessage(cloudSyncInternals.syncError('remote-read', {message: 'read failed'})), /불러오지 못했습니다/);
assert.match(cloudSyncInternals.syncErrorMessage(cloudSyncInternals.syncError('remote-update', {message: 'update failed'})), /저장하지 못했습니다/);
assert.match(cloudSyncInternals.syncErrorMessage(cloudSyncInternals.syncError('session-recovery', {message: 'session failed'})), /세션을 복구하지 못했습니다/);

const cloudSelectionState = {
  characters: [
    {id: 'char-a', name: 'A', bosses: [{bossId: 'lotus', difficulty: '하드', done: false}]},
    {id: 'char-b', name: 'B', bosses: [{bossId: 'vellum', difficulty: '카오스', done: false}]}
  ],
  weeklyHistory: {'2026-09-10~2026-09-16': {weekId: '2026-09-10~2026-09-16', characters: []}}
};
for (const mutate of [
  state => state,
  state => { state.characters[1].bosses[0].done = true; return state; },
  state => { state.characters[1].bosses[0].difficulty = '하드'; return state; },
  state => { Object.assign(state.characters[1].bosses[0], {done: true, apiCompleted: true, completionSource: 'nexon-api'}); return state; }
]) {
  context.__cloudSelectionState = mutate(structuredClone(cloudSelectionState));
  assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionState)"), {bossCharacterId: 'char-b', week: ''});
}
context.__cloudSelectionDeleted = {...structuredClone(cloudSelectionState), characters: [structuredClone(cloudSelectionState.characters[0])]};
assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionDeleted)"), {bossCharacterId: 'char-a', week: ''});
context.__cloudSelectionEmpty = {...structuredClone(cloudSelectionState), characters: []};
assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionEmpty)"), {bossCharacterId: '', week: ''});
context.__cloudSelectionState = structuredClone(cloudSelectionState);
assert.deepEqual(json("reconcileCloudSelection('char-b', '2026-09-10~2026-09-16', __cloudSelectionState)"), {bossCharacterId: 'char-b', week: '2026-09-10~2026-09-16'});
assert.deepEqual(json("reconcileCloudSelection('char-b', '2026-09-03~2026-09-09', __cloudSelectionState)"), {bossCharacterId: 'char-b', week: ''});
assert.match(source, /const selection = reconcileCloudSelection\(previousBossCharacterId, previousWeek, state\)/);

const syncBase = {
  version: 5, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z',
  settings: {theme: 'dark'},
  incomes: [{id: 'income-base', category: 'hunt', item: '메소', amount: 100, createdAt: 1}],
  characters: [{id: 'char-a', name: '본캐', bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1, done: false}], weeklyActivities: [
    {id: 'epic-dungeon:aurum-regis', type: 'epic-dungeon', name: '아우룸 레기스', done: false},
    {id: 'mu-lung-dojo', type: 'mu-lung-dojo', name: '무릉도장', done: false}
  ]}],
  presets: [{id: 'preset-a', name: '기본', bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1}]}],
  weeklyHistory: {'week-old': {weekId: 'week-old', incomes: [], characters: []}}
};
const clone = value => structuredClone(value);

// A schema upgrade must not look like user deletion to the cloud merge.
const migrationRaw = {
  version: 6, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z', settings: {},
  incomes: Array.from({length: 50}, (_, index) => ({id: `migration-income-${index}`, category: 'hunt', item: '메소', amount: index + 1, createdAt: index + 1})),
  characters: Array.from({length: 10}, (_, index) => ({
    id: `migration-character-${index}`, name: `캐릭터 ${index + 1}`,
    bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1, done: false}],
    weeklyActivities: [{id: 'mu-lung-dojo', type: 'mu-lung-dojo', name: '무릉도장', done: false}]
  })),
  presets: Array.from({length: 3}, (_, index) => ({id: `migration-preset-${index}`, name: `프리셋 ${index + 1}`, bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1}]})),
  weeklyHistory: Object.fromEntries(['2026-08-20~2026-08-26', '2026-08-27~2026-09-02', '2026-09-03~2026-09-09', '2026-09-10~2026-09-16']
    .map(weekId => [weekId, {weekId, characters: [], incomes: []}]))
};
context.__migrationRaw = migrationRaw;
const migrationLocal = json("migrateState(__migrationRaw, new Date('2026-09-23T12:00:00.000Z'))");
const migrationGuard = json("createMigrationSyncInfo(6, migrateState(__migrationRaw, new Date('2026-09-23T12:00:00.000Z')), new Date('2026-09-23T12:00:00.000Z'))");
assert.equal(migrationLocal.updatedAt, migrationRaw.updatedAt);
assert.equal(migrationGuard.fromVersion, 6);
assert.equal(migrationGuard.toVersion, 7);
assert.equal(migrationGuard.baseline.characters.length, 10);
assert.equal(migrationGuard.baseline.incomes.length, 50);
const migrationBase = clone(migrationLocal);
const migrationRemote = clone(migrationLocal);
const migrationSafe = cloudSyncInternals.mergeStates(
  migrationBase, migrationLocal, migrationRemote, '2026-09-23T13:00:00.000Z', {localMigrationGuard: migrationGuard.baseline}
).state;
assert.equal(migrationSafe.characters.length, 10);
assert.equal(migrationSafe.incomes.length, 50);
assert.equal(migrationSafe.presets.length, 3);
assert.equal(Object.keys(migrationSafe.weeklyHistory).length, 4);
for (const tombstones of Object.values(migrationSafe.sync.tombstones)) assert.equal(Object.keys(tombstones).length, 0);
assert.equal(migrationSafe.settings.defaultSaleFeeRate, 0.05);
assert.equal(migrationSafe.updatedAt >= migrationLocal.updatedAt, true);

// A remote item absent from the migrated local snapshot is preserved, not converted to a tombstone.
const migrationRemoteBase = clone(migrationBase);
migrationRemoteBase.incomes.push({id: 'remote-preserved-income', category: 'drop', item: '원격 기록', qty: 1, createdAt: 100});
migrationRemoteBase.characters.push({
  id: 'remote-preserved-character', name: '원격 캐릭터',
  bosses: [{bossId: 'damien', difficulty: '하드', partySize: 1, done: false}],
  weeklyActivities: [{id: 'epic-dungeon:aurum-regis', type: 'epic-dungeon', name: '아우룸 레기스', done: false}]
});
migrationRemoteBase.presets.push({id: 'remote-preserved-preset', name: '원격 프리셋', bosses: []});
migrationRemoteBase.weeklyHistory['2026-08-13~2026-08-19'] = {weekId: '2026-08-13~2026-08-19', characters: [], incomes: []};
const migrationRemoteLatest = clone(migrationRemoteBase);
migrationRemoteLatest.updatedAt = '2026-09-23T14:00:00.000Z';
const preservedAfterMigration = cloudSyncInternals.mergeStates(
  migrationRemoteBase, migrationLocal, migrationRemoteLatest, '2026-09-23T15:00:00.000Z', {localMigrationGuard: migrationGuard.baseline}
).state;
assert.ok(preservedAfterMigration.incomes.some(item => item.id === 'remote-preserved-income'));
assert.ok(preservedAfterMigration.characters.some(character => character.id === 'remote-preserved-character'));
assert.ok(preservedAfterMigration.presets.some(preset => preset.id === 'remote-preserved-preset'));
assert.ok(preservedAfterMigration.weeklyHistory['2026-08-13~2026-08-19']);
assert.equal(preservedAfterMigration.sync.tombstones.incomes['remote-preserved-income'], undefined);
assert.equal(preservedAfterMigration.sync.tombstones.characters['remote-preserved-character'], undefined);
assert.equal(preservedAfterMigration.sync.tombstones.bosses['remote-preserved-character::damien'], undefined);
assert.equal(preservedAfterMigration.sync.tombstones.activities['remote-preserved-character::epic-dungeon:aurum-regis'], undefined);

// An item present at migration time but deleted afterwards is still a real user deletion.
const postMigrationDelete = clone(migrationLocal);
postMigrationDelete.updatedAt = '2026-09-23T16:00:00.000Z';
postMigrationDelete.incomes = postMigrationDelete.incomes.filter(item => item.id !== 'migration-income-0');
const postMigrationDeleted = cloudSyncInternals.mergeStates(
  migrationBase, postMigrationDelete, migrationRemote, '2026-09-23T17:00:00.000Z', {localMigrationGuard: migrationGuard.baseline}
).state;
assert.equal(postMigrationDeleted.incomes.some(item => item.id === 'migration-income-0'), false);
assert.ok(postMigrationDeleted.sync.tombstones.incomes['migration-income-0']);

// Version and migration-note-only differences do not touch collection revisions.
const schemaOnlyLocal = clone(migrationLocal);
schemaOnlyLocal.version = 7;
schemaOnlyLocal.migrationNote = 'schema-only';
const schemaOnlyBase = clone(migrationLocal);
delete schemaOnlyBase.migrationNote;
schemaOnlyBase.version = 6;
const schemaOnlyPrepared = cloudSyncInternals.prepareStateForMerge(schemaOnlyLocal, schemaOnlyBase, '2026-09-23T18:00:00.000Z', {migrationGuard: migrationGuard.baseline});
assert.equal(schemaOnlyPrepared.sync.revisions.root, '');
for (const group of ['incomes', 'characters', 'bosses', 'activities', 'presets', 'weeklyHistory']) {
  assert.equal(Object.keys(schemaOnlyPrepared.sync.revisions[group]).length, 0);
  assert.equal(Object.keys(schemaOnlyPrepared.sync.tombstones[group]).length, 0);
}
assert.match(cloudSource, /const base = normalizePayload\(loadBase\(\)\)/);
assert.match(cloudSource, /normalizedRemote \|\| latest\.payload/);
assert.match(source, /persist\(next, \{touch: rolled \|\| !parsed, notify: false\}\)/);

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

// Fee fields are ordinary income fields and survive PC/mobile cloud synchronization.
const feeCloudLocal = clone(syncBase);
feeCloudLocal.updatedAt = '2026-09-23T02:30:00.000Z';
feeCloudLocal.incomes.push({
  id: 'income-fee', category: 'hunt', item: '조각', recordType: 'sold', saleState: 'sold', type: 'sale',
  qty: 1, quantity: 1, salePrice: 7000000, price: 7000000, unitPrice: 7000000,
  feeRate: 0.03, grossSale: 7000000, feeAmount: 210000, netSale: 6790000,
  grossIncome: 7000000, netIncome: 6790000, createdAt: 6
});
const feeCloudRemote = clone(syncBase);
feeCloudRemote.updatedAt = '2026-09-23T03:00:00.000Z';
feeCloudRemote.settings.defaultSaleFeeRate = 0.03;
const feeCloudMerged = cloudSyncInternals.mergeStates(syncBase, feeCloudLocal, feeCloudRemote, '2026-09-23T04:00:00.000Z').state;
assert.deepEqual(feeCloudMerged.incomes.find(item => item.id === 'income-fee'), feeCloudLocal.incomes.find(item => item.id === 'income-fee'));
assert.equal(feeCloudMerged.settings.defaultSaleFeeRate, 0.03);

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

// Weekly activities merge independently by activity id across devices.
const activityLocal = clone(syncBase);
activityLocal.updatedAt = '2026-09-23T01:00:00.000Z';
Object.assign(activityLocal.characters[0].weeklyActivities[0], {done: true, completionSource: 'nexon-api', apiCompleted: true});
const activityRemote = clone(syncBase);
activityRemote.updatedAt = '2026-09-23T02:00:00.000Z';
Object.assign(activityRemote.characters[0].weeklyActivities[1], {done: true, manualOverride: true, completionSource: 'manual'});
const activitiesMerged = cloudSyncInternals.mergeStates(syncBase, activityLocal, activityRemote, '2026-09-23T03:00:00.000Z').state.characters[0].weeklyActivities;
assert.equal(activitiesMerged.find(activity => activity.id === 'epic-dungeon:aurum-regis').done, true);
assert.equal(activitiesMerged.find(activity => activity.id === 'mu-lung-dojo').done, true);
assert.ok(cloudSyncInternals.prepareStateForMerge(activityLocal, syncBase).sync.revisions.activities['char-a::epic-dungeon:aurum-regis']);

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

// A profile refresh is a character-body change, while boss state keeps its own revision.
const profileMergeBase = clone(syncBase);
profileMergeBase.characters[0].nexonCharacter = {ocid: schedulerResponse.character.ocid, characterName: '넥슨본캐', level: 284};
const profileMergeBossDevice = clone(profileMergeBase);
profileMergeBossDevice.updatedAt = '2026-09-23T04:00:00.000Z';
Object.assign(profileMergeBossDevice.characters[0].bosses[0], {done: true, completionSource: 'manual', manualOverride: true});
const profileMergeProfileDevice = clone(profileMergeBase);
profileMergeProfileDevice.updatedAt = '2026-09-23T05:00:00.000Z';
Object.assign(profileMergeProfileDevice.characters[0].nexonCharacter, {level: 285, className: '나이트로드', image: 'https://example.com/profile.png', profileCheckedAt: '2026-09-23T05:00:00.000Z'});
const profileAndBossMerged = cloudSyncInternals.mergeStates(profileMergeBase, profileMergeBossDevice, profileMergeProfileDevice, '2026-09-23T06:00:00.000Z').state.characters[0];
assert.equal(profileAndBossMerged.bosses[0].done, true);
assert.equal(profileAndBossMerged.nexonCharacter.level, 285);
assert.equal(profileAndBossMerged.nexonCharacter.className, '나이트로드');

// NEXON metadata is merged by nested field, so profile and stat refreshes from two devices both survive.
const nexonFieldMergeBase = clone(syncBase);
nexonFieldMergeBase.characters[0].nexonCharacter = {
  ocid: schedulerResponse.character.ocid, characterName: '넥슨본캐', level: 284,
  combatPower: 280000000, stats: {...emptyDetailStats, bossDamage: 300}, unionLevel: 9400,
  profileCheckedAt: '2026-09-23T01:00:00.000Z', statsCheckedAt: '2026-09-23T01:00:00.000Z'
};
const nexonProfileDevice = clone(nexonFieldMergeBase);
nexonProfileDevice.updatedAt = '2026-09-23T07:00:00.000Z';
Object.assign(nexonProfileDevice.characters[0].nexonCharacter, {level: 285, className: '나이트로드', profileCheckedAt: '2026-09-23T04:00:00.000Z'});
const nexonStatsDevice = clone(nexonFieldMergeBase);
nexonStatsDevice.updatedAt = '2026-09-23T05:00:00.000Z';
Object.assign(nexonStatsDevice.characters[0].nexonCharacter, {combatPower: 300000000, stats: {...detailStatsFixture, bossDamage: 412}, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온', statsCheckedAt: '2026-09-23T06:00:00.000Z'});
const nexonFieldMerged = cloudSyncInternals.mergeStates(nexonFieldMergeBase, nexonProfileDevice, nexonStatsDevice, '2026-09-23T08:00:00.000Z').state.characters[0].nexonCharacter;
assert.equal(nexonFieldMerged.level, 285);
assert.equal(nexonFieldMerged.className, '나이트로드');
assert.equal(nexonFieldMerged.combatPower, 300000000);
assert.equal(nexonFieldMerged.stats.bossDamage, 412);
assert.equal(nexonFieldMerged.stats.ignoreDefense, 96.42);
assert.equal(nexonFieldMerged.statsCheckedAt, '2026-09-23T06:00:00.000Z');
assert.equal(nexonFieldMerged.unionLevel, 9450);
assert.equal(nexonFieldMerged.unionGrade, '그랜드 마스터 유니온');

const sanitizedScheduler = nexonProxyInternals.sanitizeScheduler({
  date: '2026-09-23', character_name: '넥슨본캐', world_name: '루나',
  boss_contents: [{content_name: '스우', difficulty: '하드', cycle: '주간', registration_flag: 'N', complete_flag: 'Y'}],
  weekly_contents: [
    {content_name: '아우룸 레기스', type: 'quest', registration_flag: 'true', now_count: 0, max_count: 1, quest_state: '2'},
    {content_name: '무릉도장', type: 'contents', registration_flag: 'true', now_count: 50, max_count: 100, quest_state: '0'},
    {content_name: '지하 수로', type: 'contents', registration_flag: 'false', now_count: 0, max_count: 1, quest_state: '0'}
  ]
}, schedulerResponse.character.ocid);
assert.deepEqual(sanitizedScheduler.bosses[0], {contentName: '스우', difficulty: '하드', cycle: '주간', registered: false, complete: false});
assert.deepEqual(sanitizedScheduler.activities, [
  {contentName: '아우룸 레기스', type: 'quest', cycle: 'weekly', registered: true, nowCount: 0, maxCount: 1, questState: '2', complete: true},
  {contentName: '무릉도장', type: 'contents', cycle: 'weekly', registered: true, nowCount: 50, maxCount: 100, questState: '0', complete: true},
  {contentName: '지하 수로', type: 'contents', cycle: 'weekly', registered: false, nowCount: 0, maxCount: 1, questState: '0', complete: false}
]);
assert.equal(sanitizedScheduler.diagnostics.activitySamples.length, 3);
assert.deepEqual(sanitizedScheduler.diagnostics.samples[0], {
  contentName: '스우', difficulty: '하드', cycle: '주간', registered: false, complete: false,
  rawCompleteType: 'string', rawCompleteValue: 'Y', rawRegistrationType: 'string', rawRegistrationValue: 'N'
});
assert.equal(JSON.stringify(sanitizedScheduler.diagnostics).includes(schedulerResponse.character.ocid), false);
const diagnosticLimit = nexonProxyInternals.sanitizeScheduler({boss_contents: Array.from({length: 25}, (_, index) => ({content_name: `보스 ${index}`, complete_flag: index, registration_flag: null}))}, 'ocid');
assert.equal(diagnosticLimit.diagnostics.samples.length, 20);
assert.deepEqual(diagnosticLimit.diagnostics.samples[1], {
  contentName: '보스 1', difficulty: '', cycle: '', registered: false, complete: false,
  rawCompleteType: 'number', rawCompleteValue: 1, rawRegistrationType: 'null', rawRegistrationValue: null
});
assert.deepEqual(nexonProxyInternals.diagnosticRaw({secret: true}), {type: 'object', value: '[unsupported]'});
const prioritizedDiagnostics = nexonProxyInternals.sanitizeScheduler({boss_contents: [
  {content_name: '미완료', complete_flag: 'false'},
  {content_name: '완료', difficulty: 'hard', cycle: 'bossWeekly', complete_flag: 'true'}
]}, 'ocid');
assert.equal(prioritizedDiagnostics.diagnostics.samples[0].contentName, '완료');
assert.equal(prioritizedDiagnostics.diagnostics.samples[0].complete, true);
assert.equal(nexonProxyInternals.parseFlag(' true '), true);
assert.equal(nexonProxyInternals.parseFlag('false'), false);
assert.equal(sanitizedScheduler.mode, 'live');
assert.equal(sanitizedScheduler.requestedDate, null);
const historicalScheduler = nexonProxyInternals.sanitizeScheduler({date: '2026-09-20', boss_contents: []}, schedulerResponse.character.ocid, '2026-09-20');
assert.equal(historicalScheduler.mode, 'historical');
assert.equal(historicalScheduler.requestedDate, '2026-09-20');
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
const sanitizedProfile = nexonCharacterInternals.sanitizeProfile({
  date: '2026-09-23T00:00+09:00', character_name: '넥슨본캐', world_name: '루나',
  character_class: '나이트로드', character_level: 285, character_image: 'https://example.com/character.png'
});
assert.deepEqual(sanitizedProfile.character, {name: '넥슨본캐', world: '루나', className: '나이트로드', level: 285, image: 'https://example.com/character.png'});
assert.equal(nexonCharacterInternals.sanitizeProfile({character_name: '이미지없음'}).character.image, '');
assert.equal(nexonCharacterInternals.sanitizeProfile({character_image: 'javascript:alert(1)'}).character.image, '');
assert.equal(nexonCharacterInternals.safeImageUrl('http://example.com/character.png'), 'http://example.com/character.png');
assert.equal(nexonCharacterInternals.PROFILE_CACHE_TTL_MS, 30 * 60_000);
assert.equal(nexonCharacterInternals.STAT_CACHE_TTL_MS, 15 * 60_000);
assert.equal(nexonCharacterInternals.UNION_CACHE_TTL_MS, 60 * 60_000);
assert.deepEqual(Object.values(nexonCharacterInternals.statDefinitions).map(item => item.name), [
  '보스 몬스터 데미지', '방어율 무시', '크리티컬 확률', '크리티컬 데미지', '데미지', '최종 데미지',
  'STR', 'DEX', 'INT', 'LUK', 'HP', '공격력', '마력', '스타포스', '아케인포스', '어센틱포스', '아이템 드롭률', '메소 획득량'
]);
assert.deepEqual(nexonCharacterInternals.sanitizeStat({final_stat: [{stat_name: '전투력', stat_value: '284300000'}]}), {combatPower: 284300000, stats: emptyDetailStats});
assert.deepEqual(nexonCharacterInternals.sanitizeStat({final_stat: [{stat_name: '보스 몬스터 데미지', stat_value: '300'}]}), {combatPower: null, stats: {...emptyDetailStats, bossDamage: 300}});
assert.deepEqual(nexonCharacterInternals.sanitizeStat({final_stat: [{stat_name: '전투력', stat_value: 'invalid'}]}), {combatPower: null, stats: emptyDetailStats});
const fullSanitizedStats = nexonCharacterInternals.sanitizeStat({final_stat: [
  {stat_name: '전투력', stat_value: '284300000'}, {stat_name: '보스 몬스터 데미지', stat_value: '412'},
  {stat_name: '방어율 무시', stat_value: '96.42'}, {stat_name: '크리티컬 확률', stat_value: '100'},
  {stat_name: '크리티컬 데미지', stat_value: '92.5'}, {stat_name: '데미지', stat_value: '85'},
  {stat_name: '최종 데미지', stat_value: '74.3'}, {stat_name: 'STR', stat_value: '62340'},
  {stat_name: 'DEX', stat_value: '8210'}, {stat_name: 'INT', stat_value: '5140'}, {stat_name: 'LUK', stat_value: '4980'},
  {stat_name: 'HP', stat_value: '125430'}, {stat_name: '공격력', stat_value: '4820'}, {stat_name: '마력', stat_value: '1250'},
  {stat_name: '스타포스', stat_value: '420'}, {stat_name: '아케인포스', stat_value: '1320'}, {stat_name: '어센틱포스', stat_value: '660'},
  {stat_name: '아이템 드롭률', stat_value: '217'}, {stat_name: '메소 획득량', stat_value: '100'}
]});
assert.deepEqual(fullSanitizedStats, {combatPower: 284300000, stats: detailStatsFixture});
const malformedSanitizedStats = nexonCharacterInternals.sanitizeStat({final_stat: [
  {stat_name: '방어율 무시', stat_value: 'not-a-number'}, {stat_name: 'STR', stat_value: '62.5'},
  {stat_name: 'DEX', stat_value: true}, {stat_value: '999'}, {stat_name: '알 수 없는 스탯', stat_value: '999'}
]});
assert.equal(malformedSanitizedStats.stats.ignoreDefense, null);
assert.equal(malformedSanitizedStats.stats.str, null);
assert.equal(Object.values(malformedSanitizedStats.stats).every(value => value === null), true);
assert.deepEqual(nexonCharacterInternals.sanitizeStat({final_stat: []}), {combatPower: null, stats: emptyDetailStats});
assert.deepEqual(nexonCharacterInternals.sanitizeUnion({union_level: 9450, union_grade: '그랜드 마스터 유니온'}), {unionLevel: 9450, unionGrade: '그랜드 마스터 유니온'});
assert.deepEqual(nexonCharacterInternals.sanitizeUnion({union_level: null}), {unionLevel: null, unionGrade: ''});
assert.deepEqual(nexonCharacterInternals.sanitizeUnion({union_level: 'invalid'}), {unionLevel: null, unionGrade: ''});
for (const sample of ['abcdefghijklmnop', 'ABCDEF0123456789_-']) assert.equal(nexonCharacterInternals.validOcid(sample), nexonProxyInternals.validOcid(sample));
for (const sample of ['', 'short', 'invalid ocid', '한글식별자abcdefghijklmnop']) assert.equal(nexonCharacterInternals.validOcid(sample), nexonProxyInternals.validOcid(sample));
assert.equal(nexonCharacterInternals.upstreamErrorCode({error: {name: 'OPENAPI00003'}}), 'OPENAPI00003');
context.fetch = async () => ({ok: false, status: 403, json: async () => ({ok: false, code: 'FORBIDDEN', message: 'NEXON Open API 권한을 확인해주세요.'})});
await assert.rejects(run("fetchNexonProfile('abcdefghijklmnop')"), error => error.status === 403 && error.code === 'FORBIDDEN' && /권한/.test(error.message));
delete context.fetch;
assert.match(nexonCharacterApiSource, /process\.env\.NEXON_OPEN_API_KEY/);
assert.doesNotMatch(nexonCharacterApiSource, /VITE_NEXON/);
assert.match(nexonCharacterApiSource, /'x-nxopen-api-key': apiKey/);
assert.match(nexonCharacterApiSource, /\/maplestory\/v1\/character\/basic/);
assert.match(nexonCharacterApiSource, /\/maplestory\/v1\/character\/stat/);
assert.match(nexonCharacterApiSource, /\/maplestory\/v1\/user\/union/);
assert.match(nexonCharacterApiSource, /Promise\.allSettled/);
assert.doesNotMatch(nexonCharacterApiSource, /Promise\.all\(/);
assert.doesNotMatch(JSON.stringify(sanitizedProfile), /ocid|api.?key/i);
assert.match(source, /throw applyError \|\| new Error\('NEXON 확인 결과를 이 기기에 저장하지 못했습니다\.'\)/);
assert.match(source, /try \{ profileResponse = await fetchNexonProfile\(profileOcid\); \}\s*catch/);
assert.match(source, /profileFailure = nexonProfileFailure\(character, error, nexonCharacter\)/);
assert.match(source, /프로필 갱신 필요/);
assert.match(source, /프로필 갱신 실패/);
assert.match(source, /HTTP \$\{item\.status \|\| '-'\}/);
assert.match(source, /console\.info\('NEXON scheduler sync diagnostics', result\)/);
assert.match(html, /id="nexonDiagnostics"/);
assert.match(html, /id="nexonDiagnosticsContent"/);
assert.match(html, /<details id="nexonDiagnostics" class="nexon-diagnostics hidden"><summary>상세 진단 보기<\/summary>/);
assert.doesNotMatch(html, /<details id="nexonDiagnostics"[^>]*\sopen(?:\s|=|>)/);
assert.match(html, /id="nexonLastChecked"/);
assert.match(html, /id="weeklyActivityList"/);
assert.match(html, /주간 콘텐츠/);
assert.match(css, /\.nexon-diagnostic-item/);
assert.match(css, /\.weekly-activity-row/);
assert.match(css, /\.nexon-sync-summary/);
assert.match(css, /\.nexon-profile-image/);
assert.match(css, /object-fit:contain/);
assert.match(css, /\.summary-art,.boss-art\{[^}]*width:clamp\(80px,20vw,100px\);height:clamp\(82px,20vw,96px\);border:0;border-radius:0;background:transparent/);
assert.match(css, /\.summary-art img,.boss-art img\{[^}]*object-position:center 54%;transform:translateY\(4px\) scale\(2\);transform-origin:center 54%/);
assert.match(css, /\.settings-avatar\{[^}]*width:clamp\(56px,14vw,60px\);height:clamp\(56px,14vw,60px\);border:1px/);
assert.match(css, /\.settings-avatar img\{[^}]*transform:scale\(1\.8\)/);
assert.match(css, /\.nexon-profile-image\[hidden\]\{display:none\}/);
assert.match(css, /\.character-spec\{/);
assert.doesNotMatch(css, /\.character-spec-title|\.character-spec-grid/);
assert.match(css, /\.character-progress-head\{/);
assert.match(css, /\.character-weekly-income\{/);
assert.match(css, /\.character-income-grid\{/);
assert.match(css, /\.stat-detail-toggle\{/);
assert.match(css, /\.character-stat-details\{/);
assert.match(css, /\.character-stat-groups\{/);
assert.match(html, /id="incomeFeeRate"/);
assert.match(html, /id="defaultSaleFeeRate"/);
assert.match(html, /id="saleGrossValue"/);
assert.match(html, /id="saleFeeValue"/);
assert.match(html, /id="saleNetValue"/);
assert.match(html, /id="editFeeRate"/);
assert.match(html, /id="editSaleResult"/);
assert.doesNotMatch(html, /materialCost|editCost|costWrap|소재비|제작 원가/);
assert.match(css, /\.sale-entry-grid\{/);
assert.match(css, /\.sale-result-grid\{/);
assert.match(css, /@media\(min-width:600px\)\{[\s\S]*\.sale-entry-grid\{grid-template-columns:minmax\(180px,1\.2fr\) minmax\(100px,\.65fr\) minmax\(190px,1fr\)/);
assert.match(css, /@media\(min-width:1000px\)\{/);
assert.match(css, /\.app\{max-width:1180px\}/);
assert.match(css, /grid-template-areas:"profile spec" "progress progress" "income income" "details details"/);
assert.match(css, /\.character\{grid-template-columns:minmax\(0,1fr\) minmax\(220px,280px\);[^}]*padding:11px 18px 12px/);
assert.match(css, /\.character-spec\{grid-area:spec;[^}]*padding:0;border:0/);
assert.match(css, /\.character-income-grid div\{grid-template-columns:auto minmax\(0,1fr\);[^}]*padding:6px 10px/);
assert.match(css, /\.character-stat-groups\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
for (const viewport of [360, 390, 430]) {
  const artWidth = Math.min(100, Math.max(80, viewport * 0.2));
  const artHeight = Math.min(96, Math.max(82, viewport * 0.2));
  const thumbnailSize = Math.min(60, Math.max(56, viewport * 0.14));
  assert.ok(artWidth >= 80 && artWidth <= 86, `${viewport}px character art width`);
  assert.ok(artHeight >= 82 && artHeight <= 86, `${viewport}px character art height`);
  assert.ok(thumbnailSize >= 56 && thumbnailSize <= 60, `${viewport}px settings thumbnail`);
}
assert.match(css, /\.character-identity\{[^}]*min-width:0/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-income-grid\{grid-template-columns:1fr\}/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-stat-groups\{grid-template-columns:1fr/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.sale-entry-grid,\.sale-result-grid\{grid-template-columns:1fr\}/);
assert.match(css, /\.character-spec\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.character-spec b\{[^}]*overflow-wrap:anywhere/);
assert.match(css, /\.boss-profile-identity\{[^}]*min-width:0/);
assert.match(source, /data-nexon-profile-image/);
assert.doesNotMatch(source, /classList\.add\('image-failed'\)/);
assert.match(source, /if \(avatar\) avatar\.hidden = true/);
assert.match(source, /nexonProfileAvatar\(c, 'summary-art'\)/);
assert.match(source, /nexonSpecSummary\(c, statsExpanded\)/);
assert.match(source, /statsExpanded \? nexonStatDetails\(c\) : ''/);
assert.match(source, /data-stat-toggle/);
assert.match(source, /expandedStatCharacterIds\.has\(characterId\)/);
assert.match(source, /expandedStatCharacterIds\.delete\(characterId\)/);
assert.match(source, /expandedStatCharacterIds\.add\(characterId\)/);
assert.doesNotMatch(source, /expandedStatCharacterIds[^\n]*localStorage|expandedStatCharacterIds[^\n]*Supabase/i);
assert.match(source, /class="character-progress-head"/);
assert.match(source, /이번 주 완료수익/);
assert.match(source, /class="character-income-grid"/);
assert.match(source, /function saleAmounts\(quantity, unitPrice, feeRate\)/);
assert.match(source, /feeAmount = Math\.floor\(grossSale \/ 100\) \* percent \+ Math\.floor\(\(grossSale % 100\) \* percent \/ 100\)/);
assert.match(source, /type: 'sale'/);
assert.match(source, /grossIncome: sale\.grossSale, netIncome: sale\.netSale/);
assert.match(source, /if \(r\.netSale != null\) return n\(r\.netSale\)/);
const incomeEditSource = source.slice(source.indexOf('function saveIncomeEdit'), source.indexOf('function init'));
assert.match(incomeEditSource, /saleAmounts\(qty, price, feeRate\)/);
assert.match(incomeEditSource, /\.\.\.sale, grossIncome: sale\.grossSale, netIncome: sale\.netSale/);
assert.equal(run("expandedStatCharacterIds.has('c1')"), false);
run("expandedStatCharacterIds.add('c1')");
assert.equal(run("expandedStatCharacterIds.has('c1')"), true);
assert.equal(run("expandedStatCharacterIds.has('c2')"), false);
run("expandedStatCharacterIds.delete('c1')");
assert.match(source, /nexonProfileAvatar\(c, 'boss-art'\)/);
assert.match(source, /nexonProfileAvatar\(character, 'settings-avatar'\)/);
assert.match(source, /delete next\.characters\.find\(item => item\.id === character\.id\)\.nexonCharacter/);
assert.match(source, /<details class="nexon-diagnostic-group"><summary>/);
assert.doesNotMatch(source, /<details class="nexon-diagnostic-group" open/);
const diagnosticsRenderSource = source.slice(source.indexOf('function renderNexonDiagnostics'), source.indexOf('function renderNexonSettings'));
assert.ok(diagnosticsRenderSource.indexOf('${completedHtml}') < diagnosticsRenderSource.indexOf('${summaryHtml}'));
assert.ok(diagnosticsRenderSource.indexOf('${samplesHtml}') > diagnosticsRenderSource.indexOf('${groupHtml'));
assert.match(source, /data-nexon-action="link"/);
assert.match(source, /data-nexon-action="unlink"/);
const originalNexonKey = process.env.NEXON_OPEN_API_KEY;
delete process.env.NEXON_OPEN_API_KEY;
let missingKeyStatus = 0, missingKeyBody = null;
await nexonSchedulerHandler(
  {method: 'GET', query: {characterName: '넥슨본캐'}},
  {status(code) { missingKeyStatus = code; return this; }, json(body) { missingKeyBody = body; return this; }, setHeader() {}}
);
assert.equal(missingKeyStatus, 503);
assert.equal(missingKeyBody.code, 'NOT_CONFIGURED');
let missingProfileKeyStatus = 0, missingProfileKeyBody = null;
await nexonCharacterHandler(
  {method: 'GET', query: {ocid: schedulerResponse.character.ocid}},
  {status(code) { missingProfileKeyStatus = code; return this; }, json(body) { missingProfileKeyBody = body; return this; }, setHeader() {}}
);
assert.equal(missingProfileKeyStatus, 503);
assert.equal(missingProfileKeyBody.code, 'NOT_CONFIGURED');
process.env.NEXON_OPEN_API_KEY = 'test-only-key';
let invalidProfileOcidStatus = 0, invalidProfileOcidBody = null;
await nexonCharacterHandler(
  {method: 'GET', query: {ocid: 'invalid ocid'}},
  {status(code) { invalidProfileOcidStatus = code; return this; }, json(body) { invalidProfileOcidBody = body; return this; }, setHeader() {}}
);
assert.equal(invalidProfileOcidStatus, 400);
assert.equal(invalidProfileOcidBody.code, 'BAD_REQUEST');
const originalFetch = globalThis.fetch;
const basicPayload = {date: '2026-09-24T00:00+09:00', character_name: '넥슨본캐', world_name: '루나', character_class: '나이트로드', character_level: 286, character_image: 'https://example.com/profile.png'};
const statPayload = {final_stat: [
  {stat_name: '전투력', stat_value: '284300000'},
  ...Object.entries(nexonCharacterInternals.statDefinitions).map(([key, definition]) => ({stat_name: definition.name, stat_value: String(detailStatsFixture[key])}))
]};
const unionPayload = {union_level: 9450, union_grade: '그랜드 마스터 유니온'};
const apiResponse = (ok, status, payload) => ({ok, status, json: async () => payload});
const mockCharacterFetch = ({failStat = false, failUnion = false} = {}) => async target => {
  const path = new URL(String(target)).pathname;
  if (path.endsWith('/character/basic')) return apiResponse(true, 200, basicPayload);
  if (path.endsWith('/character/stat')) return failStat
    ? apiResponse(false, 500, {error: {name: 'OPENAPI00001'}})
    : apiResponse(true, 200, statPayload);
  if (path.endsWith('/user/union')) return failUnion
    ? apiResponse(false, 503, {error: {name: 'OPENAPI00011'}})
    : apiResponse(true, 200, unionPayload);
  throw new Error('unexpected NEXON path: ' + path);
};
async function invokeNexonCharacter() {
  let status = 0, body = null;
  await nexonCharacterHandler(
    {method: 'GET', query: {ocid: schedulerResponse.character.ocid}},
    {status(code) { status = code; return this; }, json(value) { body = value; return this; }, setHeader() {}}
  );
  return {status, body};
}
try {
  nexonCharacterInternals.clearCaches();
  globalThis.fetch = mockCharacterFetch();
  const fullCharacterResponse = await invokeNexonCharacter();
  assert.equal(fullCharacterResponse.status, 200);
  assert.equal(fullCharacterResponse.body.ok, true);
  assert.deepEqual(fullCharacterResponse.body.character, {
    name: '넥슨본캐', world: '루나', className: '나이트로드', level: 286, image: 'https://example.com/profile.png',
    combatPower: 284300000, stats: detailStatsFixture, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온'
  });
  assert.deepEqual(fullCharacterResponse.body.warnings, []);

  nexonCharacterInternals.clearCaches();
  globalThis.fetch = mockCharacterFetch({failStat: true});
  const statFailureResponse = await invokeNexonCharacter();
  assert.equal(statFailureResponse.status, 200);
  assert.equal(statFailureResponse.body.character.name, '넥슨본캐');
  assert.equal(statFailureResponse.body.character.combatPower, null);
  assert.equal(statFailureResponse.body.character.stats, null);
  assert.equal(statFailureResponse.body.character.unionLevel, 9450);
  assert.equal(statFailureResponse.body.warnings[0].resource, 'stat');

  nexonCharacterInternals.clearCaches();
  globalThis.fetch = mockCharacterFetch({failUnion: true});
  const unionFailureResponse = await invokeNexonCharacter();
  assert.equal(unionFailureResponse.status, 200);
  assert.equal(unionFailureResponse.body.character.combatPower, 284300000);
  assert.equal(unionFailureResponse.body.character.unionLevel, null);
  assert.equal(unionFailureResponse.body.warnings[0].resource, 'union');
} finally {
  nexonCharacterInternals.clearCaches();
  globalThis.fetch = originalFetch;
}
if (originalNexonKey === undefined) delete process.env.NEXON_OPEN_API_KEY;
else process.env.NEXON_OPEN_API_KEY = originalNexonKey;
assert.match(cloudSource, /auth\.resend\(\{/);
assert.match(cloudSource, /emailRedirectTo: window\.location\.origin/);
assert.match(cloudSource, /detectSessionInUrl: true/);
assert.match(cloudSource, /if \(action === 'download'\) \{\s*await applyRemote\(remote\)/);
assert.match(cloudSource, /if \(action === 'create'\) \{\s*await writeRemote\(local, remote\)/);
assert.doesNotMatch(cloudSource, /confirm\('이 기기와 클라우드/);
assert.match(html, /id="resendConfirmation"/);
assert.match(html, /id="cloudChoiceDialog"/);
assert.match(html, /data-cloud-choice="remote"/);
assert.match(html, /data-cloud-choice="local"/);
assert.match(html, /id="cloudOverwriteStep" class="hidden"/);
assert.match(html, /data-cloud-overwrite="confirm"/);
assert.ok(html.indexOf('클라우드 데이터 불러오기') < html.indexOf('이 기기 데이터 사용'));
const referencedIds = [...source.matchAll(/\$\('#([A-Za-z][A-Za-z0-9_-]*)'\)/g)].map(match => match[1]);
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
assert.deepEqual([...new Set(referencedIds)].filter(id => !htmlIds.has(id)), []);
const cloudIds = [...cloudSource.matchAll(/querySelector\('#([A-Za-z][A-Za-z0-9_-]*)'\)/g)].map(match => match[1]);
assert.deepEqual([...new Set(cloudIds)].filter(id => !htmlIds.has(id)), []);
assert.match(css, /\.chip-scroll\{[^}]*overflow-x:auto/);
assert.match(css, /@media\(max-width:430px\)/);
assert.match(css, /\.danger-action button\{width:100%;min-height:44px\}/);
assert.match(css, /\.cloud-actions button\{[^}]*min-height:44px/);
assert.match(css, /\.cloud-choice\{[^}]*min-height:66px/);
assert.match(schema, /alter table public\.maple_income_sync enable row level security/i);
assert.equal((schema.match(/create policy/gi) || []).length, 3);
assert.match(schema, /auth\.uid\(\)\) = user_id/);
console.log('boss roster, preset, migration, backup, reset, rollover, income, NEXON scheduler and multi-device cloud sync regression checks passed');
