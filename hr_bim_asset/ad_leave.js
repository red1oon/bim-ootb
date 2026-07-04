// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — LEAVE COMPILED ONTO THE REAL NATIVE S_ResourceUnAvailable TABLE (bim-compiler
//   prompts/RESUME_HR_BIM_ASSET.md §2026-07-04 thread C, user 2026-07-04: "Leave is the unavailable status of
//   the person as a Product/Resource? — the same way ResourceAssignment models Mary Consultant"). Confirmed
//   fit: a room's maintenance blackout is already modeled as a real S_ResourceUnAvailable row (occupancy.js's
//   header comment — "an UNAVAIL is the S_ResourceUnAvailable blackout"), and the person-as-S_Resource
//   identity already exists (ad_attendance.js §Stage 3, the "Mary Consultant" pattern). S_ResourceUnAvailable
//   is tab 416 "Unavailability", a CHILD TAB of window 236 "Resource" — the SAME window Dashboard already
//   deep-links into (viewer/hba_lens.js AD_WINDOWS.RESOURCE) — no new window needed.
//
//   BUILDER DELEGATION: leave.js OWNS the signed ACCRUE/TAKE op-log + balance/classify replay (unchanged —
//   still the payroll feed's source of truth). This module ADDITIVELY projects each TAKE op onto the real
//   S_ResourceUnAvailable columns (verified against build/erp/ad_full.db PRAGMA table_info(s_resourceunavailable):
//   s_resourceunavailable_id, s_resource_id, datefrom, dateto, description — plus the standard AD system
//   columns the persister supplies). A TAKE whose employee does NOT resolve to a real seeded S_Resource is
//   SKIPPED with a reason — never a fabricated FK (same non-invent discipline as ad_attendance.js's
//   resourceMapFromResources gate).
//
//   DATE RANGE: a TAKE op carries `ts` (the take event's own timestamp) + `days` (an integer count), not an
//   explicit date range — datefrom = the TAKE's own date, dateto = datefrom + (days-1) inclusive (an N-day
//   leave starting on X runs through X+N-1). Pure date arithmetic on the SUPPLIED ts, never Date.now().
//
//   This is ADDITIVE to the payroll feed (leave.leaveDeduction), not a replacement — Leave still needs its own
//   paid/unpaid balance replay for payroll; this ALSO surfaces the same TAKE as a resource-availability fact,
//   the same way a room's blackout does. Read the log after every run.
'use strict';
(function () {
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var W = _r ? require('./watermark') : _g.HbaWatermark;

function _dateOnly(ts) { return String(ts).slice(0, 10); }
// pure date arithmetic on a supplied 'YYYY-MM-DD' — no Date.now(), deterministic in the input alone.
function _addDays(dateStr, days) {
  var d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ONE s_resourceunavailable row for ONE leave TAKE op. `s_resource_id` = the employee's existing S_Resource
// (resolved by the caller via the SAME resourceMap idiom ad_attendance.js uses — Value=employee code). Honest
// null when the op isn't a real TAKE or no resource resolves — never a fabricated blackout.
function toUnavailableRow(takeOp, s_resource_id, seedId) {
  if (!takeOp || takeOp.verb !== 'TAKE' || s_resource_id == null) return null;
  var p = takeOp.params || {};
  if (!(p.days > 0)) return null;
  var from = _dateOnly(takeOp.ts), to = _addDays(from, Math.max(0, p.days - 1));
  return { s_resourceunavailable_id: seedId ? seedId() : 1, s_resource_id: s_resource_id,
    datefrom: from, dateto: to, description: 'Leave (' + p.type + ') ' + p.days + 'd — ' + takeOp.target };
}

// compile a WHOLE signed leave log's TAKE ops into native s_resourceunavailable rows in one pass →
// { rows, skipped, _watermark }. `resourceMap` = { <employee code>: s_resource_id } — the SAME map shape
// ad_attendance.resourceMapFromResources builds (real queried S_Resource rows, Value=identity idiom).
// Deterministic: s_resourceunavailable_id is a 1-based sequence over accepted rows (no Date.now/random).
function compileLeaveUnavailability(log, resourceMap, opts) {
  opts = opts || {}; resourceMap = resourceMap || {};
  var seq = 0; function seedId() { return ++seq; }
  var takes = (log || []).filter(function (o) { return o.cls === 'LEAVE' && o.verb === 'TAKE'; });
  var rows = [], skipped = [];
  takes.forEach(function (o) {
    var rid = resourceMap[o.target];
    if (rid == null) { skipped.push({ employee: o.target, reason: 'employee code resolves to no real S_Resource' }); return; }
    var row = toUnavailableRow(o, rid, seedId);
    if (!row) { skipped.push({ employee: o.target, reason: 'TAKE op incomplete — no row built' }); return; }
    rows.push(row);
  });
  var out = { rows: rows, skipped: skipped };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

// ★ LENS READ — the persisted leave-blackout read back through the native chain: S_ResourceUnAvailable ⋈
// S_Resource ⋈ AD_User (mirrors ad_attendance.readPresence's JOIN shape). Honest empty when no db.
function readUnavailability(erpQuery, opts) {
  opts = opts || {};
  if (typeof erpQuery !== 'function') return W ? W.stamp({ blackouts: [] }, opts.locale || 'en') : { blackouts: [] };
  var where = '', params = [];
  if (opts.s_resource_id != null) { where = ' WHERE UA.S_Resource_ID=?'; params.push(opts.s_resource_id); }
  var sql = 'SELECT UA.S_ResourceUnAvailable_ID AS id, U.Name AS who, UA.DateFrom AS datefrom,'
    + ' UA.DateTo AS dateto, UA.Description AS description'
    + ' FROM S_ResourceUnAvailable UA JOIN S_Resource R ON UA.S_Resource_ID=R.S_Resource_ID'
    + ' JOIN AD_User U ON R.AD_User_ID=U.AD_User_ID' + where + ' ORDER BY UA.DateFrom';
  var rows;
  try { rows = erpQuery(sql, params); } catch (e) { rows = []; }
  var out = { blackouts: rows || [] };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

var AD = { toUnavailableRow: toUnavailableRow, compileLeaveUnavailability: compileLeaveUnavailability,
  readUnavailability: readUnavailability };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdLeave = AD;
})();
