#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SNAP-TIMELINE scope (READ THE LOG after every run)
 * SCOPE: snap REAL film frames at chosen seconds WITHOUT baking a video.
 *
 * WHY THIS EXISTS: judging a moment ("is the slab clear at 9s?") cost a full bake — 5 minutes for a
 * 30s clip, ~113 minutes for the whole film — almost all of it spent encoding frames nobody looks at.
 * This streams the model ONCE and then snaps only the seconds asked for.
 *
 * IT IS A REAL FRAME, NOT AN APPROXIMATION. It drives the SAME two things the bake drives:
 *   camera   — APP.cinemaPathPlan(dur).poseAt(u)
 *   buildup  — tmFollowTimeline() -> APP.buildupTAt -> APP.buildupCursorAt -> tmSetCursor
 * ⚠ The buildup is paced by ELEMENT COUNT, not by days (§CPE_BUILDUP_WORK_PACED in cinema_maxq.js).
 * Skipping it would show the finished building at second 9, when the schedule says most of it is not
 * cast yet — the exact error that invalidated probe_flythru_subjects.js's first numbers.
 *
 * ⚠ WHAT IT IS NOT: the bake's photoreal passes (§STILL_REFINE, §PHOTO_AO, staging) do NOT run here.
 * Geometry, camera and buildup are true; lighting/AO polish is not. Use it to judge WHAT IS IN FRAME,
 * never to judge final image quality.
 *
 * LAYERS: --clash turns on the clash markers AND their [tol/clash mm] labels; --cues turns on the
 * fly-through measurement cues. Both OFF by default so a plain frame stays cheap.
 * ⚠ 2D layers (labels, captions, day counter) are NOT in the WebGL canvas — the bake composites them
 * onto the captured frame (cinema_maxq.js:767 _captureFrame). A plain page screenshot MISSES them.
 * So with any layer on, this composites the same way the bake does and saves that, not a screenshot.
 *
 * ⚠ --nostream SKIPS the model entirely (MEASURED: ~7 min -> seconds). Only for judging the 2D
 * annotation layers, which are built from DB + camera and read no mesh. The scene is EMPTY, so
 * visibleMeshes / occlusion / buildup in such a frame are VACUOUS, not evidence.
 *
 * RUN: node scripts/snap_timeline.js --db Hospital_silent_local --dur 195.8 --at 0,3,6,9
 *      node scripts/snap_timeline.js --db Hospital_silent_local --at 9,13 --clash --cues,12
 *      node scripts/snap_timeline.js --db HHS_silent --dur 61 --from 0 --to 20 --step 2
 */
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', process.env.PORT || '8477');
const DB = arg('db', 'Hospital_silent_local');
const DUR = Number(arg('dur', 195.8));
const OUT = arg('out', path.join(__dirname, '..', 'out', 'snaps'));
const W = Number(arg('width', 1280)), H = Number(arg('height', 720));
const CLASH = process.argv.includes('--clash');
// ⚠ --nostream: SKIP the model stream entirely. MEASURED 2026-09-07: a one-frame Hospital run cost
// ~7 min, and essentially all of it was streaming 64,150 elements + waiting for the count to settle.
// The DATUM ANNOTATION (cpe_flythru_datum.js) is built from DB queries and the camera pose alone —
// no mesh is read — so judging its LAYOUT does not need the building in the scene at all. Use this
// while iterating on labelling; drop it the moment the question is about occlusion or the buildup.
const NOSTREAM = process.argv.includes('--nostream');
const CUES = process.argv.includes('--cues');
let TIMES = arg('at', null) ? arg('at').split(',').map(Number)
  : (() => { const a = [], f = Number(arg('from', 0)), t = Number(arg('to', 10)), s = Number(arg('step', 1));
             for (let x = f; x <= t + 1e-9; x += s) a.push(+x.toFixed(3)); return a; })();

