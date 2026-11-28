//! AST → IR lowering.
//!
//! Target: the mutable-register IR of ADR-020. Every `VarId` is a frame
//! register; `let` and assignment write registers with `StoreLocal`, reads go
//! through `LoadLocal`, and control-flow joins communicate through a result
//! register (no phi nodes).
//!
//! The lowerer keeps a **cursor** (`cur` block): expressions are emitted at the
//! cursor, and constructs that create blocks (`if`, loops, `&&`, `match`) move
//! it to their merge block, so code after them lands in the right place.
//!
//! **Fail closed (ADR-030).** A construct this back end cannot lower correctly
//! is reported as a [`LowerDiagnostic`] rather than silently miscompiled;
//! [`lower_checked`] (used by `compile`) turns any diagnostic into an error.

use crate::ast::*;
use crate::ir::*;
use miette::SourceSpan;
use std::collections::HashMap;

/// A construct (or name) the lowerer could not translate faithfully.
#[derive(Debug, Clone)]
pub struct LowerDiagnostic {
    pub message: String,
    pub span: Option<SourceSpan>,
}

/// Best-effort lowering: diagnostics are discarded. Intended for IR-shape tests;
/// the compiler pipeline uses [`lower_checked`].
pub fn lower(program: &Program) -> Module {
    lower_with_diagnostics(program).0
}

/// Lower a program, failing with every diagnostic if anything is unsupported.
pub fn lower_checked(program: &Program) -> Result<Module, Vec<LowerDiagnostic>> {
    let (module, diags) = lower_with_diagnostics(program);
    if diags.is_empty() {
        Ok(module)
    } else {
        Err(diags)
    }
}

fn lower_with_diagnostics(program: &Program) -> (Module, Vec<LowerDiagnostic>) {
    let mut l = Lowerer::new();
    l.lower_program(program);
    (l.module, l.diags)
}

struct LoopCtx {
    continue_to: BlockId,
    break_to: BlockId,
    /// Register receiving `break value` (only `loop` yields a value).
    result: Option<VarId>,
    /// Lowering-time discharge depth at loop entry; `break`/`continue` close
    /// any scopes opened inside the loop before jumping out.
    discharge_depth: u32,
}

struct Lowerer {
    module: Module,
    cur_func: FuncId,
    cur: BlockId,
    /// The cursor block already has a terminator; the next emit opens a dead block.
    terminated: bool,
    scopes: Vec<HashMap<String, VarId>>,
    fn_ids: HashMap<String, FuncId>,
    loops: Vec<LoopCtx>,
    discharge_depth: u32,
    diags: Vec<LowerDiagnostic>,
}

