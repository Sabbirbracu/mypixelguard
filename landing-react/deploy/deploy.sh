#!/bin/bash
# Builds the landing page and uploads it to the server.
#   SERVER=user@your-server-ip ./deploy/deploy.sh
# Needs ssh access and rsync. Safe to run again for every update.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SERVER:?Set SERVER, e.g. SERVER=root@203.0.113.10 ./deploy/deploy.sh}"
ROOT=/var/www/mypixelguard

VITE_VISITOR_API=https://mypixelguard.agentiqbd.com pnpm build

ssh "$SERVER" "mkdir -p $ROOT/site $ROOT/downloads $ROOT/counter $ROOT/counter-data"
rsync -az --delete dist/ "$SERVER:$ROOT/site/"
rsync -az server/visitor-counter.mjs "$SERVER:$ROOT/counter/"
ssh "$SERVER" "chown -R www-data:www-data $ROOT/counter-data && systemctl restart mypixelguard-counter 2>/dev/null || true"
echo "Deployed → https://mypixelguard.agentiqbd.com"
