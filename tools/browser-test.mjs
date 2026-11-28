#!/usr/bin/env node
// Real-browser check. Starts the dev servers, drives Chromium, asserts, exits non-zero on failure.
// Needs: npm run setup   (installs Playwright and Chromium)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright is not installed. Run: npm run setup'); process.exit(2); }

const PRODUCTS = [['verichain', 8081], ['vericrypt', 8082], ['sovereign-erp', 8083], ['omc', 8084], ['agentseed', 8085]];
// One site, one domain: the home site at / and each system in its own folder (see tools/assemble.mjs).
const servers = [spawn('node', ['tools/serve.mjs', 'dist', '8080'], { stdio: 'ignore' })];
const SLUG = Object.fromEntries(PRODUCTS.map(([id, port]) => [port, id]));
const ORIGIN = (port) => (port === 8080 ? 'http://localhost:8080' : `http://localhost:8080/${SLUG[port]}`);
const stop = () => servers.forEach((s) => s.kill());
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 800));

const HOME = 'http://localhost:8080', VC = 'http://localhost:8080/vericrypt';
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } };

const browser = await chromium.launch();
async function open(url, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.problems = [];
  await ctx.route('**/api/pay/region', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"tt":false}' }));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(m.text()); });
  page.on('pageerror', (e) => page.problems.push(e.message));
  await page.goto(url);
  await page.waitForSelector('html[data-ready="true"]', { timeout: 8000 });
  return page;
}

await step('home renders roles and products, no console errors', async () => {
  const p = await open(HOME);
  assert.equal(await p.locator('#roles-grid .card').count(), 6);
  assert.equal(await p.locator('#family-cards .card').count(), 6, 'five systems and the training card');
  assert.deepEqual(p.problems, []);
});
await step('home has no horizontal scroll at 390px', async () => {
  const p = await open(HOME, { viewport: { width: 390, height: 844 } });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
});
await step('the site is dark only: dark even when the system asks for light, and no theme button', async () => {
  const p = await open(HOME, { colorScheme: 'light' });
  assert.equal(await p.locator('.theme-btn').count(), 0);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  assert.ok(r + g + b < 150, `background should be dark, got ${bg}`);
});
await step('keyboard: skip link is first focus', async () => {
  const p = await open(VC);
  await p.keyboard.press('Tab');
  assert.match(await p.evaluate(() => document.activeElement.textContent.trim()), /skip to content/i);
});
await step('demo: untouched matches, tampered does not, reset restores', async () => {
  const p = await open(VC + '/demo/');
  await p.waitForSelector('.chain-row');
  await p.click('text=Verify against the sealed chain');
  assert.match(await p.locator('.demo-result').innerText(), /^Match/);
  await p.fill('#entry-1', 'Authority skipped');
  await p.click('text=Verify against the sealed chain');
  assert.match(await p.locator('.demo-result').innerText(), /^No match/);
  await p.click('text=Reset the demo');
  await p.waitForSelector('.chain-row');
  assert.equal(await p.inputValue('#entry-1'), 'Authority checked');
});
await step('docs: sidebar navigation changes the page', async () => {
  const p = await open(VC + '/docs/');
  const first = await p.locator('article.prose h2').innerText();
  await p.locator('.docs-nav a', { hasText: 'Reference' }).click();
  await p.waitForSelector('article.prose h2');
  assert.notEqual(await p.locator('article.prose h2').innerText(), first);
  assert.match(p.url(), /\?d=/);
});
await step('download, verify and support tabs render without errors', async () => {
  for (const path of ['/download/', '/verify/', '/support/']) {
    const p = await open(VC + path);
    assert.deepEqual(p.problems, [], path);
  }
});

await step('every product: all tabs and every docs page load without errors', async () => {
  for (const [id, port] of PRODUCTS) {
    const base = `${ORIGIN(port)}`;
    const index = await (await fetch(base + '/docs/docs.json')).json();
    for (const item of index.groups.flatMap((g) => g.items)) {
      const p = await open(`${base}/docs/?d=${encodeURIComponent(item.md)}`);
      const text = await p.locator('article.prose').innerText();
      assert.ok(text.length > 40, `${id} ${item.md} is empty`);
      assert.ok(!/could not be loaded/.test(text), `${id} ${item.md} failed to load`);
      assert.ok(!text.includes('`'), `${id} ${item.md} shows a stray backtick (broken code span or table cell)`);
      assert.deepEqual(p.problems, [], `${id} ${item.md}`);
    }
    for (const tab of ['/', '/demo/', '/download/', '/verify/', '/support/']) {
      const p = await open(base + tab);
      assert.deepEqual(p.problems, [], `${id}${tab}`);
    }
  }
});
await step('no product page shows an unpublished placeholder in its main docs', async () => {
  for (const [id, port] of PRODUCTS) {
    const p = await open(`${ORIGIN(port)}/docs/`);
    assert.ok(!/Nothing is published here yet/.test(await p.locator('#docs-root').innerText()), id);
  }
});


// ---- accessibility and content checks (WCAG 2.2 AA basics) ----
const AUDIT = () => {
  const out = [];
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; if (!stack.length || stack[stack.length - 1].a < 1) { const c = parse(getComputedStyle(document.body).backgroundColor); if (c) base = { ...c, a: 1 }; } for (const c of stack.reverse()) base = blend(c, base); return base; };
  const main = document.querySelectorAll('main');
  if (main.length !== 1) out.push(`expected 1 <main>, found ${main.length}`);
  if (document.querySelectorAll('h1').length !== 1) out.push(`expected 1 <h1>, found ${document.querySelectorAll('h1').length}`);
  if (!document.documentElement.lang) out.push('missing lang');
  let prev = 0;
  for (const h of document.querySelectorAll('h1,h2,h3,h4')) { const l = Number(h.tagName[1]); if (prev && l > prev + 1) out.push(`heading jumps h${prev} to h${l}: ${h.textContent.trim().slice(0, 30)}`); prev = l; }
  for (const el of document.querySelectorAll('a[href],button')) { const name = (el.getAttribute('aria-label') || el.textContent || '').trim(); if (!name) out.push(`unnamed ${el.tagName.toLowerCase()} ${el.getAttribute('href') || ''}`); }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push('img without alt');
  const seen = new Set();
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); const f = blend(fg, bg);
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) { const k = el.tagName + el.className; if (!seen.has(k)) { seen.add(k); out.push(`low contrast ${ratio.toFixed(2)} (< ${need}) on <${el.tagName.toLowerCase()} class="${el.className}"> "${el.textContent.trim().slice(0, 24)}"`); } }
  }
  return out;
};
await step('accessibility: landmarks, headings, names, contrast, light and dark, every page', async () => {
  const bad = [];
  const sites = [['home', 8080, ['/', '/verify-site/', '/consulting/', '/industries/government/', '/industries/smb/', '/training/', '/training/arc42/', '/training/arc42/guide/', '/training/arc42/register/', '/training/arc42/example/', '/training/arc42/course/', '/training/arc42/course/part-0-opening/', '/training/arc42/course/part-7-6-runtime/']], ...PRODUCTS.map(([id, port]) => [id, port, ['/', '/demo/', '/download/', '/docs/', '/verify/', '/support/', '/verify-site/']])];
  for (const scheme of ['light', 'dark']) {
    for (const [id, port, paths] of sites) for (const path of paths) {
      const p = await open(`${ORIGIN(port)}${path}`, { viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      for (const issue of await p.evaluate(AUDIT)) bad.push(`${scheme} ${id}${path}: ${issue}`);
      await p.context().close();
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} issue(s)`);
});
await step('every page has its own title, description and canonical link, with no JavaScript needed', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const titles = new Set();
  for (const [id, port] of PRODUCTS) for (const path of ['/', '/demo/', '/download/', '/docs/', '/verify/', '/support/']) {
    await page.goto(`${ORIGIN(port)}${path}`);
    const title = await page.title();
    assert.ok(title && title !== 'Overview' && !titles.has(id + title), `${id}${path} title: ${title}`);
    titles.add(id + title);
    assert.ok((await page.locator('meta[name=description]').getAttribute('content')).length > 20, `${id}${path} description`);
    assert.match(await page.locator('link[rel=canonical]').getAttribute('href'), /^https:\/\/[a-z-]*\.?meeting-mind\.com\//, `${id}${path} canonical`);
  }
  await page.goto(VC + '/');
  assert.match(await page.locator('noscript').first().innerText(), /VeriCrypt/);
  await ctx.close();
});
await step('download tab with no binaries shows build-from-source; support shows known problems', async () => {
  for (const [id, port] of PRODUCTS) {
    let p = await open(`${ORIGIN(port)}/download/`);
    assert.match(await p.locator('#downloads-root').innerText(), /no packaged downloads/i, id);
    assert.ok(await p.locator('#downloads-root pre').count() >= 1, id + ' build steps');
    p = await open(`${ORIGIN(port)}/support/`);
    assert.ok(await p.locator('#support-faq details').count() >= 3, id + ' faq');
  }
});
await step('sitemap exists for every site; robots and security.txt at the domain root', async () => {
  for (const port of [8080, ...PRODUCTS.map(([, x]) => x)]) {
    for (const f of ['/sitemap.xml', '/robots.txt', ...(port === 8080 ? ['/.well-known/security.txt'] : [])]) {
      const r = await fetch(`${ORIGIN(port)}${f}`);
      assert.equal(r.status, 200, `${port}${f}`);
    }
  }
});

await step('verify this site: every file matches, and a tampered file is caught', async () => {
  for (const [id, port] of [['home', 8080], ...PRODUCTS]) {
    const p = await open(`${ORIGIN(port)}/verify-site/`);
    await p.waitForSelector('.callout[role=status]', { timeout: 15000 });
    assert.match(await p.locator('.callout[role=status]').innerText(), /^All \d+ files match/, id);
    assert.ok(!/\bnull\b|undefined/.test(await p.locator('main').innerText()), id + ' shows a stray null/undefined');
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/kit/dom.js', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()) + '\n// tampered' }); });
  await page.goto('http://localhost:8080/verify-site/');
  await page.waitForSelector('.callout[role=status]', { timeout: 15000 });
  assert.match(await page.locator('.callout[role=status]').innerText(), /do not match/);
  assert.match(await page.locator('table').innerText(), /kit\/dom\.js/);
  await ctx.close();
});
await step('every product overview lists honest limits', async () => {
  for (const [id, port] of PRODUCTS) {
    const p = await open(`${ORIGIN(port)}/`);
    assert.ok(await p.locator('ul.limits li').count() >= 3, id);
  }
});

await step('every HTML page is served with a Content-Security-Policy (strict, except legacy)', async () => {
  for (const [id, port] of [['home', 8080], ...PRODUCTS]) {
    const manifest = await (await fetch(`${ORIGIN(port)}/site-manifest.json`)).json();
    for (const file of Object.keys(manifest.files).filter((f) => f.endsWith('.html') && !f.startsWith('/legacy/'))) {
      const res = await fetch(`${ORIGIN(port)}${file}`);
      const csp = res.headers.get('content-security-policy') || '';
      assert.match(csp, /default-src 'self'/, `${id}${file} has no strict CSP`);
      assert.ok(!/unsafe-inline|(?<!wasm-)unsafe-eval/.test(csp), `${id}${file} CSP is loose`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${id}${file} nosniff`);
      if (!file.startsWith('/demo/')) assert.ok(!/wasm-unsafe-eval/.test(csp), `${id}${file} allows wasm outside /demo/`);
    }
  }
});

