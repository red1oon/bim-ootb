// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_cost.js — the iDempiere costing engine, ported VERBATIM and written through the model Trx (bim-compiler
// prompts/ERP_MODEL_LAYER.md §CORE-P2P — Witness: W-MODEL-ORACLE m_costdetail / m_cost / m_costhistory / m_costqueue).
// MCostElement.getCostingMethods · MCost (get, getCostInfo, add, setWeightedAverage(+Initial), getSeedCosts, getCost) ·
// MCostHistory (ctor, get by cost detail, get by date) · MCostQueue (get, getQueue, adjustQty, getCosts, setCosts) ·
// MCostDetail (createOrder / createInvoice / createShipment / createMatchInvoice / get* / beforeSave / process /
// processProduct). Java root org.adempiere.base/src/org/compiere/model/ — one cite per block. Money via BigDecimal.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelCost = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var CM = { AveragePO: 'A', Fifo: 'F', AverageInvoice: 'I', Lifo: 'L', StandardCosting: 'S', UserDefined: 'U', LastInvoice: 'i', LastPOPrice: 'p' };
  function day(ts) { return String(ts || '').slice(0, 10); }
  function cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }

  // ── MAcctSchema / MProduct helpers ───────────────────────────────────────────────────────────────────────────
  function costingPrecision(trx, as) { var c = trx.get('c_currency', as.c_currency_id) || {}; return c.costingprecision != null ? Number(c.costingprecision) : 4; }   // MAcctSchema.getCostingPrecision :565
  function pca(trx, p, as) { return trx.find('m_product_category_acct', { m_product_category_id: p.m_product_category_id, c_acctschema_id: as.c_acctschema_id })[0] || {}; }
  function costingLevel(trx, p, as) { var l = pca(trx, p, as).costinglevel; return l == null ? as.costinglevel : l; }        // MProduct.getCostingLevel
  function costingMethod(trx, p, as) { var m = pca(trx, p, as).costingmethod; return m == null ? as.costingmethod : m; }     // MProduct.getCostingMethod
  function levelKeys(trx, p, as, org, asi) {                                                                                  // MCostDetail.process :1320-1332 / MCost.getCost :114-123
    var L = costingLevel(trx, p, as);
    if (L === 'C') return { org: 0, asi: 0 }; if (L === 'O') return { org: org, asi: 0 }; if (L === 'B') return { org: 0, asi: asi };
    return { org: org, asi: asi };
  }

  // ══ MCostElement ════════════════════════════════════════════════════════════════════════════════════════════
  function getCostingMethods(trx) {                                                        // MCostElement.getCostingMethods :148-159
    return trx.q("SELECT * FROM m_costelement WHERE ad_client_id=? AND costelementtype='M' AND costingmethod IS NOT NULL AND isactive='Y' ORDER BY m_costelement_id", [trx.env.client]);
  }
  function getMaterialCostElement(trx, as, method) {                                        // MCostElement.getMaterialCostElement(as, CostingMethod) :89-107
    return trx.q("SELECT * FROM m_costelement WHERE ad_client_id=? AND costingmethod=? AND costelementtype='M' AND isactive='Y' ORDER BY ad_org_id", [trx.env.client, method])[0] || null;
  }
  var ce_ = {
    isAveragePO: function (ce) { return ce.costingmethod === CM.AveragePO; }, isAverageInvoice: function (ce) { return ce.costingmethod === CM.AverageInvoice; },
    isFifo: function (ce) { return ce.costingmethod === CM.Fifo; }, isLifo: function (ce) { return ce.costingmethod === CM.Lifo; },
    isLastInvoice: function (ce) { return ce.costingmethod === CM.LastInvoice; }, isLastPOPrice: function (ce) { return ce.costingmethod === CM.LastPOPrice; },
    isStandardCosting: function (ce) { return ce.costingmethod === CM.StandardCosting; }, isUserDefined: function (ce) { return ce.costingmethod === CM.UserDefined; },
    isCostingMethod: function (ce) { return ce.costelementtype === 'M' && ce.costingmethod != null; }   // :407-411
  };

  // ══ MCost — a record object (Java PO): fields as BigDecimal, save() writes through the Trx ════════════════════
  var COST_COLS = ['currentcostprice', 'currentqty', 'cumulatedamt', 'cumulatedqty', 'futurecostprice', 'currentcostpricell', 'percent'];
  function Cost(trx, row, isNew) {
    this.trx = trx; this.row = row; this.is_new = !!isNew; this.skipAvgQtyCheck = false;
    var s = this; COST_COLS.forEach(function (c) { s[c] = D(row[c]); });
  }
  Cost.prototype.save = function () {                                                       // PO.save of M_Cost
    var ch = {}, s = this; COST_COLS.forEach(function (c) { ch[c] = N(s[c]); });
    if (this.is_new) { this.row = this.trx.insert('m_cost', ML.newPO(this.trx, 'm_cost', Object.assign({}, this.row, ch))); this.is_new = false; }
    else this.trx.update('m_cost', this.row, ch);
    return true;
  };
  Cost.prototype.precision = function () { var as = this.trx.get('c_acctschema', this.row.c_acctschema_id); return as ? costingPrecision(this.trx, as) : 6; };   // getPrecision :1764-1770
  // MCost.add :1671-1690
  Cost.prototype.add = function (amt, qty) {
    if (!this.skipAvgQtyCheck) {
      var ce = this.trx.get('m_costelement', this.row.m_costelement_id) || {};
      if ((ce_.isAveragePO(ce) || ce_.isAverageInvoice(ce)) && this.currentqty.add(qty).signum() < 0)
        throw new Error('AverageCostingNegativeQtyException Product(ID)=' + this.row.m_product_id + ', Current Qty=' + this.currentqty + ', Trx Qty=' + qty + ', CostElement=' + ce.name);
    }
    this.cumulatedamt = this.cumulatedamt.add(amt); this.cumulatedqty = this.cumulatedqty.add(qty); this.currentqty = this.currentqty.add(qty);
  };
  // MCost.setWeightedAverage :1696-1741
  Cost.prototype.setWeightedAverage = function (amt, qty) {
    if (amt.signum() === 0 && qty.signum() === 0) return;
    if (amt.signum() !== 0 && qty.signum() !== 0 && amt.signum() !== qty.signum()) amt = amt.negate();
    if (qty.signum() === 0 && this.currentqty.signum() <= 0) throw new Error('AverageCostingZeroQtyException Product(ID)=' + this.row.m_product_id + ', Current Qty=' + this.currentqty + ', Trx Qty=' + qty);
    if (!this.skipAvgQtyCheck && this.currentqty.add(qty).signum() < 0) throw new Error('AverageCostingNegativeQtyException Product(ID)=' + this.row.m_product_id + ', Current Qty=' + this.currentqty + ', Trx Qty=' + qty);
    var sumQty = this.currentqty.add(qty);
    if (sumQty.signum() !== 0) {
      var oldSum = this.currentcostprice.multiply(this.currentqty), oldCost = oldSum.divide(sumQty, 12, HU), newCost = amt.divide(sumQty, 12, HU);
      var cost = oldCost.add(newCost), p2 = this.precision() * 2;
      if (cost.scale() > p2) cost = cost.setScale(p2, HU);
      this.currentcostprice = cost;
    }
    this.cumulatedamt = this.cumulatedamt.add(amt); this.cumulatedqty = this.cumulatedqty.add(qty); this.currentqty = this.currentqty.add(qty);
  };
  Cost.prototype.setWeightedAverageInitial = function (amtUnit) {                         // :1747-1755
    var cost = amtUnit, p2 = this.precision() * 2; if (cost.scale() > p2) cost = cost.setScale(p2, HU); this.currentcostprice = cost;
  };
  // MCost.get(ctx, client, org, product, costType, as, ce, asi) :1513-1525 (active only)
  function costGet(trx, org, productId, costTypeId, asId, ceId, asi) {
    return trx.find('m_cost', { ad_client_id: trx.env.client, ad_org_id: org, m_product_id: productId, m_costtype_id: costTypeId, c_acctschema_id: asId, m_costelement_id: ceId, m_attributesetinstance_id: asi })
      .filter(function (r) { return r.isactive !== 'N'; })[0] || null;
  }
  // MCost.get(product, asi, as, org, ce, trx) :1442-1455 — existing or NEW (unsaved; parent ctor :1653-1666 + setInitialDefaults :1625-1632)
  function getCost(trx, p, asi, as, org, ceId) {
    var r = costGet(trx, org, p.m_product_id, as.m_costtype_id, as.c_acctschema_id, ceId, asi);
    if (r) return new Cost(trx, r, false);
    return new Cost(trx, { ad_client_id: trx.env.client, ad_org_id: org, c_acctschema_id: as.c_acctschema_id, m_costtype_id: as.m_costtype_id, m_product_id: p.m_product_id,
      m_attributesetinstance_id: asi, m_costelement_id: ceId, currentcostprice: 0, futurecostprice: 0, currentqty: 0, cumulatedamt: 0, cumulatedqty: 0, isactive: 'Y' }, true);
  }

  // ══ MCostHistory — ctor :68-83, get by cost detail :95-155, get by date :157-245; ICostInfo = the New* columns ═══════
  function historyNew(cd, cost, ce) {
    return { m_attributesetinstance_id: cost.row.m_attributesetinstance_id, m_costdetail_id: cd.m_costdetail_id, dateacct: cd.dateacct, isbackdate: cd.isbackdate,
      backdateprocessedon: cd.backdateprocessedon, m_costelement_id: ce.m_costelement_id, m_costtype_id: cost.row.m_costtype_id, m_product_id: cost.row.m_product_id,
      ad_client_id: cost.row.ad_client_id, ad_org_id: cost.row.ad_org_id, oldqty: cost.currentqty, oldcostprice: cost.currentcostprice, oldcamt: cost.cumulatedamt, oldcqty: cost.cumulatedqty };
  }
  function hInfo(h) { return { currentqty: D(h.newqty), currentcostprice: D(h.newcostprice), cumulatedqty: D(h.newcqty), cumulatedamt: D(h.newcamt), _h: h }; }
  function histRows(trx, org, productId, costTypeId, asId, method, ceId, asi, extra) {
    // the JOIN M_CostDetail cd (Processed) / LEFT JOIN refcd / LEFT JOIN M_CostElement ce — evaluated over the Trx view
    return trx.find('m_costhistory', { ad_client_id: trx.env.client, ad_org_id: org, m_product_id: productId, m_costtype_id: costTypeId }).map(function (h) {
      var cd = trx.get('m_costdetail', h.m_costdetail_id); if (!cd) return null;
      var ref = nz(cd.ref_costdetail_id) ? trx.get('m_costdetail', cd.ref_costdetail_id) : null, ce = trx.get('m_costelement', h.m_costelement_id);
      return { h: h, cd: cd, ref: ref, ce: ce };
    }).filter(function (x) {
      return x && (String(x.h.m_attributesetinstance_id) === String(asi) || Number(x.h.m_attributesetinstance_id) === 0) && String(x.cd.c_acctschema_id) === String(asId)
        && (!x.ce || x.ce.costingmethod == null || x.ce.costingmethod === method) && (!(ceId > 0) || String(x.h.m_costelement_id) === String(ceId)) && (!extra || extra(x));
    });
  }
  function refKey(x) { return (x.ref ? day(x.ref.dateacct) : day(x.cd.dateacct)) === day(x.cd.dateacct) ? (nz(x.cd.ref_costdetail_id) ? x.cd.ref_costdetail_id : x.h.m_costdetail_id) : x.h.m_costdetail_id; }
  function historyByCd(trx, org, costTypeId, asId, method, ceId, asi, cd) {
    if (!cd) return null;
    var delta = isDelta(cd), list = histRows(trx, org, cd.m_product_id, costTypeId, asId, method, ceId, asi, function (x) {
      return (x.cd.processed === (delta ? 'N' : 'Y')) && (String(x.h.m_costdetail_id) === String(cd.m_costdetail_id) || String(x.h.m_costdetail_id) === String(cd.ref_costdetail_id)) && day(x.h.dateacct) === day(cd.dateacct);
    });
    list.sort(function (a, b) { return cmp(b.h.dateacct, a.h.dateacct) || (Number(refKey(b)) - Number(refKey(a))) || seqCmp(b.h.m_costhistory_id, a.h.m_costhistory_id); });
    return list.length ? hInfo(list[0].h) : null;
  }
  function seqCmp(a, b) { var na = ML.isNewId(a) ? 1e15 + Number(String(a).slice(5)) : Number(a), nb = ML.isNewId(b) ? 1e15 + Number(String(b).slice(5)) : Number(b); return na - nb; }
  function historyByDate(trx, org, productId, costTypeId, asId, method, ceId, asi, dateAcct) {
    if (dateAcct == null) return null;
    var base = histRows(trx, org, productId, costTypeId, asId, method, ceId, asi, function (x) { return x.cd.processed === 'Y'; });
    var le = base.filter(function (x) { return day(x.h.dateacct) <= day(dateAcct); }).sort(function (a, b) { return seqCmp(b.h.m_costhistory_id, a.h.m_costhistory_id); });
    var first = base.slice().sort(function (a, b) { return cmp(a.h.dateacct, b.h.dateacct) || (Number(refKey(a)) - Number(refKey(b))) || seqCmp(a.h.m_costhistory_id, b.h.m_costhistory_id); });
    var pick = le[0] || first[0]; if (!pick) return null;                                   // UNION ALL — the first row wins
    var info = hInfo(pick.h);
    if (day(pick.h.dateacct) > day(dateAcct)) info = { currentqty: D(pick.h.oldqty), currentcostprice: D(pick.h.oldcostprice), cumulatedqty: D(pick.h.oldcqty), cumulatedamt: D(pick.h.oldcamt), _h: pick.h };   // :226-231
    return info;
  }
  // MCost.getCostInfo :1542-1572
  function getCostInfo(trx, org, productId, costTypeId, asId, ceId, asi, dateAcct, costDetail) {
    var ce = trx.get('m_costelement', ceId) || {}, method = ce.costingmethod, history = null;
    if (costDetail) history = historyByCd(trx, org, costTypeId, asId, method, ceId, asi, costDetail);
    if (!history && dateAcct != null) history = historyByDate(trx, org, productId, costTypeId, asId, method, ceId, asi, dateAcct);
    if (history && method !== CM.StandardCosting) return history;
    var r = costGet(trx, org, productId, costTypeId, asId, ceId, asi), cost = r ? new Cost(trx, r, false) : null;
    if (history && method === CM.StandardCosting && cost) {
      cost.currentqty = history.currentqty; cost.cumulatedqty = history.cumulatedqty;
      if (costDetail && history.currentcostprice.compareTo(Z) !== 0) cost.currentcostprice = history.currentcostprice;
      if (costDetail && history.cumulatedamt.compareTo(Z) !== 0) cost.cumulatedamt = history.cumulatedamt;
    }
    return cost;
  }

  // ══ MCostQueue ════════════════════════════════════════════════════════════════════════════════════════════════
  function Queue(trx, row, isNew) { this.trx = trx; this.row = row; this.is_new = isNew; this.currentcostprice = D(row.currentcostprice); this.currentqty = D(row.currentqty); }
  Queue.prototype.save = function () {
    var ch = { currentcostprice: N(this.currentcostprice), currentqty: N(this.currentqty) };
    if (this.is_new) { this.row = this.trx.insert('m_costqueue', ML.newPO(this.trx, 'm_costqueue', Object.assign({}, this.row, ch))); this.is_new = false; } else this.trx.update('m_costqueue', this.row, ch);
    return true;
  };
  Queue.prototype.setCosts = function (amt, qty, precision) {                              // MCostQueue.setCosts :380-393
    var oldSum = this.currentcostprice.multiply(this.currentqty), sumAmt = oldSum.add(amt), sumQty = this.currentqty.add(qty);
    if (sumQty.signum() !== 0) this.currentcostprice = sumAmt.divide(sumQty, precision, HU);
    this.currentqty = this.currentqty.add(qty);
  };
  function queueGet(trx, p, asi, as, org, ceId) {                                          // MCostQueue.get :60-100
    var r = trx.find('m_costqueue', { ad_client_id: trx.env.client, ad_org_id: org, m_product_id: p.m_product_id, m_attributesetinstance_id: asi, m_costtype_id: as.m_costtype_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ceId })[0];
    if (r) return new Queue(trx, r, false);
    return new Queue(trx, { ad_client_id: trx.env.client, ad_org_id: org, c_acctschema_id: as.c_acctschema_id, m_costtype_id: as.m_costtype_id, m_product_id: p.m_product_id,
      m_attributesetinstance_id: asi, m_costelement_id: ceId, currentcostprice: 0, currentqty: 0, isactive: 'Y' }, true);
  }
  function getQueue(trx, p, asi, as, org, ce) {                                             // MCostQueue.getQueue :110-158
    var w = { ad_client_id: trx.env.client, ad_org_id: org, m_product_id: p.m_product_id, m_costtype_id: as.m_costtype_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ce.m_costelement_id };
    if (asi !== 0) w.m_attributesetinstance_id = asi;
    var fifo = ce_.isFifo(ce);
    return trx.find('m_costqueue', w).filter(function (r) { return D(r.currentqty).signum() !== 0; })
      .sort(function (a, b) { var d = Number(a.m_attributesetinstance_id) - Number(b.m_attributesetinstance_id); return fifo ? d : -d; })
      .map(function (r) { return new Queue(trx, r, false); });
  }
  function adjustQty(trx, p, asi, as, org, ce, qty) {                                       // MCostQueue.adjustQty :170-222
    if (qty.signum() === 0) return Z;
    var q = getQueue(trx, p, asi, as, org, ce), remaining = qty;
    for (var i = 0; i < q.length; i++) {
      var queue = q[i];
      if (remaining.signum() < 0) { queue.currentqty = queue.currentqty.subtract(remaining); queue.save(); return queue.currentcostprice; }
      if (queue.currentqty.signum() > 0) {
        var reduction = remaining; if (reduction.compareTo(queue.currentqty) > 0) reduction = queue.currentqty;
        queue.currentqty = queue.currentqty.subtract(reduction); queue.save(); remaining = remaining.subtract(reduction);
        if (remaining.signum() === 0) return queue.currentcostprice;
      }
    }
    return null;
  }
  function queueCosts(trx, p, asi, as, org, ce, qty) {                                      // MCostQueue.getCosts :230-300
    if (qty.signum() === 0) return Z;
    var q = getQueue(trx, p, asi, as, org, ce), cost = Z, remaining = qty, lastPrice = null;
    for (var i = 0; i < q.length; i++) {
      var queue = q[i];
      if (remaining.signum() <= 0) { lastPrice = queue.currentcostprice; return cost.add(lastPrice.multiply(remaining)); }
      if (queue.currentqty.signum() > 0) {
        var reduction = remaining; if (reduction.compareTo(queue.currentqty) > 0) reduction = queue.currentqty;
        lastPrice = queue.currentcostprice; cost = cost.add(lastPrice.multiply(reduction)); remaining = remaining.subtract(reduction);
        if (remaining.signum() === 0) return cost;
      }
    }
    if (lastPrice == null) { lastPrice = getSeedCosts(trx, p, asi, as, org, ce.costingmethod, 0); if (lastPrice == null) return null; }
    return cost.add(lastPrice.multiply(remaining));
  }

  // ══ MCost price sources (getSeedCosts :348-497 and its readers) ═══════════════════════════════════════════════
  function currencyConvert(trx, amt, from, to, date, convType) {                            // currencyConvert() PG function → MConversionRate
    if (amt == null) return null; var r = T.rate(trx, from, to, date, convType); return r ? D(amt).multiply(r).setScale(T.precisionOf(trx, to), HU) : null;
  }
  function getLastInvoicePrice(trx, p, asi, org, cur) {                                    // :509-552
    var rows = trx.q('SELECT i.c_invoice_id AS i, il.priceactual AS pa, i.c_currency_id AS c, i.dateacct AS d, i.c_conversiontype_id AS ct, i.dateinvoiced AS di, il.line AS ln FROM c_invoiceline il JOIN c_invoice i ON il.c_invoice_id=i.c_invoice_id WHERE il.m_product_id=? AND i.issotrx=\'N\'' +
      (org !== 0 ? ' AND il.ad_org_id=?' : asi !== 0 ? ' AND il.m_attributesetinstance_id=?' : '') + ' ORDER BY i.dateinvoiced DESC, il.line DESC', [p.m_product_id].concat(org !== 0 ? [org] : asi !== 0 ? [asi] : []));
    return rows.length ? currencyConvert(trx, rows[0].pa, rows[0].c, cur, rows[0].d, rows[0].ct) : null;
  }
  function poPriceRow(trx, r, cur) { var v = currencyConvert(trx, r.pc, r.c, cur, r.d, r.ct); if (v == null || v.signum() === 0) v = currencyConvert(trx, r.pa, r.c, cur, r.d, r.ct); return v; }
  function getLastPOPrice(trx, p, asi, org, cur) {                                         // :562-612
    var rows = trx.q('SELECT ol.pricecost AS pc, ol.priceactual AS pa, o.c_currency_id AS c, o.dateacct AS d, o.c_conversiontype_id AS ct FROM c_orderline ol JOIN c_order o ON ol.c_order_id=o.c_order_id WHERE ol.m_product_id=? AND o.issotrx=\'N\'' +
      (org !== 0 ? ' AND ol.ad_org_id=?' : asi !== 0 ? ' AND ol.m_attributesetinstance_id=?' : '') + ' ORDER BY o.dateordered DESC, ol.line DESC', [p.m_product_id].concat(org !== 0 ? [org] : asi !== 0 ? [asi] : []));
    return rows.length ? poPriceRow(trx, rows[0], cur) : null;
  }
  function getPOPrice(trx, p, olId, cur) {                                                  // :621-660
    var ol = trx.get('c_orderline', olId), o = ol ? trx.get('c_order', ol.c_order_id) : null;
    if (!ol || !o || o.issotrx !== 'N') return null;
    return poPriceRow(trx, { pc: ol.pricecost, pa: ol.priceactual, c: o.c_currency_id, d: o.dateacct, ct: o.c_conversiontype_id }, cur);
  }
  function getSeedCosts(trx, p, asi, as, org, method, olId) {
    var v = null, cur = as.c_currency_id;
    if (method === CM.AverageInvoice || method === CM.AveragePO || method === CM.Fifo || method === CM.Lifo) return null;
    else if (method === CM.LastInvoice) v = getLastInvoicePrice(trx, p, asi, org, cur);
    else if (method === CM.LastPOPrice) { if (olId) v = getPOPrice(trx, p, olId, cur); if (v == null || v.signum() === 0) v = getLastPOPrice(trx, p, asi, org, cur); }
    else if (method === CM.StandardCosting || method === CM.UserDefined) { /* :368-371 */ }
    else throw new Error('Unknown Costing Method = ' + method);
    if (v != null && v.signum() > 0) return v;
    if (olId) { v = getPOPrice(trx, p, olId, cur); if (v != null && v.signum() > 0) return v; }       // :381-389 exact order line
    if (method !== CM.StandardCosting) {                                                     // :391-401 standard costs first
      var sce = getMaterialCostElement(trx, as, CM.StandardCosting), sc = sce ? getCost(trx, p, asi, as, org, sce.m_costelement_id) : null;
      if (sc && sc.currentcostprice.signum() > 0) return sc.currentcostprice;
    }
    var poFirst = method === CM.LastPOPrice || method === CM.StandardCosting;                // :403-450
    var a = poFirst ? getLastPOPrice : getLastInvoicePrice, b = poFirst ? getLastInvoicePrice : getLastPOPrice;
    v = a(trx, p, asi, org, cur); if (org !== 0 && (v == null || v.signum() === 0)) v = a(trx, p, asi, 0, cur);
    if (v != null && (poFirst ? v.signum() > 0 : v.signum() !== 0)) return v;
    v = b(trx, p, asi, org, cur); if (org !== 0 && (v == null || v.signum() === 0)) v = b(trx, p, asi, 0, cur);
    if (v != null && v.signum() > 0) return v;
    trx.say('§MODEL-UNPORTED-DEP MCost.getSeedCosts Product_PO + getSeedCostFromPriceList (MCost.java:453-494, MUOMConversion) — no seed for product ' + p.m_product_id);
    return null;
  }

  // ══ MCost.getCost (:107-334) — the cost the posting books (ProductCost.getProductCosts :327-345) ═══════════════
  function getProductCosts(trx, p, asi, as, org, method, qty, olId, zeroCostsOK, dateAcct, costDetail, inBackDate) {
    var k = levelKeys(trx, p, as, org, asi); org = k.org; asi = k.asi;
    if (method == null) { method = costingMethod(trx, p, as); if (method == null) throw new Error('No Costing Method'); }
    if (!inBackDate) processProduct(trx, as, p, dateAcct);                                     // :127-128
    var history = null;
    if (costDetail) history = historyByCd(trx, org, as.m_costtype_id, as.c_acctschema_id, method, 0, asi, costDetail);
    if (!history && dateAcct != null) history = historyByDate(trx, org, p.m_product_id, as.m_costtype_id, as.c_acctschema_id, method, 0, asi, dateAcct);
    var historyCostPrice = history ? history.currentcostprice : null;
    // the GROUP BY ce.CostElementType, ce.CostingMethod, c.Percent, c.M_CostElement_ID query (:180-200)
    var groups = {}, materialCostEach = Z, otherCostEach = Z, percentage = Z;
    trx.find('m_cost', { ad_client_id: trx.env.client, ad_org_id: org, m_product_id: p.m_product_id, m_costtype_id: as.m_costtype_id, c_acctschema_id: as.c_acctschema_id }).forEach(function (c) {
      if (!(String(c.m_attributesetinstance_id) === String(asi) || Number(c.m_attributesetinstance_id) === 0)) return;
      var ce = trx.get('m_costelement', c.m_costelement_id) || {};
      if (!(ce.costingmethod == null || ce.costingmethod === method)) return;
      var gk = [ce.costelementtype, ce.costingmethod, c.percent, c.m_costelement_id].join('|'), g = groups[gk] = groups[gk] || { cp: Z, cm: ce.costingmethod, pct: c.percent };
      g.cp = g.cp.add(D(c.currentcostprice));
    });
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk], cp = g.cp;
      if (cp.signum() !== 0) { if (g.cm != null) { if (historyCostPrice != null && historyCostPrice.compareTo(cp) !== 0) cp = historyCostPrice; materialCostEach = materialCostEach.add(cp); } else otherCostEach = otherCostEach.add(cp); }
      if (g.pct != null && D(g.pct).signum() !== 0) percentage = percentage.add(D(g.pct));
    });
    if (materialCostEach.signum() === 0 && zeroCostsOK) return Z;
    var materialCost = materialCostEach.multiply(qty);
    if (method === CM.StandardCosting) return materialCost;
    if (method === CM.Fifo || method === CM.Lifo) { var mce = getMaterialCostElement(trx, as, method); materialCost = queueCosts(trx, p, asi, as, org, mce, qty); }
    var costs = otherCostEach.multiply(qty).add(materialCost || Z);
    if (costs.signum() === 0) return null;
    var precision = costingPrecision(trx, as);
    if (percentage.signum() === 0) { if (costs.scale() > precision) costs = costs.setScale(precision, HU); return costs; }
    costs = costs.add(costs.multiply(percentage).divide(D(100), precision, HU));
    if (costs.scale() > precision) costs = costs.setScale(precision, HU);
    return costs;
  }

  // ══ MCostDetail ═══════════════════════════════════════════════════════════════════════════════════════════════
  function isDelta(cd) { return !(D(cd.deltaamt).signum() === 0 && D(cd.deltaqty).signum() === 0); }   // :1235-1239
  // get (ctx, where, ID, ASI, C_AcctSchema_ID) :952-962 — first row of the Trx view
  function cdGet(trx, where, asi, asId, extra) {
    return trx.find('m_costdetail', Object.assign({ m_attributesetinstance_id: asi, c_acctschema_id: asId }, where))
      .filter(function (r) { return !extra || extra(r); }).sort(function (a, b) { return seqCmp(a.m_costdetail_id, b.m_costdetail_id); })[0] || null;
  }
  function ce0(r, ceId) { return Number(r.m_costelement_id || 0) === Number(ceId || 0); }   // Coalesce(M_CostElement_ID,0)=?
  // getOrder :819-831 / getInvoice :833-845 — by date first, else the latest only when it is a delta record
  function getByLineDate(trx, col, as, productId, asi, lineId, ceId, dateAcct, withProduct) {
    var w = {}; w[col] = lineId;
    var f = function (r) { return ce0(r, ceId) && (!withProduct || String(r.m_product_id) === String(productId)); };
    var cd = cdGet(trx, w, asi, as.c_acctschema_id, function (r) { return f(r) && day(r.dateacct) === day(dateAcct); });
    if (!cd) { cd = cdGet(trx, w, asi, as.c_acctschema_id, f); if (cd && !isDelta(cd)) cd = null; }
    return cd;
  }
  function getOrder(trx, as, productId, asi, olId, ceId, dateAcct) { return getByLineDate(trx, 'c_orderline_id', as, productId, asi, olId, ceId, dateAcct, false); }
  function getInvoice(trx, as, productId, asi, ilId, ceId, dateAcct) { return getByLineDate(trx, 'c_invoiceline_id', as, productId, asi, ilId, ceId, dateAcct, true); }
  function getShipment(trx, as, productId, asi, iolId, ceId) { return cdGet(trx, { m_inoutline_id: iolId }, asi, as.c_acctschema_id, function (r) { return ce0(r, ceId); }); }   // :847-851
  function getMatchInvoice(trx, as, productId, asi, miId, ceId) { return cdGet(trx, { m_matchinv_id: miId }, asi, as.c_acctschema_id, function (r) { return ce0(r, ceId); }); }   // :879-883
  // new MCostDetail(as, org, product, asi, ce, amt, qty, desc, dateAcct, ref) :1137-1155 ∘ setInitialDefaults :1083-1091
  function cdNew(trx, as, org, productId, asi, ceId, amt, qty, desc, dateAcct, refId) {
    var r = { ad_client_id: trx.env.client, ad_org_id: org, c_acctschema_id: as.c_acctschema_id, m_product_id: productId, m_attributesetinstance_id: asi || 0,
      processed: 'N', amt: N(amt == null ? Z : amt), qty: N(qty == null ? Z : qty), issotrx: 'N', deltaamt: 0, deltaqty: 0, description: desc == null ? null : desc, dateacct: dateAcct };
    r.m_costelement_id = ceId;                                                                // setM_CostElement_ID(0) → 0 stored as given
    if (refId > 0) r.ref_costdetail_id = refId;
    return { row: r, isNew: true };
  }
  // MCostDetail.beforeSave :1243-1278 + save
  function cdSave(trx, h) {
    var r = h.row;
    if (h.isNew) {
      var today = day(trx.env.date);
      if (r.dateacct == null) { r.dateacct = today + ' 00:00:00'; r.isbackdate = 'N'; }
      else if (Number(r.ref_costdetail_id || 0) > 0) r.isbackdate = 'Y';
      else {
        var mx = null; trx.find('m_costdetail', { m_product_id: r.m_product_id, processed: 'Y' }).forEach(function (x) { if (x.dateacct != null && (mx == null || day(x.dateacct) > mx)) mx = day(x.dateacct); });
        if (mx != null && mx > today) today = mx;
        r.isbackdate = day(r.dateacct) < today ? 'Y' : 'N';
      }
      h.row = trx.insert('m_costdetail', ML.newPO(trx, 'm_costdetail', r)); h.isNew = false;
    } else trx.update('m_costdetail', h.row, h.changes || {});
    h.changes = {};
    return true;
  }
  function cdSet(h, col, v) { if (h.isNew) h.row[col] = v; else { h.changes = h.changes || {}; h.changes[col] = v; h.row[col] = v; } }
  function cdSetAmtQty(h, col, v) { if (Y(h.row.processed)) throw new Error('Cannot change ' + col + ' - processed'); cdSet(h, col, N(v == null ? Z : v)); }   // setAmt/setQty :1162-1186
  // the shared body of createOrder :111-155 / createInvoice :206-250 / createShipment :303-351 / createMatchInvoice :678-722
  function createX(trx, kind, as, org, productId, asi, lineId, ceId, amt, qty, desc, isSO, dateAcct, refId) {
    amt = D(amt); qty = D(qty);
    var col = { order: 'c_orderline_id', invoice: 'c_invoiceline_id', shipment: 'm_inoutline_id', matchinv: 'm_matchinv_id' }[kind];
    var row = kind === 'order' ? getOrder(trx, as, productId, asi, lineId, ceId, dateAcct) : kind === 'invoice' ? getInvoice(trx, as, productId, asi, lineId, ceId, dateAcct)
      : kind === 'shipment' ? getShipment(trx, as, productId, asi, lineId, ceId) : getMatchInvoice(trx, as, productId, asi, lineId, ceId);
    var h = row ? { row: row, isNew: false, changes: {} } : null;
    if (h && (kind === 'order' || kind === 'invoice') && !isDelta(h.row) && refId > 0) cdSet(h, 'isbackdate', 'Y');
    if (!h) {
      h = cdNew(trx, as, org, productId, asi, ceId, amt, qty, desc, dateAcct, refId);
      h.row[col] = lineId; if (kind === 'shipment') h.row.issotrx = isSO ? 'Y' : 'N';
    } else {
      if (Y(h.row.processed)) { cdSet(h, 'deltaamt', N(amt.subtract(D(h.row.amt)))); cdSet(h, 'deltaqty', N(qty.subtract(D(h.row.qty)))); }
      else { cdSet(h, 'deltaamt', 0); cdSet(h, 'deltaqty', 0); cdSetAmtQty(h, 'amt', amt); cdSetAmtQty(h, 'qty', qty); }
      if (isDelta(h.row)) { cdSet(h, 'processed', 'N'); cdSetAmtQty(h, 'amt', amt); cdSetAmtQty(h, 'qty', qty); }
      else if (Y(h.row.processed)) return true;                                                // nothing to do
    }
    var ok = cdSave(trx, h);
    if (ok && !Y(h.row.processed)) ok = cdProcess(trx, h);
    trx.say('§MODEL-COST create' + kind + ' as=' + as.c_acctschema_id + ' product=' + productId + ' ' + col + '=' + lineId + ' amt=' + amt + ' qty=' + qty + ' ok=' + ok);
    return ok;
  }
  function createOrder(trx, as, org, productId, asi, olId, ceId, amt, qty, desc, dateAcct, refId) { return createX(trx, 'order', as, org, productId, asi, olId, ceId, amt, qty, desc, false, dateAcct, refId); }
  function createInvoice(trx, as, org, productId, asi, ilId, ceId, amt, qty, desc, dateAcct, refId) { return createX(trx, 'invoice', as, org, productId, asi, ilId, ceId, amt, qty, desc, false, dateAcct, refId); }
  function createShipment(trx, as, org, productId, asi, iolId, ceId, amt, qty, desc, isSO, dateAcct, refId) { return createX(trx, 'shipment', as, org, productId, asi, iolId, ceId, amt, qty, desc, isSO, dateAcct, refId); }
  function createMatchInvoice(trx, as, org, productId, asi, miId, ceId, amt, qty, desc, dateAcct, refId) { return createX(trx, 'matchinv', as, org, productId, asi, miId, ceId, amt, qty, desc, false, dateAcct, refId); }

  // MCostDetail.process() :1305-1418
  function cdProcess(trx, h) {
    var r = h.row;
    if (Y(r.processed)) return true;
    var ok = false, as = trx.get('c_acctschema', r.c_acctschema_id), p = trx.get('m_product', r.m_product_id);
    var k = levelKeys(trx, p, as, r.ad_org_id, r.m_attributesetinstance_id), Org_ID = k.org, M_ASI_ID = k.asi;
    function run(list) { for (var i = 0; i < list.length; i++) { var ce = list[i];
      if ((ce_.isAverageInvoice(ce) || ce_.isAveragePO(ce) || ce_.isLifo(ce) || ce_.isFifo(ce)) && !T.isStocked(p)) continue;
      ok = processCe(trx, h, as, p, ce, Org_ID, M_ASI_ID); if (!ok) break; } }
    if (!nz(r.m_costelement_id)) run(getCostingMethods(trx));
    else {
      var ce = trx.get('m_costelement', r.m_costelement_id);
      if (ce.costingmethod == null) run(getCostingMethods(trx));
      else if (ce_.isAverageInvoice(ce) || ce_.isAveragePO(ce) || ce_.isLifo(ce) || ce_.isFifo(ce)) { if (T.isStocked(p)) ok = processCe(trx, h, as, p, ce, Org_ID, M_ASI_ID); }
      else ok = processCe(trx, h, as, p, ce, Org_ID, M_ASI_ID);
    }
    if (ok) { cdSet(h, 'deltaamt', null); cdSet(h, 'deltaqty', null); cdSet(h, 'processed', 'Y'); ok = cdSave(trx, h); }
    return ok;
  }
  function isVendorRMA(trx, r) {                                                            // :1220-1230
    if (!Y(r.issotrx) && nz(r.m_inoutline_id)) { var l = trx.get('m_inoutline', r.m_inoutline_id), io = l ? trx.get('m_inout', l.m_inout_id) : null, d = io ? T.dt(trx, io.c_doctype_id) : null; return !!d && d.docbasetype === 'MMS'; }
    return false;
  }
  // MCostDetail.process(as, product, ce, Org_ID, M_ASI_ID) :1423-1830
  function processCe(trx, h, as, p, ce, Org_ID, M_ASI_ID) {
    var r = h.row, method = costingMethod(trx, p, as);
    if (method === CM.AverageInvoice) { if (ce_.isAveragePO(ce)) return true; }               // :1426-1433 AvgInv/AvgPO compatibility
    else if (method === CM.AveragePO) { if (ce_.isAverageInvoice(ce)) return true; }
    var cost = getCost(trx, p, M_ASI_ID, as, Org_ID, ce.m_costelement_id), cd = null;
    var isOrderLandedCost = nz(r.c_orderline_id) && nz(r.m_costelement_id);
    var isReversedOrderLandedCost = isOrderLandedCost && isDelta(r) && D(r.deltaqty).signum() === -1 && D(r.deltaamt).signum() === -1 && (ce_.isAveragePO(ce) || ce_.isAverageInvoice(ce));
    function prevOrderCd(olId) {                                                              // :1444-1453 / :1468-1476
      return trx.find('m_costdetail', { c_orderline_id: olId, m_attributesetinstance_id: M_ASI_ID, c_acctschema_id: as.c_acctschema_id })
        .filter(function (x) { return day(x.dateacct) === day(r.dateacct) && seqCmp(x.m_costdetail_id, r.m_costdetail_id) < 0; })
        .sort(function (a, b) { return seqCmp(b.m_costdetail_id, a.m_costdetail_id); })[0] || null;
    }
    if (isOrderLandedCost && !isReversedOrderLandedCost) cd = prevOrderCd(r.c_orderline_id);
    if (nz(r.c_invoiceline_id) && !nz(r.m_costelement_id)) {                                 // :1456-1481 partial MR → cost info of the previous order detail
      var il = trx.get('c_invoiceline', r.c_invoiceline_id), inv = il ? trx.get('c_invoice', il.c_invoice_id) : null;
      if (inv && !Y(inv.issotrx)) {
        var mpos = trx.q('SELECT mi.m_matchpo_id AS id FROM m_matchpo mi JOIN c_invoiceline il ON mi.c_invoiceline_id=il.c_invoiceline_id WHERE il.c_invoice_id=?', [inv.c_invoice_id]).map(function (x) { return trx.get('m_matchpo', x.id); })
          .concat(trx.find('m_matchpo', { c_invoiceline_id: r.c_invoiceline_id }).filter(function (x) { return ML.isNewId(x.m_matchpo_id); }));
        for (var i = 0; i < mpos.length; i++) { var mpo = mpos[i];
          if (mpo && String(mpo.c_invoiceline_id) === String(r.c_invoiceline_id) && day(mpo.dateacct) === day(r.dateacct) && D(mpo.qty).compareTo(D(il.qtyinvoiced)) !== 0) { cd = prevOrderCd(mpo.c_orderline_id); break; } }
      }
    }
    if (nz(r.m_inoutline_id)) {                                                               // :1483-1500 skip average qty check (reversal / drop ship)
      var iol = trx.get('m_inoutline', r.m_inoutline_id), io = iol ? trx.get('m_inout', iol.m_inout_id) : null;
      if (io && nz(io.reversal_id)) cost.skipAvgQtyCheck = true;
      else if (io && nz(io.c_order_id)) { var so = trx.get('c_order', io.c_order_id); if (so && nz(so.link_order_id)) { var lo = trx.get('c_order', so.link_order_id); cost.skipAvgQtyCheck = !!(lo && Y(lo.isdropship)); } }
    } else if (nz(r.c_projectissue_id)) { var pi = trx.get('c_projectissue', r.c_projectissue_id); cost.skipAvgQtyCheck = !!(pi && nz(pi.reversal_id)); }
    else if (nz(r.m_inventoryline_id)) { var ivl = trx.get('m_inventoryline', r.m_inventoryline_id), iv = ivl ? trx.get('m_inventory', ivl.m_inventory_id) : null; cost.skipAvgQtyCheck = !!(iv && nz(iv.reversal_id)); }
    var costInfo = getCostInfo(trx, Org_ID, p.m_product_id, as.m_costtype_id, as.c_acctschema_id, ce.m_costelement_id, M_ASI_ID, r.dateacct, cd != null ? cd : r);   // :1507-1516
    if (costInfo != null) { cost.currentqty = costInfo.currentqty; cost.currentcostprice = costInfo.currentcostprice; cost.cumulatedqty = costInfo.cumulatedqty; cost.cumulatedamt = costInfo.cumulatedamt; }
    var history = historyNew(r, cost, ce);                                                    // :1521 save history for m_cost
    var qty, amt;                                                                             // :1525-1546 delta or full
    if (isDelta(r)) { if (!isOrderLandedCost || isReversedOrderLandedCost) { qty = D(r.deltaqty); amt = D(r.deltaamt); } else { qty = D(r.qty); amt = D(r.amt); } }
    else { qty = D(r.qty); amt = D(r.amt); }
    var costAdjustment = false;                                                               // :1549-1557
    if (nz(r.m_costelement_id) && String(r.m_costelement_id) !== String(ce.m_costelement_id) && !isReversedOrderLandedCost) {
      var tce = trx.get('m_costelement', r.m_costelement_id); if (tce && tce.costingmethod == null && ce.costingmethod != null) { qty = Z; costAdjustment = true; }
    }
    var precision = costingPrecision(trx, as), price = amt;
    if (qty.signum() !== 0) price = amt.divide(qty, precision, HU);
    var isReturnTrx;
    if (nz(r.c_orderline_id)) {                                                               // *** Purchase Order Detail Record *** :1565-1616
      isReturnTrx = qty.signum() < 0;
      if (ce_.isAveragePO(ce)) { if (!(qty.signum() === 0 && cost.currentqty.signum() <= 0)) cost.setWeightedAverage(amt, qty); }
      else if (ce_.isLastPOPrice(ce) && !costAdjustment) { if (!isReturnTrx) { if (qty.signum() !== 0) cost.currentcostprice = price; else cost.currentcostprice = cost.currentcostprice.add(amt); } cost.add(amt, qty); }
      else if (ce_.isStandardCosting(ce) && !costAdjustment) {
        if (cost.currentcostprice.signum() === 0 && cost.currentcostpricell.signum() === 0) {
          cost.currentcostprice = price;
          if (cost.currentcostprice.signum() === 0) cost.currentcostprice = getSeedCosts(trx, p, M_ASI_ID, as, Org_ID, ce.costingmethod, r.c_orderline_id) || Z;
        }
        cost.add(amt, qty);
      }
      else if (ce_.isUserDefined(ce)) { /* Interface */ }
    } else if (nz(r.c_invoiceline_id)) {                                                      // *** AP Invoice Detail Record *** :1619-1683
      isReturnTrx = qty.signum() < 0;
      if (ce_.isAverageInvoice(ce)) cost.setWeightedAverage(amt, qty);
      else if (ce_.isAveragePO(ce) && costAdjustment) cost.setWeightedAverage(amt, qty);
      else if (ce_.isFifo(ce) || ce_.isLifo(ce)) {
        var cq = queueGet(trx, p, r.m_attributesetinstance_id || 0, as, Org_ID, ce.m_costelement_id); cq.setCosts(amt, qty, precision); cq.save();
        var cQueue = getQueue(trx, p, M_ASI_ID, as, Org_ID, ce); if (cQueue.length) cost.currentcostprice = cQueue[0].currentcostprice;
        cost.add(amt, qty);
      }
      else if (ce_.isLastInvoice(ce) && !costAdjustment) { if (!isReturnTrx) { if (qty.signum() !== 0) cost.currentcostprice = price; else cost.currentcostprice = cost.currentcostprice.add(amt); } cost.add(amt, qty); }
      else if (ce_.isStandardCosting(ce) && !costAdjustment) {
        if (cost.currentcostprice.signum() === 0 && cost.currentcostpricell.signum() === 0) {
          cost.currentcostprice = price;
          if (cost.currentcostprice.signum() === 0) cost.currentcostprice = getSeedCosts(trx, p, M_ASI_ID, as, Org_ID, ce.costingmethod, r.c_orderline_id) || Z;
          cost.add(amt, qty);
        }
      }
      else if (ce_.isUserDefined(ce)) cost.add(amt, qty);
    } else if (nz(r.m_inoutline_id) && costAdjustment) {                                      // :1685-1691
      if (ce_.isAverageInvoice(ce)) cost.setWeightedAverage(amt, qty);
    } else if (nz(r.m_inoutline_id) || nz(r.m_movementline_id) || nz(r.m_inventoryline_id) || nz(r.m_productionline_id) || nz(r.c_projectissue_id) || nz(r.pp_cost_collector_id)) {   // *** Qty Adjustment *** :1693-1868
      var addition = qty.signum() > 0, adjustment = nz(r.m_inventoryline_id) && qty.signum() === 0 && amt.signum() !== 0, vRMA = isVendorRMA(trx, r);
      var invMethod = function () { var ivl2 = trx.get('m_inventoryline', r.m_inventoryline_id), iv2 = ivl2 ? trx.get('m_inventory', ivl2.m_inventory_id) : null; return iv2 ? iv2.costingmethod : null; };
      var isShipment = Y(r.issotrx) && nz(r.m_inoutline_id);
      if (ce_.isAverageInvoice(ce)) {
        if (!vRMA) {
          if (adjustment) { if (invMethod() === CM.AverageInvoice) { if (cost.currentqty.signum() === 0 && qty.signum() === 0) cost.setWeightedAverageInitial(amt); else cost.setWeightedAverage(amt.multiply(cost.currentqty), qty); } }
          else if (addition) { cost.setWeightedAverage(amt, qty); if (isShipment) { cost.cumulatedqty = history.oldcqty; cost.cumulatedamt = history.oldcamt; } }
          else cost.currentqty = cost.currentqty.add(qty);
        }
      } else if (ce_.isAveragePO(ce)) {
        if (adjustment) { if (invMethod() === CM.AveragePO) { if (cost.currentqty.signum() === 0 && qty.signum() === 0) cost.setWeightedAverageInitial(amt); else cost.setWeightedAverage(amt.multiply(cost.currentqty), qty); } }
        else if (addition) { cost.setWeightedAverage(amt, qty); if (isShipment && !vRMA) { cost.cumulatedqty = history.oldcqty; cost.cumulatedamt = history.oldcamt; } }
        else { if (vRMA) cost.setWeightedAverage(amt, qty); else cost.currentqty = cost.currentqty.add(qty); }
      } else if (ce_.isFifo(ce) || ce_.isLifo(ce)) {
        if (!vRMA && !adjustment) {
          if (addition) { var q2 = queueGet(trx, p, r.m_attributesetinstance_id || 0, as, Org_ID, ce.m_costelement_id); q2.setCosts(amt, qty, precision); q2.save(); }
          else adjustQty(trx, p, M_ASI_ID, as, Org_ID, ce, qty.negate());
          var cQ = getQueue(trx, p, M_ASI_ID, as, Org_ID, ce); if (cQ.length) cost.currentcostprice = cQ[0].currentcostprice;
          cost.currentqty = cost.currentqty.add(qty);
        }
      } else if (ce_.isLastInvoice(ce) && !vRMA && !adjustment) cost.currentqty = cost.currentqty.add(qty);
      else if (ce_.isLastPOPrice(ce) && !vRMA && !adjustment) cost.currentqty = cost.currentqty.add(qty);
      else if (ce_.isStandardCosting(ce) && !vRMA) {
        if (adjustment) { if (invMethod() === CM.StandardCosting) { cost.add(amt.multiply(cost.currentqty), qty); cost.currentcostprice = cost.currentcostprice.add(amt); } }
        else if (addition) {
          var pl = nz(r.m_productionline_id) ? trx.get('m_productionline', r.m_productionline_id) : null;
          if (pl && pl.m_production_id && (trx.get('m_production', pl.m_production_id) || {}).reversal_id) cost.currentqty = cost.currentqty.add(qty);   // getProductionReversalId
          else cost.add(amt, qty);
          if (cost.currentcostprice.signum() === 0 && cost.currentcostpricell.signum() === 0 && cost.is_new) cost.currentcostprice = price;
        } else cost.currentqty = cost.currentqty.add(qty);
      } else if (ce_.isUserDefined(ce) && !vRMA && !adjustment) { if (addition) cost.add(amt, qty); else cost.currentqty = cost.currentqty.add(qty); }
      else if (!ce_.isCostingMethod(ce)) { /* should not happen */ }
      else if (ce_.isStandardCosting(ce) && vRMA) cost.add(amt, qty);
      else trx.say('§MODEL-COST QtyAdjust - ' + ce.m_costelement_id + ' (no branch, MCostDetail.java:1866)');
    } else if (nz(r.m_matchinv_id)) {                                                         // :1870-1876
      if (ce_.isAveragePO(ce)) { if (!(qty.signum() === 0 && cost.currentqty.signum() <= 0)) cost.setWeightedAverage(amt, qty); }
    } else { trx.say('§MODEL-COST Unknown Type: cost detail ' + r.m_costdetail_id); return false; }
    if (as.costingmethod === ce.costingmethod) {                                              // :1884-1890 snapshot of the schema's method
      cdSet(h, 'currentcostprice', N(cost.currentcostprice)); cdSet(h, 'currentqty', N(cost.currentqty)); cdSet(h, 'cumulatedamt', N(cost.cumulatedamt)); cdSet(h, 'cumulatedqty', N(cost.cumulatedqty));
    }
    Object.assign(history, { newqty: cost.currentqty, newcostprice: cost.currentcostprice, newcamt: cost.cumulatedamt, newcqty: cost.cumulatedqty });   // :1893-1896
    if (history.newqty.compareTo(history.oldqty) !== 0 || history.newcostprice.compareTo(history.oldcostprice) !== 0 || ce_.isAveragePO(ce) || ce_.isAverageInvoice(ce)) {
      var hr = {}; Object.keys(history).forEach(function (k) { hr[k] = history[k] instanceof BigDecimal ? N(history[k]) : history[k]; });
      trx.insert('m_costhistory', ML.newPO(trx, 'm_costhistory', hr));
    }
    return cost.save();
  }
  // MCostDetail.processProduct(as, product, dateAcct, trx) :1018-1045 — unprocessed details up to the date, in cost order
  function processProduct(trx, as, p, dateAcct) {
    if (dateAcct == null) dateAcct = trx.env.date;
    var list = trx.find('m_costdetail', { c_acctschema_id: as.c_acctschema_id, m_product_id: p.m_product_id, processed: 'N' }).filter(function (x) { return day(x.dateacct) <= day(dateAcct); });
    list.sort(function (a, b) { return (Number(a.ad_org_id) - Number(b.ad_org_id)) || (Number(a.m_attributesetinstance_id) - Number(b.m_attributesetinstance_id)) || cmp(a.dateacct, b.dateacct) || seqCmp(a.m_costdetail_id, b.m_costdetail_id); });
    var bad = 0; list.forEach(function (x) { if (!cdProcess(trx, { row: x, isNew: false, changes: {} })) bad++; });
    return bad === 0;
  }

  // MCostDetail.processProduct(product, trxName) :992-1013 — the CostCreate overload: every schema, no DateAcct cut-off,
  // ordered C_AcctSchema_ID, AD_Org_ID, M_AttributeSetInstance_ID, DateAcct, then the same ref-detail key as :1023-1049 above.
  function processProductAll(trx, p) {
    var list = trx.find('m_costdetail', { m_product_id: p.m_product_id, processed: 'N' });
    list.sort(function (a, b) { return (Number(a.c_acctschema_id) - Number(b.c_acctschema_id)) || (Number(a.ad_org_id) - Number(b.ad_org_id)) || (Number(a.m_attributesetinstance_id) - Number(b.m_attributesetinstance_id)) || cmp(a.dateacct, b.dateacct) || seqCmp(a.m_costdetail_id, b.m_costdetail_id); });
    var ok = 0, bad = 0; list.forEach(function (x) { if (cdProcess(trx, { row: x, isNew: false, changes: {} })) ok++; else bad++; });
    trx.say('§MODEL-COST processProduct(all) product=' + p.m_product_id + ' OK=' + ok + ' Errors=' + bad);   // s_log.config :1011
    return bad === 0;
  }

  return { CM: CM, ce: ce_, costingMethod: costingMethod, costingLevel: costingLevel, costingPrecision: costingPrecision, getCostingMethods: getCostingMethods,
    getMaterialCostElement: getMaterialCostElement, getCost: getCost, getCostInfo: getCostInfo, getSeedCosts: getSeedCosts, getProductCosts: getProductCosts,
    getQueue: getQueue, adjustQty: adjustQty, queueCosts: queueCosts, isDelta: isDelta, getOrder: getOrder, getInvoice: getInvoice, getShipment: getShipment,
    getMatchInvoice: getMatchInvoice, createOrder: createOrder, createInvoice: createInvoice, createShipment: createShipment, createMatchInvoice: createMatchInvoice,
    processProduct: processProduct, processProductAll: processProductAll, currencyConvert: currencyConvert };
});
