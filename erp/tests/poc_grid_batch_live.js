// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING item 4 (GRID MULTI-SELECT +
//   GEAR BATCH PROCESS). Spec: prompts/GRID_BATCH_FORM_PILL_SPEC.md item 4. The DocAction FSM correctness is
//   already headless-proven (AdDocFsm, W-*-FSM); this proves only that the LIVE idempiere.html grid wires:
//   (1) a checkbox column — one input[data-batch-cb] per row + a select-all;
//   (2) ticking ≥2 rows reveals #idmp-batchbar with the "N selected" gear lead + ≥1 legal DocAction button;
//   (3) clicking a batch action fans _fsmCtx.dispatch over the selection → §GRID-BATCH ok=k logged + the
//       ticked rows' DocStatus advances (the legal-action intersection changes after);
//   (4) the ✕ clear empties the bar; 0 pageerrors.
//   §-log first — READ tests/poc_grid_batch_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_grid_batch_live.js   (cwd = bim-ootb/erp)  → W-GRID-BATCH
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
  let logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // window=167 = the Invoice window (8 CO docs in ad_seed.db — a walked DocAction table), opens AFTER login in GRID view.
  await page.goto(`http://localhost:${port}/idempiere.html?window=167`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(1600);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) checkbox column present, one per row + a select-all
  const grid = await page.evaluate(() => {
    const tbl = document.querySelector('.idmp-grid');
    const rows = tbl ? tbl.querySelectorAll('tbody tr').length : 0;
    const cbs = tbl ? tbl.querySelectorAll('tbody input[data-batch-cb]').length : 0;
    const selall = !!document.getElementById('idmp-grid-selall');
    return { grid: !!tbl, rows, cbs, selall };
  });
  ok('grid in view with a checkbox column (1/row + select-all)', grid.grid && grid.rows >= 2 && grid.cbs === grid.rows && grid.selall, JSON.stringify(grid));

  // (2) tick the first 2 rows → batch bar shows "N selected" + ≥1 legal DocAction button
  logs = [];
  const sel = await page.evaluate(() => {
    const cbs = Array.prototype.slice.call(document.querySelectorAll('.idmp-grid tbody input[data-batch-cb]')).slice(0, 2);
    cbs.forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    const bar = document.getElementById('idmp-batchbar');
    const acts = bar ? Array.prototype.slice.call(bar.querySelectorAll('[data-batch-action]')).map(b => b.getAttribute('data-batch-action')) : [];
    return { visible: bar && bar.style.display !== 'none', lead: bar ? (bar.querySelector('.idmp-batch-lead') || {}).textContent : '', acts };
  });
  ok('ticking 2 rows reveals #idmp-batchbar with the gear "2 selected" lead', sel.visible && /2 selected/.test(sel.lead || ''), JSON.stringify({ visible: sel.visible, lead: (sel.lead || '').trim() }));
  ok('batch bar offers ≥1 legal DocAction (the FSM intersection of the selection)', sel.acts.length >= 1, 'acts=[' + sel.acts.join(',') + ']');

  // (3) click the first batch action → §GRID-BATCH ok=k logged + the intersection changes (status advanced)
  let firstAct = sel.acts[0];
  const ran = await page.evaluate((act) => {
    const bar = document.getElementById('idmp-batchbar');
    const btn = bar && bar.querySelector('[data-batch-action="' + act + '"]');
    if (btn) btn.click();
    return !!btn;
  }, firstAct);
  await page.waitForTimeout(500);
  const batchLog = [...logs].reverse().find(l => l.startsWith('§GRID-BATCH')) || '(none)';
  console.log('§GRID-BATCH-CLICK act=' + firstAct + ' ' + batchLog);
  const okN = /ok=([1-9])/.test(batchLog);
  ok('clicking the batch action fans the DocAction (ok=k≥1 in §GRID-BATCH)', ran && okN, batchLog);

  const after = await page.evaluate(() => {
    const bar = document.getElementById('idmp-batchbar');
    return bar ? Array.prototype.slice.call(bar.querySelectorAll('[data-batch-action]')).map(b => b.getAttribute('data-batch-action')) : null;
  });
  ok('batch bar re-folds after dispatch (legal set recomputed for the advanced status)', after && JSON.stringify(after) !== JSON.stringify(sel.acts), 'before=[' + sel.acts.join(',') + '] after=[' + (after || []).join(',') + ']');

  // (4) clear (✕) empties the bar
  const cleared = await page.evaluate(() => {
    const bar = document.getElementById('idmp-batchbar');
    const x = bar && bar.querySelector('.idmp-batch-clear');
    if (x) x.click();
    return true;
  });
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => {
    const bar = document.getElementById('idmp-batchbar');
    const anyChecked = document.querySelectorAll('.idmp-grid tbody input[data-batch-cb]:checked').length;
    return { hidden: !bar || bar.style.display === 'none', anyChecked };
  });
  ok('✕ clear empties the selection + hides the bar', cleared && gone.hidden && gone.anyChecked === 0, JSON.stringify(gone));

  // (5) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-GRID-BATCH: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
