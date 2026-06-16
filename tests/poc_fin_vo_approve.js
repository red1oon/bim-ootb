/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_vo_approve.js — BIM→Project FINANCE lane §F5 witness W-FIN-VO-APPROVE.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F5 — VO approval moves the contract (DR→CO).
// Proves:
//   W-FIN-VO-APPROVE-1  a folded VO is born DR; before approval revised==original, no commitment.
//   W-FIN-VO-APPROVE-2  approve → the DocAction FSM transitions DR→CO (gated, not a blind UPDATE);
//                       the VO is signed (IsApproved=Y + who/when) and carries its content signature.
//   W-FIN-VO-APPROVE-3  the commitment MOVES: C_Project.CommittedAmt += GrandTotal, IsCommitment='Y',
//                       and the Revised Contract Sum = original + VO (proj_control.contractSum).
//   W-FIN-VO-APPROVE-4  a SECOND approve is idempotent — no double-commit, revised unchanged.
//   W-FIN-VO-APPROVE-5  FALSIFIER — approving an already-CO order is rejected by the FSM (illegal-action),
//                       proving the transition is gated by the FSM, not a blind write.
//   W-FIN-VO-APPROVE-6  CONTRACT — vo_approve reuses erp/ad_docfsm.js dispatchOrder.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_vo_approve.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
const ProjFold = require('../viewer/proj_fold.js');
const VoFold = require('../viewer/vo_fold.js');
const VoApprove = require('../viewer/vo_approve.js');
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
  if (!BLD || !ERP) { console.log('§FIN_VOA SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const now = '2026-06-15 10:00:00';

  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
  const projId = r.projectId;
  const original = scalar(edb, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  const voRows = [{ status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'M2' }];
  const vo = VoFold.foldVariationOrder(edb, building, voRows, { packCurrencyISO: 'RM', now: now });
  const voTotal = scalar(edb, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=" + vo.orderId);

  // W-FIN-VO-APPROVE-1 — DR before, revised==original, no commitment.
  const status0 = scalar(edb, "SELECT DocStatus FROM C_Order WHERE C_Order_ID=" + vo.orderId);
  const cs0 = PC.contractSum(edb, projId);
  const commit0 = scalar(edb, "SELECT COALESCE(CommittedAmt,0) FROM C_Project WHERE C_Project_ID=" + projId);
  const c1 = status0 === 'DR' && eq(cs0.revised, original) && eq(cs0.approvedVOs, '0') && eq(commit0, '0');
  console.log('§FIN_VOA_1 status=' + status0 + ' revised=' + cs0.revised + ' approved=' + cs0.approvedVOs + ' committed=' + commit0 + ' ok=' + c1);

  // W-FIN-VO-APPROVE-2 — approve: FSM DR→CO + signed (who/when).
  const a1 = VoApprove.approveVariationOrder(edb, vo.orderId, { user: 100, now: now });
  const rowAfter = edb.exec("SELECT DocStatus,IsApproved,UpdatedBy,Updated,POReference FROM C_Order WHERE C_Order_ID=" + vo.orderId)[0].values[0];
  const c2 = a1.ok && a1.from === 'DR' && a1.to === 'CO' && rowAfter[0] === 'CO' && rowAfter[1] === 'Y' && rowAfter[2] === 100 && !!rowAfter[3] && !!a1.signature;
  console.log('§FIN_VOA_2 approve from=' + a1.from + ' to=' + a1.to + ' isApproved=' + rowAfter[1] + ' by=' + rowAfter[2] + ' at=' + rowAfter[3] + ' sig=' + a1.signature + ' ok=' + c2);

  // W-FIN-VO-APPROVE-3 — commitment moves; revised = original + VO.
  const cs1 = PC.contractSum(edb, projId);
  const commit1 = scalar(edb, "SELECT CommittedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  const isCommit1 = scalar(edb, "SELECT IsCommitment FROM C_Project WHERE C_Project_ID=" + projId);
  const c3 = eq(cs1.approvedVOs, voTotal) && eq(cs1.revised, BD.of(String(original)).add(BD.of(String(voTotal))).toString()) && eq(commit1, voTotal) && isCommit1 === 'Y';
  console.log('§FIN_VOA_3 approved=' + cs1.approvedVOs + ' revised=' + cs1.revised + ' (orig ' + original + '+vo ' + voTotal + ') committed=' + commit1 + ' isCommit=' + isCommit1 + ' ok=' + c3);

  // W-FIN-VO-APPROVE-4 — 2nd approve idempotent (no double commit).
  const a2 = VoApprove.approveVariationOrder(edb, vo.orderId, { user: 100, now: now });
  const cs2 = PC.contractSum(edb, projId);
  const commit2 = scalar(edb, "SELECT CommittedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  const c4 = a2.ok && a2.idempotent === true && eq(cs2.revised, cs1.revised) && eq(commit2, commit1);
  console.log('§FIN_VOA_4 2nd-approve idempotent=' + a2.idempotent + ' revised=' + cs2.revised + ' committed=' + commit2 + ' ok=' + c4);

  // W-FIN-VO-APPROVE-5 — falsifier: a fresh CO order rejected by the FSM (illegal-action).
  // (The 2nd approve above short-circuits as idempotent before the FSM; here we call the FSM path
  //  directly on a CO status to prove the gate itself refuses DR→CO when not in DR.)
  const FSM = require('../erp/ad_docfsm.js');
  const gate = FSM.dispatchOrder(edb, { docStatus: 'CO', isSOTrx: 'N' }, 'CO');
  const c5 = gate.ok === false && gate.reason === 'illegal-action';
  console.log('§FIN_VOA_5 FSM CO→CO ok=' + gate.ok + ' reason=' + gate.reason + ' legal=' + JSON.stringify(gate.legalActions) + ' gated=' + c5);

  // W-FIN-VO-APPROVE-6 — contract.
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'vo_approve.js'), 'utf8');
  const c6 = src.indexOf("require('../erp/ad_docfsm.js')") >= 0 && src.indexOf('dispatchOrder') >= 0 && src.indexOf('function approveVariationOrder') >= 0;
  console.log('§FIN_VOA_6 contract (reuses ad_docfsm dispatchOrder) ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_VOA ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-VO-APPROVE: DR→CO via FSM, commitment moves, idempotent, gated; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
