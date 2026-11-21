# Deployment

The site is fully static (`dist/`). On the VPS it is served by a small Caddy container
(`deploy/compose.yml`) that publishes **no port**; the existing Cloudflare Tunnel reaches it
over a private Docker network. There is **no login** for now: anyone with the link can open it.
It is unlisted: `noindex` meta tag, `X-Robots-Tag` header and a disallow-all `robots.txt`.

```
phone/Mac ──HTTPS──▶ Cloudflare ──▶ Tunnel ◀── cloudflared (existing stack) ──▶ quartermaster-web (Caddy :80) ──▶ /opt/quartermaster/site
```

## One-time setup

1. **VPS** (as the non-root deploy user):
   ```sh
   sudo install -d -o deploy -g deploy /opt/quartermaster /opt/quartermaster/site
   ```
   From the Mac: `scp deploy/compose.yml deploy/Caddyfile deploy@SERVER:/opt/quartermaster/`
2. **Network:** the compose file joins the tunnel stack's network, by default
   `tom-dashboard_internal`. Check with `docker network ls`; if it differs, put
   `TUNNEL_NETWORK=<name>` in `/opt/quartermaster/.env`.
3. **First upload:** `cp deploy/deploy.env.example deploy.env`, fill in `DEPLOY_HOST`, then `npm run deploy`.
4. **Start:** `ssh deploy@SERVER 'cd /opt/quartermaster && docker compose up -d && docker compose ps'`
5. **Cloudflare:** Zero Trust → Networks → Tunnels → the existing tunnel → Routes → Add route →
   Published application: hostname `quartermaster.<your-domain>`, service `http://quartermaster-web:80`.
   Do **not** add an Access application for this hostname (no login wanted yet). Check that no
   wildcard Access application (`*.<your-domain>`) covers it either.
6. Open the link on a phone; `curl -sI https://quartermaster.<your-domain> | grep -i x-robots` shows `noindex`.

## Deploying

```sh
npm run deploy -- --dry-run   # build, test, show what would change
npm run deploy                # build, test, publish (rsync --delete); no restart needed
```

## Deploy on push (optional)

`.github/workflows/deploy.yml` does the same from GitHub Actions on every push to `main`, but only
once `DEPLOY_ENABLED=true` is set. It needs an SSH key that can do nothing but write into the site
directory, e.g. a dedicated key in the deploy user's `authorized_keys` restricted with
`command="rrsync /opt/quartermaster/site",restrict` (rrsync ships with rsync). Add secrets
`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan SERVER`), and variable
`DEPLOY_PATH=/` when the key is restricted with rrsync. Mind fail2ban:
a misconfigured key will get the GitHub runner's IP banned for an hour, which is harmless.

## Switching on an access gate later

Zero Trust → Access → Applications → Add → Self-hosted, domain `quartermaster.<your-domain>`,
login method One-time PIN, policy Allow → Emails → the friends you share with. No code change;
progress stays in each browser.
