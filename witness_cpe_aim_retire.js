// WITNESS — §CPE_AIM_DEPTH_RETIRED. Spec: bim-compiler
// prompts/RESUME_2026-09-02_FILM_REVIEW.md §AIM_DEPTH_RETIREMENT (+ §PREMISE-CHECK).
//
// THE ISSUE IT PROVES OR DISPROVES. §CPE_AIM_DEPTH was the sole automatic exception to path-follow
// (§CPE_AIM_SIMPLIFY, 2026-08-14, PR #1344). The user's direction, twice: "its best to leave alone
// its pointing along its path as more intuitive when pathing and user change of head at intended
// better angles is all needed, to stay simple and predictable" and "I prefer the previous ... as it
// follows path direction." This measures whether retiring it actually delivers path-follow, and
// whether the FOUR things that had to survive still do.
//
//   A-1  PATH-FOLLOW IS THE ONLY AUTOMATIC RULE. On a real stored path, with no pin and no
//        correction authored, the gaze deviation from the path's own tangent is bounded by the
//        look-ahead CHORD geometry alone. Max and mean are reported as numbers, per building.
//        ⚠ NOT expected to be zero, and a zero tolerance would be wrong: path-follow aims at an
//        arc-length look-ahead point _AH_FRAC = 0.15 of the walk ahead, so on any curved path the
//        chord to that point differs from the instantaneous tangent by construction. The gate is
//        against the BASELINE ARM's own number, not against a taste threshold.
//   A-2  THE RED CONTROL / NO-OP GATE. The same series measured on origin/main (the depth-ON arm)
//        must be materially DIFFERENT. If the two arms agree the change did nothing and this run
//        says NO-OP — never PASS. Requires the baseline JSON; without it the whole A-2 gate is
//        INCONCLUSIVE, stated, not skipped.
//   A-3  §CPE_AIM_PIN SURVIVES. A pin authored on one band aims the gaze at the pinned target
//        inside that band's Voronoi zone (to <= 2 deg), and leaves every sample OUTSIDE the zone
//        bit-identical to the unpinned run. This is the user's own authored head-turn — the
//        mechanism they named as "all needed".
//   A-4  THE AUTHORED CORRECTION WINDOW SURVIVES, with #1597/#1598 intact. One authored correction
//        produces its authored deviation inside a bounded window, nothing outside it moves, and the
//        worst in-window per-sample step does not exceed the baseline walk's own worst step (the
//        110.44 deg §CPE_CORR_BRANCH snap must not come back with the underlying gaze changed).
//   A-5  DIVE-IN AND CLOSING ORBIT UNDISTURBED. User: these "are perfectly fine and must remain
//        undisturbed." Sampled through the plan's own poseAt over the WHOLE film and compared arm
//        to arm, split by the plan's own beat boundaries. Beat 1 (dive) and the closing orbit must
//        match the baseline to a tight tolerance; the walk is the only beat allowed to differ.
//   A-6  THE AIM HALF OF §CPE_STICK_HOLD IS GONE, AND SAYS SO. No §CPE_AIM_DEPTH* / §CPE_AIM_GRID /
//        §CPE_AIM_LATCH line, and no A._probeAimDepth hook, anywhere in the run.
//
// NO BAKE. User directive 2026-09-02: cli_silent_bake.js is a proven, expensive facility, not a
// probe. Nothing here renders a frame — every number comes from the product's own read-only pose
// hooks (A._cpeBeat3GazeDebug = the real _beat3Pose, A._cpePinZonesDebug, A._cpeCorrectionsDebug,
// plan.poseAt). No screenshot is taken and none would be admissible (CLAUDE.md FUNDAMENTAL LAW).
//
// HOW THE TWO ARMS ARE PRODUCED. This same file is run in two worktrees — one at origin/main
// (depth ON) and one on the change branch (depth OFF) — each against its own static server. The arm
// is DETECTED from the product (`typeof A._probeAimDepth`), never passed in, so a mislabelled run is
// impossible. Each run writes its series to OUT; the second run reads the first via BASE.
//
// Usage:
//   PORT=<port> BLD=<building> OUT=<file.json> [BASE=<other-arm.json>] node witness_cpe_aim_retire.js
const fs = require('fs');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8533;
const BLD = process.env.BLD || 'Duplex';
const DB = process.env.DB || `/buildings/${BLD}_extracted.db`;
const SECS = +(process.env.SECS || 60);
const N = +(process.env.N || 900);          // arc samples across the walk
const NT = +(process.env.NT || 600);        // film samples across the whole clip (A-5)
const OUT = process.env.OUT || `witness_cpe_aim_retire_${BLD}.json`;
const BASE = process.env.BASE || '';

process.on('unhandledRejection', e => { console.error('UNHANDLED: ' + (e && e.stack || e)); process.exit(1); });

