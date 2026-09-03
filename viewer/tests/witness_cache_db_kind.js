#!/usr/bin/env node
// witness_cache_db_kind.js — W-CDK. THE CACHE JUDGES THE DB THE VIEWER LOADS, AND SAYS WHICH.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/4D_MODEL_INTEGRITY.md §M.0 items 2+3, §M.5 items
// 3+7, 2026-09-04, §CACHE_DB_KIND). Read the log after every run (project Log Mandate).
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   scripts/cache_4d_run.js keyed every persisted run on `<bld>_extracted.db`, while the viewer loads
//   the split pair `_meta.db` + `_geo.db` whenever both exist (streaming.js §DB_SPLIT_DETECT /
//   §SPLIT_PAIR_REQUIRED). For Hospital that meant the "persisted run" was the 20-label INFERRED grid
//   (317 d, 42 tasks), not the post-#1641 7-band grid the viewer plays (334 d, 36 tasks) — the
//   split-DB live≠probe landmine inside clause 5's own instrument. Separately, buildings/Duplex_meta.db
//   is a 0-byte file, and scripts/probe_tm_reveal_shipped.js preferred meta on `existsSync` alone, so
//   sql.js threw and the probe exited 2 on Duplex. One resolver now owns "which db", mirrors the
//   viewer's rule, refuses an unreadable file WITH the reason, and puts the kind in the cache key.
//
// CLAIMS (PASS / FAIL / INCONCLUSIVE — a 0 over an empty population is never a PASS):
//   C1 PAIR→META     every fleet building with a usable meta AND geo resolves to meta (what the viewer loads).
//   C2 EMPTY→SKIP    a building whose meta file exists but is unusable resolves to extracted and NAMES why.
//   C3 FORCED        DB_KIND=extracted still reaches the whole-db run, under a DIFFERENT cache dir.
//   C4 DIR NAMES IT  every resolvable building's cache dir ends in `_<kind>`.
//   C5 ONE OWNER     the probe calls CACHE.resolveDbFile and carries no resolver of its own.
//   C6 RED CONTROL   on a synthetic fixture: 0-byte meta, LFS-pointer meta, meta-without-geo and a
//                    good pair — the OLD rule (`existsSync(meta)`) picks the trap in 3 of 4 cases,
//                    the shipped resolver picks it in 0 and states each reason.
//   C7 END TO END    a real build of Duplex into a throwaway CACHE_4D_DIR writes dbKind/dbFile into
//                    run.json and prints §CACHE_DB / §CACHE_BUILT with kind=; DB_KIND=meta on Duplex
//                    is refused with the 0-byte reason; the probe no longer dies on Duplex.
//
// Command: node viewer/tests/witness_cache_db_kind.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, judged, bad, detail) {
  const v = judged === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_CDK ' + id.padEnd(16) + v.padEnd(13) + 'judged=' + String(judged).padEnd(5) + 'bad=' + String(bad).padEnd(5) + (detail || ''));
  return v;
}

// ── the fleet as it is on disk ──────────────────────────────────────────────────────────────────
const names = new Set();
if (fs.existsSync(BLD_DIR)) fs.readdirSync(BLD_DIR).forEach(f => {
  const m = f.match(/^(.+)_(meta|extracted)\.db$/); if (m) names.add(m[1]);
});
const fleet = Array.from(names).sort().map(b => {
  const meta = path.join(BLD_DIR, b + '_meta.db'), geo = path.join(BLD_DIR, b + '_geo.db');
  return { b, metaProblem: CACHE.sqliteProblem(meta), geoProblem: CACHE.sqliteProblem(geo),
    metaExists: fs.existsSync(meta), r: CACHE.resolveDbFile(b, 'auto', BLD_DIR) };
});
fleet.forEach(x => console.log('§W_CDK_FLEET ' + x.b.padEnd(22) + ' meta=' + (x.metaProblem || 'ok').padEnd(10) + ' geo=' + (x.geoProblem || 'ok').padEnd(10) +
  ' -> kind=' + x.r.kind + ' file=' + (x.r.path ? path.basename(x.r.path) : null) + ' | ' + x.r.reason));

