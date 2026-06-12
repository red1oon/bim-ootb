/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * idmp_history.js — the per-page "Z" micro-timeline for idempiere.html (HISTORY_KNOB_DIAL.md).
 *
 * A thin bar pinned at the bottom (under #idmp-status) recording the SEMANTIC navigation of a session,
 * working ACROSS the iDempiere window tabs: a moment = {window opened, AD-tab switched, record selected}.
 * The KNOB/depth dial is SCRAPPED — the bar is now just `‹ dots ›`: the arrows step the read-only cursor
 * older/newer, each dot is a clickable jump, hover = the action name. Click a dot = restore that view,
 * READ-ONLY (re-open window/tab + re-select record; NEVER mutate the kernel op-log).
 *
 * FOCUS model (§3.4): the bar is focusable — a blue left edge shows it holds focus, ←/→ step ONLY then
 * (otherwise the arrows belong to whatever panel is focused); Tab reaches it. The cross-page "World"
 * history lives in the W pill overlay (common/whole_history.js), NOT here — this is page-only (§3.3).
 *
 * DETERMINISM (NON-INVENT): no Date.now/Math.random in the record path — a monotonic seq orders entries
 * and performance.now() drives ONLY the double-tap meter. Every chip label comes from a real record field.
 */
(function () {
  'use strict';

  var _hist = [];        // [{ seq, sig, kind, label, windowId, tabIdx, table, recordId, view }]
  var _idx = -1;         // current (gold) index; tail beyond it is the "forward" branch (truncated on new push)
  var _seq = 0;
  var _bloom = false;
  var _restoreFn = null, _warnedNoRestore = false;
  var _userHidden = false;   // the Z chip toggles the bar shut/open even when there IS history
  var _bar = null, _back = null, _fwd = null, _content = null;

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
              view: (m.view == null ? null : m.view) };   // §HISTORY_TAP: carry the stamped LOOK so restore re-applies it
    _hist.push(e); _idx = _hist.length - 1;
    // W1 (HISTORY_WHOLE_TIMELINE.md): ALSO mirror this moment into the ONE cross-page log — ADDITIVE,
    // best-effort, never replaces this local bar. ref = the page's own re-open key (read-only restore).
    try {
      if (typeof WholeHistory !== 'undefined' && WholeHistory.record) {
        WholeHistory.record({ page: 'idempiere', label: e.label, kind: 'nav', type: e.kind,
          ref: { window: e.windowId, tab: e.tabIdx, table: e.table, recordId: e.recordId, view: e.view } });
      }
    } catch (err) {}
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
    else if (!_warnedNoRestore) { _warnedNoRestore = true;
      console.warn('§IDMP-HIST no-restoreFn — host never called registerRestore(); the bar is display-only (CONSISTENCY_FINISH.md §K-4c)'); }
    render();
    console.log('§IDMP-HIST go idx=' + _idx + ' label="' + (e ? e.label : '') + '" opLogMutated=NO');
  }
  // READ-ONLY steps (re-open window/tab/record via _restoreFn) — return the landed moment; null at the ends.
  // NEVER mutates the kernel op-log (the ERP scrubber is read-only by contract).
  function undo() { if (_idx > 0) { _go(_idx - 1); var e = _hist[_idx]; return { idx: _idx, label: e ? e.label : '' }; } return null; }
  function redo() { if (_idx < _hist.length - 1) { _go(_idx + 1); var e = _hist[_idx]; return { idx: _idx, label: e ? e.label : '' }; } return null; }
  function canStep() { return { back: _idx > 0, front: _idx < _hist.length - 1 }; }

  function _ensureBar() {
    if (_bar) return _bar;
    _injectStyle();
    _bar = document.createElement('div');
    _bar.id = 'idmp-scrub';
    _bar.tabIndex = 0;                           // focusable → Tab reaches it, ←/→ step only while focused
    _bar.title = 'History — ‹ older · newer › (click a dot to jump · ←/→ when focused)';
    // ‹ (older) · dots · › (newer) — the arrows walk the read-only cursor, never the op-log.
    _back = document.createElement('button'); _back.className = 'scrubarrow'; _back.id = 'idmp-scrub-back';
    _back.title = 'Older (←)'; _back.innerHTML = '‹';
    _back.addEventListener('click', function (ev) { ev.stopPropagation(); undo(); });
    _content = document.createElement('div'); _content.id = 'idmp-scrub-content';
    _fwd = document.createElement('button'); _fwd.className = 'scrubarrow'; _fwd.id = 'idmp-scrub-fwd';
    _fwd.title = 'Newer (→)'; _fwd.innerHTML = '›';
    _fwd.addEventListener('click', function (ev) { ev.stopPropagation(); redo(); });
    _bar.appendChild(_back); _bar.appendChild(_content); _bar.appendChild(_fwd);

    // FOCUS model (§3.4): blue left edge while focused; arrow keys handled HERE so they only fire when the
    // bar (or a dot inside it) holds focus — otherwise they go to whatever panel is focused.
    _bar.addEventListener('focusin', function () { _bar.classList.add('focused'); });
    _bar.addEventListener('focusout', function () { _bar.classList.remove('focused'); });
    _bar.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); undo(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); redo(); }
    });

    var main = document.getElementById('idmp-main') || document.body;
    main.appendChild(_bar);                                   // in-flow, after #idmp-status (under it)
    // double-tap anywhere on the bar (except a dot/arrow) blooms the dots into labelled chips.
    var _last = 0;
    _bar.addEventListener('click', function (ev) {
      if (ev.target.closest && (ev.target.closest('.scrubdot') || ev.target.closest('.scrubarrow'))) return;
      var now = performance.now();
      if (now - _last < 320) { _bloom = !_bloom; render(); _last = 0; console.log('§IDMP-HIST bloom=' + _bloom); }
      else _last = now;
    });
    _bar.addEventListener('dblclick', function (ev) {
      if (ev.target.closest && (ev.target.closest('.scrubdot') || ev.target.closest('.scrubarrow'))) return;
      _bloom = !_bloom; render(); console.log('§IDMP-HIST bloom=' + _bloom);
    });
    return _bar;
  }

  function render() {
    _ensureBar();
    var has = _hist.length > 0 && !_userHidden;
    document.body.classList.toggle('idmp-has-scrub', has);    // mobile: lifts the bottom pill dock above the strip
    if (!has) { _bar.classList.remove('show'); return; }
    _bar.classList.add('show');
    _bar.classList.toggle('bloom', _bloom);

    // NAV dots — the restorable backbone. Click any dot to jump (gold = current); hover = the action; ‹/›
    // step older/newer; double-tap blooms chips. [[feedback_pill_icon_consistency]]
    var h = '<div class="scrubline" id="idmp-scrubline">';
    _hist.forEach(function (e, i) {
      h += '<div class="scrubdot' + (i === _idx ? ' on' : '') + '" data-i="' + i + '" data-kind="' + e.kind +
        '" title="' + (i + 1) + '. ' + _esc(e.label) + '">' + (_bloom ? _esc(e.label) : '') + '</div>';
    });
    h += '</div>';
    _content.innerHTML = h;

    var cs = canStep();
    if (_back) _back.style.opacity = cs.back ? '1' : '0.3';
    if (_fwd) _fwd.style.opacity = cs.front ? '1' : '0.3';
    console.log('§IDMP-HIST render dots=' + _hist.length + ' idx=' + _idx);

    Array.prototype.forEach.call(_content.querySelectorAll('.scrubdot'), function (d) {
      d.addEventListener('click', function (ev) { ev.stopPropagation(); _go(+d.getAttribute('data-i')); });
    });
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function clear() { _hist = []; _idx = -1; _bloom = false; render(); }
  function list() { return _hist.map(function (e) { return { kind: e.kind, label: e.label }; }); }
  // The Z chip (W pill drawer) toggles the bar visible/hidden even when there IS history.
  function toggleBar() { _userHidden = !_userHidden; render(); console.log('§IDMP-HIST toggleBar hidden=' + _userHidden); }

  function _injectStyle() {
    if (document.getElementById('idmp-scrub-style')) return;
    var s = document.createElement('style');
    s.id = 'idmp-scrub-style';
    s.textContent =
      '#idmp-scrub{display:none;flex:0 0 auto;align-items:center;gap:6px;height:28px;padding:0 8px;' +
        'background:#0f1420;border-top:1px solid rgba(255,255,255,0.08);overflow:hidden;' +
        'border-left:3px solid transparent;outline:none;transition:border-color .12s,box-shadow .12s;}' +
      '#idmp-scrub.show{display:flex;}' +
      '#idmp-scrub.focused{border-left-color:#6c9fff;box-shadow:inset 3px 0 10px -6px #6c9fff;}' +   // §3.4 focus = blue left edge
      '#idmp-scrub .scrubarrow{flex:0 0 auto;width:24px;height:20px;line-height:1;font-size:16px;cursor:pointer;' +
        'color:#9aa4b8;background:transparent;border:none;border-radius:4px;padding:0;}' +
      '#idmp-scrub .scrubarrow:hover{color:#6c9fff;background:rgba(108,159,255,0.12);}' +
      '#idmp-scrub-content{display:flex;align-items:center;flex:1;min-width:0;overflow:hidden;}' +
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
      // Mobile coexistence (§A bottom pill dock + the scrubber). The §A pill dock stays FLUSH at bottom:0 and
      // the scrubber becomes a fixed strip sitting directly ABOVE it (~53px pill-dock height).
      '@media (max-width:760px){' +
        '#idmp-scrub.show{position:fixed;left:0;right:0;bottom:54px;z-index:1190;height:28px;}' +    // 53px dock + 1px gap
        'body.idmp-has-scrub #idmp-content{padding-bottom:90px;}' +    // clear pills(53)+scrubber(28)+gap
      '}';
    document.head.appendChild(s);
  }

  window.IdmpHistory = { push: push, registerRestore: registerRestore, undo: undo, redo: redo,
    render: render, clear: clear, list: list, toggleBar: toggleBar, canStep: canStep };
})();
