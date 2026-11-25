// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_inoutconfirm.js: the DocAction class of M_InOutConfirm (MInOutConfirm, window 330 'Ship/Receipt Confirm') + the hooks of M_InOutLineConfirm (MInOutLineConfirm), ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21 PORT SPEC (Confirm claims C1-C8). Witness: erp/tests/witness_docaction_four.js (W-DOCACTION-4, §DA4 lines; parity with the pilot with DA4_LEGACY=1).
//   Why it exists (MEASURED 2026-11-25 by the help peek sweep, W-HELP-PEEK): ML.processIt(trx,'m_inoutconfirm',id,'CO') answered "no DocAction class registered". The twin could CREATE a confirmation
//   (MInOutConfirm.create :64-93, model_order.js / processes/InOutCreateConfirm.js) but a confirmation could not be Completed, Closed or Voided.
//   Ported from org.adempiere.base/src/org/compiere/model/MInOutConfirm.java: setIsApproved :226-236, prepareIt :256-297, approveIt :305, rejectIt :313, completeIt :329-444, voidIt :637-690, closeIt :692-705,
//   reverseCorrectIt :707-720, reverseAccrualIt :722-735, reActivateIt :737-748, getSummary :775-790 and MInOutLineConfirm.java: processLine :124-166, isFullyConfirmed :172-176, beforeSave :189-205.
//   NOT PORTED (named, not faked; each refuses with that fact, an Error: the engine rolls the Trx back, nothing is half done): splitInOut :446-560 (the document type splits on a difference: IsSplitWhenDifference), createDifferenceDoc :562-635
//   (a vendor credit memo for a returned difference: !isSOTrx and a Ref_InOut; an Inventory document for a scrapped quantity), MInOutLineConfirm.beforeDelete (refuses every delete: the model layer has no beforeDelete refusal slot for it).
//   Twin decisions: setIsApproved writes "<user>: Approved - <timestamp>" into the description as Java does, the timestamp is the Trx clock; the process messages come from AD_Message with the legacy text as the fallback.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelInOutConfirm = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z, N = T.N;
  var TBL = 'm_inoutconfirm', LTBL = 'm_inoutlineconfirm';
  var fire = function (trx, timing, row) { return ML.fire(trx, timing, TBL, row); };
  var cur = function (trx, id) { return trx.get(TBL, id); };
  function upd(trx, id, ch) { trx.update(TBL, cur(trx, id), ch); }
  var lines = function (trx, c) { return trx.find(LTBL, { m_inoutconfirm_id: c.m_inoutconfirm_id }, ['m_inoutlineconfirm_id']); };
  function elementName(trx, col) { var r = trx.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [col.toLowerCase()])[0]; return r && r.name != null ? r.name : col; }   // Msg.translate(ctx, key)
  function timestampStr(trx) { return String(trx.env.now != null ? trx.env.now : trx.env.date); }   // new Timestamp(System.currentTimeMillis()): the session clock the edge installed (W-CORE-PURE: a core file asks the edge, never Date.now itself)
  function addDescription(trx, id, text) { var c = cur(trx, id); upd(trx, id, { description: c.description == null ? text : c.description + ' | ' + text }); }   // MInOutConfirm.addDescription
  function fully(l) { return D(l.targetqty == null ? 0 : l.targetqty).compareTo(D(l.confirmedqty == null ? 0 : l.confirmedqty)) === 0; }   // isFullyConfirmed :172-176

  ML.registerModel(LTBL, {
    beforeSave: function (trx, l, isNew) {   // :189-205
      var parent = cur(trx, l.m_inoutconfirm_id);
      if (isNew && parent && Y(parent.processed)) return 'ParentComplete';
      l.differenceqty = N(D(l.targetqty == null ? 0 : l.targetqty).subtract(D(l.confirmedqty == null ? 0 : l.confirmedqty)).subtract(D(l.scrappedqty == null ? 0 : l.scrappedqty)));
      return null;
    }
  });
  function approve(trx, c, flag) {   // setIsApproved :226-236
    if (flag && !Y(c.isapproved)) {
      var u = trx.get('ad_user', trx.env.user);
      addDescription(trx, c.m_inoutconfirm_id, (u ? u.name : '') + ': ' + elementName(trx, 'IsApproved') + ' - ' + timestampStr(trx));
    }
    upd(trx, c.m_inoutconfirm_id, { isapproved: flag ? 'Y' : 'N' });
  }
  function processLine(trx, cl, isSOTrx, type) {   // MInOutLineConfirm.processLine :124-166: the shipment line takes the confirmed quantities
    var line = trx.get('m_inoutline', cl.m_inoutline_id), ch = null, conf = D(cl.confirmedqty == null ? 0 : cl.confirmedqty), scr = D(cl.scrappedqty == null ? 0 : cl.scrappedqty), tgt = D(cl.targetqty == null ? 0 : cl.targetqty);
    if (type === 'XC' || type === 'VC') ch = { confirmedqty: N(conf) };                                                                                      // CustomerConfirmation / VendorConfirmation
    else if (type === 'DC') ch = {};                                                                                                                          // DropShipConfirm
    else if (type === 'PC') ch = { targetqty: N(tgt), movementqty: N(conf), pickedqty: N(conf), scrappedqty: N(scr) };                                        // PickQAConfirm
    else if (type === 'SC') ch = { targetqty: N(tgt), movementqty: N(isSOTrx ? conf : conf.add(scr)), scrappedqty: N(scr) };                                  // ShipReceiptConfirm: in a PO the vendor's scrap stays on the line
    if (!line || ch == null) return { ok: true };
    return ML.save(trx, 'm_inoutline', line, ch);
  }
  var MInOutConfirm = {
    prepareIt: function (trx, c) {   // :256-297
      var m = fire(trx, 'BEFORE_PREPARE', c); if (m) { T.msg(trx, m); return 'IN'; }
      var ls = lines(trx, c);
      if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      var diff = ls.some(function (l) { return !fully(l); });
      upd(trx, c.m_inoutconfirm_id, { isindispute: diff ? 'Y' : 'N' });
      m = fire(trx, 'AFTER_PREPARE', cur(trx, c.m_inoutconfirm_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = TBL + ':' + c.m_inoutconfirm_id;
      if (cur(trx, c.m_inoutconfirm_id).docaction !== 'CO') upd(trx, c.m_inoutconfirm_id, { docaction: 'CO' });
      return 'IP';
    },
    approveIt: function (trx, c) { approve(trx, cur(trx, c.m_inoutconfirm_id), true); return true; },                                                          // :305
    rejectIt: function (trx, c) { approve(trx, cur(trx, c.m_inoutconfirm_id), false); return true; },                                                          // :313
    completeIt: function (trx, c) {   // :329-444
      if (trx._justPrepared !== TBL + ':' + c.m_inoutconfirm_id) { var st = MInOutConfirm.prepareIt(trx, c); if (st !== 'IP') return st; }
      trx._justPrepared = null; c = cur(trx, c.m_inoutconfirm_id);
      var m = fire(trx, 'BEFORE_COMPLETE', c); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(c.isapproved)) MInOutConfirm.approveIt(trx, c);
      c = cur(trx, c.m_inoutconfirm_id);
      var io = trx.get('m_inout', c.m_inout_id), dt = io && nz(io.c_doctype_id) ? trx.get('c_doctype', io.c_doctype_id) : null, isSO = io && Y(io.issotrx);
      if (Y(c.isindispute) && dt && Y(dt.issplitwhendifference)) {                                                                                            // :349-362
        if (!nz(dt.c_doctypedifference_id)) { T.msg(trx, 'No Split Document Type defined for: ' + dt.name); return 'IN'; }
        throw new Error('MInOutConfirm.splitInOut (MInOutConfirm.java:446-560) is not ported in the twin - named, not faked');
      }
      var ls = lines(trx, c);
      for (var i = 0; i < ls.length; i++) {                                                                                                                    // :364-399
        var cl = ls[i], r = processLine(trx, cl, isSO, c.confirmtype);
        if (!r.ok) { T.msg(trx, 'ShipLine not saved - ' + cl.m_inoutlineconfirm_id); return 'IN'; }                                                              // :367-371
        cl = trx.get(LTBL, cl.m_inoutlineconfirm_id);
        if (fully(cl)) trx.update(LTBL, cl, { processed: 'Y' });
        else {
          var needsDoc = (D(cl.differenceqty == null ? 0 : cl.differenceqty).signum() !== 0 && !isSO && nz(io.ref_inout_id)) || D(cl.scrappedqty == null ? 0 : cl.scrappedqty).signum() !== 0;
          if (needsDoc) throw new Error('MInOutConfirm.createDifferenceDoc (MInOutConfirm.java:562-635: a vendor credit memo for a returned difference, an Inventory document for a scrapped quantity) is not ported in the twin - named, not faked');
          trx.update(LTBL, cl, { processed: 'Y' });                                                                                                          // createDifferenceDoc made nothing: the line is saved Processed
        }
      }
      m = fire(trx, 'AFTER_COMPLETE', cur(trx, c.m_inoutconfirm_id)); if (m) { T.msg(trx, m); return 'IN'; }
      upd(trx, c.m_inoutconfirm_id, { processed: 'Y', docaction: 'CL' });
      return 'CO';
    },
    voidIt: function (trx, c) {   // :637-690
      var m = fire(trx, 'BEFORE_VOID', c); if (m) { T.msg(trx, m); return false; }
      if (c.docstatus === 'CL' || c.docstatus === 'RE' || c.docstatus === 'VO') { T.msg(trx, 'Document Closed: ' + c.docstatus); return false; }
      var st = c.docstatus;
      if (st === 'DR' || st === 'IN' || st === 'IP' || st === 'AP' || st === 'NA') {
        var io = trx.get('m_inout', c.m_inout_id);
        if (!io || (io.docstatus !== 'VO' && io.docstatus !== 'RE')) throw new Error('@M_InOut_ID@ @DocStatus@<>VO');                                                // AdempiereException
        lines(trx, c).forEach(function (l) { ML.save(trx, LTBL, l, { targetqty: 0, confirmedqty: 0, scrappedqty: 0, differenceqty: 0, processed: 'Y' }); });
        upd(trx, c.m_inoutconfirm_id, { iscancelled: 'Y' });
      } else return MInOutConfirm.reverseCorrectIt(trx, c);
      m = fire(trx, 'AFTER_VOID', cur(trx, c.m_inoutconfirm_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, c.m_inoutconfirm_id, { processed: 'Y', docaction: '--', docstatus: 'VO' });
      return true;
    },
    closeIt: function (trx, c) {   // :692-705
      var m = fire(trx, 'BEFORE_CLOSE', c); if (m) { T.msg(trx, m); return false; }
      upd(trx, c.m_inoutconfirm_id, { docaction: '--' });
      m = fire(trx, 'AFTER_CLOSE', cur(trx, c.m_inoutconfirm_id)); if (m) { T.msg(trx, m); return false; }
      upd(trx, c.m_inoutconfirm_id, { docstatus: 'CL' });
      return true;
    },
    reverseCorrectIt: function (trx, c) {   // :707-720 the validators fire, the answer is false
      var m = fire(trx, 'BEFORE_REVERSECORRECT', c); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSECORRECT', c); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reverseAccrualIt: function (trx, c) {   // :722-735
      var m = fire(trx, 'BEFORE_REVERSEACCRUAL', c); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REVERSEACCRUAL', c); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    reActivateIt: function (trx, c) {   // :737-748
      var m = fire(trx, 'BEFORE_REACTIVATE', c); if (m) { T.msg(trx, m); return false; }
      m = fire(trx, 'AFTER_REACTIVATE', c); if (m) { T.msg(trx, m); return false; }
      return false;
    },
    getSummary: function (trx, c) { var o = (c.documentno == null ? '' : c.documentno) + ': ' + elementName(trx, 'M_InOutConfirm_ID') + ' (#' + lines(trx, c).length + ')'; return c.description ? o + ' - ' + c.description : o; }
  };
  ML.registerDocAction(TBL, MInOutConfirm);
  return { MInOutConfirm: MInOutConfirm };
});
