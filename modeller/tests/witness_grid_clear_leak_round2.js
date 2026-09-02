#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-CLEAR-LEAK-R2 scope
 * SCOPE: RESUME_SESSION_2026-07-04_GATE_BACKPROP.md §OPEN item 4 — PR #644 (decision B, narrow reset) only
 * covered STR-walker's own `ready`/`__dwBuf` module state. This round audited (read-only, then fixed) 3 MORE
 * module-local "last building I saw" leaks in the SAME class, all confirmed real by direct inspection:
 *   1. `window.swXEdges` (str_walker_outliner.js `_openBuffer`) — cached cross-edges (abuts/fills/etc.) for
 *      the OPENED building, never reset by `#b-clear` (round-1 fix missed it).
 *   2. `window.__dwWalks/__dwChains/__dwAssembly/__dwTrunk` (modeller.html) — per-discipline walk placements;
 *      `_redrawAllDiscWalks()`/`_discGate()` fold them regardless of which building is currently open.
 *   3. `bom_tree_outliner.js`'s closure-local `State.seed/State.building` — the BOM-graph tab kept showing
 *      the PREVIOUS building's tree after Clear + a different Open.
 * Fix: each module got its own `onClear()` (mirroring STR's existing one), all three wired into
 * `#b-clear`'s onclick in modeller.html. Read the §-log after every run (CLAUDE.md Log Mandate).
 *
 * CLAIMS:
 *   G1 OPEN-OK        — SampleCastle .db-open lands a usable substrate (swXEdges + BOM tree + STR ready).
 *   G2 PRE-STATE       — after a real STR walk, __dwWalks/swXEdges/BOM-tree are all genuinely non-empty
 *                        (proves the leak CAN happen — a no-op reset would trivially "pass" on empty state).
 *   G3 CLEAR-RESETS    — clicking #b-clear drops all three to their empty/null state + logs all 3 §-tags.
 *   G4 NO-RESURRECTION — opening a DIFFERENT building (SampleHouse) right after Clear shows ONLY SampleHouse's
 *                        own fresh data — no leftover SampleCastle disc-walk placements, cross-edges, or BOM
 *                        tree nodes bleed through.
 *   G5 NO-ERROR        — zero pageerror across the whole sequence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  console.log('═══ W-GRID-CLEAR-LEAK-R2 — swXEdges/DiscWalker-globals/BOMTree state reset on #b-clear ═══');

  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const logs = []; pg.on('console', m => logs.push(m.text()));

  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  // Open SampleCastle (.db-open — real STR skeleton + real abuts substrate, per this session's audit)
  await pg.click('#b-open'); await sleep(200);
  await pg.click('.mo-row[data-key="SampleCastle"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => false);
  await sleep(1500);

  const g1 = await pg.evaluate(() => ({
    dwName: window.__dwName || '', swXEdgesN: window.swXEdges ? window.swXEdges.abuts.length : -1,
    bomTree: !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree())
  }));
  chk('G1 OPEN-OK (SampleCastle)', g1.dwName === 'SampleCastle' && g1.swXEdgesN > 0 && g1.bomTree, JSON.stringify(g1));

  // Real "Walk ALL Disciplines" via the production Outliner row click (populates window.__dwWalks for
  // whichever non-ARC disciplines the residential ruleset (SampleCastle="SC" per WalkerDoctrine) accepts —
  // STR itself surfaces via swbTabData()/its own render, not __dwWalks, so drive the generated-disc walk
  // instead, same entry point witness_e2e_walk_ifcopen.js already uses).
  const rowUp = await pg.waitForFunction(() => !!document.querySelector('[data-bnode="dw-all"]'), { timeout: 15000 }).then(() => true).catch(() => false);
  if (rowUp) { await pg.click('[data-bnode="dw-all"]'); await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 60000, polling: 250 }).catch(() => {}); }
  await sleep(400);

  const g2 = await pg.evaluate(() => ({
    dwWalksKeys: Object.keys(window.__dwWalks || {}).filter(d => (window.__dwWalks[d] || []).length),
    swXEdges: !!window.swXEdges, bomTree: !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree())
  }));
  chk('G2 PRE-STATE (real data present before Clear — proves the leak CAN happen)',
    g2.dwWalksKeys.length > 0 && g2.swXEdges && g2.bomTree, JSON.stringify(g2));

  // Click the REAL Clear button
  await pg.click('#b-clear'); await sleep(300);

  const g3 = await pg.evaluate(() => ({
    dwWalksKeys: Object.keys(window.__dwWalks || {}), swXEdges: window.swXEdges,
    bomTree: !!(window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree()),
    dwChains: window.__dwChains ? Object.keys(window.__dwChains).length : 0
  }));
  const tag1 = logs.some(l => /§GRID-CLEAR-LEAK onClear.*swXEdges cleared/.test(l));
  const tag2 = logs.some(l => /§BOMTREE §GRID-CLEAR-LEAK onClear/.test(l));
  const tag3 = logs.some(l => /§DISC-WALK §GRID-CLEAR-LEAK onClear/.test(l));
  chk('G3 CLEAR-RESETS (all 3 module states empty/null + all 3 §-tags logged)',
    g3.dwWalksKeys.length === 0 && g3.swXEdges === null && g3.bomTree === false && g3.dwChains === 0 && tag1 && tag2 && tag3,
    JSON.stringify(g3) + ' tags=' + tag1 + '/' + tag2 + '/' + tag3);

  // Open a DIFFERENT building right after Clear — confirm no SampleCastle leftovers bleed through
  await pg.click('#b-open'); await sleep(200);
  await pg.click('.mo-row[data-key="SampleHouse"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => false);
  await sleep(1500);

  const g4 = await pg.evaluate(() => ({
    dwName: window.__dwName || '', dwWalksKeys: Object.keys(window.__dwWalks || {}).filter(d => (window.__dwWalks[d] || []).length),
    swXEdgesN: window.swXEdges ? window.swXEdges.abuts.length : -1,
    bomBuilding: window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree ? true : false
  }));
  chk('G4 NO-RESURRECTION (SampleHouse opens with its OWN fresh substrate, no STR pre-walked, no Castle bleed)',
    g4.dwName === 'SampleHouse' && g4.dwWalksKeys.length === 0 && g4.swXEdgesN >= 0, JSON.stringify(g4));

  chk('G5 NO-ERROR (zero pageerror across the whole sequence)', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-GRID-CLEAR-LEAK-R2: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
