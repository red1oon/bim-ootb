// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for HISTORY_TAP_TO_IDEMPIERE.md §SESSION — the ERP bar SUBSCRIBES to the §-tap
//   (the twin of viewer #340). PROVES (issue: "the sniffer records every ERP § act but only window/tab/record
//   nav dots — kanban/search/graph/data acts never dotted"):
//     1. §IDMP-HIST-TAP shows "bar SUBSCRIBES tap (knob=high)" — the subscription wired.
//     2. After a real post-login act sequence (open data window → select records → §AD_DATA, a high-set act),
//        #idmp-scrub gains ≥1 CRUMB dot (.scrubdot.crumb) AND a §IDMP-HIST crumb log line fired — from the
//        §-stream, with NO per-feature wiring (no _histPush for that tag).
//     3. DENY tuning holds: the boot-infra/echo tags (§VFS/§AD_PARSER/§IDEMPIERE/§WHOLE) produce NO crumb.
//     4. Clicking a crumb dot is READ-ONLY (§IDMP-HIST go opLogMutated=NO; zero kernel writes).
//     5. 0 pageerrors (the inline _drainErpTap/_wireErpTap edits parse + run).
//   §-log first — READ tests/poc_idmp_history_subscribe.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_history_subscribe.js 2>&1 | tee tests/poc_idmp_history_subscribe.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');   // serve bim-ootb root so ../common/history_tap.js resolves
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/erp/idempiere.html?client=garden';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/erp/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  // login (first enabled user → Log In)
  await page.evaluate(() => { var r = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user')).find(x => !x.classList.contains('disabled')); if (r) r.click(); });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(900);

  // reach a data-rich window + select records (a real act → §AD_DATA, a high-set tag → a crumb)
  await page.evaluate(() => { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click()); });
  await page.waitForTimeout(400);
  const leafNames = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  const clickLeaf = (name) => page.evaluate((nm) => { var row = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).find(r => ((r.querySelector('.nm') || {}).textContent || '') === nm); if (row) { row.click(); return true; } return false; }, name);
  const gridTrs = () => page.$$eval('#idmp-content .idmp-grid tr', trs => trs.filter(t => t.querySelector('td')).length).catch(() => 0);
  const clickRow = (i) => page.evaluate((idx) => { var rs = Array.prototype.slice.call(document.querySelectorAll('#idmp-content .idmp-grid tr')).filter(t => t.querySelector('td')); if (rs[idx]) { rs[idx].click(); return true; } return false; }, i);

  for (const nm of leafNames) { await clickLeaf(nm); await page.waitForTimeout(450); if ((await gridTrs()) >= 2) break; }
  // a few real acts AFTER login (first one ARMS the drain, the rest drain into crumbs)
  await clickRow(0); await page.waitForTimeout(350);
  await clickRow(1); await page.waitForTimeout(350);
  await page.evaluate(() => { var el = document.getElementById('idmp-menu-filter'); if (el) { el.value = 'a'; el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.waitForTimeout(350);
  await clickRow(0); await page.waitForTimeout(450);

  let pass = 0, fail = 0;
  const ok = (n, c, x) => { console.log('   ' + (c ? '🟢' : '🔴') + ' ' + n + (x ? ' — ' + x : '')); c ? pass++ : fail++; };

  // (1) subscription wired
  ok('W-ERP-SUBSCRIBE wired', logs.some(l => /§IDMP-HIST-TAP.*bar SUBSCRIBES tap \(knob=high\)/.test(l)));

  // (2) crumb dots painted from the §-stream
  const crumbDots = await page.$$eval('#idmp-scrub .scrubdot.crumb', d => d.length).catch(() => 0);
  const crumbLines = logs.filter(l => /§IDMP-HIST crumb tag=/.test(l));
  const crumbTags = crumbLines.map(l => (l.match(/tag=([A-Z0-9_]+)/) || [])[1]).filter(Boolean);
  console.log('§PROOF crumbDots=' + crumbDots + ' crumbTags=[' + Array.from(new Set(crumbTags)).join(',') + ']');
  ok('W-ERP-CRUMB-DOT painted from §-stream', crumbDots >= 1 && crumbLines.length >= 1, 'dots=' + crumbDots);

  // (3) DENY tuning — denied infra/echo never crumbs
  const denied = ['VFS', 'AD_PARSER', 'IDEMPIERE', 'WHOLE'];
  const leaked = denied.filter(t => crumbTags.indexOf(t) !== -1);
  ok('W-ERP-DENY infra/echo excluded', leaked.length === 0, leaked.length ? 'LEAKED=' + leaked : 'none of [' + denied + ']');

  // (4) the crumb tag is a real act NOT minted by a nav push (window/tab/record) — proves zero-wire coverage
  const navKinds = ['window', 'tab', 'record'];
  ok('W-ERP-NO-DOUBLE crumb≠nav', crumbTags.length > 0 && crumbTags.every(t => navKinds.indexOf(t) === -1));

  // (5) click a crumb dot → read-only (no kernel mutation)
  const preLen = logs.length;
  await page.evaluate(() => { var c = document.querySelector('#idmp-scrub .scrubdot.crumb'); if (c) c.click(); });
  await page.waitForTimeout(400);
  const readOnly = logs.slice(preLen).some(l => /§IDMP-HIST go .*opLogMutated=NO/.test(l));
  const muts = logs.slice(preLen).filter(l => /SET_STATUS|commitOp|§WRITE-|§KANBAN-WRITE/.test(l));
  ok('W-ERP-CRUMB-RESTORE read-only', readOnly && muts.length === 0, 'mutations=' + muts.length);

  ok('no pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('§ERP-SUBSCRIBE-RESULT ' + (fail === 0 ? 'PASS' : 'FAIL') + ' pass=' + pass + ' fail=' + fail);
  await page.screenshot({ path: path.join(__dirname, 'idmp_history_subscribe.png') });
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
