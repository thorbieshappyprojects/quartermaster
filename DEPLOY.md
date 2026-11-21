# Deployment

The site is fully static (`dist/` after `npm run build`). It is unlisted: `noindex` meta tag, `X-Robots-Tag` header (`public/_headers`) and a disallow-all `robots.txt`.

## Cloudflare Pages (prepared, not active)

1. In Cloudflare: Workers & Pages → Create → Pages → "Direct upload", project name `quartermaster` (or let the first `wrangler pages deploy` create it).
2. Create an API token with **Cloudflare Pages: Edit** for the account.
3. In GitHub → Settings → Secrets and variables → Actions:
   - secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - variable `DEPLOY_ENABLED` = `true`
4. Push to `main` (or run the "Deploy" workflow manually). `.github/workflows/deploy.yml` builds, tests and publishes.
5. Custom domain: Pages project → Custom domains → add `quartermaster.<your-domain>` (the zone must be in the same Cloudflare account; Cloudflare creates the CNAME).

Manual deploy from a laptop: `npm run build && npx wrangler@4 pages deploy dist --project-name=quartermaster`.

## Switching on an access gate later

Cloudflare Zero Trust → Access → Applications → Add → Self-hosted, domain `quartermaster.<your-domain>` (and `*.quartermaster.pages.dev` for preview URLs). Policy: allow specific emails (one-time PIN) or a group. No code change is needed; progress stays in each browser.

## Alternative: existing VPS behind a Cloudflare Tunnel

Copy `dist/` into a directory served by any static file server (e.g. Caddy `file_server`; no rewrites needed because routing is hash based) and add a tunnel ingress rule for the subdomain.
