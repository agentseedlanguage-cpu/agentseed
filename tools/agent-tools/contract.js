import { $, el } from '/kit/dom.js';
import { lintContract, CONTRACT_EXAMPLE } from './data.js';

const root = $('[data-contract]');
const ta = $('[data-text]', root), out = $('[data-out]', root);
const render = () => {
  if (!ta.value.trim()) { out.replaceChildren(el('p', { class: 'muted' }, 'Paste a tool contract to check it.')); return; }
  const r = lintContract(ta.value);
  out.replaceChildren(
    el('p', { class: r.ok ? 'verdict is-allow' : 'verdict is-deny', role: 'status' }, `${r.score} of ${r.total}: ${r.ok ? 'complete' : 'not yet complete'}`),
    el('ul', { class: 'rules' }, ...r.checks.map((c) => el('li', { class: c.ok ? 'ok' : 'bad' }, `${c.ok ? 'Pass' : 'Fix'}: ${c.label}${c.ok ? '' : '. ' + c.tip}`))));
};
ta.addEventListener('input', render);
$('[data-example]', root).addEventListener('click', () => { ta.value = CONTRACT_EXAMPLE; render(); });
render();
