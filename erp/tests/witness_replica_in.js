#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REPLICA-IN (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.2 / §13.3, sub-step 2.6). READ THE LOG after every run: the verdicts are §REPL lines, not the exit code.
// THE ISSUE: a row RECEIVED from another device is placed by the Team projection (rebuildSide) and no listener of any kind fires (§9.1 gap 3), so a trigger hung on afterNewReplication
//   (the POS chain: AD_Table_ScriptValidator I_Order TANR -> twin:process:206) can never run. The core seam: ML.fireReplica(trx, table, row, {isNew}) fires the REPLICA timing of a row that is
//   already placed - stages 1-4 incl. the script-validator rows - and the post* observer with isReplication; the writes the listeners make ride the caller's group.
// SPEC (written before the code):
//   R1 NEW      fireReplica(isNew) fires afterNewReplication (a gate subscriber sees isReplication=true), NOT afterNew and NOT the BEFORE timings; a postCreate observer is queued with isReplication.
//   R2 CHANGE   fireReplica(isNew=false) fires afterChangeReplication, not afterChange.
//   R3 ROW      a TANR AD_Table_ScriptValidator row -> 'twin:W.fn' fires via fireReplica; a row the fn saves (ML.save) rides the SAME ML.run group (ops contain it); writes nothing to the received row.
//   R4 ERROR    the rule returning an error -> fireReplica {ok:false, error} naming it; the caller's savepoint rollback leaves no op of that firing.
//   R5 PARAMS   'twin:process:<ref>?K=V&L=W' runs AD_Process <ref> in the same Trx with params {K:'V', L:'W'} (the twin extension, §13.2); a ref without '?' passes no params (unchanged).
//   R6 STATION  an ordinary save of the same table fires NO replica timing (FL-8: the trigger runs only for a received row).
// Command: node erp/tests/witness_replica_in.js     (REPL_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
var ERP = process.env.REPL_ERP || path.join(__dirname, '..'), MUTANT = process.env.REPL_MUTANT || '';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var _log = console.log, SEEN = []; console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §REPL-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§REPL-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && e.stack || e)); } }

