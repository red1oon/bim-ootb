#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-SHED-WALL-EDIT (prompts/DXF2BIM_FOUNDATION_LANE.md §D87). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the BricsCAD film edits ONE converted SHED wall in small typed steps ("show how they can be edited, ie one wall.. clearly demonstrated.. by small
// adjustments", owner 2026-10-27); wall editing was proven on the Duplex only (§D59 L4). Driven the way a person does it (Move tool, the step field + an arrow key, the scale field + Enter,
// Ctrl+Z / Ctrl+Y) on the CLI-marked shed:
//   E0 the subject: the longest wall with no door in its line within 1.5 m (MEASURED 2026-10-27: the shed's doors are hosted by no wall — the drawing breaks a wall at its door, the
//      structure path places door leaves from swing symbols, 0 cuts / 0 fills — so a wall next to a door would leave the door behind on screen); no element has an identical copy
//      (a copy would show from behind the moved one)
//   E1a in Move mode #dim-move and #dim-scale are the topmost element at their centre (MEASURED 2026-10-27 on main: the history dot line #hist-dots covered both after Convert)
//   E1 type 0.1 in #dim-move, one arrow key along the wall's long axis: the wall moves 0.1 m (±1 mm), every other element stays (±1 mm), one op-log step
//   E2 type <axis>1.05 (the wall's long LOCAL axis) in #dim-scale + Enter: its length grows 5 % (±1 mm), thickness and height unchanged, every other element stays
//   E3 Ctrl+Z twice: everything back as converted (±1 mm)      E4 Ctrl+Y twice: back to the E2 state (±1 mm)      E5 0 page errors
// What the screen says after each step (#stat) is logged as §SHED-EDIT-SHOWN, for the narration (reported, not judged). §SHED-EDIT hosted= reports the door hosting the film must not claim.
// Input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR, default ~/Videos/dxf2bim_film_work/why/cli/marked). Missing input -> MISSING, exit 2.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tests/witness_dxf_shed_wall_edit.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MARKED = process.env.SHED_MARKED_DIR || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms)), MM = 0.001, near = (a, b) => Math.abs(a - b) <= MM;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  const files = fs.existsSync(MARKED) ? fs.readdirSync(MARKED).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MARKED, f)) : [];
  if (files.length !== 9) { console.log('MISSING input: the 9 CLI-marked shed sheets (SHED_MARKED_DIR ' + MARKED + ', found ' + files.length + ')'); process.exit(2); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  try {
    const pg = await (await br.createBrowserContext()).newPage(); await pg.setViewport({ width: 1440, height: 810 });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); console.log('§PAGEERR ' + String(e).slice(0, 200)); });
    pg.on('console', m => { const t = m.text(); if (/§SCALE commit|§NUMROT|§MODELLER (move|scale) fail/.test(t)) console.log('  ' + t.slice(0, 220)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && window.DxfImportUI && window.Bonsai', { timeout: 120000 });
    await pg.evaluate(() => { window.DxfImportUI.state.arrangeOnOpen = false; });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__dxf"]', { visible: true });
    const [ch] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__dxf"]')]); await ch.accept(files);
    await pg.waitForFunction('window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok', { timeout: 300000 }).catch(() => {});
    if (!await pg.evaluate(() => !!(window.DxfImportUI.state.gate && window.DxfImportUI.state.gate.ok))) { console.log('§W-SHED-WALL-EDIT INCONCLUSIVE: the shed did not qualify: nothing judged'); process.exit(1); }
    await pg.click('#dxf-convert'); await pg.waitForFunction('window.DxfImportUI.state.last && window.DxfImportUI.state.last.nInserts > 0', { timeout: 300000 }); await sleep(2500);
    // the converted model, measured: every insert's world box, the doors' line neighbours, identical copies
    const S = await pg.evaluate(() => {
      const g = window.Bonsai.group(), mesh = fid => g.children.find(m => m.isMesh && m.userData && m.userData.featureId === fid);
      const bb = fid => { const m = mesh(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
      window.__se = { bb, all: () => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').map(o => [o.id, bb(o.id)]).filter(r => r[1]) };
      const ops = window.Bonsai.oplog._geomOps(), ins = ops.filter(o => o.op_type === 'GEOM_INSERT'), cls = o => (o.parameters || {}).ifc_class;
      const X = window.swXEdges, hosted = X && X.fills ? X.fills.filter(x => x.filling_class === 'IfcDoor').length : 0, cuts = ops.filter(o => o.op_type === 'GEOM_CUT').length;
      const seen = {}; ins.forEach(o => { const b = bb(o.id); if (b) { const k = cls(o) + '|' + b.map(v => v.toFixed(3)).join(','); seen[k] = (seen[k] || 0) + 1; } });
      const copies = Object.keys(seen).reduce((n, k) => n + seen[k] - 1, 0);
      const doors = ins.filter(o => cls(o) === 'IfcDoor').map(o => bb(o.id)).filter(Boolean);
      const walls = ins.filter(o => cls(o) === 'IfcWall').map(o => ({ id: o.id, b: bb(o.id), lb: o.parameters.bbox })).filter(w => w.b);
      const free = walls.filter(w => { const k = (w.b[3] - w.b[0]) >= (w.b[4] - w.b[1]) ? 0 : 1, j = 1 - k;
        return !doors.some(d => d[j + 3] >= w.b[j] - 0.05 && d[j] <= w.b[j + 3] + 0.05 && d[k + 3] >= w.b[k] - 1.5 && d[k] <= w.b[k + 3] + 1.5); });
      const len = w => Math.max(w.b[3] - w.b[0], w.b[4] - w.b[1]); free.sort((a, b) => len(b) - len(a));
      const w = free[0]; if (!w) return { err: 'no wall free of doors', walls: walls.length, doors: doors.length };
      const ld = [w.lb[1] - w.lb[0], w.lb[3] - w.lb[2], w.lb[5] - w.lb[4]];
      return { id: w.id, k: (w.b[3] - w.b[0]) >= (w.b[4] - w.b[1]) ? 0 : 1, len: len(w), localAxis: 'xyz'[ld.indexOf(Math.max.apply(null, ld))], walls: walls.length, freeWalls: free.length, doors: doors.length, hostedDoors: hosted, cuts, inserts: ins.length, copies };
    });
    console.log('§SHED-EDIT hosted=' + S.hostedDoors + ' cuts=' + S.cuts + ' doors=' + S.doors + ' (the film must not say a door rides a shed wall while hosted=0)');
    console.log('§SHED-EDIT subject ' + JSON.stringify(S));
    ok('E0 a shed wall free of doors is the subject, and no element has an identical copy behind it', !S.err && S.copies === 0, 'wall #' + S.id + ' length ' + (S.len || 0).toFixed(3) + ' m, free walls ' + S.freeWalls + ' of ' + S.walls + ', copies ' + S.copies);
    if (S.err) throw new Error('no subject');
    const K = S.k, J = 1 - K, all = async () => new Map(await pg.evaluate(() => window.__se.all()));
    const stat = () => pg.evaluate(() => (document.getElementById('stat') || {}).textContent || ''), opsN = () => pg.evaluate(() => window.Bonsai.oplog.length);
    const shown = async step => console.log('§SHED-EDIT-SHOWN step=' + step + ' stat="' + String(await stat()).slice(0, 160) + '"');
    const others = (A, B) => { let worst = 0; A.forEach((b, id) => { if (id === S.id) return; const c = B.get(id); if (!c) { worst = Infinity; return; } b.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - c[i])); }); }); return worst; };
    const blur = () => pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    const A0 = await all(), w0 = A0.get(S.id), n0 = await opsN();
    // select the wall, Move (the toolbar button), type the step, one arrow key along its long axis
    await pg.evaluate(id => window.Bonsai.select(id), S.id); await sleep(400); await pg.click('#b-move'); await sleep(700);
    const hitAt = sel => pg.evaluate(sel => { const e = document.querySelector(sel); if (!e) return { sel, missing: true }; const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = document.elementFromPoint(cx, cy);
      return { sel, shown: getComputedStyle(e).display !== 'none' && r.width > 0, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], top: h ? (h.id ? '#' + h.id : h.tagName) + (h.closest('[id]') ? ' in #' + h.closest('[id]').id : '') : null, reachable: h === e, value: e.value }; }, sel);
    const fm = await hitAt('#dim-move'), fs_ = await hitAt('#dim-scale');
    ok('E1a in Move mode the typed Move and Scale fields can be clicked (nothing on top of them)', fm.shown && fm.reachable && fs_.shown && fs_.reachable, JSON.stringify(fm) + ' ' + JSON.stringify(fs_));
    await pg.click('#dim-move', { clickCount: 3 }); await pg.keyboard.type('0.1'); await blur(); await sleep(200);
    console.log('§SHED-EDIT typed move value=' + await pg.evaluate(() => document.getElementById('dim-move').value));
    await pg.keyboard.press(K === 0 ? 'ArrowRight' : 'ArrowUp'); await sleep(2000); await shown('move');
    const A1 = await all(), w1 = A1.get(S.id), n1 = await opsN(), o1 = others(A0, A1);
    ok('E1 a typed 0.1 m step + one arrow key moves the wall 0.1 m, nothing else, in one op-log step', near(w1[K] - w0[K], 0.1) && near(w1[K + 3] - w0[K + 3], 0.1) && near(w1[J], w0[J]) && o1 <= MM && n1 === n0 + 1,
      'axis=' + 'xy'[K] + ' wall ' + (w1[K] - w0[K]).toFixed(4) + ' / ' + (w1[K + 3] - w0[K + 3]).toFixed(4) + ' others max ' + o1.toFixed(4) + ' ops ' + n0 + '->' + n1);
    // stretch: the scale field, 5 % on the wall's long local axis
    await pg.click('#dim-scale', { clickCount: 3 }); await pg.keyboard.type(S.localAxis + '1.05'); await pg.keyboard.press('Enter'); await sleep(2500); await blur(); await shown('stretch');
    const A2 = await all(), w2 = A2.get(S.id), L1 = w1[K + 3] - w1[K], L2 = w2[K + 3] - w2[K], o2 = others(A0, A2);
    ok('E2 a typed ' + S.localAxis + '1.05 makes the wall 5 % longer, thickness and height unchanged, nothing else moves', near(L2, L1 * 1.05) && near(w2[J + 3] - w2[J], w1[J + 3] - w1[J]) && near(w2[5] - w2[2], w1[5] - w1[2]) && o2 <= MM,
      'length ' + L1.toFixed(4) + ' -> ' + L2.toFixed(4) + ' (want ' + (L1 * 1.05).toFixed(4) + ') thickness ' + (w1[J + 3] - w1[J]).toFixed(4) + ' -> ' + (w2[J + 3] - w2[J]).toFixed(4) + ' others max ' + o2.toFixed(4));
    const same = (A, B) => { let worst = 0; A.forEach((b, id) => { const c = B.get(id); if (!c) { worst = Infinity; return; } b.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - c[i])); }); }); return worst; };
    for (let i = 0; i < 2; i++) { await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(1800); }
    await shown('undo x2'); const A3 = await all(), d3 = same(A0, A3);
    ok('E3 Ctrl+Z twice puts everything back as converted', d3 <= MM, 'max difference ' + d3.toFixed(4) + ' m over ' + A0.size + ' elements');
    for (let i = 0; i < 2; i++) { await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await sleep(1800); }
    await shown('redo x2'); const A4 = await all(), d4 = same(A2, A4);
    ok('E4 Ctrl+Y twice brings back the moved and stretched wall', d4 <= MM, 'max difference ' + d4.toFixed(4) + ' m from the E2 state');
    ok('E5 no page errors', errs.length === 0, 'errors=' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } catch (e) { if (String(e && e.message) !== 'no subject') ok('E run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); srv.close();
  console.log('§W-SHED-WALL-EDIT ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
