#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-COST (spec prompts/mfg/LIBERO_COST_SLICE3_SPEC.md). READ THE LOG after every run: verdict = §LCOST-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: with the Libero bundle ACTIVE, a completed manufacturing order can be worked by Cost Collectors: Component Issues take stock OUT and book BOM-line deliveries + a Standard cost detail per element; Material Receipts
//   bring finished goods IN (a new ASI per receipt) and book the order delivery + the finished-goods cost carried from the issues (calculateFG); a price change between order completion and the issue produces a RATE VARIANCE collector;
//   refusals are the Java's. There are NO legacy rows to diff (reference Postgres holds 0 collectors / 0 order costs), so EVERY expected number below is computed by hand from the Java formulas (comments show the arithmetic), never from the code under test.
//   FIXTURE rows are labelled: Standard Costing is a Libero SETUP PREREQUISITE (GardenWorld ships Average PO), the standard prices and the on-hand are test setup.  Breaks (MUST exit 1): LCOST_BREAK=nostd|calcfg|noreserve|onhand (onhand = the pshepetko orderStock variant: the witness must see ordered qty land ON HAND)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LCOST_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §LCOST ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} }); });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js')), DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); ['model_ctor', 'model_order', 'model_invoice'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} });
  globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var uu = 0, clock = Date.parse('2026-10-15T09:00:00Z'); var TODAY = '2026-10-15';
  function env() { clock += 1000; return { client: 11, org: 50006, user: 100, role: 102, date: TODAY + ' 00:00:00', now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var cols = {}, nextId = {}, dropped = [];
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) nextId[t] = Math.max(Number(q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0].m || 0), 9000000); return ++nextId[t]; }
  function apply(ops) {
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) { dropped.push(t + '.' + k); delete f[k]; } });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  var mute = function () { console.log = function () {}; }, unmute = function () { console.log = log; };
  var hostDb = { query: q, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, modelval: MV, callout: AC, process: AP, postTokens: {}, docAction: ML, docClass: DP, import: function (u) { return import(u); } };
  var CH = BREAK ? null : null, LCpath = 'file://' + path.join(ERP, 'plugins', 'libero_cost.mjs'), PPpath = 'file://' + path.join(ERP, 'plugins', 'libero_pporder.mjs');
  var reg = PR.create(host); mute(); await reg.installBundle('file://' + path.join(ERP, 'plugins', 'libero_manufacturing.mjs')); await reg.startBundle('org.idempiere.mfg'); await reg.need({ table: 'pp_cost_collector' }); unmute();
  if (BREAK === 'calcfg') (await import(LCpath)).SOURCE.calculateFG = false; if (BREAK === 'noreserve') (await import(PPpath)).SOURCE.orderStock = 'none'; if (BREAK === 'onhand') (await import(PPpath)).SOURCE.orderStock = 'onhand';
  var lib = (await import(LCpath)).create({ docAction: ML });
  function runSave(table, fields) { var trx = new ML.Trx(q, env()); var r = ML.run(q, env(), { table: table, timing: 'SAVE', changes: ML.newPO(trx, table, fields) }); if (r.ok) apply(r.ops); return r; }
  function doAction(table, id, action) { var r = ML.run(q, env(), { table: table, timing: 'DOCACTION', id: id, action: action }); if (r.ok) apply(r.ops); if (process.env.LCOST_DEBUG && table === 'pp_cost_collector') log((r.log || []).filter(function (l) { return /LIBERO/.test(l); }).join('\n') + '\n§DBG ' + action + ' ' + id + ' ops=' + JSON.stringify(r.ops.filter(function (o) { return /m_transaction|m_storageonhand/.test(o.table); }).map(function (o) { return [o.op_type, o.table, o.fields && o.fields.m_attributesetinstance_id, o.fields && o.fields.qtyonhand, o.changes && Object.keys(o.changes)]; }))); return r; }
  var one = function (sql, p) { return q(sql, p || [])[0] || null; }, S = function (v) { return Number(v); };
  var close = function (a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps || 0.0001); };
  // ── FIXTURES (labelled) ────────────────────────────────────────────────────────────────────────────────────────────
  var FG = 50007, KG = 50008, BAG = 50014, BOM = 50005, WH = 50002, LOC = 50001, DT_MCC = 50013;
  log('§LCOST-FIXTURE Standard Costing prerequisite: product categories of ' + [FG, KG, BAG].join(',') + ' set to costing method S (GardenWorld ships Average PO, Libero refuses non-Standard); standard material prices KG=2.5 BAG=0.4 FG=9; on-hand KG=10000 BAG=500');
  var cats = q('SELECT DISTINCT m_product_category_id AS c FROM m_product WHERE m_product_id IN (' + [FG, KG, BAG].join(',') + ')').map(function (r) { return r.c; });
  function stdOn(on) { cats.forEach(function (c) { db.run('UPDATE m_product_category_acct SET costingmethod=? WHERE m_product_category_id=?', [on ? 'S' : null, c]); }); }
  function price(p, v) { db.run('UPDATE m_cost SET currentcostprice=? WHERE m_product_id=? AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0', [v, p]); }
  price(KG, 2.5); price(BAG, 0.4); price(FG, 9);
  db.run("DELETE FROM m_storageonhand WHERE m_product_id IN (" + [FG, KG, BAG].join(',') + ")");
  db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y'," + LOC + "," + KG + ",0,10000,'2026-01-01 00:00:00','fix-kg'), (11,50006,'Y'," + LOC + "," + BAG + ",0,500,'2026-01-01 00:00:00','fix-bag')");
  var onhand = function (p) { return S(one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_product_id=?', [p]).s); };
  var reserved = function (p) { return S(one('SELECT COALESCE(SUM(qty),0) AS s FROM m_storagereservation WHERE m_product_id=? AND m_warehouse_id=? AND issotrx=\'N\'', [p, WH]).s); };
  function mkOrder(docno) {
    var r = runSave('pp_order', { ad_client_id: 11, ad_org_id: 50006, documentno: docno, m_product_id: FG, pp_product_bom_id: BOM, ad_workflow_id: 50017, qtyordered: 100, m_warehouse_id: WH, c_uom_id: 100, s_resource_id: 50000, datestartschedule: '2008-08-16 00:00:00', datefinishschedule: '2008-08-17 00:00:00', datepromised: '2008-08-17 00:00:00', docstatus: 'DR', docaction: 'CO', c_doctypetarget_id: 50002, c_doctype_id: 50002 });
    var o = one("SELECT * FROM pp_order WHERE documentno=?", [docno]);
    if (o) db.run('UPDATE pp_order SET qtyentered=100 WHERE pp_order_id=?', [o.pp_order_id]);   // FIXTURE: CostEngine.calculateFG divides by QtyEntered - QtyDelivered; a UI-created order carries QtyEntered. Set directly: saving it through the model would re-explode (afterSave :459).
    return { r: r, o: o && one('SELECT * FROM pp_order WHERE pp_order_id=?', [o.pp_order_id]) };
  }
  function mkCollector(order, type, extra) {
    var f = lib.collectorFields(new ML.Trx(q, env()), order, Object.assign({ type: type, docTypeId: DT_MCC, locatorId: LOC, movementDate: TODAY + ' 00:00:00', qty: 0, scrap: 0, reject: 0, durationSetup: 0, duration: 0 }, extra));
    f.ad_client_id = 11; return runSave('pp_cost_collector', f);
  }
  var bomLines = function (oid) { return q('SELECT * FROM pp_order_bomline WHERE pp_order_id=? ORDER BY line', [oid]); };

  // ── L0 the order: reservation at creation, then DocAction CO -> PP_Order_Cost snapshot ─────────────────────────────
  var rsv0 = reserved(FG); mute(); var A = mkOrder('LC-A'); unmute();
  var oA = A.o, lines = oA ? bomLines(oA.pp_order_id) : [];
  var kgLine = lines[0], bagLine = lines[1];
  log('§LCOST-L0 order LC-A created: ok=' + A.r.ok + ' err=' + (A.r.error || '') + ' qtyreserved=' + (oA && oA.qtyreserved) + ' FG reservation ' + rsv0 + ' -> ' + reserved(FG) + ' | lines ' + lines.map(function (l) { return l.m_product_id + ':req' + l.qtyrequiered + ':res' + l.qtyreserved; }).join(','));
  // hand arithmetic: orderStock = QtyOrdered 100 - reserved 0 - delivered 0 = 100 (FG stocked); line KG: required 100 x 70 / (1-1%) = 7070.70707071 -> UOM kg precision 2 -> 7070.71 (reserved = required); BAG 100 (Each)
  check('L0 order creation reserves the finished product (orderStock: 100 - 0 - 0 = 100, reservation semantics) and each stocked BOM line (reserved = required: KG 7070.71, BAG 100)', A.r.ok && close(S(oA.qtyreserved), 100) && close(reserved(FG) - rsv0, 100) && close(S(kgLine.qtyreserved), 7070.71) && close(S(bagLine.qtyreserved), 100), { ok: A.r.ok, qr: oA && oA.qtyreserved, res: reserved(FG) - rsv0, k: kgLine && kgLine.qtyreserved });
  var oidA = oA.pp_order_id;
  // refusal R1 BEFORE the order is completed? an Issue needs a completed order; first prove the costing-method refusal on the order (Average PO, no Standard)
  mute(); var coBad = doAction('pp_order', oidA, 'CO'); unmute();
  // hand: PP_Order_Cost does not need the costing method; the order completes. The method check lives in CostEngine at the first transaction.
  check('L1 DocAction CO on the order: prepareIt reserves + completeIt snapshots standard costs; status CO, DocAction CL, approved', coBad.ok && one('SELECT docstatus, docaction, isapproved FROM pp_order WHERE pp_order_id=?', [oidA]).docstatus === 'CO' && one('SELECT docaction FROM pp_order WHERE pp_order_id=?', [oidA]).docaction === 'CL' && one('SELECT isapproved FROM pp_order WHERE pp_order_id=?', [oidA]).isapproved === 'Y', { ok: coBad.ok, msg: coBad.msg, st: one('SELECT docstatus, docaction FROM pp_order WHERE pp_order_id=?', [oidA]) });
  var pocN = S(one('SELECT COUNT(*) AS n FROM pp_order_cost WHERE pp_order_id=?', [oidA]).n);
  var wantPoc = S(one("SELECT COUNT(*) AS n FROM m_cost WHERE ad_client_id=11 AND ad_org_id=0 AND m_attributesetinstance_id=0 AND c_acctschema_id=101 AND m_costtype_id=100 AND m_product_id IN (" + [FG, KG, BAG].join(',') + ",50024)").n);
  var pocKg = one("SELECT currentcostprice AS p FROM pp_order_cost WHERE pp_order_id=? AND m_product_id=? AND m_costelement_id=100", [oidA, KG]);
  log('§LCOST-L1b PP_Order_Cost rows=' + pocN + ' independent count over M_Cost (FG, KG, BAG + the routing resource product 50024)=' + wantPoc + ' KG material std price in the snapshot=' + (pocKg && pocKg.p));
  check('L1b the PP_Order_Cost snapshot holds exactly the M_Cost rows of the finished product, both BOM products and the routing resource product (' + wantPoc + ' rows), KG material price 2.5', pocN === wantPoc && wantPoc > 0 && pocKg && close(pocKg.p, 2.5), { pocN: pocN, wantPoc: wantPoc });

  // ── L2 refusal: costing method (Average PO) ─────────────────────────────────────────────────────────────────────────
  stdOn(false); mute(); var cX = mkCollector(oA, '110', { bomLineId: kgLine.pp_order_bomline_id, productId: kgLine.m_product_id, qty: 1 }); unmute();
  var idX = one("SELECT pp_cost_collector_id FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1").pp_cost_collector_id, ohBefore = onhand(KG), nTrx = S(one('SELECT COUNT(*) AS n FROM m_transaction').n);
  mute(); var rX = doAction('pp_cost_collector', idX, 'CO'); unmute();
  log('§LCOST-L2 Issue with costing method Average PO: ok=' + rX.ok + ' msg="' + String(rX.msg).slice(0, 80) + '" onhand ' + ohBefore + ' -> ' + onhand(KG) + ' transactions ' + nTrx + ' -> ' + S(one('SELECT COUNT(*) AS n FROM m_transaction').n));
  check('L2 an Issue under Average PO costing is REFUSED "Costing method not supported - A" and NOTHING moves (no storage change, no M_Transaction)', !rX.ok && /Costing method not supported - A/.test(String(rX.msg)) && onhand(KG) === ohBefore && S(one('SELECT COUNT(*) AS n FROM m_transaction').n) === nTrx, { ok: rX.ok, msg: rX.msg });
  db.run('DELETE FROM pp_cost_collector WHERE pp_cost_collector_id=?', [idX]);
  stdOn(BREAK !== 'nostd');

  // ── L3 issues ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function issue(order, line, qty) { mute(); var c = mkCollector(order, '110', { bomLineId: line.pp_order_bomline_id, productId: line.m_product_id, qty: qty }); var id = one('SELECT pp_cost_collector_id FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1').pp_cost_collector_id; var r = doAction('pp_cost_collector', id, 'CO'); unmute(); return { c: c, id: id, r: r }; }
  var kgOh0 = onhand(KG), bagOh0 = onhand(BAG);
  var I1 = issue(oA, kgLine, 7070.71), I2 = issue(oA, bagLine, 100);
  log('§LCOST-L3 issues: kg ok=' + I1.r.ok + ' ' + (I1.r.msg || '') + ' | bag ok=' + I2.r.ok + ' ' + (I2.r.msg || ''));
  var d1 = q('SELECT c_acctschema_id AS s, m_costelement_id AS e, amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? ORDER BY m_costdetail_id', [I1.id]);
  var d2 = q('SELECT c_acctschema_id AS s, m_costelement_id AS e, amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? ORDER BY m_costdetail_id', [I2.id]);
  var matKg = d1.filter(function (d) { return d.s === 101 && d.e === 100; })[0], matBag = d2.filter(function (d) { return d.s === 101 && d.e === 100; })[0];
  var nSchemas = S(one("SELECT COUNT(DISTINCT c_acctschema_id) AS n FROM m_costdetail WHERE pp_cost_collector_id=?", [I1.id]).n), nEl = q("SELECT m_costelement_id FROM m_costelement WHERE ad_client_id=11 AND costingmethod='S' AND isactive='Y'").length;
  // hand: KG: price 2.5 x qty -7070.71 = -17676.775 ; BAG: 0.4 x -100 = -40.0 ; one detail per Standard element (5) per schema (2)
  check('L3a Component Issue KG: stock out 7070.71 (on-hand ' + kgOh0 + ' -> ' + onhand(KG) + '), Material cost detail amt = 2.5 x -7070.71 = -17676.775 qty -7070.71, one detail per Standard element x schema', I1.r.ok && close(onhand(KG), kgOh0 - 7070.71, 0.001) && matKg && close(matKg.amt, -17676.775, 0.0005) && close(matKg.qty, -7070.71, 0.0005) && d1.length === nEl * nSchemas, { ok: I1.r.ok, msg: I1.r.msg, d1: d1.length, want: nEl * nSchemas, matKg: matKg });
  check('L3b Component Issue BAG: stock out 100 (' + bagOh0 + ' -> ' + onhand(BAG) + '), Material cost detail amt = 0.4 x -100 = -40', I2.r.ok && close(onhand(BAG), bagOh0 - 100) && matBag && close(matBag.amt, -40, 0.0005), { ok: I2.r.ok, msg: I2.r.msg, matBag: matBag });
  var bl = bomLines(oidA), tr1 = q('SELECT movementtype, movementqty, m_locator_id FROM m_transaction WHERE pp_cost_collector_id=?', [I1.id]);
  check('L3c BOM lines book the delivery and release the reservation: KG delivered 7070.71 reserved 0, BAG delivered 100 reserved 0; the transaction is W- qty -7070.71', close(S(bl[0].qtydelivered), 7070.71) && close(S(bl[0].qtyreserved), 0, 0.0005) && close(S(bl[1].qtydelivered), 100) && close(S(bl[1].qtyreserved), 0, 0.0005) && tr1.length === 1 && tr1[0].movementtype === 'W-' && close(tr1[0].movementqty, -7070.71, 0.0005), { bl: bl.map(function (l) { return [l.qtydelivered, l.qtyreserved]; }), tr1: tr1 });
  var ma1 = q('SELECT m_attributesetinstance_id AS a, movementqty AS q FROM pp_cost_collectorma WHERE pp_cost_collector_id=?', [I1.id]);
  check('L3d the issue allocated from the existing on-hand (FIFO material policy): one PP_Cost_CollectorMA row, ASI 0, qty 7070.71', ma1.length === 1 && S(ma1[0].a) === 0 && close(ma1[0].q, 7070.71, 0.0005), ma1);
  var ccRow = one('SELECT docstatus, processed, docaction, documentno, c_doctype_id FROM pp_cost_collector WHERE pp_cost_collector_id=?', [I1.id]);
  check('L3e the collector is completed: DocStatus CO, Processed Y, DocAction CL, DocType = the target (Manufacturing Cost Collector 50013), a DocumentNo assigned', ccRow.docstatus === 'CO' && ccRow.processed === 'Y' && ccRow.docaction === 'CL' && S(ccRow.c_doctype_id) === DT_MCC && ccRow.documentno, ccRow);
  var rv = S(one("SELECT COUNT(*) AS n FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype='140'", [oidA]).n);
  check('L3f no rate variance: the order\'s standard price equals the actual price (2.5 / 0.4), so no variance collector exists (CostEngine.createRateVariances :541)', rv === 0, { rv: rv });

  // ── L4 receipts (partial, then rest): finished goods IN + calculateFG ───────────────────────────────────────────────
  function receipt(order, qty) { mute(); var c = mkCollector(order, '100', { qty: qty, productId: FG }); var id = one('SELECT pp_cost_collector_id FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1').pp_cost_collector_id; var r = doAction('pp_cost_collector', id, 'CO'); unmute(); return { c: c, id: id, r: r }; }
  var fgOh0 = onhand(FG), R1 = receipt(oA, 40);
  var fd1 = one("SELECT amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id=100", [R1.id]);
  var oA1 = one('SELECT qtydelivered, qtyreserved, datestart, datefinish, datedelivered FROM pp_order WHERE pp_order_id=?', [oidA]);
  // hand (calculateFG): issues' Material details abs = 17676.775 + 40 = 17716.775 ; delivered cost 0 ; remaining 17716.775 ; open = QtyEntered 100 - delivered 0 = 100 ; percentage = 40/100 = 0.4 ; amt = 0.4 x 17716.775 = 7086.71
  check('L4a Receipt 40: finished goods IN (' + fgOh0 + ' -> ' + onhand(FG) + '), FG cost = 40/100 x (17676.775 + 40) = 7086.71 qty +40, order QtyDelivered 40, DateStart set, not finished yet', R1.r.ok && close(onhand(FG) - fgOh0, 40) && fd1 && close(fd1.amt, 7086.71, 0.0005) && close(fd1.qty, 40) && close(S(oA1.qtydelivered), 40) && oA1.datestart && !oA1.datefinish, { ok: R1.r.ok, msg: R1.r.msg, fd1: fd1, oA1: oA1 });
  var asiR1 = q('SELECT m_attributesetinstance_id AS a FROM pp_cost_collectorma WHERE pp_cost_collector_id=?', [R1.id]), trR1 = q('SELECT movementtype, movementqty, m_attributesetinstance_id AS a FROM m_transaction WHERE pp_cost_collector_id=?', [R1.id]);
  check('L4b the receipt creates a NEW ASI (StorageEngine: "always create asi so fifo/lifo work"): ASI > 0 in the MA row, the W+ transaction and the storage row', asiR1.length === 1 && S(asiR1[0].a) > 0 && trR1.length === 1 && trR1[0].movementtype === 'W+' && S(trR1[0].a) === S(asiR1[0].a) && S(one('SELECT qtyonhand AS q FROM m_storageonhand WHERE m_product_id=? AND m_attributesetinstance_id=?', [FG, asiR1[0].a]).q) === 40, { asiR1: asiR1, trR1: trR1 });
  var R2 = receipt(oA, 60), fd2 = one("SELECT amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id=100", [R2.id]);
  var oA2 = one('SELECT qtydelivered, qtyreserved, datefinish FROM pp_order WHERE pp_order_id=?', [oidA]);
  // hand: remaining = 17716.775 - 7086.71 = 10630.065 ; open = 100 - 40 = 60 ; percentage = 60/60 = 1 ; amt = 10630.065 ; total FG cost 7086.71 + 10630.065 = 17716.775 = all issued cost
  check('L4c Receipt 60 (the rest): FG cost = 60/60 x (17716.775 - 7086.71) = 10630.065, so the two receipts carry exactly the issued cost 17716.775; order delivered 100, DateFinish set, reservation released (qtyreserved 0)', R2.r.ok && fd2 && close(fd2.amt, 10630.065, 0.0005) && close(S(fd1.amt) + S(fd2.amt), 17716.775, 0.0005) && close(S(oA2.qtydelivered), 100) && oA2.datefinish && close(S(oA2.qtyreserved), 0, 0.0005) && close(reserved(FG) - rsv0, 0, 0.0005), { ok: R2.r.ok, msg: R2.r.msg, fd2: fd2, oA2: oA2, res: reserved(FG) - rsv0 });
  check('L4d finished goods on hand = 100 in two ASI rows (40 + 60); the supply MRP row follows QtyOrdered - QtyDelivered = 0', close(onhand(FG) - fgOh0, 100) && S(one('SELECT COUNT(*) AS n FROM m_storageonhand WHERE m_product_id=? AND qtyonhand<>0', [FG]).n) === 2 && close(S(one("SELECT qty FROM pp_mrp WHERE pp_order_id=? AND typemrp='S'", [oidA]).qty), 0, 0.0005), { fg: onhand(FG) - fgOh0, mrp: one("SELECT qty FROM pp_mrp WHERE pp_order_id=? AND typemrp='S'", [oidA]) });

  // ── L5 rate variance: the price moves between order completion and the issue ───────────────────────────────────────
  mute(); var B = mkOrder('LC-B'); unmute(); var oidB = B.o.pp_order_id, linesB = bomLines(oidB); mute(); doAction('pp_order', oidB, 'CO'); unmute();
  db.run("UPDATE m_storageonhand SET qtyonhand=qtyonhand+10000 WHERE m_product_id=" + KG + " AND m_attributesetinstance_id=0");   // FIXTURE: enough stock that the issue is ONE transaction (a short stock splits the issue over an extra new-ASI allocation, also faithful)
  db.run('UPDATE pp_order_cost SET currentcostprice=2.0 WHERE pp_order_id=? AND m_product_id=? AND m_costelement_id=100', [oidB, KG]);   // FIXTURE: the order's standard price was 2.0 when it was released; the actual M_Cost price is 2.5 (changing M_Cost directly is undone by the cost history, so the snapshot is what moves)
  var IB = issue(B.o, linesB[0], 7070.71);
  var rvc = q("SELECT pp_cost_collector_id AS id, docstatus FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype='140'", [oidB]);
  var rvd = rvc.length ? q("SELECT amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id=100 ORDER BY m_costdetail_id", [rvc[0].id]) : [];
  var iss = one("SELECT amt FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id=100", [IB.id]);
  // hand: issue detail = actual 2.5 x -7070.71 = -17676.775 ; std amt = 2.0 x -7070.71 = -14141.42 ; they differ -> rate variance collector with two details: (-actual, -qty) = (+17676.775, +7070.71) and (std, qty) = (-14141.42, -7070.71)
  log('§LCOST-L5 rate variance: issue ok=' + IB.r.ok + ' issueAmt=' + (iss && iss.amt) + ' variance collectors=' + rvc.length + ' details=' + JSON.stringify(rvd));
  check('L5 a standard price below the actual price produces ONE completed Rate Variance collector whose Material details are (+17676.775, +7070.71) and (-14141.42, -7070.71); the issue itself costs the actual 2.5 x -7070.71 = -17676.775', IB.r.ok && iss && close(iss.amt, -17676.775, 0.001) && rvc.length === 1 && rvc[0].docstatus === 'CO' && rvd.length === 2 && close(rvd[0].amt, 17676.775, 0.001) && close(rvd[0].qty, 7070.71, 0.001) && close(rvd[1].amt, -14141.42, 0.001) && close(rvd[1].qty, -7070.71, 0.001), { ok: IB.r.ok, msg: IB.r.msg, rvc: rvc, rvd: rvd, iss: iss });
  
  // ── L6 refusals and named deferrals ─────────────────────────────────────────────────────────────────────────────────
  mute(); var Cx = mkOrder('LC-C'); unmute(); var oidC = Cx.o.pp_order_id; db.run('UPDATE pp_order SET qtyentered=NULL WHERE pp_order_id=?', [oidC]); mute(); doAction('pp_order', oidC, 'CO'); unmute();
  var iC = issue(Cx.o, bomLines(oidC)[0], 7070.71), nrec0 = S(one('SELECT COUNT(*) AS n FROM m_transaction').n);
  mute(); var cRec = mkCollector(Cx.o, '100', { qty: 100, productId: FG }); var idRec = one('SELECT pp_cost_collector_id FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1').pp_cost_collector_id; var rRec = doAction('pp_cost_collector', idRec, 'CO'); unmute();
  check('L6a a Receipt on an order with no QtyEntered is refused (CostEngine.calculateFG divides by QtyEntered - QtyDelivered) and moves nothing', iC.r.ok && !rRec.ok && /divide by zero/i.test(String(rRec.msg)) && S(one('SELECT COUNT(*) AS n FROM m_transaction').n) === nrec0, { msg: rRec.msg });
  mute(); var cAct = mkCollector(Cx.o, '160', { nodeId: one('SELECT pp_order_node_id AS n FROM pp_order_node WHERE pp_order_id=?', [oidC]).n, qty: 1, resourceId: 50006 }); var idAct = one('SELECT pp_cost_collector_id FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1').pp_cost_collector_id; var rAct = doAction('pp_cost_collector', idAct, 'CO'); unmute();
  check('L6b an Activity Control collector (ported in slice 6, W-LIBERO-ACTIVITY) is still REFUSED when the resource product is not on Standard costing: "Costing method not supported - A", never silently completed', !rAct.ok && /Costing method not supported/.test(String(rAct.msg)), { ok: rAct.ok, msg: rAct.msg });
  var cmod = lib.models.pp_cost_collector.beforeSave(new ML.Trx(q, env()), { costcollectortype: '110', pp_order_bomline_id: null, m_warehouse_id: WH });
  check('L6c an Issue without a BOM line is refused FillMandatory (MPPCostCollector.beforeSave :726)', /FillMandatory/.test(String(cmod)), cmod);

  // ── L7 stop: behaviour gone, data kept ──────────────────────────────────────────────────────────────────────────────
  var keep = S(one('SELECT COUNT(*) AS n FROM pp_cost_collector').n) + '/' + S(one('SELECT COUNT(*) AS n FROM m_costdetail').n); mute(); await reg.stopBundle('org.idempiere.mfg'); unmute();
  check('L7 stop: the collector model + DocAction classes are gone, the collectors and cost details written while active are KEPT (' + keep + ')', !ML.MODEL.pp_cost_collector && !ML.docActionFor('pp_cost_collector') && (S(one('SELECT COUNT(*) AS n FROM pp_cost_collector').n) + '/' + S(one('SELECT COUNT(*) AS n FROM m_costdetail').n)) === keep, { keep: keep });
  var CORE_DROPS = ['m_cost.processed', 'm_storageonhand.m_warehouse_id'], mine = dropped.filter(function (x) { return CORE_DROPS.indexOf(x) < 0; });
  log('§LCOST-L8 columns dropped at apply: ' + dropped.length + ' of which CORE-owned (model_cost m_cost.processed, model_trade m_storageonhand.m_warehouse_id)=' + (dropped.length - mine.length) + ' , bundle-owned=' + mine.length);
  check('L8 no BUNDLE op carried a column the physical tables lack', mine.length === 0, mine.slice(0, 8));
  (await import(LCpath)).DEFERRED.forEach(function (d) { log('§LIBERO-DEFERRED ' + d); });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§LCOST-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LCOST-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
