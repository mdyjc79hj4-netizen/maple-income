import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cloudSyncInternals} from './cloud-sync.js';
import {nexonProxyInternals} from './api/nexon-scheduler.js';
import nexonCharacterHandler, {nexonCharacterInternals} from './api/nexon-character.js';
import {nexonAccountOwnershipInternals} from './api/nexon-account-ownership.js';
import {nexonCredentialStoreInternals} from './api/_nexon-credential-store.js';
import {nexonCredentialInternals} from './api/nexon-credential.js';

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
const nexonAccountOwnershipApiSource = readFileSync(new URL('./api/nexon-account-ownership.js', import.meta.url), 'utf8');
const nexonCredentialApiSource = readFileSync(new URL('./api/nexon-credential.js', import.meta.url), 'utf8');
const nexonCredentialStoreSource = readFileSync(new URL('./api/_nexon-credential-store.js', import.meta.url), 'utf8');
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
assert.equal(run("nexonWeeklyActivityDefinitions.find(activity => activity.id === 'epic-dungeon').scope"), 'account');
assert.equal(run("nexonWeeklyActivityDefinitions.find(activity => activity.id === 'guild').scope"), 'character');
assert.equal(run("nexonWeeklyActivityDefinitions.find(activity => activity.id === 'dojang').scope"), 'character');

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
assert.equal(migrated.version, 9);
assert.equal(migrated.settings.defaultSaleFeeRate, 0.05);
assert.deepEqual(migrated.accountWeeklyActivities.map(activity => [activity.id, activity.scope, activity.done]), [['epic-dungeon', 'account', false]]);
assert.deepEqual(migrated.characters[0].weeklyActivities.map(activity => [activity.id, activity.scope, activity.done]), [['guild', 'character', false], ['dojang', 'character', false]]);
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

context.__legacyActivityScopes = {
  version: 8, currentWeek: '2026-09-17~2026-09-23', incomes: [], presets: [], settings: {},
  weeklyHistory: {'2026-09-10~2026-09-16': {weekId:'2026-09-10~2026-09-16',incomes:[],characters:[
    {id:'main',name:'본캐',bosses:[],weeklyActivities:[{id:'epic-dungeon:aurum-regis',type:'epic-dungeon',done:true},{id:'guild:underground-waterway',type:'guild',done:true}]},
    {id:'sub',name:'부캐',bosses:[],weeklyActivities:[{id:'epic-dungeon:high-mountain',type:'epic-dungeon',done:false},{id:'mu-lung-dojo',type:'mu-lung-dojo',done:true}]}
  ]}},
  characters: [
    {id:'main',name:'본캐',bosses:[],weeklyActivities:[{id:'epic-dungeon:aurum-regis',type:'epic-dungeon',done:true,completionSource:'manual'},{id:'guild:underground-waterway',type:'guild',done:true},{id:'mu-lung-dojo',type:'mu-lung-dojo',done:false}]},
    {id:'sub',name:'부캐',bosses:[],weeklyActivities:[{id:'epic-dungeon:high-mountain',type:'epic-dungeon',done:false},{id:'guild:flag-race',type:'guild',done:false},{id:'mu-lung-dojo',type:'mu-lung-dojo',done:true}]}
  ]
};
const migratedActivityScopes = json("migrateState(__legacyActivityScopes, new Date('2026-09-23T12:00:00'))");
assert.equal(migratedActivityScopes.accountWeeklyActivities.find(activity => activity.id === 'epic-dungeon').done, true);
assert.equal(migratedActivityScopes.characters.find(character => character.id === 'main').weeklyActivities.find(activity => activity.id === 'guild').done, true);
assert.equal(migratedActivityScopes.characters.find(character => character.id === 'sub').weeklyActivities.find(activity => activity.id === 'guild').done, false);
assert.equal(migratedActivityScopes.characters.find(character => character.id === 'main').weeklyActivities.find(activity => activity.id === 'dojang').done, false);
assert.equal(migratedActivityScopes.characters.find(character => character.id === 'sub').weeklyActivities.find(activity => activity.id === 'dojang').done, true);
assert.equal(migratedActivityScopes.weeklyHistory['2026-09-10~2026-09-16'].accountWeeklyActivities[0].done, true);
assert.equal(migratedActivityScopes.weeklyHistory['2026-09-10~2026-09-16'].characters.find(character => character.id === 'main').weeklyActivities.find(activity => activity.id === 'guild').done, true);
context.__migratedActivityScopes = structuredClone(migratedActivityScopes);
run("state=__migratedActivityScopes;selectedWeek='2026-09-10~2026-09-16'");
assert.equal(run("viewData().accountWeeklyActivities.find(activity => activity.id === 'epic-dungeon').done"), true);
assert.equal(run("viewData().characters.find(character => character.id === 'sub').weeklyActivities.find(activity => activity.id === 'dojang').done"), true);
run("selectedWeek=''");
context.__scopeToggleState = structuredClone(migratedActivityScopes);
run("__scopeToggleState.characters.forEach(character=>character.weeklyActivities.forEach(activity=>activity.done=false));__scopeToggleState.characters.find(character=>character.id==='main').weeklyActivities.find(activity=>activity.id==='guild').done=true");
assert.equal(context.__scopeToggleState.characters.find(character => character.id === 'main').weeklyActivities.find(activity => activity.id === 'guild').done, true);
assert.equal(context.__scopeToggleState.characters.find(character => character.id === 'sub').weeklyActivities.find(activity => activity.id === 'guild').done, false);
run("__scopeToggleState.characters.find(character=>character.id==='main').weeklyActivities.find(activity=>activity.id==='dojang').done=true");
assert.equal(context.__scopeToggleState.characters.find(character => character.id === 'sub').weeklyActivities.find(activity => activity.id === 'dojang').done, false);
run("selectedActivityCharacterId='main';__scopeToggleState.accountWeeklyActivities[0].done=true;selectedActivityCharacterId='sub'");
assert.equal(context.__scopeToggleState.accountWeeklyActivities[0].done, true);
const weeklyTarget = {innerHTML: ''};
context.document = {querySelector: selector => selector === '#weeklyActivityList' ? weeklyTarget : null};
run("state=__migratedActivityScopes;selectedWeek='';storageBlocked=false;selectedActivityCharacterId='main';renderWeeklyActivities(state)");
assert.match(weeklyTarget.innerHTML, /계정 공용/);
assert.match(weeklyTarget.innerHTML, /id="weeklyActivityCharacterSelect"/);
assert.equal((weeklyTarget.innerHTML.match(/class="weekly-activity-card"/g) || []).length, 2);
assert.match(weeklyTarget.innerHTML, /data-activity-scope="account"/);
assert.match(weeklyTarget.innerHTML, /data-activity-scope="character"/);
assert.ok(weeklyTarget.innerHTML.indexOf('계정 공용') < weeklyTarget.innerHTML.indexOf('캐릭터별'));
assert.match(weeklyTarget.innerHTML, /class="weekly-activity-progress complete">1 \/ 1 완료/);
assert.match(weeklyTarget.innerHTML, /class="weekly-activity-character-picker"/);
assert.match(weeklyTarget.innerHTML, /aria-label="주간 콘텐츠 캐릭터 선택"/);
run("state={...__migratedActivityScopes,characters:[]};renderWeeklyActivities(state)");
assert.match(weeklyTarget.innerHTML, /에픽 던전/);
assert.match(weeklyTarget.innerHTML, /캐릭터를 등록하면 캐릭터별 주간 콘텐츠를 관리할 수 있습니다/);
run("state=__migratedActivityScopes");
context.document = undefined;
context.__legacyActivityScopes.characters.forEach(character => character.weeklyActivities.filter(activity => activity.type === 'epic-dungeon').forEach(activity => { activity.done = false; }));
assert.equal(json("migrateState(__legacyActivityScopes, new Date('2026-09-23T12:00:00'))").accountWeeklyActivities[0].done, false);

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
assert.doesNotMatch(specSummaryMarkup, /스펙 상세 보기|스펙 상세 닫기|data-stat-toggle/);
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
context.__hubCharacter = {
  ...structuredClone(context.__profileUiCharacter),
  nexonCharacter: {...structuredClone(context.__profileUiCharacter.nexonCharacter), image: 'https://example.com/avatar.png'},
  bosses: [
    {bossId:'lotus',name:'스우',difficulty:'하드',party:1,partySize:1,price:100000000,done:true,completedIncome:100000000},
    {bossId:'damien',name:'데미안',difficulty:'하드',party:1,partySize:1,price:120000000,done:false},
    {bossId:'black-mage',name:'검은 마법사',difficulty:'하드',party:1,partySize:1,price:500000000,done:false}
  ],
  weeklyActivities: [{id:'guild',type:'guild',scope:'character',name:'길드',done:true},{id:'dojang',type:'mu-lung-dojo',scope:'character',name:'무릉',done:false}]
};
context.__hubData = {weekId:'2026-10-01~2026-10-07',characters:[context.__hubCharacter,{id:'c2',name:'미연동',bosses:[],weeklyActivities:[]}],accountWeeklyActivities:[{id:'epic-dungeon',type:'epic-dungeon',scope:'account',name:'에픽 던전',done:true}],incomes:[]};
const homeCharacterMarkup = run('renderHomeCharacterCard(__hubCharacter,__hubData)');
assert.match(homeCharacterMarkup, /본캐/);
assert.match(homeCharacterMarkup, /Lv\. 285/);
assert.match(homeCharacterMarkup, /2억 8,430만/);
assert.match(homeCharacterMarkup, /전투력/);
assert.doesNotMatch(homeCharacterMarkup, /유니온|9,450|그랜드 마스터 유니온/);
assert.match(homeCharacterMarkup, /보스 1 \/ 2/);
assert.match(homeCharacterMarkup, /보스 수익/);
assert.doesNotMatch(homeCharacterMarkup, /주간 보스 1 \/ 2|보스 1 \/ 2 · \d+%/);
assert.match(homeCharacterMarkup, /data-character-detail/);
assert.match(homeCharacterMarkup, /aria-label="본캐 캐릭터 상세 보기"/);
assert.doesNotMatch(homeCharacterMarkup, /character-income-grid|character-stat-details|data-stat-toggle|주간 예상 수익|주간 남은 수익/);
const hubHeroMarkup = run('characterHubHero(__hubCharacter)');
assert.match(hubHeroMarkup, /NEXON ● 연결됨/);
assert.match(hubHeroMarkup, /전투력/);
assert.match(hubHeroMarkup, /유니온/);
assert.match(hubHeroMarkup, /그랜드 마스터 유니온/);
const hubOverviewMarkup = run('renderCharacterHubOverview(__hubCharacter,__hubData)');
assert.match(hubOverviewMarkup, /이번 주 보스/);
assert.match(hubOverviewMarkup, /완료 수익/);
assert.match(hubOverviewMarkup, /예상 수익/);
assert.match(hubOverviewMarkup, /남은 수익/);
assert.match(hubOverviewMarkup, /캐릭터별 콘텐츠/);
assert.match(hubOverviewMarkup, /계정 공용 콘텐츠/);
assert.match(hubOverviewMarkup, /마지막 프로필 확인/);
assert.match(hubOverviewMarkup, /data-hub-boss-manage/);
const hubStatsMarkup = run('renderCharacterHubStats(__hubCharacter)');
assert.match(hubStatsMarkup, /전투력/);
assert.match(hubStatsMarkup, /유니온/);
assert.match(hubStatsMarkup, /9,450/);
assert.match(hubStatsMarkup, /상세 스펙/);
assert.match(hubStatsMarkup, /보스 데미지/);
const hubContentMarkup = run('renderCharacterHubContent(__hubCharacter,__hubData)');
assert.match(hubContentMarkup, /주간 보스/);
assert.match(hubContentMarkup, /월간 보스/);
assert.match(hubContentMarkup, /스우/);
assert.match(hubContentMarkup, /검은 마법사/);
assert.match(hubContentMarkup, /캐릭터별 주간 콘텐츠/);
assert.match(hubContentMarkup, /계정 공용 콘텐츠/);
assert.match(hubContentMarkup, /길드/);
assert.match(hubContentMarkup, /에픽 던전/);
assert.doesNotMatch(hubContentMarkup, /data-field="difficulty"|data-action="remove-boss"/);
assert.match(run("characterHubHero({id:'u1',name:'미연동',bosses:[],weeklyActivities:[]})"), /NEXON 미연동/);
assert.match(run("renderCharacterHubStats({id:'u1',name:'미연동',bosses:[],weeklyActivities:[]})"), /상세 스펙 정보가 없습니다/);
const emptyHubContentMarkup = run("renderCharacterHubContent({id:'u1',name:'미연동',bosses:[],weeklyActivities:[]},{accountWeeklyActivities:[]})");
assert.equal((emptyHubContentMarkup.match(/등록된 보스가 없습니다/g) || []).length, 2);
assert.match(emptyHubContentMarkup, /길드/);
assert.match(emptyHubContentMarkup, /무릉/);
assert.match(emptyHubContentMarkup, /에픽 던전/);
assert.match(source, /저장된 캐릭터가 없습니다/);
assert.match(source, /캐릭터를 추가하면 프로필과 주간 현황을 확인할 수 있습니다/);
assert.equal(run("selectedHubCharacterId='missing';selectedHubCharacter(__hubData).id"), 'c1');
run("activeCharacterHubTab='stats';selectedHubCharacterId='c2'");
assert.equal(run('activeCharacterHubTab'), 'stats');
assert.equal(run('selectedHubCharacter(__hubData).name'), '미연동');
context.__hubPastState = {currentWeek:'2026-10-01~2026-10-07',characters:[{id:'current',name:'현재',bosses:[],weeklyActivities:[]}],weeklyHistory:{'2026-09-24~2026-09-30':{weekId:'2026-09-24~2026-09-30',characters:[{id:'past',name:'과거',bosses:[],weeklyActivities:[]}],accountWeeklyActivities:[],incomes:[]}}};
run("state=__hubPastState;selectedWeek='2026-09-24~2026-09-30';selectedHubCharacterId='current'");
assert.equal(run('selectedHubCharacter(viewData()).id'), 'past');
assert.equal(run("viewData().characters.some(character=>character.id==='current')"), false);
run("selectedWeek='';selectedHubCharacterId=''");
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
assert.equal(run("nexonBossCycle('bossMonthly')"), 'monthly');
assert.equal(run("nexonBossCycle('bossMonth')"), 'monthly');
assert.equal(run("nexonBossCycle('월간')"), 'monthly');

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
assert.equal(run('nexonDiagnosticMessage(__appliedDiagnostics)'), 'NEXON 조회 4개 · 완료 2개 · 메기 매칭 2개 · 완료 매칭 1개 · 자동 완료 1개 · 실제 매칭 오류 1개');
assert.equal(run('nexonDiagnosticFailureCount(__appliedDiagnostics)'), 1);
assert.deepEqual(json('Object.keys(nexonDiagnosticGroups(__appliedDiagnostics))'), ['unknownName', 'difficultyMismatch', 'unselectedDifficulty', 'ambiguous', 'localMissing', 'apiMissing', 'ignoredCycle', 'blockedByManualOverride', 'unsupportedActivity', 'activityBlockedByManualOverride', 'profileFailures']);
assert.equal(run('nexonDiagnosticGroups(__appliedDiagnostics).unknownName.length'), 1);
assert.deepEqual(appliedScheduler.completedItems.map(item => item.result).sort(), ['matched-auto-completed', 'unknown-name'].sort());
assert.equal(run('nexonUserStatusMessage(__appliedDiagnostics)'), '주간 보스 1개를 자동 확인했습니다.');
assert.equal(run('nexonUserStatusMessage({...__appliedDiagnostics, autoCompleted: 0})'), '새로 확인된 기록이 없습니다.');
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
context.__activityAppliedForCount = activityApplied;
assert.equal(activityApplied.activitiesFetched, 4);
assert.equal(activityApplied.activityMatched, 3);
assert.equal(activityApplied.activityAutoCompleted, 2);
assert.equal(activityApplied.unsupportedActivity[0].contentName, '새 주간 콘텐츠');
assert.equal(run('nexonDiagnosticFailureCount(__activityAppliedForCount)'), 0);
assert.deepEqual(JSON.parse(JSON.stringify(context.__activityState.characters[0].weeklyActivities.map(item => [item.type, item.done]))), [
  ['guild', false], ['mu-lung-dojo', true]
]);
assert.equal(context.__activityState.accountWeeklyActivities[0].done, true);
assert.equal(context.__activityState.accountWeeklyActivities[0].completionSource, 'nexon-api');
assert.equal(JSON.stringify(context.__activityState).includes('activityCompletedItems'), false);
assert.equal(run('nexonUserStatusMessage({autoCompleted:2,activityAutoCompleted:1})'), '주간 보스 2개 · 주간 콘텐츠 1개를 자동 확인했습니다.');
assert.equal(run('nexonUserStatusMessage({autoCompleted:0,activityAutoCompleted:1})'), '주간 콘텐츠 1개를 자동 확인했습니다.');

