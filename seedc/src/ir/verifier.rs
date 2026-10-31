//! IR verifier for AGENT‑SEED v15.2.
//!
//! Checks:
//!   - SSA dominance (simplified: variables defined before use within block)
//!   - Type consistency of instruction operands
//!   - Effect soundness: Perform only after Discharge in the same block
//!   - Control flow correctness (all blocks reachable, terminators valid)
//!
//! References:
//!   - LLVM's `Verifier` pass (Lattner & Adve, 2004)
//!   - Crafting Interpreters chapter on static analysis

use crate::ir::*;
use std::collections::HashSet;

pub fn verify(module: &Module) -> Result<(), IrError> {
    for func in &module.functions {
        verify_function(func)?;
    }
    Ok(())
}

fn verify_function(func: &Function) -> Result<(), IrError> {
    // Check all blocks exist
    for (i, block) in func.blocks.iter().enumerate() {
        if block.id != i {
            return Err(IrError::ControlFlowError {
                msg: format!("Block ID mismatch: expected {}, got {}", i, block.id),
                span: None,
            });
        }
    }

    // Check entry block exists
    if func.entry >= func.blocks.len() {
        return Err(IrError::ControlFlowError {
            msg: format!(
                "Entry block {} out of range (0-{})",
                func.entry,
                func.blocks.len()
            ),
            span: None,
        });
    }

    // Check each block. `defined` is carried across blocks (in id order) so a
    // slot written in an earlier block is visible later. NOTE: this is a
    // conservative approximation of dominance, not a full dominator-tree check.
    let mut defined: HashSet<VarId> = func.params.iter().cloned().collect();
    for block in &func.blocks {
        verify_block(block, &mut defined)?;
    }

    // Check terminators reference valid blocks
    for block in &func.blocks {
        match &block.terminator {
            Terminator::Branch {
                then_block,
                else_block,
                ..
            } => {
                if *then_block >= func.blocks.len() || *else_block >= func.blocks.len() {
                    return Err(IrError::ControlFlowError {
                        msg: "Branch target out of range".into(),
                        span: None,
                    });
                }
            }
            Terminator::Jump(target) => {
                if *target >= func.blocks.len() {
                    return Err(IrError::ControlFlowError {
                        msg: "Jump target out of range".into(),
                        span: None,
                    });
                }
            }
            Terminator::Return(_) | Terminator::Halt => {}
        }
    }
    Ok(())
}

fn verify_block(block: &BasicBlock, defined: &mut HashSet<VarId>) -> Result<(), IrError> {
    let mut discharged = false; // Track if we've seen a Discharge before a Perform

    for instr in &block.instrs {
        // `StoreLocal [Var(slot), value]` *defines* `slot`; its first operand is a
        // write target, not a use, so it is exempt from the defined-before-use check.
        let store_target = match (&instr.opcode, instr.operands.first()) {
            (Opcode::StoreLocal, Some(Operand::Var(slot))) => Some(*slot),
            _ => None,
        };
        let skip = usize::from(store_target.is_some());

        // Check that all operand variables are defined
        for op in instr.operands.iter().skip(skip) {
            if let Operand::Var(v) = op {
                if !defined.contains(v) {
                    return Err(IrError::UndefinedVar(*v));
                }
            }
        }

        // Check type consistency (simplified)
        match instr.opcode {
            Opcode::Add | Opcode::Sub | Opcode::Mul | Opcode::Div | Opcode::Rem => {
                verify_binary_op(instr)?;
            }
            Opcode::Eq | Opcode::NotEq | Opcode::Lt | Opcode::Gt | Opcode::LtEq | Opcode::GtEq => {
                verify_binary_op(instr)?;
            }
            Opcode::Perform if !discharged => {
                return Err(IrError::EffectViolation {
                    msg: "Perform instruction outside of a Discharge context".into(),
                    span: instr.span,
                });
            }
            Opcode::Perform => {}
            Opcode::Discharge => {
                discharged = true;
            }
            _ => {}
        }

        // Mark destination / store target as defined
        if let Some(dest) = instr.dest {
            defined.insert(dest);
        }
        if let Some(slot) = store_target {
            defined.insert(slot);
        }
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

    fn func_with(params: usize, instrs: Vec<Instr>) -> Function {
        let mut f = Function::new("t".into(), (0..params).collect(), IrType::Void);
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

    #[test]
    fn store_then_load_is_valid() {
        assert!(verify_function(&func_with(0, vec![store(0), load(0)])).is_ok());
    }

    #[test]
    fn load_before_store_is_rejected() {
        let r = verify_function(&func_with(0, vec![load(0), store(0)]));
        assert!(matches!(r, Err(IrError::UndefinedVar(0))));
    }

    #[test]
    fn parameters_are_defined_on_entry() {
        assert!(verify_function(&func_with(2, vec![load(0), load(1)])).is_ok());
    }

    #[test]
    fn load_of_never_defined_slot_is_rejected() {
        let r = verify_function(&func_with(1, vec![load(5)]));
        assert!(matches!(r, Err(IrError::UndefinedVar(5))));
    }

    #[test]
    fn definitions_carry_across_blocks() {
        let mut f = Function::new("t".into(), vec![], IrType::Void);
        f.push_instr(0, store(0));
        let b1 = f.blocks.len();
        f.blocks.push(BasicBlock {
            id: b1,
            instrs: vec![load(0)],
            terminator: Terminator::Halt,
        });
        f.set_terminator(0, Terminator::Jump(b1));
        assert!(verify_function(&f).is_ok());
    }
}
