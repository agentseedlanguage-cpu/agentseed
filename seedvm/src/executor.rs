//! VM executor — a register-frame interpreter (ADR-020).
//!
//! Execution model:
//!   * each call owns a [`Frame`] with `regs[0..max_locals]`; a `VarId` is a
//!     register index; there is **no operand stack**;
//!   * an instruction reads its operands (immediates or registers) and writes
//!     its result to `dest` (if any);
//!   * `Call [Func(id), args..]` pushes a frame, parameters are registers
//!     `params[i]`; `Return` pops it and writes the caller's `dest`;
//!   * `discharge` depth is **per frame**: a callee never inherits its caller's
//!     authority to `perform` (and a `return` inside a scope cannot leak it);
//!   * the call depth and the step count are bounded; operands are checked
//!     against the frame and the string pool, so a malformed module is an
//!     error, never a panic.

use crate::computation::Computation;
use crate::memory::{ConsentLevel, MemoryLayer};
use crate::state::{Frame, ProvenanceEventKind, VMState, VmError, VmResult};
use crate::value::Value;
use seedc::ir::{Instr, Opcode, Operand, Terminator};
use std::rc::Rc;

/// Default recursion limit (frames are heap-allocated, so this is generous).
pub const DEFAULT_MAX_CALL_DEPTH: usize = 10_000;
/// Default instruction budget before [`VmError::FuelExhausted`].
pub const DEFAULT_MAX_STEPS: u64 = 200_000_000;

pub struct VM {
    pub state: VMState,
    pub trace_execution: bool,
    /// Defaults for a `Discharge` that carries no compiled thresholds.
    pub confidence_threshold: f64,
    pub taint_threshold: f64,
    pub budget_remaining: u64,
    pub max_call_depth: usize,
    pub max_steps: u64,
    /// Every line written by `print` (also echoed to stdout if enabled).
    pub output: Vec<String>,
    pub echo_stdout: bool,
    steps: u64,
    /// Pooled strings as shared values, built once.
    string_values: Vec<Rc<String>>,
}

/// Numeric view of a value (integers and floats only; no bool/null coercion).
enum Num {
    I(i64),
    F(f64),
}

fn num(v: &Value) -> Option<Num> {
    Some(match v {
        Value::I64(n) => Num::I(*n),
        Value::I32(n) => Num::I(i64::from(*n)),
        Value::I16(n) => Num::I(i64::from(*n)),
        Value::I8(n) => Num::I(i64::from(*n)),
        Value::U32(n) => Num::I(i64::from(*n)),
        Value::U16(n) => Num::I(i64::from(*n)),
        Value::U8(n) => Num::I(i64::from(*n)),
        Value::U64(n) => Num::I(i64::try_from(*n).ok()?),
        Value::F64(f) => Num::F(*f),
        Value::F32(f) => Num::F(f64::from(*f)),
        _ => return None,
    })
}

fn as_int(v: &Value) -> Option<i64> {
    match num(v)? {
        Num::I(n) => Some(n),
        Num::F(_) => None,
    }
}

fn as_f64(n: &Num) -> f64 {
    match n {
        Num::I(i) => *i as f64,
        Num::F(f) => *f,
    }
}

fn mismatch(expected: &str, a: &Value, b: &Value) -> VmError {
    VmError::TypeMismatch {
        expected: expected.into(),
        got: format!("{} and {}", a.type_tag(), b.type_tag()),
    }
}

impl VM {
    pub fn new(module: seedc::ir::Module, seed: u64) -> Self {
        let string_values = module.strings.iter().map(|s| Rc::new(s.clone())).collect();
        let state = VMState::new(module, seed);
        Self {
            state,
            trace_execution: false,
            confidence_threshold: 0.0,
            taint_threshold: 1.0,
            budget_remaining: u64::MAX,
            max_call_depth: DEFAULT_MAX_CALL_DEPTH,
            max_steps: DEFAULT_MAX_STEPS,
            output: Vec::new(),
            echo_stdout: true,
            steps: 0,
            string_values,
        }
    }

    /// Run the entry function (`main`, else the first) to completion.
    pub fn run(&mut self) -> VmResult<()> {
        self.run_main().map(|_| ())
    }

    /// Run the entry function and return its result.
    pub fn run_main(&mut self) -> VmResult<Value> {
        self.state.frames.clear();
        self.state.halted = false;
        self.steps = 0;
        let Some(entry) = self.state.module.entry_function() else {
            return Ok(Value::Unit);
        };
        let argc = self.state.module.functions[entry].params.len();
        self.push_frame(entry, vec![Value::Null; argc], None)?;
        let mut result = Value::Unit;
        while !self.state.frames.is_empty() && !self.state.halted {
            self.step(&mut result)?;
        }
        Ok(result)
    }

    // ── frames ──

