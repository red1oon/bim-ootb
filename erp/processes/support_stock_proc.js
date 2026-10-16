// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_stock_proc.js — generic PO helpers (create / cols / saveEx) for the family-D processes. §CP-OPEN 4b: the M-class statics that lived here
// (MInventoryLine, BigDecimal(double), MCurrency precision, SimpleDateFormat) moved to model_trade.js.
// bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE. Registered on AdProcess.PSTK; resolved at call time
// (processes/ loads alphabetically, support_* last).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSTK = P.PSTK || {};
  // new X_<Table>(ctx,0,trx) + saveEx — PO.saveNew through the model layer (ctor defaults, DocumentNo/Value sequences, hooks)
  function MT() { return (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade; }
  S.create = function (X, trx, table, fields) { return MT().createRow(trx, table, fields); };   // PO.saveNew — ModelTrade.createRow (one implementation)
  var _cols = {};
  S.cols = function (trx, table) {
    var t = String(table).toLowerCase();
    if (_cols[t]) return _cols[t];
    var o = {};
    try { trx.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [t]).forEach(function (r) { o[r.c] = 1; }); } catch (e) { return null; }
    return (_cols[t] = Object.keys(o).length ? o : null);
  };
  S.saveEx = function (X, trx, table, po, changes) { return MT().saveRow(trx, table, po, changes); };   // ModelTrade.saveRow

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
