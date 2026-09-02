#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves §GANTT_DOUBLE_LOAD (4D_SCHEDULE_PERFECTION.md, 2026-08-07): "clicking
 * the Gantt/TM icon on a cold open runs injectGantt() TWICE — pass 1 placeholder-dated + task_id-less,
 * auto-materialize discards it via tmRefoldSchedule(), pass 2 refolds the whole chain."
 *
 * §-log capture only (headless, fresh profile = true cold open: no SW, no IDB gantt cache, no
 * authored schedule row). PASS iff, for ONE TM activation:
 *   - §GANTT_PREMATERIALIZE fires (the fix: schedule materialized before first injectGantt)
 *   - the expensive chain runs ONCE: §SUPPORT_CHECK ×1, §GANTT injected ×1, §XRAY_EDGES ×1
 *   - the double-load signature is ABSENT: §GANTT_AUTO_GENERATE ×0, §TM_REFOLD ×0
 *   - bars are editable on first draw: §GANTT_BAR_IDENTITY editable>0 (ops carry real task_ids)
 *
 * URL: set WITNESS_URL, else localhost:8484 (a server rooted at the repo/worktree under test).
 */
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const URL = process.env.WITNESS_URL ||
  'http://localhost:8484/viewer/viewer.html?db=https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db&ghost=1';
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext()).newPage();
  const lines = [];
  page.on('console', m => { const t = m.text();
    if (/§GANTT_PREMATERIALIZE|§SUPPORT_CHECK|§GANTT injected|§XRAY_EDGES|§GANTT_AUTO_GENERATE|§TM_REFOLD|§GANTT_BAR_IDENTITY|§GANTT_CACHE_HIT|§GANTT_STALE_CACHE|§TIME_MACHINE (ON|OFF)/.test(t)) {
      lines.push(t); console.log('[console]', t); } });

  async function driveTmOnce() {
    await page.waitForFunction(() => window.APP && window.APP.db && window.toggleTimeMachine, null, { timeout: 180000 });
    await page.evaluate(() => window.toggleTimeMachine());
    await page.waitForFunction(() => { try { return window.tmGetState && window.tmGetState().active; } catch (e) { return false; } }, null, { timeout: 300000 });
    // The user's second step: press the Gantt chart icon (opens the drawer → drawGanttMini → the
    // §GANTT_EDIT_LOCK auto-generate branch that used to fire the refold double-load).
    await page.evaluate(() => document.getElementById('tm-gantt').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    await page.waitForTimeout(8000);   // window in which the OLD code fired auto-generate + refold
  }
  function counts(from) {
    const slice = lines.slice(from);
    const n = re => slice.filter(l => re.test(l)).length;
    const barLine = slice.find(l => /§GANTT_BAR_IDENTITY.*editable=/.test(l)) || '';
    return { pre: n(/§GANTT_PREMATERIALIZE native schedule written/), support: n(/§SUPPORT_CHECK/),
             injected: n(/§GANTT injected/), xray: n(/§XRAY_EDGES/), autogen: n(/§GANTT_AUTO_GENERATE/),
             refold: n(/§TM_REFOLD/), cacheHit: n(/§GANTT_CACHE_HIT/), stale: n(/§GANTT_STALE_CACHE/),
             editable: +(barLine.match(/editable=(\d+)/) || [0, 0])[1] };
  }

  /* ── A: COLD open (fresh profile — no IDB gantt cache, no schedule) — the #1237 case ───────── */
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await driveTmOnce();
  const a = counts(0);
  console.log(`§GANTT_SINGLE_LOAD_CHECK prematerialize=${a.pre} support=${a.support} injected=${a.injected} xray=${a.xray} autogen=${a.autogen} refold=${a.refold} editableBars=${a.editable}`);
  const passA = a.pre === 1 && a.support === 1 && a.injected === 1 && a.xray === 1 && a.autogen === 0 && a.refold === 0 && a.editable > 0;

  /* ── B: WARM open (§GANTT_STALE_CACHE, 2026-08-08 — the live Terminal double-load report) ─────
   * Reload in the SAME context: the IDB gantt cache from A survives, but the DB is re-fetched
   * without schedule tables (they lived only in A's in-memory copy) — exactly a real next-session
   * open. Pre-fix: §GANTT_CACHE_HIT then §GANTT_AUTO_GENERATE + §TM_REFOLD re-ran the whole chain
   * (the double load). Post-fix: the stale cache is dropped (§GANTT_STALE_CACHE), the cold path
   * runs ONCE, bars editable. */
  const mark = lines.length;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await driveTmOnce();
  const b = counts(mark);
  console.log(`§GANTT_WARM_LOAD_CHECK stale=${b.stale} cacheHit=${b.cacheHit} prematerialize=${b.pre} injected=${b.injected} autogen=${b.autogen} refold=${b.refold} editableBars=${b.editable}`);
  const passB = b.stale === 1 && b.cacheHit === 0 && b.pre === 1 && b.injected === 1 && b.autogen === 0 && b.refold === 0 && b.editable > 0;

  console.log(passA ? 'PASS A — cold TM open is single-pass: schedule materialized first, no auto-generate refold, bars editable'
                    : 'FAIL A — cold double-load signature still present (or bars not editable), see counts');
  console.log(passB ? 'PASS B — warm open with a schedule-less DB drops the stale cache and stays single-pass'
                    : 'FAIL B — warm open still double-loads (cache honored while DB has no schedule), see counts');
  await browser.close();
  process.exit(passA && passB ? 0 : 1);
})();
