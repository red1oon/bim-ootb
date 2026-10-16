// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/support_stock.js — model statics used by the inout/stock/GL callouts, ported verbatim (bim-compiler
// prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE). Each is guarded so a sibling file that
// ports the same static (callouts/uom.js etc.) keeps ONE implementation: whichever defines it first owns it.
// M = org.adempiere.base/src/org/compiere/model.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, M = R.M, Env = R.Env;
  function DB() { return R.DB; }
  function PO() { return R.PO; }
  function I(v) { return v == null ? 0 : v; }

  // MUOM.getPrecision (M/MUOM.java:157-161)
  M.MUOM = M.MUOM || {};
  if (!M.MUOM.getPrecision) M.MUOM.getPrecision = function (ctx, C_UOM_ID) {
    var uom = PO().get('C_UOM', C_UOM_ID);
    return I(uom.getStdPrecision());
  };
  // MProduct.getUOMPrecision (M/MProduct.java:520-530)
  M.MProduct = M.MProduct || {};
  if (!M.MProduct.get) M.MProduct.get = function (ctx, id) { return PO().get('M_Product', id); };
  if (!M.MProduct.getUOMPrecision) M.MProduct.getUOMPrecision = function (product) {
    var C_UOM_ID = I(product.getC_UOM_ID());
    if (C_UOM_ID === 0) return 0;  // EA
    return M.MUOM.getPrecision(null, C_UOM_ID);
  };
  // MLocator.get / MAttributeSetInstance.get
  M.MLocator = M.MLocator || {};
  if (!M.MLocator.get) M.MLocator.get = function (ctx, id) { return PO().get('M_Locator', id); };

  // MDocType.getShipmentReceiptDocType (M/MDocType.java:401-457)
  M.MDocType = M.MDocType || {};
  if (!M.MDocType.getShipmentReceiptDocType) M.MDocType.getShipmentReceiptDocType = function (docTypeId, ctx) {   // ctx = Env.getCtx()
    var relatedDocTypeId = 0;
    if (docTypeId > 0) {
      var docType = PO().get('C_DocType', docTypeId);
      var docBaseType = docType.getDocBaseType(), docSubTypeSO = docType.getDocSubTypeSO();
      var relatedDocBaseType = null, isSOTrx = null;
      if ('POO' === docBaseType) {                                   // :412-420
        if ('RM' === docSubTypeSO) relatedDocBaseType = 'MMS';
        else if (docSubTypeSO == null) relatedDocBaseType = 'MMR';
        isSOTrx = 'N';
      } else if ('SOO' === docBaseType) {                           // :421-430
        if ('RM' === docSubTypeSO) relatedDocBaseType = 'MMR';
        else relatedDocBaseType = 'MMS';
        isSOTrx = 'Y';
      }
      // :432-435 — a specific shipment/receipt doctype on the order doctype wins (non-return)
      if (!('RM' === docSubTypeSO) && I(docType.getC_DocTypeShipment_ID()) > 0) return docType.getC_DocTypeShipment_ID();
      if (relatedDocBaseType != null) {                              // :437-453
        var ids = DB().query("SELECT C_DocType_ID AS id FROM C_DocType WHERE DocBaseType='" + relatedDocBaseType + "' AND AD_Client_ID=" +
          Env.getAD_Client_ID(ctx) + " AND IsActive='Y' AND IsSOTrx='" + isSOTrx + "' Order By C_DocType_ID ASC ");
        if (ids.length > 0) relatedDocTypeId = Number(ids[0].id);
      }
    }
    return relatedDocTypeId;
  };

  // MInOut.getMovementType (M/MInOut.java:1275-1287)
  M.MInOut = M.MInOut || {};
  if (!M.MInOut.getMovementType) M.MInOut.getMovementType = function (ctx, C_DocType_ID, issotrx) {
    var movementType = null;
    var docType = PO().get('C_DocType', C_DocType_ID);
    if (docType == null) return null;
    if (docType.getDocBaseType() === 'MMS') movementType = docType.isSOTrx() ? 'C-' : 'V-';
    else if (docType.getDocBaseType() === 'MMR') movementType = docType.isSOTrx() ? 'C+' : 'V+';
    return movementType;
  };

  // MSequence.getPreliminaryNo (M/MSequence.java:1298-1352) — "<CurrentNext>" (prefix/suffix only key the SequenceNo level)
  M.MSequence = M.MSequence || {};
  if (!M.MSequence.getPreliminaryNo) M.MSequence.getPreliminaryNo = function (tab, AD_Sequence_ID) {
    var prelim = null;
    if (AD_Sequence_ID > 0) {
      var seq = PO().get('AD_Sequence', AD_Sequence_ID);
      var currentNext = I(seq.getCurrentNext());
      if (seq.isSequenceNoLevel()) {
        R.unportedDep('MSequence.getPreliminaryNo', 'IsSequenceNoLevel key parts (AD_Sequence_No by year/month/org) :1313-1340');
      }
      var decimalPattern = seq.get_Value('DecimalPattern');
      if (decimalPattern != null && String(decimalPattern).length > 0) prelim = decimalFormat(decimalPattern, currentNext);
      else prelim = String(currentNext);
    }
    if (prelim == null) prelim = '?';
    return '<' + prelim + '>';
  };
  function decimalFormat(pattern, n) {                              // java.text.DecimalFormat for integer 0/# patterns
    var p = String(pattern).replace(/[^0#]/g, ''), zeros = (p.match(/0/g) || []).length, s = String(n);
    while (s.length < zeros) s = '0' + s;
    if (/[^0#]/.test(String(pattern))) R.unportedDep('DecimalFormat', 'non-digit pattern "' + pattern + '"');
    return s;
  }

  // MAttributeSetInstance.get (M/MAttributeSetInstance.java) — the read of an existing ASI
  M.MAttributeSetInstance = M.MAttributeSetInstance || {};
  if (!M.MAttributeSetInstance.get) M.MAttributeSetInstance.get = function (ctx, id) { return PO().get('M_AttributeSetInstance', id); };

  // MStorageOnHand (M/MStorageOnHand.java) — getQtyOnHandForLocator :1244-1265, ...WithASIMovementDate :1292-1322
  //   (NVL/DUAL are iDempiere's Oracle-syntax SQL, which its PG convert layer maps to COALESCE / no FROM; same here for SQLite)
  M.MStorageOnHand = M.MStorageOnHand || {};
  if (!M.MStorageOnHand.getQtyOnHandForLocator) M.MStorageOnHand.getQtyOnHandForLocator = function (M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID) {
    var sql = ' SELECT SUM(oh.QtyOnHand) FROM M_StorageOnHand oh WHERE oh.M_Product_ID=? AND oh.M_Locator_ID=?', params = [M_Product_ID, M_Locator_ID];
    if (M_AttributeSetInstance_ID !== 0) { sql += ' AND oh.M_AttributeSetInstance_ID=?'; params.push(M_AttributeSetInstance_ID); }
    var qty = DB().getSQLValueBD(null, sql, params);
    if (qty == null) qty = Env.ZERO;
    return qty;
  };
  if (!M.MStorageOnHand.getQtyOnHandForLocatorWithASIMovementDate) M.MStorageOnHand.getQtyOnHandForLocatorWithASIMovementDate = function (M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID, MovementDate) {
    var sql = 'SELECT COALESCE((SELECT SUM(QtyOnHand) FROM M_StorageOnHand WHERE M_Product_ID=? AND M_Locator_ID=? AND M_AttributeSetInstance_ID=?),0) - ' +
      'COALESCE((SELECT SUM(MovementQty) FROM M_Transaction WHERE M_Product_ID=? AND M_Locator_ID=? AND M_AttributeSetInstance_ID=? AND MovementDate>?),0)';
    var qty = DB().getSQLValueBD(null, sql, [M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID, M_Product_ID, M_Locator_ID, M_AttributeSetInstance_ID, MovementDate]);
    if (qty == null) qty = Env.ZERO;
    return qty;
  };

  // MWarehouse.getDefaultLocator (M/MWarehouse.java:248-282) over getLocators (:227-242, active, ORDER BY X,Y,Z)
  M.MWarehouse = M.MWarehouse || {};
  if (!M.MWarehouse.get) M.MWarehouse.get = function (ctx, id) { return PO().get('M_Warehouse', id); };
  if (!M.MWarehouse.getDefaultLocator) M.MWarehouse.getDefaultLocator = function (wh) {
    var locators = PO().list('M_Locator', "M_Warehouse_ID=? AND IsActive='Y'", [wh.getM_Warehouse_ID()], 'X,Y,Z');
    for (var i = 0; i < locators.length; i++) if (locators[i].isDefault() && locators[i].isActive()) return locators[i];
    if (locators.length > 0) return locators[0];                  // No Default - first one
    if (PO().list('M_Locator', 'M_Warehouse_ID=?', [wh.getM_Warehouse_ID()]).length) return null;   // all inactive
    R.unportedDep('MWarehouse.getDefaultLocator', 'auto-create a "Standard" locator (:276-281 — a write; never from a callout here)');
    return null;
  };

  // MAcctSchema.getClientAcctSchema (M/MAcctSchema.java:132-180) + MClient.getAcctSchema (M/MClient.java:527-538)
  M.MAcctSchema = M.MAcctSchema || {};
  if (!M.MAcctSchema.get) M.MAcctSchema.get = function (ctx, id) { return PO().get('C_AcctSchema', id); };
  if (!M.MAcctSchema.getClientAcctSchema) M.MAcctSchema.getClientAcctSchema = function (ctx, AD_Client_ID) {
    var list = [], info = PO().first('AD_ClientInfo', 'AD_Client_ID=?', [AD_Client_ID]);
    var first = info ? I(info.getC_AcctSchema1_ID()) : 0;
    var as = PO().get('C_AcctSchema', first);
    if (as != null && I(as.get_ID()) !== 0) list.push(as);
    var where = 'IsActive=? AND EXISTS (SELECT * FROM C_AcctSchema_GL gl WHERE C_AcctSchema.C_AcctSchema_ID=gl.C_AcctSchema_ID)' +
      ' AND EXISTS (SELECT * FROM C_AcctSchema_Default d WHERE C_AcctSchema.C_AcctSchema_ID=d.C_AcctSchema_ID)', params = ['Y'];
    if (AD_Client_ID !== 0) { where += ' AND AD_Client_ID=?'; params.push(AD_Client_ID); }
    PO().list('C_AcctSchema', where, params, 'C_AcctSchema_ID').forEach(function (a) { if (I(a.get_ID()) !== first && I(a.get_ID()) !== 0) list.push(a); });
    return list;
  };
  M.MClient = M.MClient || {};
  if (!M.MClient.getAcctSchema) M.MClient.getAcctSchema = function (ctx, AD_Client_ID) {
    var info = PO().first('AD_ClientInfo', 'AD_Client_ID=?', [AD_Client_ID]);
    if (info != null && I(info.getC_AcctSchema1_ID()) !== 0) return PO().get('C_AcctSchema', info.getC_AcctSchema1_ID());
    return null;
  };
  // MProduct.getCostingLevel :1064-1073 / getCostInfo :1141-1163; MCostElement.getMaterialCostElement(ctx, method, org) :114-127;
  // MCost.getCostInfo :1542-1573 (+ MCostHistory.get by date :193-290); MCost.get :1513-1525
  if (!M.MProduct.getCostingLevel) M.MProduct.getCostingLevel = function (product, as) {
    var pca = PO().first('M_Product_Category_Acct', 'M_Product_Category_ID=? AND C_AcctSchema_ID=?', [I(product.getM_Product_Category_ID()), I(as.get_ID())]);
    var costingLevel = pca ? pca.getCostingLevel() : null;
    if (costingLevel == null) costingLevel = as.getCostingLevel();
    return costingLevel;
  };
  M.MCostElement = M.MCostElement || {};
  if (!M.MCostElement.getMaterialCostElement) M.MCostElement.getMaterialCostElement = function (ctx, CostingMethod, AD_Org_ID) {
    var list = PO().list('M_CostElement', "AD_Client_ID=? AND CostingMethod=? AND CostElementType=? AND AD_Org_ID In (0, ?)",
      [Env.getAD_Client_ID(ctx), CostingMethod, 'M', AD_Org_ID], 'AD_Org_ID Desc');
    return list.length > 0 ? list[0] : null;
  };
  M.MCostHistory = M.MCostHistory || {};
  if (!M.MCostHistory.getByDate) M.MCostHistory.getByDate = function (ctx, AD_Client_ID, AD_Org_ID, M_Product_ID, M_CostType_ID, C_AcctSchema_ID, costingMethod, M_CostElement_ID, M_ASI_ID, dateAcct) {
    if (dateAcct == null) return null;
    var head = 'SELECT c.* FROM M_CostHistory c JOIN M_CostDetail cd ON (cd.M_CostDetail_ID = c.M_CostDetail_ID AND cd.Processed=\'Y\') ' +
      'LEFT JOIN M_CostDetail refcd ON (refcd.M_CostDetail_ID=cd.Ref_CostDetail_ID) LEFT OUTER JOIN M_CostElement ce ON (c.M_CostElement_ID=ce.M_CostElement_ID) ' +
      'WHERE c.AD_Client_ID=? AND c.AD_Org_ID=?  AND c.M_Product_ID=?  AND (c.M_AttributeSetInstance_ID=? OR c.M_AttributeSetInstance_ID=0) ' +
      ' AND c.M_CostType_ID=? AND cd.C_AcctSchema_ID=?  AND (ce.CostingMethod IS NULL OR ce.CostingMethod=?) ' + (M_CostElement_ID > 0 ? ' AND c.M_CostElement_ID=? ' : '');
    var p1 = [AD_Client_ID, AD_Org_ID, M_Product_ID, M_ASI_ID, M_CostType_ID, C_AcctSchema_ID, costingMethod]; if (M_CostElement_ID > 0) p1.push(M_CostElement_ID);
    var sql = 'SELECT * FROM (' + head + ' AND c.DateAcct<=? ORDER BY c.M_CostHistory_ID DESC LIMIT 1) UNION ALL SELECT * FROM (' + head +
      'ORDER BY c.DateAcct ASC, CASE WHEN COALESCE(refcd.DateAcct,cd.DateAcct) = cd.DateAcct THEN COALESCE(cd.Ref_CostDetail_ID, c.M_CostDetail_ID) ELSE c.M_CostDetail_ID END ASC, c.M_CostHistory_ID ASC LIMIT 1)';
    var rows;
    try { rows = DB().query(sql, p1.concat([dateAcct]).concat(p1)); }
    catch (e) { R.unportedDep('MCostHistory.get', 'M_CostHistory/M_CostDetail (' + ((e && e.message) || e) + ') → no history'); return null; }
    if (!rows.length) return null;
    var h = PO().wrap('M_CostHistory', rows[0]);
    var newPrice = h.getNewCostPrice();
    if (h.getDateAcct() != null && h.getDateAcct().after(dateAcct)) newPrice = h.getOldCostPrice();   // :276-281 first record after the date
    return { getCurrentCostPrice: function () { return newPrice; }, history: true };
  };
  M.MCost = M.MCost || {};
  if (!M.MCost.getCostInfo) M.MCost.getCostInfo = function (ctx, AD_Client_ID, AD_Org_ID, M_Product_ID, M_CostType_ID, C_AcctSchema_ID, M_CostElement_ID, M_ASI_ID, dateAcct) {
    var ce = PO().get('M_CostElement', M_CostElement_ID), costingMethod = ce.getCostingMethod(), history = null;
    if (dateAcct != null) history = M.MCostHistory.getByDate(ctx, AD_Client_ID, AD_Org_ID, M_Product_ID, M_CostType_ID, C_AcctSchema_ID, costingMethod, M_CostElement_ID, M_ASI_ID, dateAcct);
    if (history != null && 'S' !== costingMethod) return history;
    var cost = PO().first('M_Cost', "AD_Client_ID=? AND AD_Org_ID=? AND M_Product_ID=? AND M_CostType_ID=? AND C_AcctSchema_ID=? AND M_CostElement_ID=? AND M_AttributeSetInstance_ID=? AND IsActive='Y'",
      [AD_Client_ID, AD_Org_ID, M_Product_ID, M_CostType_ID, C_AcctSchema_ID, M_CostElement_ID, M_ASI_ID]);
    if (history != null && 'S' === costingMethod) R.unportedDep('MCost.getCostInfo', 'standard-cost history qty overlay :1564-1571 (no price effect without a cost detail)');
    return cost;   // ICostInfo — getCurrentCostPrice() = M_Cost.CurrentCostPrice
  };
  if (!M.MProduct.getCostInfo) M.MProduct.getCostInfo = function (product, as, AD_Org_ID, M_ASI_ID, costingMethod, dateAcct, ctx) {   // ctx = product.getCtx()
    var costingLevel = M.MProduct.getCostingLevel(product, as);
    if ('C' === costingLevel) { AD_Org_ID = 0; M_ASI_ID = 0; }
    else if ('O' === costingLevel) M_ASI_ID = 0;
    else if ('B' === costingLevel) { AD_Org_ID = 0; if (M_ASI_ID === 0) return null; }
    var ce = M.MCostElement.getMaterialCostElement(ctx, costingMethod, AD_Org_ID);
    if (ce == null) return null;
    return M.MCost.getCostInfo(null, I(product.getAD_Client_ID()), AD_Org_ID, I(product.getM_Product_ID()), I(as.getM_CostType_ID()), I(as.getC_AcctSchema_ID()), I(ce.getM_CostElement_ID()), M_ASI_ID, dateAcct);
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
