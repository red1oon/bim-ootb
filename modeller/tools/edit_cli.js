#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_cli.js — a call a proposer or a macro can make (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §11). Drives the REAL Modeller page
// headless through the real commit path and prints §EDIT_REPORT's JSON. Deliberately not a Node copy of the fold: one engine, the page's. Stops nothing,
// adds no rule, saves nothing: every run starts from a fresh Open. No AI inside.
//   node modeller/tools/edit_cli.js --building HospitalGarage --grid gy8 --move 1.5 [--grid gy9 --move -0.5]
//   node modeller/tools/edit_cli.js --building HospitalGarage --shift gy9 --move 1.51     that line and every later line on its axis move together (§13.1)
//   node modeller/tools/edit_cli.js --building HospitalGarage --lines     what a caller needs to propose: the grid lines, where they came from, the system, the material
//              each line's pos is across the lattice (the frame a --move uses); on a rotated building rotation_deg says by how much and world is the app's world-axis line
//   --lattice-boxes  judge overlaps on boxes in the lattice frame, not world boxes (§13.6). No effect at theta 0. The app itself stays on world boxes.
//   An edit that adds new red is STOPPED (§15.1): undone, a recount checks Before is back, and it comes back as {refused, stopped_by_gate, reason, report}, exit 3.
//   --report-only  no stop: every edit stands and is reported (diagnosis, and comparing with the page byte for byte)
//   --url <modeller.html>  drive that page. Default: this repo's own files when this script stands in one, otherwise the live site below. One file plus puppeteer is all it needs.
//   --own-grid  on a wall-bearing building, use the lines derived from its walls, not the app's default grid (§13.2). Refused if the building has none.
// stdout: JSON only, {ok, building, edits:[report | {refused,grid,move,reason}], ms}. Logs: stderr. Exit: 0 every edit reported · 3 an edit refused · 2 usage · 1 failed.
'use strict';
const path = require('path');
const args = process.argv.slice(2), edits = []; let building = null, localFile = null, bad = null, wantLines = false, wantOpen = false, ownGrid = false, latticeBoxes = false, url = null, reportOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--building') building = args[++i];
  else if (args[i] === '--file') { localFile = args[++i]; if (!building) building = require('path').basename(String(localFile)).replace(/_extracted\.db$|\.db$/i, ''); }   // a building that is a .db on this computer: opened the way the page's "Open local .db" row opens it
  else if (args[i] === '--open') wantOpen = true;
  else if (args[i] === '--lines') wantLines = true;
  else if (args[i] === '--url') url = args[++i];
  else if (args[i] === '--report-only') reportOnly = true;
  else if (args[i] === '--own-grid') ownGrid = true;
  else if (args[i] === '--lattice-boxes') latticeBoxes = true;
  else if (args[i] === '--grid') edits.push({ grid: args[++i] });
  else if (args[i] === '--shift') edits.push({ grid: args[++i], shift: true });
  else if (args[i] === '--move') { const v = Number(args[++i]); if (!edits.length || edits[edits.length - 1].move != null || !isFinite(v)) bad = '--move needs a number after a --grid or --shift'; else edits[edits.length - 1].move = v; }
  else bad = 'unknown argument ' + args[i];
}
if (!bad && !building) bad = '--building is required';
if (!bad && !edits.length && !wantLines && !wantOpen) bad = 'at least one --grid or --shift, with --move, is required';
if (!bad && edits.some(e => e.move == null)) bad = 'every --grid or --shift needs a --move';
if (bad) { process.stderr.write('edit_cli: ' + bad + '\n'); process.exit(2); }

const out = process.stdout.write.bind(process.stdout);
const http = require('http'), fs = require('fs');
const LIVE = 'https://red1oon.github.io/bim-ootb/modeller/modeller.html', ROOT = path.join(__dirname, '..', '..'), HERE = path.join(ROOT, 'modeller', 'modeller.html');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
function loadPuppeteer() {
  try { return require('puppeteer'); }
  catch (e) {
    process.stderr.write('edit_cli: ' + (e.code === 'MODULE_NOT_FOUND' ? 'puppeteer not found.' : 'puppeteer would not load (' + e.code + '), which usually means this Node is too old for that version.') + ' Run: npm install puppeteer@24\n');
    process.exit(1);
  }
}
function serveRepo() {
  const server = http.createServer((q, r) => { fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });
  return new Promise(res => server.listen(0, () => res(server)));
}

