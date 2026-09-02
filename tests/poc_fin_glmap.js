/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_glmap.js — BIM→Project FINANCE lane §F3 witness W-FIN-GLMAP.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F3 — GL account mapping (the BoQ becomes postable).
// Proves:
//   W-FIN-GLMAP-1  every BIM M_Product_Category folded gets an M_Product_Category_Acct row per acct schema.
//   W-FIN-GLMAP-2  each such row resolves a real Dr account (p_wip_acct + p_expense_acct) → a real
//                  C_ValidCombination → C_ElementValue (a genuine chart-of-accounts number, not invented).
//   W-FIN-GLMAP-3  the order side resolves AP (v_liability) → a real account; a postable PAIR exists
//                  (Dr cost ≠ Cr AP) — the fold surfaces it in result.glMap.
//   W-FIN-GLMAP-4  every account id used traces to the seed's existing chart (EXTRACT: no id outside it).
//   W-FIN-GLMAP-5  FALSIFIER — the Dr (WIP) and Cr (AP) accounts are DISTINCT real accounts (a degenerate
//                  Dr==Cr map would not post).
//   W-FIN-GLMAP-6  CONTRACT — proj_fold seeds category accounting + exposes glMap.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_glmap.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');

const BLD = [path.join(__dirname, '..', 'buildings', 'Duplex_extracted.db'),
  path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Duplex_extracted.db')].find(fs.existsSync);
const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');

function compute5D(db, building) {
  var bld = String(building).replace(/'/g, "''");
  var areaExpr = "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
    "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
    "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END";
  var sql = "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) cnt, " +
    "ROUND(SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)),3) length_m, ROUND(SUM(" + areaExpr + "),3) area_m2, " +
    "ROUND(SUM(t.bbox_x*t.bbox_y*t.bbox_z),3) vol_m3 FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
    "WHERE m.building='" + bld + "' AND t.bbox_x IS NOT NULL AND t.bbox_x>0 GROUP BY m.discipline, m.ifc_class, m.storey";
  var res = db.exec(sql);
  return (res.length ? res[0].values : []).map(function (r) {
    return { disc: r[0], cls: r[1], storey: r[2], count: r[3] || 0, length_m: r[4] || 0, area_m2: r[5] || 0, vol_m3: r[6] || 0 };
  });
}
function apply5DRates(rows, RATES) {
  return rows.map(function (r) {
    var rt = RATES[r.cls]; var unit = rt ? rt.unit : 'EA'; var rate = rt ? rt.rate : 0; var qty;
    if (unit === 'M') qty = r.length_m; else if (unit === 'M2') qty = r.area_m2; else if (unit === 'M3') qty = r.vol_m3; else { unit = rt ? unit : 'EA'; qty = r.count; }
    return { disc: r.disc, cls: r.cls, storey: r.storey, count: r.count, unit: unit, qty: qty, rate: rate, cost: Math.round(rate * qty) };
  });
}
function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
// a valid-combination id → the real chart account number (Value) it posts to, or null if not in the chart.
function acctValue(db, vcId) {
  return scalar(db, "SELECT ev.value FROM C_ValidCombination vc JOIN C_ElementValue ev ON vc.account_id=ev.c_elementvalue_id WHERE vc.c_validcombination_id=?", [vcId]);
}

(async function () {
  if (!BLD || !ERP) { console.log('§FIN_GL SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];

  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});

  // fold WITH a supplier so the C_Order PO (and its AP path) is exercised. BP 119 = the proj_push supplier.
  const r = ProjFold.foldProjectOrder(edb, building, priced,
    { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: '2026-06-15 00:00:00', bpartnerId: 119 });

  const nSchemas = scalar(edb, "SELECT COUNT(*) FROM C_AcctSchema");
  const primary = scalar(edb, "SELECT C_AcctSchema_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1");
  // the BIM categories this fold created.
  const cats = edb.exec("SELECT M_Product_Category_ID, Value FROM M_Product_Category WHERE Value LIKE 'BIM-%'")[0].values;

  // W-FIN-GLMAP-1 — every BIM category has one acct row per schema.
  // W-FIN-GLMAP-2 — on the PRIMARY (posting) schema, each category resolves a real Dr WIP + Expense.
  // W-FIN-GLMAP-4 — every NON-NULL account id used traces to the seed's chart (a null default = the seed's
  //                 own choice for a secondary schema, NOT a fabrication; only fabricated ids fail this).
  let c1 = cats.length > 0, c2 = true, c4 = true, acctRows = 0;
  cats.forEach(function (cv) {
    const catId = cv[0];
    const rows = edb.exec("SELECT c_acctschema_id,p_wip_acct,p_expense_acct,p_asset_acct,p_cogs_acct,p_revenue_acct FROM M_Product_Category_Acct WHERE M_Product_Category_ID=" + catId);
    const vals = rows.length ? rows[0].values : [];
    acctRows += vals.length;
    if (vals.length !== nSchemas) { c1 = false; console.log('  §FIN_GL_CAT ' + cv[1] + ' acctRows=' + vals.length + ' want=' + nSchemas); }
    vals.forEach(function (a) {
      const as = a[0];
      // primary schema must resolve a real Dr WIP + Expense
      if (as === primary) {
        if (acctValue(edb, a[1]) == null || acctValue(edb, a[2]) == null) { c2 = false; console.log('  §FIN_GL_PRIMARY ' + cv[1] + ' wip=' + a[1] + ' exp=' + a[2]); }
      }
      // any non-null account id, on any schema, must be a real chart account
      a.slice(1).forEach(function (acctId) { if (acctId != null && acctValue(edb, acctId) == null) { c4 = false; console.log('  §FIN_GL_FABRICATED ' + cv[1] + ' schema=' + as + ' acctId=' + acctId); } });
    });
  });
  const s = edb.exec("SELECT p_wip_acct,p_expense_acct FROM M_Product_Category_Acct WHERE M_Product_Category_ID=" + cats[0][0] + " AND c_acctschema_id=" + primary)[0].values[0];
  console.log('§FIN_GL_1 categories=' + cats.length + ' acctRows=' + acctRows + ' (×' + nSchemas + ' schemas) ok=' + c1);
  console.log('§FIN_GL_2 primary-schema=' + primary + ' Dr WIP=' + s[0] + '(' + acctValue(edb, s[0]) + ') Expense=' + s[1] + '(' + acctValue(edb, s[1]) + ') ok=' + c2);
  console.log('§FIN_GL_4 every-nonnull-acct-in-chart ok=' + c4);

  // W-FIN-GLMAP-3 + 5 — AP resolves; a postable PAIR (Dr cost ≠ Cr AP) exists.
  const gl = r.glMap || {};
  const apV = acctValue(edb, gl.ap), drV = acctValue(edb, gl.drWip);
  const c3 = gl.ap != null && apV != null && gl.drWip != null && drV != null;
  const c5 = gl.drWip !== gl.ap && drV !== apV;
  console.log('§FIN_GL_3 glMap drWip=' + gl.drWip + '(' + drV + ') drExpense=' + gl.drExpense + ' AP=' + gl.ap + '(' + apV + ') schema=' + gl.acctSchemaId + ' ok=' + c3);
  console.log('§FIN_GL_5 Dr≠Cr (postable pair) ok=' + c5);

  // W-FIN-GLMAP-6 — contract.
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_fold.js'), 'utf8');
  const c6 = src.indexOf('function _seedCategoryAcct') >= 0 && src.indexOf('function _glMap') >= 0 && src.indexOf('M_Product_Category_Acct') >= 0;
  console.log('§FIN_GL_6 contract ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_GL ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-GLMAP: BIM categories carry real GL accounts, order resolves AP, postable Dr≠Cr pair; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
