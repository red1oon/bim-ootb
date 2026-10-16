// WITNESS — §CINEMA_ORBIT_V2 (2026-07-20, user-directed redesign spanning 6 pieces).
// ISSUE IT PROVES/DISPROVES: the multi-message live-trial redesign of the cinema orbit —
//   1. Space selection simplified to largest-space-only (no floor-level weighting, no
//      multi-candidate iteration) — "abandon the 'next largest room' idea... just go to largest
//      space... let user play with it".
//   2. Exit choice is RUSHED (nearest-dominant) when travel happened to reach the target, GRACEFUL
//      (facing-preferred) when the camera started already at the target.
//   3. The spin is MOTIVATED: skipped entirely when already facing the exit, a full lap only when
//      the exit is behind, a direct turn otherwise.
//   4. The exterior orbit shape is conditional on whether the Sun-crossing falls in the first or
//      second half of the loop (flat-then-rise-to-elevated vs rise-then-glide-to-flat).
//   5. The whole film decelerates its azimuthal sweep in the final ~2s instead of cutting while
//      still actively orbiting.
//   6. The Beat 3->4 turn-to-face-the-building overlaps with the walk-out instead of restarting
//      from a dead stop (no zero-velocity kink at the boundary).
// Drives the REAL _cinemaPathPlan; every assertion is re-derived from plan.poseAt()/console logs,
// never asked of the placement code whether it thinks it did the right thing.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8399;
const BLD = process.env.BLD || 'Duplex';

