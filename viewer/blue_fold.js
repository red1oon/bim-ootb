/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// blue_fold.js — BIM → Project FINANCE lane §BLUE (F9/F10): push a speculative ("blue") Project Order / VO.
//
// When BlueFuture is engaged, the BIM push is routed through the ERP kernel op-log on the active branch:
//   commitBlue  — record the fold as a kernel op-group via KernelOps.commitGroup(db, ops, {branch_id})
//                 (exactly what BlueFuture.groupMeta() hands signed commits) AND tag the projection rows
//                 (C_Project / C_Order) with the branch_id. Every blue row is INVISIBLE to official chrome
//                 (official reads filter branch_id IS NULL — see proj_control.contractSum branch param).
//   discardBlue — KernelOps.discardBranch (fold the ops away atomically) + drop the blue projection rows →
//                 the official state reverts; it never saw them, so nothing official moves.
//   acceptBlue  — KernelOps.acceptBranchUpTo (clears branch_id on the ops — they turn white) + clears
//                 branch_id on the projection rows → the speculative doc becomes the real, official one.
// Reuses erp/kernel_ops.js W-BLUE-FUTURE (branch_id ∉ _canonical → accept needs no rebase). EXTRACT-only.
(function (global) {
  'use strict';
  function KO() { return (typeof window !== 'undefined' && window.KernelOps) || global.KernelOps || null; }
  function _scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
  function _hasCol(db, t, c) {
    var r = db.exec("PRAGMA table_info(" + t + ")");
    return r.length && r[0].values.some(function (v) { return String(v[1]).toLowerCase() === c; });
  }
  function ensureBranchCol(db) {
    ['C_Project', 'C_Order'].forEach(function (t) { if (!_hasCol(db, t, 'branch_id')) { try { db.run('ALTER TABLE "' + t + '" ADD COLUMN branch_id TEXT'); } catch (e) {} } });
  }
  function hasBranchCol(db, t) { return _hasCol(db, t, 'branch_id'); }

  // commit a folded doc onto a blue branch: kernel op-group + projection-row tag.
  async function commitBlue(db, branchId, ops, tags) {
    var ko = KO();
    if (!ko) return { ok: false, reason: 'no-kernel' };
    ensureBranchCol(db);
    var res = await ko.commitGroup(db, ops, { branch_id: branchId });
    (tags || []).forEach(function (t) { db.run('UPDATE "' + t.table + '" SET branch_id=? WHERE "' + t.idCol + '"=?', [branchId, t.id]); });
    return { ok: res.committed !== false, branchId: branchId, opIds: res.ids || [], gid: res.gid };
  }

  // discard the whole blue branch — ops folded away + blue projection rows removed (official reverts).
  function discardBlue(db, branchId) {
    var ko = KO();
    var opRes = ko ? ko.discardBranch(db, branchId) : null;
    var removed = { orders: 0, orderLines: 0, projects: 0 };
    var bq = JSON.stringify(String(branchId));
    if (_hasCol(db, 'C_Order', 'branch_id')) {
      var ords = db.exec("SELECT C_Order_ID FROM C_Order WHERE branch_id=" + bq);
      (ords.length ? ords[0].values : []).forEach(function (v) {
        var oid = v[0];
        var nl = Number(_scalar(db, "SELECT COUNT(*) FROM C_OrderLine WHERE C_Order_ID=?", [oid]) || 0);
        db.run("DELETE FROM C_OrderLine WHERE C_Order_ID=?", [oid]);
        db.run("DELETE FROM C_Order WHERE C_Order_ID=?", [oid]);
        removed.orders++; removed.orderLines += nl;
      });
    }
    if (_hasCol(db, 'C_Project', 'branch_id')) {
      var pjs = db.exec("SELECT C_Project_ID FROM C_Project WHERE branch_id=" + bq);
      (pjs.length ? pjs[0].values : []).forEach(function (v) {
        var pid = v[0];
        db.run("DELETE FROM C_ProjectLine WHERE c_project_id=?", [pid]);
        db.run("DELETE FROM C_ProjectPhase WHERE C_Project_ID=?", [pid]);
        db.run("DELETE FROM C_Project WHERE C_Project_ID=?", [pid]);
        removed.projects++;
      });
    }
    return { ok: true, branchId: branchId, op: opRes, removed: removed };
  }

  // accept-up-to a dot — blue ops turn white + blue projection rows become official (branch_id NULL).
  async function acceptBlue(db, branchId, uptoId) {
    var ko = KO();
    var res = ko ? await ko.acceptBranchUpTo(db, branchId, uptoId) : null;
    if (_hasCol(db, 'C_Order', 'branch_id')) db.run("UPDATE C_Order SET branch_id=NULL WHERE branch_id=?", [branchId]);
    if (_hasCol(db, 'C_Project', 'branch_id')) db.run("UPDATE C_Project SET branch_id=NULL WHERE branch_id=?", [branchId]);
    return { ok: true, branchId: branchId, accepted: res };
  }

  var API = { ensureBranchCol: ensureBranchCol, hasBranchCol: hasBranchCol, commitBlue: commitBlue, discardBlue: discardBlue, acceptBlue: acceptBlue };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BlueFold = API;
})(typeof self !== 'undefined' ? self : this);
