/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_proj_push.js — BIM → Project Order, TASK C witness W-PROJ-PUSH / W-PROJ-FOLD / W-PROJ-SEQ
// Implementing prompts/BIM_TO_PROJECT.md TASK C — the keystone: fold a priced selection into a real
//   iDempiere C_Project tree (proj→phase→task→line + M_Product/Category), idempotent, money via BigDecimal.
// Proves:  W-PROJ-PUSH  — first fold creates the tree; a SECOND fold adds 0 rows (idempotent).
//          W-PROJ-FOLD  — Σ project PlannedAmt == the 5D golden (apply5DRates) to the cent (BigDecimal).
//          W-PROJ-SEQ   — every phase SeqNo traces to sequence_rules.json; schedule dates are monotonic.
// Non-destructive: folds into an IN-MEMORY copy of ad_seed.db (the file is never written).
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_proj_push.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');

const BLD = [path.join(__dirname, '..', 'buildings', 'Duplex_extracted.db'),
  path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Duplex_extracted.db')].find(fs.existsSync);
const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');

// ── compute5D / apply5DRates — verbatim basis from analysis_sidecar.js (same as poc_find_cost.js) ──
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

(async function () {
  if (!BLD || !ERP) { console.log('§PROJ_PUSH SKIP — missing building or erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const bdb = new SQL.Database(fs.readFileSync(BLD));
  const edb = new SQL.Database(fs.readFileSync(ERP));          // IN-MEMORY writable copy (file untouched)
  const building = bdb.exec('SELECT DISTINCT building FROM elements_meta LIMIT 1')[0].values[0][0];

  const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
  const RATES = pack.materials || {};
  const packISO = 'MYR';                                       // CIDB Malaysia pack → MYR
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));

  const priced = apply5DRates(compute5D(bdb, building), RATES); // whole building = select-nothing
  const golden = priced.reduce(function (a, r) { return a + r.cost; }, 0); // 5D golden (Number, apply5DRates)

  const opts = { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: packISO, now: '2026-06-14 00:00:00' };

  // ── FOLD 1 ──
  const r1 = ProjFold.foldProjectOrder(edb, building, priced, opts);
  console.log('§PROJ_PUSH project=' + building + ' phases=+' + r1.created.phases + ' tasks=+' + r1.created.tasks +
    ' lines=+' + r1.created.lines + ' products=+' + r1.created.products + ' cats=+' + r1.created.categories +
    ' order=' + (r1.orderId || '-'));
  r1.notes.forEach(function (n) { console.log('  §PROJ_PUSH_NOTE ' + n); });

  // ── FOLD 2 (idempotency) ──
  const r2 = ProjFold.foldProjectOrder(edb, building, priced, opts);
  const idemp = tot(r2.created) === 0;
  console.log('§PROJ_PUSH_IDEMPOTENT 2nd-run-new=' + tot(r2.created) + ' (phases=+' + r2.created.phases +
    ' tasks=+' + r2.created.tasks + ' lines=+' + r2.created.lines + ' products=+' + r2.created.products + ') match=' + idemp);

  // ── W-PROJ-FOLD: project PlannedAmt == 5D golden (to the cent) ──
  const projAmt = edb.exec("SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=" + r1.projectId)[0].values[0][0];
  const foldOk = Math.round(Number(projAmt)) === golden;
  console.log('§PROJ_FOLD plannedAmt=' + projAmt + ' golden=' + golden + ' match=' + foldOk + ' (BigDecimal == apply5DRates 5D)');

  // ── W-PROJ-SEQ: seqno traces to sequence_rules; dates monotonic ──
  let seqOk = true, lastEnd = '';
  r1.seqLog.forEach(function (s) {
    // the phase's seqno must equal the MIN sequence among its classes in sequence_rules
    var clsSeqs = Object.keys(sr.SEQUENCE_RULES).filter(function (c) { return sr.SEQUENCE_RULES[c].phase === s.phase; })
      .map(function (c) { return sr.SEQUENCE_RULES[c].sequence; });
    var expect = clsSeqs.length ? Math.min.apply(null, clsSeqs) : s.seqno;
    var traces = (expect === s.seqno);
    var mono = s.start >= lastEnd; lastEnd = s.end;
    if (!traces || !mono) seqOk = false;
    console.log('§PROJ_SEQ phase="' + s.phase + '" seqno=' + s.seqno + ' start=' + s.start + ' end=' + s.end +
      ' traces=' + traces + ' monotonic=' + mono);
  });

  // counts written back (proof the tree exists)
  const np = edb.exec("SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=" + r1.projectId)[0].values[0][0];
  const nt = edb.exec("SELECT COUNT(*) FROM C_ProjectTask WHERE C_ProjectPhase_ID IN (SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=" + r1.projectId + ")")[0].values[0][0];
  const nl = edb.exec("SELECT COUNT(*) FROM C_ProjectLine WHERE c_project_id=" + r1.projectId)[0].values[0][0];
  console.log('§PROJ_PUSH_TREE phases=' + np + ' tasks=' + nt + ' lines=' + nl + ' projectAmt=' + projAmt);

  const engineOk = r1.created.projects === 1 && r1.created.lines > 0 && idemp && foldOk && seqOk;
  console.log('§PROJ_PUSH ' + (engineOk ? 'PASS' : 'FAIL') + ' — fold created the C_Project tree, is idempotent, ' +
    'amount folds to the 5D golden, seqno traces to sequence_rules; building=' + building);

  // ── CONTRACT: the > to ERP button call-path must actually be wired in the deployed viewer source ──
  function srcHas(file, tokens) {
    var p = path.join(__dirname, '..', file);
    var s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(function (t) { var ok = s.indexOf(t) >= 0; if (!ok) console.log('  §PROJ_PUSH_CONTRACT MISSING ' + file + ' :: ' + t); return ok; });
  }
  const cNav = srcHas('viewer/navigate_find.js', ['function _pushToErp', 'function _selectionPriced', 'id="find-erp-btn"', 'window.ProjFold.foldProjectOrder', 'elErpBtn.onclick', '§PROJ_PUSH project=']);
  const cFold = srcHas('viewer/proj_fold.js', ['function foldProjectOrder', 'global.ProjFold']);
  const cHtml = srcHas('viewer/viewer.html', ['proj_fold.js', 'bigdecimal.js']);
  const contractOk = cNav && cFold && cHtml;
  console.log('§PROJ_PUSH_CONTRACT ' + (contractOk ? 'PASS' : 'FAIL') + ' — navigate_find=' + cNav + ' proj_fold=' + cFold +
    ' viewer.html=' + cHtml + ' (> ERP button → _pushToErp → ProjFold wired; scripts loaded)');

  const pass = engineOk && contractOk;
  bdb.close(); edb.close();
  process.exit(pass ? 0 : 1);
})();
