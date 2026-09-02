#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PCLOSE-ARCHIVE (prompts/KERNEL_HARDENING_BATCH1_SPEC.md §T3, in bim-compiler).
//   THE ISSUE PROVED/DISPROVED: erp_period_close.closePeriod DELETEs every pre-checkpoint op from the
//   only live copy (erp_period_close.js:92) — the audit's T3 timebomb: first real period close silently
//   destroys the signed pre-close history (lineage/audit/Time-Machine), while balances survive. The doc
//   comment claims "the cold archive is kept by the caller" but no caller archives anything.
//   THE FIX PROVED: the destructive DELETE is GATED behind a CONFIRMED archive sink —
//     §T3-NO-SINK   — close with NO archiveSink → the DELETE does NOT fire; pre-close ops are RETAINED
//                     (compacted:false), balances still correct. (Default = never lose history.)
//     §T3-SINK-FAIL — close with a sink that returns {ok:false} → closePeriod THROWS, ZERO rows deleted.
//     §T3-SINK-OK   — close with a real sink → archive captured, THEN the DELETE fires (compacted:true),
//                     the checkpoint carries the archive_ref, and the archived array RE-FOLDS to the exact
//                     pre-close closing balances (log-vs-image: the cold archive reproduces the state).
//   NON-INVENT: real erp/kernel_ops.js + erp/erp_period_close.js driven in node over sql.js; POST ops are
//   the app's real §13.1 double-entry shape; balances are computed by the module's own foldBalances.
//   §-log first — READ witness_pclose_archive.log before any conclusion.
//   Run (cwd = bim-ootb): node erp/tests/witness_pclose_archive.js 2>&1 | tee erp/tests/witness_pclose_archive.log
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js',
               path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js'));          // → window.KernelOps
var KernelOps = global.window.KernelOps;
var PClose = require(path.join(ERP, 'erp_period_close.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// the app's REAL §13.1 POST shape — a sales invoice (AR/Revenue) + its payment (Cash/AR).
var POSTS = [
  { lines: [ { account_id: '101', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '400', amtacctdr: 0, amtacctcr: 434.13 } ] },
  { lines: [ { account_id: '108', amtacctdr: 434.13, amtacctcr: 0 }, { account_id: '101', amtacctdr: 0, amtacctcr: 434.13 } ] }
];
var EXPECT = { '101': 0, '400': -43413, '108': 43413 };   // net DR−CR cents (AR settles to 0)

function seed(SQL) {
  var db = new SQL.Database();
  KernelOps.ensureTable(db);
  POSTS.forEach(function (p, i) { KernelOps.commitOp(db, 'POST', p, null, null, 'u-post-' + i, 1000 + i); });
  return db;
}
function opCount(db) { var r = db.exec('SELECT COUNT(*) FROM kernel_ops'); return Number(r[0].values[0][0]); }
function balEq(a, b) { return PClose.balEqual(a, b).equal; }

(async function () {
  console.log('\n═══ W-PCLOSE-ARCHIVE — the period-close DELETE is gated behind a confirmed archive (T3) ═══\n');
  var SQL = await reqSql()();

  // ── §T3-NO-SINK — no archiveSink ⇒ compaction is SKIPPED, history retained, balances still right ──
  var db1 = seed(SQL);
  var before1 = opCount(db1);
  var r1 = await PClose.closePeriod(db1, KernelOps, null, { period: 1, ts: 5000 });
  var after1 = opCount(db1);
  verdict(balEq(r1.closing_balances, EXPECT), '§T3-NO-SINK closing balances correct', JSON.stringify(r1.closing_balances));
  verdict(r1.compacted === false, '§T3-NO-SINK compacted=false (DELETE did not fire)', 'compacted=' + r1.compacted);
  verdict(after1 >= before1, '§T3-NO-SINK pre-close ops RETAINED (no silent history loss)', before1 + '→' + after1 + ' rows');

  // ── §T3-SINK-FAIL — sink returns {ok:false} ⇒ closePeriod THROWS, ZERO deletion ──
  var db2 = seed(SQL);
  var before2 = opCount(db2);
  var threw = false, delCalled = false;
  var failSink = function (arr) { return Promise.resolve({ ok: false, reason: 'CAS unreachable' }); };
  try { await PClose.closePeriod(db2, KernelOps, null, { period: 1, ts: 5000, archiveSink: failSink }); }
  catch (e) { threw = true; }
  var after2 = opCount(db2);
  verdict(threw, '§T3-SINK-FAIL closePeriod THREW on unconfirmed archive');
  verdict(after2 >= before2, '§T3-SINK-FAIL ZERO rows deleted (history intact on failed archive)', before2 + '→' + after2 + ' rows');

  // ── §T3-SINK-OK — real sink ⇒ archive captured, THEN delete fires, archive re-folds to closing bals ──
  var db3 = seed(SQL);
  var captured = null;
  var okSink = function (arr) { captured = arr; return Promise.resolve({ ok: true, ref: 'cas:deadbeef' }); };
  var before3 = opCount(db3);
  var r3 = await PClose.closePeriod(db3, KernelOps, null, { period: 1, ts: 5000, archiveSink: okSink });
  var after3 = opCount(db3);
  verdict(r3.compacted === true, '§T3-SINK-OK compacted=true (DELETE fired AFTER confirmed archive)', 'compacted=' + r3.compacted);
  verdict(after3 < before3, '§T3-SINK-OK live log compacted (pre-close ops removed from LIVE)', before3 + '→' + after3 + ' rows');
  verdict(r3.archive_ref === 'cas:deadbeef', '§T3-SINK-OK checkpoint carries the archive_ref', 'ref=' + r3.archive_ref);
  // log-vs-image: the archived (cold) array must re-fold to the SAME closing balances the live fold produced.
  var reFold = captured ? PClose.foldBalances(captured, null).bal : {};
  verdict(captured && captured.length >= before3, '§T3-SINK-OK archive captured the full pre-close log', 'archived=' + (captured ? captured.length : 0) + ' ops');
  verdict(balEq(reFold, EXPECT), '§T3-SINK-OK archive RE-FOLDS to the pre-close closing balances (no state lost)', JSON.stringify(reFold));

  console.log('\n' + (fails ? '🔴 W-PCLOSE-ARCHIVE ' : '🟢 W-PCLOSE-ARCHIVE ') + (fails ? fails + ' FAIL' : 'ALL PASS'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
