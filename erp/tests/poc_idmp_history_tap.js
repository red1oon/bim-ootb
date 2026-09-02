// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for HISTORY_TAP_TO_IDEMPIERE.md — the §-tap VIEW-DEPTH ported onto the ERP bar.
//   PROVES (issue: "the idmp_history scrubber restores window/tab/record but NOT the LOOK; the §-stream is not
//            recorded for free"):
//     1. §IDMP-HIST-TAP wired fields(search,clean) + sniffer ON  — the port loaded (no per-feature wiring).
//     2. A moment is STAMPED with the live look: set menu-filter='order' + classic chrome, select a record →
//        that moment carries view{search:'order', clean:false}.
//     3. MOVE ON (clear filter + back to clean pill) → live look changes.
//     4. Click the earlier dot → §EVT RESTORE keys=search,clean RE-FIRES and the LIVE DOM look ROUND-TRIPS:
//        #idmp-menu-filter.value==='order' AND body loses idmp-clean — view-only, ZERO kernel mutations.
//     5. The SNIFFER recorded ERP §acts with zero wiring — dump HistoryTap._all tags (AD_UI/CRUD/KANBAN/… > the bar).
//   §-log first — READ tests/poc_idmp_history_tap.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_history_tap.js 2>&1 | tee tests/poc_idmp_history_tap.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // serve bim-ootb root so ../common/history_tap.js resolves
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/erp/idempiere.html?client=garden';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
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
  await page.evaluate(() => {
    var r = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'))
      .find(x => !x.classList.contains('disabled'));
    if (r) r.click();
  });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(900);

  const tapWired = logs.some(l => /§IDMP-HIST-TAP wired fields\(search,clean\)/.test(l));

  // reveal nested leaves so we can reach a data-rich window
  await page.evaluate(() => { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click()); });
  await page.waitForTimeout(400);

  const leafNames = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  const clickLeaf = async (name) => page.evaluate((nm) => {
    var row = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'))
      .find(r => ((r.querySelector('.nm') || {}).textContent || '') === nm);
    if (row) { row.click(); return true; } return false;
  }, name);
  const gridTrs = () => page.$$eval('#idmp-content .idmp-grid tr', trs => trs.filter(t => t.querySelector('td')).length).catch(() => 0);
  const clickRow = (i) => page.evaluate((idx) => {
    var rs = Array.prototype.slice.call(document.querySelectorAll('#idmp-content .idmp-grid tr')).filter(t => t.querySelector('td'));
    if (rs[idx]) { rs[idx].click(); return true; } return false;
  }, i);

  // reach the first leaf that yields >=2 records
  let win = null;
  for (const nm of leafNames) {
    await clickLeaf(nm); await page.waitForTimeout(500);
    if ((await gridTrs()) >= 2) { win = nm; break; }
  }

  // ── baseline look snapshot (grid view, default: search='', clean pill on) ──
  const viewA = await page.evaluate(() => window.HistoryTap ? window.HistoryTap.currentView() : null);

  // ── set the LOOK FIRST, THEN select a record — a row click enters form view, so the look must be
  //    active BEFORE the record moment fires for that moment to be STAMPED under it (menu filter is
  //    independent of the open grid; classic chrome leaves the grid clickable). ──
  await page.evaluate(() => {
    var el = document.getElementById('idmp-menu-filter');
    el.value = 'order'; el.dispatchEvent(new Event('input', { bubbles: true }));
    if (document.body.classList.contains("idmp-clean")) window.IdmpPillActions.redpill();
  });
  await page.waitForTimeout(300);

  // ── B: the record moment, stamped under the new look {search:'order', clean:false} ──
  await clickRow(0); await page.waitForTimeout(400);
  const viewB = await page.evaluate(() => window.HistoryTap ? window.HistoryTap.currentView() : null);
  const bDotIdx = (await page.$$eval('#idmp-scrub .scrubdot', d => d.length).catch(() => 0)) - 1;   // B = current (last) dot
  console.log('§PROOF stamped viewA={search:"' + (viewA && viewA.search) + '",clean:' + (viewA && viewA.clean) +
    '} viewB={search:"' + (viewB && viewB.search) + '",clean:' + (viewB && viewB.clean) + '} bDotIdx=' + bDotIdx);
  logs.filter(l => l.indexOf('§IDMP-HIST push=') === 0).forEach(p => console.log('   moment ' + p));

  // ── MOVE ON: clear the filter + back to the clean pill (live look now != B) ──
  await page.evaluate(() => {
    var el = document.getElementById('idmp-menu-filter');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
    if (!document.body.classList.contains("idmp-clean")) window.IdmpPillActions.redpill();
  });
  await page.waitForTimeout(300);
  const liveBefore = await page.evaluate(() => ({
    search: (document.getElementById('idmp-menu-filter') || {}).value,
    clean: document.body.classList.contains('idmp-clean')
  }));

  const logLenPreRestore = logs.length;
  // ── click moment B's dot (captured index) → restore its LOOK ──
  await page.evaluate((idx) => {
    var ds = document.querySelectorAll('#idmp-scrub .scrubdot');
    if (ds[idx]) ds[idx].click();
  }, bDotIdx);
  await page.waitForTimeout(700);

  const liveAfter = await page.evaluate(() => ({
    search: (document.getElementById('idmp-menu-filter') || {}).value,
    clean: document.body.classList.contains('idmp-clean')
  }));
  const restoreEvt = logs.slice(logLenPreRestore).find(l => /§EVT RESTORE\|.*keys=/.test(l)) || '(no RESTORE evt)';
  const redpillReFired = logs.slice(logLenPreRestore).some(l => /§REDPILL/.test(l));
  console.log('§PROOF liveBefore={search:"' + liveBefore.search + '",clean:' + liveBefore.clean +
    '} liveAfter={search:"' + liveAfter.search + '",clean:' + liveAfter.clean + '}');
  console.log('§PROOF restoreEvt=' + restoreEvt + ' redpillReFired=' + redpillReFired);

  // ── SNIFFER: zero-wire recording of ERP §acts ──
  const sniffTags = await page.evaluate(() => {
    if (!window.HistoryTap || !window.HistoryTap._all) return { total: 0, tags: [] };
    var seen = {}, out = [];
    window.HistoryTap._all.forEach(function (e) { if (e.tag && !seen[e.tag]) { seen[e.tag] = 1; out.push(e.tag); } });
    return { total: window.HistoryTap._all.length, tags: out };
  });
  console.log('§PROOF sniffer total=' + sniffTags.total + ' distinctTags=[' + sniffTags.tags.join(',') + ']');

  // purity: restore must be view-only — no kernel writes
  const mutations = logs.slice(logLenPreRestore).filter(l => /SET_STATUS|commitOp|§WRITE-|§KANBAN-WRITE/.test(l));

  const lookRoundTripped = liveAfter.search === 'order' && liveAfter.clean === false &&
                           !(liveBefore.search === 'order') && liveBefore.clean === true;
  const restoredKeys = /keys=.*search/.test(restoreEvt) && /keys=.*clean/.test(restoreEvt);
  const stampedB = viewB && viewB.search === 'order' && viewB.clean === false;
  const snifferRich = sniffTags.total > 0 && sniffTags.tags.length >= 3;

  const pass = tapWired && stampedB && lookRoundTripped && restoredKeys && redpillReFired &&
               snifferRich && mutations.length === 0 && errs.length === 0;
  console.log('§TAP-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' tapWired=' + tapWired + ' stampedB=' + stampedB + ' lookRoundTripped=' + lookRoundTripped +
    ' restoredKeys=' + restoredKeys + ' redpillReFired=' + redpillReFired + ' snifferRich=' + snifferRich +
    ' zeroMutations=' + (mutations.length === 0) + ' noErr=' + (errs.length ? errs.join('|') : true));

  await page.screenshot({ path: path.join(__dirname, 'idmp_history_tap.png') });
  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
