// WITNESS — §CPE_SPIN_WHIP: the spin must not sweep more than 360 degrees, and its SECONDS must
// obey the noise law like every other beat.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_SPIN_WHIP (last section of the file).
//
// THE DEFECT, two halves, both read out of viewer/effects.js rather than inferred:
//   1. MOTION. The "behind" class implemented "turn the long way around" as the short way PLUS a
//      whole extra lap — `dYaw += sign(dYaw) * 2*PI`, i.e. |raw| + 360. For that class
//      (|raw| in (120,180]) the executed sweep is 480..540 degrees: the measured 523 and 534 whips,
//      and the DIVE->SPIN seam the user reported ("it was coming out of the dive towards the edge").
//      The genuine long way is the OPPOSITE DIRECTION, 360 - |raw|, which ends on the identical
//      bearing and is still longer than the short way.
//   2. BUDGET. `_spinDeg = Math.min(180, |dYaw|)` billed 523 degrees of motion as 180 — the fourth
//      instance of the budget-on-one-number / motion-on-another family — and the spin was the LAST
//      beat with no `* (1 + (SWING-1)*busy)` term, in a law the user settled as "it governs
//      thrughout". The spin translates 0 metres, so busy is read along the ARC the gaze sweeps.
//
//   G-SW-1  THE CEILING. Sweeping the camera's heading right round the circle (>= 12 forced spin
//           geometries per building), |finalSpinDeg| <= 360 on every one. RED on origin/main: the
//           behind class emits 480..540.
//   G-SW-2  the turn is still MOTIVATED — for every behind-class case the executed sweep is still
//           LONGER than the short way (|final| > |raw|). Guards against "fixing" the whip by
//           quietly degrading "turn around to it" into the short turn.
//   G-SW-3  the END BEARING did not move: (rawSigned - final) is an exact multiple of 360 for every
//           case that spins at all, AND §CPE_SEAM_CONTINUOUS's handoffYawDeg is congruent to
//           yaw0+final. This is a NO-REGRESSION gate — it passes on main too, by design: the point
//           is that removing the whip does not re-aim Beat 3.
//   G-SW-4  BUDGET == MOTION. spinSec * TURN_DPS / busyMult == |finalSpinDeg| within log precision,
//           on every case (the CINEMA_SPIN_MIN_SEC floor excepted, and reported when it binds).
//           RED on origin/main: it equals a flat 180 for every behind case whatever the motion.
//   G-SW-5  THE NOISE RATIO IS IN FORCE. The same spin geometry, bodily translated 3000 m into empty
//           space (translation cannot change an angle), must get DIFFERENT spin seconds; and the
//           multiplier stays inside [1, swing] with swing READ FROM THE LOG, not hardcoded. RED on
//           origin/main: no busy term exists there, so the two are identical.
//   G-SW-6  THE SEAM, re-measured. Gaze angle off the building bulk at t=0.150/0.200/0.250 on the
//           SAME geometry that produced the report. Reported as a NUMBER whichever way it goes: if
//           the opening-away does not shrink, the seam has a second mechanism and
//           §CPE_GAZE_CONSTANT_RATE inherits it. Gate passes if the fix does not make it WORSE.
//   G-SW-7  no regression: naturalTotal == sum of its own naturalSec.* fields, and replanning the
//           same geometry twice is byte-identical — the new arc density read introduced no
//           nondeterminism (the §CPE_HOSE_LENGTH_BLIND invariant).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8450;
const BUILDINGS = (process.env.BLDS || 'Hospital,Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// (rawSigned - final) must be an exact multiple of 360 — the "same end bearing" invariant.
const mod360 = d => { let m = ((d % 360) + 360) % 360; return m > 180 ? m - 360 : m; };

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
    const NHEAD = 16;   // headings swept around the full circle

    const res = await page.evaluate(async (DUR, NHEAD) => {
      const A = window.APP;
      const out = { err: null, sweep: [], marks: [], seam: [] };
      try {
        if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
        if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

        // yaw0 is read from the camera's own world direction (effects.js:4638-4641), so sweeping
        // where the camera LOOKS — with its POSITION held fixed, so the settle/exit/spinTo geometry
        // is unchanged — sweeps dYaw right round the circle and forces every spin class. This is the
        // real input the plan reads, not a stub: nothing here reaches inside _cinemaPathPlan.
        const cam = A.camera;
        const p0 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
        out.camPos = p0;

        for (let i = 0; i < NHEAD; i++) {
          const th = (i / NHEAD) * Math.PI * 2;
          cam.position.set(p0.x, p0.y, p0.z);
          cam.lookAt(p0.x + Math.cos(th) * 50, p0.y, p0.z + Math.sin(th) * 50);
          cam.updateMatrixWorld(true);
          const pl = A.cinemaPathPlan(DUR);
          out.sweep.push({
            i, headingDeg: th * 180 / Math.PI,
            spinSec: pl.naturalSec.spin,
            natTotal: pl.naturalTotal,
            natSum: pl.naturalSec.dive + pl.naturalSec.spin + pl.naturalSec.out +
                    pl.naturalSec.rise + pl.naturalSec.orbit,
          });
        }

        // ── G-SW-5 subject: the SAME spin geometry, near the building and bodily translated far
        // out into empty space. Both the camera and the authored walk move together, so the walk's
        // shape and the camera heading are identical in both — only the CONTENT around the spin
        // differs. Angle is invariant under translation, so any difference in spin seconds can only
        // have come from the noise term.
        const OFFSET = 3000;
        const planRef = A.cinemaPathPlan(DUR);
        const s0 = planRef.waypoints[0];
        const busyWp = [{ x: s0.x, y: s0.y, z: s0.z }, { x: s0.x + 20, y: s0.y, z: s0.z }];
        const emptyWp = busyWp.map(w => ({ x: w.x + OFFSET, y: w.y, z: w.z }));

        cam.position.set(p0.x, p0.y, p0.z);
        cam.lookAt(p0.x - 50, p0.y, p0.z);           // fixed heading for both halves
        cam.updateMatrixWorld(true);
        const planBusy = A.cinemaPathPlan(DUR, { waypoints: busyWp });
        out.busy = { spinSec: planBusy.naturalSec.spin };

        cam.position.set(p0.x + OFFSET, p0.y, p0.z);
        cam.lookAt(p0.x + OFFSET - 50, p0.y, p0.z);  // same heading, 3000m out
        cam.updateMatrixWorld(true);
        const planEmpty = A.cinemaPathPlan(DUR, { waypoints: emptyWp });
        out.empty = { spinSec: planEmpty.naturalSec.spin };

        // ── G-SW-7 subject: determinism, same geometry replanned twice.
        cam.position.set(p0.x, p0.y, p0.z);
        cam.lookAt(p0.x - 50, p0.y, p0.z);
        cam.updateMatrixWorld(true);
        const planBusy2 = A.cinemaPathPlan(DUR, { waypoints: busyWp });
        out.deterministic = {
          spinSecDiff: Math.abs(planBusy.naturalSec.spin - planBusy2.naturalSec.spin),
          totalDiff: Math.abs(planBusy.naturalTotal - planBusy2.naturalTotal),
          pathLenDiff: Math.abs(planBusy.pathLen - planBusy2.pathLen),
        };

        // ── G-SW-6 subject: the reported seam. The default derived plan (the one the user films),
        // gaze angle off the building bulk at the three reported marks. Bulk = plan.pivot, the same
        // point every other cinema witness measures against.
        cam.position.set(p0.x, p0.y, p0.z);
        cam.lookAt(p0.x + 50, p0.y, p0.z);
        cam.updateMatrixWorld(true);
        const planSeam = A.cinemaPathPlan(DUR);
        const piv = planSeam.pivot;
        out.beats = planSeam.beats || null;
        const offBulk = (t) => {
          const q = planSeam.poseAt(t);
          const gx = q.tx - q.x, gy = q.ty - q.y, gz = q.tz - q.z;
          const gL = Math.hypot(gx, gy, gz) || 1;
          const bx = piv.x - q.x, by = piv.y - q.y, bz = piv.z - q.z;
          const bL = Math.hypot(bx, by, bz) || 1;
          const dot = (gx * bx + gy * by + gz * bz) / (gL * bL);
          return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        };
        // The user's own three marks, kept for continuity with the report.
        for (const t of [0.150, 0.200, 0.250]) out.marks.push({ t, offBulkDeg: offBulk(t) });
        // ⚠ THE GATE'S ACTUAL MEASURE, and why it is not the three marks above. This fix CHANGES the
        // spin's seconds (that is half of what it does), so tD/tS move and a fixed t=0.200 lands in a
        // different beat before and after — comparing those two numbers compares two different
        // MOMENTS of the film, not two versions of the same moment. Sample BEAT-RELATIVE instead:
        // across the dive->spin seam itself, from a little before the dive ends to the spin's end.
        const tD = planSeam.beats.dive, tS = planSeam.beats.spin;
        for (let i = 0; i <= 24; i++) {
          const t = tD * 0.85 + (tS - tD * 0.85) * (i / 24);
          out.seam.push({ t, offBulkDeg: offBulk(t) });
        }
      } catch (e) { out.err = e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / '); }
      return out;
    }, DUR, NHEAD);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-SW-1..7 the plan API runs over a swept camera heading', false, res.err);
      console.log(`\n  ${BLD}: 0/1`); allPass = false; summary.push(`${BLD} 0/7`); await page.close(); continue;
    }

    // ── log parsing. §CINEMA_SPIN and §CPE_SPIN_WHIP are emitted once per plan call, in call order.
    const parseSpin = (line) => {
      const g = (re) => { const m = re.exec(line); return m ? +m[1] : null; };
      const cm = /class=(\S+)/.exec(line);
      return { rawSigned: g(/dYawRawSignedDeg=(-?[\d.]+)/), raw: g(/dYawRawDeg=([\d.]+)/),
               cls: cm ? cm[1] : null, final: g(/finalSpinDeg=(-?[\d.]+)/),
               capped: /capped=true/.test(line) };
    };
    const parseWhip = (line) => {
      const g = (re) => { const m = re.exec(line); return m ? +m[1] : null; };
      return { flownDeg: g(/flownDeg=([\d.]+)/), turnDps: g(/turnDps=([\d.]+)/),
               rawSec: g(/rawSec=([\d.]+)/), busy: g(/busy=([\d.]+)/), swing: g(/swing=([\d.]+)/),
               busyMult: g(/busyMult=([\d.]+)/), minSec: g(/minSec=([\d.]+)/),
               spinSec: g(/spinSec=([\d.]+)/) };
    };
    const spinLines = logs.filter(l => l.startsWith('§CINEMA_SPIN ')).map(parseSpin);
    const whipLines = logs.filter(l => l.startsWith('§CPE_SPIN_WHIP ')).map(parseWhip);
    const seamLines = logs.filter(l => l.startsWith('§CPE_SEAM_CONTINUOUS'))
      .map(l => { const m = /handoffYawDeg=(-?[\d.]+)/.exec(l); return m ? +m[1] : null; });
    // The page may plan once on its own at load, so index from the END, exactly as
    // witness_cpe_walk_budget.js does. This test issues res.sweep.length sweep calls followed by 5
    // more (planRef, planBusy, planEmpty, planBusy2, planSeam) — the sweep is the first block of
    // that tail.
    const MINE = res.sweep.length + 5;
    const sweepSpin = spinLines.slice(-MINE).slice(0, res.sweep.length);
    const sweepWhipAll = whipLines.slice(-MINE).slice(0, res.sweep.length);

    // ── G-SW-1 — THE CEILING ───────────────────────────────────────────────────────────────────
    if (sweepSpin.length < 12) {
      P('G-SW-1 ceiling: |finalSpinDeg| <= 360 on every swept heading', false,
        `only ${sweepSpin.length} §CINEMA_SPIN lines captured of ${res.sweep.length} expected — cannot judge the ceiling`);
      allPass = false;
    } else {
      const over = sweepSpin.filter(s => Math.abs(s.final) > 360 + 1e-6);
      const worst = sweepSpin.reduce((a, s) => Math.abs(s.final) > Math.abs(a.final) ? s : a, sweepSpin[0]);
      const classes = {}; sweepSpin.forEach(s => { classes[s.cls] = (classes[s.cls] || 0) + 1; });
      P('G-SW-1 ceiling: |finalSpinDeg| <= 360 on every swept heading',
        over.length === 0,
        `${sweepSpin.length} headings, classes ${JSON.stringify(classes)}; ` +
        `worst |final|=${Math.abs(worst.final).toFixed(1)}deg (raw ${worst.raw}deg, class ${worst.cls}); ` +
        `over-360 count=${over.length}` +
        (over.length ? ` — e.g. raw=${over[0].raw} final=${over[0].final}` : ''));
      if (over.length) allPass = false;
    }

    // ── G-SW-2 — still MOTIVATED ───────────────────────────────────────────────────────────────
    const behind = sweepSpin.filter(s => s.cls && s.cls.indexOf('behind') === 0);
    if (!behind.length) {
      P('G-SW-2 the behind class still turns the LONG way (|final| > |raw|)', false,
        'no behind-class heading in the sweep — the gate has no subject, widen the heading sweep');
      allPass = false;
    } else {
      const bad = behind.filter(s => Math.abs(s.final) <= s.raw + 1e-6);
      P('G-SW-2 the behind class still turns the LONG way (|final| > |raw|)',
        bad.length === 0,
        `${behind.length} behind-class cases; ` +
        behind.slice(0, 4).map(s => `raw=${s.raw}->|final|=${Math.abs(s.final).toFixed(1)}`).join(', ') +
        `; degraded-to-short count=${bad.length}`);
      if (bad.length) allPass = false;
    }

    // ── G-SW-3 — the END BEARING did not move ──────────────────────────────────────────────────
    const spun = sweepSpin.filter(s => Math.abs(s.final) > 1e-6 && s.rawSigned !== null);
    if (!spun.length) {
      P('G-SW-3 end bearing unchanged: (rawSigned - final) is a multiple of 360', false,
        'no case logged dYawRawSignedDeg (origin/main does not emit it) or nothing spun');
      allPass = false;
    } else {
      const resid = spun.map(s => Math.abs(mod360(s.rawSigned - s.final)));
      const worst = Math.max(...resid);
      P('G-SW-3 end bearing unchanged: (rawSigned - final) is a multiple of 360',
        worst < 0.15,     // both terms printed at 1 decimal; 0.15 is that print precision, not slop
        `${spun.length} spinning cases, worst residual=${worst.toFixed(3)}deg (tol 0.15, = the log's ` +
        `own 1-decimal print precision). handoffYawDeg lines seen=${seamLines.length}`);
      if (!(worst < 0.15)) allPass = false;
    }

    // ── G-SW-4 — BUDGET == MOTION ──────────────────────────────────────────────────────────────
    const sweepWhip = sweepWhipAll;
    if (!sweepWhip.length) {
      const b = behind[0];
      P('G-SW-4 budget == motion: spinSec*turnDps/busyMult == |finalSpinDeg|', false,
        `no §CPE_SPIN_WHIP line exists (${whipLines.length} found) — origin/main never surfaces the ` +
        `spin's billed angle as a number. Raw evidence from the sweep instead: ` +
        (b ? `a behind case turns ${Math.abs(b.final).toFixed(1)}deg ` : '') +
        `and spin seconds across the sweep are ` +
        `[${res.sweep.map(s => s.spinSec.toFixed(2)).join(', ')}] — flat wherever the motion is not`);
      allPass = false;
    } else {
      const rows = sweepWhip.map((w, i) => ({ w, s: sweepSpin[i] })).filter(r => r.s);
      const bad = rows.filter(r => {
        if (r.w.spinSec <= r.w.minSec + 1e-9) return false;             // the floor binds, not the formula
        const billed = r.w.spinSec * r.w.turnDps / r.w.busyMult;
        return Math.abs(billed - Math.abs(r.s.final)) > 0.2;
      });
      const floored = rows.filter(r => r.w.spinSec <= r.w.minSec + 1e-9).length;
      const flownOk = rows.every(r => Math.abs(r.w.flownDeg - Math.abs(r.s.final)) < 0.15);
      P('G-SW-4 budget == motion: spinSec*turnDps/busyMult == |finalSpinDeg| (no 180 cap left)',
        bad.length === 0 && flownOk,
        `${rows.length} cases, ${floored} sitting on the ${sweepWhip[0].minSec}s MIN_SEC floor (excluded); ` +
        `flownDeg==|finalSpinDeg| on all=${flownOk}; mismatches=${bad.length}` +
        (bad.length ? ` — e.g. final=${bad[0].s.final} billed=${(bad[0].w.spinSec*bad[0].w.turnDps/bad[0].w.busyMult).toFixed(1)}` : '') +
        `; sample: flown=${rows[0].w.flownDeg} busyMult=${rows[0].w.busyMult} spinSec=${rows[0].w.spinSec}`);
      if (!(bad.length === 0 && flownOk)) allPass = false;
    }

    // ── G-SW-5 — the NOISE RATIO is in force ───────────────────────────────────────────────────
    const swingLogged = whipLines.length ? whipLines[0].swing : null;
    const mults = whipLines.map(w => w.busyMult).filter(v => v !== null);
    const dSec = Math.abs(res.busy.spinSec - res.empty.spinSec);
    const floorBinds = whipLines.length &&
      (res.busy.spinSec <= whipLines[0].minSec + 1e-9 || res.empty.spinSec <= whipLines[0].minSec + 1e-9);
    if (!whipLines.length) {
      P('G-SW-5 the noise ratio buys the spin its seconds', false,
        `no §CPE_SPIN_WHIP line — origin/main has no busy term for the spin at all. ` +
        `busy-vs-empty spin seconds: ${res.busy.spinSec.toFixed(3)}s vs ${res.empty.spinSec.toFixed(3)}s ` +
        `(diff ${dSec.toExponential(2)} — identical, as the missing term predicts)`);
      allPass = false;
    } else {
      const inBand = mults.every(m => m >= 1 - 1e-9 && m <= swingLogged + 1e-9);
      // If BOTH sides sit on the MIN_SEC floor the difference is masked by the floor, not absent —
      // say so rather than passing a gate that measured nothing.
      const moved = dSec > 1e-6;
      P('G-SW-5 the noise ratio buys the spin its seconds, bounded by the one dial',
        inBand && (moved || floorBinds),
        `busy=${res.busy.spinSec.toFixed(4)}s vs empty(3000m out)=${res.empty.spinSec.toFixed(4)}s ` +
        `diff=${dSec.toFixed(4)}s${floorBinds ? ' [MIN_SEC floor binds on one side — difference masked, not absent]' : ''}; ` +
        `busyMult range across ${mults.length} plans = [${Math.min(...mults).toFixed(4)}, ${Math.max(...mults).toFixed(4)}] ` +
        `against swing=${swingLogged} read from the log; inBand=${inBand}`);
      if (!(inBand && (moved || floorBinds))) allPass = false;
    }

    // ── G-SW-6 — the SEAM, re-measured ─────────────────────────────────────────────────────────
    // ⚠ The user's reported signature (35.8 -> 76.9 -> 101.9 off the bulk) came from THEIR live
    // camera, which this rig cannot reproduce — yaw0 is read from the camera and theirs is not
    // recorded. So the gate cannot compare against their absolute numbers without measuring a
    // different geometry and calling it the same one. What it CAN do honestly is measure the same
    // quantity on the SAME rig geometry before and after, so the baselines below were MEASURED by
    // running this exact file against origin/main's effects.js (see RED_spin_whip.log):
    //     Hospital  t=0.150 86.4  t=0.200 131.9  t=0.250 87.0   → peak 131.9
    //     Duplex    t=0.150 51.1  t=0.200  32.7  t=0.250 67.9   → peak  67.9
    // ⚠ THIS GATE CHANGED ITS CLAIM ONCE, DELIBERATELY, AND THE REASON MATTERS MORE THAN THE GATE.
    // It was first written as the session-close HYPOTHESIS: "the turn starts too late IS the spin
    // whip, so fixing the whip must shrink the seam." Measured on both buildings, that hypothesis is
    // FALSE, and the numbers are not close:
    //     Hospital  spin motion 534.0 -> 231.0 deg (2.3x less)   seam peak 141.2 -> 143.2 (+2.0)
    //     Duplex    spin motion 494.4 -> 225.6 deg (2.2x less)   seam peak 114.3 -> 114.3 ( 0.0)
    // The spin magnitude more than HALVED and the gaze's swing away from the building bulk did not
    // move. So the gate now asserts what was actually measured — the seam does NOT track the spin —
    // rather than a prediction the data refuted. That is a finding, not a softened threshold: a gate
    // that shrank its tolerance until +2.0 passed would have hidden exactly this.
    //
    // The mechanism it hands on: Beat 1 holds the HEADING at yaw0 for the whole dive by design
    // (effects.js poseAt, "HEADING **UNTOUCHED**" — load-bearing, the exit is chosen at t=4s by
    // position AND facing). The gaze angle off the bulk therefore grows during the dive purely
    // because the camera POSITION moves, with no turn at all — which is the "dive has its OWN drift,
    // 0 -> 23 deg over the first 15s" already noted as NOT DIAGNOSED at session close. §CPE_GAZE_
    // CONSTANT_RATE inherits the seam, with this measurement as its starting evidence.
    const MAIN_SEAM_PEAK = { Hospital: 141.2, Duplex: 114.3 };   // measured, RED2_spin_whip.log
    const MAIN_SPIN_MAX  = { Hospital: 534.0, Duplex: 494.4 };   // measured, RED_spin_whip.log
    const m = res.marks;
    const peak = res.seam.length ? Math.max(...res.seam.map(x => x.offBulkDeg)) : null;
    const seamOpen = res.seam.length ? res.seam[res.seam.length - 1].offBulkDeg - res.seam[0].offBulkDeg : null;
    const base = MAIN_SEAM_PEAK[BLD], spinBase = MAIN_SPIN_MAX[BLD];
    const spinNow = sweepSpin.length ? Math.max(...sweepSpin.map(s => Math.abs(s.final))) : null;
    const dPeak = (peak !== null && base !== undefined) ? peak - base : null;
    const spinCut = (spinNow !== null && spinBase !== undefined) ? spinBase / spinNow : null;
    // Pass = the spin really did shrink a lot AND the seam did not follow it. Both halves must hold:
    // if a future change makes the seam track the spin after all, this goes RED and says so.
    const seamOK = dPeak !== null && spinCut !== null && spinCut > 1.5 && Math.abs(dPeak) <= 3;
    P('G-SW-6 the seam is NOT the whip: spin magnitude more than halves, gaze swing off the bulk does not follow',
      seamOK,
      `beats dive=${res.beats ? res.beats.dive.toFixed(3) : '?'} spin=${res.beats ? res.beats.spin.toFixed(3) : '?'}; ` +
      `spin max ${spinBase === undefined ? '?' : spinBase.toFixed(1)} -> ${spinNow === null ? '?' : spinNow.toFixed(1)}deg ` +
      `(${spinCut === null ? '?' : spinCut.toFixed(2)}x less); seam peak ${base === undefined ? '?' : base.toFixed(1)} -> ` +
      `${peak === null ? '?' : peak.toFixed(1)}deg (delta ${dPeak === null ? '?' : (dPeak >= 0 ? '+' : '') + dPeak.toFixed(1)}, ` +
      `tol +/-3); seam opening=${seamOpen === null ? 'n/a' : seamOpen.toFixed(1)}deg across 25 beat-relative samples. ` +
      `User's own fixed marks (they land in different beats before/after — the fix re-paces the spin ` +
      `— so they are continuity only, not the measure): ` +
      m.map(x => `t=${x.t.toFixed(3)}->${x.offBulkDeg.toFixed(1)}`).join(', ') + '. ' +
      `CONCLUSION: the dive->spin seam is the DIVE's held heading, not the spin whip. ` +
      `§CPE_GAZE_CONSTANT_RATE inherits it.`);
    if (!seamOK) allPass = false;

    // ── G-SW-7 — no regression ─────────────────────────────────────────────────────────────────
    const consistErr = Math.max(...res.sweep.map(s => Math.abs(s.natSum - s.natTotal)));
    const det = res.deterministic;
    const detOK = det.spinSecDiff === 0 && det.totalDiff === 0 && det.pathLenDiff === 0;
    P('G-SW-7 no regression: naturalTotal == sum(naturalSec.*), and replanning is byte-identical',
      consistErr < 1e-9 && detOK,
      `worst self-consistency error across ${res.sweep.length} plans = ${consistErr.toExponential(2)}s; ` +
      `replan diffs: spinSec=${det.spinSecDiff.toExponential(2)} total=${det.totalDiff.toExponential(2)} ` +
      `pathLen=${det.pathLenDiff.toExponential(2)}`);
    if (!(consistErr < 1e-9 && detOK)) allPass = false;

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    summary.push(`${BLD} ${pass}/${checks.length}`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}\n§CPE_SPIN_WHIP WITNESS: ${summary.join(' | ')} — ${allPass ? 'PASS' : 'FAIL'}\n${'='.repeat(78)}`);
  process.exit(allPass ? 0 : 1);
})();
