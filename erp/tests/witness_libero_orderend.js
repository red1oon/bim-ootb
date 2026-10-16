#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-ORDEREND (spec prompts/mfg/LIBERO_ORDER_END_SLICE7_SPEC.md). READ THE LOG after every run: verdict = §LEND-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: a manufacturing order can be VOIDED, RE-ACTIVATED and CLOSED the way MPPOrder does it: quantities, reservations, activities and descriptions follow the Java; a delivered order refuses void and re-activate by name; nothing half-written.
//   Every number is hand-computed from the Java (comments show the arithmetic). Breaks (MUST exit 1): LEND_BREAK=novoidnode|noguard|novariance|noactivities
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LEND_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §LEND ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} }); });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js')), DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); ['model_ctor', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} });
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
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, modelval: MV, callout: AC, process: AP, postTokens: {}, docAction: ML, docFsm: require(path.join(ERP, 'ad_docfsm.js')), form: require(path.join(ERP, 'ad_form_generic.js')), docClass: DP, import: function (u) { return import(u); } };
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
  log('§LEND-FIXTURE Standard Costing prerequisite: product categories of ' + [FG, KG, BAG].join(',') + ' set to costing method S (GardenWorld ships Average PO, Libero refuses non-Standard); standard material prices KG=2.5 BAG=0.4 FG=9; on-hand KG=10000 BAG=500');
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

  // break flips (the module instance is shared with the running bundle)
  var COSTMOD = await import(LCpath);
  if (BREAK === 'perschema') COSTMOD.SOURCE.detailsPerSchema = true; if (BREAK === 'perrow') COSTMOD.SOURCE.perRow = false; if (BREAK === 'scrapdiv') COSTMOD.SOURCE.scrapDivide = true;
  var DATE = TODAY + ' 00:00:00';
  function fixtureStock(kgRows, bag) {
    db.run("DELETE FROM m_storageonhand WHERE m_product_id IN (" + [FG, KG, BAG].join(',') + ")");
    kgRows.forEach(function (r, i) { db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y'," + LOC + "," + KG + "," + r.asi + "," + r.qty + ",'" + r.date + "','fixk" + i + "')"); });
    db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y'," + LOC + "," + BAG + ",0," + bag + ",'2026-01-01 00:00:00','fixb')");
  }
  [9001, 9002].forEach(function (a) { try { db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id) VALUES (" + a + ",11,0,'Y',0)"); } catch (e) {} });
  var T = { eventSeq: true };
  function runProcess(orderId, p, applyAnyway) {
    var e = Object.assign(env(), T), r;
    mute(); r = ML.run(q, e, { table: 'pp_order', timing: 'PROCESS', fn: function (trx) { lib.backflush(trx, orderId, p); return { ok: true }; } }); unmute();
    if (r.ok) apply(r.ops); else if (applyAnyway) apply(r.trx.groupOps());
    return r;
  }
  function newCompletedOrder(docno) { mute(); var A = mkOrder(docno); var ok = A.o && doAction('pp_order', A.o.pp_order_id, 'CO').ok; unmute(); return ok ? one('SELECT * FROM pp_order WHERE pp_order_id=?', [A.o.pp_order_id]) : null; }
  var nCC = function (oid) { return S(one('SELECT COUNT(*) AS n FROM pp_cost_collector WHERE pp_order_id=?', [oid]).n); };
  var ccs = function (oid) { return q('SELECT pp_cost_collector_id AS id, costcollectortype AS t, movementqty AS qty, scrappedqty AS sc, docstatus AS st, m_attributesetinstance_id AS asi FROM pp_cost_collector WHERE pp_order_id=? ORDER BY pp_cost_collector_id', [oid]); };
  stdOn(true);


  var COSTMOD = await import(LCpath); var DATE = TODAY + ' 00:00:00';
  if (BREAK === 'perschema') COSTMOD.SOURCE.detailsPerSchema = true; if (BREAK === 'perrow') COSTMOD.SOURCE.perRow = false; if (BREAK === 'scrapdiv') COSTMOD.SOURCE.scrapDivide = true;
  var DATE = TODAY + ' 00:00:00';
  function fixtureStock(kgRows, bag) {
    db.run("DELETE FROM m_storageonhand WHERE m_product_id IN (" + [FG, KG, BAG].join(',') + ")");
    kgRows.forEach(function (r, i) { db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y'," + LOC + "," + KG + "," + r.asi + "," + r.qty + ",'" + r.date + "','fixk" + i + "')"); });
    db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y'," + LOC + "," + BAG + ",0," + bag + ",'2026-01-01 00:00:00','fixb')");
  }
  [9001, 9002].forEach(function (a) { try { db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id) VALUES (" + a + ",11,0,'Y',0)"); } catch (e) {} });
  var T = { eventSeq: true };
  function runProcess(orderId, p, applyAnyway) {
    var e = Object.assign(env(), T), r;
    mute(); r = ML.run(q, e, { table: 'pp_order', timing: 'PROCESS', fn: function (trx) { lib.backflush(trx, orderId, p); return { ok: true }; } }); unmute();
    if (r.ok) apply(r.ops); else if (applyAnyway) apply(r.trx.groupOps());
    return r;
  }
  function newCompletedOrder(docno) { mute(); var A = mkOrder(docno); var ok = A.o && doAction('pp_order', A.o.pp_order_id, 'CO').ok; unmute(); return ok ? one('SELECT * FROM pp_order WHERE pp_order_id=?', [A.o.pp_order_id]) : null; }
  var nCC = function (oid) { return S(one('SELECT COUNT(*) AS n FROM pp_cost_collector WHERE pp_order_id=?', [oid]).n); };
  var ccs = function (oid) { return q('SELECT pp_cost_collector_id AS id, costcollectortype AS t, movementqty AS qty, scrappedqty AS sc, docstatus AS st, m_attributesetinstance_id AS asi FROM pp_cost_collector WHERE pp_order_id=? ORDER BY pp_cost_collector_id', [oid]); };
  stdOn(true);


  var FSM = require(path.join(ERP, 'ad_docfsm.js')), PPMOD = await import('file://' + path.join(ERP, 'plugins', 'libero_pporder.mjs'));
  if (BREAK === 'novoidnode') PPMOD.SOURCE.voidNodes = false; if (BREAK === 'noguard') PPMOD.SOURCE.voidGuard = false; if (BREAK === 'novariance') PPMOD.SOURCE.closeVariances = false; if (BREAK === 'noactivities') PPMOD.SOURCE.closeActivities = false;
  stdOn(true);
  function act(orderId, action, noWf) { mute(); var e = Object.assign(env(), T, { noWorkflow: !!noWf }), r = ML.run(q, e, { table: 'pp_order', timing: 'DOCACTION', id: orderId, action: action }); unmute(); if (r.ok) apply(r.ops); else if (process.env.LEND_DEBUG) log((r.log || []).filter(function (l) { return /MODEL-ERR|PROC-EXC|LIBERO-COMPLETE-REFUSED/.test(l); }).join('\n').slice(0, 1500)); return r; }
  var resv = function (p) { return S(one("SELECT COALESCE(SUM(qty),0) AS s FROM m_storagereservation WHERE m_product_id=? AND m_warehouse_id=? AND issotrx='N'", [p, WH]).s); };
  var oneO = function (id) { return one('SELECT * FROM pp_order WHERE pp_order_id=?', [id]); };

  // ── E1 VOID an order that is Prepared (IP) and holds reservations ─────────────────────────────────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var fg0 = resv(FG), kg0 = resv(KG), bag0 = resv(BAG);
  mute(); var A = mkOrder('LE-A'); unmute(); var oidA = A.o.pp_order_id, rP = act(oidA, 'PR');
  var lines0 = bomLines(oidA), nodeA0 = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [oidA]);
  log('§LEND-E0 prepared: ok=' + rP.ok + ' status=' + oneO(oidA).docstatus + ' qtyreserved=' + oneO(oidA).qtyreserved + ' reservations FG/KG/BAG +' + (resv(FG) - fg0) + '/' + (resv(KG) - kg0) + '/' + (resv(BAG) - bag0));
  check('E0 Prepare (IP) reserves the finished product 100 in storage and books QtyReserved on the lines KG 7070.71, BAG 100 (the line reservation touch of the storage rows is a named deferral of slice 1)', rP.ok && oneO(oidA).docstatus === 'IP' && close(resv(FG) - fg0, 100) && close(S(lines0[0].qtyreserved), 7070.71) && close(S(lines0[1].qtyreserved), 100), { ok: rP.ok, st: oneO(oidA).docstatus, l: lines0.map(function (l) { return l.qtyreserved; }) });
  var rV = act(oidA, 'VO'), oV = oneO(oidA), lV = bomLines(oidA), nV = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [oidA]);
  log('§LEND-E1 void ok=' + rV.ok + ' msg=' + (rV.msg || '') + ' order=' + JSON.stringify({ st: oV.docstatus, da: oV.docaction, qo: oV.qtyordered, qe: oV.qtyentered, qr: oV.qtyreserved, desc: oV.description }) + ' lines=' + JSON.stringify(lV.map(function (l) { return [l.qtyrequiered, l.qtyreserved, l.description]; })) + ' node=' + JSON.stringify([nV.docstatus, nV.qtyrequiered, nV.durationrequiered, nV.description]));
  check('E1a Void: order Voided (VO), DocAction --, QtyOrdered 0, QtyEntered 0, QtyReserved 0, description "** Voided Ordered Quantity : (100)"', rV.ok && oV.docstatus === 'VO' && oV.docaction === '--' && S(oV.qtyordered) === 0 && S(oV.qtyentered) === 0 && S(oV.qtyreserved) === 0 && /\*\* Voided Ordered Quantity : \(100\)/.test(String(oV.description)), { ok: rV.ok, msg: rV.msg, oV: oV });
  check('E1b Void: both BOM lines QtyRequired 0 and QtyReserved 0 with "** Voided QtyRequired : (7070.71)" and "(100)"', lV.length === 2 && lV.every(function (l) { return S(l.qtyrequiered) === 0 && S(l.qtyreserved) === 0; }) && /\*\* Voided QtyRequired : \(7070\.71\)/.test(String(lV[0].description)) && /\*\* Voided QtyRequired : \(100\)/.test(String(lV[1].description)), lV.map(function (l) { return [l.qtyrequiered, l.qtyreserved, l.description]; }));
  check('E1c Void: the routing activity is Voided (VO), QtyRequired 0, DurationRequired 0 and the note is "** Voided (100)" twice (voidActivities + node.voidIt both add it)', nV.docstatus === 'VO' && S(nV.qtyrequiered) === 0 && S(nV.durationrequiered) === 0 && String(nV.description) === '** Voided (100) | ** Voided (100)', nV);
  check('E1d Void gives the stock reservations back: finished product, KG and BAG reservations return to the starting values (' + fg0 + ', ' + kg0 + ', ' + bag0 + ')', close(resv(FG), fg0) && close(resv(KG), kg0) && close(resv(BAG), bag0), { fg: resv(FG), kg: resv(KG), bag: resv(BAG) });
  var mrpS = one("SELECT qty FROM pp_mrp WHERE pp_order_id=? AND typemrp='S' AND ordertype='MOP'", [oidA]);
  check('E1e Void: the MRP supply row follows (Ordered - Delivered = 0)', mrpS && S(mrpS.qty) === 0, mrpS);
  check('E1f the document-action state machine knows the arms: Void from Draft/In Progress -> VO, Re-activate -> IP, Reverse-Correct allowed', FSM.transitionFor(53027, 'VO', 'DR') === 'VO' && FSM.transitionFor(53027, 'VO', 'IP') === 'VO' && FSM.transitionFor(53027, 'RE', 'CO') === 'IP' && FSM.transitionFor(53027, 'RC', 'CO') === 'RE' && FSM.transitionFor(53027, 'RA', 'CO') === null, FSM.DOC_FAMILY[53027]);

  // ── E2 a DELIVERED order refuses Void and Re-activate by name, nothing changes ──────────────────────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OB = newCompletedOrder('LE-B'), rb = runProcess(OB.pp_order_id, { rule: 'BackFlush', movementDate: DATE }), before = JSON.stringify(oneO(OB.pp_order_id)), nB = nCC(OB.pp_order_id);
  var rV2 = act(OB.pp_order_id, 'VO', true), rR2 = act(OB.pp_order_id, 'RE', true);
  check('E2a a delivered order cannot be voided: "Cannot void this document because exist transactions", order untouched', rb.ok && !rV2.ok && /Cannot void this document because exist transactions/.test(String(rV2.msg)) && JSON.stringify(oneO(OB.pp_order_id)) === before && nCC(OB.pp_order_id) === nB, { ok: rV2.ok, msg: rV2.msg });
  check('E2b a delivered order cannot be re-activated: "Cannot re activate this document because exist transactions"', !rR2.ok && /Cannot re activate this document because exist transactions/.test(String(rR2.msg)) && JSON.stringify(oneO(OB.pp_order_id)) === before, { ok: rR2.ok, msg: rR2.msg });

  // ── E3 RE-ACTIVATE a Completed order with no delivery: back to In Progress, then Complete works again ───────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OC = newCompletedOrder('LE-C'), rRe = act(OC.pp_order_id, 'RE', true), oRe = oneO(OC.pp_order_id);
  check('E3a Re-activate: DocStatus IP, DocAction CO, Processed N (MPPOrder.reActivateIt :864-875)', rRe.ok && oRe.docstatus === 'IP' && oRe.docaction === 'CO' && oRe.processed !== 'Y', { ok: rRe.ok, msg: rRe.msg, o: oRe });
  var rCo = act(OC.pp_order_id, 'CO', true);
  check('E3b the re-activated order completes again (CO)', rCo.ok && oneO(OC.pp_order_id).docstatus === 'CO', { ok: rCo.ok, msg: rCo.msg });
  // E4 events: the void fires BEFORE_VOID, then the line/node/order saves, then AFTER_VOID
  var ev4 = ML.eventSeq(rV.trx);
  check('E4 §EVENT_SEQ of the void: V.BEFORE_VOID first, the order-line saves before the order save, V.AFTER_VOID after the stock steps', ev4.indexOf('V.BEFORE_VOID@pp_order') >= 0 && ev4.indexOf('V.AFTER_VOID@pp_order') > ev4.indexOf('V.BEFORE_VOID@pp_order') && ev4.indexOf('WRITE_UPDATE@pp_order_bomline') > ev4.indexOf('V.BEFORE_VOID@pp_order') && ev4.indexOf('WRITE_UPDATE@pp_order_node') > ev4.indexOf('WRITE_UPDATE@pp_order_bomline'), ev4.slice(0, 40));

  // ── C: CLOSE (MPPOrder.closeIt :792-850) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // FIXTURE (as W-LIBERO-ACTIVITY): resource product 50024 on Standard, Labor 12 / Burden 3 per hour, QtyBatchs 2
  db.run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=50003");
  [[105, 12], [50000, 3]].forEach(function (x) { db.run('UPDATE m_cost SET currentcostprice=? WHERE m_product_id=50024 AND m_costelement_id=? AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0', [x[1], x[0]]); });
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OD = newCompletedOrder('LE-D'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OD.pp_order_id]);
  var rbD = runProcess(OD.pp_order_id, { rule: 'BackFlush', movementDate: DATE }), lD0 = bomLines(OD.pp_order_id);
  log('§LEND-C0 backflush ok=' + rbD.ok + ' KG delivered=' + lD0[0].qtydelivered + ' required=' + lD0[0].qtyrequiered + ' node=' + one('SELECT docstatus FROM pp_order_node WHERE pp_order_id=?', [OD.pp_order_id]).docstatus);
  var rCl = act(OD.pp_order_id, 'CL', true), oCl = oneO(OD.pp_order_id), lCl = bomLines(OD.pp_order_id), nCl = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OD.pp_order_id]);
  var ccs2 = q('SELECT pp_cost_collector_id AS id, costcollectortype AS t, movementqty AS qty, durationreal AS dur, docstatus AS st FROM pp_cost_collector WHERE pp_order_id=? ORDER BY pp_cost_collector_id', [OD.pp_order_id]);
  log('§LEND-C1 close ok=' + rCl.ok + ' msg=' + (rCl.msg || '') + ' order=' + JSON.stringify({ st: oCl.docstatus, da: oCl.docaction, qo: oCl.qtyordered, qd: oCl.qtydelivered, qr: oCl.qtyreserved, desc: oCl.description }) + ' collectors=' + JSON.stringify(ccs2.map(function (c) { return c.t + ':' + c.qty + ':' + c.dur + ':' + c.st; })));
  check('C1 Close: DocStatus CL, DocAction --, QtyOrdered = QtyDelivered = 100, nothing reserved, description "Closed Ordered Quantity : (100)" (@closed@ = AD_Message closed -> MsgText Closed on the pilot)', rCl.ok && oCl.docstatus === 'CL' && oCl.docaction === '--' && close(S(oCl.qtyordered), 100) && close(S(oCl.qtydelivered), 100) && close(S(oCl.qtyreserved), 0, 0.0005) && /Closed Ordered Quantity : \(100\)/.test(String(oCl.description)), { ok: rCl.ok, msg: rCl.msg, o: oCl });
  // hand: KG required 7070.71, delivered 7000 -> QtyOpen 70.71, previous variance 0 -> ONE Usage Variance collector qty 70.71 ; BAG open 0 -> none ; the node has nothing reported -> no usage variance for it
  var uv = ccs2.filter(function (c) { return c.t === '120'; });
  check('C2 createVariances: exactly ONE Usage Variance collector (type 120), qty 70.71 (= 7070.71 required - 7000 delivered), completed; the KG line now shows delivered 7070.71', uv.length === 1 && close(uv[0].qty, 70.71) && uv[0].st === 'CO' && close(S(lCl[0].qtydelivered), 7070.71, 0.0005), { uv: uv, kg: lCl[0].qtydelivered });
  var cdv = q("SELECT amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id=100", [(uv[0] || {}).id])[0];
  // hand: Material price 2.5 x 70.71 = 176.775 (positive: the variance detail is not negated)
  check('C2b the variance cost detail: Material amt +176.775, qty +70.71', cdv && close(cdv.amt, 176.775, 0.0005) && close(cdv.qty, 70.71, 0.0005), cdv);
  // hand: unreported node: setup 0, duration = estimateWorkingTime(3 x ceil(100/200)=1) = 3 s -> auto-reported Activity Control 100 units, then closed
  var ac = ccs2.filter(function (c) { return c.t === '160'; });
  var ad = q("SELECT m_costelement_id AS e, amt FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 AND m_costelement_id IN (105,50000) ORDER BY m_costelement_id", [ac[0] && ac[0].id]);
  // hand: the order saves in the backflush recomputed QtyBatchs = ceil(100/200) = 1 (my fixture value 2 is overwritten by updateQtyBatchs) : total = (0+1+2) x 1 + 0 + 3 = 6 s = 0.0016666666666666668 h ; Labor 12 x = 0.02 ; Burden 3 x = 0.005
  check('C3 closeActivities: the unreported activity is auto-reported (Activity Control 100 units, 3 s) and the node is CLOSED; Labor -0.02, Burden -0.005', ac.length === 1 && close(ac[0].qty, 100) && close(ac[0].dur, 3) && nCl.docstatus === 'CL' && ad.length === 2 && close(ad[0].amt, -0.02, 0.00005) && close(ad[1].amt, -0.005, 0.00005), { ac: ac, node: nCl.docstatus, ad: ad });
  var usvEl = one('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=50004').e, wipEl3 = one('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=50001').e;
  var fuv = q('SELECT account_id AS a, amtacctdr AS dr, amtacctcr AS cr FROM fact_acct WHERE ad_table_id=53035 AND record_id=? ORDER BY fact_acct_id', [(uv[0] || {}).id]);
  log('§LEND-C4 usage variance posting ' + JSON.stringify(fuv.map(function (f) { return [f.a === usvEl ? 'USAGEVAR' : f.a === wipEl3 ? 'WIP' : f.a, f.dr, f.cr]; })));
  // hand: cost = -amt = -176.775 -> HALF_UP currency precision 2 = -176.78 : DR Usage Variance -176.78 / CR WIP -176.78 (negative as the Java computes; GardenWorld allows negative posting)
  check('C4 the Usage Variance posts: DR Usage Variance acct -176.78 / CR Work in Process -176.78', fuv.length === 2 && fuv[0].a === usvEl && close(fuv[0].dr, -176.78) && fuv[1].a === wipEl3 && close(fuv[1].cr, -176.78), fuv);
  var nColl = nCC(OD.pp_order_id), rCl2 = act(OD.pp_order_id, 'CL', true);
  check('C5 closing a Closed order is a no-op returning true (closeIt :796-797): nothing new is written', rCl2.ok && nCC(OD.pp_order_id) === nColl && oneO(OD.pp_order_id).docstatus === 'CL', { ok: rCl2.ok, msg: rCl2.msg });
  // refusal: an order with no delivery cannot be closed
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OE2 = newCompletedOrder('LE-E'), nE = nCC(OE2.pp_order_id), rClE = act(OE2.pp_order_id, 'CL', true);
  check('C6 an order with no delivery cannot be closed: "Cannot close this document because do not exist transactions", nothing written', !rClE.ok && /Cannot close this document because do not exist transactions/.test(String(rClE.msg)) && nCC(OE2.pp_order_id) === nE && oneO(OE2.pp_order_id).docstatus === 'CO', { ok: rClE.ok, msg: rClE.msg });
  var ev6 = ML.eventSeq(rCl.trx);
  check('C7 §EVENT_SEQ of the close: V.BEFORE_CLOSE first; the usage-variance collector completes before the activity collector; V.AFTER_CLOSE last', ev6.indexOf('V.BEFORE_CLOSE@pp_order') >= 0 && ev6.lastIndexOf('V.AFTER_CLOSE@pp_order') > ev6.lastIndexOf('DOC:completeIt@pp_cost_collector') && ev6.indexOf('DOC:completeIt@pp_cost_collector') < ev6.lastIndexOf('DOC:completeIt@pp_cost_collector'), ev6.length);

  COSTMOD.DEFERRED.forEach(function (d) { log('§LIBERO-DEFERRED ' + d); });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§LEND-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LEND-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
