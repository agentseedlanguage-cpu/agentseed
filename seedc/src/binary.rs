//! Binary serialization for AGENT‑SEED v15.2 IR modules.
//!
//! Produces the `.aslb` binary format using `bincode`.
//! The format is versioned and checksummed for integrity.

use crate::ir::Module;
use serde::{Deserialize, Serialize};

/// Magic bytes for `.aslb` files: "\0aslb"
pub const MAGIC: [u8; 4] = [0x00, b'a', b's', b'l'];
/// Current format version (major.minor).
pub const VERSION: (u32, u32) = (15, 3);

/// Serialized size of [`Header`] (4 + 4 + 4 + 4 + 8). Pinned by a test; do not
/// use `size_of::<Header>()`, which is the in-memory layout, not the wire size.
const HEADER_LEN: usize = 24;

/// Oldest minor version this reader accepts. 15.3 added the string pool.
const MIN_MINOR: u32 = 3;

/// The header written at the beginning of every `.aslb` file.
#[derive(Serialize, Deserialize)]
struct Header {
    magic: [u8; 4],
    version_major: u32,
    version_minor: u32,
    checksum: u32, // CRC32 of the module payload
    module_size: u64,
}

/// Serialize a module to a vector of bytes.
pub fn serialize(module: &Module) -> Result<Vec<u8>, IrError> {
    let payload = bincode::serialize(module).map_err(|e| IrError::ControlFlowError {
        msg: format!("Serialization error: {e}"),
        span: None,
    })?;
    let checksum = crc32fast::hash(&payload);
    let header = Header {
        magic: MAGIC,
        version_major: VERSION.0,
        version_minor: VERSION.1,
        checksum,
        module_size: payload.len() as u64,
    };
    let mut out = Vec::new();
    out.extend(
        bincode::serialize(&header).map_err(|e| IrError::ControlFlowError {
            msg: format!("Header serialization error: {e}"),
            span: None,
        })?,
    );
    out.extend(payload);
    Ok(out)
}

/// Deserialize a module from bytes.
pub fn deserialize(data: &[u8]) -> Result<Module, IrError> {
    if data.len() < HEADER_LEN {
        return Err(IrError::ControlFlowError {
            msg: "File too small".into(),
            span: None,
        });
    }
    let header: Header =
        bincode::deserialize(&data[..HEADER_LEN]).map_err(|e| IrError::ControlFlowError {
            msg: format!("Header deserialization error: {e}"),
            span: None,
        })?;
    if header.magic != MAGIC {
        return Err(IrError::ControlFlowError {
            msg: "Invalid magic bytes".into(),
            span: None,
        });
    }
    if header.version_major != VERSION.0 {
        return Err(IrError::ControlFlowError {
            msg: format!("Unsupported major version: {}", header.version_major),
            span: None,
        });
    }
    if header.version_minor < MIN_MINOR {
        return Err(IrError::ControlFlowError {
            msg: format!(
                "Unsupported format {}.{} (need >= {}.{}); recompile the source",
                header.version_major, header.version_minor, VERSION.0, MIN_MINOR
            ),
            span: None,
        });
    }
    let payload = &data[HEADER_LEN..];
    let checksum = crc32fast::hash(payload);
    if checksum != header.checksum {
        return Err(IrError::ControlFlowError {
            msg: "Checksum mismatch".into(),
            span: None,
        });
    }
    bincode::deserialize(payload).map_err(|e| IrError::ControlFlowError {
        msg: format!("Deserialization error: {e}"),
        span: None,
    })
}

// Re‑export IrError from ir.rs for convenience
use crate::ir::IrError;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{Function, IrType};

    #[test]
    fn test_roundtrip() {
        let mut module = Module::new();
        let f = Function::new("test".into(), vec![0], IrType::I32);
        module.add_function(f);
        let data = serialize(&module).unwrap();
        let module2 = deserialize(&data).unwrap();
        assert_eq!(module2.functions.len(), 1);
        assert_eq!(module2.functions[0].name, "test");
    }

    #[test]
    fn string_pool_roundtrips() {
        let mut module = Module::new();
        let a = module.intern("hello");
        let b = module.intern("world");
        assert_eq!(module.intern("hello"), a, "interning deduplicates");
        let m2 = deserialize(&serialize(&module).unwrap()).unwrap();
        assert_eq!(m2.string(a), Some("hello"));
        assert_eq!(m2.string(b), Some("world"));
    }

    #[test]
    fn header_len_matches_wire_size() {
        let h = Header {
            magic: MAGIC,
            version_major: 0,
            version_minor: 0,
            checksum: 0,
            module_size: 0,
        };
        assert_eq!(bincode::serialize(&h).unwrap().len(), HEADER_LEN);
    }

    #[test]
    fn older_minor_version_is_rejected() {
        let data = serialize(&Module::new()).unwrap();
        // patch version_minor (bytes 8..12) down to 2
        let mut old = data.clone();
        old[8..12].copy_from_slice(&2u32.to_le_bytes());
        assert!(deserialize(&old).is_err());
    }
}
