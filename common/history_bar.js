// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// common/history_bar.js — the ONE shared history/undo-redo timeline bar, app-agnostic.
// HISTORY_SCRUB_FIX §CONTRACT §4b: this module OWNS ~95% (dot-line + bloom UI, the significance
// gate + 3-state depth toggle + OFF, persistence, undo/redo/jump, coalesce, cross-tab sync). Each
// app SUPPLIES only, via configure(): (a) push() calls wired onto its own commit path, (b) one
// restore(entry,forward) — only each app can rebuild its own state, (c) its significant types
// (profiles). So the viewer AND every ERP page get an IDENTICAL bar by including this one file.
//
// An entry (what an app push()es):
//   { bucket:'op'|'view',   // which gate dimension this qualifies under
//     kind:'op'|'view'|'pick', // render shape: 'op'=square dot, view/pick=round dot
//     type:<opType|viewKind>,  // the significance key
//     label, readonly:bool,    // readonly → restore shows state (no model mutation)
//     sigKey, ...app fields }  // sigKey = coalesce signature
window.HistoryBar = (function () {
  'use strict';

  var _stream = [];        // the merged stream (this app's events)
  var _cursor = -1;        // index of the most-recently-APPLIED entry; tail (>cursor) is undone
  var _seq = 0;            // monotonic tiebreak for same-ms timestamps
  var _suppress = false;   // true while WE drive a restore — stops re-recording
  var _bloom = false;      // double-tap the BAR → dots bloom into labelled chips
  var _opened = false;
  var COALESCE_MS = 700;
  var GOLD = '#ffd479';

  // ── App-supplied config (configure()) ─────────────────────────────────
  var _cfg = {
    source: 'app',
    mountHostId: null,                       // dock target id; absent → fixed bottom-center
    profiles: { all: {}, doc: {} },          // { all|doc: { bucket: { type:true } } }
    depthKey: 'bim.hist.depth',
    defaultDepth: function () { return 'all'; },
    restore: function () {},                  // restore(entry|null, forward) — app rebuilds its state
    afterApply: function () {},               // afterApply(when) — post undo/redo hook (e.g. chain check)
    iconFn: function () { return null; },     // iconFn(entry) → ICONS name | null
    sharedKey: 'bim.docHistory',             // app-wide cross-tab log
    channel: 'bim_history',
    docTypes: null                            // {type:true} whitelist that mirrors to the shared log
  };
  var _depth = 'all';
  var _configured = false;

  function _now() { return (typeof Date !== 'undefined') ? Date.now() : 0; }
  function _on() { return _depth !== 'off'; }

  function configure(opts) {
    for (var k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) _cfg[k] = opts[k]; }
    // depth: persisted choice wins; else the app's (device-aware) default.
    try { var d = localStorage.getItem(_cfg.depthKey); _depth = (d === 'all' || d === 'doc' || d === 'off') ? d : _cfg.defaultDepth(); }
    catch (e) { _depth = _cfg.defaultDepth(); }
    if (!_configured) { _wireKeyboard(); _wireCrossTab(); _configured = true; }
    console.log('§HIST_CONFIGURE source=' + _cfg.source + ' depth=' + _depth + ' host=' + (_cfg.mountHostId || 'body'));
  }

  // ── Significance gate (per active depth profile) ──────────────────────
  function significant(bucket, type, label) {
    if (_depth === 'off') {
      console.log('§HIST_DROP source=' + bucket + ' type=' + type + ' reason=off profile=off label="' + (label || '') + '"');
      return false;
    }
    var prof = _cfg.profiles[_depth] || _cfg.profiles.all || {};
    var ok = !!(prof[bucket] && prof[bucket][type]);
    if (!ok) {
      console.log('§HIST_DROP source=' + bucket + ' type=' + type +
        ' reason=not-significant profile=' + _depth + ' label="' + (label || '') + '"');
    }
    return ok;
  }

  function _sig(entry) { return entry.sigKey || (entry.kind + ':' + (entry.label || '')); }
  function _isDoc(entry) {
    if (_cfg.docTypes) return !!_cfg.docTypes[entry.type];
    var doc = _cfg.profiles.doc || {};
    return !!(doc[entry.bucket] && doc[entry.bucket][entry.type]);
  }

  // ── Record ────────────────────────────────────────────────────────────
  function push(entry) {
    if (!_on() || _suppress) return;
    if (!entry || !significant(entry.bucket, entry.type, entry.label)) return;
    if (entry.ts == null) entry.ts = _now();
    // Coalesce rapid same-signature repeats at the tip (no redo tail to break).
    if (_cursor >= 0 && _cursor === _stream.length - 1) {
      var tip = _stream[_cursor];
      if (_sig(tip) === _sig(entry) && (entry.ts - (tip.ts || 0)) <= COALESCE_MS) {
        for (var f in entry) { if (f !== 'seq' && Object.prototype.hasOwnProperty.call(entry, f)) tip[f] = entry[f]; }
        _render();
        console.log('§HIST_DROP source=' + entry.bucket + ' type=' + entry.type + ' reason=coalesced label="' + (entry.label || '') + '"');
        return;
      }
    }
    entry.seq = ++_seq;
    if (_cursor < _stream.length - 1) _stream.length = _cursor + 1; // fresh action discards redo tail
    _stream.push(entry);
    _cursor = _stream.length - 1;
    if (_isDoc(entry)) _mirror(entry);
    _render();
    console.log('§HIST_PUSH n=' + _stream.length + ' idx=' + _cursor + ' kind=' + entry.kind +
      ' label="' + (entry.label || '') + '"' + (entry.kind === 'op' ? ' opType=' + entry.type + ' opId=' + entry.opId : ''));
  }

  // Mirror a DOC-class event to the app-wide shared log (cross-tab) — the landing/other apps read it.
  function _mirror(entry) {
    try {
      var arr = JSON.parse(localStorage.getItem(_cfg.sharedKey) || '[]');
      arr.push({ ts: _now(), source: _cfg.source, type: entry.type, label: entry.label });
      if (arr.length > 50) arr = arr.slice(-50);
      localStorage.setItem(_cfg.sharedKey, JSON.stringify(arr));
      try { new BroadcastChannel(_cfg.channel).postMessage('sync'); } catch (e) {}
    } catch (e) {}
  }

  // ── Undo / Redo / Jump ────────────────────────────────────────────────
  function undo() {
    if (_cursor < 0) { console.log('§HIST_UNDO nothing'); return false; }
    var e = _stream[_cursor];
    _applyEntry(e, false);
    _cursor--;
    _render();
    console.log('§HIST_UNDO idx=' + (_cursor + 1) + '→' + _cursor + ' kind=' + e.kind + ' label="' + (e.label || '') + '"');
    _afterApply('undo');
    return true;
  }
  function redo() {
    if (_cursor >= _stream.length - 1) { console.log('§HIST_REDO nothing'); return false; }
    _cursor++;
    var e = _stream[_cursor];
    _applyEntry(e, true);
    _render();
    console.log('§HIST_REDO idx=' + (_cursor - 1) + '→' + _cursor + ' kind=' + e.kind + ' label="' + (e.label || '') + '"');
    _afterApply('redo');
    return true;
  }
  function jumpTo(idx) {
    if (idx < -1 || idx >= _stream.length) return;
    var guard = 0;
    while (_cursor > idx && guard++ < 999) undo();
    while (_cursor < idx && guard++ < 999) redo();
  }

  function _applyEntry(e, forward) {
    _suppress = true;
    try {
      if (e.readonly) {
        // Read-only (view-nav / pick): forward shows THIS state, backward shows the previous
        // restorable state (or clears). Never mutates the model.
        _cfg.restore(forward ? e : _findPrevRestorable(_cursor - 1), true);
      } else {
        _cfg.restore(e, forward); // model op — direction matters (flip the flag + replay)
      }
    } finally { _suppress = false; }
  }
  function _findPrevRestorable(idx) {
    for (var i = idx; i >= 0; i--) { if (_stream[i].readonly) return _stream[i]; }
    return null;
  }
  function _afterApply(when) { try { _cfg.afterApply(when); } catch (e) { console.warn('§HIST_AFTER_ERR', e); } }

  // ── Depth (§6) ────────────────────────────────────────────────────────
  function setDepth(d) {
    if (d !== 'all' && d !== 'doc' && d !== 'off') return;
    _depth = d;
    try { localStorage.setItem(_cfg.depthKey, d); } catch (e) {}
    _render();
    console.log('§HIST_DEPTH depth=' + _depth);
  }
  function cycleDepth() { setDepth(_depth === 'all' ? 'doc' : (_depth === 'doc' ? 'off' : 'all')); }
  function setEnabled(on) { setDepth(on ? 'all' : 'off'); }
  function isEnabled() { return _on(); }
  function getDepth() { return _depth; }

  function clear() { _stream = []; _cursor = -1; _render(); }
  function list() {
    var out = _stream.map(function (e, i) { return { i: i, kind: e.kind, label: e.label, applied: i <= _cursor }; });
    console.log('§HIST_LIST n=' + _stream.length + ' cursor=' + _cursor + ' ' +
      out.map(function (o) { return o.i + ':' + o.kind + (o.applied ? '*' : ''); }).join(' '));
    return out;
  }

  // ── The bar UI ────────────────────────────────────────────────────────
  var _bar = null, _back = null, _fwd = null, _marks = null, _off = null;
  var BTN = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
    'border-radius:6px;padding:6px 10px;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);min-width:36px;text-align:center';

  function _iconSvg(name, px) {
    var ic = name && window.ICONS && window.ICONS[name];
    var inner = ic ? ic.svg : '<rect x="4" y="4" width="16" height="16" rx="2"/>';
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">' + inner + '</svg>';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function _shortLabel(s) { s = String(s || ''); return s.length > 26 ? s.slice(0, 24) + '…' : s; }

  function _build() {
    if (_bar) return;
    _bar = document.createElement('div');
    _bar.id = 'universal-hist-btns';
    var host = _cfg.mountHostId ? document.getElementById(_cfg.mountHostId) : null;
    if (host) {
      _bar.style.cssText = 'display:none;gap:4px;align-items:center;max-width:74vw;z-index:25';
      host.appendChild(_bar);
    } else {
      _bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:25;display:none;gap:4px;align-items:center;max-width:74vw';
      document.body.appendChild(_bar);
    }
    _back = document.createElement('button');
    _back.id = 'hist-back'; _back.title = 'Undo (Ctrl+Z)'; _back.textContent = '↶'; _back.style.cssText = BTN;
    _back.addEventListener('pointerup', function (e) { e.stopPropagation(); undo(); });
    _fwd = document.createElement('button');
    _fwd.id = 'hist-fwd'; _fwd.title = 'Redo (Ctrl+Shift+Z)'; _fwd.textContent = '↷'; _fwd.style.cssText = BTN;
    _fwd.addEventListener('pointerup', function (e) { e.stopPropagation(); redo(); });
    _marks = document.createElement('div');
    _marks.id = 'hist-marks';
    _marks.style.cssText = 'display:flex;gap:3px;align-items:center;padding:0 4px;overflow-x:auto;max-width:60vw';
    _off = document.createElement('button');
    _off.id = 'hist-off'; _off.style.cssText = BTN + ';font-size:13px';
    _off.addEventListener('pointerup', function (e) { e.stopPropagation(); cycleDepth(); });
    _bar.appendChild(_back); _bar.appendChild(_fwd); _bar.appendChild(_marks); _bar.appendChild(_off);
    var _lastTap = 0; // §2 bloom: pointer double-tap (touch + mouse)
    _bar.addEventListener('pointerup', function () {
      var t = _now();
      if (t - _lastTap < 350) { _bloom = !_bloom; _lastTap = 0; _render(); console.log('§HIST_BLOOM ' + (_bloom ? 'on' : 'off')); }
      else _lastTap = t;
    });
    console.log('§HIST_BAR added host=' + (host ? _cfg.mountHostId : 'body'));
  }

  function open() { _opened = true; _build(); _render(); console.log('§HIST_OPEN'); }
  function toggleOpen() { if (_opened && _bar && _bar.style.display !== 'none') { _opened = false; _render(); } else open(); }

  function _dot(e, idx, applied, isCurrent) {
    var dot = document.createElement('button');
    var isRound = e.kind === 'view' || e.kind === 'pick';
    dot.title = e.label || ('step ' + (idx + 1));
    dot.style.cssText = 'width:9px;height:9px;padding:0;cursor:pointer;flex:0 0 auto;' +
      'border:1px solid ' + (isCurrent ? GOLD : 'rgba(79,195,247,0.6)') + ';' +
      'border-radius:' + (isRound ? '50%' : '2px') + ';' +
      'background:' + (isCurrent ? GOLD : (applied ? '#4fc3f7' : 'rgba(79,195,247,0.18)')) + ';' +
      (isCurrent ? 'box-shadow:0 0 6px ' + GOLD : '');
    dot.addEventListener('pointerup', function (ev) { ev.stopPropagation(); jumpTo(idx); });
    return dot;
  }
  function _chip(e, idx, applied, isCurrent) {
    var chip = document.createElement('button');
    chip.title = e.label || ('step ' + (idx + 1));
    var col = isCurrent ? GOLD : (applied ? '#4fc3f7' : 'rgba(79,195,247,0.7)');
    chip.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;cursor:pointer;' +
      'padding:3px 7px;border-radius:11px;font-size:11px;white-space:nowrap;' +
      'border:1px solid ' + (isCurrent ? GOLD : 'rgba(79,195,247,0.4)') + ';color:' + col + ';' +
      'background:rgba(20,35,60,' + (applied ? '0.85' : '0.5') + ');' + (isCurrent ? 'box-shadow:0 0 8px ' + GOLD : '');
    chip.innerHTML = _iconSvg(_cfg.iconFn(e), 13) + '<span>' + _esc(_shortLabel(e.label)) + '</span>';
    chip.addEventListener('pointerup', function (ev) { ev.stopPropagation(); jumpTo(idx); });
    return chip;
  }

  var _DEPTH_UI = {
    all: { g: '◉', c: '#4fc3f7', t: 'Recording: ALL — taps + nav + milestones (tap → DOC only)' },
    doc: { g: '◑', c: '#66bb6a', t: 'Recording: DOC only — the clean trail (tap → OFF)' },
    off: { g: '◯', c: '#888',    t: 'Recording: OFF (tap → ALL)' }
  };
  function _render() {
    if (!_bar) return;
    var du = _DEPTH_UI[_depth] || _DEPTH_UI.all;
    _off.textContent = du.g; _off.style.color = du.c; _off.title = du.t;
    var show = _opened;
    _bar.style.display = show ? 'flex' : 'none';
    if (!show) return;
    var hasSteps = _on() && _stream.length > 0;
    _back.style.display = hasSteps ? '' : 'none';
    _fwd.style.display = hasSteps ? '' : 'none';
    _marks.style.display = hasSteps ? 'flex' : 'none';
    _marks.innerHTML = '';
    if (!hasSteps) return;
    _back.style.opacity = (_cursor >= 0) ? '1' : '0.35';
    _fwd.style.opacity = (_cursor < _stream.length - 1) ? '1' : '0.35';
    var current = null;
    for (var i = 0; i < _stream.length; i++) {
      var e = _stream[i], applied = (i <= _cursor), isCurrent = (i === _cursor);
      var node = _bloom ? _chip(e, i, applied, isCurrent) : _dot(e, i, applied, isCurrent);
      if (isCurrent) current = node;
      _marks.appendChild(node);
    }
    if (current) { try { _marks.scrollLeft = current.offsetLeft - _marks.clientWidth / 2 + current.offsetWidth / 2; } catch (e3) {} }
  }

  // ── Keyboard + cross-tab ──────────────────────────────────────────────
  function _wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (!_on()) return;
      var key = (e.key || '').toLowerCase();
      if (e.ctrlKey && key === 'z' && !e.shiftKey) { e.preventDefault(); open(); undo(); }
      else if ((e.ctrlKey && key === 'z' && e.shiftKey) || (e.ctrlKey && key === 'y')) { e.preventDefault(); open(); redo(); }
    });
  }
  function _wireCrossTab() {
    try { var bc = new BroadcastChannel(_cfg.channel); bc.onmessage = function () { _render(); }; } catch (e) {}
    window.addEventListener('storage', function (e) { if (e.key === _cfg.sharedKey) _render(); });
  }

  return {
    configure: configure, push: push,
    undo: undo, redo: redo, jumpTo: jumpTo,
    setDepth: setDepth, cycleDepth: cycleDepth, getDepth: getDepth, setEnabled: setEnabled, isEnabled: isEnabled,
    clear: clear, open: open, toggleOpen: toggleOpen, list: list, significant: significant
  };
})();
