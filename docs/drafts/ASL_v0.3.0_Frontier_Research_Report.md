> **SUPERSEDED IN PART (2026-10-30).** This draft was written from search snippets and contains claims later found wrong (event lifecycle, TraceSpecAlgebra, CoMem promotion rule, zkComposer speedups, EU AI Act dates, "ETAS has no memory"). Read `docs/ASL_V0_3_0_ADDENDUM_VERIFIED.md` first; where they conflict, the addendum wins.

# ASL Frontier Research Report
## Agent-Seed Language — v0.3.0 Innovation Brief
**Generated:** 2026-10-23  
**Author:** Research synthesis for Damian Peter Ramsajan  
**Purpose:** Competitive landscape + gap analysis → spec upgrade + Arc42 update inputs  
**Status:** Pre-spec / pre-code — design input document

---

## Executive Summary

Agent-Seed Language (ASL) is the most formally ambitious agent programming language in existence. After a full frontier sweep across PL theory, zkML, multi-agent memory, neuro-symbolic systems, corrigibility, and the six competing DSLs that emerged in 2026, the conclusion is clear: **ASL already leads on the dimensions that matter most — but five critical gaps, if closed, would put it in a category no competitor can reach for at least 2–3 years.**

The five gaps are:
1. **Trace-typed action semantics** (ETAS, July 2026, showed the gap)
2. **Dependent-type spec layer** (Lean4Agent + NFV, June 2026, showed the opportunity)
3. **zkComposer-native proof parallelism** (zkComposer, July 2026, unlocks production zkML)
4. **CoMem collective memory discipline** (CoMem, Sept 2026, prevents memory pollution in multi-agent)
5. **Structured uncertainty reduction** (SAGE-Agent + BayesAgent, 2026, elevates U4/U6 axioms)

This document details every competitor, every gap, and every innovation opportunity with enough precision to drive spec sections and Arc42 ADRs.

---

## Part 1 — Competitive Landscape

### 1.1 ETAS — Effect-Typed Language for Agent Systems
**Source:** arXiv:2607.17780, Tan et al., July 20, 2026. Implemented in Rust.

ETAS is the closest competitor to ASL in formal ambition. It tracks computations with **two behavioral indices**: an escaping effect row and a persistent action-trace abstraction. Its `TraceSpecAlgebra` compiles allow/deny/temporal constraints into a checked descriptor. Handlers are trace-transparent — they cannot erase an action's audit record.

**What ETAS has that ASL lacks:**
- A formal distinction between *requested*, *handled*, *denied*, and *committed* events — ASL's `perform` is binary (performed or not)
- `trace specs` as a first-class compile-time constraint calculus — ASL has temporal contracts (§25) but they operate at runtime via SMT, not compile-time algebra
- `callable specs` that constrain function shapes before any code runs
- A proved core calculus with preservation, progress, and **policy safety** theorems

**What ASL has that ETAS lacks:**
- Uncertain<T> graded monad with interval arithmetic (ETAS has no uncertainty model)
- Memory hierarchy (ETAS has no memory system at all)
- Corrigibility layer (ETAS has no principal hierarchy or dead-switch)
- Grammar stratification S0–S3 (ETAS is a single-stratum language)
- zkProof integration
- Dream cycle and heartbeat autonomy loop

**Gap to close:** ASL's `perform` should be upgraded to distinguish the four ETAS event kinds at the type level. The temporal contract SMT enforcement (§25) should be complemented by a **compile-time trace spec algebra** that catches obvious violations without running the solver.

---

### 1.2 VIGIL — Runtime Behavioral Enforcement via SMT
**Source:** arXiv:2606.26524, 2026.

VIGIL reduces finite-trace temporal safety properties to a single SMT query per enforcement decision. The unsatisfiable core of a failed query identifies the **exact offending invocation**. This is more actionable than ASL's current enforcement reporting, which surfaces a violation without a structural blame term.

**Innovation opportunity:** ASL's §25 enforcement should adopt VIGIL's **blame extraction** — when a temporal contract fires, the violation report must name the specific action, not just log the event.

---

### 1.3 FORGE — Formal Runtime Guarantee Enforcement (Aspect-Oriented)
**Source:** arXiv:2602.16708, Palumbo, May 2026.