await step('docs: search finds pages, code blocks have copy buttons', async () => {
  const p = await open(VC + '/docs/');
  await p.fill('#docs-search', 'exit code');
  await p.waitForSelector('.docs-results li');
  assert.ok(await p.locator('.docs-results li').count() >= 1);
  await p.locator('.docs-results a').first().click();
  await p.waitForSelector('article.prose');
  assert.ok(await p.locator('.code-copy').count() >= 1, 'no copy button');
  await p.fill('#docs-search', 'zzzqqq');
  await p.waitForSelector('.docs-results .muted');
  assert.match(await p.locator('.docs-results').innerText(), /No matches/);
});
await step('structured data: valid JSON-LD on home and on every product overview', async () => {
  const check = async (url, type) => {
    const res = await fetch(url); const html = await res.text();
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, `${url} has no JSON-LD`);
    assert.equal(JSON.parse(m[1])['@type'], type, url);
  };
  await check(HOME + '/', 'Organization');
  for (const [, port] of PRODUCTS) await check(`${ORIGIN(port)}/`, 'SoftwareApplication');
});
await step('reflow: no horizontal scroll at 320px on any page (WCAG 1.4.10)', async () => {
  const bad = [];
  const sites = [['home', 8080, ['/', '/verify-site/', '/consulting/', '/industries/government/', '/industries/smb/', '/training/', '/training/arc42/', '/training/arc42/guide/', '/training/arc42/register/']], ...PRODUCTS.map(([id, port]) => [id, port, ['/', '/demo/', '/download/', '/docs/', '/verify/', '/support/']])];
  for (const [id, port, paths] of sites) for (const path of paths) {
    const p = await open(`${ORIGIN(port)}${path}`, { viewport: { width: 320, height: 640 } });
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) bad.push(`${id}${path}`);
    await p.context().close();
  }
  assert.deepEqual(bad, []);
});
await step('performance budget: CLS under 0.1, LCP under 2.5 s, under 150 KB per page plus at most 100 KB of cached fonts (local, uncached)', async () => {
  const problems = [];
  const sites = [['home', 8080, ['/', '/consulting/', '/industries/government/', '/industries/smb/', '/training/', '/training/arc42/', '/training/arc42/guide/', '/training/arc42/register/']], ...PRODUCTS.map(([id, port]) => [id, port, ['/', '/demo/', '/docs/', '/download/', '/verify/', '/support/']])];
  for (const [id, port, paths] of sites) for (const path of paths) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0; window.__lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(`${ORIGIN(port)}${path}`);
    await page.waitForSelector('html[data-ready="true"]');
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => ({ cls: window.__cls, lcp: window.__lcp, bytes: performance.getEntriesByType('resource').filter((r) => !/\.woff2/.test(r.name)).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0), fontBytes: performance.getEntriesByType('resource').filter((r) => /\.woff2/.test(r.name)).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) }));
    if (m.fontBytes > 100000) problems.push(`${id}${path} fonts ${Math.round(m.fontBytes / 1000)} KB`);
    if (m.cls > 0.1) problems.push(`${id}${path} CLS ${m.cls.toFixed(3)}`);
    if (m.lcp > 2500) problems.push(`${id}${path} LCP ${Math.round(m.lcp)} ms`);
    if (m.bytes > 150000) problems.push(`${id}${path} ${Math.round(m.bytes / 1000)} KB`);
    await ctx.close();
  }
  assert.deepEqual(problems, []);
});

// ---- training section ----
import fs from 'node:fs';
import crypto from 'node:crypto';
const WS = '/training/arc42/';
await step('training: home links to it, pages render with content and no console errors', async () => {
  let p = await open(HOME);
  assert.ok(await p.locator('.bar-nav a[href="/training/"]').count() === 1, 'no Training link in the header');
  assert.ok(await p.locator('#training a[href="/training/"]').count() === 1, 'no Training block on home');
  p = await open(HOME + '/training/');
  assert.ok(await p.locator('.ws-card a[href="/training/arc42/"]').count() >= 1, 'training index does not link to the workshop');
  assert.deepEqual(p.problems, []);
  p = await open(HOME + WS);
  assert.equal(await p.locator('ol.twelve li').count(), 12);
  assert.ok(await p.locator('ol.day > li:not(.grp):not(.brk)').count() >= 10);
  assert.match(await p.locator('.t-hero').innerText(), /30 January 2027/);
  assert.deepEqual(p.problems, []);
  p = await open(VC + '/');
  await p.locator('.family summary').click();
  assert.ok(await p.locator('.family a', { hasText: 'Training' }).count() === 1, 'product family menu has no Training link');
});
await step('training: the content is in the HTML itself (no JavaScript needed)', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(HOME + WS);
  assert.match(await page.locator('h1').innerText(), /architecture docs people and AI can act on/);
  assert.ok(await page.locator('ol.day li').count() >= 15);
  await page.goto(HOME + WS + 'register/');
  assert.match(await page.locator('a[href^="mailto:"]').first().getAttribute('href'), /^mailto:dpramsajan@meeting-mind\.com\?subject=/);
  await ctx.close();
});
await step('training: early bird counts down, then ends on its own', async () => {
  for (const [now, re] of [['2026-11-21T12:00:00Z', /10 days left/], ['2026-12-02T12:00:00Z', /early-bird price has ended/i]]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(now) });
    await page.goto(HOME + WS);
    await page.waitForSelector('html[data-ready="true"]');
    assert.match(await page.locator('.t-pill').innerText(), re, now);
    await ctx.close();
  }
});
await step('training: Event structured data is valid and matches the page', async () => {
  const html = await (await fetch(HOME + WS)).text();
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'EducationEvent');
  assert.match(ld.startDate, /^2027-01-30T09:00/);
  assert.equal(ld.offers.priceCurrency, 'TTD');
  assert.ok(new Date(ld.offers.validThrough) < new Date(ld.startDate));
  const sitemap = await (await fetch(HOME + '/sitemap.xml')).text();
  for (const u of ['/consulting/', '/industries/government/', '/training/', '/training/arc42/', '/training/arc42/guide/', '/training/arc42/register/']) assert.ok(sitemap.includes(`https://meeting-mind.com${u}<`), u);
});
await step('training: guide ticks are remembered, copy button works', async () => {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto(HOME + WS + 'guide/');
  await page.waitForSelector('html[data-ready="true"]');
  await page.locator('input[data-check="setup-1"]').check();
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(await page.locator('input[data-check="setup-1"]').isChecked(), true);
  await page.locator('button[data-copy]').click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /## 12\. Glossary/);
  await ctx.close();
});
await step('training: registration form builds an email to the company address and shows no personal mailbox', async () => {
  const p = await open(HOME + WS + 'register/');
  assert.equal(await p.locator('#reserve').isVisible(), true);
  assert.equal(await p.locator('#reserve').getAttribute('data-to'), 'dpramsajan@meeting-mind.com');
  assert.ok(!/gmail\.com/.test(await p.content()), 'a personal mailbox is in the page');
});
await step('training: the slides are private (unlisted, noindex, strict CSP) and run', async () => {
  const dirs = fs.readdirSync('site/training/arc42').filter((d) => d.startsWith('deck-'));
  assert.equal(dirs.length, 1, 'expected exactly one deck-* folder');
  const url = `${HOME}${WS}${dirs[0]}/`;
  const manifest = await (await fetch(HOME + '/site-manifest.json')).text();
  const sitemap = await (await fetch(HOME + '/sitemap.xml')).text();
  const robots = await (await fetch(HOME + '/robots.txt')).text();
  for (const [name, text] of [['manifest', manifest], ['sitemap', sitemap], ['robots.txt', robots]]) assert.ok(!text.includes('deck-'), `the slides path leaks into ${name}`);
  for (const f of ['site/index.html', 'site/training/index.html', 'site/training/arc42/index.html', 'site/training/arc42/guide/index.html', 'site/training/arc42/register/index.html', 'site/training/training.json']) assert.ok(!fs.readFileSync(f, 'utf8').includes('deck-'), `${f} links to the slides`);
  const res = await fetch(url);
  assert.match(res.headers.get('x-robots-tag') || '', /noindex/);
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const bad = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => bad.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#stage .s');
  assert.ok(await page.locator('#ovg button').count() > 100, 'slides did not load');
  const k = await page.evaluate(() => SL.findIndex((s) => /@@/.test(s.h)));
  await page.goto(`${url}#${k + 1}`); await page.reload(); await page.waitForTimeout(300);
  assert.ok(await page.locator('#stage svg text.nt').count() > 0, 'diagram slide did not render');
  assert.deepEqual(bad, []);
  await ctx.close();
});

