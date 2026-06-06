// §VERIFY §MERGE-SPEED driver — leak-safe. Loads the synthetic probe, dumps §SPEED logs.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8124;
const N = process.env.N || 63000;
const URL = `http://localhost:${PORT}/tests/probe_merge_speed.html?n=${N}`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--js-flags=--expose-gc'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('console', m => { const t=m.text(); if(t.indexOf('§')>=0) console.log(t); });
    page.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__DONE === true, { timeout: 100000 })
      .catch(e => console.log('WAIT_FAIL ' + e.message));
  } finally { await browser.close(); }
})();
