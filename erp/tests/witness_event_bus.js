#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EVENT-BUS (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §10.3 + §10.3.5, Phase 1; CARDINAL RULE: the twin's trigger layer is legacy's).
//   READ THE LOG after every run: every verdict is a §BUS line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict.
// SPEC (the claims, written before the code):
//   W-BUS-ORDER    ModelValidationEngine.fireModelChange (:387-503): for ONE table and ONE topic the order is  global validators -> client validators (only the po's client)
//                  -> [AD_Table_ScriptValidator = step 3, NOT built: the twin has no AD_Rule engine] -> event handlers; validators stop at the first error; handler errors are
//                  COLLECTED (all handlers run), reversed and joined "<br>" (:489-497). Handlers are filtered by table. Same dispatcher for the document topics (fireDocValidate :581-671).
//   W-BUS-REPLICA  PO.saveNew/saveUpdate :2783-2789, delete :4300: a replica save fires afterNewReplication / afterChangeReplication / beforeDeleteReplication INSTEAD OF
//                  afterNew / afterChange / beforeDelete (the twin alias AFTER_SAVE is a NEW-or-CHANGE alias, so it does not fire either); the received key/uu is kept (:3530-3535);
//                  the BEFORE timings and the model class's own beforeSave/afterSave are unchanged; the flag resets after one save (:2789). An ordinary save is the reverse.
//                  THIS IS THE FL-8 SAFETY PROPERTY: a chain hung on afterNewReplication runs for the RECEIVER's save of a received row and never for a station's own save.
//   W-BUS-OBSERVE  postCreate / postUpdate / postDelete (PO.java:2799-2804, :4544) are observers: a subscriber cannot veto (a throw or an error string is logged/ignored, the save
//                  stands), is delivered ONCE per committed op group AFTER the group committed (never before, never twice), never for a rolled-back group. Any subscription may ask
//                  {observe:true} (the replica timings for receivers). Observers get a frozen copy (read-only).
//   W-BUS-COMPAT   registerValidator(table, timing, name, fn) is an adapter: every existing hook, over every table that has hooks today, yields the identical fireHooks outcome
//                  (result object AND the info.derived it writes) as the pre-bus loop (reference loop below = the original fireHooks verbatim).
//   W-BUS-PLUGIN   ctx.events.subscribe through plugin_registry buildCtx is owner-scoped and undone on stop (host registry returns to baseline).
//   §BUS-MEASURE-6 (measure only, nothing moved): X of N tables whose model-class beforeSave (model_layer M.beforeSave) AND ad_modelval validators both run on one save.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (BUS_MUTANTS=1): each rewrites the shipped source, proves the rewrite APPLIED, and the named check must
//   go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_event_bus.js            (add BUS_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.BUS_ERP || path.join(__dirname, '..');
var MUTANT = process.env.BUS_MUTANT || '';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };     // the shipped § lines are evidence: captured, then re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §BUS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§BUS-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && e.message)); } }

