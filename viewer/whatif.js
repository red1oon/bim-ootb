/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// whatif.js — TM 4D/5D variance lane §S6: schedule what-if as a BLUE branch op on a folded C_Project.
//
// The minimal finish-to-start DEPENDENCY model (NOT a P6 network): the C_ProjectPhase rows of one project,
// ordered by SeqNo, ARE the chain — the proj_fold forward-pass laid them contiguous (each StartDate == prior
// EndDate). So the dependency = SeqNo order, with each phase's lag to its predecessor (lag_i = start_i − end_{i-1})
// read from the baseline and PRESERVED on ripple. A slip on phase k re-folds k..N forward (durations + lags kept).
//
// Reuses Blue Future exactly like viewer/blue_fold.js — schedule-scoped to C_ProjectPhase:
//   commitSlip  — INSERT the rippled downstream phase rows tagged branch_id (the speculative re-fold); official
//                 rows (branch_id IS NULL) untouched & invisible to official reads. If KernelOps is present, also
//                 record a SCHEDULE_SLIP op-group on the branch (the op-log / dot rail). KernelOps is OPTIONAL
//                 (guarded `var ko = KO()`), so the projection layer is fully node-testable via sql.js.
//   discardSlip — drop the blue phase rows (+ KernelOps.discardBranch) → official reverts; it never moved.
//   acceptSlip  — copy the blue StartDate/EndDate onto the official rows + drop blue rows
//                 (+ KernelOps.acceptBranchUpTo) → the what-if becomes the new baseline (re-baseline).
//
// EXTRACT-only: BAC (Σ PlannedAmt) is unchanged (same scope) — only DATES and the schedule-derived PV move.
// PV uses the SAME linear-fraction × PlannedAmt as proj_control.evm, in BigDecimal (money via site/bigdecimal.js).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('../erp/bigdecimal.js') : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;
  var DAY = 86400000;

  function KO() { return (typeof window !== 'undefined' && window.KernelOps) || global.KernelOps || null; }
  function _scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
  function _bd(x) { return BD.of(String(x == null ? 0 : x)); }

  // 'YYYY-MM-DD( hh:mm:ss)' → epoch days (date-only, tz-free); and back.
  function _days(s) {
    if (s == null) return null;
    var m = String(s).slice(0, 10).split('-');
    if (m.length !== 3) return null;
    return Date.UTC(+m[0], (+m[1]) - 1, +m[2]) / DAY;
  }
  function _date(days) {
    var d = new Date(days * DAY);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' 00:00:00';
  }

  function _hasCol(db, t, c) {
    var r = db.exec("PRAGMA table_info(" + t + ")");
    return r.length && r[0].values.some(function (v) { return String(v[1]).toLowerCase() === c.toLowerCase(); });
  }
  function ensureBranchCol(db) {
    if (!_hasCol(db, 'C_ProjectPhase', 'branch_id')) { try { db.run('ALTER TABLE "C_ProjectPhase" ADD COLUMN branch_id TEXT'); } catch (e) {} }
  }

  // Read a project's phases, SeqNo-ordered, with the F-S chain fields derived (dur, lag to predecessor).
  // branchId null → OFFICIAL (branch_id IS NULL, the baseline). branchId set → OVERLAY: the blue row for a
  // SeqNo if one exists, else the official row (so downstream blue rows replace their baseline twins).
  function readPhases(db, projectId, branchId) {
    var hasBranch = _hasCol(db, 'C_ProjectPhase', 'branch_id');
    var sql, params;
    if (!hasBranch || branchId == null) {
      sql = "SELECT C_ProjectPhase_ID,SeqNo,Name,StartDate,EndDate,PlannedAmt,IsComplete FROM C_ProjectPhase " +
            "WHERE C_Project_ID=?" + (hasBranch ? " AND branch_id IS NULL" : "") + " ORDER BY SeqNo";
      params = [projectId];
    } else {
      // overlay: official rows whose SeqNo has no blue twin, UNION the blue rows; blue wins per SeqNo.
      sql = "SELECT C_ProjectPhase_ID,SeqNo,Name,StartDate,EndDate,PlannedAmt,IsComplete FROM C_ProjectPhase b " +
            "WHERE C_Project_ID=? AND branch_id=? UNION ALL " +
            "SELECT C_ProjectPhase_ID,SeqNo,Name,StartDate,EndDate,PlannedAmt,IsComplete FROM C_ProjectPhase o " +
            "WHERE C_Project_ID=? AND branch_id IS NULL AND SeqNo NOT IN " +
            "(SELECT SeqNo FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?) ORDER BY SeqNo";
      params = [projectId, branchId, projectId, projectId, branchId];
    }
    var r = db.exec(sql, params);
    var rows = r.length ? r[0].values : [];
    var prevEnd = null;
    return rows.map(function (v) {
      var sd = _days(v[3]), ed = _days(v[4]);
      var p = {
        id: v[0], seqno: Number(v[1]), name: v[2], startDays: sd, endDays: ed,
        dur: (sd != null && ed != null) ? (ed - sd) : 0,
        lag: (prevEnd != null && sd != null) ? (sd - prevEnd) : 0,
        plannedAmt: String(v[5] == null ? 0 : v[5]), isComplete: (v[6] === 'Y')
      };
      prevEnd = ed;
      return p;
    });
  }

  // PURE finish-to-start ripple. slips: { seqno: {startDelta, durDelta} } in DAYS (positive = later/longer).
  // Phase k: start += startDelta, dur = max(0, dur + durDelta). For every later phase (SeqNo order):
  //   start_i = end_{i-1} + lag_i  (the baseline lag is preserved),  end_i = start_i + dur_i.
  function ripple(phases, slips) {
    slips = slips || {};
    var out = phases.map(function (p) { return { id: p.id, seqno: p.seqno, name: p.name, dur: p.dur, lag: p.lag, plannedAmt: p.plannedAmt, isComplete: p.isComplete, startDays: p.startDays, endDays: p.endDays }; });
    var prevEnd = null, touched = false;
    out.forEach(function (p, i) {
      var slip = slips[p.seqno];
      if (i === 0) {
        // anchor phase keeps its start unless directly slipped.
        if (slip && slip.startDelta) { p.startDays += slip.startDelta; touched = true; }
        if (slip && slip.durDelta) { p.dur = Math.max(0, p.dur + slip.durDelta); touched = true; }
      } else {
        // re-anchor to predecessor's (possibly moved) end + preserved lag.
        p.startDays = prevEnd + p.lag;
        if (slip && slip.startDelta) { p.startDays += slip.startDelta; touched = true; }
        if (slip && slip.durDelta) { p.dur = Math.max(0, p.dur + slip.durDelta); touched = true; }
      }
      p.endDays = p.startDays + p.dur;
      prevEnd = p.endDays;
    });
    return { phases: out, projectFinishDays: prevEnd, touched: touched };
  }

  // PV (planned value) of a phase set at a data ("as-of") date — Σ PlannedAmt × linear schedule fraction.
  // Mirrors proj_control.evm exactly, on an in-memory phase array (so a blue schedule can be priced without a DB read).
  function _pvAt(phases, asOfDays) {
    var pv = BD.ZERO;
    phases.forEach(function (p) {
      var amt = _bd(p.plannedAmt), sd = p.startDays, ed = p.endDays, frac = BD.ZERO;
      if (asOfDays != null && ed != null && asOfDays >= ed) frac = BD.of('1');
      else if (asOfDays != null && sd != null && ed != null && asOfDays > sd && ed > sd) {
        frac = BD.of(String(asOfDays - sd)).divide(BD.of(String(ed - sd)), 6, HALF_UP);
      }
      pv = pv.add(amt.multiply(frac).setScale(2, HALF_UP));
    });
    return pv;
  }
  function _bac(phases) { var b = BD.ZERO; phases.forEach(function (p) { b = b.add(_bd(p.plannedAmt)); }); return b; }

  // The what-if picture: official baseline vs the rippled blue schedule + the forward variance.
  function scheduleWhatIf(db, projectId, slips, asOfDate) {
    var official = readPhases(db, projectId, null);
    var blue = ripple(official, slips).phases;
    var asOf = _days(asOfDate || _date(_officialFinish(official)));    // default as-of = official finish
    var offFinish = _officialFinish(official), bluFinish = _officialFinish(blue);
    var pvOff = _pvAt(official, asOf), pvBlue = _pvAt(blue, asOf);
    return {
      projectId: projectId, asOf: asOfDate || _date(offFinish),
      official: { phases: official.map(_pub), finish: _date(offFinish), pv: pvOff.toString(), bac: _bac(official).toString() },
      blue: { phases: blue.map(_pub), finish: _date(bluFinish), pv: pvBlue.toString(), bac: _bac(blue).toString() },
      forward: {
        finishSlipDays: (offFinish != null && bluFinish != null) ? (bluFinish - offFinish) : null,
        pvDelta: pvBlue.subtract(pvOff).toString(),     // schedule shifts PV (totals move), BAC stays
        bacDelta: _bac(blue).subtract(_bac(official)).toString()   // 0 — same scope (honest cross-check)
      }
    };
  }
  // P1.b drag-to-slip: convert a horizontal pointer drag (CSS px) on a phase track into a whole-day
  // slip. spanDays = the track's full time-span; trackPx = track.clientWidth (CSS px, so dpr-safe —
  // clientWidth is already device-independent, unlike canvas.width). Days are the schedule grain
  // (dates are date-only), so we round. This is the SAME _slips[seqno].startDelta the steppers write,
  // so a drag and the −/+ buttons drive one path. Witness: erp/tests/whatif_drag_witness.js.
  function pxToDays(dpx, trackPx, spanDays) {
    return Math.round((Number(dpx) || 0) * (Number(spanDays) || 0) / Math.max(1, Number(trackPx) || 0));
  }

  function _officialFinish(phases) { return phases.length ? phases[phases.length - 1].endDays : null; }
  function _pub(p) { return { seqno: p.seqno, name: p.name, start: _date(p.startDays), end: _date(p.endDays), durDays: p.dur, plannedAmt: p.plannedAmt }; }

  // Commit the what-if as a BLUE schedule slip: insert the rippled downstream phase rows tagged branch_id.
  // Only the phases whose dates actually MOVED get a blue twin (the upstream/unaffected stay official-only).
  async function commitSlip(db, branchId, projectId, slips) {
    ensureBranchCol(db);
    var official = readPhases(db, projectId, null);
    var rip = ripple(official, slips);
    var blue = rip.phases;
    var cols = db.exec("PRAGMA table_info(C_ProjectPhase)")[0].values.map(function (v) { return v[1]; });
    var moved = 0, slipOps = [];
    blue.forEach(function (bp, i) {
      var op = official[i];
      if (bp.startDays === op.startDays && bp.endDays === op.endDays) return;   // unchanged → no blue row
      // clone the official row, override dates + branch_id, mint a fresh PK.
      var src = db.exec("SELECT * FROM C_ProjectPhase WHERE C_ProjectPhase_ID=?", [op.id]);
      if (!src.length) return;
      var vals = src[0].values[0].slice();
      var newId = Number(_scalar(db, "SELECT COALESCE(MAX(C_ProjectPhase_ID),0)+1 FROM C_ProjectPhase") || 1);
      var assigns = cols.map(function (c, ci) {
        var val = vals[ci];
        if (c === 'C_ProjectPhase_ID') val = newId;
        else if (c === 'StartDate') val = _date(bp.startDays);
        else if (c === 'EndDate') val = _date(bp.endDays);
        else if (c === 'branch_id') val = branchId;
        return val;
      });
      var ph = cols.map(function () { return '?'; }).join(',');
      db.run('INSERT INTO C_ProjectPhase (' + cols.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + ph + ')', assigns);
      moved++;
      slipOps.push({ op_type: 'SCHEDULE_SLIP', table: 'C_ProjectPhase', record_id: newId,
        parameters: { c_project_id: projectId, seqno: bp.seqno, start: _date(bp.startDays), end: _date(bp.endDays), branch_id: branchId } });
    });
    var ko = KO(), gid = null;
    if (ko && slipOps.length) { try { var res = await ko.commitGroup(db, slipOps, { branch_id: branchId }); gid = res && res.gid; } catch (e) {} }
    return { ok: true, branchId: branchId, projectId: projectId, movedPhases: moved, finishSlipDays: scheduleWhatIf(db, projectId, slips).forward.finishSlipDays, gid: gid };
  }

  // Discard the blue schedule slip — drop the blue phase rows; official reverts (it never moved).
  function discardSlip(db, branchId, projectId) {
    var removed = 0;
    if (_hasCol(db, 'C_ProjectPhase', 'branch_id')) {
      removed = Number(_scalar(db, "SELECT COUNT(*) FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?", [projectId, branchId]) || 0);
      db.run("DELETE FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?", [projectId, branchId]);
    }
    var ko = KO(); if (ko) { try { ko.discardBranch(db, branchId); } catch (e) {} }
    return { ok: true, branchId: branchId, removedPhases: removed };
  }

  // Accept the blue schedule slip — copy each blue row's dates onto its official twin (by SeqNo), then drop the
  // blue rows. The what-if becomes the new baseline. KernelOps.acceptBranchUpTo turns the slip ops white.
  async function acceptSlip(db, branchId, projectId, uptoId) {
    var rebased = 0;
    if (_hasCol(db, 'C_ProjectPhase', 'branch_id')) {
      var blue = db.exec("SELECT SeqNo,StartDate,EndDate FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?", [projectId, branchId]);
      (blue.length ? blue[0].values : []).forEach(function (v) {
        db.run("UPDATE C_ProjectPhase SET StartDate=?,EndDate=? WHERE C_Project_ID=? AND branch_id IS NULL AND SeqNo=?", [v[1], v[2], projectId, v[0]]);
        rebased++;
      });
      db.run("DELETE FROM C_ProjectPhase WHERE C_Project_ID=? AND branch_id=?", [projectId, branchId]);
    }
    var ko = KO(); if (ko && uptoId != null) { try { await ko.acceptBranchUpTo(db, branchId, uptoId); } catch (e) {} }
    return { ok: true, branchId: branchId, rebasedPhases: rebased };
  }

  var API = {
    readPhases: readPhases, ripple: ripple, scheduleWhatIf: scheduleWhatIf,
    commitSlip: commitSlip, discardSlip: discardSlip, acceptSlip: acceptSlip,
    ensureBranchCol: ensureBranchCol, pxToDays: pxToDays, _days: _days, _date: _date
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.WhatIf = API;
})(typeof self !== 'undefined' ? self : this);
