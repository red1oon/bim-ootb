// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-LEAVE witness (§2026-07-04 thread C: Leave-as-Resource-unavailability). Each
//   check NAMES the issue it proves. Load-bearing claims: every emitted row's keys are a SUBSET of the real
//   S_ResourceUnAvailable column list (independently re-sourced, not imported from the implementation — can't
//   grade its own homework); the date range is derived from the TAKE op's own ts+days (never Date.now/random,
//   same input twice → same output); an employee with no real S_Resource is honestly SKIPPED, never a
//   fabricated FK; the unpaid-type TAKE still produces a row (this is a resource-availability fact, orthogonal
//   to the paid/unpaid payroll question); readUnavailability's JOIN shape mirrors ad_attendance.readPresence.
//   Run: node hr_bim_asset/tests/witness_ad_leave.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-LEAVE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var Leave = require('../leave');
var AD = require('../ad_leave');

// AD0 — NON-INVENT GATE: every emitted row's keys ⊆ an INDEPENDENTLY-sourced real column list (dumped fresh
// from build/erp/ad_full.db PRAGMA table_info(s_resourceunavailable), NOT imported from ad_leave.js itself).
var REAL_COLS = ['s_resourceunavailable_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
  'updated', 'updatedby', 's_resource_id', 'datefrom', 'dateto', 'description', 's_resourceunavailable_uu'];

var log = Leave.demoLog('EMP001');
var resourceMap = { EMP001: 1001, EMP002: 1002 };
var out = AD.compileLeaveUnavailability(log, resourceMap);

ok('AD0-non-invent-gate', out.rows.length > 0 && out.rows.every(function (r) {
  return Object.keys(r).every(function (k) { return REAL_COLS.indexOf(k) >= 0; });
}), out.rows.length + ' rows, every key ⊆ the real s_resourceunavailable column list (independently sourced)');

// AD1 — row count == TAKE ops (demoLog has 3: 4d annual, 5d annual, 1d unpaid) — including the UNPAID-type
// take (a resource-availability fact is orthogonal to whether the days are paid or unpaid at payroll).
ok('AD1-row-count', out.rows.length === 3 && out.skipped.length === 0,
  '3 TAKE ops (2 annual + 1 unpaid-type) → 3 rows, 0 skipped (EMP001 resolves to a real S_Resource)');

// AD2 — date range = ts (own date) .. ts+(days-1), pure arithmetic on the SUPPLIED ts.
var r0 = out.rows[0];
ok('AD2-date-range', r0.datefrom === '2026-04-10' && r0.dateto === '2026-04-13',
  '4d TAKE at 2026-04-10 → datefrom=2026-04-10, dateto=2026-04-13 (from + (days-1), not Date.now)');

// AD3 — every row carries the resolved S_Resource id (never the raw employee string as an FK).
ok('AD3-resource-fk', out.rows.every(function (r) { return r.s_resource_id === 1001; }),
  'every row s_resource_id=1001 (the resourceMap-resolved real S_Resource, not "EMP001")');

// AD4 — determinism: same log run twice → byte-identical output (no Date.now/random anywhere).
var out2 = AD.compileLeaveUnavailability(log, resourceMap);
ok('AD4-deterministic', JSON.stringify(out.rows) === JSON.stringify(out2.rows),
  'same log → identical rows on a second run (pure function, no wall-clock/random)');

// AD5 — non-invent SKIP: an employee with no resourceMap entry is honestly skipped, never a fabricated FK.
var outSkip = AD.compileLeaveUnavailability(Leave.demoLog('GHOST'), resourceMap);
ok('AD5-honest-skip', outSkip.rows.length === 0 && outSkip.skipped.length === 3
  && outSkip.skipped.every(function (s) { return s.employee === 'GHOST' && /no real S_Resource/.test(s.reason); }),
  'GHOST (no S_Resource) → 0 rows, 3 honestly skipped with a real reason (never a fabricated FK)');

// AD6 — toUnavailableRow refuses a non-TAKE op / missing resource (never builds a partial/guessed row).
ok('AD6-guard', AD.toUnavailableRow({ verb: 'ACCRUE', params: { type: 'annual', days: 2 }, ts: '2026-01-01T00:00:00Z' }, 1001) === null
  && AD.toUnavailableRow(null, 1001) === null && AD.toUnavailableRow({ verb: 'TAKE', params: { type: 'annual', days: 1 }, ts: '2026-01-01T00:00:00Z' }, null) === null,
  'toUnavailableRow returns null for a non-TAKE op, a missing op, or a missing s_resource_id — never a partial row');

// AD7 — watermark carried (a generated output → §DISCLAIMER).
ok('AD7-watermark', out._watermark === 'SAMPLE — NOT OFFICIAL', 'output carries the CONTOH/SAMPLE watermark');

// AD8 — readUnavailability: honest empty with no db handle; shape matches when a stub query is supplied.
var empty = AD.readUnavailability(null);
ok('AD8a-read-no-db', Array.isArray(empty.blackouts) && empty.blackouts.length === 0, 'no erpQuery fn → honest empty blackouts[]');
var stubRows = [{ id: 5, who: 'EMP001', datefrom: '2026-04-10', dateto: '2026-04-13', description: 'Leave (annual) 4d — EMP001' }];
var read = AD.readUnavailability(function () { return stubRows; }, { s_resource_id: 1001 });
ok('AD8b-read-lens', read.blackouts.length === 1 && read.blackouts[0].who === 'EMP001',
  'readUnavailability returns the injected rows verbatim (the panel/seed self-witness data path)');

var fails = checks.filter(function (c) { return !c; }).length;
console.log('§W-HBA-AD-LEAVE ' + (fails === 0 ? 'PASS' : 'FAIL') + ' ' + (checks.length - fails) + '/' + checks.length);
process.exit(fails === 0 ? 0 : 1);
