// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that kanban DRAG → a REAL signed SET_STATUS via window.ERP (gap #1 closed).
//   THE CLAIM (LENS_FAMILY §F2 / GAP-LEDGER #1): the board chrome + drag-resolution were done, but dispatch/ctx
//   were null (TODO STEP-0) so a legal drag SNAPPED BACK with no write. publishERP() now mounts the seam.
//     1. §SEAM-LIVE — window.ERP is published (dispatch + verify), role grants the wfmc edges.
//     2. §KANBAN-WRITE — a LEGAL drag commits: §KANBAN-CHROME dispatched ok=true + a signed op (verify chainOk=Y,
//        len grows) + the card DOM actually moves to the target column.
//     3. ILLEGAL drag (no wfmc edge / same column) → snapBack, NO write, chain length unchanged.
//   NON-INVENT: cards are REAL bundle docs (per-row fold), the legal target is a REAL wfmc edge (board.dropZones),
//   the write goes through the seam's dispatch (not a forked verb). §-log first — READ poc_kanban_write.log.
// Run:  node tests/poc_kanban_write.js 2>&1 | tee tests/poc_kanban_write.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream',
  '.wasm':'application/wasm', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/kanban_lens.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
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
  await page.goto(`http://localhost:${port}/kanban_lens.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__kanban && window.ERP && window.ERP.dispatch, { timeout: 20000 })
    .catch(() => {});

  const seamLive = logs.find(l => l.includes('§SEAM-LIVE')) || '(no §SEAM-LIVE)';
  const erpUp = await page.evaluate(() => !!(window.ERP && window.ERP.dispatch && window.ERP.ctx));
  console.log('§SEAM-LIVE erpPublished=' + erpUp + ' :: ' + seamLive);

  // find a REAL card whose status has a legal wfmc edge (board.dropZones), pick that edge as the target
  const pick = await page.evaluate(() => {
    const b = window.__kanban.board;
    for (const c of b.cards) {
      const zones = b.dropZones[c.status] || [];
      if (zones.length) return { key: c.key, table: c.table, id: c.id, from: c.status, to: zones[0].toStatus, action: zones[0].action };
    }
    return null;
  });
  console.log('§KANBAN-PICK ' + JSON.stringify(pick));

  let verifyBefore = await page.evaluate(() => window.ERP.verify().len);

  // LEGAL drop — drive the mount's own _onDrop (same path a real HTML5 drop calls)
  let legal = { moved: false };
  if (pick) {
    legal = await page.evaluate((pk) => {
      window.__kanban._onDrop(pk.key, pk.to);
      // did the card DOM move into the target column?
      const col = document.querySelector('.kanban-col[data-status="' + pk.to + '"]');
      const moved = !!(col && Array.from(col.querySelectorAll('.kanban-card')).some(el => el.dataset.key === pk.key));
      return { moved: moved, status: (window.__kanban.board.cards.find(c => c.key === pk.key) || {}).status, len: window.ERP.verify().len, chainOk: window.ERP.verify().chainOk };
    }, pick);
  }
  const dispatchedLog = logs.find(l => l.includes('§KANBAN-CHROME dispatched')) || '(none)';
  const writeLog = logs.find(l => l.includes('§KANBAN-WRITE ok')) || '(none)';
  console.log('§KANBAN-WRITE moved=' + legal.moved + ' newStatus=' + legal.status + ' chainLen=' + verifyBefore + '->' + legal.len + ' chainOk=' + legal.chainOk);
  console.log('  ' + dispatchedLog);
  console.log('  ' + writeLog);

  // ILLEGAL drop — same column (no edge) → snapBack, chain length unchanged
  const illegal = await page.evaluate(() => {
    const c = window.__kanban.board.cards[0];
    const before = window.ERP.verify().len;
    window.__kanban._onDrop(c.key, c.status);   // drop onto its own column = no edge
    return { before: before, after: window.ERP.verify().len };
  });
  console.log('§KANBAN-ILLEGAL chainLen ' + illegal.before + '->' + illegal.after + ' (unchanged=' + (illegal.before === illegal.after) + ')');

  await page.screenshot({ path: path.join(__dirname, 'kanban_write.png') });

  const pass = erpUp && pick && legal.moved === true && legal.chainOk === true &&
    legal.len === verifyBefore + 1 && illegal.before === illegal.after && errs.length === 0;
  console.log('§KANBAN-WRITE-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
