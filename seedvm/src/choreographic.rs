//! Choreographic spawn — SessionHandle affine tracking (§39, Arc42 ADR-014).
//!
//! Enforces at runtime:
//!   - A SessionHandle may be consumed (sent/received) exactly once.
//!   - Using a SessionHandle twice is a VmError::SessionHandleDoubleUse.
//!   - At S2+, dropping a handle without close is VmError::SessionHandleLeak.
//!
//! The compiler catches these at S1+ statically (nameres.rs §AffineViolation).
//! The VM enforces them at all strata as a defense-in-depth runtime trap.

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_HANDLE_ID: AtomicU64 = AtomicU64::new(1);

fn alloc_handle() -> u64 {
    NEXT_HANDLE_ID.fetch_add(1, Ordering::Relaxed)
}

// ── SessionHandle metadata ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandleInfo {
    pub id: u64,
    pub global_type: String,
    pub role: String,
    pub agent_id: String,
    pub spawned_at: u64,
    pub state: HandleState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HandleState {
    /// Handle created; not yet used.
    Open,
    /// Handle consumed by a typed send/receive.
    Consumed,
    /// Handle explicitly closed via session_close().
    Closed,
}

// ── HandleRegistry ────────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct HandleRegistry {
    handles: FxHashMap<u64, HandleInfo>,
}

impl HandleRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a new SessionHandle and return its ID.
    pub fn spawn_typed(
        &mut self,
        global_type: impl Into<String>,
        role: impl Into<String>,
        agent_id: impl Into<String>,
        now_ms: u64,
    ) -> u64 {
        let id = alloc_handle();
        self.handles.insert(
            id,
            HandleInfo {
                id,
                global_type: global_type.into(),
                role: role.into(),
                agent_id: agent_id.into(),
                spawned_at: now_ms,
                state: HandleState::Open,
            },
        );
        id
    }

    /// Consume the handle (typed send/receive). Returns error if already consumed.
    pub fn consume(&mut self, id: u64) -> Result<(), HandleError> {
        match self.handles.get_mut(&id) {
            None => Err(HandleError::UnknownHandle(id)),
            Some(info) => match info.state {
                HandleState::Open => {
                    info.state = HandleState::Consumed;
                    Ok(())
                }
                HandleState::Consumed => Err(HandleError::DoubleUse(id)),
                HandleState::Closed => Err(HandleError::AlreadyClosed(id)),
            },
        }
    }

    /// Explicitly close the handle (session_close()). Valid from Open state.
    pub fn close(&mut self, id: u64) -> Result<(), HandleError> {
        match self.handles.get_mut(&id) {
            None => Err(HandleError::UnknownHandle(id)),
            Some(info) => match info.state {
                HandleState::Open | HandleState::Consumed => {
                    info.state = HandleState::Closed;
                    Ok(())
                }
                HandleState::Closed => Err(HandleError::AlreadyClosed(id)),
            },
        }
    }

    /// Check for leaked handles (Open at scope exit). S2+ treats as hard error.
    pub fn check_leaks(&self) -> Vec<u64> {
        self.handles
            .values()
            .filter(|h| h.state == HandleState::Open)
            .map(|h| h.id)
            .collect()
    }

    /// Get handle info for observability.
    pub fn get(&self, id: u64) -> Option<&HandleInfo> {
        self.handles.get(&id)
    }

    pub fn all(&self) -> impl Iterator<Item = &HandleInfo> {
        self.handles.values()
    }

    pub fn open_count(&self) -> usize {
        self.handles
            .values()
            .filter(|h| h.state == HandleState::Open)
            .count()
    }
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum HandleError {
    #[error("SessionHandle {0} used more than once (affine type violation)")]
    DoubleUse(u64),

    #[error("SessionHandle {0} already closed")]
    AlreadyClosed(u64),

    #[error("unknown SessionHandle id {0}")]
    UnknownHandle(u64),

    #[error("SessionHandle {0} leaked without close at scope exit")]
    Leaked(u64),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csp01_spawn_typed_returns_handle() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("TaskProtocol", "Coordinator", "agent1", 0);
        assert!(id > 0);
        let info = reg.get(id).unwrap();
        assert_eq!(info.state, HandleState::Open);
        assert_eq!(info.global_type, "TaskProtocol");
    }

    #[test]
    fn csp02_double_use_is_error() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        reg.consume(id).expect("first consume ok");
        let result = reg.consume(id);
        assert!(matches!(result, Err(HandleError::DoubleUse(_))));
    }

    #[test]
    fn consume_open_handle_ok() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        assert!(reg.consume(id).is_ok());
        let info = reg.get(id).unwrap();
        assert_eq!(info.state, HandleState::Consumed);
    }

    #[test]
    fn close_open_handle_ok() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        assert!(reg.close(id).is_ok());
        assert_eq!(reg.get(id).unwrap().state, HandleState::Closed);
    }

    #[test]
    fn close_already_closed_errors() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        reg.close(id).unwrap();
        assert!(matches!(reg.close(id), Err(HandleError::AlreadyClosed(_))));
    }

    #[test]
    fn csp03_leak_detection_finds_open_handles() {
        let mut reg = HandleRegistry::new();
        let id1 = reg.spawn_typed("P1", "R", "ag", 0);
        let id2 = reg.spawn_typed("P2", "R", "ag", 0);
        reg.close(id1).unwrap();
        // id2 is still open → leaked
        let leaks = reg.check_leaks();
        assert_eq!(leaks, vec![id2]);
    }

    #[test]
    fn no_leaks_when_all_closed() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        reg.close(id).unwrap();
        assert!(reg.check_leaks().is_empty());
    }

    #[test]
    fn no_leaks_when_all_consumed() {
        let mut reg = HandleRegistry::new();
        let id = reg.spawn_typed("P", "R", "ag", 0);
        reg.consume(id).unwrap();
        // Consumed counts as used, not leaked
        assert!(reg.check_leaks().is_empty());
    }

    #[test]
    fn open_count_tracks_correctly() {
        let mut reg = HandleRegistry::new();
        assert_eq!(reg.open_count(), 0);
        let id1 = reg.spawn_typed("P", "R", "ag", 0);
        let id2 = reg.spawn_typed("P", "R", "ag", 0);
        assert_eq!(reg.open_count(), 2);
        reg.consume(id1).unwrap();
        assert_eq!(reg.open_count(), 1);
        reg.close(id2).unwrap();
        assert_eq!(reg.open_count(), 0);
    }

    #[test]
    fn unknown_handle_errors() {
        let mut reg = HandleRegistry::new();
        assert!(matches!(
            reg.consume(9999),
            Err(HandleError::UnknownHandle(9999))
        ));
        assert!(matches!(
            reg.close(8888),
            Err(HandleError::UnknownHandle(8888))
        ));
    }
}
