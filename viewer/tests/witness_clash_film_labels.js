#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_FILM_P2 (2026-09-05, bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P2 §P2.5)
// Scope: viewer/clash_labels.js — the in-scene label for a clash pair within 4 m of the camera in
// a baked film. Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: the user ruled (verbatim in the spec) that a pair within 4 m bears
// a label "even though behind close doors/walls/obstruction", that the count is limited only by
// screen-space non-overlap, and that the panel keeps a constant screen size. Each claim below can
// come back NO — and P2 is the one a well-meaning "fix" would break: a selector that raycasts for
// visibility and hides an occluded pair is a REGRESSION against the ruling, so this witness places a
// synthetic occluder between camera and contact, proves with its OWN raycast that the pair is hidden,
// and asserts the label is there anyway with zero raycasts made by the module.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / module absent / build refused), VACUOUS
// (trueClash=0), path-profile INCONCLUSIVE (the stored path never comes within 4 m), RED CONTROL.
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
  const compact = r => ({ eligible: r.eligible, labelled: r.labelled, skipped: r.skippedOverlap, entered: r.entered, released: r.released, nearest: +r.nearestM.toFixed(3),
    placed: r.placed.map(q => ({ i: q.i, pairId: q.pairId, x: q.x, y: q.y, w: q.w, h: q.h, d: +q.d.toFixed(3), behind: q.behind, alpha: +q.alpha.toFixed(3) })) });
  const upd = fs => compact(A.clashLabels.update(A.camera, fs, W, H));
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
    sweep: (c, from, to, step, idx) => { const out = []; let d = from; const dir = to > from ? 1 : -1; let fs = 0;
      while (dir > 0 ? d <= to + 1e-9 : d >= to - 1e-9) { pose(c, d); const r = A.clashLabels.update(A.camera, fs += 0.1, W, H); out.push([+d.toFixed(3), r.placed.some(q => q.i === idx) ? 1 : 0]); d += dir * step; }
      return out; },
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
    pathProfile: (n) => {
      A.camera.position.copy(camLoad.p); A.controls.target.copy(camLoad.t); A.camera.lookAt(camLoad.t); A.camera.updateMatrixWorld(true); A.controls.update();
      try { if (typeof A.cinemaPathPlan === 'function') A.cinemaPathPlan(60); } catch (e) {}
      const ov = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null; if (!ov) return { skip: 'no stored cinema_path' };
      let dur = (typeof ov._total === 'number' && ov._total > 0) ? ov._total : 60;
      let plan; try { plan = A.cinemaPathPlan(dur, ov); if (plan && plan.naturalTotal > 0) { dur = plan.naturalTotal; plan = A.cinemaPathPlan(dur, ov); } } catch (e) { return { skip: 'plan failed: ' + e.message }; }
      A.clashLabels.reset(); const rows = [], overl = []; let withElig = 0, maxE = 0, maxL = 0, nearest = 1e9, r0 = window.__rayCalls;
      for (let k = 0; k < n; k++) { const t = k / (n - 1); const p = plan.poseAt(t);
        A.camera.position.set(p.x, p.y, p.z); A.camera.lookAt(p.tx, p.ty, p.tz); A.camera.updateMatrixWorld(true);
        const r = A.clashLabels.update(A.camera, t * dur, W, H, k); nearest = Math.min(nearest, r.nearestM);
        if (r.eligible) { withElig++; rows.push([+t.toFixed(4), r.eligible, r.labelled, r.skippedOverlap, +r.nearestM.toFixed(2)]); }
        maxE = Math.max(maxE, r.eligible); maxL = Math.max(maxL, r.labelled);
        for (let a = 0; a < r.placed.length; a++) for (let b = a + 1; b < r.placed.length; b++) { const A1 = r.placed[a], B1 = r.placed[b];
          if (A1.x < B1.x + B1.w && B1.x < A1.x + A1.w && A1.y < B1.y + B1.h && B1.y < A1.y + A1.h) overl.push([+t.toFixed(4), A1.pairId, B1.pairId]); } }
      return { samples: n, durationSec: +dur.toFixed(1), framesWithEligible: withElig, maxEligible: maxE, maxLabelled: maxL, nearestM: +nearest.toFixed(2), overlaps: overl.length, rows, rayDelta: window.__rayCalls - r0, stats: A.clashLabels.stats() }; }
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
    const st = await page.evaluate(() => window.__cll.build());
    log(`§CLL_BUILT pairs=${st.pairs} markers=${st.markers} periodS=${st.periodS}`);
    if (!st.pairs) { inconclusive(`trueClash=0 on ${BLD} — a building with no clashes proves nothing about a clash label (VACUOUS)`); process.exitCode = 2; return; }

    // P0 — the names are extracted, not invented
    const names = await page.evaluate(() => window.__cll.names());
    names.forEach(n => log(`§CLL_NAME ${n.cls} → "${n.name}" source=${n.source}${n.desc ? ' desc="' + n.desc + '"' : ''}`));
    const badName = names.filter(n => !n.name || (n.source === 'rates.js' ? !n.desc : n.name !== n.cls));
    claim('P0_names_extracted_from_rates_or_raw_class', badName.length === 0, `classes=${names.length} viaRates=${names.filter(n => n.source === 'rates.js').length} rawFallback=${names.filter(n => n.source !== 'rates.js').length} bad=${badName.length}`);

    // The distances are DATA read from the module (§P2.1 amended 2026-09-05: 4.0/4.6 → 10.0/10.6), so
    // every probe distance below is derived from the live enter/release, not pinned to a number that
    // silently goes stale the next time the ruling moves.
    const lim = await page.evaluate(() => { const s = window.APP.clashLabels.stats(); return { E: s.enterM, R: s.releaseM }; });
    const E = lim.E, R = lim.R, GAP = R - E;
    const dIn = +(E * 0.875).toFixed(2), dMid = +(E + GAP / 2).toFixed(2), dOut = +(R + 0.1).toFixed(2), dFar = +(R + 1.4).toFixed(2), dNear = +(E * 0.5).toFixed(2);
    log(`§CLL_LIMITS enter=${E}m release=${R}m gap=${GAP.toFixed(2)}m probes: in=${dIn} mid=${dMid} out=${dOut} far=${dFar} near=${dNear}`);
    if (!(E > 0 && R > E)) { inconclusive(`clashLabels.stats() enter=${E} release=${R} — not a usable rule, nothing judged`); process.exitCode = 2; return; }

    // P1 — the enter-distance rule, with hysteresis, on the most isolated pair (so contention cannot confound it)
    const iso = await page.evaluate(() => window.__cll.pickIsolated());
    log(`§CLL_ISOLATED pair=${iso.pairId} i=${iso.i} isolationM=${iso.isolationM} ${iso.classA}×${iso.classB}`);
    await page.evaluate(() => window.__cll.reset());
    const r35 = await page.evaluate((c, d) => window.__cll.at(c, d, 0), iso.contact, dIn);
    const has35 = r35.placed.some(q => q.i === iso.i);
    claim('P1a_pair_within_enter_is_labelled', has35 && r35.placed.every(q => q.d <= E), `d=${dIn} (enter ${E}) labelled=${has35} eligible=${r35.eligible} labelled=${r35.labelled} maxPlacedD=${Math.max(...r35.placed.map(q => q.d)).toFixed(2)} entered=${r35.entered.join(',')}`);
    const r43 = await page.evaluate((c, d) => window.__cll.at(c, d, 0.1), iso.contact, dMid);
    claim('P1b_hysteresis_holds_between_enter_and_release', r43.placed.some(q => q.i === iso.i), `d=${dMid} after entering at ${dIn}: labelled=${r43.placed.some(q => q.i === iso.i)} released=${r43.released.join(',') || '-'}`);
    const r47 = await page.evaluate((c, d) => window.__cll.at(c, d, 0.2), iso.contact, dOut);
    claim('P1c_released_beyond_release', !r47.placed.some(q => q.i === iso.i) && r47.released.length === 1, `d=${dOut} (release ${R}): labelled=${r47.placed.some(q => q.i === iso.i)} released=${r47.released.join(',') || '-'}`);
    const r43b = await page.evaluate((c, d) => window.__cll.at(c, d, 0.3), iso.contact, dMid);
    claim('P1d_no_reentry_above_enter', !r43b.placed.some(q => q.i === iso.i) && r43b.entered.length === 0, `d=${dMid} after release: labelled=${r43b.placed.some(q => q.i === iso.i)} entered=${r43b.entered.join(',') || '-'}`);

    // P4 — no strobe: one straight pass in and out through the boundary flips state exactly twice
    await page.evaluate(() => window.__cll.reset());
    const sw = await page.evaluate((c, i, a, b) => window.__cll.sweep(c, a, b, 0.02, i).concat(window.__cll.sweep(c, b + 0.02, a, 0.02, i)), iso.contact, iso.i, dFar, dNear);
    let flips = 0, enterAt = null, releaseAt = null;
    for (let k = 1; k < sw.length; k++) if (sw[k][1] !== sw[k - 1][1]) { flips++; if (sw[k][1]) enterAt = sw[k][0]; else releaseAt = sw[k][0]; }
    claim('P4_no_strobe_two_transitions_per_pass', flips === 2 && enterAt !== null && enterAt <= E && enterAt > E - 0.03 && releaseAt !== null && releaseAt >= R && releaseAt < R + 0.03,
      `steps=${sw.length} flips=${flips} enterAt=${enterAt}m releaseAt=${releaseAt}m (expected ≤${E.toFixed(2)} and ≥${R.toFixed(2)}, 0.02 m steps, pass ${dFar}→${dNear}→${dFar})`);

    // P5 — constant size: the panel's pixel box at 1 m equals the box just inside the enter distance
    await page.evaluate(() => window.__cll.reset());
    const dEdge = +(E - 0.1).toFixed(2);
    const r1 = await page.evaluate((c) => window.__cll.at(c, 1.0, 0), iso.contact);
    const r39 = await page.evaluate((c, d) => window.__cll.at(c, d, 0.1), iso.contact, dEdge);
    const b1 = r1.placed.find(q => q.i === iso.i), b39 = r39.placed.find(q => q.i === iso.i);
    claim('P5_constant_screen_size', !!b1 && !!b39 && b1.w === b39.w && b1.h === b39.h, `at 1.0 m ${b1 ? b1.w + 'x' + b1.h : 'none'} px; at ${dEdge} m ${b39 ? b39.w + 'x' + b39.h : 'none'} px (frame ${sz.W}x${sz.H})`);

    // P2 — occlusion is NOT consulted, and a hidden pair IS labelled
    await page.evaluate(() => window.__cll.reset());
    const oc = await page.evaluate((c, d) => window.__cll.occluded(c, d), iso.contact, dIn);
    const ocLabelled = oc.rec.placed.some(q => q.i === iso.i);
    claim('P2a_no_visibility_call_in_selection', oc.rec.rayDelta === 0, `raycast/BVH calls made by the selector: ${oc.rec.rayDelta} (must be 0)`);
    claim('P2b_pair_behind_a_wall_is_labelled', oc.hiddenByOccluder && ocLabelled, `occluder hit at ${oc.occluderHitAtM} m, contact at ${oc.contactAtM} m → hidden=${oc.hiddenByOccluder}; labelled=${ocLabelled} (the user ruled it in; a fix that hides it is a regression)`);

    // P3 — no overlap where the pairs are densest
    const dn = await page.evaluate((d) => window.__cll.pickDense(d), dIn);
    log(`§CLL_DENSE pair=${dn.pairId} neighboursWithin${dIn}m=${dn.neighboursWithin}`);
    await page.evaluate(() => window.__cll.reset());
    const rd = await page.evaluate((c, d) => window.__cll.at(c, d, 0), dn.contact, dNear);
    if (rd.eligible < 2) claim('P3_no_overlap_dense_cluster', false, `INCONCLUSIVE: only ${rd.eligible} eligible at the densest contact — non-overlap was not exercised`);
    else claim('P3_no_overlap_dense_cluster', noOverlap(rd.placed) && rd.labelled + rd.skipped === rd.eligible, `eligible=${rd.eligible} labelled=${rd.labelled} skippedOverlap=${rd.skipped} rects=${rd.placed.map(q => q.w + 'x' + q.h + '@' + q.x + ',' + q.y).join(' ')}`);

    // P6 — the fade seam: labelled → marker solid (does not move with t); released → moves again
    await page.evaluate(() => window.__cll.reset());
    const dHold = +(E * 0.75).toFixed(2);
    await page.evaluate((c, d) => window.__cll.at(c, d, 0), iso.contact, dHold);
    await page.evaluate((c, d) => window.__cll.at(c, d, 1.0), iso.contact, dHold);   // ≥ FADE_S of film time → fade reaches 1
    const on = await page.evaluate((i, p) => window.__cll.markerSolid(i, p), iso.i, st.periodS);
    await page.evaluate((c, d) => window.__cll.at(c, d, 2.0), iso.contact, dFar);
    await page.evaluate((c, d) => window.__cll.at(c, d, 3.0), iso.contact, dFar);
    const off = await page.evaluate((i, p) => window.__cll.markerSolid(i, p), iso.i, st.periodS);
    claim('P6_fade_seam_labelled_solid_released_pulsing', !!on && !!off && on.fade === 1 && on.a.sel === on.b.sel && on.a.amb !== on.b.amb && off.fade === 0 && off.a.sel !== off.b.sel,
      on && off ? `labelled: fade=${on.fade} marker T/4=${on.a.sel} 3T/4=${on.b.sel} (equal=solid) ambient ${on.a.amb}→${on.b.amb}; released: fade=${off.fade} marker ${off.a.sel}→${off.b.sel} (moves=pulsing)` : 'marker mesh not found');

    // P7 — the stored path: where does the real film come within the enter distance? (drives the clip choice; INCONCLUSIVE if never)
    const pp = await page.evaluate(() => window.__cll.pathProfile(1500));
    if (pp.skip) claim('P7_stored_path_proximity', false, 'INCONCLUSIVE: ' + pp.skip);
    else {
      log(`§CLL_PATH_PROFILE samples=${pp.samples} durationSec=${pp.durationSec} framesWithEligible=${pp.framesWithEligible} maxEligible=${pp.maxEligible} maxLabelled=${pp.maxLabelled} nearestM=${pp.nearestM} overlaps=${pp.overlaps} rayDelta=${pp.rayDelta}`);
      // windows: runs of consecutive eligible samples
      const wins = []; let cur = null;
      pp.rows.forEach(r => { if (cur && r[0] - cur.tEnd <= 1.5 / pp.samples) { cur.tEnd = r[0]; cur.n++; cur.maxE = Math.max(cur.maxE, r[1]); cur.maxL = Math.max(cur.maxL, r[2]); } else { cur = { tStart: r[0], tEnd: r[0], n: 1, maxE: r[1], maxL: r[2] }; wins.push(cur); } });
      wins.forEach(wn => log(`§CLL_PATH_WINDOW t=${wn.tStart}→${wn.tEnd} samples=${wn.n} maxEligible=${wn.maxE} maxLabelled=${wn.maxL}`));
      if (!pp.framesWithEligible) claim('P7_stored_path_proximity', false, `INCONCLUSIVE: the stored path never comes within ${E} m of a pair (nearest=${pp.nearestM} m) — a bake of it would be VACUOUS for labels`);
      else claim('P7_stored_path_no_overlap_no_raycast', pp.overlaps === 0 && pp.rayDelta === 0, `eligible on ${pp.framesWithEligible}/${pp.samples} samples, maxEligible=${pp.maxEligible} maxLabelled=${pp.maxLabelled}, overlapping panel pairs=${pp.overlaps}, visibility calls=${pp.rayDelta}, enters=${pp.stats.enters} releases=${pp.stats.releases}`);
    }
  } catch (e) { log('§CLL_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; crashed = true; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  // A run that threw is INCONCLUSIVE (already printed) — the partial row set must NOT be scored as a
  // pass; a truncated witness reporting `pass=N fail=0` would be exactly the silent-green this lane exists to kill.
  if (!rows.length || crashed) return;
  Witness('clash_film_labels').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('every §CLASH_FILM_P2 claim holds: names extracted, enter/release (read from the module) with no strobe, occlusion never consulted and a hidden pair labelled, no panel overlap, constant size, fade seam', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
