// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ATTEND witness (§T&A SLICE-1 — signed spatial check-in). Each check NAMES the
//   issue it proves. Load-bearing claims: presence is SIGNED + tamper-evident (W-SIGN), SPATIAL (gated to a
//   REAL building zone — un-located → honest REFUSE), folds DETERMINISTICALLY into a timesheet + headcount,
//   never fabricates a finish or a duration. Joins the extracted room fixture for real zone guids.
//   Run: node hr_bim_asset/tests/witness_attendance.js
'use strict';
var fs = require('fs'), path = require('path');
var At = require('../attendance'), C = require('../connectors'), B = require('../binding');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-ATT ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var ZONE = FX.rooms[0].guid, ZONE2 = FX.rooms[1].guid, FAKE = 'GUID-NOT-IN-BUILDING';

// chain helper: append a punch onto the running log (prev = last op_hash).
function add(log, fn, emp, zone, ts) {
  var prev = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  var r = fn({ employee: emp, zone: zone, ts: ts }, FX, prev);
  if (r.op) log.push(r.op);
  return r;
}

// ---- A1: check-in to a REAL zone → a signed op; the chain verifies. -------------------------------------
var log = [];
var r1 = add(log, At.checkIn, 'EMP001', ZONE, '2026-06-30T08:00:00Z');
ok('A1-signed-checkin', r1.op && r1.op.sig && r1.op.op_hash && r1.op.params.zone === ZONE && C.verifyChain(log).ok,
  'check-in to real zone "' + ZONE + '" → signed presence op, verifyChain OK');

// ---- A2: check-in to a non-existent zone → honest REFUSE (no op). ---------------------------------------
var r2 = At.checkIn({ employee: 'EMP001', zone: FAKE, ts: '2026-06-30T08:05:00Z' }, FX, log[log.length - 1].op_hash);
ok('A2-refuse-unlocated', r2.refused === 'unlocated-zone' && !r2.op && B.resolveGuid(FAKE, FX) === false,
  'check-in to an un-located zone → REFUSE (no faked presence)');

// ---- A4 (build the day): check-out 9h later → one closed session of 9.0h. -------------------------------
add(log, At.checkOut, 'EMP001', ZONE, '2026-06-30T17:00:00Z');
var ts1 = At.timesheet(log, '2026-06');
var e1 = ts1.employees[0];
ok('A4-timesheet-hours', e1.employee === 'EMP001' && e1.hours === 9 && e1.open === 0 && e1.byZone[ZONE] === 9 && ts1.chainOk,
  'timesheet folds in→out → 9.0h for EMP001 in zone (from real ts, chain OK)');

// ---- A3: tamper a signed presence param → verifyChain breaks. -------------------------------------------
var tampered = JSON.parse(JSON.stringify(log));
tampered[0].params.zone = ZONE2;                      // move the punch to another zone after signing
var v = C.verifyChain(tampered);
ok('A3-tamper-evident', v.ok === false && v.at === 0 && v.why === 'op_hash',
  'amending a signed presence param breaks verifyChain (tamper-evident)');

// ---- A5: a check-in with no check-out → an OPEN session (no fabricated finish). -------------------------
var log2 = [];
add(log2, At.checkIn, 'EMP002', ZONE, '2026-06-30T09:00:00Z');
var ss = At.sessions(log2, '2026-06');
ok('A5-open-session', ss.length === 1 && ss[0].open === true && ss[0].out === null && ss[0].hours === null,
  'check-in with no check-out → OPEN session (out=null, hours=null — never a fabricated finish)');

// ---- A6: headcount per REAL zone (spatial moat). EMP001 (closed) + EMP002 (open) both in ZONE → 2. ------
var log3 = log.concat(log2);                          // EMP001 closed in ZONE + EMP002 open in ZONE
var pres = At.presenceByZone(log3, '2026-06');
var zrow = pres.filter(function (p) { return p.zone === ZONE; })[0];
ok('A6-presence-by-zone', zrow && zrow.headcount === 2 && FX.rooms.some(function (rm) { return rm.guid === zrow.zone; }),
  'presenceByZone → headcount ' + (zrow ? zrow.headcount : '?') + ' in real zone "' + ZONE + '" (feeds the density overlay)');

// ---- A7: deterministic — same ops → identical timesheet fingerprint (replay == live). ------------------
ok('A7-deterministic', At.fingerprint(At.timesheet(log, '2026-06')) === At.fingerprint(At.timesheet(log, '2026-06')),
  'two folds of the same log → identical timesheet fingerprint (deterministic)');

// ---- A8: the timesheet output carries the disclaimer watermark. -----------------------------------------
ok('A8-watermark', ts1._watermark === 'SAMPLE — NOT OFFICIAL' && At.timesheet(log, '2026-06', 'ms')._watermark === 'CONTOH — TIDAK RASMI',
  'timesheet carries the CONTOH/SAMPLE watermark (locale-aware)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-ATT ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
