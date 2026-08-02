// WITNESS — §CPE_BUILDUP_WORK_PACED: the film must advance by WORK, not by calendar.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_WORK_PACED.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, after two Hospital buildup bakes: "but construction
// came on too fast.. is the path and TM consistent?" -> "as long it is consistent as i find this
// seems to be at random"):
// The buildup stepped the cursor linearly in DAYS — `projectStart + t*span` — while the derived 4D
// order clusters thousands of elements at nearby timestamps. Their own logs, same film fraction:
//     run A  t=0.054  placed=210/63,421      (0.3% of the building)
//     run B  t=0.053  placed=15,485/63,416    (24% of the building)
// Same path, same moment, two completely different films.
//
//   G-WP-1  the claim: at t = 0.1/0.25/0.5/0.75 the PLACED FRACTION equals t within tolerance.
//           "10% of the film is 10% of the building", measured against the real op schedule.
//   G-WP-2  RED on calendar pacing. The same fractions paced by DATE deviate far more — without
//           this, G-WP-1 could pass on a model that happens to be evenly spread anyway.
//   G-WP-3  the cursor is monotone non-decreasing across the film. A building does not un-build.
//   G-WP-4  DETERMINISM — the user's "seems to be at random" answered with a number: two independent
//           arms produce byte-identical cursors for identical fractions.
//   G-WP-5  degrade, don't disable: with tmWorkSchedule hidden the way a stale cache would, pacing
//           falls back to calendar and says so in the log — the film still bakes.
//   G-WP-6  preview and bake ask for the same cursor at the same film fraction.
//   G-WP-8  2026-08-03 — user report on a REAL Hospital bake: "the buildup reveal starts too FAST,
//           then the MIDDLE is relatively SLOW." G-WP-1 only proves index-fraction == film-fraction;
//           it says nothing about FRAME-BY-FRAME evenness, which is what a viewer actually sees.
//           Replays the real bake's per-frame pipeline (buildupTAt + buildupCursorAt, nFrames=1905 —
//           the user's own log) and asserts the elements/frame rate has no burst/plateau, plus logs
//           the end_ts tie-cluster structure (a big tied group would cause exactly that pattern even
//           with an even element-index rate). See prompts/CINEMA_PATH_EDITOR.md 2026-08-03 for the
//           real numbers this produced on Hospital and the conclusion (camera-beat-speed illusion,
//           not a pacing defect — the measured rate came back flat, ~36.2 elements/frame, <0.5% jitter).
//   G-WP-9  the post-topout dwell (§CPE_BUILDUP_TOPOUT) stays flat, not still climbing.
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
      if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
      let ok = false;
      try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
      if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
      const bk = window.tmFollowTimeline();
      if (!bk) return { err: 'no timeline to follow' };
      const total = bk.ops;
      const out = { total, span: { s: bk.projectStart, e: bk.projectEnd } };

      // ── work pacing: the cursor asked for, and the work actually placed there ────────────────
      A.buildupPacingReset();
      out.work = FRACS.map(t => {
        const ms = A.buildupCursorAt(t, bk);
        return { t, ms, placedFrac: window.tmPlacedCount(ms) / total };
      });

      // ── G-WP-2 control: the SAME fractions paced by calendar, the way it used to be ──────────
      out.calendar = FRACS.map(t => {
        const ms = bk.projectStart + t * (bk.projectEnd - bk.projectStart);
        return { t, ms, placedFrac: window.tmPlacedCount(ms) / total };
      });

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

      // ── G-WP-8/9 (2026-08-03) — user bug report on a real Hospital bake: "buildup reveal starts
      // too FAST, then the MIDDLE is relatively SLOW." §CPE_BUILDUP_WORK_PACED already proved the
      // ELEMENT-INDEX fraction tracks the film fraction (G-WP-1 above) — but that says nothing about
      // whether the RENDER actually reveals elements at an even rate FRAME BY FRAME, which is what a
      // viewer sees. Two separate ways this could still be uneven even with G-WP-1 green:
      //   (a) end_ts TIES — tmPlacedCount() counts `end_ts <= cursor`, so if many ops share one
      //       timestamp, the reveal would burst (all of a tied group appears in one frame) then
      //       plateau (no visible change for the rest of that tied index range) even though the
      //       INDEX advances evenly every frame.
      //   (b) §CPE_BUILDUP_TOPOUT's remap (t -> t/topoutU) is linear in FILM FRACTION, which this
      //       code simulates using the actual real-bake per-frame pipeline (buildupTAt then
      //       buildupCursorAt), not just the FRACS checkpoints G-WP-1 used.
      // This replays the exact per-frame sequence cinema_maxq.js's bake loop runs (same two calls,
      // same nFrames a real Hospital bake used — frame=0/1905 in the user's own log).
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
      // end_ts tie-cluster structure — the (a) mechanism above, checked directly against real data.
      const sch = window.tmWorkSchedule();
      let groups = 0, maxGroup = 1, run = 1;
      for (let i = 1; i < sch.ends.length; i++) {
        if (sch.ends[i] === sch.ends[i - 1]) { run++; } else { groups++; if (run > maxGroup) maxGroup = run; run = 1; }
      }
      groups++;
      out.tieGroups = groups; out.tieGroupMax = maxGroup;
      // Windowed rate (elements per BLOCK of frames), over the pre-topout span only (post-topout is
      // SUPPOSED to be flat — that is the dwell §CPE_BUILDUP_TOPOUT deliberately introduces). A block
      // rather than a raw 1-frame diff: on a small building (e.g. Duplex, ~1100 ops/1905 frames) most
      // single frames place 0 or 1 element, so a per-frame diff is dominated by integer-count
      // quantization noise that has nothing to do with pacing evenness — the same reason a human
      // doesn't perceive "fast/slow" frame-to-frame, only over a stretch of the film. Block size
      // scales with total ops so it always spans a real number of elements (min 5 frames).
      const topoutFrame = Math.min(nFrames - 1, Math.round(topout.u * (nFrames - 1)) + 1);
      const block = Math.max(5, Math.round(topoutFrame / Math.max(20, Math.min(100, Math.round(total / 50)))));
      const rates = [];
      for (let f = block; f <= topoutFrame; f += block) rates.push((trace[f] - trace[f - block]) / block);
      const meanRate = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : 0;
      out.rateBlockFrames = block;
      // Coarse checkpoints for a human-readable summary (start/quarter/half/three-quarter of the FILM).
      out.checkpoints = [0.10, 0.25, 0.50, 0.75].map(cp => {
        const f = Math.round(cp * (nFrames - 1));
        const w = 20; // local rate window, frames
        const f0 = Math.max(0, f - w), f1 = Math.min(topoutFrame, f + w);
        return { t: cp, placed: trace[f], ratePerFrame: +((trace[f1] - trace[f0]) / (f1 - f0)).toFixed(2) };
      });
      out.meanRatePerFrame = +meanRate.toFixed(2);
      out.maxRateDeviationFrac = rates.length ?
        Math.max(...rates.map(r => Math.abs(r - meanRate))) / meanRate : 0;
      out.postTopoutFlat = trace.slice(topoutFrame).every(p => p === trace[topoutFrame]);
      out.finalPlaced = trace[nFrames - 1];

      try { window.tmRestoreDerivedOrder(); } catch (e) {}
      return out;
    }, FRACS);

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-WP-0 the building has a buildup timeline', false, res.err + ' — INCONCLUSIVE, not a product verdict');
    } else {
      const TOL = 0.03;   // 3 percentage points; the k-th completion can share a timestamp with others
      const workDev = res.work.map(w => Math.abs(w.placedFrac - w.t));
      const calDev = res.calendar.map(c => Math.abs(c.placedFrac - c.t));
      const worstWork = Math.max(...workDev), worstCal = Math.max(...calDev);

      P('G-WP-1 k% of the film is k% of the building',
        worstWork <= TOL,
        res.work.map((w, i) => `t=${w.t}→placed ${(w.placedFrac * 100).toFixed(1)}%`).join('  ') +
        `   worst deviation ${(worstWork * 100).toFixed(2)}pp (tol ${TOL * 100}pp)`);

      P('G-WP-2 calendar pacing is measurably worse on this model (the RED this replaces)',
        worstCal > worstWork,
        res.calendar.map(c => `t=${c.t}→placed ${(c.placedFrac * 100).toFixed(1)}%`).join('  ') +
        `   worst ${(worstCal * 100).toFixed(2)}pp vs work-paced ${(worstWork * 100).toFixed(2)}pp`);

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

      const line = logs.filter(l => /§CPE_BUILDUP_PACING/.test(l)).slice(-1)[0] || '';
      const sch = logs.filter(l => /§CPE_WORK_SCHEDULE/.test(l)).slice(-1)[0] || '';
      P('G-WP-7 the log states the pacing mode and how front-loaded the model is',
        /mode=work/.test(line) && /workInFirst10%OfCalendar/.test(sch),
        `${line || 'no §CPE_BUILDUP_PACING'}\n        ${sch || 'no §CPE_WORK_SCHEDULE'}`);

      // G-WP-8/9 — real per-frame FILM reveal rate (2026-08-03 "fast start, slow middle" report).
      // Tolerance is loose (25%) on purpose: this proves the reveal isn't BURSTY/PLATEAUING, not
      // that it is frame-perfect — a model with real duration ties will always have some jitter.
      const RATE_TOL = 0.25;
      const cpLine = res.checkpoints.map(c => `t=${c.t}→${c.placed} (${c.ratePerFrame}/frame)`).join('  ');
      P('G-WP-8 the per-frame reveal rate stays even across the pre-topout film (no burst/plateau)',
        res.maxRateDeviationFrac <= RATE_TOL,
        `topoutU=${res.topoutU.toFixed(3)} meanRate=${res.meanRatePerFrame}/frame ` +
        `worstDeviation=${(res.maxRateDeviationFrac * 100).toFixed(1)}% (tol ${RATE_TOL * 100}%)\n        ` +
        `checkpoints: ${cpLine}\n        ` +
        `end_ts tie clusters: ${res.tieGroups} distinct timestamps / ${res.total} ops, largest tied group=${res.tieGroupMax} ` +
        `(a large group here would explain a burst/plateau reveal even with an even element-index rate)`);

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