FORGE treats policy enforcement as a cross-cutting concern via aspect-oriented programming. Its **Policy Substrate** (Σ) is a typed vocabulary of facts tracking execution state. Policies are expressed in **Datalog**, making composition and query decidable.

ASL already uses Datalog for hypergraph closure (§22). FORGE's innovation is treating the entire runtime state as a Datalog fact base — not just capabilities. This means temporal queries like "was consent verified in this session?" become Datalog queries, not LTL formulas, giving O(1) amortized complexity instead of PSPACE.

**Gap to close:** ASL should expose a **Datalog fact substrate** alongside the SMT temporal contracts. For safety properties that are reachability queries over session state (the majority of practical policies), Datalog is both more efficient and more expressive than LTL.

---

### 1.4 Lean4Agent — Dependent-Type Workflow Verification
**Source:** arXiv:2606.06523, Wang et al., June 2026.

Lean4Agent applies Lean 4's dependent-type system to verify agent workflows and execution trajectories. It has three layers: static semantic verification, runtime rollout checking, and LeanEvolve (formal-guided workflow evolution). It uses Claude-Opus-4.6 to generate 40 workflows with Layer-2 verification.

**What this means for ASL:** ASL's stratum S3 is described as "runtime kernel, trusted orchestrators only" but has no formal proof layer. Lean4Agent demonstrates that **verified agent workflows** are achievable today. ASL's evolution gating (§29) requires adversarial simulation but not a machine-checkable proof of the amendment. This is a hole.

**Innovation opportunity:** ASL v0.3.0 should introduce `spec<T>` — a dependent-type specification block that can be checked by an external Lean 4 / Dafny oracle at S2+ compilation. The oracle produces a proof artifact embedded in the `.aslb` binary. This would make ASL the first agent language with **dependent-type verified agent programs** as a standard feature, not a research prototype.

---

### 1.5 Neuro-Formal Verification (NFV)
**Source:** arXiv:2608.21516, August 2026.

NFV equips AI agents with formal verifiers as tools — the LLM is the agent, the pipeline calls Dafny/Z3 to discharge formal claims. It achieves empirical accuracy (not soundness) with machine-checked proof sketches, push-button style.

**ASL integration path:** The `trajectory_audit` function (§TRAJECTORY-AUDIT) already calls Z3. NFV shows the composable pattern: the agent doesn't verify itself, it calls a verifier tool. ASL should expose this as a first-class `verify` effect with a formal proof return type, usable inside any agent body.

---

### 1.6 AgentSPEX — Specification and Execution Language
**Source:** Wang et al., 2026 (AgentSPEX paper).

AgentSPEX supports typed steps, branching, loops, parallel execution, reusable submodules, explicit state management, checkpointing, and verification. It explicitly separates workflow logic from Python.

**Difference from ASL:** AgentSPEX is a workflow orchestration DSL — it makes control flow explicit but has no type-theoretic safety guarantees, no uncertainty model, no memory hierarchy, no capability tokens, and no cryptographic identity. It is a structured scripting system, not a language with formal semantics.

**ASL's position:** ASL already subsumes everything AgentSPEX offers plus orders of magnitude more. No action needed except ensuring ASL's S0 stratum is ergonomically comparable to AgentSPEX for onboarding.

---

### 1.7 Codifide v4.0 — Effect-Tracked Agent Language (Python)
**Source:** PyPI, May 14, 2026.

Codifide tracks effects transitively at module load time. Its design insight: "a pure function cannot call an effectful one." It ships with `effects {model.vision}` annotations and checked effect propagation.

**Difference from ASL:** Codifide is Python-based, dynamically typed, and has no formal semantics, no memory system, no uncertainty types, no capability tokens, and no zkML. It approximates 15% of ASL's §LEXICAL-GRAMMAR.

**ASL's position:** ASL's effect row polymorphism (§3.4) is strictly more powerful. Codifide validates that the market wants this kind of language — ASL should ensure its S0 stratum is no harder to onboard than Codifide.

---

### 1.8 007 Meta-Language — Linear Agent Handles
**Source:** GitHub, hyperpolymath/007.

