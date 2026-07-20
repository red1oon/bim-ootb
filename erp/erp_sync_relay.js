// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_sync_relay.js — Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §Relay Wiring — Witness: W-N-CONVERGE.
// Wires the ENGINE-PROVEN relay (erp_relay_server.js / erp_relay_client.js) + the ENGINE-PROVEN rebase
// loop (erp_sync_fsm.js rebase() — rewind → apply-canonical → replay-pending → re-seal, proven by
// scripts/test_kernel_relay.js W-RELAY / scripts/test_kernel_rebase.js W-REBASE) into crud_overlay.js's
// append-only sidecar. This module does NOT reimplement the merge/seal algorithm — it is a thin,
// caller-agnostic transport sliver:
//   - discovers the relay URL to point at (?relay=<url> query param, or an explicit configure() call)
//   - pushRows(): a best-effort, fire-and-forget registration of just-committed rows with the relay,
//     called by crud_overlay.js's _sidePersist right after it appends to the local `ops` IDB store
//     (spec item 1 — "after a local commit appends its op(s), push the new op(s) to the relay")
//   - mounts a minimal `#erp-sync-pill` button (spec item 2's "manual Sync trigger — a pill/button is
//     fine, do NOT invent elaborate UI") that calls window.__crud.syncNow() — the ACTUAL pull+rebase
//     orchestration lives in crud_overlay.js (the caller, per separation of concern), using
//     window.ErpSyncFSM.rebase() + window.ErpRelayClient verbatim.
// Load order (idempiere.html / glassbowl.html): kernel_ops.js, crud_overlay.js, THEN
// erp_relay_client.js, erp_sync_fsm.js, erp_sync_relay.js (this file) — crud_overlay.js's window.__crud
// must already be mounted before this file's pill-click handler can reach it.
(function (global) {
  'use strict';

  var _url = null;

  function _autoDetect() {
    try {
      if (typeof location !== 'undefined' && location.search) {
        var q = new URLSearchParams(location.search).get('relay');
        if (q) return q;
      }
    } catch (e) {}
    return null;
  }
  _url = _autoDetect();

  // configure(url) — explicit override (host-embed seam / non-query-param callers). Passing a falsy
  // value disables the relay again (isEnabled() → false), same as never having a ?relay= param.
  function configure(url) { _url = url || null; console.log('§SYNC_RELAY configure url=' + (_url || 'null')); }
  function relayUrl() { return _url; }
  function isEnabled() { return !!_url; }

  // pushRows — best-effort, fire-and-forget registration of just-committed rows with the relay. This is
  // NOT the merge path (that is crud_overlay.js's syncNow()/ErpSyncFSM.rebase()) — it only shortens the
  // staleness window between "I committed" and "the relay has heard about it", so a peer's next pull sees
  // it sooner. Idempotent at the relay (dedup by op_uuid, W-RELAY) — safe to call again on retry.
  function pushRows(rows) {
    if (!_url || !rows || !rows.length || typeof global.ErpRelayClient === 'undefined') return Promise.resolve(null);
    try {
      var client = global.ErpRelayClient.createRelayClient(_url);
      // Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §DocAction Cross-Device Attribution S7 —
      // Witness: W-REBASE-ATTRIB. This whitelist independently dropped gid/branch_id/sig at the PUSH
      // boundary — a THIRD divergent copy of the same 6-column mapping erp_sync_fsm.js's rebase() had
      // (that fix alone was not sufficient: rebase() only preserves what the relay's canonical snapshot
      // already contains, and this function is what puts ops INTO the relay in the first place).
      var ops = rows.map(function (r) {
        return { op_uuid: r.op_uuid, timestamp: r.timestamp, op_type: r.op_type,
                 parameters: r.parameters, input_guids: r.input_guids, output_guid: r.output_guid,
                 gid: r.gid || null, branch_id: r.branch_id || null, sig: r.sig || null };
      });
      return client.push(ops).then(function (res) {
        console.log('§SYNC_RELAY push accepted=' + res.accepted + ' skipped=' + res.skipped + ' head=' + res.head);
        return res;
      });
    } catch (e) { console.warn('§SYNC_RELAY push error', e && e.message); return Promise.resolve(null); }
  }

  // _mountPill — a minimal, opt-in (only when a relay is configured) manual Sync affordance. Fixed
  // position, no framework, no elaborate UI — exactly what the spec asks for. Disabled while a sync is
  // in flight so a witness's page.click() cannot double-fire; re-enabled in the callback either way.
  function _mountPill() {
    if (!isEnabled() || typeof document === 'undefined') return;
    if (document.getElementById('erp-sync-pill')) return;
    var btn = document.createElement('button');
    btn.id = 'erp-sync-pill';
    btn.type = 'button';
    btn.textContent = '🔄 Sync';   // 🔄 Sync
    btn.title = 'Pull + merge ops from the relay (' + _url + ')';
    btn.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;padding:8px 14px;' +
      'border-radius:20px;border:1px solid #888;background:#222;color:#fff;font:13px system-ui,sans-serif;' +
      'cursor:pointer;opacity:.88;box-shadow:0 2px 8px rgba(0,0,0,.35)';
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true; var prev = btn.textContent; btn.textContent = '…';
      var done = function () { btn.disabled = false; btn.textContent = prev; };
      if (global.__crud && typeof global.__crud.syncNow === 'function') {
        global.__crud.syncNow(function () { done(); });
      } else {
        console.warn('§SYNC_RELAY pill click — window.__crud.syncNow not mounted yet');
        done();
      }
    });
    (document.body || document.documentElement).appendChild(btn);
    console.log('§SYNC_RELAY pill mounted url=' + _url);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _mountPill);
    else _mountPill();
  }

  var API = { configure: configure, relayUrl: relayUrl, isEnabled: isEnabled, pushRows: pushRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.ErpSyncRelay = API;
  if (typeof console !== 'undefined') console.log('§SYNC_RELAY_LOADED v1' + (_url ? ' url=' + _url : ' (no ?relay= param — disabled)'));
})(typeof window !== 'undefined' ? window : this);
