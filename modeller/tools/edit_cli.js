#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_cli.js — a call a proposer or a macro can make (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §11). Drives the REAL Modeller page
// headless through the real commit path and prints §EDIT_REPORT's JSON. Deliberately not a Node copy of the fold: one engine, the page's. Stops nothing,
// adds no rule, saves nothing: every run starts from a fresh Open. No AI inside.
//   node modeller/tools/edit_cli.js --building HospitalGarage --grid gy8 --move 1.5 [--grid gy9 --move -0.5]
//   node modeller/tools/edit_cli.js --building HospitalGarage --shift gy9 --move 1.51     that line and every later line on its axis move together (§13.1)
//   node modeller/tools/edit_cli.js --building HospitalGarage --lines     what a caller needs to propose: the grid lines, where they came from, the system, the material
//   --lattice-boxes  judge overlaps on boxes in the lattice frame, not world boxes (§13.6). No effect at theta 0. The app itself stays on world boxes.
//   --own-grid  on a wall-bearing building, use the lines derived from its walls, not the app's default grid (§13.2). Refused if the building has none.
// stdout: JSON only, {ok, building, edits:[report | {refused,grid,move,reason}], ms}. Logs: stderr. Exit: 0 every edit reported · 3 an edit refused · 2 usage · 1 failed.
'use strict';
const path = require('path');
const args = process.argv.slice(2), edits = []; let building = null, bad = null, wantLines = false, ownGrid = false, latticeBoxes = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--building') building = args[++i];
  else if (args[i] === '--lines') wantLines = true;
  else if (args[i] === '--own-grid') ownGrid = true;
  else if (args[i] === '--lattice-boxes') latticeBoxes = true;
  else if (args[i] === '--grid') edits.push({ grid: args[++i] });
  else if (args[i] === '--shift') edits.push({ grid: args[++i], shift: true });
  else if (args[i] === '--move') { const v = Number(args[++i]); if (!edits.length || edits[edits.length - 1].move != null || !isFinite(v)) bad = '--move needs a number after a --grid or --shift'; else edits[edits.length - 1].move = v; }
  else bad = 'unknown argument ' + args[i];
}
if (!bad && !building) bad = '--building is required';
if (!bad && !edits.length && !wantLines) bad = 'at least one --grid or --shift, with --move, is required';
if (!bad && edits.some(e => e.move == null)) bad = 'every --grid or --shift needs a --move';
if (bad) { process.stderr.write('edit_cli: ' + bad + '\n'); process.exit(2); }

const out = process.stdout.write.bind(process.stdout);
console.log = (...a) => process.stderr.write(a.join(' ') + '\n');   // the harness logs freely; stdout stays JSON
const { runE2E } = require(path.join(__dirname, '..', 'tests', 'e2e_harness.js'));
const t0 = Date.now();

(async () => {
  const results = []; let opened = false, info = null;
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
    if (latticeBoxes) await t.pg.evaluate(() => { window.__gateLatticeBoxes = true; });
    if (ownGrid) {
      const laid = await t.pg.evaluate(() => { const s = window.swbSemiGridSpec && window.swbSemiGridSpec(); if (!s) return window.Bonsai.grid._columnDerived ? 'column-derived' : null; window.Bonsai.grid.define({ xs: s.xs, ys: s.ys }); window.__ownGridSource = s.source; return s.source; });
      if (!laid) throw new Error('--own-grid: this building has no grid derived from itself');
    }
    if (wantLines) {
      info = await t.pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(), m = window.GridSpanGate && window.__dwBuf ? (() => { const d = new window.SQL.Database(new Uint8Array(window.__dwBuf)); const v = window.GridSpanGate.readMaterial(d); d.close(); return v; })() : {};
        const G = window.Bonsai.grid; return { grid_source: G._columnDerived ? 'column-derived' : (window.__ownGridSource || 'app-default'), system: i ? i.system : null, material: m.material || null, mixed: !!m.mixed, girders: i && i.base0 ? i.base0.girders.length : 0, lines: window.Bonsai.gridmove.gridLines().map(l => ({ id: l.id, axis: l.axis, pos: +(+l.pos).toFixed(3) })) }; });
    }
    for (const e of edits) {
      const res = await t.pg.evaluate(async (grid, move, shift) => {
        const known = window.Bonsai.gridmove.gridLines().map(l => l.id);
        if (known.indexOf(grid) < 0) return { refused: true, reason: 'no grid line ' + grid + ' in this building (' + known.length + ' lines)' };
        const before = window.__lastEditReport || null;
        await (shift ? window.__gridShift : window.__gridStretch)(grid, move);
        const stat = (document.getElementById('stat') || {}).textContent || '';
        if (window.__lastEditReport && window.__lastEditReport !== before) return { report: window.__lastEditReport };
        return { refused: true, reason: stat.replace(/^FAIL\s*/, '') || 'the edit produced no report' };
      }, e.grid, e.move, !!e.shift);
      results.push(res.report ? res.report : Object.assign({ refused: true, grid: e.grid, move: e.move, reason: res.reason }, e.shift ? { shift: true } : {}));
    }
    t.assert('edit_cli judged every edit', results.length === edits.length && (!wantLines || !!info));
  }, { noExit: true });
  const refused = results.some(x => x.refused), failed = !opened || results.length !== edits.length || (r && r.fail);
  out(JSON.stringify(Object.assign({ ok: !failed && !refused, building, edits: results, ms: Date.now() - t0 }, info ? { model: info } : {})) + '\n', () => process.exit(failed ? 1 : refused ? 3 : 0));
})().catch(e => { process.stderr.write('edit_cli: ' + (e && e.stack || e) + '\n'); process.exit(1); });
