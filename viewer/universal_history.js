// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// universal_history.js — Implementing UNIVERSAL_HISTORY §WHAT TO BUILD — Witness: W-UHIST
// ONE universal history/undo-redo timeline that merges TWO streams in time order:
//   (1) MODEL ops — the signed kernel_ops log (grid moves, element place/pick, …). We are
//       READ-ONLY over it: undo/redo flips the existing `undone` flag via KernelOps.undoOp/
//       redoOp (NEVER row deletion) and dispatches the matching replay. The W-CHAIN is never
//       touched here, so verifyChain still passes after an undo (witnessed §HIST_CHAIN_OK).
//   (2) VIEW-nav moments — the Find-lens view-history (axis/group/item). navigate_find owns
//       the restore logic; it registers a callback and pushes its semantic moments to us.
// This RETIRES the old grid-only #undo-redo-btns and the find-only #find-viewhist-btns: there
// is now ONE bar, available across all panels, opened via the pill + a Help entry, with a
// persisted OFF-toggle (default ON). Ordering = wall-clock timestamp + a monotonic seq tiebreak.
// Spec: prompts/UNIVERSAL_HISTORY.md.
(function () {
  'use strict';

  // ── State — the merged stream ─────────────────────────────────────────
  // Each entry: { seq, ts, kind:'op'|'view', label, ... }
  //   op:   { opId, opType, undoable:bool, replay:{axis,label,from,to,cascade} }
  //   view: the navigate_find view entry verbatim (kind:'axis'|'group'|'item', tag,label,…)
  var _stream = [];
  var _cursor = -1;        // index of the most-recently-APPLIED entry; tail (>cursor) is undone
  var _seq = 0;            // monotonic tiebreak for same-ms timestamps
  var _viewRestore = null; // navigate_find's view-restore callback (idx-agnostic: takes the view entry)
  var _suppress = false;   // true while WE drive a model-op undo/redo — stops commitOp re-recording

  // ── §GATE: the ONE "events that matter" registry — tune curation HERE ──────
  // This is the single, centralised significance gate that BOTH streams pass through
  // before anything is recorded (UNIVERSAL_HISTORY §DESIGN DIRECTION). It is data-driven
  // and easy to tune by feel — change these tables, not the call sites.
  //
  //   MODEL side — qualifying kernel-op types (everything else is audit/bookkeeping and is
  //   DROPPED with a §-log, e.g. SESSION_START, GRID_DETECT, VIEW_FILTER, ELEMENT_PICK).
  //   COALESCE_MS folds rapid repeats of the SAME op-signature (e.g. a drag re-committing the
  //   same axis/label) into ONE entry instead of twenty.
  //
  //   VIEW side — qualifying Find-lens moments. axis/group/item QUALIFY; expands/hovers/
  //   camera micro-nudges never reach us (navigate_find only calls pushView for these three),
  //   but the gate still names them so curation lives in one place.
  var UNDOABLE_OPS = { 'GRID_MOVE': true, 'ELEMENT_PLACE': true }; // back-compat export

  // §6 RECORDING-DEPTH PROFILES — the gate consults ONE active profile (tune by feel HERE; a depth
  // toggle just SWAPS which profile, not a refactor). The history icon cycles the depth:
  //   BLUE 'all' — record EVERYTHING (ELEMENT_PICK + axis/group/item + milestones): replay exactly.
  //   GREEN 'doc' — record DOC-level events only (the clean trail); DROP taps + Find-nav.
  //   GREY 'off'  — record nothing.
  // §6b canonical buckets: ALL = picks + Find-nav + milestones; DOC = the "real items" only.
  var PROFILES = {
    all: {
      // ELEMENT_PICK (§1) + BUILDING_OPEN (§7) + Find-nav (axis/group/item) all qualify.
      op:   { 'GRID_MOVE': true, 'ELEMENT_PLACE': true, 'ELEMENT_PICK': true, 'BUILDING_OPEN': true },
      view: { 'axis': true, 'group': true, 'item': true }
    },
    doc: {
      // DOC whitelist (the viewer's "real items"): milestones + data mutations + design lifecycle.
      // DROP ELEMENT_PICK + axis/group/item (Find-nav) — the advanced "clean trail".
      op:   { 'GRID_MOVE': true, 'ELEMENT_PLACE': true, 'BUILDING_OPEN': true,
              'DESIGN_SAVE': true, 'DESIGN_OPEN': true, 'CAPTURE_4D': true, 'CLASH_SNAG': true },
      view: {} // Find-nav dropped in DOC mode
    }
  };
  var SIGNIFICANCE = PROFILES.all; // back-compat export — re-pointed at the active profile by setDepth
  var COALESCE_MS = 700; // rapid same-signature repeats inside this window fold into one entry

  var DEPTH_KEY = 'bim.universalHist.depth';
  var _depth = (function () {
    try { var d = localStorage.getItem(DEPTH_KEY); return (d === 'all' || d === 'doc' || d === 'off') ? d : 'all'; }
    catch (e) { return 'all'; } // default BLUE/all
  })();
  function _on() { return _depth !== 'off'; } // recording is on unless OFF

  // significant(event) → true if this event belongs on the timeline, per the ACTIVE depth profile.
  // event = { source:'op'|'view', type:<opType|viewKind>, label } . Logs every DROP (with profile).
  function significant(ev) {
    if (_depth === 'off') {
      console.log('§HIST_DROP source=' + ev.source + ' type=' + ev.type + ' reason=off profile=off label="' + (ev.label || '') + '"');
      return false;
    }
    var prof = PROFILES[_depth] || PROFILES.all;
    var ok = !!(prof[ev.source] && prof[ev.source][ev.type]);
    if (!ok) {
      console.log('§HIST_DROP source=' + ev.source + ' type=' + ev.type +
        ' reason=not-significant profile=' + _depth + ' label="' + (ev.label || '') + '"');
    }
    return ok;
  }

  function _now() { return (typeof Date !== 'undefined') ? Date.now() : 0; }

  // ── Recording ─────────────────────────────────────────────────────────
  // A short signature so rapid repeats of the "same" action coalesce (drag re-commits, etc.).
  function _sig(entry) {
    if (entry.kind === 'op') return 'op:' + entry.opType + ':' +
      (entry.replay && (entry.replay.axis + '/' + entry.replay.label) || '');
    // pick signature = the guid set → re-tapping the SAME element fast coalesces into one step.
    if (entry.kind === 'pick') return 'pick:' + ((entry.guids && entry.guids.join(',')) || entry.label || '');
    return 'view:' + (entry.view && (entry.view.kind + ':' + (entry.view.label || entry.view.axis)) || '');
  }

  // Common push: drops any redo tail (standard undo/redo), appends, advances cursor.
  // COALESCE: if the entry repeats the tip's signature within COALESCE_MS, fold into it
  // (update payload, keep one step) — §-logged, so the curation is never silent.
  function _push(entry) {
    if (!_on() || _suppress) return;
    if (entry.ts == null) entry.ts = _now();
    // Coalesce rapid same-signature repeats only when we're at the tip (no redo tail to break).
    if (_cursor >= 0 && _cursor === _stream.length - 1) {
      var tip = _stream[_cursor];
      if (_sig(tip) === _sig(entry) && (entry.ts - (tip.ts || 0)) <= COALESCE_MS) {
        // Keep the single step; absorb the newer payload so undo lands on the latest pose/view.
        if (entry.kind === 'op') tip.replay = entry.replay;
        else if (entry.kind === 'pick') tip.guids = entry.guids;
        else tip.view = entry.view;
        tip.ts = entry.ts; tip.label = entry.label;
        _render();
        console.log('§HIST_DROP source=' + entry.kind + ' type=' +
          (entry.opType || (entry.view && entry.view.kind)) +
          ' reason=coalesced label="' + (entry.label || '') + '"');
        return;
      }
    }
    entry.seq = ++_seq;
    // A fresh action after stepping back discards the redo tail.
    if (_cursor < _stream.length - 1) _stream.length = _cursor + 1;
    _stream.push(entry);
    _cursor = _stream.length - 1;
    _render();
    console.log('§HIST_PUSH n=' + _stream.length + ' idx=' + _cursor +
      ' kind=' + entry.kind + ' label="' + (entry.label || '') + '"' +
      (entry.kind === 'op' ? ' opType=' + entry.opType + ' opId=' + entry.opId : ''));
  }

  // Record a MODEL op the moment it is committed (called from the commitOp wrapper, below).
  // Passes through the ONE significance gate; non-significant ops are dropped (§-logged).
  function _recordOp(opId, opType, params, guids) {
    var label = _opLabel(opType, params);
    if (!significant({ source: 'op', type: opType, label: label })) return;
    // ELEMENT_PICK is a read-only SELECTION moment, not a model mutation. Record it as a view-
    // class 'pick' entry carrying the guid(s); restore re-lights it via the neutral A.focusElement
    // shape-mesh primitive (NOT a kernel flag-flip, NOT a Find replay). HISTORY_SCRUB_FIX §1.
    if (opType === 'ELEMENT_PICK') {
      var g = guids || (params && params.guids) || [];
      if (!Array.isArray(g)) g = [g];
      g = g.filter(Boolean);
      _push({ kind: 'pick', opId: opId, opType: opType, undoable: false,
        guids: g, label: label, params: params || {} });
      return;
    }
    _push({
      kind: 'op', opId: opId, opType: opType,
      undoable: true, label: label,
      replay: params || {}
    });
  }

  // Humanise an IFC class for a label: "IfcDoor" → "door", "IfcFlowTerminal" → "flow terminal".
  function _humanClass(cls) {
    if (!cls) return 'element';
    return String(cls).replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  function _opLabel(opType, p) {
    if (opType === 'GRID_MOVE') return 'Grid ' + (p && p.label ? p.label : '') + ' move';
    if (opType === 'ELEMENT_PLACE') return 'Place ' + ((p && (p.cls || p.name)) || 'element');
    if (opType === 'BUILDING_OPEN') return 'Opened ' + ((p && p.name) || 'building');
    // §1: label a pick by the ELEMENT, not the op — "merk H · door" (name + humanised class).
    if (opType === 'ELEMENT_PICK') return ((p && p.name) || 'element') + ' · ' + _humanClass(p && p.cls);
    return opType;
  }

  // VIEW-nav push — navigate_find calls this with its semantic view entry. We tag it kind:'view'
  // and remember the entry verbatim so restore can replay it through the registered callback.
  function pushView(v) {
    if (!_on()) return;
    var label = v.label || v.axis || 'view';
    // Same ONE gate as the model side — axis/group/item qualify; anything else is dropped (§-logged).
    if (!significant({ source: 'view', type: v.kind, label: label })) return;
    var e = { kind: 'view', view: v, label: label, ts: _now() };
    _push(e);
  }

  // navigate_find registers HOW to restore a view (replay _setTreeMode / _drillSelect + cam lerp).
  function registerViewRestore(fn) { _viewRestore = fn; }

  // ── Undo / Redo over the MERGED stream ────────────────────────────────
  // Undo: apply the inverse of the entry AT the cursor, then step the cursor back.
  function undo() {
    if (_cursor < 0) { console.log('§HIST_UNDO nothing'); return false; }
    var e = _stream[_cursor];
    _applyEntry(e, /*forward=*/false);
    _cursor--;
    _render();
    console.log('§HIST_UNDO idx=' + (_cursor + 1) + '→' + _cursor + ' kind=' + e.kind +
      ' label="' + (e.label || '') + '"');
    _chainCheck('undo');
    return true;
  }
  // Redo: step the cursor forward, then apply that entry.
  function redo() {
    if (_cursor >= _stream.length - 1) { console.log('§HIST_REDO nothing'); return false; }
    _cursor++;
    var e = _stream[_cursor];
    _applyEntry(e, /*forward=*/true);
    _render();
    console.log('§HIST_REDO idx=' + (_cursor - 1) + '→' + _cursor + ' kind=' + e.kind +
      ' label="' + (e.label || '') + '"');
    _chainCheck('redo');
    return true;
  }

  // Jump to an arbitrary step (click a dot): undo/redo until the cursor lands on idx.
  function jumpTo(idx) {
    if (idx < -1 || idx >= _stream.length) return;
    var guard = 0;
    while (_cursor > idx && guard++ < 999) undo();
    while (_cursor < idx && guard++ < 999) redo();
  }

  function _applyEntry(e, forward) {
    if (e.kind === 'op') {
      _applyOp(e, forward);
      return;
    }
    // Read-only entries (view-nav + element picks): forward shows THIS state, backward shows the
    // previous read-only state (or clears). Never mutates the model / the signed kernel chain.
    if (forward) {
      _restoreReadOnly(e);
    } else {
      _restoreReadOnly(_findPrevReadOnly(_cursor - 1)); // null → clears overlays
    }
  }

  // Restore a read-only entry's visual state. A 'pick' re-lights via the NEUTRAL A.focusElement
  // shape-mesh primitive (NOT Find — a tap and a Find drill are independent routes to the same
  // focus); a 'view' replays through navigate_find's registered callback. null → clear focus.
  function _restoreReadOnly(e) {
    var A = window.A || window.APP;
    if (!e) {
      if (A && A.clearFocusElement) A.clearFocusElement();
      else if (_viewRestore) _viewRestore(null);
      return;
    }
    if (e.kind === 'pick') {
      // A.focusElement lives in the lazily-loaded navigate module — ensure it's present, then focus.
      if (A && A.focusElement) A.focusElement(e.guids, { item: true });
      else if (A && A.loadNavigate) A.loadNavigate().then(function () { if (A.focusElement) A.focusElement(e.guids, { item: true }); });
      else console.warn('§HIST_RESTORE_NOFN A.focusElement missing');
    } else { // view
      if (_viewRestore) _viewRestore(e.view);
    }
  }

  // Walk back from idx to find the nearest read-only (view|pick) entry at/below it.
  function _findPrevReadOnly(idx) {
    for (var i = idx; i >= 0; i--) {
      if (_stream[i].kind === 'view' || _stream[i].kind === 'pick') return _stream[i];
    }
    return null;
  }

  // MODEL op apply: flips the kernel_ops `undone` flag (existing path, never row deletion) and
  // dispatches the visual replay. _suppress stops the commitOp wrapper from re-recording.
  function _applyOp(e, forward) {
    var A = window.A || window.APP;
    if (!A || !A.db || !window.KernelOps) return;
    _suppress = true;
    try {
      if (e.opType === 'GRID_MOVE') {
        var p = e.replay || {};
        if (forward) {
          // redo → re-mark this op NOT-undone (earliest undone) + apply to its `to` pose.
          var rop = KernelOps.redoOp(A.db);
          if (typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) {
            GridDrag.applyReplayedMove(p.axis, p.label, p.to, p.cascade, +1);
          }
        } else {
          // undo → mark this op undone (most-recent non-undone) + revert to its `from` pose.
          var uop = KernelOps.undoOp(A.db);
          if (typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) {
            GridDrag.applyReplayedMove(p.axis, p.label, p.from, p.cascade, -1);
          }
        }
      } else if (e.opType === 'ELEMENT_PLACE') {
        // No visual reverse wired yet — flip the flag so the chain/state stays consistent.
        if (forward) KernelOps.redoOp(A.db); else KernelOps.undoOp(A.db);
      }
      if (A.markDirty) A.markDirty();
    } finally { _suppress = false; }
  }

  // §HIST_CHAIN_OK — prove the signed kernel_ops chain still verifies after a model-op flip.
  function _chainCheck(when) {
    var A = window.A || window.APP;
    if (!A || !A.db || !window.KernelOps || !KernelOps.verifyChain) return;
    KernelOps.sealChain(A.db).then(function () {
      return KernelOps.verifyChain(A.db);
    }).then(function (res) {
      console.log('§HIST_CHAIN_OK after=' + when + ' ok=' + (res && res.ok) +
        ' len=' + (res ? res.len : '?'));
    }).catch(function (err) {
      console.warn('§HIST_CHAIN_ERR after=' + when + ' ' + (err && err.message));
    });
  }

  // ── Recording-depth (§6): all → doc → off, cycled on the history icon ──────────────────
  function setDepth(d) {
    if (d !== 'all' && d !== 'doc' && d !== 'off') return;
    _depth = d;
    SIGNIFICANCE = PROFILES[d] || PROFILES.all; // keep the back-compat export on the active profile
    try { localStorage.setItem(DEPTH_KEY, d); } catch (e) {}
    _render();
    console.log('§HIST_DEPTH depth=' + _depth);
  }
  function cycleDepth() { setDepth(_depth === 'all' ? 'doc' : (_depth === 'doc' ? 'off' : 'all')); }
  // Back-compat: the old on/off API maps onto the depth model (on = all, off = off).
  function setEnabled(on) { setDepth(on ? 'all' : 'off'); }
  function isEnabled() { return _on(); }

  // Clear the whole timeline (e.g. on building switch). Kernel_ops itself is untouched.
  function clear() { _stream = []; _cursor = -1; _render(); }

  // Debug/witness snapshot of the merged stream.
  function list() {
    var out = _stream.map(function (e, i) {
      return { i: i, kind: e.kind, label: e.label, applied: i <= _cursor };
    });
    console.log('§HIST_LIST n=' + _stream.length + ' cursor=' + _cursor + ' ' +
      out.map(function (o) { return o.i + ':' + o.kind + (o.applied ? '*' : ''); }).join(' '));
    return out;
  }

  // ── The ONE universal bar — bottom-center, docked UNDER the status bar (§3) ────────────
  var _bar = null, _back = null, _fwd = null, _marks = null, _off = null;
  var _bloom = false;        // §2: double-tap the BAR → dots bloom into labelled chips
  var GOLD = '#ffd479';      // current step (glassbowl #scrub palette)
  var BTN = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
    'border-radius:6px;padding:6px 10px;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);' +
    'min-width:36px;text-align:center';

  // §2 chip icon by WHAT (not how): SINGLE element step → its discipline icon; GROUP/scope step
  // → the search magnifier (Find narrows scope). Reuses panels.js' global ICONS registry.
  var _DISC_ICON = { STR: 'discSTR', ARC: 'discARC', MEP: 'discMEP', FP: 'discFP', ELEC: 'discELEC', ACMV: 'discACMV', PLMB: 'discPLMB' };
  function _stepIcon(e) {
    if (e.kind === 'pick') return _DISC_ICON[String((e.params && e.params.disc) || '').toUpperCase()] || null; // null → generic box
    if (e.opType === 'BUILDING_OPEN') return 'home'; // milestone
    return 'search'; // group/scope (view) → magnifier; NEVER on a single-element chip
  }
  function _iconSvg(name, px) {
    var ic = name && window.ICONS && window.ICONS[name];
    var inner = ic ? ic.svg : '<rect x="4" y="4" width="16" height="16" rx="2"/>'; // generic box fallback
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">' + inner + '</svg>';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function _shortLabel(s) { s = String(s || ''); return s.length > 26 ? s.slice(0, 24) + '…' : s; }

  function _build() {
    if (_bar) return;
    _bar = document.createElement('div');
    _bar.id = 'universal-hist-btns';
    var host = document.getElementById('status-bar-wrap');
    // §3 PLACEMENT: dock as ONE row directly under the status bar (status + scrub = one unit).
    // In-flow inside #status-bar-wrap (now a flex column); fall back to fixed bottom-center if absent.
    if (host) {
      _bar.style.cssText = 'display:none;gap:4px;align-items:center;max-width:74vw;z-index:25';
      host.appendChild(_bar);
    } else {
      _bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
        'z-index:25;display:none;gap:4px;align-items:center;max-width:74vw';
      document.body.appendChild(_bar);
    }
    _back = document.createElement('button');
    _back.id = 'hist-back'; _back.title = 'Undo (Ctrl+Z)'; _back.textContent = '↶';
    _back.style.cssText = BTN;
    _back.addEventListener('pointerup', function (e) { e.stopPropagation(); undo(); });
    _fwd = document.createElement('button');
    _fwd.id = 'hist-fwd'; _fwd.title = 'Redo (Ctrl+Shift+Z)'; _fwd.textContent = '↷';
    _fwd.style.cssText = BTN;
    _fwd.addEventListener('pointerup', function (e) { e.stopPropagation(); redo(); });
    _marks = document.createElement('div');
    _marks.id = 'hist-marks';
    // §2: horizontal scroll so the dot-line / chips never overflow; gold current auto-scrolls in.
    _marks.style.cssText = 'display:flex;gap:3px;align-items:center;padding:0 4px;overflow-x:auto;max-width:60vw';
    _off = document.createElement('button');
    _off.id = 'hist-off'; _off.style.cssText = BTN + ';font-size:13px';
    _off.addEventListener('pointerup', function (e) { e.stopPropagation(); cycleDepth(); }); // §6: all→doc→off
    _bar.appendChild(_back); _bar.appendChild(_fwd);
    _bar.appendChild(_marks); _bar.appendChild(_off);
    // §2 BLOOM: double-tap the BAR itself (empty area — dots/buttons stopPropagation) toggles chips.
    // Pointer-based double-tap works on touch AND mouse (dblclick doesn't fire on touch).
    var _lastTap = 0;
    _bar.addEventListener('pointerup', function () {
      var t = _now();
      if (t - _lastTap < 350) { _bloom = !_bloom; _lastTap = 0; _render(); console.log('§HIST_BLOOM ' + (_bloom ? 'on' : 'off')); }
      else _lastTap = t;
    });
    console.log('§HIST_BAR added host=' + (host ? 'status-bar-wrap' : 'body'));
  }

  // _open: explicit user request to SHOW the bar (the pill icon). Off-toggle still wins.
  var _opened = false;
  function open() { _opened = true; _build(); _render(); console.log('§HIST_OPEN'); }
  function toggleOpen() { if (_opened && _bar && _bar.style.display !== 'none') { _opened = false; _render(); } else open(); }

  // One timeline step → a dot (collapsed) or a labelled chip (bloomed). Gold = current.
  function _dot(e, idx, applied, isCurrent) {
    var dot = document.createElement('button');
    var isRound = e.kind === 'view' || e.kind === 'pick'; // view/pick = round, model-op = square
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
      'background:rgba(20,35,60,' + (applied ? '0.85' : '0.5') + ');' +
      (isCurrent ? 'box-shadow:0 0 8px ' + GOLD : '');
    chip.innerHTML = _iconSvg(_stepIcon(e), 13) + '<span>' + _esc(_shortLabel(e.label)) + '</span>';
    chip.addEventListener('pointerup', function (ev) { ev.stopPropagation(); jumpTo(idx); });
    return chip;
  }

  // §6 depth glyph/colour on the history icon: BLUE all · GREEN doc · GREY off.
  var _DEPTH_UI = {
    all: { g: '◉', c: '#4fc3f7', t: 'Recording: ALL — taps + nav + milestones (tap → DOC only)' },
    doc: { g: '◑', c: '#66bb6a', t: 'Recording: DOC only — the clean trail (tap → OFF)' },
    off: { g: '◯', c: '#888',    t: 'Recording: OFF (tap → ALL)' }
  };
  function _render() {
    if (!_bar) return;
    var du = _DEPTH_UI[_depth] || _DEPTH_UI.all;
    _off.textContent = du.g; _off.style.color = du.c; _off.title = du.t;
    // Bar visible whenever opened (so the depth toggle stays reachable even when OFF).
    var show = _opened;
    _bar.style.display = show ? 'flex' : 'none';
    if (!show) return;
    var recording = _on();
    var hasSteps = recording && _stream.length > 0; // OFF → just the depth toggle, no arrows/dots
    _back.style.display = hasSteps ? '' : 'none';
    _fwd.style.display = hasSteps ? '' : 'none';
    _marks.style.display = hasSteps ? 'flex' : 'none';
    _marks.innerHTML = '';
    if (!hasSteps) return; // OFF or empty → bar shows only the depth toggle
    _back.style.opacity = (_cursor >= 0) ? '1' : '0.35';
    _fwd.style.opacity = (_cursor < _stream.length - 1) ? '1' : '0.35';
    var current = null;
    for (var i = 0; i < _stream.length; i++) {
      var e = _stream[i], applied = (i <= _cursor), isCurrent = (i === _cursor);
      var node = _bloom ? _chip(e, i, applied, isCurrent) : _dot(e, i, applied, isCurrent);
      if (isCurrent) current = node;
      _marks.appendChild(node);
    }
    // §2: keep the gold current step in view (scroll the strip, not the page).
    if (current) { try { _marks.scrollLeft = current.offsetLeft - _marks.clientWidth / 2 + current.offsetWidth / 2; } catch (e3) {} }
  }

  // ── commitOp wrapper — record EVERY model op as it lands (mirror scene.js's wrap) ──────
  // Wrapped at load. Chained after any pre-existing wrap so scene.js's button refresh still runs.
  (function wrapCommit() {
    if (!window.KernelOps || !KernelOps.commitOp) {
      // kernel_ops not loaded yet — retry shortly (script order safety).
      setTimeout(wrapCommit, 200);
      return;
    }
    if (KernelOps.__uhistWrapped) return;
    var orig = KernelOps.commitOp;
    KernelOps.commitOp = function (db, opType, params, guids) {
      var id = orig.apply(this, arguments);
      // params may be a JSON string (some callers stringify) or an object — normalise.
      var p = params;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
      // guids (4th arg) carry the element(s) for an ELEMENT_PICK read-only restore.
      try { _recordOp(id, opType, p, guids); } catch (e) { console.warn('§HIST_REC_ERR', e); }
      return id;
    };
    KernelOps.__uhistWrapped = true;
    console.log('§HIST_WRAP commitOp wrapped');
  })();

  // ── Keyboard: Ctrl+Z / Ctrl+Shift+Z route here universally ───────────────
  document.addEventListener('keydown', function (e) {
    if (!_on()) return;
    var key = (e.key || '').toLowerCase();
    if (e.ctrlKey && key === 'z' && !e.shiftKey) { e.preventDefault(); open(); undo(); }
    else if ((e.ctrlKey && key === 'z' && e.shiftKey) || (e.ctrlKey && key === 'y')) { e.preventDefault(); open(); redo(); }
  });

  window.UniversalHistory = {
    pushView:            pushView,
    registerViewRestore: registerViewRestore,
    undo:                undo,
    redo:                redo,
    jumpTo:              jumpTo,
    setEnabled:          setEnabled,
    isEnabled:           isEnabled,
    setDepth:            setDepth,    // §6: 'all' | 'doc' | 'off'
    cycleDepth:          cycleDepth,
    getDepth:            function () { return _depth; },
    PROFILES:            PROFILES,    // data-driven depth profiles — edit to tune "what matters"
    clear:               clear,
    open:                open,
    toggleOpen:          toggleOpen,
    list:                list,
    significant:         significant,   // the ONE curation gate — call to test/tune
    SIGNIFICANCE:        SIGNIFICANCE,  // data-driven registry — edit to tune "what matters"
    UNDOABLE_OPS:        UNDOABLE_OPS
  };
  console.log('§UNIVERSAL_HISTORY_LOADED v2 (merged op|view stream + §GATE significance/coalesce)');
})();
