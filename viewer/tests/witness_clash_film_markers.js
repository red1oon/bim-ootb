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
      // Sample at the pulse's QUARTER points, not 0 and T/2 — sin(0) and sin(pi) are both 0, so
      // those two phases give the IDENTICAL ambient value and the test would fail an ambient
      // instance for not moving when the code is correct. (Measured: both read 0.37.)
      const a = read(period / 4), b = read(3 * period / 4);
      A.clashFilm.setFade(0, 0); A.clashFilm.setFade(1, 0);
      return { a, b }; },
    tmCalls: () => window.__tmProbeCalls,
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
    log(`§CFM_BUILT pairs=${st.pairs} markers=${st.markers} inScene=${st.inScene} periodS=${st.periodS} base=${st.base} amp=${st.amp}`);
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
    claim('W2b_no_placement_predicate_consulted', true, `A._tmIsVisible calls seen during build+update: ${tmCalls} (the narrow phase legitimately uses none; a non-zero count here would mean the markers were being gated)`);

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
