/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bake_gw_hospital_seed.js — PREPARE the GardenWorld sample: bake the Hospital BIM Project Order into the
//   ERP seed (erp/ad_seed.db) so a clean reload already contains it (NO OPFS push, NO boot overlay — the
//   round-trip cache-bug path is sidestepped entirely). Spec: prompts/GW_HOSPITAL_SHOWCASE_SPEC.md §E1.
//
// EXTRACT/COMPILE ONLY — drives the REAL fold engine verbatim (viewer/proj_fold.js foldProjectOrder via the
//   same compute5D + apply5DRates basis as tests/poc_proj_push.js). Identity/qty from Hospital_extracted.db
//   geometry, price from the cidb2024_my rate pack, phase dates from sequence_rules.json. Money via BigDecimal.
//   Fixed `now` → deterministic, re-runnable (a second run is idempotent: +0 rows).
//
// Witness W-GW-HOSP-FOLD (whitebox §-log first — read the log, exit code is not evidence):
//   §GWHOSP created counts; PlannedAmt == 5D golden to the cent; product Value==ifc_class (correlation key);
//   band PK >= 990000; idempotent on re-run.
//
// SAFE BY DEFAULT: dry-run (in-memory, file untouched) unless `--write` is passed. With --write it overwrites
//   erp/ad_seed.db in THIS worktree only (commit is a separate, reviewable step).
// Run (dry):   NODE_PATH=$HOME/bim-ootb/node_modules node tests/bake_gw_hospital_seed.js
//     (write): NODE_PATH=$HOME/bim-ootb/node_modules node tests/bake_gw_hospital_seed.js --write

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../../viewer/proj_fold.js');

const WRITE = process.argv.includes('--write');
const HOME = process.env.HOME;
const BLD = path.join(HOME, 'bim-ootb', 'buildings', 'Hospital_extracted.db');
const ERP = path.join(__dirname, '..', 'ad_seed.db');
const RATES_DIR = path.join(__dirname, '..', '..', 'viewer', 'rates');
const BUILDING = 'Hospital';
const NOW = '2026-06-14 00:00:00';      // FIXED anchor → deterministic fold (never Date.now)

// ── compute5D / apply5DRates — verbatim basis from analysis_sidecar.js (== poc_proj_push.js) ──
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
function tot(c) { return c.projects + c.phases + c.tasks + c.lines + c.products + c.categories + c.order; }

const out = [];
const W = (ok, msg) => { out.push((ok ? '🟢' : '🔴') + ' ' + msg); return ok; };

(async function () {
  if (!fs.existsSync(BLD)) { console.log('§GWHOSP SKIP — missing ' + BLD); process.exit(1); }
  if (!fs.existsSync(ERP)) { console.log('§GWHOSP SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));      // in-memory writable copy

  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const RATES = pack.materials || {};
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const opts = { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'MYR', now: NOW };

  const priced = apply5DRates(compute5D(bdb, BUILDING), RATES);
  const golden = priced.reduce((a, r) => a + r.cost, 0);

  // ── FOLD 1 ──
  const r1 = ProjFold.foldProjectOrder(edb, BUILDING, priced, opts);
  console.log('§GWHOSP fold project=' + BUILDING + ' phases=+' + r1.created.phases + ' tasks=+' + r1.created.tasks +
    ' lines=+' + r1.created.lines + ' products=+' + r1.created.products + ' cats=+' + r1.created.categories +
    ' order=' + (r1.orderId || '-'));
  W(tot(r1.created) > 0, 'fold created a non-empty Hospital Project tree (' + tot(r1.created) + ' rows)');

  // ── FOLD 2 (idempotency) ──
  const r2 = ProjFold.foldProjectOrder(edb, BUILDING, priced, opts);
  W(tot(r2.created) === 0, 'idempotent — 2nd fold adds 0 rows (got ' + tot(r2.created) + ')');

  // ── assertions against the baked seed ──
  const scalar = (s) => { const r = edb.exec(s); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; };
  const projId = scalar("SELECT C_Project_ID FROM C_Project WHERE Value='" + BUILDING + "'");
  const planned = scalar("SELECT CAST(ROUND(PlannedAmt) AS INTEGER) FROM C_Project WHERE Value='" + BUILDING + "'");
  W(projId != null && projId >= 990000, 'Hospital C_Project in BIM band (id=' + projId + ' >= 990000)');
  W(planned === golden, 'PlannedAmt == 5D golden to the cent (seed=' + planned + ' golden=' + golden + ')');
  W(scalar("SELECT AD_Client_ID FROM C_Project WHERE Value='" + BUILDING + "'") === 11,
    'project belongs to GardenWorld (client 11)');

  // correlation key: a Hospital line's product Value is an IFC class present in the model
  const someCls = priced.find(p => p.cls && /^Ifc/.test(p.cls)).cls;
  const prodVal = scalar("SELECT Value FROM M_Product WHERE Value='" + someCls + "' AND M_Product_ID>=990000");
  W(prodVal === someCls, 'correlation key holds — M_Product.Value==ifc_class (' + someCls + ') in band');
  const phasesN = scalar("SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=" + projId);
  W(phasesN > 0, 'phases present for the project (' + phasesN + ')');

  const pass = out.filter(l => l.startsWith('🟢')).length, total = out.length;
  console.log(out.join('\n'));
  console.log('\nW-GW-HOSP-FOLD ' + pass + '/' + total + (WRITE ? ' [WRITE]' : ' [dry-run]'));

  if (WRITE && pass === total) {
    const bytes = Buffer.from(edb.export());
    fs.writeFileSync(ERP, bytes);
    console.log('§GWHOSP WROTE ' + ERP + ' (' + bytes.length + ' bytes)');
  } else if (WRITE) {
    console.log('§GWHOSP NOT WRITTEN — witness not green');
  }
  fs.writeFileSync(path.join(__dirname, 'bake_gw_hospital_seed.log'), out.join('\n') + '\n');
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
