# 11. Risks and technical debt

| ID | Risk or debt | Impact | Likelihood | Action |
|---|---|---|---|---|
| R-01 | **Shared registries and one catalogue.** Courses are registered by hand in about nine shared files; overlay zips replace whole files. Parallel chats can erase each other's entries. | High | High | ADR-019 now; ADR-018, ADR-015 next. Interim rules in `CLAUDE.md` section 6. |
| R-02 | **Infrastructure not in code.** D1 schema, bindings, domain attachment and token only in the dashboard/owner machine. | High | Medium | ADR-017; export schema and document rebuild. |
| R-03 | **Secret swap at deploy.** Interruption can leave real values in tracked files; `git add -A` would commit them. | High | Low | Short term: pre-commit check that `SECRETS = null` and `PROOF = ''`; long term ADR-016. |
| R-04 | **Single point of release.** One machine, one key, one maintainer. | High | Medium | Back up the master key offline; document recovery; consider a second authorised deployer. |
| R-05 | **Stale checkout or stale overlay.** Publishing old files over new. | High | Medium | Mitigated for deploy (ADR-014); overlay staleness needs ADR-019. |
| R-06 | Bank details and offer prices in public client-visible code. | Low | Certain | Accept as payee details; confirm with owner; derive prices from catalogue (ADR-018). |
| R-07 | **Text-patched engines.** `replaceAll` over engine source breaks silently if the shared source changes. | Medium | Medium | Replace with parameters (engine takes a COPY object) and a test that every patch matched at least once. |
| R-08 | Generated files in git cause noisy diffs and two-commit deploys. | Low | Certain | Keep (ADR-013) but add CI check that regenerated output equals committed output (needs key-free path for non-encrypted parts). |
| R-09 | Monolith files: `build-course.mjs` (about 890 lines), `browser-test.mjs` (about 1,260), `build-training.mjs` (about 670). | Medium | Certain | Split by course/concern while keeping output identical. |
| R-10 | Sync order is an undocumented-in-code dependency chain in one npm script. | Medium | Medium | Move the chain into `tools/pipeline.mjs` with named steps and declared inputs/outputs. |
| R-11 | CI runs sync with a temporary key, so it cannot prove the real ciphertext is current. | Medium | Medium | Document; verify ciphertext decrypts with the real key during deploy gate. |
| R-12 | Level 4 is a first edition with no outside review and no learner trial (academy gap G11). Level 1 bank incomplete until 82 questions arrive. | Medium | Certain | Reviewer; learner pilot; supply files. |
| R-13 | Handover documents drift from the repo (this happened: the old arc42 described a different system). | Medium | High | `CLAUDE.md` and arc42 updated in every checkpoint; a check that `CLAUDE.md` lists every course in `code.mjs`. |
| R-14 | Receipt reading by an AI model could be fooled or wrong. | Medium | Low | Already advisory with human approval; keep it so. |

## Standards alignment (what "international standard" means here)
Documented with arc42 and ADRs; viewpoints per ISO/IEC/IEEE 42010; quality model per ISO/IEC 25010; delivery practice per continuous-delivery principles (single build, verified release, fast rollback) and the twelve-factor idea of config in the environment (ADR-016). Gaps against that bar are R-01, R-02, R-03, R-08, R-10. No claim of formal certification is made.
