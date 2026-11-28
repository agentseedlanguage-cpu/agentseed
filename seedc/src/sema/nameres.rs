use crate::ast::*;
use crate::sema::TypeError;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DefId(pub usize);

#[derive(Debug, Clone, Default)]
struct Scope {
    values: HashMap<String, DefId>,
    types: HashMap<String, DefId>,
    effects: HashMap<String, DefId>,
}

/// Kept for diagnostics (go-to-definition, duplicate-definition errors).
#[allow(dead_code)]
#[derive(Debug, Clone)]
struct Definition {
    name: String,
    kind: DefKind,
    span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DefKind {
    Variable,
    Function,
    Type,
    Effect,
    Agent,
    Section,
}

pub struct Resolver {
    scopes: Vec<Scope>,
    definitions: Vec<Definition>,
    next_id: usize,
    errors: Vec<TypeError>,
}

impl Resolver {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        let mut resolver = Self {
            scopes: vec![Scope::default()],
            definitions: Vec::new(),
            next_id: 0,
            errors: Vec::new(),
        };
        for name in &[
            "bool", "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "f32", "f64", "char",
            "string", "Self",
        ] {
            resolver.define_type(name, DefKind::Type, SourceSpan::new(0.into(), 0));
        }
        for name in &["network", "fileio", "inference", "spawn", "decision"] {
            resolver.define_effect(name, SourceSpan::new(0.into(), 0));
        }
        resolver
    }

    fn alloc_id(&mut self) -> DefId {
        let id = DefId(self.next_id);
        self.next_id += 1;
        id
    }
    fn define_value(&mut self, name: &str, kind: DefKind, span: SourceSpan) -> DefId {
        let id = self.alloc_id();
        self.scopes
            .last_mut()
            .unwrap()
            .values
            .insert(name.to_string(), id);
        self.definitions.push(Definition {
            name: name.to_string(),
            kind,
            span,
        });
        id
    }
    fn define_type(&mut self, name: &str, kind: DefKind, span: SourceSpan) -> DefId {
        let id = self.alloc_id();
        self.scopes
            .last_mut()
            .unwrap()
            .types
            .insert(name.to_string(), id);
        self.definitions.push(Definition {
            name: name.to_string(),
            kind,
            span,
        });
        id
    }
    fn define_effect(&mut self, name: &str, span: SourceSpan) -> DefId {
        let id = self.alloc_id();
        self.scopes
            .last_mut()
            .unwrap()
            .effects
            .insert(name.to_string(), id);
        self.definitions.push(Definition {
            name: name.to_string(),
            kind: DefKind::Effect,
            span,
        });
        id
    }
    fn lookup_value(&self, name: &str) -> Option<DefId> {
        self.scopes
            .iter()
            .rev()
            .find_map(|s| s.values.get(name).copied())
    }
    // Type/effect-name resolution lands with typeck wiring (CP5).
    #[allow(dead_code)]
    fn lookup_type(&self, name: &str) -> Option<DefId> {
        self.scopes
            .iter()
            .rev()
            .find_map(|s| s.types.get(name).copied())
    }
    #[allow(dead_code)]
    fn lookup_effect(&self, name: &str) -> Option<DefId> {
        self.scopes
            .iter()
            .rev()
            .find_map(|s| s.effects.get(name).copied())
    }
    fn push_scope(&mut self) {
        self.scopes.push(Scope::default());
    }
    fn pop_scope(&mut self) {
        self.scopes.pop();
    }

    /// Resolve every name in `program`.
    ///
    /// Two passes: first every top-level item is *declared* (so functions may
    /// be used before their definition and may recurse), then bodies are
    /// resolved. Errors are collected; the first is returned.
    pub fn resolve(mut self, program: Program) -> Result<Program, TypeError> {
        // Built-in functions.
        self.define_value("print", DefKind::Function, SourceSpan::new(0.into(), 0));
        for item in &program.items {
            self.declare_top_level(item);
        }
        for item in &program.items {
            self.resolve_top_level(item);
        }
        if !self.errors.is_empty() {
            return Err(self.errors.remove(0));
        }
        Ok(program)
    }

