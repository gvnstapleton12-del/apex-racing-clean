@echo off
cd C:\Users\gvnst\Documents\GitHub\apex-racing-clean
node scripts/backtestPointInTime.mjs --from 2026-07-12 --to 2026-07-18 --pa-gate --fast --skip-memory --label dual-mode-7day > backtest-output.txt 2>&1
echo DONE > backtest-done.txt
