// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for THE ONE GESTURE (docs/RULE_EDIT_SPEC.md / bim-compiler
//   prompts/RULE_EDIT_ONE_GESTURE.md) — edit ONE rule on the migrated Odoo Client-12 tenant →
//   K records re-fold live, SIGNED + REVERSIBLE. Drives the ⚖ Rule pill → ▶ Run gesture for BOTH rules:
//     • L2 premium     — a CLASSIFICATION guard: PREMIUM iff PriceStd ≥ T (T 100→500, 23→12 of 35).
//     • L1 maycomplete — a LIFECYCLE guard on the wfmc Complete(CO) transition: an order may Complete
//                        iff GrandTotal ≤ T (T 1500→3000, 12→21 of 26). This is lifecycle-as-data.
//   PROVES per rule: §RULE-FOLD (K of N) · §RULE-EDIT (one signed op, affected>0 & <N, chainOk=Y,
//     reversible=Y) · §RULE-EDIT-ORACLE (op-log rebuilt ALONE == live) · §RULE-GESTURE PASS (signed=Y).
//   Issue it proves: "the write seam is dry-run only (E2)" — a SCOPED E3: a genuinely-signed rule edit
//     live, with a rebuilt==traced oracle, on FOREIGN (Odoo) data, at BOTH the L2 and L1 rule layers.
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

// the two rules under test: [layer, data-rule, forward-edit substring, edited-badge substring]
const RULES = [
  { layer: 'L2', id: 'premium',     edit: 'edit=T:100→500',   badge: 'PREMIUM: 12 of 35' },
  { layer: 'L1', id: 'maycomplete', edit: 'edit=T:1500→3000', badge: 'MAY COMPLETE: 21 of 26' },
];

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
  await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('.idmp-pill[title="Rule"]', { timeout: 15000 });
  });
  await page.click('.idmp-pill[title="Rule"]');
  await page.waitForSelector('#rule-run', { timeout: 8000 });

  // run each rule: select its tab → ▶ Run → capture edited state (K visibly reflowed) → wait for §RULE-GESTURE
  for (const R of RULES) {
    await page.click(`[data-rule="${R.id}"]`);
    await page.waitForTimeout(300);
    const before = logs.length;
    await page.click('#rule-run');
    await page.waitForFunction(b => new RegExp(b.replace(/[()]/g, '\\$&')).test(document.body.textContent || ''),
      R.badge, { timeout: 9000 }).catch(() => {});
    await page.screenshot({ path: path.join(__dirname, `rule_edit_${R.layer}.png`) });
    for (let i = 0; i < 60 && !logs.slice(before).find(l => l.startsWith(`§RULE-GESTURE layer=${R.layer}`)); i++) await page.waitForTimeout(250);
  }
  await page.close();

  let allOk = true;
  for (const R of RULES) {
    const find = re => logs.find(l => re.test(l)) || '';
    const fold   = find(new RegExp(`^§RULE-FOLD layer=${R.layer} rule=${R.id} `));
    const editF  = find(new RegExp(`^§RULE-EDIT layer=${R.layer} rule=${R.id} .*${R.edit.replace(/[()]/g, '\\$&')}`));
    const oracle = find(new RegExp(`^§RULE-EDIT-ORACLE layer=${R.layer} rule=${R.id} `));
    const gest   = find(new RegExp(`^§RULE-GESTURE layer=${R.layer} rule=${R.id} `));
    [fold, editF, oracle, gest].forEach(l => console.log(l || `(missing ${R.layer} §-line)`));
    const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : NaN; };
    const N = num(editF, /population=(\d+)/), aff = num(editF, /affected=(\d+)/), k0 = num(fold, /affected=(\d+)/);
    const foldOk   = k0 > 0 && k0 < N;
    const editOk   = /chainOk=Y/.test(editF) && /reversible=Y/.test(editF) && aff > 0 && aff < N;
    const oracleOk = /rebuilt==live/.test(oracle) && /chainOk=Y/.test(oracle);
    const gestPass = /\bPASS\b/.test(gest) && /signed=Y/.test(gest);
    const ok = foldOk && editOk && oracleOk && gestPass;
    console.log(`§RULE-WITNESS ${R.layer} ${R.id} N=${N} K0=${k0} affected=${aff} foldOk=${foldOk} editOk=${editOk} oracleOk=${oracleOk} gestPass=${gestPass}`);
    allOk = allOk && ok;
  }
  console.log('§RULE-WITNESS pageerrors=' + (errs.length ? errs.join('|') : 0));
  const pass = allOk && errs.length === 0;
  console.log('§RULE-EDIT-POC ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { server.close(); } catch (x) {} process.exit(2); });
