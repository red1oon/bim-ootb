/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * idmp_history.js — ERP_BOTTOM_BAR_AND_LIFECYCLE.md §B — cross-tab history scrubber for idempiere.html.
 *
 * A thin bar pinned at the bottom (under #idmp-status) that records the SEMANTIC navigation of a session and
 * works ACROSS the iDempiere window tabs (#idmp-wintabs): a moment = {window opened, AD-tab switched, record
 * selected}. Double-tap blooms the dots into labelled chips ("Sales Order 1023"); click a dot = restore that
 * view, READ-ONLY (re-open window/tab + re-select record; NEVER mutate the kernel op-log).
 *
 * Pattern mirrors the Glassbowl #scrub (build/erp/glassbowl.html renderScrub: gold=current, double-tap→bloom)
 * + universal_history.js's curation/restore split. The HOST (idempiere.html) pushes moments and registers the
 * read-only restore — this module owns ONLY the curation + the bar.
 *
 * DETERMINISM (NON-INVENT): no Date.now/Math.random in the record path — a monotonic seq orders entries and
 * performance.now() drives ONLY the double-tap meter. Every chip label comes from a real record field (host).
 */
(function () {
  'use strict';

  var _hist = [];        // [{ seq, sig, kind, label, windowId, tabIdx, table, recordId }]
  var _idx = -1;         // current (gold) index; tail beyond it is the "forward" branch (truncated on new push)
  var _seq = 0;
  var _bloom = false;
  var _restoreFn = null;
  var _bar = null, _line = null;

  function _sig(m) { return m.kind + '|' + m.windowId + '|' + m.tabIdx + '|' + (m.recordId == null ? '' : m.recordId); }

  // push(moment) — the host calls this at a semantic moment. Curation: drop a repeat of the current entry
  // (re-selecting the same record / re-activating the same window is not a new moment). A new moment after a
  // back-step truncates the forward branch (browser-history semantics).
  function push(m) {
    if (!m || m.windowId == null) return;
    var sig = _sig(m);
    if (_idx >= 0 && _hist[_idx] && _hist[_idx].sig === sig) return;     // §curation: coalesce the no-op repeat
    if (_idx < _hist.length - 1) _hist.length = _idx + 1;                // truncate forward branch
    var e = { seq: _seq++, sig: sig, kind: m.kind, label: m.label || m.kind,
              windowId: m.windowId, tabIdx: m.tabIdx, table: m.table || null, recordId: (m.recordId == null ? null : m.recordId) };
    _hist.push(e); _idx = _hist.length - 1;
    console.log('§IDMP-HIST push=' + e.kind + ':' + e.label + ' depth=' + _hist.length + ' idx=' + _idx);
    render();
  }

  function registerRestore(fn) { _restoreFn = fn; }

  // _go(i) — click a dot / undo / redo. Restore is READ-ONLY: the host re-selects via openWindow/tab/record.
  function _go(i) {
    if (i < 0 || i >= _hist.length) return;
    _idx = i;
    var e = _hist[i];
    if (_restoreFn) { try { _restoreFn(e); } catch (err) { console.warn('§IDMP-HIST restore-fail ' + err.message); } }
    render();
  }
  function undo() { if (_idx > 0) _go(_idx - 1); }
  function redo() { if (_idx < _hist.length - 1) _go(_idx + 1); }

  function _ensureBar() {
    if (_bar) return _bar;
    _injectStyle();
    _bar = document.createElement('div');
    _bar.id = 'idmp-scrub';
    var main = document.getElementById('idmp-main') || document.body;
    main.appendChild(_bar);                                   // in-flow, after #idmp-status (under it)
    // double-tap anywhere on the bar (except a dot) blooms the dots into labelled chips (performance.now meter).
    var _last = 0;
    _bar.addEventListener('click', function (ev) {
      if (ev.target.classList && ev.target.classList.contains('scrubdot')) return;
      var now = performance.now();
      if (now - _last < 320) { _bloom = !_bloom; render(); _last = 0; console.log('§IDMP-HIST bloom=' + _bloom); }
      else _last = now;
    });
    _bar.addEventListener('dblclick', function (ev) {
      if (ev.target.classList && ev.target.classList.contains('scrubdot')) return;
      _bloom = !_bloom; render(); console.log('§IDMP-HIST bloom=' + _bloom);
    });
    return _bar;
  }

  function render() {
    _ensureBar();
    var has = _hist.length > 0;
    document.body.classList.toggle('idmp-has-scrub', has);    // mobile: lifts the bottom pill dock above the strip
    if (!has) { _bar.classList.remove('show'); return; }
    _bar.classList.add('show');
    _bar.classList.toggle('bloom', _bloom);
    var h = '<span class="scrubbtn" id="idmp-scrub-undo" title="back">↶</span><div class="scrubline" id="idmp-scrubline">';
    _hist.forEach(function (e, i) {
      h += '<div class="scrubdot' + (i === _idx ? ' on' : '') + '" data-i="' + i + '" data-kind="' + e.kind +
        '" title="' + (i + 1) + '. ' + _esc(e.label) + '">' + (_bloom ? _esc(e.label) : '') + '</div>';
    });
    h += '</div><span class="scrubbtn" id="idmp-scrub-redo" title="forward">↷</span>';
    _bar.innerHTML = h;
    var u = document.getElementById('idmp-scrub-undo'), r = document.getElementById('idmp-scrub-redo');
    if (u) u.addEventListener('click', function (e) { e.stopPropagation(); undo(); });
    if (r) r.addEventListener('click', function (e) { e.stopPropagation(); redo(); });
    Array.prototype.forEach.call(_bar.querySelectorAll('.scrubdot'), function (d) {
      d.addEventListener('click', function (ev) { ev.stopPropagation(); _go(+d.getAttribute('data-i')); });
    });
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function clear() { _hist = []; _idx = -1; _bloom = false; render(); }
  function list() { return _hist.map(function (e) { return { kind: e.kind, label: e.label }; }); }

  function _injectStyle() {
    if (document.getElementById('idmp-scrub-style')) return;
    var s = document.createElement('style');
    s.id = 'idmp-scrub-style';
    s.textContent =
      '#idmp-scrub{display:none;flex:0 0 auto;align-items:center;gap:8px;height:28px;padding:0 10px;' +
        'background:#0f1420;border-top:1px solid rgba(255,255,255,0.08);overflow:hidden;}' +
      '#idmp-scrub.show{display:flex;}' +
      '#idmp-scrub .scrubbtn{color:#9aa4b8;cursor:pointer;font-size:14px;line-height:1;user-select:none;padding:0 2px;}' +
      '#idmp-scrub .scrubbtn:hover{color:#6c9fff;}' +
      '#idmp-scrub .scrubline{display:flex;align-items:center;gap:8px;flex:1;overflow-x:auto;overflow-y:hidden;height:100%;}' +
      '#idmp-scrub .scrubline::-webkit-scrollbar{height:0;}' +
      '#idmp-scrub .scrubdot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:rgba(154,164,184,0.5);' +
        'cursor:pointer;transition:background .15s,transform .15s;}' +
      '#idmp-scrub .scrubdot:hover{background:#6c9fff;transform:scale(1.25);}' +
      '#idmp-scrub .scrubdot.on{background:#ffd479;box-shadow:0 0 6px rgba(255,212,121,0.7);}' +
      // bloom: dots become labelled chips (the real record field — NON-INVENT).
      '#idmp-scrub.bloom .scrubdot{width:auto;height:auto;border-radius:10px;padding:3px 9px;font-size:11px;' +
        'color:#cdd6e4;white-space:nowrap;line-height:1.2;}' +
      '#idmp-scrub.bloom .scrubdot.on{color:#1a1205;font-weight:600;}' +
      // Mobile coexistence (§A bottom pill dock + §B scrubber): the scrubber owns the very bottom in-flow; lift
      // the fixed pill dock to sit directly ABOVE it (only when the scrubber is showing).
      '@media (max-width:760px){body.idmp-has-scrub #idmp-pillbar{bottom:28px;}}';
    document.head.appendChild(s);
  }

  window.IdmpHistory = { push: push, registerRestore: registerRestore, undo: undo, redo: redo,
    render: render, clear: clear, list: list };
})();
