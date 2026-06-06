// probe_history_cache.js — witness HISTORY_SCRUB_FIX §9 (Cache Info panel) + §8 viewer→landing
// mirror. Drives the REAL viewer on Duplex. Leak-safe.
//   §9: Settings ▸ Cache Info builds rows (kernel/history/localStorage/IndexedDB/SW); clearing the
//       HISTORY view cache leaves the signed kernel chain intact (§CACHE_CLEAR_CHAIN_OK ok=true).
//   §8: the viewer mirrors BUILDING_OPEN into localStorage 'bim.docHistory' (for the landing line).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8148;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0; }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 60000 }).catch(() => {});
    await sleep(1500);

    // ── §8 viewer→landing mirror: BUILDING_OPEN written to bim.docHistory ──
    const mirror = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('bim.docHistory') || '[]'); } catch (e) { return 'err'; } });
    console.log('--- §8 viewer mirror (bim.docHistory) ---');
    console.log(JSON.stringify(mirror) + ' (want a {source:viewer,type:BUILDING_OPEN} entry)');

    // ── §9 open Settings, expand Cache Info ──────────────────────────────
    await page.evaluate(() => { if (window._openSettingsPanel) window._openSettingsPanel(); });
    await sleep(500);
    const expanded = await page.evaluate(() => {
      var p = document.getElementById('settings-panel');
      if (!p) return 'no-panel';
      var hd = Array.from(p.querySelectorAll('div')).find(d => d.textContent.trim() === 'Cache Info' || (d.querySelector && d.textContent.indexOf('Cache Info') === 0));
      // click the section header to expand
      var headers = Array.from(p.querySelectorAll('span')).filter(s => s.textContent === 'Cache Info');
      if (headers.length) { headers[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return 'clicked-header'; }
      return 'no-header';
    });
    console.log('Cache Info expand: ' + expanded);
    await sleep(700);
    console.log('§CACHE_INFO built: ' + (logs.filter(l => l.includes('§CACHE_INFO')).join(' | ') || '(none)'));

    const rows = await page.evaluate(() => {
      var p = document.getElementById('settings-panel');
      if (!p) return [];
      // rows live in the Cache Info section body — read label+size pairs
      var spans = Array.from(p.querySelectorAll('span'));
      var out = [];
      ['Kernel log (signed)', 'History view cache', 'Settings (localStorage)', 'Imported buildings (IndexedDB)', 'Offline app cache (SW)'].forEach(function (lbl) {
        var el = spans.find(s => s.textContent === lbl);
        if (el && el.nextSibling) out.push({ label: lbl, size: (el.nextSibling.textContent || '').trim() });
      });
      return out;
    });
    console.log('--- §9 Cache Info rows ---');
    console.log(JSON.stringify(rows, null, 0));

    // ── clear the HISTORY view cache → chain must stay intact ────────────
    const chainBefore = await page.evaluate(async () => { const A = window.A || window.APP; var r = await KernelOps.verifyChain(A.db); return r && r.ok; });
    const histCleared = await page.evaluate(() => {
      var p = document.getElementById('settings-panel');
      var spans = Array.from(p.querySelectorAll('span'));
      var lbl = spans.find(s => s.textContent === 'History view cache');
      if (!lbl) return 'no-row';
      // the Clear button is the 3rd child of the row
      var row = lbl.parentElement;
      var btn = row.querySelector('button');
      if (!btn) return 'no-btn';
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return 'clicked-clear';
    });
    await sleep(800);
    const chainAfter = await page.evaluate(async () => { const A = window.A || window.APP; var r = await KernelOps.verifyChain(A.db); return r && r.ok; });
    const histLen = await page.evaluate(() => window.UniversalHistory ? UniversalHistory.list().length : -1);
    console.log('--- §9 history-clear keeps kernel ---');
    console.log('clear=' + histCleared + ' chain before/after=' + chainBefore + '/' + chainAfter + ' histStepsAfter=' + histLen);
    console.log('§CACHE_CLEAR_CHAIN_OK: ' + (logs.filter(l => l.includes('§CACHE_CLEAR_CHAIN_OK')).join(' | ') || '(none)'));

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
})();