The 007 language proposes linear types for agent handles: `linear let worker = spawn Searcher(...)` — the worker must be consumed exactly once. It separates agent control from data (Harvard architecture for agents) and proposes choreographic agents compiled from global protocol to verified local code.

**What ASL has:** ASL has session types (§24) which provide choreographic guarantees, and affine types (§3.3) which are close to linear. But ASL's session types are declared separately from agent spawning, not unified with the spawn expression.

**Innovation opportunity:** When `spawn` creates an agent in ASL, the returned handle should be session-typed and affine — consuming it twice is a compile error. This closes the gap with 007's linear handles using ASL's existing session type infrastructure.

---

### 1.9 Tracking Capabilities for Safer Agents — Scala Capture Checking
**Source:** arXiv:2603.00991, 2026.

This paper implements a capability-safe language subset in Scala using **capture checking** — the compiler statically rejects sub-agent code that exceeds its granted capabilities. Key result: "an outer agent can grant a sub-agent a subset of its own capabilities, and the compiler statically rejects any sub-agent code that exceeds this budget."

**ASL's position:** ASL has this (§22 capability tokens + §3.5 capability type rules). The gap is that ASL's compile-time enforcement is stratum-dependent (S1+). The Scala paper does it without strata.

**Insight:** ASL should document that S1 capability enforcement already subsumes the Scala paper's static capability checking, and add a conformance test that specifically verifies the sub-agent budget containment property.

---

### 1.10 ASHE — Capability-Broker Protocol
**Source:** github.com/patrickkarle/ashe-spec, Phor, May 28, 2026.

ASHE is a capability-broker protocol — a structural alternative to RLHF/Constitutional AI. It focuses on mediation at the protocol layer, not the language layer. Its framing: "TLS for the agent layer."

**ASL's position:** ASL already provides everything ASHE proposes plus formal language semantics. ASHE is infrastructure; ASL is both infrastructure and language. ASHE's framing ("structural alternative to refusal layers") is well-phrased and worth borrowing for ASL's positioning.

---

## Part 2 — Research Frontiers to Integrate

### 2.1 zkComposer — Parallel zkML Proof Construction
**Source:** arXiv:2607.08095, July 2026.

zkComposer decomposes zkML proofs into **independent sub-proofs**, one per subset of contiguous model layers, enabling parallelism beyond what existing systems support. Same soundness guarantees as monolithic proofs, no extra linking proofs, no cryptographic primitive changes.

**Impact on ASL:** ASL's `ProofMeta` (§P-CALC) currently specifies `ProofType::NanoZK` with a single 5.5 KB proof and 24ms verification. With zkComposer, the `infer<T>` call can generate sub-proofs for each model tier in the routing policy in parallel, then compose them. This cuts proof generation time for multi-step pipelines by the number of parallel workers.

**New spec content:**
- `ProofType::zkComposer` added to the `proof_type` enum
- `proof_composer_config` field on `fggm_config` with `parallelism: integer` and `composition_strategy: sequential | parallel`
- `zkComposer` becomes the recommended proof type for `think::deep` and above

---

### 2.2 CoMem — Collective-Individual Memory for Multi-Agent Systems
**Source:** arXiv:2609.15009, September 2026.

CoMem identifies **two forms of memory pollution** in shared agent memory: noise accumulation (unverified behaviors flooding shared memory) and behavioral homogenization (agents losing individual specialization). It proposes a promotion pathway: private memory promotes to collective only after **cross-agent verification with usage-aware rolling pruning**.

**Impact on ASL:** ASL's federated memory (L5) uses CRDTs for eventual consistency but has no quality control on what gets federated. A `FederatedFact` can be published by any Verified-trust agent. CoMem's insight is that **two-stage promotion** — local → collective only after threshold cross-agent verification — prevents memory pollution without sacrificing federation benefits.

**New spec content in §FEDERATION and §MEMORY-ARCHITECTURE:**
- `federated_promotion_policy` on L5 layer config:
  ```
  federated_promotion_policy: {
    strategy: comem,
    min_agent_verifications: 3,
    pruning: usage_aware_rolling,
    anti_homogenization: preserve_specialist_distributions,
  }
  ```
- `FederatedFact` gains `verification_count: u32` and `promoting_agents: Vec<AgentId>` fields
- Facts below threshold are `FederationStatus::Pending` not `Active`

