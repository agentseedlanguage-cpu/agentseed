# cp41: research brief and build plan (Architecture Academy)

Date: 2026-11-27. Written from the repo as uploaded (it is at cp40, two checkpoints past the cp38 handover) and from sources read today. Every external claim below says what was read and what its limits are.

## 1. Repo state and how we deploy

- Baseline before any change: `npm run check` and `npm test` passed. The browser test was not run.
- Live: Level 1 Foundations (14 lessons), Level 2 Mastering arc42 (19 lessons), Level 3 Quality, Decisions and Evaluation (20 lessons), Cyber Level 2 (28 lessons). Levels 4 to 6 are outlines only.
- Lab help panel (cp40) is built from each step's rubric. Mastering arc42 has no rubric yet, so it shows tips only.
- Lesson and lab text is encrypted with the course key, which lives only in your Codespace. So lab and lesson changes are written here as source files and built there.

**Deploy to the real site (meeting-mind.com), never a temporary one.** Read from `tools/deploy.mjs`:
1. Run exactly `npm run deploy -- home`. Do not add `--project=` or `--branch=` (a non-`main` branch makes a preview site, which is where stale pages and wrong charts come from).
2. The script runs `npm run sync` (re-encrypts with your key) and the check, then asks Cloudflare which Pages project serves meeting-mind.com and uploads to that one.
3. It then fetches `https://meeting-mind.com/kit/VERSION` and refuses to say success unless the live site serves the version it just uploaded. Success prints `VERIFIED`. If it prints `NOT LIVE YET`, run `npm run deploy:where` and follow its instruction.
4. Then open `/verify-site/`: it must say all files match.

## 2. What changed in this checkpoint (public pages only)

- Level 4 outline rebuilt against the official AGENTA curriculum: 4 modules, 16 lessons, 8 lab steps (was 3, 12, 6). New lab checks: every rule names the check that verifies it.
- Architecture Academy: Level 4 mapping now states what was read; source register has five new dated entries (S13 to S17) and a corrected S8.
- Nothing encrypted, paid, certificate-related or key-related was touched.

## 3. Sources read today and what to trust

| Source | What it gave us | Limits |
|---|---|---|
| iSAQB AGENTA curriculum 2026.1-rev5 (31 July 2026) | Seven sections, 34 learning goals, 585 min content + 315 min practice, at least 3 days, 10 technological + 20 methodical credits. No R1/R2/R3 levels assigned. | Primary source. Only accredited providers can teach it for credit. |
| iSAQB CPSA-F 2027.1-RC1 (13 Nov 2026) | New chapter 5, Use and Risks of Artificial Intelligence, 60 min: LG 05-01 decide on AI use as an architectural decision (R1, R2); LG 05-02 verify AI-generated artifacts, risks of delegating review to an LLM (R1, R2); LG 05-03 AI risks and societal externalities (R2, R3). R1 is examined, R2 may be, R3 is not. | Release candidate, valid 1 April 2027. May change. |
| van Heesch, Zimmermann, Kohls, focus group (arXiv 2609.30334) | Strong consensus that decisions, accountability and guardrail authoring stay human; "criticality" (uncertainty times cost of change) sets oversight; "harness engineering" and "cognitive debt" named. | One 90-minute session, 22 people from one conference. Opinion, not measurement. |
| A-SAW (arXiv 2610.13647) | Agent drafts architecture documents from a typed element catalog; mandatory two-role human gate. Quality score 58% to 89%; 11 of 13 practitioners rejected unreviewed agent output. | One organisation, one LLM judge from the generator's model family, builder also evaluator, rubric measures structure not correctness. |
| Harness study (arXiv 2611.09088) | Guardrail and approval controls can silently stop working after routine operations (reapply a plugin, save an "always allow" rule, restart, compact history). Test controls against real operation sequences. | Five harnesses, some developer previews; shows it happens, not how often. |
| MCP update, 28 July 2026 (VentureBeat) | Stateless transport, mandatory `iss` check, Enterprise Managed Authorization extension, durable tasks, 12-month deprecation floor. | Press report. Confirm against the official spec before teaching. Cyber lessons 6 and 7 already cover stateless MCP and issuer mix-up. |
| Pantoja Yepez et al. (arXiv 2603.11904) | Training patterns for architecture courses; decision skill grows over repeated project experiences. | Abstract only; results not read. |
| Search titles only, not read | arXiv 2602.07147 (anti-patterns in student microservice projects; fetch was refused), a 0-star GitHub repo on layered agent rules with `VERIFIED_BY` links to tests | Do not cite until read. The repo is an idea source, not an authority. |

