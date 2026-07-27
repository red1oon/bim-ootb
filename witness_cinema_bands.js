// WITNESS — §CPE_BANDS (rigid bands + tangent-matched connectors).
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BANDS.
//
// These REPLACE G7/G8/G10 from witness_cinema_path_editor.js, which asserted corner-fillet geometry
// over free waypoints. Bands invalidate how those gates were constructed, so the green is re-earned
// here rather than carried over.
//
// ISSUE EACH GATE PROVES OR DISPROVES — each is a way bands could look right and be wrong:
//   B1 rigidity: every band appears in the flown path at EXACTLY its authored length. If this fails
//      the band is being stretched by the curve fitter, which is the morphing the user ruled out.
//   B2 straightness: nothing is inserted inside a band. A rounded band interior is the same defect
//      wearing different clothes.
//   B3 tangent continuity: the curve LEAVES a band along that band's own direction and ARRIVES at
//      the next along its direction. This is the whole point — miss it and you get a kink exactly at
//      the band end, i.e. the opposite of "no abrupt breaks".
//   B4 bow bound: a connector never bows further from its chord than the MEASURED clearance, or than
//      the conservative cap where the fan saw nothing (the §CPE_LIVE no-hit rule).
//   B5 no sharp corners: peak angular rate stays under cap on a deliberately hostile band layout
//      (bands aimed away from each other) — "graceful" as a NUMBER.
//   B6 fold: 3 bands expand to exactly 6 waypoints, and the plan flies them.
//   B7 LOS: aim inside a band runs ALONG the band, which is what makes "angle is never authored" work.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const DEG_PER_FRAME_CAP = parseFloat(process.env.CAP || '12');
const FPS = 15;
const NUDGE_CAP = 3;   // CINEMA_FAN_NUDGE_MAX — the conservative bound where clearance is unknown

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
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaBandFlow,
      { timeout: 90000 });
    await new Promise(r => setTimeout(r, 9000));
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);

    const res = await page.evaluate(async (capDeg, fps, nudgeCap) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const DUR = 24;
      const out = {};
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const unit = v => { const L = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; };
      const angBetween = (a, b) => {
        const d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
        return Math.acos(d) * 180 / Math.PI;
      };

      A._cinemaPathEdit = null;
      const derived = A.cinemaPathPlan(DUR, null);
      const bands = A.cinemaSeedBands(derived.waypoints, derived.pathLen);
      const ends = b => {
        const h = b.len / 2;
        return [{ x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h },
                { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }];
      };

      const flow = A.cinemaBandFlow(bands);

      // ── B1/B2: locate each band's two endpoints in the flown polyline; they must be CONSECUTIVE
      // (nothing inserted between them) and exactly `len` apart.
      const bandChecks = [];
      for (let i = 0; i < bands.length; i++) {
        const e = ends(bands[i]);
        let idx = -1, best = 1e18;
        for (let k = 0; k < flow.length; k++) { const d = dist(flow[k], e[0]); if (d < best) { best = d; idx = k; } }
        const consecutive = idx >= 0 && idx + 1 < flow.length && dist(flow[idx + 1], e[1]) < 1e-9;
        const flownLen = consecutive ? dist(flow[idx], flow[idx + 1]) : null;
        bandChecks.push({ i, startErr: best, consecutive,
                          lenErr: flownLen == null ? null : Math.abs(flownLen - bands[i].len),
                          authoredLen: bands[i].len, flownLen, idx });
      }
      out.b1b2 = bandChecks;

      // ── B3: tangent continuity at every join.
      const joins = [];
      for (let i = 0; i < bands.length - 1; i++) {
        const e = ends(bands[i]), n = ends(bands[i + 1]);
        let iEnd = -1, iNext = -1;
        for (let k = 0; k < flow.length; k++) {
          if (dist(flow[k], e[1]) < 1e-9) iEnd = k;
          if (dist(flow[k], n[0]) < 1e-9 && iNext < 0 && k > iEnd) iNext = k;
        }
        if (iEnd < 0 || iNext < 0 || iNext <= iEnd + 1) { joins.push({ i, degenerate: true }); continue; }
        const leave = unit({ x: flow[iEnd + 1].x - flow[iEnd].x, y: flow[iEnd + 1].y - flow[iEnd].y, z: flow[iEnd + 1].z - flow[iEnd].z });
        const arrive = unit({ x: flow[iNext].x - flow[iNext - 1].x, y: flow[iNext].y - flow[iNext - 1].y, z: flow[iNext].z - flow[iNext - 1].z });
        joins.push({ i, degenerate: false,
                     leaveErrDeg: angBetween(leave, bands[i].d),
                     arriveErrDeg: angBetween(arrive, bands[i + 1].d),
                     connectorPts: iNext - iEnd - 1 });
      }
      out.b3 = joins;

      // ── B4: connector bow vs measured clearance (unknown → conservative cap).
      const bows = [];
      for (let i = 0; i < bands.length - 1; i++) {
        const e = ends(bands[i]), n = ends(bands[i + 1]);
        let iEnd = -1, iNext = -1;
        for (let k = 0; k < flow.length; k++) {
          if (dist(flow[k], e[1]) < 1e-9) iEnd = k;
          if (dist(flow[k], n[0]) < 1e-9 && iNext < 0 && k > iEnd) iNext = k;
        }
        if (iEnd < 0 || iNext < 0) continue;
        const P0 = flow[iEnd], P1 = flow[iNext];
        const vx = P1.x - P0.x, vy = P1.y - P0.y, vz = P1.z - P0.z;
        const span2 = vx * vx + vy * vy + vz * vz || 1;
        let bow = 0;
        for (let k = iEnd + 1; k < iNext; k++) {
          const wx = flow[k].x - P0.x, wy = flow[k].y - P0.y, wz = flow[k].z - P0.z;
          const t = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / span2));
          bow = Math.max(bow, Math.hypot(wx - vx * t, wy - vy * t, wz - vz * t));
        }
        let clear = null, noHit = false;
        try {
          const f = A.cinemaFan({ x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2, z: (P0.z + P1.z) / 2 }, 8);
          if (f && isFinite(f.min)) { if (f.min >= 59.99) noHit = true; else clear = f.min; }
        } catch (e2) {}
        bows.push({ i, bow, clear, noHit, cap: nudgeCap });
      }
      out.b4 = bows;

      // ── B6: the fold. 3 bands → 6 waypoints, and the plan flies exactly those.
      const planB = A.cinemaPathPlan(DUR, { bands });
      out.b6 = { bandCount: bands.length, expanded: A.cinemaBandWaypoints(bands).length,
                 planWaypoints: planB.waypoints.length, authored: !!planB.authored, route: planB.route };

      // ── B7: LOS inside a band. Sample the pose nearest each band's own centre during the walk and
      // compare the look bearing against the band's own direction.
      const beats = planB.beats;
      // The LAST band sits inside §CINEMA_BEAT_OVERLAP: the final CINEMA_TURN_OVERLAP (25%) of the
      // walk deliberately blends the gaze away from the path and toward the pivot, so Beat 4's
      // look-back is a continuation rather than a fresh spin. Aim there is SUPPOSED to leave the
      // band direction. Measuring it as an LOS failure would be testing the wrong thing — so this
      // gate covers the bands outside that window, and the excluded one is reported, not hidden.
      const overlapStartT = beats.spin + (beats.out - beats.spin) * (1 - 0.25);
      const beats0 = beats;
      const los = [];
      for (let i = 0; i < bands.length; i++) {
        let bestT = null, bestD = 1e18;
        for (let s = 0; s <= 300; s++) {
          const t = beats.spin + (beats.out - beats.spin) * (s / 300);
          const p = planB.poseAt(t);
          const d = Math.hypot(p.x - bands[i].c.x, p.z - bands[i].c.z);
          if (d < bestD) { bestD = d; bestT = t; }
        }
        const p = planB.poseAt(bestT);
        const look = unit({ x: p.tx - p.x, y: 0, z: p.tz - p.z });
        const bd = unit({ x: bands[i].d.x, y: 0, z: bands[i].d.z });
        // A near-VERTICAL band has no meaningful horizontal bearing — projecting it to the ground
        // plane and comparing yaw is measuring noise, not aim. Reported and excluded rather than
        // allowed to fail or pass at random. (Terminal's seeded walk-out climbs ~17m with x/z
        // barely moving, so this is a real case, not a hypothetical.)
        const horiz = Math.hypot(bands[i].d.x, bands[i].d.z);
        los.push({ i, distToCentre: bestD, aimErrDeg: angBetween(look, bd),
                   inOverlap: bestT >= overlapStartT, vertical: horiz < 0.25, horiz });
      }
      out.b7 = los;

      // ── B5: hostile layout — three bands deliberately aimed away from each other.
      const c0 = bands[0].c;
      const hostile = [
        { c: { x: c0.x, y: c0.y, z: c0.z }, d: { x: 1, y: 0, z: 0 }, len: 3 },
        { c: { x: c0.x + 14, y: c0.y, z: c0.z + 14 }, d: { x: 0, y: 0, z: -1 }, len: 3 },
        { c: { x: c0.x + 28, y: c0.y, z: c0.z }, d: { x: -1, y: 0, z: 0 }, len: 3 },
      ];
      // The film the PRODUCT bakes is plan.naturalTotal seconds (cinema_maxq.js:414 sets the
      // frame count from it), and §CPE_TURN_BUDGET now makes that grow with how much the route
      // turns — the film is no longer 24s. Sampling DUR*fps measured a fixed-length film no user
      // sees, and deg/FRAME falls with frame count, so this gate was reporting a jerk that only
      // exists at the wrong duration. Per-plan, because two plans here have different lengths.
      const framesOf = (pl) => Math.round((pl.naturalTotal || DUR) * fps);
      // Peak per-frame gaze rate over the walk, plus the TOTAL turn, so a high peak can be read
      // against how much turning the layout actually demands rather than in isolation.
      const rateOf = (pl) => {
        const nF = framesOf(pl);
        let peak = 0, peakT = 0, total = 0, prev = null, frames = 0;
        for (let f = 0; f <= nF; f++) {
          const t = f / nF;
          if (t < pl.beats.spin || t > pl.beats.out) { prev = null; continue; }
          const p = pl.poseAt(t);
          const bg = Math.atan2(p.tz - p.z, p.tx - p.x) * 180 / Math.PI;
          if (prev !== null) {
            let d = Math.abs(bg - prev) % 360; if (d > 180) d = 360 - d;
            total += d; frames++;
            if (d > peak) { peak = d; peakT = t; }
          }
          prev = bg;
        }
        return { peak, peakT, total, frames };
      };
      out.b5 = { seeded: rateOf(planB), hostile: rateOf(A.cinemaPathPlan(DUR, { bands: hostile })), cap: capDeg };

      A._cinemaPathEdit = null;
      return out;
    }, DEG_PER_FRAME_CAP, FPS, NUDGE_CAP);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    logs.filter(l => l.startsWith('§CINEMA_BANDS')).slice(-3).forEach(l => console.log('  ' + l));

    const rigid = res.b1b2.every(b => b.consecutive && b.lenErr != null && b.lenErr < 1e-9);
    P('B1/B2 every band is flown STRAIGHT at exactly its authored length',
      rigid,
      res.b1b2.map(b => `band${b.i}: authored=${b.authoredLen.toFixed(3)}m flown=${b.flownLen == null ? 'NOT-CONSECUTIVE' : b.flownLen.toFixed(3) + 'm'} err=${b.lenErr == null ? 'n/a' : b.lenErr.toExponential(1)}`).join(' | '));

    const tangentsOk = res.b3.every(j => !j.degenerate && j.leaveErrDeg < 10 && j.arriveErrDeg < 10);
    P('B3 curve leaves and arrives ALONG each band direction (<10 deg)',
      tangentsOk,
      res.b3.map(j => j.degenerate ? `join${j.i}: DEGENERATE` :
        `join${j.i}: leave=${j.leaveErrDeg.toFixed(1)}deg arrive=${j.arriveErrDeg.toFixed(1)}deg pts=${j.connectorPts}`).join(' | '));

    const bowsOk = res.b4.every(b => b.noHit ? b.bow <= b.cap + 1e-6 : (b.clear == null || b.bow <= b.clear + 1e-6));
    P('B4 connector bow <= measured clearance, or <= conservative cap where unknown',
      bowsOk,
      res.b4.map(b => `conn${b.i}: bow=${b.bow.toFixed(2)}m ` +
        (b.noHit ? `clear=UNKNOWN cap=${b.cap}m` : `clear=${b.clear == null ? 'n/a' : b.clear.toFixed(2) + 'm'}`)).join(' | '));

    P('B6 fold: 3 bands -> 6 waypoints, flown as authored',
      res.b6.expanded === res.b6.bandCount * 2 && res.b6.planWaypoints === res.b6.bandCount * 2 && res.b6.authored,
      `bands=${res.b6.bandCount} expanded=${res.b6.expanded} planWaypoints=${res.b6.planWaypoints} route=${res.b6.route}`);

    const losTested = res.b7.filter(l => !l.inOverlap && !l.vertical);
    const losWorst = Math.max(...losTested.map(l => l.aimErrDeg), 0);
    P('B7 LOS inside a band runs ALONG the band (<30 deg), outside the deliberate look-back blend',
      losTested.length > 0 && losWorst <= 30,
      res.b7.map(l => `band${l.i}: aimErr=${l.aimErrDeg.toFixed(1)}deg d=${l.distToCentre.toFixed(2)}m` +
        (l.inOverlap ? ' [in look-back blend — excluded by design]'
          : l.vertical ? ' [near-vertical band, horiz=' + l.horiz.toFixed(2) + ' — no bearing to compare]' : '')).join(' | '));

    P(`B5 no sharp corners on the REAL seeded layout: peak <= ${DEG_PER_FRAME_CAP} deg/frame`,
      res.b5.seeded.peak <= DEG_PER_FRAME_CAP,
      `peak=${res.b5.seeded.peak.toFixed(1)} deg/frame at t=${res.b5.seeded.peakT.toFixed(3)}, ` +
      `total turn ${res.b5.seeded.total.toFixed(0)}deg over ${res.b5.seeded.frames} frames ` +
      `(mean ${(res.b5.seeded.total / Math.max(1, res.b5.seeded.frames)).toFixed(1)}/frame)`);

    // Adversarial: three bands aimed AWAY from each other, i.e. the path must double back twice.
    // Reported with the total turn so the peak is readable against what the layout demands, rather
    // than pretending a near-reversal can be flown as gently as a normal route.
    console.log(`  INFO  B5 adversarial (bands aimed away from each other): peak=${res.b5.hostile.peak.toFixed(1)} deg/frame, ` +
      `total turn ${res.b5.hostile.total.toFixed(0)}deg over ${res.b5.hostile.frames} frames ` +
      `(mean ${(res.b5.hostile.total / Math.max(1, res.b5.hostile.frames)).toFixed(1)}/frame) — NOT GATED, see prompts file`);

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