---

### 2.3 SAGE-Agent / Structured Uncertainty Reduction
**Source:** arXiv, ACL Findings 2026. Builds on BayesAgent (AAAI 2026).

SAGE-Agent separates **specification uncertainty** (what does the user want?) from **model uncertainty** (what does the model predict?) and applies structured uncertainty for both inference-time question selection and training-time reward modeling. BayesAgent bridges LLM agents with probabilistic graphical models (vPGM) for calibrated posterior refinement.

**Impact on ASL:** ASL's U4 (conditioning/observe) and U6 (effect handler uncertainty preservation) are sound but do not distinguish specification uncertainty from model uncertainty. This matters enormously for agentic tool selection — a low-confidence `Uncertain<Classification>` might be uncertain because the prompt was ambiguous (specification) or because the model is inherently unreliable on this topic (model epistemic). The remediation is completely different.

**New spec content:**
- `UncertaintyKind` enum added to `Uncertain<T>`:
  ```
  enum UncertaintyKind {
    Specification,   // ambiguity in what was asked
    ModelEpistemic,  // model doesn't know
    ModelAleatory,   // inherent randomness in the domain
    Taint,           // uncertainty due to poisoned inputs
    Composite(Vec<UncertaintyKind>),
  }
  ```
- `observe_structured(spec_evidence: Bool, model_evidence: Bool)` — separate conditioning on spec vs. model uncertainty
- Conformance test UNC-07: `observe_structured` narrows spec uncertainty without changing model epistemic bound

---

### 2.4 Episodic-Semantic Memory Consolidation with Implicit Triggers
**Source:** David Mitchell research synthesis, July 2026; arXiv:2605.17625 (dual-process scientific agent).

The best-supported consolidation architecture uses a **computed trigger** (importance score, heat score, or idle-time window) rather than a fixed schedule, combined with a **structured extraction step** rather than free-text summarization. A-MEM (2025) is the only system that retroactively edits contextual attributes of existing memories when a new memory links in — instead of just appending new semantic content.

**Impact on ASL:** ASL's consolidation trigger (§2.6, §11) currently only supports `reinforcement_count >= N`, `time_interval`, and `session_end`. The research shows importance-score-triggered consolidation dramatically outperforms count-based. The A-MEM retroactive attribute edit is a structural innovation.

**New spec content:**
- Consolidation triggers expanded:
  ```
  consolidation_trigger ::= 
    reinforcement_count >= integer_literal
  | time_interval duration_literal
  | session_end
  | importance_score >= float_literal        # NEW: heat/importance trigger
  | idle_window duration_literal             # NEW: idle-time trigger
  | retroactive_link_detected                # NEW: A-MEM style
  ```
- `retroactive_link_detected` trigger: when a new episodic entry links to an existing semantic concept, the existing concept's contextual attributes are re-evaluated and potentially updated

---

### 2.5 Lean4Agent / NFV — Dependent-Type Verification at Workflow Level
**Source:** arXiv:2606.06523 (Lean4Agent); arXiv:2608.21516 (NFV).

Together these papers show that **verified agent workflows** are now achievable, not just theorized. The key pattern: an LLM generates a workflow, a Lean 4 checker verifies invariants, feedback drives refinement (LeanEvolve). NFV frames this as "equipping an AI agent with a formal verifier as a tool."

**New ASL construct — `spec<T>` block:**
```
spec_block_def ::= "spec" identifier "<" type ">" "{"
    "invariants"    ":" "[" lean4_formula {"," lean4_formula} "]" ","
    "preconditions" ":" "[" lean4_formula {"," lean4_formula} "]" ","
    "postconditions" ":" "[" lean4_formula {"," lean4_formula} "]" ","
    "oracle"        ":" ("lean4" | "dafny" | "z3") ","
    "proof_artifact" ":" boolean_literal
"}"
```
When `proof_artifact: true`, the oracle-generated proof is embedded in the `.aslb` binary and verifiable by any external auditor without re-running the oracle. This is the dependent-type layer that none of ASL's competitors have.

---

### 2.6 ETAS Trace-Event Quadripartition
**Source:** arXiv:2607.17780.

