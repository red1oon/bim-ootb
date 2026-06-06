// probe_real_ui.js — §VERIFY: drive the REAL Find UI (pointer taps), measure scene-state.
// Reproduces (or clears) REVIT_LENS_FIX §B: tap a Type leaf → does the rest actually hide?
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;

function sceneStateFn() {
  const A = window.A || window.APP;
  let instVis = 0, batVis = 0, regVis = 0, tot = 0;
  A.scene.traverse(function(o) {
    if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
      A._batchMeta[o.id].forEach(function(m) { tot++; let v = true; try { v = o.getVisibleAt(m.slotId); } catch (e) {} if (v && o.visible) batVis++; });
    } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
      const M = new (window.THREE.Matrix4)();
      A._instanceMeta[o.id].forEach(function(m, i) { tot++; o.getMatrixAt(i, M); const hidden = (M.elements[0] === 0 && M.elements[5] === 0 && M.elements[10] === 0); if (!hidden && o.visible) instVis++; });
    } else if (o.isMesh && o.userData && o.userData.guid !== undefined) { tot++; if (o.visible) regVis++; }
  });
  return { instVis, batVis, regVis, totVis: instVis + batVis + regVis, tot };
}
const click = (el) => el && el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.scene && A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0; }, { timeout: 90000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await page.waitForTimeout(1500);

  // Open Find (lazy-load navigate first)
  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-axis-storey'), { timeout: 8000 }).catch(e => console.log('NO_STOREY_PILL ' + e.message));

  const beforeOpen = await page.evaluate(sceneStateFn);
  console.log('VISIBLE_AT_OPEN: ' + JSON.stringify(beforeOpen));

  // Tap Storey pill → reveals + builds tree
  await page.evaluate(() => { const el = document.getElementById('find-axis-storey'); el && el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(500);

  // Expand the first storey parent, then tap its first Type leaf.
  const drive = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const parents = tree.querySelectorAll('[data-find-parent]');
    if (!parents.length) return { err: 'no parents' };
    const p0 = parents[0];
    const arrow = p0.children[0];
    arrow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); // expand
    const cc = p0.nextElementSibling; // childContainer
    const leafRows = cc ? cc.querySelectorAll('div') : [];
    return { parentLabel: p0.getAttribute('data-find-parent'), leafCount: leafRows.length };
  });
  console.log('EXPAND: ' + JSON.stringify(drive));
  await page.waitForTimeout(400);

  // Tap the first leaf's TEXT span (children[1]) — this is the Type-leaf isolate tap.
  const tapped = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const p0 = tree.querySelectorAll('[data-find-parent]')[0];
    const cc = p0.nextElementSibling;
    const leaf = cc && cc.querySelector('div');
    if (!leaf) return { err: 'no leaf' };
    const label = leaf.children[1] ? leaf.children[1].textContent : '?';
    const txt = leaf.children[1] || leaf;
    txt.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { leafLabel: label };
  });
  console.log('TAP_LEAF: ' + JSON.stringify(tapped));
  await page.waitForTimeout(1000);

  const afterTap = await page.evaluate(sceneStateFn);
  console.log('VISIBLE_AFTER_LEAF_TAP: ' + JSON.stringify(afterTap));
  console.log('VERDICT: ' + (afterTap.totVis < beforeOpen.totVis * 0.9 ? 'HIDES OK (isolate worked)' : 'BUG-B CONFIRMED: rest NOT hidden (totVis unchanged)'));

  console.log('--- §FILTER / §FIND lines ---');
  console.log(logs.filter(l => /§FILTER|§FIND_TREE|§FIND_MODE|FILTER_ISOLATE|PAGEERROR/.test(l)).slice(-15).join('\n'));
  await browser.close();
})();
