// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-ATTENDANCE witness (bim-compiler RESUME_HBA_ERP_STAGE3.md §PREREQUISITE,
//   watchdog 2026-07-03). Proves ad_attendance.js compiles attendance.js's OWN witnessed sessions onto the
//   **REAL NATIVE** S_ResourceAssignment shape — the retarget OFF the invented C_Attendance (which is NOT a
//   real iDempiere table: AD_Table LIKE '%ttendance%' → 0 rows in ad_full.db). Each check NAMES its issue:
//     • AA0 — every emitted row's keys ⊆ the REAL s_resourceassignment column list (independently sourced from
//       `PRAGMA table_info(s_resourceassignment)` — the SAME ground truth witness_ad_occupancy.js holds) AND
//       carries NONE of the retired C_Attendance-era keys (C_BPartner_ID/M_Locator_ID/CheckInTime…) — the
//       RED-before/GREEN-after proof the invention is out of the compile path.
//     • AA1 — every row's s_resource_id is a real resolved id from the injected resourceMap, never null.
//     • AA2 — HONEST-OPEN: an open session keeps assigndateto AND qty NULL + isconfirmed='N' (no fabricated
//       finish/hours/approval); a closed one carries the real derived hours + isconfirmed='Y'.
//     • AA3 — NON-INVENT SKIP: a session whose employee resolves to no real S_Resource is SKIPPED with a
//       reason, never given a fabricated FK.
//     • AA4 — deterministic sequential s_resourceassignment_id over accepted rows.
//     • AA6 — ROOM GRANULARITY (the accepted design call): the zone is NOT a row column — it rides the
//       `spatial` view-trace keyed by the row PK (the BIM op-log fact beside the AD rows, ad_bom geometry idiom).
//     • AA7 — the old C_Attendance compile surface is GONE from the module (no partnerMap/locatorMap API, no
//       C_Attendance string anywhere in the source).
//   Run: node hr_bim_asset/tests/witness_ad_attendance.js   — exit 0 = green. Read the log after run.
'use strict';
var fs = require('fs'), path = require('path');
var ADA = require('../ad_attendance'), Att = require('../attendance');
var rooms = require('../fixtures/hhs_rooms.json').rooms;
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-ATTENDANCE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ground truth — the REAL s_resourceassignment columns (sqlite3 build/erp/ad_full.db
// "PRAGMA table_info(s_resourceassignment);" — independently held, == witness_ad_occupancy.js's list).
var REAL_COLS = ['s_resourceassignment_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
  'updated', 'updatedby', 's_resource_id', 'name', 'description', 'assigndatefrom', 'assigndateto', 'qty',
  'isconfirmed', 's_resourceassignment_uu'];
// the RETIRED C_Attendance-era keys — none may appear on a row (the invention stays dead).
var RETIRED_KEYS = ['C_Attendance_ID', 'HR_Process_ID', 'C_BPartner_ID', 'M_Locator_ID', 'ServiceDate', 'CheckInTime', 'CheckOutTime'];
function keysNative(row) {
  return Object.keys(row).every(function (k) { return REAL_COLS.indexOf(k) >= 0; })
    && RETIRED_KEYS.every(function (k) { return !(k in row); });
}

var PERIOD = '2026-06';
// real seeded S_Resource ids (scripts/seed_hba_erp.js §6b — Value=code, proto-cloned from Mary 100).
var RESOURCES = { EMP001: 990109, EMP002: 990110 };

var seed = Att.demoSeed(rooms, PERIOD);
var sess = Att.sessions(seed.log, PERIOD);
var out = ADA.compileAttendance(sess, { resourceMap: RESOURCES });

ok('AA0-native-cols-only', out.rows.length > 0 && out.rows.every(keysNative),
   out.rows.length + ' rows use ONLY real s_resourceassignment column names AND carry ZERO retired C_Attendance keys (invention gone from the compile path)');
ok('AA1-fk-resolved', out.rows.every(function (r) { return r.s_resource_id === 990109 || r.s_resource_id === 990110; }),
   'every accepted row carries a real seeded S_Resource id (990109/990110) — never null, never fabricated');
var openRows = out.rows.filter(function (r) { return r.assigndateto == null; });
var closedRows = out.rows.filter(function (r) { return r.assigndateto != null; });
ok('AA2-honest-open', openRows.length > 0 && openRows.every(function (r) { return r.qty == null && r.isconfirmed === 'N'; })
   && closedRows.every(function (r) { return r.qty != null && r.qty >= 0 && r.isconfirmed === 'Y'; }),
   openRows.length + ' open sessions keep NULL assigndateto AND NULL qty AND isconfirmed=N; ' + closedRows.length
   + ' closed carry real derived hours + isconfirmed=Y (maker-checker honest, never a fabricated approval)');

// AA3 — feed a resourceMap MISSING one real person → those sessions must SKIP (never a fabricated FK).
var partial = ADA.compileAttendance(sess, { resourceMap: { EMP001: 990109 } });
var skippedEmps = partial.skipped.filter(function (s) { return s.employee === 'EMP002'; });
ok('AA3-skip-unresolved', partial.rows.every(function (r) { return r.s_resource_id === 990109; })
   && skippedEmps.length > 0 && skippedEmps.every(function (s) { return /S_Resource/.test(s.reason); }),
   'EMP002 sessions SKIPPED with reason (no real S_Resource) — ' + skippedEmps.length + ' skipped, no fabricated FK');
var none = ADA.compileAttendance(sess, { resourceMap: {} });
ok('AA3b-skip-all', none.rows.length === 0 && none.skipped.length === sess.length,
   'empty resourceMap → ALL ' + sess.length + ' sessions skipped (never a fabricated resource FK)');

ok('AA4-sequential-ids', out.rows.map(function (r) { return r.s_resourceassignment_id; }).join(',') === out.rows.map(function (r, i) { return i + 1; }).join(','),
   's_resourceassignment_id is a deterministic 1..N sequence over accepted rows (no Date.now/random)');
ok('AA5-watermarked', out._watermark != null, 'compile output carries the alpha watermark (generated output → §DISCLAIMER)');

// AA6 — the zone rides the spatial view-trace (keyed by the row PK), NEVER a row column.
ok('AA6-zone-is-bim-fact', out.spatial.length === out.rows.length
   && out.spatial.every(function (sp, i) { return sp.s_resourceassignment_id === out.rows[i].s_resourceassignment_id && sp.zone != null && sp.employee != null; })
   && out.rows.every(function (r) { return !('zone' in r) && !('m_locator_id' in r); }),
   'zone carried BESIDE the rows in spatial[] (keyed by PK, ' + out.spatial.length + ' entries) — no zone/m_locator column on the native row (room-granularity call honoured)');

// AA7 — the old C_Attendance compile surface is gone from the module itself.
var src = fs.readFileSync(path.join(__dirname, '..', 'ad_attendance.js'), 'utf8');
ok('AA7-old-path-gone', typeof ADA.partnerMapFromUsers === 'undefined' && typeof ADA.locatorMapFromLocators === 'undefined'
   && typeof ADA.toAttendanceRow === 'undefined' && !/C_Attendance\b.*=|toAttendanceRow\s*=/.test(src),
   'ad_attendance.js no longer exports the C_Attendance builders (partnerMap/locatorMap/toAttendanceRow gone) — the invented path is dead code nowhere');

var passed = checks.filter(Boolean).length;
console.log('§W-HBA-AD-ATTENDANCE ' + (passed === checks.length ? 'PASS' : 'FAIL') + ' ' + passed + '/' + checks.length);
process.exit(passed === checks.length ? 0 : 1);