    /// Pass 1: introduce names.
    fn declare_top_level(&mut self, item: &TopLevelItem) {
        match item {
            TopLevelItem::Agent(a) => {
                self.define_type(&a.name.name, DefKind::Agent, a.name.span);
            }
            TopLevelItem::Section(s) => {
                self.define_type(&s.name.name, DefKind::Section, s.name.span);
            }
            TopLevelItem::Fn(f) => {
                self.define_value(&f.name.name, DefKind::Function, f.name.span);
            }
            TopLevelItem::Seed(s) => {
                for sec in &s.sections {
                    self.define_type(&sec.name.name, DefKind::Section, sec.name.span);
                }
            }
            TopLevelItem::Struct(s) => {
                self.define_type(&s.name.name, DefKind::Type, s.name.span);
            }
            TopLevelItem::Enum(e) => {
                self.define_type(&e.name.name, DefKind::Type, e.name.span);
            }
            TopLevelItem::Effect(e) => {
                self.define_effect(&e.name.name, e.name.span);
            }
            TopLevelItem::Mod(m) => {
                if let Some(items) = &m.items {
                    for i in items {
                        self.declare_top_level(i);
                    }
                }
            }
            _ => {}
        }
    }

    /// Pass 2: resolve bodies.
    fn resolve_top_level(&mut self, item: &TopLevelItem) {
        match item {
            TopLevelItem::Fn(f) => self.resolve_fn(f, &[]),
            TopLevelItem::Agent(a) => {
                // Bare field names are in scope inside methods, as is `self`.
                let fields: Vec<(String, SourceSpan)> = a
                    .members
                    .iter()
                    .filter_map(|m| match m {
                        AgentMember::Field(f) => Some((f.name.name.clone(), f.name.span)),
                        _ => None,
                    })
                    .collect();
                for m in &a.members {
                    if let AgentMember::Method(f) = m {
                        self.resolve_fn(f, &fields);
                    }
                }
            }
            TopLevelItem::Mod(m) => {
                self.push_scope();
                if let Some(items) = &m.items {
                    for i in items {
                        self.resolve_top_level(i);
                    }
                }
                self.pop_scope();
            }
            TopLevelItem::Expression(e) => {
                self.resolve_expr(e);
            }
            TopLevelItem::Use(u) => {
                let _ = self.resolve_use(u);
            }
            _ => {}
        }
    }

    fn resolve_fn(&mut self, f: &FnDecl, extra_values: &[(String, SourceSpan)]) {
        self.push_scope();
        if !extra_values.is_empty() {
            self.define_value("self", DefKind::Variable, f.span);
            for (name, span) in extra_values {
                self.define_value(name, DefKind::Variable, *span);
            }
        }
        for p in &f.params {
            self.define_value(&p.name.name, DefKind::Variable, p.name.span);
        }
        if let Some(body) = &f.body {
            self.resolve_block(body);
        }
        self.pop_scope();
    }

    fn resolve_block(&mut self, block: &BlockExpr) {
        self.push_scope();
        for stmt in &block.stmts {
            self.resolve_stmt(stmt);
        }
        if let Some(last) = &block.last {
            self.resolve_expr(last);
        }
        self.pop_scope();
    }

    fn resolve_stmt(&mut self, stmt: &Stmt) {
        match stmt {
            Stmt::Let(l) => self.resolve_let(l),
            Stmt::Expr(e) => self.resolve_expr(e),
            Stmt::Return(r) => {
                if let Some(e) = &r.expr {
                    self.resolve_expr(e);
                }
            }
            Stmt::Break(b) => {
                if let Some(e) = &b.expr {
                    self.resolve_expr(e);
                }
            }
            Stmt::Continue(_) => {}
            Stmt::Item(TopLevelItem::Expression(e)) => self.resolve_expr(e),
            Stmt::Item(_) => {}
        }
    }

    /// The initialiser is resolved *before* the pattern binds, so
    /// `let x = x + 1` refers to the previous `x`.
    fn resolve_let(&mut self, l: &LetStmt) {
        self.resolve_expr(&l.init);
        self.bind_pattern(&l.pattern);
    }

    fn bind_pattern(&mut self, pat: &Pattern) {
        match &pat.kind {
            PatternKind::Binding(id, sub) => {
                self.define_value(&id.name, DefKind::Variable, id.span);
                if let Some(p) = sub {
                    self.bind_pattern(p);
                }
            }
            PatternKind::Tuple(ps) | PatternKind::Or(ps) => {
                for p in ps {
                    self.bind_pattern(p);
                }
            }
            PatternKind::Struct(_, fields) => {
                for (_, p) in fields {
                    self.bind_pattern(p);
                }
            }
            PatternKind::EnumVariant(_, _, Some(ps)) => {
                for p in ps {
                    self.bind_pattern(p);
                }
            }
            _ => {}
        }
    }

