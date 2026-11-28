# 7. Deployment view

## 7.1 Infrastructure

| Node | What runs | Managed in |
|---|---|---|
| Cloudflare Pages project `intellica-web` | Static files from `dist/` and Functions from `functions/` | Wrangler direct upload (code); dashboard (domain, bindings) |
| D1 database | Tables for purchases, codes, certificates, board | Dashboard |
| Workers AI | Vision model | Dashboard binding `AI` |
| GitHub | Source, CI (`.github/workflows/check.yml` runs `npm run verify`) | Repository |
| Owner machine | Course key, API token, deploys | Local |

There is exactly one production target: `home` in `tools/deploy.config.json` = `{dir:'dist', project:'intellica-web'}`.

## 7.2 The one allowed deploy path
`npm run deploy -- home` (branch main, project from config). Safeguards in `deploy.mjs` (cp43): a non-main branch needs `--preview`; another project needs `--allow-other-project`; a checkout behind `origin/main` is refused; success is claimed only when the live manifest root hash equals the upload. Branch main of the production project is the production deployment; any other branch or project yields a separate `*.pages.dev` address that visitors do not use. Past mistakes came from uploading to such addresses.

## 7.3 Secrets during deploy
`worker/secrets.js` (`SECRETS = null`) and `worker/proof.js` (`PROOF = ''`) are committed as placeholders. The deploy tool writes the real values, uploads, then restores the placeholders. Risk R-03: an interrupted deploy can leave real values in the working tree. Proposed fix (ADR-016): read secrets from Pages environment bindings only, so no file is rewritten.

## 7.4 Not in code
D1 schema, bindings, custom domain attachment and the API token are in the dashboard/owner machine with no infrastructure-as-code (risk R-02). A `wrangler.toml` plus migrations folder is proposed (ADR-017).
