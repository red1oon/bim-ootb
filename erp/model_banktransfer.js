// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_banktransfer.js: the model hooks + the DocAction class of C_BankTransfer (MBankTransfer, window 200105 'Bank/Cash Transfer'), ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21 PORT SPEC (Bank Transfer claims B1-B8). Witness: erp/tests/witness_docaction_four.js (W-DOCACTION-4, §DA4 lines; parity with the pilot with DA4_LEGACY=1).
//   Why it exists (MEASURED 2026-11-25 by the help peek sweep, W-HELP-PEEK): the dictionary has the table (AD_Table 200246) and the window, the seed had NO physical table and the twin had no class: "no-table".
//   The table is a boot overlay (ad_import_tables.js DDL_BT, from the live schema); this file is the class. Ported from org.adempiere.base/src/org/compiere/model/MBankTransfer.java: beforeSave :90-184,
//   prepareIt :203-216, approveIt :218, rejectIt :224, completeIt :230-313, voidIt :315-339, closeIt :341-354, reverseCorrectIt :356-377, reverseAccrualIt :379-400, reActivateIt :402-414, getSummary :416-424.
//   Completing creates TWO payments (From account pays out to the To business partner, To account receives), each completed through the twin's own c_payment class (ML.processIt, which also posts).
//   NOT PORTED (named, not faked): MPayment.voidIt :2575-2655 / reverseCorrectIt :2679-2865 / reverseAccrualIt :2865-2900 are not in the twin's c_payment class (model_invoice.js MPayment has prepareIt / completeIt / approveIt only),
//   so voidIt / reverseCorrectIt / reverseAccrualIt of a transfer that already has payments answer with that fact (an Error: the engine rolls the Trx back, nothing is half done). A Drafted transfer (no payments) voids as in Java.
//   unlockIt :190 / invalidateIt :197 (no engine entry), createPDF, getDoc_User_ID / getC_Currency_ID / getApprovalAmt (no caller in the twin).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelBankTransfer = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z, N = T.N;
  var TBL = 'c_banktransfer';
  var fire = function (trx, timing, row) { return ML.fire(trx, timing, TBL, row); };
  var cur = function (trx, id) { return trx.get(TBL, id); };
  function upd(trx, id, ch) { trx.update(TBL, cur(trx, id), ch); }
  var LEGACY_MSG = { FromToBankAccountMustDifferent: 'From Bank Account and To Bank Account must be different {0}', FromOrgNotMatchBankAccount: 'From Organization does not match the organization of the From Bank Account {0}' };
  function getMsg(trx, key, args) {                                                                                                          // Msg.getMsg(ctx, key, args): AD_Message text (+ {n}); the legacy text when the seed lacks the row
    var t = T.msgText(trx, key); if (t === key && LEGACY_MSG[key] != null) t = LEGACY_MSG[key];
    return (args || []).reduce(function (s, a, i) { return s.split('{' + i + '}').join(String(a)); }, t);
  }
  function str(r, isNew) { return 'MBankTransfer[' + (isNew ? 0 : r[TBL + '_id']) + '-' + (r.documentno == null ? 'null' : r.documentno); }   // toString :156-161 (no closing bracket, as Java)
  var bpOfOrgBank = function (trx, bankAcct) { var x = trx.q("SELECT bp.c_bpartner_id AS id FROM c_bpartner bp WHERE bp.ad_orgbp_id IN (SELECT ba.ad_org_id FROM c_bankaccount ba WHERE ba.c_bankaccount_id=?) AND bp.isactive='Y' ORDER BY bp.c_bpartner_id", [bankAcct])[0]; return x ? Number(x.id) : 0; };

  ML.registerModel(TBL, {
    beforeSave: function (trx, r, isNew) {   // :90-184 (a returned string is the saveError text)
      if (Number(r.to_c_bankaccount_id) === Number(r.from_c_bankaccount_id)) return getMsg(trx, 'FromToBankAccountMustDifferent', [str(r, isNew)]);                  // :93-96
      var fromBA = trx.get('c_bankaccount', r.from_c_bankaccount_id);
      if (fromBA && nz(fromBA.ad_org_id) && Number(fromBA.ad_org_id) !== Number(r.from_ad_org_id || 0)) return getMsg(trx, 'FromOrgNotMatchBankAccount', [str(r, isNew)]);   // :98-102
      if (!nz(r.from_c_currency_id) && fromBA && Number(fromBA.c_currency_id) > 0) r.from_c_currency_id = fromBA.c_currency_id;                                // :104-108
      var toBA = trx.get('c_bankaccount', r.to_c_bankaccount_id);
      if (!nz(r.to_ad_org_id) && toBA && Number(toBA.ad_org_id) > 0) r.to_ad_org_id = toBA.ad_org_id;                                                          // :112-116
      if (!nz(r.to_c_currency_id) && toBA && Number(toBA.c_currency_id) > 0) r.to_c_currency_id = toBA.c_currency_id;                                          // :117-121
      if (!nz(r.from_c_bpartner_id)) { var fb = bpOfOrgBank(trx, r.from_c_bankaccount_id); if (fb > 0) r.from_c_bpartner_id = fb; }                            // :123-130
      if (!nz(r.to_c_bpartner_id)) {                                                                                                                           // :132-142
        var tb = bpOfOrgBank(trx, r.to_c_bankaccount_id);
        if (tb > 0) r.to_c_bpartner_id = tb; else if (Number(r.from_ad_org_id || 0) === Number(r.to_ad_org_id || 0) && nz(r.from_c_bpartner_id)) r.to_c_bpartner_id = r.from_c_bpartner_id;
      }
      if (D(r.rate == null ? 0 : r.rate).signum() === 0) {                                                                                                     // :144-152
        if (D(r.from_amt == null ? 0 : r.from_amt).signum() !== 0) r.rate = N(D(r.to_amt == null ? 0 : r.to_amt).divide(D(r.from_amt), 12, 'HALF_UP'));
      } else {
        var toAmt = D(r.rate).multiply(D(r.from_amt == null ? 0 : r.from_amt));
        if (nz(r.to_c_currency_id)) { var cu = trx.get('c_currency', r.to_c_currency_id); if (cu) toAmt = toAmt.setScale(Number(cu.stdprecision), 'HALF_UP'); }
        r.to_amt = N(toAmt);
      }
      if (!nz(r.to_c_charge_id) && nz(r.from_c_charge_id)) r.to_c_charge_id = r.from_c_charge_id;                                                              // :177-181
      return null;
    }
  });

  function payDocType(trx, client, isReceipt) {                                                                                                               // MPayment.setC_DocType_ID(boolean) :1000-1030
    var r = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE isactive='Y' AND ad_client_id=? AND docbasetype=? ORDER BY CASE WHEN isdefault='Y' THEN 0 ELSE 1 END, c_doctype_id", [client, isReceipt ? 'ARR' : 'APP'])[0];
    return r ? Number(r.d) : 0;
  }
  function payments(trx, t) { return trx.find('c_payment', { c_banktransfer_id: t.c_banktransfer_id }, ['c_payment_id']); }                                    // MPayment.getAllIDs(... C_BankTransfer_ID=?)
  function acctSchemaCurrency(trx, t) { var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [t.ad_client_id])[0], as = ci ? trx.get('c_acctschema', ci.a) : null; return as ? Number(as.c_currency_id) : 0; }
  function mkPayment(trx, t, side, asCur) {   // :243-313 one of the two payments
    var from = side === 'from', isRcpt = !from, cur = Number(from ? t.from_c_currency_id : t.to_c_currency_id);
    var p = { c_banktransfer_id: t.c_banktransfer_id, c_bankaccount_id: from ? t.from_c_bankaccount_id : t.to_c_bankaccount_id, ad_org_id: from ? t.from_ad_org_id : t.to_ad_org_id, documentno: t.documentno,
      dateacct: t.dateacct, datetrx: t.paydate, tendertype: from ? t.from_tendertype : t.to_tendertype, description: t.description, c_bpartner_id: from ? t.to_c_bpartner_id : t.from_c_bpartner_id,
      c_currency_id: cur, payamt: from ? t.from_amt : t.to_amt, overunderamt: 0, c_doctype_id: payDocType(trx, t.ad_client_id, isRcpt), isreceipt: isRcpt ? 'Y' : 'N', c_charge_id: from ? t.from_c_charge_id : t.to_c_charge_id, ad_client_id: t.ad_client_id };
    if (asCur !== cur) {                                                                                                                                       // :257-264 / :287-296 foreign currency
      p.c_conversiontype_id = t.c_conversiontype_id; p.isoverridecurrencyrate = t.isoverridecurrencyrate;
      if (Y(t.isoverridecurrencyrate)) {
        if (from) { p.currencyrate = t.rate; p.convertedamt = t.to_amt; } else { p.currencyrate = N(D(1 / Number(t.rate))); p.convertedamt = t.from_amt; }                // 1 / getRate().doubleValue(), BigDecimal.valueOf(double)
      }
    }
    var r = ML.save(trx, 'c_payment', null, ML.newPO(trx, 'c_payment', p)); if (!r.ok) throw new Error('SaveError c_payment: ' + r.error);
    var id = r.row.c_payment_id;
    var pr = ML.processIt(trx, 'c_payment', id, 'CO');                                                                                                         // paymentBank.processIt(DOCACTION_Complete)
    if (!pr.ok) throw new Error('Payment Process Failed: MPayment[' + id + '-' + t.documentno + ' - ' + (trx._msg == null ? pr.msg : trx._msg));                  // IllegalStateException :269-271 / :298-300
    return id;
  }
  var MBankTransfer = {
    prepareIt: function (trx, t) {   // :203-216
      var m = fire(trx, 'BEFORE_PREPARE', t); if (m) { T.msg(trx, m); return 'IN'; }
      m = fire(trx, 'AFTER_PREPARE', t); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = TBL + ':' + t.c_banktransfer_id;
      return 'IP';
    },
    approveIt: function () { return true; },                                                                                                                   // :218
    rejectIt: function () { return true; },                                                                                                                    // :224
    completeIt: function (trx, t) {   // :230-313
      if (trx._justPrepared !== TBL + ':' + t.c_banktransfer_id) { var st = MBankTransfer.prepareIt(trx, t); if (st !== 'IP') return st; }
      trx._justPrepared = null; t = cur(trx, t.c_banktransfer_id);
      var m = fire(trx, 'BEFORE_COMPLETE', t); if (m) { T.msg(trx, m); return 'IN'; }
      var asCur = acctSchemaCurrency(trx, t);
      mkPayment(trx, t, 'from', asCur); mkPayment(trx, t, 'to', asCur);
      upd(trx, t.c_banktransfer_id, { processed: 'Y', docaction: 'CL' });                                                                                      // setProcessed(true); setDocAction(DOCACTION_Close)
      return 'CO';
    },
    voidIt: function (trx, t) {   // :315-339
      var m = fire(trx, 'BEFORE_VOID', t); if (m) { T.msg(trx, m); return false; }
      var ps = payments(trx, t), pimpl = ML.docActionFor('c_payment');
      ps.forEach(function (p) { if (!pimpl || typeof pimpl.voidIt !== 'function') throw new Error('MPayment.voidIt (MPayment.java:2575-2655) is not ported in the twin c_payment class - named, not faked'); if (!pimpl.voidIt(trx, p)) throw new Error('Void Payment Failed: ' + trx._msg); });
      m = fire(trx, 'AFTER_VOID', cur(trx, t.c_banktransfer_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, t.c_banktransfer_id, { processed: 'Y', docaction: '--', docstatus: 'VO' });                                                                     // setProcessed(true); setDocAction(NONE); DocumentEngine.voidIt sets VO
      return true;
    },
    closeIt: function (trx, t) {   // :341-354
      var m = fire(trx, 'BEFORE_CLOSE', t); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_CLOSE', t); if (m) { T.msg(trx, m); return false; }
      upd(trx, t.c_banktransfer_id, { docstatus: 'CL' });
      return true;
    },
    reverseCorrectIt: function (trx, t) { return reverse(trx, t, 'REVERSECORRECT', 'reverseCorrectIt', 'MPayment.reverseCorrectIt (MPayment.java:2679-2865)'); },     // :356-377
    reverseAccrualIt: function (trx, t) { return reverse(trx, t, 'REVERSEACCRUAL', 'reverseAccrualIt', 'MPayment.reverseAccrualIt (MPayment.java:2865-2900)'); },  // :379-400
    reActivateIt: function (trx, t) {   // :402-414 the validators fire, the answer is false
      var m = fire(trx, 'BEFORE_REACTIVATE', t); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REACTIVATE', t); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    getSummary: function (trx, t) { var o = t.documentno == null ? '' : String(t.documentno); return t.description ? o + ' - ' + t.description : o; }              // :416-424
  };
  function reverse(trx, t, timing, method, what) {
    var m = fire(trx, 'BEFORE_' + timing, t); if (m) { T.msg(trx, m); return false; }
    var pimpl = ML.docActionFor('c_payment');
    payments(trx, t).forEach(function (p) { if (!pimpl || typeof pimpl[method] !== 'function') throw new Error(what + ' is not ported in the twin c_payment class - named, not faked'); if (!pimpl[method](trx, p)) throw new Error('Reverse Payment Failed: ' + trx._msg); });
    m = fire(trx, 'AFTER_' + timing, t); if (m) { T.msg(trx, m); return false; }
    return false;                                                                                                                                              // Java answers false after the payments
  }
  ML.registerDocAction(TBL, MBankTransfer);
  return { MBankTransfer: MBankTransfer };
});
