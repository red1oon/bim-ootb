// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-ATTENDANCE witness (bim-compiler RESUME_HBA_ERP_GOVERNED_DISPLAY.md
//   §DESIGN-ATTENDANCE, Stage 2/4). Proves ad_attendance.js compiles attendance.js's OWN witnessed sessions
//   onto the native (Ninja-staged) C_Attendance child shape with the non-invent discipline the whole
//   ERP-governed-display thread rests on:
//     • AA0 — every emitted row's keys ⊆ the REAL seeded C_Attendance column list (independently sourced from
//       the seed DDL / §DESIGN-ATTENDANCE) — the "no invention outside the AD" gate, same pattern as
//       W-HBA-AD-PAYROLL's AD0 / W-HBA-AD-OCC's keysSubset.
//     • AA1 — every FK (HR_Process/C_BPartner/M_Locator) is a real resolved id, never null on an accepted row.
//     • AA2 — HONEST-OPEN: an open session keeps CheckOutTime AND Qty NULL (no fabricated finish/hours).
//     • AA3 — NON-INVENT SKIP: a session whose employee/zone does not resolve to a real seeded id is SKIPPED
//       (captured with a reason), never given a fabricated FK.
//     • AA4 — deterministic sequential C_Attendance_ID over the accepted rows.
//   Run: node hr_bim_asset/tests/witness_ad_attendance.js   — exit 0 = green. Read the log after run.
'use strict';
var ADA = require('../ad_attendance'), Att = require('../attendance');
var rooms = require('../fixtures/hhs_rooms.json').rooms;
var LOCS = require('../fixtures/hhs_room_locators.json');   // Stage-1 persisted guid→real M_Locator_ID map
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-ATTENDANCE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ground truth — the REAL seeded C_Attendance columns (seed_hba_erp.js DDL.C_Attendance, dumped from the
// Ninja-staged AD_Column set; == §DESIGN-ATTENDANCE's column spec). Independently held here, not imported.
var REAL_COLS = ['C_Attendance_ID', 'C_Attendance_UU', 'AD_Client_ID', 'AD_Org_ID', 'IsActive', 'Created',
  'CreatedBy', 'Updated', 'UpdatedBy', 'HR_Process_ID', 'C_BPartner_ID', 'M_Locator_ID', 'ServiceDate',
  'CheckInTime', 'CheckOutTime', 'Qty', 'Description'];
function keysSubset(row) { return Object.keys(row).every(function (k) { return REAL_COLS.indexOf(k) >= 0; }); }

var PERIOD = '2026-06';
var PARTNER = { EMP001: 1001, EMP002: 1002 };                  // Stage-1 real C_BPartner ids
var LOCATOR = LOCS.locators;                                    // real M_Locator ids keyed by room guid
var PROCESS = 1;                                                // real seeded HR_Process_ID

var seed = Att.demoSeed(rooms, PERIOD);
var sess = Att.sessions(seed.log, PERIOD);
var out = ADA.compileAttendance(sess, { processId: PROCESS, partnerMap: PARTNER, locatorMap: LOCATOR });

ok('AA0-cols-subset', out.rows.length > 0 && out.rows.every(keysSubset),
   out.rows.length + ' C_Attendance rows use ONLY real seeded column names (no invention outside the AD)');
ok('AA1-fks-resolved', out.rows.every(function (r) { return r.HR_Process_ID === PROCESS && r.C_BPartner_ID != null && r.M_Locator_ID != null; }),
   'every accepted row carries a real HR_Process/C_BPartner/M_Locator FK — never null');
ok('AA1b-fks-are-real', out.rows.every(function (r) {
     return (r.C_BPartner_ID === 1001 || r.C_BPartner_ID === 1002) && LOCS.locators[locGuidOf(r.M_Locator_ID)] === r.M_Locator_ID; }),
   'every FK value matches a Stage-1 seeded id (C_BPartner ∈ {1001,1002}, M_Locator ∈ the persisted map)');
var openRows = out.rows.filter(function (r) { return r.CheckOutTime == null; });
var closedRows = out.rows.filter(function (r) { return r.CheckOutTime != null; });
ok('AA2-honest-open', openRows.length > 0 && openRows.every(function (r) { return r.Qty == null; })
   && closedRows.every(function (r) { return r.Qty != null && r.Qty >= 0; }),
   openRows.length + ' open sessions keep NULL CheckOutTime AND NULL Qty; ' + closedRows.length + ' closed carry real derived hours');

// AA3 — feed a partnerMap MISSING one real person → those sessions must SKIP (never a fabricated FK).
var partial = ADA.compileAttendance(sess, { processId: PROCESS, partnerMap: { EMP001: 1001 }, locatorMap: LOCATOR });
var skippedEmps = partial.skipped.filter(function (s) { return s.employee === 'EMP002'; });
ok('AA3-skip-unresolved', partial.rows.every(function (r) { return r.C_BPartner_ID === 1001; })
   && skippedEmps.length > 0 && skippedEmps.every(function (s) { return /C_BPartner/.test(s.reason); }),
   'EMP002 sessions SKIPPED with reason (no real C_BPartner) — ' + skippedEmps.length + ' skipped, no fabricated FK');
// zone-miss skip
var badLoc = ADA.compileAttendance(sess, { processId: PROCESS, partnerMap: PARTNER, locatorMap: {} });
ok('AA3b-skip-unlocated', badLoc.rows.length === 0 && badLoc.skipped.length === sess.length
   && badLoc.skipped.every(function (s) { return /M_Locator/.test(s.reason); }),
   'no real M_Locator → ALL ' + sess.length + ' sessions skipped (never a fabricated locator FK)');

ok('AA4-sequential-ids', out.rows.map(function (r) { return r.C_Attendance_ID; }).join(',') === out.rows.map(function (r, i) { return i + 1; }).join(','),
   'C_Attendance_ID is a deterministic 1..N sequence over accepted rows (no Date.now/random)');
ok('AA5-watermarked', out._watermark != null, 'compile output carries the alpha watermark (generated output → §DISCLAIMER)');

// helper: reverse the persisted locator map (id → guid) for the AA1b membership check.
function locGuidOf(id) { var m = LOCS.locators; for (var g in m) { if (m[g] === id) return g; } return null; }

var passed = checks.filter(Boolean).length;
console.log('§W-HBA-AD-ATTENDANCE ' + (passed === checks.length ? 'PASS' : 'FAIL') + ' ' + passed + '/' + checks.length);
process.exit(passed === checks.length ? 0 : 1);
