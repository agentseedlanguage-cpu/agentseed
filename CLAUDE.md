# CLAUDE.md: state transfer for any new chat

Read this first. It lets a new chat start work without the whole repo being uploaded. Last updated: checkpoint 43 (2026-11-27). If it disagrees with the code, the code wins; fix this file in the same change.

Repo `agentseedlanguage-cpu/intellica`, package `intellica-web`, live at https://meeting-mind.com. Owner works in plain language: spell out acronyms, keep replies short.

## 1. What the system is

One static website plus three small APIs, published as ONE Cloudflare Pages project (`intellica-web`) on the domain meeting-mind.com.
- `site/` is the company home, training pages, academy pages, consulting, industries, `site/kit/` (shared shell: styles, scripts, version).
- `products/<name>/site/` are product sites (verichain, vericrypt, sovereign-erp, omc, agentseed). They are copied into the one build under `/<name>/`. There are no subdomains.
- `tools/assemble.mjs` builds `dist/` (git-ignored). `tools/manifest.mjs` writes `site-manifest.json` (a fingerprint of every served file). `/verify-site/` lets anyone check it.
- `functions/api/{board,cert,pay}/[[route]].js` are thin wrappers over `worker/{board,cert,pay}-api.js`. They use Cloudflare D1 (`env.DB`), Workers AI (`env.AI`), `env.SECRETS`, `env.BOARD_PROOF`. Those bindings are set in the Cloudflare dashboard (not in the repo).
- Paid courses are encrypted (AES-256-GCM) lesson files committed to git. The master key is NOT in the repo: `.course-key` (git-ignored) or env `COURSE_KEY`. Per-course keys are derived from it (`course:<id>`); the arc42 course uses the master key directly. Never ask the owner to paste the key.
- Payment is bank deposit: buyer uploads a receipt, an AI vision model reads it, the owner approves on a review page, an access code is issued (`tools/code.mjs`). Phone alerts via ntfy.

## 2. Academies and courses (status at cp42/cp43)

| Area | State |
|---|---|
| Architecture Academy (`tools/arch-academy/`, `build-arch-academy.mjs`) | Levels 1 to 4 live as courses; Level 5 (Governance and Evolution) is next; Level 6, platform foundations, beta, credential launch are later. 69 lessons live, 24 outlined. |
| Level 1 Foundations (`foundations-course.mjs`, `training-private/foundations/`) | Live. Question bank is 206 and there are 5 mock papers (cp44). The 82 added items (`bank-c1n.mjs`, `bank-c3n.mjs`, `bank-c4n.mjs`) were written by Claude in cp44 WITHOUT owner review; the owner reviews them while taking the course and reports problems. The owner's older 82 questions (`bank-c1x/c3x/c4x.mjs`) were never found and are replaced by these. Independent self-study, not an iSAQB course. |
| Level 2 Mastering arc42 | Live (arc42 course, master key used directly). |
| Level 3 Quality, Decisions, Evaluation (`level-course.mjs`) | Live, 20 lessons, US$199. |
| Level 4 Agentic AI Architecture (`agent-course.mjs`, `agent-health.js`, `agent-tools/`, `training-private/agentic-architecture/`) | Live first edition (cp42): 16 lessons, US$249 / TT$1,749. Independent self-study, not AGENTA training, no iSAQB credit. No outside review yet (gap G11). Lessons 1 and 7 free. |
| Cyber Academy (`cyber-course.mjs`, `tools/cyber-academy/`, `cyber-tools/`) | Live; Level 2 is 28 lessons, US$399. |
| AI Business Academy, consulting, industries | Generated pages from `build-ai-business-academy.mjs`, `build-consulting.mjs`, `build-industries.mjs`. |

Honesty rules (do not weaken): no Intellica academy credential is issued; certificates are self-reported and checked against `ISSUABLE` in `worker/cert-api.js`; Level 1 and Level 4 are independent self-study with no iSAQB credit; case figures in lessons are invented and labelled Illustrative.

Pending work, in order: (1) fix Level 1 questions the owner flags; (2) Levels 1 to 3 improvements (`docs/CP41-RESEARCH-AND-BUILD-PLAN.md` section 4); (3) Level 5 research and build (`docs/CP42-LEVEL-4-AND-NEXT-PLAN.md` section 4); (4) marketing-eye audit of all training/academy sub pages; (5) outside review of Level 4; (6) the architecture improvements in `docs/arc42/11-risks-and-technical-debt.md` and `docs/arc42/09-architecture-decisions.md` (ADR-014 to ADR-019).

## 2a. Reading course content without the key

The key is only needed to ENCRYPT. Every course's plain text is already in the repo: `training-private/<course>/` (Level 1 foundations, Level 3 quality-decisions, Level 4 agentic-architecture, plus `cybersecurity-source.json` and `arc42-quiz.json`) and the Level 2 slide deck at `site/training/arc42/deck-*/slides.js`. A chat given the repo (or just `training-private/` and `site/training/catalog.json`) can read every lesson, quiz and rubric. Do this before writing any new level: read the neighbouring levels and the catalogue, list what they already teach, and avoid overlap (cross-level uniqueness check). Never ship `.course-key`.


## 3. Commands