// C1
{
  const pop = fleet.filter(x => !x.metaProblem && !x.geoProblem);
  const bad = pop.filter(x => x.r.kind !== 'meta');
  claim('C1_PAIR_TO_META', pop.length, bad.length, pop.map(x => x.b + '=' + x.r.kind).join(' '));
}
// C2
{
  const pop = fleet.filter(x => x.metaExists && x.metaProblem);
  const bad = pop.filter(x => x.r.kind !== 'extracted' || x.r.reason.indexOf(x.metaProblem) < 0);
  claim('C2_EMPTY_SKIPPED', pop.length, bad.length, pop.map(x => x.b + ' meta ' + x.metaProblem + ' -> ' + x.r.kind).join(' | ') ||
    'no building on disk has an unusable meta file today — the synthetic case is C6');
}
// C3
{
  const pop = fleet.filter(x => x.r.kind === 'meta' && !CACHE.sqliteProblem(path.join(BLD_DIR, x.b + '_extracted.db')));
  let bad = 0; const det = [];
  pop.forEach(x => {
    const f = CACHE.resolveDbFile(x.b, 'extracted', BLD_DIR);
    const dm = CACHE.dirFor(x.b, 'meta'), de = CACHE.dirFor(x.b, 'extracted');
    const ok = f.kind === 'extracted' && dm && de && dm !== de && /_meta$/.test(dm) && /_extracted$/.test(de);
    if (!ok) bad++;
    det.push(x.b + ':' + f.kind + (ok ? '' : ' ⛔'));
  });
  claim('C3_FORCED', pop.length, bad, det.join(' ') + ' — forced kind reaches the whole-db run under its own dir');
}
// C4
{
  const pop = fleet.filter(x => x.r.path);
  const bad = pop.filter(x => { const d = CACHE.dirFor(x.b, 'auto'); return !d || !d.endsWith('_' + x.r.kind); });
  claim('C4_DIR_NAMES_KIND', pop.length, bad.length, pop.map(x => path.basename(CACHE.dirFor(x.b, 'auto') || 'null')).join(' '));
}
// C5 — one owner (source gate, brace-free: presence/absence of a declaration is the fact)
{
  const probe = fs.readFileSync(path.join(ROOT, 'scripts', 'probe_tm_reveal_shipped.js'), 'utf8');
  const cache = fs.readFileSync(path.join(ROOT, 'scripts', 'cache_4d_run.js'), 'utf8');
  const probeOwn = (probe.match(/function resolveDbFile\(/g) || []).length;
  const probeCalls = (probe.match(/CACHE\.resolveDbFile\(/g) || []).length;
  const cacheOwn = (cache.match(/function resolveDbFile\(/g) || []).length;
  const bad = (probeOwn === 0 && probeCalls >= 1 && cacheOwn === 1) ? 0 : 1;
  claim('C5_ONE_OWNER', 1, bad, 'probe: ownDecl=' + probeOwn + ' callsOwner=' + probeCalls + ' · cache_4d_run ownDecl=' + cacheOwn);
}

// C6 — RED CONTROL on a synthetic fixture dir
{
  const good = path.join(ROOT, 'buildings', 'warehouse_gardenworld.db');   // a real, tiny SQLite file in the repo
  if (CACHE.sqliteProblem(good)) claim('C6_RED', 0, 0, 'no good SQLite seed at ' + good);
  else {
    const dir = fs.mkdtempSync(path.join(process.env.SCRATCH || os.tmpdir(), 'w-cdk-'));
    const put = (n, src) => { const f = path.join(dir, n); if (src === '') fs.writeFileSync(f, ''); else if (src === 'lfs') fs.writeFileSync(f, 'version https://git-lfs.github.com/spec/v1\noid sha256:0\nsize 1\n'); else fs.copyFileSync(src, f); };
    put('Z_meta.db', ''); put('Z_geo.db', ''); put('Z_extracted.db', good);                 // the Duplex trap
    put('Y_meta.db', 'lfs'); put('Y_geo.db', good); put('Y_extracted.db', good);            // an LFS pointer where a db should be
    put('X_meta.db', good); put('X_extracted.db', good);                                    // meta without its geo half
    put('W_meta.db', good); put('W_geo.db', good); put('W_extracted.db', good);             // a real split pair
    put('V_meta.db', ''); put('V_extracted.db', '');                                        // nothing usable at all
    const cases = [
      { b: 'Z', want: 'extracted', why: '0 bytes' },
      { b: 'Y', want: 'extracted', why: 'not a SQLite file' },
      { b: 'X', want: 'extracted', why: 'SPLIT_PAIR_REQUIRED' },
      { b: 'W', want: 'meta', why: 'split pair present' },
      { b: 'V', want: null, why: 'no usable db' },
    ];
    let bad = 0, oldTrap = 0; const det = [];
    cases.forEach(c => {
      const r = CACHE.resolveDbFile(c.b, 'auto', dir);
      const oldRule = fs.existsSync(path.join(dir, c.b + '_meta.db')) ? 'meta' : 'extracted';   // the pre-fix probe rule
      const ok = r.kind === c.want && r.reason.indexOf(c.why) >= 0;
      if (!ok) bad++;
      if (oldRule === 'meta' && c.want !== 'meta') oldTrap++;
      det.push(c.b + ':' + r.kind + (ok ? '' : '⛔(' + r.reason + ')') + ' old=' + oldRule);
    });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    // The control is only a control if the OLD rule actually fails on it.
    claim('C6_RED', oldTrap > 0 ? cases.length : 0, bad,
      det.join(' | ') + ' — old existsSync(meta) rule walks into ' + oldTrap + ' traps; shipped resolver into ' + (bad ? bad : 0));
  }
}

// C7 — END TO END: real build (Duplex, ~2 s) into a throwaway cache root; the probe on Duplex must live.
{
  const tmpCache = fs.mkdtempSync(path.join(process.env.SCRATCH || os.tmpdir(), 'w-cdk-cache-'));
  const env = Object.assign({}, process.env, { CACHE_4D_DIR: tmpCache, BLD_DIR: BLD_DIR });
  delete env.DB_KIND;
  const runs = [];
  function sh(label, cmd, extraEnv) {
    const r = cp.spawnSync(process.execPath, cmd, { cwd: ROOT, env: Object.assign({}, env, extraEnv || {}), encoding: 'utf8', maxBuffer: 64 * 1048576 });
    const out = (r.stdout || '') + (r.stderr || '');
    runs.push({ label, status: r.status, out });
    return { status: r.status, out };
  }
  let judged = 0, bad = 0; const det = [];
  const dup = path.join(BLD_DIR, 'Duplex_extracted.db');
  if (CACHE.sqliteProblem(dup)) det.push('Duplex fixture missing — C7 unjudged');
  else {
    judged++;
    const b1 = sh('build', [path.join(ROOT, 'scripts', 'cache_4d_run.js'), 'Duplex']);
    const dbLine = (b1.out.match(/§CACHE_DB Duplex[^\n]*/) || [''])[0];
    const builtLine = (b1.out.match(/§CACHE_BUILT Duplex[^\n]*/) || [''])[0];
    const rjPath = (builtLine.match(/-> (\S+)$/) || [])[1];
    let rj = null; try { rj = JSON.parse(fs.readFileSync(path.join(rjPath, 'run.json'), 'utf8')); } catch (e) {}
    const okBuild = b1.status === 0 && /kind=extracted/.test(dbLine) && /0 bytes/.test(dbLine) &&
      /dbFile=Duplex_extracted\.db kind=extracted/.test(builtLine) && rj && rj.dbKind === 'extracted' && rj.dbFile === 'Duplex_extracted.db' &&
      rjPath && /_extracted$/.test(rjPath);
    if (!okBuild) bad++;
    det.push('build:' + (okBuild ? 'ok' : '⛔') + ' ' + dbLine.slice(0, 110));

    judged++;
    const b2 = sh('forced-meta', [path.join(ROOT, 'scripts', 'cache_4d_run.js'), 'Duplex'], { DB_KIND: 'meta' });
    const skip = (b2.out.match(/§CACHE_SKIP Duplex[^\n]*/) || [''])[0];
    const okSkip = /DB_KIND=meta but Duplex_meta\.db 0 bytes/.test(skip);
    if (!okSkip) bad++;
    det.push('DB_KIND=meta:' + (okSkip ? 'refused-with-reason' : '⛔ ' + skip.slice(0, 80)));

    judged++;
    const p = sh('probe', [path.join(ROOT, 'scripts', 'probe_tm_reveal_shipped.js'), 'Duplex']);
    const resolveLine = (p.out.match(/§TM_REVEAL_SHIPPED_RESOLVE Duplex[^\n]*/) || [''])[0];
    const dbL = (p.out.match(/§TM_REVEAL_SHIPPED_DB Duplex[^\n]*/) || [''])[0];
    const okProbe = p.status === 0 && /kind=extracted/.test(resolveLine) && /0 bytes/.test(resolveLine) && /file=Duplex_extracted\.db kind=extracted/.test(dbL);
    if (!okProbe) bad++;
    det.push('probe:' + (okProbe ? 'exit0 ' + resolveLine.slice(0, 90) : '⛔ exit=' + p.status + ' ' + (p.out.match(/§TM_REVEAL_SHIPPED_ERROR[^\n]*/) || [''])[0].slice(0, 120)));
  }
  try { fs.rmSync(tmpCache, { recursive: true, force: true }); } catch (e) {}
  claim('C7_END_TO_END', judged, bad, det.join(' | '));
}

console.log('§WITNESS_CACHE_DB_KIND pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive + ' codeKey=' + CACHE.codeKey());
process.exit(fail ? 1 : 0);
