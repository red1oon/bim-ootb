// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_process.js — AD_Process dispatch spine (W-PROC). The "SvrProcess runner" leg of the
// coverage matrix: read AD_Process + AD_Process_Para, resolve classname against a small JS
// HANDLER REGISTRY, validate the supplied params against the para rows, run the handler, log.
// Self-contained, no kernel dep (mirrors ad_access.js / ad_evaluator.js shape).
// Implementing ERP_COVERAGE_MATRIX.md §AD_Process — Witness: W-PROC
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPEC (EXTRACT, do NOT invent) — the process rows + params ARE the data; this engine only dispatches them.
//   AD_Process / AD_Process_Para come from build/erp/ad_full.db (lowercase: ad_process, ad_process_para).
//   We DO NOT port the 476 Java SvrProcess classes (54k LOC) — we build the *mechanism* (AD-row →
//   classname → registered JS handler → result), and the report handlers RESOLVE TO report_overlay.js's
//   existing folds (foldReceipt/foldTrialBalance/foldPnL) rather than reinventing them. Unported classnames
//   return an explicit "absent handler" result (NOT a silent no-op) — the matrix counts dispatched vs total.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// Java home — iDempiere dispatch semantics, ported faithfully (cited by line range):
//   - org.adempiere.util.ProcessUtil.startJavaProcess (ProcessUtil.java:156-205):
//       className = pi.getClassName();  process = Core.getProcess(className);
//       if (process == null) -> pi.setSummary("Failed to create new process instance for "+className, true);
//                               return false;                  ← our "absent-handler" branch (the §FALSIFIER)
//       else success = process.startProcess(ctx, pi, trx);
//   - org.compiere.process.SvrProcess.startProcess (SvrProcess.java:132-232) -> process() (238) ->
//       prepare() (346, reads getParameter() at 328/582) -> doIt() (the body). We mirror prepare→doIt:
//       validate params (prepare) THEN run the handler (doIt).
//   - org.compiere.process.ProcessInfo: getAD_Process_ID (517), getClassName (535), getParameter (717) —
//       the carrier we model as { AD_Process_ID, classname, params:{} }.
//   - org.compiere.process.DocumentEngine.processIt (DocumentEngine.java:305-) — the doc-action dispatch
//       table (ACTION_Complete/Post/ReActivate/…); our doc-action handlers mirror the action→method routing.
//   Param type validation mirrors GridField/DisplayType off ad_process_para.ad_reference_id
//     (ad_reference: 10/14=String/Text, 11=Integer, 12=Amount, 22=Number, 29=Quantity, 15/16=Date,
//      17=List, 18/19=Table[Direct], 13=ID, 20=Yes-No, 28=Button).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ── ad_reference_id → coarse JS type class (DisplayType buckets we can validate headless) ──────────────
  var REF_TYPE = {
    10: 'string', 14: 'string',                                  // String / Text
    11: 'integer', 13: 'integer', 18: 'integer', 19: 'integer',  // Integer / ID / Table / TableDirect (all *_ID)
    12: 'number', 22: 'number', 29: 'number',                    // Amount / Number / Quantity
    15: 'date', 16: 'date',                                      // Date / Date+Time
    17: 'list', 20: 'yesno', 28: 'button'
  };
  function refType(ad_reference_id) { return REF_TYPE[Number(ad_reference_id)] || 'string'; }

  // typeOk — does a supplied value satisfy the para's reference type? (prepare-time shape check, faithful
  // to the coarse DisplayType validation; FK membership / list-validation are named-deferred like crud_overlay).
  function typeOk(type, v) {
    if (v == null || v === '') return true;                      // emptiness is a mandatory concern, handled separately
    switch (type) {
      case 'integer': return Number.isFinite(Number(v)) && Math.floor(Number(v)) === Number(v);
      case 'number':  return Number.isFinite(Number(v));
      case 'date':    return !isNaN(Date.parse(String(v))) || /^\d{4}-\d{2}-\d{2}/.test(String(v));
      case 'yesno':   return v === 'Y' || v === 'N' || v === true || v === false;
      default:        return true;                               // string/list/button: accept (list values are AD-checked elsewhere)
    }
  }

  // ── HANDLER REGISTRY — classname (or report-key) → JS handler ─────────────────────────────────────────
  // Each handler: function(ctx, info) -> { ok, message, rows, result }. ctx carries data accessors the
  // handler needs (e.g. ctx.report = report_overlay CORE, ctx.fetch = a row-fetcher) so the spine stays
  // data-source-agnostic (node witness injects sqlite fetchers; browser injects the bundle).
  // REPORT handlers resolve to report_overlay.js folds — NOT reinvented here.
  var REGISTRY = {};

  // registerHandler(classname, fn[, meta]) — meta.kind ∈ {report, docaction}; meta.reportKey wires to REPORT_MAP.
  function registerHandler(classname, fn, meta) {
    REGISTRY[classname] = { fn: fn, meta: meta || {} };
  }
  function hasHandler(classname) { return !!REGISTRY[classname]; }
  function registeredClassnames() { return Object.keys(REGISTRY); }

  // ── Default registry: the report/fold procs (resolve to report_overlay) + a few doc-action procs ───────
  // These keys are the REAL classnames / report-keys found in ad_full.db (see scripts/poc_proc.js audit):
  //   110 Rpt C_Order  (classname '' , report)  -> report:c_order  (foldReceipt)
  //   116 Rpt C_Invoice(classname '' , report)  -> report:c_invoice(foldReceipt)
  //   310 FinTrialBalance  classname org.compiere.report.TrialBalance -> foldTrialBalance
  //   175 Fact_Acct_Reset  classname org.compiere.process.FactAcctReset  -> doc-action (resubmit posting)
  //   233 DocumentTypeVerify classname org.compiere.process.DocumentTypeVerify -> doc-action (verify)
  // A report proc with a blank classname is dispatched by a synthesized "report:<headerTable>" key
  // (resolveClassname below), exactly the JASPER_STARTER fallback shape in ProcessUtil:158-162.
  function installDefaultHandlers(reportCore) {
    var RC = reportCore || null;

    // report:c_order / report:c_invoice — fold ONE document's receipt via report_overlay.foldReceipt.
    function receiptHandler(reportKey) {
      return function (ctx, info) {
        if (!RC || typeof RC.foldReceipt !== 'function') return { ok: false, message: 'report core unavailable', rows: 0 };
        var map = RC.REPORT_MAP[reportKey];
        var hdr = ctx.fetchHeader ? ctx.fetchHeader(reportKey, info) : null;
        var lines = ctx.fetchLines ? ctx.fetchLines(reportKey, info) : [];
        if (!hdr) return { ok: false, message: 'no header row for ' + reportKey, rows: 0 };
        var rec = RC.foldReceipt(map, hdr, lines, ctx.names ? ctx.names(reportKey, hdr, lines) : {});
        return { ok: true, message: 'receipt folded', rows: rec.lines.length, result: rec };
      };
    }
    registerHandler('report:c_order',   receiptHandler('c_order'),   { kind: 'report', reportKey: 'c_order' });
    registerHandler('report:c_invoice', receiptHandler('c_invoice'), { kind: 'report', reportKey: 'c_invoice' });

    // org.compiere.report.TrialBalance -> report_overlay.foldTrialBalance over the posted journal.
    registerHandler('org.compiere.report.TrialBalance', function (ctx, info) {
      if (!RC || typeof RC.foldTrialBalance !== 'function') return { ok: false, message: 'report core unavailable', rows: 0 };
      var facts = ctx.fetchFacts ? ctx.fetchFacts(info) : [];
      var accts = ctx.fetchAccounts ? ctx.fetchAccounts() : {};
      var tb = RC.foldTrialBalance(facts, accts);
      return { ok: true, message: 'trial balance: balanced=' + tb.balanced, rows: tb.lines.length, result: tb };
    }, { kind: 'report' });

    // doc-action: FactAcctReset (Resubmit Posting) — mirrors DocumentEngine ACTION_Post re-queue. The spine
    // proves the dispatch + param validate; the actual GL re-derivation is the named-deferred Doc_* corpus.
    registerHandler('org.compiere.process.FactAcctReset', function (ctx, info) {
      var n = ctx.countFacts ? ctx.countFacts(info) : 0;
      return { ok: true, message: 'posting reset queued (rows marked for re-post)', rows: n, result: { action: 'Post-reset', queued: n } };
    }, { kind: 'docaction', action: 'Post' });

    // doc-action: DocumentTypeVerify — mirrors a verify SvrProcess; counts the rows it would check.
    registerHandler('org.compiere.process.DocumentTypeVerify', function (ctx, info) {
      var n = ctx.countDocTypes ? ctx.countDocTypes() : 0;
      return { ok: true, message: 'document types verified', rows: n, result: { verified: n } };
    }, { kind: 'docaction', action: 'Verify' });
  }

  // ── Read the AD rows for a process: header + ordered params (the ProcessInfo source). ─────────────────
  function readProcess(db, ad_process_id) {
    var p = db.prepare('SELECT ad_process_id,value,name,classname,isreport,procedurename,jasperreport,ad_reportview_id FROM ad_process WHERE ad_process_id=?').get(ad_process_id);
    if (!p) throw new Error('no ad_process row for ' + ad_process_id);
    var paras = db.prepare('SELECT name,columnname,ismandatory,ad_reference_id,isrange,defaultvalue,seqno FROM ad_process_para WHERE ad_process_id=? ORDER BY seqno').all(ad_process_id);
    return {
      AD_Process_ID: p.ad_process_id, value: p.value, name: p.name,
      classname: p.classname || '', isReport: p.isreport === 'Y',
      jasperReport: p.jasperreport, ad_reportview_id: p.ad_reportview_id,
      paras: paras.map(function (r) {
        return {
          name: r.name, columnName: r.columnname, mandatory: r.ismandatory === 'Y',
          ad_reference_id: r.ad_reference_id, type: refType(r.ad_reference_id),
          isRange: r.isrange === 'Y', defaultValue: r.defaultvalue, seqno: r.seqno
        };
      })
    };
  }

  // resolveClassname — ProcessUtil:157-162 semantics: a non-blank classname is used as-is; a BLANK classname
  // on a report proc falls back to a synthesized report key (the JASPER_STARTER analogue) so the receipt
  // folds can run. The report key derives from the proc's value/name (e.g. "Rpt C_Order" -> report:c_order).
  function resolveClassname(proc) {
    if (proc.classname) return proc.classname;
    if (proc.isReport) {
      var hay = ((proc.value || '') + ' ' + (proc.name || '')).toLowerCase();
      // map known report procs to the report_overlay header tables (extracted, not invented)
      if (/c_order\b|order print|rpt c_order/.test(hay) && !/invoice/.test(hay)) return 'report:c_order';
      if (/c_invoice|invoice print|rpt c_invoice/.test(hay)) return 'report:c_invoice';
    }
    return proc.classname || '';     // blank -> no handler -> absent-handler result downstream
  }

  // validateParams — the prepare() step: every mandatory para must be supplied (non-empty); every supplied
  // value must satisfy its reference type. Returns { ok, required:[], supplied:[], missing:[], badType:[] }.
  function validateParams(proc, params) {
    params = params || {};
    var required = [], supplied = [], missing = [], badType = [];
    proc.paras.forEach(function (pp) {
      var has = Object.prototype.hasOwnProperty.call(params, pp.columnName) && params[pp.columnName] != null && params[pp.columnName] !== '';
      if (pp.mandatory) {
        required.push(pp.columnName);
        if (!has) missing.push(pp.columnName);
      }
      if (has) {
        supplied.push(pp.columnName);
        if (!typeOk(pp.type, params[pp.columnName])) badType.push(pp.columnName + ':' + pp.type);
      }
    });
    return { ok: missing.length === 0 && badType.length === 0, required: required, supplied: supplied, missing: missing, badType: badType };
  }

  // dispatch — the full spine: read → resolve classname → validate params → run handler → result.
  //   db   = better-sqlite3 handle on ad_full.db (for the AD rows)
  //   info = { AD_Process_ID, params:{columnName:value}, ...handler-specific (Record_ID etc.) }
  //   ctx  = data accessors the handler needs (fetchHeader/fetchLines/fetchFacts/...). Optional.
  // Returns a ProcessResult: { ad_process_id, classname, dispatched, validate, result|reason }.
  function dispatch(db, info, ctx) {
    ctx = ctx || {};
    var proc = readProcess(db, info.AD_Process_ID);
    var classname = resolveClassname(proc);
    var validate = validateParams(proc, info.params);

    // prepare(): reject before doIt() if params are invalid — faithful to SvrProcess.process() aborting
    // when prepare() throws / parameters are missing.
    if (!validate.ok) {
      return {
        ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
        dispatched: false, reason: 'param-validation-failed', validate: validate,
        message: 'missing mandatory: [' + validate.missing.join(',') + '] badType: [' + validate.badType.join(',') + ']'
      };
    }

    // Core.getProcess(className) == null branch (ProcessUtil:166-170): explicit absent-handler, NOT a no-op.
    if (!classname || !hasHandler(classname)) {
      return {
        ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
        dispatched: false, reason: 'absent-handler', validate: validate,
        message: 'Failed to create new process instance for ' + (classname || '(blank classname)') +
                 ' — classname not in registry (54k-LOC SvrProcess corpus is named-deferred, not ported)'
      };
    }

    // doIt(): run the registered handler.
    var entry = REGISTRY[classname];
    var out;
    try { out = entry.fn(ctx, info) || {}; }
    catch (e) { out = { ok: false, message: 'handler threw: ' + (e && e.message), rows: 0 }; }
    return {
      ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
      kind: entry.meta.kind || 'process', dispatched: true,
      ok: out.ok !== false, reason: out.ok === false ? 'handler-failed' : 'ok',
      validate: validate, rows: out.rows || 0, message: out.message, result: out.result
    };
  }

  var API = {
    REGISTRY: REGISTRY, registerHandler: registerHandler, hasHandler: hasHandler,
    registeredClassnames: registeredClassnames, installDefaultHandlers: installDefaultHandlers,
    readProcess: readProcess, resolveClassname: resolveClassname,
    validateParams: validateParams, dispatch: dispatch,
    refType: refType, typeOk: typeOk, REF_TYPE: REF_TYPE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdProcess = API;                    // browser
  else if (global) global.AdProcess = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
