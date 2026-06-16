// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for HISTORY_TAP_TO_IDEMPIERE.md §SESSION + the AD_DATA-echo FIX.
//   ISSUE (observed live): the ERP §-tap drain turned §AD_DATA (navigation's data-read echo) into a crumb dot.
//   That (a) DOUBLED every nav dot with a "readRecords" crumb and (b) the DEFERRED re-read during a RESTORE
//   minted a crumb that TRUNCATED the forward branch + bumped idx → the back-arrow could not go back.
//   PROVES the fix (AD_DATA in _ERP_EXPLICIT_TAGS skip set):
//     1. SUBSCRIBE still wired (§IDMP-HIST-TAP … bar SUBSCRIBES tap (knob=high)).
//     2. NO AD_DATA ECHO: navigating a multi-tab window mints ZERO `§IDMP-HIST crumb tag=AD_DATA` lines.
//     3. BACK-ARROW WORKS: after building N nav dots, clicking ◄ DECREASES the active idx and KEEPS the dot
//        count (no forward-branch truncation) — the exact breakage the user reported.
//     4. REDO PRESERVED: clicking ► returns to the later dot (forward branch intact).
//     5. 0 pageerrors.
//   §-log first — READ tests/poc_idmp_history_subscribe.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_history_subscribe.js 2>&1 | tee tests/poc_idmp_history_subscribe.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
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
  await page.evaluate(() => { var r = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user')).find(x => !x.classList.contains('disabled')); if (r) r.click(); });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(900);

  // open a data-rich window + walk a few tabs/records → build several NAV dots
  await page.evaluate(() => { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click()); });
  await page.waitForTimeout(400);
  const leafNames = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  const clickLeaf = (name) => page.evaluate((nm) => { var row = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf')).find(r => ((r.querySelector('.nm') || {}).textContent || '') === nm); if (row) { row.click(); return true; } return false; }, name);
  const gridTrs = () => page.$$eval('#idmp-content .idmp-grid tr', trs => trs.filter(t => t.querySelector('td')).length).catch(() => 0);
  const clickRow = (i) => page.evaluate((idx) => { var rs = Array.prototype.slice.call(document.querySelectorAll('#idmp-content .idmp-grid tr')).filter(t => t.querySelector('td')); if (rs[idx]) { rs[idx].click(); return true; } return false; }, i);
  const clickTab = (i) => page.evaluate((idx) => { var ts = document.querySelectorAll('#idmp-tabstrip .idmp-tab, .idmp-tab'); if (ts[idx]) { ts[idx].click(); return true; } return false; }, i);
  for (const nm of leafNames) { await clickLeaf(nm); await page.waitForTimeout(450); if ((await gridTrs()) >= 2) break; }
  await clickRow(0); await page.waitForTimeout(350);   // record
  await clickTab(1); await page.waitForTimeout(350);   // child tab
  await clickTab(0); await page.waitForTimeout(350);   // back to parent tab
  await clickRow(1); await page.waitForTimeout(450);   // another record

  const dotState = () => page.evaluate(() => {
    var dots = Array.prototype.slice.call(document.querySelectorAll('#idmp-scrub .scrubdot'));
    var on = dots.findIndex(d => d.classList.contains('on'));
    return { count: dots.length, idx: on, crumbs: dots.filter(d => d.classList.contains('crumb')).length };
  });

  let pass = 0, fail = 0;
  const ok = (n, c, x) => { console.log('   ' + (c ? '🟢' : '🔴') + ' ' + n + (x ? ' — ' + x : '')); c ? pass++ : fail++; };

  ok('W-SUBSCRIBE wired', logs.some(l => /§IDMP-HIST-TAP.*bar SUBSCRIBES tap \(knob=high\)/.test(l)));

  // (2) NO AD_DATA ECHO — navigation must not mint readRecords crumbs
  const adDataCrumbs = logs.filter(l => /§IDMP-HIST crumb tag=AD_DATA/.test(l)).length;
  ok('W-NO-ADDATA-ECHO (nav no longer doubles dots)', adDataCrumbs === 0, 'AD_DATA crumbs=' + adDataCrumbs);

  // (3) BACK-ARROW WORKS — idx decreases, dot count preserved (no truncation)
  const before = await dotState();
  console.log('§PROOF before-back ' + JSON.stringify(before));
  await page.click('#idmp-scrub-back'); await page.waitForTimeout(500);
  const afterBack = await dotState();
  console.log('§PROOF after-back ' + JSON.stringify(afterBack));
  ok('W-BACKNAV idx decreased', afterBack.idx >= 0 && afterBack.idx < before.idx, before.idx + '→' + afterBack.idx);
  ok('W-BACKNAV forward branch NOT truncated', afterBack.count === before.count, before.count + '→' + afterBack.count);

  // (4) REDO PRESERVED — forward returns to the later dot
  await page.click('#idmp-scrub-fwd'); await page.waitForTimeout(500);
  const afterFwd = await dotState();
  console.log('§PROOF after-fwd ' + JSON.stringify(afterFwd));
  ok('W-REDO forward returns', afterFwd.idx === before.idx && afterFwd.count === before.count, afterBack.idx + '→' + afterFwd.idx);

  ok('no pageerrors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('§ERP-BACKNAV-RESULT ' + (fail === 0 ? 'PASS' : 'FAIL') + ' pass=' + pass + ' fail=' + fail);
  await page.screenshot({ path: path.join(__dirname, 'idmp_history_subscribe.png') });
  await browser.close(); server.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
