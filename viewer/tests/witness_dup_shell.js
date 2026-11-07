#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-DUP-SHELL. SCOPE: bim-compiler prompts/MODELLER_MASTER.md §G4 SPEC. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: coincident shells shimmer on screen. Does §DUP_SHELL hide only true duplicates, and can it say it hid the wrong thing or nothing?
// Usage: node witness_dup_shell.js [db ...]   (each db gets its pair census, read-only, in memory).
'use strict';
const fs = require('fs'), path = require('path');
const D = require('../dup_shell.js');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_DUP ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };

// A box mesh: 8 corners, local about the origin. Rotated about Z by `deg` when asked (a diagonal wall).
function box(w, d, h, deg) {
  const t = (deg || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), o = [];
  [-1, 1].forEach(x => [-1, 1].forEach(y => [-1, 1].forEach(z => { const X = x * w / 2, Y = y * d / 2; o.push(X * c - Y * s, X * s + Y * c, z * h / 2); })));
  return new Float32Array(o);
}
const aabb = v => { const a = [0, 1, 2].map(k => { let lo = Infinity, hi = -Infinity; for (let i = k; i < v.length; i += 3) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); } return hi - lo; }); return a; };
function row(guid, hash, v, cx, cy, cz, cls, mat, rot) { const e = aabb(v); return [guid, hash, null, 'ARC', cx, cy, cz, rot || 0, 0, 0, 'L', cls, guid, e[0], e[1], e[2], mat]; }

// ── Hand-built cases, each with its expected verdict stated before the run ──
const M = { w: box(6, 0.2, 3), tall: box(4, 4, 40), diag: box(10, 0.2, 3, 28), wide: box(5, 5, 3) }, of = h => M[h];
const R = D.find([
  row('A1', 'w', M.w, 0, 0, 0, 'IfcWall', 'conc'), row('A2', 'w', M.w, 0, 0, 0, 'IfcWall', 'conc'),                 // identical: A2 hidden
  row('B1', 'tall', M.tall, 100, 0, 20, 'IfcProxy', 'stone'), row('B2', 'tall', M.tall, 100, 0, 20.2, 'IfcProxy', 'stone'),   // 0.2 m along 40 m: hidden
  row('C1', 'diag', M.diag, 200, 0, 0, 'IfcWall', 'conc'), row('C2', 'diag', M.diag, 200 - 0.21 * Math.sin(28 * Math.PI / 180), 0.21 * Math.cos(28 * Math.PI / 180), 0, 'IfcWall', 'conc'),   // parallel diagonal walls side by side, 0.2 thick, 0.21 apart: AABB nearly equal, no real overlap: kept
  row('D1', 'w', M.w, 300, 0, 0, 'IfcSlab', 'conc'), row('D2', 'w', M.w, 300, 0, 0, 'IfcSlab', 'stone'),            // one place, two materials: kept and logged
  row('E1', 'w', M.w, 400, 0, 0, 'IfcWall', 'conc'), row('E2', 'w', M.w, 400, 0, 0, 'IfcSlab', 'conc'),             // different class: never a pair
  row('F1', 'w', M.w, 500, 0, 0, 'IfcWall', 'conc'), row('F2', 'w', M.w, 500, 0, 0, 'IfcWall', 'conc'), row('F3', 'w', M.w, 500, 0, 0, 'IfcWall', 'conc'),   // chain: F1 stays
  row('G1', 'w', M.w, 600, 0, 0, 'IfcWall', 'conc', 0.5), row('G2', 'w', M.w, 600, 0, 0, 'IfcWall', 'conc', 0.5),  // an instance rotation: unjudged, kept
], of);
const verdict = g => (R.pairs.find(p => p.hidden === g) || {}).verdict;
chk('U1 identical pair: the later one is hidden', R.hidden.A2 && !R.hidden.A1, verdict('A2'));
chk('U2 shifted coincident shell (0.2 m on 40 m) is hidden', R.hidden.B2 && !R.hidden.B1, verdict('B2'));
const redPair = R.pairs.find(p => p.hidden === 'C2');
chk('U3 RED: two parallel diagonal walls have a high AABB overlap and are NOT hidden', !!redPair && redPair.aabb > 0.9 && !R.hidden.C2, JSON.stringify(redPair));
chk('U4 one place, two materials: both kept, logged', !R.hidden.D2 && verdict('D2') === 'different-material', verdict('D2'));
chk('U5 different class is never a pair', !R.hidden.E2 && !verdict('E2'));
chk('U6 chain of three: the first stays, two hidden', !R.hidden.F1 && R.hidden.F2 && R.hidden.F3, JSON.stringify(R.pairs.filter(p => /^F/.test(p.hidden))));
chk('U7 an instance rotation is unjudged and kept', !R.hidden.G2 && verdict('G2') === 'unjudged', verdict('G2'));
const noMesh = D.find([row('H1', 'w', M.w, 0, 0, 0, 'IfcWall', 'x'), row('H2', 'w', M.w, 0, 0, 0, 'IfcWall', 'x')], null);
const disc = D.find([['I1', 'w', null, 'ARC', 0, 0, 0, 0, 0, 0, 'L', 'IfcDoor', 'I1', 6, 0.2, 3, 'x'], ['I2', 'w', null, 'STR', 0, 0, 0, 0, 0, 0, 'L', 'IfcDoor', 'I2', 6, 0.2, 3, 'x']], of);
chk('U9 one place, two disciplines: both kept, logged', !Object.keys(disc.hidden).length && disc.pairs[0].verdict === 'different-discipline', disc.pairs[0].verdict);
chk('U8 no mesh at hand: unjudged, nothing hidden', !Object.keys(noMesh.hidden).length && noMesh.pairs[0].verdict === 'unjudged');

