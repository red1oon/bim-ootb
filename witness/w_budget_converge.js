// W-BUDGET-CONVERGE — CPE_4D_PERF_MEM_STUDY.md §R15. Issue it proves or disproves:
//   does the §20 mesh-budget controller CONVERGE while the camera is MOVING (a fly tour), or does
//   it swing full-scale 0 -> MAX_BOOST -> 0 and pay for the swing in flips and frame time?
//
// The existing W-BUDGET-STABLE (§20.4) answers this for a FROZEN camera only — it sets one aerial
// pose and never moves it. That is precisely the gap the user's report fell through.
//
// METHOD — one page load, one GPU, one camera trajectory, TWO arms, so the before/after is a same-session
// A/B and not a cross-run comparison:
//   arm FIXED  = §R15 rules on  (budgetFreshGate + budgetAntiWindup, the shipped default)
//   arm LEGACY = both levers off ⇒ the pre-§R15 integrator byte-for-byte. This arm is also the RED
//                CONTROL: if it does NOT reproduce the sawtooth, the witness reports INCONCLUSIVE
//                rather than crediting the fix for a defect it never observed.
// FIXED runs FIRST, on the colder page, so every warm-cache advantage accrues to LEGACY. A win for
// FIXED under that ordering is a conservative result.
//
// Run:  WITNESS_URL=http://localhost:8421/viewer/viewer.html?db=/buildings/LTU_AHouse_extracted.db \
//       node witness/w_budget_converge.js
const fs = require('fs');
const H = require('./harness_budget');
const LOG = [];
const T0 = Date.now();
const STAMPED = [];
const sink = t => { LOG.push(t); STAMPED.push({ t: Date.now() - T0, s: t }); };
const OUT = __dirname + '/w_budget_converge';
const ARM_MS = +(process.env.R15_ARM_MS || 90000);
const SWEEP_MS = +(process.env.R15_SWEEP_MS || 30000);   // one full outside->inside->outside cycle

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = (a, q) => { if (!a.length) return null; const v = a.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(v.length * q))]; };

// Pull `key=NUM` out of every console line carrying `tag`, restricted to a [from,to] ms window.
function tagVals(tag, key, from, to) {
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([0-9.]+)');
  return STAMPED.filter(e => e.t >= from && e.t <= to && e.s.indexOf(tag) >= 0)
    .map(e => { const m = re.exec(e.s); return m ? +m[1] : null; }).filter(v => v !== null);
}

// The DRIVER. The reported trigger is the fly tour, but a tour route is not reproducible between
// arms (it depends on compiled rooms — LTU_AHouse has none: §ROOM_OCCL_INDEX_ERR / §HELPERS_QUERY_ERR
// no such table: storey_walkable_raster, and A.flyTargets stayed empty for 240 s in the §R15 probe).
// What the controller actually SEES from a tour is a camera that repeatedly moves from outside the
// building to inside it and back — that is the input that charges and discharges the integrator.
// This drives exactly that, parameterised by WALL TIME (not frame index) so both arms fly the
// identical trajectory even though their frame rates differ, and derived entirely from the DB
// envelope so it carries no per-building constant.
async function startSweep(page, periodMs) {
  await page.evaluate((P) => {
    const A = window.APP || window.A;
    const env = A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MAX(center_z) FROM element_transforms")[0];
    const cx = (env[0] + env[1]) / 2, cy = (env[2] + env[3]) / 2, zt = env[4];
    const rad = Math.max(env[1] - env[0], env[3] - env[2]);
    const ctr = A.ifc2three(cx, cy, zt / 2);
    window.__r15sweep = { on: true, t0: performance.now() };
    (function step() {
      if (!window.__r15sweep.on) return;
      const u = ((performance.now() - window.__r15sweep.t0) % P) / P;      // 0..1, repeating
      const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);                      // 0..1..0, smooth
      const r = rad * (0.06 + 1.24 * s);        // deep inside  ->  well outside the envelope
      const th = 2 * Math.PI * u;
      const p = A.ifc2three(cx + r * Math.cos(th), cy + r * Math.sin(th), zt * (0.35 + 0.85 * s));
      A.camera.position.set(p.x, p.y, p.z);
      A.camera.lookAt(ctr.x, ctr.y, ctr.z);
      A.camera.updateMatrixWorld(true);
      if (A.controls && A.controls.target) A.controls.target.set(ctr.x, ctr.y, ctr.z);
      if (A.markDirty) A.markDirty();
      requestAnimationFrame(step);
    })();
  }, periodMs);
}

