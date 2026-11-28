// Unit tests for the Level 4 practice tools, the health check and the course source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from './agent-tools/data.mjs';
import { healthChecks, MAIN } from './agent-health.js';
for (const c of D.RULE_CASES) assert.equal(D.lintRules(c.text).ok, c.finished, c.text);
assert.equal(D.lintRules('nothing here').total, 0);
assert.ok(D.lintContract(D.CONTRACT_EXAMPLE).ok, 'the example contract must pass');
assert.equal(D.lintContract('Name: x').ok, false);
assert.equal(D.lintContract(D.CONTRACT_EXAMPLE.replace(/^Limit:.*$/m, 'Limit: be careful')).ok, false, 'a changing tool needs a numeric limit and a place');
assert.ok(D.lintContract(D.CONTRACT_EXAMPLE.replace('irreversible', 'read only').replace(/^Limit:.*$/m, 'Limit: none')).ok, 'read only tools need no numeric limit');
// health check
const tpl = (k) => `## ${k.slice(1)}. Title\n\n**Lab:** x\n\n**Task 1.** do it\n\n_Your answer._\n\n**Evidence to include:** e`;
const t = Object.fromEntries(MAIN.map((k) => [k, tpl(k)]));
const run = (m, started) => healthChecks({ text: (k) => m[k], started, arc42: () => Object.values(m).join('\n') });
assert.ok(run(t, () => false).some((c) => !c.ok));
const answer = 'Our assistant may issue refunds up to 100 dollars after a vendor approves, and we measure the accuracy of its suggestions at 85 percent each month.';
const rules = ['RULE-1: Only listed tools may be called. Reason: unlisted tools have no contract. VERIFIED_BY: tests/policy/a.py', 'RULE-2: Order screens must not import payments. Reason: swap providers. VERIFIED_BY: tests/arch/b.py', 'RULE-3: Refunds are capped at 100. Reason: limits loss. VERIFIED_BY: tests/policy/c.py', 'RULE-4: Customer text is labelled. Reason: stops injection. VERIFIED_BY: tests/data/d.py', 'RULE-5: Refunds over 50 need approval. Reason: hard to recall. VERIFIED_BY: tests/policy/e.py', 'RULE-6: New services need a record. Reason: visibility. REVIEWED_BY: tech lead'].join('\n');
const done = Object.fromEntries(MAIN.map((k) => [k, tpl(k).replace('_Your answer._', k === 's7' ? rules + '\n' + answer : answer)]));
assert.ok(run(done, () => true).every((c) => c.ok), JSON.stringify(run(done, () => true).filter((c) => !c.ok)));
assert.equal(run(done, () => true).length, 6, 'the certificate rule expects 6 checks');
const bad = { ...done, s7: done.s7.replace(/ VERIFIED_BY: tests\/policy\/c\.py/, '') };
assert.equal(run(bad, () => true).filter((c) => !c.ok).length, 1, 'a rule with no check must fail the rules check');
const nonum = { ...done, s13: done.s13.replace(/\d+/g, (m, o) => (o < 20 ? m : 'x')) };
assert.equal(run(nonum, () => true).filter((c) => !c.ok).length, 1);
// course source: 16 lessons, every lesson complete and matching the catalogue
const cat = JSON.parse(fs.readFileSync('site/training/catalog.json', 'utf8'));
const ent = cat.ladder.levels.find((x) => x.id === 'agentic-architecture');
const lessons = [];
for (const f of ['part1', 'part2', 'part3', 'part4']) lessons.push(...(await import(`../training-private/agentic-architecture/${f}.mjs`)).default);
assert.equal(lessons.length, 16);
lessons.forEach((l, i) => {
  assert.equal(l.n, i + 1);
  assert.equal(l.slides.length, 4, l.title); assert.equal(l.quiz.length, 3, l.title); assert.equal(l.rubric.length, 4, l.title); assert.equal(l.lab.tasks.length, 4, l.title);
  assert.ok(l.sources.length >= 3, l.title);
  for (const [, , , , , chk] of l.slides) assert.ok(chk.length > 20, `${l.title}: check is too short`);
  for (const q of l.quiz) { assert.equal(q[1].length, 4); assert.ok(q[2] >= 0 && q[2] < 4); }
  assert.ok(l.lab.model.length > 200, l.title);
});
const inMods = ent.modules.flatMap((m) => m.lessons);
assert.deepEqual(inMods, lessons.map((l) => l.title), 'catalogue modules must list the lessons in order');
assert.deepEqual(ent.lab.steps, lessons.map((l) => l.lab.title));
console.log('level 4 tools and course source: ok');