ETAS's four-way event distinction — **requested → handled → denied → committed** — is the cleanest formalization of the perform/discharge lifecycle in the literature. ASL currently has: `perform` (requested + handled), `discharge` (committed), implicit denial. The gap is that "denied" events are not tracked in the provenance chain.

**New spec content:**
- `TraceEvent` enum added to the provenance system:
  ```
  enum TraceEvent {
    Requested(EffectId, Timestamp),
    Handled(EffectId, HandlerId, Timestamp),
    Denied(EffectId, DenialReason, Timestamp),
    Committed(EffectId, ProvenanceId, Timestamp),
  }
  ```
- Every `perform` produces a `Requested` trace event immediately
- Handler intercept produces `Handled`
- Discharge gate rejection produces `Denied(reason: CapabilityDenied | ConfidenceBelowThreshold | TaintExceeded | BudgetExhausted | ProofUnverified)`
- Successful discharge produces `Committed`
- The action trace is queryable: `mem.action_trace(from, to)` returns `Vec<TraceEvent>`
- Temporal contracts can now reference `Denied` events: `G(Requested(E) → F(Committed(E) || Denied(E)))` — no event is silently lost

---

### 2.7 Structured Uncertainty in GRPO Training
**Source:** ACL Findings 2026 (SAGE-Agent). 

Structured uncertainty provides a principled foundation for both inference-time question selection and **uncertainty-weighted GRPO training**. Rewards weighted by inverse uncertainty reduce variance dramatically.

**Impact on ASL §RL-TRAINING:**
- `reward_component` should support `uncertainty_weighted: true` as a flag
- The GRPO training loop uses `1 / uncertainty.width()` as a reward weight (higher confidence → higher weight on correct rewards)
- `convergence_guard_config` gains `uncertainty_weighted_advantage: true`

---

### 2.8 Multi-Layer Memory Architecture with Adaptive Gating
**Source:** arXiv:2603.29194; arXiv:2602.19320.

The research consensus for 2026 is that the best memory architecture uses **three primary layers** (working, episodic, semantic) with **adaptive retrieval gating** — not fixed cascade. The gating function evaluates query urgency, context type, and confidence before routing. This is distinct from ASL's System 1/System 2 dual-process (§9) which routes by task complexity.

**New spec addition — Adaptive Retrieval Gate:**
```
adaptive_retrieval_gate: {
    inputs: [query_urgency, context_type, confidence_floor, session_phase],
    routing: {
        working_direct:  urgency > 0.8 && confidence_floor > 0.9,
        episodic_first:  context_type == temporal || context_type == causal,
        semantic_first:  context_type == factual || context_type == relational,
        full_cascade:    default,
    },
    fusion_strategy: {
        method: attention_weighted,
        normalize_by_layer_confidence: true,
    },
}
```

---

## Part 3 — Gap Summary Table

| Gap | Current ASL State | Research Source | Innovation | Impact |
|-----|------------------|----------------|------------|--------|
| G1: Trace event quadripartition | Binary perform/discharge | ETAS (Jul 2026) | `TraceEvent` enum, denied events in provenance | Audit completeness, ETAS parity |
| G2: Compile-time trace specs | Runtime SMT only | ETAS + VIGIL (2026) | `TraceSpecAlgebra` at S1 compile time | Catch violations pre-deployment |
| G3: Blame extraction in violations | Logs event, no blame term | VIGIL (2026) | SMT unsatisfiable core → offending invocation | Actionable debugging |
| G4: Datalog policy substrate | Datalog for caps only | FORGE (May 2026) | Full session-state Datalog fact base | O(1) reachability queries |
| G5: Dependent-type spec layer | No machine-checked proofs | Lean4Agent + NFV (Jun–Aug 2026) | `spec<T>` block with oracle and proof artifact | First agent language with verified workflows |
| G6: zkComposer parallel proofs | Monolithic NanoZK | zkComposer (Jul 2026) | `ProofType::zkComposer`, parallel sub-proofs | Production-viable proof times |
| G7: Uncertainty kind distinction | Single interval, no kind | SAGE-Agent + BayesAgent (2026) | `UncertaintyKind` enum, `observe_structured` | Better remediation targeting |
| G8: Collective memory promotion | CRDT publish, no quality gate | CoMem (Sep 2026) | `federated_promotion_policy: comem` | Prevents federation memory pollution |
| G9: Importance-triggered consolidation | Count + schedule only | Mitchell 2026, A-MEM 2025 | `importance_score` and `retroactive_link` triggers | Better memory quality vs. volume |
| G10: Spawn-typed linear handles | Session types separate from spawn | 007 meta-language (2026) | Session-typed, affine spawn handles | No leaked agent handles |
| G11: Uncertainty-weighted GRPO | Unweighted rewards | SAGE-Agent (2026) | `uncertainty_weighted: true` reward flag | Faster RL convergence |
| G12: Adaptive retrieval gating | Dual-process S1/S2 only | arXiv:2603.29194 | `adaptive_retrieval_gate` config | Query-aware memory routing |

