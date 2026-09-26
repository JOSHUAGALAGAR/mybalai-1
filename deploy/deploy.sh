#!/usr/bin/env bash
# Deploy the committed code (HEAD) to the production server, from your machine.
#
#   deploy/deploy.sh            # deploy HEAD
#   deploy/deploy.sh rollback   # switch back to the previous release
#
# Needs: ssh access (key, or `export SSHPASS=...` with sshpass installed), and a local
# `deploy/.env.production` (see deploy/env.production.example) — it is never committed.
#
# Layout on the server, inside the site directory:
#   releases/<commit>/        one folder per deploy (code + node_modules + .next)
#   current -> releases/<x>   what PM2 runs
#   shared/.env.production.local   secrets, uploaded from deploy/.env.production
set -euo pipefail

HOST="${DEPLOY_HOST:-mybalai-admin@72.62.75.135}"
SITE="${DEPLOY_DIR:-/home/mybalai-admin/htdocs/mybalai.delxtdev.cloud}"
KEEP=3

cd "$(dirname "$0")/.."

if [ -n "${SSHPASS:-}" ]; then
  ssh_() { sshpass -e ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no "$HOST" "$@"; }
else
  ssh_() { ssh "$HOST" "$@"; }
fi

if [ "${1:-}" = "rollback" ]; then
  ssh_ "cd $SITE && prev=\$(ls -1t releases | sed -n 2p) && [ -n \"\$prev\" ] && ln -sfn releases/\$prev current && cd current && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save && echo \"rolled back to \$prev\""
  exit 0
fi

[ -f deploy/.env.production ] || { echo "Missing deploy/.env.production (copy deploy/env.production.example)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes: commit (and push) first, so production matches git."; exit 1; }

SHA="$(git rev-parse --short HEAD)"
echo "==> Deploying $SHA to $HOST:$SITE"

echo "==> Uploading code and settings"
ssh_ "mkdir -p $SITE/releases/$SHA $SITE/shared && umask 077 && cat > $SITE/shared/.env.production.local" < deploy/.env.production
git archive --format=tar HEAD | ssh_ "cd $SITE/releases/$SHA && tar -x --no-same-owner --no-same-permissions"

echo "==> Installing and building on the server (a few minutes)"
ssh_ "cd $SITE/releases/$SHA && ln -sfn ../../shared/.env.production.local .env.production.local && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=1536 npm run build"

echo "==> Switching over"
ssh_ "cd $SITE && ln -sfn releases/$SHA current && cd current && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"

echo "==> Tidying old releases"
ssh_ "cd $SITE/releases && ls -1t | tail -n +$((KEEP + 1)) | xargs -r rm -rf"

echo "==> Health check"
sleep 4
code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "${DEPLOY_URL:-https://mybalai.delxtdev.cloud}/login" || true)"
echo "GET /login -> $code"
[ "$code" = "200" ] || { echo "Not healthy: check 'pm2 logs mybalai' on the server, or run deploy/deploy.sh rollback"; exit 1; }
echo "Done: $SHA is live."