function ang(a, b) {
  if (!a || !b) return null;
  const d = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
const fx = (v, n) => (v == null || !isFinite(v)) ? 'n/a' : v.toFixed(n == null ? 3 : n);

(async () => {
  const checks = [];
  const P = (label, ok, detail) => { checks.push({ label, ok, detail }); };
  // A gate that could not be judged is INCONCLUSIVE and must never read as PASS
  // (WITNESS_INTERFACE_FRAMEWORK rule 4).
  const INC = [];
  const I = (label, why) => { INC.push({ label, why }); };

  const b = await puppeteer.launch({
    headless: 'new',
    args: process.env.GPU_REAL
      // §CLI_BAKE_GL's own wiring (--gpu real): real NVIDIA GL through ANGLE's gl-egl backend, paired
      // with __EGL_VENDOR_LIBRARY_FILENAMES in the environment. Same probe, no bake — swiftshader is
      // 10-50x slower and could not finish a Hospital load in 50 min under concurrent load.
      ? ['--use-gl=angle', '--use-angle=gl-egl', '--no-sandbox', '--ignore-gpu-blocklist']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 1800000,
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 500 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 240)));
  // CLAUDE.md rule 3 — the shipped §-log is PRIMARY EVIDENCE, never suppressed. Every console line
  // is kept so A-6 can assert the ABSENCE of the retired rule's own lines against a non-zero count
  // of lines actually scanned (an absence measured over an empty log is vacuous).
  const logs = [];
  p.on('console', m => logs.push(m.text()));

  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=${DB}`,
    { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.cinemaPathPlan === 'function',
    { timeout: 300000 });
  await p.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue || []).length > 0,
    { timeout: 240000, polling: 250 }).catch(() => {});
  await p.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue || []).length),
    { timeout: 1200000, polling: 1000 }).catch(() => {});
  await p.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 240000, polling: 2000 }).catch(() => {});

  const res = await p.evaluate(async (N, NT, SECS) => {
    const A = window.APP;
    const nrm = (g) => {
      const dx = g.target.x - g.pos.x, dy = g.target.y - g.pos.y, dz = g.target.z - g.pos.z;
      // NO `|| 1` FALLBACK — a zero-length gaze must be REPORTED, not normalised into (0,0,0).
      // acos of a zero dot is exactly 90 deg and looks entirely plausible; this file's sibling
      // witness (witness_cpe_corr_brush.js) shipped that fake number twice before the rule was
      // written down.
      const L = Math.hypot(dx, dy, dz);
      return L > 0 ? { x: dx / L, y: dy / L, z: dz / L, len: L } : null;
    };
    const sampleWalk = () => {
      const out = [];
      for (let i = 0; i <= N; i++) {
        const e3 = i / N;
        const g = A._cpeBeat3GazeDebug(e3);
        out.push({ e3, pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z }, g: nrm(g),
                   arcLen: g.arcLen, turnOverlap: g.turnOverlap });
      }
      return out;
    };
    const sampleFilm = (plan) => {
      const out = [];
      for (let i = 0; i <= NT; i++) {
        const t = i / NT;
        const q = plan.poseAt(t);
        if (!q) { out.push(null); continue; }
        out.push({ t, x: q.x, y: q.y, z: q.z, tx: q.tx, ty: q.ty, tz: q.tz });
      }
      return out;
    };

    // 1. THE REAL STORED PATH. cinemaPathPlan(sec) with the ov argument OMITTED runs the shipped
    //    lazy loader (_cpeLoadFromDb) and uses the building DB's own cinema_path table if it has
    //    one. Which source was used is REPORTED, never assumed — a derived fallback measured as if
    //    it were the user's stored path would be a different claim entirely.
    const plan0 = await A.cinemaPathPlan(SECS);
    if (!plan0) return { fail: 'no plan built' };
    const staged = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null;
    const stored = !!(staged && staged.bands && staged.bands.length);
    let ovBase, bandSrc;
    if (stored) { ovBase = JSON.parse(JSON.stringify(staged)); bandSrc = 'db:cinema_path'; }
    else if (plan0.bands && plan0.bands.length >= 2) {
      ovBase = { bands: plan0.bands.map(x => JSON.parse(JSON.stringify(x))) }; bandSrc = 'plan.bands';
    } else {
      // A-3 needs a BAND to pin and a neighbour to prove no bleed into; a derived loose-waypoint
      // route has neither (`_pinLookAtAt` returns null when there are no bands at all). Synthesize
      // three bands from the plan's OWN flown waypoints — not invented geometry, the route this
      // building already produces, re-expressed in the band shape the pin feature is defined over.
      // Placed in ovBase so EVERY arm below (base, pinned, corrected) flies the identical route:
      // bands drive `_cpeWp`, so a route that differed between arms would confound every number
      // here (§CPE_CORR_BOUNDED_CONFOUND).
      const wp = plan0.waypoints || [];
      if (wp.length < 3) return { fail: `derived plan exposes only ${wp.length} waypoint(s) — cannot form bands` };
      const pick = [0, Math.floor((wp.length - 1) / 2), wp.length - 1];
      ovBase = { bands: pick.map((k, i) => {
        const a = wp[Math.max(0, k - 1)], c = wp[Math.min(wp.length - 1, k + 1)];
        const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z, L = Math.hypot(dx, dy, dz) || 1;
        const seg = Math.hypot(wp[1].x - wp[0].x, wp[1].y - wp[0].y, wp[1].z - wp[0].z) || 4;
        return { c: { x: wp[k].x, y: wp[k].y, z: wp[k].z },
                 d: { x: dx / L, y: dy / L, z: dz / L }, len: Math.max(2, seg),
                 hold: 0, _stick: i === 1 };
      }) };
      bandSrc = 'synthesized-from-plan-waypoints';
    }
    // Every arm below is built through the SAME override path, identical in every field except the
    // one under test (§CPE_CORR_BOUNDED_CONFOUND, 2026-09-01: comparing a derived plan against an
    // override plan measures two different routes, not one route with and without a feature).
    const mkOv = (extra) => Object.assign(JSON.parse(JSON.stringify(ovBase)), extra || {});

    const planBase = await A.cinemaPathPlan(SECS, mkOv({ aimCorrections: [] }));
    if (!planBase) return { fail: 'no base plan built' };
    const base = sampleWalk();
    // ── the look-ahead chord, reconstructed EXACTLY as _lookAhead computes it ──────────────────
    // effects.js:8000 `var _AH_FRAC = 0.15, _ahN = 240` and :8028
    // `_outPos(_ahAtArc(_ahArcAt(u) + _AH_FRAC * _ahL))`. BOTH constants matter: an earlier cut of
    // this witness built the arc table from its own 901 gaze samples instead of the product's 240,
    // and where the path turns sharply the two tables disagree on which PARAMETER a given arc
    // length maps to — which showed up as a 23.9 deg "residual rule" on HHS that was pure witness
    // arithmetic. Positions come from the product hook at the computed parameter, so nothing here
    // interpolates the curve.
    const AH_FRAC = 0.15, ahN = 240;
    const ahP = [], ahS = [0];
    for (let i = 0; i <= ahN; i++) ahP.push(A._cpeBeat3GazeDebug(i / ahN).pos);
    for (let i = 1; i <= ahN; i++) ahS.push(ahS[i - 1] +
      Math.hypot(ahP[i].x - ahP[i - 1].x, ahP[i].y - ahP[i - 1].y, ahP[i].z - ahP[i - 1].z));
    const ahL = ahS[ahN];
    const ahArcAt = (u) => {
      const t = Math.max(0, Math.min(1, u)) * ahN, i = Math.min(ahN - 1, Math.floor(t));
      return ahS[i] + (ahS[i + 1] - ahS[i]) * (t - i);
    };
    const ahAtArc = (sv) => {
      if (sv <= 0) return 0;
      if (sv >= ahL) return 1;
      let lo = 0, hi = ahN;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ahS[m] <= sv) lo = m; else hi = m; }
      const dd = ahS[hi] - ahS[lo];
      return (lo + (dd > 1e-12 ? (sv - ahS[lo]) / dd : 0)) / ahN;
    };
    const chord = [];
    for (let i = 0; i <= N; i++) {
      const e3 = i / N;
      const q = A._cpeBeat3GazeDebug(ahAtArc(ahArcAt(e3) + AH_FRAC * ahL)).pos;
      const dx = q.x - base[i].pos.x, dy = q.y - base[i].pos.y, dz = q.z - base[i].pos.z;
      const L = Math.hypot(dx, dy, dz);
      chord.push(L > 0 ? { x: dx / L, y: dy / L, z: dz / L } : null);
    }
    const film = sampleFilm(planBase);
    const zones = A._cpePinZonesDebug ? JSON.parse(JSON.stringify(A._cpePinZonesDebug())) : null;
    const beats = planBase.beats ? JSON.parse(JSON.stringify(planBase.beats)) : null;
    const nBands = (ovBase.bands || []).length;

    // 2. A-3 — a pin on ONE band. Target offset from that band's own centre so the aim change is
    //    unambiguous; same construction witness_cpe_aim_pin.js already uses (this gate is about the
    //    AIM MATH, not the raycast UI).
    let pinRes = null;
    if (nBands >= 2) {
      const bi = Math.min(1, nBands - 1);
      const c = ovBase.bands[bi].c;
      const target = { x: c.x + 12, y: c.y + 3, z: c.z - 9 };
      const ovPin = mkOv({ aimCorrections: [] });
      ovPin.bands[bi].lookAt = { x: target.x, y: target.y, z: target.z };
      const planPin = await A.cinemaPathPlan(SECS, ovPin);
      if (planPin) {
        const pin = sampleWalk();
        const z = (A._cpePinZonesDebug ? A._cpePinZonesDebug() : []).filter(q => q.b === bi)[0] || null;
        const rows = [];
        const tOv = base[0] ? base[0].turnOverlap : 0.25;
        for (let i = 0; i <= N; i++) {
          const e3 = i / N;
          // §CINEMA_BEAT_OVERLAP blends the walk gaze onto the orbit pivot over the last `tOv` of
          // the walk, AFTER the pin is applied — so a pinned zone that reaches into that stretch
          // legitimately no longer points at the pin. Judging it there would be measuring the beat
          // hand-off, not the pin. Excluded by the product's own constant (measured: it cost 8.27
          // deg of fake "aim error" on Duplex before this exclusion existed).
          // TWO predicates, deliberately not one — conflating them cost a fake 129 deg "bleed"
          // reading: `inZone` is Voronoi MEMBERSHIP (what "no bleed into neighbours" is about, and
          // the only correct partition for the outside test), `judge` additionally excludes the
          // hand-off stretch where the gaze is no longer the pin's to own.
          const inZone = !!z && e3 >= z.lo && e3 <= z.hi;
          const judge = inZone && e3 <= 1 - tOv;
          const want = { x: target.x - pin[i].pos.x, y: target.y - pin[i].pos.y, z: target.z - pin[i].pos.z };
          const wL = Math.hypot(want.x, want.y, want.z);
          rows.push({ e3, inZone, judge,
            aimErr: (wL > 0 && pin[i].g)
              ? Math.acos(Math.max(-1, Math.min(1,
                  pin[i].g.x * want.x / wL + pin[i].g.y * want.y / wL + pin[i].g.z * want.z / wL))) * 180 / Math.PI
              : null,
            vsBase: (pin[i].g && base[i].g)
              ? Math.acos(Math.max(-1, Math.min(1,
                  pin[i].g.x * base[i].g.x + pin[i].g.y * base[i].g.y + pin[i].g.z * base[i].g.z))) * 180 / Math.PI
              : null });
        }
        pinRes = { band: bi, target, zone: z ? { lo: z.lo, hi: z.hi } : null, rows };
      }
    }

    // 3. A-4 — one authored correction, mid-walk, aimed 60 deg off the baseline gaze there. The
    //    +60 deg yaw offset is deliberately NOT tuned: it is the same authored stroke
    //    witness_cpe_corr_brush.js uses, which is what put the entry gaze near-antipodal on Hospital
    //    and exposed the §CPE_CORR_BRANCH 2*pi flip. Changing it would un-exercise that defect.
    const mid = base[Math.floor(N / 2)];
    let corrRes = null;
    if (mid && mid.g) {
      const yaw = Math.atan2(mid.g.z, mid.g.x) + Math.PI / 3;
      const pit = Math.asin(Math.max(-1, Math.min(1, mid.g.y)));
      const dir = { x: Math.cos(yaw) * Math.cos(pit), y: Math.sin(pit), z: Math.sin(yaw) * Math.cos(pit) };
      const mkCorrPlan = () => A.cinemaPathPlan(SECS, mkOv({ aimCorrections: [
        { pos: mid.pos, dir, rampF: 0.04, holdF: 0.12, decayF: 0.18 }] }));
      const planCorr = await mkCorrPlan();
      if (planCorr) {
        const corr = sampleWalk();
        const rec = A._cpeCorrectionsDebug ? JSON.parse(JSON.stringify(A._cpeCorrectionsDebug())) : null;
        // §CPE_CORR_BRANCH A/B in ONE run, through the product's own witness-only flag: refD=0 is
        // exactly the pre-#1597 naive short-way yaw. `refD` is resolved at PLAN-BUILD time, so the
        // plan must be rebuilt with the flag set — not just re-sampled. Without this arm the gate
        // could only assert a number with no evidence it was ever otherwise (CLAUDE.md: every test
        // must name the issue it proves or disproves).
        let stepOff = null;
        A._cpeCorrBranchOff = true;
        try {
          const planOff = await mkCorrPlan();
          if (planOff) {
            const off = sampleWalk();
            stepOff = [];
            for (let i = 1; i <= N; i++) {
              stepOff.push((off[i].g && off[i - 1].g)
                ? Math.acos(Math.max(-1, Math.min(1,
                    off[i].g.x * off[i - 1].g.x + off[i].g.y * off[i - 1].g.y + off[i].g.z * off[i - 1].g.z))) * 180 / Math.PI
                : null);
            }
          }
        } finally { A._cpeCorrBranchOff = false; await mkCorrPlan(); }
        const diff = [], stepCorr = [], stepBase = [];
        for (let i = 0; i <= N; i++) {
          diff.push((corr[i].g && base[i].g)
            ? Math.acos(Math.max(-1, Math.min(1,
                corr[i].g.x * base[i].g.x + corr[i].g.y * base[i].g.y + corr[i].g.z * base[i].g.z))) * 180 / Math.PI
            : null);
          if (i > 0) {
            const st = (a, bb) => (a && bb)
              ? Math.acos(Math.max(-1, Math.min(1, a.x * bb.x + a.y * bb.y + a.z * bb.z))) * 180 / Math.PI : null;
            stepCorr.push(st(corr[i].g, corr[i - 1].g));
            stepBase.push(st(base[i].g, base[i - 1].g));
          }
        }
        corrRes = { rec, diff, stepCorr, stepBase, stepOff, authoredF: 0.04 + 0.12 + 0.18 };
      }
    }

    return {
      arm: (typeof A._probeAimDepth === 'function') ? 'depth-ON' : 'depth-OFF',
      bandSrc,
      building: A.activeBuilding || A.buildingName || null,
      storedPath: stored, nBands, secs: SECS, beats, zones,
      arcLen: base[0] ? base[0].arcLen : null,
      turnOverlap: base[0] ? base[0].turnOverlap : null,
      base: base.map((s, i) => ({ e3: s.e3, g: s.g, pos: s.pos, chord: chord[i] })),
      film, pin: pinRes, corr: corrRes,
    };
  }, N, NT, SECS);

  await p.close(); await b.close();

  if (res && res.fail) {
    console.log(`§WITNESS_CPE_AIM_RETIRE INCONCLUSIVE — ${res.fail}; nothing was judged.`);
    process.exitCode = 1; return;
  }

  // ── derive A-1: deviation of the gaze from the path's own tangent ────────────────────────────
  // Central-difference tangent from the SAMPLED positions — the same curve the gaze is read off, so
  // no second notion of "the path" can drift from the one the film flies.
  const devs = [], where = [];
  let degenerate = 0, stationary = 0;
  for (let i = 1; i < res.base.length - 1; i++) {
    const s = res.base[i];
    // §CINEMA_BEAT_OVERLAP blends the walk gaze onto the orbit pivot over the last fraction of the
    // walk. That is a BEAT HAND-OFF, not an aim rule; judging it as "deviation from the path" would
    // measure the wrong thing. Excluded by the PRODUCT's own constant, read off the debug hook.
    if (s.e3 > 1 - res.turnOverlap) continue;
    if (!s.g) { degenerate++; continue; }
    const a = res.base[i - 1].pos, c = res.base[i + 1].pos;
    const tx = c.x - a.x, ty = c.y - a.y, tz = c.z - a.z, tL = Math.hypot(tx, ty, tz);
    if (tL < 1e-9) { stationary++; continue; }
    devs.push(ang(s.g, { x: tx / tL, y: ty / tL, z: tz / tL }));
    where.push(s.e3);
  }
  // ── A-1's real claim: the gaze IS the arc-length look-ahead CHORD and nothing else ──────────
  // A threshold on "deviation from the tangent" cannot carry this claim: the correct residual is
  // not zero (the chord to a point 15% of the walk ahead is not the local tangent on a curved path)
  // and any number picked for it would be invented. The identity is asserted DIRECTLY instead,
  // against the chord the page reconstructed from the product's OWN _AH_FRAC / _ahN / _outPos.
  const chordErr = [];
  for (let i = 0; i < res.base.length; i++) {
    const s2 = res.base[i];
    if (!s2.g || !s2.chord) continue;
    // §CPE_SEAM_CONTINUOUS's _openU blend and §CINEMA_BEAT_OVERLAP's hand-off are the two places
    // path-follow is legitimately overridden on an unpinned, uncorrected walk. _openU is not
    // exposed, so the leading samples are excluded by the same fraction the hand-off uses — stated,
    // and reported as an excluded COUNT so the exclusion cannot hide a defect silently.
    if (s2.e3 < res.turnOverlap || s2.e3 > 1 - res.turnOverlap) continue;
    chordErr.push(ang(s2.g, s2.chord));
  }
  const chordMax = chordErr.length ? Math.max(...chordErr) : null;
  const chordMean = chordErr.length ? chordErr.reduce((x, y) => x + y, 0) / chordErr.length : null;

  const maxDev = devs.length ? Math.max(...devs) : null;
  const meanDev = devs.length ? devs.reduce((x, y) => x + y, 0) / devs.length : null;
  const maxAt = devs.length ? where[devs.indexOf(maxDev)] : null;
  const p95 = devs.length ? devs.slice().sort((x, y) => x - y)[Math.floor(devs.length * 0.95)] : null;

  console.log(`§CPE_AIM_RETIRE_ARM arm=${res.arm} building=${res.building} storedPath=${res.storedPath} ` +
    `bands=${res.nBands}(${res.bandSrc}) secs=${res.secs} walkArcLen=${fx(res.arcLen, 2)}m turnOverlap=${fx(res.turnOverlap, 3)}`);
  console.log(`§CPE_AIM_RETIRE_TANGENT judged=${devs.length}/${res.base.length} maxDeg=${fx(maxDev)} ` +
    `at e3=${fx(maxAt)} meanDeg=${fx(meanDev)} p95Deg=${fx(p95)} degenerateGaze=${degenerate} stationary=${stationary}`);
  console.log(`§CPE_AIM_RETIRE_CHORD judged=${chordErr.length}/${res.base.length} ` +
    `maxDeg=${fx(chordMax)} meanDeg=${fx(chordMean)} (gaze vs the reconstructed _AH_FRAC=0.15 ` +
    `look-ahead chord; seam and orbit hand-off excluded)`);

  fs.writeFileSync(OUT, JSON.stringify({
    arm: res.arm, building: res.building, storedPath: res.storedPath, nBands: res.nBands,
    secs: res.secs, arcLen: res.arcLen, turnOverlap: res.turnOverlap, beats: res.beats,
    tangent: { n: devs.length, max: maxDev, mean: meanDev, p95, devs },
    chord: { n: chordErr.length, max: chordMax, mean: chordMean },
    film: res.film,
  }, null, 1));
  console.log(`§CPE_AIM_RETIRE_OUT wrote ${OUT}`);

  // ── A-1 ──────────────────────────────────────────────────────────────────────────────────────
  if (!chordErr.length) {
    I('A-1 the walk gaze IS path-follow', 'no sample could be compared against the look-ahead chord — nothing judged');
  } else {
    // 2 deg: the sampler's own resolution, not a taste threshold. The chord is reconstructed from a
    // POLYLINE through N sampled points while the product interpolates the real curve, so a residual
    // of order the inter-sample turn angle is arithmetic, not a rule. Anything larger is a rule.
    P('A-1 the walk gaze IS path-follow and nothing else — it equals the look-ahead chord',
      chordMax < 2,
      `gaze vs the reconstructed _AH_FRAC=0.15 arc-length look-ahead chord: max=${fx(chordMax)} deg, ` +
      `mean=${fx(chordMean)} deg over ${chordErr.length} judged samples (seam + orbit hand-off ` +
      `excluded). REPORTED SEPARATELY, and this is the number the retirement is about: deviation ` +
      `from the instantaneous path TANGENT is max=${fx(maxDev)} deg at e3=${fx(maxAt)}, ` +
      `mean=${fx(meanDev)} deg, p95=${fx(p95)} over ${devs.length} samples — that residual is the ` +
      `chord geometry itself, which is why it is not gated on a threshold.`);
  }

  // ── A-2: red control / NO-OP against the other arm ───────────────────────────────────────────
  if (!BASE) {
    I('A-2 red control vs the depth-ON arm', 'no BASE= series given — the change was not compared ' +
      'against anything and could be a NO-OP for all this run can tell');
  } else if (!fs.existsSync(BASE)) {
    I('A-2 red control vs the depth-ON arm', `BASE=${BASE} does not exist`);
  } else {
    const other = JSON.parse(fs.readFileSync(BASE, 'utf8'));
    if (other.arm === res.arm) {
      I('A-2 red control vs the depth-ON arm',
        `both series are the SAME arm (${res.arm}) — a self-comparison proves nothing`);
    } else if (other.building !== res.building) {
      I('A-2 red control vs the depth-ON arm',
        `arms are different buildings (${other.building} vs ${res.building})`);
    } else {
      const mine = { tangent: { max: maxDev, mean: meanDev }, chord: { max: chordMax, mean: chordMean } };
      const on = other.arm === 'depth-ON' ? other : mine;
      const off = other.arm === 'depth-ON' ? mine : other;
      const noop = Math.abs(on.chord.max - off.chord.max) < 1e-6 &&
                   Math.abs(on.chord.mean - off.chord.mean) < 1e-6 &&
                   Math.abs(on.tangent.max - off.tangent.max) < 1e-6;
      if (noop) {
        P('A-2 NO-OP — the two arms produce an IDENTICAL gaze series', false,
          `depth-ON chord max=${fx(on.chord.max)} mean=${fx(on.chord.mean)} vs depth-OFF ` +
          `max=${fx(off.chord.max)} mean=${fx(off.chord.mean)}. The retirement changed nothing ` +
          `measurable; this is NOT a pass.`);
      } else {
        // ⚠ THE GATE IS THE CHORD, NOT THE TANGENT, AND THE REASON IS A MEASURED ONE.
        // "Follows path direction" means the gaze IS the walk's own look-ahead — that is what
        // path-follow is, and the chord metric measures exactly it. Deviation from the
        // INSTANTANEOUS tangent is a different quantity and is NOT expected to fall everywhere:
        // where the walk doubles back inside the 15% look-ahead window, the chord legitimately
        // points across the turn, and those pockets are precisely where §CPE_AIM_DEPTH used to fire
        // (short forward clearance) and override the gaze. Retiring it can therefore RAISE the max
        // tangent deviation while making the gaze strictly more path-following — measured on
        // HHS_Office 2026-09-02. Gating on the tangent max would have scored that as a regression.
        // Both numbers are printed; only the one that carries the claim is gated.
        P('A-2 red control — retiring depth measurably puts the gaze BACK ON the path',
          off.chord.max < on.chord.max && off.chord.mean < on.chord.mean,
          `gaze vs the look-ahead chord (THE CLAIM), depth-ON -> depth-OFF: max ${fx(on.chord.max)} ` +
          `-> ${fx(off.chord.max)} deg, mean ${fx(on.chord.mean)} -> ${fx(off.chord.mean)} deg. ` +
          `Deviation from the instantaneous path TANGENT, same arms (INFO, not gated): max ` +
          `${fx(on.tangent.max)} -> ${fx(off.tangent.max)} deg, mean ${fx(on.tangent.mean)} -> ` +
          `${fx(off.tangent.mean)} deg. Where the tangent max RISES it is the look-ahead chord ` +
          `crossing a doubling-back stretch — exactly the short-forward-clearance pockets depth ` +
          `used to override; that is the retirement working, not a regression.`);
      }
      // A-5 lives here too: it needs both arms' film series.
      if (!other.film || !res.film || !other.beats || !res.beats) {
        I('A-5 dive-in and closing orbit undisturbed', 'one arm carries no film series or no beat table');
      } else {
        const bt = res.beats;
        const cmp = (lo, hi) => {
          let n = 0, worstPos = 0, worstGaze = 0;
          for (let i = 0; i < res.film.length && i < other.film.length; i++) {
            const a = res.film[i], c = other.film[i];
            if (!a || !c || a.t < lo || a.t > hi) continue;
            n++;
            worstPos = Math.max(worstPos, Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z));
            const ga = { x: a.tx - a.x, y: a.ty - a.y, z: a.tz - a.z };
            const gc = { x: c.tx - c.x, y: c.ty - c.y, z: c.tz - c.z };
            const la = Math.hypot(ga.x, ga.y, ga.z), lc = Math.hypot(gc.x, gc.y, gc.z);
            if (la > 0 && lc > 0) worstGaze = Math.max(worstGaze, ang(
              { x: ga.x / la, y: ga.y / la, z: ga.z / la }, { x: gc.x / lc, y: gc.y / lc, z: gc.z / lc }));
          }
          return { n, worstPos, worstGaze };
        };
        const dive = cmp(0, bt.dive);
        const orbit = cmp(bt.rise, 1);
        const walk = cmp(bt.spin, bt.out);
        if (!dive.n || !orbit.n) {
          I('A-5 dive-in and closing orbit undisturbed',
            `beat windows judged nothing (dive n=${dive.n}, orbit n=${orbit.n})`);
        } else {
          P('A-5 dive-in and the closing orbit are UNDISTURBED (walk is the only beat that moved)',
            dive.worstPos < 1e-6 && dive.worstGaze < 1e-4 && orbit.worstPos < 1e-6 && orbit.worstGaze < 1e-4,
            `dive [0,${fx(bt.dive)}] n=${dive.n}: max pos delta ${dive.worstPos.toExponential(2)}m, ` +
            `max gaze delta ${dive.worstGaze.toExponential(2)}deg. ` +
            `orbit [${fx(bt.rise)},1] n=${orbit.n}: ${orbit.worstPos.toExponential(2)}m / ` +
            `${orbit.worstGaze.toExponential(2)}deg. ` +
            `WALK [${fx(bt.spin)},${fx(bt.out)}] n=${walk.n}: ${walk.worstPos.toFixed(3)}m / ` +
            `${walk.worstGaze.toFixed(3)}deg — the walk SHOULD differ, and a ~0 there would be the ` +
            `NO-OP A-2 tests for. _cinemaPathPlan's beat framing was not edited.`);
        }
      }
    }
  }

  // ── A-3: §CPE_AIM_PIN survives ───────────────────────────────────────────────────────────────
  if (!res.pin || !res.pin.zone) {
    I('A-3 §CPE_AIM_PIN survives', res.pin ? 'the pinned band has no Voronoi zone'
      : `path has ${res.nBands} band(s) — too few to pin one and leave neighbours to compare`);
  } else {
    const inZ = res.pin.rows.filter(r => r.judge && r.aimErr != null);
    const outZ = res.pin.rows.filter(r => !r.inZone && r.vsBase != null);
    if (!inZ.length || !outZ.length) {
      I('A-3 §CPE_AIM_PIN survives',
        `nothing to judge (in-zone samples=${inZ.length}, out-of-zone samples=${outZ.length})`);
    } else {
      const worstAim = Math.max(...inZ.map(r => r.aimErr));
      const worstBleed = Math.max(...outZ.map(r => r.vsBase));
      P('A-3 §CPE_AIM_PIN survives — the pinned zone aims at the pin, and does not bleed',
        worstAim <= 2 && worstBleed < 1e-4,
        `zone e3 [${fx(res.pin.zone.lo)},${fx(res.pin.zone.hi)}] on band ${res.pin.band}: ` +
        `worst aim error to the pinned target ${fx(worstAim)} deg over ${inZ.length} in-zone samples ` +
        `(<= 2 deg). Outside the zone, worst change against the unpinned run ` +
        `${worstBleed.toExponential(2)} deg over ${outZ.length} samples (must be ~0 — the Voronoi ` +
        `partition guarantees no bleed by construction, and with depth retired the unpinned stretch ` +
        `is plain path-follow).`);
    }
  }

  // ── A-4: the authored correction window survives ─────────────────────────────────────────────
  if (!res.corr) {
    I('A-4 the authored correction window survives', 'no corrected plan could be built');
  } else {
    const d = res.corr.diff;
    const moved = d.map((v, i) => ({ v, i })).filter(o => o.v != null && o.v > 0.05);
    if (!moved.length) {
      P('A-4 NO-OP — the authored correction changed NOTHING', false,
        'not one sample moved by more than 0.05 deg. The correction window is not reaching the ' +
        'gaze at all; this is NOT a pass.');
    } else {
      const first = moved[0].i, last = moved[moved.length - 1].i;
      const reach = (last - first) / (d.length - 1);
      const authored = res.corr.authoredF;
      const outside = d.filter((v, i) => v != null && (i < first || i > last));
      const outMax = outside.length ? Math.max(...outside) : 0;
      const peak = Math.max(...moved.map(o => o.v));
      // stepCorr[k] is the step between sample k and k+1, so window index `first..last` maps to
      // step indices `first..last-1`.
      const winStep = (arr) => arr ? arr.filter((v, i) => v != null && i >= first && i < last) : [];
      const worstIn = Math.max(...winStep(res.corr.stepCorr), 0);
      const worstOff = res.corr.stepOff ? Math.max(...winStep(res.corr.stepOff), 0) : null;
      P('A-4 the authored correction window SURVIVES and is BOUNDED',
        reach <= authored * 1.35 && outMax <= 0.05,
        `window reach ${(100 * reach).toFixed(1)}% of the walk against the authored ` +
        `${(100 * authored).toFixed(1)}% (ramp 4 / hold 12 / decay 18). Peak authored deviation ` +
        `${fx(peak)} deg — the stroke really steers the gaze. Outside the window nothing moves: ` +
        `max ${fx(outMax, 4)} deg over ${outside.length} samples. Strokes resolved: ` +
        `${res.corr.rec ? res.corr.rec.length : 'n/a'}.`);
      // #1597 is asserted as an A/B against the product's OWN pre-fix branch, not against a
      // threshold: a 2*pi flip moves the blended yaw by 2*pi*w in a single sample, so with the fix
      // ON the worst in-window step must not exceed the naive branch's. If the naive branch shows
      // no wrap on this plan the defect was never exercised and the run says so — VACUOUS, not PASS.
      if (worstOff == null) {
        I('A-4b §CPE_CORR_BRANCH (#1597) still holds under path-follow',
          'the branch-OFF A/B arm could not be built — nothing was judged');
      } else if (worstOff <= worstIn + 0.01) {
        console.log(`§CPE_AIM_RETIRE_BRANCH  VACUOUS — the naive short-way branch shows no wrap on ` +
          `this plan (OFF ${fx(worstOff)} <= ON ${fx(worstIn)} deg/sample), so the near-antipodal ` +
          `case #1597 fixes was NOT exercised here. The gate below judges non-regression only.`);
        P('A-4b §CPE_CORR_BRANCH (#1597) non-regression — the fix never costs more than the naive branch',
          worstIn <= worstOff + 0.01,
          `worst in-window step ON ${fx(worstIn)} vs OFF ${fx(worstOff)} deg/sample over ` +
          `${last - first} in-window steps. Wrap NOT exercised on this plan (scope-blind, stated).`);
      } else {
        P('A-4b §CPE_CORR_BRANCH (#1597) still holds under path-follow — the 2*pi snap does not return',
          worstIn < worstOff,
          `worst in-window step: fix ON ${fx(worstIn)} deg/sample vs the pre-fix naive short-way ` +
          `branch OFF ${fx(worstOff)} deg/sample (${fx(worstOff - worstIn)} deg removed) over ` +
          `${last - first} in-window steps. The wrap IS exercised on this plan.`);
      }
    }
  }

  // ── A-6: the retired rule leaves no trace ────────────────────────────────────────────────────
  // §CPE_BEAT3_END_DIR is NOT in this list on purpose: it is the Beat3->Beat4 hand-off, renamed out
  // of §CPE_AIM_LATCH in the same commit precisely so this absence test can be unambiguous.
  const aimLines = logs.filter(l => /^§CPE_AIM_DEPTH|^§CPE_AIM_GRID|^§CPE_AIM_LATCH|^§CPE_AIM_SERIES|^§CPE_AIM_DENSITY /.test(l))
    // §CPE_AIM_DEPTH_FREEZE is DELIBERATELY KEPT (#1598) — it is a correction-window guard, not an
    // aim rule, so it is not evidence of a partial retirement and must not be counted as such.
    .filter(l => !l.startsWith('§CPE_AIM_DEPTH_FREEZE'));
  if (!logs.length) {
    I('A-6 the retired rule leaves no trace', 'zero console lines captured — an absence measured ' +
      'over an empty log is vacuous');
  } else if (res.arm === 'depth-ON') {
    P('A-6 (baseline arm) the rule IS present — this arm is the red control, not the claim',
      aimLines.length > 0,
      `${aimLines.length} aim §-lines over ${logs.length} console lines: ` +
      `${aimLines.slice(0, 2).map(l => l.slice(0, 100)).join(' | ')}`);
  } else {
    P('A-6 §CPE_AIM_DEPTH_RETIRED: no aim §-line, no probe hook, anywhere in the run',
      aimLines.length === 0,
      `${aimLines.length} aim §-lines over ${logs.length} console lines scanned` +
      (aimLines.length ? ` → ${aimLines.slice(0, 3).map(l => l.slice(0, 100)).join(' | ')}` : ' (none)') +
      `. §CPE_AIM_DEPTH_FREEZE lines are excluded by design — that mechanism is kept.`);
  }

  if (errs.length) console.log(`§CPE_AIM_RETIRE_PAGEERRORS n=${errs.length} → ${errs.slice(0, 3).join(' | ')}`);

  console.log('');
  checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}\n        ${c.detail}`));
  INC.forEach(c => console.log(`  INCONCLUSIVE ${c.label}\n        ${c.why}`));
  const pass = checks.filter(c => c.ok).length, fail = checks.length - pass;
  console.log(`\n§WITNESS_CPE_AIM_RETIRE arm=${res.arm} building=${res.building} ` +
    `pass=${pass} fail=${fail} inconclusive=${INC.length} ran=${checks.length}`);
  if (!checks.length) console.log('§WITNESS_CPE_AIM_RETIRE INCONCLUSIVE — no gate was judged.');
  process.exitCode = (fail > 0 || checks.length === 0) ? 1 : 0;
})();
