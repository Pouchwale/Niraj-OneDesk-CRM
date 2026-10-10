@echo off
title OneDesk CRM
echo ===================================================
echo  OneDesk CRM
echo  Keep this window open while the CRM is in use.
echo ===================================================
echo.

cd /d "%~dp0"

:: Build once, and again whenever the code has changed or --build is specified.
if "%1"=="--build" goto build
if "%1"=="-b" goto build
if not exist "dist\index.html" goto build
if not exist "dist-server\index.js" goto build
goto run

:build
echo Preparing the application. This takes about a minute...
call npm run build
if errorlevel 1 (
  echo.
  echo The build failed. Nothing was started.
  pause
  exit /b 1
)

:run
echo.
echo Starting OneDesk CRM on port 8080...
echo Keep this window open. When ready, other PCs on your LAN can access the CRM.
set NODE_ENV=production
set PORT=8080
start "" http://localhost:8080
call npm start
