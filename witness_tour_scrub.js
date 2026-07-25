// WITNESS — FLY_TOUR_CORRIDOR_GRAPH.md §TOUR_TIMELINE_SCRUB verification.
//
// ISSUE EACH CLAIM PROVES/DISPROVES (Spec-First: "a tour must be inspectable, not merely seekable"):
//   W-SCRUB-PREPARE     — does the build-time end-pose chain produce a complete, monotonic timeline?
//                         PASS = every action has a finite _duration, _tourStarts is non-decreasing,
//                         and sum(durations) === _tourTotal. FAIL = a lazy/undefined action remains.
//   W-SCRUB-DETERMINISM — is pose = f(T) actually pure? PASS = seeking to the SAME T twice, with
//                         unrelated seeks in between and in a different order, yields BIT-IDENTICAL
//                         camera position and controls.target. FAIL = any component differs.
//   W-SCRUB-HOLD        — can a presenter pause and hold a frame with zero drift? PASS = camera
//                         position/target unchanged (delta 0) across ~3s of real animation frames
//                         while paused. FAIL = any drift, however small.
//   W-SCRUB-BEAT        — do the step buttons land on EXACT action boundaries, not approximations?
//                         PASS = after tourStepBeat, _tourT equals a _tourStarts[] entry exactly.
//   W-SCRUB-OVERLAY     — the user's "maintaining the overlay ie n, Alt-G/o" invariant. PASS = night
//                         mode / GI composer / DLOD-nav flags are byte-identical before and after a
//                         drag-scrub + release. FAIL = scrubbing reset any of them.
//   W-SCRUB-SPEED       — is the speed knob a dt multiplier, not a timeline rescale? PASS =
//                         _tourTotal is unchanged by tourSetSpeed(0.5/1/2).
//   W-SCRUB-UI          — all four knob groups present, linear bar, no rotary dial.
//   W-SCRUB-PANEL-DRAG  — §SCRUB_PANEL_DRAG: is the panel movable WITHOUT becoming a second way to
//                         scrub? PASS = the panel rect moves by the exact synthesized delta, clamps
//                         inside the viewport when dragged off-screen, the position survives
//                         hide→show, AND _tourT + camera pose are UNCHANGED by the drag (the
//                         "nothing broken" assertion — moving the chrome must never write the
//                         timeline). FAIL = any pose/cursor movement, or a lost/unclamped panel.
//
// Whitebox doctrine: every assertion below reads REAL numeric object state (camera position,
// controls.target, _tourT, _tourStarts) out of the live page. No screenshots, no eyeballing.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8410;
const BLD = process.env.BLD || 'LTU_AHouse';
const results = [];
function claim(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 240000, polling: 2000 });
    await page.waitForFunction(() => !window.APP.streaming, { timeout: 300000, polling: 2000 });
    console.log('[witness] streaming drained, starting tour');

    // Start the real Fly Tour (real route planning, real building, real geometry).
    await page.evaluate(() => window.APP.toggleFlyAround());
    await page.waitForFunction(() => window.APP.walkActions && window.APP.walkActions.length > 0 &&
                                     window.APP._tourStarts && window.APP._tourTotal > 0,
                               { timeout: 300000, polling: 1000 });

    // ── W-SCRUB-PREPARE ───────────────────────────────────────────────────────
    const prep = await page.evaluate(() => {
      const A = window.APP;
      let sum = 0, mono = true, allFinite = true, prev = -1;
      for (let i = 0; i < A.walkActions.length; i++) {
        const d = A.walkActions[i]._duration;
        if (!(typeof d === 'number' && isFinite(d) && d >= 0)) allFinite = false;
        if (A._tourStarts[i] < prev) mono = false;
        prev = A._tourStarts[i];
        sum += d;
      }
      return { n: A.walkActions.length, sum, total: A._tourTotal, mono, allFinite,
               inited: A.walkActions.every(a => a._inited === true) };
    });
    claim('W-SCRUB-PREPARE', prep.allFinite && prep.mono && prep.inited && Math.abs(prep.sum - prep.total) < 1e-9,
      `actions=${prep.n} sum=${prep.sum.toFixed(6)}s total=${prep.total.toFixed(6)}s monotonic=${prep.mono} allEagerlyInited=${prep.inited}`);

    // ── W-SCRUB-DETERMINISM ───────────────────────────────────────────────────
    // Seek to a probe set, then re-seek the SAME values in reverse order with unrelated seeks
    // interleaved. Compare raw float components — bit-identical or it is not a timeline.
    const det = await page.evaluate(() => {
      const A = window.APP;
      const snap = () => [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                          A.controls.target.x, A.controls.target.y, A.controls.target.z];
      const probes = [0, A._tourTotal * 0.13, A._tourTotal * 0.37, A._tourTotal * 0.62,
                      A._tourTotal * 0.88, A._tourTotal];
      const first = {};
      probes.forEach(T => { A.tourSeek(T, false); first[T] = snap(); });
      // scramble: unrelated seeks between, and revisit in reverse
      const second = {}, deltas = [];
      probes.slice().reverse().forEach(T => {
        A.tourSeek(A._tourTotal * Math.random(), false);   // decoy seek
        A.tourSeek(T, false);
        second[T] = snap();
        let worst = 0;
        for (let i = 0; i < 6; i++) worst = Math.max(worst, Math.abs(first[T][i] - second[T][i]));
        deltas.push({ T: +T.toFixed(4), worst });
      });
      return { deltas, worstAll: Math.max(...deltas.map(d => d.worst)), sample: first[probes[3]] };
    });
    claim('W-SCRUB-DETERMINISM', det.worstAll === 0,
      `probes=${det.deltas.length} worstComponentDelta=${det.worstAll} ` +
      det.deltas.map(d => `T=${d.T}:${d.worst}`).join(' '));

    // ── W-SCRUB-BEAT ──────────────────────────────────────────────────────────
    const beat = await page.evaluate(() => {
      const A = window.APP;
      A.tourSeek(A._tourTotal * 0.5, false);
      const out = [];
      for (let k = 0; k < 3; k++) {
        A.tourStepBeat(-1);
        out.push({ dir: 'prev', T: A._tourT, exact: A._tourStarts.indexOf(A._tourT) });
      }
      for (let k = 0; k < 3; k++) {
        A.tourStepBeat(1);
        out.push({ dir: 'next', T: A._tourT, exact: A._tourStarts.indexOf(A._tourT) });
      }
      // land on the same beat twice from different directions → same pose?
      const b = A._tourStarts[Math.floor(A._tourStarts.length / 2)];
      A.tourSeek(0, false); A.tourSeek(b, false);
      const p1 = [A.camera.position.x, A.camera.position.y, A.camera.position.z];
      A.tourSeek(A._tourTotal, false); A.tourSeek(b, false);
      const p2 = [A.camera.position.x, A.camera.position.y, A.camera.position.z];
      const repeat = Math.max(...p1.map((v, i) => Math.abs(v - p2[i])));
      return { out, repeat, b };
    });
    const beatExact = beat.out.every(o => o.exact >= 0 || o.T === 0);
    claim('W-SCRUB-BEAT', beatExact && beat.repeat === 0,
      `steps=${beat.out.map(o => `${o.dir}@${o.T.toFixed(4)}[idx${o.exact}]`).join(' ')} ` +
      `sameBeatFromBothDirections_posDelta=${beat.repeat}`);

    // ── W-SCRUB-OVERLAY ───────────────────────────────────────────────────────
    const ov = await page.evaluate(async () => {
      const A = window.APP;
      // Turn ON all three overlays the user named ("n, Alt-G/o") before scrubbing, so the
      // invariant is tested in its ON state, not trivially in its default OFF state.
      if (typeof window.toggleNightMode === 'function') window.toggleNightMode();
      if (typeof A.toggleGIPreview === 'function') { try { await A.toggleGIPreview(true); } catch (e) {} }
      if (typeof window.toggleDlodNav === 'function') { try { window.toggleDlodNav(); } catch (e) {} }
      await new Promise(r => setTimeout(r, 500));
      const before = { night: !!A._nightMode, gi: !!A._giComposerActive,
                       dlodOn: !!window._dlodNavOn, dlodEngaged: !!window._dlodNavEngaged };
      // simulate a real drag on the bar: input events then release
      const sl = document.getElementById('tour-scrub-slider');
      for (let v = 100; v <= 700; v += 60) {
        sl.value = String(v);
        sl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      sl.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const after = { night: !!A._nightMode, gi: !!A._giComposerActive,
                      dlodOn: !!window._dlodNavOn, dlodEngaged: !!window._dlodNavEngaged };
      return { before, after, T: A._tourT, idx: A.walkActionIdx };
    });
    const ovSame = JSON.stringify(ov.before) === JSON.stringify(ov.after);
    claim('W-SCRUB-OVERLAY', ovSame,
      `before=${JSON.stringify(ov.before)} after=${JSON.stringify(ov.after)} landedT=${ov.T.toFixed(4)} idx=${ov.idx}`);

    // ── W-SCRUB-HOLD ──────────────────────────────────────────────────────────
    const hold = await page.evaluate(async () => {
      const A = window.APP;
      A.tourSeek(A._tourTotal * 0.42, false);
      A.tourTogglePause(true);
      const p0 = [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                  A.controls.target.x, A.controls.target.y, A.controls.target.z];
      const T0 = A._tourT;
      // Drive the ACTUAL playback path directly — headless rAF is throttled, so counting animation
      // frames would prove almost nothing. 600 explicit walkTick() calls (~10s of 60fps playback)
      // is the real assertion that the paused branch writes neither camera nor cursor.
      let frames = 0;
      for (let i = 0; i < 600; i++) { A.walkTick(); frames++; }
      const t0 = performance.now();
      await new Promise(res => {
        const step = () => { if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
      for (let i = 0; i < 600; i++) { A.walkTick(); frames++; }
      const p1 = [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                  A.controls.target.x, A.controls.target.y, A.controls.target.z];
      return { drift: Math.max(...p0.map((v, i) => Math.abs(v - p1[i]))), frames,
               tDrift: Math.abs(A._tourT - T0), paused: A._tourPaused };
    });
    claim('W-SCRUB-HOLD', hold.drift === 0 && hold.tDrift === 0,
      `paused=${hold.paused} walkTickCalls=${hold.frames} maxPoseDrift=${hold.drift} cursorDrift=${hold.tDrift} over 3000ms wall-clock`);

    // ── W-SCRUB-DRAG-RELEASE ──────────────────────────────────────────────────
    // Proves a drag leaves NO residue: the pose at rest after dragging to T must equal the pose of
    // a cold hard seek to the same T (the gaze lerp used mid-drag must not survive the release).
    const drag = await page.evaluate(() => {
      const A = window.APP;
      A.tourTogglePause(false);
      const sl = document.getElementById('tour-scrub-slider');
      const target = 640;                                  // slider units
      const T = (target / 1000) * A._tourTotal;
      A.tourSeek(0, false);
      sl.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      for (let v = 600; v <= target; v += 8) { sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true })); }
      sl.dispatchEvent(new Event('change', { bubbles: true }));
      const afterDrag = [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                         A.controls.target.x, A.controls.target.y, A.controls.target.z];
      A.tourSeek(0, false); A.tourSeek(A._tourTotal, false);   // scramble
      A.tourSeek(T, false);
      const cold = [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                    A.controls.target.x, A.controls.target.y, A.controls.target.z];
      return { T, delta: Math.max(...afterDrag.map((v, i) => Math.abs(v - cold[i]))) };
    });
    claim('W-SCRUB-DRAG-RELEASE', drag.delta === 0,
      `dragRestPose vs coldSeek at T=${drag.T.toFixed(4)} maxComponentDelta=${drag.delta}`);

    // ── W-SCRUB-SPEED ─────────────────────────────────────────────────────────
    const spd = await page.evaluate(() => {
      const A = window.APP;
      const t0 = A._tourTotal;
      const seen = [];
      [0.5, 2, 1].forEach(m => { A.tourSetSpeed(m); seen.push({ m, mult: A.tourScrubSpeed, total: A._tourTotal }); });
      return { t0, seen, stable: seen.every(s => s.total === t0) };
    });
    claim('W-SCRUB-SPEED', spd.stable && spd.seen[2].mult === 1,
      `total=${spd.t0.toFixed(4)}s unchanged across ${spd.seen.map(s => s.m + 'x→' + s.total.toFixed(4)).join(' ')}`);

    // ── W-SCRUB-PLAYBACK ──────────────────────────────────────────────────────
    // REGRESSION: walkTick was rewritten to drive off _actInit/_actPose. Proves ordinary forward
    // playback still advances — cursor monotonically increasing, camera actually moving, action
    // index progressing. (Headless rAF is throttled, so walkTick is driven with real time gaps.)
    const play = await page.evaluate(async () => {
      const A = window.APP;
      A.tourSetSpeed(1);
      A.tourSeek(0, false);
      A.tourTogglePause(false);
      A.walkLastTime = 0;
      const samples = [];
      for (let i = 0; i < 80; i++) {
        A.walkTick();
        samples.push({ T: A._tourT, idx: A.walkActionIdx,
                       p: [A.camera.position.x, A.camera.position.y, A.camera.position.z] });
        await new Promise(r => setTimeout(r, 30));
      }
      let mono = true, moved = 0;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].T < samples[i - 1].T - 1e-9) mono = false;
        moved += Math.hypot(samples[i].p[0] - samples[i - 1].p[0],
                            samples[i].p[1] - samples[i - 1].p[1],
                            samples[i].p[2] - samples[i - 1].p[2]);
      }
      const endT = samples[samples.length - 1].T;
      const played = [A.camera.position.x, A.camera.position.y, A.camera.position.z];
      A.tourSeek(endT, false);      // pure timeline pose at the same cursor
      const pure = [A.camera.position.x, A.camera.position.y, A.camera.position.z];
      return { mono, moved, endT, idxEnd: samples[samples.length - 1].idx,
               idxStart: samples[0].idx,
               purityGap: Math.max(...played.map((v, i) => Math.abs(v - pure[i]))) };
    });
    claim('W-SCRUB-PLAYBACK', play.mono && play.moved > 1 && play.endT > 0,
      `cursorMonotonic=${play.mono} pathTravelled=${play.moved.toFixed(3)}m endT=${play.endT.toFixed(3)}s ` +
      `actionIdx ${play.idxStart}→${play.idxEnd} | playback-vs-pure pose gap=${play.purityGap.toFixed(4)}m ` +
      `(expected non-zero: the shipped adaptive-jump smoothing is playback-only by design)`);

    // ── W-SCRUB-UI ────────────────────────────────────────────────────────────
    const ui = await page.evaluate(() => {
      const q = id => !!document.getElementById(id);
      const panel = document.getElementById('tour-scrub-panel');
      const sl = document.getElementById('tour-scrub-slider');
      return {
        visible: !!panel && panel.style.display === 'flex',
        slider: !!sl && sl.type === 'range',
        ticks: document.getElementById('tour-scrub-ticks') ? document.getElementById('tour-scrub-ticks').children.length : 0,
        play: q('tour-scrub-play'), prev: q('tour-scrub-prev'), next: q('tour-scrub-next'),
        restart: q('tour-scrub-restart'),
        speeds: document.querySelectorAll('.tour-scrub-spd').length,
        time: document.getElementById('tour-scrub-time') ? document.getElementById('tour-scrub-time').textContent : '',
        dial: document.querySelectorAll('.scrubknob, canvas.knob').length,
      };
    });
    claim('W-SCRUB-UI', ui.visible && ui.slider && ui.ticks > 0 && ui.play && ui.prev && ui.next &&
                        ui.restart && ui.speeds === 3 && /\d+:\d\d \/ \d+:\d\d/.test(ui.time) && ui.dial === 0,
      `barVisible=${ui.visible} linearRangeThumb=${ui.slider} chapterTicks=${ui.ticks} ` +
      `play/prev/next/restart=${ui.play}/${ui.prev}/${ui.next}/${ui.restart} speedBtns=${ui.speeds} ` +
      `mmss="${ui.time}" rotaryDials=${ui.dial}`);

    // ── W-SCRUB-PANEL-DRAG ────────────────────────────────────────────────────
    // §SCRUB_PANEL_DRAG. Synthesizes real PointerEvents on the panel BACKGROUND (not the slider,
    // not a button) and reads back the rect + the timeline state. The pose/cursor invariant is the
    // point of this witness: the panel is chrome, the timeline is data, and they must not touch.
    const pan = await page.evaluate(async () => {
      const A = window.APP;
      const p = document.getElementById('tour-scrub-panel');
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const rect = () => { const r = p.getBoundingClientRect(); return { left: r.left, top: r.top }; };
      const pose = () => [A.camera.position.x, A.camera.position.y, A.camera.position.z,
                          A.controls.target.x, A.controls.target.y, A.controls.target.z];
      // grab a point on the panel background: just inside the top edge, clear of the label row's
      // controls (the header <span>s are not input/button so they drag — that is intended).
      const send = (type, x, y) => p.dispatchEvent(new PointerEvent(type, {
        pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true }));

      A.tourSeek(A._tourTotal * 0.4, false);
      A.tourTogglePause(true);                 // hold the pose so any drift is the drag's fault
      await sleep(50);
      const before = rect(), poseBefore = pose(), tBefore = A._tourT;

      // 1. exact-delta move
      const DX = -120, DY = -90;
      send('pointerdown', before.left + 40, before.top + 6);
      send('pointermove', before.left + 40 + DX, before.top + 6 + DY);
      send('pointerup',   before.left + 40 + DX, before.top + 6 + DY);
      await sleep(30);
      const after = rect();
      const dx = after.left - before.left, dy = after.top - before.top;
      const exact = Math.abs(dx - DX) <= 1 && Math.abs(dy - DY) <= 1;

      // 2. clamp — drag hard off the top-left; must park at the edge, never leave the viewport
      send('pointerdown', after.left + 40, after.top + 6);
      send('pointermove', -5000, -5000);
      send('pointerup',   -5000, -5000);
      await sleep(30);
      const clampedRect = p.getBoundingClientRect();
      const inView = clampedRect.left >= -0.5 && clampedRect.top >= -0.5 &&
                     clampedRect.right <= window.innerWidth + 0.5 &&
                     clampedRect.bottom <= window.innerHeight + 0.5;

      // 3. persistence across hide → show
      const parked = rect();
      A._scrubHide(); await sleep(20); A._scrubShow(); await sleep(30);
      const restored = rect();
      const persisted = Math.abs(restored.left - parked.left) <= 1 &&
                        Math.abs(restored.top - parked.top) <= 1;

      // 4. THE invariant — the timeline never moved through any of it
      const poseAfter = pose(), tAfter = A._tourT;
      const poseDelta = Math.max(...poseAfter.map((v, i) => Math.abs(v - poseBefore[i])));
      const cursorDelta = Math.abs(tAfter - tBefore);

      // 5. the slider still seeks after the panel has been moved (no wiring casualty)
      const sl = document.getElementById('tour-scrub-slider');
      const tPre = A._tourT;
      sl.value = String(Math.round(0.75 * 1000));
      sl.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
      const sliderStillSeeks = Math.abs(A._tourT - tPre) > 1;

      A.tourTogglePause(false);
      return { exact, dx, dy, inView, persisted, poseDelta, cursorDelta, sliderStillSeeks,
               left: clampedRect.left, top: clampedRect.top };
    });
    claim('W-SCRUB-PANEL-DRAG',
      pan.exact && pan.inView && pan.persisted && pan.poseDelta === 0 && pan.cursorDelta === 0 &&
      pan.sliderStillSeeks,
      `movedBy=${pan.dx.toFixed(1)},${pan.dy.toFixed(1)} exactDelta=${pan.exact} ` +
      `clampedInView=${pan.inView} parkedAt=${pan.left.toFixed(1)},${pan.top.toFixed(1)} ` +
      `persistedAcrossHideShow=${pan.persisted} | poseDelta=${pan.poseDelta} ` +
      `cursorDelta=${pan.cursorDelta} sliderStillSeeks=${pan.sliderStillSeeks}`);

  } catch (e) {
    claim('WITNESS-RUN', false, 'threw: ' + e.message);
  }

  console.log('\n───── §-tagged page log (scrub only) ─────');
  logs.filter(l => /§SCRUB|§TOUR_VERSION|PAGEERROR/.test(l)).slice(0, 60).forEach(l => console.log(l));
  console.log('\n───── SUMMARY ─────');
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
  const allPass = results.length > 0 && results.every(r => r.pass);
  console.log(allPass ? 'WITNESS RESULT: ALL PASS' : 'WITNESS RESULT: FAILURES PRESENT');
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
