# ASL v0.3.0 Addendum — Verified Research, Corrections, and Reality Check
**Applies to:** ASL-SPEC-0.2.0 + the v0.3.0 draft spec / Arc42 draft (see `docs/drafts/`)
**Date:** 2026-10-30 · **Status:** Normative where it says MUST; otherwise proposal
**Why this exists:** the v0.3.0 drafts were written from search snippets. This addendum
re-checks the load-bearing claims against primary sources, corrects what was wrong,
and records what is verified, what is not, and what the repository actually contains.

---
## 1. Evidence register

| Claim in earlier drafts | Source | Status | Correction |
|---|---|---|---|
| ETAS: effect-typed agent language, TraceSpecAlgebra, request/handled/denied/commit events | Tan et al., HKUST, arXiv:2607.17780 (read in full) | **VERIFIED** | See §2.1–2.3. Soundness is *proof sketches*; mechanization is future work. |
| "ETAS has no memory system" | same | **FALSE** | ETAS has typed `MemoryRegion` stores and secret-flow rules. Remove the claim. |
| zkComposer: parallel zkML sub-proofs | Sanjaya et al., arXiv:2607.08095 (abstract read) | **VERIFIED, OVERCLAIMED** | Speedups: ≤3.25× (CNNs vs zkCNN), ≤4.83× (GPT-2 vs zkGPT), ≤6.84× when also partitioning the input sequence. Evaluated on 3 CNNs and GPT-2 only. "Minutes to seconds" was unsupported. |
| CoMem: collective/individual memory, avoids "memory pollution" | Yu et al., Beihang, arXiv:2609.15009 (read in full) | **VERIFIED** | Promotion rule is empirical (usage ≥ N_min AND mean reward ≥ baseline), not "3 agent verifications". See §2.4. Gains: +8.02 (ALFWorld), +4.70 (PDDL) avg over no-memory. |
| Lean4Agent: Lean4 library for agent workflow verification | Wang et al., UIUC, arXiv:2606.06523 (abstract + summaries) | **VERIFIED** | Verified workflows beat failing ones by ~11.94% avg; LeanEvolve +7.47% on SWE. This is *correlational* evidence about workflow quality, not a safety proof. The "Claude-Opus-4.6, 40 workflows" detail is **unconfirmed — removed**. |
| EU AI Act "enforceable August 2026" (Art. 12 driver) | Council/Parliament/law-firm summaries | **OUTDATED** | Digital Omnibus political agreement 7 May 2026; Parliament plenary 16 Jun 2026: Annex III high-risk → **2 Dec 2027**, Annex I embedded → **2 Aug 2028**. Art. 50 transparency largely unchanged. *Final OJ publication not confirmed by the sources retrieved — verify.* |
| NanoZK "5.5 KB proof, 24 ms verify, ε<1e-37", zkAgent, Jolt Atlas | v0.2 addendum text | **UNVERIFIED** | Not re-checked. Treat as unconfirmed vendor/paper claims; do not cite as facts in the spec. |
| VIGIL, FORGE, NFV (2608.21516), SAGE-Agent, AgentSPEX, 007, ASHE, Codifide | earlier research report | **UNVERIFIED (snippet-level)** | Keep as "related work to review", not as normative grounding. |
| "No competitor has X" (uncertainty intervals, dream cycle, etc.) | earlier report | **UNVERIFIED / likely too strong** | Rephrase as "not found in the systems reviewed" with the list of systems reviewed. |

**Rule going forward:** a paper may ground a MUST only if it is marked VERIFIED here.

---
## 2. Normative corrections

### 2.1 Trace-event lifecycle (replaces §31.A of the v0.3.0 draft) — MUST
Every `perform` yields exactly one `Requested`, then **exactly one terminal outcome**:
`Handled` | `Committed` | `Denied{phase, reason}`.
* `Handled` is **terminal** and mutually exclusive with `Committed`: a handler interprets the
  request; the external side effect is not committed, and a handler cannot create commit authority
  (ETAS Thm. 6, handler trace-transparency).
* `Denied.phase ∈ {Request, Commit}`: refused at the request phase (policy forbids asking) vs.
  request permitted but commit refused (effect boundary / commit monitor).
* ASL differs from ETAS in one deliberate way: ETAS logs only `denied(request(a))` on a refused
  request; ASL logs `Requested` first, so refused attempts remain visible. Document as ASL-specific.
* Invariant P9 (no request left unresolved at session end) is unchanged.
*Implemented and tested in `seedvm/src/trace_events.rs`.*

