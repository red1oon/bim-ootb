#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CLASH_FILM_P1 (2026-09-04, bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P1 §5)
// Scope: viewer/clash_film.js — the mesh-true clash pairs drawn as persistent world content in a
// baked film. Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: a film is a permanent, shareable artefact, so a clash marker that
// is not real asserts to a client that a clash exists where none does. Measured on Terminal
// (#1676): broad=5961 → meshTrue=3951, i.e. 33.7% of the bounding-box list is FALSE. W1 is the
// claim that the film draws the mesh-true set and not that one.
// Also proves the two rules the user set: the markers are a FORECAST (present before the buildup
// places them — §3b), and the pulse is PER-INSTANCE so phase 2 can hold a labelled pair solid while
// the rest keep breathing (§4b, claim W5 — proven now so it is not a rewrite later).
//
// ══ W7-W10 — §CLASH_FILM_SHINE_THROUGH (2026-09-05, §CLASH_FILM_P3 item 2) ══════════════════════
// THE DEFECT: the marker material shipped with `depthTest: true` — normal z-testing, so a wall/
// slab in front of a marker correctly occluded it, contradicting the standing ruling that a
// pulsing pair shines through occlusion. Fix: `depthTest: false` (viewer/clash_film.js makeSide),
// matching the working precedent at measure.js:717-720 (CINEMA_PATH_EDITOR.md §CPE_CLASH_PIN item 2).
// A marker has no visibility SELECTION LIST the way a label does (§P2's technique of spying on a
// raycast and checking a "placed" array doesn't apply — every marker is always drawn, every frame,
// §3b), so this proves it the way the mechanism actually works: a REAL rendered frame with a
// synthetic opaque occluder between the camera and a pulsing pair's contact, pixel-read back via
// `A.renderer.readRenderTargetPixels` (same technique `witness_wall_side_light_floor.js` already
// uses for numeric pixel proof, not a screenshot), with a SABOTAGE control (force depthTest back to
// true, the pre-fix state) proving the occluder genuinely sits in front rather than assuming it.
// W10 proves the fix is material-level, not per-pair: ONE THREE.Material object drives the WHOLE
// InstancedMesh (every pulsing pair in the film), so there is no per-pair code path to miss.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / module absent / build refused), VACUOUS
// (trueClash=0 — a building with no clashes proves nothing about a clash renderer), RED CONTROL.
// Env: ROOT · BLD (default Hospital_silent_local) · BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8595);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_clash_film_markers.log';
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
function inconclusive(r) { log('§CLASH_FILM verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_CLASH_FILM_MARKERS pass=0 fail=0 ran=0 INCONCLUSIVE'); }

