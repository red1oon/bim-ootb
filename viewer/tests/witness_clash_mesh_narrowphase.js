#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_MESH_NARROWPHASE (2026-09-04, bim-compiler prompts/CLASH_GATE_OBB_NARROWPHASE.md §M.4)
// Scope: the viewer's clash PAIR SET on a real building. Broad phase = the production
// `_queryClashesPairAll` rows (bbox R-tree, per clash_rules.json pair); verdict = clash_narrow.js
// (OBB/SAT → three-mesh-bvh intersectsGeometry → containment). On origin/main (no clash_narrow.js)
// the LEGACY answer is judged instead: every broad-phase row is what the list reports as a clash.
// The judge is this file's OWN oracle — a direct intersectsGeometry + ray-parity call on
// A.meshCache geometry with the DB-derived world matrix — independent of the module's staging.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: the clash list is bounding-box only (measure.js
// `_queryClashesPairRtree`). Two boxes can overlap while the real shapes never touch, so a pair
// shown in a film could assert a clash that does not exist. RED on main = the measured share of
// bbox-only rows whose triangles never intersect (§CLASH_BBOX_FP). GREEN with the module = every
// reported CLASH has intersecting/contained triangles (I1), nothing the broad phase found is lost
// (I2), every CLEAR is really clear (I3), the matrix the verdict used is the one the scene draws
// (I4), and six hand-known synthetic cases pass through the same testPair (I5).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / BVH not ready / broad=0), VACUOUS (no
// CLEAR rows, no rotated side — named, not judged), RED CONTROL (witness_kit).
// Env: ROOT · BLD (default Terminal — the viewer appends _meta/_geo itself; never Terminal_meta) ·
//      BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG · PAIR_CAP (0 = every broad-phase pair) · MODE=auto|legacy
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Terminal';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8571);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const PAIR_CAP = +(process.env.PAIR_CAP || 0);
const MODE = process.env.MODE || 'auto';
const LOG = process.env.LOG || ('/tmp/witness_clash_mesh_narrowphase_' + BLD + '.log');
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
function logRaw(l) { logStream.write(l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
function inconclusive(r) { log('§CMN verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_CLASH_MESH_NARROWPHASE pass=0 fail=0 ran=0 INCONCLUSIVE'); }

// ── in-page: readiness, the production broad phase, the module verdict, and this witness's OWN oracle ──
function pageProbe() {
  const A = window.APP, THREE = window.THREE;
  window.__cmnReady = function () {
    return { rendered: !!(A.activeBuilding && A.buildingsRendered && A.buildingsRendered.has(A.activeBuilding)), streaming: !!A.streaming,
      bvhReady: !!window._bvhReady, bvhRunning: !!A._bvhRunning, bvhPending: (A._bvhPending || []).length, rtree: !!A._clashRtreeReady,
      streamed: A.streamedCount || 0, hasModule: !!(A.clashNarrow && A.clashNarrow.qualifyRows), building: A.activeBuilding,
      cacheEntries: Object.keys(A.meshCache || {}).length, cacheWithBvh: Object.values(A.meshCache || {}).filter(function (g) { return g && g.boundsTree; }).length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1 };
  };
  window.__cmnEnsureRtree = function () { try { A._ensureClashIndexes(); } catch (e) {} };
  // the witness's own transform (streaming.js:2224-2229 / 2333-2338 — same formula, written here independently)
  const _p = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  function wm(t) { const o = A.ifc2three(t.cx, t.cy, t.cz); _p.set(o.x, o.y, o.z); _e.set(t.rx || 0, t.rz || 0, -(t.ry || 0)); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p, _q, _one); }
  function xfOf(guids) {
    const m = {};
    for (let i = 0; i < guids.length; i += 400) {
      const ch = guids.slice(i, i + 400);
      A.dbQuery('SELECT t.guid, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, i.geometry_hash FROM element_transforms t LEFT JOIN element_instances i ON i.guid=t.guid WHERE t.guid IN (' + ch.map(function () { return '?'; }).join(',') + ')', ch)
        .forEach(function (w) { if (!m[w[0]] || !m[w[0]].hash) m[w[0]] = { cx: w[1], cy: w[2], cz: w[3], rx: w[4] || 0, ry: w[5] || 0, rz: w[6] || 0, hash: w[7] || null }; });
    }
    return m;
  }
  // oracle: a PENETRATING triangle intersection (a pair intersection segment longer than 1 mm — the same touch policy the
  // module states; intersectsGeometry alone counts a column resting on a slab as a hit, measured on Hospital) OR
  // (inner world box inside outer's) centroid ray-parity odd on >=2 of 3 axes. Written here independently of clash_narrow.js.
  const TOUCH_EPS = 0.001;
  const _ray = new THREE.Ray(), _ba = new THREE.Box3(), _bb = new THREE.Box3(), _seg = new THREE.Line3();
  function penetrates(gA, gB, rel) {
    let pen = 0, touch = 0;
    try { gA.boundsTree.bvhcast(gB.boundsTree, rel, { intersectsTriangles: (t1, t2) => {
      _seg.start.set(NaN, NaN, NaN); _seg.end.set(NaN, NaN, NaN);
      let h = false; try { h = t1.intersectsTriangle(t2, _seg, true); } catch (e) { h = false; }
      if (!h) return false;
      const s = _seg.start, e = _seg.end;
      if (!isFinite(s.x) || (s.x === 0 && s.y === 0 && s.z === 0 && e.x === 0 && e.y === 0 && e.z === 0) || s.distanceTo(e) <= TOUCH_EPS) { touch++; return false; }
      pen++; return true;   // one penetrating segment is enough
    } }); } catch (e) { return { pen: -1, touch }; }
    return { pen, touch };
  }
  function parityInside(bt, outerGeo, innerGeo, rel) {
    const ib = innerGeo.boundingBox, c = new THREE.Vector3((ib.min.x + ib.max.x) / 2, (ib.min.y + ib.max.y) / 2, (ib.min.z + ib.max.z) / 2).applyMatrix4(rel);
    if (!outerGeo.boundingBox.containsPoint(c)) return false;
    let odd = 0; const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i++) { _ray.origin.copy(c); _ray.direction.set(dirs[i][0], dirs[i][1], dirs[i][2]); let h = []; try { h = bt.raycast(_ray, THREE.DoubleSide); } catch (e) {} if (h.length % 2 === 1) odd++; }
    return odd >= 2;
  }
  // returns null (unknown) or { hit, how: 'penetrate'|'contained'|'touch'|'none' }
  function oracle(gA, MA, gB, MB) {
    if (!gA || !gB || !gA.boundsTree || !gB.boundsTree) return null;
    if (!gA.boundingBox) gA.computeBoundingBox(); if (!gB.boundingBox) gB.computeBoundingBox();
    const rel = new THREE.Matrix4().copy(MA).invert().multiply(MB);
    let hit = false; try { hit = gA.boundsTree.intersectsGeometry(gB, rel); } catch (e) { return null; }
    let touched = false;
    if (hit) { const p = penetrates(gA, gB, rel); if (p.pen < 0) return null; if (p.pen > 0) return { hit: true, how: 'penetrate' }; touched = true; }
    _ba.copy(gA.boundingBox).applyMatrix4(MA); _bb.copy(gB.boundingBox).applyMatrix4(MB);
    if (_ba.containsBox(_bb) && parityInside(gA.boundsTree, gA, gB, rel)) return { hit: true, how: 'contained' };
    if (_bb.containsBox(_ba) && parityInside(gB.boundsTree, gB, gA, new THREE.Matrix4().copy(MB).invert().multiply(MA))) return { hit: true, how: 'contained' };
    return { hit: false, how: touched ? 'touch' : 'none' };
  }
  window.__cmnRun = async function (opts) {
    const out = { mode: opts.mode, perPair: [], records: [], broadTotal: 0, selfTest: null, parity: { sampled: 0, maxDiff: 0, missing: 0 }, heap: {} };
    const rules = await new Promise(function (res) { A._loadClashRules(res); });
    const discCounts = {}; A.dbQuery('SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline').forEach(function (r) { discCounts[r[0]] = r[1]; });
    const active = rules.clash_rules.filter(function (r) { return discCounts[r.source.discipline] && discCounts[r.target.discipline]; });
    const useModule = opts.mode !== 'legacy' && A.clashNarrow && A.clashNarrow.qualifyRows;
    out.heap.beforeMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1;
    if (useModule) { try { out.selfTest = A.clashNarrow.selfTest(); } catch (e) { out.selfTest = { pass: 0, fail: 1, err: e.message }; } }
    // parity map: guid → batched slot (built once; instanced come from A._instanceGuids)
    const bmOf = {}; for (const id in (A._batchMeta || {})) { const arr = A._batchMeta[id]; for (let i = 0; i < arr.length; i++) bmOf[arr[i].guid] = { meshId: +id, slotId: arr[i].slotId }; }
    const parityDone = {}; const _sm = new THREE.Matrix4();
    function parity(guid, M) {
      if (out.parity.sampled >= 200 || parityDone[guid]) return; parityDone[guid] = 1;
      let obj = null, idx = -1;
      const b = bmOf[guid], ig = A._instanceGuids && A._instanceGuids[guid];
      if (b) { obj = A.scene.getObjectById(b.meshId); idx = b.slotId; } else if (ig) { obj = A.scene.getObjectById(ig.meshId); idx = ig.instanceIndex; }
      if (!obj || idx < 0 || !obj.getMatrixAt) { out.parity.missing++; return; }
      try { obj.getMatrixAt(idx, _sm); } catch (e) { out.parity.missing++; return; }
      let d = 0; for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(_sm.elements[k] - M.elements[k]));
      out.parity.sampled++; if (d > out.parity.maxDiff) out.parity.maxDiff = d;
    }
    for (const rule of active) {
      const src = rule.source.discipline, tgt = rule.target.discipline, label = src + '|' + tgt;
      rules._activeTolerance = rule.tolerance_m || 0.025;
      const savedPS = A._CLASH_PAGE_SIZE; A._CLASH_PAGE_SIZE = 1e9;
      let rows = []; const tB = performance.now();
      try { rows = A._queryClashesPairAll(rules, src, tgt); } finally { A._CLASH_PAGE_SIZE = savedPS; }
      const broadMs = performance.now() - tB;
      if (opts.pairCap && rows.length > opts.pairCap) rows = rows.slice(0, opts.pairCap);
      out.broadTotal += rows.length;
      let modRes = null;
      if (useModule && rows.length) modRes = await A.clashNarrow.qualifyRows(rows, { label: label, sync: true });
      // oracle pass (this witness's own), per row
      const guids = {}; rows.forEach(function (c) { guids[c[0]] = 1; guids[c[1]] = 1; });
      const xf = xfOf(Object.keys(guids));
      let oClear = 0, oHit = 0, oUnknown = 0, oTouch = 0; const tO = performance.now();
      rows.forEach(function (c) {
        const ta = xf[c[0]], tb = xf[c[1]];
        const gA = ta && ta.hash ? A.meshCache[ta.hash] : null, gB = tb && tb.hash ? A.meshCache[tb.hash] : null;
        let known = false, hit = false, how = 'unknown';
        if (gA && gB) { const MA = wm(ta), MB = wm(tb); parity(c[0], MA); parity(c[1], MB); const o = oracle(gA, MA, gB, MB); if (o !== null) { known = true; hit = o.hit; how = o.how; } }
        if (!known) oUnknown++; else if (hit) oHit++; else { oClear++; if (how === 'touch') oTouch++; }
        const v = c[9];
        out.records.push({ pairId: c[0] < c[1] ? c[0] + '|' + c[1] : c[1] + '|' + c[0], discPair: label,
          verdict: v ? v.verdict : 'CLASH', reason: v ? v.reason : 'LEGACY_BBOX_ONLY', stage: v ? v.stage : 'BROAD',
          oracleKnown: known, oracleHit: hit, oracleHow: how, aabbOverlapM: (typeof c[8] === 'number') ? c[8] : null,
          obbDepthM: v ? v.obbDepthM : null, triPairs: v ? (v.triPairs | 0) : 0, hasContact: !!(v && v.contact),
          classA: c[2] || '', classB: c[3] || '', err: v && v.err ? String(v.err).slice(0, 80) : undefined,
          oracleNote: (!known) ? ('A=' + (ta ? (ta.hash ? (gA ? (gA.boundsTree ? 'ok' : 'no-bvh') : 'hash-not-in-cache') : 'no-hash') : 'no-transform') + ' B=' + (tb ? (tb.hash ? (gB ? (gB.boundsTree ? 'ok' : 'no-bvh') : 'hash-not-in-cache') : 'no-hash') : 'no-transform')) : undefined });
      });
      const oracleMs = performance.now() - tO;
      const judged = oHit + oClear;
      console.log('§CLASH_BBOX_FP pair=' + label + ' broad=' + rows.length + ' meshClear=' + oClear + ' (touchOnly=' + oTouch + ') meshTrue=' + oHit + ' unknown=' + oUnknown +
        ' fpRate=' + (judged ? (oClear / judged * 100).toFixed(1) : 'n/a') + '% broadMs=' + broadMs.toFixed(0) + ' oracleMs=' + oracleMs.toFixed(0));
      out.perPair.push({ label: label, broad: rows.length, oracleClear: oClear, oracleTouch: oTouch, oracleHit: oHit, oracleUnknown: oUnknown, broadMs: +broadMs.toFixed(0), oracleMs: +oracleMs.toFixed(0),
        mod: modRes ? { counts: modRes.counts, fpRate: modRes.falsePositiveRate, ms: modRes.ms, msPerPair: modRes.msPerPair, mem: modRes.mem } : null });
    }
    out.heap.afterMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1;
    return out;
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cmn-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§CMN_ENV root=${ROOT} commit=${commit} bld=${BLD} bldDir=${BLD_DIR} gpu=${GPU} mode=${MODE} pairCap=${PAIR_CAP} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840', '--enable-precise-memory-info'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t); if (/§CLASH_(NARROWPHASE|OBB |NARROW_LOSS|MEM|NARROW_SELFTEST|BBOX_FP|NARROW_INIT)|§BVH_(INIT|DEFERRED|SELFTEST)|§CLASH_RTREE ready|§CONTRACT_CHECK/.test(t)) console.log('  ' + t); });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let R = null, ready = null;
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CMN_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera, { timeout: LOAD_MS });
    await page.evaluate(pageProbe);
    await page.waitForFunction(() => { const s = window.__cmnReady(); return s.rendered && !s.streaming; }, { timeout: LOAD_MS, polling: 1000 });
    // BVH: the §BVH_DEFERRED chain must drain — the narrow phase REUSES those trees (bvhBuiltNew must be 0)
    try { await page.waitForFunction(() => { const s = window.__cmnReady(); return s.bvhReady && !s.bvhRunning && s.bvhPending === 0; }, { timeout: 600000, polling: 1000 }); } catch (e) { logRaw('[wait] bvh chain did not drain: ' + e.message); }
    ready = await page.evaluate(() => window.__cmnReady());
    log(`§CMN_SCOPE building=${ready.building} streamed=${ready.streamed} bvhReady=${ready.bvhReady} bvhPending=${ready.bvhPending} cacheEntries=${ready.cacheEntries} cacheWithBvh=${ready.cacheWithBvh} hasModule=${ready.hasModule} heapMB=${ready.heapMB}`);
    if (!ready.rendered || !ready.streamed) { inconclusive('building did not stream'); process.exitCode = 2; return; }
    if (!ready.bvhReady) { inconclusive('three-mesh-bvh not loaded (window._bvhReady=false) — no triangle test possible'); process.exitCode = 2; return; }
    await page.evaluate(() => window.__cmnEnsureRtree());
    await page.waitForFunction(() => window.__cmnReady().rtree, { timeout: 600000, polling: 500 });
    R = await page.evaluate((o) => window.__cmnRun(o), { pairCap: PAIR_CAP, mode: MODE });
    const post = await page.evaluate(() => window.__cmnReady());
    // ── totals ──
    let tb = 0, tc = 0, th = 0, tu = 0, tt = 0, modMs = 0, modBroad = 0, modObbRej = 0, modMeshTrue = 0, modUnknown = 0, modCont = 0, rot = 0, bvhReused = 0, bvhNew = 0, pinned = 0, peak = 0;
    for (const p of R.perPair) {
      tb += p.broad; tc += p.oracleClear; th += p.oracleHit; tu += p.oracleUnknown; tt += (p.oracleTouch || 0);
      if (p.mod) { modMs += p.mod.ms; modBroad += p.mod.counts.broad; modObbRej += p.mod.counts.obbRejected; modMeshTrue += p.mod.counts.meshTrue; modUnknown += p.mod.counts.unknown; modCont += p.mod.counts.contained; rot += p.mod.counts.rotatedSides; bvhReused += p.mod.mem.bvhReusedEntries; bvhNew += p.mod.mem.bvhBuiltNew; pinned = Math.max(pinned, p.mod.mem.geomPinnedPeak); peak = Math.max(peak, p.mod.mem.heapPeakMB); }
    }
    const judged = th + tc;
    log(`§CLASH_BBOX_FP pair=TOTAL building=${BLD} broad=${tb} meshClear=${tc} (touchOnly=${tt}) meshTrue=${th} unknown=${tu} fpRate=${judged ? (tc / judged * 100).toFixed(1) : 'n/a'}% (witness oracle, independent of the module)`);
    if (R.selfTest) log(`§CLASH_NARROW_SELFTEST summary(node) pass=${R.selfTest.pass} fail=${R.selfTest.fail}`);
    if (ready.hasModule && MODE !== 'legacy') {
      const mj = modBroad - modUnknown;
      const modAgg = R.perPair.reduce((a, p) => a + (p.mod && p.mod.counts.aggregateParent || 0), 0);
      log(`§CLASH_NARROWPHASE pair=TOTAL building=${BLD} broad=${modBroad} obbSurvivors=${modBroad - modObbRej - modUnknown} meshTrue=${modMeshTrue} contained=${modCont} unknown=${modUnknown} aggregateParent=${modAgg} falsePositiveRate=${mj ? ((mj - modMeshTrue) / mj * 100).toFixed(1) : 'n/a'}% ms=${modMs.toFixed(0)} msPerPair=${mj ? (modMs / mj).toFixed(3) : 'n/a'}`);
      if (modUnknown) log(`§CLASH_NARROW_UNKNOWN pair=TOTAL unknown=${modUnknown} of which aggregateParent=${modAgg} (composed_aggregate rows from scene.js §NOGEO_COMPOSE — no triangles of their own; their AGGREGATES children are judged as their own rows) other=${modUnknown - modAgg}`);
      log(`§CLASH_OBB pair=TOTAL rotatedSides=${rot} rejected=${modObbRej}${rot === 0 ? ' VACUOUS(rotation) — every served element has rotation 0; the rotation branch is proven only by S1/S5' : ''}`);
      log(`§CLASH_MEM pair=TOTAL heapBeforeMB=${R.heap.beforeMB} heapPeakMB=${peak} heapAfterMB=${R.heap.afterMB} bvhReusedEntries=${bvhReused} bvhBuiltNew=${bvhNew} geomPinnedPeak=${pinned} cacheWithBvhBefore=${ready.cacheWithBvh} cacheWithBvhAfter=${post.cacheWithBvh} firstLoadCost=none(module runs only on cell click / this probe)`);
    } else {
      log(`§CLASH_NARROWPHASE pair=TOTAL building=${BLD} LEGACY — no clash_narrow.js on this ROOT; every broad row is reported as a clash`);
    }
    log(`§CMN_PARITY sampled=${R.parity.sampled} maxDiff=${R.parity.maxDiff.toExponential(2)} missing=${R.parity.missing}`);
    // name every disagreement and every unknown, so a red line says WHICH pair and WHY (never re-derive from memory)
    const i3 = R.records.filter(r => r.verdict === 'CLEAR' && r.oracleKnown && r.oracleHit);
    const i1 = R.records.filter(r => r.verdict === 'CLASH' && r.oracleKnown && !r.oracleHit);
    const unk = R.records.filter(r => r.verdict === 'UNKNOWN' || !r.oracleKnown);
    const tally = (arr, f) => { const t = {}; arr.forEach(r => { const k = f(r); t[k] = (t[k] || 0) + 1; }); return JSON.stringify(t); };
    if (i3.length) { log(`§CMN_I3_DISAGREE n=${i3.length} byStage=${tally(i3, r => r.stage + '/' + r.reason)}`); i3.slice(0, 8).forEach(r => log(`§CMN_I3_DISAGREE_SAMPLE pair=${r.pairId} disc=${r.discPair} cls=${r.classA}|${r.classB} stage=${r.stage} reason=${r.reason} obbDepth=${r.obbDepthM} aabb=${r.aabbOverlapM}`)); }
    if (i1.length) { log(`§CMN_I1_DISAGREE n=${i1.length} byStage=${tally(i1, r => r.stage + '/' + r.reason)}`); i1.slice(0, 8).forEach(r => log(`§CMN_I1_DISAGREE_SAMPLE pair=${r.pairId} disc=${r.discPair} cls=${r.classA}|${r.classB} reason=${r.reason} tri=${r.triPairs}`)); }
    if (unk.length) { log(`§CMN_UNKNOWN n=${unk.length} moduleErr=${tally(unk, r => r.err || '-')} oracleNote=${tally(unk, r => r.oracleNote || '-')} byClassPair=${tally(unk.slice(0, 50000), r => r.classA + '|' + r.classB).slice(0, 600)}`); }
    try { const dump = LOG.replace(/\.log$/, '') + '.records.json'; fs.writeFileSync(dump, JSON.stringify({ perPair: R.perPair, parity: R.parity, selfTest: R.selfTest, heap: R.heap, records: R.records })); log('§CMN_DUMP ' + dump + ' records=' + R.records.length); } catch (e) { log('§CMN_DUMP_ERR ' + e.message); }
    const nClear = R.records.filter(r => r.verdict === 'CLEAR').length;
    if (!nClear) log('§CMN_VACUOUS invariant I3 (clear-is-really-clear) has 0 CLEAR rows — not judged');
    if (!R.broadTotal) { inconclusive('broad phase found 0 candidate pairs'); process.exitCode = 2; return; }
  } catch (e) { log('§CMN_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!R || !R.records.length) return;
  const rows = R.records;
  Witness('clash_mesh_narrowphase').population(() => rows)
    .schema({ type: 'object', required: ['pairId', 'discPair', 'verdict', 'reason', 'stage', 'oracleKnown', 'oracleHit', 'triPairs'],
      properties: { pairId: { type: 'string', minLength: 3 }, discPair: { type: 'string', minLength: 3 }, verdict: { enum: ['CLASH', 'CLEAR', 'UNKNOWN'] },
        reason: { enum: ['OBB_SEPARATING_AXIS', 'MESH_TRIANGLES_INTERSECT', 'MESH_CONTAINED', 'MESH_NO_TRIANGLE_INTERSECTION', 'MESH_TOUCH_ONLY', 'NO_GEOMETRY', 'AGGREGATE_PARENT_NO_GEOMETRY', 'LEGACY_BBOX_ONLY'] },
        stage: { enum: ['BROAD', 'OBB', 'MESH'] }, oracleKnown: { type: 'boolean' }, oracleHit: { type: 'boolean' }, triPairs: { type: 'integer', minimum: 0 } } })
    .invariant('I1 every reported CLASH has intersecting or contained triangles (witness oracle)', rs => rs.filter(r => r.verdict === 'CLASH' && r.oracleKnown).every(r => r.oracleHit))
    .invariant('I2 no silent loss — one record per broad-phase candidate, verdict from the enum', rs => rs.length === R.broadTotal && rs.every(r => ['CLASH', 'CLEAR', 'UNKNOWN'].includes(r.verdict)))
    .invariant('I3 every CLEAR is really clear — oracle finds no intersection and no containment', rs => rs.filter(r => r.verdict === 'CLEAR' && r.oracleKnown).every(r => !r.oracleHit))
    .invariant('I4 DB-derived world matrix equals the live scene matrix (getMatrixAt) on the sample', () => R.parity.sampled > 0 && R.parity.maxDiff < 1e-5)
    .invariant('I5 the hand-known synthetic cases (S1-S8, incl. the touch policy) pass through the same testPair', () => !!R.selfTest && R.selfTest.fail === 0 && R.selfTest.pass >= 10)
    .invariant('I6 every CLASH verdict carries a world contact point for the film lane', rs => rs.filter(r => r.verdict === 'CLASH' && r.reason !== 'LEGACY_BBOX_ONLY').every(r => r.hasContact))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const i = c.findIndex(r => r.verdict === 'CLASH' && r.oracleKnown); if (i >= 0) c[i].oracleHit = false; else if (c[0]) { c[0].verdict = 'CLASH'; c[0].oracleKnown = true; c[0].oracleHit = false; } return c; })
    .run();
  logStream.end();
})();
