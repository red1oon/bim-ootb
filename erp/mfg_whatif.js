// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — mfg_whatif.js: a WHAT-IF scenario as a discarded BLUE FUTURE branch (Milestone 10, ~/Projects/Mfg/MILESTONE_10_SPEC.md; Witness W-MFG-WHATIF).
//   No second branch mechanism: speculative ops are committed to the SAME kernel_ops log TAGGED with branch_id (kernel_ops.js BLUE FUTURE) and applied to a SCRATCH clone of the live projection, never to the live one;
//   MRP (mfg_mrp.fold) is run over the scratch; discard = KernelOps.discardBranch (the whole branch undone). Nothing manufacturing-specific lives in the kernel.
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var K = isNode ? require('./erp_kernel.js') : root.ERPKernel, S = isNode ? require('./mfg_snapshot.js') : root.MfgSnapshot, R = isNode ? require('./mfg_mrp.js') : root.MfgMrp;
  function KO() { return root.KernelOps || (typeof window !== 'undefined' ? window.KernelOps : null) || (typeof global !== 'undefined' && global.window ? global.window.KernelOps : null); }

  // fork(SQL, live, branchId): SQL = the sql.js module (to clone), live = the live db with the official log.
  function fork(SQL, live, branchId) {
    var scratch = new SQL.Database(live.export());
    var q = function (sql, p) { return K.query(scratch, sql, p); };
    function ctx(actor, baseTs) { return { wfmc: S.WFMC, guards: [], query: q, actor: actor || 'user:whatif', baseTs: baseTs || 1000, branch: branchId, scratch: scratch }; }
    return {
      branch: branchId, scratch: scratch, query: q,
      create: function (order, actor, baseTs) { return K.dispatch(live, ctx(actor, baseTs), { docType: 'PP_Order', action: 'CR', status: 'NEW', order: order }); },
      apply: function (ops, actor, baseTs) { return K.apply(live, ops, { actor: actor || 'user:whatif', baseTs: baseTs || 1000, branch: branchId, scratch: scratch }); },
      mrp: function () { return R.fold(q); },
      ops: function () { var ko = KO(); return ko && ko.branchOps ? ko.branchOps(live, branchId) : []; },
      discard: function () { var ko = KO(); if (!ko || !ko.discardBranch) throw new Error('discardBranch unavailable'); return ko.discardBranch(live, branchId); }
    };
  }
  var API = { fork: fork };
  if (isNode) module.exports = API;
  if (typeof window !== 'undefined') window.MfgWhatif = API;
})(typeof window !== 'undefined' ? window : this);
