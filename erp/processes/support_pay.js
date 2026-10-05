// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/support_pay.js — module ACCESSORS for the family-C (pay / bank / match) processes. §CP-OPEN 4b: MAllocationHdr.beforeDelete/afterDelete,
// MAllocationLine.beforeDelete + processIt(reverse) moved to model_invoice.js (registered into ModelLayer there); PO.saveEx (saveRow) is ModelLayer.saveEx;
// MFactAcct.deleteEx is model_match.js; the Processed/Processing/Posted phantom-column strip is gone (ModelLayer.newPO follows PO.setStandardDefaults).
(function (global) {
  'use strict';
  var node = (typeof module !== 'undefined' && module.exports);
  var P = node ? require('../ad_process.js') : global.AdProcess;
  var S = P.PSUP = P.PSUP || {};
  var G = S.pay = {};
  G.ctor = function () { return node ? require('../model_ctor') : global.ModelCtor; };
  G.T = function () { return node ? require('../model_trade') : global.ModelTrade; };
  G.ML = function () { return node ? require('../model_layer') : global.ModelLayer; };
  G.MI = function () { return node ? require('../model_invoice') : global.ModelInvoice; };
  G.saveRow = function () { var m = G.ML(); return m.saveEx.apply(m, arguments); };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
