/**
 * BIM OOTB — BOM Tree ⇄ Outliner wiring (the ARC BOM editor in the Modeller).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bom_tree_outliner.js — wires the composition facet (bom_tree.js) into the modeller Outliner (bonsai_outliner.js).
// Implementing SPATIAL_DEPENDENCY_GRAPH.md §OUTLINER-COHERENCE + §BUILD-DECOMPOSITION part 1. Witness: W-BOMTREE-OUTLINER.
//
// A normal OPEN icon loads ANY extracted.db (no special BOM-drop panel — user direction 2026-06-25); its elements_meta
// SEED the BOM Tree (building→storey→disc→class→element). Re-parent by drag = a SIGNED BOM_REPARENT op in kernel_ops
// (the one log); geometry is NEVER touched (pure pointer re-point — "land the thread, then re-point it out"). The tree
// is foldOps(seed, reparentOps) — op-log-driven, deterministic replay. GREP-CLEAN: no IFC class literal drives a branch.

(function (window) {
'use strict';
var T = (typeof window !== 'undefined' && window.BOMTree) ? window.BOMTree
        : (typeof require !== 'undefined' ? require('./bom_tree.js') : null);

// ── PURE (node-witnessable) ────────────────────────────────────────────────────────────────────────
function seedFromElements(elements, building) { return T.seedTree(elements, { building: building || 'Building' }); }
function foldReparents(seed, reparentOps) {
  return T.foldOps(seed, (reparentOps || []).map(function (o) { return { opType: 'BOM_REPARENT', params: o }; }));
}
// convert BOMTree {nodes,roots} → nested render nodes [{id,label,sub,kind,children}] for the Outliner (sorted = stable)
function treeNodes(tree) {
  if (!tree) return [];
  var kids = {};
  Object.keys(tree.nodes).forEach(function (k) { var p = tree.nodes[k].parent; if (p != null) (kids[p] || (kids[p] = [])).push(k); });
  function leafCount(id) { var ch = kids[id] || []; if (!ch.length) return tree.nodes[id].kind === 'element' ? 1 : 0; var c = 0; ch.forEach(function (k) { c += leafCount(k); }); return c; }
  function build(id) {
    var n = tree.nodes[id], ch = (kids[id] || []).slice();
    var isLeaf = n.kind === 'element';
    var node = { id: id, kind: isLeaf ? 'element' : 'group',
      label: isLeaf ? shortGuid(n.guid != null ? n.guid : n.label) : n.label,
      sub: isLeaf ? (n.prov === 'user-authored' ? '✎ moved' : '') : ('(' + leafCount(id) + ')'),
      children: isLeaf ? [] : ch.map(build).sort(byLabel) };
    // W-UX-4: tag a DISCIPLINE node so the Outliner can make it a WALKER entry point (click → walk that disc).
    if (n.kind === 'disc') node.disc = n.label;
    return node;
  }
  return tree.roots.map(build);
}
function byLabel(a, b) { return a.kind !== b.kind ? (a.kind === 'group' ? -1 : 1) : (a.label < b.label ? -1 : a.label > b.label ? 1 : 0); }
function shortGuid(g) { g = String(g); return g.length > 12 ? g.slice(0, 10) + '…' : g; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { seedFromElements: seedFromElements, foldReparents: foldReparents, treeNodes: treeNodes };
}

// ── BROWSER glue (Open icon · signed commit · category registration) ─────────────────────────────────
if (typeof window !== 'undefined' && window.document) {
  var State = { seed: null, building: null, seq: 0 };

  function reparentOpsFromLog() {
    var db = window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.db; if (!db) return [];
    try {
      var r = db.exec("SELECT parameters FROM kernel_ops WHERE op_type='BOM_REPARENT' AND undone=0 ORDER BY id");
      return r.length ? r[0].values.map(function (v) { return JSON.parse(v[0]); }) : [];
    } catch (e) { return []; }
  }
  function currentTree() { return State.seed ? foldReparents(State.seed, reparentOpsFromLog()) : null; }

  function commitReparent(childId, toParent) {
    var db = window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.db;
    if (!db || !window.KernelOps) { console.warn('§BOMTREE no oplog db — cannot sign reparent'); return; }
    var baseTs = 1800000000000 + (State.seq++) * 1000;   // dedicated band, deterministic, no Date.now
    window.KernelOps.commitGroup(db, [{ op_type: 'BOM_REPARENT', params: { childId: childId, toParent: toParent } }],
      { gid: 'bomtree-' + childId + '-' + toParent + '-' + State.seq, baseTs: baseTs })
      .then(function (res) {
        console.log('§BOMTREE reparent SIGNED child=' + childId + ' →' + toParent + ' ok=' + (res && res.committed));
        if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
      })
      .catch(function (e) { console.warn('§BOMTREE commit failed', e && e.message); });
  }

  function category() {
    return {
      key: 'bomtree', label: 'BOM Tree',
      tree: function () { var t = currentTree(); return t ? treeNodes(t) : []; },
      onReparent: function (childId, targetId) {
        var t = currentTree(); if (!t || !t.nodes[targetId]) return;
        var tgt = t.nodes[targetId];
        var toParent = (tgt.kind === 'element') ? tgt.parent : targetId;   // drop on a group → into it; on a leaf → as a sibling
        // validate on a throwaway fold (cycle/self/missing refused, geometry untouched) before signing
        if (!T.reparent(currentTree(), childId, toParent)) { console.warn('§BOMTREE reparent refused', childId, '→', toParent); return; }
        commitReparent(childId, toParent);
      },
      // W-UX-4: a discipline node is a WALKER entry point — click it → walk that disc. The cross-engine
      // dispatch (STR=swbInit walk, already done at Open; MEP/etc=RouteWalker or an honest refusal) lives in
      // window.discWalk (modeller.html UX glue) so this category stays a pure BOM-graph view.
      onWalk: function (disc) { if (window.discWalk) window.discWalk(disc, { building: State.building }); }
    };
  }

  // Seed the BOM Tree from an OPEN building DB (the contains backbone: building→storey→ROOM→disc→class→
  // element). Shared by the standalone 📂 Open and the guided resident Open (DISC/ARC). seedFromDb adds the
  // ROOM level from the spatial `contains` edge when the building has IfcSpace (else storey-only, graceful).
  function loadFromDb(db, building) {
    State.building = (building || 'Building').replace(/\.db$/i, '').replace(/_(meta|extracted)$/i, '');
    State.seed = T.seedFromDb(db, { building: State.building });
    var nRoom = Object.keys(State.seed.nodes).filter(function (k) { return State.seed.nodes[k].kind === 'room'; }).length;
    var nElem = T.leaves(State.seed).length;
    console.log('§BOMTREE seeded "' + State.building + '" elements=' + nElem + ' rooms=' + nRoom + ' → BOM-graph tab');
    if (window.Bonsai.outliner) window.Bonsai.outliner.refresh();
    return { elements: nElem, rooms: nRoom };
  }

  function openExtractedDb(file) {
    if (!window.SQL) { console.warn('§BOMTREE sql.js not ready'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var db = new window.SQL.Database(new Uint8Array(fr.result));
        loadFromDb(db, file.name);
        db.close();
      } catch (e) { console.warn('§BOMTREE open failed', e && e.message); }
    };
    fr.readAsArrayBuffer(file);
  }

  // (W-UX-2 2026-06-26) The old top-left `📂 Open` icon was REMOVED — Open is now a pill-rail verb (the chooser
  // of the 4 residents + a local .db door). `openExtractedDb` (local-file → seed the BOM-graph tab) stays exported
  // for that pill path. RESUME_MODELLER_UX_OUTLINER_PILL §W-UX-2.

  // §GRID-CLEAR-LEAK ROUND 2 (RESUME_SESSION_2026-07-04_GATE_BACKPROP.md §OPEN item 4): `#b-clear` never
  // reset `State.seed`/`State.building` — the SAME class of bug fixed for STR's walker (see
  // str_walker_outliner.js onClear). `category().tree()` degrades gracefully to `[]` when State.seed is
  // null (no crash today), but the tab kept showing the PREVIOUS building's full BOM tree after a Clear +
  // opening a different building — a real display/data-integrity gap (a reparent drag on the stale tree
  // would sign a BOM_REPARENT against the wrong building's GUIDs; `bom_tree.js`'s reparent guards against a
  // hard crash, but the wrong-building intent was never surfaced).
  function onClear() {
    State.seed = null; State.building = null; State.seq = 0;
    if (window.Bonsai && window.Bonsai.outliner) window.Bonsai.outliner.refresh();
    console.log('§BOMTREE §GRID-CLEAR-LEAK onClear — State.seed cleared');
  }

  window.BOMTreeOutliner = {
    register: function () {
      if (window.Bonsai && window.Bonsai.outliner) window.Bonsai.outliner.addCategory(category());
      console.log('§BOMTREE registered — BOM-graph (ARC) category (signed re-parent, geometry untouched); Open re-homed to the pill rail');
    },
    openExtractedDb: openExtractedDb, loadFromDb: loadFromDb, _category: category, _currentTree: currentTree,
    onClear: onClear
  };
}

})(typeof window !== 'undefined' ? window : globalThis);
