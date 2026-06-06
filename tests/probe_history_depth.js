// probe_history_depth.js — witness HISTORY_SCRUB_FIX §6: the 3-state recording-depth toggle.
//   BLUE 'all'  → ELEMENT_PICK + Find-nav + milestones all RECORDED.
//   GREEN 'doc' → ELEMENT_PICK + axis/group/item DROPPED (profile=doc); GRID_MOVE/BUILDING_OPEN KEPT.
//   GREY 'off'  → everything dropped (profile=off); bar shows only the depth toggle.
//   Choice PERSISTS across reload. Icon glyph/colour reflects depth. Leak-safe.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8147;
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
    await sleep(2000);
    await page.evaluate(() => { try { localStorage.removeItem('bim.universalHist.depth'); } catch(e){} });
    await page.evaluate(() => { if (window.UniversalHistory) { UniversalHistory.setDepth('all'); UniversalHistory.open(); } });
    await sleep(300);

    function pick(label) {
      return page.evaluate((label) => {
        const A = window.A || window.APP;
        KernelOps.commitOp(A.db, 'ELEMENT_PICK', { cls: 'IfcDoor', name: label, disc: 'ARC', storey: '01' }, ['g-' + label]);
      }, label);
    }
    function grid(label) {
      return page.evaluate((label) => {
        const A = window.A || window.APP;
        KernelOps.commitOp(A.db, 'GRID_MOVE', { axis: 'X', label: label, from: 0, to: 100, cascade: [] });
      }, label);
    }
    const depth = () => page.evaluate(() => UniversalHistory.getDepth());
    const offGlyph = () => page.evaluate(() => { var b = document.getElementById('hist-off'); return b ? { g: b.textContent, c: b.style.color } : null; });
    const pushCount = () => logs.filter(l => l.includes('§HIST_PUSH')).length;

    // ── BLUE 'all' — a pick is RECORDED ──────────────────────────────────
    console.log('depth default (want all): ' + (await depth()));
    var n0 = pushCount();
    await pick('blue1'); await sleep(150);
    console.log('BLUE pick recorded (want +1): delta=' + (pushCount() - n0) + ' glyph=' + JSON.stringify(await offGlyph()));

    // ── GREEN 'doc' — pick DROPPED, GRID_MOVE KEPT ───────────────────────
    await page.evaluate(() => UniversalHistory.setDepth('doc')); await sleep(150);
    console.log('depth now (want doc): ' + (await depth()) + ' glyph=' + JSON.stringify(await offGlyph()));
    var n1 = pushCount();
    await pick('green_pick'); await sleep(150);
    var afterPick = pushCount();
    await grid('green_grid'); await sleep(150);
    var afterGrid = pushCount();
    console.log('DOC: pick delta (want 0): ' + (afterPick - n1) + ' | grid delta (want +1): ' + (afterGrid - afterPick));
    console.log('§HIST_DROP profile=doc present: ' + logs.some(l => l.includes('§HIST_DROP') && l.includes('profile=doc') && l.includes('ELEMENT_PICK')));

    // ── GREY 'off' — everything DROPPED, bar still shows the toggle ───────
    await page.evaluate(() => UniversalHistory.setDepth('off')); await sleep(150);
    console.log('depth now (want off): ' + (await depth()) + ' glyph=' + JSON.stringify(await offGlyph()));
    var n2 = pushCount();
    await grid('off_grid'); await sleep(150);
    console.log('OFF: grid delta (want 0): ' + (pushCount() - n2));
    const barOff = await page.evaluate(() => {
      const bar = document.getElementById('universal-hist-btns'), off = document.getElementById('hist-off'), marks = document.getElementById('hist-marks');
      return { barVisible: bar && getComputedStyle(bar).display !== 'none', offVisible: off && getComputedStyle(off).display !== 'none', marksHidden: marks && getComputedStyle(marks).display === 'none' };
    });
    console.log('OFF bar state (want barVisible+offVisible true, marksHidden true): ' + JSON.stringify(barOff));

    // ── persistence across reload ────────────────────────────────────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.meshCache && Object.keys(A.meshCache).length > 0; }, { timeout: 180000 }).catch(e => console.log('RELOAD_WAIT_FAIL ' + e.message));
    await sleep(1500);
    console.log('depth after reload (want off — persisted): ' + (await page.evaluate(() => window.UniversalHistory && UniversalHistory.getDepth())));

    // ── cycle all→doc→off→all ────────────────────────────────────────────
    await page.evaluate(() => UniversalHistory.setDepth('all'));
    const cyc = [];
    for (var i = 0; i < 3; i++) { await page.evaluate(() => UniversalHistory.cycleDepth()); cyc.push(await page.evaluate(() => UniversalHistory.getDepth())); }
    console.log('cycle from all (want doc,off,all): ' + JSON.stringify(cyc));

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');
    await ctx.close();
  } finally {
    await browser.close();
  }
})();