const T0 = Date.now();
let tReady = T0;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      // Streaming 64k elements spikes hard enough to get the page OOM-killed ("detached Frame").
      // /dev/shm is small on this box; the heap cap keeps V8 from ballooning before GC.
      '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=3072',
      '--disable-extensions', '--disable-background-networking'] });
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  // ⚠ Forward the LAYER tags too. This filter previously matched only §SNAP_, so every
  // §FLYTHRU_DIM_DRAW line the marking pass emitted was discarded before reaching the log — three
  // runs looked like "nothing drew" when the evidence was being filtered out at this line.
  // ⚠ WIDEN BEFORE CONCLUDING. This filter matched only §SNAP_ once and discarded every
  // §FLYTHRU_ line, which cost three runs diagnosing a feature that was working. It then hid
  // §CINEMA_PATH_RESTORE / §CINEMA_PIVOT while --nostream was being judged on its camera.
  p.on('console', m => { const t = m.text(); if (/§SNAP_|§FLYTHRU_|§CLASH_LABELS|§CINEMA_|§CPE_|PAGEERROR/.test(t)) console.log('  ' + t); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  console.log('§SNAP_ENV db=' + DB + ' dur=' + DUR + 's times=[' + TIMES.join(',') + '] out=' + OUT);
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  // ⚠ THE SERVICE WORKER SERVES STALE JS. viewer.html loads cpe_*.js with a FIXED ?v= query, and
  // sw.js precaches them, so an edited module is invisible to the page until CACHE_VERSION is bumped.
  // MEASURED 2026-09-07: a whole three-frame run drew no markings because the page held the previous
  // copy of cpe_flythru_cues.js — while `curl` showed the new file, because curl bypasses the worker.
  // A probe tool must never depend on a deploy-time version bump: unregister and clear, then reload.
  const swKilled = await p.evaluate(async () => {
    let n = 0, c = 0;
    if (navigator.serviceWorker) {
      const rs = await navigator.serviceWorker.getRegistrations();
      for (const r of rs) { await r.unregister(); n++; }
    }
    if (window.caches) { const ks = await caches.keys(); for (const k of ks) { await caches.delete(k); c++; } }
    return { workers: n, caches: c };
  }).catch(() => ({ workers: -1, caches: -1 }));
  console.log('§SNAP_SW unregistered=' + swKilled.workers + ' cachesCleared=' + swKilled.caches + ' — reloading for fresh JS');
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 240000 });
  tReady = Date.now();
  const hasDim = await p.evaluate(() => typeof window.APP.flythruCuesCompositeOntoCanvas === 'function');
  console.log('§SNAP_JS flythruCuesCompositeOntoCanvas=' + (hasDim ? 'present' : 'ABSENT — page is still on stale JS'));
  if (NOSTREAM) {
    // ⚠ SKIPPING THE STREAM IS NOT SKIPPING THE DB. window.APP.cinemaPathPlan exists before the
    // SQLite handle is usable — MEASURED: the first --nostream run logged
    // '§FLYTHRU_DATUM VACUOUS — no structural extent' because dbQuery returned nothing yet, and a
    // VACUOUS datum would have been read as a broken annotation. Wait for a real row instead.
    const ok = await p.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return !!(r && r[0] && r[0][0] > 0); }
      catch (e) { return false; }
    }, { timeout: 120000 }).then(() => true).catch(() => false);
    // ⚠ "EMPTY" WOULD BE A LIE — MEASURED 504 visible meshes with --nostream on Hospital. The viewer
    // still draws whatever loads without streamBuilding (wireframe placeholders), and the film's own
    // buildup shows 3 meshes at t=0. So the scene is NOT the film's scene: occlusion, mesh counts and
    // the day cursor are VACUOUS here. The CAMERA, however, is exact (see the pivot note below).
    console.log('§SNAP_STREAM SKIPPED (--nostream) — dbReady=' + ok + '. The camera and every DB-derived ' +
                'layer are exact; the SCENE is not the film\'s (no buildup), so occlusion and mesh counts are VACUOUS.');
    if (!ok) console.log('§SNAP_WARN --nostream gave up waiting for the DB — every layer below is VACUOUS');
    // ⚠ AND THE CAMERA IS NOT FREE EITHER — THIS IS WHY --nostream IS NOT EVIDENCE ON ITS OWN.
    // With nothing streamed, A.controls.target is still at the ORIGIN and PASSES §CINEMA_PIVOT's
    // plausibility test (offCentre 19.7 < boundingR/2 = 45.7), so the path orbits (0,0,0): Hospital
    // t=0 came out at (135.8,181.0,135.8) against the streamed (85.5,70.0,58.9).
    // THREE FIXES WERE TRIED. All are recorded because each looked right and each was wrong:
    // (a) park the target far so the planner takes its arc-bbox-centre branch — with the controls
    //     LIVE, OrbitControls repositions the camera to keep its offset and HHS flew to (88452,...);
    // (b) imitate scene.js _homeFillFrame from the DB — it CANNOT be imitated, it centres on
    //     A.buildingCentres which only streaming populates. The substitute camera changed the PLAN
    //     (§CINEMA_PIVOT reads A.camera.position), poseAt drifted to (83.2,121.0,106.9), and whether
    //     this script or the app's own render loop won the race decided which pose the frame used:
    //     THREE IDENTICAL RUNS PRODUCED TWO DIFFERENT FRAMES;
    // (c) disable the controls and park the target — the drawn frame became stable at the streamed
    //     pose, but only because the app's loop overrides this script. poseAt itself still alternated
    //     between (85.5,70.0,58.9) and the parked (88451,88457,88451).
    // SO: disable the controls (nothing drags the camera) and CHANGE NOTHING ELSE, then STATE the
    // divergence instead of hiding it. §SNAP_POSE prints poseAt AND the camera actually used; when
    // they differ the frame is NOT the film's framing and the run must not be used to judge layout.
    // Use --nostream to iterate cheaply; confirm on a streamed run before believing a frame.
    await p.evaluate(() => {
      try { const A = window.APP; if (A.controls) { A.controls.enableDamping = false; A.controls.enabled = false; } } catch (e) {}
    });
    console.log('§SNAP_FIT controls disabled; camera left as the page set it. ⚠ --nostream framing is ' +
                'APPROXIMATE — compare poseAt with cameraAtComposite in §SNAP_POSE before trusting a frame.');
  } else {
    const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
    for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let stable = 0;
    for (let i = 0; i < 400; i++) {
      const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
      const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (!m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '')) { if (++stable >= 4) break; } else stable = 0;
      await sleep(3000);
    }
    await sleep(3000);
  }
  console.log('§SNAP_T stream=' + ((Date.now() - T0) / 1000).toFixed(1) + 's (page ready at ' + ((tReady - T0) / 1000).toFixed(1) + 's)');

  const armed = NOSTREAM ? null : await p.evaluate(async () => {
    const A = window.APP;
    if (typeof window.tmFollowTimeline !== 'function' || typeof window.tmActivateForBake !== 'function') {
      console.log('§SNAP_BUILDUP INCONCLUSIVE — tmFollowTimeline/tmActivateForBake absent; frames would show the FINISHED building');
      return null;
    }
    // ⚠ The Time Machine must be ARMED first. tmFollowTimeline() refuses with 'no-ops' until the
    // timeline is loaded, and cinema_maxq.js:1395 awaits tmActivateForBake() before calling it.
    // Calling it cold returned VACUOUS and produced two identical frames of the FINISHED building.
    const ok = await window.tmActivateForBake();
    if (!ok) { console.log('§SNAP_BUILDUP VACUOUS — tmActivateForBake refused; frames would show the FINISHED building'); return null; }
    if (A.buildupPacingReset) A.buildupPacingReset();
    const st = window.tmFollowTimeline();
    console.log('§SNAP_BUILDUP ' + (st ? 'armed (element-paced, as the bake does)' : 'VACUOUS — no timeline to follow; frames show the FINISHED building'));
    return st ? true : null;
  });

  const layers = await p.evaluate(async (clash, cues, dur) => {
    const A = window.APP, R = { clash: false, cues: 0 };
    if (clash) {
      if (A.clashFilm && A.clashFilm.build) {
        try { await A.clashFilm.build(); R.clash = true; }
        catch (e) { console.log('§SNAP_CLASH FAILED ' + e.message); }
      } else console.log('§SNAP_CLASH INCONCLUSIVE — A.clashFilm.build absent');
    }
    if (cues && A.flythruDatumBuild) {
      try { R.datum = A.flythruDatumBuild(); } catch (e) { console.log('§SNAP_DATUM FAILED ' + e.message); }
    }
    if (cues && A.flythruCuesBuild) {
      try { R.cues = (A.flythruCuesBuild(A.cinemaPathPlan(dur), dur) || []).length; }
      catch (e) { console.log('§SNAP_CUES FAILED ' + e.message); }
    }
    console.log('§SNAP_LAYERS clash=' + (clash ? (R.clash ? 'on' : 'REQUESTED-BUT-OFF') : 'off') +
                ' cues=' + (cues ? R.cues : 'off'));
    return R;
  }, CLASH, CUES, DUR);

  if (!armed && !NOSTREAM) console.log('§SNAP_WARN buildup NOT armed — every frame below is the FINISHED building, NOT the film at that second');
  const rows = [];
  for (const t of TIMES) {
    const info = await p.evaluate(async (t, dur, armed, w, h, layers) => {
      const A = window.APP, u = Math.max(0, Math.min(1, t / dur));
      const plan = A.cinemaPathPlan(dur);
      let cursorMs = null;
      if (armed && A.buildupTAt && A.buildupCursorAt && window.tmFollowTimeline) {
        const st = window.tmFollowTimeline();
        const bkT = A.buildupTAt(u, plan);
        cursorMs = A.buildupCursorAt(bkT, st, dur);
        window.tmSetCursor(cursorMs);
      }
      const pz = plan.poseAt(u);
      A.camera.position.set(pz.x, pz.y, pz.z);
      A.camera.lookAt(pz.tx, pz.ty, pz.tz);
      A.camera.updateMatrixWorld(true);
      const filmSec = u * dur;
      // 3D layers first — they write into the scene the renderer is about to draw.
      if (layers.clash && A.clashFilm && A.clashFilm.update) { try { A.clashFilm.update(filmSec, A.camera); } catch (e) {} }
      if (layers.cues && A.flythruDatumAt) { try { A.flythruDatumAt(filmSec, dur); } catch (e) {} }
      if (layers.cues && A.flythruCuesApplyVisual) { try { A.flythruCuesApplyVisual(filmSec); } catch (e) {} }
      if (A.markDirty) A.markDirty();          // interactive render — NOT a bake, so this is correct here
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      let visible = 0;
      try { A.scene.traverse(function (o) { if (o.visible && (o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) visible++; }); } catch (e) {}
      // ── COMPOSITE, the way cinema_maxq.js:767 _captureFrame does ────────────────────────────────
      // Render explicitly so the drawing buffer is guaranteed populated for drawImage, then lay the
      // 2D layers on top. Without this the labels/captions simply are not in the picture.
      let dataUrl = null, lblN = 0;
      if (layers.clash || layers.cues) {
        try {
          A.renderer.render(A.scene, A.camera);
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.drawImage(A.renderer.domElement, 0, 0, w, h);
          if (layers.clash && A.clashLabels && A.clashLabels.update && A.clashLabelsCompositeOntoCanvas) {
            const li = A.clashLabels.update(A.camera, filmSec, w, h, 0);
            if (li && li.placed && li.placed.length) { lblN = li.placed.length; A.clashLabelsCompositeOntoCanvas(ctx, w, h, li.placed); }
          }
          if (layers.cues && A.flythruDatumCompositeOntoCanvas) {
            try { A.flythruDatumCompositeOntoCanvas(ctx, w, h, filmSec, dur); } catch (e) { console.log('§SNAP_DATUMMARK FAILED ' + e.message); }
          }
          if (layers.cues && A.flythruCuesCompositeOntoCanvas) {
            try { A.flythruCuesCompositeOntoCanvas(ctx, w, h, filmSec); } catch (e) { console.log('§SNAP_DIM FAILED ' + e.message); }
          }
          if (layers.cues && A.flythruCueCaptionAt && A.roomTitleCompositeOntoCanvas) {
            const ti = A.flythruCueCaptionAt(filmSec);
            if (ti && ti.opacity > 0) A.roomTitleCompositeOntoCanvas(ctx, w, h, ti.name, ti.opacity);
          }
          if (cursorMs != null && A.dayCounterAt && A.dayCounterCompositeOntoCanvas) {
            try { const di = A.dayCounterAt(cursorMs); if (di) A.dayCounterCompositeOntoCanvas(ctx, w, h, di, 1, 'tl'); } catch (e) {}
          }
          dataUrl = cv.toDataURL('image/png');
        } catch (e) { console.log('§SNAP_COMPOSITE FAILED ' + e.message + ' — falling back to a plain screenshot'); }
      }
      const day = (A.dayCounterAt && cursorMs != null) ? 'cursor=' + new Date(cursorMs).toISOString().slice(0, 10) : 'cursor=n/a';
      var _dCam = Math.hypot(A.camera.position.x - pz.x, A.camera.position.y - pz.y, A.camera.position.z - pz.z);
      console.log('§SNAP_POSE t=' + t.toFixed(2) + ' poseAt=(' + pz.x.toFixed(1) + ',' + pz.y.toFixed(1) + ',' + pz.z.toFixed(1) +
                  ') cameraAtComposite=(' + A.camera.position.x.toFixed(1) + ',' + A.camera.position.y.toFixed(1) + ',' + A.camera.position.z.toFixed(1) +
                  ') delta=' + _dCam.toFixed(1) + 'm ' + (_dCam < 0.5 ? 'AGREE' : '⚠ DISAGREE — the frame is NOT this plan\'s framing') +
                  ' target=(' + pz.tx.toFixed(1) + ',' + pz.ty.toFixed(1) + ',' + pz.tz.toFixed(1) + ')');
      console.log('§SNAP_FRAME t=' + t.toFixed(2) + 's u=' + u.toFixed(4) + ' ' + day +
                  ' visibleMeshes=' + visible + ' clashLabels=' + lblN + ' composited=' + (dataUrl ? 'yes' : 'no'));
      return { t: t, u: u, cursorMs: cursorMs, visible: visible, clashLabels: lblN, dataUrl: dataUrl,
               cam: [+pz.x.toFixed(1), +pz.y.toFixed(1), +pz.z.toFixed(1)] };
    }, t, DUR, armed, W, H, layers);
    await sleep(350);
    const f = path.join(OUT, DB + '_t' + String(t).replace('.', 'p') + 's.png');
    if (info.dataUrl) fs.writeFileSync(f, Buffer.from(info.dataUrl.split(',')[1], 'base64'));
    else await p.screenshot({ path: f });
    delete info.dataUrl;
    info.file = f; rows.push(info);
    console.log('  §SNAP_WROTE ' + path.basename(f) + '  visibleMeshes=' + info.visible);
  }
  await p.evaluate(() => { try { if (window.tmRestoreDerivedOrder) window.tmRestoreDerivedOrder(); } catch (e) {} });
  fs.writeFileSync(path.join(OUT, DB + '_snaps.json'), JSON.stringify(rows, null, 1));
  console.log('§SNAP_DONE frames=' + rows.length + ' dir=' + OUT +
              ' wall=' + ((Date.now() - T0) / 1000).toFixed(1) + 's' + (NOSTREAM ? ' (--nostream)' : ''));
  await b.close();
})().catch(e => { console.error('SNAP FAILED ' + e.message); process.exit(1); });
