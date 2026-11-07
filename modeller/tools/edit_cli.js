#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_cli.js — a call a proposer or a macro can make (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §11). Drives the REAL Modeller page
// headless through the real commit path and prints §EDIT_REPORT's JSON. Deliberately not a Node copy of the fold: one engine, the page's. Stops nothing,
// adds no rule, saves nothing: every run starts from a fresh Open. No AI inside.
//   node modeller/tools/edit_cli.js --building HospitalGarage --grid gy8 --move 1.5 [--grid gy9 --move -0.5]
// stdout: JSON only, {ok, building, edits:[report | {refused,grid,move,reason}], ms}. Logs: stderr. Exit: 0 every edit reported · 3 an edit refused · 2 usage · 1 failed.
'use strict';
const path = require('path');
const args = process.argv.slice(2), edits = []; let building = null, bad = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--building') building = args[++i];
  else if (args[i] === '--grid') edits.push({ grid: args[++i] });
  else if (args[i] === '--move') { const v = Number(args[++i]); if (!edits.length || edits[edits.length - 1].move != null || !isFinite(v)) bad = '--move needs a number after a --grid'; else edits[edits.length - 1].move = v; }
  else bad = 'unknown argument ' + args[i];
}
if (!bad && !building) bad = '--building is required';
if (!bad && !edits.length) bad = 'at least one --grid and --move is required';
if (!bad && edits.some(e => e.move == null)) bad = 'every --grid needs a --move';
if (bad) { process.stderr.write('edit_cli: ' + bad + '\n'); process.exit(2); }

const out = process.stdout.write.bind(process.stdout);
console.log = (...a) => process.stderr.write(a.join(' ') + '\n');   // the harness logs freely; stdout stays JSON
const { runE2E } = require(path.join(__dirname, '..', 'tests', 'e2e_harness.js'));
const t0 = Date.now();

(async () => {
  const results = []; let opened = false;
  const r = await runE2E('EDIT-CLI', async (t) => {
    await t.open(building, {});
    // Settled = the seed has armed the Save baseline with real boxes. Editing sooner moves nothing and reports "not judged", so the answer would depend on machine load.
    let settled = false;
    for (let i = 0; i < 240 && !settled; i++) { settled = await t.pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0); if (!settled) await t.sleep(500); }
    if (!settled) throw new Error('the building did not finish opening within 120 s');
    opened = true;
    const framed = await t.pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(); return !!(i && i.system === 'column-framed'); });
    if (framed) {   // same readiness and arming a person's Move Grid gives: the walker's lattice becomes the grid
      for (let i = 0; i < 60 && !t.slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await t.sleep(500);
      await t.sleep(5000);
      await t.clickSel('#b-gridmove'); await t.sleep(600);
    } else await t.sleep(1500);
    for (const e of edits) {
      const res = await t.pg.evaluate(async (grid, move) => {
        const known = window.Bonsai.gridmove.gridLines().map(l => l.id);
        if (known.indexOf(grid) < 0) return { refused: true, reason: 'no grid line ' + grid + ' in this building (' + known.length + ' lines)' };
        const before = window.__lastEditReport || null;
        await window.__gridStretch(grid, move);
        const stat = (document.getElementById('stat') || {}).textContent || '';
        if (window.__lastEditReport && window.__lastEditReport !== before) return { report: window.__lastEditReport };
        return { refused: true, reason: stat.replace(/^FAIL\s*/, '') || 'the edit produced no report' };
      }, e.grid, e.move);
      results.push(res.report ? res.report : { refused: true, grid: e.grid, move: e.move, reason: res.reason });
    }
    t.assert('edit_cli judged every edit', results.length === edits.length);
  }, { noExit: true });
  const refused = results.some(x => x.refused), failed = !opened || results.length !== edits.length || (r && r.fail);
  out(JSON.stringify({ ok: !failed && !refused, building, edits: results, ms: Date.now() - t0 }) + '\n', () => process.exit(failed ? 1 : refused ? 3 : 0));
})().catch(e => { process.stderr.write('edit_cli: ' + (e && e.stack || e) + '\n'); process.exit(1); });
