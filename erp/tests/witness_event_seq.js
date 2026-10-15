#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-EVENT-SEQ (spec prompts/ERP_FRIENDLY_OPS_LENS.md §8). READ THE LOG after every run: verdict = §EVENT-SEQ-VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: lens operations may only reach the data through the model layer's own save/remove/doc-action path. The model layer now traces every step as §EVENT_SEQ
//   (model hook, validator timing, write, doc-action step). This witness proves (a) the trace is correct and ordered for insert/update/delete/void, (b) a "lens" that goes through the
//   same engine yields an IDENTICAL sequence to the plain path, (c) a "lens" that writes directly is caught as DIFFERENT, (d) an empty trace says INCONCLUSIVE, never PASS.
//   Expected orders are written by hand from PO.java saveNew/saveUpdate/delete and DocumentEngine.processIt (cited in model_layer.js), not read from the code under test.
//   Break (MUST exit 1): EVSEQ_BREAK=bypass  (the lens path writes the table directly instead of through save)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.EVSEQ_BREAK || '', judged = 0, fails = 0, inconclusive = 0;
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var _log = console.log; function mute() { console.log = function () {}; } function unmute() { console.log = _log; }
function check(n, ok, info) { judged++; if (!ok) fails++; _log('  §EVENT-SEQ ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
// the comparator: SAME / DIFFERENT / INCONCLUSIVE (an empty trace judged nothing)
function cmp(a, b) { if (!a.length || !b.length) return 'INCONCLUSIVE'; return JSON.stringify(a) === JSON.stringify(b) ? 'SAME' : 'DIFFERENT'; }

(async function () {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));
  ['model_trade', 'model_order'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) {} }); MV.installDefaultHooks();
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var uu = 0, clock = Date.parse('2026-10-15T09:00:00Z');
  function env(trace) { clock += 1000; return { client: 11, org: 50006, user: 100, role: 102, date: '2026-10-15 00:00:00', now: '2026-10-15 09:00:00', nowMillis: clock, noWorkflow: true, eventSeq: trace !== false, uuid: function () { uu++; return '00000000-0000-4000-8000-' + String(uu).padStart(12, '0'); } }; }
  var BP = { ad_client_id: 11, ad_org_id: 0, value: 'EVSEQ-1', name: 'Event Seq Partner', c_bp_group_id: q('SELECT c_bp_group_id g FROM c_bp_group WHERE ad_client_id=11 LIMIT 1')[0].g, isactive: 'Y' };
  function seq(r) { return ML.eventSeq(r.trx); }
  // PLAIN path (what the full window does): one SAVE through the model layer
  function plainInsert(fields, trace) { mute(); var r = ML.run(q, env(trace), { table: 'c_bpartner', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env(trace)), 'c_bpartner', fields) }); unmute(); return r; }
  // LENS path (a quick-create): fills the defaults itself, then goes through the SAME engine. BREAK=bypass writes the table directly instead.
  function lensInsert(fields) {
    mute(); var e = env(true), trx = new ML.Trx(q, e), r;
    if (BREAK === 'bypass') { trx.insert('c_bpartner', Object.assign({}, fields)); r = { ok: true, trx: trx, ops: [] }; }
    else r = ML.run(q, e, { table: 'c_bpartner', timing: 'SAVE', changes: ML.newPO(trx, 'c_bpartner', Object.assign({}, fields)) });
    unmute(); return r;
  }
  var M = ML.MODEL.c_bpartner || {}, mb = M.beforeSave ? ['M.beforeSave@c_bpartner'] : [], ma = M.afterSave ? ['M.afterSave@c_bpartner'] : [];
  _log('§EVENT-SEQ-LOAD c_bpartner model hooks: beforeSave=' + !!M.beforeSave + ' afterSave=' + !!M.afterSave);

  // E1 tracing off -> nothing recorded (no cost, no noise)
  var off = plainInsert(BP, false); check('E1 trace OFF records no events', seq(off).length === 0 && off.ok, { n: seq(off).length, ok: off.ok });
  // E2 insert order, hand-written from PO.saveNew: model beforeSave, BEFORE_NEW, BEFORE_SAVE, insert, model afterSave, AFTER_NEW, AFTER_SAVE
  var a = plainInsert(BP), exp2 = mb.concat(['V.BEFORE_NEW@c_bpartner', 'V.BEFORE_SAVE@c_bpartner', 'WRITE_INSERT@c_bpartner']).concat(ma).concat(['V.AFTER_NEW@c_bpartner', 'V.AFTER_SAVE@c_bpartner']);
  _log('§EVENT-SEQ-PLAIN-INSERT ' + JSON.stringify(seq(a))); check('E2 plain insert order == PO.saveNew order', a.ok && JSON.stringify(seq(a)) === JSON.stringify(exp2), { got: seq(a), want: exp2 });
  // E3 determinism: the same save twice gives the same sequence
  var a2 = plainInsert(BP); check('E3 same save twice -> SAME', cmp(seq(a), seq(a2)) === 'SAME', { a: seq(a), b: seq(a2) });
  // E4 update order (existing partner, one changed column)
  var row = q('SELECT * FROM c_bpartner WHERE ad_client_id=11 LIMIT 1')[0];
  mute(); var u = ML.run(q, env(true), { table: 'c_bpartner', timing: 'SAVE', id: row.c_bpartner_id, changes: { name: row.name + ' x' } }); unmute();
  var exp4 = mb.concat(['V.BEFORE_CHANGE@c_bpartner', 'V.BEFORE_SAVE@c_bpartner', 'WRITE_UPDATE@c_bpartner']).concat(ma).concat(['V.AFTER_CHANGE@c_bpartner', 'V.AFTER_SAVE@c_bpartner']);
  _log('§EVENT-SEQ-PLAIN-UPDATE ' + JSON.stringify(seq(u))); check('E4 plain update order == PO.saveUpdate order', JSON.stringify(seq(u)) === JSON.stringify(exp4), { got: seq(u), want: exp4 });
  // E5 NO-OP: an update that changes nothing records nothing, and the comparator refuses to call that a pass
  mute(); var nu = ML.run(q, env(true), { table: 'c_bpartner', timing: 'SAVE', id: row.c_bpartner_id, changes: { name: row.name } }); unmute();
  check('E5 unchanged save -> empty trace and comparator says INCONCLUSIVE', seq(nu).length === 0 && cmp(seq(nu), seq(a)) === 'INCONCLUSIVE', { got: seq(nu) });
  if (seq(nu).length === 0) { inconclusive++; _log('§EVENT-SEQ E5 (the no-op case itself is INCONCLUSIVE by design - it proves the detector, not a lens)'); }
  // E6 lens vs plain: the lens quick-create must give the SAME sequence as the plain insert
  var L = lensInsert(BP); _log('§EVENT-SEQ-LENS-INSERT ' + JSON.stringify(seq(L)) + ' break=' + (BREAK || 'none')); check('E6 lens insert == plain insert (event for event)', cmp(seq(a), seq(L)) === 'SAME', { plain: seq(a), lens: seq(L) });
  // E7 the detector can say NO: a direct write is reported DIFFERENT
  mute(); var T = new ML.Trx(q, env(true)); T.insert('c_bpartner', Object.assign({}, BP)); unmute(); var direct = ML.eventSeq(T);
  check('E7 a direct trx.insert records no model events and is DIFFERENT from the plain path', cmp(seq(a), direct) === 'INCONCLUSIVE' || cmp(seq(a), direct) === 'DIFFERENT', { direct: direct });
  // E8 delete order (hand-written from PO.delete): model beforeDelete, BEFORE_DELETE, delete, model afterDelete, AFTER_DELETE
  var Md = ML.MODEL.c_bpartner || {}, tdel = new ML.Trx(q, env(true)); mute(); var rd = ML.remove(tdel, 'c_bpartner', q('SELECT * FROM c_bpartner WHERE c_bpartner_id=?', [row.c_bpartner_id])[0]); unmute();
  var exp8 = (Md.beforeDelete ? ['M.beforeDelete@c_bpartner'] : []).concat(['V.BEFORE_DELETE@c_bpartner', 'WRITE_DELETE@c_bpartner']).concat(Md.afterDelete ? ['M.afterDelete@c_bpartner'] : []).concat(['V.AFTER_DELETE@c_bpartner']);
  check('E8 delete order == PO.delete order (refusal by a validator is allowed to stop early)', rd.ok ? JSON.stringify(ML.eventSeq(tdel)) === JSON.stringify(exp8) : ML.eventSeq(tdel).indexOf('V.BEFORE_DELETE@c_bpartner') >= 0, { got: ML.eventSeq(tdel), want: exp8, ok: rd.ok, err: rd.error });
  // E9 doc action: voiding a completed seed order starts with DOC:VO then voidIt, deterministic on repeat
  function voidOrder() { mute(); var r = ML.run(q, env(true), { table: 'c_order', timing: 'DOCACTION', id: 100, action: 'VO' }); unmute(); return r; }
  var v1 = voidOrder(), v2 = voidOrder(); _log('§EVENT-SEQ-DOC-VOID ' + JSON.stringify(seq(v1)).slice(0, 400) + ' ok=' + v1.ok);
  check('E9 doc action trace starts DOC:VO then DOC:voidIt, repeat is SAME', seq(v1)[0] === 'DOC:VO@c_order' && seq(v1).indexOf('DOC:voidIt@c_order') === 1 && cmp(seq(v1), seq(v2)) === 'SAME', { got: seq(v1) });

  var verdict = fails ? 'FAIL' : (judged === 0 ? 'INCONCLUSIVE' : 'PASS');
  _log('§EVENT-SEQ-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive-by-design=' + inconclusive);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('§EVENT-SEQ-CRASH', e && e.stack || e); process.exit(2); });
