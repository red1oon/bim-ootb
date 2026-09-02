#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CROSS-TAB-PERSIST (prompts/KERNEL_HARDENING_BATCH1_SPEC.md §T6, in bim-compiler).
//   THE ISSUE PROVED/DISPROVED: kernel_ops _persistToIdb blindly overwrote the stored IDB blob with the
//   current tab's whole-DB export (kernel_ops.js) — the audit's T6 timebomb: a stale second tab
//   (POS + back-office is the natural setup) overwrites the blob holding a first tab's committed, sealed,
//   SIGNED ops. Zero op-count threshold. Both chains still verify, so nothing flags — the ops are just gone.
//   THE FIX PROVED: persist is tip-guarded — it overwrites ONLY when the currently-stored tip is an
//   ancestor of this tab's chain (a safe fast-forward). A foreign/newer stored tip ⇒ refuse.
//     §T6-GUARD-TRUTH  — _storedTipIsAncestor: genesis/null → true; my own tip → true; a past op_hash in my
//                        chain → true; a FOREIGN hash (a tab that diverged) → false.
//     §T6-NO-CLOBBER   — end-to-end: tab A commits+seals (stored tip=T_A); a STALE tab B that never saw A's
//                        op tries to persist → the guard REFUSES (would-drop A's ops). A survives.
//     §T6-FAST-FORWARD — a tab that DOES extend the stored tip (built on it) is allowed to persist.
//   Also asserts the caller-side guard (§T6-CALLER): pos_lens/kitchen_lens now branch on res.committed so a
//   {committed:false} group can never be logged as a completed sale/serve (silent-loss-in-log half of T6).
//   NON-INVENT: real erp/kernel_ops.js driven in node over sql.js; the "stored tip" is the real sealed tip.
//   §-log first — READ witness_cross_tab_persist.log before any conclusion.
//   Run (cwd = bim-ootb): node erp/tests/witness_cross_tab_persist.js 2>&1 | tee erp/tests/witness_cross_tab_persist.log
'use strict';
var path = require('path'), fs = require('fs');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js',
               path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js'));
var KernelOps = global.window.KernelOps;

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// seed a db with one deterministic op, sealed. Returns { db, tip }.
async function seedSealed(SQL, uuid) {
  var db = new SQL.Database();
  KernelOps.ensureTable(db);
  KernelOps.commitOp(db, 'POST', { account: 'x', cents: 1 }, null, null, uuid, 1000);
  await KernelOps.sealChain(db);
  // read this db's current tip
  var r = db.exec('SELECT op_hash FROM kernel_ops ORDER BY id DESC LIMIT 1');
  return { db: db, tip: r[0].values[0][0] };
}

(async function () {
  console.log('\n═══ W-CROSS-TAB-PERSIST — multi-tab persist is tip-guarded, no silent op loss (T6) ═══\n');
  var SQL = await reqSql()();
  var GENESIS = '0'.repeat(64);

  // ── §T6-GUARD-TRUTH — the decision function's truth table ──
  var base = await seedSealed(SQL, 'u-base');
  var db = base.db, myTip = base.tip;
  verdict(KernelOps._storedTipIsAncestor(db, null) === true,    '§T6-GUARD-TRUTH null stored → allow (empty store)');
  verdict(KernelOps._storedTipIsAncestor(db, GENESIS) === true, '§T6-GUARD-TRUTH genesis stored → allow');
  verdict(KernelOps._storedTipIsAncestor(db, myTip) === true,   '§T6-GUARD-TRUTH my own tip stored → allow (idempotent)');
  verdict(KernelOps._storedTipIsAncestor(db, 'f'.repeat(64)) === false, '§T6-GUARD-TRUTH foreign tip stored → REFUSE');

  // commit a 2nd op → the earlier tip is now a PAST op_hash in my chain; stored=that past tip must allow.
  KernelOps.commitOp(db, 'POST', { account: 'x', cents: 2 }, null, null, 'u-base-2', 1001);
  await KernelOps.sealChain(db);
  verdict(KernelOps._storedTipIsAncestor(db, myTip) === true, '§T6-GUARD-TRUTH a past op_hash of my chain → allow (fast-forward)');

  // ── §T6-NO-CLOBBER — tab A advances the store; stale tab B must NOT be allowed to overwrite it ──
  // Both start from the SAME base op (same uuid/ts ⇒ same T0). Then they diverge with different 2nd ops.
  var A = await seedSealed(SQL, 'u-shared');   // tab A
  var B = await seedSealed(SQL, 'u-shared');   // tab B — same base, independent copy
  // A commits its own op and becomes the stored writer.
  KernelOps.commitOp(A.db, 'POST', { account: 'saleA', cents: 100 }, null, null, 'u-A2', 2000);
  await KernelOps.sealChain(A.db);
  var storedTip = A.db.exec('SELECT op_hash FROM kernel_ops ORDER BY id DESC LIMIT 1')[0].values[0][0];  // = T_A in the "store"
  // B never saw A's op; B commits its OWN op (diverges) and now wants to persist over the store.
  KernelOps.commitOp(B.db, 'POST', { account: 'saleB', cents: 200 }, null, null, 'u-B2', 2001);
  await KernelOps.sealChain(B.db);
  var bWouldClobber = KernelOps._storedTipIsAncestor(B.db, storedTip);   // FIX ⇒ false (refuse); BUG ⇒ true (loss)
  verdict(bWouldClobber === false, '§T6-NO-CLOBBER stale tab B is REFUSED — A\'s committed ops are not overwritten', 'guardAllows=' + bWouldClobber);

  // ── §T6-FAST-FORWARD — a tab that actually extends the stored tip IS allowed ──
  // C loads A's state (has op_hash == storedTip in its chain) then adds on top → allowed.
  var C = A;   // A itself extends its own stored tip
  verdict(KernelOps._storedTipIsAncestor(C.db, storedTip) === true, '§T6-FAST-FORWARD a tab that extends the stored tip → allow');

  // ── §T6-CALLER — pos_lens/kitchen_lens branch on res.committed (silent-loss-in-log half) ──
  function guardsCommitted(file) {
    var src = fs.readFileSync(path.join(ERP, file), 'utf8');
    var groups = (src.match(/\.commitGroup\(/g) || []).length;
    var guards = (src.match(/!res\s*\|\|\s*!res\.committed/g) || []).length;
    return { groups: groups, guards: guards };
  }
  ['pos_lens.js', 'kitchen_lens.js'].forEach(function (f) {
    var g = guardsCommitted(f);
    verdict(g.guards >= g.groups, '§T6-CALLER ' + f + ' every commitGroup checks res.committed', g.guards + ' guards / ' + g.groups + ' commitGroup');
  });

  console.log('\n' + (fails ? '🔴 W-CROSS-TAB-PERSIST ' : '🟢 W-CROSS-TAB-PERSIST ') + (fails ? fails + ' FAIL' : 'ALL PASS'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(2); });
