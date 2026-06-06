// probe_terminal.js — verify the injected Terminal: §LENS_PROBE material should now be true.
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
  // wait for db + activeBuilding (meta loaded) — don't need full geometry stream
  await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding; }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  await sleep(1500);
  const ident = await page.evaluate(() => { const A = window.A || window.APP; return { activeBuilding: A.activeBuilding, hasDb: !!A.db }; });
  console.log('IDENT: ' + JSON.stringify(ident));
  // direct probe of the queries the lens uses
  const direct = await page.evaluate(() => {
    const A = window.A || window.APP;
    const q = (sql, p) => { try { const r = A.db.exec(sql, p || []); return r.length ? r[0].values[0][0] : 0; } catch (e) { return 'ERR:' + e.message; } };
    const bld = A.activeBuilding || '';
    return {
      bld,
      material_all: q("SELECT COUNT(*) FROM elements_meta WHERE material_name IS NOT NULL"),
      material_bldfiltered: q("SELECT COUNT(*) FROM elements_meta WHERE material_name IS NOT NULL AND building = ?", [bld]),
      distinct_material: q("SELECT COUNT(DISTINCT material_name) FROM elements_meta WHERE material_name IS NOT NULL"),
      ifcspace: q("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace'"),
    };
  });
  console.log('DIRECT_DB: ' + JSON.stringify(direct));
  // open Find → fires §LENS_PROBE
  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await sleep(1500);
  console.log('--- §LENS lines ---');
  console.log(logs.filter(l => /§LENS_PROBE|§LENS_AXES|PAGEERROR/.test(l)).slice(-6).join('\n'));
  await browser.close();
})();
