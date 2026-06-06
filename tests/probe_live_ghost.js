// §VERIFY LIVE GHOST — does the ghost X-Ray shell BUILD/RENDER on the live GH site (not localhost)?
// Loads the REAL live URL (GH Pages viewer + OCI common-bucket DB via _prodBase), blocks SW for fresh files,
// opens Find, presses Alt+X, and watches for §SHELL_GHOST_BUILT + verifies the shell mesh is in the scene.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings';
const BLD = process.env.BLD || 'Terminal';
const URL = `https://red1oon.github.io/bim-ootb/viewer/viewer.html?db=${OCI}/${BLD}_extracted.db&ghost=1`;
(async () => {
  console.log('§PROBE_URL ' + URL);
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); // fresh files, no SW cache
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) { logs.push(t); } });
    page.on('pageerror', e => console.log('§PAGEERR ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    page.setDefaultTimeout(0);
    // wait for geometry to load
    await page.waitForFunction(() => { const A = window.APP||window.A; return A && A.meshCache && Object.keys(A.meshCache).length > 50; }, { timeout: 120000 })
      .then(()=>console.log('§MESH_READY'))
      .catch(e=>console.log('§MESH_WAIT '+e.message));
    const meshCount = await page.evaluate(() => { const A=window.APP||window.A; return A&&A.meshCache?Object.keys(A.meshCache).length:-1; });
    console.log('§MESHCACHE n=' + meshCount);
    // open Find (loads navigate_find → §NAV_FIND_VERSION)
    await page.evaluate(async () => { const A = window.APP||window.A; if (A.loadNavigate) await A.loadNavigate(); if (A.openFindPanel) A.openFindPanel(''); });
    await page.waitForTimeout(3000);
    const ver = logs.filter(l => l.indexOf('NAV_FIND_VERSION') >= 0).pop() || 'ABSENT';
    console.log('§LIVE_VERSION ' + ver);
    // trigger ghost: prefer explicit toggle (deterministic) over waiting on the deferred auto-build
    const hasToggle = await page.evaluate(() => typeof window.toggleGhostXray === 'function');
    console.log('§HAS_TOGGLE ' + hasToggle);
    if (hasToggle) { await page.evaluate(() => window.toggleGhostXray()); }
    // wait for the build log (deferred build can take seconds)
    await page.waitForFunction(() => true, {});
    for (let i=0;i<30;i++){ if (logs.some(l=>l.indexOf('SHELL_GHOST_BUILT')>=0)) break; await page.waitForTimeout(1000); }
    const built = logs.filter(l => l.indexOf('SHELL_GHOST_BUILT') >= 0).pop() || 'ABSENT';
    console.log('§LIVE_GHOST_BUILT ' + built);
    // verify a shell mesh actually exists & is visible in the scene
    const shell = await page.evaluate(() => {
      const A=window.APP||window.A; let found=0, visible=0;
      try { A.scene.traverse(o => { if (o.name && /ghost|shell|xray/i.test(o.name)) { found++; if (o.visible) visible++; } }); } catch(e){ return 'ERR:'+e.message; }
      return JSON.stringify({ found, visible, ghostFlag: !!A._ghostShell || !!A.ghostShell });
    });
    console.log('§LIVE_SHELL_MESH ' + shell);
    console.log('§ALL_GHOST_LOGS ' + logs.filter(l=>/GHOST|SHELL|XRAY/i.test(l)).join(' || '));
    console.log('§PROBE_DONE');
  } finally { await browser.close(); }
})();
