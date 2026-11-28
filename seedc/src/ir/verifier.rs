//! IR verifier for AGENT‑SEED.
//!
//! The IR is a *mutable-register* IR (ADR-020): a `VarId` names a frame
//! register that may be written more than once, so classic SSA dominance does
//! not apply. The verifier instead runs a forward dataflow over the blocks
//! reachable from the entry and checks:
//!
//!   - **definite assignment**: a register is read only if every path to the
//!     read has written it (parameters are written on entry; sets are
//!     intersected at joins);
//!   - **discharge discipline**: `Perform` only at discharge depth > 0,
//!     `DischargeEnd` only at depth > 0, and every path into a join agrees on
//!     the depth (so no path can leave a scope open or close one twice);
//!   - **operand validity**: string-pool and function indices are in range,
//!     `Call` targets a function and passes exactly its parameter count;
//!   - terminator targets in range; binary ops have two operands.
//!
//! Unreachable blocks are not analysed (lowering may leave dead merge blocks).
//!
//! Prior art: dataflow verification as in LLVM's `Verifier`; definite
//! assignment as in Java's JLS ch. 16.

use crate::ir::*;
use std::collections::BTreeSet;

pub fn verify(module: &Module) -> Result<(), IrError> {
    for func in &module.functions {
        verify_function(module, func)?;
    }
    Ok(())
}

#[derive(Clone, PartialEq)]
struct State {
    defined: BTreeSet<VarId>,
    depth: u32,
}

fn cf_err(msg: impl Into<String>) -> IrError {
    IrError::ControlFlowError {
        msg: msg.into(),
        span: None,
    }
}

fn successors(t: &Terminator) -> Vec<BlockId> {
    match t {
        Terminator::Branch {
            then_block,
            else_block,
            ..
        } => vec![*then_block, *else_block],
        Terminator::Jump(b) => vec![*b],
        Terminator::Return(_) | Terminator::Halt => vec![],
    }
}

fn verify_function(module: &Module, func: &Function) -> Result<(), IrError> {
    for (i, block) in func.blocks.iter().enumerate() {
        if block.id != i {
            return Err(cf_err(format!(
                "Block ID mismatch: expected {}, got {}",
                i, block.id
            )));
        }
    }
    if func.entry >= func.blocks.len() {
        return Err(cf_err(format!(
            "Entry block {} out of range (0-{})",
            func.entry,
            func.blocks.len()
        )));
    }
    // Every register named anywhere must exist in the frame.
    let in_range = |v: VarId| -> Result<(), IrError> {
        if v >= func.max_locals {
            Err(cf_err(format!(
                "register {v} out of range in `{}` (max_locals = {})",
                func.name, func.max_locals
            )))
        } else {
            Ok(())
        }
    };
    for p in &func.params {
        in_range(*p)?;
    }
    for block in &func.blocks {
        for instr in &block.instrs {
            if let Some(d) = instr.dest {
                in_range(d)?;
            }
            for op in &instr.operands {
                if let Operand::Var(v) = op {
                    in_range(*v)?;
                }
            }
        }
        match &block.terminator {
            Terminator::Branch {
                cond: Operand::Var(v),
                ..
            }
            | Terminator::Return(Some(Operand::Var(v))) => in_range(*v)?,
            _ => {}
        }
    }
    for block in &func.blocks {
        for succ in successors(&block.terminator) {
            if succ >= func.blocks.len() {
                return Err(cf_err("Branch/jump target out of range"));
            }
        }
    }

    // Forward dataflow to a fixpoint. `defined` only shrinks at joins and
    // `depth` must agree, so this terminates.
    let mut in_state: Vec<Option<State>> = vec![None; func.blocks.len()];
    in_state[func.entry] = Some(State {
        defined: func.params.iter().copied().collect(),
        depth: 0,
    });
    let mut work = vec![func.entry];
    while let Some(b) = work.pop() {
        let Some(mut st) = in_state[b].clone() else {
            continue;
        };
        let block = &func.blocks[b];
        for instr in &block.instrs {
            check_instr(module, func, instr, &mut st)?;
        }
        check_terminator_uses(&block.terminator, &st)?;
        for succ in successors(&block.terminator) {
            let merged = match &in_state[succ] {
                None => st.clone(),
                Some(prev) => {
                    if prev.depth != st.depth {
                        return Err(IrError::EffectViolation {
                            msg: format!(
                                "inconsistent discharge depth entering block {succ} ({} vs {})",
                                prev.depth, st.depth
                            ),
                            span: None,
                        });
                    }
                    State {
                        defined: prev.defined.intersection(&st.defined).copied().collect(),
                        depth: prev.depth,
                    }
                }
            };
            if in_state[succ].as_ref() != Some(&merged) {
                in_state[succ] = Some(merged);
                work.push(succ);
            }
        }
    }
    Ok(())
}

