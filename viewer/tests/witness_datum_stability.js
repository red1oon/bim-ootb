#!/usr/bin/env node
// WITNESS — datum_stability: §36 W1 — the opening Measure layers must not FLICKER.
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §36 W1 (cause read from the code: the datum compositor
// re-decided near sides / upright plane every frame; the cues re-tested span length every frame).
//
// ISSUE THIS PROVES OR DISPROVES: over the datum's whole life (0 → max(6, 0.094·film)+2 s) driven at 24 fps
// through the REAL plan (`plan.poseAt`) on the real page, (1) the side/plane decision never changes,
// (2) the drawn-mark count never RISES after frame 0 (marks may leave — behind the camera — never re-enter),
// (3) each 2D cue draws the same span set on every frame of its window, (4) the datum is alive (drawn>0) on
// every frame inside its hold. It can say NO: INCONCLUSIVE (no plan / no datum), VACUOUS (no cues built).
// Red control: one frame's dDrawn forced positive.
//
// Command: node viewer/tests/witness_datum_stability.js --db HHS_silent --dur 130.4 [--to 20] [--fps 24] [--port 8580]
//   (no model stream — the datum and the envelope cue are DB+camera; storey/corridor cues need meshes and may be absent)
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..'), PORT = +arg('port', 8580), DB = arg('db', 'HHS_silent');
const DUR = +arg('dur', 130.4), TO = +arg('to', 20), FPS = +arg('fps', 24);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try { const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§FLYTHRU_DATUM_BUILT|§FLYTHRU_DATUM_LINES|§FLYTHRU_CUES |§FLYTHRU_CUE_BOX|§ROOM_HOME|PAGEERROR|§LOAD_FAIL/.test(t)) console.log('  ' + t.slice(0, 220)); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.evaluate(async () => { try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.flythruDatumBuild && window.APP.flythruCuesBuild, { timeout: 300000 });
  await p.waitForFunction(() => window.APP.db && window.APP.activeBuilding, { timeout: 600000, polling: 1000 });
  const out = await p.evaluate((dur, to, fps) => {
    const A = window.APP, R = {};
    try {
      // the bake opens from the DB's saved view (main.js §SCENE_STATE_RESTORE); apply it here so the plan is the film's
      try { const ss = A.dbQuery('SELECT cam_ifc_x,cam_ifc_y,cam_ifc_z,tgt_ifc_x,tgt_ifc_y,tgt_ifc_z FROM scene_state LIMIT 1');
        if (ss && ss.length && ss[0][0] != null) { const c = A.ifc2three(ss[0][0], ss[0][1], ss[0][2]), t = A.ifc2three(ss[0][3], ss[0][4], ss[0][5]);
          A.camera.position.set(c.x, c.y, c.z); if (A.controls) { A.controls.target.set(t.x, t.y, t.z); A.controls.update(); } A.camera.lookAt(t.x, t.y, t.z); R.savedView = [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)]; } } catch (e) { R.savedViewErr = e.message; }
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
      const judge = () => { A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix(); A.flythruDatumCompositeOntoCanvas(ctx, 1280, 720, 0, dur); const L = A._flythruDatumLast || {}; return { bubbles: L.bubbles, total: L.bubblesTotal, overalls: L.overalls, full: L.bubbles === L.bubblesTotal && L.overalls === 3 }; };
      // §33 gate, as the CLI does it (with W3's rebuild after Home)
      A.flythruDatumBuild(); const atLoad = judge(); R.gate = { load: atLoad, pressed: false };
      if (!atLoad.full) { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); A.flythruDatumDispose(); A.flythruDatumBuild(); R.gate.pressed = true; R.gate.home = judge(); }
      A.flythruDatumDispose(); A.flythruDatumBuild();          // fresh life for the run: first composite decides the sides
      const plan = A.cinemaPathPlan(dur); R.beats = plan.beats;
      let cues = []; try { cues = A.flythruCuesBuild(plan, dur) || []; } catch (e) { R.cuesErr = e.message; }
      R.cues = cues.map(c => ({ key: c.key, at: +c.at.toFixed(2) }));
      R.holdTo = Math.max(6, dur * 0.094) + 2;
      try { const g = A.ifc2three(0, 0, A.groundIfcZ != null ? A.groundIfcZ : 0); R.groundY = g.y; } catch (e) { R.groundY = 0; }
      R.frames = [];
      const N = Math.round(to * fps);
      for (let i = 0; i <= N; i++) {
        const sec = i / fps, u = Math.min(1, sec / dur), pz = plan.poseAt(u);
        A.camera.position.set(pz.x, pz.y, pz.z); A.camera.lookAt(pz.tx, pz.ty, pz.tz); A.camera.updateMatrixWorld(true);
        const op = A.flythruDatumAt(sec, dur);
        ctx.clearRect(0, 0, 1280, 720);
        const n = A.flythruDatumCompositeOntoCanvas(ctx, 1280, 720, sec, dur); const L = A._flythruDatumLast || {};
        try { A.flythruCuesApplyVisual(sec); } catch (e) {}
        let cm = 0; try { cm = A.flythruCuesCompositeOntoCanvas(ctx, 1280, 720, sec); } catch (e) {}
        const C = A._flythruCuesLast && Math.abs((A._flythruCuesLast.filmSec || -1) - sec) < 1e-6 ? A._flythruCuesLast : null;
        R.frames.push({ i, sec: +sec.toFixed(3), drawn: n, dDrawn: L.dDrawn, sidesChanged: !!L.sidesChanged, sidesNow: L.sidesNowKey, sidesKey: L.sidesKey, bubbles: L.bubbles, op: +op.toFixed(3),
                        entered: !!(L.enteredAt != null), enteredAt: L.enteredAt == null ? null : +L.enteredAt.toFixed(3),
                        cueLocked: C ? C.lockedAxes.join('') : null, belowGround: A.camera.position.y < (R.groundY != null ? R.groundY : 0),
                        behind: L.behind ? L.behind.bubbles.join('/') : null, camY: +A.camera.position.y.toFixed(2),
                        cueKey: C ? C.key : null, cueAxes: C ? C.axes.join('') : null, cueMarks: cm, cuePanel: C ? C.panelOnly : null });
      }
    } catch (e) { R.err = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return R;
  }, DUR, TO, FPS);
  await b.close(); server.close();
  if (out.err) { console.log('§WITNESS_DATUM_STABILITY INCONCLUSIVE — page threw: ' + out.err); process.exit(1); }
  // judged = inside the hold, before the camera enters the envelope (§20.8 — the drawing fades on entry and is not judged after)
  const F = out.frames, entryAt = (F.find(f => f.entered) || {}).enteredAt, holdEnd = out.holdTo - 1.5 / FPS;
  const aliveAll = F.filter(f => f.sec < holdEnd), under = aliveAll.filter(f => f.belowGround), alive = aliveAll.filter(f => !f.belowGround && (entryAt == null || f.sec < entryAt));
  const afterEntry = entryAt == null ? [] : F.filter(f => f.sec >= entryAt + 0.7 && f.sec < holdEnd);
  console.log('§WITNESS_DATUM_STABILITY_ENTRY ' + (entryAt == null ? 'camera never entered the envelope inside the hold' : 'enteredAt=' + entryAt + 's; frames after entry+0.7s=' + afterEntry.length + ' maxDrawnAfter=' + Math.max(0, ...afterEntry.map(f => f.drawn))));
  console.log('§WITNESS_DATUM_STABILITY_VIEW savedView=' + JSON.stringify(out.savedView || out.savedViewErr) + ' groundY=' + (out.groundY == null ? 'n/a' : out.groundY.toFixed(2)) +
              ' framesBelowGround=' + under.length + (under.length ? ' from ' + under[0].sec + 's to ' + under[under.length - 1].sec + 's — the PATH is inside the ground there (§27g); those frames are reported, not judged' : ''));
  console.log('§WITNESS_DATUM_STABILITY_ENV db=' + DB + ' dur=' + DUR + ' frames=' + F.length + ' fps=' + FPS + ' holdTo=' + out.holdTo.toFixed(2) + 's gate=' + JSON.stringify(out.gate) + ' cues=' + JSON.stringify(out.cues));
  for (let s = 0; s <= TO; s += 1) { const f = F[Math.min(F.length - 1, Math.round(s * FPS))]; console.log(`§WITNESS_DATUM_STABILITY_T sec=${s} drawn=${f.drawn} dDrawn=${f.dDrawn} sidesChanged=${f.sidesChanged} behind=${f.behind} camY=${f.camY} cue=${f.cueKey || '-'}${f.cueAxes ? ':' + f.cueAxes : ''} cueMarks=${f.cueMarks}`); }
  const rises = alive.filter(f => f.i > 0 && f.dDrawn > 0 && !(F[f.i - 1] && F[f.i - 1].belowGround)), usedKeys = new Set(alive.map(f => f.sidesKey)).size, wouldHave = new Set(aliveAll.map(f => f.sidesNow)).size;
  const zero = alive.filter(f => f.drawn === 0);
  console.log('§WITNESS_DATUM_STABILITY_SUMMARY judgedFrames=' + alive.length + ' rises(dDrawn>0)=' + rises.length + (rises.length ? ' at=[' + rises.slice(0, 6).map(f => f.sec + ':+' + f.dDrawn).join(',') + ']' : '') +
              ' zeroFrames=' + zero.length + (zero.length ? ' at=[' + zero.slice(0, 4).map(f => f.sec).join(',') + ']' : '') +
              ' usedSideDecisions=' + usedKeys + ' distinctSidesIfPerFrame=' + wouldHave + ' (1 = the per-frame rule would not have flipped either; >1 = the flips decide-once removes)');
  const cueSets = {}; alive.filter(f => f.cueKey && !f.cuePanel).forEach(f => { (cueSets[f.cueKey] = cueSets[f.cueKey] || new Set()).add(f.cueAxes); });
  Object.keys(cueSets).forEach(k => console.log('§WITNESS_DATUM_STABILITY_CUE key=' + k + ' drawnSets=' + JSON.stringify([...cueSets[k]]) + ' locked=' + JSON.stringify([...new Set(alive.filter(f => f.cueKey === k).map(f => f.cueLocked))])));
  Witness('datum_stability')
    .population(() => alive)
    .schema({ type: 'object', required: ['i', 'sec', 'drawn', 'sidesChanged', 'op'], properties: { i: { type: 'integer' }, sec: { type: 'number' }, drawn: { type: 'integer', minimum: 0 }, dDrawn: { type: ['integer', 'null'] }, sidesChanged: { type: 'boolean' }, op: { type: 'number' } } })
    .invariant('sides/plane decided once — the USED decision key is one value over the datum life', rs => new Set(rs.map(r => r.sidesKey)).size === 1)
    .invariant('no re-admission above ground — dDrawn <= 0 on every judged frame after the first (a frame following an underground one is exempt)', rs => rs.every(r => r.i === 0 || r.dDrawn == null || r.dDrawn <= 0 || (F[r.i - 1] && F[r.i - 1].belowGround)))
    .invariant('datum alive — drawn > 0 on every judged frame inside its hold (not vacuous)', rs => rs.every(r => r.drawn > 0))
    .invariant('§20.8 — after the camera enters the envelope (+0.7 s fade) the drawing is gone for the rest of the hold', () => afterEntry.every(f => f.drawn === 0))
    .invariant('each cue keeps one locked span set for its whole window, and draws only from it', rs => { const m = {}; rs.filter(r => r.cueKey && !r.cuePanel).forEach(r => (m[r.cueKey] = m[r.cueKey] || new Set()).add(r.cueLocked)); return Object.values(m).every(s => s.size === 1) && rs.every(r => !r.cueAxes || !r.cueLocked || [...r.cueAxes].every(ch => r.cueLocked.indexOf(ch) >= 0)); })
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[5]) c[5].dDrawn = 5; return c; })
    .run();
  if (!out.cues || !out.cues.length) console.log('§WITNESS_DATUM_STABILITY_CUES VACUOUS — no cues built (no model streamed: storey/corridor need meshes)');
})().catch(e => { console.error('WITNESS FAILED ' + e.message); try { server.close(); } catch (e2) {} process.exit(1); });
