// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_rule.js — AD_Rule + AD_Table_ScriptValidator: STAGE 3 of the model-validation dispatcher (prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §10.3, §10.7, §10.8 — Witness: W-BUS-ROW).
//
// LEGACY (ModelValidationEngine.java): fireModelChange :417-466 / fireDocValidate :605-655 run, after the validators of every client and of this client and BEFORE the OSGi event handlers, the rows of
//   AD_Table_ScriptValidator for (this table, this event) — active only, ORDER BY SeqNo (MTableScriptValidator.getModelValidatorRules :88-124) — each pointing at an AD_Rule. A rule runs only if it is active,
//   RuleType='S' (JSR223 scripting) and EventType='T' (table event) / 'D' (document event). The script's return text is the error: non-empty = veto (the first stops stage 3 and everything after it);
//   an exception = its text. The event is the row's EventModelValidator code (X_AD_Table_ScriptValidator.java:218-268) mapped from the timing by ModelValidator.tableEventValidators / documentEventValidators
//   (ModelValidator.java:80-150), the replication timings TANR / TACR / TBDR included. AD_Rule.Value = '<engine>:<name>' (MRule.getEngineName :260).
//
// TWIN (owner decision §10.7, 2026-10-27): the engine prefix 'twin' resolves <name> in a REGISTRY of ported functions (registerRuleFunction, owner-scoped, undone on stop), or 'process:<AD_Process value|id>' =
//   a ported AD_Process run through ad_process.js runJava IN THE SAVE'S OWN TRANSACTION (its writes ride the save's op group). No script sandbox: nothing here ever evaluates AD_Rule.Script.
//   Any other engine (groovy / beanshell / jython / javascript / none) is NAMED-UNPORTED: reported in the result and by a §RULE_UNPORTED line, never executed, never silently skipped, never a veto.
//   A 'twin:' name nobody registered is a veto naming it (legacy: "Engine not found" is an error, :437/:451).
//
// BASE (§10.8 STEP 0): the team BASE hash covers the seed file + patches/ad_seed.db.sql + patches/mfg.sql, and no base-upgrade path exists - appending to a patch would make every existing team 'base-mismatch'.
//   So the two physical tables are NOT shipped in a hashed patch: ensure(db) creates them idempotently at boot, the same class of overlay as SystemTenant.ensure (device-local, outside the base identity).
//   The dictionary rows (AD_Table 53058/53059 + 31 AD_Column) are already in the seed; only the physical tables were missing.
// Determinism: pure reads of the dictionary rows + the registered function; no Date.now / Math.random.
(function (global) {
  'use strict';

  // DDL copied from build/erp/ad_full.db (sqlite3 .schema) - the same column set the seed's AD_Column rows describe.
  var DDL = {
    ad_rule: 'CREATE TABLE IF NOT EXISTS "ad_rule" ("ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "ad_rule_id" NUMERIC, "accesslevel" TEXT, "created" TEXT, "createdby" NUMERIC, "description" TEXT, "entitytype" TEXT, "eventtype" TEXT, "help" TEXT, "isactive" TEXT, "name" TEXT, "ruletype" TEXT, "script" TEXT, "updated" TEXT, "updatedby" NUMERIC, "value" TEXT, "ad_rule_uu" TEXT)',
    ad_table_scriptvalidator: 'CREATE TABLE IF NOT EXISTS "ad_table_scriptvalidator" ("ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "ad_rule_id" NUMERIC, "ad_table_id" NUMERIC, "ad_table_scriptvalidator_id" NUMERIC, "created" TEXT, "createdby" NUMERIC, "eventmodelvalidator" TEXT, "isactive" TEXT, "seqno" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, "ad_table_scriptvalidator_uu" TEXT)'
  };
  // timing -> EventModelValidator code. Table events: ModelValidator.tableEventValidators (:80-90) via X_AD_Table_ScriptValidator EVENTMODELVALIDATOR_Table*. Document events: documentEventValidators (:120-137) via EVENTMODELVALIDATOR_Document*.
  var TABLE_CODE = { BEFORE_NEW: 'TBN', BEFORE_CHANGE: 'TBC', BEFORE_DELETE: 'TBD', AFTER_NEW: 'TAN', AFTER_CHANGE: 'TAC', AFTER_DELETE: 'TAD', AFTER_NEW_REPLICATION: 'TANR', AFTER_CHANGE_REPLICATION: 'TACR', BEFORE_DELETE_REPLICATION: 'TBDR' };
  var DOC_CODE = { BEFORE_PREPARE: 'DBPR', BEFORE_VOID: 'DBVO', BEFORE_CLOSE: 'DBCL', BEFORE_REACTIVATE: 'DBAC', BEFORE_REVERSECORRECT: 'DBRC', BEFORE_REVERSEACCRUAL: 'DBRA', BEFORE_COMPLETE: 'DBCO',
                   AFTER_PREPARE: 'DAPR', AFTER_COMPLETE: 'DACO', AFTER_VOID: 'DAVO', AFTER_CLOSE: 'DACL', AFTER_REACTIVATE: 'DAAC', AFTER_REVERSECORRECT: 'DARC', AFTER_REVERSEACCRUAL: 'DARA', BEFORE_POST: 'DBPO', AFTER_POST: 'DAPO' };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function codeOf(timing) { return has(TABLE_CODE, timing) ? TABLE_CODE[timing] : (has(DOC_CODE, timing) ? DOC_CODE[timing] : null); }
  function log(s) { try { if (typeof console !== 'undefined') console.log(s); } catch (e) { /* logging never breaks a save */ } }

  // ensure(db) - idempotent boot overlay (a sql.js Database). Returns the number of tables it created (0 when both are already there).
  function ensure(db) {
    var made = 0;
    Object.keys(DDL).forEach(function (t) {
      var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'");
      if (r.length && r[0].values.length) return;
      db.run(DDL[t]); made++;
    });
    log('§RULE_TABLES ensure created=' + made + ' (ad_rule, ad_table_scriptvalidator; boot overlay, outside the team base hash)');
    return made;
  }

  // ── the twin: registry. FUNCS[name] = [{fn, owner}] - the last registration is the effective one; removing an owner restores the previous (layered like the other engines).
  var FUNCS = {};
  function registerRuleFunction(name, fn, opts) {
    if (typeof name !== 'string' || !name) throw new Error('registerRuleFunction: a name is required');
    if (typeof fn !== 'function') throw new Error('registerRuleFunction: ' + name + ' needs a function');
    (FUNCS[name] = FUNCS[name] || []).push({ fn: fn, owner: opts && opts.owner != null ? opts.owner : null });
    return name;
  }
  function unregisterRuleFunction(name, owner) {
    var a = FUNCS[name]; if (!a) return 0;
    for (var i = a.length - 1; i >= 0; i--) if (a[i].owner === (owner == null ? null : owner)) { a.splice(i, 1); if (!a.length) delete FUNCS[name]; return 1; }
    return 0;
  }
  function unregisterRuleOwner(owner) {
    var n = 0;
    Object.keys(FUNCS).forEach(function (nm) { var a = FUNCS[nm]; for (var i = a.length - 1; i >= 0; i--) if (a[i].owner === owner) { a.splice(i, 1); n++; } if (!a.length) delete FUNCS[nm]; });
    return n;
  }
  function ruleFunctions() { var out = []; Object.keys(FUNCS).forEach(function (nm) { FUNCS[nm].forEach(function (e) { out.push({ name: nm, owner: e.owner }); }); }); return out; }

  // parseValue - MRule.getEngineName: everything before the first ':' (null when none); the name is the rest.
  function parseValue(value) {
    var v = String(value == null ? '' : value), i = v.indexOf(':');
    return i < 0 ? { engine: null, name: v } : { engine: v.slice(0, i), name: v.slice(i + 1) };
  }

  // twin:process:<ref>[?K=V&L=W] - a ported AD_Process in THIS transaction. Returns '' on success, else the error text. The '?K=V' parameters are a TWIN extension (legacy gives a rule script no
  //   parameters; TEAM_REPLICATION_PLUGIN_STUDY §13.2): the POS chain names Import Orders' DocAction in its row (twin:process:206?DocAction=CO). Values are strings, as AD_PInstance_Para text.
  function processRef(ref) {
    var s = String(ref), i = s.indexOf('?'), params = null;
    if (i >= 0) { params = {}; s.slice(i + 1).split('&').forEach(function (kv) { if (!kv) return; var j = kv.indexOf('='), k = decodeURIComponent(j < 0 ? kv : kv.slice(0, j)); params[k] = j < 0 ? '' : decodeURIComponent(kv.slice(j + 1)); }); s = s.slice(0, i); }
    return { ref: s, params: params };
  }
  function runProcess(ref, b) {
    var pr = processRef(ref); ref = pr.ref;
    var AP = (typeof window !== 'undefined' && window.AdProcess) || global.AdProcess || (typeof require === 'function' ? (function () { try { return require('./ad_process.js'); } catch (e) { return null; } })() : null);
    if (!AP || typeof AP.runInTrx !== 'function') return 'twin:process:' + ref + ' - the process engine (ad_process.js runInTrx) is not loaded';
    if (!b.trx) return 'twin:process:' + ref + ' - needs a transaction (the rule fired outside a save)';
    var t = b.trx.q('SELECT ad_table_id AS id FROM ad_table WHERE lower(tablename)=?', [String(b.table).toLowerCase()])[0];
    var rec = b.po ? b.po[b.trx.idCol(String(b.table).toLowerCase())] : 0;
    var r = AP.runInTrx(b.trx, ref, pr.params ? { tableId: t ? Number(t.id) : 0, recordId: rec == null ? 0 : rec, params: pr.params } : { tableId: t ? Number(t.id) : 0, recordId: rec == null ? 0 : rec });
    log('§RULE_PROCESS ref=' + ref + (pr.params ? ' params=' + JSON.stringify(pr.params) : '') + ' table=' + String(b.table).toLowerCase() + ' record=' + rec + ' ok=' + (r.ok ? 'Y' : 'N') + ' dispatched=' + (r.dispatched ? 'Y' : 'N') + ' summary=' + String(r.summary == null ? '' : r.summary).slice(0, 120));
    return r.ok ? '' : String(r.summary || ('process ' + ref + ' failed'));
  }

  // stage3(timing, info, ctx) - the dispatcher's stage 3. Reads through ctx.trx.q (a save) or ctx.q (a caller with only a reader).
  //   Returns null when there is nothing to run (no reader / the tables are not in this database / no rows), else { fired, unported, error, blocked }.
  function stage3(timing, info, ctx) {
    var code = codeOf(timing); if (!code) return null;
    var q = ctx && ctx.trx && typeof ctx.trx.q === 'function' ? ctx.trx.q : (ctx && typeof ctx.q === 'function' ? ctx.q : null); if (!q) return null;
    var table = String((info && info.table) || '').toLowerCase(), rows;
    try { rows = q("SELECT v.ad_table_scriptvalidator_id AS id, v.ad_rule_id AS rid FROM ad_table_scriptvalidator v JOIN ad_table t ON t.ad_table_id=v.ad_table_id WHERE lower(t.tablename)=? AND v.eventmodelvalidator=? AND v.isactive='Y' ORDER BY v.seqno, v.ad_table_scriptvalidator_id", [table, code]); }
    catch (e) { return null; }                                                           // the tables are not in this database (ensure() not run on this host): stage 3 is empty
    if (!rows || !rows.length) return null;
    var want = code.charAt(0) === 'D' ? 'D' : 'T', out = { fired: 0, unported: [], error: null, blocked: null };
    for (var i = 0; i < rows.length; i++) {
      var rule = q('SELECT ad_rule_id, value, name, ruletype, eventtype, isactive FROM ad_rule WHERE ad_rule_id=?', [rows[i].rid])[0], tag = 'table=' + table + ' event=' + code + ' sv=' + rows[i].id + ' rule=' + rows[i].rid;
      if (!rule) { log('§RULE_SKIP ' + tag + ' reason=no-such-rule'); continue; }
      if (rule.isactive !== 'Y') { log('§RULE_SKIP ' + tag + ' reason=inactive'); continue; }
      if (rule.ruletype !== 'S') { log('§RULE_SKIP ' + tag + ' reason=ruletype-' + rule.ruletype + ' (only JSR223 rules run in legacy)'); continue; }
      if (rule.eventtype !== want) { log('§RULE_SKIP ' + tag + ' reason=eventtype-' + rule.eventtype + ' (need ' + want + ')'); continue; }
      var val = String(rule.value == null ? '' : rule.value), pv = parseValue(val);
      if (!pv.engine || pv.engine.toLowerCase() !== 'twin') {
        out.unported.push(val); log('§RULE_UNPORTED ' + tag + ' value=' + val + ' engine=' + (pv.engine || '(none)') + ' (not run: the twin has no JSR223 engine; AD_Rule.Script is never evaluated)'); continue;
      }
      var b = { ctx: ctx, trx: ctx.trx || null, po: info.record, old: info.recordOld || null, table: info.table, type: timing, event: code, info: info, isReplication: !!info.isReplication,
                rule: { id: rule.ad_rule_id, value: val, name: rule.name } };
      var err = null, ret = null, fn = null;
      log('§RULE_FIRE table=' + table + ' event=' + code + ' timing=' + timing + ' rule=' + val + ' seq=' + (i + 1) + '/' + rows.length + (b.isReplication ? ' replica=Y' : ''));
      if (pv.name.indexOf('process:') === 0) { try { err = runProcess(pv.name.slice(8), b); } catch (e) { err = String(e); } }
      else if (FUNCS[pv.name] && FUNCS[pv.name].length) { fn = FUNCS[pv.name][FUNCS[pv.name].length - 1].fn; try { ret = fn(b); } catch (e) { err = String(e); } }
      else { err = 'Rule function not registered: ' + val; log('§RULE_MISSING ' + tag + ' value=' + val + ' (twin: names resolve in registerRuleFunction; legacy: "Engine not found" is an error)'); }
      out.fired++;
      var text = err != null ? err : (ret == null ? '' : String(ret));                     // java: error = (retval == null ? "" : retval.toString()); an exception -> e.toString()
      if (text) { log('§RULE_VETO ' + tag + ' value=' + val + ' error=' + text.slice(0, 160)); out.error = text; out.blocked = 'AD_Rule:' + val; return out; }
    }
    return out;
  }

  // hasRows(q, table, codes) - does ANY active AD_Table_ScriptValidator row listen on this table for one of the EventModelValidator codes? Hosts use it where they skip the model path for a table nothing
  //   is registered on (crud_overlay _modelAfterSave): a dictionary row is a listener like any registered one. q = a reader (sql, params) -> rows. Never throws: no tables = false.
  function hasRows(q, table, codes) {
    try {
      var cs = (codes || []).filter(function (c) { return /^[A-Z]{3,4}$/.test(c); }); if (!cs.length) return false;
      var r = q("SELECT 1 AS x FROM ad_table_scriptvalidator v JOIN ad_table t ON t.ad_table_id=v.ad_table_id WHERE lower(t.tablename)=? AND v.isactive='Y' AND v.eventmodelvalidator IN ('" + cs.join("','") + "') LIMIT 1", [String(table || '').toLowerCase()]);
      return !!(r && r.length);
    } catch (e) { return false; }
  }

  // attach(MV) - hook stage 3 into a dispatcher instance. ad_modelval.js calls it on itself in node; in the browser this file calls it for window.AdModelVal.
  function attach(MV) { if (MV && typeof MV.setScriptStage === 'function') MV.setScriptStage(stage3); return !!MV; }

  var API = { DDL: DDL, TABLE_CODE: TABLE_CODE, DOC_CODE: DOC_CODE, codeOf: codeOf, ensure: ensure, stage3: stage3, hasRows: hasRows, parseValue: parseValue, processRef: processRef, attach: attach,
              registerRuleFunction: registerRuleFunction, unregisterRuleFunction: unregisterRuleFunction, unregisterRuleOwner: unregisterRuleOwner, ruleFunctions: ruleFunctions };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdRule = API;                       // browser
  else if (global) global.AdRule = API;
  var _mv = (typeof window !== 'undefined' && window.AdModelVal) || (global && global.AdModelVal);
  if (_mv) attach(_mv);
})(typeof globalThis !== 'undefined' ? globalThis : this);
