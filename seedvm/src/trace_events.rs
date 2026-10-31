//! TraceEvent quadripartition — v0.3.0 (§31, §P9).
//!
//! Enforces P9: every `perform` produces exactly one `Requested` event,
//! followed by exactly **one terminal outcome**: `Handled`, `Committed`, or
//! `Denied`. No request is silently lost.
//!
//! Semantics follow ETAS (Tan et al., arXiv:2607.17780, §5.2), with one
//! deliberate difference noted below:
//!
//! * `Handled` is **terminal**. A handler interprets the request; the external
//!   side effect is *not* committed (commit requires that no handler matched).
//!   A handler therefore cannot manufacture commit authority.
//! * `Denied` carries a [`DenialPhase`]: the *request* was refused by policy, or
//!   the request was allowed but the *commit* was refused (boundary/monitor).
//! * Difference from ETAS: ETAS records only `denied(request(a))` when a request
//!   is refused. ASL always logs `Requested` first and then the denial, so an
//!   attempt is visible even when it is refused at the request phase.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

// ── DenialReason (§31) ────────────────────────────────────────────────────────

/// Why the discharge gate refused an effect. Recorded in every `Denied` event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DenialReason {
    CapabilityDenied(String),
    ConfidenceBelowThreshold {
        required: f64,
        actual_lo: f64,
        actual_hi: f64,
    },
    TaintExceeded {
        limit: f64,
        actual: f64,
    },
    BudgetExhausted {
        budget: u64,
        cost: u64,
    },
    ProofUnverified(String),
    TrustInsufficient,
}

impl std::fmt::Display for DenialReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DenialReason::CapabilityDenied(c) => write!(f, "CapabilityDenied({c})"),
            DenialReason::ConfidenceBelowThreshold { required, actual_lo, actual_hi } => write!(
                f,
                "ConfidenceBelowThreshold(required={required:.3}, actual=[{actual_lo:.3},{actual_hi:.3}])"
            ),
            DenialReason::TaintExceeded { limit, actual } => {
                write!(f, "TaintExceeded(limit={limit:.3}, actual={actual:.3})")
            }
            DenialReason::BudgetExhausted { budget, cost } => {
                write!(f, "BudgetExhausted(budget={budget}, cost={cost})")
            }
            DenialReason::ProofUnverified(t) => write!(f, "ProofUnverified({t})"),
            DenialReason::TrustInsufficient => write!(f, "TrustInsufficient"),
        }
    }
}

/// Which enforcement phase refused the action (ETAS E-Request-Deny / E-Commit-Deny).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DenialPhase {
    /// Policy refused the program even *asking* for the action.
    Request,
    /// The request was permitted but the external commit was refused.
    Commit,
}

static NEXT_EVENT_ID: AtomicU64 = AtomicU64::new(1);

fn next_id() -> u64 {
    NEXT_EVENT_ID.fetch_add(1, Ordering::Relaxed)
}

// ── TraceEvent ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TraceEvent {
    /// Effect was requested — emitted immediately on `perform`.
    Requested {
        event_id: u64,
        effect: String,
        agent_id: String,
        timestamp: u64,
    },
    /// A handler intercepted the effect before discharge.
    Handled {
        event_id: u64,
        request_id: u64,
        effect: String,
        handler: String,
        agent_id: String,
        timestamp: u64,
    },
    /// Discharge gate rejected the effect.
    Denied {
        event_id: u64,
        request_id: u64,
        effect: String,
        agent_id: String,
        phase: DenialPhase,
        reason: DenialReason,
        timestamp: u64,
    },
    /// Discharge succeeded; effect committed to the world.
    Committed {
        event_id: u64,
        request_id: u64,
        effect: String,
        agent_id: String,
        prov_id: u64,
        timestamp: u64,
    },
}

