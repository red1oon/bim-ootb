// §VERIFY v37 — version stamp loads, rooms axis present, panel resizable, focus-bg CSS, yellow outline path.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8124;
const BLD = process.env.BLD || 'Hospital';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=buildings/${BLD}_extracted.db&ghost=1`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); // fresh files, no SW cache
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) logs.push(t); });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    page.setDefaultTimeout(0);
    await page.waitForFunction(() => { const A = window.APP||window.A; return A && A.meshCache && Object.keys(A.meshCache).length > 50; }, { timeout: 120000 }).catch(e=>console.log('MESH_WAIT '+e.message));
    // open Find (loads navigate_find → prints §NAV_FIND_VERSION)
    await page.evaluate(async () => { const A = window.APP||window.A; if (A.loadNavigate) await A.loadNavigate(); if (A.openFindPanel) A.openFindPanel(''); });
    await page.waitForTimeout(2500);
    // 1. version
    const ver = logs.filter(l => l.indexOf('NAV_FIND_VERSION') >= 0).pop() || 'ABSENT';
    console.log('§T_VERSION ' + ver);
    // 2. rooms axis available
    const lensProbe = logs.filter(l => l.indexOf('LENS_PROBE') >= 0).pop() || 'none';
    const axes = await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? (b.getAttribute('data-axis')||'') : 'no-toggle'; });
    const dbRooms = await page.evaluate(() => { const A=window.APP||window.A; try { const r=A.dbQuery("SELECT count(*) FROM spatial_structure WHERE type='IfcSpace'"); return r.length?r[0][0]:-1; } catch(e){ return 'ERR:'+e.message; } });
    console.log('§T_ROOMS db_spaces=' + dbRooms + ' | ' + lensProbe);
    // 3. panel resizable + 4. focus-bg CSS present
    const tree = await page.evaluate(() => { const t = document.getElementById('find-tree'); if(!t) return 'no-tree'; const cs = getComputedStyle(t); return JSON.stringify({ resize: cs.resize, maxH: cs.maxHeight, h: cs.height }); });
    console.log('§T_PANEL ' + tree);
    const css = await page.evaluate(() => {
      let hasFocus=false, hasYellow=false;
      for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) {
        if (r.selectorText && r.selectorText.indexOf('find-result-item.active')>=0 && /212,?\s*0|ffd400|255, 212/.test(r.cssText)) hasFocus=true;
      } } catch(e){} }
      return { hasFocus };
    });
    console.log('§T_FOCUSBG result_active_yellow=' + css.hasFocus);
    // 5. yellow outline path reachable
    const outlineYellow = await page.evaluate(() => { const A=window.APP||window.A; return typeof A.setOutline === 'function'; });
    console.log('§T_OUTLINE setOutline_fn=' + outlineYellow);
    console.log('§T_DONE');
  } finally { await browser.close(); }
})();
