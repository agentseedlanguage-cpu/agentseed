//! Proof assurance model — spec §P-CALC (revised 2026-11-02, ADR-023).
//!
//! # Why this replaces "a proof must be present"
//! The earlier rule (ADR-006: `proof != None` at S1+) cannot be met with a
//! zero-knowledge proof by an agent that calls a hosted frontier model: published
//! ZK-for-LLM systems (e.g. NanoZK, arXiv:2603.18046) report end-to-end proofs only
//! up to GPT-2-scale blocks (d ≤ 128), with proving in tens of seconds per block
//! and attention reaching minutes at larger widths. The "24 ms" figure often quoted
//! is *verification of one layer proof*, not the cost of producing a proof.
//!
//! Different mechanisms also give *different* guarantees, so they are not a linear
//! ladder. We model the guarantees as a set of [`Assurance`] properties and let a
//! policy demand the set it needs. The property assignments in
//! [`ProofKind::assurance`] are a **design judgement**, documented per variant, not a
//! claim taken from any one paper.

use serde::{Deserialize, Serialize};

/// A set of assurance properties (bit set). Compose with `|`, test with [`contains`](Assurance::contains).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct Assurance(u8);

impl Assurance {
    pub const NONE: Assurance = Assurance(0);
    /// The proof binds the output to a specific model identity.
    pub const MODEL_IDENTITY: Assurance = Assurance(1 << 0);
    /// The proof binds the output to a specific input.
    pub const INPUT_BINDING: Assurance = Assurance(1 << 1);
    /// A dishonest *provider* cannot produce a passing proof for a different computation.
    pub const PROVIDER_INDEPENDENT: Assurance = Assurance(1 << 2);
    /// No trust in any hardware vendor / enclave is required.
    pub const HARDWARE_INDEPENDENT: Assurance = Assurance(1 << 3);
    /// Any third party can verify without re-running the model.
    pub const PUBLIC_VERIFIABLE: Assurance = Assurance(1 << 4);

    /// Reasonable minimum for committing an inference result: it is about *this*
    /// model on *this* input. Satisfiable by a verified provider receipt.
    pub const DEFAULT_REQUIRED: Assurance =
        Assurance(Self::MODEL_IDENTITY.0 | Self::INPUT_BINDING.0);

    /// Everything a ZK proof of the computation can give.
    pub const TRUSTLESS: Assurance = Assurance(
        Self::MODEL_IDENTITY.0
            | Self::INPUT_BINDING.0
            | Self::PROVIDER_INDEPENDENT.0
            | Self::HARDWARE_INDEPENDENT.0
            | Self::PUBLIC_VERIFIABLE.0,
    );

    pub const fn union(self, other: Assurance) -> Assurance {
        Assurance(self.0 | other.0)
    }
    /// True if every property in `required` is present in `self`.
    pub const fn contains(self, required: Assurance) -> bool {
        self.0 & required.0 == required.0
    }
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }
}

impl std::ops::BitOr for Assurance {
    type Output = Assurance;
    fn bitor(self, rhs: Assurance) -> Assurance {
        self.union(rhs)
    }
}

/// The mechanism that produced a proof.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ProofKind {
    /// No proof.
    None,
    /// A receipt signed by the model provider. Binds model and input *as claimed by
    /// the provider*; a dishonest provider can sign anything, so it is not
    /// provider-independent.
    ProviderReceipt,
    /// The verifier re-executes the model deterministically. Needs a local copy of
    /// the model and deterministic decoding; not publicly verifiable without
    /// re-execution.
    DeterministicReplay,
    /// Hardware remote attestation of the execution environment. Removes trust in the
    /// provider but trusts the hardware vendor; verifiable against the vendor's root.
    TeeAttestation,
    /// Zero-knowledge proof of the computation (layerwise or monolithic).
    /// Trustless, but today feasible only for small models.
    ZeroKnowledge,
}

impl ProofKind {
    /// Properties this mechanism provides *when its proof verifies*.
    pub const fn assurance(self) -> Assurance {
        use Assurance as A;
        match self {
            ProofKind::None => A::NONE,
            ProofKind::ProviderReceipt => A::MODEL_IDENTITY.union(A::INPUT_BINDING),
            ProofKind::DeterministicReplay => A::MODEL_IDENTITY
                .union(A::INPUT_BINDING)
                .union(A::PROVIDER_INDEPENDENT)
                .union(A::HARDWARE_INDEPENDENT),
            ProofKind::TeeAttestation => A::MODEL_IDENTITY
                .union(A::INPUT_BINDING)
                .union(A::PROVIDER_INDEPENDENT)
                .union(A::PUBLIC_VERIFIABLE),
            ProofKind::ZeroKnowledge => A::TRUSTLESS,
        }
    }
}

