//! Kinded probability intervals — spec §3.10 / §4 axioms U2, U4, U5, U7 (v0.3.0).
//!
//! Complements `uncertainty::Interval` (a general numeric interval) with a
//! *probability* interval `[lo, hi] ⊆ [0, 1]` that also records **why** the
//! value is uncertain. Remediation differs by cause:
//!
//! | kind            | reducible by evidence? | suggested action          |
//! |-----------------|------------------------|---------------------------|
//! | Specification   | yes (clarify intent)   | ask a clarifying question |
//! | ModelEpistemic  | yes (more evidence)    | gather more evidence      |
//! | ModelAleatory   | **no** (irreducible)   | widen the action space    |
//! | Taint           | via sanitize only      | sanitize the input        |

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UncertaintyKind {
    Specification,
    ModelEpistemic,
    ModelAleatory,
    Taint,
    /// Two or more different sources were combined.
    Composite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemediationHint {
    AskClarifyingQuestion,
    GatherMoreEvidence,
    WidenActionSpace,
    SanitizeInput,
    Composite,
}

impl UncertaintyKind {
    /// Can further evidence narrow this uncertainty? (U7: aleatory cannot.)
    pub fn is_reducible(self) -> bool {
        !matches!(self, UncertaintyKind::ModelAleatory)
    }

    pub fn suggest_remediation(self) -> RemediationHint {
        match self {
            UncertaintyKind::Specification => RemediationHint::AskClarifyingQuestion,
            UncertaintyKind::ModelEpistemic => RemediationHint::GatherMoreEvidence,
            UncertaintyKind::ModelAleatory => RemediationHint::WidenActionSpace,
            UncertaintyKind::Taint => RemediationHint::SanitizeInput,
            UncertaintyKind::Composite => RemediationHint::Composite,
        }
    }

    /// Combining identical kinds keeps the kind; different kinds become `Composite`.
    pub fn merge(a: Self, b: Self) -> Self {
        if a == b {
            a
        } else {
            UncertaintyKind::Composite
        }
    }
}

/// Result of the three-valued confidence gate (U5).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Gate {
    /// Even the pessimistic bound clears the threshold — safe to act.
    Some,
    /// Even the optimistic bound fails — confidently below threshold.
    None,
    /// The interval straddles the threshold — escalate, don't guess.
    Ambiguous { lo: f64, hi: f64 },
}

/// Probability interval with provenance-of-doubt.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct KindedProbability {
    pub lo: f64,
    pub hi: f64,
    pub kind: UncertaintyKind,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum IntervalError {
    #[error("invalid probability interval [{lo}, {hi}]: need 0 <= lo <= hi <= 1")]
    Invalid { lo: f64, hi: f64 },
}

impl KindedProbability {
    /// Checked constructor. (The earlier prototype used `debug_assert!`, which
    /// silently accepts bad intervals in release builds.)
    pub fn new(lo: f64, hi: f64, kind: UncertaintyKind) -> Result<Self, IntervalError> {
        if !(lo.is_finite() && hi.is_finite()) || lo < 0.0 || hi > 1.0 || lo > hi {
            return Err(IntervalError::Invalid { lo, hi });
        }
        Ok(Self { lo, hi, kind })
    }

    /// U1: a value that did not come from inference is certain.
    pub fn certain() -> Self {
        Self {
            lo: 1.0,
            hi: 1.0,
            kind: UncertaintyKind::ModelEpistemic,
        }
    }

    pub fn width(self) -> f64 {
        self.hi - self.lo
    }
    pub fn is_certain(self) -> bool {
        self.lo >= 1.0
    }
    pub fn is_reducible(self) -> bool {
        self.kind.is_reducible()
    }

    /// U2: chaining two uncertain steps multiplies the bounds, so confidence
    /// can only shrink.
    pub fn bind(self, other: Self) -> Self {
        Self {
            lo: (self.lo * other.lo).clamp(0.0, 1.0),
            hi: (self.hi * other.hi).clamp(0.0, 1.0),
            kind: UncertaintyKind::merge(self.kind, other.kind),
        }
    }

    /// U4: conditioning on evidence narrows the interval. Positive evidence
    /// lifts the lower bound; negative evidence lowers the upper bound. The
    /// interval never widens. Aleatory uncertainty is left untouched (U7).
    pub fn observe(self, evidence: bool) -> Self {
        if !self.is_reducible() {
            return self;
        }
        let w = self.width();
        if evidence {
            Self {
                lo: (self.lo + w * 0.15).min(self.hi),
                ..self
            }
        } else {
            Self {
                hi: (self.hi - w * 0.15).max(self.lo),
                ..self
            }
        }
    }

    /// U7: apply specification-evidence and model-evidence only to the kind of
    /// uncertainty they can actually resolve.
    pub fn observe_structured(self, spec_evidence: bool, model_evidence: bool) -> Self {
        match self.kind {
            UncertaintyKind::Specification => self.observe(spec_evidence),
            UncertaintyKind::ModelEpistemic => self.observe(model_evidence),
            UncertaintyKind::ModelAleatory => self,
            UncertaintyKind::Taint => self.observe(model_evidence),
            UncertaintyKind::Composite => self.observe(spec_evidence).observe(model_evidence),
        }
    }