(async () => {
  const puppeteer = loadPuppeteer(), results = [], gates = []; let opened = false, info = null, failed = null, server = null;
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
    if (localFile) { const [fc] = await Promise.all([pg.waitForFileChooser({ timeout: 15000 }), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await fc.accept([path.resolve(localFile)]); }
    else {
    if (!await pg.$('#m-open-panel .mo-row[data-key="' + building + '"]')) { const k = await pg.evaluate(() => Array.from(document.querySelectorAll('#m-open-panel .mo-row')).map(r => r.dataset.key).filter(k => k && k.indexOf('__') !== 0)); throw new Error('no building ' + building + ' (' + k.join(', ') + ')'); }
    await pg.click('#m-open-panel .mo-row[data-key="' + building + '"]');
    }
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
      info = await pg.evaluate((breakLines) => { const i = window.swbGateInfo && window.swbGateInfo(), m = window.GridSpanGate && window.__dwBuf ? (() => { const d = new window.SQL.Database(new Uint8Array(window.__dwBuf)); const v = window.GridSpanGate.readMaterial(d); d.close(); return v; })() : {};
        const G = window.Bonsai.grid; return { grid_source: G._columnDerived ? 'column-derived' : (window.__ownGridSource || 'app-default'), system: i ? i.system : null, material: m.material || null, mixed: !!m.mixed, girders: i && i.base0 ? i.base0.girders.length : 0, ...(() => { const g0 = i && i.base0 && i.base0.grid, own = !!(G._columnDerived && g0), th = own ? (g0.theta || 0) : 0;
          // §17 (bim-compiler NEURO_SYMBOLIC_ORDER_CONTRACT.md): pos is the line's position ACROSS the lattice, the frame a --move and the span check use. On a rotated
          // building the app's world-axis line (kept as world) reads every bay 1/cos(theta) long. At theta 0 the two are equal. breakLines = the witness's falsifier.
          const lines = window.Bonsai.gridmove.gridLines().map(l => { const w = +(+l.pos).toFixed(3); if (!own) return { id: l.id, axis: l.axis, pos: w };
            const mm = /^g([xy])(\d+)$/.exec(l.id), arr = mm && (mm[1] === 'x' ? g0.xLines : g0.yLines), u = arr ? arr[+mm[2]] : null;
            return { id: l.id, axis: l.axis, pos: (u == null || breakLines) ? w : +(+u).toFixed(3), world: w }; });
          return { rotation_deg: +(th * 180 / Math.PI).toFixed(3), frame: own && Math.abs(th) > 1e-9 ? 'building' : 'world', lines: lines }; })() }; }, process.env.LINES_BREAK === '1');
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
      if (!res.report) { results.push(Object.assign({ refused: true, grid: e.grid, move: e.move, reason: res.reason }, e.shift ? { shift: true } : {})); gates.push(null); continue; }
      if (reportOnly) { results.push(res.report); gates.push(null); continue; }
      const g = await pg.evaluate(async (rep) => {
        await window.__ensureEditReport(); const v = window.EditReport.gateVerdict(rep);
        if (!v.stop) return { v };
        await window.Bonsai.oplog.undo();
        const row = (id) => rep.rows.filter(x => x.id === id)[0], want = { overlap: row('overlap'), red: row('span_red'), orange: row('span_orange') };
        let c = null, back = false;
        for (let i = 0; i < 40 && !back; i++) { await new Promise(z => setTimeout(z, 250)); c = window.__editReportRecount();
          back = !!c && (want.overlap.state !== 'JUDGED' || c.overlap === want.overlap.before) && (want.red.state !== 'JUDGED' || (c.span && c.span.RED === want.red.before && c.span.ORANGE === want.orange.before)); }
        return { v, back, recount: c && { overlap: c.overlap, red: c.span ? c.span.RED : null, orange: c.span ? c.span.ORANGE : null } };
      }, res.report);
      if (g.v.stop && !g.back) throw new Error('the stop undid the edit but a recount did not return to Before: ' + JSON.stringify(g.recount));
      gates.push({ edit: results.length, stopped: g.v.stop, not_judged: g.v.not_judged });
      results.push(g.v.stop ? Object.assign({ refused: true, stopped_by_gate: true, grid: e.grid, move: e.move }, e.shift ? { shift: true } : {}, { reason: 'stopped: ' + g.v.reasons.join('; '), report: res.report }) : res.report);
    }
  } catch (e) { failed = String(e && e.message || e); }
  await br.close().catch(() => {}); if (server) server.close();
  if (errs.length) process.stderr.write('edit_cli: page errors: ' + errs.slice(0, 2).join(' | ') + '\n');
  if (failed) process.stderr.write('edit_cli: ' + failed + '\n');
  const refused = results.some(x => x.refused), bad = !!failed || errs.length > 0 || !opened || results.length !== edits.length || (wantLines && !info);
  out(JSON.stringify(Object.assign({ ok: !bad && !refused, building, edits: results, ms: Date.now() - t0 }, info ? { model: info } : {}, reportOnly ? { gate: 'off (--report-only)' } : (gates.some(Boolean) ? { gate: gates.filter(Boolean) } : {}), failed ? { error: failed } : {})) + '\n', () => process.exit(bad ? 1 : refused ? 3 : 0));
})().catch(e => { process.stderr.write('edit_cli: ' + (e && e.stack || e) + '\n'); process.exit(1); });
