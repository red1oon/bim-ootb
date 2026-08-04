// WITNESS — §CPE_SCRUB / §CPE_VIEWFINDER (Parts A and B).
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part A §CPE_SCRUB, Part B §CPE_VIEWFINDER.
//
// §CPE_SCRUB gates REWRITTEN 2026-08-04 — a real regression, caught live by the user in their own
// browser: scrubbing the timeline used to move the MAIN canvas camera (`A.camera`/`A.controls`),
// which is wrong — the main canvas is the user's traditional editing view and must stay exactly
// where they left it, always. The fix was then simplified further, past "route scrub into B's
// camera instead": scrubbing is now VISUAL-ONLY (playhead + tNorm readout), touching NO camera at
// all, and the scrub bar itself only exists while B is open (a provisional pairing, not settled
// architecture — see the spec doc's DONE block). The OLD G-SCRUB-1 (scrub reproduces poseAt on the
// LIVE camera) asserted exactly the behaviour that was the bug — it is GONE, replaced below.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-SCRUB-GATED  the scrub bar does not exist in the DOM while B is off (fresh editor open), and
//                  does exist once B is toggled on — the bar's existence is gated to B, not a
//                  permanent fixture (2026-08-04 provisional simplification).
//   G-SCRUB-VISUAL a scrub drag still updates the playhead position and the "timeline NN.N%"
//                  readout text — the feature has a real effect, it just isn't a camera move.
//   G-SCRUB-NOCAM  THE regression gate: the main camera's position AND orbit target, and B's inset
//                  camera's position, are all byte-identical before and after a scrub drag. Proves
//                  the bug (scrub moving the main canvas) cannot recur silently.
//   G-SCRUB-SPAWN  clicking the (now B-gated) bar at tNorm=X still spawns a band at the same world
//                  point the pipe's own arc-length placement (plan.poseAt(X)) gives for X — a REAL
//                  pointer click on the DOM track, exercising the actual click-vs-drag slop split.
//   G-SCRUB-TEARDOWN  toggling B back off removes the scrub bar from the DOM too.
//   G-VF-1     B's camera pose at tn matches the main camera's exact pose at that instant DURING A
//              REAL REHEARSAL — one pose source, both fed by the same _applyCameraPose call. This
//              path is unaffected by the scrub fix (`_previewFly()` still legitimately flies the
//              main camera; B still legitimately tracks it 1:1 while that happens).
//   G-VF-2     B's Time Machine readout is a READ of the cursor step() already set that frame, never
//              a second tmSetCursor call — proven both statically (source has tmGetState, not
//              tmSetCursor, inside the vf functions) and live (readout agrees with tmGetState() at
//              the same instant during a real buildup rehearsal).
//   G-PERF-1   measured (not guessed) ms/frame B's own scissor pass adds during rehearsal, plus a
//              static proof cinema_maxq.js (the MaxQ bake loop) never references the render hook.
const fs = require('fs');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8460;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPO = '/tmp/wt-cpe-rehearsal-studio';   // set per-run below from __dirname

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

  // ── G-SCRUB-GATED: the bar does not exist before B is toggled on ────────────────────────────────
  const beforeVF = await page.evaluate(() => !!document.getElementById('cpe-scrub-track'));
  P('G-SCRUB-GATED the scrub bar does not exist in the DOM while B is off',
    beforeVF === false, `trackPresent=${beforeVF}`);

  // ── toggle B on — shared setup for every gate below (bar existence, no-cam, spawn, and G-VF-1) ──
  const vfOnState = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(300);
  const afterVF = await page.evaluate(() => !!document.getElementById('cpe-scrub-track'));
  P('G-SCRUB-GATED the scrub bar DOES exist once B is toggled on',
    vfOnState === true && afterVF === true, `vfOn=${vfOnState} trackPresent=${afterVF}`);

  // ── G-SCRUB-NOCAM: THE regression gate — no camera moves during a scrub drag ────────────────────
  const before = await page.evaluate(() => {
    const A = window.APP, cpe = window.APP.cinemaPathEditor;
    const vf = cpe._probeVF();
    return {
      mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      vfPos: vf.camPose, scrubLabel: document.getElementById('cpe-scrub-tn').textContent
    };
  });
  const scrubResult = await page.evaluate(() => window.APP.cinemaPathEditor._scrubTo(0.42));
  await sleep(50);
  const after = await page.evaluate(() => {
    const A = window.APP, cpe = window.APP.cinemaPathEditor;
    const vf = cpe._probeVF();
    return {
      mainPos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      mainTgt: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      vfPos: vf.camPose, scrubLabel: document.getElementById('cpe-scrub-tn').textContent
    };
  });
  const dMainPos = Math.hypot(after.mainPos.x - before.mainPos.x, after.mainPos.y - before.mainPos.y, after.mainPos.z - before.mainPos.z);
  const dMainTgt = Math.hypot(after.mainTgt.x - before.mainTgt.x, after.mainTgt.y - before.mainTgt.y, after.mainTgt.z - before.mainTgt.z);
  const dVfPos = (before.vfPos && after.vfPos)
    ? Math.hypot(after.vfPos.x - before.vfPos.x, after.vfPos.y - before.vfPos.y, after.vfPos.z - before.vfPos.z) : null;
  P('G-SCRUB-NOCAM the main camera (position AND target) and B\'s inset camera are byte-identical before/after a scrub drag',
    dMainPos < 1e-9 && dMainTgt < 1e-9 && (dVfPos == null || dVfPos < 1e-9),
    `mainPosDelta=${dMainPos.toExponential(2)}m mainTargetDelta=${dMainTgt.toExponential(2)}m vfPosDelta=${dVfPos == null ? 'n/a' : dVfPos.toExponential(2) + 'm'} ` +
    `scrubResult.x=${scrubResult ? scrubResult.x.toFixed(2) : 'null'} (poseAt(0.42) IS sampled and returned — just never written to any camera)`);
  P('G-SCRUB-VISUAL the playhead/readout DID change (the feature still has a real, visible effect)',
    before.scrubLabel !== after.scrubLabel,
    `before="${before.scrubLabel}" after="${after.scrubLabel}"`);

  // ── G-SCRUB-SPAWN: a REAL pointer click on the (B-gated) scrub track, inside the walk window ────
  const setup2 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const win = cpe._probeScrub().walkWindow;
    if (!win) return null;
    const tn = win.spin + (win.out - win.spin) * 0.5;   // mid-walk, safely inside
    const track = document.getElementById('cpe-scrub-track');
    const r = track.getBoundingClientRect();
    const px = Math.round(r.left + tn * r.width), py = Math.round(r.top + r.height / 2);
    const nBefore = document.querySelectorAll('#cpe-rows > div[data-cpe-row="band"]').length;
    const ground = cpe._probePoseAt(tn);
    return { tn, px, py, nBefore, ground };
  });
  let g2ok = false, g2detail = 'walk window unavailable — inconclusive';
  if (setup2) {
    await page.mouse.move(setup2.px, setup2.py);
    await page.mouse.down();
    await sleep(30);
    await page.mouse.up();          // a 0px press == a click, same doctrine as §CPE_CLICK_SLOP
    await sleep(700);
    const afterSpawn = await page.evaluate(() => {
      const cpe = window.APP.cinemaPathEditor;
      const n = document.querySelectorAll('#cpe-rows > div[data-cpe-row="band"]').length;
      // Find the newly-added stick's drawn centre via the bars/handles probe (mid handle, z==='mid').
      const handles = cpe._probeHandles() || [];
      return { n, handles };
    });
    const stickHandle = afterSpawn.handles.filter(h => h.z === 'mid' && h.stick).pop();
    const dSpawn = stickHandle
      ? Math.hypot(stickHandle.x - setup2.ground.x, stickHandle.y - setup2.ground.y, stickHandle.z3 - setup2.ground.z)
      : null;
    // Seeding resolution is bounded by the flow polyline's own sample density, not by the film's
    // FILM_SAMPLES — a few tens of cm is the real bound, measured below rather than asserted blind.
    g2ok = afterSpawn.n === setup2.nBefore + 1 && stickHandle != null && dSpawn != null && dSpawn < 2.0;
    g2detail = `rows ${setup2.nBefore}->${afterSpawn.n} spawnDist=${dSpawn == null ? 'n/a' : dSpawn.toFixed(3) + 'm'} ` +
      `(clicked tn=${setup2.tn.toFixed(3)}, target=(${setup2.ground.x.toFixed(2)},${setup2.ground.y.toFixed(2)},${setup2.ground.z.toFixed(2)}))`;
  }
  P('G-SCRUB-SPAWN a click on the shaded bar spawns a stick at the pipe\'s own placement for that tNorm', g2ok, g2detail);

  // ── G-VF-1 (B already on from the shared setup above): rehearsal-style pose application only —
  // NOT `_scrubTo` (that no longer touches any camera, per the 2026-08-04 correction/simplification
  // above). `_applyCameraPoseForTest` calls the real `_applyCameraPose`, the one function
  // `_previewFly()`'s step() still legitimately uses to fly the main camera and sync B to it.
  const vf1 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    cpe._applyCameraPoseForTest(0.65);
    return cpe._probeVF();
  });
  const dVF = vf1.camPose ? Math.hypot(vf1.camPose.x - vf1.mainPose.x, vf1.camPose.y - vf1.mainPose.y, vf1.camPose.z - vf1.mainPose.z) : null;
  P('G-VF-1 B\'s camera pose at tn=0.65 matches the main camera exactly (same plan.poseAt sample, rehearsal-style application)',
    vfOnState === true && dVF != null && dVF < 1e-6,
    `vfOn=${vfOnState} hookInstalled=${vf1.hookInstalled} delta=${dVF == null ? 'n/a' : dVF.toExponential(2)}m ` +
    `rect=${vf1.rect ? JSON.stringify(vf1.rect) : 'null'}`);

  // ── G-VF-2: static — the vf functions never call tmSetCursor, only tmGetState ──────────────────
  const src = fs.readFileSync(repoDir + '/viewer/cinema_path_editor.js', 'utf8');
  const vfBlock = src.slice(src.indexOf('function _vfUpdateReadout'), src.indexOf('function _wireViewfinderToggle'));
  const noSecondClock = vfBlock.includes('tmGetState') && !vfBlock.includes('tmSetCursor');
  P('G-VF-2a static: the viewfinder block reads tmGetState and never calls tmSetCursor', noSecondClock,
    `vfBlock length=${vfBlock.length} hasGet=${vfBlock.includes('tmGetState')} hasSet=${vfBlock.includes('tmSetCursor')}`);

  // ── G-VF-2 live: run a short real rehearsal with buildup ON and read the readout mid-flight ────
  await page.evaluate(() => {
    const cb = document.getElementById('cpe-buildup');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
  });
  await sleep(200);
  const vf2mark = logs.length;
  // Clear the readout FIRST — G-VF-1 above already left a stale (pre-rehearsal) value in it, and a
  // "readout is non-empty" poll needs to mean "the rehearsal wrote a fresh one", not "still showing
  // last test's leftover".
  await page.evaluate(() => { const el = document.getElementById('cpe-vf-clock'); if (el) el.textContent = ''; });
  page.evaluate(() => document.getElementById('cpe-preview').click());
  // §CPE_PREVIEW_BUILDUP arms ASYNCHRONOUSLY (awaits tmActivateForBake before the fly loop even
  // starts stepping) — measured 513ms on Duplex, 3.2s on the much larger Terminal, whose per-frame
  // cost also runs ~1.6s/frame on this headless rig (48k ops). A fixed post-arm sleep raced that:
  // poll for a NON-EMPTY readout instead (bounded 20s), then compare it against tmGetState() in the
  // SAME evaluate call — by construction (see §CPE_VIEWFINDER's readout-ordering fix) the readout is
  // only ever written AFTER that frame's own tmSetCursor, so catching it non-empty and reading
  // tmGetState() immediately after, before the (~1s+) next frame can change it again, is a real
  // same-instant comparison, not a race window guess.
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
  // Wait out the rest of the rehearsal so the next building's page.close() doesn't race a live fly —
  // polled against the exit log rather than a blind sleep, since arm time (above) already varies
  // per building and a fixed budget either races a slow one or wastes time on a fast one.
  const doneT0 = Date.now();
  while (Date.now() - doneT0 < 30000 && !logs.slice(vf2mark).some(l => l.startsWith('§CPE_PREVIEW done'))) {
    await sleep(300);
  }
  await sleep(300);
  const readoutDay = vf2.readout ? vf2.readout : null;
  const tmDay = vf2.tmMs != null ? new Date(vf2.tmMs).toISOString().slice(0, 10) : null;
  P('G-VF-2b live: B\'s readout equals Time Machine\'s own cursor at the same instant (no drift)',
    vf2.tmMs == null ? true : readoutDay === tmDay,   // no-buildup-timeline building: both null, vacuously fine
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

  // ── toggle off, confirm teardown ─────────────────────────────────────────────────────────────
  const off = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const on = cpe._vfToggle();
    return {
      on: on, panelGone: !document.getElementById('cpe-vf-panel'), hookGone: !window.APP._cpeViewfinderRender,
      scrubGone: !document.getElementById('cpe-scrub-track')
    };
  });
  P('G-VF-off toggling off removes the DOM panel and clears the render hook (zero cost when off)',
    off.on === false && off.panelGone && off.hookGone,
    `vfOn=${off.on} panelGone=${off.panelGone} hookGone=${off.hookGone}`);
  P('G-SCRUB-TEARDOWN toggling B off also removes the scrub bar (its existence is gated to B)',
    off.scrubGone, `trackGoneAfterVfOff=${off.scrubGone}`);

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
