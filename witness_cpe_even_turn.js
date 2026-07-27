// WITNESS — §CPE_EVEN_TURN: a hard direction change is curved out, not crammed.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_EVEN_TURN.
//
// THE DEFECT (user, Hospital, 2026-07-27: "it has to be even curved out to never have any sharp
// sudden turns"). Their log: `maxBow=2.13m unmeasuredJoins=2/2` — the clearance fan read NOTHING at
// both joins, so both fell back to the 3m nudge cap and the k-shrink loop drove the corner tight.
// §CPE_LIVE's rule is NOT re-litigated here: a fan reporting CINEMA_FAN_FAR is UNKNOWN, never "60m
// of space". The fix takes a MEASUREMENT instead of reinterpreting the sentinel — one ray along the
// direction the connector actually bulges.
//
//   T1 the rescue — on a hostile layout (bands aimed apart, the shape that produces the user's
//      report), joins the fan cannot read are probed by the bow ray, and the resulting bow is LARGER
//      than the 3m cap allowed. Disproves "the cap was already big enough".
//   T2 the point of it — peak turn rate over the WHOLE film drops, and lands under the B5 cap.
//      A bigger bow that did not buy a gentler corner would be motion for its own sake.
//   T3 the doctrine — a join whose bow ray ALSO hits nothing still obeys the 3m cap. Unknown stays
//      unknown; this must not become a back door to treating the sentinel as space.
//   T4 no regression — where the fan DID measure, the measured clearance still binds (§CPE_BANDS B4).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const FPS = 15, DUR = 24;
const CAP_DEG = parseFloat(process.env.CAP || '12');   // same cap witness_cinema_bands B5 uses
const NUDGE_CAP = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaBandFlow &&
      window.APP.cinemaSeedBands, { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const res = await page.evaluate(async (dur, fps, capDeg) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      A._cinemaPathEdit = null;
      const derived = A.cinemaPathPlan(dur, null);
      const seeded = A.cinemaSeedBands(derived.waypoints, derived.pathLen);

      // HOSTILE layout: bands aimed apart, so each connector must swing hard — the shape behind the
      // user's report. Same construction witness_cinema_bands B5 uses for its adversarial case.
      const hostile = seeded.map((b, i) => ({
        c: { x: b.c.x, y: b.c.y, z: b.c.z },
        d: i % 2 ? { x: -b.d.x, y: b.d.y, z: -b.d.z } : { x: b.d.x, y: b.d.y, z: b.d.z },
        len: b.len,
      }));

      const turnPeak = (plan) => {
        const n = Math.max(2, Math.round(dur * fps));
        let peak = 0, peakT = 0, prev = null, total = 0;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), p = plan.poseAt(u);
          const yaw = Math.atan2(p.tz - p.z, p.tx - p.x) * 180 / Math.PI;
          if (prev !== null) {
            let d = Math.abs(yaw - prev); if (d > 180) d = 360 - d;
            total += d;
            if (d > peak) { peak = d; peakT = u; }
          }
          prev = yaw;
        }
        return { peak, peakT, total, frames: n };
      };

      const run = (bands) => {
        const flow = A.cinemaBandFlow(bands);
        const plan = A.cinemaPathPlan(dur, { bands: bands, _total: dur });
        // Max excursion of each connector from its chord, recomputed here off the FLOWN polyline so
        // the gate is not reading the same variable the code under test wrote.
        const ends = b => { const h = b.len / 2; return [
          { x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h },
          { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }]; };
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        const bows = [];
        for (let i = 0; i < bands.length - 1; i++) {
          const e = ends(bands[i]), nx = ends(bands[i + 1]);
          let iEnd = -1, iNext = -1;
          for (let k = 0; k < flow.length; k++) {
            if (dist(flow[k], e[1]) < 1e-9) iEnd = k;
            if (dist(flow[k], nx[0]) < 1e-9 && iNext < 0 && k > iEnd) iNext = k;
          }
          if (iEnd < 0 || iNext < 0) continue;
          const P0 = flow[iEnd], P1 = flow[iNext];
          const vx = P1.x - P0.x, vy = P1.y - P0.y, vz = P1.z - P0.z;
          const s2 = vx * vx + vy * vy + vz * vz || 1;
          let bow = 0, bx = 0, bz = 0, at = P0;
          for (let k = iEnd + 1; k < iNext; k++) {
            const wx = flow[k].x - P0.x, wy = flow[k].y - P0.y, wz = flow[k].z - P0.z;
            const t = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / s2));
            const ox = wx - vx * t, oy = wy - vy * t, oz = wz - vz * t;
            const d = Math.hypot(ox, oy, oz);
            if (d > bow) { bow = d; bx = ox; bz = oz; at = { x: P0.x + vx * t, y: P0.y + vy * t, z: P0.z + vz * t }; }
          }
          // Independently re-measure what the code claims to have measured.
          let fanMin = null, bowRay = null;
          try {
            const f = A.cinemaFan({ x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2, z: (P0.z + P1.z) / 2 }, 8);
            if (f && isFinite(f.min)) fanMin = f.min;
          } catch (e) {}
          try { if (Math.hypot(bx, bz) > 1e-4) bowRay = A.cinemaLookDist(at, bx, bz); } catch (e) {}
          bows.push({ i, bow, fanMin, bowRay });
        }
        return { bows, turn: turnPeak(plan), flown: flow.length, beats: plan.beats || plan.sec || null };
      };

      return { hostile: run(hostile), seeded: run(seeded) };
    }, DUR, FPS, CAP_DEG);

    const H = res.hostile;
    const unread = H.bows.filter(b => b.fanMin === null || b.fanMin >= 59.99);
    const rescued = unread.filter(b => b.bowRay !== null && b.bowRay < 59.99);
    const stuck = unread.filter(b => !(b.bowRay !== null && b.bowRay < 59.99));

    P('T1 a join the fan cannot read is probed along its own bow, and bows past the 3m cap',
      rescued.length === 0 ? unread.length === 0 : rescued.some(b => b.bow > NUDGE_CAP + 0.01),
      unread.length === 0
        ? `no unread joins on this building — the fan measured all ${H.bows.length}, nothing to rescue`
        : rescued.map(b => `join${b.i}: fanMin=${b.fanMin === null ? 'n/a' : b.fanMin.toFixed(2)} ` +
            `bowRay=${b.bowRay.toFixed(2)}m -> bow=${b.bow.toFixed(2)}m (cap was ${NUDGE_CAP})`).join(' | ') ||
          `${unread.length} unread join(s), none rescued`);

    P(`T2 peak turn rate over the whole film stays under ${CAP_DEG} deg/frame on a hostile layout`,
      H.turn.peak <= CAP_DEG,
      `peak=${H.turn.peak.toFixed(1)} deg/frame at u=${H.turn.peakT.toFixed(3)}, total turn ` +
      `${H.turn.total.toFixed(0)}deg over ${H.turn.frames} frames (mean ${(H.turn.total / H.turn.frames).toFixed(1)})\n` +
      `          beats: ${JSON.stringify(H.beats)}`);

    P('T3 a join whose bow ray ALSO hits nothing still obeys the 3m cap (unknown stays unknown)',
      stuck.every(b => b.bow <= NUDGE_CAP + 0.01),
      stuck.length ? stuck.map(b => `join${b.i}: bowRay=${b.bowRay === null ? 'n/a' : b.bowRay.toFixed(2)} bow=${b.bow.toFixed(2)}m`).join(' | ')
                   : 'no join was unreadable in both the fan AND the bow ray on this building');

    const meas = res.seeded.bows.filter(b => b.fanMin !== null && b.fanMin < 59.99);
    P('T4 no regression: where the fan DID measure, the measurement still binds (B4)',
      meas.every(b => b.bow <= b.fanMin + 0.01),
      meas.length ? meas.map(b => `conn${b.i}: bow=${b.bow.toFixed(2)}m clear=${b.fanMin.toFixed(2)}m`).join(' | ')
                  : 'seeded layout had no measured joins on this building');

    console.log(`  INFO  seeded layout peak=${res.seeded.turn.peak.toFixed(1)} deg/frame, flown=${res.seeded.flown} pts`);
    console.log(`  INFO  ${logs.filter(l => /§CINEMA_BANDS/.test(l)).slice(-1)[0] || '(no §CINEMA_BANDS line)'}`);
    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
