// W-SYSTEM-MONITOR-LIVE — the iDempiere System Monitor, reframed for a serverless kernel, in a real browser.
//   SYSTEM_ADMIN_LANE §6. Proves: (1) the login info panel shows the release/dictionary version + the default
//   credential hints (SuperUser/System · GardenAdmin/GardenAdmin) + a System Monitor link; (2) the link opens a
//   panel that mirrors iDempiere's monitor sections (System · Memory · Cache · Logs · Servers · Database) filled
//   with REAL local data (heap via performance.memory, storage via the Storage API) and HONEST "No longer needed"
//   reframes for the server-only bits, each linking Read-further → migrate_compare.html; (3) 0 pageerrors.
// Run: node tests/poc_system_monitor_live.js   (serves erp/ on a local port). §-log first — read the log.
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, res) {
  var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
});

(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var port = server.address().port, base = 'http://localhost:' + port;
  var logs = [], pageErrors = [];
  var browser = await chromium.launch({ args: ['--no-sandbox', '--enable-precise-memory-info'] });
  var page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); });
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });

  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-step0') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  await page.waitForSelector('#idmp-login-info', { state: 'visible', timeout: 10000 });

  // ── login info panel ──────────────────────────────────────────────────────────────────────────────────────────
  var panel = await page.evaluate(function () {
    var info = document.getElementById('idmp-login-info');
    var em = document.getElementById('idmp-creator-email'), lic = document.getElementById('idmp-creator-license');
    return { present: !!info, text: info ? info.textContent.replace(/\s+/g, ' ').trim() : '', link: !!document.getElementById('idmp-sysmon-link'),
      emailHref: em ? em.getAttribute('href') : null, licHref: lic ? lic.getAttribute('href') : null };
  });

  // ── open the monitor + read what it rendered ──────────────────────────────────────────────────────────────────
  await page.click('#idmp-sysmon-link');
  await page.waitForSelector('#sm-root .sm-tbl', { timeout: 8000 });
  await page.waitForFunction(function () { var s = document.querySelector('#sm-root .sm-sub'); return s && s.textContent.indexOf('loading') < 0; }, null, { timeout: 8000 }).catch(function () {});
  var mon = await page.evaluate(function () {
    var root = document.getElementById('sm-root');
    var groups = [].map.call(root.querySelectorAll('.sm-grp td'), function (e) { return e.textContent.trim(); });
    var rowsByLabel = {};
    [].forEach.call(root.querySelectorAll('.sm-tbl tr:not(.sm-grp)'), function (tr) {
      var th = tr.querySelector('th'), td = tr.querySelector('td'); if (th && td) rowsByLabel[th.textContent.trim()] = td.textContent.replace(/\s+/g, ' ').trim();
    });
    return {
      groups: groups,
      heap: rowsByLabel['Heap usage'] || '',
      storage: rowsByLabel['Local storage'] || '',
      release: rowsByLabel['Release'] || '',
      badges: root.querySelectorAll('.sm-badge').length,
      readFurther: [].map.call(root.querySelectorAll('.sm-rf'), function (a) { return a.getAttribute('href'); }),
      reset: !!root.querySelector('[data-sm-reset]')
    };
  });

  console.log('═══ W-SYSTEM-MONITOR-LIVE — iDempiere System Monitor, serverless reframe, in a real browser ═══\n');
  logs.filter(function (l) { return /SYSTEM-MONITOR/.test(l); }).forEach(function (l) { console.log('  ' + l); });
  console.log('\n  login panel: ' + JSON.stringify(panel));
  console.log('  monitor groups=[' + mon.groups.join(' · ') + ']');
  console.log('  release="' + mon.release + '"  heap="' + mon.heap + '"  storage="' + mon.storage + '"');
  console.log('  reframe badges=' + mon.badges + '  readFurther=' + JSON.stringify(mon.readFurther) + '  reset=' + mon.reset + '\n');

  var L = logs.join('\n'), pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  ck(panel.present && panel.link, 'login info panel renders with a System Monitor link');
  ck(/SuperUser \/ System/.test(panel.text) && /GardenAdmin \/ GardenAdmin/.test(panel.text), 'panel shows the default credential hints (System: SuperUser/System · GardenWorld: GardenAdmin/GardenAdmin)');
  ck(/serverless/.test(panel.text), 'panel states the serverless / SQLite-wasm posture + version line');
  ck(/Redhuan D\. Oon \(red1\)/.test(panel.text) && panel.emailHref === 'mailto:red1org@gmail.com', 'creator credit: Redhuan D. Oon (red1 → mailto:red1org@gmail.com)');
  ck(/MIT License 2005\/6/.test(panel.text) && /github\.com\/red1oon/.test(panel.licHref || ''), 'MIT License 2005/6 → GitHub (' + panel.licHref + ')');
  ck(/§SYSTEM-MONITOR open/.test(L) && /§SYSTEM-MONITOR gather/.test(L), 'clicking the link opens the monitor (gather ran)');
  var want = ['System', 'Memory', 'Cache', 'Logs & Trace', 'Servers & Cluster', 'Database'];
  ck(want.every(function (g) { return mon.groups.indexOf(g) >= 0; }), 'monitor mirrors iDempiere sections: ' + want.join(', '));
  ck(/MB/.test(mon.heap) || /n\/a/.test(mon.heap), 'Memory row shows REAL heap (MB) or an honest n/a — ' + mon.heap);
  ck(/MB/.test(mon.storage) || /n\/a/.test(mon.storage), 'Cache row shows REAL local-storage usage or honest n/a — ' + mon.storage);
  ck(mon.badges >= 3, 'server-only sections carry the "No longer needed" reframe badge (' + mon.badges + ')');
  ck(mon.readFurther.length >= 3 && mon.readFurther.every(function (h) { return /migrate_compare\.html/.test(h); }), 'every reframe links Read-further → migrate_compare.html (the MigrateComparison)');
  ck(mon.reset, 'Cache section offers a Reset-to-seed action');
  ck(pageErrors.length === 0, 'zero page errors' + (pageErrors.length ? ' — ' + pageErrors[0] : ''));

  console.log('\n═══ W-SYSTEM-MONITOR-LIVE: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
  console.log(fail === 0 ? '✅ iDempiere\'s System Monitor, faithfully mirrored + honestly reframed for the serverless kernel.' : '❌ gaps above.');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('test error', e); server.close(); process.exit(1); });
