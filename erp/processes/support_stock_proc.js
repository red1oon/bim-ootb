// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_stock_proc.js — helpers shared by the family-D processes (stock / period / acct), each cited to its Java home.
// bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE. Registered on AdProcess.PSTK; resolved at call time
// (processes/ loads alphabetically, support_* last).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSTK = P.PSTK || {};
  // new X_<Table>(ctx,0,trx) + saveEx — PO.saveNew through the model layer (ctor defaults, DocumentNo/Value sequences, hooks)
  S.create = function (X, trx, table, fields) {
    var row = X.newPO(trx, table, fields);
    // PO.setStandardDefaults (PO.java:1973-2001) sets Processed/Processing/Posted only where the table HAS the column
    var cols = S.cols(trx, table);
    if (cols) ['processed', 'processing', 'posted'].forEach(function (c) { if (!cols[c] && !(fields && Object.prototype.hasOwnProperty.call(fields, c))) delete row[c]; });
    var r = X.save(trx, table, null, row);
    if (!r.ok) throw new Error('SaveError ' + table + ': ' + (r.error || ''));
    return r.row;
  };
  var _cols = {};
  S.cols = function (trx, table) {
    var t = String(table).toLowerCase();
    if (_cols[t]) return _cols[t];
    var o = {};
    try { trx.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [t]).forEach(function (r) { o[r.c] = 1; }); } catch (e) { return null; }
    return (_cols[t] = Object.keys(o).length ? o : null);
  };
  S.saveEx = function (X, trx, table, po, changes) {
    var r = X.save(trx, table, po, changes);
    if (!r.ok) throw new Error('SaveError ' + table + ': ' + (r.error || ''));
    return r.row;
  };

  // new BigDecimal(double) — the exact binary expansion (java.math.BigDecimal(double)); toFixed(100) is exact for doubles of price magnitude
  S.bdFromDouble = function (d) {
    var A = AA();
    if (!isFinite(d)) throw new Error('NumberFormatException: Infinite or NaN');
    var s = d.toFixed(100).replace(/0+$/, '').replace(/\.$/, '');
    return A.BigDecimal.fromString(s === '-0' ? '0' : s);
  };
  // MCurrency.getStdPrecision (cached by C_Currency_ID)
  S.currencyStdPrecision = function (trx, curId) { var r = trx.q('SELECT StdPrecision AS p FROM C_Currency WHERE C_Currency_ID=?', [curId])[0]; return r ? Number(r.p) : 0; };
  S.dep = function (trx, what) { trx.say('§PROC-UNPORTED-DEP ' + what); };
  function AA() { return (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout; }
  function bd(v) { var A = AA(); return v == null ? A.Env.ZERO : (v instanceof A.BigDecimal ? v : A.toBD(String(v))); }
  S.bd = bd;
  // MProduct.getUOMPrecision (M/MProduct.java:520-530) via the callout runtime's port
  S.uomPrecision = function (trx, productId) {
    if (!productId) return null;
    var p = AA().RUNTIME.PO.get('M_Product', productId);
    return p ? AA().RUNTIME.M.MProduct.getUOMPrecision(p) : null;
  };
  // MInventoryLine.setQtyCount / setQtyInternalUse (M/MInventoryLine.java:231-262) — product UOM precision, HALF_UP
  S.invQty = function (trx, productId, q) {
    if (q == null) return q;
    var prec = S.uomPrecision(trx, productId);
    return prec == null ? q : bd(q).setScale(prec, AA().RoundingMode.HALF_UP);
  };
  // MInventoryLine.beforeSave (M/MInventoryLine.java:327-446) for the Physical Inventory / Internal Use doc subtypes;
  // Cost Adjustment lines are the CostAdjustmentLine callout lane's, not these processes' — named dep.
  S.invLineBeforeSave = function (trx, rec, isNew, parent) {
    if (isNew && parent.processed === 'Y') throw new Error('SaveError M_InventoryLine: ParentComplete');            // :329-333
    if (!rec.line) {                                                                                               // :335-340
      var mx = 0; trx.find('m_inventoryline', { m_inventory_id: rec.m_inventory_id }).forEach(function (l) { if (Number(l.line || 0) > mx) mx = Number(l.line); });
      rec.line = mx + 10;
    }
    if (isNew) { rec.qtycount = Number(S.invQty(trx, rec.m_product_id, bd(rec.qtycount)).toString());
      rec.qtyinternaluse = Number(S.invQty(trx, rec.m_product_id, bd(rec.qtyinternaluse)).toString()); }       // :346-347              // :342-346
    var dt = trx.get('c_doctype', parent.c_doctype_id), sub = dt ? dt.docsubtypeinv : null;
    if (sub === 'PI') {                                                                                            // :378-396
      if (rec.inventorytype === 'C') { if (!Number(rec.c_charge_id || 0)) throw new Error('SaveError M_InventoryLine: FillMandatory C_Charge_ID'); }
      else if (Number(rec.c_charge_id || 0) !== 0) rec.c_charge_id = 0;
      if (bd(rec.qtyinternaluse).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
    } else if (sub === 'ID') {                                                                                     // :351-377
      if (rec.inventorytype !== 'C') rec.inventorytype = 'C';
      if (!Number(rec.c_charge_id || 0)) throw new Error('SaveError M_InventoryLine: InternalUseNeedsCharge');
      if (bd(rec.qtybook).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
      if (bd(rec.qtycount).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
      if (bd(rec.qtyinternaluse).signum() === 0 && parent.docaction !== 'VO') throw new Error('SaveError M_InventoryLine: FillMandatory QtyInternalUse');
    } else if (sub === 'CA') { S.dep(trx, 'MInventoryLine.beforeSave Cost Adjustment branch :397-438 (costing — CostAdjustmentLine lane)'); }
    else throw new Error('SaveError M_InventoryLine: Document inventory subtype not configured, cannot complete');   // :439-443
    if (!Number(rec.c_charge_id || 0)) rec.ad_org_id = parent.ad_org_id;                                           // :447-449
  };
  // new MInventoryLine(inventory, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID, QtyBook, QtyCount) :134-168 + saveEx path
  S.newInventoryLine = function (X, trx, inventory, locatorId, productId, asiId, qtyBook, qtyCount) {
    var f = { m_inventory_id: inventory.m_inventory_id, ad_client_id: inventory.ad_client_id, ad_org_id: inventory.ad_org_id,
      m_locator_id: locatorId, m_product_id: productId, m_attributesetinstance_id: asiId,
      line: 0, inventorytype: 'D', qtybook: AA().Env.ZERO, qtycount: AA().Env.ZERO, processed: 'N',
      qtycsv: 0, currentcostprice: 0, newcostprice: 0 };      // + the physical column DEFAULTs (pg information_schema: QtyCsv 0, CurrentCostPrice 0, NewCostPrice 0)           // setInitialDefaults :103-110
    if (qtyBook != null) f.qtybook = qtyBook;
    if (qtyCount != null && qtyCount.signum() !== 0) f.qtycount = S.invQty(trx, productId, qtyCount);
    var rec = X.plainMap(f);
    S.invLineBeforeSave(trx, rec, true, inventory);
    var r = X.save(trx, 'M_InventoryLine', null, rec);
    return r.ok ? r.row : (trx.say('§MODEL-PO save m_inventoryline refused: ' + r.error), null);
  };
  S.saveInventoryLine = function (X, trx, line, changes, inventory) {
    var rec = Object.assign({}, line, X.plainMap(changes));
    S.invLineBeforeSave(trx, rec, false, inventory);
    var ch = {}; Object.keys(rec).forEach(function (k) { if (rec[k] !== line[k]) ch[k] = rec[k]; });
    var r = X.save(trx, 'M_InventoryLine', line, ch);
    if (!r.ok) throw new Error('SaveError M_InventoryLine: ' + r.error);
    return r.row;
  };
  // java.text.SimpleDateFormat subset (en_US): y M d literals — any other pattern letter is a named dep
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  S.formatDate = function (trx, pattern, y, m0, d) {
    function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
    var out = '', i = 0;
    while (i < pattern.length) {
      var ch = pattern.charAt(i), j = i;
      if (ch === "'") { var k = pattern.indexOf("'", i + 1); if (k < 0) k = pattern.length; out += k === i + 1 ? "'" : pattern.slice(i + 1, k); i = k + 1; continue; }
      if (!/[A-Za-z]/.test(ch)) { out += ch; i++; continue; }
      while (j < pattern.length && pattern.charAt(j) === ch) j++;
      var n = j - i;
      if (ch === 'y') out += n === 2 ? pad(y % 100, 2) : pad(y, n);
      else if (ch === 'M') out += n >= 4 ? MONL[m0] : n === 3 ? MON[m0] : pad(m0 + 1, n);
      else if (ch === 'd') out += pad(d, n);
      else { trx.say('§PROC-UNPORTED-DEP SimpleDateFormat letter "' + ch + '" in "' + pattern + '" not ported'); out += pattern.slice(i, j); }
      i = j;
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
