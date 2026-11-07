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
//   --url <modeller.html>  drive that page. Default: this repo's own files when this script stands in one, otherwise the live site below. One file plus puppeteer is all it needs.
//   --own-grid  on a wall-bearing building, use the lines derived from its walls, not the app's default grid (§13.2). Refused if the building has none.
// stdout: JSON only, {ok, building, edits:[report | {refused,grid,move,reason}], ms}. Logs: stderr. Exit: 0 every edit reported · 3 an edit refused · 2 usage · 1 failed.
'use strict';
const path = require('path');
const args = process.argv.slice(2), edits = []; let building = null, bad = null, wantLines = false, ownGrid = false, latticeBoxes = false, url = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--building') building = args[++i];
  else if (args[i] === '--lines') wantLines = true;
  else if (args[i] === '--url') url = args[++i];
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
const http = require('http'), fs = require('fs');
const LIVE = 'https://red1oon.github.io/bim-ootb/modeller/modeller.html', ROOT = path.join(__dirname, '..', '..'), HERE = path.join(ROOT, 'modeller', 'modeller.html');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
function loadPuppeteer() { try { return require('puppeteer'); } catch (e) { process.stderr.write('edit_cli: puppeteer not found. Run: npm install puppeteer\n'); process.exit(1); } }
function serveRepo() {
  const server = http.createServer((q, r) => { fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });
  return new Promise(res => server.listen(0, () => res(server)));
}

(async () => {
  const puppeteer = loadPuppeteer(), results = []; let opened = false, info = null, failed = null, server = null;
  if (!url && fs.existsSync(HERE)) { server = await serveRepo(); url = 'http://localhost:' + server.address().port + '/modeller/modeller.html'; }
  if (!url) url = LIVE;
  process.stderr.write('edit_cli: ' + url + '\n');
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [], slog = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 860 });
    pg.on('pageerror', e => errs.push(String(e).slice(0, 180)));
    pg.on('console', m => { const x = m.text(); if (/^§/.test(x)) slog.push(x); });
    await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    if (!await pg.$('#m-open-panel .mo-row[data-key="' + building + '"]')) { const k = await pg.evaluate(() => Array.from(document.querySelectorAll('#m-open-panel .mo-row')).map(r => r.dataset.key).filter(Boolean)); throw new Error('no building ' + building + ' (' + k.join(', ') + ')'); }
    await pg.click('#m-open-panel .mo-row[data-key="' + building + '"]');
    await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 120000 }).catch(() => {});
    await sleep(2200);
    // Settled = the seed has armed the Save baseline with real boxes. Editing sooner moves nothing and reports "not judged", so the answer would depend on machine load.
    let settled = false;
    for (let i = 0; i < 480 && !settled; i++) { settled = await pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0); if (!settled) await sleep(500); }
    if (!settled) throw new Error('the building did not finish opening within 240 s');
    opened = true;
    const framed = await pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(); return !!(i && i.system === 'column-framed'); });
    if (framed) {   // same readiness and arming a person's Move Grid gives: the walker's lattice becomes the grid
      for (let i = 0; i < 120 && !slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await sleep(500);
      await sleep(5000);
      await pg.click('#b-gridmove'); await sleep(600);
    } else await sleep(1500);
    if (latticeBoxes) await pg.evaluate(() => { window.__gateLatticeBoxes = true; });
    if (ownGrid) {
      const laid = await pg.evaluate(() => { const s = window.swbSemiGridSpec && window.swbSemiGridSpec(); if (!s) return window.Bonsai.grid._columnDerived ? 'column-derived' : null; window.Bonsai.grid.define({ xs: s.xs, ys: s.ys }); window.__ownGridSource = s.source; return s.source; });
      if (!laid) throw new Error('--own-grid: this building has no grid derived from itself');
    }
    if (wantLines) {
      info = await pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(), m = window.GridSpanGate && window.__dwBuf ? (() => { const d = new window.SQL.Database(new Uint8Array(window.__dwBuf)); const v = window.GridSpanGate.readMaterial(d); d.close(); return v; })() : {};
        const G = window.Bonsai.grid; return { grid_source: G._columnDerived ? 'column-derived' : (window.__ownGridSource || 'app-default'), system: i ? i.system : null, material: m.material || null, mixed: !!m.mixed, girders: i && i.base0 ? i.base0.girders.length : 0, lines: window.Bonsai.gridmove.gridLines().map(l => ({ id: l.id, axis: l.axis, pos: +(+l.pos).toFixed(3) })) }; });
    }
    for (const e of edits) {
      const res = await pg.evaluate(async (grid, move, shift) => {
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
  } catch (e) { failed = String(e && e.message || e); }
  await br.close().catch(() => {}); if (server) server.close();
  if (errs.length) process.stderr.write('edit_cli: page errors: ' + errs.slice(0, 2).join(' | ') + '\n');
  if (failed) process.stderr.write('edit_cli: ' + failed + '\n');
  const refused = results.some(x => x.refused), bad = !!failed || errs.length > 0 || !opened || results.length !== edits.length || (wantLines && !info);
  out(JSON.stringify(Object.assign({ ok: !bad && !refused, building, edits: results, ms: Date.now() - t0 }, info ? { model: info } : {}, failed ? { error: failed } : {})) + '\n', () => process.exit(bad ? 1 : refused ? 3 : 0));
})().catch(e => { process.stderr.write('edit_cli: ' + (e && e.stack || e) + '\n'); process.exit(1); });
