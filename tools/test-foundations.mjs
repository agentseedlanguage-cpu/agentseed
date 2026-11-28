// Level 1 (Software Architecture Foundations): source quality, scoring rules, mock assembly, and that the catalogue, worker and code agree.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateLessons, validateBank, loadLessons, loadBank, MAP } from './validate-foundations.mjs';
import { QUOTA, scoreItem, assemble, readiness } from './foundations-tools/score.mjs';

const lessons = await loadLessons(), bank = await loadBank();
assert.deepEqual(validateLessons(lessons), [], 'lessons');
assert.deepEqual(validateBank(bank), [], 'bank');
assert.equal(lessons.length, 14);
assert.equal(Object.keys(MAP.lessons).length, 14);

// every curriculum goal is taught in a lesson that exists, and every bank item cites real goals
const goals = new Set(MAP.goals.map((g) => g.id));
for (const g of MAP.goals) for (const n of g.lessons) assert.ok(MAP.lessons[n], `goal ${g.id} points at missing lesson ${n}`);
for (const it of bank) for (const g of it.lg) assert.ok(goals.has(g), `${it.id} cites unknown goal ${g}`);
assert.equal(new Set(bank.map((i) => i.id)).size, bank.length, 'bank ids are unique');

// scoring rules
const single = { type: 'single', key: 2 }, multi = { type: 'multi', key: [0, 2] }, cls = { type: 'classify', items: [{ c: 0 }, { c: 1 }, { c: 0 }, { c: 1 }] };
assert.equal(scoreItem(single, 2), 1); assert.equal(scoreItem(single, 1), 0); assert.equal(scoreItem(single, null), 0);
assert.equal(scoreItem(multi, [0, 2]), 1); assert.equal(scoreItem(multi, [0]), 0.5); assert.equal(scoreItem(multi, [0, 1]), 0); assert.equal(scoreItem(multi, [1, 3]), 0);
assert.equal(scoreItem(cls, [0, 1, 0, 1]), 1); assert.equal(scoreItem(cls, [0, 1, 1, 0]), 0.5);

// mock assembly: five distinct forms of 40, chapter quotas, no overlap, answer positions spread
const forms = assemble(bank).forms || assemble(bank);
assert.equal(forms.length, 5);
const seen = new Set();
for (const f of forms) {
  assert.equal(f.length, 40);
  for (const ch of Object.keys(QUOTA)) assert.equal(f.filter((i) => i.ch === +ch).length, QUOTA[ch], `quota chapter ${ch}`);
  for (const i of f) { assert.ok(!seen.has(i.id), `${i.id} is in two mocks`); seen.add(i.id); }
  const pos = [0, 0, 0, 0]; for (const i of f) if (i.type === 'single') pos[i.key]++;
  assert.ok(Math.max(...pos) <= 0.4 * f.length, `answer positions cluster: ${pos}`);
}
assert.equal(typeof readiness, 'function');

// the catalogue, the payment offer, the code list and the certificate rule agree
const cat = JSON.parse(fs.readFileSync('site/training/catalog.json', 'utf8'));
const c = cat.ladder.levels.find((l) => l.id === 'software-architecture-foundations');
assert.ok(c.course.enabled);
assert.equal(c.modules.reduce((n, m) => n + m.lessons.length, 0), 14);
assert.equal(c.modules.length, 6);
assert.equal(c.lab.steps.length, 14);
assert.equal(c.lab.checks.length, 6);
assert.match(fs.readFileSync('worker/pay-api.js', 'utf8'), /'software-architecture-foundations': \{ ttd: 1049, usd: 149/);
assert.match(fs.readFileSync('worker/cert-api.js', 'utf8'), /'software-architecture-foundations': \{ lessons: 14, sections: 14, checks: 6, questions: 70 \}/);
assert.equal((fs.readFileSync('tools/foundations-health.js', 'utf8').match(/out\.push\(/g) || []).length, 6);
assert.equal(lessons.reduce((n, l) => n + l.quiz.length, 0), 70);
console.log(`foundations ok: 14 lessons, ${lessons.reduce((n, l) => n + l.slides.length, 0)} slides, 70 quiz questions, ${bank.length} bank items, 5 mocks of 40`);
