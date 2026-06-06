// probe_universal_history.js — witness UNIVERSAL_HISTORY: ONE merged op|view timeline.
// Drives the REAL viewer on Duplex (non-split, fast). Witnesses, in order:
//   1. §UNIVERSAL_HISTORY_LOADED + §HIST_WRAP (module up, commitOp wrapped).
//   2. The OLD grid bar #undo-redo-btns is GONE (querySelector null).
//   3. MIXED merged push: a Find GROUP select + ITEM select (kind=view) interleaved with a
//      GRID_MOVE commit (kind=op) → §HIST_PUSH lists BOTH in time order, kind=op|view.
//   4. §GATE significance: an audit op (SESSION_START) is DROPPED (§HIST_DROP not-significant);
//      a rapid second identical GRID_MOVE is DROPPED (§HIST_DROP coalesced).
//   5. Merged undo steps back through the stream: a view step → §VIEWLOG_RESTORE; a model-op
//      step → KernelOps.undoOp flips `undone`; verifyChain still PASSES (§HIST_CHAIN_OK ok=true).
//   6. Pill icon opens the bar (#universal-hist-btns visible, §HIST_OPEN); Help entry present.
//   7. Off-toggle hides bar + stops recording + persists across reload.
// SW BLOCKED. Leak-safe (caller kills chrome).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
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

    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(2000);

    // clean toggle state
    await page.evaluate(() => { try { localStorage.removeItem('bim.universalHist.on'); } catch(e){} });

    // ── 1. module loaded + wrapped ───────────────────────────────────────
    console.log('LOADED: ' + (logs.some(l => l.includes('§UNIVERSAL_HISTORY_LOADED')) ? 'yes' : 'NO'));
    console.log('WRAP:   ' + (logs.some(l => l.includes('§HIST_WRAP')) ? 'yes' : 'NO'));

    // ── 2. OLD grid bar gone ─────────────────────────────────────────────
    const oldBar = await page.evaluate(() => !!document.getElementById('undo-redo-btns'));
    console.log('OLD #undo-redo-btns present (want false): ' + oldBar);

    // ── 6a. pill opens the universal bar (call the API the pill calls) ────
    await page.evaluate(() => { if (window.UniversalHistory) UniversalHistory.open(); });
    await sleep(300);
    const barOpen = await page.evaluate(() => {
      const b = document.getElementById('universal-hist-btns');
      return b ? b.style.display : 'no-bar';
    });
    console.log('UNIVERSAL bar after open (want flex): ' + barOpen);

    // ── 3a. view ops: open Find, GROUP select then ITEM select ───────────
    await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
    await sleep(1200);
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (rows.length) rows[0].children[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await sleep(1700);
    // expand the group (arrow) so leaf rows render, then ITEM select a leaf
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (rows.length) rows[0].children[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await sleep(1000);
    await page.evaluate(() => {
      const leaves = [];
      document.querySelectorAll('#find-tree div').forEach(d => {
        if (!d.hasAttribute || d.hasAttribute('data-find-parent')) return;
        if (d.children && d.children.length === 3 && d.children[1] && d.children[1].textContent) leaves.push(d);
      });
      if (leaves.length) leaves[0].children[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await sleep(1700);

    // ── 3b. model op: commit a GRID_MOVE through the wrapped commitOp ─────
    await page.evaluate(() => {
      const A = window.A || window.APP;
      KernelOps.commitOp(A.db, 'GRID_MOVE', { axis: 'X', label: 'A', from: 0, to: 1000, cascade: [] });
    });
    await sleep(300);

    // ── 4a. audit op DROPPED by the gate ─────────────────────────────────
    await page.evaluate(() => {
      const A = window.A || window.APP;
      KernelOps.commitOp(A.db, 'SESSION_START', { note: 'audit' });
    });
    await sleep(200);

    // ── 4b. rapid identical GRID_MOVE → coalesced (dropped) ──────────────
    await page.evaluate(() => {
      const A = window.A || window.APP;
      KernelOps.commitOp(A.db, 'GRID_MOVE', { axis: 'X', label: 'A', from: 1000, to: 1200, cascade: [] });
    });
    await sleep(300);

    console.log('--- §HIST_PUSH (merged, time order) ---');
    console.log(logs.filter(l => l.includes('§HIST_PUSH')).join('\n'));
    console.log('--- §HIST_DROP (curation) ---');
    console.log(logs.filter(l => l.includes('§HIST_DROP')).join('\n'));

    const listSnap = await page.evaluate(() => UniversalHistory.list());
    console.log('--- §HIST_LIST ---');
    console.log(logs.filter(l => l.includes('§HIST_LIST')).slice(-1).join('\n'));
    console.log('STREAM kinds: ' + JSON.stringify(listSnap.map(e => e.kind)));

    // ── 5. merged undo: op step (verifyChain) then view step ─────────────
    const undoneBefore = await page.evaluate(() => {
      const A = window.A || window.APP;
      const r = A.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE undone=1");
      return r.length ? r[0].values[0][0] : -1;
    });
    await page.evaluate(() => UniversalHistory.undo()); // undoes the GRID_MOVE (tip = op)
    await sleep(800);
    const undoneAfter = await page.evaluate(() => {
      const A = window.A || window.APP;
      const r = A.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE undone=1");
      return r.length ? r[0].values[0][0] : -1;
    });
    console.log('undone count before/after op-undo: ' + undoneBefore + ' → ' + undoneAfter +
      ' (want +1)');
    await sleep(1200); // let the async chainCheck resolve
    console.log('--- §HIST_CHAIN_OK ---');
    console.log(logs.filter(l => l.includes('§HIST_CHAIN_OK') || l.includes('§HIST_CHAIN_ERR')).join('\n'));

    await page.evaluate(() => UniversalHistory.undo()); // undoes the ITEM view → restore prior view
    await sleep(1800);
    await page.evaluate(() => UniversalHistory.undo()); // undoes the GROUP view
    await sleep(1800);
    console.log('--- §HIST_UNDO ---');
    console.log(logs.filter(l => l.includes('§HIST_UNDO')).join('\n'));
    console.log('--- §VIEWLOG_RESTORE (driven by merged undo) ---');
    console.log(logs.filter(l => l.includes('§VIEWLOG_RESTORE')).join('\n'));

    // ── 6b. Help entry present (pill registry action id=history) ──────────
    const helpHas = await page.evaluate(() => {
      // The pill/help list is declarative; the History action wires an icon + children.
      // Witness via the rendered help/command palette if present, else the registered shortcut.
      const byShortcut = !!(window._shortcuts && (window._shortcuts['z'] || window._shortcuts['Z']));
      return { byShortcut };
    });
    console.log('HELP/shortcut z registered: ' + JSON.stringify(helpHas));

    // ── 7. OFF toggle hides + stops recording + persists ─────────────────
    await page.evaluate(() => UniversalHistory.setEnabled(false));
    await sleep(300);
    const barAfterOff = await page.evaluate(() => {
      const b = document.getElementById('universal-hist-btns');
      return b ? b.style.display : 'no-bar';
    });
    const pushBeforeOff = logs.filter(l => l.includes('§HIST_PUSH')).length;
    await page.evaluate(() => {
      const A = window.A || window.APP;
      KernelOps.commitOp(A.db, 'GRID_MOVE', { axis: 'Y', label: 'B', from: 0, to: 500, cascade: [] });
    });
    await sleep(300);
    const pushAfterOff = logs.filter(l => l.includes('§HIST_PUSH')).length;
    console.log('BAR after OFF (want none): ' + barAfterOff);
    console.log('OFF push delta (want 0): ' + (pushAfterOff - pushBeforeOff));
    const lsVal = await page.evaluate(() => { try { return localStorage.getItem('bim.universalHist.on'); } catch(e){ return 'err'; } });
    console.log('localStorage after OFF (want off): ' + lsVal);

    // reload → persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('RELOAD_WAIT_FAIL ' + e.message));
    await sleep(1500);
    const enabledAfterReload = await page.evaluate(() => window.UniversalHistory && UniversalHistory.isEnabled());
    console.log('isEnabled after reload (want false — persisted OFF): ' + enabledAfterReload);

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');

    await ctx.close();
  } finally {
    await browser.close();
  }
})();
