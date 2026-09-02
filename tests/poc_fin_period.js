/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_fin_period.js — BIM→Project FINANCE lane §F8 witness W-FIN-PERIOD.
// Implementing prompts/BIM_PROJECT_FINANCE_LANE.md §F8 — period control.
// Proves:
//   W-FIN-PERIOD-1  an OPEN accounting date resolves a C_Period whose C_PeriodControl(API) is Open.
//   W-FIN-PERIOD-2  a never-opened/closed date resolves the period but status != Open (refusable).
//   W-FIN-PERIOD-3  a progress claim with DateAcct in an OPEN period + requireOpenPeriod → succeeds,
//                   and its invoice DateAcct sits inside that open period.
//   W-FIN-PERIOD-4  FALSIFIER — the SAME claim with a closed-period DateAcct + requireOpenPeriod is
//                   REFUSED (ok=false, period-not-open) and writes NO invoice.
//   W-FIN-PERIOD-5  conversion rate honored — the MYR→acct rate is resolvable AS OF the open DateAcct
//                   (validfrom ≤ date ≤ validto).
//   W-FIN-PERIOD-6  CONTRACT — proj_period exports the API; proj_claim consults it; viewer.html loads it.
// Non-destructive in-memory fold. Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_fin_period.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');
const Claim = require('../viewer/proj_claim.js');
const Period = require('../viewer/proj_period.js');

const BLD = [path.join(__dirname, '..', 'buildings', 'Duplex_extracted.db'),
  path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Duplex_extracted.db')].find(fs.existsSync);
const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');
const OPEN_DATE = '2006-12-15 00:00:00';   // C_PeriodControl(API) status 'O' (GardenWorld-era open period)
const CLOSED_DATE = '2026-06-15 00:00:00'; // status 'N' (never opened)

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
  if (!BLD || !ERP) { console.log('§FIN_PER SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];
  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const priced = apply5DRates(compute5D(bdb, building), pack.materials || {});

  // a fresh ERP db per scenario (so the closed-date falsifier is independent of the open-date claim).
  function freshErp() { return new SQL.Database(fs.readFileSync(ERP)); }

  // ── W-FIN-PERIOD-1 + 2 — resolver: open date vs never-opened date. ──
  const edb = freshErp();
  const pOpen = Period.resolvePeriod(edb, OPEN_DATE, 'API', 11);
  const pClosed = Period.resolvePeriod(edb, CLOSED_DATE, 'API', 11);
  const c1 = pOpen.ok && pOpen.open && pOpen.status === 'O';
  const c2 = pClosed.ok && !pClosed.open && pClosed.status !== 'O';
  console.log('§FIN_PER_1 open ' + pOpen.dateAcct + ' period="' + pOpen.name + '" status=' + pOpen.status + ' open=' + pOpen.open + ' ok=' + c1);
  console.log('§FIN_PER_2 closed ' + pClosed.dateAcct + ' period="' + pClosed.name + '" status=' + pClosed.status + ' open=' + pClosed.open + ' refusable=' + c2);

  // fold + complete a phase (in this db).
  const r = ProjFold.foldProjectOrder(edb, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: '2026-06-15 00:00:00', bpartnerId: 119 });
  const projId = r.projectId;
  const ph1 = scalar(edb, "SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " ORDER BY SeqNo LIMIT 1");
  edb.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=" + ph1);

  // ── W-FIN-PERIOD-3 — claim with OPEN DateAcct + enforcement → succeeds, DateAcct in open period. ──
  const clOpen = Claim.progressClaim(edb, projId, { now: OPEN_DATE, bpartnerId: 119, requireOpenPeriod: true });
  const invDate = clOpen.invoiceId ? scalar(edb, "SELECT DateAcct FROM C_Invoice WHERE C_Invoice_ID=" + clOpen.invoiceId) : null;
  const inWindow = invDate && String(invDate).slice(0, 10) >= String(pOpen.startDate).slice(0, 10) && String(invDate).slice(0, 10) <= String(pOpen.endDate).slice(0, 10);
  const c3 = clOpen.ok && !clOpen.idempotent && clOpen.invoiceId != null && clOpen.period && clOpen.period.open && inWindow;
  console.log('§FIN_PER_3 claim ok=' + clOpen.ok + ' inv=' + clOpen.documentNo + ' dateAcct=' + (invDate ? String(invDate).slice(0, 10) : null) + ' period="' + (clOpen.period && clOpen.period.name) + '" inWindow=' + inWindow + ' ok=' + c3);

  // ── W-FIN-PERIOD-4 — FALSIFIER: same claim with CLOSED DateAcct + enforcement → refused, no invoice. ──
  const edb2 = freshErp();
  const r2 = ProjFold.foldProjectOrder(edb2, building, priced, { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'RM', now: '2026-06-15 00:00:00', bpartnerId: 119 });
  edb2.run("UPDATE C_ProjectPhase SET IsComplete='Y' WHERE C_ProjectPhase_ID=(SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=" + r2.projectId + " ORDER BY SeqNo LIMIT 1)");
  const before = scalar(edb2, "SELECT COUNT(*) FROM C_Invoice WHERE Description LIKE 'BIM Progress Claim:%'");
  const clClosed = Claim.progressClaim(edb2, r2.projectId, { now: CLOSED_DATE, bpartnerId: 119, requireOpenPeriod: true });
  const after = scalar(edb2, "SELECT COUNT(*) FROM C_Invoice WHERE Description LIKE 'BIM Progress Claim:%'");
  const c4 = clClosed.ok === false && clClosed.reason === 'period-not-open' && clClosed.invoiceId == null && Number(after) === Number(before);
  console.log('§FIN_PER_4 refused ok=' + clClosed.ok + ' reason=' + clClosed.reason + ' invoicesBefore=' + before + ' after=' + after + ' falsifier=' + c4);

  // ── W-FIN-PERIOD-5 — conversion rate honored as-of the open DateAcct. ──
  const myr = scalar(edb, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code='MYR'");
  const acct = scalar(edb, "SELECT C_Currency_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1");
  const cr = Period.conversionRateAsOf(edb, myr, acct, OPEN_DATE);
  const c5 = cr.ok && cr.rate != null;
  console.log('§FIN_PER_5 convRate MYR(' + myr + ')→acct(' + acct + ') asOf ' + cr.dateAcct + ' = ' + cr.rate + ' ok=' + c5);

  // ── W-FIN-PERIOD-6 — contract. ──
  const psrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_period.js'), 'utf8');
  const csrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'proj_claim.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'viewer.html'), 'utf8');
  const c6 = psrc.indexOf('function resolvePeriod') >= 0 && psrc.indexOf('function conversionRateAsOf') >= 0 && psrc.indexOf('global.ProjPeriod') >= 0
    && csrc.indexOf('requireOpenPeriod') >= 0 && csrc.indexOf('resolvePeriod') >= 0 && html.indexOf('proj_period.js') >= 0;
  console.log('§FIN_PER_6 contract ok=' + c6);

  const pass = c1 && c2 && c3 && c4 && c5 && c6;
  console.log('§FIN_PER ' + (pass ? 'PASS' : 'FAIL') + ' — W-FIN-PERIOD: open period resolves+posts, closed refused, conversion rate honored; building=' + building);
  bdb.close(); edb.close(); edb2.close();
  process.exit(pass ? 0 : 1);
})();
