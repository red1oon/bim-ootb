#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-Q4-GROUP-LINKAGE scope (read the log after every run)
 * SCOPE: prompts/SCALE_AND_UX_SWEEP.md §4.2 / PARAMETRIC_DEPTH_RECON_FINDINGS.md Q4 — placeAssembly()
 * (modeller.html ~2692) used to commit each dropped leaf as an INDEPENDENT, unlinked GEOM_INSERT via N
 * individual awaited oplog.commit() calls (a "dining set" of table+N chairs => N separate signed op-rows with
 * nothing tying them together, AND N full seal+verify+fold passes — the same per-commit cost class
 * _commitDiscWalk's own header measured at 267 placements = 112s UI freeze). Fixed to batch every leaf into
 * ONE signed group via commitSeedGroup (the same primitive _commitDiscWalk already proved, modeller.html:3403).
 *
 * This repo's own real "drop a SET through the full library+UI pipeline" witnesses (bom_dropcenter_live.js,
 * bom_assembly_live.js) currently fail on a PRE-EXISTING, unrelated cause: window.Bonsai.library.assemblies()
 * returns ZERO assemblies in this checkout (confirmed identical failure on the pre-fix commit via `git stash` —
 * a library-data drift issue, NOT introduced by this fix, out of THIS session's scope). So this drives the
 * SAME kind of in-page `?xxx=demo` self-test hook this file already uses (?dropcenter=demo, ?asmpreview=demo)
 * — `?q4group=demo` stubs library.dropLeaves()/assembly() with a synthetic 3-leaf "set" (placeAssembly is
 * module-scoped, not window-scoped — the `<script type="module">` wrapper means only in-page hooks, not
 * pg.evaluate() from Node, can call it directly) and drives the REAL placeAssembly() through it.
 *
 * CLAIM Q4-1: placeAssembly(x,y) with a 3-leaf stub commits exactly 3 GEOM_INSERT rows sharing ONE non-null gid.
 * CLAIM Q4-2: §MODELLER assembly-drop-group log line reports "(1 signed group)".
 * CLAIM Q4-3: the signed chain still verifies (KernelOps.verifyChain ok=true) — batching didn't break signing.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  console.log('═══ W-Q4-GROUP-LINKAGE — placeAssembly() drops N leaves as ONE signed group, not N unlinked rows ═══');

  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/^§/.test(t)) { slog.push(t); console.log('  ' + t); } });

  await pg.goto(`http://localhost:${port}/modeller/modeller.html?q4group=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__q4GroupDone === true', { timeout: 30000 });
  const r = await pg.evaluate(() => window.__q4GroupResult || { error: 'no result' });

  console.log('  §Q4_RESULT ' + JSON.stringify(r));
  const groupLine = slog.filter(l => /^§MODELLER assembly-drop-group/.test(l)).pop() || '';

  chk('Q4-0 hook ran without error', !r.error, JSON.stringify(r));
  chk('Q4-1 ONE shared gid across all 3 leaves (not 3 independent rows)', r.rowCount === 3 && r.gids && r.gids.length === 1 && r.gids[0] != null, JSON.stringify(r));
  chk('Q4-2 log reports "(1 signed group)"', /\(1 signed group\)/.test(groupLine), groupLine);
  chk('Q4-3 chain still verifies after group commit', r.verifyOk === true, 'verifyOk=' + r.verifyOk);
  chk('NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close(); server.close();
  console.log('W-Q4-GROUP-LINKAGE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
