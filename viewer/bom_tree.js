/**
 * BIM OOTB — BOM Tree (the editable COMPOSITION facet of the Outliner).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bom_tree.js — Implementing SPATIAL_DEPENDENCY_GRAPH.md §OUTLINER-COHERENCE (composition facet = editable `contains`)
//   + §BUILD-DECOMPOSITION part 1 (Outliner BOM editor). Witness: W-BOM-TREE-EDIT.
//
// THE COMPOSITION FACET: unlike the read-only classification facets (storey/room/disc — group-bys), THIS facet's
// STRUCTURE is authored by drag — re-parent an element, grab an upper node for the whole branch. It is the BOM
// PRINCIPLE made live (recursive parent→children, user-composed) and the home of "pick a branch/bunch, edit/replace".
//
// OP-LOG-DRIVEN, NOT extracted.db-traversal: SEED once from elements (the immutable substrate, derived grouping), then
// the tree is `foldOps(seed, reparentOps)` — the log carries all change. RE-PARENT is a PURE RE-POINT (L0b metadata):
// it moves a child's parent pointer and TOUCHES NO GEOMETRY (this module never holds x/y/z) — "land the thread, then
// re-point it out". Op shape is kernel_ops-compatible ({opType,params}) so it ports straight onto the real signed log.
// GREP-CLEAN: ifc_class is only ever an opaque grouping key — no class-name literal drives a branch.

(function (window) {
'use strict';

// ── SEED — a derived grouping building → storey → discipline → class → element (provenance: derived-seed) ──
// elements: [{ guid, storey, disc, cls }]. Returns { nodes:{id:node}, roots:[id] }; node = {id,label,parent,kind,prov,guid?}.
function seedTree(elements, opts) {
  opts = opts || {};
  var building = opts.building || 'BUILDING';
  var nodes = {}, ROOT = 'B';
  nodes[ROOT] = { id: ROOT, label: building, parent: null, kind: 'building', prov: 'derived-seed' };
  function ensure(id, label, parent, kind) {
    if (!nodes[id]) nodes[id] = { id: id, label: label, parent: parent, kind: kind, prov: 'derived-seed' };
    return id;
  }
  for (var i = 0; i < elements.length; i++) {
    var e = elements[i];
    var st = e.storey == null ? 'Unknown' : e.storey;
    var dc = e.disc == null ? 'ARC' : e.disc;
    var cl = e.cls == null ? 'Unknown' : e.cls;
    var sId = ensure('S|' + st, st, ROOT, 'storey');
    var dId = ensure(sId + '|D|' + dc, dc, sId, 'disc');
    var cId = ensure(dId + '|C|' + cl, cl, dId, 'class');
    // element leaf — guid is the id (globally unique, GUID-bound = rename/regroup-proof)
    nodes[e.guid] = { id: e.guid, label: e.guid, parent: cId, kind: 'element', prov: 'derived-seed', guid: e.guid };
  }
  return { nodes: nodes, roots: [ROOT] };
}

// ── REPARENT — the one composition edit. Pure pointer move; refuses cycle / self / missing (data integrity). ──
function wouldCycle(tree, childId, newParentId) {
  var p = newParentId;
  while (p != null) { if (p === childId) return true; p = tree.nodes[p] ? tree.nodes[p].parent : null; }
  return false;
}
// returns true if applied; false if refused (and leaves the tree untouched).
function reparent(tree, childId, newParentId) {
  var c = tree.nodes[childId], np = tree.nodes[newParentId];
  if (!c || !np) return false;                 // missing node
  if (childId === newParentId) return false;    // self
  if (c.parent === newParentId) return false;   // no-op
  if (wouldCycle(tree, childId, newParentId)) return false; // cycle (parent under its own descendant)
  c.parent = newParentId;
  c.prov = 'user-authored';                     // provenance flips: this edge is now authored, not derived
  return true;
}

// op shape (kernel_ops-compatible): { opType:'BOM_REPARENT', params:{ childId, toParent } }.
function applyOp(tree, op) {
  if (op && op.opType === 'BOM_REPARENT') return reparent(tree, op.params.childId, op.params.toParent);
  return false;
}
// ── FOLD — the tree IS foldOps(seed, ops). Deterministic replay (last-writer-wins per child). ──
function foldOps(seed, ops) {
  var tree = clone(seed);
  for (var i = 0; i < (ops || []).length; i++) applyOp(tree, ops[i]);
  return tree;
}
function clone(tree) {
  var nodes = {};
  Object.keys(tree.nodes).forEach(function (k) {
    var n = tree.nodes[k];
    nodes[k] = { id: n.id, label: n.label, parent: n.parent, kind: n.kind, prov: n.prov, guid: n.guid };
  });
  return { nodes: nodes, roots: tree.roots.slice() };
}

// ── EN-BLOC — the bunch under a node (all element-leaf guids in its subtree). The selection a handler edits. ──
function bloc(tree, nodeId) {
  // children index
  var kids = {};
  Object.keys(tree.nodes).forEach(function (k) {
    var p = tree.nodes[k].parent; if (p != null) (kids[p] || (kids[p] = [])).push(k);
  });
  var out = [], stack = [nodeId];
  while (stack.length) {
    var id = stack.pop(), n = tree.nodes[id];
    if (!n) continue;
    if (n.kind === 'element') out.push(n.guid);
    (kids[id] || []).forEach(function (c) { stack.push(c); });
  }
  return out;
}

// all element-leaf guids in the tree (for the lossless-partition check)
function leaves(tree) {
  return Object.keys(tree.nodes).filter(function (k) { return tree.nodes[k].kind === 'element'; });
}

var API = { seedTree: seedTree, reparent: reparent, applyOp: applyOp, foldOps: foldOps, bloc: bloc,
            leaves: leaves, wouldCycle: wouldCycle };
window.BOMTree = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
