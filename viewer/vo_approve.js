/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// vo_approve.js — BIM → Project FINANCE lane §F5: approve a Variation Order (DR → CO) so it COMMITS.
//
// A vo_fold amendment is born DR (drafted). Approving it is a governed DocAction, NOT a blind UPDATE:
//   - the transition is GATED by the real DocAction FSM (erp/ad_docfsm.js dispatchOrder, DR→CO) — an
//     already-completed VO can't be re-approved (CO offers only CL/VO), which makes approval idempotent.
//   - on success the VO is "signed" with who/when governance (IsApproved=Y, UpdatedBy, Updated) and the
//     content signature it already carries (POReference = the delta digest from vo_fold).
//   - the approval MOVES the commitment: C_Project.CommittedAmt += GrandTotal, IsCommitment='Y'; the
//     Revised Contract Sum (proj_control.contractSum: original + Σ CO-VO GrandTotal) then reflects it.
// EXTRACT-only — amounts come from the VO's own GrandTotal (BigDecimal); nothing is invented.
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('../erp/bigdecimal.js') : (global.BigDecimal);
  var FSM = (typeof module !== 'undefined' && module.exports) ? require('../erp/ad_docfsm.js') : (global.AdDocFsm);

  function _scalar(db, sql, params) {
    var r = db.exec(sql, params || []);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }

  // approveVariationOrder(db, orderId, opts) — opts: { user=100, now }
  function approveVariationOrder(db, orderId, opts) {
    opts = opts || {};
    var U = opts.user != null ? opts.user : 100;
    var now = opts.now || (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })();

    var row = db.exec("SELECT DocStatus,GrandTotal,C_Project_ID,IsSOTrx,POReference,IsApproved FROM C_Order WHERE C_Order_ID=?", [orderId]);
    if (!row.length || !row[0].values.length) return { ok: false, reason: 'no-order', orderId: orderId };
    var v = row[0].values[0];
    var status = v[0], grand = v[1], projId = v[2], isSO = v[3], poref = v[4], approved = v[5];

    // already approved → idempotent no-op (no double-commit).
    if (status === 'CO') return { ok: true, idempotent: true, orderId: orderId, status: 'CO', signature: poref, projectId: projId, grandTotal: String(grand) };

    // GATE via the real DocAction FSM (DR→CO must be legal for an order).
    var d = FSM.dispatchOrder(db, { docStatus: status, isSOTrx: isSO || 'N' }, 'CO');
    if (!d.ok) return { ok: false, reason: 'fsm-' + d.reason, from: status, action: 'CO', legalActions: d.legalActions, orderId: orderId };

    // apply the transition + who/when signature.
    db.run("UPDATE C_Order SET DocStatus=?,DocAction='CL',IsApproved='Y',Processed='Y',Updated=?,UpdatedBy=? WHERE C_Order_ID=?",
      [d.to, now, U, orderId]);

    // MOVE the commitment onto the project (BigDecimal).
    var committed = false;
    if (projId != null) {
      var cur = BD.of(String(_scalar(db, "SELECT COALESCE(CommittedAmt,0) FROM C_Project WHERE C_Project_ID=?", [projId]) || 0));
      var next = cur.add(BD.of(String(grand)));
      db.run("UPDATE C_Project SET CommittedAmt=?,IsCommitment='Y',Updated=?,UpdatedBy=? WHERE C_Project_ID=?",
        [next.toString(), now, U, projId]);
      committed = true;
    }
    return {
      ok: true, idempotent: false, orderId: orderId, from: status, to: d.to, status: d.to,
      grandTotal: String(grand), projectId: projId, committed: committed, signature: poref,
      approvedBy: U, approvedAt: now
    };
  }

  var API = { approveVariationOrder: approveVariationOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.VoApprove = API;
})(typeof self !== 'undefined' ? self : this);
