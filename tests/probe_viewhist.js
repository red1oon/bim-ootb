// probe_viewhist.js — witness §VIEWLOG: Find-lens view-history undo/redo + off-toggle.
// Drives the REAL find-panel DOM on Duplex (non-split, fast): open Find → tap a storey
// row (GROUP) → expand → tap a type-leaf child (ITEM) → change axis (#find-axis-toggle).
// Asserts §VIEWLOG_PUSH fires exactly 3× (group,item,axis), NOT on expand. Then presses
// back: §VIEWLOG_RESTORE, re-reads overlay opacities (group→1.0 / item→0.5+cyan) + camera
// moved, and confirms restore pushes NO new entry. Then toggles OFF (bar hidden, no push)
// and reloads to confirm localStorage persistence. SW BLOCKED. Leak-safe (caller kills).
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

    // helpers
    await page.evaluate(() => {
      window.__tap = (el, mods) => { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ bubbles: true, cancelable: true }, mods || {}))); };
      window.__overlays = () => {
        const A = window.A || window.APP; const out = [];
        A.scene.traverse(o => { if (o.userData && o.userData._shapeOverlay && o.material) {
          const m = o.material; out.push({ opacity: +m.opacity.toFixed(3), color: m.color ? '#' + m.color.getHexString() : null }); } });
        return out;
      };
      window.__cam = () => { const A = window.A || window.APP; const p = A.camera.position; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; };
      window.__bar = () => { const b = document.getElementById('find-viewhist-btns'); return b ? b.style.display : 'no-bar'; };
    });

    // Start clean: ensure localStorage default ON for this run
    await page.evaluate(() => { try { localStorage.removeItem('bim.findViewHist.on'); } catch(e){} });

    // open Find
    await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
    await sleep(1200);
    const cam0 = await page.evaluate(() => window.__cam());
    console.log('BAR_AFTER_OPEN: ' + await page.evaluate(() => window.__bar()));

    // ---- GROUP select: tap first top-level storey row text ----
    const grp = await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (!rows.length) return { err: 'no parent rows' };
      window.__tap(rows[0].children[1]);
      return { row: rows[0].getAttribute('data-find-parent'), rows: rows.length };
    });
    console.log('GROUP_TAP: ' + JSON.stringify(grp));
    await sleep(1700);
    const grpOverlays = await page.evaluate(() => window.__overlays());
    const camG = await page.evaluate(() => window.__cam());
    console.log('GROUP_OVERLAYS opac=' + JSON.stringify(grpOverlays.map(o => o.opacity).slice(0, 6)) + ' n=' + grpOverlays.length);

    // ---- EXPAND (must NOT push) ----
    const pushBeforeExpand = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      window.__tap(rows[0].children[0]); // arrow = expand
    });
    await sleep(1300);
    const pushAfterExpand = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    console.log('EXPAND push delta (want 0): ' + (pushAfterExpand - pushBeforeExpand));

    // ---- ITEM select: tap first type-leaf child ----
    const item = await page.evaluate(() => {
      const leaves = [];
      document.querySelectorAll('#find-tree div').forEach(d => {
        if (!d.hasAttribute || d.hasAttribute('data-find-parent')) return;
        if (d.children && d.children.length === 3 && d.children[1] && d.children[1].textContent) leaves.push(d);
      });
      if (!leaves.length) return { err: 'no leaf rows' };
      const label = leaves[0].children[1].textContent;
      window.__tap(leaves[0].children[1]);
      return { label };
    });
    console.log('ITEM_TAP: ' + JSON.stringify(item));
    await sleep(1800);
    const itemOverlays = await page.evaluate(() => window.__overlays());
    const camI = await page.evaluate(() => window.__cam());
    console.log('ITEM_OVERLAYS opac=' + JSON.stringify(itemOverlays.map(o => o.opacity).slice(0, 8)) +
      ' cyan=' + itemOverlays.some(o => o.color === '#4fc3f7') + ' n=' + itemOverlays.length);

    // ---- AXIS change ----
    await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); if (b) window.__tap(b); });
    await sleep(1300);
    const pushCount = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    console.log('PUSH_COUNT (want 3): ' + pushCount);
    console.log('--- §VIEWLOG_PUSH lines ---');
    console.log(logs.filter(l => l.includes('§VIEWLOG_PUSH')).join('\n'));

    // ---- BACK button: restore (should go from axis-view back to item-view) ----
    const pushBeforeBack = pushCount;
    await page.evaluate(() => { const b = document.getElementById('find-vh-back'); if (b) window.__tap(b); });
    await sleep(2000);
    const camBack1 = await page.evaluate(() => window.__cam());
    const overlaysBack1 = await page.evaluate(() => window.__overlays());
    console.log('AFTER_BACK1 overlays opac=' + JSON.stringify(overlaysBack1.map(o => o.opacity).slice(0, 8)) +
      ' cyan=' + overlaysBack1.some(o => o.color === '#4fc3f7'));
    // back again → group view
    await page.evaluate(() => { const b = document.getElementById('find-vh-back'); if (b) window.__tap(b); });
    await sleep(2000);
    const overlaysBack2 = await page.evaluate(() => window.__overlays());
    const camBack2 = await page.evaluate(() => window.__cam());
    console.log('AFTER_BACK2 overlays opac=' + JSON.stringify(overlaysBack2.map(o => o.opacity).slice(0, 8)) +
      ' allSolid=' + overlaysBack2.every(o => o.opacity >= 0.99) + ' n=' + overlaysBack2.length);
    const pushAfterBack = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    console.log('RESTORE push delta (want 0): ' + (pushAfterBack - pushBeforeBack));
    console.log('--- §VIEWLOG_RESTORE lines ---');
    console.log(logs.filter(l => l.includes('§VIEWLOG_RESTORE')).join('\n'));
    console.log('CAM moved on restore: group=' + JSON.stringify(camBack2) + ' vs item=' + JSON.stringify(camI) +
      ' moved=' + (JSON.stringify(camBack2) !== JSON.stringify(camI)));

    // ---- OFF toggle ----
    await page.evaluate(() => { const b = document.getElementById('find-vh-off'); if (b) window.__tap(b); });
    await sleep(400);
    const barAfterOff = await page.evaluate(() => window.__bar());
    console.log('BAR_AFTER_OFF (want none): ' + barAfterOff);
    const pushBeforeOffSelect = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    // a further select must NOT push
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (rows.length) window.__tap(rows[0].children[1]);
    });
    await sleep(1500);
    const pushAfterOffSelect = logs.filter(l => l.includes('§VIEWLOG_PUSH')).length;
    console.log('OFF select push delta (want 0): ' + (pushAfterOffSelect - pushBeforeOffSelect));
    const lsVal = await page.evaluate(() => { try { return localStorage.getItem('bim.findViewHist.on'); } catch(e) { return 'err'; } });
    console.log('localStorage after OFF (want off): ' + lsVal);

    // ---- RELOAD: persistence ----
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('RELOAD_WAIT_FAIL ' + e.message));
    await sleep(1500);
    await page.evaluate(() => { window.__bar = () => { const b = document.getElementById('find-viewhist-btns'); return b ? b.style.display : 'no-bar'; }; });
    await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
    await sleep(1200);
    const barAfterReload = await page.evaluate(() => window.__bar());
    const lsAfterReload = await page.evaluate(() => { try { return localStorage.getItem('bim.findViewHist.on'); } catch(e) { return 'err'; } });
    console.log('BAR_AFTER_RELOAD_OPEN (want none — still off): ' + barAfterReload + ' ls=' + lsAfterReload);

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');

    await ctx.close();
  } finally {
    await browser.close();
  }
})();
