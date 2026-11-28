// The Level 4 course, "Agentic AI Architecture": turns training-private/agentic-architecture/part*.mjs and the "course"
// block of the agentic-architecture entry in site/training/catalog.json (ladder.levels) into what build-course.mjs needs.
// It reuses the cyber course's engine copy (cyber-course.mjs engineFiles) with its own storage prefix, health check and wording.
import fs from 'node:fs';
import path from 'node:path';
import { page, esc as xesc } from './training-shell.mjs';
import { fromCompact, slug } from './cyber-course.mjs';
import { engineFiles } from './cyber-course.mjs';

export const ID = 'agentic-architecture';
export const COPY = { noun: 'agent system design', own: 'your own agent system design', doc: 'Your agent system design', file: 'agent-design.md',
  extra: 'A model solution for every lab, and a rubric to mark your own work', labFor: 'Build your own agent system design', store: 'iwa-course-code', sysEx: 'e.g. Doubles-to-Go order-issue assistant',
  tools: [['course/lab/rules/', 'Rules checker'], ['course/lab/contract/', 'Tool contract checker']] };
const DIR = path.resolve('training-private/agentic-architecture');

export function load(SITE) {
  if (!fs.existsSync(DIR)) { console.log('agentic-architecture course: no training-private/agentic-architecture, skipped'); return null; }
  const catalog = JSON.parse(fs.readFileSync(path.join(SITE, 'training', 'catalog.json'), 'utf8'));
  const ent = catalog.ladder.levels.find((x) => x.id === ID);
  const cc = ent && ent.course;
  if (!cc || !cc.enabled) return null;
  const parts = fs.readdirSync(DIR).filter((f) => /^part\d+\.mjs$/.test(f)).sort();
  const compact = [];
  for (const f of parts) compact.push(...(QP[f] || []));
  const lessons = compact.map(fromCompact);
  const site = JSON.parse(fs.readFileSync(path.join(SITE, 'site.json'), 'utf8'));
  const idOf = slug;
  const css = fs.readFileSync(path.resolve('tools/cyber-slides.css'), 'utf8');
  const slides = [];
  for (const l of lessons) for (const sl of l.slides) slides.push({ part: l.title, t: sl.title, o: false, e: 0, n: '', h: sl.html });
  const deck = { slides, dgx: () => '', deck: ID, css };
  const quiz = {};
  for (const l of lessons) quiz[idOf(l.title)] = l.quiz.map((q) => ({ q: q.q, o: q.o, a: q.a, why: q.why }));
  const modules = ent.modules.map((m) => ({ title: m.title, note: m.note || '', lessons: m.lessons.map((t) => {
    const l = lessons.find((x) => idOf(x.title) === idOf(t));
    if (!l) throw new Error(`catalog.json: module "${m.title}" names a lesson that is not in the course files: ${t}`);
    return idOf(l.title);
  }) }));
  const inModules = new Set(modules.flatMap((m) => m.lessons));
  for (const l of lessons) if (!inModules.has(idOf(l.title))) throw new Error(`lesson not in any module: ${l.title}`);
  const free = (cc.free || []).map((n) => idOf(lessons[n - 1].title));
  const w = { id: ID, path: ent.path, title: ent.title, whatsapp: site.whatsapp, facilitator: null };
  const c = { enabled: true, noBoard: true, headline: cc.headline, lead: cc.lead, honesty: cc.honesty, free, skip: [], price: cc.price || null, priceNote: cc.priceNote || '',
    method: cc.method, evidence: cc.evidence, faq: cc.faq, modules, preview: { lesson: idOf(lessons[cc.preview.lesson - 1].title), slideTitle: lessons[cc.preview.lesson - 1].slides[cc.preview.slide - 1].title } };
  const reading = {};
  for (const l of lessons) reading[idOf(l.title)] = [
    { h: 'Field guide', ps: l.guide }, { h: 'Worked case', ps: [l.case] },
    { h: 'How your lab is assessed', ps: ['Mark your own work against these four criteria. Score each 0, 1 or 2.'], head: ['Criterion', '0: Missing', '1: Partial', '2: Competent'], rows: l.rubric.map((r) => [r.criterion, r.missing, r.partial, r.competent]) },
    ...(l.sources && l.sources.length ? [{ h: 'Sources', ps: l.sources }] : []),
  ];
  return { w, c, deck, quiz, lab: (ls) => buildLab(lessons, ls, idOf), reading };
}