---

## Part 4 — Competitive Positioning

### What No Competitor Has, That ASL Already Has
1. **Uncertain<T> graded monad** with six formal axioms (U1–U6) — zero competitors have this
2. **Eight-layer memory hierarchy** with Merkle integrity, MESI protocol, and CRDT federation
3. **Grammar stratification S0–S3** with machine-checked subset proofs
4. **Corrigibility layer** (§26) with five-head utility and decidable island certification
5. **Dream cycle** with formal pre/post-conditions and idempotency invariants
6. **Heartbeat OODA loop** grounded in McCann 2026 governance algebra
7. **A2A + MCP native bindings** with nine-state task machine and MCPSHIELD
8. **Capability token hypergraph closure** with Datalog equivalence
9. **Session protocols** with priority-based deadlock freedom (Mordido & Pérez 2025)
10. **Provenance chain** implementing SPICE Truth Stack + TraceCaps + SCITT receipts

### What Closing the 12 Gaps Gives ASL
- **ETAS parity + more**: Four-event trace algebra at compile time (G1, G2, G3) — ASL will be the only system with both compile-time trace specs AND runtime SMT enforcement
- **First verified-workflow agent language**: `spec<T>` + Lean4 oracle (G5) — no competitor has dependent-type verified agent programs as a shipping feature
- **Production-viable zkML**: zkComposer (G6) makes proof times fall from minutes to seconds on multi-step pipelines
- **Federation memory integrity**: CoMem promotion (G8) is the missing quality layer that makes ASL's federated memory trustworthy at scale
- **Uncertainty that teaches you why**: UncertaintyKind (G7) transforms uncertainty from a "go/no-go" signal into a diagnostic tool

---

## Part 5 — Recommended Innovation Additions for v0.3.0

Beyond closing gaps, three genuinely new innovations are within reach and would set ASL apart by a generation:

### Innovation A — Intent-to-Spec Pipeline (§INTENT-SPEC)
Borrowing from the NFV + Lean4Agent pattern: a `from_intent` constructor that takes natural language intent, calls an oracle to formalize it into a `spec<T>` block, requires human countersignature on the formalization, and then embeds the spec in the binary. This closes the "intent gap" (the hardest unsolved problem in the field per Intent Formalization, arXiv:2603.17150).

```
from_intent<MarketAnalysis>(
    intent: "ensure no position exceeds 5% of portfolio",
    oracle: lean4,
    countersignature: required,
) -> spec<MarketAnalysis>
```

### Innovation B — Bi-Temporal Memory (§BI-TEMPORAL)
Inspired by ArqonDB (AlbericByte, 2026) and Semantica (Hawksight-AI, 2026): every memory layer tracks two time axes — **valid time** (when the fact was true in the world) and **transaction time** (when it was recorded in the system). This allows agents to reason about "what did I believe at T1 about what was true at T0?" — essential for retrospective analysis and regulatory compliance.

```
mem.get_at(
    key: String,
    valid_time: Timestamp,
    transaction_time: Timestamp,
) -> Option<MemoryRecord<T>>
```

### Innovation C — Choreographic Spawn (§CHOREOGRAPHIC-SPAWN)
Unifying 007's linear handles with ASL's session types: when `spawn` creates an agent, the return type is a **session handle** `SessionHandle<S, Role>` where `S` is the global session type and `Role` is the spawned agent's role. The spawner's local type is the dual of the spawned agent's local type. Spawning and protocol establishment are **one operation**, not two. This makes multi-agent choreography verifiably correct by construction at the moment of agent creation.

