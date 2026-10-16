#!/usr/bin/env node
/* ⚠ WITNESS — proves/disproves §4D_LAYER_TRUTH (4D_SCHEDULE_PERFECTION.md, 2026-08-07, user report:
 * "walls coming up before the foundation slabs all around... the 2 trucks still came out on day 1"):
 * the task-window playback layer DISCARDED the schedule layer's element times (even index-stagger)
 * and geometry-less elements (no transform row → z=0) dragged zone windows to day 0.
 *
 * Witnessed pre-fix numbers, from the user's own console (Hospital, cold open):
 *   §XRAY_EDGES staged=284/63415 on the task-window pass  (generative pass: staged=0)
 *   §GANTT band 0 z=[0.0,0.0] 233 elements: Architecture:233   (the day-0 wall population)
 *
 * PASS iff on a cold Hospital open (fresh profile, single-load path):
 *   - §XRAY_EDGES staged=0  (support carrier never finishes after its element's reveal)
 *   - §4D_NOGEO parking invariant: IF geometry-less elements exist they are parked (parked>0),
 *     and either way NO day-0 zero-z band population (§GANTT band 0 z=[0.0,0.0] absent).
 *     (Expectation un-rotted 2026-08-11: the original `parked>0` hard-required a ghost
 *     population — obsolete once the §NOGEO_COMPOSE lane zeroed Hospital's ghosts; parked=0
 *     with no §4D_NOGEO line is now the HEALTHY state, the invariant is "never at day 0".)
 *   - §SUPPORT_CHECK floating=0 (engine invariant intact)
 *   - §GANTT_OPS_FIRST20 has no Wall and no undefined entry (day-1 ops are substructure)
 *     (was a rotted FAIL 2026-08-07..11 — a day-1 IfcWallStandardCase; gone since §TIER_SERIAL
 *     PR #1282, first20 is now ALL IfcFooting — re-locked here.)
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
    if (/§XRAY_EDGES|§4D_NOGEO|§SUPPORT_CHECK|§GANTT_OPS_FIRST20|§GANTT_PREMATERIALIZE|§TM_REFOLD|§GANTT band 0 /.test(t)) {
      lines.push(t); console.log('[console]', t.slice(0, 220)); } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.db && window.toggleTimeMachine, null, { timeout: 180000 });
  await page.evaluate(() => window.toggleTimeMachine());
  await page.waitForFunction(() => { try { return window.tmGetState && window.tmGetState().active; } catch (e) { return false; } }, null, { timeout: 300000 });
  await page.evaluate(() => document.getElementById('tm-gantt').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForTimeout(8000);
  const grab = re => { const l = lines.find(x => re.test(x)) || ''; return l; };
  const staged = +(grab(/§XRAY_EDGES/).match(/staged=(\d+)/) || [0, -1])[1];
  const noGeoLine = grab(/§4D_NOGEO/);
  const parked = +(noGeoLine.match(/parked=(\d+)/) || [0, 0])[1];
  // Day-0 pollution signature: an all-at-origin band ("§GANTT band 0 z=[0.0,0.0] 233 elements"
  // was the witnessed pre-fix line). Healthy = the line does not exist at all.
  const band00 = lines.find(l => /§GANTT band 0 z=\[0\.0,0\.0\]/.test(l)) || '';
  const parkedOk = (noGeoLine === '' || parked > 0) && band00 === '';
  const floating = +(grab(/§SUPPORT_CHECK/).match(/floating=(\d+)/) || [0, -1])[1];
  const first20 = grab(/§GANTT_OPS_FIRST20/);
  const first20Clean = first20 !== '' && !/Wall|undefined/.test(first20.replace('§GANTT_OPS_FIRST20', ''));
  const refolds = lines.filter(l => /§TM_REFOLD/.test(l)).length;
  console.log(`§4D_LAYER_TRUTH_CHECK staged=${staged} (was 284) noGeoParked=${parked} parkedOk=${parkedOk} (band00="${band00.slice(0, 60)}") floating=${floating} first20Clean=${first20Clean} refolds=${refolds}`);
  const pass = staged === 0 && parkedOk && floating === 0 && first20Clean && refolds === 0;
  console.log(pass ? 'PASS — schedule-layer truth survives the task-window layer; no day-0 geometry-less pollution'
                   : 'FAIL — see counts (staged>0 = window layer still re-times against the schedule layer)');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
