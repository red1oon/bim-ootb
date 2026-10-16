// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/pricing.js — MProductPricing (+ AbstractProductPricing / IProductPricing default = Core.getProductPricing()),
// MPriceList statics, MDiscountSchema(+Break) pricing logic, MProductCategory.isCategory — ported verbatim
// (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-SUPPORT-ORACLE). Fills AdCallout.RUNTIME.M.
// M = org.adempiere.base/src/org/compiere/model, B = org.adempiere.base/src/org/adempiere/base. Read-only.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, Env = R.Env, RM = R.RM, BD = R.BD, Timestamp = R.Timestamp;
  function DB() { return R.DB; }
  // SQL errors inside calculate* are caught by the Java (log + m_calculated=false); a table absent from the bundle is logged as a dep
  function exec(where, ps) {
    try { return ps.executeQuery(); }
    catch (e) { var m = String((e && e.message) || e); if (/no such (table|column)/.test(m)) R.unportedDep(where, 'bundle table/column: ' + m); else R.log('§PRICING-SQL-ERR ' + where + ' ' + m); return null; }
  }

  // ── MPriceList (M/MPriceList.java) ──────────────────────────────────────────────────────────────────────
  var MPriceList = M.MPriceList = {
    get: function (ctx, M_PriceList_ID) { if (M_PriceList_ID === undefined) M_PriceList_ID = ctx; return R.PO.get('M_PriceList', M_PriceList_ID); },   // :50-88
    getDefault: function (ctx, IsSOPriceList, ISOCurrency) {                                                         // :111-140 / :149-189
      var cl = Env.getAD_Client_ID(ctx);
      if (ISOCurrency != null) {
        var cur = DB().query('SELECT C_Currency_ID AS c FROM C_Currency WHERE ISO_Code=?', [ISOCurrency])[0];
        if (cur == null) return MPriceList.getDefault(ctx, IsSOPriceList);
        return R.PO.first('M_PriceList', "AD_Client_ID=? AND IsDefault=? AND IsSOPriceList=? AND C_Currency_ID=? AND IsActive='Y' ORDER BY M_PriceList_ID", [cl, 'Y', IsSOPriceList ? 'Y' : 'N', cur.c]);
      }
      return R.PO.first('M_PriceList', "AD_Client_ID=? AND IsDefault=? AND IsSOPriceList=? AND IsActive='Y' ORDER BY M_PriceList_ID", [cl, 'Y', IsSOPriceList ? 'Y' : 'N']);
    },
    getStandardPrecision: function (ctx, M_PriceList_ID) {                                                           // :194-198 → :356-364
      var pl = MPriceList.get(ctx, M_PriceList_ID);
      return M.MCurrency.getStdPrecision(ctx, pl.getC_Currency_ID());
    },
    getPricePrecision: function (ctx, M_PriceList_ID) { var pl = MPriceList.get(ctx, M_PriceList_ID); return pl.getPricePrecision(); },   // :206-210
    getPriceListVersion: function (pl, valid) {                                                                      // :332-350
      if (valid == null) valid = new Timestamp(R.now());
      return R.PO.first('M_PriceList_Version', "M_PriceList_ID=? AND date(ValidFrom)<=date(?) AND IsActive='Y' ORDER BY ValidFrom DESC", [pl.getM_PriceList_ID(), valid]);
    }
  };

  // ── MProductCategory.isCategory (M/MProductCategory.java:86-118) ───────────────────────────────────────────
  M.MProductCategory = M.MProductCategory || {};
  M.MProductCategory.isCategory = function (M_Product_Category_ID, M_Product_ID) {
    if (M_Product_ID === 0 || M_Product_Category_ID === 0) return false;
    var r = DB().query('SELECT M_Product_Category_ID AS c FROM M_Product WHERE M_Product_ID=?', [M_Product_ID])[0];
    var category = r ? Number(r.c) : null;
    if (category == null) return false;
    return category === M_Product_Category_ID;
  };

  // ── MDiscountSchema (M/MDiscountSchema.java) + MDiscountSchemaBreak.applies (M/MDiscountSchemaBreak.java:112-136) ──
  function breakApplies(br, Value, M_Product_ID, M_Product_Category_ID) {
    if (!br.isActive()) return false;
    if (Value.compareTo(br.getBreakValue()) < 0) return false;                                                       // below break value
    var bp = br.getM_Product_ID() || 0, bc = br.getM_Product_Category_ID() || 0;
    if (bp === 0 && bc === 0) return true;                                                                            // no product / category
    if (bp === M_Product_ID) return true;
    if (M_Product_Category_ID !== 0) return bc === M_Product_Category_ID;
    return M.MProductCategory.isCategory(bc, M_Product_ID);
  }
  function DiscountSchema(po) { this.po = po; this.m_breaks = null; }
  DiscountSchema.prototype.get_ID = function () { return this.po ? this.po.getM_DiscountSchema_ID() : 0; };
  DiscountSchema.prototype.getDiscountType = function () { return this.po.getDiscountType(); };
  DiscountSchema.prototype.getCumulativeLevel = function () { return this.po.getCumulativeLevel(); };
  DiscountSchema.prototype.getBreaks = function (reload) {                                                           // :173-207
    if (this.m_breaks != null && !reload) return this.m_breaks;
    this.m_breaks = R.PO.list('M_DiscountSchemaBreak', 'M_DiscountSchema_ID=?', [this.get_ID()], 'SeqNo');
    return this.m_breaks;
  };
  DiscountSchema.prototype.calculatePrice = function (Qty, Price, M_Product_ID, M_Product_Category_ID, BPartnerFlatDiscount) {   // :263-288
    if (Price == null || Env.ZERO.compareTo(Price) === 0) return Price;
    var discount = this.calculateDiscount(Qty, Price, M_Product_ID, M_Product_Category_ID, BPartnerFlatDiscount);
    if (discount == null || discount.signum() === 0) {
      var fixedPrice = this.calculateFixedPrice(Qty, Price, M_Product_ID, M_Product_Category_ID);
      if (fixedPrice != null) return fixedPrice;
      return Price;
    }
    return MDiscountSchema.calculateDiscountedPrice(Price, discount);
  };
  DiscountSchema.prototype.calculateDiscount = function (Qty, Price, M_Product_ID, M_Product_Category_ID, BPartnerFlatDiscount) {  // :311-377
    if (BPartnerFlatDiscount == null) BPartnerFlatDiscount = Env.ZERO;
    var t = this.getDiscountType();
    if ('F' === t) {                                                                                                   // DISCOUNTTYPE_FlatPercent
      if (this.po.isBPartnerFlatDiscount()) return BPartnerFlatDiscount;
      return this.po.getFlatDiscount();
    } else if ('S' === t || 'P' === t) {                                                                              // Formula / Pricelist: not supported
      return Env.ZERO;
    }
    this.getBreaks(false);
    var Amt = Price.multiply(Qty), qb = this.po.isQuantityBased();
    for (var i = 0; i < this.m_breaks.length; i++) {
      var br = this.m_breaks[i];
      if (!br.isActive()) continue;
      if (qb) { if (!breakApplies(br, Qty, M_Product_ID, M_Product_Category_ID)) continue; }
      else { if (!breakApplies(br, Amt, M_Product_ID, M_Product_Category_ID)) continue; }
      var discount = null;
      if (br.isBPartnerFlatDiscount()) discount = BPartnerFlatDiscount;
      else discount = br.getBreakDiscount();
      return discount;
    }
    return Env.ZERO;
  };
  DiscountSchema.prototype.calculateFixedPrice = function (Qty, Price, M_Product_ID, M_Product_Category_ID) {         // :387-428
    var t = this.getDiscountType();
    if ('F' === t || 'S' === t || 'P' === t) return null;
    this.getBreaks(false);
    var Amt = Price.multiply(Qty), qb = this.po.isQuantityBased();
    for (var i = 0; i < this.m_breaks.length; i++) {
      var br = this.m_breaks[i];
      if (!br.isActive()) continue;
      if (qb) { if (!breakApplies(br, Qty, M_Product_ID, M_Product_Category_ID)) continue; }
      else { if (!breakApplies(br, Amt, M_Product_ID, M_Product_Category_ID)) continue; }
      if (!br.isBPartnerFlatDiscount()) {
        var fp = br.getFixedPrice();
        if (fp != null && fp.signum() > 0) return fp;
      }
      return null;
    }
    return null;
  };
  var MDiscountSchema = M.MDiscountSchema = {
    DISCOUNTTYPE_Breaks: 'B', DISCOUNTTYPE_FlatPercent: 'F', DISCOUNTTYPE_Pricelist: 'P', DISCOUNTTYPE_Formula: 'S', CUMULATIVELEVEL_Line: 'L',
    get: function (ctx, id) { if (id === undefined) id = ctx; return new DiscountSchema(R.PO.get('M_DiscountSchema', id)); },   // :53-80
    calculateDiscountedPrice: function (price, discount) {                                                           // :294-300
      var onehundred = Env.ONEHUNDRED;
      var multiplier = onehundred.subtract(discount);
      multiplier = multiplier.divide(onehundred, 6, RM.HALF_UP);
      return price.multiply(multiplier);
    }
  };

  // ── MProductPricing (M/MProductPricing.java) extends AbstractProductPricing (B/AbstractProductPricing.java) ──
  function MProductPricing(M_Product_ID, C_BPartner_ID, Qty, isSOTrx, trxName) {
    // AbstractProductPricing fields :37-46
    this.m_M_Product_ID = 0; this.m_C_BPartner_ID = 0; this.m_Qty = Env.ONE; this.m_isSOTrx = true; this.trxName = null;
    this.m_M_PriceList_Version_ID = 0; this.m_M_PriceList_ID = 0; this.m_PriceDate = null;
    // MProductPricing fields :92-111
    this.m_precision = -1; this.m_calculated = false; this.m_vendorbreak = false; this.m_useVendorBreak = false; this.m_found = null;
    this.m_PriceList = Env.ZERO; this.m_PriceStd = Env.ZERO; this.m_PriceLimit = Env.ZERO; this.m_C_Currency_ID = 0;
    this.m_enforcePriceLimit = false; this.m_C_UOM_ID = 0; this.m_M_Product_Category_ID = 0; this.m_discountSchema = false; this.m_isTaxIncluded = false;
    if (M_Product_ID !== undefined) this.setInitialValues(M_Product_ID, C_BPartner_ID, Qty, isSOTrx, trxName);          // :63-67
  }
  var P = MProductPricing.prototype;
  // setInitialValues :76-79 → AbstractProductPricing :52-59
  P.setInitialValues = function (M_Product_ID, C_BPartner_ID, qty, isSOTrx, trxName) {
    this.trxName = trxName || null;
    this.m_M_Product_ID = M_Product_ID; this.m_C_BPartner_ID = C_BPartner_ID;
    if (qty != null && Env.ZERO.compareTo(qty) !== 0) this.m_Qty = qty;
    this.m_isSOTrx = isSOTrx;
    this.checkVendorBreak();
  };
  // checkVendorBreak :84-89 (DB.getSQLValue: an SQL error returns -1)
  P.checkVendorBreak = function () {
    var n;
    try { n = DB().getSQLValue(this.trxName, "SELECT COUNT(M_Product_ID) FROM M_ProductPriceVendorBreak WHERE IsActive='Y' AND M_Product_ID=? AND (C_BPartner_ID=? OR C_BPartner_ID IS NULL)", this.m_M_Product_ID, this.m_C_BPartner_ID); }
    catch (e) { R.unportedDep('MProductPricing.checkVendorBreak', 'M_ProductPriceVendorBreak (' + ((e && e.message) || e) + ') → DB.getSQLValue -1'); n = -1; }
    this.m_useVendorBreak = n > 0;
  };
  // AbstractProductPricing getters/setters :61-96
  P.getM_Product_ID = function () { return this.m_M_Product_ID; };
  P.getM_PriceList_ID = function () { return this.m_M_PriceList_ID; };
  P.setM_PriceList_ID = function (id) { this.m_M_PriceList_ID = id; this.m_calculated = false; };                  // :762-766
  P.getM_PriceList_Version_ID = function () { return this.m_M_PriceList_Version_ID; };                              // :772-775
  P.setM_PriceList_Version_ID = function (id) { this.m_M_PriceList_Version_ID = id; this.m_calculated = false; };   // :781-785
  P.setQty = function (qty) { this.m_Qty = qty; };
  P.getPriceDate = function () { return this.m_PriceDate; };
  P.setPriceDate = function (d) { this.m_PriceDate = d; this.m_calculated = false; };                              // :776-780
  // calculatePrice :116-160
  P.calculatePrice = function () {
    if (this.m_M_Product_ID === 0 || (this.m_found != null && !this.m_found)) return false;                         // previously not found
    if (this.m_useVendorBreak) {
      if (!this.m_calculated) { this.m_calculated = this.calculatePLV_VB(); if (this.m_calculated) this.m_vendorbreak = true; }
      if (!this.m_calculated) { this.m_calculated = this.calculatePL_VB(); if (this.m_calculated) this.m_vendorbreak = true; }
      if (!this.m_calculated) { this.m_calculated = this.calculateBPL_VB(); if (this.m_calculated) this.m_vendorbreak = true; }
    }
    if (!this.m_calculated) this.m_calculated = this.calculatePLV();                                                  // Price List Version known
    if (!this.m_calculated) this.m_calculated = this.calculatePL();                                                   // Price List known
    if (!this.m_calculated) this.m_calculated = this.calculateBPL();                                                  // Base Price List used
    if (!this.m_calculated) this.setBaseInfo();                                                                       // Set UOM, Prod.Category
    if (this.m_calculated && !this.m_vendorbreak) this.calculateDiscount();                                           // User based Discount
    this.setPrecision();
    this.m_found = !!this.m_calculated;
    return this.m_calculated;
  };
  // the shared row read of calculate*: cols 1-3 prices (wasNull→ZERO), 4 UOM, 6 currency, 7 category, 8 enforce, 9 taxIncluded (when the SQL has it)
  P._read = function (rs, readTaxIncluded) {
    this.m_PriceStd = rs.getBigDecimal(1); if (rs.wasNull()) this.m_PriceStd = Env.ZERO;
    this.m_PriceList = rs.getBigDecimal(2); if (rs.wasNull()) this.m_PriceList = Env.ZERO;
    this.m_PriceLimit = rs.getBigDecimal(3); if (rs.wasNull()) this.m_PriceLimit = Env.ZERO;
    this.m_C_UOM_ID = rs.getInt(4); this.m_C_Currency_ID = rs.getInt(6); this.m_M_Product_Category_ID = rs.getInt(7);
    this.m_enforcePriceLimit = 'Y' === rs.getString(8);
    if (readTaxIncluded) this.m_isTaxIncluded = 'Y' === rs.getString(9);
  };
  var BOM_SEL = 'SELECT bomPriceStd(p.M_Product_ID,pv.M_PriceList_Version_ID) AS PriceStd, bomPriceList(p.M_Product_ID,pv.M_PriceList_Version_ID) AS PriceList,' +
    ' bomPriceLimit(p.M_Product_ID,pv.M_PriceList_Version_ID) AS PriceLimit, p.C_UOM_ID,pv.ValidFrom,pl.C_Currency_ID,p.M_Product_Category_ID,';
  var VB_SEL = 'SELECT pp.PriceStd, pp.PriceList, pp.PriceLimit, p.C_UOM_ID,pv.ValidFrom,pl.C_Currency_ID,p.M_Product_Category_ID,';
  // calculatePLV :168-230
  P.calculatePLV = function () {
    if (this.m_M_Product_ID === 0 || this.m_M_PriceList_Version_ID === 0) return false;
    var ps = DB().prepareStatement(BOM_SEL + ' pl.EnforcePriceLimit, pl.IsTaxIncluded FROM M_Product p' +
      ' INNER JOIN M_ProductPrice pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      " INNER JOIN M_Pricelist pl ON (pv.M_PriceList_ID=pl.M_PriceList_ID) WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pv.M_PriceList_Version_ID=?");
    this.m_calculated = false;
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_Version_ID);
    var rs = exec('MProductPricing.calculatePLV', ps);
    if (rs && rs.next()) { this._read(rs, true); this.m_calculated = true; }
    return this.m_calculated;
  };
  // the date-walk of calculatePL/BPL(+_VB): first row whose ValidFrom <= PriceDate (rows ordered ValidFrom DESC)
  P._walk = function (rs, readTaxIncluded) {
    while (!this.m_calculated && rs.next()) {
      var plDate = rs.getTimestamp(5);
      if (plDate == null || !this.m_PriceDate.before(plDate)) { this._read(rs, readTaxIncluded); this.m_calculated = true; break; }
    }
  };
  // calculatePL :236-317 (no IsTaxIncluded column in this SQL — the Java leaves m_isTaxIncluded untouched)
  P.calculatePL = function () {
    if (this.m_M_Product_ID === 0) return false;
    if (this.m_M_PriceList_ID === 0) { R.log('§PRICING No PriceList (MProductPricing.calculatePL :241-246)'); return false; }
    var ps = DB().prepareStatement(BOM_SEL + 'pl.EnforcePriceLimit FROM M_Product p' +
      ' INNER JOIN M_ProductPrice pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      " INNER JOIN M_Pricelist pl ON (pv.M_PriceList_ID=pl.M_PriceList_ID) WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pv.M_PriceList_ID=?" +
      ' ORDER BY pv.ValidFrom DESC');
    this.m_calculated = false;
    if (this.m_PriceDate == null) this.m_PriceDate = new Timestamp(R.now());
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_ID);
    var rs = exec('MProductPricing.calculatePL', ps);
    if (rs) this._walk(rs, false);
    return this.m_calculated;
  };
  // calculateBPL :323-399
  P.calculateBPL = function () {
    if (this.m_M_Product_ID === 0 || this.m_M_PriceList_ID === 0) return false;
    var ps = DB().prepareStatement(BOM_SEL + ' pl.EnforcePriceLimit, pl.IsTaxIncluded FROM M_Product p' +
      ' INNER JOIN M_ProductPrice pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      ' INNER JOIN M_Pricelist bpl ON (pv.M_PriceList_ID=bpl.M_PriceList_ID) INNER JOIN M_Pricelist pl ON (bpl.M_PriceList_ID=pl.BasePriceList_ID) ' +
      "WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pl.M_PriceList_ID=? ORDER BY pv.ValidFrom DESC");
    this.m_calculated = false;
    if (this.m_PriceDate == null) this.m_PriceDate = new Timestamp(R.now());
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_ID);
    var rs = exec('MProductPricing.calculateBPL', ps);
    if (rs) this._walk(rs, true);
    return this.m_calculated;
  };
  // calculatePLV_VB :405-472 (ORDER BY pp.C_BPartner_ID — PostgreSQL ASC = NULLS LAST)
  P.calculatePLV_VB = function () {
    if (this.m_M_Product_ID === 0 || this.m_M_PriceList_Version_ID === 0) return false;
    var ps = DB().prepareStatement(VB_SEL + ' pl.EnforcePriceLimit, pl.IsTaxIncluded FROM M_Product p' +
      ' INNER JOIN M_ProductPriceVendorBreak pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      " INNER JOIN M_Pricelist pl ON (pv.M_PriceList_ID=pl.M_PriceList_ID) WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pv.M_PriceList_Version_ID=?" +
      ' AND (pp.C_BPartner_ID=? OR pp.C_BPartner_ID is NULL) AND ?>=pp.BreakValue ORDER BY  pp.C_BPartner_ID NULLS LAST, BreakValue DESC');
    this.m_calculated = false;
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_Version_ID); ps.setInt(3, this.m_C_BPartner_ID); ps.setBigDecimal(4, this.m_Qty);
    var rs = exec('MProductPricing.calculatePLV_VB', ps);
    if (rs && rs.next()) { this._read(rs, true); this.m_calculated = true; }
    return this.m_calculated;
  };
  // calculatePL_VB :478-563
  P.calculatePL_VB = function () {
    if (this.m_M_Product_ID === 0) return false;
    if (this.m_M_PriceList_ID === 0) { R.log('§PRICING No PriceList (MProductPricing.calculatePL_VB :483-488)'); return false; }
    var ps = DB().prepareStatement(VB_SEL + 'pl.EnforcePriceLimit FROM M_Product p' +
      ' INNER JOIN M_ProductPriceVendorBreak pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      " INNER JOIN M_Pricelist pl ON (pv.M_PriceList_ID=pl.M_PriceList_ID) WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pv.M_PriceList_ID=?" +
      ' AND (pp.C_BPartner_ID=? OR pp.C_BPartner_ID is NULL) AND ?>=pp.BreakValue ORDER BY pp.C_BPartner_ID NULLS LAST, pv.ValidFrom DESC, BreakValue DESC');
    this.m_calculated = false;
    if (this.m_PriceDate == null) this.m_PriceDate = new Timestamp(R.now());
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_ID); ps.setInt(3, this.m_C_BPartner_ID); ps.setBigDecimal(4, this.m_Qty);
    var rs = exec('MProductPricing.calculatePL_VB', ps);
    if (rs) this._walk(rs, false);
    return this.m_calculated;
  };
  // calculateBPL_VB :569-648
  P.calculateBPL_VB = function () {
    if (this.m_M_Product_ID === 0 || this.m_M_PriceList_ID === 0) return false;
    var ps = DB().prepareStatement(VB_SEL + ' pl.EnforcePriceLimit, pl.IsTaxIncluded FROM M_Product p' +
      ' INNER JOIN M_ProductPriceVendorBreak pp ON (p.M_Product_ID=pp.M_Product_ID) INNER JOIN  M_PriceList_Version pv ON (pp.M_PriceList_Version_ID=pv.M_PriceList_Version_ID)' +
      ' INNER JOIN M_Pricelist bpl ON (pv.M_PriceList_ID=bpl.M_PriceList_ID) INNER JOIN M_Pricelist pl ON (bpl.M_PriceList_ID=pl.BasePriceList_ID) ' +
      "WHERE pv.IsActive='Y' AND pp.IsActive='Y' AND p.M_Product_ID=? AND pl.M_PriceList_ID=? AND (pp.C_BPartner_ID=? OR pp.C_BPartner_ID is NULL)" +
      ' AND ?>=pp.BreakValue ORDER BY pp.C_BPartner_ID NULLS LAST, pv.ValidFrom DESC, BreakValue DESC');
    this.m_calculated = false;
    if (this.m_PriceDate == null) this.m_PriceDate = new Timestamp(R.now());
    ps.setInt(1, this.m_M_Product_ID); ps.setInt(2, this.m_M_PriceList_ID); ps.setInt(3, this.m_C_BPartner_ID); ps.setBigDecimal(4, this.m_Qty);
    var rs = exec('MProductPricing.calculateBPL_VB', ps);
    if (rs) this._walk(rs, true);
    return this.m_calculated;
  };
  // setBaseInfo :654-665
  P.setBaseInfo = function () {
    if (this.m_M_Product_ID === 0) return;
    var product = R.PO.get('M_Product', this.m_M_Product_ID);
    if (product != null) { this.m_C_UOM_ID = product.getC_UOM_ID(); this.m_M_Product_Category_ID = product.getM_Product_Category_ID(); }
  };
  P.isTaxIncluded = function () { return this.m_isTaxIncluded; };                                                     // :671-674
  // calculateDiscount :679-729
  P.calculateDiscount = function () {
    this.m_discountSchema = false;
    if (this.m_C_BPartner_ID === 0 || this.m_M_Product_ID === 0) return;
    var M_DiscountSchema_ID = 0, FlatDiscount = null;
    var ps = DB().prepareStatement('SELECT COALESCE(p.M_DiscountSchema_ID,g.M_DiscountSchema_ID), COALESCE(p.PO_DiscountSchema_ID,g.PO_DiscountSchema_ID), p.FlatDiscount ' +
      'FROM C_BPartner p INNER JOIN C_BP_Group g ON (p.C_BP_Group_ID=g.C_BP_Group_ID) WHERE p.C_BPartner_ID=?');
    ps.setInt(1, this.m_C_BPartner_ID);
    var rs = exec('MProductPricing.calculateDiscount', ps);
    if (rs && rs.next()) {
      M_DiscountSchema_ID = rs.getInt(this.m_isSOTrx ? 1 : 2);
      FlatDiscount = rs.getBigDecimal(3);
      if (FlatDiscount == null) FlatDiscount = Env.ZERO;
    }
    if (M_DiscountSchema_ID === 0) return;                                                                            // No Discount Schema
    var sd = MDiscountSchema.get(M_DiscountSchema_ID);
    if (sd.get_ID() === 0 || ('B' === sd.getDiscountType() && 'L' !== sd.getCumulativeLevel())) return;
    this.m_discountSchema = true;
    this.m_PriceStd = sd.calculatePrice(this.m_Qty, this.m_PriceStd, this.m_M_Product_ID, this.m_M_Product_Category_ID, FlatDiscount);
  };
  // getDiscount :735-745 — double arithmetic, BigDecimal.valueOf(double), as the Java does
  P.getDiscount = function () {
    var Discount = Env.ZERO;
    if (this.m_PriceList.compareTo(Env.ZERO) !== 0) {
      var pl = Number(this.m_PriceList.toString()), ps = Number(this.m_PriceStd.toString());
      Discount = M.Java.valueOfDouble((pl - ps) / pl * 100.0);
    }
    if (Discount.scale() > 2) Discount = Discount.setScale(2, RM.HALF_UP);
    return Discount;
  };
  // setPrecision :790-794 / getPrecision :800-803 / round :810-816
  P.setPrecision = function () { if (this.m_M_PriceList_ID !== 0) this.m_precision = MPriceList.getPricePrecision(null, this.getM_PriceList_ID()); };
  P.getPrecision = function () { return this.m_precision; };
  P.round = function (bd) { if (this.m_precision >= 0 && bd.scale() > this.m_precision) return bd.setScale(this.m_precision, RM.HALF_UP); return bd; };
  // getters :822-881 — calculate on demand
  P.getC_UOM_ID = function () { if (!this.m_calculated) this.calculatePrice(); return this.m_C_UOM_ID; };
  P.getPriceList = function () { if (!this.m_calculated) this.calculatePrice(); return this.round(this.m_PriceList); };
  P.getPriceStd = function () { if (!this.m_calculated) this.calculatePrice(); return this.round(this.m_PriceStd); };
  P.getPriceLimit = function () { if (!this.m_calculated) this.calculatePrice(); return this.round(this.m_PriceLimit); };
  P.getC_Currency_ID = function () { if (!this.m_calculated) this.calculatePrice(); return this.m_C_Currency_ID; };
  P.isEnforcePriceLimit = function () { if (!this.m_calculated) this.calculatePrice(); return this.m_enforcePriceLimit; };
  P.isDiscountSchema = function () { return this.m_discountSchema || this.m_useVendorBreak; };                       // :878-881
  P.isCalculated = function () { return this.m_calculated; };
  // set*Line :899-928 → AbstractProductPricing :98-185, then checkVendorBreak. `line` = a PO-shaped object (Java getters).
  function nz(v) { return v == null ? 0 : v; }
  P.setOrderLine = function (orderLine, trxName) {                                                                    // B/AbstractProductPricing.java:98-117
    this.m_M_Product_ID = nz(orderLine.getM_Product_ID());
    if (nz(orderLine.getC_Order_ID()) > 0) { var order = R.PO.get('C_Order', orderLine.getC_Order_ID()); if (order) this.m_isSOTrx = order.isSOTrx(); }
    this.m_C_BPartner_ID = nz(orderLine.getC_BPartner_ID());
    var qty = orderLine.getQtyOrdered();
    if (qty != null && Env.ZERO.compareTo(qty) !== 0) this.m_Qty = qty;
    this.m_PriceDate = orderLine.getDateOrdered();
    this.trxName = trxName || null;
    this.checkVendorBreak();
  };
  P.setInvoiceLine = function (invoiceLine, trxName) {                                                                // :119-139
    this.m_M_Product_ID = nz(invoiceLine.getM_Product_ID());
    if (nz(invoiceLine.getC_Invoice_ID()) > 0) {
      var inv = R.PO.get('C_Invoice', invoiceLine.getC_Invoice_ID());
      if (inv) { this.m_C_BPartner_ID = nz(inv.getC_BPartner_ID()); this.m_isSOTrx = inv.isSOTrx(); this.m_PriceDate = inv.getDateInvoiced(); }
    }
    var qty = invoiceLine.getQtyInvoiced() != null ? invoiceLine.getQtyInvoiced() : invoiceLine.getQtyEntered();
    if (qty != null && Env.ZERO.compareTo(qty) !== 0) this.m_Qty = qty;
    this.trxName = trxName || null;
    this.checkVendorBreak();
  };
  P.setProjectLine = function (projectLine, trxName) {                                                                // :141-159
    this.m_M_Product_ID = nz(projectLine.getM_Product_ID());
    if (nz(projectLine.getC_Project_ID()) > 0) { var pr = R.PO.get('C_Project', projectLine.getC_Project_ID()); if (pr) this.m_C_BPartner_ID = nz(pr.getC_BPartner_ID()); }
    var qty = projectLine.getPlannedQty();
    if (qty != null && Env.ZERO.compareTo(qty) !== 0) this.m_Qty = qty;
    this.m_isSOTrx = true; this.trxName = trxName || null;
    this.checkVendorBreak();
  };
  P.setRequisitionLine = function (reqLine, trxName) {                                                                // :161-170
    this.m_M_Product_ID = nz(reqLine.getM_Product_ID()); this.m_C_BPartner_ID = nz(reqLine.getC_BPartner_ID());
    var qty = reqLine.getQty();
    if (qty != null && Env.ZERO.compareTo(qty) !== 0) this.m_Qty = qty;
    this.m_isSOTrx = false; this.trxName = trxName || null;
    this.checkVendorBreak();
  };
  P.setRMALine = function (rmaLine, trxName) {                                                                        // :172-185
    this.m_M_Product_ID = nz(rmaLine.getM_Product_ID());
    if (nz(rmaLine.getM_RMA_ID()) > 0) { var rma = R.PO.get('M_RMA', rmaLine.getM_RMA_ID()); if (rma) { this.m_C_BPartner_ID = nz(rma.getC_BPartner_ID()); this.m_isSOTrx = rma.isSOTrx(); } }
    this.m_Qty = Env.ONE; this.trxName = trxName || null;
    this.checkVendorBreak();
  };
  M.MProductPricing = MProductPricing;
  // Core.getProductPricing (B/Core.java) — the default IProductPricing service is MProductPricing
  M.Core = M.Core || {};
  M.Core.getProductPricing = function () { return new MProductPricing(); };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
