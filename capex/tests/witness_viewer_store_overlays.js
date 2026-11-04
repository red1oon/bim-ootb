// capex/tests/witness_viewer_store_overlays.js — W-VIEWER-STORE-OVERLAYS (spec: prompts/CAPEX_DASHBOARD.md §5.11). Node only.
// ISSUE IT PROVES OR DISPROVES: "the viewer's Project-Order store opens the seed WITHOUT the ERP's boot overlays, so its products lack the legacy-mandatory C_TaxCategory_ID and a real iDempiere
// refuses the viewer's push" (headless browser check, §5.11: `null value in column "c_taxcategory_id"`). Expected values: plain SQL on the RAW seed vs on the store ProjOrderState.openStore returns.
// + §5.25 D1, ISSUE: "the store opens without the seed's self-heal patch, so ad_ddl_default is absent and every fold leaves the physical column defaults NULL" (a fold on the store must not note NO_DDL_DEFAULTS; ProjectCategory = legacy's 'N').
// Break: BREAK=1 hides the overlays (as a page that never loaded them) and the patch file → the after-count must equal the before-count, no ad_ddl_default → FAIL.
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
  if (BREAK) { const rf = fs.readFileSync; fs.readFileSync = function (f) { if (/patches[\\/]ad_seed\.db\.sql$/.test(String(f))) throw new Error('BREAK: patch hidden'); return rf.apply(fs, arguments); }; }
  const PS = require(path.join(ROOT, 'viewer', 'proj_order_state.js'));
  const logs = [], _l = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); logs.push(s); _l(s); };
  const st = await PS.openStore(SQL, () => Promise.resolve(seed));
  console.log = _l;
  const after = st.db.exec(NOTAX)[0].values[0][0];
  console.log('§W_VSO products without a tax category (where a default exists): raw seed=' + before + ' store(src=' + st.src + ')=' + after);
  check('THE RAW SEED HAS THE GAP (else this test proves nothing)', before > 0, 'raw=' + before);
  check('STORE OPENS WITH THE ERP OVERLAYS: no product left without a tax category', after === 0, 'after=' + after);
  check('OVERLAYS LOGGED', logs.some(s => /§S9-STORE overlays src=seed AdDocValueOverlay=\{|§S9-STORE overlays src=seed .*AdTaxCatOverlay=\{/.test(s)), (logs.find(s => /§S9-STORE overlays/.test(s)) || '').slice(0, 160));
  const rawDdl = raw.exec("SELECT COUNT(*) FROM sqlite_master WHERE name='ad_ddl_default'")[0].values[0][0], ddl = st.db.exec("SELECT COUNT(*) FROM sqlite_master WHERE name='ad_ddl_default'")[0].values[0][0];
  check('D1 THE RAW SEED LACKS ad_ddl_default (else this test proves nothing)', rawDdl === 0, 'raw=' + rawDdl);
  check('D1 THE STORE OPENS WITH THE SEED PATCH', ddl === 1 && logs.some(s => /§S9-STORE patch applied/.test(s)), (logs.find(s => /§S9-STORE patch/.test(s)) || '').slice(0, 120));
  const PF = require(path.join(ROOT, 'viewer', 'proj_fold.js'));
  const SR = { IfcWall: { phase: 'Superstructure', sequence: 2, resource: 'MASON' } };
  const F = PF.foldProjectOrder(st.db, 'W_VSO', [{ disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 1, unit: 'EA', qty: 2, rate: 3, cost: 6 }], { seqRules: SR, hierarchy: {}, packCurrencyISO: 'USD', now: '2026-11-04 00:00:00' });
  const R = st.db.exec("SELECT ProjectCategory, Processing, ProjectBalanceAmt FROM C_Project WHERE Value='W_VSO'")[0].values[0];
  check('D1 A FOLD ON THE STORE FILLS LEGACY\'S PHYSICAL DEFAULTS', F.notes.indexOf('NO_DDL_DEFAULTS') < 0 && R[0] === 'N' && Number(R[2]) === 0, 'notes=' + F.notes.filter(n => /DDL/.test(n)).join() + ' row=' + JSON.stringify(R));
  check('M1 A NEW PROJECT HAS Processing=N (10 of 10 projects legacy created)', R[1] === 'N', 'Processing=' + R[1]);
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§W_VSO_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W_VSO_ERROR ' + (e && e.stack || e)); process.exit(2); });
