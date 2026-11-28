# 9. Architecture decisions

Format: context, decision, consequences, status. ADR-001 to ADR-013 record decisions already in force (reconstructed at cp43 from the code; the reasons given are the evident ones, not recollections). ADR-014 to ADR-019 are new and proposed unless marked Accepted.

| ID | Decision | Status |
|---|---|---|
| ADR-001 | One domain, one site, products under paths (not subdomains). Replaces the early subdomain-per-product design. | Accepted |
| ADR-002 | Static build to `dist/` by plain Node scripts; no framework, no runtime dependencies. | Accepted |
| ADR-003 | Shared shell as a versioned kit copied into each product (`sync-kit`). | Accepted |
| ADR-004 | Deploy by Wrangler direct upload of `dist/` to one Pages project, branch main, bypassing the GitHub integration. Consequence: CI does not deploy; the owner's machine is the release authority. | Accepted |
| ADR-005 | Three small APIs as Pages Functions over D1 and Workers AI, thin wrappers over testable `worker/*-api.js`. | Accepted |
| ADR-006 | Purchase by bank deposit, AI-read receipt, human approval, access code. Consequence: bank details sit in public `pay-api.js`; acceptable as they are payee details, but review (R-06). | Accepted |
| ADR-007 | Paid lessons encrypted with AES-256-GCM, per-course keys derived from one master key; ciphertext committed. Consequence: losing the master key loses the courses; leaking it exposes all. | Accepted |
| ADR-008 | Course engine pattern with per-course modules and health checks; engines adapted by text patching. Consequence: fast to add courses, brittle coupling (R-07). | Accepted |
| ADR-009 | Certificates are self-reported and checked against issuable rules; no Intellica credential is issued. | Accepted |
| ADR-010 | Leaderboard gated by a proof derived from the key, injected at deploy. | Accepted |
| ADR-011 | Strict CSP, no third-party loads. | Accepted |
| ADR-012 | Self-verification by manifest and `/verify-site/`. | Accepted |
| ADR-013 | Generated artifacts committed to git; `dist/` ignored. Consequence: noisy diffs, stale-generated risk, two-commit deploys. | Accepted |
| ADR-014 | Deploy guard rails: main branch and configured project only; refuse stale checkout; verify by manifest root hash, not kit version. Implemented in `deploy.mjs`/`deploy-lib.mjs` with tests (cp43). | Accepted (cp43) |
| ADR-015 | Course manifest and generated registry: each course declares price, certificate rules, paths, catalogue fragment and owner in `courses/<id>/course.json`; `build-course`, `pay-api` OFFERS, `cert-api` ISSUABLE, `code.mjs`, kit nav and academy data read the generated registry. Removes the shared-file edits listed in 5.4. | Proposed |
| ADR-016 | Secrets only through Pages environment bindings; stop rewriting `worker/secrets.js` and `proof.js` at deploy. | Proposed |
| ADR-017 | Infrastructure as code: `wrangler.toml` with bindings and `migrations/` for D1; a documented rebuild from zero. | Proposed |
| ADR-018 | Split `catalog.json` into per-course fragments merged at build; derive `OFFERS` prices from it (single source of truth). | Proposed |
| ADR-019 | Ownership guard: `OWNERS.json` maps path globs to academies; a tool compares an overlay zip with it and fails when a chat's zip touches another academy's files or a shared file without declaring it. Plus CI check that generated files are current. | Proposed |

## Sequencing of the proposals
1. ADR-019 (ownership guard) first: small, protects immediately. 2. ADR-018 then ADR-015: do one course (Level 4) as the pilot, then migrate others one per checkpoint, each with unchanged built output (compare manifest root before and after). 3. ADR-016 and ADR-017 need the owner at the Cloudflare dashboard.
