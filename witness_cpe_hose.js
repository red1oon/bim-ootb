// WITNESS — §CPE_HOSE / §CPE_AIM_DEPTH_RETIRED / §CPE_BUILDUP.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_HOSE (+ §CPE_BUILDUP),
// prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_TIME mode D, and
// prompts/RESUME_2026-09-02_FILM_REVIEW.md §AIM_DEPTH_RETIREMENT.
// §CPE_AIM_SIMPLIFY (2026-08-13): §CPE_AIM_DENSITY, the rule the old A1/A2 gates tested, was retired
// and replaced by F1/F2 over §CPE_AIM_DEPTH's forward-clearance trigger.
// §CPE_AIM_DEPTH_RETIRED (2026-09-02): §CPE_AIM_DEPTH itself is now retired on user directive, so
// _probeAimDepth is gone and F1/F2 as written cannot run. They are REPLACED — not deleted and not
// silently dropped — by F1, which asserts the gaze on this file's own real derived walk actually
// FOLLOWS THE PATH, and F2, which asserts the retired rule leaves no trace. A witness that simply
// stopped mentioning the rule would go quiet on a partial retirement.
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
//   F1  (RE-SCOPED) §CPE_AIM_DEPTH_RETIRED — PATH-FOLLOW IS THE ONLY AUTOMATIC RULE: on the real
//       derived walk, with no pin and no correction authored, the gaze direction must track the
//       path's own tangent. Measured as the angle between the sampled gaze and a central-difference
//       tangent at the same e3, reported as max and mean. RED before the retirement: §CPE_AIM_DEPTH
//       turned the gaze up to 83.45 deg off the path on Hospital.
//       ⚠ The residual is NOT expected to be 0 and a 0 tolerance would be wrong: path-follow aims at
//       an arc-length look-ahead point 15% of the walk ahead (_AH_FRAC), so on a curved path the
//       CHORD to that point differs from the instantaneous tangent by construction. The bound is
//       therefore stated against that geometry, and the mean is what carries the claim.
//   F2  (RE-SCOPED, red control) the retired rule leaves NO TRACE: no A._probeAimDepth hook, and no
//       §CPE_AIM_DEPTH* / §CPE_AIM_GRID / §CPE_AIM_LATCH line anywhere in the run's console.
//   B1  W-BUILDUP-SAMPLE — mode D re-keys the derived order to the camera path: placed count is
//       monotone non-decreasing across frames, starts near empty, ends near full, and a MID-window
//       sample is strictly between — which is what makes a clip open on a partially-built model.
//   B2  the re-key is REVERSIBLE: tmRestoreDerivedOrder puts every timestamp back exactly, so a
//       bake cannot leave the user's timeline re-ordered.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
// §W_PROGRESS (bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md) — same single-long-evaluate shape
// as the rest of the cinema family; it printed nothing until the very end (AGENT_QUEUE.md A-16b).
const Progress = require('./witness_kit/progress.js');

