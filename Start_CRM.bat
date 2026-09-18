@echo off
title OneDesk CRM
echo ===================================================
echo  OneDesk CRM
echo  Keep this window open while the CRM is in use.
echo ===================================================
echo.

cd /d "%~dp0"

:: Build once, and again whenever the code has changed.
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
echo Starting the server on http://localhost:8080
set NODE_ENV=production
set PORT=8080
start "" http://localhost:8080
call npm start
