// probe_toggle.js — §RULE1: axis bar must hold ONE toggle that cycles modes on each tap.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.scene && A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0; }, { timeout: 90000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await sleep(1200);
  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-outliner-bar'), { timeout: 8000 }).catch(e => {});
  await sleep(400);

  const btnCount = () => page.evaluate(() => document.getElementById('find-outliner-bar').querySelectorAll('button').length);
  const curAxis = () => page.evaluate(() => { const b = document.querySelector('#find-axis-toggle'); return b ? b.getAttribute('data-axis') : '(none)'; });
  const treeVisible = () => page.evaluate(() => { const t = document.getElementById('find-tree'); return t && t.style.display !== 'none' && t.children.length > 0; });

  console.log('BUTTONS_IN_AXIS_BAR: ' + await btnCount() + ' (RULE1 expects 1)');
  const seq = [];
  for (let i = 0; i < 6; i++) {
    seq.push(await curAxis());
    await page.evaluate(() => document.getElementById('find-axis-toggle').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    await sleep(350);
  }
  console.log('CYCLE (6 taps): ' + seq.join(' → ') + ' → ' + await curAxis());
  console.log('TREE_VISIBLE_AT_CURRENT: ' + await treeVisible());
  console.log('VERDICT_RULE1: ' + (await btnCount() === 1 ? 'ONE toggle ✓' : 'FAIL multiple buttons'));
  console.log('--- §LENS_AXES ---');
  console.log(logs.filter(l => /§LENS_AXES/.test(l)).slice(-7).join('\n'));
  await browser.close();
})();
