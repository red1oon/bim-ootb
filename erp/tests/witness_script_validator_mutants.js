// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the mutant table of W-BUS-ROW (witness_script_validator.js, RULE_MUTANTS=1). Each entry rewrites the SHIPPED source in a mirror dir (text must be found exactly once, else NOT-APPLIED = proves nothing),
//   then the witness re-runs in a child; the named check must print FAIL. A child that crashes without its § verdict line is NOT a kill. (the mirror holds COPIES of every .js module, so neighbours bind to the mutant, not the original). READ THE LOG: §RULE-MUTANT lines.
'use strict';
module.exports = [
 {
  "name": "M01-stage3-after-handlers",
  "kills": [
   "VETO",
   "position"
  ],
  "what": "stage 3 runs AFTER the event handlers instead of before them",
  "edits": [
   {
    "file": "ad_modelval.js",
    "from": "    // (3) AD_Table_ScriptValidator rules (:417-466 / fireDocValidate :605-655), ad_rule.js: rows of this table+event ORDER BY SeqNo; the first error stops here like a validator's (:456-457).\n    if (SCRIPT_STAGE) {\n      var sr = SCRIPT_STAGE(timing, info, ctx);\n      if (sr) {\n        fired += sr.fired || 0; if (sr.unported && sr.unported.length) unported = sr.unported;\n        if (sr.error) return res({ ok: false, fired: fired, blocked: sr.blocked || 'AD_Table_ScriptValidator', error: sr.error });\n      }\n    }\n    // (4) event handlers of the topic: ALL run, every error collected, reversed, joined with \"<br>\" (:469-497)\n    var hs = topic ? _subsFor(topic, t, false) : [];\n    if (hs.length) {\n      var errs = [], names = [];\n      hs.forEach(function (e) { fired++; var x = exec(e); if (x) { errs.push(String(x)); names.push(e.name); } });\n      if (errs.length) return res({ ok: false, fired: fired, blocked: names.join(','), error: errs.slice().reverse().map(function (x) { return x + '<br>'; }).join(''), errors: errs });\n    }\n",
    "to": "    // (4) event handlers of the topic: ALL run, every error collected, reversed, joined with \"<br>\" (:469-497)\n    var hs = topic ? _subsFor(topic, t, false) : [];\n    if (hs.length) {\n      var errs = [], names = [];\n      hs.forEach(function (e) { fired++; var x = exec(e); if (x) { errs.push(String(x)); names.push(e.name); } });\n      if (errs.length) return res({ ok: false, fired: fired, blocked: names.join(','), error: errs.slice().reverse().map(function (x) { return x + '<br>'; }).join(''), errors: errs });\n    }\n    // (3) AD_Table_ScriptValidator rules (:417-466 / fireDocValidate :605-655), ad_rule.js: rows of this table+event ORDER BY SeqNo; the first error stops here like a validator's (:456-457).\n    if (SCRIPT_STAGE) {\n      var sr = SCRIPT_STAGE(timing, info, ctx);\n      if (sr) {\n        fired += sr.fired || 0; if (sr.unported && sr.unported.length) unported = sr.unported;\n        if (sr.error) return res({ ok: false, fired: fired, blocked: sr.blocked || 'AD_Table_ScriptValidator', error: sr.error });\n      }\n    }\n"
   }
  ]
 },
 {
  "name": "M02-stage3-before-validators",
  "kills": [
   "VETO",
   "validator-first"
  ],
  "what": "stage 3 runs BEFORE the validators of every client",
  "edits": [
   {
    "file": "ad_modelval.js",
    "from": "    // (1) validators of every client - registration order, the first error aborts (:395-405 / fireModelChange(po,type,list) :506-540)\n    for (i = 0; i < all.length; i++) { h = all[i]; if (h.client != null) continue; fired++; err = exec(h); if (err) return res({ ok: false, fired: fired, blocked: h.name, error: err }); }\n    // (2) validators of THIS client only (m_modelChangeListeners.get(table + AD_Client_ID), :407-415)\n    var cl = null;\n    for (i = 0; i < all.length; i++) { h = all[i]; if (h.client == null) continue; if (cl === null) cl = _clientOf(info, ctx); if (h.client !== cl) continue; fired++; err = exec(h); if (err) return res({ ok: false, fired: fired, blocked: h.name, error: err }); }\n    // (3) AD_Table_ScriptValidator rules (:417-466 / fireDocValidate :605-655), ad_rule.js: rows of this table+event ORDER BY SeqNo; the first error stops here like a validator's (:456-457).\n    if (SCRIPT_STAGE) {\n      var sr = SCRIPT_STAGE(timing, info, ctx);\n      if (sr) {\n        fired += sr.fired || 0; if (sr.unported && sr.unported.length) unported = sr.unported;\n        if (sr.error) return res({ ok: false, fired: fired, blocked: sr.blocked || 'AD_Table_ScriptValidator', error: sr.error });\n      }\n    }\n",
    "to": "    // (3) AD_Table_ScriptValidator rules (:417-466 / fireDocValidate :605-655), ad_rule.js: rows of this table+event ORDER BY SeqNo; the first error stops here like a validator's (:456-457).\n    if (SCRIPT_STAGE) {\n      var sr = SCRIPT_STAGE(timing, info, ctx);\n      if (sr) {\n        fired += sr.fired || 0; if (sr.unported && sr.unported.length) unported = sr.unported;\n        if (sr.error) return res({ ok: false, fired: fired, blocked: sr.blocked || 'AD_Table_ScriptValidator', error: sr.error });\n      }\n    }\n    // (1) validators of every client - registration order, the first error aborts (:395-405 / fireModelChange(po,type,list) :506-540)\n    for (i = 0; i < all.length; i++) { h = all[i]; if (h.client != null) continue; fired++; err = exec(h); if (err) return res({ ok: false, fired: fired, blocked: h.name, error: err }); }\n    // (2) validators of THIS client only (m_modelChangeListeners.get(table + AD_Client_ID), :407-415)\n    var cl = null;\n    for (i = 0; i < all.length; i++) { h = all[i]; if (h.client == null) continue; if (cl === null) cl = _clientOf(info, ctx); if (h.client !== cl) continue; fired++; err = exec(h); if (err) return res({ ok: false, fired: fired, blocked: h.name, error: err }); }\n"
   }
  ]
 },
 {
  "name": "M03-stage-never-runs",
  "kills": [
   "REPLICA",
   "fires-on-replica"
  ],
  "what": "the dispatcher never calls the script stage",
  "edits": [
   {
    "file": "ad_modelval.js",
    "from": "    if (SCRIPT_STAGE) {",
    "to": "    if (false) {"
   }
  ]
 },
 {
  "name": "M04-result-leaks-empty-unported",
  "kills": [
   "UNPORTED",
   "clean-result"
  ],
  "what": "every result carries unported:[] even when stage 3 had no rows",
  "edits": [
   {
    "file": "ad_modelval.js",
    "from": "if (unported) r.unported = unported;",
    "to": "r.unported = unported || [];"
   }
  ]
 },
 {
  "name": "M05-no-order-by-seqno",
  "kills": [
   "SEQ",
   "order-and-stop"
  ],
  "what": "rows are not ordered by SeqNo",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "ORDER BY v.seqno, v.ad_table_scriptvalidator_id",
    "to": "ORDER BY v.ad_table_scriptvalidator_id"
   }
  ]
 },
 {
  "name": "M06-error-does-not-stop",
  "kills": [
   "SEQ",
   "order-and-stop"
  ],
  "what": "the first error does not stop stage 3",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "out.error = text; out.blocked = 'AD_Rule:' + val; return out; }",
    "to": "out.error = text; out.blocked = 'AD_Rule:' + val; }"
   }
  ]
 },
 {
  "name": "M07-inactive-row-runs",
  "kills": [
   "GATES",
   "flags"
  ],
  "what": "AD_Table_ScriptValidator.IsActive is ignored",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": " AND v.isactive='Y' ORDER BY",
    "to": " ORDER BY"
   }
  ]
 },
 {
  "name": "M08-inactive-rule-runs",
  "kills": [
   "GATES",
   "flags"
  ],
  "what": "AD_Rule.IsActive is ignored",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "if (rule.isactive !== 'Y') {",
    "to": "if (false) {"
   }
  ]
 },
 {
  "name": "M09-ruletype-ignored",
  "kills": [
   "GATES",
   "flags"
  ],
  "what": "RuleType is ignored (a SQL rule runs)",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "if (rule.ruletype !== 'S') {",
    "to": "if (false) {"
   }
  ]
 },
 {
  "name": "M10-eventtype-ignored",
  "kills": [
   "GATES",
   "doc-vs-table"
  ],
  "what": "EventType T/D is ignored",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "if (rule.eventtype !== want) {",
    "to": "if (false) {"
   }
  ]
 },
 {
  "name": "M11-unported-not-reported",
  "kills": [
   "UNPORTED",
   "named"
  ],
  "what": "an unported rule is skipped without being reported in the result",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "out.unported.push(val); log('§RULE_UNPORTED",
    "to": "log('§RULE_UNPORTED"
   }
  ]
 },
 {
  "name": "M12-unported-vetoes",
  "kills": [
   "UNPORTED",
   "named"
  ],
  "what": "an unported rule is treated like a missing twin function (veto)",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "if (!pv.engine || pv.engine.toLowerCase() !== 'twin') {",
    "to": "if (false) {"
   }
  ]
 },
 {
  "name": "M13-missing-passes",
  "kills": [
   "MISSING",
   "veto"
  ],
  "what": "an unregistered twin: name passes silently",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "else { err = 'Rule function not registered: ' + val;",
    "to": "else { err = null;"
   }
  ]
 },
 {
  "name": "M14-throw-swallowed",
  "kills": [
   "RETURN",
   "semantics"
  ],
  "what": "a throwing rule function is swallowed",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "try { ret = fn(b); } catch (e) { err = String(e); }",
    "to": "try { ret = fn(b); } catch (e) { err = null; }"
   }
  ]
 },
 {
  "name": "M15-replica-code-wrong",
  "kills": [
   "REPLICA",
   "fires-on-replica"
  ],
  "what": "AFTER_NEW_REPLICATION maps to TAN, not TANR",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "AFTER_NEW_REPLICATION: 'TANR'",
    "to": "AFTER_NEW_REPLICATION: 'TAN'"
   }
  ]
 },
 {
  "name": "M16-doc-code-wrong",
  "kills": [
   "CODES",
   "x-of-25"
  ],
  "what": "BEFORE_COMPLETE maps to the AFTER code",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "BEFORE_COMPLETE: 'DBCO'",
    "to": "BEFORE_COMPLETE: 'DACO'"
   }
  ]
 },
 {
  "name": "M17-ensure-creates-one",
  "kills": [
   "TABLES",
   "ensure"
  ],
  "what": "ensure creates only ad_rule",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "db.run(DDL[t]); made++;",
    "to": "if (t === 'ad_rule') { db.run(DDL[t]); made++; }"
   }
  ]
 },
 {
  "name": "M18-ddl-column-dropped",
  "kills": [
   "TABLES",
   "ensure"
  ],
  "what": "the script-validator DDL lacks a dictionary column",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "\"isactive\" TEXT, \"seqno\" NUMERIC, \"updated\" TEXT, \"updatedby\" NUMERIC, \"ad_table_scriptvalidator_uu\" TEXT)",
    "to": "\"isactive\" TEXT, \"updated\" TEXT, \"updatedby\" NUMERIC, \"ad_table_scriptvalidator_uu\" TEXT)"
   }
  ]
 },
 {
  "name": "M19-registry-replaces",
  "kills": [
   "REGISTRY",
   "stack"
  ],
  "what": "a second registration replaces instead of stacking",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "(FUNCS[name] = FUNCS[name] || []).push(",
    "to": "(FUNCS[name] = []).push("
   }
  ]
 },
 {
  "name": "M20-process-own-trx",
  "kills": [
   "PROCESS",
   "same-group"
  ],
  "what": "the process runs in its OWN transaction (writes leave the save's group)",
  "edits": [
   {
    "file": "ad_process.js",
    "from": "return runJava(trx.q, trx.env, { trx: trx, AD_Process_ID",
    "to": "return runJava(trx.q, trx.env, { AD_Process_ID"
   }
  ]
 },
 {
  "name": "M21-runtime-not-restored",
  "kills": [
   "PROCESS",
   "runtime-restored"
  ],
  "what": "the callout runtime binding is left on the process's transaction",
  "edits": [
   {
    "file": "ad_process.js",
    "from": "} finally { if (kept) {",
    "to": "} finally { if (false) {"
   }
  ]
 },
 {
  "name": "M22-process-failure-ignored",
  "kills": [
   "PROCESS",
   "absent"
  ],
  "what": "a failed twin:process is not an error",
  "edits": [
   {
    "file": "ad_rule.js",
    "from": "return r.ok ? '' : String(r.summary || ('process ' + ref + ' failed'));",
    "to": "return '';"
   }
  ]
 },
 {
  "name": "M23-process-by-id-only",
  "kills": [
   "PROCESS",
   "by-value"
  ],
  "what": "twin:process: resolves by id only, never by Value",
  "edits": [
   {
    "file": "ad_process.js",
    "from": "(isId ? 'ad_process_id=?' : 'value=?')",
    "to": "'ad_process_id=?'"
   }
  ]
 },
 {
  "name": "M24-plugin-rule-not-undone",
  "kills": [
   "PLUGIN",
   "ctx-rules"
  ],
  "what": "ctx.rules registrations survive stop",
  "edits": [
   {
    "file": "plugin_registry.js",
    "from": "scope.rec(function () { RULE.unregisterRuleFunction(name, id); });",
    "to": ""
   }
  ]
 }
];