/* The lab: one growing decisions record. Section s<n> belongs to lesson n and holds that lesson's tasks. */
function buildLab(src, lessons, idOf) {
  const sections = [{ key: 'head', title: 'Design header', short: 'Header', template: [
    '| | |', '|---|---|', '| **System** | _One sentence: the agent system this design is about_ |', '| **Decisions record (Level 3)** | _where your decisions live, if you have one_ |', '| **Owner** | _the accountable person_ |', '| **Status** | Draft v0.1 |', '| **Date** | _today_ |', '',
    '**Scope.** _What the agent may do, and what it is not allowed to do._'] }];
  const steps = [];
  src.forEach((l, i) => {
    const n = i + 1, key = `s${n}`;
    const tpl = [`## ${n}. ${l.title}`, '', `**Lab:** ${l.lab.title}`, ''];
    l.lab.tasks.forEach((t, k) => { tpl.push(`**Task ${k + 1}.** ${t}`, '', '_Your answer._', ''); });
    tpl.push(`**Evidence to include:** ${l.lab.evidence}`);
    sections.push({ key, title: `${n}. ${l.title}`, short: `§${n}`, template: tpl });
    const lesson = lessons.find((x) => x.id === idOf(l.title));
    steps.push({ id: idOf(l.title), title: l.lab.title, sections: [key], minutes: 25, brief: l.lab.intro,
      do: l.lab.tasks, done: [...l.rubric.map((r) => `${r.criterion}: ${r.competent}`), `Evidence: ${l.lab.evidence}`],
      hints: l.rubric.map((r) => ({ criterion: r.criterion, nudge: r.competent, pointer: r.partial })), mistakes: l.rubric.flatMap((r) => [`${r.criterion}: ${r.missing}`, `${r.criterion}: ${r.partial}`]),
      experienced: 'Apply it to an agent system you run or plan to run, with real tools, real limits, real owners and real dates.', example: l.lab.model,
      free: lesson.free, lessonNum: lesson.num, lessonTitle: lesson.title, next: null });
  });
  steps.sort((a, b) => a.lessonNum - b.lessonNum);
  steps.forEach((s, i) => { const nx = steps[i + 1]; s.next = nx ? { id: nx.id, title: nx.title } : null; });
  return { sections, steps };
}

const levelText = (src) => src
  .replaceAll('Your arc42 so far: ${started} of 12 sections started.', 'Your design so far: ${started} of 16 sections started.')
  .replaceAll('Your arc42 is yours to keep', 'Your design is yours to keep').replaceAll("'Open your arc42'", "'Open your design'")
  .replaceAll('architecture documentation (arc42)', 'agent system design').replaceAll('-arc42.md', '-agent-design.md').replaceAll("|| 'arc42'", "|| 'agent-design'")
  .replaceAll('No arc42 sections found. The file needs headings like "## 1. Introduction and Goals".', 'No sections found. The file needs headings like "## 1. Workflows, assistants and agents: choosing the shape".')
  .replaceAll('See the finished version (Doubles-to-Go worked example)', 'See a model solution').replaceAll('write the next arc42 section in the lab', 'write the next section of your design in the lab')
  .replaceAll('sectionsTotal: 12', 'sectionsTotal: 16').replaceAll('rec.sections, 12, rec.sections >= 12', 'rec.sections, 16, rec.sections >= 16')
  .replaceAll('n <= 12', 'n <= 16').replaceAll('arc42.md', 'agent-design.md')
  .replaceAll("/:?\\s*architecture documentation.*$/i", "/:?\\s*agent system design.*$/i").replaceAll('.*arc42.*$', '.*agent system design.*$');