    /// U5: three-valued gate against a threshold.
    pub fn gate(self, threshold: f64) -> Gate {
        if self.hi < threshold {
            Gate::None
        } else if self.lo >= threshold {
            Gate::Some
        } else {
            Gate::Ambiguous {
                lo: self.lo,
                hi: self.hi,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use UncertaintyKind::*;

    fn kp(lo: f64, hi: f64, k: UncertaintyKind) -> KindedProbability {
        KindedProbability::new(lo, hi, k).unwrap()
    }

    #[test]
    fn constructor_rejects_invalid_intervals() {
        assert!(KindedProbability::new(0.9, 0.5, ModelEpistemic).is_err());
        assert!(KindedProbability::new(-0.1, 0.5, ModelEpistemic).is_err());
        assert!(KindedProbability::new(0.1, 1.5, ModelEpistemic).is_err());
        assert!(KindedProbability::new(f64::NAN, 0.5, ModelEpistemic).is_err());
    }

    #[test]
    fn u1_certain_is_unit_interval() {
        let c = KindedProbability::certain();
        assert!(c.is_certain() && c.lo == 1.0 && c.hi == 1.0);
    }

    #[test]
    fn u2_bind_multiplies_bounds() {
        let r = kp(0.8, 0.9, ModelEpistemic).bind(kp(0.7, 0.85, ModelEpistemic));
        assert!((r.lo - 0.56).abs() < 1e-12 && (r.hi - 0.765).abs() < 1e-12);
    }

    #[test]
    fn u2_chain_of_three_never_gains_confidence() {
        let a = kp(0.9, 0.95, ModelEpistemic);
        let r = a.bind(a).bind(a);
        assert!(r.lo <= a.lo && r.hi <= a.hi);
    }

    #[test]
    fn u4_observe_never_widens() {
        let u = kp(0.6, 0.85, ModelEpistemic);
        for ev in [true, false] {
            let p = u.observe(ev);
            assert!(p.lo >= u.lo && p.hi <= u.hi, "evidence={ev}: {p:?}");
        }
    }

    #[test]
    fn u4_positive_evidence_raises_lower_bound() {
        let u = kp(0.6, 0.85, ModelEpistemic);
        assert!(u.observe(true).lo > u.lo);
        assert!(u.observe(false).hi < u.hi);
    }

    #[test]
    fn u5_gate_three_outcomes() {
        assert_eq!(kp(0.90, 0.95, ModelEpistemic).gate(0.85), Gate::Some);
        assert_eq!(kp(0.70, 0.80, ModelEpistemic).gate(0.85), Gate::None);
        assert!(matches!(
            kp(0.80, 0.90, ModelEpistemic).gate(0.85),
            Gate::Ambiguous { .. }
        ));
    }

    #[test]
    fn u5_gate_boundaries() {
        // lo == threshold => Some; hi == threshold => Ambiguous (not None)
        assert_eq!(kp(0.85, 0.9, ModelEpistemic).gate(0.85), Gate::Some);
        assert!(matches!(
            kp(0.5, 0.85, ModelEpistemic).gate(0.85),
            Gate::Ambiguous { .. }
        ));
    }

    #[test]
    fn u7_aleatory_is_irreducible() {
        let u = kp(0.4, 0.6, ModelAleatory);
        assert_eq!(u.observe(true), u);
        assert_eq!(u.observe_structured(true, true), u);
        assert!(!u.is_reducible());
    }

    #[test]
    fn u7_structured_evidence_targets_matching_kind() {
        let spec = kp(0.5, 0.7, Specification);
        // model evidence must not move a Specification uncertainty
        assert_eq!(
            spec.observe_structured(false, true).lo,
            spec.observe(false).lo
        );
        assert!(spec.observe_structured(true, false).lo > spec.lo);

        let epi = kp(0.5, 0.7, ModelEpistemic);
        assert!(epi.observe_structured(false, true).lo > epi.lo);
    }

    #[test]
    fn composite_applies_both_evidence_kinds() {
        let c = kp(0.4, 0.8, Composite);
        let p = c.observe_structured(true, true);
        assert!(p.lo > c.lo);
    }

    #[test]
    fn kind_merge_rules() {
        assert_eq!(UncertaintyKind::merge(Taint, Taint), Taint);
        assert_eq!(UncertaintyKind::merge(Taint, Specification), Composite);
        let r = kp(0.9, 0.9, Taint).bind(kp(0.9, 0.9, Specification));
        assert_eq!(r.kind, Composite);
    }

    #[test]
    fn remediation_matches_cause() {
        assert_eq!(
            Specification.suggest_remediation(),
            RemediationHint::AskClarifyingQuestion
        );
        assert_eq!(
            ModelEpistemic.suggest_remediation(),
            RemediationHint::GatherMoreEvidence
        );
        assert_eq!(
            ModelAleatory.suggest_remediation(),
            RemediationHint::WidenActionSpace
        );
        assert_eq!(Taint.suggest_remediation(), RemediationHint::SanitizeInput);
    }
}