impl TraceEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            TraceEvent::Requested { .. } => "Requested",
            TraceEvent::Handled { .. } => "Handled",
            TraceEvent::Denied { .. } => "Denied",
            TraceEvent::Committed { .. } => "Committed",
        }
    }

    pub fn effect(&self) -> &str {
        match self {
            TraceEvent::Requested { effect, .. } => effect,
            TraceEvent::Handled { effect, .. } => effect,
            TraceEvent::Denied { effect, .. } => effect,
            TraceEvent::Committed { effect, .. } => effect,
        }
    }

    pub fn request_id(&self) -> u64 {
        match self {
            TraceEvent::Requested { event_id, .. } => *event_id,
            TraceEvent::Handled { request_id, .. } => *request_id,
            TraceEvent::Denied { request_id, .. } => *request_id,
            TraceEvent::Committed { request_id, .. } => *request_id,
        }
    }
}

// ── TraceEventLog ─────────────────────────────────────────────────────────────

/// Append-only log of trace events stored in the VM.
/// Corresponds to L7 provenance index entries of ActionKind::Trace*.
#[derive(Debug, Default)]
pub struct TraceEventLog {
    events: Vec<TraceEvent>,
    /// Pending request IDs — requests that have not yet been resolved
    /// by Handled, Committed, or Denied. Used to enforce P9.
    pending: std::collections::HashSet<u64>,
}

