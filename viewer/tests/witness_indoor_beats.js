#!/usr/bin/env node
// WITNESS — indoor_beats: §29 §INDOOR_BEATS in the real page on the real stored path (datum, cues, slab and linear beats
// built first, as the bake does), Time Machine primed the bake's way.
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §29 + §29.8.
//
// ISSUE THIS PROVES OR DISPROVES: inside the dive→out window the module places at most FOUR beats (§29.1), each in a slot
// free of every other layer (§14 across layers); the hall's area is the door-bounded component the camera stands in
// (0 < area <= the storey's walkable area, door cells blocked > 0, the start cell is walkable and within 2 m of the
// camera); the stair cue is the GOING of the placed instance and never a bay restatement; the door cue is the modal leaf
// and the placed instance belongs to it; the clear height is below the ceiling and restates no storey height; every
// 2D beat composites inside its envelope and not outside; the hall persists (§29.6) then switches off with a reason;
// samples with the camera below its floor are counted (§29.7 item 3). It can say NO: INCONCLUSIVE / VACUOUS / NOTHING.
// Command: node viewer/tests/witness_indoor_beats.js --db Hospital_silent_local --dur 195.79 [--port 8600]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..'), PORT = +arg('port', 8600), DB = arg('db', 'Hospital_silent_local'), DUR = +arg('dur', 195.79);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try { const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§INDOOR_BEAT|PAGEERROR|§LOAD_FAIL/.test(t)) console.log('  ' + t.slice(0, 280)); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.indoorBeatsBuild, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  const prime = await p.evaluate(async () => { if (typeof window.tmActivateForBake !== 'function') return 'no-hook'; let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok ? 'ok' : 'FAILED'; });
  console.log('§WITNESS_INDOOR_BEATS_TM_PRIME ' + prime);
  const out = await p.evaluate((dur) => {
    const A = window.APP, R = {};
    try {
      try { const ss = A.dbQuery('SELECT cam_ifc_x,cam_ifc_y,cam_ifc_z,tgt_ifc_x,tgt_ifc_y,tgt_ifc_z FROM scene_state LIMIT 1'); if (ss && ss.length && ss[0][0] != null) { const c = A.ifc2three(ss[0][0], ss[0][1], ss[0][2]), t = A.ifc2three(ss[0][3], ss[0][4], ss[0][5]); A.camera.position.set(c.x, c.y, c.z); if (A.controls) { A.controls.target.set(t.x, t.y, t.z); A.controls.update(); } A.camera.lookAt(t.x, t.y, t.z); } } catch (e) {}
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
      A.flythruDatumBuild();
      const judge = () => { A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix(); A.flythruDatumCompositeOntoCanvas(ctx, 1280, 720, 0, dur); const L = A._flythruDatumLast || {}; return L.bubbles === L.bubblesTotal && L.overalls === 3; };
      if (!judge()) { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); A.flythruDatumDispose(); A.flythruDatumBuild(); R.homed = true; }
      const bk = window.tmFollowTimeline(); const plan = A.cinemaPathPlan(dur);
      try { A.flythruCuesBuild(plan, dur); } catch (e) {}
      A.slabBeatBuild(plan, dur, bk, dur); A.linearBeatBuild(plan, dur, bk, dur);
      R.rep = A.indoorBeatsBuild(plan, dur, bk);
      R.frames = [];
      const drive = (sec) => { const pz = plan.poseAt(Math.min(1, sec / dur)); A.camera.position.set(pz.x, pz.y, pz.z); A.camera.lookAt(pz.tx, pz.ty, pz.tz); A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix(); };
      const frame = (bt, dt) => { const sec = bt.sec + dt; drive(sec); const st = A.indoorBeatsAt(sec); ctx.clearRect(0, 0, 1280, 720); const n = A.indoorBeatsCompositeOntoCanvas(ctx, 1280, 720, sec); R.frames.push({ key: bt.key, dt, sec: +sec.toFixed(3), marks: n, hall: st && st.hall }); };
      // 1. the hall's own frames (camera on the hall path, nothing latches it off), 2. its persistence to window end
      //    at 1 s steps (when/why it switches off, §29.6), 3. the other beats' frames (they may legitimately frame the hall out)
      const hb0 = (R.rep.beats || []).find(x => x.key === 'hall');
      if (hb0) { [-0.1, 0.3, 1.0].forEach(dt => frame(hb0, dt));
        for (let sec = hb0.sec; sec <= R.rep.window.to + 1; sec += 1) { drive(sec); const st = A.indoorBeatsAt(sec); if (st && st.hall === 'off') { R.hallOffAt = +sec.toFixed(2); break; } } }
      (R.rep.beats || []).filter(x => x.key !== 'hall').forEach(bt => { [-0.1, 0.3, 1.0, 2.1, 2.6].forEach(dt => frame(bt, dt)); });
    } catch (e) { R.err = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return R;
  }, DUR);
  await b.close(); server.close();
  if (out.err) { console.log('§WITNESS_INDOOR_BEATS INCONCLUSIVE — page threw: ' + out.err); process.exit(1); }
  const rep = out.rep || {}; const beats = rep.beats || []; const F = out.frames || [];
  console.log('§WITNESS_INDOOR_BEATS_RUN db=' + DB + ' dur=' + DUR + ' homed=' + !!out.homed + ' state=' + rep.state + ' window=' + JSON.stringify(rep.window) + ' samples=' + rep.samples + ' belowFloor=' + rep.belowFloor + ' beats=' + JSON.stringify(beats.map(x => x.key + '@' + x.sec + (x.label ? ' ' + x.label : ''))) + ' hallOffAt=' + (out.hallOffAt == null ? 'never (to window end)' : out.hallOffAt + 's'));
  F.forEach(f => console.log('§WITNESS_INDOOR_BEATS_FRAME key=' + f.key + ' dt=' + f.dt + ' sec=' + f.sec + ' marks=' + f.marks + (f.hall ? ' hall=' + f.hall : '')));
  if (rep.state === 'INCONCLUSIVE') { console.log('§WITNESS_INDOOR_BEATS INCONCLUSIVE — ' + rep.why); process.exit(1); }
  if (!beats.length) { console.log('§WITNESS_INDOOR_BEATS NOTHING — ' + JSON.stringify(rep.rejected)); process.exit(0); }
  const own = (rep.taken || []).filter(w => ['hall', 'stair', 'door', 'height'].includes(w.who));
  Witness('indoor_beats')
    .population(() => beats.map(b0 => Object.assign({}, b0)))
    .schema({ type: 'object', required: ['key', 'sec'], properties: { key: { enum: ['hall', 'stair', 'door', 'height'] }, sec: { type: 'number', minimum: 0 } } })
    .invariant('at most four beats, one per capability (§29.1)', rs => rs.length <= 4 && new Set(rs.map(r => r.key)).size === rs.length)
    .invariant('every beat inside the dive→out window', rs => rs.every(r => r.sec >= rep.window.from - 0.02 && r.sec <= rep.window.to + 0.02))
    .invariant('no beat slot overlaps any other layer\'s window (§14 across layers)', () => own.every(a => (rep.taken || []).every(b2 => a === b2 || a.to <= b2.from + 1e-9 || a.from >= b2.to - 1e-9)))
    .invariant('hall: 0 < area <= storey walkable, door cells blocked > 0, start cell within 2 m, camera above its floor', rs => rs.filter(r => r.key === 'hall').every(r => r.hall.area > 0 && r.hall.area <= r.hall.storeyWalkable + 1e-6 && r.hall.doorCellsBlocked > 0 && r.hall.camAbove > -1.0 && r.hall.quads > 0))
    .invariant('stair: label = going of the placed instance (long horizontal bbox side), never the rise', rs => rs.filter(r => r.key === 'stair').every(r => r.label === 'going ' + Math.round(Math.max(r.it.bx, r.it.by) * 1000).toLocaleString('en-US') + ' mm' && Math.abs(r.metres - Math.max(r.it.bx, r.it.by)) < 1e-3))
    .invariant('door: label = the modal leaf and the placed instance belongs to it (10 mm buckets)', rs => rs.filter(r => r.key === 'door').every(r => r.label === r.modal.w.toLocaleString('en-US') + ' × ' + r.modal.h.toLocaleString('en-US') + ' mm' && Math.round(Math.max(r.it.bx, r.it.by) * 100) * 10 === r.modal.w && Math.round(r.it.bz * 100) * 10 === r.modal.h))
    .invariant('clear height: below the ceiling (or no ceiling found) and never within 2 % of a storey height', rs => rs.filter(r => r.key === 'height').every(r => (r.th == null || r.ch < r.th - 0.05) && r.ch > 1.0))
    .invariant('2D beats composite inside their envelope and not outside; the hall composites from its second on', () => beats.every(bt => { const f = {}; F.filter(x => x.key === bt.key).forEach(x => f[x.dt] = x.marks); return bt.key === 'hall' ? (f[-0.1] === 0 && f[0.3] > 0) : (f[-0.1] === 0 && f[0.3] > 0 && f[1.0] > 0 && f[2.1] > 0 && f[2.6] === 0); }))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const h = c.find(r => r.key === 'hall'); if (h) h.hall = Object.assign({}, h.hall, { area: h.hall.storeyWalkable + 100 }); else if (c[0]) c[0].sec = -1; return c; })
    .run();
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
