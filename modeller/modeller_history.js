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
    'GEOM_OPENING': true, 'STR_WALK_EDIT': true, 'DISC_WALK': true, 'GEOM_DELETE': true, 'GEOM_CUT_MOVE': true, 'GEOM_CUT_RESIZE': true, 'MEP_REROUTE': true };
  var PROFILES = { high: { op: OP_TYPES } };
  PROFILES.all = PROFILES.high; PROFILES.doc = PROFILES.high;   // legacy aliases HistoryBar falls back to

  function _humanLabel(opType, p) {
    p = p || {};
    if (opType === 'BUILDING_OPEN') return 'Opened ' + (p.building || p.name || 'building');
    if (opType === 'GEOM_GRID_MOVE') return 'Grid ' + (p.label || p.gridId || '') + ' move';
    if (opType === 'GEOM_CUT') return 'Cut';
    if (opType === 'GEOM_CUT_MOVE') return 'Cut move #' + p.cutId;   // §CUT-MOVE (a lone commit; inside a gesture the first op labels the node)
    if (opType === 'GEOM_CUT_RESIZE') return 'Cut resize #' + p.cutId;   // §CUT-RESIZE (ditto)
    if (opType === 'GEOM_FILLET') return 'Fillet';
    if (opType === 'GEOM_ROTATE') return 'Rotate';
    if (opType === 'GEOM_SCALE') return 'Scale';
    if (opType === 'GEOM_MOVE') return 'Move';
    if (opType === 'GEOM_INSERT') return 'Insert';
    if (opType === 'GEOM_OPENING') return 'Opening';
    if (opType === 'GEOM_SWEEP') return 'Sweep';
    if (opType === 'STR_WALK_EDIT') return 'STR re-walk';
    if (opType === 'MEP_REROUTE') return 'Re-route ' + (p.label || '');   // §MEP-REROUTE-SIGN (no edit node at the tip to ride)
    if (opType === 'DISC_WALK') return 'Walk ' + (p.label || '') + ' (' + (p.n || 0) + ')';   // §WALK-GESTURE
    if (opType === 'GEOM_DELETE') return 'Delete #' + p.featureId + (p.rows && p.rows.length > 1 ? ' (+' + (p.rows.length - 1) + ')' : '');
    return opType.replace(/^GEOM_/, '').replace(/_/g, ' ').toLowerCase();
  }

  // Push ONE node per commit-worth-of-rows (a single commit() row, or a whole commitGesture() group —
  // exactly the unit Bonsai.oplog.undo()/redo() already treats as one atomic LIFO step, Phase 1 fixed).
  // §MHIST-ROWS: opts.rows = the kernel_ops ids this node owns (persisted with the node) — _restore flips exactly those.
  // §MEP-REROUTE-SIGN: opts.ids = the rows a commit/commitGesture wrote (kept OFF `rows`, so the node stays on the legacy
  // boundary path until a re-route attaches to it); _lastOp = the newest real edit node, for attachDerived.
  var _lastOp = null;
  // ── §THREADS (bim-compiler prompts/HISTORY_PARALLEL_TIMELINE.md §THREADS-IMPL) — the category map. ─────────
  // Each op row of a node is classed SEPARATELY at push time (the element's class is read from its own signed
  // GEOM_INSERT row — params.ifc_class, or params._dw ⇒ a walked MEP fixture — never guessed) and the node is
  // tagged with the UNION, so a wall move + its riding door lands in Walls AND Openings.
  var CAT = { GRID: 'Grid/Structure', WALL: 'Walls', OPEN: 'Openings', MEP: 'MEP', INS: 'Inserts', SHAPE: 'Shapes', OTHER: 'Other' };
  var RE_WALL = /Wall/i, RE_OPEN = /Door|Window|Opening/i,
    RE_STR = /Column|Beam|Slab|Roof|Stair|Member|Footing|Plate|Railing|Ramp|Pile/i,
    RE_MEP = /Flow|Pipe|Duct|Cable|Sanitary|Light|Terminal|Fixture|Distribution|Energy|Valve|Pump|Fan|Fire|Alarm|Electric|Outlet|Switch|Tank|Boiler|Chiller/i,
    RE_FURN = /Furnish|Furniture/i;
  var SHAPE_OPS = { GEOM_EXTRUDE: 1, GEOM_EXTRUDE_POLY: 1, GEOM_SWEEP: 1, GEOM_LOFT: 1, GEOM_REVOLVE: 1, GEOM_FILLET: 1, GEOM_SHELL: 1,
    GEOM_OFFSET: 1, GEOM_FILLET_VARIABLE: 1, GEOM_CHAMFER_DIST_ANGLE: 1, GEOM_DRAFT: 1, GEOM_ARRAY: 1 };
  var _elInfo = {};      // fid → { cat, label } (read once from the element's own row)
  function _rowOf(id) {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!O || !O.db || id == null) return null;
    try { var r = O.db.exec('SELECT op_type, parameters FROM kernel_ops WHERE id=' + (+id)); if (!r.length) return null;
      return { op_type: r[0].values[0][0], parameters: JSON.parse(r[0].values[0][1] || '{}') }; } catch (e) { return null; }
  }
  function _classCat(cls) {
    if (!cls) return null;
    if (RE_WALL.test(cls)) return CAT.WALL; if (RE_OPEN.test(cls)) return CAT.OPEN; if (RE_STR.test(cls)) return CAT.GRID;
    if (RE_MEP.test(cls)) return CAT.MEP; if (RE_FURN.test(cls)) return CAT.INS; return null;
  }
  function _element(fid) {          // what KIND of element is fid — from its own signed row
    if (fid == null) return { cat: CAT.OTHER, label: '#?' };
    if (_elInfo[fid]) return _elInfo[fid];
    var row = _rowOf(fid), P = (row && row.parameters) || {}, cat = null, cls = '';
    if (row && row.op_type === 'GEOM_INSERT') {
      if (P._dw) { cat = CAT.MEP; cls = (P._dw.ifc || 'MEP fixture'); }
      else if (P.spanSplit) { cat = CAT.GRID; cls = 'Column'; }
      else {
        // a catalog insert carries no ifc_class in its row — its class is the catalog's (the same lookup featLabel uses)
        var lib = (!P.ifc_class && P.hash && window.Bonsai.library && window.Bonsai.library.get) ? window.Bonsai.library.get(P.hash) : null;
        cls = P.ifc_class || (lib && lib.ifc_class) || '';
        cat = _classCat(cls) || (P.ifc_class ? CAT.OTHER : CAT.INS); if (!cls) cls = 'Insert';
      }
    } else if (row && SHAPE_OPS[row.op_type]) { cat = CAT.SHAPE; cls = row.op_type.replace(/^GEOM_/, '').toLowerCase(); }
    else if (row) { cat = CAT.OTHER; cls = row.op_type; }
    var name = String(cls || 'element').replace(/^Ifc/, '').replace(/StandardCase$/, '');
    var info = { cat: cat || CAT.OTHER, label: name + ' #' + fid };
    if (row) _elInfo[fid] = info;     // only cache what the log actually answered
    return info;
  }
  function _opCat(o) {               // o = { t: op_type, p: parent, id: own row id, sp: spanSplit? }
    var t = o.t;
    if (t === 'GEOM_GRID_MOVE' || t === 'STR_WALK_EDIT') return CAT.GRID;
    if (t === 'GEOM_OPENING' || t === 'GEOM_CUT' || t === 'GEOM_CUT_MOVE' || t === 'GEOM_CUT_RESIZE') return CAT.OPEN;
    if (t === 'DISC_WALK' || t === 'MEP_REROUTE') return CAT.MEP;
    if (t === 'GEOM_MOVE' || t === 'GEOM_ROTATE' || t === 'GEOM_SCALE' || t === 'GEOM_DELETE') return _element(o.p).cat;
    if (t === 'GEOM_INSERT') return o.id != null ? _element(o.id).cat : (o.sp ? CAT.GRID : CAT.INS);
    if (SHAPE_OPS[t]) return CAT.SHAPE;
    return CAT.OTHER;
  }
  function _summarize(opsArray, ids) {   // [{op_type, params|parameters}] + their row ids → compact per-row summary
    return (opsArray || []).map(function (op, i) {
      var P = op.params || op.parameters || {};
      var o = { t: op.op_type, p: P.parent != null ? P.parent : null, id: ids && ids[i] != null ? ids[i] : null };
      if (P.induced) o.ind = P.induced; if (P.cutId != null) o.cut = P.cutId; if (P.spanSplit) o.sp = 1;
      o.c = _opCat(o);
      // a fresh catalog insert is the act of INSERTING (Inserts) and also lands in its item's own class thread (a door → Openings)
      if (o.t === 'GEOM_INSERT' && o.p == null && o.id != null && !o.sp) { var ic = o.c; o.c = CAT.INS; if (ic !== CAT.INS) o.c2 = ic; }
      if (o.c === CAT.OTHER) console.log('§THREAD_CAT_OTHER op=' + o.t + ' parent=' + o.p);
      return o;
    });
  }
  function categorize(e) {
    if (!e || e.type === 'BUILDING_OPEN') return [];
    var out = [];
    function add(c) { if (c && out.indexOf(c) < 0) out.push(c); }
    if (e.type === 'DISC_WALK' || e.type === 'MEP_REROUTE') add(CAT.MEP);
    if (e.type === 'GEOM_DELETE') add(_element(e.params && e.params.featureId).cat);
    (e.opsum || []).forEach(function (o) { add(o.c); add(o.c2); });
    if ((e.onRows && e.onRows.length) || (e.offRows && e.offRows.length)) add(CAT.MEP);   // a re-route rode this node
    if (!out.length) add(CAT.OTHER);
    return out;
  }
  function elementOf(e) {
    if (!e || e.type === 'BUILDING_OPEN' || e.type === 'DISC_WALK' || e.type === 'MEP_REROUTE') return null;
    if (e.type === 'GEOM_DELETE') return e.params && e.params.featureId != null ? [e.params.featureId] : null;
    var out = [];
    (e.opsum || []).forEach(function (o) {
      if (o.ind) return;                                   // induced riders are not the user's own target
      var id = o.p != null ? o.p : o.id;                   // a transform → its target; a fresh row → itself
      if (id != null && out.indexOf(id) < 0) out.push(id);
    });
    return out.length ? out : null;
  }
  function elementLabel(id) { return _element(id).label; }
  // §THREADS jump-to-view: a dot click / ‹ › step is READ-ONLY (history_bar _viewApply → restoreView, never the op-log).
  // The Modeller had no restoreView, so its dots moved only the highlight. Now: select that moment's own target elements
  // and frame them (selection + camera only — the model is not touched). Entries with no element (walk, open) frame nothing.
  function restoreView(e) {
    var B = window.Bonsai; if (!B || !B.selectMany) return;
    var els = (elementOf(e) || []).filter(function (id) { return B.meshFor && B.meshFor(id); });
    if (!els.length) { console.log('§THREAD_VIEW seq=' + (e ? e.seq : '-') + ' "' + (e ? e.label : 'start') + '" els=0 (nothing to frame)'); return; }
    B.selectMany(els);
    if (B.frameSelection) B.frameSelection();
    console.log('§THREAD_VIEW seq=' + e.seq + ' "' + e.label + '" els=[' + els + '] selected+framed (read-only)');
  }

  function _push(opType, params, opts) {
    opts = opts || {};
    var entry = { bucket: 'op', kind: 'op', type: opType, label: _humanLabel(opType, params),
      readonly: !!opts.readonly, opId: opts.opId, gid: opts.gid, rows: opts.rows || null, params: params || {},
      ids: opts.ids || null, onRows: opts.onRows || null, offRows: opts.offRows || null,
      ref: (opType === 'BUILDING_OPEN' && params && params.building) ? { building: params.building, db: params.db } : null,
      sigKey: 'op:' + opType + ':' + (opts.gid || opts.opId || '') };
    if (opts.opsum) entry.opsum = opts.opsum;              // §THREADS: per-row summary (category + target) of this node
    if (opts.scoped) { entry.scoped = true; entry.revertOf = opts.revertOf; entry.label = opts.label || entry.label; }
    HB.push(entry);
    if (!opts.readonly) _lastOp = entry;
  }
  // §MEP-REROUTE-SIGN (MODELLER_MASTER NEXT #2) — SPEC. A move of a generated fixture re-routes its network AFTER the move
  // node is pushed; the re-route commits new signed runs/fittings (`on`) and supersedes old ones (`off`). They ride the
  // move's node so one Ctrl+Z / Ctrl+Y restores both: the node becomes id-targeted (rows = its own ids) and carries
  // onRows (active on forward) + offRows (undone on forward). If the tip is not that edit's node (none, or the user
  // moved the cursor), the re-route gets its OWN node, still one step. Returns { attached: label|null }.
  function attachDerived(on, off, label) {
    var e = _lastOp, tip = HB.tipInfo ? HB.tipInfo() : null;
    var ok = !!(e && tip && tip.sigKey === e.sigKey && e.type !== 'BUILDING_OPEN' && e.type !== 'GEOM_DELETE' &&
      ((e.rows && e.rows.length) || (e.ids && e.ids.length)));
    if (ok) {
      if (!e.rows || !e.rows.length) e.rows = e.ids.slice();
      e.onRows = (e.onRows || []).concat(on); e.offRows = (e.offRows || []).concat(off);
      console.log('§MHIST_ATTACH "' + e.label + '" +on=' + on.length + ' +off=' + off.length + ' (one Ctrl+Z restores the edit and its re-route)');
      return { attached: e.label };
    }
    _push('MEP_REROUTE', { label: label }, { onRows: on.slice(), offRows: off.slice(), gid: 'reroute-' + (on[0] || off[0]) });
    console.log('§MHIST_ATTACH own node "Re-route ' + label + '" on=' + on.length + ' off=' + off.length);
    return { attached: null };
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
  // §MHIST-ROWS: that boundary walk is now the LEGACY path (nodes persisted without `rows`) — see _restore.
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
  var _gestureMeta = null;   // §THREADS step 2: set by a scoped revert right before its own commitGesture
  function pending() { return _pending; }
  // §MHIST-SWITCH-TARGETED: what O.undo() (backward: highest-id active row) / O.redo() (forward: lowest-id undone row) would
  // pick RIGHT NOW, under the same _treeOwned/_treeUndone exclusions those primitives apply — is it one of `ids`?
  function _boundaryAgrees(O, ids, forward) {
    var own = O._treeOwned, tu = O._treeUndone, all = O._allGeom(), pick = null;
    if (forward) { for (var i = 0; i < all.length; i++) { var o = all[i]; if (o.undone && !(own && own.has(o.id)) && !(tu && tu.has(o.id))) { pick = o; break; } } }
    else { for (var j = all.length - 1; j >= 0; j--) { var a = all[j]; if (!a.undone && !(own && own.has(a.id))) { pick = a; break; } } }
    return !!pick && ids.indexOf(pick.id) >= 0;
  }
  function _restore(entry, forward) {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!entry || !O) { _pending = null; return; }
    if (entry.type === 'BUILDING_OPEN') { _pending = null; return; }   // read-only milestone — nothing to flip
    // §MHIST-ROWS: a node that recorded its rows replays EXACTLY those (O.setUndone): a GEOM_DELETE node's forward =
    // rows undone / backward = rows active, a commit node the reverse. The boundary walk cannot serve a delete —
    // deleted rows are `undone` too, so redo()'s lowest-id pick returns a deleted row instead of the node's own
    // (delete D, commit K, Ctrl+Z, Ctrl+Y resurrected D's row) — hence every node with rows is id-targeted.
    var rows = entry.rows, del = entry.type === 'GEOM_DELETE';
    // §MEP-REROUTE-SIGN: a re-route that rode this node — flip its rows first (sync), the node's own setUndone folds once.
    var on = entry.onRows || [], off = entry.offRows || [];
    if ((on.length || off.length) && O._setUndone) {
      O._setUndone(on, forward ? 0 : 1); O._setUndone(off, forward ? 1 : 0);
      if (!rows || !rows.length) { rows = on.length ? on : off; del = !on.length; }   // own node: re-apply one flip through setUndone so it folds + emits
    }
    // §MHIST-SWITCH-TARGETED (2026-09-30, W-MODELLER-GIT-HISTORY G6): a commit/gesture node carries its rows in `ids` but
    // stays on the boundary walk (gridundo U6: exactly one O.undo() per Ctrl+Z). That walk is only correct while the
    // kernel's LIFO boundary and the tree cursor AGREE. A DIRECT switch between two non-trunk tips breaks that: undoing
    // the old branch leaves {B,C} freshly undone beside D, so O.redo()'s lowest-id pick reactivates B, not D (measured on
    // main 8311ba5f: active=[1,2], want=[1,4]). So peek at the boundary's own pick first; only when it is NOT one of this
    // node's rows, replay the node's rows by id through setUndone (the §MHIST-ROWS primitive). The linear path is untouched.
    if ((!rows || !rows.length) && entry.ids && entry.ids.length && O.setUndone && O._allGeom && !_boundaryAgrees(O, entry.ids, forward)) {
      rows = entry.ids.slice(); del = false;
      console.log('§MHIST_TARGETED "' + (entry.label || entry.type) + '" ' + (forward ? 'redo' : 'undo') + ' ids=[' + rows + '] (boundary pick is not this node\'s row)');
    }
    // §UNDO-RESURRECT (SPEC_UNDO_RESURRECT.md): rows this node leaves UNDONE are its own until it re-applies them —
    // O.redo()'s lowest-id pick (a later plain edit's Ctrl+Y) must not reactivate them (it brought back an undone
    // walk's first row, or a deleted row, instead of the edit). Rows it makes active are released.
    if (rows && rows.length && O.setUndone) {
      var leaveUndone = forward ? del : !del, TU = O._treeUndone = O._treeUndone || new Set();
      rows.forEach(function (id) { if (leaveUndone) TU.add(id); else TU.delete(id); });
    }
    _pending = (rows && rows.length && O.setUndone) ? O.setUndone(rows, forward ? del : !del) : (forward ? O.redo() : O.undo());
    _pending.catch(function (e) { console.warn('§MHIST_RESTORE_ERR', e); });
  }

  HB.configure({
    source: 'modeller',
    profiles: PROFILES,
    depthKey: 'bim.hist.depth.modeller',   // own namespace — never inherits a stale Viewer/iDempiere stop
    ignorePersistedDepth: true,            // Modeller has no breadth-knob UI — always boot at defaultDepth()
    // modeller.html's OWN window-level Ctrl+Z/Ctrl+Y (doUndo/doRedo) already owns undo/redo here, with its
    // own UI wrap-up (audio cue, status text, selection clear, syncHistory). Without this, both that
    // listener AND history_bar's document-level one fired on the SAME keypress → one Ctrl+Z silently ran
    // TWO undos (found by witness_e2e_dm_gridundo.js U6, 2026-07-08).
    skipKeyboard: true,
    defaultDepth: function () { return 'high'; },
    restore: _restore,
    // §THREADS step 1: the categorize hook (the bar stays app-agnostic) + the dotline mounted above the slider row.
    categorize: categorize, elementOf: elementOf, elementLabel: elementLabel, restoreView: restoreView,
    mountHostId: 'hist-dots',
    sharedKey: 'bim.docHistory',
    channel: 'bim_history',
    docTypes: { 'BUILDING_OPEN': true }    // mirror building-open milestones to the cross-page WholeHistory log
  });

  // Wrap commit()/commitGesture()/deleteFeature() — record EVERY real model mutation as it lands, each node carrying
  // its own row ids (§MHIST-ROWS). deleteFeature is the follow-up prompts/MODELLER_GIT_FAITHFUL_HISTORY.md flagged: it
  // flags EXISTING rows (no new commit), so it cannot be a boundary step — it is a node whose forward = those rows
  // undone. Left off-tree it was invisible to the tree: Ctrl+Z after a delete undid the previous commit and the delete
  // itself was unreachable (witness_e2e_delete D4). commitSeedGroup stays unwrapped: it is the base state under the
  // BUILDING_OPEN milestone, not an edit (§P8 U5: an 'arcseed-*' group must never mass-undo).
  (function wrapCommits() {
    var O = window.Bonsai && window.Bonsai.oplog;
    if (!O || O.__mhistWrapped) { if (!O) setTimeout(wrapCommits, 200); return; }
    var origCommit = O.commit, origGesture = O.commitGesture, origDelete = O.deleteFeature;
    // commit()/commitGesture() nodes carry NO `rows` — they stay on the LEGACY boundary-walk path (O.undo()/
    // O.redo()), unchanged from before §MHIST-ROWS (witness_e2e_dm_gridundo U6 asserts exactly one O.undo()
    // call per Ctrl+Z; routing these through setUndone() would silently swap that call for a different one).
    // Only GEOM_DELETE (below) needs id-targeting, because it flags EXISTING rows instead of pushing a new one.
    O.commit = async function (op, opts) {
      var r = await origCommit.call(this, op, opts);
      try { _push(op.op_type, op.parameters, { opId: r && r.id, ids: r && r.id != null ? [r.id] : null,
        opsum: _summarize([op], r && r.id != null ? [r.id] : null) }); } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    O.commitGesture = async function (opsArray) {
      var r = await origGesture.call(this, opsArray);
      try {
        // one node for the WHOLE gesture — label off its first op, gid carries the group for restore's
        // undo()/redo() (which already treats a gesture-grp gid as one atomic LIFO step, §P8).
        var first = (opsArray && opsArray[0]) || {};
        var meta = _gestureMeta; _gestureMeta = null;      // §THREADS step 2: a scoped revert tags its own node
        _push(first.op_type || 'GEOM_MOVE', first.params, { gid: r && r.gid, opId: r && r.id, ids: (r && r.ids) || null,
          opsum: _summarize(opsArray, r && r.ids), scoped: meta && meta.scoped, revertOf: meta && meta.revertOf, label: meta && meta.label });
      } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    O.deleteFeature = async function (featureId) {
      var r = await origDelete.call(this, featureId);
      try { if (r && r.deleted && r.deleted.length) {
        _push('GEOM_DELETE', { featureId: featureId, rows: r.deleted }, { opId: featureId, rows: r.deleted });
        var TU = this._treeUndone = this._treeUndone || new Set(); r.deleted.forEach(function (id) { TU.add(id); });   // §UNDO-RESURRECT: the delete node owns them
      } } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    // §WALK-GESTURE (2026-09-24, MODELLER_MASTER §STRATEGY L4) — SPEC. A disc walk commits through commitSeedGroup
    // (gids 'dwwalk-<disc>-N', 'dwchain-…', 'dwfit-…'), which stays unwrapped above for the 'arcseed-*' reason. So a
    // walk was NOT in the history tree at all. Measured on the real keypress (Duplex, Walk ELEC, 102 fixtures):
    // Ctrl+Z left all 102 active and only un-applied the "Opened Duplex" milestone. FIX: rows from dw* groups are
    // collected into an open WALK GESTURE (beginWalk/endWalk, called by modeller.html's discWalk/discWalkAll) and
    // pushed as ONE 'DISC_WALK' node carrying those rows, so it takes _restore's id-targeted §MHIST-ROWS path:
    // one Ctrl+Z = the whole walk (fixtures + runs + bend fittings), one Ctrl+Y = all of it back. A dw* commit
    // with no open gesture (a caller that did not begin one) still gets its own node, so no walk row is unreachable.
    // 'arcseed-*' and every other seed group are untouched. Per-disc rows are kept on window.__dwRowsByDisc so
    // modeller.html can hide an undone walk's decorative layer (§WALK-GESTURE-DRAW).
    var origSeed = O.commitSeedGroup, _walkGesture = null;
    window.__dwRowsByDisc = window.__dwRowsByDisc || {};
    O.commitSeedGroup = async function (ops, gid) {
      var r = await origSeed.call(this, ops, gid);
      try {
        var m = typeof gid === 'string' && /^dw(walk|chain|fit)-(.+)-\d+$/.exec(gid);
        var ids = (r && r.ids) || [];
        if (m && ids.length) {
          var kind = m[1], disc = m[2];
          if (kind === 'walk') window.__dwRowsByDisc[disc] = { walk: [], chain: [], fit: [] };   // a new walk of this disc
          var slot = window.__dwRowsByDisc[disc] = window.__dwRowsByDisc[disc] || { walk: [], chain: [], fit: [] };
          slot[kind] = slot[kind].concat(ids);
          if (_walkGesture) _walkGesture.rows = _walkGesture.rows.concat(ids);
          else _push('DISC_WALK', { label: disc, n: ids.length }, { rows: ids.slice(), gid: gid });
        }
      } catch (e) { console.warn('§MHIST_REC_ERR', e); }
      return r;
    };
    O.__mhistInWalk = function () { return !!_walkGesture; };
    O.__mhistBeginWalk = function (label) { _walkGesture = { label: label, rows: [] }; };
    O.__mhistEndWalk = function () {
      var g = _walkGesture; _walkGesture = null;
      if (g && g.rows.length) {
        _push('DISC_WALK', { label: g.label, n: g.rows.length }, { rows: g.rows.slice(), gid: 'walkgesture-' + g.rows[0] });
        console.log('§WALK-GESTURE recorded "' + g.label + '" rows=' + g.rows.length + ' (one Ctrl+Z undoes it all)');
      }
    };
    O.__mhistWrapped = true;
    console.log('§MHIST_WRAP commit/commitGesture wrapped +deleteFeature (§MHIST-ROWS)');
  })();

  // §THREADS step 1: the Modeller never mounted the shared dotline (only #hist-slider was visible) — mount it now.
  if (document.getElementById('hist-dots')) HB.open();

  window.ModellerHistory = {
    recordBuildingOpen: recordBuildingOpen,
    beginWalk: function (label) { var O = window.Bonsai && window.Bonsai.oplog; if (O && O.__mhistBeginWalk) O.__mhistBeginWalk(label); },
    endWalk: function () { var O = window.Bonsai && window.Bonsai.oplog; if (O && O.__mhistEndWalk) O.__mhistEndWalk(); },
    inWalk: function () { var O = window.Bonsai && window.Bonsai.oplog; return !!(O && O.__mhistInWalk && O.__mhistInWalk()); },
    attachDerived: attachDerived,
    undo: HB.undo, redo: HB.redo, jumpTo: HB.jumpTo, pending: pending,
    switchToId: HB.switchToId, tips: HB.tips, dumpTree: HB.dumpTree, setTreeKey: HB.setTreeKey,
    open: HB.open, toggleOpen: HB.toggleOpen, list: HB.list,
    // §THREADS
    categorize: categorize, elementOf: elementOf, threads: HB.threads, threadEntries: HB.threadEntries,
    getScope: HB.getScope, setScope: HB.setScope, clearScope: HB.clearScope, toggleThread: HB.toggleThread
  };
  console.log('§MHIST_READY source=modeller profile=high ops=' + Object.keys(OP_TYPES).length);
})();
