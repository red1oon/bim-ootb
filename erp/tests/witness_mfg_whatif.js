#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-WHATIF (Milestone 10; spec ~/Projects/Mfg/MILESTONE_10_SPEC.md). READ THE LOG after every run: verdict = §MFG-WHATIF-VERDICT.
// THE ISSUE it proves/disproves: a what-if order run through MRP in a speculative (BLUE FUTURE) branch and then discarded leaves the OFFICIAL state exactly as it was: projection hash, official op-set hash, official replay and the
//   MRP rows.  It also pins the defect found on the way: ERPKernel.replay used to rebuild branch-tagged speculative ops into the official projection.  Breaks (MUST be red): MFG_BREAK=untagged | leak.
//   Real kernel_ops.js (the table WITH branch_id), real erp_kernel/mfg_snapshot/mfg_mrp, legacy orders 8000/8001 from the seed as the official state.
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
require(path.join(ERP, 'kernel_ops.js'));
var K = require(path.join(ERP, 'erp_kernel.js')), S = require(path.join(ERP, 'mfg_snapshot.js')), R = require(path.join(ERP, 'mfg_mrp.js')), W = require(path.join(ERP, 'mfg_whatif.js')), KO = global.window.KernelOps;
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(name, ok, info) { judged++; if (!ok) fails++; _log('  §MFG-WHATIF ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }
S.register(K);
(async function () {
  var SQL = await initSqlJs();
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function rows(db, sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }
  var ORD = rows(seed, 'SELECT * FROM pp_order WHERE pp_order_id IN (50000,50001) ORDER BY 1');
  var live = new SQL.Database(); mute(); K.initProjection(live);
  [50004, 50005].forEach(function (id) {
    rows(seed, 'SELECT * FROM pp_product_bom WHERE pp_product_bom_id=?', [id]).forEach(function (r) { live.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOM#' + id, null, 'PP_Product_BOM', JSON.stringify(r)]); });
    rows(seed, 'SELECT * FROM pp_product_bomline WHERE pp_product_bom_id=? ORDER BY line', [id]).forEach(function (r) { live.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#' + r.pp_product_bomline_id, 'PP_Product_BOM#' + id, 'PP_Product_BOMLine', JSON.stringify(r)]); });
  });
  var q = function (db) { return function (sql, p) { return K.query(db, sql, p); }; };
  function orderIn(o, docno, qty) { return { docno: docno || o.documentno, product: o.m_product_id, qty: qty || o.qtyordered, bomId: o.pp_product_bom_id, warehouseId: o.m_warehouse_id, asOf: o.datestartschedule,
    attrs: { dateordered: o.dateordered, datepromised: o.datepromised, datestartschedule: o.datestartschedule, datefinishschedule: o.datefinishschedule, s_resource_id: o.s_resource_id, ad_org_id: o.ad_org_id, ad_client_id: o.ad_client_id } }; }
  var res = ORD.map(function (o) { return K.dispatch(live, { wfmc: S.WFMC, guards: [], query: q(live), actor: 'user:planner', baseTs: 1000 }, { docType: 'PP_Order', action: 'CR', status: 'NEW', order: orderIn(o) }); });
  unmute();
  function official(db) { var r = db.exec('SELECT op_uuid, op_type, parameters FROM kernel_ops WHERE branch_id IS NULL AND undone=0 ORDER BY id'); return djb(JSON.stringify(r.length ? r[0].values : [])); }
  function scope(db) { return djb(JSON.stringify(K.query(db, 'SELECT * FROM documents ORDER BY id')) + JSON.stringify(K.query(db, 'SELECT * FROM document_lines ORDER BY id'))); }
  function nlog(db, where) { return K.query(db, 'SELECT COUNT(*) AS c FROM kernel_ops' + (where ? ' WHERE ' + where : ''))[0].c; }
  var pre = { proj: K.projectionHash(live), ops: official(live), mrp: R.hash(R.fold(q(live))), rows: R.fold(q(live)).length, log: nlog(live) };
  console.log('§MFG-WHATIF-LOAD break=' + (BREAK || 'none') + ' official orders=' + ORD.length + ' dispatch=' + res.map(function (r) { return r.ok; }).join(',') + ' pre: projection=' + pre.proj + ' opset=' + pre.ops + ' mrp=' + pre.mrp + ' (' + pre.rows + ' rows) logRows=' + pre.log);
  if (!ORD.length || !res.every(function (r) { return r.ok; }) || !pre.rows) { inconclusive++; _log('§MFG-WHATIF X0 INCONCLUSIVE — empty official state'); }

  // ── the what-if: a hypothetical order of 500 on the same template, MRP'd in a branch ──
  var hypo = orderIn(ORD[0], 'WI-1', 500), BR = 'whatif-1', f, mrpBranch;
  mute();
  if (BREAK === 'untagged') {   // BREAK: the branch order is appended to the LIVE log (no tag, live projection written)
    K.dispatch(live, { wfmc: S.WFMC, guards: [], query: q(live), actor: 'user:whatif', baseTs: 5000 }, { docType: 'PP_Order', action: 'CR', status: 'NEW', order: hypo });
    f = { scratch: live, query: q(live), mrp: function () { return R.fold(q(live)); }, ops: function () { return KO.branchOps(live, BR); }, discard: function () { return KO.discardBranch(live, BR); } };
  } else { f = W.fork(SQL, live, BR); var r = f.create(hypo, 'user:whatif', 5000); if (!r.ok) throw new Error('branch create failed: ' + r.stage + ' ' + r.reason); }
  mrpBranch = f.mrp(); unmute();
  var during = { proj: K.projectionHash(live), ops: official(live), tagged: nlog(live, "branch_id='" + BR + "'"), log: nlog(live) };
  console.log('§MFG-WHATIF-X1 branch MRP rows=' + mrpBranch.length + ' hash=' + R.hash(mrpBranch) + ' vs live ' + pre.rows + ' rows hash=' + pre.mrp);
  check('X1 non-vacuous: the what-if changes the MRP answer (rows ' + pre.rows + ' -> ' + mrpBranch.length + ', hash differs)', mrpBranch.length === pre.rows + 3 && R.hash(mrpBranch) !== pre.mrp, { branchRows: mrpBranch.length, branchHash: R.hash(mrpBranch), live: pre.mrp });
  console.log('§MFG-WHATIF-X2 while the branch exists: projection=' + during.proj + ' opset=' + during.ops + ' taggedOps=' + during.tagged + ' logRows=' + during.log);
  check('X2 live projection hash + official op-set hash unchanged while the branch exists; its ops are in the log, TAGGED', during.proj === pre.proj && during.ops === pre.ops && during.tagged === 4 && during.log === pre.log + 4, { during: during, pre: pre });

  // X4 (before discard): the default official rebuild excludes the tagged op, the blue view includes it
  var rep = function (opts) { var fresh = new SQL.Database(); mute(); K.replay(live, fresh, opts); unmute(); return fresh; };
  var offDocs = K.query(rep(), 'SELECT id FROM documents ORDER BY id').map(function (d) { return d.id; }), blueDocs = K.query(rep({ branch: BR }), 'SELECT id FROM documents ORDER BY id').map(function (d) { return d.id; });
  var leakDocs = BREAK === 'leak' ? blueDocs : offDocs;   // BREAK: the 'official' rebuild includes the tagged op (what the pre-fix replay did; the real pre-fix kernel is the BASELINE run in the spec)
  console.log('§MFG-WHATIF-X4 official replay docs=' + leakDocs.length + ' blue-view docs=' + blueDocs.length + ' (branch order WI-1 in official replay: ' + (leakDocs.indexOf('PP_Order:WI-1') >= 0) + ', in blue view: ' + (blueDocs.indexOf('PP_Order:WI-1') >= 0) + ')');
  check('X4 default replay excludes the branch-tagged op; replay with {branch} includes it', leakDocs.indexOf('PP_Order:WI-1') < 0 && blueDocs.indexOf('PP_Order:WI-1') >= 0 && blueDocs.length === offDocs.length + 1, { official: leakDocs, blue: blueDocs });

  // ── discard ──
  mute(); var d = f.discard(); unmute();
  var post = { proj: K.projectionHash(live), ops: official(live), mrp: R.hash(R.fold(q(live))), alive: f.ops().length, undone: nlog(live, "branch_id='" + BR + "' AND undone=1"), log: nlog(live) };
  var fresh2 = new SQL.Database(); mute(); K.replay(live, fresh2); unmute();
  var replayMrp = R.hash(R.fold(q(fresh2))), replayScope = scope(fresh2);
  console.log('§MFG-WHATIF-X3 after discard: projection=' + post.proj + ' opset=' + post.ops + ' mrp=' + post.mrp + ' branchOpsAlive=' + post.alive + ' undone=' + post.undone + ' logRows=' + post.log + ' | official replay: scope=' + replayScope + ' mrp=' + replayMrp);
  check('X3 after discard: projection hash, official op-set hash and MRP hash equal their pre-branch values', post.proj === pre.proj && post.ops === pre.ops && post.mrp === pre.mrp, { pre: pre, post: post });
  check('X3b the branch is fully folded away (0 alive, 4 undone) and an official rebuild reproduces the live scope + MRP', post.alive === 0 && post.undone === 4 && replayScope === scope(live) && replayMrp === pre.mrp, { post: post, replayScope: replayScope, liveScope: scope(live), replayMrp: replayMrp });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  _log('§MFG-WHATIF-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { unmute(); _log('§MFG-WHATIF-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
