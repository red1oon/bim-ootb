#!/usr/bin/env node
// WITNESS — linear_beat: §27 §LINEAR_BEAT — one column and one beam measured as they go up, in the real page,
// on the real stored path, with the Time Machine primed the way the bake primes it and the owner clock.
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §27.4 (asserts) + §27.5 (decisions).
//
// ISSUE THIS PROVES OR DISPROVES (§27.4): no two allocated envelopes overlap (plate included); the drawn value is
// the placed instance's own extent; no column within 2 % of a datum figure is drawn (and no beam within 2 % of a
// bay); the plate's slot came from §26, not recomputed; the label never repeats the cue's number; the clock is
// reported; the cue is legible in frame at its own pop (px >= 24·k) and actually composites (marks > 0 in its
// window, 0 outside). It can say NO: VACUOUS (class absent — HHS beams), NOFIT, NOTHING, INCONCLUSIVE.
// Population = the ranked candidate rows + picks from A.linearBeatReport(). Red control: a pick's len shifted.
//
// Command: node viewer/tests/witness_linear_beat.js --db Hospital_silent_local --dur 195.79 [--port 8590]
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..'), PORT = +arg('port', 8590), DB = arg('db', 'Hospital_silent_local'), DUR = +arg('dur', 195.79);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try { const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§LINEAR_BEAT|§SLAB_BEAT_PICK|§SLAB_BEAT INCONC|§FLYTHRU_DATUM_BUILT|PAGEERROR|§LOAD_FAIL/.test(t)) console.log('  ' + t.slice(0, 260)); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.linearBeatBuild && window.APP.slabBeatBuild, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  const prime = await p.evaluate(async () => { if (typeof window.tmActivateForBake !== 'function') return 'no-hook'; let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok ? 'ok' : 'FAILED'; });
  console.log('§WITNESS_LINEAR_BEAT_TM_PRIME ' + prime);
  const out = await p.evaluate((dur) => {
    const A = window.APP, R = {};
    try {
      try { const ss = A.dbQuery('SELECT cam_ifc_x,cam_ifc_y,cam_ifc_z,tgt_ifc_x,tgt_ifc_y,tgt_ifc_z FROM scene_state LIMIT 1'); if (ss && ss.length && ss[0][0] != null) { const c = A.ifc2three(ss[0][0], ss[0][1], ss[0][2]), t = A.ifc2three(ss[0][3], ss[0][4], ss[0][5]); A.camera.position.set(c.x, c.y, c.z); if (A.controls) { A.controls.target.set(t.x, t.y, t.z); A.controls.update(); } A.camera.lookAt(t.x, t.y, t.z); } } catch (e) {}
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
      A.flythruDatumBuild();
      const judge = () => { A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix(); A.flythruDatumCompositeOntoCanvas(ctx, 1280, 720, 0, dur); const L = A._flythruDatumLast || {}; return L.bubbles === L.bubblesTotal && L.overalls === 3; };
      if (!judge()) { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); A.flythruDatumDispose(); A.flythruDatumBuild(); R.homed = true; }
      const bk = window.tmFollowTimeline(); const plan = A.cinemaPathPlan(dur);
      try { A.flythruCuesBuild(plan, dur); } catch (e) { R.cuesErr = e.message; }   // the bake builds the 2D cues BEFORE the beats
      R.cueWindows = A.flythruCuesWindows ? A.flythruCuesWindows() : null;
      R.slab = A.slabBeatBuild(plan, dur, bk, dur); R.rep = A.linearBeatBuild(plan, dur, bk, dur);
      R.frames = [];
      (R.rep.picks || []).forEach(pk => { [-0.1, 0.3, 1.0, 2.1, 2.6].forEach(dt => { const sec = pk.sec + dt, u = Math.min(1, sec / dur), pz = plan.poseAt(u);
        A.camera.position.set(pz.x, pz.y, pz.z); A.camera.lookAt(pz.tx, pz.ty, pz.tz); A.camera.updateMatrixWorld(true);
        ctx.clearRect(0, 0, 1280, 720); const n = A.linearBeatCompositeOntoCanvas(ctx, 1280, 720, sec);
        R.frames.push({ cls: pk.cls, dt, sec: +sec.toFixed(3), marks: n }); }); });
    } catch (e) { R.err = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return R;
  }, DUR);
  await b.close(); server.close();
  if (out.err) { console.log('§WITNESS_LINEAR_BEAT INCONCLUSIVE — page threw: ' + out.err); process.exit(1); }
  const rep = out.rep || {};
  console.log('§WITNESS_LINEAR_BEAT_CUES ' + JSON.stringify(out.cueWindows));
  console.log('§WITNESS_LINEAR_BEAT_RUN db=' + DB + ' dur=' + DUR + ' homed=' + !!out.homed + ' state=' + rep.state + (rep.why ? ' (' + rep.why + ')' : '') + ' slab=' + (out.slab && out.slab.state) + (out.slab && out.slab.beat ? '@' + out.slab.beat.sec.toFixed(2) : '') +
              ' slots=' + JSON.stringify(rep.slots) + ' picks=' + JSON.stringify((rep.picks || []).map(x => x.cls + '@' + x.sec + ' ' + x.label + ' px' + x.px)));
  (out.frames || []).forEach(f => console.log('§WITNESS_LINEAR_BEAT_FRAME cls=' + f.cls + ' dt=' + f.dt + ' sec=' + f.sec + ' marks=' + f.marks));
  if (rep.state === 'INCONCLUSIVE') { console.log('§WITNESS_LINEAR_BEAT INCONCLUSIVE — ' + rep.why); process.exit(1); }
  if (rep.state === 'NOFIT') { console.log('§WITNESS_LINEAR_BEAT NOFIT — ' + rep.why + ' (the dive cannot hold a slot: a PATH property, §27g)'); process.exit(0); }
  const rows = (rep.rows || []).map(r => Object.assign({}, r)); const picks = rep.picks || [];
  rows.forEach(r => { const pk = picks.find(x => x.guid === r.guid); if (pk) { r.label = pk.label; r.sem = pk.sem; r.slot = rep.slots.find(s => s.who === pk.cls); } });
  const figs = rep.figures || { storeys: [], bays: [], overalls: [] };
  const near = (v, f) => Math.abs(v - f) <= 0.02 * f;
  const F = out.frames || [];
  if (!rows.length) { console.log('§WITNESS_LINEAR_BEAT ' + rep.state + ' — no candidate rows (' + rep.why + ')'); process.exit(rep.state === 'NOTHING' ? 0 : 1); }
  Witness('linear_beat')
    .population(() => rows)
    .schema({ type: 'object', required: ['cls', 'guid', 'len', 'sec', 'px', 'inFrame', 'picked'], properties: { cls: { enum: ['IfcColumn', 'IfcBeam'] }, guid: { type: 'string' }, len: { type: 'number', exclusiveMinimum: 0 }, sec: { type: 'number', minimum: 0 }, px: { type: 'number' }, inFrame: { type: 'boolean' }, picked: { type: 'boolean' } } })
    .invariant('at most one pick per class', rs => ['IfcColumn', 'IfcBeam'].every(c => rs.filter(r => r.cls === c && r.picked).length <= 1))
    .invariant('no two allocated slots overlap (plate and the 2D cues included — §14 across layers)', () => { const own = rep.slots.filter(s => !s.who.startsWith('cue:')); return own.every(a => rep.slots.every(b2 => a === b2 || a.to <= b2.from + 1e-9 || a.from >= b2.to - 1e-9)); })
    .invariant('the drawn value is the placed instance\'s own extent (label mm = round(len*1000))', rs => rs.filter(r => r.picked).every(r => r.label === Math.round(r.len * 1000).toLocaleString('en-US') + ' mm'))
    .invariant('no picked column within 2 % of a storey height/overall; no picked beam within 2 % of a bay/overall', rs => rs.filter(r => r.picked).every(r => !(r.cls === 'IfcColumn' ? figs.storeys.concat(figs.overalls) : figs.bays.concat(figs.overalls)).some(f => near(r.len, f))))
    .invariant('the plate slot is §26\'s own second, not recomputed', () => { const ps = rep.slots.find(s => s.who === 'plate'); return !out.slab || out.slab.state !== 'BEAT' ? !ps : (!!ps && Math.abs(ps.from - out.slab.beat.sec) < 1e-3); })
    .invariant('the label never repeats the cue\'s own number', rs => rs.filter(r => r.picked).every(r => !r.sem || r.sem.indexOf(String(Math.round(r.len * 1000))) < 0))
    .invariant('every pick is legible in frame at its own pop (px >= 24)', rs => rs.filter(r => r.picked).every(r => r.inFrame && r.px >= 24))
    .invariant('each pick composites inside its envelope and not outside (marks>0 at +0.3/+1.0/+2.1, 0 at -0.1/+2.6)', () => picks.every(pk => { const f = {}; F.filter(x => x.cls === pk.cls).forEach(x => f[x.dt] = x.marks); return f[0.3] > 0 && f[1.0] > 0 && f[2.1] > 0 && f[-0.1] === 0 && f[2.6] === 0; }))
    .invariant('picks complete inside the dive (sec + 2.2 <= diveSec)', rs => rs.filter(r => r.picked).every(r => r.sec + 2.2 <= rep.clock.diveSec + 1e-6))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const q = c.find(r => r.picked); if (q) q.len = q.len + 0.5; else if (c[0]) c[0].len = -1; return c; })
    .run();
  console.log('§WITNESS_LINEAR_BEAT_CLOCK ' + JSON.stringify(rep.clock) + ' figures=' + JSON.stringify({ storeys: figs.storeys.map(v => +v.toFixed(2)), bays: figs.bays.length, overalls: figs.overalls.map(v => +v.toFixed(2)) }));
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
