# Checkpoint 44: Level 1 question bank 206 and five mock papers

**Questions.** 82 new original items (chapter 1: 10, chapter 2: 14, chapter 3: 30, chapter 4: 18, chapter 5: 10) in `training-private/foundations/bank-c1n.mjs`, `bank-c3n.mjs`, `bank-c4n.mjs`. They test only R1 and R2 learning goals (the validator rejects R3-only goals), each wrong option has a misconception note. Not yet reviewed by the owner.
**Mocks.** `assemble()` now builds 5 forms of 40 (quota per chapter 5/7/14/9/5, bank has 26/36/72/46/26). Wording changed from three to five in the catalogue, course pages, academy data, tests and browser test; the academy check now requires 5 mocks. Practice-ready guidance (80 percent on three different mocks, no chapter below 70) is unchanged.
**Also in this zip (cumulative from cp42).** cp43 documents and deploy tool, CLAUDE.md update.
**Checked.** `npm test`, `npm run sync` and `npm run check` pass in a throwaway copy with a temporary key. The browser test could not be run reliably in the build sandbox (fonts and timing); CI or your machine must run `npm run verify`.
**Deploy.** `npm run deploy -- home`, then commit the generated course files.

---

# Checkpoint 43: architecture amendment, CLAUDE.md state transfer, safer deploy

**Docs.** `docs/arc42/` rewritten to the real system (sections 1 to 12, new `13-amendment-log.md`): ADR-001 to 013 reconstructed, ADR-014 to 019 added (guard rails accepted; ownership guard, course manifests, split catalogue, secrets via bindings, infrastructure as code proposed), risk register R-01 to R-14, quality scenarios. New root `CLAUDE.md` for any new chat.
**Code.** `tools/deploy.mjs`: refuses preview branches and other projects without explicit flags, refuses a checkout behind origin/main, verifies the live site by manifest root hash. `tools/deploy-lib.mjs` and `tools/test-deploy-lib.mjs` (in `npm test`).
**Not done.** The proposed ADRs; the Level 1 questions; Level 5. See `CLAUDE.md` section 2.
**Deploy.** `npm run deploy -- home`.

---

# Checkpoint 42: Level 4 Agentic AI Architecture built (first edition)

**Course.** 16 lessons, 16 lab steps with model answers and rubrics, 48 recall questions, lessons 1 and 7 free. Rules checker and tool contract checker. Health check has six checks, including "every rule names VERIFIED_BY or REVIEWED_BY". Price US$249 / TT$1,749. Source in `training-private/agentic-architecture/`.
**Wiring.** `tools/agent-course.mjs`, `tools/build-course.mjs`, `worker/pay-api.js`, `worker/cert-api.js`, `tools/code.mjs`, `tools/test-agent.mjs` (added to `npm test`).
**Academy.** Level 4 live; live lessons counted from the catalogue (69 live, 24 outlined); roadmap, gap G11 and source S18 added.
**Not done.** 82 extra Level 1 questions (files not in the repo), improvements to Levels 1 to 3, Level 5 build. See `docs/CP42-LEVEL-4-AND-NEXT-PLAN.md`.
**Deploy.** `npm run deploy -- home` builds the Level 4 course files with your key; commit them afterwards.

# Checkpoint 41: Level 4 outline rebuilt against AGENTA, source register, research brief

**Level 4 outline.** Rebuilt against the official iSAQB AGENTA curriculum (2026.1-rev5, read 2026-11-27): 4 modules, 16 lessons, 8 lab steps, a new health check ("every rule names the check that verifies it, or says a person reviews it"). Still "In development": no course, no price, no credential.
**Academy pages.** Level 4 mapping states what was read; source register adds S13 to S17 (AGENTA, MCP update press report, focus group, A-SAW, harness study) and corrects S8.
**Plan.** `docs/CP41-RESEARCH-AND-BUILD-PLAN.md`: deploy path to meeting-mind.com, sources and their limits, changes for Levels 1 to 3, Level 4 design.
**Not changed.** Lesson text, encrypted data, payments, keys, certificates. Checks and tests pass; browser test not run.

# Checkpoint 38: Training page restructured around three academies

**Training page.** The hero is now a small title, "Choose your academy", with three equal cards first: Software Architecture, Cyber Security for the AI Age, and AI for Business. Each card lists its six levels or courses and has its button at the bottom. The four fact boxes come next, then the page buttons. The long title and write-up are gone.

