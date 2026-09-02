// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_relay_client.js — Implementing ERP.md §0.20 — Witness: W-RELAY
// Browser/node client for erp_relay_server.js. Exposes the SAME shape as erp_sequencer.js
// (push / snapshot / head), but ASYNC over fetch — so FSM.rebase() (which now awaits the sequencer)
// drives either the in-memory stub or this networked relay with no code change. The relay is the
// authority on ORDER only; effects are replayed by the local kernel (doctrine: dumb facilitator).
(function () {
  'use strict';

  function createRelayClient(baseUrl) {
    if (!baseUrl) throw new Error('createRelayClient: baseUrl required');
    baseUrl = baseUrl.replace(/\/$/, '');
    var _fetch = (typeof fetch !== 'undefined') ? fetch : null;
    if (!_fetch) throw new Error('createRelayClient: no fetch in this environment');

    async function _json(url, init) {
      var res = await _fetch(url, init);
      if (!res.ok) throw new Error('relay ' + res.status + ' ' + url);
      return res.json();
    }

    return {
      // push — POST the local ops; the relay assigns canonical seq and dedupes by op_uuid.
      push: function (ops) {
        return _json(baseUrl + '/push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ops: ops || [] })
        });
      },
      // snapshot — GET the canonical ordered log (optionally ops with seq > afterSeq).
      snapshot: async function (afterSeq) {
        var r = await _json(baseUrl + '/snapshot' + (afterSeq ? '?after=' + afterSeq : ''));
        return r.ops;
      },
      head:   async function () { return (await _json(baseUrl + '/head')).head; },
      health: function () { return _json(baseUrl + '/health'); }
    };
  }

  var _api = { createRelayClient: createRelayClient };
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpRelayClient = _api; }
  if (typeof console !== 'undefined') { console.log('§RELAY_CLIENT_LOADED v1'); }
})();