    fn use_name(&mut self, id: &Ident) {
        if self.lookup_value(&id.name).is_none() {
            self.errors.push(TypeError::UnresolvedName {
                name: id.name.clone(),
                span: id.span,
            });
        }
    }

    fn resolve_if(&mut self, i: &IfExpr) {
        self.resolve_expr(&i.cond);
        self.resolve_block(&i.then_branch);
        match i.else_branch.as_deref() {
            Some(ElseBranch::Block(b)) => self.resolve_block(b),
            Some(ElseBranch::If(inner)) => self.resolve_if(inner),
            None => {}
        }
    }

    fn resolve_expr(&mut self, expr: &Expr) {
        match &expr.kind {
            ExprKind::Ident(id) => self.use_name(id),
            ExprKind::Call(f, args) => {
                self.resolve_expr(f);
                for a in args {
                    self.resolve_expr(a);
                }
            }
            ExprKind::Method(obj, _, args) => {
                self.resolve_expr(obj);
                for a in args {
                    self.resolve_expr(a);
                }
            }
            ExprKind::Block(b) => self.resolve_block(b),
            ExprKind::If(i) => self.resolve_if(i),
            ExprKind::Match(m) => {
                self.resolve_expr(&m.scrutinee);
                for arm in &m.arms {
                    self.push_scope();
                    self.bind_pattern(&arm.pattern);
                    if let Some(g) = &arm.guard {
                        self.resolve_expr(g);
                    }
                    self.resolve_expr(&arm.body);
                    self.pop_scope();
                }
            }
            ExprKind::Loop(l) => self.resolve_block(&l.body),
            ExprKind::While(w) => {
                self.resolve_expr(&w.cond);
                self.resolve_block(&w.body);
            }
            ExprKind::For(f) => {
                self.resolve_expr(&f.iter);
                self.push_scope();
                self.bind_pattern(&f.pattern);
                self.resolve_block(&f.body);
                self.pop_scope();
            }
            ExprKind::Binary(_, l, r) => {
                self.resolve_expr(l);
                self.resolve_expr(r);
            }
            ExprKind::Unary(_, e)
            | ExprKind::Ask(_, e)
            | ExprKind::Confident(e, _)
            | ExprKind::Think(_, e)
            | ExprKind::Observe(e)
            | ExprKind::Infer(e)
            | ExprKind::Spawn(e)
            | ExprKind::Memo(_, e)
            | ExprKind::Await(e)
            | ExprKind::Cast(e, _)
            | ExprKind::Member(e, _)
            | ExprKind::Field(e, _) => self.resolve_expr(e),
            ExprKind::Index(a, b) | ExprKind::Range(a, _, b) => {
                self.resolve_expr(a);
                self.resolve_expr(b);
            }
            ExprKind::Assignment(t, _, r) => {
                self.resolve_expr(t);
                self.resolve_expr(r);
            }
            ExprKind::Let(l) => self.resolve_let(l),
            ExprKind::Return(e) | ExprKind::Break(e) => {
                if let Some(e) = e {
                    self.resolve_expr(e);
                }
            }
            ExprKind::Discharge(scrutinee, arms) => {
                self.resolve_expr(scrutinee);
                for (_, body) in arms {
                    self.resolve_block(body);
                }
            }
            ExprKind::Perform(_, args, _) => {
                for a in args {
                    self.resolve_expr(a);
                }
            }
            ExprKind::Tuple(es) | ExprKind::Array(es) => {
                for e in es {
                    self.resolve_expr(e);
                }
            }
            // Forms the back end rejects anyway (closures, struct literals,
            // pipelines, ...) are not traversed here.
            _ => {}
        }
    }

    fn resolve_use(&mut self, _use: &UseDecl) -> Result<(), TypeError> {
        Ok(())
    }
}

impl Default for Resolver {
    fn default() -> Self {
        Self::new()
    }
}

pub fn resolve(program: Program) -> Result<Program, TypeError> {
    Resolver::new().resolve(program)
}
