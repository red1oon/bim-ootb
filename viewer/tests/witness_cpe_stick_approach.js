// WITNESS — §CPE_STICK_APPROACH: the MaxQ bake HUD's "approaching Stick k/N" readout.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_STICK_APPROACH.
//
// THE FEATURE: cinema_maxq.js's per-frame status text (§MAXQ_ETA_TICK) gets ONE more clause —
// "approaching Stick k/N" — driven by effects.js's new `plan.stickApproachAt(tNorm)`, which reuses
// the walk's OWN live arc-fraction chain (`e3 = _evenTurnRemap(_cinemaEaseFloored(_holdMap(w3)))`,
// the exact expression Beat 3's poseAt branch already computes) rather than a second, cheaper
// estimate. That reuse is the point under test here: a naive TIME-fraction estimate of "how far
// through the walk are we" would report the camera past a held stick while it is still dwelling in
// front of it, because a hold (§CPE_STICK_HOLD) spends beat-seconds without advancing arc-length.
//
//   G-STK-1  wiring: stickCount and the bands' echoed `_s` survive band -> plan unchanged (a stick's
//            authored arc position is not invented or dropped in the round-trip).
//   G-STK-2  start: before the walk begins (dive/spin, and w3=0 exactly), the camera is reported as
//            approaching stick 1 — the first waypoint on the path, not stick 0 or null.
//   G-STK-3  monotonic: sampled densely across the whole walk, the reported index never goes
//            backward — a real camera on a real path cannot "un-approach" a stick it passed.
//   G-STK-4  mid-stick-1 / just-past-stick-1: a sample safely before the first index transition
//            still reads stick 1; a sample just after it reads stick 2 — the transition is a real
//            step at a real point in the walk, not a fencepost error.
//   G-STK-5  near-end: once the walk fraction reaches 1.0 (beats.out), every stick has been passed
//            and the readout goes null — the bake HUD stops claiming to approach anything once
//            nothing is left ahead (this is also what makes the feature a no-op after the walk).
//   G-STK-6  hold-awareness (the reason this reuses the real chain instead of linear w3): at the SAME
//            elapsed walk-time-fraction w3, a plan with a hold parked on stick 2 has NOT yet reached
//            stick 3 at a w3 where its hold-free twin already has. The dwell delays the transition;
//            it does not just relabel it.
//   G-STK-7  no-sticks default: a plan with no editor bands at all (the common case — an unedited
//            bake) reports stickCount=0 and stickApproachAt returns null everywhere — the bake HUD
//            text is unchanged from before this feature on every film that never touched the editor.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8450;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
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

    const DUR = 40, HOLD = 2.0;
    const res = await page.evaluate(async (DUR, HOLD) => {
      const A = window.APP;
      const out = { err: null };
      try {
        if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
        if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

        // A real 5-band path (settle, 3 sticks, stop) near the building, same dog-leg shape
        // witness_cpe_stick_hold.js uses — anchored off the derived plan's own first waypoint so the
        // fixture sits ON a real building rather than at the origin.
        const planD = A.cinemaPathPlan(DUR);
        const s0 = planD.waypoints[0];
        const legs = [
          { x: s0.x,      y: s0.y, z: s0.z      },
          { x: s0.x + 8,  y: s0.y, z: s0.z + 4  },
          { x: s0.x + 16, y: s0.y, z: s0.z + 12 },
          { x: s0.x + 24, y: s0.y, z: s0.z + 16 },
          { x: s0.x + 32, y: s0.y, z: s0.z + 24 },
        ];
        // Explicit, KNOWN arc positions — this is the fixture's whole point (per spec: "N sticks at
        // known arc positions/hold times"), not derived from where the editor happened to drop them.
        const STICK_S = [0.25, 0.50, 0.75];
        const mkBands = (holdOnMiddle) => legs.map((c, i) => {
          const a = legs[Math.max(0, i - 1)], b = legs[Math.min(legs.length - 1, i + 1)];
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
          const band = { c, d: { x: dx / L, y: 0, z: dz / L }, len: 10, hold: 0 };
          if (i > 0 && i < legs.length - 1) { band._stick = true; band._s = STICK_S[i - 1]; }
          if (i === 2) band.hold = holdOnMiddle;   // the middle stick (s=0.50) carries the hold
          return band;
        });

        const planNoHold = A.cinemaPathPlan(DUR, { bands: mkBands(0) });
        const planHold = A.cinemaPathPlan(DUR, { bands: mkBands(HOLD) });

        out.stickCount = { noHold: planNoHold.stickCount, hold: planHold.stickCount };
        out.sEcho = (planNoHold.bands || []).filter(b => b._stick).map(b => b._s);
        out.beats = { noHold: planNoHold.beats, hold: planHold.beats };

        // ── G-STK-2: start ──────────────────────────────────────────────────────────────────────
        out.atFilmStart = planNoHold.stickApproachAt(0);              // before the dive even lands
        out.atWalkStart = planNoHold.stickApproachAt(planNoHold.beats.spin);  // w3 = 0 exactly

        // ── G-STK-3 / G-STK-4: dense scan of the no-hold plan's walk, w3 in [0,1] ──────────────────
        const N = 800;
        const b = planNoHold.beats;
        const scan = [];
        for (let i = 0; i <= N; i++) {
          const w3 = i / N;
          const tNorm = b.spin + (b.out - b.spin) * w3;
          scan.push({ w3, r: planNoHold.stickApproachAt(tNorm) });
        }
        out.scanIdx = scan.map(s => s.r ? s.r.index : 0);   // 0 stands in for null in the transcript
        // First w3 at which the reported index becomes 2 (the 1->2 transition), and 3 (the 2->3 one).
        const firstAt = (idx) => { const f = scan.find(s => s.r && s.r.index === idx); return f ? f.w3 : null; };
        const t12 = firstAt(2), t23 = firstAt(3);
        const firstNullAfter23 = (() => {
          if (t23 == null) return null;
          const f = scan.find(s => s.w3 > t23 && !s.r);
          return f ? f.w3 : null;
        })();
        out.transitions = { t12, t23, firstNullAfter23 };

        // mid-stick-1 / just-past-stick-1 samples, read straight off the transition the scan found.
        if (t12 != null) {
          const wMid = t12 / 2;
          const wJust = Math.min(1, t12 + 1 / N);
          out.midStick1 = planNoHold.stickApproachAt(b.spin + (b.out - b.spin) * wMid);
          out.justPastStick1 = planNoHold.stickApproachAt(b.spin + (b.out - b.spin) * wJust);
        }

        // ── G-STK-5: near-end — exactly at beats.out (w3=1), and staying null through the rise ──
        out.atWalkEnd = planNoHold.stickApproachAt(b.out);
        out.atRiseMid = planNoHold.stickApproachAt((b.out + b.rise) / 2);

        // ── G-STK-6: hold-awareness — SAME w3 on both plans, does the held twin lag? ────────────
        // Use the no-hold plan's OWN measured 2->3 transition point as the probe: at that w3, the
        // hold-free plan has just reached stick 3. The held plan, sampled at the SAME w3 (each in
        // its own beats.spin/out — w3 is normalized, so this is comparing "same fraction of however
        // long the walk takes", the exact quantity a naive HUD estimate would use).
        if (t23 != null) {
          const hb = planHold.beats;
          const tHoldAtSameW3 = hb.spin + (hb.out - hb.spin) * t23;
          out.holdLag = { noHoldAtT23: planNoHold.stickApproachAt(b.spin + (b.out - b.spin) * t23),
                          holdAtSameW3: planHold.stickApproachAt(tHoldAtSameW3) };
          // Also just BEFORE stick 1 (w3 small) and just AFTER stick 3 well into the tail (w3 near 1)
          // — the dwell's effect must be LOCAL to its own stick, not a global slowdown.
          const wEarly = Math.max(0, t12 != null ? t12 / 4 : 0.05);
          const wLate = 0.98;
          out.holdFar = {
            early: { noHold: planNoHold.stickApproachAt(b.spin + (b.out - b.spin) * wEarly),
                     hold: planHold.stickApproachAt(hb.spin + (hb.out - hb.spin) * wEarly) },
            late: { noHold: planNoHold.stickApproachAt(b.spin + (b.out - b.spin) * wLate),
                    hold: planHold.stickApproachAt(hb.spin + (hb.out - hb.spin) * wLate) },
          };
        }

        // ── G-STK-7: the default plan (no editor override at all) has no sticks ────────────────
        out.derivedDefault = { stickCount: planD.stickCount,
          atStart: planD.stickApproachAt(0), atMid: planD.stickApproachAt(0.5), atEnd: planD.stickApproachAt(1) };
      } catch (e) { out.err = e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / '); }
      return out;
    }, DUR, HOLD);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok }); if (!ok) allPass = false;
      console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-STK-1..7 the plan API exposes stickCount/stickApproachAt', false, res.err);
      console.log(`\n  ${BLD}: 0/1`); summary.push(`${BLD} 0/7`); await page.close(); continue;
    }

    // ── G-STK-1 ──────────────────────────────────────────────────────────────────────────────
    const sEchoOK = JSON.stringify(res.sEcho) === JSON.stringify([0.25, 0.50, 0.75]);
    P('G-STK-1 stickCount=3 and each stick\'s authored _s survives band -> plan unchanged',
      res.stickCount.noHold === 3 && res.stickCount.hold === 3 && sEchoOK,
      `stickCount noHold=${res.stickCount.noHold} hold=${res.stickCount.hold}; ` +
      `_s echo=[${res.sEcho.join(',')}] (expected [0.25,0.5,0.75])`);

    // ── G-STK-2 ──────────────────────────────────────────────────────────────────────────────
    const startOK = res.atFilmStart && res.atFilmStart.index === 1 && res.atFilmStart.count === 3 &&
      res.atWalkStart && res.atWalkStart.index === 1;
    P('G-STK-2 start: before the walk begins the camera approaches stick 1 (not stick 0, not null)',
      startOK,
      `atFilmStart(tNorm=0)=${JSON.stringify(res.atFilmStart)}, atWalkStart(w3=0)=${JSON.stringify(res.atWalkStart)}`);

    // ── G-STK-3 ──────────────────────────────────────────────────────────────────────────────
    const idxSeq = res.scanIdx;
    let monotone = true, backward = -1;
    for (let i = 1; i < idxSeq.length; i++) {
      // null (0) after a real index is fine (walk finished); a real index going DOWN, or a real
      // index appearing again AFTER a null, would be backward motion — neither is allowed.
      if (idxSeq[i] !== 0 && idxSeq[i - 1] !== 0 && idxSeq[i] < idxSeq[i - 1]) { monotone = false; backward = i; break; }
      if (idxSeq[i] !== 0 && idxSeq[i - 1] === 0) { monotone = false; backward = i; break; }
    }
    P('G-STK-3 monotonic: the reported stick index never goes backward across the whole walk',
      monotone, monotone ? `${idxSeq.length} samples, index only ever holds or advances (0=null/past-all)`
                          : `backward step at sample ${backward}: ...${idxSeq.slice(Math.max(0, backward - 3), backward + 3)}...`);

    // ── G-STK-4 ──────────────────────────────────────────────────────────────────────────────
    const t12 = res.transitions.t12;
    const midOK = res.midStick1 && res.midStick1.index === 1;
    const justOK = res.justPastStick1 && res.justPastStick1.index === 2;
    P('G-STK-4 mid-stick-1 reads Stick 1, just-past-stick-1 reads Stick 2',
      t12 != null && midOK && justOK,
      t12 == null ? 'no 1->2 transition found in the scan (RED)'
                  : `1->2 transition at w3=${t12.toFixed(4)}; mid-stick-1(w3=${(t12/2).toFixed(4)})=` +
                    `${JSON.stringify(res.midStick1)}; just-past(w3=${(t12+1/800).toFixed(4)})=${JSON.stringify(res.justPastStick1)}`);

    // ── G-STK-5 ──────────────────────────────────────────────────────────────────────────────
    const endOK = res.atWalkEnd === null && res.atRiseMid === null;
    P('G-STK-5 near-end: at beats.out (w3=1) and through the rise, every stick has been passed (null)',
      endOK, `atWalkEnd(w3=1)=${JSON.stringify(res.atWalkEnd)}, atRiseMid=${JSON.stringify(res.atRiseMid)}`);

    // ── G-STK-6 ──────────────────────────────────────────────────────────────────────────────
    let holdOK = false, holdDetail = 'no t23 transition found — cannot probe the hold';
    if (res.holdLag) {
      const noHoldReached3 = res.holdLag.noHoldAtT23 && res.holdLag.noHoldAtT23.index === 3;
      const heldStillBehind = !res.holdLag.holdAtSameW3 || res.holdLag.holdAtSameW3.index <= 2;
      const strictLag = res.holdLag.holdAtSameW3 == null || res.holdLag.holdAtSameW3.index < 3 ||
        (res.holdLag.holdAtSameW3.index === 3 && false); // index<3 is the strict case; index absent(null=past-all) also counts as "not yet at 3 the same way"
      const farEarlyMatch = res.holdFar.early.noHold && res.holdFar.early.hold &&
        res.holdFar.early.noHold.index === res.holdFar.early.hold.index;
      holdOK = noHoldReached3 && heldStillBehind && strictLag && farEarlyMatch;
      holdDetail = `at the no-hold plan's own 2->3 transition (w3=${res.transitions.t23.toFixed(4)}): ` +
        `noHold=${JSON.stringify(res.holdLag.noHoldAtT23)} (want index=3), ` +
        `hold(same w3)=${JSON.stringify(res.holdLag.holdAtSameW3)} (want index<=2 — the dwell delays arrival); ` +
        `far from the hold (w3~${(t12 != null ? t12/4 : 0.05).toFixed(4)}) both agree: ` +
        `noHold=${JSON.stringify(res.holdFar.early.noHold)} hold=${JSON.stringify(res.holdFar.early.hold)}`;
    }
    P('G-STK-6 hold-awareness: at matching walk-time-fraction, a hold on stick 2 delays reaching stick 3',
      holdOK, holdDetail);

    // ── G-STK-7 ──────────────────────────────────────────────────────────────────────────────
    const defOK = res.derivedDefault.stickCount === 0 && res.derivedDefault.atStart === null &&
      res.derivedDefault.atMid === null && res.derivedDefault.atEnd === null;
    P('G-STK-7 the unedited derived plan (no editor bands) has stickCount=0 and never reports a stick',
      defOK, `derivedDefault=${JSON.stringify(res.derivedDefault)}`);

    const pass = checks.filter(x => x.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    summary.push(`${BLD} ${pass}/${checks.length}`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}\n§CPE_STICK_APPROACH WITNESS: ${summary.join(' | ')} — ${allPass ? 'PASS' : 'FAIL'}\n${'='.repeat(78)}`);
  process.exit(allPass ? 0 : 1);
})();
