// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_sync_fsm.js — Implementing ERP.md §0.20 (secured/durable axis) — Witness: W-SYNC-FSM
// The client↔server-domain synchronisation lifecycle as an explicit finite state machine.
// Borrowed shape: docs/LocalFirstPriorArt.md §6 (SQLSync rebase loop / SyncStateMachine), but
// WIRED TO THE KERNEL — not a standalone toy. Two hard gates make the FSM ours:
//   1. SCHEMA gate  — refuse to touch the log until the local manifest hash == server manifest hash
//                     (Project Cambria maxim: never sync across mismatched schema versions).
//   2. CHAIN gate   — refuse to reach IN_SYNC unless KernelOps.verifyChain(db) passes (W-CHAIN/W-SIGN:
//                     sync only completes over a tamper-evident, optionally-signed log).
// The transition() table is a PURE deterministic reducer (no Date.now/Math.random, no side effects) so
// it is replay-safe per the prime directive; runSync() is the only async/side-effecting driver and it
// emits events purely as a function of the REAL kernel's verifyChain result + the manifest comparison.
(function () {
  'use strict';

  // ── States & events (string enums — readable in §-logs and UI) ──────────────
  var STATES = {
    OFFLINE:          'OFFLINE',
    HANDSHAKING:      'HANDSHAKING',
    VERIFYING_SCHEMA: 'VERIFYING_SCHEMA',
    REPLAYING_LOGS:   'REPLAYING_LOGS',
    IN_SYNC:          'IN_SYNC',
    SYNC_ERROR:       'SYNC_ERROR'
  };
  var EVENTS = {
    CONNECT:         'CONNECT',          // user/network triggers a sync attempt
    SCHEMA_RECEIVED: 'SCHEMA_RECEIVED',  // server manifest hash arrived
    SCHEMA_OK:       'SCHEMA_OK',        // local hash == server hash
    SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',  // versions differ → must upcast/refresh, never sync raw
    REPLAY_OK:       'REPLAY_OK',        // verifyChain passed
    REPLAY_FAIL:     'REPLAY_FAIL',      // verifyChain failed (tamper / unsealed / bad sig)
    CONNECTION_LOST: 'CONNECTION_LOST',  // drop from any active state
    RESET:           'RESET'             // clear a SYNC_ERROR back to OFFLINE
  };

  // ── The pure transition table — total & deterministic ───────────────────────
  // Any (state,event) not listed is a no-op (returns the same state) so an out-of-order or unknown
  // event can never corrupt the machine — the same guarantee replay gives the op-log.
  var TABLE = {
    OFFLINE:          { CONNECT: 'HANDSHAKING' },
    HANDSHAKING:      { SCHEMA_RECEIVED: 'VERIFYING_SCHEMA', CONNECTION_LOST: 'OFFLINE' },
    VERIFYING_SCHEMA: { SCHEMA_OK: 'REPLAYING_LOGS', SCHEMA_MISMATCH: 'SYNC_ERROR', CONNECTION_LOST: 'OFFLINE' },
    REPLAYING_LOGS:   { REPLAY_OK: 'IN_SYNC', REPLAY_FAIL: 'SYNC_ERROR', CONNECTION_LOST: 'OFFLINE' },
    IN_SYNC:          { CONNECTION_LOST: 'OFFLINE' },
    SYNC_ERROR:       { CONNECT: 'HANDSHAKING', RESET: 'OFFLINE' }
  };

  /**
   * Pure transition. Given a state and an event, return the next state (or the same state if the
   * event is illegal in that state). No side effects — safe to call anywhere, any number of times.
   * @param {string} state  one of STATES
   * @param {string} event  one of EVENTS
   * @returns {string} next state
   */
  function transition(state, event) {
    var row = TABLE[state];
    if (row && Object.prototype.hasOwnProperty.call(row, event)) return row[event];
    return state; // illegal event in this state → no-op
  }

  // ── Stateful holder for UI wiring (thin wrapper over the pure transition) ────
  function SyncFSM(onChange) {
    this.state = STATES.OFFLINE;
    this._onChange = (typeof onChange === 'function') ? onChange : null;
  }
  SyncFSM.prototype.send = function (event) {
    var prev = this.state;
    this.state = transition(this.state, event);
    if (this.state !== prev && this._onChange) this._onChange(this.state, prev, event);
    return this.state;
  };
  SyncFSM.prototype.get = function () { return this.state; };

  /**
   * runSync — the ONLY side-effecting driver. Walks OFFLINE → IN_SYNC, emitting events purely as a
   * function of the manifest comparison and the REAL kernel's verifyChain result.
   *
   *   OFFLINE ─CONNECT→ HANDSHAKING ─SCHEMA_RECEIVED→ VERIFYING_SCHEMA
   *                                                      │ hash match → SCHEMA_OK → REPLAYING_LOGS
   *                                                      │                              │ verifyChain.ok → REPLAY_OK → IN_SYNC
   *                                                      │                              └ !ok          → REPLAY_FAIL → SYNC_ERROR
   *                                                      └ mismatch  → SCHEMA_MISMATCH → SYNC_ERROR  (log untouched)
   *
   * @param {Object}  opts
   * @param {Object}  opts.db                  sql.js database carrying the kernel_ops log
   * @param {Object}  opts.kernel              window.KernelOps (must expose verifyChain)
   * @param {string}  opts.localManifestHash   hash of the client's compiled-AD manifest
   * @param {string}  opts.serverManifestHash  hash advertised by the server during handshake
   * @param {Function}[opts.onState]           called (state, prev, event) on every transition
   * @returns {Promise<{state:string, ok:boolean, detail:Object}>}
   */
  async function runSync(opts) {
    opts = opts || {};
    var fsm = new SyncFSM(opts.onState);
    var detail = {
      localManifestHash:  opts.localManifestHash || null,
      serverManifestHash: opts.serverManifestHash || null,
      schemaMatch: null,
      chain: null,
      reason: null
    };

    fsm.send(EVENTS.CONNECT);          // OFFLINE → HANDSHAKING
    fsm.send(EVENTS.SCHEMA_RECEIVED);  // HANDSHAKING → VERIFYING_SCHEMA

    // ── GATE 1: schema/manifest handshake — never touch the log on a version mismatch ──
    var match = !!opts.localManifestHash && (opts.localManifestHash === opts.serverManifestHash);
    detail.schemaMatch = match;
    if (!match) {
      detail.reason = 'manifest hash mismatch (local=' + _short(opts.localManifestHash) +
                      ' server=' + _short(opts.serverManifestHash) + ')';
      fsm.send(EVENTS.SCHEMA_MISMATCH); // → SYNC_ERROR (verifyChain NEVER called — data untouched)
      console.log('§SYNC_FSM schema-gate BLOCK ' + detail.reason);
      return { state: fsm.get(), ok: false, detail: detail };
    }
    fsm.send(EVENTS.SCHEMA_OK);        // VERIFYING_SCHEMA → REPLAYING_LOGS

    // ── REBASE (opt-in): if a sequencer is wired, fold the server's canonical order into the local
    //    log before verifying. This is the SQLSync rebase borrow (LocalFirstPriorArt.md §6): rewind →
    //    apply server-ordered ops → replay pending local on top → re-seal. Without a sequencer, this
    //    is a no-op and the chain gate runs on the local log as-is (single-device case).
    if (opts.sequencer) {
      try {
        detail.rebase = await rebase(opts.db, opts.kernel, opts.sequencer);
      } catch (e) {
        detail.reason = 'rebase threw: ' + (e && e.message);
        fsm.send(EVENTS.REPLAY_FAIL);
        console.log('§SYNC_FSM rebase BLOCK ' + detail.reason);
        return { state: fsm.get(), ok: false, detail: detail };
      }
    }

    // ── GATE 2: chain integrity — only reach IN_SYNC over a verified (tamper-evident) log ──
    var chain;
    try {
      chain = await opts.kernel.verifyChain(opts.db);
    } catch (e) {
      chain = { ok: false, why: 'verifyChain threw: ' + (e && e.message) };
    }
    detail.chain = chain;
    if (!chain || !chain.ok) {
      detail.reason = 'chain verify failed (' + (chain && chain.why) +
                      (chain && chain.brokeAt != null ? ' at id=' + chain.brokeAt : '') + ')';
      fsm.send(EVENTS.REPLAY_FAIL);    // → SYNC_ERROR
      console.log('§SYNC_FSM chain-gate BLOCK ' + detail.reason);
      return { state: fsm.get(), ok: false, detail: detail };
    }
    detail.reason = 'verified len=' + chain.len + ' tip=' + _short(chain.tip);
    fsm.send(EVENTS.REPLAY_OK);        // REPLAYING_LOGS → IN_SYNC
    console.log('§SYNC_FSM IN_SYNC ' + detail.reason);
    return { state: fsm.get(), ok: true, detail: detail };
  }

  /**
   * rebase — the SQLSync-style loop (LocalFirstPriorArt.md §6), wired to the real kernel + sequencer:
   *   1. read the local log (raw rows, id order)
   *   2. push it to the sequencer — idempotent by op_uuid, so already-sequenced ops are no-ops and
   *      the server assigns a canonical total order across ALL devices
   *   3. rewrite the local kernel_ops to that canonical snapshot (rewind + reapply); local `id` is a
   *      throwaway rowid (1..N) — op_uuid is the durable identity, so re-id is safe by construction
   *   4. re-seal the chain over the new order (sealChain full-recomputes → valid chain, §kernel)
   * Determinism ⇒ every device that rebases against the same sequencer head materialises the SAME
   * ordered log ⇒ the SAME chain tip ⇒ the SAME projection. That convergence is the whole point.
   *
   * Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §DocAction Cross-Device Attribution S7 — Witness:
   * W-REBASE-ATTRIB. `gid`/`branch_id`/`sig` now ride through the rewind+reapply (previously dropped,
   * NULLing every op's group + attestation on every sync). `gid` survival keeps a DocAction fan-out
   * (commitGroup) foldable/undoable as ONE group after a sync, not N orphaned singletons. `sig`
   * survival matters only for v2 content-signed rows (kernel_ops.js _sigBase attests the id-independent
   * content hash for those — a v1 row's sig attests the position-dependent chain hash and could never
   * survive a reorder regardless of what this function does); sealChain's own `if (_signer && !sig)`
   * guard already skips re-signing a row that arrives with a sig intact, so no kernel change was needed
   * to make preservation "stick" — the bug was purely that rebase() blanked the column before sealChain
   * ever got a chance to see it.
   * @returns {Promise<{applied:number, head:number}>}
   */
  async function rebase(db, kernel, sequencer) {
    // Implementing prompts/BACKEND_SUBSTRATE_LANE.md §RB.2 — Witness: W-REBASE-USERTAG.
    // `user_tag` rides through the rewind+reapply for the SAME reason gid/branch_id/sig do (S7 above),
    // and it is the one column that fix missed. kernel_ops.js:_canonicalV2 signs `actor: op.user_tag`,
    // so a v2 content-signed row's signature ATTESTS its user_tag; the column DEFAULTs to 'local'
    // (kernel_ops.js:42), so dropping it here silently rewrote every non-default actor's row to 'local'
    // and sealChain — which does not re-sign a row that arrives with a sig — then verified a content
    // hash the signature no longer covers. MEASURED before the fix: a row committed as `user:bob`
    // came back `user_tag=local` and verifyChain went true -> false (why=signature, brokeAt=1).
    var r = db.exec('SELECT op_uuid,timestamp,op_type,parameters,input_guids,output_guid,gid,branch_id,sig,user_tag FROM kernel_ops ORDER BY id');
    var local = (r.length ? r[0].values : []).map(function (row) {
      return { op_uuid: row[0], timestamp: row[1], op_type: row[2], parameters: row[3],
               input_guids: row[4], output_guid: row[5], gid: row[6], branch_id: row[7], sig: row[8],
               user_tag: row[9] };
    });
    var pushRes = await sequencer.push(local); // idempotent ingest → canonical order (await: sync stub OR async HTTP relay)
    var canon = await sequencer.snapshot();    // the authoritative ordered log
    db.run('DELETE FROM kernel_ops');      // rewind: drop local order (ids restart at 1 — no AUTOINCREMENT)
    for (var i = 0; i < canon.length; i++) {
      var op = canon[i];
      db.run('INSERT INTO kernel_ops (op_uuid,timestamp,op_type,parameters,input_guids,output_guid,gid,branch_id,sig,user_tag) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [op.op_uuid, op.timestamp, op.op_type, op.parameters, op.input_guids || null, op.output_guid || null,
         op.gid || null, op.branch_id || null, op.sig || null,
         // fall back to the column DEFAULT only when the source row genuinely has none, so a
         // pre-user_tag log still rebases to exactly the bytes it does today.
         (op.user_tag != null ? op.user_tag : 'local')]);
    }
    await kernel.sealChain(db);             // re-seal over the canonical order (skips already-signed rows)
    console.log('§SYNC_FSM rebase applied=' + canon.length + ' head=' + (pushRes && pushRes.head != null ? pushRes.head : canon.length));
    return { applied: canon.length, head: sequencer.head() };
  }

  function _short(h) { return (typeof h === 'string' && h.length > 12) ? h.slice(0, 12) + '…' : (h || 'null'); }

  var _api = {
    STATES: STATES,
    EVENTS: EVENTS,
    transition: transition,   // pure reducer (deterministic, replay-safe)
    SyncFSM: SyncFSM,         // stateful holder for UI onChange wiring
    runSync: runSync,         // kernel-wired driver (schema gate + rebase + verifyChain gate)
    rebase: rebase            // SQLSync-style rebase loop (kernel + sequencer)
  };

  // UMD tail — node (witness/pocs) AND browser (window.ErpSyncFSM for the live host). No fork.
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpSyncFSM = _api; }
  if (typeof console !== 'undefined') { console.log('§SYNC_FSM_LOADED v1 (schema-gate + chain-gate)'); }
})();
