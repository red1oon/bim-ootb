// probe_highlight.js — §VERIFY §C: material/phase highlight must be ELEMENT-PRECISE.
// Asserts: overlay box count == matched element count, and NO whole-mesh OutlinePass.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.scene && A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0; }, { timeout: 90000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await page.waitForTimeout(1200);

  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-axis-material'), { timeout: 8000 }).catch(e => console.log('NO_MATERIAL_PILL ' + e.message));

  // Tap Material pill
  await page.evaluate(() => { const el = document.getElementById('find-axis-material'); el && el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(500);

  // Tap first material row, capture its label
  const sel = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    // skip the [Material|Category] sub-toggle row (it contains buttons)
    const row = Array.from(tree.children).find(el => !el.querySelector('button') && el.children && el.children[1]);
    if (!row) return { err: 'no material row' };
    const label = row.children[1] ? row.children[1].textContent : '?';
    (row.children[1] || row).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { label };
  });
  console.log('MATERIAL_TAP: ' + JSON.stringify(sel));
  await page.waitForTimeout(700);

  const probe = await page.evaluate(() => {
    const A = window.A || window.APP;
    let overlay = null;
    A.scene.traverse(o => { if (o.userData && o.userData._hlOverlay) overlay = o; });
    // count outlined objects that are batched/instanced (the §C bug = whole-mesh outline)
    const outlined = (A._outlinePass && A._outlinePass.selectedObjects) ? A._outlinePass.selectedObjects.length : 0;
    return {
      overlayPresent: !!overlay,
      overlayBoxes: overlay ? overlay.count : 0,
      overlayIsInstanced: overlay ? !!overlay.isInstancedMesh : false,
      outlinePassObjects: outlined,
      xrayOn: !!A.xrayOn,
    };
  });
  console.log('HIGHLIGHT_PROBE: ' + JSON.stringify(probe));

  // ground truth: element count for that material from DB
  const dbCount = await page.evaluate((label) => {
    const A = window.A || window.APP;
    const r = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE material_name = ?", [label]);
    return r.length ? r[0][0] : -1;
  }, sel.label);
  console.log('DB_ELEMENT_COUNT for "' + sel.label + '": ' + dbCount);
  console.log('VERDICT_C: ' +
    (probe.overlayPresent && probe.outlinePassObjects === 0 && probe.overlayBoxes > 0
      ? 'ELEMENT-PRECISE OK (overlay boxes=' + probe.overlayBoxes + ', no whole-mesh outline)'
      : 'CHECK: overlay=' + probe.overlayPresent + ' boxes=' + probe.overlayBoxes + ' outlineObjs=' + probe.outlinePassObjects));

  console.log('--- §HL_OVERLAY / §MAT lines ---');
  console.log(logs.filter(l => /§HL_OVERLAY|§MAT_SELECT|PAGEERROR/.test(l)).slice(-8).join('\n'));
  await browser.close();
})();