context.__activityManualState = structuredClone(context.__activityState);
Object.assign(context.__activityManualState.accountWeeklyActivities[0], {done: false, manualOverride: false, completionSource: 'manual'});
context.__activityManualResponse = {...structuredClone(schedulerResponse), bosses: [], activities: [structuredClone(context.__activityResponse.activities[0])]};
const activityManual = json("applyNexonSchedulerState(__activityManualState, 'c1', __activityManualResponse, '2026-09-23T02:11:00.000Z')");
assert.equal(context.__activityManualState.accountWeeklyActivities[0].done, false);
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
assert.equal(run("groupedDiagnosticEntryLabel('unknownName', groupNexonDiagnosticItems('unknownName', __duplicateUnknown)[0])"), '힐라 · 노멀 · bossWeekly · 4개 캐릭터');
assert.equal(run("nexonDiagnosticGroupLabels.unknownName"), '지원하지 않는 보스');
assert.equal(run("nexonDiagnosticGroupLabels.blockedByManualOverride"), '수동 해제 보호');

// Multi-character aggregation collects every sample before completion-first limiting.
context.__diagnosticTotal = {
  fetched: 0, apiCompleted: 0, matched: 0, matchedCompleted: 0, autoCompleted: 0,
  unknown: [], difficultyMismatch: [], unselectedDifficulty: [], ambiguous: [], notConfigured: [], localNotFound: [], ignoredCycle: [], completedItems: [], blockedByManualOverride: [], diagnosticSamples: []
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
    {contentName: '검은 마법사', difficulty: 'extreme', cycle: 'bossMonthly', complete: 'false'}
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
context.__multiDifficultyResultForCount = multiDifficultyResult;
assert.equal(multiDifficultyResult.matched, 1);
assert.equal(multiDifficultyResult.matchedCompleted, 1);
assert.equal(multiDifficultyResult.difficultyMismatch.length, 0);
assert.equal(multiDifficultyResult.unselectedDifficulty.length, 2);
assert.equal(multiDifficultyResult.notConfigured.length, 0);
assert.equal(run('nexonDiagnosticFailureCount(__multiDifficultyResultForCount)'), 0);
assert.deepEqual(multiDifficultyResult.completedItems.map(item => item.result).sort(), ['matched-auto-completed', 'unselected-difficulty'].sort());
assert.equal(run("diagnosticEntryLabel('unselectedDifficulty', __multiDifficultyResultForCount.unselectedDifficulty[0])"), '스우 · API 노멀 · 선택 하드 · bossWeekly');
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
context.__unknownOnlyResultForCount = unknownOnlyResult;
assert.equal(unknownOnlyResult.unknown.length, 1);
assert.equal(unknownOnlyResult.matched, 0);
assert.equal(run('nexonDiagnosticFailureCount(__unknownOnlyResultForCount)'), 1);
assert.equal(unknownOnlyResult.completedItems[0].result, 'unknown-name');
assert.equal(JSON.stringify(context.__unknownOnlyState.characters[0].bosses), unknownBossesBefore);

// A completed known boss absent from the local character remains diagnostic-only.
context.__notConfiguredState = structuredClone(schedulerState);
context.__notConfiguredState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__notConfiguredResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '루시드', difficulty: 'hard', cycle: 'bossWeekly', complete: 'true'}]};
const notConfiguredResult = json("applyNexonSchedulerState(__notConfiguredState, 'c1', __notConfiguredResponse, '2026-09-23T01:01:55.000Z')");
context.__notConfiguredResultForCount = notConfiguredResult;
assert.equal(notConfiguredResult.completedItems[0].result, 'not-configured');
assert.equal(notConfiguredResult.notConfigured.length, 1);
assert.equal(run('nexonDiagnosticFailureCount(__notConfiguredResultForCount)'), 0);

// Missing difficulty is invalid even when the local bossId has one candidate.
context.__missingDifficultyState = structuredClone(schedulerState);
context.__missingDifficultyState.characters[0].bosses = [structuredClone(schedulerState.characters[0].bosses[0])];
context.__missingDifficultyResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '', cycle: '주간', registered: false, complete: true}]};
const missingDifficulty = json("applyNexonSchedulerState(__missingDifficultyState, 'c1', __missingDifficultyResponse, '2026-09-23T01:02:00.000Z')");
assert.equal(missingDifficulty.matched, 0);
assert.equal(missingDifficulty.difficultyMismatch.length, 1);
assert.equal(missingDifficulty.autoCompleted, 0);
assert.equal(context.__missingDifficultyState.characters[0].bosses[0].done, false);

// Duplicate exact local rows are ambiguous and never auto-completed.
context.__ambiguousState = structuredClone(schedulerState);
context.__ambiguousState.characters[0].bosses = [
  {...structuredClone(schedulerState.characters[0].bosses[0]), difficulty: '하드', price: 48900000},
  {...structuredClone(schedulerState.characters[0].bosses[0]), difficulty: '하드', price: 48900000}
];
context.__ambiguousResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '하드', cycle: '주간', registered: true, complete: true}]};
const ambiguousResult = json("applyNexonSchedulerState(__ambiguousState, 'c1', __ambiguousResponse, '2026-09-23T01:03:00.000Z')");
context.__ambiguousResultForCount = ambiguousResult;
assert.equal(ambiguousResult.matched, 0);
assert.equal(ambiguousResult.ambiguous.length, 1);
assert.equal(run('nexonDiagnosticFailureCount(__ambiguousResultForCount)'), 1);
assert.equal(context.__ambiguousState.characters[0].bosses.some(boss => boss.done), false);

// A known name with an invalid master difficulty is diagnosed and never applied.
context.__difficultyMismatchState = structuredClone(schedulerState);
context.__difficultyMismatchResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '울트라', cycle: '주간', registered: true, complete: true}]};
const difficultyMismatch = json("applyNexonSchedulerState(__difficultyMismatchState, 'c1', __difficultyMismatchResponse, '2026-09-23T01:04:00.000Z')");
context.__difficultyMismatchForCount = difficultyMismatch;
assert.equal(difficultyMismatch.matched, 0);
assert.equal(difficultyMismatch.difficultyMismatch.length, 1);
assert.equal(run('nexonDiagnosticFailureCount(__difficultyMismatchForCount)'), 1);
assert.equal(context.__difficultyMismatchState.characters[0].bosses[0].done, false);
assert.equal(run("diagnosticEntryLabel('difficultyMismatch', __difficultyMismatchForCount.difficultyMismatch[0])"), '스우 · API 울트라 · 유효 노멀, 하드, 익스트림 · 선택 하드 · 주간');
assert.equal(run("diagnosticEntryLabel('ambiguous', __ambiguousResultForCount.ambiguous[0])"), '스우 · API 하드 · 로컬 하드, 하드 · 주간');

// A valid master difficulty not selected locally is information, not a match error.
context.__unselectedDifficultyState = structuredClone(schedulerState);
context.__unselectedDifficultyResponse = {...structuredClone(schedulerResponse), bosses: [{contentName: '스우', difficulty: '노멀', cycle: '주간', registered: true, complete: true}]};
const unselectedDifficultyResult = json("applyNexonSchedulerState(__unselectedDifficultyState, 'c1', __unselectedDifficultyResponse, '2026-09-23T01:04:10.000Z')");
context.__unselectedDifficultyResultForCount = unselectedDifficultyResult;
assert.equal(unselectedDifficultyResult.matched, 0);
assert.equal(unselectedDifficultyResult.unselectedDifficulty.length, 1);
assert.equal(unselectedDifficultyResult.difficultyMismatch.length, 0);
assert.equal(run('nexonDiagnosticFailureCount(__unselectedDifficultyResultForCount)'), 0);
assert.equal(unselectedDifficultyResult.completedItems[0].result, 'unselected-difficulty');
assert.equal(context.__unselectedDifficultyState.characters[0].bosses[0].done, false);

context.__informationOnlyDiagnostics = {
  unselectedDifficulty: Array.from({length: 2}, () => ({contentName: '선택하지 않은 난이도'})),
  notConfigured: Array.from({length: 51}, () => ({contentName: '로컬 미등록'})),
  unsupportedActivity: Array.from({length: 15}, () => ({contentName: '지원 대상 외'}))
};
assert.equal(run('nexonDiagnosticFailureCount(__informationOnlyDiagnostics)'), 0);
assert.equal(run('nexonDiagnosticMessage(__informationOnlyDiagnostics)'), 'NEXON 조회 0개 · 완료 0개 · 메기 매칭 0개 · 완료 매칭 0개 · 자동 완료 0개 · 선택하지 않은 난이도 2개 · 로컬 미등록 51개 · 지원 대상 외 15개');

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
assert.equal(run("prepareImportedState(__backup, new Date('2026-09-20T12:00:00')).version"), 9);
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
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].characters[0].weeklyActivities.find(activity => activity.id === 'dojang').done, true);
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].characters[0].weeklyActivities.find(activity => activity.id === 'dojang').completionSource, 'nexon-api');
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].accountWeeklyActivities[0].done, true);
assert.equal(context.__activityRoll.weeklyHistory['2026-09-17~2026-09-23'].accountWeeklyActivities[0].completionSource, 'nexon-api');
assert.equal(context.__activityRoll.characters[0].weeklyActivities[0].done, false);
assert.equal('apiCompleted' in context.__activityRoll.characters[0].weeklyActivities[0], false);
assert.equal(context.__activityRoll.accountWeeklyActivities[0].done, false);
assert.equal('apiCompleted' in context.__activityRoll.accountWeeklyActivities[0], false);

context.__monthlyBossState = {
  version: 7, currentWeek: '2026-09-24~2026-09-30', updatedAt: '2026-09-26T00:00:00.000Z',
  characters: [{id:'monthly-c1',name:'월간캐릭터',bosses:[
    {bossId:'black-mage',name:'검은 마법사',difficulty:'하드',party:1,partySize:1,price:665000000,done:true,completedIncome:665000000,completionSource:'manual',manualOverride:true}
  ],weeklyActivities:[]}],
  incomes: [], weeklyHistory: {}, presets: [], settings: {defaultSaleFeeRate:0.05}
};
const migratedMonthly = json("migrateState(__monthlyBossState, new Date('2026-09-26T12:00:00'))");
assert.equal(migratedMonthly.version, 9);
assert.equal(migratedMonthly.characters[0].bosses[0].monthlyCompletions['2026-09'].weekId, '2026-09-24~2026-09-30');
assert.equal(migratedMonthly.characters[0].bosses[0].done, true);
context.__migratedMonthly = structuredClone(migratedMonthly);
assert.equal(run("characterStats(__migratedMonthly.characters[0]).count"), 0);
assert.equal(run("totalsFor(__migratedMonthly).boss"), 665000000);
context.__migratedMonthly.currentWeek = '2026-10-01~2026-10-07';
assert.equal(run("totalsFor(__migratedMonthly).boss"), 0);

context.__crossMonthBoss = structuredClone(migratedMonthly.characters[0].bosses[0]);
run("recordMonthlyBossCompletion(__crossMonthBoss,'2026-10','2026-09-24~2026-09-30',{income:465000000,completedAt:'2026-10-01T00:10:00.000Z',source:'manual',now:new Date('2026-10-01T00:10:00')})");
assert.equal(run("monthlyBossIncomeForWeek(__crossMonthBoss,'2026-09-24~2026-09-30')"), 1130000000);
run("syncMonthlyBossCurrentState(__crossMonthBoss,new Date('2026-10-01T12:00:00'))");
assert.equal(context.__crossMonthBoss.done, true);
assert.equal(context.__crossMonthBoss.completedIncome, 465000000);

context.__monthlyResetState = structuredClone(migratedMonthly);
run("resetCurrentWeek(__monthlyResetState,new Date('2026-09-26T12:00:00'))");
assert.equal(run("Object.keys(__monthlyResetState.characters[0].bosses[0].monthlyCompletions).length"), 0);
assert.equal(context.__monthlyResetState.characters[0].bosses[0].done, false);

context.__priorMonthly = structuredClone(migratedMonthly);
context.__priorMonthly.characters[0].bosses[0].monthlyCompletions['2026-09'].weekId = '2026-09-17~2026-09-23';
run("resetCurrentWeek(__priorMonthly,new Date('2026-09-26T12:00:00'))");
assert.equal(context.__priorMonthly.characters[0].bosses[0].done, true);
assert.equal(run("monthlyBossIncomeForWeek(__priorMonthly.characters[0].bosses[0],'2026-09-17~2026-09-23')"), 665000000);

context.__monthlySchedulerState = {
  version: 9, currentWeek: '2026-09-24~2026-09-30',
  characters: [{id:'monthly-c1',name:'월간캐릭터',bosses:[{bossId:'black-mage',name:'검은 마법사',difficulty:'하드',party:1,partySize:1,price:665000000,done:false}],weeklyActivities:[]}],
  incomes: [], weeklyHistory: {}, presets: [], settings: {}
};
context.__monthlySchedulerResponse = {
  date:'2026-09-26',requestedDate:null,mode:'live',character:{name:'월간캐릭터'},
  bosses:[{contentName:'검은 마법사',difficulty:'hard',cycle:'bossMonthly',complete:true}],activities:[]
};
const monthlySchedulerResult = json("applyNexonSchedulerState(__monthlySchedulerState,'monthly-c1',__monthlySchedulerResponse,'2026-09-26T03:00:00.000Z')");
assert.equal(monthlySchedulerResult.monthlyAutoCompleted, 1);
assert.equal(monthlySchedulerResult.autoCompleted, 1);
assert.equal(context.__monthlySchedulerState.characters[0].bosses[0].monthlyCompletions['2026-09'].weekId, '2026-09-24~2026-09-30');
assert.equal(run("nexonUserStatusMessage({autoCompleted:1,monthlyAutoCompleted:1,activityAutoCompleted:0})"), '월간 보스 1개를 자동 확인했습니다.');

context.__activityReset = structuredClone(context.__activityState);
run('resetCurrentWeek(__activityReset)');
assert.equal(context.__activityReset.characters[0].weeklyActivities.every(activity => !activity.done), true);
assert.equal(context.__activityReset.characters[0].weeklyActivities.every(activity => !('manualOverride' in activity)), true);
assert.equal(context.__activityReset.accountWeeklyActivities.every(activity => !activity.done), true);
assert.equal(context.__activityReset.accountWeeklyActivities.every(activity => !('manualOverride' in activity)), true);