var MUTANTS = [
  { id: 'M1-fires-afterNew', file: 'model_layer.js', from: "var timing = isNew ? 'AFTER_NEW_REPLICATION' : 'AFTER_CHANGE_REPLICATION';", to: "var timing = isNew ? 'AFTER_NEW' : 'AFTER_CHANGE';", kills: 'R1' },
  { id: 'M2-no-post-observer', file: 'model_layer.js', from: "    postEvent(trx, isNew ? 'POST_CREATE' : 'POST_UPDATE', table, row, null, true);   // received-row observers", to: '', kills: 'R1' },
  { id: 'M3-error-swallowed', file: 'model_layer.js', from: "    if (e) return { ok: false, error: e };   // fireReplica", to: '', kills: 'R4' },
  { id: 'M4-params-dropped', file: 'ad_rule.js', from: "{ tableId: t ? Number(t.id) : 0, recordId: rec == null ? 0 : rec, params: pr.params }", to: "{ tableId: t ? Number(t.id) : 0, recordId: rec == null ? 0 : rec }", kills: 'R5' }
];
if (process.env.REPL_MUTANTS === '1') {
  var res = { total: MUTANTS.length, applied: 0, killed: 0, notApplied: [], crashed: [], survived: [] };
  MUTANTS.forEach(function (m) {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replmut-'));
    fs.readdirSync(ERP).forEach(function (f) { if (/\.js$/.test(f)) fs.copyFileSync(path.join(ERP, f), path.join(dir, f)); });
    ['callouts', 'processes'].forEach(function (d) { if (fs.existsSync(path.join(ERP, d))) fs.cpSync(path.join(ERP, d), path.join(dir, d), { recursive: true }); });
    fs.symlinkSync(path.join(ERP, 'ad_seed.db'), path.join(dir, 'ad_seed.db')); fs.mkdirSync(path.join(dir, 'patches')); fs.copyFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), path.join(dir, 'patches/ad_seed.db.sql'));
    var src = fs.readFileSync(path.join(dir, m.file), 'utf8'), n = src.split(m.from).length - 1;
    if (n !== 1) { res.notApplied.push(m.id + '(found ' + n + ')'); say('§REPL-MUTANT id=' + m.id + ' NOT-APPLIED found=' + n); return; }
    fs.writeFileSync(path.join(dir, m.file), src.replace(m.from, m.to)); res.applied++;
    var r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { REPL_ERP: dir, REPL_MUTANT: m.id, REPL_MUTANTS: '' }), encoding: 'utf8', timeout: 180000 });
    var out = String(r.stdout || ''), line = (out.match(new RegExp('§REPL-' + m.kills + ' verdict=\\w+[^\\n]*')) || [null])[0];
    if (!/§REPL-RESULT verdict=/.test(out)) { res.crashed.push(m.id); say('§REPL-MUTANT id=' + m.id + ' CRASHED (not a kill)'); return; }
    if (line && /verdict=FAIL/.test(line)) { res.killed++; say('§REPL-MUTANT id=' + m.id + ' KILLED by ' + m.kills); } else { res.survived.push(m.id); say('§REPL-MUTANT id=' + m.id + ' SURVIVED :: ' + line); }
  });
  var okM = res.applied === res.total && res.killed === res.total;
  say('§REPL-MUTANTS verdict=' + (okM ? 'PASS' : 'FAIL') + ' total=' + res.total + ' applied=' + res.applied + ' killed=' + res.killed + ' notApplied=' + JSON.stringify(res.notApplied) + ' crashed=' + JSON.stringify(res.crashed) + ' survived=' + JSON.stringify(res.survived));
  process.exit(okM ? 0 : 1);
}

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), RULE = require(path.join(ERP, 'ad_rule.js')), AP = require(path.join(ERP, 'ad_process.js'));
  RULE.ensure(db);
  say('§REPL-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' fireReplica=' + typeof ML.fireReplica);
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var uu = 0, clock = Date.parse('2026-10-27T09:00:00Z');
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, date: '2026-10-27 00:00:00', now: '2026-10-27 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var T = 'c_uom', TP = { afterNew: 'adempiere/po/afterNew', afterNewR: 'adempiere/po/afterNewReplication', afterChange: 'adempiere/po/afterChange', afterChangeR: 'adempiere/po/afterChangeReplication', beforeNew: 'adempiere/po/beforeNew', postCreate: 'adempiere/po/postCreate' };
  var row = q('SELECT * FROM c_uom WHERE c_uom_id=100')[0];
  function clean() { MV.subscriptions().forEach(function (s) { if (/^W\./.test(s.name)) MV.unsubscribe(s.topic, s.table, s.name); }); RULE.ruleFunctions().forEach(function (f) { if (/^W\./.test(f.name)) RULE.unregisterRuleFunction(f.name, f.owner); }); db.run('DELETE FROM ad_table_scriptvalidator WHERE ad_table_scriptvalidator_id>=990000'); db.run('DELETE FROM ad_rule WHERE ad_rule_id>=990000'); }
  function rowSet(tableId, code, value) {
    db.run("INSERT INTO ad_rule (ad_rule_id, ad_client_id, ad_org_id, isactive, value, name, ruletype, eventtype, script) VALUES (990001, 0, 0, 'Y', ?, ?, 'S', 'T', '')", [value, value]);
    db.run("INSERT INTO ad_table_scriptvalidator (ad_table_scriptvalidator_id, ad_client_id, ad_org_id, isactive, ad_table_id, ad_rule_id, eventmodelvalidator, seqno) VALUES (990001, 0, 0, 'Y', ?, 990001, ?, 10)", [tableId, code]);
  }
  function fireIn(isNew, extra) { return ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { var r = trx.get(T, 100); var f = ML.fireReplica(trx, T, r, { isNew: isNew }); if (extra) extra(trx); return f.ok ? { ok: true } : { ok: false, error: f.error }; } }); }
  if (typeof ML.fireReplica !== 'function') { check('R1', 'api', 'ModelLayer exposes fireReplica', false, { has: typeof ML.fireReplica }); }
  else {
    guard('R1', 'new', 'fireReplica(isNew) fires afterNewReplication only (isReplication=true), not afterNew / beforeNew; postCreate observer queued with isReplication', function () {
      clean(); var seen = [];
      [['afterNew', TP.afterNew], ['afterNewR', TP.afterNewR], ['beforeNew', TP.beforeNew]].forEach(function (x) { MV.subscribe(x[1], T, 'W.r1.' + x[0], function (c, i) { seen.push(x[0] + ':' + !!i.isReplication); return null; }); });
      var obs = []; MV.subscribe(TP.postCreate, T, 'W.r1.post', function (c, v) { obs.push(!!v.isReplication); return null; });
      var r = fireIn(true); ML.deliverObserved(r, {});
      check('R1', 'new', 'afterNewReplication fired with isReplication, afterNew + beforeNew did not; the postCreate observer got isReplication=true after delivery', r.ok !== false && JSON.stringify(seen) === JSON.stringify(['afterNewR:true']) && JSON.stringify(obs) === JSON.stringify([true]), { seen: seen, obs: obs, ok: r.ok, err: r.error });
    });
    guard('R2', 'change', 'fireReplica(isNew=false) fires afterChangeReplication, not afterChange', function () {
      clean(); var seen = [];
      [['afterChange', TP.afterChange], ['afterChangeR', TP.afterChangeR]].forEach(function (x) { MV.subscribe(x[1], T, 'W.r2.' + x[0], function () { seen.push(x[0]); return null; }); });
      fireIn(false);
      check('R2', 'change', 'only afterChangeReplication fired', JSON.stringify(seen) === JSON.stringify(['afterChangeR']), { seen: seen });
    });
    guard('R3', 'row', 'a TANR script-validator row fires through fireReplica; its writes ride the same group', function () {
      clean(); rowSet(133, 'TANR', 'twin:W.r3');   // AD_Table 133 = C_UOM? resolved below
      var tid = q("SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)='c_uom'")[0].id; db.run('UPDATE ad_table_scriptvalidator SET ad_table_id=? WHERE ad_table_scriptvalidator_id=990001', [tid]);
      var n = 0; RULE.registerRuleFunction('W.r3', function (b) { n++; var s = ML.save(b.trx, 'c_uom', null, { name: 'REPL W3', x12de355: 'R3', uomsymbol: 'r3', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }); return s.ok ? null : s.error; }, { owner: 'W' });
      var r = fireIn(true), creates = (r.ops || []).filter(function (o) { return o.op_type === 'CRUD_CREATE' && o.table === 'c_uom'; }).length;
      var own = ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, { name: 'REPL W6 own', x12de355: 'R6', uomsymbol: 'r6', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }); return { ok: true }; } });
      check('R3', 'row', 'the rule ran once and its c_uom create is in the SAME group; the received row itself is not written', n === 1 && r.ok !== false && creates === 1 && !(r.ops || []).some(function (o) { return o.op_type === 'CRUD_UPDATE' && o.table === 'c_uom' && Number(o.id) === 100; }), { n: n, ok: r.ok, err: r.error, ops: (r.ops || []).map(function (o) { return o.op_type + ':' + o.table; }) });
      check('R6', 'station', 'an ordinary CREATE on the same table (the station\'s own save) fires no TANR rule (FL-8)', n === 1 && own.ok !== false, { n: n, own: own.ok });
    });
    guard('R4', 'error', 'a rule error comes back from fireReplica and the savepoint rollback leaves no op', function () {
      clean(); var tid = q("SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)='c_uom'")[0].id; rowSet(tid, 'TANR', 'twin:W.r4');
      RULE.registerRuleFunction('W.r4', function (b) { ML.save(b.trx, 'c_uom', null, { name: 'REPL W4', x12de355: 'R4', uomsymbol: 'r4', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }); return 'R4 says no'; }, { owner: 'W' });
      var got = null, r = ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { var sp = trx.setSavepoint(); var f = ML.fireReplica(trx, T, trx.get(T, 100), { isNew: true }); got = f; if (!f.ok) trx.rollbackTo(sp); return { ok: true }; } });
      check('R4', 'error', 'fireReplica {ok:false} with the rule text; after rollbackTo the group has no c_uom create', got && got.ok === false && /R4 says no/.test(String(got.error)) && !(r.ops || []).some(function (o) { return o.op_type === 'CRUD_CREATE' && o.table === 'c_uom'; }), { got: got, ops: (r.ops || []).length });
    });
  }
  guard('R5', 'params', "twin:process:<ref>?K=V&L=W passes {K:'V',L:'W'} to runInTrx; no '?' passes none", function () {
    clean(); var tid = q("SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)='c_uom'")[0].id, calls = [], orig = AP.runInTrx;
    AP.runInTrx = function (trx, ref, opts) { calls.push({ ref: String(ref), params: opts && opts.params || null }); return { ok: true, dispatched: true, summary: 'stub' }; };
    try {
      rowSet(tid, 'TAN', 'twin:process:242?DocAction=CO&Extra=7');
      ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, { name: 'REPL W5', x12de355: 'R5', uomsymbol: 'r5', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }); return { ok: true }; } });
      db.run("UPDATE ad_rule SET value='twin:process:242' WHERE ad_rule_id=990001");
      ML.run(q, env(), { table: T, timing: 'PROCESS', fn: function (trx) { ML.save(trx, T, null, { name: 'REPL W5b', x12de355: 'R5b', uomsymbol: 'r5b', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }); return { ok: true }; } });
    } finally { AP.runInTrx = orig; }
    check('R5', 'params', 'first call ref 242 with {DocAction:CO, Extra:7}; second ref 242 with no params', calls.length === 2 && calls[0].ref === '242' && JSON.stringify(calls[0].params) === JSON.stringify({ DocAction: 'CO', Extra: '7' }) && calls[1].ref === '242' && (calls[1].params == null || !Object.keys(calls[1].params).length), { calls: calls });
  });
  clean();
  SEEN.filter(function (s) { return /§BUS_REPLICA|§RULE_(FIRE|VETO|PROCESS)/.test(s); }).slice(0, 12).forEach(function (s) { say('  shipped: ' + s.slice(0, 200)); });
  var vs = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map(verdict), failed = Object.keys(CASES).filter(function (k) { return CASES[k].failed; });
  say('§REPL-RESULT verdict=' + (failed.length ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + JSON.stringify(failed));
  process.exit(ALL.failed ? 1 : 0);
})().catch(function (e) { say('§REPL-RESULT verdict=FAIL crashed ' + (e && e.stack)); process.exit(2); });
