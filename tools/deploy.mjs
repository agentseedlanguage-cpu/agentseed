#!/usr/bin/env node
// Deploys a site to Cloudflare Pages by direct upload (Wrangler), bypassing the GitHub integration.
//   npm run deploy -- home                 one target: home | verichain | vericrypt | erp | omc | agentseed
//   npm run deploy -- all                  every target
//   options: --dry (print what would run), --no-gate (skip sync and check), --branch=main,
//            --project=NAME --allow-other-project   (upload to a different Pages project: refused unless both are given)
//            --preview --branch=NAME   (a non-main branch makes a throwaway preview URL, not meeting-mind.com: refused unless --preview is given)
//            --no-git-check            (skip the check that this checkout is not behind origin/main)
//   npm run deploy:where                   list your Pages projects and which domains each one serves
// Needs two environment variables (Codespaces secrets, see INSTALL.md):
//   CLOUDFLARE_API_TOKEN   token with Account > Cloudflare Pages > Edit
//   CLOUDFLARE_ACCOUNT_ID  your account id
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadKey } from './build-course.mjs';
import { parseDomainProject, sameRelease, gitBehind } from './deploy-lib.mjs';

const WRANGLER = 'wrangler@4';
const cfg = JSON.parse(fs.readFileSync('tools/deploy.config.json', 'utf8'));
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const names = args.filter((a) => !a.startsWith('--'));
const dry = flags.includes('--dry');
const branch = (flags.find((f) => f.startsWith('--branch=')) || '--branch=main').split('=')[1];
const projectOverride = (flags.find((f) => f.startsWith('--project=')) || '').split('=')[1] || '';
const targets = names.includes('all') ? Object.keys(cfg).filter((k) => k !== 'note') : names;

if (!targets.length || targets.some((t) => !cfg[t] || t === 'note')) {
  console.error(`Usage: npm run deploy -- <${Object.keys(cfg).filter((k) => k !== 'note').join('|')}|all> [--dry] [--no-gate] [--branch=main]`);
  process.exit(2);
}
if (branch !== 'main' && !flags.includes('--preview')) { console.error(`--branch=${branch} would publish a preview URL, not meeting-mind.com. Use the default (main), or add --preview if a preview is really what you want.`); process.exit(2); }
if (projectOverride && !flags.includes('--allow-other-project')) { console.error(`--project=${projectOverride} would upload to a project that may not serve meeting-mind.com. Add --allow-other-project only if you are sure.`); process.exit(2); }
if (!dry && !flags.includes('--no-git-check')) {
  const g = gitBehind();
  if (g.note) console.log(g.note);
  if (!g.ok) { console.error('Nothing was deployed.'); process.exit(2); }
}
if (!dry && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID. See INSTALL.md, "Deploy from the Codespace".');
  process.exit(2);
}

