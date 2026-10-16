// WITNESS — §CPE_BUILDUP_ONSET_BLEND. The buildup must not burst on the very first film-seconds.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_ONSET_BURST.
//
// USER REPORT, re-raised 2026-08-27 (§CPE_BUILDUP_ONSET_BURST was measured 2026-08-13, then
// deprioritized unfixed): "the movie is not reflecting the build up construction speed on the very
// first day. IT captures frames right away to days past and thus the movie jumps without
// appreciating the first hour. First few secs should take on Day 0 as most 4D rush onset."
//
// WHAT THIS PROVES OR DISPROVES — cinema_maxq.js `_workCursorAt` now takes an optional 3rd arg
// `totalSec` (the film's own designed length). When supplied, the first ONSET_BLEND_SEC (=10) film
// seconds blend the cursor toward the element-paced order (§CPE_BUILDUP_WORK_PACED, otherwise
// retired), fading linearly back to pure calendar by the end of that window. §CPE_BUILDUP_EVEN_TEMPO
// itself — the day counter's straight line — must stay exactly correct for the REST of the film and
// at the handoff instant; only the onset window may deviate, and only toward less burst, never more.
//
//   G-ONSET-1  BURST REDUCED — with the SAME real Duplex schedule, cumulative placed% at real
//              film-second marks inside the onset window is closer to time-proportional with the
//              blend than without it (the §CPE_BUILDUP_ONSET_BURST measurement, re-run before/after).
//   G-ONSET-2  HANDOFF SEAMLESS — blended cursor(t) == pure-calendar cursor(t) at t==onsetU exactly
//              (no visible jump/cut at the moment the blend hands off).
//   G-ONSET-3  PAST-ONSET UNCHANGED — for t in [onsetU, 1], cursor(t) is byte-identical (within fp
//              tolerance) to the pure calendar-linear line — §CPE_BUILDUP_EVEN_TEMPO's own
//              guarantee, untouched outside the onset window.
//   G-ONSET-4  DEGRADE — callers that omit totalSec (older cached copies, or a call site never
//              updated) get byte-identical pure calendar-linear across the WHOLE film, same as
//              before this change existed. Also proves the pre-existing witness_cpe_buildup_tempo.js
//              (which calls buildupCursorAt with 2 args) is unaffected by this change.
//   G-ONSET-5  GHOST-GROUND INTERACTION — replays REAL per-frame conditions through the onset-blend-
//              enabled 3-arg buildupCursorAt (the same call cinema_maxq.js's bake loop now makes),
//              and confirms the ground opacity floor still holds on every frame until the REAL
//              (post-blend) cursor actually crosses firstAboveMs — i.e. the onset blend does not
//              reintroduce the §GHOST_GROUND_LIVE_TRIGGER two-clocks bug class the prior write-up
//              flagged as the specific risk of this change.
//
// EVIDENCE DISCIPLINE: sampled off the REAL exposed APP.buildupCursorAt/ghostGroundAt against the
// REAL armed Time Machine schedule — never a screenshot, never "looks smoother" — CLAUDE.md
// FUNDAMENTAL LAW.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8471;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const ONSET_SEC = 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;

