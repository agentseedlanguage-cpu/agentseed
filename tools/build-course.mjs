#!/usr/bin/env node
// Builds the online course for a workshop from its slide deck.
//   site/training/<id>/course/index.html          course home (lessons, enrol, access code)
//   site/training/<id>/course/<lesson>/index.html one page per lesson (a narrated slide player)
//   site/training/<id>/course/data/<lesson>.json  encrypted lesson (paid lessons only)
//   site/training/<id>/course/course.css          the slide look, scoped to .cstage
//
// Source of truth: the slide deck (site/training/<id>/deck-*/slides.js). Each "Part" is one lesson.
// Which lessons are free is set in training.json (workshop.course.free). Paid lessons are encrypted
// with AES-256-GCM. The key lives in COURSE_KEY (env) or .course-key (git-ignored), never in the site.
// A buyer's access code is made with: npm run course:code -- "Buyer name"
// Safe to run repeatedly: the same key gives the same plaintext, a fresh random IV each run.
//
// Usage: node tools/build-course.mjs [--print-lessons]

import fs from 'node:fs';
import path from 'node:path';
import { researchHtml } from './lab-html.mjs';
import vm from 'node:vm';
import crypto from 'node:crypto';

export const SITE = path.resolve('site');
// Always next to package.json, wherever the command is run from, so a key is never silently re-created elsewhere.
const KEYFILE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.course-key');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const slug = (s) => s.toLowerCase().replace(/[§·]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- key ---------- */

export function loadKey({ create = true } = {}) {
  if (process.env.COURSE_KEY) return Buffer.from(process.env.COURSE_KEY.trim(), 'base64url');
  if (fs.existsSync(KEYFILE)) return Buffer.from(fs.readFileSync(KEYFILE, 'utf8').trim(), 'base64url');
  if (!create) return null;
  const k = crypto.randomBytes(32);
  fs.writeFileSync(KEYFILE, b64u(k) + '\n', { mode: 0o600 });
  console.log('\n  NEW COURSE KEY created in .course-key');
  console.log('  Back it up now (a password manager is ideal). It is not in the repo. Without it you cannot');
  console.log('  issue access codes that work, and changing it locks out every buyer you already have.\n');
  return k;
}

function encrypt(key, id, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(id));
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]); // WebCrypto expects tag appended
  return { v: 1, id, iv: b64u(iv), ct: b64u(ct) };
}

/* ---------- check questions (answer key lives outside site/, so it is never published in the clear) ---------- */

const QUIZ_FILE = 'training-private/arc42-quiz.json';
let QUIZ = fs.existsSync(QUIZ_FILE) ? JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8')) : {};

/* ---------- read the deck ---------- */

function loadDeck(workshopDir) {
  const deck = fs.readdirSync(workshopDir).find((d) => d.startsWith('deck-'));
  if (!deck) throw new Error(`no deck-* folder in ${workshopDir}`);
  const src = fs.readFileSync(path.join(workshopDir, deck, 'slides.js'), 'utf8');
  const cut = src.indexOf('var st=document');
  if (cut < 0) throw new Error('slides.js layout changed: cannot find where the viewer starts');
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(0, cut) + '\n;this.__SL=SL;this.__dgx=dgx;', ctx, { timeout: 5000 });
  const SL = ctx.__SL, dgx = ctx.__dgx;
  let part = '';
  const slides = SL.map((s) => {
    if (s.p) part = s.p;
    return { part, t: s.t, o: !!s.o, e: s.e || 0, n: s.n || '', h: s.h };
  });
  return { slides, dgx, deck, css: fs.readFileSync(path.join(workshopDir, deck, 'slides.css'), 'utf8') };
}

function renderSlide(deck, s, index, total) {
  const body = s.h
    .replace(/<h1>/g, "<div class='h1'>").replace(/<\/h1>/g, '</div>') // the lesson page owns the one <h1>
    .replace(/@@(\w+)@@/g, (m, q) => deck.dgx(q))
    .replace(/\{\{slide:(.+?)\}\}/g, (m, t) => { const k = deck.slides.findIndex((y) => y.t === t); return k < 0 ? '?' : String(k + 1); });
  return `<div class='pt'>${s.part}</div>${body}${s.o ? "<span class='opt'>optional</span>" : ''}`;
}

const plain = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, (m) => ' ' + [...m.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((x) => x[1].replace(/<[^>]+>/g, '')).join('. ') + ' ')
  .replace(/<br\s*\/?>/g, '. ').replace(/<\/(li|p|h\d|tr|div)>/g, '. ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').replace(/\s+([.,?!:;])/g, '$1').replace(/\.\s*\./g, '.').trim();

/* ---------- CSS: the deck look, scoped to .cstage ---------- */

