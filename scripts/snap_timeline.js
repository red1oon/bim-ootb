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
const CUES = process.argv.includes('--cues');
let TIMES = arg('at', null) ? arg('at').split(',').map(Number)
  : (() => { const a = [], f = Number(arg('from', 0)), t = Number(arg('to', 10)), s = Number(arg('step', 1));
             for (let x = f; x <= t + 1e-9; x += s) a.push(+x.toFixed(3)); return a; })();

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
  p.on('console', m => { const t = m.text(); if (/§SNAP_|§FLYTHRU_|§CLASH_LABELS|PAGEERROR/.test(t)) console.log('  ' + t); });
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
  const hasDim = await p.evaluate(() => typeof window.APP.flythruCuesCompositeOntoCanvas === 'function');
  console.log('§SNAP_JS flythruCuesCompositeOntoCanvas=' + (hasDim ? 'present' : 'ABSENT — page is still on stale JS'));
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

  const armed = await p.evaluate(async () => {
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

  if (!armed) console.log('§SNAP_WARN buildup NOT armed — every frame below is the FINISHED building, NOT the film at that second');
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
  console.log('§SNAP_DONE frames=' + rows.length + ' dir=' + OUT);
  await b.close();
})().catch(e => { console.error('SNAP FAILED ' + e.message); process.exit(1); });
