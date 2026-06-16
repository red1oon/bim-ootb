/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_blue_spec.js — BIM→Project FINANCE lane §BLUE/F9 witness W-FIN-BLUE-SPEC.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F9 — speculative ("blue") Project Order / VO.
// Proves (reusing the real erp/kernel_ops.js W-BLUE-FUTURE seam, as BlueFuture.groupMeta() does):
//   W-FIN-BLUE-SPEC-1  a blue push records the VO fold as a kernel op on the active branch —
//                      KernelOps.branchOps(db, branch) carries it (output_guid == the VO order id).
//   W-FIN-BLUE-SPEC-2  the OFFICIAL projection (branchOps null) does NOT see the blue op; and the blue
//                      C_Order row is tagged branch_id (an official 'branch_id IS NULL' query excludes it).
//   W-FIN-BLUE-SPEC-3  the contract-sum control shows the speculative delta ONLY in the blue view:
//                      official revised == original; blue-view revised == original + VO.
//   W-FIN-BLUE-SPEC-4  FALSIFIER — without the branch arg, contractSum is official (never leaks the blue VO).
//   W-FIN-BLUE-SPEC-5  CONTRACT — blue_fold reuses KernelOps.commitGroup + groupMeta {branch_id}.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_blue_spec.js

global.window = global; // kernel_ops.js is a browser IIFE (window.KernelOps) — shim for the headless witness
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto; // SHA-256 for the op-log seal
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
require('../erp/kernel_ops.js');
const ProjFold = require('../viewer/proj_fold.js');
const VoFold = require('../viewer/vo_fold.js');
const PC = require('../viewer/proj_control.js');
const Blue = require('../viewer/blue_fold.js');

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
  if (!BLD || !ERP) { console.log('§FIN_BLUE SKIP — missing building or erp db'); process.exit(1); }
  const KO = global.KernelOps;
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const now = '2026-06-15 14:00:00';
  const BRANCH = 'blue-bim2proj-1';

  // official project (white).
  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
  const projId = r.projectId;
  const original = scalar(edb, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + projId);

  // ── BLUE push: fold a speculative VO, route it onto branch via the kernel op-log + tag the row. ──
  const voRows = [{ status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'M2' }];
  const vo = VoFold.foldVariationOrder(edb, building, voRows, { packCurrencyISO: 'RM', now: now });
  const voTotal = scalar(edb, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=" + vo.orderId);
  const blue = await Blue.commitBlue(edb, BRANCH,
    [{ op_type: 'VO_FOLD', output_guid: String(vo.orderId), params: { building: building, grandTotal: String(voTotal), projectId: projId }, baseTs: 1700000000000 }],
    [{ table: 'C_Order', idCol: 'C_Order_ID', id: vo.orderId }]);
  console.log('§FIN_BLUE_PUSH branch=' + BRANCH + ' voOrder=' + vo.orderId + ' voTotal=' + voTotal + ' opIds=' + JSON.stringify(blue.opIds));

  // ── W-FIN-BLUE-SPEC-1 — branchOps carries the VO op (output_guid == order id). ──
  const bops = KO.branchOps(edb, BRANCH);
  const opOut = bops.length ? scalar(edb, "SELECT output_guid FROM kernel_ops WHERE id=" + bops[0].id) : null;
  const c1 = blue.ok && bops.length === 1 && bops[0].op_type === 'VO_FOLD' && String(opOut) === String(vo.orderId);
  console.log('§FIN_BLUE_SPEC_1 branchOps=' + JSON.stringify(bops) + ' output_guid=' + opOut + ' ok=' + c1);

  // ── W-FIN-BLUE-SPEC-2 — official op-projection empty; the blue row is excluded by branch_id IS NULL. ──
  const official = KO.branchOps(edb, null);
  const blueRowVisibleOfficial = scalar(edb, "SELECT COUNT(*) FROM C_Order WHERE C_Order_ID=" + vo.orderId + " AND branch_id IS NULL");
  const blueRowTag = scalar(edb, "SELECT branch_id FROM C_Order WHERE C_Order_ID=" + vo.orderId);
  const c2 = official.length === 0 && Number(blueRowVisibleOfficial) === 0 && blueRowTag === BRANCH;
  console.log('§FIN_BLUE_SPEC_2 officialOps=' + official.length + ' blueRowOfficialVisible=' + blueRowVisibleOfficial + ' rowTag=' + blueRowTag + ' ok=' + c2);

  // ── W-FIN-BLUE-SPEC-3 — contract sum: official == original; blue view == original + VO. ──
  const csOfficial = PC.contractSum(edb, projId);                // no branch → official
  const csBlue = PC.contractSum(edb, projId, { branch: BRANCH }); // blue view
  const whatIf = BD.of(String(original)).add(BD.of(String(voTotal))).toString();
  // the speculative (draft) VO shows ONLY in the blue view's pending / what-if; official sees neither.
  const c3 = eq(csOfficial.pendingVOs, '0') && eq(csOfficial.whatIfRevised, original)
    && eq(csBlue.pendingVOs, voTotal) && eq(csBlue.whatIfRevised, whatIf) && eq(csBlue.revised, original);
  console.log('§FIN_BLUE_SPEC_3 official{pend=' + csOfficial.pendingVOs + ',whatIf=' + csOfficial.whatIfRevised + '} blue{pend=' + csBlue.pendingVOs + ',whatIf=' + csBlue.whatIfRevised + ',rev=' + csBlue.revised + '} orig=' + original + ' vo=' + voTotal + ' ok=' + c3);

  // ── W-FIN-BLUE-SPEC-4 — falsifier: default view never leaks the blue VO. ──
  const c4 = csOfficial.view === 'official' && csBlue.view === 'blue:' + BRANCH && eq(csOfficial.revised, original);
  console.log('§FIN_BLUE_SPEC_4 official-view-no-leak view="' + csOfficial.view + '" ok=' + c4);

  // ── W-FIN-BLUE-SPEC-5 — contract. ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'blue_fold.js'), 'utf8');
  const c5 = src.indexOf('commitGroup') >= 0 && src.indexOf('branch_id') >= 0 && src.indexOf('function commitBlue') >= 0 && src.indexOf('discardBranch') >= 0 && src.indexOf('acceptBranchUpTo') >= 0;
  console.log('§FIN_BLUE_SPEC_5 contract (reuses KernelOps commitGroup/discardBranch/acceptBranchUpTo) ok=' + c5);

  const pass = c1 && c2 && c3 && c4 && c5;
  console.log('§FIN_BLUE_SPEC ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-BLUE-SPEC: blue VO on the op-log, invisible to official, contract delta only in blue view; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