function scopedCss(css) {
  const rules = [];
  let depth = 0, cur = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    cur += ch;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { rules.push(cur.trim()); cur = ''; } }
  }
  const out = [];
  for (const r of rules) {
    if (r.startsWith('@')) continue; // print, motion, view-transition rules belong to the live deck viewer
    const i = r.indexOf('{');
    const sels = r.slice(0, i).split(',').map((x) => x.trim());
    const decl = r.slice(i);
    const keep = [];
    for (const sel of sels) {
      if (/^(html|body|\*|#hud|#bar|#notes|#ov|#cd|\.recb|#fsask|body\.|::)/.test(sel)) continue;
      if (sel === ':root') { keep.push('.cstage'); continue; }
      if (sel === '#stage') continue;
      keep.push(`.cstage ${sel}`);
    }
    if (keep.length) out.push(`${keep.join(', ')}${decl}`);
  }
  return out.join('\n');
}

/* ---------- wording computed from the data, so a page never contradicts the course ---------- */

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numWord = (n) => NUM_WORDS[n] || String(n);
const listNums = (a) => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
/* "the first two" when the free lessons open the course, otherwise "lessons 1 and 5". */
export function freeWording(lessons) {
  const nums = lessons.filter((l) => l.free).map((l) => l.num).sort((a, b) => a - b);
  const opening = nums.length > 0 && nums.every((n, i) => n === i + 1);
  const count = numWord(nums.length);
  const lessonsAre = opening ? `The first ${nums.length === 1 ? 'lesson is' : count + ' lessons are'}` : `${nums.length === 1 ? 'Lesson' : 'Lessons'} ${listNums(nums)} ${nums.length === 1 ? 'is' : 'are'}`;
  const short = opening ? `the first ${nums.length === 1 ? 'one' : count} free` : `${count} free (${nums.length === 1 ? 'lesson' : 'lessons'} ${listNums(nums)})`;
  return { nums, opening, short, sentence: `${lessonsAre} free and need no code.` };
}

/* ---------- lessons ---------- */

function buildLessons(deck, freeIds, skip = []) {
  const order = [];
  const byPart = new Map();
  const keyOf = (p) => (/^Appendix/.test(p) ? 'Appendix · Quiz and quick card' : p);
  deck.slides.forEach((s, i) => {
    const k = keyOf(s.part);
    if (skip.includes(slug(k))) return; // live-day logistics (breaks, lunch) mean nothing online
    if (!byPart.has(k)) { byPart.set(k, []); order.push(k); }
    byPart.get(k).push(i);
  });
  const total = deck.slides.length;
  return order.map((part, n) => {
    const idx = byPart.get(part);
    const id = slug(part);
    const slides = idx.map((i) => deck.slides[i]);
    const content = slides.filter((s) => /<h2>/.test(s.h) && !s.e);
    const pick = [];
    const want = Math.min(5, content.length);
    for (let k = 0; k < want; k++) pick.push(slides.indexOf(content[Math.floor((k * content.length) / want)]));
    const words = slides.reduce((a, s) => a + plain(s.h).split(' ').length, 0);
    const optional = slides.every((s) => s.o);
    return {
      id, n: n + 1, num: n + 1, part,
      title: part.replace(/^(Part\s+\w+|Appendix)\s*·\s*/, '').replace(/^(§\d+)\s+/, '$1 '),
      free: freeIds.includes(id), optional,
      minutes: Math.max(3, Math.round((words / 150) + slides.filter((s) => s.e).reduce((a, s) => a + s.e, 0))),
      titles: slides.map((s) => s.t),
      payload: {
        slides: idx.map((i, k) => renderSlide(deck, deck.slides[i], i + 1, total)),
        say: slides.map((s) => plain(s.h)),
        notes: slides.map((s) => s.n),
        exercise: slides.map((s) => s.e),
        titles: slides.map((s) => s.t),
        cards: pick,
        quiz: QUIZ[id] || [],
      },
    };
  });
}

/* ---------- pages ---------- */

let base = '';
let ENG = '/training/arc42/course'; // where this course's player files live
let COPY = { noun: 'arc42', own: 'your own arc42', doc: 'Your arc42', file: 'arc42.md', extra: 'The Doubles-to-Go arc42 and working app, with its tests', labFor: 'Write your own arc42 documentation' };
const LAB_TIPS = [
  'Set a timer for the step and write a rough first version before you polish. A rough answer is easier to improve than a blank page.',
  'Write for the next person who has to act on this, not for a marker. Use plain words and name things.',
  'Stuck on your own system? Use the sample case in the worked example for this step, then come back to yours.',
  'Prefer numbers, names and dates to adjectives. If you do not know a number, write your best estimate and label it as an estimate.',
  'Save often. Your work stays in this browser only, so download your file at the end of every session.',
];
let LAB = null; // the hands-on lab (site/training/<id>/lab.json), loaded per workshop in the run block

function page({ title, description, canonicalPath, body, bodyAttrs = '', extraHead = '' }) {
  const url = base + canonicalPath;
  return `<!doctype html>
<!-- Generated by tools/build-course.mjs from the slide deck and training.json. Edit those, not this file. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#f2b631">
  <link rel="canonical" href="${url}">
  <meta property="og:site_name" content="Intellica">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://meeting-mind.com/assets/og.png">
  <meta name="twitter:card" content="summary_large_image">
  ${extraHead}
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <script src="/kit/theme-init.js"></script>
  <link rel="stylesheet" href="/kit/tokens.css">
  <link rel="stylesheet" href="/kit/shell.css">
  <link rel="stylesheet" href="/training/training.css">
  <link rel="stylesheet" href="${ENG}/board.css">
  <link rel="stylesheet" href="${ENG}/course.css">
</head>
<body data-tab="training" data-generated="training" data-section="training"${bodyAttrs}>
  <a class="skip-link" href="#main">Skip to content</a>
  <div id="shell-header"></div>

  <main id="main" class="container tr">
${body}
  </main>

  <div id="shell-footer"></div>
  <script type="module" src="/kit/shell.js"></script>
  <script type="module" src="${ENG}/course.js"></script>
</body>
</html>
`;
}

function subnav(w, active) {
  const codeLink = '<li><a class="sn-code" href="/training/my-courses/">Enter access code</a></li>';
  const items = w.facilitator === null ? [['', 'Course overview'], ['course/', 'Online course'], ...(COPY.tools || [['course/lab/policy/', 'Policy tester'], ['course/lab/trace/', 'Trace spotter']])] : [['', 'Workshop'], ['course/', 'Online course'], ['guide/', 'Student guide'], ['register/', 'Register']];
  return `    <nav class="subnav" aria-label="${esc(w.title)}">
      <p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span>${esc(w.title)}</p>
      <ul>${items.map(([p, l]) => `<li><a href="${w.path}${p}"${p === active ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}${codeLink}</ul>
    </nav>`;
}

function enrolBlock(w, c, priceLabel) {
  const wa = `https://wa.me/${w.whatsapp}?text=${encodeURIComponent(`Hello, I\u2019d like access to the ${w.title} online course${c.price ? ` (${c.price.label})` : ''}.`)}`;
  return `<aside class="enrol" aria-label="Price and how to buy">
        <p class="eyebrow">Full course</p>
        <p class="c-price" data-price data-usd="${esc(priceLabel)}" data-ttd="${c.price && c.price.ttd ? esc(c.price.ttd) : ''}">${priceLabel}</p>
        <p class="muted small" data-price-note>${c.price && c.price.note ? esc(c.price.note) + ' ' : ''}${c.price ? 'Lifetime access to this edition.' : 'Confirmed when you enquire. No payment is taken on this site.'}</p>
        ${c.price && c.price.ttd ? `<div class="actions" data-tt hidden><button class="btn btn-primary" type="button" data-pay-open="${esc(w.id)}">Buy this course</button></div>` : ''}
        <div class="actions"><a class="btn btn-ghost contact-btn" href="${esc(wa)}" rel="noopener">${c.price ? 'Questions or another way to pay? WhatsApp' : 'Buy on WhatsApp'}</a></div>
      </aside>
      ${c.price && c.price.ttd ? payDialog() : ''}`;
}

function payDialog() {
  return `<dialog class="pay" data-pay aria-labelledby="pay-title">
    <form method="dialog" class="pay-x"><button class="btn btn-ghost" aria-label="Close">Close</button></form>
    <section data-step="1">
      <h2 id="pay-title">Buy by bank deposit</h2>
      <p class="muted">Three steps: your details, pay at the bank or online banking, then send us your receipt. Your course opens the moment you send the receipt.</p>
      <form data-pay-form novalidate>
        <label for="buy-name">Your name<input id="buy-name" name="name" autocomplete="name" required maxlength="60" placeholder="As it should appear on your certificate"></label>
        <label for="buy-email">Email<input id="buy-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <div class="actions"><button class="btn btn-primary" type="submit">Continue</button></div>
      </form>
    </section>
    <section data-step="2" hidden>
      <h2>Step 2 of 3: pay</h2>
      <p>Deposit <strong data-amount></strong> to:</p>
      <dl class="bank">
        <div><dt>Bank</dt><dd data-bank></dd></div>
        <div><dt>Branch</dt><dd data-branch></dd></div>
        <div><dt>Account number</dt><dd><span data-account></span> <button class="btn btn-ghost" type="button" data-copy-account>Copy</button></dd></div>
        <div><dt>Reference</dt><dd><strong data-ref></strong> <button class="btn btn-ghost" type="button" data-copy-ref>Copy</button></dd></div>
      </dl>
      <p class="muted small">Type the reference in the transfer description if your bank lets you. Pay the full amount. Keep the receipt or confirmation screen: you need it next.</p>
      <div class="actions"><button class="btn btn-primary" type="button" data-to-3>I have paid</button></div>
    </section>
    <section data-step="3" hidden>
      <h2>Step 3 of 3: send your receipt</h2>
      <p>Take a clear photo of the receipt or the confirmation screen. Make sure the amount, account number, date and transaction number are readable.</p>
      <div class="actions">
        <label class="btn btn-primary file">Scan with camera<input type="file" accept="image/*" capture="environment" data-file></label>
        <label class="btn btn-ghost file">Upload a photo or screenshot<input type="file" accept="image/*" data-file></label>
      </div>
      <p class="muted small" role="status" data-pay-msg></p>
    </section>
    <section data-step="4" hidden>
      <h2 data-done-title>Receipt received</h2>
      <p data-done-text></p>
      <div class="actions"><a class="btn btn-primary" data-done-link href="#">Continue</a></div>
    </section>
  </dialog>`;
}


function adminPage(w) {
  const body = `
    <nav class="subnav" aria-label="Owner"><p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span>Orders</p></nav>
    <section class="t-block" data-admin>
      <h1>Orders to check</h1>
      <form data-admin-key class="buy"><label for="ak">Owner key<input id="ak" type="password" autocomplete="off" required></label><div class="actions"><button class="btn btn-primary" type="submit">Open</button></div></form>
      <p class="muted" data-admin-msg></p>
      <div data-admin-list></div>
    </section>`;
  return page({ title: 'Orders | Intellica Training', description: 'Owner page.', canonicalPath: w.path + 'course/admin/', body, bodyAttrs: ' data-course="admin"', extraHead: '<meta name="robots" content="noindex">' });
}

function welcomePage(w, c) {
  const body = `
    <nav class="subnav" aria-label="${esc(w.title)}">
      <p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span><a href="${w.path}course/">${esc(w.title)} online course</a><span aria-hidden="true"> / </span>Welcome</p>
    </nav>
    <section class="t-block welcome" data-welcome data-home="${w.path}course/" data-learn="${w.path}course/learn/">
      <h1 data-welcome-title>Confirming your payment\u2026</h1>
      <p class="sub" data-welcome-msg>One moment.</p>
      <p data-welcome-wait hidden>Your receipt is with us. We confirm each one against the bank, usually within a few hours. <strong>Keep this page\u2019s address</strong>: come back to it and your code appears here the moment we confirm.</p>
      <div data-welcome-done hidden>
        <p>Your access code is saved in this browser and your course is open. <strong>Keep this page\u2019s address</strong> (bookmark it): it shows your code again on any device, any time.</p>
        <label for="w-code">Your access code<textarea id="w-code" readonly rows="3" spellcheck="false"></textarea></label>
        <div class="actions"><a class="btn btn-primary" href="${w.path}course/learn/">Open my course</a><button class="btn btn-ghost" type="button" data-copy>Copy my code</button></div>
      </div>
    </section>`;
  return page({ title: `Welcome | ${w.title} | Intellica Training`, description: 'Your access code.', canonicalPath: w.path + 'course/welcome/', body, bodyAttrs: ' data-course="welcome"', extraHead: '<meta name="robots" content="noindex">' });
}

function unlockBlock(probe) {
  return `<form class="unlock" data-unlock data-probe="${probe.url}" data-probe-id="${probe.id}" data-learn="${probe.learn || ''}" hidden>
        <label for="code">Access code<input id="code" name="code" autocomplete="off" spellcheck="false" placeholder="Paste the code from your email"></label>
        <div class="actions"><button class="btn btn-primary" type="submit">Unlock the course</button><button class="btn btn-ghost" type="button" data-forget hidden>Remove my code from this browser</button></div>
        <p class="muted small" role="status" data-unlock-msg></p>
      </form>`;
}

const labFor = (l) => (LAB ? LAB.steps.find((x) => x.id === l.id) : null);

function modulesHtml(w, c, byId) {
  return c.modules.map((m, mi) => `
        <section class="module" aria-labelledby="m${mi}" data-module>
          <header><h3 id="m${mi}">${esc(m.title)}</h3>${m.note ? `<p>${esc(m.note)}</p>` : ''}</header>
          <ol class="lessons" start="${m.lessons.length ? byId[m.lessons[0]].num : 1}">
${m.lessons.map((id) => { const l = byId[id]; return `            <li data-lesson="${l.id}" data-min="${l.minutes}" class="lesson${l.free ? ' is-free' : ''}">
              <a href="${w.path}course/${l.id}/"><span class="ln">${l.num}</span><span class="lt"><strong>${esc(l.title)}</strong><span class="lm">${l.titles.length} slides, about ${l.minutes} min${l.optional ? ', optional' : ''}${labFor(l) ? ` · lab ${labFor(l).minutes} min` : ''}</span></span></a>
              <span class="badge ${l.free ? 'badge-free' : 'badge-paid'}" data-badge>${l.free ? 'Free preview' : 'Course'}</span>
            </li>`; }).join('\n')}
          </ol>
        </section>`).join('');
}

function indexPage(w, c, lessons) {
  const first = lessons.find((l) => !l.free);
  const probe = { url: `${w.path}course/data/${first.id}.json`, id: first.id, learn: `${w.path}course/learn/` };
  const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const real = lessons.filter((l) => !l.optional);
  const hours = Math.round(real.reduce((a, l) => a + l.minutes, 0) / 60);
  const slideCount = lessons.reduce((a, l) => a + l.titles.length, 0);
  const exercises = lessons.reduce((a, l) => a + l.payload.exercise.filter(Boolean).length, 0);
  const firstFree = lessons.find((l) => l.free);
  // a real diagram slide from the deck, shown as a live preview of what the player looks like
  const pl = byId[c.preview.lesson];
  const pi = pl.payload.titles.indexOf(c.preview.slideTitle);
  const previewHtml = pl.payload.slides[pi < 0 ? 1 : pi];
  const modules = modulesHtml(w, c, byId);
  const price = c.price ? esc(c.price.label) : 'Price on enquiry';
  const body = `
${subnav(w, 'course/')}

    <section class="c-hero" aria-labelledby="c-t">
      <div class="c-hero-copy">
        <p class="eyebrow">Online course</p>
        <h1 id="c-t">${esc(c.headline)}</h1>
        <p class="lead">${esc(c.lead)}</p>
        <div class="actions">
          <a class="btn btn-primary" href="${w.path}course/${firstFree.id}/">Start the free lessons</a>
          <a class="btn btn-ghost" href="#get-t">Get the full course</a>
          <a class="btn btn-link" href="/training/my-courses/">I already have a code</a>
        </div>
        <p class="fine">${esc(c.honesty)}</p>
      </div>
      <figure class="c-preview" aria-label="A slide from the course" data-preview hidden>
        <div class="cstage-frame" data-frame><div class="cstage" data-stage>${'<section class="s on">' + previewHtml + '</section>'}</div></div>
        <figcaption>A real slide from “${esc(pl.title)}”. Every lesson is slides you can pause, read and replay.</figcaption>
        <div class="c-incl">
          <ul>
            <li>${lessons.length} lessons, ${freeWording(lessons).short}</li>
            <li>A transcript for every slide</li>
            ${LAB ? `<li>${LAB.steps.length} hands-on lab steps: write ${COPY.own}</li>` : ''}
            <li>Recall cards and spaced review</li>
            <li>${w.facilitator === null ? 'A worked case, field guide and model solution for every lesson' : 'The Doubles-to-Go worked example'}</li>
          </ul>
          <p class="c-incl-price">${c.price ? `${c.price.regular ? `<s>${esc(c.price.regular)}</s> ` : ''}<b>${esc(c.price.label)}</b> <span>lifetime access</span>` : '<span>Price on enquiry</span>'}</p>
        </div>
      </figure>
    </section>

    <div class="strip c-strip">
      <div><b>${lessons.length}</b><span>lessons</span></div>
      ${w.facilitator === null ? '' : `<div><b>${hours} hours</b><span>of study</span></div>`}
      <div><b>${slideCount}</b><span>slides with transcripts</span></div>
      ${w.facilitator === null ? `<div><b>${Object.values(QUIZ).reduce((n, q) => n + q.length, 0)}</b><span>recall questions with reasons</span></div>` : `<div><b>${exercises}</b><span>timed exercises</span></div>`}
      ${LAB ? `<div><b>${LAB.steps.length}</b><span>lab steps on ${COPY.own}</span></div>` : ''}
      ${w.facilitator === null ? '<div><b>1</b><span>verifiable certificate</span></div>' : '<div><b>1</b><span>worked example you can run</span></div>'}
    </div>

    ${LAB && c.lab ? `<section class="t-block c-lab" id="lab" aria-labelledby="lab-t">
      <p class="kicker"><span class="kn">01</span>${esc(c.lab.kicker)}</p>
      <h2 id="lab-t">${esc(c.lab.title)}</h2>
      <p class="sub">${esc(c.lab.lead)}</p>
      <div class="lx-show">
        <div class="lx-demo" data-lab-demo hidden>
          <p class="kicker-m">Try it</p>
          <h3>${esc(c.lab.demo.title)}</h3>
          <p class="muted small">${esc(c.lab.demo.text)}</p>
          <label class="lx-sr" for="lx-demo-t">Quality scenario, as a Markdown table row</label>
          <textarea id="lx-demo-t" rows="3" spellcheck="false" data-hint="${esc(c.lab.demo.hint)}">${esc(c.lab.demo.start)}</textarea>
          <ul class="lx-checks" data-demo-checks aria-live="polite"></ul>
          <p class="lx-msg" data-demo-msg></p>
        </div>
        <ul class="lx-points">
${c.lab.points.map((p) => `          <li><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('\n')}
        </ul>
      </div>
      <h3 class="lx-h">${LAB.steps.length} lab steps, one after each lesson</h3>
      <ol class="lx-steps">
${LAB.steps.map((x, i) => `        <li><span class="lx-n">${i + 1}</span><b>${esc(x.title)}</b><i>${x.minutes} min${x.free ? ' · free' : ''}</i></li>`).join('\n')}
      </ol>
      <div class="lx-out"><h3>${esc(c.lab.outcomes.title)}</h3><ul>${c.lab.outcomes.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </section>

    <section class="t-block c-research" id="research" aria-labelledby="res-t">
      ${researchHtml(c.lab.research, `<p class="kicker"><span class="kn">02</span>${esc(c.lab.research.kicker)}</p>`)}
    </section>
` : ''}
    <section class="t-block" aria-labelledby="how-t">
      <p class="kicker"><span class="kn">03</span>How it teaches</p>
      <h2 id="how-t">Built from how people learn</h2>
      <div class="cols c4">
${c.method.map((m) => `        <div><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p></div>`).join('\n')}
      </div>
      <p class="muted small">${c.evidence.map((e) => esc(e)).join(' ')}</p>
    </section>

    <section class="t-block" aria-labelledby="les-t">
      <p class="kicker"><span class="kn">04</span>Syllabus</p>
      <h2 id="les-t">${lessons.length} lessons in ${numWord(c.modules.length)} modules</h2>
      <p class="sub">Study in order or jump to what you need. ${freeWording(lessons).sentence}</p>
      <p class="progress" data-progress hidden></p>
      <div class="modules">${modules}
      </div>
    </section>

    <section class="t-block" aria-labelledby="due-t" data-due hidden>
      <p class="kicker"><span class="kn">05</span>Review</p>
      <h2 id="due-t">Ready to review today</h2>
      <ul class="due-list" data-due-list></ul>
    </section>

    <section class="t-block" aria-labelledby="get-t">
      <p class="kicker"><span class="kn">06</span>Access</p>
      <h2 id="get-t">Get the full course</h2>
      <div class="c-access">
        <div class="c-included">
          <h3>What you get</h3>
          <ul class="facts">
            <li>All ${lessons.length} lessons, in the player, on any device</li>
            <li>A transcript and read-aloud for every slide</li>
            ${LAB ? `<li>A hands-on lab: ${LAB.steps.length} steps that build ${COPY.own} in the browser, ready to download</li>` : ''}
            <li>Recall questions and spaced review</li>
            <li>${COPY.extra}</li>
            <li>Lifetime access to this edition</li>
          </ul>
          ${unlockBlock(probe)}
        </div>
        ${enrolBlock(w, c, price)}
      </div>
    </section>

${w.facilitator ? `    <section class="t-block" aria-labelledby="by-t">
      <p class="kicker"><span class="kn">05</span>Your instructor</p>
      <h2 id="by-t">${esc(w.facilitator.name)}</h2>
      <p class="sub">${esc(w.facilitator.role)}</p>
      <p>${esc(w.facilitator.bio)}</p>
      <ul class="chips">${w.facilitator.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="t-block" aria-labelledby="faq-t">
      <p class="kicker"><span class="kn">06</span>Questions</p>
      <h2 id="faq-t">Before you decide</h2>
      <div class="faqs">${c.faq.map((f) => `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
    </section>`;
  return page({
    title: `Online course | ${w.title} | Intellica Training`,
    description: c.lead,
    canonicalPath: w.path + 'course/',
    body,
    bodyAttrs: ' data-course="index"',
  });
}

// The learner's own page: where a buyer lands after entering a code. It is built like the course dashboards on large
// training sites: a clear next step, progress, the curriculum with status on every lesson, review, and resources.
// It holds nothing private (the lessons stay encrypted); without a valid code in this browser it sends you back to the course page.
function learnPage(w, c, lessons) {
  const first = lessons.find((l) => !l.free);
  const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const wa = `https://wa.me/${w.whatsapp}?text=${encodeURIComponent(`Hello, I need help with the ${w.title} online course.`)}`;
  const body = `
    <nav class="subnav" aria-label="${esc(w.title)}">
      <p class="crumb"><a href="/training/">Training</a><span aria-hidden="true"> / </span><a href="${w.path}course/">${esc(w.title)} online course</a><span aria-hidden="true"> / </span>My course</p>
    </nav>

    <div class="learn" data-learn-page data-probe-url="${w.path}course/data/${first.id}.json" data-probe-id="${first.id}" data-home="${w.path}course/" hidden>
      <section class="l-top" aria-labelledby="l-t">
        <div class="l-welcome">
          <p class="eyebrow">My course</p>
          <h1 id="l-t">Welcome<span data-name></span></h1>
          <p class="muted" data-licence></p>
        </div>
        <div class="l-resume">
          <p class="kicker-m" data-resume-k>Up next</p>
          <h2 data-next-title>Your first lesson</h2>
          <p class="muted" data-next-meta></p>
          <div class="cbar" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" data-pbar><i data-fill></i></div>
          <div class="actions"><a class="btn btn-primary" data-next-link href="${w.path}course/${first.id}/">Start lesson 1</a></div>
        </div>
      </section>

      <dl class="l-stats">
        <div class="l-ring" data-ring><span data-pct>0%</span></div>
        <div><dt data-done>0 of ${lessons.length}</dt><dd>lessons finished</dd></div>
        <div><dt data-left>${Math.round(lessons.reduce((a, l) => a + l.minutes, 0) / 60)} h</dt><dd>of study left</dd></div>
        <div><dt data-dueN>0</dt><dd>review questions due</dd></div>
      </dl>

      <div class="l-grid">
        <section class="l-main" aria-labelledby="l-cur">
          <h2 id="l-cur">Curriculum</h2>
          <div class="modules">${modulesHtml(w, c, byId)}
          </div>
        </section>
        <aside class="l-side" aria-label="Review and resources">
          ${c.noBoard ? '' : '<section class="l-card l-score" data-board-card aria-label="Your score"></section>'}
          ${LAB ? `<section class="l-card l-lab" data-lab-card data-lab-steps="${LAB.steps.map((x) => x.id).join(',')}" data-lab-titles="${esc(LAB.steps.map((x) => x.title).join('|'))}">
            <h2>Your lab</h2>
            <p class="muted small" data-lab-sum>${COPY.doc.replace('Your','Your own')}, built step by step after each lesson. ${LAB.steps.length} steps. Saved on this device.</p>
            <div class="cbar" aria-hidden="true"><i data-lab-fill></i></div>
            <a class="btn btn-primary" data-lab-link href="${w.path}course/lab/">Open your lab</a>
          </section>` : ''}
          ${`<section class="l-card l-cert" data-cert-card data-course="${w.id}" data-title="${esc(w.title)}" aria-label="Your certificate"></section>`}
          <section class="l-card" data-due hidden>
            <h2>Review today</h2>
            <p class="muted small">Questions you missed or are due again. A few minutes now saves hours later.</p>
            <ul class="due-list" data-due-list></ul>
          </section>
          <section class="l-card">
            <h2>Resources</h2>
            <ul class="l-links">
              ${w.facilitator === null ? `<li><a href="${w.path}">Course overview</a></li><li><a href="${w.path}course/lab/">${COPY.doc}</a></li>` : `<li><a href="${w.path}example/">Worked example: Doubles-to-Go</a></li>
              <li><a href="${w.path}guide/">Student guide</a></li>
              <li><a href="${w.path}example/doubles-to-go.zip" download>Download the example (zip)</a></li>`}
            </ul>
          </section>
          <section class="l-card">
            <h2>Need help?</h2>
            <p class="muted small">Questions about a lesson, your access code or the material.</p>
            <a class="btn btn-ghost contact-btn" href="${esc(wa)}" rel="noopener">Message sales on WhatsApp</a>
          </section>
          <p class="muted small" data-forget-wrap>Not your code? <button class="linklike" type="button" data-forget-learn>Remove it from this browser</button></p>
        </aside>
      </div>
    </div>
    <noscript><p class="lead">This page needs JavaScript to check your access code. <a href="${w.path}course/">Go to the course page</a>.</p></noscript>`;
  return page({ title: `My course: ${w.title} online`, description: `Your lessons, progress and review for the ${w.title} online course.`, canonicalPath: `${w.path}course/learn/`, body, bodyAttrs: ' data-course="learn"', extraHead: '<meta name="robots" content="noindex">' });
}

function lessonPage(w, c, l, lessons, key) {
  const i = lessons.indexOf(l);
  const prev = lessons[i - 1], next = lessons[i + 1];
  const outline = l.titles.map((t) => `<li>${esc(t)}</li>`).join('');
  let dataAttr, inline = '';
  if (l.free) {
    dataAttr = ` data-plain="${w.path}course/data/${l.id}.json"`;
  } else {
    dataAttr = ` data-enc="${w.path}course/data/${l.id}.json"`;
  }
  const body = `
${subnav(w, 'course/')}

    <section class="t-hero t-hero-single lesson-head" aria-labelledby="l-t">
      <p class="eyebrow"><a href="${w.path}course/" data-course-home>Online course</a> · Lesson ${l.num} of ${lessons.length}${l.optional ? ' · optional' : ''}</p>
      <h1 id="l-t">${esc(l.title)}</h1>
      <p class="lead">${l.titles.length} slides, about ${l.minutes} minutes. ${l.free ? 'This lesson is a free preview.' : 'Part of the full course.'}</p>
    </section>

    <div class="player" data-player data-lesson="${l.id}"${dataAttr}>
      <div class="locked" data-locked hidden>
        <h2>This lesson is part of the full course</h2>
        <p>Here is what it covers:</p>
        <ol class="outline">${outline}</ol>
        <p>Paste your access code to unlock it, or read how to get one.</p>
        ${unlockBlock({ url: `${w.path}course/data/${l.id}.json`, id: l.id, learn: `${w.path}course/learn/` })}
        <div class="actions"><a class="btn btn-primary" href="${w.path}course/#get-t">Get access</a></div>
      </div>
      <div class="stage-wrap" data-stage-wrap hidden>
        <div class="c-main">
          <div class="theatre" data-theatre><div class="cstage-frame" data-frame><div class="cstage" data-stage role="img" aria-label="Lesson slide"></div></div></div>
          <div class="cbar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="100" data-bar><i data-fill></i></div>
          <div class="controls" role="group" aria-label="Lesson controls">
            <button class="btn btn-ghost" data-prev>Back</button>
            <span class="pos" data-pos aria-live="polite"></span>
            <button class="btn btn-primary" data-next>Next</button>
            <button class="btn btn-ghost" data-reveal hidden>Reveal</button>
            <button class="btn btn-ghost" data-speak aria-pressed="false">Read aloud</button>
            <button class="btn btn-ghost" data-full type="button">Full screen</button>
            <label class="rate">Speed<select data-rate><option value="0.85">Slower</option><option value="1" selected>Normal</option><option value="1.2">Faster</option></select></label>
          </div>
          <p class="licence muted small" data-licence></p>
          <details class="transcript" open><summary>Transcript and notes</summary><div data-transcript></div></details>
        </div>
        <aside class="c-side" aria-label="In this lesson">
          <h2>In this lesson</h2>
          <ol class="c-outline" data-outline></ol>
        </aside>
      </div>
      <div class="recall" data-recall hidden>
        <h2>Pause and recall</h2>
        <p class="sub">Close your eyes or look away, and say what you remember before you reveal each answer. Trying to remember is what makes it stick.</p>
        <div data-cards></div>
      </div>
      <section class="recall quiz" data-quiz hidden></section>
      <section class="reading" data-reading hidden aria-label="Field guide and worked case"></section>
      <noscript><p>The lesson player needs JavaScript. If you cannot use it, write to us and we will send the material another way.</p></noscript>
    </div>

    ${labCta(w, l)}

    <nav class="lesson-nav" aria-label="Lessons">
      ${prev ? `<a class="btn btn-ghost" href="${w.path}course/${prev.id}/">&larr; ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn btn-ghost" href="${w.path}course/${next.id}/">${esc(next.title)} &rarr;</a>` : ''}
    </nav>
    ${inline}`;
  return page({
    title: `${l.title} | Online course | ${w.title}`,
    description: `Lesson ${l.num} of the ${w.title} online course: ${l.titles.slice(0, 4).join(', ')}.`,
    canonicalPath: `${w.path}course/${l.id}/`,
    body,
    bodyAttrs: ' data-course="lesson"',
  });
}

/* ---------- the hands-on lab ---------- */

// Reads lab.json and joins the lesson order onto each step. A step whose lesson does not exist is an error, not a silent skip.
function loadLab(dir, lessons) {
  const f = path.join(dir, 'lab.json');
  if (!fs.existsSync(f)) return null;
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const keys = new Set(raw.sections.map((x) => x.key));
  const steps = raw.steps.map((st) => {
    const l = lessons.find((x) => x.id === st.id);
    if (!l) throw new Error(`lab.json: step "${st.id}" names an unknown lesson`);
    for (const k of st.sections) if (!keys.has(k)) throw new Error(`lab.json: step "${st.id}" names an unknown section "${k}"`);
    const nx = lessons[lessons.indexOf(l) + 1];
    return { ...st, free: l.free, lessonNum: l.num, lessonTitle: l.title, next: nx ? { id: nx.id, title: nx.title } : null };
  });
  steps.sort((a, b) => a.lessonNum - b.lessonNum);
  return { sections: raw.sections, steps };
}

// Pulls each section out of the worked example so a student can read the finished version next to their own.
function exampleSections(dir) {
  const f = path.join(dir, 'example', 'arc42.md');
  const out = {};
  if (!fs.existsSync(f)) return out;
  const text = fs.readFileSync(f, 'utf8');
  const parts = text.split(/^## /m);
  const cap = (t) => { const L = t.trim().split('\n'); return L.length > 70 ? L.slice(0, 70).join('\n') + '\n\n…(the full example is in the worked example)' : L.join('\n'); };
  out.head = cap(parts[0].split('\n').slice(2).join('\n').split('---')[0]);
  for (const part of parts.slice(1)) {
    const m = part.match(/^(\d+)\. /);
    if (m) out['s' + m[1]] = cap('## ' + part.replace(/\n---\s*$/, ''));
  }
  return out;
}

function labCta(w, l) {
  const st = LAB && LAB.steps.find((x) => x.id === l.id);
  if (!st) return '';
  return `<aside class="lab-cta" data-lab-cta data-step="${st.id}" hidden aria-labelledby="lab-cta-t">
      <p class="kicker-m">Hands-on lab · ${st.minutes} min</p>
      <h2 id="lab-cta-t">${esc(st.title)}</h2>
      <p class="muted" data-lab-meta>Apply this lesson to ${COPY.own}. It opens where you left off, and saves on this device as you type.</p>
      <div class="actions"><a class="btn btn-primary" href="${w.path}course/lab/?step=${st.id}">Open this lab step</a></div>
    </aside>`;
}

function labPage(w, c, lessons) {
  const first = lessons.find((l) => !l.free);
  const body = `
${subnav(w, 'course/')}
    <div class="lab" data-lab-page data-index="${w.path}course/data/lab-index.json" data-course-url="${w.path}course/" data-learn="${w.path}course/learn/" data-probe-url="${w.path}course/data/${first.id}.json" data-probe-id="${first.id}" data-example="${w.path}example/" hidden>
      <header class="lab-top">
        <div class="lab-title">
          <p class="eyebrow">Hands-on lab</p>
          <h1>${COPY.doc}</h1>
        </div>
        <label class="lab-sys">System name<input data-sys type="text" autocomplete="off" spellcheck="false" maxlength="80" placeholder="${w.facilitator === null ? (COPY.sysEx || 'e.g. Claims-Assistant agent') : 'e.g. Doubles-to-Go'}"></label>
        <div class="lab-tools" role="group" aria-label="Document actions">
          <span class="lab-status muted small" role="status" data-status>Saved on this device</span>
          <button class="btn btn-ghost" type="button" data-download>Download ${COPY.file}</button>
          ${w.facilitator === null ? '<button class="btn btn-ghost" type="button" data-download-json>Download JSON</button>' : ''}
          <button class="btn btn-ghost" type="button" data-download-agents hidden>Download AGENTS.md</button>
          <button class="btn btn-ghost" type="button" data-import>Import .md</button>
          <button class="btn btn-ghost" type="button" data-reset>Start over</button>
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" data-file hidden aria-label="Import a Markdown file">
        </div>
      </header>

      <div class="lab-stepbar" role="group" aria-label="Lab steps">
        <button class="btn btn-ghost" type="button" data-prev aria-label="Previous step">&larr;</button>
        <label class="lab-pick">Step<select data-step-select></select></label>
        <button class="btn btn-ghost" type="button" data-next aria-label="Next step">&rarr;</button>
        <div class="lab-prog"><span class="muted small" data-prog>0 of 0 steps done</span><div class="cbar" aria-hidden="true"><i data-prog-fill></i></div></div>
        <p class="muted small lab-note">Your work is stored in this browser only. Download it often: clearing browser data removes it.</p>
      </div>

      <div class="lab-grid">
        <div class="lab-main">
          <section class="lab-step" data-step-panel aria-live="polite" aria-label="Current lab step"></section>

          <section class="lab-editor" aria-label="Document editor">
            <div class="lab-secs" role="tablist" aria-label="Sections" data-secs></div>
            <div class="lab-bar">
              <div class="lab-views" role="group" aria-label="View">
                <button type="button" class="seg is-on" data-view="write" aria-pressed="true">Write</button>
                <button type="button" class="seg" data-view="preview" aria-pressed="false">Preview</button>
                <button type="button" class="seg" data-view="whole" aria-pressed="false">Whole document</button>
              </div>
              <div class="lab-snips" role="group" aria-label="Insert" data-snips></div>
            </div>
            <textarea class="lab-text" data-text spellcheck="false" aria-label="Section text (Markdown)"></textarea>
            <div class="lab-preview" data-preview hidden></div>
            <p class="muted small lab-count" data-count></p>
            <div class="lab-mirror" data-mirror hidden>
              <p class="small"><strong>Process mirror.</strong> <span data-mirror-text></span></p>
              <div class="mi-bar" data-mirror-bar aria-hidden="true"></div>
              <p class="muted small">A private view of how this document was written, kept on your device. It does not judge: pasted notes and reviewed suggestions are a normal part of the work.</p>
            </div>
          </section>

          <details class="lab-check" data-check>
            <summary><span>Health check</span><span class="badge" data-check-badge>0 issues</span></summary>
            <p class="muted small">Quick automatic checks, like the ones a reviewer does by eye. They catch gaps, not quality.</p>
            <ul data-check-list></ul>
          </details>
        </div>
      </div>
    </div>
    <noscript><p class="lead">The lab needs JavaScript. It runs entirely in your browser.</p></noscript>`;
  return page({ title: `Lab: ${COPY.own} | ${w.title} online`, description: `${COPY.labFor} inside the ${w.title} course, one lesson at a time.`, canonicalPath: `${w.path}course/lab/`, body, bodyAttrs: ' data-course="lab"', extraHead: '<meta name="robots" content="noindex">' });
}

/* ---------- run ---------- */

/* ---------- run ---------- */

export function deriveKey(master, courseId) {
  return crypto.createHmac('sha256', master).update(`course:${courseId}`).digest();
}

/* Builds one course: lessons, lab, pages and encrypted data. arc42 and the cybersecurity course both go through here. */
function buildOne({ w, c, deck, quiz, lab, key, engine = null, reading = null }) {
  const dir = path.join(SITE, w.path.replace(/^\//, ''));
  QUIZ = quiz;
  const lessons = buildLessons(deck, c.free || [], c.skip || []);
  for (const k of Object.keys(QUIZ)) if (!lessons.some((l) => l.id === k)) throw new Error(`quiz: "${k}" is not a lesson`);
  {
    const order = c.modules.flatMap((m) => m.lessons);
    const rank = (l) => { const i = order.indexOf(l.id); return i < 0 ? 999 + lessons.indexOf(l) : i; };
    lessons.sort((a, b) => rank(a) - rank(b));
    lessons.forEach((l, i) => { l.num = i + 1; });
  }
  for (const f of c.free || []) if (!lessons.some((l) => l.id === f)) throw new Error(`course.free names an unknown lesson: ${f}`);
  for (const m of c.modules) for (const id of m.lessons) if (!lessons.some((l) => l.id === id)) throw new Error(`module "${m.title}" names an unknown lesson: ${id}`);
  LAB = lab ? lab(lessons) : null;
  if (process.argv.includes('--print-lessons')) { for (const l of lessons) console.log(l.id.padEnd(34), String(l.titles.length).padStart(3), 'slides', l.free ? 'FREE' : '    ', l.title); return lessons.length; }
  const out = path.join(dir, 'course');
  ENG = `${w.path}course`.replace(/\/$/, '');
  fs.rmSync(path.join(out, 'data'), { recursive: true, force: true });
  for (const e of fs.existsSync(out) ? fs.readdirSync(out, { withFileTypes: true }) : []) if (e.isDirectory() && e.name !== 'audio') fs.rmSync(path.join(out, e.name), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  if (engine) engine(out);
  fs.writeFileSync(path.join(out, 'course.css'), `/* Generated by tools/build-course.mjs: the deck's own look, scoped to .cstage, plus the course layout. */\n${scopedCss(deck.css)}\n${fs.readFileSync(path.join(SITE, 'training', 'course-layout.css'), 'utf8')}`);
  fs.writeFileSync(path.join(out, 'index.html'), indexPage(w, c, lessons));
  if (LAB) {
    const join = (a) => (Array.isArray(a) ? a.join('\n') : a);
    const idx = { sections: LAB.sections.map((x) => ({ key: x.key, title: x.title, short: x.short, extra: !!x.extra, template: join(x.template), snippets: (x.snippets || []).map((n) => ({ label: n.label, text: join(n.text) })) })),
      steps: LAB.steps.map((x) => ({ id: x.id, title: x.title, sections: x.sections, minutes: x.minutes, free: x.free, lessonNum: x.lessonNum, lessonTitle: x.lessonTitle, next: x.next })) };
    fs.writeFileSync(path.join(out, 'data', 'lab-index.json'), JSON.stringify(idx));
    fs.writeFileSync(path.join(out, 'data', 'board-index.json'), JSON.stringify({ total: Object.values(QUIZ).reduce((n, q) => n + q.length, 0) }));
    for (const st of LAB.steps) {
      const detail = { brief: st.brief, do: st.do, done: st.done, experienced: st.experienced || '', hints: st.hints || [], mistakes: st.mistakes || [], tips: st.tips || LAB_TIPS, example: st.example !== undefined ? st.example : (EXAMPLES[st.sections[0]] || ''), exampleKey: st.sections[0] };
      const fid = `lab-${st.id}`;
      fs.writeFileSync(path.join(out, 'data', `${fid}.json`), JSON.stringify(st.free ? detail : encrypt(key, fid, detail)));
    }
    fs.mkdirSync(path.join(out, 'lab'), { recursive: true });
    fs.writeFileSync(path.join(out, 'lab', 'index.html'), labPage(w, c, lessons));
  }
  if (c.price) { fs.mkdirSync(path.join(out, 'welcome'), { recursive: true }); fs.writeFileSync(path.join(out, 'welcome', 'index.html'), welcomePage(w, c)); }
  if (c.price) { fs.mkdirSync(path.join(out, 'admin'), { recursive: true }); fs.writeFileSync(path.join(out, 'admin', 'index.html'), adminPage(w)); }
  fs.mkdirSync(path.join(out, 'learn'), { recursive: true });
  fs.writeFileSync(path.join(out, 'learn', 'index.html'), learnPage(w, c, lessons));
  for (const l of lessons) {
    if (reading && reading[l.id]) l.payload.reading = reading[l.id];
    const adir = path.join(out, 'audio', l.id);
    l.payload.audio = l.payload.slides.map((_, k) => {
      const n = String(k + 1).padStart(2, '0');
      const f = ['mp3', 'm4a', 'webm', 'ogg'].map((x) => `${n}.${x}`).find((x) => fs.existsSync(path.join(adir, x)));
      return f ? `${w.path}course/audio/${l.id}/${f}` : '';
    });
    fs.mkdirSync(path.join(out, l.id), { recursive: true });
    fs.writeFileSync(path.join(out, l.id, 'index.html'), lessonPage(w, c, l, lessons, key));
    fs.writeFileSync(path.join(out, 'data', `${l.id}.json`), JSON.stringify(l.free ? l.payload : encrypt(key, l.id, l.payload)));
  }
  { const paid = lessons.find((l) => !l.free); BUILT.push({ id: w.id, title: w.title, store: COPY.store || (engine ? 'iwc-course-code' : 'iw-course-code'), probe: `${w.path}course/data/${paid.id}.json`, probeId: paid.id, learn: `${w.path}course/learn/` }); }
  console.log(`built course ${w.id}: ${lessons.length} lessons (${lessons.filter((l) => l.free).length} free, ${lessons.filter((l) => !l.free).length} encrypted)`);
  return lessons.length;
}

let EXAMPLES = {};
const BUILT = [];

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(fs.readFileSync(path.join(SITE, 'training', 'training.json'), 'utf8'));
  const family = JSON.parse(fs.readFileSync(path.join(SITE, 'family.json'), 'utf8'));
  base = family.home.replace(/\/$/, '');
  const master = loadKey();
  const arcQuiz = QUIZ;
  for (const w of data.workshops) {
    const c = w.course;
    if (!c || !c.enabled) continue;
    const dir = path.join(SITE, w.path.replace(/^\//, ''));
    ENG = '/training/arc42/course';
    COPY = { noun: 'arc42', own: 'your own arc42', doc: 'Your arc42', file: 'arc42.md', extra: 'The Doubles-to-Go arc42 and working app, with its tests', labFor: 'Write your own arc42 documentation' };
    EXAMPLES = exampleSections(dir);
    buildOne({ w, c, deck: loadDeck(dir), quiz: arcQuiz, lab: (lessons) => loadLab(dir, lessons), key: master });
  }
  // the cybersecurity course: built from training-private/cybersecurity-source.json (see tools/import-cyber.mjs)
  const cy = await import('./cyber-course.mjs');
  const built = cy.load(SITE);
  if (built) {
    EXAMPLES = {};
    COPY = cy.COPY;
    buildOne({ w: built.w, c: built.c, deck: built.deck, quiz: built.quiz, lab: built.lab, key: deriveKey(master, 'cybersecurity'), engine: (out) => cy.writeEngine(out, built.w, SITE), reading: built.reading });
  }
  // Level 1, Software Architecture Foundations: built from training-private/foundations (see tools/foundations-course.mjs)
  const f1 = await import('./foundations-course.mjs');
  const fd = await f1.load(SITE);
  if (fd) {
    EXAMPLES = {};
    COPY = f1.COPY;
    const fkey = deriveKey(master, f1.ID);
    buildOne({ w: fd.w, c: fd.c, deck: fd.deck, quiz: fd.quiz, lab: fd.lab, key: fkey, engine: (out) => f1.writeEngine(out, fd.w, SITE, fkey, encrypt, fd), reading: fd.reading });
  }
  // Level 3, Quality, Decisions and Evaluation: built from training-private/quality-decisions (see tools/level-course.mjs)
  const q2 = await import('./level-course.mjs');
  const lv = q2.load(SITE);
  if (lv) {
    EXAMPLES = {};
    COPY = q2.COPY;
    buildOne({ w: lv.w, c: lv.c, deck: lv.deck, quiz: lv.quiz, lab: lv.lab, key: deriveKey(master, q2.ID), engine: (out) => q2.writeEngine(out, lv.w, SITE), reading: lv.reading });
  }
  // Level 4, Agentic AI Architecture: built from training-private/agentic-architecture (see tools/agent-course.mjs)
  const a4 = await import('./agent-course.mjs');
  const ag = a4.load(SITE);
  if (ag) {
    EXAMPLES = {};
    COPY = a4.COPY;
    buildOne({ w: ag.w, c: ag.c, deck: ag.deck, quiz: ag.quiz, lab: ag.lab, key: deriveKey(master, a4.ID), engine: (out) => a4.writeEngine(out, ag.w, SITE), reading: ag.reading });
  }
}

if (import.meta.url === `file://${process.argv[1]}` && BUILT.length) {
  const { myCoursesPage } = await import('./my-courses-html.mjs');
  fs.mkdirSync(path.join(SITE, 'training', 'my-courses'), { recursive: true });
  fs.writeFileSync(path.join(SITE, 'training', 'my-courses', 'index.html'), myCoursesPage(BUILT));
}

export { loadDeck, buildLessons, scopedCss, plain, encrypt, slug };
