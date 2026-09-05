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
    setCursor: (c) => { try { window.tmSetCursor(c); return true; } catch (e) { return false; } }
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
  } catch (e) { log('§CFM_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length) return;
  Witness('clash_film_markers').population(() => rows)
    .schema({ type: 'object', required: ['claim', 'ok'], properties: { claim: { type: 'string', minLength: 1 }, ok: { type: 'integer', minimum: 0, maximum: 1 }, detail: { type: 'string' } } })
    .invariant('every §CLASH_FILM_P1 claim holds: the markers are the mesh-true set, they survive the buildup, the pulse is pure in film time and non-zero, and the per-instance fade holds a pair solid', rs => rs.every(r => r.ok === 1))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].ok = 0; return c; })
    .run();
  logStream.end();
})();
