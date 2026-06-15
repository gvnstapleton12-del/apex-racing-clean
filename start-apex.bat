@echo off
cd /d C:\Users\gvnst\Documents\GitHub\apex-racing-clean

:loop
echo.
echo ===== APEX Racing Intelligence =====
echo Starting...
echo Press Ctrl+C to stop, then run this again to restart.
echo.
pnpm dev
echo.
set /p restart="Server stopped. Press R to restart, or any key to exit: "
if /i "%restart%"=="R" goto loop
