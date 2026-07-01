// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ERP READ-BRIDGE (teams/ROADMAP.md §S1, Phase A — zero impact).
//   The Teams core can READ a live ERP kernel_ops log WITHOUT editing erp/. This is the ERP analogue
//   of connectors.js's modeller seam: ONE adapter, the rest of teams/ stays decoupled. READ-ONLY —
//   the two erp/ RUNTIME touches (emit hook + scope key) are Phase D, not here. Read the log after every run.
//
//   BINDING (separation of concern — this file imports NOTHING from erp/, the host is INJECTED):
//     sign / verifyChain  →  erp/kernel_ops.js (+ erp/erp_signer.js)   [the signed hash-chain]
//     world               →  erp/erp_kernel.js  replay()               [event-sourced projection]
//     blame               →  last `actor` per doc (rich op payload / user_tag column)
//
//   Witnesses: teams/tests/poc_teams_erp_bridge.js — W-ERP-SIGN (a real chain verifies through the
//   bridge; tamper rejected) + W-ERP-FOLD (replay-hash equality; per-doc blame; zero re-mint).
'use strict';
(function () {

  // makeBridge(host) — build a read-bridge over an injected ERP host.
  //   host = { KernelOps, ERPKernel, ErpSigner } — supplied by the caller, never imported here:
  //     browser → window.{KernelOps,ERPKernel,ErpSigner}; node witness → the required modules.
  //   This keeps the "no erp/ coupling" guarantee literal — the bridge only knows the contract.
  function makeBridge(host) {
    host = host || (typeof window !== 'undefined' ? window : {});
    var KernelOps = host.KernelOps, ERPKernel = host.ERPKernel, ErpSigner = host.ErpSigner;
    if (!KernelOps) throw new Error('erp_bridge: host.KernelOps required (erp/kernel_ops.js)');
    var _signer = null;

    return {
      _host: host,
      isSigning: function () { return _signer != null; },

      // ── sign (per-op) — erp_signer wrap. installSigner ONCE, then sign(op_hashHex). ──
      // Key custody stays in erp_signer (non-extractable edge key); the bridge only forwards.
      installSigner: function (keyPair) {
        if (!ErpSigner) throw new Error('erp_bridge: host.ErpSigner required to install a signer');
        _signer = ErpSigner.makeSigner(keyPair);
        KernelOps.setSigner(_signer);                 // turns ON W-SIGN on the live chain
        return _signer;
      },
      // the per-op signature the roadmap names: one op_hash hex → sigHex (Promise).
      sign: function (hashHex) {
        if (!_signer) return Promise.reject(new Error('erp_bridge: no signer installed'));
        return _signer.sign(hashHex);
      },
      verifySig: function (hashHex, sigHex) {
        if (!_signer) return Promise.resolve(false);
        return _signer.verify(hashHex, sigHex);
      },

      // ── seal + verify — delegate to the REAL kernel chain (never re-implemented here). ──
      seal: function (db) { return KernelOps.sealChain(db); },              // async {sealed,tip}
      verifyChain: function (db) { return KernelOps.verifyChain(db); },     // async {ok,brokeAt,why}

      // ── world — event-sourced projection via erp_kernel.replay (deterministic, frozen effects). ──
      //   Returns { ops, hash, db } over a FRESH projection db built by the caller's makeDb().
      world: function (srcDb, makeDb) {
        if (!ERPKernel) throw new Error('erp_bridge: host.ERPKernel required for world()');
        var fresh = makeDb();
        var r = ERPKernel.replay(srcDb, fresh);
        return { ops: r.ops, hash: r.hash, db: fresh };
      },

      // ── blame — last `actor` per doc, a PURE projection of the signed log (last writer wins). ──
      //   Keyed by output_guid (the doc id), ORDER BY id so a later op overwrites = last writer.
      //   actor = the kernel_ops.user_tag column (erp_kernel stamps it); rich.payload.actor is a fallback.
      blame: function (srcDb) {
        var rows = srcDb.exec(
          'SELECT output_guid, user_tag, parameters FROM kernel_ops ' +
          'WHERE undone = 0 AND output_guid IS NOT NULL ORDER BY id');
        var map = {};
        if (rows.length) rows[0].values.forEach(function (v) {
          var doc = v[0], actor = v[1];
          if (actor == null && v[2]) { try { var rich = JSON.parse(v[2]); actor = rich && rich.actor; } catch (e) {} }
          map[doc] = actor || null;
        });
        return map;
      }
    };
  }

  // goLiveErp(connectors, host) — REBIND the Teams Connectors singleton's verify/sign to the ERP chain,
  //   mirroring connectors.goLive (which binds the MODELLER kernel). Additive + reversible: rebinds ONLY
  //   when the host actually exposes the ERP kernel; otherwise the connector keeps its existing binding.
  //   ⚠ ERP verifyChain is db-based + async (vs the Teams stub's array-based + sync) — call only when the
  //   Teams layer is driving an ERP log. Existing teams witnesses never call this → stub contract intact.
  function goLiveErp(connectors, host) {
    var b = makeBridge(host);
    if (host && host.KernelOps && typeof host.KernelOps.verifyChain === 'function') {
      connectors._bindings = connectors._bindings || {};
      connectors.verifyChain = function (db) { return b.verifyChain(db); };
      connectors._bindings.verifyChain = 'erp';
      if (host.ErpSigner) {
        connectors.signHash = function (h) { return b.sign(h); };
        connectors._bindings.sign = 'erp';
      }
    }
    return b;
  }

  var API = { makeBridge: makeBridge, goLiveErp: goLiveErp };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else (typeof self !== 'undefined' ? self : this).TeamsErpBridge = API;
})();
