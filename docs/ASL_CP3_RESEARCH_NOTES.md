# ASL CP3 Research Notes (2026-11-24)

**Applies to:** `docs/ASL_V0_3_0_ADDENDUM_VERIFIED.md` and the v0.3.0 drafts.
**Purpose:** record this round's research, what was actually read, and what it
means for ASL, under the addendum's own rule: *a paper may ground a MUST only
if it is marked VERIFIED there.* Everything below was read at **abstract /
excerpt level through search results**, not in full, so **nothing here may
ground a MUST**. Statuses:

* **CONFIRMS** — consistent with something already VERIFIED in the addendum.
* **EXCERPT** — read in excerpts (abstract plus fragments); design claims
  plausible, numbers unchecked.
* **SECONDARY** — the fact comes from press or blog coverage of a primary source.
* **PROPOSAL** — an ASL design idea motivated by the source; ASL's own judgement.

---

## 1. Evidence register

| # | Claim | Source | Status | Note |
|---|---|---|---|---|
| R1 | CaMeL separates control flow from data flow: a privileged LLM plans from the trusted query, a quarantined LLM (no tool access) parses untrusted data, and a custom interpreter tracks capabilities (sources, readers) on every value and enforces policy at tool-call time. | Debenedetti et al., Google DeepMind / ETH, arXiv:2503.18813; independently described in arXiv:2505.02077, 2505.22852 and 2609.18674 | **EXCERPT** (design consistent across five texts) | **Numbers disagree between versions**: the first abstract reports 67% of AgentDojo tasks solved with provable security; a later version reports 77% (vs 84% undefended). Quote neither without naming the version. |
| R2 | CaMeL's interpreter is a restricted Python, so dynamic typing, exceptions and reflection make strong static information-flow guarantees hard; the authors of an enterprise-deployment study point to compile-time IFC (FlowCaml-style) as the alternative. | Operationalizing CaMeL, arXiv:2505.22852 | **EXCERPT** | This is the clearest statement of the gap ASL targets: *static* effect + taint checking in a purpose-built language. It is a positioning argument, not evidence ASL achieves it. |
| R3 | MCP revision **2026-07-28** is stateless: no `initialize` handshake, no `Mcp-Session-Id`; every request carries version, client identity and capabilities in `_meta`; `Mcp-Method` / `Mcp-Name` headers required; official **Tasks** and **MCP Apps** extensions; a formal feature lifecycle (Active / Deprecated / Removed); `server/discover` used for version detection. | MCP project blog (release + RC), Cloudflare, Google Developers, Quarkus, AAIF | **CONFIRMS** addendum §7 (ADR-022) | New detail vs the addendum: the Tasks extension (`tasks/get`, `tasks/update`, `tasks/cancel`), `server/discover`, and the lifecycle classification. Not yet modelled in `protocols/mcp.rs`. |
| R4 | A2A **v1.0** is the first stable spec; breaking interaction changes; AgentCards stay backward compatible and may advertise v0.3 and v1.0 together; 150+ supporting organisations by April 2026; the Agent Payments Protocol (AP2, 60+ organisations) extends A2A towards agent-driven payment. | Linux Foundation press release (9 Apr 2026); A2A `announcing-1.0.md` | **CONFIRMS** addendum §7.1; AP2 is **SECONDARY** | One aggregator page says "release date 2025": that is wrong; the addendum's 2026-03-12 stands. |
| R5 | Conformal methods give distribution-free, finite-sample coverage for black-box LLM agents: reliability certification from self-consistency samples (arXiv:2602.21368); API-level conformal risk control with a ship / abstain / escalate actuator (arXiv:2509.23007); set-valued act-vs-escalate decisions where singleton sets act and larger sets escalate (arXiv:2604.07667). | as listed | **EXCERPT** | Guarantees are *marginal* and assume exchangeability between calibration and deployment data. Distribution shift voids them. |
| R6 | Least-privilege tool exposure: high-risk tools should not even be visible to the agent until causally justified and authorized (RACG). | arXiv:2606.13884 (single independent author) | **EXCERPT** | Low weight. Useful only as an echo of "least agency". |
| R7 | OWASP Top 10 for Agentic Applications 2026 (9 Dec 2025): ASI01 Agent Goal Hijack, ASI02 Tool Misuse, ASI03 Identity & Privilege Abuse, ASI04 Agentic Supply Chain, ASI05 Unexpected Code Execution, ASI06 Memory & Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08 Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents; principle of **least agency**. | OWASP GenAI project page (found); list read from TechRepublic's summary | **SECONDARY** | Re-read the primary document before citing item wording in release notes. |
| R8 | Verifiable LLM inference with ZK is still small-model territory: DeepProve reports end-to-end proofs for GPT-2 and Gemma 3 at roughly 174 and 86 tokens/minute (vendor paper, abstract only); a feasibility taxonomy rates zkML "requires R&D" for frontier scale; a separate paper argues cheap *tool receipts* beat ZK for agent hallucination detection. | IACR ePrint 2026/1112; arXiv:2609.10105; arXiv:2603.10060 | **EXCERPT**, **CONFIRMS** ADR-023 | Supports "assurance properties, not a ladder". The tool-receipt idea is new (see P4). |

