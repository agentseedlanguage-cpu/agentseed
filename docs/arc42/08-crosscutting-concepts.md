# 8. Crosscutting concepts

- **Honest status.** Statuses, counts, prices and claims come from data (catalogue, academy data) and are asserted by checks. Planned work is labelled planned. Credentials: none issued. Case figures: Illustrative.
- **Content security.** AES-256-GCM lessons; master key outside git; per-course derived keys (HMAC `course:<id>`; arc42 course uses master directly: legacy, see ADR-007). Access code bundles name and key.
- **Content Security Policy.** `site/_headers`: no third-party loads. Tests and `check` guard against adding any.
- **Verifiability.** `site-manifest.json` (format, kit, root, files); `/verify-site/`; deploy compares root hash.
- **Generated artifacts committed.** Generators are deterministic; run `npm run sync` and commit results; never hand-edit them.
- **Testing.** Pure functions (health checks, linters, deploy helpers) are unit-tested with Node scripts; cross-file consistency is checked by `check*.mjs`; one Playwright browser test covers key flows. CI runs `npm run verify`.
- **Error handling in APIs.** Each API returns JSON errors; amounts and counts are validated server-side against `OFFERS` and `ISSUABLE`; the AI receipt reading is advisory, human approval is required.
- **Accessibility and design.** Shared tokens and shell in the kit; light and dark themes; readable at phone width.
- **Privacy.** No analytics or third-party calls. Server stores only what purchases, certificates and the board need (names, emails or receipts as entered by users).
- **Configuration.** Prices and offers live in `pay-api.js` and the catalogue and must agree (checked; proposed to derive one from the other, ADR-018).
- **Documentation as code.** arc42 in `docs/arc42/`, ADRs in section 9, `CLAUDE.md` for session hand-over, `CHECKPOINTS.md` for history.
