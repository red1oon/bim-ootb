// WITNESS — §CPE_WALK_EDIT_V1 (prompts/CPE_POV_WALK_PATHING.md).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-WALK-ISOLATE-1  before walk mode, a real pointerdown at a handle's own screen position IS
//                      claimed by the stick editor (_state.drag becomes non-null) — sanity precondition.
//   G-WALK-ISOLATE-2  once walk mode is mounted (_unwire), the SAME gesture at the SAME pixel is
//                      NOT claimed (_state.drag stays null) — the isolation the spec's §CPE_WALK_SEAM
//                      claims ("structurally CANNOT run ... off the DOM"), proven by dispatch, not read.
//   G-WALK-ISOLATE-3  after unmount (_wire), the same gesture IS claimed again — handlers restored.
//   G-WALK-SNAP-1     a synthetic snap at a KNOWN pos/facing, chosen far enough from the building that
//                      the forward raycast is guaranteed to miss every mesh, produces a band whose
//                      CENTRE is bit-identical to the walked pos and whose lookAt is bit-identical to
//                      the spec's own fallback formula (pos + facing*10m) — computed independently in
//                      this file, not read back from the module under test.
//   G-WALK-SNAP-2     the snap actually inserted a band (`_stick:true`, bands.length +1) and ran the
//                      real replan pipeline (replanMs present) — reuses §CPE_STICK/§CPE_AIM_PIN
//                      machinery, not a stub.
//   G-WALK-TMLOCK     mount dispatches a real pointerup at whichever TM button carries `.tm-active`
//                      and sets the TM panel's pointer-events to none; unmount dispatches the same
//                      pointerup again and restores the panel's prior pointer-events value exactly.
//   G-WALK-TEARDOWN   closing the CPE editor (finish()) while walk mode is still mounted force-stops
//                      it — CpeWalk.isActive() is false afterward, no dangling session.
//   G-WALK-LOG        every claim above also has its own §-tagged console line (FUNDAMENTAL LAW:
//                      numeric truth, not "it returned true").
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8512;
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
    () => window.APP && window.APP.cinemaPathEditor && window.CpeWalk && window.APP.startMaxQualityOrbit && window.APP._composer,
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

