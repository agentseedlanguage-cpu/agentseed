// The Level 1 course, "Software Architecture Foundations": turns training-private/foundations (lessons, question bank, curriculum map) and the
// "course" block of the software-architecture-foundations entry in site/training/catalog.json (ladder.levels) into what build-course.mjs needs.
// It reuses the cyber course's engine copy (cyber-course.mjs engineFiles) with its own storage prefix, health check and wording, and adds
// five timed mock exams whose questions are encrypted with the course key like the lessons.
import fs from 'node:fs';
import path from 'node:path';
import { page, esc as xesc } from './training-shell.mjs';
import { fromCompact, slug, engineFiles } from './cyber-course.mjs';
import { loadLessons, loadBank, validateLessons, validateBank, MAP } from './validate-foundations.mjs';
import * as SC from './foundations-tools/score.mjs';

export const ID = 'software-architecture-foundations';
export const COPY = { noun: 'architecture file', own: 'your own architecture file', doc: 'Your architecture file', file: 'architecture-file.md', extra: 'A model solution for every lab, and a rubric to mark your own work',
  labFor: 'Build your own architecture file', store: 'iwf-course-code', sysEx: 'e.g. ClinicBook, the clinic booking case',
  tools: [['course/lab/mock/', 'Mock exams'], ['course/lab/map/', 'Curriculum map']] };
const DIR = path.resolve('training-private/foundations');

export async function load(SITE) {
  if (!fs.existsSync(DIR)) { console.log('foundations course: no training-private/foundations, skipped'); return null; }
  const catalog = JSON.parse(fs.readFileSync(path.join(SITE, 'training', 'catalog.json'), 'utf8'));
  const ent = catalog.ladder.levels.find((x) => x.id === ID);
  const cc = ent && ent.course;
  if (!cc || !cc.enabled) return null;
  const raw = await loadLessons();
  const bank = await loadBank();
  const bad = [...validateLessons(raw), ...validateBank(bank)];
  if (bad.length) throw new Error('Level 1 source problems:\n - ' + bad.slice(0, 20).join('\n - '));
  const lessons = raw.map(fromCompact);
  const mock = SC.assemble(bank);
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
  return { w, c, deck, quiz, lab: (ls) => buildLab(lessons, ls, idOf), reading, mock, bank, lessonSlugs: Object.fromEntries(lessons.map((l) => [l.n, idOf(l.title)])) };
}

/* The lab: one growing architecture file. Section s<n> belongs to lesson n and holds that lesson's tasks. */
function buildLab(src, lessons, idOf) {
  const sections = [{ key: 'head', title: 'File header', short: 'Header', template: [
    '| | |', '|---|---|', '| **System** | _One sentence: the system this file is about (your own, or ClinicBook)_ |', '| **Course** | Software Architecture Foundations (Level 1) |', '| **Owner** | _the accountable person_ |', '| **Status** | Draft v0.1 |', '| **Date** | _today_ |', '',
    '**Scope.** _What the file covers, and what it does not._'] }];
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
      experienced: 'Apply it to a real system your team runs, with real numbers, real owners and real dates.', example: l.lab.model,
      free: lesson.free, lessonNum: lesson.num, lessonTitle: lesson.title, next: null });
  });
  steps.sort((a, b) => a.lessonNum - b.lessonNum);
  steps.forEach((s, i) => { const nx = steps[i + 1]; s.next = nx ? { id: nx.id, title: nx.title } : null; });
  return { sections, steps };
}

const levelText = (src) => src
  .replaceAll('Your arc42 so far: ${started} of 12 sections started.', 'Your architecture file so far: ${started} of 14 sections started.')
  .replaceAll('Your arc42 is yours to keep', 'Your architecture file is yours to keep').replaceAll("'Open your arc42'", "'Open your file'")
  .replaceAll('architecture documentation (arc42)', 'architecture file').replaceAll('-arc42.md', '-architecture-file.md').replaceAll("|| 'arc42'", "|| 'architecture-file'")
  .replaceAll('No arc42 sections found. The file needs headings like "## 1. Introduction and Goals".', 'No sections found. The file needs headings like "## 1. What Software Architecture Is and What Architects Do".')
  .replaceAll('See the finished version (Doubles-to-Go worked example)', 'See a model solution').replaceAll('write the next arc42 section in the lab', 'write the next section of your file in the lab')
  .replaceAll('sectionsTotal: 12', 'sectionsTotal: 14').replaceAll('rec.sections, 12, rec.sections >= 12', 'rec.sections, 14, rec.sections >= 14')
  .replaceAll('n <= 12', 'n <= 14').replaceAll('arc42.md', 'architecture-file.md')
  .replaceAll("/:?\\s*architecture documentation.*$/i", "/:?\\s*architecture file.*$/i").replaceAll('.*arc42.*$', '.*architecture file.*$');

/* Practice pages: five timed mock exams (questions encrypted like the lessons) and a public curriculum map. */
const goalRows = () => MAP.goals.map((g) => `<tr><td>${xesc(g.id)}</td><td>${xesc(g.title)}</td><td>${xesc(g.r)}</td><td>${g.lessons.join(', ')}</td></tr>`).join('');

