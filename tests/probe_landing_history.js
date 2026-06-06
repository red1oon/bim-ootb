// probe_landing_history.js — witness HISTORY_SCRUB_FIX §8: the landing doc-history line.
// Loads index.html (NO WebGL — fast). window.open is stubbed so no real tabs open. Witnesses:
//   - openViewer/launchCity append to the shared localStorage 'bim.docHistory' + render a chip line.
//   - a VIEWER-sourced entry (cross-tab) + a storage event re-renders the union (landing shows it).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8148;
const URL = `http://localhost:${PORT}/index.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    // stub window.open BEFORE any script runs so openViewer doesn't spawn tabs
    await page.addInitScript(() => { window.open = function () { return { closed: false, focus: function () {} }; }; });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.openViewer === 'function' && typeof window.renderDocHistory === 'function', { timeout: 30000 }).catch(e => console.log('FN_WAIT_FAIL ' + e.message));
    await page.evaluate(() => { try { localStorage.removeItem('bim.docHistory'); } catch (e) {} if (window.renderDocHistory) renderDocHistory(); });
    await sleep(200);

    // initially empty → row hidden
    const empty = await page.evaluate(() => { var r = document.getElementById('doc-history-row'); return r ? getComputedStyle(r).display : 'no-row'; });
    console.log('doc-history-row initially (want none): ' + empty);

    // ── openViewer('Duplex') → appends BUILDING_OPEN + renders a chip ────
    await page.evaluate(() => { if (window.openViewer) openViewer('Duplex'); });
    await sleep(300);
    const afterOpen = await page.evaluate(() => {
      var arr = []; try { arr = JSON.parse(localStorage.getItem('bim.docHistory') || '[]'); } catch (e) {}
      var line = document.getElementById('doc-history-line');
      var row = document.getElementById('doc-history-row');
      return { log: arr, chips: line ? line.children.length : -1, chipSvg: line && line.children[0] ? !!line.children[0].querySelector('svg') : false,
        rowVisible: row ? getComputedStyle(row).display !== 'none' : false };
    });
    console.log('--- §8 after openViewer(Duplex) ---');
    console.log(JSON.stringify(afterOpen) + ' (want log[0].type=BUILDING_OPEN source=landing, chips>=1, chipSvg=true, rowVisible=true)');

    // ── launchCity → second event ────────────────────────────────────────
    await page.evaluate(() => { if (window.launchCity) launchCity(); });
    await sleep(300);
    const afterCity = await page.evaluate(() => { var arr = []; try { arr = JSON.parse(localStorage.getItem('bim.docHistory') || '[]'); } catch (e) {} return { n: arr.length, types: arr.map(e => e.type) }; });
    console.log('after launchCity: ' + JSON.stringify(afterCity) + ' (want CITY_LAUNCH appended)');

    // ── cross-tab: a VIEWER-sourced entry + storage event → union re-renders ─
    const afterMirror = await page.evaluate(() => {
      var arr = JSON.parse(localStorage.getItem('bim.docHistory') || '[]');
      arr.push({ ts: Date.now(), source: 'viewer', type: 'BUILDING_OPEN', label: 'Ifc2x3_Duplex_Federated' });
      localStorage.setItem('bim.docHistory', JSON.stringify(arr));
      // simulate the cross-tab storage event the browser fires in OTHER tabs
      window.dispatchEvent(new StorageEvent('storage', { key: 'bim.docHistory' }));
      var line = document.getElementById('doc-history-line');
      return { chips: line ? line.children.length : -1, lastTitle: line && line.lastElementChild ? line.lastElementChild.getAttribute('title') : null };
    });
    console.log('--- §8 cross-tab union (viewer entry + storage event) ---');
    console.log(JSON.stringify(afterMirror) + ' (want chips grew, lastTitle starts "viewer · ")');

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
})();
