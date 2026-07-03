// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ATTENDANCE COMPILED ONTO THE NATIVE (Ninja-staged) C_Attendance CHILD TABLE
//   (bim-compiler prompts/RESUME_HBA_ERP_GOVERNED_DISPLAY.md §DESIGN-ATTENDANCE, Stage 2). This module's
//   whole job is the gap flagged in §EVIDENCE point 3: resolve attendance.js's bare `EMP-n`/`EMP00n` ids and
//   room guids to the REAL c_bpartner_id / m_locator_id seeded in Stage 1, so a presence row STOPS being a
//   self-signed op keyed by a bare string and BECOMES a real AD child row that JOINs
//   C_Attendance→HR_Process→C_BPartner→M_Locator→M_Warehouse (the §DESIGN-ATTENDANCE InfoWindow lens).
//
//   NON-INVENT GATE (mirrors ad_tenancy.compileBuilding's `skipped[]` discipline): a session whose employee
//   or zone does NOT resolve to a real seeded id is SKIPPED into `skipped[]` with a reason — NEVER given a
//   fabricated FK. The row builder is column-pure: it emits ONLY columns that exist on the seeded physical
//   C_Attendance table (seed_hba_erp.js DDL.C_Attendance — dumped live from the Ninja-staged AD_Column set);
//   the AD system columns (AD_Client_ID/AD_Org_ID/IsActive/Created…) are the PERSISTER's job, exactly as
//   ad_payroll.js's hrIns and ad_tenancy.js's builders leave them (see those headers).
//
//   HONEST-OPEN preserved (attendance.js's own §SLICE-1 contract): a session with no check-out is OPEN —
//   CheckOutTime AND Qty stay NULL (no fabricated finish/hours). Qty = the REAL derived hours (attendance.js
//   _hoursBetween over the real in/out ts), mirroring hr_movement.qty; never an independently-stored number.
//
//   SOURCE = attendance.js's already-witnessed `sessions(log, period)` reader (UNCHANGED — no re-implementation
//   of the fold). This module takes those sessions + three injected resolution maps (processId, partnerMap,
//   locatorMap) and produces the child rows. The maps come from the REAL seeded rows at compile time (the
//   viewer's erpQuery seam / a witness's injected ad_seed.db handle) — so every emitted FK traces to a queried
//   row, per the §CONVENTION "any info panel in BIM has to be just a lens from such source."
'use strict';
(function () {
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// ONE C_Attendance child row for ONE presence session. Column-pure: keys are a SUBSET of the seeded physical
// table's columns (the non-invent gate the witness enforces). `session` = an attendance.js session
// ({employee, zone, in, out, hours, open}); the caller has already resolved employee→c_bpartner_id and
// zone→m_locator_id (both REAL seeded ids) and supplies the parent hr_process_id + a seedId sequencer.
function toAttendanceRow(session, hr_process_id, c_bpartner_id, m_locator_id, seedId) {
  if (!session || c_bpartner_id == null || m_locator_id == null) return null;
  var open = !!session.open;
  return { C_Attendance_ID: seedId ? seedId() : 1, HR_Process_ID: hr_process_id != null ? hr_process_id : null,
    C_BPartner_ID: c_bpartner_id, M_Locator_ID: m_locator_id,
    ServiceDate: session.in ? String(session.in).slice(0, 10) : null,
    CheckInTime: session.in || null,
    CheckOutTime: open ? null : (session.out || null),      // OPEN → honest NULL (no fabricated finish)
    Qty: open ? null : (session.hours != null ? session.hours : null),   // hours DERIVED from real in/out; open → NULL
    Description: open ? 'demo session (open — no fabricated finish)' : 'demo session' };
}

// compile a WHOLE period's presence sessions into native C_Attendance rows in one pass →
// {rows, skipped, _watermark}. `opts` supplies the REAL resolution:
//   opts.processId   — the parent HR_Process this attendance period folds under (real seeded hr_process_id)
//   opts.partnerMap  — { <employee id> : c_bpartner_id }  (real seeded C_BPartner ids, e.g. EMP001→1001)
//   opts.locatorMap  — { <zone guid>   : m_locator_id }   (real seeded M_Locator ids, keyed by room guid)
// A session whose employee OR zone is not in the maps is SKIPPED (never a fabricated FK), captured in
// `skipped[]` with a reason — same non-invent contract as ad_tenancy.compileBuilding. Deterministic:
// C_Attendance_ID is a 1-based sequence over the accepted rows (no Date.now/random).
function compileAttendance(sessions, opts) {
  sessions = sessions || []; opts = opts || {};
  var partnerMap = opts.partnerMap || {}, locatorMap = opts.locatorMap || {}, processId = (opts.processId != null ? opts.processId : null);
  var seq = 0; function seedId() { return ++seq; }
  var rows = [], skipped = [];
  sessions.forEach(function (s) {
    var bp = partnerMap[s.employee], loc = locatorMap[s.zone];
    if (bp == null) { skipped.push({ employee: s.employee, zone: s.zone, reason: 'employee id resolves to no real C_BPartner' }); return; }
    if (loc == null) { skipped.push({ employee: s.employee, zone: s.zone, reason: 'zone guid resolves to no real M_Locator' }); return; }
    rows.push(toAttendanceRow(s, processId, bp, loc, seedId));
  });
  return W ? W.stamp({ rows: rows, skipped: skipped }, opts.locale || 'en') : { rows: rows, skipped: skipped };
}

// build the two resolution maps from injected real rows (the viewer's erpQuery / a witness's ad_seed.db).
// partnerMap: employee code → C_BPartner_ID via the AD_User contact (Name==code) → its C_BPartner_ID; falls
// back to a bare {code: bp} table when the caller already holds it. locatorMap: room guid → M_Locator_ID via
// M_Locator.Value==guid. Both are pure lookups over rows the CALLER queried — this module never touches a DB.
function partnerMapFromUsers(userRows) {
  var m = {}; (userRows || []).forEach(function (u) { if (u && u.name != null && u.c_bpartner_id != null) m[u.name] = u.c_bpartner_id; });
  return m;
}
function locatorMapFromLocators(locatorRows) {
  var m = {}; (locatorRows || []).forEach(function (l) { if (l && l.value != null && l.m_locator_id != null) m[l.value] = l.m_locator_id; });
  return m;
}

var AD = { toAttendanceRow: toAttendanceRow, compileAttendance: compileAttendance,
  partnerMapFromUsers: partnerMapFromUsers, locatorMapFromLocators: locatorMapFromLocators };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdAttendance = AD;
})();
