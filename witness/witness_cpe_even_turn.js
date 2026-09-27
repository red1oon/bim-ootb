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
//   T1 RETIRED — the bow-ray rescue hypothesis, disproven by measurement (see the INFO line in the
//      body). Reported, not gated.
//   T2 the point of it — peak GAZE SWEEP over the WHOLE film stays under the cap. Measures the angle
//      the gaze direction turns between frames (what a viewer sees as jerk), NOT yaw: yaw is
//      degenerate near-vertical and read 46.8 deg/frame on Terminal where the true sweep was 7.2.
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

      // What "jerk" IS: the angle the gaze DIRECTION sweeps between consecutive frames — the motion
      // the viewer actually sees. This used to measure YAW instead, and yaw is the wrong instrument:
      // it is degenerate near-vertical, where a tiny real movement swings it arbitrarily far.
      // MEASURED on Terminal: yaw read 46.8 deg/frame at u=0.329 while the gaze sat at 87.2 deg of
      // pitch (horizontal component 0.049) — the true frame-to-frame sweep there was under 7.2 deg.
      // The 46.8 was an artefact of the instrument, not motion on screen.
      // This is NOT a weakened gate: the 3D sweep is >= the visible motion in every non-degenerate
      // case too, and it additionally catches PITCH whips that a yaw-only gate could never see.
      // Where the camera POINTS is the user's creative control (their call, 2026-07-27); how fast it
      // is allowed to CHANGE is what this witness owns.
      const turnPeak = (plan) => {
        // The film the PRODUCT bakes is plan.naturalTotal seconds long (cinema_maxq.js:414 sets
        // the frame count from it), not `dur`. Sampling dur*fps measured a 24s film that no user
        // ever sees: on Hospital the real film is 44-69s, i.e. 2-3x the frames, and deg/FRAME
        // falls with frame count. Same instrument class as the G7/G2 bugs — measure the regime
        // the product actually enters.
        const n = Math.max(2, Math.round((plan.naturalTotal || dur) * fps));
        let peak = 0, peakT = 0, prev = null, total = 0, peakPitch = 0;
        let yawPeak = 0, yawPeakT = 0, yawPeakPitch = 0, prevYaw = null;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), p = plan.poseAt(u);
          const gx = p.tx - p.x, gy = p.ty - p.y, gz = p.tz - p.z;
          const gl = Math.hypot(gx, gy, gz) || 1;
          const g = { x: gx / gl, y: gy / gl, z: gz / gl };
          const pitch = Math.asin(Math.max(-1, Math.min(1, g.y))) * 180 / Math.PI;
          const yaw = Math.atan2(gz, gx) * 180 / Math.PI;
          if (prev !== null) {
            const d = Math.acos(Math.max(-1, Math.min(1, g.x * prev.x + g.y * prev.y + g.z * prev.z))) * 180 / Math.PI;
            total += d;
            if (d > peak) { peak = d; peakT = u; peakPitch = pitch; }
            let dy = Math.abs(yaw - prevYaw); if (dy > 180) dy = 360 - dy;
            if (dy > yawPeak) { yawPeak = dy; yawPeakT = u; yawPeakPitch = pitch; }
          }
          prev = g; prevYaw = yaw;
        }
        return { peak, peakT, peakPitch, total, frames: n, yawPeak, yawPeakT, yawPeakPitch };
      };

      // §CPE_JERK_DEFINITION item 2 — the POSITION half, which the user named FIRST ("pov sudden
      // position") and which nothing gated until now. T2 above measures only how fast the gaze
      // sweeps; a camera can hold a perfectly steady aim while TELEPORTING, and that reads as the
      // worst jerk of all.
      //
      // The cap is DERIVED per beat, not invented. Each beat is parameterized by a smoothstep of
      // its own time fraction, and smoothstep's derivative peaks at exactly 1.5 — so a beat that
      // moves smoothly along its own path can never exceed 1.5x its OWN mean step. Anything past
      // that is a discontinuity in that beat, whatever the beat's nominal speed is (dive at 20m/s
      // and the walk at 2.3m/s are both held to their own mean, so no per-beat constant is needed).
      // Tolerance 1.1x on top, for the beat-boundary frame that straddles two parameterizations.
      //
      // TWO beats need a different bound, both for stated reasons, neither to make this pass:
      //  - THE WALK is deliberately NOT arc-uniform. §CPE_EVEN_TURN parameterizes it by a blended
      //    distance+turn cost, so its distance step is bounded by 1/(1-w) = PACE_SWING (mirrored
      //    below — see §CPE_PACE_SWING_SOFTEN, 1.45 as of 2026-08-03) x the nominal, and the
      //    smoothstep ease multiplies that by 1.5. Holding the walk to 1.5x would gate the FEATURE,
      //    not a defect. `1.5 * PACE_SWING` is the same bound the §CPE_EVEN_TURN derivation states,
      //    so this gate is what checks that derivation against the real film.
      //  - IN-PLACE beats (the spin) barely translate at all: mean steps of 1-3cm make the ratio
      //    pure numerical noise (measured 7.8-13.6x on a 2cm mean). A beat that moves less than a
      //    centimetre per frame on average has no meaningful position bound, so it is reported and
      //    not gated. The spin's motion is a TURN, and T2 already owns that.
      const posPeak = (plan) => {
        const n = Math.max(2, Math.round((plan.naturalTotal || dur) * fps));
        const b = plan.beats || {};
        const nSec = plan.naturalTotal || dur;
        const bounds = [
          ['dive', 0, b.dive], ['spin', b.dive, b.spin], ['walk', b.spin, b.out],
          ['rise', b.out, b.rise], ['orbit', b.rise, 1],
        ].filter(x => typeof x[1] === 'number' && typeof x[2] === 'number' && x[2] > x[1]);
        const per = [];
        for (const [name, u0, u1] of bounds) {
          const steps = [];
          for (let i = 1; i < n; i++) {
            const ua = (i - 1) / (n - 1), ub = i / (n - 1);
            if (ub <= u0 || ua > u1) continue;
            const p0 = plan.poseAt(ua), p1 = plan.poseAt(ub);
            steps.push({ d: Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z), u: ub });
          }
          if (steps.length < 3) continue;
          const mean = steps.reduce((a, s) => a + s.d, 0) / steps.length;
          const top = steps.reduce((a, s) => (s.d > a.d ? s : a), steps[0]);
          const bot = steps.reduce((a, s) => (s.d < a.d ? s : a), steps[0]);
          // §CPE_PACE_SWING_SOFTEN (2026-08-03): mirrored from CINEMA_PACE_SWING in effects.js —
          // keep in sync, this witness has no way to import the source constant.
          const PACE_SWING = 1.45;                      // the user's dial, mirrored from effects.js
          const shape = (name === 'walk') ? 1.5 * PACE_SWING : 1.5;
          // The spin is an IN-PLACE turn by definition, not a traverse — it pivots on the settle
          // point. Exempted by name rather than by a magnitude threshold, because a threshold would
          // just be a picked number that happens to straddle the three buildings (measured means:
          // Duplex 0.01m, Terminal 0.02m, Hospital 0.03m per frame). Its motion is rotational and
          // T2 gates it; its position numbers are printed so the exemption stays visible.
          const inPlace = (name === 'spin');
          // §CPE_PACE_FLOOR — the SLOW side. PACE_SWING is a range, so the walk may not crawl
          // below nominal/SWING either. A stall reads as a pause in the film ("2 secs pausing
          // there", user, Hospital); T5 only ever had a ceiling.
          //
          // It CANNOT be measured against the beat mean. Every beat is a smoothstep of its own
          // time fraction, so its first and last frames legitimately approach zero speed — that
          // ease is what makes the seams smooth. A flat floor flags the ease-out and reports a
          // stall at the walk's own end (measured: min=0.000m at u=0.524, which IS beats.out).
          // So compare each frame against what the ease alone predicts THERE:
          //     expected(e) = mean x smoothstep'(e) = mean x 6e(1-e)
          // and the stall test is measured/expected < 1/PACE_SWING. Exact at every point, and it
          // cannot be fooled by the ramps. Frames where the ease itself predicts under 5% of mean
          // are skipped — there the ratio is 0/0 and carries no information.
          let slowest = null;
          if (name === 'walk') {
            for (const st of steps) {
              const e = (st.u - u0) / (u1 - u0);
              const expect = mean * 6 * e * (1 - e);
              if (expect < 0.05 * mean) continue;
              const r = st.d / expect;
              if (!slowest || r < slowest.r) slowest = { r, u: st.u, d: st.d, expect };
            }
          }
          per.push({ beat: name, mean, peak: top.d, at: top.u, inPlace, shape,
                     min: bot.d, minAt: bot.u, slowest, swing: PACE_SWING,
                     cap: shape * 1.1 * mean, ratio: mean > 1e-9 ? top.d / mean : 0 });
        }
        return per;
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
        return { bows, turn: turnPeak(plan), pos: posPeak(plan), flown: flow.length,
                 beats: plan.beats || plan.sec || null };
      };

      return { hostile: run(hostile), seeded: run(seeded) };
    }, DUR, FPS, CAP_DEG);

    const H = res.hostile;
    const unread = H.bows.filter(b => b.fanMin === null || b.fanMin >= 59.99);
    const rescued = unread.filter(b => b.bowRay !== null && b.bowRay < 59.99);
    const stuck = unread.filter(b => !(b.bowRay !== null && b.bowRay < 59.99));

    // T1 RETIRED 2026-07-27 — reported, no longer gated. It asserted the BOW-RAY RESCUE hypothesis:
    // that a wider corner was what the jerk needed. Measurement killed that twice over. First the
    // cap was shown never to bind (Duplex bows 0.26/0.29m against 0.86/0.87m of MEASURED clearance
    // — k never shrinks, so there was nothing for a rescue to unlock). Then the jerk turned out not
    // to be a corner-width problem at all: it was frames spaced evenly in DISTANCE (§CPE_EVEN_TURN)
    // and a discontinuous Beat2→3 seam (§CPE_SEAM_CONTINUOUS), and fixing those two took the hostile
    // peak to 6.2/7.5 deg/frame with the bows untouched.
    // Kept as an INFO line, not deleted: the unread-join count is still worth seeing, and T3 below
    // still GATES the doctrine that matters (an unreadable join must not be treated as open space).
    console.log(`  INFO  T1 retired (bow-ray rescue — disproven): ${unread.length}/${H.bows.length} join(s) ` +
      `the fan could not read; ${rescued.length} would have been bow-ray readable. Bows: ` +
      (H.bows.map(b => `join${b.i}=${b.bow.toFixed(2)}m`).join(' ') || 'none'));

    P(`T2 peak gaze sweep over the whole film stays under ${CAP_DEG} deg/frame on a hostile layout`,
      H.turn.peak <= CAP_DEG,
      `peak=${H.turn.peak.toFixed(1)} deg/frame at u=${H.turn.peakT.toFixed(3)} (gaze pitch there ` +
      `${H.turn.peakPitch.toFixed(1)}deg), total sweep ${H.turn.total.toFixed(0)}deg over ${H.turn.frames} ` +
      `frames (mean ${(H.turn.total / H.turn.frames).toFixed(1)})\n` +
      `          yaw-only for reference: ${H.turn.yawPeak.toFixed(1)} at u=${H.turn.yawPeakT.toFixed(3)} ` +
      `where pitch=${H.turn.yawPeakPitch.toFixed(1)}deg — yaw is degenerate above ~80deg pitch, which is ` +
      `why it is reported and not gated\n          beats: ${JSON.stringify(H.beats)}`);

    // T5 — the POSITION half of §CPE_JERK_DEFINITION, the user's own first-named symptom. Proves
    // or disproves: does any beat move the camera further in one frame than a smooth traverse of
    // that same beat could? Each beat is held to 1.5x its OWN mean step (smoothstep's peak
    // derivative) + 10%, so the cap is derived from the beat, never from a picked number.
    const bad = H.pos.filter(p => !p.inPlace && p.peak > p.cap);
    P('T5 no beat steps further in one frame than its own shape allows (1.5x mean; the walk 2.4x, being cost-parameterized)',
      bad.length === 0,
      H.pos.map(p => `${p.beat}: peak=${p.peak.toFixed(2)}m mean=${p.mean.toFixed(2)}m ` +
        `(${p.ratio.toFixed(1)}x of ${p.shape.toFixed(1)}x allowed, cap ${p.cap.toFixed(2)}m) at u=${p.at.toFixed(3)}` +
        (p.inPlace ? '  [in-place beat — reported, not gated]' : '') +
        (!p.inPlace && p.peak > p.cap ? '  <-- VIOLATION' : '')).join('\n          '));

    // T6 — §CPE_PACE_FLOOR, the slow half of the same range. Proves or disproves the user's
    // "2 secs pausing there in movie": does the walk ever crawl so slowly it reads as a stall?
    const wk = H.pos.find(p => p.beat === 'walk');
    const sl = wk && wk.slowest;
    P(`T6 the walk never crawls below 1/${wk ? wk.swing : 1.45} of what its own ease predicts (PACE_SWING is a RANGE, not just a ceiling)`,
      // Tolerance is the cost table's resolution, not slack for a bad result: the table has 240
      // segments while the film runs 640-1068 frames, so 3-4 frames interpolate inside one segment
      // and a frame can land a fraction under the segment's own bound. 2% covers that; anything
      // larger would be hiding a real stall (an actual one MEASURED 5-8%, not 60%).
      !sl || sl.r >= (1 / wk.swing) * 0.98,
      sl ? `slowest frame is ${(sl.r * 100).toFixed(0)}% of the ease's own prediction at u=${sl.u.toFixed(3)} ` +
           `(moved ${sl.d.toFixed(3)}m, ease predicts ${sl.expect.toFixed(3)}m; floor is ` +
           `${(100 / wk.swing).toFixed(0)}%)` + (sl.r < 1 / wk.swing ? '  <-- VIOLATION (stall)' : '')
         : 'no walk beat measured on this layout');

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
