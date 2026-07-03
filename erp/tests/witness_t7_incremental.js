#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-T7-INC (FABLE5_WRAPUP_2026-07-03 §Item 4 + 4b; spec prompts/T7_INCREMENTAL_SHARD_SPEC.md;
//   diagnosis KERNEL_TIMEBOMB_AUDIT §T7). A ~5k-op synthetic POS-scale log with a REAL ECDSA P-256 signer,
//   measuring each fix — "a real, measured drop, not just 'should be faster'":
//     §T7-SEAL   — sealFrom seals ONLY the unsealed tail; tip identical to full sealChain; measured ms.
//     §T7-VERIFY — verifyChainIncremental == full verdict+tip; measured ms drop at 5k ops; a tamper AFTER
//                  the cached tip is caught incrementally; a tamper BEHIND it is (BY DESIGN) invisible to
//                  the hot path and caught by the next FULL verify — both directions witnessed honestly.
//     §T7-TIP    — TipFold readTip/tipValues verdicts EQUAL the unmemoized reference fold on every
//                  (table,id); measured per-paint-sweep drop; undo invalidation stays correct.
//     §T7-SNAP   — fold-from-snapshot projectionHash == fold-from-genesis; a failing archive store means
//                  NO delete (db byte-identical); post-shard hot log = snapshot + open ops only.
//     §T7-SHARD  — a tampered ARCHIVED shard is DETECTED on lazy verify; clean shards chain back to
//                  GENESIS across TWO shard generations (boundary link = recorded baseTipHash).
//     §T7-OFF    — below-threshold maybeShard is a no-op, export bytes byte-identical (default-off).
//   W-T7-HOST extension (prompts/T7_HOST_WIRING_SPEC.md — FABLE5_FOLLOWUP_2026-07-04 §Item 1, the
//   POS-host wiring; extends this witness, does not replace it):
//     §T7-HOST-OFF — below threshold THROUGH KanbanHost.maybeShard: no-op, bytes byte-identical.
//     §T7-HOST     — past ~5k ops the host glue shards for real; measured boot-verify + blob-size drop
//                    (the instant-first-paint proxy).
//     §T7-COUNT    — nextIds/PK continuity across the boundary (the collision bomb the wiring would
//                    have armed: hot COUNT collapses post-shard; opCounts keeps PKs monotonic), and
//                    cumulative across TWO generations.
//     §T7-LAZY     — hot-only folds VISIBLY lose pre-shard facts (the named issue), then
//                    [archived ⊕ hot] restores them EXACTLY: kitchen queue keeps the pre-shard DR
//                    ticket, logMovements/pendingInbound equal their pre-shard folds; archive cached.
//     §T7-LAZY-NEG — tampered archived shard ⇒ {ok:false,'payload altered'}; missing blob ⇒
//                    {ok:false,'missing'} — honest refusal, never a silently-thin history.
//     §T7-RACE     — a commitGroup landing MID-SHARD (during the archive put's await) is NEVER lost:
//                    the shard is PINNED to id ≤ baseTipId, the survivor rides the hot log across the
//                    boundary (not archived, not deleted), the walkers scan past it for the prior
//                    snapshot, and opCounts stays exact (the survivor is counted by the NEXT shard).
//                    ISSUE: pre-fix, `DELETE id < snapId` deleted un-archived interleaved ops — a
//                    silently lost signed sale.
//   Run: node erp/tests/witness_t7_incremental.js 2>&1 | tee build/t7_incremental.log — then READ the log.
'use strict';
var path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
function reqSql() {
  var tries = ['sql.js', '/home/red1/bim-ootb/node_modules/sql.js', path.join(__dirname, '..', '..', 'node_modules', 'sql.js')];
  for (var i = 0; i < tries.length; i++) { try { return require(tries[i]); } catch (e) {} }
  throw new Error('sql.js not resolvable');
}
var ERP = path.join(__dirname, '..');
require(path.join(ERP, 'kernel_ops.js'));
require(path.join(ERP, 'tip_fold.js'));
require(path.join(ERP, 'erp_shard.js'));
require(path.join(ERP, 'erp_signer.js'));
var K = global.window.KernelOps, TipFold = global.window.TipFold, Shard = global.window.ErpShard, Signer = global.window.ErpSigner;
var EK = require(path.join(ERP, 'erp_kernel.js'));
require(path.join(ERP, 'kanban_host.js'));                     // W-T7-HOST: the host glue under test
var KH = global.window.KanbanHost;
var PL = require(path.join(ERP, 'pos_lens.js'))._t7;           // the shard-aware pure folds (node seam)
var KC = require(path.join(ERP, 'kitchen_core.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function ms(t0) { return (Date.now() - t0); }

var N_GROUPS = 490, OPS_PER_GROUP = 10;                       // ≈4.9k ops + snapshots ≈ the audit's 5k cliff
var STATUSES = ['DR', 'IP', 'CO', 'CL'];

function statusOp(i) {                                        // crud-shaped SET_STATUS (readTip/TipFold food)
  return { op_type: 'SET_STATUS', op_uuid: 'u-s' + i, params: { table: 'C_Order', id: (i % 400), to: STATUSES[i % 4] } };
}
function updateOp(i) {                                        // crud-shaped CRUD_UPDATE (tipValues food)
  return { op_type: 'CRUD_UPDATE', op_uuid: 'u-u' + i, params: { table: 'C_Order', id: (i % 400), changes: { GrandTotal: { new: i }, Description: { new: 'row' + i } } } };
}
async function commitBatch(db, g) {                           // one POS "sale": 10 mixed ops
  var base = g * OPS_PER_GROUP;
  // the SEAM path (production shape): payload ops APPLY to the projection AND log via erp_kernel,
  // then the debounced persist seals them incrementally — sealFrom IS the fix-1 production path.
  EK.apply(db, [
    { op_type: 'CREATE_DOCUMENT', uuid: 'DOC:C_Order@from' + (base + 7), table: 'C_Order', source_id: base + 7, doc_status: 'DR' },
    { op_type: 'SET_STATUS', uuid: 'DOC:C_Order@from' + (base + 7), table: 'C_Order', id: base + 7, doc_status: 'CO' }
  ], { actor: 'pos', baseTs: 1000000 + base });
  await K.sealFrom(db);
  var ops = [];                                               // the POS group path (commitGroup, crud-shaped)
  for (var j = 0; j < 4; j++) ops.push(statusOp(base + j));
  for (j = 4; j < 7; j++) ops.push(updateOp(base + j));
  ops.push(statusOp(base + 9));
  var res = await K.commitGroup(db, ops, { gid: 'g-' + g, baseTs: 1000000 + g });
  if (!res.committed) throw new Error('commitBatch g=' + g + ' not committed: ' + res.reason);
  return res;
}
// the UNMEMOIZED reference fold — byte-copy of crud_overlay's legacy readTip/tipValues scans.
function refReadTip(db, table, id) {
  var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='SET_STATUS' AND undone=0 AND branch_id IS NULL ORDER BY id DESC");
  if (!r.length || !r[0].values.length) return null;
  var rows = r[0].values;
  for (var i = 0; i < rows.length; i++) {
    var p; try { p = JSON.parse(rows[i][0]); } catch (e) { continue; }
    if (p && p.table === table && String(p.id) === String(id)) return p.to || null;
  }
  return null;
}
function refTipValues(db, table, id) {
  var out = {};
  var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='CRUD_UPDATE' AND undone=0 AND branch_id IS NULL ORDER BY id ASC");
  if (!r.length || !r[0].values.length) return out;
  var rows = r[0].values;
  for (var i = 0; i < rows.length; i++) {
    var p; try { p = JSON.parse(rows[i][0]); } catch (e) { continue; }
    if (!p || p.table !== table || String(p.id) !== String(id)) continue;
    var ch = p.changes || {};
    for (var c in ch) { if (ch.hasOwnProperty(c)) out[c] = (ch[c] && ch[c].hasOwnProperty('new')) ? ch[c].new : ch[c]; }
  }
  return out;
}
function memStore() {
  var m = {};
  return { get: function (k) { return Promise.resolve(k in m ? m[k] : null); },
           put: function (k, b) { m[k] = b; return Promise.resolve(); }, _m: m };
}

(async function () {
  console.log('\n═══ W-T7-INC — incremental seal/verify/tip-folds + signed shard boundary, MEASURED at ~5k ops ═══\n');
  var SQL = await reqSql()();
  var db = new SQL.Database(); EK.initProjection(db);
  var kp = await Signer.mintKeypair();
  K.setSigner(Signer.makeSigner(kp));
  K.setContentSigning(true);                                   // production posture since T2/#630

  var t0 = Date.now();
  for (var g = 0; g < N_GROUPS; g++) await commitBatch(db, g);
  var total = db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  console.log('   built synthetic POS log: ' + total + ' signed ops in ' + N_GROUPS + ' groups (' + ms(t0) + 'ms)\n');

  // ── §T7-SEAL — the persist path: sealFrom (incremental) vs sealChain (what _idbPersist used to do) ──
  // erp_kernel.apply writes UNSEALED rows (the rule-edit path) — exactly what the debounced persist seals.
  EK.apply(db, [{ op_type: 'CREATE_DOCUMENT', uuid: 'DOC:RULE@1', table: 'AD_Rule', source_id: 9001, doc_status: 'DR' }],
           { actor: 'device:pos1', baseTs: 2000000 });
  var tSealFrom = Date.now();
  var sf = await K.sealFrom(db);
  tSealFrom = ms(tSealFrom);
  var tSealFull = Date.now();
  var sc = await K.sealChain(db);
  tSealFull = ms(tSealFull);
  verdict(sf.sealed === 1, '§T7-SEAL sealFrom sealed ONLY the unsealed tail', 'sealed=' + sf.sealed + ' (full re-seal would be ' + sc.sealed + ')');
  verdict(sf.tip === sc.tip, '§T7-SEAL incremental tip == full-re-seal tip', sf.tip.slice(0, 12) + '…');
  verdict(tSealFrom < tSealFull, '§T7-SEAL measured drop', 'sealFrom=' + tSealFrom + 'ms vs sealChain=' + tSealFull + 'ms (' + (total + 1) + ' ops)');

  // ── §T7-VERIFY — tip-cached incremental verify vs the full per-op-ECDSA verify per action ──
  var tFull1 = Date.now();
  var vFull = await K.verifyChain(db);                        // warms the cache (the boot verify)
  tFull1 = ms(tFull1);
  await commitBatch(db, N_GROUPS);                             // one more "sale"
  var tInc = Date.now();
  var vInc = await K.verifyChainIncremental(db);
  tInc = ms(tInc);
  var tFull2 = Date.now();
  var vFull2 = await K.verifyChain(db);
  tFull2 = ms(tFull2);
  verdict(vFull.ok && vInc.ok && vFull2.ok && vInc.tip === vFull2.tip && vInc.len === vFull2.len,
    '§T7-VERIFY incremental == full (verdict, tip, len)', 'tip=' + String(vInc.tip).slice(0, 12) + '… len=' + vInc.len);
  verdict(vInc.checked === OPS_PER_GROUP, '§T7-VERIFY only the NEW ops were re-verified', 'checked=' + vInc.checked + ' skipped=' + (vInc.len - vInc.checked));
  verdict(tInc < tFull2, '§T7-VERIFY measured drop per action', 'incremental=' + tInc + 'ms vs full=' + tFull2 + 'ms (boot full=' + tFull1 + 'ms)');

  // tamper AFTER the cached tip (cache is at the pre-tamper tip after vInc) → commit a group, corrupt one
  // of its rows, the incremental hot path must catch it.
  await commitBatch(db, N_GROUPS + 1);
  var lastId = db.exec('SELECT MAX(id) FROM kernel_ops')[0].values[0][0];
  var orig = db.exec('SELECT parameters FROM kernel_ops WHERE id=' + lastId)[0].values[0][0];
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [orig + 'X', lastId]);
  var vT = await K.verifyChainIncremental(db);
  verdict(vT.ok === false && vT.why === 'group torn', '§T7-VERIFY tamper AFTER cached tip caught incrementally', 'why=' + vT.why + ' failAt=' + vT.failAt);
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [orig, lastId]);
  var vHeal = await K.verifyChain(db);                         // restore + full re-verify re-warms the cache
  verdict(vHeal.ok === true, '§T7-VERIFY restored log verifies full again', 'len=' + vHeal.len);

  // tamper BEHIND the cached tip — the DOCUMENTED trust window: invisible to the hot path, caught by the
  // next FULL verify (boot/import/snapshot). Both directions asserted, honestly.
  var earlyId = db.exec('SELECT MIN(id) FROM kernel_ops')[0].values[0][0];
  var origEarly = db.exec('SELECT parameters FROM kernel_ops WHERE id=' + earlyId)[0].values[0][0];
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origEarly + 'X', earlyId]);
  var vBehindInc = await K.verifyChainIncremental(db);
  var vBehindFull = await K.verifyChain(db);
  verdict(vBehindInc.ok === true && vBehindInc.incremental === true,
    '§T7-VERIFY tamper BEHIND tip: hot path trusts its verified prefix (BY DESIGN — see spec semantics)', 'incremental ok=' + vBehindInc.ok);
  verdict(vBehindFull.ok === false, '§T7-VERIFY …and the next FULL verify catches it', 'why=' + vBehindFull.why + ' at=' + vBehindFull.brokeAt);
  db.run('UPDATE kernel_ops SET parameters=? WHERE id=?', [origEarly, earlyId]);
  var vHeal2 = await K.verifyChain(db);
  verdict(vHeal2.ok === true, '§T7-VERIFY log restored clean', 'len=' + vHeal2.len);

  // ── §T7-TIP — memoized tip-folds == the unmemoized reference on EVERY (table,id), measured ──
  var mismatch = 0;
  for (var id = 0; id < 400; id++) {
    if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch++;
    if (JSON.stringify(TipFold.tipValues(db, 'C_Order', id, null)) !== JSON.stringify(refTipValues(db, 'C_Order', id))) mismatch++;
  }
  verdict(mismatch === 0, '§T7-TIP memoized == reference fold on 400 ids × {readTip, tipValues}', 'mismatches=' + mismatch);
  var tRef = Date.now(); for (id = 0; id < 400; id++) refReadTip(db, 'C_Order', id); tRef = ms(tRef);
  var tMemo = Date.now(); for (id = 0; id < 400; id++) TipFold.readTip(db, 'C_Order', id, null); tMemo = ms(tMemo);
  verdict(tMemo < tRef, '§T7-TIP measured per-paint-sweep drop (400-row grid)', 'memoized=' + tMemo + 'ms vs full-scan=' + tRef + 'ms');
  await commitBatch(db, N_GROUPS + 2);                         // append → incremental fold path
  var mismatch2 = 0;
  for (id = 0; id < 400; id++) if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch2++;
  verdict(mismatch2 === 0, '§T7-TIP append-only incremental fold stays equal', 'mismatches=' + mismatch2);
  var undoneId = db.exec("SELECT MAX(id) FROM kernel_ops WHERE op_type='SET_STATUS'")[0].values[0][0];
  db.run('UPDATE kernel_ops SET undone=1 WHERE id=' + undoneId);   // an undo — stamp undoneN changes → rebuild
  var mismatch3 = 0;
  for (id = 0; id < 400; id++) if (TipFold.readTip(db, 'C_Order', id, null) !== refReadTip(db, 'C_Order', id)) mismatch3++;
  verdict(mismatch3 === 0, '§T7-TIP undo invalidates + rebuilds correctly', 'mismatches=' + mismatch3);
  db.run('UPDATE kernel_ops SET undone=0 WHERE id=' + undoneId);
  await K.sealChain(db); var vClean = await K.verifyChain(db);   // undone isn't hashed, but re-assert clean
  verdict(vClean.ok, '§T7-TIP log still verifies after undo/redo round-trip', 'len=' + vClean.len);

  // ── §T7-SNAP — the signed snapshot: fold-from-snapshot == fold-from-genesis; archive gate ──
  var genesisHash = EK.replay(db, new SQL.Database()).hash;
  var preShardLen = db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  // (gate first) a FAILING archive store must change NOTHING:
  var preBytes = db.export();
  var badStore = { get: function () { return Promise.resolve(null); }, put: function () { return Promise.reject(new Error('disk full')); } };
  var rBad = await Shard.shard(db, { store: badStore, key: 'poslog', ts: 3000000 });
  var postBytes = db.export();
  verdict(rBad.sharded === false && /archive put failed/.test(rBad.reason), '§T7-SNAP failing archive sink ⇒ ABORT', rBad.reason);
  verdict(preBytes.length === postBytes.length && Buffer.from(preBytes).equals(Buffer.from(postBytes)),
    '§T7-SNAP aborted shard leaves the db BYTE-IDENTICAL', preBytes.length + ' bytes');
  var store = memStore();
  var tVerifyPre = Date.now(); await K.verifyChain(db); tVerifyPre = ms(tVerifyPre);
  var r1 = await Shard.shard(db, { store: store, key: 'poslog', ts: 3000001 });
  verdict(r1.sharded === true && r1.ok === true, '§T7-SNAP shard #1 committed + hot chain re-verifies', 'seq=' + r1.seq + ' archived=' + r1.archived + ' hotOps=' + r1.hotLen);
  verdict(r1.hotLen === 1, '§T7-SNAP hot log = the snapshot only (instant first paint load)', 'hotLen=' + r1.hotLen);
  var snapHash = EK.replay(db, new SQL.Database()).hash;
  verdict(snapHash === genesisHash, '§T7-SNAP projectionHash(fold-from-snapshot) == projectionHash(fold-from-genesis)', snapHash);
  var tVerifyPost = Date.now(); await K.verifyChain(db); tVerifyPost = ms(tVerifyPost);
  verdict(tVerifyPost < tVerifyPre, '§T7-SNAP measured boot-verify drop after shard', 'post=' + tVerifyPost + 'ms vs pre=' + tVerifyPre + 'ms (' + preShardLen + '→' + r1.hotLen + ' ops)');

  // ── §T7-SHARD — two generations + lazy tamper detection ──
  for (g = 0; g < 5; g++) await commitBatch(db, 600 + g);      // the next open shard
  var postShardReplay = EK.replay(db, new SQL.Database()).hash;
  var r2 = await Shard.shard(db, { store: store, key: 'poslog', ts: 3000002 });
  verdict(r2.sharded === true && r2.seq === 2, '§T7-SHARD shard #2 closes the next generation', 'seq=' + r2.seq + ' archived=' + r2.archived);
  var replay2 = EK.replay(db, new SQL.Database()).hash;
  verdict(replay2 === postShardReplay, '§T7-SHARD projection preserved across generation 2', replay2);
  var walk = await Shard.verifyShards(db, store, 'poslog');
  verdict(walk.ok === true && walk.shards === 2, '§T7-SHARD lazy backward walk verifies 2 shards to GENESIS', JSON.stringify(walk));
  var blob = JSON.parse(store._m['poslog::shard:1']);
  var origP = blob[100].parameters; blob[100].parameters = origP + 'X';
  store._m['poslog::shard:1'] = JSON.stringify(blob);
  var walkT = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkT.ok === false && walkT.seq === 1 && walkT.why === 'payload altered',
    '§T7-SHARD tampered ARCHIVED op DETECTED on lazy verify (never eagerly loaded)', 'seq=' + walkT.seq + ' why=' + walkT.why + ' at=' + walkT.at);
  blob[100].parameters = origP; store._m['poslog::shard:1'] = JSON.stringify(blob);
  var walkR = await Shard.verifyShards(db, store, 'poslog');
  verdict(walkR.ok === true, '§T7-SHARD restored archive verifies again', 'shards=' + walkR.shards);

  // ── §T7-OFF — default-off: a small log is untouched byte-for-byte ──
  var db2 = new SQL.Database(); EK.initProjection(db2);
  for (g = 0; g < 3; g++) await commitBatch(db2, g);
  var b1 = db2.export();
  var rOff = await Shard.maybeShard(db2, { store: memStore(), key: 'small', threshold: 5000 });
  var b2 = db2.export();
  verdict(rOff.sharded === false && rOff.reason === 'below-threshold', '§T7-OFF below-threshold maybeShard is a no-op', 'n=' + rOff.n + ' threshold=' + rOff.threshold);
  verdict(b1.length === b2.length && Buffer.from(b1).equals(Buffer.from(b2)), '§T7-OFF export bytes BYTE-IDENTICAL', b1.length + ' bytes');

  // ════ W-T7-HOST — the POS-host wiring end-to-end (prompts/T7_HOST_WIRING_SPEC.md) ════
  console.log('\n═══ W-T7-HOST — KanbanHost.maybeShard/archivedOps + shard-aware POS folds ═══\n');
  function hotRows(d) {
    var r = d.exec('SELECT id, timestamp, op_type, parameters FROM kernel_ops ORDER BY id');
    return (r[0] ? r[0].values : []).map(function (v) { return { id: v[0], timestamp: v[1], op_type: v[2], parameters: v[3] }; });
  }
  var b3mock = { prepare: function () { return { all: function () { return []; }, get: function () { return null; } }; } };
  function grp(ops) { return ops.map(function (o) { return { op_type: o.op_type, op_uuid: o.op_uuid, params: o }; }); } // the POS commit shape, verbatim

  // §T7-HOST-OFF — the host glue below threshold: byte-identical no-op (default off THROUGH the glue).
  var dbS = new SQL.Database(); EK.initProjection(dbS);
  for (g = 0; g < 3; g++) await commitBatch(dbS, g);
  var hb1 = dbS.export();
  var rHostOff = await KH.maybeShard(dbS, 'hostlog-small', { store: memStore(), persist: false });
  var hb2 = dbS.export();
  verdict(rHostOff.sharded === false && rHostOff.reason === 'below-threshold',
    '§T7-HOST-OFF below-threshold host maybeShard is a no-op', 'n=' + rHostOff.n + ' threshold=' + rHostOff.threshold + ' (host default)');
  verdict(rHostOff.threshold === 5000, '§T7-HOST-OFF host default threshold is the tested 5000', 'threshold=' + rHostOff.threshold);
  verdict(hb1.length === hb2.length && Buffer.from(hb1).equals(Buffer.from(hb2)), '§T7-HOST-OFF export bytes BYTE-IDENTICAL', hb1.length + ' bytes');

  // build the host-scale db: TWO pre-shard facts a thin fold would LOSE, then ~5k ops of noise.
  var dbH = new SQL.Database(); EK.initProjection(dbH);
  var createdDocs = 0;                                          // ground truth for §T7-COUNT opCounts
  // fact A — a deliver-later kitchen ticket: order + C- shipment born DR, NEVER completed (still owed).
  var rA = await K.commitGroup(dbH, grp([
    { op_type: 'CREATE_DOCUMENT', op_uuid: 'u-dl-o', table: 'C_Order', c_order_id: 910001, c_bpartner_id: 118, c_pos_id: 100, c_doctype_id: 135 },
    { op_type: 'CREATE_DOCUMENT', op_uuid: 'u-dl-io', table: 'M_InOut', m_inout_id: 910002, source_id: 910001, c_doctype_id: 120, m_warehouse_id: 50, movementtype: 'C-' },
    { op_type: 'CREATE_LINE', op_uuid: 'u-dl-iol', table: 'M_InOutLine', source_line_id: 1, m_product_id: 124, movementqty: 2 }
  ]), { gid: 'g-deliverlater', baseTs: 900000 });
  if (!rA.committed) throw new Error('fact A not committed: ' + rA.reason);
  createdDocs += 2;
  // fact B — an OPEN replenish PO (issotrx N): its qty must keep counting as on-order (no double order).
  var rB = await K.commitGroup(dbH, grp([
    { op_type: 'CREATE_DOCUMENT', op_uuid: 'u-po-o', table: 'C_Order', issotrx: 'N', m_warehouse_id: 50, c_order_id: 910011 },
    { op_type: 'CREATE_LINE', op_uuid: 'u-po-l', table: 'C_OrderLine', qtyordered: 7, m_product_id: 124 }
  ]), { gid: 'g-openpo', baseTs: 900001 });
  if (!rB.committed) throw new Error('fact B not committed: ' + rB.reason);
  createdDocs += 1;
  var tH = Date.now();
  for (g = 0; g < 505; g++) { await commitBatch(dbH, 1000 + g); createdDocs += 1; } // each batch EK-applies 1 CREATE_DOCUMENT
  var nH = dbH.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  console.log('   built host-scale log: ' + nH + ' signed ops (' + ms(tH) + 'ms), pre-shard facts: 1 DR ticket + 1 open PO\n');

  // the pre-shard truths (what the folds MUST still say after the boundary):
  var idsPre = PL.nextIds(dbH);
  var mvPre = JSON.stringify(PL.logMovements(dbH));
  var pendPre = JSON.stringify(PL.pendingInbound(dbH, b3mock, 50));
  var kqPre = KC.queue(KC.foldTickets(hotRows(dbH))).map(function (t) { return t.m_inout_id; });
  verdict(kqPre.indexOf(910002) >= 0, '§T7-HOST pre-shard: the DR ticket is queued', 'queue=' + JSON.stringify(kqPre));
  verdict(JSON.parse(pendPre)['124'] === 700, '§T7-HOST pre-shard: open PO counts 7.00 on-order for product 124', 'pend=' + pendPre);

  // §T7-HOST — shard through the host glue; measured first-paint proxies (blob size + cold boot verify).
  var bytesPre = dbH.export().length;
  dbH.__krnVerifiedTip = null;
  var tBootPre = Date.now(); await K.verifyChain(dbH); tBootPre = ms(tBootPre);
  var storeH = memStore();
  var rHost = await KH.maybeShard(dbH, 'hostlog', { store: storeH, persist: false });
  verdict(rHost.sharded === true && rHost.ok === true, '§T7-HOST past-threshold host maybeShard SHARDS', 'seq=' + rHost.seq + ' archived=' + rHost.archived + ' hotOps=' + rHost.hotLen);
  var bytesPost = dbH.export().length;
  dbH.__krnVerifiedTip = null;
  var tBootPost = Date.now(); await K.verifyChain(dbH); tBootPost = ms(tBootPost);
  verdict(bytesPost < bytesPre, '§T7-HOST persisted-blob size drop (first-paint payload)', bytesPre + '→' + bytesPost + ' bytes');
  verdict(tBootPost < tBootPre, '§T7-HOST measured cold boot-verify drop', tBootPre + 'ms→' + tBootPost + 'ms (' + nH + '→' + rHost.hotLen + ' ops)');

  // §T7-COUNT — PK continuity: the very next ids are IDENTICAL pre vs post shard (no collision window).
  var idsPost = PL.nextIds(dbH);
  verdict(idsPost.orderId === idsPre.orderId && idsPost.inoutId === idsPre.inoutId,
    '§T7-COUNT nextIds continuity across the boundary', 'pre=' + idsPre.orderId + ' post=' + idsPost.orderId);
  // generation 2: more sales, shard again (forced low threshold), continuity + CUMULATIVE opCounts hold.
  var idsG2a = PL.nextIds(dbH);
  await K.commitGroup(dbH, grp([{ op_type: 'CREATE_DOCUMENT', op_uuid: 'u-g2-o', table: 'C_Order', c_order_id: idsG2a.orderId }]), { gid: 'g-gen2', baseTs: 910000 });
  createdDocs += 1;
  var rHost2 = await KH.maybeShard(dbH, 'hostlog', { store: storeH, persist: false, threshold: 2 });
  verdict(rHost2.sharded === true && rHost2.seq === 2, '§T7-COUNT generation-2 shard closes', 'seq=' + rHost2.seq);
  var snap2 = JSON.parse(dbH.exec("SELECT parameters FROM kernel_ops WHERE op_type='SHARD_SNAPSHOT' ORDER BY id DESC LIMIT 1")[0].values[0][0]).payload;
  verdict(Number(snap2.opCounts.CREATE_DOCUMENT) === createdDocs,
    '§T7-COUNT opCounts CUMULATIVE across two generations', 'recorded=' + snap2.opCounts.CREATE_DOCUMENT + ' truth=' + createdDocs);
  var idsG2b = PL.nextIds(dbH);
  verdict(idsG2b.orderId === idsG2a.orderId + 10, '§T7-COUNT PK band stays monotonic after gen-2 shard', idsG2a.orderId + '→' + idsG2b.orderId);

  // §T7-LAZY — first SHOW the loss (the named issue: hot-only folds go thin), then the lazy cure.
  var kqThin = KC.queue(KC.foldTickets(hotRows(dbH))).map(function (t) { return t.m_inout_id; });
  verdict(kqThin.indexOf(910002) < 0, '§T7-LAZY (issue named) hot-only kitchen fold LOSES the pre-shard DR ticket', 'thinQueue=' + JSON.stringify(kqThin));
  verdict(JSON.stringify(PL.pendingInbound(dbH, b3mock, 50)) !== pendPre, '§T7-LAZY (issue named) hot-only pending fold LOSES the open PO', 'hot-only=' + JSON.stringify(PL.pendingInbound(dbH, b3mock, 50)));
  var arch = await KH.archivedOps(dbH, 'hostlog', { store: storeH });
  verdict(arch.ok === true && arch.shards === 2 && arch.ops.length > 0, '§T7-LAZY archivedOps walks 2 shards back to GENESIS', 'ops=' + arch.ops.length + ' shards=' + arch.shards);
  var kqLazy = KC.queue(KC.foldTickets(arch.ops.concat(hotRows(dbH)))).map(function (t) { return t.m_inout_id; });
  verdict(kqLazy.indexOf(910002) >= 0 && JSON.stringify(kqLazy) === JSON.stringify(kqPre),
    '§T7-LAZY kitchen queue [archived ⊕ hot] == pre-shard queue (ticket still owed)', 'queue=' + JSON.stringify(kqLazy));
  verdict(JSON.stringify(PL.logMovements(dbH, arch.ops)) === mvPre, '§T7-LAZY logMovements [archived ⊕ hot] == pre-shard fold', 'events=' + JSON.parse(mvPre).length);
  verdict(JSON.stringify(PL.pendingInbound(dbH, b3mock, 50, arch.ops)) === pendPre, '§T7-LAZY pendingInbound [archived ⊕ hot] == pre-shard fold (no double order)', 'pend=' + pendPre);
  var arch2 = await KH.archivedOps(dbH, 'hostlog', { store: storeH });
  verdict(arch2.cached === true && arch2.ops.length === arch.ops.length, '§T7-LAZY second fetch serves the per-generation cache', 'cached=' + arch2.cached);

  // §T7-LAZY-NEG — tamper + missing: refuse honestly, never fabricate a thin history as complete.
  var hBlob = JSON.parse(storeH._m['hostlog::shard:1']);
  var hOrig = hBlob[10].parameters; hBlob[10].parameters = hOrig + 'X';
  storeH._m['hostlog::shard:1'] = JSON.stringify(hBlob);
  dbH.__shardArchive = null;                                    // drop the cache — force a live walk
  var archT = await KH.archivedOps(dbH, 'hostlog', { store: storeH });
  verdict(archT.ok === false && archT.why === 'payload altered', '§T7-LAZY-NEG tampered archived shard REFUSED', 'seq=' + archT.seq + ' why=' + archT.why + ' at=' + archT.at);
  hBlob[10].parameters = hOrig; storeH._m['hostlog::shard:1'] = JSON.stringify(hBlob);
  var savedShard = storeH._m['hostlog::shard:2']; delete storeH._m['hostlog::shard:2'];
  dbH.__shardArchive = null;
  var archM = await KH.archivedOps(dbH, 'hostlog', { store: storeH });
  verdict(archM.ok === false && archM.why === 'missing', '§T7-LAZY-NEG missing shard blob REFUSED', 'seq=' + archM.seq + ' why=' + archM.why);
  storeH._m['hostlog::shard:2'] = savedShard;
  dbH.__shardArchive = null;
  var archR = await KH.archivedOps(dbH, 'hostlog', { store: storeH });
  verdict(archR.ok === true && archR.shards === 2, '§T7-LAZY-NEG restored archive verifies again', 'ops=' + archR.ops.length);

  // ── §T7-RACE — a commit landing MID-SHARD must never be lost (the pinned-prefix delete) ──
  var dbR = new SQL.Database(); EK.initProjection(dbR);
  for (g = 0; g < 8; g++) await commitBatch(dbR, 2000 + g);
  var storeR = memStore();
  var raceCommitted = false;
  var rigStore = { _m: storeR._m, get: storeR.get, put: async function (k, v) {
    await storeR.put(k, v);
    if (!raceCommitted) {                                       // fire ONCE, inside the widest mid-shard await
      raceCommitted = true;
      var rr = await K.commitGroup(dbR, grp([{ op_type: 'CREATE_DOCUMENT', op_uuid: 'u-race', table: 'C_Order', c_order_id: 970001 }]), { gid: 'g-race', baseTs: 950000 });
      if (!rr.committed) throw new Error('race commit failed: ' + rr.reason);
    }
  } };
  var preRaceTotal = Number(dbR.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0]);
  var rRace = await Shard.shard(dbR, { store: rigStore, key: 'racelog', ts: 3100000 });
  verdict(rRace.sharded === true && rRace.ok === true, '§T7-RACE shard completes despite a mid-shard commit', 'archived=' + rRace.archived + ' hotOps=' + rRace.hotLen);
  var survivorHot = Number(dbR.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_uuid='u-race'")[0].values[0][0]);
  verdict(survivorHot === 1, '§T7-RACE the interleaved op SURVIVES in the hot log (was silently deleted pre-fix)', 'rows=' + survivorHot);
  var raceBlob = JSON.parse(storeR._m['racelog::shard:1']);
  verdict(!raceBlob.some(function (o) { return o.op_uuid === 'u-race'; }) && raceBlob.length === preRaceTotal,
    '§T7-RACE the archive is PINNED to the pre-commit prefix (survivor not archived)', 'archived=' + raceBlob.length + ' pinned=' + preRaceTotal);
  var raceArch = await Shard.loadArchivedOps(dbR, storeR, 'racelog');
  var allRace = raceArch.ops.concat(Shard.exportOps(dbR));
  var raceSeen = allRace.filter(function (o) { return o.op_uuid === 'u-race'; }).length;
  verdict(raceArch.ok === true && raceSeen === 1 && allRace.length === preRaceTotal + 2,
    '§T7-RACE [archived ⊕ hot] = every committed op exactly ONCE', 'total=' + allRace.length + ' (=' + preRaceTotal + ' archived + snapshot + survivor)');
  // generation 2: the survivor now sits AHEAD of snapshot-1 inside shard 2 — the walkers must scan past it.
  var replayPre2 = EK.replay(dbR, new SQL.Database()).hash;
  var rRace2 = await Shard.shard(dbR, { store: storeR, key: 'racelog', ts: 3100001 });
  verdict(rRace2.sharded === true && rRace2.seq === 2, '§T7-RACE generation-2 shard closes over the survivor', 'archived=' + rRace2.archived);
  var raceWalk = await Shard.verifyShards(dbR, storeR, 'racelog');
  verdict(raceWalk.ok === true && raceWalk.shards === 2, '§T7-RACE verifyShards scans past the survivor to the prior snapshot', JSON.stringify(raceWalk));
  dbR.__shardArchive = null;
  var raceArch2 = await Shard.loadArchivedOps(dbR, storeR, 'racelog');
  verdict(raceArch2.ok === true && raceArch2.ops.filter(function (o) { return o.op_uuid === 'u-race'; }).length === 1,
    '§T7-RACE lazy walk still yields the survivor exactly once across 2 generations', 'archivedOps=' + raceArch2.ops.length);
  var snapR2 = JSON.parse(dbR.exec("SELECT parameters FROM kernel_ops WHERE op_type='SHARD_SNAPSHOT' ORDER BY id DESC LIMIT 1")[0].values[0][0]).payload;
  verdict(Number(snapR2.opCounts.CREATE_DOCUMENT) === 8 + 1,
    '§T7-RACE opCounts exact: survivor counted by the shard that ARCHIVES it (no drift/double-count)', 'recorded=' + snapR2.opCounts.CREATE_DOCUMENT + ' truth=9');
  var replayPost2 = EK.replay(dbR, new SQL.Database()).hash;
  verdict(replayPost2 === replayPre2, '§T7-RACE projection preserved across the raced generations', replayPost2);

  K.setSigner(null); K.setContentSigning(false);
  console.log('\n' + (fails === 0 ? '✅ W-T7-INC + W-T7-HOST ALL PASS' : '❌ W-T7-INC/HOST ' + fails + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.log('🔴 W-T7-INC CRASH: ' + (e && e.stack || e)); process.exit(1); });
