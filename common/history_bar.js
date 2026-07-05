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

  // ── Branching history TREE (HISTORY_PARALLEL_TIMELINE PR #5) ──────────────
  // Was a LINEAR _stream[]+_cursor where push()-after-undo TRUNCATED the redo tail (the wipe).
  // Now a TREE: each entry node keeps kids[]+active+parent. Going back then acting FORKS a sibling
  // universe instead of wiping the abandoned tail. The "current line" (_stream) is DERIVED — the
  // path from the virtual root down the active-child chain to the tip. push/undo/redo/jumpTo keep
  // their signatures (scene.js/navigate_find.js/panels.js depend on them); they now move the cursor
  // through the tree, and _stream/_cursor are recomputed by _rebuild() to keep all the old UI/gate
  // code working unchanged on the active line.
  var _rootKids = [];      // children of the virtual root (>1 = a fork at the very start)
  var _rootActive = 0;     // which root child the active line follows
  var _cursorNode = null;  // most-recently-APPLIED node; null = at the virtual root (nothing applied)
  var _stream = [];        // DERIVED: the active line, root→tip (kept current by _rebuild)
  var _cursor = -1;        // DERIVED: index of _cursorNode within _stream (-1 = virtual root)
  // READ-ONLY view cursor (HISTORY_KNOB_DIAL.md): the SCRUBBER (knob nav + dot clicks) walks THIS,
  // re-applying each moment's stamped VIEW — it never moves _cursor, so the signed op-log is untouched.
  // The MODEL cursor (_cursor) only moves on real undo/redo (Ctrl+Z/Backspace/toolbar); we keep them in
  // sync when the model moves, so the highlighted dot never diverges confusingly.
  var _viewCursor = -1;
  var _seq = 0;            // monotonic id + tiebreak for same-ms timestamps (also the node id)
  var _suppress = false;   // true while WE drive a restore — stops re-recording
  var _bloom = false;      // double-tap the BAR → dots bloom into labelled chips
  var _opened = false;
  var COALESCE_MS = 700;
  var GOLD = '#ffd479';
  var SIB = '#b388ff';     // sibling-universe accent (off the active line)

  // kids/active accessors that treat the virtual root (node===null) uniformly.
  function _kidsOf(node) { return node ? node.kids : _rootKids; }
  function _activeOf(node) { return node ? node.active : _rootActive; }
  function _setActive(node, i) { if (node) node.active = i; else _rootActive = i; }

  // Recompute the DERIVED active line (_stream) + cursor index from the tree.
  function _rebuild() {
    var line = [], node = null;
    while (true) {
      var kids = _kidsOf(node);
      if (!kids.length) break;
      var ai = _activeOf(node); if (ai >= kids.length) ai = kids.length - 1;
      node = kids[ai];
      line.push(node);
    }
    _stream = line;
    _cursor = _cursorNode ? line.indexOf(_cursorNode) : -1;
  }
  function _tipOf(node) { var n = node; while (n.kids.length) { var a = n.active < n.kids.length ? n.active : n.kids.length - 1; n = n.kids[a]; } return n; }
  function _isAncestorOrSelf(a, target) { var t = target; while (t) { if (t === a) return true; t = t.parent; } return false; }

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
    docTypes: null,                           // {type:true} whitelist that mirrors to the shared log
    treeKey: null,                            // per-building localStorage key for the persisted TREE (opt-in)
    combine: null,                            // combine(current,donor,ancestor)→{viewState,label} (cross-branch VIEW union)
    cherryPick: null,                         // cherryPick(donorOp,ancestor)→bool (replay a signed op onto current)
    restoreView: null                         // restoreView(entry|null) — READ-ONLY: re-apply the moment's stamped
                                              // VIEW (camera/lens/section) ONLY, never flip the kernel op-log.
                                              // The KNOB-DIAL scrubber + dot clicks route here (HISTORY_KNOB_DIAL.md).
  };
  // ── The KNOB (HISTORY_KNOB_SIGNAL_TAP §LOCKED-KNOB) ──────────────────────
  // The old 3-state cycle (all/doc/off) is a 5-stop magnitude DIAL: Off·Low·Mid·High·Max, default
  // High. TURN (drag/tap) = BREADTH (how wide the §-net). PRESS (long-press) = RICHNESS (dot→chip,
  // unified with the double-tap bloom).
  // Persisted legacy values migrate: off→Off · doc→Mid · all→High (keeps any prior/ERP value working).
  var _STOPS = ['off', 'low', 'mid', 'high', 'max'];
  var _depth = 'high';
  var _configured = false;
  function _stopIdx(d) { var i = _STOPS.indexOf(d); return i < 0 ? 3 : i; }
  function _migrateDepth(d) {
    if (d === 'all') return 'high';
    if (d === 'doc') return 'mid';
    if (d === 'off') return 'off';
    return (_STOPS.indexOf(d) >= 0) ? d : null;
  }

  function _now() { return (typeof Date !== 'undefined') ? Date.now() : 0; }
  function _on() { return _depth !== 'off'; }

  function configure(opts) {
    for (var k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) _cfg[k] = opts[k]; }
    // depth: persisted choice wins (legacy all/doc/off migrate to stops); else the app's default.
    // ignorePersistedDepth: an app with NO depth knob (the viewer — knob scrapped per
    // HISTORY_KNOB_DIAL) passes this so a STALE persisted stop from the knob era can't pin it
    // forever with no UI to change it. Such apps always boot at their defaultDepth().
    try {
      var _storedDepth = _cfg.ignorePersistedDepth ? null : localStorage.getItem(_cfg.depthKey);
      _depth = _migrateDepth(_storedDepth) || _migrateDepth(_cfg.defaultDepth()) || 'high';
    }
    catch (e) { _depth = _migrateDepth(_cfg.defaultDepth()) || 'high'; }
    if (!_configured) { _wireKeyboard(); _wireCrossTab(); _configured = true; }
    _syncTapKnob();                     // ONE KNOB: push the loaded depth onto the §-tap at startup
    if (_cfg.treeKey) _persistLoad();   // restore persisted universes for this building (item 4)
    console.log('§HIST_CONFIGURE source=' + _cfg.source + ' depth=' + _depth + ' host=' + (_cfg.mountHostId || 'body') + ' treeKey=' + (_cfg.treeKey || '-'));
  }

  // ── Significance gate (per active KNOB stop) ──────────────────────────
  // BREADTH ladder: the stop selects how wide the §-net is. An app may supply a per-stop profile
  // (the viewer does: low⊂mid⊂high⊂max); otherwise we fall back to its legacy all/doc sets so apps
  // with only two profiles (e.g. ERP, if it adopts this bar) keep working — low/mid→doc, high/max→all.
  function _profileForStop(stop) {
    if (stop === 'off') return null;
    var p = _cfg.profiles || {};
    if (p[stop]) return p[stop];
    if (stop === 'high' || stop === 'max') return p.all || p.doc || {};
    return p.doc || p.all || {};   // low / mid
  }
  function significant(bucket, type, label) {
    if (_depth === 'off') {
      console.log('§HIST_DROP source=' + bucket + ' type=' + type + ' reason=off profile=off label="' + (label || '') + '"');
      return false;
    }
    var prof = _profileForStop(_depth) || {};
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
  // FORK-DON'T-WIPE: when _cursorNode already has children (you went back, then acted), we DON'T
  // truncate the abandoned tail — we append the new act as a fresh child and make it active. The old
  // child subtree survives as a SIBLING universe hanging off the same fork node. A branch is a parent
  // pointer, not a copy (~159 B/node, §LOCKED #4). VIEW restores, MODEL replays — geometry is never
  // snapshotted into a node.
  function push(entry) {
    if (!_on() || _suppress) return;
    // fromTap entries arrive PRE-FILTERED by the §-tap's knob (the single breadth dial) → they bypass the
    // bar's per-stop significant() gate, which is the DUPLICATE breadth logic this unification retires for
    // the read-only tier (HISTORY_KNOB_SIGNAL_TAP §THE WORK step 1/2). _on() (off) still suppresses all.
    if (!entry || (!entry.fromTap && !significant(entry.bucket, entry.type, entry.label))) return;
    if (entry.ts == null) entry.ts = _now();
    // Coalesce rapid same-signature repeats — only at a TRUE tip (cursor node has no children, so
    // there is no sibling/redo subtree we'd quietly mutate).
    if (_cursorNode && _cursorNode.kids.length === 0) {
      var tip = _cursorNode;
      if (_sig(tip) === _sig(entry) && (entry.ts - (tip.ts || 0)) <= COALESCE_MS) {
        for (var f in entry) {
          if (f === 'seq' || f === 'kids' || f === 'active' || f === 'parent') continue;
          if (Object.prototype.hasOwnProperty.call(entry, f)) tip[f] = entry[f];
        }
        _render();
        console.log('§HIST_DROP source=' + entry.bucket + ' type=' + entry.type + ' reason=coalesced label="' + (entry.label || '') + '"');
        return;
      }
    }
    var kids = _kidsOf(_cursorNode);
    // HISTORY_TIMELINE_UNDO_DOTS: fork-don't-wipe is for genuine model divergence (a real op,
    // readonly:false) — undo-then-edit legitimately opens a new universe. A read-only crumb
    // (view/pick/tap-drained NAVIGATE/XRAY/FOCUS/PICK) never mutates the model, so after an undo
    // (cursor sits on a node that already has a kid) it must NOT fork a new sibling dot — that's
    // what made the timeline look like it "spawns more dots on undo" for routine looking-around.
    // Drop it instead; it only ever existed to paint a dot, and forking one for it is the bug.
    if (entry.readonly && kids.length > 0) {
      console.log('§HIST_DROP source=' + entry.bucket + ' type=' + entry.type + ' reason=readonly-post-undo label="' + (entry.label || '') + '"');
      return;
    }
    entry.seq = ++_seq;
    entry.kids = []; entry.active = 0; entry.parent = _cursorNode;
    var forked = kids.length > 0;          // already had a child → this push FORKS a sibling universe
    var keptSibling = forked ? _tipOf(kids[_activeOf(_cursorNode)]) : null;
    kids.push(entry);
    _setActive(_cursorNode, kids.length - 1);
    _cursorNode = entry;
    if (_isDoc(entry)) _mirror(entry);
    _rebuild();
    _viewCursor = _cursor;                  // a new act lands at the tip → the scrubber follows
    _persistSave();
    _render();
    console.log('§HIST_PUSH n=' + _stream.length + ' idx=' + _cursor + ' kind=' + entry.kind +
      ' label="' + (entry.label || '') + '"' + (entry.kind === 'op' ? ' opType=' + entry.type + ' opId=' + entry.opId : ''));
    if (forked) {
      console.log('§HIST_FORK parent="' + (_cursorNode.parent ? (_cursorNode.parent.label || '') : 'root') +
        '" new="' + (entry.label || '') + '" kept-sibling="' + (keptSibling ? keptSibling.label : '') + '"' +
        ' universes=' + _kidsOf(entry.parent).length);
    }
  }

  // Mirror a DOC-class event to the app-wide shared log (cross-tab) — the landing/other apps read it.
  // HISTORY_WHOLE_TIMELINE.md W1: route through the ONE shared writer (WholeHistory.record) so every
  // surface uses the unified shape {page,ts,label,kind,ref}; fall back to the inline write if the
  // whole-history substrate isn't loaded (keeps the viewer-only mirror working standalone).
  function _mirror(entry) {
    try {
      if (typeof WholeHistory !== 'undefined' && WholeHistory.record) {
        WholeHistory.record({ page: _cfg.source, kind: entry.kind, type: entry.type,
          label: entry.label, ref: (entry.ref != null ? entry.ref : null) });
        return;
      }
      var arr = JSON.parse(localStorage.getItem(_cfg.sharedKey) || '[]');
      arr.push({ ts: _now(), source: _cfg.source, type: entry.type, label: entry.label });
      if (arr.length > 50) arr = arr.slice(-50);
      localStorage.setItem(_cfg.sharedKey, JSON.stringify(arr));
      try { new BroadcastChannel(_cfg.channel).postMessage('sync'); } catch (e) {}
    } catch (e) {}
  }

  // ── Undo / Redo / Jump ────────────────────────────────────────────────
  // Cursor walks the TREE: undo = step to parent, redo = step to the active child.
  function undo() {
    if (!_cursorNode) { console.log('§HIST_UNDO nothing'); return false; }
    var e = _cursorNode, was = _cursor;
    _applyEntry(e, false);
    _cursorNode = e.parent;
    _rebuild();
    _viewCursor = _cursor;                  // model moved → keep the scrubber highlight in sync
    _render();
    console.log('§HIST_UNDO idx=' + was + '→' + _cursor + ' kind=' + e.kind + ' label="' + (e.label || '') + '"');
    _afterApply('undo');
    return true;
  }
  function redo() {
    var next = _cursorNode ? (_cursorNode.kids[_cursorNode.active] || null) : (_rootKids[_rootActive] || null);
    if (!next) { console.log('§HIST_REDO nothing'); return false; }
    var was = _cursor;
    _applyEntry(next, true);
    _cursorNode = next;
    _rebuild();
    _viewCursor = _cursor;                  // model moved → keep the scrubber highlight in sync
    _render();
    console.log('§HIST_REDO idx=' + was + '→' + _cursor + ' kind=' + next.kind + ' label="' + (next.label || '') + '"');
    _afterApply('redo');
    return true;
  }
  function jumpTo(idx) {
    if (idx < -1 || idx >= _stream.length) return;
    var guard = 0;
    while (_cursor > idx && guard++ < 999) undo();
    while (_cursor < idx && guard++ < 999) redo();
  }

  // ── READ-ONLY view scrubber (HISTORY_KNOB_DIAL.md) ─────────────────────
  // The KNOB's back/front ticks and the dot clicks call THESE — they re-apply a moment's stamped VIEW
  // via _cfg.restoreView and move ONLY _viewCursor. The op-log is NEVER flipped (that's undo()/redo(),
  // reserved for Ctrl+Z/Backspace/toolbar). DOUBLE-FEEDBACK: the active dot jumps + gets an amber halo
  // AND the scene changes — two independent signals it moved, even if two moments look identical.
  function _viewApply(idx) {
    if (idx < -1 || idx >= _stream.length) return null;
    _viewCursor = idx;
    var entry = idx >= 0 ? _stream[idx] : null;
    try { if (_cfg.restoreView) _cfg.restoreView(entry); } catch (e) { console.warn('§HIST_VIEWNAV_ERR', e); }
    _render();
    var lbl = entry ? (entry.label || '') : '';
    console.log('§HIST_VIEWNAV idx=' + _viewCursor + ' label="' + lbl + '" opLogMutated=NO dotJump=ok');
    return { idx: _viewCursor, label: lbl };
  }
  function viewStepBack() { return (_viewCursor > 0) ? _viewApply(_viewCursor - 1) : (_viewCursor === 0 ? _viewApply(-1) : null); }
  function viewStepFront() { return (_viewCursor < _stream.length - 1) ? _viewApply(_viewCursor + 1) : null; }
  function viewJumpTo(idx) { return _viewApply(idx); }
  function viewCanStep() { return { back: _viewCursor > -1, front: _viewCursor < _stream.length - 1 }; }

  // SWITCH UNIVERSE = restore down a different path. Walk the cursor from where it is up to the common
  // ancestor of `target`, point the active-child chain at `target`, then redo down to it — every step
  // re-applies its view, so landing on a sibling tip returns the scene exactly as that universe looked.
  function _switchToNode(target) {
    if (!target || target === _cursorNode) return;
    var fromIdx = _cursor, guard = 0;
    while (_cursorNode && !_isAncestorOrSelf(_cursorNode, target) && guard++ < 9999) undo();
    var cur = target;                                  // re-point active children: ancestor → target
    while (cur && cur !== _cursorNode) { var p = cur.parent; _setActive(p, _kidsOf(p).indexOf(cur)); cur = p; }
    _rebuild();
    guard = 0;
    while (_cursorNode !== target && guard++ < 9999) { if (!redo()) break; }
    _persistSave();
    console.log('§HIST_SWITCH from=' + fromIdx + ' to="' + (target.label || '') + '" idx=' + _cursor + ' line=' + _stream.length);
  }
  function switchToId(id) {
    var hit = null;
    (function dfs(node) { var k = _kidsOf(node); for (var i = 0; i < k.length; i++) { if (k[i].seq === id) hit = k[i]; if (!hit) dfs(k[i]); } })(null);
    if (hit) _switchToNode(hit); else console.log('§HIST_SWITCH miss id=' + id);
    return !!hit;
  }
  // ── Cross-branch COMBINE / cherry-pick (PR #6, §LOCKED-BRANCH) ────────────
  // "Bring into current ⤵": standing on one universe, graft a SIBLING universe's contribution onto it
  // WITHOUT merge. Two flavours, both keep A and B intact as visible universes:
  //   • VIEW combine — union the donor's distinctive view-fields into the current look (color⊕section,
  //     the proven combineViews). The bar delegates to _cfg.combine (only the app knows its fields).
  //   • MODEL cherry-pick — replay the donor's signed op onto the current tip (delegated to _cfg.cherryPick;
  //     disjoint = clean, NO 3-way merge — conflict UI is out of scope by design).
  function _forceAppend(entry) {     // append a node on the current branch, BYPASSING the significance gate
    entry.ts = _now(); entry.seq = ++_seq; entry.kids = []; entry.active = 0; entry.parent = _cursorNode;
    var kids = _kidsOf(_cursorNode); kids.push(entry); _setActive(_cursorNode, kids.length - 1); _cursorNode = entry;
    if (_isDoc(entry)) _mirror(entry);
    _rebuild(); _persistSave(); _render();
    console.log('§HIST_PUSH n=' + _stream.length + ' idx=' + _cursor + ' kind=' + entry.kind + ' label="' + (entry.label || '') + '" forced=1');
  }
  function _commonAncestor(a, b) {
    var anc = []; for (var n = a; n; n = n.parent) anc.push(n);
    for (var m = b; m; m = m.parent) if (anc.indexOf(m) >= 0) return m;
    return null;   // disjoint roots → virtual root (delta vs {})
  }
  function _combineFrom(donor) {
    if (!donor) return;
    var cur = _cursorNode;
    if (!cur) { console.log('§HIST_COMBINE skip reason=no-current'); return; }
    if (donor === cur || _isAncestorOrSelf(donor, cur)) { console.log('§HIST_COMBINE skip reason=on-current-line'); return; }
    var anc = _commonAncestor(cur, donor);
    if (donor.kind === 'op') {
      var ok = false; try { ok = _cfg.cherryPick ? _cfg.cherryPick(donor, anc) : false; } catch (e) { console.warn('§HIST_CHERRY_ERR', e); }
      console.log('§HIST_COMBINE mode=cherry-pick donor="' + (donor.label || '') + '" ok=' + ok);
      return;   // the app's own commit path records the replayed op onto the current branch
    }
    var res = null;
    try { res = _cfg.combine ? _cfg.combine(cur, donor, anc) : null; } catch (e) { console.warn('§HIST_COMBINE_ERR', e); }
    if (!res || !res.viewState) { console.log('§HIST_COMBINE skip reason=no-result donor="' + (donor.label || '') + '"'); return; }
    _forceAppend({ bucket: 'view', kind: 'view', type: 'combine', readonly: true,
      label: res.label || ('⊕ ' + (donor.label || 'universe')), viewState: res.viewState, sigKey: 'combine:' + (_seq + 1) });
    console.log('§HIST_COMBINE mode=view donor="' + (donor.label || '') + '" into="' + (cur.label || '') + '" keys=' + Object.keys(res.viewState).join(','));
  }
  function combineFromId(id) {
    var hit = null;
    (function dfs(node) { var k = _kidsOf(node); for (var i = 0; i < k.length; i++) { if (k[i].seq === id) hit = k[i]; if (!hit) dfs(k[i]); } })(null);
    if (hit) _combineFrom(hit); else console.log('§HIST_COMBINE miss id=' + id);
    return !!hit;
  }

  // Every leaf in the tree = one universe tip. onMain = it lies on the current active line.
  function tips() {
    var out = [];
    (function dfs(node) { var k = _kidsOf(node); if (!k.length) { if (node) out.push(node); return; } for (var i = 0; i < k.length; i++) dfs(k[i]); })(null);
    return out.map(function (n) { return { id: n.seq, label: n.label, onMain: _stream.indexOf(n) >= 0 }; });
  }
  // §PROOF tree=… — compact nested shape; '*' marks the active child at each fork.
  function _fmtNode(n) {
    var s = (n.label || n.type || ('#' + n.seq));
    if (n.kids.length) s += '(' + n.kids.map(function (k, i) { return (i === n.active ? '*' : '') + _fmtNode(k); }).join(' | ') + ')';
    return s;
  }
  function treeShape() { return _rootKids.map(function (k, i) { return (i === _rootActive ? '*' : '') + _fmtNode(k); }).join(' | ') || '(empty)'; }
  function _nodeCount() { var c = 0; (function dfs(node) { var k = _kidsOf(node); for (var i = 0; i < k.length; i++) { c++; dfs(k[i]); } })(null); return c; }
  function dumpTree() {
    console.log('§PROOF tree=' + treeShape() + ' nodes=' + _nodeCount() + ' tips=' + tips().length + ' line=' + _stream.length + ' cursor=' + _cursor);
    return { shape: treeShape(), nodes: _nodeCount(), tips: tips(), line: _stream.length, cursor: _cursor };
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

  // ── Breadth (the 5-stop significance ladder) ──────────────────────────
  // ONE KNOB (HISTORY_KNOB_SIGNAL_TAP §THE WORK step 2): the bar's depth IS the §-tap's knob. Off keeps
  // the tap level (the bar suppresses via _on()); low/mid/high/max map 1:1 onto the tap's STOP sets. The
  // bar's depthKey is the SINGLE persisted source of truth — the tap level is DERIVED, never separately
  // persisted. This collapses the two knobs that used to disagree (tap level='mid' vs bar _depth='high').
  function _syncTapKnob() {
    try { if (typeof window !== 'undefined' && window.HistoryTap && window.HistoryTap.setKnob && _depth !== 'off') window.HistoryTap.setKnob(_depth); } catch (e) {}
  }
  function setDepth(d, silent) {   // silent kept for API compat (callers pass it)
    d = _migrateDepth(d); if (!d) return;
    _depth = d;
    try { localStorage.setItem(_cfg.depthKey, d); } catch (e) {}
    _syncTapKnob();
    _render();
    console.log('§HIST_DEPTH depth=' + _depth + ' stop=' + _stopIdx(_depth) + '/4 tapKnob=' + ((typeof window !== 'undefined' && window.HistoryTap && window.HistoryTap.getKnob) ? window.HistoryTap.getKnob() : '-'));
  }
  function cycleDepth() { setDepth(_STOPS[(_stopIdx(_depth) + 1) % _STOPS.length]); }  // tap = one step (wraps)
  function setEnabled(on) { setDepth(on ? 'high' : 'off'); }
  function isEnabled() { return _on(); }
  function getDepth() { return _depth; }

  // RICHNESS axis (press): dot → chip (unified with the double-tap bloom). The 3rd level (thumbnail)
  // is desktop-only + ephemeral (HISTORY_PERSIST_RECALL §LOCKED-5) — deferred, not faked here.
  function _cycleRichness() { _bloom = !_bloom; _render(); console.log('§HIST_BLOOM ' + (_bloom ? 'on' : 'off') + ' via=press'); }

  function clear() { _rootKids = []; _rootActive = 0; _cursorNode = null; _rebuild(); _persistSave(); _render(); }

  // ── Persist the TREE shape (item 4) ──────────────────────────────────────
  // Additive: serialize the whole tree (parent pointers → nested children) + the active path, so
  // universes survive reload. Strips parent refs (rebuilt on hydrate) and any non-persistable cruft;
  // VIEW state restores from the stored vectors, MODEL ops replay from the kernel spine (not duplicated
  // here). Per-building keying comes from the app via configure({treeKey}); without it, persistence is
  // a no-op (the in-memory tree still works), so an app opts in by supplying a key.
  function _serNode(n) {
    var o = {};
    for (var f in n) { if (f === 'parent' || f === 'kids' || f === 'active') continue; if (Object.prototype.hasOwnProperty.call(n, f)) o[f] = n[f]; }
    o.active = n.active;
    o.kids = n.kids.map(_serNode);
    return o;
  }
  function serialize() {
    var path = []; var c = _cursorNode; while (c) { path.unshift(c.seq); c = c.parent; }
    return { v: 1, seq: _seq, rootActive: _rootActive, cursor: path, kids: _rootKids.map(_serNode) };
  }
  function _hydNode(o, parent) {
    var n = {}; for (var f in o) { if (f === 'kids') continue; if (Object.prototype.hasOwnProperty.call(o, f)) n[f] = o[f]; }
    n.parent = parent; n.active = o.active || 0;
    n.kids = (o.kids || []).map(function (k) { return _hydNode(k, n); });
    if (n.seq > _seq) _seq = n.seq;
    return n;
  }
  function hydrate(data) {
    if (!data || !data.kids) return false;
    _rootKids = data.kids.map(function (k) { return _hydNode(k, null); });
    _rootActive = data.rootActive || 0;
    _seq = Math.max(_seq, data.seq || 0);
    // place the cursor at the persisted active node (last id on the stored path), else virtual root
    _cursorNode = null;
    var wantSeq = (data.cursor && data.cursor.length) ? data.cursor[data.cursor.length - 1] : null;
    if (wantSeq != null) (function dfs(node) { var k = _kidsOf(node); for (var i = 0; i < k.length; i++) { if (k[i].seq === wantSeq) _cursorNode = k[i]; if (!_cursorNode) dfs(k[i]); } })(null);
    _rebuild(); _render();
    console.log('§HIST_HYDRATE nodes=' + _nodeCount() + ' tips=' + tips().length + ' cursor=' + _cursor + ' tree=' + treeShape());
    return true;
  }
  function _persistSave() {
    if (!_cfg.treeKey) return;
    try { localStorage.setItem(_cfg.treeKey, JSON.stringify(serialize())); } catch (e) {}
  }
  function _persistLoad() {
    if (!_cfg.treeKey) return false;
    try { var raw = localStorage.getItem(_cfg.treeKey); if (raw) return hydrate(JSON.parse(raw)); } catch (e) {}
    return false;
  }
  // App sets the per-building key when a building opens → drop the old tree, load that building's.
  function setTreeKey(key) {
    if (key === _cfg.treeKey) return;
    _cfg.treeKey = key;
    _rootKids = []; _rootActive = 0; _cursorNode = null;
    if (!_persistLoad()) { _rebuild(); _render(); }
    console.log('§HIST_TREEKEY key=' + (key || '-') + ' nodes=' + _nodeCount());
  }
  // Current tip (most-recently-applied node) — small shape for de-dup checks (e.g. skip a repeat
  // BUILDING_OPEN on reload). null at the virtual root.
  function tipInfo() { return _cursorNode ? { type: _cursorNode.type, label: _cursorNode.label, sigKey: _sig(_cursorNode) } : null; }
  function list() {
    var out = _stream.map(function (e, i) { return { i: i, kind: e.kind, label: e.label, applied: i <= _cursor }; });
    console.log('§HIST_LIST n=' + _stream.length + ' cursor=' + _cursor + ' ' +
      out.map(function (o) { return o.i + ':' + o.kind + (o.applied ? '*' : ''); }).join(' '));
    return out;
  }

  // ── The bar UI ────────────────────────────────────────────────────────
  // HISTORY_KNOB_DIAL.md rework: the amp-knob is SCRAPPED. The bar is now just `‹ dots ›` — the two
  // arrows step the READ-ONLY view cursor older/newer, the dots are clickable jumps, hover = the action
  // name. No knob, no depth slider, no halo orange. The bar is FOCUSABLE (tabindex) → ←/→ step ONLY
  // while it holds focus (a blue left-edge highlight shows focus); Tab reaches it; otherwise the arrows
  // belong to whatever panel is focused.
  var _bar = null, _back = null, _fwd = null, _marks = null;
  var ARROW = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
    'border-radius:6px;padding:4px 8px;font-size:17px;line-height:1;cursor:pointer;backdrop-filter:blur(6px);' +
    'min-width:28px;text-align:center;outline:none';

  function _iconSvg(name, px) {
    var ic = name && window.ICONS && window.ICONS[name];
    var inner = ic ? ic.svg : '<rect x="4" y="4" width="16" height="16" rx="2"/>';
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">' + inner + '</svg>';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function _shortLabel(s) { s = String(s || ''); return s.length > 26 ? s.slice(0, 24) + '…' : s; }

  function _injectHaloStyle() {
    if (document.getElementById('hist-halo-style')) return;
    var st = document.createElement('style'); st.id = 'hist-halo-style';
    // FOCUS highlight (HISTORY_KNOB_DIAL.md §3.4): a blue left edge means the bar holds focus → ←/→
    // step its dots. No focus = the arrows belong to whatever panel does. The amber knob halo is gone.
    st.textContent = '#universal-hist-btns{border-left:3px solid transparent;transition:border-color .12s,box-shadow .12s}' +
      '#universal-hist-btns.hist-focused{border-left-color:#4fc3f7;box-shadow:-3px 0 10px rgba(79,195,247,0.45)}' +
      '@media (prefers-reduced-motion: reduce){#universal-hist-btns,#universal-hist-btns *{transition:none !important;animation:none !important}}';
    document.head.appendChild(st);
  }
  function _build() {
    if (_bar) return;
    _injectHaloStyle();
    _bar = document.createElement('div');
    _bar.id = 'universal-hist-btns';
    _bar.tabIndex = 0;                          // focusable → Tab reaches it, ←/→ step only while focused
    _bar.title = 'History — ‹ older · newer › (click a dot to jump · ←/→ when focused)';
    var host = _cfg.mountHostId ? document.getElementById(_cfg.mountHostId) : null;
    if (host) {
      _bar.style.cssText = 'display:none;gap:4px;align-items:center;max-width:74vw;z-index:25';
      host.appendChild(_bar);
    } else {
      _bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:25;display:none;gap:4px;align-items:center;max-width:74vw';
      document.body.appendChild(_bar);
    }
    // ‹ (older) · dots · › (newer) — the arrows walk the READ-ONLY view cursor, never the op-log.
    _back = document.createElement('button');
    _back.id = 'hist-back'; _back.title = 'Older (←)'; _back.innerHTML = '‹'; _back.style.cssText = ARROW;
    _back.addEventListener('pointerup', function (e) { e.stopPropagation(); viewStepBack(); });
    _marks = document.createElement('div');
    _marks.id = 'hist-marks';
    _marks.style.cssText = 'display:flex;gap:3px;align-items:center;padding:0 4px;overflow-x:auto;max-width:60vw';
    _fwd = document.createElement('button');
    _fwd.id = 'hist-fwd'; _fwd.title = 'Newer (→)'; _fwd.innerHTML = '›'; _fwd.style.cssText = ARROW;
    _fwd.addEventListener('pointerup', function (e) { e.stopPropagation(); viewStepFront(); });
    _bar.appendChild(_back); _bar.appendChild(_marks); _bar.appendChild(_fwd);

    // FOCUS model (§3.4): blue left edge while focused; arrow keys handled HERE so they only fire when
    // the bar (or a dot inside it) holds focus — otherwise they go to whatever panel is focused.
    _bar.addEventListener('focusin', function () { _bar.classList.add('hist-focused'); });
    _bar.addEventListener('focusout', function () { _bar.classList.remove('hist-focused'); });
    _bar.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft') { e.preventDefault(); viewStepBack(); }
      else if (k === 'ArrowRight') { e.preventDefault(); viewStepFront(); }
    });

    var _lastTap = 0; // §2 bloom: pointer double-tap reveals the dots as labelled chips (browse aid)
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
    dot.addEventListener('pointerup', function (ev) { ev.stopPropagation(); viewJumpTo(idx); });   // READ-ONLY jump
    return dot;
  }
  // A sibling universe (a fork-child NOT on the active line) → a small accent tick / chip.
  //   TAP        = SWITCH to that universe's tip (walk the tree + restore its look).
  //   LONG-PRESS / RIGHT-CLICK = BRING INTO CURRENT ⤵ (cross-branch combine/cherry-pick, PR #6).
  function _wireSibling(el, tip) {
    var t0 = 0, pid = null, done = false;
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); t0 = _now(); pid = e.pointerId; done = false; try { el.setPointerCapture(pid); } catch (x) {} });
    el.addEventListener('pointerup', function (e) {
      e.stopPropagation(); try { el.releasePointerCapture(pid); } catch (x) {} pid = null;
      if (done) return;
      if (_now() - t0 >= 500) { done = true; _combineFrom(tip); } else _switchToNode(tip);
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); _combineFrom(tip); });
  }
  function _siblingTick(child) {
    var tip = _tipOf(child);
    var t = document.createElement('button');
    t.title = 'Universe ⑂ ' + (tip.label || ('#' + tip.seq)) + ' — tap = switch · long-press/right-click = bring into current ⤵';
    t.style.cssText = 'width:7px;height:7px;padding:0;cursor:pointer;flex:0 0 auto;align-self:flex-start;touch-action:none;' +
      'border:1px solid ' + SIB + ';border-radius:50%;background:rgba(179,136,255,0.45);box-shadow:0 0 4px rgba(179,136,255,0.5)';
    _wireSibling(t, tip);
    return t;
  }
  function _siblingChip(child) {
    var tip = _tipOf(child);
    var chip = document.createElement('button');
    chip.title = 'Universe ⑂ ' + (tip.label || '') + ' — tap = switch · long-press/right-click = bring into current ⤵';
    chip.style.cssText = 'display:flex;align-items:center;gap:3px;flex:0 0 auto;cursor:pointer;touch-action:none;' +
      'padding:2px 6px;border-radius:11px;font-size:10px;white-space:nowrap;' +
      'border:1px dashed ' + SIB + ';color:' + SIB + ';background:rgba(40,25,70,0.6)';
    chip.innerHTML = '<span>⑂ ' + _esc(_shortLabel(tip.label)) + '</span>';
    _wireSibling(chip, tip);
    return chip;
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
    chip.addEventListener('pointerup', function (ev) { ev.stopPropagation(); viewJumpTo(idx); });   // READ-ONLY jump
    return chip;
  }

  function _render() {
    if (!_bar) return;
    var show = _opened;
    _bar.style.display = show ? 'flex' : 'none';
    if (!show) return;
    var hasSteps = _on() && _stream.length > 0;
    if (_back) _back.style.display = hasSteps ? '' : 'none';
    if (_fwd) _fwd.style.display = hasSteps ? '' : 'none';
    _marks.style.display = hasSteps ? 'flex' : 'none';
    _marks.innerHTML = '';
    if (!hasSteps) return;
    // the arrows walk the READ-ONLY view cursor → light them by what the scrubber can still step.
    var cs = viewCanStep();
    if (_back) _back.style.opacity = cs.back ? '1' : '0.35';
    if (_fwd) _fwd.style.opacity = cs.front ? '1' : '0.35';
    var current = null;
    // A fork at the very START (virtual root has >1 child) → show the off-line root universes first.
    if (_rootKids.length > 1) {
      for (var rk = 0; rk < _rootKids.length; rk++) {
        if (rk === _rootActive) continue;
        _marks.appendChild(_bloom ? _siblingChip(_rootKids[rk]) : _siblingTick(_rootKids[rk]));
      }
    }
    for (var i = 0; i < _stream.length; i++) {
      // gold "current" follows the READ-ONLY view cursor (the scrubber), not the model cursor;
      // "applied" fill still reflects the model line so undone ops read as hollow.
      var e = _stream[i], applied = (i <= _cursor), isCurrent = (i === _viewCursor);
      var node = _bloom ? _chip(e, i, applied, isCurrent) : _dot(e, i, applied, isCurrent);
      if (isCurrent) current = node;
      _marks.appendChild(node);
      // Fork on the active line: render the abandoned sibling universes hanging off this node.
      if (e.kids.length > 1) {
        for (var k = 0; k < e.kids.length; k++) {
          if (k === e.active) continue;   // the active child continues the main line — already drawn
          _marks.appendChild(_bloom ? _siblingChip(e.kids[k]) : _siblingTick(e.kids[k]));
        }
      }
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
    // READ-ONLY view scrubber (the KNOB-DIAL + dot clicks) — never touches the op-log.
    viewStepBack: viewStepBack, viewStepFront: viewStepFront, viewJumpTo: viewJumpTo, viewCanStep: viewCanStep,
    setDepth: setDepth, cycleDepth: cycleDepth, getDepth: getDepth, setEnabled: setEnabled, isEnabled: isEnabled,
    clear: clear, open: open, toggleOpen: toggleOpen, list: list, significant: significant, tipInfo: tipInfo,
    // ── branch TREE (PR #5) + combine (PR #6) ──
    switchToId: switchToId, tips: tips, dumpTree: dumpTree, treeShape: treeShape,
    serialize: serialize, hydrate: hydrate, setTreeKey: setTreeKey,
    combineFromId: combineFromId
  };
})();
