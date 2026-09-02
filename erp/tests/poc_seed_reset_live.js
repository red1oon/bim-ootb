// W-SEED-RESET-LIVE — wiring + asset smoke (secondary to the whitebox W-SEED-RESET) in a real browser.
//   Proves, over the REAL ad_seed.db: (1) the doublebubble.jpg brand mark renders at the three BIG spots (login
//   card · header · System Monitor head); (2) the System Monitor Cache section now offers BOTH a surgical "Reset
//   demo / seed ERPs" button AND the nuclear "Reset to seed (full)" button; (3) SystemMonitor._rebuildSeed exists
//   and executes over the real clientTables + a freshly-fetched pristine ad_seed.db with 0 thrown errors. The
//   data-correctness of the transform is proven headless in poc_seed_reset.js. §-log first — read the log.
// Run: node tests/poc_seed_reset_live.js
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
var server = http.createServer(function (req, res) {
  var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
});

(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, base = 'http://localhost:' + port;
  var pageErrors = [];
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });

  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb && !!window.SQL && !!window.IdmpSession; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-step0') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });

  // ── logo at the BIG spots (login card + header) ──
  var logos = await page.evaluate(function () {
    function src(sel) { var i = document.querySelector(sel); return i ? (i.getAttribute('src') || '') : null; }
    return { loginMark: src('.idmp-login-mark img'), headerLogo: src('#idmp-logo img') };
  });

  // ── open the monitor + inspect the Cache section + the monitor-head mark ──
  await page.click('#idmp-sysmon-link');
  await page.waitForSelector('#sm-root .sm-tbl', { timeout: 8000 });
  var mon = await page.evaluate(function () {
    var root = document.getElementById('sm-root');
    var labels = [].map.call(root.querySelectorAll('.sm-tbl th'), function (e) { return e.textContent.trim(); });
    return {
      headMark: (function () { var i = root.querySelector('.sm-head .sm-mark'); return i ? (i.getAttribute('src') || '') : null; })(),
      hasSurgical: !!root.querySelector('[data-sm-reset-seed]'),
      hasFullWipe: !!root.querySelector('[data-sm-reset]'),
      surgicalLabel: (function () { var b = root.querySelector('[data-sm-reset-seed]'); return b ? b.textContent.trim() : ''; })(),
      labels: labels
    };
  });

  // ── _rebuildSeed runs over the REAL schema (fresh boot: no >= 17 tenants → reins 0, but MUST NOT throw) ──
  var rebuild = await page.evaluate(async function () {
    if (!window.SystemMonitor || typeof window.SystemMonitor._rebuildSeed !== 'function') return { fn: false };
    try {
      var buf = await (await fetch('ad_seed.db', { cache: 'reload' })).arrayBuffer();
      var fresh = new window.SQL.Database(new Uint8Array(buf));
      var tables = window.IdmpSession.clientTables(window.__idmpDb);
      var c = window.SystemMonitor._rebuildSeed(window.__idmpDb, fresh, tables, 17);
      var clients = fresh.exec("SELECT COUNT(*) FROM AD_Client")[0].values[0][0];
      try { fresh.close(); } catch (e) {}
      return { fn: true, tables: tables.length, snapRows: c.snapRows, reins: c.reins, freshClients: clients };
    } catch (e) { return { fn: true, threw: String(e) }; }
  });

  console.log('═══ W-SEED-RESET-LIVE — logo + Reset-demo/seed wiring over the real ad_seed.db ═══\n');
  console.log('  logos: ' + JSON.stringify(logos));
  console.log('  monitor: head-mark=' + mon.headMark + '  surgical=' + mon.hasSurgical + ' ("' + mon.surgicalLabel + '")  fullWipe=' + mon.hasFullWipe);
  console.log('  rebuild over real db: ' + JSON.stringify(rebuild));
  console.log('  pageErrors=' + pageErrors.length + (pageErrors.length ? ' :: ' + pageErrors.join(' | ') : '') + '\n');

  var pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  ck(/doublebubble\.jpg/.test(logos.loginMark || ''), 'login card mark = doublebubble.jpg (' + logos.loginMark + ')');
  ck(/doublebubble\.jpg/.test(logos.headerLogo || ''), 'header logo = doublebubble.jpg (' + logos.headerLogo + ')');
  ck(/doublebubble\.jpg/.test(mon.headMark || ''), 'System Monitor head mark = doublebubble.jpg (' + mon.headMark + ')');
  ck(mon.hasSurgical, 'Cache section has the surgical "Reset demo / seed ERPs" button');
  ck(/Reset demo \/ seed ERPs/.test(mon.surgicalLabel), 'surgical button is labelled "Reset demo / seed ERPs"');
  ck(mon.hasFullWipe, 'the nuclear "Reset to seed (full)" button is still present, distinctly');
  ck(rebuild.fn === true, 'SystemMonitor._rebuildSeed is exposed in the page');
  ck(!rebuild.threw, 'rebuild runs over the real clientTables + fresh ad_seed.db without throwing' + (rebuild.threw ? ' :: ' + rebuild.threw : ''));
  ck(rebuild.freshClients >= 1 && rebuild.reins === 0, 'fresh boot has no >= 17 tenant → reins=0, pristine seed intact (' + rebuild.freshClients + ' client(s); System(0) re-overlaid by boot, hence the reload)');
  ck(pageErrors.length === 0, '0 pageerrors');

  console.log('\n  W-SEED-RESET-LIVE: ' + pass + ' pass / ' + fail + ' fail');
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
