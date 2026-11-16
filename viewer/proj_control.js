/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// proj_control.js — BIM → Project FINANCE lane §F4: the PM control picture on a folded C_Project.
//   contractSum()  — Original Contract + Approved VOs = Revised Contract Sum (the commercial picture).
//   evm()          — PV / EV / AC and the PMI Earned-Value variances CV / SV and indices CPI / SPI.
//   projectControl()— both, in one read, for the viewer readout + the ERP window.
//
// EXTRACT-only — every number comes from the folded project itself, never invented:
//   BAC = Σ C_ProjectPhase.PlannedAmt (== C_Project.PlannedAmt, the BoQ baseline).
//   PV  = Σ phase.PlannedAmt × planned-fraction at the data date (from StartDate/EndDate) — the schedule.
//   EV  = Σ phase.PlannedAmt where IsComplete='Y' — the budgeted cost of work performed.
//   AC  = C_Project.InvoicedAmt — the actual cost booked (0 until a progress claim posts; honest, not faked).
//   Approved VOs = Σ GrandTotal of linked VO C_Orders with DocStatus='CO'; pending = the 'DR' ones.
// EVM formulas are the ones documented in viewer/variation_order.js (CV=EV−AC, SV=EV−PV, CPI=EV/AC, SPI=EV/PV),
//   here computed for real via BigDecimal. CPI/SPI are null when the divisor is 0 (undefined — never a fake 0).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('../erp/bigdecimal.js') : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;

  function _scalar(db, sql, params) {
    var r = db.exec(sql, params || []);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }
  function _bd(x) { return BD.of(String(x == null ? 0 : x)); }
  // a YYYY-MM-DD(.. ) string → epoch days (date-only, timezone-free) for schedule proration.
  function _days(s) {
    if (!s) return null;
    var m = String(s).slice(0, 10).split('-');
    if (m.length !== 3) return null;
    return Date.UTC(+m[0], (+m[1]) - 1, +m[2]) / 86400000;
  }

  // pure EVM math — given PV/EV/AC (BigDecimal or numeric), the variances + indices.
  function evmMetrics(pv, ev, ac) {
    var PV = _bd(pv), EV = _bd(ev), AC = _bd(ac);
    return {
      pv: PV.toString(), ev: EV.toString(), ac: AC.toString(),
      cv: EV.subtract(AC).toString(),                 // Cost Variance  EV − AC  (>0 = under budget)
      sv: EV.subtract(PV).toString(),                 // Schedule Var.  EV − PV  (>0 = ahead)
      cpi: AC.compareTo(BD.ZERO) === 0 ? null : EV.divide(AC, 4, HALF_UP).toString(), // EV/AC (>1 good)
      spi: PV.compareTo(BD.ZERO) === 0 ? null : EV.divide(PV, 4, HALF_UP).toString()  // EV/PV (>1 ahead)
    };
  }

  // does C_Order carry the BLUE-FUTURE branch_id column? (only after a blue push has ALTERed it in)
  function _hasBranchCol(db) {
    var r = db.exec("PRAGMA table_info(C_Order)");
    return r.length && r[0].values.some(function (v) { return String(v[1]).toLowerCase() === 'branch_id'; });
  }
  // Original Contract + Approved VOs = Revised Contract Sum (commercial picture).
  // §F9 — opts.branch: undefined/null = OFFICIAL view (excludes blue rows, branch_id IS NULL); a branch
  // string = that blue view (official rows + the branch's speculative rows). Column-safe: with no branch_id
  // column (the F1–F8 path) the filter is a no-op, so official == every row, unchanged.
  function contractSum(db, projectId, opts) {
    opts = opts || {};
    var original = _bd(_scalar(db, "SELECT PlannedAmt FROM C_Project WHERE C_Project_ID=?", [projectId]));
    var filt = '', args2 = null;
    if (_hasBranchCol(db)) {
      if (opts.branch == null) filt = " AND branch_id IS NULL";
      else { filt = " AND (branch_id IS NULL OR branch_id=?)"; args2 = opts.branch; }
    }
    function vo(statusClause) {
      var sql = "SELECT COALESCE(SUM(GrandTotal),0) FROM C_Order WHERE C_Project_ID=? AND Description LIKE 'BIM VO:%' AND " + statusClause + filt;
      var params = args2 != null ? [projectId, args2] : [projectId];
      return _bd(_scalar(db, sql, params));
    }
    var approved = vo("DocStatus='CO'");
    var pending = vo("DocStatus<>'CO'");
    return {
      original: original.toString(), approvedVOs: approved.toString(), pendingVOs: pending.toString(),
      revised: original.add(approved).toString(),            // committed contract (approved VOs only)
      whatIfRevised: original.add(approved).add(pending).toString(), // + pending/speculative VOs (the what-if)
      view: (opts.branch == null ? 'official' : 'blue:' + opts.branch)
    };
  }

  // EVM at a data ("as-of") date — defaults to today.
  // evmByPhase: the SAME per-phase arithmetic evm() sums (one implementation; CLI_ERP_IVR §29.4 P5 `status` shows the phases and their sum is the project): for each phase
  //   BAC = PlannedAmt, PV = BAC x planned fraction at the data date (linear over StartDate..EndDate, rounded to cents per phase), EV = BAC when IsComplete='Y', SV = EV - PV, SPI = EV/PV.
  //   AC is booked on the PROJECT (InvoicedAmt), not per phase, so a phase carries no AC/CPI (null: not known, never a fake 0).
  function _asOfDays(asOfDate) { return _days(asOfDate || (function () { try { return new Date().toISOString().slice(0, 10); } catch (e) { return '2026-01-01'; } })()); }
  function evmByPhase(db, projectId, asOfDate) {
    var asOf = _asOfDays(asOfDate);
    var phases = db.exec("SELECT PlannedAmt,StartDate,EndDate,IsComplete,C_ProjectPhase_ID,Name,SeqNo FROM C_ProjectPhase WHERE C_Project_ID=" + Number(projectId) + " ORDER BY SeqNo, C_ProjectPhase_ID");
    var rows = phases.length ? phases[0].values : [];
    return rows.map(function (r) {
      var amt = _bd(r[0]), sd = _days(r[1]), ed = _days(r[2]), done = (r[3] === 'Y');
      // planned fraction at the data date (linear over the phase window)
      var frac = BD.ZERO;
      if (asOf != null && ed != null && asOf >= ed) frac = BD.of('1');
      else if (asOf != null && sd != null && ed != null && asOf > sd && ed > sd) {
        frac = BD.of(String(asOf - sd)).divide(BD.of(String(ed - sd)), 6, HALF_UP);
      }
      var pv = amt.multiply(frac).setScale(2, HALF_UP), ev = done ? amt : BD.ZERO;
      return { id: r[4], name: r[5], seq: r[6], start: r[1], end: r[2], complete: done, bac: amt.toString(), pv: pv.toString(), ev: ev.toString(), sv: ev.subtract(pv).toString(),
        spi: pv.compareTo(BD.ZERO) === 0 ? null : ev.divide(pv, 4, HALF_UP).toString() };
    });
  }
  function evm(db, projectId, asOfDate) {
    var bac = BD.ZERO, pv = BD.ZERO, ev = BD.ZERO, nComplete = 0, ph = evmByPhase(db, projectId, asOfDate);
    ph.forEach(function (p) { bac = bac.add(_bd(p.bac)); pv = pv.add(_bd(p.pv)); if (p.complete) { ev = ev.add(_bd(p.ev)); nComplete++; } });
    var ac = _bd(_scalar(db, "SELECT InvoicedAmt FROM C_Project WHERE C_Project_ID=?", [projectId]));
    var m = evmMetrics(pv, ev, ac);
    var pctComplete = bac.compareTo(BD.ZERO) === 0 ? null : ev.divide(bac, 4, HALF_UP).toString();
    var pctPlanned = bac.compareTo(BD.ZERO) === 0 ? null : pv.divide(bac, 4, HALF_UP).toString();
    return {
      asOf: asOfDate || null, bac: bac.toString(), phases: ph.length, phasesComplete: nComplete,
      pv: m.pv, ev: m.ev, ac: m.ac, cv: m.cv, sv: m.sv, cpi: m.cpi, spi: m.spi,
      percentComplete: pctComplete, percentPlanned: pctPlanned,
      acIsZero: ac.compareTo(BD.ZERO) === 0
    };
  }

  // the whole control picture for the readout.
  function projectControl(db, projectId, asOfDate) {
    var cs = contractSum(db, projectId);
    var e = evm(db, projectId, asOfDate);
    var note = e.acIsZero ? 'AC=0 (no progress claim posted yet → CPI undefined; honest, not faked)' : null;
    return { projectId: projectId, contract: cs, evm: e, note: note };
  }

  var API = { evmMetrics: evmMetrics, contractSum: contractSum, evm: evm, evmByPhase: evmByPhase, projectControl: projectControl };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ProjControl = API;
})(typeof self !== 'undefined' ? self : this);
