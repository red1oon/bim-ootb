/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_claim.js — BIM→Project FINANCE lane §F6 witness W-FIN-CLAIM (+ W-FIN-CLAIM-POST).
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F6 — progress claim → C_Invoice + posting preview.
// Proves:
//   W-FIN-CLAIM-1   complete a phase → a progress C_Invoice (AP) is raised; its amount == the earned
//                   value of the newly-complete phase(s) (BigDecimal, to the cent).
//   W-FIN-CLAIM-2   the claim moves C_Project.InvoicedAmt → EVM AC == claim, CPI now computable (closes
//                   the F4 'AC=0' honesty gap once there is real progress).
//   W-FIN-CLAIM-3   POSTING PREVIEW balances Σ Dr = Σ Cr (Dr WIP/Cost, Cr AP), real chart accounts.
//   W-FIN-CLAIM-4   idempotent — a re-claim with no newly-complete phase raises nothing (claim=0).
//   W-FIN-CLAIM-5   honesty — the preview does NOT write Fact_Acct (posted=false) + carries the note.
//   W-FIN-CLAIM-6   FALSIFIER — a deliberately unbalanced manifest is detected (balances=false).
//   W-FIN-CLAIM-7   CONTRACT — proj_claim exports progressClaim + postingPreview; viewer.html loads it.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_claim.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
const ProjFold = require('../viewer/proj_fold.js');
const PC = require('../viewer/proj_control.js');
const Claim = require('../viewer/proj_claim.js');

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
  if (!BLD || !ERP) { console.log('§FIN_CLAIM SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const now = '2026-06-15 12:00:00';

  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
  const projId = r.projectId;
  // complete the first phase (the PM marks progress).
  const ph1 = edb.exec("SELECT C_ProjectPhase_ID,PlannedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " ORDER BY SeqNo LIMIT 1")[0].values[0];
  edb.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=" + ph1[0]);
  const earned = ph1[1];

  // ── W-FIN-CLAIM-1 — claim == earned value of the completed phase. ──
  const cl = Claim.progressClaim(edb, projId, { now: now, bpartnerId: 119 });
  const invGrand = scalar(edb, "SELECT GrandTotal FROM C_Invoice WHERE C_Invoice_ID=" + cl.invoiceId);
  const c1 = cl.ok && !cl.idempotent && eq(cl.claimAmt, earned) && eq(invGrand, earned) && cl.phasesClaimed === 1;
  console.log('§FIN_CLAIM_1 inv=' + cl.documentNo + ' claim=' + cl.claimAmt + ' earned=' + earned + ' invGrand=' + invGrand + ' phases=' + cl.phasesClaimed + ' ok=' + c1);

  // ── W-FIN-CLAIM-2 — AC moves; CPI now computable. ──
  const acAfter = scalar(edb, "SELECT InvoicedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  const evmAfter = PC.evm(edb, projId, '2026-12-31');
  const c2 = eq(acAfter, earned) && eq(evmAfter.ac, earned) && evmAfter.cpi !== null;
  console.log('§FIN_CLAIM_2 projInvoiced=' + acAfter + ' evmAC=' + evmAfter.ac + ' cpi=' + evmAfter.cpi + ' (was null) ok=' + c2);

  // ── W-FIN-CLAIM-3 + 5 — posting preview balances; honest (no Fact_Acct write). ──
  const pv = Claim.postingPreview(edb, cl.invoiceId);
  const c3 = pv.ok && pv.balances && eq(pv.sumDr, earned) && eq(pv.sumCr, earned) && pv.lines.length >= 2;
  const c5 = pv.posted === false && /PREVIEW only/.test(pv.note || '');
  console.log('§FIN_CLAIM_3 preview Dr=' + pv.sumDr + ' Cr=' + pv.sumCr + ' balances=' + pv.balances + ' lines=' + pv.lines.length + ' ok=' + c3);
  pv.lines.forEach(function (l) { console.log('  §FIN_CLAIM_GL acct=' + l.account + '(' + l.acctValue + ') Dr=' + l.dr + ' Cr=' + l.cr); });
  console.log('§FIN_CLAIM_5 posted=' + pv.posted + ' note="' + pv.note + '" honest=' + c5);

  // ── W-FIN-CLAIM-4 — idempotent: re-claim with no new completed phase. ──
  const cl2 = Claim.progressClaim(edb, projId, { now: now, bpartnerId: 119 });
  const c4 = cl2.ok && cl2.idempotent && eq(cl2.claimAmt, '0') && cl2.invoiceId == null;
  console.log('§FIN_CLAIM_4 re-claim idempotent=' + cl2.idempotent + ' claim=' + cl2.claimAmt + ' ok=' + c4);

  // ── W-FIN-CLAIM-6 — falsifier: an unbalanced manifest is detected. ──
  // tamper: zero out a line's net so Dr < Cr, re-preview a fresh claim on a 2nd completed phase.
  const ph2 = edb.exec("SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " AND IsComplete='N' ORDER BY SeqNo LIMIT 1")[0].values[0];
  edb.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=" + ph2[0]);
  const cl3 = Claim.progressClaim(edb, projId, { now: now, bpartnerId: 119 });
  edb.run("UPDATE C_InvoiceLine SET LineNetAmt=LineNetAmt-1 WHERE C_Invoice_ID=" + cl3.invoiceId); // break balance by 1
  const pvBad = Claim.postingPreview(edb, cl3.invoiceId);
  const c6 = pvBad.balances === false && !eq(pvBad.sumDr, pvBad.sumCr);
  console.log('§FIN_CLAIM_6 falsifier Dr=' + pvBad.sumDr + ' Cr=' + pvBad.sumCr + ' balances=' + pvBad.balances + ' detected=' + c6);

  // ── W-FIN-CLAIM-7 — contract. ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_claim.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'viewer.html'), 'utf8');
  const c7 = src.indexOf('function progressClaim') >= 0 && src.indexOf('function postingPreview') >= 0 && src.indexOf('global.ProjClaim') >= 0 && html.indexOf('proj_claim.js') >= 0;
  console.log('§FIN_CLAIM_7 contract ok=' + c7);

  const pass = c1 && c2 && c3 && c4 && c5 && c6 && c7;
  console.log('§FIN_CLAIM ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-CLAIM: progress claim==EV, AC moves, preview balances ΣDr=ΣCr, idempotent, honest; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
