#!/bin/zsh
# Read-only checks after setting up or updating Quartermaster (M3).
#
#   1. Without a login, the public URL answers with a redirect to Cloudflare Access (…cloudflareaccess.com);
#      with ACCESS_MODE=public (login paused on purpose), HTTP 200 and an X-Robots-Tag noindex header.
#   2. On the VPS: the stack in /opt/quartermaster runs (web + tunnel), publishes no port,
#      .env is mode 600 (its content is never printed), site/index.html exists.
#   3. On the VPS: the listening TCP ports are only SSH (22) and the existing web server's 80/443, plus loopback.
#
# It changes nothing and only looks at /opt/quartermaster. Beyond the port list it never looks at the other stacks
# (never touch them).
#
# Usage:  scripts/deploy_verify.sh            (reads deploy.env: DEPLOY_HOST, DEPLOY_URL; optional ACCESS_MODE=public)
set -u
REPO="${0:A:h:h}"
cd "$REPO"
[[ -f deploy.env ]] || { echo "deploy.env missing — copy deploy/deploy.env.example" >&2; exit 1; }
set -a; source ./deploy.env; set +a
: "${DEPLOY_HOST:?set DEPLOY_HOST in deploy.env}"
: "${DEPLOY_URL:?set DEPLOY_URL in deploy.env (e.g. https://quartermaster.<your-domain>)}"
STACK=/opt/quartermaster
FAIL=0
ok()   { print -r -- "  PASS  $1"; }
bad()  { print -r -- "  FAIL  $1"; FAIL=1; }

read -r CODE LOC <<<"$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$DEPLOY_URL")"
if [[ "${ACCESS_MODE:-login}" == public ]]; then
  # Public mode (Access bypassed on purpose).
  echo "==> 1. Public (Access bypassed) at $DEPLOY_URL"
  ROBOTS=$(curl -sI --max-time 20 "$DEPLOY_URL" | tr -d '\r' | grep -i '^x-robots-tag:' || true)
  if [[ "$CODE" == 200 && "$ROBOTS" == *noindex* ]]; then
    ok "HTTP 200 without login, ${ROBOTS}"
  else
    bad "expected HTTP 200 with X-Robots-Tag noindex, got HTTP $CODE ${ROBOTS:-(no X-Robots-Tag)}"
  fi
else
  echo "==> 1. Cloudflare Access in front of $DEPLOY_URL"
  if [[ "$CODE" == 302 && "$LOC" == *cloudflareaccess.com* ]]; then
    ok "HTTP 302 to ${LOC%%\?*}"
  else
    bad "expected 302 to …cloudflareaccess.com, got HTTP $CODE ${LOC:-(no redirect)} (if the login is paused on purpose: ACCESS_MODE=public)"
  fi
fi

echo "==> 2. Stack on $DEPLOY_HOST:$STACK"
REMOTE=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$DEPLOY_HOST" "
  cd $STACK 2>/dev/null || { echo 'NOSTACK'; exit 0; }
  echo \"ENVMODE \$(stat -c %a .env 2>/dev/null || echo missing)\"
  echo \"INDEX \$( [ -f site/index.html ] && echo yes || echo no )\"
  docker compose ps --format '{{.Service}} {{.State}} hostports:{{range .Publishers}}{{.PublishedPort}},{{end}}' 2>/dev/null | sed 's/^/SVC /'
  ss -Htln 2>/dev/null | awk '{print \"PORT\", \$4}'
") || { bad "ssh to $DEPLOY_HOST failed (BatchMode, key login)"; exit 1; }

if [[ "$REMOTE" == *NOSTACK* ]]; then
  bad "$STACK not found"
else
  [[ "$REMOTE" == *"ENVMODE 600"* ]] && ok ".env present, mode 600" || bad ".env missing or not mode 600 ($(print -r -- "$REMOTE" | grep ENVMODE))"
  [[ "$REMOTE" == *"INDEX yes"* ]] && ok "site/index.html deployed" || bad "site/index.html missing — run scripts/deploy.sh"
  for svc in web tunnel; do
    line=$(print -r -- "$REMOTE" | grep "^SVC $svc ")
    if [[ "$line" == *running* ]]; then ok "$svc running"; else bad "$svc not running (${line:-not listed})"; fi
    # Ports the image only declares show host port 0; any other host port is a published port
    hp="${line##*hostports:}"
    [[ -n "$(print -r -- ${hp//,/ } | tr ' ' '\n' | grep -vx '0' | grep .)" ]] && bad "$svc publishes a host port: $hp"
  done
fi

echo "==> 3. Listening TCP ports on the VPS (expected: 22, and 80/443 for the existing web server; loopback ignored)"
UNEXPECTED=$(print -r -- "$REMOTE" | awk '/^PORT/{print $2}' | grep -vE '^(127\.|\[::1\]|::1)' \
  | awk -F: '{print $NF}' | sort -u | grep -vxE '22|80|443')
if [[ -z "$UNEXPECTED" ]]; then ok "no unexpected listening ports"; else bad "unexpected listening port(s): $(print -r -- $UNEXPECTED | tr '\n' ' ')"; fi

echo
(( FAIL )) && { echo "Some checks failed."; exit 1; } || echo "All checks passed. Last manual check: open $DEPLOY_URL on a phone."
