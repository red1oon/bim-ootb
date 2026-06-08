// WITNESS: 2D saved-card delete must survive reload. project_2d_regression #3.
// Repro of the real bug: kernel_ops flushes the WHOLE in-memory building DB (incl saved_sections)
// to IndexedDB on any op; card delete mutates the DB directly (NOT via a kernel op) so it never
// flushes; loadSavedSections is DB-first → on reload it reads the stale cached rows and ignores
// the fresh localStorage → the deleted card REAPPEARS.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8161;
const BLD = process.env.BLD || 'Duplex';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function enter2D(page) {
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 120000 });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 90000 }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => { if (window.toggleGridOverlay) window.toggleGridOverlay(); });
  await sleep(2500);
}
function readCards() {
  const body = document.getElementById('grid-panel-body');
  const cards = body ? Array.from(body.querySelectorAll('.saved-section-btn')) : [];
  return cards.map(c => ({ id: c.getAttribute('data-id'), name: (c.textContent || '').trim().slice(0, 12) }));
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    // PERSIST service workers off but keep a persistent context dir so IndexedDB survives reload
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERR: ' + e.message));

    page.on('framenavigated', () => logs.push('NAV'));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await enter2D(page);
    let cards = await page.evaluate(readCards);
    console.log('§W1 after-autocreate cards=' + JSON.stringify(cards));
    const gf = cards.find(c => c.name === 'GF');
    if (!gf) { console.log('ABORT: no GF card'); await ctx.close(); return; }

    // force a kernel-op so the building DB (with GF+L1) is flushed to IndexedDB (debounced 2s)
    await page.evaluate(() => { const A = window.A || window.APP; if (window.KernelOps) KernelOps.commitOp(A.db, 'ELEMENT_PICK', { cls: 'IfcWall', name: 'probe' }, ['g1']); });
    await sleep(3200);
    const persisted = logs.some(l => l.includes('§KRN_PERSIST'));
    console.log('§W2 kernel flush to IDB fired=' + persisted);

    // delete GF via its ✕ button (no kernel op follows → IDB NOT updated)
    await page.evaluate((id) => {
      const body = document.getElementById('grid-panel-body');
      const del = body.querySelector('.saved-section-del[data-id="' + id + '"]');
      if (del) del.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, gf.id);
    await sleep(800);
    cards = await page.evaluate(readCards);
    console.log('§W3 in-session after-delete cards=' + JSON.stringify(cards) + '  (GF gone? ' + !cards.some(c => c.name === 'GF') + ')');

    // in-session CLOSE + REOPEN panel (the other reading of "reopened")
    await page.evaluate(() => { if (window.toggleGridOverlay) window.toggleGridOverlay(); }); // off
    await sleep(400);
    await page.evaluate(() => { if (window.toggleGridOverlay) window.toggleGridOverlay(); }); // on
    await sleep(1500);
    cards = await page.evaluate(readCards);
    console.log('§W3b in-session REOPEN cards=' + JSON.stringify(cards) + '  (GF back? ' + cards.some(c => c.name === 'GF') + ')');

    // delete the REMAINING card(s) → all-deleted (autoCreate-suppression path, the strongest reappear case)
    await page.evaluate(() => {
      const body = document.getElementById('grid-panel-body');
      body.querySelectorAll('.saved-section-del').forEach(d => d.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    });
    await sleep(800);
    cards = await page.evaluate(readCards);
    console.log('§W3c after-delete-ALL cards=' + JSON.stringify(cards) + '  (empty? ' + (cards.length === 0) + ')');

    // RELOAD — the real test (do all cards come BACK via autoCreate?)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await enter2D(page);
    cards = await page.evaluate(readCards);
    const gfBack = cards.some(c => c.name === 'GF');
    console.log('§W4 AFTER-RELOAD cards=' + JSON.stringify(cards));
    console.log('§W4 RESULT any-card-reappeared=' + (cards.length > 0) + '  GF-reappeared=' + gfBack + '  (want 0 cards)  ' + (cards.length ? 'BUG' : 'OK'));
    console.log('--- §SAVE_SECTION / KRN lines ---');
    console.log(logs.filter(l => /SAVE_SECTION loaded|reconcile|KRN_PERSIST|KRN_SEAL|KERNEL_OP committed/.test(l)).slice(-10).join('\n'));
    console.log('--- pageerrors ---');
    console.log(logs.filter(l => l.startsWith('PAGEERR')).slice(0, 5).join('\n') || '(none)');
    await ctx.close();
  } catch (e) { console.log('FATAL: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0,4).join('\n')); }
  finally { await browser.close(); }
})();
