// Pure helpers for the Level 4 practice tools. Browser and tests both import this file (it is copied to the course as data.js).
// They check STRUCTURE only: whether a rule names its check, whether a tool contract is complete. They cannot tell if a rule is wise.
const words = (t) => (String(t).match(/\S+/g) || []).length;
export const VAGUE_RULE = ['loosely coupled', 'clean', 'good', 'appropriate', 'properly', 'best practice', 'where possible', 'as needed', 'secure', 'robust', 'scalable', 'maintainable', 'careful', 'sensible', 'reasonable'];

/* A finished rule: RULE-n: <statement>. Reason: <why>. VERIFIED_BY: <check>   or   REVIEWED_BY: <role> */
export function lintRules(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => /^(?:[-*]\s*)?(?:\*\*)?RULE-\d+/i.test(l));
  const rules = lines.map((l) => {
    const id = (l.match(/RULE-(\d+)/i) || [])[0].toUpperCase();
    const body = l.replace(/^(?:[-*]\s*)?(?:\*\*)?RULE-\d+\s*(?:\*\*)?\s*[:.\-]?\s*/i, '');
    const statement = body.split(/\bReason:/i)[0].replace(/\bVERIFIED_BY:.*$|\bREVIEWED_BY:.*$/i, '').trim();
    const reason = (body.match(/\bReason:\s*(.*?)(?=\bVERIFIED_BY:|\bREVIEWED_BY:|$)/i) || [, ''])[1].trim();
    const ver = (body.match(/\bVERIFIED_BY:\s*(\S[^\n]*)/i) || [, ''])[1].trim();
    const rev = (body.match(/\bREVIEWED_BY:\s*(\S[^\n]*)/i) || [, ''])[1].trim();
    const vague = VAGUE_RULE.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(statement));
    const problems = [];
    if (words(statement) < 5) problems.push('The statement is too short to be a rule.');
    if (vague.length) problems.push(`Vague wording (${vague.join(', ')}): say exactly what is forbidden or required.`);
    if (words(reason) < 3) problems.push('No reason. Add "Reason: ..." so an agent knows what the rule protects.');
    if (!ver && !rev) problems.push('No check. Add VERIFIED_BY: <test or tool> or REVIEWED_BY: <role>.');
    else if (ver && !rev && !/[\/._:]|\b(tests?|lint\w*|policy|checks?|ci)\b/i.test(ver)) problems.push('VERIFIED_BY must name a test, tool or file. If a person checks it, use REVIEWED_BY: <role>.');
    return { id, statement, reason, check: ver ? 'verified' : rev ? 'reviewed' : null, vague, problems, finished: problems.length === 0 };
  });
  const finished = rules.filter((r) => r.finished).length;
  return { rules, finished, total: rules.length, ok: rules.length > 0 && finished === rules.length };
}
export const RULE_CASES = [
  { text: 'RULE-1: Services should be loosely coupled. Reason: good design.', finished: false, why: 'Vague wording and no check named.' },
  { text: 'RULE-2: Order screens must not import the payment library; use PaymentPort. Reason: lets us swap providers. VERIFIED_BY: tests/architecture/test_imports.py', finished: true, why: 'A specific statement, a reason and an automated check.' },
  { text: 'RULE-3: issue_refund accepts 1 to 100 TT$ only. Reason: limits loss from a wrong refund.', finished: false, why: 'Specific and reasoned, but nothing says how it is verified.' },
  { text: 'RULE-4: A new external service needs a decision record. Reason: keeps decisions visible. REVIEWED_BY: tech lead in pull request review', finished: true, why: 'A rule a machine cannot check is fine if a named role reviews it.' },
  { text: 'RULE-5: Be careful with customer data. Reason: it is sensitive. VERIFIED_BY: code review', finished: false, why: '"Be careful" is not testable, and "code review" is not a named check or role.' },
  { text: 'RULE-6: Customer text is stored with source_label untrusted:customer. Reason: stops injected text acting as an instruction. VERIFIED_BY: tests/data/test_labels.py', finished: true, why: 'Specific, reasoned and tied to a test.' }
];

/* A tool contract, written as labelled lines. */
export const CONTRACT_FIELDS = [['name', 'Name'], ['purpose', 'Purpose'], ['inputs', 'Inputs'], ['outputs', 'Outputs'], ['effects', 'Side effects'], ['errors', 'Errors'], ['callers', 'Callers'], ['class', 'Class'], ['limit', 'Limit']];
export function lintContract(text) {
  const t = String(text || '');
  const get = (label) => (t.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:\\s*(.+)$`, 'im')) || [, ''])[1].trim();
  const v = Object.fromEntries(CONTRACT_FIELDS.map(([k, l]) => [k, get(l)]));
  const cls = /read[ -]?only/i.test(v.class) ? 'read' : /irreversible|external/i.test(v.class) ? 'irreversible' : /reversible/i.test(v.class) ? 'reversible' : '';
  const checks = [
    { id: 'purpose', label: 'A purpose in a full sentence', ok: words(v.purpose) >= 5, tip: 'Say in one sentence what the tool is for. The model reads this to decide when to call it.' },
    { id: 'inputs', label: 'Inputs with types or ranges', ok: words(v.inputs) >= 3 && /(string|number|integer|id|\d)/i.test(v.inputs), tip: 'Name each input with its type or range, for example "amount_ttd: number from 1 to 100".' },
    { id: 'outputs', label: 'Outputs described', ok: words(v.outputs) >= 2, tip: 'Say what the tool returns.' },
    { id: 'effects', label: 'Side effects stated (or "none")', ok: words(v.effects) >= 1, tip: 'Say what the tool changes in the world, or write "none".' },
    { id: 'errors', label: 'Errors listed', ok: words(v.errors) >= 2, tip: 'List the ways it can fail and what it returns.' },
    { id: 'callers', label: 'Who may call it', ok: words(v.callers) >= 1, tip: 'Name the role or agent allowed to call it. Default is nobody.' },
    { id: 'class', label: 'A class: read only, reversible or irreversible', ok: cls !== '', tip: 'Choose one of the three classes.' },
    { id: 'limit', label: 'A numeric limit and where it is enforced (changing tools)', ok: cls === 'read' ? true : /\d/.test(v.limit) && /(in the tool|in code|enforced|server|policy)/i.test(v.limit), tip: 'Give a number and say where the code enforces it, for example "100 TT$ per refund, enforced in the tool".' }
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score, total: checks.length, ok: score === checks.length, class: cls };
}
export const CONTRACT_EXAMPLE = 'Name: issue_refund\nPurpose: Refunds part or all of one paid order to the customer’s original payment method.\nInputs: order_id: string; amount_ttd: number from 1 to 100\nOutputs: refund_id and new order status\nSide effects: moves money; sends no message\nErrors: ALREADY_REFUNDED, CAP_EXCEEDED, NOT_PAID\nCallers: refunder agent only, with a vendor approval id\nClass: irreversible\nLimit: 100 TT$ per refund and one refund per order, enforced in the tool';