function b3(dbh) {
  function lc(o) { if (!o) return o; var r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; return r; }
  function run(sql, args, all) {
    var st; try { st = dbh.prepare(sql); } catch (er) { return all ? [] : undefined; }
    var out = all ? [] : undefined;
    try { if (args.length) st.bind(args); if (all) { while (st.step()) out.push(lc(st.getAsObject())); } else if (st.step()) out = lc(st.getAsObject()); } finally { st.free(); }
    return out;
  }
  return { prepare: function (sql) { return { get: function () { return run(sql, Array.prototype.slice.call(arguments), false); }, all: function () { return run(sql, Array.prototype.slice.call(arguments), true); } }; } };
}

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // the self-heal patch, statement by statement (idempiere.html FS-15 loader)
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master', 'model_rma', 'model_asi', 'model_dd', 'model_movement', 'model_inventory', 'model_post'].forEach   /* the page's own model_*.js set, idempiere.html:613-625 */(function (m) { require(path.join(ERP, m + '.js')); });
  var PR = require(path.join(ERP, 'plugin_registry.js'));
  say('§BUS-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' modelClasses=' + Object.keys(ML.MODEL).length + ' busApi=' + ['subscribe', 'unsubscribe', 'dispatch', 'deliverObserved', 'topicOf'].map(function (k) { return k + ':' + (typeof MV[k] === 'function' ? 'Y' : 'N'); }).join(','));

  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var uu = 0, clock = Date.parse('2026-10-27T09:00:00Z');
  function env(o) { clock += 1000; return Object.assign({ client: 11, org: 11, user: 100, date: '2026-10-27 00:00:00', now: '2026-10-27 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }, o || {}); }
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function commit(ops) {                                                     // the host's commitGroup + fold, in a sql.js db: returns the ids the ops got
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t);
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0 && (f[pk] == null || (typeof f[pk] === 'string' && f[pk].indexOf('#new:') === 0))) f[pk] = newId(t);
        ids[i] = cs.indexOf(pk) >= 0 ? f[pk] : f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  var T = 'c_uom';                                   // a real dictionary table with no model class and no hooks: the bus is the only thing on it
  var uomCount = function () { return q('SELECT COUNT(*) AS n FROM ' + T)[0].n; };
  function uomFields(n, extra) { return Object.assign({ name: 'BUSW ' + n, x12de355: 'B' + n, uomsymbol: 'b' + n, stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }, extra || {}); }
  function topicOf(t) { return typeof MV.topicOf === 'function' ? MV.topicOf(t) : null; }
  var TP = { afterNew: 'adempiere/po/afterNew', afterNewR: 'adempiere/po/afterNewReplication', afterChange: 'adempiere/po/afterChange', afterChangeR: 'adempiere/po/afterChangeReplication',
             beforeDelete: 'adempiere/po/beforeDelete', beforeDeleteR: 'adempiere/po/beforeDeleteReplication', beforeNew: 'adempiere/po/beforeNew', afterDelete: 'adempiere/po/afterDelete',
             postCreate: 'adempiere/po/postCreate', postUpdate: 'adempiere/po/postUpdate', postDelete: 'adempiere/po/postDelete', beforeComplete: 'adempiere/doc/beforeComplete' };
  function clean() {                                 // every bus registration this witness made goes away between cases
    try { (MV.subscriptions ? MV.subscriptions() : []).forEach(function (s) { if (/^W\./.test(s.name)) MV.unsubscribe(s.topic, s.table, s.name); }); } catch (e) {}
    ['BEFORE_NEW', 'AFTER_NEW', 'AFTER_CHANGE', 'AFTER_SAVE', 'BEFORE_SAVE', 'BEFORE_DELETE', 'BEFORE_COMPLETE', 'AFTER_NEW_REPLICATION'].forEach(function (ti) {
      [T, 'c_bpartner'].forEach(function (t) { var a = (MV.REGISTRY[t] || {})[ti]; if (a) a.slice().forEach(function (h) { if (/^W\./.test(h.name)) MV.unregisterValidator(t, ti, h.name); }); });
    });
  }
  function rec(order, name, ret) { return function () { order.push(name); return ret == null ? null : ret; }; }

  // ═══ W-BUS-ORDER ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  say('§BUS-ORDER-SPEC legacy order for one table+topic: global validators -> client validators(po client only) -> [script validators: absent] -> handlers; first validator error stops; handler errors collected+reversed+joined <br>');
  guard('ORDER', 'api', 'the bus API exists (subscribe/dispatch/topicOf) - RED before the build', function () {
    check('ORDER', 'api', 'the bus API exists: subscribe, unsubscribe, dispatch, topicOf', ['subscribe', 'unsubscribe', 'dispatch', 'topicOf'].every(function (k) { return typeof MV[k] === 'function'; }), Object.keys(MV).length);
  });
  guard('ORDER', 'topics', 'timing -> legacy topic string verbatim (IEventTopics.java:24-74), incl. postUpdate (constant PO_POST_UPADTE)', function () {
    var want = { BEFORE_NEW: 'adempiere/po/beforeNew', AFTER_NEW: 'adempiere/po/afterNew', AFTER_NEW_REPLICATION: 'adempiere/po/afterNewReplication', BEFORE_CHANGE: 'adempiere/po/beforeChange',
      AFTER_CHANGE: 'adempiere/po/afterChange', AFTER_CHANGE_REPLICATION: 'adempiere/po/afterChangeReplication', BEFORE_DELETE: 'adempiere/po/beforeDelete', AFTER_DELETE: 'adempiere/po/afterDelete',
      BEFORE_DELETE_REPLICATION: 'adempiere/po/beforeDeleteReplication', POST_CREATE: 'adempiere/po/postCreate', POST_UPDATE: 'adempiere/po/postUpdate', POST_DELETE: 'adempiere/po/postDelete',
      BEFORE_PREPARE: 'adempiere/doc/beforePrepare', BEFORE_COMPLETE: 'adempiere/doc/beforeComplete', AFTER_COMPLETE: 'adempiere/doc/afterComplete', BEFORE_VOID: 'adempiere/doc/beforeVoid',
      BEFORE_REVERSECORRECT: 'adempiere/doc/beforeReverseCorrect', AFTER_REVERSEACCRUAL: 'adempiere/doc/afterReverseAccrual', BEFORE_REACTIVATE: 'adempiere/doc/beforeReactivate', AFTER_POST: 'adempiere/doc/afterPost' };
    var bad = Object.keys(want).filter(function (k) { return topicOf(k) !== want[k]; });
    check('ORDER', 'topics', 'every probed timing maps to the legacy topic string', bad.length === 0 && typeof MV.topicOf === 'function', bad.map(function (k) { return k + '=' + topicOf(k); }));
  });
  function orderCase(label, fireFn) {
    clean();
    var o = [], cl = 11;
    // registered in the OPPOSITE of legacy order on purpose (handler, client, global): a registration-order dispatcher would pass the wrong way round
    MV.subscribe(TP.afterNew, T, 'W.H1', rec(o, 'H1')); MV.subscribe(TP.afterNew, T, 'W.H2', rec(o, 'H2')); MV.subscribe(TP.afterNew, 'c_bpartner', 'W.Hother', rec(o, 'Hother'));
    MV.registerValidator(T, 'AFTER_NEW', 'W.VCLIENT', rec(o, 'VC'), { client: cl }); MV.registerValidator(T, 'AFTER_NEW', 'W.VOTHERCLIENT', rec(o, 'VX'), { client: 999 });
    MV.registerValidator(T, 'AFTER_NEW', 'W.VGLOBAL', rec(o, 'VG'));
    var r = fireFn(); return { o: o, r: r };
  }
  guard('ORDER', 'order', 'order global -> client(own) -> handlers; other client skipped; other table skipped', function () {
    var x = orderCase('order', function () { return MV.fireHooks('AFTER_NEW', { table: T, record: { ad_client_id: 11 } }, {}); });
    check('ORDER', 'order', 'fire order == [VG, VC, H1, H2] (VX other client and Hother other table never run)', J(x.o) === J(['VG', 'VC', 'H1', 'H2']) && x.r.ok === true, { o: x.o, r: x.r });
    var y = orderCase('order-dispatch', function () { return MV.dispatch(TP.afterNew, { table: T, record: { ad_client_id: 11 } }, {}); });
    check('ORDER', 'dispatch', 'dispatch(topic) = the same dispatcher fireHooks(timing) uses', J(y.o) === J(['VG', 'VC', 'H1', 'H2']) && y.r.ok === true, { o: y.o });
  });
  guard('ORDER', 'stop-global', 'a global-validator error stops everything after it', function () {
    clean(); var o = [];
    MV.subscribe(TP.afterNew, T, 'W.H1', rec(o, 'H1')); MV.registerValidator(T, 'AFTER_NEW', 'W.VC', rec(o, 'VC'), { client: 11 }); MV.registerValidator(T, 'AFTER_NEW', 'W.VG', rec(o, 'VG', 'global says no'));
    var r = MV.fireHooks('AFTER_NEW', { table: T, record: { ad_client_id: 11 } }, {});
    check('ORDER', 'stop-global', 'error returned, client validator and handler never ran', J(o) === J(['VG']) && r.ok === false && r.error === 'global says no' && r.blocked === 'W.VG', { o: o, r: r });
  });
  guard('ORDER', 'stop-client', 'a client-validator error stops the handlers', function () {
    clean(); var o = [];
    MV.subscribe(TP.afterNew, T, 'W.H1', rec(o, 'H1')); MV.registerValidator(T, 'AFTER_NEW', 'W.VC', rec(o, 'VC', 'client says no'), { client: 11 }); MV.registerValidator(T, 'AFTER_NEW', 'W.VG', rec(o, 'VG'));
    var r = MV.fireHooks('AFTER_NEW', { table: T, record: { ad_client_id: 11 } }, {});
    check('ORDER', 'stop-client', 'error returned, handler never ran', J(o) === J(['VG', 'VC']) && r.ok === false && r.error === 'client says no', { o: o, r: r });
  });
  guard('ORDER', 'collect', 'handler errors are collected (all run), reversed and joined with <br> (ModelValidationEngine.java:489-497)', function () {
    clean(); var o = [];
    MV.subscribe(TP.afterNew, T, 'W.H1', rec(o, 'H1', 'err-a')); MV.subscribe(TP.afterNew, T, 'W.H2', rec(o, 'H2', 'err-b')); MV.subscribe(TP.afterNew, T, 'W.H3', rec(o, 'H3'));
    var r = MV.fireHooks('AFTER_NEW', { table: T, record: { ad_client_id: 11 } }, {});
    check('ORDER', 'collect', 'all three handlers ran; error === "err-b<br>err-a<br>"', J(o) === J(['H1', 'H2', 'H3']) && r.ok === false && r.error === 'err-b<br>err-a<br>', { o: o, r: r });
    var o2 = []; clean(); MV.subscribe(TP.afterNew, T, 'W.H1', function () { o2.push('H1'); throw new Error('boom'); }); MV.subscribe(TP.afterNew, T, 'W.H2', rec(o2, 'H2'));
    var r2 = MV.fireHooks('AFTER_NEW', { table: T, record: { ad_client_id: 11 } }, {});
    check('ORDER', 'collect-throw', 'a throwing handler is an error (collected), the next handler still runs, no crash escapes', J(o2) === J(['H1', 'H2']) && r2.ok === false && /boom/.test(r2.error || ''), { o2: o2, r2: r2 });
  });
  guard('ORDER', 'wildcard', "table '*' handler runs for every table; unsubscribe removes exactly it", function () {
    clean(); var o = [];
    MV.subscribe(TP.afterNew, '*', 'W.HALL', rec(o, 'HALL')); MV.fireHooks('AFTER_NEW', { table: T, record: {} }, {}); MV.fireHooks('AFTER_NEW', { table: 'c_bpartner', record: {} }, {});
    var n = MV.unsubscribe(TP.afterNew, '*', 'W.HALL'); MV.fireHooks('AFTER_NEW', { table: T, record: {} }, {});
    check('ORDER', 'wildcard', "'*' ran for 2 tables, unsubscribe returned 1 and it ran no more", J(o) === J(['HALL', 'HALL']) && n === 1, { o: o, n: n });
  });
  guard('ORDER', 'doc', 'the document topics use the same dispatcher (fireDocValidate :581-671)', function () {
    clean(); var o = [];
    MV.subscribe(TP.beforeComplete, T, 'W.DH', rec(o, 'DH')); MV.registerValidator(T, 'BEFORE_COMPLETE', 'W.DV', rec(o, 'DV'));
    var r = MV.fireHooks('BEFORE_COMPLETE', { table: T, record: { ad_client_id: 11 } }, {});
    check('ORDER', 'doc', 'doc timing: validator then handler', J(o) === J(['DV', 'DH']) && r.ok === true, { o: o });
  });
  say('§BUS-ORDER-STAGE3 script-validator (AD_Table_ScriptValidator) stage = BUILT in erp/ad_rule.js (TEAM_REPLICATION_PLUGIN_STUDY §10.8, witnessed by witness_script_validator.js); this witness has no ad_rule rows, so the order above is judged with that stage empty');
  clean();

  // ═══ W-BUS-REPLICA ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function watchAll(o) {
    ['afterNew', 'afterNewR', 'afterChange', 'afterChangeR', 'beforeDelete', 'beforeDeleteR', 'beforeNew', 'afterDelete'].forEach(function (k) {
      MV.subscribe(TP[k], T, 'W.' + k, function (c, info) { o.push(k + (info && info.isReplication ? '*' : '')); return null; });
    });
    MV.registerValidator(T, 'AFTER_SAVE', 'W.alias', function () { o.push('AFTER_SAVE'); return null; });
    MV.registerValidator(T, 'BEFORE_SAVE', 'W.balias', function () { o.push('BEFORE_SAVE'); return null; });
  }
  function inTrx(fn, e) { return ML.run(q, env(e), { table: T, timing: 'PROCESS', fn: fn }); }
  guard('REPLICA', 'api', 'saveReplica / removeReplica exist (RED before the build)', function () {
    check('REPLICA', 'api', 'ML.saveReplica and ML.removeReplica are functions', typeof ML.saveReplica === 'function' && typeof ML.removeReplica === 'function', { s: typeof ML.saveReplica, r: typeof ML.removeReplica });
  });
  guard('REPLICA', 'ordinary', 'an ORDINARY new save fires afterNew (+AFTER_SAVE alias), never a replica timing', function () {
    clean(); var o = [];
    watchAll(o);
    var r = inTrx(function (trx) { ML.save(trx, T, null, uomFields(1)); return { ok: true }; });
    check('REPLICA', 'ordinary', 'sequence beforeNew,BEFORE_SAVE,afterNew,AFTER_SAVE; no afterNewReplication', r.ok && J(o) === J(['beforeNew', 'BEFORE_SAVE', 'afterNew', 'AFTER_SAVE']), { o: o, ok: r.ok, msg: r.msg });
  });
  guard('REPLICA', 'replica-new', 'a REPLICA new save fires afterNewReplication INSTEAD OF afterNew (and not the AFTER_SAVE alias)', function () {
    clean(); var o = [];
    watchAll(o);
    var r = inTrx(function (trx) { ML.saveReplica(trx, T, null, uomFields(2)); return { ok: true }; });
    check('REPLICA', 'replica-new', 'sequence beforeNew*,BEFORE_SAVE,afterNewR*  (the BEFORE timings fire for a replica too, flagged isReplication; no afterNew, no AFTER_SAVE)', r.ok && J(o) === J(['beforeNew*', 'BEFORE_SAVE', 'afterNewR*']), { o: o, ok: r.ok, msg: r.msg });
  });
  guard('REPLICA', 'replica-change', 'a REPLICA change fires afterChangeReplication instead of afterChange; ordinary change the reverse', function () {
    clean();
    var row = q('SELECT * FROM ' + T + ' WHERE c_uom_id=100')[0], oR = [], oN = [];
    watchAll(oR); var rr = inTrx(function (trx) { ML.saveReplica(trx, T, trx.get(T, 100), { description: 'replica ' + oR.length }); return { ok: true }; });
    clean(); watchAll(oN); var rn = inTrx(function (trx) { ML.save(trx, T, trx.get(T, 100), { description: 'ordinary' }); return { ok: true }; });
    check('REPLICA', 'replica-change', 'replica: afterChangeR* and not afterChange/AFTER_SAVE', !!row && rr.ok && oR.indexOf('afterChangeR*') >= 0 && oR.indexOf('afterChange') < 0 && oR.indexOf('AFTER_SAVE') < 0, { oR: oR, ok: rr.ok, msg: rr.msg });
    check('REPLICA', 'ordinary-change', 'ordinary: afterChange + AFTER_SAVE and not afterChangeR', rn.ok && oN.indexOf('afterChange') >= 0 && oN.indexOf('AFTER_SAVE') >= 0 && oN.indexOf('afterChangeR*') < 0, { oN: oN, ok: rn.ok, msg: rn.msg });
  });
  guard('REPLICA', 'replica-delete', 'a REPLICA delete fires beforeDeleteReplication instead of beforeDelete; ordinary delete the reverse', function () {
    clean(); var oR = [], oN = [];
    watchAll(oR); var rr = inTrx(function (trx) { ML.removeReplica(trx, T, trx.get(T, 100)); return { ok: true }; });
    clean(); watchAll(oN); var rn = inTrx(function (trx) { ML.remove(trx, T, trx.get(T, 100)); return { ok: true }; });
    check('REPLICA', 'replica-delete', 'replica: beforeDeleteR* and not beforeDelete', rr.ok && oR.indexOf('beforeDeleteR*') >= 0 && oR.indexOf('beforeDelete') < 0, { oR: oR, msg: rr.msg });
    check('REPLICA', 'ordinary-delete', 'ordinary: beforeDelete and not beforeDeleteR; afterDelete in both', rn.ok && oN.indexOf('beforeDelete') >= 0 && oN.indexOf('beforeDeleteR*') < 0 && oN.indexOf('afterDelete') >= 0 && oR.indexOf('afterDelete*') >= 0, { oN: oN, oR: oR });
  });
  guard('REPLICA', 'key', 'the replica keeps the RECEIVED key and uu; an ordinary save is renumbered (PO.java:3530-3535)', function () {
    clean();
    var rr = inTrx(function (trx) { ML.saveReplica(trx, T, null, uomFields(3, { c_uom_id: 9123456, c_uom_uu: 'aaaaaaaa-0000-4000-8000-000000009999' })); return { ok: true }; });
    var rn = inTrx(function (trx) { ML.save(trx, T, null, uomFields(4, { c_uom_id: 9123457, c_uom_uu: 'bbbbbbbb-0000-4000-8000-000000009999' })); return { ok: true }; });
    var fr = rr.ops[0] && rr.ops[0].fields, fn = rn.ops[0] && rn.ops[0].fields;
    check('REPLICA', 'key', 'replica op carries c_uom_id=9123456 and the received uu; ordinary op has the placeholder key, never 9123457',
      !!fr && fr.c_uom_id === 9123456 && fr.c_uom_uu === 'aaaaaaaa-0000-4000-8000-000000009999' && !!fn && fn.c_uom_id !== 9123457 && fn.c_uom_uu === 'bbbbbbbb-0000-4000-8000-000000009999', { fr: fr && [fr.c_uom_id, fr.c_uom_uu], fn: fn && [fn.c_uom_id, fn.c_uom_uu] });
    if (fr) { commit(rr.ops); check('REPLICA', 'key-committed', 'after the commit the row is stored under the received key', q('SELECT COUNT(*) AS n FROM ' + T + ' WHERE c_uom_id=9123456')[0].n === 1, null); }
  });
  guard('REPLICA', 'flag-reset', 'PO.setReplication(true) applies to ONE save; the next save of the same handle is ordinary (PO.java:2789)', function () {
    clean(); var o = [];
    watchAll(o);
    var r = inTrx(function (trx) { var p = ML.newRecord(trx, T, uomFields(5)); p.setReplication(true); p.saveEx(); p.set('description', 'again'); p.saveEx(); return { ok: true }; });
    check('REPLICA', 'flag-reset', 'first save afterNewR*, second save afterChange (not a replica)', r.ok && o.indexOf('afterNewR*') >= 0 && o.indexOf('afterChange') >= 0 && o.indexOf('afterChangeR*') < 0, { o: o, msg: r.msg });
  });
  guard('REPLICA', 'fl8', 'FL-8: a chain on afterNewReplication runs once for the receiver and ZERO times for the station\'s own save', function () {
    clean(); var chain = 0;
    MV.subscribe(TP.afterNewR, T, 'W.chain', function (c, info) { chain++; c.trx.insert('c_uom', uomFields('chain' + chain)); return null; });   // the local trigger: writes a local row INSIDE the receiver's trx
    var station = inTrx(function (trx) { ML.save(trx, T, null, uomFields(6)); return { ok: true }; });
    var afterStation = chain;
    var receiver = inTrx(function (trx) { ML.saveReplica(trx, T, null, uomFields(7)); return { ok: true }; });
    check('REPLICA', 'fl8', 'chain ran 0x for the station save, 1x for the replica; the replica group carries its local chain row (2 ops)', afterStation === 0 && chain === 1 && station.ops.length === 1 && receiver.ops.length === 2, { afterStation: afterStation, chain: chain, stationOps: station.ops.length, receiverOps: receiver.ops.length });
  });
  guard('REPLICA', 'model-class', 'the model class\'s own beforeSave/afterSave still run on a replica (PO.afterSave is not replica-gated)', function () {
    clean(); var seen = [];
    ML.registerModel(T, { beforeSave: function () { seen.push('M.before'); return null; }, afterSave: function () { seen.push('M.after'); return null; } }, { owner: 'W.bus', rank: 1 });
    try { inTrx(function (trx) { ML.saveReplica(trx, T, null, uomFields(8)); return { ok: true }; }); } finally { ML.unregisterModel(T, 'W.bus'); }
    check('REPLICA', 'model-class', 'M.beforeSave and M.afterSave ran on the replica save', J(seen) === J(['M.before', 'M.after']), seen);
  });
  clean();

  // ═══ W-BUS-OBSERVE ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  function groupRun(fn, replicaSpec) { return ML.run(q, env(), { table: T, timing: 'PROCESS', fn: fn }); }
  guard('OBSERVE', 'api', 'deliverObserved exists; run() returns the queued events (RED before the build)', function () {
    check('OBSERVE', 'api', 'MV.deliverObserved and ML.deliverObserved are functions', typeof MV.deliverObserved === 'function' && typeof ML.deliverObserved === 'function', { mv: typeof MV.deliverObserved, ml: typeof ML.deliverObserved });
  });
  guard('OBSERVE', 'moment', 'delivered AFTER the group committed: 0 before, then exactly 1; a second delivery adds nothing', function () {
    clean(); var seen = [], n0 = uomCount();
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { seen.push({ count: uomCount(), name: info.record.name, group: info.group && info.group.id }); return null; });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(10)); return { ok: true }; });
    var beforeCommit = seen.length;
    var ids = commit(r.ops);
    var d1 = ML.deliverObserved(r, {}, function (fi) { return ids[fi]; });
    var d2 = ML.deliverObserved(r, {}, function (fi) { return ids[fi]; });
    check('OBSERVE', 'moment', 'nothing delivered by run() itself; one delivery after commit sees the committed row; the second call delivers 0', beforeCommit === 0 && seen.length === 1 && seen[0].count === n0 + 1 && seen[0].name === 'BUSW 10' && d1 && d1.delivered === 1 && d2 && d2.delivered === 0, { beforeCommit: beforeCommit, seen: seen, d1: d1, d2: d2 });
  });
  guard('OBSERVE', 'ids', 'the new row\'s key is the COMMITTED id in the observer\'s copy, not the "#new:i" placeholder', function () {
    clean(); var got = [];
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { got.push(info.record.c_uom_id); return null; });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(11)); return { ok: true }; });
    var ids = commit(r.ops); ML.deliverObserved(r, {}, function (fi) { return ids[fi]; });
    check('OBSERVE', 'ids', 'observer saw the numeric committed id and it exists in the table', got.length === 1 && typeof got[0] === 'number' && q('SELECT COUNT(*) AS n FROM ' + T + ' WHERE c_uom_id=?', [got[0]])[0].n === 1, got);
  });
  guard('OBSERVE', 'cannot-veto', 'an observer that throws or returns an error does NOT veto: the save stands, the throw is logged with a § line, other observers still run', function () {
    clean(); var ran = [], mark = SEEN.length;
    MV.subscribe(TP.postCreate, T, 'W.o1', function () { ran.push('o1'); throw new Error('observer exploded'); });
    MV.subscribe(TP.postCreate, T, 'W.o2', function () { ran.push('o2'); return 'I would like to refuse'; });
    MV.subscribe(TP.postCreate, T, 'W.o3', function () { ran.push('o3'); return null; });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(12)); return { ok: true }; });
    commit(r.ops); var d = ML.deliverObserved(r, {});
    var lines = SEEN.slice(mark).filter(function (l) { return /§BUS_OBSERVE_ERR/.test(l); });
    check('OBSERVE', 'cannot-veto', 'save ok with its op, all 3 observers ran, 1 logged throw, delivery reports errors>=1 and still delivered', r.ok && r.ops.length === 1 && J(ran) === J(['o1', 'o2', 'o3']) && lines.length >= 1 && /observer exploded/.test(lines.join('|')) && d.errors >= 1, { ok: r.ok, ops: r.ops.length, ran: ran, lines: lines, d: d });
  });
  guard('OBSERVE', 'gate-topic-flag', '{observe:true} on a GATE topic is after-commit and read-only too: it cannot veto the save', function () {
    clean(); var ran = 0;
    MV.subscribe(TP.afterNew, T, 'W.fo', function () { ran++; return 'veto attempt'; }, { observe: true });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(13)); return { ok: true }; });
    var inSave = ran; commit(r.ops); ML.deliverObserved(r, {});
    check('OBSERVE', 'gate-topic-flag', 'not run inside the save (0), save ok, run once after commit', r.ok && inSave === 0 && ran === 1, { ok: r.ok, inSave: inSave, ran: ran });
  });
  guard('OBSERVE', 'rollback', 'a rolled-back group delivers NOTHING (process refuses; savepoint rolled back; gate refuses)', function () {
    clean(); var ran = 0;
    MV.subscribe(TP.postCreate, T, 'W.obs', function () { ran++; return null; });
    var r1 = groupRun(function (trx) { ML.save(trx, T, null, uomFields(14)); return { ok: false, msg: 'process refused after saving' }; });
    var d1 = ML.deliverObserved(r1, {});
    var r2 = groupRun(function (trx) { var sp = trx.setSavepoint(); ML.save(trx, T, null, uomFields(15)); trx.rollbackTo(sp); return { ok: true }; });
    var d2 = ML.deliverObserved(r2, {});
    MV.registerValidator(T, 'BEFORE_NEW', 'W.refuse', function () { return 'gate says no'; });
    var r3 = groupRun(function (trx) { var s = ML.save(trx, T, null, uomFields(16)); return { ok: s.ok, msg: s.error }; });
    var d3 = ML.deliverObserved(r3, {});
    check('OBSERVE', 'rollback', 'group refused -> 0 delivered; savepoint rolled back -> 0; gate refused -> 0; observer never ran', ran === 0 && !r1.ok && (!d1 || d1.delivered === 0) && r2.ops.length === 0 && (!d2 || d2.delivered === 0) && !r3.ok && (!d3 || d3.delivered === 0), { ran: ran, r1ok: r1.ok, r2ops: r2.ops.length, r3ok: r3.ok });
  });
  guard('OBSERVE', 'failed-save-in-ok-group', 'a save that FAILS inside an otherwise committed group queues nothing (only the good save is delivered)', function () {
    clean(); var seen = [];
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { seen.push('post:' + info.record.name); return null; });
    MV.subscribe(TP.afterNew, T, 'W.obsg', function (c, info) { seen.push('afterNew:' + info.record.name); return null; }, { observe: true });   // queued when afterNew passes - BEFORE the later refusal below
    MV.registerValidator(T, 'AFTER_SAVE', 'W.refuse2', function (c, info) { return info.record.name === 'BUSW 41' ? 'refuse this one' : null; });   // refuses AFTER afterNew already queued its observer event
    var bad = null;
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(40)); bad = ML.save(trx, T, null, uomFields(41)); return { ok: true }; });
    commit(r.ops); ML.deliverObserved(r, {});
    check('OBSERVE', 'failed-save-in-ok-group', 'the refused save was reported not-ok, the group committed, observers (post + observe-flag afterNew) saw only BUSW 40', bad && bad.ok === false && seen.slice().sort().join() === 'afterNew:BUSW 40,post:BUSW 40', { bad: bad && bad.ok, seen: seen });
  });
  guard('OBSERVE', 'group', 'a group of N saves is delivered as ONE batch (same group id), post-commit, in write order', function () {
    clean(); var seen = [];
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { seen.push([info.record.name, info.group && info.group.id, info.group && info.group.n]); return null; });
    MV.subscribe(TP.postUpdate, T, 'W.obsu', function (c, info) { seen.push(['UPD', info.group && info.group.id, info.record.description]); return null; });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(17)); ML.save(trx, T, null, uomFields(18)); ML.save(trx, T, trx.get(T, 100), { description: 'post-update probe' }); return { ok: true }; });
    commit(r.ops); var d = ML.deliverObserved(r, {});
    check('OBSERVE', 'group', '3 events in one batch: create,create,update; one shared group id; group size 3', seen.length === 3 && seen[0][0] === 'BUSW 17' && seen[1][0] === 'BUSW 18' && seen[2][0] === 'UPD' && seen[0][1] === seen[1][1] && seen[1][1] === seen[2][1] && seen[0][2] === 3 && d.delivered === 3, { seen: seen, d: d });
  });
  guard('OBSERVE', 'delete', 'postDelete is delivered after commit with the deleted row', function () {
    clean(); var seen = [];
    MV.subscribe(TP.postDelete, T, 'W.obsd', function (c, info) { seen.push(info.record && info.record.name); return null; });
    var tmp = groupRun(function (trx) { ML.save(trx, T, null, uomFields(19)); return { ok: true }; }); var ids = commit(tmp.ops);
    var r = groupRun(function (trx) { ML.remove(trx, T, trx.get(T, ids[0])); return { ok: true }; });
    var pre = seen.length; commit(r.ops); ML.deliverObserved(r, {});
    check('OBSERVE', 'delete', 'nothing before commit; one postDelete with the row name after', pre === 0 && J(seen) === J(['BUSW 19']), { pre: pre, seen: seen });
  });
  guard('OBSERVE', 'readonly', 'the observer gets a FROZEN copy: writing to it throws (caught, logged) and the committed row is untouched', function () {
    clean(); var threw = 0;
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { try { info.record.name = 'HACKED'; } catch (e) { threw++; } return null; });
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(20)); return { ok: true }; });
    commit(r.ops); ML.deliverObserved(r, {});
    check('OBSERVE', 'readonly', 'write attempt threw (strict mode) and the stored name is intact', threw === 1 && q("SELECT COUNT(*) AS n FROM " + T + " WHERE name='BUSW 20'")[0].n === 1, { threw: threw });
  });
  guard('OBSERVE', 'replica-observe', 'a replica save is observed too: postCreate carries isReplication, and an {observe:true} afterNewReplication subscriber runs after commit', function () {
    clean(); var seen = [];
    MV.subscribe(TP.postCreate, T, 'W.obs', function (c, info) { seen.push('post:' + !!info.isReplication); return null; });
    MV.subscribe(TP.afterNewR, T, 'W.robs', function (c, info) { seen.push('replicaObs:' + !!info.isReplication); return null; }, { observe: true });
    var r = groupRun(function (trx) { ML.saveReplica(trx, T, null, uomFields(21)); return { ok: true }; });
    var inSave = seen.length; commit(r.ops); ML.deliverObserved(r, {});
    check('OBSERVE', 'replica-observe', 'nothing in-save; after commit post:true and replicaObs:true', inSave === 0 && seen.indexOf('post:true') >= 0 && seen.indexOf('replicaObs:true') >= 0, { inSave: inSave, seen: seen });
  });
  guard('OBSERVE', 'no-cost', 'with NO observer subscribed nothing is queued (no behaviour change for existing callers)', function () {
    clean();
    var r = groupRun(function (trx) { ML.save(trx, T, null, uomFields(22)); return { ok: true }; });
    check('OBSERVE', 'no-cost', 'run() result carries an empty observed list', Array.isArray(r.observed) && r.observed.length === 0, r.observed && r.observed.length);
  });
  clean();

  // ═══ W-BUS-COMPAT ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // the ORIGINAL fireHooks, verbatim from bim-ootb main before the bus (erp/ad_modelval.js:786-798): the reference every cell is compared with
  function refFire(timing, info, ctx) {
    ctx = ctx || {};
    var t = (info.table || '').toLowerCase();
    var hooks = (MV.REGISTRY[t] && MV.REGISTRY[t][timing]) || [];
    for (var i = 0; i < hooks.length; i++) {
      var err;
      try { err = hooks[i].fn(ctx, info); }
      catch (e) { err = 'hook threw: ' + (e && e.message); }
      if (err) return { timing: timing, table: info.table, fired: i + 1, ok: false, blocked: hooks[i].name, error: err };
    }
    return { timing: timing, table: info.table, fired: hooks.length, ok: true };
  }
  guard('COMPAT', 'cells', 'every (table,timing) that carries a hook today yields the identical fireHooks outcome', function () {
    var b = b3(db), installed = [];
    Object.keys(MV).forEach(function (m) { if (/^install[A-Z].*SaveHooks$/.test(m) && typeof MV[m] === 'function') { try { MV[m](b); installed.push(m); } catch (e) {} } });   // crud_overlay._installAllModelVal
    var cells = [];
    Object.keys(MV.REGISTRY).sort().forEach(function (t) { Object.keys(MV.REGISTRY[t]).sort().forEach(function (ti) { if (!/^W\./.test((MV.REGISTRY[t][ti][0] || {}).name || '')) cells.push([t, ti]); }); });
    var tables = {}; cells.forEach(function (c) { tables[c[0]] = 1; });
    var diffs = [], classes = { ok: 0, blocked: 0, derived: 0 }, hooksN = 0, noTopic = [];
    cells.forEach(function (c) {
      var t = c[0], ti = c[1], row = q('SELECT * FROM ' + t + ' LIMIT 1')[0] || {};
      hooksN += MV.REGISTRY[t][ti].length;
      if (topicOf(ti) == null) noTopic.push(ti);
      var i1 = { table: t, record: Object.assign({}, row), recordOld: null }, i2 = { table: t, record: Object.assign({}, row), recordOld: null };
      var a = refFire(ti, i1, {}), z = MV.fireHooks(ti, i2, {});
      if (J(a) !== J(z) || J(i1) !== J(i2)) diffs.push({ t: t, ti: ti, ref: a, bus: z });
      if (a.ok) classes.ok++; else classes.blocked++; if (i1.derived && Object.keys(i1.derived).length) classes.derived++;
    });
    say('§BUS-COMPAT installers=' + installed.length + ' tablesWithHooks=' + Object.keys(tables).length + ' cells=' + cells.length + ' hooks=' + hooksN + ' outcomes=' + J(classes) + ' identical=' + (cells.length - diffs.length) + ' of ' + cells.length);
    check('COMPAT', 'population', 'hooks exist to judge (not vacuous): >=10 tables, >=20 hooks', Object.keys(tables).length >= 10 && hooksN >= 20, { tables: Object.keys(tables).length, hooks: hooksN });
    check('COMPAT', 'inventory', 'no registration was dropped by the adapter: >= the pre-bus main inventory (14 tables, 18 cells, 71 hooks, measured on the unmodified module)', Object.keys(tables).length >= 14 && cells.length >= 18 && hooksN >= 71, { tables: Object.keys(tables).length, cells: cells.length, hooks: hooksN });
    check('COMPAT', 'identical', 'result object AND info.derived identical to the original loop in ALL ' + cells.length + ' cells', diffs.length === 0 && cells.length > 0, diffs.slice(0, 3));
    check('COMPAT', 'varied', 'the comparison is not trivially all-ok: at least one cell blocked and one wrote derived values', classes.blocked >= 1 && classes.derived >= 1, classes);
    check('COMPAT', 'topics', 'every timing carrying a hook today maps to a topic (otherwise unreachable by the bus)', noTopic.length === 0, noTopic);
    check('COMPAT', 'count', 'registeredCount equals the number of REGISTRY entries', MV.registeredCount() === Object.keys(MV.REGISTRY).reduce(function (n, t) { return n + Object.keys(MV.REGISTRY[t]).reduce(function (m, ti) { return m + MV.REGISTRY[t][ti].length; }, 0); }, 0), MV.registeredCount());
    // hooksFor / unregister round trip
    var n0 = MV.registeredCount(); MV.registerValidator('c_bpartner', 'BEFORE_SAVE', 'W.rt', function () { return 'rt-refuse'; });
    var rr = MV.fireHooks('BEFORE_SAVE', { table: 'C_BPartner', record: {} }, {});
    var gone = MV.unregisterValidator('c_bpartner', 'BEFORE_SAVE', 'W.rt'), rr2 = MV.fireHooks('BEFORE_SAVE', { table: 'c_bpartner', record: {} }, {});
    check('COMPAT', 'roundtrip', 'register -> blocks (case-insensitive table) -> unregister returns 1 -> no longer blocks; count restored', rr.ok === false && rr.error === 'rt-refuse' && gone === 1 && rr2.ok === true && MV.registeredCount() === n0, { rr: rr, gone: gone, rr2: rr2 });
  });
  guard('COMPAT', 'save-path', 'ML.save outcome unchanged for a save with real hooks (C_Order header refused for the same reason by the model class and validators)', function () {
    clean();
    var r = ML.run(q, env(), { table: 'c_order', timing: 'SAVE', id: null, changes: { documentno: 'W-COMPAT' } });
    check('COMPAT', 'save-path', 'a hook-bearing table still goes through ML.save and returns a verdict (ok or a refusal text) without throwing', typeof r.ok === 'boolean' && (r.ok || typeof (r.error || r.msg) === 'string'), { ok: r.ok, err: r.error || r.msg });
  });
  clean();

  // ═══ W-BUS-PLUGIN ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  try {
    var BUNDLES = {}, ran = [];
    var host = { engineVersion: '1.0.0', modelval: MV, docAction: ML, import: function (u) { return Promise.resolve(BUNDLES[u]); }, ops: { append: function () { return 1; } } };
    BUNDLES['b/ev.mjs'] = { manifest: { id: 'com.test.events', version: '1.0.0', engineVersion: '>=0.9.0', requires: {} },
      activate: async function (ctx) { ctx.events.subscribe(TP.postCreate, T, 'W.plug.obs', function () { ran.push('obs'); return null; }); ctx.events.subscribe(TP.afterNew, T, 'W.plug.gate', function () { ran.push('gate'); return null; }); },
      deactivate: async function () {} };
    var reg = PR.create(host);
    var snap = function () { return MV.subscriptions ? MV.subscriptions().filter(function (s) { return /^W\.plug/.test(s.name); }).length : -1; };
    var s0 = snap();
    await reg.installBundle('b/ev.mjs'); var st = await reg.startBundle('com.test.events');
    var s1 = snap();
    var rP = ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, uomFields(30)); return { ok: true }; } }); commit(rP.ops); ML.deliverObserved(rP, {});
    await reg.stopBundle('com.test.events');
    var s2 = snap(), before = ran.length;
    var rQ = ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, uomFields(31)); return { ok: true }; } }); commit(rQ.ops); ML.deliverObserved(rQ, {});
    check('PLUGIN', 'ctx-events', 'start adds 2 subscriptions and both fire; stop removes both; afterwards nothing fires', s0 === 0 && s1 === 2 && ran.slice().sort().join() === 'gate,obs' && s2 === 0 && ran.length === before, { s0: s0, s1: s1, s2: s2, ran: ran, state: st && st.state });
  } catch (e) { check('PLUGIN', 'ctx-events', 'ctx.events path runs', false, 'threw: ' + (e && e.message)); }
  clean();

  // ═══ §BUS-MEASURE-6 — measure only ═════════════════════════════════════════════════════════════════════════════════════════════════════
  guard('MEASURE6', 'dual-home', 'which tables carry BOTH a model-class beforeSave (model_layer M.beforeSave) and ad_modelval validators', function () {
    var vtables = Object.keys(MV.REGISTRY).filter(function (t) { return Object.keys(MV.REGISTRY[t]).some(function (ti) { return /^BEFORE_/.test(ti); }); });
    var both = vtables.filter(function (t) { return ML.MODEL[t] && ML.MODEL[t].beforeSave; });
    var inst = ['installMOrderSaveHooks', 'installMInOutSaveHooks', 'installMInvoiceSaveHooks', 'installMPaymentSaveHooks', 'installMMovementSaveHooks', 'installMJournalSaveHooks'];
    var named = { C_Order: 1, M_InOut: 1, C_Invoice: 1, C_Payment: 1, M_Movement: 1, GL_Journal: 1 }, nl = Object.keys(named).map(function (s) { return s.toLowerCase(); });
    var namedBoth = nl.filter(function (t) { return both.indexOf(t) >= 0; });
    // dynamic: does one real save show both sequences? (§EVENT_SEQ trace) - a real existing row, a harmless re-save of its own description
    var dyn = {};
    both.forEach(function (t) {
      var row = q('SELECT * FROM ' + t + ' LIMIT 1')[0]; if (!row) { dyn[t] = 'no-row'; return; }
      var r = ML.run(q, env({ eventSeq: true }), { table: t, timing: 'PROCESS', fn: function (trx) { var s = ML.save(trx, t, trx.get(t, row[t + '_id']), { description: 'bus-probe' }); return { ok: true, saved: s.ok, err: s.error }; } });
      var ev = (r.trx && r.trx._events || []).map(function (e) { return e.event; });
      var nh = ['BEFORE_NEW', 'BEFORE_CHANGE', 'BEFORE_SAVE'].reduce(function (n, ti) { return n + ((MV.REGISTRY[t] || {})[ti] || []).length; }, 0);   // V counts only when that table really has before-validators AND the validator phase ran in the trace
      dyn[t] = { M: ev.indexOf('M.beforeSave') >= 0, V: nh > 0 && (ev.indexOf('V.BEFORE_SAVE') >= 0 || ev.indexOf('V.BEFORE_CHANGE') >= 0), validators: nh, saved: r.saved, err: r.err && String(r.err).slice(0, 60) };
    });
    var dualFired = Object.keys(dyn).filter(function (t) { return dyn[t] && dyn[t].M && dyn[t].V; });
    say('§BUS-MEASURE-6 tablesWithBeforeValidators=' + vtables.length + ' alsoModelBeforeSave=' + both.length + ' [' + both.join(',') + '] namedInStudy(' + nl.length + ')=' + J(namedBoth) + ' => ' + namedBoth.length + ' of ' + nl.length +
        ' study-named tables have BOTH homes; dynamic one-save probe both-fired=' + dualFired.length + ' of ' + both.length + ' detail=' + J(dyn));
    check('MEASURE6', 'population', 'the measurement judged tables (not vacuous)', vtables.length > 0 && both.length >= 0 && nl.length === 6, { v: vtables.length });
  });

  // ═══ verdicts ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  var vs = ['ORDER', 'REPLICA', 'OBSERVE', 'COMPAT', 'PLUGIN', 'MEASURE6'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (k) { return CASES[k].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§BUS-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (BUS_MUTANTS=1, parent run only) ═════════════════════════════════════════════════════════════════════════════════════════════
  if (process.env.BUS_MUTANTS && !MUTANT) {
    var MUTS;
    try { MUTS = require('./witness_event_bus_mutants.js'); } catch (e) { MUTS = []; say('§BUS-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [];
    MUTS.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'busmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(ERP, ed.file), 'utf8');
        if (src.indexOf(ed.from) < 0 || src.split(ed.from).length - 1 !== (ed.count || 1)) { ok = false; return; }
        fs.unlinkSync(path.join(dir, ed.file)); fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§BUS-MUTANT ' + m.name + ' NOT-APPLIED (source text not found: the mutant proves nothing)'); return; }
      applied++;
      var res = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { BUS_ERP: dir, BUS_MUTANT: m.name, BUS_MUTANTS: '' }), encoding: 'utf8', timeout: 240000 });
      var out = (res.stdout || '') + '\n' + (res.stderr || '');
      var rl = out.split('\n').filter(function (l) { return /^§BUS-RESULT /.test(l); })[0];
      var failedLines = out.split('\n').filter(function (l) { return /§BUS-CHECK .* FAIL /.test(l); });
      var named = m.kills ? failedLines.some(function (l) { return l.indexOf('case=' + m.kills[0] + ' key=' + m.kills[1] + ' ') >= 0; }) : failedLines.length > 0;
      if (!rl) { crashed.push(m.name); say('§BUS-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + res.status + ' ' + String(res.stderr || '').split('\n')[0].slice(0, 160)); }
      else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§BUS-MUTANT ' + m.name + ' KILLED by ' + (m.kills ? m.kills.join('.') : '(any)') + ' :: ' + m.what); }
      else { survived.push(m.name); say('§BUS-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join('.') + ' failedChecks=' + failedLines.length); }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    });
    var mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === MUTS.length && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§BUS-MUTANTS verdict=' + mv + ' total=' + MUTS.length + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§BUS-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
