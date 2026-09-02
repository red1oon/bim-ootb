// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * system_monitor.js — the New-Paradigm System Monitor (4 field-health widgets).
 *   Spec: prompts/SYSTEM_MONITOR_WIDGETS.md §SPEC  ·  Risk register: docs/ProductionRisks.md §H
 *   Thresholds: docs/FoldEngineConstraints.md §6 (db_file_size_mb, quota_used_pct, offline_queue_mb, vfs_backend)
 *
 * Classic iDempiere's System Monitor watched the SERVER's vitals (JVM heap, DB pool). With no server, this
 * watches the PARADIGM's vitals — the signals that only exist because the server is gone. It is the SysAdmin's
 * optic + control surface, and the concrete remedy for G2 (observability-without-a-server).
 *
 * PURE FOLD (holy-grail law: declarative fold + rules exposed, NON-INVENT): SystemMonitor.fold(signals) reads
 * injected signal-readers and returns a structured readout — testable headless, no browser. render() paints it.
 *
 *   SystemMonitor.fold({
 *     beacon,        // window.__ERR_BEACON__  (error_beacon.js) — { captured, list() }   | optional
 *     queue,         // ERP.OfflineQueue instance (offline_queue.js) — count/relayed/oldestAgeMs | optional
 *     db,            // sql.js Database holding the op-log — for PRAGMA page_count×page_size  | optional
 *     vfs,           // result of ERP.VFS.detect()  — { backend, misconfig, reason }         | optional
 *     storageEstimate, // { usage, quota } from navigator.storage.estimate()                 | optional
 *     persisted,     // boolean from navigator.storage.persisted()                           | optional
 *     bootstrapPath  // 'checkpoint' | 'genesis'                                             | optional
 *   }) -> { widgets: [{ id,label,value,status,detail }], overall }
 *
 * status ∈ ok|warn|alert|na. overall = worst widget status. A missing signal → na (NEVER invented).
 */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ERP = root.ERP || {}; root.ERP.FieldHealth = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  var DB_WARN_MB = 100, DB_ALERT_MB = 200;        // §6 db_file_size_mb: >100 compact, >200 OOM ceiling
  var QUOTA_WARN_PCT = 70;                         // §6 quota_used_pct
  var QUEUE_AGE_WARN_DAYS = 6;                     // §6 offline_queue_mb age > 6 days
  var RANK = { ok: 0, na: 1, warn: 2, alert: 3 };

  function round1(x) { return Math.round(x * 10) / 10; }

  // ── Widget 1: field errors (G2) — from the error beacon ──────────────────────────────────────────
  function _fieldErrors(beacon) {
    if (!beacon || typeof beacon.captured !== 'number') return { id: 'field_errors', label: 'Field errors', value: 'n/a', status: 'na', detail: 'beacon not installed' };
    var n = beacon.captured;
    var recent = (typeof beacon.list === 'function') ? beacon.list() : [];
    var hard = recent.filter(function (r) { return r.kind === 'error' || r.kind === 'promise'; }).length;
    var status = n === 0 ? 'ok' : (hard > 0 ? 'alert' : 'warn');
    return { id: 'field_errors', label: 'Field errors', value: n, status: status,
      detail: n === 0 ? 'no uncaught errors this session' : (hard + ' hard / ' + n + ' total captured (offline ring)') };
  }

  // ── Widget 2: durability ladder (A1) — the most important field-health widget ─────────────────────
  //   local → syncing → durable@N. The INVARIANT: an unrelayed op is NEVER shown as "durable".
  function _durability(queue, storageEstimate, persisted) {
    if (!queue || typeof queue.count !== 'function') return { id: 'durability_ladder', label: 'Durability', value: 'n/a', status: 'na', detail: 'no offline queue' };
    var total = queue.count();
    // relayed (server-durable) vs in-flight (local-only, NOT safe) — read straight off the queue records
    var durable = 0, inflight = 0;
    (queue._q || []).forEach(function (r) { if (r.relayed) durable++; else inflight++; });
    var oldestSec = Math.round((queue.oldestAgeMs ? queue.oldestAgeMs() : 0) / 1000);
    var quotaPct = (storageEstimate && storageEstimate.quota) ? round1(100 * storageEstimate.usage / storageEstimate.quota) : null;
    var status = 'ok';
    if (inflight > 0) status = 'warn';                                  // unsynced work exists → not all safe
    if (oldestSec > QUEUE_AGE_WARN_DAYS * 86400) status = 'warn';
    if (quotaPct != null && quotaPct > QUOTA_WARN_PCT) status = 'warn';
    if (persisted === false && inflight > 0) status = 'alert';          // unsynced AND eviction not resisted
    return { id: 'durability_ladder', label: 'Durability', value: 'durable@' + durable + ' · inflight ' + inflight,
      status: status, detail: 'total=' + total + ' oldestUnackedSec=' + oldestSec +
        (quotaPct != null ? ' quota=' + quotaPct + '%' : '') + ' persisted=' + (persisted == null ? '?' : persisted) +
        (inflight > 0 ? ' (inflight is NOT durable — never shown safe)' : '') };
  }

  // ── Widget 3: op-log DB size gauge (B1 — the REAL ceiling) — the reassuring optic ─────────────────
  function _dbSize(db) {
    if (!db || typeof db.exec !== 'function') return { id: 'db_size_gauge', label: 'Op-log DB', value: 'n/a', status: 'na', detail: 'no op-log yet — fold a rule or post a doc to populate' };
    var pc, ps;
    try {
      pc = db.exec('PRAGMA page_count'); ps = db.exec('PRAGMA page_size');
      var pages = pc[0].values[0][0], size = ps[0].values[0][0];
      var mb = round1((pages * size) / (1024 * 1024));
      var status = mb > DB_ALERT_MB ? 'alert' : (mb > DB_WARN_MB ? 'warn' : 'ok');
      var headroom = round1(DB_ALERT_MB - mb);
      return { id: 'db_size_gauge', label: 'Op-log DB', value: mb + ' MB', status: status,
        detail: 'ceiling ' + DB_ALERT_MB + ' MB · headroom ' + headroom + ' MB · ' +
          (status === 'ok' ? Math.round(DB_ALERT_MB / Math.max(mb, 0.1)) + '× under ceiling' : 'compact recommended') };
    } catch (e) {
      return { id: 'db_size_gauge', label: 'Op-log DB', value: 'n/a', status: 'na', detail: 'PRAGMA failed: ' + e.message };
    }
  }

  // ── Widget 4: environment / VFS (C1) — which storage backend + bootstrap path ─────────────────────
  function _environment(vfs, bootstrapPath) {
    if (!vfs || !vfs.backend) return { id: 'environment', label: 'Environment', value: 'n/a', status: 'na', detail: 'vfs not detected' };
    var status = vfs.misconfig ? 'warn' : 'ok';
    var detail = vfs.reason || (vfs.backend.toUpperCase() + ' VFS');
    if (bootstrapPath === 'genesis') { status = 'alert'; detail += ' · ⚠ genesis bootstrap (checkpoint missing/corrupt)'; }
    else if (bootstrapPath) { detail += ' · bootstrap=' + bootstrapPath; }
    return { id: 'environment', label: 'Environment', value: vfs.backend.toUpperCase() + (bootstrapPath ? ' · ' + bootstrapPath : ''),
      status: status, detail: detail };
  }

  function fold(signals) {
    signals = signals || {};
    var widgets = [
      _fieldErrors(signals.beacon),
      _durability(signals.queue, signals.storageEstimate, signals.persisted),
      _dbSize(signals.db),
      _environment(signals.vfs, signals.bootstrapPath)
    ];
    var overall = widgets.reduce(function (acc, w) { return RANK[w.status] > RANK[acc] ? w.status : acc; }, 'ok');
    // §-log each widget (the witness reads these) + overall
    widgets.forEach(function (w) { console.log('§MON-' + w.id.toUpperCase() + ' value="' + w.value + '" status=' + w.status + ' — ' + w.detail); });
    console.log('§MON-OVERALL=' + overall);
    return { widgets: widgets, overall: overall };
  }

  // ── render — paint the readout into a DOM element (no-op headless) ────────────────────────────────
  var COLOR = { ok: '#2e9e4f', warn: '#d98a00', alert: '#d23b3b', na: '#888' };
  function render(readout, el) {
    if (typeof document === 'undefined' || !el) return readout;     // headless: fold-only
    var dot = function (s) { return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + COLOR[s] + ';margin-right:7px"></span>'; };
    var rows = readout.widgets.map(function (w) {
      return '<div style="display:flex;align-items:center;padding:7px 10px;border-bottom:1px solid #ececec">' +
        dot(w.status) +
        '<div style="flex:1"><div style="font-weight:600;font-size:13px">' + w.label + '</div>' +
        '<div style="font-size:11px;color:#777">' + w.detail + '</div></div>' +
        '<div style="font-variant-numeric:tabular-nums;font-size:13px;color:' + COLOR[w.status] + '">' + w.value + '</div></div>';
    }).join('');
    el.innerHTML =
      '<div style="font-family:system-ui,sans-serif;border:1px solid #ddd;border-radius:8px;max-width:380px;overflow:hidden">' +
      '<div style="padding:8px 10px;background:#1d2733;color:#fff;font-size:12px;font-weight:600;display:flex;justify-content:space-between">' +
      '<span>System Monitor — paradigm vitals</span>' + dot(readout.overall) + '</div>' + rows + '</div>';
    return readout;
  }

  console.log('§FIELDHEALTH_LOADED v1 (4 widgets: field_errors/durability_ladder/db_size_gauge/environment)');
  return { fold: fold, render: render };
}));
