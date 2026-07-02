#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TERMINAL-WALKALL-PERF scope (read the log after every run)
 * SCOPE: REAL Terminal-scale exercise of the "Walk ALL Disciplines" perf guard (§4 of the walk-all spec) —
 * the ONE thing witness_e2e_walk_all_disciplines.js §B honestly did NOT do (it lowered the threshold on
 * Duplex-scale data). Opens the REAL Terminal resident, clicks the REAL Outliner row [data-bnode="dw-all"]
 * with DW_ALL_PROXY_THRESHOLD left at its production default (50000), and asserts by MATHS (not eyes).
 *
 * ISSUE THIS PROVES/DISPROVES: "the >50k perf-guard branch was never exercised at real Terminal scale —
 * does the guard fire correctly there, and does the animation stay smooth?"
 * BASELINE RUN (pre-fix, main cb7bc17, log logs/terminal_walkall_perf.log): sceneElements=35552 <
 * threshold=50000 → proxyMode=false (guard never fires on our LARGEST real building), and the un-guarded
 * per-instance flash took 39,319ms for ACMV n=2829 against its own 1200ms budget; _commitDiscChains then
 * committed up to DW_CHAIN_COMMIT_CAP sweeps ONE AT A TIME at ~1.6-2s each (full verifyChain + 51k-row
 * Outliner repaint per sweep). That IS the misbehaviour. This witness re-runs the identical real-user path
 * against the §WALKALL-TERMINAL-SCALE fix and asserts:
 *   T1 SCENE-SCALE     — the opened Terminal scene really is Terminal-scale (>30k group children, sampled
 *                        AFTER the fold settles — the baseline run sampled at 5000 mid-fold, a witness bug).
 *   T2 GUARD-DECISION  — proxyMode matches sceneTotal-vs-threshold arithmetic (right decision, real number).
 *   T3 COMPLETES       — __dwAllDone within budget; walked+refused covers the whole roster (no hang).
 *   T4 FLASH-BUDGET    — EVERY §DISCWALK-ALL-FLASH per-instance line reports ms ≤ budgetMs + 4000 (slack =
 *                        a few software-GL frames; the pre-fix baseline was 33x OVER budget, unmistakable).
 *   T5 CHAIN-BATCH     — every §ROUTER-CHAIN-COMMIT line carries "(1 signed group)" (no per-sweep loop).
 *   T6 NO-ERROR        — zero pageerror.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = process.env.WALKALL_ROOT || path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'e2e_shots'); try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1200000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  console.log('═══ W-TERMINAL-WALKALL-PERF — REAL Terminal, default threshold=50000, ROOT=' + ROOT + ' ═══');
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/^§/.test(t)) { slog.push(t); console.log('  ' + t); } });

  const t0 = Date.now();
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalkAll === "function"', { timeout: 60000 });
  await pg.click('#b-open'); await sleep(300);
  await pg.click('#m-open-panel .mo-row[data-key="Terminal"]');
  // Wait for the SETTLED Terminal-scale scene (the ARC seed fold lands 35k+ children), not just __dwBuf.
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 600000 });
  await pg.waitForFunction(() => window.Bonsai.group && window.Bonsai.group() && window.Bonsai.group().children.length > 30000, { timeout: 600000, polling: 1000 });
  await sleep(4000);
  console.log('  §T-OPEN Terminal open+seeded in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

  const pre = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    return { sceneTotal: g.children.length, threshold: window.DW_ALL_PROXY_THRESHOLD, rowExists: !!document.querySelector('[data-bnode="dw-all"]') };
  });
  console.log('  §T-PRE ' + JSON.stringify(pre));

  // The real user action: click the Outliner "Walk ALL Disciplines" row. Default threshold untouched.
  const tWalk = Date.now();
  await pg.click('[data-bnode="dw-all"]');
  const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 1140000, polling: 500 }).then(() => true).catch(() => false);
  const walkMs = Date.now() - tWalk;
  const result = await pg.evaluate(() => window.__dwAllResult || null);
  console.log('  §T-WALK done=' + done + ' wallMs=' + walkMs);
  console.log('  §T-RESULT ' + JSON.stringify(result));
  await pg.screenshot({ path: path.join(OUT, 'terminal-walkall-done.png') }).catch(() => {});

  const expectedProxy = pre.sceneTotal > pre.threshold;
  const rosterCovered = result && Array.isArray(result.disciplines) &&
    (result.walked.map(w => w.disc).concat(result.refused.map(r => r.disc)).sort().join(',') === result.disciplines.slice().sort().join(','));

  // T4: parse EVERY per-instance flash line — ms must be within budget (+slack for software-GL frames)
  const flashLines = slog.filter(l => /§DISCWALK-ALL-FLASH .* per-instance /.test(l));
  const flashParsed = flashLines.map(l => { const m = l.match(/per-instance instances=(\d+) ms=(\d+) budgetMs=(\d+)/); return m ? { n: +m[1], ms: +m[2], budget: +m[3] } : null; }).filter(Boolean);
  const flashOk = flashParsed.length === flashLines.length && flashParsed.every(f => f.ms <= f.budget + 4000);
  // T5: every chain-commit line is a single signed group
  const chainLines = slog.filter(l => /§ROUTER-CHAIN-COMMIT disc=/.test(l));
  const chainOk = chainLines.every(l => / \(1 signed group\)/.test(l));

  chk('T1 SCENE-SCALE (>30k group children — real Terminal, not a fixture)', pre.sceneTotal > 30000, 'sceneTotal=' + pre.sceneTotal + ' threshold=' + pre.threshold);
  chk('T2 GUARD-DECISION (proxyMode == sceneTotal>threshold arithmetic)', result && result.proxyMode === expectedProxy, 'proxyMode=' + (result && result.proxyMode) + ' expected=' + expectedProxy);
  chk('T3 COMPLETES (dwAllDone, roster covered, no hang)', done && rosterCovered, 'done=' + done + ' wallMs=' + walkMs + ' walked=' + JSON.stringify(result && result.walked) + ' refused=' + JSON.stringify(result && result.refused));
  chk('T4 FLASH-BUDGET (every per-instance flash ≤ budget+4s; baseline was 39.3s over a 1.2s budget)', flashParsed.length > 0 && flashOk, flashParsed.map(f => f.n + '→' + f.ms + 'ms/≤' + f.budget).join(' '));
  chk('T5 CHAIN-BATCH (every §ROUTER-CHAIN-COMMIT is 1 signed group)', chainOk, chainLines.length + ' chain line(s): ' + chainLines.map(l => l.slice(0, 90)).join(' ‖ '));
  chk('T6 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close(); server.close();
  console.log('W-TERMINAL-WALKALL-PERF: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
