// Buying by bank deposit (how most Trinidad businesses already sell online), with an automatic receipt check.
// Honest limit: nothing here can see the bank account. A receipt is READ and sanity-checked, never proven. Anything that does not
// pass cleanly is held for the owner, who approves it from /training/arc42/course/admin/ against the bank statement.
// Also honest: an access code is the course key, so it cannot be taken back once given.

export const BANK = { name: 'Royal Bank (Trinidad and Tobago) Limited', branch: 'St Augustine Shopping Centre, St Augustine', account: '110000005001825' };
export const OFFERS = { arc42: { ttd: 899, usd: 129, title: 'Mastering arc42, online course', welcome: '/training/arc42/course/welcome/', learn: '/training/arc42/course/learn/' },
  cybersecurity: { ttd: 2799, usd: 399, title: 'Cybersecurity for the Agentic Era, online course', welcome: '/training/cybersecurity/course/welcome/', learn: '/training/cybersecurity/course/learn/' },
  'software-architecture-foundations': { ttd: 1049, usd: 149, title: 'Software Architecture Foundations, online course', welcome: '/training/software-architecture-foundations/course/welcome/', learn: '/training/software-architecture-foundations/course/learn/' },
  'quality-decisions': { ttd: 1399, usd: 199, title: 'Quality, Decisions and Evaluation, online course', welcome: '/training/quality-decisions/course/welcome/', learn: '/training/quality-decisions/course/learn/' },
  'agentic-architecture': { ttd: 1749, usd: 249, title: 'Agentic AI Architecture, online course', welcome: '/training/agentic-architecture/course/welcome/', learn: '/training/agentic-architecture/course/learn/' } };

// arc42 uses the master key itself; every other course has its own key derived from it, so one course's codes never open another.
export async function courseKeyFor(masterB64u, course) {
  if (course === 'arc42') return masterB64u;
  const raw = Uint8Array.from(atob(masterB64u.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('course:' + course)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const MAX_IMAGE = 1_200_000, MAX_TRIES = 5, MAX_AGE_DAYS = 7;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, ref TEXT NOT NULL, course TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
    amount REAL NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, decided INTEGER, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, hash TEXT NOT NULL, txn TEXT,
    image TEXT, read TEXT, verdict TEXT, reasons TEXT, created INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS receipts_hash ON receipts (hash)',
];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const bad = (m, s = 400) => json({ error: m }, s);
const NAME = /^[^<>{}\\\u0000-\u001f]{2,60}$/u, EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const newId = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const newRef = () => 'IC-' + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const sha256 = async (u8) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', u8)));
const utf8b64u = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Pure and tested: decides whether what was read from a receipt is good enough to unlock at once.
export function judge(f, order, now) {
  const why = [];
  if (!f || typeof f !== 'object') return { pass: false, reasons: ['Could not read the receipt'], txn: null };
  const amt = Number(String(f.amount ?? '').replace(/[^0-9.]/g, ''));
  if (!(amt >= order.amount && amt <= order.amount * 2)) why.push(`Amount ${f.amount ?? 'not found'} (needs ${order.amount})`);
  const cur = norm(f.currency);
  if (cur && !/^(TTD|TT|TTS|\$)$/.test(cur) && !cur.includes('TT')) why.push(`Currency ${f.currency}`);
  const acct = digits(f.to_account), full = BANK.account;
  if (!(acct.includes(full) || (acct.length >= 4 && acct.slice(-4) === full.slice(-4)))) why.push('Receiving account does not match');
  const t = Date.parse(f.date);
  if (!Number.isFinite(t)) why.push('Date not found');
  else if (t < order.created - 2 * 864e5 || t < now - MAX_AGE_DAYS * 864e5 || t > now + 2 * 864e5) why.push('Date is outside the last week');
  const txn = norm(f.txn);
  if (txn.length < 6) why.push('No transaction number found');
  if (f.looks_edited === true) why.push('Looks edited');
  return { pass: why.length === 0, reasons: why, refSeen: norm(f.reference).includes(norm(order.ref)), txn: txn.length >= 6 ? txn : null };
}

const PROMPT = `You read bank transfer or deposit receipts. Reply with ONE JSON object and nothing else, with keys:
amount (number, the amount transferred), currency (string), to_account (string, the receiving account number exactly as printed, masked digits allowed),
date (YYYY-MM-DD), reference (string, the description/reference typed by the sender, or ""), txn (string, the bank's transaction/confirmation number), looks_edited (true only if the image clearly looks altered, else false).
Use null for anything you cannot read. Do not guess.`;

export async function readReceipt(env, bytes) {
  if (!env.AI) return null;
  const run = () => env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: PROMPT, image: [...bytes], max_tokens: 400 });
  let out;
  try { out = await run(); } catch (e) {
    if (!/agree|5016/i.test(String(e && e.message))) return null;
    try { await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' }); out = await run(); } catch { return null; }
  }
  const text = typeof out === 'string' ? out : out && (out.response ?? out.description ?? '');
  const m = typeof text === 'object' ? text : (String(text).match(/\{[\s\S]*\}/) || [])[0];
  try { return typeof m === 'object' ? m : JSON.parse(m); } catch { return null; }
}

let ready = null;
const ensure = (db) => ready || (ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; }));
const orderOf = (db, id) => (/^[0-9a-f]{32}$/.test(id || '') ? db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first() : null);

