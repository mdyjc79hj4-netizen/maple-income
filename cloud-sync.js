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
  const loginButton = elements.form?.querySelector('button[type="submit"]');
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
  const setAuthBusy = busy => {
    if (loginButton) loginButton.disabled = busy;
    if (elements.signUp) elements.signUp.disabled = busy;
    elements.email.disabled = busy;
    elements.password.disabled = busy;
  };
  if (!url || !publishableKey) {
    elements.unavailable.classList.remove('hidden'); elements.form.classList.add('hidden');
    setMessage('Vercel에 Supabase URL과 publishable key를 설정하면 로그인이 활성화됩니다.');
    return;
  }

  const supabase = createClient(url, publishableKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  let user = null, syncQueue = Promise.resolve(), pushTimer = 0;
  let meta = safeJson(localStorage.getItem(META_KEY), {});
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};
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
    event.preventDefault();
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true);
    setMessage('\uB85C\uADF8\uC778 \uC911\u2026');
    try {
      const {error} = await supabase.auth.signInWithPassword({
        email: elements.email.value.trim(),
        password: elements.password.value
      });
      if (error) {
        setMessage(`\uB85C\uADF8\uC778 \uC2E4\uD328: ${error.message}`, true);
      } else {
        elements.password.value = '';
        setMessage('\uB85C\uADF8\uC778\uD588\uC2B5\uB2C8\uB2E4. \uB370\uC774\uD130\uB97C \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.');
      }
    } catch (error) {
      console.error('Supabase sign-in failed', error);
      setMessage(`\uB85C\uADF8\uC778 \uC2E4\uD328: ${error?.message || 'Supabase \uC5F0\uACB0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.'}`, true);
    } finally {
      setAuthBusy(false);
    }
  });

  elements.signUp.addEventListener('click', async () => {
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true);
    setMessage('\uACC4\uC815 \uC0DD\uC131 \uC911\u2026');
    try {
      const {data, error} = await supabase.auth.signUp({
        email: elements.email.value.trim(),
        password: elements.password.value
      });
      if (error) {
        setMessage(`\uD68C\uC6D0\uAC00\uC785 \uC2E4\uD328: ${error.message}`, true);
      } else if (data.session) {
        elements.password.value = '';
        setMessage('\uD68C\uC6D0\uAC00\uC785\uACFC \uB85C\uADF8\uC778\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
      } else if (data.user) {
        elements.password.value = '';
        setMessage('\uD68C\uC6D0\uAC00\uC785 \uC694\uCCAD\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC785\uB825\uD55C \uC774\uBA54\uC77C\uC758 \uC778\uC99D \uBA54\uC77C\uC744 \uD655\uC778\uD55C \uB4A4 \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.');
      } else {
        setMessage('\uD68C\uC6D0\uAC00\uC785 \uC694\uCCAD\uC740 \uC804\uC1A1\uB410\uC9C0\uB9CC \uC751\uB2F5\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.', true);
      }
    } catch (error) {
      console.error('Supabase sign-up failed', error);
      setMessage(`\uD68C\uC6D0\uAC00\uC785 \uC2E4\uD328: ${error?.message || 'Supabase \uC5F0\uACB0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.'}`, true);
    } finally {
      setAuthBusy(false);
    }
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
