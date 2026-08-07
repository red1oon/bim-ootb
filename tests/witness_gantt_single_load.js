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
    if (/§GANTT_PREMATERIALIZE|§SUPPORT_CHECK|§GANTT injected|§XRAY_EDGES|§GANTT_AUTO_GENERATE|§TM_REFOLD|§GANTT_BAR_IDENTITY|§TIME_MACHINE (ON|OFF)/.test(t)) {
      lines.push(t); console.log('[console]', t); } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.db && window.toggleTimeMachine, null, { timeout: 180000 });
  await page.evaluate(() => window.toggleTimeMachine());
  await page.waitForFunction(() => { try { return window.tmGetState && window.tmGetState().active; } catch (e) { return false; } }, null, { timeout: 300000 });
  // The user's second step: press the Gantt chart icon (opens the drawer → drawGanttMini → the
  // §GANTT_EDIT_LOCK auto-generate branch that used to fire the refold double-load).
  await page.evaluate(() => document.getElementById('tm-gantt').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForTimeout(8000);   // window in which the OLD code fired auto-generate + refold
  const n = re => lines.filter(l => re.test(l)).length;
  const pre = n(/§GANTT_PREMATERIALIZE native schedule written/);
  const support = n(/§SUPPORT_CHECK/), injected = n(/§GANTT injected/), xray = n(/§XRAY_EDGES/);
  const autogen = n(/§GANTT_AUTO_GENERATE/), refold = n(/§TM_REFOLD/);
  const barLine = lines.find(l => /§GANTT_BAR_IDENTITY.*editable=/.test(l)) || '';
  const editable = +(barLine.match(/editable=(\d+)/) || [0, 0])[1];
  console.log(`§GANTT_SINGLE_LOAD_CHECK prematerialize=${pre} support=${support} injected=${injected} xray=${xray} autogen=${autogen} refold=${refold} editableBars=${editable}`);
  const pass = pre === 1 && support === 1 && injected === 1 && xray === 1 && autogen === 0 && refold === 0 && editable > 0;
  console.log(pass ? 'PASS — cold TM open is single-pass: schedule materialized first, no auto-generate refold, bars editable'
                   : 'FAIL — double-load signature still present (or bars not editable), see counts');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