const run = (cmd, a, opts = {}) => {
  console.log(`\n$ ${cmd} ${a.join(' ')}`);
  if (dry) return { status: 0, stdout: '', stderr: '' };
  return spawnSync(cmd, a, { encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', env: process.env, cwd: opts.cwd || process.cwd() });
};

if (!flags.includes('--no-gate')) {
  // generated files (metadata, manifest, training pages) must be current before upload
  for (const a of [['run', 'sync'], ['tools/check.mjs', '--all']]) {
    const r = a[0] === 'run' ? run('npm', a) : run('node', a);
    if (r.status !== 0) { console.error('\nThe gate failed, nothing was deployed.'); process.exit(1); }
  }
}

for (const t of targets) {
  const { dir } = cfg[t];
  let project = projectOverride || cfg[t].project;
  if (!dry && t === 'home' && !projectOverride) {
    const l = spawnSync('npx', ['--yes', WRANGLER, 'pages', 'project', 'list'], { encoding: 'utf8', env: process.env });
    const serving = parseDomainProject(`${l.stdout || ''}${l.stderr || ''}`);
    if (serving && serving !== project) { console.log(`\nmeeting-mind.com is served by the Pages project "${serving}", not "${project}". Deploying to "${serving}".`); project = serving; }
    else if (!serving) console.log('\nCould not tell which Pages project serves meeting-mind.com. After the upload the script checks the live site and says if it did not change.');
  }
  if (!dry && !fs.existsSync(`${dir}/index.html`)) { console.error(`${dir}/index.html not found`); process.exit(1); }
  // create the project the first time; harmless if it exists
  const made = run('npx', ['--yes', WRANGLER, 'pages', 'project', 'create', project, '--production-branch', branch], { capture: true });
  const out = `${made.stdout || ''}${made.stderr || ''}`;
  if (made.status !== 0 && !/already exists|8000002/i.test(out)) { console.error(out); console.error(`Could not create project ${project}.`); process.exit(1); }
  if (made.status === 0 && !dry) console.log(`created project ${project}`);
  // only the home project carries the leaderboard API (the functions/ folder); the other projects are deployed from an empty folder so they stay static
  const cwd = t === 'home' ? process.cwd() : fs.mkdtempSync(`${process.env.TMPDIR || '/tmp'}/deploy-`);
  const abs = fs.existsSync(dir) ? fs.realpathSync(dir) : dir;
  // the leaderboard's invisible gate: only browsers that hold a real access code can join. The value comes from the course key and is
  // written into the uploaded Function only; the committed placeholder is restored right after.
  const PROOF_FILE = 'worker/proof.js', placeholder = t === 'home' && !dry ? fs.readFileSync(PROOF_FILE, 'utf8') : null;
  if (placeholder !== null) {
    const key = loadKey({ create: false });
    if (key) fs.writeFileSync(PROOF_FILE, `export const PROOF = '${crypto.createHash('sha256').update('board-v1:' + key.toString('base64url')).digest('base64url')}';\n`);
    else console.log('No course key found: the leaderboard will stay closed to new members.');
  }
  // online buying: the course key + an owner key go into the uploaded Function only (git-ignored .pay.json holds the owner key)
  const SEC_FILE = 'worker/secrets.js', secPlaceholder = t === 'home' && !dry ? fs.readFileSync(SEC_FILE, 'utf8') : null;
  if (secPlaceholder !== null) {
    const key = loadKey({ create: false });
    if (key) {
      let cfg = fs.existsSync('.pay.json') ? JSON.parse(fs.readFileSync('.pay.json', 'utf8')) : {};
      if (!cfg.adminKey) { cfg.adminKey = crypto.randomBytes(18).toString('base64url'); fs.writeFileSync('.pay.json', JSON.stringify(cfg, null, 2) + '\n'); console.log(`Owner key for the review page (saved in .pay.json): ${cfg.adminKey}`); }
      if (!cfg.ntfyTopic) {
        cfg.ntfyTopic = 'intellica-' + crypto.randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9]/g, '');
        fs.writeFileSync('.pay.json', JSON.stringify(cfg, null, 2) + '\n');
        console.log(`\nPhone alerts for every order: install the free "ntfy" app (iPhone or Android), tap +, choose "Subscribe to topic", and enter exactly:\n  ${cfg.ntfyTopic}\n(The topic name is your password. It is saved in .pay.json.)\n`);
      }
      fs.writeFileSync(SEC_FILE, `export const SECRETS = ${JSON.stringify({ courseKey: key.toString('base64url'), adminKey: cfg.adminKey, ntfyTopic: cfg.ntfyTopic })};\n`);
      console.log('Online buying: ON (bank deposit + receipt check).');
    } else console.log('Online buying: off (no course key found). The course page will say "buy on WhatsApp".');
  }
  const dep = run('npx', ['--yes', WRANGLER, 'pages', 'deploy', abs, '--project-name', project, '--branch', branch, '--commit-dirty=true'], { cwd });
  if (placeholder !== null) fs.writeFileSync(PROOF_FILE, placeholder);
  if (secPlaceholder !== null) fs.writeFileSync(SEC_FILE, secPlaceholder);
  if (dep.status !== 0) { console.error(`\nDeploy of ${t} failed.`); process.exit(1); }
  console.log(`\n${t}: uploaded to the Pages project "${project}".`);
  if (t === 'home' && !dry) {
    // do not claim success until the live domain really serves what was just uploaded: compare the manifest root hash (it changes with every
    // served file; the kit version does not, so it cannot tell a new upload from the previous one)
    const wantText = fs.readFileSync('dist/site-manifest.json', 'utf8');
    let r = { ok: false, reason: '', live: '', want: '' };
    for (let i = 0; i < 6 && !r.ok; i++) {
      if (i) await new Promise((res) => setTimeout(res, 8000));
      try { r = sameRelease(await (await fetch(`https://meeting-mind.com/site-manifest.json?cb=${Date.now()}`, { cache: 'no-store' })).text(), wantText); } catch (e) { r = { ok: false, reason: String(e.message || e), live: '', want: '' }; }
    }
    if (r.ok) console.log(`  VERIFIED: https://meeting-mind.com serves exactly this upload (manifest root ${r.want.slice(0, 16)}). Also open https://meeting-mind.com/verify-site/`);
    else {
      console.error(`\n  NOT LIVE YET: ${r.reason}\n  live root:   ${r.live ? r.live.slice(0, 16) : '(none)'}\n  upload root: ${r.want ? r.want.slice(0, 16) : '(none)'}\n  The domain is probably attached to a different Pages project. Run: npm run deploy:where\n  then: npm run deploy -- home --no-gate --project=<the project that lists meeting-mind.com> --allow-other-project`);
      process.exit(3);
    }
  } else console.log('  Check https://meeting-mind.com/verify-site/ : it must say all files match.');
}