    fn push_frame(
        &mut self,
        func_id: usize,
        args: Vec<Value>,
        ret_dest: Option<usize>,
    ) -> VmResult<()> {
        if self.state.frames.len() >= self.max_call_depth {
            return Err(VmError::CallDepthExceeded {
                limit: self.max_call_depth,
            });
        }
        let Some(f) = self.state.module.functions.get(func_id) else {
            return Err(VmError::InvalidOperand(format!(
                "call to unknown function {func_id}"
            )));
        };
        if args.len() != f.params.len() {
            return Err(VmError::InvalidOperand(format!(
                "`{}` expects {} argument(s), got {}",
                f.name,
                f.params.len(),
                args.len()
            )));
        }
        let mut regs = vec![Value::Null; f.max_locals.max(f.params.len())];
        for (value, param) in args.into_iter().zip(f.params.iter()) {
            match regs.get_mut(*param) {
                Some(slot) => *slot = value,
                None => {
                    return Err(VmError::InvalidOperand(format!(
                        "parameter register {param} out of range"
                    )))
                }
            }
        }
        let entry = f.entry;
        self.state.frames.push(Frame {
            func: func_id,
            regs,
            block: entry,
            instr: 0,
            ret_dest,
            discharge_depth: 0,
        });
        self.sync_discharge();
        Ok(())
    }

    fn sync_discharge(&mut self) {
        let depth = self.state.frames.last().map_or(0, |f| f.discharge_depth);
        self.state.discharge_depth = depth;
        self.state.inside_discharge = depth > 0;
    }

    fn frame(&self) -> VmResult<&Frame> {
        self.state
            .frames
            .last()
            .ok_or_else(|| VmError::InvalidOperand("no active frame".into()))
    }

    fn frame_mut(&mut self) -> VmResult<&mut Frame> {
        self.state
            .frames
            .last_mut()
            .ok_or_else(|| VmError::InvalidOperand("no active frame".into()))
    }

    // ── main loop ──

    fn step(&mut self, result: &mut Value) -> VmResult<()> {
        self.steps += 1;
        if self.steps > self.max_steps {
            return Err(VmError::FuelExhausted {
                limit: self.max_steps,
            });
        }
        let (fi, bi, ii) = {
            let fr = self.frame()?;
            (fr.func, fr.block, fr.instr)
        };
        self.state.ip = (fi, bi, ii);
        self.state.current_func = fi;
        let block = self
            .state
            .module
            .functions
            .get(fi)
            .and_then(|f| f.blocks.get(bi))
            .ok_or_else(|| VmError::InvalidOperand(format!("no block {bi} in function {fi}")))?;
        if let Some(instr) = block.instrs.get(ii) {
            let instr = instr.clone();
            if self.trace_execution {
                eprintln!(
                    "[trace] fn={} blk={} instr={} op={:?}",
                    fi, bi, ii, instr.opcode
                );
            }
            // Advance first so a `Call` resumes after itself.
            self.frame_mut()?.instr += 1;
            self.execute_instr(&instr)
        } else {
            let term = block.terminator.clone();
            self.execute_terminator(term, result)
        }
    }

    fn execute_terminator(&mut self, term: Terminator, result: &mut Value) -> VmResult<()> {
        match term {
            Terminator::Branch {
                cond,
                then_block,
                else_block,
            } => {
                let truthy = self.val(&cond)?.is_truthy();
                self.jump(if truthy { then_block } else { else_block })
            }
            Terminator::Jump(target) => self.jump(target),
            Terminator::Return(v) => {
                let value = match v {
                    Some(op) => self.val(&op)?,
                    None => Value::Unit,
                };
                let popped = self.state.frames.pop();
                match (self.state.frames.last_mut(), popped) {
                    (None, _) => *result = value,
                    (Some(caller), Some(done)) => {
                        if let Some(d) = done.ret_dest {
                            match caller.regs.get_mut(d) {
                                Some(slot) => *slot = value,
                                None => {
                                    return Err(VmError::InvalidOperand(format!(
                                        "return register {d} out of range"
                                    )))
                                }
                            }
                        }
                    }
                    (Some(_), None) => {}
                }
                self.sync_discharge();
                Ok(())
            }
            Terminator::Halt => {
                self.state.halted = true;
                self.state.frames.clear();
                self.sync_discharge();
                Ok(())
            }
        }
    }

    fn jump(&mut self, target: usize) -> VmResult<()> {
        let fr = self.frame_mut()?;
        fr.block = target;
        fr.instr = 0;
        Ok(())
    }

    // ── operand access ──

