// WITNESS: kernel-op edits must survive a page reload (S243 §3.7 "refresh survives").
// Bug: kernel_ops._persistToIdb opens bim_ootb_cache at v1, but scene.js created it at v2 →
// open fires onerror (VersionError), onsuccess never runs → §KRN_PERSIST never fires →
// modified building DB never written back → reload loses the edit.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8161;
const BLD = process.env.BLD || 'Duplex';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MARKER = 'KRNTEST_' + (process.env.TAG || 'x');

async function ready(page) {
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 120000 });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 90000 }).catch(() => {});
  await sleep(1000);
}
function countMarker(m) {
  const A = window.A || window.APP;
  try {
    const r = A.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE parameters LIKE '%" + m + "%'");
    return (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
  } catch (e) { return 'ERR:' + e.message; }
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERR: ' + e.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await ready(page);
    // commit a distinctive kernel op
    await page.evaluate((m) => { const A = window.A || window.APP; KernelOps.commitOp(A.db, 'ELEMENT_PICK', { marker: m }, ['g1']); }, MARKER);
    await sleep(500);
    const before = await page.evaluate(countMarker, MARKER);
    console.log('§K1 marker committed in-session count=' + before);
    // wait out the 2s debounce + seal
    await sleep(3500);
    const persistFired = logs.some(l => l.includes('§KRN_PERSIST') && !l.includes('ERR'));
    const persistErr = logs.filter(l => /KRN_PERSIST_ERR|KRN_SEAL_ERR/.test(l));
    console.log('§K2 §KRN_PERSIST fired=' + persistFired + (persistErr.length ? ' errs=' + JSON.stringify(persistErr) : ''));

    // RELOAD — does the edit survive?
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    const after = await page.evaluate(countMarker, MARKER);
    console.log('§K3 AFTER-RELOAD marker count=' + after + '  → survived=' + (after && after !== 0 && !String(after).startsWith('ERR')) + (Number(after) > 0 ? '  OK' : '  (lost = persistence broken)'));
    console.log('--- KRN logs ---');
    console.log(logs.filter(l => /KRN_PERSIST|KRN_SEAL|KERNEL_OP committed|KERNEL_OPS_LOADED/.test(l)).slice(-8).join('\n'));
    console.log('--- pageerrors ---');
    console.log(logs.filter(l => l.startsWith('PAGEERR')).slice(0, 5).join('\n') || '(none)');
    await ctx.close();
  } catch (e) { console.log('FATAL: ' + e.message); }
  finally { await browser.close(); }
})();
