import './app.js';

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
  const message = document.querySelector('#authMessage');

  if (!form || !loginButton || !signUpButton) return;

  const blockNativeSubmit = event => event.preventDefault();
  form.addEventListener('submit', blockNativeSubmit);

  loginButton.disabled = true;
  signUpButton.disabled = true;
  if (message) message.textContent = '클라우드 로그인 준비 중…';

  try {
    const {startCloudSync} = await import('./cloud-sync.js');
    startCloudSync(window.mapleIncomeApp);

    form.removeEventListener('submit', blockNativeSubmit);
    loginButton.disabled = false;
    signUpButton.disabled = false;

    if (message?.textContent === '클라우드 로그인 준비 중…') {
      message.textContent = '';
    }
  } catch (error) {
    loginButton.disabled = false;
    signUpButton.disabled = false;
    showCloudBootError(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCloudSync, {once: true});
} else {
  bootCloudSync();
}