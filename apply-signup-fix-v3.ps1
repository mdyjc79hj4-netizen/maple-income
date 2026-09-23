$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo
$file = Join-Path $repo "cloud-sync.js"

if (-not (Test-Path ".git")) { throw "Not a Git repository." }
if (-not (Test-Path $file)) { throw "cloud-sync.js was not found." }

git diff --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Existing tracked changes were found." -ForegroundColor Red
    git status --short
    exit 1
}

$content = [System.IO.File]::ReadAllText($file)

function Replace-Once([string]$text, [string]$pattern, [string]$replacement, [string]$label) {
    $regex = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $matches = $regex.Matches($text)
    if ($matches.Count -ne 1) {
        Write-Host ""
        Write-Host "ERROR: Could not uniquely locate $label. Matches: $($matches.Count)" -ForegroundColor Red
        exit 1
    }
    return $regex.Replace($text, $replacement, 1)
}

# 1) Add login button reference immediately before the early return.
$content = Replace-Once $content `
    "(\r?\n  \};\r?\n)(  if \(!app \|\| !elements\.form\) return;)" `
    ('$1  const loginButton = elements.form?.querySelector(''button[type="submit"]'');' + "`n" + '$2') `
    "auth element block"

# 2) Add busy-state helper after setMessage.
$content = Replace-Once $content `
    "(  const setMessage = \(text, error = false\) => \{\r?\n    elements\.authMessage\.textContent = text;\r?\n    elements\.authMessage\.classList\.toggle\('negative', error\);\r?\n  \};)" `
    ('$1' + "`n" + @'
  const setAuthBusy = busy => {
    if (loginButton) loginButton.disabled = busy;
    if (elements.signUp) elements.signUp.disabled = busy;
    elements.email.disabled = busy;
    elements.password.disabled = busy;
  };
'@) `
    "setMessage helper"

# 3) Replace login + signup handlers as one block.
$newAuth = @'
  elements.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true); setMessage('로그인 중…');
    try {
      const {error} = await supabase.auth.signInWithPassword({
        email: elements.email.value.trim(),
        password: elements.password.value
      });
      if (error) {
        setMessage(`로그인 실패: ${error.message}`, true);
      } else {
        elements.password.value = '';
        setMessage('로그인했습니다. 데이터를 확인하고 있습니다.');
      }
    } catch (error) {
      console.error('Supabase sign-in failed', error);
      setMessage(`로그인 실패: ${error?.message || 'Supabase 연결 중 오류가 발생했습니다.'}`, true);
    } finally {
      setAuthBusy(false);
    }
  });

  elements.signUp.addEventListener('click', async () => {
    if (!elements.form.reportValidity()) return;
    setAuthBusy(true); setMessage('계정 생성 중…');
    try {
      const {data, error} = await supabase.auth.signUp({
        email: elements.email.value.trim(),
        password: elements.password.value
      });
      if (error) {
        setMessage(`회원가입 실패: ${error.message}`, true);
      } else if (data.session) {
        elements.password.value = '';
        setMessage('회원가입과 로그인이 완료되었습니다.');
      } else if (data.user) {
        elements.password.value = '';
        setMessage('회원가입 요청이 완료되었습니다. 입력한 이메일의 인증 메일을 확인한 뒤 로그인해 주세요.');
      } else {
        setMessage('회원가입 요청은 전송됐지만 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
      }
    } catch (error) {
      console.error('Supabase sign-up failed', error);
      setMessage(`회원가입 실패: ${error?.message || 'Supabase 연결 중 오류가 발생했습니다.'}`, true);
    } finally {
      setAuthBusy(false);
    }
  });
'@

$content = Replace-Once $content `
    "  elements\.form\.addEventListener\('submit', async event => \{.*?\r?\n  \}\);\r?\n  elements\.signUp\.addEventListener\('click', async \(\) => \{.*?\r?\n  \}\);" `
    $newAuth `
    "login/signup handlers"

# Preserve LF line endings and UTF-8 without BOM.
$content = $content -replace "`r`n", "`n"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($file, $content, $utf8)

Write-Host ""
Write-Host "SIGNUP FIX APPLIED SUCCESSFULLY" -ForegroundColor Green
Write-Host ""
git status --short