**Not verified this round:** ETAS follow-ups, any claim about "competitors lacking
feature X", the VIGIL/FORGE/NFV/AgentSPEX/007/ASHE/Codifide rows already flagged
UNVERIFIED in the addendum, and the Lua register-VM literature cited in
ADR-020 below (from memory; look it up before citing).

---

## 2. What this changes for ASL

### P1 — `confidence` must be a calibrated quantity (from R5) — PROPOSAL
`discharge … with { confidence: 0.9 }` is only meaningful if the interval it
gates on is calibrated. CP2 made the gate **fail closed on the lower bound**
(ADR-028). The next step is a `calibrate` primitive that, given a labelled
calibration set, produces the threshold so the lower bound carries a stated
coverage level. Spec text MUST state the assumptions (exchangeability, marginal
not conditional coverage) and MUST NOT say "guarantee" without them. The
three-outcome gate already in `uncertain_kind.rs` (`u5_gate_three_outcomes`)
maps naturally onto *act / escalate / refuse*.

### P2 — Quarantined functions (from R1, R2) — PROPOSAL
Add a `quarantined` function annotation: its body may read untrusted data and
call models but contains **no `perform`** (checked by `effectck`; empty effect
row), and its results enter the program tainted. Together with the existing
`discharge` rule this reproduces CaMeL's privileged / quarantined split
*statically*. This is the concrete form of gap G-A in the addendum.

### P3 — Capability-gated effect exposure (from R6, R7) — PROPOSAL
`perform … requires cap::X` is retained in the AST since CP2 but not enforced.
Wire it to `capability.rs` so an effect whose capability is not held is a
compile-time rejection where decidable and a `Denied{phase: Request}` trace
event otherwise.

### P4 — Tool-call receipts as an assurance mechanism (from R8) — PROPOSAL
Add a `ToolReceipt` mechanism to `proof_strength.rs`: evidence that a tool
returned a given output, weaker than TEE/ZK but cheap enough for sub-second
agents. Assurance properties are a design judgement (ADR-023), not paper claims.

### P5 — Protocol deltas (from R3, R4) — PROPOSAL
`protocols/mcp.rs`: model `server/discover`, the Tasks extension and the feature
lifecycle. `protocols/a2a.rs`: advertise v0.3 and v1.0 in the AgentCard during
migration. Consider AP2 as a settlement binding next to the Lightning one in the
charter/fiscal design; it is only press-level evidence today.

---

## 3. OWASP agentic crosswalk (honest status)

"Implemented" means *enforced end-to-end from source text*. Libraries with no
call site in the executor are labelled **library only**.

| OWASP | ASL mechanism | Status |
|---|---|---|
| ASI01 Goal hijack | taint tracking, channel typing (G-A), quarantined fns (P2) | taint: **library only**; channel typing / `quarantined`: **not started** |
| ASI02 Tool misuse | `perform` only inside `discharge`; `requires cap::` | `discharge` rule **enforced from source** (CP2); `requires` **parsed, not enforced** |
| ASI03 Identity & privilege | Ed25519-signed, attenuating capability tokens | **library only** (28 tests) |
| ASI04 Supply chain | `seedpkg` checksums / signatures, SBOM at release | **not implemented** (resolver exists, unwired; crypto deps removed in CP3 cleanup until used) |
| ASI05 Unexpected code execution | no dynamic eval in the language; sandboxed VM | partial; VM calling convention unresolved (ADR-020) |
| ASI06 Memory & context poisoning | memory layers, bi-temporal audit, CoMem promotion | **library only** |
| ASI07 Inter-agent communication | A2A v1.0 / MCP 2026-07-28 bindings, session types | bindings partial; signed Agent Cards **not implemented** |
| ASI08 Cascading failures | discharge scopes, budgets | scope closing **implemented** (CP2); `budget:` **parsed, not lowered** |
| ASI09 Human-agent trust | escalate outcome, `oracle::render` explanations | **not started** |
| ASI10 Rogue agents | trace events, provenance, corrigibility flag | trace events **library only** |

The honest summary: ASL has strong *components* and one enforced end-to-end
rule. Closing the distance between "library only" and "enforced from source" is
the roadmap, not the language's current guarantee.

---

## 4. Sources (primary where available)

* Debenedetti et al., *Defeating Prompt Injections by Design* — arXiv:2503.18813
* *Operationalizing CaMeL* — arXiv:2505.22852
* *Open Challenges in Multi-Agent Security* — arXiv:2505.02077
* MCP 2026-07-28 release posts — blog.modelcontextprotocol.io
* A2A v1.0 announcement — github.com/a2aproject/A2A (`docs/announcing-1.0.md`)
* Linux Foundation A2A press release, 9 Apr 2026
* Black-Box Reliability Certification for AI Agents via Conformal Prediction — arXiv:2602.21368
* Randomized and Bootstrapped Conformal Risk Control for LLMs — arXiv:2509.23007
* Conformal Social Choice — arXiv:2604.07667
* Capability Minimization / RACG — arXiv:2606.13884
* OWASP Top 10 for Agentic Applications 2026 — genai.owasp.org
* DeepProve — IACR ePrint 2026/1112
* Feasibility taxonomy for inference-time governance — arXiv:2609.10105
* Tool Receipts, Not Zero-Knowledge Proofs — arXiv:2603.10060
