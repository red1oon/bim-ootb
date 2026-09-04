// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_callout.js — AD_Column.Callout dispatch spine (W-CALLOUT). The "Callouts" leg of the coverage matrix:
// read AD_Column.Callout (a `;`-separated list of class.method names), resolve each against a small JS
// HANDLER REGISTRY, fire on the named field change, and return the DERIVED sibling-field values. Same
// mechanism-not-corpus spine as ad_process.js (W-PROC) — we port 2–3 REAL handlers (the classic line
// price/qty/amount callouts), not the 148-class / 10,340-LOC corpus; an unregistered classname returns an
// explicit absent-handler (NOT a silent no-op). Self-contained, no kernel dep.
//
// SEAM (pinned in docs/ERP_BACKEND_SEPARATION.md §3 ❷): a callout DERIVES — given a field change it computes
// NEW VALUES for sibling fields and returns a `derived:{col:value}` map (the WRITE verb). It must NOT validate
// (that is ad_valrule, A-2, which returns a boolean/row-set). The field-change path fires the callout FIRST
// (derive), then the val-rule (validate the possibly-derived value). They never share an output channel.
//
// EXTRACT, DON'T INVENT: the callout NAME + the field it fires on are AD data (ad_full.db: ad_column.callout,
// lowercase). The handler BODIES are faithful ports of iDempiere's documented CalloutOrder/CalloutInvoice
// math (LineNetAmt = PriceActual × Qty; product → price from m_productprice). Every value a handler emits is
// computed from real record/db columns; an unmodelled handler is reported absent, never synthesized.
// Determinism: pure arithmetic + read-only lookups, no Date.now/Math.random. Integer-cent rounding.
// Implementing ERP_COVERAGE_MATRIX.md §AD_Column·Callout (ranked GAP #6) — Witness: W-CALLOUT
(function (global) {
  'use strict';

  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }       // price/amt precision (2dp)
  function num(record, keys) {                                                 // case-insensitive column read
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (record[k] != null) return Number(record[k]);
      var lk = k.toLowerCase(); if (record[lk] != null) return Number(record[lk]);
    }
    return 0;
  }

  // ── HANDLER REGISTRY — callout `class.method` → fn(ctx, info) -> { derived:{col:val} } ─────────────────
  var REGISTRY = {};
  function registerHandler(name, fn) { REGISTRY[name] = fn; }
  function hasHandler(name) { return !!REGISTRY[name]; }
  function registeredNames() { return Object.keys(REGISTRY); }

  // installDefaultHandlers — the real line callouts (CalloutOrder / CalloutInvoice). `qtyCol` differs
  // between order (QtyOrdered) and invoice (QtyInvoiced); the math is identical (LineNetAmt = Price × Qty).
  function installDefaultHandlers() {
    // .amt — recompute LineNetAmt from PriceActual × Qty (fired when PriceActual/QtyEntered/TaxAmt change).
    function amtHandler(qtyKeys) {
      return function (ctx, info) {
        var r = info.record || {};
        var price = num(r, ['PriceActual', 'priceactual']);
        var qty = num(r, qtyKeys);
        return { derived: { LineNetAmt: round2(price * qty) } };
      };
    }
    // .qty — UOM convert QtyEntered → stock Qty (1:1 in this seed; ctx.uomConvert may override), then amt.
    function qtyHandler(qtyCol) {
      return function (ctx, info) {
        var r = info.record || {};
        var qe = num(r, ['QtyEntered', 'qtyentered']);
        var conv = ctx.uomConvert ? ctx.uomConvert(r, qe) : qe;               // host glue; default identity
        var price = num(r, ['PriceActual', 'priceactual']);
        var d = {}; d[qtyCol] = round2(conv); d.LineNetAmt = round2(price * conv);
        return { derived: d };
      };
    }
    // .product — on M_Product_ID set, derive PriceEntered/PriceActual/PriceList from the price list, + amt.
    function productHandler(qtyKeys) {
      return function (ctx, info) {
        var r = info.record || {};
        var pid = num(r, ['M_Product_ID', 'm_product_id']);
        var pp = ctx.productPrice ? ctx.productPrice(pid, r) : null;          // {priceStd, priceList} or null
        if (!pp) return { derived: {}, note: 'no price-list row for product ' + pid };
        var qty = num(r, qtyKeys);
        return { derived: {
          PriceEntered: round2(pp.priceStd), PriceActual: round2(pp.priceStd),
          PriceList: round2(pp.priceList), LineNetAmt: round2(pp.priceStd * qty)
        } };
      };
    }
    registerHandler('org.compiere.model.CalloutOrder.amt',       amtHandler(['QtyOrdered', 'qtyordered', 'QtyEntered', 'qtyentered']));
    registerHandler('org.compiere.model.CalloutOrder.qty',       qtyHandler('QtyOrdered'));
    registerHandler('org.compiere.model.CalloutOrder.product',   productHandler(['QtyOrdered', 'qtyordered']));
    registerHandler('org.compiere.model.CalloutInvoice.amt',     amtHandler(['QtyInvoiced', 'qtyinvoiced', 'QtyEntered', 'qtyentered']));
    registerHandler('org.compiere.model.CalloutInvoice.qty',     qtyHandler('QtyInvoiced'));
    registerHandler('org.compiere.model.CalloutInvoice.product', productHandler(['QtyInvoiced', 'qtyinvoiced']));
  }

  // readCallout — the AD source: the `;`-separated callout list bound to (table, column). Returns [] if none.
  function readCallout(db, table, column) {
    var row = db.prepare(
      'SELECT c.callout FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id ' +
      'WHERE lower(t.tablename)=lower(?) AND lower(c.columnname)=lower(?) AND c.callout IS NOT NULL AND c.callout<>\'\''
    ).get(table, column);
    if (!row || !row.callout) return [];
    return String(row.callout).split(';').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // dispatch — read the column's callouts, run each registered one, merge derived maps; absent ones named.
  //   info = { table, column, record:{...current row values...} }
  //   ctx  = data accessors the handlers need (productPrice, uomConvert). Optional.
  function dispatch(db, info, ctx) {
    ctx = ctx || {};
    var callouts = readCallout(db, info.table, info.column);
    var fired = [], absent = [], derived = {}, notes = [], deferred = [];
    callouts.forEach(function (name) {
      if (!hasHandler(name)) { absent.push(name); return; }                   // Core.getCallout==null analogue
      var out;
      try { out = REGISTRY[name](ctx, info) || {}; }
      catch (e) { absent.push(name + '(threw:' + (e && e.message) + ')'); return; }
      fired.push(name);
      if (out.derived) for (var k in out.derived) if (Object.prototype.hasOwnProperty.call(out.derived, k)) derived[k] = out.derived[k];
      if (out.note) notes.push(out.note);
      // §INOUT-CALLOUTS — a handler's NAMED-DEFERRED branches were being dropped on the floor here, which is
      // exactly the failure the standing rule forbids ("a named-deferred branch is declared in result.deferred,
      // never silently absent" — the convention stockMoves/CreateFromInvoice already follow). Carried through,
      // tagged with the handler that declared it, so the caller can print it.
      if (out.deferred && out.deferred.length) out.deferred.forEach(function (dfr) { deferred.push(name.split('.').slice(-2).join('.') + ': ' + dfr); });
    });
    return { table: info.table, column: info.column, callouts: callouts, fired: fired, absent: absent, derived: derived, notes: notes, deferred: deferred };
  }

  // coverageScan(db) — of the AD_Column callout population, how many cols/classes does the registry dispatch?
  function coverageScan(db) {
    var rows = db.prepare("SELECT callout FROM ad_column WHERE callout IS NOT NULL AND callout<>''").all();
    var classes = {}, colsDispatched = 0;
    rows.forEach(function (r) {
      var names = String(r.callout).split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      var any = false;
      names.forEach(function (n) { classes[n] = (classes[n] || 0) + 1; if (hasHandler(n)) any = true; });
      if (any) colsDispatched++;
    });
    var distinct = Object.keys(classes);
    var registeredHit = distinct.filter(hasHandler);
    return { cols: rows.length, distinctClasses: distinct.length, registered: registeredNames().length,
             classesDispatched: registeredHit.length, colsDispatched: colsDispatched };
  }

  var API = {
    REGISTRY: REGISTRY, registerHandler: registerHandler, hasHandler: hasHandler, registeredNames: registeredNames,
    installDefaultHandlers: installDefaultHandlers, readCallout: readCallout, dispatch: dispatch,
    coverageScan: coverageScan, round2: round2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdCallout = API;                    // browser
  else if (global) global.AdCallout = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
