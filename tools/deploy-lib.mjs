// Pure helpers for tools/deploy.mjs, kept in their own file so tests can import them without running a deploy.
import { spawnSync } from 'node:child_process';

/* Which Pages project serves the domain? Parsed from `wrangler pages project list`. Returns null if it cannot tell. */
export function parseDomainProject(out, domain = 'meeting-mind.com') {
  for (const line of String(out).split('\n')) {
    const c = line.split(/[│|]/).map((x) => x.trim()).filter(Boolean);
    if (c.length >= 2 && !/project name/i.test(c[0]) && c.slice(1).some((x) => x.split(/[,\s]+/).includes(domain))) return c[0];
  }
  return null;
}

/* Is the live site exactly the build we just uploaded? Compares the manifest root hash, which changes whenever any served file changes.
   (The kit VERSION does not: it stays the same for many deploys, so comparing it can report success while the domain still serves old pages.) */
export function sameRelease(liveText, wantText) {
  let live = null, want = null;
  try { live = JSON.parse(liveText); } catch { /* not JSON: the domain is serving something else (an error page, another project) */ }
  try { want = JSON.parse(wantText); } catch { /* handled below */ }
  if (!want || !want.root) return { ok: false, reason: 'The local dist/site-manifest.json has no root hash. Run npm run sync.', live: '', want: '' };
  if (!live || !live.root) return { ok: false, reason: 'The live domain did not return a site manifest.', live: '', want: want.root };
  return { ok: live.root === want.root, reason: live.root === want.root ? '' : 'The live manifest root differs from the upload.', live: live.root, want: want.root };
}

/* Refuses a deploy from a checkout that is behind origin/main: a stale checkout would publish old pages over newer work.
   Returns { ok, behind, note }. When git or the remote is unavailable it says so and does not block. */
export function gitBehind(run = (a) => spawnSync('git', a, { encoding: 'utf8' })) {
  const f = run(['fetch', '--quiet', 'origin']);
  if (f.status !== 0) return { ok: true, behind: 0, note: 'Could not reach origin to compare; skipped the stale-checkout check.' };
  const r = run(['rev-list', '--count', 'HEAD..origin/main']);
  if (r.status !== 0) return { ok: true, behind: 0, note: 'No origin/main to compare with; skipped the stale-checkout check.' };
  const behind = parseInt(String(r.stdout).trim(), 10) || 0;
  return { ok: behind === 0, behind, note: behind ? `This checkout is ${behind} commit(s) behind origin/main. Run: git pull --rebase, then deploy again.` : '' };
}
