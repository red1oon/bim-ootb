#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-SNAP (Milestone 3; spec ~/Projects/Mfg/MILESTONE_3_SPEC.md). READ THE LOG after every run: verdict = §MFG-SNAP-VERDICT.
// THE ISSUE it proves/disproves: (N1) our BOM explosion equals legacy iDempiere's stored PP_Order_BOM/BOMLine rows; (N2) editing the BOM template afterwards never changes
//   the order's lines; (N3) the order's lines replay from the op log alone (template absent or edited) with an identical hash; (N4) deterministic; (N5) unsupported input
//   is refused by name, writing nothing.  Deliberate breaks (MUST be red, named): MFG_BREAK=live | reexplode.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var K = require(path.join(ERP, 'erp_kernel.js')), M = require(path.join(ERP, 'mfg_snapshot.js'));
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; console.log('  §MFG-SNAP ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }
function norm(v) { if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number') return v; if (/^-?\d+(\.\d+)?$/.test(String(v))) return Number(v); return String(v); }
M.register(K);
// legacy orders in the seed -> the order inputs (DocumentNo, product, qty, template, warehouse); oracle = the legacy snapshot rows stored beside them
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function rows(db, sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }
  var ORDERS = rows(seed, 'SELECT pp_order_id, documentno, m_product_id, qtyordered, pp_product_bom_id, m_warehouse_id FROM pp_order WHERE pp_order_id IN (50000,50001) ORDER BY 1');
  var tmplIds = ORDERS.map(function (o) { return o.pp_product_bom_id; });
  function loadTemplate(db, ids) {   // seed rows -> kernel `items` (type + parent_id + metadata = the row's own columns)
    ids.forEach(function (id) {
      rows(seed, 'SELECT * FROM pp_product_bom WHERE pp_product_bom_id=?', [id]).forEach(function (r) {
        db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOM#' + id, null, 'PP_Product_BOM', JSON.stringify(r)]); });
      rows(seed, 'SELECT * FROM pp_product_bomline WHERE pp_product_bom_id=? ORDER BY line', [id]).forEach(function (r) {
        db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#' + r.pp_product_bomline_id, 'PP_Product_BOM#' + id, 'PP_Product_BOMLine', JSON.stringify(r)]); });
    });
  }
  var q = function (db) { return function (sql, p) { return K.query(db, sql, p); }; };
  function orderIn(o) { return { docno: o.documentno, product: o.m_product_id, qty: o.qtyordered, bomId: o.pp_product_bom_id, warehouseId: o.m_warehouse_id }; }
  function create(db, o, actor) { return K.dispatch(db, { wfmc: M.WFMC, guards: [], query: q(db), actor: actor || 'user:planner', baseTs: 1000 }, { docType: 'PP_Order', action: 'CR', status: 'NEW', order: orderIn(o) }); }
  function scopeHash(db) { return djb(JSON.stringify(K.query(db, 'SELECT * FROM documents ORDER BY id')) + JSON.stringify(K.query(db, 'SELECT * FROM document_lines ORDER BY id'))); }
  function linesOf(db, o) { return M.readOrderLines(q(db), 'PP_Order:' + o.documentno); }
  if (BREAK === 'live') {   // BREAK: the order's lines are explosions of the LIVE template at read time instead of the stored snapshot
    M.readOrderLines = function (qq, uuid) {
      var d = qq('SELECT metadata FROM documents WHERE id=?', [uuid])[0], m = JSON.parse(d.metadata);
      return M.explodeOps(qq, { docno: m.documentno, product: m.m_product_id, qty: m.qtyordered, bomId: m.pp_product_bom_id, warehouseId: m.m_warehouse_id })
        .filter(function (op) { return op.op_type === 'CREATE_LINE'; }).map(function (op) { return { id: op.uuid, line_no: op.line_no, table: op.table, fields: op.fields }; });
    };
  }

  // ── live run ───────────────────────────────────────────────────────────────
  var live = new SQL.Database(); K.initProjection(live); loadTemplate(live, tmplIds);
  var mint0 = K._stats.edgeMintCalls;
  var res = ORDERS.map(function (o) { return create(live, o); });
  console.log('§MFG-SNAP-LOAD break=' + (BREAK || 'none') + ' orders=' + ORDERS.length + ' templates=' + tmplIds.length + ' dispatch=' + res.map(function (r) { return r.ok ? 'ok(' + r.applied + ' ops)' : 'FAIL:' + r.stage + ':' + r.reason; }).join(' '));
  var nTemplLines = rows(seed, 'SELECT COUNT(*) AS c FROM pp_product_bomline WHERE pp_product_bom_id IN (' + tmplIds.join(',') + ')')[0].c;
  if (!ORDERS.length || !nTemplLines || !res.every(function (r) { return r.ok; })) { inconclusive++; console.log('§MFG-SNAP N0 INCONCLUSIVE — empty population or dispatch failed (orders=' + ORDERS.length + ' templateLines=' + nTemplLines + ')'); }

  // N1 ORACLE — field by field against the legacy rows stored in the seed
  var diffs = [], cmpd = 0;
  ORDERS.forEach(function (o) {
    var lh = rows(seed, 'SELECT * FROM pp_order_bom WHERE pp_order_id=?', [o.pp_order_id])[0], ll = rows(seed, 'SELECT * FROM pp_order_bomline WHERE pp_order_id=? ORDER BY line', [o.pp_order_id]);
    var mine = linesOf(live, o), hdr = mine.filter(function (l) { return l.line_no === 0; })[0], body = mine.filter(function (l) { return l.line_no !== 0; });
    M.HDR_COPY.concat(['bomuse']).forEach(function (f) { cmpd++; if (!hdr || norm(hdr.fields[f]) !== norm(lh[f])) diffs.push(o.documentno + ' hdr.' + f + ': ours=' + (hdr && hdr.fields[f]) + ' legacy=' + lh[f]); });
    if (body.length !== ll.length) diffs.push(o.documentno + ' line count ours=' + body.length + ' legacy=' + ll.length);
    ll.forEach(function (L, i) {
      var b = body[i]; if (!b) return;
      M.LINE_COPY.concat(['qtyrequiered', 'qtybatch', 'qtydelivered', 'qtypost', 'qtyreject', 'm_warehouse_id']).forEach(function (f) { cmpd++; if (norm(b.fields[f]) !== norm(L[f])) diffs.push(o.documentno + ' line' + L.line + '.' + f + ': ours=' + b.fields[f] + ' legacy=' + L[f]); });
    });
  });
  console.log('§MFG-SNAP-N1 orders=' + ORDERS.length + ' fields compared=' + cmpd + ' diffs=' + diffs.length + ' (legacy: 5050.50505051 / 100 / 7070.70707071 / 100)');
  if (!cmpd) { inconclusive++; console.log('§MFG-SNAP N1 INCONCLUSIVE — nothing compared'); } else check('N1 explosion == legacy PP_Order_BOM/BOMLine rows (field by field)', diffs.length === 0, { diffs: diffs.slice(0, 8), n: diffs.length });

  // N2 ISOLATION — edit the template three ways; the order's lines must not move
  var before = djb(JSON.stringify(ORDERS.map(function (o) { return linesOf(live, o); }))), tBefore = djb(JSON.stringify(K.query(live, "SELECT * FROM items ORDER BY id")));
  var l10 = K.query(live, "SELECT id, metadata FROM items WHERE id LIKE 'PP_Product_BOMLine#%' AND parent_id='PP_Product_BOM#" + tmplIds[0] + "' ORDER BY id")[0];
  var m10 = JSON.parse(l10.metadata); m10.qtybom = 75; live.run('UPDATE items SET metadata=? WHERE id=?', [JSON.stringify(m10), l10.id]);                       // change a qty
  live.run('INSERT INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#99999', 'PP_Product_BOM#' + tmplIds[0], 'PP_Product_BOMLine',
    JSON.stringify({ line: 30, m_product_id: 1, componenttype: 'CO', qtybom: 5, isqtypercentage: 'N', scrap: 0, c_uom_id: 100, issuemethod: 1 })]);                  // add a line
  live.run("DELETE FROM items WHERE parent_id=? AND id<>? AND id<>'PP_Product_BOMLine#99999'", ['PP_Product_BOM#' + tmplIds[0], l10.id]);                                 // delete the other original line
  var after = djb(JSON.stringify(ORDERS.map(function (o) { return linesOf(live, o); }))), tAfter = djb(JSON.stringify(K.query(live, "SELECT * FROM items ORDER BY id")));
  var liveReader = djb(JSON.stringify(M.explodeOps(q(live), orderIn(ORDERS[0])).filter(function (op) { return op.op_type === 'CREATE_LINE'; }).map(function (op) { return op.fields; })));
  console.log('§MFG-SNAP-N2 templateHash ' + tBefore + '->' + tAfter + ' orderLinesHash ' + before + '->' + after);
  if (tBefore === tAfter) { inconclusive++; console.log('§MFG-SNAP N2 INCONCLUSIVE — the template edit changed nothing'); }
  else check('N2 template edit (qty change + add + delete) leaves the order lines unchanged', before === after, { before: before, after: after });
  // non-vacuity: a reader of the LIVE template would now see something else than the stored snapshot
  var storedNow = djb(JSON.stringify(rowsFromLog(live, ORDERS[0])));
  function rowsFromLog(db, o) { return K.query(db, 'SELECT line_no, metadata FROM document_lines WHERE document_id=? ORDER BY line_no, id', ['PP_Order:' + o.documentno]).filter(function (r) { return r.line_no !== 0; }).map(function (r) { return JSON.parse(r.metadata).fields; }); }
  check('N2b non-vacuous: a live-template reader would now return different lines than the snapshot', liveReader !== storedNow, { liveReader: liveReader, stored: storedNow });

  // N3 REPLAY == LIVE — rebuild from kernel_ops alone into a fresh projection (template absent / template edited); order-scope hash must equal live
  var liveScope = scopeHash(live), outs = {};
  [['absent', false], ['edited', true]].forEach(function (v) {
    var fresh = new SQL.Database();
    if (v[1]) { K.initProjection(fresh); loadTemplate(fresh, tmplIds); fresh.run('UPDATE items SET metadata=? WHERE id=?', [JSON.stringify(m10), l10.id]); }
    var rp;
    if (BREAK === 'reexplode') { K.initProjection(fresh); if (!v[1]) loadTemplate(fresh, tmplIds); fresh.run('UPDATE items SET metadata=? WHERE id=?', [JSON.stringify(m10), l10.id]); ORDERS.forEach(function (o) { create(fresh, o); }); rp = { ops: 'reexploded' }; }   // BREAK: re-run the handler on the edited template
    else rp = K.replay(live, fresh);
    outs[v[0]] = { ops: rp.ops, hash: scopeHash(fresh) };
  });
  var replayMint = K._stats.edgeMintCalls;
  console.log('§MFG-SNAP-N3 live=' + liveScope + ' replay(template absent)=' + outs.absent.hash + ' replay(template edited)=' + outs.edited.hash + ' ops=' + outs.absent.ops + ' edgeMintCalls=' + (replayMint - mint0));
  check('N3 replay-from-log scope hash == live (template absent AND edited)', outs.absent.hash === liveScope && outs.edited.hash === liveScope, { live: liveScope, absent: outs.absent.hash, edited: outs.edited.hash });

  // N4 DETERMINISM — an independent second run gives byte-identical ops; replay never minted identity
  var run2 = new SQL.Database(); K.initProjection(run2); loadTemplate(run2, tmplIds); ORDERS.forEach(function (o) { create(run2, o); });
  var logOf = function (db) { return JSON.stringify(K.query(db, 'SELECT op_uuid, timestamp, op_type, parameters, output_guid FROM kernel_ops ORDER BY id')); };
  var run1 = new SQL.Database(); K.initProjection(run1); loadTemplate(run1, tmplIds); ORDERS.forEach(function (o) { create(run1, o); });
  check('N4 two independent runs -> byte-identical op log', logOf(run1) === logOf(run2) && logOf(run1).length > 100, { len: logOf(run1).length });
  check('N4b creation + replay minted no identity (edgeMintCalls delta 0)', replayMint - mint0 === 0, { delta: replayMint - mint0 });

  // N5 REFUSAL — a percentage line is refused by name and nothing is written
  var ref = new SQL.Database(); K.initProjection(ref); loadTemplate(ref, tmplIds);
  ref.run('INSERT INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#88888', 'PP_Product_BOM#' + tmplIds[0], 'PP_Product_BOMLine', JSON.stringify({ line: 40, qtybom: 10, isqtypercentage: 'Y', scrap: 0 })]);
  var opsBefore = K.query(ref, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c, docsBefore = K.query(ref, 'SELECT COUNT(*) AS c FROM documents')[0].c;
  var rr = create(ref, ORDERS[0]);
  check('N5 percentage line refused by name, nothing written', !rr.ok && /unsupported:isqtypercentage/.test(rr.reason || '') && K.query(ref, 'SELECT COUNT(*) AS c FROM kernel_ops')[0].c === opsBefore && K.query(ref, 'SELECT COUNT(*) AS c FROM documents')[0].c === docsBefore, { ok: rr.ok, stage: rr.stage, reason: rr.reason });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§MFG-SNAP-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MFG-SNAP-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
