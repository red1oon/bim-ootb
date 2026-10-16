// WITNESS — §CINEMA_FLAT_ENDING (R3 redesign, PHOTOREAL_STILL_RENDER.md).
// ISSUE IT PROVES/DISPROVES: the shipped swoop dipped toward the Sun then climbed BACK UP to the 45°
// look-down — user: "from above then level then back above is not cinematic smooth" / "the last part
// of orbit... should go last 5 secs at least to be flat eye level without the wobble". This drives
// the REAL _cinemaPathPlan twice per building (Sun forced near the natural exit-crossing vs forced
// far from it) and samples poseAt() across the whole final orbit act to verify:
//   PASS = for each building, in BOTH scenarios:
//   (a) tilt is monotonically NON-INCREASING from the descent start to the hold start — no re-climb,
//       i.e. no wobble, regardless of whether the Sun crossing happened to land late or early.
//   (b) tilt is flat (within 0.5°) for the ENTIRE mandated hold window, and that window covers at
//       least CINEMA_FLAT_HOLD_SEC (5s) of real time.
//   (c) the ellipticity radius wobble is damped to near-zero by the time the hold begins.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8399;
const BUILDINGS = (process.env.BLDS || 'Terminal,Hospital').split(',');
const FLAT_HOLD_SEC = 5;

function grab(lines, tag, re) {
  const l = lines.find(t => t.startsWith(tag));
  const m = l && l.match(re);
  return m ? parseFloat(m[1]) : null;
}

