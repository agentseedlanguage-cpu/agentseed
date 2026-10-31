#!/usr/bin/env python3
"""Fail if a Rust source file is not reachable from its crate root via `mod` declarations.

Rationale (ADR-017): files that exist on disk but are never declared are silently
excluded from compilation and testing. Seven such files (~1,100 lines) went unnoticed.
Usage: scripts/check_dead_modules.py [crate_dir ...]   (default: every crate with src/)
Exit status 1 and a list of offending files on failure.
"""
import re, sys, pathlib

MOD_RE = re.compile(r'^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;', re.M)
ROOTS = ("lib.rs", "main.rs")

def declared(file: pathlib.Path):
    """Yield child module files declared by `mod name;` inside `file`."""
    base = file.parent if file.name in ROOTS + ("mod.rs",) else file.parent / file.stem
    for name in MOD_RE.findall(file.read_text(encoding="utf-8", errors="replace")):
        for cand in (base / f"{name}.rs", base / name / "mod.rs"):
            if cand.exists():
                yield cand
                break

def reachable(src: pathlib.Path):
    seen, stack = set(), [src / r for r in ROOTS if (src / r).exists()]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        stack.extend(declared(f))
    return seen

def main(argv):
    crates = [pathlib.Path(a) for a in argv] or sorted(p.parent for p in pathlib.Path(".").glob("*/Cargo.toml"))
    bad = []
    for crate in crates:
        src = crate / "src"
        if not src.is_dir():
            continue
        ok = reachable(src)
        for f in sorted(src.rglob("*.rs")):
            if f not in ok:
                bad.append(f)
    if bad:
        print("Unreachable (never compiled) source files:")
        for f in bad:
            print(f"  {f}")
        return 1
    print("ok: every source file is reachable from a crate root")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
