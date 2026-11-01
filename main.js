import './app.js';
import {registerSW} from 'virtual:pwa-register';

let deferredInstallPrompt = null;

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function renderPwaInstallState(state = '') {
  const button = document.querySelector('#pwaInstallButton');
  const status = document.querySelector('#pwaInstallStatus');
  const summary = document.querySelector('#pwaInstallSummary');
  const iosHint = document.querySelector('#pwaIosInstallHint');
  if (!button || !status || !summary || !iosHint) return;

  button.classList.add('hidden');
  iosHint.classList.add('hidden');

  if (isStandalonePwa() || state === 'installed') {
    status.textContent = '메기 앱으로 실행 중입니다.';
    summary.textContent = state === 'installed' ? '앱 설치 완료' : '앱으로 실행 중';
    return;
  }

  if (deferredInstallPrompt) {
    button.classList.remove('hidden');
    status.textContent = '이 기기에 메기 앱을 설치할 수 있습니다.';
    summary.textContent = '설치 가능';
    return;
  }

  if (isIosDevice()) {
    status.textContent = '홈 화면에 추가하면 메기를 앱처럼 실행할 수 있습니다.';
    summary.textContent = '홈 화면에 추가';
    iosHint.classList.remove('hidden');
    return;
  }

  status.textContent = '지원 브라우저에서 설치할 수 있으면 설치 버튼이 표시됩니다.';
  summary.textContent = '브라우저 설치 지원';
}

function setupPwaInstallUi() {
  const button = document.querySelector('#pwaInstallButton');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderPwaInstallState();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    renderPwaInstallState('installed');
  });
  button?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    renderPwaInstallState();
  });
  renderPwaInstallState();
}

function setupPwaUpdates() {
  const notice = document.querySelector('#pwaUpdateNotice');
  const updateButton = document.querySelector('#pwaUpdateButton');
  const laterButton = document.querySelector('#pwaUpdateLater');
  const updateSW = registerSW({
    onNeedRefresh() {
      notice?.classList.remove('hidden');
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error);
    }
  });

  laterButton?.addEventListener('click', () => notice?.classList.add('hidden'));
  updateButton?.addEventListener('click', async () => {
    updateButton.disabled = true;
    updateButton.textContent = '업데이트 중…';
    try {
      await updateSW(true);
    } catch (error) {
      console.error('Service worker update failed', error);
      updateButton.disabled = false;
      updateButton.textContent = '업데이트 다시 시도';
    }
  });
}

setupPwaInstallUi();
setupPwaUpdates();

function showCloudBootError(error) {
  console.error('Cloud sync startup failed', error);
  const message = document.querySelector('#authMessage');
  const form = document.querySelector('#authForm');

  if (form) {
    form.addEventListener('submit', event => event.preventDefault());
  }

  if (message) {
    message.textContent = `클라우드 로그인 초기화 실패: ${error?.message || String(error)}`;
    message.classList.add('negative');
  }
}

async function bootCloudSync() {
  const form = document.querySelector('#authForm');
  const loginButton = form?.querySelector('button[type="submit"]');
  const signUpButton = document.querySelector('#signUp');
  const resendButton = document.querySelector('#resendConfirmation');
  const message = document.querySelector('#authMessage');

  if (!form || !loginButton || !signUpButton) return;

  const blockNativeSubmit = event => event.preventDefault();
  form.addEventListener('submit', blockNativeSubmit);

  loginButton.disabled = true;
  signUpButton.disabled = true;
  if (resendButton) resendButton.disabled = true;
  if (message) message.textContent = '클라우드 로그인 준비 중…';

  try {
    const {startCloudSync} = await import('./cloud-sync.js');
    startCloudSync(window.mapleIncomeApp);

    form.removeEventListener('submit', blockNativeSubmit);
    loginButton.disabled = false;
    signUpButton.disabled = false;
    if (resendButton) resendButton.disabled = false;

    if (message?.textContent === '클라우드 로그인 준비 중…') {
      message.textContent = '';
    }
  } catch (error) {
    loginButton.disabled = false;
    signUpButton.disabled = false;
    if (resendButton) resendButton.disabled = false;
    showCloudBootError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCloudSync, {once: true});
} else {
  bootCloudSync();
}
