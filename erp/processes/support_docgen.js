// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_docgen.js — helpers the family-B (doc-from-doc) processes share. §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// Registered on AdProcess.PSUP.docgen; resolved at call time (processes/ load alphabetically, this file last).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSUP = P.PSUP || {};
  var G = S.docgen = {};
  G.ctor = function () { return node ? require('../model_ctor') : global.ModelCtor; };
  G.T = function () { return node ? require('../model_trade') : global.ModelTrade; };
  G.ML = function () { return node ? require('../model_layer') : global.ModelLayer; };
  // rows of `table` where col=id ordered like the Java getLines(false) (ORDER BY Line, no IsActive filter)
  G.lines = function (trx, table, col, id) { return trx.find(table, (function (o) { o[col] = id; return o; })({}), ['line']); };
  // PO.saveEx → AdempiereException with the PO's error (PO.java saveEx: throws AdempiereException(CLogger error))
  G.saveEx = function (po) { if (!po.save()) throw new Error(po.error || 'SaveError'); return po; };
  // MDocType.get(id).getDocBaseType()
  G.docBaseType = function (trx, id) { var d = G.T().dt(trx, id); return d ? d.docbasetype : null; };
  // MInvoice.isCreditMemo (MInvoice.java:1072-1077)
  G.isCreditMemo = function (trx, inv) {
    var id = inv.get('c_doctype_id'); if (!G.T().nz(id)) id = inv.get('c_doctypetarget_id');
    var b = G.docBaseType(trx, id); return b === 'APC' || b === 'ARC';
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
