#!/bin/bash
# Auto-deploy: pull latest, build, restart
# Run via cron or manually

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd ~/apex-racing-clean || exit 1

git pull --quiet || exit 1
npm run build 2>/dev/null || exit 1
npx pm2 restart apex --silent 2>/dev/null

echo "[$(date)] Deploy complete" >> ~/apex-deploy.log
