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
  p.on('console', m => { const t = m.text(); if (/§(LONG_SECTION|CROSS_SECTION|CIVIL_MODEL|ALTC_HIGHWAY|CIVIL_ROUTE)/.test(t)) log('  [con] ' + t); });
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
    add('building: no floating civil button / panel / chart canvas in DOM', !pre.floatBtn && !pre.floatPanel && !(await p.evaluate(() => !!document.getElementById('civil-section-canvas'))));
    const nul = await p.evaluate(() => typeof APP.civilLongSection === 'function' ? APP.civilLongSection() === null && APP.civilCrossSection(100) === null : 'api-absent');
    add('building: civilLongSection()/civilCrossSection() return null (gate closed)', nul === true, 'got=' + nul);
    const fail = checks.filter(c => !c[1]).length;
    log('§WITNESS_CIVIL_SECTIONS_BUILDING ' + (fail ? 'FAIL' : 'VACUOUS — gate closed, no civil checks judged (NOT a PASS)'));
    return fin(fail ? 1 : 0);
  }
  if (RED) {
    add('civil: Long+Cross buttons inside the Cut tool (5 axis buttons)', JSON.stringify(btns) === JSON.stringify(WANT_C), JSON.stringify(btns));
    add('no floating civil-section-btn in DOM', !pre.floatBtn, 'floatBtn=' + pre.floatBtn);
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

  // ---- LONG mode: real button click, real slider input events, real chart click ----
  const L = await p.evaluate(async () => {
    const A = APP, r = A.civilDriveRoute(), len = A.civilRouteAt(0).len;
    document.getElementById('sec-axis-long').click();
    const ui = A._civilSectionUI(), sl = document.getElementById('section-slider');
    const nearest = () => { const cam = A.camera.position; let best = Infinity, cum = 0, bestS = 0;
      for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, L2 = bx * bx + by * by + bz * bz, segH = Math.hypot(bx, bz);
        const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((cam.x - a.x) * bx + (cam.y - a.y) * by + (cam.z - a.z) * bz) / L2)) : 0;
        const d = Math.hypot(cam.x - (a.x + u * bx), cam.y - (a.y + u * by), cam.z - (a.z + u * bz)); if (d < best) { best = d; bestS = cum + u * segH; } cum += segH; }
      return { d: best, s: bestS }; };
    const out = { len, sliderMax: +sl.max, sliderMin: +sl.min, canvasShown: ui && ui.canvas.style.display === 'block', scr: [], clipLong: A.collectMeshes(o => o.isMesh).filter(o => o.material.clippingPlanes && o.material.clippingPlanes.length).length };
    for (const f of [0.2, 0.5, 0.8]) {
      sl.value = String(len * f); sl.dispatchEvent(new Event('input', { bubbles: true }));
      const want = +sl.value, n = nearest(); out.scr.push({ want, atCam: n.s, dist: n.d, cur: ui.cur, val: document.getElementById('section-val').textContent });
    }
    // chart click -> scrubber
    const rc = ui.canvas.getBoundingClientRect(), m = ui.map, cx = Math.round(rc.left + (m.P.l + (m.W - m.P.l - m.P.r) * 0.63) * (rc.width / m.W)), cy = Math.round(rc.top + rc.height / 2);
    const tgt = ((cx - rc.left) * (m.W / rc.width) - m.P.l) / (m.W - m.P.l - m.P.r) * m.len;
    ui.canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
    const n2 = nearest(); out.click = { tgt, slider: +sl.value, dist: n2.d, atCam: n2.s };
    return out;
  });
  log('  [long] ' + JSON.stringify(L));
  add('Long: chart canvas shown inside the section panel, slider = chainage 0..route length, no clip plane left on', L.canvasShown && L.sliderMin === 0 && Math.abs(L.sliderMax - L.len) <= 1 && L.clipLong === 0, 'max=' + L.sliderMax + ' len=' + L.len.toFixed(1) + ' clipped=' + L.clipLong);
  add('Long: scrub to 3 chainages -> camera within 1 m of route and at that chainage (+-1 m)', L.scr.every(x => x.dist <= 1 && Math.abs(x.atCam - x.want) <= 1), JSON.stringify(L.scr.map(x => [+x.want.toFixed(1), +x.atCam.toFixed(2), +x.dist.toFixed(4)])));
  add('Long: scrubber label reads "chainage ... (inferred)"', L.scr.every(x => /chainage \d+ m of \d+ m \(inferred\)/.test(x.val)), L.scr[0].val);
  add('Long: chart click sets the scrubber (+-1 m) and camera within 1 m of route', Math.abs(L.click.slider - L.click.tgt) <= 1 && L.click.dist <= 1 && Math.abs(L.click.atCam - L.click.tgt) <= 1, JSON.stringify(L.click));

  // ---- CROSS mode: 3 scrubbed chainages, each vs an independent recompute ----
  const XS = await p.evaluate((fr) => {
    const A = APP, r = A.civilDriveRoute(), len = A.civilRouteAt(0).len, sl = document.getElementById('section-slider'), res = [];
    document.getElementById('sec-axis-cross').click();
    const canvasHidden = document.getElementById('civil-section-canvas').style.display === 'none';
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
    return { afterX, modeX, axis, slMax, afterY, closed, closedLong, cs: A._civilSection, canvas: document.getElementById('civil-section-canvas').style.display }; });
  log('  [leave] ' + JSON.stringify(Z));
  add('X after Cross: 1 clip plane on every mesh (not 2), civil slab cleared, mode off', Z.afterX.one === Z.afterX.n && Z.afterX.two === 0 && Z.modeX === null && Z.axis === 'X' && Z.cs === null, JSON.stringify(Z.afterX));
  add('Y after Cross: 1 clip plane, not 2', Z.afterY.one === Z.afterY.n && Z.afterY.two === 0, JSON.stringify(Z.afterY));
  add('closing the tool clears all clip planes (from Cross and from Long) and hides the chart', Z.closed === 0 && Z.closedLong === 0 && Z.canvas === 'none', 'closed=' + Z.closed + ' closedLong=' + Z.closedLong + ' canvas=' + Z.canvas);

  const fail = checks.filter(c => !c[1]).length, vac = judged === 0;
  log('§WITNESS_CIVIL_SECTIONS ' + (vac ? 'INCONCLUSIVE (no series judged)' : (fail ? 'FAIL ' : 'PASS ') + (checks.length - fail) + '/' + checks.length));
  return fin(fail ? 1 : (vac ? 2 : 0));
})().catch(e => { log('CRASH ' + e.stack); fs.writeFileSync(LOG, out.join('\n') + '\n'); process.exit(2); });