**Third academy.** "AI for Business Academy" at `/training/ai-business-academy/`, built by `tools/build-ai-business-academy.mjs` from `catalog.json` (`academies` entry `aibusiness`, six courses). All six are in development and are marked that way. Standalone course breadcrumbs now read Training / AI for Business Academy / course.

**Categories.** The catalogue tracks are now `cyber` (the six cyber levels, with Level 2 as the live 28-lesson course) and `aibiz` (six courses). The old "Build and secure" and "Run and grow" groups are removed.

**Academy pages.** Smaller titles, and small boxes for each academy's levels or courses in the hero. Cyber breadcrumb now reads Training / Cyber Security Academy.

**Checks.** `npm run check` includes the new page check. Browser test selector updated (not run).

# Checkpoint 37: Training polish (fonts, hero, cards) and the Architecture Academy rebuilt to match the Cyber Security Academy

**Fonts.** The font files in `site/assets/fonts` were never loaded: no `@font-face` existed, so every visitor saw their own device font. `site/kit/shell.css` now declares IBM Plex Sans (text), Bricolage Grotesque (headings) and IBM Plex Mono (labels), all self-hosted, with `font-display: swap`. `tokens.css` has `--font-sans`, `--font-display`, `--font-mono`. Kit files and the font files are copied to every product site by `tools/sync-kit.mjs`.
**Training page.** Hero cards are now three equal panels with compact link rows (no dead space, no mid-word breaks, mobile-friendly). Shorter academy and course copy. Planned levels say "Planned" and "See the outline". Two wide academy cards. Trust strip no longer wraps.
**Architecture Academy.** One thin page became 13 pages in the same layout as the Cyber Security Academy: overview, six levels, pathways, lesson map, iSAQB curriculum mapping (including the 2027.1 release candidate, read 2026-11-25), standards and sources, certification policy, roadmap and gap register. Data in `tools/arch-academy/`, builder `tools/build-arch-academy.mjs`, checker `tools/check-arch-academy.mjs` (in `npm run check`). Lesson titles, counts and free lessons are read from the live catalogue. Wired into `npm run training` and `npm run sync`.
**Breadcrumbs.** Architecture level pages now link to the Architecture Academy and the matching academy level page.
**Not changed.** No course content, lesson text, encrypted data, payments, keys or certificates.

# Checkpoint 36: Level 1 Software Architecture Foundations built, Architecture Academy page, refund terms

**Level 1 is a live online course** (`software-architecture-foundations`, US$149 / TT$1,049). 14 lessons in six modules, 8 slides each (112), 5 quiz questions per lesson (70), a field guide, worked case, lab (14 sections) and rubric per lesson, one health check of 6 items, and a certificate rule in `worker/cert-api.js` (14 lessons, 14 sections, 6 checks, 70 questions). Free lessons: 1 and 10. Source in `training-private/foundations/`; the topic list in `curriculum-map.json` follows the iSAQB CPSA-F curriculum 2025.1 (read 2026-11-24). It is independent self-study, not an iSAQB course; Intellica is not an accredited provider.
**Mock exams.** 124 original practice items (116 single choice, 5 choose-N, 3 allocation) build three papers of 40 with fixed chapter quotas (5/7/14/9/5), 75 or 90 minute exam mode and a practice mode, graded by Intellica's practice scoring, with a readiness report (80 percent on three different mocks, no chapter below 70 percent: Intellica guidance, not a guarantee). Paper data is encrypted per course like lessons.
**Architecture Academy page** `/training/architecture-academy/`: the six levels with honest statuses (open or planned), how the academy works, and what it is not. Linked from the catalogue.
**Refunds and wording.** 7-day refund terms and the bank-deposit access text are on every course FAQ. The arc42 purchase title is now "Mastering arc42, online course".
**Tests.** `tools/test-foundations.mjs` (in `npm test`): source validation, scoring rules, mock assembly, catalogue/worker/code agreement. Browser test covers Level 1 pages, free and locked lessons, slide fit for all 14 lessons, mock page and encrypted data, academy page.
**Honest limits.** The bank is a first edition, checked by machine, not by a human reviewer; the blueprint's 600-item bank is not met. Goal 04-04 title is unconfirmed. The 2027.1 curriculum (AI topics) is a release candidate and not covered as exam content. OPA is still unverified here.
**Encryption.** Level 1 ciphertext in this zip uses a temporary key. Run `npm run deploy -- home` with your own `.course-key` to re-encrypt it. Unchanged courses keep checkpoint 33 ciphertext.

# Checkpoint 35: Cybersecurity course upgrade (audit C1 to C9, local lab kit, standards gaps)

