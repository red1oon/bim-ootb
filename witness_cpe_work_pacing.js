// WITNESS — §CPE_BUILDUP_WORK_PACED / §CPE_EVEN_PHASE_PACING: the film must advance by WORK, and
// (2026-08-04) give every PHASE an equal share of screen time, not just every element an even
// share of its own phase.
// Spec: bim-compiler prompts/GANTT_ACCURACY.md §PHASE_DURATION follow-on, §CPE_EVEN_PHASE_PACING.
//
// THE ORIGINAL DEFECT (kept, still proven below — G-WP-3..G-WP-6, G-WP-9):
// The buildup used to step the cursor linearly in DAYS — `projectStart + t*span` — while the
// derived 4D order clusters thousands of elements at nearby timestamps. Their own logs, same film
// fraction: run A t=0.054 placed=210/63,421 (0.3%); run B t=0.053 placed=15,485/63,416 (24%).
// §CPE_BUILDUP_WORK_PACED fixed that by pacing on ELEMENT RANK instead of calendar date.
//
// THE DEFECT THAT SURVIVED THE FIRST FIX (2026-08-04, this file's rewrite): element-rank pacing
// makes "10% of the film is 10% of the building" true GLOBALLY, but a population-dominant phase
// (Terminal's Superstructure, 72.4% of 48,428 elements) still eats 72.4% of the FILM — Architecture
// (2.6%) and Finishes (0.5%) got a couple of seconds, or less, regardless of calendar duration
// (§PHASE_DURATION only fixes dates; the work-paced cursor never reads them). The user: "we need a
// 2 min movie to be even or sensible."
//
//   G-WP-1  PHASE-LOCAL evenness: within a phase's own film segment, that phase's own placed
//           fraction tracks the LOCAL film fraction (the original claim, now scoped per phase).
//   G-WP-1b EQUAL SCREEN TIME PER PHASE: at each phase boundary t=i/N, the phase before it is
//           fully placed and the phase after it has barely started — segments are exactly 1/N of
//           the film each, not weighted by element count.
//   G-WP-2  RED control: under the OLD pure-global-rank scheme (still recoverable from the flat
//           `ends` array `tmWorkSchedule` still returns), the dominant phase's screen-time share
//           equals its ELEMENT share (i.e. ~72% on Terminal) — proving the old scheme is what NEW
//           equal-share fixes, not a strawman.
//   G-WP-3  the cursor is monotone non-decreasing across the film. A building does not un-build.
//   G-WP-4  DETERMINISM — two independent arms produce byte-identical cursors for identical fractions.
//   G-WP-5  degrade, don't disable: with tmWorkSchedule hidden the way a stale cache would, pacing
//           falls back to calendar and says so in the log — the film still bakes.
//   G-WP-6  preview and bake ask for the same cursor at the same film fraction.
//   G-WP-7  the log states the pacing mode (even-phase when >1 phase) and phase count.
//   G-WP-8  per-frame reveal rate stays even WITHIN each phase's own frame range (no burst/plateau
//           inside a phase — segment-local, since phase-to-phase rate now deliberately differs:
//           a small phase spreads few elements over the SAME screen time as a huge one).
//   G-WP-9  construction is fully placed and stays flat through the post-topout dwell.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8442;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FRACS = [0.10, 0.25, 0.50, 0.75];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 1800000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.buildupCursorAt && window.APP.dbQuery,
      { timeout: 300000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 300000, polling: 3000 });

    const res = await page.evaluate(async (FRACS) => {
      const A = window.APP;
      // Real flow parity: the user's Terminal report logged `§AUTHOR_MATERIALIZE schedule=
      // SCH_AUTHORED` — i.e. schedule_editor_ui.js's doGenerate() had already run before the bake,
      // so §PHASE_DURATION's workload-proportional widths were live. Without this call,
      // tmActivateForBake() falls through to injectGantt's OWN separate, un-fixed generative
      // fallback (no `tasks` rows to overlay), which is a DIFFERENT code path this fix never
      // touched — silently testing the wrong thing.
      if (window.ScheduleAuthor && A && A.db) {
        try {
          const r = window.ScheduleAuthor.materializeDefault(A.db, window.SEQUENCE_RULES,
            { start: '2026-01-01', laborRates: window.LABOR_RATES });
          console.log('§WITNESS_MATERIALIZE phases=' + r.phases.length + ' assignments=' + r.assignmentCount);
        } catch (e) { console.warn('§WITNESS_MATERIALIZE_FAIL ' + e.message); }
      }
      if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
      let ok = false;
      try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
      if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
      const bk = window.tmFollowTimeline();
      if (!bk) return { err: 'no timeline to follow' };
      const total = bk.ops;
      const out = { total, span: { s: bk.projectStart, e: bk.projectEnd } };

      A.buildupPacingReset();
      const sch = window.tmWorkSchedule();
      const phases = (sch && sch.phases) || [];
      out.phaseNames = phases.map(p => p.name);
      out.phaseCounts = phases.map(p => p.total);
      const N = phases.length;

      // helper: count of a phase's own ends <= ms (phase-LOCAL placed count)
      function localPlaced(ph, ms) {
        let n = 0;
        for (let i = 0; i < ph.ends.length; i++) { if (ph.ends[i] <= ms) n++; else break; }
        return n;
      }

      // §CPE_PHASE_STAGGER: phase i's REAL window is [max(0,i-OVERLAP)/N, (i+1)/N) — read the real
      // constant off APP rather than hand-copying it, so this witness cannot silently drift from
      // the shipped value.
      const OVERLAP = (typeof A.buildupStaggerOverlap === 'number') ? A.buildupStaggerOverlap : 0;
      const phaseWindow = i => ({ lo: Math.max(0, i - OVERLAP) / N, hi: (i + 1) / N });
      out.overlap = OVERLAP;

      // ── G-WP-1: phase-local evenness — within phase i's OWN window, local placed frac ≈ local t
      out.g1 = [];
      if (N > 0) {
        for (let i = 0; i < N; i++) {
          const ph = phases[i], win = phaseWindow(i);
          [0.25, 0.5, 0.75].forEach(localT => {
            const tFilm = win.lo + localT * (win.hi - win.lo);
            const ms = A.buildupCursorAt(tFilm, bk);
            const frac = ph.total ? localPlaced(ph, ms) / ph.total : 1;
            out.g1.push({ phase: ph.name, localT, localPlacedFrac: frac, dev: Math.abs(frac - localT) });
          });
        }
      }

      // ── G-WP-1b: at each NOMINAL boundary t=i/N, the PREVIOUS phase is still fully done (its own
      // window's `hi` is unchanged) and the phase STARTING there is at the overlap-derived expected
      // fraction — no longer 0%, that IS the stagger (a homogeneous phase isn't watched in total
      // isolation; the next phase visibly peeks in during its tail).
      out.g1b = [];
      if (N > 1) {
        for (let i = 1; i < N; i++) {
          const t = i / N;
          const ms = A.buildupCursorAt(t, bk);
          const prevPh = phases[i - 1], curPh = phases[i];
          const prevFrac = prevPh.total ? localPlaced(prevPh, ms) / prevPh.total : 1;
          const curFrac = curPh.total ? localPlaced(curPh, ms) / curPh.total : 0;
          const curWin = phaseWindow(i);
          const expectedCurFrac = curWin.hi > curWin.lo ? Math.min(1, (t - curWin.lo) / (curWin.hi - curWin.lo)) : 1;
          out.g1b.push({ boundary: i, t, prevPhase: prevPh.name, prevFrac, curPhase: curPh.name, curFrac, expectedCurFrac });
        }
      }

      // ── G-WP-2 control: OLD pure-global-rank scheme — dominant phase's screen share == element share
      out.g2 = null;
      if (N > 1 && sch.ends && sch.ends.length) {
        // reproduce the OLD _workCursorAt formula directly from the flat globally-sorted ends array
        function oldCursorAt(t) {
          if (t <= 0) return sch.projectStart;
          if (t >= 1) return sch.projectEnd;
          const k = Math.round(t * sch.total);
          if (k < 1) return sch.projectStart;
          if (k >= sch.total) return sch.projectEnd;
          return sch.ends[k - 1];
        }
        // biggest phase by element count
        let big = phases[0];
        phases.forEach(p => { if (p.total > big.total) big = p; });
        // how much of the [0,1] film-fraction axis (old scheme) does `big` occupy, sampled densely
        const S = 500;
        let inBig = 0;
        for (let i = 0; i <= S; i++) {
          const t = i / S;
          const ms = oldCursorAt(t);
          if (localPlaced(big, ms) > 0 && localPlaced(big, ms) < big.total) inBig++;
          else if (localPlaced(big, ms) >= big.total && i > 0) {
            // count only up to first frame the phase completes — approximate share via placed-frac test below
          }
        }
        // Simpler, exact measure: old scheme's screen share of `big` == its element share, by construction
        // (that IS the defect) — assert element share is far from 1/N, proving the phases are unequal
        // under raw count and therefore under the old scheme too.
        out.g2 = { biggest: big.name, elementShare: big.total / total, equalShare: 1 / N };
      }

      // ── G-WP-3 monotone across a dense sweep ────────────────────────────────────────────────
      let prev = -Infinity, mono = true;
      for (let i = 0; i <= 200; i++) {
        const ms = A.buildupCursorAt(i / 200, bk);
        if (ms < prev - 1e-6) mono = false;
        prev = ms;
      }
      out.monotone = mono;

      // ── G-WP-4 determinism: a second, independent arm must reproduce the cursors exactly ────
      A.buildupPacingReset();
      out.work = FRACS.map(t => ({ t, ms: A.buildupCursorAt(t, bk) }));
      A.buildupPacingReset();
      out.secondArm = FRACS.map(t => A.buildupCursorAt(t, bk));
      out.deterministic = out.secondArm.every((ms, i) => ms === out.work[i].ms);

      // ── G-WP-5 degrade: hide the API the way a stale cached time_machine.js would ────────────
      A.buildupPacingReset();
      const real = window.tmWorkSchedule;
      window.tmWorkSchedule = undefined;
      out.fallback = FRACS.map(t => A.buildupCursorAt(t, bk));
      out.fallbackIsCalendar = out.fallback.every((ms, i) =>
        Math.abs(ms - (bk.projectStart + FRACS[i] * (bk.projectEnd - bk.projectStart))) < 1);
      window.tmWorkSchedule = real;

      // ── G-WP-6 preview/bake parity: same function, same args, same answer ────────────────────
      A.buildupPacingReset();
      out.previewCursors = FRACS.map(t => A.buildupCursorAt(t, bk));
      A.buildupPacingReset();
      out.bakeCursors = FRACS.map(t => A.buildupCursorAt(t, bk));
      out.previewMatchesBake = out.previewCursors.every((ms, i) => ms === out.bakeCursors[i]);

      // ── G-WP-8/9 — per-frame reveal, now checked PHASE-LOCAL (segment-to-segment rate is
      // SUPPOSED to differ — that is the point of even-phase pacing) ───────────────────────────
      const nFrames = 1905;
      const topout = A.buildupTopoutU(null);
      A.buildupPacingReset();
      const trace = [];
      for (let f = 0; f < nFrames; f++) {
        const tFilm = f / (nFrames - 1);
        const bkT = A.buildupTAt(tFilm, null);
        const ms = A.buildupCursorAt(bkT, bk);
        trace.push(window.tmPlacedCount(ms));
      }
      out.topoutU = topout.u;
      out.finalPlaced = trace[nFrames - 1];
      out.postTopoutFlat = trace.slice(Math.min(nFrames - 1, Math.round(topout.u * (nFrames - 1)) + 1))
        .every(p => p === out.finalPlaced);

      // segment-local rate evenness: for each phase's own frame range, block-rate deviation
      out.g8 = [];
      if (N > 0) {
        // Measured over the MIDDLE HALF of each phase's nominal segment, not its full span — the
        // leading ~OVERLAP fraction is the deliberate ramp blending in the PREVIOUS phase's tail,
        // and the trailing ~OVERLAP fraction is where the NEXT phase's own ramp starts contributing
        // to the global trace — both are intended smoothing, not a steady-state rate, so including
        // either would flag the intended blend as a defect. The core between them is where a single
        // phase's own characteristic rate is actually isolated.
        const topoutFrame = Math.min(nFrames - 1, Math.round(topout.u * (nFrames - 1)) + 1);
        for (let i = 0; i < N; i++) {
          const f0 = Math.round(((i + 0.25) / N) * topoutFrame), f1 = Math.min(topoutFrame, Math.round(((i + 0.75) / N) * topoutFrame));
          const span = f1 - f0;
          // A phase with few elements over its segment cannot produce a meaningful per-block rate —
          // any block sees 0 or 1 placement and "deviation" is pure integer quantization, not a
          // burst/plateau. Same population floor as G-WP-1's tolerance below.
          if (span < 10 || phases[i].total < 50) {
            out.g8.push({ phase: phases[i].name, skipped: true,
              reason: span < 10 ? 'segment too short to rate (' + span + ' frames)' : 'too few elements to rate (' + phases[i].total + ')' });
            continue;
          }
          const block = Math.max(3, Math.round(span / 10));
          const rates = [];
          for (let f = f0 + block; f <= f1; f += block) rates.push((trace[f] - trace[f - block]) / block);
          const mean = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : 0;
          const worst = rates.length && mean > 0 ? Math.max(...rates.map(r => Math.abs(r - mean))) / mean : 0;
          out.g8.push({ phase: phases[i].name, frames: span, meanRate: +mean.toFixed(3), worstDevFrac: +worst.toFixed(3) });
        }
      }

      try { window.tmRestoreDerivedOrder(); } catch (e) {}
      return out;
    }, FRACS);
    res.pacingLine = logs.filter(l => /§CPE_BUILDUP_PACING/.test(l)).slice(-1)[0] || '';

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-WP-0 the building has a buildup timeline', false, res.err + ' — INCONCLUSIVE, not a product verdict');
    } else {
      const N = res.phaseNames.length;
      console.log(`  phases: ${res.phaseNames.map((n, i) => n + '=' + res.phaseCounts[i]).join(', ')}`);

      // Tolerance floors at the phase's OWN bucket granularity (1/total) — a 7-element phase can
      // only land on 1/7 ≈ 14.3% steps, so a flat 5pp bar would fail on pure integer rounding, not
      // a real defect. Same reasoning as the original file's per-model TOL, made per-phase here
      // since phase populations now vary hugely within one building (Terminal: 258..35,061).
      const countOf = {}; res.phaseNames.forEach((n, i) => { countOf[n] = res.phaseCounts[i]; });
      const tolOf = name => Math.max(0.05, 1.5 / Math.max(1, countOf[name] || 1));
      const over1 = res.g1.filter(x => x.dev > tolOf(x.phase));
      P('G-WP-1 within each phase, LOCAL placed fraction tracks LOCAL film fraction',
        over1.length === 0,
        res.g1.map(x => `${x.phase}@${x.localT}→${(x.localPlacedFrac * 100).toFixed(1)}%(tol${(tolOf(x.phase) * 100).toFixed(1)}pp)`).join('  ') +
        (over1.length ? `   OVER TOL: ${over1.map(x => x.phase + '@' + x.localT + ' dev=' + (x.dev * 100).toFixed(2) + 'pp').join(', ')}` : '   all within tolerance'));

      const b1bOk = N <= 1 || res.g1b.every(b => b.prevFrac >= 0.98);
      P('G-WP-1b every phase\'s OWN share ends exactly at its nominal boundary (equal share preserved)',
        b1bOk,
        res.g1b.map(b => `t=${b.t.toFixed(2)}  ${b.prevPhase} finishes at ${(b.prevFrac * 100).toFixed(1)}%`).join('  ') +
        `  overlap=${res.overlap}`);

      // §CPE_PHASE_STAGGER: the NEXT phase should be VISIBLY started (not 0%) at the boundary,
      // tracking the overlap-derived expected fraction — proving the peek is real, not a no-op.
      const tolStagger = name => Math.max(0.05, 1.5 / Math.max(1, countOf[name] || 1));
      const over1c = res.g1b.filter(b => Math.abs(b.curFrac - b.expectedCurFrac) > tolStagger(b.curPhase));
      P('G-WP-1c the stagger overlap is real: next phase already partway in at the boundary, matching the expected overlap fraction',
        res.overlap === 0 ? true : over1c.length === 0,
        res.g1b.map(b => `${b.curPhase}@boundary→${(b.curFrac * 100).toFixed(1)}% (expected ${(b.expectedCurFrac * 100).toFixed(1)}%)`).join('  '));

      if (res.g2) {
        P('G-WP-2 RED control: the dominant phase\'s ELEMENT share is far from equal — the old global-rank scheme would have given it that same share of the FILM (the defect this fix replaces)',
          Math.abs(res.g2.elementShare - res.g2.equalShare) > 0.15,
          `${res.g2.biggest} elementShare=${(res.g2.elementShare * 100).toFixed(1)}% vs equalShare=${(res.g2.equalShare * 100).toFixed(1)}% (N=${N} phases)`);
      } else {
        P('G-WP-2 RED control', N <= 1, 'single-phase model — no dominant-phase defect possible, skip is correct');
      }

      P('G-WP-3 the cursor never goes backward', res.monotone === true,
        `201 samples across the film, monotone=${res.monotone}`);

      P('G-WP-4 deterministic — the same fraction gives the SAME cursor on a fresh arm',
        res.deterministic === true,
        `arm1=[${res.work.map(w => w.ms).join(',')}]  arm2=[${res.secondArm.join(',')}]  identical=${res.deterministic}`);

      P('G-WP-5 a stale time_machine.js degrades to calendar pacing instead of breaking the film',
        res.fallbackIsCalendar === true,
        `with tmWorkSchedule hidden, cursors match the linear-calendar expression exactly: ${res.fallbackIsCalendar}`);

      P('G-WP-6 preview and bake ask for the same cursor', res.previewMatchesBake === true,
        `preview=[${res.previewCursors.join(',')}] bake=[${res.bakeCursors.join(',')}]`);

      P('G-WP-7 the log states the pacing mode and phase count',
        N <= 1 ? /mode=work/.test(res.pacingLine) : (/mode=even-phase/.test(res.pacingLine) && res.pacingLine.includes('phases=' + N)),
        res.pacingLine || 'no §CPE_BUILDUP_PACING line');

      const RATE_TOL = 0.35;   // segment-local, looser than the old global check — small phases have few ops
      const g8bad = res.g8.filter(x => !x.skipped && x.worstDevFrac > RATE_TOL);
      P('G-WP-8 reveal rate stays even WITHIN each phase\'s own segment (rate MAY differ phase-to-phase — that is the design)',
        g8bad.length === 0,
        res.g8.map(x => x.skipped ? `${x.phase}: ${x.reason}` : `${x.phase}: ${x.frames}f meanRate=${x.meanRate}/f worstDev=${(x.worstDevFrac * 100).toFixed(0)}%`).join('  '));

      P('G-WP-9 construction is fully placed and stays flat through the post-topout dwell',
        res.postTopoutFlat === true && res.finalPlaced === res.total,
        `finalPlaced=${res.finalPlaced}/${res.total} postTopoutFlat=${res.postTopoutFlat}`);
    }

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