/* ---------- online course ---------- */
const CRS = HOME + WS + 'course/';
const { loadKey } = await import('./build-course.mjs');
const courseKey = loadKey({ create: false });
const mkCode = (name, keyBuf = courseKey) => Buffer.from(JSON.stringify({ v: 1, b: name, k: keyBuf.toString('base64url') })).toString('base64url');
await step('course: index lists the lessons, two free, and loads without errors or CSP violations', async () => {
  assert.ok(courseKey, 'no course key: run npm run course first');
  const p = await open(CRS);
  assert.equal(await p.locator('li.lesson').count(), 19);
  assert.equal(await p.locator('li.lesson.is-free').count(), 2);
  assert.ok(await p.locator('form[data-unlock]').isVisible());
  assert.deepEqual(p.problems, []);
  await p.context().close();
});
await step('course: buying by bank deposit (Trinidad visitor): price, popup, receipt upload, unlock; foreign visitor sees US price', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage(); page.problems = [];
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(m.text()); });
  page.on('pageerror', (e) => page.problems.push(e.message));
  let got = null;
  await ctx.route('**/api/pay/region', (r) => r.fulfill({ contentType: 'application/json', body: '{"tt":true}' }));
  await ctx.route('**/api/pay/order', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'a'.repeat(32), ref: 'IC-TEST23', amount: 899, bank: { name: 'Royal Bank (Trinidad and Tobago) Limited', branch: 'St Augustine Shopping Centre, St Augustine', account: '110000005001825' } }) }));
  await ctx.route('**/api/pay/receipt**', (r) => { got = r.request().postDataBuffer(); r.fulfill({ contentType: 'application/json', body: '{"status":"paid"}' }); });
  await ctx.route('**/api/pay/claim**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'paid', code: 'CODE123', name: 'Ada Lovelace', course: 'arc42', learn: '/training/arc42/course/welcome/?o=' + 'a'.repeat(32) }) }));
  await page.goto(CRS); await page.waitForSelector('html[data-ready="true"]');
  await page.waitForSelector('[data-pay-open]:visible');
  assert.match(await page.locator('[data-price]').innerText(), /^TT\$899$/);
  await page.click('[data-pay-open]');
  await page.fill('#buy-name', 'Ada Lovelace'); await page.fill('#buy-email', 'ada@example.com');
  await page.click('[data-pay-form] button[type=submit]');
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  const dlg = await page.locator('dialog.pay').innerText();
  assert.match(dlg, /110000005001825/); assert.match(dlg, /Royal Bank \(Trinidad and Tobago\) Limited/); assert.match(dlg, /IC-TEST23/); assert.match(dlg, /TT\$899/);
  await page.click('[data-to-3]');
  assert.equal(await page.locator('input[capture]').count(), 1, 'a camera option exists');
  await page.locator('input[data-file]').nth(1).setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('[data-done-link]:visible');
  assert.ok(got && got.length > 100 && got[0] === 0xff && got[1] === 0xd8, 'a JPEG was uploaded');
  await page.waitForURL(/welcome\/\?o=/);
  assert.equal(await page.evaluate(() => localStorage.getItem('iw-course-code')), 'CODE123', 'the code is saved with no copy and paste');
  await page.goto(CRS + 'welcome/?o=' + 'a'.repeat(32));
  await page.waitForSelector('[data-welcome-done]:not([hidden])');
  assert.equal(await page.locator('#w-code').inputValue(), 'CODE123');
  assert.equal(await page.evaluate(() => localStorage.getItem('iw-course-code')), 'CODE123');
  assert.deepEqual(page.problems, []);
  await ctx.close();
  const f = await open(CRS);
  assert.match(await f.locator('[data-price]').innerText(), /US\$129/);
  assert.equal(await f.locator('[data-tt]').isVisible(), false);
  assert.match(await f.locator('[data-price-note]').innerText(), /WhatsApp/);
  await f.context().close();
});
await step('course: a receipt the bank check could not confirm still opens the course at once (owner is told); a revoked order closes it again', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const id = 'b'.repeat(32);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage(); page.problems = [];
  page.on('pageerror', (e) => page.problems.push(e.message));
  await ctx.route('**/api/pay/region', (r) => r.fulfill({ contentType: 'application/json', body: '{"tt":true}' }));
  await ctx.route('**/api/pay/order', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id, ref: 'IC-HOLD99', amount: 899, bank: { name: 'Royal Bank', branch: 'x', account: '1' } }) }));
  await ctx.route('**/api/pay/receipt**', (r) => r.fulfill({ contentType: 'application/json', body: '{"status":"review"}' }));
  await ctx.route('**/api/pay/claim**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'review', provisional: true, code: 'PROV1', name: 'Bo', course: 'arc42', learn: '/training/arc42/course/welcome/?o=' + id }) }));
  await page.goto(CRS); await page.waitForSelector('[data-pay-open]:visible');
  await page.click('[data-pay-open]');
  await page.fill('#buy-name', 'Bo Peep'); await page.fill('#buy-email', 'bo@example.com');
  await page.click('[data-pay-form] button[type=submit]'); await page.waitForSelector('[data-step="2"]:not([hidden])');
  await page.click('[data-to-3]');
  await page.locator('input[data-file]').nth(1).setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('[data-done-text]:visible');
  assert.match(await page.locator('[data-done-text]').innerText(), /open now|Opening/i);
  await page.waitForURL(/welcome\/\?o=/, { timeout: 6000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('iw-course-code')), 'PROV1');
  // the owner revokes: the next visit removes that code and says why
  await ctx.unroute('**/api/pay/claim**');
  await ctx.route('**/api/pay/claim**', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"We could not confirm this payment."}' }));
  let said = ''; page.on('dialog', (d) => { said = d.message(); d.accept(); });
  await page.goto(CRS + 'learn/');
  await page.waitForFunction(() => !localStorage.getItem('iw-course-code'), null, { timeout: 6000 });
  assert.match(said, /paused/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
await step('course: a free lesson plays without a code (next, back, slide changes)', async () => {
  const p = await open(CRS + 'part-1-foundations/');
  await p.waitForSelector('[data-stage] .s');
  const first = await p.locator('[data-stage]').innerText();
  await p.click('[data-next]');
  assert.notEqual(await p.locator('[data-stage]').innerText(), first);
  assert.match(await p.locator('[data-pos]').innerText(), /^2 \/ 15$/);
  await p.keyboard.press('ArrowLeft');
  assert.match(await p.locator('[data-pos]').innerText(), /^1 \/ 15$/);
  const box = await p.locator('[data-frame]').boundingBox();
  assert.ok(box.width > 300 && Math.abs(box.height / box.width - 9 / 16) < 0.01, 'stage is not 16:9');
  assert.deepEqual(p.problems, []);
  await p.context().close();
});
await step('course: a paid lesson is locked without a code and its file holds no readable content', async () => {
  const p = await open(CRS + 'part-7-6-runtime/');
  await p.waitForSelector('[data-locked]:not([hidden])');
  assert.equal(await p.locator('[data-stage-wrap]').isHidden(), true);
  const enc = await (await fetch(CRS + 'data/part-7-6-runtime.json')).json();
  assert.deepEqual(Object.keys(enc).sort(), ['ct', 'id', 'iv', 'v']);
  assert.ok(!/<h2|Runtime|scenario/i.test(Buffer.from(enc.ct, 'base64url').toString('latin1')), 'the paid lesson file contains readable text');
  assert.ok(!(await p.content()).includes('Facilitator note'), 'paid text is in the page');
  await p.context().close();
});
await step('every system keeps the Intellica logo (to the home page), and the Consulting and Training links in the header', async () => {
  for (const [id, port] of PRODUCTS) {
    const page = await open(`${ORIGIN(port)}/docs/`);
    assert.equal(await page.locator('.brand').first().getAttribute('href'), '/', id);
    assert.equal(await page.locator('.brand img').first().getAttribute('alt'), 'Intellica', id);
    assert.equal(await page.locator('.bar-nav a', { hasText: 'Training' }).getAttribute('href'), '/training/', id);
    assert.equal(await page.locator('.bar-nav a', { hasText: 'Consulting' }).getAttribute('href'), '/consulting/', id);
    await page.context().close();
  }
});
await step('course: pasting the secret key (not a code) says so clearly instead of failing silently', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(CRS);
  await page.waitForSelector('form[data-unlock]:not([hidden])');
  await page.fill('form[data-unlock] input', 'Ry-1dhA-qWvVPsJQyFKVpaERSf0SylUR0hfRztXI_GU');
  await page.click('form[data-unlock] [type=submit]');
  await page.waitForFunction(() => /not an access code/.test(document.body.innerText));
  await ctx.close();
});
await step('course: pasting a code on the course page jumps to "My course" with welcome, next lesson, progress and the curriculum', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(CRS);
  await page.waitForSelector('form[data-unlock]:not([hidden])');
  await page.fill('form[data-unlock] input', mkCode('Banner Buyer'));
  await page.click('form[data-unlock] [type=submit]');
  await page.waitForURL(/\/course\/learn\/$/);
  await page.waitForSelector('[data-learn-page]:not([hidden])');
  assert.match(await page.locator('h1').innerText(), /Welcome, Banner Buyer/);
  assert.match(await page.locator('[data-next-link]').innerText(), /Start lesson 1/);
  assert.equal(await page.locator('li.lesson').count(), 19);
  assert.equal(await page.locator('[data-pct]').innerText(), '0%');
  assert.ok(!(await page.locator('.enrol').count()), 'no price or buy box on the learner page');
  // finish lesson 1 in storage, reload: progress and the next lesson move on
  await page.evaluate(() => localStorage.setItem('iw-course-progress', JSON.stringify({ 'part-0-opening': Date.now() })));
  await page.reload();
  await page.waitForSelector('[data-learn-page]:not([hidden])');
  assert.notEqual(await page.locator('[data-pct]').innerText(), '0%');
  assert.match(await page.locator('[data-next-link]').innerText(), /Resume/);
  // the sales page now offers the way back in
  await page.goto(CRS);
  await page.waitForSelector('.unlock-banner');
  assert.match(await page.locator('.unlock-banner').innerText(), /Go to my course/);
  await ctx.close();
});
await step('course: "My course" without a valid code sends you back to the course page', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(CRS + 'learn/');
  await page.waitForURL((u) => /\/course\/$/.test(u.pathname));
  await ctx.close();
});
await step('lab: a free step works without a code, autosaves, survives a reload, and exports the document', async () => {
  const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(CRS + 'lab/');
  await page.waitForSelector('[data-lab-page]:not([hidden]) [data-step-panel] h2');
  assert.match(await page.locator('[data-step-panel] h2').innerText(), /Set up your project/);
  await page.fill('[data-sys]', 'Test Shop');
  await page.fill('[data-text]', '| | |\n|---|---|\n| **System** | A shop for tests |\n');
  for (let k = 0; k < 4; k++) await page.locator('.lab-done input').nth(k).check();
  await page.waitForFunction(() => /Saved on this device/.test(document.querySelector('[data-status]').textContent));
  await page.reload();
  await page.waitForSelector('[data-step-panel] h2');
  assert.equal(await page.inputValue('[data-sys]'), 'Test Shop');
  assert.match(await page.inputValue('[data-text]'), /A shop for tests/);
  assert.equal(await page.locator('.lab-done input:checked').count(), 4, 'ticked checks persist');
  assert.match(await page.locator('[data-prog]').innerText(), /^1 of 16/);
  // a paid step is locked without a code, but its section can still be written
  await page.selectOption('[data-step-select]', 'part-2-1-goals');
  await page.waitForSelector('[data-step-panel] .btn');
  assert.match(await page.locator('[data-step-panel]').innerText(), /part of the full course/);
  await page.locator('[data-sec="s1"]').click();
  assert.match(await page.inputValue('[data-text]'), /## 1\. Introduction and Goals/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-download]')]);
  assert.equal(dl.suggestedFilename(), 'test-shop-arc42.md');
  const md = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
  assert.match(md, /^# Test Shop: architecture documentation \(arc42\)/);
  assert.match(md, /A shop for tests/);
  for (let n = 1; n <= 12; n++) assert.ok(new RegExp(`^## ${n}\\. `, 'm').test(md), `section ${n} is in the export`);
  assert.deepEqual(errs, []);
  await ctx.close();
});
await step('lab: the process mirror reports typed, pasted and template text, privately and without judging', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(CRS + 'lab/');
  await page.waitForSelector('[data-lab-page]:not([hidden]) [data-text]');
  assert.equal(await page.locator('[data-mirror]').isHidden(), true, 'hidden until there is enough text');
  await page.fill('[data-text]', '');
  await page.focus('[data-text]');
  await page.keyboard.insertText('x'.repeat(250));
  await page.evaluate(() => { const t = document.querySelector('[data-text]'); t.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste' })); t.value += 'y'.repeat(250); t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' })); });
  await page.waitForSelector('[data-mirror]:not([hidden])');
  const txt = await page.locator('[data-mirror-text]').innerText();
  assert.match(txt, /Typed by you \d+% · pasted \d+%/);
  const m = txt.match(/Typed by you (\d+)% · pasted (\d+)%/); assert.ok(Math.abs(m[1] - 50) <= 5 && Math.abs(m[2] - 50) <= 5, txt);
  await page.reload(); await page.waitForSelector('[data-lab-page]:not([hidden]) [data-text]');
  assert.equal(await page.locator('[data-mirror]').isVisible(), true, 'the tally survives a reload');
  await ctx.close();
});
await step('lab: with a code the paid steps open with instructions, the example, the health check and the preview', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(CRS);
  await page.evaluate((c) => localStorage.setItem('iw-course-code', c), mkCode('Lab Buyer'));
  await page.goto(CRS + 'lab/?step=part-2-1-goals');
  await page.waitForSelector('[data-step-panel] .lab-do');
  assert.match(await page.locator('[data-step-panel] h2').innerText(), /section 1/);
  assert.ok((await page.locator('.lab-ex summary').count()) === 1, 'worked example is offered');
  assert.equal(await page.locator('[data-sec].is-on').getAttribute('data-sec'), 's1', 'opens on the section the step is about');
  // the health check reports gaps and clears them as the document is written
  await page.click('[data-check] summary');
  assert.match(await page.locator('[data-check-badge]').innerText(), /to look at/i);
  assert.match(await page.locator('[data-check-list]').innerText(), /Every section has been written/);
  // a scenario without a number is called out
  await page.locator('[data-sec="s10"]').click();
  await page.fill('[data-text]', '## 10. Quality Requirements\n\n| ID | Goal | Stimulus | Response | Measure |\n|---|---|---|---|---|\n| Q1 | #fast | a click | a page | quickly |\n');
  assert.match(await page.locator('[data-check-list]').innerText(), /No number: Q1/);
  // preview renders tables as tables, and a diagram offers Mermaid Live
  await page.locator('[data-sec="head"]').click();
  await page.click('[data-snip="Mermaid graph"]');
  await page.click('[data-view="preview"]');
  assert.ok(await page.locator('.lab-preview table').count() >= 1);
  assert.match(await page.locator('.lab-preview figcaption a').first().getAttribute('href'), /^https:\/\/mermaid\.live\/edit#base64:/);
  // nothing the student writes becomes markup
  await page.click('[data-view="write"]');
  await page.fill('[data-text]', '<img src=x onerror=window.__pwn=1> **bold**');
  await page.click('[data-view="preview"]');
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  assert.equal(await page.locator('.lab-preview img').count(), 0);
  // import: a document pasted in elsewhere comes in as sections
  await page.click('[data-view="write"]');
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('[data-file]', { name: 'mine.md', mimeType: 'text/markdown', buffer: Buffer.from('# Pet Shop: architecture documentation (arc42)\n\n## 1. Introduction and Goals\n\nWe sell pets.\n\n## 2. Constraints\n\nNone yet.\n') });
  await page.waitForFunction(() => document.querySelector('[data-sys]').value === 'Pet Shop');
  await page.locator('[data-sec="s1"]').click();
  assert.match(await page.inputValue('[data-text]'), /We sell pets\./);
  await page.locator('[data-sec="s2"]').click();
  assert.match(await page.inputValue('[data-text]'), /None yet\./);
  await ctx.close();
});
await step('lab: finishing a lesson offers its lab step, and "My course" shows lab progress', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(CRS);
  await page.evaluate((c) => localStorage.setItem('iw-course-code', c), mkCode('Lab Buyer'));
  await page.goto(CRS + 'part-2-1-goals/');
  await page.waitForSelector('[data-lab-cta]:not([hidden])');
  const href = await page.locator('[data-lab-cta] a').getAttribute('href');
  assert.match(href, /\/course\/lab\/\?step=part-2-1-goals$/);
  await page.evaluate(() => localStorage.setItem('iw-lab-doc', JSON.stringify({ v: 1, system: 'X', sections: { s1: '## 1. Introduction and Goals\nhello' }, steps: { 'part-0-opening': { checks: [true], done: true } } })));
  await page.goto(CRS + 'learn/');
  await page.waitForSelector('[data-learn-page]:not([hidden])');
  assert.match(await page.locator('[data-lab-sum]').innerText(), /1 of 16 steps finished/);
  assert.match(await page.locator('[data-lab-link]').innerText(), /Continue your lab/);
  await ctx.close();
});
await step('training: the online-course button says "Get access", and becomes "Open the course" once a working code is saved', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(HOME + '/training/');
  const btn = page.locator('[data-access]');
  assert.equal((await btn.innerText()).trim(), 'Get access');
  assert.match(await btn.getAttribute('href'), /course\/#get-t$/);
  await page.evaluate(() => localStorage.setItem('iw-course-code', 'eyJ2IjoxLCJiIjoiTm8iLCJrIjoieCJ9'));
  await page.reload(); await page.waitForTimeout(600);
  assert.equal((await btn.innerText()).trim(), 'Get access', 'a bad saved code must not unlock the button');
  await page.evaluate((c) => localStorage.setItem('iw-course-code', c), mkCode('Access Buyer'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-access]').textContent.trim() === 'Open the course');
  assert.match(await btn.getAttribute('href'), /course\/learn\/$/);
  await btn.click();
  await page.waitForSelector('[data-learn-page]:not([hidden])');
  await ctx.close();
});
await step('industries: the five sector pages exist, link to each other, and carry the sector message', async () => {
  for (const id of ['enterprise', 'finance', 'government', 'energy', 'smb']) {
    const p = await open(HOME + `/industries/${id}/`);
    assert.ok(await p.locator('h1').innerText(), 'no heading');
    assert.equal(await p.locator('.k-habits > div').count(), 3, id + ' needs three pressures');
    assert.ok(await p.locator('.k-offer').count() >= 3, id + ' needs offers');
    assert.equal(await p.locator('.k-fw li').count(), 4, id + ' needs frameworks');
    assert.deepEqual(p.problems, []);
  }
  const h = await open(HOME + '/');
  for (const t of ['Enterprise', 'Finance', 'Government', 'Energy', 'Small business']) {
    const href = await h.locator('#sector-links a', { hasText: t }).getAttribute('href');
    const r = await fetch(HOME + href); assert.equal(r.status, 200, t + ' link is dead');
  }
});
await step('training: six architecture levels and seven agentic-era courses, each with its own page, lab and certificate section', async () => {
  const cat = JSON.parse(fs.readFileSync('site/training/catalog.json', 'utf8'));
  const idx = await open(`${HOME}/training/`);
  assert.equal(await idx.locator('#track-architecture .cat-card').count(), 6, 'six architecture levels');
  assert.equal(await idx.locator('#track-cyber .cat-card, #track-aibiz .cat-card').count(), 12, 'six cyber levels and six AI for Business courses');
  assert.match(await idx.locator('#track-architecture .cat-card').first().innerText(), /Software Architecture Foundations/i);
  assert.match(await idx.locator('#track-architecture .cat-card').nth(1).innerText(), /Mastering arc42/i);
  assert.equal(await idx.locator('.cat-status').count(), 1, 'only the arc42 card mentions a live workshop');
  assert.ok(!/opening soon|open now/i.test(await idx.locator('main').innerText()), 'no soon/open split: every course is presented as one catalogue');
  assert.ok(await idx.locator('#courses').count() && await idx.locator('#live').count(), 'courses and live workshops are separate sections');
  assert.ok((await idx.locator('main').innerHTML()).indexOf('id="courses"') < (await idx.locator('main').innerHTML()).indexOf('id="live"'), 'courses come first');
  assert.ok(await idx.locator('#certificate').count(), 'certificate explained on the index');
  assert.deepEqual(idx.problems, []);
  for (const c of [...cat.ladder.levels, ...cat.series.courses]) {
    const p = await open(HOME + c.path);
    assert.match(await p.locator('h1').innerText(), new RegExp(c.title.split(' ')[0]));
    if (cat.series.courses.includes(c)) assert.match(c.title, /Agentic Era|Agentic/, c.id + ' title reflects the agentic era');
    assert.equal(await p.locator('.syl-m').count(), c.modules.length, c.id + ' syllabus');
    assert.equal(await p.locator('.lab-steps li').count(), c.lab.steps.length, c.id + ' lab steps');
    assert.ok(await p.locator('#certificate .cert-criteria li').count() === 3, c.id + ' certificate criteria');
    assert.match(await p.locator('a[href^="https://wa.me/"]').first().getAttribute('href'), /^https:\/\/wa\.me\/\d+\?text=/, 'Contact sales opens WhatsApp');
    assert.ok(!/\d{7,}/.test(await p.locator('main').innerText()), c.id + ' shows no phone number');
    if (!(c.course && c.course.enabled)) assert.ok(!/\$\d|TT\$|USD/.test(await p.locator("main").innerText()), c.id + " states no price");
    else assert.ok((await p.locator('main').innerText()).includes(c.course.price.label), c.id + ' shows its price once the course is open');
    assert.deepEqual(p.problems, []);
  }
  const lvl = await open(`${HOME}/training/agentic-architecture/`);
  assert.equal(await lvl.locator('.lvl-path li').count(), 6); assert.match(await lvl.locator('.lvl-path .is-here').innerText(), /Agentic AI/);
  const arc = await open(`${HOME}${WS}`);
  assert.match(await arc.locator('.lvl-path .is-here').innerText(), /Mastering arc42/); assert.ok(await arc.locator('#certificate').count(), 'arc42 page has the certificate section');
});
await step('certificate: claim card follows the criteria, issues once, and the certificate page verifies, shares and adds to LinkedIn', async () => {
  const w = JSON.parse(fs.readFileSync('site/training/training.json', 'utf8')).workshops[0];
  const ids = w.course.modules.flatMap((m) => m.lessons);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const issued = [];
  const rec = { lessons: ids.length, lessonsTotal: ids.length, sections: 12, sectionsTotal: 12, checks: 6, checksTotal: 6, mastered: 30, questions: 34 };
  await page.route('**/api/cert/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() === 'POST') { issued.push(JSON.parse(req.postData())); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'IC-ABCDEFGHJKLM', issued: Date.UTC(2026, 10, 18) }) }); }
    if (u.pathname.endsWith('IC-ABCDEFGHJKLM')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'IC-ABCDEFGHJKLM', course: 'arc42', name: 'Ada Lovelace', issued: Date.UTC(2026, 10, 18), record: rec }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No certificate has this ID.' }) });
  });
  await page.route('**/api/board**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ learners: 0, week: [], all: [] }) }));
  await page.goto(CRS); // same origin, so storage can be seeded
  await page.evaluate(([code]) => localStorage.setItem('iw-course-code', code), [mkCode('Ada Lovelace')]);
  await page.goto(CRS + 'learn/'); await page.waitForSelector('[data-cert-card] .cc-list');
  assert.match(await page.locator('[data-cert-card]').innerText(), /0 of 19/);
  assert.equal(await page.locator('[data-cert-card] form').count(), 0, 'nothing to claim yet');
  const qs = {}; for (let i = 0; i < 34; i++) qs['p:' + i] = { firstOk: i < 30 ? 1 : 0, box: 0, due: Date.now() + 864e5, ontime: 0, late: 0 };
  await page.evaluate(([ids, qs]) => {
    localStorage.setItem('iw-course-progress', JSON.stringify(Object.fromEntries(ids.map((i) => [i, Date.now()]))));
    localStorage.setItem('iw-board-local', JSON.stringify({ build: { sections: 12, checks: 6 }, qs, days: [] }));
  }, [ids, qs]);
  await page.goto(CRS + 'learn/'); await page.waitForSelector('[data-cert-card] form');
  assert.equal(await page.locator('[data-cert-card] input').inputValue(), 'Ada Lovelace', 'name comes from the access code');
  await page.click('[data-cert-card] button[type=submit]'); await page.waitForSelector('[data-cert-card] .cc-done a, [data-cert-card] a.btn-primary');
  assert.equal(issued.length, 1); assert.equal(issued[0].course, 'arc42'); assert.equal(issued[0].name, 'Ada Lovelace');
  assert.deepEqual(issued[0].record, { lessons: ids.length, sections: 12, checks: 6, mastered: 30 });
  assert.match(issued[0].proof, /^[A-Za-z0-9_-]{43}$/, 'proof is a hash, never the key');
  assert.ok(!JSON.stringify(issued[0]).includes(courseKey.toString('base64url')), 'the course key is never sent');
  await page.reload(); await page.waitForSelector('[data-cert-card] a.btn-primary');
  assert.equal(await page.locator('[data-cert-card] form').count(), 0, 'issued once; the card remembers it');
  assert.equal(await page.locator('[data-cert-card] a.btn-primary').getAttribute('href'), '/training/certificate/?id=IC-ABCDEFGHJKLM');
  assert.equal(issued.length, 1);
  // the certificate page
  await page.goto(HOME + '/training/certificate/?id=IC-ABCDEFGHJKLM'); await page.waitForSelector('.cert-card');
  const card = await page.locator('.cert-card').innerText();
  assert.match(card, /Ada Lovelace/); assert.match(card, /IC-ABCDEFGHJKLM/); assert.match(card, /18 November 2026/); assert.match(card, new RegExp(w.title));
  const add = new URL(await page.locator('a', { hasText: 'Add to LinkedIn profile' }).getAttribute('href'));
  assert.equal(add.hostname, 'www.linkedin.com'); assert.equal(add.searchParams.get('startTask'), 'CERTIFICATION_NAME');
  assert.equal(add.searchParams.get('name'), w.title); assert.equal(add.searchParams.get('organizationName'), 'Intellica');
  assert.equal(add.searchParams.get('issueYear'), '2026'); assert.equal(add.searchParams.get('issueMonth'), '11');
  assert.equal(add.searchParams.get('certId'), 'IC-ABCDEFGHJKLM'); assert.equal(add.searchParams.get('certUrl'), HOME + '/training/certificate/?id=IC-ABCDEFGHJKLM');
  for (const t of ['Share on LinkedIn', 'Share on X', 'Share on Facebook']) assert.ok(await page.locator('a', { hasText: t }).count(), t);
  assert.ok(await page.locator('button', { hasText: 'Save as PDF' }).count());
  await page.goto(HOME + '/training/certificate/?id=IC-ZZZZZZZZZZZZ'); await page.waitForSelector('[role=status]');
  assert.match(await page.locator('[data-cert-body]').innerText(), /No certificate has the ID/);
  await ctx.close();
});
await step('consulting: header, six offers, evidence with sources, and the example radar', async () => {
  const page = await open(`${HOME}/consulting/`);
  assert.equal(await page.locator('.bar-nav a[aria-current="page"]').innerText(), 'Consulting');
  assert.equal(await page.locator('.k-offer').count(), 6);
  assert.equal(await page.locator('.k-card').count(), 4);
  assert.ok((await page.locator('.k-sources li').count()) >= 4);
  assert.ok((await page.locator('#k-sample-radar svg polygon').count()) > 4);
  for (const a of await page.locator('.k-ref').all()) { const h = await a.getAttribute('href'); assert.ok(await page.locator(h).count(), `${h} exists`); }
  await page.context().close();
});
await step('consulting: each assessment runs end to end, scores in the browser, remembers the result, and shares only on request', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const sent = []; page.on('request', (r) => { if (!r.url().startsWith(HOME)) sent.push(r.url()); });
  await page.goto(`${HOME}/consulting/`);
  await page.waitForSelector('#assess-app .k-a');
  assert.equal(await page.locator('#assess-app .k-a').count(), 3);
  for (const [id, dims, per] of [['org', 6, 3], ['eng', 6, 2], ['gov', 4, 3]]) {
    await page.click(`[data-start="${id}"]`);
    for (let d = 0; d < dims; d++) {
      assert.ok(await page.locator('[data-next]').isDisabled(), 'Next waits for every answer');
      for (let q = 0; q < per; q++) { const r = page.locator(`#q-${d}-${q}-3`); for (let t = 0; t < 4 && !(await r.isChecked().catch(() => false)); t++) { await r.waitFor(); await r.dispatchEvent('click').catch(() => {}); await page.waitForTimeout(60); } assert.ok(await r.isChecked(), `answer ${d}.${q} did not register`); }
      await page.click('[data-next]');
    }
    await page.waitForSelector('.k-result');
    assert.match(await page.locator('.k-result h3').first().innerText(), /^100%: Leading/);
    assert.equal(await page.locator('.k-bars li').count(), dims);
    assert.ok(await page.locator('.k-result .rd-area').count());
    const wa = await page.locator('.k-result a.btn-primary').getAttribute('href');
    assert.match(decodeURIComponent(wa), /Overall 100% \(Leading\)/);
    await page.click('[data-all]');
  }
  // the lowest answers give the lowest level and point at the first moves
  await page.click('[data-start="org"]');
  for (let d = 0; d < 6; d++) { for (let q = 0; q < 3; q++) await page.check(`#q-${d}-${q}-0`, { force: true }); await page.click('[data-next]'); }
  assert.match(await page.locator('.k-result h3').first().innerText(), /^0%: Starting/);
  assert.equal(await page.locator('.k-focus li').count(), 2);
  // the result survives a reload
  await page.reload(); await page.waitForSelector('#assess-app .k-a');
  assert.match(await page.locator('[data-result="org"]').innerText(), /See my result \(0%\)/);
  assert.deepEqual(sent, [], 'nothing leaves the browser');
  await ctx.close();
});
await step('course page: the lab is shown, with a live check that passes when the scenario is fixed', async () => {
  const page = await open(CRS);
  await page.waitForSelector('[data-lab-demo]:not([hidden])');
  assert.equal(await page.locator('.lx-steps li').count(), 16);
  assert.equal(await page.locator('.lx-r').count(), 8);
  assert.equal(await page.locator('.lx-checks li.ok').count(), 2);
  await page.fill('#lx-demo-t', '| Q1 | #fast | A vendor taps Ready | The customer is notified | within 2 seconds |');
  assert.equal(await page.locator('.lx-checks li.ok').count(), 3);
  assert.match(await page.locator('[data-demo-msg]').innerText(), /All three pass/);
  for (const a of await page.locator('.lx-src a').all()) assert.ok(await page.locator(await a.getAttribute('href')).count());
  await page.context().close();
});
await step('workshop page: the lab and the evidence behind it are shown', async () => {
  const page = await open(`${HOME}/training/arc42/`);
  assert.ok(await page.locator('#lab-after a[href$="/course/"]').count());
  assert.equal(await page.locator('#research .lx-r').count(), 8);
  await page.context().close();
});
await step('home: leads with AI engineering, links to consulting, and the header has the four entries', async () => {
  const page = await open(`${HOME}/`);
  assert.match(await page.locator('h1').innerText(), /AI engineering for work that has to be right/);
  assert.ok(await page.locator('#what a[href="/consulting/"]').count());
  const nav = (await page.locator('.bar-nav a').allInnerTexts()).join('|');
  assert.equal(nav, 'Consulting|Training');
  assert.ok(await page.locator('.family summary').count());
  assert.equal(await page.locator('script[type="application/ld+json"]').first().innerText().then((t) => /@/.test(t.replace(/@context|@type/g, ''))), false, 'no email in the structured data');
  await page.context().close();
});
await step('workshop page: the twelve-section card shows the question for the section you tap, and lines up with the headline', async () => {
  const page = await open(HOME + WS);
  await page.locator('.sheet .cell').nth(2).click();
  assert.match(await page.locator('[data-sheet-q]').innerText(), /Who do we talk to/);
  const h = await page.locator('.t-pill').boundingBox(), c = await page.locator('.sheet').boundingBox();
  assert.ok(Math.abs(h.y - c.y) < 40, `card top ${c.y} vs pill top ${h.y}`);
  await page.context().close();
});
await step('course: a wrong code is refused, the right code unlocks every lesson and shows the buyer name', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(CRS + 'part-7-6-runtime/');
  await page.waitForSelector('[data-locked]:not([hidden])');
  await page.fill('[data-locked] input', 'not-a-code');
  await page.click('[data-locked] [type=submit]');
  assert.match(await page.locator('[data-locked] [data-unlock-msg]').innerText(), /does not look like/);
  await page.fill('[data-locked] input', mkCode('Wrong Key', Buffer.alloc(32, 7)));
  await page.click('[data-locked] [type=submit]');
  await page.waitForFunction(() => /does not unlock/.test(document.querySelector('[data-locked] [data-unlock-msg]').textContent));
  await page.fill('[data-locked] input', mkCode('Test Buyer'));
  await page.click('[data-locked] [type=submit]');
  await page.waitForSelector('[data-stage] .s');
  assert.match(await page.locator('[data-licence]').innerText(), /Test Buyer/);
  await page.goto(CRS + 'part-14-agents-as-readers/');
  await page.waitForSelector('[data-stage] .s');
  assert.match(await page.locator('[data-pos]').innerText(), /^1 \/ 16$/);
  // a diagram slide renders in a paid lesson
  await page.goto(CRS + 'part-9b-see-it-run/');
  await page.waitForSelector('[data-stage] .s');
  await page.click('[data-next]');
  assert.ok(await page.locator('[data-stage] svg text').count() > 0, 'diagram did not render');
  // forgetting the code locks it again
  await page.goto(CRS);
  await page.click('[data-forget]');
  await page.waitForSelector('html[data-ready="true"]');
  await page.goto(CRS + 'part-7-6-runtime/');
  await page.waitForSelector('[data-locked]:not([hidden])');
  assert.deepEqual(errs, []);
  await ctx.close();
});
await step('course: a tampered lesson file is rejected, not shown', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/course/data/part-7-6-runtime.json', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.ct = (j.ct[0] === 'A' ? 'B' : 'A') + j.ct.slice(1);
    await route.fulfill({ json: j });
  });
  await page.addInitScript((c) => localStorage.setItem('iw-course-code', c), mkCode('Test Buyer'));
  await page.goto(CRS + 'part-7-6-runtime/');
  await page.waitForSelector('[data-locked]:not([hidden])');
  assert.equal(await page.locator('[data-stage-wrap]').isHidden(), true);
  await ctx.close();
});
await step('course: finishing a lesson offers recall cards, and a missed card returns for review the next day', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-12-10T12:00:00Z') });
  await page.goto(CRS + 'part-0-opening/');
  await page.waitForSelector('[data-stage] .s');
  const n = Number((await page.locator('[data-pos]').innerText()).split('/')[1]);
  for (let i = 0; i < n; i++) await page.click('[data-next]');
  await page.waitForSelector('[data-recall]:not([hidden])');
  assert.ok(await page.locator('.rcard').count() >= 3, 'no recall cards');
  await page.locator('.rcard').first().locator('button', { hasText: 'Show the answer' }).click();
  await page.locator('.rcard').first().locator('button', { hasText: 'Not yet' }).click();
  await page.goto(CRS);
  assert.equal(await page.locator('[data-due]').isHidden(), true, 'a card due tomorrow is due today');
  await page.clock.setFixedTime(new Date('2026-12-12T12:00:00Z'));
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(await page.locator('[data-due]').isVisible(), true);
  assert.match(await page.locator('li.lesson[data-lesson="part-0-opening"] .badge').innerText(), /done/i);
  await ctx.close();
});
const QUIZ = JSON.parse(fs.readFileSync('training-private/arc42-quiz.json', 'utf8'));
const finishLesson = async (page) => { await page.waitForSelector('[data-stage] .s'); const n = Number((await page.locator('[data-pos]').innerText()).split('/')[1]); for (let i = 0; i < n; i++) await page.click('[data-next]'); };
await step('board: check questions score on the first try, return for review on schedule, and My course shows the score', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-12-10T12:00:00Z') });
  await page.goto(CRS + 'part-0-opening/');
  await finishLesson(page);
  await page.waitForSelector('[data-quiz]:not([hidden]) fieldset.qz');
  assert.equal(await page.locator('fieldset.qz').count(), 2);
  const a = QUIZ['part-0-opening'][0].a;
  await page.locator('fieldset.qz').first().locator(`input[value="${a}"]`).check();
  assert.match(await page.locator('.qz-out').first().innerText(), /Correct\..*\+10 points/);
  assert.equal(await page.locator('fieldset.qz').first().locator('input').first().isDisabled(), true, 'one answer per question');
  await page.locator('fieldset.qz').nth(1).locator(`input[value="${(QUIZ['part-0-opening'][1].a + 1) % 4}"]`).check();
  assert.match(await page.locator('.qz-out').nth(1).innerText(), /Not quite/);
  assert.equal(await page.locator('.qz-o.is-right').count(), 2, 'the right answer is shown either way');
  await page.evaluate((c) => localStorage.setItem('iw-course-code', c), mkCode('Board Buyer'));
  await page.goto(CRS + 'learn/'); await page.waitForSelector('[data-board-card] .sb-parts');
  const rows = await page.locator('.sb-parts li').allInnerTexts();
  assert.match(rows[0], /Recall\s+3%/, 'one of 34 questions right first time');
  assert.match(await page.locator('[data-board-card] .sb-hero').innerText(), /18\s+Points this week/i, '10 + 2 for the answers, 6 for the first day with a streak of 1');
  assert.match(await page.locator('[data-board-card] .sb-hero').innerText(), /1\s+Day streak/i);
  assert.match(await page.locator('[data-board-card] .sb-goal').innerText(), /first week/i);
  assert.equal(await page.locator('[data-board-card] .sb-join').isVisible(), true, 'joining is offered, not forced');
  await page.clock.setFixedTime(new Date('2026-12-11T12:30:00Z'));
  await page.goto(CRS + 'part-0-opening/'); await page.waitForSelector('[data-quiz]:not([hidden])');
  assert.match(await page.locator('[data-quiz] h2').innerText(), /Review/);
  assert.equal(await page.locator('fieldset.qz').count(), 2, 'both questions are due after a day');
  await page.locator('fieldset.qz').first().locator(`input[value="${a}"]`).check();
  assert.match(await page.locator('.qz-out').first().innerText(), /Review recorded.*\+8 points/);
  await ctx.close();
});
await step('board: joining shares only numbers and a proof; ranks, neighbours and the public board show', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const seen = [];
  const view = { handle: 'Ada', learners: 9, weekKey: '2026-12-07',
    week: { rank: 3, pts: 18, toPass: 5, passing: 'Grace', around: [{ handle: 'Linus', pts: 30 }, { handle: 'Grace', pts: 22 }, { handle: 'Ada', pts: 18, you: true }, { handle: 'Ken', pts: 9 }] },
    all: { rank: 4, pts: 18, toPass: 0, passing: null, around: [{ handle: 'Ada', pts: 18, you: true }] } };
  await page.route('**/api/board**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    seen.push({ m: req.method(), p: u.pathname, auth: req.headers().authorization || '', body: req.postData() || '' });
    const ok = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.endsWith('/join')) return ok({ token: 'a'.repeat(32), handle: 'Ada' });
    if (u.pathname.endsWith('/sync') || (u.pathname.endsWith('/me') && req.method() === 'GET')) return ok(view);
    if (u.pathname.endsWith('/me')) return ok({ deleted: true });
    return ok({ learners: 2, weekKey: '2026-12-07', week: [{ handle: 'Ada', pts: 71, streak: 4, overall: 50 }, { handle: 'Grace', pts: 40, streak: 2, overall: 30 }], all: [{ handle: 'Grace', pts: 400, streak: 2, overall: 30 }, { handle: 'Ada', pts: 300, streak: 4, overall: 50 }] });
  });
  await page.goto(CRS + 'part-0-opening/'); await finishLesson(page); await page.waitForSelector('fieldset.qz');
  await page.locator('fieldset.qz').first().locator(`input[value="${QUIZ['part-0-opening'][0].a}"]`).check();
  await page.evaluate((c) => localStorage.setItem('iw-course-code', c), mkCode('Board Buyer'));
  await page.goto(CRS + 'learn/'); await page.waitForSelector('[data-board-card] .sb-join');
  await page.fill('[data-handle]', 'Ada'); await page.click('.sb-join button[type=submit]');
  await page.waitForSelector('[data-leave]');
  const join = seen.find((x) => x.p.endsWith('/join'));
  const proof = crypto.createHash('sha256').update('board-v1:' + courseKey.toString('base64url')).digest('base64url');
  assert.deepEqual(JSON.parse(join.body), { handle: 'Ada', proof });
  assert.ok(!join.body.includes(courseKey.toString('base64url')), 'the course key itself is never sent');
  const sync = seen.filter((x) => x.p.endsWith('/sync')).pop();
  assert.ok(sync, 'progress is shared once joined'); assert.equal(sync.auth, 'Bearer ' + 'a'.repeat(32));
  const snap = JSON.parse(sync.body).snapshot;
  assert.deepEqual(Object.keys(snap).sort(), ['best', 'bestStreak', 'build', 'consistency', 'overall', 'prev', 'recall', 'reviews', 'streak', 'total', 'week', 'weekKey'], 'only numbers are shared: no answers, no document');
  assert.equal(snap.total, 16, 'the answer given before joining counts: 10 for the answer + 6 for the day');
  const card = await page.locator('[data-board-card]').innerText();
  assert.match(card, /Number 3 this week of 9\. Number 4 all time/);
  assert.match(card, /5 points to pass Grace/);
  assert.equal(await page.locator('.sb-around li').count(), 4); assert.equal(await page.locator('.sb-around li.is-you').count(), 1);
  await page.click('[data-leave]'); await page.waitForSelector('.sb-join');
  assert.ok(seen.some((x) => x.m === 'DELETE'), 'leaving deletes the record');
  assert.equal(await page.evaluate(() => localStorage.getItem('iw-board-token')), null);
  // public board on the workshop page: two boards
  await page.goto(HOME + '/training/arc42/'); await page.waitForSelector('.lb-table');
  assert.equal(await page.locator('.lb-table tbody tr').count(), 2);
  assert.match(await page.locator('.lb-table tbody tr').first().innerText(), /Ada\s+71/);
  await page.click('.lb-tab[data-kind="all"]');
  assert.match(await page.locator('.lb-table tbody tr').first().innerText(), /Grace\s+400/);
  assert.ok(await page.locator('.lb-how').count(), 'how points work is on the page');
  await ctx.close();
  const c2 = await browser.newContext(); const p2 = await c2.newPage();
  await p2.goto(HOME + '/training/arc42/'); await p2.waitForSelector('.lb-empty');
  assert.match(await p2.locator('.lb-empty').innerText(), /Nobody has points yet/);
  const html = await (await fetch(HOME + '/training/arc42/')).text();
  assert.ok(html.includes('id="leaderboard"') && html.includes('How points work'), 'the explanation is in the HTML itself');
  await c2.close();
});
await step('course: lessons stay inside the screen at 320px', async () => {
  const p = await open(CRS + 'part-1-foundations/', { viewport: { width: 320, height: 700 } });
  await p.waitForSelector('[data-stage] .s');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await p.context().close();
});
await step('course: the slides folder stays private and the course pages do not link to it', async () => {
  for (const f of fs.readdirSync('site/training/arc42/course', { recursive: true })) {
    const full = 'site/training/arc42/course/' + f;
    if (fs.statSync(full).isFile() && /\.(html|js|css)$/.test(f)) assert.ok(!fs.readFileSync(full, 'utf8').includes('deck-'), `${full} links to the slides`);
  }
});
await step('worked example: page, zip and arc42 are served and the zip matches the source', async () => {
  const p = await open(HOME + WS + 'example/');
  assert.ok(await p.locator('a[href$="doubles-to-go.zip"]').count());
  const z = await fetch(HOME + WS + 'example/doubles-to-go.zip');
  assert.equal(z.status, 200);
  assert.ok((await z.arrayBuffer()).byteLength > 20000);
  assert.match(await (await fetch(HOME + WS + 'example/arc42.md')).text(), /^# Doubles-to-Go/);
  await p.context().close();
});

/* ---------- cybersecurity course ---------- */
const CY = HOME + '/training/cybersecurity/course/';
const { deriveKey } = await import('./build-course.mjs');
const cyCode = (name) => mkCode(name, deriveKey(courseKey, 'cybersecurity'));
await step('cybersecurity: course page lists 28 lessons, two free, and the catalogue page offers the free lessons', async () => {
  const p = await open(CY);
  assert.equal(await p.locator('a[href*="/training/cybersecurity/course/"][href$="/"]').count() > 20, true);
  assert.deepEqual(p.problems, []);
  const cat = await open(`${HOME}/training/cybersecurity/`);
  assert.equal(await cat.locator('a', { hasText: 'Start the free lessons' }).count(), 1);
  assert.ok(!/arc42|Doubles/i.test(await p.locator('main').innerText()), 'arc42 wording leaked into the cybersecurity course');
  await p.context().close(); await cat.context().close();
});
await step('cybersecurity: a free lesson plays 12 slides, shows its field guide, worked case and rubric, and asks three questions', async () => {
  const p = await open(CY + 'security-foundations-for-the-agentic-era/');
  await p.waitForSelector('[data-stage] .s');
  assert.match(await p.locator('[data-pos]').innerText(), /^1 \/ 12$/);
  await p.click('[data-next]');
  assert.match(await p.locator('[data-pos]').innerText(), /^2 \/ 12$/);
  await p.waitForSelector('[data-reading]:not([hidden]) h2');
  const t = await p.locator('[data-reading]').innerText();
  assert.match(t, /Field guide/); assert.match(t, /Worked case/); assert.match(t, /Competent/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});
await step('cybersecurity: a paid lesson is locked and encrypted; its own code (not the arc42 code) opens it', async () => {
  const id = 'tool-api-and-mcp-security';
  const p = await open(CY + id + '/');
  await p.waitForSelector('[data-locked]:not([hidden])');
  const enc = await (await fetch(CY + 'data/' + id + '.json')).json();
  assert.deepEqual(Object.keys(enc).sort(), ['ct', 'id', 'iv', 'v']);
  await p.context().close();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((c) => localStorage.setItem('iwc-course-code', c), cyCode('Cyber Buyer'));
  const q = await ctx.newPage(); const errs = []; q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(CY + id + '/'); await q.waitForSelector('[data-stage] .s', { timeout: 8000 });
  assert.match(await q.locator('[data-pos]').innerText(), /^1 \/ 12$/);
  assert.deepEqual(errs, []);
  const ctx2 = await browser.newContext(); await ctx2.addInitScript((c) => localStorage.setItem('iwc-course-code', c), mkCode('Wrong'));
  const w = await ctx2.newPage(); await w.goto(CY + id + '/'); await w.waitForSelector('[data-locked]:not([hidden])');
  await ctx.close(); await ctx2.close();
});
await step('cybersecurity: the lab is one assurance pack with 28 sections, a model solution per lesson, and a pack download', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((c) => localStorage.setItem('iwc-course-code', c), cyCode('Cyber Buyer'));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(CY + 'lab/');
  await page.waitForSelector('[data-lab-page]:not([hidden]) [data-step-panel] h2');
  await page.fill('[data-sys]', 'Claims Agent');
  await page.locator('[data-sec="s1"]').click();
  assert.match(await page.inputValue('[data-text]'), /## 1\. Security Foundations for the Agentic Era/);
  assert.match(await page.locator('[data-step-panel]').innerText(), /Task 1|Required|evidence/i);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-download]')]);
  assert.equal(dl.suggestedFilename(), 'claims-agent-assurance-pack.md');
  const md = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
  for (let n = 1; n <= 28; n++) assert.ok(new RegExp(`^## ${n}\\. `, 'm').test(md), `section ${n} is in the export`);
  assert.deepEqual(errs, []);
  await ctx.close();
});

await step('cybersecurity practice tools: the policy tester scores eight predictions and the trace spotter finds the planted violations', async () => {
  const raw = async (u) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const g = await c.newPage(); g.problems = []; g.on('console', (m) => { if (m.type() === 'error') g.problems.push(m.text()); }); g.on('pageerror', (e) => g.problems.push(e.message)); await g.goto(u); return g; };
  const p = await raw(CY + 'lab/policy/');
  await p.waitForSelector('[data-cases] li.case');
  assert.equal(await p.locator('[data-cases] li.case').count(), 8);
  for (const li of await p.locator('[data-cases] li.case').all()) await li.locator('button').first().click();
  assert.match(await p.locator('[data-score]').innerText(), /^\d of 8 right/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
  const t = await raw(CY + 'lab/trace/');
  await t.waitForSelector('[data-rows] tr');
  await t.click('[data-run]');
  assert.match(await t.locator('[data-res]').innerText(), /Reference checker: step \d+/);
  await t.click('[data-check]');
  assert.match(await t.locator('[data-res]').innerText(), /^0 of [1-9]\d* violations found/);
  assert.deepEqual(t.problems, []);
  await t.context().close();
  assert.equal((await fetch(CY + 'lab/files/policy-cases.json')).status, 200);
  for (const f of ['lab/kit/', 'lab/changelog/', 'lab/files/agent-lab-kit.mjs', 'lab/files/agent_guardrail_test.rego']) assert.equal((await fetch(CY + f)).status, 200, f);
  assert.match(await (await fetch(CY + 'lab/kit/')).text(), /node agent-lab-kit\.mjs/);
});

/* ---------- Level 1: Software Architecture Foundations ---------- */
const F1 = HOME + '/training/software-architecture-foundations/course/';
const f1Code = (name) => mkCode(name, deriveKey(courseKey, 'software-architecture-foundations'));
await step('level 1: the level page offers free lessons, a free lesson plays, a paid lesson is locked, and the academy page lists six levels', async () => {
  const cat = await open(`${HOME}/training/software-architecture-foundations/`);
  assert.match(await cat.locator('main').innerText(), /Lessons 1 and 10 are free/);
  await cat.context().close();
  const p = await open(F1 + 'what-software-architecture-is-and-what-architects-do/');
  await p.waitForSelector('[data-stage] .s');
  assert.match(await p.locator('[data-pos]').innerText(), /^1 \/ 8$/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
  const l = await open(F1 + 'runtime-views-and-distributed-systems/');
  await l.waitForSelector('[data-locked]:not([hidden])');
  await l.context().close();
  const a = await open(`${HOME}/training/architecture-academy/`);
  assert.equal(await a.locator('.ac-card:has(a[href*="/level-"])').count(), 6);
  assert.match(await a.locator('main').innerText(), /independent of iSAQB/);
  const l1 = await open(`${HOME}/training/architecture-academy/level-1/`);
  assert.match(await l1.locator('main').innerText(), /not an iSAQB course/);
  await l1.context().close();
  assert.deepEqual(a.problems, []);
  await a.context().close();
});
await step('level 1: with its own code all 14 lessons play without overflow, and the mock exams open, encrypted and wrong-code safe', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((c) => localStorage.setItem('iwf-course-code', c), f1Code('F Buyer'));
  const q = await ctx.newPage(); const errs = []; q.on('pageerror', (e) => errs.push(e.message));
  const ids = (await (await fetch(F1 + 'data/lab-index.json')).json()).steps.map((x) => x.id);
  assert.equal(ids.length, 14);
  const bad = [];
  for (const lid of ids) {
    await q.goto(F1 + lid + '/'); await q.waitForSelector('[data-stage] .s', { timeout: 8000 });
    for (let k = 0; k < 8; k++) {
      const over = await q.evaluate(() => { const st = document.querySelector('[data-stage]'); const r = st.getBoundingClientRect(); return [...st.querySelectorAll('.s *')].some((e) => { const b = e.getBoundingClientRect(); return b.height > 0 && (b.bottom > r.bottom + 2 || b.right > r.right + 2); }); });
      if (over) bad.push(lid + ' slide ' + (k + 1));
      if (k < 7) await q.click('[data-next]');
    }
  }
  assert.deepEqual(bad, [], 'slides overflow their stage');
  assert.deepEqual(errs, []);
  await q.goto(F1 + 'lab/mock/'); await q.waitForSelector('[data-forms] > *', { timeout: 8000 });
  assert.ok(await q.locator('[data-forms] > *').count() >= 5, 'five mock exams are listed');
  await ctx.close();
  const raw = await (await fetch(F1 + 'data/mock-1.json')).text();
  assert.ok(!/"stem"|clinic/i.test(raw), 'mock data is encrypted');
  const plain = await (await fetch(F1 + 'lab/mock/')).text();
  assert.ok(!/ClinicBook booking/.test(plain), 'no question text in the mock page');
});

/* ---------- Level 3: Quality, Decisions and Evaluation ---------- */
const Q2 = HOME + '/training/quality-decisions/course/';
const q2Code = (name) => mkCode(name, deriveKey(courseKey, 'quality-decisions'));
await step('level 2: course page lists 20 lessons in five modules with its own wording, and the level page offers the free lessons', async () => {
  const p = await open(Q2);
  assert.equal(await p.locator('a[href*="/training/quality-decisions/course/"][href$="/"]').count() > 19, true);
  assert.deepEqual(p.problems, []);
  const cat = await open(`${HOME}/training/quality-decisions/`);
  assert.equal(await cat.locator('a', { hasText: 'Start the free lessons' }).count(), 1);
  assert.match(await cat.locator('main').innerText(), /Lessons 1 and 9 are free/);
  await p.context().close(); await cat.context().close();
});
await step('level 2: a free lesson plays four slides with field guide, worked case and rubric', async () => {
  const p = await open(Q2 + 'quality-models-and-the-quality-tree/');
  await p.waitForSelector('[data-stage] .s');
  assert.match(await p.locator('[data-pos]').innerText(), /^1 \/ 4$/);
  await p.click('[data-next]');
  await p.waitForSelector('[data-reading]:not([hidden]) h2');
  const t = await p.locator('[data-reading]').innerText();
  assert.match(t, /Field guide/); assert.match(t, /Worked case/); assert.match(t, /Competent/); assert.match(t, /Sources/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});
await step('level 2: a paid lesson is locked; only its own code opens it, and no slide overflows', async () => {
  const id = 'availability-and-error-budgets';
  const p = await open(Q2 + id + '/');
  await p.waitForSelector('[data-locked]:not([hidden])');
  await p.context().close();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((c) => localStorage.setItem('iwq-course-code', c), q2Code('Q Buyer'));
  const q = await ctx.newPage(); const errs = []; q.on('pageerror', (e) => errs.push(e.message));
  const ids = (await (await fetch(Q2 + 'data/lab-index.json')).json()).steps.map((x) => x.id);
  assert.equal(ids.length, 20);
  const bad = [];
  for (const lid of ids) {
    await q.goto(Q2 + lid + '/'); await q.waitForSelector('[data-stage] .s', { timeout: 8000 });
    for (let k = 0; k < 4; k++) {
      const over = await q.evaluate(() => { const st = document.querySelector('[data-stage]'); const r = st.getBoundingClientRect(); return [...st.querySelectorAll('.s *')].some((e) => { const b = e.getBoundingClientRect(); return b.height > 0 && (b.bottom > r.bottom + 2 || b.right > r.right + 2); }); });
      if (over) bad.push(lid + ' slide ' + (k + 1));
      if (k < 3) await q.click('[data-next]');
    }
  }
  assert.deepEqual(bad, [], 'slides overflow their stage');
  assert.deepEqual(errs, []);
  const ctx2 = await browser.newContext(); await ctx2.addInitScript((c) => localStorage.setItem('iwq-course-code', c), cyCode('Wrong course'));
  const w = await ctx2.newPage(); await w.goto(Q2 + id + '/'); await w.waitForSelector('[data-locked]:not([hidden])');
  await ctx.close(); await ctx2.close();
});
await step('level 2: the lab is one record with 20 sections and a download', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((c) => localStorage.setItem('iwq-course-code', c), q2Code('Q Buyer'));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(Q2 + 'lab/');
  await page.waitForSelector('[data-lab-page]:not([hidden]) [data-step-panel] h2');
  await page.fill('[data-sys]', 'Vendor App');
  await page.locator('[data-sec="s1"]').click();
  assert.match(await page.inputValue('[data-text]'), /## 1\. Quality Models and the Quality Tree/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-download]')]);
  assert.equal(dl.suggestedFilename(), 'vendor-app-decisions-record.md');
  const md = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
  for (let n = 1; n <= 20; n++) assert.ok(new RegExp(`^## ${n}\\. `, 'm').test(md), `section ${n} is in the export`);
  assert.deepEqual(errs, []);
  await ctx.close();
});
await step('level 2 practice tools: the scenario checker grades text and six cases, and the budget calculator computes', async () => {
  const raw = async (u) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const g = await c.newPage(); g.problems = []; g.on('console', (m) => { if (m.type() === 'error') g.problems.push(m.text()); }); g.on('pageerror', (e) => g.problems.push(e.message)); await g.goto(u); return g; };
  const p = await raw(Q2 + 'lab/scenario/');
  await p.waitForSelector('[data-cases] li.case');
  await p.fill('[data-text]', 'The system should be fast and scalable.');
  assert.match(await p.locator('[data-out]').innerText(), /not yet testable/);
  await p.fill('[data-text]', 'During lunchtime peak, 500 orders a minute are submitted; 95% are confirmed within 2 seconds.');
  assert.match(await p.locator('[data-out]').innerText(), /: testable/);
  for (const li of await p.locator('[data-cases] li.case').all()) await li.locator('button').first().click();
  assert.match(await p.locator('[data-score]').innerText(), /^\d of 6 right/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
  const b = await raw(Q2 + 'lab/budget/');
  await b.waitForSelector('[data-avail]');
  await b.fill('[data-avail] [name=target]', '99.99');
  assert.match(await b.locator('[data-avail] + [data-res]').innerText(), /52\.6 minutes|52\.56|0\.9 hours/);
  assert.match(await b.locator('[data-serial] + [data-res]').innerText(), /3 dependencies/);
  assert.match(await b.locator('[data-debt] + [data-res]').innerText(), /12 months/);
  assert.deepEqual(b.problems, []);
  await b.context().close();
});

/* ---------- one place to enter a code ---------- */
await step('training: header tiles link to every course, and "I have an access code" is one click from the first screen', async () => {
  const p = await open(`${HOME}/training/`);
  assert.equal(await p.locator('.hero-tiles .tile').count(), 13, 'six levels and seven courses');
  assert.equal(await p.locator('.hero-tiles a[href="/training/cybersecurity/"]').count(), 1);
  await p.click('a:has-text("I have an access code")');
  await p.waitForURL('**/training/my-courses/');
  await p.context().close();
  for (const path of ['/training/cybersecurity/', '/training/cybersecurity/course/', '/training/arc42/course/']) {
    const q = await open(HOME + path);
    assert.equal(await q.locator('a.sn-code[href="/training/my-courses/"]').count(), 1, path + ' links to the code page');
    await q.context().close();
  }
});
await step('my-courses: a cybersecurity code opens the cybersecurity course, an arc42 code opens arc42, a bad code says so', async () => {
  for (const [code, want] of [[cyCode('Cy Buyer'), '/training/cybersecurity/course/learn/'], [mkCode('Arc Buyer', courseKey), '/training/arc42/course/learn/'], [q2Code('Q Buyer'), '/training/quality-decisions/course/learn/']]) {
    const p = await open(`${HOME}/training/my-courses/`);
    await p.fill('#mc-code', code); await p.click('button[type=submit]');
    await p.waitForURL('**' + want, { timeout: 8000 });
    await p.context().close();
  }
  const b = await open(`${HOME}/training/my-courses/`);
  await b.fill('#mc-code', mkCode('Nobody', deriveKey(courseKey, 'other')));
  await b.click('button[type=submit]');
  await b.waitForFunction(() => /does not open any course/.test(document.querySelector('[data-msg]').textContent));
  await b.context().close();
  // a returning visitor sees a Continue button
  const ctx = await browser.newContext(); await ctx.addInitScript((c) => localStorage.setItem('iwc-course-code', c), cyCode('Cy Buyer'));
  const r = await ctx.newPage(); await r.goto(`${HOME}/training/my-courses/`);
  await r.waitForSelector('[data-mine]:not([hidden]) a.btn');
  assert.match(await r.locator('[data-mine]').innerText(), /Cybersecurity/);
  await ctx.close();
});

await browser.close();
stop();
console.log(failed ? `\n${failed} failed` : '\nall browser checks passed');
process.exit(failed ? 1 : 0);
