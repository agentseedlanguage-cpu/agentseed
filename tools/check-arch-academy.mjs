// Fails when the Software Architecture Academy says one thing and the catalogue, the code or the course says another.
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from './arch-academy/levels.mjs';
import { PATHS, CHAPTERS, GAPS, ROADMAP, CREDENTIALS, POLICY } from './arch-academy/meta.mjs';
import { SOURCES } from './arch-academy/sources.mjs';
import { allLessons, bankStats } from './arch-academy/data.mjs';

const root = process.cwd();
const errs = [];
const { levels, curric, cat, byLevel } = allLessons();
const S = await bankStats();
const ladder = Object.fromEntries(cat.ladder.levels.map((l) => [l.n, l]));

if (LEVELS.length !== 6) errs.push(`expected 6 levels, found ${LEVELS.length}`);
LEVELS.forEach((v, i) => {
  if (v.n !== i + 1 || v.id !== `level-${v.n}`) errs.push(`level ${i + 1} has the wrong number or id`);
  const live = v.n === 2 ? true : Boolean(ladder[v.n].course && ladder[v.n].course.enabled);
  if ((v.status.key === 'planned') === live) errs.push(`level ${v.n} is marked "${v.status.key}" but the catalogue says ${live ? 'a course is live' : 'no course is live'}`);
  if (live && !v.course) errs.push(`level ${v.n} is live but names no course`);
  if (!live && v.course) errs.push(`level ${v.n} names a course but none is live`);
  if (v.n !== 2 && v.course && ladder[v.n].id !== v.course) errs.push(`level ${v.n} course id ${v.course} does not match the catalogue (${ladder[v.n].id})`);
  const mods = levels[v.n].modules;
  if (v.evidence.length !== mods.length) errs.push(`level ${v.n}: ${v.evidence.length} evidence lines for ${mods.length} modules`);
  for (const k of ['tagline', 'audience', 'prereq', 'capstone', 'assessment', 'caveat']) if (!v[k] || v[k].split(/\s+/).length < 5) errs.push(`level ${v.n}: ${k} is missing or too short`);
  if (v.mapping.length < 1) errs.push(`level ${v.n}: no external mapping`);
  if (!live && /certificate|for sale|buy/i.test(v.assessment + v.capstone) && !/not|planned/i.test(v.assessment)) errs.push(`level ${v.n}: a planned level reads as if it is available`);
});

// counts the pages quote
const l1 = ladder[1];
if (byLevel[1].length !== 14 || l1.modules.length !== 6) errs.push('Level 1 should have 14 lessons in 6 modules');
if (l1.lab.steps.length !== 14) errs.push('Level 1 lab steps should be 14');
if (S.mocks < 5) errs.push(`only ${S.mocks} mock papers; the pages promise five`);
if (S.bank < 120) errs.push(`question bank has ${S.bank} items`);

// pathways point at real lessons and real levels
for (const p of PATHS) {
  if (p.lessons.length < 3) errs.push(`pathway ${p.id} has too few lessons`);
  for (const [n, i] of p.lessons) if (!byLevel[n] || !byLevel[n][i - 1]) errs.push(`pathway ${p.id} names lesson ${i} of level ${n}, which does not exist`);
  for (const n of p.levels) if (n < 1 || n > 6) errs.push(`pathway ${p.id} names level ${n}`);
}
// curriculum crosswalk matches the map
for (const c of Object.keys(curric.chapters)) if (!CHAPTERS[c]) errs.push(`chapter ${c} has no crosswalk entry`);
const total = Object.values(CHAPTERS).reduce((n, c) => n + c.minutes, 0);
if (total !== 1080) errs.push(`active curriculum minutes add up to ${total}, expected 1080`);
for (const g of curric.goals) for (const n of g.lessons) if (!byLevel[1][n - 1]) errs.push(`goal ${g.id} points at missing lesson ${n}`);

// registers
if (CREDENTIALS.length !== 6 || CREDENTIALS.some(([, t]) => !/working title/.test(t))) errs.push('every credential must be six working titles');
if (new Set(SOURCES.map((s) => s.id)).size !== SOURCES.length) errs.push('duplicate source ids');
for (const s of SOURCES) { if (!['verified', 'carried'].includes(s.status)) errs.push(`source ${s.id} has status ${s.status}`); if (!s.pin || !s.note) errs.push(`source ${s.id} lacks a version note`); if (s.status === 'verified' && !s.url) errs.push(`verified source ${s.id} needs a link`); }
if (new Set(GAPS.map((g) => g.id)).size !== GAPS.length) errs.push('duplicate gap ids');
if (ROADMAP.filter((r) => r.status === 'active').length !== 1) errs.push('exactly one roadmap phase should be in progress');
if (!POLICY.some((p) => /No Intellica credential has been issued/.test(p))) errs.push('the policy must say that no credential has been issued');

// claims that must never appear on the pages
const pages = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.html')) pages.push(p); } })(path.join(root, 'site/training/architecture-academy'));
const BAD = [/iSAQB[- ]certified(?! Professional)/i, /accredited (iSAQB )?training provider(?! and)/i, /guarantee(s|d)? (a )?pass/i, /official iSAQB/i];
for (const f of pages) {
  const text = fs.readFileSync(f, 'utf8').replace(/<[^>]+>/g, ' ');
  for (const b of BAD) { const m = text.match(b); if (m && !/not|never|no |isn.t|without/i.test(text.slice(Math.max(0, m.index - 80), m.index + 80))) errs.push(`${path.relative(root, f)} contains "${m[0]}" without a negation`); }
}
if (errs.length) { console.error(`architecture academy check failed:\n - ${errs.join('\n - ')}`); process.exit(1); }
console.log(`architecture academy check: ok (6 levels, ${S.lessons} live lessons, ${S.plannedLessons} outlined, ${S.bank} bank items, ${S.mocks} mocks, ${pages.length} pages)`);
