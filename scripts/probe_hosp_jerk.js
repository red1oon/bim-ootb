// Probe: is the 81 deg/frame peak on Hospital a STEP or a fast turn?
// §CPE_JERK_DEFINITION item 3 — resample the same neighbourhood at 100x density. A real turn
// shrinks ~100x; a genuine discontinuity stays the same size. Also reports the position step
// (metres/frame) at the same place, which is the UNGATED half of the jerk definition.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8403;
const BLD = process.env.BLD || 'Hospital';
const FPS = 15, DUR = 24;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaSeedBands,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });

  const out = await page.evaluate(async (dur, fps) => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
    if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
    A._cinemaPathEdit = null;
    const derived = A.cinemaPathPlan(dur, null);
    const seeded = A.cinemaSeedBands(derived.waypoints, derived.pathLen);
    const hostile = seeded.map((b, i) => ({
      c: { x: b.c.x, y: b.c.y, z: b.c.z },
      d: i % 2 ? { x: -b.d.x, y: b.d.y, z: -b.d.z } : { x: b.d.x, y: b.d.y, z: b.d.z },
      len: b.len,
    }));
    // EXACTLY the call witness_cpe_even_turn's run() makes — the BANDS path, not the waypoints
    // path. They plan differently, and probing the wrong one is how the first pass measured 10.2
    // deg/frame where the gate measured 81.0 on the same building.
    const plan = A.cinemaPathPlan(dur, { bands: hostile, _total: dur });

    const dir = (p) => {
      const x = p.tx - p.x, y = p.ty - p.y, z = p.tz - p.z;
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    };
    const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;

    // 1. locate the peak at REAL frame density
    const n = Math.max(2, Math.round(dur * fps));
    let peak = 0, peakI = 0;
    for (let i = 1; i < n; i++) {
      const d = ang(dir(plan.poseAt((i - 1) / (n - 1))), dir(plan.poseAt(i / (n - 1))));
      if (d > peak) { peak = d; peakI = i; }
    }
    const uA = (peakI - 1) / (n - 1), uB = peakI / (n - 1);

    // 2. resample THAT interval at 100x density — step vs fast turn
    const M = 100;
    let sub = 0, subAt = 0;
    for (let k = 1; k <= M; k++) {
      const p0 = plan.poseAt(uA + (uB - uA) * (k - 1) / M);
      const p1 = plan.poseAt(uA + (uB - uA) * k / M);
      const d = ang(dir(p0), dir(p1));
      if (d > sub) { sub = d; subAt = uA + (uB - uA) * (k - 0.5) / M; }
    }

    // 3. the UNGATED half: position step per frame, whole film + at the peak
    let posPeak = 0, posPeakU = 0;
    for (let i = 1; i < n; i++) {
      const p0 = plan.poseAt((i - 1) / (n - 1)), p1 = plan.poseAt(i / (n - 1));
      const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
      if (d > posPeak) { posPeak = d; posPeakU = i / (n - 1); }
    }
    const pA = plan.poseAt(uA), pB = plan.poseAt(uB);
    return {
      peak, uA, uB, sub, subAt, ratio: peak / (sub || 1e-9),
      beats: plan.beats, walkSec: plan.sec && plan.sec.out, natural: plan.naturalTotal,
      posPeak, posPeakU, posAtPeak: Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z),
      gazeA: dir(pA), gazeB: dir(pB), pathLen: plan.pathLen,
    };
  }, DUR, FPS);

  const inWalk = out.uB > out.beats.spin && out.uB <= out.beats.out;
  console.log(`\n=== ${BLD} — peak gaze sweep ${out.peak.toFixed(1)} deg/frame at u=${out.uB.toFixed(3)} ===`);
  console.log(`beats: spin=${out.beats.spin.toFixed(3)} out=${out.beats.out.toFixed(3)} -> peak is ${inWalk ? 'INSIDE the walk (§CPE_EVEN_TURN governs it)' : 'OUTSIDE the walk (pacing cannot touch it)'}`);
  console.log(`100x resample of that interval: max sub-step ${out.sub.toFixed(2)} deg at u=${out.subAt.toFixed(5)}`);
  console.log(`ratio peak/sub = ${out.ratio.toFixed(1)}x  ->  ${out.ratio > 30 ? 'FAST TURN (shrinks with density)' : 'STEP / DISCONTINUITY (does not shrink)'}`);
  console.log(`gaze before: (${out.gazeA.x.toFixed(3)},${out.gazeA.y.toFixed(3)},${out.gazeA.z.toFixed(3)})`);
  console.log(`gaze after : (${out.gazeB.x.toFixed(3)},${out.gazeB.y.toFixed(3)},${out.gazeB.z.toFixed(3)})`);
  console.log(`position step at that frame: ${out.posAtPeak.toFixed(3)} m`);
  console.log(`position step PEAK over film: ${out.posPeak.toFixed(3)} m/frame at u=${out.posPeakU.toFixed(3)} (walk ${out.pathLen.toFixed(1)}m over ${out.walkSec ? out.walkSec.toFixed(1) : '?'}s)`);
  const cpe = logs.filter(l => /§CPE_EVEN_TURN|§CPE_SEAM_CONTINUOUS|§CINEMA_BEATS/.test(l));
  console.log('\n' + (cpe.length ? cpe.join('\n') : '(no §CPE plan lines captured)'));
  await browser.close();
})();
