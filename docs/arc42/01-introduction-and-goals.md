# 1. Introduction and goals

Amended at cp43 (2026-11-27). Method: arc42 template; decisions as ADRs (section 9); quality model ISO/IEC 25010; documentation viewpoints aligned with ISO/IEC/IEEE 42010. The previous edition described a subdomain-per-product site with no backend. It was written early and no longer matches the system. See `13-amendment-log.md`.

## 1.1 Requirements overview

Intellica publishes one website at meeting-mind.com that does four jobs:
1. Company home and product sites (verichain, vericrypt, sovereign-erp, omc, agentseed) under one domain.
2. Training: free lessons and paid, encrypted online courses, with practice tools, self-reported certificates and a leaderboard.
3. Academies (architecture, cyber, AI business) that organise the courses into levels with honest status, evidence and gaps.
4. Selling: price list, bank-deposit purchase, receipt reading, owner approval, access codes.

Everything a visitor sees must be checkable: the site publishes a fingerprint of every file (`site-manifest.json`, `/verify-site/`), loads nothing from third parties, and states honestly what is live, planned or unreviewed.

## 1.2 Quality goals (top five, in order)

| # | Goal | Meaning here |
|---|---|---|
| 1 | Trustworthiness | No false claims: statuses, credentials, prices and counts are derived from data and checked by tests. |
| 2 | Integrity of delivery | What is deployed to meeting-mind.com is exactly what was built and verified; no preview or stray sites. |
| 3 | Confidentiality of paid content and keys | Lessons are encrypted at rest in git; keys and bank-flow secrets never enter the repository. |
| 4 | Changeability by independent workstreams | One academy can be built in one chat or by one person without breaking another. (Currently weak: see sections 5 and 11.) |
| 5 | Simplicity and low running cost | Static files, one hosting project, three small APIs, no framework, no runtime dependencies. |

## 1.3 Stakeholders

| Role | Interest |
|---|---|
| Owner (single maintainer) | Builds, commits and deploys; wants fast, safe checkpoints. |
| Learners and buyers | Accurate content, working access codes, fair prices. |
| Reviewers and partners | Verifiable claims; honest status. |
| AI assistants (chat sessions) | Need a short, current state document and clear boundaries (`CLAUDE.md`). They are treated as contributors with no memory between chats. |
