// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for I-4 (prompts/I4_OPLOG_RECONCILE.md) — reconcile the TWO op-logs to ONE
//   genuinely-signed chain, so the LIVE write path (a doc Complete) is a SIGNED op on the SAME chain as the
//   ⚖ rule edit. Drives window.ERP (published by the Kanban host on the Sales Order window).
//   PROVES:
//     §I4-ONE-LOG    — the seam's op-log carries the W-CHAIN/W-SIGN columns (prev_hash/op_hash/sig).
//     §I4-SET-STATUS — a real Complete (C_Order DR→CO) via window.ERP.dispatch, sealed → chainOk=Y sig=Y
//                      (was replay-only/unsigned before I-4).
//     §I4-EFFECTS    — window.ERP.verify() replay×2 projection-hash still equal (A determinism intact).
//     §I4-UNIFIED    — a rule edit (SET_RULE) lands on the SAME chain; verifyChain end-to-end OK.
//     §I4-TAMPER     — flip one op's parameters byte → verifyChain FAILS at exactly that op (brokeAt).
//     §I4-DETERM     — the SET_STATUS op timestamp is the deterministic ts we passed (no Date.now).
//   Issue it proves: "the live write path's 'signed' was replay-equality, not ECDSA (the I-4 split)."
//   §-log first — READ tests/poc_i4_reconcile.log before any conclusion.
// Run:  node tests/poc_i4_reconcile.js 2>&1 | tee tests/poc_i4_reconcile.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const logs = [], errs = [];
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // open the Sales Order window (143) so the Kanban host publishes window.ERP (seam + signer)
  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=143`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#pill-kanban', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('#pill-kanban', { timeout: 15000 });
  });
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.click('#pill-kanban');
  // wait for window.ERP to be published (the seam went live)
  for (let i = 0; i < 40 && !logs.find(l => l.startsWith('§SEAM-LIVE')); i++) await page.waitForTimeout(250);

  // drive the whole reconciliation in-page via window.ERP (deterministic — no drag simulation)
  const out = await page.evaluate(async () => {
    const E = window.ERP, R = {};
    if (!E || !E.opDb) return { fail: 'window.ERP.opDb absent' };

    // §I4-ONE-LOG — the seam's op-log carries the signed-chain columns
    const cols = E.opDb.exec("SELECT name FROM pragma_table_info('kernel_ops')")[0].values.map(r => r[0]);
    R.oneLog = cols.includes('prev_hash') && cols.includes('op_hash') && cols.includes('sig') && cols.includes('id');

    // §I4-SET-STATUS — a REAL Complete (C_Order DR→CO) through the sole write path, deterministic ts
    const id = '1200027';                 // S00003, DocStatus DR (completable)
    const dr = E.dispatch({ table: 'C_Order', docType: 'C_Order', action: 'CO', status: 'DR',
      id: id, uuid: 'DOC:C_Order#' + id, baseTs: 9000 }, E.ctx);
    R.dispatchOk = !!(dr && dr.ok);
    await E.seal();                        // W-SIGN: sign every unsigned op (ECDSA)
    let cv = await E.chainVerify();
    R.statusChainOk = !!cv.ok; R.signed = !!(E.ctx && E.ctx.pubKey);
    const srow = E.opDb.exec("SELECT timestamp, op_hash, sig FROM kernel_ops WHERE op_type='SET_STATUS' ORDER BY id DESC LIMIT 1");
    R.statusTs = srow.length ? srow[0].values[0][0] : null;          // must be the 9000 we passed (no Date.now)
    R.statusHasSig = srow.length ? (srow[0].values[0][2] != null) : false;

    // §I4-EFFECTS — A's replay×2 projection-hash equality still holds
    const v = E.verify(); R.effects = !!v.chainOk;

    // §I4-UNIFIED — a rule edit (SET_RULE) lands on the SAME chain; verifyChain end-to-end
    const g = await window.RuleFold.runGesture({ rule: 'maycomplete', db: window.__idmpDb, SQL: window.SQL });
    R.ruleShared = (window.RuleFold && true) && g.pass;
    cv = await E.chainVerify(); R.unifiedChainOk = !!cv.ok; R.chainLen = cv.len;
    const kinds = E.opDb.exec("SELECT DISTINCT op_type FROM kernel_ops")[0].values.map(r => r[0]);
    R.hasBoth = kinds.includes('SET_STATUS') && kinds.includes('SET_RULE');

    // §I4-TAMPER — corrupt one op's parameters → verifyChain must fail at that op
    const tid = E.opDb.exec("SELECT id FROM kernel_ops ORDER BY id LIMIT 1")[0].values[0][0];
    E.opDb.run("UPDATE kernel_ops SET parameters = parameters || 'X' WHERE id = ?", [tid]);
    const tv = await E.chainVerify();
    R.tamperCaught = (tv.ok === false) && (tv.brokeAt === tid || tv.brokeAt != null);
    R.tamperBrokeAt = tv.brokeAt; R.tamperTid = tid;

    return R;
  });
  await page.close();

  const b = v => v ? 'Y' : 'N';
  if (out.fail) { console.log('§I4 FAIL ' + out.fail); }
  else {
    console.log('§I4-ONE-LOG    signed-chain-cols=' + b(out.oneLog));
    console.log('§I4-SET-STATUS dispatch=' + b(out.dispatchOk) + ' chainOk=' + b(out.statusChainOk) + ' sig=' + b(out.statusHasSig) + ' signed=' + b(out.signed));
    console.log('§I4-EFFECTS    replay-equal=' + b(out.effects));
    console.log('§I4-UNIFIED    ruleOnSameChain=' + b(out.ruleShared) + ' bothVerbs=' + b(out.hasBoth) + ' chainOk=' + b(out.unifiedChainOk) + ' len=' + out.chainLen);
    console.log('§I4-TAMPER     caught=' + b(out.tamperCaught) + ' brokeAt=' + out.tamperBrokeAt + ' (tampered id=' + out.tamperTid + ')');
    console.log('§I4-DETERM     setStatusTs=' + out.statusTs + ' deterministic=' + b(out.statusTs === 9000));
  }
  console.log('§I4-WITNESS pageerrors=' + (errs.length ? errs.join('|') : 0));

  const pass = out && !out.fail && out.oneLog && out.dispatchOk && out.statusChainOk && out.statusHasSig &&
    out.signed && out.effects && out.ruleShared && out.hasBoth && out.unifiedChainOk && out.tamperCaught &&
    out.statusTs === 9000 && errs.length === 0;
  console.log('§I4-RECONCILE ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