- `npm test` runs every unit test. `npm run sync` runs the whole generation chain (needs the course key). `npm run check` validates the site and links. `npm run gate` = test + sync + check. `npm run verify` = gate + Playwright browser test (CI runs this).
- `npm run training` regenerates training, catalogue and academy pages WITHOUT needing the course key. Use this in throwaway work.
- Sync order matters: training, catalog, cyber academy, arch academy, AI business academy, consulting, industries, course, sync-kit, prerender, manifest, assemble.
- Do not run `npm run sync` in a tree without `.course-key` unless you set a random temporary `COURSE_KEY` in a throwaway copy, and never ship what that produces (ciphertext made with a temporary key would lock out buyers).

## 4. Deploying to the main domain (no dev or preview links)

The ONLY deploy command is:

    npm run deploy -- home

It runs the gate, builds `dist/`, uploads it with Wrangler direct upload to the project `intellica-web` on branch `main`, then fetches https://meeting-mind.com/site-manifest.json and prints VERIFIED only if the live fingerprint equals the upload. If it prints NOT LIVE YET, the domain is attached to a different project: run `npm run deploy:where`, find the project that lists meeting-mind.com, and use the override described in the message.

Never do these (they create throwaway `*.pages.dev` or preview sites, which has caused past mistakes):
- `--branch=<anything but main>` (refused by the tool unless `--preview` is added; do not add it)
- `--project=<other>` (refused unless `--allow-other-project`; only for the case above)
- `wrangler pages deploy` typed by hand, or a deploy from a different tool or the Cloudflare GitHub integration.
The deploy tool also refuses when the checkout is behind `origin/main` (a stale checkout would publish old pages over newer work); fix with `git pull --rebase`. `--no-git-check` skips that and should not be used.

Secrets: during a deploy the tool temporarily writes real values into `worker/secrets.js` and `worker/proof.js` and restores the placeholders (`SECRETS = null`, `PROOF = ''`) afterwards. If a deploy is interrupted, run `git diff worker/` and restore the placeholders BEFORE any `git add -A`. Never commit real values.

Needs env: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the course key.

## 5. How work is delivered (the owner commits and deploys; Claude cannot push)

Deliver ONE overlay zip: changed files only, paths from the repo root, no keys, no `dist/`, no ciphertext course directories made with a temporary key, no `site-manifest.json`. Always give the command in the owner's format:

    unzip -o <zip> && rm <zip> && git add -A && git commit -m "cpNN" && git push && npm run deploy -- home

When the deploy creates generated course files, add a second `git add -A && git commit -m "cpNN generated" && git push`. Claude commits only if asked; if it does, end messages with the attribution lines the session gives.

## 6. Rules for parallel chats (one academy per chat)

Until the proposed isolation work is done (arc42 chapter 5 and ADR-015), these files are SHARED by all academies and are where chats collide. Edit them minimally, change only your own entries, and say so in the overlay notes:
`site/training/catalog.json`, `tools/build-course.mjs`, `worker/pay-api.js` (OFFERS), `worker/cert-api.js` (ISSUABLE), `tools/code.mjs` (COURSES), `tools/test-code.mjs`, `package.json` (test and sync scripts), `site/kit/shell.js` (course path list near line 107), `tools/browser-test.mjs`, `CHECKPOINTS.md`, `tools/cyber-course.mjs` (the shared course engine lives here; other engines import `engineFiles`, `fromCompact`, `slug` from it and patch its text with `replaceAll`, so a change to wording there can silently break them).
Rules: an overlay zip replaces whole files, so a chat working from an old copy of a shared file will erase another chat's lines. Start every chat by uploading (or being given) the current version of any shared file you must edit, and diff before delivering. One chat owns `package.json` and `catalog.json` merges at a time; the owner says which.
Safe to edit freely inside one academy: its own `training-private/<course>/`, its own `tools/<course>-course.mjs`, `*-health.js`, `*-tools/`, `test-<course>.mjs`, `tools/<academy>/`.

## 7. Where things are

- Course source: `training-private/<course>/` (compact lesson format). Engine: `tools/<course>-course.mjs`. Health check: `tools/<course>-health.js`. Practice tools: `tools/<course>-tools/`. Tests: `tools/test-<course>.mjs`.
- Adding a new course touches: `build-course.mjs`, `pay-api.js` OFFERS, `cert-api.js` ISSUABLE, `code.mjs` COURSES and `test-code.mjs`, catalogue `course` block and `prices`, `package.json` test script, the academy's level data, kit nav if it needs a path. Copy `agent-course.mjs` as the newest example.
- Generated and committed (do not hand-edit): ciphertext course directories, generated training/academy pages, sitemap, `site-manifest.json`, product kit copies under `products/*/`.
- Architecture documentation: `docs/arc42/` (read 03, 05, 07, 09, 11 first). Plans: `docs/CP41-*.md`, `docs/CP42-*.md`. History: `CHECKPOINTS.md`.

## 8. Working style for Claude

Work sequentially, save to disk, no parallel agent fan-outs (one caused a usage-limit failure). State sources and dates for any research used in course content, mark invented figures, never invent real names. Run `npm test` and `npm run check` (with `npm run training`) in a throwaway copy before delivering. Update this file and `CHECKPOINTS.md` in every checkpoint.