---

## Part 6 — Spec Update Map

The following sections of the current spec require updates. No section is removed; all additions are backward-compatible.

| Spec Section | Change Type | Driven By |
|---|---|---|
| §1.3 Keywords | Add: `spec`, `from_intent`, `TraceEvent`, `UncertaintyKind`, `valid_time`, `transaction_time`, `choreographic` | G1, G5, G7, Innov A, B, C |
| §2 (new) §TRACE-SPEC | New section: compile-time `TraceSpecAlgebra` | G1, G2 |
| §3.8 MemoryRecord | Add bi-temporal fields `valid_time`, `transaction_time` | Innov B |
| §4 (Uncertain Axioms) | Add UncertaintyKind, U7 (kind-aware conditioning), `observe_structured` | G7 |
| §5 (Cognitive Types) | Add blame extraction to InferenceError, spec<T> block | G3, G5 |
| §6 (Memory Architecture) | Add L8 bi-temporal index; CoMem promotion policy on L5 | G8, Innov B |
| §7 (Memory Governance) | Add importance-triggered consolidation, retroactive link detection | G9 |
| §9 (Dual-Process Memory) | Add adaptive retrieval gate alongside S1/S2 | G12 |
| §22 (Capability Tokens) | Integrate full Datalog policy substrate | G4 |
| §24 (Session Protocols) | Choreographic spawn: unify spawn + session in one expression | G10, Innov C |
| §25 (Temporal Contracts) | Add VIGIL-style blame extraction to violation reports | G3 |
| §29 (Self-Evolution) | Add `spec<T>` verification step in amendment pipeline | G5 |
| §30 (RL Training) | Add uncertainty-weighted GRPO reward flag | G11 |
| §31 (Provenance Chain) | Add `TraceEvent` quadripartition, denied-event logging | G1 |
| New §37 — §INTENT-SPEC | `from_intent` constructor with oracle formalization | Innov A |
| New §38 — §BI-TEMPORAL | Bi-temporal memory API | Innov B |
| New §39 — §CHOREOGRAPHIC-SPAWN | Session-typed linear spawn handles | Innov C |

---

## Part 7 — Arc42 ADR Additions

### ADR-007 — Adopt TraceEvent Quadripartition
**Status:** Proposed  
**Context:** ETAS (arXiv:2607.17780) demonstrated that binary perform/discharge loses audit information. Denied events are invisible in the current provenance chain.  
**Decision:** Add `TraceEvent` enum with Requested/Handled/Denied/Committed to §31. Every `perform` must produce a `Requested` entry. Denial must produce a `Denied` entry with the reason.  
**Consequences:** Provenance log grows; L7 schema gains `TraceEvent` records. More complete audit trail. Enables VIGIL-style blame extraction.

### ADR-008 — Compile-Time TraceSpecAlgebra (S1+)
**Status:** Proposed  
**Context:** Current temporal contracts are runtime SMT only (expensive). ETAS compiles trace specs to a `TraceSpecAlgebra` at parse time, catching obvious violations before any code runs.  
**Decision:** Add `TraceSpecAlgebra` as a new compilation phase between `sema::effectck` and `lowering`. Phase runs only at S1+. Result is a set of residual obligations passed to the SMT solver at runtime.  
**Consequences:** Compilation is slightly slower (new phase). Runtime safety overhead decreases for compliant programs (fewer SMT queries needed).

### ADR-009 — spec<T> Dependent-Type Layer at S2+
**Status:** Proposed  
**Context:** Lean4Agent and NFV demonstrate that machine-checked agent workflow proofs are practical in 2026. ASL's amendment pipeline (§29) currently uses simulation + human countersignature but no formal proof.  
**Decision:** Introduce `spec<T>` block at S2+. Requires oracle (lean4/dafny/z3). When `proof_artifact: true`, proof embedded in `.aslb`. All amendments at S2+ must include a `spec<T>` block on the amended section.  
**Consequences:** S2+ compilation requires oracle access. Major increase in formal safety guarantees. First agent language with shipping dependent-type verified programs.