/// A function body queued for lowering after all signatures are known.
enum Body<'a> {
    Decl(&'a FnDecl),
    /// Top-level expressions gathered into a synthetic `main`.
    Main(Vec<&'a Expr>),
}

impl Lowerer {
    fn new() -> Self {
        Self {
            module: Module::new(),
            cur_func: 0,
            cur: 0,
            terminated: false,
            scopes: Vec::new(),
            fn_ids: HashMap::new(),
            loops: Vec::new(),
            discharge_depth: 0,
            diags: Vec::new(),
        }
    }

    // ── diagnostics ──

    fn diag(&mut self, message: impl Into<String>, span: Option<SourceSpan>) {
        self.diags.push(LowerDiagnostic {
            message: message.into(),
            span,
        });
    }

    fn unsupported(&mut self, what: &str, span: SourceSpan) -> Operand {
        self.diag(
            format!("{what} is not supported by the back end yet"),
            Some(span),
        );
        Operand::Null
    }

    // ── program / function structure ──

    fn lower_program(&mut self, program: &Program) {
        // Pass 1: declare every function so calls can resolve (and recurse).
        let mut queue: Vec<(FuncId, Body)> = Vec::new();
        let mut main_exprs: Vec<&Expr> = Vec::new();
        for item in &program.items {
            match item {
                TopLevelItem::Fn(f) => self.declare_fn(&f.name.name, f, &mut queue),
                TopLevelItem::Agent(a) => {
                    for m in &a.members {
                        match m {
                            AgentMember::Method(f) => {
                                let qualified = format!("{}::{}", a.name.name, f.name.name);
                                self.declare_fn(&qualified, f, &mut queue);
                            }
                            AgentMember::Field(_) => {}
                            _ => self.diag(
                                format!(
                                    "agent `{}`: lifecycle/state-machine/signal/clause members are not lowered yet",
                                    a.name.name
                                ),
                                Some(a.span),
                            ),
                        }
                    }
                }
                TopLevelItem::Expression(e) => main_exprs.push(e),
                TopLevelItem::Impl(i) => {
                    self.diag("`impl` blocks are not lowered yet", Some(i.span))
                }
                TopLevelItem::Mod(m) => self.diag("`mod` items are not lowered yet", Some(m.span)),
                TopLevelItem::Handler(_) | TopLevelItem::Clause(..) => {
                    self.diag("handlers and top-level clauses are not lowered yet", None)
                }
                // Pure declarations carry no executable code.
                TopLevelItem::Seed(_)
                | TopLevelItem::Section(_)
                | TopLevelItem::Struct(_)
                | TopLevelItem::Enum(_)
                | TopLevelItem::Trait(_)
                | TopLevelItem::Use(_)
                | TopLevelItem::Extern(_)
                | TopLevelItem::Effect(_) => {}
            }
        }
        if !main_exprs.is_empty() {
            if self.fn_ids.contains_key("main") {
                self.diag(
                    "top-level expressions cannot be combined with `fn main`",
                    None,
                );
            } else {
                let f = Function::new("main".into(), vec![], IrType::Void);
                let id = self.module.add_function(f);
                self.fn_ids.insert("main".into(), id);
                queue.push((id, Body::Main(main_exprs)));
            }
        }
        // Pass 2: lower bodies.
        for (id, body) in queue {
            self.begin_function(id);
            match body {
                Body::Decl(f) => {
                    for (slot, p) in f.params.iter().enumerate() {
                        self.bind(&p.name.name, slot);
                    }
                    let v = match &f.body {
                        Some(b) => self.lower_block(b),
                        None => Operand::Null,
                    };
                    self.terminate(Terminator::Return(Some(v)));
                }
                Body::Main(exprs) => {
                    let mut last = Operand::Null;
                    for e in exprs {
                        last = self.lower_expr(e);
                    }
                    self.terminate(Terminator::Return(Some(last)));
                }
            }
        }
    }

    fn declare_fn<'a>(&mut self, name: &str, f: &'a FnDecl, queue: &mut Vec<(FuncId, Body<'a>)>) {
        if self.fn_ids.contains_key(name) {
            self.diag(format!("function `{name}` is defined twice"), Some(f.span));
            return;
        }
        let ret = match &f.return_ty {
            Some(ty) => self.convert_type(ty),
            None => IrType::Void,
        };
        let func = Function::new(name.to_string(), (0..f.params.len()).collect(), ret);
        let id = self.module.add_function(func);
        self.fn_ids.insert(name.to_string(), id);
        queue.push((id, Body::Decl(f)));
    }

    fn begin_function(&mut self, id: FuncId) {
        self.cur_func = id;
        self.cur = self.module.functions[id].entry;
        self.terminated = false;
        self.scopes.clear();
        self.scopes.push(HashMap::new());
        self.loops.clear();
        self.discharge_depth = 0;
    }

    // ── emission helpers ──

    fn func_mut(&mut self) -> &mut Function {
        &mut self.module.functions[self.cur_func]
    }

    fn new_reg(&mut self) -> VarId {
        self.func_mut().new_var()
    }

    fn new_block(&mut self) -> BlockId {
        self.func_mut().add_block()
    }

    /// Make sure the cursor can accept instructions (dead code after a
    /// terminator goes to a fresh, unreachable block).
    fn open(&mut self) {
        if self.terminated {
            self.cur = self.new_block();
            self.terminated = false;
        }
    }

    fn emit(&mut self, op: Opcode, dest: Option<VarId>, operands: Vec<Operand>) {
        self.open();
        let cur = self.cur;
        self.func_mut()
            .push_instr(cur, Instr::new(op, dest, operands));
    }

    fn emit_val(&mut self, op: Opcode, operands: Vec<Operand>) -> Operand {
        let dest = self.new_reg();
        self.emit(op, Some(dest), operands);
        Operand::Var(dest)
    }

    fn store(&mut self, slot: VarId, value: Operand) {
        self.emit(Opcode::StoreLocal, None, vec![Operand::Var(slot), value]);
    }

    fn terminate(&mut self, t: Terminator) {
        if self.terminated {
            return;
        }
        let cur = self.cur;
        self.func_mut().set_terminator(cur, t);
        self.terminated = true;
    }

    fn switch_to(&mut self, b: BlockId) {
        self.cur = b;
        self.terminated = false;
    }

    // ── scopes ──

    fn bind(&mut self, name: &str, slot: VarId) {
        if self.scopes.is_empty() {
            self.scopes.push(HashMap::new());
        }
        if let Some(inner) = self.scopes.last_mut() {
            inner.insert(name.to_string(), slot);
        }
    }

    fn lookup(&self, name: &str) -> Option<VarId> {
        self.scopes.iter().rev().find_map(|s| s.get(name).copied())
    }

    // ── blocks and statements ──

    fn lower_block(&mut self, block: &BlockExpr) -> Operand {
        self.scopes.push(HashMap::new());
        for stmt in &block.stmts {
            self.lower_stmt(stmt);
        }
        let v = match &block.last {
            Some(e) => self.lower_expr(e),
            None => Operand::Null,
        };
        self.scopes.pop();
        v
    }

    fn lower_stmt(&mut self, stmt: &Stmt) {
        match stmt {
            Stmt::Let(l) => self.lower_let(l),
            Stmt::Expr(e) => {
                self.lower_expr(e);
            }
            Stmt::Return(r) => {
                let v = match &r.expr {
                    Some(e) => self.lower_expr(e),
                    None => Operand::Null,
                };
                self.terminate(Terminator::Return(Some(v)));
            }
            Stmt::Break(b) => self.lower_break(b.expr.as_ref(), b.span),
            Stmt::Continue(c) => self.lower_continue(c.span),
            Stmt::Item(TopLevelItem::Expression(e)) => {
                self.lower_expr(e);
            }
            Stmt::Item(_) => self.diag("nested item declarations are not supported yet", None),
        }
    }

    fn lower_let(&mut self, l: &LetStmt) {
        // Evaluate the initialiser first so `let x = x + 1` sees the outer `x`.
        let val = self.lower_expr(&l.init);
        match &l.pattern.kind {
            PatternKind::Binding(id, None) => {
                let slot = self.new_reg();
                self.store(slot, val);
                self.bind(&id.name, slot);
            }
            PatternKind::Wildcard => {}
            _ => self.diag(
                "destructuring patterns in `let` are not supported yet",
                Some(l.span),
            ),
        }
    }

    // ── expressions ──

    fn lower_expr(&mut self, expr: &Expr) -> Operand {
        let span = expr.span;
        match &expr.kind {
            ExprKind::Lit(lit) => self.lower_literal(lit, span),
            ExprKind::Ident(ident) => self.lower_ident(ident),

            ExprKind::Binary(op, lhs, rhs) => match op {
                BinaryOp::And => self.lower_short_circuit(lhs, rhs, true),
                BinaryOp::Or => self.lower_short_circuit(lhs, rhs, false),
                _ => {
                    let l = self.lower_expr(lhs);
                    let r = self.lower_expr(rhs);
                    let opcode = Self::binary_opcode(*op);
                    self.emit_val(opcode, vec![l, r])
                }
            },

            ExprKind::Unary(op, e) => match op {
                UnaryOp::Neg => {
                    let v = self.lower_expr(e);
                    self.emit_val(Opcode::Sub, vec![Operand::Int(0), v])
                }
                UnaryOp::Not => {
                    let v = self.lower_expr(e);
                    self.emit_val(Opcode::Not, vec![v])
                }
                UnaryOp::BitNot => {
                    let v = self.lower_expr(e);
                    self.emit_val(Opcode::BitXor, vec![v, Operand::Int(-1)])
                }
                _ => self.unsupported("this unary operator", span),
            },

            ExprKind::Call(callee, args) => self.lower_call(callee, args, span),
            ExprKind::Block(b) => self.lower_block(b),
            ExprKind::If(i) => self.lower_if(i),
            ExprKind::Match(m) => self.lower_match(m),
            ExprKind::Loop(l) => self.lower_loop(l),
            ExprKind::While(w) => self.lower_while(w),
            ExprKind::For(f) => self.lower_for(f),

            ExprKind::Return(e) => {
                let v = match e {
                    Some(e) => self.lower_expr(e),
                    None => Operand::Null,
                };
                self.terminate(Terminator::Return(Some(v)));
                Operand::Null
            }
            ExprKind::Break(e) => {
                self.lower_break(e.as_ref(), span);
                Operand::Null
            }
            ExprKind::Continue => {
                self.lower_continue(span);
                Operand::Null
            }
            ExprKind::Let(l) => {
                self.lower_let(l);
                Operand::Null
            }
            ExprKind::Assignment(target, op, rhs) => self.lower_assignment(target, op, rhs, span),

            // ── agent constructs with a defined VM meaning ──
            ExprKind::Discharge(scrutinee, arms) => self.lower_discharge(scrutinee, arms, span),
            ExprKind::Perform(effect, args, _requires) => {
                let name = self.module.intern(&effect.name);
                let mut ops = vec![Operand::String(name)];
                for a in args {
                    let v = self.lower_expr(a);
                    ops.push(v);
                }
                self.emit_val(Opcode::Perform, ops)
            }
            ExprKind::Ask(_, e) => {
                let v = self.lower_expr(e);
                self.emit_val(Opcode::ConfidenceAsk, vec![v])
            }
            ExprKind::Confident(e, level) => {
                let v = self.lower_expr(e);
                let threshold = match level {
                    ConfidenceLevel::High => 0.9,
                    ConfidenceLevel::Medium => 0.75,
                    ConfidenceLevel::Low => 0.5,
                    ConfidenceLevel::Custom(f) => *f,
                };
                self.emit_val(Opcode::ConfidenceGate, vec![Operand::Float(threshold), v])
            }
            ExprKind::Think(depth, e) => {
                let v = self.lower_expr(e);
                let budget = match depth {
                    ThinkDepth::Shallow => 500,
                    ThinkDepth::Medium => 2000,
                    ThinkDepth::Deep => 10000,
                    ThinkDepth::Exhaustive => 50000,
                    ThinkDepth::Budget(n) => *n,
                };
                self.emit_val(Opcode::Infer, vec![Operand::Int(budget as i64), v])
            }
            ExprKind::Observe(e) | ExprKind::Infer(e) => {
                let v = self.lower_expr(e);
                self.emit_val(Opcode::Infer, vec![v])
            }
            ExprKind::Spawn(e) => {
                let v = self.lower_expr(e);
                self.emit_val(Opcode::AgentSpawn, vec![v])
            }
            // Synchronous evaluation is a faithful reading of these until an
            // async runtime exists; memoisation is an optimisation only.
            ExprKind::Memo(_, e) | ExprKind::Await(e) => self.lower_expr(e),

            // ── everything else: fail closed ──
            _ => self.unsupported("this expression form", span),
        }
    }

    fn lower_literal(&mut self, lit: &Literal, span: SourceSpan) -> Operand {
        match lit {
            Literal::Int(v, _) => match i64::try_from(*v) {
                Ok(n) => Operand::Int(n),
                Err(_) => {
                    self.diag("integer literal does not fit in 64 bits", Some(span));
                    Operand::Int(0)
                }
            },
            Literal::Float(v) => Operand::Float(*v),
            Literal::String(s) | Literal::RawString(s) => Operand::String(self.module.intern(s)),
            Literal::Char(c) => Operand::Int(*c as i64),
            Literal::Bool(b) => Operand::Bool(*b),
            Literal::Null => Operand::Null,
        }
    }

    fn lower_ident(&mut self, ident: &Ident) -> Operand {
        match self.lookup(&ident.name) {
            Some(slot) => self.emit_val(Opcode::LoadLocal, vec![Operand::Var(slot)]),
            None => {
                self.diag(
                    format!("unresolved name `{}`", ident.name),
                    Some(ident.span),
                );
                Operand::Null
            }
        }
    }

    fn binary_opcode(op: BinaryOp) -> Opcode {
        match op {
            BinaryOp::Add => Opcode::Add,
            BinaryOp::Sub => Opcode::Sub,
            BinaryOp::Mul => Opcode::Mul,
            BinaryOp::Div => Opcode::Div,
            BinaryOp::Rem => Opcode::Rem,
            BinaryOp::Eq => Opcode::Eq,
            BinaryOp::NotEq => Opcode::NotEq,
            BinaryOp::Lt => Opcode::Lt,
            BinaryOp::Gt => Opcode::Gt,
            BinaryOp::LtEq => Opcode::LtEq,
            BinaryOp::GtEq => Opcode::GtEq,
            BinaryOp::And => Opcode::And,
            BinaryOp::Or => Opcode::Or,
            BinaryOp::BitAnd => Opcode::BitAnd,
            BinaryOp::BitOr => Opcode::BitOr,
            BinaryOp::BitXor => Opcode::BitXor,
            BinaryOp::Shl => Opcode::Shl,
            BinaryOp::Shr => Opcode::Shr,
        }
    }

    /// `a && b` / `a || b` with short-circuit evaluation; the result is a bool.
    fn lower_short_circuit(&mut self, lhs: &Expr, rhs: &Expr, is_and: bool) -> Operand {
        let res = self.new_reg();
        let l = self.lower_expr(lhs);
        let (eval_rhs, skip, merge) = (self.new_block(), self.new_block(), self.new_block());
        // `&&`: truthy lhs → evaluate rhs, else false.  `||`: truthy lhs → true, else rhs.
        let (then_b, else_b) = if is_and {
            (eval_rhs, skip)
        } else {
            (skip, eval_rhs)
        };
        self.terminate(Terminator::Branch {
            cond: l,
            then_block: then_b,
            else_block: else_b,
        });
        self.switch_to(eval_rhs);
        let r = self.lower_expr(rhs);
        let normalised = self.emit_val(
            if is_and { Opcode::And } else { Opcode::Or },
            vec![r, Operand::Bool(is_and)],
        );
        self.store(res, normalised);
        self.terminate(Terminator::Jump(merge));
        self.switch_to(skip);
        self.store(res, Operand::Bool(!is_and));
        self.terminate(Terminator::Jump(merge));
        self.switch_to(merge);
        Operand::Var(res)
    }

    fn lower_call(&mut self, callee: &Expr, args: &[Expr], span: SourceSpan) -> Operand {
        let ExprKind::Ident(id) = &callee.kind else {
            return self.unsupported("calling a non-identifier callee", span);
        };
        if id.name == "print" && self.lookup("print").is_none() {
            let mut ops = Vec::with_capacity(args.len());
            for a in args {
                let v = self.lower_expr(a);
                ops.push(v);
            }
            self.emit(Opcode::Print, None, ops);
            return Operand::Null;
        }
        let Some(fid) = self.fn_ids.get(&id.name).copied() else {
            self.diag(format!("unresolved function `{}`", id.name), Some(id.span));
            return Operand::Null;
        };
        let expected = self.module.functions[fid].params.len();
        if args.len() != expected {
            self.diag(
                format!(
                    "`{}` takes {} argument(s) but {} were given",
                    id.name,
                    expected,
                    args.len()
                ),
                Some(span),
            );
            return Operand::Null;
        }
        let mut ops = vec![Operand::Func(fid)];
        for a in args {
            let v = self.lower_expr(a);
            ops.push(v);
        }
        self.emit_val(Opcode::Call, ops)
    }

    fn lower_assignment(
        &mut self,
        target: &Expr,
        op: &AssignOp,
        rhs: &Expr,
        span: SourceSpan,
    ) -> Operand {
        let ExprKind::Ident(id) = &target.kind else {
            return self.unsupported("assignment to a non-variable", span);
        };
        let Some(slot) = self.lookup(&id.name) else {
            self.diag(
                format!("assignment to unresolved name `{}`", id.name),
                Some(id.span),
            );
            return Operand::Null;
        };
        let value = match op {
            AssignOp::Eq => self.lower_expr(rhs),
            compound => {
                let opcode = match compound {
                    AssignOp::PlusEq => Opcode::Add,
                    AssignOp::MinusEq => Opcode::Sub,
                    AssignOp::StarEq => Opcode::Mul,
                    AssignOp::SlashEq => Opcode::Div,
                    AssignOp::PercentEq => Opcode::Rem,
                    AssignOp::AndEq => Opcode::BitAnd,
                    AssignOp::OrEq => Opcode::BitOr,
                    AssignOp::XorEq => Opcode::BitXor,
                    AssignOp::ShlEq => Opcode::Shl,
                    AssignOp::ShrEq => Opcode::Shr,
                    AssignOp::Eq => unreachable!("handled above"),
                };
                let cur = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(slot)]);
                let r = self.lower_expr(rhs);
                self.emit_val(opcode, vec![cur, r])
            }
        };
        self.store(slot, value);
        Operand::Null
    }

    // ── control flow ──

    fn lower_if(&mut self, i: &IfExpr) -> Operand {
        let res = self.new_reg();
        let cond = self.lower_expr(&i.cond);
        let (tb, eb, mb) = (self.new_block(), self.new_block(), self.new_block());
        self.terminate(Terminator::Branch {
            cond,
            then_block: tb,
            else_block: eb,
        });
        self.switch_to(tb);
        let v = self.lower_block(&i.then_branch);
        self.store(res, v);
        self.terminate(Terminator::Jump(mb));
        self.switch_to(eb);
        let v = match i.else_branch.as_deref() {
            None => Operand::Null,
            Some(ElseBranch::Block(b)) => self.lower_block(b),
            Some(ElseBranch::If(inner)) => self.lower_if(inner),
        };
        self.store(res, v);
        self.terminate(Terminator::Jump(mb));
        self.switch_to(mb);
        Operand::Var(res)
    }

    fn lower_while(&mut self, w: &WhileExpr) -> Operand {
        let (header, body, exit) = (self.new_block(), self.new_block(), self.new_block());
        self.terminate(Terminator::Jump(header));
        self.switch_to(header);
        let cond = self.lower_expr(&w.cond);
        self.terminate(Terminator::Branch {
            cond,
            then_block: body,
            else_block: exit,
        });
        self.loops.push(LoopCtx {
            continue_to: header,
            break_to: exit,
            result: None,
            discharge_depth: self.discharge_depth,
        });
        self.switch_to(body);
        self.lower_block(&w.body);
        self.terminate(Terminator::Jump(header));
        self.loops.pop();
        self.switch_to(exit);
        Operand::Null
    }

    fn lower_loop(&mut self, l: &LoopExpr) -> Operand {
        let res = self.new_reg();
        self.store(res, Operand::Null);
        let (body, exit) = (self.new_block(), self.new_block());
        self.terminate(Terminator::Jump(body));
        self.loops.push(LoopCtx {
            continue_to: body,
            break_to: exit,
            result: Some(res),
            discharge_depth: self.discharge_depth,
        });
        self.switch_to(body);
        self.lower_block(&l.body);
        self.terminate(Terminator::Jump(body));
        self.loops.pop();
        self.switch_to(exit);
        Operand::Var(res)
    }

    /// `for i in a..b` / `a..=b` only; other iterables are rejected.
    fn lower_for(&mut self, f: &ForExpr) -> Operand {
        let ExprKind::Range(start, kind, end) = &f.iter.kind else {
            return self.unsupported("`for` over anything but a range", f.span);
        };
        let PatternKind::Binding(var, None) = &f.pattern.kind else {
            return self.unsupported("a non-identifier `for` pattern", f.span);
        };
        let s = self.lower_expr(start);
        let e = self.lower_expr(end);
        let (ctr, end_reg, var_reg) = (self.new_reg(), self.new_reg(), self.new_reg());
        self.store(ctr, s);
        self.store(end_reg, e);
        let (header, body, step, exit) = (
            self.new_block(),
            self.new_block(),
            self.new_block(),
            self.new_block(),
        );
        self.terminate(Terminator::Jump(header));
        self.switch_to(header);
        let c = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(ctr)]);
        let n = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(end_reg)]);
        let cmp = match kind {
            RangeKind::Exclusive => Opcode::Lt,
            RangeKind::Inclusive => Opcode::LtEq,
        };
        let cond = self.emit_val(cmp, vec![c, n]);
        self.terminate(Terminator::Branch {
            cond,
            then_block: body,
            else_block: exit,
        });
        self.loops.push(LoopCtx {
            continue_to: step,
            break_to: exit,
            result: None,
            discharge_depth: self.discharge_depth,
        });
        self.switch_to(body);
        // The loop variable is a per-iteration copy, so assigning to it in the
        // body cannot disturb the iteration counter.
        let cur = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(ctr)]);
        self.store(var_reg, cur);
        self.scopes.push(HashMap::new());
        self.bind(&var.name, var_reg);
        self.lower_block(&f.body);
        self.scopes.pop();
        self.terminate(Terminator::Jump(step));
        self.loops.pop();
        self.switch_to(step);
        let c = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(ctr)]);
        let next = self.emit_val(Opcode::Add, vec![c, Operand::Int(1)]);
        self.store(ctr, next);
        self.terminate(Terminator::Jump(header));
        self.switch_to(exit);
        Operand::Null
    }

    fn close_discharges_to(&mut self, target_depth: u32) {
        let open = self.discharge_depth.saturating_sub(target_depth);
        for _ in 0..open {
            self.emit(Opcode::DischargeEnd, None, vec![]);
        }
    }

    fn lower_break(&mut self, value: Option<&Expr>, span: SourceSpan) {
        let Some(ctx) = self.loops.last() else {
            self.diag("`break` outside of a loop", Some(span));
            return;
        };
        let (target, result, depth) = (ctx.break_to, ctx.result, ctx.discharge_depth);
        if let Some(e) = value {
            let v = self.lower_expr(e);
            match result {
                Some(r) => self.store(r, v),
                None => self.diag("`break` with a value is only allowed in `loop`", Some(span)),
            }
        }
        self.close_discharges_to(depth);
        self.terminate(Terminator::Jump(target));
    }

    fn lower_continue(&mut self, span: SourceSpan) {
        let Some(ctx) = self.loops.last() else {
            self.diag("`continue` outside of a loop", Some(span));
            return;
        };
        let (target, depth) = (ctx.continue_to, ctx.discharge_depth);
        self.close_discharges_to(depth);
        self.terminate(Terminator::Jump(target));
    }

    /// `match` over literal, wildcard and identifier patterns (with guards).
    /// A non-exhaustive match traps at run time instead of falling through.
    fn lower_match(&mut self, m: &MatchExpr) -> Operand {
        let scrut_val = self.lower_expr(&m.scrutinee);
        let scrut = self.new_reg();
        self.store(scrut, scrut_val);
        let res = self.new_reg();
        let merge = self.new_block();
        let mut exhaustive = false;
        for arm in &m.arms {
            let next = self.new_block();
            self.scopes.push(HashMap::new());
            let mut unconditional = true;
            match &arm.pattern.kind {
                PatternKind::Wildcard => {}
                PatternKind::Binding(id, None) => {
                    let copy = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(scrut)]);
                    let slot = self.new_reg();
                    self.store(slot, copy);
                    self.bind(&id.name, slot);
                }
                PatternKind::Lit(lit) => {
                    let lit_op = self.lower_literal(lit, arm.span);
                    let s = self.emit_val(Opcode::LoadLocal, vec![Operand::Var(scrut)]);
                    let eq = self.emit_val(Opcode::Eq, vec![s, lit_op]);
                    let body = self.new_block();
                    self.terminate(Terminator::Branch {
                        cond: eq,
                        then_block: body,
                        else_block: next,
                    });
                    self.switch_to(body);
                    unconditional = false;
                }
                _ => {
                    self.diag(
                        "this match pattern is not supported yet (use literals, `_` or a name)",
                        Some(arm.span),
                    );
                }
            }
            if let Some(g) = &arm.guard {
                let gv = self.lower_expr(g);
                let body = self.new_block();
                self.terminate(Terminator::Branch {
                    cond: gv,
                    then_block: body,
                    else_block: next,
                });
                self.switch_to(body);
                unconditional = false;
            }
            let v = self.lower_expr(&arm.body);
            self.store(res, v);
            self.terminate(Terminator::Jump(merge));
            self.scopes.pop();
            self.switch_to(next);
            if unconditional {
                exhaustive = true;
                break;
            }
        }
        if !exhaustive {
            let msg = self.module.intern("non-exhaustive match: no arm matched");
            self.emit(Opcode::Trap, None, vec![Operand::String(msg)]);
            self.terminate(Terminator::Halt);
        }
        self.switch_to(merge);
        Operand::Var(res)
    }

    fn lower_discharge(
        &mut self,
        scrutinee: &Expr,
        arms: &[(Threshold, BlockExpr)],
        span: SourceSpan,
    ) -> Operand {
        if arms.len() != 1 {
            return self.unsupported("`discharge` with several arms", span);
        }
        let val = self.lower_expr(scrutinee);
        let (thr, body) = &arms[0];
        // Fail closed: an unstated threshold only ever tightens the gate.
        let conf = thr.confidence.unwrap_or(1.0);
        let taint = thr.max_taint.unwrap_or(0.0);
        self.emit(
            Opcode::Discharge,
            None,
            vec![val, Operand::Float(conf), Operand::Float(taint)],
        );
        self.discharge_depth += 1;
        let v = self.lower_block(body);
        self.discharge_depth -= 1;
        if !self.terminated {
            self.emit(Opcode::DischargeEnd, None, vec![]);
        }
        v
    }

    fn convert_type(&self, ty: &crate::ast::Type) -> IrType {
        match ty {
            crate::ast::Type::Primitive(p) => match p {
                crate::ast::PrimitiveType::Bool => IrType::Bool,
                crate::ast::PrimitiveType::U8 => IrType::U8,
                crate::ast::PrimitiveType::U16 => IrType::U16,
                crate::ast::PrimitiveType::U32 => IrType::U32,
                crate::ast::PrimitiveType::U64 => IrType::U64,
                crate::ast::PrimitiveType::I8 => IrType::I8,
                crate::ast::PrimitiveType::I16 => IrType::I16,
                crate::ast::PrimitiveType::I32 => IrType::I32,
                crate::ast::PrimitiveType::I64 => IrType::I64,
                crate::ast::PrimitiveType::F32 => IrType::F32,
                crate::ast::PrimitiveType::F64 => IrType::F64,
                crate::ast::PrimitiveType::Char => IrType::Char,
                crate::ast::PrimitiveType::String => IrType::String,
            },
            _ => IrType::Unknown,
        }
    }
}