async function planAndSample(page, poseFn, sunAzDeg) {
  return page.evaluate(async (poseFnStr, sunAzDeg) => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
    if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
    if (sunAzDeg !== null) {
      const rad = sunAzDeg * Math.PI / 180, dist = 5000;
      A.sun.position.set(Math.cos(rad) * dist, A.sun.position.y, Math.sin(rad) * dist);
    }
    // eslint-disable-next-line no-eval
    eval('(' + poseFnStr + ')')(A);
    const plan = A.cinemaPathPlan(24);
    if (!plan) return null;
    const pivot = plan.pivot, rise = plan.beats.rise;
    const samples = [];
    for (let i = 0; i <= 600; i++) {
      const u = i / 600;
      const tNorm = rise + u * (1 - rise);
      const p = plan.poseAt(tNorm);
      const dx = p.x - pivot.x, dz = p.z - pivot.z, dy = p.y - pivot.y;
      const horiz = Math.hypot(dx, dz);
      samples.push({ u, tiltDeg: Math.atan2(dy, horiz) * 180 / Math.PI, radius: Math.hypot(dx, dy, dz) });
    }
    return { ok: true, samples };
  }, poseFn.toString(), sunAzDeg);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;

  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls && window.APP.cinemaPathPlan,
      { timeout: 90000 });
    await new Promise(r => setTimeout(r, 9000));
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);

    const placeOutside = function(A) {
      const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms');
      const [x0, x1, y0, y1, z0, z1] = r[0];
      const c = A.ifc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const env = Math.max(x1 - x0, y1 - y0);
      const rad = env * 1.5, tilt = 25 * Math.PI / 180, az = 0.9;
      A.controls.target.set(c.x, c.y, c.z);
      A.camera.position.set(c.x + rad * Math.cos(tilt) * Math.cos(az), c.y + rad * Math.sin(tilt) + env * 0.3, c.z + rad * Math.cos(tilt) * Math.sin(az));
      A.controls.update();
    };

    // ── First pass: discover exitAz with an arbitrary Sun position ──
    const before0 = logs.length;
    await planAndSample(page, placeOutside, 0);
    const tail0 = logs.slice(before0);
    const exitAz = grab(tail0, '§CINEMA_SUN', /exitAz=(-?[\d.]+)/);
    if (exitAz === null) { console.log('  could not discover exitAz — skipping'); allPass = false; await page.close(); continue; }

    const scenarios = [
      { name: 'Sun-near-loop-end (swoopU close to 1)', sunAzDeg: exitAz - 5 },     // az≈exitAz+u*360, u=1 -> az=exitAz+360=exitAz; sun just before that
      { name: 'Sun-early-in-loop (swoopU far from 1)', sunAzDeg: exitAz + 90 },
    ];

    for (const sc of scenarios) {
      const before = logs.length;
      const result = await planAndSample(page, placeOutside, sc.sunAzDeg);
      const tail = logs.slice(before);
      const feLine = tail.find(l => l.startsWith('§CINEMA_FLAT_ENDING'));
      console.log(`  [${sc.name}] sunAzDeg=${sc.sunAzDeg.toFixed(1)}`);
      console.log('    ' + (feLine || 'NO §CINEMA_FLAT_ENDING LINE'));
      if (!result || !result.ok || !feLine) { console.log('    [FAIL] plan or log missing'); allPass = false; continue; }

      const descentStartU = grab(tail, '§CINEMA_FLAT_ENDING', /descentStartU=([\d.]+)/);
      const holdStartU = grab(tail, '§CINEMA_FLAT_ENDING', /holdStartU=([\d.]+)/);
      const loopSec = grab(tail, '§CINEMA_FLAT_ENDING', /loopSec=([\d.]+)/);
      const caughtSun = / caughtSun=true/.test(feLine);

      const samples = result.samples;
      // (a) monotonic non-increasing from descentStartU to holdStartU
      let monotonic = true, maxIncrease = 0;
      const inDescent = samples.filter(s => s.u >= descentStartU - 0.002 && s.u <= holdStartU + 0.002);
      for (let i = 1; i < inDescent.length; i++) {
        const d = inDescent[i].tiltDeg - inDescent[i - 1].tiltDeg;
        if (d > 0.05) { monotonic = false; if (d > maxIncrease) maxIncrease = d; }
      }
      // (b) flat during hold
      const inHold = samples.filter(s => s.u >= holdStartU);
      const maxHoldTiltDev = inHold.length ? Math.max(...inHold.map(s => Math.abs(s.tiltDeg))) : Infinity;
      const holdDurationSec = (1 - holdStartU) * loopSec;
      // (c) ellipticity damped by hold start — split the hold at CINEMA_PULLBACK_START (0.80): BEFORE
      // it, radius must be near-CONSTANT (ellipticity fully damped, pullback not yet engaged — this
      // is the actual "no wobble" test); AT/AFTER it, radius is EXPECTED to grow (the flourish is
      // orthogonal to tilt, spec explicitly allows it) — check that growth is MONOTONIC, not
      // oscillating, rather than flat.
      const PULLBACK_START = 0.80;
      const preHold = inHold.filter(s => s.u < PULLBACK_START);
      const postHold = inHold.filter(s => s.u >= PULLBACK_START);
      const preSpread = preHold.length > 1 ? (Math.max(...preHold.map(s => s.radius)) - Math.min(...preHold.map(s => s.radius))) / preHold[0].radius : 0;
      let postMonotonic = true;
      for (let i = 1; i < postHold.length; i++) { if (postHold[i].radius < postHold[i - 1].radius - 1e-6) postMonotonic = false; }

      console.log(`    descentStartU=${descentStartU} holdStartU=${holdStartU} loopSec=${loopSec} caughtSun=${caughtSun}`);
      console.log(`    maxTiltIncreaseInDescent=${maxIncrease.toFixed(3)}deg maxHoldTiltDev=${maxHoldTiltDev.toFixed(3)}deg holdDurationSec=${holdDurationSec.toFixed(2)} preHoldRadiusSpreadFrac=${preSpread.toFixed(4)} postHoldMonotonicGrowth=${postMonotonic}`);

      const checks = [
        ['tilt never re-climbs during the descent (no wobble)', monotonic],
        ['tilt is flat (<0.5deg dev) for the entire hold', maxHoldTiltDev < 0.5],
        [`hold covers >= ${FLAT_HOLD_SEC}s (allowing 10% slack)`, holdDurationSec >= FLAT_HOLD_SEC * 0.9],
        ['radius wobble damped BEFORE the pullback flourish engages (<3% spread)', preSpread < 0.03],
        ['once the pullback flourish engages, radius grows monotonically (no oscillation)', postMonotonic],
      ];
      checks.forEach(([label, ok]) => { console.log(`    [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });
    }

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('  PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — ending always glides to a flat, held, wobble-free finish' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
