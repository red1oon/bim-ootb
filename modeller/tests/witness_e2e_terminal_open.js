#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-TERMINAL-OPEN scope (read before editing)
 * SCOPE: a USER-EMULATING, MATHS-ASSERTED E2E of opening the TERMINAL resident (48,428 elements,
 * 35,552 ARC-seedable) through the REAL production Open flow (#b-open → resident picker → the exact
 * _openBuffer/_forkEditable/_seedArcEditable/commitSeedGroup path every other resident uses). This is the
 * ONLY witness in the suite that exercises Terminal scale — every other witness_e2e_* only ever opens
 * 'Duplex' (265 rows) or similar small residents, which is why the §LOD400-STALL bug shipped invisibly.
 *
 * ROOT CAUSE (see prompts/RESUME_MODELLER_TERMINAL_LOAD_LOD400.md handoff + this session's stop-and-report):
 * NOT the originally-suspected synchronous render loop in bonsai_kernel.js foldChainToScene (that call was
 * already fast, ~300ms, even for 35,552 inserts). The REAL chain of THREE stacked bottlenecks, found by
 * actually reproducing and measuring on fresh origin/main before touching anything:
 *   1. arc_editable.js buildSeedOps() hardcoded `ORDER BY m.id` — Terminal_meta.db's elements_meta has NO
 *      `id` column (only `guid` PK, a different extraction path than *_extracted.db). The query THREW,
 *      caught by a console.warn-only catch → the ARC seed committed ZERO ops, forever. Terminal did not
 *      "load slowly" on origin/main — it never loaded ANY geometry, silently. FIXED: schema-adaptive
 *      ORDER BY (id when present, else guid) + the failure is now console.error (loud, not swallowed).
 *   2. Once seeding could proceed, kernel_ops.js commitGroup's per-op hash-chain loop (`await
 *      crypto.subtle.digest` + `await signer.sign`, unavoidably SEQUENTIAL — op[i]'s hash depends on
 *      op[i-1]'s) ran ~180s with ZERO yield/progress for 35,552 ops, TRIPLED by sealFrom blindly
 *      re-hashing rows it had just staged, and commitSeedGroup's follow-up verifyChain re-hashing AGAIN.
 *      FIXED: sealFrom trusts an already-correctly-chained hash (skips the redundant recompute — same
 *      output, ~1/3 less crypto), the ARC-seed path opts OUT of the redundant post-commit verifyChain
 *      (commitGroup's own {committed,sealed,tip} already proves the fresh group; a seed-path-specific
 *      flag, not a global behaviour change), and both loops now yield + report progress every 1500 ops.
 *   3. Once THAT was fixed, bonsai_oplog.js's autosave `_b64()` (byte-by-byte `s += String.fromCharCode`
 *      over a multi-MB db export) turned out to be the single biggest remaining stall — ~108s measured,
 *      dwarfing bottleneck #2. FIXED: chunked String.fromCharCode.apply (byte-for-byte identical output,
 *      node-verified), ~5x+ faster, and a failed autosave (e.g. localStorage quota) is now console.error,
 *      not silently swallowed.
 * Fix shape follows this codebase's existing conventions: gate by size (small buildings — Duplex 265,
 * SampleCastle 3,583 ARC elements — take the ORIGINAL unchunked path, byte-identical result either way),
 * yield via rAF/setTimeout(0) between chunks, report progress via the existing window.setStat status-line
 * (not a new UI surface), NEVER add an abort/timeout that cancels a slow-but-working load.
 *
 * CLAIMS:
 *   T1 SEEDS (regression guard) — the ARC seed actually commits >0 ops (today, unfixed, it seeds 0 — this
 *      alone is the biggest regression guard: Terminal silently never loaded any geometry before this fix).
 *   T2 COUNT-EXACT — seeded op count == elements_meta WHERE discipline='ARC' row count (non-invent: every
 *      seedable element lands, none invented, none silently dropped beyond the query's own honest skips).
 *   T3 PROGRESSIVE-VISIBLE — the status line's text changes AT LEAST 3 times during the open (sampled at
 *      intervals), proving real progressive feedback, not a single start/end flip.
 *   T4 MESH-GROWS — the scene's mesh count is sampled at least twice during the open and INCREASES between
 *      samples (progressive paint — geometry appears before the whole set is done, not all-at-once at the end).
 *   T5 CHAIN-OK — an INDEPENDENT verifyChain() call (the witness's own, not relying on the app's skipped
 *      verify) proves the resulting signed chain is genuinely valid — the seed-path speed opt-out does not
 *      weaken the actual correctness guarantee, only who pays for re-checking it and when.
 *   T6 NO-ERROR — no pageerror across the whole sequence (harness auto-assert).
 *   T7 WALL-CLOCK — logs the ACTUAL measured open time with generous headroom (not an invented tight bound).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 860 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  console.log('═══ W-E2E-TERMINAL-OPEN — real user: open Terminal (48,428 elements, 35,552 ARC) via the production Open flow ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  const t0 = Date.now();
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Terminal"]');

  // Sample progress (stat text) + mesh count at intervals during the open — CHEAP reads only (no forced
  // render/readPixels every poll: an earlier probe run proved that itself becomes a confound at this scale).
  const statSamples = [], meshSamples = [];
  const deadline = Date.now() + 90000;
  let stableCount = 0, lastN = -1;
  while (Date.now() < deadline) {
    const s = await pg.evaluate(() => {
      const g = window.Bonsai && window.Bonsai.group ? window.Bonsai.group() : null;
      const n = g ? g.children.length : -1;
      const statTxt = (document.getElementById('stat') || {}).textContent || '';
      return { n, dwBuf: !!window.__dwBuf, statTxt };
    }).catch(() => null);
    if (!s) break;
    statSamples.push(s.statTxt); meshSamples.push(s.n);
    if (s.n === lastN) stableCount++; else stableCount = 0;
    lastN = s.n;
    if (s.dwBuf && stableCount >= 3 && s.n > 0) break;   // stable for 3 consecutive polls → the open settled
    await sleep(300);
  }
  const openMs = Date.now() - t0;
  await sleep(300);   // let a trailing §ARC-SEED-WIRE log line land

  const after = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const inserts = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT');
    return { meshCount: g ? g.children.length : -1, oplogLen: window.Bonsai.oplog.length, insertCount: inserts.length };
  });
  const expectedArc = await pg.evaluate(async () => {
    try {
      const buf = window.__dwBuf; if (!buf) return -1;
      const db = new window.SQL.Database(new Uint8Array(buf));
      const r = db.exec("SELECT COUNT(*) FROM elements_meta WHERE discipline='ARC'");
      const n = r.length ? r[0].values[0][0] : -1;
      db.close();
      return n;
    } catch (e) { return -1; }
  });

  // T5 — an INDEPENDENT verifyChain() (the app itself opted OUT of this for speed on the seed path per
  // §LOD400-STALL fix #2 — the witness pays for it once, here, to prove the opt-out didn't weaken correctness).
  const t5start = Date.now();
  const chain = await pg.evaluate(async () => {
    try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return { ok: !!v.ok, len: v.len }; }
    catch (e) { return { ok: false, err: String(e) }; }
  });
  const verifyMs = Date.now() - t5start;

  await br.close(); server.close();

  const distinctStats = new Set(statSamples.filter(Boolean));
  console.log('  §OPEN openMs=' + openMs + ' samples=' + statSamples.length + ' distinctStatLines=' + distinctStats.size);
  console.log('  §STAT-TRACE ' + JSON.stringify(statSamples));
  console.log('  §MESH-TRACE ' + JSON.stringify(meshSamples));
  console.log('  §AFTER ' + JSON.stringify(after) + ' expectedArc=' + expectedArc);
  console.log('  §VERIFY ' + JSON.stringify(chain) + ' verifyMs=' + verifyMs);

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  chk('T1 SEEDS (>0 ops committed — regression guard, was 0 before this fix)', after.insertCount > 0, 'insertCount=' + after.insertCount);
  chk('T2 COUNT-EXACT (seeded == elements_meta ARC count, non-invent)', expectedArc > 0 && after.insertCount === expectedArc, 'seeded=' + after.insertCount + ' expected=' + expectedArc);
  chk('T3 PROGRESSIVE-VISIBLE (status line changes ≥3x during the open)', distinctStats.size >= 3, 'distinct=' + distinctStats.size + ' e.g. ' + [...distinctStats].slice(0, 4).join(' | '));
  const meshGrew = meshSamples.some((n, i) => i > 0 && n > meshSamples[i - 1] && meshSamples[i - 1] >= 0);
  chk('T4 MESH-GROWS (scene mesh count increases between samples — progressive paint, not all-at-once)', meshGrew, 'trace=' + JSON.stringify(meshSamples));
  chk('T5 CHAIN-OK (independent verifyChain proves the seed-path speed opt-out did not weaken correctness)', chain.ok === true && chain.len === after.oplogLen, 'verify=' + JSON.stringify(chain) + ' oplogLen=' + after.oplogLen);
  chk('T6 NO-ERROR (no pageerror across the whole open)', errs.length === 0, errs.slice(0, 2).join(' | '));
  chk('T7 WALL-CLOCK (measured, headroom over the observed number — not an invented tight bound)', openMs < 60000, 'openMs=' + openMs);

  console.log('W-E2E-TERMINAL-OPEN: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
