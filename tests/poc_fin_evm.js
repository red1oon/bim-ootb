/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_evm.js — BIM→Project FINANCE lane §F4 witness W-FIN-EVM.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F4 — PM control view: contract sum + EVM (live).
// Proves:
//   W-FIN-EVM-1  pure EVM math == a hand-computed BigDecimal golden (CV/SV/CPI/SPI).
//   W-FIN-EVM-2  CPI/SPI are null (not a fake 0/1) when the divisor (AC / PV) is 0.
//   W-FIN-EVM-3  contract sum buckets: a folded project + a DR VO → pending=VO, approved=0, revised=original;
//                approving the VO (DocStatus CO) → approved=VO, revised=original+VO (the F5 hook).
//   W-FIN-EVM-4  EVM on the real folded project: mark a phase complete + pick a data date →
//                EV == that phase's PlannedAmt, PV == Σ schedule-fraction (BigDecimal), CV/SV correct.
//   W-FIN-EVM-5  AC honesty: a freshly folded project (nothing invoiced) → AC=0, CPI null, note present.
//   W-FIN-EVM-6  CONTRACT — proj_control exports the API; navigate_find computes the readout on push.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_evm.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
const ProjFold = require('../viewer/proj_fold.js');
const VoFold = require('../viewer/vo_fold.js');
const PC = require('../viewer/proj_control.js');

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
function eq(a, b) { return BD.of(String(a)).compareTo(BD.of(String(b))) === 0; }

(async function () {
  if (!BLD || !ERP) { console.log('§FIN_EVM SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});

  // ── W-FIN-EVM-1 — pure math vs hand golden. PV=1000 EV=800 AC=900:
  //    CV=EV-AC=-100 ; SV=EV-PV=-200 ; CPI=800/900=0.8889 ; SPI=800/1000=0.8
  const m = PC.evmMetrics(1000, 800, 900);
  const c1 = eq(m.cv, '-100') && eq(m.sv, '-200') && m.cpi === '0.8889' && m.spi === '0.8000';
  console.log('§FIN_EVM_1 cv=' + m.cv + ' sv=' + m.sv + ' cpi=' + m.cpi + ' spi=' + m.spi + ' ok=' + c1);

  // ── W-FIN-EVM-2 — null indices on zero divisor.
  const z = PC.evmMetrics(0, 0, 0);
  const c2 = z.cpi === null && z.spi === null && eq(z.cv, '0') && eq(z.sv, '0');
  console.log('§FIN_EVM_2 zero-divisor cpi=' + z.cpi + ' spi=' + z.spi + ' ok=' + c2);

  // ── fold the project + a VO amendment ──
  const now = '2026-06-15 00:00:00';
  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
  const projId = r.projectId;
  const original = scalar(edb, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  // a small synthetic delta priced via vo_fold (one ADDED class) — real GUID classes from the building.
  const voRows = [{ status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'M2' }];
  const vo = VoFold.foldVariationOrder(edb, building, voRows, { packCurrencyISO: 'RM', now: now });
  const voTotal = scalar(edb, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=" + vo.orderId);

  // ── W-FIN-EVM-3 — contract sum buckets (DR pending → CO approved). ──
  const csDR = PC.contractSum(edb, projId);
  edb.run("UPDATE C_Order SET DocStatus='CO' WHERE C_Order_ID=" + vo.orderId);
  const csCO = PC.contractSum(edb, projId);
  const c3 = eq(csDR.original, original) && eq(csDR.pendingVOs, voTotal) && eq(csDR.approvedVOs, '0') && eq(csDR.revised, original)
    && eq(csCO.approvedVOs, voTotal) && eq(csCO.pendingVOs, '0') && eq(csCO.revised, BD.of(String(original)).add(BD.of(String(voTotal))).toString());
  console.log('§FIN_EVM_3 DR{pend=' + csDR.pendingVOs + ',appr=' + csDR.approvedVOs + ',rev=' + csDR.revised + '} CO{appr=' + csCO.approvedVOs + ',rev=' + csCO.revised + '} orig=' + original + ' vo=' + voTotal + ' ok=' + c3);

  // ── W-FIN-EVM-4 — EVM on the real project: complete the first phase, pick a data date == its EndDate. ──
  const ph = edb.exec("SELECT C_ProjectPhase_ID,PlannedAmt,StartDate,EndDate FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " ORDER BY SeqNo")[0].values;
  const ph1 = ph[0];
  edb.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=" + ph1[0]);
  const dataDate = String(ph1[3]).slice(0, 10);                  // as-of = end of phase 1
  const e = PC.evm(edb, projId, dataDate);
  // hand golden: EV == phase1.PlannedAmt ; PV == Σ over phases of plannedAmt×fraction(asOf) ;
  // since asOf == phase1.end and phases are sequential, PV >= EV (later phases not yet started → 0).
  let pvGold = BD.ZERO, evGold = BD.ZERO;
  const dOf = function (s) { var p = String(s).slice(0, 10).split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]) / 86400000; };
  const asOfD = dOf(dataDate);
  ph.forEach(function (p, i) {
    const amt = BD.of(String(p[1])), sd = dOf(p[2]), ed = dOf(p[3]);
    let frac = BD.ZERO;
    if (asOfD >= ed) frac = BD.of('1');
    else if (asOfD > sd && ed > sd) frac = BD.of(String(asOfD - sd)).divide(BD.of(String(ed - sd)), 6, BD.RoundingMode.HALF_UP);
    pvGold = pvGold.add(amt.multiply(frac).setScale(2, BD.RoundingMode.HALF_UP));
    if (i === 0) evGold = evGold.add(amt);
  });
  const c4 = eq(e.ev, evGold.toString()) && eq(e.pv, pvGold.toString())
    && eq(e.cv, evGold.subtract(BD.ZERO).toString())              // AC=0 → CV=EV
    && eq(e.sv, evGold.subtract(pvGold).toString());
  console.log('§FIN_EVM_4 asOf=' + dataDate + ' bac=' + e.bac + ' pv=' + e.pv + '(gold ' + pvGold.toString() + ') ev=' + e.ev + '(gold ' + evGold.toString() + ') cv=' + e.cv + ' sv=' + e.sv + ' phasesComplete=' + e.phasesComplete + ' ok=' + c4);

  // ── W-FIN-EVM-5 — AC honesty (nothing invoiced → AC=0, CPI null, note). ──
  const ctrl = PC.projectControl(edb, projId, dataDate);
  const c5 = ctrl.evm.acIsZero && ctrl.evm.cpi === null && ctrl.note != null && /AC=0/.test(ctrl.note);
  console.log('§FIN_EVM_5 ac=' + ctrl.evm.ac + ' cpi=' + ctrl.evm.cpi + ' note="' + ctrl.note + '" ok=' + c5);

  // ── W-FIN-EVM-6 — contract. ──
  const pcSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_control.js'), 'utf8');
  const nfSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'navigate_find.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'viewer.html'), 'utf8');
  const c6 = ['function evmMetrics', 'function contractSum', 'function evm', 'function projectControl', 'global.ProjControl'].every(function (t) { return pcSrc.indexOf(t) >= 0; })
    && nfSrc.indexOf('ProjControl') >= 0 && nfSrc.indexOf('§PROJ_CONTROL') >= 0
    && htmlSrc.indexOf('proj_control.js') >= 0;
  console.log('§FIN_EVM_6 contract (proj_control API + navigate_find readout + viewer.html) ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_EVM ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-EVM: EVM math==golden, contract sum buckets, project EVM extraction, AC honest; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
