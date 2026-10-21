#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-MFG-TRACE (spec prompts/mfg/LIBERO_TRACE_M9_SPEC.md). READ THE LOG after every run: verdict = §MTRACE-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: milestone M9 - forward and backward LOT genealogy derives from the cost collectors (their M_Transaction lots), and an exported slice verifies; altering one collector
//   breaks it. Fixture = W-LIBERO-BACKFLUSH's (order 100 x Fertilizer, BOM KG 70 + BAG 1, Standard prices) with KG stocked in TWO lots: 4000 @ ASI 9001 (older) + 6000 @ ASI 9002.
//   A second order LT-B consumes ONLY lot 9002. Break (MUST exit 1): LTRACE_BREAK=nolot (moves matched by product alone, the lot ignored: genealogy leaks across lots)
'use strict';
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LTRACE_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §MTRACE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} }); });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js')), DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); ['model_ctor', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} });
  globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelAsi = require(path.join(ERP, 'model_asi.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));
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
  var SIGN = require(path.join(ERP, 'erp_snapshot_sign.js'));
  if (BREAK === 'nolot') COSTMOD.SOURCE.traceByLot = false;
  function inTrx(fn) { var trx = new ML.Trx(q, env()); return fn(trx); }
  fixtureStock([{ asi: 9001, qty: 4000, date: '2026-01-01 00:00:00' }, { asi: 9002, qty: 6000, date: '2026-02-01 00:00:00' }], 500);
  var OT = newCompletedOrder('LT-A'), rT = runProcess(OT.pp_order_id, { rule: 'BackFlush', movementDate: DATE });
  var rc = q("SELECT t.m_attributesetinstance_id AS lot, t.movementqty AS q FROM m_transaction t JOIN pp_cost_collector c ON c.pp_cost_collector_id=t.pp_cost_collector_id WHERE c.pp_order_id=? AND c.costcollectortype='100'", [OT.pp_order_id])[0];
  log('§MTRACE-T0 backflush ok=' + rT.ok + ' msg=' + (rT.msg || '') + ' collectors=' + JSON.stringify(ccs(OT.pp_order_id).map(function (c) { return c.t + ':' + c.qty + '@' + c.asi; })) + ' receipt move=' + JSON.stringify(rc));
  check('T0 the backflush issues KG from both lots and receives the finished goods into a NEW lot (StorageEngine: a fresh ASI per receipt)', rT.ok && rc && S(rc.lot) > 0 && S(rc.lot) !== 9001 && S(rc.lot) !== 9002 && close(rc.q, 100), { ok: rT.ok, msg: rT.msg, rc: rc });
  if (!rc) { log('§MTRACE-VERDICT INCONCLUSIVE no receipt lot'); process.exit(3); }
  var L = S(rc.lot);
  fixtureStock([{ asi: 9002, qty: 8000, date: '2026-02-01 00:00:00' }], 500);
  var OB = newCompletedOrder('LT-B'), rB = runProcess(OB.pp_order_id, { rule: 'BackFlush', movementDate: DATE });
  var rc2 = q("SELECT t.m_attributesetinstance_id AS lot FROM m_transaction t JOIN pp_cost_collector c ON c.pp_cost_collector_id=t.pp_cost_collector_id WHERE c.pp_order_id=? AND c.costcollectortype='100'", [OB.pp_order_id])[0], L2 = rc2 ? S(rc2.lot) : -1;
  log('§MTRACE-T0b second order LT-B ok=' + rB.ok + ' collectors=' + JSON.stringify(ccs(OB.pp_order_id).map(function (c) { return c.t + ':' + c.qty + '@' + c.asi; })) + ' lot=' + L2);
  var back = inTrx(function (trx) { return lib.genealogy(trx, FG, L, 'back'); });
  var bl = back.links.map(function (e) { return e.product + '@' + e.lot + ':' + e.qty; }).sort();
  log('§MTRACE-T1 backward FG@' + L + ' -> ' + JSON.stringify(bl));
  // hand: toDeliver 100 -> KG 100 x 70 = 7000 FIFO: 4000 @9001 then 3000 @9002 ; BAG 100 x 1 = 100 @0 ; the moves are negative (issues)
  check('T1 BACKWARD from the finished lot: exactly KG 4000 @9001, KG 3000 @9002 and BAG 100 @0 (the order\'s issue moves)', JSON.stringify(bl) === JSON.stringify([BAG + '@0:-100', KG + '@9001:-4000', KG + '@9002:-3000'].sort()), bl);
  var fwd = inTrx(function (trx) { return lib.genealogy(trx, KG, 9001, 'fwd'); }), fl = fwd.links.map(function (e) { return e.product + '@' + e.lot + ':' + e.qty + ' via ' + e.via; });
  log('§MTRACE-T2 forward KG@9001 -> ' + JSON.stringify(fl));
  check('T2 FORWARD from component lot KG@9001: the finished lot FG@' + L + ' qty 100 of order LT-A', fwd.links.length === 1 && S(fwd.links[0].product) === FG && S(fwd.links[0].lot) === L && fwd.links[0].qty === '100' && S(fwd.links[0].order) === S(OT.pp_order_id), fl);
  // the exported slice: canonical JSON of both directions, signed ECDSA P-256 (erp_snapshot_sign.js)
  var kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  var jPriv = await crypto.subtle.exportKey('jwk', kp.privateKey), jPub = await crypto.subtle.exportKey('jwk', kp.publicKey);   // erp_snapshot_sign takes JWK keys (the W-MFG-OWN signer)
  var ex = inTrx(function (trx) { return lib.exportSlice(trx, FG, L); }), sig = await SIGN.signTip(jPriv, ex.text);
  var f2 = inTrx(function (trx) { return lib.genealogy(trx, KG, 9002, 'fwd'); }).links.map(function (e) { return e.product + '@' + e.lot + ':' + e.qty; }).sort();
  var b2 = inTrx(function (trx) { return lib.genealogy(trx, FG, L2, 'back'); }).links.map(function (e) { return e.product + '@' + e.lot + ':' + e.qty; }).sort();
  log('§MTRACE-T2b forward KG@9002 -> ' + JSON.stringify(f2) + ' ; backward FG@' + L2 + ' -> ' + JSON.stringify(b2));
  // hand: lot 9002 fed BOTH orders -> forward = FG@L (100) and FG@L2 (100); LT-B took KG 7000 all from 9002 + BAG 100 -> backward FG@L2 = KG@9002 -7000, BAG@0 -100 (nothing from 9001)
  check('T2b lot 9002 fed both orders (forward: FG@' + L + ' and FG@' + L2 + '), while LT-B\'s finished lot traces back ONLY to KG@9002 7000 + BAG 100 (no leak from lot 9001)', rB.ok && JSON.stringify(f2) === JSON.stringify([FG + '@' + L + ':100', FG + '@' + L2 + ':100'].sort()) && JSON.stringify(b2) === JSON.stringify([BAG + '@0:-100', KG + '@9002:-7000'].sort()), { f2: f2, b2: b2 });
  var v1 = inTrx(function (trx) { return lib.verifySlice(trx, ex.slice); }), s1 = await SIGN.verifyTip(ex.text, sig, jPub);
  log('§MTRACE-T3 slice bytes=' + ex.text.length + ' sha-ok sig=' + s1 + ' recompute=' + JSON.stringify(v1));
  check('T3 the exported slice verifies: its signature holds and recomputing it from the collectors gives the same bytes', v1.ok === true && s1 === true, { v1: v1, s1: s1 });
  // T4 the contract's break: alter ONE collector (the KG@9001 issue's MovementQty) -> the slice no longer matches the collectors
  var kg1 = one("SELECT pp_cost_collector_id AS id, movementqty AS q FROM pp_cost_collector WHERE pp_order_id=? AND m_product_id=? AND m_attributesetinstance_id=9001", [OT.pp_order_id, KG]);
  db.run('UPDATE pp_cost_collector SET movementqty=? WHERE pp_cost_collector_id=?', [S(kg1.q) - 1, kg1.id]);
  var v2 = inTrx(function (trx) { return lib.verifySlice(trx, ex.slice); });
  db.run('UPDATE pp_cost_collector SET movementqty=? WHERE pp_cost_collector_id=?', [kg1.q, kg1.id]);
  log('§MTRACE-T4 altered collector ' + kg1.id + ' qty ' + kg1.q + ' -> ' + (S(kg1.q) - 1) + ' verify=' + JSON.stringify(v2));
  check('T4 altering one collector breaks the slice: verifySlice is false and names the difference (ccQty 4000 vs 3999)', v2.ok === false && /3999/.test(String(v2.now)) && /4000/.test(String(v2.was)), v2);
  var v3 = inTrx(function (trx) { return lib.verifySlice(trx, ex.slice); });
  check('T5 restored: the slice verifies again (the comparison is deterministic, not a one-way latch)', v3.ok === true, v3);
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§MTRACE-VERDICT ' + v + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§MTRACE-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
