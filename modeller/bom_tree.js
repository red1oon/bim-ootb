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
  var layerOf = opts.storeyLayer || {};   // storey name → true when it's a LAYER (roof/foundation slab)
  for (var i = 0; i < elements.length; i++) {
    var e = elements[i];
    var st = e.storey == null ? 'Unknown' : e.storey;
    var dc = e.disc == null ? 'ARC' : e.disc;
    var cl = e.cls == null ? 'Unknown' : e.cls;
    // A storey with NO openings (doors) is a LAYER, not a habitable storey — labelled, not counted.
    var isLayer = layerOf[st] === true;
    var sId = ensure('S|' + st, isLayer ? (st + ' · layer') : st, ROOT, 'storey');
    if (isLayer) nodes[sId].layer = true;
    // ROOM level (the spatial `contains` edge) — inserted between storey and discipline ONLY when the
    // element has a real IfcSpace container (e.room, derived from rel_contained_in_space). Buildings with
    // no IfcSpace (rooms = weak handle) simply skip this level — NON-INVENT, never a fabricated room.
    var underStorey = sId;
    if (e.room != null && e.room !== '') underStorey = ensure(sId + '|R|' + e.room, e.room, sId, 'room');
    var dId = ensure(underStorey + '|D|' + dc, dc, underStorey, 'disc');
    var cId = ensure(dId + '|C|' + cl, cl, dId, 'class');
    // element leaf — guid is the id (globally unique, GUID-bound = rename/regroup-proof)
    nodes[e.guid] = { id: e.guid, label: e.guid, parent: cId, kind: 'element', prov: 'derived-seed', guid: e.guid };
  }
  // Materialize EVERY qualified room as a node under its storey — a real spatial container appears in the
  // tree even when no element is contained in it (e.g. SampleHouse "3 - Entrance hall", 0 contents).
  (opts.rooms || []).forEach(function (rm) {
    var st = rm.storey == null ? 'Unknown' : rm.storey;
    var isLayer = layerOf[st] === true;
    var sId = ensure('S|' + st, isLayer ? (st + ' · layer') : st, ROOT, 'storey');
    if (isLayer) nodes[sId].layer = true;
    ensure(sId + '|R|' + rm.name, rm.name, sId, 'room');
  });
  return { nodes: nodes, roots: [ROOT] };
}

// SEED FROM a building DB — reads elements_meta + the spatial structure, then qualifies rooms & storeys
// by the OPENING (door) signal + the habitable footprint AABB (SPATIAL_DEPENDENCY_GRAPH room/storey design):
//   • a STOREY is HABITABLE when it has ≥1 opening (IfcDoor); else it is a LAYER (roof/foundation slab),
//     labelled "· layer", not counted as a storey.
//   • a ROOM is an IfcSpace whose parent storey is habitable AND (when its footprint AABB is present) whose
//     ceiling height ≥ minHabitableHeight — so a thin roof void (e.g. SampleHouse "4 - Roof", h≈1.0m on a
//     door-less storey) is NOT a room, while the 2.5m-high Ground-Floor spaces ARE.
// measure-don't-whitelist: counts IfcDoor + reads the space AABB; no per-room class whitelist. NON-INVENT:
// every room/storey comes from a real spatial_structure row; absent tables → graceful storey-only tree.
function seedFromDb(db, opts) {
  opts = opts || {};
  var MIN_H = opts.minHabitableHeight != null ? opts.minHabitableHeight : 1.8;   // m — habitable ceiling clearance
  var r = db.exec("SELECT guid, ifc_class, storey, discipline FROM elements_meta");
  var els = (r.length ? r[0].values : []).map(function (v) { return { guid: v[0], cls: v[1], storey: v[2], disc: v[3] }; });

  // OPENING signal: doors per storey NAME. A storey name with ≥1 door = habitable; else a layer.
  var doorStoreys = {};
  try {
    var dq = db.exec("SELECT storey, COUNT(*) FROM elements_meta WHERE ifc_class='IfcDoor' AND storey IS NOT NULL GROUP BY storey");
    if (dq.length) dq[0].values.forEach(function (v) { if (v[1] > 0) doorStoreys[v[0]] = v[1]; });
  } catch (e) { /* no doors → every storey reads as a layer (honest: nothing qualifies a room) */ }

  // storey guid → name, then qualify each IfcSpace as a ROOM (parent habitable + habitable-height AABB).
  var storeyName = {}, layer = {};
  try {
    var sq = db.exec("SELECT guid, name FROM spatial_structure WHERE type='IfcBuildingStorey'");
    if (sq.length) sq[0].values.forEach(function (v) {
      storeyName[v[0]] = v[1];
      if (v[1] != null && !(doorStoreys[v[1]] > 0)) layer[v[1]] = true;   // named storey, no openings → LAYER
    });
  } catch (e) { /* old schema / no storeys */ }
  var spaceRoom = {}, roomList = [];   // qualified space guid → room name; + [{name, storey}] for empty rooms
  try {
    var pq = db.exec("SELECT guid, name, parent_guid, size_z FROM spatial_structure WHERE type='IfcSpace'");
    if (pq.length) pq[0].values.forEach(function (v) {
      var nm = v[1], stn = storeyName[v[2]], h = v[3];
      var habitableStorey = stn != null && doorStoreys[stn] > 0;
      var habitableAABB = (h == null) || (h >= MIN_H);    // no geometry → don't reject on the AABB leg
      if (nm && habitableStorey && habitableAABB) { spaceRoom[v[0]] = nm; roomList.push({ name: nm, storey: stn }); }
    });
  } catch (e) { /* spatial_structure lacks type/size_z (legacy DB) → no room level (graceful) */ }

  // element → room: only when the containing space qualified as a room.
  var room = {};
  try {
    var rr = db.exec("SELECT element_guid, space_guid FROM rel_contained_in_space");
    if (rr.length) rr[0].values.forEach(function (v) { if (spaceRoom[v[1]]) room[v[0]] = spaceRoom[v[1]]; });
  } catch (e) { /* no containment → storey-only (graceful) */ }

  for (var i = 0; i < els.length; i++) els[i].room = room[els[i].guid] || null;
  opts.storeyLayer = layer;
  opts.rooms = roomList;   // seed ALL qualified rooms — a real container shows even with no elements inside
  return seedTree(els, opts);
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

var API = { seedTree: seedTree, seedFromDb: seedFromDb, reparent: reparent, applyOp: applyOp, foldOps: foldOps, bloc: bloc,
            leaves: leaves, wouldCycle: wouldCycle };
window.BOMTree = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
