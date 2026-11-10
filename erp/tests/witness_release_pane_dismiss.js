// ⚠ DO NOT REMOVE - W-RELDISMISS (MIGRATE_INSTALL_TENANT §CLOSEOUT item 3, F5). READ THE LOG after every run (/tmp/count_logs/co_reldismiss.log).
// THE ISSUE: the Plugins & Releases modal (#pr-root, plugin_release.js) opened from the sign-in link stayed over the next screen until its x was pressed,
//   so it intercepted clicks on the wizard and on log out. Claim: the pane covers the sign-in page while open (so the probe can SEE the interception),
//   closes on Escape, and is gone after login and after logout; at the next screen's controls elementFromPoint is NOT inside #pr-root.
// Numeric, no screenshots. ERP_DIR=<old checkout/erp> runs the same witness on old code = the mutant (must FAIL B C D).
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
var ROOT = process.env.ERP_DIR || path.join(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
var server = http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, rel);
  if (!fs.existsSync(f) && /^\/common\//.test(rel)) f = path.join(ROOT, '..', rel);
  fs.readFile(f, function (e, buf) { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
});
// in-page probe: is the element at the centre of `sel` inside #pr-root?  returns {found, inPane, rect}
function probe(sel) {
  var el = document.querySelector(sel); if (!el) return { found: false };
  var r = el.getBoundingClientRect(); if (!r.width || !r.height) return { found: false, hidden: true };
  var top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { found: true, inPane: !!(top && top.closest && top.closest('#pr-root')), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
}
function paneRect() { var p = document.getElementById('pr-root'); if (!p) return null; var r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), window.innerWidth, window.innerHeight]; }
(async function () {
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://localhost:' + server.address().port, logs = [], res = [], J = JSON.stringify;
  var browser = await chromium.launch({ args: ['--no-sandbox'] }), page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', function (m) { var t = m.text(); if (t.indexOf('§') === 0) logs.push(t); });
  function check(id, ok, msg, ev) { res.push({ id: id, ok: ok === null ? null : !!ok }); console.log('§RELDISMISS ' + id + ' ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + msg + ' :: ' + J(ev)); }
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.evaluate(function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); });
  await page.goto(base + '/idempiere.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0; }, null, { timeout: 40000 });
  await page.waitForTimeout(400);
  async function openPane() { await page.evaluate(function () { window.PluginRelease.close(); }); /* hard reset so each step is judged on its own (a lingering pane is what the previous check reports) */ await page.click('#idmp-release-link'); await page.waitForSelector('#pr-root', { timeout: 5000 }); }
  // A - open from the sign-in link: the modal fills the viewport and intercepts the sign-in controls (the probe can see an interception)
  await openPane();
  var pr = await page.evaluate(paneRect), pa = await page.evaluate(probe, '#idmp-login-clients .idmp-login-user');
  check('A', pr && pr[0] === pr[2] && pr[1] === pr[3] && pa.found && pa.inPane, 'open pane covers the viewport (w,h,vw,vh=' + J(pr) + ') and intercepts the sign-in tile (control)', { pr: pr, pa: pa });
  // B - Escape closes it; the same point is no longer intercepted
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  var gone = await page.evaluate(function () { return !document.getElementById('pr-root'); }), pb = await page.evaluate(probe, '#idmp-login-clients .idmp-login-user');
  check('B', gone && pb.found && !pb.inPane, 'Escape removes #pr-root and the sign-in tile is not intercepted', { gone: gone, pb: pb });
  // C - open again, log in as System: the next screen (header Log out, menu) is not covered
  await openPane();
  // the modal intercepts real clicks (that is the defect), so close it to choose the tenant/user, then reopen it on the role screen
  await page.evaluate(function () { window.PluginRelease.close(); });
  await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('System'))");
  await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('System'))"); await page.waitForSelector('#idmp-login-step2:visible');
  await page.selectOption('#idmp-login-role', '0').catch(function () {});
  await openPane();                                                    // the pane is open ON the role screen, as a user who clicked the sign-in link would leave it
  var pc0 = await page.evaluate(probe, '#idmp-login-ok');
  await page.evaluate(function () { document.getElementById('idmp-login-ok').click(); });   // the Log In control's own handler (a real pointer click is what the pane intercepts: pc0)
  await page.waitForFunction(function () { return document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  var pc = { paneGone: await page.evaluate(function () { return !document.getElementById('pr-root'); }) }, pcLo = await page.evaluate(probe, '#idmp-switch-btn'), pcMenu = await page.evaluate(probe, '#idmp-tree .idmp-row');
  check('C0', pc0.found && pc0.inPane, 'control: with the pane open the Log In button is covered by it', pc0);
  check('C', pc.paneGone && pcLo.found && !pcLo.inPane && pcMenu.found && !pcMenu.inPane, 'after login #pr-root is gone; Log out button and the menu are not intercepted', { pc: pc, pcLo: pcLo, pcMenu: pcMenu });
  // D - open on the logged-in page, log out: pane gone on the sign-in screen
  await page.evaluate(function () { window.PluginRelease.open(); }); await page.waitForSelector('#pr-root');
  var pd0 = await page.evaluate(probe, '#idmp-switch-btn');
  await page.evaluate(function () { document.getElementById('idmp-switch-btn').click(); });
  await page.waitForFunction(function () { var l = document.getElementById('idmp-login'); return l && l.style.display !== 'none'; }, null, { timeout: 10000 }); await page.waitForTimeout(300);
  var pd = await page.evaluate(function () { return !document.getElementById('pr-root'); }), pdl = await page.evaluate(probe, '#idmp-login-clients .idmp-login-user');
  check('D0', pd0.found && pd0.inPane, 'control: with the pane open the Log out button is covered by it', pd0);
  check('D', pd && pdl.found && !pdl.inPane, 'after Log out #pr-root is gone and the sign-in tile is not intercepted', { paneGone: pd, pdl: pdl });
  // E - the x still works (design kept)
  await openPane(); await page.click('#pr-root [data-pr-close].pr-x'); var ex = await page.evaluate(function () { return !document.getElementById('pr-root'); });
  check('E', ex, 'the x still closes the pane', { closed: ex });
  var judged = res.filter(function (r) { return r.ok !== null; }).length, failed = res.filter(function (r) { return r.ok === false; }).length;
  var v = judged === 0 ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  console.log('§RELDISMISS-VERDICT ' + v + ' judged=' + judged + ' failed=' + failed);
  await browser.close(); server.close(); process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§RELDISMISS-VERDICT FAIL judged=0 error=' + (e && e.message)); try { server.close(); } catch (x) {} process.exit(1); });
