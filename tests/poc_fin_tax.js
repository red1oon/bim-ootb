/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_tax.js — BIM→Project FINANCE lane §F7 witness W-FIN-TAX.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F7 — tax (SST) on the document lines.
// Proves:
//   W-FIN-TAX-1  the seeded Malaysian SST is a real C_Tax (6%, country MY) with C_Tax_Acct rows.
//   W-FIN-TAX-2  a progress claim WITH the SST tax → each line carries C_Tax_ID + TaxAmt = round(net×6%);
//               net + tax == the line total, and Σ net + Σ tax == invoice GrandTotal (gross), to the cent.
//   W-FIN-TAX-3  posting preview balances Σ Dr = Σ Cr with the tax line: Dr WIP(net) + Dr InputTax(tax),
//               Cr AP(gross).
//   W-FIN-TAX-4  the project's AC (InvoicedAmt) moves by the NET only (tax is recoverable, not a cost).
//   W-FIN-TAX-5  FALSIFIER — tax amount must equal round(net×rate); a hand-recompute matches to the cent.
//   W-FIN-TAX-6  CONTRACT — seed script present; proj_claim applies C_Tax_ID + TaxAmt.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_tax.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const BD = require('../erp/bigdecimal.js');
const ProjFold = require('../viewer/proj_fold.js');
const Claim = require('../viewer/proj_claim.js');

const BLD = [path.join(__dirname, '..', 'buildings', 'Duplex_extracted.db'),
  path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Duplex_extracted.db')].find(fs.existsSync);
const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');
const HALF_UP = BD.RoundingMode.HALF_UP;

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
  if (!BLD || !ERP) { console.log('§FIN_TAX SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});
  const now = '2026-06-15 13:00:00';

  // ── W-FIN-TAX-1 — the seeded SST is real. ──
  const sst = edb.exec("SELECT C_Tax_ID,Rate,C_Country_ID FROM C_Tax WHERE Name='SST' AND Rate=6");
  const sstId = sst.length ? sst[0].values[0][0] : null;
  const rate = sst.length ? sst[0].values[0][1] : null;
  const country = sst.length ? sst[0].values[0][2] : null;
  const taxAcctRows = scalar(edb, "SELECT COUNT(*) FROM C_Tax_Acct WHERE C_Tax_ID=" + sstId);
  const c1 = sstId != null && Number(rate) === 6 && country === 238 && Number(taxAcctRows) >= 1;
  console.log('§FIN_TAX_1 SST id=' + sstId + ' rate=' + rate + '% country=' + country + ' acctRows=' + taxAcctRows + ' ok=' + c1);

  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: now, bpartnerId: 119 });
  const projId = r.projectId;
  const ph1 = edb.exec("SELECT C_ProjectPhase_ID,PlannedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " ORDER BY SeqNo LIMIT 1")[0].values[0];
  edb.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=" + ph1[0]);
  const net = BD.of(String(ph1[1]));
  const taxGold = net.multiply(BD.of('6')).divide(BD.of('100'), 2, HALF_UP);
  const grossGold = net.add(taxGold);

  // ── W-FIN-TAX-2 — claim WITH tax: line carries tax, net+tax==gross. ──
  const cl = Claim.progressClaim(edb, projId, { now: now, bpartnerId: 119, taxId: sstId });
  const line = edb.exec("SELECT LineNetAmt,C_Tax_ID,TaxAmt,LineTotalAmt FROM C_InvoiceLine WHERE C_Invoice_ID=" + cl.invoiceId)[0].values[0];
  const invGrand = scalar(edb, "SELECT GrandTotal FROM C_Invoice WHERE C_Invoice_ID=" + cl.invoiceId);
  const invLines = scalar(edb, "SELECT TotalLines FROM C_Invoice WHERE C_Invoice_ID=" + cl.invoiceId);
  const c2 = line[1] === sstId && eq(line[2], taxGold.toString()) && eq(line[3], grossGold.toString())
    && eq(cl.taxAmt, taxGold.toString()) && eq(invGrand, grossGold.toString()) && eq(invLines, net.toString())
    && eq(invGrand, BD.of(String(invLines)).add(BD.of(String(line[2]))).toString());
  console.log('§FIN_TAX_2 lineNet=' + line[0] + ' tax=' + line[2] + '(gold ' + taxGold.toString() + ') total=' + line[3] + ' invGrand=' + invGrand + ' invTotalLines=' + invLines + ' net+tax==gross ok=' + c2);

  // ── W-FIN-TAX-3 — preview balances WITH tax (Dr WIP+InputTax = Cr AP). ──
  const pv = Claim.postingPreview(edb, cl.invoiceId);
  const drTax = pv.lines.filter(function (l) { return BD.of(l.dr).compareTo(BD.ZERO) !== 0; });
  const c3 = pv.ok && pv.balances && eq(pv.sumDr, grossGold.toString()) && eq(pv.sumCr, grossGold.toString()) && pv.lines.length >= 3;
  console.log('§FIN_TAX_3 preview Dr=' + pv.sumDr + ' Cr=' + pv.sumCr + ' balances=' + pv.balances + ' lines=' + pv.lines.length + ' ok=' + c3);
  pv.lines.forEach(function (l) { console.log('  §FIN_TAX_GL acct=' + l.account + '(' + l.acctValue + ') Dr=' + l.dr + ' Cr=' + l.cr); });

  // ── W-FIN-TAX-4 — AC moves by NET only (tax recoverable). ──
  const ac = scalar(edb, "SELECT InvoicedAmt FROM C_Project WHERE C_Project_ID=" + projId);
  const c4 = eq(ac, net.toString());
  console.log('§FIN_TAX_4 projInvoiced(AC)=' + ac + ' net=' + net.toString() + ' (tax NOT in AC) ok=' + c4);

  // ── W-FIN-TAX-5 — falsifier: hand-recompute tax == stored, to the cent. ──
  const handTax = net.multiply(BD.of(String(rate))).divide(BD.of('100'), 2, HALF_UP);
  const c5 = eq(handTax.toString(), line[2]) && !eq(handTax.add(BD.of('0.01')).toString(), line[2]);
  console.log('§FIN_TAX_5 handTax=' + handTax.toString() + ' stored=' + line[2] + ' exact=' + c5);

  // ── W-FIN-TAX-6 — contract. ──
  const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_claim.js'), 'utf8');
  const c6 = fs.existsSync(path.join(__dirname, '..', 'scripts', 'seed_fin_tax.js')) && src.indexOf('C_Tax_ID') >= 0 && src.indexOf('TaxAmt') >= 0 && src.indexOf('t_credit_acct') >= 0;
  console.log('§FIN_TAX_6 contract ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_TAX ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-TAX: SST 6% on lines, net+tax==gross, preview balances, AC=net; building=' + building);
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
