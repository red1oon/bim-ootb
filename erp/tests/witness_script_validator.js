#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BUS-ROW (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §10.3, §10.7, §10.8; CARDINAL RULE: the twin's trigger layer is legacy's).
//   READ THE LOG after every run: every verdict is a §RULE line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict.
// SPEC (the claims, written before the code). STAGE 3 of ModelValidationEngine.fireModelChange (ModelValidationEngine.java:417-466) and fireDocValidate (:605-655):
//   after the validators of every client and of this client, BEFORE the event handlers, the dictionary rows  AD_Table_ScriptValidator (AD_Table_ID, EventModelValidator, AD_Rule_ID, SeqNo)
//   of THIS table and THIS event run, active only, ORDER BY SeqNo (MTableScriptValidator.getModelValidatorRules :88-124). Each points at an AD_Rule; legacy runs it only when the rule is
//   active, RuleType='S' (JSR223) and EventType='T' (table events) / 'D' (document events). The script's return text is the error: non-empty = veto (the first one stops stage 3 and everything after it);
//   an exception = its text is the error. EventModelValidator codes (X_AD_Table_ScriptValidator.java:218-268) map to the timings by ModelValidator.tableEventValidators/documentEventValidators
//   (:80-150) INCLUDING the replication ones TANR/TACR/TBDR.
//   TWIN FORM (owner §10.7, 2026-10-27): AD_Rule.Value = '<engine>:<name>' (MRule.getEngineName :260). engine 'twin' resolves <name> in a REGISTRY of ported functions, or 'process:<AD_Process value|id>' = a ported
//   AD_Process run through ad_process.js runJava IN THE SAVE'S OWN TRANSACTION (its writes ride the save's op group). groovy: / beanshell: / jython: / javascript: / no engine = NAMED-UNPORTED: reported with a
//   §RULE_UNPORTED line and in the result, never executed, never silently skipped, never a veto. A twin: name nobody registered = a veto naming it (legacy: "Engine not found" is an error).
//   BASE: the two tables are NOT appended to patches/ad_seed.db.sql (that changes the team BASE hash and no base-upgrade path exists: §10.8 STEP 0). They are an idempotent boot overlay (AdRule.ensure(db)),
//   the same class as SystemTenant.ensure; the dictionary rows (AD_Table 53058/53059 + 31 AD_Column) are already in the seed.
//   W-BUS-ROW claims, each below as a check:  TABLES (ensure creates exactly the dictionary's columns, idempotent) · BASE (the team base hash is byte-identical to the pinned pre-change value) ·
//   REPLICA (a TANR row fires on saveReplica and NOT on an ordinary save; FL-8) · VETO+POSITION (TBN row blocks the save with its text; global validator ran before, handler after did not) ·
//   SEQ (SeqNo order, first error stops) · RETURN (null/''/undefined ok, text veto, throw veto) · UNPORTED (groovy/beanshell/javascript/no-engine reported, not run, no veto, chain continues) ·
//   GATES (IsActive N on the row or the rule, RuleType<>S, EventType mismatch, other table = not run; each with a control that DOES run) · MISSING (unregistered twin: name = veto) ·
//   CODES (all 25 legacy timings of ModelValidator.java map to the legacy code and fire: X of 25) · PROCESS (twin:process: runs a real shipped process, its writes land in the same op group; absent process = veto) ·
//   PLUGIN (ctx.rules.register is owner-scoped and undone on stop) · REGISTRY (stacked registrations, owner removal restores the previous).
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (RULE_MUTANTS=1): each rewrites the shipped source, proves the rewrite APPLIED, and the named check must go FAIL in a
//   child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_script_validator.js            (add RULE_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.RULE_ERP || path.join(__dirname, '..');
var MUTANT = process.env.RULE_MUTANT || '';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };     // the shipped § lines are evidence: captured, then re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §RULE-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§RULE-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
// the team base as erp/team_sync.js hashBase computes it (an independent oracle in node): the seed file, then the two self-heal patch texts idempiere.html applies
var BASE_PIN = 'a3eef3f59d775cc2adfc320b82c8ec5c8045721d74490c5dfaa421cbf595b8ab';       // measured on origin/main 90233440 (STEP 0); a later INTENDED base change must move this pin on purpose · MOVED ON PURPOSE 2026-10-31: user Search Keys patch (TEAMWORK §48.11d, owner "Patch it"); was d35e8a75…
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // the self-heal patch, statement by statement (idempiere.html FS-15 loader)
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master', 'model_rma', 'model_asi', 'model_dd', 'model_movement', 'model_inventory', 'model_post'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) { /* a model class needing a browser-only global stays unregistered */ } });
  var AR = null, arErr = null; try { AR = require(path.join(ERP, 'ad_rule.js')); } catch (e) { arErr = e.message; }
  var AC = null, AP = null, PR = null;
  try { AC = require(path.join(ERP, 'ad_callout.js')); ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); }); } catch (e) { arErr = (arErr || '') + ' callouts:' + e.message; }
  try { AP = require(path.join(ERP, 'ad_process.js')); require(path.join(ERP, 'processes', 'InvoicePayScheduleValidate.js')); } catch (e) { arErr = (arErr || '') + ' process:' + e.message; }
  try { PR = require(path.join(ERP, 'plugin_registry.js')); } catch (e) { arErr = (arErr || '') + ' plugin_registry:' + e.message; }
  say('§RULE-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' adRule=' + (AR ? ['ensure', 'stage3', 'registerRuleFunction', 'unregisterRuleOwner', 'attach'].map(function (k) { return k + ':' + typeof AR[k]; }).join(',') : 'ABSENT (' + arErr + ')') +
      ' busStage=' + (typeof MV.setScriptStage) + ' runInTrx=' + (AP ? typeof AP.runInTrx : 'n/a'));

  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var uu = 0, clock = Date.parse('2026-10-27T09:00:00Z');
  function env(o) { clock += 1000; return Object.assign({ client: 11, org: 11, user: 100, date: '2026-10-27 00:00:00', now: '2026-10-27 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }, o || {}); }
  var T = 'c_uom';                                   // a real dictionary table with no model class and no hooks: the bus and the rule rows are the only thing on it
  function uomFields(n, extra) { return Object.assign({ name: 'RULEW ' + n, x12de355: 'R' + n, uomsymbol: 'r' + n, stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }, extra || {}); }
  function inTrx(fn, e) { return ML.run(q, env(e), { table: T, timing: 'PROCESS', fn: fn }); }
  function tid(t) { var r = q('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=?', [t])[0]; return r ? Number(r.id) : null; }
  var rid = 9100000, svid = 9200000;
  function addRule(o) { rid++; o = Object.assign({ value: 'twin:W.none', ruletype: 'S', eventtype: 'T', isactive: 'Y', script: null }, o || {});
    db.run('INSERT INTO ad_rule (ad_client_id, ad_org_id, ad_rule_id, accesslevel, entitytype, eventtype, isactive, name, ruletype, script, value, ad_rule_uu) VALUES (0,0,?,?,?,?,?,?,?,?,?,?)', [rid, '3', 'U', o.eventtype, o.isactive, 'W rule ' + rid, o.ruletype, o.script, o.value, 'w-rule-uu-' + rid]); return rid; }
  function addSV(table, code, ruleId, seqno, active) { svid++;
    db.run('INSERT INTO ad_table_scriptvalidator (ad_client_id, ad_org_id, ad_rule_id, ad_table_id, ad_table_scriptvalidator_id, eventmodelvalidator, isactive, seqno, ad_table_scriptvalidator_uu) VALUES (0,0,?,?,?,?,?,?,?)',
      [ruleId, tid(table), svid, code, active || 'Y', seqno == null ? 10 : seqno, 'w-sv-uu-' + svid]); return svid; }
  function rowSet(table, code, value, o) { o = o || {}; var spec = { value: value };
    if (o.ruletype !== undefined) spec.ruletype = o.ruletype; if (o.eventtype !== undefined) spec.eventtype = o.eventtype; if (o.ruleActive !== undefined) spec.isactive = o.ruleActive; if (o.script !== undefined) spec.script = o.script;
    var r = addRule(spec); return { rule: r, sv: addSV(o.svTable || table, code, r, o.seq, o.svActive) }; }
  function wipeRows() { try { db.run('DELETE FROM ad_table_scriptvalidator'); db.run('DELETE FROM ad_rule'); } catch (e) { /* tables absent: RED path */ } }
  function clean() {
    wipeRows(); if (AR && AR.unregisterRuleOwner) AR.unregisterRuleOwner('W');
    try { (MV.subscriptions ? MV.subscriptions() : []).forEach(function (s) { if (/^W\./.test(s.name)) MV.unsubscribe(s.topic, s.table, s.name); }); } catch (e) {}
    ['BEFORE_NEW', 'AFTER_NEW', 'AFTER_NEW_REPLICATION', 'AFTER_CHANGE_REPLICATION', 'BEFORE_CHANGE', 'AFTER_CHANGE', 'BEFORE_COMPLETE'].forEach(function (ti) {
      [T, 'c_order'].forEach(function (t) { var a = (MV.REGISTRY[t] || {})[ti]; if (a) a.slice().forEach(function (h) { if (/^W\./.test(h.name)) MV.unregisterValidator(t, ti, h.name); }); });
    });
  }
  function reg(name, fn) { AR.registerRuleFunction(name, fn, { owner: 'W' }); }
  function logsSince(n) { return SEEN.slice(n); }

  // ═══ TABLES / BASE ═══════════════════════════════════════════════════════════════════════════════════════════════════
  say('§RULE-SPEC stage 3 = AD_Table_ScriptValidator rows -> AD_Rule(Value=<engine>:<name>) after client validators, before event handlers; twin: engine = registry / twin:process:; the team base hash must not move');
  var dictCols = function (t) { return q('SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table x ON x.ad_table_id=c.ad_table_id WHERE lower(x.tablename)=?', [t]).map(function (r) { return r.c; }).sort(); };
  var physCols = function (t) { return q('PRAGMA table_info(' + t + ')').map(function (r) { return String(r.name).toLowerCase(); }).sort(); };
  var hasTable = function (t) { return q("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t]).length; };
  guard('TABLES', 'ensure', 'AdRule.ensure(db) creates the two physical tables the dictionary already describes (31 AD_Column rows), idempotently', function () {
    var pre = hasTable('ad_rule') + hasTable('ad_table_scriptvalidator');
    var n1 = AR ? AR.ensure(db) : -1, n2 = AR ? AR.ensure(db) : -1;
    var dr = dictCols('ad_rule'), ds = dictCols('ad_table_scriptvalidator'), pr = physCols('ad_rule'), ps = physCols('ad_table_scriptvalidator');
    check('TABLES', 'ensure', 'before: no physical table in the shipped base (pre=0); ensure creates 2 then 0; physical columns == dictionary columns for both (X of 2)',
      pre === 0 && n1 === 2 && n2 === 0 && J(dr) === J(pr) && J(ds) === J(ps) && dr.length > 0 && ds.length > 0, { pre: pre, n1: n1, n2: n2, dictRule: dr.length, physRule: pr.length, dictSV: ds.length, physSV: ps.length });
  });
  guard('BASE', 'hash', 'the team BASE hash (seed file + the two patch texts) is byte-identical to the pre-change value: an existing team is not broken', function () {
    var h = baseOracle();
    say('§RULE-BASE sha256=' + h + ' pin=' + BASE_PIN);
    check('BASE', 'hash', 'baseOracle() == pinned sha256 d35e8a75a3be0629... (patches/ad_seed.db.sql and mfg.sql untouched, no third hashed file)', h === BASE_PIN, { have: h.slice(0, 16), want: BASE_PIN.slice(0, 16) });
  });
  clean();

  // ═══ REPLICA — the FL-8 property: a row on afterNewReplication runs for a RECEIVED row, never for the station's own save ═══════════════════════════
  guard('REPLICA', 'fires-on-replica', 'TANR row + twin:W.mark fires on saveReplica (once, with legacy bindings) and NOT on an ordinary save', function () {
    clean(); var calls = [];
    reg('W.mark', function (b) { calls.push({ table: b.table, event: b.event, type: b.type, name: b.po && b.po.name, repl: b.isReplication, hasTrx: !!b.trx }); return null; });
    rowSet(T, 'TANR', 'twin:W.mark');
    var own = inTrx(function (trx) { var s = ML.save(trx, T, null, uomFields(1)); return { ok: s.ok, error: s.error }; });
    var nOwn = calls.length;
    var m0 = SEEN.length, rep = inTrx(function (trx) { var s = ML.saveReplica(trx, T, null, uomFields(2)); return { ok: s.ok, error: s.error }; });
    check('REPLICA', 'fires-on-replica', 'ordinary save: rule ran 0x and the save stands; replica save: rule ran exactly 1x with table=c_uom event=TANR type=AFTER_NEW_REPLICATION po.name and a trx, the save stands',
      own.ok !== false && nOwn === 0 && rep.ok !== false && calls.length === 1 && calls[0].table === T && calls[0].event === 'TANR' && calls[0].type === 'AFTER_NEW_REPLICATION' && calls[0].name === 'RULEW 2' && calls[0].repl === true && calls[0].hasTrx === true,
      { own: own.ok, nOwn: nOwn, rep: rep.ok, calls: calls });
    check('REPLICA', 'log', 'the shipped §RULE_FIRE line names the table, event code and rule', logsSince(m0).some(function (l) { return /^§RULE_FIRE table=c_uom event=TANR timing=AFTER_NEW_REPLICATION rule=twin:W\.mark/.test(l); }), logsSince(m0).filter(function (l) { return /RULE/.test(l); }));
  });
  guard('REPLICA', 'change-and-delete', 'TACR fires only on a replica change; TBDR only on a replica delete; TAC (ordinary change) row does not fire for a replica change', function () {
    clean(); var o = [];
    reg('W.tacr', function () { o.push('TACR'); return null; }); reg('W.tbdr', function () { o.push('TBDR'); return null; }); reg('W.tac', function () { o.push('TAC'); return null; });
    rowSet(T, 'TACR', 'twin:W.tacr'); rowSet(T, 'TBDR', 'twin:W.tbdr'); rowSet(T, 'TAC', 'twin:W.tac');
    var a = inTrx(function (trx) { var s = ML.saveReplica(trx, T, trx.get(T, 100), { description: 'rule replica change' }); return { ok: s.ok }; }); var afterChangeR = o.slice();
    var b2 = inTrx(function (trx) { var s = ML.save(trx, T, trx.get(T, 100), { description: 'rule own change' }); return { ok: s.ok }; }); var afterChange = o.slice();
    var c = inTrx(function (trx) { var s = ML.removeReplica(trx, T, trx.get(T, 101)); return { ok: s.ok }; });
    check('REPLICA', 'change-and-delete', 'replica change -> [TACR]; ordinary change -> +[TAC]; replica delete -> +[TBDR]', J(afterChangeR) === J(['TACR']) && J(afterChange) === J(['TACR', 'TAC']) && J(o) === J(['TACR', 'TAC', 'TBDR']), { afterChangeR: afterChangeR, afterChange: afterChange, o: o, a: a.ok, b: b2.ok, c: c.ok });
  });

  // ═══ VETO + POSITION ═════════════════════════════════════════════════════════════════════════════════════════════════
  guard('VETO', 'position', 'a TBN row returning text blocks the save with that text; the global validator ran BEFORE it, the event handler AFTER it did not run', function () {
    clean(); var o = [];
    MV.registerValidator(T, 'BEFORE_NEW', 'W.VG', function () { o.push('VG'); return null; });
    reg('W.veto', function () { o.push('RULE'); return 'Rule says no'; });
    MV.subscribe('adempiere/po/beforeNew', T, 'W.H', function () { o.push('H'); return null; });
    rowSet(T, 'TBN', 'twin:W.veto');
    var r = inTrx(function (trx) { var s = ML.save(trx, T, null, uomFields(10)); return { ok: s.ok, error: s.error }; });
    var made = (r.ops || []).filter(function (x) { return x && x.table === T; }).length;
    check('VETO', 'position', 'order [VG, RULE] (handler never ran), the run is refused with error "Rule says no", no c_uom op in the group', J(o) === J(['VG', 'RULE']) && r.ok === false && /Rule says no/.test(String(r.error || '')) && made === 0, { o: o, ok: r.ok, error: r.error, made: made });
    clean(); o = [];
    MV.registerValidator(T, 'BEFORE_NEW', 'W.VG', function () { o.push('VG'); return null; });
    reg('W.pass', function () { o.push('RULE'); return null; });
    MV.subscribe('adempiere/po/beforeNew', T, 'W.H', function () { o.push('H'); return null; });
    rowSet(T, 'TBN', 'twin:W.pass');
    var r2 = inTrx(function (trx) { var s = ML.save(trx, T, null, uomFields(11)); return { ok: s.ok, error: s.error }; });
    check('VETO', 'control-pass', 'CONTROL: the same row with a passing function: order [VG, RULE, H] and the save stands (so the block above is the rule, not the harness)', J(o) === J(['VG', 'RULE', 'H']) && r2.ok !== false, { o: o, ok: r2.ok });
    clean(); o = [];
    MV.registerValidator(T, 'BEFORE_NEW', 'W.VG', function () { o.push('VG'); return 'validator says no'; });
    reg('W.never', function () { o.push('RULE'); return null; });
    rowSet(T, 'TBN', 'twin:W.never');
    var f3 = MV.fireHooks('BEFORE_NEW', { table: T, record: { ad_client_id: 11 } }, { q: q });
    check('VETO', 'validator-first', 'a validator error stops BEFORE stage 3: the rule never ran', J(o) === J(['VG']) && f3.ok === false && f3.error === 'validator says no', { o: o, f3: f3 });
  });
  guard('VETO', 'dispatch', 'the topic entry (dispatch) runs stage 3 too: same dispatcher', function () {
    clean(); var o = [];
    reg('W.d', function () { o.push('RULE'); return 'via dispatch'; }); rowSet(T, 'TAN', 'twin:W.d');
    var r = MV.dispatch('adempiere/po/afterNew', { table: T, record: { ad_client_id: 11 } }, { q: q });
    check('VETO', 'dispatch', 'dispatch(afterNew) runs the TAN row and returns its error', J(o) === J(['RULE']) && r.ok === false && r.error === 'via dispatch' && r.topic === 'adempiere/po/afterNew', { o: o, r: r });
  });

  // ═══ SEQ / RETURN ════════════════════════════════════════════════════════════════════════════════════════════════════
  guard('SEQ', 'order-and-stop', 'rows run ORDER BY SeqNo (inserted out of order); the first error stops the rest', function () {
    clean(); var o = [];
    reg('W.s30', function () { o.push(30); return null; }); reg('W.s10', function () { o.push(10); return null; }); reg('W.s20', function () { o.push(20); return 'stop at 20'; });
    rowSet(T, 'TAN', 'twin:W.s30', { seq: 30 }); rowSet(T, 'TAN', 'twin:W.s10', { seq: 10 }); rowSet(T, 'TAN', 'twin:W.s20', { seq: 20 });
    var r = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    check('SEQ', 'order-and-stop', 'order [10, 20]; seq 30 never ran; error "stop at 20"; blocked names the rule value', J(o) === J([10, 20]) && r.ok === false && r.error === 'stop at 20' && /twin:W\.s20/.test(String(r.blocked)), { o: o, r: r });
  });
  guard('RETURN', 'semantics', 'null/""/undefined = no error; text = veto; a throw = veto with the exception text (java: error = e.toString())', function () {
    var res = {};
    [['null', function () { return null; }], ['empty', function () { return ''; }], ['undef', function () {}], ['text', function () { return 'bad'; }], ['throw', function () { throw new Error('boom'); }]].forEach(function (c) {
      clean(); reg('W.ret', c[1]); rowSet(T, 'TAN', 'twin:W.ret');
      var r = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q }); res[c[0]] = { ok: r.ok, error: r.error };
    });
    check('RETURN', 'semantics', 'null/empty/undef ok; text -> "bad"; throw -> error text contains "boom"', res['null'].ok && res.empty.ok && res.undef.ok && res.text.ok === false && res.text.error === 'bad' && res.throw.ok === false && /boom/.test(res.throw.error), res);
  });

  // ═══ UNPORTED — never executed, never silent, never a veto ═══════════════════════════════════════════════════════════
  guard('UNPORTED', 'named', 'groovy:/beanshell:/javascript:/no-engine rules are reported (result + §RULE_UNPORTED), NOT executed, do not veto, and the chain continues', function () {
    clean(); delete global.__RULE_EXEC; var o = [];
    rowSet(T, 'TAN', 'groovy:Hello', { seq: 1, script: 'globalThis.__RULE_EXEC = "groovy"' });
    rowSet(T, 'TAN', 'beanshell:Hello', { seq: 2, script: 'globalThis.__RULE_EXEC = "beanshell"' });
    rowSet(T, 'TAN', 'javascript:Hello', { seq: 3, script: 'globalThis.__RULE_EXEC = "javascript"' });
    rowSet(T, 'TAN', 'NoEngineHere', { seq: 4, script: 'globalThis.__RULE_EXEC = "noengine"' });
    reg('W.after', function () { o.push('after'); return null; }); rowSet(T, 'TAN', 'twin:W.after', { seq: 5 });
    var m0 = SEEN.length, r = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    var ls = logsSince(m0).filter(function (l) { return /^§RULE_UNPORTED /.test(l); });
    check('UNPORTED', 'named', 'ok result, unported == the 4 values in SeqNo order, 4 §RULE_UNPORTED lines, the script text was never run (global flag unset), the twin rule after them still ran',
      r.ok === true && J(r.unported) === J(['groovy:Hello', 'beanshell:Hello', 'javascript:Hello', 'NoEngineHere']) && ls.length === 4 && global.__RULE_EXEC === undefined && J(o) === J(['after']), { r: r, ls: ls.length, flag: global.__RULE_EXEC, o: o });
    var m1 = SEEN.length, r2 = MV.fireHooks('AFTER_NEW', { table: 'c_bpartner', record: {} }, { q: q });
    check('UNPORTED', 'clean-result', 'CONTROL: a table with no rows has NO unported field and no §RULE line (the result shape is the pre-stage-3 one)', r2.ok === true && r2.unported === undefined && !logsSince(m1).some(function (l) { return /^§RULE/.test(l); }), { r2: r2 });
  });

  // ═══ GATES — each flag stops the rule, each has a control that runs ══════════════════════════════════════════════════
  guard('GATES', 'flags', 'IsActive=N on the row, IsActive=N on the rule, RuleType<>S, EventType mismatch, another table: NOT run; the all-valid control runs', function () {
    var cases = [['control (all valid)', {}], ['row inactive', { svActive: 'N' }], ['rule inactive', { ruleActive: 'N' }], ['ruletype Q (SQL)', { ruletype: 'Q' }],
      ['eventtype D on a table event', { eventtype: 'D' }], ['row on another table', { svTable: 'c_bpartner' }], ['other event code', {}]];
    var got = {};
    cases.forEach(function (c) {
      clean(); var n = 0; reg('W.g', function () { n++; return null; });
      var r = rowSet(T, 'TAN', 'twin:W.g', c[1]);
      if (c[0] === 'other event code') db.run('UPDATE ad_table_scriptvalidator SET eventmodelvalidator=? WHERE ad_table_scriptvalidator_id=?', ['TAC', r.sv]);
      MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q }); got[c[0]] = n;
    });
    check('GATES', 'flags', 'control ran 1x; every gated case ran 0x', got['control (all valid)'] === 1 && Object.keys(got).filter(function (k) { return k !== 'control (all valid)'; }).every(function (k) { return got[k] === 0; }), got);
    var dn = {};
    [['TAN row on a document timing', 'TAN', 'T', 0], ['DBCO row typed T on BEFORE_COMPLETE', 'DBCO', 'T', 0], ['DBCO row typed D on BEFORE_COMPLETE (control)', 'DBCO', 'D', 1]].forEach(function (c) {
      clean(); var n = 0; reg('W.g', function () { n++; return null; }); rowSet(T, c[1], 'twin:W.g', { eventtype: c[2] });
      MV.fireHooks('BEFORE_COMPLETE', { table: T, record: {} }, { q: q }); dn[c[0]] = n;
    });
    check('GATES', 'doc-vs-table', 'a table-event row never fires on a document timing; a document row needs EventType D (T-typed = 0x, D-typed control = 1x)', dn['TAN row on a document timing'] === 0 && dn['DBCO row typed T on BEFORE_COMPLETE'] === 0 && dn['DBCO row typed D on BEFORE_COMPLETE (control)'] === 1, dn);
    var m0 = SEEN.length; clean(); reg('W.g', function () { return null; }); rowSet(T, 'TAN', 'twin:W.g', { ruleActive: 'N' }); MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    check('GATES', 'skip-log', 'a skipped rule says so (§RULE_SKIP ... reason), nothing is skipped silently', logsSince(m0).some(function (l) { return /^§RULE_SKIP .*reason=inactive/.test(l); }), logsSince(m0).filter(function (l) { return /RULE/.test(l); }));
  });
  guard('MISSING', 'veto', 'twin: name nobody registered = a veto naming it (legacy "Engine not found" is an error), §RULE_MISSING logged', function () {
    clean(); rowSet(T, 'TAN', 'twin:W.nobody'); var m0 = SEEN.length;
    var r = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    check('MISSING', 'veto', 'ok=false and the error names twin:W.nobody; one §RULE_MISSING line', r.ok === false && /twin:W\.nobody/.test(String(r.error)) && logsSince(m0).filter(function (l) { return /^§RULE_MISSING /.test(l); }).length === 1, { r: r });
  });

  // ═══ CODES — X of 25 legacy timings ═════════════════════════════════════════════════════════════════════════════════
  guard('CODES', 'x-of-25', 'every timing of ModelValidator.java (9 table + 16 document) maps to its legacy EventModelValidator code and fires a rule row of that code (X of 25)', function () {
    var cand = [process.env.IDEMPIERE_SRC, path.join(os.homedir(), 'idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model')].filter(Boolean);
    var dir = cand.filter(function (d) { return fs.existsSync(path.join(d, 'ModelValidator.java')); })[0];
    if (!dir) { say('  ⚪ INCONCLUSIVE CODES — legacy source not found (' + cand.join(' | ') + ')'); return; }
    var mv = fs.readFileSync(path.join(dir, 'ModelValidator.java'), 'utf8'), xs = fs.readFileSync(path.join(dir, 'X_AD_Table_ScriptValidator.java'), 'utf8');
    var codeOf = {}; xs.replace(/EVENTMODELVALIDATOR_(\w+) = "(\w+)"/g, function (_, k, v) { codeOf[k] = v; return ''; });
    var pairs = [];                                                                // [twin timing, legacy code, 'T'|'D']
    ['tableEventValidators', 'documentEventValidators'].forEach(function (arr) {
      var body = mv.split('public static String[] ' + arr)[1].split('};')[0];
      body.split('\n').forEach(function (ln) { var m = /X_AD_Table_ScriptValidator\.EVENTMODELVALIDATOR_(\w+)[ ,]*\/\/ (?:TYPE|TIMING)_(\w+) = \d+/.exec(ln); if (m) pairs.push([m[2], codeOf[m[1]], arr[0] === 't' ? 'T' : 'D']); });
    });
    var okN = 0, bad = [];
    pairs.forEach(function (p) {
      clean(); var seen = []; reg('W.c', function (b) { seen.push(b.event); return null; });
      rowSet(T, p[1], 'twin:W.c', { eventtype: p[2] });
      var r = MV.fireHooks(p[0], { table: T, record: {} }, { q: q });
      if (r.ok === true && J(seen) === J([p[1]])) okN++; else bad.push(p[0] + '->' + p[1] + ' seen=' + J(seen));
    });
    say('§RULE-CODES parsed=' + pairs.length + ' fired=' + okN + ' bad=' + J(bad));
    check('CODES', 'x-of-25', 'parsed 25 pairs from the legacy Java and all 25 fired exactly their own code (' + okN + ' of ' + pairs.length + ')', pairs.length === 25 && okN === 25, { parsed: pairs.length, ok: okN, bad: bad });
  });

  // ═══ DOCACTION — stage 3 on the real document path (fireDocValidate), not only the direct fireHooks call ═══════════════════════════════
  guard('DOCACTION', 'complete', 'a DBCO row (EventType D) on m_inventory vetoes a real Complete (ML.run DOCACTION CO) with the rule text and no ops; an inactive row / no row completes (control)', function () {
    function complete(noRow) {
      var r = ML.run(q, env({ noWorkflow: true }), { table: 'm_inventory', timing: 'DOCACTION', id: 100, action: 'CO' }); return r;
    }
    clean(); var base = complete();
    clean(); var n = 0; reg('W.docveto', function (b) { n++; return 'doc rule says no'; }); rowSet('m_inventory', 'DBCO', 'twin:W.docveto', { eventtype: 'D' });
    var veto = complete(), ran = n;
    clean(); n = 0; reg('W.docveto', function () { n++; return 'doc rule says no'; }); rowSet('m_inventory', 'DBCO', 'twin:W.docveto', { eventtype: 'D', svActive: 'N' });
    var off = complete(), ranOff = n;
    check('DOCACTION', 'complete', 'control (no row) completes with ops; with the DBCO row the Complete is refused with "doc rule says no", fn ran 1x, no ops; row inactive -> completes, fn 0x',
      base.ok === true && (base.ops || []).length > 0 && veto.ok === false && /doc rule says no/.test(String(veto.error || veto.msg || '')) && (veto.ops || []).length === 0 && ran === 1 && off.ok === true && ranOff === 0, { base: base.ok, baseOps: (base.ops || []).length, veto: veto.ok, vetoErr: veto.error || veto.msg, vetoOps: (veto.ops || []).length, ran: ran, off: off.ok, ranOff: ranOff });
  });

  // ═══ PROCESS — twin:process: runs a REAL shipped process in the save's own transaction ═══════════════════════════════
  guard('PROCESS', 'same-group', 'a TACR row with twin:process:242 (C_InvoicePaySchedule Validate) runs on a replica change; the invoice update lands in the SAME op group as the replica save; an ordinary save runs nothing', function () {
    if (!AP || !AC || (AP && typeof AP.runInTrx !== 'function')) { check('PROCESS', 'same-group', 'ad_process.runInTrx exists and the process corpus loads', false, { ap: !!AP, ac: !!AC, runInTrx: AP && typeof AP.runInTrx, arErr: arErr }); return; }
    var SCH = 'c_invoicepayschedule', IV = 'c_invoice';
    var inv0 = q('SELECT ispayschedulevalid AS v FROM c_invoice WHERE c_invoice_id=109')[0].v;
    function run(fn) { return ML.run(q, env(), { table: SCH, timing: 'PROCESS', fn: fn }); }
    function replicaEdit() { return run(function (trx) { var s = ML.saveReplica(trx, SCH, trx.get(SCH, 102), { dueamt: 100 }); return { ok: s.ok, error: s.error }; }); }
    function ownEdit() { return run(function (trx) { var s = ML.save(trx, SCH, trx.get(SCH, 102), { dueamt: 100 }); return { ok: s.ok, error: s.error }; }); }
    var opsOn = function (r, t) { return (r.ops || []).filter(function (o) { return o && o.table === t; }); };
    var dbBefore = AC.RUNTIME.DB;
    clean(); var rr = rowSet(SCH, 'TACR', 'twin:process:242', { svTable: SCH });
    var own = ownEdit(), m0 = SEEN.length, rep = replicaEdit(), lg = logsSince(m0);
    var ivOps = opsOn(rep, IV), schOps = opsOn(rep, SCH);
    var ivUpd = ivOps.filter(function (o) { return o.op_type === 'CRUD_UPDATE' && o.changes && o.changes.ispayschedulevalid && o.changes.ispayschedulevalid.new === 'N'; });
    check('PROCESS', 'same-group', 'replica edit: ONE group holding the schedule update AND the invoice update IsPayScheduleValid Y->N (written by the process); ordinary edit: no invoice op; invoice was Y before',
      inv0 === 'Y' && rep.ok !== false && schOps.length >= 1 && ivUpd.length === 1 && opsOn(own, IV).length === 0, { inv0: inv0, rep: rep.ok, repErr: rep.error, sch: schOps.length, iv: ivOps.length, ivUpd: ivUpd.length, ownIv: opsOn(own, IV).length, ownOk: own.ok, tail: lg.filter(function (l) { return /RULE|PROC/.test(l); }).slice(0, 4) });
    check('PROCESS', 'log', 'the shipped §RULE_PROCESS line names process 242, the table and record', lg.some(function (l) { return /^§RULE_PROCESS ref=242 .*table=c_invoicepayschedule record=102 ok=Y/.test(l); }), lg.filter(function (l) { return /RULE/.test(l); }));
    check('PROCESS', 'runtime-restored', 'running a process inside the save restores the callout runtime binding (RUNTIME.DB is the same object after)', AC.RUNTIME.DB === dbBefore, {});
    // by value, not id
    clean(); rowSet(SCH, 'TACR', 'twin:process:C_InvoicePaySchedule Validate', { svTable: SCH });
    var rep2 = replicaEdit(); var iv2 = opsOn(rep2, IV).filter(function (o) { return o.changes && o.changes.ispayschedulevalid && o.changes.ispayschedulevalid.new === 'N'; });
    check('PROCESS', 'by-value', 'twin:process:<AD_Process Value> resolves the same process as the id', rep2.ok !== false && iv2.length === 1, { ok: rep2.ok, err: rep2.error, iv2: iv2.length });
    // deactivated row: nothing
    clean(); var rd = rowSet(SCH, 'TACR', 'twin:process:242', { svTable: SCH, svActive: 'N' }); var rep3 = replicaEdit();
    check('PROCESS', 'control-off', 'CONTROL: the same row deactivated -> no invoice op', rep3.ok !== false && opsOn(rep3, IV).length === 0, { iv: opsOn(rep3, IV).length });
    // absent process: a veto
    clean(); rowSet(SCH, 'TACR', 'twin:process:99999999', { svTable: SCH }); var rep4 = replicaEdit();
    check('PROCESS', 'absent', 'an AD_Process nobody has = the replica save is REFUSED with a message naming it (no silent pass)', rep4.ok === false && /99999999/.test(String(rep4.error || '')), { ok: rep4.ok, err: rep4.error });
  });

  // ═══ PLUGIN / REGISTRY ═══════════════════════════════════════════════════════════════════════════════════════════════
  guard('REGISTRY', 'stack', 'two registrations of one name stack (latest wins); removing an owner restores the previous; unknown owner removes nothing', function () {
    clean(); var o = [];
    AR.registerRuleFunction('W.stk', function () { o.push('base'); return null; }, { owner: 'W0' });
    AR.registerRuleFunction('W.stk', function () { o.push('top'); return null; }, { owner: 'W' });
    rowSet(T, 'TAN', 'twin:W.stk'); MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    var n = AR.unregisterRuleOwner('W'), z = AR.unregisterRuleOwner('nobody'); MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
    var n0 = AR.unregisterRuleOwner('W0');
    check('REGISTRY', 'stack', 'first fire = top; after removing owner W the base runs; owner removal counts 1/0/1', J(o) === J(['top', 'base']) && n === 1 && z === 0 && n0 === 1, { o: o, n: n, z: z, n0: n0 });
  });
  var pluginDone = (async function () {
    try {
      clean(); var BUNDLES = {}, ran = [];
      var host = { engineVersion: '1.0.0', modelval: MV, rule: AR, docAction: ML, import: function (u) { return Promise.resolve(BUNDLES[u]); }, ops: { append: function () { return 1; } } };
      BUNDLES['b/rule.mjs'] = { manifest: { id: 'com.test.rules', version: '1.0.0', engineVersion: '>=0.9.0', requires: {} },
        activate: async function (ctx) { ctx.rules.register('W.plug', function () { ran.push('plug'); return null; }); }, deactivate: async function () {} };
      rowSet(T, 'TAN', 'twin:W.plug');
      var reg1 = PR.create(host), cnt = function () { return AR.ruleFunctions().filter(function (f) { return f.name === 'W.plug'; }).length; };
      var c0 = cnt(); await reg1.installBundle('b/rule.mjs'); var st = await reg1.startBundle('com.test.rules'); var c1 = cnt();
      var r1 = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
      await reg1.stopBundle('com.test.rules'); var c2 = cnt();
      var r2 = MV.fireHooks('AFTER_NEW', { table: T, record: {} }, { q: q });
      check('PLUGIN', 'ctx-rules', 'start: 0->1 function and the row fires; stop: back to 0 and the row now vetoes as not-registered', c0 === 0 && c1 === 1 && J(ran) === J(['plug']) && r1.ok === true && c2 === 0 && r2.ok === false && /twin:W\.plug/.test(String(r2.error)), { c0: c0, c1: c1, c2: c2, ran: ran, r1: r1.ok, r2: r2, state: st && st.state });
    } catch (e) { check('PLUGIN', 'ctx-rules', 'ctx.rules path runs', false, 'threw: ' + (e && e.message)); }
  })();
  await pluginDone;
  clean();

  var shipped = SEEN.filter(function (l) { return /^§RULE_/.test(l); }), kinds = {};
  shipped.forEach(function (l) { var k = l.split(' ')[0]; kinds[k] = (kinds[k] || 0) + 1; });
  say('§RULE-SHIPPED-LOG lines=' + shipped.length + ' kinds=' + J(kinds));
  ['§RULE_PROCESS', '§RULE_VETO', '§RULE_UNPORTED', '§RULE_MISSING', '§RULE_SKIP', '§RULE_TABLES'].forEach(function (k) { var l = shipped.filter(function (x) { return x.indexOf(k + ' ') === 0; })[0]; if (l) say('  ' + l.slice(0, 260)); });

  // ═══ verdicts ════════════════════════════════════════════════════════════════════════════════════════════════════════
  var vs = ['TABLES', 'BASE', 'REPLICA', 'VETO', 'SEQ', 'RETURN', 'UNPORTED', 'GATES', 'MISSING', 'CODES', 'DOCACTION', 'PROCESS', 'REGISTRY', 'PLUGIN'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (k) { return CASES[k].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§RULE-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (RULE_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════════════════════
  if (process.env.RULE_MUTANTS && !MUTANT) {
    var MUTS;
    try { MUTS = require('./witness_script_validator_mutants.js'); } catch (e) { MUTS = []; say('§RULE-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [];
    MUTS.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulemut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js module (and callouts/, processes/) is COPIED, not symlinked: node resolves a symlink to its real path, so a symlinked neighbour would require the ORIGINAL ad_modelval/ad_process/ad_rule and the
      //   mutant would apply to the witness's own instance only (a kill that proves nothing about the shipped wiring). The big .db files stay symlinks.
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.js$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(ERP, ed.file), 'utf8');
        if (src.indexOf(ed.from) < 0 || src.split(ed.from).length - 1 !== (ed.count || 1)) { ok = false; return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§RULE-MUTANT ' + m.name + ' NOT-APPLIED (source text not found: the mutant proves nothing)'); return; }
      applied++;
      var res = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { RULE_ERP: dir, RULE_MUTANT: m.name, RULE_MUTANTS: '' }), encoding: 'utf8', timeout: 240000 });
      var out = (res.stdout || '') + '\n' + (res.stderr || '');
      var rl = out.split('\n').filter(function (l) { return /^§RULE-RESULT /.test(l); })[0];
      var failedLines = out.split('\n').filter(function (l) { return /§RULE-CHECK .* FAIL /.test(l); });
      var named = m.kills ? failedLines.some(function (l) { return l.indexOf('case=' + m.kills[0] + ' key=' + m.kills[1] + ' ') >= 0; }) : failedLines.length > 0;
      if (!rl) { crashed.push(m.name); say('§RULE-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + res.status + ' ' + String(res.stderr || '').split('\n')[0].slice(0, 160)); }
      else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§RULE-MUTANT ' + m.name + ' KILLED by ' + (m.kills ? m.kills.join('.') : '(any)') + ' :: ' + m.what); }
      else { survived.push(m.name); say('§RULE-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join('.') + ' failedChecks=' + failedLines.length); }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    });
    var mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === MUTS.length && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§RULE-MUTANTS verdict=' + mv + ' total=' + MUTS.length + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§RULE-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
