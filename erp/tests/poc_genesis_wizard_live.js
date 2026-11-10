// W-GENESIS-WIZARD-LIVE — drive genesis.html headless, capture the §-log, assert the born tenant posts to the cent.
// Run: node tests/poc_genesis_wizard_live.js   (serves erp/ on a local port, loads genesis.html, clicks Birth)
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');

var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
var server = http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, rel);
  // idempiere.html loads ../common/comm/semver_strict.js: the browser resolves it to /common/..., which lives at the REPO root, not under erp/ (cause of the plugin_registry page error)
  if (!fs.existsSync(f) && /^\/common\//.test(rel)) f = path.join(ROOT, '..', rel);
  fs.readFile(f, function (e, buf) {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, url = 'http://localhost:' + port + '/genesis.html';
  var logs = [], pageErrors = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); });
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#go');
  try { await page.waitForFunction(function () {
    return document.querySelector('#out .badge') !== null;
  }, { timeout: 20000 }); }
  catch (eW) { console.log('§W-GENESIS-WIZARD-LIVE TIMEOUT waiting for the result badge — page §-log:'); logs.forEach(function (l) { console.log('  ' + l); }); console.log('  pageErrors=' + JSON.stringify(pageErrors).slice(0, 1200)); await browser.close(); server.close(); process.exit(1); }
  await page.waitForTimeout(500);

  console.log('═══ W-GENESIS-WIZARD-LIVE — genesis.html births + posts in a REAL browser (sql.js) ═══\n');
  logs.forEach(function (l) { console.log('  ' + l); });
  console.log('');

  var pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  var L = logs.join('\n');
  var bg = /born client=AcmeCo groups=(\d+)/.exec(L);   // 6 when written; 8 since #2791/#2792 (period control, schema elements) - the claim is the six base groups are there
  ck(!!bg && Number(bg[1]) >= 6, 'wizard births its op-groups in the browser (' + (bg && bg[1]) + ' >= the 6 base groups)');
  ck(/folded ops=\d+ chart=311/.test(L), 'foldGenesis ran via sql.js shim — 311-account chart');
  ck(/balanced=true absent=\[\]/.test(L), 'posted journal balances, no absent accounts');
  ck(/DR12110=109 CR41000=100 CR21610=9 toTheCent=true/.test(L), 'GL == oracle to the cent (DR 12110 / CR 41000 / CR 21610)');
  ck(/signed head=.* verified=true/.test(L), 'genesis bundle signed + verified in the browser');
  ck(/RESULT=PASS/.test(L), 'page self-verdict = PASS');
  ck(pageErrors.length === 0, 'zero page errors' + (pageErrors.length ? ' — ' + pageErrors[0] : ''));

  console.log('\n═══ W-GENESIS-WIZARD-LIVE: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
  console.log(fail === 0 ? '✅ The Initial Tenant Setup wizard births + posts to the cent LIVE in the browser.' : '❌ gaps above.');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('test error', e); server.close(); process.exit(1); });
