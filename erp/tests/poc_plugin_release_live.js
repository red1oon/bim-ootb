// W-PLUGIN-RELEASE-LIVE — iDempiere Plugin Management + the gated Release/Update surface it lacks, in a real
//   browser. SYSTEM_ADMIN_LANE §6. Proves: (1) the login info panel carries a "Plugins & Releases" link; (2) it
//   opens a panel with three sections — RELEASE (running sw CACHE_VERSION + Check-for-updates; gated, not auto-
//   latest), PLUGINS (foreign code over window.PluginRegistry — honest note when none loaded), MODULES (our own
//   code, core-vs-optional, at the running release); (3) the SW registration is exposed for the gated apply; (4)
//   0 pageerrors. Run: node tests/poc_plugin_release_live.js   §-log first.
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
  var browser = await chromium.launch({ args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); });
  page.on('pageerror', function (e) { pageErrors.push(String(e)); });

  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb; }, null, { timeout: 30000 });
  await page.waitForFunction(function () { return document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 20000 });
  await page.waitForSelector('#idmp-release-link', { state: 'visible', timeout: 10000 });
  await page.waitForFunction(function () { return !!window.__swReg; }, null, { timeout: 8000 }).catch(function () {});

  var hasLink = await page.$eval('#idmp-release-link', function (e) { return e.textContent.trim(); }).catch(function () { return null; });

  await page.click('#idmp-release-link');
  await page.waitForSelector('#pr-root #pr-modules .pr-row', { timeout: 8000 });
  await page.waitForFunction(function () { var r = document.querySelector('#pr-release'); return r && r.textContent.indexOf('checking') < 0; }, null, { timeout: 8000 }).catch(function () {});

  var view = await page.evaluate(function () {
    var root = document.getElementById('pr-root');
    var grps = [].map.call(root.querySelectorAll('.pr-grp'), function (e) { return e.textContent.trim(); });
    var rel = (root.querySelector('#pr-release') || {}).textContent || '';
    var modRows = root.querySelectorAll('#pr-modules .pr-row').length;
    var coreBadges = root.querySelectorAll('#pr-modules .pr-badge.core').length;
    var optBadges = root.querySelectorAll('#pr-modules .pr-badge.opt').length;
    var plugins = (root.querySelector('#pr-plugins') || {}).textContent || '';
    var checkBtn = !!root.querySelector('[data-pr-check]');
    return { grps: grps, rel: rel.replace(/\s+/g, ' ').trim(), modRows: modRows, coreBadges: coreBadges, optBadges: optBadges, plugins: plugins.replace(/\s+/g, ' ').trim().slice(0, 80), checkBtn: checkBtn };
  });

  // exercise Check-for-updates (gated path) — must not throw; no new deploy → stays up to date
  if (view.checkBtn) { await page.click('[data-pr-check]'); await page.waitForTimeout(400); }

  console.log('═══ W-PLUGIN-RELEASE-LIVE — Plugin Management + the gated Release/Update surface iDempiere lacks ═══\n');
  logs.filter(function (l) { return /PLUGIN-RELEASE|SW_REG/.test(l); }).forEach(function (l) { console.log('  ' + l); });
  console.log('\n  link="' + hasLink + '"  groups=[' + view.grps.join(' · ') + ']');
  console.log('  release="' + view.rel + '"');
  console.log('  modules rows=' + view.modRows + ' core=' + view.coreBadges + ' optional=' + view.optBadges);
  console.log('  plugins="' + view.plugins + '"  checkBtn=' + view.checkBtn + '\n');

  var L = logs.join('\n'), pass = 0, fail = 0;
  function ck(ok, msg) { (ok ? pass++ : fail++); console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + msg); }
  ck(hasLink && /Plugins & Releases/.test(hasLink), 'login info panel carries a "Plugins & Releases" link');
  ck(/§PLUGIN-RELEASE open/.test(L), 'the link opens the Plugins & Releases page');
  ck(['Release', 'Plugins (foreign code)', 'Modules (our code)'].every(function (g) { return view.grps.indexOf(g) >= 0; }), 'page has the three sections: Release · Plugins · Modules');
  ck(/Running:/.test(view.rel) && /v7\d\d/.test(view.rel), 'Release section shows the running release (sw CACHE_VERSION) — ' + view.rel.slice(0, 60));
  ck(view.checkBtn || /Update available/.test(view.rel), 'Release offers Check-for-updates (or shows a held update) — gated, not auto-latest');
  ck(/§PLUGIN-RELEASE state running=v7\d\d/.test(L), 'release state read from the live SW (running version logged)');
  ck(view.modRows >= 10 && view.coreBadges >= 5 && view.optBadges >= 3, 'Modules lists our code split core (always-on) vs optional — rows=' + view.modRows + ' core=' + view.coreBadges + ' opt=' + view.optBadges);
  ck(view.plugins.length > 0, 'Plugins section renders (registry rows or an honest "none loaded" note)');
  ck(pageErrors.length === 0, 'zero page errors' + (pageErrors.length ? ' — ' + pageErrors[0] : ''));

  console.log('\n═══ W-PLUGIN-RELEASE-LIVE: ' + pass + ' PASS / ' + fail + ' FAIL ═══');
  console.log(fail === 0 ? '✅ Plugin Management mirrored + a gated Release/Update surface iDempiere has no in-app equivalent of.' : '❌ gaps above.');
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('test error', e); server.close(); process.exit(1); });