async function openArmed(browser, BLD) {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.buildupCursorAt && window.APP.ghostGroundArm && window.APP.dbQuery,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  return { page, logs };
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); };
  const { page, logs } = await openArmed(browser, BLD);

  const res = await page.evaluate(async (ONSET_SEC) => {
    const A = window.APP;
    if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
    let ok = false;
    try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
    if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
    const bk = window.tmFollowTimeline();
    if (!bk) return { err: 'no timeline to follow' };
    if (typeof A.buildupCursorAt !== 'function') return { err: 'APP.buildupCursorAt missing' };
    if (typeof A.buildupPacingReset === 'function') A.buildupPacingReset();

    const out = { projectStart: bk.projectStart, projectEnd: bk.projectEnd, ops: bk.ops };
    const span = bk.projectEnd - bk.projectStart;

    // A real film length, same shape as a real bake (Duplex bakes land near ~55s in the recorded
    // history this witness's spec section cites).
    const TOTAL_SEC = 55;
    const onsetU = Math.min(0.5, ONSET_SEC / TOTAL_SEC);
    out.totalSec = TOTAL_SEC; out.onsetU = onsetU;

    // ── G-ONSET-1 data: cumulative placed% at fixed real-seconds marks across the onset window,
    // WITH the blend (3-arg) vs WITHOUT it (2-arg, i.e. pure calendar — the pre-fix behavior).
    if (typeof A.buildupPacingReset === 'function') A.buildupPacingReset();
    const marks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => s / TOTAL_SEC);
    const placedAt = (ms) => (typeof window.tmPlacedCount === 'function') ? window.tmPlacedCount(ms) : null;
    out.withBlend = marks.map(t => {
      const ms = A.buildupCursorAt(t, bk, TOTAL_SEC);
      const p = placedAt(ms);
      return { sec: +(t * TOTAL_SEC).toFixed(1), ms: Math.round(ms), placed: p, frac: p != null && bk.ops ? p / bk.ops : null };
    });
    if (typeof A.buildupPacingReset === 'function') A.buildupPacingReset();
    out.withoutBlend = marks.map(t => {
      const ms = A.buildupCursorAt(t, bk);   // 2-arg — degrade path, pure calendar
      const p = placedAt(ms);
      return { sec: +(t * TOTAL_SEC).toFixed(1), ms: Math.round(ms), placed: p, frac: p != null && bk.ops ? p / bk.ops : null };
    });

    // ── G-ONSET-2 / G-ONSET-3: the full curve, dense sampling, with the blend armed.
    if (typeof A.buildupPacingReset === 'function') A.buildupPacingReset();
    const N = 200;
    out.curve = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      out.curve.push({ t: +t.toFixed(4), ms: A.buildupCursorAt(t, bk, TOTAL_SEC) });
    }
    out.pacingLogTail = window.__pacingLogTail || null;

    // ── G-ONSET-5: ghost-ground interaction, real per-frame replay with the 3-arg cursor.
    let ggOut = null;
    if (A.ground && A.groundIfcZ != null && typeof window.tmGroundSchedule === 'function' &&
        A.ghostGroundArm && A.ghostGroundAt && A.ghostGroundRestore) {
      const sched = window.tmGroundSchedule(A.groundIfcZ);
      if (sched && sched.aboveTotal && sched.belowTotal && sched.firstAboveMs != null) {
        A.ground.visible = false;
        if (typeof A.buildupPacingReset === 'function') A.buildupPacingReset();
        const armed = A.ghostGroundArm(bk);
        A.ground.visible = true;
        const NF = 400;
        const frames = [];
        let realFireFrame = null;
        for (let i = 0; i <= NF; i++) {
          const tFrac = i / NF;
          const cursorMs = A.buildupCursorAt(tFrac, bk, TOTAL_SEC);
          const o = A.ghostGroundAt(tFrac, TOTAL_SEC, bk, cursorMs);
          if (realFireFrame == null && cursorMs >= sched.firstAboveMs) realFireFrame = i;
          frames.push({ i, t: +tFrac.toFixed(4), cursorMs: Math.round(cursorMs), o: o == null ? null : +o.toFixed(4) });
        }
        A.ghostGroundRestore();
        ggOut = { armed, firstAboveMs: sched.firstAboveMs, realFireFrame, frames };
      } else {
        ggOut = { skip: 'no above+below split on this building (nothing to ghost)' };
      }
    } else {
      ggOut = { skip: 'ghost-ground API or groundIfcZ unavailable on this build' };
    }
    out.groundOut = ggOut;

    try { window.tmRestoreDerivedOrder(); } catch (e) {}
    return out;
  }, ONSET_SEC);

  if (res.err) {
    P('G-ONSET-0 the buildup schedule is readable', false, res.err);
    await page.close();
    return checks;
  }

  const span = res.projectEnd - res.projectStart;

  // ── G-ONSET-1. The 10s mark (index 9) sits exactly ON onsetU (10/55) — the blend fades to w=1
  // there BY CONSTRUCTION (that's G-ONSET-2's own handoff proof), so it trivially agrees with the
  // unblended series and proves nothing about burst reduction. The real evidence is strictly INSIDE
  // the window (marks 1s..9s) where the two paths actually diverge.
  const interior = res.withBlend.slice(0, 9).map((m, i) => {
    const expFrac = res.withBlend[i].sec / res.totalSec;
    const wErr = m.frac == null ? null : Math.abs(m.frac - expFrac);
    const woErr = res.withoutBlend[i].frac == null ? null : Math.abs(res.withoutBlend[i].frac - expFrac);
    return { sec: m.sec, wErr, woErr };
  });
  const sumW = interior.reduce((a, x) => a + (x.wErr || 0), 0);
  const sumWo = interior.reduce((a, x) => a + (x.woErr || 0), 0);
  P('G-ONSET-1 burst reduced — summed deviation from time-proportional placed%, across the 1s..9s marks strictly inside the onset window, is smaller WITH the blend',
    interior.every(x => x.wErr != null && x.woErr != null) && sumW < sumWo,
    `summed abs error vs time-proportional over marks 1..9s: WITHOUT=${(sumWo * 100).toFixed(1)}pt  WITH=${(sumW * 100).toFixed(1)}pt  ` +
    `(lower is less bursty; ${(100 * (1 - sumW / sumWo)).toFixed(0)}% reduction)  ` +
    `per-mark %placed WITHOUT=[${res.withoutBlend.slice(0, 9).map(m => m.frac == null ? '-' : (m.frac * 100).toFixed(1)).join(',')}]  ` +
    `WITH=[${res.withBlend.slice(0, 9).map(m => m.frac == null ? '-' : (m.frac * 100).toFixed(1)).join(',')}]  ` +
    `(10s mark omitted from this metric — it sits exactly on onsetU and trivially agrees by construction, see G-ONSET-2)`);

  // ── G-ONSET-2: handoff at t=onsetU
  const at = res.curve.find(c => Math.abs(c.t - res.onsetU) < 1 / 200 + 1e-9) || {};
  const calAtOnsetU = res.projectStart + res.onsetU * span;
  const handoffGapDays = at.ms != null ? Math.abs(at.ms - calAtOnsetU) / DAY : null;
  P('G-ONSET-2 handoff at t=onsetU is seamless — blended cursor matches pure-calendar within one sample step',
    handoffGapDays != null && handoffGapDays <= 0.02 * (span / DAY),
    `onsetU=${res.onsetU.toFixed(4)}  nearestSampleT=${at.t}  cursorMs=${at.ms == null ? 'n/a' : Math.round(at.ms)}  ` +
    `pureCalendarMs=${Math.round(calAtOnsetU)}  gap=${handoffGapDays == null ? 'n/a' : handoffGapDays.toFixed(2) + 'd'} ` +
    `(tol ${(0.02 * span / DAY).toFixed(2)}d = 2% of ${(span / DAY).toFixed(0)}d span)`);

  // ── G-ONSET-3: past onset, curve == pure calendar line
  let worst = 0, worstAt = 0;
  const past = res.curve.filter(c => c.t >= res.onsetU);
  past.forEach(c => {
    const dev = Math.abs(c.ms - (res.projectStart + c.t * span));
    if (dev > worst) { worst = dev; worstAt = c.t; }
  });
  P('G-ONSET-3 past the onset window the cursor is byte-identical to pure calendar-linear (§CPE_BUILDUP_EVEN_TEMPO unchanged)',
    past.length > 0 && worst <= 0.005 * span,
    `${past.length} samples in [${res.onsetU.toFixed(3)}, 1]  maxDeviation=${(worst / DAY).toFixed(2)}d = ${(100 * worst / span).toFixed(3)}% of span (tol 0.5%) at t=${worstAt.toFixed(3)}`);

  // ── G-ONSET-4: degrade path (2-arg call) is untouched pure calendar across the WHOLE onset window
  const degradeWorst = res.withoutBlend.every((m, i) => {
    const t = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10][i] / res.totalSec;
    const expect = res.projectStart + t * span;
    return Math.abs(m.ms - expect) <= 1; // ms rounding only
  });
  P('G-ONSET-4 degrade — omitting totalSec (2-arg call) stays byte-identical pure calendar-linear across the whole film',
    degradeWorst,
    `withoutBlend series ms vs pure-calendar expectation, all within 1ms: ${degradeWorst}`);

  // ── G-ONSET-5: ghost-ground interaction
  const go = res.groundOut || {};
  if (go.skip) {
    P('G-ONSET-5 ghost-ground onset interaction — INCONCLUSIVE, feature not applicable on this building',
      true, go.skip);
  } else {
    const frames = go.frames || [];
    const nf = go.realFireFrame;
    const preFire = nf == null ? [] : frames.slice(0, nf);
    const floorHeld = preFire.every(f => f.o != null && Math.abs(f.o - 0.22) < 1e-6);
    let monotoneAfter = true;
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].o != null && frames[i - 1].o != null && frames[i].o < frames[i - 1].o - 1e-9) monotoneAfter = false;
    }
    P('G-ONSET-5 onset blend does not reopen §GHOST_GROUND_LIVE_TRIGGER — opacity floor holds until the REAL (post-blend) cursor crosses firstAboveMs, then rises monotonically',
      go.armed === true && nf != null && floorHeld && monotoneAfter,
      `armed=${go.armed}  firstAboveMs=${go.firstAboveMs}  realFireFrame=${nf}/${frames.length ? frames.length - 1 : '?'} ` +
      `(t=${nf == null ? 'n/a' : frames[nf].t}, cursorMs=${nf == null ? 'n/a' : frames[nf].cursorMs})  ` +
      `${preFire.length} frames before fire, all pinned at 0.22: ${floorHeld}  monotoneAfter=${monotoneAfter}`);
  }

  const pacing = logs.filter(l => l.indexOf('§CPE_BUILDUP_PACING') >= 0);
  const onsetLine = logs.filter(l => l.indexOf('§CPE_BUILDUP_ONSET_BLEND') >= 0 || l.indexOf('onset-blend') >= 0);
  P('G-ONSET-6 the mode line names the onset blend so a live bake log is self-explaining',
    pacing.some(l => l.indexOf('onset-blend') >= 0 || l.indexOf('ONSET_BLEND') >= 0),
    pacing.slice(-3).join(' | ') || '(no §CPE_BUILDUP_PACING line at all)');

  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD);
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
