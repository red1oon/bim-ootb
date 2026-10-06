#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §LONG_SECTION / §CROSS_SECTION (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §NEXT_WAVE).
// Read the log after every run — the exit code is not evidence. Scope: viewer/civil_sections.js ONLY.
// ISSUES PROVEN / DISPROVEN:
//  (1) the long-section s axis is strictly monotonic and spans the route;
//  (2) the sampled road / ground / drain z equals an INDEPENDENT raycast (own Raycaster over every scene mesh, own
//      discipline filter) at 5 random samples per series within 1 cm;
//  (3) a real click event on the chart canvas moves the camera to within 1 m of the route at that chainage;
//  (4) the cross-section plane normal . route tangent (tangent recomputed here from the polyline) >= 0.999;
//  (5) the elements cut at s == the elements whose bbox spans the plane, the bbox RE-DERIVED here from raw merged-mesh
//      vertices (not from A._mergedMeta), and the set is neither empty nor everything (else INCONCLUSIVE);
//  (6) a building (MODEL=building) gets no button/panel and the civil checks are VACUOUS, never PASS;
//  (7) §SECTION_CIVIL_MODES: Long/Cross are axis buttons INSIDE the Cut section tool (civil -> 5 buttons, building -> X/Y/Z only),
//      the panel slider is the chainage scrubber, no floating 'civil-section-btn' exists, X/Y/Z after Cross leaves ONE clip plane;
//  (9) §PROFILE_LENS v1: precompute once (ms/heap/samples, §PROFILE_LENS_PRECOMPUTE); profile arrays == independent raycast (5 random s, 1 cm);
//      lens diameter = canvas width/3 (cap = height); rim drag moves the lens + s0 = nearest route point under its centre; inside drag moves s0 by
//      dx*span/D (+-1 m); wheel / ctrl+wheel / two-pointer pinch change span within [50 m, route len]; ALL of hover/drag/wheel/pinch = 0 raycasts and 0 camera
//      motion; outside the lens the 3D wheel still moves the camera; PNG blob is image/png, non-zero, D x D; old panel chart absent; PDF tab has
//      ceil(len/100) sheets whose 10 m data-band rows equal the precomputed arrays; §PROFILE_LENS_PERF lens-on median <= lens-off median + 2 ms.
//  (8) RED=1 ROOT=<origin/main checkout> runs the same checks against the OLD code and must FAIL (floating button, no Long/Cross).
// Env: MODEL=civil|building (default civil) · BLD · BLD_DIR · PORT · LOG · RED=1 · SEED
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = process.env.ROOT || path.resolve(path.join(__dirname, '..', '..'));
const MODEL = process.env.MODEL || 'civil', RED = process.env.RED === '1';
const BLD = process.env.BLD || (MODEL === 'civil' ? 'CivilWorks' : 'Duplex_extracted');
const BLD_DIR = process.env.BLD_DIR || (MODEL === 'civil' ? path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC') : '/home/red1/bim-ootb/buildings');
const PORT = +(process.env.PORT || 8591), LOG = process.env.LOG || '/tmp/witness_civil_sections_' + MODEL + (RED ? '_red' : '') + '.log';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const alt = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(alt)) fp = alt; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wcs-')), protocolTimeout: 1800000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const fin = async (code) => { fs.writeFileSync(LOG, out.join('\n') + '\n'); try { await b.close(); } catch (e) {} server.close(); process.exit(code); };
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  p.on('console', m => { const t = m.text(); if (/§(LONG_SECTION|PROFILE_LENS|CROSS_SECTION|CIVIL_MODEL|ALTC_HIGHWAY|CIVIL_ROUTE)/.test(t)) log('  [con] ' + t); });
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  let ok = false;
  for (let i = 0; i < 900 && !ok; i++) { await sleep(1000); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
  if (!ok) { log('§WITNESS_CIVIL_SECTIONS INCONCLUSIVE — model never ready'); return fin(2); }
  await sleep(4000);   // let the 1.5 s UI poll run at least twice
  const pre = await p.evaluate(() => { const bs = [...document.querySelectorAll('#sec-axes button')]; return { civil: !!APP.isCivilModel(), floatBtn: !!document.getElementById('civil-section-btn'),
    floatPanel: !!document.getElementById('civil-section-panel'), api: typeof APP.civilLongSection === 'function', modes: !!APP.sectionModes }; });
  // open the REAL Cut section tool, read its axis buttons
  const axes = async () => p.evaluate(() => { if (!APP.sectionOn) APP.toggleSection(); APP.refreshSectionModes && APP.refreshSectionModes();
    return [...document.querySelectorAll('#sec-axes button')].map(b => b.id.replace('sec-axis-', '')).sort(); });
  const btns = await axes();
  log('  [state] ' + JSON.stringify(pre) + ' buttons=' + JSON.stringify(btns) + ' MODEL=' + MODEL + ' RED=' + RED);
  const checks = []; const add = (n, v, d) => { checks.push([n, !!v]); log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
  const WANT_B = ['x', 'y', 'z'], WANT_C = ['cross', 'long', 'x', 'y', 'z'];

  if (MODEL === 'building') {
    add('building: exactly 3 axis buttons X/Y/Z', JSON.stringify(btns) === JSON.stringify(WANT_B), JSON.stringify(btns));
    add('building: no floating civil button / panel / chart canvas in DOM', !pre.floatBtn && !pre.floatPanel && !(await p.evaluate(() => !!document.getElementById('civil-section-canvas') || !!document.getElementById('civil-lens'))));
    const nul = await p.evaluate(() => typeof APP.civilLongSection === 'function' ? APP.civilLongSection() === null && APP.civilCrossSection(100) === null : 'api-absent');
    add('building: civilLongSection()/civilCrossSection() return null (gate closed)', nul === true, 'got=' + nul);
    const fail = checks.filter(c => !c[1]).length;
    log('§WITNESS_CIVIL_SECTIONS_BUILDING ' + (fail ? 'FAIL' : 'VACUOUS — gate closed, no civil checks judged (NOT a PASS)'));
    return fin(fail ? 1 : 0);
  }
  if (RED) {
    add('civil: Long+Cross buttons inside the Cut tool (5 axis buttons)', JSON.stringify(btns) === JSON.stringify(WANT_C), JSON.stringify(btns));
    add('no floating civil-section-btn in DOM', !pre.floatBtn, 'floatBtn=' + pre.floatBtn);
    add('Profile lens API present (APP.civilProfilePrepare) and no old panel chart canvas', await p.evaluate(() => typeof APP.civilProfilePrepare === 'function' && !document.getElementById('civil-section-canvas')), 'old code has neither');
    const fail = checks.filter(c => !c[1]).length;
    log('§WITNESS_CIVIL_SECTIONS RED-CONTROL ' + (fail ? 'FAIL (old code: floating button / no Long-Cross, as expected on origin/main)' : 'UNEXPECTED PASS — control is not red'));
    return fin(fail ? 1 : 3);
  }
  add('civil: exactly 5 axis buttons X/Y/Z/Long/Cross in the Cut tool', JSON.stringify(btns) === JSON.stringify(WANT_C), JSON.stringify(btns));
  add('no floating civil-section-btn / civil-section-panel in the DOM', !pre.floatBtn && !pre.floatPanel);
  if (!pre.civil || !pre.api) { log('§WITNESS_CIVIL_SECTIONS INCONCLUSIVE — not a civil model / api absent'); return fin(2); }

  // ---- long section data: monotonic + independent raycast ----
  const R = await p.evaluate((seed) => {
    const A = APP, t0 = performance.now(), ls = A.civilLongSection({ fresh: true }), ms = performance.now() - t0;
    let mono = true; for (let i = 1; i < ls.s.length; i++) if (!(ls.s[i] > ls.s[i - 1])) mono = false;
    const cnt = k => ls[k].filter(v => v != null).length;
    const rc = new THREE.Raycaster(); rc.firstHitOnly = false;
    const meshes = A.collectMeshes(o => o.isMesh), discOf = {};
    A.dbQuery('SELECT guid, discipline FROM elements_meta').forEach(r => { discOf[r[0]] = r[1]; });
    const guidOf = h => h.object.isBatchedMesh ? A.guidMap[h.object.id + '_' + h.batchId] : (h.object.isInstancedMesh && A._instanceMeta[h.object.id] ? (A._instanceMeta[h.object.id][h.instanceId] || {}).guid : null);
    const ind = (x, z, disc, up) => {
      rc.set(new THREE.Vector3(x, up ? -5000 : 5000, z), new THREE.Vector3(0, up ? 1 : -1, 0)); rc.near = 0; rc.far = 10000;
      const h = rc.intersectObjects(meshes, false);
      for (const x2 of h) if (discOf[guidOf(x2)] === disc) return x2.point.y; return null;
    };
    let st = seed >>> 0; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const res = {};
    [['road', 'ROAD', false], ['ground', 'EARTHWORK', false], ['drain', 'DRAINAGE', true]].forEach(([k, d, up]) => {
      const idx = ls.s.map((_, i) => i).filter(i => ls[k][i] != null), rows = [];
      for (let q = 0; q < 5 && idx.length; q++) {
        const i = idx[Math.floor(rnd() * idx.length)], pt = A.civilRouteAt(ls.s[i]), v = ind(pt.x, pt.z, d, up);
        rows.push({ i, s: +ls.s[i].toFixed(1), prod: ls[k][i], indep: v, err: v == null ? null : Math.abs(v - ls[k][i]) });
      }
      res[k] = rows;
    });
    return { n: ls.n, ds: ls.ds, len: ls.len, mono, first: ls.s[0], last: ls.s[ls.s.length - 1], cnt: { road: cnt('road'), ground: cnt('ground'), drain: cnt('drain') }, ms, res,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  }, +(process.env.SEED || 20261006));
  log('  [longsection] n=' + R.n + ' ds=' + R.ds.toFixed(2) + ' len=' + R.len.toFixed(1) + ' ms=' + R.ms.toFixed(0) + ' heapMB=' + R.heapMB + ' counts=' + JSON.stringify(R.cnt));
  add('s strictly monotonic, starts at 0, ends at route length', R.mono && R.first === 0 && Math.abs(R.last - R.len) < 1e-6 && R.n >= 50, 'n=' + R.n);
  add('population non-vacuous: road samples > 0', R.cnt.road > 0, 'road=' + R.cnt.road + ' ground=' + R.cnt.ground + ' drain=' + R.cnt.drain);
  let judged = 0;
  Object.keys(R.res).forEach(k => {
    const rows = R.res[k]; if (!rows.length) { log('  VACUOUS series ' + k + ' (no non-null samples)'); return; }
    judged += rows.length;
    add(k + ': sampled z == independent raycast at ' + rows.length + ' random s within 1 cm', rows.every(r => r.err != null && r.err <= 0.01), JSON.stringify(rows.map(r => [r.s, +(r.prod || 0).toFixed(3), r.err == null ? null : +r.err.toFixed(5)])));
  });

  // ---- LONG mode = the lens: precompute once (§PROFILE_LENS_PRECOMPUTE), then slice-only gestures ----
  const P0 = await p.evaluate(async () => {
    const A = APP, h0 = performance.memory ? performance.memory.usedJSHeapSize : 0, r0 = A._civilRayCount || 0, t0 = performance.now();
    document.getElementById('sec-axis-long').click();
    const lens = document.getElementById('civil-lens'), early = !!lens && lens.style.display === 'block' && !A.civilProfile();
    const P = await A.civilProfilePrepare(), ms = performance.now() - t0;
    const again0 = A._civilRayCount; await A.civilProfilePrepare();
    let finite = 0; for (let i = 0; i < P.n; i++) if (P.road[i] === P.road[i]) finite++;
    return { early, n: P.n, len: P.len, ds: P.ds, ms, rays: (A._civilRayCount || 0) - r0, reuseRays: A._civilRayCount - again0, finiteRoad: finite,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, heapDeltaMB: performance.memory ? Math.round((performance.memory.usedJSHeapSize - h0) / 1048576) : null };
  });
  log('§PROFILE_LENS_PRECOMPUTE(witness) ' + JSON.stringify(P0));
  add('precompute: "preparing profile" state shown first, 1 m samples == floor(len)+1, road samples non-vacuous', P0.early && P0.ds === 1 && P0.n === Math.floor(P0.len) + 1 && P0.finiteRoad > 0, 'n=' + P0.n + ' finiteRoad=' + P0.finiteRoad);
  add('precompute runs ONCE: second prepare() casts 0 rays', P0.reuseRays === 0, 'ms=' + P0.ms.toFixed(0) + ' rays=' + P0.rays);
  const PV = await p.evaluate((seed) => {
    const A = APP, P = A.civilProfile(), rc = new THREE.Raycaster(); rc.firstHitOnly = false;
    const meshes = A.collectMeshes(o => o.isMesh), discOf = {};
    A.dbQuery('SELECT guid, discipline FROM elements_meta').forEach(r => { discOf[r[0]] = r[1]; });
    const guidOf = h => h.object.isBatchedMesh ? A.guidMap[h.object.id + '_' + h.batchId] : (h.object.isInstancedMesh && A._instanceMeta[h.object.id] ? (A._instanceMeta[h.object.id][h.instanceId] || {}).guid : null);
    const ind = (x, z, disc, up) => { rc.set(new THREE.Vector3(x, up ? -5000 : 5000, z), new THREE.Vector3(0, up ? 1 : -1, 0)); rc.near = 0; rc.far = 10000;
      for (const h of rc.intersectObjects(meshes, false)) if (discOf[guidOf(h)] === disc) return h.point.y; return null; };
    let st = seed >>> 0; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; }, out = {};
    [['road', 'ROAD', false], ['ground', 'EARTHWORK', false], ['drain', 'DRAINAGE', true]].forEach(([k, d, up]) => {
      const idx = []; for (let i = 0; i < P.n; i++) if (P[k][i] === P[k][i]) idx.push(i); const rows = [];
      for (let q = 0; q < 5 && idx.length; q++) { const i = idx[Math.floor(rnd() * idx.length)], pt = A.civilRouteAt(i), v = ind(pt.x, pt.z, d, up); rows.push({ s: i, prod: P[k][i], indep: v, err: v == null ? null : Math.abs(v - P[k][i]) }); }
      out[k] = rows; });
    return out;
  }, +(process.env.SEED || 20261006));
  Object.keys(PV).forEach(k => { const rows = PV[k]; if (!rows.length) { log('  VACUOUS series ' + k); return; } judged += rows.length;
    add('profile ' + k + ': 1 m array == independent raycast at ' + rows.length + ' random s within 1 cm', rows.every(r => r.err != null && r.err <= 0.01), JSON.stringify(rows.map(r => [r.s, +r.prod.toFixed(3), r.err == null ? null : +r.err.toFixed(5)]))); });

  const L = await p.evaluate(async () => {
    const A = APP, r = A.civilDriveRoute(), len = A.civilRouteAt(0).len;
    const lens = document.getElementById('civil-lens'), sl = document.getElementById('section-slider');
    const nearest = () => { const cam = A.camera.position; let best = Infinity, cum = 0, bestS = 0;
      for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, L2 = bx * bx + by * by + bz * bz, segH = Math.hypot(bx, bz);
        const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((cam.x - a.x) * bx + (cam.y - a.y) * by + (cam.z - a.z) * bz) / L2)) : 0;
        const d = Math.hypot(cam.x - (a.x + u * bx), cam.y - (a.y + u * by), cam.z - (a.z + u * bz)); if (d < best) { best = d; bestS = cum + u * segH; } cum += segH; }
      return { d: best, s: bestS }; };
    const out = { len, sliderMax: +sl.max, sliderMin: +sl.min, lensShown: lens.style.display === 'block', oldChart: !!document.getElementById('civil-section-canvas'), scr: [],
      clipLong: A.collectMeshes(o => o.isMesh).filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length).length };
    for (const f of [0.2, 0.5, 0.8]) { sl.value = String(len * f); sl.dispatchEvent(new Event('input', { bubbles: true }));
      const want = +sl.value, n = nearest(); out.scr.push({ want, atCam: n.s, dist: n.d, cur: A._civilLens().s0, val: document.getElementById('section-val').textContent }); }
    return out;
  });
  log('  [long] ' + JSON.stringify(L));
  add('Long: lens shown, old panel chart canvas ABSENT from DOM, slider = chainage 0..route length, no clip plane left on', L.lensShown && !L.oldChart && L.sliderMin === 0 && Math.abs(L.sliderMax - L.len) <= 1 && L.clipLong === 0, 'max=' + L.sliderMax + ' len=' + L.len.toFixed(1) + ' clipped=' + L.clipLong);
  add('Long: scrub to 3 chainages -> camera within 1 m of route at that chainage (+-1 m), lens s0 follows', L.scr.every(x => x.dist <= 1 && Math.abs(x.atCam - x.want) <= 1 && Math.abs(x.cur - x.want) <= 1), JSON.stringify(L.scr.map(x => [+x.want.toFixed(1), +x.atCam.toFixed(2), +x.dist.toFixed(4)])));
  add('Long: scrubber label reads "chainage ... (inferred)"', L.scr.every(x => /chainage \d+ m of \d+ m \(inferred\)/.test(x.val)), L.scr[0].val);

  // ---- lens gestures with REAL mouse input; every one asserts 0 raycasts and (inside the lens) 0 camera motion ----
  const st = () => p.evaluate(() => { const A = APP, l = A._civilLens(), r = document.getElementById('civil-lens').getBoundingClientRect(), b = A.renderer.domElement.getBoundingClientRect(), c = A.camera;
    return { s0: l.s0, span: l.span, D: l.D, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, cw: b.width, ch: b.height, rw: A.renderer.domElement.width, bl: b.left, bt: b.top,
      rays: A._civilRayCount, cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w], len: A.civilRouteAt(0).len }; });
  const same = (a, b) => a.cam.every((v, i) => v === b.cam[i]);
  const g0 = await st();
  add('lens diameter = renderer canvas width / 3 (+-1 px), capped at canvas height', Math.abs(g0.w - Math.min(g0.cw / 3, g0.ch)) <= 1 && Math.abs(g0.w - g0.rw / 3) <= 1, 'lens=' + g0.w + ' canvasCss=' + g0.cw + ' canvasPx=' + g0.rw + ' h=' + g0.ch);
  // hover
  await p.mouse.move(g0.cx, g0.cy); for (let i = 1; i <= 8; i++) await p.mouse.move(g0.cx + i * 6, g0.cy + i * 3); const g1 = await st();
  add('hover over the lens: 0 raycasts, camera unchanged', g1.rays === g0.rays && same(g0, g1), 'rays ' + g0.rays + '->' + g1.rays);
  // rim drag
  const RR = g1.D / 2; let rx = g1.cx + RR - 6, ry = g1.cy, dx = -110, dy = 70;
  await p.mouse.move(rx, ry); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(rx + dx * i / 10, ry + dy * i / 10); await p.mouse.up();
  const g2 = await st();
  const indepS = await p.evaluate((cx, cy) => { const A = APP, P = A.civilProfile(), b = A.renderer.domElement.getBoundingClientRect(), c = A.camera; c.updateMatrixWorld(); let best = 1e18, bs = null;
    const M = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    for (let i = 0; i < P.n; i++) { const v = new THREE.Vector4(P.rx[i], P.ry[i], P.rz[i], 1).applyMatrix4(M); if (v.w <= 0) continue; const nx = v.x / v.w, ny = v.y / v.w, nz = v.z / v.w; if (nz < -1 || nz > 1) continue;
      const sx = b.left + (nx * 0.5 + 0.5) * b.width, sy = b.top + (-ny * 0.5 + 0.5) * b.height, d = (sx - cx) ** 2 + (sy - cy) ** 2; if (d < best) { best = d; bs = i; } } return bs; }, g2.cx, g2.cy);
  add('rim drag: lens moved by the dragged vector (+-1.5 px), rim only', Math.abs((g2.cx - g1.cx) - dx) <= 1.5 && Math.abs((g2.cy - g1.cy) - dy) <= 1.5, 'moved=(' + (g2.cx - g1.cx).toFixed(1) + ',' + (g2.cy - g1.cy).toFixed(1) + ') want=(' + dx + ',' + dy + ')');
  add('rim drop: s0 == nearest route point (independent projection) under the lens centre (+-1 m)', indepS != null && Math.abs(g2.s0 - indepS) <= 1, 's0=' + g2.s0.toFixed(1) + ' indep=' + indepS);
  add('rim drag: 0 raycasts, camera unchanged', g2.rays === g1.rays && same(g1, g2), 'rays ' + g1.rays + '->' + g2.rays);
  // inside drag (slide along the road)
  await p.evaluate(() => { APP.sectionModes.Long.scrub(APP.civilRouteAt(0).len * 0.5); }); await sleep(300);
  const g3 = await st(); const PX = 60;
  await p.mouse.move(g3.cx, g3.cy); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(g3.cx + PX * i / 6, g3.cy + 4 * i / 6); await p.mouse.up();
  const g4 = await st(), want4 = -PX * g3.span / g3.D;
  add('inside drag: s0 changes by dragged px * span/diameter (+-1 m), lens stays put', Math.abs((g4.s0 - g3.s0) - want4) <= 1 && Math.abs(g4.cx - g3.cx) < 0.5 && Math.abs(g4.cy - g3.cy) < 0.5, 'ds=' + (g4.s0 - g3.s0).toFixed(2) + ' want=' + want4.toFixed(2));
  add('inside drag: 0 raycasts, camera unchanged', g4.rays === g3.rays && same(g3, g4), 'rays ' + g3.rays + '->' + g4.rays);
  // wheel
  await p.mouse.move(g4.cx, g4.cy); await p.mouse.wheel({ deltaY: -300 }); const g5 = await st();
  await p.mouse.wheel({ deltaY: 300 }); await p.mouse.wheel({ deltaY: 300 }); const g6 = await st();
  for (let i = 0; i < 40; i++) await p.mouse.wheel({ deltaY: 1000 }); const gW = await st();
  for (let i = 0; i < 60; i++) await p.mouse.wheel({ deltaY: -1000 }); const gN = await st();
  add('wheel inside lens: zoom in narrows, out widens, 0 raycasts, camera unchanged', g5.span < g4.span && g6.span > g5.span && gN.rays === g4.rays && same(g4, gN), 'span ' + g4.span.toFixed(1) + '->' + g5.span.toFixed(1) + '->' + g6.span.toFixed(1));
  add('wheel range: widest == whole road, narrowest == 50 m', Math.abs(gW.span - gW.len) < 1e-6 && Math.abs(gN.span - 50) < 1e-6, 'wide=' + gW.span.toFixed(1) + ' len=' + gW.len.toFixed(1) + ' narrow=' + gN.span);
  // ctrl+wheel (trackpad pinch) + two-pointer pinch (synthetic events on the lens)
  const ev = await p.evaluate(() => { const A = APP, l = A._civilLens(), cv = document.getElementById('civil-lens'), r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, c = A.camera, cam0 = c.position.toArray().join();
    l.span = 100; cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true })); const afterCtrl = l.span;
    l.span = 100; const mk = (t, id, x) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true, isPrimary: id === 11 }));
    mk('pointerdown', 11, cx - 40); mk('pointerdown', 12, cx + 40); mk('pointermove', 12, cx + 80); const afterPinch = l.span; mk('pointerup', 12, cx + 80); mk('pointerup', 11, cx - 40);
    l.span = 100; const s0 = l.s0; mk('pointerdown', 13, cx); mk('pointermove', 13, cx + 30); mk('pointerup', 13, cx + 30); const touchPan = l.s0 - s0;
    return { afterCtrl, afterPinch, touchPan, camSame: c.position.toArray().join() === cam0, rays: A._civilRayCount, D: l.D }; });
  add('ctrl+wheel (trackpad pinch) changes span (pinch-out -> narrower), clamped in range', ev.afterCtrl < 100 && ev.afterCtrl >= 50, 'span 100->' + ev.afterCtrl.toFixed(2));
  add('two-pointer pinch 80px->120px: span x(80/120) (+-1%)', Math.abs(ev.afterPinch / 100 - 80 / 120) <= 0.01, 'span=' + ev.afterPinch.toFixed(2));
  add('one-finger touch pan inside slides s0 by px*span/D; camera unchanged; 0 raycasts', Math.abs(ev.touchPan - (-30 * 100 / ev.D)) <= 1 && ev.camSame && ev.rays === gN.rays, 'ds=' + ev.touchPan.toFixed(2));
  // outside the lens: the 3D wheel still moves the camera
  const gO = await st(); const ox = gO.cx > gO.bl + gO.cw / 2 ? gO.bl + 40 : gO.bl + gO.cw - 40, oy = gO.bt + gO.ch / 2;
  await p.mouse.move(ox, oy); for (let i = 0; i < 4; i++) { await p.mouse.wheel({ deltaY: -400 }); await sleep(120); } await sleep(600); const gO2 = await st();
  add('outside the lens: 3D wheel still moves the camera (zoom)', !same(gO, gO2), 'cam ' + gO.cam.slice(0, 3).map(v => +v.toFixed(2)) + ' -> ' + gO2.cam.slice(0, 3).map(v => +v.toFixed(2)));
  // click inside = pin + camera fly
  await p.evaluate(() => { APP.sectionModes.Long.scrub(APP.civilRouteAt(0).len * 0.4); APP._civilLens().span = 100; }); await sleep(300);
  const gC = await st(); await p.mouse.click(gC.cx + 100, gC.cy);
  const gC2 = await st(), nearCam = await p.evaluate(() => { const A = APP, c = A.camera.position; const q = A.civilRouteAt(A._civilLens().s0); return { d: Math.hypot(c.x - q.x, c.y - q.y, c.z - q.z), s0: A._civilLens().s0 }; });
  const wantC = gC.s0 + (100 / gC.D) * gC.span;
  add('click inside lens: s0 = clicked chainage (+-1 m), camera flies to within 1 m of route there', Math.abs(gC2.s0 - wantC) <= 1 && nearCam.d <= 1, 's0=' + gC2.s0.toFixed(1) + ' want=' + wantC.toFixed(1) + ' camDist=' + nearCam.d.toFixed(4));
  // PNG
  const PNG = await p.evaluate(async () => { const r = await APP.civilLensPNG(true), l = APP._civilLens(); let w = null, h = null; if (r && r.blob) { const bm = await createImageBitmap(r.blob); w = bm.width; h = bm.height; }
    return r ? { type: r.blob && r.blob.type, size: r.blob && r.blob.size, name: r.name, w, h, cw: l.canvas.width, ch: l.canvas.height, s0: l.s0, span: l.span } : null; });
  log('  [png] ' + JSON.stringify(PNG));
  add('PNG: blob is image/png, non-zero, decoded size == lens canvas size, filename carries the chainage range', PNG && PNG.type === 'image/png' && PNG.size > 0 && PNG.w === PNG.cw && PNG.h === PNG.ch && PNG.name === 'profile_' + Math.round(PNG.s0 - PNG.span / 2) + '-' + Math.round(PNG.s0 + PNG.span / 2) + 'm.png', PNG && PNG.name);
  // Profile PDF tab (real click -> blob tab)
  const tgtP = new Promise(res => { const h = t => { if (t.type() === 'page' && t.url().startsWith('blob:')) { b.off('targetcreated', h); res(t); } }; b.on('targetcreated', h); setTimeout(() => res(null), 60000); });
  await p.click('#civil-profile-pdf'); const tg = await tgtP;
  const PA = await p.evaluate(() => { const P = APP.civilProfile(); return { len: P.len, n: P.n, ground: Array.from(P.ground), road: Array.from(P.road) }; });
  if (!tg) add('Profile PDF: new tab opened', false, 'no blob tab within 60 s (popup blocked?)');
  else {
    const tp = await Promise.race([tg.page(), sleep(120000).then(() => null)]); if (!tp) { add('Profile PDF: tab page attach', false, 'tg.page() timeout'); } else { await sleep(1500);
    const T = await tp.evaluate(async () => { const sheets = [...document.querySelectorAll('.sheet')]; return { sheets: sheets.length, rows: [...document.querySelectorAll('tr[data-s]')].map(r => [+r.dataset.s, r.children[1].textContent, r.children[2].textContent]),
      print: [...document.styleSheets].some(ss => [...ss.cssRules].some(r => (r.cssText || '').includes('@media print'))), page: [...document.styleSheets].some(ss => [...ss.cssRules].some(r => (r.cssText || '').includes('@page'))),
      drawn: sheets.map(s => { const c = s.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200) ink++; return ink; }),
      png: await new Promise(r => document.querySelector('.sheet canvas').toBlob(bl => r({ type: bl.type, size: bl.size }), 'image/png')), pngBtns: document.querySelectorAll('.sheet .png').length }; });
    const want = Math.ceil(PA.len / 100), zok = (txt, v) => (txt === '–' && (v == null || v !== v)) || Math.abs(parseFloat(txt) - v) <= 0.0005;
    let wantRows = 0; for (let k = 0; k < want; k++) for (let q = k * 100; q <= Math.min(PA.len, k * 100 + 100) + 1e-9 && q <= PA.n - 1; q += 10) wantRows++;
    const bad = T.rows.filter(r => !(zok(r[1], PA.ground[r[0]]) && zok(r[2], PA.road[r[0]])));
    log('  [pdf] sheets=' + T.sheets + ' want=' + want + ' rows=' + T.rows.length + ' bad=' + bad.length + ' ink=' + JSON.stringify(T.drawn.slice(0, 5)) + ' png=' + JSON.stringify(T.png));
    add('Profile PDF: sheet count = ceil(route/100)', T.sheets === want, T.sheets + ' vs ' + want);
    add('Profile PDF: every 10 m data-band row (ground z, road z) equals the precomputed array (+-0.5 mm); rows cover the road', bad.length === 0 && T.rows.length === wantRows && T.rows.length > 0, 'rows=' + T.rows.length + ' bad=' + JSON.stringify(bad.slice(0, 3)));
    add('Profile PDF: print CSS (@media print + @page) present, every sheet canvas drawn (ink > 0), per-sheet PNG button + image/png blob', T.print && T.page && T.drawn.every(x => x > 0) && T.pngBtns === want && T.png.type === 'image/png' && T.png.size > 0, 'ink0=' + T.drawn[0]);
    await tp.close(); await p.bringToFront(); }
  }

  // ---- §PROFILE_LENS_PERF: per-frame work = [lens redraw via a real pointermove pan step] + WebGL render + gl.finish, lens on vs off.
  // Measured synchronously: headless swiftshader rAF stalls 1.5-15 s at random (probed), so rAF intervals are not a usable instrument; the
  // overlay's compositor cost is therefore NOT in this number (stated limit).
  const PERF = await p.evaluate(() => { const A = APP, cv = document.getElementById('civil-lens'), r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, N = 60, gl = A.renderer.getContext();
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const mk = (ty, x) => cv.dispatchEvent(new PointerEvent(ty, { pointerId: 21, pointerType: 'mouse', clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    const brk = { draw: [], render: [] };
    // interleaved off/on iterations so machine-load noise (other sessions' browsers share this box) hits both series equally
    cv.style.display = 'block'; mk('pointerdown', cx); let x = cx; const off = [], on = [];
    for (let i = 0; i < 2 * N; i++) { const isOn = i % 2 === 1; cv.style.display = isOn ? 'block' : 'none';
      const t0 = performance.now(); if (isOn) { x += ((i >> 1) % 2 ? 6 : -6); mk('pointermove', x); } const t1 = performance.now(); A.renderer.render(A.scene, A.camera); gl.finish(); const t2 = performance.now();
      (isOn ? on : off).push(t2 - t0); if (isOn) { brk.draw.push(t1 - t0); brk.render.push(t2 - t1); } }
    mk('pointerup', x); cv.style.display = 'block';
    return { drawMed: med(brk.draw), renderOnMed: med(brk.render), medOff: med(off), medOn: med(on), n: off.length, nOn: on.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
  log('§PROFILE_LENS_PERF frames=' + PERF.n + '/' + PERF.nOn + ' lensOffMedianMs=' + PERF.medOff.toFixed(2) + ' lensOnMedianMs=' + PERF.medOn.toFixed(2) + ' lensDrawMedianMs=' + PERF.drawMed.toFixed(2) + ' renderWhileLensOnMedianMs=' + PERF.renderOnMed.toFixed(2) + ' heapMB=' + PERF.heapMB + ' bar=lensOn<=lensOff+2ms (work per frame: lens redraw + render + finish; compositor not measured)');
  add('§PROFILE_LENS_PERF: lens-on median frame <= lens-off median + 2 ms (bar stated in advance)', PERF.nOn >= 60 && PERF.medOn <= PERF.medOff + 2, 'off=' + PERF.medOff.toFixed(2) + ' on=' + PERF.medOn.toFixed(2));

  // ---- CROSS mode: 3 scrubbed chainages, each vs an independent recompute ----
  const XS = await p.evaluate((fr) => {
    const A = APP, r = A.civilDriveRoute(), len = A.civilRouteAt(0).len, sl = document.getElementById('section-slider'), res = [];
    document.getElementById('sec-axis-cross').click();
    const canvasHidden = document.getElementById('civil-lens').style.display === 'none';
    const m4 = new THREE.Matrix4();
    const lb = (g) => { const p = g.attributes.position; let a = [1e18, 1e18, 1e18], c = [-1e18, -1e18, -1e18]; for (let i = 0; i < p.count; i++) { const v = [p.getX(i), p.getY(i), p.getZ(i)]; for (let k = 0; k < 3; k++) { if (v[k] < a[k]) a[k] = v[k]; if (v[k] > c[k]) c[k] = v[k]; } } return new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...c)); };
    for (const f of fr) {
      sl.value = String(len * f); sl.dispatchEvent(new Event('input', { bubbles: true })); const sel = +sl.value;
      let cum = 0, T = null;
      for (let i = 1; i < r.length; i++) { const h = Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z); if (cum + h >= sel) { T = { x: (r[i].x - r[i - 1].x) / h, z: (r[i].z - r[i - 1].z) / h, px: r[i - 1].x + (sel - cum) / h * (r[i].x - r[i - 1].x), pz: r[i - 1].z + (sel - cum) / h * (r[i].z - r[i - 1].z) }; break; } cum += h; }
      const n = A.sectionPlane.normal, dot = n.x * T.x + n.z * T.z, d0 = T.x * T.px + T.z * T.pz, mine = new Set(); let total = 0;
      const test = (guid, box) => { total++; let lo = 1e18, hi = -1e18; [box.min.x, box.max.x].forEach(x => [box.min.z, box.max.z].forEach(z => { const d = T.x * x + T.z * z - d0; if (d < lo) lo = d; if (d > hi) hi = d; })); if (lo <= 0 && hi >= 0) mine.add(guid); };
      A.collectMeshes(o => o.isMesh).forEach(o => {
        if (o.isBatchedMesh && A._batchMeta[o.id]) A._batchMeta[o.id].forEach(m => { const g = (o.userData.slotGeo || {})[m.slotId]; if (!g) return; o.getMatrixAt(m.slotId, m4); test(m.guid, lb(g).applyMatrix4(m4)); });
        else if (o.isInstancedMesh && A._instanceMeta[o.id]) { const Lb = lb(o.geometry); A._instanceMeta[o.id].forEach((m, i) => { o.getMatrixAt(i, m4); test(m.guid, Lb.clone().applyMatrix4(m4)); }); }
      });
      const prod = new Set(A.civilSectionCut().guids), onlyP = [...prod].filter(g => !mine.has(g)).length, onlyI = [...mine].filter(g => !prod.has(g)).length;
      const ms = A.collectMeshes(o => o.isMesh);
      res.push({ s: +sel.toFixed(1), dot, ny: n.y, prod: prod.size, indep: mine.size, onlyP, onlyI, total, two: ms.filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length === 2).length, meshN: ms.length });
    }
    return { res, canvasHidden };
  }, [0.25, 0.55, 0.85]);
  log('  [cross] ' + JSON.stringify(XS));
  add('Cross: chart hidden, 3 scrubbed chainages -> normal . route tangent >= 0.999 (normal horizontal)', XS.canvasHidden && XS.res.every(x => Math.abs(x.dot) >= 0.999 && Math.abs(x.ny) < 1e-9), JSON.stringify(XS.res.map(x => [x.s, +x.dot.toFixed(6)])));
  add('Cross: slab (2 clip planes) on every mesh at each scrub', XS.res.every(x => x.two === x.meshN), 'meshes=' + XS.res[0].meshN);
  add('Cross: cut set non-trivial at each scrub (0 < cut < all indexed)', XS.res.every(x => x.indep > 0 && x.indep < x.total), JSON.stringify(XS.res.map(x => [x.s, x.indep, x.total])));
  add('Cross: cut set == independent bbox-straddle recompute (raw vertices x matrix) at each scrub', XS.res.every(x => x.onlyP === 0 && x.onlyI === 0 && x.prod === x.indep), JSON.stringify(XS.res.map(x => [x.s, x.prod, x.indep, x.onlyP, x.onlyI])));

  // ---- leaving the mode ----
  const Z = await p.evaluate(() => { const A = APP, cnt = () => { const ms = A.collectMeshes(o => o.isMesh); return { one: ms.filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length === 1).length, two: ms.filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length === 2).length, n: ms.length }; };
    document.getElementById('sec-axis-x').click(); const afterX = cnt(), modeX = A._secMode, axis = A.sectionAxis, slMax = document.getElementById('section-slider').max;
    document.getElementById('sec-axis-cross').click(); document.getElementById('sec-axis-y').click(); const afterY = cnt();
    A.toggleSection(); const closed = A.collectMeshes(o => o.isMesh).filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length).length;
    A.toggleSection(); document.getElementById('sec-axis-long').click(); A.toggleSection(); const closedLong = A.collectMeshes(o => o.isMesh).filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length).length;
    return { afterX, modeX, axis, slMax, afterY, closed, closedLong, cs: A._civilSection, canvas: document.getElementById('civil-lens').style.display }; });
  log('  [leave] ' + JSON.stringify(Z));
  add('X after Cross: 1 clip plane on every mesh (not 2), civil slab cleared, mode off', Z.afterX.one === Z.afterX.n && Z.afterX.two === 0 && Z.modeX === null && Z.axis === 'X' && Z.cs === null, JSON.stringify(Z.afterX));
  add('Y after Cross: 1 clip plane, not 2', Z.afterY.one === Z.afterY.n && Z.afterY.two === 0, JSON.stringify(Z.afterY));
  add('closing the tool clears all clip planes (from Cross and from Long) and hides the chart', Z.closed === 0 && Z.closedLong === 0 && Z.canvas === 'none', 'closed=' + Z.closed + ' closedLong=' + Z.closedLong + ' canvas=' + Z.canvas);

  const fail = checks.filter(c => !c[1]).length, vac = judged === 0;
  log('§WITNESS_CIVIL_SECTIONS ' + (vac ? 'INCONCLUSIVE (no series judged)' : (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length));
  return fin(fail ? 1 : (vac ? 2 : 0));
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