fn check_uses(operands: &[Operand], skip: usize, st: &State) -> Result<(), IrError> {
    for op in operands.iter().skip(skip) {
        if let Operand::Var(v) = op {
            if !st.defined.contains(v) {
                return Err(IrError::UndefinedVar(*v));
            }
        }
    }
    Ok(())
}

fn check_terminator_uses(t: &Terminator, st: &State) -> Result<(), IrError> {
    match t {
        Terminator::Branch { cond, .. } => check_uses(std::slice::from_ref(cond), 0, st),
        Terminator::Return(Some(v)) => check_uses(std::slice::from_ref(v), 0, st),
        _ => Ok(()),
    }
}

fn check_instr(
    module: &Module,
    _func: &Function,
    instr: &Instr,
    st: &mut State,
) -> Result<(), IrError> {
    // `StoreLocal [Var(slot), value]` *defines* `slot`; its first operand is a
    // write target, not a use.
    let store_target = match (&instr.opcode, instr.operands.first()) {
        (Opcode::StoreLocal, Some(Operand::Var(slot))) => Some(*slot),
        _ => None,
    };
    check_uses(&instr.operands, usize::from(store_target.is_some()), st)?;

    for op in &instr.operands {
        match op {
            Operand::String(i) if *i >= module.strings.len() => {
                return Err(cf_err(format!(
                    "string pool index {i} out of range ({} strings)",
                    module.strings.len()
                )));
            }
            Operand::Func(f) if *f >= module.functions.len() => {
                return Err(cf_err(format!("function index {f} out of range")));
            }
            _ => {}
        }
    }

    match instr.opcode {
        Opcode::Add
        | Opcode::Sub
        | Opcode::Mul
        | Opcode::Div
        | Opcode::Rem
        | Opcode::Eq
        | Opcode::NotEq
        | Opcode::Lt
        | Opcode::Gt
        | Opcode::LtEq
        | Opcode::GtEq
        | Opcode::BitAnd
        | Opcode::BitOr
        | Opcode::BitXor
        | Opcode::Shl
        | Opcode::Shr => verify_binary_op(instr)?,
        Opcode::Call => match instr.operands.first() {
            Some(Operand::Func(f)) => {
                let callee = &module.functions[*f];
                let argc = instr.operands.len() - 1;
                if argc != callee.params.len() {
                    return Err(cf_err(format!(
                        "call to `{}` passes {} argument(s), expects {}",
                        callee.name,
                        argc,
                        callee.params.len()
                    )));
                }
            }
            _ => return Err(cf_err("Call must target a function (Operand::Func)")),
        },
        Opcode::Perform if st.depth == 0 => {
            return Err(IrError::EffectViolation {
                msg: "Perform instruction outside of a Discharge context".into(),
                span: instr.span,
            });
        }
        Opcode::Discharge => st.depth += 1,
        Opcode::DischargeEnd => {
            if st.depth == 0 {
                return Err(IrError::EffectViolation {
                    msg: "DischargeEnd without an open Discharge".into(),
                    span: instr.span,
                });
            }
            st.depth -= 1;
        }
        _ => {}
    }

    if let Some(dest) = instr.dest {
        st.defined.insert(dest);
    }
    if let Some(slot) = store_target {
        st.defined.insert(slot);
    }
    Ok(())
}

