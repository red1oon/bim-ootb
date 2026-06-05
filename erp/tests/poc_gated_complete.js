// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the GATED SIGNED COMPLETE (prompts/I4_OPLOG_RECONCILE.md §payoff) —
//   the editable, signed L1 rule "an order may Complete iff GrandTotal ≤ T" GATES the real wfmc CO
//   transition, engine-side, on the unified signed chain. Closes the loop: edit the rule → a blocked
//   order now completes.
//   PROVES (drives window.ERP.dispatch + RuleFold.setT on the Sales Order window):
//     §GATED-COMPLETE high order (5002.5) at T=1500 → admit=N why=rule-guard  (the rule BLOCKS it)
//     §GATED-COMPLETE low  order (434.13) at T=1500 → admit=Y signed          (the gate discriminates)
//     §RULE-SET maycomplete T:1500→6000 (one signed op)
//     §GATED-COMPLETE high order (5002.5) at T=6000 → admit=Y signed chainOk=Y (edit the rule → it completes)
//   Issue it proves: "the editable rule is cosmetic — it doesn't actually govern the lifecycle." It does:
//     the guard is in dispatch (the sole write path), so the UI cannot bypass it.
//   §-log first — READ tests/poc_gated_complete.log before any conclusion.
// Run:  node tests/poc_gated_complete.js 2>&1 | tee tests/poc_gated_complete.log   (cwd = bim-ootb/erp)
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

  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=143`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.idmp-pill[title="Kanban"]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('.idmp-pill[title="Kanban"]', { timeout: 15000 });
  });
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.click('.idmp-pill[title="Kanban"]');
  for (let i = 0; i < 40 && !logs.find(l => l.startsWith('§SEAM-LIVE')); i++) await page.waitForTimeout(250);

  const out = await page.evaluate(async () => {
    const E = window.ERP, ad = window.__idmpDb;
    if (!E || !E.opDb) return { fail: 'window.ERP.opDb absent' };
    const statusOf = id => { const r = ad.exec("SELECT DocStatus FROM C_Order WHERE C_Order_ID=" + id); return r.length ? r[0].values[0][0] : 'DR'; };
    let ts = 9000;
    async function complete(id) {           // attempt a real CO transition through the sole write path
      const dr = E.dispatch({ table: 'C_Order', docType: 'C_Order', action: 'CO',
        status: statusOf(id), id: String(id), uuid: 'DOC:C_Order#' + id, baseTs: (ts += 100) }, E.ctx);
      let chainOk = null, signed = null;
      if (dr && dr.ok) { await E.seal(); const cv = await E.chainVerify(); chainOk = !!cv.ok; signed = (E.ctx && E.ctx.pubKey) ? true : false; }
      return { admit: !!(dr && dr.ok), why: dr && dr.rejected ? dr.why : null, op: dr && dr.op_uuid, chainOk, signed };
    }
    const R = {};
    await window.RuleFold.setT('maycomplete', 1500, { SQL: window.SQL });   // signed rule edit → ceiling 1500
    R.highBlocked = await complete(1200002);                                // S00025 = 5002.5 > 1500 → blocked
    R.lowAdmit   = await complete(1200027);                                 // S00003 = 434.13 ≤ 1500 → admitted
    R.raise      = await window.RuleFold.setT('maycomplete', 6000, { SQL: window.SQL }); // raise ceiling (signed)
    R.highAfter  = await complete(1200002);                                 // now 5002.5 ≤ 6000 → admitted
    const cv = await E.chainVerify(); R.chainOk = !!cv.ok; R.chainLen = cv.len;
    return R;
  });
  await page.close();

  const b = v => v ? 'Y' : 'N';
  if (out.fail) console.log('§GATED-COMPLETE FAIL ' + out.fail);
  else {
    console.log('§GATED-COMPLETE order=S00025(5002.5) T=1500 admit=' + b(out.highBlocked.admit) + ' why=' + (out.highBlocked.why || '-'));
    console.log('§GATED-COMPLETE order=S00003(434.13) T=1500 admit=' + b(out.lowAdmit.admit) + ' signedOp=' + (out.lowAdmit.op || '-') + ' chainOk=' + b(out.lowAdmit.chainOk));
    console.log('§RULE-SET maycomplete T:' + out.raise.from + '→' + out.raise.to + ' signedOp=' + (out.raise.uuid ? out.raise.uuid.slice(0, 8) : '-') + ' chainOk=' + b(out.raise.chainOk));
    console.log('§GATED-COMPLETE order=S00025(5002.5) T=6000 admit=' + b(out.highAfter.admit) + ' signedOp=' + (out.highAfter.op || '-') + ' chainOk=' + b(out.highAfter.chainOk));
    console.log('§GATED-WITNESS chainOk=' + b(out.chainOk) + ' len=' + out.chainLen + ' pageerrors=' + (errs.length ? errs.join('|') : 0));
  }

  const pass = out && !out.fail &&
    out.highBlocked.admit === false && out.highBlocked.why === 'rule-guard' &&
    out.lowAdmit.admit === true && out.lowAdmit.chainOk === true &&
    out.raise.chainOk === true &&
    out.highAfter.admit === true && out.highAfter.chainOk === true &&
    out.chainOk === true && errs.length === 0;
  console.log('§GATED-COMPLETE-POC ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