## 4. Improving the three live architecture courses (build in cp41)

These follow the lab standard already in `CP39-LAB-AND-COURSE-IMPROVEMENT-PLAN.md`. New from today's research:

**All three**
- End every lab step with a "Next step" card: what the next step reuses, and what to do when the check fails. This answers your "next steps clearer to students" request directly.
- Add a "criticality" tag (low, medium, high) to each decision a learner records. High-criticality decisions require a stated human reviewer. This is the focus-group idea, and it is also what the 2027.1 chapter asks for.
- Every course gets a short AI-use lesson or section: decide on AI use as a recorded decision, verify what it produced, and name the risk of delegating review to another LLM (matches 2027.1 LG 05-01 and 05-02).

**Level 1 Foundations**
- Write the 2027.1 AI chapter lesson now (Lesson 13 already exists as an Intellica extension; align its goals to LG 05-01 to 05-03 and mark R1 versus R2 content).
- Tiered hints and common-mistake pairs per step; chapter tag per step; the 82 pending questions need a human read before the bank goes from 124 to 206 and mocks from 3 to 5.

**Level 2 Mastering arc42**
- Add rubrics to the steps (the help panel is tips-only today because there are none).
- "Bad arc42" spot-the-flaw exercise for sections 5 to 9; one-page quick card.
- Agents-as-readers lesson: add the exercise from the cp39 plan (ask an AI questions from your arc42, score it). Use A-SAW's finding as the caution: structure scores well, decision correctness is what still needs a human.

**Level 3 Quality, Decisions and Evaluation**
- Scenario checker explains why a scenario is untestable.
- Three decision records of different quality to rank (exemplars).
- Add "decision as a testable hypothesis" (AGENTA LG 2-5): each record names a cheap experiment and what result would reverse it. This also feeds Level 4.

## 5. Level 4 Agentic AI Architecture: the design

Position: AGENTA is the topic benchmark; Intellica's difference is the lab. The learner builds one thing: an agent system design plus a machine-readable rules file and the tests that enforce it.

| Module | Lessons | AGENTA sections covered |
|---|---|---|
| 1 Agents as components | Shape (workflow, assistant, agent); agentic loop and tools as contracts; autonomy levels; context and memory | 1, part of 2 |
| 2 Deciding with AI | Decisions as testable hypotheses; design exploration with AI | 2 |
| 3 Knowledge and control for coding agents | Agent-readable architecture knowledge; delivering it (retrieval, skills, tool servers); a harness of controls; architecture tests and drift; extracting architecture from code | 3, 4, 5 |
| 4 Running agent systems you can trust | Orchestration and multi-agent; failure and cost budgets; evaluation and tracing; governance, law, safe integrations; judgment and role | 2 (LG 2-7), 6, 7 |

Design rules taken from the research:
- A rule is only finished when it names its check (a test, linter or policy) or a named human reviewer. This is the lab's key health check.
- Teach that controls decay: one exercise reorders operations (restart, saved allow rule) and shows a guardrail silently stopping (harness study).
- Teach the limit of agent-drafted documents: structure is easy to score, correctness is not (A-SAW).
- Security depth stays in the Cybersecurity Academy; Level 4 links to it rather than copying it.
- Checks stay rule-based in the browser. No server, no spend (your cp40 decision 2).

Honest status: Level 4 stays "In development" until lessons, lab and health checks exist and the tests pass.

## 6. Order of work and what needs you

1. cp41: lab standard on Levels 1 to 3 (source files here; built in your Codespace with the key).
2. cp42: Level 4 source (`training-private/agentic-architecture/`, same compact format as `quality-decisions`), engine file modelled on `tools/level-course.mjs`, tests, catalogue go-live.
3. Needs a human: the 82 Level 1 questions; confirmation that you want Level 4 priced (US$199 like Level 3 is the obvious default, not yet decided); a read of the AGENTA-derived lesson titles.
4. Not yet verified: official MCP specification, the two "leads" in the cp39 plan (arXiv 2602.04445 and others), SWARC4AI curriculum (appeared in search; may belong in Level 4 or 5).

Git line: `git add -A && git commit -m "cp41" && git push`, then `npm run deploy -- home`.