function writeTools(out, w, key, encrypt, built) {
  const base = `${w.path}course/lab/`, put = (rel, txt) => { const f = path.join(out, 'lab', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };
  const nav = (here) => `<nav class="subnav" aria-label="Practice tools"><p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span><a href="${w.path}">${xesc(w.title)}</a><span aria-hidden="true"> / </span>${here}</p><a class="sn-code" href="/training/my-courses/">Enter access code</a></nav>`;
  put('tools/score.js', fs.readFileSync(path.resolve('tools/foundations-tools/score.mjs'), 'utf8'));
  put('tools/mock.js', fs.readFileSync(path.resolve('tools/foundations-tools/mock.js'), 'utf8').replaceAll('__BASE__', `${w.path}course/`));
  put('tools/tools.css', fs.readFileSync(path.resolve('tools/cyber-tools/tools.css'), 'utf8') + fs.readFileSync(path.resolve('tools/foundations-tools/mock.css'), 'utf8'));
  // Encrypted mock forms: data/mock-1.json .. mock-5.json under the course folder, same scheme as the lessons.
  const payload = (items) => items.map((it) => ({ id: it.id, type: it.type, ch: it.ch, lg: it.lg, stem: it.stem, options: it.options, key: it.key, pick: it.pick, cats: it.cats, items: it.items, why: it.why, wrong: it.wrong }));
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  built.mock.forms.forEach((f, i) => fs.writeFileSync(path.join(out, 'data', `mock-${i + 1}.json`), JSON.stringify(encrypt(key, `mock-${i + 1}`, payload(f)))));
  const css = [`${base}tools/tools.css`];
  const cfg = JSON.stringify({ base: `${w.path}course/`, learn: `${w.path}course/learn/`, prefix: 'iwf-', forms: built.mock.forms.length, items: built.mock.forms[0].length, lessons: built.lessonSlugs, quota: SC.QUOTA, ready: SC.READY, chapters: MAP.chapters });
  const mock = `${nav('Mock exams')}
    <section class="t-hero t-hero-single"><div class="t-hero-copy"><p class="eyebrow">Practice</p><h1>Mock exams</h1><p class="lead">Five different timed practice papers of ${built.mock.forms[0].length} questions each, written by Intellica from the public curriculum topics. They are practice, not real exam questions, and they do not predict your result.</p></div></section>
    <div class="xt" data-mock data-cfg='${xesc(cfg)}'>
      <div data-gate></div>
      <div data-menu hidden>
        <h2>Choose a paper</h2>
        <p class="muted">Exam mode is timed, shows no hints, and gives feedback only after you submit. Practice mode shows the explanation after each answer. Choose how long you have; the external exam is commonly described as about 75 minutes, so check the current rules with your certification body.</p>
        <div class="mock-row"><label>Mode <select data-mode><option value="exam">Exam mode (timed)</option><option value="practice">Practice mode (feedback as you go)</option></select></label>
        <label>Time <select data-time><option value="75">75 minutes</option><option value="90">90 minutes</option></select></label></div>
        <ul class="mock-forms" data-forms></ul>
        <h2>Your readiness</h2>
        <p data-ready role="status"></p>
        <p class="muted small">Practice-ready is Intellica guidance: at least 80 percent on each of three different mocks, and no chapter below 70 percent in any of them. It is not an iSAQB requirement and it does not guarantee a pass. Results are saved on this device only.</p>
      </div>
      <div data-exam hidden></div>
      <div data-result hidden></div>
    </div>
    <script type="module" src="${base}tools/mock.js"></script>`;
  const map = `${nav('Curriculum map')}
    <section class="t-hero t-hero-single"><div class="t-hero-copy"><p class="eyebrow">Reference</p><h1>Curriculum map</h1><p class="lead">How the 14 lessons map to the learning goals of the public iSAQB CPSA-F curriculum, version ${xesc(MAP.curriculum.version)} (read ${xesc(MAP.curriculum.readOn)}). R1 goals will be examined, R2 may be, R3 will not be. Chapter 6 is not relevant for the exam.</p></div></section>
    <div class="xt">
      <table class="tbl"><thead><tr><th>Goal</th><th>Title</th><th>Relevance</th><th>Lessons</th></tr></thead><tbody>${goalRows()}</tbody></table>
      <p class="muted small">Source: <a href="${xesc(MAP.curriculum.url)}" rel="noopener">${xesc(MAP.curriculum.url)}</a>. Intellica Level 1 is independent self-study that follows these topics. It is not an iSAQB course, and Intellica is not an accredited training provider. Lesson 13 (AI-assisted work) and lesson 14 (exam strategy) are Intellica additions. The next curriculum release candidate (2027.1) is provisional.</p>
    </div>`;
  put('mock/index.html', page({ title: 'Mock exams | Software Architecture Foundations', description: 'Five timed practice papers with a readiness report.', canonicalPath: `${base}mock/`, body: mock, css }));
  put('map/index.html', page({ title: 'Curriculum map | Software Architecture Foundations', description: 'How the lessons map to the public CPSA-F learning goals.', canonicalPath: `${base}map/`, body: map, css }));
}

export function writeEngine(out, w, SITE, key, encrypt, built) {
  writeTools(out, w, key, encrypt, built);
  engineFiles(out, w, SITE, { prefix: 'iwf-', health: 'tools/foundations-health.js', text: levelText });
}
