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
    const corr = sample();
    const rec = A._cpeCorrectionsDebug ? A._cpeCorrectionsDebug() : null;
    return { base, corr, arcLen, rec, ok: true };
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
  const first = touched[0], last = touched[touched.length - 1];
  const anchorI = diff.indexOf(Math.max(...diff));
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
  const entryPeak = pk(rate.slice(first, anchorI));
  const exitPeak = pk(rate.slice(anchorI, last));
  const basePeak = Math.max(...r.base.slice(1).map((_, i) => deg(r.base[i], r.base[i + 1]) / mPerSample));
  console.log(`  turn rate  entry peak ${entryPeak.toFixed(2)} deg/m   exit peak ${exitPeak.toFixed(2)} deg/m   (uncorrected walk peak ${basePeak.toFixed(2)} deg/m)`);
  const outside = diff.filter((d, i) => i < first || i > last);
  const G = [
    [`G-BR-1  the correction is BOUNDED — it does NOT run to the end of the walk (ends at e3=${(last/N).toFixed(3)})`, last < N - 2],
    [`G-BR-2  everything outside the window is untouched (max ${Math.max(0, ...outside).toFixed(4)} deg)`,
      outside.length > 0 && Math.max(0, ...outside) <= EPS],
    [`G-BR-3  reach BACK is about the authored 4% = ${(0.04*L).toFixed(2)} m (measured ${((anchorI-first)*mPerSample).toFixed(2)} m)`,
      (anchorI - first) * mPerSample <= 0.04 * L * 2.2],
    [`G-BR-4  reach FORWARD is about hold+decay = ${(0.30*L).toFixed(2)} m (measured ${((last-anchorI)*mPerSample).toFixed(2)} m)`,
      (last - anchorI) * mPerSample <= 0.30 * L * 1.3 && (last - anchorI) * mPerSample >= 0.30 * L * 0.7],
    [`G-BR-5  the exit is no more abrupt than the entry (${exitPeak.toFixed(2)} <= ${entryPeak.toFixed(2)} deg/m)`,
      isFinite(entryPeak) && isFinite(exitPeak) && exitPeak <= entryPeak * 1.05],
    ['G-BR-6  no snap anywhere in the window — no single sample jumps more than 5 deg',
      Math.max(...rate.slice(first, last).map(v => v * mPerSample)) < 5],
    ['G-BR-7  no page errors', errs.length === 0]
  ];
  let pass = 0; G.forEach(([n, v]) => { console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n); if (v) pass++; });
  if (errs.length) console.log('  errors: ' + errs.slice(0, 2).join(' | '));
  console.log(`\n  ${pass}/${G.length} — ${pass === G.length ? 'PASS' : 'FAIL'}`);
  await b.close();
  process.exit(pass === G.length ? 0 : 1);
})();