assert.equal(run('incomeValue({item:"메소",category:"hunt",amount:82000000})'), 82000000);
context.__huntSummaryRecords = [
  {id:'meso-direct',category:'hunt',item:'메소',recordType:'income',saleState:'direct',amount:67100000,netIncome:67100000,weekId:'2026-09-17~2026-09-23'},
  {id:'sol-9',category:'hunt',item:'솔 에르다 조각',recordType:'acquired',saleState:'acquired',qty:9,weekId:'2026-09-17~2026-09-23'},
  {id:'sol-11',category:'hunt',item:'솔 에르다 조각',recordType:'acquired',saleState:'acquired',quantity:11,weekId:'2026-09-17~2026-09-23'},
  {id:'sol-10',category:'hunt',item:'솔 에르다 조각',recordType:'acquired',saleState:'acquired',qty:10,weekId:'2026-09-17~2026-09-23'},
  {id:'sol-sale',category:'hunt',item:'솔 에르다 조각',recordType:'sold',saleState:'sold',qty:20,netSale:95000000,weekId:'2026-09-17~2026-09-23'},
  {id:'gem-sale',category:'hunt',item:'코어 젬스톤',recordType:'sold',saleState:'sold',qty:2,netSale:1900000,weekId:'2026-09-17~2026-09-23'},
  {id:'other-meso',category:'drop',item:'메소',recordType:'income',saleState:'direct',amount:5000000,weekId:'2026-09-17~2026-09-23'},
  {id:'other-week-meso',category:'hunt',item:'메소',recordType:'income',saleState:'direct',amount:3000000,weekId:'2026-09-10~2026-09-16'},
  {id:'other-week-sol',category:'hunt',item:'솔 에르다 조각',recordType:'acquired',saleState:'acquired',qty:7,weekId:'2026-09-10~2026-09-16'}
];
assert.deepEqual(json("summarizeHuntRecords(__huntSummaryRecords, '2026-09-17~2026-09-23')"), {mesoAcquired: 67100000, solErdaPieces: 30});
assert.deepEqual(json("summarizeHuntRecords(__huntSummaryRecords, '2026-09-10~2026-09-16')"), {mesoAcquired: 3000000, solErdaPieces: 7});
assert.equal(run("totalsFor({characters:[],incomes:__huntSummaryRecords.filter(row => row.weekId === '2026-09-17~2026-09-23')}).hunt"), 164000000);
assert.equal(run("summarizeHuntRecords([{category:'hunt',item:'메소',recordType:'sold',saleState:'sold',type:'sale',amount:7000000}], '').mesoAcquired"), 0);
assert.deepEqual(json("summarizeHuntRecords([], '2026-09-17~2026-09-23')"), {mesoAcquired: 0, solErdaPieces: 0});
assert.match(source, /summarizeHuntRecords\(data\.incomes, data\.weekId \|\| data\.currentWeek \|\| ''\)/);
assert.match(source, /class="hunt-resource-summary"/);
assert.match(css, /\.hunt-resource-summary\{/);
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
  assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionState, 'char-b')"), {bossCharacterId: 'char-b', activityCharacterId: 'char-b', week: ''});
}
context.__cloudSelectionDeleted = {...structuredClone(cloudSelectionState), characters: [structuredClone(cloudSelectionState.characters[0])]};
assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionDeleted, 'char-b')"), {bossCharacterId: 'char-a', activityCharacterId: 'char-a', week: ''});
context.__cloudSelectionEmpty = {...structuredClone(cloudSelectionState), characters: []};
assert.deepEqual(json("reconcileCloudSelection('char-b', '', __cloudSelectionEmpty, 'char-b')"), {bossCharacterId: '', activityCharacterId: '', week: ''});
context.__cloudSelectionState = structuredClone(cloudSelectionState);
assert.deepEqual(json("reconcileCloudSelection('char-b', '2026-09-10~2026-09-16', __cloudSelectionState, 'char-b')"), {bossCharacterId: 'char-b', activityCharacterId: 'char-b', week: '2026-09-10~2026-09-16'});
assert.deepEqual(json("reconcileCloudSelection('char-b', '2026-09-03~2026-09-09', __cloudSelectionState, 'char-b')"), {bossCharacterId: 'char-b', activityCharacterId: 'char-b', week: ''});
assert.match(source, /const selection = reconcileCloudSelection\(previousBossCharacterId, previousWeek, state, previousActivityCharacterId\)/);

