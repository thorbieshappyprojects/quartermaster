# Deployment

The site is fully static (`dist/`). On the VPS it runs as its own Compose project in `/opt/quartermaster`:
a Caddy container (`web`) and its own Cloudflare Tunnel connector (`tunnel`) on a private network. It publishes
**no port** and shares nothing with the other stacks on the server — never touch those.
There is **no login** for now: anyone with the link can open it. It is unlisted (`noindex` meta tag,
`X-Robots-Tag` header, disallow-all `robots.txt`).

```
phone/Mac ──HTTPS──▶ Cloudflare ──▶ Tunnel "quartermaster" ◀── tunnel (cloudflared) ──▶ web (Caddy :80) ──▶ ./site
```

| File | Purpose |
|---|---|
| `scripts/deploy.sh` | build a clean export of HEAD, test, refuse unsafe builds, rsync `dist/` to `/opt/quartermaster/site` |
| `scripts/deploy_verify.sh` | read-only checks: public URL, stack state, `.env` mode, no published ports |
| `deploy/compose.yml` | project `quartermaster`: `web` (Caddy, read-only) and `tunnel` (cloudflared), internal network only |
| `deploy/Caddyfile` | static serving, `noindex`, security and cache headers |
| `deploy/deploy.env.example` | template for the local, gitignored `deploy.env` |

Rules: secrets never pass through a chat or the repo; the tunnel token is written to the server by the owner only.
SSH as the non-root deploy user with a key (`-o BatchMode=yes`); fail2ban bans for an hour after 5 failed logins.

## One-time setup

### 1. Cloudflare (owner, in the dashboard)

1. Zero Trust → Networks → Tunnels → **Create a tunnel** → *Cloudflared* → name `quartermaster`. Pick **Docker**
   and copy only the token (the long string after `--token`, starting `eyJ`). Don't run the shown command;
   never press "Refresh token".
2. Tunnel → **Routes → Add route → Published application**: hostname `quartermaster.<your-domain>`,
   service URL `http://web:80`.
3. No Access application for now. Make sure no wildcard Access application covers the hostname.

### 2. VPS

```sh
sudo install -d -m 750 -o deploy -g deploy /opt/quartermaster /opt/quartermaster/site
scp deploy/compose.yml deploy/Caddyfile deploy@SERVER:/opt/quartermaster/      # from the Mac
```

**Token (owner only).** Run this, then on the empty line type `TUNNEL_TOKEN=`, paste the token, press Enter and
then Ctrl-D. The token goes straight into the file on the server, not into shell history or a chat:

```sh
ssh deploy@SERVER 'umask 077 && cat > /opt/quartermaster/.env'
```

### 3. Local config, first deploy, start

```sh
cp deploy/deploy.env.example deploy.env     # gitignored: DEPLOY_HOST, DEPLOY_URL, ACCESS_MODE=public
npm run deploy -- --dry-run && npm run deploy
ssh deploy@SERVER 'cd /opt/quartermaster && docker compose up -d && docker compose ps'
zsh scripts/deploy_verify.sh                # all PASS expected; the tunnel shows "Healthy" in Zero Trust
```

## Deploying

```sh
npm run deploy -- --dry-run   # build HEAD, test, show what would change
npm run deploy                # publish; Caddy serves the new files at once, no restart needed
```

## Deploy on push (optional)

`.github/workflows/deploy.yml` does the same from GitHub Actions on every push to `main`, but only once
`DEPLOY_ENABLED=true` is set. It needs an SSH key that can do nothing but write into the site directory, e.g. a
dedicated key in the deploy user's `authorized_keys` restricted with
`command="rrsync /opt/quartermaster/site",restrict`. Add secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
`DEPLOY_KNOWN_HOSTS` (`ssh-keyscan SERVER`) and variable `DEPLOY_PATH=/` (rrsync paths are relative).

## Switching on an access gate later

Zero Trust → Access → Applications → Add → Self-hosted, domain `quartermaster.<your-domain>`, session 24 h,
login method One-time PIN, policy Allow → Emails → the friends you share with. Then remove `ACCESS_MODE=public`
from `deploy.env`; `deploy_verify.sh` then expects the redirect to Cloudflare Access. No code change; progress
stays in each browser.
