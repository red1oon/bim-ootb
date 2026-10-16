// Verify the REAL authored cinema_path for HHS via the shipped loader (_cpeLoadFromDb, effects.js:9180),
// never a re-implementation: trigger it exactly the way viewer/cinema_maxq.js:2583 does
// (a.cinemaPathPlan(60) to lazy-load, then read a._getCinemaPathEdit()), and report the real ov shape.
// Loads HHS_Office_Federated_silent.db — the ONLY db with a non-empty cinema_path table (confirmed via
// sqlite3: HHS_Office_Federated_extracted.db has none), and it is a self-contained geometry DB too
// (elements_meta=6880, component_geometries=4710) so path + geometry come from ONE consistent source.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8402/viewer/viewer.html?db=/buildings/HHS_Office_Federated_silent.db', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  const ovInfo = await p.evaluate(() => {
    const a = window.APP;
    try { a.cinemaPathPlan(60); } catch (e) {}   // triggers _cpeLoadFromDb lazily, same as cinema_maxq.js:2583
    const staged = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
    if (!staged) return { staged: null };
    return {
      staged: true,
      total: staged._total, diveSec: staged.diveSec, spinSec: staged.spinSec, outSec: staged.outSec, riseSec: staged.riseSec,
      bandsCount: staged.bands ? staged.bands.length : 0,
      bands: staged.bands
    };
  });
  console.log('§HHS_REALPATH_OV ' + JSON.stringify(ovInfo));
  console.log(logs.filter(l => /CINEMA_PATH_RESTORE|error|ERROR/i.test(l)).slice(0, 20).join('\n'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
