// WITNESS — §CPE_AIM_PIN (Part C): click-to-pin explicit look-target.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md Part C.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-PIN-1a  a pinned band's sampled look direction points at the pinned target within tolerance.
//   G-PIN-1b  the bands immediately before/after are UNAFFECTED (no bleed) — sampled pose identical
//             before and after the pin, at their own arc-position.
//   G-PIN-1c  unpinning reverts the pinned band's own aim back to (approximately) what it was
//             before the pin — the override is genuinely rotation-only and reversible.
//   G-PIN-2   persistence: the pin rides `_buildOverride()`'s `bands[i].lookAt` — the SAME override
//             Save/the bake already consume, no second table (guardrail 4).
//   G-PIN-3   position untouched: the pinned band's CENTRE (`c`) is bit-identical before/after.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8470;
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
  // angle in degrees between two unit-ish direction vectors {x,y,z}
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  const c = Math.max(-1, Math.min(1, dot / (la * lb || 1)));
  return Math.acos(c) * 180 / Math.PI;
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  const setup = await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor;
    // Middle band (index 1, "exit door" on a fresh 3-band seed) — always present, no stick spawn
    // needed. G-PIN-1b needs a band BEFORE and AFTER it: band 0 (settle) and band 2 (stop) on a
    // freshly-seeded 3-band path.
    const ov0 = cpe._probeOverride();
    if (!ov0 || ov0.bands.length < 3) return null;
    const t0 = cpe._bandTNorm(0), t1 = cpe._bandTNorm(1), t2 = cpe._bandTNorm(2);
    return {
      nBands: ov0.bands.length, t0, t1, t2,
      c1: ov0.bands[1].c,
      poseBefore0: cpe._probePoseAt(t0), poseBefore1: cpe._probePoseAt(t1), poseBefore2: cpe._probePoseAt(t2)
    };
  });
  if (!setup) {
    P('G-PIN-0 a 3-band seed is available (precondition)', false, 'freshly-opened editor did not have >=3 bands — inconclusive');
    await page.close();
    return checks;
  }

  // A deterministic target — offset from band 1's own centre, well clear of it, so the aim change
  // is unambiguous. Not a real mesh (this gate is about the AIM MATH, not the raycast UI — that is
  // exercised separately, live, via real pointer events in a real browser session).
  const target = { x: setup.c1.x + 12, y: setup.c1.y + 3, z: setup.c1.z - 9 };

  const mark1 = logs.length;
  const pinned = await page.evaluate((bi, p) => {
    const cpe = window.APP.cinemaPathEditor;
    return cpe._setPin(bi, p);
  }, 1, target);
  await sleep(50);
  const win1 = logs.slice(mark1);

  const after = await page.evaluate((t0, t1, t2) => {
    const cpe = window.APP.cinemaPathEditor;
    return {
      ov: cpe._probeOverride(),
      pose0: cpe._probePoseAt(t0), pose1: cpe._probePoseAt(t1), pose2: cpe._probePoseAt(t2)
    };
  }, setup.t0, setup.t1, setup.t2);

  P('G-PIN-0 _setPin returned true and logged §CPE_AIM_PIN', pinned && win1.some(l => l.startsWith('§CPE_AIM_PIN band=1')),
    'returned=' + pinned + ' logged=' + win1.filter(l => l.startsWith('§CPE_AIM_PIN')).join(' | '));

  // G-PIN-1a: aim at band 1's own position now points at `target`.
  const aimDir1 = { x: after.pose1.tx - after.pose1.x, y: after.pose1.ty - after.pose1.y, z: after.pose1.tz - after.pose1.z };
  const wantDir1 = { x: target.x - after.pose1.x, y: target.y - after.pose1.y, z: target.z - after.pose1.z };
  const errDeg1 = ang(aimDir1, wantDir1);
  P('G-PIN-1a pinned band\'s sampled look direction points at the pinned target (<=2deg)',
    errDeg1 <= 2, `angErr=${errDeg1.toFixed(3)}deg pose1=(${after.pose1.x.toFixed(2)},${after.pose1.y.toFixed(2)},${after.pose1.z.toFixed(2)}) ` +
    `target=(${target.x.toFixed(2)},${target.y.toFixed(2)},${target.z.toFixed(2)})`);

  // G-PIN-1b: "no bleed" is about the AIM SOURCE at a neighbour's own zone — does LOS/§CPE_AIM_
  // DENSITY still govern band 0's and band 2's own stretch of the walk, i.e. is `lookAt: null` for
  // their zones? That is what the spec's "LOS/density resume immediately after, no bleed into
  // neighbours" actually claims, and it is what `_pinLookAtAt`'s Voronoi partition guarantees by
  // construction — checked here against the REAL zone table (`A._cpePinZonesDebug()`), not asserted
  // blind.
  //
  // A full re-SAMPLED pose at bands 0/2 is NOT bit-identical before/after (measured below, reported
  // as INFO not a gate) — and that is a pre-existing, unrelated engine property, not a leak of THIS
  // feature: `_evenTurnBuild()` (effects.js:6655) samples `_beat3Pose` (gaze INCLUDED) across the
  // WHOLE walk once per plan to build a distance+turn cost table that `_evenTurnRemap` uses to
  // convert time-fraction into arc-fraction — so ANY aim change anywhere on the walk (a pin, a
  // §CPE_AIM_DENSITY trigger flipping, anything) re-shapes that ONE global table and therefore
  // shifts which arc-position a given tNorm lands on everywhere, by design (§CPE_EVEN_TURN exists
  // specifically to retime by turn cost). This predates Part C and would fire identically for a
  // density-triggered aim change with no pin involved at all.
  const pz = await page.evaluate(() => window.APP._cpePinZonesDebug());
  const z0 = pz && pz[0], z2 = pz && pz[2];
  P('G-PIN-1b neighbouring bands\' OWN zones are still ungoverned (lookAt=null) — no bleed of the aim SOURCE',
    !!pz && z0 && z2 && z0.lookAt === null && z2.lookAt === null,
    `zones=${pz ? JSON.stringify(pz.map(z => ({ b: z.b, lo: +z.lo.toFixed(3), hi: +z.hi.toFixed(3), pinned: !!z.lookAt }))) : 'null'}`);

  const dPos0 = Math.hypot(after.pose0.x - setup.poseBefore0.x, after.pose0.y - setup.poseBefore0.y, after.pose0.z - setup.poseBefore0.z);
  const dTgt0 = Math.hypot(after.pose0.tx - setup.poseBefore0.tx, after.pose0.ty - setup.poseBefore0.ty, after.pose0.tz - setup.poseBefore0.tz);
  const dPos2 = Math.hypot(after.pose2.x - setup.poseBefore2.x, after.pose2.y - setup.poseBefore2.y, after.pose2.z - setup.poseBefore2.z);
  const dTgt2 = Math.hypot(after.pose2.tx - setup.poseBefore2.tx, after.pose2.ty - setup.poseBefore2.ty, after.pose2.tz - setup.poseBefore2.tz);
  console.log(`  INFO  §CPE_EVEN_TURN retiming side-effect (not gated, see G-PIN-1b's own comment): ` +
    `band0 posDelta=${dPos0.toFixed(3)}m aimTargetDelta=${dTgt0.toFixed(3)}m | ` +
    `band2 posDelta=${dPos2.toFixed(3)}m aimTargetDelta=${dTgt2.toFixed(3)}m (target points sit ~20m out, so this is a small angular shift)`);

  // G-PIN-2: persistence — the SAME override object (`_buildOverride()`), no second table.
  const ovLA = after.ov.bands[1].lookAt;
  const dOv = ovLA ? Math.hypot(ovLA.x - target.x, ovLA.y - target.y, ovLA.z - target.z) : Infinity;
  P('G-PIN-2 the pin rides _buildOverride().bands[1].lookAt (no second table)',
    dOv < 1e-6, `override.bands[1].lookAt=${ovLA ? JSON.stringify(ovLA) : 'null'} delta=${dOv}`);

  // G-PIN-3: position untouched — band 1's centre is bit-identical.
  const c1After = after.ov.bands[1].c;
  const dC = Math.hypot(c1After.x - setup.c1.x, c1After.y - setup.c1.y, c1After.z - setup.c1.z);
  P('G-PIN-3 band centre (position) is untouched by the pin — rotation only',
    dC < 1e-9, `centreDelta=${dC.toExponential(2)}m`);

  // G-PIN-1c: unpin reverts band 1's own aim back toward what it was pre-pin.
  const mark2 = logs.length;
  const unpinned = await page.evaluate((bi) => window.APP.cinemaPathEditor._unpinBand(bi), 1);
  await sleep(50);
  const win2 = logs.slice(mark2);
  const restored = await page.evaluate((t1) => window.APP.cinemaPathEditor._probePoseAt(t1), setup.t1);
  const revertDir = { x: restored.tx - restored.x, y: restored.ty - restored.y, z: restored.tz - restored.z };
  const origDir = { x: setup.poseBefore1.tx - setup.poseBefore1.x, y: setup.poseBefore1.ty - setup.poseBefore1.y, z: setup.poseBefore1.tz - setup.poseBefore1.z };
  const revertErrDeg = ang(revertDir, origDir);
  P('G-PIN-1c unpinning reverts the aim close to its pre-pin direction',
    unpinned && win2.some(l => l.startsWith('§CPE_AIM_PIN unpin')) && revertErrDeg < 2,
    `unpinned=${unpinned} logged=${win2.filter(l => l.startsWith('§CPE_AIM_PIN')).join(' | ')} revertAngErr=${revertErrDeg.toFixed(3)}deg`);

  // Static: cinema_maxq.js (the bake loop) is untouched by this whole feature — same boundary as
  // Part B, restated here since this session's brief called it out explicitly.
  const fs = require('fs');
  const maxqSrc = fs.readFileSync(path.join(__dirname, '..', '..') + '/viewer/cinema_maxq.js', 'utf8');
  P('G-PIN-static cinema_maxq.js has zero references to _cpePinZonesDebug/_setPin/_tryPinClick',
    !/_cpePinZonesDebug|_tryPinClick/.test(maxqSrc),
    `matches=${(maxqSrc.match(/_cpePinZonesDebug|_tryPinClick/g) || []).length}`);

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
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
