//! VM state — the complete runtime context of an executing agent.
//!
//! `VMState` holds every component the VM can read or mutate during
//! execution: the operand stack, local variables, globals, the memory
//! subsystem, the provenance graph, the effect accumulator, and the
//! deterministic RNG state.

use crate::memory::{CoherencyController, ConsentLevel, MemoryGovernor, MemoryLayer};
use crate::rng::DeterministicRng;
use crate::schedule::ScheduleTrace;
use crate::value::Value;
use miette::Diagnostic;
use seedc::ir::Module;
use std::collections::HashMap;
use thiserror::Error;

// ── VMState ──

/// The complete runtime state of an AGENT-SEED virtual machine instance.
///
/// This struct is threaded through every instruction evaluation.
/// It is intentionally not `Clone` — the provenance graph and schedule
/// trace are append-only, and cloning would be expensive.
#[derive(Debug)]
pub struct VMState {
    // ── Execution context ──
    /// Call stack. Each [`Frame`] owns the registers of one function activation
    /// (ADR-020: register frames, no operand stack).
    pub frames: Vec<Frame>,
    /// Global variable table (module-level, named).
    pub globals: HashMap<String, Value>,
    /// Current instruction pointer: (function_index, block_index, instr_index).
    pub ip: (usize, usize, usize),
    /// Current function being executed.
    pub current_func: usize,
    /// Nested block labels for structured control flow (block_id → label).
    pub block_labels: Vec<usize>,

    // ── Memory subsystem (B5) ──
    /// The 8‑layer memory governor (replaces raw HashMap layers).
    pub governor: MemoryGovernor,
    /// Coherency controller (MESI + CRDT + gossip).
    pub coherency: CoherencyController,
    /// Merkle integrity roots (cached).
    pub merkle_roots: [Option<String>; 8],

    // ── Effect tracking ──
    /// Accumulated effect set (tracked across instructions).
    pub effects: Vec<String>,
    /// Whether the VM is currently inside a discharge block.
    pub inside_discharge: bool,
    /// Nesting depth of open `discharge` scopes; `inside_discharge` is `depth > 0`.
    pub discharge_depth: u32,
    /// Confidence accumulator (for confidence-gated operations).
    pub confidence: Vec<f64>,

    // ── Capability tokens ──
    /// Active capability tokens held by this agent.
    pub capabilities: Vec<Value>,

    // ── Provenance ──
    /// Append-only event log for the provenance graph.
    pub provenance_log: Vec<ProvenanceEvent>,

    // ── Randomness ──
    /// Deterministic PRNG state.
    pub rng: DeterministicRng,

    // ── Scheduling ──
    /// Append-only schedule trace for replay verification.
    pub schedule_trace: ScheduleTrace,

    // ── Module reference ──
    /// Reference to the loaded module (read-only after construction).
    pub module: Module,

    // ── Flags ──
    /// Whether execution has halted.
    pub halted: bool,
    /// Exit code (0 = success, non-zero = error).
    pub exit_code: i32,
    /// Whether we are running in debug/trace mode.
    pub trace_mode: bool,
}

/// A provenance event — recorded for every significant VM action.
#[derive(Debug, Clone)]
pub struct ProvenanceEvent {
    /// Event type tag.
    pub kind: ProvenanceEventKind,
    /// Human-readable description.
    pub description: String,
    /// Timestamp (monotonic counter).
    pub timestamp: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProvenanceEventKind {
    InferCalled,
    DecisionMade,
    EffectExecuted,
    ContractChecked,
    Sanitized,
    CapabilityUsed,
    MemoryRead,
    MemoryWrite,
    AgentSpawned,
    AgentMessageSent,
    AgentMessageReceived,
    DischargeEntered,
    DischargeExited,
    Custom(String),
}

// ── Call frames ──

/// One function activation.
#[derive(Debug, Clone)]
pub struct Frame {
    /// Index of the executing function in the module.
    pub func: usize,
    /// Registers, indexed by `VarId`; sized to the function's `max_locals`.
    pub regs: Vec<Value>,
    /// Current block and next instruction within it.
    pub block: usize,
    pub instr: usize,
    /// Caller register that receives the return value.
    pub ret_dest: Option<usize>,
    /// Open `discharge` scopes in *this* activation. Per-frame on purpose: a
    /// callee never inherits its caller's authority to `perform`.
    pub discharge_depth: u32,
}

// ── VMState ──

impl VMState {
    /// Create a fresh VM state from a compiled module.
    pub fn new(module: Module, seed: u64) -> Self {
        let rng = DeterministicRng::new(seed);
        let governor = MemoryGovernor::new();
        let coherency = CoherencyController::new("agent-0");

        Self {
            frames: Vec::new(),
            globals: HashMap::new(),
            ip: (0, 0, 0),
            current_func: 0,
            block_labels: Vec::new(),
            governor,
            coherency,
            merkle_roots: Default::default(),
            effects: Vec::new(),
            inside_discharge: false,
            discharge_depth: 0,
            confidence: Vec::new(),
            capabilities: Vec::new(),
            provenance_log: Vec::new(),
            rng,
            schedule_trace: ScheduleTrace::new(),
            module,
            halted: false,
            exit_code: 0,
            trace_mode: false,
        }
    }

