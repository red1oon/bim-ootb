// Visual investigation (not a pass/fail witness): SEE the post-login launch flow in idempiere.html —
// the pill rail (Graph/Kanban icons), the Graph view, and the Kanban board — as a real user would.
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, name) });

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  await page.goto(`http://localhost:${port}/idempiere.html?window=167`, { waitUntil: 'networkidle' });

  // login
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await shot(page, 'see_1_login.png');
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok'); await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, 'see_2_after_login_window.png');   // landing: open window + pill rail (Graph/Kanban icons)

  // the pill rail — what icons are present?
  const pills = await page.$$eval('.idmp-pill', bs => bs.map(b => b.title));
  console.log('§PILL-RAIL after login: [' + pills.join(', ') + ']');

  // Graph icon
  const g = await page.$('.idmp-pill[title="Graph"]');
  if (g) { await g.click(); await page.waitForTimeout(700); await shot(page, 'see_3_graph.png'); console.log('Graph: clicked'); }
  else console.log('Graph: pill NOT FOUND');
  // close overlay then Kanban
  var x = await page.$('#posted-overlay .posted-ov-x'); if (x) { await x.click(); await page.waitForTimeout(300); }
  const k = await page.$('.idmp-pill[title="Kanban"]');
  if (k) { await k.click(); await page.waitForTimeout(900); await shot(page, 'see_4_kanban.png'); console.log('Kanban: clicked'); }

  await browser.close(); server.close();
})().catch(e => { console.error('ERR', e); server.close(); process.exit(2); });
