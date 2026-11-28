#![allow(clippy::all)]
#![allow(unused)]
pub mod bi_temporal;
pub mod capability;
pub mod choreographic;
pub mod computation;
pub mod datalog;
pub mod executor;
pub mod inference;
pub mod memory;
pub mod orchestrator;
pub mod proof_strength;
pub mod protocols;
pub mod rng;
pub mod sanitize;
pub mod schedule;
pub mod state;
pub mod taint;
pub mod tee;
pub mod trace_events;
pub mod uncertain_kind;
pub mod uncertainty;
pub mod value;

use seedc::ir::Module;
use std::path::Path;

pub use state::VMState;

/// Run a compiled .aslb file from disk, returning the final VM state.
pub fn run_file(path: &Path, seed: u64) -> miette::Result<VMState> {
    let data = std::fs::read(path)
        .map_err(|e| miette::miette!("I/O error reading {}: {}", path.display(), e))?;
    run_bytes(&data, seed)
}

/// Run a compiled .aslb module from bytes, returning the final VM state.
pub fn run_bytes(data: &[u8], seed: u64) -> miette::Result<VMState> {
    let module: Module = seedc::binary::deserialize(data)
        .map_err(|e| miette::miette!("Deserialisation error: {}", e))?;
    // `.aslb` input is untrusted: verify before executing.
    seedc::ir::verify(&module).map_err(|e| miette::miette!("IR verification failed: {}", e))?;
    let mut vm = executor::VM::new(module, seed);
    vm.run()?;
    Ok(vm.state)
}
