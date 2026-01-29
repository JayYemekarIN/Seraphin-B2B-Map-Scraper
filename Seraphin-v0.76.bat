@echo off
title Seraphin v7.3 Launcher
color 0b

:: --- STEP 1: CHECK NODE.JS ---
echo [SYSTEM] Checking for Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo.
    echo [CRITICAL ERROR] Node.js is NOT installed.
    echo ---------------------------------------------------
    echo Seraphin requires Node.js to function.
    echo Please download and install it from: https://nodejs.org/
    echo ---------------------------------------------------
    echo.
    pause
    exit
)

echo [OK] Node.js detected. Verification complete.
echo.

:: --- STEP 2: START SERVER ---
echo [SYSTEM] Booting Seraphin Core...
:: This opens a separate window for the server so you can see the scraping logs
start "Seraphin B2B Console" cmd /k "node server.js"

:: --- STEP 3: OPEN BROWSER ---
echo [SYSTEM] Waiting for port 9898 allocation...
:: Wait 3 seconds to ensure server is ready before opening browser
timeout /t 3 >nul

echo [SYSTEM] Launching Interface...
start http://localhost:9898

echo.
echo ---------------------------------------------------
echo  SERAPHIN IS NOW ACTIVE
echo  Do not close the "Seraphin B2B Console" window.
echo ---------------------------------------------------
pause