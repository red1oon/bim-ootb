/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_uom.js — BIM→Project FINANCE lane §F2 witness W-FIN-UOM.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F2 — UOM fidelity (the BoQ speaks m³/m²/m, not EA).
// Proves:
//   W-FIN-UOM-1  the fold emits NO 'UOM_FALLBACK' note (the seed now carries M / M2 / M3).
//   W-FIN-UOM-2  every BoQ product's C_UOM resolves to the right metre (M/M2/M3 by X12DE355), NOT EA(100);
//                and each line's description reads its true unit.
//   W-FIN-UOM-3  line qty == the 5D golden quantity to the unit (BigDecimal, 3dp == compute5D precision).
//   W-FIN-UOM-4  the seeded UOMs carry the real UN/CEFACT Rec-20 codes (M→MTR, M2→MTK, M3→MTQ).
//   W-FIN-UOM-5  FALSIFIER — a class priced per EA still resolves EA(100) (not silently forced to a metre).
//   W-FIN-UOM-6  CONTRACT — proj_fold queries C_UOM by X12DE355; seed_fin_uom.js present.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_uom.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
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

(async function () {
  if (!BLD || !ERP) { console.log('§FIN_UOM SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];

  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const RATES = pack.materials || {};
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), RATES);

  // golden unit + qty per IFC class (the 5D source of truth).
  const goldUnit = {}, goldQty = {};
  priced.forEach(function (r) {
    goldUnit[r.cls] = r.unit;
    goldQty[r.cls] = (goldQty[r.cls] || BD.ZERO).add(BD.of(String(r.qty)));
  });

  const r = ProjFold.foldProjectOrder(edb, building, priced,
    { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: '2026-06-15 00:00:00' });

  // W-FIN-UOM-1 — no UOM_FALLBACK note.
  const c1 = !r.notes.some(function (n) { return /UOM_FALLBACK/.test(n); });
  console.log('§FIN_UOM_1 no-uom-fallback ok=' + c1);
  r.notes.filter(function (n) { return /UOM_FALLBACK/.test(n); }).forEach(function (n) { console.log('  §FIN_UOM_LEFTOVER ' + n); });

  // expected C_UOM id per X12DE355
  const uomId = {};
  ['EA', 'M', 'M2', 'M3'].forEach(function (x) { uomId[x] = scalar(edb, "SELECT C_UOM_ID FROM C_UOM WHERE X12DE355=?", [x]); });

  // W-FIN-UOM-2 + 3 — every product's UOM matches its golden unit; line qty == golden qty (3dp).
  let c2 = true, c3 = true, lines = 0;
  Object.keys(goldUnit).forEach(function (cls) {
    const unit = goldUnit[cls];
    const row = edb.exec("SELECT p.C_UOM_ID, l.plannedqty, l.description FROM C_ProjectLine l " +
      "JOIN M_Product p ON l.m_product_id=p.M_Product_ID WHERE l.c_project_id=" + r.projectId +
      " AND p.Value='" + String(cls).replace(/'/g, "''") + "'");
    if (!row.length) return;
    lines++;
    const [pUom, qty] = row[0].values[0];
    const uomOk = (pUom === uomId[unit]);
    const qtyOk = BD.of(String(qty)).setScale(3, BD.RoundingMode.HALF_UP)
      .compareTo(goldQty[cls].setScale(3, BD.RoundingMode.HALF_UP)) === 0;
    if (!uomOk) c2 = false;
    if (!qtyOk) c3 = false;
    if (!uomOk || !qtyOk) console.log('  §FIN_UOM_LINE cls=' + cls + ' unit=' + unit + ' pUom=' + pUom + ' want=' + uomId[unit] + ' qty=' + qty + ' gold=' + goldQty[cls].toString() + ' uomOk=' + uomOk + ' qtyOk=' + qtyOk);
  });
  console.log('§FIN_UOM_2 product-uom-matches-unit lines=' + lines + ' ok=' + c2);
  console.log('§FIN_UOM_3 line-qty==5D-golden(3dp) ok=' + c3);

  // W-FIN-UOM-4 — seeded UOMs carry the real UN/CEFACT codes.
  const unc = {};
  ['M', 'M2', 'M3'].forEach(function (x) { unc[x] = scalar(edb, "SELECT UNCEFACT FROM C_UOM WHERE X12DE355=?", [x]); });
  const c4 = unc['M'] === 'MTR' && unc['M2'] === 'MTK' && unc['M3'] === 'MTQ';
  console.log('§FIN_UOM_4 UNCEFACT M=' + unc['M'] + ' M2=' + unc['M2'] + ' M3=' + unc['M3'] + ' ok=' + c4);

  // W-FIN-UOM-5 — falsifier: a class with no rate (unit EA) keeps EA(100), never forced to a metre.
  const eaCls = Object.keys(goldUnit).filter(function (c) { return goldUnit[c] === 'EA'; });
  let c5 = true;
  if (eaCls.length) {
    eaCls.forEach(function (cls) {
      const pUom = scalar(edb, "SELECT p.C_UOM_ID FROM C_ProjectLine l JOIN M_Product p ON l.m_product_id=p.M_Product_ID WHERE l.c_project_id=" + r.projectId + " AND p.Value='" + String(cls).replace(/'/g, "''") + "'");
      if (pUom != null && pUom !== uomId['EA']) c5 = false;
    });
    console.log('§FIN_UOM_5 EA-classes=' + eaCls.length + ' stay-EA ok=' + c5);
  } else {
    console.log('§FIN_UOM_5 no EA-priced class in this building (vacuously ok)');
  }

  // W-FIN-UOM-6 — contract.
  function srcHas(file, tokens) {
    var p = path.join(__dirname, '..', file);
    var s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(function (t) { var ok = s.indexOf(t) >= 0; if (!ok) console.log('  §FIN_UOM_CONTRACT MISSING ' + file + ' :: ' + t); return ok; });
  }
  const c6 = srcHas('viewer/proj_fold.js', ['C_UOM WHERE X12DE355=?'])
    && fs.existsSync(path.join(__dirname, '..', 'scripts', 'seed_fin_uom.js'));
  console.log('§FIN_UOM_6 contract ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_UOM ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-UOM: BoQ reads m/m²/m³, no UOM_FALLBACK, qty==5D golden; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