**Page truth (C1 to C3, C5).** The course page now shows the real 28-section lab and the five real health checks. The health check is described as a completeness check, not a judge of your design. "Build and attack your own agent setup" and "run authorised red-team tests" are reworded: the labs are design and planning work, attacks run only in the local kit on synthetic data. Module notes are filled, so "undefined" is gone. `tools/build-catalog.mjs` now refuses to write any page containing undefined, NaN, [object or null.
**Reference lab kit (C4).** `agent-lab-kit.mjs`: one Node file, no packages, no network. 18 seeded flaws from lessons 14 and 22 to 28 (audience, token passthrough, SSRF on discovery, issuer mix-up, state-handle hijack, scope, delegation, revocation, expiry, egress, file paths, poisoned memory and tool descriptions, rug pull, shadowing, approval TOCTOU, tainted egress). Each has a reference control that blocks it and an unsafe baseline that misses it. New course pages: Reference lab kit and Changelog.
**Certificate (C6).** ADR-34, risks R21 to R23; the certificate scope says the record is self-reported; `tools/test-cert-api.mjs` fails if that copy goes.
**Rego (C7).** `agent_guardrail_test.rego` is generated from the scenarios; `tools/test-cyber.mjs` checks decisions against a hand-written table and the Rego structurally, and runs `opa test` when OPA is installed. CI installs OPA. OPA was NOT available where this was built, so the Rego has not been executed.
**FAQ (C8).** The access answer describes the real bank-deposit and receipt flow including provisional access. Refund terms are not invented: the FAQ says they are not published yet (decide, see CONTENT-TODO).
**Claims and dates (C9).** `training-private/cybersecurity-claims.json` ledger and `tools/check-cyber-claims.mjs` (in `npm run check`): counts, lab steps, certificate rule vs worker, reference markers, copy overclaims. Last-reviewed date on every lesson, plus a changelog.
**Content (from the handoff).** Lesson 4: OWASP Agentic Top 10 ASI01 to ASI10 mapped to lessons. Lesson 6: stateless MCP, state-handle hijacking, confused deputy for proxies. Lesson 7: DPoP and token exchange. Lesson 14: approval binding and TOCTOU. Standards read 2026-11-23.
**Not re-encrypted here:** no `.course-key`, so encrypted files are as in checkpoint 33. Run `npm run deploy -- home` with your own key to publish the new lesson text. Open: refund terms, whether Level 3 stays purchasable, C10 live-page parity after deploy.

# Checkpoint 34: six-level architecture path, new Level 1 Foundations, titles renamed

The architecture path is now six levels. New Level 1, **Software Architecture Foundations** (`software-architecture-foundations`, catalogue page only, course not built): 20 lessons in six modules (what architecture is; requirements and constraints; designing the solution; specifying and communicating; evaluating, risk and AI; exam readiness), an 8-step lab that builds one architecture file, suggested price US$149 (`prices`, not shown on the site). Topics follow the iSAQB CPSA-F curriculum (2025.1). The page carries an `honesty` line (new optional field, rendered under the syllabus): not an iSAQB course, Intellica is not an accredited provider, the exam is booked separately and training is not required to sit it. Exam prep is the closing module of Level 1, not a seventh level.
Renumbered and renamed (ids, paths, prices and access keys unchanged): Level 2 Mastering arc42 (was Level 1; the live workshop keeps the name arc42 in a Day), Level 3 Quality, Decisions and Evaluation (was Architecture for Quality and Decisions), Level 4 Agentic AI Architecture, Level 5 Architecture Governance and Evolution, Level 6 Lead Architect Practice. `allLevels()` in tools/catalog-html.mjs now builds the path from `n` and counts levels instead of assuming five; "five levels" copy changed to "six" in catalog.json, training.json, family.json, site/index.html, build-training.mjs. Browser test expects 6 level cards and 13 header tiles.
Not re-encrypted here: this checkpoint was prepared without your `.course-key`, so every encrypted course file is exactly as in checkpoint 33. Run `npm run sync` in your Codespace (with your key) once to pick up the new Level 3 course wording (lab intro now says "Mastering arc42 (Level 2)", record template, practice tool titles). Until then the course pages still show the old title inside the lessons. `OFFERS` (worker/pay-api.js) and `COURSES` (tools/code.mjs) carry the new Level 3 title for receipts, alerts and owner codes; credentials already issued keep the title they were issued with.
Research behind the levels (read 2026-11-23): iSAQB CPSA-F curriculum 2025.1 valid from 1 April 2025, exam about 40 multiple-choice questions, about 75 minutes, 60% to pass, training not required; release candidate 2027.1 (valid from 1 April 2027) adds a chapter "Use and Risks of Artificial Intelligence", so the Foundations course already has an AI lesson; CPSA-A needs 70 credit points across modules such as AGENTA and IMPROVE; CPSA-E needs CPSA-A, 7 years and a roadmap, article and oral exam; arc42 is a 12-section template under CC BY-SA 4.0 by Hruschka and Starke; arc42's own Foundation-prep course is Mastering Software Architectures; German providers run CPSA-F as a 3 to 4 day live course at about EUR 1,900 to 2,900 with the exam booked via a voucher. Our certificates are never described as iSAQB or arc42 credentials.
Open: exam-prep add-on as a separate product (decide), Level 1 course build, bundle price (US$999 now covers six levels).

# Checkpoint 33: instant access after the receipt, owner phone alerts, soft revoke

Buying: the buyer uploads the receipt and is taken straight into the course, with no code to copy. If the automatic check cannot confirm the receipt (status `review`), the course still opens ("provisional") and the owner gets a high-priority phone alert; a passing receipt sends a normal "New sale" alert. Alerts use ntfy.sh (free, no account): `deploy.mjs` creates a random topic in `.pay.json` (`ntfyTopic`), prints it once, and puts it in the uploaded Function's secrets; the owner subscribes to that topic in the ntfy app. `worker/pay-api.js`: `notify()`, `claim` returns the code for `paid` and `review`, a `rejected` (revoked) order is refused (403) and cannot reopen itself by sending another receipt. Owner page buttons: "Money is in: confirm" and "Revoke access".
Revoke is soft, by design (no database for access): a code is a key held in the buyer's browser. Course pages for a buyer (`recheck()` in pay.js) ask the server on load; a revoked order removes the code it issued and shows a message; an approved one opens the course on a device that lacks the code. Someone who copied the key out of the code can still decrypt offline. Owner-issued codes are never touched.
Also: "Step 2 of 3 / 3 of 3" in the buy dialog, "Your course opens the moment you send your receipt" on the price note.

# Checkpoint 32: Level 2 course (Architecture for Quality and Decisions), 20 lessons

Level 2 is now an online course like Level 1 and the cybersecurity course: 20 lessons in five modules (quality in numbers, deciding well, structure for change, review and risk, decisions in the AI era), four slides each plus field guide, worked case, rubric, three recall questions and sources; one lab step per lesson that builds a single decisions record on top of the learner's arc42; a certificate rule (20 lessons, 20 sections, 6 health checks, 70% of 60 questions). Price US$199 / TT$1,399 (catalog `ladder.levels[quality-decisions].course`, `OFFERS` in worker/pay-api.js, `ISSUABLE` in worker/cert-api.js, `COURSES` in tools/code.mjs). Owner code: `npm run code -- quality-decisions "Buyer name"`.
Source lessons: `training-private/quality-decisions/part1-4.mjs` (compact format as frontier.mjs). Built by `tools/level-course.mjs`, which reuses the cyber engine copy (`engineFiles` in cyber-course.mjs) with storage prefix `iwq-`, health check `tools/level-health.js` (adds a "numbers present" check), key `deriveKey(master,'quality-decisions')`. Practice tools: scenario checker and budget calculator (`tools/level-tools`, unit tests in tools/test-level.mjs).
Facts read on their pages 2026-11-22: arc42 sections 9, 10, 11 and Q42 (191 characteristics, CC BY-SA 4.0), ISO/IEC 25010:2023 (nine characteristics), Nygard 2011 ADR post, SEI ATAM report (1998), Google SRE book chapter 3 (52.56 min, 250 errors in 2.5M), Context Matters (EASE 2026, arXiv 2604.03826), AgenticAKM (arXiv 2602.04445, preprint). Not iSAQB coursework: topics only, no accreditation claims.
Also: home proof panel waits 2.5 s after it scrolls into view before fetching the manifest (keeps the 150 KB page budget as the manifest grows).

# Checkpoint 27: Training page restructured (feature + one catalogue + live workshops), cybersecurity course structure

Training page order: hero, a four-fact strip (hands-on lab, verifiable certificate, always current, yours to keep), a featured course (Cybersecurity for the Agentic Era), the full catalogue as one set of tracks with no available/soon split (architecture Levels 1 to 5, Build and secure, Run and grow), Live workshops as the dated section, certificate, how we teach, teams. Cybersecurity catalogue page now follows the 20-lesson course (five modules, capstone) with a matching lab. Level 1 card keeps its Get access button. Research findings for the cyber course are in the chat reply, not in a file.

# Checkpoint 26: buy by bank deposit with automatic receipt check, TT$/US$ by visitor, per-course status

arc42 online course: US$129 flat (live workshop stays TT$999). Visitors in Trinidad and Tobago (Cloudflare country) see TT$899 and a Buy button; everyone else sees US$129 and a WhatsApp prompt until card payment (Stripe) is added. Popup: details, then bank details (Royal Bank, St Augustine branch, account 110000005001825) with a personal reference IC-XXXXXX, then Scan with camera / Upload a photo. `worker/pay-api.js` + `functions/api/pay/` (tables `orders`, `receipts` create themselves). The receipt is read by Workers AI (needs the `AI` binding); it passes only if amount, receiving account, recent date and a transaction number are all found, and the photo and transaction number are not already used. Anything else is held and the owner approves or rejects it at `/training/arc42/course/admin/` (owner key from `.pay.json`, git-ignored, created and printed by the first `npm run deploy -- home`). Limits, stated plainly: nothing sees the bank account, so a receipt is read, not proven; and an access code is the course key, so it cannot be taken back once given. Catalog: every new course has `status: soon` in `site/training/catalog.json`. Tests: `tools/test-pay-api.mjs` and a browser test of the popup, upload and unlock. WiPay code was dropped (needs a separate approved business account).

# Checkpoint 25: five-level architecture path, seven agentic-era courses, verifiable certificates
Training index now lists: architecture Levels 1 to 5 (Level 1 = arc42 in a Day, open; 2 to 5 'Opening soon') and seven agentic-era courses (AI agents for business, cybersecurity, data analytics, software development, digital marketing, project and operations, entrepreneurship), plus a certificate section. Content lives in `site/training/catalog.json`; `tools/build-catalog.mjs` writes `/training/<id>/` pages (hero, why now, outcomes, syllabus, lab, method, certificate, Contact sales on WhatsApp) and `/training/certificate/`. Shared shell in `tools/training-shell.mjs`, HTML pieces in `tools/catalog-html.mjs`, styles in `site/training/catalog.css`. No prices, dates or testimonials are shown. Course 6 of the source list was not supplied.
Certificates: `worker/cert-api.js` + `functions/api/cert/` (same free D1 database and same join proof as the leaderboard; table `certs` creates itself). Criteria: all 19 lessons, 12 lab sections and 6 health checks, at least 70% of 34 check questions mastered (first try or right in a later review). Claim card on My course (`course/cert.js`); verify, share, Add to LinkedIn and Save as PDF on `/training/certificate/?id=IC-...`. Only arc42 can issue; add a course to ISSUABLE in `worker/cert-api.js` when it opens.

# Checkpoint 24: trust-based leaderboard (weekly and all-time, streaks, personal bests)

Leaderboard (trust-based, cp24): the browser works out points, streak and four progress parts from the learner's own activity and shares only those numbers under an opt-in handle. `functions/api/board/` (Cloudflare Pages Function, free plan) with logic in `worker/board-api.js`; the D1 table creates itself on first use. Points: first-try answer 10/2, review 8/4/2, section 15, health check 10, daily 5 + streak up to 10. Weekly board resets Monday 00:00 UTC, plus all-time; everyone sees their own rank, neighbours and points to the next learner; personal-best week target; streak forgives one missed day. Join gate: `worker/proof.js` is filled in by `npm run deploy -- home` from the course key and restored afterwards (no dashboard secret). 34 check questions in `training-private/arc42-quiz.json` with instant client-side feedback. Rules in `board-core.js`.
Also: process mirror in the lab (Maier et al., arXiv 2609.20143), Training as the sixth card on the home page, defensive copy rewritten across training, course, consulting and product pages, five sector pages under `/industries/`, `tools/check-links.mjs`, home CSS split to stay inside the 150 KB budget, deploy sends `functions/` only with the home project.
Tests: `npm test` (scoring rules, API against real SQLite) and `npm run verify`.

# Checkpoint 22: sector pages, "Get access" button, link check, more evidence

The five sector links on the home page were dead (`/legacy/*.html` was never imported). They are now real pages at `/industries/enterprise|finance|government|energy|smb/`, generated by `tools/build-industries.mjs` from `site/industries/industries.json` (strict CSP rule added). The online-course button on the training page says "Get access", and says "Open the course" (straight to My course) when this browser holds a working code (`site/training/access.js`, shared with the course). `tools/check-links.mjs` runs in `npm run check`: every internal link, image, script and #anchor, plus paths in family.json, site.json and shell.js, must exist. Research blocks gain three cited studies (practice testing, self-explanation, MOOC completion) and a plain statement that we make no claim about other courses.

# Checkpoint 21: Consulting page and assessments, new header, home messaging, lab showcase and evidence on workshop and course pages

Header is Consulting, Training, Systems (kit 0.7.0). New: site/consulting (consulting.json, assessments.json, consulting.js), tools/build-consulting.mjs, tools/lab-html.mjs. Home leads with "AI engineering for work that has to be right". Old contact email removed from structured data. CSP rule added for /consulting/*.

# Checkpoint 20: deploy message points at meeting-mind.com (project intellica-web)

# Checkpoint 19: lab shown on the course page; deploy can target the project that holds meeting-mind.com

`npm run deploy:where` lists Pages projects and their domains; `npm run deploy -- home --project=NAME` uploads to a named project. Course page, inclusion card and lesson rows now mention the lab.

# Checkpoint 18: hands-on lab (your own arc42 inside the course)

New: `/training/arc42/course/lab/`. 16 lab steps, one per lesson, from the workshop's real exercises (source: `site/training/arc42/lab.json`; paid steps are encrypted like the lessons). Autosave in the browser (`iw-lab-doc`), live preview, health check, Markdown import and download, a lab card on each lesson and on My course. Logo SVGs slimmed 30%.

# Checkpoint 17: dark-only, new logo, player upgrades, hero layout fix

# Checkpoints

## cp31: cybersecurity upgrade (28 lessons, practice tools)
- Lessons 26 MCP authorization (2026-07-28 spec: RFC 9728, 8707, 8414/OIDC, 9207 iss, client metadata documents, no token passthrough), 27 skills and tool trust (OWASP Agentic Skills Top 10 list as read on the project page, MAESTRO layers, rug pulls, shadowing), 28 agent identity and delegation (NIST CAISI and NCCoE status stated as in progress). Facts checked on the spec, OWASP, NCCoE and CSA pages on 2026-11-22.
- Practice tools (free to open, with downloadable fixtures): `/training/cybersecurity/course/lab/policy/` (policy tester, Rego reference) and `/lab/trace/` (trace spotter). Source in `tools/cyber-tools/`.
- Certificate rule: 28 lessons, 28 sections, 5 checks, 70% of 84 questions.
- Home page: the live proof now loads the manifest only when its panel scrolls into view (keeps the page under the 150 KB budget); manifest written compact.
- From the handoff, not applicable to our build: truncation at lesson 16, duplicate citation chips, purple --panel (those belong to the source HTML, not this site). Not done: JSON export of the lab dossier.

## cp30: one place to enter a code, header tiles
- `/training/my-courses/`: paste a code for any course; it finds the course, saves it, opens it. Returning visitors see a Continue button. Linked from the training header ("I have an access code"), every course subnav ("Enter access code") and the course hero.
- Training header: the empty right side is now 12 small tiles (five levels, seven courses) that jump to each course page.
- Prices on course cards (arc42 US$129, cybersecurity US$399). Cyber course strip no longer shows arc42-only figures (timed exercises, worked example).
- Page generated by `tools/my-courses-html.mjs` from build-course.mjs; logic in `site/training/my-courses.js`.

## cp28: Cybersecurity for the Agentic Era (complete)
- 25 lessons: your 20 (slides, field guide, worked case, rubric, 3 questions, lab) plus 5 frontier lessons (21 adaptive evaluation, 22 out-of-band enforcement, 23 containing your own agents, 24 measuring poisoning, 25 runtime monitors) from `training-private/frontier.mjs`. Every figure there was read on its source page on 2026-11-21 and is cited in the lesson.
- "2026 update" notes added to lessons 6, 9, 10, 15, 16, 17, 18.
- Lab: one assurance pack, 25 sections. Certificate: lessons 25, sections 25, health checks 5, 70% of 75 questions. Cert API derives each course's proof from the master key.
- Price US$399 / TT$2,799 (catalog.json and `OFFERS` in worker/pay-api.js; a test keeps them equal). Bank-deposit buying works for both courses; the claim returns that course's own key.
- Owner code command (no chat needed): `npm run code -- list`, `npm run code -- cybersecurity "Buyer name"`. Logged in `.codes.log` (git-ignored). Needs `.course-key` in the folder.
- Not yet: leaderboard for cyber (hidden), Stripe, templates/glossary pages, key rotation.

## Checkpoint 16 (current): after a code is entered the buyer lands on a new "My course" page (welcome, next lesson, progress ring, curriculum with status, review, resources); lessons numbered in study order. Earlier: cp15 header fix.

## Checkpoint 14: v14 — one domain: every system lives under meeting-mind.com/<system>/ and one deploy (`npm run deploy -- home`) uploads `dist/` (built by tools/assemble.mjs).  (kit files are now revalidated on every load, so a deploy shows at once)
Includes 13. New logo (I-beam tile with a cyan checkable half), the original interactive twelve-section card on the workshop page (aligned with the headline), a visible "You are in" banner after a course code is pasted, `npm run course:check`, course price TT$299 (regular TT$399, shown crossed out), proof strip, "How it works" and a sales band on the home page, WhatsApp-only purchase.

## Checkpoint 13 (superseded): professional identity
Includes checkpoint 12. Kit 0.6.0.
- No personal name or email address is displayed anywhere. Contact is a WhatsApp button labelled "Contact sales" (icon plus label; the number is only in the link). Facilitator is described by role.
- "Intellica family" is now "Systems".
- New I-beam logo mark and favicon; IBM Plex Sans and IBM Plex Mono (run `npm run fonts` again after unzipping).
- Square-cornered engineering style, mono labels, drafting grid, new footer.
- Home: animated system map of the five systems and a live panel in which the page re-hashes its own files against the public manifest.
- Motion (scroll reveal, page transitions) only where the browser supports it and never when reduced motion is requested.
- Remaining: security.txt and the booking mailto keep the company address in link targets (not displayed).

## Checkpoint 12 (superseded by 13): fonts
Includes checkpoint 11. Adds `npm run fonts`, which self-hosts IBM Plex Sans and Bricolage Grotesque (the typefaces of the original workshop page). Run it once in the Codespace; `node tools/install-fonts.mjs --remove` undoes it.

## Checkpoint 11 (superseded by 12): the online course, made visible and rebuilt
Includes checkpoint 10. The course is now promoted on Home, Training and the workshop page; the course page has a live slide preview, four syllabus modules, a price and access panel and the instructor; lessons have an outline sidebar and progress bar.

## Checkpoint 10 (superseded by 11): the online course
Includes checkpoint 9. Upload this one.
- **Online course** at `/training/arc42/course/`: the workshop as 19 lessons built from the slide deck (breaks and lunch dropped, appendices merged). Narrated slide player with transcript, read-aloud, optional recorded audio, keyboard control; free recall cards at the end; review at 1, 3, 7, 21 days; progress saved in the browser. Two lessons are a free preview; the rest are encrypted and open with an access code you issue (`npm run course:code -- "Buyer name"`).
- **Worked example** page `/training/arc42/example/`: Doubles-to-Go arc42 plus the working app (33 tests pass) as a download; source in `training-material/doubles-to-go/` (`npm run example:pack` rebuilds the zip).
- **MP4 export** per lesson: `npm run course:video -- <lesson-id>` (needs ffmpeg).
- Slides (7) are byte-identical to the deck already in checkpoint 8, so nothing changed there.
- Payments: Stripe is not available in Trinidad and Tobago, so access codes are issued by you after you receive payment. See ADR-29 and INSTALL.md.
- Also fixed: numbered steps on the register page rendered as broken columns.
- Browser check now has 37 checks. Kit unchanged (0.5.0).

## Checkpoint 9 (superseded by 10, may be uploaded): deploy from the Codespace
Includes checkpoint 8. Adds `npm run deploy -- <home|verichain|vericrypt|erp|omc|agentseed|all>`: syncs, runs the gate, creates the Pages project if needed and uploads with Wrangler (direct upload, no GitHub integration). `tools/deploy.config.json` holds the project names. INSTALL.md section 6 rewritten for this route.

## Checkpoint 8 (superseded by 9, may be uploaded): the Training section
Includes everything from checkpoints 6 and 7 (neither was confirmed uploaded). Upload this one.
- **`/training/`** index and **`/training/arc42/`** workshop (arc42 in a Day, **Saturday 30 January 2027**, UWI St Augustine), with **Student guide** and **Register** pages. Linked from a Training item in the home header, a Training block on the home page and the family menu on every product site.
- Built from one data file, `site/training/training.json`, into real HTML (works without JavaScript; Event structured data; in the sitemap). `training.js` only adds the deadline countdown, saved checklists, copy buttons and the email form.
- **Early bird TT$999 until 30 November 2026**; the text counts down and ends on its own. The standard price after that is not set: add `price.standard` in `training.json` when decided.
- **Your slides** (210) are a private presenter page at an unlisted address (`site/training/arc42/deck-<token>/`): not linked, not in the sitemap, manifest or robots, `noindex`, strict CSP, microphone and screen capture allowed for its recording feature. Converted without changing a slide. See INSTALL.md for real access control.
- Registration uses the company address (`dpramsajan@meeting-mind.com`), not a personal mailbox.
- Copy corrected from the original page: it said "fifteen short parts" but the programme has thirteen; the count is now computed from the data.
- Header no longer overflows at 320 px. Kit 0.5.0. Browser audit: 27 checks.

## Checkpoint 7 (superseded by 8, not uploaded): faster, safer headers, better docs
- **Found and fixed: `/verify-site/` had no Content-Security-Policy** (the rule list missed it). Added it, plus Cross-Origin-Opener-Policy and Strict-Transport-Security. A new test fetches every HTML page of every site and fails if any lacks a strict policy.
- **Found and fixed: layout shift.** Pages jumped while the shell built the header (CLS up to 0.18 on some pages; the limit is 0.1). The body and footer now wait for the shell; with a 2.5 s and 4 s time limit so nothing stays blank. Browser audit now enforces CLS, LCP and a 150 KB page budget on every product page.
- **Docs:** search across the whole manual (built in the browser), copy buttons on code blocks. Fixed a broken table cell in the VeriCrypt install page and added a test for stray backticks.
- Structured data (JSON-LD) on the home and every product overview.
- 320 px reflow test on every page (WCAG 1.4.10).
- Kit 0.4.0. Browser audit: 20 checks.

## Checkpoint 6 (superseded by 7, not uploaded): the site verifies itself; briefs for the product chats
- **Verify this site** on every site: published `site-manifest.json` (SHA-256 of every file plus a root hash) and a page that re-hashes everything in the visitor's browser. Footer link on every page.
- **What it does not do yet** section on every product Overview, from each repo's own limits.
- Briefs for the five product chats in `docs/briefs/` (paste-ready, with questions, demo concept, hand-back list and the shared contract) and `docs/CONTENT-SCHEMAS.md`.
- Checker guards: status and limits required; demo engine label must match the demo's code.
- `npm run scaffold` no longer overwrites finished work without `--force`.
- Browser audit: 15 checks.
- arc42: ADR-13 to 17, new scenarios and risks.
- Kit 0.3.0.

## Housekeeping after checkpoint 5
- Found in the uploaded repo: `node_modules/` was committed (no `.gitignore`) and a stale `INSTALL-CODESPACES.md` from checkpoint 1 was still present. Added `.gitignore`, removed the stale file. Verified a clean clone builds, scaffolds and passes the gate.

## Checkpoint 5 (uploaded): discoverable, accessible, useful when empty
- Every page now carries its own title, description, canonical link and link-preview tags, baked in without JavaScript (`tools/prerender.mjs`, run by `npm run sync`). Added sitemap.xml, robots.txt and security.txt per site.
- Download tab: when there are no binaries it shows build-from-source commands with a copy button instead of an empty table.
- Support tab: known problems (FAQ) per product, from each repo's own troubleshooting notes, plus a security note.
- Markdown headings are demoted so each page has exactly one h1.
- Print stylesheet.
- Home copy no longer implies the demos run in-browser today.
- Browser check now has 13 checks, including an accessibility audit (landmarks, heading order, names, WCAG AA contrast in light and dark on every page of every site) and a no-JavaScript metadata check.
- Kit 0.2.0.

## Checkpoint 4 (superseded by 5): five products, real content
- Fifth product: AgentSeed (ASL toolchain).
- Every product site now has a real user manual, installation guide, reference, architecture overview and Verify page, written from that product's own repository (README, arc42, install guides, CLAIMS.md). No more "Nothing is published here yet" in the docs.
- Status line per product, taken from each repo's own status.
- VeriCrypt content follows its `CLAIMS.md` registry (see CONTENT-TODO).
- Browser check now loads every tab and docs page of all five products (9 checks).
- Verified commands: vcv verify (VeriChain), vericrypt analyze/verify (VeriCrypt), seed check/run/build (AgentSeed), cargo test (Sovereign ERP), python scripts/demo.py (OMC).

## Checkpoint 3
Dependencies and browser check: `npm run setup`, `npm run verify`, devcontainer and CI.

## Checkpoint 2
Fresh `IntellicaWeb` repo layout; `npm run legacy -- <path>`.

## Checkpoint 1
Kit 0.1.0, home, template, scaffolds, tools, arc42 1 to 12. Docs sidebar fix.