    // ── Provenance ──

    /// Record a provenance event.
    pub fn provenance(&mut self, kind: ProvenanceEventKind, desc: impl Into<String>) {
        let event = ProvenanceEvent {
            kind,
            description: desc.into(),
            timestamp: self.provenance_log.len() as u64,
        };
        self.provenance_log.push(event);
    }

    // ── Memory layer helpers (delegated to governor) ──

    /// Read from a memory layer through the governor.
    pub fn mem_load(&self, layer: u8, _key: &str) -> Option<Value> {
        let _layer = MemoryLayer::try_from(layer).ok()?;
        // We need mutable access for reinforcement, but this is a read.
        // In production, we'd use interior mutability (RefCell) or accept
        // that reads need &mut self. For now, return a clone.
        // The executor will call governor.read() which needs &mut self.
        // We'll handle this in the executor directly.
        None // placeholder – executor calls governor directly
    }

    /// Write to a memory layer through the governor.
    pub fn mem_store(&mut self, layer: u8, key: String, value: Value) -> Result<(), VmError> {
        let layer = MemoryLayer::try_from(layer)?;
        self.governor
            .write(layer, key, value, ConsentLevel::default())
    }
}

// ── VM Errors ──

#[derive(Error, Diagnostic, Debug)]
pub enum VmError {
    #[error("call depth exceeded (limit {limit})")]
    #[diagnostic(help("Likely unbounded recursion; raise `max_call_depth` only if intended."))]
    CallDepthExceeded { limit: usize },

    #[error("step limit exceeded ({limit} steps)")]
    #[diagnostic(help("The program ran too long; raise `max_steps` only if intended."))]
    FuelExhausted { limit: u64 },

    #[error("invalid operand: {0}")]
    #[diagnostic(help("The module is malformed (run the verifier before executing)."))]
    InvalidOperand(String),

    #[error("trap: {0}")]
    #[diagnostic(help("The program reached an explicit trap."))]
    Trap(String),

    #[error("division by zero")]
    #[diagnostic(help("Attempted to divide by zero."))]
    DivisionByZero,

    #[error("invalid instruction at ({func}:{blk}:{instr})")]
    #[diagnostic(help("The bytecode contained an unrecognised instruction."))]
    InvalidInstruction {
        func: usize,
        blk: usize,
        instr: usize,
    },

    #[error("invalid memory access: layer {layer} out of range")]
    #[diagnostic(help("Memory layers are indexed 0–7."))]
    InvalidMemoryLayer { layer: u8 },

    #[error("undefined variable `{name}`")]
    #[diagnostic(help("No variable with this name exists in the current scope."))]
    UndefinedVariable { name: String },

    #[error("type mismatch: expected {expected}, got {got}")]
    #[diagnostic(help("An operand had an unexpected type."))]
    TypeMismatch { expected: String, got: String },

    #[error("effect `{0}` not discharged")]
    #[diagnostic(help("This effect must be called inside a discharge block."))]
    UndischargedEffect(String),

    #[error("confidence below threshold: {actual} < {threshold}")]
    #[diagnostic(help("Increase confidence or lower the threshold."))]
    LowConfidence { actual: f64, threshold: f64 },

    #[error("taint influence above limit: {actual} > {limit}")]
    #[diagnostic(help("Sanitize the input or raise the taint limit explicitly."))]
    TaintExceeded { actual: f64, limit: f64 },

    #[error("budget exceeded: needs up to {needed} tokens, {remaining} remaining")]
    #[diagnostic(help("Raise the budget or choose a cheaper path."))]
    BudgetExceeded { needed: u64, remaining: u64 },

    #[error("capability `{0}` not held")]
    #[diagnostic(help("Request a grant for this capability from the principal."))]
    MissingCapability(String),

    #[error("halted")]
    #[diagnostic(help("The VM was stopped before the operation could complete."))]
    Halted,
}

pub type VmResult<T> = Result<T, VmError>;
