# 13. Amendment log

## cp43 (2026-11-27): architecture review and rewrite
Why: the arc42 set was written early and still described subdomain-per-product, no backend, no build step and manual payment. The system grew by functional need into one static build, three D1-backed APIs and four course engines. The documents were replaced, not patched.

Method: read the repository (tools, worker, functions, deploy, manifest, headers, CI, kit, old arc42), reconstructed ADR-001 to 013 from the code, added ADR-014 to 019, wrote the risk register and quality scenarios. Not verified from outside the repo: Cloudflare dashboard settings (bindings, domain attachment, D1 schema); these are stated as unverified in R-02.

Changed in code (tested): `tools/deploy.mjs` now refuses preview branches and other projects unless explicitly overridden, refuses a checkout behind `origin/main`, and verifies the live site by manifest root hash; pure helpers in `tools/deploy-lib.mjs` with `tools/test-deploy-lib.mjs` (added to `npm test`).

Added: `CLAUDE.md` (state transfer for any chat), this log, sections 1 to 12 rewritten.

Not done (proposed, in order): ADR-019 ownership guard; ADR-018 split catalogue; ADR-015 course manifests; ADR-016 secrets via bindings; ADR-017 infrastructure as code; R-07, R-09, R-10 refactors.

Rule for future amendments: every checkpoint that changes structure appends an entry here, updates the affected section and `CLAUDE.md`, and marks ADR status.
