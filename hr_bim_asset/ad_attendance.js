// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ATTENDANCE COMPILED ONTO THE **REAL NATIVE** S_Resource / S_ResourceAssignment TABLES
//   (bim-compiler prompts/RESUME_HBA_ERP_STAGE3.md §PREREQUISITE, watchdog finding 2026-07-03 — Witness:
//   W-HBA-AD-ATTENDANCE). The previous revision compiled onto a Ninja-staged `C_Attendance` — but C_Attendance
//   is NOT a real iDempiere table (AD_Table LIKE '%ttendance%' → 0 rows in ad_full.db): it was an INVENTED
//   dictionary extension, the same violation class WATCHDOG_BIM_ERP_SOURCE_OF_TRUTH.md exists to kill. The
//   REAL native fit is the "Mary Consultant" GardenWorld pattern sitting unused in the same DB:
//     person   → S_Resource (ad_user_id → AD_User — the SAME identity spine ad_payroll.js/models.js resolve;
//                m_warehouse_id → M_Warehouse — the SAME building FK ad_tenancy.js resolves onto)
//     session  → S_ResourceAssignment (assigndatefrom = check-in, assigndateto = check-out — NULL = OPEN, the
//                exact honest-open semantic this module always had; qty = the REAL derived hours;
//                isconfirmed = the maker-checker gate: 'Y' closed, 'N' open — never a fabricated approval)
//
//   ROOM GRANULARITY (the ONE design decision, accepted per RESUME_HBA_ERP_STAGE3.md): S_ResourceAssignment
//   has NO m_locator_id/room column natively (verified live) — the native model is person@building/from→to/
//   hours/confirmed. The ZONE therefore stays a **BIM spatial-overlay fact** (attendance.js's signed op-log
//   `zone` param), carried BESIDE the AD rows in the `spatial` view-trace (keyed by the row PK) — the same
//   idiom ad_bom.js uses for geometry. It is NEVER forced into a fabricated FK column.
//
//   BUILDER DELEGATION (don't duplicate): the s_resourceassignment/s_resource COLUMN SHAPES are owned by
//   occupancy.js's already-witnessed toResourceAssignmentRow/toResourceRow (W-HBA-AD-OCC — same tables, room-
//   type resource). This module wraps those builders with the attendance semantics (person-type resource,
//   hours-as-qty, honest-open NULLs) instead of re-declaring the column set.
//
//   NON-INVENT GATE (unchanged discipline): a session whose employee does NOT resolve to a real seeded
//   S_Resource is SKIPPED into `skipped[]` with a reason — NEVER given a fabricated FK. Rows are column-pure;
//   AD system columns (ad_client_id/isactive/created…) are the PERSISTER's job (see ad_payroll.js hrIns).
//
//   SOURCE = attendance.js's already-witnessed `sessions(log, period)` reader (UNCHANGED). readPresence() is
//   the LENS READ back over the persisted rows — the ad_infowindow 7600000 JOIN (S_ResourceAssignment ⋈
//   S_Resource ⋈ AD_User ⋈ M_Warehouse), mirroring ad_bom.readBom. Read the log after every run.
'use strict';
(function () {
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var W = _r ? require('./watermark') : _g.HbaWatermark;
var O = _r ? require('./occupancy') : _g.HbaOccupancy;

// ONE s_resource header row for ONE person. Delegates the column shape to occupancy.toResourceRow (the ONE
// witnessed builder for this table), then threads the two REAL person columns the room path never needed:
// ad_user_id (identity spine) + m_warehouse_id (building FK) — both verified real S_Resource columns.
// `person` = { code, name?, ad_user_id, m_warehouse_id? }; code rides Value (the same Value=identity idiom
// the trades/rooms rows use). Honest null when identity is missing — never a person without a real AD_User.
function toPersonResourceRow(person, s_resourcetype_id, seedId) {
  if (!person || person.code == null || person.ad_user_id == null || !O) return null;
  var row = O.toResourceRow({ guid: person.code, name: person.name || person.code }, s_resourcetype_id, seedId, null);
  if (!row) return null;
  row.ad_user_id = person.ad_user_id;
  if (person.m_warehouse_id != null) row.m_warehouse_id = person.m_warehouse_id;
  return row;
}

// ONE s_resourceassignment row for ONE presence session. Delegates the column shape to occupancy.
// toResourceAssignmentRow (same table, witnessed), then applies the attendance semantics:
//   assigndatefrom = check-in ts · assigndateto = check-out ts | NULL (OPEN — no fabricated finish)
//   qty = the REAL derived hours (attendance.js _hoursBetween) | NULL when open (no fabricated duration)
//   isconfirmed = 'Y' only on a CLOSED session (a real completed in→out pair); an open one is honestly 'N'
// The `_party` carry-along is dropped: the person identity rides S_Resource.ad_user_id (a real FK), not a
// bolt-on. The zone is NOT here — see the header (spatial view-trace, never a fabricated column).
function toAssignmentRow(session, s_resource_id, seedId) {
  if (!session || s_resource_id == null || !O) return null;
  var open = !!session.open;
  var row = O.toResourceAssignmentRow({ verb: 'ASSIGN', target: s_resource_id,
    params: { party: session.employee, from: session.in || null, to: open ? null : (session.out || null) } }, seedId);
  if (!row) return null;
  delete row._party;
  row.name = session.employee != null ? String(session.employee) : null;
  row.description = open ? 'presence session (open — no fabricated finish)' : 'presence session';
  row.assigndateto = open ? null : (session.out || null);
  row.qty = open ? null : (session.hours != null ? session.hours : null);
  row.isconfirmed = open ? 'N' : 'Y';
  return row;
}

// compile a WHOLE period's presence sessions into native s_resourceassignment rows in one pass →
// { rows, skipped, spatial, _watermark }. `opts.resourceMap` = { <employee code> : s_resource_id } built from
// REAL queried rows (resourceMapFromResources over the viewer's erpQuery / a witness's ad_seed.db handle).
// A session whose employee is not in the map is SKIPPED (never a fabricated FK). `spatial` carries the BIM
// zone fact per accepted row (keyed by the row PK) — the room-granularity split, see header. Deterministic:
// s_resourceassignment_id is a 1-based sequence over accepted rows (no Date.now/random).
function compileAttendance(sessions, opts) {
  sessions = sessions || []; opts = opts || {};
  var resourceMap = opts.resourceMap || {};
  var seq = 0; function seedId() { return ++seq; }
  var rows = [], skipped = [], spatial = [];
  sessions.forEach(function (s) {
    var rid = resourceMap[s.employee];
    if (rid == null) { skipped.push({ employee: s.employee, zone: s.zone, reason: 'employee code resolves to no real S_Resource' }); return; }
    var row = toAssignmentRow(s, rid, seedId);
    if (!row) { skipped.push({ employee: s.employee, zone: s.zone, reason: 'session incomplete — no row built' }); return; }
    rows.push(row);
    spatial.push({ s_resourceassignment_id: row.s_resourceassignment_id, employee: s.employee, zone: s.zone, in: s.in });
  });
  var out = { rows: rows, skipped: skipped, spatial: spatial };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

// build the employee→resource map from injected real rows (the viewer's erpQuery / a witness's db handle):
// S_Resource.Value == the employee code (the Value=identity idiom). Pure lookup — never touches a DB itself.
function resourceMapFromResources(resourceRows) {
  var m = {}; (resourceRows || []).forEach(function (r) { if (r && r.value != null && r.s_resource_id != null) m[r.value] = r.s_resource_id; });
  return m;
}

// ★ LENS READ — the persisted attendance read back through the native JOIN (the ad_infowindow 7600000 lens
// seed_hba_erp.js declares), mirroring ad_bom.readBom: S_ResourceAssignment ⋈ S_Resource ⋈ AD_User ⋈
// M_Warehouse. Honest empty when no db. opts.m_warehouse_id scopes to one building. Returns
// { sessions: [{assignment_id, who, building, checkin, checkout, hours, confirmed}], _watermark } — open
// sessions surface with NULL checkout/hours (honest-open survives the round-trip).
function readPresence(erpQuery, opts) {
  opts = opts || {};
  if (typeof erpQuery !== 'function') return W ? W.stamp({ sessions: [] }, opts.locale || 'en') : { sessions: [] };
  var where = '', params = [];
  if (opts.m_warehouse_id != null) { where = ' WHERE W.M_Warehouse_ID=?'; params.push(opts.m_warehouse_id); }
  var sql = 'SELECT RA.S_ResourceAssignment_ID AS assignment_id, U.Name AS who, W.Name AS building,'
    + ' RA.AssignDateFrom AS checkin, RA.AssignDateTo AS checkout, RA.Qty AS hours, RA.IsConfirmed AS confirmed'
    + ' FROM S_ResourceAssignment RA JOIN S_Resource R ON RA.S_Resource_ID=R.S_Resource_ID'
    + ' JOIN AD_User U ON R.AD_User_ID=U.AD_User_ID'
    + ' JOIN M_Warehouse W ON R.M_Warehouse_ID=W.M_Warehouse_ID' + where + ' ORDER BY RA.AssignDateFrom';
  var rows;
  try { rows = erpQuery(sql, params); } catch (e) { rows = []; }
  var out = { sessions: rows || [] };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

var AD = { toPersonResourceRow: toPersonResourceRow, toAssignmentRow: toAssignmentRow,
  compileAttendance: compileAttendance, resourceMapFromResources: resourceMapFromResources,
  readPresence: readPresence };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdAttendance = AD;
})();