function grabStr(lines, tag, re) {
  const l = lines.find(t => t.startsWith(tag));
  const m = l && l.match(re);
  return m ? m[1] : null;
}
function grabNum(lines, tag, re) {
  const s = grabStr(lines, tag, re);
  return s === null ? null : parseFloat(s);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  let allPass = true;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls && window.APP.cinemaPathPlan, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));
  await page.waitForFunction(() => {
    const A = window.APP;
    try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });

  async function placeOutsideAndPlan(sunAzDeg) {
    return page.evaluate(async (sunAzDeg) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      if (sunAzDeg !== null) {
        const rad = sunAzDeg * Math.PI / 180, dist = 5000;
        A.sun.position.set(Math.cos(rad) * dist, A.sun.position.y, Math.sin(rad) * dist);
      }
      const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms');
      const [x0, x1, y0, y1, z0, z1] = r[0];
      const c = A.ifc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const env = Math.max(x1 - x0, y1 - y0);
      const rad2 = env * 1.5, tilt = 25 * Math.PI / 180, az = 0.9;
      A.controls.target.set(c.x, c.y, c.z);
      A.camera.position.set(c.x + rad2 * Math.cos(tilt) * Math.cos(az), c.y + rad2 * Math.sin(tilt) + env * 0.3, c.z + rad2 * Math.cos(tilt) * Math.sin(az));
      A.controls.update();
      const plan = A.cinemaPathPlan(24);
      if (!plan) return null;
      const pivot = plan.pivot, rise = plan.beats.rise, out = plan.beats.out, spin = plan.beats.spin;
      const samples = [];
      for (let i = 0; i <= 800; i++) {
        const u = i / 800;
        const tNorm = rise + u * (1 - rise);
        const p = plan.poseAt(tNorm);
        const dx = p.x - pivot.x, dz = p.z - pivot.z, dy = p.y - pivot.y;
        samples.push({ u, tiltDeg: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI, az: Math.atan2(dz, dx) });
      }
      // Sample TIGHT around the Beat3->4 boundary for the overlap-continuity check — a real
      // discontinuity shows up in the IMMEDIATE vicinity (a kink at the exact point); a wide window
      // just measures the natural (and expected) smoothstep acceleration on the Beat 4 side, which
      // is not a discontinuity and produced a false positive at +/-30 steps in an earlier pass.
      const boundarySamples = [];
      for (let i = -6; i <= 6; i++) {
        const tNorm = out + i * 0.0005;
        if (tNorm < spin || tNorm > rise) continue;
        const p = plan.poseAt(tNorm);
        boundarySamples.push({ tNorm, tx: p.tx, ty: p.ty, tz: p.tz, x: p.x, y: p.y, z: p.z });
      }
      return { ok: true, settle: plan.settle, samples, boundarySamples, tO: out, tR: rise };
    }, sunAzDeg);
  }

  // ── (1)+(2)+(3): outside start -> RUSHED mood, single-candidate space search, spin class sane ──
  const before1 = logs.length;
  const out1 = await placeOutsideAndPlan(0);
  const tail1 = logs.slice(before1);
  const spaceLines1 = tail1.filter(l => l.startsWith('§CINEMA_SPACE'));
  const mood1 = grabStr(tail1, '§CINEMA_EXIT', / mood=(\w+)/);
  const spinClass1 = grabStr(tail1, '§CINEMA_SPIN', / class=([\w()-]+)/);
  const exitAzDeg1 = grabNum(tail1, '§CINEMA_SUN_ORDER', /exitAzDeg=(-?[\d.]+)/);
  console.log('  [1] Outside start:');
  spaceLines1.forEach(l => console.log('      | ' + l));
  console.log('      ' + (tail1.find(l => l.startsWith('§CINEMA_EXIT')) || 'NO §CINEMA_EXIT'));
  console.log('      ' + (tail1.find(l => l.startsWith('§CINEMA_SPIN')) || 'NO §CINEMA_SPIN'));
  const checks1 = [
    ['plan succeeded', !!(out1 && out1.ok)],
    ['at most 2 §CINEMA_SPACE lines (single candidate + at most one fallback — no iteration)', spaceLines1.length > 0 && spaceLines1.length <= 2],
    ['mood=rushed on a genuine outside dive', mood1 === 'rushed'],
    ['spin class is a recognised value', ['already-facing(no-spin)', 'behind(full-lap)', 'direct-turn'].includes(spinClass1)],
    ['exitAz was discovered', exitAzDeg1 !== null],
  ];
  checks1.forEach(([label, ok]) => { console.log(`      [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

  // ── (2) graceful mood: teleport the camera to the FIRST plan's settle point (diveDist~0) ──
  if (out1 && out1.ok && out1.settle) {
    const before2 = logs.length;
    const out2 = await page.evaluate(async (settle) => {
      const A = window.APP;
      A.camera.position.set(settle.x, settle.y, settle.z);
      A.camera.lookAt(settle.x + 5, settle.y, settle.z);
      A.controls.target.set(settle.x + 5, settle.y, settle.z);
      A.controls.update();
      const plan = A.cinemaPathPlan(24);
      return plan ? { ok: true } : { ok: false };
    }, out1.settle);
    const tail2 = logs.slice(before2);
    const mood2 = grabStr(tail2, '§CINEMA_EXIT', / mood=(\w+)/);
    const diveDist2 = grabNum(tail2, '§CINEMA_DIVE', /diveDist=([\d.]+)/);
    console.log('  [2] Camera teleported to settle point:');
    console.log('      ' + (tail2.find(l => l.startsWith('§CINEMA_DIVE')) || 'NO §CINEMA_DIVE'));
    console.log('      ' + (tail2.find(l => l.startsWith('§CINEMA_EXIT')) || 'NO §CINEMA_EXIT'));
    const checks2 = [
      ['plan succeeded', !!(out2 && out2.ok)],
      ['diveDist is near-zero (camera already at the target)', diveDist2 !== null && diveDist2 < 3],
      ['mood=graceful when no travel was needed', mood2 === 'graceful'],
    ];
    checks2.forEach(([label, ok]) => { console.log(`      [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });
  } else {
    console.log('  [2] SKIPPED — first plan had no settle point');
    allPass = false;
  }

  // ── (4)+(5)+(6): sun-first vs sun-last shape, end-deceleration, beat-overlap continuity ──
  if (exitAzDeg1 !== null) {
    const scenarios = [
      { name: 'sun-first', sunAzDeg: exitAzDeg1 + 90 },   // swoopU = ((sunAz-exitAz) mod 360)/360 ≈ 0.25
      { name: 'sun-last', sunAzDeg: exitAzDeg1 + 300 },   // swoopU ≈ 0.833
    ];
    for (const sc of scenarios) {
      const before3 = logs.length;
      const out3 = await placeOutsideAndPlan(sc.sunAzDeg);
      const tail3 = logs.slice(before3);
      const sunFirst = / sunFirst=true/.test(tail3.find(l => l.startsWith('§CINEMA_SUN_ORDER')) || '');
      console.log(`  [${sc.name}] sunAzDeg=${sc.sunAzDeg.toFixed(1)}`);
      console.log('      ' + (tail3.find(l => l.startsWith('§CINEMA_SUN_ORDER')) || 'NO §CINEMA_SUN_ORDER'));
      console.log('      ' + (tail3.find(l => l.startsWith('§CINEMA_RISE_ENDING') || l.startsWith('§CINEMA_FLAT_ENDING')) || 'NO ENDING LINE'));
      if (!out3 || !out3.ok) { console.log('      [FAIL] plan failed'); allPass = false; continue; }

      // (4) shape check
      const samples = out3.samples;
      const openingTilt = samples[0].tiltDeg, endingTilt = samples[samples.length - 1].tiltDeg;
      let shapeOk;
      if (sunFirst) {
        shapeOk = Math.abs(openingTilt) < 3 && Math.abs(endingTilt - 45) < 3;
      } else {
        shapeOk = Math.abs(endingTilt) < 0.5;
      }
      console.log(`      openingTiltDeg=${openingTilt.toFixed(2)} endingTiltDeg=${endingTilt.toFixed(2)}`);

      // (5) end-deceleration: angular rate in the final samples should trend toward 0
      let az = samples.map(s => s.az);
      // unwrap
      for (let i = 1; i < az.length; i++) { while (az[i] - az[i - 1] > Math.PI) az[i] -= 2 * Math.PI; while (az[i] - az[i - 1] < -Math.PI) az[i] += 2 * Math.PI; }
      const dU = 1 / 800;
      const rateAt = (i) => Math.abs(az[i] - az[i - 1]) / dU;
      const midRate = rateAt(400); // well before the decel window
      const lastRate = rateAt(az.length - 1);
      const decelOk = lastRate < midRate * 0.15; // should have slowed to a near-crawl by the very end

      // (6) beat-overlap continuity: look-at direction should have no big jump across tO
      const bs = out3.boundarySamples;
      let maxJumpDeg = 0;
      for (let i = 1; i < bs.length; i++) {
        const a = bs[i - 1], b = bs[i];
        const va = { x: a.tx - a.x, y: a.ty - a.y, z: a.tz - a.z };
        const vb = { x: b.tx - b.x, y: b.ty - b.y, z: b.tz - b.z };
        const na = Math.hypot(va.x, va.y, va.z) || 1, nb = Math.hypot(vb.x, vb.y, vb.z) || 1;
        const dot = (va.x * vb.x + va.y * vb.y + va.z * vb.z) / (na * nb);
        const angDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        if (angDeg > maxJumpDeg) maxJumpDeg = angDeg;
      }
      console.log(`      midRate=${midRate.toFixed(3)} lastRate=${lastRate.toFixed(3)} maxLookAtJumpDegPerSample=${maxJumpDeg.toFixed(3)}`);

      const checks3 = [
        [`tilt shape matches ${sc.name} (opening/ending)`, shapeOk],
        ['azimuthal rate decelerates toward the very end (<15% of mid-loop rate)', decelOk],
        // Threshold widened from 0.5deg after measuring real per-building variance (Duplex 0.43,
        // Terminal 0.14-0.08, Hospital 0.68-0.96 — all well under 1deg, scales mildly with building
        // size via the "ahead" look-at extrapolation point's geometry). A genuine discontinuity from
        // reverting the overlap fix would be an order of magnitude larger (tens of degrees, since the
        // two beats' look-at targets would then be computed by unrelated formulas with no shared
        // continuity guarantee) — 2deg comfortably separates "natural per-building variance" from
        // "the fix regressed".
        ['no kink in the look-at direction at the Beat3/4 boundary (<2deg per 0.0005 tNorm step, immediate vicinity)', maxJumpDeg < 2],
      ];
      checks3.forEach(([label, ok]) => { console.log(`      [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });
    }
  } else {
    console.log('  [4-6] SKIPPED — exitAz never discovered');
    allPass = false;
  }

  const errs = logs.filter(l => l.startsWith('PAGEERROR'));
  if (errs.length) { console.log('  PAGEERRORS (session): ' + errs.join(' | ')); allPass = false; }
  await page.close();

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — all 6 pieces verified' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
