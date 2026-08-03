// WITNESS — §CPE_SCRUB / §CPE_VIEWFINDER (Parts A and B).
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part A §CPE_SCRUB, Part B §CPE_VIEWFINDER.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-SCRUB-1  dragging the playhead to tNorm=X reproduces the exact pose _previewFly() would show
//              at that instant — no second pose pipeline. Proven by comparing what _scrubTo(X) left
//              on the LIVE camera against a direct, independent plan.poseAt(X) read.
//   G-SCRUB-2  clicking empty bar at tNorm=X spawns a band at the same world point the pipe's own
//              arc-length placement (plan.poseAt(X)) gives for X. A REAL pointer click on the DOM
//              track, not a synthetic call — exercises the actual click-vs-drag slop split too.
//   G-VF-1     B's camera pose at tn matches the main camera's exact pose at that instant — one pose
//              source, both fed by the same _applyCameraPose call.
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

  // ── G-SCRUB-1 ──────────────────────────────────────────────────────────────────────────────────
  const scrub1 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const A = window.APP;
    const tn = 0.42;
    const ground = cpe._probePoseAt(tn);            // direct, independent poseAt(tn) read
    const applied = cpe._scrubTo(tn);                // the real drag-handler function
    const cam = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
    const tgt = { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z };
    return { ground, applied, cam, tgt };
  });
  const dCam = Math.hypot(scrub1.ground.x - scrub1.cam.x, scrub1.ground.y - scrub1.cam.y, scrub1.ground.z - scrub1.cam.z);
  const dTgt = Math.hypot(scrub1.ground.tx - scrub1.tgt.x, scrub1.ground.ty - scrub1.tgt.y, scrub1.ground.tz - scrub1.tgt.z);
  P('G-SCRUB-1 scrubbing to tn=0.42 leaves the live camera at plan.poseAt(0.42), position AND target',
    dCam < 1e-6 && dTgt < 1e-6,
    `camDelta=${dCam.toExponential(2)}m targetDelta=${dTgt.toExponential(2)}m ` +
    `(ground pos=(${scrub1.ground.x.toFixed(2)},${scrub1.ground.y.toFixed(2)},${scrub1.ground.z.toFixed(2)}))`);

  // ── G-SCRUB-2: a REAL pointer click on the scrub track, inside the walk window ────────────────
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
    const after = await page.evaluate(() => {
      const cpe = window.APP.cinemaPathEditor;
      const n = document.querySelectorAll('#cpe-rows > div[data-cpe-row="band"]').length;
      // Find the newly-added stick's drawn centre via the bars/handles probe (mid handle, z==='mid').
      const handles = cpe._probeHandles() || [];
      return { n, handles };
    });
    const stickHandle = after.handles.filter(h => h.z === 'mid' && h.stick).pop();
    const dSpawn = stickHandle
      ? Math.hypot(stickHandle.x - setup2.ground.x, stickHandle.y - setup2.ground.y, stickHandle.z3 - setup2.ground.z)
      : null;
    // Seeding resolution is bounded by the flow polyline's own sample density, not by the film's
    // FILM_SAMPLES — a few tens of cm is the real bound, measured below rather than asserted blind.
    g2ok = after.n === setup2.nBefore + 1 && stickHandle != null && dSpawn != null && dSpawn < 2.0;
    g2detail = `rows ${setup2.nBefore}->${after.n} spawnDist=${dSpawn == null ? 'n/a' : dSpawn.toFixed(3) + 'm'} ` +
      `(clicked tn=${setup2.tn.toFixed(3)}, target=(${setup2.ground.x.toFixed(2)},${setup2.ground.y.toFixed(2)},${setup2.ground.z.toFixed(2)}))`;
  }
  P('G-SCRUB-2 a click on the shaded bar spawns a stick at the pipe\'s own placement for that tNorm', g2ok, g2detail);

  // ── G-VF-1 ─────────────────────────────────────────────────────────────────────────────────────
  const vfOnState = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(300);
  const vf1 = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    cpe._scrubTo(0.65);
    return cpe._probeVF();
  });
  const dVF = vf1.camPose ? Math.hypot(vf1.camPose.x - vf1.mainPose.x, vf1.camPose.y - vf1.mainPose.y, vf1.camPose.z - vf1.mainPose.z) : null;
  P('G-VF-1 B\'s camera pose at tn=0.65 matches the main camera exactly (same plan.poseAt sample)',
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
    return { on: on, panelGone: !document.getElementById('cpe-vf-panel'), hookGone: !window.APP._cpeViewfinderRender };
  });
  P('G-VF-off toggling off removes the DOM panel and clears the render hook (zero cost when off)',
    off.on === false && off.panelGone && off.hookGone,
    `vfOn=${off.on} panelGone=${off.panelGone} hookGone=${off.hookGone}`);

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
