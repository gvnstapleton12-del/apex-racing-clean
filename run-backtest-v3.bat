@echo off
cd C:\Users\gvnst\Documents\GitHub\apex-racing-clean
node scripts/backtestPointInTime.mjs --from 2026-06-02 --to 2026-06-03 --pa-gate --fast --skip-memory --label dual-mode-v3 > backtest-v3-output.txt 2>&1
echo DONE > backtest-v3-done.txt
