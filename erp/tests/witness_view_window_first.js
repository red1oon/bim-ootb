#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-VIEW-WINDOW-FIRST (bim-compiler prompts/ERP_DEPTH_FILM.md §FILM-GAP-2). READ THE LOG: §VWF lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: a window whose table is a legacy VIEW (Accounting Fact Balances = Fact_Acct_Balance, which calls trunc(date,'DD')) shows its rows when it is the FIRST window opened after login.
//   The stored-function UDFs used to be bound lazily (first model transaction / callout), so the first view read hit SQLite's 1-argument built-in trunc(): "wrong number of arguments to function trunc()" and the
//   window showed "0 records". Found while filming (the window worked only after something else had bound the UDFs). Real headless browser, CPU only, GardenAdmin, fresh page.
//   PASS needs: rows > 0 AND no "readRecords ERROR" line. INCONCLUSIVE if the menu leaf is missing. Run: NODE_PATH=~/bim-ootb/tests/node_modules node erp/tests/witness_view_window_first.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PW || (os.homedir() + '/bim-ootb/tests/node_modules/playwright'));
const REPO = path.join(__dirname, '..', '..'), WIN = 255, log = s => console.log(s);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain', '.svg': 'image/svg+xml', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => { const fp = path.join(REPO, decodeURIComponent(req.url.split('?')[0])); fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(fp).pipe(res); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port + '/erp';
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), page = await (await b.newContext({ viewport: { width: 1440, height: 810 } })).newPage(), L = [];
  page.on('console', m => L.push(m.text()));
  let verdict = 'INCONCLUSIVE', why = '';
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
    await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 15000 });
    const mid = await page.evaluate(w => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); }, WIN);
    if (!mid) why = 'menu leaf for window ' + WIN + ' missing';
    else {
      await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, mid);
      await page.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 20000 }); await page.waitForFunction(() => document.querySelectorAll('.idmp-grid tbody tr td').length > 1, null, { timeout: 12000 }).catch(() => {});
      const rows = await page.$$eval('.idmp-grid tbody tr[data-ad-record]', e => e.length), status = await page.$eval('#idmp-status', e => e.innerText).catch(() => ''), err = L.filter(l => /readRecords ERROR/.test(l));
      log('§VWF window=' + WIN + ' firstWindow=true rows=' + rows + ' status="' + status + '" readErrors=' + err.length + (err.length ? ' first="' + err[0].slice(0, 160) + '"' : ''));
      verdict = rows > 0 && !err.length ? 'PASS' : 'FAIL'; why = rows > 0 ? '' : 'the view window opened first shows no rows';
    }
  } catch (e) { why = String(e.message).split('\n')[0]; }
  log('§VWF-VERDICT ' + verdict + (why ? ' reason="' + why + '"' : '')); await b.close(); server.close(); process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})();
