// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_BOTTOM_BAR_AND_LIFECYCLE.md §A — the iDempiere renderer's bottom/side
//   bar is now rendered by the SHARED registry (idmp_pills.js + pills_idmp.json + PillBuilder), retiring the
//   hand-rolled #idmp-pillrail.
//   PROVES (issue: "the iDempiere bar is hand-rolled, NOT the registry; no ⋯ collapse; controls outside the pill"):
//     1. §IDMP-PILLS source=registry — the bar comes from pills_idmp.json via PillBuilder (handAuthored=0).
//     2. The 6 real actions render as registered pills id^="pill-" [posted,graph,kanban,rule,install,migrate];
//        every icon resolves (no §IDMP_PILL_ICON_MISS); the fn binds to the host handler BY ID (NON-INVENT).
//     3. The hand-rolled #idmp-pillrail element is GONE (zero in the DOM); the ⋯ trigger collapses/expands.
//     4. 0 pageerrors. Responsive: bar docks bottom @390px, right-edge strip @1280px.
//   §-log first — READ tests/poc_idmp_pills.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_idmp_pills.js 2>&1 | tee tests/poc_idmp_pills.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');                       // bim-ootb/erp
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

function pillIds(page) {
  return page.$$eval('#idmp-pill button[id^="pill-"]', bs => bs.map(b => b.id.replace('pill-', '')))
    .catch(() => []);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);                              // let DB + pills settle

  const idmpPillsLog = logs.find(l => l.startsWith('§IDMP-PILLS')) || '(no §IDMP-PILLS log)';
  const iconMiss     = logs.filter(l => l.includes('§IDMP_PILL_ICON_MISS')).join(' | ') || 'none';
  const handRoll     = await page.$('#idmp-pillrail');         // the retired hand-roll — must be gone
  const bar          = await page.$('#idmp-pillbar');          // the registry bar — must exist
  const ids          = await pillIds(page);

  console.log('§A-WITNESS-1 ' + idmpPillsLog);
  console.log('§A-WITNESS-2 registryBar=' + (bar ? 'present' : 'MISSING') +
    ' handRolledRail=' + (handRoll ? 'STILL-PRESENT' : 'gone') +
    ' pillIds=[' + ids.join(',') + ']');
  console.log('§A-WITNESS-3 iconMiss=' + iconMiss + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  // ⋯ collapse: toggle the trigger twice, confirm the pill container hides then shows.
  const trig = await page.$('#idmp-pill-trigger');
  let collapsed = 'no-trigger', expanded = 'no-trigger';
  if (trig) {
    await trig.click(); await page.waitForTimeout(250);
    collapsed = await page.$eval('#idmp-pill', el => getComputedStyle(el).display);
    await trig.click(); await page.waitForTimeout(250);
    expanded = await page.$eval('#idmp-pill', el => getComputedStyle(el).display);
  }
  console.log('§A-WITNESS-4 overflow-collapse afterToggle1=' + collapsed + ' afterToggle2=' + expanded);

  await page.screenshot({ path: path.join(__dirname, 'idmp_pills_desktop_1280.png') });

  // Responsive: dock at the bottom on a phone viewport.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(400);
  const dock = await page.evaluate(() => {
    var b = document.getElementById('idmp-pillbar'); if (!b) return { docked: false };
    var r = b.getBoundingClientRect(), vh = document.documentElement.clientHeight;
    return { docked: (r.bottom >= vh - 2 && r.left <= 2), bottom: Math.round(r.bottom), vh: vh };
  });
  console.log('§A-WITNESS-5 mobileBottomDock=' + dock.docked + ' bottom=' + dock.bottom + ' vh=' + dock.vh);
  await page.screenshot({ path: path.join(__dirname, 'idmp_pills_mobile_390.png') });

  const EXPECT = ['redpill','posted','preview','graph','kanban','rule','install','migrate','erpdoc','showme'];   // §D red pill (order 0) + erpdoc (v606) + showme (v609) + preview (v625 Posting-Preview lens)
  const idsOk = EXPECT.every(id => ids.includes(id)) && ids.length === EXPECT.length;
  const pass = idsOk && bar && !handRoll && iconMiss === 'none' && errs.length === 0 &&
    /source=registry/.test(idmpPillsLog) && /handAuthored=0/.test(idmpPillsLog);
  console.log('§A-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' idsOk=' + idsOk + ' barPresent=' + !!bar + ' handRollGone=' + !handRoll +
    ' iconClean=' + (iconMiss === 'none') + ' noErr=' + (errs.length === 0));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
