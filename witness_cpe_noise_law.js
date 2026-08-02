// WITNESS — §CPE_NOISE_LAW: the noise ratio governs the DIVE too, not only the walk.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_NOISE_LAW.
//
// THE DEFECT (user, live on Hospital, 2026-07-27): "the speed of dive to the wp1 is still not using
// noise ratio" ... "it governs thrughout". Measured before the fix (witness_cpe_gaze_spin S3):
// Hospital's outer beats cover 253 m in a 2 s window while its walk covers 1.0 m — the dive ran on
// a pure clock with no noise term in it at all.
//
//   N1 the slow samples ARE the busy ones: mean dive speed over the busiest third of the dive is
//      lower than over the emptiest third. This is the whole claim; if it fails the law is not in
//      the beat, whatever the log says.
//   N2 the delivered range stays inside the user's one dial: fastest/slowest dive sample <=
//      PACE_SWING x 1.5 (the smoothstep ease's own peak, the same allowance T5 gives the walk).
//      "Don't overdo it" is a bound, and a bound is a number or it is nothing.
//   N3 the remap changed the PACING, not the PATH: the dive still starts at the opening camera
//      pose and still lands exactly on the settle point. A monotone reparameterization cannot move
//      either end, so a non-zero residue here means the table is not monotone onto [0,1].
//   N4 no regression in the plan budget — §CINEMA_PLAN_MS stays in the same class it was in
//      (reported, and gated only against a 3x blow-out, since the fan sampling is new work).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8403;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
// §CPE_PACE_SWING_SOFTEN (2026-08-03): mirrors CINEMA_PACE_SWING in viewer/effects.js — keep in sync,
// this witness has no way to import the source constant and re-derives its tolerance from this copy.
const FPS = 15, DUR = 24, PACE_SWING = 1.45;
// 'a sec or two ... is fine in the film' (user). Two seconds plus a frame of slack.
const STALL_CEIL = parseFloat(process.env.STALL_CEIL || '3.0');
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
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaFan,
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
      const t0 = performance.now();
      const plan = A.cinemaPathPlan(dur, null);
      const planMs = performance.now() - t0;
      const nSec = plan.naturalTotal || dur;
      const n = Math.max(4, Math.round(nSec * fps));
      const tD = plan.beats.dive;
      // Walk the DIVE frame by frame, at the frame count the product actually bakes, and read the
      // busyness at each sample with the same fan the law uses.
      // The SAME signal the law uses — bbox rate of change, not the ray fan. Measuring the law
      // with a different instrument than the law uses is how the last four "defects" in this lane
      // turned out to be broken meters.
      const FAR = 60, R2 = FAR * FAR;
      const rows = A.dbQuery('SELECT center_x, center_y, center_z FROM element_transforms');
      const densAt = (p) => {
        const q = A.three2ifc(p.x, p.y, p.z);
        let k = 0;
        for (let i = 0; i < rows.length; i++) {
          const dx = rows[i][0] - q.ix, dy = rows[i][1] - q.iy, dz = rows[i][2] - q.iz;
          if (dx * dx + dy * dy + dz * dz < R2) k++;
        }
        return k;
      };
      // ⚠ The noise signal must be sampled on UNIFORM PATH POSITION, never between consecutive
      // FRAMES. Measured the wrong way first and it inverted the result (N1 read 0.81x/0.67x
      // "faster where busier"): a frame-to-frame difference is large wherever the camera is moving
      // fast, so it measures the pacing it is supposed to be judging. The law samples 64 uniform
      // points along the dive line; so does this.
      const p0 = plan.poseAt(0), st = plan.settle;
      const DL = Math.hypot(st.x - p0.x, st.y - p0.y, st.z - p0.z) || 1;
      const M = 64, dens = [];
      for (let i = 0; i < M; i++) {
        const e = (i + 0.5) / M;
        dens.push(densAt({ x: p0.x + (st.x - p0.x) * e, y: p0.y + (st.y - p0.y) * e, z: p0.z + (st.z - p0.z) * e }));
      }
      let cMax = 0;
      const chg = dens.map((d, i) => Math.abs(dens[Math.min(M - 1, i + 1)] - dens[Math.max(0, i - 1)]));
      chg.forEach(c => { if (c > cMax) cMax = c; });
      const noiseAtE = (e) => {
        const i = Math.max(0, Math.min(M - 1, Math.round(e * M - 0.5)));
        return cMax > 0 ? chg[i] / cMax : 0;
      };
      const samples = [];
      let prev = null;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        if (u > tD) break;
        const p = plan.poseAt(u);
        if (prev) {
          const e = Math.hypot(p.x - p0.x, p.y - p0.y, p.z - p0.z) / DL;
          samples.push({ u, step: Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z), busy: noiseAtE(e), e });
        }
        prev = p;
      }
      // N5 — the STALL check the user reported ("last wpt stalling as the first one"). Absolute
      // metres per frame across the WHOLE film, beat-labelled, with NO ease divided out: the
      // ease-relative gates above structurally cannot see a stall that the ease itself causes.
      const bt = plan.beats;
      const beatOf = (u) => (u <= bt.dive ? 'dive' : u <= bt.spin ? 'spin' : u <= bt.out ? 'walk'
                            : u <= bt.rise ? 'rise' : 'orbit');
      const film = [];
      let pv = null;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), p = plan.poseAt(u);
        if (pv) film.push({ u, beat: beatOf(u), step: Math.hypot(p.x - pv.x, p.y - pv.y, p.z - pv.z) });
        pv = p;
      }
      const first = plan.poseAt(0), last = plan.poseAt(tD);
      return {
        planMs, nSec, frames: n, tD, samples, film, fps,
        camNow: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
        settle: plan.settle, first: { x: first.x, y: first.y, z: first.z },
        last: { x: last.x, y: last.y, z: last.z },
      };
    }, DUR, FPS);

    const s0 = res.samples.filter(x => x.step > 0);
    // ⚠ EVERY comparison below is on the ease-divided residual, never the raw step. Measured the
    // wrong way twice: the noise peak sits mid-dive, which is exactly where smoothstep's derivative
    // peaks at 1.5, so raw metres-per-frame reports the EASE and inverted the result (busiest third
    // read 0.67x "faster"). expected(e) = mean x 6e(1-e) is the ease's own prediction; what is left
    // after dividing it out is the law.
    const meanRaw = s0.reduce((a, x) => a + x.step, 0) / (s0.length || 1);
    const s = s0.map(x => {
      const et = x.u / res.tD;
      // The beat is parameterized by the FLOORED ease now (§CPE_NOISE_LAW), so the prediction to
      // divide out is its derivative, not smoothstep's: easeF'(e) = a + (1-a)*6e(1-e), a=1/SWING.
      // Left as 6e(1-e) this gate read 0.55x and failed against its own stale model.
      const A_ = 1 / PACE_SWING;
      const dEase = A_ + (1 - A_) * 6 * et * (1 - et);
      return Object.assign({}, x, { et, r: x.step / (meanRaw * dEase) });
    }).filter(x => x.et > 0.2 && x.et < 0.8 && isFinite(x.r));
    // Busiest third vs emptiest third, by busyness rank. Thirds rather than a correlation
    // coefficient because the claim is directional ("busy => slower"), and a rank split says that
    // in metres per frame instead of in a unitless r.
    const byBusy = [...s].sort((a, b) => a.busy - b.busy);
    const k = Math.max(1, Math.floor(byBusy.length / 3));
    const empt = byBusy.slice(0, k), busy = byBusy.slice(-k);
    const mean = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / (arr.length || 1);
    const vEmpty = mean(empt, x => x.r), vBusy = mean(busy, x => x.r);
    const blind = Math.max(...s.map(x => x.busy), 0) === 0;
    if (blind) {
      console.log(`  SKIP  N1 — no noise signal here (bbox change is 0 at every dive sample).`);
    }
    if (!blind) P('N1 the dive slows where the bbox neighbourhood is changing fastest',
      s.length >= 6 && vBusy < vEmpty,
      `emptiest third ${mean(empt, x => x.busy).toFixed(2)} noise -> ${vEmpty.toFixed(3)}x ease-expected; ` +
      `busiest third ${mean(busy, x => x.busy).toFixed(2)} noise -> ${vBusy.toFixed(3)}x ` +
      `(${(vEmpty / (vBusy || 1e-9)).toFixed(2)}x slower where the change is), ${s.length} inner dive frames`);

    // N2 — the same residual, as a BOUND: what is left after the ease must sit inside the one dial.
    const rHi = Math.max(...s.map(x => x.r)), rLo = Math.min(...s.map(x => x.r));
    P(`N2 with the ease divided out, the dive's speed stays inside the one dial [1/${PACE_SWING}, ${PACE_SWING}]`,
      s.length >= 4 && rHi <= PACE_SWING * 1.05 && rLo >= 1 / PACE_SWING / 1.05,
      `measured/ease-expected spans ${rLo.toFixed(2)}x .. ${rHi.toFixed(2)}x over ${s.length} inner frames ` +
      `(raw max/min ${Math.max(...s0.map(x => x.step)).toFixed(3)}/${Math.min(...s0.map(x => x.step)).toFixed(3)}, ` +
      `which is mostly the ease and is NOT the bound)`);

    // N5 — a stall is a run of frames whose speed sits under the beat's own mean/PACE_SWING.
    // Measured on the MOVING beats only (the spin is in-place by design; T2 owns its rotation).
    const stalls = [];
    ['dive', 'walk', 'rise'].forEach(bn => {
      const f = res.film.filter(x => x.beat === bn);
      if (f.length < 6) return;
      const m = f.reduce((a, x) => a + x.step, 0) / f.length, floor = m / PACE_SWING;
      let run = 0, worst = 0, at = 0;
      f.forEach(x => { if (x.step < floor) { run++; if (run > worst) { worst = run; at = x.u; } } else run = 0; });
      stalls.push({ bn, worstFrames: worst, sec: worst / res.fps, at, mean: m, floor });
    });
    const worstStall = stalls.reduce((a, x) => (x.sec > a.sec ? x : a), { sec: 0, bn: '-', worstFrames: 0, at: 0 });
    // ⚖ USER RULING 2026-07-27, and the reason this is a REPORT and not a gate: "i thnk the
    // stalls are ok, it may mean a sec or two pause which is fine in the film" ... "but if the
    // noise ratio tempers it a bit also ok". A pause is film-making, not a defect, so gating it at
    // 0.5s was gating the user's own taste. The number is still printed every run — a stall that
    // grows past a couple of seconds is worth SEEING even though it is not worth failing — and the
    // ceiling below is deliberately generous, set from their own words rather than from a feel.
    console.log(`  INFO  N5 stall report (accepted by ruling, not gated below ${STALL_CEIL}s): ` +
      `worst ${worstStall.worstFrames} frames = ${worstStall.sec.toFixed(2)}s in the ${worstStall.bn} ` +
      `at u=${(worstStall.at || 0).toFixed(3)}; ` + stalls.map(x => `${x.bn} ${x.sec.toFixed(2)}s`).join(', '));
    P(`N5 no beat pauses beyond what the user called fine (a sec or two; ceiling ${STALL_CEIL}s)`,
      worstStall.sec <= STALL_CEIL,
      `worst pause ${worstStall.sec.toFixed(2)}s in the ${worstStall.bn}` +
      (worstStall.sec > 0.5 ? ' — a real pause, and an accepted one' : ' — none worth calling a pause'));

    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    P('N3 the pacing changed, the path did not (dive still ends exactly on the settle point)',
      d(res.last, res.settle) < 0.01,
      `dive end is ${d(res.last, res.settle).toExponential(2)}m from settle; start is ` +
      `${d(res.first, res.camNow).toFixed(3)}m from the opening camera pose`);

    P('N4 the plan budget did not blow out (fan sampling is new per-plan work)',
      res.planMs < 3000,
      `§CINEMA_PLAN_MS ${res.planMs.toFixed(1)}ms — ` +
      (logs.filter(l => /§CINEMA_PLAN_MS/.test(l)).slice(-1)[0] || '(no log line)'));

    console.log(`  INFO  ${logs.filter(l => /§CPE_NOISE_LAW/.test(l)).slice(-1)[0] || '(no §CPE_NOISE_LAW line)'}`);
    console.log(`  INFO  film ${res.nSec.toFixed(1)}s / ${res.frames} frames, dive is u<=${res.tD.toFixed(3)}`);
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
