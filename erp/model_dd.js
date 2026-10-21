// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_dd.js: MDDOrder + MDDOrderLine (Distribution Orders), ported into model_layer.js. Spec: prompts/mfg/LIBERO_DD_SPEC.md §2. Witness: erp/tests/witness_dd_order_diff.js
//   (READ THE LOG: §DDO lines). Java root: org.adempiere.base/src/org/eevolution/model/MDDOrder.java + MDDOrderLine.java (core in legacy, not Libero). One cite per rule; writes only through trx.
//   Anything not ported is a NAMED refusal ("... not ported - named"), never silent. UPSTREAM QUIRKS ARE KEPT (twin rule): voidIt does not zero QtyOrdered, so it un-reserves nothing; the line number reads C_OrderLine.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelDD = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.DD_BREAK) || '';   // witness negative controls only (DD_BREAK=voidzero|noreserve)
  var same = function (a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); };

  function lines(trx, o, order) { return trx.find('dd_orderline', { dd_order_id: o.dd_order_id }, order || ['line']); }   // MDDOrder.getLines :437 (Query on DD_OrderLine, no IsActive filter)
  function uomPrecision(trx, uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }   // MUOM.getPrecision
  function setProcessed(trx, o, flag) {   // MDDOrder.setProcessed :585-597 - the header, then `UPDATE DD_OrderLine SET Processed` (raw SQL: no line events)
    var ch = { processed: flag }; if (flag === 'Y' && !Number(o.processedon) && trx.env.nowMillis != null) ch.processedon = trx.env.nowMillis;
    trx.update('dd_order', o, ch);
    trx.find('dd_orderline', { dd_order_id: o.dd_order_id }).forEach(function (l) { trx.update('dd_orderline', l, { processed: flag }); });
  }
  function line_canChangeWarehouse(l) {   // MDDOrderLine.canChangeWarehouse :335-350
    if (D(l.qtydelivered).signum() !== 0) return 'Error: QtyDelivered=' + D(l.qtydelivered).toString();
    if (D(l.qtyreserved).signum() !== 0) return 'Error: QtyReserved=' + D(l.qtyreserved).toString();
    return null;
  }

  // ══ MDDOrder model ═══════════════════════════════════════════════════════════════════════════════════════════
  // setInitialDefaults :156-179 (the clock-valued DatePromised / DateOrdered are listed in initialClock). IsInDispute / IsInTransit are NOT defaulted upstream (both NOT NULL in the DDL: legacy refuses a save
  // that leaves them out - the window / WebService supplies them from AD_Column.DefaultValue, exactly as for the twin's callers).
  var ORDER_DEFAULTS = { docstatus: 'DR', docaction: 'PR', deliveryrule: 'A', freightcostrule: 'I', priorityrule: '5', deliveryviarule: 'P', isselected: 'N', issotrx: 'Y', isdropship: 'N', sendemail: 'N',
    isapproved: 'N', isprinted: 'N', isdelivered: 'N', processed: 'N', processing: 'N', posted: 'N', freightamt: 0, chargeamt: 0 };
  var DDOrderModel = {
    initialDefaults: ORDER_DEFAULTS, initialClock: ['datepromised', 'dateordered'],
    beforeSave: function (trx, o, isNew, old) {   // MDDOrder.beforeSave :599-661
      if (!nz(o.ad_org_id)) { var ctxOrg = trx.env.org; if (nz(ctxOrg)) { o.ad_org_id = ctxOrg; trx.say('§DDO changed Org to Context=' + ctxOrg); } }   // :604-609
      if (!nz(o.ad_client_id) && !nz(trx.env.client)) return 'AD_Client_ID = 0';                                                       // :613 (the ctor stamps the context client first; :611-615)
      if (isNew && !nz(o.c_doctype_id)) o.c_doctype_id = 0;                                                                              // :618-619
      if (!nz(o.m_warehouse_id)) {                                                                                                       // :621-631 default warehouse from the context, else FillMandatory
        if (nz(trx.env.warehouse)) o.m_warehouse_id = trx.env.warehouse; else return '@FillMandatory@ M_Warehouse_ID';
      }
      if (!isNew && old && !same(o.m_warehouse_id, old.m_warehouse_id) && o.dd_order_id != null) {                                       // :633-642
        var ls = lines(trx, o); for (var i = 0; i < ls.length; i++) { var e = line_canChangeWarehouse(ls[i]); if (e) return e; }
      }
      if (!nz(o.c_bpartner_id)) return 'setBPartner(MBPartner.getTemplate) (MDDOrder.java:644-649, setBPartner :284) not ported - named: C_BPartner_ID is NOT NULL in the DDL, legacy cannot save a Distribution Order without a partner either';
      if (!nz(o.c_bpartner_location_id)) {                                                                                               // :647-649 setBPartner(new MBPartner(ctx, getC_BPartner_ID(), null)), setBPartner :284
        var bp = trx.get('c_bpartner', o.c_bpartner_id);
        if (!bp) return 'C_BPartner ' + o.c_bpartner_id + ' not found';
        if (bp.deliveryrule) o.deliveryrule = bp.deliveryrule;                                                                           // setBPartner
        if (bp.deliveryviarule) o.deliveryviarule = bp.deliveryviarule;                                                                  // setBPartner
        if (!nz(o.salesrep_id) && nz(trx.env.user)) o.salesrep_id = trx.env.user;                                                        // setBPartner
        var locs = trx.q("SELECT * FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id", [o.c_bpartner_id]);   // MBPartner.getLocations :516
        locs.forEach(function (l) { if (Y(l.isshipto)) o.c_bpartner_location_id = l.c_bpartner_location_id; });                         // setBPartner: the LAST ship-to wins
        if (!nz(o.c_bpartner_location_id) && locs.length) o.c_bpartner_location_id = locs[0].c_bpartner_location_id;                    // setBPartner: else the first
        var users = trx.q("SELECT * FROM ad_user WHERE c_bpartner_id=? AND isactive='Y' ORDER BY ad_user_id", [o.c_bpartner_id]);          // MBPartner.getContacts :459
        if (users.length === 1) o.ad_user_id = users[0].ad_user_id;                                                                      // setBPartner: a single contact
      }
      if (!nz(o.salesrep_id)) { if (nz(trx.env.user)) o.salesrep_id = trx.env.user; }                                                    // :651-657
      return null;
    },
    afterSave: function (trx, o, isNew, old) {   // MDDOrder.afterSave :663-693
      if (isNew) return null;                                                                                                            // :665 `!success || newRecord`
      old = old || {};
      if (!same(o.description, old.description) || !same(o.poreference, old.poreference)) {                                              // :668-678 propagate to the open M_Movements
        trx.find('m_movement', { dd_order_id: o.dd_order_id }).filter(function (m) { return m.docstatus !== 'RE' && m.docstatus !== 'CL'; })
          .forEach(function (m) { trx.update('m_movement', m, { description: o.description, poreference: o.poreference }); });
      }
      var lc = ML.columnsOf(trx, 'dd_orderline');
      ['ad_org_id', 'c_bpartner_id', 'c_bpartner_location_id', 'dateordered', 'datepromised', 'm_shipper_id'].forEach(function (col) {   // :680-686 afterSaveSync
        if (same(o[col], old[col])) return;
        trx.find('dd_orderline', { dd_order_id: o.dd_order_id }).forEach(function (l) {                                                  // afterSaveSync :695 line.set_ValueOfColumn + saveEx (a column the line does not have is a no-op)
          if (!lc[col]) return;
          var r = ML.save(trx, 'dd_orderline', l, (function () { var c = {}; c[col] = o[col]; return c; })()); if (!r.ok) throw new Error(r.error);
        });
      });
      return null;
    },
    beforeDelete: function (trx, o) {   // MDDOrder.beforeDelete :725-737
      if (Y(o.processed)) return 'Processed';
      var ls = lines(trx, o), left = 0;
      ls.forEach(function (l) { var r = ML.remove(trx, 'dd_orderline', l); if (!r.ok) left++; });                                         // m_lines[i].delete(true): a refusal is ignored upstream ...
      if (left) return left + ' DD_OrderLine row(s) could not be deleted (QtyDelivered / QtyReserved <> 0, MDDOrderLine.beforeDelete :629) - legacy then fails the FK ddorder_ddorderline at commit; refused here';
      return null;
    }
  };
  ML.registerModel('dd_order', DDOrderModel);

  // ══ MDDOrderLine model ═══════════════════════════════════════════════════════════════════════════════════════
  ML.registerModel('dd_orderline', {
    initialDefaults: { freightamt: 0, linenetamt: 0, m_attributesetinstance_id: 0, qtyentered: 0, qtyintransit: 0, confirmedqty: 0, targetqty: 0, pickedqty: 0, qtyordered: 0, qtydelivered: 0, qtyreserved: 0, isdescription: 'N', processed: 'N', line: 0 },   // :125-150
    beforeSave: function (trx, l, isNew, old) {   // MDDOrderLine.beforeSave :532-627
      var o = trx.get('dd_order', l.dd_order_id);
      if (isNew && o && Y(o.processed)) return 'ParentComplete';                                                                         // :534-538
      if (!isNew && old && (!same(l.m_product_id, old.m_product_id) || !same(l.m_locator_id, old.m_locator_id) || !same(l.m_locatorto_id, old.m_locatorto_id))) {   // :542-548
        var cw = line_canChangeWarehouse(old); if (cw) return cw;
      }
      if (nz(l.c_charge_id) && nz(l.m_product_id)) l.m_product_id = null;                                                                // :550-551
      if (!nz(l.m_product_id)) l.m_attributesetinstance_id = 0;                                                                          // :553-555
      if (!nz(l.c_uom_id) && (nz(l.m_product_id) || nz(l.c_charge_id))) {                                                                // :557-564 MUOM.getDefault_UOM_ID (MUOM.java:90-96)
        var du = trx.q('SELECT c_uom_id FROM c_uom WHERE ad_client_id IN (0,?) ORDER BY isdefault DESC, ad_client_id DESC, c_uom_id', [nz(l.ad_client_id) ? l.ad_client_id : trx.env.client])[0];
        if (du && Number(du.c_uom_id) > 0) l.c_uom_id = du.c_uom_id;
      }
      var p = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null;
      if ((isNew || !same(l.qtyentered, old && old.qtyentered)) && nz(l.c_uom_id) && l.qtyentered != null) l.qtyentered = N(D(l.qtyentered).setScale(uomPrecision(trx, l.c_uom_id), HU));   // :566-568 setQtyEntered :506-514
      if ((isNew || !same(l.qtyordered, old && old.qtyordered)) && p && l.qtyordered != null) l.qtyordered = N(D(l.qtyordered).setScale(uomPrecision(trx, p.c_uom_id), HU));   // :569-571 setQtyOrdered :520-529 (product UOM precision)
      var soTrx = o ? Y(o.issotrx) : true;                                                                                               // m_IsSOTrx (setHeaderInfo; ctor default true)
      if (soTrx && nz(l.m_attributesetinstance_id) && isNew && p && T.isStocked(p) && nz(p.m_attributeset_id)) {                         // :572-611 on hand >= QtyOrdered when the set has instance attributes (is_ValueChanged of a missing M_Warehouse_ID column is false)
        var as = trx.get('m_attributeset', p.m_attributeset_id);
        if (as && Y(as.isinstanceattribute)) {
          var from = trx.get('m_locator', l.m_locator_id), qty = Z;
          if (from) trx.q('SELECT s.qtyonhand AS q, s.m_attributesetinstance_id AS a FROM m_storageonhand s JOIN m_locator lo ON lo.m_locator_id=s.m_locator_id WHERE lo.m_warehouse_id=? AND s.m_product_id=?', [from.m_warehouse_id, l.m_product_id])
            .forEach(function (s) { if (String(s.a) === String(l.m_attributesetinstance_id)) qty = qty.add(D(s.q)); });
          if (D(l.qtyordered).compareTo(qty) > 0) return 'QtyInsufficient=' + qty.toString();
        }
      }
      if (D(l.freightamt).signum() !== 0) l.freightamt = 0;                                                                              // :613-615
      if (!Number(l.line)) {                                                                                                             // :617-622 (SQL :620) UPSTREAM BUG kept: MAX(Line) over C_OrderLine WHERE C_Order_ID = the DD_Order_ID (§DD-QUIRK-LINE)
        var mx = 0; trx.find('c_orderline', { c_order_id: l.dd_order_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); });
        l.line = mx + 10; trx.say('§DD-QUIRK-LINE DD_OrderLine.Line=' + l.line + ' from MAX(C_OrderLine.Line) WHERE C_Order_ID=' + l.dd_order_id + ' (MDDOrderLine.java:617-622)');
      }
      return null;
    },
    beforeDelete: function (trx, l) {   // MDDOrderLine.beforeDelete :629-649
      if (D(l.qtydelivered).signum() !== 0) return 'DeleteError: QtyDelivered=' + D(l.qtydelivered).toString();
      if (D(l.qtyreserved).signum() !== 0) return 'DeleteError: QtyReserved=' + D(l.qtyreserved).toString();
      return null;
    }
  });

  // ══ MDDOrder.reserveStock :854-935 ══════════════════════════════════════════════════════════════════════════════
  // The two MStorageOnHand.add(.., Env.ZERO ..) calls (:886-903) return true on a zero diff before any row is touched (MStorageOnHand.add :821-822) - NO storage / reservation row is written in legacy; the twin writes none.
  function reserveStock(trx, o, ls) {
    var vol = Z, wt = Z;
    for (var i = 0; i < ls.length; i++) {
      var l = trx.get('dd_orderline', ls[i].dd_orderline_id) || ls[i];
      var ro = D(l.qtyordered).subtract(D(l.qtyreserved)).subtract(D(l.qtydelivered));                                                   // :865-867
      var p = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null;
      if (ro.signum() === 0) { if (p) { vol = vol.add(D(p.volume).multiply(D(l.qtyordered))); wt = wt.add(D(p.weight).multiply(D(l.qtyordered))); } continue; }   // :868-877
      if (p) {                                                                                                                           // :880-915
        if (BREAK !== 'noreserve') ML.saveEx(trx, 'dd_orderline', l, { qtyreserved: N(D(l.qtyreserved).add(ro)) });                       // :910-911 setQtyReserved + saveEx
        vol = vol.add(D(p.volume).multiply(D(l.qtyordered))); wt = wt.add(D(p.weight).multiply(D(l.qtyordered)));
      }
    }
    trx.update('dd_order', trx.get('dd_order', o.dd_order_id), { volume: N(vol), weight: N(wt) });                                       // :928-929 setVolume / setWeight (persisted by the caller's save)
    trx.say('§DDO reserveStock order=' + o.dd_order_id + ' lines=' + ls.length + ' volume=' + vol.toString() + ' weight=' + wt.toString());
  }

  // ══ MDDOrder DocAction ═══════════════════════════════════════════════════════════════════════════════════════
  var MDDOrder = {
    prepareIt: function (trx, o) {   // :783-852
      var m = fire(trx, 'BEFORE_PREPARE', 'dd_order', o); if (m) { T.msg(trx, m); return 'IN'; }
      var d = T.dt(trx, o.c_doctype_id); if (!d) { T.msg(trx, 'No Document Type (MDocType.get(C_DocType_ID=' + (o.c_doctype_id || 0) + ') is null - legacy NullPointerException)'); return 'IN'; }
      if (!T.periodOpen(trx, o.dateordered, d.docbasetype, o.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }                  // :791-796 (DateOrdered)
      var ls = lines(trx, o, ['m_product_id']); trx._ddLines = o.dd_order_id;
      if (!ls.length) { T.msg(trx, '@NoLines@'); return 'IN'; }                                                                          // :799-804
      if (o.deliveryrule === 'O') for (var i = 0; i < ls.length; i++) {                                                                  // :806-820 (DELIVERYRULE_CompleteOrder = O)
        var p0 = nz(ls[i].m_product_id) ? T.product(trx, ls[i].m_product_id) : null;
        if (p0 && Y(p0.isexcludeautodelivery)) { T.msg(trx, '@M_Product_ID@ ' + p0.value + ' @IsExcludeAutoDelivery@'); return 'IN'; }
      }
      var no = 0;                                                                                                                        // :822-836 mandatory product attribute set instance (MandatoryType='Y' AND ol.M_AttributeSetInstance_ID IS NULL)
      ls.forEach(function (l) { var p = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null; if (!p || !nz(p.m_attributeset_id)) return;
        var as = trx.get('m_attributeset', p.m_attributeset_id); if (as && as.mandatorytype === 'Y' && l.m_attributesetinstance_id == null) no++; });
      if (no) { T.msg(trx, '@LinesWithoutProductAttribute@ (' + no + ')'); return 'IN'; }
      reserveStock(trx, o, ls);                                                                                                          // :838
      m = fire(trx, 'AFTER_PREPARE', 'dd_order', trx.get('dd_order', o.dd_order_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = 'dd_order:' + o.dd_order_id;
      return 'IP';
    },
    completeIt: function (trx, o) {   // :960-1011
      if (o.docaction === 'PR') { setProcessed(trx, o, 'N'); return 'IP'; }                                                              // :965-970 just prepare
      if (trx._justPrepared !== 'dd_order:' + o.dd_order_id) { var st = MDDOrder.prepareIt(trx, o); if (st !== 'IP') return st; }        // :972-979 re-check
      trx._justPrepared = null;
      o = trx.get('dd_order', o.dd_order_id);
      var m = fire(trx, 'BEFORE_COMPLETE', 'dd_order', o); if (m) { T.msg(trx, m); return 'IN'; }                                       // :981-983
      if (!Y(o.isapproved)) trx.update('dd_order', o, { isapproved: 'Y' });                                                              // :985-987 approveIt
      m = fire(trx, 'AFTER_COMPLETE', 'dd_order', trx.get('dd_order', o.dd_order_id)); if (m) { T.msg(trx, m); return 'IN'; }            // :991-999
      setProcessed(trx, trx.get('dd_order', o.dd_order_id), 'Y');                                                                         // :1001
      trx.update('dd_order', trx.get('dd_order', o.dd_order_id), { docaction: 'CL' });                                                    // :1004 DOCACTION_Close
      return 'CO';
    },
    // :1013-1043 voidIt - VERBATIM: only the Voided descriptions are written; QtyOrdered stays, so reserveStock finds QtyOrdered-QtyReserved-QtyDelivered = 0 and un-reserves NOTHING (§DD-QUIRK-VOID).
    voidIt: function (trx, o) {
      var m = fire(trx, 'BEFORE_VOID', 'dd_order', o); if (m) { T.msg(trx, m); return false; }
      var voided = T.msgText(trx, 'Voided'), ls = lines(trx, o, ['m_product_id']); trx._ddLines = o.dd_order_id;
      ls.forEach(function (l) {
        var old = D(l.qtyordered);
        if (old.signum() !== 0) {
          T.addDescription(trx, 'dd_orderline', l, voided + ' (' + old.toString() + ')');                                               // :1023-1031 line.addDescription + saveEx
          if (BREAK === 'voidzero') trx.update('dd_orderline', l, { qtyordered: 0 });                                                    // negative control only: MOrder.voidIt behaviour
        }
      });
      T.addDescription(trx, 'dd_order', trx.get('dd_order', o.dd_order_id), voided);                                                     // :1032
      reserveStock(trx, o, lines(trx, o, ['m_product_id']));                                                                              // :1033-1034 "Clear Reservations"
      m = fire(trx, 'AFTER_VOID', 'dd_order', trx.get('dd_order', o.dd_order_id)); if (m) { T.msg(trx, m); return false; }
      var o2 = trx.get('dd_order', o.dd_order_id);
      setProcessed(trx, o2, 'Y'); trx.update('dd_order', o2, { docaction: '--', docstatus: 'VO' });                                       // :1040-1041 + DocumentEngine.voidIt -> STATUS_Voided
      return true;
    },
    closeIt: function (trx, o) {   // :1135-1171
      var m = fire(trx, 'BEFORE_CLOSE', 'dd_order', o); if (m) { T.msg(trx, m); return false; }
      var ls = lines(trx, o, ['m_product_id']); trx._ddLines = o.dd_order_id;
      ls.forEach(function (l) {
        var old = D(l.qtyordered);
        if (old.compareTo(D(l.qtydelivered)) !== 0) {                                                                                    // :1143-1155 cancel the not delivered quantity
          var p = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null, q = D(l.qtydelivered);
          if (p) q = q.setScale(uomPrecision(trx, p.c_uom_id), HU);                                                                      // setQtyOrdered rounds to the product UOM precision
          var r = ML.save(trx, 'dd_orderline', l, { qtyordered: N(q), description: l.description == null || l.description === '' ? 'Close (' + old.toString() + ')' : l.description + ' | Close (' + old.toString() + ')' }); if (!r.ok) throw new Error(r.error);
        }
      });
      reserveStock(trx, o, lines(trx, o, ['m_product_id']));                                                                              // :1157-1158 clear reservations
      var o2 = trx.get('dd_order', o.dd_order_id); setProcessed(trx, o2, 'Y'); trx.update('dd_order', o2, { docaction: '--' });           // :1160-1161
      m = fire(trx, 'AFTER_CLOSE', 'dd_order', trx.get('dd_order', o.dd_order_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('dd_order', trx.get('dd_order', o.dd_order_id), { docstatus: 'CL' });                                                    // DocumentEngine.closeIt -> STATUS_Closed
      return true;
    },
    reverseCorrectIt: function (trx, o) {   // :1173-1191 "same as void" (voidIt call :1186)
      var m = fire(trx, 'BEFORE_REVERSECORRECT', 'dd_order', o) || fire(trx, 'AFTER_REVERSECORRECT', 'dd_order', o); if (m) { T.msg(trx, m); return false; }
      if (!MDDOrder.voidIt(trx, o)) return false;
      trx.update('dd_order', trx.get('dd_order', o.dd_order_id), { docstatus: 'RE' });                                                    // DocumentEngine.reverseCorrectIt -> STATUS_Reversed
      return true;
    },
    reverseAccrualIt: function (trx, o) {   // :1193-1211 validators only, returns false
      var m = fire(trx, 'BEFORE_REVERSEACCRUAL', 'dd_order', o) || fire(trx, 'AFTER_REVERSEACCRUAL', 'dd_order', o); if (m) T.msg(trx, m); return false;
    },
    reActivateIt: function (trx, o) {   // :1213-1233
      var m = fire(trx, 'BEFORE_REACTIVATE', 'dd_order', o) || fire(trx, 'AFTER_REACTIVATE', 'dd_order', o); if (m) { T.msg(trx, m); return false; }
      var o2 = trx.get('dd_order', o.dd_order_id); trx.update('dd_order', o2, { docaction: 'CO' }); setProcessed(trx, trx.get('dd_order', o.dd_order_id), 'N');
      trx.update('dd_order', trx.get('dd_order', o.dd_order_id), { docstatus: 'IP' });                                                    // DocumentEngine.reActivateIt -> STATUS_InProgress
      return true;
    },
    approveIt: function (trx, o) { trx.update('dd_order', o, { isapproved: 'Y' }); return true; },     // :937
    rejectIt: function (trx, o) { trx.update('dd_order', o, { isapproved: 'N' }); return true; },      // :948
    getSummary: function (trx, o) {   // :1235-1245 - the line count shows once the lines were loaded (m_lines cached by prepare / complete / void / close)
      return (o.documentno || '') + (trx._ddLines === o.dd_order_id ? ' (#' + lines(trx, o).length + ')' : '') + (o.description ? ' - ' + o.description : '');
    }
  };
  ML.registerDocAction('dd_order', MDDOrder);

  return { MDDOrder: MDDOrder, reserveStock: reserveStock, lines: lines };
});
