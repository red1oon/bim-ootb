// run_bench.js — Headless runner for dlod_bench.html, captures results to stdout
// Usage: node run_bench.js [Terminal|Hospital|LTU|all]
const { chromium } = require('@playwright/test');

const building = process.argv[2] || 'Terminal';
const TIMEOUT = building === 'LTU' ? 360000 : building === 'all' ? 600000 : 240000;

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage();

  // Capture console from both main page and iframe
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('§')) process.stdout.write('[§] ' + text + '\n');
  });

  await page.goto('http://localhost:8000/bim-ootb/viewer/dlod_bench.html');
  await page.waitForTimeout(1000);

  if (building === 'all') {
    await page.click('button:text("Run All")');
  } else {
    await page.click(`button:text("${building}")`);
  }

  // Poll for results in the #log div
  const result = await page.waitForFunction((bld) => {
    const log = document.getElementById('log');
    if (!log) return false;
    const text = log.textContent;
    if (bld === 'all') return text.includes('ALL DONE');
    return text.includes('§VERDICT');
  }, building, { timeout: TIMEOUT });

  // Read final output
  const output = await page.evaluate(() => document.getElementById('log').textContent);
  console.log('\n' + output);

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
