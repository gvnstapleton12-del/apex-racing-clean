#!/bin/bash
# Auto-deploy: pull latest, build, restart ONLY if changes exist

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

cd ~/apex-racing-clean || exit 1

BEFORE=$(git rev-parse HEAD)
git pull --quiet || exit 1
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi

npm run build 2>/dev/null || exit 1
npx pm2 restart apex --silent 2>/dev/null

echo "[$(date)] Deploy complete: $BEFORE -> $AFTER" >> ~/apex-deploy.log
