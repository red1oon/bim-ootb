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
  // maxId (optional) bounds the export to the rows shard() has PINNED as this shard's contents — an op
  // committed concurrently (id > maxId) must neither ride the archive nor be deleted (§T7-RACE).
  function exportOps(db, maxId) {
    var r = db.exec('SELECT ' + COLS + ' FROM kernel_ops' + (maxId != null ? ' WHERE id <= ' + Number(maxId) : '') + ' ORDER BY id');
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

  // _firstSnapshotPayload — the first SHARD_SNAPSHOT row in an archived ops array (the prior
  // boundary). Scanned by op_type, not position — a §T7-RACE survivor can sit ahead of it.
  function _firstSnapshotPayload(ops) {
    for (var i = 0; i < ops.length; i++) {
      if (ops[i].op_type !== 'SHARD_SNAPSHOT') continue;
      try { var rich = JSON.parse(ops[i].parameters); return rich.payload || null; } catch (e) { return null; }
    }
    return null;
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
    // §T7-RACE: everything below runs across awaits (crypto, the store) — a POS commitGroup CAN land
    // mid-shard. The shard's contents are PINNED to id ≤ baseTipId: an op that arrives later is neither
    // archived NOR deleted (step 4 deletes id ≤ baseTipId only) — it simply rides the hot log across
    // the boundary. An op landing between verifyChain and the MAX(id) read makes av.tip ≠ v.tip below
    // ⇒ safe ABORT (retry on the next debounce). No interleaving can lose a committed op.
    var ops = exportOps(db, baseTipId);
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
    // T7-HOST (prompts/T7_HOST_WIRING_SPEC.md §Build 1): opCounts = CUMULATIVE per-op_type counts of
    // every op up to this boundary — a recorded INPUT for counter-style walkers (pos_lens.nextIds)
    // that must stay collision-free on the SYNC sale path where a lazy archive fetch is impossible.
    // Derived from the ARCHIVED array itself (prev snapshot's counts + exactly the ops this shard
    // archives) — never from a live re-count, so a mid-shard commit can't drift/double-count it
    // (§T7-RACE: a survivor is counted by the NEXT shard, the one that archives it).
    var opCounts = {}; if (prev && prev.opCounts) Object.keys(prev.opCounts).forEach(function (t) { opCounts[t] = Number(prev.opCounts[t]); });
    ops.forEach(function (o) { opCounts[o.op_type] = (opCounts[o.op_type] || 0) + 1; });
    var payload = { op_type: 'SHARD_SNAPSHOT', uuid: 'SNAPSHOT:' + seq, shardSeq: seq,
                    baseTipId: baseTipId, baseTipHash: v.tip, count: ops.length, archivedKey: blobKey,
                    opCounts: opCounts, projState: _projState(db) };
    var res = await K.commitGroup(db, [{ op_type: 'SHARD_SNAPSHOT', params: { payload: payload, actor: opts.actor || 'shard' } }],
                                   { gid: opts.gid || ('shard-' + seq + '-' + v.tip.slice(0, 8)), baseTs: opts.ts });
    if (!res || res.committed !== true) return { sharded: false, reason: 'snapshot commit failed: ' + (res && res.reason) };
    var snapId = res.ids[0];

    // 3b. T2 guard: with a signer installed, EVERY row that survives into the re-sealed hot chain
    // (the snapshot AND any §T7-RACE mid-shard survivor, id > baseTipId) must be content-signed (v2)
    // — a position-signed (v1) row would orphan its own sig on the re-seal below. Refuse rather
    // than corrupt.
    if (K._isV2) {
      var srows = db.exec('SELECT id, parameters, sig FROM kernel_ops WHERE id > ' + Number(baseTipId));
      var v1row = null;
      if (srows.length) srows[0].values.forEach(function (r) { if (!v1row && r[2] && !K._isV2(r[1])) v1row = r[0]; });
      if (v1row != null) {
        console.log('§SHARD ABORT v1-signed row id=' + v1row + ' would not survive the re-seal — enable KernelOps.setContentSigning(true) first (T2)');
        db.run('DELETE FROM kernel_ops WHERE id = ' + Number(snapId));   // remove ONLY the op we just added
        await K.sealChain(db);
        return { sharded: false, reason: 'content signing (v2) required with a signer — T2' };
      }
    }

    // 4. drop the ARCHIVED prefix ONLY (id ≤ baseTipId — a §T7-RACE survivor keeps its row), re-seal
    //    the hot chain from GENESIS (prior head is inside the signed snapshot params). Invalidate
    //    every incremental cache — the log changed shape.
    db.run('DELETE FROM kernel_ops WHERE id <= ' + Number(baseTipId));
    db.run('VACUUM');   // reclaim the deleted prefix's pages — without this the exported/persisted hot
                        // blob KEEPS the freelist and first paint gains nothing (W-T7-HOST §T7-HOST).
    var sealed = await K.sealChain(db);
    db.__krnVerifiedTip = null;
    db.__tipFoldCache = null;
    var v2 = await K.verifyChain(db);
    console.log('§SHARD seq=' + seq + ' archived=' + ops.length + ' hotOps=' + v2.len + ' snapId=' + snapId +
                ' verify=' + (v2.ok ? 'ok' : 'FAIL') + ' tip=' + String(v2.tip).slice(0, 12) + '…');
    return { sharded: true, seq: seq, snapId: snapId, archivedKey: blobKey, archived: ops.length, hotLen: v2.len, tip: v2.tip, ok: v2.ok, sealedTip: sealed.tip };
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
      // the shard CONTAINS the previous SHARD_SNAPSHOT op (seq-1) — usually its first row, but a
      // §T7-RACE survivor (committed mid-shard, id > that boundary's baseTipId) can precede it, so
      // scan for it. Its recorded baseTipHash is the next (older) boundary; shard 1 starts at GENESIS.
      if (seq > 1) {
        var headSnap = _firstSnapshotPayload(s.ops);
        if (!headSnap) return { ok: false, seq: seq, why: 'missing prior snapshot at shard head' };
        expectTip = headSnap.baseTipHash;
      }
    }
    console.log('§SHARD verify-archive ok shards=' + checked + ' back-to=GENESIS');
    return { ok: true, shards: checked };
  }

  // loadArchivedOps — the lazy Time-Machine/fold seam (T7_HOST_WIRING_SPEC §Build 1): walk the archive
  // BACKWARD from the hot snapshot (each shard verified internally by loadShard; boundary link = the
  // recorded baseTipHash, the same rule verifyShards enforces), return the WHOLE archived prefix in
  // ASCENDING op order. Cached on db.__shardArchive = {atSeq, ops} — fetched ONCE per shard generation
  // (a newer snapshot bumps shardSeq → refetch). Tamper/missing ⇒ {ok:false, why, seq} — an HONEST
  // refusal; callers fold hot-only and say so, never a silently-thin history.
  async function loadArchivedOps(db, store, key) {
    var snap = _latestSnapshotPayload(db);
    if (!snap) return { ok: true, ops: [], shards: 0, note: 'no snapshot — nothing archived' };
    var atSeq = Number(snap.shardSeq);
    if (db.__shardArchive && db.__shardArchive.atSeq === atSeq) {
      return { ok: true, ops: db.__shardArchive.ops, shards: atSeq, cached: true };
    }
    var expectTip = snap.baseTipHash, ops = [];
    for (var seq = atSeq; seq >= 1; seq--) {
      var s = await loadShard(store, key, seq);
      if (!s.ok) { console.log('§SHARD lazy-load REFUSED seq=' + seq + ' why=' + s.why); return { ok: false, why: s.why, at: s.at, seq: seq }; }
      if (s.tip !== expectTip) { console.log('§SHARD lazy-load REFUSED seq=' + seq + ' why=boundary link'); return { ok: false, why: 'boundary link (tip != recorded baseTipHash)', seq: seq }; }
      ops = s.ops.concat(ops);                          // walking backward ⇒ each older shard PREPENDS
      if (seq > 1) {                                    // next (older) boundary from this shard's contained snapshot
        var headSnap = _firstSnapshotPayload(s.ops);    // scan, not ops[0] — a §T7-RACE survivor can precede it
        if (!headSnap) return { ok: false, why: 'missing prior snapshot at shard head', seq: seq };
        expectTip = headSnap.baseTipHash;
      }
    }
    db.__shardArchive = { atSeq: atSeq, ops: ops };
    console.log('§SHARD lazy-load ok shards=' + atSeq + ' archivedOps=' + ops.length + ' (verified back to GENESIS, cached)');
    return { ok: true, ops: ops, shards: atSeq };
  }

  var API = { shard: shard, maybeShard: maybeShard, loadShard: loadShard, verifyShards: verifyShards,
              loadArchivedOps: loadArchivedOps,
              verifyShardOps: verifyShardOps, exportOps: exportOps, _projState: _projState };
  if (typeof window !== 'undefined') window.ErpShard = API;   // window-only, like kernel_ops.js
  console.log('§SHARD_LOADED erp_shard.js (T7 fix 4/4b — signed snapshot boundary, archive-confirmed, lazy-verified)');
})();
