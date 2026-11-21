#!/bin/zsh
# Validate, test, build and publish dist/ to the VPS (served via Cloudflare Tunnel).
# Usage: scripts/deploy.sh [--dry-run]      Config: ./deploy.env (gitignored)
set -eu
cd "${0:A:h:h}"
DRY_RUN=0; [[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
[[ -f deploy.env ]] || { echo "deploy.env missing — copy deploy/deploy.env.example" >&2; exit 1; }
set -a; source ./deploy.env; set +a
: "${DEPLOY_HOST:?set DEPLOY_HOST in deploy.env}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/quartermaster/site}"

echo "==> validate, test, build"
npm run --silent build
npm test --silent
[[ -f dist/index.html ]] || { echo "dist/index.html missing" >&2; exit 1; }
if find dist \( -name '*.env' -o -name '.env*' -o -name '*.log' \) | grep -q .; then
  echo "refusing to deploy: env/log file in dist/" >&2; exit 1
fi
RSYNC_OPTS=(-az --delete --delay-updates --exclude='.DS_Store' --exclude='*.map')
(( DRY_RUN )) && RSYNC_OPTS+=(--dry-run --itemize-changes)
echo "==> uploading to $DEPLOY_HOST:$DEPLOY_PATH"
rsync "${RSYNC_OPTS[@]}" dist/ "$DEPLOY_HOST:$DEPLOY_PATH/"
(( DRY_RUN )) && echo "==> dry run only" || echo "==> deployed $(date '+%Y-%m-%d %H:%M')"