function pageProbe() {
  const A = window.APP;
  // §3b spy — the markers must be a FORECAST, so the module must never consult a placement predicate.
  window.__tmProbeCalls = 0;
  if (typeof A._tmIsVisible === 'function' && !A._tmIsVisible.__spied) {
    const orig = A._tmIsVisible.bind(A);
    const spy = function () { window.__tmProbeCalls++; return orig.apply(null, arguments); };
    spy.__spied = true; A._tmIsVisible = spy;
  }
  window.__cf = {
    beforeBuild: () => A.clashFilm.stats(),
    build: () => A.clashFilm.build().then(() => A.clashFilm.stats()),
    verdicts: () => { const p = A.clashFilm.pairs(); const bad = p.filter(r => r.verdict !== 'CLASH').length;
      return { n: p.length, notClash: bad, withContact: p.filter(r => r.contact).length, withPairId: p.filter(r => r.pairId).length,
               sample: p.slice(0, 3).map(r => ({ pairId: r.pairId, verdict: r.verdict, discA: r.discA, discB: r.discB, extentM: r.extentM })) }; },
    // sample the ambient pulse over one period, per instance 0
    pulseSeries: (period, n) => { const out = []; for (let i = 0; i < n; i++) out.push(+A.clashFilm.update(period * i / n).toFixed(6)); return out; },
    pureAt: (t) => [+A.clashFilm.update(t).toFixed(6), +A.clashFilm.update(t).toFixed(6)],
    // W5 — hold two instances solid, then confirm they do NOT move with t while the rest do
    fadeTest: (period) => { A.clashFilm.setFade(0, 1); A.clashFilm.setFade(1, 1);
      const mesh = A.scene.children.find(o => o.userData && o.userData.clashFilmSide === 'A');
      if (!mesh) return null;
      const read = (t) => { A.clashFilm.update(t); const c = mesh.instanceColor.array;
        return { sel0: +c[0].toFixed(6), sel1: +c[3].toFixed(6), amb: +c[c.length - 3].toFixed(6) }; };
      // Sample at the envelope's QUARTER points: on the shipped rise/hold/fall/rest envelope
      // (2/1/3/2 s, T=8 s) T/4 = 2.0 s is the start of the HOLD (envelope 1) and 3T/4 = 6.0 s is
      // the REST (envelope 0), so an ambient instance MUST differ between them. (The original
      // sine had the same trap at 0 and T/2 — both read 0.37 — which is why quarter points.)
      const a = read(period / 4), b = read(3 * period / 4);
      A.clashFilm.setFade(0, 0); A.clashFilm.setFade(1, 0);
      return { a, b }; },
    tmCalls: () => window.__tmProbeCalls,
    // W6 — §CLASH_FILM_SKY_WASH: put the camera at distance d from pair 0's contact, run one update,
    // and read the box that was actually PLACED against the one severity would have given. The
    // projected height in px is s / (2·d·tan(fov/2)) · h — the number the clamp exists to bound.
    clampAt: (d) => { const p = A.clashFilm.pairs()[0]; if (!p || !p.contact) return null;
      const cam = A.camera, keep = { p: cam.position.clone(), t: A.controls.target.clone() };
      const c = new THREE.Vector3(p.contact.x, p.contact.y, p.contact.z);
      cam.position.set(c.x + d, c.y, c.z); A.controls.target.copy(c); A.controls.update(); cam.updateMatrixWorld(true);
      A.clashFilm.update(0);
      const b = A.clashFilm.boxOf(0), st = A.clashFilm.stats(), h = A.renderer.domElement.height;
      const px = (m) => m / (2 * d * Math.tan(cam.fov * Math.PI / 360)) * h;
      cam.position.copy(keep.p); A.controls.target.copy(keep.t); A.controls.update(); cam.updateMatrixWorld(true);
      A.clashFilm.update(0);
      return { d, naturalM: +b.naturalM.toFixed(4), placedM: +b.placedM.toFixed(4), naturalPx: +px(b.naturalM).toFixed(1), placedPx: +px(b.placedM).toFixed(1),
               capPx: st.lastClamp && st.lastClamp.capPx, clampedN: st.lastClamp && st.lastClamp.clamped, h }; },
    markerCount: () => { const s = A.scene.children.filter(o => o.userData && o.userData.clashFilmSide); return s.reduce((n, m) => n + m.count, 0); },
    setCursor: (c) => { try { window.tmSetCursor(c); return true; } catch (e) { return false; } },
    // ── W7-W10 §CLASH_FILM_SHINE_THROUGH probe ──────────────────────────────────────────────────
    // Real occluder, real render, real pixel readback. `idx` = pair index (must have a contact).
    occlusionProbe: (idx) => {
      const meshA = A.scene.children.find(o => o.userData && o.userData.clashFilmSide === 'A');
      const meshB = A.scene.children.find(o => o.userData && o.userData.clashFilmSide === 'B');
      if (!meshA || !meshB) return null;
      const p = A.clashFilm.pairs()[idx];
      if (!p || !p.contact) return null;
      const st = A.clashFilm.stats();
      const tHold = st.riseS + st.holdS / 2;         // deterministic peak of the pulse envelope
      A.clashFilm.update(tHold);

      const contact = new THREE.Vector3(p.contact.x, p.contact.y, p.contact.z);
      const DIR = new THREE.Vector3(1, 0.35, 0.8).normalize();   // same fixed approach direction convention as witness_clash_film_labels.js
      const D = 5;
      const camPos = contact.clone().addScaledVector(DIR, D);
      const keep = { p: A.camera.position.clone(), t: A.controls.target.clone() };
      A.camera.position.copy(camPos);
      A.camera.lookAt(contact.x, contact.y, contact.z);
      A.camera.updateMatrixWorld(true);

      const proj = contact.clone().project(A.camera);
      const W = A.renderer.domElement.width, H = A.renderer.domElement.height;
      const px = Math.round((proj.x * 0.5 + 0.5) * W);
      const py = Math.round((1 - (proj.y * 0.5 + 0.5)) * H);

      // Ordinary opaque occluder — default depthTest:true/depthWrite:true — halfway between camera
      // and the contact, facing the camera, large enough to fully cover the marker's projection.
      const occGeo = new THREE.PlaneGeometry(6, 6);
      const occMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
      const occMesh = new THREE.Mesh(occGeo, occMat);
      occMesh.position.copy(camPos.clone().lerp(contact, 0.5));
      occMesh.lookAt(camPos);
      A.scene.add(occMesh);

      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
      const buf = new Float32Array(W * H * 4);
      function readAt(x, y) {
        A.renderer.setRenderTarget(rt);
        A.renderer.render(A.scene, A.camera);
        A.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        A.renderer.setRenderTarget(null);
        let maxLum = 0, n = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx, yy = H - 1 - (y + dy);   // WebGL readback rows are bottom-up
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const i = (yy * W + xx) * 4;
          const lum = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
          if (lum > maxLum) maxLum = lum;
          n++;
        }
        return { maxLum: +maxLum.toFixed(5), sampled: n };
      }

      const withOccluderFixed = readAt(px, py);

      // SABOTAGE control — force the SAME shared material's depthTest back to true (the pre-fix
      // state) and re-read. Proves the occluder genuinely sits in front (a real geometric fact,
      // not an assumption) and that this ONE property is what shine-through hinges on.
      const origDepthA = meshA.material.depthTest, origDepthB = meshB.material.depthTest;
      meshA.material.depthTest = true; meshB.material.depthTest = true;
      meshA.material.needsUpdate = true; meshB.material.needsUpdate = true;
      const withOccluderSabotaged = readAt(px, py);
      meshA.material.depthTest = origDepthA; meshB.material.depthTest = origDepthB;
      meshA.material.needsUpdate = true; meshB.material.needsUpdate = true;

      // Occluder alone — no clash markers in the scene at all (both meshes hidden).
      meshA.visible = false; meshB.visible = false;
      const occluderAlone = readAt(px, py);
      meshA.visible = true; meshB.visible = true;

      // Baseline — the marker with no occluder at all.
      A.scene.remove(occMesh);
      const noOccluder = readAt(px, py);

      A.camera.position.copy(keep.p); A.controls.target.copy(keep.t); A.controls.update(); A.camera.updateMatrixWorld(true);
      A.clashFilm.update(0);
      rt.dispose(); occGeo.dispose(); occMat.dispose();

      return {
        idx, px, py, W, H,
        materialDepthTestA: origDepthA, materialDepthTestB: origDepthB,
        materialIsSingleObject: !Array.isArray(meshA.material) && !Array.isArray(meshB.material),
        instanceCountA: meshA.count, instanceCountB: meshB.count, totalPairs: A.clashFilm.pairs().length,
        withOccluderFixed, withOccluderSabotaged, occluderAlone, noOccluder
      };
    }
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cfm-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§CFM_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 20 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  const rows = [];
  const claim = (name, ok, detail) => { rows.push({ claim: name, ok: ok ? 1 : 0, detail: String(detail).slice(0, 200) });
    log(`§CFM_CLAIM ${name} ${ok ? 'OK' : 'FAIL'} — ${detail}`); };
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CFM_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer, { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    const has = await page.evaluate(() => !!(window.APP.clashFilm && window.APP.clashFilm.build));
    if (!has) { inconclusive('clash_film.js not wired — A.clashFilm.build absent'); process.exitCode = 2; return; }
    await page.evaluate(pageProbe);

    // W4a — nothing before build
    const pre = await page.evaluate(() => window.__cf.beforeBuild());
    claim('W4a_no_markers_before_build', pre.markers === 0 && !pre.built, `markers=${pre.markers} built=${pre.built}`);

    const st = await page.evaluate(() => window.__cf.build());
    log(`§CFM_BUILT pairs=${st.pairs} markers=${st.markers} inScene=${st.inScene} periodS=${st.periodS} envelope=rise${st.riseS}/hold${st.holdS}/fall${st.fallS}/rest${st.restS} peak=${st.peak} markerMaxPx=${st.markerMaxPx}`);
    if (!st.pairs) { inconclusive(`trueClash=0 on ${BLD} — a building with no clashes proves nothing about a clash renderer (VACUOUS)`); process.exitCode = 2; return; }

    // W1 — the markers ARE the mesh-true set
    const v = await page.evaluate(() => window.__cf.verdicts());
    claim('W1_every_pair_is_mesh_true', v.notClash === 0, `pairs=${v.n} notCLASH=${v.notClash}`);
    claim('W1b_markers_are_two_per_pair', st.markers === st.pairs * 2, `markers=${st.markers} pairs=${st.pairs}`);
    claim('W1c_film_lane_fields_present', v.withContact === v.n && v.withPairId === v.n, `contact=${v.withContact}/${v.n} pairId=${v.withPairId}/${v.n}`);
    log('§CFM_SAMPLE ' + JSON.stringify(v.sample));

    // W2 — persistence, and the forecast rule: independent of the TM cursor
    const drawnStart = await page.evaluate(() => window.__cf.markerCount());
    let moved = false;
    try {
      const bk = await page.evaluate(() => (typeof window.tmActivateForBake === 'function') ? window.tmActivateForBake() : null);
      if (bk) { const tl = await page.evaluate(() => window.tmFollowTimeline());
        if (tl && tl.projectEnd > tl.projectStart) {
          await page.evaluate(c => window.__cf.setCursor(c), tl.projectStart);
          const atDay0 = await page.evaluate(() => window.__cf.markerCount());
          await page.evaluate(c => window.__cf.setCursor(c), tl.projectEnd);
          const atEnd = await page.evaluate(() => window.__cf.markerCount());
          moved = true;
          claim('W2_markers_survive_the_TM_cursor', atDay0 === drawnStart && atEnd === drawnStart,
            `atStart=${drawnStart} atDay0=${atDay0} atEnd=${atEnd} — a forecast does not change with the buildup`);
        } }
    } catch (e) { logRaw('[tm] ' + e.message); }
    if (!moved) claim('W2_markers_survive_the_TM_cursor', false, 'INCONCLUSIVE: the Time Machine would not arm, so persistence across the buildup was NOT judged');
    const tmCalls = await page.evaluate(() => window.__cf.tmCalls());
    // Asserted on the SPY COUNT, not hardcoded (review of #1678 found `true` here — a claim that
    // could never fail). A non-zero count means the forecast was turned back into a state readout.
    claim('W2b_no_placement_predicate_consulted', tmCalls === 0, `A._tmIsVisible calls seen during build+update: ${tmCalls} (must be 0 — the narrow phase legitimately uses none; a non-zero count here would mean the markers were being gated)`);

    // W3 — the pulse is a pure function of film time, and it actually moves
    const pure = await page.evaluate(() => window.__cf.pureAt(1.234));
    claim('W3a_pulse_is_pure_in_film_time', pure[0] === pure[1], `update(1.234) twice → ${pure[0]} , ${pure[1]}`);
    const series = await page.evaluate(p => window.__cf.pulseSeries(p, 16), st.periodS);
    const amp = Math.max.apply(null, series) - Math.min.apply(null, series);
    claim('W3b_pulse_amplitude_nonzero', amp > 0.05, `min=${Math.min.apply(null, series).toFixed(3)} max=${Math.max.apply(null, series).toFixed(3)} swing=${amp.toFixed(3)} (a pulse that never changes opacity is a no-op dressed as a feature)`);

    // W5 — the per-instance channel phase 2 depends on
    const f = await page.evaluate(p => window.__cf.fadeTest(p), st.periodS);
    if (!f) claim('W5_per_instance_fade_holds_solid', false, 'INCONCLUSIVE: the A-side marker mesh was not found in the scene');
    else claim('W5_per_instance_fade_holds_solid',
      f.a.sel0 === f.b.sel0 && f.a.sel1 === f.b.sel1 && f.a.amb !== f.b.amb,
      `selected(0,1) at t=0 → ${f.a.sel0},${f.a.sel1} and at t=T/2 → ${f.b.sel0},${f.b.sel1} (must be equal); an ambient instance moved ${f.a.amb} → ${f.b.amb} (must differ)`);

    // W6 — §CLASH_FILM_SKY_WASH: the marker is clamped to a constant small SCREEN size. The defect
    // this proves or disproves: a marker near the lens ballooned to 15.9 % of the frame and washed
    // the sky (control diff, 2026-09-05). Near: the placed box must project to ≤ capPx while the
    // severity box would have projected far larger. Far: the severity box is untouched.
    const near = await page.evaluate(d => window.__cf.clampAt(d), 0.8);
    const far = await page.evaluate(d => window.__cf.clampAt(d), 30);
    if (!near || !far) claim('W6_marker_clamped_to_screen_size', false, 'INCONCLUSIVE: pair 0 has no contact — the clamp was not judged');
    else {
      const capPx = Math.round(st.markerMaxPx * near.h);
      claim('W6_marker_clamped_to_screen_size',
        near.placedPx <= capPx + 1 && near.placedM < near.naturalM && near.naturalPx > capPx && far.placedM === far.naturalM,
        `at ${near.d} m: severity box ${near.naturalM} m would be ${near.naturalPx} px, placed ${near.placedM} m = ${near.placedPx} px (cap ${capPx} px @${near.h}, clamped=${near.clampedN}); ` +
        `at ${far.d} m: placed ${far.placedM} m = severity ${far.naturalM} m (untouched)`);
    }

    // W7-W10 — §CLASH_FILM_SHINE_THROUGH: real occluder, real render, real pixel readback.
    const occIdx = await page.evaluate(() => window.APP.clashFilm.pairs().findIndex(p => !!p.contact));
    if (occIdx < 0) {
      claim('W7_marker_shines_through_occluder', false, 'INCONCLUSIVE: no pair in this building has a contact point — occlusion was not judged');
    } else {
      const occ = await page.evaluate(i => window.__cf.occlusionProbe(i), occIdx);
      log('§CFM_OCCLUSION ' + JSON.stringify(occ));
      if (!occ) {
        claim('W7_marker_shines_through_occluder', false, 'INCONCLUSIVE: occlusionProbe returned null');
      } else {
        // W10 — structural: ONE material object drives the WHOLE InstancedMesh, so the fix is
        // material-level, not per-pair — there is no per-pair code path that could miss one.
        claim('W10_fix_is_material_level_not_per_pair',
          occ.materialIsSingleObject && occ.instanceCountA === occ.totalPairs && occ.instanceCountB === occ.totalPairs,
          `single material object=${occ.materialIsSingleObject}  instancesA=${occ.instanceCountA} instancesB=${occ.instanceCountB} totalPairs=${occ.totalPairs} (one material governs every pulsing pair in one draw call)`);
        // W9 — the fix is live: depthTest is false on both sides' shared material.
        claim('W9_depthTest_is_false_on_the_shared_material',
          occ.materialDepthTestA === false && occ.materialDepthTestB === false,
          `depthTestA=${occ.materialDepthTestA} depthTestB=${occ.materialDepthTestB}`);
        // W8 — SABOTAGE control: forcing depthTest back to true (the pre-fix state) reproduces
        // occlusion — the occluder pixel with the marker sabotaged-hidden matches the occluder-alone
        // reading (within float-render noise), proving the occluder genuinely sits in front.
        const sabotageMatchesAlone = Math.abs(occ.withOccluderSabotaged.maxLum - occ.occluderAlone.maxLum) < 0.01;
        claim('W8_sabotage_control_reproduces_occlusion_pre_fix',
          sabotageMatchesAlone,
          `sabotaged(depthTest=true)=${occ.withOccluderSabotaged.maxLum}  occluderAlone(no marker)=${occ.occluderAlone.maxLum}  |Δ|=${Math.abs(occ.withOccluderSabotaged.maxLum - occ.occluderAlone.maxLum).toFixed(5)} (must be ~0 — the occluder alone, with no marker light reaching the pixel, is indistinguishable from a fully-occluded marker under the OLD depthTest:true behaviour)`);
        // W7 — THE FIX ITSELF: with the shipped depthTest:false, the same occluded pixel is
        // measurably brighter than the occluder-alone control — the marker's light is reaching the
        // camera THROUGH the occluder, exactly the "shine through walls" behaviour this closes.
        const shineDelta = occ.withOccluderFixed.maxLum - occ.occluderAlone.maxLum;
        claim('W7_marker_shines_through_occluder',
          shineDelta > 0.02 && occ.withOccluderFixed.maxLum > occ.withOccluderSabotaged.maxLum,
          `withOccluder+fix=${occ.withOccluderFixed.maxLum}  occluderAlone=${occ.occluderAlone.maxLum}  Δ=+${shineDelta.toFixed(5)}  ` +
          `noOccluder(baseline, unoccluded)=${occ.noOccluder.maxLum}  sabotaged=${occ.withOccluderSabotaged.maxLum} ` +
          `(fixed reading must clear the occluder-alone floor by a real margin and exceed the sabotaged reading — the marker is visibly contributing light at this pixel despite the opaque occluder in front of it)`);
      }
    }
  } catch (e) { log('§CFM_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length) return;
  Witness('clash_film_markers').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('every §CLASH_FILM_P1/P3 claim holds: the markers are the mesh-true set, they survive the buildup, the pulse is pure in film time and non-zero, the per-instance fade holds a pair solid, and the markers shine through occluding geometry (material-level, all pairs) same as the working measure.js precedent', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
