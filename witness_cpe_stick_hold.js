// WITNESS — §CPE_STICK_HOLD: a hold costs exactly its authored seconds and really parks the camera.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_STICK_HOLD +
//       bim-compiler prompts/RESUME_2026-09-02_FILM_REVIEW.md §AIM_DEPTH_RETIREMENT.
//
// USER'S OWN STATEMENT OF THE FEATURE (2026-08-01): "putting hold at 1 sec (put that as default for
// the last stick) will teach them 'ah, it slows a sec stop a sec, then ease out while the cam is
// turning to the building'", and "while aimed already at a centre, and when the path continues, it
// should remain so ... ie at perpendicular angle".
//
// ⚠ RE-SCOPED 2026-09-02, §CPE_AIM_DEPTH_RETIRED — AND THE OLD CLAIM IS WITHDRAWN, NOT RELABELLED.
// This file used to also witness §CPE_AIM_LATCH and the hold's AIM half (`_holdBoostAt`, which
// existed only to feed `_aimDepthApply`). §CPE_AIM_DEPTH is retired on the user's directive ("its
// best to leave alone its pointing along its path ... to stay simple and predictable"), so both are
// GONE from effects.js. The half of the user's 2026-08-01 sentence that said "while the cam is
// turning to the building" is therefore NO LONGER DELIVERED BY A HOLD, and this witness says so in
// G-SH-5 rather than quietly passing a weaker test. The turn at a stop is now AUTHORED — put a
// §CPE_AIM_PIN on the held band's own Voronoi zone — not automatic.
//
//   G-SH-1  end-to-end column: a hold set on a band survives plan → override → replan. RED: the
//           field does not exist, so it is dropped everywhere it is copied.
//   G-SH-2  THE CLOCK COSTS IT, and costs it as AUTHORED time: walkSec(hold=h) - walkSec(hold=0)
//           == h EXACTLY, and that delta is IDENTICAL for a busy path and an empty one (holds must
//           sit OUTSIDE the noise multiplier). RED: hold is free time — delta 0.
//   G-SH-3  THE CAMERA REALLY STOPS: speed at the hold centre collapses to ~0 while time advances,
//           and the travel time removed equals the authored seconds. RED: nothing stops.
//   G-SH-4  NO JERK BUYING IT: peak deg/frame and the position step across the hold window stay
//           inside the bounds §CPE_EVEN_TURN already gates. The raised-cosine dip must not trade a
//           stall for a whip — a flat freeze WOULD, which is why the shape is what it is.
//   G-SH-5  (RE-SCOPED) THE HOLD IS A PURE RATE DIP: the camera is genuinely parked across the stop
//           AND — because every surviving gaze rule is indexed by travel, which a hold stops — the
//           gaze is CONSTANT there on an unpinned path. This is the ruled outcome of
//           §CPE_AIM_DEPTH_RETIRED, stated as a number so the cost is visible instead of implied.
//           RED: a non-zero rotation would mean some automatic rule still steers a parked camera.
//           VACUOUS if no stop window is found; the gate must not read as PASS then.
//   G-SH-6  (RE-SCOPED, red control for the retirement) THE AIM HALF IS GONE: over a full plan and
//           walk sampling, effects.js emits NO §CPE_AIM_DEPTH / §CPE_AIM_DEPTH_SERIES / §CPE_AIM_
//           LATCH line and exposes no A._probeAimDepth hook. RED (i.e. this gate failing) is exactly
//           what a partial retirement looks like.
//   G-SH-7  a freshly seeded path carries hold=0 on EVERY band (2026-08-02: an unset hold is no hold).
//   G-SH-8  no regression: naturalTotal == sum(naturalSec.*), replan deterministic, and a path with
//           every hold 0 is BYTE-IDENTICAL to the same path planned with no hold field at all.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8450;
const BUILDINGS = (process.env.BLDS || 'Hospital,Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.dbQuery,
      { timeout: 300000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 300000, polling: 3000 });

    const DUR = 40, HOLD = 1.0;
    const res = await page.evaluate(async (DUR, HOLD) => {
      const A = window.APP;
      const out = { err: null };
      const norm = v => { const L = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x/L, y: v.y/L, z: v.z/L }; };
      const gazeOf = p => norm({ x: p.tx - p.x, y: p.ty - p.y, z: p.tz - p.z });
      const angBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x*b.x + a.y*b.y + a.z*b.z))) * 180/Math.PI;
      try {
        if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
        if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

        // A real 3-band path near the building, derived from the plan's own waypoints — the same
        // shape the editor seeds, so the "last stick" is band index 1 (length-2).
        const planD = A.cinemaPathPlan(DUR);
        const s0 = planD.waypoints[0];
        // ⚠ A DOG-LEG, not a straight line — and this is a MEASURED correction to this file, not a
        // preference. The first cut used three COLLINEAR bands, which have no direction change, so
        // the look-ahead gaze had nothing to turn toward and G-SH-5 measured 0.02 deg of rotation
        // across a genuinely parked camera. That read as "the hold does not turn the camera" when
        // the truth was "this path never asked it to". A hold buys time for a turn; a test with no
        // turn to make cannot show it. Band 1 (the held stick) now sits on a real corner.
        const mkBands = (holds) => {
          const legs = [
            { c: { x: s0.x,      y: s0.y, z: s0.z      }, d: { x: 1, y: 0, z: 0 } },
            { c: { x: s0.x + 12, y: s0.y, z: s0.z + 6  }, d: { x: 0, y: 0, z: 1 } },
            { c: { x: s0.x + 24, y: s0.y, z: s0.z + 12 }, d: { x: 1, y: 0, z: 0 } },
          ];
          return legs.map((L, i) => ({
            c: L.c, d: L.d, len: 10, hold: holds[i] || 0, _stick: i > 0 && i < 2,
          }));
        };
        const planNoHold = A.cinemaPathPlan(DUR, { bands: mkBands([0, 0, 0]) });
        const planHold   = A.cinemaPathPlan(DUR, { bands: mkBands([0, HOLD, 0]) });
        out.noHold = { out: planNoHold.naturalSec.out, total: planNoHold.naturalTotal,
                       pathLen: planNoHold.pathLen,
                       bandsEcho: (planNoHold.bands || []).map(b => b.hold) };
        out.hold   = { out: planHold.naturalSec.out, total: planHold.naturalTotal,
                       pathLen: planHold.pathLen,
                       bandsEcho: (planHold.bands || []).map(b => b.hold) };

        // ── G-SH-2's second half: the SAME two plans bodily translated 3000m out. Translation
        // cannot change an authored second, so the hold delta must be identical while the travel
        // seconds (which the noise multiplier DOES scale) differ.
        const OFF = 3000;
        const mkFar = (holds) => mkBands(holds).map(b => ({ ...b, c: { x: b.c.x + OFF, y: b.c.y, z: b.c.z } }));
        const farNo   = A.cinemaPathPlan(DUR, { bands: mkFar([0, 0, 0]) });
        const farHold = A.cinemaPathPlan(DUR, { bands: mkFar([0, HOLD, 0]) });
        out.far = { no: farNo.naturalSec.out, hold: farHold.naturalSec.out };

        // ── Sample the WALK of the held plan densely, in film-normalized time.
        const b = planHold.beats;
        out.beats = { dive: b.dive, spin: b.spin, out: b.out, rise: b.rise };
        const N = 600, walk = [];
        for (let i = 0; i <= N; i++) {
          const w = i / N;
          const t = b.spin + (b.out - b.spin) * w;
          const p = planHold.poseAt(t);
          walk.push({ w, t, x: p.x, y: p.y, z: p.z, g: gazeOf(p) });
        }
        // Per-sample speed (m per sample) and gaze rate (deg per sample).
        const walkSec = planHold.naturalSec.out;
        for (let i = 1; i < walk.length; i++) {
          walk[i].step = Math.hypot(walk[i].x - walk[i-1].x, walk[i].y - walk[i-1].y, walk[i].z - walk[i-1].z);
          walk[i].turn = angBetween(walk[i].g, walk[i-1].g);
        }
        // slice(2), not slice(1): walk[0] sits exactly on t=b.spin, which poseAt routes to BEAT 2
        // (`if (tNorm <= tS)`), so the first delta measures the Beat2->3 seam rather than the walk.
        // That seam has its own gate (§CPE_SEAM_CONTINUOUS); including it here read as a 3.40
        // deg/sample "walk" whip that the walk never made.
        const body = walk.slice(2);
        const meanStep = body.reduce((a, s) => a + s.step, 0) / body.length;
        // The stop: the longest run of near-zero motion, and where it sits.
        let minStep = Infinity, minAt = 0, peakTurnAt = 0, pk = -1;
        body.forEach(s => { if (s.step < minStep) { minStep = s.step; minAt = s.w; }
                            if (s.turn > pk) { pk = s.turn; peakTurnAt = s.w; } });
        const stalled = body.filter(s => s.step < meanStep * 0.05);
        out.stop = {
          meanStep, minStep, minAt,
          stalledFrac: stalled.length / body.length,
          stalledSec: (stalled.length / body.length) * walkSec,
          peakStep: Math.max(...body.map(s => s.step)),
          peakTurn: Math.max(...body.map(s => s.turn)), peakTurnAt,
          // The stop window is the STALLED SAMPLES THEMSELVES, not a fixed radius: the hold is ~3%
          // of the walk and a +/-0.06 radius swept in 4x its width of ordinary travel, which is why
          // an earlier cut of G-SH-5 measured a "parked" camera moving 3.16m.
          stallW0: stalled.length ? stalled[0].w : null,
          stallW1: stalled.length ? stalled[stalled.length - 1].w : null,
        };
        // ── G-SH-5: gaze rotation ACROSS the stop window, camera stationary.
        const win = body.filter(s => out.stop.stallW0 != null &&
                                     s.w >= out.stop.stallW0 && s.w <= out.stop.stallW1);
        if (win.length > 2) {
          const g0 = win[0].g, g1 = win[win.length - 1].g;
          const moved = Math.hypot(win[win.length-1].x - win[0].x, win[win.length-1].y - win[0].y,
                                   win[win.length-1].z - win[0].z);
          // The USER-VISIBLE promise is "the cam is turning to the building" — an OUTCOME, not a
          // rotation for its own sake. So also measure where the gaze actually POINTS relative to the
          // building bulk at both ends of the stop. A camera that is already on the building has
          // nothing left to turn onto, and scoring that as a failure would be measuring the test
          // path's starting condition rather than the feature.
          const piv = planHold.pivot;
          const offBulk = (sm) => {
            const bx = piv.x - sm.x, by = piv.y - sm.y, bz = piv.z - sm.z;
            const bL = Math.hypot(bx, by, bz) || 1;
            return angBetween(sm.g, { x: bx/bL, y: by/bL, z: bz/bL });
          };
          out.turnAtStop = { deg: angBetween(g0, g1), movedM: moved, samples: win.length,
                             offBulkStart: offBulk(win[0]), offBulkEnd: offBulk(win[win.length-1]) };
        }
        // ── G-SH-8: all-holds-zero must equal a plan built with no hold field at all.
        const bandsNoField = mkBands([0,0,0]).map(b2 => { const c = { ...b2 }; delete c.hold; return c; });
        const planNoField = A.cinemaPathPlan(DUR, { bands: bandsNoField });
        const planZero2   = A.cinemaPathPlan(DUR, { bands: mkBands([0,0,0]) });
        let poseDiff = 0;
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const p1 = planNoField.poseAt(t), p2 = planZero2.poseAt(t);
          poseDiff = Math.max(poseDiff, Math.abs(p1.x-p2.x), Math.abs(p1.y-p2.y), Math.abs(p1.z-p2.z),
                                        Math.abs(p1.tx-p2.tx), Math.abs(p1.ty-p2.ty), Math.abs(p1.tz-p2.tz));
        }
        out.zeroIdentical = { poseDiff, outDiff: Math.abs(planNoField.naturalSec.out - planZero2.naturalSec.out) };
        // determinism + self-consistency
        const planHold2 = A.cinemaPathPlan(DUR, { bands: mkBands([0, HOLD, 0]) });
        out.determinism = { outDiff: Math.abs(planHold.naturalSec.out - planHold2.naturalSec.out),
                            totalDiff: Math.abs(planHold.naturalTotal - planHold2.naturalTotal) };
        out.selfConsistent = {
          sum: planHold.naturalSec.dive + planHold.naturalSec.spin + planHold.naturalSec.out +
               planHold.naturalSec.rise + planHold.naturalSec.orbit,
          total: planHold.naturalTotal };
      } catch (e) { out.err = e.message + ' | ' + (e.stack || '').split('\n').slice(0,3).join(' / '); }
      return out;
    }, DUR, HOLD);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok }); if (!ok) allPass = false;
      console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-SH-1..8 the plan API accepts bands carrying a hold', false, res.err);
      console.log(`\n  ${BLD}: 0/1`); summary.push(`${BLD} 0/8`); await page.close(); continue;
    }

    // ── G-SH-1 ────────────────────────────────────────────────────────────────────────────────
    const echo = res.hold.bandsEcho || [];
    const echoOK = echo.length === 3 && Math.abs((echo[1] || 0) - 1.0) < 1e-9 &&
                   !(echo[0] > 0) && !(echo[2] > 0);
    P('G-SH-1 the hold survives band → plan → echo (the field exists end-to-end)', echoOK,
      `plan.bands hold echo = [${echo.join(', ')}] (expected [0, 1, 0]); no-hold echo = ` +
      `[${(res.noHold.bandsEcho || []).join(', ')}]`);

    // ── G-SH-2 ────────────────────────────────────────────────────────────────────────────────
    const delta = res.hold.out - res.noHold.out;
    const farDelta = res.far.hold - res.far.no;
    const exact = Math.abs(delta - 1.0) < 1e-6;
    const authored = Math.abs(delta - farDelta) < 1e-6;
    const travelDiffers = Math.abs(res.noHold.out - res.far.no) > 1e-3;
    P('G-SH-2 the clock costs the hold, as AUTHORED time (exactly 1.0s, unscaled by the noise multiplier)',
      exact && authored,
      `walkSec ${res.noHold.out.toFixed(4)}s → ${res.hold.out.toFixed(4)}s, delta=${delta.toFixed(6)}s ` +
      `(want exactly ${1.0}); same path 3000m out: ${res.far.no.toFixed(4)} → ${res.far.hold.toFixed(4)}, ` +
      `delta=${farDelta.toFixed(6)}s — deltas match=${authored}; and the TRAVEL seconds do differ ` +
      `between busy and empty (${travelDiffers}), which is what proves the multiplier is still live`);

    // ── G-SH-3 ────────────────────────────────────────────────────────────────────────────────
    const s = res.stop;
    const stops = s.minStep < s.meanStep * 0.02;
    const dwellOK = s.stalledSec > 0.3;
    P('G-SH-3 the camera really stops at the stick (speed → ~0 while time keeps running)',
      stops && dwellOK,
      `mean step=${s.meanStep.toExponential(2)}m/sample, min=${s.minStep.toExponential(2)} at w=${s.minAt.toFixed(3)} ` +
      `(ratio ${(s.minStep/s.meanStep).toExponential(2)}, want <2e-2); near-zero for ` +
      `${(s.stalledFrac*100).toFixed(1)}% of the walk ≈ ${s.stalledSec.toFixed(2)}s of film`);

    // ── G-SH-4 ────────────────────────────────────────────────────────────────────────────────
    // The dip's own arithmetic bounds the overshoot: removing h seconds of travel over a 1.5h window
    // means the surrounding travel speeds up by at most walkSec/(walkSec-h) — this checks the REAL
    // sampled peak against the §CPE_EVEN_TURN family bound (1.5x mean for an eased beat, 2.4x for a
    // cost-parameterized one; the walk is the latter).
    // ⚠ The 12 deg/frame bound is NOT asserted absolutely here, and the reason is measured: on this
    // synthetic 3-band path Duplex ALREADY peaks at 62.59 deg/sample on origin/main (RED_hold.log) —
    // a pre-existing spike in this path shape, not something the hold introduced. Inheriting it would
    // make the gate red forever and prove nothing about this feature. So the assertion is "the hold
    // did not make it WORSE", against baselines measured by this exact file on origin/main, plus the
    // structural step bound which does hold absolutely.
    // §CPE_GAZE_CONSTANT_RATE makes this an ABSOLUTE assertion, not a baseline comparison: the law
    // promises the composed gaze never exceeds CINEMA_TURN_DPS, so the bound is arithmetic —
    // 45 deg/s x the sampling interval. 1.25x slack covers the nlerp chord between build probes
    // (512) being read at a finer witness resolution (600). A baseline compare would have accepted
    // whatever main happened to do; this accepts only what the law claims.
    // ⚠ THE BOUND IS READ FROM THE CODE UNDER TEST, NOT HARDCODED. It used to be a literal 45, and
    // §CPE_GAZE_ACQUIRE (2026-08-02) legitimately raised the ceiling: the per-probe allowance now
    // scales with the residual angle, up to GAZE_ACQUIRE_MAX x CINEMA_TURN_DPS, because a flat rate
    // gave the camera no acquisition at all (user: "seems a bit slow ... it be nice if it does so
    // right away gracefully"). A literal 45 turned this gate RED on Duplex at a measured 122.4 deg/s
    // — inside the new law, outside the old constant.
    // This is deliberately NOT a relaxation to whatever main happens to do. It asks the shipped
    // curve for its own maximum and holds the film to THAT, so an unbounded whip still fails hard:
    // the same run measured rawPeakDps 376.7 (Duplex) and 790.8 (Hospital) before limiting, both far
    // outside 3x. If the curve's ceiling is ever raised without cause, this number moves in the log.
    const maxMult = await page.evaluate(() => {
      const A = window.APP;
      if (typeof A.gazeAcquireCap !== 'function') return 1;   // pre-§CPE_GAZE_ACQUIRE build
      const base = 1e-3;
      return A.gazeAcquireCap(Math.PI, base) / base;          // the curve's own stated maximum
    });
    const sampleSec = res.hold.out / 600;
    const capDeg = 45 * maxMult * sampleSec * 1.25;
    const stepRatio = s.peakStep / s.meanStep;
    const jerkOK = stepRatio <= 2.4 && s.peakTurn <= capDeg;
    P('G-SH-4 no jerk bought the stop: step inside §CPE_EVEN_TURN\'s 2.4x, gaze no worse than origin/main',
      jerkOK,
      `peak step=${s.peakStep.toExponential(2)}m = ${stepRatio.toFixed(2)}x mean (bound 2.4x); ` +
      `peak gaze=${s.peakTurn.toFixed(3)} deg/sample at w=${s.peakTurnAt.toFixed(3)} ` +
      `= ${(s.peakTurn/sampleSec).toFixed(1)} deg/s against the ${45 * maxMult} deg/s law ` +
      `(${45} x ${maxMult}x §CPE_GAZE_ACQUIRE, read from the shipped curve) ` +
      `(cap ${capDeg.toFixed(3)} deg/sample)` +
      `\n        ${(logs.filter(l => l.startsWith('§CPE_GAZE_CONSTANT_RATE')).slice(-1)[0] || 'no §CPE_GAZE_CONSTANT_RATE line').slice(0, 210)}`);

    // ── G-SH-5 (RE-SCOPED 2026-09-02, §CPE_AIM_DEPTH_RETIRED) ────────────────────────────────
    // The stationary half is unchanged and is still what makes this a real gate: on origin/main the
    // "slowest point" window still travels 2.89m, so anything measured there without the parked test
    // proves nothing about a hold. Demand the camera be genuinely parked — under 10% of the distance
    // it would cover at mean speed over the same samples.
    //
    // The SECOND half is now the opposite assertion, and deliberately so. With §CPE_AIM_DEPTH gone
    // there is no automatic rule that can steer a parked camera: every surviving gaze rule (path
    // follow, the §CPE_SEAM_CONTINUOUS open blend, §CPE_AIM_PIN, the correction window) is indexed
    // by e3, the TRAVEL fraction, and a hold stops travel. So on this unpinned, uncorrected test
    // path the rotation across the stop MUST be ~0. Reported as a number, not implied: this is the
    // measured price of the retirement.
    const ts = res.turnAtStop;
    const expectM = ts ? s.meanStep * ts.samples : 0;
    const parked = !!ts && ts.movedM < expectM * 0.10;
    // 0.5 deg, not 0 — the sampler walks TIME and the stall window's own end samples still carry a
    // sub-sample of residual travel; the pre-retirement measurement of a genuinely parked camera
    // with nothing to turn toward was 0.02 deg (this file's own dog-leg comment above).
    const gazeFrozen = !!ts && ts.deg < 0.5;
    if (!ts) {
      P('G-SH-5 VACUOUS — no stop window found, nothing was judged', false,
        'INCONCLUSIVE: the hold produced no stalled samples, so neither the parked test nor the ' +
        'frozen-gaze test ran. This is not a PASS.');
    } else {
      P('G-SH-5 the hold is a PURE RATE DIP: camera parked, and the gaze is constant across it',
        parked && gazeFrozen,
        `camera parked=${parked} (moved ${ts.movedM.toExponential(2)}m over ${ts.samples} samples; ` +
        `at mean speed it would have covered ${expectM.toFixed(2)}m). Gaze rotation across the stop ` +
        `= ${ts.deg.toFixed(3)} deg (must be ~0 — §CPE_AIM_DEPTH_RETIRED: no automatic rule steers a ` +
        `parked camera any more). Gaze off the building bulk ${ts.offBulkStart.toFixed(1)}deg → ` +
        `${ts.offBulkEnd.toFixed(1)}deg, reported as INFO only — where the frozen gaze happens to ` +
        `point is now a property of the authored path, not of the hold. To turn the camera at a ` +
        `stop, pin the held band (§CPE_AIM_PIN).`);
    }

    // ── G-SH-6 (RE-SCOPED 2026-09-02) — red control for §CPE_AIM_DEPTH_RETIRED ────────────────
    // The old gate read §CPE_AIM_LATCH / §CPE_AIM_DEPTH_SERIES off the film's own log to prove the
    // aim was latched. Those lines no longer exist, and a witness that merely stopped looking for
    // them would go silent on a partial retirement. So it now asserts their ABSENCE, plus the
    // absence of the product's own depth probe hook — the same evidence read the opposite way.
    const depthAny = logs.filter(l => l.startsWith('§CPE_AIM_DEPTH_SERIES') ||
                                      l.startsWith('§CPE_AIM_DEPTH ') ||
                                      l.startsWith('§CPE_AIM_LATCH') ||
                                      l.startsWith('§CPE_AIM_GRID') ||
                                      l.startsWith('§CPE_AIM_SERIES') ||
                                      l.startsWith('§CPE_AIM_DENSITY '));
    const probeGone = await page.evaluate(() => typeof window.APP._probeAimDepth === 'undefined');
    P('G-SH-6 §CPE_AIM_DEPTH_RETIRED: no automatic aim rule survives — no aim §-line, no probe hook',
      depthAny.length === 0 && probeGone === true,
      `aim §-lines seen over the whole run: ${depthAny.length}` +
      (depthAny.length ? ` → ${depthAny.slice(0, 3).map(l => l.slice(0, 90)).join(' | ')}` : ' (none)') +
      `; A._probeAimDepth removed=${probeGone}. Total console lines scanned=${logs.length} ` +
      `(a zero here with zero lines scanned would be vacuous — it is not).`);

    // ── G-SH-7 ────────────────────────────────────────────────────────────────────────────────
    // The default lives in the editor's seeding, so read the constant the editor exposes.
    const seed = await page.evaluate(() => {
      try {
        const E = window.APP && window.APP.cinemaPathEditor;
        if (!E || typeof E._seedHolds !== 'function') return null;
        return { dflt: E.holdDefaultSec, three: E._seedHolds(3), five: E._seedHolds(5), two: E._seedHolds(2) };
      } catch (e) { return null; }
    });
    // CORRECTED 2026-08-02 (user): "of course not as default is zero" — an unset hold is NO hold.
    // A freshly seeded path must carry hold 0 on EVERY band; the 2026-08-01 1.0s exit default was
    // an over-generalisation of a one-path instruction and produced an unexplained 1s pause at a
    // settle stick the user never set (observed on the Hospital bake of 2026-08-02).
    const seedOK = !!seed && seed.dflt === 0 &&
      JSON.stringify(seed.three) === JSON.stringify([0, 0, 0]) &&
      JSON.stringify(seed.five) === JSON.stringify([0, 0, 0, 0, 0]) &&
      JSON.stringify(seed.two) === JSON.stringify([0, 0]);
    P('G-SH-7 a freshly seeded path carries hold=0 on EVERY band — an unset hold is no hold',
      seedOK,
      seed === null ? 'editor exposes no hold seeding — the default does not exist (RED on main)'
                    : `default=${seed.dflt}s; seeding 3 bands → [${seed.three}], 5 → [${seed.five}], ` +
                      `2 (no stick) → [${seed.two}]`);

    // ── G-SH-8 ────────────────────────────────────────────────────────────────────────────────
    const z = res.zeroIdentical, d = res.determinism, c = res.selfConsistent;
    const consist = Math.abs(c.sum - c.total);
    const regOK = z.poseDiff === 0 && z.outDiff === 0 && d.outDiff === 0 && d.totalDiff === 0 && consist < 1e-9;
    P('G-SH-8 no regression: holds-all-zero is byte-identical to no hold field, plan self-consistent + deterministic',
      regOK,
      `zero-vs-absent: maxPoseDiff=${z.poseDiff.toExponential(2)} outDiff=${z.outDiff.toExponential(2)}; ` +
      `replan-twice: out=${d.outDiff.toExponential(2)} total=${d.totalDiff.toExponential(2)}; ` +
      `naturalTotal vs sum: ${consist.toExponential(2)}`);

    const pass = checks.filter(x => x.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    summary.push(`${BLD} ${pass}/${checks.length}`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}\n§CPE_STICK_HOLD WITNESS: ${summary.join(' | ')} — ${allPass ? 'PASS' : 'FAIL'}\n${'='.repeat(78)}`);
  process.exit(allPass ? 0 : 1);
})();
