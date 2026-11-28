# 2. Constraints

## Technical
- Static output only; no server-side rendering. Dynamic behaviour lives in three Cloudflare Pages Functions backed by D1 (SQL database) and Workers AI.
- Node 20 or newer; no runtime dependencies; Playwright is the only dev dependency (browser test).
- Strict Content Security Policy (`site/_headers`): no third-party scripts, fonts or analytics.
- Bindings (D1 `DB`, `AI`, `SECRETS`, `BOARD_PROOF`) are configured in the Cloudflare dashboard, not in code.

## Organisational
- Single maintainer. Claude chat sessions contribute but cannot push; work arrives as overlay zips that the owner commits and deploys.
- Generated files (ciphertext courses, generated pages, sitemap, manifest) are committed to git; `dist/` is not.
- The course master key lives outside the repository (`.course-key` or `COURSE_KEY`).

## Conventions
- Plain language, acronyms spelled out, dates dated, sources named; invented case figures labelled Illustrative.
- No credential is issued by Intellica; independent self-study is not an iSAQB (International Software Architecture Qualification Board) course.
- Deploy to the main domain only (ADR-004, ADR-014).
