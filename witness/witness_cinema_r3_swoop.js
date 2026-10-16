// WITNESS — §CINEMA_SWOOP reinstated (R3, PHOTOREAL_STILL_RENDER.md "LIVE TRIAL REGRESSIONS").
// ISSUE IT PROVES/DISPROVES: the §CINEMA_SIMPLE cleanup (#902) deleted §CINEMA_SWOOP — the film no
// longer levels off to catch the Sun's reflection during the final orbit. This drives the REAL
// _cinemaPathPlan and samples poseAt() across the final orbit act to confirm the tilt actually dips
// toward CINEMA_SWOOP_TILT_DEG at the sun-crossing and is UNCHANGED away from it. Also exercises the
// Sun-hold branch (hold=true), never proven to fire before (per the doctrine, R3 and Sun-hold are the
// same sun-awareness — verify together).
//   PASS = for each building:
//     (a) §CINEMA_SWOOP log line present with a finite swoopU/halfU.
//     (b) sampled tilt at the swoop crossing is measurably CLOSER to CINEMA_SWOOP_TILT_DEG(=4°) than
//         the no-swoop baseline tilt at that same u.
//     (c) sampled tilt far from the crossing (>=2x halfU away) matches the no-swoop baseline closely.
//     (d) with the Sun forced onto the exit heading, §CINEMA_SUN reports hold=true, holdU>0, and the
//         orbit's OPENING tilt (u near 0) is measurably shallower than the plain look-down angle.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8399;
const BUILDINGS = (process.env.BLDS || 'Terminal,Hospital').split(',');
const SWOOP_TILT_DEG = 4;