    fn val(&self, op: &Operand) -> VmResult<Value> {
        match op {
            Operand::Var(v) => self
                .frame()?
                .regs
                .get(*v)
                .cloned()
                .ok_or_else(|| VmError::InvalidOperand(format!("register {v} out of range"))),
            Operand::Int(i) => Ok(Value::I64(*i)),
            Operand::Float(f) => Ok(Value::F64(*f)),
            Operand::Bool(b) => Ok(Value::Bool(*b)),
            Operand::Null => Ok(Value::Null),
            Operand::String(i) => self
                .string_values
                .get(*i)
                .map(|s| Value::String(Rc::clone(s)))
                .ok_or_else(|| VmError::InvalidOperand(format!("string pool index {i}"))),
            Operand::Func(_) | Operand::Label(_) | Operand::Type(_) => Err(
                VmError::InvalidOperand("a function/label/type operand is not a value".into()),
            ),
        }
    }

    fn operand_at<'a>(&self, instr: &'a Instr, i: usize) -> VmResult<&'a Operand> {
        instr.operands.get(i).ok_or_else(|| {
            VmError::InvalidOperand(format!(
                "{:?} needs at least {} operand(s)",
                instr.opcode,
                i + 1
            ))
        })
    }

    fn val_at(&self, instr: &Instr, i: usize) -> VmResult<Value> {
        let op = self.operand_at(instr, i)?;
        self.val(op)
    }

    fn pool_string(&self, op: &Operand) -> VmResult<String> {
        match op {
            Operand::String(i) => self
                .string_values
                .get(*i)
                .map(|s| (**s).clone())
                .ok_or_else(|| VmError::InvalidOperand(format!("string pool index {i}"))),
            Operand::Int(v) => Ok(v.to_string()),
            _ => Err(VmError::InvalidOperand("expected a string operand".into())),
        }
    }

    fn f64_at(&self, instr: &Instr, i: usize) -> VmResult<f64> {
        let v = self.val_at(instr, i)?;
        num(&v)
            .map(|n| as_f64(&n))
            .ok_or_else(|| VmError::TypeMismatch {
                expected: "number".into(),
                got: v.type_tag().into(),
            })
    }

    fn layer_at(&self, instr: &Instr, i: usize) -> VmResult<MemoryLayer> {
        let v = self.val_at(instr, i)?;
        let raw = as_int(&v).ok_or_else(|| VmError::TypeMismatch {
            expected: "memory layer index".into(),
            got: v.type_tag().into(),
        })?;
        let layer =
            u8::try_from(raw).map_err(|_| VmError::InvalidMemoryLayer { layer: u8::MAX })?;
        MemoryLayer::try_from(layer).map_err(|_| VmError::InvalidMemoryLayer { layer })
    }

    // ── arithmetic ──

    fn arith(op: &Opcode, a: &Value, b: &Value) -> VmResult<Value> {
        if let (Opcode::Add, Value::String(x), Value::String(y)) = (op, a, b) {
            return Ok(Value::String(Rc::new(format!("{x}{y}"))));
        }
        match (num(a), num(b)) {
            (Some(Num::I(x)), Some(Num::I(y))) => Ok(Value::I64(match op {
                Opcode::Add => x.wrapping_add(y),
                Opcode::Sub => x.wrapping_sub(y),
                Opcode::Mul => x.wrapping_mul(y),
                Opcode::Div => {
                    if y == 0 {
                        return Err(VmError::DivisionByZero);
                    }
                    x.wrapping_div(y)
                }
                Opcode::Rem => {
                    if y == 0 {
                        return Err(VmError::DivisionByZero);
                    }
                    x.wrapping_rem(y)
                }
                _ => return Err(mismatch("arithmetic", a, b)),
            })),
            (Some(x), Some(y)) => {
                let (x, y) = (as_f64(&x), as_f64(&y));
                Ok(Value::F64(match op {
                    Opcode::Add => x + y,
                    Opcode::Sub => x - y,
                    Opcode::Mul => x * y,
                    Opcode::Div => x / y,
                    Opcode::Rem => x % y,
                    _ => return Err(mismatch("arithmetic", a, b)),
                }))
            }
            _ => Err(mismatch("numeric operands", a, b)),
        }
    }

    fn compare(op: &Opcode, a: &Value, b: &Value) -> VmResult<Value> {
        use std::cmp::Ordering;
        let ord: Option<Ordering> = match (num(a), num(b)) {
            (Some(Num::I(x)), Some(Num::I(y))) => Some(x.cmp(&y)),
            (Some(x), Some(y)) => as_f64(&x).partial_cmp(&as_f64(&y)),
            _ => match (a, b) {
                (Value::String(x), Value::String(y)) => Some(x.as_str().cmp(y.as_str())),
                _ => {
                    return match op {
                        Opcode::Eq => Ok(Value::Bool(a == b)),
                        Opcode::NotEq => Ok(Value::Bool(a != b)),
                        _ => Err(mismatch("comparable operands", a, b)),
                    }
                }
            },
        };
        Ok(Value::Bool(match (op, ord) {
            (Opcode::Eq, o) => o == Some(Ordering::Equal),
            (Opcode::NotEq, o) => o != Some(Ordering::Equal),
            (Opcode::Lt, o) => o == Some(Ordering::Less),
            (Opcode::Gt, o) => o == Some(Ordering::Greater),
            (Opcode::LtEq, o) => matches!(o, Some(Ordering::Less | Ordering::Equal)),
            (Opcode::GtEq, o) => matches!(o, Some(Ordering::Greater | Ordering::Equal)),
            _ => return Err(mismatch("comparison", a, b)),
        }))
    }

    fn bitwise(op: &Opcode, a: &Value, b: &Value) -> VmResult<Value> {
        let (Some(x), Some(y)) = (as_int(a), as_int(b)) else {
            return Err(mismatch("integer operands", a, b));
        };
        let shift = |amount: i64| -> VmResult<u32> {
            u32::try_from(amount)
                .ok()
                .filter(|s| *s < 64)
                .ok_or_else(|| {
                    VmError::InvalidOperand(format!("shift amount {amount} out of range"))
                })
        };
        Ok(Value::I64(match op {
            Opcode::BitAnd => x & y,
            Opcode::BitOr => x | y,
            Opcode::BitXor => x ^ y,
            Opcode::Shl => x << shift(y)?,
            Opcode::Shr => x >> shift(y)?,
            _ => return Err(mismatch("bitwise", a, b)),
        }))
    }

    fn write_dest(&mut self, dest: Option<usize>, value: Value) -> VmResult<()> {
        if let Some(d) = dest {
            let fr = self.frame_mut()?;
            match fr.regs.get_mut(d) {
                Some(slot) => *slot = value,
                None => {
                    return Err(VmError::InvalidOperand(format!(
                        "destination register {d} out of range"
                    )))
                }
            }
        }
        Ok(())
    }

    // ── instruction dispatch ──

    fn execute_instr(&mut self, instr: &Instr) -> VmResult<()> {
        let opcode = &instr.opcode;
        if self.state.trace_mode {
            self.state.schedule_trace.record(
                format!("{:?}", opcode),
                self.state.frames.len(),
                format!("executing {:?}", opcode),
                self.state.inside_discharge,
            );
        }
        // `None` means "this instruction produces no value" (dest untouched).
        let produced: Option<Value> = match opcode {
            Opcode::Const => Some(self.val_at(instr, 0)?),

            Opcode::Add | Opcode::Sub | Opcode::Mul | Opcode::Div | Opcode::Rem => {
                let (a, b) = (self.val_at(instr, 0)?, self.val_at(instr, 1)?);
                Some(Self::arith(opcode, &a, &b)?)
            }
            Opcode::Eq | Opcode::NotEq | Opcode::Lt | Opcode::Gt | Opcode::LtEq | Opcode::GtEq => {
                let (a, b) = (self.val_at(instr, 0)?, self.val_at(instr, 1)?);
                Some(Self::compare(opcode, &a, &b)?)
            }
            Opcode::BitAnd | Opcode::BitOr | Opcode::BitXor | Opcode::Shl | Opcode::Shr => {
                let (a, b) = (self.val_at(instr, 0)?, self.val_at(instr, 1)?);
                Some(Self::bitwise(opcode, &a, &b)?)
            }
            Opcode::And => {
                let (a, b) = (self.val_at(instr, 0)?, self.val_at(instr, 1)?);
                Some(Value::Bool(a.is_truthy() && b.is_truthy()))
            }
            Opcode::Or => {
                let (a, b) = (self.val_at(instr, 0)?, self.val_at(instr, 1)?);
                Some(Value::Bool(a.is_truthy() || b.is_truthy()))
            }
            Opcode::Not => Some(Value::Bool(!self.val_at(instr, 0)?.is_truthy())),

            // ── registers ──
            Opcode::LoadLocal => match self.operand_at(instr, 0)? {
                Operand::Var(slot) => Some(self.val(&Operand::Var(*slot))?),
                _ => return Err(VmError::InvalidOperand("LoadLocal needs a register".into())),
            },
            Opcode::StoreLocal => {
                let Operand::Var(slot) = self.operand_at(instr, 0)? else {
                    return Err(VmError::InvalidOperand(
                        "StoreLocal needs a register".into(),
                    ));
                };
                let slot = *slot;
                let v = self.val_at(instr, 1)?;
                let fr = self.frame_mut()?;
                match fr.regs.get_mut(slot) {
                    Some(r) => *r = v,
                    None => {
                        return Err(VmError::InvalidOperand(format!(
                            "register {slot} out of range"
                        )))
                    }
                }
                None
            }

            // ── calls ──
            Opcode::Call => {
                let Operand::Func(fid) = self.operand_at(instr, 0)? else {
                    return Err(VmError::InvalidOperand("Call needs a function".into()));
                };
                let fid = *fid;
                let mut args = Vec::with_capacity(instr.operands.len().saturating_sub(1));
                for i in 1..instr.operands.len() {
                    args.push(self.val_at(instr, i)?);
                }
                self.push_frame(fid, args, instr.dest)?;
                return Ok(());
            }
            Opcode::Return => None, // handled by the terminator
            Opcode::Print => {
                let mut parts = Vec::with_capacity(instr.operands.len());
                for i in 0..instr.operands.len() {
                    parts.push(match self.val_at(instr, i)? {
                        Value::String(s) => (*s).clone(),
                        other => format!("{other}"),
                    });
                }
                let line = parts.join(" ");
                if self.echo_stdout {
                    println!("{line}");
                }
                self.output.push(line);
                Some(Value::Unit)
            }
            Opcode::Trap => {
                let msg = match instr.operands.first() {
                    Some(op) => self.pool_string(op).unwrap_or_else(|_| "trap".into()),
                    None => "trap".into(),
                };
                return Err(VmError::Trap(msg));
            }

            // ── memory layers (routed through the governor) ──
            Opcode::MemLoad => {
                let layer = self.layer_at(instr, 0)?;
                let key = self.pool_string(self.operand_at(instr, 1)?)?;
                let entry = self
                    .state
                    .governor
                    .read(layer, &key, ConsentLevel::default())?;
                let val = entry.map(|e| e.value.clone()).unwrap_or(Value::Null);
                self.state.provenance(
                    ProvenanceEventKind::MemoryRead,
                    format!("L{:?}:{}", layer, key),
                );
                Some(val)
            }
            Opcode::MemStore => {
                let layer = self.layer_at(instr, 0)?;
                let key = self.pool_string(self.operand_at(instr, 1)?)?;
                let val = self.val_at(instr, 2)?;
                self.state
                    .governor
                    .write(layer, key.clone(), val, ConsentLevel::default())?;
                self.state.provenance(
                    ProvenanceEventKind::MemoryWrite,
                    format!("L{:?}:{}", layer, key),
                );
                Some(Value::Unit)
            }
            Opcode::MemQuery => {
                let layer = self.layer_at(instr, 0)?;
                let key = self.pool_string(self.operand_at(instr, 1)?)?;
                let entry = self
                    .state
                    .governor
                    .read(layer, &key, ConsentLevel::default())?;
                Some(Value::F64(entry.map(|e| e.weight).unwrap_or(0.0)))
            }
            Opcode::MemPromote => {
                let layer = self.layer_at(instr, 0)?;
                let key = self.pool_string(self.operand_at(instr, 1)?)?;
                let _ = self
                    .state
                    .governor
                    .read(layer, &key, ConsentLevel::default())?;
                Some(Value::Unit)
            }
            Opcode::MemDecay => {
                let layer = self.layer_at(instr, 0)?;
                let half_life = self.f64_at(instr, 1)?;
                self.state.governor.decay_layer(layer, half_life);
                Some(Value::Unit)
            }

            // ── agents ──
            Opcode::AgentSpawn => {
                let handle = self.state.rng.next_u64();
                self.state.provenance(
                    ProvenanceEventKind::AgentSpawned,
                    format!("agent#{}", handle),
                );
                Some(Value::AgentHandle(handle))
            }
            Opcode::AgentSend => {
                let msg = self.val_at(instr, 1)?;
                self.state.provenance(
                    ProvenanceEventKind::AgentMessageSent,
                    format!("msg: {:?}", msg),
                );
                Some(Value::Bool(true))
            }
            Opcode::AgentRecv => Some(Value::Null),

            // ── effects ──
            Opcode::Discharge => {
                // Thresholds compiled into the instruction override VM defaults.
                let conf = match instr.operands.get(1) {
                    Some(_) => self.f64_at(instr, 1)?,
                    None => self.confidence_threshold,
                };
                let taint = match instr.operands.get(2) {
                    Some(_) => self.f64_at(instr, 2)?,
                    None => self.taint_threshold,
                };
                let scrutinee = match instr.operands.first() {
                    Some(op) => self.val(op)?,
                    None => Value::Unit,
                };
                let inner = if let Value::Computation(comp) = scrutinee {
                    comp.check_thresholds(conf, taint, self.budget_remaining)?;
                    let inner = comp.into_value();
                    self.state.provenance(
                        ProvenanceEventKind::DischargeExited,
                        format!(
                            "discharged {}",
                            Value::Computation(Computation::pure(inner.clone()))
                        ),
                    );
                    inner
                } else {
                    scrutinee
                };
                self.frame_mut()?.discharge_depth += 1;
                self.sync_discharge();
                self.state
                    .provenance(ProvenanceEventKind::DischargeEntered, "entered discharge");
                Some(inner)
            }
            Opcode::DischargeEnd => {
                let fr = self.frame_mut()?;
                fr.discharge_depth = fr.discharge_depth.saturating_sub(1);
                self.sync_discharge();
                None
            }
            Opcode::Perform => {
                let name = self.pool_string(self.operand_at(instr, 0)?)?;
                if !self.state.inside_discharge {
                    return Err(VmError::UndischargedEffect(name));
                }
                for i in 1..instr.operands.len() {
                    self.val_at(instr, i)?; // arguments must be readable
                }
                self.state.effects.push(name.clone());
                self.state
                    .provenance(ProvenanceEventKind::EffectExecuted, &name);
                Some(Value::Unit)
            }

            // ── uncertainty ──
            Opcode::Infer => Some(Value::Computation(Computation::uncertain(
                Value::F64(0.5),
                0.5,
                0.8,
            ))),
            Opcode::Observe => Some(Value::Computation(Computation::pure(Value::Unit))),
            Opcode::ConfidenceGate => {
                let threshold = self.f64_at(instr, 0)?;
                let v = self.val_at(instr, 1)?;
                let (value, lo) = match v {
                    Value::Computation(ref comp) => ((*comp.value).clone(), comp.uncertainty_lo),
                    ref other => (other.clone(), 1.0),
                };
                if lo < threshold {
                    return Err(VmError::LowConfidence {
                        actual: lo,
                        threshold,
                    });
                }
                Some(value)
            }
            Opcode::ConfidenceAsk => {
                // Result: the lower confidence bound (the value gates act on).
                let v = self.val_at(instr, 0)?;
                let (lo, hi) = match &v {
                    Value::Computation(comp) => (comp.uncertainty_lo, comp.uncertainty_hi),
                    _ => (1.0, 1.0),
                };
                self.state.provenance(
                    ProvenanceEventKind::InferCalled,
                    format!("conf=[{:.2},{:.2}]", lo, hi),
                );
                Some(Value::F64(lo))
            }

            // ── heartbeat / dream ──
            Opcode::HeartbeatTick => Some(Value::U64(self.state.rng.draw_count)),
            Opcode::HeartbeatSleep
            | Opcode::DreamConsolidate
            | Opcode::DreamResolve
            | Opcode::DreamPrune => Some(Value::Unit),

            // ── capabilities ──
            Opcode::CapCheck => {
                let cap_id = self.pool_string(self.operand_at(instr, 0)?)?;
                let found = self.state.capabilities.iter().any(|v| match v {
                    Value::Capability(id, _) => id == &cap_id,
                    _ => false,
                });
                if !found {
                    return Err(VmError::MissingCapability(cap_id));
                }
                Some(Value::Bool(true))
            }
            Opcode::CapGrant => {
                let id = self.pool_string(self.operand_at(instr, 0)?)?;
                let scope = self.pool_string(self.operand_at(instr, 1)?)?;
                self.state
                    .capabilities
                    .push(Value::Capability(id, vec![scope]));
                Some(Value::Unit)
            }
            Opcode::CapRevoke => {
                let cap_id = self.pool_string(self.operand_at(instr, 0)?)?;
                self.state.capabilities.retain(|v| match v {
                    Value::Capability(id, _) => id != &cap_id,
                    _ => true,
                });
                Some(Value::Unit)
            }

            // ── provenance ──
            Opcode::DecisionLog => {
                let decision = self.val_at(instr, 0)?;
                self.state
                    .provenance(ProvenanceEventKind::DecisionMade, format!("{}", decision));
                Some(Value::Unit)
            }
            Opcode::DecisionQuery
            | Opcode::PipeConnect
            | Opcode::PipePush
            | Opcode::PipePull
            | Opcode::FederationPublish
            | Opcode::FederationSubscribe
            | Opcode::FederationQuery => Some(Value::Null),
            Opcode::CorrigibilityCheck => Some(Value::Bool(true)),

            // With mutable registers there is nothing for a phi to merge.
            Opcode::Phi | Opcode::Nop => None,

            _ => {
                return Err(VmError::InvalidInstruction {
                    func: self.state.ip.0,
                    blk: self.state.ip.1,
                    instr: self.state.ip.2,
                })
            }
        };
        if let Some(v) = produced {
            self.write_dest(instr.dest, v)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use seedc::ir::{Function, IrType, Module};

    fn finish(module: Module) -> (VM, VmResult<Value>) {
        let mut vm = VM::new(module, 42);
        vm.echo_stdout = false;
        let r = vm.run_main();
        (vm, r)
    }

    fn ins(op: Opcode, dest: Option<usize>, operands: Vec<Operand>) -> Instr {
        Instr::new(op, dest, operands)
    }

    #[test]
    fn test_simple_add() {
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        let d = f.new_var();
        f.push_instr(
            0,
            ins(
                Opcode::Add,
                Some(d),
                vec![Operand::Int(40), Operand::Int(2)],
            ),
        );
        f.set_terminator(0, Terminator::Return(Some(Operand::Var(d))));
        module.add_function(f);
        let (_, r) = finish(module);
        assert_eq!(r.unwrap(), Value::I64(42));
    }

    #[test]
    fn variables_flow_between_instructions() {
        // c = a + b; return c * c   with a=3, b=4  -> 49
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        let (a, b, c, d) = (f.new_var(), f.new_var(), f.new_var(), f.new_var());
        f.push_instr(
            0,
            ins(
                Opcode::StoreLocal,
                None,
                vec![Operand::Var(a), Operand::Int(3)],
            ),
        );
        f.push_instr(
            0,
            ins(
                Opcode::StoreLocal,
                None,
                vec![Operand::Var(b), Operand::Int(4)],
            ),
        );
        f.push_instr(
            0,
            ins(Opcode::Add, Some(c), vec![Operand::Var(a), Operand::Var(b)]),
        );
        f.push_instr(
            0,
            ins(Opcode::Mul, Some(d), vec![Operand::Var(c), Operand::Var(c)]),
        );
        f.set_terminator(0, Terminator::Return(Some(Operand::Var(d))));
        module.add_function(f);
        assert_eq!(finish(module).1.unwrap(), Value::I64(49));
    }

    #[test]
    fn test_conditionals() {
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        let (cond, res) = (f.new_var(), f.new_var());
        f.push_instr(0, ins(Opcode::Const, Some(cond), vec![Operand::Bool(true)]));
        let (t, e) = (f.add_block(), f.add_block());
        f.set_terminator(
            0,
            Terminator::Branch {
                cond: Operand::Var(cond),
                then_block: t,
                else_block: e,
            },
        );
        f.push_instr(t, ins(Opcode::Const, Some(res), vec![Operand::Int(1)]));
        f.set_terminator(t, Terminator::Return(Some(Operand::Var(res))));
        f.push_instr(e, ins(Opcode::Const, Some(res), vec![Operand::Int(0)]));
        f.set_terminator(e, Terminator::Return(Some(Operand::Var(res))));
        module.add_function(f);
        assert_eq!(finish(module).1.unwrap(), Value::I64(1));
    }

    fn discharge_module(close_before_perform: bool) -> Module {
        let mut module = Module::new();
        let name = module.intern("net.fetch");
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        f.push_instr(0, ins(Opcode::Discharge, None, vec![Operand::Null]));
        if close_before_perform {
            f.push_instr(0, ins(Opcode::DischargeEnd, None, vec![]));
        }
        f.push_instr(0, ins(Opcode::Perform, None, vec![Operand::String(name)]));
        f.set_terminator(0, Terminator::Return(Some(Operand::Null)));
        module.add_function(f);
        module
    }

    #[test]
    fn test_discharge_perform() {
        let (vm, r) = finish(discharge_module(false));
        assert!(r.is_ok(), "{r:?}");
        assert_eq!(vm.state.effects, vec!["net.fetch".to_string()]);
    }

    #[test]
    fn test_perform_without_discharge_fails() {
        let mut module = Module::new();
        let name = module.intern("net.fetch");
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        f.push_instr(0, ins(Opcode::Perform, None, vec![Operand::String(name)]));
        module.add_function(f);
        assert!(matches!(
            finish(module).1,
            Err(VmError::UndischargedEffect(n)) if n == "net.fetch"
        ));
    }

    #[test]
    fn test_perform_after_discharge_end_fails() {
        assert!(matches!(
            finish(discharge_module(true)).1,
            Err(VmError::UndischargedEffect(_))
        ));
    }

    #[test]
    fn a_callee_does_not_inherit_its_callers_discharge() {
        // main: Discharge; call callee; callee performs with no discharge -> error
        let mut module = Module::new();
        let name = module.intern("net.fetch");
        let mut callee = Function::new("callee".into(), vec![], IrType::Void);
        callee.push_instr(0, ins(Opcode::Perform, None, vec![Operand::String(name)]));
        callee.set_terminator(0, Terminator::Return(None));
        let callee_id = module.add_function(callee);
        let mut main = Function::new("main".into(), vec![], IrType::Void);
        main.push_instr(0, ins(Opcode::Discharge, None, vec![Operand::Null]));
        main.push_instr(0, ins(Opcode::Call, None, vec![Operand::Func(callee_id)]));
        main.set_terminator(0, Terminator::Return(None));
        module.add_function(main);
        assert!(matches!(
            finish(module).1,
            Err(VmError::UndischargedEffect(_))
        ));
    }

    #[test]
    fn a_return_inside_a_scope_does_not_leak_it_to_the_caller() {
        // callee opens a discharge and returns without closing it; the caller
        // must still not be allowed to perform afterwards.
        let mut module = Module::new();
        let name = module.intern("net.fetch");
        let mut callee = Function::new("callee".into(), vec![], IrType::Void);
        callee.push_instr(0, ins(Opcode::Discharge, None, vec![Operand::Null]));
        callee.set_terminator(0, Terminator::Return(None));
        let callee_id = module.add_function(callee);
        let mut main = Function::new("main".into(), vec![], IrType::Void);
        main.push_instr(0, ins(Opcode::Call, None, vec![Operand::Func(callee_id)]));
        main.push_instr(0, ins(Opcode::Perform, None, vec![Operand::String(name)]));
        main.set_terminator(0, Terminator::Return(None));
        module.add_function(main);
        assert!(matches!(
            finish(module).1,
            Err(VmError::UndischargedEffect(_))
        ));
    }

    fn mem_module(build: impl FnOnce(&mut Function, &mut Module) -> usize) -> Module {
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        let out = build(&mut f, &mut module);
        f.set_terminator(0, Terminator::Return(Some(Operand::Var(out))));
        module.add_function(f);
        module
    }

    #[test]
    fn test_memory_store_and_load() {
        let module = mem_module(|f, m| {
            let key = m.intern("k");
            let out = f.new_var();
            f.push_instr(
                0,
                ins(
                    Opcode::MemStore,
                    None,
                    vec![Operand::Int(0), Operand::String(key), Operand::Int(42)],
                ),
            );
            f.push_instr(
                0,
                ins(
                    Opcode::MemLoad,
                    Some(out),
                    vec![Operand::Int(0), Operand::String(key)],
                ),
            );
            out
        });
        assert_eq!(finish(module).1.unwrap(), Value::I64(42));
    }

    #[test]
    fn test_memory_decay_and_query() {
        let module = mem_module(|f, m| {
            let (k1, k2) = (m.intern("one"), m.intern("two"));
            let out = f.new_var();
            for (k, v) in [(k1, 99), (k2, 0)] {
                f.push_instr(
                    0,
                    ins(
                        Opcode::MemStore,
                        None,
                        vec![Operand::Int(0), Operand::String(k), Operand::Int(v)],
                    ),
                );
            }
            f.push_instr(
                0,
                ins(
                    Opcode::MemDecay,
                    None,
                    vec![Operand::Int(0), Operand::Float(0.1)],
                ),
            );
            f.push_instr(
                0,
                ins(
                    Opcode::MemQuery,
                    Some(out),
                    vec![Operand::Int(0), Operand::String(k1)],
                ),
            );
            out
        });
        match finish(module).1.unwrap() {
            Value::F64(w) => assert!(w < 1.0, "weight should decay below 1.0, got {w}"),
            other => panic!("expected F64 weight, got {other:?}"),
        }
    }

    #[test]
    fn test_gate_uses_lower_bound() {
        let c = Computation::uncertain(Value::I64(1), 0.2, 0.99);
        assert!(c.check_thresholds(0.9, 1.0, u64::MAX).is_err());
        let ok = Computation::uncertain(Value::I64(1), 0.95, 0.99);
        assert!(ok.check_thresholds(0.9, 1.0, u64::MAX).is_ok());
    }

    #[test]
    fn test_taint_and_budget_have_distinct_errors() {
        let mut c = Computation::pure(Value::I64(1));
        c.taint_influence = 0.8;
        assert!(matches!(
            c.check_thresholds(0.0, 0.2, u64::MAX),
            Err(VmError::TaintExceeded { .. })
        ));
        let mut c = Computation::pure(Value::I64(1));
        c.cost_tokens_max = 100;
        assert!(matches!(
            c.check_thresholds(0.0, 1.0, 10),
            Err(VmError::BudgetExceeded { .. })
        ));
    }

    #[test]
    fn division_by_zero_is_an_error() {
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::I64);
        let d = f.new_var();
        f.push_instr(
            0,
            ins(Opcode::Div, Some(d), vec![Operand::Int(1), Operand::Int(0)]),
        );
        f.set_terminator(0, Terminator::Return(Some(Operand::Var(d))));
        module.add_function(f);
        assert!(matches!(finish(module).1, Err(VmError::DivisionByZero)));
    }

    #[test]
    fn malformed_modules_error_instead_of_panicking() {
        // out-of-range register, string index and function index
        for instr in [
            ins(
                Opcode::Add,
                Some(99),
                vec![Operand::Int(1), Operand::Int(2)],
            ),
            ins(Opcode::Const, Some(0), vec![Operand::String(7)]),
            ins(Opcode::Call, None, vec![Operand::Func(9)]),
            ins(
                Opcode::Add,
                Some(0),
                vec![Operand::Var(50), Operand::Int(1)],
            ),
            ins(Opcode::Add, Some(0), vec![Operand::Int(1)]),
        ] {
            let mut module = Module::new();
            let mut f = Function::new("main".into(), vec![], IrType::Void);
            f.new_var();
            f.push_instr(0, instr);
            module.add_function(f);
            assert!(finish(module).1.is_err());
        }
    }

    #[test]
    fn runaway_loops_hit_the_step_limit() {
        let mut module = Module::new();
        let mut f = Function::new("main".into(), vec![], IrType::Void);
        f.set_terminator(0, Terminator::Jump(0));
        module.add_function(f);
        let mut vm = VM::new(module, 1);
        vm.max_steps = 1_000;
        assert!(matches!(
            vm.run_main(),
            Err(VmError::FuelExhausted { limit: 1_000 })
        ));
    }
}
