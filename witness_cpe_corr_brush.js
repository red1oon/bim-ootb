// WITNESS — §CPE_CORR_BOUNDED (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CORR_BRUSH_STROKE).
//
// ISSUE IT PROVES/DISPROVES: a cam-face correction is an EDIT, and the user's concern is that it
// "overwrites too far out". The unbounded stroke model did exactly that — it took the gaze at its
// anchor and held it to the end of the walk. This measures, on a REAL plan, (a) exactly how far
// back and how far forward a single correction reaches, in METRES, (b) that everything outside that
// window is bit-identical to the uncorrected gaze, and (c) that the exit is no more abrupt than the
// entry — which is the specific complaint about the earlier bounded version.
//
// "Abrupt" is made a NUMBER: degrees of gaze change per metre of path, sampled densely and compared
// entry edge vs exit edge. Never a look at a picture (CLAUDE.md FUNDAMENTAL LAW).
//
// The measurement is a DIFFERENCE of two real plans built by the shipped planner — one with no
// corrections, one with a single authored correction — sampled through A._cpeBeat3GazeDebug, which
// is the product's own _beat3Pose. No re-derivation of the envelope in witness code: a witness that
// recomputed the blend would be measuring itself (§SESSION_2026-08-30 bug 2).
//
// §CPE_CORR_BRANCH (2026-09-01) — WHAT G-BR-6 NOW PROVES OR DISPROVES.
// The 6/7 run's one failure was a single sample jumping 110.44 deg where the uncorrected walk's own
// worst sample is 13.28 deg. Diagnosed and fixed as the 2*pi branch flip in _cpeCorrDirBlend's
// short-way yaw (see effects.js §CPE_CORR_BRANCH and prompts/CINEMA_PATH_EDITOR.md). G-BR-6 is
// therefore no longer a spot check against a hardcoded 5 deg: it asserts the MAXIMUM per-sample
// angular delta over the WHOLE sample series inside the authored window against the BASELINE WALK'S
// OWN maximum, both computed here as numbers from the same 901 samples. A correction may not make
// the gaze turn faster than the camera already turns without one.
//
// ⚠ SCOPE (framework rule 4, scope-blind): the wrap only fires when the authored correction is
// NEAR-ANTIPODAL IN YAW to the gaze underneath it. This witness measures and REPORTS whether that
// condition was actually reached (§CPE_CORR_BOUNDED_HAZARD); if it was not, G-BR-6 still judges
// smoothness but has not exercised the defect, and the run says so instead of implying it did.
// Do NOT "improve" the authored correction below — its +60 deg yaw offset is what puts the entry
// gaze near-antipodal on the Hospital reference plan, which is the only reason the bug was visible.
//
// §CPE_AIM_DEPTH_FREEZE (2026-09-01) — WHAT G-FRZ-1..4 PROVE OR DISPROVE. Inside the window the
// blend-from used to be the LIVE pin/depth/path-follow gaze, and §CPE_AIM_DEPTH kept re-aiming it
// (measured 126-140 deg inside one Hospital ramp, leaking a 13.114 deg/sample wobble through 1-w).
// The from-direction is now FROZEN at the window's own edges. G-FRZ-1: it really is constant
// (every sample sits on the fixed curve; red control: the freeze-OFF curve must NOT fit). G-FRZ-2:
// the wobble is measurably reduced (ON vs OFF in ONE run — a no-op dressed as a fix must say
// NO-OP). G-FRZ-3: see the retirement note below. G-FRZ-4: the frozen gaze does not stare into a
// nearer wall than the live one anywhere in the window (product raycaster, not eyes).
//
// §CPE_AIM_DEPTH_RETIRED (2026-09-02, prompts/RESUME_2026-09-02_FILM_REVIEW.md §AIM_DEPTH_RETIREMENT)
// — G-FRZ-3 IS WITHDRAWN, NOT SILENTLY DROPPED. It asserted that the dead-end rescue still worked
// outside the window. That rescue no longer exists: §CPE_AIM_DEPTH was retired on user directive
// and `A._probeAimDepth` / `A.__cpeAimOff` are gone with it, so the gate's own probe cannot run.
// The run now PRINTS the withdrawal (§CPE_AIM_FREEZE_DEADEND RETIRED) instead of skipping in
// silence — a gate that quietly disappears is the scope-blind failure mode framework rule 4 names.
// G-FRZ-1/2/4 are UNAFFECTED and still judge the freeze: it is kept deliberately, because the
// from-direction can still move where a window overlaps a pinned zone or the _openU seam blend.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8533, BLD = process.env.BLD || 'Duplex';
// Walk length is NOT a property of the building — it scales with the film duration the planner is
// given. Measured on Hospital: 60 s -> 39.43 m. So the duration is a parameter of this measurement
// and must be REPORTED with every result, never assumed.
const SECS_IN = +(process.env.SECS || 150);
const N = 900;   // arc samples
process.on('unhandledRejection', e => { console.error('UNHANDLED: ' + (e && e.stack || e)); process.exit(1); });

