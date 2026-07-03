// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_shard.js — T7 fix 4 + 4b (W-T7-INC): the signed SHARD_SNAPSHOT op as the shard boundary.
// Spec: prompts/T7_INCREMENTAL_SHARD_SPEC.md (strategy call deferred to Claude by the user,
// FABLE5_WRAPUP_2026-07-03 §4b). Period-close pattern (erp_period_close.js §SHOW-CKPT lineage) with
// the T3 lesson BUILT IN: the cold-archive leg is mandatory — nothing is deleted until a verified
// read-back of the archived shard is CONFIRMED.
//
// Model:
//   • A shard = the whole current hot log [genesis-or-prior-snapshot … tip], archived as a JSON ops
//     array under store key '<key>::shard:<seq>' (store = injectable {get,put} — IDB in the browser,
//     in-mem in node witnesses; same seam idiom as teams/erp/erp_sync.js).
//   • The SHARD_SNAPSHOT op (committed via commitGroup — device-signed, content-signed v2) records
//     { shardSeq, baseTipId, baseTipHash (the archived shard's final tip), count, archivedKey,
//       projState (the five projection tables — a RECORDED INPUT erp_kernel.applyOne re-seeds from) }.
//   • After the archive is CONFIRMED: rows before the snapshot are deleted and the hot chain is
//     re-sealed from GENESIS — instant first paint loads [snapshot + open shard] only. The prior
//     chain head lives INSIDE the signed snapshot params; v2 content sigs survive the re-seal by
//     design (T2/#630). With a signer installed, shard() REFUSES unless the snapshot row is v2 —
//     a v1 (position-signed) snapshot would orphan its own sig on re-seal (the T2 bomb).
//   • Shard-boundary verification ≡ full chain: every archived shard's internal links recompute from
//     GENESIS to its tip; shard k's tip must equal the snapshot-k params' baseTipHash recorded in
//     shard k+1's first row (and in the hot snapshot for the newest archive) — a tampered archived
//     op is DETECTED on lazy load without eager replay (witness §T7-SHARD).
//   • DEFAULT OFF: nothing runs unless shard()/maybeShard() is called; below-threshold logs are
//     untouched byte-for-byte (witness §T7-OFF).
(function () {
  'use strict';
  var GENESIS = '0'.repeat(64);   // = kernel_ops.js GENESIS (the zero-hash chain root, NOT the string 'GENESIS')
  var TABLES = ['documents', 'document_lines', 'items', 'containers', 'journal'];   // = ERPKernel.PROJECTION_TABLES

  function _K() {
    if (typeof window !== 'undefined' && window.KernelOps) return window.KernelOps;
    if (typeof global !== 'undefined' && global.window && global.window.KernelOps) return global.window.KernelOps;
    throw new Error('erp_shard: KernelOps not loaded');
  }
  function _subtle() {
    var c = (typeof crypto !== 'undefined') ? crypto : null;
    if (!c || !c.subtle) throw new Error('erp_shard: crypto.subtle unavailable');
    return c.subtle;
  }
  function _sha256(str) {
    return _subtle().digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  var COLS = 'id,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig,gid,op_uuid,user_tag,undone,branch_id';
  // exportOps — the archived-shard shape: FULL rows, id order (superset of exportBranch's needs).
  function exportOps(db) {
    var r = db.exec('SELECT ' + COLS + ' FROM kernel_ops ORDER BY id');
    if (!r.length) return [];
    var names = COLS.split(',');
    return r[0].values.map(function (v) { var o = {}; names.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }

  // verifyShardOps — recompute the archived array's hash links GENESIS→tip with the kernel's own
  // canonical (KernelOps._canonical). Returns { ok, tip, len, why?, at? }. Chain integrity only —
  // signature/authenticity of archived rows stays the roster path's job (erp_key_epochs, #630).
  async function verifyShardOps(ops) {
    var K = _K(), prev = GENESIS;
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.op_hash == null) return { ok: false, why: 'unsealed', at: o.id };
      if (o.prev_hash !== prev) return { ok: false, why: 'prev_hash link', at: o.id };
      var h = await _sha256(prev + '|' + K._canonical(o));
      if (h !== o.op_hash) return { ok: false, why: 'payload altered', at: o.id };
      prev = o.op_hash;
    }
    return { ok: true, tip: prev, len: ops.length };
  }

  function _latestSnapshotPayload(db) {
    var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='SHARD_SNAPSHOT' ORDER BY id DESC LIMIT 1");
    if (!r.length || !r[0].values.length) return null;
    try { var rich = JSON.parse(r[0].values[0][0]); return rich.payload || null; } catch (e) { return null; }
  }
  function _count(db) {
    var r = db.exec('SELECT COUNT(*) FROM kernel_ops');
    return (r.length && r[0].values.length) ? Number(r[0].values[0][0]) : 0;
  }
  function _projState(db) {
    var ps = {};
    TABLES.forEach(function (t) {
      var r = db.exec('SELECT * FROM ' + t + ' ORDER BY id');
      ps[t] = !r.length ? [] : r[0].values.map(function (v) {
        var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o;
      });
    });
    return ps;
  }

  // shard(db, opts) — close the current shard. opts = { store:{get,put}, key, actor?, ts?, gid? }.
  // NEVER destructive on any failure: every abort path leaves the db byte-identical.
  async function shard(db, opts) {
    opts = opts || {};
    var K = _K();
    if (!opts.store || typeof opts.store.get !== 'function' || typeof opts.store.put !== 'function' || !opts.key) {
      throw new Error('erp_shard: opts.store {get,put} and opts.key are required (the T3 archive sink)');
    }
    // 1. never checkpoint unverified history.
    var v = await K.verifyChain(db);
    if (!v.ok) { console.log('§SHARD ABORT verify failed why=' + v.why + ' at=' + v.brokeAt); return { sharded: false, reason: 'verify failed: ' + v.why }; }
    var n = _count(db);
    if (n === 0) return { sharded: false, reason: 'empty log' };
    var prev = _latestSnapshotPayload(db);
    var seq = prev && prev.shardSeq != null ? Number(prev.shardSeq) + 1 : 1;
    var lastIdR = db.exec('SELECT MAX(id) FROM kernel_ops');
    var baseTipId = Number(lastIdR[0].values[0][0]);

    // 2. ARCHIVE FIRST + read back + re-verify — only a CONFIRMED copy unlocks the delete (T3).
    var ops = exportOps(db);
    var blobKey = String(opts.key) + '::shard:' + seq;
    try { await opts.store.put(blobKey, JSON.stringify(ops)); }
    catch (e) { console.log('§SHARD ABORT archive put failed: ' + e.message); return { sharded: false, reason: 'archive put failed: ' + e.message }; }
    var back = null;
    try { back = JSON.parse(await opts.store.get(blobKey)); } catch (e) { back = null; }
    if (!back || back.length !== ops.length) { console.log('§SHARD ABORT archive read-back mismatch'); return { sharded: false, reason: 'archive read-back mismatch' }; }
    var av = await verifyShardOps(back);
    if (!av.ok || av.tip !== v.tip) {
      console.log('§SHARD ABORT archive verify failed why=' + (av.why || 'tip mismatch'));
      return { sharded: false, reason: 'archive verify failed: ' + (av.why || 'tip mismatch') };
    }
    console.log('§SHARD archive CONFIRMED key=' + blobKey + ' ops=' + back.length + ' tip=' + av.tip.slice(0, 12) + '…');

    // 3. the signed snapshot op — projState is the recorded input replay re-seeds from.
    var payload = { op_type: 'SHARD_SNAPSHOT', uuid: 'SNAPSHOT:' + seq, shardSeq: seq,
                    baseTipId: baseTipId, baseTipHash: v.tip, count: n, archivedKey: blobKey,
                    projState: _projState(db) };
    var res = await K.commitGroup(db, [{ op_type: 'SHARD_SNAPSHOT', params: { payload: payload, actor: opts.actor || 'shard' } }],
                                   { gid: opts.gid || ('shard-' + seq + '-' + v.tip.slice(0, 8)), baseTs: opts.ts });
    if (!res || res.committed !== true) return { sharded: false, reason: 'snapshot commit failed: ' + (res && res.reason) };
    var snapId = res.ids[0];

    // 3b. T2 guard: with a signer installed the snapshot MUST be content-signed (v2) — a position-
    // signed (v1) snapshot would orphan its own sig on the re-seal below. Refuse rather than corrupt.
    if (K._isV2) {
      var srow = db.exec('SELECT parameters, sig FROM kernel_ops WHERE id = ' + Number(snapId));
      var sParams = srow[0].values[0][0], sSig = srow[0].values[0][1];
      if (sSig && !K._isV2(sParams)) {
        console.log('§SHARD ABORT snapshot is v1-signed — enable KernelOps.setContentSigning(true) first (T2)');
        db.run('DELETE FROM kernel_ops WHERE id = ' + Number(snapId));   // remove ONLY the op we just added
        await K.sealChain(db);
        return { sharded: false, reason: 'content signing (v2) required with a signer — T2' };
      }
    }

    // 4. drop the archived prefix, re-seal the hot chain from GENESIS (prior head is inside the
    //    signed snapshot params). Invalidate every incremental cache — the log changed shape.
    db.run('DELETE FROM kernel_ops WHERE id < ' + Number(snapId));
    var sealed = await K.sealChain(db);
    db.__krnVerifiedTip = null;
    db.__tipFoldCache = null;
    var v2 = await K.verifyChain(db);
    console.log('§SHARD seq=' + seq + ' archived=' + n + ' hotOps=' + v2.len + ' snapId=' + snapId +
                ' verify=' + (v2.ok ? 'ok' : 'FAIL') + ' tip=' + String(v2.tip).slice(0, 12) + '…');
    return { sharded: true, seq: seq, snapId: snapId, archivedKey: blobKey, archived: n, hotLen: v2.len, tip: v2.tip, ok: v2.ok, sealedTip: sealed.tip };
  }

  // maybeShard — the opt-in trigger: shard only past a threshold (DEFAULT OFF semantics — a small
  // log is returned untouched, witnessed byte-identical §T7-OFF).
  async function maybeShard(db, opts) {
    opts = opts || {};
    var threshold = opts.threshold != null ? opts.threshold : 5000;
    var n = _count(db);
    if (n < threshold) return { sharded: false, reason: 'below-threshold', n: n, threshold: threshold };
    return shard(db, opts);
  }

  // loadShard — lazy history fetch: read + verify ONE archived shard (never blocks first paint;
  // Time-Machine/blame callers pull backward on demand).
  async function loadShard(store, key, seq) {
    var raw = await store.get(String(key) + '::shard:' + seq);
    if (raw == null) return { ok: false, why: 'missing', seq: seq };
    var ops; try { ops = JSON.parse(raw); } catch (e) { return { ok: false, why: 'unparseable', seq: seq }; }
    var v = await verifyShardOps(ops);
    return { ok: v.ok, why: v.why, at: v.at, seq: seq, ops: v.ok ? ops : null, tip: v.tip };
  }

  // verifyShards — walk the archive BACKWARD from the hot snapshot to GENESIS: each shard verifies
  // internally AND its tip equals the NEXT snapshot's recorded baseTipHash (the boundary link).
  async function verifyShards(db, store, key) {
    var snap = _latestSnapshotPayload(db);
    if (!snap) return { ok: true, shards: 0, note: 'no snapshot — nothing archived' };
    var expectTip = snap.baseTipHash, checked = 0;
    for (var seq = Number(snap.shardSeq); seq >= 1; seq--) {
      var s = await loadShard(store, key, seq);
      if (!s.ok) return { ok: false, seq: seq, why: s.why, at: s.at };
      if (s.tip !== expectTip) return { ok: false, seq: seq, why: 'boundary link (tip != recorded baseTipHash)' };
      checked++;
      // the shard's FIRST row is the previous SHARD_SNAPSHOT op (seq-1) — its recorded baseTipHash
      // is the next (older) boundary; shard 1 starts at true GENESIS.
      var firstSnap = null;
      if (seq > 1) {
        try { var rich = JSON.parse(s.ops[0].parameters); firstSnap = rich.payload || null; } catch (e) { firstSnap = null; }
        if (!firstSnap || firstSnap.op_type !== 'SHARD_SNAPSHOT') return { ok: false, seq: seq, why: 'missing prior snapshot at shard head' };
        expectTip = firstSnap.baseTipHash;
      }
    }
    console.log('§SHARD verify-archive ok shards=' + checked + ' back-to=GENESIS');
    return { ok: true, shards: checked };
  }

  var API = { shard: shard, maybeShard: maybeShard, loadShard: loadShard, verifyShards: verifyShards,
              verifyShardOps: verifyShardOps, exportOps: exportOps, _projState: _projState };
  if (typeof window !== 'undefined') window.ErpShard = API;   // window-only, like kernel_ops.js
  console.log('§SHARD_LOADED erp_shard.js (T7 fix 4/4b — signed snapshot boundary, archive-confirmed, lazy-verified)');
})();
