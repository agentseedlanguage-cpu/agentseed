# cp42: Level 4 built, price, question bank, next steps

Date: 2026-11-27. Follows `CP41-RESEARCH-AND-BUILD-PLAN.md`.

## 1. What cp42 adds

- **Level 4 Agentic AI Architecture is built**, first edition: 16 lessons (4 slides, field guide, worked case, 4-task lab with model answer, 4-criterion rubric, 3 recall questions, 3 dated sources each), lessons 1 and 7 free. Source in `training-private/agentic-architecture/part1-4.mjs`; engine `tools/agent-course.mjs`; health check `tools/agent-health.js` (six checks, including "every rule names VERIFIED_BY or REVIEWED_BY"); practice tools `tools/agent-tools/` (rules checker, tool contract checker); tests `tools/test-agent.mjs`.
- Wired into the payment offers (`worker/pay-api.js`), certificate rules (`worker/cert-api.js`: 16 lessons, 16 sections, 6 checks, 48 questions) and access codes (`tools/code.mjs`).
- Catalogue: course block enabled, price US$249 / TT$1,749 (set in the catalogue prices list and the course block), lab steps now the 16 lab titles.
- Architecture Academy: Level 4 shown as live; live lesson count is now computed (69 live, 24 outlined); roadmap marks Level 4 done and Level 5 next; new gap G11 (no outside review of Level 4 yet); source S18 (Thoughtworks Radar) added.

**Honest status.** The lessons were written from sources read on 2026-11-27 (marked in each lesson) and from the author's knowledge for a few older references (marked "not re-read in this edition"). Case figures are invented placeholders. No learner has tried the labs. No iSAQB credit is offered. To hold Level 4 back, set `"enabled": false` in its `course` block in `site/training/catalog.json`, run `npm run training`, and the academy check will ask for the status to be set back to planned.

## 2. Level 4 price: evidence and recommendation

Read 2026-11-27 (prices move; recheck before any public comparison):
- Live iSAQB AGENTA training, three days, accredited, credit-bearing: about EUR 1,575 to 2,500 from the providers found.
- Cornell eCornell Agentic AI Architecture certificate, about two months: US$3,750 (as shown on its page).
- Self-paced Udemy-type bootcamps on AI architecture: typically tens of dollars; they are not a like-for-like comparison.
- Our ladder (catalogue prices): Level 1 US$149, Level 2 US$129, Level 3 US$199 (20 lessons), Level 5 US$299 and Level 6 US$399 (planned), Cyber Level 2 US$399 (28 lessons).

**Recommendation: US$249 (TT$1,749).** About US$15.50 a lesson, between Level 3 (about US$10) and the cyber course (about US$14, but with a larger lab and 28 lessons). It is a small fraction of live AGENTA, above the cheap bootcamps because of the labs and the rules and checks, and below Level 5's planned US$299 because it is a first edition with no outside review yet. Consider US$299 once the outside review (gap G11) is done and the course has paying learners' feedback. Six-level bundle: the sum of listed prices is US$1,424; US$999 stays a sensible bundle figure but is your decision.

## 3. The 82 extra Level 1 questions: why they are not in this zip

The three files (`bank-c1x.mjs`, `bank-c3x.mjs`, `bank-c4x.mjs`) are not in the repo you uploaded or in this session; the handover says they sit in an older scratch tree. I will not rewrite 82 questions you already read, because that would discard your review. **To finish: attach those three files.** Then the steps are: copy them to `training-private/foundations/`, import them in the bank index, raise mocks from 3 to 5 in `tools/foundations-course.mjs`, update the quota checks and the catalogue and academy wording (bank 124 to 206, mocks 3 to 5), and run `node tools/test-foundations.mjs`.

## 4. Level 5 Architecture Governance and Evolution: plan

Current outline (12 lessons in 3 modules, 6 lab steps) stays, with these changes from today's research and Level 4:
- Lesson 3 "Fitness functions" now overlaps Level 4 lesson 10. Re-aim it at portfolio level: choosing which properties to measure across several systems, thresholds, who owns the dashboard, and what to do when a number is red.
- Add agent-era drift to "Measuring architectural health": the Thoughtworks Radar (April 2026, Assess) says coding agents can speed up drift and that first scans produce many violations to triage. Use it, with its caveats, instead of vendor claims.
- Lesson "Vendor, platform and AI dependency risk" reuses the Level 4 governance record (data classes, providers, exit plans) and extends it to a portfolio.
- Research still to read before writing: the iSAQB Advanced module list for evolution and governance topics, arc42 and ADR practice for supersession, a source on migration patterns (strangler fig) and one on architectural debt measurement. None has been read yet.
- Build order: research and source register, lessons 1 to 4, lessons 5 to 8, lessons 9 to 12, engine and health check, tests, catalogue go-live. About two checkpoints.

## 5. Other items from your list

- **Levels 1 to 3 improvements** (next-step cards, criticality tags, rubrics for Level 2, spot-the-flaw sets) are specified in `CP41-RESEARCH-AND-BUILD-PLAN.md` section 4 and were not built in this checkpoint, because they change encrypted course content and need a careful pass of their own. They are the first work item of cp43 together with the question bank.
- **Training and academy pages**: re-read after the Level 4 go-live. Stale "planned" wording for Level 4 was removed; counts, prices, roadmap, gaps and sources agree with the catalogue. A full marketing-eye audit of every sub page has not been done.

## 6. Deploy (main site only)

`npm run deploy -- home`, with no `--project=` or `--branch=` options. The deploy runs the sync, which builds the Level 4 course files with your key; commit them afterwards.
