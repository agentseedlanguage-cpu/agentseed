//! Bi-temporal memory index — L8, v0.3.0 (§38, Arc42 ADR-013).
//!
//! Tracks two independent time axes for every memory fact:
//!   valid_time      — when was this fact true in the world?
//!   transaction_time — when was it recorded in the system?
//!
//! Periods are half-open `[from, until)`; `until = None` means open-ended.
//!
//! Design principles:
//!   1. Transaction records are immutable. Corrections create new records.
//!   2. Valid time is agent-asserted.
//!   3. Corrections are first-class.
//!   4. as_of(key, VT, TT) returns the fact valid at VT as believed at TT.
//!
//! EU AI Act Article 12 compliance: as_of(decision_time, decision_time)
//! reconstructs the information basis of any past decision.

use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

pub type Timestamp = u64; // Unix milliseconds

// ── BiTemporalRecord ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiTemporalRecord {
    pub id: u64,
    pub key: String,
    pub value: serde_json::Value,

    // Valid time axis (world time)
    pub valid_from: Timestamp,
    pub valid_until: Option<Timestamp>, // None = still valid

    // Transaction time axis (system time)
    pub transaction_from: Timestamp,
    pub transaction_until: Option<Timestamp>, // None = current version

    // Metadata
    pub agent_id: String,
    pub prov_id: u64,
    pub correction_of: Option<u64>, // links to superseded record
    pub correction_reason: Option<String>,
}

impl BiTemporalRecord {
    /// True if this record is valid at world-time `vt` AND was the current
    /// belief at system-time `tt`.
    ///
    /// Both periods are **half-open** `[from, until)` (SQL:2011 period semantics),
    /// so adjacent versions never both claim their shared boundary instant and a
    /// correction takes effect exactly at its transaction time.
    pub fn covers(&self, vt: Timestamp, tt: Timestamp) -> bool {
        let vt_ok = self.valid_from <= vt && self.valid_until.map_or(true, |vu| vt < vu);
        let tt_ok =
            self.transaction_from <= tt && self.transaction_until.map_or(true, |tu| tt < tu);
        vt_ok && tt_ok
    }
}

// ── BiTemporalIndex ───────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct BiTemporalIndex {
    /// All records ever stored, by ID (append-only).
    records: FxHashMap<u64, BiTemporalRecord>,
    /// Index: key → list of record IDs (sorted by transaction_from ascending).
    by_key: FxHashMap<String, Vec<u64>>,
    next_id: u64,
}