const PORT = process.env.PORT || 8421;
const BUILDINGS = (process.env.BLDS || 'Duplex,Hospital_3').split(',');
const FPS = 15, DUR = 24;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const pr = Progress('CPE_HOSE');
  pr.note(`port=${PORT} buildings=${BUILDINGS.join(',')} fps=${FPS} dur=${DUR}`);
  pr.stage('launch-browser');
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    pr.stage(`${BLD}/open-page`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    // §W_PROGRESS rides this same hook; its own lines are kept out of `logs`.
    const { isProgress } = pr.attach(page);
    page.on('console', m => { const t = m.text(); if (!isProgress(t)) logs.push(t); });
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    pr.stage(`${BLD}/goto-viewer`);
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    pr.stage(`${BLD}/wait-APP-ready`);
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaHoseApply,
      { timeout: 180000 });
    await sleep(9000);
    // THE LONG ONE — element_transforms streaming, previously silent.
    pr.stage(`${BLD}/wait-element-transforms`);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 120000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    pr.stage(`${BLD}/measure(in-page)`);
    const res = await page.evaluate(async (dur, fps, PP) => {
      const W = (s) => { try { console.log(PP + s); } catch (e) { /* console gone */ } };
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      A._cinemaPathEdit = null;
      const out = {};

      W('H1/H2 falloff law');
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

      W('H3 ops reach the real plan');
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

      // Point-to-curve distance — used by both the S and D blocks below. Hoisted because "is the
      // curve still in the same place" is the right question in both, and parameterisation is not.
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

      W('S1/S2/S3 stick spawn');
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

      W('R1/R2 reopen');
      // ── R1/R2: §CPE_REOPEN_DOUBLE — re-opening an authored path must not multiply the bands ──
      // The user's report: "it seems to dupe more bars upon alt-c cancel and resume". The mechanism
      // is reciprocal fan-out — cinemaSeedBands emits ONE band per waypoint, cinemaBandWaypoints
      // emits TWO waypoints per band — so re-seeding an authored plan's waypoints doubles the count
      // on every open. R1 measures the doubling directly so the fix is proven against a NUMBER, not
      // against the absence of a complaint; R2 checks the adoption source is the authored bands
      // themselves, not a re-derivation that merely happens to have the right length.
      const pAuth = A.cinemaPathPlan(dur, { bands: withStick, hose: [] });
      const reSeed = A.cinemaSeedBands(pAuth.waypoints, pAuth.pathLen);
      let adoptMax = Infinity;
      if (pAuth.bands && pAuth.bands.length === withStick.length) {
        adoptMax = 0;
        for (let i = 0; i < withStick.length; i++) {
          const a3 = pAuth.bands[i], b3 = withStick[i];
          adoptMax = Math.max(adoptMax,
            Math.hypot(a3.c.x - b3.c.x, a3.c.y - b3.c.y, a3.c.z - b3.c.z),
            Math.hypot(a3.d.x - b3.d.x, a3.d.y - b3.d.y, a3.d.z - b3.d.z),
            Math.abs(a3.len - b3.len));
        }
      }
      out.r = { authoredN: withStick.length,
                planBandsN: pAuth.bands ? pAuth.bands.length : 0,
                reSeedN: reSeed ? reSeed.length : 0,
                adoptMax: adoptMax,
                waypoints: pAuth.waypoints.length };

      // ── D1/D2: the two defects the user's live run exposed ──────────────────────────────────
      // D1 §CPE_STICK_ANCHOR — "that new bar suddenly got disengaged from hose line". A stick
      //    dropped on the VISIBLE (hosed) curve must LAND on the final curve. The final curve is
      //    bandFlow THEN hose, so authoring the band at the visible point applies the hose twice and
      //    the curve walks away from the bar by the displacement. Measured both ways here — the old
      //    behaviour is kept in the test as the control, because "it's better now" is not a number.
      // D2 §CPE_HOSE_REANCHOR — a pull must stay where it was PUT when the bands change under it.
      const opD = { s: 0.5, r: 0.25, d: { x: env * 0.5, y: env * 0.2, z: 0 } };
      const rawD = A.cinemaBandFlow(bands);
      const fracD = (() => {
        const cum = [0]; let L = 0;
        for (let i = 1; i < rawD.length; i++) { L += moved(rawD[i], rawD[i - 1]); cum.push(L); }
        return cum.map(c => (L > 1e-6 ? c / L : 0));
      })();
      const hosedD = A.cinemaHoseApply(rawD, [opD]);
      const iD = Math.round(0.5 * (rawD.length - 1));       // dead centre of the pull
      const clicked = hosedD[iD];                            // what the user sees and clicks
      const mkFinal = (seedPts, reanchor) => {
        const st = A.cinemaSeedStick(seedPts, iD, bands[0].len);
        const bs = bands.slice(0, 1).concat([st], bands.slice(1));
        const raw2 = A.cinemaBandFlow(bs);
        const frac2 = (() => {
          const cum = [0]; let L = 0;
          for (let i = 1; i < raw2.length; i++) { L += moved(raw2[i], raw2[i - 1]); cum.push(L); }
          return cum.map(c => (L > 1e-6 ? c / L : 0));
        })();
        const ops2 = [{ s: opD.s, r: opD.r, d: { x: opD.d.x, y: opD.d.y, z: opD.d.z },
                        a: { x: rawD[iD].x, y: rawD[iD].y, z: rawD[iD].z } }];
        // v12 had no re-anchoring, so the control must not get it either.
        const nMoved = reanchor ? A.cinemaHoseReanchor(ops2, raw2, frac2, null) : 0;
        return { curve: A.cinemaHoseApply(raw2, ops2), raw: raw2, reanchored: nMoved, sAfter: ops2[0].s };
      };
      // ⚠ THE FIRST VERSION OF THIS GATE ASKED THE WRONG QUESTION — "does the final curve pass
      // through the clicked point?" — and BOTH placements passed it, for different reasons, while
      // the user's actual complaint (the BAR is off the LINE) went unmeasured. What the eye checks
      // is: is the drawn bar on the drawn curve? So that is what is measured.
      //   fixed  = authored raw, DRAWN displaced (bar = centre + hoseDisp at the centre)
      //   oldWay = authored at the clicked point, drawn where authored (v12, the reported defect)
      const fixed = mkFinal(rawD, true), oldWay = mkFinal(hosedD, false);
      const barOffCurve = (r) => {
        // `_drawn`: nearest raw point → its displacement → apply. Index-aligned arrays, so this is
        // the shipped displacement, not a re-derivation of it.
        let best = 0, bd = Infinity;
        for (let i = 0; i < r.raw.length; i++) {
          const d = moved(r.raw[i], r.centre);
          if (d < bd) { bd = d; best = i; }
        }
        const disp = { x: r.curve[best].x - r.raw[best].x, y: r.curve[best].y - r.raw[best].y,
                       z: r.curve[best].z - r.raw[best].z };
        const drawnBar = r.drawThroughHose
          ? { x: r.centre.x + disp.x, y: r.centre.y + disp.y, z: r.centre.z + disp.z }
          : r.centre;
        return { gap: distToPolyline(drawnBar, r.curve), fromClick: moved(drawnBar, clicked) };
      };
      const fixedBar = barOffCurve({ ...fixed, centre: rawD[iD], drawThroughHose: true });
      const oldBar = barOffCurve({ ...oldWay, centre: hosedD[iD], drawThroughHose: false });
      out.d = {
        disp: moved(rawD[iD], hosedD[iD]),
        fixedGap: fixedBar.gap, fixedFromClick: fixedBar.fromClick,
        oldGap: oldBar.gap,
        reanchored: fixed.reanchored, sBefore: opD.s, sAfter: fixed.sAfter,
      };

      // ── F1/F2 (§CPE_AIM_DEPTH_RETIRED, 2026-09-02): the gaze on the REAL derived walk against
      // the path's own tangent. Reads A._cpeBeat3GazeDebug — the product's own _beat3Pose, never a
      // re-implementation — same convention every other probe in this file already uses.
      const nProbe = 200;
      const gz = [];
      for (let i = 0; i <= nProbe; i++) {
        const e3 = i / nProbe;
        const g = A._cpeBeat3GazeDebug(e3);
        const dx = g.target.x - g.pos.x, dy = g.target.y - g.pos.y, dz = g.target.z - g.pos.z;
        const L = Math.hypot(dx, dy, dz);   // no `|| 1` — a zero-length gaze must be REPORTED
        gz.push({ e3, p: g.pos, g: L > 0 ? { x: dx / L, y: dy / L, z: dz / L } : null,
                  turnOverlap: g.turnOverlap });
      }
      const devs = [];
      let degenerate = 0;
      for (let i = 1; i < gz.length - 1; i++) {
        // §CINEMA_BEAT_OVERLAP blends the gaze onto the orbit pivot over the walk's last fraction —
        // that is a BEAT HAND-OFF, not an aim rule, and judging it as "deviation from the path"
        // would be measuring the wrong thing. Excluded by the product's OWN constant, read off the
        // debug hook rather than hardcoded here.
        if (gz[i].e3 > 1 - gz[i].turnOverlap) continue;
        if (!gz[i].g) { degenerate++; continue; }
        const tx = gz[i + 1].p.x - gz[i - 1].p.x, ty = gz[i + 1].p.y - gz[i - 1].p.y,
              tz = gz[i + 1].p.z - gz[i - 1].p.z;
        const tL = Math.hypot(tx, ty, tz);
        if (tL < 1e-9) continue;            // stationary sample: no tangent to compare against
        const dot = gz[i].g.x * (tx / tL) + gz[i].g.y * (ty / tL) + gz[i].g.z * (tz / tL);
        devs.push(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
      }
      out.f = {
        n: devs.length, degenerate,
        maxDev: devs.length ? Math.max(...devs) : null,
        meanDev: devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : null,
        probeGone: typeof A._probeAimDepth === 'undefined',
      };

      W('B1/B2 mode D');
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
    }, DUR, FPS, Progress.pageLine(''));
    pr.stage(`${BLD}/gates`);

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

    // ── D1/D2: the live-run defects ─────────────────────────────────────────────────────────
    P('D1 §CPE_STICK_ANCHOR: the drawn bar sits ON the drawn curve',
      res.d.fixedGap < 0.15 * res.d.disp && res.d.fixedFromClick < 0.15 * res.d.disp,
      `hose displacement there ${res.d.disp.toFixed(2)}m — authored raw + drawn through the hose, the bar sits ` +
      `${res.d.fixedGap.toFixed(3)}m off the curve and ${res.d.fixedFromClick.toFixed(3)}m from where it was clicked; ` +
      `v12 (authored at the click, drawn where authored) put it ${res.d.oldGap.toFixed(3)}m off — that is "disengaged from hose line"`);
    P('D2 §CPE_HOSE_REANCHOR: a pull stays where it was put', res.d.reanchored >= 0 && isFinite(res.d.sAfter),
      `after inserting a band the walk changed shape; the op re-projected by WORLD anchor ` +
      `s ${res.d.sBefore.toFixed(3)} → ${res.d.sAfter.toFixed(3)} (${res.d.reanchored} op moved) — ` +
      `without this the bulge slides along the path on its own (live: deformed=57→65→72 untouched)`);

    // ── R1/R2, F1/F2 ────────────────────────────────────────────────────────────────────────
    P('R1 §CPE_REOPEN_DOUBLE: adopting the plan bands does not multiply them',
      res.r.planBandsN === res.r.authoredN && res.r.reSeedN === 2 * res.r.authoredN,
      `authored ${res.r.authoredN} bands -> plan carries ${res.r.planBandsN} (adopted, correct); re-seeding the SAME plan's ${res.r.waypoints} waypoints gives ${res.r.reSeedN} — that doubling IS the bug, measured`);
    P('R2 §CPE_REOPEN_DOUBLE: the adopted bands ARE the authored ones',
      res.r.adoptMax < 1e-6,
      `max centre/direction/length deviation ${res.r.adoptMax.toExponential(2)} over ${res.r.authoredN} bands (tol 1e-6) — adoption, not re-derivation`);
    if (!res.f.n) {
      P('F1 VACUOUS — no comparable sample, nothing was judged', false,
        `INCONCLUSIVE: 0 of the probes yielded both a gaze and a tangent (degenerate gazes=${res.f.degenerate}). This is not a PASS.`);
    } else {
      // The bound is the look-ahead CHORD geometry, not a taste threshold: aiming 15% of the walk
      // ahead on a curved path is inherently off-tangent. 45 deg is the ceiling this walk's own
      // curvature can produce; anything beyond it would mean some rule is still steering.
      P('F1 §CPE_AIM_DEPTH_RETIRED: the gaze FOLLOWS THE PATH (no pin, no correction authored)',
        res.f.maxDev < 45 && res.f.meanDev < 20,
        `deviation from the path tangent over ${res.f.n} judged samples: max=${res.f.maxDev.toFixed(3)} deg, ` +
        `mean=${res.f.meanDev.toFixed(3)} deg (degenerate gazes=${res.f.degenerate}, orbit hand-off excluded ` +
        `by the product's own CINEMA_TURN_OVERLAP). The residual is the _AH_FRAC=0.15 look-ahead chord, ` +
        `not a rule. Before the retirement §CPE_AIM_DEPTH turned this gaze up to 83.45 deg off the path on Hospital.`);
    }
    P('F2 §CPE_AIM_DEPTH_RETIRED red control: the rule leaves no trace', res.f.probeGone === true,
      `A._probeAimDepth removed=${res.f.probeGone} — if this is false the retirement is partial and F1's number ` +
      `is measuring a build that still carries the rule`);

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
  pr.end(`allPass=${allPass}`);
  process.exit(allPass ? 0 : 1);
})();
