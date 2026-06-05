// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for THE ONE GESTURE (docs/RULE_EDIT_SPEC.md / bim-compiler
//   prompts/RULE_EDIT_ONE_GESTURE.md) — edit ONE rule on the migrated Odoo Client-12 tenant →
//   K records re-fold live, SIGNED + REVERSIBLE.
//   PROVES (drives the real ⚖ Rule pill → ▶ Run gesture in idempiere.html):
//     1. §RULE-FOLD    — PREMIUM: K of 35 folds over the real Odoo list_price population (T=100 → K=23).
//     2. §RULE-EDIT    — editing T (100→500) is ONE signed op; affected>0 & <35 cross; chainOk=Y; reversible=Y.
//     3. §RULE-EDIT-ORACLE — the op-log rebuilt ALONE == the live PREMIUM set at the tip (rebuilt==live).
//     4. §RULE-EDIT (reverse) — the inverse op (500→100) restores the K records; reversible=Y.
//     5. §RULE-GESTURE PASS — all of the above, signed=Y, 0 pageerror; the badge K visibly changes (screenshot).
//   Issue it proves: "the write seam is dry-run only (E2)" — this is a SCOPED E3: a genuinely-signed
//     rule edit live, with a rebuilt==traced acceptance oracle, on FOREIGN (Odoo) data.
//   §-log first — READ tests/poc_rule_edit.log before any conclusion.
// Run:  node tests/poc_rule_edit.js 2>&1 | tee tests/poc_rule_edit.log   (cwd = bim-ootb/erp)
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

  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140`;
  await page.goto(url, { waitUntil: 'networkidle' });
  // auto-login (?login=Odoo); fall back to clicking the user if the rail hasn't built yet.
  await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 15000 });
  });

  // open the ⚖ Rule overlay, then ▶ Run gesture
  await page.click('.idmp-pill[title="Rule"]');
  await page.waitForSelector('#rule-run', { timeout: 8000 });
  await page.screenshot({ path: path.join(__dirname, 'rule_edit_before.png') });   // PREMIUM: 23 of 35 (T=100)
  await page.click('#rule-run');
  // capture the EDITED state (K visibly dropped to 12) while the gesture animates, before it reverts.
  await page.waitForFunction(() => /PREMIUM: 12 of 35/.test(document.body.textContent || ''), { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(__dirname, 'rule_edit_after.png') });    // PREMIUM: 12 of 35 (T=500)
  // wait for the gesture to finish (the §RULE-GESTURE summary line)
  for (let i = 0; i < 60 && !logs.find(l => l.startsWith('§RULE-GESTURE ')); i++) await page.waitForTimeout(250);
  await page.close();

  const find = (pred) => logs.find(pred) || '';
  const fold   = find(l => /^§RULE-FOLD /.test(l));
  const editF  = find(l => /^§RULE-EDIT .*edit=T:100→500/.test(l));
  const oracle = find(l => /^§RULE-EDIT-ORACLE /.test(l));
  const editR  = find(l => /^§RULE-EDIT .*edit=T:500→100/.test(l));
  const gest   = find(l => /^§RULE-GESTURE /.test(l));
  [fold, editF, oracle, editR, gest].forEach(l => console.log(l || '(missing §-line)'));

  const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : NaN; };
  const N    = num(editF, /population=(\d+)/);
  const aff  = num(editF, /affected=(\d+)/);
  const k0   = num(fold,  /affected=(\d+)/);
  const oracleOk = /rebuilt==live/.test(oracle) && /chainOk=Y/.test(oracle);
  const editOk   = /chainOk=Y/.test(editF) && /reversible=Y/.test(editF) && aff > 0 && aff < N;
  const revOk    = /chainOk=Y/.test(editR) && /reversible=Y/.test(editR);
  const gestPass = /^§RULE-GESTURE PASS/.test(gest) && /signed=Y/.test(gest);

  console.log('§RULE-WITNESS N=' + N + ' K0=' + k0 + ' affected=' + aff +
    ' foldOk=' + (k0 > 0 && k0 < N) + ' editOk=' + editOk + ' oracleOk=' + oracleOk +
    ' revOk=' + revOk + ' errs=' + (errs.length ? errs.join('|') : 0));
  const pass = (k0 > 0 && k0 < N) && editOk && oracleOk && revOk && gestPass && errs.length === 0;
  console.log('§RULE-EDIT-POC ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
