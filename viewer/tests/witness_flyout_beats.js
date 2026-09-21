#!/usr/bin/env node
// WITNESS — flyout_beats: §FLYOUT_BEATS, the wing spans and facade heights said on the pull-out's
// clean canvas. Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §38.2 (the user's ask) + §40.3
// (the contract, and the PoC scripts/poc_flyout_beats.js whose numbers this must reproduce).
// Witness id: W-FLYOUT-BEATS.
//
// ISSUE THIS PROVES OR DISPROVES: the user watched 79 seconds of clean fly-out canvas with nothing
// measured on it. Does cpe_flyout_beats.js now find the plate's WINGS (real rectangles with real
// lengths, a corridor run rejected), the roof-edge-to-window-sill height per facade (both figures
// straight from the DB), and slot them into that window only where the WHOLE dimension is held in
// frame — without colliding with any other layer's window?
// It can say NO: INCONCLUSIVE (no plan/raster/camera), VACUOUS (nothing cleared the bar — HHS has no
// pull-out stretch at all and must say so), and each rejection is named.
//
// POPULATION: one row per SUBJECT — every wing and every facade the build considered, cued or not,
// carrying its measured geometry, its held-legibility score and the rule that rejected it.
// Red control: a cued beat's stated metres is moved 1 m off its own measured length.
//
// Command: node viewer/tests/witness_flyout_beats.js [--db Hospital_silent_local] [--dur 195.79] [--nostream] [--port 8576]
// Log Mandate: tee to out/witness_flyout_beats.log and read it.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +arg('port', 8576), DB = arg('db', 'Hospital_silent_local');
const DUR_ARG = arg('dur', null) ? +arg('dur') : null;
const NOSTREAM = process.argv.includes('--nostream');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream',
  '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(ROOT, u.replace(/^\/+/, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072', '--disable-extensions', '--disable-background-networking'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§FLYOUT_BEAT|§SLAB_BEAT|§FLYTHRU_ENVELOPE|§CPE_BUILDUP_PACING|§CPE_BUILDUP_SOURCE|§ROOM_HOME|§LOAD_FAIL|PAGEERROR/.test(t)) console.log('  ' + t); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  console.log('§WITNESS_FLYOUT_BEATS_ENV db=' + DB + ' stream=' + (NOSTREAM ? 0 : 1) + ' port=' + PORT);
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // the service worker serves stale JS at a fixed ?v= — unregister, clear, reload (snap_timeline.js's own lesson)
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.flyoutBeatsBuild, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  if (!NOSTREAM) {
    await p.waitForFunction(() => window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming,
      { timeout: 1500000, polling: 2000 });
    console.log('§WITNESS_SLAB_BEAT_STREAMED meshes=' + await p.evaluate(() => window.APP.scene ? window.APP.scene.children.length : -1));
  }
  // §33 — does the camera at this stage frame the WHOLE envelope (all 8 DB-bbox corners inside the frustum)?
  const camAt = async (stage) => { const c = await p.evaluate(() => { const A = window.APP, T = window.THREE; if (!A.camera) return null;
      const pos = [+A.camera.position.x.toFixed(1), +A.camera.position.y.toFixed(1), +A.camera.position.z.toFixed(1)];
      let k = null, dist = null;
      try {
        const r = A.dbQuery('SELECT MIN(center_x-bbox_x/2),MAX(center_x+bbox_x/2),MIN(center_y-bbox_y/2),MAX(center_y+bbox_y/2),MIN(center_z-bbox_z/2),MAX(center_z+bbox_z/2) FROM element_transforms')[0];
        A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix(); k = 0;
        const ctr = A.ifc2three((r[0]+r[1])/2, (r[2]+r[3])/2, (r[4]+r[5])/2); dist = +Math.hypot(ctr.x-A.camera.position.x, ctr.y-A.camera.position.y, ctr.z-A.camera.position.z).toFixed(1);
        [[0,2,4],[1,2,4],[0,3,4],[1,3,4],[0,2,5],[1,2,5],[0,3,5],[1,3,5]].forEach(ix => { const v = A.ifc2three(r[ix[0]], r[ix[1]], r[ix[2]]);
          const q = new T.Vector3(v.x, v.y, v.z).project(A.camera); if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1) k++; });
      } catch (e) { k = 'err:' + e.message; }
      return { pos, envelopeCorners: k, distToCentre: dist }; });
    console.log('§WITNESS_FLYOUT_BEATS_CAM stage=' + stage + ' ' + JSON.stringify(c)); return c; };
  await camAt('after-load');
  // Home frame first — §33 §CLI_BAKE_OPENING, the same key the bake now presses
  await p.evaluate(() => { try { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); } catch (e) {} });
  await sleep(300);
  await camAt('after-home');
  // prime the Time Machine exactly as cli_silent_bake.js does before a buildup bake
  const prime = await p.evaluate(async () => {
    if (typeof window.tmActivateForBake !== 'function') return 'no-hook';
    let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake();
    return ok ? 'ok' : 'FAILED';
  });
  console.log('§WITNESS_FLYOUT_BEATS_TM_PRIME ' + prime);
  await camAt('after-tm-prime');

  const out = await p.evaluate((durArg) => {
    const A = window.APP, R = { pageErr: null };
    try {
      const bk = (typeof window.tmFollowTimeline === 'function') ? window.tmFollowTimeline() : null;
      let plan0 = A.cinemaPathPlan(60);
      const dur = durArg || (plan0 && plan0.naturalTotal) || 195.8;
      R.durSrc = durArg ? '--dur' : (plan0 && plan0.naturalTotal ? 'plan.naturalTotal' : 'default 195.8');
      const plan = A.cinemaPathPlan(dur);
      R.dur = dur; R.beats = plan && plan.beats; R.bk = !!bk;
      // the bake's own build ORDER (§14 across layers): cues, then the plate, the linear beat and the
      // indoor beats, and the fly-out beats LAST so they see every taken window.
      try { A.flythruCuesBuild(plan, dur); } catch (e) { R.cuesErr = e.message; }
      try { A.slabBeatBuild(plan, dur, bk, dur); } catch (e) { R.slabErr = e.message; }
      try { if (A.linearBeatBuild) A.linearBeatBuild(plan, dur, bk, dur); } catch (e) { R.linErr = e.message; }
      try { if (A.indoorBeatsBuild) A.indoorBeatsBuild(plan, dur, bk); } catch (e) { R.indErr = e.message; }
      R.taken = [];
      if (typeof A.flythruCuesWindows === 'function') A.flythruCuesWindows().forEach(w => R.taken.push({ who: 'cue:' + w.key, from: w.from, to: w.to }));
      const sb = A.slabBeatReport && A.slabBeatReport();
      if (sb && sb.state === 'BEAT') R.taken.push({ who: 'plate', from: sb.beat.sec, to: sb.beat.sec + 2.7 });
      const ib = A.indoorBeatsReport && A.indoorBeatsReport();
      if (ib && ib.beats) ib.beats.forEach(b => { if (b.sec != null) R.taken.push({ who: 'indoor:' + b.key, from: b.sec, to: b.sec + 2.7 }); });

      R.rep = A.flyoutBeatsBuild(plan, dur);

      // drive the 2D pass at each cued beat's own peak second, exactly as _captureFrame does: arm the
      // boxes, reset the Measure queue, composite. A recording context catches the arrow draws.
      R.frames = [];
      try {
        A.filmBoxesArm(1280, 720, { pos: 'tr', day: true, overview: true, stats: true });
        (R.rep.beats || []).forEach(b => {
          [-0.2, 0.3, 1.0, 2.5].forEach(dt => {
            const sec = b.sec + dt, u = Math.max(0, Math.min(1, sec / dur));
            const pz = plan.poseAt(u);
            A.camera.position.set(pz.x, pz.y, pz.z); A.camera.lookAt(pz.tx, pz.ty, pz.tz); A.camera.updateMatrixWorld(true);
            let strokes = 0, texts = [];
            const ctx = { save() {}, restore() {}, beginPath() { }, moveTo() {}, lineTo() {}, closePath() {},
              stroke() { strokes++; }, fill() {}, arc() {}, rect() {}, roundRect() {}, fillRect() {}, clip() {},
              strokeText() {}, translate() {}, rotate() {}, scale() {}, setLineDash() {}, quadraticCurveTo() {}, bezierCurveTo() {}, ellipse() {},
              measureText(t) { return { width: String(t).length * 6 }; }, fillText(t) { texts.push(String(t)); },
              set font(v) {}, get font() { return '12px x'; }, set fillStyle(v) {}, get fillStyle() { return '#fff'; },
              set strokeStyle(v) {}, get strokeStyle() { return '#fff'; }, set lineWidth(v) {}, get lineWidth() { return 1; },
              set globalAlpha(v) {}, get globalAlpha() { return 1; }, set textAlign(v) {}, get textAlign() { return 'left'; },
              set textBaseline(v) {}, get textBaseline() { return 'middle'; }, set lineCap(v) {}, get lineCap() { return 'round'; },
              canvas: { width: 1280, height: 720 } };
            A.filmBoxesMeasureReset();
            const drawn = A.flyoutBeatsCompositeOntoCanvas(ctx, 1280, 720, sec);
            const q = A.filmBoxesMeasureQueue();
            R.frames.push({ key: b.key, dt, drawn, strokes, posted: q.length, postTitle: q[0] && q[0].title, postRow0: q[0] && q[0].rows[0] });
          });
        });
      } catch (eD) { R.drawErr = eD.message; }
    } catch (e) { R.pageErr = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return R;
  }, DUR_ARG);
  await b.close(); server.close();

  if (out.pageErr) { console.log('§WITNESS_FLYOUT_BEATS INCONCLUSIVE — page threw: ' + out.pageErr); process.exit(1); }
  const rep = out.rep || {};
  console.log('§WITNESS_FLYOUT_BEATS_RUN dur=' + out.dur + ' (' + out.durSrc + ') buildup=' + (out.bk ? 'armed' : 'OFF') +
    ' state=' + rep.state + (rep.why ? ' (' + rep.why + ')' : '') + ' window=' + JSON.stringify(rep.window));
  console.log('§WITNESS_FLYOUT_BEATS_TAKEN ' + (out.taken || []).map(w => w.who + ' ' + (+w.from).toFixed(2) + '-' + (+w.to).toFixed(2)).join(' | '));
  (rep.wings || []).forEach(w => console.log('§WITNESS_FLYOUT_BEATS_WING i=' + w.i + ' ' + w.wM + '×' + w.dM + ' m long=' + w.longM + ' short=' + w.shortM + ' area=' + w.aM));
  (rep.sills || []).forEach(s2 => console.log('§WITNESS_FLYOUT_BEATS_SILL ' + s2.facade + ' drop=' + s2.drop + ' sillZ=' + s2.sillZ + ' roofTopZ=' + s2.roofTopZ + ' n=' + s2.n));
  (rep.beats || []).forEach(b2 => console.log('§WITNESS_FLYOUT_BEATS_CUE key=' + b2.key + ' sec=' + b2.sec + ' heldPx=' + b2.heldPx + ' "' + b2.rows[0] + '"'));
  (rep.rejected || []).forEach(r2 => console.log('§WITNESS_FLYOUT_BEATS_REJECT ' + (r2.what || '') + ' ' + (r2.dims || '') + ' — ' + r2.why));
  console.log('§WITNESS_FLYOUT_BEATS_FRAME ' + JSON.stringify(out.frames) + ' drawErr=' + (out.drawErr || 'none'));
  if (rep.state === 'INCONCLUSIVE') { console.log('§WITNESS_FLYOUT_BEATS INCONCLUSIVE — ' + rep.why); process.exit(1); }
  if (rep.state === 'VACUOUS') { console.log('§WITNESS_FLYOUT_BEATS VACUOUS — ' + rep.why + ' (a film with no pull-out stretch, e.g. HHS, is EXPECTED to land here)'); process.exit(0); }

  // ── POPULATION: every subject the build considered, cued or rejected.
  const cued = {};
  (rep.beats || []).forEach(b2 => { cued[b2.key] = b2; });
  const rows = (rep.wings || []).map(w => ({
    key: 'wing' + w.i, kind: 'wing', longM: w.longM, shortM: w.shortM, areaM2: w.aM,
    sec: cued['wing' + w.i] ? cued['wing' + w.i].sec : null,
    heldPx: cued['wing' + w.i] ? cued['wing' + w.i].heldPx : null,
    metres: cued['wing' + w.i] ? cued['wing' + w.i].metres : null,
    row0: cued['wing' + w.i] ? cued['wing' + w.i].rows[0] : null,
    a: cued['wing' + w.i] ? cued['wing' + w.i].a : null, b: cued['wing' + w.i] ? cued['wing' + w.i].b : null,
    cuedFlag: !!cued['wing' + w.i]
  })).concat((rep.sills || []).map(s2 => ({
    key: 'sill' + s2.facade, kind: 'sill', longM: s2.drop, shortM: null, areaM2: null,
    sillZ: s2.sillZ, roofTopZ: s2.roofTopZ,
    sec: cued['sill' + s2.facade] ? cued['sill' + s2.facade].sec : null,
    heldPx: cued['sill' + s2.facade] ? cued['sill' + s2.facade].heldPx : null,
    metres: cued['sill' + s2.facade] ? cued['sill' + s2.facade].metres : null,
    row0: cued['sill' + s2.facade] ? cued['sill' + s2.facade].rows[0] : null,
    a: cued['sill' + s2.facade] ? cued['sill' + s2.facade].a : null, b: cued['sill' + s2.facade] ? cued['sill' + s2.facade].b : null,
    cuedFlag: !!cued['sill' + s2.facade]
  })));
  const frames = out.frames || [];
  const near = (a, b2, eps) => Math.abs(a - b2) <= eps;

  Witness('flyout_beats')
    .population(() => rows)
    .schema({ type: 'object', required: ['key', 'kind', 'longM', 'cuedFlag'],
      properties: { key: { type: 'string', minLength: 1 }, kind: { enum: ['wing', 'sill'] },
        longM: { type: 'number', exclusiveMinimum: 0 }, shortM: { type: ['number', 'null'] },
        areaM2: { type: ['number', 'null'] }, sec: { type: ['number', 'null'] },
        heldPx: { type: ['number', 'null'] }, metres: { type: ['string', 'null'] },
        row0: { type: ['string', 'null'] }, cuedFlag: { type: 'boolean' } } })
    .invariant('§38.2 every wing is a real limb: long side >= 12 m, short side >= 8 m, area >= 150 m² (a corridor run is rejected, not cued)',
      rs => rs.filter(r => r.kind === 'wing').every(r => r.longM >= 12 && r.shortM >= 8 && r.areaM2 >= 150))
    .invariant('§38.2 the sill height equals roofTop − the placed window\'s bbox bottom, from the DB',
      rs => rs.filter(r => r.kind === 'sill').every(r => near(r.longM, r.roofTopZ - r.sillZ, 0.002) && r.longM > 0))
    .invariant('a cued figure states its OWN measured length (2 dp), never a rounded or borrowed one',
      rs => rs.filter(r => r.cuedFlag).every(r => r.metres === r.longM.toFixed(2) + ' m' && r.row0.indexOf(r.longM.toFixed(2)) === 0))
    .invariant('a cued span\'s two endpoints are exactly its measured length apart in world metres',
      rs => rs.filter(r => r.cuedFlag).every(r => near(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]), r.longM, 0.02)))
    .invariant('§29.8 a cued beat cleared 24 px HELD, and an uncued one is named in the rejection list',
      rs => rs.filter(r => r.cuedFlag).every(r => r.heldPx >= 24) &&
            rs.filter(r => !r.cuedFlag).every(r => (rep.rejected || []).some(x => x.what === r.key)))
    .invariant('§14 no cued slot overlaps another cued slot, or any other layer\'s taken window',
      rs => { const c = rs.filter(r => r.cuedFlag).map(r => ({ from: r.sec, to: r.sec + 2.7 }));
        for (let i = 0; i < c.length; i++) { for (let j = i + 1; j < c.length; j++) if (c[i].from < c[j].to && c[j].from < c[i].to) return false;
          if ((out.taken || []).some(w => c[i].from < w.to && w.from < c[i].to)) return false; } return true; })
    .invariant('§38.2 every cued beat sits inside the fly-out window',
      rs => rs.filter(r => r.cuedFlag).every(r => r.sec >= rep.window.from && r.sec + 2.7 <= rep.window.to + 1e-6))
    .invariant('the 2D pass draws the arrow and posts the figure INSIDE the envelope only, and nothing outside it',
      () => frames.length > 0 && !out.drawErr &&
        frames.every(f => (f.dt < 0 || f.dt >= 2.2) ? (f.drawn === 0 && f.posted === 0) : (f.drawn === 1 && f.strokes > 0 && f.posted === 1)) &&
        frames.some(f => f.drawn === 1))
    .invariant('the posted figure goes to the fixed §MEASURE_BOX with the beat\'s own first row',
      () => frames.filter(f => f.posted).every(f => (f.postTitle === 'Wing span' || f.postTitle === 'Roof edge to sill') &&
        rows.some(r => r.key === f.key && r.row0 === f.postRow0)))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const q = c.filter(r => r.cuedFlag)[0];
      if (q) q.metres = (q.longM + 1).toFixed(2) + ' m'; else if (c[0]) c[0].longM = 0.5; return c; })
    .run();
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
