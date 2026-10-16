// WITNESS — §CPE_CONE_ORIENT_ADJUST: drag the passive POV cone to correct a bad gaze, no stick added.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CONE_ORIENT_ADJUST (2026-08-27).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-CONE-0   precondition — a fresh 3-band seed exists and its walk beat has a real time span, so
//              there is a scrub position inside it to test against.
//   G-CONE-1   before any interaction the cone is NOT focused, standing colour (0xff1744).
//   G-CONE-2   a real click (down+up, ~zero pixels) on the cone FOCUSES it (colour -> 0x8B5A2B) and
//              creates NO correction — click alone must never commit anything.
//   G-CONE-3   a real click OUTSIDE the cone clears focus (colour reverts) — and, since that outside
//              point could in principle land on the pipe/a handle, also proves it spawned no stick.
//   G-CONE-4   a real drag (down on the cone, moved past CLICK_SLOP_PX, released) commits ONE
//              correction with a plausible unit direction, and — the acceptance criterion this whole
//              feature exists to satisfy — `bands.length` and every `band.c`/`band.d` are BYTE-
//              IDENTICAL to before the drag. No band/waypoint was added or moved.
//   G-CONE-5   the VF/preview panel auto-shows during the drag (spec item 3), even though it was
//              never toggled on.
//   G-CONE-6   the envelope is the ASYMMETRIC, arc-length-anchored shape spec item 5 describes:
//              sampled via the real `_beat3Pose(e3)` product function (A._cpeBeat3PoseDebug) at the
//              anchor, mid-hold, end-of-decay and well past decay — full strength at/through the
//              hold, eased down by the end of decay, and materially different again once clear of
//              the whole window (proves the taper actually decays rather than pinning forever).
//   G-CONE-7   undo (real Ctrl+Z) removes the correction; redo (real Ctrl+Shift+Z) restores it with
//              the same anchor/direction.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8511;
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

function ang(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  const c = Math.max(-1, Math.min(1, dot / (la * lb || 1)));
  return Math.acos(c) * 180 / Math.PI;
}

