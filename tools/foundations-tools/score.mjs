// Scoring, mock assembly and the readiness report for the Level 1 mock exams. Pure functions, copied into the course for the browser.
// Intellica practice scoring (not the external exam's rules): single choice is all or nothing; choose-N adds 1/N for each correct pick and
// subtracts 1/N for each wrong pick, never below zero for the item; allocation scores the share of statements placed correctly.
export const QUOTA = { 1: 5, 2: 7, 3: 14, 4: 9, 5: 5 }; // 40 items, weighted towards chapter 3 as the curriculum is
export const READY = { perMock: 0.8, perChapter: 0.7, mocks: 3 }; // Intellica guidance, not an iSAQB rule

export function scoreItem(it, ans) {
  if (ans == null) return 0;
  if (it.type === 'single') return ans === it.key ? 1 : 0;
  if (it.type === 'multi') {
    const a = Array.isArray(ans) ? ans : [];
    const right = a.filter((i) => it.key.includes(i)).length, wrong = a.filter((i) => !it.key.includes(i)).length;
    return Math.max(0, (right - wrong) / it.key.length);
  }
  if (it.type === 'classify') {
    const a = Array.isArray(ans) ? ans : [];
    return it.items.filter((x, i) => a[i] === x.c).length / it.items.length;
  }
  return 0;
}
export const answered = (it, ans) => ans != null && (!Array.isArray(ans) || ans.some((x) => x !== undefined && x !== null));

// Deterministic forms: item i of a chapter goes to form i mod 5 until that form's quota is met. Leftovers are reserve.
export function assemble(bank, forms = 5) {
  const out = Array.from({ length: forms }, () => []), reserve = [];
  for (const ch of Object.keys(QUOTA)) {
    const items = bank.filter((x) => x.ch === +ch).sort((a, b) => a.id.localeCompare(b.id));
    const count = Array(forms).fill(0);
    items.forEach((it, i) => { const f = i % forms; if (count[f] < QUOTA[ch]) { out[f].push(it); count[f]++; } else reserve.push(it); });
  }
  out.forEach((f) => f.sort((a, b) => a.id.localeCompare(b.id)));
  return { forms: out, reserve };
}

export function report(items, answers, conf = {}) {
  const per = {}, goals = {};
  let total = 0, max = 0;
  for (const it of items) {
    const s = scoreItem(it, answers[it.id]);
    total += s; max += 1;
    const c = (per[it.ch] = per[it.ch] || { got: 0, of: 0 }); c.got += s; c.of += 1;
    for (const g of it.lg) { const x = (goals[g] = goals[g] || { got: 0, of: 0 }); x.got += s; x.of += 1; }
  }
  const sure = items.filter((it) => conf[it.id] === 'high'), unsure = items.filter((it) => conf[it.id] === 'low');
  const rate = (xs) => (xs.length ? xs.reduce((a, it) => a + (scoreItem(it, answers[it.id]) >= 1 ? 1 : 0), 0) / xs.length : null);
  return { score: max ? total / max : 0, points: total, of: max, chapters: per, goals, sureRight: rate(sure), unsureRight: rate(unsure), sureN: sure.length, unsureN: unsure.length };
}

// Practice-ready: three different mocks each at 80% or more, and no chapter below 70% in any of them.
export function readiness(results) {
  const ids = Object.keys(results || {});
  const ok = ids.filter((k) => results[k].score >= READY.perMock && Object.values(results[k].chapters).every((c) => c.of === 0 || c.got / c.of >= READY.perChapter));
  return { ready: ok.length >= READY.mocks, qualifying: ok.length, taken: ids.length };
}
