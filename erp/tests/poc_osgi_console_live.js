// ⚠ DO NOT REMOVE — W-OSGI-CONSOLE-LIVE (Host work H2; erp/osgi_console.js). READ THE LOG: §OC-LIVE lines carry the evidence.
// THE ISSUE it proves/disproves, in a real browser: Plugins & Releases shows the Felix-style OSGi console (Id 0 system bundle, built-ins, Felix summary sentence); the Install/Update box installs + starts the LAZY fixture which appears as STARTING;
//   the name expands a detail pane; Stop -> Resolved, Start -> Starting; a DocAction on a pp_order row activates it (Reload shows Active and the detail pane lists what it registered); a page reload restores the stack from persistence;
//   Uninstall removes the row.  0 page errors.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0; const ok = (n, c, i) => { if (!c) fails++; console.log('  §OC-LIVE ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=123`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await pg.goto(base, { waitUntil: 'networkidle' }); await pg.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {}); }); await pg.waitForTimeout(1000); };
  const openConsole = async () => { await pg.evaluate(() => { window.PluginRelease.close && window.PluginRelease.close(); window.PluginRelease.open(); }); await pg.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await pg.waitForTimeout(400); };
  const rows = () => pg.evaluate(() => [...document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)')].map(tr => ({ id: tr.cells[0].textContent.trim(), name: tr.cells[1].textContent.trim(), status: tr.cells[3].textContent.trim() })));
  const summary = () => pg.evaluate(() => (document.querySelector('#pr-osgi .oc-sum') || {}).textContent || '');
  await boot(); await openConsole();
  const r0 = await rows(), s0 = await summary();
  console.log('§OC-LIVE-1 rows=' + r0.length + ' first=' + JSON.stringify(r0[0]) + ' summary="' + s0 + '"');
  const head = await pg.evaluate(() => ({ bar: (document.querySelector('#pr-osgi .oc-bar b') || {}).textContent, cols: [...document.querySelectorAll('#pr-osgi table.oc-t thead th')].map(t => t.textContent.trim()) }));
  ok('C1 the Felix-style page: title bar, columns Id | Name | Version | Status | Actions, Id 0 = the system bundle, built-in modules listed Active', head.cols.join('|') === 'Id|Name|Version|Status|Actions' && /Web Console/.test(head.bar) && r0[0].id === '0' && /system bundle/.test(r0[0].name) && r0.length >= 10 && r0.every(r => r.status === 'Active'), { head: head, r0: r0.slice(0, 2) });
  ok('C2 the Felix summary sentence ("Bundle information: N bundles in total - all N bundles active.")', /^Bundle information: \d+ bundles in total - all \d+ bundles active\.$/.test(s0), s0);
  // install the lazy fixture through the console's own Install/Update box
  await pg.click('#pr-osgi [data-oc-installtoggle]'); await pg.waitForSelector('#pr-osgi [data-oc-url]');
  await pg.fill('#pr-osgi [data-oc-url]', `http://localhost:${port}/erp/tests/fixtures/lazy_probe.mjs`); await pg.click('#pr-osgi [data-oc-doinstall]'); await pg.waitForTimeout(1500);
  const r1 = await rows(), s1 = await summary(), lazyRow = r1.find(r => /lazy-probe/.test(r.name));
  console.log('§OC-LIVE-2 after Install and start: ' + JSON.stringify(lazyRow) + ' summary="' + s1 + '"');
  ok('C3 the lazy fixture installed through the console appears as a new bundle in status STARTING and the summary counts it (starting (lazy))', !!lazyRow && lazyRow.status === 'Starting' && /1 bundle starting \(lazy\)/.test(s1) && r1.length === r0.length + 1, { lazyRow: lazyRow, s1: s1 });
  await pg.click('#pr-osgi a.oc-nm[data-oc-name="' + lazyRow.id + '"]'); await pg.waitForTimeout(300);
  const det = await pg.evaluate(() => (document.querySelector('#pr-osgi tr.oc-d') || {}).textContent || '');
  ok('C4 clicking the name expands the detail pane: symbolic name, lazy triggers (PP_Order), policy, and "not active" services', /com\.test\.lazy-probe/.test(det) && /PP_Order/i.test(det) && /Activation Policy\s*lazy/i.test(det) && /none - the bundle is not active/.test(det), det.slice(0, 300));
  await pg.click('#pr-osgi [data-oc-stop="com.test.lazy-probe"]'); await pg.waitForTimeout(500);
  const st1 = (await rows()).find(r => /lazy-probe/.test(r.name)).status;
  await pg.click('#pr-osgi [data-oc-start="com.test.lazy-probe"]'); await pg.waitForTimeout(500);
  const st2 = (await rows()).find(r => /lazy-probe/.test(r.name)).status;
  ok('C5 Stop returns the bundle to Resolved (as OSGi does) and Start returns it to Starting (lazy)', st1 === 'Resolved' && st2 === 'Starting', { st1: st1, st2: st2 });
  // demand through the page's funnel, then Reload the console
  await pg.evaluate(() => window.__crud.process('PP_Order', 50000, 'CO', { from: 'DR', to: 'CO' })); await pg.waitForTimeout(3000);
  await pg.click('#pr-osgi [data-oc-reload]'); await pg.waitForTimeout(500);
  const st3 = (await rows()).find(r => /lazy-probe/.test(r.name)).status, det3 = await pg.evaluate(() => (document.querySelector('#pr-osgi tr.oc-d') || {}).textContent || '');
  console.log('§OC-LIVE-3 after a pp_order DocAction + Reload: status=' + st3);
  ok('C6 a pp_order DocAction activated it on demand: the console now shows Active and the detail pane lists the registered DocAction class', st3 === 'Active' && /DocAction class\s+pp_order/.test(det3), { st3: st3, det3: det3.slice(0, 400) });
  // persistence: reload the whole page, the stack comes back (policy lazy => STARTING again)
  await boot(); await openConsole();
  const r4 = await rows(), l4 = r4.find(r => /lazy-probe/.test(r.name));
  console.log('§OC-LIVE-4 after a full page reload: ' + JSON.stringify(l4));
  ok('C7 a full page reload restores the stack from persistence: the lazy bundle is back (started, not yet activated = Starting)', !!l4 && l4.status === 'Starting', { l4: l4 });
  await pg.click('#pr-osgi [data-oc-uninstall="com.test.lazy-probe"]'); await pg.waitForTimeout(600);
  ok('C8 Uninstall removes the row and the summary returns to "all N bundles active"', !(await rows()).some(r => /lazy-probe/.test(r.name)) && /all \d+ bundles active/.test(await summary()), { sum: await summary() });
  ok('C9 zero page errors', errs.length === 0, errs.slice(0, 3));
  console.log('§OC-LIVE-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' failed=' + fails); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§OC-LIVE-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