function grab(lines, tag, re) {
  const l = lines.find(t => t.startsWith(tag));
  const m = l && l.match(re);
  return m ? parseFloat(m[1]) : null;
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
    }, { timeout: 90000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);

    // ── (a)+(b)+(c): a normal outside pose, sample the final orbit for the dip ──
    const before1 = logs.length;
    const plan1 = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms');
      const [x0, x1, y0, y1, z0, z1] = r[0];
      const c = A.ifc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const env = Math.max(x1 - x0, y1 - y0);
      const rad = env * 1.5, tilt = 25 * Math.PI / 180, az = 0.9;
      A.controls.target.set(c.x, c.y, c.z);
      A.camera.position.set(c.x + rad * Math.cos(tilt) * Math.cos(az), c.y + rad * Math.sin(tilt) + env * 0.3, c.z + rad * Math.cos(tilt) * Math.sin(az));
      A.controls.update();
      const plan = A.cinemaPathPlan(24);
      if (!plan) return null;
      // sample the WHOLE final orbit act densely, deriving tilt from the returned camera position
      // (poseAt gives x/y/z + target, not the raw tilt scalar, so recover it from geometry).
      const pivot = plan.pivot;
      const rise = plan.beats.rise;
      const samples = [];
      for (let i = 0; i <= 400; i++) {
        const u = i / 400;
        const tNorm = rise + u * (1 - rise);
        const p = plan.poseAt(tNorm);
        const dx = p.x - pivot.x, dz = p.z - pivot.z, dy = p.y - pivot.y;
        const horiz = Math.hypot(dx, dz);
        const tiltDeg = Math.atan2(dy, horiz) * 180 / Math.PI;
        samples.push({ u, tiltDeg });
      }
      return { ok: true, samples, rise };
    });
    const tail1 = logs.slice(before1);
    const swoopLine = tail1.find(l => l.startsWith('§CINEMA_SWOOP'));
    const sunLine = tail1.find(l => l.startsWith('§CINEMA_SUN'));
    console.log('  ' + (swoopLine || 'NO §CINEMA_SWOOP LINE'));
    console.log('  ' + (sunLine || 'NO §CINEMA_SUN LINE'));

    const swoopU = grab(tail1, '§CINEMA_SWOOP', /swoopU=([\d.]+)/);
    const halfU = grab(tail1, '§CINEMA_SWOOP', /halfU=([\d.]+)/);
    const entryTiltDeg = grab(tail1, '§CINEMA_SUN', /entryTilt=(-?[\d.]+)/);
    const lookdownDeg = grab(tail1, '§CINEMA_SUN', /lookdown=(-?[\d.]+)/);
    const holdU0 = grab(tail1, '§CINEMA_SUN', /holdU=([\d.]+)/);

    let dipOk = false, farOk = true, dipMagnitude = null, farMaxDev = 0;
    if (plan1 && plan1.ok && swoopU !== null && halfU !== null && entryTiltDeg !== null && lookdownDeg !== null) {
      const baseline = (u) => entryTiltDeg + (lookdownDeg - entryTiltDeg) * (holdU0 > 0 ? smoothstep(u / holdU0) : 1);
      function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
      let bestNear = null, bestNearDelta = Infinity;
      for (const s of plan1.samples) {
        let d = Math.abs(s.u - swoopU); d = Math.min(d, 1 - d);
        if (d < bestNearDelta) { bestNearDelta = d; bestNear = s; }
      }
      if (bestNear) {
        const base = baseline(bestNear.u);
        dipMagnitude = base - bestNear.tiltDeg; // positive = dipped toward level (lower tilt)
        dipOk = dipMagnitude > 3; // measurably closer to the SWOOP_TILT_DEG=4deg floor than baseline
      }
      for (const s of plan1.samples) {
        let d = Math.abs(s.u - swoopU); d = Math.min(d, 1 - d);
        if (d >= 2 * halfU) {
          const base = baseline(s.u);
          const dev = Math.abs(base - s.tiltDeg);
          if (dev > farMaxDev) farMaxDev = dev;
        }
      }
      farOk = farMaxDev < 0.5; // matches baseline closely away from the crossing
    }
    console.log(`    swoopU=${swoopU} halfU=${halfU} dipMagnitude=${dipMagnitude === null ? 'n/a' : dipMagnitude.toFixed(2)}deg farMaxDev=${farMaxDev.toFixed(3)}deg`);
    const checksA = [
      ['§CINEMA_SWOOP line present with finite swoopU/halfU', swoopU !== null && halfU !== null && isFinite(swoopU) && isFinite(halfU)],
      ['tilt measurably dips (>3deg) toward the swoop floor at the crossing', dipOk],
      ['tilt away from the crossing matches the no-swoop baseline (<0.5deg dev)', farOk],
    ];
    checksA.forEach(([label, ok]) => { console.log(`    [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    // ── (d): force the Sun onto the exit heading, confirm hold=true fires ──
    const before2 = logs.length;
    const plan2 = await page.evaluate(async (exitAzDeg) => {
      const A = window.APP;
      // Move the Sun so its azimuth (as seen from the pivot) lands ON the exit heading — forces
      // sunHold=true regardless of where the camera happened to start (the branch that was never
      // exercised before, per the doctrine).
      const rad = exitAzDeg * Math.PI / 180;
      const dist = 5000;
      A.sun.position.set(Math.cos(rad) * dist, A.sun.position.y, Math.sin(rad) * dist);
      const plan = A.cinemaPathPlan(24);
      if (!plan) return null;
      const pivot = plan.pivot;
      const p0 = plan.poseAt(plan.beats.rise); // orbit opening, u≈0
      const dx = p0.x - pivot.x, dz = p0.z - pivot.z, dy = p0.y - pivot.y;
      const openTiltDeg = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
      return { ok: true, openTiltDeg };
    }, (grab(tail1, '§CINEMA_SUN', /exitAz=(-?[\d.]+)/) || 0));
    const tail2 = logs.slice(before2);
    const sunLine2 = tail2.find(l => l.startsWith('§CINEMA_SUN'));
    console.log('  Sun forced onto exit heading:');
    console.log('    ' + (sunLine2 || 'NO §CINEMA_SUN LINE'));
    const hold2 = sunLine2 && / hold=true/.test(sunLine2);
    const holdU2 = grab(tail2, '§CINEMA_SUN', /holdU=([\d.]+)/);
    const lookdown2 = grab(tail2, '§CINEMA_SUN', /lookdown=(-?[\d.]+)/);
    const checksB = [
      ['Sun-hold branch fires (hold=true) when Sun is on the exit heading', !!hold2],
      ['holdU > 0', holdU2 !== null && holdU2 > 0],
      ['orbit opening tilt is shallower than the plain look-down (held back)', plan2 && plan2.ok && lookdown2 !== null && plan2.openTiltDeg < lookdown2 - 5],
    ];
    checksB.forEach(([label, ok]) => { console.log(`    [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('   PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — swoop dips at the sun-crossing, Sun-hold verified firing' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
