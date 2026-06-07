// probe_status_just.js — witness HISTORY_SCRUB_FIX §5b: the status row is JUST status; the old
// undo/redo arrows are gone; Backspace/\ route to the ONE universal timeline. Leak-safe.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8149;
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
    await page.evaluate(() => { try { localStorage.removeItem('bim.universalHist.depth'); } catch(e){} if (window.UniversalHistory) UniversalHistory.setDepth('all'); });

    // ── status row is JUST status (no ur-btn arrows) ─────────────────────
    const status = await page.evaluate(() => {
      var row = document.getElementById('status-row');
      return {
        undoBtn: !!document.getElementById('undo-btn'),
        redoBtn: !!document.getElementById('redo-btn'),
        urBtns: document.querySelectorAll('#status-row .ur-btn').length,
        rowChildren: row ? row.children.length : -1,
        onlyStatus: row ? (row.children.length === 1 && row.children[0].id === 'status') : false
      };
    });
    console.log('--- §5b status row ---');
    console.log(JSON.stringify(status) + ' (want undoBtn/redoBtn=false, urBtns=0, onlyStatus=true)');

    // record a pick so there is something to undo
    await page.evaluate(() => { const A = window.A || window.APP; KernelOps.commitOp(A.db, 'ELEMENT_PICK', { cls:'IfcDoor', name:'merk H', disc:'ARC', storey:'01' }, ['g1']); if (window.UniversalHistory) UniversalHistory.open(); });
    await sleep(300);
    const before = logs.filter(l => l.includes('§HIST_UNDO')).length;

    // ── Backspace routes to the universal timeline (not raw scene-undo) ──
    await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); });
    await sleep(400);
    const after = logs.filter(l => l.includes('§HIST_UNDO')).length;
    console.log('Backspace → §HIST_UNDO fired (want true): ' + (after > before));
    console.log('raw §UNDO type= (old path) fired (want false): ' + logs.some(l => /§UNDO type=/.test(l)));

    // scrub row still has its own undo/redo arrows
    const scrub = await page.evaluate(() => ({ back: !!document.getElementById('hist-back'), fwd: !!document.getElementById('hist-fwd') }));
    console.log('scrub row arrows present (want both true): ' + JSON.stringify(scrub));

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
})();
