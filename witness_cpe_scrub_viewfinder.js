// WITNESS — §CPE_SCRUB / §CPE_VIEWFINDER (Parts A and B).
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part A §CPE_SCRUB, Part B §CPE_VIEWFINDER.
//
// REWRITTEN 2026-08-05 — the scrub bar became its own standalone panel (§CPE_SCRUB_STANDALONE),
// independent of B's toggle, and a scrub drag now legitimately drives B's inset camera again
// (§CPE_SCRUB_VF_LIVE — the mid-fix cut from the #1177 session, restored). The v23-era gates that
// asserted the OPPOSITE of both (bar gated to B; B's camera never moves on scrub) are GONE, replaced
// below — see CPE_V's v24 entry in cinema_path_editor.js for the full change list this witness
// re-verifies. The one invariant that has NEVER changed across any of these revisions — the MAIN
// canvas camera/controls must stay byte-identical across any scrub, drag or click — is still the
// single most important gate here (G-SCRUB-NOCAM), unmodified in spirit from the original #1177 fix.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-SCRUB-STANDALONE  the scrub panel exists in the DOM as soon as the editor opens, BEFORE B is
//                       ever toggled on — proves the panel is independent of B, not nested/gated.
//   G-SCRUB-PANEL-LOG   the scrub panel logs its own creation (was completely silent before) —
//                       left-anchored, no viewport-bottom overflow, clear of #cpe-panel.
//   G-VF-PANEL-CLEAR    B's panel logs its own creation (also previously silent) — left-anchored,
//                       NOT the old right-anchor-into-#cpe-panel's-column bug, z-index above it.
//   G-SCRUB-NOCAM       the main camera's position AND orbit target are byte-identical before/after
//                       a scrub drag (B off) — the regression gate, unchanged in spirit since #1177.
//   G-SCRUB-VISUAL      a scrub drag still updates the playhead and the "mm:ss / mm:ss" readout text.
//   G-SCRUB-VF-LIVE     with B ON, a scrub drag drives B's inset camera (vfCam) to plan.poseAt(tn) —
//                       while the main camera stays untouched in the SAME drag. Proves the restored
//                       §CPE_SCRUB_VF_LIVE feature without reopening the #1177 regression.
//   G-SCRUB-NOSPAWN     clicking the bar (0px press, same click-vs-drag doctrine as before) does NOT
//                       spawn a new band — retires the old G-SCRUB-SPAWN gate, which asserted the
//                       opposite (§CPE_SCRUB_READONLY: creation only via canvas/row list now).
//   G-SCRUB-TICK-BLUE   a stick's tick mark on the bar renders in CPE_STICK_BLUE, not the old red.
//   G-SCRUB-PERSISTS    toggling B off does NOT remove the scrub panel (opposite of the old
//                       gated-to-B behaviour) — it only disappears when the EDITOR closes.
//   G-SCRUB-PLAY        pressing play starts a rehearsal; pause freezes the flight fraction (no
//                       advance over a real wait); resume continues it — real pause/resume, not a
//                       screenshot-verified "looks paused".
//   G-SCRUB-PLAY-POVONLY  the SAME button-driven flight leaves the main camera byte-identical
//                       throughout (start/pause/resume) — §CPE_SCRUB_POV_ONLY: the scrub-play
//                       button now calls _previewFly(true), driving B alone, never the main canvas.
//   G-SCRUB-CLOSE-TEARDOWN  closing the editor (Cancel) removes the scrub panel too.
//   G-VF-1     B's camera pose at tn matches the main camera's exact pose at that instant DURING A
//              REAL REHEARSAL — one pose source, both fed by the same _applyCameraPose call.
//              Unaffected by any of this session's changes — same mechanism as before.
//   G-VF-2     B's Time Machine readout is a READ of the cursor step() already set that frame, never
//              a second tmSetCursor call — proven both statically and live. Unchanged.
//   G-PERF-1   measured (not guessed) ms/frame B's own scissor pass adds during rehearsal, plus a
//              static proof cinema_maxq.js (the MaxQ bake loop) never references the render hook.
const fs = require('fs');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8460;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEditor(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

async function gates(browser, BLD, repoDir) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  // ── G-SCRUB-STANDALONE: the panel exists BEFORE B is ever toggled on ────────────────────────────
  const standalone = await page.evaluate(() => ({
    track: !!document.getElementById('cpe-scrub-track'),
    panel: !!document.getElementById('cpe-scrub-panel'),
    vfOn: window.APP.cinemaPathEditor._probeVF().on
  }));
  P('G-SCRUB-STANDALONE the scrub panel exists at editor-open, independent of B',
    standalone.track && standalone.panel && standalone.vfOn === false,
    `trackPresent=${standalone.track} panelPresent=${standalone.panel} vfOnAtOpen=${standalone.vfOn}`);

  // ── G-SCRUB-PANEL-LOG: the scrub panel logs its own creation (was completely silent before —
  // no console evidence existed for a "scrubber is missing" report). Real numbers, not a screenshot:
  // left-anchored (not off past the viewport bottom), clear of #cpe-panel.
  const scrubCreated = logs.find(l => l.startsWith('§CPE_SCRUB_PANEL_CREATED'));
  let scrubLogOk = false, scrubLogDetail = 'no §CPE_SCRUB_PANEL_CREATED line seen';
  if (scrubCreated) {
    const m = /left=(-?\d+).*bottomOverflowPx=(\d+).*cpePanel=(\S+)/.exec(scrubCreated);
    if (m) {
      const left = +m[1], overflow = +m[2], cpePanel = m[3];
      scrubLogOk = left < 100 && overflow === 0 && cpePanel !== 'OVERLAP';
      scrubLogDetail = `left=${left} bottomOverflowPx=${overflow} cpePanel=${cpePanel}`;
    }
  }
  P('G-SCRUB-PANEL-LOG scrub panel logs its own creation: left-anchored, no viewport overflow, clear of #cpe-panel',
    scrubLogOk, scrubLogDetail);

  // ── G-SCRUB-NOCAM: the regression gate — no MAIN camera move during a scrub drag, B still off ───
  const before1 = await page.evaluate(() => {
    const A = window.APP;
    return {
      mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      scrubLabel: document.getElementById('cpe-scrub-tn').textContent
    };
  });
  const scrubResult = await page.evaluate(() => window.APP.cinemaPathEditor._scrubTo(0.42));
  await sleep(50);
  const after1 = await page.evaluate(() => {
    const A = window.APP;
    return {
      mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      scrubLabel: document.getElementById('cpe-scrub-tn').textContent
    };
  });
  const dMainPos1 = Math.hypot(after1.mainPos.x - before1.mainPos.x, after1.mainPos.y - before1.mainPos.y, after1.mainPos.z - before1.mainPos.z);
  const dMainTgt1 = Math.hypot(after1.mainTgt.x - before1.mainTgt.x, after1.mainTgt.y - before1.mainTgt.y, after1.mainTgt.z - before1.mainTgt.z);
  P('G-SCRUB-NOCAM the main camera (position AND target) is byte-identical before/after a scrub drag (B off)',
    dMainPos1 < 1e-9 && dMainTgt1 < 1e-9,
    `mainPosDelta=${dMainPos1.toExponential(2)}m mainTargetDelta=${dMainTgt1.toExponential(2)}m ` +
    `scrubResult.x=${scrubResult ? scrubResult.x.toFixed(2) : 'null'} (poseAt(0.42) IS sampled and returned — just never written to the main camera)`);
  P('G-SCRUB-VISUAL the playhead/readout DID change (mm:ss / mm:ss, not the old %)',
    before1.scrubLabel !== after1.scrubLabel,
    `before="${before1.scrubLabel}" after="${after1.scrubLabel}"`);

  // ── toggle B on — shared setup for G-SCRUB-VF-LIVE, G-SCRUB-PERSISTS, G-VF-1, G-VF-2, G-PERF-1 ──
  const vfOnState = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(300);

  // ── G-VF-PANEL-CLEAR: B's default position was NEVER actually fixed by the earlier "clear of
  // #cpe-panel" commit (only the scrub panel's was, despite that commit's own message claiming
  // both) — confirmed by direct code read, fixed in this same edit. B's own creation log (also
  // previously silent) now proves it live: left-anchored (not the old canvasWidth-derived right
  // anchor), z-index above #cpe-panel's, no overlap.
  const vfCreated = logs.find(l => l.startsWith('§CPE_VF_PANEL_CREATED'));
  let vfLogOk = false, vfLogDetail = 'no §CPE_VF_PANEL_CREATED line seen';
  if (vfCreated) {
    const m = /left=(-?\d+).*zIndex=(\d+).*cpePanel=(\S+)/.exec(vfCreated);
    if (m) {
      const left = +m[1], zIndex = +m[2], cpePanel = m[3];
      vfLogOk = left < 100 && zIndex >= 10001 && cpePanel !== 'OVERLAP';
      vfLogDetail = `left=${left} zIndex=${zIndex} cpePanel=${cpePanel}`;
    }
  }
  P('G-VF-PANEL-CLEAR B\'s panel logs its own creation: left-anchored (not the old right-anchor bug), z-index above #cpe-panel, clear of it',
    vfLogOk, vfLogDetail);

  // ── G-SCRUB-VF-LIVE: with B on, scrub drives B's camera to plan.poseAt(tn); main stays untouched ─
  const before2 = await page.evaluate(() => {
    const A = window.APP;
    return { mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
             mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } };
  });
  const vfLive = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const p = cpe._scrubTo(0.58);
    const vf = cpe._probeVF();
    return { p, vfCam: vf.camPose };
  });
  const after2 = await page.evaluate(() => {
    const A = window.APP;
    return { mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
             mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } };
  });
  const dMainPos2 = Math.hypot(after2.mainPos.x - before2.mainPos.x, after2.mainPos.y - before2.mainPos.y, after2.mainPos.z - before2.mainPos.z);
  const dMainTgt2 = Math.hypot(after2.mainTgt.x - before2.mainTgt.x, after2.mainTgt.y - before2.mainTgt.y, after2.mainTgt.z - before2.mainTgt.z);
  const dVfLive = (vfLive.p && vfLive.vfCam)
    ? Math.hypot(vfLive.vfCam.x - vfLive.p.x, vfLive.vfCam.y - vfLive.p.y, vfLive.vfCam.z - vfLive.p.z) : null;
  P('G-SCRUB-VF-LIVE a scrub drag (B on) sets vfCam to plan.poseAt(tn), main camera still untouched',
    dVfLive != null && dVfLive < 1e-9 && dMainPos2 < 1e-9 && dMainTgt2 < 1e-9,
    `vfCamDelta=${dVfLive == null ? 'n/a' : dVfLive.toExponential(2) + 'm'} mainPosDelta=${dMainPos2.toExponential(2)}m mainTargetDelta=${dMainTgt2.toExponential(2)}m`);

  // ── Ensure at least one stick exists (some seeded paths have none) via the real _spawnStick ─────
  // mutation, deterministic input, same precedent as G-PIN's _setPin bypassing the UI raycast. Done
  // BEFORE either gate below so G-SCRUB-TICK-BLUE observes an UNSELECTED tick (selecting it, which
  // G-SCRUB-BEARING does next, legitimately turns it orange — that's the correct convention, not a
  // bug, so the colour check must run first).
  const stickCount = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    let sticks = cpe._probeScrub().sticks;
    if (!sticks.length) { cpe._spawnStickForTest(0.5); sticks = cpe._probeScrub().sticks; }
    return sticks.length;
  });
  await sleep(100);

  // ── G-SCRUB-TICK-BLUE: an unselected stick's tick is CPE_STICK_BLUE, not red ────────────────────
  const tickColor = stickCount ? await page.evaluate(() => {
    const track = document.getElementById('cpe-scrub-track');
    const ticks = Array.from(track.children).filter(c => c.title && c.title.indexOf('into the film') >= 0);
    return ticks.length ? getComputedStyle(ticks[0]).backgroundColor : null;
  }) : null;
  // CPE_STICK_BLUE = 0x1565c0 = rgb(21,101,192); the old red was 0xe53935 = rgb(229,57,53).
  P('G-SCRUB-TICK-BLUE stick tick marks render blue, not the old red',
    tickColor === 'rgb(21, 101, 192)', `tickColor=${tickColor} stickCount=${stickCount}`);

  // ── G-SCRUB-BEARING: selecting a stick (the row-list path, same fn the canvas click uses) moves ──
  // the playhead AND B's camera to that stick's own film position — "perfect bearing" per the user.
  const bearing = stickCount ? await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const target = cpe._probeScrub().sticks[0];
    cpe._holdForTest(target.i, 'mid');
    const after = cpe._probeVF();
    const scrubTn = cpe._probeScrub().scrubTn;
    return { targetTn: target.tNorm, scrubTn, vfCam: after.camPose, p: cpe._probePoseAt(target.tNorm) };
  }) : null;
  let bearOk = false, bearDetail = 'no sticks on this building — inconclusive';
  if (bearing) {
    const dPlayhead = Math.abs(bearing.scrubTn - bearing.targetTn);
    const dVfBear = (bearing.vfCam && bearing.p)
      ? Math.hypot(bearing.vfCam.x - bearing.p.x, bearing.vfCam.y - bearing.p.y, bearing.vfCam.z - bearing.p.z) : null;
    bearOk = dPlayhead < 1e-6 && dVfBear != null && dVfBear < 1e-9;
    bearDetail = `stickTn=${bearing.targetTn.toFixed(4)} playheadTn=${bearing.scrubTn.toFixed(4)} playheadDelta=${dPlayhead.toExponential(2)} vfCamDelta=${dVfBear == null ? 'n/a' : dVfBear.toExponential(2) + 'm'}`;
  }
  P('G-SCRUB-BEARING selecting a stick (row list, same fn as canvas) moves the playhead and B\'s camera to it', bearOk, bearDetail);

  // ── G-SCRUB-NOSPAWN: clicking the bar (0px press) does NOT spawn a stick ────────────────────────
  const setup2 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const win = cpe._probeScrub().walkWindow;
    if (!win) return null;
    const tn = win.spin + (win.out - win.spin) * 0.5;   // mid-walk, safely inside
    const track = document.getElementById('cpe-scrub-track');
    const r = track.getBoundingClientRect();
    const px = Math.round(r.left + tn * r.width), py = Math.round(r.top + r.height / 2);
    const nBefore = document.querySelectorAll('#cpe-rows > div[data-cpe-row="band"]').length;
    return { tn, px, py, nBefore };
  });
  let g2ok = false, g2detail = 'walk window unavailable — inconclusive';
  if (setup2) {
    const before3 = await page.evaluate(() => document.getElementById('cpe-scrub-tn').textContent);
    await page.mouse.move(setup2.px, setup2.py);
    await page.mouse.down();
    await sleep(30);
    await page.mouse.up();          // a 0px press == a click, same doctrine as §CPE_CLICK_SLOP
    await sleep(300);
    const after3 = await page.evaluate(() => ({
      n: document.querySelectorAll('#cpe-rows > div[data-cpe-row="band"]').length,
      label: document.getElementById('cpe-scrub-tn').textContent
    }));
    g2ok = after3.n === setup2.nBefore && after3.label !== before3;
    g2detail = `rows ${setup2.nBefore}->${after3.n} (unchanged) label "${before3}"->"${after3.label}" (scrubbed instead of spawning)`;
  }
  P('G-SCRUB-NOSPAWN a click on the bar scrubs to that point, never spawns a stick', g2ok, g2detail);

  // ── G-SCRUB-PERSISTS: toggling B off leaves the scrub panel in place ────────────────────────────
  const offState = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(200);
  const persists = await page.evaluate(() => !!document.getElementById('cpe-scrub-track'));
  P('G-SCRUB-PERSISTS toggling B off does NOT remove the scrub panel (only editor-close does)',
    offState === false && persists === true, `vfOn=${offState} scrubStillPresent=${persists}`);
  // Toggle B back on — the rest of this run (G-VF-1/2, G-PERF-1) needs it on.
  await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(200);

  // ── G-VF-1 (B on): rehearsal-style pose application — same mechanism as before, unaffected ──────
  const vf1 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    cpe._applyCameraPoseForTest(0.65);
    return cpe._probeVF();
  });
  const dVF = vf1.camPose ? Math.hypot(vf1.camPose.x - vf1.mainPose.x, vf1.camPose.y - vf1.mainPose.y, vf1.camPose.z - vf1.mainPose.z) : null;
  P('G-VF-1 B\'s camera pose at tn=0.65 matches the main camera exactly (same plan.poseAt sample, rehearsal-style application)',
    dVF != null && dVF < 1e-6,
    `hookInstalled=${vf1.hookInstalled} delta=${dVF == null ? 'n/a' : dVF.toExponential(2)}m rect=${vf1.rect ? JSON.stringify(vf1.rect) : 'null'}`);

  // ── G-VF-2: static — the vf functions never call tmSetCursor, only tmGetState ──────────────────
  const src = fs.readFileSync(repoDir + '/viewer/cinema_path_editor.js', 'utf8');
  const vfBlock = src.slice(src.indexOf('function _vfUpdateReadout'), src.indexOf('function _wireViewfinderToggle'));
  const noSecondClock = vfBlock.includes('tmGetState') && !vfBlock.includes('tmSetCursor');
  P('G-VF-2a static: the viewfinder block reads tmGetState and never calls tmSetCursor', noSecondClock,
    `vfBlock length=${vfBlock.length} hasGet=${vfBlock.includes('tmGetState')} hasSet=${vfBlock.includes('tmSetCursor')}`);

  // ── G-VF-2 live + G-SCRUB-PLAY: run a real rehearsal with buildup ON, pause it mid-flight, ─────
  // resume it — one flight covers both the readout-drift gate and the new pause/resume gate.
  await page.evaluate(() => {
    const cb = document.getElementById('cpe-buildup');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
  });
  await sleep(200);
  const vf2mark = logs.length;
  await page.evaluate(() => { const el = document.getElementById('cpe-vf-clock'); if (el) el.textContent = ''; });
  // ── G-SCRUB-PLAY-POVONLY setup: main camera pose captured BEFORE the transport-button flight
  // starts — the scrub-play button now calls _previewFly(true) (§CPE_SCRUB_POV_ONLY), so this same
  // flight doubles as the regression gate: main canvas must stay parked throughout a POV-only play.
  const mainBefore = await page.evaluate(() => {
    const A = window.APP;
    return { pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
             tgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } };
  });
  page.evaluate(() => document.getElementById('cpe-scrub-play').click());   // starts via the NEW transport button
  // §CPE_PREVIEW_BUILDUP arms ASYNCHRONOUSLY (awaits tmActivateForBake before startFly() even
  // runs — same fact G-VF-2's own comment below already names, 513ms-3.2s depending on building
  // size). `flying` alone goes true at the TOP of _previewFly(), before that arm even starts —
  // poll for `hasHooks` (startFly() has actually run, myFly/t0 established) instead of a fixed
  // sleep or a live `u` read (_flyState().u only updates AT pause time, not continuously).
  let flyingT0 = Date.now(), sawFlying = null;
  while (Date.now() - flyingT0 < 15000) {
    sawFlying = await page.evaluate(() => window.APP.cinemaPathEditor._flyState());
    if (sawFlying && sawFlying.flying && sawFlying.hasHooks) break;
    await sleep(100);
  }
  await sleep(500);   // let real progress accumulate past hasHooks before capturing pausedU
  const pausedAt = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const ok = cpe._flyPause();
    return { ok, state: cpe._flyState() };
  });
  await sleep(500);   // real wait WHILE paused — the flight fraction must not advance
  const stillPaused = await page.evaluate(() => window.APP.cinemaPathEditor._flyState());
  const resumedOk = await page.evaluate(() => window.APP.cinemaPathEditor._flyResume());
  await sleep(300);
  const resumedState = await page.evaluate(() => window.APP.cinemaPathEditor._flyState());
  P('G-SCRUB-PLAY pause freezes the flight fraction (u unchanged over a real wait)',
    pausedAt.ok && stillPaused && stillPaused.paused && Math.abs(stillPaused.u - pausedAt.state.u) < 1e-6,
    `pausedU=${pausedAt.state ? pausedAt.state.u.toFixed(4) : 'n/a'} afterWaitU=${stillPaused ? stillPaused.u.toFixed(4) : 'n/a'}`);
  P('G-SCRUB-PLAY resume continues the flight (still flying, no longer paused)',
    resumedOk && resumedState && resumedState.flying && !resumedState.paused,
    `resumeOk=${resumedOk} flying=${resumedState ? resumedState.flying : 'n/a'} paused=${resumedState ? resumedState.paused : 'n/a'}`);

  // ── G-SCRUB-PLAY-POVONLY: the main camera stayed byte-identical across the whole button-driven ──
  // flight above (start, mid-flight pause, resume) — proves _previewFly(true) never touches it,
  // same invariant class as G-SCRUB-NOCAM/G-SCRUB-VF-LIVE but for the play button, not the drag.
  const mainMid = await page.evaluate(() => {
    const A = window.APP;
    return { pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
             tgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z } };
  });
  const dPovPos = Math.hypot(mainMid.pos.x - mainBefore.pos.x, mainMid.pos.y - mainBefore.pos.y, mainMid.pos.z - mainBefore.pos.z);
  const dPovTgt = Math.hypot(mainMid.tgt.x - mainBefore.tgt.x, mainMid.tgt.y - mainBefore.tgt.y, mainMid.tgt.z - mainBefore.tgt.z);
  P('G-SCRUB-PLAY-POVONLY main camera untouched by the scrub-play button (start/pause/resume)',
    dPovPos < 1e-9 && dPovTgt < 1e-9,
    `mainPosDelta=${dPovPos.toExponential(2)}m mainTargetDelta=${dPovTgt.toExponential(2)}m`);

  // ── G-SCRUB-BEARING-FLY-PAUSE: §CPE_SCRUB_BEARING_FLY_PAUSE (2026-08-05) — the flight from
  // G-SCRUB-PLAY-POVONLY above is STILL ACTIVELY PLAYING at this point (resumed, not re-paused).
  // Clicking a stick while flying used to be silently overwritten within one rAF frame: _hold's
  // _scrubTo(bearTn) moved vfCam once, but _previewFly's own step() applies plan.poseAt(elapsed-
  // time-fraction) to vfCam EVERY frame regardless of _state.scrubTn, so the click-driven pose
  // never survived to the next paint — reproduces the user's "clicking a stick does not move B's
  // inset" report exactly, and explains why the earlier G-SCRUB-BEARING gate (flight NOT running)
  // passed while the same code failed live. Fix: selecting a stick now pauses an in-progress flight
  // (same _flyPauseAt hook the transport's own pause button uses), so the bearing sticks.
  const flyBearing = stickCount ? await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const beforeFly = cpe._flyState();
    const target = cpe._probeScrub().sticks[0];
    cpe._holdForTest(target.i, 'lo');   // different zone than G-SCRUB-BEARING's 'mid' -> !same, re-fires
    const afterHold = cpe._flyState();
    return { beforeFly, afterHold, targetTn: target.tNorm, p: cpe._probePoseAt(target.tNorm) };
  }) : null;
  await sleep(400);   // real wait — if the click didn't actually pause it, step() would move vfCam again
  const flyBearingAfterWait = flyBearing ? await page.evaluate(() => window.APP.cinemaPathEditor._probeVF().camPose) : null;
  let flyBearOk = false, flyBearDetail = 'no sticks on this building — inconclusive';
  if (flyBearing) {
    const dVfBear = (flyBearingAfterWait && flyBearing.p)
      ? Math.hypot(flyBearingAfterWait.x - flyBearing.p.x, flyBearingAfterWait.y - flyBearing.p.y, flyBearingAfterWait.z - flyBearing.p.z) : null;
    flyBearOk = flyBearing.beforeFly.flying && !flyBearing.beforeFly.paused &&
      flyBearing.afterHold.flying && flyBearing.afterHold.paused &&
      dVfBear != null && dVfBear < 1e-6;
    flyBearDetail = `wasFlying=${flyBearing.beforeFly.flying} wasPaused=${flyBearing.beforeFly.paused} ` +
      `pausedByClick=${flyBearing.afterHold.paused} vfCamDeltaAfter400msWait=${dVfBear == null ? 'n/a' : dVfBear.toExponential(2) + 'm'} (must stay ~0 — step() must not overwrite it)`;
  }
  P('G-SCRUB-BEARING-FLY-PAUSE clicking a stick DURING an active flight pauses it and the bearing survives (not overwritten next frame)',
    flyBearOk, flyBearDetail);
  // Clean up: the click above paused the flight (that's the fix under test) — resume it so the
  // G-VF-2b/G-PERF-1a gates below, which wait for this SAME flight to reach its natural
  // §CPE_PREVIEW done completion, still see it finish rather than time out.
  await page.evaluate(() => { const cpe = window.APP.cinemaPathEditor; if (cpe._flyState().paused) cpe._flyResume(); });

  // Poll for a non-empty readout the same way the original gate did (post-resume).
  let vf2 = null;
  const vfT0 = Date.now();
  while (Date.now() - vfT0 < 20000) {
    vf2 = await page.evaluate(() => {
      const cpe = window.APP.cinemaPathEditor;
      let tmMs = null;
      try { tmMs = window.tmGetState().cursor; } catch (e) {}
      return { readout: cpe._probeVF().tmCursorReadout, tmMs: tmMs };
    });
    if (vf2.readout) break;
    await sleep(150);
  }
  const doneT0 = Date.now();
  while (Date.now() - doneT0 < 30000 && !logs.slice(vf2mark).some(l => l.startsWith('§CPE_PREVIEW done'))) {
    await sleep(300);
  }
  await sleep(300);
  const readoutDay = vf2.readout ? vf2.readout : null;
  const tmDay = vf2.tmMs != null ? new Date(vf2.tmMs).toISOString().slice(0, 10) : null;
  P('G-VF-2b live: B\'s readout equals Time Machine\'s own cursor at the same instant (no drift)',
    vf2.tmMs == null ? true : readoutDay === tmDay,
    `readout="${readoutDay}" tmGetState().cursor day="${tmDay}" tmMs=${vf2.tmMs}`);

  // ── G-PERF-1a: measured ms/frame ─────────────────────────────────────────────────────────────
  const perfLine = logs.slice(vf2mark).filter(l => l.startsWith('§CPE_VF_PERF')).pop();
  let perfOk = false, perfDetail = 'no §CPE_VF_PERF line seen';
  if (perfLine) {
    const m = /frames=(\d+) avgMs=([\d.]+) maxMs=([\d.]+)/.exec(perfLine);
    if (m) {
      const frames = +m[1], avgMs = +m[2], maxMs = +m[3];
      perfOk = frames > 0 && avgMs >= 0 && maxMs >= avgMs;
      perfDetail = `frames=${frames} avgMs=${avgMs.toFixed(3)} maxMs=${maxMs.toFixed(3)} — B's own scissor render pass, measured around a.renderer.render() in _vfRender`;
    }
  }
  P('G-PERF-1a B\'s render-pass cost is measured (not guessed) during a real rehearsal', perfOk, perfDetail);

  // ── G-PERF-1b: static — cinema_maxq.js (the bake loop) never references the hook ────────────────
  const maxqSrc = fs.readFileSync(repoDir + '/viewer/cinema_maxq.js', 'utf8');
  const bakeClean = !maxqSrc.includes('_cpeViewfinderRender');
  P('G-PERF-1b static: cinema_maxq.js (the MaxQ bake loop) has zero references to the viewfinder render hook',
    bakeClean, `occurrences=${(maxqSrc.match(/_cpeViewfinderRender/g) || []).length}`);

  // ── G-VF-DPR-GUARD: §CPE_VF_DPR_GUARD (2026-08-05) — the orbit-drag perf-DPR drop (§S260b, only
  // engages once APP.streamedCount>5000) must NOT fire while B is open, since it flips
  // renderer.getPixelRatio() mid-drag with B's own panel position unchanged — exactly the
  // frame-to-frame scale churn §CPE_VF_RENDER_TRACE caught live ("much nearer not fully inside").
  // Probe with a pr value (9.99) neither _fullDPR nor _orbitDPR can ever naturally equal, so the
  // assertion doesn't depend on this headless page's real devicePixelRatio.
  const dprGuard = await page.evaluate(() => {
    const savedCount = window.APP.streamedCount;
    window.APP.streamedCount = 6000;
    window.APP.renderer.setPixelRatio(9.99);
    window.APP.controls.dispatchEvent({ type: 'start' });
    const duringVfOn = window.APP.renderer.getPixelRatio();
    window.APP.controls.dispatchEvent({ type: 'end' });
    window.APP.cinemaPathEditor._vfToggle();   // B off
    window.APP.renderer.setPixelRatio(9.99);
    window.APP.controls.dispatchEvent({ type: 'start' });
    const duringVfOff = window.APP.renderer.getPixelRatio();
    window.APP.controls.dispatchEvent({ type: 'end' });
    window.APP.cinemaPathEditor._vfToggle();   // B back on — restore state for any later gate
    window.APP.streamedCount = savedCount;
    return { duringVfOn, duringVfOff };
  });
  P('G-VF-DPR-GUARD B open skips the orbit-drag DPR drop (pr unchanged); B closed still applies it',
    dprGuard.duringVfOn === 9.99 && dprGuard.duringVfOff !== 9.99,
    `duringVfOn(pr)=${dprGuard.duringVfOn} (expect unchanged=9.99) duringVfOff(pr)=${dprGuard.duringVfOff} (expect changed, proves the guard — not devicePixelRatio coincidence — is what held it at 9.99 above)`);

  // ── G-VF-ASPECT: §CPE_VF_ASPECT_ROUND (2026-08-05) — vfCam.aspect must come from the TRUE CSS
  // panelR.width/height, not from two independently-rounded backing-buffer pixel counts (w/h),
  // whose ratio drifts off the real box aspect at fractional pixel ratios.
  const aspectCheck = await page.evaluate(() => {
    const panel = document.getElementById('cpe-vf-panel');
    const r = panel.getBoundingClientRect();
    window.APP.renderer.setPixelRatio(1.37);   // deliberately fractional, to expose rounding drift
    window.APP.markDirty();
    return new Promise(resolve => {
      setTimeout(() => {
        const trueAspect = r.width / r.height;
        const vfAspect = window.APP.cinemaPathEditor._probeVF().vfCamAspect;
        resolve({ trueAspect, vfAspect });
      }, 200);
    });
  });
  const aspectDiff = aspectCheck.vfAspect != null ? Math.abs(aspectCheck.vfAspect - aspectCheck.trueAspect) : null;
  P('G-VF-ASPECT vfCam.aspect matches the box\'s true (unrounded) CSS aspect, even at a fractional pixel ratio',
    aspectDiff != null && aspectDiff < 1e-6,
    `trueAspect=${aspectCheck.trueAspect} vfCamAspect=${aspectCheck.vfAspect} diff=${aspectDiff}`);

  // ── G-SCRUB-CLOSE-TEARDOWN: closing the editor (Cancel) removes the scrub panel ─────────────────
  await page.evaluate(() => document.getElementById('cpe-cancel').click());
  await sleep(300);
  const closed = await page.evaluate(() => ({
    scrubGone: !document.getElementById('cpe-scrub-panel'),
    vfGone: !document.getElementById('cpe-vf-panel')
  }));
  P('G-SCRUB-CLOSE-TEARDOWN closing the editor removes the scrub panel too', closed.scrubGone,
    `scrubPanelGone=${closed.scrubGone} vfPanelGone=${closed.vfGone}`);

  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];
  const repoDir = __dirname;
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD, repoDir);
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
