@echo off
setlocal
title Maple Income - Signup Fix v3
cd /d "%~dp0"

echo.
echo ============================================
echo   Maple Income - Signup Fix v3
echo ============================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-signup-fix-v3.ps1"
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo Fix failed. No commit was made.
  echo.
  pause
  exit /b %ERR%
)

echo Next steps in GitHub Desktop:
echo   1. Open Changes
echo   2. Select cloud-sync.js only
echo   3. Commit message: Fix Supabase signup feedback
echo   4. Commit to main
echo   5. Push origin
echo.
pause
