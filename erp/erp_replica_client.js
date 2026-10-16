// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_replica_client.js — ERP.md §0.20 / W-PERSIST — Witness: W-REPLICA
// Reads a canonical op-log snapshot from ANY of N interchangeable hosts (GH raw / OCI / here),
// replays it through the REAL kernel, and verifies the replayed chain tip == the host's advertised
// tip. Determinism ⇒ every reachable host yields the SAME tip ⇒ the host is disposable (the LOG is
// the source of truth, not any host). Includes failover (first reachable wins).
//
// Hosts don't run logic — they STORE+SERVE the snapshot blob. A "write" = the owner re-publishes a new
// snapshot (OCI put / GH push / local write); browser clients read here. Multi-writer SEQUENCING is the
// only part needing compute — that lives on the one live relay ("here"), see erp_relay_server.js.
(function () {
  'use strict';
  var _fetch = (typeof fetch !== 'undefined') ? fetch : null;
  // optional snapshot signature verification (W-SIGN). Resolved at call time from window/require so the
  // client works with or without it loaded (graceful: no signer → sig check reported as 'unsigned').
  function _signer() {
    if (typeof window !== 'undefined' && window.ErpSnapshotSign) return window.ErpSnapshotSign;
    if (typeof module !== 'undefined' && module.exports) { try { return require('./erp_snapshot_sign.js'); } catch (e) {} }
    return null;
  }

  // schema used to rebuild kernel_ops on a fresh replay db (all columns → no ALTER needed)
  var SCHEMA = 'CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, op_uuid TEXT, timestamp INTEGER NOT NULL,'
    + ' op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0,'
    + ' prev_hash TEXT, op_hash TEXT, sig TEXT, gid TEXT, user_tag TEXT)';

  function createReplicaClient(hosts) {
    if (!Array.isArray(hosts) || !hosts.length) throw new Error('createReplicaClient: hosts[] required');
    if (!_fetch) throw new Error('createReplicaClient: no fetch in this environment');

    async function fetchSnapshot(host) {
      var url = host.base.replace(/\/$/, '') + '/relay_snapshot.json';
      var res = await _fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    // fetch every host in parallel; never rejects — each entry carries ok + snapshot or err.
    async function fetchAll() {
      return Promise.all(hosts.map(function (h) {
        return fetchSnapshot(h).then(function (s) { return { host: h.name, base: h.base, ok: true, snapshot: s }; })
                               .catch(function (e) { return { host: h.name, base: h.base, ok: false, err: e.message }; });
      }));
    }

    // failover: return the first reachable host's snapshot, trying in list order.
    async function resolve() {
      for (var i = 0; i < hosts.length; i++) {
        try { var s = await fetchSnapshot(hosts[i]); return { host: hosts[i].name, base: hosts[i].base, snapshot: s }; }
        catch (e) { /* try next */ }
      }
      throw new Error('all hosts unreachable');
    }

    // replay a snapshot through the kernel and verify integrity against the advertised tip.
    // db must be a fresh sql.js Database; kernel = window.KernelOps. Returns the verdict.
    async function replayAndVerify(db, kernel, snapshot) {
      db.run(SCHEMA); kernel.ensureTable(db);
      db.run('DELETE FROM kernel_ops');
      (snapshot.ops || []).forEach(function (op) {
        db.run('INSERT INTO kernel_ops (op_uuid,timestamp,op_type,parameters,input_guids,output_guid) VALUES (?,?,?,?,?,?)',
          [op.op_uuid, op.timestamp, op.op_type, op.parameters, op.input_guids || null, op.output_guid || null]);
      });
      await kernel.sealChain(db);
      var v = await kernel.verifyChain(db);
      var matches = (v.tip === snapshot.tip);
      // W-SIGN: verify the controller's signature over the COMPUTED tip under the PINNED key. A tamperer
      // who rewrites ops+tip+sig cannot forge this — so sigValid is the real tamper-proof gate.
      var s = _signer(), sigValid = null;
      if (s) { sigValid = await s.verifyTip(v.tip, snapshot.sig); }
      console.log('§REPLICA replay len=' + v.len + ' computedTip=' + (v.tip || '').slice(0, 12) +
                  ' match=' + matches + ' sigValid=' + sigValid);
      return { ok: v.ok && matches && (sigValid !== false), computedTip: v.tip, advertisedTip: snapshot.tip,
               len: v.len, matchesAdvertised: matches, sigValid: sigValid };
    }

    return { hosts: hosts, fetchSnapshot: fetchSnapshot, fetchAll: fetchAll, resolve: resolve, replayAndVerify: replayAndVerify };
  }

  var _api = { createReplicaClient: createReplicaClient };
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpReplicaClient = _api; }
  if (typeof console !== 'undefined') { console.log('§REPLICA_CLIENT_LOADED v1'); }
})();