async function runArm(page, name, levers) {
  await page.evaluate(l => {
    const S = window.__dlodNav;
    S.budgetFreshGate = l.fresh; S.budgetAntiWindup = l.wind;
    S.budgetTicks = 0; S.budgetStaleTicks = 0; S.budgetWindupTicks = 0;
    window.__r15moved = false;
    window.__r15 = { samples: [], on: true, t0: performance.now() };
    const A = window.APP || window.A;
    let last = performance.now();
    (function step() {
      if (!window.__r15.on) return;
      const now = performance.now(), St = window.__dlodNav;
      const ri = A.renderer ? A.renderer.info : null;
      const cp = A.camera.position;
      const prev = window.__r15.samples.length ? window.__r15.samples[window.__r15.samples.length - 1] : null;
      if (prev && Math.abs(prev.cx - cp.x) + Math.abs(prev.cz - cp.z) > 1) window.__r15moved = true;
      window.__r15.samples.push({ t: +(now - window.__r15.t0).toFixed(0), dt: +(now - last).toFixed(2),
        boost: St.budgetBoost, elig: St.activeElig, active: St.active, boxed: St.boxed,
        calls: ri ? ri.render.calls : -1, tris: ri ? ri.render.triangles : -1,
        cx: +cp.x.toFixed(1), cz: +cp.z.toFixed(1), fly: 1 });
      last = now; requestAnimationFrame(step);
    })();
  }, levers);
  const wallFrom = Date.now() - T0;
  await startSweep(page, SWEEP_MS);
  await new Promise(r => setTimeout(r, ARM_MS));
  const wallTo = Date.now() - T0;
  // Did the camera actually travel? A driver that silently did nothing must report VACUOUS, not PASS.
  const moved = await page.evaluate(() => {
    window.__r15sweep.on = false;
    return !!window.__r15moved;
  });
  const res = await page.evaluate(() => {
    window.__r15.on = false;
    const S = window.__dlodNav;
    return { samples: window.__r15.samples, bTicks: S.budgetTicks, bStale: S.budgetStaleTicks, bWind: S.budgetWindupTicks };
  });
  await new Promise(r => setTimeout(r, 4000)); // let fades/passes unwind before the next arm

  const S = res.samples;
  const flying = S.filter(s => s.fly === 1);
  const boosts = S.map(s => s.boost);
  let reversals = 0, dir = 0;
  for (let i = 1; i < S.length; i++) {
    const d = Math.sign(S[i].boost - S[i - 1].boost);
    if (d !== 0) { if (dir !== 0 && d !== dir) reversals++; dir = d; }
  }
  const m = {
    arm: name, moved, samples: S.length, flyingSamples: flying.length,
    boostMin: Math.min(...boosts), boostMax: Math.max(...boosts),
    boostSpan: Math.max(...boosts) - Math.min(...boosts), reversals,
    budgetTicks: res.bTicks, staleTicks: res.bStale, windupTicks: res.bWind,
    dtMean: +mean(S.map(s => s.dt)).toFixed(2), dtP95: +pct(S.map(s => s.dt), 0.95).toFixed(2),
    callsMean: +mean(S.map(s => s.calls)).toFixed(0), trisMean: +mean(S.map(s => s.tris)).toFixed(0),
    flipsMean: (v => v.length ? +mean(v).toFixed(1) : null)(tagVals('§DLOD_TICK', 'flips_mean', wallFrom, wallTo)),
    tickMsMean: (v => v.length ? +mean(v).toFixed(2) : null)(tagVals('§DLOD_TICK', 'ms_mean', wallFrom, wallTo)),
    fpsModeMean: (v => v.length ? +mean(v).toFixed(1) : null)(tagVals('§FPS_MODE', 'mean', wallFrom, wallTo)),
    fpsModeN: tagVals('§FPS_MODE', 'mean', wallFrom, wallTo).length,
    boostLines: tagVals('§DLOD_NAV_BUDGET', 'boost', wallFrom, wallTo).length
  };
  sink('§R15_ARM ' + JSON.stringify(m));
  return { m, samples: S };
}

