/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_blue_rollback.js — BIM→Project FINANCE lane §BLUE/F10 witness W-FIN-BLUE-ROLLBACK.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F10 — roll back / accept the speculation on the timeline.
// Proves (the real erp/kernel_ops.js W-BLUE-FUTURE seam):
//   W-FIN-BLUE-ROLLBACK-1  DISCARD — KernelOps.discardBranch folds the branch ops away atomically AND the
//                          blue projection rows are dropped → branchOps empty, the speculative VO is gone,
//                          the official contract sum is unchanged (it never saw the blue VO).
//   W-FIN-BLUE-ROLLBACK-2  the official tip is untouched across the whole speculate→discard cycle.
//   W-FIN-BLUE-ROLLBACK-3  ACCEPT — KernelOps.acceptBranchUpTo turns the blue ops WHITE (branch_id NULL)
//                          AND the projection row becomes official → it now appears in official chrome
//                          (official contract sum picks up the VO).
//   W-FIN-BLUE-ROLLBACK-4  after accept, branchOps(branch) is empty and the op is in the official projection.
//   W-FIN-BLUE-ROLLBACK-5  CONTRACT — blue_fold.discardBlue/acceptBlue wrap the kernel seam.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_blue_rollback.js

global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
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
  if (!BLD || !ERP) { console.log('§FIN_BR SKIP — missing building or erp db'); process.exit(1); }
  const KO = global.KernelOps;
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const now = '2026-06-15 15:00:00';
  const voRows = [{ status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'M2' }];

  // helper: official project + a blue VO on `branch`.
  async function setup(branch) {
    const edb = new SQL.Database(fs.readFileSync(ERP));
    const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
    const vo = VoFold.foldVariationOrder(edb, building, voRows, { packCurrencyISO: 'RM', now: now });
    const voTotal = scalar(edb, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=" + vo.orderId);
    await Blue.commitBlue(edb, branch,
      [{ op_type: 'VO_FOLD', output_guid: String(vo.orderId), params: { grandTotal: String(voTotal) }, baseTs: 1700000000000 }],
      [{ table: 'C_Order', idCol: 'C_Order_ID', id: vo.orderId }]);
    return { edb: edb, projId: r.projectId, orderId: vo.orderId, voTotal: voTotal, original: scalar(edb, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + r.projectId) };
  }

  // ── W-FIN-BLUE-ROLLBACK-1 + 2 — DISCARD reverts the speculation; official untouched. ──
  const A = await setup('blue-discard');
  const blueWhatIfBefore = PC.contractSum(A.edb, A.projId, { branch: 'blue-discard' }).whatIfRevised;
  const officialBefore = PC.contractSum(A.edb, A.projId).whatIfRevised; // never saw the blue VO
  const disc = Blue.discardBlue(A.edb, 'blue-discard');
  const bopsAfter = KO.branchOps(A.edb, 'blue-discard');
  const voRowAfter = scalar(A.edb, "SELECT COUNT(*) FROM C_Order WHERE C_Order_ID=" + A.orderId);
  const blueWhatIfAfter = PC.contractSum(A.edb, A.projId, { branch: 'blue-discard' }).whatIfRevised;
  const officialAfter = PC.contractSum(A.edb, A.projId).whatIfRevised;
  const c1 = bopsAfter.length === 0 && Number(voRowAfter) === 0 && eq(blueWhatIfBefore, BD.of(String(A.original)).add(BD.of(String(A.voTotal))).toString()) && eq(blueWhatIfAfter, A.original) && disc.removed.orders === 1;
  const c2 = eq(officialBefore, A.original) && eq(officialAfter, A.original); // official never moved
  console.log('§FIN_BR_1 discard: branchOps=' + bopsAfter.length + ' voRowGone=' + (Number(voRowAfter) === 0) + ' blueWhatIf ' + blueWhatIfBefore + '→' + blueWhatIfAfter + ' removed=' + JSON.stringify(disc.removed) + ' ok=' + c1);
  console.log('§FIN_BR_2 official untouched ' + officialBefore + '→' + officialAfter + ' ok=' + c2);

  // ── W-FIN-BLUE-ROLLBACK-3 + 4 — ACCEPT turns blue white → it becomes official. ──
  const B = await setup('blue-accept');
  const bopsB = KO.branchOps(B.edb, 'blue-accept');
  const uptoId = bopsB.length ? bopsB[bopsB.length - 1].id : 0;
  const officialPendBefore = PC.contractSum(B.edb, B.projId).pendingVOs; // 0 — blue invisible
  const acc = await Blue.acceptBlue(B.edb, 'blue-accept', uptoId);
  const bopsAcc = KO.branchOps(B.edb, 'blue-accept');         // empty — ops turned white
  // official projection = the kernel's branch_id IS NULL filter (replayOps default); the white op now lands here.
  const whiteOpAfter = Number(scalar(B.edb, "SELECT COUNT(*) FROM kernel_ops WHERE branch_id IS NULL AND op_type='VO_FOLD' AND undone=0") || 0);
  const rowTagAfter = scalar(B.edb, "SELECT branch_id FROM C_Order WHERE C_Order_ID=" + B.orderId);
  const officialPendAfter = PC.contractSum(B.edb, B.projId).pendingVOs; // == voTotal (now official)
  const c3 = acc.ok && bopsAcc.length === 0 && rowTagAfter == null && eq(officialPendBefore, '0') && eq(officialPendAfter, B.voTotal);
  const c4 = whiteOpAfter === 1;
  console.log('§FIN_BR_3 accept: branchOps(blue)=' + bopsAcc.length + ' rowTag=' + rowTagAfter + ' officialPending ' + officialPendBefore + '→' + officialPendAfter + ' ok=' + c3);
  console.log('§FIN_BR_4 op turned white (branch_id IS NULL) count=' + whiteOpAfter + ' ok=' + c4);

  // ── W-FIN-BLUE-ROLLBACK-5 — contract. ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'blue_fold.js'), 'utf8');
  const c5 = src.indexOf('function discardBlue') >= 0 && src.indexOf('discardBranch') >= 0 && src.indexOf('function acceptBlue') >= 0 && src.indexOf('acceptBranchUpTo') >= 0;
  console.log('§FIN_BR_5 contract ok=' + c5);

  const pass = c1 && c2 && c3 && c4 && c5;
  console.log('§FIN_BR ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-BLUE-ROLLBACK: discard reverts (official untouched), accept turns blue official; building=' + building);
  A.edb.close(); B.edb.close(); bdb.close();
  process.exit(pass ? 0 : 1);
})();
