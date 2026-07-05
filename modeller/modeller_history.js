// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// modeller_history.js — the MODELLER ADAPTER onto the shared common/history_bar.js (HistoryBar).
// prompts/MODELLER_GIT_FAITHFUL_HISTORY.md Phase 2: reuse the SAME git-faithful tree engine the Viewer
// already runs (mirrors viewer/universal_history.js's role exactly) — no new branch mechanism invented.
// This file supplies only: (a) push() calls wired onto Bonsai.oplog.commit/commitGesture, (b) one
// restore(entry,forward) that calls Bonsai.oplog.undo()/redo() (Phase 1's fixed, correctly-ordered
// primitives), (c) Modeller's significant op types. HistoryBar owns the tree/fork/coalesce/persistence.
(function () {
  'use strict';
  if (!window.HistoryBar) { console.warn('§MHIST_NO_MODULE common/history_bar.js not loaded'); return; }
  var HB = window.HistoryBar;

  // (c) every real GEOM op-type Modeller commits, plus the BUILDING_OPEN milestone (readonly, mirrors
  // the Viewer's own BUILDING_OPEN handling — "nothing to flip", just a dot marking where edits began).
  // Modeller has no breadth-ladder UI (no knob pill) — ONE profile, always on, own depthKey so a stale
  // Viewer/iDempiere depth setting in shared localStorage can never suppress Modeller's own dots.
  var OP_TYPES = { 'BUILDING_OPEN': true, 'GEOM_EXTRUDE': true, 'GEOM_EXTRUDE_POLY': true,
    'GEOM_SWEEP': true, 'GEOM_CUT': true, 'GEOM_FILLET': true, 'GEOM_GRID_MOVE': true,
    'GEOM_MOVE': true, 'GEOM_ROTATE': true, 'GEOM_SCALE': true, 'GEOM_INSERT': true,
    'GEOM_OPENING': true, 'STR_WALK_EDIT': true };
  var PROFILES = { high: { op: OP_TYPES } };
  PROFILES.all = PROFILES.high; PROFILES.doc = PROFILES.high;   // legacy aliases HistoryBar falls back to

  function _humanLabel(opType, p) {
    p = p || {};
    if (opType === 'BUILDING_OPEN') return 'Opened ' + (p.building || p.name || 'building');
    if (opType === 'GEOM_GRID_MOVE') return 'Grid ' + (p.label || p.gridId || '') + ' move';
    if (opType === 'GEOM_CUT') return 'Cut';
    if (opType === 'GEOM_FILLET') return 'Fillet';
    if (opType === 'GEOM_ROTATE') return 'Rotate';
    if (opType === 'GEOM_SCALE') return 'Scale';
    if (opType === 'GEOM_MOVE') return 'Move';
    if (opType === 'GEOM_INSERT') return 'Insert';
    if (opType === 'GEOM_OPENING') return 'Opening';
    if (opType === 'GEOM_SWEEP') return 'Sweep';
    if (opType === 'STR_WALK_EDIT') return 'STR re-walk';
    return opType.replace(/^GEOM_/, '').replace(/_/g, ' ').toLowerCase();
  }

  // Push ONE node per commit-worth-of-rows (a single commit() row, or a whole commitGesture() group —
  // exactly the unit Bonsai.oplog.undo()/redo() already treats as one atomic LIFO step, Phase 1 fixed).
  function _push(opType, params, opts) {
    opts = opts || {};
    HB.push({ bucket: 'op', kind: 'op', type: opType, label: _humanLabel(opType, params),
      readonly: !!opts.readonly, opId: opts.opId, gid: opts.gid, params: params || {},
      ref: (opType === 'BUILDING_OPEN' && params && params.building) ? { building: params.building, db: params.db } : null,
      sigKey: 'op:' + opType + ':' + (opts.gid || opts.opId || '') });
  }

  // Building-open milestone — called from str_walker_outliner.js's _openBuffer on success (the single
  // chokepoint every Open path — resident/local-.db/local-.ifc — folds through). READ-ONLY: restore()
  // does nothing for it (same as the Viewer's BUILDING_OPEN — "a read-only milestone, nothing to flip"),
  // it exists purely to anchor the edit trail's root per building.
  function recordBuildingOpen(name) {
    _push('BUILDING_OPEN', { building: name }, { readonly: true });
  }

  // restore(entry, forward) — the ONE thing only Modeller can do: replay a step of ITS OWN model.
  // BUILDING_OPEN is read-only (nothing to flip). Every other entry is a real GEOM/STR edit — forward
  // ⇒ Bonsai.oplog.redo() (Phase 1: correctly picks the lowest-id-undone row/group next), backward ⇒
  // Bonsai.oplog.undo(). Neither call takes a target id — both always act on the current LIFO boundary,
  // which HistoryBar's tree-walk (undo to common ancestor, then redo down the target path) keeps in
  // exact lockstep with, by construction (paths in the tree are chronological commit order).
  //
  // ASYNC NOTE: HistoryBar's undo()/redo()/switchToId() call restore() SYNCHRONOUSLY (viewer's kernel
  // calls are plain sql.js, no await needed) — but Modeller's own undo()/redo() are `async` (they await
  // an OCCT worker re-fold). The tree-cursor move itself is safe fire-and-forget: Bonsai.oplog's row
  // SELECTION + the `undone`-flag flip both happen SYNCHRONOUSLY at the top of undo()/redo(), before
  // their one `await` (the visual re-fold) — so back-to-back tree steps stay logically correct even
  // without awaiting; only the FOLD (visual) could theoretically resolve out of order under rapid
  // multi-step calls. `doUndo`/`doRedo` (single human keypress at a time) never hits that; a future
  // Phase 3 multi-step branch-switch UI should await `pending()` between steps before firing the next.
  var _pending = null;
  function pending() { return _pending; }
  function _restore(entry, forward) {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!entry || !O) { _pending = null; return; }
    if (entry.type === 'BUILDING_OPEN') { _pending = null; return; }   // read-only milestone — nothing to flip
    _pending = (forward ? O.redo() : O.undo());
    _pending.catch(function (e) { console.warn('§MHIST_RESTORE_ERR', e); });
  }

  HB.configure({
    source: 'modeller',
    profiles: PROFILES,
    depthKey: 'bim.hist.depth.modeller',   // own namespace — never inherits a stale Viewer/iDempiere stop
    ignorePersistedDepth: true,            // Modeller has no breadth-knob UI — always boot at defaultDepth()
    defaultDepth: function () { return 'high'; },
    restore: _restore,
    sharedKey: 'bim.docHistory',
    channel: 'bim_history',
    docTypes: { 'BUILDING_OPEN': true }    // mirror building-open milestones to the cross-page WholeHistory log
  });

  // Wrap commit()/commitGesture() — record EVERY real edit as it lands. deleteFeature()/commitSeedGroup()
  // are intentionally NOT wrapped yet (deleteFeature flags EXISTING rows rather than committing a new one —
  // doesn't fit the "one push per new commit" shape; commitSeedGroup is the one-time whole-building ARC
  // seed, never Ctrl+Z'd row-by-row in practice) — flagged as a follow-up in
  // prompts/MODELLER_GIT_FAITHFUL_HISTORY.md, not silently half-wired.
  (function wrapCommits() {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!O || O.__mhistWrapped) { if (!O) setTimeout(wrapCommits, 200); return; }
    var origCommit = O.commit, origGesture = O.commitGesture;
    O.commit = async function (op, opts) {
      var r = await origCommit.call(this, op, opts);
      try { _push(op.op_type, op.parameters, { opId: r && r.id }); } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    O.commitGesture = async function (opsArray) {
      var r = await origGesture.call(this, opsArray);
      try {
        // one node for the WHOLE gesture — label off its first op, gid carries the group for restore's
        // undo()/redo() (which already treats a gesture-grp gid as one atomic LIFO step, §P8).
        var first = (opsArray && opsArray[0]) || {};
        _push(first.op_type || 'GEOM_MOVE', first.params, { gid: r && r.gid, opId: r && r.id });
      } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    O.__mhistWrapped = true;
    console.log('§MHIST_WRAP commit/commitGesture wrapped');
  })();

  window.ModellerHistory = {
    recordBuildingOpen: recordBuildingOpen,
    undo: HB.undo, redo: HB.redo, jumpTo: HB.jumpTo, pending: pending,
    switchToId: HB.switchToId, tips: HB.tips, dumpTree: HB.dumpTree, setTreeKey: HB.setTreeKey,
    open: HB.open, toggleOpen: HB.toggleOpen, list: HB.list
  };
  console.log('§MHIST_READY source=modeller profile=high ops=' + Object.keys(OP_TYPES).length);
})();
