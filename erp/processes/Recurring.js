// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/Recurring.js - org.compiere.process.Recurring (AD_Process 213 "C_Recurring Run"), verbatim
// (org.adempiere.base.process/src/org/compiere/process/Recurring.java) + the MRecurring / MRecurringRun model it runs
// (org.adempiere.base/src/org/compiere/model/MRecurring.java, MRecurringRun.java). bim-compiler prompts/TEAMWORK_FRAMEWORK.md section 40 (owner MF-2: a renewed certificate = a recurring
// invoice) / section 41 row F1 - Witness: W-RECURRING (erp/tests/witness_recurring.js, section-RECUR lines). Also exports window.ModelRecurring for processes/RecurringRun.js (AD_Process 200074).
// WHAT RUNS (MRecurring.executeRun :114-196): calculateRuns (RunsRemaining = RunsMax - COUNT(C_Recurring_Run), saved; none left -> IllegalStateException "No Runs Left"), a C_Recurring_Run row
//   (DateDoc = DateNextRun), the copy by RecurringType, then DateLastRun = run.Updated, RunsRemaining - 1, DateNextRun advanced by Frequency x FrequencyType, saveEx.
// MODEL: c_recurring.initialDefaults :64-70 (DateNextRun = now, FrequencyType M, Frequency 1, RunsMax 1, RunsRemaining 0) and beforeSave :255-290 (RecurringType mandatory + the matching document).
// COPY TYPES: I (Invoice) = MInvoice.copyFrom(from, dateDoc, dateDoc, from.C_DocType_ID, from.isSOTrx, false, trx, false) = ModelInvoice.MInvoice_copyFrom (model_invoice.js, the same port the
//   reversal uses); P (Payment) = :158-178 inline copy. NAMED, NOT PORTED (the process FAILS with a '... not ported - named' error, nothing written - legacy's error path, never a silent skip):
//   O (MOrder.copyFrom), J (MProject.copyFrom), G (MJournalBatch.copyFrom). A RecurringType outside I/O/J/G/P answers "Invalid @RecurringType@ = x" (:176-177) like legacy (success, nothing written).
// TWIN DECISIONS (each printed as a section-RECUR line when it matters): (a) DateLastRun = run.getUpdated(): the twin stamps Updated when the op group is applied, so inside the transaction the
//   recorded clock env.now (the same value the commit stamps) is used. (b) Calendar.add: Daily +n days, Weekly +7n, Monthly +n months with the day clamped to the target month's length (Calendar
//   semantics: Jan 31 + 1 month = Feb 28/29), Quarterly +3n months; time of day kept (UTC arithmetic, no DST). (c) counting runs reads the Trx (find: committed rows + this transaction's pending
//   writes). (d) a Record_ID that names no C_Recurring row: legacy builds an empty MRecurring and its toString() throws NullPointerException (RecurringType null) - the twin raises the same.
(function (global) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var P = NODE ? require('../ad_process.js') : global.AdProcess;
  var ML = NODE ? require('../model_layer') : global.ModelLayer;
  function nz(v) { return v == null || v === '' ? 0 : Number(v); }
  function elementName(trx, col) { var r = trx.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [col.toLowerCase()])[0]; return r && r.name != null ? r.name : col; }   // Msg.getElement

  // ---- MRecurring model ------------------------------------------------------------------------------------
  // initialDefaults :64-70 ; beforeSave :255-290
  if (ML && ML.registerModel) ML.registerModel('c_recurring', {
    initialDefaults: { frequencytype: 'M', frequency: 1, runsmax: 1, runsremaining: 0 }, initialClock: ['datenextrun'],
    beforeSave: function (trx, r) {
      var rt = r.recurringtype;
      if (rt == null || rt === '') return '@FillMandatory@ ' + elementName(trx, 'RecurringType');                                     // :258-262
      if (rt === 'O' && !nz(r.c_order_id)) return '@FillMandatory@ ' + elementName(trx, 'C_Order_ID');                              // :263-267
      if (rt === 'I' && !nz(r.c_invoice_id)) return '@FillMandatory@ ' + elementName(trx, 'C_Invoice_ID');                          // :268-272
      if (rt === 'G' && !nz(r.gl_journalbatch_id)) return '@FillMandatory@ ' + elementName(trx, 'GL_JournalBatch_ID');              // :273-277
      if (rt === 'J' && !nz(r.c_project_id)) return '@FillMandatory@ ' + elementName(trx, 'C_Project_ID');                          // :278-282
      return null;
    }
  });

  // 'YYYY-MM-DD HH:MM:SS[.f]' <-> UTC ms
  function parseTs(s) { var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(String(s)); if (!m) throw new Error('Bad timestamp: ' + s); return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
  function fmtTs(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
  function addMonths(ms, n) {                                                                                                        // Calendar.add(MONTH, n): day-of-month clamped
    var d = new Date(ms), y = d.getUTCFullYear(), mo = d.getUTCMonth() + n, day = d.getUTCDate();
    var ty = y + Math.floor(mo / 12), tm = ((mo % 12) + 12) % 12, last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return Date.UTC(ty, tm, Math.min(day, last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  // setDateNextRun() :222-243 -> { frequency (after the <1 -> 1 fix), next }
  function nextRun(rec) {
    var frequency = nz(rec.frequency) < 1 ? 1 : nz(rec.frequency), ms = parseTs(rec.datenextrun), ft = rec.frequencytype;
    if (ft === 'D') ms += frequency * 86400000;                                                                                       // Calendar.DAY_OF_YEAR
    else if (ft === 'W') ms += frequency * 7 * 86400000;                                                                              // Calendar.WEEK_OF_YEAR
    else if (ft === 'M') ms = addMonths(ms, frequency);
    else if (ft === 'Q') ms = addMonths(ms, 3 * frequency);
    return { frequency: frequency, next: fmtTs(ms) };
  }
  function copyModule(name) { return NODE ? require('../' + name) : global[name === 'model_invoice' ? 'ModelInvoice' : 'ModelOrder']; }

  // MRecurring.toString :95-110 (NPE when RecurringType is null, like getRecurringType().equals)
  function toStr(rec) {
    if (rec.recurringtype == null) throw new Error('java.lang.NullPointerException: MRecurring.toString() getRecurringType() is null (C_Recurring_ID=' + rec.c_recurring_id + ')');
    var s = 'MRecurring[' + rec.c_recurring_id + '-' + rec.name;
    if (rec.recurringtype === 'O') s += ',C_Order_ID=' + rec.c_order_id; else if (rec.recurringtype === 'I') s += ',C_Invoice_ID=' + rec.c_invoice_id;
    else if (rec.recurringtype === 'J') s += ',C_Project_ID=' + rec.c_project_id; else if (rec.recurringtype === 'G') s += ',GL_JournalBatch_ID=' + rec.gl_journalbatch_id;
    return s + ',Frequency=' + rec.frequencytype + '*' + rec.frequency + ']';
  }

  // MRecurring.executeRun() :114-196 -> { msg, po: {table, id} | null }   (po = getLastPO())
  function executeRun(trx, recId) {
    var rec = trx.get('c_recurring', recId), dateDoc = rec.datenextrun;
    // calculateRuns() :201-210
    var current = trx.find('c_recurring_run', { c_recurring_id: recId }).length, remaining = nz(rec.runsmax) - current;
    ML.saveEx(trx, 'c_recurring', rec, { runsremaining: remaining }); rec = trx.get('c_recurring', recId);
    if (!(remaining > 0)) throw new Error('No Runs Left');                                                                            // IllegalStateException
    var run = ML.newRecord(trx, 'c_recurring_run', {}), msg = '@Created@ ', po = null;                                               // new MRecurringRun(ctx, this) :43-52
    run.set('ad_client_id', rec.ad_client_id).set('ad_org_id', rec.ad_org_id).set('c_recurring_id', rec.c_recurring_id).set('datedoc', rec.datenextrun);
    var t = rec.recurringtype;
    if (t === 'I') {
      var INV = copyModule('model_invoice'), from = trx.get('c_invoice', rec.c_invoice_id);
      var inv = INV.MInvoice_copyFrom(trx, from, dateDoc, dateDoc, from.c_doctype_id, from.issotrx === 'Y', false, false, null);    // :134-139
      run.set('c_invoice_id', inv.c_invoice_id); msg += inv.documentno; po = { table: 'c_invoice', id: inv.c_invoice_id };
    } else if (t === 'P') {                                                                                                          // :158-178
      var pf = trx.get('c_payment', rec.c_payment_id), pt = ML.newRecord(trx, 'c_payment', {});
      ML.copyValues(trx, 'c_payment', pf, pt, trx.env.client, pf.ad_org_id);                                                        // copyValues(from, to) = PO.copyValues(from,to) (:158-160); client = the session's (new MPayment(ctx,0)), org set from the source next
      pt.set('ad_org_id', pf.ad_org_id).set('isreconciled', 'N').set('dateacct', dateDoc).set('datetrx', dateDoc).set('documentno', '')
        .set('processed', 'N').set('posted', 'N').set('docstatus', 'DR').set('docaction', 'CO');
      if (!pt.save()) throw new Error('SaveError c_payment: ' + pt.error);
      var pay = trx.get('c_payment', pt.id());
      run.set('c_payment_id', pay.c_payment_id); msg += pay.documentno; po = { table: 'c_payment', id: pay.c_payment_id };
    } else if (t === 'O') throw new Error('MRecurring.executeRun RecurringType O (Order): MOrder.copyFrom (MRecurring.java:122-130) not ported - named');
    else if (t === 'J') throw new Error('MRecurring.executeRun RecurringType J (Project): MProject.copyFrom (MRecurring.java:140-147) not ported - named');
    else if (t === 'G') throw new Error('MRecurring.executeRun RecurringType G (GL Journal Batch): MJournalBatch.copyFrom (MRecurring.java:148-155) not ported - named');
    else return { msg: 'Invalid @RecurringType@ = ' + t, po: null };                                                                  // :176-177
    if (!run.save()) throw new Error('SaveError c_recurring_run: ' + run.error);                                                     // run.saveEx :180
    var nx = nextRun(rec), left = nz(rec.runsremaining) - 1;                                                                         // setDateLastRun(run.getUpdated()) - twin decision (a)
    ML.saveEx(trx, 'c_recurring', trx.get('c_recurring', recId), { datelastrun: trx.env.now, runsremaining: left, frequency: nx.frequency, datenextrun: nx.next });
    trx.say('§RECUR executeRun c_recurring=' + recId + ' type=' + t + ' created=' + po.table + ':' + po.id + ' dateDoc=' + dateDoc + ' remaining=' + left + ' next=' + nx.next);
    return { msg: msg, po: po };
  }

  var API = { executeRun: executeRun, nextRun: nextRun, toStr: toStr, parseTs: parseTs, fmtTs: fmtTs };
  if (NODE) module.exports = API; else global.ModelRecurring = API;

  // ---- AD_Process 213 -------------------------------------------------------------------------------------
  if (P && P.defineProcess) P.defineProcess('org.compiere.process.Recurring', function (SvrProcess, X) {
    function Recurring() { SvrProcess.call(this); }
    Recurring.prototype = Object.create(SvrProcess.prototype);
    Recurring.prototype.prepare = function () {                                                                                      // :43-52
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        if (para[i].getParameter() == null) ;
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA Recurring ' + para[i].getParameterName());                                          // MProcessPara.validateUnknownParameter
      }
    };
    Recurring.prototype.doIt = function () {                                                                                         // :59-65
      var trx = this.get_TrxName(), id = this.getRecord_ID(), rec = id ? trx.get('c_recurring', id) : null;
      if (!rec) throw new Error('java.lang.NullPointerException: MRecurring.toString() getRecurringType() is null (C_Recurring_ID=' + id + ', no such row)');   // twin decision (d)
      trx.say('§PROC-INFO Recurring ' + toStr(rec));
      return executeRun(trx, id).msg;
    };
    return Recurring;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
