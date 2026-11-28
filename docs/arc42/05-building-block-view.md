# 5. Building block view

## 5.1 Level 1: the system

```
 repo ──(npm run sync)──> generated files ──(assemble)──> dist/ ──(deploy)──> Cloudflare Pages: meeting-mind.com
                                                                          └─ Functions: /api/board  /api/cert  /api/pay  ── D1, Workers AI, secrets
```

| Block | Folder | Responsibility |
|---|---|---|
| Shared shell (kit) | `site/kit/` | Tokens, shell CSS/JS, markdown renderer, theme init. Versioned (`VERSION`), copied into each product by `sync-kit`. |
| Company site | `site/` | Home, training, academies, consulting, industries, verify-site. |
| Product sites | `products/<name>/site/` | One static site per product, assembled under `/<name>/`. |
| Build tools | `tools/` (about 60 files) | Generators, checks, tests, deploy. |
| Course sources | `training-private/<course>/` | Lesson source in compact format. |
| APIs | `functions/api/*`, `worker/*` | Board (leaderboard), cert (certificates), pay (purchases). |
| Documentation | `docs/`, `CLAUDE.md`, `CHECKPOINTS.md` | Architecture, plans, history, state transfer. |

## 5.2 Level 2: build tools by concern

| Concern | Files |
|---|---|
| Assemble and fingerprint | `assemble.mjs`, `manifest.mjs`, `sync-kit.mjs`, `prerender.mjs` |
| Pages and catalogue | `build-training.mjs`, `build-catalog.mjs`, `catalog-html.mjs`, `training-shell.mjs`, `my-courses-html.mjs`, `lab-html.mjs` |
| Academies | `build-cyber-academy.mjs` + `cyber-academy/`; `build-arch-academy.mjs` + `arch-academy/` (`levels`, `meta`, `sources`, `data`); `build-ai-business-academy.mjs`; `build-consulting.mjs`; `build-industries.mjs` |
| Course engine | `build-course.mjs` (encrypt, emit, dispatch to each course), `cyber-course.mjs` (shared engine files and helpers), `foundations-course.mjs`, `level-course.mjs`, `agent-course.mjs` |
| Per course | `*-health.js` (pure checks), `*-tools/` (practice tools), `test-*.mjs` |
| Access | `code.mjs` (COURSES list, access codes), `course-code.mjs`, `course-check.mjs` |
| Quality gates | `check.mjs`, `check-links.mjs`, `check-cyber-claims.mjs`, `check-*-academy.mjs`, `browser-test.mjs` (Playwright) |
| Release | `deploy.mjs`, `deploy-lib.mjs` (pure, tested), `deploy.config.json`, `doctor.mjs`, `serve.mjs` |

## 5.3 Level 2: the course engine pattern

`cyber-course.mjs` holds the shared browser engine files (`engineFiles`), the compact lesson parser (`fromCompact`) and `slug`. `foundations`, `level` and `agent` modules import them and adapt wording by `replaceAll` on the engine source (a text patch, see risk R-07). `build-course.mjs` calls each module's `load(SITE)` and `buildOne(...)` with that course's derived key. The newest instance is `agent-course.mjs` (Level 4).

## 5.4 Where the per-course registries are (the coupling map)

Adding or changing a course touches these shared places. This is the main reason independent chats collide (risk R-01):

| Shared place | What a course adds |
|---|---|
| `tools/build-course.mjs` | An import block and a `buildOne` call |
| `worker/pay-api.js` | Entry in `OFFERS` (price, welcome and learn paths) |
| `worker/cert-api.js` | Entry in `ISSUABLE` (lessons, sections, checks, questions) |
| `tools/code.mjs`, `tools/test-code.mjs` | Entry in `COURSES` and the expected list |
| `site/training/catalog.json` | Modules, lab, outcomes, `course` block, `prices` |
| `site/kit/shell.js` (about line 107) | Course path list for navigation |
| `package.json` | Test script entry; sync chain if a new generator |
| `tools/browser-test.mjs` | Cases for the course |
| `tools/arch-academy/*` or `cyber-academy/*` | Level status, evidence, counts |

Proposed target (ADR-015, ADR-018): each course declares itself in one manifest file `courses/<id>/course.json` (price, certificate rules, paths, catalogue fragment, owner), and the shared files read a generated registry instead of being edited by hand.