const syncBase = {
  version: 5, currentWeek: '2026-09-17~2026-09-23', updatedAt: '2026-09-23T00:00:00.000Z',
  settings: {theme: 'dark'},
  incomes: [{id: 'income-base', category: 'hunt', item: '메소', amount: 100, createdAt: 1}],
  accountWeeklyActivities: [{id: 'epic-dungeon', type: 'epic-dungeon', scope: 'account', name: '에픽 던전', done: false}],
  characters: [{id: 'char-a', name: '본캐', bosses: [{bossId: 'lotus', difficulty: '하드', partySize: 1, done: false}], weeklyActivities: [
    {id: 'guild', type: 'guild', scope: 'character', name: '길드', done: false},
    {id: 'dojang', type: 'mu-lung-dojo', scope: 'character', name: '무릉', done: false}
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
assert.equal(migrationGuard.toVersion, 9);
assert.equal(migrationGuard.baseline.characters.length, 10);
assert.equal(migrationGuard.baseline.incomes.length, 50);
assert.equal(migrationGuard.baseline.accountActivities.length, 1);
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
  weeklyActivities: [{id: 'dojang', type: 'mu-lung-dojo', scope: 'character', name: '무릉', done: false}]
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
assert.equal(preservedAfterMigration.sync.tombstones.activities['remote-preserved-character::dojang'], undefined);

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
for (const group of ['incomes', 'characters', 'bosses', 'accountActivities', 'activities', 'presets', 'weeklyHistory']) {
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

// Account and character weekly activities merge independently across devices.
const activityLocal = clone(syncBase);
activityLocal.updatedAt = '2026-09-23T01:00:00.000Z';
Object.assign(activityLocal.accountWeeklyActivities[0], {done: true, completionSource: 'nexon-api', apiCompleted: true});
const activityRemote = clone(syncBase);
activityRemote.updatedAt = '2026-09-23T02:00:00.000Z';
Object.assign(activityRemote.characters[0].weeklyActivities[1], {done: true, manualOverride: true, completionSource: 'manual'});
const activitiesMergedState = cloudSyncInternals.mergeStates(syncBase, activityLocal, activityRemote, '2026-09-23T03:00:00.000Z').state;
assert.equal(activitiesMergedState.accountWeeklyActivities.find(activity => activity.id === 'epic-dungeon').done, true);
assert.equal(activitiesMergedState.characters[0].weeklyActivities.find(activity => activity.id === 'dojang').done, true);
assert.ok(cloudSyncInternals.prepareStateForMerge(activityLocal, syncBase).sync.revisions.accountActivities['epic-dungeon']);
assert.ok(cloudSyncInternals.prepareStateForMerge(activityRemote, syncBase).sync.revisions.activities['char-a::dojang']);
assert.equal(JSON.parse(JSON.stringify(activitiesMergedState)).accountWeeklyActivities[0].done, true);

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
const liveSchedulerUrl = nexonProxyInternals.buildNexonUrl('/maplestory/v1/scheduler/character-state', {ocid: schedulerResponse.character.ocid, date: ''});
assert.equal(liveSchedulerUrl.pathname, '/maplestory/v1/scheduler/character-state');
assert.equal(liveSchedulerUrl.searchParams.get('ocid'), schedulerResponse.character.ocid);
assert.equal(liveSchedulerUrl.searchParams.has('date'), false);
assert.deepEqual(nexonProxyInternals.requestLogContext('/maplestory/v1/scheduler/character-state', {ocid: schedulerResponse.character.ocid}), {
  endpoint: 'scheduler/character-state', mode: 'live', hasOcid: true, hasDate: false
});
const historicalSchedulerUrl = nexonProxyInternals.buildNexonUrl('/maplestory/v1/scheduler/character-state', {ocid: schedulerResponse.character.ocid, date: '2026-09-20'});
assert.equal(historicalSchedulerUrl.searchParams.get('date'), '2026-09-20');
assert.deepEqual(nexonProxyInternals.requestLogContext('/maplestory/v1/scheduler/character-state', {ocid: schedulerResponse.character.ocid, date: '2026-09-20'}), {
  endpoint: 'scheduler/character-state', mode: 'historical', hasOcid: true, hasDate: true
});
assert.equal(nexonProxyInternals.validDate('2026-02-30'), false);
const parsedUpstream400 = nexonProxyInternals.upstreamErrorDetails({
  error: {name: 'OPENAPI00003', message: 'invalid ocid 0123456789abcdef0123456789abcdef\n x-nxopen-api-key=top-secret-value'},
  headers: {authorization: 'Bearer should-not-escape'}, secret: 'should-not-escape'
}, 400);
assert.equal(parsedUpstream400.upstreamCode, 'OPENAPI00003');
assert.equal(parsedUpstream400.category, 'invalid_identifier');
assert.doesNotMatch(parsedUpstream400.upstreamMessage, /0123456789abcdef|top-secret-value|\n/);
assert.match(parsedUpstream400.upstreamMessage, /\[식별자 숨김\]|\[숨김\]/);
assert.deepEqual(nexonProxyInternals.upstreamErrorDetails({error: {name: 'OPENAPI00009', message: 'data preparing'}}, 400), {
  upstreamCode: 'OPENAPI00009', upstreamMessage: 'data preparing', category: 'data_preparing'
});
assert.equal(nexonProxyInternals.schedulerErrorMessage(400, parsedUpstream400), 'NEXON Scheduler에서 캐릭터 식별자를 확인하지 못했습니다.');
assert.doesNotMatch(nexonApiSource, /process\.env\.NEXON_OPEN_API_KEY/);
assert.doesNotMatch(nexonAccountOwnershipApiSource, /process\.env\.NEXON_OPEN_API_KEY/);
assert.match(nexonCharacterApiSource, /process\.env\.NEXON_OPEN_API_KEY/);
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
context.__linkProfileResponse = {
  ok: true, fetchedAt: '2026-09-25T00:00:00.000Z', ocid: '0123456789abcdef0123456789abcdef',
  resources: {basic: {ok: true}, stat: {ok: true}, union: {ok: true}}, warnings: [],
  character: {name: '넥슨본캐', world: '루나', className: '나이트로드', level: 286, image: 'https://example.com/profile.png', combatPower: 284300000, stats: detailStatsFixture, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온'}
};
context.__linkState = {characters: [{id: 'c1', name: '본캐', bosses: [], weeklyActivities: []}]};
assert.equal(run("applyNexonLinkProfileState(__linkState, 'c1', __linkProfileResponse, '2026-09-25T00:00:00.000Z')"), true);
assert.equal(run("__linkState.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
assert.equal(run("__linkState.characters[0].nexonCharacter.characterName"), '넥슨본캐');
assert.equal(run("__linkState.characters[0].nexonCharacter.level"), 286);
assert.equal(run("__linkState.characters[0].nexonCharacter.combatPower"), 284300000);
assert.equal(run("__linkState.characters[0].nexonCharacter.unionLevel"), 9450);
assert.equal(run("__linkState.characters[0].nexonCharacter.profileCheckedAt"), '2026-09-25T00:00:00.000Z');
for (const [status, expected] of [[400, '아직 조회'], [403, '권한'], [429, '잠시 후'], [500, '장애']]) {
  context.__schedulerError = Object.assign(new Error('scheduler failed'), {status, code: `HTTP_${status}`});
  const warning = json("nexonSchedulerWarning(__linkState.characters[0], __schedulerError)");
  assert.equal(warning.status, status);
  assert.match(warning.message, new RegExp(expected));
  context.__linkUiState = run("nexonLinkUiState({schedulerWarning:nexonSchedulerWarning(__linkState.characters[0], __schedulerError)}, 'c1')");
  assert.equal(context.__linkUiState.status, 'warning');
  assert.deepEqual([...context.__linkUiState.schedulerWarningIds], ['c1']);
  assert.equal(Object.hasOwn(context.__linkUiState, 'errorCharacterId'), false);
  assert.equal(run("__linkState.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
}
context.__schedulerRestrictionError = Object.assign(new Error('Please input valid parameter'), {
  status: 400,
  code: 'OPENAPI00004',
  category: 'invalid_parameter',
  source: 'nexon_upstream',
  upstreamMessage: 'Please input valid parameter'
});
assert.equal(run('isSchedulerAccountRestriction(__schedulerRestrictionError)'), false);
const schedulerRestrictionWarning = json('nexonSchedulerWarning(__linkState.characters[0], __schedulerRestrictionError)');
assert.equal(schedulerRestrictionWarning.applicationCategory, '');
assert.equal(schedulerRestrictionWarning.code, 'OPENAPI00004');
assert.equal(schedulerRestrictionWarning.category, 'invalid_parameter');
assert.equal(schedulerRestrictionWarning.source, 'nexon_upstream');
assert.equal(schedulerRestrictionWarning.upstreamMessage, 'Please input valid parameter');
assert.match(schedulerRestrictionWarning.message, /주간 자동 확인 요청을 처리하지 못했습니다/);
assert.match(schedulerRestrictionWarning.message, /고급 진단 정보에서 자세한 내용/);
assert.doesNotMatch(schedulerRestrictionWarning.message, /서버 API Key와 연결된 NEXON 계정/);
context.__restrictedLinkUiState = run("nexonLinkUiState({schedulerWarning:nexonSchedulerWarning(__linkState.characters[0], __schedulerRestrictionError)}, 'c1')");
assert.equal(context.__restrictedLinkUiState.status, 'warning');
assert.deepEqual([...context.__restrictedLinkUiState.schedulerWarningIds], ['c1']);
assert.deepEqual([...context.__restrictedLinkUiState.schedulerRestrictedIds], []);
assert.equal(Object.hasOwn(context.__restrictedLinkUiState, 'errorCharacterId'), false);
assert.equal(run("__linkState.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
context.__explicitRestrictionError = {status: 400, code: 'SCHEDULER_ACCOUNT_RESTRICTED', category: 'account_restriction', source: 'nexon_upstream'};
assert.equal(run('isSchedulerAccountRestriction(__explicitRestrictionError)'), true);
context.__invalidSchedulerKeyError = Object.assign(new Error('NEXON Open API Key 설정을 확인해주세요.'), {
  status: 400, code: 'OPENAPI00005', category: 'invalid_api_key', source: 'nexon_upstream'
});
const invalidSchedulerKeyWarning = json('nexonSchedulerWarning(__linkState.characters[0], __invalidSchedulerKeyError)');
assert.equal(invalidSchedulerKeyWarning.applicationCategory, '');
assert.equal(invalidSchedulerKeyWarning.code, 'OPENAPI00005');
assert.match(invalidSchedulerKeyWarning.message, /API Key 설정을 확인/);
context.__schedulerAuthError = {status: 401, code: 'AUTH_REQUIRED'};
context.__schedulerCredentialError = {status: 409, code: 'NEXON_CREDENTIAL_REQUIRED', category: 'credential_required', source: 'credential_store'};
assert.match(run("nexonSchedulerWarning(__linkState.characters[0],__schedulerAuthError).message"), /로그인 후/);
assert.match(run("nexonSchedulerWarning(__linkState.characters[0],__schedulerCredentialError).message"), /개인 API Key를 등록/);
context.__invalidLinkState = {characters: [{id: 'c1', name: '본캐', bosses: [], weeklyActivities: []}]};
context.__invalidLinkProfile = {ocid: '0123456789abcdef0123456789abcdef', resources: {basic: {ok: false}}, character: {name: ''}};
assert.throws(() => run("applyNexonLinkProfileState(__invalidLinkState, 'c1', __invalidLinkProfile)"), /기본정보/);
assert.equal(run("!!__invalidLinkState.characters[0].nexonCharacter"), false);
const nexonSyncSource = source.slice(source.indexOf('async function syncNexonCharacter'), source.indexOf('async function syncAllNexonCharacters'));
assert.ok(nexonSyncSource.indexOf("fetchNexonProfile('', characterName)") < nexonSyncSource.indexOf("fetchNexonScheduler(linkedCharacter, '', requestDate)"));
assert.match(nexonSyncSource, /schedulerWarning: warning/);
assert.match(source, /nexonApiState = nexonLinkUiState\(result, character\.id\)/);
assert.match(source, /schedulerRestricted \|\| schedulerWarning \? '주간 자동 확인 준비 중'/);
assert.match(source, /const badge = linked \? '<span class="nexon-link-badge linked">연동됨<\/span>'/);
const localMemory = new Map();
context.localStorage = {
  getItem(key) { return localMemory.has(key) ? localMemory.get(key) : null; },
  setItem(key, value) { localMemory.set(key, String(value)); },
  removeItem(key) { localMemory.delete(key); }
};
run('render = () => {}; message = () => {}');
run("nexonCredentialAuthBridge = {isSignedIn:()=>true,getAccessToken:async()=>'test-supabase-session-token'}");
const prepareNexonLinkState = () => {
  localMemory.clear();
  run("state = emptyState(new Date('2026-09-25T12:00:00')); state.characters = [{id:'c1',name:'본캐',bosses:[],weeklyActivities:[]}]; selectedWeek=''; storageBlocked=false; savedRaw=JSON.stringify(state)");
  localMemory.set('maple-income-vercel-v1', run('savedRaw'));
};
for (const status of [400, 403, 429, 500]) {
  prepareNexonLinkState();
  context.fetch = async target => {
    const url = String(target);
    if (url.startsWith('/api/nexon-character?')) return {ok: true, status: 200, json: async () => structuredClone(context.__linkProfileResponse)};
    if (url.startsWith('/api/nexon-scheduler?')) return {ok: false, status, json: async () => ({
      ok: false,
      code: status === 400 ? 'OPENAPI00003' : `SCHEDULER_${status}`,
      message: status === 400 ? 'NEXON scheduler에서 이 캐릭터를 조회할 수 없습니다.' : 'scheduler failed',
      ...(status === 400 ? {category: 'invalid_identifier', source: 'nexon_upstream', upstreamMessage: 'invalid identifier'} : {})
    })};
    throw new Error('unexpected client path: ' + url);
  };
  const result = await run("syncNexonCharacter('c1',{characterName:'넥슨본캐'})");
  assert.equal(result.schedulerWarning.status, status);
  if (status === 400) {
    assert.equal(result.schedulerWarning.code, 'OPENAPI00003');
    assert.equal(result.schedulerWarning.category, 'invalid_identifier');
    assert.equal(result.schedulerWarning.source, 'nexon_upstream');
    assert.equal(result.schedulerWarning.upstreamMessage, 'invalid identifier');
    assert.match(result.schedulerWarning.message, /이 캐릭터를 조회할 수 없습니다/);
  }
  assert.equal(run("state.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
  assert.equal(run("state.characters[0].nexonCharacter.characterName"), '넥슨본캐');
}
prepareNexonLinkState();
context.fetch = async target => {
  const url = String(target);
  if (url.startsWith('/api/nexon-character?')) return {ok: true, status: 200, json: async () => structuredClone(context.__linkProfileResponse)};
  if (url.startsWith('/api/nexon-scheduler?')) return {ok: false, status: 400, json: async () => ({
    ok: false,
    code: 'OPENAPI00004',
    message: 'NEXON scheduler 요청 파라미터가 유효하지 않습니다.',
    category: 'invalid_parameter',
    source: 'nexon_upstream',
    upstreamMessage: 'Please input valid parameter'
  })};
  throw new Error('unexpected client path: ' + url);
};
const restrictedLinkResult = await run("syncNexonCharacter('c1',{characterName:'넥슨본캐'})");
assert.equal(run("state.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
assert.equal(restrictedLinkResult.schedulerWarning.applicationCategory, '');
assert.equal(restrictedLinkResult.schedulerWarning.code, 'OPENAPI00004');
assert.equal(restrictedLinkResult.schedulerWarning.category, 'invalid_parameter');
assert.equal(restrictedLinkResult.schedulerWarning.source, 'nexon_upstream');
assert.equal(restrictedLinkResult.schedulerWarning.upstreamMessage, 'Please input valid parameter');
assert.equal(run("state.characters[0].nexonCharacter.characterName"), '넥슨본캐');
assert.equal(run("state.characters[0].nexonCharacter.level"), 286);
for (const failedProfile of [
  {ok: false, status: 404, body: {ok: false, code: 'CHARACTER_NOT_FOUND', message: '캐릭터를 찾지 못했습니다.'}},
  {ok: false, status: 502, body: {ok: false, code: 'PROFILE_REQUEST_FAILED', message: '캐릭터 정보를 확인하지 못했습니다.'}}
]) {
  prepareNexonLinkState();
  context.fetch = async () => ({ok: failedProfile.ok, status: failedProfile.status, json: async () => failedProfile.body});
  await assert.rejects(run("syncNexonCharacter('c1',{characterName:'없는캐릭터'})"));
  assert.equal(run("!!state.characters[0].nexonCharacter"), false);
}
prepareNexonLinkState();
run("state.characters[0].nexonCharacter = normalizeNexonCharacter({...__linkProfileResponse.character,characterName:__linkProfileResponse.character.name,ocid:__linkProfileResponse.ocid,profileCheckedAt:'2026-09-25T00:00:00.000Z',statsCheckedAt:'2026-09-25T00:00:00.000Z',lastCheckedAt:'2026-09-24T00:00:00.000Z'}); savedRaw=JSON.stringify(state)");
localMemory.set('maple-income-vercel-v1', run('savedRaw'));
context.fetch = async target => {
  const url = String(target);
  if (url.startsWith('/api/nexon-scheduler?')) return {ok: true, status: 200, json: async () => ({ok: true, mode: 'live', fetchedAt: '2026-09-25T01:00:00.000Z', character: {ocid: '0123456789abcdef0123456789abcdef', name: '넥슨본캐', world: '루나'}, bosses: [], activities: [], diagnostics: {samples: [], activitySamples: []}})};
  if (url.startsWith('/api/nexon-character?')) return {ok: true, status: 200, json: async () => structuredClone(context.__linkProfileResponse)};
  throw new Error('unexpected client path: ' + url);
};
const existingLinkedResult = await run("syncNexonCharacter('c1',{ignoreCooldown:true})");
assert.equal(existingLinkedResult.schedulerWarning, undefined);
assert.equal(run("state.characters[0].nexonCharacter.ocid"), '0123456789abcdef0123456789abcdef');
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
assert.match(html, /<details id="nexonDiagnostics" class="nexon-diagnostics hidden"><summary><span>문제가 있나요\?<\/span><b>고급 진단 정보 보기<\/b><\/summary>/);
assert.doesNotMatch(html, /<details id="nexonDiagnostics"[^>]*\sopen(?:\s|=|>)/);
assert.match(html, /id="nexonCharacterConnectionState"/);
assert.match(html, /id="nexonCredentialConnectionState"/);
assert.match(html, /id="nexonAutomationConnectionState"/);
assert.match(html, /id="nexonAutomationNotice" class="nexon-automation-notice hidden"/);
assert.match(html, /id="nexonLastChecked"/);
assert.match(html, /id="weeklyActivityList"/);
assert.match(html, /주간 콘텐츠/);
assert.match(html, /계정 공용 콘텐츠와 선택한 캐릭터의 콘텐츠/);
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
assert.doesNotMatch(css, /\.character-income-grid\{|\.stat-detail-toggle\{/);
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
assert.match(css, /\.top,main\{width:min\(1400px,calc\(100% - 64px\)\);margin-left:auto;margin-right:auto/);
assert.match(css, /@media\(min-width:600px\)\{[\s\S]*\.metric-grid\{grid-template-columns:repeat\(4,1fr\)\}/);
assert.match(css, /#characterList\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /@media\(min-width:1280px\)\{[\s\S]*\.home-content-grid\{display:grid;grid-template-columns:minmax\(0,1fr\) clamp\(380px,29vw,440px\);align-items:start;gap:14px\}/);
assert.match(css, /\.home-side-rail\{display:grid;align-content:start;gap:14px;min-width:0\}/);
assert.match(css, /\.home-content-grid #characterList\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
assert.match(css, /\.character-summary-card\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"profile" "spec" "progress" "detail"\}/);
assert.match(css, /\.character-home-spec\{grid-template-columns:minmax\(0,1fr\)\}/);
assert.doesNotMatch(css, /\.home-side-rail\{[^}]*position:sticky/);
assert.match(css, /\.home-characters-panel>\.full\{display:block;width:auto;min-width:160px;margin-left:auto\}/);
assert.match(css, /\.character-hub\{width:min\(1220px,100%\);margin-left:auto;margin-right:auto\}/);
assert.match(html, /class="home-content-grid"/);
assert.match(html, /class="home-side-rail" aria-label="홈 보조 정보"/);
assert.match(html, /class="panel home-characters-panel"/);
assert.ok(html.indexOf('class="panel home-characters-panel"') < html.indexOf('class="panel weekly-content-panel"'));
assert.ok(html.indexOf('class="panel weekly-content-panel"') < html.indexOf('class="panel home-recent-panel"'));
const desktopContentWidth = viewport => Math.min(1400, viewport - 184 - 64);
assert.deepEqual([1000, 1280, 1440, 1920].map(desktopContentWidth), [752, 1032, 1192, 1400]);
const desktopRailWidth = viewport => Math.min(440, Math.max(380, viewport * .29));
assert.deepEqual([1280, 1440, 1920].map(viewport => Math.round(desktopRailWidth(viewport))), [380, 418, 440]);
for (const viewport of [390, 430, 768]) assert.ok(viewport < 1000, `${viewport}px keeps the existing mobile/tablet stack`);
assert.match(css, /grid-template-areas:"profile spec" "progress progress" "detail detail"/);
assert.match(css, /\.character\{grid-template-columns:minmax\(0,1fr\) minmax\(150px,\.75fr\);[^}]*padding:10px 14px/);
assert.match(css, /\.character-spec\{grid-area:spec;[^}]*padding:0;border:0/);
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
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-stat-groups\{grid-template-columns:1fr/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-hub-overview\{grid-template-columns:1fr\}/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-hub-picker select\{width:100%;min-height:44px\}/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.sale-entry-grid,\.sale-result-grid\{grid-template-columns:1fr\}/);
assert.match(css, /\.character-spec\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.character-spec b\{[^}]*overflow-wrap:anywhere/);
assert.match(css, /\.boss-profile-identity\{[^}]*min-width:0/);
assert.match(source, /data-nexon-profile-image/);
assert.doesNotMatch(source, /classList\.add\('image-failed'\)/);
assert.match(source, /if \(avatar\) avatar\.hidden = true/);
assert.match(source, /nexonProfileAvatar\(character, 'summary-art'\)/);
assert.match(source, /function renderHomeCharacterCard\(character, data\)/);
assert.match(source, /function renderCharacterHubOverview\(character, data\)/);
assert.match(source, /function renderCharacterHubStats\(character\)/);
assert.match(source, /function renderCharacterHubContent\(character, data\)/);
assert.doesNotMatch(source, /expandedStatCharacterIds|data-stat-toggle/);
assert.match(source, /class="character-progress-head"/);
assert.match(source, /<small>보스 \$\{stats\.done\} \/ \$\{stats\.count\}<\/small>/);
assert.match(source, /<small>보스 수익<\/small>/);
assert.match(source, /data-character-detail/);
assert.match(source, /function saleAmounts\(quantity, unitPrice, feeRate\)/);
assert.match(source, /feeAmount = Math\.floor\(grossSale \/ 100\) \* percent \+ Math\.floor\(\(grossSale % 100\) \* percent \/ 100\)/);
assert.match(source, /type: 'sale'/);
assert.match(source, /grossIncome: sale\.grossSale, netIncome: sale\.netSale/);
assert.match(source, /if \(r\.netSale != null\) return n\(r\.netSale\)/);
const incomeEditSource = source.slice(source.indexOf('function saveIncomeEdit'), source.indexOf('function init'));
assert.match(incomeEditSource, /saleAmounts\(qty, price, feeRate\)/);
assert.match(incomeEditSource, /\.\.\.sale, grossIncome: sale\.grossSale, netIncome: sale\.netSale/);
assert.doesNotMatch(source, /fetch\(['"]\/api\/character-hub/);
assert.match(source, /nexonProfileAvatar\(c, 'boss-art'\)/);
assert.match(source, /nexonProfileAvatar\(character, 'settings-avatar'\)/);
assert.match(source, /delete next\.characters\.find\(item => item\.id === character\.id\)\.nexonCharacter/);
assert.match(source, /<details class="nexon-diagnostic-group tone-\$\{nexonDiagnosticGroupTone\(key\)\}"><summary>/);
assert.doesNotMatch(source, /<details class="nexon-diagnostic-group[^\"]*" open/);
const diagnosticsRenderSource = source.slice(source.indexOf('function renderNexonDiagnostics'), source.indexOf('function renderNexonSettings'));
assert.ok(diagnosticsRenderSource.indexOf('${completedHtml}') < diagnosticsRenderSource.indexOf('${summaryHtml}'));
assert.ok(diagnosticsRenderSource.indexOf('${samplesHtml}') > diagnosticsRenderSource.indexOf('${groupHtml'));
assert.match(diagnosticsRenderSource, /'실제 매칭 오류'/);
assert.match(diagnosticsRenderSource, /'선택하지 않은 난이도'/);
assert.match(diagnosticsRenderSource, /'로컬 미등록'/);
assert.match(diagnosticsRenderSource, /'지원 대상 외'/);
assert.doesNotMatch(diagnosticsRenderSource, /\['매칭 실패'/);
assert.match(css, /\.nexon-diagnostic-group\.tone-error>summary strong/);
assert.match(css, /\.nexon-diagnostic-group\.tone-info>summary strong/);
assert.match(css, /\.nexon-diagnostic-group\.tone-protected>summary strong/);
assert.match(diagnosticsRenderSource, /result\.schedulerWarning\.code/);
assert.match(diagnosticsRenderSource, /result\.schedulerWarning\.category/);
assert.match(diagnosticsRenderSource, /result\.schedulerWarning\.source/);
assert.match(diagnosticsRenderSource, /result\.schedulerWarning\.upstreamMessage/);
assert.match(source, /data-nexon-action="link"/);
assert.match(source, /data-nexon-action="unlink"/);
const nexonSettingsStart = html.indexOf('<section class="settings-section nexon-section">');
const nexonSettingsHtml = html.slice(nexonSettingsStart, html.indexOf('</section>', nexonSettingsStart) + '</section>'.length);
assert.match(nexonSettingsHtml, /문제가 생기면 고급 진단 정보에서 자세한 내용을 확인할 수 있습니다/);
assert.match(nexonSettingsHtml, /자동 확인 요청이 실패해도 캐릭터 연동과 수동 보스 체크는 계속 사용할 수 있습니다/);
assert.doesNotMatch(nexonSettingsHtml, /서버 API Key와 연결된 NEXON 계정|일부 계정에서 사용할 수 없습니다/);
assert.match(nexonSettingsHtml, /id="nexonCredentialInput"[^>]+type="password"/);
assert.doesNotMatch(nexonSettingsHtml, /value="[^\"]+"[^>]*id="nexonCredentialInput"/);
assert.match(nexonSettingsHtml, /<summary>API Key 발급 방법<\/summary>/);
assert.match(nexonSettingsHtml, /href="https:\/\/openapi\.nexon\.com\/"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
assert.match(nexonSettingsHtml, /NEXON 계정 비밀번호는 절대 입력하지 마세요/);
assert.match(nexonSettingsHtml, /placeholder="발급받은 API Key를 붙여넣어주세요"/);
assert.match(nexonSettingsHtml, /NEXON Open API Key<\/label>/);
assert.match(nexonSettingsHtml, /등록된 API Key 원문은 보안을 위해 다시 표시하지 않습니다/);
assert.match(nexonSettingsHtml, /메기 계정에 로그인하면[\s\S]*NEXON Open API Key를 안전하게 등록할 수 있습니다/);
assert.doesNotMatch(nexonSettingsHtml, /NEXON 계정 비밀번호[^<]*(?:input|입력란)/);
const originalNexonKey = process.env.NEXON_OPEN_API_KEY;
delete process.env.NEXON_OPEN_API_KEY;
let missingProfileKeyStatus = 0, missingProfileKeyBody = null;
await nexonCharacterHandler(
  {method: 'GET', query: {ocid: schedulerResponse.character.ocid}},
  {status(code) { missingProfileKeyStatus = code; return this; }, json(body) { missingProfileKeyBody = body; return this; }, setHeader() {}}
);
assert.equal(missingProfileKeyStatus, 503);
assert.equal(missingProfileKeyBody.code, 'NOT_CONFIGURED');
const schedulerPersonalKey = 'personal-scheduler-key-value';
const schedulerTestHandler = nexonProxyInternals.createSchedulerHandler({
  createAdminClient: () => ({}),
  authenticateRequest: async () => ({id: 'scheduler-user-one'}),
  loadUserNexonCredential: async () => ({apiKey: schedulerPersonalKey, credentialRevision: 'revision-one'})
});
const ownershipTestHandler = nexonAccountOwnershipInternals.createAccountOwnershipHandler({
  createAdminClient: () => ({}),
  authenticateRequest: async () => ({id: 'scheduler-user-one'}),
  loadUserNexonCredential: async () => ({apiKey: schedulerPersonalKey, credentialRevision: 'revision-one'})
});
function nexonApiTestResponse() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}
const schedulerAuthAdmin = {
  auth: {getUser: async token => token === 'valid-scheduler-session'
    ? {data: {user: {id: 'scheduler-user-one'}}, error: null}
    : {data: {user: null}, error: {message: 'invalid token'}}}
};
const authenticatedSchedulerHandler = nexonProxyInternals.createSchedulerHandler({
  createAdminClient: () => schedulerAuthAdmin,
  loadUserNexonCredential: async () => ({apiKey: schedulerPersonalKey, credentialRevision: 'revision-one'})
});
const schedulerSignedOutResponse = nexonApiTestResponse();
await authenticatedSchedulerHandler({method: 'GET', headers: {}, query: {ocid: schedulerResponse.character.ocid}}, schedulerSignedOutResponse);
assert.equal(schedulerSignedOutResponse.statusCode, 401);
assert.equal(schedulerSignedOutResponse.body.code, 'AUTH_REQUIRED');
assert.equal(schedulerSignedOutResponse.body.category, 'auth_required');

let publicFallbackUsed = false;
process.env.NEXON_OPEN_API_KEY = 'must-not-be-used-as-scheduler-fallback';
const missingCredentialHandler = nexonProxyInternals.createSchedulerHandler({
  createAdminClient: () => schedulerAuthAdmin,
  loadUserNexonCredential: async () => { throw Object.assign(new Error('주간 자동 확인을 사용하려면 NEXON 개인 API Key를 등록해주세요.'), {
    status: 409, code: 'NEXON_CREDENTIAL_REQUIRED', category: 'credential_required', source: 'credential_store'
  }); }
});
const fetchBeforeMissingCredential = globalThis.fetch;
globalThis.fetch = async () => { publicFallbackUsed = true; throw new Error('upstream must not run'); };
try {
  const missingCredentialResponse = nexonApiTestResponse();
  await missingCredentialHandler({method: 'GET', headers: {authorization: 'Bearer valid-scheduler-session'}, query: {ocid: schedulerResponse.character.ocid}}, missingCredentialResponse);
  assert.equal(missingCredentialResponse.statusCode, 409);
  assert.equal(missingCredentialResponse.body.code, 'NEXON_CREDENTIAL_REQUIRED');
  assert.equal(missingCredentialResponse.body.category, 'credential_required');
  assert.equal(publicFallbackUsed, false);
} finally {
  globalThis.fetch = fetchBeforeMissingCredential;
}
const authenticatedOwnershipHandler = nexonAccountOwnershipInternals.createAccountOwnershipHandler({
  createAdminClient: () => schedulerAuthAdmin,
  loadUserNexonCredential: async () => ({apiKey: schedulerPersonalKey, credentialRevision: 'revision-one'})
});
const ownershipSignedOutResponse = nexonApiTestResponse();
await authenticatedOwnershipHandler({method: 'GET', headers: {}, query: {ocid: schedulerResponse.character.ocid}}, ownershipSignedOutResponse);
assert.equal(ownershipSignedOutResponse.statusCode, 401);
assert.equal(ownershipSignedOutResponse.body.code, 'AUTH_REQUIRED');
const schedulerFetchBeforeDiagnosticTest = globalThis.fetch;
const consoleErrorBeforeDiagnosticTest = console.error;
let capturedSchedulerTarget = '';
let capturedSchedulerOptions = null;
let capturedSchedulerLog = null;
try {
  console.error = (label, metadata) => { capturedSchedulerLog = {label, metadata}; };
  globalThis.fetch = async (target, options) => {
    capturedSchedulerTarget = String(target);
    capturedSchedulerOptions = options;
    return {ok: false, status: 400, json: async () => ({
      error: {name: 'OPENAPI00003', message: `invalid identifier ${schedulerResponse.character.ocid}`},
      apiKey: 'must-not-escape', headers: {authorization: 'must-not-escape'}
    })};
  };
  let diagnosticStatus = 0, diagnosticBody = null;
  await schedulerTestHandler(
    {method: 'GET', query: {ocid: schedulerResponse.character.ocid}},
    {status(code) { diagnosticStatus = code; return this; }, json(body) { diagnosticBody = body; return this; }, setHeader() {}}
  );
  assert.equal(diagnosticStatus, 400);
  assert.equal(diagnosticBody.code, 'OPENAPI00003');
  assert.equal(diagnosticBody.category, 'invalid_identifier');
  assert.equal(diagnosticBody.source, 'nexon_upstream');
  assert.match(diagnosticBody.message, /캐릭터 식별자를 확인하지 못했습니다/);
  assert.doesNotMatch(JSON.stringify(diagnosticBody), /must-not-escape|0123456789abcdef/);
  const capturedUrl = new URL(capturedSchedulerTarget);
  assert.equal(capturedUrl.searchParams.get('ocid'), schedulerResponse.character.ocid);
  assert.equal(capturedUrl.searchParams.has('date'), false);
  assert.equal(capturedSchedulerOptions.headers['x-nxopen-api-key'], schedulerPersonalKey);
  assert.equal(capturedSchedulerLog.label, 'NEXON scheduler upstream request failed');
  assert.deepEqual(capturedSchedulerLog.metadata, {
    endpoint: 'scheduler/character-state', mode: 'live', hasOcid: true, hasDate: false,
    status: 400, upstreamCode: 'OPENAPI00003', upstreamMessage: 'invalid identifier [식별자 숨김]', category: 'invalid_identifier'
  });
  assert.doesNotMatch(JSON.stringify(capturedSchedulerLog), /personal-scheduler-key-value|0123456789abcdef|must-not-escape/);
} finally {
  globalThis.fetch = schedulerFetchBeforeDiagnosticTest;
  console.error = consoleErrorBeforeDiagnosticTest;
}
async function invokeSchedulerUpstreamError(query, upstreamError, status = 400) {
  const previousFetch = globalThis.fetch, previousConsoleError = console.error;
  let target = '', log = null, responseStatus = 0, body = null;
  try {
    console.error = (label, metadata) => { log = {label, metadata}; };
    globalThis.fetch = async value => {
      target = String(value);
      return {ok: false, status, json: async () => ({error: upstreamError})};
    };
    await schedulerTestHandler(
      {method: 'GET', query},
      {status(code) { responseStatus = code; return this; }, json(value) { body = value; return this; }, setHeader() {}}
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
  return {target, log, status: responseStatus, body};
}
const invalidParameterResult = await invokeSchedulerUpstreamError(
  {ocid: schedulerResponse.character.ocid},
  {name: 'OPENAPI00004', message: 'Please input valid parameter'}
);
assert.equal(invalidParameterResult.status, 400);
assert.equal(invalidParameterResult.body.code, 'OPENAPI00004');
assert.equal(invalidParameterResult.body.category, 'invalid_parameter');
assert.equal(invalidParameterResult.body.source, 'nexon_upstream');
assert.equal(invalidParameterResult.body.upstreamMessage, 'Please input valid parameter');
assert.equal(invalidParameterResult.body.message, 'NEXON Scheduler 요청 파라미터를 확인해주세요.');
assert.equal(new URL(invalidParameterResult.target).searchParams.has('date'), false);
assert.equal(invalidParameterResult.log.metadata.mode, 'live');
assert.equal(invalidParameterResult.log.metadata.hasDate, false);
const invalidKeyResult = await invokeSchedulerUpstreamError(
  {ocid: schedulerResponse.character.ocid},
  {name: 'OPENAPI00005', message: 'invalid api key'}
);
assert.equal(invalidKeyResult.body.code, 'OPENAPI00005');
assert.equal(invalidKeyResult.body.category, 'invalid_api_key');
assert.match(invalidKeyResult.body.message, /API Key 설정을 확인/);
const kstYesterdayParts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(Date.now() - 86_400_000)).map(part => [part.type, part.value]));
const kstYesterday = `${kstYesterdayParts.year}-${kstYesterdayParts.month}-${kstYesterdayParts.day}`;
const historicalErrorResult = await invokeSchedulerUpstreamError(
  {ocid: schedulerResponse.character.ocid, date: kstYesterday},
  {name: 'OPENAPI00004', message: 'Please input valid parameter'}
);
assert.equal(new URL(historicalErrorResult.target).searchParams.get('date'), kstYesterday);
assert.equal(historicalErrorResult.log.metadata.mode, 'historical');
assert.equal(historicalErrorResult.log.metadata.hasDate, true);
const identityFetchBeforeTest = globalThis.fetch, consoleErrorBeforeIdentityTest = console.error;
const identityTargets = [];
const identityOptions = [];
try {
  console.error = () => {};
  globalThis.fetch = async (value, options) => {
    const target = new URL(String(value));
    identityTargets.push(target);
    identityOptions.push(options);
    if (target.pathname.endsWith('/maplestory/v1/id')) return {ok: true, status: 200, json: async () => ({ocid: schedulerResponse.character.ocid})};
    return {ok: false, status: 400, json: async () => ({error: {name: 'OPENAPI00004', message: 'Please input valid parameter'}})};
  };
  let identityStatus = 0;
  await schedulerTestHandler(
    {method: 'GET', query: {characterName: '넥슨본캐'}},
    {status(code) { identityStatus = code; return this; }, json() { return this; }, setHeader() {}}
  );
  assert.equal(identityStatus, 400);
  assert.equal(identityTargets[0].pathname, '/maplestory/v1/id');
  assert.equal(identityTargets[0].searchParams.get('character_name'), '넥슨본캐');
  assert.equal(identityTargets[1].pathname, '/maplestory/v1/scheduler/character-state');
  assert.equal(identityTargets[1].searchParams.get('ocid'), schedulerResponse.character.ocid);
  assert.equal(identityTargets[1].searchParams.has('date'), false);
  assert.equal(identityOptions[0].headers['x-nxopen-api-key'], schedulerPersonalKey);
  assert.equal(identityOptions[1].headers['x-nxopen-api-key'], schedulerPersonalKey);
} finally {
  globalThis.fetch = identityFetchBeforeTest;
  console.error = consoleErrorBeforeIdentityTest;
}
assert.equal(nexonProxyInternals.kstDateOffset(-1, new Date('2026-10-01T15:30:00.000Z')), '2026-10-01');
assert.equal(nexonProxyInternals.validDate(nexonProxyInternals.kstDateOffset(-1)), true);
async function invokeSchedulerComparison({liveOk = false, historicalOk = true} = {}) {
  const previousFetch = globalThis.fetch, previousConsoleError = console.error;
  const targets = [];
  let status = 0, body = null;
  try {
    console.error = () => {};
    globalThis.fetch = async value => {
      const target = new URL(String(value));
      targets.push(target);
      const historical = target.searchParams.has('date');
      const ok = historical ? historicalOk : liveOk;
      if (ok) return {ok: true, status: 200, json: async () => ({date: historical ? target.searchParams.get('date') : '2026-10-02', boss_contents: [{content_name: '스우'}], weekly_contents: [{content_name: '에픽 던전'}]})};
      return {ok: false, status: 400, json: async () => ({
        error: {name: 'OPENAPI00004', message: `Please input valid parameter ${schedulerResponse.character.ocid}`},
        apiKey: 'must-not-escape'
      })};
    };
    await schedulerTestHandler(
      {method: 'GET', query: {ocid: schedulerResponse.character.ocid, diagnostic: 'compare'}},
      {status(code) { status = code; return this; }, json(value) { body = value; return this; }, setHeader() {}}
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
  return {targets, status, body};
}
const liveFailureComparison = await invokeSchedulerComparison({liveOk: false, historicalOk: true});
assert.equal(liveFailureComparison.status, 200);
assert.equal(liveFailureComparison.targets.length, 2);
assert.equal(liveFailureComparison.targets[0].searchParams.has('date'), false);
assert.equal(liveFailureComparison.targets[1].searchParams.get('date'), nexonProxyInternals.kstDateOffset(-1));
assert.match(liveFailureComparison.targets[1].searchParams.get('date'), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(liveFailureComparison.body.live.ok, false);
assert.equal(liveFailureComparison.body.live.code, 'OPENAPI00004');
assert.equal(liveFailureComparison.body.live.category, 'invalid_parameter');
assert.equal(liveFailureComparison.body.live.source, 'nexon_upstream');
assert.equal(liveFailureComparison.body.yesterday.ok, true);
assert.equal(liveFailureComparison.body.yesterday.mode, 'historical');
assert.equal(liveFailureComparison.body.yesterday.bossCount, 1);
assert.equal(liveFailureComparison.body.yesterday.weeklyContentCount, 1);
assert.doesNotMatch(JSON.stringify(liveFailureComparison.body), /personal-scheduler-key-value|must-not-escape|0123456789abcdef/);
assert.equal(run("nexonSchedulerDiagnosticSummary({live:{ok:false},yesterday:{ok:true}})"), '실시간 조회에서만 오류가 발생했습니다.');
const historicalFailureComparison = await invokeSchedulerComparison({liveOk: true, historicalOk: false});
assert.equal(historicalFailureComparison.body.live.ok, true);
assert.equal(historicalFailureComparison.body.yesterday.ok, false);
assert.equal(run("nexonSchedulerDiagnosticSummary({live:{ok:true},yesterday:{ok:false}})"), '과거 날짜 조회에서만 오류가 발생했습니다.');
const bothFailureComparison = await invokeSchedulerComparison({liveOk: false, historicalOk: false});
assert.equal(bothFailureComparison.body.live.code, 'OPENAPI00004');
assert.equal(bothFailureComparison.body.yesterday.code, 'OPENAPI00004');
assert.equal(run("nexonSchedulerDiagnosticSummary({live:{ok:false},yesterday:{ok:false}})"), '실시간 및 과거 날짜 조회 모두 오류가 발생했습니다.');
assert.equal(run("nexonSchedulerDiagnosticSummary({live:{ok:true},yesterday:{ok:true}})"), '두 Scheduler 조회가 모두 정상입니다.');
assert.notEqual(
  nexonProxyInternals.schedulerCacheKey('user-one', 'revision-one', schedulerResponse.character.ocid, ''),
  nexonProxyInternals.schedulerCacheKey('user-two', 'revision-one', schedulerResponse.character.ocid, '')
);
assert.notEqual(
  nexonProxyInternals.schedulerCacheKey('user-one', 'revision-one', schedulerResponse.character.ocid, ''),
  nexonProxyInternals.schedulerCacheKey('user-one', 'revision-two', schedulerResponse.character.ocid, '')
);
nexonProxyInternals.clearSchedulerCache();
const isolatedCacheKeys = [];
const isolatedCacheHandler = nexonProxyInternals.createSchedulerHandler({
  createAdminClient: () => ({}),
  authenticateRequest: async req => ({id: req.headers.authorization.endsWith('one') ? 'cache-user-one' : 'cache-user-two'}),
  loadUserNexonCredential: async (_client, userId) => ({apiKey: `personal-key-${userId}`, credentialRevision: `revision-${userId}`})
});
const fetchBeforeCacheIsolation = globalThis.fetch;
globalThis.fetch = async (_target, options) => {
  isolatedCacheKeys.push(options.headers['x-nxopen-api-key']);
  return {ok: true, status: 200, json: async () => ({date: '2026-10-02', character_name: '선택캐릭터', world_name: '루나', boss_contents: [], weekly_contents: []})};
};
try {
  for (const token of ['one', 'one', 'two']) {
    const response = nexonApiTestResponse();
    await isolatedCacheHandler({method: 'GET', headers: {authorization: `Bearer ${token}`}, query: {ocid: schedulerResponse.character.ocid}}, response);
    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(JSON.stringify(response.body), /personal-key-cache-user/);
  }
} finally {
  globalThis.fetch = fetchBeforeCacheIsolation;
  nexonProxyInternals.clearSchedulerCache();
}
assert.deepEqual(isolatedCacheKeys, ['personal-key-cache-user-one', 'personal-key-cache-user-two']);
const diagnosticRunnerSource = source.slice(source.indexOf('async function runNexonSchedulerDiagnosticComparison'), source.indexOf('async function fetchNexonProfile'));
assert.doesNotMatch(diagnosticRunnerSource, /transaction\(|lastCheckedAt|applyNexonSchedulerState|saveState|cloud/i);
assert.match(diagnosticRunnerSource, /fetchNexonSchedulerComparison/);
assert.match(diagnosticRunnerSource, /fetchNexonAccountOwnership/);
assert.match(html, /id="runNexonSchedulerDiagnostic"/);
assert.match(html, /id="nexonSchedulerDiagnosticResults"/);
assert.match(css, /\.nexon-scheduler-diagnostic-results\{display:grid/);
const selectedOcid = schedulerResponse.character.ocid;
const nestedOwnershipPayload = {
  account_list: [
    {account_id: 'account-one-secret', character_list: [{ocid: 'aaaaaaaaaaaaaaaa', character_name: '다른캐릭터'}]},
    {account_id: 'account-two-secret', character_list: [{ocid: selectedOcid, character_name: '선택캐릭터'}, {ocid: 'bbbbbbbbbbbbbbbb', character_name: '부캐'}]}
  ]
};
const ownedSummary = nexonAccountOwnershipInternals.summarizeOwnership(nestedOwnershipPayload, selectedOcid);
assert.deepEqual(ownedSummary, {
  ok: true,
  characterOwnedByServerKey: true,
  accountCount: 2,
  characterCount: 3,
  applicationCategory: '',
  checkedAt: ownedSummary.checkedAt
});
const ownershipMismatch = nexonAccountOwnershipInternals.summarizeOwnership(nestedOwnershipPayload, 'cccccccccccccccc');
assert.equal(ownershipMismatch.characterOwnedByServerKey, false);
assert.equal(ownershipMismatch.applicationCategory, 'scheduler_account_restriction');
assert.throws(() => nexonAccountOwnershipInternals.summarizeOwnership({}, selectedOcid), /응답 구조/);
async function invokeAccountOwnership(payload, {ok = true, status = 200} = {}) {
  const previousFetch = globalThis.fetch, previousConsoleError = console.error;
  let target = '', requestOptions = null, responseStatus = 0, body = null;
  try {
    console.error = () => {};
    globalThis.fetch = async (value, options) => {
      target = String(value);
      requestOptions = options;
      return {ok, status, json: async () => payload};
    };
    await ownershipTestHandler(
      {method: 'GET', query: {ocid: selectedOcid}},
      {status(code) { responseStatus = code; return this; }, json(value) { body = value; return this; }, setHeader() {}}
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
  }
  return {target, requestOptions, status: responseStatus, body};
}
const ownedAccountResult = await invokeAccountOwnership(nestedOwnershipPayload);
assert.equal(ownedAccountResult.target, 'https://open.api.nexon.com/maplestory/v1/character/list');
assert.equal(ownedAccountResult.requestOptions.headers['x-nxopen-api-key'], schedulerPersonalKey);
assert.equal(ownedAccountResult.status, 200);
assert.equal(ownedAccountResult.body.characterOwnedByServerKey, true);
assert.equal(ownedAccountResult.body.accountCount, 2);
assert.equal(ownedAccountResult.body.characterCount, 3);
assert.doesNotMatch(JSON.stringify(ownedAccountResult.body), /personal-scheduler-key-value|account-one-secret|account-two-secret|선택캐릭터|0123456789abcdef/);
const missingAccountResult = await invokeAccountOwnership({account_list: [{account_id: 'secret-account', character_list: [{ocid: 'dddddddddddddddd'}]}]});
assert.equal(missingAccountResult.body.characterOwnedByServerKey, false);
assert.equal(missingAccountResult.body.applicationCategory, 'scheduler_account_restriction');
assert.match(run("nexonAccountOwnershipCard({ok:true,characterOwnedByServerKey:true,accountCount:2,characterCount:3})"), /확인됨/);
assert.doesNotMatch(run("nexonAccountOwnershipCard({ok:true,characterOwnedByServerKey:true,accountCount:2,characterCount:3})"), /불일치/);
assert.match(run("nexonAccountOwnershipCard({ok:true,characterOwnedByServerKey:false,accountCount:1,characterCount:15,applicationCategory:'scheduler_account_restriction'})"), /개인 API Key 계정 확인/);
assert.match(run("nexonAccountOwnershipCard({ok:true,characterOwnedByServerKey:false,accountCount:1,characterCount:15,applicationCategory:'scheduler_account_restriction'})"), /선택한 캐릭터가 등록한 개인 API Key 계정에 포함되어 있지 않습니다/);
assert.match(run("nexonAccountOwnershipCard({ok:false,status:403,code:'OPENAPI00005',category:'invalid_api_key'})"), /오류/);
const ownershipErrorResult = await invokeAccountOwnership({error: {name: 'OPENAPI00005', message: `invalid key ${selectedOcid} x-nxopen-api-key=secret-value`}}, {ok: false, status: 403});
assert.equal(ownershipErrorResult.body.code, 'OPENAPI00005');
assert.equal(ownershipErrorResult.body.category, 'invalid_api_key');
assert.doesNotMatch(JSON.stringify(ownershipErrorResult.body), /secret-value|0123456789abcdef/);
assert.doesNotMatch(nexonAccountOwnershipApiSource, /account_id\s*:/);
let proxyValidationStatus = 0, proxyValidationBody = null;
await schedulerTestHandler(
  {method: 'GET', query: {ocid: 'invalid ocid'}},
  {status(code) { proxyValidationStatus = code; return this; }, json(body) { proxyValidationBody = body; return this; }, setHeader() {}}
);
assert.equal(proxyValidationStatus, 400);
assert.equal(proxyValidationBody.code, 'BAD_REQUEST');
assert.equal(proxyValidationBody.source, 'proxy_validation');
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
  if (path.endsWith('/maplestory/v1/id')) return apiResponse(true, 200, {ocid: schedulerResponse.character.ocid});
  if (path.endsWith('/character/basic')) return apiResponse(true, 200, basicPayload);
  if (path.endsWith('/character/stat')) return failStat
    ? apiResponse(false, 500, {error: {name: 'OPENAPI00001'}})
    : apiResponse(true, 200, statPayload);
  if (path.endsWith('/user/union')) return failUnion
    ? apiResponse(false, 503, {error: {name: 'OPENAPI00011'}})
    : apiResponse(true, 200, unionPayload);
  throw new Error('unexpected NEXON path: ' + path);
};
async function invokeNexonCharacter(query = {ocid: schedulerResponse.character.ocid}) {
  let status = 0, body = null;
  await nexonCharacterHandler(
    {method: 'GET', query},
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
  assert.equal(fullCharacterResponse.body.ocid, schedulerResponse.character.ocid);
  assert.deepEqual(fullCharacterResponse.body.character, {
    name: '넥슨본캐', world: '루나', className: '나이트로드', level: 286, image: 'https://example.com/profile.png',
    combatPower: 284300000, stats: detailStatsFixture, unionLevel: 9450, unionGrade: '그랜드 마스터 유니온'
  });
  assert.deepEqual(fullCharacterResponse.body.warnings, []);

  nexonCharacterInternals.clearCaches();
  const characterNameResponse = await invokeNexonCharacter({characterName: '넥슨본캐'});
  assert.equal(characterNameResponse.status, 200);
  assert.equal(characterNameResponse.body.ocid, schedulerResponse.character.ocid);
  assert.equal(characterNameResponse.body.character.name, '넥슨본캐');

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
assert.match(html, /id="onboardingShell"/);
assert.match(html, /id="appShell"/);
assert.match(html, /data-onboarding-stage="login"/);
assert.match(html, /data-onboarding-stage="credential"/);
assert.match(html, /data-onboarding-stage="character"/);
assert.match(html, /data-onboarding-stage="complete"/);
assert.match(html, /id="onboardingAuthMount"/);
assert.match(html, /id="onboardingCredentialMount"/);
assert.match(html, /id="onboardingCharacterForm"/);
assert.match(html, /id="onboardingCharacterSubmit"[^>]*>캐릭터 확인<\/button>/);
assert.match(source, /onboardingCharacterCandidate/);
assert.match(source, /await fetchNexonProfile\('', characterName\)/);
assert.match(source, /button\.textContent = '이 캐릭터 연결'/);
assert.match(source, /function resolveAppExperience\(/);
assert.equal(run("resolveAppExperience({initialized:true,signedIn:false,cloudReady:true},{})"), 'login');
assert.equal(run("resolveAppExperience({initialized:true,signedIn:true,cloudReady:false,credentialStatus:'loading'},{})"), 'sync');
assert.equal(run("resolveAppExperience({initialized:true,signedIn:true,cloudReady:true,credentialStatus:'ready',hasCredential:false},{})"), 'credential');
assert.equal(run("resolveAppExperience({initialized:true,signedIn:true,cloudReady:true,credentialStatus:'ready',hasCredential:true,linkedCharacterCount:0},{})"), 'character');
assert.equal(run("resolveAppExperience({initialized:true,signedIn:true,cloudReady:true,credentialStatus:'ready',hasCredential:true,linkedCharacterCount:1},{wasOnboarding:false,dismissed:false})"), 'app');
assert.equal(run("resolveAppExperience({initialized:true,signedIn:true,cloudReady:true,credentialStatus:'ready',hasCredential:true,linkedCharacterCount:1},{wasOnboarding:true,dismissed:false})"), 'complete');
assert.match(source, /moveSharedOnboardingUi\(stage\)/);
assert.match(source, /cloudMount\.append\(cloud\)/);
assert.match(source, /credentialMount\.append\(credential\)/);
assert.equal(new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1])).size, [...html.matchAll(/id="([^"]+)"/g)].length);
assert.match(html, /data-tab="summary" class="active" aria-current="page"><span aria-hidden="true">⌂<\/span>홈/);
assert.match(html, /data-tab="boss"/);
assert.match(html, /data-income-action data-navigation-surface="income"/);
assert.match(html, /data-tab="history"/);
assert.match(html, /data-tab="settings"/);
assert.doesNotMatch(html, /data-tab="price"/);
assert.doesNotMatch(html, /data-tab="income"/);
assert.match(html, /data-page="history" id="historyTab"/);
assert.match(html, /data-page="character" id="characterHubTab"/);
assert.match(html, /id="characterHubBack"/);
assert.match(html, /id="characterHubSelect" aria-label="캐릭터 허브 캐릭터 선택"/);
assert.equal((html.match(/data-character-hub-tab=/g) || []).length, 3);
assert.match(html, /data-character-hub-tab="overview"[^>]*aria-selected="true"/);
assert.match(html, /data-character-hub-tab="stats"/);
assert.match(html, /data-character-hub-tab="content"/);
assert.doesNotMatch(html, /data-tab="character"/);
assert.match(html, /id="homeRecentRecords"/);
assert.match(source, /function renderHomeRecent\(data\)/);
assert.match(source, /\.slice\(0, 3\)/);
assert.match(source, /class="home-recent-detail"/);
assert.match(source, /class="home-recent-time"/);
assert.doesNotMatch(source.slice(source.indexOf('function renderHomeRecent'), source.indexOf('function renderHistory')), /data-income-action|data-character-detail/);
assert.ok(html.indexOf('id="incomeForm"') < html.indexOf('data-page="history"'));
assert.ok(html.indexOf('data-page="history"') < html.indexOf('id="historyFilters"'));
assert.match(source, /activatePage\('income', \{updateNavigation: false\}\)/);
assert.match(source, /returnTabAfterIncome = activeMainTab/);
assert.equal(run("navigationSurfaceFor('income', 'summary')"), 'income');
assert.equal(run("navigationSurfaceFor('income', 'boss')"), 'income');
assert.equal(run("navigationSurfaceFor('price', 'history')"), 'history');
assert.equal(run("navigationSurfaceFor('character', 'boss')"), 'summary');
assert.match(source, /function openCharacterHub\(characterId\)[\s\S]*activeCharacterHubTab = 'overview';[\s\S]*activatePage\('character'\)/);
assert.match(source, /#characterHubBack[\s\S]*activatePage\('summary'\)/);
assert.match(source, /#characterHubSelect[\s\S]*selectedHubCharacterId = e\.target\.value; renderCharacterHub\(viewData\(\)\)/);
assert.match(source, /selectedBossCharacterId = character\.id;\s*activatePage\('boss'\);\s*renderBosses\(viewData\(\)\)/);
for (const returnTab of ['summary', 'boss', 'history', 'settings']) {
  run(`activeMainTab=${JSON.stringify(returnTab)};returnTabAfterIncome=activeMainTab`);
  assert.equal(run("navigationSurfaceFor('income')"), 'income');
  assert.equal(run('activeMainTab'), returnTab);
  assert.equal(run('navigationSurfaceFor(returnTabAfterIncome)'), returnTab);
}
const navigationButtons = ['summary', 'boss', 'income', 'history', 'settings'].map(target => {
  const classes = new Set(target === 'summary' ? ['active'] : []);
  return {
    dataset: target === 'income' ? {navigationSurface: target} : {tab: target},
    classList: {toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); }},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
});
context.__navigationButtons = navigationButtons;
run("applyNavigationState(__navigationButtons, 'income')");
assert.equal(navigationButtons.find(button => button.dataset.navigationSurface === 'income').classList.contains('active'), true);
assert.equal(navigationButtons.find(button => button.dataset.navigationSurface === 'income').attributes['aria-current'], 'page');
for (const button of navigationButtons.filter(button => button.dataset.tab)) {
  assert.equal(button.classList.contains('active'), false);
  assert.equal(button.attributes['aria-current'], 'false');
}
run("applyNavigationState(__navigationButtons, 'boss')");
assert.equal(navigationButtons.find(button => button.dataset.tab === 'boss').classList.contains('active'), true);
assert.equal(navigationButtons.find(button => button.dataset.tab === 'boss').attributes['aria-current'], 'page');
assert.equal(navigationButtons.find(button => button.dataset.navigationSurface === 'income').classList.contains('active'), false);
assert.equal(navigationButtons.find(button => button.dataset.navigationSurface === 'income').attributes['aria-current'], 'false');
assert.match(html, /data-settings-route="account"/);
assert.match(html, /data-settings-route="nexon"/);
assert.match(html, /data-settings-route="presets"/);
assert.match(html, /data-settings-route="data"/);
assert.match(html, /data-settings-route="advanced"/);
assert.match(html, /data-settings-route="danger"/);
assert.match(html, /id="settingsDiagnosticsMount"/);
assert.match(css, /\.onboarding-card\{width:min\(100%,540px\)/);
assert.match(css, /\.income-action-tab/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.onboarding-shell/);
assert.match(html, /class="history-desktop-head"/);
assert.match(html, /id="syncBadge" data-sync-state="local"/);
assert.match(source, /function watchSyncBadge\(\)/);
assert.match(source, /클라우드 동기화 완료/);
assert.match(source, /class="record-category"/);
assert.match(source, /class="record-item"/);
assert.match(source, /class="record-detail/);
assert.match(source, /class="record-value"/);
assert.match(source, /class="record-time muted"/);
assert.match(css, /@media\(min-width:1000px\)\{[\s\S]*body\{padding-left:184px\}/);
assert.match(css, /@media\(min-width:1000px\)\{[\s\S]*\.tabs\{top:0;bottom:0;left:0;transform:none;width:184px/);
assert.match(css, /@media\(min-width:1000px\)\{[\s\S]*\.top,main\{width:min\(1400px,calc\(100% - 64px\)\);margin-left:auto;margin-right:auto\}/);
assert.match(css, /\.tabs \.income-action-tab>span\{[^}]*background:transparent/);
assert.match(css, /\.tabs \.income-action-tab\.active\{color:var\(--accent-text\)!important\}/);
assert.match(css, /main>\.week-card\{display:grid;grid-template-columns:auto minmax\(220px,320px\) minmax\(0,1fr\)/);
assert.match(css, /\.boss-cycle-section \.boss-line\{grid-template-columns:minmax\(180px,1fr\) minmax\(260px,330px\) minmax\(90px,130px\)/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.boss-character-tools/);
assert.match(css, /@media\(min-width:1000px\)\{[\s\S]*\.history-desktop-head\{display:grid/);
assert.match(css, /#incomeHistory \.compact-record\{grid-template-columns:88px/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*grid-template-areas:"item menu" "detail menu" "value menu" "time menu"/);
assert.match(html, /class="panel weekly-content-panel"/);
assert.ok(html.indexOf('id="weeklyActivityList"') < html.indexOf('data-page="boss"'));
const bossPageHtml = html.slice(html.indexOf('data-page="boss"'), html.indexOf('data-page="income"'));
assert.doesNotMatch(bossPageHtml, /weeklyActivityList/);
assert.match(bossPageHtml, /<h2>보스<\/h2>/);
assert.match(html, /data-tab="boss"><span aria-hidden="true">✓<\/span>보스<\/button>/);
assert.match(source, /function isMonthlyBoss\(boss\)/);
assert.match(source, /function monthlyBossIncomeForWeek\(boss, weekId = ''\)/);
assert.match(source, /monthlyAutoCompleted/);
assert.match(source, /<small>보스 \$\{stats\.done\} \/ \$\{stats\.count\}<\/small>/);
assert.match(css, /\.boss-cycle-section\{/);
assert.match(css, /\.monthly-cycle\{/);
assert.match(css, /\.weekly-activity-scope-head\{/);
assert.match(css, /\.weekly-activity-progress\.complete\{/);
assert.match(css, /\.weekly-activity-character-picker select\{/);
assert.match(css, /#weeklyActivityList\{display:block\}/);
assert.match(css, /\.weekly-activity-scope\+\.weekly-activity-scope\{[^}]*border-top:1px solid var\(--line\)/);
assert.match(css, /@media\(max-width:430px\)\{[\s\S]*\.character-picker-head\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
assert.match(source, /id="weeklyActivityCharacterSelect"/);
assert.match(source, /data-activity-scope="\$\{scope\}"/);
assert.match(source, /캐릭터를 등록하면 캐릭터별 주간 콘텐츠를 관리할 수 있습니다/);
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

const credentialEncryptionKey = Buffer.alloc(32, 7);
const firstEncryptedCredential = nexonCredentialStoreInternals.encryptCredential('personal-test-api-key-value', 'user-one', credentialEncryptionKey);
const secondEncryptedCredential = nexonCredentialStoreInternals.encryptCredential('personal-test-api-key-value', 'user-one', credentialEncryptionKey);
assert.equal(nexonCredentialStoreInternals.decryptCredential(firstEncryptedCredential, 'user-one', credentialEncryptionKey), 'personal-test-api-key-value');
assert.notEqual(firstEncryptedCredential.iv, secondEncryptedCredential.iv);
assert.notEqual(firstEncryptedCredential.ciphertext, secondEncryptedCredential.ciphertext);
assert.throws(() => nexonCredentialStoreInternals.decryptCredential(firstEncryptedCredential, 'user-two', credentialEncryptionKey));
assert.equal(nexonCredentialStoreInternals.encryptionKey(Buffer.alloc(32, 1).toString('base64')).length, 32);
assert.throws(() => nexonCredentialStoreInternals.encryptionKey('short'), /암호화 키/);
const encryptedSchedulerCredential = nexonCredentialStoreInternals.encryptCredential('personal-scheduler-server-only-key', 'scheduler-user-one', credentialEncryptionKey);
const credentialRowClient = row => ({
  from: () => ({
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({data: row, error: null})
  })
});
const loadedSchedulerCredential = await nexonCredentialStoreInternals.loadUserNexonCredential(
  credentialRowClient({...encryptedSchedulerCredential, updated_at: '2026-10-02T12:00:00.000Z'}),
  'scheduler-user-one',
  credentialEncryptionKey
);
assert.deepEqual(loadedSchedulerCredential, {
  apiKey: 'personal-scheduler-server-only-key',
  credentialRevision: '2026-10-02T12:00:00.000Z'
});
await assert.rejects(
  () => nexonCredentialStoreInternals.loadUserNexonCredential(credentialRowClient(null), 'scheduler-user-one', credentialEncryptionKey),
  error => error.code === 'NEXON_CREDENTIAL_REQUIRED' && error.status === 409
);

function credentialResponse() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}
const authenticatedAdmin = {
  auth: {getUser: async token => token === 'valid-session-token'
    ? {data: {user: {id: 'verified-user-id', email: 'user@example.com'}}, error: null}
    : {data: {user: null}, error: {message: 'invalid token'}}}
};
const createCredentialTestHandler = overrides => nexonCredentialInternals.createCredentialHandler({
  createAdminClient: () => authenticatedAdmin,
  encryptionKey: () => credentialEncryptionKey,
  encryptCredential: (apiKey, userId, key) => nexonCredentialStoreInternals.encryptCredential(apiKey, userId, key),
  verifyNexonApiKey: async () => ({verifiedAt: '2026-10-02T05:00:00.000Z', accountCount: 1, characterCount: 70}),
  loadCredentialStatus: async () => ({ok: true, hasCredential: false}),
  storeCredential: async (_client, _userId, _encrypted, verification) => ({ok: true, hasCredential: true, ...verification}),
  deleteCredential: async () => ({ok: true, hasCredential: false}),
  ...overrides
});
for (const method of ['GET', 'POST', 'DELETE']) {
  const response = credentialResponse();
  await createCredentialTestHandler()({method, headers: {}, body: method === 'POST' ? {apiKey: 'personal-test-api-key-value'} : undefined}, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'AUTH_REQUIRED');
}

let verifiedPersonalKey = '', storedCredential = null;
const validCredentialHandler = createCredentialTestHandler({
  verifyNexonApiKey: async apiKey => {
    verifiedPersonalKey = apiKey;
    return {verifiedAt: '2026-10-02T05:00:00.000Z', accountCount: 2, characterCount: 35};
  },
  storeCredential: async (_client, userId, encrypted, verification) => {
    storedCredential = {userId, encrypted, verification};
    return {ok: true, hasCredential: true, ...verification};
  }
});
const validCredentialResponse = credentialResponse();
await validCredentialHandler({
  method: 'POST', headers: {authorization: 'Bearer valid-session-token'},
  body: {apiKey: 'personal-test-api-key-value', userId: 'attacker-selected-user-id'}
}, validCredentialResponse);
assert.equal(validCredentialResponse.statusCode, 200);
assert.equal(validCredentialResponse.body.hasCredential, true);
assert.equal(verifiedPersonalKey, 'personal-test-api-key-value');
assert.equal(storedCredential.userId, 'verified-user-id');
assert.equal(nexonCredentialStoreInternals.decryptCredential(storedCredential.encrypted, 'verified-user-id', credentialEncryptionKey), 'personal-test-api-key-value');
assert.doesNotMatch(JSON.stringify(validCredentialResponse.body), /personal-test-api-key-value|ciphertext|auth_tag|\biv\b|attacker-selected-user-id/);

let invalidCredentialWriteCount = 0;
const invalidCredentialHandler = createCredentialTestHandler({
  verifyNexonApiKey: async () => { throw Object.assign(new Error('invalid'), {
    status: 403,
    publicError: {ok: false, code: 'OPENAPI00005', message: 'NEXON Open API Key를 확인해주세요.'}
  }); },
  storeCredential: async () => { invalidCredentialWriteCount++; }
});
const originalConsoleErrorForCredential = console.error;
const credentialLogs = [];
console.error = (...args) => credentialLogs.push(args);
try {
  const invalidCredentialResponse = credentialResponse();
  await invalidCredentialHandler({method: 'POST', headers: {authorization: 'Bearer valid-session-token'}, body: {apiKey: 'personal-test-api-key-value'}}, invalidCredentialResponse);
  assert.equal(invalidCredentialResponse.statusCode, 403);
  assert.equal(invalidCredentialResponse.body.code, 'OPENAPI00005');
} finally {
  console.error = originalConsoleErrorForCredential;
}
assert.equal(invalidCredentialWriteCount, 0);
assert.doesNotMatch(JSON.stringify(credentialLogs), /personal-test-api-key-value/);

let deletedCredentialUser = '';
const credentialStatusHandler = createCredentialTestHandler({
  loadCredentialStatus: async (_client, userId) => ({ok: true, hasCredential: true, verifiedAt: '2026-10-02T05:00:00.000Z', accountCount: 1, characterCount: 70, userId}),
  deleteCredential: async (_client, userId) => { deletedCredentialUser = userId; return {ok: true, hasCredential: false}; }
});
const credentialGetResponse = credentialResponse();
await credentialStatusHandler({method: 'GET', headers: {authorization: 'Bearer valid-session-token'}}, credentialGetResponse);
assert.equal(credentialGetResponse.statusCode, 200);
assert.equal(credentialGetResponse.body.hasCredential, true);
assert.doesNotMatch(JSON.stringify(credentialGetResponse.body), /apiKey|ciphertext|auth_tag|\biv\b/);
const credentialDeleteResponse = credentialResponse();
await credentialStatusHandler({method: 'DELETE', headers: {authorization: 'Bearer valid-session-token'}}, credentialDeleteResponse);
assert.equal(credentialDeleteResponse.body.hasCredential, false);
assert.equal(deletedCredentialUser, 'verified-user-id');

let verificationRequest = null;
const personalVerification = await nexonCredentialInternals.verifyNexonApiKey('personal-test-api-key-value', async (url, options) => {
  verificationRequest = {url, options};
  return {ok: true, status: 200, json: async () => ({account_list: [{account_id: 'must-not-return', character_list: [{ocid: 'must-not-return'}]}, {character_list: []}]})};
});
assert.equal(verificationRequest.url, 'https://open.api.nexon.com/maplestory/v1/character/list');
assert.equal(verificationRequest.options.headers['x-nxopen-api-key'], 'personal-test-api-key-value');
assert.deepEqual(personalVerification.accountCount, 2);
assert.deepEqual(personalVerification.characterCount, 1);
assert.doesNotMatch(JSON.stringify(personalVerification), /personal-test-api-key-value|must-not-return/);

assert.match(schema, /create table if not exists public\.nexon_api_credentials/i);
assert.match(schema, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
assert.match(schema, /ciphertext text not null[\s\S]*iv text not null[\s\S]*auth_tag text not null/i);
assert.match(schema, /revoke all on public\.nexon_api_credentials from authenticated/i);
assert.doesNotMatch(schema, /create policy[^;]+nexon_api_credentials/is);
assert.match(envExample, /^SUPABASE_SECRET_KEY=/m);
assert.match(envExample, /^NEXON_CREDENTIAL_ENCRYPTION_KEY=/m);
assert.doesNotMatch(envExample, /^VITE_(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXON_CREDENTIAL_ENCRYPTION_KEY)=/m);
assert.match(nexonCredentialStoreSource, /createCipheriv\('aes-256-gcm'/);
assert.match(nexonCredentialStoreSource, /cipher\.setAAD\(Buffer\.from\(String\(userId\)/);
assert.match(nexonCredentialApiSource, /const verification = await verifyKey\(apiKey\);[\s\S]*const encrypted = encrypt/);
assert.doesNotMatch(nexonCredentialApiSource, /NEXON_OPEN_API_KEY/);
assert.match(nexonApiSource, /loadUserNexonCredential/);
assert.match(nexonAccountOwnershipApiSource, /loadUserNexonCredential/);
assert.doesNotMatch(nexonApiSource, /NEXON_CREDENTIAL_ENCRYPTION_KEY/);
assert.match(cloudSource, /app\.setCloudAuthBridge\?\.\(createCloudAuthBridge\(/);
assert.match(cloudSource, /app\.onCloudSyncReady\?\.\(\{signedIn: true\}\)/);
assert.match(cloudSource, /finally \{[\s\S]*app\.onCloudSyncReady/);
assert.match(cloudSource, /getSession: \(\) => supabase\.auth\.getSession\(\)/);
assert.match(cloudSource, /const showSession = session => \{\s*user = session\?\.user \|\| null;\s*notifyCloudAuthChanged\(app, user\);/);
assert.match(cloudSource, /onAuthStateChange\([^)]*\) => window\.setTimeout\(\(\) => activate\(session\), 0\)\)/);
assert.match(cloudSource, /supabase\.auth\.getSession\(\)\.then\(\(\{data, error\}\) => \{[\s\S]*else activate\(data\.session\)/);

let bridgeUser = {id: 'signed-in-user'};
let bridgeSession = {access_token: 'supabase-access-token'};
const authBridge = cloudSyncInternals.createCloudAuthBridge({
  getUser: () => bridgeUser,
  getSession: async () => ({data: {session: bridgeSession}, error: null})
});
assert.equal(authBridge.isSignedIn(), true);
assert.equal(await authBridge.getAccessToken(), 'supabase-access-token');
bridgeUser = null;
bridgeSession = null;
assert.equal(authBridge.isSignedIn(), false);
assert.equal(await authBridge.getAccessToken(), '');
const sessionError = new Error('session failed');
const failingAuthBridge = cloudSyncInternals.createCloudAuthBridge({
  getUser: () => ({id: 'signed-in-user'}),
  getSession: async () => ({data: null, error: sessionError})
});
await assert.rejects(() => failingAuthBridge.getAccessToken(), error => error === sessionError);

const schedulerClientRequests = [];
context.fetch = async (url, options) => {
  schedulerClientRequests.push({url: String(url), options});
  const body = String(url).includes('/api/nexon-account-ownership')
    ? {ok: true, characterOwnedByServerKey: true, accountCount: 1, characterCount: 2}
    : String(url).includes('diagnostic=compare')
      ? {ok: true, diagnostic: true, live: {ok: true}, yesterday: {ok: true}}
      : {ok: true, character: {ocid: 'abcdefghijklmnop'}, bosses: [], activities: [], diagnostics: {}};
  return {ok: true, status: 200, json: async () => body};
};
run("nexonCredentialAuthBridge = {isSignedIn:()=>true,getAccessToken:async()=>'supabase-access-token'}");
await run("fetchNexonScheduler({nexonCharacter:{ocid:'abcdefghijklmnop'}})");
await run("fetchNexonSchedulerComparison({nexonCharacter:{ocid:'abcdefghijklmnop'}})");
await run("fetchNexonAccountOwnership({nexonCharacter:{ocid:'abcdefghijklmnop'}})");
assert.equal(schedulerClientRequests.length, 3);
assert.ok(schedulerClientRequests.every(request => request.options.headers.Authorization === 'Bearer supabase-access-token'));
assert.ok(schedulerClientRequests.every(request => !JSON.stringify(request).includes('personal-scheduler-server-only-key')));
const authenticatedFetchSource = source.slice(source.indexOf('async function nexonAuthenticatedFetch'), source.indexOf('async function fetchNexonScheduler'));
assert.doesNotMatch(authenticatedFetchSource, /localStorage|sessionStorage|state\.|apiKey/);

const authChanges = [];
const credentialAuthApp = {onCloudAuthChanged: value => authChanges.push(value)};
cloudSyncInternals.notifyCloudAuthChanged(credentialAuthApp, {id: 'restored-user'});
cloudSyncInternals.notifyCloudAuthChanged(credentialAuthApp, {id: 'login-event-user'});
cloudSyncInternals.notifyCloudAuthChanged(credentialAuthApp, null);
assert.deepEqual(authChanges, [{signedIn: true}, {signedIn: true}, {signedIn: false}]);
const authBridgeSource = cloudSource.slice(cloudSource.indexOf('function createCloudAuthBridge'), cloudSource.indexOf('export function startCloudSync'));
assert.doesNotMatch(authBridgeSource, /localStorage|sessionStorage|payload|app\.getState|app\.applyCloudState/);
assert.match(html, /id="nexonCredentialInput"[^>]+type="password"[^>]+autocomplete="new-password"/);
assert.match(html, /API Key는 서버에서 암호화하여 저장하며/);
const credentialClientSource = source.slice(source.indexOf('function nexonCredentialErrorMessage'), source.indexOf('function renderNexonSettings'));
assert.doesNotMatch(credentialClientSource, /localStorage|sessionStorage|transaction\(|applyCloudState|weeklyHistory/);
assert.doesNotMatch(source.slice(source.indexOf('function renderNexonCredentialSettings'), source.indexOf('async function nexonCredentialRequest')), /nexonApiState|schedulerWarning/);
context.__connectionCharacters = [{id: 'c1', nexonCharacter: {ocid: 'linked-ocid'}}];
context.__connectionCredential = {status: 'ready', hasCredential: true};
context.__connectionApiWarning = {status: 'warning'};
assert.deepEqual(json('nexonConnectionStatusSummary(__connectionCharacters,__connectionCredential,true,__connectionApiWarning)'), {
  character: {label: '정상', tone: 'success'},
  credential: {label: '등록 완료', tone: 'success'},
  automation: {label: '확인 실패', tone: 'warning'},
  showPreparationNotice: true
});
assert.equal(run("nexonConnectionStatusSummary(__connectionCharacters,__connectionCredential,true,{status:'ok'}).automation.label"), '정상');
assert.equal(run("nexonConnectionStatusSummary(__connectionCharacters,{status:'signed-out',hasCredential:false},false,{status:'idle'}).automation.label"), '로그인 필요');
assert.equal(run("nexonConnectionStatusSummary(__connectionCharacters,{status:'ready',hasCredential:false},true,{status:'idle'}).automation.label"), 'API Key 등록 필요');
assert.equal(run("nexonConnectionStatusSummary(__connectionCharacters,{status:'loading',hasCredential:false},true,{status:'idle'}).automation.label"), '확인 중');
assert.equal(run("nexonConnectionStatusSummary([],__connectionCredential,true,{status:'warning'}).automation.label"), '캐릭터 연동 필요');
assert.match(source, /주간 자동 확인 요청을 확인해주세요/);
assert.match(source, /API Key 등록 필요/);
assert.doesNotMatch(JSON.stringify(json('emptyState()')), /apiKey|credential|ciphertext|auth_tag/);
assert.match(source, /fetch\('\/api\/nexon-credential'/);
assert.match(source, /Authorization: `Bearer \$\{token\}`/);
assert.match(source, /const apiKey = input\.value\.trim\(\)/);
assert.match(source, /'API Key 확인 및 등록'/);
assert.match(source, /input\.value = ''/);
assert.deepEqual(json("nexonCredentialViewState({signedIn:true,hasCredential:false,editing:false})"), {
  showSignedOut: false, showInput: true, showRegistered: false, showInputHelp: true
});
assert.deepEqual(json("nexonCredentialViewState({signedIn:true,hasCredential:true,editing:false})"), {
  showSignedOut: false, showInput: false, showRegistered: true, showInputHelp: false
});
assert.deepEqual(json("nexonCredentialViewState({signedIn:true,hasCredential:true,editing:true})"), {
  showSignedOut: false, showInput: true, showRegistered: false, showInputHelp: true
});
assert.deepEqual(json("nexonCredentialViewState({signedIn:true,hasCredential:true,editing:false})"), {
  showSignedOut: false, showInput: false, showRegistered: true, showInputHelp: false
});
const credentialRenderSource = source.slice(source.indexOf('function renderNexonCredentialSettings'), source.indexOf('async function nexonCredentialRequest'));
assert.match(credentialRenderSource, /intro\?\.classList\.toggle\('hidden', !view\.showInputHelp\)/);
assert.match(credentialRenderSource, /guide\?\.classList\.toggle\('hidden', !view\.showInputHelp\)/);
assert.match(credentialRenderSource, /security\?\.classList\.toggle\('hidden', !view\.showInputHelp\)/);
assert.match(credentialRenderSource, /if \(guide && !view\.showInputHelp\) guide\.open = false/);
assert.equal((html.match(/id="nexonCredentialForm"/g) || []).length, 1);
assert.equal((html.match(/class="nexon-credential-guide(?: hidden)?"/g) || []).length, 1);
assert.equal((html.match(/class="nexon-credential-security(?: hidden)?"/g) || []).length, 1);
assert.equal((html.match(/class="nexon-credential-input-intro(?: hidden)?"/g) || []).length, 1);
assert.match(source, /credentialMount\.append\(credential\)/);
assert.match(html, /class="nexon-credential-security-more"/);
assert.match(html, /NEXON 계정 비밀번호는 절대 입력하지 마세요\./);
const cancelCredentialSource = source.slice(source.indexOf("$('#cancelNexonCredentialChange').addEventListener"), source.indexOf("$('#deleteNexonCredential').addEventListener"));
assert.match(cancelCredentialSource, /editing: false/);
assert.match(cancelCredentialSource, /renderNexonCredentialSettings\(\)/);
assert.match(css, /\.nexon-credential-guide>summary\{[^}]*min-height:44px/);
assert.match(css, /\.nexon-credential-guide-link\{[^}]*min-height:44px/);
assert.match(css, /\.nexon-credential-security-more>summary\{[^}]*min-height:32px/);
assert.match(css, /@media\(max-width:430px\)[\s\S]*\.nexon-credential-guide-link\{justify-self:stretch;width:100%\}/);

assert.equal(run("normalizeThemePreference('sepia')"), 'system');
assert.equal(run("normalizeThemePreference(null)"), 'system');
assert.equal(run("resolveTheme('system', false)"), 'light');
assert.equal(run("resolveTheme('system', true)"), 'dark');
assert.equal(run("resolveTheme('light', true)"), 'light');
assert.equal(run("resolveTheme('dark', false)"), 'dark');
assert.equal(run("themePreference='system';handleSystemThemeChange({matches:true})"), 'dark');
assert.equal(run("themePreference='system';handleSystemThemeChange({matches:false})"), 'light');
assert.equal(run("themePreference='light';handleSystemThemeChange({matches:true})"), 'light');
assert.equal(run("themePreference='dark';handleSystemThemeChange({matches:false})"), 'dark');
run("__themeStorage={value:null,getItem(){return this.value},setItem(key,value){this.key=key;this.value=value}};themePreference='system'");
assert.equal(run("setThemePreference('dark',__themeStorage)"), 'dark');
assert.equal(run("__themeStorage.key"), 'maple-income-theme');
assert.equal(run("readThemePreference(__themeStorage)"), 'dark');
assert.equal(run("setThemePreference('light',__themeStorage)"), 'light');
assert.equal(run("readThemePreference(__themeStorage)"), 'light');
assert.equal(run("setThemePreference('system',__themeStorage)"), 'light');
assert.equal(run("readThemePreference(__themeStorage)"), 'system');
assert.doesNotMatch(JSON.stringify(json('emptyState()')), /maple-income-theme|themePreference|resolvedTheme/);
assert.match(source, /const THEME_STORAGE_KEY = 'maple-income-theme'/);
assert.match(source, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
assert.match(source, /addEventListener\?\.\('change', handleSystemThemeChange\)/);
assert.match(source, /document\.documentElement\.dataset\.theme = resolved/);
assert.match(source, /document\.documentElement\.style\.colorScheme = resolved/);
assert.match(source, /meta\[name="theme-color"\]/);
assert.doesNotMatch(cloudSource, /maple-income-theme|THEME_STORAGE_KEY|themePreference/);
assert.doesNotMatch(source, /localStorage\.clear\(\)/);
assert.match(html, /data-settings-route="display"/);
assert.match(html, /id="settingsThemeSummary">시스템 설정/);
assert.equal((html.match(/data-theme-preference="system"/g) || []).length, 1);
assert.equal((html.match(/data-theme-preference="light"/g) || []).length, 1);
assert.equal((html.match(/data-theme-preference="dark"/g) || []).length, 1);
assert.match(html, /data-theme-preference="system" aria-pressed="true"/);
assert.match(html, /시스템 설정은 기기의 화면 모드를 자동으로 따릅니다/);
assert.ok(html.indexOf("localStorage.getItem(key)") < html.indexOf('<link rel="stylesheet"'));
assert.ok(html.indexOf("matchMedia('(prefers-color-scheme: dark)')") < html.indexOf('<link rel="stylesheet"'));
assert.match(html, /document\.documentElement\.dataset\.theme = resolved/);
assert.match(html, /meta name="theme-color" content="#0d151c"/);
const themeBootstrapSource = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
function runThemeBootstrap(savedPreference, systemDark) {
  const result = {theme: '', colorScheme: '', themeColor: ''};
  const document = {
    documentElement: {dataset: {}, style: {}},
    querySelector: () => ({setAttribute: (_name, value) => { result.themeColor = value; }})
  };
  vm.runInNewContext(themeBootstrapSource, {
    localStorage: {getItem: () => savedPreference},
    matchMedia: () => ({matches: systemDark}),
    document
  });
  result.theme = document.documentElement.dataset.theme;
  result.colorScheme = document.documentElement.style.colorScheme;
  return result;
}
assert.deepEqual(runThemeBootstrap(null, false), {theme: 'light', colorScheme: 'light', themeColor: '#f5f7f9'});
assert.deepEqual(runThemeBootstrap(null, true), {theme: 'dark', colorScheme: 'dark', themeColor: '#0d151c'});
assert.deepEqual(runThemeBootstrap('light', true), {theme: 'light', colorScheme: 'light', themeColor: '#f5f7f9'});
assert.deepEqual(runThemeBootstrap('dark', false), {theme: 'dark', colorScheme: 'dark', themeColor: '#0d151c'});
assert.deepEqual(runThemeBootstrap('invalid', true), {theme: 'dark', colorScheme: 'dark', themeColor: '#0d151c'});
assert.match(css, /:root,\[data-theme="light"\]\{color-scheme:light/);
assert.match(css, /\[data-theme="dark"\]\{color-scheme:dark/);
assert.match(css, /--bg:#f5f7f9/);
assert.match(css, /--panel:#fff/);
assert.match(css, /--sidebar:#f8fafb/);
assert.match(css, /--bg:#0d151c/);
assert.match(css, /--panel:#14212a/);
assert.match(css, /--sidebar:#101c25/);
assert.match(css, /--accent:#27b487/);
assert.match(css, /--accent-strong:#17906a/);
assert.match(css, /--accent-soft:#e8f6f0/);
assert.match(css, /--accent-soft-2:#f3fbf8/);
assert.match(css, /--accent-text:#116b52/);
assert.match(css, /--accent:#63d8ae/);
assert.match(css, /--accent-strong:#79e0ba/);
assert.match(css, /--accent-soft:#173128/);
assert.match(css, /--accent-soft-2:#11261f/);
assert.match(css, /--accent-text:#b8f2dd/);
assert.match(css, /--mint:var\(--accent\)/);
assert.match(css, /--success:#[0-9a-f]{6}/);
assert.match(css, /--summary-bg:#fff;--summary-border:#dce3e8/);
assert.match(css, /--summary-bg:#14212a;--summary-border:#2a3a45/);
assert.match(css, /--metric-bg:#f7f9fa;--metric-line:#e2e8ec/);
assert.match(css, /--metric-bg:#101e27;--metric-line:#2a3a45/);
assert.match(css, /\.summary-main \.big\{color:var\(--accent-text\)\}/);
assert.match(css, /\.primary\{background:var\(--accent\);color:var\(--primary-text\)\}/);
assert.match(css, /\.device-save\[data-sync-state="synced"\]\{color:var\(--success\)\}/);
assert.match(css, /\.tabs button\.active\{background:var\(--active\);color:var\(--accent-text\)\}/);
assert.match(css, /\.metric\{background:var\(--metric-bg\);border:1px solid var\(--metric-line\)/);
assert.match(css, /\.theme-selector\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css, /\.theme-selector button\{[^}]*min-height:44px/);
assert.match(css, /\.top\{[^}]*background:var\(--header-bg\)/);
assert.match(css, /select,input\{[^}]*background:var\(--input-bg\)/);
assert.match(css, /\.tabs\{[^}]*background:var\(--nav-bg\)/);
assert.match(css, /dialog::backdrop\{background:var\(--overlay\)/);
assert.match(css, /\.danger-zone\{[^}]*background:var\(--danger-bg\)/);
const themedCssRules = css.split('\n').slice(2).join('\n');
assert.doesNotMatch(themedCssRules, /#[0-9a-fA-F]{3,8}|rgba?\(/, 'component rules should use semantic theme tokens');
console.log('boss roster, preset, migration, backup, reset, rollover, income, NEXON scheduler and multi-device cloud sync regression checks passed');
