// tests/poc_user_names.js — §-witness for user_names.js (LENS lane-3 `user:0-names`).
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// DO NOT REMOVE — Scope guard
// CLAIM under test: the chat sender `user:0` (build/erp/poc_chat.log §CHAT-THREAD) is folded to a
//   display name from the REAL AD_User table in ad_seed.db — handAuthored=0, fabricated=0. Where a
//   sender id has NO AD_User row (AD_User_ID=0 in this seed) it degrades to an HONEST labelled
//   fallback, never an invented name.
// Each test NAMES the issue it proves. §-log first — READ tests/poc_user_names.log before concluding.
// Run:  node tests/poc_user_names.js 2>&1 | tee tests/poc_user_names.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var VIEWER = path.join(__dirname, '..');

global.window = global.window || {};               // ad_data is a browser IIFE
var ADData = require(path.join(VIEWER, 'ad_data.js'));
var UserNames = require(path.join(VIEWER, 'user_names.js'));

var fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('  FAIL: ' + msg); } else { console.log('  ok: ' + msg); } }

(async function () {
  console.log('=== POC-USER-NAMES — fold AD_User display names into the chat sender (kill user:0) ===\n');

  var SQL = await initSqlJs();
  var buf = fs.readFileSync(path.join(VIEWER, 'ad_seed.db'));
  var db = new SQL.Database(new Uint8Array(buf));

  // ── REAL data: read AD_User from ad_seed.db (read-only DataSource), keyed by AD column name ──
  var adUserRows = ADData.readRecords(db, 'AD_User', null, 'AD_User_ID');
  console.log('  read AD_User rows=' + adUserRows.length + ' (source=ad_seed.db, read-only)\n');

  // ── ISSUE A: the sender map folds from REAL AD_User rows (no hand-authored names) ──
  // Proves: 100->SuperUser / 101->GardenAdmin come from the dictionary, not from code.
  console.log('[ISSUE A] sender display-name map folds from ad_seed.AD_User (definition-as-data)');
  var map = UserNames.buildMap(adUserRows);
  var r0   = UserNames.resolveSender(0,   adUserRows);
  var r100 = UserNames.resolveSender(100, adUserRows);
  var r101 = UserNames.resolveSender(101, adUserRows);
  var mapStr = '0→' + r0.name + ',100→' + (map[100] || '-') + ',101→' + (map[101] || '-');
  console.log('§USERNAME map=[' + mapStr + '] source=ad_seed.AD_User handAuthored=0');
  ok(map[100] === 'SuperUser',   '100 folds to SuperUser from a real AD_User row');
  ok(map[101] === 'GardenAdmin', '101 folds to GardenAdmin from a real AD_User row');
  ok(r100.resolved && r100.source === 'ad_seed.AD_User', 'resolveSender(100) is resolved from the dictionary');

  // ── ISSUE B: user:0 resolves to its REAL AD_User#0 row, or an HONEST labelled fallback ──
  // Proves: the `user:0` placeholder is replaced deterministically; if id 0 has no row we LABEL it,
  //   never fabricate a name. (Verified: ad_seed.db AD_User has NO row for id 0.)
  console.log('\n[ISSUE B] user:0 resolves to a real name OR an honest labelled fallback (never invented)');
  var row0present = !!map.hasOwnProperty(0);
  console.log('§USERNAME-ZERO id=0 name="' + r0.name + '" resolved=' + (r0.resolved ? 'Y' : 'N') +
    ' fabricated=0' + ' (AD_User#0 row present in seed=' + (row0present ? 'Y' : 'N') + ')');
  ok(r0.name && r0.name.length > 0, 'user:0 yields a non-empty sender label (no bare "user:0")');
  // Determinism: whichever branch, the value traces. resolved=Y => name == real row; else honest label.
  if (row0present) {
    ok(r0.resolved && r0.name === map[0], 'id 0 resolved from its REAL AD_User#0 row (non-invent)');
  } else {
    ok(!r0.resolved && r0.name === 'System (AD_User#0)',
      'id 0 absent in seed -> honest "System (AD_User#0)" label, NOT an invented name');
  }
  // Tag form (the chat carries `user:0`): resolveTag must reach the same verdict.
  var rTag0 = UserNames.resolveTag('user:0', adUserRows);
  ok(rTag0.name === r0.name, 'resolveTag("user:0") == resolveSender(0) (chat tag parses by key)');

  // ── ISSUE C: an absent id degrades to an honest "AD_User#<id>" label, not a guess ──
  // Proves: graceful-degrade for any sender id missing from the dictionary.
  console.log('\n[ISSUE C] an absent sender id degrades to an honest label, not a fabricated name');
  var MISSING = 999999;
  ok(!map.hasOwnProperty(MISSING), 'chosen id ' + MISSING + ' is genuinely absent from AD_User');
  var rMiss = UserNames.resolveSender(MISSING, adUserRows);
  console.log('§USERNAME-ABSENT id=' + MISSING + ' fallback="' + rMiss.name + '" invented=0');
  ok(!rMiss.resolved && rMiss.name === 'AD_User#' + MISSING,
    'absent id -> "AD_User#' + MISSING + '" honest label (resolved=N, invented=0)');

  console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS — user:0 folds to a real/honest sender, fabricated=0'
                                             : fails + ' FAIL') + ' ===');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + (e && e.message ? e.message : e)); process.exit(1); });
