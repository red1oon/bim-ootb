// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-FIND-GUID witness (RESUME_HR_BIM_ASSET.md §2026-07-04c, close the Zoom Across loop).
//   Covers viewer/hba_lens.js's `_consumeFindGuid(A)` — the boot-time consumer of A.FIND_GUID (viewer/config.js,
//   set from ?find=<guid|employee-code>, the erp/idempiere.html reverse Zoom-Across's finer scope). THREE paths,
//   none fabricate a position: (1) a rendered guid flies directly; (2) a bare employee code with an OPEN
//   attendance session resolves via that session's zone; (3) neither resolves → honest no-op, logged not dropped.
// Run: node hr_bim_asset/tests/witness_find_guid.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-FIND-GUID ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HrConnectors = require('../connectors');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
var Attendance = self.HbaAttendance = require('../attendance');
self.HbaOccupancy = require('../occupancy');
self.HbaAdTenancy = require('../ad_tenancy');
var HBALens = require('../../viewer/hba_lens');

var ROOMS = ['RM-A', 'RM-B', 'RM-C', 'RM-D'].map(function (g) { return { guid: g }; });
var PERIOD = '2026-06';
var seed = Attendance.demoSeed(ROOMS, PERIOD);   // g[0]=RM-A has EMP001 OPEN (per demoSeed's own "now" picture)

function freshA(findGuid) {
  var guidMap = {}; ROOMS.forEach(function (r, i) { guidMap[String(9000 + i)] = r.guid; });
  var A = {
    guidMap: guidMap, streaming: false, FIND_GUID: findGuid || null, _hbaPeriod: PERIOD, _hbaAttendanceLog: seed.log,
    collectMeshes: function (pred) { return ROOMS.map(function (r, i) { return { userData: { guid: r.guid }, position: { x: i * 3, y: 0, z: 0 } }; }).filter(pred || function () { return true; }); }
  };
  A._hbaRoomMembers = {}; ROOMS.forEach(function (r) { A._hbaRoomMembers[r.guid] = [r.guid]; });
  return A;
}
function captureLog(fn) {
  var lines = []; var orig = console.log;
  console.log = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  try { fn(); } finally { console.log = orig; }
  return lines;
}

// 1. direct guid — a real rendered room guid flies straight through flyToZone
var A1 = freshA('RM-C');
var log1 = captureLog(function () { HBALens._consumeFindGuid(A1); });
ok('DIRECT-FLEW', log1.some(function (l) { return /§HBA_FIND_GUID flew directly guid=RM-C/.test(l); }),
  'a rendered guid (RM-C) flies directly, no attendance lookup needed — log: ' + JSON.stringify(log1));

// 2. employee code with an OPEN session — resolves via that session's zone (RM-A, per demoSeed's "now" picture)
var A2 = freshA('EMP001');
var log2 = captureLog(function () { HBALens._consumeFindGuid(A2); });
ok('CODE-RESOLVES-VIA-ATTENDANCE', log2.some(function (l) { return /§HBA_FIND_GUID employee=EMP001 → open session zone=RM-A flew=true/.test(l); }),
  'EMP001 is not a rendered guid — resolves via its OPEN attendance session (zone=RM-A) and flies there — log: ' + JSON.stringify(log2));

// 3. unresolvable code — neither a rendered guid nor an employee with an open session → honest no-op, logged
var A3 = freshA('NOT-A-REAL-ANYTHING');
var log3 = captureLog(function () { HBALens._consumeFindGuid(A3); });
ok('HONEST-NO-OP', log3.some(function (l) { return /§HBA_FIND_GUID no-op code=NOT-A-REAL-ANYTHING/.test(l); }),
  'an unresolvable code is logged as a no-op, never a fabricated fly — log: ' + JSON.stringify(log3));

// 4. absent A.FIND_GUID — no-op, zero log lines (the common case: most viewer loads carry no ?find= at all)
var A4 = freshA(null);
var log4 = captureLog(function () { HBALens._consumeFindGuid(A4); });
ok('ABSENT-FIND-GUID-SILENT', log4.length === 0, 'no A.FIND_GUID → zero log noise on every normal (non-deep-linked) boot');

// 5. a CLOSED session's employee (EMP002 at g[2]/g[3] earlier in the log, no longer open at those zones) with
//    no currently-open session anywhere → honest no-op (never resolves to a stale/closed zone)
var A5 = freshA('GHOST-EMP');
var log5 = captureLog(function () { HBALens._consumeFindGuid(A5); });
ok('NO-STALE-ZONE', log5.some(function (l) { return /no-op code=GHOST-EMP/.test(l); }), 'a code with no open session anywhere never resolves to a stale/closed zone');

console.log('\nW-HBA-FIND-GUID ' + checks.filter(Boolean).length + '/' + checks.length);
process.exit(checks.every(Boolean) ? 0 : 1);
