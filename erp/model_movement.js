// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_movement.js: MMovement + MMovementLine (Inventory Move) model/DocAction classes, ported and REGISTERED into model_layer.js. Spec: prompts/mfg/LIBERO_DD_SPEC.md §3.
//   Witness: erp/tests/witness_movement_diff.js (READ THE LOG: §MVD lines). Why it exists: the twin had NO model-layer M_Movement (only the stand-alone ERPEngine.completeMovement on the old M_Storage table), so a
//   Libero DOC_AFTER_COMPLETE hook on M_Movement (erp/plugins/libero_dd.mjs) could never fire. Java root: org.adempiere.base/src/org/compiere/model/MMovement.java + MMovementLine.java + MMovementLineMA.java.
//   MMovementConfirm + MMovementLineConfirm (the in-transit two-step) are ported below (prompts/ERP_FRIENDLY_OPS_LENS.md §61, Witness: erp/tests/witness_movement_confirm.js); a confirm DIFFERENCE/SCRAPPED qty
//   creates the MInventory difference documents (createDifferenceDoc, §67 - the MInventory model is erp/model_inventory.js; this file only saves m_inventory / m_inventoryline rows and runs their DocAction, as the Java does).
//   Not ported = NAMED refusal ("... not ported - named"), never silent: mandatory-ASI validation (IDEMPIERE-1770), back-date re-costing.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./model_order'), require('./model_asi'));
  else root.ModelMovement = factory(root.ModelLayer, root.ModelTrade, root.ModelOrder, root.ModelAsi);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, MO, ASI) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.MV_BREAK) || '';   // witness negative controls only (MV_BREAK=nofrom|nopolicy)
  var LMC_BREAK = (typeof process !== 'undefined' && process.env && process.env.LMC_BREAK) || '';   // witness negative controls only (LMC_BREAK=noguard drops :427-430; noguardline drops :182-188; noconfirm skips createConfirmation; nodiffdoc skips createDifferenceDoc :497-590)
  var same = function (a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); };
  var day = function (d) { return d ? String(d).slice(0, 10) + ' 00:00:00' : null; };   // Util.removeTime
  function mvLines(trx, mv) { return trx.find('m_movementline', { m_movement_id: mv.m_movement_id }, ['line', 'm_movementline_id']); }   // MMovement.getLines :122-141 ORDER BY Line, M_MovementLine_ID
  function uomPrecision(trx, uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }
  function asiToOf(l) { return nz(l.m_attributesetinstanceto_id) ? l.m_attributesetinstanceto_id : (String(l.m_locator_id) === String(l.m_locatorto_id) ? (l.m_attributesetinstance_id || 0) : 0); }   // MMovementLine.getM_AttributeSetInstanceTo_ID :109-116 (override)

  // ══ models ══════════════════════════════════════════════════════════════════════════════════════════════════
  ML.registerModel('m_movement', {
    initialDefaults: { docaction: 'CO', docstatus: 'DR', isapproved: 'N', isintransit: 'N', posted: 'N', processed: 'N' }, initialClock: ['movementdate'],   // MMovement.setInitialDefaults :89-97
    beforeSave: function (trx, mv) {   // :210-229 - no doctype -> the first MaterialMovement doctype of the client (MDocType.getOfDocBaseType: active, IsDefault DESC, C_DocType_ID)
      if (!nz(mv.c_doctype_id)) {
        var dt = trx.q("SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='MMM' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [nz(mv.ad_client_id) ? mv.ad_client_id : trx.env.client])[0];
        if (dt) mv.c_doctype_id = dt.c_doctype_id; else return '@NotFound@ @C_DocType_ID@';
      }
      return null;
    }
  });
  ML.registerModel('m_movementline', {
    initialDefaults: { m_attributesetinstance_id: 0, movementqty: 0, targetqty: 0, scrappedqty: 0, confirmedqty: 0, processed: 'N' },   // MMovementLine.setInitialDefaults :73-80
    beforeSave: function (trx, l, isNew, old) {   // MMovementLine.beforeSave :175-269 (+ the pending-confirmation guard :182-188)
      var mv = trx.get('m_movement', l.m_movement_id); if (!mv) return null;
      if (isNew && Y(mv.processed)) return 'ParentComplete';                                                                                // :177-181
      if (LMC_BREAK !== 'noguardline' && pendingConfirmations(trx, mv) && (isNew || (!same(l.movementqty, old && old.movementqty) && same(l.targetqty, old && old.targetqty)))) return 'SaveError: @Open@: @M_MovementConfirm_ID@';   // :182-188 no new line / MovementQty change while a confirm is open
      if (!Number(l.line)) { var mx = 0; trx.find('m_movementline', { m_movement_id: l.m_movement_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); }); l.line = mx + 10; }   // :189-196
      if (String(l.m_locator_id) === String(l.m_locatorto_id) && String(l.m_attributesetinstance_id || 0) === String(asiToOf(l))) return '@M_Locator_ID@ == @M_LocatorTo_ID@ and @M_AttributeSetInstance_ID@ == @M_AttributeSetInstanceTo_ID@';   // :197-203
      var p = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null;
      if (!nz(l.c_uom_id) && p) l.c_uom_id = p.c_uom_id;                                                                                    // :204-207 setDefaultC_UOM_ID
      var mq = D(l.movementqty);
      if (mq.signum() === 0) {                                                                                                              // :208-234 zero quantity
        var da = mv.docaction, ds = mv.docstatus, unproc = /^(DR|IN|IP|AP|NA)$/.test(ds || '');
        if (!((da === 'VO' && unproc) || (da === 'CO' && ds === 'IP'))) return '@FillMandatory@ MovementQty';
      }
      if (p && !same(l.c_uom_id, p.c_uom_id) && mq.signum() !== 0 && (l.qtyentered == null || D(l.qtyentered).signum() === 0)) return 'Please provide a valid Entered Quantity or use the default UOM';   // :235-242
      if (isNew && mq.signum() !== 0 && (l.qtyentered == null || D(l.qtyentered).signum() === 0)) l.qtyentered = l.movementqty;            // :244-250 backward compatibility
      if ((isNew || !same(l.movementqty, old && old.movementqty)) && p) l.movementqty = N(D(l.movementqty).setScale(uomPrecision(trx, p.c_uom_id), HU));   // :252-253 setMovementQty :146-157
      if ((isNew || !same(l.qtyentered, old && old.qtyentered) || !same(l.c_uom_id, old && old.c_uom_id)) && l.qtyentered != null && nz(l.c_uom_id)) l.qtyentered = N(D(l.qtyentered).setScale(uomPrecision(trx, l.c_uom_id), HU));   // :254-257
      if (asiToOf(l) === 0 && String(l.m_locator_id) !== String(l.m_locatorto_id) && nz(l.m_attributesetinstance_id)) l.m_attributesetinstanceto_id = l.m_attributesetinstance_id;   // :258-267
      return null;
    }
  });

  // ══ MStorageOnHand ports (the pieces MMovement.completeIt needs) ══════════════════════════════════════════════
  // MStorageOnHand.getWarehouse / MProduct.getMMPolicy: ONE implementation, ModelAsi.storages / ModelAsi.mmFifo (AS-8: this file's own Trx-reading copy moved there, plus the guarantee-date filter it lacked)
  // MStorageOnHand.add with dateMPolicy: getCreate(.. dateMPolicy=null ..) matches ANY existing row of (locator, product, ASI) else creates one dated today (:731-747)
  function sAdd(trx, locatorId, productId, asi, qty, dmp, dli) {   // dli = dateLastInventory (MStorageOnHand.add(.., dateMPolicy, dateLastInventory, trx) :817-847 -> updateDateLastInventory :873)
    if (D(qty).signum() === 0) return null;
    if (dmp == null) {
      var ex = trx.find('m_storageonhand', { m_locator_id: locatorId, m_product_id: productId }).filter(function (s) { return String(s.m_attributesetinstance_id || 0) === String(asi || 0); })
        .sort(function (a, b) { return String(a.datematerialpolicy) < String(b.datematerialpolicy) ? -1 : 1; })[0];
      dmp = ex ? ex.datematerialpolicy : trx.env.date;
    }
    var err = T.storageAdd(trx, locatorId, productId, asi, qty, dmp);
    if (!err && dli != null) { var row = trx.find('m_storageonhand', { m_locator_id: locatorId, m_product_id: productId, m_attributesetinstance_id: asi || 0 }).filter(function (s) { return day(s.datematerialpolicy) === day(dmp); })[0]; if (row) trx.update('m_storageonhand', row, { datelastinventory: dli }); }
    return err;
  }

  // MMovementLineMA
  function maInsert(trx, line, asi, qty, dmp, auto) {   // MMovementLineMA ctor :150-178
    return trx.insert('m_movementlinema', ML.newPO(trx, 'm_movementlinema', { ad_client_id: line.ad_client_id, ad_org_id: line.ad_org_id, m_movementline_id: line.m_movementline_id,
      m_attributesetinstance_id: asi || 0, movementqty: N(qty), datematerialpolicy: day(dmp), isautogenerated: auto ? 'Y' : 'N', isactive: 'Y' }));
  }
  function maList(trx, line) { return trx.find('m_movementlinema', { m_movementline_id: line.m_movementline_id }); }
  function maManualQty(trx, line) { var q = Z; maList(trx, line).forEach(function (m) { if (m.isautogenerated === 'N') q = q.add(D(m.movementqty)); }); return q; }   // getManualQty :230-237
  // MMovement.checkMaterialPolicy :736-800
  function checkMaterialPolicy(trx, mv, line, qtyToDeliver) {
    maList(trx, line).forEach(function (m) { if (m.isautogenerated === 'Y') trx.del('m_movementlinema', m); });                                   // deleteMovementLineMA (IsAutoGenerated='Y')
    if (qtyToDeliver.signum() === 0) return;
    if (BREAK === 'nopolicy') return;
    if (nz(line.m_attributesetinstance_id)) return;                                                                                              // :747 only a line without ASI
    var p = T.product(trx, line.m_product_id), fifo = ASI.mmFifo(trx, p), st = ASI.storages(trx, { productId: line.m_product_id, asiId: 0, fifo: fifo, positiveOnly: true, locatorId: line.m_locator_id });
    for (var i = 0; i < st.length; i++) {
      var q = D(st[i].qtyonhand);
      if (q.compareTo(qtyToDeliver) >= 0) { maInsert(trx, line, st[i].m_attributesetinstance_id, qtyToDeliver, st[i].datematerialpolicy, true); qtyToDeliver = Z; }
      else { maInsert(trx, line, st[i].m_attributesetinstance_id, q, st[i].datematerialpolicy, true); qtyToDeliver = qtyToDeliver.subtract(q); }
      if (qtyToDeliver.signum() === 0) break;
    }
    if (qtyToDeliver.signum() !== 0) {                                                                                                           // :783-790 addOrCreate(line, 0, rest, MovementDate)
      var ex = trx.find('m_movementlinema', { m_movementline_id: line.m_movementline_id, m_attributesetinstance_id: 0 }).filter(function (m) { return day(m.datematerialpolicy) === day(mv.movementdate); })[0];
      if (ex) trx.update('m_movementlinema', ex, { movementqty: N(D(ex.movementqty).add(qtyToDeliver)) }); else maInsert(trx, line, 0, qtyToDeliver, mv.movementdate, true);
    }
  }
  function transaction(trx, line, type, locator, asi, qty, date) {   // MTransaction ctor + setM_MovementLine_ID
    trx.insert('m_transaction', ML.newPO(trx, 'm_transaction', { ad_org_id: line.ad_org_id, movementtype: type, m_locator_id: locator, m_product_id: line.m_product_id,
      m_attributesetinstance_id: asi || 0, movementqty: N(qty), movementdate: date, m_movementline_id: line.m_movementline_id }));
  }
  function setProcessed(trx, mv, flag) {   // MMovement.setProcessed :232-246 (+ the header; raw UPDATE of the lines)
    var ch = { processed: flag }; if (flag === 'Y' && !Number(mv.processedon) && trx.env.nowMillis != null) ch.processedon = trx.env.nowMillis;
    trx.update('m_movement', mv, ch);
    trx.find('m_movementline', { m_movement_id: mv.m_movement_id }).forEach(function (l) { trx.update('m_movementline', l, { processed: flag }); });
  }

  // MMovement.getConfirmations :144-154 / pendingConfirmations :704-712 (an unprocessed M_MovementConfirm of this movement)
  function confirmsOf(trx, mv) { return trx.find('m_movementconfirm', { m_movement_id: mv.m_movement_id }); }
  function pendingConfirmations(trx, mv) { return !!mv.m_movement_id && confirmsOf(trx, mv).some(function (c) { return !Y(c.processed); }); }
  // MMovement.createConfirmation :371-378 -> MMovementConfirm.create(move,false) :62-90: one header, one MMovementLineConfirm per movement line (TargetQty = ConfirmedQty = MovementQty, MMovementLineConfirm.setMovementLine)
  function createConfirmation(trx, mv) {
    if (confirmsOf(trx, mv).length) return;
    var r = ML.save(trx, 'm_movementconfirm', null, ML.newPO(trx, 'm_movementconfirm', { ad_client_id: mv.ad_client_id, ad_org_id: mv.ad_org_id, m_movement_id: mv.m_movement_id }));   // new MMovementConfirm(move) :104-109 setClientOrg + setM_Movement_ID
    if (!r.ok) throw new Error('MMovementConfirm not created: ' + r.error);
    mvLines(trx, mv).forEach(function (ml) {
      var c = ML.save(trx, 'm_movementlineconfirm', null, ML.newPO(trx, 'm_movementlineconfirm', { ad_client_id: r.row.ad_client_id, ad_org_id: r.row.ad_org_id, m_movementconfirm_id: r.row.m_movementconfirm_id, m_movementline_id: ml.m_movementline_id, targetqty: ml.movementqty, confirmedqty: ml.movementqty }));
      if (!c.ok) throw new Error('MMovementLineConfirm not created: ' + c.error);
    });
  }
  function cLines(trx, cf) { return trx.find('m_movementlineconfirm', { m_movementconfirm_id: cf.m_movementconfirm_id }, ['m_movementlineconfirm_id']); }   // MMovementConfirm.getLines :156-185

  ML.registerModel('m_movementconfirm', { initialDefaults: { docaction: 'CO', docstatus: 'DR', isapproved: 'N', processed: 'N' } });   // MMovementConfirm.setInitialDefaults :88-94
  ML.registerModel('m_movementlineconfirm', {
    initialDefaults: { confirmedqty: 0, differenceqty: 0, scrappedqty: 0, targetqty: 0, processed: 'N' },   // MMovementLineConfirm.setInitialDefaults
    beforeSave: function (trx, l, isNew) {   // MMovementLineConfirm.beforeSave
      var parent = trx.get('m_movementconfirm', l.m_movementconfirm_id);
      if (isNew && parent && Y(parent.processed)) return 'ParentComplete';   // newRecord && parent.isProcessed()
      l.differenceqty = N(D(l.targetqty).subtract(D(l.confirmedqty)));       // Difference = Target - Confirmed
      return null;
    }
  });

  // ══ MMovement DocAction ═════════════════════════════════════════════════════════════════════════════════════
  var MMovement = {
    prepareIt: function (trx, mv) {   // :290-368
      var m = fire(trx, 'BEFORE_PREPARE', 'm_movement', mv); if (m) { T.msg(trx, m); return 'IN'; }
      var d = T.dt(trx, mv.c_doctype_id); if (!d) { T.msg(trx, 'No Document Type (MDocType.get is null - legacy NullPointerException)'); return 'IN'; }
      if (!T.periodOpen(trx, mv.movementdate, d.docbasetype, mv.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }                       // :299-303
      if (!MO.backDateAllowed(trx, mv.movementdate)) { T.msg(trx, '@BackDateTrxNotAllowed@'); return 'IN'; }                                       // :305-309
      var ls = mvLines(trx, mv); if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }                                                         // :311-316
      for (var i = 0; i < ls.length; i++) {                                                                                                         // :318-352 mandatory ASI (IDEMPIERE-1770)
        var p = nz(ls[i].m_product_id) ? T.product(trx, ls[i].m_product_id) : null, as = p && nz(p.m_attributeset_id) ? trx.get('m_attributeset', p.m_attributeset_id) : null;
        if (as && as.mandatorytype && as.mandatorytype !== 'N') { T.msg(trx, 'MMovement.prepareIt mandatory ASI validation (MMovement.java:317-352, attribute set ' + as.m_attributeset_id + ' MandatoryType=' + as.mandatorytype + ') not ported - named'); return 'IN'; }
      }
      if (Y(d.isintransit) && !MO.isReversal(trx, 'm_movement', mv.m_movement_id) && LMC_BREAK !== 'noconfirm') createConfirmation(trx, mv);   // :355-356 createConfirmation :371-378
      m = fire(trx, 'AFTER_PREPARE', 'm_movement', mv); if (m) { T.msg(trx, m); return 'IN'; }                                                      // :358-361
      if (mv.docaction !== 'CO') trx.update('m_movement', mv, { docaction: 'CO' });                                                                // :362-365
      trx._justPrepared = 'm_movement:' + mv.m_movement_id;
      return 'IP';
    },
    completeIt: function (trx, mv) {   // :409-702
      if (trx._justPrepared !== 'm_movement:' + mv.m_movement_id) { var st = MMovement.prepareIt(trx, mv); if (st !== 'IP') return st; }          // :410-419 re-check
      trx._justPrepared = null; mv = trx.get('m_movement', mv.m_movement_id);
      var d = T.dt(trx, mv.c_doctype_id);
      if (Y(d.isoverwritedateoncomplete)) {                                                                                                         // setDefiniteDocumentNo :421 (body :717-733)
        var today = String(trx.env.date).slice(0, 10) + ' 00:00:00'; trx.update('m_movement', mv, { movementdate: today });
        if (!T.periodOpen(trx, today, d.docbasetype, mv.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }
        if (!MO.backDateAllowed(trx, today)) { T.msg(trx, '@BackDateTrxNotAllowed@'); return 'IN'; }
      }
      if (Y(d.isoverwriteseqoncomplete)) { var dn = T.getDocumentNoByDocType(trx, mv.c_doctype_id, true, mv); if (dn != null) trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { documentno: dn }); }
      mv = trx.get('m_movement', mv.m_movement_id);
      var m = fire(trx, 'BEFORE_COMPLETE', 'm_movement', mv); if (m) { T.msg(trx, m); return 'IN'; }                                              // :423-426
      if (LMC_BREAK !== 'noguard' && pendingConfirmations(trx, mv)) { T.msg(trx, '@Open@: @M_MovementConfirm_ID@'); return 'IP'; }              // :427-430 (pendingConfirmations :704-712): goods stay at the source, the doc stays InProgress
      if (!Y(mv.isapproved)) trx.update('m_movement', mv, { isapproved: 'Y' });                                                                    // :432-434 approveIt
      var rev = MO.isReversal(trx, 'm_movement', mv.m_movement_id);
      if (!rev) { var bd = MO.backDateCostingNamed(trx); if (bd) { T.msg(trx, bd); return 'IN'; } }                                                 // :437-444 periodClosedCheckForBackDateTrx(null) (:1173-1226)
      var errors = '', ls = mvLines(trx, mv);
      for (var li = 0; li < ls.length; li++) {                                                                                                      // :454-678
        var line = ls[li], p = nz(line.m_product_id) ? T.product(trx, line.m_product_id) : null, trxFrom = false;
        if (!(p && T.isStocked(p))) continue;
        var mq = D(line.movementqty), asi = line.m_attributesetinstance_id || 0, asiTo = asiToOf(line), fifo = ASI.mmFifo(trx, p), err;
        if (!rev) {                                                                                                                                 // :463-475
          var qtyMA = maManualQty(trx, line);
          if (qtyMA.compareTo(mq) > 0) { T.msg(trx, '@Over_Qty_On_Attribute_Tab@ ' + line.line); return 'IN'; }
          checkMaterialPolicy(trx, mv, line, mq.subtract(qtyMA));
        }
        if (!nz(asi)) {                                                                                                                             // :478-538 one pair of storage moves + transactions per MA
          var mas = maList(trx, line);
          for (var j = 0; j < mas.length; j++) {
            var ma = mas[j], q = D(ma.movementqty);
            err = BREAK === 'nofrom' ? null : sAdd(trx, line.m_locator_id, line.m_product_id, ma.m_attributesetinstance_id, q.negate(), ma.datematerialpolicy);
            if (err) { errors += 'Line ' + line.line + ': ' + err + '\n'; continue; }
            var asiToMA = asiTo; if (!nz(asiToMA) && String(line.m_locator_id) !== String(line.m_locatorto_id)) asiToMA = ma.m_attributesetinstance_id;   // :497-503 only can be same asi if locator is different
            err = sAdd(trx, line.m_locatorto_id, line.m_product_id, asiToMA, q, ma.datematerialpolicy);
            if (err) { errors += 'Line ' + line.line + ': ' + err + '\n'; continue; }
            transaction(trx, line, 'M-', line.m_locator_id, ma.m_attributesetinstance_id, q.negate(), mv.movementdate);                              // :517-526
            transaction(trx, line, 'M+', line.m_locatorto_id, asiToMA, q, mv.movementdate);                                                          // :528-536
            trxFrom = true;
          }
        }
        if (!trxFrom) {                                                                                                                             // :540-669 Fallback - We have ASI
          var sts = mq.signum() > 0 ? ASI.storages(trx, { productId: line.m_product_id, asiId: asi, fifo: fifo, positiveOnly: false, locatorId: line.m_locator_id }) : ASI.storages(trx, { productId: line.m_product_id, asiId: asiTo, fifo: fifo, positiveOnly: false, locatorId: line.m_locatorto_id }), dmp = null;
          for (var k = 0; k < sts.length; k++) if (D(sts[k].qtyonhand).compareTo(mq) >= 0) { dmp = sts[k].datematerialpolicy; break; }
          if (dmp == null && sts.length) dmp = sts[0].datematerialpolicy;
          var eff = dmp;
          if (eff == null && mq.negate().signum() > 0 && nz(p.m_attributeset_id) && asi > 0) { var as1 = trx.get('m_attributeset', p.m_attributeset_id), ai1 = trx.get('m_attributesetinstance', asi); if (as1 && Y(as1.isguaranteedate) && Y(as1.useguaranteedateformpolicy) && ai1 && ai1.guaranteedate) eff = ai1.guaranteedate; }
          if (eff == null && mq.negate().signum() > 0) eff = mv.movementdate;
          err = BREAK === 'nofrom' ? null : sAdd(trx, line.m_locator_id, line.m_product_id, asi, mq.negate(), eff);
          if (err) { errors += 'Line ' + line.line + ': ' + err + '\n'; continue; }
          if (asi > 0 && asiTo > 0 && asi !== asiTo) {                                                                                              // :593-619 different ASIs: re-lookup the target storage
            dmp = null;
            var st2 = mq.signum() > 0 ? ASI.storages(trx, { productId: line.m_product_id, asiId: asiTo, fifo: fifo, positiveOnly: false, locatorId: line.m_locatorto_id }) : ASI.storages(trx, { productId: line.m_product_id, asiId: asi, fifo: fifo, positiveOnly: false, locatorId: line.m_locator_id });
            for (var k2 = 0; k2 < st2.length; k2++) if (D(st2[k2].qtyonhand).add(mq).compareTo(Z) >= 0) { dmp = st2[k2].datematerialpolicy; break; }
            if (dmp == null && st2.length) dmp = st2[0].datematerialpolicy;
          }
          eff = dmp;                                                                                                                                // :623 NB: without a re-lookup the FROM storage's date is carried to the target
          if (eff == null && mq.signum() > 0 && nz(p.m_attributeset_id) && asiTo > 0) { var as2 = trx.get('m_attributeset', p.m_attributeset_id), ai2 = trx.get('m_attributesetinstance', asiTo); if (as2 && Y(as2.isguaranteedate) && Y(as2.useguaranteedateformpolicy) && ai2 && ai2.guaranteedate) eff = ai2.guaranteedate; }
          if (eff == null && mq.signum() > 0) eff = mv.movementdate;
          err = sAdd(trx, line.m_locatorto_id, line.m_product_id, asiTo, mq, eff);
          if (err) { errors += 'Line ' + line.line + ': ' + err + '\n'; continue; }
          transaction(trx, line, 'M-', line.m_locator_id, asi, mq.negate(), mv.movementdate);                                                       // :648-657
          transaction(trx, line, 'M+', line.m_locatorto_id, asiTo, mq, mv.movementdate);                                                            // :659-668
        }
      }
      if (errors) { T.msg(trx, errors); return 'IN'; }                                                                                              // :680-684
      m = fire(trx, 'AFTER_COMPLETE', 'm_movement', trx.get('m_movement', mv.m_movement_id)); if (m) { T.msg(trx, m); return 'IN'; }              // :687-691 user validation (Libero's DOC_AFTER_COMPLETE hook lands here)
      var cur = trx.get('m_movement', mv.m_movement_id); setProcessed(trx, cur, 'Y');                                                                // :695
      trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { docaction: 'CL' });                                                       // :696
      return 'CO';
    },
    // :803-880 voidIt - an unprocessed movement: lines to 0; a completed one: reverseCorrect (period open + back-date allowed) else reverseAccrual
    voidIt: function (trx, mv) {
      if (/^(CL|RE|VO)$/.test(mv.docstatus || '')) { T.msg(trx, 'Document Closed: ' + mv.docstatus); return false; }                                // :805-812
      if (/^(DR|IN|IP|AP|NA)$/.test(mv.docstatus || '')) {                                                                                          // :814-841
        var m = fire(trx, 'BEFORE_VOID', 'm_movement', mv); if (m) { T.msg(trx, m); return false; }
        mvLines(trx, mv).forEach(function (l) {
          var old = D(l.movementqty);
          if (old.signum() !== 0) { var r = ML.save(trx, 'm_movementline', l, { movementqty: 0, description: l.description == null || l.description === '' ? 'Void (' + old.toString() + ')' : l.description + ' | Void (' + old.toString() + ')' }); if (!r.ok) throw new Error(r.error); }
        });
      } else {                                                                                                                                      // :843-866
        var d = T.dt(trx, mv.c_doctype_id), accrual = !T.periodOpen(trx, mv.movementdate, d.docbasetype, mv.ad_org_id) || !MO.backDateAllowed(trx, mv.movementdate);
        return accrual ? MMovement.reverseAccrualIt(trx, mv) : MMovement.reverseCorrectIt(trx, mv);
      }
      var m2 = fire(trx, 'AFTER_VOID', 'm_movement', trx.get('m_movement', mv.m_movement_id)); if (m2) { T.msg(trx, m2); return false; }              // :868-870
      var cur = trx.get('m_movement', mv.m_movement_id); setProcessed(trx, cur, 'Y'); trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { docaction: '--', docstatus: 'VO' });   // :872-873 + DocumentEngine.voidIt
      return true;
    },
    closeIt: function (trx, mv) {   // :882-903
      var m = fire(trx, 'BEFORE_CLOSE', 'm_movement', mv); if (m) { T.msg(trx, m); return false; }
      trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { docaction: '--' });
      m = fire(trx, 'AFTER_CLOSE', 'm_movement', trx.get('m_movement', mv.m_movement_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { docstatus: 'CL' });                                                       // DocumentEngine.closeIt
      return true;
    },
    reverseCorrectIt: function (trx, mv) { return reverseIt(trx, mv, false); },   // :905-929
    reverseAccrualIt: function (trx, mv) { return reverseIt(trx, mv, true); },    // :1044-1069
    reActivateIt: function (trx, mv) {   // :1071-1090 validators only, returns false
      var m = fire(trx, 'BEFORE_REACTIVATE', 'm_movement', mv) || fire(trx, 'AFTER_REACTIVATE', 'm_movement', mv); if (m) T.msg(trx, m); return false;
    },
    approveIt: function (trx, mv) { trx.update('m_movement', mv, { isapproved: 'Y' }); return true; },
    rejectIt: function (trx, mv) { trx.update('m_movement', mv, { isapproved: 'N' }); return true; },
    getSummary: function (trx, mv) {   // :1092-1109
      var el = trx.q("SELECT name FROM ad_element WHERE lower(columnname)='approvalamt'")[0];
      return (mv.documentno || '') + ': ' + (el ? el.name : 'ApprovalAmt') + '=' + (mv.approvalamt == null ? '0' : mv.approvalamt) + ' (#' + mvLines(trx, mv).length + ')' + (mv.description ? ' - ' + mv.description : '');
    }
  };
  function reverseIt(trx, mv, accrual) {
    var tb = accrual ? 'REVERSEACCRUAL' : 'REVERSECORRECT';
    var m = fire(trx, 'BEFORE_' + tb, 'm_movement', mv); if (m) { T.msg(trx, m); return false; }
    var rv = reverse(trx, mv, accrual); if (!rv) return false;
    T.msg(trx, rv.documentno);
    m = fire(trx, 'AFTER_' + tb, 'm_movement', trx.get('m_movement', mv.m_movement_id)); if (m) { T.msg(trx, m); return false; }
    return true;
  }
  // MMovement.reverse(accrual) :932-1042
  function reverse(trx, mv, accrual) {
    var reversalDate = accrual ? trx.env.date : mv.movementdate; if (reversalDate == null) reversalDate = trx.env.date;
    var d = T.dt(trx, mv.c_doctype_id);
    if (!T.periodOpen(trx, reversalDate, d.docbasetype, mv.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return null; }                              // :939-944
    if (!MO.backDateAllowed(trx, reversalDate)) { T.msg(trx, '@BackDateTrxNotAllowed@'); return null; }                                              // :945-949
    var bd = MO.backDateCostingNamed(trx); if (bd) { T.msg(trx, bd); return null; }                                                                   // :951-957
    var rvPO = ML.newRecord(trx, 'm_movement', {});                                                                                                   // :959 new MMovement(ctx, 0) -> setInitialDefaults
    ML.copyValues(trx, 'm_movement', mv, rvPO, mv.ad_client_id, mv.ad_org_id);
    rvPO.set('docstatus', 'DR').set('docaction', 'CO').set('isapproved', 'N').set('isintransit', 'N').set('posted', 'N').set('processed', 'N').set('movementdate', reversalDate);   // :960-966
    rvPO.set('documentno', mv.documentno + '^').set('description', (mv.description == null || mv.description === '' ? '' : mv.description + ' | ') + '{->' + mv.documentno + ')').set('reversal_id', mv.m_movement_id);   // :967-973 REVERSE_INDICATOR, addDescription
    if (!rvPO.save()) { T.msg(trx, 'Could not create Movement Reversal'); return null; }
    var rvId = rvPO.id(); MO.setReversal(trx, 'm_movement', rvId);                                                                                    // :980 setReversal(true)
    var oLines = mvLines(trx, mv);
    for (var i = 0; i < oLines.length; i++) {                                                                                                         // :982-1001
      var o = oLines[i], rl = ML.newRecord(trx, 'm_movementline', {});
      ML.copyValues(trx, 'm_movementline', o, rl, o.ad_client_id, o.ad_org_id);
      rl.set('m_movement_id', rvId).set('reversalline_id', o.m_movementline_id).set('c_uom_id', o.c_uom_id)
        .set('movementqty', N(D(o.movementqty).negate())).set('qtyentered', N(D(o.qtyentered).negate())).set('targetqty', 0).set('scrappedqty', 0).set('confirmedqty', 0).set('processed', 'N');
      if (!rl.save()) { T.msg(trx, 'Could not create Movement Reversal Line for @Line@ ' + o.line + ' (' + rl.error + ')'); return null; }
      var rLine = trx.get('m_movementline', rl.id());
      if (!nz(rLine.m_attributesetinstance_id)) maList(trx, o).forEach(function (ma) {                                                               // :1002-1013 copy MA, negated
        maInsert(trx, rLine, ma.m_attributesetinstance_id, D(ma.movementqty).negate(), ma.datematerialpolicy, true);
      });
    }
    var res = ML.processIt(trx, 'm_movement', rvId, 'CO');                                                                                            // :1018-1022
    var rvRow = trx.get('m_movement', rvId);
    if (!res.ok || rvRow.docstatus !== 'CO') { T.msg(trx, 'Reversal ERROR: ' + (res.msg || res.status)); return null; }
    MMovement.closeIt(trx, rvRow);                                                                                                                    // :1023
    trx.update('m_movement', trx.get('m_movement', rvId), { docstatus: 'RE', docaction: '--' });                                                      // :1024-1026
    var cur = trx.get('m_movement', mv.m_movement_id);                                                                                                // :1028-1034
    T.addDescription(trx, 'm_movement', cur, '(' + rvRow.documentno + '<-)');
    var c2 = trx.get('m_movement', mv.m_movement_id); setProcessed(trx, c2, 'Y');
    trx.update('m_movement', trx.get('m_movement', mv.m_movement_id), { reversal_id: rvId, docstatus: 'RE', docaction: '--' });
    return trx.get('m_movement', rvId);
  }
  ML.registerDocAction('m_movement', MMovement);

  function elementName(trx, col) { var r = trx.q('SELECT name FROM ad_element WHERE lower(columnname)=?', [col.toLowerCase()])[0]; return r && r.name != null ? r.name : col; }   // Msg.translate(ctx, "ColumnName") = the AD_Element name
  // MMovementConfirm.setInventoryDocType :610-620 - the first MMI doctype of the client (MDocType.getOfDocBaseType: active, IsDefault DESC, C_DocType_ID) whose DocSubTypeInv is PI
  function inventoryDocType(trx) {
    var r = trx.q("SELECT c_doctype_id FROM c_doctype WHERE ad_client_id=? AND docbasetype='MMI' AND isactive='Y' AND docsubtypeinv='PI' ORDER BY isdefault DESC, c_doctype_id", [trx.env.client])[0];
    return r ? r.c_doctype_id : 0;
  }
  // MMovementConfirm.createDifferenceDoc :497-590 - Difference qty -> a Physical Inventory line at the SOURCE locator (QtyBook = Difference, QtyCount = 0, i.e. the difference is taken OUT of the source);
  //   Scrapped qty -> a line at the TARGET locator (QtyBook = Scrapped, QtyCount = 0, taken out of the target once the move has arrived). One MInventory per warehouse (m_inventoryFrom / m_inventoryTo, reset when the warehouse changes).
  //   dd = the instance fields { from, to, info, docs }. Returns false with trx._msg set (updateProcessMsg) when a document or line cannot be saved. The MInventory MODEL (model_inventory.js) owns the rules; here it is only saved and (by completeIt) completed.
  function inventoryOf(trx, cf, dd, which, locatorId) {   // :501-538 / :545-582
    var loc = trx.get('m_locator', locatorId), cur = dd[which];
    if (cur && String(cur.m_warehouse_id) !== String(loc.m_warehouse_id)) cur = dd[which] = null;                                           // :506-508
    if (cur) return cur;
    var wh = trx.get('m_warehouse', loc.m_warehouse_id), cdt = inventoryDocType(trx);
    var r = ML.save(trx, 'm_inventory', null, ML.newPO(trx, 'm_inventory', { ad_client_id: wh.ad_client_id, ad_org_id: wh.ad_org_id, m_warehouse_id: wh.m_warehouse_id,   // new MInventory(wh, trx): setClientOrg(wh) + setM_Warehouse_ID
      description: elementName(trx, 'M_MovementConfirm_ID') + ' ' + cf.documentno, c_doctype_id: cdt }));
    if (!r.ok) { updateProcessMsg(trx, 'Inventory not created', r.error); return null; }                                                    // :516-520
    dd[which] = r.row;
    var cfRow = trx.get('m_movementconfirm', cf.m_movementconfirm_id);
    if (!nz(cfRow.m_inventory_id)) { trx.update('m_movementconfirm', cfRow, { m_inventory_id: r.row.m_inventory_id }); dd.info = r.row.documentno; }   // :522-527 First Inventory
    else dd.info += ',' + r.row.documentno;                                                                                                 // :529
    dd.docs.push(r.row.m_inventory_id);                                                                                                     // :531
    return r.row;
  }
  function updateProcessMsg(trx, msg, err) { trx._msg = trx._msg ? trx._msg + ' ' + msg : msg; if (err) trx._msg += ': ' + err; }              // :594-605 (CLogger.retrieveError appended)
  function createDifferenceDoc(trx, cf, dd, mLine, confirm) {
    if (LMC_BREAK === 'nodiffdoc') return true;   // witness negative control only: the difference documents are not created (the loss would vanish from the books)
    var diff = D(confirm.differenceqty), scr = D(confirm.scrappedqty), asi = mLine.m_attributesetinstance_id || 0;
    function addLine(inv, locatorId, qtyBook, kind) {   // new MInventoryLine(inv, locator, product, asi, QtyBook, ZERO) + setDescription + save :541-543 / :583-585
      var l = ML.save(trx, 'm_inventoryline', null, ML.newPO(trx, 'm_inventoryline', { ad_client_id: inv.ad_client_id, ad_org_id: inv.ad_org_id, m_inventory_id: inv.m_inventory_id, m_locator_id: locatorId,
        m_product_id: mLine.m_product_id, m_attributesetinstance_id: asi, qtybook: N(qtyBook), description: elementName(trx, kind) }));
      if (!l.ok) { updateProcessMsg(trx, 'Inventory Line not created', l.error); return false; }
      trx.update('m_movementlineconfirm', trx.get('m_movementlineconfirm', confirm.m_movementlineconfirm_id), { m_inventoryline_id: l.row.m_inventoryline_id });   // confirm.setM_InventoryLine_ID (saved by the caller's setProcessed save)
      return true;
    }
    if (diff.signum() !== 0) {                                                                                                              // :501-543 Difference - Inventory Difference for the Source Location
      var f = inventoryOf(trx, cf, dd, 'from', mLine.m_locator_id); if (!f) return false;
      if (!addLine(f, mLine.m_locator_id, diff, 'DifferenceQty')) return false;
    }
    if (scr.signum() !== 0) {                                                                                                               // :545-587 Scrapped - Inventory Difference for the Target Location
      var t = inventoryOf(trx, cf, dd, 'to', mLine.m_locatorto_id); if (!t) return false;
      if (!addLine(t, mLine.m_locatorto_id, scr, 'ScrappedQty')) return false;
    }
    return true;
  }

  // ══ MMovementConfirm DocAction (MMovementConfirm.java) ═══════════════════════════════════════════════════════
  var MMovementConfirm = {
    prepareIt: function (trx, cf) {   // :313-355
      var m = fire(trx, 'BEFORE_PREPARE', 'm_movementconfirm', cf); if (m) { T.msg(trx, m); return 'IN'; }
      var when = cf.updated ? String(cf.updated).slice(0, 10) + ' 00:00:00' : trx.env.date;
      if (!T.periodOpen(trx, when, 'MMM', cf.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }                                  // :321-326 (getUpdated())
      if (!MO.backDateAllowed(trx, when)) { T.msg(trx, '@BackDateTrxNotAllowed@'); return 'IN'; }                                         // :328-332
      if (!cLines(trx, cf).length) { T.msg(trx, '@NoLines@'); return 'IN'; }                                                              // :334-339 (the isFullyConfirmed loop :340-346 has no effect)
      m = fire(trx, 'AFTER_PREPARE', 'm_movementconfirm', cf); if (m) { T.msg(trx, m); return 'IN'; }                                     // :348-351
      if (cf.docaction !== 'CO') trx.update('m_movementconfirm', cf, { docaction: 'CO' });
      trx._justPrepared = 'm_movementconfirm:' + cf.m_movementconfirm_id;
      return 'IP';
    },
    completeIt: function (trx, cf) {   // :387-486
      if (trx._justPrepared !== 'm_movementconfirm:' + cf.m_movementconfirm_id) { var st = MMovementConfirm.prepareIt(trx, cf); if (st !== 'IP') return st; }   // :390-397 re-check
      trx._justPrepared = null; cf = trx.get('m_movementconfirm', cf.m_movementconfirm_id);
      var m = fire(trx, 'BEFORE_COMPLETE', 'm_movementconfirm', cf); if (m) { T.msg(trx, m); return 'IN'; }                               // :399-402
      if (!Y(cf.isapproved)) trx.update('m_movementconfirm', cf, { isapproved: 'Y' });                                                    // :404-406 implicit approval
      var ls = cLines(trx, cf), dd = { from: null, to: null, info: null, docs: [] };                                                       // :407 m_inventoryDoc = new ArrayList (m_inventoryFrom/To/Info are the instance fields :148-153)
      for (var i = 0; i < ls.length; i++) {                                                                                                // :412-444
        var cl = ls[i], ml = trx.get('m_movementline', cl.m_movementline_id);
        var r = ml ? ML.save(trx, 'm_movementline', ml, { targetqty: cl.targetqty, movementqty: cl.confirmedqty, confirmedqty: cl.confirmedqty, scrappedqty: cl.scrappedqty }) : { ok: false, error: 'movement line ' + cl.m_movementlineconfirm_id + ' not found' };   // MMovementLineConfirm.processLine
        if (!r.ok) { T.msg(trx, 'ShipLine not saved - ' + cl.m_movementlineconfirm_id + ' (' + r.error + ')'); return 'IN'; }              // :418-422
        cl = trx.get('m_movementlineconfirm', cl.m_movementlineconfirm_id);
        if (D(cl.targetqty).compareTo(D(cl.confirmedqty)) === 0 && D(cl.scrappedqty).signum() === 0) trx.update('m_movementlineconfirm', cl, { processed: 'Y' });   // :424-428 isFullyConfirmed && Scrapped==0
        else if (createDifferenceDoc(trx, cf, dd, trx.get('m_movementline', cl.m_movementline_id), cl)) trx.update('m_movementlineconfirm', trx.get('m_movementlineconfirm', cl.m_movementlineconfirm_id), { processed: 'Y' });   // :430-435
        else { if (!trx._msg) T.msg(trx, 'Difference Doc not created'); return 'IN'; }                                                      // :437-444
      }
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'Y' });                         // :449-450 setProcessed(true) before the workflow (lifts the pending guard)
      var res = ML.processIt(trx, 'm_movement', cf.m_movement_id, 'CO');                                                                   // :451 MWorkflow.runDocumentActionWorkflow(move, Complete)
      if (!res.ok) { T.msg(trx, res.msg || ('Movement ' + res.status)); trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'N' }); return 'IN'; }   // :452-457
      if (dd.info != null) {                                                                                                               // :459-476 complete the inventory documents (after the move: the Scrapped qty is removed from the TARGET once it has arrived)
        for (var di = 0; di < dd.docs.length; di++) {
          var ir = ML.processIt(trx, 'm_inventory', dd.docs[di], 'CO');
          if (!ir.ok) { T.msg(trx, ir.msg || ('Inventory ' + ir.status)); trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'N' }); return 'IN'; }
        }
        T.msg(trx, ' @M_Inventory_ID@: ' + dd.info);                                                                                       // :468
        T.addDescription(trx, 'm_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), elementName(trx, 'M_Inventory_ID') + ': ' + dd.info);   // :469-470 addDescription
      }
      m = fire(trx, 'AFTER_COMPLETE', 'm_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id)); if (m) { T.msg(trx, m); return 'IN'; }   // :479-484
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'Y', docaction: 'CL' });       // :486-488
      return 'CO';
    },
    voidIt: function (trx, cf) {   // :608-651
      var m = fire(trx, 'BEFORE_VOID', 'm_movementconfirm', cf); if (m) { T.msg(trx, m); return false; }
      cLines(trx, cf).forEach(function (cl) { trx.update('m_movementlineconfirm', cl, { targetqty: 0, confirmedqty: 0, scrappedqty: 0, differenceqty: 0, processed: 'Y' }); });   // :618-626
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'Y' });                         // :628-630 so the movement lines may change
      var res = ML.processIt(trx, 'm_movement', cf.m_movement_id, 'VO');                                                                   // :632 voiding the confirm voids the movement
      if (!res.ok) { T.msg(trx, res.msg || ('Movement ' + res.status)); trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { processed: 'N' }); return false; }   // :633-638
      m = fire(trx, 'AFTER_VOID', 'm_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { docaction: '--', docstatus: 'VO' });       // :645 + DocumentEngine.voidIt
      return true;
    },
    closeIt: function (trx, cf) {   // :653-675
      var m = fire(trx, 'BEFORE_CLOSE', 'm_movementconfirm', cf); if (m) { T.msg(trx, m); return false; }
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { docaction: '--' });
      m = fire(trx, 'AFTER_CLOSE', 'm_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('m_movementconfirm', trx.get('m_movementconfirm', cf.m_movementconfirm_id), { docstatus: 'CL' });
      return true;
    },
    reActivateIt: function (trx, cf) { var m = fire(trx, 'BEFORE_REACTIVATE', 'm_movementconfirm', cf) || fire(trx, 'AFTER_REACTIVATE', 'm_movementconfirm', cf); if (m) T.msg(trx, m); return false; },   // :727-743 validators only, returns false
    reverseCorrectIt: function (trx, cf) { var m = fire(trx, 'BEFORE_REVERSECORRECT', 'm_movementconfirm', cf) || fire(trx, 'AFTER_REVERSECORRECT', 'm_movementconfirm', cf); if (m) T.msg(trx, m); return false; },   // :677-694 not implemented, false
    reverseAccrualIt: function (trx, cf) { var m = fire(trx, 'BEFORE_REVERSEACCRUAL', 'm_movementconfirm', cf) || fire(trx, 'AFTER_REVERSEACCRUAL', 'm_movementconfirm', cf); if (m) T.msg(trx, m); return false; },   // :696-713
    approveIt: function (trx, cf) { trx.update('m_movementconfirm', cf, { isapproved: 'Y' }); return true; },
    rejectIt: function (trx, cf) { trx.update('m_movementconfirm', cf, { isapproved: 'N' }); return true; }
  };
  ML.registerDocAction('m_movementconfirm', MMovementConfirm);

  return { MMovement: MMovement, MMovementConfirm: MMovementConfirm, pendingConfirmations: pendingConfirmations, checkMaterialPolicy: checkMaterialPolicy, sAdd: sAdd, uomPrecision: uomPrecision, day: day };
});
