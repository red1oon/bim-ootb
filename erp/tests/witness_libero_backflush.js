#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-BACKFLUSH (spec prompts/mfg/LIBERO_BACKFLUSH_SLICE4_SPEC.md). READ THE LOG after every run: verdict = §LBACK-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: legacy completes cost collectors in ONE call (MPPCostCollector.createCollector :150-155) and drives them from the Order Receipt & Issue form (WOrderReceiptIssue.cmd_process :895-950). Does the twin do the same:
//   the form's default quantities, one collector per storage row, all-or-none in one transaction, and the same model-event order as the plain window path? Every expected number is hand-computed from the Java (comments show the arithmetic).
//   Fixture = W-LIBERO-COST's (GardenWorld order 100 x Fertilizer; KG on hand 10000, BAG 500; standard prices KG 2.5 BAG 0.4; BOM lines are ABSOLUTE: KG QtyBom 70 scrap 1, BAG QtyBom 1).  Breaks (MUST exit 1): LBACK_BREAK=perrow|noatomic|scrapdiv
'use strict';
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LBACK_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §LBACK ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
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
  log('§LBACK-FIXTURE Standard Costing prerequisite: product categories of ' + [FG, KG, BAG].join(',') + ' set to costing method S (GardenWorld ships Average PO, Libero refuses non-Standard); standard material prices KG=2.5 BAG=0.4 FG=9; on-hand KG=10000 BAG=500');
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
  if (BREAK === 'perrow') COSTMOD.SOURCE.perRow = false; if (BREAK === 'scrapdiv') COSTMOD.SOURCE.scrapDivide = true;
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

  // ── B1 the form's default rows (OrderReceiptIssue.executeQuery) ───────────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OA = newCompletedOrder('LB-A'); var rows = lib.backflushRows(new ML.Trx(q, env()), OA, { rule: 'BackFlush' });
  log('§LBACK-B1 default rows ' + JSON.stringify(rows.map(function (r) { return { line: r.bomLineId, sel: r.selected, qty: String(r.toDeliver), scrap: String(r.scrap) }; })));
  // hand: open = 100 - 0 = 100 = toDeliver; absolute lines: KG 100 x QtyBom 70 = 7000 (the form does NOT divide by 1-scrap%; required is 7070.71); BAG 100 x 1 = 100; scrap 0; both on hand > 0 and required > 0 -> selected
  check('B1 form defaults: toDeliver = open = 100; KG row 100 x 70 = 7000 (not the 7070.71 required), BAG row 100 x 1 = 100, both selected, scrap 0', rows.length === 2 && rows[0].selected && rows[1].selected && close(S(String(rows[0].toDeliver)), 7000) && close(S(String(rows[1].toDeliver)), 100) && S(String(rows[0].scrap)) === 0, rows.length);

  // ── B2 Backflush: one call, three completed collectors ────────────────────────────────────────────────────────────
  var kg0 = onhand(KG), bag0 = onhand(BAG), fg0 = onhand(FG), r2 = runProcess(OA.pp_order_id, { rule: 'BackFlush', movementDate: DATE });
  var c2 = ccs(OA.pp_order_id), md = q("SELECT d.amt AS amt, c.costcollectortype AS t FROM m_costdetail d JOIN pp_cost_collector c ON c.pp_cost_collector_id=d.pp_cost_collector_id WHERE c.pp_order_id=? AND d.c_acctschema_id=101 AND d.m_costelement_id=100 ORDER BY d.m_costdetail_id", [OA.pp_order_id]);
  log('§LBACK-B2 backflush ok=' + r2.ok + ' msg=' + (r2.msg || '') + ' collectors=' + JSON.stringify(c2.map(function (c) { return c.t + ':' + c.qty + ':' + c.st; })) + ' costs=' + JSON.stringify(md));
  // hand: KG 10000-7000 = 3000; BAG 500-100 = 400; FG 0+100; Material cost: KG 7000 x 2.5 = -17500; BAG 100 x 0.4 = -40; receipt = open 100/100 x (17500+40) = +17540
  check('B2a one Backflush call -> stock KG ' + kg0 + '->3000, BAG ' + bag0 + '->400, finished product ' + fg0 + '->100', r2.ok && close(onhand(KG), 3000, 0.001) && close(onhand(BAG), 400) && close(onhand(FG) - fg0, 100), { ok: r2.ok, msg: r2.msg, kg: onhand(KG), bag: onhand(BAG) });
  check('B2b exactly three collectors (110, 110, 100), all completed (CO)', c2.length === 3 && c2[0].t === '110' && c2[1].t === '110' && c2[2].t === '100' && c2.every(function (c) { return c.st === 'CO'; }), c2);
  check('B2c cost details: KG -17500, BAG -40, receipt +17540 (the issues\' cost carried to the finished goods)', md.length === 3 && close(md[0].amt, -17500, 0.001) && close(md[1].amt, -40, 0.001) && close(md[2].amt, 17540, 0.001), md);
  var oAfter = one('SELECT qtydelivered, qtyreserved, datestart, datefinish, datedelivered FROM pp_order WHERE pp_order_id=?', [OA.pp_order_id]);
  check('B2d order books the delivery: QtyDelivered 100, nothing reserved, DateStart and DateDelivered set', close(S(oAfter.qtydelivered), 100) && close(S(oAfter.qtyreserved), 0, 0.0005) && oAfter.datestart && oAfter.datedelivered, oAfter);

  // ── B3 integrity: the same model events, in the same order, as the plain collector path ──────────────────────────
  function plainCollector(order, type, extra) {   // what a user (or createCollector) does: SAVE the collector, then processIt(CO) directly (no AD workflow: Java cc.processIt)
    var ev = [], f = lib.collectorFields(new ML.Trx(q, env()), order, Object.assign({ type: type, docTypeId: DT_MCC, locatorId: LOC, movementDate: DATE, qty: 0, scrap: 0, reject: 0, durationSetup: 0, duration: 0 }, extra)); f.ad_client_id = 11;
    mute(); var e1 = Object.assign(env(), T), s1 = ML.run(q, e1, { table: 'pp_cost_collector', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, e1), 'pp_cost_collector', f) }); if (s1.ok) apply(s1.ops); ev = ev.concat(ML.eventSeq(s1.trx));
    var id = one('SELECT pp_cost_collector_id AS i FROM pp_cost_collector ORDER BY pp_cost_collector_id DESC LIMIT 1').i, e2 = Object.assign(env(), T, { noWorkflow: true }), d1 = ML.run(q, e2, { table: 'pp_cost_collector', timing: 'DOCACTION', id: id, action: 'CO' });
    if (d1.ok) apply(d1.ops); ev = ev.concat(ML.eventSeq(d1.trx)); unmute(); return ev;
  }
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OB = newCompletedOrder('LB-B'), lb = bomLines(OB.pp_order_id), plain = [];
  plain = plain.concat(plainCollector(OB, '110', { bomLineId: lb[0].pp_order_bomline_id, productId: lb[0].m_product_id, qty: 7000 }));
  plain = plain.concat(plainCollector(OB, '110', { bomLineId: lb[1].pp_order_bomline_id, productId: lb[1].m_product_id, qty: 100 }));
  plain = plain.concat(plainCollector(OB, '100', { qty: 100, productId: FG }));
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OC = newCompletedOrder('LB-C'), r3 = runProcess(OC.pp_order_id, { rule: 'BackFlush', movementDate: DATE }), one3 = ML.eventSeq(r3.trx);
  // the form's createReceipt then saves the order dates (an extra pp_order save at the end when something changed); everything before it must equal the plain path
  var tail = ['M.beforeSave@pp_order', 'V.BEFORE_CHANGE@pp_order', 'V.BEFORE_SAVE@pp_order', 'WRITE_UPDATE@pp_order', 'M.afterSave@pp_order', 'V.AFTER_CHANGE@pp_order', 'V.AFTER_SAVE@pp_order'];
  var cut = one3.length, sameCore = false, tailOk = true;
  if (one3.length >= plain.length + tail.length && JSON.stringify(one3.slice(one3.length - tail.length)) === JSON.stringify(tail)) cut = one3.length - tail.length;
  sameCore = JSON.stringify(one3.slice(0, cut)) === JSON.stringify(plain.filter(function (e) { return true; })) || JSON.stringify(one3.slice(0, plain.length)) === JSON.stringify(plain);
  log('§LBACK-B3 events backflush=' + one3.length + ' plain=' + plain.length + ' tailSaved=' + (cut !== one3.length) + ' firstDiff=' + (function () { for (var i = 0; i < Math.min(one3.length, plain.length); i++) if (one3[i] !== plain[i]) return i + ':' + one3[i] + ' vs ' + plain[i]; return 'none'; })());
  check('B3 §EVENT_SEQ: the one-step Backflush fires the SAME model events in the SAME order as the three plain collector saves + completions (events compared: ' + plain.length + ')', plain.length > 30 && r3.ok && sameCore && (one3.length === plain.length || (cut !== one3.length && one3.length - plain.length === tail.length)), { b: one3.length, p: plain.length });

  // ── B4 insufficient stock: nothing is written ───────────────────────────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 50);
  var OD = newCompletedOrder('LB-D'), n4 = nCC(OD.pp_order_id), kg4 = onhand(KG), tx4 = S(one('SELECT COUNT(*) AS n FROM m_transaction').n), r4 = runProcess(OD.pp_order_id, { rule: 'BackFlush', movementDate: DATE }, BREAK === 'noatomic');
  log('§LBACK-B4 BAG on hand 50 < 100: ok=' + r4.ok + ' msg="' + r4.msg + '"');
  check('B4 not enough BAG on hand -> refused before anything is written (no collector, no stock move, no transaction)', !r4.ok && /Not enough on hand/.test(String(r4.msg)) && nCC(OD.pp_order_id) === n4 && close(onhand(KG), kg4) && S(one('SELECT COUNT(*) AS n FROM m_transaction').n) === tx4, { ok: r4.ok, msg: r4.msg });

  // ── B5 all-or-none: the receipt step fails after the issues were done ──────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OE = newCompletedOrder('LB-E'), kg5 = onhand(KG), n5 = nCC(OE.pp_order_id), tx5 = S(one('SELECT COUNT(*) AS n FROM m_transaction').n), r5; db.run('UPDATE m_product_category_acct SET costingmethod=NULL WHERE m_product_category_id=109'); r5 = runProcess(OE.pp_order_id, { rule: 'BackFlush', movementDate: DATE }, BREAK === 'noatomic'); stdOn(true);
  log('§LBACK-B5 finished-goods category not on Standard costing, so the RECEIPT is refused after both issues completed: ok=' + r5.ok + ' msg="' + String(r5.msg).slice(0, 120) + '" collectors ' + n5 + ' -> ' + nCC(OE.pp_order_id));
  check('B5 the receipt is refused ("Costing method not supported") after two issues completed -> the WHOLE backflush is rolled back (no collector, KG ' + kg5 + ' unchanged, no transaction)', !r5.ok && nCC(OE.pp_order_id) === n5 && close(onhand(KG), kg5) && S(one('SELECT COUNT(*) AS n FROM m_transaction').n) === tx5, { ok: r5.ok, msg: r5.msg, n: nCC(OE.pp_order_id), kg: onhand(KG) });

  // ── B6 two storage rows: one collector per row, FIFO ───────────────────────────────────────────────────────────────
  fixtureStock([{ asi: 9001, qty: 4000, date: '2026-01-01 00:00:00' }, { asi: 9002, qty: 6000, date: '2026-02-01 00:00:00' }], 500);
  var OF = newCompletedOrder('LB-F'), r6 = runProcess(OF.pp_order_id, { rule: 'OnlyIssue', movementDate: DATE }), c6 = ccs(OF.pp_order_id).filter(function (c) { return c.t === '110'; });
  log('§LBACK-B6 two KG rows 4000(asi 9001, older) + 6000(asi 9002), OnlyIssue: ok=' + r6.ok + ' msg=' + (r6.msg || '') + ' collectors=' + JSON.stringify(c6.map(function (c) { return c.qty + '@' + c.asi; })));
  // hand: OnlyIssue default = open = required - delivered = 7070.71 for KG (the OnlyIssue branch uses QtyOpen, not toDeliver x QtyBom): FIFO 4000 from asi 9001, then 3070.71 from asi 9002; BAG 100 from its single row => 3 issue collectors
  check('B6 OnlyIssue with two KG storage rows: FIFO, one collector per row (4000 from the older row, 3070.71 from the next) plus the BAG issue, all CO', r6.ok && c6.length === 3 && close(c6[0].qty, 4000) && S(c6[0].asi) === 9001 && close(c6[1].qty, 3070.71, 0.001) && S(c6[1].asi) === 9002 && c6.every(function (c) { return c.st === 'CO'; }), c6);

  // ── B7 the deferred close ───────────────────────────────────────────────────────────────────────────────────────
  fixtureStock([{ asi: 0, qty: 10000, date: '2026-01-01 00:00:00' }], 500);
  var OG = newCompletedOrder('LB-G'), n7 = nCC(OG.pp_order_id), r7 = runProcess(OG.pp_order_id, { rule: 'BackFlush', movementDate: DATE, closeDocument: true });
  check('B7 isCloseDocument is refused by name (MPPOrder.closeIt not ported) and nothing is written', !r7.ok && /DEFERRED: MPPOrder.closeIt/.test(String(r7.msg)) && nCC(OG.pp_order_id) === n7, { ok: r7.ok, msg: r7.msg });

  // ── B8 legacy quirk kept: scrap repeats on every storage row ──────────────────────────────────────────────────────
  fixtureStock([{ asi: 9001, qty: 4000, date: '2026-01-01 00:00:00' }, { asi: 9002, qty: 6000, date: '2026-02-01 00:00:00' }], 500);
  var OH = newCompletedOrder('LB-H'), lh = bomLines(OH.pp_order_id), eH = Object.assign(env(), T);
  mute(); var r8 = ML.run(q, eH, { table: 'pp_order', timing: 'PROCESS', fn: function (trx) { var o = trx.get('pp_order', OH.pp_order_id); lib.createIssue(trx, o, lh[0].pp_order_bomline_id, DATE, 7000, 2, 0, lib.getStorages(trx, KG, o.m_warehouse_id, 0, DATE), false); return { ok: true }; } }); unmute(); if (r8.ok) apply(r8.ops);
  var c8 = ccs(OH.pp_order_id).filter(function (c) { return c.t === '110'; });
  log('§LBACK-B8 createIssue qty 7000 scrap 2 over rows 4000/6000: ok=' + r8.ok + ' msg=' + (r8.msg || '') + ' collectors=' + JSON.stringify(c8.map(function (c) { return c.qty + '/scrap' + c.sc; })));
  // hand: toIssue = 7000+2 = 7002; row1 min(7002,4000)=4000, row2 min(3002,6000)=3002; scrap 2 passed to BOTH
  check('B8 scrap 2 is repeated on every storage row\'s collector (4000/scrap 2 and 3002/scrap 2), as the Java does', r8.ok && c8.length === 2 && close(c8[0].qty, 4000) && close(c8[1].qty, 3002) && close(c8[0].sc, 2) && close(c8[1].sc, 2), c8);

  COSTMOD.DEFERRED.forEach(function (d) { log('§LIBERO-DEFERRED ' + d); });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§LBACK-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LBACK-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