// ── Real DBs: the same query the stream queue runs, read-only in memory ──
(async () => {
  const SQL = await initSqlJs();
  for (const f of process.argv.slice(2)) {
    const name = path.basename(f);
    if (!fs.existsSync(f) || fs.statSync(f).size < 1024) { console.log('§W_DUP DB ' + name + ' INCONCLUSIVE absent or empty'); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
    let rows;
    try {
      rows = db.exec("SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, m.storey, m.ifc_class, m.element_name, t.bbox_x, t.bbox_y, t.bbox_z, m.material_name FROM elements_meta m JOIN element_instances i ON m.guid=i.guid JOIN element_transforms t ON t.guid=m.guid WHERE i.geometry_hash IS NOT NULL AND m.ifc_class != 'IfcOpeningElement'")[0].values;
    } catch (e) { console.log('§W_DUP DB ' + name + ' INCONCLUSIVE ' + e.message); db.close(); continue; }
    const hasGeom = db.exec("SELECT 1 FROM sqlite_master WHERE name='component_geometries'").length > 0;
    const vertsOf = h => { if (!hasGeom) return null; const r = db.exec('SELECT vertices FROM component_geometries WHERE geometry_hash=?', [h]); if (!r.length || !r[0].values[0][0]) return null; const b = r[0].values[0][0]; return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
    const kept = D.filterRows(rows, vertsOf, name);
    console.log('§W_DUP DB ' + name + ' rows=' + rows.length + ' shown=' + kept.length + ' hidden=' + (rows.length - kept.length));
    db.close();
  }
  // The page: the real Viewer on a public DB. Does the filter run, is the count on screen the shown count, and is the page clean? No pixel judged.
  if (process.env.DUP_PAGE) {
    const http = require('http'), pup = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..'), SH = path.join(process.env.HOME, 'bim-ootb');
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), a = path.join(ROOT, u), b = path.join(SH, u); fs.readFile(fs.existsSync(a) ? a : b, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(d); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const br = await pup.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), pg = await br.newPage(), lines = [], errs = [];
    pg.on('console', m => { const t = m.text(); if (/§DUP_SHELL /.test(t)) lines.push(t); }); pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=' + encodeURIComponent('../buildings/' + process.env.DUP_PAGE), { waitUntil: 'load', timeout: 120000 });
    let t = ''; for (let i = 0; i < 150 && !/DONE/.test(t); i++) { await new Promise(r => setTimeout(r, 1000)); t = await pg.evaluate(() => (document.getElementById('status') || document.body).innerText).catch(() => ''); }
    console.log('§W_DUP PAGE ' + (lines[0] || 'no §DUP_SHELL line') + ' | status=' + String((t.match(/DONE[^\n]{0,80}/) || [''])[0]));
    chk('P1 the page ran the filter and finished, 0 page errors', lines.length > 0 && /DONE/.test(t) && !errs.length, 'lines=' + lines.length + ' errors=' + errs.length + ' ' + (errs[0] || ''));
    await br.close(); srv.close();
  } else console.log('§W_DUP PAGE INCONCLUSIVE set DUP_PAGE=<db in buildings/> to judge the page');
  console.log('§W_DUP VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§W_DUP ERROR ' + (e && e.stack || e)); process.exit(1); });
