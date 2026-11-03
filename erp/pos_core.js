// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * pos_core.js — TRIMMED (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §14.8, §17.4). The POS pill (pos_lens.js, kitchen_*.js) was retired; the standalone till (till.html) deposits I_Order/I_Payment
 * and completes nothing, so the complete-on-the-till, hold/recall, deliver-later, replenish and register code is deleted. What remains is the ONE function viewer/wh_walk.js still calls
 * (POSCore.completeShipmentOps, Warehouse Walk) — PURE: no DB, no clock, no DOM. The walk becomes a standalone app later (prompts/WH_POS_PICK_LANE.md §STANDALONE).
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.POSCore = factory();
})(typeof window !== 'undefined' ? window : this, function () {


  // ── §S-4 completion-by-pick: scan-commit completes the DR shipment — THE act that moves on-hand.
  // dt = the SHIPMENT's c_doctype row. A doctype that demands confirmation (148 IsPickQAConfirm /
  // 147 IsShipConfirm) REFUSES here and routes to inout_confirm.js (the W-WH-CONFIRM gate: confirm
  // first, on-hand at confirm-complete). opts.pickedQtyOf(i) = operator-confirmed qty (§S-4 stepper;
  // default = line qty). SO-side short-pick REDUCES MovementQty, no difference doc — the same
  // extracted rule inout_confirm.js carries (MInOutConfirm.createDifferenceDoc SO branch).

  function completeShipmentOps(inout, inoutLines, dt, opts) {
    if (inout.docstatus !== 'DR' && inout.docstatus !== 'IP') {
      return { ok: false, reason: 'not-open', docstatus: inout.docstatus };   // §FALSIFIER: double-complete refused (FSM)
    }
    if (dt && (dt.ispickqaconfirm === 'Y' || dt.isshipconfirm === 'Y')) {
      return { ok: false, reason: 'confirm-gated', hint: 'inout_confirm.createConfirmationOps/completeConfirmOps (W-WH-CONFIRM)' };
    }
    if (!inoutLines || !inoutLines.length) return { ok: false, reason: 'no-lines' };
    var ops = [], movements = [];
    inoutLines.forEach(function (l, i) {
      var picked = (opts && opts.pickedQtyOf) ? opts.pickedQtyOf(i) : l.movementqty;
      if (Number(picked) !== Number(l.movementqty)) {
        ops.push({ op_type: 'UPDATE_LINE', table: 'M_InOutLine', id: l.m_inoutline_id, movementqty: picked });
      }
      movements.push({ m_product_id: l.m_product_id, movementtype: 'C-', movementqty: picked });
    });
    ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: inout.m_inout_id, doc_status: 'CO' });
    return { ok: true, ops: ops, movements: movements, newVerbs: [] };
  }

  return { completeShipmentOps: completeShipmentOps };
});
