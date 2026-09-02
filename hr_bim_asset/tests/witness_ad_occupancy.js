// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AD-OCC witness (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model",
//   P-OCC-RETRO). Proves `occupancy.toResourceAssignmentRow()` projects a signed ASSIGN op onto the REAL
//   native `s_resourceassignment` shape — the non-invent gate, same pattern as W-HBA-AD-PAYROLL's AD0.
//   Run: node hr_bim_asset/tests/witness_ad_occupancy.js
'use strict';
var O = require('../occupancy');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AD-OCC ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- ground truth, independently sourced (sqlite3 build/erp/ad_full.db "PRAGMA table_info(s_resourceassignment);") ----
var REAL_COLS = ['s_resourceassignment_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby',
  'updated', 'updatedby', 's_resource_id', 'name', 'description', 'assigndatefrom', 'assigndateto', 'qty',
  'isconfirmed', 's_resourceassignment_uu'];

var assignRes = O.assign({ resource: 'RM_Level_1_1', party: 'BP-TEN-1', from: '2026-01', to: '2026-12', ts: '2026-01-01T00:00:00Z' }, null);
var row = O.toResourceAssignmentRow(assignRes.op, function () { return 100; });

// ---- AD-OCC0: NON-INVENT GATE — every REAL-table-bound key (everything except the documented `_party`
// carry-along, which is never inserted — s_resourceassignment has no party column, see occupancy.js header) ⊆ real cols
var nativeKeys = Object.keys(row).filter(function (k) { return k !== '_party'; });
ok('AD-OCC0-shape', nativeKeys.every(function (k) { return REAL_COLS.indexOf(k) >= 0; }),
  's_resourceassignment row uses ONLY real AD_Column names (the one non-native field, `_party`, is explicitly excluded — no party column exists natively)');
ok('AD-OCC1-values', row.s_resource_id === 'RM_Level_1_1' && row.assigndatefrom === '2026-01' && row.assigndateto === '2026-12' && row.isconfirmed === 'Y',
  'row carries the real assignment dates + resource guid, confirmed');
ok('AD-OCC2-party-not-native', row._party === 'BP-TEN-1' && REAL_COLS.indexOf('_party') === -1,
  'party is carried for the caller to thread onto C_Order/C_Invoice.c_bpartner_id — never bolted onto the assignment row (native gap, not an HBA omission)');
ok('AD-OCC3-null-guard', O.toResourceAssignmentRow(null) === null && O.toResourceAssignmentRow({ verb: 'RELEASE' }) === null,
  'only an ASSIGN op compiles to a row (RELEASE/UNAVAIL are not resource-assignment rows) — honest null, not a fabricated shape');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AD-OCC ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
