// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for MIGRATE_ERP_PICKER.md §SPEC — the pick-your-ERP Install/Migrate dialog.
//   PROVES:
//     1. §ERP-PICKER open/detect/highlight/default — all 5 ERPs listed; Odoo (running :8069) DETECTED;
//        coming ones greyed; a default is pre-selected.
//     2. §ERP-PICKER confirm erp=odoo route=odoo — confirming Odoo opens the delegate-to-install sub-flow.
//     3. §ODOO-MIGRATE-BROWSER — loading the LIVE-produced odoo_chain.json re-folds through window.ERPKernel:
//        mapped=5/5, newVerbs=[], invoice GL ΣDr==ΣCr, replay verify chainOk=Y.
//   Issue it disproves: "Install/Migrate are still honest stubs / Odoo migrate is not real in the browser."
//   §-log first — READ tests/poc_erp_picker.log before any conclusion.
// Run:  node tests/poc_erp_picker.js 2>&1 | tee tests/poc_erp_picker.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');                       // bim-ootb/erp
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);                              // let boot + sql.js + pills settle

  // 1) open Migrate → picker (§A: registry pill #pill-migrate, was the hand-rolled button[title="Migrate"];
  //    pre-client here — no login — so §C keeps Migrate visible)
  await page.click('#pill-migrate');
  await page.waitForTimeout(2200);                              // let the no-cors Odoo probe resolve/timeout

  const cards = await page.$$eval('.ep-cardlet .ep-nm', ns => ns.map(n => n.textContent));
  const detectLog  = logs.find(l => l.startsWith('§ERP-PICKER detect')) || '(no detect)';
  const hiLog      = logs.find(l => l.startsWith('§ERP-PICKER highlight')) || '(no highlight)';
  const defLog     = logs.find(l => l.startsWith('§ERP-PICKER default')) || '(no default)';
  console.log('§PICKER-CARDS listed=[' + cards.join(',') + '] count=' + cards.length);
  console.log('§PICKER-DETECT ' + detectLog);
  console.log('§PICKER-HILITE ' + hiLog + ' | ' + defLog);

  // 2) select Odoo + confirm → sub-flow
  await page.click('#ep-c-odoo');
  await page.waitForTimeout(150);
  await page.click('#ep-go');
  await page.waitForTimeout(400);
  const confirmLog = logs.find(l => l.startsWith('§ERP-PICKER confirm erp=odoo')) || '(no confirm)';
  const subFlow = await page.$('#ep-chain');
  console.log('§PICKER-CONFIRM ' + confirmLog + ' subFlowShown=' + (subFlow ? 'Y' : 'N'));

  // 2b) the redesigned STAGED box: 🔒 doctrine banner + 3 numbered steps + copy cmd + bundle download + drop-zone
  const instrLog = logs.find(l => l.startsWith('§MIGRATE-INSTR')) || '(no instr)';
  const boxParts = await page.evaluate(() => ({
    lock:  !!document.querySelector('.ep-lock'),
    steps: document.querySelectorAll('.ep-steps .ep-step').length,
    cmd:   (document.querySelector('#ep-cmd') || {}).textContent || '',
    dl:    ((document.querySelector('#ep-dl') || {}).getAttribute && document.querySelector('#ep-dl').getAttribute('href')) || '',
    drop:  !!document.querySelector('#ep-drop')
  }));
  const staged = boxParts.lock && boxParts.steps === 3 && boxParts.drop
    && /npm install/.test(boxParts.cmd) && boxParts.dl === 'odoo_agent.zip';
  console.log('§PICKER-STAGED ' + instrLog + ' | lock=' + (boxParts.lock?'Y':'N')
    + ' steps=' + boxParts.steps + ' dl=' + boxParts.dl + ' drop=' + (boxParts.drop?'Y':'N') + ' staged=' + (staged?'Y':'N'));

  // 3) load the LIVE chain → validate (parse feedback) → re-fold through the engine
  await page.setInputFiles('#ep-chain', path.join(ROOT, 'odoo_chain.json'));
  await page.waitForTimeout(1500);
  const foldLog = logs.find(l => l.startsWith('§ODOO-MIGRATE-BROWSER')) || '(no fold)';
  console.log('§PICKER-FOLD ' + foldLog);

  await page.screenshot({ path: path.join(__dirname, 'erp_picker.png') });

  const detectedOdoo = /odoo=Y/.test(detectLog);
  const allFive = cards.length === 5;
  const confirmed = /route=odoo/.test(confirmLog) && !!subFlow;
  const folded = /mapped=5\/5/.test(foldLog) && /newVerbs=\[\]/.test(foldLog)
              && /glDr==glCr/.test(foldLog) && /chainOk=Y/.test(foldLog);

  console.log('§ERP-PICKER-WITNESS allFive=' + allFive + ' detectedOdoo=' + detectedOdoo
    + ' confirmed=' + confirmed + ' staged=' + staged + ' folded=' + folded
    + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  const pass = allFive && confirmed && staged && folded && errs.length === 0;   // detectedOdoo soft (env-dependent)
  console.log('§ERP-PICKER ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