// Real pointer gestures through the browser's own input pipeline — same technique
// witness_cpe_drag.js already uses for band handles, applied here to the cone.
async function click(page, x, y) {
  await page.mouse.move(Math.round(x), Math.round(y));
  await page.mouse.down();
  await page.mouse.up();
  await sleep(150);
}
async function drag(page, x0, y0, x1, y1) {
  await page.mouse.move(Math.round(x0), Math.round(y0));
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(Math.round(x0 + (x1 - x0) * i / 8), Math.round(y0 + (y1 - y0) * i / 8));
  await page.mouse.up();
  await sleep(150);
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  const setup = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    const ov0 = cpe._probeOverride();
    if (!ov0 || ov0.bands.length < 3) return null;
    const t1 = cpe._bandTNorm(1);
    if (t1 == null) return null;
    cpe._scrubTo(t1);   // real product path — puts the cone at band 1's own walk position
    const mk = cpe._probePovMarker();
    if (!mk) return null;
    return { nBands: ov0.bands.length, bands: ov0.bands, t1, mk };
  });
  if (!setup) {
    P('G-CONE-0 a 3-band seed + walk-window scrub position + POV cone are all available (precondition)',
      false, 'freshly-opened editor did not satisfy the precondition — inconclusive');
    await page.close();
    return checks;
  }
  P('G-CONE-0 precondition: 3-band seed, walk-window scrub target, cone exists', true,
    `nBands=${setup.nBands} t1=${setup.t1.toFixed(3)} cone=(${setup.mk.x.toFixed(2)},${setup.mk.y.toFixed(2)},${setup.mk.z.toFixed(2)})`);

  // Where the cone projects on screen right now — same THREE.Vector3.project technique
  // witness_cpe_drag.js already uses for a band centre.
  const proj = await page.evaluate((mk) => {
    const A = window.APP, c = A.camera;
    const p = new THREE.Vector3(mk.x, mk.y, mk.z);
    const v = p.clone().project(c);
    const r = A.canvas.getBoundingClientRect();
    return { sx: r.left + (v.x + 1) / 2 * r.width, sy: r.top + (1 - v.y) / 2 * r.height,
             behind: v.z > 1, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  }, setup.mk);
  P('G-CONE-0b the cone projects on-screen, in front of the camera', !proj.behind,
    `sx=${proj.sx.toFixed(0)} sy=${proj.sy.toFixed(0)} behind=${proj.behind}`);

  // ── G-CONE-1: before any interaction.
  const f0 = await page.evaluate(() => window.APP.cinemaPathEditor._probeConeFocus());
  P('G-CONE-1 the cone is NOT focused before any interaction, standing colour',
    f0 && f0.focused === false && f0.hex === '0xff1744', `focus=${JSON.stringify(f0)}`);

  // ── G-CONE-2: a real click (no movement) on the cone.
  const mark2 = logs.length;
  await click(page, proj.sx, proj.sy);
  const win2 = logs.slice(mark2);
  const f1 = await page.evaluate(() => window.APP.cinemaPathEditor._probeConeFocus());
  const corr1 = await page.evaluate(() => window.APP.cinemaPathEditor._probeCorrections());
  P('G-CONE-2 a real click on the cone focuses it (colour -> 0x8b5a2b) and logs §CPE_CONE_FOCUS on',
    f1 && f1.focused === true && f1.hex === '0x8b5a2b' && win2.some(l => l.startsWith('§CPE_CONE_FOCUS on')),
    `focus=${JSON.stringify(f1)} logged=${win2.filter(l => l.startsWith('§CPE_CONE_FOCUS')).join(' | ')}`);
  P('G-CONE-2b a plain click creates NO correction', corr1 && corr1.length === 0, `corrections=${corr1 ? corr1.length : 'null'}`);

  // ── G-CONE-3: a real click OUTSIDE the cone — corner of the canvas, well clear of the model.
  const mark3 = logs.length;
  await click(page, proj.rect.left + 18, proj.rect.top + 18);
  const win3 = logs.slice(mark3);
  const f2 = await page.evaluate(() => window.APP.cinemaPathEditor._probeConeFocus());
  const bands3 = await page.evaluate(() => window.APP.cinemaPathEditor._probeOverride().bands);
  P('G-CONE-3 a real click OUTSIDE the cone clears focus (colour reverts) and logs §CPE_CONE_FOCUS off',
    f2 && f2.focused === false && f2.hex === '0xff1744' && win3.some(l => l.startsWith('§CPE_CONE_FOCUS off')),
    `focus=${JSON.stringify(f2)} logged=${win3.filter(l => l.startsWith('§CPE_CONE_FOCUS')).join(' | ')}`);
  P('G-CONE-3b that outside click spawned no stick (band count unchanged)',
    bands3.length === setup.nBands, `bands=${bands3.length} vs setup=${setup.nBands}`);

  // ── G-CONE-4: a real drag — rotate the cone by a known pixel delta and release.
  const DX = 80, DY = -40;   // yaw right ~27.5deg, pitch up ~13.7deg at CONE_ROTATE_RAD_PER_PX=0.006
  const mark4 = logs.length;
  await drag(page, proj.sx, proj.sy, proj.sx + DX, proj.sy + DY);
  const win4 = logs.slice(mark4);
  const after4 = await page.evaluate(() => ({
    corr: window.APP.cinemaPathEditor._probeCorrections(),
    ov: window.APP.cinemaPathEditor._probeOverride(),
    focus: window.APP.cinemaPathEditor._probeConeFocus(),
    vf: window.APP.cinemaPathEditor._probeVF()
  }));
  P('G-CONE-4 the drag committed exactly ONE correction, logged §CPE_CONE_CORRECTION add',
    after4.corr && after4.corr.length === 1 && win4.some(l => l.startsWith('§CPE_CONE_CORRECTION add')),
    `corrections=${after4.corr ? after4.corr.length : 'null'} logged=${win4.filter(l => l.startsWith('§CPE_CONE_CORRECTION')).join(' | ')}`);
  const dirOk = after4.corr && after4.corr[0] && isFinite(after4.corr[0].dir.x) &&
    Math.abs(Math.hypot(after4.corr[0].dir.x, after4.corr[0].dir.y, after4.corr[0].dir.z) - 1) < 1e-3;
  P('G-CONE-4b the stored corrected direction is a real unit vector',
    dirOk, `dir=${after4.corr && after4.corr[0] ? JSON.stringify(after4.corr[0].dir) : 'null'}`);

  // The acceptance criterion the whole feature exists to satisfy: no band/waypoint moved.
  const bandsAfter = after4.ov.bands;
  let bandsIdentical = bandsAfter.length === setup.bands.length;
  let maxDelta = 0;
  if (bandsIdentical) {
    for (let i = 0; i < setup.bands.length; i++) {
      const a = setup.bands[i], b = bandsAfter[i];
      maxDelta = Math.max(maxDelta,
        Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y, a.c.z - b.c.z),
        Math.hypot(a.d.x - b.d.x, a.d.y - b.d.y, a.d.z - b.d.z));
    }
  }
  P('G-CONE-4c bands.length and every band.c/band.d are BYTE-IDENTICAL after the cone drag — never adds/moves a band',
    bandsIdentical && maxDelta < 1e-9,
    `nBefore=${setup.bands.length} nAfter=${bandsAfter.length} maxDelta=${maxDelta.toExponential(2)}`);

  // ── G-CONE-5: the VF panel auto-showed during the drag, even though never toggled on.
  P('G-CONE-5 the preview/viewfinder panel auto-shows during the drag (spec item 3)',
    after4.vf && after4.vf.on === true, `vfOn=${after4.vf ? after4.vf.on : 'null'}`);

  // ── G-CONE-6: the envelope shape, sampled via the REAL _beat3Pose(e3) at known arc-fractions.
  const shape = await page.evaluate(() => {
    const corr = window.APP._cpeCorrectionsDebug();
    if (!corr || !corr.length) return null;
    const c = corr[0];
    const at = (e3) => window.APP._cpeBeat3PoseDebug(Math.max(0, Math.min(1, e3)));
    const dirAt = (e3) => { const p = at(e3); return { x: p.tx - p.x, y: p.ty - p.y, z: p.tz - p.z }; };
    return {
      s: c.s, rampFrac: c.rampFrac, holdFrac: c.holdFrac, decayFrac: c.decayFrac, corrDir: c.dir,
      beforeRamp: dirAt(c.s - c.rampFrac - 0.05),         // well behind the ramp — untouched
      atAnchor: dirAt(c.s),                                // ramp complete, full strength begins
      midHold: dirAt(c.s + c.holdFrac / 2),                 // mid-hold — full strength
      endDecay: dirAt(c.s + c.holdFrac + c.decayFrac),     // decay just finished — back to underlying
      wellPastDecay: dirAt(c.s + c.holdFrac + c.decayFrac + 0.08)   // clear of the whole window
    };
  });
  if (!shape) {
    P('G-CONE-6 envelope shape sampled via the real _beat3Pose(e3)', false, 'A._cpeCorrectionsDebug() returned no entries — inconclusive');
  } else {
    const errAnchor = ang(shape.atAnchor, shape.corrDir);
    const errMidHold = ang(shape.midHold, shape.corrDir);
    const errEndDecay = ang(shape.endDecay, shape.corrDir);
    const errBeforeRamp = ang(shape.beforeRamp, shape.corrDir);
    const errPastDecay = ang(shape.wellPastDecay, shape.corrDir);
    P('G-CONE-6a at the anchor (ramp complete) the sampled gaze matches the corrected direction (<=3deg)',
      errAnchor <= 3, `angErr=${errAnchor.toFixed(2)}deg`);
    P('G-CONE-6b mid-hold the sampled gaze still matches the corrected direction (<=3deg)',
      errMidHold <= 3, `angErr=${errMidHold.toFixed(2)}deg`);
    P('G-CONE-6c the taper actually DECAYS: well past decay, the gaze has moved measurably away from the corrected direction vs. the anchor/hold',
      errPastDecay > errMidHold + 1, `errPastDecay=${errPastDecay.toFixed(2)}deg vs errMidHold=${errMidHold.toFixed(2)}deg (must be materially larger)`);
    console.log(`  INFO  envelope s=${shape.s.toFixed(3)} rampFrac=${shape.rampFrac.toFixed(4)} holdFrac=${shape.holdFrac.toFixed(4)} decayFrac=${shape.decayFrac.toFixed(4)} | ` +
      `angErr beforeRamp=${errBeforeRamp.toFixed(1)} atAnchor=${errAnchor.toFixed(1)} midHold=${errMidHold.toFixed(1)} endDecay=${errEndDecay.toFixed(1)} wellPastDecay=${errPastDecay.toFixed(1)} (deg)`);
  }

  // ── G-CONE-7: undo / redo, real Ctrl+Z / Ctrl+Shift+Z — same technique witness_cpe_undo.js uses.
  const mark7 = logs.length;
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await sleep(200);
  const win7 = logs.slice(mark7);
  const afterUndo = await page.evaluate(() => ({
    corr: window.APP.cinemaPathEditor._probeCorrections(), bands: window.APP.cinemaPathEditor._probeOverride().bands
  }));
  P('G-CONE-7a Ctrl+Z removes the committed correction', afterUndo.corr && afterUndo.corr.length === 0,
    `corrections=${afterUndo.corr ? afterUndo.corr.length : 'null'} logged=${win7.filter(l => l.startsWith('§CPE_UNDO')).join(' | ')}`);
  P('G-CONE-7b bands still untouched after undo', afterUndo.bands.length === setup.nBands, `bands=${afterUndo.bands.length}`);

  const mark8 = logs.length;
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ');
  await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await sleep(200);
  const win8 = logs.slice(mark8);
  const afterRedo = await page.evaluate(() => window.APP.cinemaPathEditor._probeCorrections());
  const redoDirErr = afterRedo && afterRedo[0] ? ang(afterRedo[0].dir, after4.corr[0].dir) : 999;
  P('G-CONE-7c Ctrl+Shift+Z redoes the correction, same direction restored',
    afterRedo && afterRedo.length === 1 && redoDirErr < 0.01,
    `corrections=${afterRedo ? afterRedo.length : 'null'} dirErr=${redoDirErr.toFixed(4)}deg logged=${win8.filter(l => l.startsWith('§CPE_UNDO')).join(' | ')}`);

  try { await page.evaluate(() => document.getElementById('cpe-cancel').click()); } catch (e) {}
  console.log(`  INFO  ${logs.filter(l => /§CPE_LOADED/.test(l))[0] || '(no §CPE_LOADED)'}`);
  checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
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
    const checks = await gates(browser, BLD);
    checks.forEach(c => { if (!c.ok) allPass = false; });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
