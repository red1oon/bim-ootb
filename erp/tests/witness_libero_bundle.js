#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-BUNDLE (spec prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md). READ THE LOG after every run: verdict = §LIBERO-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: the Libero Manufacturing layer as a LAZY bundle (a) contributes no CODE while STARTING (only its 2Pack menu rows, so the trigger is reachable), (b) wakes on its first consumer, (c) when active makes ModelLayer.save of a pp_order write the child rows the Java
//   writes (pp_order_bom, pp_order_bomline, pp_mrp) through Trx, (d) when stopped leaves the base byte-identical with the data kept.  Oracle: the Libero Java (cites in libero_pporder.mjs) + the 2008 seed rows WHERE they agree;
//   every divergence between source and seed is printed as §LIBERO-SEED-DELTA and must be one of the declared three. Breaks (MUST exit 1): LIBERO_BREAK=uom|bomuse|eager|nostop|mrpfinish
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var initSqlJs, REAL = false; try { initSqlJs = require('sql.js'); REAL = true; } catch (e) { try { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); REAL = true; } catch (e2) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); } }
var BREAK = process.env.LIBERO_BREAK || '', judged = 0, fails = 0, inconclusive = 0;
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(n, ok, info) { judged++; if (!ok) fails++; _log('  §LIBERO ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }

(async function () {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var ok = 0, bad = 0; ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } }); });
  _log('§LIBERO-LOAD seed + patches statements ok=' + ok + ' failed=' + bad + ' sqljs=' + (REAL ? 'real' : 'bundled') + ' break=' + (BREAK || 'none'));
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js'));
  var DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js')), PA = require(path.join(ERP, 'ad_parser.js'));
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
        var f = Object.assign({}, o.fields), pk = t + '_id'; f[pk] = newId(t); ids[i] = f[pk];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) { dropped.push(t + '.' + k); delete f[k]; } });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + t + '_id=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + t + '_id=?', [fix(o.id)]);
    });
    return ids;
  }
  function saveOrder(fields) { var r = ML.run(q, env(), { table: 'pp_order', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'pp_order', fields) }); if (r.ok) apply(r.ops); return r; }
  var BUNDLES = {}, tokens = {}, ops = [];
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function (t) { ops.push(t); return ops.length; } }, modelval: MV, callout: AC, process: AP, postTokens: tokens, docAction: ML, docClass: DP,
    import: function (u) { return import(u); } };
  function dump() {   // everything the bundle can touch
    var mv = {}; Object.keys(MV.REGISTRY).sort().forEach(function (t) { mv[t] = {}; Object.keys(MV.REGISTRY[t]).sort().forEach(function (ti) { mv[t][ti] = MV.REGISTRY[t][ti].map(function (h) { return h.name; }); }); });
    var models = Object.keys(ML.MODEL).sort().map(function (t) { return t + ':' + Object.keys(ML.MODEL[t]).sort().join(','); });
    var menu = q('SELECT ad_menu_id AS i, isactive AS a, name AS n FROM ad_menu WHERE ad_menu_id IN (53014,53052,53053,53055) ORDER BY 1').map(function (r) { return r.i + r.a + r.n; });
    var s = JSON.stringify({ models: models, layers: ML.describe(), mv: mv, doc: DP.describeDocClasses(), menu: menu });
    return { s: s, h: djb(s), n: s.length, menu: menu.length };
  }
  var counts = function () { return ['pp_order', 'pp_order_bom', 'pp_order_bomline', 'pp_mrp'].map(function (t) { return t + '=' + q('SELECT COUNT(*) n FROM ' + t)[0].n; }).join(' '); };

  var URL = 'file://' + path.join(ERP, 'plugins', 'libero_manufacturing.mjs');
  if (BREAK) { var chunkMod = await import('file://' + path.join(ERP, 'plugins', 'libero_pporder.mjs')); if (BREAK === 'uom') chunkMod.SOURCE.uomPrecision = false; if (BREAK === 'bomuse') chunkMod.SOURCE.bomUseCopied = false; if (BREAK === 'mrpfinish') chunkMod.SOURCE.mrpFinishFromOrder = false; }
  var reg = PR.create(host), base = dump(), pre = counts();
  _log('§LIBERO-L0 baseline hash=' + base.h + ' bytes=' + base.n + ' menuRows=' + base.menu + ' rows: ' + pre);
  if (base.n < 300) { inconclusive++; _log('§LIBERO L0 INCONCLUSIVE — baseline dump is nearly empty'); }
  check('L0b base carries no EE01 menu rows (upstream ships them disabled) and no pp_order hooks', base.menu === 0 && !ML.MODEL.pp_order && !(MV.REGISTRY.pp_order && MV.REGISTRY.pp_order.AFTER_NEW), { menu: base.menu });

  // L1 install + START lazily
  mute(); await reg.installBundle(URL); var st = await reg.startBundle('org.idempiere.mfg'); if (BREAK === 'eager') await reg.need({ activateId: 'org.idempiere.mfg' }); unmute();
  var d1 = dump(), g1 = reg.get('org.idempiere.mfg');
  _log('§LIBERO-L1 after START: state=' + g1.state + ' policy=' + g1.activation + ' hash=' + d1.h + ' (baseline ' + base.h + ') hasPending(window 53009)=' + reg.hasPending({ window: 53009 }) + ' hasPending(table pp_order)=' + reg.hasPending({ table: 'pp_order' }));
  var bj = JSON.parse(base.s), dj = JSON.parse(d1.s), codeSame = ['models', 'layers', 'mv', 'doc'].every(function (k) { return JSON.stringify(bj[k]) === JSON.stringify(dj[k]); });
  var act1 = {}; q("SELECT ad_menu_id AS id FROM ad_menu WHERE isactive='Y' AND ad_menu_id IN (53014,53052,53053,53055)").forEach(function (r) { act1[r.id] = 1; });
  _log('§LIBERO-L1b STARTING: code registries identical to baseline=' + codeSame + ' | menu rows staged at START (2Pack part)=' + dj.menu.length + ' so the lazy window trigger is reachable before any code ran');
  check('L1 started LAZY: STARTING, NO code contributed (models/validators/doc classes == baseline), the 4 menu rows staged (the trigger is reachable), pending on window 53009 and table pp_order', g1.state === 'STARTING' && codeSame && dj.menu.length === 4 && Object.keys(act1).length === 4 && reg.hasPending({ window: 53009 }) && reg.hasPending({ table: 'PP_Order' }) && (BREAK !== 'eager'), { state: g1.state, codeSame: codeSame, menu: dj.menu.length });

  // L2 DEMAND: the window opens
  mute(); var act = await reg.need({ window: 53009 }); unmute();
  var d2 = dump(), g2 = reg.get('org.idempiere.mfg');
  var act2 = {}; q("SELECT ad_menu_id AS id, name FROM ad_menu WHERE isactive='Y'").forEach(function (r) { act2[r.id] = r; });
  var par = {}; q("SELECT node_id, parent_id FROM ad_treenodemm WHERE ad_tree_id=10 AND isactive='Y'").forEach(function (r) { par[r.node_id] = r.parent_id; });
  var chain = [], cur = 53055, broke = null, guard = 0; while (cur && guard++ < 12) { if (!act2[cur]) { broke = cur; break; } chain.push(act2[cur].name.trim()); cur = par[cur]; if (cur === undefined) { broke = 'no tree node'; break; } }
  var mw = q("SELECT ad_window_id AS w FROM ad_menu WHERE ad_menu_id=53055 AND action='W' AND isactive='Y'");
  _log('§LIBERO-L2 demand window 53009 activated=' + JSON.stringify(act) + ' state=' + g2.state + ' menu path(leaf->root)=' + chain.join(' < ') + (broke ? ' BROKEN at ' + broke : '') + ' hooks: model pp_order=' + !!ML.MODEL.pp_order + ' validators=' + JSON.stringify((MV.REGISTRY.pp_order || {}).AFTER_NEW && MV.REGISTRY.pp_order.AFTER_NEW.map(function (h) { return h.name; })));
  check('L2 the first consumer (window 53009) ACTIVATED the bundle: state ACTIVE, the 4-row menu path reaches the window, model + MRP validators live', g2.state === 'ACTIVE' && !broke && chain.length === 4 && mw.length === 1 && Number(mw[0].w) === 53009 && !!ML.MODEL.pp_order && !!ML.MODEL.pp_order_bomline && MV.REGISTRY.pp_order.AFTER_NEW.length >= 1, { state: g2.state, broke: broke, chain: chain });

  // L3 EXPLOSION - scenario A: QtyEntered unset (single explosion); inputs = the two legacy orders
  var LEG = [{ doc: '8000', oid: 50000, bom: 50004, product: 136 }, { doc: '8001', oid: 50001, bom: 50005, product: 50007 }], SKIP = /^(pp_order_bom_id|pp_order_bomline_id|pp_order_id|pp_mrp_id|pp_order_bom_uu|pp_order_bomline_uu|pp_mrp_uu|created|createdby|updated|updatedby|pp_order_bomline_id)$/;
  var NULL0 = 'an unset quantity stays NULL: the X_ ctor defaults are commented out in the source and the reference Postgres has no column DEFAULT (information_schema, 2026-10-15); the 2008 seed holds 0';
  var DELTA = { 'pp_order_bomline.qtyrequiered': 'source rounds QtyRequired to the UOM StdPrecision (MPPOrderBOMLine.setQtyRequired :330, beforeSave :163-168); the 2008 seed holds 8 dp', 'pp_order_bom.bomuse': 'source copies BOMUse from the template (MPPOrderBOM ctor :70-93); the 2008 seed holds M',
    'pp_order_bom.documentno': 'source setDocumentNo(bom.getValue()) (MPPOrderBOM ctor :89); the 2008 seed holds a sequence number', 'pp_order_bomline.qtyentered': 'source setQtyEntered(getQtyEntered()) writes 0 for an unset value (beforeSave :163), overriding the DB DEFAULT 1; the 2008 seed holds 1',
    'pp_order_bomline.qtydelivered': NULL0, 'pp_order_bomline.qtypost': NULL0, 'pp_order_bomline.qtyreject': NULL0, 'pp_order_bomline.qtyscrap': NULL0,
    'pp_order_bomline.qtyreserved': 'source reserveStock() books QtyReserved = QtyRequired - Reserved - Delivered for a STOCKED product (MPPOrderBOMLine :519-543, called from beforeSave :171-175); the 2008 seed holds 0',
    'pp_mrp.qty': 'MRP demand qty = QtyRequired - QtyDelivered (MPPMRP.PP_Order_BOMLine :996), so it follows the QtyRequired UOM-precision delta', 'pp_mrp.value': 'source MPPMRP ctor setValue("MRP") :640; the 2008 seed holds the sequence number',
    'pp_mrp.datesimulation': 'source stamps the transaction clock (:642); wall time is not replayable', 'pp_mrp.datefinishschedule': 'source copies o.getDateFinishSchedule() (:680); the 2008 seed supply row holds DateStartSchedule' };
  var cmp = 0, undeclared = [], deltaSeen = {}, created = {}, doubled = {};
  for (var oi = 0; oi < LEG.length; oi++) {
    var L = LEG[oi], lo = q('SELECT * FROM pp_order WHERE pp_order_id=?', [L.oid])[0];
    var fields = { ad_client_id: 11, ad_org_id: lo.ad_org_id, documentno: L.doc, m_product_id: lo.m_product_id, pp_product_bom_id: lo.pp_product_bom_id, ad_workflow_id: lo.ad_workflow_id, qtyordered: lo.qtyordered, qtybatchsize: lo.qtybatchsize,
      m_warehouse_id: lo.m_warehouse_id, c_uom_id: lo.c_uom_id, s_resource_id: lo.s_resource_id, datestartschedule: lo.datestartschedule, datefinishschedule: lo.datefinishschedule, datepromised: lo.datepromised, dateordered: lo.dateordered,
      docstatus: 'DR', docaction: 'CO', c_doctype_id: lo.c_doctype_id, c_doctypetarget_id: lo.c_doctypetarget_id };
    var m0 = counts(); mute(); var r = saveOrder(fields); unmute();
    if (!r.ok) { check('L3 ' + L.doc + ' save ok', false, { error: r.error || r.msg, log: (r.log || []).slice(0, 3) }); continue; }
    var newOrder = q('SELECT * FROM pp_order WHERE pp_order_id=(SELECT MAX(pp_order_id) FROM pp_order)')[0];
    var nb = q('SELECT * FROM pp_order_bom WHERE pp_order_id=?', [newOrder.pp_order_id]), nl = q('SELECT * FROM pp_order_bomline WHERE pp_order_id=? ORDER BY line', [newOrder.pp_order_id]);
    var lb = q('SELECT * FROM pp_order_bom WHERE pp_order_id=?', [L.oid]), ll = q('SELECT * FROM pp_order_bomline WHERE pp_order_id=? ORDER BY line', [L.oid]);
    created[L.doc] = { order: newOrder, boms: nb.length, lines: nl.length };
    function compare(table, got, want) {
      var keys = {}; Object.keys(want).forEach(function (k) { keys[k] = 1; }); Object.keys(got).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        if (SKIP.test(k)) return; var a = got[k], b = want[k]; if ((a == null || a === '') && (b == null || b === '')) return;
        cmp++; if (String(a) === String(b) || (typeof a === 'number' && typeof b === 'number' && a === b)) return;
        if (DELTA[table + '.' + k]) { deltaSeen[table + '.' + k] = true; _log('§LIBERO-SEED-DELTA order=' + L.doc + ' ' + table + '.' + k + ' source=' + a + ' seed=' + b + ' | ' + DELTA[table + '.' + k]); }
        else undeclared.push(L.doc + ' ' + table + '.' + k + ' source=' + a + ' seed=' + b);
      });
    }
    if (nb.length === 1 && lb.length === 1) compare('pp_order_bom', nb[0], lb[0]);
    if (nl.length === ll.length) nl.forEach(function (row, i) { compare('pp_order_bomline', row, ll[i]); });
    _log('§LIBERO-L3 order ' + L.doc + ': bom=' + nb.length + ' lines=' + nl.length + ' (legacy ' + lb.length + '/' + ll.length + ') | lines: ' + nl.map(function (x) { return x.line + ':' + x.m_product_id + ':' + x.qtyrequiered + x.componenttype; }).join(' ') + ' | rows ' + m0 + ' -> ' + counts());
    var mrp = q('SELECT * FROM pp_mrp WHERE pp_order_id=? ORDER BY typemrp DESC, pp_order_bomline_id', [newOrder.pp_order_id]), lm = q('SELECT * FROM pp_mrp WHERE pp_order_id=? ORDER BY typemrp DESC, pp_order_bomline_id', [L.oid]);
    created[L.doc].mrp = mrp.length;
    if (mrp.length === lm.length) mrp.forEach(function (row, i) { compare('pp_mrp', Object.assign({}, row, { pp_order_bomline_id: null }), Object.assign({}, lm[i], { pp_order_bomline_id: null })); });
  }
  _log('§LIBERO-L3 compared fields=' + cmp + ' declared-deltas-seen=' + Object.keys(deltaSeen).sort().join(',') + ' undeclared=' + undeclared.length);
  undeclared.slice(0, 20).forEach(function (u) { _log('  §LIBERO-UNDECLARED ' + u); });
  check('L3 explosion: both legacy orders re-created through ModelLayer.save -> bom 1 + lines 2 each; every field equals the legacy row or is one of the declared source-vs-seed deltas; population not empty', cmp > 40 && undeclared.length === 0 && created['8000'] && created['8000'].boms === 1 && created['8000'].lines === 2 && created['8001'].lines === 2, { cmp: cmp, undeclared: undeclared.slice(0, 6), created: created });
  check('L3b the declared deltas are the MEASURED ones (qtyrequiered, bomuse, qtyentered seen on the lines/header) - a delta that never occurs is not a delta', ['pp_order_bomline.qtyrequiered', 'pp_order_bom.bomuse', 'pp_order_bom.documentno'].every(function (k) { return deltaSeen[k]; }), Object.keys(deltaSeen));
  var kg = q("SELECT qtyrequiered FROM pp_order_bomline WHERE pp_order_id=? AND line=10", [created['8000'].order.pp_order_id])[0];
  check('L3c spot value from the Java formula: 100 x 50 / (1-1%) = 5050.50505051 -> UOM kilogram precision 2 -> 5050.51 (source), Each precision 0 line -> 100', kg && Number(kg.qtyrequiered) === 5050.51 && Number(q("SELECT qtyrequiered FROM pp_order_bomline WHERE pp_order_id=? AND line=20", [created['8000'].order.pp_order_id])[0].qtyrequiered) === 100, kg);

  // L4 MRP rows: counts and the supply/demand split; re-save without a relevant change adds nothing; quantity change updates the supply in place
  var oid = created['8000'].order.pp_order_id, mrp0 = q('SELECT typemrp, qty, datefinishschedule FROM pp_mrp WHERE pp_order_id=? ORDER BY typemrp DESC, pp_order_bomline_id', [oid]);
  _log('§LIBERO-L4 MRP of new order 8000: ' + JSON.stringify(mrp0) + ' legacy: ' + JSON.stringify(q('SELECT typemrp, qty, datefinishschedule FROM pp_mrp WHERE pp_order_id=50000 ORDER BY typemrp DESC, pp_order_bomline_id')));
  check('L4a MRP: one supply (S) for the order + one demand (D) per BOM line (qty = QtyRequired - QtyDelivered); supply Qty = QtyOrdered - QtyDelivered', mrp0.length === 3 && mrp0[0].typemrp === 'S' && Number(mrp0[0].qty) === 100 && mrp0.filter(function (m) { return m.typemrp === 'D'; }).length === 2 && Number(mrp0[1].qty) === 5050.51, mrp0);
  check('L4b supply DateFinishSchedule is the ORDER\'s DateFinishSchedule (MPPMRP.setPP_Order :680), the declared delta vs the seed\'s DateStartSchedule', mrp0[0].datefinishschedule === created['8000'].order.datefinishschedule && created['8000'].order.datefinishschedule !== created['8000'].order.datestartschedule, { got: mrp0[0].datefinishschedule, order: created['8000'].order.datefinishschedule });
  mute(); var rN = ML.run(q, env(), { table: 'pp_order', timing: 'SAVE', id: oid, changes: { description: 'cosmetic edit' } }); unmute();
  var mrpAfterNoop = q('SELECT COUNT(*) n FROM pp_mrp WHERE pp_order_id=?', [oid])[0].n;
  check('L4c a save that changes no MRP source column (Description only) creates/changes no MRP row (MPPMRP.isChanged :462)', rN.ok && mrpAfterNoop === 3 && !rN.ops.some(function (o) { return o.table === 'pp_mrp'; }), { ok: rN.ok, mrp: mrpAfterNoop, ops: rN.ops.map(function (o) { return o.table; }) });
  mute(); var rQ = ML.run(q, env(), { table: 'pp_order', timing: 'SAVE', id: oid, changes: { qtyordered: 250 } }); if (rQ.ok) apply(rQ.ops); unmute();
  var supply = q("SELECT qty FROM pp_mrp WHERE pp_order_id=? AND typemrp='S'", [oid]);
  check('L4d changing QtyOrdered updates the ONE supply row in place (getQuery(...).firstOnly), no second supply', rQ.ok && supply.length === 1 && Number(supply[0].qty) === 250, { ok: rQ.ok, error: rQ.error, supply: supply });

  // L5 refusals (beforeSave / explosion): nothing written
  function refused(label, fields, wantRe) {
    var m = counts(); mute(); var rr = saveOrder(Object.assign({ ad_client_id: 11, ad_org_id: 50006, documentno: 'X-' + label, m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 10, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datepromised: '2008-08-17 00:00:00' }, fields)); unmute();
    var txt = String(rr.error || rr.msg || ''); var nothing = counts() === m;
    _log('§LIBERO-L5 ' + label + ': ok=' + rr.ok + ' error="' + txt.slice(0, 90) + '" nothing-written=' + nothing);
    return !rr.ok && wantRe.test(txt) && nothing;
  }
  check('L5a order start BEFORE the BOM ValidFrom (2007-09-22) -> refused as BOMExpired, nothing written (MPPOrder.explosion :1046)', refused('expired', { datestartschedule: '2007-01-01 00:00:00' }, /BOMExpired/), {});
  check('L5b BOM of another product -> refused @NotMatch@ (explosion :1032-1036)', refused('mismatch', { m_product_id: 50007 }, /NotMatch/), {});
  var unv = q('SELECT isverified FROM m_product WHERE m_product_id=136')[0].isverified; db.run("UPDATE m_product SET isverified='N' WHERE m_product_id=136");
  check('L5c unverified product -> refused (explosion :1038-1042)', refused('unverified', {}, /not verified/), {}); db.run("UPDATE m_product SET isverified=? WHERE m_product_id=136", [unv]);
  check('L5d AD_Org_ID 0 with no context org -> refused (beforeSave :402-411)', (function () { var m = counts(); mute(); var rr = ML.run(q, Object.assign(env(), { org: 0 }), { table: 'pp_order', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'pp_order', { ad_client_id: 11, ad_org_id: 0, documentno: 'X-org', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 10, m_warehouse_id: 50002, datestartschedule: '2008-08-16 00:00:00' }) }); unmute(); return !rr.ok && /AD_Org_ID = 0/.test(String(rr.error || rr.msg)) && counts() === m; })(), {});
  // line effectivity (M4 over real tables): a BOM line whose ValidTo is before the start date is skipped
  var bl = q('SELECT pp_product_bomline_id AS id, validto FROM pp_product_bomline WHERE pp_product_bom_id=50004 AND line=20')[0]; db.run("UPDATE pp_product_bomline SET validto='2008-01-01 00:00:00' WHERE pp_product_bomline_id=?", [bl.id]);
  mute(); var rE = saveOrder({ ad_client_id: 11, ad_org_id: 50006, documentno: 'X-eff', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 10, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datepromised: '2008-08-17 00:00:00' }); unmute();
  var effOrder = q("SELECT pp_order_id FROM pp_order WHERE documentno='X-eff'")[0], effLines = effOrder ? q('SELECT line FROM pp_order_bomline WHERE pp_order_id=?', [effOrder.pp_order_id]).length : -1; db.run("UPDATE pp_product_bomline SET validto=? WHERE pp_product_bomline_id=?", [bl.validto, bl.id]);
  check('L5e a BOM line expired before the order start is skipped (isValidFromTo): 1 of 2 lines exploded', rE.ok && effLines === 1, { ok: rE.ok, effLines: effLines, err: rE.error });

  // L6 the faithful quirk: QtyEntered set on a NEW order -> explosion runs twice (changed-branch + new-record branch)
  mute(); var rD = saveOrder({ ad_client_id: 11, ad_org_id: 50006, documentno: 'X-dbl', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 100, qtyentered: 100, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datepromised: '2008-08-17 00:00:00' }); unmute();
  var dOrder = q("SELECT pp_order_id FROM pp_order WHERE documentno='X-dbl'")[0], dB = dOrder ? q('SELECT COUNT(*) n FROM pp_order_bom WHERE pp_order_id=?', [dOrder.pp_order_id])[0].n : -1;
  _log('§LIBERO-DOUBLE-EXPLODE QtyEntered=100 on a new PP_Order -> pp_order_bom rows=' + dB + ' (port-faithful to MPPOrder.afterSave :466-475 in pshepetko AND logilite forks; OPEN: confirm against a running legacy before relying on it)');
  check('L6 the quirk is reproduced as a MEASURED fact, not hidden (port-faithful: 2 BOM headers when QtyEntered is set at creation)', rD.ok && dB === 2, { ok: rD.ok, boms: dB });

  // L6b the REAL HOST route (crud_overlay): the host writes the pp_order row itself, then ML.run(AFTER_SAVE, isNew) runs afterSave + AFTER_NEW -> explosion + MRP with a REAL FK (not an opRef)
  db.run("INSERT INTO pp_order (pp_order_id, ad_client_id, ad_org_id, documentno, m_product_id, pp_product_bom_id, qtyordered, m_warehouse_id, c_uom_id, datestartschedule, datefinishschedule, datepromised, docstatus, docaction, isactive) VALUES (9100001, 11, 50006, 'X-host', 136, 50004, 20, 50002, 100, '2008-08-16 00:00:00', '2008-08-17 00:00:00', '2008-08-17 00:00:00', 'DR', 'CO', 'Y')");
  mute(); var rH = ML.run(q, env(), { table: 'pp_order', timing: 'AFTER_SAVE', isNew: true, record: { pp_order_id: 9100001, ad_client_id: 11, ad_org_id: 50006, documentno: 'X-host', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 20, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datefinishschedule: '2008-08-17 00:00:00', datepromised: '2008-08-17 00:00:00', docstatus: 'DR', docaction: 'CO' } }); unmute();
  var hk = rH.ok ? rH.ops.reduce(function (a, o) { a[o.table] = (a[o.table] || 0) + 1; return a; }, {}) : {}, hfk = rH.ok ? rH.ops.filter(function (o) { return o.table === 'pp_order_bom'; }).map(function (o) { return o.fields.pp_order_id; }) : [];
  _log('§LIBERO-L6b host AFTER_SAVE route: ok=' + rH.ok + ' error=' + (rH.error || '') + ' ops by table=' + JSON.stringify(hk) + ' bom.pp_order_id=' + JSON.stringify(hfk));
  check('L6b host route: pp_order_bom 1 + pp_order_bomline 2 + pp_mrp 3 (1 supply + 2 demand), BOM header FK = the host row id 9100001', rH.ok && hk.pp_order_bom === 1 && hk.pp_order_bomline === 2 && hk.pp_mrp === 3 && hfk[0] === 9100001, { ok: rH.ok, error: rH.error, hk: hk, hfk: hfk });

  // L7 STOP: base restored, data kept; restart idempotent
  var dataBefore = counts(); mute(); await reg.stopBundle('org.idempiere.mfg'); unmute();
  var d7 = dump(), leftover = d7.h === base.h ? [] : (function () { var a = JSON.parse(base.s), b = JSON.parse(d7.s); return Object.keys(b).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); }); })();
  if (BREAK === 'nostop') leftover = leftover.length ? leftover : ['(break)'];
  _log('§LIBERO-L7 after STOP: hash=' + d7.h + ' baseline=' + base.h + (leftover.length ? ' LEFTOVER in ' + leftover.join(',') : '') + ' | data kept: ' + dataBefore + ' == ' + counts());
  check('L7 stop: every registry + the menu rows equal the baseline hash; the rows written while active are KEPT (data is not code)', (BREAK === 'nostop' ? false : d7.h === base.h) && counts() === dataBefore && reg.get('org.idempiere.mfg').state === 'STOPPED', { leftover: leftover });
  mute(); await reg.startBundle('org.idempiere.mfg'); await reg.need({ window: 53009 }); var d7b = dump(); await reg.stopBundle('org.idempiere.mfg'); unmute();
  check('L7b restart is idempotent: the second activation dump equals the first, and the second stop returns to baseline', d7b.h === d2.h && dump().h === base.h, { first: d2.h, second: d7b.h });

  // L7c a bundle stopped while still STARTING (never demanded) takes its staged menu rows with it
  mute(); await reg.startBundle('org.idempiere.mfg'); var mid7 = dump().menu; await reg.stopBundle('org.idempiere.mfg'); unmute();
  check('L7c stop while STARTING (no code ever ran): menu rows staged at START are removed (' + mid7 + ' -> ' + dump().menu + ')', mid7 === 4 && dump().h === base.h && reg.get('org.idempiere.mfg').state === 'STOPPED', { mid: mid7 });

  // L7d manifest.dictionary on an EAGER bundle: staged with its activation, removed at stop; a failing activate() leaves nothing behind (atomic)
  var row = function (id) { return { AD_Menu_ID: id, Name: 'dict probe', IsActive: 'Y', ad_client_id: 0, ad_org_id: 0 }; };
  var eagerOk = { manifest: { id: 'com.test.dict-eager', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, dictionary: [{ table: 'ad_menu', idCol: 'ad_menu_id', rows: [row(990001)] }] }, activate: async function () {}, deactivate: async function () {} };
  var eagerBad = { manifest: { id: 'com.test.dict-bad', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, dictionary: [{ table: 'ad_menu', idCol: 'ad_menu_id', rows: [row(990002)] }] }, activate: async function () { throw new Error('boom'); }, deactivate: async function () {} };
  var has = function (id) { return q('SELECT 1 AS x FROM ad_menu WHERE ad_menu_id=?', [id]).length; };
  mute(); await reg.installBundle(eagerOk); await reg.startBundle('com.test.dict-eager'); var onE = has(990001); await reg.stopBundle('com.test.dict-eager');
  await reg.installBundle(eagerBad); var thrown = false; try { await reg.startBundle('com.test.dict-bad'); } catch (e) { thrown = true; } unmute();
  check('L7d manifest.dictionary on an eager bundle: row present while ACTIVE (' + onE + '), gone after stop (' + has(990001) + '); a bundle whose activate() throws leaves no dictionary row (' + has(990002) + ')', onE === 1 && has(990001) === 0 && thrown && has(990002) === 0, { onE: onE, thrown: thrown });

  // L8 nothing silent
  var ch = await import('file://' + path.join(ERP, 'plugins', 'libero_pporder.mjs')); ch.DEFERRED.forEach(function (d) { _log('§LIBERO-DEFERRED ' + d); });
  check('L8 deferrals are listed (never silent)', ch.DEFERRED.length >= 4, ch.DEFERRED);
  check('L9 no op carried a column the physical table lacks (dropped=0)', dropped.length === 0, dropped.slice(0, 6));

  var verdict = fails ? 'FAIL' : (inconclusive || !judged) ? 'INCONCLUSIVE' : 'PASS';
  _log('§LIBERO-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(fails || inconclusive ? 1 : 0);
})().catch(function (e) { console.log = _log; _log('§LIBERO-VERDICT FAIL harness: ' + (e && e.stack || e)); process.exit(2); });
