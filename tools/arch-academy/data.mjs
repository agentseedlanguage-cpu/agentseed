// Reads the live catalogue and course data so the Architecture Academy pages can never disagree with the courses.
import fs from 'node:fs';
import path from 'node:path';
import { slug } from '../cyber-course.mjs';
import { loadBank } from '../validate-foundations.mjs';
import { assemble } from '../foundations-tools/score.mjs';

const ROOT = process.cwd();
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const exists = (p) => fs.existsSync(path.join(ROOT, 'site', p.replace(/^\//, ''), 'index.html'));

// Readable names for the arc42 course lessons (the catalogue lists them by id).
const ARC_TITLES = {
  'part-0-opening': 'Opening', 'part-1-foundations': 'Foundations of architecture documentation', 'part-2-1-goals': 'Section 1: Introduction and goals',
  'part-3-2-constraints': 'Section 2: Constraints', 'part-4-3-context': 'Section 3: Context and scope', 'part-5-4-strategy': 'Section 4: Solution strategy',
  recall: 'Recall: morning review', 'part-6-5-building-blocks': 'Section 5: Building blocks', 'part-7-6-runtime': 'Section 6: Runtime view',
  'part-8-7-deployment': 'Section 7: Deployment view', 'part-9-8-crosscutting-concepts': 'Section 8: Cross-cutting concepts', 'part-9b-see-it-run': 'See it run: the worked example',
  'part-10-9-decisions': 'Section 9: Architecture decisions', 'part-11-10-quality-requirements': 'Section 10: Quality requirements', 'part-12-11-risks-and-12-glossary': 'Sections 11 and 12: Risks and glossary',
  'part-13-ai-lab': 'AI lab', 'part-14-agents-as-readers': 'Agents as readers of your documentation', 'part-15-close': 'Close', 'appendix-quiz-and-quick-card': 'Appendix: quiz and quick card',
};

let memo;
export function allLessons() {
  if (memo) return memo;
  const cat = read('site/training/catalog.json');
  const arc = read('site/training/training.json').workshops[0];
  const curric = read('training-private/foundations/curriculum-map.json');
  const ladder = Object.fromEntries(cat.ladder.levels.map((l) => [l.n, l]));
  const levels = {}, byLevel = {};

  // Level 2: arc42 course
  const am = arc.course.modules;
  levels[2] = { path: arc.path, title: 'Mastering arc42', modules: am.map((m) => ({ title: m.title, note: m.note, lessons: m.lessons })), price: arc.course.price.label, free: arc.course.free.map((id) => am.flatMap((m) => m.lessons).indexOf(id) + 1) };
  let i = 0;
  byLevel[2] = am.flatMap((m) => m.lessons.map((id) => {
    const title = ARC_TITLES[id]; if (!title) throw new Error(`no readable title for arc42 lesson ${id}`);
    const url = `${arc.path}course/${id}/`; i++;
    return { n: i, title, module: m.title, url: exists(url) ? url : null, free: arc.course.free.includes(id), planned: false };
  }));

  // Levels 1, 3 to 6: catalogue
  for (const n of [1, 3, 4, 5, 6]) {
    const l = ladder[n]; let k = 0;
    const live = Boolean(l.course && l.course.enabled);
    const free = live ? l.course.free : [];
    levels[n] = { path: l.path, title: l.title, modules: l.modules.map((m) => ({ title: m.title, note: m.note, lessons: m.lessons })), price: live && l.course.price ? l.course.price.label : '', free };
    byLevel[n] = l.modules.flatMap((m) => m.lessons.map((title) => {
      k++;
      const t = typeof title === 'string' ? title : title.title;
      const url = live ? `${l.path}course/${slug(t)}/` : null;
      if (live && !exists(url)) console.warn(`  note: lesson page ${url} does not exist yet; it is created by the course build (npm run sync). The link check runs after it.`);
      let chapters = '–';
      if (n === 1) {
        const ch = [...new Set(curric.goals.filter((g) => g.lessons.includes(k)).map((g) => g.ch))].sort();
        chapters = ch.length ? ch.join(', ') : (k === 13 ? 'Intellica extension' : 'Intellica exam practice');
      }
      return { n: k, title: t, module: m.title, url, free: free.includes(k), planned: !live, chapters };
    }));
  }
  return (memo = { levels, curric, cat, arc, byLevel });
}

let sm;
export function stats() {
  if (sm) return sm;
  const { levels, byLevel, cat } = allLessons();
  const ladder = Object.fromEntries(cat.ladder.levels.map((l) => [l.n, l]));
  const arcLab = read('site/training/arc42/course/data/lab-index.json').sections.length;
  return (sm = { _lab: arcLab, _ladder: ladder, titles: Object.fromEntries(Object.entries(levels).map(([n, l]) => [n, l.title])), counts: Object.fromEntries(Object.entries(byLevel).map(([n, l]) => [n, l.length])), prices: Object.fromEntries(Object.entries(levels).map(([n, l]) => [n, l.price])), free: Object.fromEntries(Object.entries(levels).map(([n, l]) => [n, l.free])), lessons: [1, 2, 3, 4, 5, 6].filter((n) => !byLevel[n][0].planned).reduce((s, n) => s + byLevel[n].length, 0), plannedLessons: [1, 2, 3, 4, 5, 6].filter((n) => byLevel[n][0].planned).reduce((s, n) => s + byLevel[n].length, 0), labSteps: arcLab + [1, 3, 4].filter((n) => !byLevel[n][0].planned).reduce((s, n) => s + ladder[n].lab.steps.length, 0), bank: 0, mocks: 0 });
}
// The bank is loaded asynchronously (its files are modules), so the builder awaits this once at the top.
export async function bankStats() {
  const s = stats();
  const bank = await loadBank();
  s.bank = bank.length; s.mocks = assemble(bank).forms.length;
  return s;
}