### 2.2 Two behavioural indices — MUST (static semantics)
A computation is checked against **(a)** the *escaping effect row* ε (what still obligates the
caller) and **(b)** a *requested-action trace abstraction* A (what it may ask for, even if a
handler absorbs it). Handling removes ε-obligation, never A-evidence.

### 2.3 TraceSpecAlgebra (replaces §37.1) — MUST
The earlier `Allow/Deny/Sequence/Choice/Star/Top/Bottom` algebra was an invention. Adopt ETAS's
normal form instead:
```
N ::= <L, D, B> | N ⊕ N        -- L allow-patterns, D deny-patterns, B before-obligations (p ≫ q)
```
* **Deny takes precedence; unmatched actions are denied (default-deny).**
* `p ≫ q`: every event matching `q` must be preceded by a matching `p`.
* Compile `N` to a finite monitor; abstractly interpret the program's requested trace A over it.
  The discharge result is **one of three outcomes**: *proved* (no check), *residual* (emit a
  runtime check for facts known only at runtime, e.g. exact path, approval freshness), or
  *rejected* (compile error).
* Every residual MUST be enforced at runtime before its guarded request/commit.
*Status: not implemented; `seedc/src/sema/tracespec.rs` in the author's earlier tree is a sketch
and MUST NOT be treated as this algebra.*

### 2.4 Federated memory promotion (replaces ADR-011 / §6.C) — MUST
CoMem's formal rule (adopt as the default policy `comem`):
`promote(m) ⇔ N_use(m) ≥ N_min ∧ R̄_m ≥ R̄_baseline`, promotion *moves* the entry from the
private store to the collective pool; private entries are pruned by a consecutive-miss counter
(`K_max`); collective entries decay by an EMA utility and are evicted below an adaptive threshold;
retrieval is dual-stream (private + collective) with clustering for diversity. Defaults from the
paper: `N_min=3, α=0.5, w=0.5, k=3`; the paper's own ablation shows optima are task-dependent.
**ASL extension (not from CoMem, label as such):** optionally require attestations from
≥ m *distinct* agent DIDs before promotion, to resist a single compromised peer. A publisher's own
attestation never counts.

### 2.5 Proof tiers (corrects §P-CALC) — SHOULD
`ProofType::ZkComposer` stays as an optional tier. State its realistic benefit (≤ ~3–7× prover-time
reduction on the evaluated models) and that adjacent sub-proofs are linked by shared commitments
to boundary activations. Do **not** state latency figures for NanoZK/zkAgent/Jolt until verified.

### 2.6 `spec<T>` and verification layers (repositions §41) — SHOULD
`spec<T>` is **ASL's own design**, inspired by Lean4Agent's three levels (structural, semantic,
runtime-trajectory). Map them explicitly: structural → compile-time checks; semantic → `spec<T>` +
amendment gate; runtime trajectory → `trajectory_audit`. Lean4Agent supports "verified workflows
perform better", not "verified agents are safe"; the spec must not imply the latter.

### 2.7 Regulatory language (replaces §38.3) — MUST
ASL provides *mechanisms that support* record-keeping (bi-temporal store, signed export). It MUST NOT
claim legal compliance: whether a deployed agent is "high-risk" depends on its use case. Use the
dates in §1. Re-verify the Official Journal status of the Omnibus before release notes cite them.

---
## 3. Gap-fills adopted from verified sources (proposals)

| ID | Gap | Source | Proposal |
|---|---|---|---|
| G-A | Untrusted text reaching a privileged prompt | ETAS §2, §8 | Type prompt segments by channel (`Trusted` instruction vs `data`); `SecretValue` not encodable into a prompt without an explicit declassify flow. Integrates with `taint`. |
| G-B | Static checks that can't prove everything | ETAS §4.4 | Three-outcome discharge + residual registry (§2.3). |
| G-C | Replay vs resampling conflated | ETAS §5.3 | Replay re-uses recorded model/tool events; *resampling* a model call needs explicit policy authorization. Extend Patch 15.16. |
| G-D | Handlers in tests hide behaviour | ETAS Thm. 6 | Dry-run handlers allowed; they emit `Requested`+`Handled`, never `Committed`. |
| G-E | Shared-memory pollution | CoMem | §2.4. |
| G-F | Cost of proofs | zkComposer | Optional parallel tier (§2.5); benchmark in-tree before promising numbers. |

Explicitly **not** adopted: any claim that ASL "surpasses all competitors". Evidence for that
requires a published benchmark/conformance comparison, which does not yet exist.

