// Certificates: a Cloudflare Pages Function on the free plan, same origin (/api/cert/...).
// A learner who holds a valid access code and whose course record meets the criteria claims a certificate.
// It gets a credential ID, and anyone can look the ID up (the verify page does) to see who it was issued to and when.
// As with the leaderboard, learners are trusted: the record comes from the learner's own device.

import { courseKeyFor } from './pay-api.js';
const ISSUABLE = { arc42: { lessons: 19, sections: 12, checks: 6, questions: 34 }, cybersecurity: { lessons: 28, sections: 28, checks: 5, questions: 84 }, 'software-architecture-foundations': { lessons: 14, sections: 14, checks: 6, questions: 70 }, 'quality-decisions': { lessons: 20, sections: 20, checks: 6, questions: 60 }, 'agentic-architecture': { lessons: 16, sections: 16, checks: 6, questions: 48 } }; // add a course here when it opens
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS certs (
    id TEXT PRIMARY KEY, course TEXT NOT NULL, name TEXT NOT NULL, issued INTEGER NOT NULL, record TEXT NOT NULL)`,
];
const json = (o, status = 200, cache = 'no-store') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
const bad = (m, s = 400) => json({ error: m }, s);
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I
const newId = () => 'IC-' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => ALPHABET[b % 32]).join('');
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : 0; };
const NAME = /^[^<>{}\\\u0000-\u001f]{2,60}$/u;

// The proof a browser sends is sha256('board-v1:' + the course key in its access code). arc42's key is the master key (compared with
// BOARD_PROOF); every other course has its own key derived from the master (see courseKeyFor), so its proof is worked out here.
async function proofFor(env, course) {
  if (course === 'arc42' || !env.SECRETS || !env.SECRETS.courseKey) return course === 'arc42' ? env.BOARD_PROOF : null;
  const key = await courseKeyFor(env.SECRETS.courseKey, course);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('board-v1:' + key)));
  return btoa(String.fromCharCode(...h)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let ready = null;
const ensure = (db) => ready || (ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; }));

async function issue(db, env, body, now) {
  const rule = ISSUABLE[body.course];
  if (!rule) return bad('This course does not issue certificates yet.', 404);
  const want = await proofFor(env, body.course);
  if (!want || body.proof !== want) return bad('This browser does not hold a valid access code.', 403);
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (!NAME.test(name)) return bad('Enter the name to print on the certificate (2 to 60 characters).');
  const r = body.record || {};
  const rec = { lessons: int(r.lessons), lessonsTotal: rule.lessons, sections: int(r.sections), sectionsTotal: rule.sections, checks: int(r.checks), checksTotal: rule.checks, mastered: int(r.mastered), questions: rule.questions };
  if (rec.lessons < rule.lessons || rec.sections < rule.sections || rec.checks < rule.checks || rec.mastered < Math.ceil(0.7 * rule.questions)) return bad('The course record does not meet the criteria yet.', 422);
  const id = newId();
  await db.prepare('INSERT INTO certs (id, course, name, issued, record) VALUES (?, ?, ?, ?, ?)').bind(id, body.course, name, now, JSON.stringify(rec)).run();
  return json({ id, issued: now });
}

async function lookup(db, id) {
  if (!/^IC-[2-9A-HJ-NP-Z]{12}$/.test(id)) return bad('That is not a credential ID.', 404);
  const r = await db.prepare('SELECT * FROM certs WHERE id = ?').bind(id).first();
  if (!r) return bad('No certificate has this ID.', 404);
  return json({ id: r.id, course: r.course, name: r.name, issued: r.issued, record: JSON.parse(r.record) }, 200, 'public, max-age=300');
}

export async function handle({ request, env }) {
  const db = env.DB;
  const route = new URL(request.url).pathname.replace(/^\/api\/cert\/?/, '').replace(/\/$/, '');
  if (!db) return bad('Certificates are not set up yet.', 503);
  try {
    await ensure(db);
    if (request.method === 'POST' && route === 'issue') return await issue(db, env, await request.json(), Date.now());
    if (request.method === 'GET' && route) return await lookup(db, route);
    return bad('Not found.', 404);
  } catch {
    return bad('Certificates are busy. Please try again in a moment.', 503);
  }
}
