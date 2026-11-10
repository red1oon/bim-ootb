// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_bankstatement.js: the DocAction class of C_BankStatement (MBankStatement) + the MBankStatement / MBankStatementLine model hooks, ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3D-SPEC Lane BS. Witness: erp/tests/witness_bankstatement.js (W-BANKSTATEMENT, READ THE LOG: §BST lines).
//   Why it exists (MEASURED 2026-11-10): ML.processIt(trx,'c_bankstatement',id,'CO') answered "no DocAction class registered for c_bankstatement" - the twin had the statement line helpers (model_trade.js
//   MBankStatementLine_*), the POSTING (model_post.js Doc_BankStatement) and CopyFromBankStmt, but no Prepare/Complete: a statement could not be Completed, so the "opening bank statement" of the cut-over could not exist.
//   Ported from org.adempiere.base/src/org/compiere/model/MBankStatement.java (beforeSave :257-273, prepareIt :321-364, approveIt :370, completeIt :394-466, setDefiniteDocumentNo :471-499, voidIt :505-600,
//   closeIt :606-622, reverseCorrectIt :628-643, reverseAccrualIt :649-664, reActivateIt :670-723, getSummary :729-742, setProcessed :183-195) and MBankStatementLine.java (beforeSave :166-260, afterSave/afterDelete :
//   262-287 = the ONE port in model_trade.js, reused here, now also fired by the model layer). Posting = DOC.c_bankstatement (Doc_BankStatement) in model_post.js, fired by ML.processIt after a CO as for every other document.
//   NOT PORTED (named): unlockIt :297 / invalidateIt :309 (the twin engine has no UnLock/Invalidate entry), createPDF :231-255 (Java answers null), isComplete/getDoc_User_ID/getApprovalAmt/getC_Currency_ID (no caller in the twin),
//   the deposit-batch branches of completeIt :433-446 / voidIt :575-584 / reActivateIt :698-707 are CODED but UNWITNESSED (the seed has no C_DepositBatch tables), setDefiniteDocumentNo's isPostWithDateFromLine re-check is coded, not witnessed.
//   Twin decisions: dates in messages print as Java Timestamp.toString (yyyy-mm-dd hh:mm:ss.0); Msg.getMsg texts: AD_Message of the seed first, the legacy text (idempiere postgres, client 0) as the fallback when the seed row is absent; the DocAction validators
//   (fireDocValidate) go through ML.fire like model_journal.js; the header's engine-side save (PO.save after processIt) is not run by ML.processIt, so voidIt/reActivateIt set EndingBalance themselves (what beforeSave :271 would).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelBankStatement = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z, N = T.N;
  var TBL = 'c_bankstatement', LTBL = 'c_bankstatementline', CMB = 'CMB';
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  var dayOf = function (v) { return String(v == null ? '' : v).slice(0, 10); };
  var ts = function (v) { return dayOf(v) + ' 00:00:00.0'; };                                                                              // java.sql.Timestamp.toString of a midnight date
  // Msg.getMsg(ctx, key, args): AD_Message text (+ MessageFormat {n}); the legacy text is the fallback when the seed lacks the row (idempiere DB, client 0 messages)
  var LEGACY_MSG = { Voided: '** Voided', PaymentIsAlreadyReconciled: 'Payment is already Reconciled ', NoLines: 'No Document Lines found',
    BankStatementLinePeriodNotSameAsHeader: "The date on line {0} is not in the same period as header's date", ParentCannotChange: '{0} cannot be changed because the parent is processed' };
  function getMsg(trx, key, args) {
    var t = T.msgText(trx, key); if (t === key && LEGACY_MSG[key] != null) t = LEGACY_MSG[key];
    return (args || []).reduce(function (s, a, i) { return s.split('{' + i + '}').join(String(a)); }, t);
  }
  function translate(trx, col) { var r = trx.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [col.toLowerCase()])[0]; return r && r.name != null ? r.name : col; }   // Msg.translate(ctx, "StmtAmt")
  function cmbDocType(trx, client) {                                                                                                         // MDocType.getDocType(DOCBASETYPE_BankStatement)
    var r = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='CMB' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [nz(client) ? client : trx.env.client])[0]; return r ? r.d : 0;
  }
  function docBase(trx, s) { var d = T.dt(trx, s.c_doctype_id); return d && d.docbasetype ? d.docbasetype : CMB; }
  // MPeriod.testPeriodOpen(ctx, dateAcct, C_DocType_ID, AD_Org_ID) MPeriod.java:917-923 THROWS PeriodClosedException (the engine does not catch it: the Trx is rolled back, the document keeps its status)
  function testPeriodOpen(trx, date, dbt, org) {
    if (T.periodOpen(trx, date, dbt, org)) return;
    var ln = trx.q("SELECT name FROM ad_ref_list WHERE ad_reference_id=183 AND value=?", [dbt])[0];
    throw new Error('@PeriodClosed@ @Date@=' + ts(date) + ', @DocBaseType@=' + (ln ? ln.name : dbt));
  }
  function wrap(row) { return { get: function (c) { return row[c.toLowerCase()]; }, set: function (c, v) { row[c.toLowerCase()] = (v != null && typeof v === 'object' && typeof v.add === 'function') ? N(v) : v; return this; } }; }   // PO-like view of a plain row for the shared model_trade ports
  var lines = function (trx, s) { return trx.find(LTBL, { c_bankstatement_id: s.c_bankstatement_id }, ['line', 'c_bankstatementline_id']); };   // getLines ORDER BY Line, C_BankStatementLine_ID :157
  var cur = function (trx, id) { return trx.get(TBL, id); };
  function upd(trx, id, ch) { trx.update(TBL, cur(trx, id), ch); }
  function setProcessed(trx, s, flag) {                                                                                                      // setProcessed :183-195 (+ the lines, raw UPDATE)
    var ch = { processed: flag }; if (flag === 'Y' && !Number(s.processedon) && trx.env.nowMillis != null) ch.processedon = trx.env.nowMillis;
    trx.update(TBL, cur(trx, s.c_bankstatement_id), ch);
    trx.find(LTBL, { c_bankstatement_id: s.c_bankstatement_id }).forEach(function (l) { trx.update(LTBL, l, { processed: flag }); });
  }
  function addDescription(trx, id, text) { var s = cur(trx, id); upd(trx, id, { description: s.description == null ? text : s.description + ' | ' + text }); }   // :167-176
  function payToString(p) { return 'MPayment[' + p.c_payment_id + '-' + p.documentno + ',Receipt=' + (Y(p.isreceipt) ? 'true' : 'false') + ',PayAmt=' + p.payamt + ',Discount=' + (p.discountamt == null ? 0 : p.discountamt) + ',WriteOff=' + (p.writeoffamt == null ? 0 : p.writeoffamt) + ',OverUnder=' + (p.overunderamt == null ? 0 : p.overunderamt); }   // MPayment.toString :2960-2970
  function setReconciled(trx, payId, flag) { var p = trx.get('c_payment', payId), r = ML.save(trx, 'c_payment', p, { isreconciled: flag }); if (!r.ok) throw new Error('SaveError c_payment: ' + r.error); }   // payment.setIsReconciled + saveEx
  function depositPayments(trx, db) { return trx.find('c_depositbatchline', { c_depositbatch_id: db }, ['c_depositbatchline_id']); }          // MDepositBatch.getLines (coded, unwitnessed: no table in the seed)
  function bumpBalance(trx, baId, delta) {                                                                                                   // ba.load; ba.setCurrentBalance(ba.getCurrentBalance() +/- diff); ba.saveEx
    var ba = trx.get('c_bankaccount', baId), r = ML.save(trx, 'c_bankaccount', ba, { currentbalance: N(D(ba.currentbalance == null ? 0 : ba.currentbalance).add(delta)) });
    if (!r.ok) throw new Error('SaveError c_bankaccount: ' + r.error);
  }
  function dateConsistent(trx, line, stmt) { return T._bslDateConsistent(trx, T._loginCtx(trx) || {}, wrap(line), stmt); }               // isDateConsistentIfUsedForPosting(headerDateAcct)

  // ══ model hooks ═══════════════════════════════════════════════════════════════════════════════════════════
  ML.registerModel(TBL, {
    beforeSave: function (trx, s) {   // MBankStatement.beforeSave :257-273
      if (!nz(s.c_doctype_id)) s.c_doctype_id = cmbDocType(trx, s.ad_client_id);                                                           // :260-262
      if (!Y(s.processed) && D(s.beginningbalance == null ? 0 : s.beginningbalance).signum() === 0) {                                      // :264-269 set beginning balance
        var ba = nz(s.c_bankaccount_id) ? trx.get('c_bankaccount', s.c_bankaccount_id) : null; if (ba) s.beginningbalance = ba.currentbalance == null ? 0 : ba.currentbalance;
      }
      s.endingbalance = N(D(s.beginningbalance == null ? 0 : s.beginningbalance).add(D(s.statementdifference == null ? 0 : s.statementdifference)));   // :271
      return null;
    }
  });
  T._bslHooks = true;
  ML.registerModel(LTBL, {
    beforeSave: function (trx, l, isNew, old) {   // MBankStatementLine.beforeSave :166-260 (the ONE port, model_trade.js bslBeforeSave)
      var dateChanged = !isNew && old && String(old.dateacct) !== String(l.dateacct);
      return T._bslBeforeSave(trx, T._loginCtx(trx) || {}, wrap(l), isNew, dateChanged);
    },
    afterSave: function (trx, l) { T._bslUpdateHeader(trx, l.c_bankstatement_id); return null; },       // :248-256 afterSave -> updateHeader :262-287
    afterDelete: function (trx, l) { T._bslUpdateHeader(trx, l.c_bankstatement_id); return null; }      // :258-266 afterDelete -> updateHeader
  });

  // ══ DocAction ═════════════════════════════════════════════════════════════════════════════════════════
  var MBankStatement = {
    prepareIt: function (trx, s) {   // :321-364
      var m = fire(trx, 'BEFORE_PREPARE', TBL, s); if (m) { T.msg(trx, m); return 'IN'; }
      testPeriodOpen(trx, s.dateacct, docBase(trx, s), s.ad_org_id);                                                                      // :330 Std Period open?
      var ls = lines(trx, s); if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }                                                    // :331-336
      var total = Z;
      for (var i = 0; i < ls.length; i++) {
        var line = ls[i]; if (line.isactive === 'N') continue;                                                                            // :342-343
        if (!dateConsistent(trx, line, s)) { T.msg(trx, getMsg(trx, 'BankStatementLinePeriodNotSameAsHeader', [line.line])); return 'IN'; }   // :345-349
        total = total.add(D(line.stmtamt == null ? 0 : line.stmtamt));                                                                    // :350
      }
      upd(trx, s.c_bankstatement_id, { statementdifference: N(total), endingbalance: N(D(s.beginningbalance == null ? 0 : s.beginningbalance).add(total)) });   // :352-353
      m = fire(trx, 'AFTER_PREPARE', TBL, cur(trx, s.c_bankstatement_id)); if (m) { T.msg(trx, m); return 'IN'; }                          // :355-357
      trx._justPrepared = TBL + ':' + s.c_bankstatement_id;                                                                               // m_justPrepared
      if (cur(trx, s.c_bankstatement_id).docaction !== 'CO') upd(trx, s.c_bankstatement_id, { docaction: 'CO' });                         // :361-362
      return 'IP';
    },
    completeIt: function (trx, s) {   // :394-466
      if (trx._justPrepared !== TBL + ':' + s.c_bankstatement_id) { var st = MBankStatement.prepareIt(trx, s); trx._justPrepared = null; if (st !== 'IP') return st; }   // :398-404 re-check
      trx._justPrepared = null; s = cur(trx, s.c_bankstatement_id);
      s = setDefiniteDocumentNo(trx, s);                                                                                                  // :407
      var m = fire(trx, 'BEFORE_COMPLETE', TBL, s); if (m) { T.msg(trx, m); return 'IN'; }                                                 // :409-411
      if (!Y(s.isapproved)) MBankStatement.approveIt(trx, s);                                                                             // :414-415 implicit approval
      var ls = lines(trx, s), i, j;                                                                                                       // :419 set payments reconciled
      for (i = 0; i < ls.length; i++) {
        var line = ls[i];
        if (nz(line.c_payment_id)) {                                                                                                      // :423-432
          var pay = trx.get('c_payment', line.c_payment_id);
          if (Y(pay.isreconciled)) { T.msg(trx, getMsg(trx, 'PaymentIsAlreadyReconciled') + payToString(pay)); return 'IN'; }              // :426-429
          setReconciled(trx, line.c_payment_id, 'Y');
        } else if (nz(line.c_depositbatch_id)) {                                                                                          // :433-446
          var dbl = depositPayments(trx, line.c_depositbatch_id);
          for (j = 0; j < dbl.length; j++) {
            var p2 = trx.get('c_payment', dbl[j].c_payment_id);
            if (Y(p2.isreconciled)) { T.msg(trx, getMsg(trx, 'PaymentIsAlreadyReconciled') + payToString(p2)); return 'IN'; }
            setReconciled(trx, dbl[j].c_payment_id, 'Y');
          }
        }
      }
      bumpBalance(trx, s.c_bankaccount_id, D(s.statementdifference == null ? 0 : s.statementdifference));                                // :449-453 Update Bank Account (BF 1933645)
      m = fire(trx, 'AFTER_COMPLETE', TBL, cur(trx, s.c_bankstatement_id)); if (m) { T.msg(trx, m); return 'IN'; }                         // :456-461
      setProcessed(trx, cur(trx, s.c_bankstatement_id), 'Y'); upd(trx, s.c_bankstatement_id, { docaction: 'CL' });                         // :463-464 setProcessed(true); setDocAction(Close)
      return 'CO';                                                                                                                         // :465
    },
    approveIt: function (trx, s) { trx.update(TBL, s, { isapproved: 'Y' }); return true; },                                                // :370-376
    rejectIt: function (trx, s) { trx.update(TBL, s, { isapproved: 'N' }); return true; },                                                 // :382-388
    voidIt: function (trx, s) {   // :505-600
      var m = fire(trx, 'BEFORE_VOID', TBL, s); if (m) { T.msg(trx, m); return false; }                                                    // :510-512
      if (/^(CL|RE|VO)$/.test(s.docstatus || '')) { T.msg(trx, 'Document Closed: ' + s.docstatus); upd(trx, s.c_bankstatement_id, { docaction: '--' }); return false; }   // :514-521
      if (!/^(DR|IN|IP|AP|NA)$/.test(s.docstatus || '')) {                                                                                 // :524-535 processed: period open + delete the facts
        testPeriodOpen(trx, s.dateacct, docBase(trx, s), s.ad_org_id);
        require_match().factDeleteEx(trx, ML.tableIdOf(trx, TBL), s.c_bankstatement_id);                                                  // MFactAcct.deleteEx
      }
      if (Y(s.processed)) bumpBalance(trx, s.c_bankaccount_id, D(s.statementdifference == null ? 0 : s.statementdifference).negate());     // :537-545 Restore Bank Account Balance (AZ Goodwill)
      var ls = lines(trx, s);                                                                                                              // :548 set lines to 0
      for (var i = 0; i < ls.length; i++) {
        var line = ls[i];
        if (D(line.stmtamt == null ? 0 : line.stmtamt).signum() !== 0) {
          var d = getMsg(trx, 'Voided') + ' (' + translate(trx, 'StmtAmt') + '=' + line.stmtamt;                                          // :554-555
          if (D(line.trxamt == null ? 0 : line.trxamt).signum() !== 0) d += ', ' + translate(trx, 'TrxAmt') + '=' + line.trxamt;            // :556-557
          if (D(line.chargeamt == null ? 0 : line.chargeamt).signum() !== 0) d += ', ' + translate(trx, 'ChargeAmt') + '=' + line.chargeamt;   // :558-559
          if (D(line.interestamt == null ? 0 : line.interestamt).signum() !== 0) d += ', ' + translate(trx, 'InterestAmt') + '=' + line.interestamt;   // :560-561
          d += ')';                                                                                                                        // :562
          var ch = { description: line.description == null ? d : line.description + ' | ' + d, stmtamt: 0, trxamt: 0, chargeamt: 0, interestamt: 0, c_payment_id: 0 };   // :563-568, :585 (line.addDescription :99-108)
          if (nz(line.c_payment_id)) setReconciled(trx, line.c_payment_id, 'N');                                                          // :569-574
          else if (nz(line.c_depositbatch_id)) depositPayments(trx, line.c_depositbatch_id).forEach(function (x) { setReconciled(trx, x.c_payment_id, 'N'); });   // :575-584
          var r = ML.save(trx, LTBL, line, ch); if (!r.ok) throw new Error('SaveError ' + LTBL + ': ' + r.error);                         // :586 line.saveEx -> beforeSave + afterSave(updateHeader)
        }
      }
      addDescription(trx, s.c_bankstatement_id, getMsg(trx, 'Voided'));                                                                   // :589
      upd(trx, s.c_bankstatement_id, { statementdifference: 0, endingbalance: N(D(cur(trx, s.c_bankstatement_id).beginningbalance == null ? 0 : cur(trx, s.c_bankstatement_id).beginningbalance)) });   // :590 (+ beforeSave :271 on the engine-side save)
      m = fire(trx, 'AFTER_VOID', TBL, cur(trx, s.c_bankstatement_id)); if (m) { T.msg(trx, m); return false; }                           // :593-595
      setProcessed(trx, cur(trx, s.c_bankstatement_id), 'Y'); upd(trx, s.c_bankstatement_id, { docaction: '--' });                       // :597-598
      upd(trx, s.c_bankstatement_id, { docstatus: 'VO' });                                                                                // DocumentEngine.voidIt
      return true;
    },
    closeIt: function (trx, s) {   // :606-622
      var m = fire(trx, 'BEFORE_CLOSE', TBL, s); if (m) { T.msg(trx, m); return false; }
      upd(trx, s.c_bankstatement_id, { docaction: '--' });                                                                                // :615
      m = fire(trx, 'AFTER_CLOSE', TBL, cur(trx, s.c_bankstatement_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, s.c_bankstatement_id, { docstatus: 'CL' });                                                                                // DocumentEngine.closeIt
      return true;
    },
    reverseCorrectIt: function (trx, s) {   // :628-643 - fires the validators and ANSWERS FALSE (legacy cannot reverse a bank statement)
      var m = fire(trx, 'BEFORE_REVERSECORRECT', TBL, s); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSECORRECT', TBL, s); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reverseAccrualIt: function (trx, s) {   // :649-664 - same
      var m = fire(trx, 'BEFORE_REVERSEACCRUAL', TBL, s); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSEACCRUAL', TBL, s); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reActivateIt: function (trx, s) {   // :670-723
      var m = fire(trx, 'BEFORE_REACTIVATE', TBL, s); if (m) { T.msg(trx, m); return false; }
      testPeriodOpen(trx, s.dateacct, CMB, s.ad_org_id);                                                                                  // :678 (DOCBASETYPE_BankStatement)
      var d = nz(s.c_doctype_id) ? T.dt(trx, s.c_doctype_id) : null;                                                                      // :680 DocumentEngine.canReactivateThisDocType :1523
      if (!(nz(s.c_doctype_id) && d && Y(d.iscanbereactivated))) { T.msg(trx, getMsg(trx, 'DocTypeCannotBeReactivated', [d ? d.name : ''])); return false; }   // :681-682 (MDocType.getNameTrl)
      require_match().factDeleteEx(trx, ML.tableIdOf(trx, TBL), s.c_bankstatement_id); upd(trx, s.c_bankstatement_id, { posted: 'N' });  // :685-686
      lines(trx, s).forEach(function (line) {                                                                                             // :688-708
        trx.update(LTBL, line, { processed: 'N' });                                                                                       // :691
        if (nz(line.c_payment_id)) setReconciled(trx, line.c_payment_id, 'N');
        else if (nz(line.c_depositbatch_id)) depositPayments(trx, line.c_depositbatch_id).forEach(function (x) { setReconciled(trx, x.c_payment_id, 'N'); });
      });
      bumpBalance(trx, s.c_bankaccount_id, D(s.statementdifference == null ? 0 : s.statementdifference).negate());                        // :710-713
      upd(trx, s.c_bankstatement_id, { docaction: 'CO' }); setProcessed(trx, cur(trx, s.c_bankstatement_id), 'N');                         // :715-716
      m = fire(trx, 'AFTER_REACTIVATE', TBL, cur(trx, s.c_bankstatement_id)); if (m) { T.msg(trx, m); return false; }                      // :719-721
      upd(trx, s.c_bankstatement_id, { docstatus: 'IP' });                                                                                // DocumentEngine.reActivateIt :706
      return true;
    },
    getSummary: function (trx, s) {   // :729-742
      var o = s.name + ': ' + translate(trx, 'StatementDifference') + '=' + (s.statementdifference == null ? 0 : s.statementdifference) + ' (#' + lines(trx, s).length + ')';
      return s.description ? o + ' - ' + s.description : o;
    }
  };
  // setDefiniteDocumentNo :471-499
  function setDefiniteDocumentNo(trx, s) {
    var d = T.dt(trx, s.c_doctype_id); if (!d) return s;
    if (Y(d.isoverwritedateoncomplete) && !Number(s.processedon)) {                                                                        // :473-491
      var today = String(trx.env.date).slice(0, 10) + ' 00:00:00', ch = { statementdate: today };                                         // TimeUtil.getDay(0)
      if (dayOf(s.dateacct) < dayOf(today)) {
        ch.dateacct = today; testPeriodOpen(trx, today, d.docbasetype, s.ad_org_id);
        if (T.sysConfigBool('BANK_STATEMENT_POST_WITH_DATE_FROM_LINE', false, s.ad_client_id, 0)) {                                       // :479-489 isPostWithDateFromLine
          var hdr = Object.assign({}, s, { dateacct: today });
          lines(trx, s).forEach(function (bl) { if (!dateConsistent(trx, bl, hdr)) throw new Error(getMsg(trx, 'ParentCannotChange', [translate(trx, 'DateAcct')]) + ' - ' + getMsg(trx, 'BankStatementLinePeriodNotSameAsHeader', [bl.line])); });
        }
      }
      trx.update(TBL, s, ch); s = cur(trx, s.c_bankstatement_id);
    }
    if (Y(d.isoverwriteseqoncomplete) && !Number(s.processedon)) {                                                                        // :492-497
      var dn = T.getDocumentNoByDocType(trx, s.c_doctype_id, true, s); if (dn != null) { trx.update(TBL, s, { documentno: dn }); s = cur(trx, s.c_bankstatement_id); }
    }
    return s;
  }
  function require_match() { return (typeof module !== 'undefined' && module.exports) ? require('./model_match') : (typeof window !== 'undefined' ? window : globalThis).ModelMatch; }   // MFactAcct.deleteEx lives in model_match.js (one copy)

  ML.registerDocAction(TBL, MBankStatement);
  return { MBankStatement: MBankStatement };
});