async function createOrder(db, body, now) {
  const offer = OFFERS[body.course];
  if (!offer) return bad('This course is not on sale online yet.', 404);
  const name = String(body.name || '').trim().replace(/\s+/g, ' '), email = String(body.email || '').trim();
  if (!NAME.test(name)) return bad('Enter your name (2 to 60 characters). It is printed on your lessons and certificate.');
  if (!EMAIL.test(email)) return bad('Enter a valid email address.');
  const id = newId(), ref = newRef();
  await db.prepare('INSERT INTO orders (id, ref, course, name, email, amount, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ref, body.course, name, email, offer.ttd, 'awaiting', now).run();
  return json({ id, ref, amount: offer.ttd, bank: BANK });
}

// Phone notification to the owner through ntfy.sh (free, no account). The topic is a long random name kept in the secrets; if it is not set, nothing is sent.
export async function notify(S, { title, message, priority = 3, tags = '', click = '' }) {
  if (!S || !S.ntfyTopic) return false;
  try {
    const headers = { Title: title, Priority: String(priority) };
    if (tags) headers.Tags = tags;
    if (click) headers.Click = click;
    const r = await fetch('https://ntfy.sh/' + encodeURIComponent(S.ntfyTopic), { method: 'POST', headers, body: message, signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}
const money = (o) => `TT$${o.amount}`;
const courseName = (o) => (OFFERS[o.course] && OFFERS[o.course].title) || o.course;

async function receipt(db, env, id, bytes, now) {
  const order = await orderOf(db, id);
  if (!order) return bad('We could not find that order.', 404);
  if (order.status === 'paid') return json({ status: 'paid' });
  if (order.status === 'rejected') return bad('We could not confirm this payment. Please message us on WhatsApp.', 403);
  if (!bytes.length || bytes.length > MAX_IMAGE) return bad('That photo is too large or empty. Try again.', 413);
  const tries = (await db.prepare('SELECT COUNT(*) AS n FROM receipts WHERE order_id = ?').bind(id).first()).n;
  if (tries >= MAX_TRIES) { await db.prepare("UPDATE orders SET status = 'review' WHERE id = ? AND status != 'paid'").bind(id).run(); return json({ status: 'review', note: 'Too many tries. We will check it by hand.' }); }
  const hash = await sha256(bytes);
  const dupe = await db.prepare('SELECT order_id FROM receipts WHERE hash = ? AND order_id != ?').bind(hash, id).first();
  if (dupe) return bad('That receipt was already used for another order.', 409);
  const read = await readReceipt(env, bytes);
  const v = judge(read, order, now);
  let reasons = v.reasons;
  if (v.pass && v.txn) {
    const used = await db.prepare("SELECT order_id FROM receipts WHERE txn = ? AND order_id != ? AND verdict = 'pass'").bind(v.txn, id).first();
    if (used) { v.pass = false; reasons = ['That transaction number was already used']; }
  }
  await db.prepare('INSERT INTO receipts (order_id, hash, txn, image, read, verdict, reasons, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, hash, v.txn, btoa(String.fromCharCode(...bytes)), JSON.stringify(read), v.pass ? 'pass' : 'hold', JSON.stringify(reasons), now).run();
  if (v.pass) {
    await db.prepare("UPDATE orders SET status = 'paid', decided = ?, note = 'auto' WHERE id = ?").bind(now, id).run();
    await notify(env.SECRETS, { title: 'New sale', message: `${order.name} <${order.email}> paid ${money(order)} for ${courseName(order)}. Ref ${order.ref}. The receipt passed the automatic check and the course is open.`, priority: 3, tags: 'moneybag' });
    return json({ status: 'paid' });
  }
  await db.prepare("UPDATE orders SET status = 'review' WHERE id = ? AND status != 'paid'").bind(id).run();
  await notify(env.SECRETS, { title: 'Check this receipt', message: `${order.name} <${order.email}> sent a receipt for ${money(order)} (${courseName(order)}), ref ${order.ref}. The automatic check could not confirm it (${reasons.join('; ') || 'unreadable'}). The course is OPEN for them now. Confirm the deposit in your bank, or revoke access on the orders page.`, priority: 4, tags: 'warning', click: 'https://meeting-mind.com' + (OFFERS[order.course] ? OFFERS[order.course].learn.replace(/learn\/$/, 'admin/') : '/') });
  return json({ status: 'review' });
}

async function claim(db, S, id) {
  const o = await orderOf(db, id);
  if (!o) return bad('We could not find that order.', 404);
  if (o.status === 'rejected') return bad('We could not confirm this payment. Please message us on WhatsApp.', 403);
  // 'review' means the automatic check could not read the receipt. The buyer gets the course now and the owner is told to look at it.
  if (o.status !== 'paid' && o.status !== 'review') return json({ status: o.status, ref: o.ref }, 202);
  return json({ status: o.status, provisional: o.status === 'review', code: utf8b64u(JSON.stringify({ v: 1, b: o.name, k: await courseKeyFor(S.courseKey, o.course) })), name: o.name, course: o.course, learn: OFFERS[o.course].learn });
}

const same = (a, b) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

async function admin(db, S, request, route, now) {
  const key = request.headers.get('x-admin-key') || '';
  if (!S.adminKey || !same(key, S.adminKey)) return bad('Not allowed.', 401);
  if (request.method === 'GET' && route === 'admin/list') {
    const rows = (await db.prepare("SELECT o.id, o.ref, o.name, o.email, o.amount, o.status, o.created, o.note, (SELECT reasons FROM receipts r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS reasons, (SELECT read FROM receipts r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS read, (SELECT id FROM receipts r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS receipt FROM orders o WHERE o.status != 'awaiting' ORDER BY (o.status = 'review') DESC, o.created DESC LIMIT 100").all()).results;
    return json({ orders: rows });
  }
  if (request.method === 'GET' && route === 'admin/image') {
    const r = await db.prepare('SELECT image FROM receipts WHERE id = ?').bind(Number(new URL(request.url).searchParams.get('id'))).first();
    return r ? json({ image: 'data:image/jpeg;base64,' + r.image }) : bad('No image.', 404);
  }
  if (request.method === 'POST' && route === 'admin/decide') {
    const b = await request.json(), o = await orderOf(db, b.id);
    if (!o) return bad('No such order.', 404);
    await db.prepare('UPDATE orders SET status = ?, decided = ?, note = ? WHERE id = ?').bind(b.approve ? 'paid' : 'rejected', now, 'owner', o.id).run();
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

export async function handle({ request, env, now = Date.now() }) {
  const url = new URL(request.url), route = url.pathname.replace(/^\/api\/pay\/?/, '').replace(/\/$/, '');
  if (request.method === 'GET' && route === 'region') return json({ tt: (request.cf && request.cf.country) === 'TT' || request.headers.get('cf-ipcountry') === 'TT' });
  const db = env.DB, S = env.SECRETS;
  if (!db || !S || !S.courseKey) return bad('Online buying is not switched on yet. Please message us on WhatsApp.', 503);
  try {
    await ensure(db);
    if (route.startsWith('admin/')) return await admin(db, S, request, route, now);
    if (request.method === 'POST' && route === 'order') return await createOrder(db, await request.json(), now);
    if (request.method === 'POST' && route === 'receipt') return await receipt(db, env, url.searchParams.get('o'), new Uint8Array(await request.arrayBuffer()), now);
    if (request.method === 'GET' && route === 'claim') return await claim(db, S, url.searchParams.get('o') || '');
    return bad('Not found.', 404);
  } catch {
    return bad('Something went wrong. Please try again in a moment, or message us on WhatsApp.', 503);
  }
}