### ADR-010 — ProofType::zkComposer
**Status:** Proposed  
**Context:** zkComposer (arXiv:2607.08095) provides parallel zkML proof construction with same soundness as monolithic proofs. Production-viable for multi-step pipelines.  
**Decision:** Add `ProofType::zkComposer` with `parallelism` config. Make it the recommended proof type for `think::deep` and above.  
**Consequences:** Proof generation times for complex agents drop from minutes to seconds.

### ADR-011 — CoMem Federation Promotion Policy
**Status:** Proposed  
**Context:** CoMem (arXiv:2609.15009) proves that CRDT federation without quality gates causes memory pollution at scale.  
**Decision:** Add `federated_promotion_policy: comem` option on L5 memory config. `FederatedFact` gains `verification_count` and `promoting_agents` fields. Facts with count < threshold are `Pending`, not `Active`.  
**Consequences:** Federation is slower to converge (facts need cross-agent verification). Federation quality dramatically higher. Memory pollution impossible by construction.

### ADR-012 — UncertaintyKind First-Class Type
**Status:** Proposed  
**Context:** SAGE-Agent (ACL 2026) and BayesAgent (AAAI 2026) show that distinguishing specification vs. model uncertainty enables targeted remediation and better GRPO training.  
**Decision:** Add `UncertaintyKind` enum to `Uncertain<T>`. Add `observe_structured(spec_evidence, model_evidence)` method. Update U4 axiom to be kind-aware.  
**Consequences:** Richer uncertainty semantics. Inference error handlers can target the right cause. GRPO training becomes uncertainty-weighted.

### ADR-013 — Bi-Temporal Memory (L8)
**Status:** Proposed  
**Context:** ArqonDB and Semantica demonstrate bi-temporal memory (valid time + transaction time) is necessary for regulatory compliance and retrospective agent reasoning.  
**Decision:** Add L8 `bi_temporal_index` layer. Add `valid_time` and `transaction_time` fields to all MemoryRecord types. Add `mem.get_at(key, valid_time, transaction_time)` API.  
**Consequences:** Memory storage grows ~20%. Retrospective queries become first-class. Satisfies EU AI Act audit requirements natively.

### ADR-014 — Choreographic Spawn (§39)
**Status:** Proposed  
**Context:** 007 meta-language shows linear agent handles prevent leaks. ASL's session types are currently separate from spawn. Unifying them makes multi-agent protocol correctness verifiable at creation.  
**Decision:** `spawn Agent<Role>` returns `SessionHandle<GlobalType, Role>` — affine type. Compiler verifies spawner holds the dual role in the same global type. Illegal topologies are parse errors.  
**Consequences:** Multi-agent spawn is more verbose (requires session type annotation). Illegal multi-agent topologies are impossible to express. Major safety gain.

---

## Part 8 — Implementation Priority Order

When coding begins, recommended order given current scaffold state:

1. **Phase 0 (hygiene):** Fix stubbed sema passes (effectck, taintck, contractck), fix hanging stdin test, fix broken scaffold crates — this is pre-req for everything
2. **TraceEvent quadripartition** (G1) — foundational, touches provenance + discharge
3. **UncertaintyKind** (G7) — builds on existing U1–U6, high value, moderate complexity  
4. **CoMem promotion policy** (G8) — adds fields to FederatedFact, new gate in VM
5. **Importance-triggered consolidation** (G9) — extends existing consolidation trigger enum
6. **Adaptive retrieval gate** (G12) — new config block, new routing logic
7. **zkComposer proof type** (G6) — new ProofType variant, parallelism config
8. **Compile-time TraceSpecAlgebra** (G2, G3) — new compiler phase, highest complexity
9. **Datalog policy substrate** (G4) — extends existing Datalog hypergraph
10. **spec<T> block** (G5) — new S2+ construct, oracle integration
11. **Choreographic spawn** (G10, Innov C) — redesign spawn expression
12. **Bi-temporal memory** (Innov B) — new L8 layer
13. **from_intent** (Innov A) — highest complexity, requires NL formalization oracle

---

*End of Frontier Research Report. This document feeds directly into ASL_V0.3.0_Spec.md updates and the Arc42 blueprint v0.3.0 revision.*
