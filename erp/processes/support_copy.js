// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_copy.js — the model "copy" statics the Copy* processes call, ported verbatim (bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP-PROC-CORE family A — Witness: W-CP-PROC-ORACLE). Registered on AdProcess.PSUP.
// Java root org.adempiere.base/src/org/compiere/model/. Every write goes through the process Trx (ModelLayer PO handles);
// raw `UPDATE … SET (a,b)=(SELECT …)` totals are computed from the Trx's own rows (the process DB shim cannot read pending writes).
(function (global) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var P = NODE ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSUP = P.PSUP || {};
  function A() { return NODE ? require('../ad_callout.js') : global.AdCallout; }
  function R() { return A().RUNTIME; }
  function ML() { return NODE ? require('../model_layer') : global.ModelLayer; }
  function CT() { return NODE ? require('../model_ctor') : global.ModelCtor; }
  function nz(v) { return v == null || v === '' ? 0 : Number(v); }
  function Y(v) { return v === 'Y' || v === true; }
  function bd(v) { if (v == null) return null; var a = A(); return v instanceof a.BigDecimal ? v : a.toBD(String(v)); }
  function HU() { return A().RoundingMode.HALF_UP; }
  function ZERO() { return A().Env.ZERO; }
  function say(trx, m) { if (trx && trx.say) trx.say(m); }
  function fkNull(v) { return nz(v) < 1 ? null : v; }                    // X_*.setXxx_ID(int): `if (id < 1) set_Value(col, null)`

  // ══ PO.copyValues(from, to, AD_Client_ID, AD_Org_ID) (PO.java:1431-1485) — every AD_Column of the table that is not virtual,
  // key, UUID, standard (AD_Client/AD_Org/IsActive/Processing/Created*/Updated*; MColumn.java:277-291) and IsAllowCopy='Y'
  var STD = /^(ad_client_id|ad_org_id|isactive|processing|created|createdby|updated|updatedby)$/, _cc = {};
  function copyCols(trx, table) {
    if (_cc[table]) return _cc[table];
    var out = [];
    trx.q("SELECT lower(c.columnname) AS c, c.iskey AS k, c.isallowcopy AS ac, c.columnsql AS s FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [table])
      .forEach(function (r) {
        if ((r.s != null && r.s !== '') || r.k === 'Y' || r.c === table + '_uu' || STD.test(r.c) || r.ac !== 'Y') return;
        out.push(r.c);
      });
    return (_cc[table] = out);
  }
  S.newRec = newRec; S.newBare = newBare;
  S.copyValues = function (trx, table, from, to, client, org) {
    var f = from.row || from;
    copyCols(trx, table).forEach(function (c) { if (Object.prototype.hasOwnProperty.call(f, c)) to.set(c, f[c]); });
    to.set('ad_client_id', client); to.set('ad_org_id', org);
  };

  // ML.newPO stamps Processed/Processing/Posted on every table; the Java PO (setStandardDefaults :1973-2001) only on tables that HAVE the column
  function prune(trx, table, po) { var cols = ML().columnsOf(trx, table); Object.keys(po.ch).forEach(function (k) { if (!cols[k]) delete po.ch[k]; }); return po; }
  function newRec(trx, table) { return prune(trx, table, ML().newRecord(trx, table, {})); }
  // The generated X_<Table>(ctx,0) ctor bodies are COMMENTED OUT in this iDempiere (X_C_BankStatementLine.java: `/** if (ID == 0) { setIsManual(true); … } */`), so a new PO carries only the
  // standard defaults (setStandardDefaults) and the physical column DEFAULTs apply at INSERT (ad_ddl_default, applied by Trx.insert). ML.newPO also stamps the AD mandatory defaults;
  // `bare` drops them (ismanual 'Y' vs the DB's 'N' on C_BankStatementLine).
  var STDK = /^(ad_client_id|ad_org_id|isactive|processed|processing|posted)$/;
  // PG column DEFAULTs (idempiere_pilot \d c_bankstatementline: ismanual 'N', eftamt 0) for tables that erp/patches/ad_seed.db.sql's ad_ddl_default (188 rows) does not carry yet —
  // applied only where the column is still unset; delete an entry once the patch generator emits that table's defaults.
  var DDL_FALLBACK = { c_bankstatementline: { ismanual: 'N', eftamt: 0 } };
  function newBare(trx, table) {
    var po = newRec(trx, table); Object.keys(po.ch).forEach(function (k) { if (!STDK.test(k)) delete po.ch[k]; });
    var fb = DDL_FALLBACK[table]; if (fb) Object.keys(fb).forEach(function (c) { po.ch[c] = fb[c]; });
    return po;
  }

  function uomPrecision(trx, uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }   // MUOM.getPrecision
  function dayTS(v) { return v == null ? null : A().Timestamp.of(v); }
  // Core.getTaxLookup().get(...) = Tax.get(...) (DefaultTaxLookup.java; ported callouts/tax.js)
  function taxGet(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule) {
    var M = R().M;
    if (M.Core && typeof M.Core.getTaxLookup === 'function') return M.Core.getTaxLookup().get(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule, null);
    return M.Tax.get(ctx, prod, charge, billDate, shipDate, org, wh, billLoc, shipLoc, drop, isSO, rule, null);
  }

  // ══ MOrderLine (MOrderLine.java) ═════════════════════════════════════════════════════════════════════════════
  // setOrder :227-238
  function olSetOrder(line, o) {
    line.set('ad_client_id', o.ad_client_id).set('ad_org_id', o.ad_org_id);
    line.set('c_bpartner_id', o.c_bpartner_id).set('c_bpartner_location_id', o.c_bpartner_location_id).set('m_warehouse_id', o.m_warehouse_id)
      .set('dateordered', o.dateordered).set('datepromised', o.datepromised).set('c_currency_id', o.c_currency_id);
  }
  // setQtyEntered :724-732 — enforce entered-UOM precision
  function olSetQtyEntered(trx, line, q) {
    if (q != null && nz(line.get('c_uom_id')) !== 0) q = bd(q).setScale(uomPrecision(trx, line.get('c_uom_id')), HU());
    line.set('qtyentered', q); return q;
  }
  // setQtyOrdered :738-747 — enforce product UOM precision (MProduct.getUOMPrecision)
  function olSetQtyOrdered(trx, line, q) {
    var p = nz(line.get('m_product_id')) ? trx.get('m_product', line.get('m_product_id')) : null;
    if (q != null && p != null) q = bd(q).setScale(nz(p.c_uom_id) ? uomPrecision(trx, p.c_uom_id) : 0, HU());
    line.set('qtyordered', q); return q;
  }
  // setTax :346-361
  function olSetTax(trx, ctx, line, order) {
    var ii = taxGet(ctx, nz(line.get('m_product_id')), nz(line.get('c_charge_id')), dayTS(line.get('dateordered')), dayTS(line.get('dateordered')),
      nz(line.get('ad_org_id')), nz(line.get('m_warehouse_id')), nz(line.get('c_bpartner_location_id')), nz(line.get('c_bpartner_location_id')),
      nz(order.dropship_location_id), Y(order.issotrx), order.deliveryviarule == null ? null : order.deliveryviarule);
    if (ii === 0) { say(trx, '§MODEL-SEVERE MOrderLine.setTax No Tax found'); return false; }
    line.set('c_tax_id', ii); return true;
  }
  // MOrderLine.getDescriptionStrippingCloseTag :1101-1110 — Pattern "( \\| )?Close \\(.*\\)" split + concat
  function stripCloseTag(d) { return d == null ? d : String(d).replace(/( \| )?Close \(.*\)/g, ''); }


  // MOrderLine.beforeSave :790-850 (the product-pricing part that decides whether the save is refused). A refused save is what PO.save returns false
  // for (ProductNotOnPriceListException / UnderLimitPrice are logged by PO.save, not thrown to the caller).
  function olPricingObj(line) {
    return { getM_Product_ID: function () { return nz(line.get('m_product_id')); }, getC_Order_ID: function () { return nz(line.get('c_order_id')); },
      getC_BPartner_ID: function () { return nz(line.get('c_bpartner_id')); }, getQtyOrdered: function () { return bd(line.get('qtyordered')); }, getDateOrdered: function () { return dayTS(line.get('dateordered')); } };
  }
  function olBeforeSavePricing(trx, ctx, line, order) {
    var Mm = R().M, plId = nz(order.m_pricelist_id), Env = A().Env;
    if (nz(line.get('c_charge_id')) !== 0 && nz(line.get('m_product_id')) !== 0) line.set('m_product_id', null);       // :816-817
    if (nz(line.get('m_product_id')) === 0) { line.set('m_attributesetinstance_id', 0); return null; }                  // :819-820
    if (Y(line.get('processed'))) return null;                                                                          // :821 else if (!isProcessed())
    var mpp = null;
    function getProductPricing() { mpp = new Mm.MProductPricing(); mpp.setOrderLine(olPricingObj(line), trx); mpp.setM_PriceList_ID(plId); mpp.calculatePrice(); return mpp; }   // :326-334
    if (bd(line.get('priceactual')).compareTo(Env.ZERO) === 0 && bd(line.get('pricelist')).compareTo(Env.ZERO) === 0) {  // :824-826 setPrice() :290-322
      if (plId === 0) throw new Error('PriceList unknown!');
      getProductPricing();
      line.set('priceactual', mpp.getPriceStd()).set('pricelist', mpp.getPriceList()).set('pricelimit', mpp.getPriceLimit());
      var qe = bd(line.get('qtyentered')), qo = bd(line.get('qtyordered'));
      if (qe.compareTo(qo) === 0) line.set('priceentered', line.get('priceactual'));
      else line.set('priceentered', bd(line.get('priceactual')).multiply(qo.divide(qe, 12, HU())));
      line.set('discount', mpp.getDiscount());
      if (nz(line.get('c_uom_id')) === 0) line.set('c_uom_id', mpp.getC_UOM_ID());
    }
    if (mpp == null) getProductPricing();                                                                               // :827-828
    var pl = trx.get('m_pricelist', order.m_pricelist_id), enforce = Y(order.issotrx) && pl && Y(pl.enforcepricelimit);   // :831-833
    if (enforce) { var role = trx.get('ad_role', Env.getAD_Role_ID(ctx)); if (role && Y(role.isoverwritepricelimit)) enforce = false; }   // :834-835
    if (enforce && bd(line.get('pricelimit')).compareTo(Env.ZERO) !== 0 && bd(line.get('priceactual')).compareTo(bd(line.get('pricelimit'))) < 0) {   // :836-840
      say(trx, '§MODEL-SEVERE MOrderLine.save UnderLimitPrice PriceEntered=' + line.get('priceentered') + ', PriceLimit=' + line.get('pricelimit')); return 'UnderLimitPrice';
    }
    var dtId = nz(order.c_doctype_id) === 0 ? nz(order.c_doctypetarget_id) : nz(order.c_doctype_id);                   // :843 getParent().getDocTypeID()
    var dt = trx.get('c_doctype', dtId);
    if (!(dt && Y(dt.isnopricelistcheck)) && !mpp.isCalculated()) {                                                     // :846-849
      say(trx, '§MODEL-SEVERE MOrderLine.save ProductNotOnPriceListException Line No:' + line.get('line') + ', Product: ' + nz(line.get('m_product_id')) + ', Price List: ' + plId);
      return 'ProductNotOnPriceList';
    }
    return null;
  }

  // ══ MOrder.copyLinesFrom(otherOrder, counter, copyASI) (MOrder.java:795-851) ═════════════════════════════════
  S.MOrder_copyLinesFrom = function (trx, ctx, to, other, counter, copyASI) {
    if (Y(to.processed) || Y(to.posted) || other == null) return 0;                              // :797
    var m = ML(), fromLines = trx.find('c_orderline', { c_order_id: other.c_order_id }, ['line']);   // getLines(false,null) ORDER BY Line :925-943
    var count = 0, UC = R().M.MUOMConversion;
    for (var i = 0; i < fromLines.length; i++) {
      var fl = fromLines[i], line = newRec(trx, 'c_orderline');
      // new MOrderLine(this) :185-193 = setInitialDefaults :158-176 + setC_Order_ID + setOrder
      line.set('freightamt', 0).set('linenetamt', 0).set('priceentered', 0).set('priceactual', 0).set('pricelimit', 0).set('pricelist', 0)
        .set('m_attributesetinstance_id', 0).set('qtyentered', 0).set('qtyordered', 0).set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0)
        .set('isdescription', 'N').set('processed', 'N').set('line', 0);
      line.set('c_order_id', to.c_order_id); olSetOrder(line, to);
      S.copyValues(trx, 'c_orderline', fl, line, to.ad_client_id, to.ad_org_id);                  // :804
      line.set('c_order_id', to.c_order_id);                                                      // :805
      line.set('qtydelivered', 0).set('qtyinvoiced', 0).set('qtyreserved', 0).set('qtylostsales', 0);   // :807-810
      var qe = olSetQtyEntered(trx, line, fl.qtyentered);                                         // :811
      var ordered = UC.convertProductFrom(ctx, nz(line.get('m_product_id')), nz(line.get('c_uom_id')), qe == null ? null : qe);   // :812
      olSetQtyOrdered(trx, line, ordered);                                                        // :813
      line.set('datedelivered', null).set('dateinvoiced', null);                                  // :814-815
      olSetOrder(line, to);                                                                       // :816 setOrder(this)
      if (!counter && other.docstatus === 'CL') line.set('description', stripCloseTag(line.get('description')));   // :818-819
      if (!copyASI) { line.set('m_attributesetinstance_id', 0).set('s_resourceassignment_id', null); }          // :822-826
      line.set('ref_orderline_id', counter ? fkNull(fl.c_orderline_id) : null);                   // :827-830
      line.set('link_orderline_id', null);                                                        // :833
      if (String(nz(to.c_bpartner_id)) !== String(nz(other.c_bpartner_id))) olSetTax(trx, ctx, line, to);       // :835-836
      line.set('processed', 'N');                                                                 // :839
      var perr = olBeforeSavePricing(trx, ctx, line, to);                                         // PO.save → beforeSave :790-850
      var ok = perr ? false : line.save(); if (ok) count++;                                        // :840-841
      if (counter) {                                                                              // :843-847 cross link
        var fresh = trx.get('c_orderline', fl.c_orderline_id);
        var r2 = ML().save(trx, 'c_orderline', fresh, { ref_orderline_id: line.id() }); if (!r2.ok) throw new Error('SaveError c_orderline: ' + r2.error);
      }
    }
    if (fromLines.length !== count) say(trx, '§MODEL-SEVERE MOrder.copyLinesFrom Line difference - From=' + fromLines.length + ' <> Saved=' + count);   // :849
    return count;
  };

  // ══ MInvoiceLine.setTax :499-528 ═════════════════════════════════════════════════════════════════════════════
  function ilSetTax(trx, ctx, line, inv) {
    if (Y(line.get('isdescription'))) return true;                                               // :501
    var wh = A().Env.getContextAsInt(ctx, '#M_Warehouse_ID'), rule = null, drop = -1;            // :504-516
    if (nz(line.get('c_orderline_id')) > 0) { var ol = trx.get('c_orderline', line.get('c_orderline_id')), od = ol ? trx.get('c_order', ol.c_order_id) : null;
      if (od) { rule = od.deliveryviarule == null ? null : od.deliveryviarule; drop = nz(od.dropship_location_id); } }
    else if (nz(line.get('m_inoutline_id')) > 0) { var iol = trx.get('m_inoutline', line.get('m_inoutline_id')), io = iol ? trx.get('m_inout', iol.m_inout_id) : null; if (io) rule = io.deliveryviarule == null ? null : io.deliveryviarule; }
    else if (nz(inv.c_order_id) > 0) { var o2 = trx.get('c_order', inv.c_order_id); if (o2) rule = o2.deliveryviarule == null ? null : o2.deliveryviarule; }
    var dt = dayTS(inv.dateinvoiced), loc = nz(inv.c_bpartner_location_id);
    var id = taxGet(ctx, nz(line.get('m_product_id')), nz(line.get('c_charge_id')), dt, dt, nz(line.get('ad_org_id')), wh, loc, loc, drop, Y(inv.issotrx), rule);   // :517-520
    if (id === 0) { say(trx, '§MODEL-SEVERE MInvoiceLine.setTax No Tax found'); return false; }
    line.set('c_tax_id', id); return true;
  }


  // MInvoiceLine.beforeSave :877-940 — the price part that decides whether the save is refused (setPrice :429-469, UnderLimitPrice :903-909)
  function ilBeforeSaveChecks(trx, ctx, line, inv) {
    if (Y(inv.processed)) return null;                                                                                  // parentComplete (isReversal not modelled: no reversal flag in the bundle)
    var Mm = R().M, Env = A().Env;
    if (nz(line.get('c_charge_id')) !== 0) { if (nz(line.get('m_product_id')) !== 0) line.set('m_product_id', null); return null; }   // :892-896
    if (bd(line.get('priceactual')).compareTo(Env.ZERO) === 0 && bd(line.get('pricelist')).compareTo(Env.ZERO) === 0 && nz(line.get('m_product_id')) !== 0 && !Y(line.get('isdescription'))) {   // :898-901 setPrice()
      var mpp = new Mm.MProductPricing();
      mpp.setInvoiceLine({ getM_Product_ID: function () { return nz(line.get('m_product_id')); }, getC_Invoice_ID: function () { return nz(line.get('c_invoice_id')); },
        getQtyInvoiced: function () { return bd(line.get('qtyinvoiced')); }, getQtyEntered: function () { return bd(line.get('qtyentered')); } }, trx);
      mpp.setM_PriceList_ID(nz(inv.m_pricelist_id));
      line.set('priceactual', mpp.getPriceStd()).set('pricelist', mpp.getPriceList()).set('pricelimit', mpp.getPriceLimit());
      var qe = bd(line.get('qtyentered')), qi = bd(line.get('qtyinvoiced'));
      if (qe.compareTo(qi) === 0) line.set('priceentered', line.get('priceactual')); else line.set('priceentered', bd(line.get('priceactual')).multiply(qi.divide(qe, 6, HU())));
      if (nz(line.get('c_uom_id')) === 0) line.set('c_uom_id', mpp.getC_UOM_ID());
    }
    var pl = trx.get('m_pricelist', inv.m_pricelist_id), enforce = Y(inv.issotrx) && pl && Y(pl.enforcepricelimit);       // :903-905
    if (enforce) { var role = trx.get('ad_role', Env.getAD_Role_ID(ctx)); if (role && Y(role.isoverwritepricelimit)) enforce = false; }
    if (enforce && bd(line.get('pricelimit')).compareTo(Env.ZERO) !== 0 && bd(line.get('priceactual')).compareTo(bd(line.get('pricelimit'))) < 0) {   // :906-910
      say(trx, '§MODEL-SEVERE MInvoiceLine.save UnderLimitPrice PriceEntered=' + line.get('priceentered') + ', PriceLimit=' + line.get('pricelimit')); return 'UnderLimitPrice';
    }
    return null;
  }

  // ══ MInvoice.copyLinesFrom(otherInvoice, counter, setOrder, copyClientOrg) (MInvoice.java:937-1013) ═════════════
  S.MInvoice_copyLinesFrom = function (trx, ctx, to, other, counter, setOrder, copyClientOrg) {
    if (Y(to.processed) || Y(to.posted) || other == null) return 0;                              // :951
    var m = ML(), C = CT(), fromLines = trx.find('c_invoiceline', { c_invoice_id: other.c_invoice_id }, ['line', 'c_invoiceline_id']);   // getLines ORDER BY Line, C_InvoiceLine_ID :883
    var count = 0;
    for (var i = 0; i < fromLines.length; i++) {
      var fl = fromLines[i], line = prune(trx, 'c_invoiceline', C.MInvoiceLine(trx, to));                                      // new MInvoiceLine(ctx,0,trx): setInitialDefaults :150-163 (+ parent ids overwritten below)
      if (counter || !copyClientOrg) S.copyValues(trx, 'c_invoiceline', fl, line, to.ad_client_id, to.ad_org_id);   // :959-962
      else S.copyValues(trx, 'c_invoiceline', fl, line, fl.ad_client_id, fl.ad_org_id);
      line.set('c_invoice_id', to.c_invoice_id);                                                  // :963 (+ setInvoice :964 caches header fields)
      if (!setOrder) line.set('c_orderline_id', null);                                            // :967-968
      line.set('ref_invoiceline_id', null).set('m_inoutline_id', null).set('a_asset_id', null);   // :969-971
      line.set('m_attributesetinstance_id', 0).set('s_resourceassignment_id', null);              // :972-973
      if (String(nz(to.c_bpartner_id)) !== String(nz(other.c_bpartner_id))) ilSetTax(trx, ctx, line, to);   // :975-976
      if (counter) {                                                                              // :978-994
        line.set('ref_invoiceline_id', fkNull(fl.c_invoiceline_id));
        if (nz(fl.c_orderline_id) !== 0) { var peer = trx.get('c_orderline', fl.c_orderline_id); if (peer && nz(peer.ref_orderline_id) !== 0) line.set('c_orderline_id', peer.ref_orderline_id); }
        line.set('m_inoutline_id', null);
        if (nz(fl.m_inoutline_id) !== 0) { var ip = trx.get('m_inoutline', fl.m_inoutline_id); if (ip && nz(ip.ref_inoutline_id) !== 0) line.set('m_inoutline_id', ip.ref_inoutline_id); }
      }
      line.set('processed', 'N');                                                                 // :996
      var ierr = ilBeforeSaveChecks(trx, ctx, line, to);
      if (!ierr && line.save()) count++;                                                          // :997-998
      if (counter) {                                                                              // :1000-1004
        var r2 = ML().save(trx, 'c_invoiceline', trx.get('c_invoiceline', fl.c_invoiceline_id), { ref_invoiceline_id: line.id() }); if (!r2.ok) throw new Error('SaveError c_invoiceline: ' + r2.error);
      }
      // line.copyLandedCostFrom(fromLine) :1007 (MInvoiceLine.java:1364-1383); line.allocateLandedCosts() :1008 (:1075-1085)
      var lcs = [];
      try { lcs = trx.find('c_landedcost', { c_invoiceline_id: fl.c_invoiceline_id }); } catch (e) { lcs = []; }
      lcs.forEach(function (lc) {
        var nlc = newRec(trx, 'c_landedcost');
        S.copyValues(trx, 'c_landedcost', lc, nlc, lc.ad_client_id, lc.ad_org_id);
        nlc.set('c_invoiceline_id', line.id()); nlc.save();
      });
      if (lcs.length > 0) say(trx, '§PROC-UNPORTED-DEP MInvoiceLine.allocateLandedCosts (MInvoiceLine.java:1075-1260) — ' + lcs.length + ' landed cost(s) copied, allocation not ported');
      // allocateLandedCosts: DELETE FROM C_LandedCostAllocation WHERE C_InvoiceLine_ID=<new line> removes nothing for a line created in this Trx
    }
    if (fromLines.length !== count) say(trx, '§MODEL-SEVERE MInvoice.copyLinesFrom Line difference - From=' + fromLines.length + ' <> Saved=' + count);   // :1010
    return count;
  };

  // ══ GL Journal ═══════════════════════════════════════════════════════════════════════════════════════════════
  var DIM_COLS = ['account_id', 'c_subacct_id', 'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id', 'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id'];
  function jlParent(trx, line) { return trx.get('gl_journal', line.get('gl_journal_id')); }
  // MJournalLine.updateJournalTotal :371-397 (raw SQL sums → computed from the Trx's rows; IsActive='Y' lines; batch sums every journal)
  function updateJournalTotal(trx, journalId) {
    var Mm = ML(), dr = ZERO(), cr = ZERO();
    trx.find('gl_journalline', { gl_journal_id: journalId }).filter(function (l) { return l.isactive === 'Y'; }).forEach(function (l) { dr = dr.add(bd(l.amtacctdr) || ZERO()); cr = cr.add(bd(l.amtacctcr) || ZERO()); });
    var j = trx.get('gl_journal', journalId);
    trx.update('gl_journal', j, { totaldr: Mm.N(dr), totalcr: Mm.N(cr) });
    j = trx.get('gl_journal', journalId);
    if (nz(j.gl_journalbatch_id) !== 0) {
      var bdr = ZERO(), bcr = ZERO();
      trx.find('gl_journal', { gl_journalbatch_id: j.gl_journalbatch_id }).forEach(function (x) { bdr = bdr.add(bd(x.totaldr) || ZERO()); bcr = bcr.add(bd(x.totalcr) || ZERO()); });
      trx.update('gl_journalbatch', trx.get('gl_journalbatch', j.gl_journalbatch_id), { totaldr: Mm.N(bdr), totalcr: Mm.N(bcr) });
    }
  }
  // MJournalLine.beforeSave :279-339 (+ fillDimensionsFromCombination :345-368)
  function jlBeforeSave(trx, ctx, line, isNew) {
    var par = jlParent(trx, line);
    if (isNew && par && Y(par.processed)) return 'ParentComplete';                              // :282-285
    if (nz(line.get('ad_org_id')) <= 0) line.set('ad_org_id', par.ad_org_id);                   // :289-290
    if (nz(line.get('line')) === 0) {                                                           // :292-293 (includes this Trx's pending lines)
      var mx = 0; trx.find('gl_journalline', { gl_journal_id: line.get('gl_journal_id') }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); });
      line.set('line', mx + 10);
    }
    if (nz(line.get('c_currency_id')) === 0) line.set('c_currency_id', par.c_currency_id);      // :295-296
    if (nz(line.get('c_conversiontype_id')) === 0) line.set('c_conversiontype_id', par.c_conversiontype_id);   // :297-298
    if (nz(line.get('c_validcombination_id')) === 0) {                                          // :299-300 getOrCreateCombination (MAccount.get/create) — not in the bundle
      say(trx, '§PROC-UNPORTED-DEP MJournalLine.getOrCreateCombination (MAccount.get, MAcctSchemaElement mandatory dims) — C_ValidCombination_ID=0');
      return 'SaveError: @FillMandatory@@C_ValidCombination_ID@';
    }
    var vc = trx.get('c_validcombination', line.get('c_validcombination_id'));                  // :303 fillDimensionsFromCombination
    if (vc) {
      DIM_COLS.forEach(function (c) { line.set(c, nz(vc[c]) > 0 ? vc[c] : null); });
      if (nz(vc.ad_org_id) > 0) line.set('ad_org_id', vc.ad_org_id);
    }
    var prec = 2, rate = bd(line.get('currencyrate')), amt = rate.multiply(bd(line.get('amtsourcedr')));   // :304-312 (m_precision stays 2 unless setC_Currency_ID ran)
    if (amt.scale() > prec) amt = amt.setScale(prec, HU());
    line.set('amtacctdr', amt);
    amt = rate.multiply(bd(line.get('amtsourcecr'))); if (amt.scale() > prec) amt = amt.setScale(prec, HU());
    line.set('amtacctcr', amt);
    return null;
  }
  // MJournal.setDateAcct :174-184
  function jSetDateAcct(trx, ctx, j, d) {
    j.set('dateacct', d); if (d == null) return;
    var pid = R().M.MPeriod.getC_Period_ID(ctx, dayTS(d), nz(j.get('ad_org_id')));
    if (pid === 0) say(trx, '§MODEL-SEVERE MJournal.setDateAcct PeriodNotFound : ' + d);
    else if (pid !== nz(j.get('c_period_id'))) j.set('c_period_id', pid);
  }
  // MJournal.beforeSave :299-364
  function jBeforeSave(trx, ctx, j, isNew) {
    var M = R().M;
    if (nz(j.get('gl_journalbatch_id')) > 0) { var par = trx.get('gl_journalbatch', j.get('gl_journalbatch_id')); if (isNew && par && Y(par.processed)) return 'ParentComplete'; }
    if (j.get('datedoc') == null) { if (j.get('dateacct') == null) j.set('datedoc', trx.env.date); else j.set('datedoc', j.get('dateacct')); }
    if (j.get('dateacct') == null) jSetDateAcct(trx, ctx, j, j.get('datedoc'));
    else if (!Y(j.get('processed'))) {
      var pid = M.MPeriod.getC_Period_ID(ctx, dayTS(j.get('dateacct')), nz(j.get('ad_org_id')));
      if (pid === 0) return 'PeriodNotFound';
      else if (pid !== nz(j.get('c_period_id'))) {
        var cp = nz(j.get('c_period_id')) ? trx.get('c_period', j.get('c_period_id')) : null;
        if (cp == null) throw new Error('NullPointerException: MPeriod.get(ctx, ' + nz(j.get('c_period_id')) + ') is null (MJournal.java:339)');
        if (cp.periodtype === 'S') j.set('c_period_id', pid);
      }
    }
    if (nz(j.get('gl_category_id')) === 0 && nz(j.get('c_doctype_id')) > 0) { var dt = trx.get('c_doctype', j.get('c_doctype_id')); if (dt) j.set('gl_category_id', dt.gl_category_id); }   // :343-344
    if (nz(j.get('c_acctschema_id')) === 0) { var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [j.get('ad_client_id')])[0]; if (ci) j.set('c_acctschema_id', ci.a); }   // :346-347
    if (nz(j.get('c_conversiontype_id')) === 0) j.set('c_conversiontype_id', M.MConversionType.getDefault(nz(j.get('ad_client_id'))));   // :349-350
    // :365-371 propagate DateAcct change to lines: UPDATE GL_JournalLine … WHERE GL_Journal_ID=<new id> matches no row for a new journal
    return null;
  }
  // MJournal.updateBatch :412-424 (IsActive='Y' journals)
  function jUpdateBatch(trx, j) {
    if (nz(j.gl_journalbatch_id) === 0) return;
    var dr = ZERO(), cr = ZERO();
    trx.find('gl_journal', { gl_journalbatch_id: j.gl_journalbatch_id }).filter(function (x) { return x.isactive === 'Y'; }).forEach(function (x) { dr = dr.add(bd(x.totaldr) || ZERO()); cr = cr.add(bd(x.totalcr) || ZERO()); });
    trx.update('gl_journalbatch', trx.get('gl_journalbatch', j.gl_journalbatch_id), { totaldr: ML().N(dr), totalcr: ML().N(cr) });
  }

  // ══ MJournal.copyLinesFrom(fromJournal, dateAcct, typeCR) (MJournal.java:243-277) ════════════════════════════
  S.MJournal_copyLinesFrom = function (trx, ctx, to, from, dateAcct, typeCR) {
    if (Y(to.processed) || from == null) return 0;                                               // :245
    var m = ML(), fromLines = trx.find('gl_journalline', { gl_journal_id: from.gl_journal_id }, ['line', 'gl_journalline_id']);   // getLines ORDER BY Line,GL_JournalLine_ID :228
    var count = 0;
    for (var i = 0; i < fromLines.length; i++) {
      var fl = fromLines[i], tl = newRec(trx, 'gl_journalline');
      tl.set('line', 0).set('amtacctcr', 0).set('amtacctdr', 0).set('amtsourcecr', 0).set('amtsourcedr', 0).set('currencyrate', 1).set('dateacct', trx.env.date).set('isgenerated', 'Y');   // setInitialDefaults :64-72
      S.copyValues(trx, 'gl_journalline', fl, tl, to.ad_client_id, to.ad_org_id);                // :252
      tl.set('gl_journal_id', to.gl_journal_id);                                                 // :253
      if (dateAcct != null) tl.set('dateacct', dateAcct);                                        // :255-256
      if (typeCR === 'C') { tl.set('amtsourcedr', bd(fl.amtsourcedr).negate()).set('amtsourcecr', bd(fl.amtsourcecr).negate()); }   // :258-262
      else if (typeCR === 'R') { tl.set('amtsourcedr', fl.amtsourcecr).set('amtsourcecr', fl.amtsourcedr); }                         // :263-267
      tl.set('isgenerated', 'Y').set('processed', 'N');                                          // :268-269
      var err = jlBeforeSave(trx, ctx, tl, true);                                                // :270 save() → beforeSave
      if (err) { say(trx, '§MODEL-PO save gl_journalline refused: ' + err); continue; }
      if (tl.save()) { count++; updateJournalTotal(trx, tl.get('gl_journal_id')); }              // afterSave → updateJournalTotal :353-359
    }
    if (fromLines.length !== count) say(trx, '§MODEL-SEVERE MJournal.copyLinesFrom Line difference - JournalLines=' + fromLines.length + ' <> Saved=' + count);   // :275
    return count;
  };

  // ══ MJournalBatch.copyDetailsFrom(jb) (MJournalBatch.java:231-265) ════════════════════════════════════════════
  S.MJournalBatch_copyDetailsFrom = function (trx, ctx, to, jb) {
    if (Y(to.processed) || jb == null) return 0;                                                 // :233
    var m = ML(), count = 0, lineCount = 0;
    var fromJournals = trx.find('gl_journal', { gl_journalbatch_id: jb.gl_journalbatch_id }).sort(function (a, b) { return String(a.documentno) < String(b.documentno) ? -1 : String(a.documentno) > String(b.documentno) ? 1 : 0; });   // ORDER BY DocumentNo :199
    for (var i = 0; i < fromJournals.length; i++) {
      var fj = fromJournals[i], tj = newRec(trx, 'gl_journal');
      tj.set('currencyrate', 1).set('datedoc', trx.env.date).set('docaction', 'CO').set('docstatus', 'DR').set('postingtype', 'A').set('totalcr', 0).set('totaldr', 0)
        .set('isapproved', 'N').set('isprinted', 'N').set('posted', 'N').set('processed', 'N');   // setInitialDefaults :90-102
      S.copyValues(trx, 'gl_journal', fj, tj, to.ad_client_id, to.ad_org_id);                    // :241
      tj.set('gl_journalbatch_id', to.gl_journalbatch_id);                                       // :242
      tj.set('documentno', null).set('c_period_id', null);                                       // :243-244
      tj.set('datedoc', to.datedoc);                                                             // :245
      jSetDateAcct(trx, ctx, tj, to.dateacct);                                                   // :246 MJournal.setDateAcct
      tj.set('docstatus', 'DR').set('docaction', 'CO').set('totalcr', 0).set('totaldr', 0).set('isapproved', 'N').set('isprinted', 'N').set('posted', 'N').set('processed', 'N');   // :247-254
      var err = jBeforeSave(trx, ctx, tj, true);
      if (err) { say(trx, '§MODEL-PO save gl_journal refused: ' + err); continue; }
      if (tj.save()) {                                                                           // :255
        count++; jUpdateBatch(trx, tj.row);                                                      // MJournal.afterSave → updateBatch
        lineCount += S.MJournal_copyLinesFrom(trx, ctx, tj.row, fj, to.dateacct, 'x');           // :258
      }
    }
    if (fromJournals.length !== count) say(trx, '§MODEL-SEVERE MJournalBatch.copyDetailsFrom Line difference - Journals=' + fromJournals.length + ' <> Saved=' + count);   // :262
    return count + lineCount;
  };
  S._jBeforeSave = jBeforeSave;

  // ══ MBankStatementLine (MBankStatementLine.java) ═════════════════════════════════════════════════════════════
  // new MBankStatementLine(statement) :100-107 (+ setStatementLineDate :135-140)
  S.MBankStatementLine_new = function (trx, stmt) {
    var l = newBare(trx, 'c_bankstatementline');
    l.set('stmtamt', 0).set('trxamt', 0).set('interestamt', 0).set('chargeamt', 0).set('isreversal', 'N');   // setInitialDefaults :88-94
    l.set('ad_client_id', stmt.ad_client_id).set('ad_org_id', stmt.ad_org_id).set('c_bankstatement_id', stmt.c_bankstatement_id);
    l.set('statementlinedate', stmt.statementdate).set('valutadate', stmt.statementdate).set('dateacct', stmt.statementdate);
    return l;
  };
  // setPayment :146-163 — payment.getPayAmt(true): receipt → PayAmt, else negated (MPayment)
  S.MBankStatementLine_setPayment = function (line, pay) {
    line.set('c_payment_id', pay.c_payment_id).set('c_currency_id', pay.c_currency_id);
    var amt = bd(pay.payamt) || ZERO(); if (!Y(pay.isreceipt)) amt = amt.negate();
    var charge = line.get('chargeamt') == null ? ZERO() : bd(line.get('chargeamt')), interest = line.get('interestamt') == null ? ZERO() : bd(line.get('interestamt'));
    line.set('trxamt', amt).set('stmtamt', amt.add(charge).add(interest)).set('description', pay.description);
  };
  // isDateConsistentIfUsedForPosting :310-327
  function bslDateConsistent(trx, ctx, line, stmt) {
    if (!P.PSUP.sysConfigBool('BANK_STATEMENT_POST_WITH_DATE_FROM_LINE', false, nz(line.get('ad_client_id')), 0)) return true;
    var M = R().M, hp = M.MPeriod.get(ctx, dayTS(stmt.dateacct), nz(stmt.ad_org_id)), lp = M.MPeriod.get(ctx, dayTS(line.get('dateacct')), nz(stmt.ad_org_id));
    return hp != null && lp != null && hp.getC_Period_ID() === lp.getC_Period_ID();
  }
  // beforeSave :166-260
  function bslBeforeSave(trx, ctx, line, isNew) {
    var stmt = trx.get('c_bankstatement', line.get('c_bankstatement_id'));
    if (isNew && stmt && Y(stmt.processed)) return 'ParentComplete';                               // :168-171
    if (isNew && !bslDateConsistent(trx, ctx, line, stmt)) return 'SaveError BankStatementLinePeriodNotSameAsHeader';   // :174-179
    if (nz(line.get('c_payment_id')) !== 0 && nz(line.get('c_depositbatch_id')) !== 0) return 'SaveError EitherPaymentOrDepositBatch';   // :181-184
    if (nz(line.get('c_depositbatch_id')) !== 0) { var db = trx.get('c_depositbatch', line.get('c_depositbatch_id')); if (!db || !Y(db.processed)) return 'SaveError DepositBatchIsNotProcessed'; }   // :186-189
    var amt = bd(line.get('stmtamt')).subtract(bd(line.get('trxamt'))).subtract(bd(line.get('interestamt')));   // :192-196
    if (amt.compareTo(bd(line.get('chargeamt'))) !== 0) line.set('chargeamt', amt);
    if (bd(line.get('chargeamt')).signum() !== 0 && nz(line.get('c_charge_id')) === 0) return 'FillMandatory C_Charge_ID';   // :198-202
    if (bd(line.get('trxamt')).signum() === 0 && nz(line.get('c_payment_id')) > 0) { line.set('c_payment_id', null).set('c_invoice_id', null); }   // :204-208
    if (nz(line.get('line')) === 0) {                                                            // :210-214 MAX(Line)+10 (incl. this Trx's pending lines)
      var mx = 0; trx.find('c_bankstatementline', { c_bankstatement_id: line.get('c_bankstatement_id') }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); });
      line.set('line', mx + 10);
    }
    if (nz(line.get('c_payment_id')) !== 0 && nz(line.get('c_bpartner_id')) === 0) {              // :216-223
      var pay = trx.get('c_payment', line.get('c_payment_id'));
      line.set('c_bpartner_id', pay.c_bpartner_id); if (nz(pay.c_invoice_id) !== 0) line.set('c_invoice_id', pay.c_invoice_id);
    }
    if (nz(line.get('c_invoice_id')) !== 0 && nz(line.get('c_bpartner_id')) === 0) { var inv = trx.get('c_invoice', line.get('c_invoice_id')); line.set('c_bpartner_id', inv.c_bpartner_id); }   // :225-229
    return null;
  }
  // updateHeader :262-287
  function bslUpdateHeader(trx, stmtId) {
    var sum = ZERO(); trx.find('c_bankstatementline', { c_bankstatement_id: stmtId }).filter(function (l) { return l.isactive === 'Y'; }).forEach(function (l) { sum = sum.add(bd(l.stmtamt) || ZERO()); });
    var st = trx.get('c_bankstatement', stmtId);
    trx.update('c_bankstatement', st, { statementdifference: ML().N(sum) });
    st = trx.get('c_bankstatement', stmtId);
    trx.update('c_bankstatement', st, { endingbalance: ML().N((bd(st.beginningbalance) || ZERO()).add(bd(st.statementdifference) || ZERO())) });
  }
  // saveEx of a bank statement line: beforeSave → insert → afterSave(updateHeader)
  S.MBankStatementLine_saveEx = function (trx, ctx, line) {
    var err = bslBeforeSave(trx, ctx, line, true);
    if (err) throw new Error('SaveError c_bankstatementline: ' + err);
    line.saveEx(); bslUpdateHeader(trx, line.get('c_bankstatement_id'));
  };

  // ══ MProductPrice.setPrices (MProductPrice.java:setPrices) ═══════════════════════════════════════════════════
  S.MProductPrice_setPrices = function (trx, pp, list, std, limit) {
    var plv = trx.get('m_pricelist_version', pp.get('m_pricelist_version_id')), pl = plv ? trx.get('m_pricelist', plv.m_pricelist_id) : null;
    var prec = pl ? Number(pl.priceprecision) : 0;
    pp.set('pricelimit', bd(limit).setScale(prec, HU())).set('pricelist', bd(list).setScale(prec, HU())).set('pricestd', bd(std).setScale(prec, HU()));
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
