#!/usr/bin/env node
// WITNESS — slab_beat: §26 §SLAB_BEAT, the floor plate marked AS IT IS LAID, judged in a real page on
// the real stored path with the Time Machine primed the way the bake primes it.
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §26.7 (asserts) + §26.8 (implementation).
//
// ISSUE THIS PROVES OR DISPROVES: does cpe_slab_beat.js pick ONE plate inside the dive, at the second
// the BAKE's own clock lays it (owner functions, not the PoC's linear day map), frame it with the camera
// the bake will fly, and draw the three layers with the depth split §26.2 demands — tint + X depth-
// tested, label shining through — with the label's numbers equal to the box it draws?
// It can say NO: VACUOUS (no planar slab), INCONCLUSIVE (no camera / buildup off / clock not monotone),
// NOTHING (no in-dive pick, each rejection named), NO-MESH (tint touched nothing at the pop).
//
// POPULATION: the build's own event rows (A.slabBeatReport().rows) — one per collapsed co-arrival
// event in the candidate pool, the picked one enriched with the drawn label/diagonal/frame facts.
// Red control: the picked row's bx is moved 1 m — the label can no longer equal the box.
//
// Command: node viewer/tests/witness_slab_beat.js [--db Hospital_silent_local] [--dur 195.8] [--nostream] [--port 8563]
//   --nostream skips the model (seconds instead of minutes): selection/clock/frustum/label are judged,
//   the tint invariant is INCONCLUSIVE and says so. Log Mandate: tee to out/witness_slab_beat.log.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +arg('port', 8563), DB = arg('db', 'Hospital_silent_local');
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
  p.on('console', m => { const t = m.text(); if (/§SLAB_BEAT|§FLYTHRU_ENVELOPE|§CPE_BUILDUP_PACING|§CPE_BUILDUP_SOURCE|§ROOM_HOME|§LOAD_FAIL|PAGEERROR/.test(t)) console.log('  ' + t); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  console.log('§WITNESS_SLAB_BEAT_ENV db=' + DB + ' stream=' + (NOSTREAM ? 0 : 1) + ' port=' + PORT);
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // the service worker serves stale JS at a fixed ?v= — unregister, clear, reload (snap_timeline.js's own lesson)
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.slabBeatBuild, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  if (!NOSTREAM) {
    await p.waitForFunction(() => window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming,
      { timeout: 1500000, polling: 2000 });
    console.log('§WITNESS_SLAB_BEAT_STREAMED meshes=' + await p.evaluate(() => window.APP.scene ? window.APP.scene.children.length : -1));
  }
  // §30 — does the camera at this stage frame the WHOLE envelope (all 8 DB-bbox corners inside the frustum)?
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
    console.log('§WITNESS_SLAB_BEAT_CAM stage=' + stage + ' ' + JSON.stringify(c)); return c; };
  await camAt('after-load');
  // Home frame first — §30 §CLI_BAKE_HOME, the same key the bake now presses
  await p.evaluate(() => { try { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); } catch (e) {} });
  await sleep(300);
  await camAt('after-home');
  // prime the Time Machine exactly as cli_silent_bake.js does before a buildup bake
  const prime = await p.evaluate(async () => {
    if (typeof window.tmActivateForBake !== 'function') return 'no-hook';
    let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake();
    return ok ? 'ok' : 'FAILED';
  });
  console.log('§WITNESS_SLAB_BEAT_TM_PRIME ' + prime);
  await camAt('after-tm-prime');

  const out = await p.evaluate((durArg, nostream) => {
    const A = window.APP, R = { pageErr: null };
    try {
      const camRd = () => [+A.camera.position.x.toFixed(1), +A.camera.position.y.toFixed(1), +A.camera.position.z.toFixed(1)];
      R.cam = { beforeFollow: camRd() };
      const bk = (typeof window.tmFollowTimeline === 'function') ? window.tmFollowTimeline() : null;
      R.cam.afterFollow = camRd();
      let plan0 = A.cinemaPathPlan(60);
      R.cam.afterPlan60 = camRd();
      const dur = durArg || (plan0 && plan0.naturalTotal) || 195.8;
      R.durSrc = durArg ? '--dur' : (plan0 && plan0.naturalTotal ? 'plan.naturalTotal' : 'default 195.8');
      const plan = A.cinemaPathPlan(dur);
      R.dur = dur; R.beats = plan && plan.beats; R.bk = !!bk;
      R.opening = plan ? plan.poseAt(0) : null;
      R.cursor = [1.0, 2.0, 3.0, 8.5].map(sec => { const u = sec / dur; const ms = bk ? A.buildupCursorAt(A.buildupTAt(u, plan), bk, dur) : null;
        return { sec, ms, day: (bk && ms != null) ? +((ms - bk.projectStart) / 86400000).toFixed(2) : null, placed: (bk && typeof window.tmPlacedCount === 'function') ? window.tmPlacedCount(ms) : null }; });
      R.rep = A.slabBeatBuild(plan, dur, bk, dur);
      R.frames = [];
      if (R.rep && R.rep.state === 'BEAT') {
        const s0 = R.rep.beat.sec;
        [-0.1, 0.02, 0.3, 1.0, 2.1, 2.5, 6.0].forEach(dt => {
          const sec = s0 + dt, u = Math.max(0, Math.min(1, sec / dur));
          if (bk) window.tmSetCursor(A.buildupCursorAt(A.buildupTAt(u, plan), bk, dur));
          const pz = plan.poseAt(u);
          A.camera.position.set(pz.x, pz.y, pz.z); A.camera.lookAt(pz.tx, pz.ty, pz.tz); A.camera.updateMatrixWorld(true);
          const r = A.slabBeatAt(sec) || {};
          const placed = (typeof window.tmPlacedCount === 'function' && bk) ? window.tmPlacedCount(A.buildupCursorAt(A.buildupTAt(u, plan), bk, dur)) : null;
          R.frames.push({ dt, sec: +sec.toFixed(3), env: +(r.env || 0).toFixed(3), tintOn: !!r.tintOn, labelOn: !!r.labelOn, tintTouched: r.tintTouched, placed });
        });
        let lbl = null, dg = null;
        A.scene.traverse(o => { if (o.name === 'slabBeatLabel') lbl = o; if (o.name === 'slabBeatX') dg = o; });
        R.scene = { label: lbl ? { depthTest: lbl.material.depthTest, renderOrder: lbl.renderOrder, w: lbl.geometry.parameters.width, h: lbl.geometry.parameters.height } : null,
                    diag: dg ? { depthTest: dg.material.depthTest, n: dg.geometry.attributes.position.count } : null };
      }
    } catch (e) { R.pageErr = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    R.nostream = nostream;
    return R;
  }, DUR_ARG, NOSTREAM);
  await b.close(); server.close();

  if (out.pageErr) { console.log('§WITNESS_SLAB_BEAT INCONCLUSIVE — page threw: ' + out.pageErr); process.exit(1); }
  const rep = out.rep || {};
  console.log('§WITNESS_SLAB_BEAT_CAM in-page ' + JSON.stringify(out.cam));
  console.log('§WITNESS_SLAB_BEAT_RUN dur=' + out.dur + ' (' + out.durSrc + ') beats.dive=' + (out.beats && out.beats.dive) + ' buildup=' + (out.bk ? 'armed' : 'OFF') +
              ' opening=' + JSON.stringify(out.opening && { x: +out.opening.x.toFixed(1), y: +out.opening.y.toFixed(1), z: +out.opening.z.toFixed(1) }) +
              ' state=' + rep.state + (rep.why ? ' (' + rep.why + ')' : ''));
  (out.cursor || []).forEach(c => console.log('§WITNESS_SLAB_BEAT_CURSOR sec=' + c.sec + ' day=' + c.day + ' placed=' + c.placed + ' — compare with the bake log\'s own §CPE_BUILDUP placed= at this second'));
  if (rep.state === 'BEAT') console.log('§WITNESS_SLAB_BEAT_PICK sec=' + rep.beat.sec.toFixed(2) + ' storey="' + rep.beat.storey + '" area=' + rep.beat.area.toFixed(0) +
    ' hold=' + (rep.beat.hold == null ? '∞' : rep.beat.hold.toFixed(2)) + ' label="' + rep.label.text1 + ' — ' + rep.label.text2 + '"');
  (out.frames || []).forEach(f => console.log('§WITNESS_SLAB_BEAT_FRAME dt=' + f.dt + ' sec=' + f.sec + ' env=' + f.env + ' tintOn=' + f.tintOn + ' tintTouched=' + f.tintTouched + ' labelOn=' + f.labelOn + ' placed=' + f.placed));
  if (rep.state === 'VACUOUS') { console.log('§WITNESS_SLAB_BEAT VACUOUS — ' + rep.why); process.exit(0); }
  if (rep.state === 'INCONCLUSIVE') { console.log('§WITNESS_SLAB_BEAT INCONCLUSIVE — ' + rep.why); process.exit(1); }

  // enrich the picked row with the drawn facts so every invariant reads ROWS (the red control mutates rows)
  const rows = (rep.rows || []).map(r => Object.assign({}, r));
  const pk = rows.filter(r => r.picked)[0];
  if (pk) {
    pk.labelText1 = rep.label.text1; pk.labelText2 = rep.label.text2; pk.labelW = rep.label.w; pk.labelH = rep.label.h;
    pk.labelDepthTest = rep.label.depthTest; pk.labelRenderOrder = rep.label.renderOrder;
    pk.diagDepthTest = rep.diag.depthTest; pk.diagEndpoints = rep.diag.endpoints; pk.frames = out.frames;
    pk.sceneLabel = out.scene && out.scene.label; pk.sceneDiag = out.scene && out.scene.diag;
  }
  const diveSec = rep.clock.diveSec;
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  const parseLabel = t => { const m = /^([\d,]+\.\d{2}) × ([\d,]+\.\d{2}) m = ([\d,]+) m² \(est\.\)$/.exec(t || ''); return m ? { bx: +m[1].replace(/,/g, ''), by: +m[2].replace(/,/g, ''), area: +m[3].replace(/,/g, '') } : null; };

  Witness('slab_beat')
    .population(() => rows)
    .schema({ type: 'object', required: ['guid', 'rawName', 'name', 'storey', 'sec', 'area', 'bx', 'by', 'inDive', 'picked', 'corners', 'centerTop'],
      properties: { guid: { type: 'string', minLength: 1 }, rawName: { type: ['string', 'null'] }, name: { type: ['string', 'null'] }, storey: { type: 'string' },
        sec: { type: 'number', minimum: 0 }, hold: { type: ['number', 'null'] }, area: { type: 'number', exclusiveMinimum: 0 }, bx: { type: 'number', exclusiveMinimum: 0 },
        by: { type: 'number', exclusiveMinimum: 0 }, inDive: { type: 'boolean' }, picked: { type: 'boolean' }, reject: { type: ['string', 'null'] },
        corners: { type: 'array', minItems: 4, maxItems: 4 }, centerTop: { type: 'array', minItems: 3, maxItems: 3 } } })
    .invariant('one-beat: picked <= MAX_DIVE(2) and exactly TAKE(1) when a beat exists', rs => { const n = rs.filter(r => r.picked).length; return n <= 2 && (rep.state !== 'BEAT' || n === 1); })
    .invariant('picked plate is inside the dive and holds >= 2.0 s', rs => rs.filter(r => r.picked).every(r => r.sec < diveSec && (r.hold == null || r.hold >= 2.0)))
    .invariant('inDive flag agrees with sec < diveSec on every row', rs => rs.every(r => r.inDive === (r.sec < diveSec)))
    .invariant('semantic name is a byte-substring of element_name, never composed', rs => rs.every(r => r.name == null || r.rawName == null || String(r.rawName).indexOf(r.name) >= 0))
    .invariant('label X × Y = Area (est.) equals the drawn box (2 dp, bbox product)', rs => rs.filter(r => r.picked).every(r => { const L = parseLabel(r.labelText1); return !!L && near(L.bx, r.bx, 0.006) && near(L.by, r.by, 0.006) && near(L.area, Math.round(r.bx * r.by), 1); }))
    .invariant('label second line is the semantic name', rs => rs.filter(r => r.picked).every(r => r.labelText2 === (r.name || '')))
    .invariant('diagonals terminate on the box corners (0-2, 1-3)', rs => rs.filter(r => r.picked).every(r => { const e = r.diagEndpoints, c = r.corners; const eq = (a, b) => a.every((v, i) => near(v, b[i], 1e-6)); return e && eq(e[0], c[0]) && eq(e[1], c[2]) && eq(e[2], c[1]) && eq(e[3], c[3]); }))
    .invariant('depth split: tint/X depth-tested, label depthTest:false renderOrder>=900 (report AND live scene)', rs => rs.filter(r => r.picked).every(r => r.diagDepthTest === true && r.labelDepthTest === false && r.labelRenderOrder >= 900 && r.sceneLabel && r.sceneLabel.depthTest === false && r.sceneLabel.renderOrder >= 900 && r.sceneDiag && r.sceneDiag.depthTest === true && r.sceneDiag.n === 4))
    .invariant('label fits inside the plate (w < shorter side)', rs => rs.filter(r => r.picked).every(r => r.labelW < Math.min(r.bx, r.by) && r.labelH < r.labelW))
    .invariant('picked plate framed by the camera at its own second (frustum)', rs => rs.filter(r => r.picked).every(r => r.frustum && r.frustum.ok))
    .invariant('envelope 0.6/1.0/0.6: env(-0.1)=0, env(0.3)=0.5, env(1.0)=1, env(2.1)~0.17, env(2.5)=0 and tint released', rs => rs.filter(r => r.picked).every(r => { const f = {}; r.frames.forEach(x => f[x.dt] = x); return f[-0.1].env === 0 && near(f[0.3].env, 0.5, 0.01) && f[1.0].env === 1 && near(f[2.1].env, 1 - 0.5 / 0.6, 0.01) && f[2.5].env === 0 && !f[2.5].tintOn; }))
    .invariant('label on at the pop (dt 0.3) and never on before it', rs => rs.filter(r => r.picked).every(r => { const f = {}; r.frames.forEach(x => f[x.dt] = x); return !f[-0.1].labelOn && f[0.3].labelOn; }))
    .invariant(NOSTREAM ? 'tint touches the plate mesh — INCONCLUSIVE under --nostream (no mesh in scene), not asserted' : 'tint touches >= 1 mesh of the plate inside the envelope (streamed)',
      rs => NOSTREAM ? true : rs.filter(r => r.picked).every(r => r.frames.some(x => x.dt >= 0.02 && x.dt <= 2.1 && x.tintTouched >= 1)))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); const q = c.filter(r => r.picked)[0]; if (q) q.bx = q.bx + 1.0; else if (c[0]) c[0].name = 'INVENTED NAME'; return c; })
    .run();
  if (NOSTREAM) console.log('§WITNESS_SLAB_BEAT_TINT INCONCLUSIVE — --nostream: the plate mesh is not in the scene, tintTouched=' + JSON.stringify((out.frames || []).map(f => f.tintTouched)));
  console.log('§WITNESS_SLAB_BEAT_CLOCK ' + JSON.stringify(rep.clock));
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
