@echo off
cd C:\Users\gvnst\Documents\GitHub\apex-racing-clean
node scripts/backtestPointInTime.mjs --from 2026-06-02 --to 2026-06-08 --pa-gate --fast --skip-memory --label dual-mode-7day > backtest-dual-mode-output.txt 2>&1
echo DONE > backtest-dual-mode-done.txt
