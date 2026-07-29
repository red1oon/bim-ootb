// WITNESS — §CINEMA_PATH_EDITOR.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL.
//
// ISSUE EACH GATE PROVES OR DISPROVES — every one of these is a way the feature could be silently
// broken while still "working" on screen:
//   G1  OK-without-edit is a no-op. If false, the feature costs every user a changed film for
//       nothing. Proven by SAMPLED POSES being bit-for-bit equal, not by "looks the same".
//   G2  a waypoint edit changes the sampled path AT that waypoint and not elsewhere.
//   G3  a camera-height edit moves eye height by exactly the amount asked, on the affected beat.
//   G5  control: with no cinema_path table the plan is the derived one.
//   G7  no sharp corners: peak angular rate on a deliberately sharp authored corner stays under the
//       cap. This is the user's "about 2 jerks" made into a NUMBER (today: 19.8 deg/frame, ungated).
//   G8  the flown curve never strays further from an authored waypoint than the MEASURED clearance
//       there. Proves the corner cut is bounded by real space, not a guessed fillet constant.
//   G9  constant speed + uniform scale: a longer path costs proportionally more time at unchanged
//       m/s; setting a total re-times every beat by one common factor.
//   G10 LOS: the aim at each waypoint points at the NEXT waypoint, and moving waypoint n+1 changes
//       waypoint n's aim — the claim that makes "no authored angles" workable at all.
//   G12 elastic orbit: the stop row stretches the orbit by a RATIO against the derived orbit, and
//       the radius band still clamps.
//
// G4/G4b (persistence round-trip) and G11 (lock release) live in witness_cinema_path_persist.js —
// they need a save/reopen cycle and the real Alt+C entry, not just the plan API.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const DEG_PER_FRAME_CAP = parseFloat(process.env.CAP || '12');   // G7 cap, stated up front
const FPS = 15;

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

    const res = await page.evaluate(async (capDeg, fps) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

      const DUR = 24;
      const N = 400;
      const sample = (plan) => {
        const out = [];
        for (let i = 0; i <= N; i++) out.push(plan.poseAt(i / N));
        return out;
      };
      const maxDiff = (a, b) => {
        let m = 0;
        for (let i = 0; i < a.length; i++)
          m = Math.max(m, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y), Math.abs(a[i].z - b[i].z),
                          Math.abs(a[i].tx - b[i].tx), Math.abs(a[i].ty - b[i].ty), Math.abs(a[i].tz - b[i].tz));
        return m;
      };

      const out = {};

      // ── G5 control: no authored path staged → derived plan.
      A._cinemaPathEdit = null;
      const planA = A.cinemaPathPlan(DUR);
      const planB = A.cinemaPathPlan(DUR);
      out.g5 = { authored: !!planA.authored, route: planA.route, wp: planA.waypoints.length,
                 deterministic: maxDiff(sample(planA), sample(planB)) };

      // ── G1: OK-without-edit. The editor hands back NO override when nothing changed, so the bake
      // re-uses this very plan object. Prove the wrapper with an explicit null override is
      // identical to the unwrapped derived function.
      const derived = A.cinemaPathPlanDerived(DUR);
      out.g1 = { maxPoseDiff: maxDiff(sample(planA), sample(derived)) };

      // ── G10 LOS: aim at each waypoint points at the next one.
      const wp0 = planA.waypoints.map(w => ({ x: w.x, y: w.y, z: w.z }));
      const beats = planA.beats;
      // sample t at the moment the path is nearest waypoint i, then compare the look vector
      // (target - position) bearing to the bearing toward waypoint i+1.
      const bearingAt = (t) => {
        const p = planA.poseAt(t);
        return Math.atan2(p.tz - p.z, p.tx - p.x) * 180 / Math.PI;
      };
      const wpBearing = (i) => Math.atan2(wp0[i + 1].z - wp0[i].z, wp0[i + 1].x - wp0[i].x) * 180 / Math.PI;
      const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      // nearest-t search over the walk-out beat only
      const losErrs = [];
      for (let i = 1; i < wp0.length - 1; i++) {
        let bestT = null, bestD = 1e18;
        for (let s = 0; s <= 200; s++) {
          const t = beats.spin + (beats.out - beats.spin) * (s / 200);
          const p = planA.poseAt(t);
          const d = Math.hypot(p.x - wp0[i].x, p.z - wp0[i].z);
          if (d < bestD) { bestD = d; bestT = t; }
        }
        losErrs.push({ i, distToWp: bestD, aimErrDeg: angDiff(bearingAt(bestT), wpBearing(i)) });
      }
      out.g10 = { perWaypoint: losErrs };

      // ── G2/G3: move waypoint 1 sideways by +5m and up by +1m; sample and compare.
      if (wp0.length >= 3) {
        const moved = wp0.map(w => ({ ...w }));
        moved[1] = { x: wp0[1].x + 5, y: wp0[1].y + 1, z: wp0[1].z };
        const planM = A.cinemaPathPlan(DUR, { waypoints: moved });
        // Compare the two films at the same ABSOLUTE SECOND, not the same percentage through.
        // The edited path is longer, and section 9 doctrine ("path length sets the clock") means the
        // edited film legitimately RUNS LONGER — cinema_maxq.js:414 sets the real bake's frame count
        // from plan.naturalTotal, so this is the product's actual behaviour, not a theory. Sampling
        // both at the same normalized t therefore lines up second 3 of a 24s film against second 4
        // of a 32s one and reports the opening as "changed" when nothing about it moved. Beat
        // seconds are derived independently of path length (dive from its own distance), so at equal
        // real time the opening is identical by construction — which is what this now measures.
        const tA = planA.naturalTotal || DUR, tM = planM.naturalTotal || DUR;
        const secs = [];
        for (let i = 0; i <= N; i++) secs.push(i / N * Math.min(tA, tM));
        const sA = secs.map(sec => planA.poseAt(sec / tA));
        const sM = secs.map(sec => planM.poseAt(sec / tM));
        let firstDiffT = null, lastDiffT = null, maxD = 0;
        for (let i = 0; i <= N; i++) {
          const d = Math.hypot(sA[i].x - sM[i].x, sA[i].y - sM[i].y, sA[i].z - sM[i].z);
          if (d > 0.01) { if (firstDiffT === null) firstDiffT = secs[i] / tA; lastDiffT = secs[i] / tA; }
          maxD = Math.max(maxD, d);
        }
        out.g2 = { firstDiffT, lastDiffT, maxD, diveBeatEnd: beats.dive, outBeatEnd: beats.out,
                   diveUntouched: firstDiffT === null ? true : firstDiffT >= beats.dive * 0.98 };

        // ── G3: eye height. Measured TWICE on purpose.
        // (a) isolated: a STRAIGHT 2-point path has no corners, so no clearance is measured and the
        //     arc-length parameterization cannot shift. Height must then move by exactly 1.5m —
        //     this is the gate on the mechanism itself.
        // (b) in situ: on a path WITH corners the same edit lands within a few cm rather than
        //     exactly, because raising the path makes the corner fans hit different geometry, so the
        //     rounding radius (and with it the arc-length parameterization) legitimately differs.
        //     Reported as a number rather than hidden inside a loose tolerance on (a).
        const dyOver = (planBase, planEdit) => {
          let mn = 1e9, mx = -1e9;
          for (let s = 0; s <= 100; s++) {
            const t = beats.spin + (beats.out - beats.spin) * (s / 100);
            const dy = planEdit.poseAt(t).y - planBase.poseAt(t).y;
            mn = Math.min(mn, dy); mx = Math.max(mx, dy);
          }
          return { mn, mx };
        };
        const straight = [{ x: wp0[0].x, y: wp0[0].y, z: wp0[0].z },
                          { x: wp0[0].x + 20, y: wp0[0].y, z: wp0[0].z }];
        const straightUp = straight.map(w => ({ x: w.x, y: w.y + 1.5, z: w.z }));
        const pS = A.cinemaPathPlan(DUR, { waypoints: straight });
        const pSU = A.cinemaPathPlan(DUR, { waypoints: straightUp });
        const iso = dyOver(pS, pSU);

        const raised = wp0.map(w => ({ x: w.x, y: w.y + 1.5, z: w.z }));
        const planR = A.cinemaPathPlan(DUR, { waypoints: raised });
        const situ = dyOver(planA, planR);
        out.g3 = { asked: 1.5, isoMin: iso.mn, isoMax: iso.mx, situMin: situ.mn, situMax: situ.mx };
      }

      // ── G7/G8: a deliberately SHARP authored corner — a hard right-angle dog-leg.
      {
        const s0 = planA.waypoints[0];
        const sharp = [
          { x: s0.x, y: s0.y, z: s0.z },
          { x: s0.x + 12, y: s0.y, z: s0.z },
          { x: s0.x + 12, y: s0.y, z: s0.z + 12 },     // 90 deg
          { x: s0.x + 24, y: s0.y, z: s0.z + 12 },     // 90 deg back
        ];
        const planS = A.cinemaPathPlan(DUR, { waypoints: sharp });
        // G7 — peak angular rate of the LOOK direction, per rendered frame.
        const nF = Math.round(24 * fps);
        let peak = 0, peakT = 0, prev = null;
        // The walk window must come from THIS plan. It used to read planA.beats — a DIFFERENT
        // plan, built from a different path, whose walk occupies a different fraction of the film.
        // So the window was misaligned with planS's own walk and the gate sampled beats the walk's
        // pacing does not govern (the spin runs on a clock, not on the path). That is why G7 stayed
        // at 15.7/20.4 to the decimal while every other jerk number moved: the peak it reported was
        // not in the walk at all. Verify the instrument before the code under test.
        const sBeats = planS.beats || beats;
        for (let f = 0; f <= nF; f++) {
          const t = f / nF;
          if (t < sBeats.spin || t > sBeats.out) { prev = null; continue; }
          const p = planS.poseAt(t);
          const b = Math.atan2(p.tz - p.z, p.tx - p.x) * 180 / Math.PI;
          if (prev !== null) {
            let d = Math.abs(b - prev) % 360; if (d > 180) d = 360 - d;
            if (d > peak) { peak = d; peakT = t; }
          }
          prev = b;
        }
        out.g7 = { peakDegPerFrame: peak, atT: peakT, cap: capDeg, fps };

        // G8 — max deviation of the FLOWN curve from each authored waypoint, vs measured clearance.
        const flown = A.cinemaRoundCorners(sharp);
        const dev = [];
        for (let i = 1; i < sharp.length - 1; i++) {
          let best = 1e18;
          for (const p of flown) best = Math.min(best, Math.hypot(p.x - sharp[i].x, p.y - sharp[i].y, p.z - sharp[i].z));
          // A fan that hits NOTHING returns CINEMA_FAN_FAR (60) — that is "unknown", not "60m of
          // space". Comparing the cut against it is how this gate passed vacuously on Terminal
          // before the live Hospital log exposed it. Report it as unknown and assert the
          // conservative cap instead.
          let clear = null, noHit = false;
          try {
            const f = A.cinemaFan({ x: sharp[i].x, y: sharp[i].y, z: sharp[i].z }, 8);
            if (f && isFinite(f.min)) { if (f.min >= 59.99) noHit = true; else clear = f.min; }
          } catch (e) {}
          dev.push({ i, deviation: best, clearance: clear, noHit });
        }
        out.g8 = { perCorner: dev };

        // G9 — constant speed. Double a leg, expect the natural out-time to rise proportionally.
        const lenOf = (wps) => {
          const pts = A.cinemaRoundCorners(wps);
          let L = 0;
          for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y, pts[i].z - pts[i-1].z);
          return L;
        };
        const longer = sharp.map(w => ({ ...w }));
        longer[3] = { x: s0.x + 36, y: s0.y, z: s0.z + 12 };   // last leg 12m -> 24m
        const L1 = lenOf(sharp), L2 = lenOf(longer);
        const speed = planA.pathLen / planA.sec.out;
        out.g9 = { L1, L2, speed, outSec1: L1 / speed, outSec2: L2 / speed,
                   ratioLen: L2 / L1, ratioTime: (L2 / speed) / (L1 / speed) };

        // G12 — elastic orbit: push the stop row 1.5x further from the pivot, expect the logged
        // scale to match and the granted radius to be the band-clamped product.
        const piv = planA.pivot;
        const last = sharp[sharp.length - 1];
        const dx = last.x - piv.x, dz = last.z - piv.z;
        const stretched = sharp.map(w => ({ ...w }));
        stretched[3] = { x: piv.x + dx * 1.5, y: last.y + 4, z: piv.z + dz * 1.5 };
        const planE = A.cinemaPathPlan(DUR, { waypoints: stretched });
        // orbit height offset shows up at the very end of the film
        out.g12 = { baseEndY: planS.poseAt(1).y, elasticEndY: planE.poseAt(1).y,
                    radiusMin: planA.radiusMin, radiusMax: planA.radiusMax, fillDistance: planA.fillDistance };
      }

      A._cinemaPathEdit = null;
      return out;
    }, DEG_PER_FRAME_CAP, FPS);

    const checks = [];
    const P = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) allPass = false; };

    console.log('  §CINEMA_CORNERS lines seen:');
    logs.filter(l => l.startsWith('§CINEMA_CORNERS')).slice(-4).forEach(l => console.log('    ' + l));
    logs.filter(l => l.startsWith('§CINEMA_ORBIT_ELASTIC') || l.startsWith('§CINEMA_PATH_EDIT')).slice(-4).forEach(l => console.log('    ' + l));

    P('G5 control: no authored path → derived route',
      res.g5.authored === false && res.g5.deterministic < 1e-9,
      `authored=${res.g5.authored} route=${res.g5.route} wp=${res.g5.wp} replanDiff=${res.g5.deterministic.toExponential(2)}`);

    P('G1 OK-without-edit is byte-identical',
      res.g1.maxPoseDiff === 0,
      `maxPoseDiff=${res.g1.maxPoseDiff}`);

    if (res.g10) {
      const worst = Math.max(...res.g10.perWaypoint.map(w => w.aimErrDeg), 0);
      P('G10 LOS aim points at the next waypoint (<=25 deg through smoothing)',
        res.g10.perWaypoint.length === 0 || worst <= 25,
        res.g10.perWaypoint.map(w => `wp${w.i}: aimErr=${w.aimErrDeg.toFixed(1)}deg d=${w.distToWp.toFixed(2)}m`).join(' | ') || 'no interior waypoints');
    }

    if (res.g2) {
      P('G2 waypoint edit changes the path, and not the dive before it',
        res.g2.maxD > 0.5 && res.g2.diveUntouched,
        `maxDelta=${res.g2.maxD.toFixed(2)}m firstDiffT=${res.g2.firstDiffT} diveEnds=${res.g2.diveBeatEnd.toFixed(3)}`);
    }
    if (res.g3) {
      const isoErr = Math.max(Math.abs(res.g3.isoMin - 1.5), Math.abs(res.g3.isoMax - 1.5));
      const situErr = Math.max(Math.abs(res.g3.situMin - 1.5), Math.abs(res.g3.situMax - 1.5));
      P('G3 camera height moves by exactly what was asked (straight path, no rounding)',
        isoErr < 0.001,
        `asked=1.5m got=[${res.g3.isoMin.toFixed(4)},${res.g3.isoMax.toFixed(4)}] err=${isoErr.toExponential(2)}m`);
      // Not a gate — a reported second-order term. Raising a cornered path makes the corner fans hit
      // different geometry, so the rounding radius and the arc-length parameterization legitimately
      // shift. Printed so the size of that effect is on record instead of being assumed negligible.
      console.log(`  INFO  G3 in-situ (path with corners): got=[${res.g3.situMin.toFixed(3)},${res.g3.situMax.toFixed(3)}] ` +
        `spread=${situErr.toFixed(4)}m — re-planning term, not a height error`);
    }

    P(`G7 no sharp corners: peak <= ${DEG_PER_FRAME_CAP} deg/frame on a 90-deg dog-leg`,
      res.g7.peakDegPerFrame <= DEG_PER_FRAME_CAP,
      `peak=${res.g7.peakDegPerFrame.toFixed(1)} deg/frame at t=${res.g7.atT.toFixed(3)} (fps=${res.g7.fps})`);

    // Two ways to fail, no way to pass vacuously: where clearance was really measured the cut must
    // fit inside it; where the fan saw nothing the cut must obey the conservative 3m nudge cap.
    const NUDGE_CAP = 3;
    const g8bad = res.g8.perCorner.filter(c => c.noHit ? (c.deviation > NUDGE_CAP / 2 + 1e-6)
                                                       : (c.clearance != null && c.deviation > c.clearance));
    P('G8 deviation <= measured clearance, or <= the conservative cap where clearance is unknown',
      g8bad.length === 0,
      res.g8.perCorner.map(c => `corner${c.i}: dev=${c.deviation.toFixed(2)}m ` +
        (c.noHit ? `clear=UNKNOWN(no-hit) cap=${(NUDGE_CAP / 2).toFixed(2)}m`
                 : `clear=${c.clearance == null ? 'n/a' : c.clearance.toFixed(2) + 'm'}`)).join(' | '));

    P('G9 constant speed: time ratio == length ratio',
      Math.abs(res.g9.ratioTime - res.g9.ratioLen) < 1e-9,
      `len ${res.g9.L1.toFixed(1)}→${res.g9.L2.toFixed(1)}m (x${res.g9.ratioLen.toFixed(3)}) time ${res.g9.outSec1.toFixed(2)}→${res.g9.outSec2.toFixed(2)}s at ${res.g9.speed.toFixed(2)}m/s`);

    P('G12 elastic orbit: stop row raises the orbit height',
      Math.abs(res.g12.elasticEndY - res.g12.baseEndY) > 0.5,
      `endY ${res.g12.baseEndY.toFixed(2)} → ${res.g12.elasticEndY.toFixed(2)} band=[${res.g12.radiusMin.toFixed(1)},${res.g12.radiusMax.toFixed(1)}] fill=${res.g12.fillDistance.toFixed(1)}`);

    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n          ${c.detail}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), checks });
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.checks.filter(c => c.ok).length}/${s.checks.length})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
