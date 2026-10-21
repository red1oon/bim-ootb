#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-MTO (spec prompts/mfg/LIBERO_MTO_SPEC.md). READ THE LOG after every run: verdict = §LMTO-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: Make-to-Order - a released sales order line of a product with a Make-to-Order BOM creates its Manufacturing Order the way Libero does (MPPMRP.createMOMakeTo + createMO,
//   the plant and planning data found, backward-scheduled by CRP over the resource type's day slots, a resource assignment per routing node), the SO's MRP row points at the MO, and the SO ids reach
//   ONLY the MO's MRP rows (declared deviation §57.3). Labelled fixture: BOM 50005 (Fertilizer#70) set to BOMType O / BOMUse M; planning row 50089 is legacy seed data.
//   Breaks (MUST exit 1): LMTO_BREAK=ferry (the upstream JVM-wide static SO id)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var initSqlJs, REAL = false; try { initSqlJs = require('sql.js'); REAL = true; } catch (e) { try { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); REAL = true; } catch (e2) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); } }
var BREAK = process.env.LMTO_BREAK || '', judged = 0, fails = 0, inconclusive = 0;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(n, ok, info) { judged++; if (!ok) fails++; _log('  §LMTO ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }

(async function () {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var ok = 0, bad = 0; ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } }); });
  _log('§LIBERO-LOAD seed + patches statements ok=' + ok + ' failed=' + bad + ' sqljs=' + (REAL ? 'real' : 'bundled') + ' break=' + (BREAK || 'none'));
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js'));
  var DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js')), PA = require(path.join(ERP, 'ad_parser.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelAsi = require(path.join(ERP, 'model_asi.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));   // the Libero chunks reuse the core ports
  ['model_trade', 'model_order'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) { /* core classes not needed for pp_* */ } }); MV.installDefaultHooks();
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var hostDb = { query: q, run: function (sql, p) { db.run(sql, p || []); } };
  var uu = 0, clock = Date.parse('2026-10-15T09:00:00Z');
  function env() { clock += 1000; return { client: 11, org: 50006, user: 100, role: 102, date: '2026-10-15 00:00:00', now: '2026-10-15 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  // the commit side: apply an op group the way commitGroup + the listTip fold do
  var cols = {}, nextId = {}, dropped = [];
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) nextId[t] = Math.max(Number(q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0].m || 0), 9000000); return ++nextId[t]; }
  function apply(ops) {
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t);
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id'; if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k].replace(/\{\{opref:(\d+)\}\}/g, function (m, d) { return String(ids[Number(d)]); }) : f[k]; f[k] = fix(f[k]); if (cs.indexOf(k) < 0) { dropped.push(t + '.' + k); delete f[k]; } });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  function saveOrder(fields) { var r = ML.run(q, env(), { table: 'pp_order', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'pp_order', fields) }); if (r.ok) apply(r.ops); return r; }
  var FSM = require(path.join(ERP, 'ad_docfsm.js')); var BUNDLES = {}, tokens = {}, ops = [];
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function (t) { ops.push(t); return ops.length; } }, modelval: MV, callout: AC, process: AP, postTokens: tokens, docAction: ML, docClass: DP, docFsm: FSM,
    import: function (u) { return import(u); } };
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });   // idempiere.html's order
  AC.RUNTIME.registerSqlFunctions(function (n, fn) { db.create_function(n, fn); });   // crud_overlay.js:364 - pricing needs bomPriceStd ... (the instrument gap §SUBCONTRACT found)
  ['model_ctor', 'model_invoice'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} });
  var one = function (sql, p) { return q(sql, p || [])[0] || null; };
  var URL = 'file://' + path.join(ERP, 'plugins', 'libero_manufacturing.mjs'), reg = PR.create(host);
  mute(); await reg.installBundle(URL); await reg.startBundle('org.idempiere.mfg'); unmute();
  var pend = reg.hasPending({ table: 'c_order' }), st0 = reg.get('org.idempiere.mfg').state;
  mute(); await reg.need({ table: 'c_order' }); unmute(); var st1 = reg.get('org.idempiere.mfg').state;
  _log('§LMTO-M0 after START state=' + st0 + ' pending(c_order)=' + pend + ' -> after need(c_order) state=' + st1 + ' hooks c_orderline=' + JSON.stringify(Object.keys((MV.REGISTRY.c_orderline || {}))));
  check('CH0 C_Order is a lazy trigger (MFG_Validator registers it): STARTING with c_order pending, the first c_order demand ACTIVATES the bundle and its c_orderline hooks are live', st0 === 'STARTING' && pend === true && st1 === 'ACTIVE' && !!(MV.REGISTRY.c_orderline && MV.REGISTRY.c_orderline.AFTER_NEW), { st0: st0, pend: pend, st1: st1 });
  if (BREAK === 'ferry') (await import('file://' + path.join(ERP, 'plugins', 'libero_pporder.mjs'))).SOURCE.ferryStatic = true;
  function save(table, fields) { var t0 = new ML.Trx(q, env()), r = ML.run(q, env(), { table: table, timing: 'SAVE', changes: ML.newPO(t0, table, fields) }); if (r.ok) apply(r.ops); return r; }
  db.run("UPDATE pp_product_bom SET bomtype='O', bomuse='M' WHERE pp_product_bom_id=50005");   // LABELLED FIXTURE
  var DAY = '2026-10-15 00:00:00', PROM = '2026-10-20 00:00:00';
  var h = save('c_order', { ad_org_id: 50001, c_doctypetarget_id: 132, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108, bill_bpartner_id: 112, bill_location_id: 108, m_warehouse_id: 50002, m_pricelist_id: 101, c_currency_id: 100,
    c_paymentterm_id: 105, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I', dateordered: DAY, dateacct: DAY, datepromised: PROM, docstatus: 'DR', docaction: 'CO',
    totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', istaxincluded: 'N', isdropship: 'N', isselected: 'N', sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' });
  var soId = one('SELECT MAX(c_order_id) AS id FROM c_order').id, so = one('SELECT * FROM c_order WHERE c_order_id=?', [soId]);
  var ln = save('c_orderline', { c_order_id: soId, ad_org_id: 50001, m_product_id: 50007, qtyentered: 10, qtyordered: 10, c_tax_id: 104, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N', datepromised: PROM, dateordered: DAY });
  var olId = one('SELECT MAX(c_orderline_id) AS id FROM c_orderline WHERE c_order_id=?', [soId]).id;
  var co = ML.run(q, env(), { table: 'c_order', timing: 'DOCACTION', id: soId, action: 'CO' }); if (co.ok) apply(co.ops);
  (co.log || []).filter(function (l) { return /LIBERO-MTO|LIBERO-MRP|ERR|DEFERRED/.test(l); }).slice(0, 12).forEach(function (l) { _log('    ' + String(l).slice(0, 260)); });
  var mo = one('SELECT * FROM pp_order WHERE c_orderline_id=?', [olId]), soSt = one('SELECT docstatus AS s FROM c_order WHERE c_order_id=?', [soId]).s;
  _log('§LMTO-M1 SO ' + so.documentno + ' header ok=' + h.ok + ' line ok=' + ln.ok + ' (' + (ln.msg || ln.error || '') + ') complete ok=' + co.ok + ' (' + (co.msg || '') + ') status=' + soSt + ' MO=' + JSON.stringify(mo && { no: mo.documentno, p: mo.m_product_id, q: mo.qtyordered, wh: mo.m_warehouse_id, res: mo.s_resource_id, bom: mo.pp_product_bom_id, wf: mo.ad_workflow_id, pl: mo.planner_id, org: mo.ad_org_id, pr: mo.priorityrule, da: mo.docaction, ds: mo.docstatus, d: mo.description, st: mo.datestartschedule, fi: mo.datefinishschedule }));
  check('M1 completing the sales order creates ONE Manufacturing Order for the line: product 50007, qty 10, warehouse 50002, plant 50000, BOM 50005, workflow 50017 (from planning 50089), planner 101, org 50001, priority 3, Drafted with DocAction CO, description "Make-To-Order <C_Order_ID> : <SO no>"',
    co.ok && soSt === 'CO' && !!mo && Number(mo.m_product_id) === 50007 && Number(mo.qtyordered) === 10 && Number(mo.m_warehouse_id) === 50002 && Number(mo.s_resource_id) === 50000 && Number(mo.pp_product_bom_id) === 50005 && Number(mo.ad_workflow_id) === 50017 && Number(mo.planner_id) === 101 && Number(mo.ad_org_id) === 50001 && mo.priorityrule === '3' && mo.docaction === 'CO' && mo.docstatus === 'DR' && /^Make-To-Order .+ : /.test(String(mo.description)) && String(mo.description).indexOf(so.documentno) > 0,
    { co: co.msg, mo: mo });
  if (!mo) { _log('§LMTO-VERDICT FAIL (no MO)'); process.exit(1); }
  var bl = q('SELECT m_product_id AS p, qtyrequiered AS q FROM pp_order_bomline WHERE pp_order_id=?', [mo.pp_order_id]);
  check('M2 the MO exploded its BOM (MPPOrder.afterSave): ' + bl.length + ' component lines', bl.length >= 2, bl);
  // hand: Packing node 50092 (resource 50006, type Work Center: date slot, no time slot); 6 s; day 2026-10-20 ends at its 00:00 (the first day ends at the promise) -> 0 ms -> the previous day: start 23:59:53
  var sm = one("SELECT * FROM pp_mrp WHERE c_orderline_id=? AND ordertype='SOO'", [olId]);
  _log('§LMTO-M3 SO MRP row ' + JSON.stringify(sm && { o: sm.pp_order_id, s: sm.docstatus, st: sm.datestartschedule, fi: sm.datefinishschedule, res: sm.s_resource_id }));
  check('M3 the SO demand row points at the MO, In Progress, scheduled start 2026-10-19 23:59:53 (CRP backward, 6 s) and finish = DatePromised', sm && Number(sm.pp_order_id) === Number(mo.pp_order_id) && sm.docstatus === 'IP' && String(sm.datestartschedule).slice(0, 19) === '2026-10-19 23:59:53' && String(sm.datefinishschedule).slice(0, 19) === PROM, sm);
  var ra = q('SELECT * FROM s_resourceassignment WHERE name LIKE ?', ['MRP:' + (sm && sm.pp_mrp_id) + ' Order:%']);
  _log('§LMTO-M4 all assignments ' + JSON.stringify(q('SELECT name, s_resource_id FROM s_resourceassignment ORDER BY s_resourceassignment_id DESC LIMIT 3')));
  _log('§LMTO-M4 resource assignments ' + JSON.stringify(ra.map(function (r) { return { n: r.name, res: r.s_resource_id, f: r.assigndatefrom, t: r.assigndateto, q: r.qty, d: r.description }; })));
  check('M4 ONE resource assignment on the routing resource 50006: name "MRP:<id> Order:<SO no>", from = to = 2026-10-19 23:59:53 (0 minutes), qty 0 hours, description "Fertilizer #70 10"', ra.length === 1 && Number(ra[0].s_resource_id) === 50006 && ra[0].name === 'MRP:' + sm.pp_mrp_id + ' Order:' + so.documentno && String(ra[0].assigndatefrom).slice(0, 19) === '2026-10-19 23:59:53' && String(ra[0].assigndateto).slice(0, 19) === '2026-10-19 23:59:53' && Number(ra[0].qty) === 0 && /^Fertilizer #70 10$/.test(String(ra[0].description)), ra);
  check('M5 the MO\'s start/finish schedule = the assignment start (+0 minutes)', String(mo.datestartschedule).slice(0, 19) === '2026-10-19 23:59:53' && String(mo.datefinishschedule).slice(0, 19) === '2026-10-19 23:59:53', { st: mo.datestartschedule, fi: mo.datefinishschedule });
  var moMrp = q("SELECT ordertype AS t, typemrp AS m, c_order_id AS o, c_orderline_id AS l FROM pp_mrp WHERE pp_order_id=? AND ordertype='MOP'", [mo.pp_order_id]);
  _log('§LMTO-M6 MO MRP rows ' + JSON.stringify(moMrp));
  check('M6 the MO\'s own MRP rows carry the sales order and its line (the purpose of the upstream static)', moMrp.length >= 1 && moMrp.every(function (r) { return Number(r.o) === Number(soId) && Number(r.l) === Number(olId); }), moMrp);
  var fl = one('SELECT * FROM m_forecastline ORDER BY m_forecastline_id LIMIT 1'); db.run('DELETE FROM pp_mrp WHERE m_forecastline_id=?', [fl.m_forecastline_id]);
  var rf = ML.run(q, env(), { table: 'm_forecastline', timing: 'PROCESS', fn: function (trx) { var e = MV.fireHooks('AFTER_NEW', { table: 'm_forecastline', record: fl }, { trx: trx }); if (e && !e.ok) throw new Error(e.error); return { ok: true }; } }); if (rf.ok) apply(rf.ops);
  var fm = one('SELECT c_order_id AS o, c_orderline_id AS l FROM pp_mrp WHERE m_forecastline_id=?', [fl.m_forecastline_id]);
  _log('§LMTO-M7 an unrelated forecast MRP row made AFTER the MTO: ' + JSON.stringify(fm));
  check('M7 DECLARED DEVIATION: an unrelated MRP row made afterwards (a forecast line) does NOT carry the sales order (upstream leaks it through the static)', rf.ok && fm && !fm.o && !fm.l, fm);
  var sol = one('SELECT description AS d FROM c_orderline WHERE c_orderline_id=?', [olId]);
  check('M8 the SO line description names the MO: " Make-To-Order <PP_Order_ID> : <MO no>"', new RegExp('Make-To-Order .+ : ' + mo.documentno + '$').test(String(sol.d)), sol);
  // ── MAKE-TO-KIT: MFG_Validator.updateMPPOrder :376-445 + MPPOrder.updateMakeToKit :1709-1812. LABELLED FIXTURE: BOM 50005 -> BOMType K; stock at locator 50001: KG 1000, BAG 100, FG 10
  db.run("UPDATE pp_product_bom SET bomtype='K' WHERE pp_product_bom_id=50005");
  // Libero costing needs Standard (the lane's named prerequisite, W-LIBERO-COST fixture): the three products' categories -> S, Material standard KG 2.5 / BAG 0.4
  q('SELECT DISTINCT m_product_category_id AS c FROM m_product WHERE m_product_id IN (50007,50008,50014,50024)').forEach(function (r) { db.run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=?", [r.c]); });
  [[50008, 2.5], [50014, 0.4]].forEach(function (r) { db.run('UPDATE m_cost SET currentcostprice=? WHERE m_product_id=? AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0', [r[1], r[0]]); });
  [[50008, 1000], [50014, 100], [50007, 10]].forEach(function (r, i) { db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50001,'Y',50001,?,0,?,'2026-01-01 00:00:00',?)", [r[0], r[1], 'mtk-fixture-' + i]); });
  var h2 = save('c_order', { ad_org_id: 50001, c_doctypetarget_id: 132, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108, bill_bpartner_id: 112, bill_location_id: 108, m_warehouse_id: 50002, m_pricelist_id: 101, c_currency_id: 100,
    c_paymentterm_id: 105, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'F', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I', dateordered: DAY, dateacct: DAY, datepromised: PROM, docstatus: 'DR', docaction: 'CO',
    totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', istaxincluded: 'N', isdropship: 'N', isselected: 'N', sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' });
  var so2 = one('SELECT MAX(c_order_id) AS id FROM c_order').id;
  save('c_orderline', { c_order_id: so2, ad_org_id: 50001, m_product_id: 50007, qtyentered: 4, qtyordered: 4, c_tax_id: 104, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N', datepromised: PROM, dateordered: DAY });
  var ol2 = one('SELECT MAX(c_orderline_id) AS id FROM c_orderline WHERE c_order_id=?', [so2]).id;
  var co2 = ML.run(q, env(), { table: 'c_order', timing: 'DOCACTION', id: so2, action: 'CO' }); if (co2.ok) apply(co2.ops);
  var mo2 = one('SELECT * FROM pp_order WHERE c_orderline_id=?', [ol2]), mb2 = mo2 && one('SELECT bomtype AS t FROM pp_order_bom WHERE pp_order_id=?', [mo2.pp_order_id]);
  check('MK1 a Make-to-Kit sales order line creates its MO (BOM copied as type K, description "Make-To-Kit ...")', co2.ok && !!mo2 && mb2 && mb2.t === 'K' && /^Make-To-Kit /.test(String(mo2.description)), { co: co2.msg, mo: mo2 && mo2.description, bom: mb2 });
  if (!mo2) { _log('§LMTO-VERDICT FAIL (no kit MO)'); process.exit(1); }
  var pr = ML.run(q, env(), { table: 'pp_order', timing: 'DOCACTION', id: mo2.pp_order_id, action: 'PR' }); if (pr.ok) apply(pr.ops);
  var st2 = one('SELECT docstatus AS s FROM pp_order WHERE pp_order_id=?', [mo2.pp_order_id]).s;
  check('MK2 the kit MO is prepared (In Progress) - upstream creates it Drafted, the shipment completes only an IP/CO kit order', pr.ok && st2 === 'IP', { pr: pr.msg, st: st2 });
  var hs = save('m_inout', { ad_org_id: 50001, c_doctype_id: 120, issotrx: 'Y', movementtype: 'C-', c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 50002, c_order_id: so2, movementdate: DAY, dateacct: DAY, docstatus: 'DR', docaction: 'CO',
    deliveryrule: 'F', deliveryviarule: 'P', freightcostrule: 'I', priorityrule: '5', processed: 'N', posted: 'N', isapproved: 'N', isintransit: 'N', isprinted: 'N', isinvoiced: 'N', sendemail: 'N', isdropship: 'N' });
  var shId = one('SELECT MAX(m_inout_id) AS id FROM m_inout').id;
  var ls = save('m_inoutline', { m_inout_id: shId, ad_org_id: 50001, line: 10, m_product_id: 50007, c_uom_id: 100, qtyentered: 4, movementqty: 4, m_locator_id: 50001, c_orderline_id: ol2, m_attributesetinstance_id: 0, isdescription: 'N', processed: 'N', isinvoiced: 'N' });
  var cs = ML.run(q, env(), { table: 'm_inout', timing: 'DOCACTION', id: shId, action: 'CO' }); if (cs.ok) apply(cs.ops);
  (cs.log || []).filter(function (l) { return /LIBERO-MTO|ERR|DEFERRED|refus/i.test(l); }).slice(0, 8).forEach(function (l) { _log('    ' + String(l).slice(0, 260)); });
  var mo2b = one('SELECT docstatus AS s, qtydelivered AS qd FROM pp_order WHERE pp_order_id=?', [mo2.pp_order_id]), kc = q("SELECT costcollectortype AS t, m_product_id AS p, movementqty AS q, docstatus AS s FROM pp_cost_collector WHERE pp_order_id=? ORDER BY pp_cost_collector_id", [mo2.pp_order_id]);
  _log('§LMTO-MK3 shipment header ok=' + hs.ok + ' line ok=' + ls.ok + ' (' + (ls.msg || ls.error || '') + ') complete ok=' + cs.ok + ' (' + (cs.msg || '') + ') kit MO=' + JSON.stringify(mo2b) + ' collectors=' + JSON.stringify(kc));
  // hand: 4 shipped x QtyMultiplier: KG 70 -> 280, BAG 1 -> 4 (scrap 0 as upstream passes Env.ZERO); receipt 4; QtyDelivered 4 = QtyOrdered -> closeIt
  var iss = function (p) { return kc.filter(function (c) { return c.t === '110' && Number(c.p) === p; }).reduce(function (a, c) { return a + Number(c.q); }, 0); };
  check('MK3 completing the customer shipment of 4 completes the kit MO, issues KG 280 + BAG 4, receives 4 and closes it (QtyDelivered 4)', cs.ok && mo2b.s === 'CL' && Number(mo2b.qd) === 4 && iss(50008) === 280 && iss(50014) === 4 && kc.some(function (c) { return c.t === '100' && Number(c.q) === 4 && c.s === 'CO'; }), { cs: cs.msg, mo: mo2b, kc: kc });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; _log('§LMTO-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LMTO-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
