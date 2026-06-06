// probe_phase.js — §VERIFY §D: Phase drill (phase→element) + zoom-to-fit at each level.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cam = page => page.evaluate(() => { const A = window.A || window.APP; const p = A.camera.position; return [p.x, p.y, p.z]; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const overlayBoxes = page => page.evaluate(() => { const A = window.A || window.APP; let n = 0; A.scene.traverse(o => { if (o.userData && o.userData._hlOverlay) n = o.count; }); return n; });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.scene && A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0; }, { timeout: 90000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await sleep(1200);
  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-axis-phase'), { timeout: 8000 }).catch(e => console.log('NO_PHASE_PILL ' + e.message));

  // Phase axis → triggers lazy timeline generation
  await page.evaluate(() => document.getElementById('find-axis-phase').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  // wait for phase rows
  await page.waitForFunction(() => {
    const tree = document.getElementById('find-tree');
    return tree && Array.from(tree.querySelectorAll('div')).some(d => d.children && d.children[1] && /\(\d+\)/.test(d.textContent));
  }, { timeout: 30000 }).catch(e => console.log('NO_PHASE_ROWS ' + e.message));
  await sleep(600);

  const phases = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    return Array.from(tree.querySelectorAll('[data-find-parent], :scope > *')).filter(el => el.children && el.children[1] && !el.querySelector('button')).map(el => el.children[1].textContent).slice(0, 8);
  });
  console.log('PHASES: ' + JSON.stringify(phases));

  // Tap first phase parent label → highlight + zoom
  const camP0 = await cam(page);
  await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const p0 = tree.querySelector(':scope > *:not(:has(button))') || tree.querySelectorAll('div')[0];
    // first row that is a parent (has arrow at children[0], label children[1])
    const rows = Array.from(tree.children).filter(el => el.children && el.children[1] && !el.querySelector('button'));
    const p = rows[0];
    (p.children[1]).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await sleep(1000);
  const camP1 = await cam(page);
  const phBoxes = await overlayBoxes(page);
  console.log('PHASE_TAP: overlayBoxes=' + phBoxes + ' camMoved=' + dist(camP0, camP1).toFixed(2) + (dist(camP0, camP1) > 0.5 ? ' ZOOM OK' : ' NO ZOOM'));

  // Expand first phase, tap first element leaf → highlight 1 + zoom
  const expand = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const rows = Array.from(tree.children).filter(el => el.children && el.children[1] && !el.querySelector('button'));
    const p = rows[0];
    p.children[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); // expand arrow
    const cc = p.nextElementSibling;
    const leafCount = cc ? cc.querySelectorAll('div').length : 0;
    return { leafCount };
  });
  await sleep(500);
  const camE0 = await cam(page);
  const elTap = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const rows = Array.from(tree.children).filter(el => el.children && el.children[1] && !el.querySelector('button'));
    const p = rows[0];
    const cc = p.nextElementSibling;
    const leaf = cc && cc.querySelector('div');
    if (!leaf) return { err: 'no element leaf' };
    const label = leaf.children[1] ? leaf.children[1].textContent : '?';
    (leaf.children[1] || leaf).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { label };
  });
  await sleep(1000);
  const camE1 = await cam(page);
  const elBoxes = await overlayBoxes(page);
  console.log('EXPAND leafCount=' + expand.leafCount);
  console.log('ELEM_TAP: ' + JSON.stringify(elTap) + ' overlayBoxes=' + elBoxes + ' camMoved=' + dist(camE0, camE1).toFixed(2) + (dist(camE0, camE1) > 0.5 ? ' ZOOM OK' : ' NO ZOOM'));

  console.log('--- §PHASE / §ELEM / §TASK lines ---');
  console.log(logs.filter(l => /§PHASE_LENS|§PHASE_SELECT|§PHASE_CHILDREN|§ELEM_SELECT|§HL_OVERLAY|PAGEERROR/.test(l)).slice(-12).join('\n'));
  await browser.close();
})();
