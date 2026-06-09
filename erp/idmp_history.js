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

  // ── §HISTORY_KNOB (HISTORY_TAP_TO_IDEMPIERE.md §KNOB) — the breadth dial on the ERP bar ───────────
  // The nav dots (window/tab/record) are the restorable backbone. The KNOB surfaces the sniffer's
  // §-stream DOC EVENTS at a dial-able breadth (off → low milestones → mid +doc-changes/nav → high
  // +lenses → max), filtered by the SHARED HistoryTap STOPS. PRESS=richness reuses the existing bloom
  // (dot→chip); thumbnail (3rd level) stays deferred per HISTORY_PERSIST_RECALL §LOCKED-5.
  var KNOB_STOPS = ['off', 'low', 'mid', 'high', 'max'];
  var _knob = 'mid';
  try { var k = localStorage.getItem('idmp.hist.knob'); if (k && KNOB_STOPS.indexOf(k) >= 0) _knob = k; } catch (e) {}
  // Category of a doc-event §-tag → tick colour (milestone=gold · change=blue · nav/aid=grey).
  var _EVT_MILESTONE = { KERNEL_OP: 1, POSTED: 1, PCLOSE: 1, SIGN: 1 };
  var _EVT_CHANGE = { CRUD: 1, RULE: 1, AD_DATA: 1 };
  function _evtClass(tag) { return _EVT_MILESTONE[tag] ? 'ev-milestone' : (_EVT_CHANGE[tag] ? 'ev-change' : 'ev-nav'); }
  function _setKnob(level) {
    if (KNOB_STOPS.indexOf(level) < 0) return;
    _knob = level;
    try { localStorage.setItem('idmp.hist.knob', level); } catch (e) {}
    if (window.HistoryTap && HistoryTap.setKnob && level !== 'off') HistoryTap.setKnob(level);  // off = display-gate only
    console.log('§IDMP-HIST knob=' + level + ' (doc-events ' + (level === 'off' ? 'hidden' : 'breadth=' + level) + ')');
    render();
  }
  function _stepKnob() { _setKnob(KNOB_STOPS[(KNOB_STOPS.indexOf(_knob) + 1) % KNOB_STOPS.length]); }   // tap = widen (wraps)
  // The knob-filtered doc-event crumbs to show (last N; HistoryTap already breadth-filters at the set level).
  function _docEvents() {
    if (_knob === 'off' || !window.HistoryTap || !HistoryTap.history) return [];
    return HistoryTap.history().slice(-30);
  }

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
              windowId: m.windowId, tabIdx: m.tabIdx, table: m.table || null, recordId: (m.recordId == null ? null : m.recordId),
              view: (m.view == null ? null : m.view) };   // §HISTORY_TAP: carry the stamped LOOK (search/clean) so restore re-applies it
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

    // KNOB — 4-segment breadth dial (glyph-free; tap = widen off→low→mid→high→max). Filled bars = level.
    var ki = KNOB_STOPS.indexOf(_knob), kn = '<div class="scrubknob" title="History depth: ' + _knob +
      ' — tap to widen (off→low→mid→high→max)">';
    for (var s = 1; s <= 4; s++) kn += '<i class="kbar' + (s <= ki ? ' on' : '') + '"></i>';
    kn += '</div>';

    // NAV dots — the restorable backbone. Click any dot to jump (gold = current); double-tap blooms chips.
    // [[feedback_pill_icon_consistency]]
    var h = kn + '<div class="scrubline" id="idmp-scrubline">';
    _hist.forEach(function (e, i) {
      h += '<div class="scrubdot' + (i === _idx ? ' on' : '') + '" data-i="' + i + '" data-kind="' + e.kind +
        '" title="' + (i + 1) + '. ' + _esc(e.label) + '">' + (_bloom ? _esc(e.label) : '') + '</div>';
    });
    h += '</div>';

    // DOC-EVENT strip — the sniffer's §-stream at the dialled breadth (display-only context, not restore
    // moments): milestone=gold (POSTED/PCLOSE/KERNEL_OP) · change=blue (CRUD/RULE) · nav/aid=grey.
    var evs = _docEvents();
    if (_knob !== 'off') {
      h += '<div class="scrubsep"></div><div class="scrubevents" title="doc events @ ' + _knob + '">';
      evs.forEach(function (e) {
        h += '<div class="scrubev ' + _evtClass(e.tag) + '" title="' + _esc(e.tag + (e.label ? ' ' + e.label : '')) +
          '">' + (_bloom ? _esc(e.tag) : '') + '</div>';
      });
      h += '</div>';
    }
    _bar.innerHTML = h;
    console.log('§IDMP-HIST render dots=' + _hist.length + ' knob=' + _knob + ' docEvents=' + evs.length);

    var knob = _bar.querySelector('.scrubknob');
    if (knob) knob.addEventListener('click', function (ev) { ev.stopPropagation(); _stepKnob(); });
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
      // §HISTORY_KNOB — 4-segment breadth dial (no glyphs; fan of rising bars, filled = current level).
      '#idmp-scrub .scrubknob{flex:0 0 auto;display:flex;align-items:flex-end;gap:2px;height:16px;cursor:pointer;padding:0 2px;}' +
      '#idmp-scrub .scrubknob .kbar{width:3px;border-radius:1px;background:rgba(154,164,184,0.30);}' +
      '#idmp-scrub .scrubknob .kbar:nth-child(1){height:5px;}#idmp-scrub .scrubknob .kbar:nth-child(2){height:8px;}' +
      '#idmp-scrub .scrubknob .kbar:nth-child(3){height:11px;}#idmp-scrub .scrubknob .kbar:nth-child(4){height:14px;}' +
      '#idmp-scrub .scrubknob .kbar.on{background:#6c9fff;}' +
      '#idmp-scrub .scrubknob:hover .kbar{background:rgba(108,159,255,0.65);}' +
      // divider between the restorable nav backbone and the doc-event context strip.
      '#idmp-scrub .scrubsep{flex:0 0 auto;width:1px;height:16px;background:rgba(255,255,255,0.12);margin:0 2px;}' +
      // doc-event ticks — squares (distinct from the round nav dots); colour by category; bloom shows the §tag.
      '#idmp-scrub .scrubevents{display:flex;align-items:center;gap:6px;flex:0 1 auto;overflow-x:auto;overflow-y:hidden;height:100%;}' +
      '#idmp-scrub .scrubevents::-webkit-scrollbar{height:0;}' +
      '#idmp-scrub .scrubev{flex:0 0 auto;width:7px;height:7px;border-radius:2px;background:rgba(154,164,184,0.45);}' +
      '#idmp-scrub .scrubev.ev-milestone{background:#ffd479;}' +
      '#idmp-scrub .scrubev.ev-change{background:#6c9fff;}' +
      '#idmp-scrub.bloom .scrubev{width:auto;height:auto;border-radius:8px;padding:2px 7px;font-size:10px;' +
        'color:#cdd6e4;white-space:nowrap;}' +
      // Mobile coexistence (§A bottom pill dock + §B scrubber). Spec §B stack order: content / status / scrubber /
      // pills(very bottom). So the §A pill dock stays FLUSH at bottom:0 and the scrubber becomes a fixed strip
      // sitting directly ABOVE it (~52px pill-dock height). Desktop keeps the scrubber in-flow under #idmp-status.
      '@media (max-width:760px){' +
        '#idmp-scrub.show{position:fixed;left:0;right:0;bottom:54px;z-index:1190;height:28px;}' +    // 53px dock + 1px gap
        'body.idmp-has-scrub #idmp-content{padding-bottom:90px;}' +    // clear pills(53)+scrubber(28)+gap
      '}';
    document.head.appendChild(s);
  }

  window.IdmpHistory = { push: push, registerRestore: registerRestore, undo: undo, redo: redo,
    render: render, clear: clear, list: list, setKnob: _setKnob, getKnob: function () { return _knob; } };
  if (window.HistoryTap && HistoryTap.setKnob && _knob !== 'off') HistoryTap.setKnob(_knob);   // sync shared breadth at load
})();
