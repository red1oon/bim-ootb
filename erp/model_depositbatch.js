// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_depositbatch.js: the model hooks + the DocAction class of C_DepositBatch (MDepositBatch, window 200031 'Payments into Batch') and the hooks of C_DepositBatchLine (MDepositBatchLine), ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21 PORT SPEC (Deposit Batch claims D1-D9). Witness: erp/tests/witness_docaction_four.js (W-DOCACTION-4, §DA4 lines; parity with the pilot with DA4_LEGACY=1).
//   Why it exists (MEASURED 2026-11-25 by the help peek sweep, W-HELP-PEEK): ML.processIt(trx,'c_depositbatch',id,'CO') answered "no DocAction class registered". The physical tables were in patches/ad_seed.db.sql; model_bankstatement.js
//   already reads the batch lines (depositPayments) for a statement that reconciles a whole batch, but a batch could not be Completed, Closed, Voided or Reactivated.
//   Ported from org.adempiere.base/src/org/compiere/model/MDepositBatch.java (beforeSave :95-114, voidIt :203-262, prepareIt :428-463, completeIt :479-531, closeIt :534-547, reActivateIt :564-590, afterDelete :323-330,
//   getSummary :608-618, updateHeaderAmt :620-632) and MDepositBatchLine.java (beforeSave :100-157, afterSave/afterDelete :159-180, updateHeader :182-192).
//   Twin decisions: Java's beforeSave of the line is ported literally including its operator precedence (`C_Payment_ID != 0 && Drafted || InProgress || Invalid || Approved || NotApproved`); the process messages come from AD_Message of the seed
//   with the legacy text as the fallback (AD_Message of client 0 on the pilot); MPayment.toString prints as in model_bankstatement.js (payToString). NOT PORTED (named): unlockIt / invalidateIt (no engine entry), createPDF, getDocumentInfo, isComplete.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelDepositBatch = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z, N = T.N;
  var TBL = 'c_depositbatch', LTBL = 'c_depositbatchline';
  var fire = function (trx, timing, row) { return ML.fire(trx, timing, TBL, row); };
  var cur = function (trx, id) { return trx.get(TBL, id); };
  function upd(trx, id, ch) { trx.update(TBL, cur(trx, id), ch); }
  function saveEx(trx, table, row, ch) { var r = ML.save(trx, table, row, ch); if (!r.ok) throw new Error('SaveError ' + table + ': ' + r.error); return r; }
  var LEGACY_MSG = { NoLines: 'No Document Lines found', ErrorMultipleCurrencyPaymentsRestricted: 'Multiple currency payments are not allowed in a single batch. All batch line payments must be in {0}',
    ErrorCurrencyCouldNotModify: 'Could not modify the currency once batch line has been added', ParentComplete: 'The parent record (document) is already processed',
    DepositBatchVoidFailedBankStatementLine: 'Could not void deposit batch: deposit batch is used on a bank statement line', PaymentIsAlreadyReconciled: 'Payment is already Reconciled ', Voided: '** Voided',
    DepositBatchReactivationFailedBankStatementLine: 'Could not reactivate deposit batch: deposit batch is used on a bank statement line', NotAllowReActivationOfReconciledPaymentsIntoBatch: 'Can not reactivate reconciled Payment.' };
  function getMsg(trx, key, args) {
    var t = T.msgText(trx, key); if (t === key && LEGACY_MSG[key] != null) t = LEGACY_MSG[key];
    return (args || []).reduce(function (s, a, i) { return s.split('{' + i + '}').join(String(a)); }, t);
  }
  function translate(trx, col) { var r = trx.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [col.toLowerCase()])[0]; return r && r.name != null ? r.name : col; }   // Msg.translate(ctx, key)
  function payToString(p) { return 'MPayment[' + p.c_payment_id + '-' + p.documentno + ',Receipt=' + (Y(p.isreceipt) ? 'true' : 'false') + ',PayAmt=' + p.payamt + ',Discount=' + (p.discountamt == null ? 0 : p.discountamt) + ',WriteOff=' + (p.writeoffamt == null ? 0 : p.writeoffamt) + ',Allocated=' + (Y(p.isallocated) ? 'true' : 'false'); }   // MPayment.toString :1139-1150 (cut at the allocated flag as model_bankstatement.js)
  var lines = function (trx, b) { return trx.find(LTBL, { c_depositbatch_id: b.c_depositbatch_id }, ['line', 'c_depositbatchline_id']); };      // getLines ORDER BY Line, C_DepositBatchLine_ID
  function isoCode(trx, curId) { var c = trx.get('c_currency', curId); return c ? c.iso_code : String(curId); }
  function usedOnStatementLine(trx, id) { return trx.q('SELECT 1 AS x FROM c_bankstatementline WHERE c_depositbatch_id=? LIMIT 1', [id]).length > 0; }   // DB.getSQLValueEx(... == 1)
  function headerAmt(trx, id) { var s = Z; trx.find(LTBL, { c_depositbatch_id: id }).forEach(function (l) { if (l.isactive !== 'N') s = s.add(D(l.payamt == null ? 0 : l.payamt)); }); return s; }   // SUM(PayAmt) of the active lines
  function updateHeader(trx, id) { var h = cur(trx, id); if (h) trx.update(TBL, h, { depositamt: N(headerAmt(trx, id)) }); return null; }     // MDepositBatchLine.updateHeader :182-192 (raw UPDATE)
  function addDescription(trx, id, text) { var b = cur(trx, id); upd(trx, id, { description: b.description == null ? text : b.description + ' : ' + text }); }   // :596-606; the RUNNING pilot joins with ' : ' (the source tree says ' | '): the pilot is the oracle, measured 2026-11-25

  ML.registerModel(TBL, {
    initialDefaults: { docstatus: 'DR', docaction: 'CO', processed: 'N', depositamt: 0 },                                                                      // setInitialDefaults :80-85
    beforeSave: function (trx, r, isNew, old) {   // :95-114
      if (!isNew && old && String(old.c_currency_id) !== String(r.c_currency_id)) {
        if (trx.q('SELECT COUNT(1) AS n FROM c_depositbatchline WHERE c_depositbatch_id=?', [r[TBL + '_id']])[0].n > 0) return getMsg(trx, 'ErrorCurrencyCouldNotModify');
      }
      return null;
    },
    afterDelete: function (trx, r) { trx.find('c_payment', { c_depositbatch_id: r[TBL + '_id'] }).forEach(function (p) { trx.update('c_payment', p, { c_depositbatch_id: 0 }); }); return null; }   // :323-330
  });
  ML.registerModel(LTBL, {
    initialDefaults: { line: 0, payamt: 0 },
    beforeSave: function (trx, l, isNew, old) {   // :100-157
      var parent = cur(trx, l.c_depositbatch_id);
      if (isNew && parent && Y(parent.processed)) return getMsg(trx, 'ParentComplete');                                                                         // :103-106 (Msg.translate "C_DepositBatch_ID" in Java; the key text is what the window shows)
      var pay = nz(l.c_payment_id) ? trx.get('c_payment', l.c_payment_id) : null;
      if (!pay) throw new Error('java.lang.NullPointerException: C_DepositBatchLine without a payment (MDepositBatchLine.java:109 getC_Payment() is null)');       // Java dereferences getC_Payment() unguarded
      if (parent && Number(parent.c_currency_id) !== Number(pay.c_currency_id)) return getMsg(trx, 'ErrorMultipleCurrencyPaymentsRestricted', [isoCode(trx, parent.c_currency_id)]);   // :109-113
      if (!Number(l.line)) { var mx = 0; trx.find(LTBL, { c_depositbatch_id: l.c_depositbatch_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); }); l.line = mx + 10; }   // :114-118
      var st = parent ? parent.docstatus : null;
      if ((nz(l.c_payment_id) && st === 'DR') || st === 'IP' || st === 'IN' || st === 'AP' || st === 'NA') {                                                       // :119-123 (Java precedence kept)
        if (!isNew && old && String(old.c_payment_id) !== String(l.c_payment_id)) {                                                                              // :126-137 the old payment leaves the batch
          var op = trx.q('SELECT * FROM c_payment WHERE c_payment_id=? AND c_depositbatch_id=?', [old.c_payment_id, l.c_depositbatch_id])[0];
          if (op) saveEx(trx, 'c_payment', trx.get('c_payment', op.c_payment_id), { c_depositbatch_id: 0, isreconciled: 'N' });
        }
        saveEx(trx, 'c_payment', pay, { c_depositbatch_id: l.c_depositbatch_id });                                                                               // :138-141
        pay = trx.get('c_payment', pay.c_payment_id);
        l.payamt = Y(pay.isreceipt) ? pay.payamt : N(D(pay.payamt).negate());                                                                                    // setPayment: PayAmt = getPayAmt(true)
      }
      return null;
    },
    afterSave: function (trx, l) { return updateHeader(trx, l.c_depositbatch_id); },                                                                           // :159-165
    afterDelete: function (trx, l) { updateHeader(trx, l.c_depositbatch_id); if (nz(l.c_payment_id)) { var p = trx.get('c_payment', l.c_payment_id); if (p) trx.update('c_payment', p, { c_depositbatch_id: null }); } return null; }   // :167-180
  });

  var MDepositBatch = {
    prepareIt: function (trx, b) {   // :428-463
      var m = fire(trx, 'BEFORE_PREPARE', b); if (m) { T.msg(trx, m); return 'IN'; }
      var ls = lines(trx, b);
      if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }                                                                                                 // :432-436
      var total = Z; ls.forEach(function (l) { if (l.isactive !== 'N') total = total.add(D(l.payamt == null ? 0 : l.payamt)); });
      upd(trx, b.c_depositbatch_id, { depositamt: N(total) });
      m = fire(trx, 'AFTER_PREPARE', cur(trx, b.c_depositbatch_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = TBL + ':' + b.c_depositbatch_id;
      if (cur(trx, b.c_depositbatch_id).docaction !== 'CO') upd(trx, b.c_depositbatch_id, { docaction: 'CO' });
      return 'IP';
    },
    approveIt: function () { return false; },                                                                                                                   // :467
    rejectIt: function () { return false; },                                                                                                                    // :473
    completeIt: function (trx, b) {   // :479-531
      if (trx._justPrepared !== TBL + ':' + b.c_depositbatch_id) { var st = MDepositBatch.prepareIt(trx, b); if (st !== 'IP') return st; }
      trx._justPrepared = null; b = cur(trx, b.c_depositbatch_id);
      var m = fire(trx, 'BEFORE_COMPLETE', b); if (m) { T.msg(trx, m); return 'IN'; }
      var cc = trx.q('SELECT COUNT(DISTINCT p.c_currency_id) AS n FROM c_payment p INNER JOIN c_depositbatchline dbl ON dbl.c_payment_id=p.c_payment_id WHERE dbl.c_depositbatch_id=?', [b.c_depositbatch_id])[0];
      if (Number(cc.n) > 1) { T.msg(trx, getMsg(trx, 'ErrorMultipleCurrencyPaymentsRestricted', [isoCode(trx, b.c_currency_id)])); return 'IN'; }                  // :488-496
      lines(trx, b).forEach(function (l) { saveEx(trx, LTBL, l, { processed: 'Y' }); });                                                                          // :498-502
      var h = cur(trx, b.c_depositbatch_id); trx.update(TBL, h, { depositamt: N(headerAmt(trx, b.c_depositbatch_id)) });                                          // updateHeaderAmt :620-632
      m = fire(trx, 'AFTER_COMPLETE', cur(trx, b.c_depositbatch_id)); if (m) { T.msg(trx, m); return 'IN'; }
      upd(trx, b.c_depositbatch_id, { processed: 'Y', docaction: 'CL' });
      return 'CO';
    },
    voidIt: function (trx, b) {   // :203-262
      var m = fire(trx, 'BEFORE_VOID', b); if (m) { T.msg(trx, m); return false; }
      if (b.docstatus === 'CL' || b.docstatus === 'RE' || b.docstatus === 'VO') { T.msg(trx, 'Document Closed: ' + b.docstatus); upd(trx, b.c_depositbatch_id, { docaction: '--' }); return false; }
      if (usedOnStatementLine(trx, b.c_depositbatch_id)) { T.msg(trx, getMsg(trx, 'DepositBatchVoidFailedBankStatementLine')); return false; }
      var ls = lines(trx, b);
      for (var i = 0; i < ls.length; i++) {
        var l = ls[i];
        if (D(l.payamt == null ? 0 : l.payamt).signum() !== 0) {
          if (nz(l.c_payment_id)) {
            var p = trx.get('c_payment', l.c_payment_id);
            if (Y(p.isreconciled)) { T.msg(trx, getMsg(trx, 'PaymentIsAlreadyReconciled') + payToString(p)); return false; }
            saveEx(trx, 'c_payment', p, { c_depositbatch_id: 0 });
          }
          saveEx(trx, LTBL, trx.get(LTBL, l.c_depositbatchline_id), { payamt: 0, processed: 'Y' });                                                        // setPayAmt(0); setProcessed(true); saveEx() = PO.save WITH the line's beforeSave: on a Drafted batch it relinks the payment and resets PayAmt (:119-141), measured on the pilot
        }
      }
      addDescription(trx, b.c_depositbatch_id, getMsg(trx, 'Voided'));
      upd(trx, b.c_depositbatch_id, { depositamt: 0 });
      m = fire(trx, 'AFTER_VOID', cur(trx, b.c_depositbatch_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, b.c_depositbatch_id, { processed: 'Y', docaction: '--', docstatus: 'VO' });
      return true;
    },
    closeIt: function (trx, b) {   // :534-547
      var m = fire(trx, 'BEFORE_CLOSE', b); if (m) { T.msg(trx, m); return false; }
      upd(trx, b.c_depositbatch_id, { docaction: '--' });
      m = fire(trx, 'AFTER_CLOSE', cur(trx, b.c_depositbatch_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, b.c_depositbatch_id, { docstatus: 'CL' });
      return true;
    },
    reverseCorrectIt: function () { return false; },                                                                                                           // :550
    reverseAccrualIt: function () { return false; },                                                                                                           // :556
    reActivateIt: function (trx, b) {   // :564-590
      var m = fire(trx, 'BEFORE_REACTIVATE', b); if (m) { T.msg(trx, m); return false; }
      if (usedOnStatementLine(trx, b.c_depositbatch_id)) { T.msg(trx, getMsg(trx, 'DepositBatchReactivationFailedBankStatementLine')); return false; }
      var ls = lines(trx, b);
      for (var i = 0; i < ls.length; i++) {
        var p = nz(ls[i].c_payment_id) ? trx.get('c_payment', ls[i].c_payment_id) : null;
        if (p && Y(p.isreconciled)) { T.msg(trx, getMsg(trx, 'NotAllowReActivationOfReconciledPaymentsIntoBatch') + payToString(p)); return false; }
        saveEx(trx, LTBL, trx.get(LTBL, ls[i].c_depositbatchline_id), { processed: 'N' });
      }
      upd(trx, b.c_depositbatch_id, { processed: 'N' });
      m = fire(trx, 'AFTER_REACTIVATE', cur(trx, b.c_depositbatch_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, b.c_depositbatch_id, { docstatus: 'IP' });                                                                                                       // DocumentEngine.reActivateIt :698-711
      return true;
    },
    getSummary: function (trx, b) { var o = (b.documentno == null ? '' : b.documentno) + ': ' + translate(trx, 'DepositBatchAmt') + '=' + (b.depositamt == null ? 0 : b.depositamt); return b.description ? o + ' - ' + b.description : o; }   // :608-618
  };
  ML.registerDocAction(TBL, MDepositBatch);
  return { MDepositBatch: MDepositBatch };
});