impl BiTemporalIndex {
    pub fn new() -> Self {
        Self::default()
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /// Store a new fact with explicit valid-time bounds.
    ///
    /// Returns the new record ID.
    pub fn store(
        &mut self,
        key: impl Into<String>,
        value: serde_json::Value,
        valid_from: Timestamp,
        valid_until: Option<Timestamp>,
        agent_id: impl Into<String>,
        prov_id: u64,
        now_ms: Timestamp,
    ) -> u64 {
        let id = self.alloc_id();
        let key = key.into();
        let record = BiTemporalRecord {
            id,
            key: key.clone(),
            value,
            valid_from,
            valid_until,
            transaction_from: now_ms,
            transaction_until: None,
            agent_id: agent_id.into(),
            prov_id,
            correction_of: None,
            correction_reason: None,
        };
        self.records.insert(id, record);
        self.by_key.entry(key).or_default().push(id);
        id
    }

    /// Correct a past fact: create a new transaction record, close the old one.
    ///
    /// Returns the ID of the new corrective record.
    pub fn correct(
        &mut self,
        key: impl Into<String>,
        new_value: serde_json::Value,
        valid_from: Timestamp,
        agent_id: impl Into<String>,
        prov_id: u64,
        correction_reason: impl Into<String>,
        now_ms: Timestamp,
    ) -> Result<u64, BiTemporalError> {
        let key = key.into();

        // Find the current version (transaction_until = None) for this key
        let old_id = self.find_current_version(&key);

        // Close the old record's transaction time
        if let Some(old_id) = old_id {
            if let Some(old) = self.records.get_mut(&old_id) {
                old.transaction_until = Some(now_ms);
            }
        }

        // Create the corrective record
        let new_id = self.alloc_id();
        let record = BiTemporalRecord {
            id: new_id,
            key: key.clone(),
            value: new_value,
            valid_from,
            valid_until: None,
            transaction_from: now_ms,
            transaction_until: None,
            agent_id: agent_id.into(),
            prov_id,
            correction_of: old_id,
            correction_reason: Some(correction_reason.into()),
        };
        self.records.insert(new_id, record);
        self.by_key.entry(key).or_default().push(new_id);
        Ok(new_id)
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /// Retrieve the fact valid at world-time `vt` as believed at system-time `tt`.
    ///
    /// Implements: SELECT the record with the greatest valid_from ≤ vt AND
    /// the greatest transaction_from ≤ tt (and transaction_until = None or > tt).
    pub fn as_of(&self, key: &str, vt: Timestamp, tt: Timestamp) -> Option<&BiTemporalRecord> {
        let ids = self.by_key.get(key)?;
        let mut best: Option<&BiTemporalRecord> = None;

        for id in ids {
            if let Some(rec) = self.records.get(id) {
                if rec.covers(vt, tt) {
                    // Pick the one with the latest transaction_from (most recent belief)
                    if best.map_or(true, |b| rec.transaction_from > b.transaction_from) {
                        best = Some(rec);
                    }
                }
            }
        }
        best
    }

    /// Get the full version history of a key across both time axes.
    pub fn history(
        &self,
        key: &str,
        valid_range: Option<(Timestamp, Timestamp)>,
        transaction_range: Option<(Timestamp, Timestamp)>,
    ) -> Vec<&BiTemporalRecord> {
        let ids = match self.by_key.get(key) {
            Some(ids) => ids,
            None => return vec![],
        };

        let mut results: Vec<&BiTemporalRecord> = ids
            .iter()
            .filter_map(|id| self.records.get(id))
            .filter(|rec| {
                // Valid range filter
                let vt_ok = valid_range.map_or(true, |(from, to)| {
                    rec.valid_from <= to && rec.valid_until.map_or(true, |vu| vu > from)
                });
                // Transaction range filter
                let tt_ok = transaction_range.map_or(true, |(from, to)| {
                    rec.transaction_from <= to && rec.transaction_until.map_or(true, |tu| tu > from)
                });
                vt_ok && tt_ok
            })
            .collect();

        // Sort by (valid_from ASC, transaction_from ASC)
        results.sort_by_key(|r| (r.valid_from, r.transaction_from));
        results
    }

    /// Get the current version of a key (transaction_until = None).
    pub fn current(&self, key: &str) -> Option<&BiTemporalRecord> {
        let ids = self.by_key.get(key)?;
        ids.iter()
            .filter_map(|id| self.records.get(id))
            .find(|r| r.transaction_until.is_none())
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    pub fn record_count(&self) -> usize {
        self.records.len()
    }
    pub fn key_count(&self) -> usize {
        self.by_key.len()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn alloc_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn find_current_version(&self, key: &str) -> Option<u64> {
        let ids = self.by_key.get(key)?;
        ids.iter()
            .filter_map(|id| self.records.get(id))
            .find(|r| r.transaction_until.is_none())
            .map(|r| r.id)
    }
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum BiTemporalError {
    #[error("key `{0}` not found in bi-temporal index")]
    KeyNotFound(String),
    #[error("correction failed: {0}")]
    CorrectionFailed(String),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn idx() -> BiTemporalIndex {
        BiTemporalIndex::new()
    }

    // BIT-01: as_of returns record covering (VT, TT)
    #[test]
    fn bit01_as_of_basic() {
        let mut idx = idx();
        // Store fact valid from T=100, recorded at T=200
        idx.store("btc_price", json!(50000), 100, None, "agent1", 1, 200);
        // Query at valid_time=150, transaction_time=300 → should find it
        let rec = idx.as_of("btc_price", 150, 300);
        assert!(rec.is_some());
        assert_eq!(rec.unwrap().value, json!(50000));
    }

    #[test]
    fn bit01_as_of_before_valid_time_returns_none() {
        let mut idx = idx();
        idx.store("btc_price", json!(50000), 1000, None, "agent1", 1, 2000);
        // Query at valid_time=500 — before valid_from=1000
        let rec = idx.as_of("btc_price", 500, 3000);
        assert!(rec.is_none());
    }

    // BIT-02: correct() closes old record, creates new one
    #[test]
    fn bit02_correct_creates_new_closes_old() {
        let mut idx = idx();
        idx.store("resistance", json!(95000), 0, None, "agent1", 1, 100);

        // Correct at system-time=200
        idx.correct(
            "resistance",
            json!(96000),
            0,
            "agent1",
            2,
            "updated analysis",
            200,
        )
        .unwrap();

        // Old record should have transaction_until = Some(200)
        let history = idx.history("resistance", None, None);
        assert_eq!(history.len(), 2);

        let old = history
            .iter()
            .find(|r| r.correction_of.is_none() && r.transaction_until.is_some());
        assert!(old.is_some());
        assert_eq!(old.unwrap().transaction_until, Some(200));

        let new = history.iter().find(|r| r.correction_of.is_some());
        assert!(new.is_some());
        assert_eq!(new.unwrap().value, json!(96000));
    }

    // BIT-03: history returns versions in valid_from ASC order
    #[test]
    fn bit03_history_sorted() {
        let mut idx = idx();
        idx.store("fact", json!(1), 200, Some(300), "ag", 1, 500);
        idx.store("fact", json!(2), 100, Some(200), "ag", 2, 500);
        idx.store("fact", json!(3), 300, None, "ag", 3, 500);

        let h = idx.history("fact", None, None);
        assert_eq!(h[0].valid_from, 100);
        assert_eq!(h[1].valid_from, 200);
        assert_eq!(h[2].valid_from, 300);
    }

    // BIT-05: bi-temporal indexing does not affect throughput (no overhead test,
    // just verify current() returns latest)
    #[test]
    fn bit05_current_returns_latest_version() {
        let mut idx = idx();
        idx.store("k", json!("v1"), 0, None, "ag", 1, 100);
        idx.correct("k", json!("v2"), 0, "ag", 2, "correction", 200)
            .unwrap();

        let cur = idx.current("k");
        assert!(cur.is_some());
        assert_eq!(cur.unwrap().value, json!("v2"));
    }

    #[test]
    fn as_of_finds_correct_transaction_version() {
        let mut idx = idx();
        // V1 recorded at T=100
        idx.store("fact", json!("v1"), 0, None, "ag", 1, 100);
        // V2 recorded at T=200 (correction)
        idx.correct("fact", json!("v2"), 0, "ag", 2, "updated", 200)
            .unwrap();

        // As believed at T=150 (before correction) → V1
        let rec_at_150 = idx.as_of("fact", 0, 150);
        assert!(rec_at_150.is_some());
        assert_eq!(rec_at_150.unwrap().value, json!("v1"));

        // As believed at T=300 (after correction) → V2
        let rec_at_300 = idx.as_of("fact", 0, 300);
        assert!(rec_at_300.is_some());
        assert_eq!(rec_at_300.unwrap().value, json!("v2"));
    }

    #[test]
    fn missing_key_returns_none() {
        let idx = idx();
        assert!(idx.as_of("nonexistent", 0, 0).is_none());
        assert!(idx.history("nonexistent", None, None).is_empty());
        assert!(idx.current("nonexistent").is_none());
    }

    // ── half-open interval semantics: [from, until) ──────────────────────────

    #[test]
    fn adjacent_valid_periods_do_not_overlap_at_the_boundary() {
        let mut idx = BiTemporalIndex::new();
        // v1 true on [0, 100); v2 true from 100 onward. Both recorded at tt=10.
        idx.store("rate", serde_json::json!("v1"), 0, Some(100), "ag", 1, 10);
        idx.store("rate", serde_json::json!("v2"), 100, None, "ag", 2, 10);
        assert_eq!(
            idx.as_of("rate", 99, 20).unwrap().value,
            serde_json::json!("v1")
        );
        assert_eq!(
            idx.as_of("rate", 100, 20).unwrap().value,
            serde_json::json!("v2")
        );
        assert_eq!(
            idx.as_of("rate", 101, 20).unwrap().value,
            serde_json::json!("v2")
        );
    }

    #[test]
    fn correction_takes_effect_exactly_at_its_transaction_time() {
        let mut idx = BiTemporalIndex::new();
        idx.store("k", serde_json::json!("old"), 0, None, "ag", 1, 100);
        idx.correct("k", serde_json::json!("new"), 0, "ag", 2, "fix", 200)
            .unwrap();
        assert_eq!(
            idx.as_of("k", 0, 199).unwrap().value,
            serde_json::json!("old")
        );
        assert_eq!(
            idx.as_of("k", 0, 200).unwrap().value,
            serde_json::json!("new")
        );
    }

    #[test]
    fn exactly_one_record_covers_any_instant_for_a_correction_chain() {
        let mut idx = BiTemporalIndex::new();
        idx.store("k", serde_json::json!(0), 0, None, "ag", 1, 10);
        for (i, t) in [20u64, 30, 40].into_iter().enumerate() {
            idx.correct("k", serde_json::json!(i + 1), 0, "ag", 2, "c", t)
                .unwrap();
        }
        for tt in 10..60u64 {
            let covering = idx
                .history("k", None, None)
                .into_iter()
                .filter(|r| r.covers(5, tt))
                .count();
            assert_eq!(covering, 1, "tt={tt}");
        }
    }

    #[test]
    fn history_range_excludes_a_period_that_ends_exactly_at_range_start() {
        let mut idx = BiTemporalIndex::new();
        idx.store("k", serde_json::json!("a"), 0, Some(100), "ag", 1, 10);
        idx.store("k", serde_json::json!("b"), 100, None, "ag", 2, 10);
        let h = idx.history("k", Some((100, 200)), None);
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].value, serde_json::json!("b"));
    }
}
