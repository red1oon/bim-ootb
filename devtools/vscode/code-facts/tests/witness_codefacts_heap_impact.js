#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-HEAP-IMPACT (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.31 BUILD SPEC 4). Read the log after every run:
// exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a developer cannot see whether their change makes the viewer / ERP / Modeller page heavier in the browser"
//   (owner 2026-11-16). After: lib/heap_impact.js boots each page headless on the working tree and on a git ref, and its delta moves by the
//   memory a change adds, on the page that loads it, and nowhere else.
// POPULATION: the three real pages of this checkout (viewer/viewer.html, erp/idempiere.html, modeller/modeller.html), served by the real servers.
// CHECKS: H1 the base server answers a changed tracked file with its ref bytes and an ignored data file with the disk bytes · H2 the unchanged tree
//   vs HEAD says SAME on every page · H3 RED CONTROL: a 5 MB array planted (in memory only) in one ERP boot script makes ERP GREW by 4..6.5 MB while
//   the viewer and the Modeller stay SAME · H4 no browser → INCONCLUSIVE with a reason, nothing thrown · H5 the extension registers the command and
//   the Run & Ship row, and builds its status line from the § lines.
// A headless browser runs (software GL, no GPU): run it alone, under nice, never beside a bake. HEAP_W_RUNS (default 3) runs per page and tree.
// Command: node devtools/vscode/code-facts/tests/witness_codefacts_heap_impact.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const H = require('../lib/heap_impact');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUNS = +process.env.HEAP_W_RUNS || 3;
let fail = 0, judged = 0;
const check = (label, ok) => { judged++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fail++; };
const get = (port, rel) => new Promise(res => http.get('http://127.0.0.1:' + port + '/' + rel, r => { const b = []; r.on('data', d => b.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(b) })); }));
const row = (res, page) => res.pages.find(r => r.page === page) || {};

