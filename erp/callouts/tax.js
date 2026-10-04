// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/tax.js — Tax (M/Tax.java) + the DefaultTaxLookup path (Core.getTaxLookup) + MTax.getAll/getPostals,
// MCountryGroup.countryGroupContains, MLocation read — ported verbatim (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP
// — Witness: W-CP-SUPPORT-ORACLE). Fills AdCallout.RUNTIME.M. M = org.adempiere.base/src/org/compiere/model.
// The tax exceptions (org/adempiere/exceptions/Tax*Exception.java) are thrown as AdempiereException with their @Msg@ text.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, Env = R.Env, Msg = R.Msg;
  function DB() { return R.DB; }
  function ex(msg) { return R.AdempiereException(Msg.parseTranslation(null, msg)); }

  // ── exceptions (messages as the Java builds them) ────────────────────────────────────────────────────────
  function TaxForChargeNotFound(C_Charge_ID, AD_Org_ID, M_Warehouse_ID, bill, ship, add) {                       // TaxForChangeNotFoundException.java:47-63
    var msg = '@TaxForChargeNotFound@';
    if (add != null && String(add).trim().length) msg += ' ' + add + ' - ';
    msg += ' @C_Charge_ID@:' + C_Charge_ID + ', @AD_Org_ID@:' + AD_Org_ID + ', @M_Warehouse_ID@:' + M_Warehouse_ID +
      ', @C_BPartner_Location_ID@:' + bill + '/' + ship;
    return ex(msg);
  }
  function TaxCriteriaNotFound(name, id) { return ex('@TaxCriteriaNotFound@ @' + name + '@ (ID ' + id + ')'); }    // TaxCriteriaNotFoundException.java:38-45
  function TaxNoExemptFound(AD_Org_ID) {                                                                           // TaxNoExemptFoundException.java:36-57
    var s;
    if (AD_Org_ID <= 0) s = '*';
    else { var o = R.PO.get('AD_Org', AD_Org_ID); s = (o == null || o.get_ID() !== AD_Org_ID) ? '?' : o.getName(); }
    return ex('@TaxNoExemptFound@@AD_Org_ID@:' + s);
  }
  function locStr(id) {                                                                                             // TaxNotFoundException.getLocationString
    if (id <= 0) return '?';
    var l = R.PO.get('C_Location', id);
    if (l == null) return '?';
    R.unportedDep('TaxNotFoundException.getLocationString', 'MLocation.toString formatting (message text only)');
    return [l.getAddress1(), l.getCity(), l.getPostal()].filter(function (x) { return x; }).join(' ');
  }
  function TaxNotFound(C_TaxCategory_ID, IsSOTrx, shipDate, sf, st, billDate, bf, bt) {                            // TaxNotFoundException.java:42-100
    var cat = C_TaxCategory_ID <= 0 ? null : R.PO.get('C_TaxCategory', C_TaxCategory_ID);
    var df = function (t) { return t == null ? 'null' : t.toString().slice(0, 10); };
    return ex('@TaxNotFound@ - @C_TaxCategory_ID@:' + (cat ? cat.getName() : '?') + ', @IsSOTrx@:@' + (IsSOTrx ? 'Y' : 'N') + '@' +
      ', @Shipment@ (' + df(shipDate) + ', ' + locStr(sf) + ' -> ' + locStr(st) + ')' +
      ', @Invoice@ (' + df(billDate) + ', ' + locStr(bf) + ' -> ' + locStr(bt) + ')');
  }

  // ── MLocation (new MLocation(ctx, id, trx) — :186-203, id 0 = initial defaults: default country/region) ──
  function location(ctx, id) {
    if (id > 0) {
      var l = R.PO.get('C_Location', id);
      if (l) return { getC_Country_ID: function () { return l.getC_Country_ID() || 0; }, getC_Region_ID: function () { return l.getC_Region_ID() || 0; },
        getPostal: function () { return l.getPostal(); } };
    }
    // setInitialDefaults: MCountry.getDefault() (login's #C_Country_ID), MRegion.getDefault() when it is in that country
    var c = Env.getContextAsInt(ctx, '#C_Country_ID'), rg = Env.getContextAsInt(ctx, '#C_Region_ID'), region = 0;
    if (rg > 0) { var rr = DB().query('SELECT C_Country_ID AS c FROM C_Region WHERE C_Region_ID=?', [rg])[0]; if (rr && Number(rr.c) === c) region = rg; }
    return { getC_Country_ID: function () { return c; }, getC_Region_ID: function () { return region; }, getPostal: function () { return null; } };
  }
  // ── MCountryGroup.countryGroupContains (M/MCountryGroup.java:158-172) ──────────────────────────────────────
  M.MCountryGroup = { countryGroupContains: function (gid, cid) {
    if (gid === 0 || cid === 0) return false;
    var cnt = M.Java.sv('MCountryGroup.countryGroupContains', "SELECT Count(*) FROM c_countrygroupcountry WHERE c_country_id = ? AND c_countrygroup_id = ? AND isactive = 'Y' ", cid, gid);
    return cnt > 0;
  } };
  // ── MTax.getAll (M/MTax.java:65-93) — Query.setClient_ID (AD_Client_ID=#client), PostgreSQL NULL ordering kept ──
  M.MTax = M.MTax || {};
  M.MTax.SOPOTYPE_Both = 'B'; M.MTax.SOPOTYPE_PurchaseTax = 'P'; M.MTax.SOPOTYPE_SalesTax = 'S';
  M.MTax.getAll = function (ctx) {
    return R.PO.list('C_Tax', "IsActive='Y' AND AD_Client_ID=?", [Env.getAD_Client_ID(ctx)],
      'C_CountryGroupFrom_ID NULLS LAST, C_Country_ID NULLS LAST, C_Region_ID NULLS LAST, C_CountryGroupTo_ID NULLS LAST, To_Country_ID NULLS LAST, To_Region_ID NULLS LAST, ValidFrom DESC NULLS FIRST');
  };
  M.MTax.getPostals = function (tax) {                                                                             // :273-292 (null when none, as the Java)
    var l;
    try { l = R.PO.list('C_TaxPostal', "C_Tax_ID=? AND IsActive='Y'", [tax.getC_Tax_ID()], 'Postal NULLS LAST, Postal_To NULLS LAST'); }
    catch (e) { R.unportedDep('MTax.getPostals', 'bundle table C_TaxPostal (' + ((e && e.message) || e) + ') → no postals'); l = []; }
    return l.length ? l : null;
  };
  M.MTax.isPostal = function (tax) { var p = M.MTax.getPostals(tax); return p == null ? false : p.length > 0; };    // :297-303
  M.MTax.get = function (ctx, id) { return R.PO.get('C_Tax', id); };

  function nz(v) { return v == null ? 0 : v; }
  var Tax = M.Tax = {};
  // get(…product, charge…) :178-200 — overloads collapse to the 13-arg form (dropship -1, deliveryViaRule null by default)
  Tax.get = function (ctx, a, b, c, d, e, f, g, h, i, j, k, l) {
    if (typeof b === 'boolean') return Tax.getByCategory.apply(null, arguments);                                 // get(ctx, C_TaxCategory_ID, IsSOTrx, …) :713-760
    var M_Product_ID = a, C_Charge_ID = b, billDate = c, shipDate = d, AD_Org_ID = e, M_Warehouse_ID = f, bill = g, ship = h;
    var drop = -1, IsSOTrx, rule = null;
    if (typeof i === 'boolean') { IsSOTrx = i; if (k !== undefined) rule = j; }                                  // :65-70 (no rule) / :137-149 (rule, trxName)
    else { drop = i; IsSOTrx = j; if (l !== undefined) rule = k; }                                               // :100-106 (trxName only) / :178-183 (rule, trxName)
    if (M_Product_ID !== 0) return Tax.getProduct(ctx, M_Product_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID, bill, ship, drop, IsSOTrx, rule);
    else if (C_Charge_ID !== 0) return Tax.getCharge(ctx, C_Charge_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID, bill, ship, drop, IsSOTrx, rule);
    else return Tax.getExemptTax(ctx, AD_Org_ID);
  };
  // getCharge :283-370
  Tax.getCharge = function (ctx, C_Charge_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID, billC_BPartner_Location_ID, shipC_BPartner_Location_ID, dropshipC_BPartner_Location_ID, IsSOTrx, deliveryViaRule) {
    if (typeof dropshipC_BPartner_Location_ID === 'boolean') { deliveryViaRule = null; IsSOTrx = dropshipC_BPartner_Location_ID; dropshipC_BPartner_Location_ID = -1; }
    var C_TaxCategory_ID = 0, shipFrom = 0, shipTo = 0, dropship = 0, billFrom = 0, billTo = 0, wh = 0, IsTaxExempt = null;
    var ps = DB().prepareStatement('SELECT c.C_TaxCategory_ID, o.C_Location_ID, il.C_Location_ID, b.IsTaxExempt, b.IsPOTaxExempt, w.C_Location_ID, sl.C_Location_ID, dsl.C_Location_ID ' +
      'FROM C_Charge c JOIN AD_OrgInfo o ON (o.AD_Org_ID=?) JOIN C_BPartner_Location il ON (il.C_BPartner_Location_ID=?) INNER JOIN C_BPartner b ON (il.C_BPartner_ID=b.C_BPartner_ID) ' +
      ' LEFT OUTER JOIN M_Warehouse w ON (w.M_Warehouse_ID=?) JOIN C_BPartner_Location sl ON (sl.C_BPartner_Location_ID=?) LEFT JOIN C_BPartner_Location dsl ON (dsl.C_BPartner_Location_ID=?)WHERE c.C_Charge_ID=?');
    ps.setInt(1, AD_Org_ID); ps.setInt(2, billC_BPartner_Location_ID); ps.setInt(3, M_Warehouse_ID); ps.setInt(4, shipC_BPartner_Location_ID);
    ps.setInt(5, dropshipC_BPartner_Location_ID); ps.setInt(6, C_Charge_ID);
    var rs = ps.executeQuery(), found = false;
    if (rs.next()) {
      C_TaxCategory_ID = rs.getInt(1); billFrom = rs.getInt(2); billTo = rs.getInt(3);
      IsTaxExempt = IsSOTrx ? rs.getString(4) : rs.getString(5);
      shipFrom = rs.getInt(6); shipTo = rs.getInt(7); dropship = rs.getInt(8); wh = rs.getInt(6);
      found = true;
    }
    if (!found) throw TaxForChargeNotFound(C_Charge_ID, AD_Org_ID, M_Warehouse_ID, billC_BPartner_Location_ID, shipC_BPartner_Location_ID, null);
    else if ('Y' === IsTaxExempt) return Tax.getExemptTax(ctx, AD_Org_ID);
    if (!IsSOTrx) { var t = billFrom; billFrom = billTo; billTo = t; t = shipFrom; shipFrom = shipTo; shipTo = t; }     // Reverse for PO
    else if ('P' === deliveryViaRule) billTo = wh;                                                                 // X_C_Order.DELIVERYVIARULE_Pickup
    return Tax.getByCategory(ctx, C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, dropship, billDate, billFrom, billTo);   // Core.getTaxLookup() = DefaultTaxLookup → Tax.get
  };
  // getProduct :475-675
  Tax.getProduct = function (ctx, M_Product_ID, billDate, shipDate, AD_Org_ID, M_Warehouse_ID, billC_BPartner_Location_ID, shipC_BPartner_Location_ID, dropshipC_BPartner_Location_ID, IsSOTrx, deliveryViaRule) {
    if (typeof dropshipC_BPartner_Location_ID === 'boolean') { deliveryViaRule = null; IsSOTrx = dropshipC_BPartner_Location_ID; dropshipC_BPartner_Location_ID = -1; }
    var variable = '', C_TaxCategory_ID = 0, shipFrom = 0, shipTo = 0, billFrom = 0, billTo = 0, wh = 0, dropship = 0, IsTaxExempt = null, t;
    var ps = DB().prepareStatement('SELECT p.C_TaxCategory_ID, o.C_Location_ID, il.C_Location_ID, b.IsTaxExempt, b.IsPOTaxExempt,  w.C_Location_ID, sl.C_Location_ID, dsl.C_Location_ID ' +
      'FROM M_Product p JOIN AD_OrgInfo o ON (o.AD_Org_ID=?) JOIN C_BPartner_Location il ON (il.C_BPartner_Location_ID=?) INNER JOIN C_BPartner b ON (il.C_BPartner_ID=b.C_BPartner_ID)' +
      ' LEFT OUTER JOIN M_Warehouse w ON (w.M_Warehouse_ID=?) JOIN C_BPartner_Location sl ON (sl.C_BPartner_Location_ID=?) LEFT JOIN C_BPartner_Location dsl ON (dsl.C_BPartner_Location_ID=?) WHERE p.M_Product_ID=?');
    ps.setInt(1, AD_Org_ID); ps.setInt(2, billC_BPartner_Location_ID); ps.setInt(3, M_Warehouse_ID); ps.setInt(4, shipC_BPartner_Location_ID);
    ps.setInt(5, dropshipC_BPartner_Location_ID); ps.setInt(6, M_Product_ID);
    var rs = ps.executeQuery(), found = false;
    if (rs.next()) {                                                                                                // :513-526
      C_TaxCategory_ID = rs.getInt(1); billFrom = rs.getInt(2); billTo = rs.getInt(3);
      IsTaxExempt = IsSOTrx ? rs.getString(4) : rs.getString(5);
      shipFrom = rs.getInt(6); shipTo = rs.getInt(7); dropship = rs.getInt(8); wh = rs.getInt(6);
      found = true;
    }
    if (found && 'Y' === IsTaxExempt) return Tax.getExemptTax(ctx, AD_Org_ID);                                     // :529-532
    else if (found) {                                                                                               // :533-557
      if (!IsSOTrx) { t = billFrom; billFrom = billTo; billTo = t; t = shipFrom; shipFrom = shipTo; shipTo = t; }
      else if ('P' === deliveryViaRule) billTo = wh;
      return Tax.getByCategory(ctx, C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, dropship, billDate, billFrom, billTo);
    }
    // Detail for error isolation :561-668
    variable = 'M_Product_ID';
    C_TaxCategory_ID = DB().getSQLValue(null, 'SELECT C_TaxCategory_ID FROM M_Product WHERE M_Product_ID=?', M_Product_ID);
    if (C_TaxCategory_ID <= 0) throw TaxCriteriaNotFound(variable, M_Product_ID);
    variable = 'AD_Org_ID';
    billFrom = DB().getSQLValue(null, 'SELECT C_Location_ID FROM AD_OrgInfo WHERE AD_Org_ID=?', AD_Org_ID);
    if (billFrom <= 0) throw TaxCriteriaNotFound(variable, AD_Org_ID);
    variable = 'BillTo_ID';
    var ps2 = DB().prepareStatement('SELECT l.C_Location_ID, b.IsTaxExempt, b.IsPOTaxExempt  FROM C_BPartner_Location l INNER JOIN C_BPartner b ON (l.C_BPartner_ID=b.C_BPartner_ID)  WHERE C_BPartner_Location_ID=?');
    ps2.setInt(1, billC_BPartner_Location_ID);
    var rs2 = ps2.executeQuery();
    if (rs2.next()) { billTo = rs2.getInt(1); IsTaxExempt = IsSOTrx ? rs2.getString(2) : rs2.getString(3); }
    if (billTo <= 0) throw TaxCriteriaNotFound(variable, billC_BPartner_Location_ID);
    if ('Y' === IsTaxExempt) return Tax.getExemptTax(ctx, AD_Org_ID);
    if (!IsSOTrx) { t = billFrom; billFrom = billTo; billTo = t; }
    variable = 'M_Warehouse_ID';
    shipFrom = DB().getSQLValue(null, 'SELECT C_Location_ID FROM M_Warehouse WHERE M_Warehouse_ID=?', M_Warehouse_ID);
    if (shipFrom <= 0) throw TaxCriteriaNotFound(variable, M_Warehouse_ID);
    variable = 'C_BPartner_Location_ID';
    shipTo = DB().getSQLValue(null, 'SELECT C_Location_ID FROM C_BPartner_Location WHERE C_BPartner_Location_ID=?', shipC_BPartner_Location_ID);
    if (shipTo <= 0) throw TaxCriteriaNotFound(variable, shipC_BPartner_Location_ID);
    if (!IsSOTrx) { t = shipFrom; shipFrom = shipTo; shipTo = t; }
    return Tax.getByCategory(ctx, C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, -1, billDate, billFrom, billTo);   // :670-672 (the 9-arg get → dropship -1)
  };
  // getExemptTax :679-698
  Tax.getExemptTax = function (ctx, AD_Org_ID) {
    var C_Tax_ID = DB().getSQLValue(null, "SELECT t.C_Tax_ID FROM C_Tax t INNER JOIN AD_Org o ON (t.AD_Client_ID=o.AD_Client_ID) WHERE t.IsTaxExempt='Y' AND o.AD_Org_ID=? AND t.IsActive='Y' ORDER BY t.Rate DESC", AD_Org_ID);
    if (C_Tax_ID <= 0) throw TaxNoExemptFound(AD_Org_ID);
    return C_Tax_ID;
  };
  // get(ctx, C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, [dropship,] billDate, billFrom, billTo) :713-854
  Tax.getByCategory = function (ctx, C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, x, y, z, w) {
    var billDate, billFrom, billTo;
    if (w === undefined) { billDate = x; billFrom = y; billTo = z; }                                                // 9-arg :713-722
    else { billDate = y; billFrom = z; billTo = w; }                                                                // 10-arg :740 (dropship unused by the body)
    var taxes = M.MTax.getAll(ctx);
    var lFrom = location(ctx, billFrom), lTo = location(ctx, billTo), i, tax;
    for (i = 0; i < taxes.length; i++) {
      tax = taxes[i];
      if (nz(tax.getC_TaxCategory_ID()) !== C_TaxCategory_ID || !tax.isActive() || nz(tax.getParent_Tax_ID()) !== 0) continue;   // user parent tax
      if (IsSOTrx && 'P' === tax.getSOPOType()) continue;
      if (!IsSOTrx && 'S' === tax.getSOPOType()) continue;
      var cgf = nz(tax.getC_CountryGroupFrom_ID()), cgt = nz(tax.getC_CountryGroupTo_ID());
      if ((cgf === 0 || M.MCountryGroup.countryGroupContains(cgf, lFrom.getC_Country_ID()))
        && (nz(tax.getC_Country_ID()) === lFrom.getC_Country_ID() || nz(tax.getC_Country_ID()) === 0)
        && (nz(tax.getC_Region_ID()) === lFrom.getC_Region_ID() || nz(tax.getC_Region_ID()) === 0)
        && (cgt === 0 || M.MCountryGroup.countryGroupContains(cgt, lTo.getC_Country_ID()))
        && (nz(tax.getTo_Country_ID()) === lTo.getC_Country_ID() || nz(tax.getTo_Country_ID()) === 0)
        && (nz(tax.getTo_Region_ID()) === lTo.getC_Region_ID() || nz(tax.getTo_Region_ID()) === 0)
        && !tax.getValidFrom().after(billDate)) {                                                                    // :783-805
        if (!M.MTax.isPostal(tax)) return tax.getC_Tax_ID();
        var postals = M.MTax.getPostals(tax);
        for (var j = 0; j < postals.length; j++) {
          var postal = postals[j];
          if (postal.isActive() && String(postal.getPostal()).indexOf(String(lFrom.getPostal())) === 0
            && (postal.getPostal_To() == null || String(postal.getPostal_To()).indexOf(String(lTo.getPostal())) === 0))
            return tax.getC_Tax_ID();
        }
      }
    }
    for (i = 0; i < taxes.length; i++) {                                                                            // Default Tax :825-837
      tax = taxes[i];
      if (!tax.isDefault() || !tax.isActive() || nz(tax.getParent_Tax_ID()) !== 0) continue;
      if (IsSOTrx && 'P' === tax.getSOPOType()) continue;
      if (!IsSOTrx && 'S' === tax.getSOPOType()) continue;
      return tax.getC_Tax_ID();
    }
    throw TaxNotFound(C_TaxCategory_ID, IsSOTrx, shipDate, shipFrom, shipTo, billDate, billFrom, billTo);
  };
  M.Core = M.Core || {};
  M.Core.getTaxLookup = function () { return { get: Tax.get }; };                                                  // Core.java:1105-1113 → DefaultTaxLookup
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
