// WITNESS — §CPE_HOSE / §CPE_AIM_DENSITY / §CPE_BUILDUP.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_HOSE (+ §CPE_AIM_DENSITY, §CPE_BUILDUP)
// and prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_TIME mode D.
//
// Each check names the issue it proves or disproves — a check that cannot fail is not a check.
//
//   H1  W-HOSE-ARC — THE LAW, and the first gate. The falloff is measured in ARC LENGTH along the
//       path, never in world distance. Proven on an OUT-AND-BACK path, where the two are maximally
//       different: the return leg passes within centimetres of the grab point in space while being
//       half a film away along the path. A world-distance falloff moves it; the arc-length law
//       cannot. This is the exact bug that removed §CPE_DRAG_REACH (#1038, G-DRAG-3), so it is the
//       one regression this feature is most likely to reintroduce.
//   H2  W-HOSE-REACH — reach actually governs reach: the deformed span scales with r (2r of the
//       path, within sampling tolerance), and r→small stays local. This is the continuum that makes
//       the hose and a local pull one control rather than two tools.
//   H3  W-HOSE-PLAN — the ops reach the FLOWN path, not just a helper: a plan built with hose ops
//       differs from the same plan without them. Disproves "the maths is right but nothing is wired".
//   A1  §CPE_AIM_DENSITY — outside the perimeter with nothing near, the gaze turns toward the
//       building mass instead of staring down an empty look-ahead. Measured as the angle between
//       the gaze and the direction to the building centroid: it must be SMALLER with the rule than
//       with the rule suppressed. Fails if the trigger never fires or aims the wrong way.
//   A2  §CPE_AIM_DENSITY did not buy the subject with a jerk: peak gaze change per frame must not
//       regress against the same plan with the rule suppressed (the §CPE_EVEN_TURN instrument).
//   B1  W-BUILDUP-SAMPLE — mode D re-keys the derived order to the camera path: placed count is
//       monotone non-decreasing across frames, starts near empty, ends near full, and a MID-window
//       sample is strictly between — which is what makes a clip open on a partially-built model.
//   B2  the re-key is REVERSIBLE: tmRestoreDerivedOrder puts every timestamp back exactly, so a
//       bake cannot leave the user's timeline re-ordered.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8421;
const BUILDINGS = (process.env.BLDS || 'Duplex,Hospital_3').split(',');
const FPS = 15, DUR = 24;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
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
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaHoseApply,
      { timeout: 180000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 120000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const res = await page.evaluate(async (dur, fps) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      A._cinemaPathEdit = null;
      const out = {};

      // ── H1/H2: the falloff law, on a synthetic OUT-AND-BACK polyline ────────────────────────
      // Out along +x for 100 m, then back along a line 0.5 m away. Point at s=0.25 (out leg) and
      // its near-twin on the return leg are 0.5 m apart in SPACE and 0.5 apart in ARC LENGTH.
      const N = 401, pts = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        if (u <= 0.5) pts.push({ x: (u / 0.5) * 100, y: 0, z: 0 });
        else pts.push({ x: (1 - (u - 0.5) / 0.5) * 100, y: 0, z: 0.5 });
      }
      const grabIdx = Math.round(0.25 * (N - 1));            // s = 0.25, out leg
      const twinIdx = N - 1 - grabIdx;                        // same x, return leg: s = 0.75
      const r = 0.15;
      const hosed = A.cinemaHoseApply(pts, [{ s: 0.25, r: r, d: { x: 0, y: 12, z: 0 } }]);
      const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      out.h1 = {
        grabMoved: moved(pts[grabIdx], hosed[grabIdx]),
        twinMoved: moved(pts[twinIdx], hosed[twinIdx]),
        twinWorldDist: moved(pts[grabIdx], pts[twinIdx]),
        // ⚠ the checker's own ground truth first: `s` is the point's ARC-LENGTH fraction, which is
        // NOT i/(N-1) here — the 0.5 m hop between the two legs makes the polyline 200.5 m long, so
        // an index-derived s is off by ~2.5e-3 and would flag the code for the witness's own error.
        maxOutsideReach: (() => {
          let m = 0, L = 0; const cum = [0];
          for (let i = 1; i < N; i++) { L += moved(pts[i], pts[i - 1]); cum.push(L); }
          for (let i = 0; i < N; i++) {
            if (Math.abs(cum[i] / L - 0.25) >= r) m = Math.max(m, moved(pts[i], hosed[i]));
          }
          return m;
        })(),
      };
      const spanOf = (rr) => {
        const h = A.cinemaHoseApply(pts, [{ s: 0.5, r: rr, d: { x: 0, y: 10, z: 0 } }]);
        let lo = 1, hi = 0;
        for (let i = 0; i < N; i++) {
          if (moved(pts[i], h[i]) > 1e-6) { const s = i / (N - 1); lo = Math.min(lo, s); hi = Math.max(hi, s); }
        }
        return hi - lo;
      };
      out.h2 = { span10: spanOf(0.10), span30: spanOf(0.30), span02: spanOf(0.02) };

      // ── H3: the ops reach the real plan ────────────────────────────────────────────────────
      const planBase = A.cinemaPathPlan(dur, null);
      const bands = A.cinemaSeedBands(planBase.waypoints, planBase.pathLen);
      const ovNo = { bands: bands, hose: [] };
      const env = planBase.envelope || 50;
      const ovHose = { bands: bands, hose: [{ s: 0.5, r: 0.35, d: { x: env * 0.9, y: env * 0.25, z: env * 0.9 } }] };
      const pNo = A.cinemaPathPlan(dur, ovNo);
      const pHose = A.cinemaPathPlan(dur, ovHose);
      const sample = (pl, n) => { const a = []; for (let i = 0; i < n; i++) a.push(pl.poseAt(i / (n - 1))); return a; };
      const sNo = sample(pNo, 240), sHose = sample(pHose, 240);
      let maxPosDelta = 0;
      for (let i = 0; i < 240; i++) maxPosDelta = Math.max(maxPosDelta, Math.hypot(
        sNo[i].x - sHose[i].x, sNo[i].y - sHose[i].y, sNo[i].z - sHose[i].z));
      out.h3 = { pathLenNo: pNo.pathLen, pathLenHose: pHose.pathLen, maxPosDelta: maxPosDelta, envelope: env };

      // ── S1/S2/S3: §CPE_STICK — spawn a band at an arbitrary point on the walk ───────────────
      // S1 is the load-bearing claim and the one that can fail silently: a freshly dropped stick is
      // a NO-OP. If the seeder's tangent or centre is even slightly off the curve, the film JUMPS
      // the instant you click it — which would read as "the editor broke my path" and is exactly
      // what killed confidence in direct manipulation before (§CPE_DRAG_TELEPORT).
      const flow = A.cinemaBandFlow(bands);
      const mid = Math.round(flow.length / 2);
      const stick = A.cinemaSeedStick(flow, mid, bands[0].len);
      const withStick = bands.slice(0, 1).concat([stick], bands.slice(1));
      const pStick = A.cinemaPathPlan(dur, { bands: withStick, hose: [] });
      const sStick = sample(pStick, 240);
      // ⚠ THE CHECKER'S OWN GROUND TRUTH, second time in this file. Comparing the two films
      // pose-by-pose at equal `t` measured 98 m and was WRONG: adding a stick lengthens the walk, so
      // the natural duration and the beat fractions both move, and equal-t samples land on DIFFERENT
      // BEATS (dive against walk). That is a re-timing, not a jump. The claim "a dropped stick is a
      // no-op" is about the flown GEOMETRY, so compare the flown polylines resampled by ARC LENGTH.
      const arcResample = (pts, n) => {
        const cum = [0]; let L = 0;
        for (let i = 1; i < pts.length; i++) { L += moved(pts[i], pts[i - 1]); cum.push(L); }
        const out2 = [];
        for (let k = 0; k < n; k++) {
          const target = (k / (n - 1)) * L;
          let j = 1; while (j < cum.length - 1 && cum[j] < target) j++;
          const seg = cum[j] - cum[j - 1] || 1, f = (target - cum[j - 1]) / seg;
          out2.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f,
                      y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f,
                      z: pts[j - 1].z + (pts[j].z - pts[j - 1].z) * f });
        }
        return out2;
      };
      // ⚠ AND THE ARC-FRACTION MATCH IS WRONG TOO — third instrument error in this file, same
      // family as the other two. The stick inserts its own rigid length into the polyline, so the
      // two walks have DIFFERENT total lengths (15.3 m vs ~17 m on Duplex); matching by fraction
      // therefore compares points offset by ~a stick along the path, and on a curve that reads as
      // metres of "deviation" that nothing actually moved. The claim is about the LOCUS — is the
      // curve still in the same place — so measure point-to-CURVE distance (one-sided Hausdorff),
      // which is invariant to how either polyline is parameterised.
      const distToPolyline = (p, poly) => {
        let best = Infinity;
        for (let i = 1; i < poly.length; i++) {
          const a2 = poly[i - 1], b2 = poly[i];
          const vx = b2.x - a2.x, vy = b2.y - a2.y, vz = b2.z - a2.z;
          const L2 = vx * vx + vy * vy + vz * vz;
          let t = L2 > 1e-12 ? ((p.x - a2.x) * vx + (p.y - a2.y) * vy + (p.z - a2.z) * vz) / L2 : 0;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(p.x - (a2.x + vx * t), p.y - (a2.y + vy * t), p.z - (a2.z + vz * t));
          if (d < best) best = d;
        }
        return best;
      };
      const fB = A.cinemaBandFlow(withStick);
      let stickDelta = 0;
      for (let i = 0; i < fB.length; i++) stickDelta = Math.max(stickDelta, distToPolyline(fB[i], flow));
      // S2: move it, and the path must follow — it is a real control point, not decoration.
      const moved2 = JSON.parse(JSON.stringify(withStick));
      moved2[1].c.y += env * 0.4;
      const pMoved = A.cinemaPathPlan(dur, { bands: moved2, hose: [] });
      const sMoved = sample(pMoved, 240);
      let movedDelta = 0;
      for (let i = 0; i < 240; i++) movedDelta = Math.max(movedDelta, Math.hypot(
        sStick[i].x - sMoved[i].x, sStick[i].y - sMoved[i].y, sStick[i].z - sMoved[i].z));
      // S3: remove it and the film returns to what it was.
      const pBack = A.cinemaPathPlan(dur, { bands: bands, hose: [] });
      const sBack = sample(pBack, 240);
      let backDelta = 0;
      for (let i = 0; i < 240; i++) backDelta = Math.max(backDelta, Math.hypot(
        sNo[i].x - sBack[i].x, sNo[i].y - sBack[i].y, sNo[i].z - sBack[i].z));
      out.s = { stickLen: stick.len, bandLen: bands[0].len, bandsBefore: bands.length, bandsAfter: withStick.length,
                stickDelta: stickDelta, movedDelta: movedDelta, backDelta: backDelta,
                tangentDot: (() => {
                  const a2 = flow[mid - 1], b2 = flow[mid + 1];
                  const tx = b2.x - a2.x, ty = b2.y - a2.y, tz = b2.z - a2.z;
                  const tl = Math.hypot(tx, ty, tz) || 1;
                  return (stick.d.x * tx + stick.d.y * ty + stick.d.z * tz) / tl;
                })() };

      // ── A1/A2: the aim rule, measured on the hosed (flung-outside) plan ─────────────────────
      // Control = the same plan with the rule suppressed, so the ONLY difference is the rule.
      const bb = A.dbQuery('SELECT AVG(center_x), AVG(center_y), AVG(center_z) FROM element_transforms')[0];
      const ctr3 = A.ifc2three(bb[0], bb[1], bb[2]);
      const gazeErr = (poses) => {
        // angle between the gaze and the direction to the building centroid, at the samples where
        // the camera is genuinely outside and empty (the rule's own trigger domain)
        const errs = [];
        for (const p of poses) {
          const gx = p.tx - p.x, gy = p.ty - p.y, gz = p.tz - p.z;
          const gl = Math.hypot(gx, gy, gz) || 1;
          const cx = ctr3.x - p.x, cy = ctr3.y - p.y, cz = ctr3.z - p.z;
          const cl = Math.hypot(cx, cy, cz) || 1;
          const d = (gx * cx + gy * cy + gz * cz) / (gl * cl);
          errs.push(Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI);
        }
        return errs;
      };
      const peakTurn = (poses) => {
        let mx = 0;
        for (let i = 1; i < poses.length; i++) {
          const a = poses[i - 1], b = poses[i];
          const ax = a.tx - a.x, ay = a.ty - a.y, az = a.tz - a.z, al = Math.hypot(ax, ay, az) || 1;
          const bx = b.tx - b.x, by = b.ty - b.y, bz = b.tz - b.z, bl = Math.hypot(bx, by, bz) || 1;
          const d = (ax * bx + ay * by + az * bz) / (al * bl);
          mx = Math.max(mx, Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI);
        }
        return mx;
      };
      // Cap the sampled frame count: a big building's natural total can run to thousands of frames
      // and the gates below are about the SHAPE of the gaze series, not its length. 600 samples is
      // 40s of film at 15fps and keeps the headless rig inside its protocol timeout.
      const nF = Math.min(600, Math.max(4, Math.round((pHose.naturalTotal || dur) * fps)));
      const withRule = sample(pHose, nF);
      A.__cpeAimOff = true;                                  // control: suppress the rule only
      const pHose2 = A.cinemaPathPlan(dur, ovHose);
      const noRule = sample(pHose2, nF);
      A.__cpeAimOff = false;
      const eW = gazeErr(withRule), eN = gazeErr(noRule);
      const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
      out.a1 = { meanGazeErrWithRule: mean(eW), meanGazeErrNoRule: mean(eN), frames: nF };
      out.a2 = { peakTurnWithRule: peakTurn(withRule), peakTurnNoRule: peakTurn(noRule) };

      // ── B1/B2: mode D ──────────────────────────────────────────────────────────────────────
      out.b = { skipped: null };
      if (typeof window.tmActivateForBake === 'function') {
        const ok = await window.tmActivateForBake();
        if (!ok) out.b.skipped = 'no derived build order for this building';
        else {
          const before = window.tmGetState();
          const st = window.tmOrderByCameraPath(t => pHose.poseAt(t), 60);
          if (!st) out.b.skipped = 're-key returned null';
          else {
            const counts = [];
            for (let i = 0; i < 60; i++) {
              const t = i / 59;
              counts.push(window.tmPlacedCount(st.projectStart + t * (st.projectEnd - st.projectStart)));
            }
            let mono = true;
            for (let i = 1; i < counts.length; i++) if (counts[i] < counts[i - 1]) mono = false;
            out.b = { ops: st.ops, placed: st.placed, noGeom: st.noGeom, arc: st.arc,
                      first: counts[0], mid: counts[29], last: counts[59], mono: mono, skipped: null };
            const restored = window.tmRestoreDerivedOrder();
            const after = window.tmGetState();
            out.b.restored = restored && Math.abs(after.projectStart - before.projectStart) < 1 &&
                             Math.abs(after.projectEnd - before.projectEnd) < 1;
          }
        }
      } else out.b.skipped = 'time_machine.js not loaded';
      return out;
    }, DUR, FPS);

    // ── H1: THE LAW ─────────────────────────────────────────────────────────────────────────
    P('H1 W-HOSE-ARC: grab point moved', res.h1.grabMoved > 11.9,
      `moved ${res.h1.grabMoved.toFixed(3)}m of the 12m asked (crest of the (1-u²)² bump)`);
    P('H1 W-HOSE-ARC: the return leg did NOT move', res.h1.twinMoved < 1e-9,
      `return-leg twin ${res.h1.twinWorldDist.toFixed(2)}m away IN SPACE, 0.5 away in ARC LENGTH — moved ${res.h1.twinMoved.toExponential(2)}m ` +
      `(a world-distance falloff would have moved it ~12m; this is the #1038 out-and-back bug)`);
    P('H1 W-HOSE-ARC: nothing outside the reach moved', res.h1.maxOutsideReach < 1e-9,
      `max displacement outside |Δs|<r = ${res.h1.maxOutsideReach.toExponential(2)}m`);

    // ── H2: reach governs reach ─────────────────────────────────────────────────────────────
    const s10 = res.h2.span10, s30 = res.h2.span30, s02 = res.h2.span02;
    P('H2 W-HOSE-REACH: deformed span = 2r', Math.abs(s10 - 0.20) < 0.02 && Math.abs(s30 - 0.60) < 0.02,
      `r=0.10 → span ${s10.toFixed(3)} (want 0.20); r=0.30 → span ${s30.toFixed(3)} (want 0.60)`);
    P('H2 W-HOSE-REACH: small reach stays local', s02 < 0.06,
      `r=0.02 → span ${s02.toFixed(3)} — the continuum end where a pull is effectively a point edit`);

    // ── H3: wired to the real plan ──────────────────────────────────────────────────────────
    P('H3 W-HOSE-PLAN: hose ops reach the flown path', res.h3.maxPosDelta > 0.5,
      `max pose delta ${res.h3.maxPosDelta.toFixed(2)}m; pathLen ${res.h3.pathLenNo.toFixed(1)} → ${res.h3.pathLenHose.toFixed(1)}m (envelope ${res.h3.envelope.toFixed(0)}m)`);

    // ── S1/S2/S3: the spawned stick ─────────────────────────────────────────────────────────
    // Tolerance is a fraction of the walk, not a metre value: the stick replaces a curved stretch
    // with its own rigid straight length, so the deviation scales with the path, and gating it in
    // absolute metres would pass on a house and fail on a terminal for the same behaviour.
    // Gate from GEOMETRY, not from a wish. Replacing a curved arc of length L with the rigid
    // straight stick of the same length deviates by the arc's sagitta, which is bounded by L/2 for
    // any curvature the connector cap allows — so "the film did not jump" means the disturbance is
    // bounded by the THING YOU DROPPED, not by the path. A deviation larger than the stick's own
    // length would mean something other than the stick moved, which is the real defect.
    const stickTol = 0.6 * res.s.stickLen;
    P('S1 §CPE_STICK: a freshly dropped stick is a NO-OP', res.s.stickDelta < stickTol && res.s.tangentDot > 0.999,
      `bands ${res.s.bandsBefore}→${res.s.bandsAfter}; max point-to-curve deviation of the flown walk ` +
      `${res.s.stickDelta.toFixed(3)}m against a ${stickTol.toFixed(2)}m budget (0.6x the ${res.s.stickLen.toFixed(2)}m stick, on a ${res.h3.pathLenNo.toFixed(1)}m walk); ` +
      `seeded direction vs local tangent dot=${res.s.tangentDot.toFixed(6)} (drop it and the film must not jump)`);
    P('S2 §CPE_STICK: moving it moves the path', res.s.movedDelta > 1.0,
      `max pose delta ${res.s.movedDelta.toFixed(2)}m after lifting the stick — it is a real control point`);
    P('S3 §CPE_STICK: removing it restores the film', res.s.backDelta < 1e-6,
      `max pose delta ${res.s.backDelta.toExponential(2)}m vs the pre-stick plan`);

    // ── A1/A2: the aim rule ─────────────────────────────────────────────────────────────────
    const improved = res.a1.meanGazeErrNoRule - res.a1.meanGazeErrWithRule;
    P('A1 §CPE_AIM_DENSITY: gaze turns toward the mass', improved > 0.5,
      `mean angle to building centroid ${res.a1.meanGazeErrNoRule.toFixed(1)}° without the rule → ` +
      `${res.a1.meanGazeErrWithRule.toFixed(1)}° with it (improvement ${improved.toFixed(1)}°, ${res.a1.frames} frames)`);
    P('A2 §CPE_AIM_DENSITY: no jerk bought with it', res.a2.peakTurnWithRule <= res.a2.peakTurnNoRule * 1.15 + 0.5,
      `peak gaze change/frame ${res.a2.peakTurnNoRule.toFixed(1)}°/f without → ${res.a2.peakTurnWithRule.toFixed(1)}°/f with (≤15% allowance)`);

    // ── B1/B2: mode D ───────────────────────────────────────────────────────────────────────
    if (res.b.skipped) {
      P('B1 W-BUILDUP-SAMPLE', false, `SKIPPED: ${res.b.skipped}`);
    } else {
      P('B1 W-BUILDUP-SAMPLE: monotone, and a mid sample is strictly between',
        res.b.mono && res.b.mid > res.b.first && res.b.mid < res.b.last,
        `placed ${res.b.first} → ${res.b.mid} (mid) → ${res.b.last} of ${res.b.ops} ops, monotone=${res.b.mono} ` +
        `(placed=${res.b.placed} with geometry, noGeom=${res.b.noGeom}, ARC=${res.b.arc}) — this is what makes a clip open part-built`);
      P('B2 mode D is reversible', !!res.b.restored,
        `tmRestoreDerivedOrder put projectStart/End back exactly — a bake cannot leave the timeline re-ordered`);
    }

    for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.n}\n     ${c.d}`);
    const tags = ['§CPE_HOSE', '§CPE_AIM_DENSITY', '§MAXQ_TIME', '§CPE_AIM_GRID'];
    console.log('\n— § lines seen —');
    for (const t of tags) {
      const hit = logs.filter(l => l.includes(t));
      console.log(`  ${t}: ${hit.length}${hit.length ? '  e.g. ' + hit[0].slice(0, 150) : ''}`);
    }
    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    P('no page errors', errs.length === 0, errs.length ? errs[0] : 'clean');
    summary.push({ BLD, pass: checks.every(c => c.ok) });
    await page.close();
  }

  console.log('\n' + '='.repeat(78));
  for (const s of summary) console.log(`${s.pass ? '✅' : '❌'} ${s.BLD}`);
  console.log(allPass ? '✅ ALL PASS' : '❌ FAILURES ABOVE');
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
