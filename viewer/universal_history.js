// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// universal_history.js — the VIEWER ADAPTER onto the shared common/history_bar.js (HistoryBar).
// HISTORY_SCRUB_FIX §CONTRACT §4b: the shared module owns ~95% (bar UI + bloom, depth toggle, gate,
// persistence, cross-tab sync, undo/redo/jump, coalesce). This file SUPPLIES only the viewer's 3
// things: (a) push() calls wired onto KernelOps.commitOp, (b) one restore(entry,forward) — only the
// viewer can rebuild its own state (model-op flag-flip · pick shape-mesh · Find view replay), (c) its
// significant types (PROFILES). window.UniversalHistory keeps its public API so navigate_find.js
// (pushView / registerViewRestore) is UNTOUCHED. ERP mirrors this adapter against its own commitOp.
(function () {
  'use strict';
  if (!window.HistoryBar) { console.warn('§HIST_NO_MODULE common/history_bar.js not loaded'); return; }
  var HB = window.HistoryBar;

  function _A() { return window.A || window.APP; }

  // (c) Viewer significance profiles — now the KNOB's 5-stop BREADTH ladder (§LOCKED-KNOB).
  // Monotone low ⊂ mid ⊂ high ⊂ max, each stop adding ONE category:
  //   low  = milestones only · mid = + reversible edits & saves (the clean trail) ·
  //   high = + navigation views (DEFAULT) · max = + every selection/pick.
  var UNDOABLE_OPS = { 'GRID_MOVE': true, 'ELEMENT_PLACE': true };
  var _EDITS = { 'BUILDING_OPEN': true, 'GRID_MOVE': true, 'ELEMENT_PLACE': true,
                 'DESIGN_SAVE': true, 'DESIGN_OPEN': true, 'CAPTURE_4D': true, 'CLASH_SNAG': true };
  var _NAV = { 'axis': true, 'group': true, 'item': true };
  // HISTORY_SESSION_EVENTS.md A1 — read-only DETAIL EVENTS in Z: the detail actions a user does inside a
  // building (inspect a clash, cut a section, take a measurement) that were invisible to history — clash/
  // measure never called the recorder, SECTION_CUT committed but was in no profile. They record as read-only
  // 'event' moments (look-restore on scrub, NEVER a kernel mutation), gated by a new `event` bucket that is
  // ON from `mid` up (so the default `max` shows them; `low`/`off` keep them out).
  var _EVENTS = { 'CLASH_INSPECT': true, 'SECTION_CUT': true, 'MEASURE': true };
  var PROFILES = {
    low:  { op: { 'BUILDING_OPEN': true }, view: {}, event: {} },
    mid:  { op: _EDITS, view: {}, event: _EVENTS },
    high: { op: _EDITS, view: _NAV, event: _EVENTS },
    max:  { op: Object.assign({ 'ELEMENT_PICK': true }, _EDITS), view: _NAV, event: _EVENTS }
  };
  PROFILES.all = PROFILES.high; PROFILES.doc = PROFILES.mid;   // legacy aliases (exported SIGNIFICANCE + _isDoc fallback)

  var _viewRestore = null; // navigate_find's view-restore callback

  // ── Labels (viewer-specific) ──────────────────────────────────────────
  function _humanClass(cls) {
    if (!cls) return 'element';
    return String(cls).replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
  function _opLabel(opType, p) {
    if (opType === 'GRID_MOVE') return 'Grid ' + (p && p.label ? p.label : '') + ' move';
    if (opType === 'ELEMENT_PLACE') return 'Place ' + ((p && (p.cls || p.name)) || 'element');
    if (opType === 'BUILDING_OPEN') return 'Opened ' + ((p && p.name) || 'building');
    if (opType === 'ELEMENT_PICK') return ((p && p.name) || 'element') + ' · ' + _humanClass(p && p.cls);
    return opType;
  }

  // (a) Record a kernel op as it commits → build an entry and push it through the shared gate.
  function _recordOp(opId, opType, params, guids) {
    if (_isReHome()) return;   // A2: re-homed past session is READ-ONLY — never append to it
    var label = _opLabel(opType, params);
    if (opType === 'ELEMENT_PICK') {
      // Read-only SELECTION moment: a 'pick' entry that restores via A.focusElement (no flag-flip).
      var g = guids || (params && params.guids) || [];
      if (!Array.isArray(g)) g = [g];
      g = g.filter(Boolean);
      HB.push({ bucket: 'op', kind: 'pick', type: opType, label: label, readonly: true,
        opId: opId, guids: g, params: params || {}, viewState: _tapView(), sigKey: 'pick:' + (g.join(',') || label) });
      return;
    }
    // De-dup pile-up (HISTORY_KNOB_DIAL.md): the tree persists per building and a fresh BUILDING_OPEN is
    // appended every reload. Skip recording one when the current tip is ALREADY a BUILDING_OPEN of the
    // same building (sigKey carries the name) — kills the "Opened…Opened…Opened" stack.
    var bname = (opType === 'BUILDING_OPEN' && params && params.name) ? params.name : '';
    var sigKey = 'op:' + opType + ':' + (opType === 'BUILDING_OPEN' ? bname : ((params && (params.axis + '/' + params.label)) || ''));
    if (opType === 'BUILDING_OPEN' && HB.tipInfo) {
      var tip = HB.tipInfo();
      if (tip && tip.type === 'BUILDING_OPEN' && tip.sigKey === sigKey) {
        console.log('§HIST_DEDUP BUILDING_OPEN "' + bname + '" already at tip — skipped');
        return;
      }
    }
    HB.push({ bucket: 'op', kind: 'op', type: opType, label: label, readonly: false,
      opId: opId, replay: params || {}, params: params || {},
      // HISTORY_KNOB_DIAL.md fix: stamp EVERY moment (incl. ops) with the ambient view so the READ-ONLY
      // scrubber restores the scene when you step ONTO an op moment (was only on pick/view → ops did nothing).
      viewState: _tapView(),
      // W1: a re-open key for the cross-page log (only BUILDING_OPEN is mirrored; reopen = the building).
      // Carry the ?db= URL this viewer was opened with so a foreign World card can DETERMINISTICALLY reopen
      // the building (viewer/viewer.html?db=<url>&ghost=1, the landing's openViewer format) — not just the
      // best-effort city-only A.cityLoadBuilding(name).
      ref: (opType === 'BUILDING_OPEN' && params && params.name) ? { building: params.name, db: _openDbUrl(), session: _sessionId() } : null,
      sigKey: sigKey });
  }

  // VIEW-nav push — navigate_find calls this with its semantic view entry.
  function pushView(v) {
    if (!HB.isEnabled() || _isReHome()) return;   // A2: read-only re-home never records
    var label = v.label || v.axis || 'view';
    HB.push({ bucket: 'view', kind: 'view', type: v.kind, label: label, readonly: true,
      view: v, viewState: _tapView(), sigKey: 'view:' + (v.kind + ':' + (v.label || v.axis)) });
  }
  function registerViewRestore(fn) { _viewRestore = fn; }

  // HISTORY_SESSION_EVENTS.md A1 — record a read-only DETAIL EVENT into Z (clash-inspect / section / measure).
  // It is a 'event'-bucket moment: stamped with the ambient look (_tapView) so scrubbing onto it RE-APPLIES
  // the look only — it NEVER calls KernelOps.undo/redo (not a model op). Gated by the `event` profile bucket.
  function recordEvent(type, label, ref) {
    if (!HB.isEnabled() || _isReHome()) return;   // A2: read-only re-home never records
    // A scrub-restore drives the REAL setters (HistoryTap.applyView → section.write → A.toggleSection):
    // recording there would mint fake dots while merely browsing the past. isApplying() gates it.
    if (window.HistoryTap && HistoryTap.isApplying && HistoryTap.isApplying()) return;
    HB.push({ bucket: 'event', kind: 'event', type: type, label: label || type, readonly: true,
      viewState: _tapView(), ref: (ref != null ? ref : null), sigKey: 'event:' + type + ':' + (label || '') });
  }

  // (b) Restore one entry's state — the ONLY thing only the viewer can do.
  //   null → clear focus · op → kernel flag-flip + replay · pick → shape-mesh focus · view → Find replay.
  function _restore(entry, forward) {
    var A = _A();
    if (!entry) {
      if (A && A.clearFocusElement) A.clearFocusElement();
      else if (_viewRestore) _viewRestore(null);
      return;
    }
    if (entry.kind === 'op') { _applyOp(entry, forward); return; }
    if (entry.kind === 'pick') {
      if (A && A.focusElement) A.focusElement(entry.guids, { item: true });
      else if (A && A.loadNavigate) A.loadNavigate().then(function () { if (A.focusElement) A.focusElement(entry.guids, { item: true }); });
      else console.warn('§HIST_RESTORE_NOFN A.focusElement missing');
      _tapApply(entry.viewState, entry.label);   // re-apply the x-ray/bbox/camera this pick was taken under
      return;
    }
    // view (Find/nav) OR combine (no Find view, just a stamped look) — only replay a Find view if present.
    if (_viewRestore && entry.view) _viewRestore(entry.view);
    _tapApply(entry.viewState, entry.label);
  }

  // READ-ONLY restore for the KNOB-DIAL scrubber (HISTORY_KNOB_DIAL.md): re-apply the moment's stamped
  // LOOK ONLY — camera/lens/section via the §-tap, pick focus for selections, Find replay for nav views.
  // Crucially it NEVER calls _applyOp (no KernelOps.undo/redo) — so stepping a GRID_MOVE moment restores
  // the view it was taken under without flipping the signed op. This is the fix for "scrubber looks corrupted".
  function _restoreView(entry) {
    var A = _A();
    if (!entry) { if (A && A.clearFocusElement) A.clearFocusElement(); else if (_viewRestore) _viewRestore(null); return; }
    if (entry.kind === 'pick' && entry.guids) {
      if (A && A.focusElement) A.focusElement(entry.guids, { item: true });
      else if (A && A.loadNavigate) A.loadNavigate().then(function () { if (A.focusElement) A.focusElement(entry.guids, { item: true }); });
    } else if (_viewRestore && entry.view) {
      _viewRestore(entry.view);
    }
    _tapApply(entry.viewState, entry.label);   // the x-ray/section/camera/palette this moment lived under
  }

  // (PR #6) Cross-branch COMBINE — bring a sibling universe's DISTINCTIVE view-fields into the current
  // look. Delta = the fields the donor branch changed vs the fork point (so the current branch's own
  // fields are kept); union via the proven combineViews, then apply. Result is a new tip on the current
  // branch — A and B stay intact as universes. (color⊕section, the user's exact demo.)
  function _combine(current, donor, ancestor) {
    if (!window.HistoryTap) return null;
    var Dv = donor && donor.viewState; if (!Dv) return null;
    var Fv = (ancestor && ancestor.viewState) || {};
    var delta = {};
    for (var k in Dv) { if (JSON.stringify(Dv[k]) !== JSON.stringify(Fv[k])) delta[k] = Dv[k]; }   // donor's contribution only
    var base = (current && current.viewState) || HistoryTap.currentView();
    var combined = HistoryTap.combineViews(base, delta);
    HistoryTap.applyView(combined, '⊕ ' + (donor.label || 'universe'));
    console.log('§HIST_COMBINE_DELTA donor="' + (donor.label || '') + '" delta=' + Object.keys(delta).join(',') + ' → combined=' + Object.keys(combined).join(','));
    return { viewState: combined, label: '⊕ ' + (donor.label || 'universe') };
  }
  // MODEL cherry-pick — replay the donor's signed op onto the current state (disjoint = clean; no 3-way).
  function _cherryPick(donor) {
    var A = _A();
    if (!A || !A.db || !window.KernelOps || !donor || !UNDOABLE_OPS[donor.type]) return false;
    try { KernelOps.commitOp(A.db, donor.type, donor.replay || donor.params || {}, (donor.params && donor.params.guids) || []); return true; }
    catch (e) { console.warn('§HIST_CHERRY_ERR', e); return false; }
  }

  // ── §-tap bridge: stamp each entry with the ambient look, re-apply it on restore ──────
  // The depth axis (HISTORY_KNOB_SIGNAL_TAP §LOCKED #3). Loose-coupled: the tap module owns the
  // vector; the viewer only registers HOW to read/apply its own toggles + camera.
  function _tapView() { try { return window.HistoryTap ? HistoryTap.currentView() : null; } catch (e) { return null; } }
  // _openDbUrl — the building's cross-page re-open key baked into a World card's deep-link.
  // FIX (CRUD_EDIT_PERSIST.md Item 3, cause (a)): prefer the AUTHORITATIVE db the viewer actually loaded
  // (A.DB_URL), not just the ?db= query param. A building reached by ANY path without ?db= in the URL
  // (default open / in-app pick) left this null → ref.db null → _deepUrl fell back to a BARE url → the
  // World card "sometimes" failed to transport. A.DB_URL is set whenever a building loads (streaming.js).
  // import:// dbs live in THIS tab's IndexedDB and are NOT re-openable via ?db= on a fresh page → keep them
  // null so the card falls back to the bare-url + RESTORE_KEY handoff (same-session only), never a dead link.
  function _openDbUrl() {
    try {
      var q = null; try { q = new URLSearchParams(location.search).get('db') || null; } catch (e0) {}
      var A = _A();
      var u = (A && A.DB_URL) ? A.DB_URL : q;
      if (u && /^import:\/\//.test(String(u))) return (q && !/^import:\/\//.test(String(q))) ? q : null;
      return u || null;
    } catch (e) { return null; }
  }
  // HISTORY_SESSION_EVENTS.md A2 [VIEWER] — the SESSION boundary. A session = one open, tied to the browser
  // TAB via sessionStorage: a reload CONTINUES it (same id → same Z tree, no loss); a new tab / new visit =
  // a NEW session (fresh Z, new W card). `?sess=<id>` = a read-only RE-HOME of a past session picked from W
  // (loads that session's persisted Z tree from localStorage to scrub; recording is gated off so browsing the
  // past never mutates it — viewer is the LIGHT lane, no forking, per the partition).
  var _SESSION = null, _REHOME = false;
  function _sessionId() {
    if (_SESSION) return _SESSION;
    try {
      var sp = new URLSearchParams(location.search), db = sp.get('db') || 'default';
      var forced = sp.get('sess');
      if (forced) { _REHOME = true; _SESSION = forced; return _SESSION; }
      var key = 'bim.sess.' + db.replace(/[^A-Za-z0-9_.-]/g, '_');
      var sid = null; try { sid = sessionStorage.getItem(key); } catch (e) {}
      if (!sid) { sid = 's' + Date.now(); try { sessionStorage.setItem(key, sid); } catch (e) {} }
      _SESSION = sid; return _SESSION;
    } catch (e) { _SESSION = 'live'; return _SESSION; }
  }
  function _isReHome() { _sessionId(); return _REHOME; }   // resolve _REHOME via the cached compute
  function _tapApply(v, label) { try { if (v && window.HistoryTap) HistoryTap.applyView(v, label); } catch (e) {} }
  function _wireTap() {
    if (!window.HistoryTap || !window.HistoryTap.field) return;
    var T = window.HistoryTap;
    // ── ONE symmetric line per restorable act: field(name, read, write). ───────────────
    // read() = capture the slice · write(v) = reproduce it. Adding a new act = add a line.
    T.field('ghost',
      function () { return (typeof window.ghostXrayOn === 'function') ? window.ghostXrayOn() : false; },
      function (want) { if (typeof window.ghostXrayOn === 'function' && typeof window.toggleGhostXray === 'function' && window.ghostXrayOn() !== !!want) window.toggleGhostXray(); });
    T.field('xray',
      function () { return !!(_A() && _A().xrayOn); },
      function (want) { var A = _A(); if (A && !!A.xrayOn !== !!want && A.toggleXray) A.toggleXray(); });
    T.field('cam',
      function () { var A = _A(); if (!(A && A.camera && A.controls)) return null; var p = A.camera.position, t = A.controls.target; return { p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] }; },
      function (c) { var A = _A(); if (A && A.camera && A.controls && c && c.p) { A.camera.position.set(c.p[0], c.p[1], c.p[2]); if (c.t) A.controls.target.set(c.t[0], c.t[1], c.t[2]); A.controls.update(); if (A.markDirty) A.markDirty(); } });
    // §SECTION — full cut state is {on, axis, cut} where cut = sectionPlane.constant (the slider position).
    // write() drives the REAL setters: toggle on/off, set axis, then land the exact cut.  (demo's branch B)
    T.field('section',
      function () { var A = _A(); if (!A) return null; return { on: !!A.sectionOn, axis: A.sectionAxis, cut: (A.sectionPlane ? A.sectionPlane.constant : 0) }; },
      function (s) {
        var A = _A(); if (!(A && s)) return;
        if (!s.on) { if (A.sectionOn && A.toggleSection) A.toggleSection(); return; }   // target = off → clear
        if (!A.sectionOn && A.toggleSection) A.toggleSection();                          // target = on → enable
        if (A.sectionAxis !== s.axis && A.setSectionAxis) A.setSectionAxis(s.axis);      // axis (re-applies range)
        else if (A.applySectionAxis) A.applySectionAxis();
        if (typeof s.cut === 'number' && A.updateSectionPlane) {
          A.updateSectionPlane(s.cut);                                                   // the EXACT cut position
          var sl = document.getElementById('section-slider'); if (sl) sl.value = s.cut;  // sync the slider thumb
        }
        if (A.markDirty) A.markDirty();
      });
    // §PALETTE — the whole palette/ambience is one scalar tick.  (the demo's branch A)
    T.field('palette',
      function () { var A = _A(); return A ? (A._ambienceTick || 0) : 0; },
      function (tick) { var A = _A(); if (A && A.updateAmbience) A.updateAmbience(tick); });
    if (T.sniff) T.sniff(true);   // recording goes TOTAL: read every §act from the stream, deny-filtered
    console.log('§HIST_TAP_WIRED fields(ghost,xray,cam,section,palette) + sniffer ON — one symmetric line each');
  }

  // MODEL op apply: flips the signed kernel_ops `undone` flag (never deletion) + dispatches replay.
  function _applyOp(e, forward) {
    var A = _A();
    if (!A || !A.db || !window.KernelOps) return;
    if (e.type === 'GRID_MOVE') {
      var p = e.replay || {};
      if (forward) {
        KernelOps.redoOp(A.db);
        if (typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) GridDrag.applyReplayedMove(p.axis, p.label, p.to, p.cascade, +1);
      } else {
        KernelOps.undoOp(A.db);
        if (typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) GridDrag.applyReplayedMove(p.axis, p.label, p.from, p.cascade, -1);
      }
    } else if (e.type === 'ELEMENT_PLACE') {
      if (forward) KernelOps.redoOp(A.db); else KernelOps.undoOp(A.db);
    }
    // BUILDING_OPEN is a read-only milestone op → nothing to flip.
    if (A.markDirty) A.markDirty();
  }

  // §HIST_CHAIN_OK — prove the signed chain still verifies after a model-op flip (post undo/redo).
  function _chainCheck(when) {
    var A = _A();
    if (!A || !A.db || !window.KernelOps || !KernelOps.verifyChain) return;
    KernelOps.sealChain(A.db).then(function () { return KernelOps.verifyChain(A.db); }).then(function (res) {
      console.log('§HIST_CHAIN_OK after=' + when + ' ok=' + (res && res.ok) + ' len=' + (res ? res.len : '?'));
    }).catch(function (err) { console.warn('§HIST_CHAIN_ERR after=' + when + ' ' + (err && err.message)); });
  }

  // §2 chip icon by WHAT: single element → discipline icon · building-open → home · group/scope → magnifier.
  var _DISC_ICON = { STR: 'discSTR', ARC: 'discARC', MEP: 'discMEP', FP: 'discFP', ELEC: 'discELEC', ACMV: 'discACMV', PLMB: 'discPLMB' };
  // A1 detail events get their action's own icon so the dot reads at a glance.
  var _EVENT_ICON = { 'CLASH_INSPECT': 'triangle', 'SECTION_CUT': 'scissors', 'MEASURE': 'ruler' };
  function _stepIcon(e) {
    if (e.kind === 'pick') return _DISC_ICON[String((e.params && e.params.disc) || '').toUpperCase()] || null;
    if (e.kind === 'event') return _EVENT_ICON[e.type] || 'search';
    if (e.type === 'BUILDING_OPEN') return 'home';
    return 'search';
  }

  // Per-building persisted-tree key (item 4): universes survive reload, scoped to THIS building's db.
  function _treeKey() {
    try { var db = new URLSearchParams(location.search).get('db') || 'default';
      // A2: scope the tree to (building, SESSION) so each session has its OWN Z; `?sess=` loads a past one.
      return 'bim.hist.tree.' + db.replace(/[^A-Za-z0-9_.-]/g, '_') + '.' + _sessionId(); } catch (e) { return 'bim.hist.tree.default'; }
  }

  // ── Wire the viewer onto the shared bar ───────────────────────────────
  HB.configure({
    treeKey: _treeKey(),                    // §4 persist the branch tree per building
    source: 'viewer',
    mountHostId: 'status-bar-wrap',         // §3: dock under the status row
    profiles: PROFILES,
    depthKey: 'bim.universalHist.depth',
    // HISTORY_KNOB_DIAL.md: depth/knob is gone — recording is ALWAYS ON everywhere (incl. mobile, which
    // used to default 'off' → no dots collected). 'max' = every meaningful act becomes one dot (scene
    // change / pick / section / grid), matching "every change is a dot".
    defaultDepth: function () { return 'max'; },
    restore: _restore,
    restoreView: _restoreView,              // READ-ONLY scrubber path (knob nav + dot clicks)
    afterApply: _chainCheck,
    iconFn: _stepIcon,
    sharedKey: 'bim.docHistory',            // §8 app-wide log (landing reads it)
    channel: 'bim_history',
    docTypes: { 'BUILDING_OPEN': true },    // mirror only milestones to the shared log
    combine: _combine,                      // §6 cross-branch VIEW combine (color⊕section)
    cherryPick: _cherryPick                 // §6 model op replay (disjoint graft)
  });
  // Implementing HISTORY_SESSION_EVENTS.md §RESUME — load diagnostic: which session Z loaded, read-only or
  // live, under which tree key, with how many dots. One line pinpoints "new session shows no dots" reports.
  try {
    console.log('§HIST_SESSION id=' + _sessionId() + ' reHome=' + _isReHome() +
      ' treeKey=' + _treeKey() + ' dots=' + HB.list().length);
  } catch (e) {}

  // commitOp wrapper — record EVERY model op as it lands.
  (function wrapCommit() {
    if (!window.KernelOps || !KernelOps.commitOp) { setTimeout(wrapCommit, 200); return; }
    if (KernelOps.__uhistWrapped) return;
    var orig = KernelOps.commitOp;
    KernelOps.commitOp = function (db, opType, params, guids) {
      var id = orig.apply(this, arguments);
      var p = params;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
      try { _recordOp(id, opType, p, guids); } catch (e) { console.warn('§HIST_REC_ERR', e); }
      return id;
    };
    KernelOps.__uhistWrapped = true;
    console.log('§HIST_WRAP commitOp wrapped');
  })();

  // Public API — UNCHANGED surface (navigate_find.js + scene.js + panels.js depend on it).
  // The bomb (W long-press) clears the timeline; without a re-seed, open()/Z then shows an EMPTY bar with
  // no "current" moment → "Z doesn't work after bomb". Re-seed ONE BUILDING_OPEN of the active building so
  // the bar has a live starting point (push() already handles the empty tree; subsequent acts append).
  function clearAndReseed() {
    HB.clear();
    try {
      var A = _A();
      var name = (A && A.activeBuilding) || '';
      if (name) _recordOp('reseed', 'BUILDING_OPEN', { name: name }, []);
    } catch (e) {}
    console.log('§HIST_RESEED after=clear');
  }

  window.UniversalHistory = {
    pushView: pushView,
    recordEvent: recordEvent,   // A1: read-only DETAIL EVENTS (clash-inspect / section / measure) → Z
    registerViewRestore: registerViewRestore,
    undo: HB.undo, redo: HB.redo, jumpTo: HB.jumpTo,
    setEnabled: HB.setEnabled, isEnabled: HB.isEnabled,
    setDepth: HB.setDepth, cycleDepth: HB.cycleDepth, getDepth: HB.getDepth,
    clear: clearAndReseed, open: HB.open, toggleOpen: HB.toggleOpen, list: HB.list,
    significant: function (ev) { return HB.significant(ev.source, ev.type, ev.label); },
    // branch TREE (PR #5) + combine (PR #6) — fork-don't-wipe universes, switch=restore, bring-into-current.
    switchToId: HB.switchToId, tips: HB.tips, dumpTree: HB.dumpTree, setTreeKey: HB.setTreeKey, combineFromId: HB.combineFromId,
    PROFILES: PROFILES, SIGNIFICANCE: PROFILES.all, UNDOABLE_OPS: UNDOABLE_OPS,
    openDbUrl: _openDbUrl   // Item 3: the World-card re-open key (A.DB_URL-authoritative) — exposed for the witness/debug
  };
  _wireTap();   // §-tap depth axis: provider + appliers + seed (no-op if history_tap.js absent)

  // W2 (HISTORY_WHOLE_TIMELINE.md): mount the cross-page launcher + consume any pending cross-page
  // restore. ADDITIVE — this never touches the viewer's own bottom bar. Building reopen is best-effort
  // (uses the existing A.cityLoadBuilding; if absent, the deep-link still re-opens the viewer).
  if (window.WholeHistory) {
    window.WholeHistory.mount({ page: 'viewer', rootPrefix: '../', launcher: false });   // launched from the W pill
    // §WHOLE-LANDED (CRUD_EDIT_PERSIST.md Item 3) — the TARGET end of the transport trace: pairs with
    // §WHOLE-NAV (whole_history.js, the click). A World building-card deep-link lands the viewer with
    // ?db=<url>&ghost=1[&sess=]; this one line shows the db we landed on, so a card click is traceable
    // end-to-end (was the missing half — restore was untraceable). db=null here ⇒ a bare-url landing.
    try {
      var _sp = new URLSearchParams(location.search);
      console.log('§WHOLE-LANDED page=viewer db=' + (_openDbUrl() || 'null') + ' ghost=' + (_sp.get('ghost') || '0') +
        ' sess=' + (_sp.get('sess') || 'none') + ' reHome=' + _isReHome());
    } catch (e) {}
    window.WholeHistory.consumeRestore('viewer', function (ref) {
      try { var A = _A(); if (ref && ref.building && A && A.cityLoadBuilding) A.cityLoadBuilding(ref.building); } catch (e) {}
    });
  }
  console.log('§UNIVERSAL_HISTORY_LOADED v3 (viewer adapter on shared HistoryBar)');
})();
