@echo off

cd /d %~dp0

echo Starting APEX Backend...
start cmd /k "cd /d %~dp0 && node server.js"

timeout /t 2 >nul

echo Starting APEX Frontend...
start cmd /k "cd /d %~dp0 && pnpm dev"

echo APEX started.