import { $, el } from '/kit/dom.js';
import { lintRules, RULE_CASES } from './data.js';

const root = $('[data-rules]');
const ta = $('[data-text]', root), out = $('[data-out]', root);
const render = () => {
  if (!ta.value.trim()) { out.replaceChildren(el('p', { class: 'muted' }, 'Paste your rules, one per line, to check them.')); return; }
  const r = lintRules(ta.value);
  if (!r.total) { out.replaceChildren(el('p', { class: 'verdict is-deny', role: 'status' }, 'No rules found. Start each rule with RULE-1:, RULE-2: and so on.')); return; }
  out.replaceChildren(
    el('p', { class: r.ok ? 'verdict is-allow' : 'verdict is-deny', role: 'status' }, `${r.finished} of ${r.total} rules finished`),
    el('ul', { class: 'rules' }, ...r.rules.map((x) => el('li', { class: x.finished ? 'ok' : 'bad' }, `${x.id}: ${x.finished ? `finished (${x.check === 'verified' ? 'automated check' : 'named reviewer'})` : x.problems.join(' ')}`))));
};
ta.addEventListener('input', render); render();

const list = $('[data-cases]', root), score = $('[data-score]', root);
let right = 0, done = 0;
RULE_CASES.forEach((s, n) => {
  const fb = el('p', { class: 'fb', role: 'status' });
  const btns = ['Finished', 'Not finished'].map((label) => el('button', { class: 'btn btn-ghost', type: 'button' }, label));
  btns.forEach((b, k) => b.addEventListener('click', () => {
    btns.forEach((x) => { x.disabled = true; });
    const ok = (k === 0) === s.finished; done++; if (ok) right++;
    fb.textContent = `${ok ? 'Correct.' : 'Not quite.'} ${s.why}`;
    score.textContent = `${right} of ${done} right`;
  }));
  list.append(el('li', { class: 'case' }, el('h3', {}, `${n + 1}.`), el('p', {}, s.text), el('div', { class: 'actions' }, ...btns), fb));
});
