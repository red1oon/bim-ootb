#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-ACTIVITY (spec prompts/mfg/LIBERO_ACTIVITY_SLICE6_SPEC.md). READ THE LOG after every run: verdict = §LACT-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: an Activity Control collector (type 160) books the labour / burden cost of a routing step the way Libero does - duration converted to the resource UOM, cost details per element,
//   the order activity closed when its quantity is done, and the accounting posted - and refuses what it does not port. Every number is hand-computed (see the spec). Breaks (MUST exit 1): LACT_BREAK=nobase|noclose|batchmult|norate (activity rate variance off)|msquirk (the upstream milestone self-close)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LACT_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §LACT ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} }); });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js')), DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); ['model_ctor', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} });
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });   // idempiere.html's order
  AC.RUNTIME.registerSqlFunctions(function (n, fn) { db.create_function(n, fn); });   // crud_overlay.js:364 - the host registers the PL/pgSQL ports (bomPriceStd ...); without it every price lookup errors silently
  globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js')); globalThis.ModelOrder = require(path.join(ERP, 'model_order.js')); globalThis.ModelInvoice = require(path.join(ERP, 'model_invoice.js'));
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
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, modelval: MV, callout: AC, process: AP, postTokens: {}, docAction: ML, form: require(path.join(ERP, 'ad_form_generic.js')), docClass: DP, import: function (u) { return import(u); } };
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
  log('§LACT-FIXTURE Standard Costing prerequisite: product categories of ' + [FG, KG, BAG].join(',') + ' set to costing method S (GardenWorld ships Average PO, Libero refuses non-Standard); standard material prices KG=2.5 BAG=0.4 FG=9; on-hand KG=10000 BAG=500');
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


  var COSTMOD2 = COSTMOD;
  if (BREAK === 'nobase') COSTMOD.SOURCE.routeBase = false; if (BREAK === 'noclose') COSTMOD.SOURCE.closeNode = false; if (BREAK === 'batchmult') COSTMOD.SOURCE.batchMult = false; if (BREAK === 'norate') COSTMOD.SOURCE.activityRate = false; if (BREAK === 'msquirk') COSTMOD.SOURCE.milestoneSelfClose = true;
  // FIXTURE (labelled): the resource product 50024 (UOM Hour) costs Standard; Labor (element 105) 12.00 and Burden (50000) 3.00 per hour; the order carries QtyBatchs = 2
  var RP = 50024; stdOn(true); db.run('UPDATE m_product_category_acct SET costingmethod=\'S\' WHERE m_product_category_id=50003');
  function rprice(el, v) { db.run('UPDATE m_cost SET currentcostprice=? WHERE m_product_id=? AND m_costelement_id=? AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0', [v, RP, el]); }
  rprice(105, 12); rprice(50000, 3);
  log('§LACT-FIXTURE resource product ' + RP + ' category 50003 costing S; Labor(105)=12 Burden(50000)=3 per hour; order QtyBatchs=2');
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OA = newCompletedOrder('LA-A'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OA.pp_order_id]);
  var node = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OA.pp_order_id]);
  log('§LACT-A0 node ' + JSON.stringify({ id: node.pp_order_node_id, name: node.name, res: node.s_resource_id, req: node.qtyrequiered, durreq: node.durationrequiered, st: node.docstatus, ms: node.ismilestone, sub: node.issubcontracting }));
  check('A0 explosion made one Draft activity "Packing Process": resource 50006, QtyRequired 100, DurationRequired 3 (ceil(100/200)=1 cycle x 3)', node && node.docstatus === 'DR' && S(node.s_resource_id) === 50006 && close(S(node.qtyrequiered), 100) && S(node.durationrequiered) === 3, node);
  function activity(order, nodeRow, qty, dur, setup) {
    mute(); var e = Object.assign(env(), T), r = ML.run(q, e, { table: 'pp_order', timing: 'PROCESS', fn: function (trx) {
      var o = trx.get('pp_order', order.pp_order_id), n = trx.get('pp_order_node', nodeRow.pp_order_node_id);
      lib.createCollector(trx, o, { type: '160', docTypeId: DT_MCC, locatorId: LOC, asiId: 0, movementDate: DATE, qty: qty, scrap: 0, reject: 0, bomLineId: 0, nodeId: n.pp_order_node_id, resourceId: n.s_resource_id, productId: FG, durationSetup: setup, duration: dur });
      return { ok: true }; } }); unmute(); if (r.ok) apply(r.ops); return r;
  }
  var r1 = activity(OA, node, 100, 1800, 0);
  var cc1 = one("SELECT * FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype='160'", [OA.pp_order_id]);
  var det = q("SELECT c_acctschema_id AS s, m_costelement_id AS e, amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? ORDER BY m_costdetail_id", [cc1 && cc1.pp_cost_collector_id]);
  var dl = det.filter(function (d) { return S(d.s) === 101 && S(d.e) === 105; })[0], db2 = det.filter(function (d) { return S(d.s) === 101 && S(d.e) === 50000; })[0];
  log('§LACT-A1 activity ok=' + r1.ok + ' msg=' + (r1.msg || '') + ' details(101)=' + JSON.stringify(det.filter(function (d) { return S(d.s) === 101; }).map(function (d) { return d.e + ':' + d.amt + '/' + d.qty; })));
  // hand: total = (0+1+2) x QtyBatchs 2 + 0 + 1800 = 1806 s ; hours = 1806/3600 = 0.5016666666666667 ; Labor 12 x = 6.0200000000000004 -> 6.0200 ; Burden 3 x = 1.5050000000000001 -> 1.5050 ; stored negative
  check('A1 Activity Control collector completes (CO) and writes Labor -6.0200 and Burden -1.5050 per hour-base qty -0.5016666666666667', r1.ok && cc1 && cc1.docstatus === 'CO' && dl && close(dl.amt, -6.02, 0.00005) && close(dl.qty, -0.5016666666666667, 1e-9) && db2 && close(db2.amt, -1.505, 0.00005), { ok: r1.ok, msg: r1.msg, det: det.length });
  var dz = det.filter(function (d) { return S(d.s) === 101 && (S(d.e) === 50001 || S(d.e) === 50002 || S(d.e) === 100); });
  check('A1b only Resource / Overhead / Burden elements get a detail (Labor, Burden, Overhead = 3 rows in schema 101; no Material, no Outside Processing)', det.filter(function (d) { return S(d.s) === 101; }).length === 3 && dz.length === 1 && S(dz[0].e) === 50001 && close(dz[0].amt, 0), det);
  var n1 = one('SELECT * FROM pp_order_node WHERE pp_order_node_id=?', [node.pp_order_node_id]);
  log('§LACT-A2 node ' + JSON.stringify({ st: n1.docstatus, act: n1.docaction, qd: n1.qtydelivered, dr: n1.durationreal, drq: n1.durationrequiered, qr: n1.qtyrequiered, ds: n1.datestart, df: n1.datefinish, desc: n1.description }));
  // hand: QtyDelivered 0+100 >= QtyRequired 100 -> closeIt ; DurationReal 0+1800 ; DurationRequired 3 != 1800 -> becomes 1800 and the description records the old value ; DateStart = 00:00:00 - 1800 s ; DateFinish = max MovementDate
  check('A2 node closed (CL, DocAction --), QtyDelivered 100, DurationReal 1800 and DurationRequired 3 -> 1800 with the description "closed ( Duration :3) ( QtyRequired :100)"', n1.docstatus === 'CL' && n1.docaction === '--' && close(S(n1.qtydelivered), 100) && S(n1.durationreal) === 1800 && S(n1.durationrequiered) === 1800 && /closed \( Duration :3\) \( QtyRequired :100/.test(String(n1.description)), n1);
  check('A2b node DateStart = movement date minus 1800 s (' + DATE.slice(0, 10) + ' -> 2026-10-14 23:30:00) and DateFinish = the movement date', String(n1.datestart).slice(0, 19) === '2026-10-14 23:30:00' && String(n1.datefinish).slice(0, 10) === DATE.slice(0, 10), { ds: n1.datestart, df: n1.datefinish });
  // posting (schema 101; GardenWorld allows negative posting so the lines keep the detail's sign)
  var wipEl2 = one('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=50001').e, labEl = one('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=50007').e, burEl = one('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=50008').e;
  var fa1 = q('SELECT account_id AS a, amtacctdr AS dr, amtacctcr AS cr FROM fact_acct WHERE ad_table_id=53035 AND record_id=? ORDER BY fact_acct_id', [cc1.pp_cost_collector_id]);
  log('§LACT-A3 posted=' + one('SELECT posted FROM pp_cost_collector WHERE pp_cost_collector_id=?', [cc1.pp_cost_collector_id]).posted + ' facts=' + JSON.stringify(fa1.map(function (f) { return [f.a === wipEl2 ? 'WIP' : f.a === labEl ? 'LABOR' : f.a === burEl ? 'BURDEN' : f.a, f.dr, f.cr]; })));
  // hand: Labor line: DR WIP -6.02 / CR Labor -6.02 ; Burden: 1.5050 -> HALF_UP 2 decimals 1.51 : DR WIP -1.51 / CR Burden -1.51 (the Java passes the negative detail amount un-negated)
  check('A3 posted Y: Labor DR WIP -6.02 / CR Labor acct -6.02 and Burden DR WIP -1.51 / CR Burden acct -1.51 (negative as Doc_PPCostCollector computes, currency precision 2 HALF_UP)', fa1.length === 4 && fa1[0].a === wipEl2 && close(fa1[0].dr, -6.02) && fa1[1].a === labEl && close(fa1[1].cr, -6.02) && fa1[2].a === wipEl2 && close(fa1[2].dr, -1.51) && fa1[3].a === burEl && close(fa1[3].cr, -1.51), fa1);
  // the finished goods carry the activity: Backflush after it (issues 17540) -> receipt cost = (17540 + FIRST activity detail |6.02|) x 100/100
  var rb = runProcess(OA.pp_order_id, { rule: 'BackFlush', movementDate: DATE }), rcpt = q("SELECT d.amt AS amt FROM m_costdetail d JOIN pp_cost_collector c ON c.pp_cost_collector_id=d.pp_cost_collector_id WHERE c.pp_order_id=? AND c.costcollectortype='100' AND d.c_acctschema_id=101 AND d.m_costelement_id=100", [OA.pp_order_id]);
  log('§LACT-A4 backflush after the activity ok=' + rb.ok + ' msg=' + (rb.msg || '') + ' receipt cost=' + JSON.stringify(rcpt));
  check('A4 calculateFG adds the activity: the receipt carries 17540 + 6.02 = 17546.02 (upstream counts the FIRST detail of the activity collector)', rb.ok && rcpt.length === 1 && close(rcpt[0].amt, 17546.02, 0.001), { ok: rb.ok, msg: rb.msg, rcpt: rcpt });
  // refusals
  var nC = nCC(OA.pp_order_id), r2 = activity(OA, node, 10, 60, 0);
  // Java prepareIt :330-333 throws ActivityProcessedException only for DocStatus Completed ('CO'); a CLOSED node falls through to setInProgress, which throws IllegalStateException "Cannot change status from CL to IP"
  check('A5 a second activity collector on the CLOSED node is refused "Cannot change status from CL to IP" (node.setInProgress, :429-432) and nothing is written', !r2.ok && /Cannot change status from CL to IP/.test(String(r2.msg)) && nCC(OA.pp_order_id) === nC, { ok: r2.ok, msg: r2.msg });
  db.run("UPDATE pp_order_node SET docstatus='CO' WHERE pp_order_node_id=?", [node.pp_order_node_id]); var nC2 = nCC(OA.pp_order_id), r2b = activity(OA, node, 10, 60, 0);
  check('A5b a node in status Completed is refused "Order Activity Already Processed - MPPOrderNode[id-Packing Process]" (ActivityProcessedException) and nothing is written', !r2b.ok && /Order Activity Already Processed - MPPOrderNode\[\d+-Packing Process\]/.test(String(r2b.msg)) && nCC(OA.pp_order_id) === nC2, { ok: r2b.ok, msg: r2b.msg });
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OB = newCompletedOrder('LA-B'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OB.pp_order_id]); db.run("UPDATE pp_order_node SET ismilestone='Y' WHERE pp_order_id=?", [OB.pp_order_id]);
  var nodeB = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OB.pp_order_id]), nB = nCC(OB.pp_order_id), r3 = activity(OB, nodeB, 100, 1800, 0);
  // MILESTONE (spec §MILESTONE-FIX, declared deviation 2026-10-21): the reporting milestone is NOT closed by closeActivities, so it completes on its own quantity rule
  var ccOfNode = function (nid) { return q("SELECT pp_cost_collector_id AS id, movementqty AS q, docstatus AS s FROM pp_cost_collector WHERE pp_order_node_id=? AND costcollectortype='160' ORDER BY pp_cost_collector_id", [nid]); };
  var nB1 = one('SELECT docstatus AS s, qtydelivered AS qd FROM pp_order_node WHERE pp_order_node_id=?', [nodeB.pp_order_node_id]);
  check('A6 a single MILESTONE activity report completes like a plain one: collector CO, the node Closed with QtyDelivered 100', r3.ok && nB1.s === 'CL' && close(S(nB1.qd), 100) && ccOfNode(nodeB.pp_order_node_id).length === 1, { ok: r3.ok, msg: r3.msg, node: nB1 });
  // A6b a FRESH order: N1 (plain, Draft) -> N2 (milestone, a labelled fixture copy of N1). Reporting N2 first reports N1 (an Activity Control collector of N1's open qty 100), closing it, then N2 completes
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OB2 = newCompletedOrder('LA-B2'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OB2.pp_order_id]);
  var n1row = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OB2.pp_order_id]), n2id = 9990001, nnId = 9990002, ncols = colsOf('pp_order_node');
  db.run('INSERT INTO pp_order_node (' + ncols.map(function (c) { return '"' + c + '"'; }).join(',') + ') SELECT ' + ncols.map(function (c) { return c === 'pp_order_node_id' ? String(n2id) : c === 'ismilestone' ? "'Y'" : c === 'value' ? "'Milestone'" : c === 'name' ? "'Milestone Step'" : c === 'pp_order_node_uu' ? "'ms-fixture-uu'" : '"' + c + '"'; }).join(',') + ' FROM pp_order_node WHERE pp_order_node_id=?', [n1row.pp_order_node_id]);
  var nncols = colsOf('pp_order_nodenext'), nnv = { pp_order_nodenext_id: nnId, ad_client_id: 11, ad_org_id: n1row.ad_org_id, isactive: 'Y', pp_order_id: OB2.pp_order_id, pp_order_node_id: n1row.pp_order_node_id, pp_order_next_id: n2id, seqno: 10, entitytype: 'EE01', isstdusertransition: 'N', created: DATE, updated: DATE, createdby: 100, updatedby: 100 };
  var nnk = Object.keys(nnv).filter(function (k) { return nncols.indexOf(k) >= 0; }); db.run('INSERT INTO pp_order_nodenext (' + nnk.join(',') + ') VALUES (' + nnk.map(function () { return '?'; }).join(',') + ')', nnk.map(function (k) { return nnv[k]; }));
  var n2row = one('SELECT * FROM pp_order_node WHERE pp_order_node_id=?', [n2id]), r3b = activity(OB2, n2row, 100, 1800, 0);
  var n1after = one('SELECT docstatus AS s, qtydelivered AS qd FROM pp_order_node WHERE pp_order_node_id=?', [n1row.pp_order_node_id]), n2after = one('SELECT docstatus AS s, qtydelivered AS qd FROM pp_order_node WHERE pp_order_node_id=?', [n2id]);
  var c1 = ccOfNode(n1row.pp_order_node_id), c2 = ccOfNode(n2id);
  log('§LACT-A6b two-node milestone report ok=' + r3b.ok + ' msg=' + (r3b.msg || '') + ' N1=' + JSON.stringify(n1after) + ' ' + JSON.stringify(c1) + ' N2=' + JSON.stringify(n2after) + ' ' + JSON.stringify(c2));
  check('A6b reporting the milestone N2 behind a plain Draft N1: N1 is auto-reported (ONE collector qty 100, CO) and Closed, then N2 completes (its collector CO) and Closes - both QtyDelivered 100', r3b.ok && c1.length === 1 && close(S(c1[0].q), 100) && c1[0].s === 'CO' && n1after.s === 'CL' && close(S(n1after.qd), 100) && c2.length === 1 && c2[0].s === 'CO' && n2after.s === 'CL' && close(S(n2after.qd), 100) && (r3b.log || []).some(function (l) { return /§LIBERO-CLOSEACT from=9990001 milestone=true reported=/.test(l); }), { ok: r3b.ok, msg: r3b.msg, n1: n1after, c1: c1, n2: n2after, c2: c2 });
  // A6c MPPOrder.autoReportActivities :1455-1491: completing an order whose START node is a milestone auto-reports it (QtyToDeliver 100, no duration) and the order completes
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  mute(); var AM = mkOrder('LA-M'); unmute(); db.run("UPDATE pp_order_node SET ismilestone='Y' WHERE pp_order_id=?", [AM.o.pp_order_id]);
  mute(); var rM = doAction('pp_order', AM.o.pp_order_id, 'CO'); unmute(); var om = one('SELECT docstatus AS s FROM pp_order WHERE pp_order_id=?', [AM.o.pp_order_id]);
  var amNode = one('SELECT pp_order_node_id AS id, docstatus AS s FROM pp_order_node WHERE pp_order_id=?', [AM.o.pp_order_id]), amCc = ccOfNode(amNode.id);
  log('§LACT-A6c order complete with a milestone start node ok=' + rM.ok + ' msg=' + (rM.msg || '') + ' status=' + om.s + ' node=' + JSON.stringify(amNode) + ' collectors=' + JSON.stringify(amCc));
  check('A6c completing an order whose start node is a milestone: the order is CO, the start node auto-reported by ONE collector (qty 100, CO) and Closed', rM.ok && om.s === 'CO' && amCc.length === 1 && close(S(amCc[0].q), 100) && amCc[0].s === 'CO' && amNode.s === 'CL', { ok: rM.ok, msg: rM.msg, s: om.s, node: amNode, cc: amCc });
  // A7 events: the activity collector fires the same save + completion events as the plain path
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OC = newCompletedOrder('LA-C'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OC.pp_order_id]); var nodeC = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OC.pp_order_id]);
  var rC = activity(OC, nodeC, 100, 1800, 0), evs = ML.eventSeq(rC.trx);
  check('A7 §EVENT_SEQ of the activity: collector insert (M.beforeSave, V.BEFORE_NEW, WRITE_INSERT ...) precedes DOC:CO / DOC:prepareIt / DOC:completeIt / DOC:post, and the order node is saved inside prepare and close', evs.indexOf('WRITE_INSERT@pp_cost_collector') >= 0 && evs.indexOf('DOC:completeIt@pp_cost_collector') > evs.indexOf('DOC:prepareIt@pp_cost_collector') && evs.indexOf('DOC:post@pp_cost_collector') > evs.indexOf('DOC:completeIt@pp_cost_collector') && evs.filter(function (e) { return e === 'WRITE_UPDATE@pp_order_node'; }).length >= 2, evs.length);

  // A8 FactLine.setAmtSource: with AllowNegativePosting OFF the negative lines flip side (the schema flag is a SETUP switch of the schema, restored after)
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  db.run("UPDATE c_acctschema SET isallownegativeposting='N' WHERE c_acctschema_id=101");
  var OD = newCompletedOrder('LA-D'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OD.pp_order_id]); var nodeD = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OD.pp_order_id]), rD = activity(OD, nodeD, 100, 1800, 0);
  var ccD = one("SELECT pp_cost_collector_id AS i FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype='160'", [OD.pp_order_id]).i, faD = q('SELECT account_id AS a, amtacctdr AS dr, amtacctcr AS cr FROM fact_acct WHERE ad_table_id=53035 AND record_id=? ORDER BY fact_acct_id', [ccD]);
  db.run("UPDATE c_acctschema SET isallownegativeposting='Y' WHERE c_acctschema_id=101");
  log('§LACT-A8 AllowNegativePosting=N facts=' + JSON.stringify(faD.map(function (f) { return [f.a === wipEl2 ? 'WIP' : f.a === labEl ? 'LABOR' : f.a === burEl ? 'BURDEN' : f.a, f.dr, f.cr]; })));
  // hand: DR WIP -6.02 -> CR WIP 6.02 ; CR Labor -6.02 -> DR Labor 6.02 ; Burden 1.51 likewise
  check('A8 with AllowNegativePosting off the negative lines flip: CR WIP 6.02 / DR Labor 6.02 and CR WIP 1.51 / DR Burden 1.51', rD.ok && faD.length === 4 && faD[0].a === wipEl2 && close(faD[0].cr, 6.02) && close(faD[0].dr, 0) && faD[1].a === labEl && close(faD[1].dr, 6.02) && faD[3].a === burEl && close(faD[3].dr, 1.51) && close(faD[2].cr, 1.51), faD);

  // A9 SUBCONTRACTING (spec §SUBCONTRACT; MPPCostCollector.prepareIt :322-339 + createPO :843-944 + completeIt :483-510). LABELLED FIXTURE: the order's node is subcontracting, its node product
  //   is "Planting Service" 126 (Service, Purchased) x 2; vendor price list data M_Product_PO 126/113 (current vendor) with Order_Min 250, Order_Pack 100, DeliveryTime_Promised 3
  //   hand: qty = 100 x 2 = 200 -> max(200, Order_Min 250) = 250 -> Order_Pack 100 x ceil(250/100) = 300 ; DatePromised = today + 3
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OS = newCompletedOrder('LA-S'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OS.pp_order_id]);
  var nodeS = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OS.pp_order_id]);
  db.run("UPDATE pp_order_node SET issubcontracting='Y', c_bpartner_id=NULL WHERE pp_order_node_id=?", [nodeS.pp_order_node_id]);
  var npc = colsOf('pp_order_node_product'), npv = { pp_order_node_product_id: 9990101, ad_client_id: 11, ad_org_id: nodeS.ad_org_id, isactive: 'Y', created: DATE, updated: DATE, createdby: 100, updatedby: 100, m_product_id: 126, pp_order_id: OS.pp_order_id,
    pp_order_node_id: nodeS.pp_order_node_id, pp_order_workflow_id: nodeS.pp_order_workflow_id, yield: 100, issubcontracting: 'Y', seqno: 10, qty: 2, pp_order_node_product_uu: 'sub-fixture-uu' };
  var npk = Object.keys(npv).filter(function (k) { return npc.indexOf(k) >= 0; }); db.run('INSERT INTO pp_order_node_product (' + npk.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + npk.map(function () { return '?'; }).join(',') + ')', npk.map(function (k) { return npv[k]; }));
  db.run('UPDATE m_product_po SET order_min=250, order_pack=100, deliverytime_promised=3 WHERE m_product_id=126 AND c_bpartner_id=113');
  var nPO0 = S(one("SELECT COUNT(*) AS n FROM c_order WHERE issotrx='N'").n), rS = activity(OS, nodeS, 100, 1800, 0);
  var ccS = one("SELECT * FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype='160'", [OS.pp_order_id]);
  var olS = q('SELECT l.c_orderline_id AS id, l.qtyordered AS q, l.qtyentered AS qe, l.m_product_id AS p, l.pp_cost_collector_id AS cc, l.datepromised AS dp, o.c_order_id AS oid, o.c_paymentterm_id AS pt, o.m_pricelist_id AS pl, o.c_bpartner_id AS bp, o.issotrx AS so, o.documentno AS dn, o.description AS od, o.m_warehouse_id AS wh, o.docstatus AS st, d.docbasetype AS dbt FROM c_orderline l JOIN c_order o ON o.c_order_id=l.c_order_id LEFT JOIN c_doctype d ON d.c_doctype_id=o.c_doctypetarget_id WHERE l.pp_cost_collector_id=?', [ccS && ccS.pp_cost_collector_id]);
  var nS = one('SELECT docstatus AS s, qtydelivered AS qd FROM pp_order_node WHERE pp_order_node_id=?', [nodeS.pp_order_node_id]);
  (rS.log || []).filter(function (l) { return /CREATEPO|ProductNotOnPriceList|PRICE/.test(l); }).slice(0, 6).forEach(function (l) { log('    ' + String(l).slice(0, 300)); });
  log('§LACT-A9 subcontract ok=' + rS.ok + ' msg=' + (rS.msg || '') + ' cc=' + JSON.stringify(ccS && { st: ccS.docstatus, pr: ccS.processed, desc: ccS.description }) + ' lines=' + JSON.stringify(olS) + ' node=' + JSON.stringify(nS) + ' newPOs=' + (S(one("SELECT COUNT(*) AS n FROM c_order WHERE issotrx='N'").n) - nPO0));
  var DEF_PT = S((one("SELECT c_paymentterm_id AS t FROM c_paymentterm WHERE ad_client_id=11 AND isdefault='Y' AND isactive='Y'") || {}).t);   // MOrder.beforeSave :1314-1328 (the vendor's SALES term is empty: the setBPartner-before-setIsSOTrx quirk)
  var dp3 = (function () { var d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10); })();
  check('A9 a subcontracting activity creates ONE draft Purchase Order (POO, IsSOTrx N) for vendor 113 with ONE line of Planting Service qty 300 (100x2 -> min 250 -> pack 100), DatePromised today+3, price list = the default purchase list 102 and payment term = the client default (the upstream setBPartner-before-setIsSOTrx order reads the vendor EMPTY sales side), linked to the collector; the collector stays In Progress (processed) with "Order: <PO>" in its description, the activity In Progress, QtyDelivered untouched',
    rS.ok && ccS && ccS.docstatus === 'IP' && ccS.processed === 'Y' && olS.length === 1 && S(olS[0].bp) === 113 && olS[0].so === 'N' && olS[0].dbt === 'POO' && S(olS[0].p) === 126 && close(S(olS[0].q), 300) && close(S(olS[0].qe), 300) && String(olS[0].dp).slice(0, 10) === dp3 && /:LA-S$/.test(String(olS[0].od)) && olS[0].st === 'DR' && S(olS[0].pl) === 102 && S(olS[0].pt) === DEF_PT && new RegExp(': ' + olS[0].dn + '$').test(String(ccS.description)) && nS.s === 'IP' && !S(nS.qd),
    { ok: rS.ok, msg: rS.msg, cc: ccS && { st: ccS.docstatus, pr: ccS.processed, desc: ccS.description }, lines: olS, node: nS });
  // A9b completing again while the PO is not delivered: stays IP with "The quantity do not is complete for next Purchase Order : <docno>,"; A9c after delivery: CO, the activity Completed
  mute(); var rS2 = doAction('pp_cost_collector', ccS.pp_cost_collector_id, 'CO'); unmute(); var cs2 = one('SELECT docstatus AS s FROM pp_cost_collector WHERE pp_cost_collector_id=?', [ccS.pp_cost_collector_id]);
  check('A9b completing the collector before the PO is delivered keeps it In Progress ("The quantity do not is complete for next Purchase Order : ' + (olS[0] && olS[0].dn) + ',") and creates no second PO', cs2.s === 'IP' && /The quantity do not is complete for next Purchase Order : /.test(String(rS2.msg || '') + JSON.stringify(rS2.log || [])) && q('SELECT 1 AS x FROM c_orderline WHERE pp_cost_collector_id=?', [ccS.pp_cost_collector_id]).length === 1, { ok: rS2.ok, msg: rS2.msg, s: cs2.s });
  // A9c the PO is DELIVERED through a real vendor Material Receipt (doc type 122, the PO line, qty 300) completed by its DocAction: MFG_Validator DOC_AFTER_COMPLETE M_InOut (:285-320)
  //   completes the waiting subcontract collector (no manual step) - the hook coded in #2240, judged here
  var pol = one('SELECT * FROM c_orderline WHERE pp_cost_collector_id=?', [ccS.pp_cost_collector_id]), poh = one('SELECT * FROM c_order WHERE c_order_id=?', [pol.c_order_id]);
  function msave(table, fields) { var t0 = new ML.Trx(q, env()), r = ML.run(q, env(), { table: table, timing: 'SAVE', changes: ML.newPO(t0, table, fields) }); if (r.ok) apply(r.ops); return r; }
  mute(); var poc = ML.run(q, env(), { table: 'c_order', timing: 'DOCACTION', id: pol.c_order_id, action: 'CO' }); if (poc.ok) apply(poc.ops); unmute();
  var rh = msave('m_inout', { ad_org_id: poh.ad_org_id, c_doctype_id: 122, issotrx: 'N', movementtype: 'V+', c_bpartner_id: poh.c_bpartner_id, c_bpartner_location_id: poh.c_bpartner_location_id, m_warehouse_id: poh.m_warehouse_id, c_order_id: poh.c_order_id,
    movementdate: DATE, dateacct: DATE, docstatus: 'DR', docaction: 'CO', deliveryrule: 'A', deliveryviarule: 'P', freightcostrule: 'I', priorityrule: '5', processed: 'N', posted: 'N', isapproved: 'N', isintransit: 'N', isprinted: 'N', isinvoiced: 'N', issotrx: 'N', sendemail: 'N', isdropship: 'N' });
  var ioId = one('SELECT MAX(m_inout_id) AS id FROM m_inout').id;
  var rl = msave('m_inoutline', { m_inout_id: ioId, ad_org_id: poh.ad_org_id, line: 10, m_product_id: pol.m_product_id, c_uom_id: pol.c_uom_id, qtyentered: 300, movementqty: 300, m_locator_id: 50001, c_orderline_id: pol.c_orderline_id, m_attributesetinstance_id: 0, isdescription: 'N', processed: 'N', isinvoiced: 'N' });
  mute(); var rio = ML.run(q, env(), { table: 'm_inout', timing: 'DOCACTION', id: ioId, action: 'CO' }); if (rio.ok) apply(rio.ops); unmute();
  var rS3 = rio, ioSt = one('SELECT docstatus AS s FROM m_inout WHERE m_inout_id=?', [ioId]).s;
  log('§LACT-A9c PO ' + poh.documentno + ' complete ok=' + poc.ok + ' (' + (poc.msg || '') + ') receipt ' + ioId + ' header ok=' + rh.ok + ' line ok=' + rl.ok + ' (' + (rl.msg || rl.error || '') + ') complete ok=' + rio.ok + ' (' + (rio.msg || '') + ') status=' + ioSt + ' hook=' + JSON.stringify((rio.log || []).filter(function (l) { return /SUBCONTRACT-RECEIPT/.test(l); })));
  var cs3 = one('SELECT docstatus AS s, docaction AS a, processed AS p FROM pp_cost_collector WHERE pp_cost_collector_id=?', [ccS.pp_cost_collector_id]), nS3 = one('SELECT docstatus AS s, docaction AS a, datefinish AS df FROM pp_order_node WHERE pp_order_node_id=?', [nodeS.pp_order_node_id]);
  log('§LACT-A9c after delivery ok=' + rS3.ok + ' msg=' + (rS3.msg || '') + ' cc=' + JSON.stringify(cs3) + ' node=' + JSON.stringify(nS3));
  check('A9c the vendor RECEIPT of the PO line (completed through its DocAction) completes the subcontract collector by the M_InOut hook (CO, DocAction CL) and the activity is Completed (CO, --, DateFinish)', rS3.ok && ioSt === 'CO' && cs3.s === 'CO' && cs3.a === 'CL' && nS3.s === 'CO' && nS3.a === '--' && !!nS3.df, { ok: rS3.ok, msg: rS3.msg, cc: cs3, node: nS3 });

  // ── VARIANCES (spec §VARIANCES; CostEngine.createRateVariances :525-581 activity branch, createMethodVariances :583-656, MPPCostCollector.completeIt :555-556) ──────────────────────
  var HQ = 0.5016666666666667;   // the A1 hour base: (0+1+2) x QtyBatchs 2 + 1800 = 1806 s / 3600
  var vdet = function (ccId) { return q('SELECT m_product_id AS p, m_costelement_id AS e, amt, qty FROM m_costdetail WHERE pp_cost_collector_id=? AND c_acctschema_id=101 ORDER BY m_costdetail_id', [ccId]); };
  var ccOf = function (oid, t) { return q("SELECT * FROM pp_cost_collector WHERE pp_order_id=? AND costcollectortype=? ORDER BY pp_cost_collector_id", [oid, t]); };
  // RV1 LABELLED FIXTURE (the slice-3 method: a direct M_Cost edit is undone by cost history, so the ORDER'S SNAPSHOT moves): PP_Order_Cost Labor of the resource product 12 -> 10 after completion;
  //   the activity books a RATE variance (140): (-actual, -qty) and (std, qty) copies of its Labor detail
  //   hand: Labor detail qty = -HQ ; amtStd = round4(10 x -HQ) = -5.0167 ; amtActual = round4(12 x -HQ) = -6.02 -> details (+6.02, +HQ) and (-5.0167, -HQ); Burden unchanged (3 = 3) -> no Burden variance
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500); rprice(105, 12); rprice(50000, 3);
  var OR = newCompletedOrder('LA-R'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OR.pp_order_id]); db.run('UPDATE pp_order_cost SET currentcostprice=10 WHERE pp_order_id=? AND m_product_id=? AND m_costelement_id=105 AND c_acctschema_id=101', [OR.pp_order_id, RP]);
  var nodeR = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OR.pp_order_id]), rR = activity(OR, nodeR, 100, 1800, 0), rv = ccOf(OR.pp_order_id, '140'), rvd = rv.length ? vdet(rv[0].pp_cost_collector_id) : [];
  (rR.log || []).filter(function (l) { return /LIBERO-RATE|ACTIVITY-COST|LIBERO-ACT|LIBERO-COMPLETE/.test(l); }).slice(0, 8).forEach(function (l) { log('    ' + String(l).slice(0, 260)); });
  log('§LACT-RV1 cc160 details=' + JSON.stringify(vdet((ccOf(OR.pp_order_id, '160')[0] || {}).pp_cost_collector_id).map(function (d) { return d.p + '/' + d.e + ':' + d.amt + '/' + d.qty; })) + ' snapshot=' + JSON.stringify(q('SELECT m_product_id AS p, m_costelement_id AS e, currentcostprice AS c FROM pp_order_cost WHERE pp_order_id=? AND m_product_id=50024', [OR.pp_order_id])));
  log('§LACT-RV1 ok=' + rR.ok + ' msg=' + (rR.msg || '') + ' rate collectors=' + rv.length + ' details=' + JSON.stringify(rvd.map(function (d) { return d.e + ':' + d.amt + '/' + d.qty; })));
  var lab = rvd.filter(function (d) { return S(d.e) === 105; });
  check('RV1 an Activity Control whose order snapshot holds Labor 10 against the actual 12 books ONE Rate Variance collector (140, CO) with Labor details +6.02/+' + HQ + ' and -5.0167/-' + HQ + ', no Burden detail', rR.ok && rv.length === 1 && rv[0].docstatus === 'CO' && lab.length === 2 && close(lab[0].amt, 6.02, 0.00005) && close(lab[0].qty, HQ, 1e-9) && close(lab[1].amt, -5.0167, 0.00005) && close(lab[1].qty, -HQ, 1e-9) && !rvd.some(function (d) { return S(d.e) === 50000; }), { ok: rR.ok, msg: rR.msg, rv: rv.length, rvd: rvd });
  // MV1 LABELLED FIXTURE: the activity is REPORTED on resource 50000 "Fertilizer Plant" (product 50018, Labor 20) while the routing says 50006 (product 50024, Labor 12, Burden 3) -> a METHOD CHANGE collector (130)
  //   hand (qty = the resource base value = HQ): Labor: (+20 x HQ = 10.0333.., +HQ, 50018) and (-12 x HQ = -6.02, -HQ, 50024); Burden: actual 0 vs std 3 -> (0, +HQ, 50018) and (-1.505, -HQ, 50024)
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  db.run('UPDATE m_cost SET currentcostprice=20 WHERE m_product_id=50018 AND m_costelement_id=105 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
  var OMv = newCompletedOrder('LA-V'); db.run('UPDATE pp_order SET qtybatchs=2 WHERE pp_order_id=?', [OMv.pp_order_id]);
  var nodeV = one('SELECT * FROM pp_order_node WHERE pp_order_id=?', [OMv.pp_order_id]);
  mute(); var rV = ML.run(q, Object.assign(env(), T), { table: 'pp_order', timing: 'PROCESS', fn: function (trx) {
    lib.createCollector(trx, trx.get('pp_order', OMv.pp_order_id), { type: '160', docTypeId: DT_MCC, locatorId: LOC, asiId: 0, movementDate: DATE, qty: 100, scrap: 0, reject: 0, bomLineId: 0, nodeId: nodeV.pp_order_node_id, resourceId: 50000, productId: FG, durationSetup: 0, duration: 1800 });
    return { ok: true }; } }); unmute(); if (rV.ok) apply(rV.ops);
  db.run('UPDATE m_cost SET currentcostprice=0 WHERE m_product_id=50018 AND m_costelement_id=105 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
  var mv = ccOf(OMv.pp_order_id, '130'), mvd = mv.length ? vdet(mv[0].pp_cost_collector_id).filter(function (d) { return S(d.p) === 50018 || S(d.p) === 50024; }) : [];
  log('§LACT-MV1 ok=' + rV.ok + ' msg=' + (rV.msg || '') + ' method collectors=' + mv.length + ' resource details=' + JSON.stringify(mvd.map(function (d) { return d.p + '/' + d.e + ':' + d.amt + '/' + d.qty; })));
  var g = function (p, e) { return mvd.filter(function (d) { return S(d.p) === p && S(d.e) === e; })[0]; };
  check('MV1 an activity reported on resource 50000 instead of the routing resource 50006 books ONE Method Change collector (130, CO): Labor +10.0333/+HQ on 50018 and -6.02/-HQ on 50024, Burden 0/+HQ on 50018 and -1.505/-HQ on 50024',
    rV.ok && mv.length === 1 && mv[0].docstatus === 'CO' && g(50018, 105) && close(g(50018, 105).amt, 20 * HQ, 0.0001) && close(g(50018, 105).qty, HQ, 1e-9) && g(50024, 105) && close(g(50024, 105).amt, -12 * HQ, 0.0001) && close(g(50024, 105).qty, -HQ, 1e-9) && g(50018, 50000) && close(g(50018, 50000).amt, 0) && g(50024, 50000) && close(g(50024, 50000).amt, -3 * HQ, 0.0001),
    { ok: rV.ok, msg: rV.msg, mv: mv.length, mvd: mvd });
  // MC1 a Method Change collector (130) on a BOM line (Libero createIssue makes one for a line with QtyBatch 0 and QtyBOM 0): it is an ISSUE (the line's QtyDelivered moves) but a VARIANCE (no stock
  //   movement), and createMethodVariances books its product at the ACTUAL price: KG Material 2.5 x 10 = 25 (qty 10)
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OMc = newCompletedOrder('LA-MC'), kgl = bomLines(OMc.pp_order_id).filter(function (l) { return S(l.m_product_id) === KG; })[0], kgBefore = S(kgl.qtydelivered || 0);
  mute(); var rMc = ML.run(q, Object.assign(env(), T), { table: 'pp_order', timing: 'PROCESS', fn: function (trx) {
    lib.createCollector(trx, trx.get('pp_order', OMc.pp_order_id), { type: '130', docTypeId: DT_MCC, locatorId: LOC, asiId: 0, movementDate: DATE, qty: 10, scrap: 0, reject: 0, bomLineId: kgl.pp_order_bomline_id, nodeId: 0, resourceId: OMc.s_resource_id, productId: KG, durationSetup: 0, duration: 0 });
    return { ok: true }; } }); unmute(); if (rMc.ok) apply(rMc.ops);
  var mc = ccOf(OMc.pp_order_id, '130'), mcd = mc.length ? vdet(mc[0].pp_cost_collector_id) : [], kgAfter = S(one('SELECT qtydelivered AS q FROM pp_order_bomline WHERE pp_order_bomline_id=?', [kgl.pp_order_bomline_id]).q);
  var mtx = mc.length ? q('SELECT COUNT(*) AS n FROM m_transaction WHERE pp_cost_collector_id=?', [mc[0].pp_cost_collector_id])[0].n : -1;
  log('§LACT-MC1 ok=' + rMc.ok + ' msg=' + (rMc.msg || '') + ' collectors=' + mc.length + ' details=' + JSON.stringify(mcd.map(function (d) { return d.p + '/' + d.e + ':' + d.amt + '/' + d.qty; })) + ' KG delivered ' + kgBefore + ' -> ' + kgAfter + ' transactions=' + mtx);
  var mat = mcd.filter(function (d) { return S(d.e) === 100; })[0];
  check('MC1 a Method Change collector (130) on the KG line completes: the line QtyDelivered +10, NO stock transaction, and a Material detail on KG of 2.5 x 10 = 25 / qty 10', rMc.ok && mc.length === 1 && mc[0].docstatus === 'CO' && close(kgAfter - kgBefore, 10) && S(mtx) === 0 && mat && S(mat.p) === KG && close(mat.amt, 25, 0.0001) && close(mat.qty, 10), { ok: rMc.ok, msg: rMc.msg, mcd: mcd, kg: [kgBefore, kgAfter], mtx: mtx });

  COSTMOD.DEFERRED.forEach(function (d) { log('§LIBERO-DEFERRED ' + d); });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§LACT-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LACT-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
