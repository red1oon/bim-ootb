// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_docgen.js — module ACCESSORS for the family-B (doc-from-doc) processes. §CP-OPEN 4b: every M-class body that lived here
// (getLines, PO.saveEx, MDocType.docBaseType, MInvoice.isCreditMemo) moved to model_order.js / model_invoice.js — this file only wires names.
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
  G.MO = function () { return node ? require('../model_order') : global.ModelOrder; };
  G.MI = function () { return node ? require('../model_invoice') : global.ModelInvoice; };
  G.lines = function () { var o = G.MO(); return o.lines.apply(o, arguments); };
  G.saveEx = function () { var o = G.MO(); return o.saveEx.apply(o, arguments); };
  G.docBaseType = function () { var o = G.MI(); return o.docBaseType.apply(o, arguments); };
  G.isCreditMemo = function () { var o = G.MI(); return o.isCreditMemo.apply(o, arguments); };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
