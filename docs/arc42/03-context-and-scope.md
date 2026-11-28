# 3. Context and scope

## 3.1 Business context

| Partner | Direction | Content |
|---|---|---|
| Visitor / learner | in, out | Pages, lessons (decrypted in the browser with an access code), practice tools, certificate request, leaderboard entry. |
| Buyer | in | Chooses an offer, pays by bank deposit, uploads a receipt. |
| Owner | in | Reviews receipts on the owner review page, approves, receives phone alerts. |
| Search engines | out | `sitemap.xml`, `robots.txt`, prerendered pages. |

## 3.2 Technical context

| Neighbour | Interface | Notes |
|---|---|---|
| Cloudflare Pages | Wrangler direct upload of `dist/` (branch main) | Serves everything on meeting-mind.com. Direct upload bypasses the GitHub integration. |
| Cloudflare D1 | `env.DB` | Purchases, codes, certificates, leaderboard. |
| Cloudflare Workers AI | `env.AI`, model `@cf/meta/llama-3.2-11b-vision-instruct` | Reads receipt images. Output is advisory; the owner approves. |
| ntfy | HTTPS push | Phone alerts to the owner. |
| GitHub | git push; Actions workflow `check.yml` | CI runs `npm run verify`. CI does not deploy. |
| iSAQB, arXiv, vendor pages | Read by authors only | Sources cited in lessons; none loaded at run time. |

## 3.3 Scope boundary
In scope: the repository and the one Pages project. Out of scope: Cloudflare account settings and DNS (they matter: see risk R-02), the owner's bank, the ntfy service.
