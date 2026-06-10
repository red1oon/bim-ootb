// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for HISTORY_TAP_TO_IDEMPIERE.md §KNOB — the breadth dial + doc-events on the ERP bar.
//   PROVES (issue: "#216 put the sniffer on the ERP bar but no KNOB — the rich §-stream incl. document events
//            isn't surfaced or dial-able"):
//     1. The KNOB widget (.scrubknob) renders on the ERP history bar.
//     2. Feeding REAL-FORMAT ERP doc-event §-lines through the live sniffer (POSTED/CRUD/RULE/AD_DATA — the
//        actual tags the ERP emits), the knob surfaces them at the right BREADTH via the shared HistoryTap STOPS:
//          off  → strip hidden (0 ticks)
//          low  → milestones only (POSTED)            — NOT CRUD/RULE/AD_DATA
//          mid  → + doc changes (POSTED+CRUD+RULE)     — NOT AD_DATA (a high/aids tag)
//          high → + aids (POSTED+CRUD+RULE+AD_DATA)
//        i.e. count is MONOTONIC low ≤ mid ≤ high, with the exact membership the ladder dictates.
//     3. The knob choice PERSISTS (localStorage idmp.hist.knob).
//     4. PRESS=richness (bloom) labels the doc-event ticks with their §tag.
//   §-log first — READ tests/poc_idmp_history_knob.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_history_knob.js 2>&1 | tee tests/poc_idmp_history_knob.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // serve bim-ootb root so ../common/history_tap.js resolves
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/erp/idempiere.html';
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

  await page.goto(`http://localhost:${port}/erp/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  // login
  await page.evaluate(() => {
    var r = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'))
      .find(x => !x.classList.contains('disabled'));
    if (r) r.click();
  });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(900);

  // navigate to get a nav moment so the bar shows
  await page.evaluate(() => { document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click()); });
  await page.waitForTimeout(400);
  const leafNames = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  for (const nm of leafNames) {
    const got = await page.evaluate((n) => {
      var row = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'))
        .find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      if (row) { row.click(); return true; } return false;
    }, nm);
    await page.waitForTimeout(450);
    if ((await page.$$eval('#idmp-content .idmp-grid tr', t => t.filter(x => x.querySelector('td')).length).catch(() => 0)) > 0) {
      await page.evaluate(() => { var tr = document.querySelector('#idmp-content .idmp-grid tr td'); if (tr) tr.closest('tr').click(); });
      await page.waitForTimeout(400);
      break;
    }
  }

  // The breadth control is now the shared radial KNOB-DIAL (HISTORY_KNOB_DIAL.md), replacing the old
  // 4-bar .scrubknob — the same widget the viewer uses. The breadth proof below is unchanged (driven via
  // IdmpHistory.setKnob, which the dial's depth ticks call).
  const knobExists = await page.$('#idmp-scrub #hist-knob-idempiere') != null;

  // Feed REAL-FORMAT ERP doc-event §-lines through the LIVE sniffer (same path the ERP's own lines take).
  await page.evaluate(() => {
    console.log('§POSTED doc=C_Invoice id=109 ΣDR=ΣCR=46574.97');   // milestone (low)
    console.log('§CRUD update C_Order id=1023 field=DocStatus');     // doc change (mid)
    console.log('§RULE edit table=C_Order governs=Complete');        // doc change (mid)
    console.log('§AD_DATA load tab=C_OrderLine rows=4');             // aid (high)
  });
  await page.waitForTimeout(200);

  // dial the knob through each stop; read the rendered doc-event ticks (membership + count) per level.
  async function dial(level) {
    const tags = await page.evaluate((lv) => {
      window.IdmpHistory.setKnob(lv);
      return Array.prototype.slice.call(document.querySelectorAll('#idmp-scrub .scrubev'))
        .map(d => (d.getAttribute('title') || '').split(' ')[0]);   // the §tag is the first title token
    }, level);
    return tags;
  }
  const off  = await dial('off');
  const low  = await dial('low');
  const mid  = await dial('mid');
  const high = await dial('high');
  const persisted = await page.evaluate(() => { try { return localStorage.getItem('idmp.hist.knob'); } catch (e) { return null; } });

  const has = (arr, t) => arr.indexOf(t) >= 0;
  console.log('§KNOB off=' + off.length + ' low=[' + low.join(',') + '] mid=[' + mid.join(',') + '] high=[' + high.join(',') + ']');
  console.log('§KNOB knobExists=' + knobExists + ' persisted=' + persisted);

  // bloom → the ticks should carry their §tag text (richness)
  await page.evaluate(() => { var b = document.getElementById('idmp-scrub'); if (b) b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await page.waitForTimeout(250);
  const bloomLabels = await page.$$eval('#idmp-scrub .scrubev', ds => ds.map(d => (d.textContent || '').trim()).filter(Boolean)).catch(() => []);
  console.log('§KNOB bloomLabels=[' + bloomLabels.join('|') + ']');

  // ── verdict ──
  const offHidden   = off.length === 0;
  const lowMilestone = has(low, 'POSTED') && !has(low, 'CRUD') && !has(low, 'RULE') && !has(low, 'AD_DATA');
  const midChanges   = has(mid, 'POSTED') && has(mid, 'CRUD') && has(mid, 'RULE') && !has(mid, 'AD_DATA');
  const highAids     = has(high, 'POSTED') && has(high, 'CRUD') && has(high, 'RULE') && has(high, 'AD_DATA');
  const monotonic    = low.length <= mid.length && mid.length <= high.length;
  const persistOk    = persisted === 'high';
  const bloomOk      = bloomLabels.some(l => /POSTED|CRUD|RULE|AD_DATA/.test(l));

  const pass = knobExists && offHidden && lowMilestone && midChanges && highAids && monotonic && persistOk &&
               bloomOk && errs.length === 0;
  console.log('§KNOB-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' knob=' + knobExists + ' offHidden=' + offHidden + ' lowMilestone=' + lowMilestone +
    ' midChanges=' + midChanges + ' highAids=' + highAids + ' monotonic=' + monotonic +
    ' persist=' + persistOk + ' bloom=' + bloomOk + ' noErr=' + (errs.length ? errs.join('|') : true));

  await page.screenshot({ path: path.join(__dirname, 'idmp_history_knob.png') });
  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
