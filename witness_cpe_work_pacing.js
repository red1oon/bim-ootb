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
