// WITNESS — §CPE_WALK_BUDGET_NOISE_BLIND: the walk's SECONDS must obey the noise law like every
// other beat.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_WALK_BUDGET_NOISE_BLIND + its CORRECTION
// (the last section of the file — Defect 1 as first written is WRONG, build against the correction).
//
// THE DEFECT: `effects.js` used to charge the walk's seconds as
//   totalLen / CINEMA_WALK_MPS + _walkTurnDeg() / (CINEMA_TURN_DPS / 3)
// — raw metres plus raw degrees at a 3x-inflated rate. `_walkTurnDeg()` prices GEOMETRY (how far the
// path turns); the user's settled law (2026-07-27, "100% rate of change") prices CONTENT (how fast
// the scene changes). Two paths that turn the same amount through an empty yard and a dense
// plantroom billed IDENTICALLY. The fix gives the walk the same shape the dive already has:
//   (totalLen / CINEMA_WALK_MPS + _walkTurnDeg() / CINEMA_TURN_DPS) * (1 + (PACE_SWING-1) * busy)
// with `busy` measured by the same _densityAt/_noiseRadius central-difference probe §CPE_NOISE_LAW
// already runs for the walk's frame SPACING (_evenTurnBuild), and the `/3` tax gone because honest
// busy now does the job it was faking.
//
//   G-WB-1  formula honesty: the §CPE_WALK_BUDGET_NOISE_BLIND log line's own reported terms
//           recompute `outSec` exactly, AND the rate charged per degree is CINEMA_TURN_DPS (45),
//           not the old 15 (Defect 2). RED on origin/main: no such log line exists at all — the old
//           code never surfaces turnDeg/busy as first-class numbers, only the flat totals.
//   G-WB-2  THE gate that matters: two paths of EQUAL length and EQUAL total turning (built as one
//           path translated bodily into empty space — translation cannot change either quantity)
//           through DIFFERENT content-change score must get DIFFERENT walk seconds. RED on
//           origin/main: translation doesn't change pathLen or turnDeg there either, and the old
//           formula reads nothing else, so the two plans' walk seconds are identical.
//   G-WB-3  bounded by the one dial: busy in force is a value the reported logs place in [0,1], so
//           the resulting multiplier never exceeds CINEMA_PACE_SWING (1.6, read from the log, not
//           hardcoded) on any of the 4 plans this file builds. No second dial appears in any line.
//   G-WB-4  a degree of turning costs the same in the walk as in the spin — the claim
//           effects.js:5150-5153 already makes in prose, checked against the spin's own logged rate.
//   G-WB-5  constant speed with busy HELD FLAT (both paths measured busy=0): two straight walks of
//           different length still get seconds exactly proportional to length. The full-noise
//           version of this claim (busy free to vary) is witness_cinema_path_editor.js's G9, run as
//           a regression alongside this file, not re-litigated here.
//   G-WB-6  the §CPE_HOSE_LENGTH_BLIND invariant: the plan is internally self-consistent
//           (naturalTotal == sum of its own sec.* fields) and DETERMINISTIC (replanning the same
//           override twice gives byte-identical pathLen/naturalTotal) — re-costing the walk did not
//           reintroduce a display-vs-bake divergence or any nondeterminism from the new density read.
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

    const DUR = 24;
    const res = await page.evaluate(async (DUR) => {
      const A = window.APP;
      const out = { err: null };
      try {
        if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
        if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

        // A real anchor point near the building, from the derived plan — not invented.
        const planD = A.cinemaPathPlan(DUR);
        const s0 = planD.waypoints[0];
        out.envelope = planD.envelope;

        // ── G-WB-1/G-WB-4 subject: a dogleg near the building (2 real 90deg corners), and the
        // same shape extended by two more legs (2 more corners) — the "add waypoints, path grows,
        // does the clock explode" scenario the user actually reported.
        const base = [
          { x: s0.x,      y: s0.y, z: s0.z },
          { x: s0.x + 10, y: s0.y, z: s0.z },
          { x: s0.x + 10, y: s0.y, z: s0.z + 10 },
          { x: s0.x + 20, y: s0.y, z: s0.z + 10 },
        ];
        const extended = base.concat([
          { x: s0.x + 20, y: s0.y, z: s0.z + 20 },
          { x: s0.x + 30, y: s0.y, z: s0.z + 20 },
        ]);
        const planBase = A.cinemaPathPlan(DUR, { waypoints: base });
        const planExt = A.cinemaPathPlan(DUR, { waypoints: extended });
        out.base = { pathLen: planBase.pathLen, outSec: planBase.naturalSec.out };
        out.ext = { pathLen: planExt.pathLen, outSec: planExt.naturalSec.out };

        // ── G-WB-2 subject: a STRAIGHT 2-point leg near the building, and the SAME leg bodily
        // TRANSLATED 3000m away. Deliberately NOT the cornered `base` dogleg above: corner rounding
        // (_cinemaRoundCorners) cuts each corner by a radius bounded by MEASURED fan clearance AT
        // THAT LOCATION, so a cornered path's FLOWN length legitimately shifts when translated
        // somewhere with different nearby geometry (confirmed empirically: the dogleg's flowed
        // length differed by ~3% between near-building and 3000m-out on Duplex) — witness_cinema_
        // path_editor.js's G3 documents the same effect for a raised path. A straight leg has no
        // corner to round, so translation preserves totalLen and turnDeg (=0 for both) EXACTLY,
        // isolating the one thing this gate is actually testing: does busy alone move the seconds.
        const OFFSET = 3000;
        const busyWp = [{ x: s0.x, y: s0.y, z: s0.z }, { x: s0.x + 20, y: s0.y, z: s0.z }];
        const emptyWp = busyWp.map(w => ({ x: w.x + OFFSET, y: w.y, z: w.z }));
        const planBusy = A.cinemaPathPlan(DUR, { waypoints: busyWp });
        const planEmpty = A.cinemaPathPlan(DUR, { waypoints: emptyWp });
        out.busy = { pathLen: planBusy.pathLen, outSec: planBusy.naturalSec.out };
        out.empty = { pathLen: planEmpty.pathLen, outSec: planEmpty.naturalSec.out };

        // ── G-WB-5 subject: two STRAIGHT walks (no turning at all) at different lengths, both far
        // from anything (busy pinned at 0 by construction, same offset trick).
        const shortStraight = [{ x: s0.x + OFFSET, y: s0.y, z: s0.z }, { x: s0.x + OFFSET + 10, y: s0.y, z: s0.z }];
        const longStraight  = [{ x: s0.x + OFFSET, y: s0.y, z: s0.z }, { x: s0.x + OFFSET + 30, y: s0.y, z: s0.z }];
        const planShort = A.cinemaPathPlan(DUR, { waypoints: shortStraight });
        const planLong = A.cinemaPathPlan(DUR, { waypoints: longStraight });
        out.short = { pathLen: planShort.pathLen, outSec: planShort.naturalSec.out };
        out.long = { pathLen: planLong.pathLen, outSec: planLong.naturalSec.out };

        // ── G-WB-6 subject: internal self-consistency + determinism of planBusy, replanned twice.
        const planBusy2 = A.cinemaPathPlan(DUR, { waypoints: busyWp });
        out.selfConsistent = {
          natSum: planBusy.naturalSec.dive + planBusy.naturalSec.spin + planBusy.naturalSec.out +
                  planBusy.naturalSec.rise + planBusy.naturalSec.orbit,
          natTotal: planBusy.naturalTotal,
        };
        out.deterministic = {
          pathLenDiff: Math.abs(planBusy.pathLen - planBusy2.pathLen),
          totalDiff: Math.abs(planBusy.naturalTotal - planBusy2.naturalTotal),
          outSecDiff: Math.abs(planBusy.naturalSec.out - planBusy2.naturalSec.out),
        };
      } catch (e) { out.err = e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / '); }
      return out;
    }, DUR);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-WB-1..6 the plan API runs on real authored waypoints', false, res.err);
      console.log(`\n  ${BLD}: 0/1`); allPass = false; await page.close(); continue;
    }

    // §CPE_WALK_BUDGET_NOISE_BLIND lines, in call order: [derived(unused for parsing), base, ext,
    // busy, empty, short, long, busy2]. Filter, then index by call position.
    const wbLines = logs.filter(l => l.startsWith('§CPE_WALK_BUDGET_NOISE_BLIND'));
    const parseWB = (line) => {
      if (!line) return null;
      const g = (re) => { const m = re.exec(line); return m ? +m[1] : null; };
      return {
        totalLen: g(/totalLen=([\d.]+)/), walkMps: g(/walkMps=([\d.]+)/),
        turnDeg: g(/turnDeg=([\d.]+)/), turnDps: g(/turnDps=([\d.]+)/),
        travelSec: g(/travelSec=([\d.]+)/), turnSec: g(/turnSec=([\d.]+)/),
        rawSec: g(/rawSec=([\d.]+)/), busy: g(/busy=([\d.]+)/), swing: g(/swing=([\d.]+)/),
        busyMult: g(/busyMult=([\d.]+)/), outSec: g(/outSec=([\d.]+)/),
      };
    };
    // 7 authored plans were built above (base, ext, busy, empty, short, long, busy2) — the derived
    // plan `planD` at the top does NOT go through the authored-waypoint path with a fresh totalLen
    // in the same shape (it does, in fact — every call to _cinemaPathPlan logs this line), so there
    // are 8 lines total; the last 7, in order, are the ones this test built explicitly.
    const wb = wbLines.slice(-7).map(parseWB);
    const [wbBase, wbExt, wbBusy, wbEmpty, wbShort, wbLong, wbBusy2] = wb;

    // ── G-WB-1 ─────────────────────────────────────────────────────────────────────────────────
    if (!wbBase || !wbExt) {
      P('G-WB-1 formula honesty: §CPE_WALK_BUDGET_NOISE_BLIND is emitted and self-consistent',
        false,
        `no §CPE_WALK_BUDGET_NOISE_BLIND line found (${wbLines.length} matched of 7 expected) — ` +
        `old code has no busy term to log. Raw plan numbers: base pathLen=${res.base.pathLen.toFixed(2)}m ` +
        `outSec=${res.base.outSec.toFixed(3)}s | ext pathLen=${res.ext.pathLen.toFixed(2)}m ` +
        `outSec=${res.ext.outSec.toFixed(3)}s | lenRatio=${(res.ext.pathLen/res.base.pathLen).toFixed(3)} ` +
        `secRatio=${(res.ext.outSec/res.base.outSec).toFixed(3)}`);
    } else {
      const recompute = (wb) => (wb.travelSec + wb.turnSec) * wb.busyMult;
      const err1 = Math.abs(recompute(wbBase) - wbBase.outSec);
      const err2 = Math.abs(recompute(wbExt) - wbExt.outSec);
      // Tolerance reflects the LOG LINE's own printed precision (travelSec/turnSec at 3 decimals,
      // busyMult at 4) propagated through one multiply, not numerical slop in the formula itself —
      // the source values inside effects.js are full double precision; only what this test can SEE
      // is rounded.
      const TOL = 2e-3;
      const rateOK = wbBase.turnDps === 45 && wbExt.turnDps === 45;
      P('G-WB-1 formula honesty: outSec == (travelSec+turnSec)*busyMult (within log-print precision), and a degree costs turnDps=45 (not the old 15)',
        err1 < TOL && err2 < TOL && rateOK,
        `base: turnDeg=${wbBase.turnDeg} turnDps=${wbBase.turnDps} travelSec=${wbBase.travelSec} turnSec=${wbBase.turnSec} ` +
        `busy=${wbBase.busy} busyMult=${wbBase.busyMult} outSec=${wbBase.outSec} (recompute err=${err1.toExponential(2)}) | ` +
        `ext: turnDeg=${wbExt.turnDeg} turnDps=${wbExt.turnDps} travelSec=${wbExt.travelSec} turnSec=${wbExt.turnSec} ` +
        `busy=${wbExt.busy} busyMult=${wbExt.busyMult} outSec=${wbExt.outSec} (recompute err=${err2.toExponential(2)}) | ` +
        `lenRatio=${(res.ext.pathLen/res.base.pathLen).toFixed(3)} secRatio=${(res.ext.outSec/res.base.outSec).toFixed(3)} ` +
        `turnRatio=${(wbExt.turnDeg/wbBase.turnDeg).toFixed(3)}`);
    }

    // ── G-WB-2 (the gate that matters) ────────────────────────────────────────────────────────
    if (!wbBusy || !wbEmpty) {
      P('G-WB-2 equal length + equal turn, different content-change -> different walk seconds',
        false,
        `no §CPE_WALK_BUDGET_NOISE_BLIND line for busy/empty plans — old code cannot report busy. ` +
        `Raw: busy pathLen=${res.busy.pathLen.toFixed(2)}m outSec=${res.busy.outSec.toFixed(3)}s | ` +
        `empty(+${3000}m) pathLen=${res.empty.pathLen.toFixed(2)}m outSec=${res.empty.outSec.toFixed(3)}s | ` +
        `lenDiff=${Math.abs(res.busy.pathLen-res.empty.pathLen).toExponential(2)}m ` +
        `outSecDiff=${Math.abs(res.busy.outSec-res.empty.outSec).toExponential(2)}s (RED: ~0, identical)`);
    } else {
      const lenEq = Math.abs(wbBusy.totalLen - wbEmpty.totalLen) < 1e-6;
      const turnEq = Math.abs(wbBusy.turnDeg - wbEmpty.turnDeg) < 1e-6;
      const busyDiffers = (wbBusy.busy - wbEmpty.busy) > 0.02;
      const secDiffers = Math.abs(wbBusy.outSec - wbEmpty.outSec) / wbBase.outSec > 0.001 || wbBusy.outSec !== wbEmpty.outSec;
      P('G-WB-2 equal length + equal turn (proven by translation), different busy -> different walk seconds',
        lenEq && turnEq && busyDiffers && secDiffers,
        `totalLen: busy=${wbBusy.totalLen} empty=${wbEmpty.totalLen} (equal=${lenEq}) | ` +
        `turnDeg: busy=${wbBusy.turnDeg} empty=${wbEmpty.turnDeg} (equal=${turnEq}) | ` +
        `busy: near-building=${wbBusy.busy} vs 3000m-out=${wbEmpty.busy} (differs=${busyDiffers}) | ` +
        `outSec: ${wbBusy.outSec}s vs ${wbEmpty.outSec}s (differs=${secDiffers})`);
    }

    // ── G-WB-3 ─────────────────────────────────────────────────────────────────────────────────
    {
      const all = [wbBase, wbExt, wbBusy, wbEmpty, wbShort, wbLong].filter(Boolean);
      const swingVals = new Set(all.map(w => w.swing));
      const oneDial = swingVals.size <= 1 && (swingVals.size === 0 || [...swingVals][0] === 1.6);
      const busyBounded = all.every(w => w.busy >= -1e-9 && w.busy <= 1 + 1e-9);
      const multBounded = all.every(w => w.busyMult >= 1 - 1e-9 && w.busyMult <= (all[0] ? all[0].swing : 1.6) + 1e-6);
      P('G-WB-3 bounded by the ONE dial: busy in [0,1], busyMult in [1,swing], swing constant across every plan',
        all.length > 0 && oneDial && busyBounded && multBounded,
        all.length === 0 ? 'no lines to check'
          : `swing values seen=${[...swingVals]} | busy=[${all.map(w=>w.busy).join(',')}] | ` +
            `busyMult=[${all.map(w=>w.busyMult).join(',')}]`);
    }

    // ── G-WB-4 ─────────────────────────────────────────────────────────────────────────────────
    {
      const pacingLine = logs.filter(l => l.startsWith('§CINEMA_PACING')).slice(-1)[0] || '';
      // §CPE_SPIN_WHIP (2026-08-01) rephrased this clause: it used to read "spin raw 523deg capped
      // 180deg @45deg/s", and the CAP was the defect that section removed — the spin is now billed
      // for the angle it actually flies, so the line reads "spin 231deg flown @45deg/s x1.26 busy".
      // The gate's claim is UNCHANGED (a degree costs the same in the walk as in the spin); only the
      // sentence it reads the rate out of moved. Prefer the current phrasing, still accept the old
      // one so this file can be run against an older build for comparison.
      const mSpin = /spin [\d.]+deg flown @(\d+)deg\/s/.exec(pacingLine) ||
                    /spin raw \d+deg capped \d+deg @(\d+)deg\/s/.exec(pacingLine);
      const spinRate = mSpin ? +mSpin[1] : null;
      const walkRate = wbBase ? wbBase.turnDps : null;
      P('G-WB-4 a degree of turning costs the same in the walk as in the spin (effects.js:5150-5153\'s own claim)',
        spinRate != null && walkRate != null && spinRate === walkRate,
        `spin rate=${spinRate}deg/s (from §CINEMA_PACING) walk rate=${walkRate}deg/s (from §CPE_WALK_BUDGET_NOISE_BLIND)`);
    }

    // ── G-WB-5 ─────────────────────────────────────────────────────────────────────────────────
    if (!wbShort || !wbLong) {
      P('G-WB-5 constant speed with busy held flat: two straight walks, seconds proportional to length',
        false, 'no §CPE_WALK_BUDGET_NOISE_BLIND line for short/long straight plans');
    } else {
      const bothFlat = wbShort.busy === 0 && wbLong.busy === 0;
      const lenRatio = res.long.pathLen / res.short.pathLen;
      const secRatio = res.long.outSec / res.short.outSec;
      const ratioErr = Math.abs(lenRatio - secRatio);
      P('G-WB-5 constant speed with busy held flat: seconds/length ratio == length ratio (no turning, no busy)',
        bothFlat && ratioErr < 1e-6,
        `busy short=${wbShort.busy} long=${wbLong.busy} (flat=${bothFlat}) | ` +
        `pathLen ${res.short.pathLen.toFixed(2)}->${res.long.pathLen.toFixed(2)}m (x${lenRatio.toFixed(4)}) ` +
        `outSec ${res.short.outSec.toFixed(3)}->${res.long.outSec.toFixed(3)}s (x${secRatio.toFixed(4)}) ` +
        `err=${ratioErr.toExponential(2)} — full-noise (busy varying) version of this claim is ` +
        `witness_cinema_path_editor.js G9, run as a regression alongside this file`);
    }

    // ── G-WB-6 ─────────────────────────────────────────────────────────────────────────────────
    {
      const sc = res.selfConsistent, det = res.deterministic;
      const consistent = Math.abs(sc.natSum - sc.natTotal) < 1e-9;
      const deterministic = det.pathLenDiff === 0 && det.totalDiff === 0 && det.outSecDiff === 0;
      P('G-WB-6 §CPE_HOSE_LENGTH_BLIND invariant holds: plan is internally self-consistent and deterministic',
        consistent && deterministic,
        `naturalTotal=${sc.natTotal.toFixed(6)} sum(sec.*)=${sc.natSum.toFixed(6)} diff=${Math.abs(sc.natSum-sc.natTotal).toExponential(2)} | ` +
        `replan-twice diff: pathLen=${det.pathLenDiff.toExponential(2)} naturalTotal=${det.totalDiff.toExponential(2)} outSec=${det.outSecDiff.toExponential(2)}`);
    }

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    summary.push({ BLD, pass, total: checks.length });
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass === s.total ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.pass}/${s.total})`));
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
