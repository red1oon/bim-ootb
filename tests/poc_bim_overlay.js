/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_bim_overlay.js — BIM → Project round-trip §B witness (docs/BIMtoERP.md §B write-path)
// The READ side: overlay the viewer-folded rows (proj_fold + vo_fold, PK >= BIM_BASE) onto a fresh
// ad_seed.db, the way idempiere.html does at boot, so the pushed Project Order AND its VO amendment
// land in the STANDARD C_Project / C_Order windows. Non-destructive: in-memory copies.
// Proves:
//   W-BIM-OVERLAY      — every BIM row in the folded store lands in the live ERP db (project tree + VO order).
//   W-BIM-OVERLAY-IDMP — a 2nd overlay (re-boot / re-push) adds NO duplicates (INSERT OR IGNORE on PK).
//   W-BIM-OVERLAY-BASE — base rows (PK < BIM_BASE) are untouched (overlay is additive, not a replace).
//   W-BIM-OVERLAY-CONTRACT — module dual-exports + idempiere.html loads it and calls apply at boot.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/poc_bim_overlay.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const ProjFold = require('../viewer/proj_fold.js');
const VoFold = require('../viewer/vo_fold.js');
const Overlay = require('../erp/bim_orders_overlay.js');

const ERP = [path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db')].find(fs.existsSync);
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');
const BIM_BASE = Overlay.BIM_BASE;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  §BIM_OVERLAY FAIL: ' + name); } }
function pkOf(db, table) {
  var r = db.exec("SELECT name FROM pragma_table_info('" + table + "')");
  var cols = r.length ? r[0].values.map(x => x[0]) : [], want = (table + '_id').toLowerCase();
  return cols.find(c => c.toLowerCase() === want) || cols[0];
}
function bimCount(db) {
  var total = 0, per = {};
  Overlay.TABLES.forEach(t => {
    var pk = pkOf(db, t);
    var v = db.exec('SELECT COUNT(*) FROM "' + t + '" WHERE "' + pk + '" >= ' + BIM_BASE);
    var n = (v.length ? v[0].values[0][0] : 0) || 0; per[t] = n; total += n;
  });
  return { total, per };
}
function scalar(db, sql) { var r = db.exec(sql); return r.length && r[0].values.length ? r[0].values[0][0] : null; }

(async function () {
  if (!ERP) { console.log('§BIM_OVERLAY SKIP — missing erp db'); process.exit(1); }
  const SQL = await initSqlJs();
  const BUILDING = 'OverlayTestBuilding';
  const now = '2026-06-14 00:00:00';
  const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
  const seedBytes = fs.readFileSync(ERP);

  // ── arrange: a FOLDED store (what the viewer persists to OPFS) = ad_seed.db + project + VO ──
  const src = new SQL.Database(new Uint8Array(seedBytes));
  ProjFold.foldProjectOrder(src, BUILDING, [
    { disc: 'ARC', cls: 'IfcWall', storey: 'L1', count: 20, unit: 'EA', qty: 20, rate: 100, cost: 2000 },
    { disc: 'MEP', cls: 'IfcPipeSegment', storey: 'L1', count: 12, unit: 'EA', qty: 12, rate: 50, cost: 600 },
  ], { seqRules: sr.SEQUENCE_RULES, laborRates: sr.LABOR_RATES, packCurrencyISO: 'USD', now, bpartnerId: 119 });
  VoFold.foldVariationOrder(src, BUILDING, [
    { status: 'ADDED', cls: 'IfcWall', disc: 'ARC', storey: 'L1', count: 10, rate: 100, unit: 'EA' },
    { status: 'REMOVED', cls: 'IfcDoor', disc: 'ARC', storey: 'L1', count: 4, rate: 200, unit: 'EA' },
  ], { packCurrencyISO: 'USD', now });
  const srcBim = bimCount(src);
  console.log('§BIM_OVERLAY_ARRANGE folded store bimRows=' + srcBim.total + ' ' + JSON.stringify(srcBim.per));

  // ── the live ERP db (fresh ad_seed.db — what idempiere.html loads) ──
  const dst = new SQL.Database(new Uint8Array(seedBytes));
  const baseProjBefore = scalar(dst, 'SELECT COUNT(*) FROM C_Project WHERE C_Project_ID < ' + BIM_BASE);
  const dstBefore = bimCount(dst);
  ok(dstBefore.total === 0, 'fresh ad_seed.db carries no BIM rows (PK >= BIM_BASE)');

  // ── overlay #1 ──
  const r1 = Overlay.overlayRows(src, dst);
  const after1 = bimCount(dst);
  console.log('§BIM_OVERLAY rows=' + r1.total + ' landed=' + after1.total + ' ' + JSON.stringify(after1.per));
  ok(after1.total === srcBim.total, 'every BIM row in the folded store landed in the live ERP db');

  // the actual documents are now queryable in the standard windows
  const proj = scalar(dst, "SELECT C_Project_ID FROM C_Project WHERE Value='" + BUILDING + "'");
  const projAmt = scalar(dst, "SELECT PlannedAmt FROM C_Project WHERE Value='" + BUILDING + "'");
  const vo = dst.exec("SELECT DocumentNo, GrandTotal, C_Project_ID FROM C_Order WHERE Description LIKE 'BIM VO: " + BUILDING + "%'");
  const voRow = vo.length ? vo[0].values[0] : null;
  const nLines = scalar(dst, "SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=(SELECT C_Order_ID FROM C_Order WHERE Description LIKE 'BIM VO: " + BUILDING + "%')");
  console.log('§BIM_OVERLAY_DOCS project=' + proj + ' plannedAmt=' + projAmt + ' VO=' + (voRow ? voRow[0] + ' total=' + voRow[1] + ' lines=' + nLines + ' proj=' + voRow[2] : '(none)'));
  ok(proj != null && Number(proj) >= BIM_BASE, 'the pushed C_Project is readable in the ERP db (Value=' + BUILDING + ')');
  ok(voRow != null && Number(voRow[2]) === Number(proj), 'the VO C_Order is readable AND links to that project');
  ok(Number(nLines) > 0, 'the VO amendment carries order lines');

  // ── overlay #2: idempotent (re-boot / re-push) ──
  Overlay.overlayRows(src, dst);
  const after2 = bimCount(dst);
  console.log('§BIM_OVERLAY_IDMP after2=' + after2.total + ' (after1=' + after1.total + ')');
  ok(after2.total === after1.total, 're-overlay adds no duplicates (INSERT OR IGNORE on PK)');

  // ── base rows untouched ──
  const baseProjAfter = scalar(dst, 'SELECT COUNT(*) FROM C_Project WHERE C_Project_ID < ' + BIM_BASE);
  console.log('§BIM_OVERLAY_BASE seed C_Project before=' + baseProjBefore + ' after=' + baseProjAfter);
  ok(Number(baseProjAfter) === Number(baseProjBefore), 'base ad_seed.db rows (PK < BIM_BASE) are untouched');

  // ── contract: module ships + idempiere.html wires it ──
  function srcHas(file, tokens) {
    const p = path.join(__dirname, '..', file);
    const s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    return tokens.every(t => { const has = s.indexOf(t) >= 0; if (!has) console.log('  §BIM_OVERLAY_CONTRACT MISSING ' + file + ' :: ' + t); return has; });
  }
  const cMod = srcHas('erp/bim_orders_overlay.js', ['function overlayRows', 'global.BimOrdersOverlay', 'bim_project_orders.db']);
  const cHtml = srcHas('erp/idempiere.html', ['bim_orders_overlay.js', 'BimOrdersOverlay']);
  ok(cMod, 'bim_orders_overlay.js dual-exports BimOrdersOverlay');
  ok(cHtml, 'idempiere.html loads bim_orders_overlay.js + calls it at boot');
  console.log('§BIM_OVERLAY_CONTRACT ' + (cMod && cHtml ? 'PASS' : 'FAIL') + ' — module=' + cMod + ' idempiere.html=' + cHtml);

  src.close(); dst.close();
  const allOk = fail === 0;
  console.log('§BIM_OVERLAY ' + (allOk ? 'PASS' : 'FAIL') + ' — folded projects+VOs surface in the ERP db; pass=' + pass + ' fail=' + fail);
  process.exit(allOk ? 0 : 1);
})();
