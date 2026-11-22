// ⚠ DO NOT REMOVE — MEASUREMENT (no product code). READ THE LOG. Question (bim-compiler §INTERNAL-UAT, guide B4.4 with the whole Shed): after F, tap Level 1, › ERP,
// open ↗ and GardenAdmin, how many records does the Kernel ERP show on Project Line / Phase / Phase Line / Task / Task Line, and what does each tab say?
// Run: SHED_DB=<SHED_extracted.db> LOG=<file> node viewer/tests/measure_kernel_b44_whole_shed.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), SHED = process.env.SHED_DB, LOGF = process.env.LOG || '/tmp/measure_kernel_b44.log';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }); });
const out = fs.createWriteStream(LOGF); const L = m => { out.write(m + '\n'); if (/§MEASURE/.test(m)) console.log(m); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); let page = await ctx.newPage();
  ctx.on('page', p => p.on('console', m => L('[console2] ' + m.text())));
  page.on('console', m => L('[console] ' + m.text()));
  const sleep = ms => page.waitForTimeout(ms);
  const until = async (pg, fn, ms, arg) => { for (let i = 0; i < ms / 250; i++) { const v = await pg.evaluate(fn, arg).catch(() => null); if (v) return v; await pg.waitForTimeout(250); } return null; };
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?blank=1&ghost=1');
  await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 }); await sleep(2000);
  await page.evaluate(() => { window.showOpenFilePicker = undefined; }); await page.mouse.click(900, 640);
  const fc = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o'); (await fc).setFiles(SHED);
  await until(page, () => /DONE/.test(document.getElementById('status').textContent), 300000);
  await page.mouse.click(900, 640); await page.keyboard.press('f'); await sleep(2500);
  await page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"] > span:nth-child(2)').first().click();
  await until(page, () => /USD\s*[\d,]+\.\d{2}(?!\d)/.test((document.getElementById('find-selected') || {}).innerText || ''), 120000);
  await page.locator('#find-erp-btn').click();
  const st = await until(page, () => { const s = document.getElementById('status').textContent; return /Project Order: \d+ lines/.test(s) ? s : null; }, 120000);
  L('§MEASURE push status="' + st + '"');
  const href = await until(page, () => { const a = document.getElementById('find-erp-open'); return a && getComputedStyle(a).display !== 'none' ? a.href : null; }, 20000);
  L('§MEASURE open href=' + href);
  const erp = await ctx.newPage(); await erp.goto(href);
  await until(erp, () => document.querySelectorAll('.idmp-login-user').length, 120000);
  await erp.locator('.idmp-login-user', { hasText: 'GardenAdmin' }).first().click(); await erp.waitForTimeout(800);
  await erp.locator('.idmp-login-actions button.primary').click();
  await until(erp, () => document.querySelectorAll('.idmp-adtab').length > 0 && [...document.querySelectorAll('input')].some(e => (e.getAttribute('data-col') || e.name) === 'value' && e.value), 120000);
  for (const t of ['Project', 'Project Line', 'Phase', 'Phase Line', 'Task', 'Task Line']) {
    const tab = erp.locator('.idmp-adtab', { hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
    if (await tab.count()) { await tab.click(); await erp.waitForTimeout(2500); }
    const r = await erp.evaluate(() => { const bt = document.body.innerText.replace(/\s+/g, ' ');
      const recs = (bt.match(/[^·]{0,40}· \d+ records?/g) || []).slice(0, 4), nav = (bt.match(/\b\d+ ?(?:\/|of) ?\d+\b/g) || []).slice(0, 6);
      const grid = [...document.querySelectorAll('table.idmp-grid tr[data-i]')].filter(e => e.getBoundingClientRect().width > 0).length;
      const vals = {}; document.querySelectorAll('input').forEach(e => { const k = e.getAttribute('data-col') || e.name; if (k && e.getBoundingClientRect().width > 0 && /^(name|plannedamt|value|seqno|line)$/.test(k)) vals[k] = e.value; });
      return { recs, nav, grid, vals }; });
    L('§MEASURE tab "' + t + '" ' + JSON.stringify(r));
  }
  await browser.close(); server.close(); out.end();
})().catch(e => { L('§MEASURE ERROR ' + (e && e.stack || e)); process.exit(2); });