(async () => {
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 1800000 });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 500 });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  // CLAUDE.md rule 3 — the shipped §-log is PRIMARY EVIDENCE, never suppressed. §CPE_CORR_BRANCH is
  // the runtime's own statement of which branch it resolved per stroke; echo it into this witness's
  // log rather than re-deriving it here.
  const pageLog = [];
  p.on('console', m => { const t = m.text();
    if (/§CPE_CORR_BRANCH|§CINEMA_GAZE_SENSE|§CPE_WALK_BUDGET|§CPE_AIM_DEPTH_FREEZE/.test(t)) pageLog.push(t); });
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.cinemaPathPlan === 'function',
    { timeout: 240000 });
  await p.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue || []).length > 0,
    { timeout: 180000, polling: 250 }).catch(() => {});
  await p.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue || []).length),
    { timeout: 900000, polling: 1000 }).catch(() => {});

  const r = await p.evaluate(async (N, SECS_IN) => {
    const A = window.APP;
    const sample = () => {
      const out = [];
      for (let i = 0; i <= N; i++) {
        const e3 = i / N;
        const g = A._cpeBeat3GazeDebug(e3);
        const dx = g.target.x - g.pos.x, dy = g.target.y - g.pos.y, dz = g.target.z - g.pos.z;
        // NO `|| 1` FALLBACK. A zero-length gaze must be REPORTED, not normalised into (0,0,0) —
        // that guard is what produced a constant, entirely fake "90.000 deg" across 901 samples and
        // got read twice as a real finding (once as an unbounded correction, once as planner
        // nondeterminism). acos of a zero dot is exactly 90 deg, and it looks perfectly plausible.
        const L = Math.hypot(dx, dy, dz);
        out.push({ e3, x: dx / L, y: dy / L, z: dz / L, arcLen: g.arcLen, len: L });
      }
      return out;
    };
    // 1. baseline plan, no corrections
    // signature is (durationSec, ov) — an earlier cut of this witness passed the ov as the FIRST
    // arg and the planner threw `durationSec.toFixed is not a function`. 60 s is the editor's own
    // kind of value; the correction envelope is arc-length based, so duration does not affect it.
    const SECS = SECS_IN;
    // §CPE_CORR_BOUNDED_CONFOUND (2026-09-01, caught by this witness's own run): the baseline used
    // to be cinemaPathPlan(SECS, null) — the DERIVED plan — against cinemaPathPlan(SECS, {ov}).
    // Those are two different plans, not one plan with and without a correction: `null` means
    // "ignore any stored edit" while an ov object goes through the override path, so the ROUTE
    // itself can differ. The diff then read 100% of the walk changed with a 90.00 deg peak at
    // e3=0 — the signature of comparing two unrelated gaze curves, not of an unbounded correction.
    // BOTH plans must now be built through the SAME override path, identical in every field except
    // the one under test. Same discipline as seeding Math.random for the frame-budget sweep:
    // remove the confound, do not try to measure through it.
    let plan = await A.cinemaPathPlan(SECS, { aimCorrections: [] });
    if (!plan) return { fail: 'no plan built' };
    // §CINEMA_BEAT_OVERLAP zone start = 1 - this; the debug hooks exist only once a plan is built.
    const turnOverlap = (A._cpeBeat3GazeDebug(0) || {}).turnOverlap;
    const base = sample();
    const arcLen = base[0].arcLen;
    // 2. one correction, anchored mid-walk, aimed 60 deg off the baseline gaze there
    const mid = base[Math.floor(N / 2)];
    const yaw = Math.atan2(mid.z, mid.x) + Math.PI / 3;          // +60 deg in yaw
    const pit = Math.asin(Math.max(-1, Math.min(1, mid.y)));
    const dir = { x: Math.cos(yaw) * Math.cos(pit), y: Math.sin(pit), z: Math.sin(yaw) * Math.cos(pit) };
    const g = A._cpeBeat3GazeDebug(0.5);
    plan = await A.cinemaPathPlan(SECS, { aimCorrections: [
      { pos: g.pos, dir: dir, rampF: 0.04, holdF: 0.12, decayF: 0.18 }] });
    if (!plan) return { fail: 'no corrected plan built' };
    const corr = sample();   // §CPE_AIM_DEPTH_FREEZE is ON by default — this IS the freeze-on curve
    const rec = A._cpeCorrectionsDebug ? A._cpeCorrectionsDebug() : null;
    // 2b. §CPE_AIM_DEPTH_FREEZE A/B — the SAME plan with the freeze switched off (apply-time flag,
    //     no rebuild: _cpeCorrectionAt reads it per call), i.e. the pre-freeze live blend-from.
    //     One run, both curves — the gate names the issue it proves (CLAUDE.md).
    let frzOff = null;
    A._cpeAimFreezeOff = true;
    try { frzOff = sample(); } finally { A._cpeAimFreezeOff = false; }
    // 2c. gaze-direction CLEARANCE in the window, freeze ON vs OFF, through the product's own
    //     raycaster hook (A._cpeGazeClearDebug) — the nose-against-the-wall number. Every 3rd
    //     sample bounds the ray count.
    const rec0i = rec && rec[0];
    let clearRows = null;
    if (rec0i && typeof A._cpeGazeClearDebug === 'function') {
      const lo = Math.max(0, Math.ceil((rec0i.s - rec0i.rampFrac) * N));
      const hi = Math.min(N, Math.floor((rec0i.s + rec0i.holdFrac + rec0i.decayFrac) * N));
      clearRows = [];
      for (let i = lo; i <= hi; i += 3) {
        const on = A._cpeGazeClearDebug(i / N);
        A._cpeAimFreezeOff = true;
        const off = A._cpeGazeClearDebug(i / N);
        A._cpeAimFreezeOff = false;
        clearRows.push({ e3: i / N, on, off });
      }
    }
    // 2d. the dead-end case §CPE_AIM_DEPTH exists for, measured OUTSIDE the window: where does the
    //     forward-clearance trigger genuinely fire, and does the aim rule still turn the gaze toward
    //     depth there (aimOff A/B, gaze clearance before/after)? Product probes only.
    let deadEnd = null;
    if (rec0i && typeof A._probeAimDepth === 'function') {
      const firing = [];
      for (let i = 0; i <= 90; i++) {
        const e3 = i / 90;
        const outside = e3 < rec0i.s - rec0i.rampFrac || e3 > rec0i.s + rec0i.holdFrac + rec0i.decayFrac;
        if (!outside) continue;
        const d = A._probeAimDepth(e3);
        if (d && d.fired && d.w > 0.5) firing.push({ e3, w: d.w, fwdClear: d.fwdClear, clearM: d.clearM });
      }
      if (firing.length) {
        const f = firing.sort((a, b) => (a.fwdClear - b.fwdClear))[0];   // tightest dead-end
        const n = (gz) => { const dx = gz.target.x - gz.pos.x, dy = gz.target.y - gz.pos.y, dz = gz.target.z - gz.pos.z;
          const L = Math.hypot(dx, dy, dz); return { x: dx / L, y: dy / L, z: dz / L }; };
        const gOn = n(A._cpeBeat3GazeDebug(f.e3));
        const cOn = A._cpeGazeClearDebug ? A._cpeGazeClearDebug(f.e3) : null;
        A.__cpeAimOff = true;
        const gOff = n(A._cpeBeat3GazeDebug(f.e3));
        const cOff = A._cpeGazeClearDebug ? A._cpeGazeClearDebug(f.e3) : null;
        A.__cpeAimOff = false;
        deadEnd = { firingN: firing.length, e3: f.e3, w: f.w, fwdClear: f.fwdClear, clearM: f.clearM,
          turnDeg: Math.acos(Math.max(-1, Math.min(1, gOn.x * gOff.x + gOn.y * gOff.y + gOn.z * gOff.z))) * 180 / Math.PI,
          clearOn: cOn, clearOff: cOff };
      } else deadEnd = { firingN: 0 };
    }
    // 3. THE SAME correction with §CPE_CORR_BRANCH switched OFF — i.e. the naive short-way yaw this
    //    branch replaced. This is the A/B that makes G-BR-6 name its issue: without it the gate would
    //    only assert a number, with no evidence that the number was ever otherwise.
    //    ⚠ §CPE_AIM_DEPTH_FREEZE must ALSO be off here: with the from-direction frozen,
    //    round(raw/2pi) has nothing to step on (raw is constant per phase), so the freeze would MASK
    //    the wrap defect and §CPE_CORR_BRANCH_AB would silently stop discriminating.
    let ab = null;
    if ('_cpeCorrBranchOff' in A || true) {
      A._cpeCorrBranchOff = true;
      A._cpeAimFreezeOff = true;
      try {
        const p2 = await A.cinemaPathPlan(SECS, { aimCorrections: [
          { pos: g.pos, dir: dir, rampF: 0.04, holdF: 0.12, decayF: 0.18 }] });
        if (p2) ab = sample();
      } finally { A._cpeCorrBranchOff = false; A._cpeAimFreezeOff = false; }
      // restore the plan under test — the A/B plan must not be what the rest of the run measures
      await A.cinemaPathPlan(SECS, { aimCorrections: [
        { pos: g.pos, dir: dir, rampF: 0.04, holdF: 0.12, decayF: 0.18 }] });
    }
    return { base, corr, frzOff, clearRows, deadEnd, ab, arcLen, rec, dir, turnOverlap, ok: true };
  }, N, SECS_IN);

  console.log('='.repeat(90) + `\n§CPE_CORR_BOUNDED witness — ${BLD}, one correction, ${N} arc samples\n` + '='.repeat(90));
  if (r.fail) { console.log('  INCONCLUSIVE — ' + r.fail + '; nothing was judged.'); await b.close(); process.exit(1); }
  const deg = (a, c) => Math.acos(Math.max(-1, Math.min(1, a.x * c.x + a.y * c.y + a.z * c.z))) * 180 / Math.PI;
  const L = r.arcLen, mPerSample = L / N;
  // §CPE_CORR_BOUNDED_VACUOUS (2026-09-01, caught by this witness's own first real run): on Duplex
  // the whole walk is 13.85 m and the authored window is 2+8+12 = 22 m — 1.6x the entire path. The
  // window then covers 100% of the walk BY CONSTRUCTION, there are no "outside" samples to compare,
  // and the run scored 3/7 FAIL on a population where the question cannot be asked. A witness must
  // say INCONCLUSIVE, never FAIL, when its population is degenerate.
  // §CPE_CORR_FRACTION — the window is now a SHARE of the walk, so it is the same fraction on every
  // building and can never swallow the path the way the metre-based 22 m did (159% of Duplex). The
  // vacuous gate stays: if the authored share ever exceeds half the route, boundedness is not a
  // question this run can answer.
  const degen = r.base.filter(v => !(v.len > 1e-6)).length + r.corr.filter(v => !(v.len > 1e-6)).length;
  if (degen > 0) {
    console.log(`  INCONCLUSIVE — ${degen} samples have a ZERO-LENGTH gaze (target === pos).`);
    console.log(`  No angle can be computed from those; nothing was judged.`);
    await b.close(); process.exit(2);
  }
  const WINDOW_F = 0.04 + 0.12 + 0.18;
  const WINDOW_M = WINDOW_F * L;
  if (WINDOW_F > 0.5) {
    console.log(`  INCONCLUSIVE — the authored window is ${(100*WINDOW_F).toFixed(0)}% of the walk.`);
    console.log(`  Too much of the path is inside it to ask whether it is bounded. Nothing was judged.`);
    await b.close(); process.exit(2);
  }
  const diff = r.base.map((a, i) => deg(a, r.corr[i]));
  const EPS = 0.05;                                    // degrees — below this the gaze is unchanged
  const touched = diff.map((d, i) => d > EPS ? i : -1).filter(i => i >= 0);
  // NO-OP gate (framework rule 4): the run completed but the correction changed NOTHING. A 0 deg
  // deviation everywhere would otherwise sail through G-BR-1/2/5 — bounded, untouched outside, and
  // no snap are all trivially true of a curve that was never corrected.
  if (!touched.length) {
    console.log('  NO-OP — the corrected plan is identical to the baseline at every one of the ' +
      `${diff.length} samples (max deviation ${Math.max(...diff).toFixed(6)} deg <= EPS ${EPS}).`);
    console.log('  The correction never took effect, so nothing about its shape was judged. INCONCLUSIVE.');
    if (pageLog.length) console.log('  page §-log: ' + pageLog.join('\n              '));
    await b.close(); process.exit(2);
  }
  const first = touched[0], last = touched[touched.length - 1];
  const anchorI = diff.indexOf(Math.max(...diff));
  // The AUTHORED window, straight off the product's own record — NOT the touched band. G-BR-2 used to
  // measure "the max deviation outside the samples whose deviation is <= EPS", which is true by
  // construction and can never fail. Bounding against the authored envelope is the real claim.
  const rec0 = (r.rec && r.rec[0]) || null;
  if (!rec0) {
    console.log('  INCONCLUSIVE — the planner exposed no correction record; the authored window is unknown.');
    await b.close(); process.exit(2);
  }
  const winLoI = Math.max(0, Math.ceil((rec0.s - rec0.rampFrac) * N));
  const winHiI = Math.min(N, Math.floor((rec0.s + rec0.holdFrac + rec0.decayFrac) * N));
  const inWin = (i) => i >= winLoI && i <= winHiI;
  // §CPE_CORR_BOUNDED_ANCHOR — the ANCHOR is rec0.s, the product's own number. G-BR-3/4/5 used to
  // measure reach and edge abruptness from `anchorI`, the index of the LARGEST DEVIATION, as a stand-in
  // for it. Measured wrong on Duplex 2026-09-01: the peak deviation there lands 2.1 m past the anchor
  // (the underlying gaze keeps drifting through the hold, so the deviation keeps growing), which read
  // as "reach BACK 2.71 m against an authored 0.64 m" — a false FAIL about the proxy, not the product.
  // Same defect class as CLAUDE.md 4D_MODEL_INTEGRITY §E. Both numbers are printed; only the authored
  // anchor is judged.
  const sI = Math.round(rec0.s * N);
  const holdHiI = Math.min(N, Math.round((rec0.s + rec0.holdFrac) * N));
  console.log(`  path length ${L.toFixed(2)} m at durationSec=${SECS_IN}   (${mPerSample.toFixed(3)} m per sample)`);
  console.log(`  authored: ramp=4% hold=12% decay=18% of the walk = ${WINDOW_M.toFixed(2)} m` +
    `   record fracs: ${JSON.stringify(r.rec && r.rec[0] ? {ramp:+r.rec[0].rampFrac.toFixed(4), hold:+r.rec[0].holdFrac.toFixed(4), decay:+r.rec[0].decayFrac.toFixed(4)} : null)}`);
  console.log(`  gaze changed over e3 [${(first/N).toFixed(4)} .. ${(last/N).toFixed(4)}]`);
  console.log(`     = ${((last - first) * mPerSample).toFixed(2)} m of the ${L.toFixed(2)} m walk  (${(100*(last-first)/N).toFixed(1)}%)`);
  console.log(`  peak deviation ${Math.max(...diff).toFixed(2)} deg at e3=${(anchorI/N).toFixed(4)}`);
  console.log(`     back of anchor: ${((anchorI - first) * mPerSample).toFixed(2)} m   forward of anchor: ${((last - anchorI) * mPerSample).toFixed(2)} m`);
  // abruptness: degrees of gaze change per metre, on the corrected curve
  const rate = [];
  for (let i = 1; i < r.corr.length; i++) rate.push(deg(r.corr[i - 1], r.corr[i]) / mPerSample);
  const pk = (arr) => arr.length ? Math.max(...arr) : NaN;   // never Math.max of nothing (-Infinity)
  // Edges taken from the AUTHORED envelope, not from the deviation peak: the entry edge is the ramp
  // [s-ramp .. s], the exit edge is the decay [s+hold .. s+hold+decay]. The old exit slice started at
  // the deviation peak and so swept the whole HOLD as if it were the exit.
  const entryPeak = pk(rate.slice(first, Math.max(first + 1, sI)));
  const exitPeak = pk(rate.slice(holdHiI, Math.max(holdHiI + 1, last)));
  const entryPeakOld = pk(rate.slice(first, anchorI)), exitPeakOld = pk(rate.slice(anchorI, last));
  // rate[j] is the pair (j, j+1). The FULL series, both curves, no spot checks.
  const baseRate = [];
  for (let i = 1; i < r.base.length; i++) baseRate.push(deg(r.base[i - 1], r.base[i]) / mPerSample);
  const basePeak = Math.max(...baseRate);
  console.log(`  turn rate  entry(ramp) peak ${entryPeak.toFixed(2)} deg/m   exit(decay) peak ${exitPeak.toFixed(2)} deg/m   (uncorrected walk peak ${basePeak.toFixed(2)} deg/m)`);
  console.log(`             [old deviation-peak proxy, reported only: entry ${entryPeakOld.toFixed(2)} exit ${exitPeakOld.toFixed(2)} deg/m]`);
  console.log(`  anchor: record s=${rec0.s.toFixed(4)} (sample ${sI})   deviation peak at e3=${(anchorI/N).toFixed(4)} (sample ${anchorI}) — ${((anchorI-sI)*mPerSample).toFixed(2)} m apart`);

  // ── §CPE_CORR_BRANCH — G-BR-6's population, stated as numbers before it is judged.
  // Per-SAMPLE angular delta (deg), which is the unit the snap was reported in. Pair (i, i+1) counts
  // as inside the authored window when either end is.
  const winPairs = [], winPairIdx = [];
  for (let j = 0; j < rate.length; j++) if (inWin(j) || inWin(j + 1)) { winPairs.push(rate[j] * mPerSample); winPairIdx.push(j); }
  const winMaxDeg = winPairs.length ? Math.max(...winPairs) : NaN;
  const winMaxAt = winPairs.length ? winPairIdx[winPairs.indexOf(winMaxDeg)] : -1;
  const baseMaxDeg = Math.max(...baseRate) * mPerSample;
  const baseMaxAt = baseRate.indexOf(Math.max(...baseRate));
  // VACUOUS gate: no pair inside the authored window means G-BR-6 judged nothing.
  if (!winPairs.length) {
    console.log(`  VACUOUS — the authored window [${winLoI}..${winHiI}] contains no sample pair; G-BR-6 judged nothing.`);
    console.log('  INCONCLUSIVE.');
    await b.close(); process.exit(2);
  }
  console.log(`§CPE_CORR_BOUNDED_SNAP  in-window max ${winMaxDeg.toFixed(3)} deg/sample at e3=${((winMaxAt+1)/N).toFixed(4)}` +
    `   baseline walk max ${baseMaxDeg.toFixed(3)} deg/sample at e3=${((baseMaxAt+1)/N).toFixed(4)}` +
    `   (${winPairs.length} pairs judged, of ${rate.length})`);
  // The A/B: the SAME authored correction with §CPE_CORR_BRANCH switched off. Names the issue G-BR-6
  // proves. If this comes back at or below the fixed number the gate is not discriminating and says so.
  let abMax = NaN, abAt = -1;
  if (r.ab && r.ab.length === r.corr.length) {
    const abRate = [];
    for (let i = 1; i < r.ab.length; i++) abRate.push(deg(r.ab[i - 1], r.ab[i]));
    const cand = [], candIdx = [];
    for (let j = 0; j < abRate.length; j++) if (inWin(j) || inWin(j + 1)) { cand.push(abRate[j]); candIdx.push(j); }
    if (cand.length) { abMax = Math.max(...cand); abAt = candIdx[cand.indexOf(abMax)]; }
  }
  // The other half of the A/B, and the no-regression proof: how far apart are the two curves at all?
  // Where the authored gaze is NOT near-antipodal, round((raw-refD)/2pi) and round(raw/2pi) agree at
  // every sample, so §CPE_CORR_BRANCH must be a bit-for-bit NO-OP there. 0.0000 is the expected and
  // required answer on such a plan — it is what proves the fix touches nothing it was not aimed at.
  // §CPE_AIM_DEPTH_FREEZE correction to this comparison: `ab` is sampled branch-OFF **and
  // freeze-OFF** (the freeze would mask the wrap — constant from-direction gives round() nothing to
  // step on), so isolating the BRANCH means comparing it against the freeze-OFF branch-ON curve,
  // never against the shipped default — comparing against `corr` here once read the freeze's own
  // 2.79 deg as "the branch fix changes Duplex" and mis-attributed a pre-existing failure.
  const branchOnFrzOff = (r.frzOff && r.frzOff.length === r.corr.length) ? r.frzOff : r.corr;
  let abVsOn = NaN;
  if (r.ab && r.ab.length === r.corr.length) abVsOn = Math.max(...r.ab.map((v, i) => deg(v, branchOnFrzOff[i])));
  console.log('§CPE_CORR_BRANCH_NOOP  max separation between the branch-ON and branch-OFF curves (both freeze-OFF, isolating the branch) over all ' +
    `${r.corr.length} samples = ${isFinite(abVsOn) ? abVsOn.toFixed(4) : 'n/a'} deg ` +
    (isFinite(abVsOn) ? (abVsOn <= 1e-4 ? '(NO-OP — this plan never crosses the wrap, so §CPE_CORR_BRANCH changed nothing here)'
                                        : '(the fix changed this plan, as expected where the wrap fires)') : ''));
  const branchIsNoOp = isFinite(abVsOn) && abVsOn <= 1e-4;
  console.log(`§CPE_CORR_BRANCH_AB  branch OFF (the naive short way) in-window max ` +
    (isFinite(abMax) ? `${abMax.toFixed(3)} deg/sample at e3=${((abAt+1)/N).toFixed(4)}` : 'UNAVAILABLE') +
    `   vs branch ON ${winMaxDeg.toFixed(3)}   ` +
    (isFinite(abMax)
      ? (abMax > baseMaxDeg
          ? `— the defect IS present with the branch off (${abMax.toFixed(1)} > the walk's own ${baseMaxDeg.toFixed(1)}), so G-BR-6 discriminates`
          : `⚠ NOT DISCRIMINATING — the branch-off curve is already within the walk's own ${baseMaxDeg.toFixed(1)}; this plan does not exercise the defect`)
      : '⚠ A/B plan unavailable — G-BR-6 asserts a number with no evidence it was ever otherwise'));
  // Scope report (framework rule 4): was the near-antipodal condition the wrap needs actually met?
  const yawB = Math.atan2(r.dir.z, r.dir.x);
  const nrm = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  let closestToPi = 999, closestAt = -1;
  for (let i = winLoI; i <= winHiI; i++) {
    const g = 180 - Math.abs(nrm(yawB - Math.atan2(r.base[i].z, r.base[i].x)) * 180 / Math.PI);
    if (g < closestToPi) { closestToPi = g; closestAt = i; }
  }
  const hazardHit = closestToPi < 20;
  console.log(`§CPE_CORR_BOUNDED_HAZARD  the authored gaze comes within ${closestToPi.toFixed(2)} deg of ANTIPODAL to the ` +
    `gaze underneath it at e3=${(closestAt/N).toFixed(4)} — wrap hazard ${hazardHit ? 'EXERCISED' : 'NOT exercised (G-BR-6 is scope-blind on this run)'}`);

  // ── §CPE_AIM_DEPTH_FREEZE (2026-09-01, bim-compiler prompts/CINEMA_PATH_EDITOR.md
  // §CPE_AIM_DEPTH_FREEZE) — inside the window the blend-from is now FROZEN at the window's own
  // edges (entry gaze through ramp+hold, exit gaze through decay). Four claims, judged below:
  // constancy, wobble reduction, dead-end preservation outside the window, no clearance regression.
  const frzGates = [];   // appended into G; a claim whose population is degenerate prints
                         // NO-OP/VACUOUS/INCONCLUSIVE instead of silently passing (framework rule 4).
  // How far apart are the ON and OFF curves at all? 0 => the freeze changed NOTHING => NO-OP.
  let frzSep = NaN, frzSepAt = -1;
  if (r.frzOff && r.frzOff.length === r.corr.length) {
    frzSep = 0;
    for (let i = winLoI; i <= winHiI; i++) { const d = deg(r.corr[i], r.frzOff[i]); if (d > frzSep) { frzSep = d; frzSepAt = i / N; } }
  }
  const frzIsNoOp = isFinite(frzSep) && frzSep <= 1e-4;
  console.log(`§CPE_AIM_FREEZE_NOOP  max separation freeze-ON vs freeze-OFF in the window = ` +
    (isFinite(frzSep) ? `${frzSep.toFixed(4)} deg at e3=${frzSepAt.toFixed(4)}` : 'UNAVAILABLE (no OFF curve)') +
    (frzIsNoOp ? ' — NO-OP: the freeze changed nothing on this plan; its gates below are INCONCLUSIVE, not PASS' : ''));
  if (r.frzOff && !frzIsNoOp) {
    // WOBBLE: in-window max per-sample step, ON (the shipped default curve `corr`, already in
    // winMaxDeg) vs OFF; plus the per-sample JERK (second difference), the wiggle the user sees.
    const offRate = [];
    for (let i = 1; i < r.frzOff.length; i++) offRate.push(deg(r.frzOff[i - 1], r.frzOff[i]));
    let offWinMax = 0, offWinAt = -1;
    for (let j = 0; j < offRate.length; j++) if (inWin(j) || inWin(j + 1)) { if (offRate[j] > offWinMax) { offWinMax = offRate[j]; offWinAt = j; } }
    const jerkOf = (rt) => { let m = 0; for (let j = 1; j < rt.length; j++) if ((inWin(j) || inWin(j + 1))) m = Math.max(m, Math.abs(rt[j] - rt[j - 1])); return m; };
    const onRateDeg = rate.map(v => v * mPerSample);
    const jerkOn = jerkOf(onRateDeg), jerkOff = jerkOf(offRate);
    console.log(`§CPE_AIM_FREEZE_WOBBLE  in-window max ON ${winMaxDeg.toFixed(3)} vs OFF ${offWinMax.toFixed(3)} deg/sample` +
      ` (OFF peak at e3=${((offWinAt+1)/N).toFixed(4)})   jerk ON ${jerkOn.toFixed(3)} vs OFF ${jerkOff.toFixed(3)} deg/sample²`);
    // Non-regression is judged on EVERY plan; the REDUCTION claim only where the live from-motion
    // actually moved the curve (frzSep) — on a quiet plan there is nothing to reduce and demanding
    // -20% would fail a no-harm no-op (measured: Duplex sep 2.79 deg, peaks 7.767 vs 7.757 —
    // quiet; Hospital sep 26.63 deg, peaks 7.791 vs 13.114 — the wobble is real there). The 5 deg
    // scope line sits between those two measured clusters and is PRINTED, same treatment as the
    // hazard's own 20 deg line above.
    frzGates.push([`G-FRZ-2a the freeze never WORSENS the in-window peak step — ON ${winMaxDeg.toFixed(3)} <= 1.05 x OFF ${offWinMax.toFixed(3)} + 0.01 deg/sample`,
      isFinite(winMaxDeg) && offWinMax > 0 && winMaxDeg <= offWinMax * 1.05 + 0.01]);
    if (frzSep > 5) {
      frzGates.push([`G-FRZ-2b the freeze REDUCES the in-window peak step by >=20% where the live from-motion is real (sep ${frzSep.toFixed(2)} deg > 5) — ON ${winMaxDeg.toFixed(3)} <= 0.8 x OFF ${offWinMax.toFixed(3)} deg/sample`,
        isFinite(winMaxDeg) && winMaxDeg <= offWinMax * 0.8]);
    } else {
      console.log(`§CPE_AIM_FREEZE_WOBBLE  reduction claim INCONCLUSIVE on this plan — the freeze only moves the curve ${frzSep.toFixed(2)} deg (<5), a QUIET window with nothing above the crossfade floor to reduce; only non-regression (G-FRZ-2a) is judged.`);
    }
    // CONSTANCY: every strictly-in-phase sample must lie on the fixed curve blend(from, authored, w)
    // — w INVERTED from the sample's own pitch (the product's pitch is linear in w), from/refD read
    // off the product's own record. The samples are the product's; this curve is the DEFINITION of
    // "fixed-from". RED CONTROL: the freeze-OFF samples must NOT fit the same curve (live blend-from
    // moves), which is what proves this check can fail.
    const blendRef = (a, bx, by, bz, w, refD) => {
      if (w <= 0) return { x: a.x, y: a.y, z: a.z };
      if (w >= 1) return { x: bx, y: by, z: bz };
      const yawA = Math.atan2(a.z, a.x), pitA = Math.atan2(a.y, Math.hypot(a.x, a.z));
      const yawB = Math.atan2(bz, bx), pitB = Math.atan2(by, Math.hypot(bx, bz));
      const raw = yawB - yawA;
      const dYaw = raw - 2 * Math.PI * Math.round((raw - refD) / (2 * Math.PI));
      const yw = yawA + dYaw * w, pt = pitA + (pitB - pitA) * w, cp = Math.cos(pt);
      return { x: Math.cos(yw) * cp, y: Math.sin(pt), z: Math.sin(yw) * cp };
    };
    // Samples past e3 = 1 - turnOverlap are EXCLUDED: §CINEMA_BEAT_OVERLAP blends the gaze toward
    // the orbit AFTER the correction step, so the composed gaze there is no longer the pure
    // correction curve — measured as a false 7.48 deg "non-constancy" on Duplex, whose decay tail
    // crosses that product boundary (read from the product via _cpeBeat3GazeDebug, not hardcoded).
    const overlapLoI = (r.turnOverlap != null && isFinite(r.turnOverlap)) ? Math.floor((1 - r.turnOverlap) * N) : N + 1;
    const fitErr = (curve, from, lo, hi) => {
      if (!from) return NaN;
      const pitA = Math.atan2(from.y, Math.hypot(from.x, from.z));
      const pitB = Math.atan2(r.dir.y, Math.hypot(r.dir.x, r.dir.z));
      let mx = 0, n = 0;
      for (let i = lo + 1; i < Math.min(hi, overlapLoI); i++) {
        const s = curve[i];
        const pit = Math.atan2(s.y, Math.hypot(s.x, s.z));
        if (Math.abs(pitB - pitA) < 1e-3) continue;      // pitch channel too flat to invert here
        const w = Math.max(0, Math.min(1, (pit - pitA) / (pitB - pitA)));
        mx = Math.max(mx, deg(s, blendRef(from, r.dir.x, r.dir.y, r.dir.z, w, rec0.refD || 0)));
        n++;
      }
      return n ? mx : NaN;
    };
    const eDir = rec0.entryDir, xDir = rec0.exitDir;
    if (!eDir || !xDir) {
      console.log('§CPE_AIM_FREEZE_CONST  INCONCLUSIVE — the record carries no frozen entry/exit dir ' +
        `(entry=${!!eDir} exit=${!!xDir}); the product degraded to the live blend-from and constancy was not judged.`);
    } else {
      const rampErrOn = fitErr(r.corr, eDir, winLoI, sI), decayErrOn = fitErr(r.corr, xDir, holdHiI, winHiI);
      const rampErrOff = fitErr(r.frzOff, eDir, winLoI, sI), decayErrOff = fitErr(r.frzOff, xDir, holdHiI, winHiI);
      // The frozen dirs must BE the uncorrected gaze at the window edges (baseline curve, nearest
      // sample; 1.0 deg tolerance covers the half-sample rounding at the local base turn rate).
      const eVsBase = deg(eDir, r.base[Math.max(0, Math.round((rec0.s - rec0.rampFrac) * N))]);
      const xVsBase = deg(xDir, r.base[Math.min(N, Math.round((rec0.s + rec0.holdFrac + rec0.decayFrac) * N))]);
      console.log(`§CPE_AIM_FREEZE_CONST  fixed-from fit: ON ramp ${isFinite(rampErrOn)?rampErrOn.toFixed(4):'n/a'} / decay ${isFinite(decayErrOn)?decayErrOn.toFixed(4):'n/a'} deg` +
        `   red control OFF ramp ${isFinite(rampErrOff)?rampErrOff.toFixed(3):'n/a'} / decay ${isFinite(decayErrOff)?decayErrOff.toFixed(3):'n/a'} deg` +
        `   entryDirVsBase ${eVsBase.toFixed(3)} exitDirVsBase ${xVsBase.toFixed(3)} deg` +
        (overlapLoI <= winHiI ? `   (samples past e3=${(overlapLoI/N).toFixed(3)} excluded: §CINEMA_BEAT_OVERLAP orbit hand-off, applied after the correction)` : ''));
      frzGates.push([`G-FRZ-1  the blend-from is CONSTANT across the window — every in-phase sample sits on the fixed entry/exit->authored curve to <=0.05 deg (ON ramp ${isFinite(rampErrOn)?rampErrOn.toFixed(4):'n/a'}, decay ${isFinite(decayErrOn)?decayErrOn.toFixed(4):'n/a'}) and the frozen dirs equal the uncorrected edge gazes to <=1.0 deg — red control: the OFF curve does NOT fit (ramp ${isFinite(rampErrOff)?rampErrOff.toFixed(2):'n/a'} deg)`,
        isFinite(rampErrOn) && rampErrOn <= 0.05 && isFinite(decayErrOn) && decayErrOn <= 0.05 &&
        eVsBase <= 1.0 && xVsBase <= 1.0 && isFinite(rampErrOff) && rampErrOff > 1.0]);
    }
  } else if (!r.frzOff) {
    console.log('§CPE_AIM_FREEZE_WOBBLE  INCONCLUSIVE — no freeze-OFF curve was sampled; nothing was judged.');
  }
  // CLEARANCE (nose-against-the-wall): the freeze must not create frames staring into a nearer wall
  // than the live blend already did. Product raycaster, in-window, both curves.
  if (r.clearRows && r.clearRows.length) {
    const ok = r.clearRows.filter(c => c.on != null && c.off != null);
    if (!ok.length) {
      console.log('§CPE_AIM_FREEZE_CLEAR  INCONCLUSIVE — the clearance hook returned null on every sample; nothing was judged.');
    } else {
      const minOn = ok.reduce((s, v) => v.on < s.on ? v : s), minOff = ok.reduce((s, v) => v.off < s.off ? v : s);
      let worst = null;
      ok.forEach(v => { const d = v.off - v.on; if (!worst || d > worst.off - worst.on) worst = v; });
      console.log(`§CPE_AIM_FREEZE_CLEAR  in-window gaze clearance minima: ON ${minOn.on.toFixed(2)} m @e3=${minOn.e3.toFixed(3)}` +
        `  OFF ${minOff.off.toFixed(2)} m @e3=${minOff.e3.toFixed(3)}  worst per-sample drop ` +
        (worst ? `${(worst.off - worst.on).toFixed(2)} m @e3=${worst.e3.toFixed(3)} (${worst.off.toFixed(2)} -> ${worst.on.toFixed(2)} m)` : 'n/a') +
        `  (${ok.length} rays/curve)`);
      frzGates.push([`G-FRZ-4  no clearance regression — min gaze clearance frozen ${minOn.on.toFixed(2)} m >= live ${minOff.off.toFixed(2)} m - 0.05 (nose-against-the-wall not reintroduced)`,
        minOn.on >= minOff.off - 0.05]);
    }
  } else {
    console.log('§CPE_AIM_FREEZE_CLEAR  INCONCLUSIVE — no clearance rows (hook missing?); nothing was judged.');
  }
  // DEAD-END: outside the window the depth rule is untouched and must still rescue a wall-facing
  // look-ahead. Judged only where the trigger GENUINELY fires (fwdClear < clearM, the product's own
  // numbers) — otherwise VACUOUS, stated, not passed.
  if (!r.deadEnd) {
    console.log('§CPE_AIM_FREEZE_DEADEND  RETIRED — §CPE_AIM_DEPTH was retired 2026-09-02 (user ' +
      'directive: path-follow only). There is no dead-end rescue left to preserve, so G-FRZ-3 is ' +
      'WITHDRAWN rather than judged. This is a scope statement, not a PASS and not a failure.');
  } else {
    if (r.deadEnd.firingN === 0) {
      console.log('§CPE_AIM_FREEZE_DEADEND  VACUOUS — §CPE_AIM_DEPTH never fires (w>0.5) outside the window on this plan; the dead-end claim was NOT judged.');
    } else {
      const d = r.deadEnd;
      console.log(`§CPE_AIM_FREEZE_DEADEND  fires at ${d.firingN} outside-window probes; tightest e3=${d.e3.toFixed(3)}: ` +
        `fwdClear ${d.fwdClear.toFixed(2)} m < clearM ${d.clearM.toFixed(2)} m, depth turns the gaze ${d.turnDeg.toFixed(2)} deg ` +
        `(aimOff A/B), gaze clearance ${d.clearOff != null ? d.clearOff.toFixed(2) : 'n/a'} -> ${d.clearOn != null ? d.clearOn.toFixed(2) : 'n/a'} m`);
      frzGates.push([`G-FRZ-3  dead-end rescue PRESERVED outside the window — trigger genuinely fires (${d.fwdClear.toFixed(2)} < ${d.clearM.toFixed(2)} m) and depth still turns the gaze ${d.turnDeg.toFixed(2)} deg toward clearance (${d.clearOff != null && d.clearOn != null ? d.clearOff.toFixed(2) + ' -> ' + d.clearOn.toFixed(2) + ' m' : 'clearance n/a'})`,
        d.fwdClear < d.clearM && d.turnDeg > 1 &&
        (d.clearOn == null || d.clearOff == null || d.clearOn >= d.clearOff - 0.05)]);
    }
  }
  const outsideAuthored = diff.filter((d, i) => !inWin(i));
  const outAuthoredMax = Math.max(0, ...outsideAuthored);
  const reachFrac = (last - first) / N;
  console.log(`§CPE_CORR_BOUNDED_REACH  window ${(100*reachFrac).toFixed(1)}% of the walk against the authored ` +
    `${(100*WINDOW_F).toFixed(1)}%   |   §CPE_CORR_BOUNDED_DRIFT outside the authored window max ${outAuthoredMax.toFixed(4)} deg ` +
    `over ${outsideAuthored.length} samples`);
  if (pageLog.length) console.log('  page §-log: ' + pageLog.join('\n              '));
  const G = [
    [`G-BR-1  the correction is BOUNDED — it does NOT run to the end of the walk (ends at e3=${(last/N).toFixed(3)})`, last < N - 2],
    // NOT the old "outside the untouched band, is it untouched" — that was true by construction and
    // could never fail. Bounded against the AUTHORED envelope, at the 0.031 deg the 6/7 run measured.
    [`G-BR-2  outside the AUTHORED window the gaze is untouched to <=0.031 deg (measured ${outAuthoredMax.toFixed(4)} deg over ${outsideAuthored.length} samples)`,
      outsideAuthored.length > 0 && outAuthoredMax <= 0.031],
    [`G-BR-3  reach BACK from the AUTHORED anchor is the authored ${(100*rec0.rampFrac).toFixed(0)}% = ${(rec0.rampFrac*L).toFixed(2)} m (measured ${((sI-first)*mPerSample).toFixed(2)} m)`,
      (sI - first) * mPerSample <= rec0.rampFrac * L * 1.35 && (sI - first) * mPerSample >= rec0.rampFrac * L * 0.6],
    [`G-BR-4  reach FORWARD from the AUTHORED anchor is hold+decay = ${((rec0.holdFrac+rec0.decayFrac)*L).toFixed(2)} m (measured ${((last-sI)*mPerSample).toFixed(2)} m)`,
      (last - sI) * mPerSample <= (rec0.holdFrac + rec0.decayFrac) * L * 1.3 && (last - sI) * mPerSample >= (rec0.holdFrac + rec0.decayFrac) * L * 0.7],
    [`G-BR-5  the exit(decay) edge is no more abrupt than the entry(ramp) edge (${exitPeak.toFixed(2)} <= ${entryPeak.toFixed(2)} deg/m)`,
      isFinite(entryPeak) && isFinite(exitPeak) && exitPeak <= entryPeak * 1.05],
    // §CPE_CORR_BRANCH. Number against number, over every pair in the window, not a spot check and
    // not a hardcoded constant: a correction may not turn the gaze faster than the walk already does.
    [`G-BR-6  no snap anywhere in the window — the worst in-window sample (${winMaxDeg.toFixed(3)} deg) is no worse than the uncorrected walk's own worst (${baseMaxDeg.toFixed(3)} deg)`,
      isFinite(winMaxDeg) && isFinite(baseMaxDeg) && winMaxDeg <= baseMaxDeg],
    [`G-BR-7  the window reaches the authored share of the walk — ${(100*reachFrac).toFixed(1)}% against ${(100*WINDOW_F).toFixed(1)}% (tol 2 pts)`,
      Math.abs(reachFrac - WINDOW_F) <= 0.02],
    ['G-BR-8  no page errors', errs.length === 0],
    // §CPE_AIM_DEPTH_FREEZE gates — only the ones whose population was real (a degenerate one
    // printed NO-OP/VACUOUS/INCONCLUSIVE above and is deliberately NOT in this list, so it can
    // never count as PASS).
    ...frzGates
  ];
  let pass = 0; G.forEach(([n, v]) => { console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n); if (v) pass++; });
  if (errs.length) console.log('  errors: ' + errs.slice(0, 2).join(' | '));
  console.log(`\n  ${pass}/${G.length} — ${pass === G.length ? 'PASS' : 'FAIL'}` +
    (pass === G.length && !hazardHit ? '  ⚠ but the wrap hazard was NOT exercised on this plan — see §CPE_CORR_BOUNDED_HAZARD' : ''));
  // ATTRIBUTION, so a failure is never silently pinned on the wrong change. §CPE_CORR_BRANCH is
  // provably not the cause of any failure on a plan where it is a bit-for-bit no-op — the gates are
  // computed from the corrected curve, and that curve is identical with the branch on and off.
  if (pass < G.length) {
    console.log('§CPE_CORR_BOUNDED_ATTRIB  ' + (branchIsNoOp
      ? `§CPE_CORR_BRANCH is a NO-OP on this plan (curves identical to ${abVsOn.toFixed(6)} deg), so the ` +
        `${G.length - pass} failing gate(s) above are PRE-EXISTING and NOT caused by it.`
      : 'the branch fix DOES change this plan, so a failing gate here may be attributable to it — investigate.'));
  }
  await b.close();
  process.exit(pass === G.length ? 0 : 1);
})();
