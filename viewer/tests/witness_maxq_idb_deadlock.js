// WITNESS — §MAXQ_IDB open-deadlock guard (PHOTOREAL_STILL_RENDER.md §OPEN BUG 2026-07-19).
// ISSUE PROVEN/DISPROVEN: a pending-blocked deleteDatabase() makes every later indexedDB.open()
// queue forever, so MaxQ froze after "§MAXQ_PREVIEW done" with ZERO further log lines, _active
// stuck true and the wake lock held.
//   CASE A (zombie): a foreign connection + pending delete must produce a clean §MAXQ_FAIL
//                    idb-open-timeout within ~15s, NOT a silent hang.
//   CASE B (regression): a normal short bake must still complete (§MAXQ_DONE), unaffected.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const URL = 'http://localhost:8477/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const IDB_NAME = 'bim_ootb_cinema_maxq';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push(t); if (/§MAXQ|§STILL_REFINE start/.test(t)) console.log('  [page] ' + t); });
  page.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); console.log('  [pageerror] ' + e.message); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // wait for the app + maxq module
  await page.waitForFunction(() => window.APP && window.APP.startMaxQualityOrbit && window.APP.camera, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 8000));  // let streaming settle
  console.log('LOADED. MAXQ_V line: ' + (logs.find(l => l.startsWith('§MAXQ_LOADED')) || 'MISSING'));

  // ---------- CASE A: zombie connection + pending blocked delete ----------
  console.log('\n=== CASE A — zombie connection, delete left pending/blocked ===');
  const zombie = await page.evaluate((name) => new Promise((res) => {
    const rq = indexedDB.open(name, 1);
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore('frames'); } catch (e) {} };
    rq.onsuccess = () => {
      window.__zombieDb = rq.result;          // held open on purpose, never closed, no onversionchange
      const del = indexedDB.deleteDatabase(name);  // -> blocked, stays PENDING, queues later opens
      del.onblocked = () => { window.__zombieDelBlocked = true; };
      setTimeout(() => res({ held: true, blocked: !!window.__zombieDelBlocked }), 1200);
    };
    rq.onerror = () => res({ held: false });
  }), IDB_NAME);
  console.log('  zombie set up: ' + JSON.stringify(zombie));

  const tA = Date.now();
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ frames: 2, preview: false }); });
  // in-page wait, but polled from node with a hard ceiling — a HANG is the failure we are testing for
  let caseADone = false;
  while (Date.now() - tA < 45000) {
    if (logs.some(l => l.includes('§MAXQ_FAIL'))) { caseADone = true; break; }
    await new Promise(r => setTimeout(r, 500));
  }
  const elapsedA = Date.now() - tA;
  const failLine = logs.find(l => l.includes('§MAXQ_FAIL')) || '';
  const blockedLine = logs.find(l => l.includes('§MAXQ_IDB_BLOCKED')) || '';
  const stateA = await page.evaluate(() => ({ active: !!window.APP._maxqActive, still: !!window.APP._stillRefineActive }));
  console.log('  elapsed=' + elapsedA + 'ms  failed=' + caseADone);
  console.log('  §MAXQ_FAIL      : ' + (failLine || 'NONE  <-- HANG, bug NOT fixed'));
  console.log('  §MAXQ_IDB_BLOCKED: ' + (blockedLine || 'none'));
  console.log('  post-state      : ' + JSON.stringify(stateA) + '  (both must be false = recoverable)');
  const passA = caseADone && /idb-open-timeout/.test(failLine) && !stateA.active && !stateA.still && elapsedA < 30000;
  console.log('  CASE A: ' + (passA ? 'PASS' : 'FAIL'));

  // release the zombie so case B is a clean environment
  await page.evaluate(() => { try { window.__zombieDb.close(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 1500));

  // ---------- CASE B: normal short bake still works ----------
  console.log('\n=== CASE B — regression, normal 2-frame bake ===');
  const nBefore = logs.length;
  const tB = Date.now();
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ frames: 2, preview: false }); });
  let caseBDone = false;
  while (Date.now() - tB < 180000) {
    const tail = logs.slice(nBefore);
    if (tail.some(l => l.includes('§MAXQ_DONE'))) { caseBDone = true; break; }
    if (tail.some(l => l.includes('§MAXQ_FAIL'))) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  const tail = logs.slice(nBefore);
  console.log('  elapsed=' + (Date.now() - tB) + 'ms');
  console.log('  §MAXQ_IDB_READY : ' + (tail.find(l => l.includes('§MAXQ_IDB_READY')) || 'NONE'));
  console.log('  §MAXQ_FRAME     : ' + (tail.filter(l => l.includes('§MAXQ_FRAME')).join(' | ') || 'NONE'));
  console.log('  §MAXQ_DONE      : ' + (tail.find(l => l.includes('§MAXQ_DONE')) || 'NONE'));
  console.log('  §MAXQ_FAIL      : ' + (tail.find(l => l.includes('§MAXQ_FAIL')) || 'none'));
  const stateB = await page.evaluate(() => ({ active: !!window.APP._maxqActive }));
  const passB = caseBDone && !stateB.active;
  console.log('  CASE B: ' + (passB ? 'PASS' : 'FAIL'));

  const errs = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('\npageerrors: ' + errs.length + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  console.log('\nVERDICT: ' + (passA && passB && !errs.length ? 'PASS — deadlock aborts cleanly, normal bake unaffected'
                                                             : 'FAIL'));
  await browser.close();
  process.exit(passA && passB && !errs.length ? 0 : 1);
})();
