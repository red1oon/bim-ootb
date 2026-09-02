/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_currency.js — BIM→Project FINANCE lane §F1 witness W-FIN-CURRENCY.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F1 — currency + conversion-rate fidelity.
// Proves (the issue: the browser passes the pack DISPLAY symbol 'RM', not the ISO 'MYR', so the old
//   ISO-only lookup fell back to USD → CUR_FALLBACK; nothing posted in the right currency):
//   W-FIN-CURRENCY-1  a Malaysian (CIDB) fold with packCurrencyISO='RM' carries C_Currency_ID = MYR (301),
//                     NOT the USD fallback (100) — resolved via C_Currency.CurSymbol='RM'.
//   W-FIN-CURRENCY-2  NO 'CUR_FALLBACK' and NO 'NO_CONV_RATE' note (the conversion rate is now seeded).
//   W-FIN-CURRENCY-3  the MYR→acct conversion rate is RESOLVABLE in the seed (C_Conversion_Rate) and the
//                     fold surfaces it (result.convRateToAcct) == the CIDB pack's 1/exchange_rate.
//   W-FIN-CURRENCY-4  amounts UNCHANGED — PlannedAmt == the 5D golden to the cent (BigDecimal); currency
//                     fidelity is a label/rate fix, not a re-pricing.
//   W-FIN-CURRENCY-5  FALSIFIER — a bogus currency code STILL trips CUR_FALLBACK (the guard is real).
//   W-FIN-CURRENCY-6  CONTRACT — proj_fold/vo_fold carry the _resolveCurrency resolver; seed script exists.
// MYR = ISO 4217 numeric 458 (seed stores the alpha ISO_Code 'MYR'). Non-destructive in-memory fold.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_currency.js

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
  if (!BLD || !ERP) { console.log('§FIN_CUR SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));            // in-memory; file untouched
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];

  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const RATES = pack.materials || {};
  const myrPerUsd = Number(pack.meta.exchange_rate);            // 3.91 RM per USD (the pack source)
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), RATES);
  const golden = priced.reduce(function (a, r) { return a + r.cost; }, 0);

  // ── the fold with the REAL browser currency value: the pack symbol 'RM' (navigate_find _cur()) ──
  const opts = { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: '2026-06-15 00:00:00' };
  const r = ProjFold.foldProjectOrder(edb, building, priced, opts);
  r.notes.forEach(function (n) { console.log('  §FIN_CUR_NOTE ' + n); });

  // W-FIN-CURRENCY-1 — C_Project carries MYR (301), not the USD fallback (100).
  const myrId = scalar(edb, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code='MYR'");
  const projCur = scalar(edb, "SELECT C_Currency_ID FROM C_Project WHERE C_Project_ID=" + r.projectId);
  const c1 = (projCur === myrId && r.currencyId === myrId && myrId === 301);
  console.log('§FIN_CUR_1 projCur=' + projCur + ' resultCur=' + r.currencyId + ' MYR=' + myrId + ' (ISO 4217 458) ok=' + c1);

  // W-FIN-CURRENCY-2 — no CUR_FALLBACK and no NO_CONV_RATE note.
  const c2 = !r.notes.some(function (n) { return /CUR_FALLBACK|NO_CONV_RATE/.test(n); });
  console.log('§FIN_CUR_2 no-fallback-note ok=' + c2);

  // W-FIN-CURRENCY-3 — conversion rate MYR→acct resolvable + surfaced; == pack 1/exchange_rate.
  const acctCur = scalar(edb, "SELECT C_Currency_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1");
  const seedRate = scalar(edb, "SELECT multiplyrate FROM C_Conversion_Rate WHERE c_currency_id=" + myrId + " AND c_currency_id_to=" + acctCur + " AND isactive='Y' ORDER BY validfrom DESC LIMIT 1");
  const expect = BD.of('1').divide(BD.of(String(myrPerUsd)), 12, BD.RoundingMode.HALF_UP);
  const got = r.convRateToAcct != null ? BD.of(String(r.convRateToAcct)).setScale(12, BD.RoundingMode.HALF_UP) : null;
  const c3 = seedRate != null && got != null && got.compareTo(expect) === 0 && r.acctCurrencyId === acctCur;
  console.log('§FIN_CUR_3 seedRate=' + seedRate + ' foldRate=' + r.convRateToAcct + ' expect(1/' + myrPerUsd + ')=' + expect.toString() + ' acct=' + acctCur + ' ok=' + c3);

  // W-FIN-CURRENCY-4 — amounts unchanged: PlannedAmt == 5D golden (BigDecimal).
  const projAmt = scalar(edb, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + r.projectId);
  const c4 = BD.of(String(projAmt)).setScale(0, BD.RoundingMode.HALF_UP).compareTo(BD.of(String(golden))) === 0;
  console.log('§FIN_CUR_4 plannedAmt=' + projAmt + ' golden=' + golden + ' unchanged=' + c4);

  // W-FIN-CURRENCY-5 — falsifier: a bogus code STILL trips CUR_FALLBACK (guard is real).
  const edb2 = new SQL.Database(fs.readFileSync(ERP));
  const rBad = ProjFold.foldProjectOrder(edb2, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'ZZZ', now: '2026-06-15 00:00:00' });
  const c5 = rBad.notes.some(function (n) { return /CUR_FALLBACK pack=ZZZ/.test(n); }) && rBad.currencyId === 100;
  console.log('§FIN_CUR_5 bogus-code-falls-back ok=' + c5);
  edb2.close();

  // W-FIN-CURRENCY-6 — CONTRACT: resolver wired in both folds + seed script present.
  function srcHas(file, tokens) {
    var p = path.join(__dirname, '..', file);
    var s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(function (t) { var ok = s.indexOf(t) >= 0; if (!ok) console.log('  §FIN_CUR_CONTRACT MISSING ' + file + ' :: ' + t); return ok; });
  }
  const c6 = srcHas('viewer/proj_fold.js', ['function _resolveCurrency', 'function _convRateToAcct', 'ISO_Code=? OR CurSymbol=?'])
    && srcHas('viewer/vo_fold.js', ['function _resolveCurrency', 'ISO_Code=? OR CurSymbol=?'])
    && fs.existsSync(path.join(__dirname, '..', 'scripts', 'seed_fin_currency.js'));
  console.log('§FIN_CUR_6 contract (resolver in proj_fold+vo_fold, seed script) ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_CUR ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-CURRENCY: pack symbol RM→MYR(301), no CUR_FALLBACK, ' +
    'conversion rate resolvable, amounts unchanged; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
