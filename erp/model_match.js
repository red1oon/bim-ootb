// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_match.js — MMatchPO + MatchPOAutoMatch + MMatchInv, ported VERBATIM and registered into model_layer.js
// (bim-compiler prompts/ERP_MODEL_LAYER.md §CORE-P2P — Witness: W-MODEL-ORACLE m_matchpo / m_matchinv / c_orderline).
// Java root org.adempiere.base/src/org/compiere/model/ — one cite per block. Every write goes through ML.save (PO.save:
// beforeSave → validators → saveNew (DocumentNo) → afterSave), so the match rows land in the document's own op-group.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelMatch = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  function idOf(r, t) { return r ? r[t + '_id'] : 0; }
  function sameId(a, b) { return String(a == null ? 0 : a) === String(b == null ? 0 : b); }
  function pk(v) { return ML.isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v); }     // creation order (a new row sorts after every stored one)
  function later(a, b) { return String(a || '') > String(b || '') ? a : b; }
  var Rec = ML.PO;                                                                             // one PO handle (model_layer.js)
  function rec(trx, table, row) { return row ? new Rec(trx, table, row, null) : null; }

  // ══ MMatchInv ═════════════════════════════════════════════════════════════════════════════════════════════════
  function miGetInvoiceLine(trx, ilId) { return nz(ilId) ? trx.find('m_matchinv', { c_invoiceline_id: ilId }) : []; }                   // :79-89
  function miGetInOutLine(trx, iolId) { return nz(iolId) ? trx.find('m_matchinv', { m_inoutline_id: iolId }) : []; }                   // :440-452
  function miGet(trx, iolId, ilId) { return (nz(iolId) && nz(ilId)) ? trx.find('m_matchinv', { m_inoutline_id: iolId, c_invoiceline_id: ilId }) : []; }   // :55-68
  function miGetInOut(trx, ioId) { var ls = {}; trx.find('m_inoutline', { m_inout_id: ioId }).forEach(function (l) { ls[String(l.m_inoutline_id)] = 1; });   // :97-108
    return trx.find('m_matchinv', {}).filter(function (m) { return ls[String(m.m_inoutline_id)]; }); }
  function miGetInvoice(trx, invId) { var ls = {}; trx.find('c_invoiceline', { c_invoice_id: invId }).forEach(function (l) { ls[String(l.c_invoiceline_id)] = 1; });   // :116-127 (ORDER BY ProcessedOn)
    return trx.find('m_matchinv', {}).filter(function (m) { return ls[String(m.c_invoiceline_id)]; }).sort(function (a, b) { return Number(a.processedon || 0) - Number(b.processedon || 0); }); }
  // new MMatchInv(iLine, dateTrx, qty) :192-205 ∘ setInitialDefaults :175-180
  function newMatchInv(trx, iLine, dateTrx, qty) {
    return new Rec(trx, 'm_matchinv', null, ML.newPO(trx, 'm_matchinv', { m_attributesetinstance_id: iLine.m_attributesetinstance_id || 0, posted: 'N', processed: 'Y', processing: 'N',
      ad_client_id: iLine.ad_client_id, ad_org_id: iLine.ad_org_id, c_invoiceline_id: iLine.c_invoiceline_id, m_inoutline_id: iLine.m_inoutline_id,
      datetrx: dateTrx != null ? dateTrx : undefined, m_product_id: iLine.m_product_id, qty: N(D(qty)) }));
  }
  function miNewerDateAcct(trx, r) {                                                         // getNewerDateAcct :279-300
    var il = nz(r.c_invoiceline_id) ? trx.get('c_invoiceline', r.c_invoiceline_id) : null, inv = il ? trx.get('c_invoice', il.c_invoice_id) : null;
    var iol = nz(r.m_inoutline_id) ? trx.get('m_inoutline', r.m_inoutline_id) : null, io = iol ? trx.get('m_inout', iol.m_inout_id) : null;
    var invoiceDate = inv ? inv.dateacct : null, shipDate = io ? io.dateacct : null;
    if (invoiceDate == null) return shipDate; if (shipDate == null) return invoiceDate;
    return String(invoiceDate) > String(shipDate) ? invoiceDate : shipDate;
  }
  ML.registerModel('m_matchinv', {
    beforeSave: function (trx, r) {                                                          // :208-228
      if (r.datetrx == null) r.datetrx = trx.env.now;
      if (r.dateacct == null) { var ts = miNewerDateAcct(trx, r); if (ts == null) ts = r.datetrx; r.dateacct = ts; }
      if (!nz(r.m_attributesetinstance_id) && nz(r.m_inoutline_id)) { var iol = trx.get('m_inoutline', r.m_inoutline_id); r.m_attributesetinstance_id = iol ? (iol.m_attributesetinstance_id || 0) : 0; }
      return null;
    },
    afterSave: function (trx, r) {                                                           // :231-273 matched-qty validations
      if (nz(r.m_inoutline_id)) {
        var line = trx.get('m_inoutline', r.m_inoutline_id), mq = Z; miGetInOutLine(trx, r.m_inoutline_id).forEach(function (m) { mq = mq.add(D(m.qty)); });
        var mv = D(line.movementqty), mqDB = mq; if (mv.signum() < 0) { mv = mv.negate(); mq = mq.negate(); }
        if (mq.compareTo(mv) > 0) throw new Error('Total matched qty > movement qty. MatchedQty=' + mqDB + ', MovementQty=' + line.movementqty);
      }
      if (nz(r.c_invoiceline_id)) {
        var il = trx.get('c_invoiceline', r.c_invoiceline_id), q2 = Z; miGetInvoiceLine(trx, r.c_invoiceline_id).forEach(function (m) { q2 = q2.add(D(m.qty)); });
        var qi = D(il.qtyinvoiced), q2DB = q2; if (qi.signum() < 0) { qi = qi.negate(); q2 = q2.negate(); }
        if (q2.compareTo(qi) > 0) throw new Error('Total matched qty > invoiced qty. MatchedQty=' + q2DB + ', InvoicedQty=' + il.qtyinvoiced);
      }
      return null;
    }
  });

  // ══ MMatchPO — statics :65-284 ═══════════════════════════════════════════════════════════════════════════════════
  function mpoGetOrderLine(trx, olId) { return nz(olId) ? trx.find('m_matchpo', { c_orderline_id: olId }) : []; }
  function mpoGetIOL(trx, iolId) { return nz(iolId) ? trx.find('m_matchpo', { m_inoutline_id: iolId }) : []; }
  function mpoGetInvoice(trx, invId) { var ls = {}; trx.find('c_invoiceline', { c_invoice_id: invId }).forEach(function (l) { ls[String(l.c_invoiceline_id)] = 1; });
    return trx.find('m_matchpo', {}).filter(function (m) { return ls[String(m.c_invoiceline_id)]; }); }
  function mpoGetInOut(trx, ioId) { var ls = {}; trx.find('m_inoutline', { m_inout_id: ioId }).forEach(function (l) { ls[String(l.m_inoutline_id)] = 1; });
    return trx.find('m_matchpo', {}).filter(function (m) { return ls[String(m.m_inoutline_id)]; }); }
  function docStatusOfLine(trx, table, lineId) { var l = trx.get(table, lineId), h = l ? trx.get(table === 'm_inoutline' ? 'm_inout' : 'c_invoice', table === 'm_inoutline' ? l.m_inout_id : l.c_invoice_id) : null; return h ? h.docstatus : null; }
  function isCO(st) { return st === 'CO' || st === 'CL'; }
  // new MMatchPO(sLine, dateTrx, qty) :826-838 / (iLine, dateTrx, qty) :846-858 ∘ setInitialDefaults :813-818
  function newMatchPOFromShip(trx, sLine, dateTrx, qty) {
    return new Rec(trx, 'm_matchpo', null, ML.newPO(trx, 'm_matchpo', { m_attributesetinstance_id: sLine.m_attributesetinstance_id || 0, posted: 'N', processing: 'N', processed: 'Y',
      ad_client_id: sLine.ad_client_id, ad_org_id: sLine.ad_org_id, m_inoutline_id: sLine.m_inoutline_id, c_orderline_id: sLine.c_orderline_id,
      datetrx: dateTrx != null ? dateTrx : undefined, m_product_id: sLine.m_product_id, qty: N(D(qty)) }));
  }
  function newMatchPOFromInv(trx, iLine, dateTrx, qty) {
    var f = { m_attributesetinstance_id: iLine.m_attributesetinstance_id || 0, posted: 'N', processing: 'N', processed: 'Y', ad_client_id: iLine.ad_client_id, ad_org_id: iLine.ad_org_id,
      c_invoiceline_id: iLine.c_invoiceline_id, datetrx: dateTrx != null ? dateTrx : undefined, m_product_id: iLine.m_product_id, qty: N(D(qty)) };
    if (nz(iLine.c_orderline_id)) f.c_orderline_id = iLine.c_orderline_id;
    return new Rec(trx, 'm_matchpo', null, ML.newPO(trx, 'm_matchpo', f));
  }
  // createMatchInv(mpo, C_InvoiceLine_ID, M_InOutLine_ID, qty, dateTrx) :684-737 (savepoint → the Trx itself; a refused save returns null)
  function createMatchInv(trx, mpo, ilId, iolId, qty, dateTrx) {
    var mi = new Rec(trx, 'm_matchinv', null, ML.newPO(trx, 'm_matchinv', { m_attributesetinstance_id: 0, posted: 'N', processed: 'N', processing: 'N' }));
    mi.set('c_invoiceline_id', ilId).set('m_product_id', mpo.get('m_product_id')).set('m_inoutline_id', iolId).set('ad_client_id', mpo.get('ad_client_id'))
      .set('ad_org_id', mpo.get('ad_org_id')).set('m_attributesetinstance_id', mpo.get('m_attributesetinstance_id') || 0).set('qty', D(qty)).set('datetrx', dateTrx).set('processed', 'Y');
    try { if (!mi.save()) { trx.say('§MODEL-MATCH Failed to auto match invoice.'); return null; } }
    catch (e) { trx.say('§MODEL-MATCH Failed to auto match Invoice. ' + e.message); return null; }
    return mi;
  }
  function cnt(list, f) { return list.filter(f).length; }

  // ══ MMatchPO model hooks — beforeSave :936-1060, afterSave :1063-1185, beforeDelete :1215-1226, afterDelete :1229-1250 ═
  function mpoNewerDateAcct(trx, r) {                                                         // getNewerDateAcct :1187-1212
    var invoiceDate = null, shipDate = null;
    if (nz(r.c_invoiceline_id)) { var il = trx.get('c_invoiceline', r.c_invoiceline_id), inv = il ? trx.get('c_invoice', il.c_invoice_id) : null; invoiceDate = inv ? inv.dateacct : null; }
    if (nz(r.m_inoutline_id)) { var iol = trx.get('m_inoutline', r.m_inoutline_id), io = iol ? trx.get('m_inout', iol.m_inout_id) : null; shipDate = io ? io.dateacct : null; }
    if (invoiceDate == null) return shipDate; if (shipDate == null) return invoiceDate;
    return String(invoiceDate) > String(shipDate) ? invoiceDate : shipDate;
  }
  function invoicePriceActual(trx, r) {                                                       // getInvoicePriceActual :909-930
    var il = trx.get('c_invoiceline', r.c_invoiceline_id), inv = trx.get('c_invoice', il.c_invoice_id), ol = trx.get('c_orderline', r.c_orderline_id), o = trx.get('c_order', ol.c_order_id);
    var pa = D(il.priceactual);
    if (!sameId(inv.c_currency_id, o.c_currency_id)) {
      var rt = T.rate(trx, inv.c_currency_id, o.c_currency_id, inv.dateinvoiced, inv.c_conversiontype_id);
      if (!rt) throw new Error('ErrorConvertingCurrencyToBaseCurrency'); pa = pa.multiply(rt).setScale(T.precisionOf(trx, o.c_currency_id), HU);
    }
    return pa;
  }
  ML.registerModel('m_matchpo', {
    beforeSave: function (trx, r, newRecord, old) {
      if (r.datetrx == null) r.datetrx = trx.env.now;
      if (r.dateacct == null) { var ts = mpoNewerDateAcct(trx, r); if (ts == null) ts = r.datetrx; r.dateacct = ts; }
      if (!nz(r.m_attributesetinstance_id) && nz(r.m_inoutline_id)) { var iol0 = trx.get('m_inoutline', r.m_inoutline_id); r.m_attributesetinstance_id = iol0 ? (iol0.m_attributesetinstance_id || 0) : 0; }
      if (newRecord && !nz(r.c_invoiceline_id) && !nz(r.reversal_id)) {                     // :955-990 C_InvoiceLine_ID from MatchInv
        var mpi = miGetInOutLine(trx, r.m_inoutline_id);
        for (var i = 0; i < mpi.length; i++) {
          if (nz(mpi[i].c_invoiceline_id) && sameId(mpi[i].m_attributesetinstance_id, r.m_attributesetinstance_id)) {
            if (cnt(mpoGetIOL(trx, r.m_inoutline_id), function (m) { return sameId(m.c_invoiceline_id, mpi[i].c_invoiceline_id); }) > 0) continue;
            if (D(mpi[i].qty).compareTo(D(r.qty)) === 0) { r.c_invoiceline_id = mpi[i].c_invoiceline_id; break; }
            var il = trx.get('c_invoiceline', mpi[i].c_invoiceline_id), match = newMatchPOFromInv(trx, il, r.datetrx, D(mpi[i].qty));
            match.set('c_orderline_id', r.c_orderline_id);
            if (!match.save()) throw new Error('Failed to create match po');
          }
        }
      }
      if (!nz(r.c_orderline_id)) {                                                            // :992-1017 find order line
        var il2 = null;
        if (nz(r.c_invoiceline_id)) { il2 = trx.get('c_invoiceline', r.c_invoiceline_id); if (nz(il2.c_orderline_id)) r.c_orderline_id = il2.c_orderline_id; }
        if (!nz(r.c_orderline_id) && nz(r.m_inoutline_id)) {
          var iol2 = trx.get('m_inoutline', r.m_inoutline_id);
          if (nz(iol2.c_orderline_id)) { r.c_orderline_id = iol2.c_orderline_id; if (il2) { var rr = ML.save(trx, 'c_invoiceline', il2, { c_orderline_id: iol2.c_orderline_id }); if (!rr.ok) throw new Error(rr.error); } }
        }
      }
      var changed = function (c) { return newRecord || !old || !sameId(old[c], r[c]); };
      if (nz(r.c_orderline_id) && nz(r.c_invoiceline_id) && (newRecord || changed('c_orderline_id') || changed('c_invoiceline_id'))) {   // :1020-1059 PriceMatchDifference
        var ol = trx.get('c_orderline', r.c_orderline_id), poPrice = D(ol.priceactual), invPrice = invoicePriceActual(trx, r), difference = poPrice.subtract(invPrice);
        if (difference.signum() !== 0) {
          difference = difference.multiply(D(r.qty)); r.pricematchdifference = N(difference);
          var bp = trx.get('c_bpartner', ol.c_bpartner_id), grp = bp ? trx.get('c_bp_group', bp.c_bp_group_id) : null, mt = grp && grp.pricematchtolerance != null ? D(grp.pricematchtolerance) : null;
          if (mt != null && mt.signum() !== 0) {
            var maxTol = poPrice.multiply(D(r.qty)).multiply(mt).abs().divide(D(100), 2, HU);
            r.isapproved = difference.abs().compareTo(maxTol) <= 0 ? 'Y' : 'N';
          }
        } else { r.pricematchdifference = N(difference); r.isapproved = 'Y'; }
        if (nz(r.m_inoutline_id) && nz(r.c_invoiceline_id) && miGet(trx, r.m_inoutline_id, r.c_invoiceline_id).length <= 0)
          throw new Error('[MatchPO] Missing corresponding invoice matching record for invoice line ' + r.c_invoiceline_id + ' and receipt line ' + r.m_inoutline_id);
      }
      return null;
    },
    afterSave: function (trx, r, newRecord, old) {
      var sumW = function (w, f) { var s = Z; trx.find('m_matchpo', w).filter(f || function () { return true; }).forEach(function (m) { s = s.add(D(m.qty)); }); return s; };
      if (nz(r.m_inoutline_id)) {                                                             // :1068-1077
        var line = trx.get('m_inoutline', r.m_inoutline_id), mq = sumW({ m_inoutline_id: r.m_inoutline_id });
        if (D(line.movementqty).signum() > 0 && mq.compareTo(D(line.movementqty)) > 0) throw new Error('Total matched qty > movement qty. MatchedQty=' + mq + ', MovementQty=' + line.movementqty);
      }
      if (nz(r.c_invoiceline_id)) {                                                           // :1080-1088
        var il = trx.get('c_invoiceline', r.c_invoiceline_id), mq2 = sumW({ c_invoiceline_id: r.c_invoiceline_id }, function (m) { return !nz(m.reversal_id); });
        if (mq2.compareTo(D(il.qtyinvoiced)) > 0) throw new Error('Total matched qty > invoiced qty. MatchedQty=' + mq2 + ', InvoicedQty=' + il.qtyinvoiced);
      }
      if (nz(r.c_orderline_id)) {                                                             // :1091-1125 VALIDATE_MATCHING_TO_ORDERED_QTY (SysConfig default true)
        var sc = null; try { sc = trx.q("SELECT value FROM ad_sysconfig WHERE name='VALIDATE_MATCHING_TO_ORDERED_QTY' AND ad_client_id IN (0,?) AND isactive='Y' ORDER BY ad_client_id DESC", [trx.env.client])[0]; } catch (e) {}
        if (!sc || sc.value === 'Y' || sc.value === 'true') {
          var oline = trx.get('c_orderline', r.c_orderline_id), qo = D(oline.qtyordered);
          var inv = sumW({ c_orderline_id: r.c_orderline_id }, function (m) { return nz(m.c_invoiceline_id) && !nz(m.reversal_id); });
          if ((qo.signum() > 0 && inv.compareTo(qo) > 0) || (qo.signum() < 0 && inv.compareTo(qo) < 0)) throw new Error('Total matched invoiced qty > ordered qty. MatchedInvoicedQty=' + inv + ', OrderedQty=' + qo);
          var dlv = sumW({ c_orderline_id: r.c_orderline_id }, function (m) { return nz(m.m_inoutline_id) && !nz(m.reversal_id); });
          if ((qo.signum() > 0 && dlv.compareTo(qo) > 0) || (qo.signum() < 0 && dlv.compareTo(qo) < 0)) throw new Error('Total matched delivered qty > ordered qty. MatchedDeliveredQty=' + dlv + ', OrderedQty=' + qo);
        }
      }
      if (nz(r.c_orderline_id)) {                                                             // :1129-1180 Purchase Order Delivered/Invoiced
        var orderLine = trx.get('c_orderline', r.c_orderline_id), ch = {};
        var qd = D(orderLine.qtydelivered), qiv = D(orderLine.qtyinvoiced);
        var ioChange = newRecord ? nz(r.m_inoutline_id) : !sameId(old && old.m_inoutline_id, r.m_inoutline_id);   // m_isInOutLineChange
        var ilChange = newRecord ? nz(r.c_invoiceline_id) : !sameId(old && old.c_invoiceline_id, r.c_invoiceline_id);
        var qtyChanged = !newRecord && old && D(old.qty).compareTo(D(r.qty)) !== 0;
        if (ioChange && (newRecord || !sameId(r.m_inoutline_id, old && old.m_inoutline_id))) {
          if (nz(r.m_inoutline_id)) qd = qd.add(D(r.qty)); else if (!newRecord) qd = qd.subtract(D(r.qty));
          ch.qtydelivered = N(qd); ch.datedelivered = r.datetrx;
        } else if (!newRecord && nz(r.m_inoutline_id) && qtyChanged) { qd = qd.subtract(D(old.qty).subtract(D(r.qty))); ch.qtydelivered = N(qd); }
        if (ilChange && (newRecord || !sameId(r.c_invoiceline_id, old && old.c_invoiceline_id))) {
          if (nz(r.c_invoiceline_id)) qiv = qiv.add(D(r.qty)); else if (!newRecord) qiv = qiv.subtract(D(r.qty));
          ch.qtyinvoiced = N(qiv); ch.dateinvoiced = r.datetrx;
        } else if (!newRecord && nz(r.c_invoiceline_id) && qtyChanged) { qiv = qiv.subtract(D(old.qty).subtract(D(r.qty))); ch.qtyinvoiced = N(qiv); }
        if (!nz(orderLine.m_attributesetinstance_id) && nz(r.m_inoutline_id)) {
          var iol = trx.get('m_inoutline', r.m_inoutline_id); if (D(iol.movementqty).compareTo(D(orderLine.qtyordered)) === 0) ch.m_attributesetinstance_id = iol.m_attributesetinstance_id || 0;
        }
        var sv = ML.save(trx, 'c_orderline', orderLine, ch); if (!sv.ok) return sv.error;   // orderLine.save()
      }
      return null;
    },
    afterDelete: function (trx, r) {                                                          // :1229-1250
      if (nz(r.c_orderline_id)) { var ol = trx.get('c_orderline', r.c_orderline_id), ch = {};
        if (nz(r.m_inoutline_id)) ch.qtydelivered = N(D(ol.qtydelivered).subtract(D(r.qty)));
        if (nz(r.c_invoiceline_id)) ch.qtyinvoiced = N(D(ol.qtyinvoiced).subtract(D(r.qty)));
        var sv = ML.save(trx, 'c_orderline', ol, ch); if (!sv.ok) return sv.error; }
      return null;
    }
  });
  ML.registerModel('m_matchinv', { afterDelete: function (trx, r) {                          // MMatchInv.afterDelete :311-320 → deleteMatchInvCostDetail :363-387
    trx.find('m_costdetail', { m_matchinv_id: r.m_matchinv_id, m_attributesetinstance_id: r.m_attributesetinstance_id || 0 }).forEach(function (cd) {
      if (Y(cd.processed)) throw new Error('Cannot delete processed cost detail'); trx.del('m_costdetail', cd); });   // MCostDetail.beforeDelete :1282 (!processed)
    return null; } });

  // beforeDelete — MMatchPO :1215-1226 / MMatchInv :296-305: posted → testPeriodOpen(DateTrx) + MFactAcct.deleteEx (backs up to T_Fact_Acct_History)
  function factDeleteEx(trx, tableId, recordId) {                                             // MFactAcct.deleteEx :74-96
    var rows = trx.find('fact_acct', { ad_table_id: tableId, record_id: recordId }), hasHist = true;
    try { trx.q('SELECT 1 FROM t_fact_acct_history LIMIT 1'); } catch (e) { hasHist = false; }
    rows.forEach(function (f) { if (hasHist) trx.insert('t_fact_acct_history', Object.assign({}, f)); trx.del('fact_acct', f); });
    return rows.length;
  }
  function matchBeforeDelete(table, tableId, dbt) {
    return function (trx, r) {
      if (Y(r.posted)) {
        if (!T.periodOpen(trx, r.datetrx, dbt)) return '@PeriodClosed@';
        trx.update(table, r, { posted: 'N' });
        factDeleteEx(trx, tableId, r[table + '_id']);
      }
      return null;
    };
  }
  ML.registerModel('m_matchpo', { beforeDelete: matchBeforeDelete('m_matchpo', 473, 'MXP') });
  ML.registerModel('m_matchinv', { beforeDelete: matchBeforeDelete('m_matchinv', 472, 'MXI') });

  // ══ MatchPOAutoMatch.getNotMatchedMatchPOList :43-140 ══════════════════════════════════════════════════════════════
  function getNotMatchedMatchPOList(trx, olId) {
    var notMatched = [], creditMemo = [];
    mpoGetOrderLine(trx, olId).forEach(function (mpo) {
      if (!nz(mpo.reversal_id) && !nz(mpo.ref_matchpo_id)) {
        if (D(mpo.qty).signum() < 0 && nz(mpo.c_invoiceline_id) && !nz(mpo.m_inoutline_id) && isCO(docStatusOfLine(trx, 'c_invoiceline', mpo.c_invoiceline_id))) { creditMemo.push(mpo); return; }
        notMatched.push(mpo);
      }
    });
    notMatched.sort(function (a, b) { return pk(a.m_matchpo_id) - pk(b.m_matchpo_id); });
    if (creditMemo.length) {
      var totalNotMatchingCM = Z;
      creditMemo.forEach(function (cm) {
        var found = false, il = trx.get('c_invoiceline', cm.c_invoiceline_id), ref = il ? il.ref_invoiceline_id : null;
        if (nz(ref)) for (var i = 0; i < notMatched.length; i++) { var m = notMatched[i];
          if (!Y(m.posted) && sameId(m.c_invoiceline_id, ref) && !nz(m.m_inoutline_id) && D(m.qty).compareTo(D(cm.qty).negate()) === 0) { notMatched.splice(i, 1); found = true; break; } }
        if (found) return;
        for (var j = 0; j < notMatched.length; j++) { var n = notMatched[j];
          if (!Y(n.posted) && nz(n.c_invoiceline_id) && !nz(n.m_inoutline_id) && D(n.qty).compareTo(D(cm.qty).negate()) === 0) { notMatched.splice(j, 1); found = true; break; } }
        if (!found) totalNotMatchingCM = totalNotMatchingCM.add(D(cm.qty).negate());
      });
      if (totalNotMatchingCM.signum() !== 0) {
        var totalInv = Z; notMatched.forEach(function (m) { if (!Y(m.posted) && nz(m.c_invoiceline_id) && !nz(m.m_inoutline_id)) totalInv = totalInv.add(D(m.qty)); });
        if (totalNotMatchingCM.compareTo(totalInv) === 0) notMatched = [];
      }
    }
    return notMatched;
  }
  // MatchPOAutoMatch.match :142-372 — pairs completed AP credit-memo match rows with invoice match rows of the same order line
  function autoMatch(trx, olId, currentPO) {
    var notMatched = [], creditMemo = [], matched = [];
    mpoGetOrderLine(trx, olId).forEach(function (mpo) {
      if (!nz(mpo.reversal_id) && !nz(mpo.ref_matchpo_id)) {
        if (D(mpo.qty).signum() < 0) {
          if (nz(mpo.c_invoiceline_id) && !nz(mpo.m_inoutline_id)) { var st = docStatusOfLine(trx, 'c_invoiceline', mpo.c_invoiceline_id);
            if ((currentPO && sameId(mpo.m_matchpo_id, currentPO.id())) || isCO(st)) creditMemo.push(mpo); }
          return;
        }
        notMatched.push(mpo);
      }
    });
    notMatched.sort(function (a, b) { return pk(a.m_matchpo_id) - pk(b.m_matchpo_id); });
    // the three pairing branches (:183-262 / :272-355), shared by the Ref_InvoiceLine pass and the general pass
    function pair(mPO, cmPO, creditMemoQty) {
      var mr = rec(trx, 'm_matchpo', mPO), cr = rec(trx, 'm_matchpo', cmPO), po, mi1, mi2, il;
      if (D(mPO.qty).compareTo(creditMemoQty) > 0) {
        mr.set('qty', D(mPO.qty).subtract(creditMemoQty)); mr.saveEx();
        il = trx.get('c_invoiceline', mPO.c_invoiceline_id); po = newMatchPOFromInv(trx, il, trx.get('c_invoice', il.c_invoice_id).dateinvoiced, creditMemoQty);
        po.set('c_orderline_id', olId).set('ref_matchpo_id', cmPO.m_matchpo_id).set('posted', 'Y'); po.saveEx();
        cr.set('ref_matchpo_id', po.id()).set('posted', 'Y'); cr.saveEx();
        mi1 = createMatchInv(trx, po, po.get('c_invoiceline_id'), po.get('m_inoutline_id'), D(po.get('qty')), po.get('datetrx'));
        mi2 = createMatchInv(trx, cr, cr.get('c_invoiceline_id'), cr.get('m_inoutline_id'), D(cr.get('qty')), cr.get('datetrx'));
        if (!mi1 || !mi2) return null;
        mi1.set('ref_matchinv_id', mi2.id()); mi1.saveEx(); mi2.set('ref_matchinv_id', mi1.id()); mi2.saveEx();
        matched.push(po.row); return creditMemoQty.subtract(D(po.get('qty')));
      } else if (D(mPO.qty).compareTo(creditMemoQty) === 0) {
        mr.set('ref_matchpo_id', cmPO.m_matchpo_id).set('posted', 'Y'); mr.saveEx();
        cr.set('ref_matchpo_id', mr.id()).set('posted', 'Y'); cr.saveEx();
        mi1 = createMatchInv(trx, mr, mr.get('c_invoiceline_id'), mr.get('m_inoutline_id'), D(mr.get('qty')), mr.get('datetrx'));
        mi2 = createMatchInv(trx, cr, cr.get('c_invoiceline_id'), cr.get('m_inoutline_id'), D(cr.get('qty')), cr.get('datetrx'));
        if (!mi1 || !mi2) return null;
        mi1.set('ref_matchinv_id', mi2.id()); mi1.saveEx(); mi2.set('ref_matchinv_id', mi1.id()); mi2.saveEx();
        matched.push(mPO); return creditMemoQty.subtract(D(mPO.qty));
      } else {
        cr.set('qty', D(cmPO.qty).add(D(mPO.qty))); cr.saveEx();
        il = trx.get('c_invoiceline', cmPO.c_invoiceline_id); po = newMatchPOFromInv(trx, il, trx.get('c_invoice', il.c_invoice_id).dateinvoiced, D(mPO.qty).negate());
        po.set('c_orderline_id', olId).set('ref_matchpo_id', mPO.m_matchpo_id).set('posted', 'Y'); po.saveEx();
        mr.set('ref_matchpo_id', po.id()).set('posted', 'Y'); mr.saveEx();
        mi1 = createMatchInv(trx, po, po.get('c_invoiceline_id'), po.get('m_inoutline_id'), D(po.get('qty')), po.get('datetrx'));
        mi2 = createMatchInv(trx, mr, mr.get('c_invoiceline_id'), mr.get('m_inoutline_id'), D(mr.get('qty')), mr.get('datetrx'));
        if (!mi1 || !mi2) return null;
        mi1.set('ref_matchinv_id', mi2.id()); mi1.saveEx(); mi2.set('ref_matchinv_id', mi1.id()); mi2.saveEx();
        matched.push(mPO); return creditMemoQty.subtract(D(mPO.qty));
      }
    }
    creditMemo.forEach(function (cmPO) {
      var creditMemoQty = D(cmPO.qty).negate(), il = trx.get('c_invoiceline', cmPO.c_invoiceline_id), ref = il ? il.ref_invoiceline_id : null, r;
      if (nz(ref)) {
        for (var i = 0; i < notMatched.length; i++) { var m = notMatched[i];
          if (!Y(m.posted) && sameId(m.c_invoiceline_id, ref) && !nz(m.m_inoutline_id)) { r = pair(m, cmPO, creditMemoQty); if (r == null) break; creditMemoQty = r; }
          if (creditMemoQty.signum() === 0) break; }
        matched.forEach(function (x) { var k = notMatched.indexOf(x); if (k >= 0) notMatched.splice(k, 1); });
      }
      if (creditMemoQty.signum() === 0) return;
      for (var j = 0; j < notMatched.length; j++) { var n = notMatched[j];
        if (!Y(n.posted) && nz(n.c_invoiceline_id) && !nz(n.m_inoutline_id)) { r = pair(n, cmPO, creditMemoQty); if (r == null) break; creditMemoQty = r; }
        if (creditMemoQty.signum() === 0) break; }
      matched.forEach(function (x) { var k = notMatched.indexOf(x); if (k >= 0) notMatched.splice(k, 1); });
    });
    if (currentPO) creditMemo.forEach(function (cm) {                                       // :361-370
      if (sameId(cm.m_matchpo_id, currentPO.id())) { var live = trx.get('m_matchpo', cm.m_matchpo_id); if (!nz(live.reversal_id) && !nz(live.ref_matchpo_id)) throw new Error('Failed to find the corresponding invoice matched po'); } });
  }

  // ══ MMatchPO.create(iLine, sLine, dateTrx, qty) :294-353 ════════════════════════════════════════════════════════
  function create(trx, iLine, sLine, dateTrx, qty) {
    qty = D(qty); var olId = 0;
    if (iLine) olId = iLine.c_orderline_id; if (sLine) olId = sLine.c_orderline_id;
    if (nz(olId)) return create2(trx, iLine, sLine, olId, dateTrx, qty);
    if (sLine && iLine) {
      var mps = mpoGetIOL(trx, sLine.m_inoutline_id);
      for (var i = 0; i < mps.length; i++) {
        var ol = trx.get('c_orderline', mps[i].c_orderline_id), toInvoice = D(ol.qtyordered).subtract(D(ol.qtyinvoiced));
        if (toInvoice.signum() <= 0) continue;
        var matchQty = qty; if (matchQty.compareTo(toInvoice) > 0) matchQty = toInvoice;
        if (matchQty.signum() <= 0) continue;
        var nm = create2(trx, iLine, sLine, mps[i].c_orderline_id, dateTrx, matchQty);
        if (!nm.save()) throw new Error('Failed to update match po.');
        qty = qty.subtract(matchQty); if (qty.signum() <= 0) return nm;
      }
    }
    return null;
  }
  // MMatchPO.create(ctx, iLine, sLine, C_OrderLine_ID, dateTrx, qty) :366-676 — update or create (with MatchInv when both sides exist)
  function create2(trx, iLine, sLine, olId, dateTrx, qty) {
    var retValue = null, list = getNotMatchedMatchPOList(trx, olId);
    for (var i = 0; i < list.length; i++) {
      var mpo = rec(trx, 'm_matchpo', list[i]);
      if (qty.compareTo(D(mpo.get('qty'))) >= 0) {
        var toMatch = qty, matchQty = D(mpo.get('qty')); if (toMatch.compareTo(matchQty) > 0) toMatch = matchQty;
        if (iLine) {
          if (!nz(mpo.get('c_invoiceline_id')) || sameId(mpo.get('c_invoiceline_id'), iLine.c_invoiceline_id)) {
            if (nz(iLine.m_attributesetinstance_id)) { if (!nz(mpo.get('m_attributesetinstance_id'))) mpo.set('m_attributesetinstance_id', iLine.m_attributesetinstance_id); else if (!sameId(mpo.get('m_attributesetinstance_id'), iLine.m_attributesetinstance_id)) continue; }
          } else continue;
        }
        if (sLine) {
          if (!nz(mpo.get('m_inoutline_id')) || sameId(mpo.get('m_inoutline_id'), sLine.m_inoutline_id)) {
            if (nz(sLine.m_attributesetinstance_id)) { if (!nz(mpo.get('m_attributesetinstance_id'))) mpo.set('m_attributesetinstance_id', sLine.m_attributesetinstance_id); else if (!sameId(mpo.get('m_attributesetinstance_id'), sLine.m_attributesetinstance_id)) continue; }
          } else continue;
          if (!iLine && Y(mpo.get('posted'))) continue;
        }
        if (iLine && !sLine && !nz(mpo.get('c_invoiceline_id'))) {                            // :418-425 matchinv for another invoice
          if (cnt(miGetInOutLine(trx, mpo.get('m_inoutline_id')), function (m) { return !sameId(m.c_invoiceline_id, iLine.c_invoiceline_id) && !nz(m.reversal_id); }) > 0) continue;
        }
        if ((iLine || nz(mpo.get('c_invoiceline_id'))) && (sLine || nz(mpo.get('m_inoutline_id')))) {   // :426-447
          var iolId = sLine ? sLine.m_inoutline_id : mpo.get('m_inoutline_id'), ilId = iLine ? iLine.c_invoiceline_id : mpo.get('c_invoiceline_id');
          var tmp = trx.get('c_invoiceline', ilId), tmpIol = tmp ? tmp.m_inoutline_id : 0;
          if (nz(tmpIol) && !sameId(tmpIol, iolId)) continue;
          if (miGet(trx, iolId, ilId).length <= 0) { var mi = createMatchInv(trx, mpo, ilId, iolId, D(mpo.get('qty')), dateTrx); if (mi == null) continue; mpo.matchInvCreated = mi; }
        }
        if (iLine) mpo.set('c_invoiceline_id', iLine.c_invoiceline_id);
        if (sLine) { mpo.set('m_inoutline_id', sLine.m_inoutline_id); if (!Y(mpo.get('posted'))) mpo.set('dateacct', trx.get('m_inout', sLine.m_inout_id).dateacct); }
        if (!mpo.save()) throw new Error('Failed to update match po.');
        qty = qty.subtract(toMatch);
        if (qty.signum() <= 0) { retValue = mpo; break; }
      }
    }
    if (retValue == null) {                                                                   // Create New :478-660
      var sLineMatchedQty = null;
      if (sLine && iLine) { var s0 = null; mpoGetOrderLine(trx, olId).forEach(function (m) { if (sameId(m.m_inoutline_id, sLine.m_inoutline_id)) s0 = (s0 || Z).add(D(m.qty)); }); sLineMatchedQty = s0; }
      if (sLine && (sameId(sLine.c_orderline_id, olId) || !iLine) && (sLineMatchedQty == null || sLineMatchedQty.signum() <= 0)) {
        if (qty.signum() !== 0) {
          retValue = newMatchPOFromShip(trx, sLine, dateTrx, qty); retValue.set('c_orderline_id', olId);
          var other = null;
          if (!iLine) {
            var mps = mpoGetOrderLine(trx, sLine.c_orderline_id);
            for (var j = 0; j < mps.length; j++) { var m = mps[j];
              if (nz(m.c_invoiceline_id) && !nz(m.m_inoutline_id) && !nz(m.reversal_id) && D(m.qty).compareTo(qty) >= 0) {
                if (cnt(miGetInOutLine(trx, sLine.m_inoutline_id), function (x) { return sameId(x.c_invoiceline_id, m.c_invoiceline_id) && D(x.qty).compareTo(qty) !== 0; }) <= 0) {
                  if (!Y(m.posted) && D(m.qty).compareTo(qty) >= 0) {
                    other = rec(trx, 'm_matchpo', m); iLine = trx.get('c_invoiceline', m.c_invoiceline_id);
                    other.set('qty', D(m.qty).subtract(qty)); other.saveEx(); break;
                  }
                }
              }
            }
          }
          if (iLine) {
            if (other == null) retValue.set('c_invoiceline_id', iLine.c_invoiceline_id);
            if (other != null) {                                                              // auto create matchinv
              if (miGet(trx, sLine.m_inoutline_id, other.get('c_invoiceline_id')).length <= 0) {
                var mi2 = createMatchInv(trx, retValue, other.get('c_invoiceline_id'), sLine.m_inoutline_id, qty, dateTrx);
                if (mi2 == null) throw new Error('Failed to create match inv.');
                retValue.matchInvCreated = mi2;
              }
              if (D(other.get('qty')).signum() === 0) { var rm = ML.remove(trx, 'm_matchpo', other.row); if (!rm.ok) throw new Error(rm.error); }
            }
          }
          if (!retValue.save()) throw new Error('Failed to update match po.');
        }
      } else if (iLine) {
        if (qty.signum() !== 0) {
          retValue = newMatchPOFromInv(trx, iLine, dateTrx, qty); retValue.set('c_orderline_id', olId);
          if (!retValue.save()) throw new Error('Failed to update match po.');
          var noInvLines = {}, invMatched = {}, noInvList = [];                               // :577-660 auto create m_matchinv
          mpoGetOrderLine(trx, olId).forEach(function (m) {
            if (sameId(m.m_matchpo_id, retValue.id())) return;
            if (nz(m.m_inoutline_id) && !nz(m.reversal_id) && !nz(m.ref_matchpo_id)) {
              if (!nz(m.c_invoiceline_id)) { if (isCO(docStatusOfLine(trx, 'm_inoutline', m.m_inoutline_id))) { noInvLines[String(m.m_matchpo_id)] = [D(m.qty)]; noInvList.push(m); } }
              else (invMatched[String(m.m_inoutline_id)] = invMatched[String(m.m_inoutline_id)] || []).push(m);
            }
          });
          noInvList.sort(function (a, b) { return pk(a.m_matchpo_id) - pk(b.m_matchpo_id); });
          noInvList.forEach(function (m) {
            var holder = noInvLines[String(m.m_matchpo_id)], mInv = invMatched[String(m.m_inoutline_id)];
            miGetInOutLine(trx, m.m_inoutline_id).forEach(function (x) {
              if (nz(x.reversal_id)) return;
              var already = Z; (mInv || []).forEach(function (y) { if (sameId(y.c_invoiceline_id, x.c_invoiceline_id)) already = already.add(D(y.qty)); });
              var balance = D(x.qty).subtract(already);
              if (balance.signum() > 0 && isCO(docStatusOfLine(trx, 'c_invoiceline', x.c_invoiceline_id))) holder[0] = holder[0].subtract(balance);
            });
          });
          var toMatch2 = D(retValue.get('qty'));
          for (var k = 0; k < noInvList.length; k++) {
            var mm = noInvList[k], h = noInvLines[String(mm.m_matchpo_id)];
            if (h[0].signum() > 0) {
              var auto = null; if (h[0].compareTo(toMatch2) >= 0) { auto = toMatch2; toMatch2 = Z; } else { auto = h[0]; toMatch2 = toMatch2.subtract(auto); }
              if (auto != null && auto.signum() > 0 && miGet(trx, mm.m_inoutline_id, retValue.get('c_invoiceline_id')).length === 0) {
                var mi3 = createMatchInv(trx, retValue, retValue.get('c_invoiceline_id'), mm.m_inoutline_id, auto, dateTrx); retValue.matchInvCreated = mi3; if (mi3 == null) break;
              }
            }
            if (toMatch2.signum() <= 0) break;
          }
        }
      }
    }
    if (nz(olId) && retValue != null) autoMatch(trx, olId, retValue);                        // :670-671
    return retValue;
  }

  return { factDeleteEx: factDeleteEx, create: create, createMatchInv: createMatchInv, getNotMatchedMatchPOList: getNotMatchedMatchPOList, autoMatch: autoMatch, newMatchInv: newMatchInv,
    newMatchPOFromShip: newMatchPOFromShip, newMatchPOFromInv: newMatchPOFromInv, mpoGetOrderLine: mpoGetOrderLine, mpoGetInOut: mpoGetInOut, mpoGetInvoice: mpoGetInvoice,
    miGetInvoiceLine: miGetInvoiceLine, miGetInOutLine: miGetInOutLine, miGet: miGet, miGetInOut: miGetInOut, miGetInvoice: miGetInvoice, Rec: Rec, rec: rec };
});