---
## 4. Repository reality check (audit of `main` @ 07aad61)
Findings, all reproducible; fixes marked ✅ are in this patch.
1. ✅ **`main` did not compile**: `lowering.rs` called an undefined `lower_ident`. Implemented with a
   lexical scope stack (name → local slot). Previously every identifier lowered to `Var(0)`
   (the VeriChain aliasing bug) *and pushed nothing* on the stack machine.
2. ✅ **IR verifier contradicted the lowerer**: it rejected `StoreLocal` targets and reset its
   defined-set per block (false rejections at every block boundary). Fixed; now carries definitions
   across blocks (conservative approximation of dominance — documented in code).
3. ✅ **Hanging test** `test_read_source_stdin` blocked on real stdin. Reader-injected; asserts content.
4. ✅ **Seven source files were never compiled** (`capability, inference, orchestrator, sanitize,
   taint, tee, uncertainty` ≈ 1,100 lines) because `lib.rs` didn't declare them. Declared; two
   trivial compile errors fixed (a `sink_category::` typo ×3, missing `Hash` derive on `TeeBackend`).
   They contain **no tests** — they are now compiled but unverified.
5. ✅ `compile()` wrote `ast_dump.txt` on every call. Now opt-in via `SEEDC_DUMP_AST=1`.
6. ☐ `tests/cli.rs` and `tests/cmd/*.trycmd` sit at the workspace root where no package owns them — they never run.
7. ☐ The VM is a *stack machine* with SSA-style decoration: `dest` is ignored by the executor;
   `Opcode::Call` with a string operand prints a hard-coded `"Hello, Agent!"`; string literals all
   lower to `Operand::String(0)`; locals are sized from the first function. Decide (ADR-020) between
   a true stack IR (drop `dest`/SSA claims) or true SSA; today docs and code disagree.
8. ☐ `compile.log`, `run.log`, `fullRepoMixSnapshot.xml` (1.5 MB) are tracked in git.
9. ☐ `#![allow(clippy::all)]` + `#![allow(unused)]` in `seedvm` hid items 1–4. Remove once warnings are triaged.
10. ☐ Real surface syntax is the `seed name { §SECTION {…} }` document form; the spec's `agent X {…}`,
    `discharge … with {…}`, `infer<T>(…)` EBNF is **not** what the parser accepts. Pick one and align spec ↔ parser.

Test counts (this branch): seedc 20 · seedvm 57 · seedc-cli bin 7 → **84**, from a baseline of 17
(one of which hung).

---
## 5. Arc42 amendments

* **§3 Building blocks (seedvm)** — now accurate: `bi_temporal, capability, choreographic, computation,
  datalog, executor, inference, memory/*, orchestrator, protocols/*, rng, sanitize, schedule, state,
  taint, tee, trace_events, uncertain_kind, uncertainty, value`.
* **§8 Risks** — add items 6–10 of §4; mark "stubbed sema passes" as *still open on real `main`*
  (the real `sema/` differs from the drafts' pass list; re-audit before planning).
* **ADR-007 (revised)** TraceEvent: terminal-`Handled`, phased `Denied` (§2.1).
* **ADR-008 (revised)** Use ETAS normal form + monitors + three-outcome discharge (§2.3).
* **ADR-010 (revised)** zkComposer as optional tier with honest numbers (§2.5).
* **ADR-011 (revised)** CoMem empirical promotion + labelled ASL extension (§2.4).
* **ADR-017 (new)** *Dead-code guard:* CI fails if a `src/**/*.rs` file isn't reachable from a `mod`
  declaration (prevents item 4 recurring).
* **ADR-018 (new)** *Verifier contract:* defined-before-use is per function, order-carrying; params
  and `StoreLocal` targets define slots.
* **ADR-019 (new)** *Debug side effects:* library code performs no filesystem writes unless opted in.
* **ADR-020 (proposed)** *IR execution model:* stack-IR vs SSA — decide and document.

## 6. Next milestones (acceptance criteria)
1. **Parser ↔ spec alignment** (ADR/decision first, then code). Accept: a source file using the chosen
   `perform`/`discharge`/`infer` syntax parses; `effectck` rejects an undischarged `perform` *from
   source text*, not from a hand-built AST (the ignored test in the earlier tree must pass).
2. **Tests for the seven revived modules** (≥ 1 behavioural test per public fn).
3. **ADR-020 resolved**, then lowering emits real constants (no `String(0)`), executor honours operands.
4. **TraceSpecAlgebra per §2.3** with a 3-outcome discharge test matrix (proved/residual/rejected).
5. CI: dead-module guard (ADR-017), `cargo test --workspace --lib --tests`, clippy denied warnings.