async function dispatchPointerDownUp(page, x, y) {
  return page.evaluate((x, y) => {
    const canvas = window.APP.canvas;
    const r = canvas.getBoundingClientRect();
    const down = new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    canvas.dispatchEvent(down);
    const dragAfterDown = window.APP.cinemaPathEditor._probeDrag();
    const up = new PointerEvent('pointerup', { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    window.dispatchEvent(up);
    return dragAfterDown;
  }, x, y);
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  // ── setup: a handle to grab, and the current path/bands to plan against ──
  const setup = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const handles = cpe._probeHandles();
    const h = handles && handles.find(h => h.px != null && h.py != null);
    const ov = cpe._probeOverride();
    const vf = cpe._probeVF();
    return h && ov && vf ? { hx: h.px, hy: h.py, hb: h.b, nBands: ov.bands.length, mainPose: vf.mainPose } : null;
  });
  if (!setup) {
    P('G-WALK-0 a grabbable handle + open path is available (precondition)', false, 'freshly-opened editor had no on-screen handle — inconclusive');
    await page.close();
    return checks;
  }

  // ══ G-WALK-ISOLATE-1: pre-walk, the gesture IS claimed ══
  const claimedBefore = await dispatchPointerDownUp(page, setup.hx, setup.hy);
  P('G-WALK-ISOLATE-1 pre-walk pointerdown at a handle is claimed by the stick editor (_state.drag set)',
    claimedBefore === true, `_probeDrag()=${claimedBefore}`);

  // ══ G-WALK-BTN-ABSENT (§CPE_WALK_SHOES_BTN): with the eye OFF there is no B frame, and the walk
  // button lives ON B's frame header now — so it must NOT exist yet (it used to sit in the CPE
  // panel's title row; this gate proves the move, not just the addition). ══
  const btnPre = await page.evaluate(() => !!document.getElementById('cpe-walk-toggle'));
  P('G-WALK-BTN-ABSENT eye off => no B frame => no walk button anywhere (button moved off the CPE title row)',
    btnPre === false, `#cpe-walk-toggle exists=${btnPre}`);

  // ══ mount walk mode ══
  const mark1 = logs.length;
  const mounted = await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(150);
  const win1 = logs.slice(mark1);
  const activeAfterMount = await page.evaluate(() => window.CpeWalk.isActive());
  P('G-WALK-MOUNT toggle() mounted (isActive true) and logged §CPE_WALK_MOUNT/_DONE',
    mounted === true && activeAfterMount === true &&
    win1.some(l => l.startsWith('§CPE_WALK_MOUNT ')) && win1.some(l => l.startsWith('§CPE_WALK_MOUNT_DONE')),
    `toggle()=${mounted} isActive=${activeAfterMount} logged=[${win1.filter(l => l.startsWith('§CPE_WALK')).join(' | ')}]`);

  // ══ G-WALK-FREEZE: the overlay exists, sized to the canvas, while mounted ══
  const freezeInfo = await page.evaluate(() => {
    const el = document.getElementById('cpe-walk-freeze');
    const canvas = window.APP.canvas;
    const cr = canvas.getBoundingClientRect();
    return el ? { id: el.id, w: el.width, h: el.height, canvasW: Math.round(cr.width), canvasH: Math.round(cr.height) } : null;
  });
  P('G-WALK-FREEZE overlay canvas exists while mounted, sized to the WebGL canvas (main view is covered)',
    !!freezeInfo && freezeInfo.w === freezeInfo.canvasW && freezeInfo.h === freezeInfo.canvasH,
    `freeze=${JSON.stringify(freezeInfo)} logged=[${win1.filter(l => l.startsWith('§CPE_WALK_FREEZE')).join(' | ')}]`);

  // ══ G-WALK-BTN-B (§CPE_WALK_SHOES_BTN): mounting auto-opened B, and the walk button (shoes icon)
  // must exist ON B's frame header — inside #cpe-vf-panel, carrying the footprints SVG. ══
  const btnB = await page.evaluate(() => {
    const btn = document.getElementById('cpe-walk-toggle');
    const panel = document.getElementById('cpe-vf-panel');
    return { exists: !!btn, inPanel: !!(btn && panel && panel.contains(btn)), hasSvg: !!(btn && btn.querySelector('svg path')) };
  });
  P('G-WALK-BTN-B walk button exists on B\'s frame header (inside #cpe-vf-panel, shoes SVG present)',
    btnB.exists && btnB.inPanel && btnB.hasSvg, JSON.stringify(btnB));

  // ══ G-WALK-ISOLATE-2: mounted, the SAME gesture is NOT claimed ══
  const claimedDuring = await dispatchPointerDownUp(page, setup.hx, setup.hy);
  P('G-WALK-ISOLATE-2 mounted: the SAME pointerdown/up is NOT claimed (_unwire actually removed the listeners)',
    claimedDuring === false || claimedDuring === null, `_probeDrag()=${claimedDuring}`);

  // ══ §CPE_WALK_SPAWN gates FIRST — they must read the PRISTINE plan (the sky-snap below re-snakes
  // the path and would shift every arc-fraction) ══
  const spawnLog = win1.find(l => l.startsWith('§CPE_WALK_SPAWN walk-start'));
  const spawnM = spawnLog && spawnLog.match(/pos=\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/);
  const poseNow = await page.evaluate(() => window.CpeWalk._poseForTest());
  P('G-WALK-SPAWN first mount logged a walk-start spawn whose pose IS the live vfCam pose (not the aerial seed)',
    !!spawnM && !!poseNow && Math.abs(poseNow.x - +spawnM[1]) < 0.01 &&
    Math.abs(poseNow.y - +spawnM[2]) < 0.01 && Math.abs(poseNow.z - +spawnM[3]) < 0.01,
    `log=${spawnLog || 'MISSING'} live=(${poseNow ? [poseNow.x.toFixed(2), poseNow.y.toFixed(2), poseNow.z.toFixed(2)] : 'null'})`);
  const spawnSnap = await page.evaluate(() => {
    const p = window.CpeWalk._poseForTest();
    const n0 = window.APP.cinemaPathEditor._probeOverride().bands.length;
    const r = window.CpeWalk._snapForTest({ x: p.x, y: p.y, z: p.z }, { x: 0, y: 0, z: -1 });
    return { p, n0, r, n1: window.APP.cinemaPathEditor._probeOverride().bands.length };
  });
  // s≈0 is CORRECT here — the spawn IS the walk head. The Hospital regression was s=0.000 with a
  // 260m-away AERIAL centre; the spawn move kills the aerial pose itself, and centre==pose (at the
  // logged eye-level walk start, proven above) is what distinguishes the two.
  P('G-WALK-SPAWN-SNAP a snap at the spawn pose lands ON the walk head (s in [0,0.6], centre==spawn pose, +1 band)',
    !!spawnSnap.r && spawnSnap.r.s >= 0 && spawnSnap.r.s < 0.6 && spawnSnap.n1 === spawnSnap.n0 + 1 &&
    spawnSnap.r.centre.x === spawnSnap.p.x && spawnSnap.r.centre.y === spawnSnap.p.y && spawnSnap.r.centre.z === spawnSnap.p.z,
    `s=${spawnSnap.r ? spawnSnap.r.s.toFixed(4) : 'null'} bands ${spawnSnap.n0}->${spawnSnap.n1}`);

  // ══ G-WALK-SNAP-1/2: synthetic snap far from the building — guaranteed raycast miss ══
  const snapPos = { x: setup.mainPose.x + 500, y: setup.mainPose.y + 500, z: setup.mainPose.z };
  const snapFwd = { x: 1, y: 0, z: 0 };
  const nBeforeSky = await page.evaluate(() => window.APP.cinemaPathEditor._probeOverride().bands.length);
  const mark2 = logs.length;
  const snapRes = await page.evaluate((pos, fwd) => window.CpeWalk._snapForTest(pos, fwd), snapPos, snapFwd);
  await sleep(50);
  const win2 = logs.slice(mark2);
  const ovAfterSnap = await page.evaluate(() => window.APP.cinemaPathEditor._probeOverride());

  const wantLookAt = { x: snapPos.x + snapFwd.x * 10, y: snapPos.y + snapFwd.y * 10, z: snapPos.z + snapFwd.z * 10 };
  const centreOk = !!snapRes && snapRes.centre.x === snapPos.x && snapRes.centre.y === snapPos.y && snapRes.centre.z === snapPos.z;
  const lookAtOk = !!snapRes && snapRes.lookAt &&
    Math.abs(snapRes.lookAt.x - wantLookAt.x) < 1e-9 && Math.abs(snapRes.lookAt.y - wantLookAt.y) < 1e-9 && Math.abs(snapRes.lookAt.z - wantLookAt.z) < 1e-9;
  P('G-WALK-SNAP-1a band centre is bit-identical to the walked position (not a curve sample)',
    centreOk, `centre=${snapRes ? JSON.stringify(snapRes.centre) : 'null'} want=${JSON.stringify(snapPos)}`);
  P('G-WALK-SNAP-1b lookAt matches the spec\'s own fallback formula pos+facing*10m (raycast guaranteed to miss, 500m out)',
    lookAtOk, `lookAt=${snapRes ? JSON.stringify(snapRes.lookAt) : 'null'} want=${JSON.stringify(wantLookAt)}`);
  const sOk = !!snapRes && typeof snapRes.s === 'number' && snapRes.s >= 0 && snapRes.s <= 1;
  P('G-WALK-SNAP-1c insertion fraction s is a valid [0,1] arc-fraction', sOk, `s=${snapRes ? snapRes.s : 'null'}`);
  const bandOk = !!ovAfterSnap && ovAfterSnap.bands.length === nBeforeSky + 1 &&
    ovAfterSnap.bands[snapRes.bandIndex] && ovAfterSnap.bands[snapRes.bandIndex]._stick === true;
  P('G-WALK-SNAP-2a a real band was inserted (_stick:true, bands.length +1) — reuses §CPE_STICK, not a stub',
    bandOk, `nBandsBefore=${nBeforeSky} nBandsAfter=${ovAfterSnap ? ovAfterSnap.bands.length : 'null'} bandIndex=${snapRes ? snapRes.bandIndex : 'null'} _stick=${ovAfterSnap && snapRes ? ovAfterSnap.bands[snapRes.bandIndex]._stick : 'null'}`);
  P('G-WALK-SNAP-2b the real replan pipeline ran (replanMs present, §CPE_WALK_SNAP logged)',
    !!snapRes && typeof snapRes.replanMs === 'number' && win2.some(l => l.startsWith('§CPE_WALK_SNAP pos=')),
    `replanMs=${snapRes ? snapRes.replanMs : 'null'} logged=${win2.filter(l => l.startsWith('§CPE_WALK_SNAP')).join(' | ')}`);

  // ══ §CPE_WALK_GLIDE — wheel/pinch is locomotion: 3 notches out = 3×1.2m along the facing,
  // 3 notches back returns to the exact start (reversibility proves the along-facing line). ══
  const glide = await page.evaluate(() => {
    const p0 = window.CpeWalk._poseForTest();
    for (let i = 0; i < 3; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    const p1 = window.CpeWalk._poseForTest();
    for (let i = 0; i < 3; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    const p2 = window.CpeWalk._poseForTest();
    return { p0, p1, p2 };
  });
  const glideOut = Math.hypot(glide.p1.x - glide.p0.x, glide.p1.y - glide.p0.y, glide.p1.z - glide.p0.z);
  const glideBack = Math.hypot(glide.p2.x - glide.p0.x, glide.p2.y - glide.p0.y, glide.p2.z - glide.p0.z);
  P('G-WALK-GLIDE 3 wheel notches glide 3.60m along the facing; 3 reverse notches return bit-exactly',
    Math.abs(glideOut - 3.6) < 0.01 && glideBack < 1e-9,
    `out=${glideOut.toFixed(3)}m back=${glideBack.toExponential(2)}`);

  // ══ §CPE_WALK_SPAWN resume — shoes off/on continues at the identical pose (Esc keeps it;
  // only eye-off/editor-close forceStop clears it — proven by the later EYE-OFF gate's fresh spawn). ══
  const resume = await page.evaluate(() => {
    const before = window.CpeWalk._poseForTest();
    window.CpeWalk.toggle();
    const stopped = !window.CpeWalk.isActive();
    window.CpeWalk.toggle();
    const after = window.CpeWalk._poseForTest();
    return { before, stopped, after, active: window.CpeWalk.isActive() };
  });
  const resumeOk = resume.stopped && resume.active &&
    resume.before.x === resume.after.x && resume.before.y === resume.after.y && resume.before.z === resume.after.z &&
    resume.before.yaw === resume.after.yaw && resume.before.pitch === resume.after.pitch;
  P('G-WALK-RESUME shoes off/on resumes at the bit-identical pose+facing (no respawn mid-session)',
    resumeOk, JSON.stringify(resume));

  // ══ G-WALK-EYE-OFF-STOP (§CPE_WALK_SHOES_BTN / §CPE_SOLE_OWNER): closing B (the eye, walk's
  // owner surface) while a walk is active must force-stop the walk — freeze dropped, no orphaned
  // session. This doubles as the reset to the unmounted baseline the gates below assume. ══
  // Precondition: the RESUME gate's same-tick stop/start can be trailed by a deferred
  // pointerlockchange that auto-stops the walk (a race only a synthetic same-tick toggle hits —
  // real shoes clicks are separated by human time). Let it land, then ensure a mounted walk.
  await sleep(200);
  await page.evaluate(() => { if (!window.CpeWalk.isActive()) window.CpeWalk.toggle(); });
  await sleep(100);
  const eyeOff = await page.evaluate(() => {
    const activeBefore = window.CpeWalk.isActive();
    window.APP.cinemaPathEditor._vfToggle();   // eye OFF (same call cpe_walk's own start() uses for ON)
    return { activeBefore, activeAfter: window.CpeWalk.isActive(),
             freezeGone: !document.getElementById('cpe-walk-freeze'),
             btnGone: !document.getElementById('cpe-walk-toggle') };
  });
  await sleep(100);
  P('G-WALK-EYE-OFF-STOP closing B (eye off) force-stops an active walk (session, freeze and button all gone)',
    eyeOff.activeBefore === true && eyeOff.activeAfter === false && eyeOff.freezeGone && eyeOff.btnGone,
    JSON.stringify(eyeOff));

  // ══ G-WALK-TMLOCK — stub panel/button so this gate proves OUR dispatch+lock code, independent
  // of whether real Time Machine happens to be activated in this session (out of scope: we do not
  // edit time_machine.js, so its own playback state machine is not what this gate is about). ══
  await page.evaluate(() => {
    let panel = document.getElementById('time-machine-panel');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'time-machine-panel';
    panel.style.pointerEvents = 'auto';
    const fwd = document.createElement('button');
    fwd.id = 'tm-fwd-btn';
    fwd.classList.add('tm-active');
    let ups = 0;
    fwd.addEventListener('pointerup', () => { ups++; });
    panel.appendChild(fwd);
    document.body.appendChild(panel);
    window.__tmUps = () => ups;
    return true;
  });
  await page.evaluate(() => window.CpeWalk.toggle());   // fresh mount, observes the stub panel
  await sleep(150);
  const tmLockState = await page.evaluate(() => ({
    lockState: window.CpeWalk._tmLockState(),
    pointerEvents: document.getElementById('time-machine-panel').style.pointerEvents,
    ups: window.__tmUps()
  }));
  P('G-WALK-TMLOCK-1 mount dispatched a real pointerup at the .tm-active button and locked the panel',
    tmLockState.lockState.locked === true && tmLockState.lockState.lockedBtn === 'tm-fwd-btn' &&
    tmLockState.pointerEvents === 'none' && tmLockState.ups === 1,
    `state=${JSON.stringify(tmLockState.lockState)} pointerEvents=${tmLockState.pointerEvents} ups=${tmLockState.ups}`);

  const beforeUnmountUps = tmLockState.ups;
  await page.evaluate(() => window.CpeWalk.toggle());   // unmount
  await sleep(150);
  const tmAfterUnmount = await page.evaluate(() => ({
    pointerEvents: document.getElementById('time-machine-panel').style.pointerEvents,
    ups: window.__tmUps()
  }));
  P('G-WALK-TMLOCK-2 unmount dispatched the resume pointerup again and restored pointer-events to its prior value',
    tmAfterUnmount.ups === beforeUnmountUps + 1 && tmAfterUnmount.pointerEvents === 'auto',
    `ups ${beforeUnmountUps}->${tmAfterUnmount.ups} pointerEvents=${tmAfterUnmount.pointerEvents}`);

  // ══ G-WALK-ISOLATE-3: after unmount, the ORIGINAL stick-editor gesture works again ══
  const claimedAfter = await dispatchPointerDownUp(page, setup.hx, setup.hy);
  P('G-WALK-ISOLATE-3 post-unmount: the pointerdown/up gesture is claimed again (_wire restored the listeners)',
    claimedAfter === true, `_probeDrag()=${claimedAfter}`);
  const freezeGoneAfterUnmount = await page.evaluate(() => document.getElementById('cpe-walk-freeze'));
  P('G-WALK-FREEZE-DROP the overlay is removed from the DOM after unmount',
    freezeGoneAfterUnmount === null, `element=${freezeGoneAfterUnmount}`);

  // ══ §CPE_WALK_ENTER_LOCK — Enter plants the stick AND exits to review in ONE stroke (user ask);
  // click remains snap-and-keep-walking. ══
  await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(100);
  const enterRes = await page.evaluate(() => {
    const nBefore = window.APP.cinemaPathEditor._probeOverride().bands.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { nBefore, nAfter: window.APP.cinemaPathEditor._probeOverride().bands.length,
             active: window.CpeWalk.isActive() };
  });
  await sleep(100);
  P('G-WALK-ENTER-LOCK Enter plants a stick (+1 band) AND exits the walk in one stroke',
    enterRes.nAfter === enterRes.nBefore + 1 && enterRes.active === false, JSON.stringify(enterRes));

  // ══ §CPE_WALK_SCRUB_SPAWN — a scrub INSIDE the walk stretch is an optional accelerator: shoes
  // spawns at the scrubbed path point, and a scrub moved since the last walk beats the resume pose.
  // The walk-stretch bounds come from the plan's own §CINEMA_BEATS log (spin..out), so the click
  // fraction is derived, not guessed. ══
  const beatsLine = [...logs].reverse().find(l => l.startsWith('§CINEMA_BEATS'));
  const beatsM = beatsLine && beatsLine.match(/spin=([\d.]+) out=([\d.]+)/);
  const midTn = beatsM ? (+beatsM[1] + +beatsM[2]) / 2 : null;
  let scrubSpawn = { skipped: true };
  if (midTn !== null) {
    const mark3 = logs.length;
    scrubSpawn = await page.evaluate((tn) => {
      const track = document.getElementById('cpe-scrub-track');
      if (!track) return { noTrack: true };
      const r = track.getBoundingClientRect();
      const x = r.left + r.width * tn, y = r.top + r.height / 2;
      track.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 9, bubbles: true, cancelable: true }));
      track.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 9, bubbles: true, cancelable: true }));
      window.CpeWalk.toggle();
      const p = window.CpeWalk._poseForTest();
      const active = window.CpeWalk.isActive();
      window.CpeWalk.toggle();   // leave unmounted for the gates below
      return { p, active };
    }, midTn);
    await sleep(100);
    const win3 = logs.slice(mark3);
    const scrubbedLog = win3.find(l => l.startsWith('§CPE_WALK_SPAWN scrubbed'));
    const tnM = scrubbedLog && scrubbedLog.match(/tn=([\d.]+)/);
    P('G-WALK-SCRUB-SPAWN a scrub inside the walk stretch pre-positions the spawn (log says scrubbed, tn == clicked fraction ±0.05, resume overridden)',
      !!scrubbedLog && !!tnM && Math.abs(+tnM[1] - midTn) < 0.05 && scrubSpawn.active === true,
      `wanted tn≈${midTn.toFixed(3)} log=${scrubbedLog || 'MISSING (spawn logs: ' + win3.filter(l => l.startsWith('§CPE_WALK_SPAWN')).join(' | ') + ')'}`);
  } else {
    P('G-WALK-SCRUB-SPAWN precondition', false, 'no §CINEMA_BEATS line found to derive the walk stretch');
  }

  // ══ G-WALK-TEARDOWN: mount again, then close the editor via Cancel — finish() must force-stop it ══
  await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(100);
  const activeBeforeClose = await page.evaluate(() => window.CpeWalk.isActive());
  await page.evaluate(() => document.getElementById('cpe-cancel').click());
  await sleep(200);
  const activeAfterClose = await page.evaluate(() => window.CpeWalk.isActive());
  P('G-WALK-TEARDOWN closing the editor (Cancel -> finish()) force-stops an active walk session',
    activeBeforeClose === true && activeAfterClose === false,
    `activeBeforeClose=${activeBeforeClose} activeAfterClose=${activeAfterClose}`);

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
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    try {
      const checks = await gates(browser, BLD);
      checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
      summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
    } catch (e) {
      // Witness-harness infra failure (puppeteer/browser flakiness), not a product gate — do not let
      // it kill the rest of the run or masquerade as a code FAIL.
      console.log(`  INFRA-ERROR ${BLD}: ${e.message}`);
      allPass = false;
      summary.push({ BLD, pass: false, n: 0, t: 0, infra: true });
    }
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
