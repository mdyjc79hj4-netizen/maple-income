import {createClient} from '@supabase/supabase-js';

const META_KEY = 'maple-income-vercel-v1-sync';
const TABLE = 'maple_income_sync';
const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const safeJson = (value, fallback = {}) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

const timestamp = value => {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

async function contentHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function meaningfulLocalData(state) {
  if (!state) return false;
  if (state.incomes?.length || Object.keys(state.weeklyHistory || {}).length || state.presets?.length) return true;
  if (Object.keys(state.settings || {}).length || state.characters?.length !== 1) return true;
  const character = state.characters?.[0];
  return !!character && (character.name !== '본캐' || character.bosses?.some(boss => boss.done));
}

function chooseSyncAction({remoteExists, sameContent, knownDevice, initial, hasLocalData, localChangedSinceSync, localUpdatedAt, remoteUpdatedAt}) {
  if (!remoteExists) return 'upload';
  if (sameContent) return 'noop';
  if (!knownDevice && initial && hasLocalData) return 'choose';
  if (localChangedSinceSync && timestamp(localUpdatedAt) > timestamp(remoteUpdatedAt)) return 'upload';
  return 'download';
}

export function startCloudSync(app) {
  const elements = {
    badge: document.querySelector('#syncBadge'), unavailable: document.querySelector('#cloudUnavailable'),
    form: document.querySelector('#authForm'), email: document.querySelector('#authEmail'), password: document.querySelector('#authPassword'),
    signUp: document.querySelector('#signUp'), account: document.querySelector('#cloudAccount'), cloudEmail: document.querySelector('#cloudEmail'),
    status: document.querySelector('#cloudStatus'), authMessage: document.querySelector('#authMessage'), syncNow: document.querySelector('#syncNow'), signOut: document.querySelector('#signOut')
  };
  if (!app || !elements.form) return;

  const setBadge = (label, mode = 'local') => {
    elements.badge?.classList.toggle('sync-pending', mode === 'pending');
    elements.badge?.classList.toggle('sync-error', mode === 'error');
    const text = elements.badge?.querySelector('span'); if (text) text.textContent = label;
  };
  const setMessage = (text, error = false) => {
    elements.authMessage.textContent = text;
    elements.authMessage.classList.toggle('negative', error);
  };
  if (!url || !publishableKey) {
    elements.unavailable.classList.remove('hidden'); elements.form.classList.add('hidden');
    setMessage('Vercel에 Supabase URL과 publishable key를 설정하면 로그인이 활성화됩니다.');
    return;
  }

  const supabase = createClient(url, publishableKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  let user = null, syncQueue = Promise.resolve(), pushTimer = 0;
  let meta = safeJson(localStorage.getItem(META_KEY), {});
  if (!meta.clientId) meta.clientId = crypto.randomUUID();
  const saveMeta = changes => {
    meta = {...meta, ...changes};
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  };
  saveMeta({clientId: meta.clientId});

  const showSession = session => {
    user = session?.user || null;
    elements.form.classList.toggle('hidden', !!user); elements.account.classList.toggle('hidden', !user);
    elements.cloudEmail.textContent = user?.email || '';
    if (!user) { elements.status.textContent = ''; setBadge('이 기기에 저장'); }
  };
  const readRemote = async () => {
    const {data, error} = await supabase.from(TABLE).select('payload,version,updated_at,state_updated_at,content_hash').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const rememberRemote = async row => {
    const hash = row.content_hash || await contentHash(row.payload);
    saveMeta({userId: user.id, cloudVersion: Number(row.version) || 0, lastHash: hash, cloudUpdatedAt: row.updated_at});
    return hash;
  };
  const applyRemote = async row => {
    const hash = await rememberRemote(row);
    if (hash !== await contentHash(app.getState())) app.applyCloudState(row.payload);
    elements.status.textContent = `동기화 완료 · ${new Date(row.updated_at).toLocaleString('ko-KR')}`;
    setBadge('클라우드 동기화', 'synced');
  };

  const writeRemote = async (state, expectedVersion = 0, retry = true) => {
    const hash = await contentHash(state);
    if (hash === meta.lastHash && meta.userId === user.id) { elements.status.textContent = '최신 상태입니다.'; setBadge('클라우드 동기화', 'synced'); return; }
    setBadge('동기화 중', 'pending'); elements.status.textContent = '변경사항 업로드 중';
    const nextVersion = expectedVersion + 1;
    let result;
    if (!expectedVersion) {
      result = await supabase.from(TABLE).insert({user_id: user.id, payload: state, version: nextVersion, state_updated_at: state.updatedAt, client_id: meta.clientId, content_hash: hash}).select('payload,version,updated_at,state_updated_at,content_hash').single();
    } else {
      result = await supabase.from(TABLE).update({payload: state, version: nextVersion, state_updated_at: state.updatedAt, client_id: meta.clientId, content_hash: hash}).eq('user_id', user.id).eq('version', expectedVersion).select('payload,version,updated_at,state_updated_at,content_hash').maybeSingle();
    }
    if (!result.error && result.data) { await rememberRemote(result.data); elements.status.textContent = `동기화 완료 · ${new Date(result.data.updated_at).toLocaleString('ko-KR')}`; setBadge('클라우드 동기화', 'synced'); return; }
    if (!retry) throw result.error || new Error('다른 기기의 변경과 충돌했습니다.');
    const latest = await readRemote();
    if (!latest) return writeRemote(state, 0, false);
    const localIsNewer = timestamp(state.updatedAt) > timestamp(latest.state_updated_at || latest.payload?.updatedAt);
    if (localIsNewer) return writeRemote(state, Number(latest.version) || 0, false);
    await applyRemote(latest);
  };

  const reconcile = async ({initial = false} = {}) => {
    if (!user) return;
    const local = app.getState(), localHash = await contentHash(local), remote = await readRemote();
    const remoteHash = remote?.content_hash || (remote ? await contentHash(remote.payload) : '');
    const knownDevice = meta.userId === user.id && Number(meta.cloudVersion) > 0;
    const localChangedSinceSync = knownDevice && localHash !== meta.lastHash;
    const action = chooseSyncAction({remoteExists: !!remote, sameContent: remoteHash === localHash, knownDevice, initial, hasLocalData: meaningfulLocalData(local), localChangedSinceSync, localUpdatedAt: local.updatedAt, remoteUpdatedAt: remote?.state_updated_at || remote?.payload?.updatedAt});
    if (action === 'upload') { await writeRemote(local, Number(remote?.version) || 0); if (!remote) setMessage('이 기기의 기존 데이터를 클라우드로 이전했습니다.'); return; }
    if (action === 'noop') { await rememberRemote(remote); elements.status.textContent = '최신 상태입니다.'; setBadge('클라우드 동기화', 'synced'); return; }
    if (action === 'choose') {
      const useLocal = confirm('이 기기와 클라우드에 서로 다른 데이터가 있습니다.\n\n확인: 이 기기의 데이터를 클라우드에 저장\n취소: 클라우드 데이터를 이 기기에 적용');
      if (useLocal) { await writeRemote(local, Number(remote.version) || 0); setMessage('이 기기의 데이터를 클라우드로 이전했습니다.'); }
      else await applyRemote(remote);
      return;
    }
    await applyRemote(remote);
  };
  const enqueue = task => {
    syncQueue = syncQueue.then(task, task).catch(error => {
      console.error('Cloud sync failed', error); elements.status.textContent = '오프라인 저장 중 · 연결되면 다시 동기화합니다.';
      setMessage(`동기화 실패: ${error.message}`, true); setBadge('오프라인 저장', 'error');
    });
    return syncQueue;
  };
  const schedulePush = () => {
    if (!user) return;
    clearTimeout(pushTimer); setBadge('동기화 대기', 'pending');
    pushTimer = window.setTimeout(() => enqueue(async () => {
      const remote = await readRemote();
      await writeRemote(app.getState(), Number(remote?.version) || 0);
    }), 600);
  };
  const activate = session => {
    const changedUser = session?.user?.id !== user?.id;
    showSession(session);
    if (session && changedUser) enqueue(() => reconcile({initial: true}));
  };

  elements.form.addEventListener('submit', async event => {
    event.preventDefault(); setMessage('로그인 중…');
    const {error} = await supabase.auth.signInWithPassword({email: elements.email.value.trim(), password: elements.password.value});
    if (error) setMessage(`로그인 실패: ${error.message}`, true); else { elements.password.value = ''; setMessage('로그인했습니다. 데이터를 확인하고 있습니다.'); }
  });
  elements.signUp.addEventListener('click', async () => {
    if (!elements.form.reportValidity()) return; setMessage('계정 생성 중…');
    const {data, error} = await supabase.auth.signUp({email: elements.email.value.trim(), password: elements.password.value});
    if (error) setMessage(`회원가입 실패: ${error.message}`, true);
    else setMessage(data.session ? '가입과 로그인이 완료되었습니다.' : '확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.');
  });
  elements.signOut.addEventListener('click', async () => { const {error} = await supabase.auth.signOut(); if (error) setMessage(error.message, true); else setMessage('로그아웃했습니다. 이 기기의 데이터는 그대로 사용할 수 있습니다.'); });
  elements.syncNow.addEventListener('click', () => enqueue(() => reconcile()));
  window.addEventListener(app.changeEvent, schedulePush);
  window.addEventListener('storage', event => { if (event.key === app.storageKey) schedulePush(); });
  window.addEventListener('online', () => user && enqueue(() => reconcile()));
  window.addEventListener('focus', () => user && enqueue(() => reconcile()));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && user) enqueue(() => reconcile()); });
  supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => activate(session), 0));
  supabase.auth.getSession().then(({data, error}) => { if (error) setMessage(error.message, true); else activate(data.session); });
}

export const cloudSyncInternals = {contentHash, meaningfulLocalData, timestamp, chooseSyncAction};
