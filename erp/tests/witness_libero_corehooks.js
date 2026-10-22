#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-COREHOOKS (spec prompts/mfg/LIBERO_CORE_HOOKS_SPEC.md). READ THE LOG after every run: verdict = §LCORE-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: MFG_Validator's core-table hooks (C_Order/C_OrderLine/M_Requisition*/M_Forecast*, the MProduct UOM guard) keep PP_MRP in step with sales, purchasing, requisitions
//   and forecasts once the Manufacturing bundle is ACTIVE - through the real plugin START (lazy) and the registered validators. Oracle: the 50 legacy FCT rows of the seed (re-derived, field by field);
//   the rest hand-computed from MPPMRP (spec). Break (MUST exit 1): LCORE_BREAK=nofct (forecast-line hook off)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var initSqlJs, REAL = false; try { initSqlJs = require('sql.js'); REAL = true; } catch (e) { try { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); REAL = true; } catch (e2) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); } }
var BREAK = process.env.LCORE_BREAK || '', judged = 0, fails = 0, inconclusive = 0;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(n, ok, info) { judged++; if (!ok) fails++; _log('  §LCORE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
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
  _log('§LCORE-CH0 after START state=' + st0 + ' pending(c_order)=' + pend + ' -> after need(c_order) state=' + st1 + ' hooks c_orderline=' + JSON.stringify(Object.keys((MV.REGISTRY.c_orderline || {}))));
  check('CH0 C_Order is a lazy trigger (MFG_Validator registers it): STARTING with c_order pending, the first c_order demand ACTIVATES the bundle and its c_orderline hooks are live', st0 === 'STARTING' && pend === true && st1 === 'ACTIVE' && !!(MV.REGISTRY.c_orderline && MV.REGISTRY.c_orderline.AFTER_NEW), { st0: st0, pend: pend, st1: st1 });
  if (BREAK === 'nofct') { var arr = (MV.REGISTRY.m_forecastline || {}).AFTER_NEW || []; arr.splice(0, arr.length); }
  function inProcess(fn) { var r = ML.run(q, env(), { table: 'c_order', timing: 'PROCESS', fn: function (trx) { return fn(trx) || { ok: true }; } }); if (r.ok) apply(r.ops); return r; }
  function fireNew(table, row) { return inProcess(function (trx) { var e = MV.fireHooks('AFTER_NEW', { table: table, record: row }, { trx: trx }); if (e && !e.ok) throw new Error(e.error || e.blocked); }); }
  // CH1 ORACLE - the legacy FCT rows (MPPMRP.M_ForecastLine :769-795) re-derived from their forecast lines through the AFTER_NEW hook
  var CMP = ['ordertype', 'typemrp', 'm_forecast_id', 'm_forecastline_id', 'description', 'name', 'ad_org_id', 'datepromised', 'datestartschedule', 'datefinishschedule', 'dateordered', 'm_warehouse_id', 'm_product_id', 'qty', 'docstatus', 'value', 'isavailable', 'ad_client_id'];
  var legacy = q("SELECT * FROM pp_mrp WHERE ordertype='FCT' ORDER BY m_forecastline_id"); db.run("DELETE FROM pp_mrp WHERE ordertype='FCT'");
  var SEED_DELTA = { value: 'the current source ctor setValue("MRP") (MPPMRP :637-640); the 2008 seed rows hold the PP_MRP_ID (older Libero) - declared delta, the source is the oracle (slice 1 owner decision)' }, dcount = {};
  var nOk = 0, diffs = [], errs = [];
  legacy.forEach(function (L) {
    var fl = one('SELECT * FROM m_forecastline WHERE m_forecastline_id=?', [L.m_forecastline_id]); if (!fl) { errs.push(L.m_forecastline_id + ': no forecast line'); return; }
    var r = fireNew('m_forecastline', fl); if (!r.ok) { errs.push(L.m_forecastline_id + ': ' + r.msg); return; }
    var T = one("SELECT * FROM pp_mrp WHERE ordertype='FCT' AND m_forecastline_id=?", [L.m_forecastline_id]); if (!T) { diffs.push(L.m_forecastline_id + ': no row'); return; }
    var d = CMP.filter(function (c) { var a = L[c], b = T[c]; if (/date/.test(c)) { a = a == null ? a : String(a).slice(0, 10); b = b == null ? b : String(b).slice(0, 10); } return String(a == null ? '' : a) !== String(b == null ? '' : b) && !(Number(a) === Number(b) && a != null && b != null); });
    d.forEach(function (c) { dcount[c] = (dcount[c] || 0) + 1; }); d = d.filter(function (c) { return !SEED_DELTA[c]; });
    if (d.length) diffs.push(L.m_forecastline_id + ': ' + d.map(function (c) { return c + ' legacy=' + L[c] + ' twin=' + T[c]; }).join('; ')); else nOk++;
  });
  Object.keys(dcount).forEach(function (c) { _log('§LIBERO-SEED-DELTA pp_mrp.' + c + ' rows=' + dcount[c] + (SEED_DELTA[c] ? ' DECLARED: ' + SEED_DELTA[c] : ' NOT DECLARED')); });
  _log('§LCORE-CH1 forecast oracle: legacy rows=' + legacy.length + ' equal=' + nOk + ' diffs=' + diffs.length + (diffs.length ? ' first=' + diffs.slice(0, 3).join(' | ') : '') + (errs.length ? ' errs=' + errs.slice(0, 2).join(' | ') : ''));
  check('CH1 ORACLE: every legacy forecast MRP row (' + legacy.length + ') is re-derived by the m_forecastline hook with the same ' + CMP.length + ' fields', legacy.length >= 40 && nOk === legacy.length && !errs.length, { nOk: nOk, diffs: diffs.slice(0, 4), errs: errs.slice(0, 2) });
  // CH2 a Standard Order (doc type 132): no MRP while Drafted (MFG_Validator: an SO line hooks only when the order is released); completing it releases the order -> one SOO/D demand row
  function save(table, fields) { var t0 = new ML.Trx(q, env()), r = ML.run(q, env(), { table: table, timing: 'SAVE', changes: ML.newPO(t0, table, fields) }); if (r.ok) apply(r.ops); return r; }
  var DAY = '2026-10-15 00:00:00';
  var h = save('c_order', { ad_org_id: 11, c_doctypetarget_id: 132, c_doctype_id: 0, issotrx: 'Y', c_bpartner_id: 112, c_bpartner_location_id: 108, bill_bpartner_id: 112, bill_location_id: 108, m_warehouse_id: 103, m_pricelist_id: 101, c_currency_id: 100,
    c_paymentterm_id: 105, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I', dateordered: DAY, dateacct: DAY, datepromised: DAY, docstatus: 'DR', docaction: 'CO',
    totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', istaxincluded: 'N', isdropship: 'N', isselected: 'N', sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' });
  var soId = one('SELECT MAX(c_order_id) AS id FROM c_order').id;
  var ln = save('c_orderline', { c_order_id: soId, ad_org_id: 11, m_product_id: 130, qtyentered: 3, qtyordered: 3, c_tax_id: 104, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N' });
  var solId = one('SELECT MAX(c_orderline_id) AS id FROM c_orderline WHERE c_order_id=?', [soId]).id, mDraft = q('SELECT * FROM pp_mrp WHERE c_orderline_id=?', [solId]);
  var co = ML.run(q, env(), { table: 'c_order', timing: 'DOCACTION', id: soId, action: 'CO' }); if (co.ok) apply(co.ops);
  var mSo = q('SELECT * FROM pp_mrp WHERE c_orderline_id=?', [solId]), soSt = one('SELECT docstatus AS s FROM c_order WHERE c_order_id=?', [soId]).s;
  _log('§LCORE-CH2 SO ' + soId + ' header ok=' + h.ok + ' line ok=' + ln.ok + ' (' + (ln.msg || ln.error || '') + ' ' + JSON.stringify((ln.log || []).filter(function (l) { return /ERR|SEVERE|DEFERRED|refus|LIBERO/.test(l); }).slice(0, 4)) + ') mrp while DR=' + mDraft.length + ' complete ok=' + co.ok + ' (' + (co.msg || '') + ') status=' + soSt + ' mrp after=' + JSON.stringify(mSo.map(function (m) { return { t: m.ordertype + '/' + m.typemrp, q: m.qty, s: m.docstatus, n: m.name, bp: m.c_bpartner_id, o: m.c_order_id }; })));
  check('CH2 a Standard Order line books NO MRP while the order is Drafted; completing the order (released) books ONE SOO/D row: qty 3, IP, name OrderLine, the order and partner 112', h.ok && ln.ok && mDraft.length === 0 && co.ok && soSt === 'CO' && mSo.length === 1 && mSo[0].ordertype === 'SOO' && mSo[0].typemrp === 'D' && Number(mSo[0].qty) === 3 && mSo[0].docstatus === 'IP' && mSo[0].name === 'OrderLine' && Number(mSo[0].c_bpartner_id) === 112 && Number(mSo[0].c_order_id) === Number(soId), { mDraft: mDraft.length, co: co.msg, soSt: soSt, mSo: mSo });
  // CH3 a Purchase Order line hooks at once (any status): POO/S, qty ordered - delivered, IP
  var hp = save('c_order', { ad_org_id: 11, c_doctypetarget_id: 126, c_doctype_id: 0, issotrx: 'N', c_bpartner_id: 120, c_bpartner_location_id: 109, bill_bpartner_id: 120, bill_location_id: 109, m_warehouse_id: 103, m_pricelist_id: 102, c_currency_id: 100,
    c_paymentterm_id: 105, salesrep_id: 101, paymentrule: 'P', invoicerule: 'I', deliveryrule: 'A', deliveryviarule: 'P', priorityrule: '5', freightcostrule: 'I', dateordered: DAY, dateacct: DAY, datepromised: DAY, docstatus: 'DR', docaction: 'CO',
    totallines: 0, grandtotal: 0, isapproved: 'N', processed: 'N', posted: 'N', isdiscountprinted: 'N', istaxincluded: 'N', isdropship: 'N', isselected: 'N', sendemail: 'N', isinvoiced: 'N', isdelivered: 'N', isprinted: 'N' });
  var poId = one('SELECT MAX(c_order_id) AS id FROM c_order').id;
  var lp = save('c_orderline', { c_order_id: poId, ad_org_id: 11, m_product_id: 136, qtyentered: 7, qtyordered: 7, c_tax_id: 104, priceentered: 0, priceactual: 0, pricelist: 0, qtydelivered: 0, qtyinvoiced: 0, qtyreserved: 0, line: 0, isdescription: 'N', processed: 'N' });
  var polId = one('SELECT MAX(c_orderline_id) AS id FROM c_orderline WHERE c_order_id=?', [poId]).id, mPo = q('SELECT * FROM pp_mrp WHERE c_orderline_id=?', [polId]);
  _log('§LCORE-CH3 PO line ok=' + lp.ok + ' (' + (lp.msg || lp.error || '') + ' ' + JSON.stringify((lp.log || []).filter(function (l) { return /ERR|SEVERE|DEFERRED|refus|LIBERO/.test(l); }).slice(0, 4)) + ') mrp=' + JSON.stringify(mPo.map(function (m) { return { t: m.ordertype + '/' + m.typemrp, q: m.qty, s: m.docstatus, n: m.name }; })));
  check('CH3 a Purchase Order line (Drafted) books ONE POO/S supply row at once: qty 7, IP, name OrderLine', lp.ok && mPo.length === 1 && mPo[0].ordertype === 'POO' && mPo[0].typemrp === 'S' && Number(mPo[0].qty) === 7 && mPo[0].docstatus === 'IP' && mPo[0].name === 'OrderLine', { lp: lp.msg, mPo: mPo });
  // CH4 the seed's requisition line -> POR/S: qty = Qty - QtyOrdered; status by the Ferry rules (Drafted requisition, nothing ordered -> DR)
  var rl = one('SELECT * FROM m_requisitionline ORDER BY m_requisitionline_id LIMIT 1'), rq = rl && one('SELECT * FROM m_requisition WHERE m_requisition_id=?', [rl.m_requisition_id]);
  db.run('DELETE FROM pp_mrp WHERE m_requisitionline_id=?', [rl.m_requisitionline_id]); var rr = fireNew('m_requisitionline', rl), mRq = q('SELECT * FROM pp_mrp WHERE m_requisitionline_id=?', [rl.m_requisitionline_id]);
  var wantQ = Number(rl.qty) - Number(rl.qtyordered || 0), wantS = rq.docstatus === 'CL' ? 'CO' : rq.docstatus === 'VO' ? 'VO' : wantQ === 0 ? 'CO' : Number(rl.qtyordered || 0) > 0 ? 'IP' : 'DR';
  _log('§LCORE-CH4 requisition line ' + rl.m_requisitionline_id + ' (req status ' + rq.docstatus + ', qty ' + rl.qty + ', ordered ' + rl.qtyordered + ') ok=' + rr.ok + ' mrp=' + JSON.stringify(mRq.map(function (m) { return { t: m.ordertype + '/' + m.typemrp, q: m.qty, s: m.docstatus, dp: m.datepromised, wh: m.m_warehouse_id }; })));
  check('CH4 a requisition line books ONE POR/S row: qty Qty - QtyOrdered = ' + wantQ + ', status ' + wantS + ', DatePromised = DateRequired, the requisition warehouse', rr.ok && mRq.length === 1 && mRq[0].ordertype === 'POR' && mRq[0].typemrp === 'S' && Number(mRq[0].qty) === wantQ && mRq[0].docstatus === wantS && String(mRq[0].datepromised).slice(0, 10) === String(rq.daterequired).slice(0, 10) && Number(mRq[0].m_warehouse_id) === Number(rq.m_warehouse_id), { rr: rr.msg, mRq: mRq, want: [wantQ, wantS] });
  // CH5 MProduct BEFORE_CHANGE: product 130 now has MRP rows -> changing its UOM is refused '@SaveUomError@'
  var p130 = one('SELECT * FROM m_product WHERE m_product_id=130'), ru = ML.run(q, env(), { table: 'm_product', timing: 'SAVE', id: 130, changes: { c_uom_id: Number(p130.c_uom_id) === 100 ? 101 : 100 } }), nMrp130 = Number(one('SELECT COUNT(*) AS n FROM pp_mrp WHERE m_product_id=130').n), u2 = one('SELECT c_uom_id AS u FROM m_product WHERE m_product_id=130').u;
  _log('§LCORE-CH5 UOM change of product 130 ok=' + ru.ok + ' msg=' + (ru.msg || ru.error || '') + ' uom stays ' + u2);
  if (ru.ok) apply(ru.ops);
  check('CH5 changing the UOM of a product that has MRP records (' + nMrp130 + ') is refused "@SaveUomError@" and nothing is written', nMrp130 > 0 && !ru.ok && /SaveUomError/.test(String(ru.msg || ru.error)) && Number(u2) === Number(p130.c_uom_id), { ok: ru.ok, msg: ru.msg || ru.error });
  // CH6 deleteMRP: deleting the requisition line removes its Drafted MRP row (DocStatus DR/VO rows of that key, :564-567)
  var rd = ML.run(q, env(), { table: 'm_requisitionline', timing: 'PROCESS', fn: function (trx) { var e = MV.fireHooks('BEFORE_DELETE', { table: 'm_requisitionline', record: rl }, { trx: trx }); if (e && !e.ok) throw new Error(e.error); return { ok: true }; } }); if (rd.ok) apply(rd.ops);
  var mAfter = q('SELECT * FROM pp_mrp WHERE m_requisitionline_id=?', [rl.m_requisitionline_id]);
  check('CH6 deleting the requisition line (BEFORE_DELETE -> deleteMRP) removes its ' + wantS + ' MRP row', rd.ok && (wantS === 'DR' || wantS === 'VO' ? mAfter.length === 0 : mAfter.length === 1), { rd: rd.msg, left: mAfter.length, st: wantS });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; _log('§LCORE-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LCORE-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