/* Two practice tools, free to open: a rules checker and a tool contract checker. */
function writeTools(out, w) {
  const base = `${w.path}course/lab/`, put = (rel, txt) => { const f = path.join(out, 'lab', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };
  const src = path.resolve('tools/agent-tools');
  put('tools/data.js', fs.readFileSync(path.join(src, 'data.mjs'), 'utf8'));
  for (const f of ['rules.js', 'contract.js']) put(`tools/${f}`, fs.readFileSync(path.join(src, f), 'utf8'));
  put('tools/tools.css', fs.readFileSync(path.resolve('tools/cyber-tools/tools.css'), 'utf8') + '\n.xt textarea { min-height: 140px; background: transparent; color: var(--text-hi); border: 1px solid var(--line-hi); border-radius: 4px; padding: var(--s2); font: inherit; }\n');
  const nav = (here) => `<nav class="subnav" aria-label="Practice tools"><p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span><a href="${w.path}">${xesc(w.title)}</a><span aria-hidden="true"> / </span>${here}</p><a class="sn-code" href="/training/my-courses/">Enter access code</a></nav>`;
  const css = [`${base}tools/tools.css`];
  const rules = `${nav('Rules checker')}
    <section class="t-hero t-hero-single"><div class="t-hero-copy"><p class="eyebrow">Practice tool</p><h1>Rules checker</h1><p class="lead">A rule is finished when it says what it forbids or requires, why, and how it is verified. Paste your rules and see which are finished, then judge six examples yourself.</p></div></section>
    <div class="xt" data-rules>
      <h2>Check your rules</h2>
      <label>Your rules, one per line<textarea data-text rows="6" placeholder="RULE-1: Order screens must not import the payment library; use PaymentPort. Reason: lets us swap providers. VERIFIED_BY: tests/architecture/test_imports.py"></textarea></label>
      <div data-out aria-live="polite"></div>
      <h2>Judge six examples</h2>
      <p class="muted">Is each rule finished? <strong data-score role="status">0 of 0 right</strong></p>
      <ol class="cases" data-cases></ol>
      <p class="muted small">The checker looks at structure: a specific statement, a reason and a named check or reviewer. It cannot tell whether a rule is wise, or whether the named test really exists. Use it as a first pass, then run the test.</p>
    </div>
    <script type="module" src="${base}tools/rules.js"></script>`;
  const contract = `${nav('Tool contract checker')}
    <section class="t-hero t-hero-single"><div class="t-hero-copy"><p class="eyebrow">Practice tool</p><h1>Tool contract checker</h1><p class="lead">Every tool an agent can call needs a contract. Paste yours as labelled lines (Name, Purpose, Inputs, Outputs, Side effects, Errors, Callers, Class, Limit) and see what is missing.</p></div></section>
    <div class="xt" data-contract>
      <h2>Check your contract</h2>
      <label>Your tool contract<textarea data-text rows="10" placeholder="Name: ...&#10;Purpose: ...&#10;Inputs: ...&#10;Outputs: ...&#10;Side effects: ...&#10;Errors: ...&#10;Callers: ...&#10;Class: read only, reversible or irreversible&#10;Limit: ..."></textarea></label>
      <p><button class="btn btn-ghost" type="button" data-example>Load an example</button></p>
      <div data-out aria-live="polite"></div>
      <p class="muted small">The checker looks for the fields and for a number and a place of enforcement on changing tools. It cannot tell whether the limit is the right one.</p>
    </div>
    <script type="module" src="${base}tools/contract.js"></script>`;
  put('rules/index.html', page({ title: 'Rules checker | Agentic AI Architecture', description: 'Check that each architecture rule is specific, reasoned and tied to a check or a reviewer.', canonicalPath: `${base}rules/`, body: rules, css }));
  put('contract/index.html', page({ title: 'Tool contract checker | Agentic AI Architecture', description: 'Check that a tool contract has purpose, inputs, outputs, effects, errors, callers, class and limit.', canonicalPath: `${base}contract/`, body: contract, css }));
}

export function writeEngine(out, w, SITE) {
  writeTools(out, w);
  engineFiles(out, w, SITE, { prefix: 'iwa-', health: 'tools/agent-health.js', text: levelText });
}

const QP = {};
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((x) => /^part\d+\.mjs$/.test(x)).sort() : []) QP[f] = (await import(path.join(DIR, f))).default;
