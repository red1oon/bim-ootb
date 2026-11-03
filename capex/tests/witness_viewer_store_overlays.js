// capex/tests/witness_viewer_store_overlays.js — W-VIEWER-STORE-OVERLAYS (spec: prompts/CAPEX_DASHBOARD.md §5.11). Node only.
// ISSUE IT PROVES OR DISPROVES: "the viewer's Project-Order store opens the seed WITHOUT the ERP's boot overlays, so its products lack the legacy-mandatory C_TaxCategory_ID and a real iDempiere
// refuses the viewer's push" (headless browser check, §5.11: `null value in column "c_taxcategory_id"`). Expected values: plain SQL on the RAW seed vs on the store ProjOrderState.openStore returns.
// Break: BREAK=1 hides the overlays (as a page that never loaded them) → the after-count must equal the before-count → FAIL.
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.BREAK === '1';
let fails = 0, judged = 0;
const check = (n, ok, d) => { judged++; if (!ok) fails++; console.log('§W_VSO_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (d ? ' ' + d : '')); };
const NOTAX = "SELECT COUNT(*) FROM M_Product WHERE C_TaxCategory_ID IS NULL AND EXISTS (SELECT 1 FROM C_TaxCategory t WHERE t.IsDefault='Y' AND t.IsActive='Y' AND t.AD_Client_ID IN (0, M_Product.AD_Client_ID))";
(async () => {
  const SQL = await initSqlJs(), seed = fs.readFileSync(path.join(ROOT, 'erp', 'ad_seed.db'));
  const raw = new SQL.Database(seed), before = raw.exec(NOTAX)[0].values[0][0];
  if (BREAK) { const Module = require('module'), orig = Module._load; Module._load = function (r) { if (/ad_(taxcat|docvalue)_overlay\.js$/.test(r)) throw new Error('BREAK: overlay hidden'); return orig.apply(this, arguments); }; }
  const PS = require(path.join(ROOT, 'viewer', 'proj_order_state.js'));
  const logs = [], _l = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); logs.push(s); _l(s); };
  const st = await PS.openStore(SQL, () => Promise.resolve(seed));
  console.log = _l;
  const after = st.db.exec(NOTAX)[0].values[0][0];
  console.log('§W_VSO products without a tax category (where a default exists): raw seed=' + before + ' store(src=' + st.src + ')=' + after);
  check('THE RAW SEED HAS THE GAP (else this test proves nothing)', before > 0, 'raw=' + before);
  check('STORE OPENS WITH THE ERP OVERLAYS: no product left without a tax category', after === 0, 'after=' + after);
  check('OVERLAYS LOGGED', logs.some(s => /§S9-STORE overlays src=seed AdDocValueOverlay=\{|§S9-STORE overlays src=seed .*AdTaxCatOverlay=\{/.test(s)), (logs.find(s => /§S9-STORE overlays/.test(s)) || '').slice(0, 160));
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_VSO_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W_VSO_ERROR ' + (e && e.stack || e)); process.exit(2); });
