// W-SEED-RESET-BIM-STORE — issue (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §BIM-CRUD, user 2026-10-07):
//   "Reset demo / seed ERPs" left the viewer's push store (OPFS bim_analysis/bim_project_orders.db), so the next boot's
//   §BIM_OVERLAY re-inserted the pushed Project Orders — the reset was not a reset. This witness drives the REAL button:
//   seed a pushed C_Project 990001 into the store → reload → it shows in the ERP db (precondition, proves the overlay path)
//   → System Monitor → "Reset demo / seed ERPs" (click) → page reloads → re-count. PASS = 990001 gone AND store file gone.
//   RED on the pre-fix tree (ROOT=<old erp dir>): 990001 survives the reset.
// Run: node erp/tests/witness_seed_reset_bim_store.js [erpRootDir]  — read the § log.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.sql': 'text/plain' };
var server = http.createServer(function (req, res) {
  var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
});
var PID = 990001;

(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, logs = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  var page = await (await browser.newContext()).newPage();
  page.on('console', function (m) { var t = m.text(); if (/§(BIM_OVERLAY|SEED-RESET)/.test(t)) { logs.push(t); console.log('  [page] ' + t); } });
  page.on('dialog', function (d) { d.accept(); });
  var ready = function () { return page.waitForFunction(function () { return !!window.__idmpDb && !!window.SQL && !!window.IdmpSession; }, null, { timeout: 60000 }); };
  var count = function () { return page.evaluate(function (id) { var r = window.__idmpDb.exec('SELECT COUNT(*) FROM C_Project WHERE C_Project_ID = ' + id); return r[0].values[0][0]; }, PID); };
  var storeExists = function () { return page.evaluate(async function () {
    try { await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis')).getFileHandle('bim_project_orders.db'); return true; } catch (e) { return false; } }); };

  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' }); await ready();
  // write a push store the way the viewer does: a copy of the seed carrying a band project (cloned from seed row 990000)
  var seeded = await page.evaluate(async function (id) {
    var buf = await (await fetch('ad_seed.db', { cache: 'reload' })).arrayBuffer(), db = new window.SQL.Database(new Uint8Array(buf));
    var cols = db.exec("SELECT name FROM pragma_table_info('C_Project')")[0].values.map(function (x) { return x[0]; });
    var sel = cols.map(function (c) { return /^c_project_id$/i.test(c) ? id : (/^(name|value)$/i.test(c) ? "'W-SEED-RESET-BIM " + c + "'" : '"' + c + '"'); });
    db.run('INSERT INTO C_Project ("' + cols.join('","') + '") SELECT ' + sel.join(',') + ' FROM C_Project WHERE C_Project_ID = 990000');
    var n = db.exec('SELECT COUNT(*) FROM C_Project WHERE C_Project_ID = ' + id)[0].values[0][0];
    var dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis', { create: true });
    var w = await (await dir.getFileHandle('bim_project_orders.db', { create: true })).createWritable(); await w.write(db.export()); await w.close();
    return n;
  }, PID);
  console.log('§W-SEED-RESET-BIM seeded store project=' + PID + ' rows=' + seeded);

  await page.reload({ waitUntil: 'networkidle' }); await ready();
  var before = await count(), storeBefore = await storeExists();
  console.log('§W-SEED-RESET-BIM before-reset C_Project ' + PID + '=' + before + ' store=' + storeBefore);

  await page.click('#idmp-sysmon-link');
  await page.waitForSelector('#sm-root [data-sm-reset-seed]', { timeout: 15000 });
  var nav = page.waitForNavigation({ timeout: 90000 });
  await page.click('#sm-root [data-sm-reset-seed]');
  await nav; await page.waitForLoadState('networkidle'); await ready();
  var after = await count(), storeAfter = await storeExists();
  console.log('§W-SEED-RESET-BIM after-reset C_Project ' + PID + '=' + after + ' store=' + storeAfter);

  var pre = seeded === 1 && before === 1 && storeBefore;
  var verdict = !pre ? 'INCONCLUSIVE (precondition: pushed row never reached the ERP)' : (after === 0 && !storeAfter ? 'PASS' : 'FAIL');
  console.log('§W-SEED-RESET-BIM verdict=' + verdict + ' root=' + ROOT);
  await browser.close(); server.close();
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§W-SEED-RESET-BIM ERROR ' + (e && e.stack || e)); process.exit(2); });
