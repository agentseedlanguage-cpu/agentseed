// The agent system design's health check, as a pure function (copied into the course by tools/agent-course.mjs).
// It checks structure and effort, never "correctness": a design needs a human reviewer, and the rubric is there for that.
export const MAIN = Array.from({ length: 16 }, (_, i) => 's' + (i + 1));
const words = (t) => (t.match(/\S+/g) || []).length;
const own = (t) => t.split('\n').filter((l) => !/^\*\*(Lab|Task \d+|Evidence to include:)(\.|\*\*)/.test(l) && !/^## /.test(l)).join('\n');

export function healthChecks({ text, started, arc42 }) {
  const out = [];
  const t = arc42();
  const miss = MAIN.filter((k) => !new RegExp(`^## ${k.slice(1)}\\. `, 'm').test(text(k)));
  out.push({ ok: !miss.length, label: 'All 16 section headings are present', detail: miss.length ? `Missing: ${miss.map((k) => '§' + k.slice(1)).join(', ')}` : '' });
  const todo = MAIN.filter((k) => !started(k));
  out.push({ ok: !todo.length, label: 'Every section has been started', detail: todo.length ? `Still the template: ${todo.map((k) => '§' + k.slice(1)).join(', ')}` : '' });
  const open = [];
  for (const k of MAIN.filter(started)) {
    const parts = text(k).split(/^\*\*Task (\d+)\.\*\*/m);
    for (let i = 1; i < parts.length; i += 2) {
      const body = parts[i + 1].split('\n').slice(1).join('\n').split(/\*\*Evidence to include:\*\*/)[0].replace(/_Your answer\._/g, '');
      if (words(body) < 12) open.push(`§${k.slice(1)} task ${parts[i]}`);
    }
  }
  const left = MAIN.filter((k) => started(k) && /_Your answer\._/.test(text(k)));
  out.push({ ok: !open.length && !left.length, label: 'Every task in a started section has a real answer (12 words or more) and no placeholder is left', detail: open.length ? `Needs an answer: ${open.slice(0, 8).join(', ')}${open.length > 8 ? '…' : ''}` : left.length ? `Placeholders in: ${left.map((k) => '§' + k.slice(1)).join(', ')}` : '' });
  // Budgets, hypotheses, costs and pass marks only work with numbers.
  const numeric = ['s3', 's5', 's13', 's14'].filter((k) => started(k) && !/\d/.test(own(text(k))));
  out.push({ ok: !numeric.length, label: 'Budget, hypothesis, cost and evaluation sections contain numbers', detail: numeric.length ? `No numbers in: ${numeric.map((k) => '§' + k.slice(1)).join(', ')}` : '' });
  // Every rule in section 7 names its check or its reviewer.
  const rules = own(text('s7')).split('\n').map((l) => l.trim()).filter((l) => /^(?:[-*]\s*)?(?:\*\*)?RULE-\d+/i.test(l));
  const unchecked = rules.filter((l) => !/(VERIFIED_BY|REVIEWED_BY):\s*\S+/i.test(l)).map((l) => (l.match(/RULE-\d+/i) || [''])[0].toUpperCase());
  const rulesOk = !started('s7') ? false : rules.length >= 6 && !unchecked.length;
  out.push({ ok: rulesOk, label: 'Section 7 has at least six rules and every rule names VERIFIED_BY or REVIEWED_BY', detail: !started('s7') ? 'Section 7 has not been started' : rules.length < 6 ? `Found ${rules.length} rules; write at least 6, each starting RULE-1:, RULE-2: and so on` : unchecked.length ? `No check named: ${unchecked.join(', ')}` : '' });
  const risky = /([\w.+-]+@[\w-]+\.[\w.]+)|(\b(password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*\S+)|([A-Za-z0-9+/_-]{32,})/i.test(t.replace(/`[^`]*`/g, ''));
  out.push({ ok: !risky, label: 'Nothing that looks confidential', detail: risky ? 'Found something that looks like an email address, a key or a password. Remove real secrets before you share this design.' : '' });
  return out;
}
