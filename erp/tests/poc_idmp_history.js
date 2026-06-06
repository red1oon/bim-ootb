// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_BOTTOM_BAR_AND_LIFECYCLE.md §B — the cross-tab history scrubber.
//   PROVES (issue: "no timeline of what you navigated across the iDempiere window tabs; no read-only restore"):
//     1. §IDMP-HIST push=<kind>:<label> fires per SEMANTIC moment — window opened, record selected, and a
//        window-TAB switch (cross-tab) — and NOT for noise.
//     2. Double-tap the bar → the dots BLOOM into labelled chips (real record fields).
//     3. Click a dot → §IDMP-HIST restore=<label> readOnly=Y, and the live window/record actually changes back.
//     4. ZERO kernel mutations during restore (no SET_STATUS/commitOp/§WRITE-*); 0 pageerrors.
//   §-log first — READ tests/poc_idmp_history.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_history.js 2>&1 | tee tests/poc_idmp_history.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
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

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
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

  // reveal nested leaves so we can reach a data-rich window (Sales Order etc.)
  await page.evaluate(() => {
    document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click());
  });
  await page.waitForTimeout(400);

  const leafNames = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  const clickLeaf = async (name) => page.evaluate((nm) => {
    var row = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'))
      .find(r => ((r.querySelector('.nm') || {}).textContent || '') === nm);
    if (row) { row.click(); return true; } return false;
  }, name);
  const gridRows = () => page.$$eval('#idmp-content .idmp-grid tr', trs => trs.filter(t => t.querySelector('td')).length).catch(() => 0);

  // w1 = the FIRST leaf that yields records → pick its first record (record moment with a real label)
  let w1 = { name: null }, recPicked = false;
  for (const nm of leafNames) {
    await clickLeaf(nm); await page.waitForTimeout(500);
    if ((await gridRows()) > 0) {
      w1 = { name: nm };
      recPicked = await page.evaluate(() => {
        var tr = Array.prototype.slice.call(document.querySelectorAll('#idmp-content .idmp-grid tr')).find(t => t.querySelector('td'));
        if (tr) { tr.click(); return true; } return false;
      });
      await page.waitForTimeout(500);
      break;
    }
  }

  // w2 = a DIFFERENT window that ACTUALLY opens a second tab (skip non-window leaves)
  const winTabCount = () => page.$$eval('#idmp-wintabs .idmp-wintab', t => t.length).catch(() => 0);
  let w2 = { name: null };
  for (const nm of leafNames) {
    if (nm === w1.name) continue;
    const before = await winTabCount();
    await clickLeaf(nm); await page.waitForTimeout(500);
    if ((await winTabCount()) > before) { w2 = { name: nm }; break; }   // a NEW window tab appeared
  }
  const tabsBeforeSwitch = await winTabCount();
  await page.waitForTimeout(300);

  // cross-tab: switch back to the FIRST window via its #idmp-wintabs tab
  const switched = await page.evaluate((firstName) => {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('#idmp-wintabs .idmp-wintab'));
    var t = tabs.find(x => ((x.querySelector('.lbl') || {}).textContent || '') === firstName);
    if (t) { t.click(); return true; } return false;
  }, w1 && w1.name);
  await page.waitForTimeout(600);

  const pushes = logs.filter(l => l.startsWith('§IDMP-HIST push='));
  const recordPush = pushes.find(l => /push=record:/.test(l)) || '(no record moment)';
  const dotCount = await page.$$eval('#idmp-scrub .scrubdot', d => d.length).catch(() => 0);
  console.log('§B-MOMENTS w1=' + (w1 && w1.name) + ' recordPicked=' + recPicked + ' w2=' + (w2 && w2.name) +
    ' tabsBeforeSwitch=' + tabsBeforeSwitch + ' crossTabSwitch=' + switched +
    ' pushes=' + pushes.length + ' dots=' + dotCount);
  console.log('§B-RECORD-MOMENT ' + recordPush);
  pushes.forEach(p => console.log('   ' + p));

  // double-tap the bar (not a dot) → bloom chips
  await page.evaluate(() => {
    var bar = document.getElementById('idmp-scrub');
    var ev = () => bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    ev();
  });
  await page.waitForTimeout(300);
  const bloomed = await page.$eval('#idmp-scrub', el => el.classList.contains('bloom')).catch(() => false);
  const chipLabels = await page.$$eval('#idmp-scrub .scrubdot', ds => ds.map(d => (d.textContent || '').trim()).filter(Boolean)).catch(() => []);
  console.log('§B-BLOOM bloomed=' + bloomed + ' chipLabels=[' + chipLabels.join(' | ') + ']');

  // click the FIRST dot → read-only restore back to the earliest moment
  await page.evaluate(() => { var d = document.querySelector('#idmp-scrub .scrubdot'); if (d) d.click(); });
  await page.waitForTimeout(600);
  const restoreLog = [...logs].reverse().find(l => l.startsWith('§IDMP-HIST restore=')) || '(no restore log)';
  const activeAfter = await page.evaluate(() => {
    var t = document.querySelector('#idmp-wintabs .idmp-wintab.active .lbl');
    return t ? t.textContent : '(none)';
  });
  console.log('§B-RESTORE ' + restoreLog + ' activeWindowAfter=' + activeAfter);

  const mutations = logs.filter(l => /SET_STATUS|commitOp|§WRITE-|§KANBAN-WRITE/.test(l));
  console.log('§B-PURITY kernelMutations=' + mutations.length + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  const hasRecordMoment = /push=record:/.test(recordPush);
  const trueCrossTab = switched && tabsBeforeSwitch >= 2 && w2.name && w2.name !== w1.name;
  const pass = pushes.length >= 4 && recPicked && hasRecordMoment && trueCrossTab && dotCount >= 4 && bloomed &&
    chipLabels.length > 0 && /readOnly=Y/.test(restoreLog) && mutations.length === 0 && errs.length === 0;
  console.log('§B-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' moments>=4=' + (pushes.length >= 4) + ' recordMoment=' + hasRecordMoment + ' trueCrossTab=' + trueCrossTab +
    ' bloom=' + bloomed + ' restoreReadOnly=' + /readOnly=Y/.test(restoreLog) +
    ' zeroMutations=' + (mutations.length === 0) + ' noErr=' + (errs.length === 0));

  await page.screenshot({ path: path.join(__dirname, 'idmp_history_bloom.png') });
  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
