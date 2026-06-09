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
    cherryPick: null                          // cherryPick(donorOp,ancestor)→bool (replay a signed op onto current)
  };
  // ── The KNOB (HISTORY_KNOB_SIGNAL_TAP §LOCKED-KNOB) ──────────────────────
  // The old 3-state cycle (all/doc/off) is a 5-stop magnitude DIAL: Off·Low·Mid·High·Max, default
  // High. TURN (drag/tap) = BREADTH (how wide the §-net). PRESS (long-press) = RICHNESS (dot→chip,
  // unified with the double-tap bloom). SOUND = a pitched detent tick per stop (∝ breadth, mute-aware).
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
    try { _depth = _migrateDepth(localStorage.getItem(_cfg.depthKey)) || _migrateDepth(_cfg.defaultDepth()) || 'high'; }
    catch (e) { _depth = _migrateDepth(_cfg.defaultDepth()) || 'high'; }
    if (!_configured) { _wireKeyboard(); _wireCrossTab(); _configured = true; }
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
    if (!entry || !significant(entry.bucket, entry.type, entry.label)) return;
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
    entry.seq = ++_seq;
    entry.kids = []; entry.active = 0; entry.parent = _cursorNode;
    var kids = _kidsOf(_cursorNode);
    var forked = kids.length > 0;          // already had a child → this push FORKS a sibling universe
    var keptSibling = forked ? _tipOf(kids[_activeOf(_cursorNode)]) : null;
    kids.push(entry);
    _setActive(_cursorNode, kids.length - 1);
    _cursorNode = entry;
    if (_isDoc(entry)) _mirror(entry);
    _rebuild();
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

  // ── The KNOB: breadth (turn) + sound (detent) ─────────────────────────
  function setDepth(d) {
    d = _migrateDepth(d); if (!d) return;
    var changed = d !== _depth;
    _depth = d;
    try { localStorage.setItem(_cfg.depthKey, d); } catch (e) {}
    _render();
    console.log('§HIST_DEPTH depth=' + _depth + ' stop=' + _stopIdx(_depth) + '/4');
    if (changed) _detentTick();
  }
  function cycleDepth() { setDepth(_STOPS[(_stopIdx(_depth) + 1) % _STOPS.length]); }  // tap = one step (wraps)
  function setEnabled(on) { setDepth(on ? 'high' : 'off'); }
  function isEnabled() { return _on(); }
  function getDepth() { return _depth; }

  // SOUND axis: a crisp pitched detent tick per stop (pitch ∝ breadth), eyes-free confirmation.
  // FREE — reuses the SFX synth; MUST stay silent under the global mute (`v` / §SFX_TOGGLE).
  var _DETENT_HZ = { off: 150, low: 300, mid: 392, high: 494, max: 622 };
  function _detentTick() {
    try {
      if (!(window.__sfx && window.__sfx.isOn && window.__sfx.isOn())) { console.log('§HIST_DETENT muted stop=' + _depth); return; }
      var hz = _DETENT_HZ[_depth] || 440;
      console.log('§HIST_DETENT stop=' + _depth + ' hz=' + hz);
      window.__sfx.voice(_depth === 'off' ? 'knock' : 'pluck', hz, 55, 0);
    } catch (e) {}
  }
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
  function list() {
    var out = _stream.map(function (e, i) { return { i: i, kind: e.kind, label: e.label, applied: i <= _cursor }; });
    console.log('§HIST_LIST n=' + _stream.length + ' cursor=' + _cursor + ' ' +
      out.map(function (o) { return o.i + ':' + o.kind + (o.applied ? '*' : ''); }).join(' '));
    return out;
  }

  // ── The bar UI ────────────────────────────────────────────────────────
  var _bar = null, _back = null, _fwd = null, _marks = null, _off = null;
  var _knobTrack = null, _knobThumb = null, _knobLbl = null;
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
    _off = _buildKnob();
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
    chip.addEventListener('pointerup', function (ev) { ev.stopPropagation(); jumpTo(idx); });
    return chip;
  }

  // ── The KNOB control (§LOCKED-KNOB): a 5-stop dial replacing the 3-state glyph button ──
  // TURN = breadth (drag the dot, or tap to step) · PRESS = richness (long-press → bloom) ·
  // SOUND = detent tick (in setDepth). Reuses the pill (BTN) look + a mini slider — no new widget.
  var _STOP_UI = {
    off:  { g: '○', c: '#777',    t: 'History OFF — drag/tap to dial up · long-press = detail' },
    low:  { g: '◔', c: '#8a9bbf', t: 'Low — milestones only (tap → Mid)' },
    mid:  { g: '◑', c: '#66bb6a', t: 'Mid — the clean trail: edits + saves (tap → High)' },
    high: { g: '◕', c: '#4fc3f7', t: 'High — + navigation & selections · default (tap → Max)' },
    max:  { g: '●', c: '#ffd479', t: 'Max — everything significant (tap → Off)' }
  };
  function _buildKnob() {
    var wrap = document.createElement('div');
    wrap.id = 'hist-knob';
    wrap.style.cssText = BTN + ';font-size:13px;display:flex;align-items:center;gap:6px;padding:6px 9px;touch-action:none;user-select:none';
    _knobLbl = document.createElement('span');
    _knobLbl.style.cssText = 'font-size:13px;line-height:1;flex:0 0 auto';
    var track = document.createElement('div'); _knobTrack = track;
    track.style.cssText = 'position:relative;width:48px;height:12px;flex:0 0 auto';
    var line = document.createElement('div');
    line.style.cssText = 'position:absolute;left:0;right:0;top:5px;height:2px;border-radius:1px;background:rgba(255,255,255,0.25)';
    track.appendChild(line);
    for (var s = 0; s < 5; s++) {
      var pip = document.createElement('div');
      pip.style.cssText = 'position:absolute;top:4px;width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.35);left:' + (s / 4 * 100) + '%;transform:translateX(-50%)';
      track.appendChild(pip);
    }
    _knobThumb = document.createElement('div');
    _knobThumb.style.cssText = 'position:absolute;top:1px;width:10px;height:10px;border-radius:50%;transform:translateX(-50%);box-shadow:0 0 4px rgba(0,0,0,0.5);transition:left .08s';
    track.appendChild(_knobThumb);
    wrap.appendChild(_knobLbl); wrap.appendChild(track);
    _wireKnobGestures(wrap, track);
    return wrap;
  }
  function _wireKnobGestures(wrap, track) {
    var startX = 0, startT = 0, dragging = false, pid = null;
    var DRAG_PX = 4, PRESS_MS = 420;
    function stopFromX(clientX) {
      var r = track.getBoundingClientRect(); if (r.width <= 0) return _stopIdx(_depth);
      return Math.max(0, Math.min(4, Math.round((clientX - r.left) / r.width * 4)));
    }
    wrap.addEventListener('pointerdown', function (e) {
      e.stopPropagation(); startX = e.clientX; startT = _now(); dragging = false; pid = e.pointerId;
      try { wrap.setPointerCapture(pid); } catch (x) {}
    });
    wrap.addEventListener('pointermove', function (e) {
      if (pid == null) return;
      if (Math.abs(e.clientX - startX) > DRAG_PX) dragging = true;
      if (dragging) { var st = _STOPS[stopFromX(e.clientX)]; if (st !== _depth) setDepth(st); }   // live = TURN
    });
    wrap.addEventListener('pointerup', function (e) {
      e.stopPropagation();
      try { wrap.releasePointerCapture(pid); } catch (x) {} pid = null;
      if (dragging) { dragging = false; return; }              // drag already committed live
      if (_now() - startT >= PRESS_MS) { _cycleRichness(); return; }  // PRESS = richness
      cycleDepth();                                            // TAP = one breadth step
    });
    wrap.addEventListener('pointercancel', function () { pid = null; dragging = false; });
  }
  function _renderKnob() {
    if (!_off) return;
    var su = _STOP_UI[_depth] || _STOP_UI.high;
    if (_knobLbl) { _knobLbl.textContent = su.g; _knobLbl.style.color = su.c; }
    _off.title = su.t;
    if (_knobThumb) { _knobThumb.style.left = (_stopIdx(_depth) / 4 * 100) + '%'; _knobThumb.style.background = su.c; _knobThumb.style.border = '1px solid ' + su.c; }
  }

  function _render() {
    if (!_bar) return;
    _renderKnob();
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
    // A fork at the very START (virtual root has >1 child) → show the off-line root universes first.
    if (_rootKids.length > 1) {
      for (var rk = 0; rk < _rootKids.length; rk++) {
        if (rk === _rootActive) continue;
        _marks.appendChild(_bloom ? _siblingChip(_rootKids[rk]) : _siblingTick(_rootKids[rk]));
      }
    }
    for (var i = 0; i < _stream.length; i++) {
      var e = _stream[i], applied = (i <= _cursor), isCurrent = (i === _cursor);
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
    setDepth: setDepth, cycleDepth: cycleDepth, getDepth: getDepth, setEnabled: setEnabled, isEnabled: isEnabled,
    clear: clear, open: open, toggleOpen: toggleOpen, list: list, significant: significant,
    // ── branch TREE (PR #5) + combine (PR #6) ──
    switchToId: switchToId, tips: tips, dumpTree: dumpTree, treeShape: treeShape,
    serialize: serialize, hydrate: hydrate, setTreeKey: setTreeKey,
    combineFromId: combineFromId
  };
})();
