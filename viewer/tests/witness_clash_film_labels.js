#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_FILM_P2 (2026-09-05, bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md
// §CLASH_FILM_P2 §P2.5, §P2.1 AMENDED AGAIN, §P2.1 AMENDED A THIRD TIME)
// Scope: viewer/clash_labels.js — the in-scene label for a clash pair among the TOP_N (8) nearest to
// the camera in a baked film, with NO distance cutoff. Read the log after every run — the exit code is
// not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: the user ruled (verbatim in the spec, amended twice since) that
// selection is by RANK not distance ("mark out up to N of nearest as simple rule", N raised 4→8 later
// the same session), that occlusion is never consulted ("even though behind close doors/walls/
// obstruction"), that the count is limited only by screen-space non-overlap, that the panel keeps a
// constant screen size, and — the newest ruling — that a label which has genuinely left the camera's
// view FRUSTUM must release rather than clamp to the frame edge ("sticky lingers... gone out of
// frame"). Each claim below can come back NO. P2 is the one a well-meaning "fix" would break: a
// selector that raycasts for visibility and hides an occluded pair is a REGRESSION against the ruling,
// so this witness places a synthetic occluder between camera and contact, proves with its OWN raycast
// that the pair is hidden, and asserts the label is there anyway with zero raycasts made by the
// module. P8 is the newest claim: it proves the out-of-frustum release is real (not the old "clamp to
// the edge, no leader" behaviour) AND that it is stateless — the SAME camera position, reoriented away
// and back, releases then recovers, distinct from P2's occlusion-shines-through case.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / module absent / build refused), VACUOUS
// (trueClash=0), path-profile INCONCLUSIVE (the stored path never actually placed a panel), RED CONTROL.
// Env: ROOT · BLD (default Hospital_silent_local) · BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG
//      SABOTAGE=occlude — wraps the selector with the forbidden visibility filter, to show P2 goes RED.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8596);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_clash_film_labels.log';
const SABOTAGE = process.env.SABOTAGE || '';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
const T0 = Date.now();
function ts() { return new Date().toISOString().slice(11, 23) + ' +' + ((Date.now() - T0) / 1000).toFixed(1).padStart(7) + 's'; }
function log(l) { const s = ts() + ' ' + l; logStream.write(s + '\n'); console.log(s); }
function logRaw(l) { logStream.write(ts() + ' ' + l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
function inconclusive(r) { log('§CLL verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_CLASH_FILM_LABELS pass=0 fail=0 ran=0 INCONCLUSIVE'); }

function pageProbe(sabotage) {
  const A = window.APP, THREE = window.THREE;
  const W = A.renderer.domElement.width, H = A.renderer.domElement.height;
  // P2 spy — every visibility instrument the page has. The module must make ZERO calls.
  window.__rayCalls = 0;
  const wrap = (obj, name) => { if (!obj || typeof obj[name] !== 'function' || obj[name].__spied) return;
    const orig = obj[name]; const spy = function () { window.__rayCalls++; return orig.apply(this, arguments); }; spy.__spied = true; obj[name] = spy; };
  wrap(THREE.Raycaster.prototype, 'intersectObject'); wrap(THREE.Raycaster.prototype, 'intersectObjects');
  const MB = window.MeshBVH || (window.ThreeMeshBVH && window.ThreeMeshBVH.MeshBVH) || (THREE.MeshBVH);
  if (MB && MB.prototype) ['raycast', 'raycastFirst', 'shapecast', 'intersectsGeometry', 'closestPointToPoint'].forEach(n => wrap(MB.prototype, n));
  if (sabotage === 'occlude') {
    // THE FORBIDDEN FIX: hide a labelled pair when the first hit from the camera is not near its contact.
    const inner = A.clashLabels.update, rc = new THREE.Raycaster();
    A.clashLabels.update = function (cam, fs, w, h, i) {
      const rec = inner.call(this, cam, fs, w, h, i);
      rc.camera = cam;   // Sprite.raycast needs it (the scene has sprites); without it the raycast itself throws
      const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      rec.placed = rec.placed.filter(q => { const c = A.clashFilm.pairs()[q.i].contact; const dir = new THREE.Vector3(c.x, c.y, c.z).sub(cp); const dist = dir.length(); rc.set(cp, dir.normalize());
        const hit = rc.intersectObjects(A.scene.children, true).find(hh => !(hh.object.userData && hh.object.userData.clashFilmSide)); return !(hit && hit.distance < dist - 0.05); });
      rec.labelled = rec.placed.length; return rec; };
  }
  // The bake builds its plan from the LOAD-TIME camera basis (§CPE_PREVIEW_DIVERGENCE) — record it
  // now, before any test moves the camera, and restore it before the path profile below builds the
  // same plan. MEASURED 2026-09-05: without this the profile named a window the bake found VACUOUS
  // (profile nearest 1.11 m at t≈0.02–0.06; the bake's own nearest over that clip: 10.58 m).
  const camLoad = { p: A.camera.position.clone(), t: A.controls.target.clone() };
  const DIR = new THREE.Vector3(1, 0.35, 0.8).normalize();   // fixed approach direction (stated, arbitrary)
  const pairs = () => A.clashFilm.pairs();
  const pose = (c, d) => { A.camera.position.set(c.x + DIR.x * d, c.y + DIR.y * d, c.z + DIR.z * d); A.camera.lookAt(c.x, c.y, c.z); A.camera.updateMatrixWorld(true); };
  const compact = r => ({ eligible: r.eligible, labelled: r.labelled, skipped: r.skippedOverlap, skippedFrustum: r.skippedFrustum, entered: r.entered, released: r.released, nearest: +r.nearestM.toFixed(3),
    eligiblePairs: (r.eligiblePairs || []).map(e => ({ i: e.i, d: e.d })),
    placed: r.placed.map(q => ({ i: q.i, pairId: q.pairId, x: q.x, y: q.y, w: q.w, h: q.h, d: +q.d.toFixed(3), alpha: +q.alpha.toFixed(3) })) });
  const upd = fs => compact(A.clashLabels.update(A.camera, fs, W, H));
  // §P2.1 AMENDED AGAIN — ground truth for the RANK rule: the true top-N nearest pair indices by plain
  // 3D distance from a given camera position, computed independently of the module, so a test can
  // assert the module's `eligiblePairs` EQUALS this set rather than trusting the module's own math.
  const rankTruth = (camPos, topN) => { const P = pairs(); const ds = [];
    for (let i = 0; i < P.length; i++) { const c = P[i].contact; if (!c) continue; ds.push({ i: i, d: Math.hypot(c.x - camPos.x, c.y - camPos.y, c.z - camPos.z) }); }
    ds.sort((a, b) => a.d - b.d);
    return { top: ds.slice(0, topN).map(x => x.i).sort((a, b) => a - b), all: ds }; };
  window.__cll = {
    size: () => ({ W, H }),
    build: () => A.clashFilm.build().then(() => A.clashFilm.stats()),
    names: () => { const seen = {}; pairs().forEach(p => { seen[p.classA] = 1; seen[p.classB] = 1; });
      return Object.keys(seen).sort().map(k => Object.assign({ cls: k, inRates: !!(window.RATES && window.RATES[k]) }, A.clashLabels.semanticName(k))); },
    pickIsolated: () => { const P = pairs(); let best = -1, bestD = -1;
      for (let i = 0; i < P.length; i++) { const c = P[i].contact; if (!c) continue; let m = 1e9;
        for (let j = 0; j < P.length; j++) { if (i === j || !P[j].contact) continue; const o = P[j].contact; m = Math.min(m, Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z)); }
        if (m > bestD) { bestD = m; best = i; } }
      return { i: best, pairId: P[best].pairId, isolationM: +bestD.toFixed(2), contact: P[best].contact, classA: P[best].classA, classB: P[best].classB }; },
    pickDense: (r) => { const P = pairs(); let best = -1, bestN = -1;
      for (let i = 0; i < P.length; i++) { const c = P[i].contact; if (!c) continue; let n = 0;
        for (let j = 0; j < P.length; j++) { if (i === j || !P[j].contact) continue; const o = P[j].contact; if (Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z) <= r) n++; }
        if (n > bestN) { bestN = n; best = i; } }
      return { i: best, pairId: P[best].pairId, neighboursWithin: bestN, contact: P[best].contact }; },
    reset: () => { A.clashLabels.reset(); window.__rayCalls = 0; },
    at: (c, d, fs) => { pose(c, d); const r0 = window.__rayCalls; const r = upd(fs); r.rayDelta = window.__rayCalls - r0; return r; },
    // §P2.1 rank-correctness probe: places the camera at an ARBITRARY position/orientation (not
    // anchored to any one pair's contact) and checks the module's eligiblePairs against rankTruth.
    // Distance-agnostic by construction — used once close to the model and once far beyond the retired
    // 10.0/10.6 m gate, to prove there is no longer any metres cutoff.
    rankAt: (camPos, lookAtPt, fs, topN) => {
      A.camera.position.set(camPos.x, camPos.y, camPos.z);
      A.camera.lookAt(lookAtPt.x, lookAtPt.y, lookAtPt.z); A.camera.updateMatrixWorld(true);
      const truth = rankTruth(A.camera.position, topN);
      const r = upd(fs);
      return { wantTop: truth.top, gotTop: r.eligiblePairs.map(e => e.i).slice().sort((a, b) => a - b),
        farthestWantD: truth.all[topN - 1] ? +truth.all[topN - 1].d.toFixed(3) : null, r: r }; },
    sweep: (c, from, to, step, idx) => { const out = []; let d = from; const dir = to > from ? 1 : -1; let fs = 0;
      while (dir > 0 ? d <= to + 1e-9 : d >= to - 1e-9) { pose(c, d); const r = A.clashLabels.update(A.camera, fs += 0.1, W, H); out.push([+d.toFixed(3), r.placed.some(q => q.i === idx) ? 1 : 0]); d += dir * step; }
      return out; },
    // §P2.4 / sticky-lingering fix — same camera POSITION (so distance-based rank is unchanged)
    // reoriented three ways: looking at c (in frustum), looking straight past c so c is BEHIND the
    // camera, looking 90° off-axis so c is still in front but outside the horizontal FOV, then back at
    // c. Proves the frustum test is stateless (recovers immediately) and is the thing that releases —
    // not the rank hysteresis, which never changes here (position is fixed throughout).
    frustumTest: (c, d, idx) => {
      pose(c, d); const before = upd(0.6);
      const camPos = A.camera.position.clone();
      const away = camPos.clone().add(DIR.clone().multiplyScalar(5));
      A.camera.lookAt(away.x, away.y, away.z); A.camera.updateMatrixWorld(true);
      const behindRec = upd(0.7);
      const perp = new THREE.Vector3().crossVectors(DIR, new THREE.Vector3(0, 1, 0));
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0); perp.normalize();
      const side = camPos.clone().add(perp.multiplyScalar(5));
      A.camera.lookAt(side.x, side.y, side.z); A.camera.updateMatrixWorld(true);
      const sideRec = upd(0.8);
      A.camera.lookAt(c.x, c.y, c.z); A.camera.updateMatrixWorld(true);
      const restored = upd(0.9);
      const has = (rec) => rec.placed.some(q => q.i === idx), inElig = (rec) => rec.eligiblePairs.some(e => e.i === idx);
      return { before: before, behindRec: behindRec, sideRec: sideRec, restored: restored,
        beforeLabelled: has(before), beforeEligible: inElig(before),
        behindLabelled: has(behindRec), behindEligible: inElig(behindRec), behindSkippedFrustum: behindRec.skippedFrustum,
        sideLabelled: has(sideRec), sideEligible: inElig(sideRec), sideSkippedFrustum: sideRec.skippedFrustum,
        restoredLabelled: has(restored), restoredEligible: inElig(restored) }; },
    occluded: (c, d) => {
      // a wall-sized plane halfway between camera and contact, facing the camera — then the WITNESS's
      // own raycast proves the contact is hidden, then the module is asked, then the plane is removed.
      pose(c, d); const cp = A.camera.position.clone(); const ct = new THREE.Vector3(c.x, c.y, c.z);
      const mid = cp.clone().lerp(ct, 0.5);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x808080, side: THREE.DoubleSide }));
      plane.position.copy(mid); plane.lookAt(cp); plane.name = 'cll-occluder'; A.scene.add(plane); plane.updateMatrixWorld(true);
      const rc = new THREE.Raycaster(cp, ct.clone().sub(cp).normalize()); const hits = rc.intersectObject(plane, false);
      const hidden = hits.length > 0 && hits[0].distance < d;
      const r0 = window.__rayCalls; const r = upd(0.7); r.rayDelta = window.__rayCalls - r0; A.scene.remove(plane); plane.geometry.dispose(); plane.material.dispose();
      return { hiddenByOccluder: hidden, occluderHitAtM: hits.length ? +hits[0].distance.toFixed(3) : null, contactAtM: d, rec: r }; },
    markerSolid: (idx, period) => { const mesh = A.scene.children.find(o => o.userData && o.userData.clashFilmSide === 'A'); if (!mesh) return null;
      const read = t => { A.clashFilm.update(t); const a = mesh.instanceColor.array; return { sel: +a[idx * 3].toFixed(6), amb: +a[(idx === 0 ? 1 : 0) * 3].toFixed(6) }; };
      return { a: read(period / 4), b: read(3 * period / 4), fade: A.clashLabels.fadeOf(idx) }; },
    // §P2.4 / §CLASH_HUD_CARD (2026-09-06) probes. tolTruth reads what the pair RECORD carries; composite
    // spies ctx.fillText on a real 2D context so the claim is about the string actually written, not a
    // formatter called in isolation; hudCard calls the SHIPPED bigStatsBuild and returns its cards.
    // §MESH_OVERLAP_DEPTH: the clash figure is depthMeshM when the record carries it (src=mesh), else severityM (src=obb)
    tolTruth: () => pairs().map((p, i) => ({ i: i, discA: p.discA, discB: p.discB, tolMm: (p.tolMm == null ? null : p.tolMm),
      src: (typeof p.depthMeshM === 'number') ? 'mesh' : 'obb',
      sevMm: (typeof p.depthMeshM === 'number') ? Math.round(p.depthMeshM * 1000) : (typeof p.severityM === 'number' ? Math.round(p.severityM * 1000) : null),
      obbMm: (typeof p.severityM === 'number' ? Math.round(p.severityM * 1000) : null) })),
    composite: (c, d, fs) => { pose(c, d); const r = A.clashLabels.update(A.camera, fs, W, H);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
      const texts = []; const orig = ctx.fillText;
      ctx.fillText = function (t, x, y) { texts.push({ t: String(t), x: Math.round(x), y: Math.round(y) }); return orig.apply(this, arguments); };
      const drawn = A.clashLabelsCompositeOntoCanvas(ctx, W, H, r.placed.map(q => Object.assign({}, q, { alpha: 1 })));
      return { drawn: drawn, texts: texts, placed: r.placed.map(q => ({ i: q.i, pairId: q.pairId, tolMm: q.tolMm, clashMm: q.clashMm, x: q.x, y: q.y, w: q.w, h: q.h, nameA: q.nameA, nameB: q.nameB })) }; },
    hudCard: () => { const st = A.clashFilm.stats(); const has = typeof A.bigStatsBuild === 'function';
      const cards = has ? (A.bigStatsBuild([], 0, 0) || []) : null;
      return { hasBuilder: has, cards: cards ? cards.map(c => ({ big: c.big, label: c.label, sub: c.sub || '', src: c.src })) : null,
        stats: { built: st.built, pairs: st.pairs, broad: st.broad, falseExcluded: st.falseExcluded } }; },
    pathProfile: (n) => {
      A.camera.position.copy(camLoad.p); A.controls.target.copy(camLoad.t); A.camera.lookAt(camLoad.t); A.camera.updateMatrixWorld(true); A.controls.update();
      try { if (typeof A.cinemaPathPlan === 'function') A.cinemaPathPlan(60); } catch (e) {}
      const ov = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null; if (!ov) return { skip: 'no stored cinema_path' };
      let dur = (typeof ov._total === 'number' && ov._total > 0) ? ov._total : 60;
      let plan; try { plan = A.cinemaPathPlan(dur, ov); if (plan && plan.naturalTotal > 0) { dur = plan.naturalTotal; plan = A.cinemaPathPlan(dur, ov); } } catch (e) { return { skip: 'plan failed: ' + e.message }; }
      A.clashLabels.reset(); const rows = [], overl = []; let withElig = 0, withLabel = 0, maxE = 0, maxL = 0, nearest = 1e9, farthestLabelledD = 0, r0 = window.__rayCalls;
      for (let k = 0; k < n; k++) { const t = k / (n - 1); const p = plan.poseAt(t);
        A.camera.position.set(p.x, p.y, p.z); A.camera.lookAt(p.tx, p.ty, p.tz); A.camera.updateMatrixWorld(true);
        const r = A.clashLabels.update(A.camera, t * dur, W, H, k); nearest = Math.min(nearest, r.nearestM);
        if (r.eligible) { withElig++; rows.push([+t.toFixed(4), r.eligible, r.labelled, r.skippedOverlap, +r.nearestM.toFixed(2)]); }
        if (r.labelled) withLabel++;
        r.placed.forEach(q => { if (q.d > farthestLabelledD) farthestLabelledD = q.d; });
        maxE = Math.max(maxE, r.eligible); maxL = Math.max(maxL, r.labelled);
        for (let a = 0; a < r.placed.length; a++) for (let b = a + 1; b < r.placed.length; b++) { const A1 = r.placed[a], B1 = r.placed[b];
          if (A1.x < B1.x + B1.w && B1.x < A1.x + A1.w && A1.y < B1.y + B1.h && B1.y < A1.y + A1.h) overl.push([+t.toFixed(4), A1.pairId, B1.pairId]); } }
      return { samples: n, durationSec: +dur.toFixed(1), framesWithEligible: withElig, framesWithLabel: withLabel, maxEligible: maxE, maxLabelled: maxL,
        nearestM: +nearest.toFixed(2), farthestLabelledM: +farthestLabelledD.toFixed(2), overlaps: overl.length, rows, rayDelta: window.__rayCalls - r0, stats: A.clashLabels.stats() }; }
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cll-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§CLL_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} sabotage=${SABOTAGE || 'none'} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 20 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  const rows = []; let crashed = false;
  const claim = (name, ok, detail) => { rows.push({ claim: name, ok: ok ? 1 : 0, detail: String(detail).slice(0, 240) }); log(`§CLL_CLAIM ${name} ${ok ? 'OK' : 'FAIL'} — ${detail}`); };
  const noOverlap = placed => { for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) { const A1 = placed[a], B1 = placed[b];
    if (A1.x < B1.x + B1.w && B1.x < A1.x + A1.w && A1.y < B1.y + B1.h && B1.y < A1.y + A1.h) return false; } return true; };
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CLL_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer, { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    const has = await page.evaluate(() => !!(window.APP.clashFilm && window.APP.clashFilm.build && window.APP.clashLabels && window.APP.clashLabels.update && window.APP.clashLabelsCompositeOntoCanvas));
    if (!has) { inconclusive('clash_labels.js not wired — A.clashLabels.update / A.clashLabelsCompositeOntoCanvas absent'); process.exitCode = 2; return; }
    await page.evaluate(pageProbe, SABOTAGE);
    const sz = await page.evaluate(() => window.__cll.size()); log(`§CLL_FRAME ${sz.W}x${sz.H}`);
    // §CLASH_HUD_CARD H0 — read the roster BEFORE the film is built: the card must be absent (dropped, not a zero)
    const hud0 = await page.evaluate(() => window.__cll.hudCard());
    const st = await page.evaluate(() => window.__cll.build());
    log(`§CLL_BUILT pairs=${st.pairs} markers=${st.markers} periodS=${st.periodS}`);
    if (!st.pairs) { inconclusive(`trueClash=0 on ${BLD} — a building with no clashes proves nothing about a clash label (VACUOUS)`); process.exitCode = 2; return; }

    // P0 — the names are extracted, not invented
    const names = await page.evaluate(() => window.__cll.names());
    names.forEach(n => log(`§CLL_NAME ${n.cls} → "${n.name}" source=${n.source}${n.desc ? ' desc="' + n.desc + '"' : ''}`));
    const badName = names.filter(n => !n.name || (n.source === 'rates.js' ? !n.desc : n.name !== n.cls));
    claim('P0_names_extracted_from_rates_or_raw_class', badName.length === 0, `classes=${names.length} viaRates=${names.filter(n => n.source === 'rates.js').length} rawFallback=${names.filter(n => n.source !== 'rates.js').length} bad=${badName.length}`);

    // §P2.1 AMENDED AGAIN — the rank rule is DATA read from the module (topN/rankMarginM); there is no
    // metres cutoff left to derive a probe distance from, so every probe below is either distance-
    // agnostic (rankAt) or built off a stated, arbitrary constant (never a retired ENTER/RELEASE value).
    const lim = await page.evaluate(() => { const s = window.APP.clashLabels.stats(); return { N: s.topN, M: s.rankMarginM }; });
    const TOPN = lim.N, MARGIN = lim.M;
    log(`§CLL_LIMITS topN=${TOPN} rankMarginM=${MARGIN} (no metres cutoff — pure rank)`);
    if (!(TOPN > 0 && MARGIN > 0)) { inconclusive(`clashLabels.stats() topN=${TOPN} rankMarginM=${MARGIN} — not a usable rule, nothing judged`); process.exitCode = 2; return; }

    const iso = await page.evaluate(() => window.__cll.pickIsolated());
    log(`§CLL_ISOLATED pair=${iso.pairId} i=${iso.i} isolationM=${iso.isolationM} ${iso.classA}×${iso.classB}`);
    // D_CLOSE keeps `iso` unambiguously nearest (rank 1) regardless of TOPN: by construction every OTHER
    // pair is ≥ isolationM from iso's contact, so a camera within isolationM/2 of that contact is closer
    // to `iso` than to anything else, no matter what TOPN is. FAR_D is a stated distance clearly beyond
    // the RETIRED 10.0/10.6 m gate (not derived from the module — there is no such constant left).
    const D_CLOSE = +Math.max(0.5, Math.min(5, iso.isolationM * 0.4)).toFixed(2);
    const FAR_D = +Math.max(30, iso.isolationM * 3, 20.6).toFixed(1);
    log(`§CLL_PROBE_DIST close=${D_CLOSE}m far=${FAR_D}m (far is arbitrary-but-large, not a module constant)`);

    // ── §P2.4 — the label's 3rd row: [rule tolerance mm / measured clash mm]. Truth for the tolerance is
    // clash_rules.json read from DISK here (first rule per discipline pair, the same first-wins the film
    // build applies); truth for the clash is the pair's own severityM (the marker is already sized from it).
    const rulesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer/clash_rules.json'), 'utf8'));
    const tolTruth = {};
    (rulesJson.clash_rules || []).forEach(r => { const a = r.source && r.source.discipline, b = r.target && r.target.discipline;
      if (!a || !b || typeof r.tolerance_m !== 'number') return; const k = a < b ? a + '|' + b : b + '|' + a; if (tolTruth[k] == null) tolTruth[k] = Math.round(r.tolerance_m * 1000); });
    const keyOf = p => (p.discA < p.discB ? p.discA + '|' + p.discB : p.discB + '|' + p.discA);
    const tt = await page.evaluate(() => window.__cll.tolTruth());
    const tolBad = tt.filter(p => p.tolMm == null || p.tolMm !== tolTruth[keyOf(p)] || p.sevMm == null || !(p.sevMm >= 0));
    const srcMesh = tt.filter(p => p.src === 'mesh').length;
    claim('P9a_every_pair_carries_rule_tolerance_and_measured_clash_mm', tt.length > 0 && tolBad.length === 0,
      `pairs=${tt.length} rules=${Object.keys(tolTruth).length} [${Object.keys(tolTruth).map(k => k + '=' + tolTruth[k] + 'mm').join(' ')}] bad=${tolBad.length} clashSrc mesh=${srcMesh} obb=${tt.length - srcMesh}${tolBad.length ? ' e.g. ' + JSON.stringify(tolBad[0]) : ''}`);
    await page.evaluate(() => window.__cll.reset());
    const cmp = await page.evaluate((c, d) => window.__cll.composite(c, d, 0.6), iso.contact, D_CLOSE);
    const isoP = cmp.placed.find(q => q.i === iso.i), isoT = tt.find(p => p.i === iso.i);
    const wantRow = isoT ? '[' + tolTruth[keyOf(isoT)] + 'mm / ' + isoT.sevMm + 'mm]' : null;
    let j = -1; for (let k = 0; k + 2 < cmp.texts.length && isoP; k++) if (cmp.texts[k].t === isoP.nameA && cmp.texts[k + 1].t === isoP.nameB) { j = k; break; }
    const fpx = Math.max(12, Math.round(sz.H * 0.022)), pY = Math.round(fpx * 0.45), rG = Math.round(fpx * 0.3);
    const h3 = pY * 2 + fpx * 3 + rG * 2, h2 = pY * 2 + fpx * 2 + rG;
    const row3 = j >= 0 ? cmp.texts[j + 2] : null;
    claim('P9b_third_row_composited_is_tolerance_over_measured_clash',
      !!isoP && !!row3 && row3.t === wantRow && row3.y > cmp.texts[j + 1].y && cmp.texts[j + 1].y > cmp.texts[j].y && isoP.h === h3 && h3 !== h2,
      `placed=${!!isoP} drawn=${cmp.drawn} rows=[${j >= 0 ? cmp.texts.slice(j, j + 3).map(t => '"' + t.t + '"@y' + t.y).join(' ') : 'not found'}] want="${wantRow}" src=${isoT ? isoT.src : '-'} obbWouldSay=${isoT ? isoT.obbMm + 'mm' : '-'} panelH=${isoP ? isoP.h : '-'} (3-row=${h3}, old 2-row=${h2})`);

    // ── §CLASH_HUD_CARD — the reveal-round roster carries the film's own count, and only once the film exists
    if (!hud0.hasBuilder) claim('H0_hud_card_absent_before_film_built', false, 'INCONCLUSIVE: A.bigStatsBuild is not wired on this page');
    else claim('H0_hud_card_absent_before_film_built', hud0.stats.built === false && hud0.cards !== null && !hud0.cards.some(c => c.label === 'mesh-true clashes flagged'),
      `before build: built=${hud0.stats.built} cards=${hud0.cards ? hud0.cards.length : 'null'} [${hud0.cards ? hud0.cards.map(c => c.label).join(' | ') : ''}]`);
    const hud1 = await page.evaluate(() => window.__cll.hudCard());
    const card = hud1.cards ? hud1.cards.find(c => c.label === 'mesh-true clashes flagged') : null;
    const wantPct = hud1.stats.broad > 0 ? Math.round((hud1.stats.falseExcluded / hud1.stats.broad) * 1000) / 10 : null;
    if (!hud1.hasBuilder) claim('H1_hud_card_reads_the_film_count', false, 'INCONCLUSIVE: A.bigStatsBuild is not wired on this page');
    else claim('H1_hud_card_reads_the_film_count',
      !!card && card.big === String(st.pairs) && hud1.stats.pairs === st.pairs && hud1.stats.broad > st.pairs
        && card.sub.replace(/,/g, '').indexOf(String(hud1.stats.broad)) >= 0 && card.sub.indexOf(wantPct + '%') >= 0 && hud1.stats.falseExcluded === hud1.stats.broad - st.pairs,
      `card=${card ? '"' + card.big + ' ' + card.label + ' — ' + card.sub + '" src=' + card.src : 'ABSENT'} film pairs=${st.pairs} broad=${hud1.stats.broad} falseExcluded=${hud1.stats.falseExcluded} wantPct=${wantPct}`);

    // P1 — rank correctness, NO distance limit at all: the module's `eligiblePairs` equals the TRUE
    // top-N nearest pairs by plain 3D distance (computed independently in the browser, not trusted from
    // the module), checked once close to the model and once FAR beyond the retired gate — proving the
    // selection has no metres cutoff, not merely a bigger one.
    await page.evaluate(() => window.__cll.reset());
    const rNear = await page.evaluate((cp, t, n) => window.__cll.rankAt(cp, t, 0, n),
      { x: iso.contact.x + 1, y: iso.contact.y + 1, z: iso.contact.z + 1 }, iso.contact, TOPN);
    claim('P1a_rank_matches_truth_near', JSON.stringify(rNear.gotTop) === JSON.stringify(rNear.wantTop),
      `near pose (1.7m offset): want=[${rNear.wantTop}] got=[${rNear.gotTop}] farthestWantD=${rNear.farthestWantD}m`);
    const rFar = await page.evaluate((cp, t, n) => window.__cll.rankAt(cp, t, 0.1, n),
      { x: iso.contact.x + FAR_D, y: iso.contact.y + FAR_D * 0.35, z: iso.contact.z + FAR_D * 0.8 }, iso.contact, TOPN);
    claim('P1b_rank_matches_truth_far_beyond_old_gate', JSON.stringify(rFar.gotTop) === JSON.stringify(rFar.wantTop) && rFar.farthestWantD > 10.6,
      `far pose (~${FAR_D}m offset): want=[${rFar.wantTop}] got=[${rFar.gotTop}] farthestWantD=${rFar.farthestWantD}m (>10.6m proves a pair this far would have been INVISIBLE under the retired distance gate, yet the top-${TOPN} rule still selects it)`);
    claim('P1c_never_exceeds_topN', rNear.gotTop.length <= TOPN && rFar.gotTop.length <= TOPN,
      `near eligible=${rNear.gotTop.length} far eligible=${rFar.gotTop.length} (cap=${TOPN})`);

    // P4 — no strobe: one straight pass in and out through the RANK boundary (not a fixed distance)
    // flips exactly twice — one clean enter, one clean release, never flapping. MEASURED 2026-09-05: the
    // release−enter GAP does NOT reliably equal RANK_MARGIN_M the way the old fixed ENTER_M/RELEASE_M
    // gap did — on Hospital_silent the crossing sits at ~15m from `iso`, inside a dense OTHER-pair
    // region where the top-N boundary (cutoffD) itself shifts nearly 1:1 with camera position along the
    // sweep direction, so a mere 0.05 m of camera travel can move the boundary by close to the full
    // 0.6 m margin (measured gap=0.05m, not ≈0.6m). That is a real property of an emergent, moving rank
    // boundary in a dense building — not a bug — so the claim is what actually matters for "no strobe":
    // exactly 2 flips, release never closer than enter. The gap is logged, not gated.
    await page.evaluate(() => window.__cll.reset());
    const sw = await page.evaluate((c, i, a, b) => window.__cll.sweep(c, a, b, 0.05, i).concat(window.__cll.sweep(c, b + 0.05, a, 0.05, i)), iso.contact, iso.i, FAR_D, 0.3);
    let flips = 0, enterAt = null, releaseAt = null;
    for (let k = 1; k < sw.length; k++) if (sw[k][1] !== sw[k - 1][1]) { flips++; if (sw[k][1]) enterAt = sw[k][0]; else releaseAt = sw[k][0]; }
    const gap = (enterAt != null && releaseAt != null) ? +(releaseAt - enterAt).toFixed(2) : null;
    claim('P4_no_strobe_two_clean_transitions', flips === 2 && enterAt !== null && releaseAt !== null && releaseAt >= enterAt,
      `steps=${sw.length} flips=${flips} enterAt=${enterAt}m releaseAt=${releaseAt}m gap=${gap}m (rankMarginM=${MARGIN}m; gap need not equal it in a dense region, see comment above), sweep ${FAR_D}→0.3→${FAR_D}`);

    // P5 — constant size: the panel's pixel box at 1 m equals the box at D_CLOSE (both keep `iso` at rank 1)
    await page.evaluate(() => window.__cll.reset());
    const r1 = await page.evaluate((c) => window.__cll.at(c, 1.0, 0), iso.contact);
    const r39 = await page.evaluate((c, d) => window.__cll.at(c, d, 0.1), iso.contact, D_CLOSE);
    const b1 = r1.placed.find(q => q.i === iso.i), b39 = r39.placed.find(q => q.i === iso.i);
    claim('P5_constant_screen_size', !!b1 && !!b39 && b1.w === b39.w && b1.h === b39.h, `at 1.0 m ${b1 ? b1.w + 'x' + b1.h : 'none'} px; at ${D_CLOSE} m ${b39 ? b39.w + 'x' + b39.h : 'none'} px (frame ${sz.W}x${sz.H})`);

    // P2 — occlusion is NOT consulted, and a hidden pair IS labelled
    await page.evaluate(() => window.__cll.reset());
    const oc = await page.evaluate((c, d) => window.__cll.occluded(c, d), iso.contact, D_CLOSE);
    const ocLabelled = oc.rec.placed.some(q => q.i === iso.i);
    claim('P2a_no_visibility_call_in_selection', oc.rec.rayDelta === 0, `raycast/BVH calls made by the selector: ${oc.rec.rayDelta} (must be 0)`);
    claim('P2b_pair_behind_a_wall_is_labelled', oc.hiddenByOccluder && ocLabelled, `occluder hit at ${oc.occluderHitAtM} m, contact at ${oc.contactAtM} m → hidden=${oc.hiddenByOccluder}; labelled=${ocLabelled} (the user ruled it in; a fix that hides it is a regression)`);

    // P8 — out-of-frustum RELEASES (the sticky-lingering fix), distinct from occlusion above: same
    // camera POSITION throughout (rank/eligibility unchanged) reoriented behind, then 90° off-axis,
    // then back — proves the frustum test is a stateless per-frame release, not a permanent stick.
    await page.evaluate(() => window.__cll.reset());
    const ft = await page.evaluate((c, d, i) => window.__cll.frustumTest(c, d, i), iso.contact, D_CLOSE, iso.i);
    claim('P8a_in_frustum_is_labelled', ft.beforeEligible && ft.beforeLabelled, `looking at contact: eligible=${ft.beforeEligible} labelled=${ft.beforeLabelled}`);
    claim('P8b_behind_camera_releases_not_clamped', ft.behindEligible && !ft.behindLabelled && ft.behindSkippedFrustum >= 1,
      `same position, looking AWAY (contact now behind camera): eligible=${ft.behindEligible} (rank unchanged) labelled=${ft.behindLabelled} skippedFrustum=${ft.behindSkippedFrustum} — must NOT clamp to the frame edge`);
    claim('P8c_outside_fov_releases', ft.sideEligible && !ft.sideLabelled && ft.sideSkippedFrustum >= 1,
      `same position, looking 90° OFF-AXIS (contact still in front, outside the FOV cone): eligible=${ft.sideEligible} (rank unchanged) labelled=${ft.sideLabelled} skippedFrustum=${ft.sideSkippedFrustum}`);
    claim('P8d_recovers_when_back_in_frustum', ft.restoredEligible && ft.restoredLabelled, `looking back at contact, same position throughout: eligible=${ft.restoredEligible} labelled=${ft.restoredLabelled} — not permanently stuck released`);

    // P3 — no overlap where the pairs are densest (screen-space non-overlap is still enforced even
    // though the user now accepts fewer of the top-TOPN candidates actually getting a panel). MEASURED:
    // at only D_CLOSE from a dense contact, some of the top-TOPN nearest legitimately fall outside the
    // camera's FOV (angularly wide relative to the close distance) and are skippedFrustum, not
    // skippedOverlap — both are accounted for so the count reconciles exactly.
    const dn = await page.evaluate((d) => window.__cll.pickDense(d), 3.5);
    log(`§CLL_DENSE pair=${dn.pairId} neighboursWithin3.5m=${dn.neighboursWithin}`);
    await page.evaluate(() => window.__cll.reset());
    const rd = await page.evaluate((c, d) => window.__cll.at(c, d, 0), dn.contact, D_CLOSE);
    if (rd.eligible < 2) claim('P3_no_overlap_dense_cluster', false, `INCONCLUSIVE: only ${rd.eligible} eligible at the densest contact — non-overlap was not exercised`);
    else claim('P3_no_overlap_dense_cluster', noOverlap(rd.placed) && rd.labelled + rd.skipped + rd.skippedFrustum === rd.eligible && rd.eligible <= TOPN,
      `eligible=${rd.eligible} (cap ${TOPN}) labelled=${rd.labelled} skippedOverlap=${rd.skipped} skippedFrustum=${rd.skippedFrustum} rects=${rd.placed.map(q => q.w + 'x' + q.h + '@' + q.x + ',' + q.y).join(' ')}`);

    // P6 — the fade seam: labelled → marker solid (does not move with t); released → moves again
    await page.evaluate(() => window.__cll.reset());
    await page.evaluate((c, d) => window.__cll.at(c, d, 0), iso.contact, D_CLOSE);
    await page.evaluate((c, d) => window.__cll.at(c, d, 1.0), iso.contact, D_CLOSE);   // ≥ FADE_S of film time → fade reaches 1
    const on = await page.evaluate((i, p) => window.__cll.markerSolid(i, p), iso.i, st.periodS);
    await page.evaluate((c, d) => window.__cll.at(c, d, 2.0), iso.contact, FAR_D);
    await page.evaluate((c, d) => window.__cll.at(c, d, 3.0), iso.contact, FAR_D);
    const off = await page.evaluate((i, p) => window.__cll.markerSolid(i, p), iso.i, st.periodS);
    claim('P6_fade_seam_labelled_solid_released_pulsing', !!on && !!off && on.fade === 1 && on.a.sel === on.b.sel && on.a.amb !== on.b.amb && off.fade === 0 && off.a.sel !== off.b.sel,
      on && off ? `labelled: fade=${on.fade} marker T/4=${on.a.sel} 3T/4=${on.b.sel} (equal=solid) ambient ${on.a.amb}→${on.b.amb}; released: fade=${off.fade} marker ${off.a.sel}→${off.b.sel} (moves=pulsing)` : 'marker mesh not found');

    // P7 — the stored path: §P2.1 amended again means "eligible" is (almost) never empty any more (no
    // distance gate), so INCONCLUSIVE now means no pair was ever actually PLACED across the whole path.
    // farthestLabelledM is logged (not gated — a real path may or may not happen to cross a >10.6 m
    // approach that lands in the top-TOPN) as direct evidence for the range-limit removal.
    const pp = await page.evaluate((n) => window.__cll.pathProfile(n), 1500);
    if (pp.skip) claim('P7_stored_path_proximity', false, 'INCONCLUSIVE: ' + pp.skip);
    else {
      log(`§CLL_PATH_PROFILE samples=${pp.samples} durationSec=${pp.durationSec} framesWithEligible=${pp.framesWithEligible} framesWithLabel=${pp.framesWithLabel} maxEligible=${pp.maxEligible} maxLabelled=${pp.maxLabelled} nearestM=${pp.nearestM} farthestLabelledM=${pp.farthestLabelledM} overlaps=${pp.overlaps} rayDelta=${pp.rayDelta}`);
      // windows: runs of consecutive labelled samples
      const wins = []; let cur = null;
      pp.rows.forEach(r => { if (r[2] > 0) { if (cur && r[0] - cur.tEnd <= 1.5 / pp.samples) { cur.tEnd = r[0]; cur.n++; cur.maxE = Math.max(cur.maxE, r[1]); cur.maxL = Math.max(cur.maxL, r[2]); } else { cur = { tStart: r[0], tEnd: r[0], n: 1, maxE: r[1], maxL: r[2] }; wins.push(cur); } } });
      wins.forEach(wn => log(`§CLL_PATH_WINDOW t=${wn.tStart}→${wn.tEnd} samples=${wn.n} maxEligible=${wn.maxE} maxLabelled=${wn.maxL}`));
      if (!pp.framesWithLabel) claim('P7_stored_path_proximity', false, `INCONCLUSIVE: the stored path never actually placed a panel (nearest=${pp.nearestM} m, maxEligible=${pp.maxEligible}) — a bake of it would be VACUOUS for labels`);
      else claim('P7_stored_path_no_overlap_no_raycast', pp.overlaps === 0 && pp.rayDelta === 0 && pp.maxEligible <= TOPN,
        `labelled on ${pp.framesWithLabel}/${pp.samples} samples, maxEligible=${pp.maxEligible} (cap ${TOPN}) maxLabelled=${pp.maxLabelled}, farthestLabelledM=${pp.farthestLabelledM}, overlapping panel pairs=${pp.overlaps}, visibility calls=${pp.rayDelta}, enters=${pp.stats.enters} releases=${pp.stats.releases}`);
    }
  } catch (e) { log('§CLL_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; crashed = true; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  // A run that threw is INCONCLUSIVE (already printed) — the partial row set must NOT be scored as a
  // pass; a truncated witness reporting `pass=N fail=0` would be exactly the silent-green this lane exists to kill.
  if (!rows.length || crashed) return;
  Witness('clash_film_labels').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('every §CLASH_FILM_P2 claim holds (+ §P2.4 3rd row [tol mm / clash mm] composited from the rule and severityM, + §CLASH_HUD_CARD present only once the film is built and equal to its count): names extracted, rank selection (top-N, no distance limit, read from the module) with rank-anchored hysteresis and no strobe, occlusion never consulted and a hidden pair labelled, genuine out-of-frustum release (not a sticky edge-clamp) that recovers, no panel overlap, constant size, fade seam', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
