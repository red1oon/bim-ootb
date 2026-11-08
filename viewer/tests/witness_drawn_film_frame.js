#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-DRAWN-FILM-FRAME, prompts/DRAWN_SERVICES_FILM.md §7. Read the log after every run; exit code is not evidence.
// ISSUES IT EXPOSES (the first real drawn-services bake, 2026-11-09):
//   (P) the Time Machine build-up re-shows elements the drawn-only isolate hid: renderAtTime sets visibility from the schedule
//       alone and never reads APP.activeGuidFilter. P0 measures it (hidden guids visible at mid build-up), P2 is its red control.
//   (U) a fix that changes the build-up for a page with NO isolate (P1 must hold the snapshot byte-equal with the AND on and off).
//   (C) the ending-orbit cease (_cease3D, the depthTest:false net) hides the drawn services, the film's subject. C1 keeps them,
//       and still hides an unregistered depthTest:false object and a registered signage layer; C2 is its red control.
//   (F) no per-frame evidence in a bake log: APP.drawnServicesFrame(i) must say what a frame shows (visible overlay, hidden guids visible).
// A claim prints INCONCLUSIVE, never PASS, when nothing was judged (no hidden set, no timeline, no hook).
// Fixture (public): a temp COPY of buildings/Duplex_extracted.db plus stated rows (2 drawn lines between two element centres, 1 marker,
// BIMOOTB_Walk/Provenance='band' on every 4th guid by guid order). Software GL (swiftshader), no GPU.
// Usage:  node viewer/tests/witness_drawn_film_frame.js > log 2>&1
//         node viewer/tests/witness_drawn_film_frame.js --db <file>    P0 only, read-only, on any Viewer DB (private probe; no fixture writes)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const NM = path.join(os.homedir(), 'bim-compiler', 'node_modules');
const puppeteer = require(process.env.PUPPETEER_PATH || path.join(NM, 'puppeteer'));
const Database = require(path.join(NM, 'better-sqlite3'));
const log = console.log;
let pass = 0, fail = 0, inc = 0;
const ok = (id, c, m) => { log('§' + (c ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (m || '')); c ? pass++ : fail++; return c; };
const incon = (id, why) => { log('§INCONCLUSIVE ' + id + ' | ' + why); inc++; };
const ai = process.argv.indexOf('--db'), PROBE = ai >= 0 ? path.resolve(process.argv[ai + 1]) : null;
const FR = [0.25, 0.5, 0.75, 1.0];

function fixture() {
  // BLD_DIR, else this tree's buildings/, else the main checkout's (a worktree has no gitignored DBs). Only ever COPIED.
  const src = [process.env.BLD_DIR, path.join(ROOT, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean)
    .map(d => path.join(d, 'Duplex_extracted.db')).find(f => fs.existsSync(f) && fs.statSync(f).size >= 1e6);
  if (!src) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdff_')), f = path.join(dir, 'fixture.db');
  fs.copyFileSync(src, f);
  const d = new Database(f);
  const c = d.prepare('SELECT guid, center_x x, center_y y, center_z z FROM element_transforms WHERE center_x IS NOT NULL ORDER BY guid LIMIT 3').all();
  d.exec("CREATE TABLE IF NOT EXISTS drawn_walk_line(sheet TEXT, piece INTEGER, x0 REAL, y0 REAL, z0 REAL, x1 REAL, y1 REAL, z1 REAL, width_drawn_mm REAL, system TEXT, basis TEXT, label TEXT);" +
    "CREATE TABLE IF NOT EXISTS drawn_walk_marker(sheet TEXT, item INTEGER, kind TEXT, x REAL, y REAL, z REAL, basis TEXT, label TEXT, ifc_class TEXT, object_type TEXT);" +
    "CREATE TABLE IF NOT EXISTS element_pset_common (guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT, PRIMARY KEY (guid, pset, name));");
  const L = d.prepare('INSERT INTO drawn_walk_line VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  L.run('F', 1, c[0].x, c[0].y, c[0].z, c[1].x, c[1].y, c[1].z, null, 'supply', 'void-middle', null);
  L.run('F', 2, c[1].x, c[1].y, c[1].z, c[2].x, c[2].y, c[2].z, null, 'supply', 'void-middle', null);
  d.prepare('INSERT INTO drawn_walk_marker VALUES (?,?,?,?,?,?,?,?,?,?)').run('F', 1, 'cabinet', c[2].x, c[2].y, c[2].z, 'owner-stated', 'cabinet', 'IfcFireSuppressionTerminal', 'FIRECABINET');
  const g = d.prepare('SELECT guid FROM elements_meta ORDER BY guid').all().map(r => r.guid).filter((_, i) => i % 4 === 0);
  const P = d.prepare("INSERT OR REPLACE INTO element_pset_common VALUES (?, 'BIMOOTB_Walk', 'Provenance', 'band', 'witness fixture')");
  d.transaction(() => g.forEach(x => P.run(x)))();
  d.close();
  log('§W-DFF fixture db=Duplex_extracted.db (copy) lines=2 markers=1 bandRows=' + g.length);
  return f;
}

// In-page: hidden-set guids whose TM slot is visible, read the __tmSnapshotVisible way (single mesh visible / batched slot / instanced non-zero matrix).
const COUNT_FN = `(function () {
  var s = window.__tmSnapshotVisible ? window.__tmSnapshotVisible() : null; if (!s) return null;
  var A = window.APP, H = new Set(A.dbQuery("SELECT guid FROM element_pset_common WHERE pset='BIMOOTB_Walk' AND name='Provenance' AND value NOT LIKE 'drawn:%'").map(function (r) { return r[0]; }));
  var vis = new Set(s.mesh), k; for (k in s.batched) for (var g in s.batched[k]) if (s.batched[k][g]) vis.add(g); for (k in s.instanced) for (var g2 in s.instanced[k]) if (s.instanced[k][g2]) vis.add(g2);
  var hv = 0; H.forEach(function (g) { if (vis.has(g)) hv++; });
  return { hidden: H.size, hiddenVisible: hv, visible: vis.size, key: Array.from(vis).sort().join(',').length + ':' + vis.size };
})()`;

(async () => {
  const DB = PROBE || fixture();
  if (!DB) { incon('ALL', 'no fixture: buildings/Duplex_extracted.db absent or a stub'); log('§W-DRAWN-FILM-FRAME INCONCLUSIVE'); return; }
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u === '/__wdff/model.db' ? DB : path.join(ROOT, u.replace(/^\/+/, ''));
    if (f !== DB && !f.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'wdff-prof-'));
  const br = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--js-flags=--max-old-space-size=8192'] });
  const errs = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 720 });
    pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
    pg.on('console', m => { const t = m.text(); if (/§(TM_ISOLATE|DRAWN-|FINDINGS_CEASE_3D|FILM_LAYER)/.test(t)) log('  [page] ' + t.slice(0, 300)); });
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=/__wdff/model.db', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await pg.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && typeof window.APP.drawnServicesEnable === 'function', { timeout: 900000, polling: 1000 });
    await pg.evaluate(async () => { await window.APP.drawnServicesEnable(true); });
    const tmOk = await pg.evaluate(async () => window.tmActivateForBake ? await window.tmActivateForBake() : false);
    if (!tmOk) { incon('P0', 'no Time Machine timeline (tmActivateForBake false)'); throw new Error('stop'); }
    const span = await pg.evaluate(() => { const s = window.tmGetState ? window.tmGetState() : null; return s; });
    const at = async (u, off) => pg.evaluate(async (u, off, F) => {
      const st = window.tmGetState(); window.APP.__tmIsolateOff = !!off; window.__forceFull = true;
      window.tmSetCursor(st.projectStart + u * (st.projectEnd - st.projectStart)); await new Promise(r => setTimeout(r, 300));
      const c = eval(F); window.APP.__tmIsolateOff = false; return c; }, u, off, COUNT_FN);
    // P0 — the measurement.
    const p0 = []; for (const u of FR) p0.push(await at(u, false));
    log('§W-DFF P0 ' + JSON.stringify(p0.map((c, i) => ({ u: FR[i], hiddenVisible: c && c.hiddenVisible, hidden: c && c.hidden, visible: c && c.visible }))));
    if (!p0[0] || !p0[0].hidden) incon('P0', 'hidden set is empty (no non-drawn BIMOOTB_Walk rows): nothing judged');
    else if (!p0.some(c => c.visible > 0)) incon('P0', 'the build-up shows nothing at any sampled cursor: nothing judged');
    else ok('P0 hidden guids stay hidden through the build-up (drawn-only isolate active)', p0.every(c => c.hiddenVisible === 0),
      'hiddenVisible per fraction ' + p0.map(c => c.hiddenVisible).join('/') + ' of ' + p0[0].hidden + ' (main: >0 = §7.2 defect proven)');
    if (PROBE) { log('§W-DRAWN-FILM-FRAME probe done (P0 only)'); throw new Error('stop'); }
    // P2 RED — the AND switched off: the defect returns.
    const p2 = []; for (const u of FR) p2.push(await at(u, true));
    const hasHook = await pg.evaluate(() => /__tmIsolateOff/.test(String(window.__timeMachineParts && window.__timeMachineParts.render)));
    if (!hasHook) incon('P2', 'no __tmIsolateOff switch in tm_render (the fix is not on this tree)');
    else ok('P2 RED: with the AND off, hidden guids show again', p2.some(c => c.hiddenVisible > 0), 'hiddenVisible ' + p2.map(c => c.hiddenVisible).join('/'));
    // P1 — no isolate: the build-up is unchanged with the AND on vs off.
    await pg.evaluate(() => window.APP.filterByGuids(null));
    const p1a = [], p1b = []; for (const u of FR) { p1a.push(await at(u, false)); p1b.push(await at(u, true)); }
    ok('P1 no isolate active: build-up snapshot identical with the AND on and off', p1a.every((c, i) => c.key === p1b[i].key && c.visible === p1b[i].visible),
      'visible per fraction ' + p1a.map(c => c.visible).join('/') + ' vs ' + p1b.map(c => c.visible).join('/'));
    await pg.evaluate(() => window.APP.drawnOnlyView(true));
    // C1/C2 — the ending-orbit cease.
    const C = await pg.evaluate(() => {
      const A = window.APP, T = window.THREE, cz = A.__cease3DProbe; if (typeof cz !== 'function') return null;
      const mk = n => { const m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshBasicMaterial({ depthTest: false })); m.name = n; A.scene.add(m); return m; };
      const un = mk('witnessUnregistered'), sg = mk('witnessSignage'); if (A.filmLayer) A.filmLayer('measure.datum', sg);
      const ours = () => { const o = []; A.scene.traverse(x => { if (/^drawnServices/.test(x.name || '')) o.push(x); }); return o; };
      const run = off => { ours().forEach(o => { o.visible = true; }); un.visible = true; sg.visible = true; A._cease3DSeen = {}; A._cease3DKeptSeen = 0;
        A.__ceaseSubjectOff = !!off; A._findingsHudSuppress = true; cz(); A._findingsHudSuppress = false; A.__ceaseSubjectOff = false;
        return { ours: ours().length, oursVisible: ours().filter(o => o.visible).length, un: un.visible, sg: sg.visible }; };
      const r = { c1: run(false), c2: run(true) }; [un, sg].forEach(o => { A.scene.remove(o); o.geometry.dispose(); o.material.dispose(); });
      ours().forEach(o => { o.visible = true; }); return r; });
    if (!C) incon('C1', 'no APP.__cease3DProbe hook on this tree');
    else {
      ok('C1 cease keeps the drawn services, still hides an unregistered and a signage depthTest:false object', C.c1.ours > 0 && C.c1.oursVisible === C.c1.ours && !C.c1.un && !C.c1.sg, JSON.stringify(C.c1));
      ok('C2 RED: subject list emptied -> the drawn services are hidden too', C.c2.ours > 0 && C.c2.oursVisible === 0, JSON.stringify(C.c2));
    }
    // F1 — the frame line.
    const F = await pg.evaluate(async () => { const A = window.APP; if (typeof A.drawnServicesFrame !== 'function') return null;
      const st = window.tmGetState(), go = async off => { A.__tmIsolateOff = !!off; window.__forceFull = true; window.tmSetCursor(st.projectStart + 0.75 * (st.projectEnd - st.projectStart)); await new Promise(r => setTimeout(r, 300)); const s = A.drawnServicesFrame(7); A.__tmIsolateOff = false; return s; };
      return { on: await go(false), off: await go(true) }; });
    if (!F) incon('F1', 'no APP.drawnServicesFrame on this tree');
    else {
      const m = s => /visible=(\d+)\/(\d+) hiddenGuidVisible=(\d+)\/(\d+)/.exec(s || '');
      const a = m(F.on), b = m(F.off); log('§W-DFF F1 on="' + F.on + '" off="' + F.off + '"');
      ok('F1 frame line: overlay all visible and 0 hidden guids visible; RED with the AND off it counts them', !!a && !!b && a[1] === a[2] && +a[2] > 0 && a[3] === '0' && +b[3] > 0, (F.on || '') + ' | ' + (F.off || ''));
    }
  } catch (e) { if (e.message !== 'stop') { log('§W-DFF CRASH ' + (e.stack || e)); fail++; } }
  finally { await br.close(); srv.close(); }
  log('§W-DFF pageErrors=' + errs.length + (errs.length ? ' first=' + errs[0] : ''));
  const v = fail ? 'FAIL' : (pass ? (inc ? 'PASS-WITH-INCONCLUSIVE' : 'PASS') : 'INCONCLUSIVE');
  log('§W-DRAWN-FILM-FRAME ' + v + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
})();
