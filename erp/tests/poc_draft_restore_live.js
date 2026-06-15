// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING item 1 (PRIVATE DRAFT RESTORE)
//   browser leg. VALUE correctness is headless (scripts/poc_draft_restore.js W-DRAFT-RESTORE 14/14). This proves
//   the LIVE idempiere.html page wires the parts:
//   (1) crud_overlay v11 loaded → __crud.restoreDraft/bufferDraft + core.draftPut/draftGet/draftClear/draftDirty/
//       draftDrift present (the form-lifecycle draft seam);
//   (2) idmp_history v9 loaded → IdmpHistory.setDraftPip/clearDraftPip present;
//   (3) LIVE CORE round-trip over the page's localStorage: a DIRTY draft buffers (draftGet returns the typed vals +
//       changed cols) and commits ZERO kernel ops (the op-log size is unchanged — no official dot); a CLEAN put
//       clears the buffer; draftDrift flags a tip-moved-underneath col; draftClear removes it;
//   (4) the AMBER pip UI: setDraftPip renders a .scrubdraft (distinct from committed .scrubdot), forces the bar
//       visible, and a tap fires the onRestore callback (the opt-in restore); clearDraftPip removes it;
//   (5) restoreDraft is callable and safely no-ops (returns false) when no form is open;
//   (6) 0 pageerrors.
//   §-log first — READ tests/poc_draft_restore_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_draft_restore_live.js   (cwd = bim-ootb/erp)
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
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) crud seam present
  const c = await page.evaluate(() => ({
    restore: !!(window.__crud && typeof window.__crud.restoreDraft === 'function'),
    buffer: !!(window.__crud && typeof window.__crud.bufferDraft === 'function'),
    core: !!(window.__crud && window.__crud.core && ['draftPut','draftGet','draftClear','draftDirty','draftDrift'].every(k => typeof window.__crud.core[k] === 'function'))
  }));
  ok('crud_overlay v11: __crud.restoreDraft/bufferDraft + core.draft* present', c.restore && c.buffer && c.core, JSON.stringify(c));

  // (2) idmp_history pip API present
  const h = await page.evaluate(() => !!(window.IdmpHistory && typeof window.IdmpHistory.setDraftPip === 'function' && typeof window.IdmpHistory.clearDraftPip === 'function'));
  ok('idmp_history v9: IdmpHistory.setDraftPip/clearDraftPip present', h);

  // (3) LIVE CORE round-trip over localStorage + NO kernel op committed (private — never an official dot).
  const round = await page.evaluate(async () => {
    const C = window.__crud.core, S = window.localStorage;
    function opCount() { return new Promise(res => window.__crud.withSidecar(function (db) {
      try { var r = db.exec('SELECT COUNT(*) FROM kernel_ops'); res(r.length && r[0].values.length ? r[0].values[0][0] : 0); } catch (e) { res(-1); } })); }
    const before = await opCount();
    S.removeItem('erpdraft:c_order:1');
    // DIRTY put: typed GrandTotal 1500 over a baseline tip of 1000.
    const put = C.draftPut(S, 'c_order', 1, { GrandTotal: '1500' }, { baseline: { GrandTotal: '1000' }, tipSnapshot: { GrandTotal: '1000' }, ts: 1 });
    const got = C.draftGet(S, 'c_order', 1);
    const after = await opCount();
    // drift: the official tip moved to 1200 underneath the draft (snapshot was 1000) → flag GrandTotal.
    const drift = C.draftDrift(got, { GrandTotal: '1200' });
    // CLEAN put (no change vs baseline) clears the buffer.
    const clean = C.draftPut(S, 'c_order', 1, { GrandTotal: '1000' }, { baseline: { GrandTotal: '1000' }, ts: 2 });
    const afterClean = C.draftGet(S, 'c_order', 1);
    return { putCols: put && put.cols, gotVal: got && got.vals && got.vals.GrandTotal, opsBefore: before, opsAfter: after,
             drift: drift.drifted, driftCols: drift.cols, cleanReturned: clean, clearedAfterClean: afterClean };
  });
  ok('LIVE draftPut(dirty) buffers cols + draftGet returns the typed value, ZERO kernel ops committed',
     round && JSON.stringify(round.putCols) === JSON.stringify(['GrandTotal']) && round.gotVal === '1500' && round.opsAfter === round.opsBefore,
     JSON.stringify({ cols: round.putCols, val: round.gotVal, opsBefore: round.opsBefore, opsAfter: round.opsAfter }));
  ok('LIVE draftDrift flags the tip-moved-underneath col (never silent clobber)',
     round && round.drift === true && JSON.stringify(round.driftCols) === JSON.stringify(['GrandTotal']), JSON.stringify({ drift: round.drift, cols: round.driftCols }));
  ok('LIVE draftPut(clean) clears the buffer (no stranded pip)', round && round.cleanReturned === null && round.clearedAfterClean === null, JSON.stringify({ clean: round.cleanReturned, after: round.clearedAfterClean }));

  // (4) AMBER pip UI: render distinct, force bar visible, tap fires onRestore; clear removes.
  const pip = await page.evaluate(() => {
    window.__bfRestoreFired = false;
    window.IdmpHistory.setDraftPip({ table: 'c_order', id: 1, cols: ['GrandTotal'] }, function () { window.__bfRestoreFired = true; });
    const bar = document.getElementById('idmp-scrub');
    const dp = document.querySelector('#idmp-scrub .scrubdraft');
    const isDistinct = !!dp && !dp.classList.contains('scrubdot');
    const barShown = !!(bar && bar.classList.contains('show'));
    if (dp) dp.click();   // opt-in restore
    const fired = window.__bfRestoreFired === true;
    window.IdmpHistory.clearDraftPip('c_order', 1);
    const gone = !document.querySelector('#idmp-scrub .scrubdraft');
    return { hasPip: !!dp, isDistinct: isDistinct, barShown: barShown, fired: fired, gone: gone };
  });
  ok('AMBER pip renders (.scrubdraft, distinct from .scrubdot) + forces the bar visible', pip.hasPip && pip.isDistinct && pip.barShown, JSON.stringify(pip));
  ok('pip tap fires the opt-in restore callback; clearDraftPip removes the pip', pip.fired && pip.gone, JSON.stringify({ fired: pip.fired, gone: pip.gone }));

  // (5) restoreDraft no-ops safely with no open form
  const noform = await page.evaluate(() => window.__crud.restoreDraft());
  ok('restoreDraft() safe no-op (false) when no form is open', noform === false, String(noform));

  // (6) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.join(' | ') : '');

  const loaded = logs.some(l => /§DRAFT-PUT|§IDMP-HIST setDraftPip/.test(l));
  ok('§ draft wiring logged live (DRAFT-PUT / setDraftPip)', loaded);

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-DRAFT-RESTORE-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
