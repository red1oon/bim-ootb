// probe_subtoggles.js — §VERIFY Room [Storey|Type] grouping + zoom, Material [Material|Category].
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function topGroups() {
  const tree = document.getElementById('find-tree');
  // top-level group rows are the parent rows (level 0) — they carry data-find-parent OR are the
  // bordered parent style. Grab their label spans (children[1]) excluding the sub-toggle row.
  const out = [];
  tree.querySelectorAll(':scope > *').forEach(el => {
    // skip the sub-toggle row (has buttons)
    if (el.querySelector('button')) return;
    const txt = el.children && el.children[1] ? el.children[1].textContent : null;
    if (txt) out.push(txt);
  });
  return out;
}

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
  await page.waitForFunction(() => document.getElementById('find-axis-room'), { timeout: 8000 }).catch(e => console.log('NO_ROOM_PILL ' + e.message));

  // ROOM axis
  await page.evaluate(() => document.getElementById('find-axis-room').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await sleep(500);
  const roomStorey = await page.evaluate(topGroups);
  const subToggle = await page.evaluate(() => { const r = document.querySelector('#find-tree > div'); return r ? Array.from(r.querySelectorAll('button')).map(b => b.textContent) : []; });
  console.log('ROOM groupBy=storey topGroups: ' + JSON.stringify(roomStorey) + '  subToggle=' + JSON.stringify(subToggle));

  // flip to Type
  await page.evaluate(() => { const btns = document.querySelectorAll('#find-tree > div button'); btns.forEach(b => { if (b.textContent === 'Type') b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); });
  await sleep(400);
  const roomType = await page.evaluate(topGroups);
  console.log('ROOM groupBy=type topGroups: ' + JSON.stringify(roomType));

  // flip back to Storey, expand first storey, tap first room → check camera zoom moved
  await page.evaluate(() => { const btns = document.querySelectorAll('#find-tree > div button'); btns.forEach(b => { if (b.textContent === 'Storey') b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); });
  await sleep(400);
  const camBefore = await page.evaluate(() => { const A = window.A || window.APP; const p = A.camera.position; return [p.x, p.y, p.z]; });
  const roomTap = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const parents = Array.from(tree.querySelectorAll('[data-find-parent], :scope > *')).filter(el => !el.querySelector('button') && el.getAttribute('data-find-parent'));
    // find first storey parent with an arrow → expand
    const p0 = tree.querySelectorAll('[data-find-parent]')[0];
    if (!p0) return { err: 'no storey parent' };
    p0.children[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); // expand
    const cc = p0.nextElementSibling;
    const leaf = cc && cc.querySelector('div');
    if (!leaf) return { err: 'no room leaf' };
    const label = leaf.children[1] ? leaf.children[1].textContent : '?';
    (leaf.children[1] || leaf).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { room: label };
  });
  await sleep(900); // let zoom anim run
  const camAfter = await page.evaluate(() => { const A = window.A || window.APP; const p = A.camera.position; return [p.x, p.y, p.z]; });
  const moved = Math.hypot(camAfter[0] - camBefore[0], camAfter[1] - camBefore[1], camAfter[2] - camBefore[2]);
  console.log('ROOM_TAP: ' + JSON.stringify(roomTap) + ' camMoved=' + moved.toFixed(2) + (moved > 0.5 ? ' ZOOM OK' : ' NO ZOOM'));

  // MATERIAL axis → category
  await page.evaluate(() => document.getElementById('find-axis-material').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await sleep(400);
  const matFlat = await page.evaluate(topGroups);
  await page.evaluate(() => { const btns = document.querySelectorAll('#find-tree > div button'); btns.forEach(b => { if (b.textContent.indexOf('Category') >= 0) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); });
  await sleep(400);
  const matCat = await page.evaluate(topGroups);
  console.log('MATERIAL flat(top5): ' + JSON.stringify(matFlat.slice(0, 5)));
  console.log('MATERIAL category(top): ' + JSON.stringify(matCat));

  console.log('--- §LENS_GROUPS / §ROOM_SELECT / §MAT_SELECT ---');
  console.log(logs.filter(l => /§LENS_GROUPS|§ROOM_SELECT|§MAT_SELECT|PAGEERROR/.test(l)).slice(-12).join('\n'));
  await browser.close();
})();