/// A proof presented at a discharge gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProofClaim {
    pub kind: ProofKind,
    /// Has the proof actually been checked? An unverified claim provides nothing.
    pub verified: bool,
}

impl ProofClaim {
    pub const fn none() -> Self {
        ProofClaim {
            kind: ProofKind::None,
            verified: false,
        }
    }

    /// Assurance actually in force: empty unless the proof verified.
    pub const fn effective(self) -> Assurance {
        if self.verified {
            self.kind.assurance()
        } else {
            Assurance::NONE
        }
    }

    /// Does this claim meet a policy's required assurance?
    pub const fn satisfies(self, required: Assurance) -> bool {
        self.effective().contains(required)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Assurance as A;

    fn claim(kind: ProofKind, verified: bool) -> ProofClaim {
        ProofClaim { kind, verified }
    }

    #[test]
    fn none_provides_nothing_and_satisfies_only_the_empty_requirement() {
        assert!(ProofKind::None.assurance().is_empty());
        assert!(!claim(ProofKind::None, true).satisfies(A::DEFAULT_REQUIRED));
        assert!(claim(ProofKind::None, true).satisfies(A::NONE));
    }

    #[test]
    fn unverified_claims_never_satisfy_any_nonempty_requirement() {
        for kind in [
            ProofKind::ProviderReceipt,
            ProofKind::DeterministicReplay,
            ProofKind::TeeAttestation,
            ProofKind::ZeroKnowledge,
        ] {
            let c = claim(kind, false);
            assert!(c.effective().is_empty(), "{kind:?}");
            assert!(!c.satisfies(A::MODEL_IDENTITY), "{kind:?}");
        }
    }

    #[test]
    fn a_verified_provider_receipt_meets_the_default_requirement() {
        // The point of ADR-023: a hosted-model agent can discharge today.
        assert!(claim(ProofKind::ProviderReceipt, true).satisfies(A::DEFAULT_REQUIRED));
    }

    #[test]
    fn a_provider_receipt_is_not_provider_independent() {
        assert!(!claim(ProofKind::ProviderReceipt, true).satisfies(A::PROVIDER_INDEPENDENT));
    }

    #[test]
    fn tee_trusts_hardware_but_not_the_provider() {
        let c = claim(ProofKind::TeeAttestation, true);
        assert!(c.satisfies(A::PROVIDER_INDEPENDENT | A::PUBLIC_VERIFIABLE));
        assert!(!c.satisfies(A::HARDWARE_INDEPENDENT));
    }

    #[test]
    fn replay_is_trustless_but_not_publicly_verifiable() {
        let c = claim(ProofKind::DeterministicReplay, true);
        assert!(c.satisfies(A::PROVIDER_INDEPENDENT | A::HARDWARE_INDEPENDENT));
        assert!(!c.satisfies(A::PUBLIC_VERIFIABLE));
    }

    #[test]
    fn zero_knowledge_provides_every_property() {
        assert!(claim(ProofKind::ZeroKnowledge, true).satisfies(A::TRUSTLESS));
    }

    #[test]
    fn mechanisms_are_not_a_total_order() {
        // Replay has a property TEE lacks, and TEE has a property replay lacks.
        let (replay, tee) = (
            ProofKind::DeterministicReplay.assurance(),
            ProofKind::TeeAttestation.assurance(),
        );
        assert!(!tee.contains(replay) && !replay.contains(tee));
    }

    #[test]
    fn only_zero_knowledge_meets_the_trustless_bar() {
        for kind in [
            ProofKind::None,
            ProofKind::ProviderReceipt,
            ProofKind::DeterministicReplay,
            ProofKind::TeeAttestation,
        ] {
            assert!(!claim(kind, true).satisfies(A::TRUSTLESS), "{kind:?}");
        }
    }

    #[test]
    fn union_and_contains_behave_like_set_operations() {
        let ab = A::MODEL_IDENTITY | A::INPUT_BINDING;
        assert!(ab.contains(A::MODEL_IDENTITY) && ab.contains(A::INPUT_BINDING) && ab.contains(ab));
        assert!(!ab.contains(A::PUBLIC_VERIFIABLE));
        assert!(ab.contains(A::NONE), "every set contains the empty set");
        assert_eq!(A::DEFAULT_REQUIRED, ab);
    }

    #[test]
    fn serde_round_trip() {
        let c = claim(ProofKind::TeeAttestation, true);
        let j = serde_json::to_string(&c).unwrap();
        assert_eq!(serde_json::from_str::<ProofClaim>(&j).unwrap(), c);
    }
}
