@echo off
title OneDesk CRM
color 0B

echo ============================================================
echo                  OneDesk CRM Launcher
echo ============================================================
echo.

cd /d "%~dp0coordinator"

:: Ensure Node.js is in PATH
if exist "C:\Program Files\nodejs" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

:: Verify Node.js is available
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is not found.
    echo Please ensure Node.js is installed from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if port 8080 is already active
netstat -ano | findstr :8080 | findstr LISTENING >nul
if not errorlevel 1 (
    echo [INFO] OneDesk CRM is already running!
    echo Opening browser to http://localhost:8080 ...
    start "" http://localhost:8080
    ping 127.0.0.1 -n 3 >nul
    exit /b 0
)

:: Build if production bundles are missing
if not exist "dist\index.html" goto build
if not exist "dist-server\index.js" goto build
goto run

:build
echo [INFO] Preparing application for first run...
echo (Building web and server bundles, this takes about 30 seconds)
call npm run build
if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Build failed! Check the errors above.
    pause
    exit /b 1
)

:run
echo [INFO] Starting OneDesk CRM Server...
echo.
echo   Local access:   http://localhost:8080
echo   LAN access:     http://10.192.193.14:8080
echo.
echo ============================================================
echo   Keep this window open while OneDesk CRM is in use.
echo ============================================================
echo.

set NODE_ENV=production
set PORT=8080

:: Automatically open browser once server is up
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8080'"

:: Start the server process
node dist-server/index.js

if errorlevel 1 (
    echo.
    echo Server stopped.
    pause
)
