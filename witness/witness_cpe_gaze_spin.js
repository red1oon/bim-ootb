// WITNESS — §CPE_GAZE_SPIN: the gaze follows the path. A revolution in place is a DEFECT.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_GAZE_SPIN (user ruling 2026-07-27:
// "no reason to if it follows its path, even at wp1, no reason not to follow").
//
// WHY A NEW GATE — T2 (witness_cpe_even_turn) measures deg per FRAME and structurally CANNOT see
// this: a 360 deg revolution spread smoothly over 40 frames is 9 deg/frame and passes. Hospital
// accumulates ~888 deg of gaze sweep across the film with T2 green. The signature of a spin in
// place is ACCUMULATED turn >> NET turn over a stretch of path the camera barely moves along.
//
//   S1 no window of the film turns the gaze through a revolution it does not keep: over any
//      WINDOW_SEC stretch, accumulated - |net| must stay under SPIN_DEG. A real corner turns 90 deg
//      and KEEPS it (accumulated ~= net, waste ~= 0); a spin-in-place turns 360 and keeps 0.
//   S2 the same, restricted to the WALK beat, where the user saw it (wp1 is inside the walk) —
//      reported separately so a defect in the orbit/rise cannot mask or be masked by it.
//   S3 INFO, not gated: the worst window's arc length, so a large waste with a large translation
//      (a genuine switchback, which IS following the path) is distinguishable from one in place.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8403;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const FPS = 15, DUR = 24;
const WINDOW_SEC = parseFloat(process.env.WIN || '2.0');   // the stretch a viewer reads as "one move"
const SPIN_DEG = parseFloat(process.env.SPIN || '120');    // waste this large is a turn the film throws away
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
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 120000, polling: 2000 });

    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const res = await page.evaluate(async (dur, fps, winSec) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      A._cinemaPathEdit = null;
      const plan = A.cinemaPathPlan(dur, null);
      // The product bakes plan.naturalTotal seconds (cinema_maxq.js:414) — sampling `dur` measures a
      // film no user sees. Same instrument bug that hid T2/B5 for two sessions.
      const nSec = plan.naturalTotal || dur;
      const n = Math.max(4, Math.round(nSec * fps));
      const beats = plan.beats || {};
      const g = [], pos = [];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), p = plan.poseAt(u);
        const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        const L = Math.hypot(dx, dy, dz) || 1;
        g.push({ x: dx / L, y: dy / L, z: dz / L });
        pos.push({ x: p.x, y: p.y, z: p.z });
      }
      const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;
      const beatOf = (u) => (u <= beats.dive ? 'dive' : u <= beats.spin ? 'spin' : u <= beats.out ? 'walk'
                            : u <= beats.rise ? 'rise' : 'orbit');
      const wFrames = Math.max(2, Math.round(winSec * fps));
      // Waste = accumulated - |net|: the turning the film performs and then gives back. A corner
      // that is kept costs 0 waste however sharp it is, so this gate cannot fire on real cornering.
      let worst = null, worstWalk = null;
      for (let i = 0; i + wFrames < n; i++) {
        let acc = 0, arc = 0;
        for (let k = i + 1; k <= i + wFrames; k++) {
          acc += ang(g[k - 1], g[k]);
          arc += Math.hypot(pos[k].x - pos[k - 1].x, pos[k].y - pos[k - 1].y, pos[k].z - pos[k - 1].z);
        }
        const net = ang(g[i], g[i + wFrames]);
        const rec = { waste: acc - net, acc, net, arc, u0: i / (n - 1), u1: (i + wFrames) / (n - 1),
                      beat: beatOf((i + wFrames / 2) / (n - 1)) };
        if (!worst || rec.waste > worst.waste) worst = rec;
        if (rec.beat === 'walk' && (!worstWalk || rec.waste > worstWalk.waste)) worstWalk = rec;
      }
      // Whole-film accumulated sweep, for context against the 888 deg the handover recorded.
      let totalAcc = 0;
      for (let i = 1; i < n; i++) totalAcc += ang(g[i - 1], g[i]);
      return { worst, worstWalk, totalAcc, frames: n, nSec, beats, pathLen: plan.pathLen };
    }, DUR, FPS, WINDOW_SEC);

    const f = (r) => r ? `waste=${r.waste.toFixed(1)} deg (accumulated ${r.acc.toFixed(1)}, net ${r.net.toFixed(1)}) ` +
      `over ${WINDOW_SEC}s at u=${r.u0.toFixed(3)}..${r.u1.toFixed(3)} in the ${r.beat}, arc ${r.arc.toFixed(2)}m` : '(none)';

    P(`S1 no ${WINDOW_SEC}s window throws away more than ${SPIN_DEG} deg of gaze turn`,
      !!res.worst && res.worst.waste < SPIN_DEG, f(res.worst));
    P(`S2 the WALK beat specifically (where wp1 lives) throws away less than ${SPIN_DEG} deg`,
      !res.worstWalk || res.worstWalk.waste < SPIN_DEG, f(res.worstWalk));
    console.log(`  INFO  film ${res.nSec.toFixed(1)}s / ${res.frames} frames, path ${res.pathLen.toFixed(1)}m, ` +
      `whole-film accumulated gaze sweep ${res.totalAcc.toFixed(0)} deg`);
    console.log(`  INFO  S3 worst window arc length ${res.worst ? res.worst.arc.toFixed(2) : '?'}m — ` +
      `near zero means the camera turned without going anywhere (a spin in place); metres mean a real switchback`);
    console.log(`  INFO  beats ${JSON.stringify(res.beats)}`);
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
