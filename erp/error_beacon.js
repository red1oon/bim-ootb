// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * error_beacon.js — S1 SPIKE: the MINIMAL field-error beacon (NOT the G2 telemetry pipeline).
 *   Card: prompts/RESUME_S1_DISCOVERY_SPIKES.md §Beacon  ·  Risk: ProductionRisks.md G2 (observability)
 *
 * The paradigm's failures are SILENT — there is no server log, so an uncaught error in the field just
 * vanishes and you fly blind. This does the *least* that stops that: it wires window.onerror +
 * unhandledrejection to (1) a §-tagged console line you can read in a §-log witness, and (2) a small
 * bounded OFFLINE ring buffer (localStorage) so the last errors survive a reload for inspection.
 *
 * EXPLICITLY NOT here (tenant-gated remedies, per the spike scope):
 *   - NO network telemetry pipe / no beacon-to-server (navigator.sendBeacon is deliberately absent);
 *   - NO PII — only message + source coordinates + a truncated stack are kept (no user data, no inputs).
 *
 * §SPIKE-BEACON installed=Y captured=N sample=…   ← read this line; it is the proof the beacon is live.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__ERR_BEACON__) return;                 // idempotent — load-once even if included twice

  var KEY = 'bim_field_errors';                      // offline ring (survives reload; cleared by user/quota)
  var MAX = 50;                                      // bounded — never an unbounded buffer
  var captured = 0;

  function store() { try { return window.localStorage; } catch (e) { return null; } }

  function ringPush(rec) {
    var s = store(); if (!s) return;
    var buf;
    try { buf = JSON.parse(s.getItem(KEY) || '[]'); } catch (e) { buf = []; }
    buf.push(rec);
    if (buf.length > MAX) buf = buf.slice(buf.length - MAX);   // keep the most recent MAX only
    try { s.setItem(KEY, JSON.stringify(buf)); } catch (e) { /* quota: drop silently, console line still fired */ }
  }

  // PII-free record: message + where + a short stack head. No inputs, no user/business data.
  function record(kind, message, src, line, col, stack) {
    captured++;
    var rec = {
      kind: kind,
      message: String(message || '').slice(0, 300),
      src: String(src || '').slice(0, 200),
      line: line || 0, col: col || 0,
      stack: String(stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 400),
      // monotonic counter, NOT a wall clock — keeps the record deterministic & carries no session timing PII
      seq: captured
    };
    ringPush(rec);
    // the §-tagged line a witness reads — the beacon's whole reason to exist (stop flying blind)
    console.log('§FIELD-ERROR kind=' + rec.kind + ' seq=' + rec.seq +
      ' msg="' + rec.message.replace(/"/g, "'") + '" at=' + rec.src + ':' + rec.line + ':' + rec.col);
    // live count for the New-Paradigm Monitor's G2 widget (it can read window.__ERR_BEACON__.captured)
    api.captured = captured;
  }

  window.addEventListener('error', function (e) {
    // resource-load errors (e.target is an element) carry no Error — note them too, but cheaply
    if (e && e.target && e.target.tagName) {
      record('resource', (e.target.tagName + ' ' + (e.target.src || e.target.href || '')), e.target.src || e.target.href || '', 0, 0, '');
      return;
    }
    record('error', e && e.message, e && e.filename, e && e.lineno, e && e.colno, e && e.error && e.error.stack);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = (r && r.message) || (typeof r === 'string' ? r : 'unhandledrejection');
    record('promise', msg, '', 0, 0, r && r.stack);
  });

  var api = {
    captured: 0,
    list: function () { var s = store(); try { return JSON.parse(s.getItem(KEY) || '[]'); } catch (e) { return []; } },
    clear: function () { var s = store(); if (s) s.removeItem(KEY); captured = 0; this.captured = 0; },
    // test hook — drive a synthetic capture without throwing (used by the §-log witness)
    _emit: function (msg) { record('test', msg, 'error_beacon.js', 0, 0, ''); }
  };
  window.__ERR_BEACON__ = api;

  console.log('§SPIKE-BEACON installed=Y captured=' + captured + ' sample=(none-yet) buf=localStorage:' + KEY +
    ' bound=' + MAX + ' telemetryPipe=N pii=N');
})();