(async () => {
  const { browser, page } = await H.launch(sink);
  let fixed = null, legacy = null;
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    sink('§R15_ENGAGED');
    fixed = await runArm(page, 'FIXED', { fresh: true, wind: true });
    legacy = await runArm(page, 'LEGACY', { fresh: false, wind: false });
    await page.evaluate(() => { window.__dlodNav.budgetFreshGate = true; window.__dlodNav.budgetAntiWindup = true; });

    const F = fixed.m, L = legacy.m;
    fs.writeFileSync(OUT + '.json', JSON.stringify({ fixed: F, legacy: L,
      fixedSamples: fixed.samples, legacySamples: legacy.samples }));

    // ── VACUOUS / INCONCLUSIVE first: a verdict line must never print PASS over nothing judged ──
    const vacuous = [];
    if (!F.moved || !L.moved) vacuous.push('the camera sweep never moved the camera');
    if (F.flyingSamples === 0 || L.flyingSamples === 0) vacuous.push('no frame was sampled');
    if (L.budgetTicks === 0) vacuous.push('the controller never ticked in the LEGACY arm');
    // RED CONTROL: LEGACY must actually reproduce the reported defect, or nothing here is judgeable.
    const redOk = L.reversals > 0 && L.boostSpan > 0;
    if (!redOk) vacuous.push('RED CONTROL did not reproduce: LEGACY boost never swung (span=' + L.boostSpan + ' reversals=' + L.reversals + ')');

    const dPct = (f, l) => (l === null || f === null || l === 0) ? null : +(100 * (f - l) / l).toFixed(1);

    // ── PHASE-ALIGNED comparison. Arm-level means are FRAME-WEIGHTED, and a slower arm contributes
    // FEWER samples to exactly the phases where it is slow — so an arm mean systematically
    // UNDER-reports a regression and under-credits a fix. Both arms fly the same wall-time
    // trajectory with period SWEEP_MS, so binning each arm by (t % SWEEP_MS) compares like camera
    // pose against like camera pose and removes that bias entirely. This, not the arm mean, is the
    // frame-cost verdict.
    const NBIN = 10, BIN = SWEEP_MS / NBIN;
    const binOf = S => { const b = {}; for (const s of S) { const k = Math.floor((s.t % SWEEP_MS) / BIN); (b[k] = b[k] || []).push(s); } return b; };
    const bF = binOf(fixed.samples), bL = binOf(legacy.samples);
    const bmean = (a, k) => a.length ? +(a.reduce((x, y) => x + y[k], 0) / a.length).toFixed(1) : null;
    const phases = [];
    for (let k = 0; k < NBIN; k++) {
      const f = bF[k] || [], l = bL[k] || [];
      if (f.length < 20 || l.length < 20) continue;
      phases.push({ k, nF: f.length, nL: l.length,
        boostF: bmean(f, 'boost'), boostL: bmean(l, 'boost'),
        activeF: bmean(f, 'active'), activeL: bmean(l, 'active'),
        callsF: bmean(f, 'calls'), callsL: bmean(l, 'calls'),
        dtF: bmean(f, 'dt'), dtL: bmean(l, 'dt'), dtPct: dPct(bmean(f, 'dt'), bmean(l, 'dt')) });
    }
    for (const ph of phases) sink('§R15_PHASE bin=' + ph.k + ' t=' + (ph.k * BIN / 1000) + '-' + ((ph.k + 1) * BIN / 1000) + 's' +
      ' boost F/L=' + ph.boostF + '/' + ph.boostL + ' active F/L=' + ph.activeF + '/' + ph.activeL +
      ' calls F/L=' + ph.callsF + '/' + ph.callsL + ' dt_ms F/L=' + ph.dtF + '/' + ph.dtL + ' (' + ph.dtPct + '%)');

    // The LOADED phases are the ones the fix is about: a phase where BOTH arms see nothing in range
    // (active ~ 0) cannot distinguish the two controllers and must not be allowed to dilute or to
    // decide the verdict. "Loaded" is defined off the measurement, not off a chosen number: any
    // phase whose larger arm-active exceeds the median of that quantity across phases.
    const acts = phases.map(p => Math.max(p.activeF, p.activeL)).sort((a, b) => a - b);
    const actMid = acts.length ? acts[Math.floor(acts.length / 2)] : 0;
    const loaded = phases.filter(p => Math.max(p.activeF, p.activeL) > actMid);
    const loadedWins = loaded.filter(p => p.dtPct !== null && p.dtPct < 0).length;
    const loadedWorse10 = loaded.filter(p => p.dtPct !== null && p.dtPct > 10).length;
    const bestGain = loaded.length ? Math.min(...loaded.map(p => p.dtPct === null ? 0 : p.dtPct)) : null;
    sink('§R15_LOADED phases=' + loaded.length + ' activeMedian=' + actMid + ' fasterInFixed=' + loadedWins +
      ' worseBy>10pct=' + loadedWorse10 + ' bestPhaseGain=' + bestGain + '%');

    const g1 = F.boostSpan < L.boostSpan || F.boostLines < L.boostLines;         // actuator stops swinging
    const g2 = F.windupTicks < L.windupTicks;                                    // windup removed
    const g3 = loaded.length > 0 && loadedWins > loaded.length / 2 && loadedWorse10 === 0; // frame cost
    // NAMED TRADE, deliberately NOT a gate — see §R15.4. dlod.js's per-instance flip count is
    // EXPECTED to rise (boxing more elements gives its culler more to flip); what matters is that
    // its tick stays cheap, which is the second half of this line.
    const flipsPct = dPct(F.flipsMean, L.flipsMean), tickPct = dPct(F.tickMsMean, L.tickMsMean);
    sink('§R15_TRADE flips_mean ' + L.flipsMean + '->' + F.flipsMean + ' (' + flipsPct + '%)' +
      ' | DLOD_TICK ms_mean ' + L.tickMsMean + '->' + F.tickMsMean + ' (' + tickPct + '%)' +
      ' | boostChanges ' + L.boostLines + '->' + F.boostLines);
    const g2noop = g1 === false && (bestGain === null || bestGain > -5);

    sink('§R15_DELTA boostSpan ' + L.boostSpan + '->' + F.boostSpan +
      ' | reversals ' + L.reversals + '->' + F.reversals +
      ' | windupTicks ' + L.windupTicks + '->' + F.windupTicks +
      ' | staleTicks(NOT comparable: LEGACY acted on them, FIXED skipped them) L=' + L.staleTicks + ' F=' + F.staleTicks +
      ' | flips_mean ' + L.flipsMean + '->' + F.flipsMean + ' (' + g2span + '%)' +
      ' | dt_mean ' + L.dtMean + '->' + F.dtMean + ' (' + dPct(F.dtMean, L.dtMean) + '%)' +
      ' | dt_p95 ' + L.dtP95 + '->' + F.dtP95 +
      ' | FPS_MODE_mean ' + L.fpsModeMean + '->' + F.fpsModeMean +
      ' | calls ' + L.callsMean + '->' + F.callsMean + ' | tris ' + L.trisMean + '->' + F.trisMean);

    if (!phases.length) vacuous.push('no sweep phase had enough samples in BOTH arms to compare');
    if (!loaded.length) vacuous.push('VACUOUS — no phase put any element in range, so neither controller was exercised');

    let verdict;
    if (vacuous.length) verdict = 'INCONCLUSIVE — ' + vacuous.join('; ');
    else if (g2noop) verdict = 'NO-OP — the actuator excursion did not shrink and no loaded phase gained 5%';
    else verdict = (g1 && g2 && g3) ? 'PASS' : 'FAIL';
    sink('§R15_CONVERGE g1_actuator_stops_swinging=' + g1 + ' g2_windup_gone=' + g2 +
      ' g3_loaded_phases_faster=' + g3 + ' noop=' + g2noop + ' redControlReproduced=' + redOk +
      ' verdict=' + verdict);
  } finally {
    fs.writeFileSync(OUT + '.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(OUT + '.log', LOG.join('\n')); process.exit(1); });
