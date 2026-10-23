@echo off
setlocal
title ICL - running
cd /d "%~dp0"

if not exist node_modules (
  echo  Packages are not installed yet. Running install-icl.bat first...
  call install-icl.bat
)

set MODE=mem
if exist .install-mode set /p MODE=<.install-mode

echo.
echo  Starting ICL ^(%MODE% database^)...
echo  Site:  http://localhost:5173      Admin: http://localhost:5173/admin
echo  Close this window or press Ctrl+C to stop.
echo.

start "" /min cmd /c "timeout /t 8 >nul & start http://localhost:5173"

if "%MODE%"=="mongo" (
  call npm run dev
) else (
  call npm run dev:mem
)
pause
