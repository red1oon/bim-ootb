// probe_terminal_material.js — end-to-end: tap a material on injected Terminal → element-precise
// overlay boxes from element_transforms == DB element count for that material.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Terminal_extracted.db&bld=Terminal`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding && A.scene; }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await sleep(4000); // let some geometry stream so x-ray has meshes
  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-axis-material'), { timeout: 10000 }).catch(e => console.log('NO_MATERIAL_PILL ' + e.message));
  await page.evaluate(() => document.getElementById('find-axis-material').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await sleep(800);
  const sel = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const row = Array.from(tree.children).find(el => !el.querySelector('button') && el.children && el.children[1]);
    if (!row) return { err: 'no material row' };
    const label = row.children[1].textContent;
    (row.children[1]).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { label };
  });
  await sleep(1200);
  const probe = await page.evaluate((label) => {
    const A = window.A || window.APP;
    let boxes = 0; A.scene.traverse(o => { if (o.userData && o.userData._hlOverlay) boxes = o.count; });
    const m = label.replace(/\s*\(\d+\)\s*$/, '');
    const q = (sql, p) => { try { const r = A.db.exec(sql, p); return r.length ? r[0].values[0][0] : 0; } catch (e) { return -1; } };
    return { boxes, dbCount: q("SELECT COUNT(*) FROM elements_meta WHERE material_name = ?", [m]), withXform: q("SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.material_name = ?", [m]) };
  }, sel.label);
  console.log('MATERIAL_TAP: ' + JSON.stringify(sel));
  console.log('TERMINAL_MAT_E2E: ' + JSON.stringify(probe) +
    '  → ' + (probe.boxes > 0 && probe.boxes === probe.withXform ? 'ELEMENT-PRECISE OK (boxes==elems-with-transform)' : 'CHECK'));
  console.log('--- §HL_OVERLAY / §MAT_SELECT ---');
  console.log(logs.filter(l => /§HL_OVERLAY|§MAT_SELECT|PAGEERROR/.test(l)).slice(-5).join('\n'));
  await browser.close();
})();
