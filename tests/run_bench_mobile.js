// run_bench_mobile.js — Emulate mobile device for DLOD bench
// Usage: node run_bench_mobile.js [Terminal|Hospital]
const { chromium, devices } = require('@playwright/test');

const building = process.argv[2] || 'Terminal';
const TIMEOUT = 300000;

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });

  // Emulate iPhone 13 — touch, small screen, mobile UA
  const iPhone = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iPhone,
    // Force touch support for _isMobile detection
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('§')) process.stdout.write('[§] ' + text + '\n');
  });

  await page.goto('http://localhost:8000/bim-ootb/viewer/dlod_bench.html');
  await page.waitForTimeout(1000);

  // The bench iframe loads with desktop viewport. We need the VIEWER to think it's mobile.
  // Override: inject _isMobile before viewer loads
  // Actually the iframe inherits the page's touch/screen — Playwright device emulation handles this.

  await page.click(`button:text("${building}")`);

  const result = await page.waitForFunction(() => {
    const log = document.getElementById('log');
    return log && log.textContent.includes('§VERDICT');
  }, {}, { timeout: TIMEOUT });

  const output = await page.evaluate(() => document.getElementById('log').textContent);
  console.log('\n' + output);

  // Also grab the key §-tagged lines from the iframe's console
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