(async () => {
  // H1: base server. Pick a tracked file, pretend it changed by pointing the base at a ref where it differs: compare HEAD~1 if the file
  // differs there, else use the view directly on a known-changed path. Here: the base view at HEAD has changed = the files this checkout edited.
  const view = H.baseView(ROOT, 'HEAD');
  const changedRel = cp.spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean)[0];
  const ignoredData = ['modeller/Duplex_extracted.db', 'viewer/buildings/Duplex_extracted.db', 'buildings/Duplex_extracted.db'].find(f => fs.existsSync(path.join(ROOT, f)));
  const srv = await H.serve(ROOT, rel => view.lookup(rel)), port = srv.address().port;
  if (changedRel) {
    const want = cp.spawnSync('git', ['show', 'HEAD:' + changedRel], { cwd: ROOT }).stdout;
    const got = await get(port, changedRel);
    check('H1 a changed tracked file (' + changedRel + ') answers its HEAD bytes on the base side (' + got.body.length + ' = ' + want.length + ')', got.status === 200 && got.body.equals(want));
  } else console.log('  §HEAP_W H1a INCONCLUSIVE: no changed tracked file in this checkout to compare');
  if (ignoredData) {
    const got = await get(port, ignoredData), disk = fs.readFileSync(path.join(ROOT, ignoredData));
    check('H1 an untracked data file (' + ignoredData + ') answers the disk bytes on the base side too (' + got.body.length + ' B)', got.status === 200 && got.body.equals(disk));
  } else console.log('  §HEAP_W H1b INCONCLUSIVE: no Duplex sample db in this checkout');
  srv.close();

  // H2 + H3 in one run each. H2: the tree as it is vs HEAD; the edited files are devtools only, which no page loads, so every page must be SAME.
  const lines = [];
  const same = await H.measure({ root: ROOT, ref: 'HEAD', runs: RUNS, log: l => { lines.push(l); console.log('  ' + l); } });
  if (same.verdict === 'INCONCLUSIVE') { console.log('§HEAP_W verdict=INCONCLUSIVE reason="no browser or a page did not load (H2)"'); process.exitCode = 2; return; }
  for (const page of H.DEFAULT_PAGES) { const d = row(same, page).delta || {}; check('H2 unchanged code: ' + page + ' verdict=' + d.verdict + ' jsMB=' + (d.jsMB === undefined ? '?' : d.jsMB.toFixed(2)), d.verdict === 'SAME'); }

  // H3 red control: append a 5 MB packed-double array to an ERP boot script, in memory only (the overlay), never on disk.
  const html = fs.readFileSync(path.join(ROOT, 'erp/idempiere.html'), 'utf8');
  const m = html.match(/<script src="(ad_callout\.js)[^"]*"/);
  const target = 'erp/' + (m ? m[1] : 'ad_callout.js');
  const plant = fs.readFileSync(path.join(ROOT, target), 'utf8') + '\n;(window.__heapPlant = new Array(655360)).fill(1.5);\n';   // 655,360 doubles = 5 MB
  const grown = await H.measure({ root: ROOT, ref: 'HEAD', runs: RUNS, overlay: { [target]: plant }, log: l => console.log('  ' + l) });
  const e = row(grown, 'erp/idempiere.html').delta || {}, v = row(grown, 'viewer/viewer.html').delta || {}, mo = row(grown, 'modeller/modeller.html').delta || {};
  check('H3 red control: 5 MB planted in ' + target + ' → ERP verdict=' + e.verdict + ' jsMB=' + (e.jsMB === undefined ? '?' : e.jsMB.toFixed(2)) + ' (expected GREW by 4..6.5)',
    e.verdict === 'GREW' && e.jsMB >= 4 && e.jsMB <= 6.5);
  check('H3 the other two pages do not load that script: viewer ' + v.verdict + ', Modeller ' + mo.verdict + ' (both SAME)', v.verdict === 'SAME' && mo.verdict === 'SAME');
  check('H3 nothing was written to disk: ' + target + ' unchanged vs HEAD', cp.spawnSync('git', ['diff', '--quiet', 'HEAD', '--', target], { cwd: ROOT }).status === 0);

  // H4 no browser: env pointing nowhere and the fallbacks off.
  const prev = process.env.PLAYWRIGHT; process.env.PLAYWRIGHT = '/nonexistent/playwright';
  let none, threw = null;
  try { none = await H.measure({ root: ROOT, ref: 'HEAD', runs: 1, findOpts: { fallbacks: false } }); } catch (err) { threw = err.message; }
  if (prev === undefined) delete process.env.PLAYWRIGHT; else process.env.PLAYWRIGHT = prev;
  check('H4 no browser → ' + (threw ? 'threw ' + threw : none.verdict + ': ' + none.lines[0]), !threw && none.verdict === 'INCONCLUSIVE' && /reason=/.test(none.lines[0]));

  // H5 the extension, through the same vscode stub the activate witness uses.
  const { reg, restore } = require('./vscode_stub').install(ROOT);
  try {
    const os = require('os');
    const ext = require(path.resolve(__dirname, '..', 'extension.js'));
    const context = { subscriptions: [], extensionPath: path.resolve(__dirname, '..'), storageUri: { fsPath: fs.mkdtempSync(path.join(os.tmpdir(), 'code-facts-heap-')) } };
    const api = ext.activate(context);
    const steps = api.steps();
    check('H5 command codeFacts.heapImpact registered (' + reg.commands.length + ' commands)', reg.commands.includes('codeFacts.heapImpact'));
    check('H5 Run & Ship lists "3m · Memory of the three pages" → codeFacts.heapImpact', steps.some(r => /^3m · Memory of the three pages$/.test(r[0]) && r[2] === 'codeFacts.heapImpact'));
    check('H5 the status line is built from the § lines: "' + api.heapStatusText(lines) + '"', /^MB V \d+\.\d · E \d+\.\d · M \d+\.\d$/.test(api.heapStatusText(lines) || ''));
    if (restore) restore();
  } catch (err) { check('H5 the extension activates through the stub (' + err.message + ')', false); }

  const verdict = judged === 0 ? 'INCONCLUSIVE' : fail === 0 ? 'PASS' : 'FAIL';
  console.log('§HEAP_W checks=' + judged + ' failed=' + fail + ' runs=' + RUNS + ' verdict=' + verdict);
  if (verdict !== 'PASS') process.exitCode = verdict === 'FAIL' ? 1 : 2;
})().catch(e => { console.log('§HEAP_W verdict=FAIL threw=' + JSON.stringify(e.message)); process.exitCode = 1; });
