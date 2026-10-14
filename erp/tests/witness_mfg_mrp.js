#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-MRP (Milestone 5; spec ~/Projects/Mfg/MILESTONE_5_SPEC.md). READ THE LOG after every run: verdict = §MFG-MRP-VERDICT.
// THE ISSUE it proves/disproves: PP_MRP rows are a pure fold — two runs and a run over a projection rebuilt from the op log alone are byte-identical, no row field is a clock/counter, the fold is read-only,
//   and for the legacy orders the derived rows equal legacy iDempiere's PP_MRP rows on the derivable fields.  Breaks (MUST be red): MFG_BREAK=clock | counter.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var K = require(path.join(ERP, 'erp_kernel.js')), S = require(path.join(ERP, 'mfg_snapshot.js')), R = require(path.join(ERP, 'mfg_mrp.js'));
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; console.log('  §MFG-MRP ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
S.register(K);
var realFold = R.fold, counter = 0;
if (BREAK === 'clock') R.fold = function (q) { return realFold(q).map(function (r) { return Object.assign({}, r, { datesimulation: process.hrtime.bigint().toString() }); }); };   // BREAK: a wall-clock stamp inside the fold
if (BREAK === 'counter') R.fold = function (q) { return realFold(q).map(function (r) { return Object.assign({}, r, { pp_mrp_id: ++counter }); }); };                                // BREAK: a running id counter
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function rows(db, sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }
  var ORDERS = rows(seed, 'SELECT * FROM pp_order WHERE pp_order_id IN (50000,50001) ORDER BY 1');
  var db = new SQL.Database(); K.initProjection(db);
  [50004, 50005].forEach(function (id) {
    rows(seed, 'SELECT * FROM pp_product_bom WHERE pp_product_bom_id=?', [id]).forEach(function (r) { db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOM#' + id, null, 'PP_Product_BOM', JSON.stringify(r)]); });
    rows(seed, 'SELECT * FROM pp_product_bomline WHERE pp_product_bom_id=? ORDER BY line', [id]).forEach(function (r) { db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#' + r.pp_product_bomline_id, 'PP_Product_BOM#' + id, 'PP_Product_BOMLine', JSON.stringify(r)]); });
  });
  var q = function (d) { return function (sql, p) { return K.query(d, sql, p); }; };
  function create(d, o, qty) {
    return K.dispatch(d, { wfmc: S.WFMC, guards: [], query: q(d), actor: 'user:planner', baseTs: 1000 }, { docType: 'PP_Order', action: 'CR', status: 'NEW', order: { docno: o.documentno, product: o.m_product_id, qty: qty || o.qtyordered,
      bomId: o.pp_product_bom_id, warehouseId: o.m_warehouse_id, asOf: o.datestartschedule, attrs: { dateordered: o.dateordered, datepromised: o.datepromised, datestartschedule: o.datestartschedule,
        datefinishschedule: o.datefinishschedule, s_resource_id: o.s_resource_id, ad_org_id: o.ad_org_id, ad_client_id: o.ad_client_id } } });
  }
  var res = ORDERS.map(function (o) { return create(db, o); });
  var a = R.fold(q(db)), b = R.fold(q(db));
  console.log('§MFG-MRP-LOAD break=' + (BREAK || 'none') + ' orders=' + ORDERS.length + ' dispatch=' + res.map(function (r) { return r.ok; }).join(',') + ' rows=' + a.length);
  if (!ORDERS.length || !a.length || !res.every(function (r) { return r.ok; })) { inconclusive++; console.log('§MFG-MRP R0 INCONCLUSIVE — empty population (orders=' + ORDERS.length + ' rows=' + a.length + ')'); }

  // R1 ORACLE vs the seed's legacy PP_MRP rows (derivable fields only; excluded fields are listed, not hidden)
  var legacy = rows(seed, "SELECT m.*, l.line AS bomline_no, o.documentno AS dn FROM pp_mrp m JOIN pp_order o ON o.pp_order_id=m.pp_order_id LEFT JOIN pp_order_bomline l ON l.pp_order_bomline_id=m.pp_order_bomline_id WHERE m.pp_order_id IN (50000,50001) ORDER BY m.pp_mrp_id");
  var F = ['typemrp', 'ordertype', 'docstatus', 'name', 'm_product_id', 'qty', 'datepromised', 'datestartschedule', 'datefinishschedule', 'dateordered', 's_resource_id', 'ad_org_id', 'ad_client_id', 'm_warehouse_id'];
  function norm(v) { if (v === null || v === undefined || v === '') return ''; if (/^-?\d+(\.\d+)?$/.test(String(v))) return Number(v); return String(v); }
  var diffs = [], cmp = 0, matched = 0;
  legacy.forEach(function (L) {
    var key = 'PP_MRP:' + L.dn + (L.typemrp === 'S' ? ':S' : ':D:' + L.bomline_no), mine = a.filter(function (r) { return r.id === key; })[0];
    if (!mine) { diffs.push(key + ' missing'); return; } matched++;
    F.forEach(function (f) { cmp++; if (norm(mine[f]) !== norm(L[f])) diffs.push(key + '.' + f + ': ours=' + mine[f] + ' legacy=' + L[f]); });
  });
  if (a.length !== legacy.length) diffs.push('row count ours=' + a.length + ' legacy=' + legacy.length);
  console.log('§MFG-MRP-R1 legacy rows=' + legacy.length + ' matched=' + matched + ' fields compared=' + cmp + ' diffs=' + diffs.length + ' | EXCLUDED (not derivable): pp_mrp_id, value (minted), datesimulation/created/updated (wall clock), isavailable (unevidenced)');
  if (!cmp) { inconclusive++; console.log('§MFG-MRP R1 INCONCLUSIVE — nothing compared'); } else check('R1 derived rows == legacy PP_MRP rows (derivable fields)', diffs.length === 0, { diffs: diffs.slice(0, 8), n: diffs.length });
  console.log('§MFG-MRP-AMBIGUOUS supply.datefinishschedule=orders.datestartschedule is the only value legacy shows, but both legacy orders share one date pair (' + ORDERS[0].datestartschedule + ' / ' + ORDERS[0].datefinishschedule + '): a rule such as "finish - 1 day" fits equally; NOT proven');

  // R2 two runs + replay
  var fresh = new SQL.Database(); K.replay(db, fresh);
  var c = R.fold(q(fresh)), ha = R.hash(a), hb = R.hash(b), hc = R.hash(c);
  console.log('§MFG-MRP-R2 run1=' + ha + ' run2=' + hb + ' replay=' + hc + ' rows=' + a.length + '/' + b.length + '/' + c.length);
  check('R2 run1 == run2 == fold over the projection rebuilt from the op log alone', ha === hb && hb === hc, { run1: ha, run2: hb, replay: hc });

  // R3 no clock/counter/minted field in any row
  var FORBID = ['pp_mrp_id', 'value', 'datesimulation', 'created', 'updated', 'isavailable'], bad = [];
  a.forEach(function (r) { FORBID.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(r, f)) bad.push(r.id + '.' + f); }); });
  check('R3 no minted / wall-clock / unevidenced column in any derived row', bad.length === 0, { bad: bad.slice(0, 6), n: bad.length });

  // R4 non-vacuity: the hash really depends on the state
  var o3 = Object.assign({}, ORDERS[0], { documentno: '8002' }); create(db, o3, 250);
  var h4 = R.hash(R.fold(q(db))), rows4 = R.fold(q(db)).length;
  check('R4 non-vacuous: a third order (qty 250) changes the rows (' + a.length + ' -> ' + rows4 + ') and the hash', h4 !== ha && rows4 === a.length + 3, { before: ha, after: h4, rows: rows4 });

  // R5 read-only
  var p0 = K.projectionHash(db); R.fold(q(db)); var p1 = K.projectionHash(db), n0 = K.query(db, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c; R.fold(q(db));
  check('R5 the fold is read-only: projection hash and op count unchanged', p0 === p1 && n0 === K.query(db, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c, { p0: p0, p1: p1 });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§MFG-MRP-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MFG-MRP-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