impl TraceEventLog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Emit a `Requested` event. Returns the new `request_id`.
    pub fn emit_requested(
        &mut self,
        effect: impl Into<String>,
        agent_id: impl Into<String>,
        now_ms: u64,
    ) -> u64 {
        let id = next_id();
        self.pending.insert(id);
        self.events.push(TraceEvent::Requested {
            event_id: id,
            effect: effect.into(),
            agent_id: agent_id.into(),
            timestamp: now_ms,
        });
        id
    }

    /// Emit a `Handled` event. **Terminal**: resolves the request (no commit follows).
    /// Returns an error if `request_id` is not pending.
    pub fn emit_handled(
        &mut self,
        request_id: u64,
        effect: impl Into<String>,
        handler: impl Into<String>,
        agent_id: impl Into<String>,
        now_ms: u64,
    ) -> Result<u64, TraceError> {
        if !self.pending.remove(&request_id) {
            return Err(TraceError::UnknownRequest(request_id));
        }
        let id = next_id();
        self.events.push(TraceEvent::Handled {
            event_id: id,
            request_id,
            effect: effect.into(),
            handler: handler.into(),
            agent_id: agent_id.into(),
            timestamp: now_ms,
        });
        Ok(id)
    }

    /// Emit a `Denied` event. Removes from pending.
    pub fn emit_denied(
        &mut self,
        request_id: u64,
        effect: impl Into<String>,
        agent_id: impl Into<String>,
        phase: DenialPhase,
        reason: DenialReason,
        now_ms: u64,
    ) -> Result<u64, TraceError> {
        if !self.pending.remove(&request_id) {
            return Err(TraceError::UnknownRequest(request_id));
        }
        let id = next_id();
        self.events.push(TraceEvent::Denied {
            event_id: id,
            request_id,
            effect: effect.into(),
            agent_id: agent_id.into(),
            phase,
            reason,
            timestamp: now_ms,
        });
        Ok(id)
    }

    /// Emit a `Committed` event. Removes from pending.
    pub fn emit_committed(
        &mut self,
        request_id: u64,
        effect: impl Into<String>,
        agent_id: impl Into<String>,
        prov_id: u64,
        now_ms: u64,
    ) -> Result<u64, TraceError> {
        if !self.pending.remove(&request_id) {
            return Err(TraceError::UnknownRequest(request_id));
        }
        let id = next_id();
        self.events.push(TraceEvent::Committed {
            event_id: id,
            request_id,
            effect: effect.into(),
            agent_id: agent_id.into(),
            prov_id,
            timestamp: now_ms,
        });
        Ok(id)
    }

    /// Check P9 invariant: no pending requests remain.
    /// Called at session end.
    pub fn check_invariant_p9(&self) -> Result<(), TraceError> {
        if !self.pending.is_empty() {
            let ids: Vec<u64> = self.pending.iter().copied().collect();
            return Err(TraceError::PendingRequestsAtSessionEnd(ids));
        }
        Ok(())
    }

    /// Query the action trace for a time range.
    pub fn query(&self, from_ms: u64, to_ms: u64) -> Vec<&TraceEvent> {
        self.events
            .iter()
            .filter(|e| {
                let ts = match e {
                    TraceEvent::Requested { timestamp, .. } => *timestamp,
                    TraceEvent::Handled { timestamp, .. } => *timestamp,
                    TraceEvent::Denied { timestamp, .. } => *timestamp,
                    TraceEvent::Committed { timestamp, .. } => *timestamp,
                };
                ts >= from_ms && ts <= to_ms
            })
            .collect()
    }

    /// Filter by event kind.
    pub fn filter_kind(&self, kind: &str) -> Vec<&TraceEvent> {
        self.events.iter().filter(|e| e.kind() == kind).collect()
    }

    /// VIGIL-style blame extraction: find the earliest Denied event
    /// causally responsible for a given effect label.
    pub fn blame(&self, effect: &str) -> Option<&TraceEvent> {
        self.events
            .iter()
            .find(|e| matches!(e, TraceEvent::Denied { effect: eff, .. } if eff == effect))
    }

    /// Total event count.
    pub fn len(&self) -> usize {
        self.events.len()
    }
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// All events (for Merkle-proofing / export).
    pub fn all(&self) -> &[TraceEvent] {
        &self.events
    }
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum TraceError {
    #[error("unknown request_id {0} — Handled/Denied/Committed without matching Requested")]
    UnknownRequest(u64),

    #[error("P9 invariant violated: {0:?} requests pending at session end")]
    PendingRequestsAtSessionEnd(Vec<u64>),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::DenialReason;
    use super::*;

    fn ts() -> u64 {
        1_000_000
    }

    #[test]
    fn requested_then_committed_ok() {
        let mut log = TraceEventLog::new();
        let rid = log.emit_requested("Effect::NetworkCall", "agent1", ts());
        log.emit_committed(rid, "Effect::NetworkCall", "agent1", 99, ts() + 1)
            .unwrap();
        assert!(log.check_invariant_p9().is_ok());
        assert_eq!(log.len(), 2);
    }

    #[test]
    fn requested_then_denied_ok() {
        let mut log = TraceEventLog::new();
        let rid = log.emit_requested("Effect::WriteFile", "agent1", ts());
        log.emit_denied(
            rid,
            "Effect::WriteFile",
            "agent1",
            DenialPhase::Commit,
            DenialReason::CapabilityDenied("cap::write_file".to_owned()),
            ts() + 1,
        )
        .unwrap();
        assert!(log.check_invariant_p9().is_ok());
    }

    #[test]
    fn p9_violated_pending_at_session_end() {
        let mut log = TraceEventLog::new();
        let _rid = log.emit_requested("Effect::NetworkCall", "agent1", ts());
        // No Committed or Denied — P9 violated
        assert!(matches!(
            log.check_invariant_p9(),
            Err(TraceError::PendingRequestsAtSessionEnd(_))
        ));
    }

    #[test]
    fn committed_without_request_errors() {
        let mut log = TraceEventLog::new();
        let result = log.emit_committed(9999, "Effect::WriteFile", "agent1", 0, ts());
        assert!(matches!(result, Err(TraceError::UnknownRequest(9999))));
    }

    #[test]
    fn blame_returns_first_denied() {
        let mut log = TraceEventLog::new();
        let rid = log.emit_requested("Effect::SpawnAgent", "agent1", ts());
        log.emit_denied(
            rid,
            "Effect::SpawnAgent",
            "agent1",
            DenialPhase::Request,
            DenialReason::TrustInsufficient,
            ts() + 1,
        )
        .unwrap();
        let blamed = log.blame("Effect::SpawnAgent");
        assert!(blamed.is_some());
        assert!(matches!(blamed.unwrap(), TraceEvent::Denied { .. }));
    }

    #[test]
    fn filter_by_kind() {
        let mut log = TraceEventLog::new();
        let r1 = log.emit_requested("A", "ag", ts());
        let r2 = log.emit_requested("B", "ag", ts());
        log.emit_committed(r1, "A", "ag", 1, ts() + 1).unwrap();
        log.emit_denied(
            r2,
            "B",
            "ag",
            DenialPhase::Request,
            DenialReason::TrustInsufficient,
            ts() + 1,
        )
        .unwrap();

        assert_eq!(log.filter_kind("Requested").len(), 2);
        assert_eq!(log.filter_kind("Committed").len(), 1);
        assert_eq!(log.filter_kind("Denied").len(), 1);
    }

    #[test]
    fn query_by_time_range() {
        let mut log = TraceEventLog::new();
        let r1 = log.emit_requested("E1", "ag", 100);
        log.emit_committed(r1, "E1", "ag", 1, 200).unwrap();
        let r2 = log.emit_requested("E2", "ag", 5000);
        log.emit_committed(r2, "E2", "ag", 2, 5100).unwrap();

        let early = log.query(0, 300);
        assert_eq!(early.len(), 2); // Requested + Committed for E1

        let late = log.query(4000, 6000);
        assert_eq!(late.len(), 2); // Requested + Committed for E2
    }

    #[test]
    fn handled_is_terminal_and_resolves_the_request() {
        let mut log = TraceEventLog::new();
        let rid = log.emit_requested("Effect::Inference", "ag", ts());
        log.emit_handled(rid, "Effect::Inference", "handler1", "ag", ts() + 1)
            .unwrap();
        // ETAS: handled and commit are mutually exclusive — a handler cannot
        // manufacture commit authority, so committing afterwards is rejected.
        assert!(matches!(
            log.emit_committed(rid, "Effect::Inference", "ag", 42, ts() + 2),
            Err(TraceError::UnknownRequest(_))
        ));
        assert!(log.check_invariant_p9().is_ok());
        assert_eq!(log.len(), 2);
    }

    #[test]
    fn denial_records_its_phase() {
        let mut log = TraceEventLog::new();
        let r1 = log.emit_requested("E1", "ag", ts());
        let r2 = log.emit_requested("E2", "ag", ts());
        log.emit_denied(
            r1,
            "E1",
            "ag",
            DenialPhase::Request,
            DenialReason::TrustInsufficient,
            ts(),
        )
        .unwrap();
        log.emit_denied(
            r2,
            "E2",
            "ag",
            DenialPhase::Commit,
            DenialReason::CapabilityDenied("cap::x".into()),
            ts(),
        )
        .unwrap();
        let phases: Vec<DenialPhase> = log
            .all()
            .iter()
            .filter_map(|e| match e {
                TraceEvent::Denied { phase, .. } => Some(*phase),
                _ => None,
            })
            .collect();
        assert_eq!(phases, vec![DenialPhase::Request, DenialPhase::Commit]);
    }

    #[test]
    fn double_resolution_is_rejected() {
        let mut log = TraceEventLog::new();
        let rid = log.emit_requested("E", "ag", ts());
        log.emit_committed(rid, "E", "ag", 1, ts()).unwrap();
        assert!(log
            .emit_denied(
                rid,
                "E",
                "ag",
                DenialPhase::Commit,
                DenialReason::TrustInsufficient,
                ts()
            )
            .is_err());
        assert!(log.emit_handled(rid, "E", "h", "ag", ts()).is_err());
    }
}
