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
  var PROFILES = {
    low:  { op: { 'BUILDING_OPEN': true }, view: {} },
    mid:  { op: _EDITS, view: {} },
    high: { op: _EDITS, view: _NAV },
    max:  { op: Object.assign({ 'ELEMENT_PICK': true }, _EDITS), view: _NAV }
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
    HB.push({ bucket: 'op', kind: 'op', type: opType, label: label, readonly: false,
      opId: opId, replay: params || {}, params: params || {},
      sigKey: 'op:' + opType + ':' + ((params && (params.axis + '/' + params.label)) || '') });
  }

  // VIEW-nav push — navigate_find calls this with its semantic view entry.
  function pushView(v) {
    if (!HB.isEnabled()) return;
    var label = v.label || v.axis || 'view';
    HB.push({ bucket: 'view', kind: 'view', type: v.kind, label: label, readonly: true,
      view: v, viewState: _tapView(), sigKey: 'view:' + (v.kind + ':' + (v.label || v.axis)) });
  }
  function registerViewRestore(fn) { _viewRestore = fn; }

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
    // view
    if (_viewRestore) _viewRestore(entry.view);
    _tapApply(entry.viewState, entry.label);     // …same for a Find/nav view entry
  }

  // ── §-tap bridge: stamp each entry with the ambient look, re-apply it on restore ──────
  // The depth axis (HISTORY_KNOB_SIGNAL_TAP §LOCKED #3). Loose-coupled: the tap module owns the
  // vector; the viewer only registers HOW to read/apply its own toggles + camera.
  function _tapView() { try { return window.HistoryTap ? HistoryTap.currentView() : null; } catch (e) { return null; } }
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
  function _stepIcon(e) {
    if (e.kind === 'pick') return _DISC_ICON[String((e.params && e.params.disc) || '').toUpperCase()] || null;
    if (e.type === 'BUILDING_OPEN') return 'home';
    return 'search';
  }

  // Per-building persisted-tree key (item 4): universes survive reload, scoped to THIS building's db.
  function _treeKey() {
    try { var db = new URLSearchParams(location.search).get('db') || 'default';
      return 'bim.hist.tree.' + db.replace(/[^A-Za-z0-9_.-]/g, '_'); } catch (e) { return 'bim.hist.tree.default'; }
  }

  // ── Wire the viewer onto the shared bar ───────────────────────────────
  HB.configure({
    treeKey: _treeKey(),                    // §4 persist the branch tree per building
    source: 'viewer',
    mountHostId: 'status-bar-wrap',         // §3: dock under the status row
    profiles: PROFILES,
    depthKey: 'bim.universalHist.depth',
    defaultDepth: function () { return window._isMobile ? 'off' : 'all'; }, // mobile opt-in, desktop on
    restore: _restore,
    afterApply: _chainCheck,
    iconFn: _stepIcon,
    sharedKey: 'bim.docHistory',            // §8 app-wide log (landing reads it)
    channel: 'bim_history',
    docTypes: { 'BUILDING_OPEN': true }     // mirror only milestones to the shared log
  });

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
  window.UniversalHistory = {
    pushView: pushView,
    registerViewRestore: registerViewRestore,
    undo: HB.undo, redo: HB.redo, jumpTo: HB.jumpTo,
    setEnabled: HB.setEnabled, isEnabled: HB.isEnabled,
    setDepth: HB.setDepth, cycleDepth: HB.cycleDepth, getDepth: HB.getDepth,
    clear: HB.clear, open: HB.open, toggleOpen: HB.toggleOpen, list: HB.list,
    significant: function (ev) { return HB.significant(ev.source, ev.type, ev.label); },
    // branch TREE (PR #5) — fork-don't-wipe universes + switch=restore.
    switchToId: HB.switchToId, tips: HB.tips, dumpTree: HB.dumpTree, setTreeKey: HB.setTreeKey,
    PROFILES: PROFILES, SIGNIFICANCE: PROFILES.all, UNDOABLE_OPS: UNDOABLE_OPS
  };
  _wireTap();   // §-tap depth axis: provider + appliers + seed (no-op if history_tap.js absent)
  console.log('§UNIVERSAL_HISTORY_LOADED v3 (viewer adapter on shared HistoryBar)');
})();