fn verify_binary_op(instr: &Instr) -> Result<(), IrError> {
    if instr.operands.len() < 2 {
        return Err(IrError::TypeMismatch {
            expected: "two operands".into(),
            found: format!("{}", instr.operands.len()),
            span: instr.span,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(f: &Function) -> Result<(), IrError> {
        let mut m = Module::new();
        m.add_function(f.clone());
        verify(&m)
    }

    fn func_with(params: usize, instrs: Vec<Instr>) -> Function {
        let mut f = Function::new("t".into(), (0..params).collect(), IrType::Void);
        f.max_locals = 8;
        for i in instrs {
            f.push_instr(0, i);
        }
        f
    }
    fn store(slot: VarId) -> Instr {
        Instr::new(
            Opcode::StoreLocal,
            None,
            vec![Operand::Var(slot), Operand::Int(1)],
        )
    }
    fn load(slot: VarId) -> Instr {
        Instr::new(Opcode::LoadLocal, None, vec![Operand::Var(slot)])
    }
    fn instr(op: Opcode) -> Instr {
        Instr::new(op, None, vec![])
    }

    #[test]
    fn store_then_load_is_valid() {
        assert!(check(&func_with(0, vec![store(0), load(0)])).is_ok());
    }

    #[test]
    fn load_before_store_is_rejected() {
        let r = check(&func_with(0, vec![load(0), store(0)]));
        assert!(matches!(r, Err(IrError::UndefinedVar(0))));
    }

    #[test]
    fn parameters_are_defined_on_entry() {
        assert!(check(&func_with(2, vec![load(0), load(1)])).is_ok());
    }

    #[test]
    fn load_of_never_defined_slot_is_rejected() {
        let r = check(&func_with(1, vec![load(5)]));
        assert!(matches!(r, Err(IrError::UndefinedVar(5))));
    }

    #[test]
    fn definitions_carry_across_blocks() {
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.max_locals = 8;
        f.push_instr(0, store(0));
        let b1 = f.add_block();
        f.push_instr(b1, load(0));
        f.set_terminator(0, Terminator::Jump(b1));
        assert!(check(&f).is_ok());
    }

    #[test]
    fn a_definition_on_only_one_branch_is_rejected_at_the_join() {
        // b0: branch -> b1 (defines r1) | b2 (does not); b3 reads r1
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.max_locals = 8;
        f.push_instr(0, store(0));
        let (b1, b2, b3) = (f.add_block(), f.add_block(), f.add_block());
        f.set_terminator(
            0,
            Terminator::Branch {
                cond: Operand::Var(0),
                then_block: b1,
                else_block: b2,
            },
        );
        f.push_instr(b1, store(1));
        f.set_terminator(b1, Terminator::Jump(b3));
        f.set_terminator(b2, Terminator::Jump(b3));
        f.push_instr(b3, load(1));
        assert!(matches!(check(&f), Err(IrError::UndefinedVar(1))));
    }

    #[test]
    fn a_definition_on_both_branches_is_accepted_at_the_join() {
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.max_locals = 8;
        f.push_instr(0, store(0));
        let (b1, b2, b3) = (f.add_block(), f.add_block(), f.add_block());
        f.set_terminator(
            0,
            Terminator::Branch {
                cond: Operand::Var(0),
                then_block: b1,
                else_block: b2,
            },
        );
        f.push_instr(b1, store(1));
        f.push_instr(b2, store(1));
        f.set_terminator(b1, Terminator::Jump(b3));
        f.set_terminator(b2, Terminator::Jump(b3));
        f.push_instr(b3, load(1));
        assert!(check(&f).is_ok());
    }

    #[test]
    fn perform_requires_an_open_discharge() {
        let perform = Instr::new(Opcode::Perform, None, vec![Operand::String(0)]);
        let mut m = Module::new();
        m.intern("effect");
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.push_instr(0, perform.clone());
        m.add_function(f);
        assert!(matches!(verify(&m), Err(IrError::EffectViolation { .. })));

        let mut m = Module::new();
        m.intern("effect");
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.push_instr(0, instr(Opcode::Discharge));
        f.push_instr(0, perform);
        f.push_instr(0, instr(Opcode::DischargeEnd));
        m.add_function(f);
        assert!(verify(&m).is_ok());
    }

    #[test]
    fn perform_after_discharge_end_is_rejected_even_in_the_same_block() {
        let mut m = Module::new();
        m.intern("effect");
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.push_instr(0, instr(Opcode::Discharge));
        f.push_instr(0, instr(Opcode::DischargeEnd));
        f.push_instr(
            0,
            Instr::new(Opcode::Perform, None, vec![Operand::String(0)]),
        );
        m.add_function(f);
        assert!(matches!(verify(&m), Err(IrError::EffectViolation { .. })));
    }

    #[test]
    fn perform_in_a_later_block_of_the_same_discharge_scope_is_accepted() {
        let mut m = Module::new();
        m.intern("effect");
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.push_instr(0, instr(Opcode::Discharge));
        let b1 = f.add_block();
        f.set_terminator(0, Terminator::Jump(b1));
        f.push_instr(
            b1,
            Instr::new(Opcode::Perform, None, vec![Operand::String(0)]),
        );
        f.push_instr(b1, instr(Opcode::DischargeEnd));
        m.add_function(f);
        assert!(verify(&m).is_ok());
    }

    #[test]
    fn paths_that_disagree_on_discharge_depth_are_rejected() {
        // b0 branches; b1 opens a scope, b2 does not; both join at b3
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.max_locals = 8;
        f.push_instr(0, store(0));
        let (b1, b2, b3) = (f.add_block(), f.add_block(), f.add_block());
        f.set_terminator(
            0,
            Terminator::Branch {
                cond: Operand::Var(0),
                then_block: b1,
                else_block: b2,
            },
        );
        f.push_instr(b1, instr(Opcode::Discharge));
        f.set_terminator(b1, Terminator::Jump(b3));
        f.set_terminator(b2, Terminator::Jump(b3));
        assert!(matches!(check(&f), Err(IrError::EffectViolation { .. })));
    }

    #[test]
    fn discharge_end_without_discharge_is_rejected() {
        assert!(matches!(
            check(&func_with(0, vec![instr(Opcode::DischargeEnd)])),
            Err(IrError::EffectViolation { .. })
        ));
    }

    #[test]
    fn out_of_range_string_and_function_indices_are_rejected() {
        let c = Instr::new(Opcode::Const, Some(0), vec![Operand::String(3)]);
        assert!(check(&func_with(0, vec![c])).is_err());
        let call = Instr::new(Opcode::Call, Some(0), vec![Operand::Func(9)]);
        assert!(check(&func_with(0, vec![call])).is_err());
    }

    #[test]
    fn call_arity_is_checked() {
        let mut m = Module::new();
        m.add_function(Function::new("callee".into(), vec![0, 1], IrType::Void));
        let mut f = Function::new("caller".into(), vec![], IrType::Void);
        f.push_instr(
            0,
            Instr::new(
                Opcode::Call,
                Some(0),
                vec![Operand::Func(0), Operand::Int(1)],
            ),
        );
        m.add_function(f);
        assert!(verify(&m).is_err(), "1 argument for a 2-parameter callee");
    }

    #[test]
    fn return_and_branch_operands_must_be_defined() {
        let mut f = func_with(0, vec![]);
        f.set_terminator(0, Terminator::Return(Some(Operand::Var(4))));
        assert!(matches!(check(&f), Err(IrError::UndefinedVar(4))));
    }
}

#[cfg(test)]
mod range_tests {
    use super::*;

    #[test]
    fn registers_beyond_max_locals_are_rejected() {
        let mut m = Module::new();
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.max_locals = 1;
        f.push_instr(0, Instr::new(Opcode::Const, Some(5), vec![Operand::Int(1)]));
        m.add_function(f);
        assert!(verify(&m).is_err());
    }
}
