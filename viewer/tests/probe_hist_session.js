// ⚠ DO NOT REMOVE — probe W-HIST-SESSION (HISTORY_SESSION_EVENTS.md §RESUME, user 2026-06-11
// "new session — the Z line does not show the dots"). Drives the REAL viewer on Duplex.
// Issues PROVED/DISPROVED, in order:
//   1. FRESH open logs §HIST_SESSION id=<sess> reHome=false treeKey=<key> dots=<n> (the diagnostic
//      that pinpoints empty-Z reports) AND records the BUILDING_OPEN dot (§HIST_PUSH opType=BUILDING_OPEN).
//   2. THE BUG: pressing 'x' (A.toggleSection → §SECTION ON) now records a SECTION_CUT event dot
//      (§HIST_PUSH kind=event). Before the fix this path had no recordEvent → empty Z.
//   3. THE REGRESSION GUARD: scrubbing back/forward over that dot re-applies the look (drives the
//      REAL A.toggleSection) but mints NO new dot — recordEvent gates on HistoryTap.isApplying().
//   4. Re-home: reloading with &sess=<other> logs §HIST_SESSION reHome=true (read-only past session).
// SW BLOCKED. Leak-safe (runner kills chrome). Read the log after every run — exit code is not evidence.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8169;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fail = 0;
function ok(c, m) { console.log((c ? '§W-HIST-SESSION PASS ' : '§W-HIST-SESSION FAIL ') + m); if (!c) fail++; }

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });   // fresh ctx = fresh session/localStorage
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(2000);

    // ── 1. fresh open: §HIST_SESSION diag + BUILDING_OPEN dot ──────────
    const sess = logs.find(l => l.includes('§HIST_SESSION'));
    console.log('DIAG: ' + (sess || '(missing)'));
    ok(!!sess && /reHome=false/.test(sess) && /treeKey=bim\.hist\.tree\./.test(sess) && /dots=\d+/.test(sess),
      'fresh open logs §HIST_SESSION reHome=false treeKey dots');
    ok(logs.some(l => l.includes('§HIST_PUSH') && l.includes('opType=BUILDING_OPEN')),
      'fresh open records the BUILDING_OPEN dot');

    // ── 2. the bug: 'x' (toggle section) records an event dot ──────────
    const pushesBefore = logs.filter(l => l.includes('§HIST_PUSH')).length;
    await page.keyboard.press('x');
    await sleep(1200);
    const secOn = logs.some(l => l.includes('§SECTION ON'));
    const evPush = logs.find(l => l.includes('§HIST_PUSH') && l.includes('kind=event') && /Section/.test(l));
    console.log('SECTION: on=' + secOn + ' push=' + (evPush || '(none)'));
    ok(secOn, "'x' toggled the section (§SECTION ON)");
    ok(!!evPush, 'section toggle records a SECTION_CUT event dot (§HIST_PUSH kind=event)');

    // ── 3. scrub over the dot: look re-applies, NO new dot ─────────────
    const nBeforeScrub = logs.filter(l => l.includes('§HIST_PUSH')).length;
    await page.evaluate(() => { window.HistoryBar.viewStepBack(); });
    await sleep(600);
    await page.evaluate(() => { window.HistoryBar.viewStepFront(); });
    await sleep(600);
    const nAfterScrub = logs.filter(l => l.includes('§HIST_PUSH')).length;
    const restored = logs.some(l => l.includes('§EVT RESTORE'));
    console.log('SCRUB: restores=' + restored + ' pushesBefore=' + nBeforeScrub + ' after=' + nAfterScrub);
    ok(restored, 'scrub re-applied a recorded look (§EVT RESTORE)');
    ok(nAfterScrub === nBeforeScrub, 'scrub minted NO new dot (isApplying gate): ' + nAfterScrub + ' (want ' + nBeforeScrub + ')');

    // ── 4. re-home: &sess=<other> is read-only past-session ────────────
    logs.length = 0;
    await page.goto(URL + '&sess=s1700000000000', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.UniversalHistory, { timeout: 60000 }).catch(e => console.log('REHOME_WAIT_FAIL ' + e.message));
    await sleep(2500);
    const sess2 = logs.find(l => l.includes('§HIST_SESSION'));
    console.log('REHOME DIAG: ' + (sess2 || '(missing)'));
    ok(!!sess2 && /reHome=true/.test(sess2) && /id=s1700000000000/.test(sess2),
      '&sess= re-home logs §HIST_SESSION reHome=true with the forced id');

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fail === 0 ? '§W-HIST-SESSION ALL PASS' : ('§W-HIST-SESSION ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
})();
