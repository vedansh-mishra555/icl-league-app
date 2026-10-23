@echo off
setlocal EnableDelayedExpansion
title ICL - Local installation
cd /d "%~dp0"

echo.
echo  ===============================================
echo    ICL Cricket League - local installation
echo  ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this file again.
  pause & exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 20 (
  echo  [!] Node.js 20 or newer is required. You have version %NODEMAJOR%.
  pause & exit /b 1
)

echo  Which database do you want to use?
echo.
echo    1  Built-in temporary database  (no extra install; data resets when you stop the app)
echo    2  My own MongoDB               (local MongoDB or a MongoDB Atlas link; data is kept)
echo.
choice /c 12 /n /m "  Choose 1 or 2: "
if errorlevel 2 goto own
set MODE=mem
goto deps

:own
set MODE=mongo
set /p MONGOURI="  Paste your MongoDB URI (press Enter for mongodb://127.0.0.1:27017/icl): "
if "!MONGOURI!"=="" set MONGOURI=mongodb://127.0.0.1:27017/icl

:deps
echo.
echo  Installing packages (this can take a few minutes)...
call npm install
if errorlevel 1 ( echo  [!] npm install failed. & pause & exit /b 1 )

echo.
echo  Writing settings...
for /f %%s in ('node -p "require('crypto').randomBytes(32).toString('hex')"') do set SECRET=%%s

if not exist server\.env (
  > server\.env echo NODE_ENV=development
  >> server\.env echo PORT=4000
  >> server\.env echo CLIENT_URL=http://localhost:5173
  >> server\.env echo JWT_SECRET=!SECRET!
  >> server\.env echo JWT_EXPIRES_IN=7d
  if "!MODE!"=="mongo" >> server\.env echo MONGODB_URI=!MONGOURI!
  >> server\.env echo CRICHEROES_SYNC_ENABLED=false
  echo    created server\.env
) else (
  echo    server\.env already exists - left unchanged
)
if not exist client\.env (
  > client\.env echo VITE_API_URL=http://localhost:4000
  echo    created client\.env
)
> .install-mode echo !MODE!

if "!MODE!"=="mongo" (
  echo.
  echo  Loading demo data into your database...
  call npm run seed
  if errorlevel 1 ( echo  [!] Could not reach MongoDB. Check the URI in server\.env then run run-icl.bat again. )
) else (
  echo.
  echo  Downloading the built-in database engine once ^(about 780 MB, first time only^)...
  call node server\src\prefetchDb.js
)

echo.
echo  ===============================================
echo    Done. Run run-icl.bat to launch ICL.
echo    Site:   http://localhost:5173
echo    Admin:  http://localhost:5173/admin
echo    Login:  admin@icl.test / ChangeMe123^^!
echo  ===============================================
echo.
pause
