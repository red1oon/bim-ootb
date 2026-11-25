// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_requisition.js: the DocAction class of M_Requisition (MRequisition), ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21 PORT SPEC (Requisition claims R1-R9). Witness: erp/tests/witness_docaction_four.js (W-DOCACTION-4, READ THE LOG: §DA4 lines) and, against REAL iDempiere on the
//   pilot, scripts/bridge/witness_docaction_four_legacy.js (§DA4L lines).
//   Why it exists (MEASURED 2026-11-25 by the help peek sweep, W-HELP-PEEK): ML.processIt(trx,'m_requisition',id,'CO') answered "no DocAction class registered for m_requisition". The twin had the create side only
//   (model_order.js: MRequisition.beforeSave :198-204, MRequisitionLine.beforeSave/afterSave/afterDelete :279-336), so a Purchase Requisition could not be Completed, Closed or Voided.
//   Ported from org.adempiere.base/src/org/compiere/model/MRequisition.java: prepareIt :260-306, approveIt :318, rejectIt :330, completeIt :342-378, setDefiniteDocumentNo :380-395, voidIt :401-424, closeIt :426-470,
//   reverseCorrectIt :480-496, reverseAccrualIt :501-517, reActivateIt :522-542, getSummary :544-562.
//   NOT PORTED (named): unlockIt :237 / invalidateIt :249 (the twin engine has no UnLock/Invalidate entry), createPDF :190-208 (Java answers null), getDoc_User_ID / getApprovalAmt / getC_Currency_ID / isComplete (no caller in the twin).
//   Twin decisions: the DocAction validators (fireDocValidate) go through ML.fire like model_bankstatement.js; the period message comes from T.testPeriodOpen (the ONE copy, model_trade.js); a thrown AdempiereException
//   (@NoLines@) / PeriodClosedException is an Error the engine does not catch (the Trx is rolled back, the document keeps its status), as in legacy where the WebService / window answers the exception text.
//   Closing an unordered line: Java prints the old Qty with BigDecimal.toString into the description (" [3]"); the twin prints the number as stored.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelRequisition = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z, N = T.N;
  var TBL = 'm_requisition', LTBL = 'm_requisitionline', POR = 'POR';
  var fire = function (trx, timing, row) { return ML.fire(trx, timing, TBL, row); };
  var cur = function (trx, id) { return trx.get(TBL, id); };
  var lines = function (trx, r) { return trx.find(LTBL, { m_requisition_id: r.m_requisition_id }, ['line', 'm_requisitionline_id']); };      // getLines ORDER BY Line, M_RequisitionLine_ID :112-118
  function upd(trx, id, ch) { trx.update(TBL, cur(trx, id), ch); }
  function saveEx(trx, table, row, ch) { var r = ML.save(trx, table, row, ch); if (!r.ok) throw new Error('SaveError ' + table + ': ' + r.error); }   // PO.saveEx
  function dayOf(v) { return String(v == null ? '' : v).slice(0, 10); }
  // MPriceList.getStandardPrecision(ctx, M_PriceList_ID) MPriceList.java:356-364 = the price list's currency StdPrecision
  function precisionOf(trx, plId) { var pl = trx.get('m_pricelist', plId), c = pl ? trx.get('c_currency', pl.c_currency_id) : null; return c ? Number(c.stdprecision) : 2; }
  function setDefiniteDocumentNo(trx, r) {   // :380-395
    var d = T.dt(trx, r.c_doctype_id); if (!d) return r;
    if (Y(d.isoverwritedateoncomplete)) {                                                                                                 // :382-385
      var today = String(trx.env.date).slice(0, 10) + ' 00:00:00';
      trx.update(TBL, r, { datedoc: today }); T.testPeriodOpen(trx, today, POR, r.ad_org_id); r = cur(trx, r.m_requisition_id);
    }
    if (Y(d.isoverwriteseqoncomplete)) {                                                                                                  // :386-391
      var dn = T.getDocumentNoByDocType(trx, r.c_doctype_id, true, r); if (dn != null) { trx.update(TBL, r, { documentno: dn }); r = cur(trx, r.m_requisition_id); }
    }
    return r;
  }
  // closeIt :426-470 without the engine's status (voidIt calls this very body, as Java's voidIt calls closeIt())
  function closeBody(trx, r) {
    var m = fire(trx, 'BEFORE_CLOSE', r); if (m) { T.msg(trx, m); return false; }
    var total = Z;
    lines(trx, r).forEach(function (line) {                                                                                               // close the not delivered Qty
      var finalQty = Z;
      if (nz(line.c_orderline_id)) { var ol = trx.get('c_orderline', line.c_orderline_id); finalQty = D(ol ? ol.qtyordered : 0); }         // :438-445 an ordered line keeps the order line's QtyOrdered
      if (finalQty.compareTo(D(line.qty)) !== 0) {                                                                                         // :448-459
        var desc = (line.description == null ? '' : line.description) + ' [' + line.qty + ']';
        saveEx(trx, LTBL, line, { description: desc, qty: N(finalQty) });                                                                   // setQty + setLineNetAmt + saveEx (the line's beforeSave recomputes LineNetAmt)
        line = trx.get(LTBL, line.m_requisitionline_id);
      }
      total = total.add(D(line.linenetamt));
    });
    if (total.compareTo(D(r.totallines == null ? 0 : r.totallines)) !== 0) { saveEx(trx, TBL, cur(trx, r.m_requisition_id), { totallines: N(total) }); }   // :463-467
    m = fire(trx, 'AFTER_CLOSE', cur(trx, r.m_requisition_id)); if (m) { T.msg(trx, m); return false; }
    return true;
  }
  var MRequisition = {
    prepareIt: function (trx, r) {   // :260-306
      var m = fire(trx, 'BEFORE_PREPARE', r); if (m) { T.msg(trx, m); return 'IN'; }
      var ls = lines(trx, r);
      if (!nz(r.ad_user_id) || !nz(r.m_pricelist_id) || !nz(r.m_warehouse_id)) return 'IN';                                                // :269-273 Invalid (no message)
      if (!ls.length) throw new Error('@NoLines@');                                                                                         // :274-277 AdempiereException
      T.testPeriodOpen(trx, r.datedoc, POR, r.ad_org_id);                                                                                   // :279 Std Period open?
      var prec = precisionOf(trx, r.m_pricelist_id), total = Z;
      ls.forEach(function (line) {                                                                                                          // :282-296 add up amounts
        var net = D(line.qty).multiply(D(line.priceactual)).setScale(prec, 'HALF_UP');
        if (net.compareTo(D(line.linenetamt)) !== 0) { saveEx(trx, LTBL, line, { linenetamt: N(net) }); line = trx.get(LTBL, line.m_requisitionline_id); }   // the saved line goes through its beforeSave (LineNetAmt = Qty x PriceActual) as in Java
        total = total.add(D(line.linenetamt));
      });
      if (total.compareTo(D(r.totallines == null ? 0 : r.totallines)) !== 0) saveEx(trx, TBL, cur(trx, r.m_requisition_id), { totallines: N(total) });   // :297-301 against the in-memory header, as Java
      m = fire(trx, 'AFTER_PREPARE', cur(trx, r.m_requisition_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = TBL + ':' + r.m_requisition_id;                                                                                   // m_justPrepared
      return 'IP';
    },
    approveIt: function (trx, r) { trx.update(TBL, cur(trx, r.m_requisition_id), { isapproved: 'Y' }); return true; },                      // :318
    rejectIt: function (trx, r) { trx.update(TBL, cur(trx, r.m_requisition_id), { isapproved: 'N' }); return true; },                       // :330
    completeIt: function (trx, r) {   // :342-378
      if (trx._justPrepared !== TBL + ':' + r.m_requisition_id) { var st = MRequisition.prepareIt(trx, r); if (st !== 'IP') return st; }      // re-check
      trx._justPrepared = null; r = setDefiniteDocumentNo(trx, cur(trx, r.m_requisition_id));
      var m = fire(trx, 'BEFORE_COMPLETE', r); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(r.isapproved)) MRequisition.approveIt(trx, r);                                                                                 // implicit approval
      m = fire(trx, 'AFTER_COMPLETE', cur(trx, r.m_requisition_id)); if (m) { T.msg(trx, m); return 'IN'; }
      upd(trx, r.m_requisition_id, { processed: 'Y', docaction: 'CL' });                                                                    // setProcessed(true); setDocAction(ACTION_Close)
      return 'CO';
    },
    voidIt: function (trx, r) {   // :401-424
      var m = fire(trx, 'BEFORE_VOID', r); if (m) { T.msg(trx, m); return false; }
      if (!closeBody(trx, r)) return false;
      m = fire(trx, 'AFTER_VOID', cur(trx, r.m_requisition_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, r.m_requisition_id, { docstatus: 'VO' });                                                                                    // DocumentEngine.voidIt :594-617
      return true;
    },
    closeIt: function (trx, r) {   // :426-470
      if (!closeBody(trx, r)) return false;
      upd(trx, r.m_requisition_id, { docstatus: 'CL' });                                                                                    // DocumentEngine.closeIt :620-640
      return true;
    },
    reverseCorrectIt: function (trx, r) {   // :480-496 the validators fire, the answer is false
      var m = fire(trx, 'BEFORE_REVERSECORRECT', r); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSECORRECT', r); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reverseAccrualIt: function (trx, r) {   // :501-517
      var m = fire(trx, 'BEFORE_REVERSEACCRUAL', r); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSEACCRUAL', r); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reActivateIt: function (trx, r) {   // :522-542 reverseCorrectIt() answers false, so reactivation always does
      var m = fire(trx, 'BEFORE_REACTIVATE', r); if (m) { T.msg(trx, m); return false; }
      if (!MRequisition.reverseCorrectIt(trx, r)) return false;
      m = fire(trx, 'AFTER_REACTIVATE', r); if (m) { T.msg(trx, m); return false; }
      return true;
    },
    getSummary: function (trx, r) {   // :544-562
      var u = nz(r.ad_user_id) ? trx.get('ad_user', r.ad_user_id) : null;
      var o = (r.documentno == null ? '' : r.documentno) + ' - ' + (u ? u.name : '') + ': ' + T.msgText(trx, 'TotalLines') + '=' + (r.totallines == null ? 0 : r.totallines) + ' (#' + lines(trx, r).length + ')';
      return r.description ? o + ' - ' + r.description : o;
    }
  };
  ML.registerDocAction(TBL, MRequisition);
  return { MRequisition: MRequisition };
});
