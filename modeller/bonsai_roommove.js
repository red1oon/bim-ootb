/**
 * BIM OOTB — Whole-room move (Feature A of ROOM_MOVE_AND_ITEM_DRAG_SPEC.md).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bonsai_roommove.js — Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §2 (Feature A,
// `GEOM_ROOM_MOVE`) — Witnesses: W-ROOM-MOVE, W-ROOM-MOVE-ROUNDTRIP.
//
// A ROOM is a qualified IfcSpace guid. Grabbing it and dragging translates the room AND everything that
// honestly belongs to it by ONE rigid `(dx,dy)` — committed as ONE signed op through the existing
// `window.Bonsai.oplog`, never as a THREE-matrix or BOM-tree mutation (spec §1 item 1).
//
// NON-INVENT MEMBERSHIP (spec §1 item 2 / §2.2) — three legs, each PROVENANCE-TAGGED in the op:
//   1. `rel_contained_in_space`  — real extracted containment edges. Always on.
//   2. `rel_space_boundary`      — REFUSED IN v1. Open Question Q1 resolved AGAINST: no extracted DB carries an
//      IfcRelSpaceBoundary-equivalent table (verified 2026-08-06 on modeller/Duplex_extracted.db and
//      modeller/SampleHouse_extracted.db — the only `rel_*` tables present are rel_adjacency, rel_aggregates,
//      rel_anchored, rel_contained_in_space, rel_fills_host, rel_spans) and `cross_edges.js` reads none either
//      (its `deriveAll` emits abuts/anchored/spans/fills/aggregates only — cross_edges.js:270-279). Per spec
//      §2.2 leg 2 the fallback is EXPLICIT: bounding walls DO NOT move in v1. We do NOT synthesize boundary
//      membership from wall-near-footprint proximity — that would be inventing a relationship. The leg is kept
//      wired (pass `ctx.spaceBoundary` rows) so it lights up for free the day an extractor emits the table.
//   3. `derived-footprint`       — a DISCLOSED derivation from real geometry (not a proximity heuristic dressed
//      up as a relationship): an element with NO containment edge at all, whose pre-drag AABB centre falls
//      inside the room's own `spatial_structure` footprint AABB, restricted to NON-structural classes. Same
//      standing as bom_tree.js's own AABB-based room qualification. When both leg 1 and leg 3 match, the REAL
//      EDGE WINS (leg 1 is applied first and leg 3 skips anything already a member).
// Then HOP TWO by COMPOSITION (spec §2.3): `SdgCascade.ridersFor(...)` is CALLED, never rewritten — sdg_cascade.js
// stays ONE HOP and untouched. Because a room move is a PURE RIGID TRANSLATION (no SCALE ever occurs) the
// fillings ride by the identical delta, so `stretchRide`'s proportional/anchored-min math is unnecessary.
//
// DUAL-EXPORT (window + node) like sdg_cascade.js / cross_edges.js so the value witnesses run pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BonsaiRoomMove = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§ROOMMOVE';

  // Mirrors bonsai_gridmove.js `_STRUCTURAL_CLASSES` (bonsai_gridmove.js:64-65) — leg 3 sweeps its COMPLEMENT
  // (spec §2.2 leg 3: "reuse the complement of bonsai_gridmove.js _STRUCTURAL_CLASSES"). Kept as its own copy
  // rather than reaching into `window.Bonsai.gridmove` so this module stays pure/node-witnessable; the grid
  // adapter is a browser-only object and MUST NOT be modified by this feature.
  var STRUCTURAL_CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcFooting', 'IfcColumn', 'IfcBeam',
    'IfcRailing', 'IfcStairFlight', 'IfcRoof'];

  // ── §2.1 ROOM QUALIFICATION ─────────────────────────────────────────────────────────────────────────
  // EXACTLY bom_tree.js seedFromDb()'s qualification (bom_tree.js:83-105), mirrored here because bom_tree.js
  // exports only the finished TREE (seedTree/seedFromDb/foldOps/bloc/leaves/reparent — bom_tree.js:180-181),
  // not the space→footprint map this feature grabs by, and bom_tree.js is a PROTECTED file this feature is not
  // permitted to edit. The rule, verbatim from that source: a ROOM is an `IfcSpace` row whose parent storey is
  // HABITABLE (≥1 IfcDoor on that storey NAME) AND whose `size_z` is NULL or ≥ minHabitableHeight (1.8 m).
  // ⚠ IF bom_tree.js's qualification EVER CHANGES, change it here too — they must not diverge.
  function qualifiedRooms(db, opts) {
    opts = opts || {};
    var MIN_H = opts.minHabitableHeight != null ? opts.minHabitableHeight : 1.8;
    var doorStoreys = {};
    try {
      var dq = db.exec("SELECT storey, COUNT(*) FROM elements_meta WHERE ifc_class='IfcDoor' AND storey IS NOT NULL GROUP BY storey");
      if (dq.length) dq[0].values.forEach(function (v) { if (v[1] > 0) doorStoreys[v[0]] = v[1]; });
    } catch (e) { /* no doors → nothing qualifies (honest) */ }
    var storeyName = {};
    try {
      var sq = db.exec("SELECT guid, name FROM spatial_structure WHERE type='IfcBuildingStorey'");
      if (sq.length) sq[0].values.forEach(function (v) { storeyName[v[0]] = v[1]; });
    } catch (e) { /* legacy schema → no storeys → no rooms */ }
    var out = [];
    try {
      var pq = db.exec("SELECT guid, name, parent_guid, size_z, center_x, center_y, size_x, size_y FROM spatial_structure WHERE type='IfcSpace'");
      if (pq.length) pq[0].values.forEach(function (v) {
        var nm = v[1], stn = storeyName[v[2]], h = v[3];
        var habitableStorey = stn != null && doorStoreys[stn] > 0;
        var habitableAABB = (h == null) || (h >= MIN_H);
        if (!(nm && habitableStorey && habitableAABB)) return;
        var cx = v[4], cy = v[5], sx = v[6], sy = v[7];
        // Footprint AABB — spatial_structure's own documented convention (see its schema comment:
        // "IfcSpace footprint AABB ... habitable area = size_x*size_y"). NULL geometry ⇒ no footprint ⇒
        // leg 3 simply cannot run for that room (leg 1 still can) — never a fabricated box.
        var fp = (cx != null && cy != null && sx != null && sy != null)
          ? [cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2] : null;
        out.push({ guid: v[0], name: nm, storey: stn, footprint: fp });
      });
    } catch (e) { /* no type/size columns → no rooms (graceful, same as bom_tree.js) */ }
    return out;
  }

  // Read the real containment edges once: { bySpace: {spaceGuid:[elementGuid…]}, contained: {elementGuid:1} }.
  // `contained` is the "has a containment edge AT ALL" set leg 3 excludes against (spec §2.2 leg 3:
  // "elements with NO containment edge"), so an element owned by ANOTHER room is never swept in by footprint.
  function readContainment(db) {
    var bySpace = {}, contained = {};
    try {
      var r = db.exec("SELECT element_guid, space_guid FROM rel_contained_in_space");
      if (r.length) r[0].values.forEach(function (v) {
        (bySpace[v[1]] = bySpace[v[1]] || []).push(v[0]); contained[v[0]] = 1;
      });
    } catch (e) { /* no containment table → leg 1 empty (graceful; leg 3 then carries the room) */ }
    return { bySpace: bySpace, contained: contained };
  }

  // ── §2.2 + §2.3 MEMBER ENUMERATION ──────────────────────────────────────────────────────────────────
  // PURE. ctx:
  //   spaceGuid     — the qualified room guid (grab target)
  //   containedGuids— leg 1: rel_contained_in_space element guids for THIS space (real extracted edges)
  //   spaceBoundary — leg 2: real IfcRelSpaceBoundary-equivalent element guids, or null/[] (Q1: none exist today)
  //   footprint     — leg 3: [minx,maxx,miny,maxy] from spatial_structure, or null
  //   containedAny  — leg 3 exclusion set {elementGuid:1} (has a containment edge to ANY space)
  //   boxByFid      — {fid:[minx,maxx,miny,maxy,minz,maxz]} pre-drag AABBs (the _gateBoxes/_buildBoxByFid shape)
  //   classByFid    — {fid: ifc_class} from the REAL committed GEOM_INSERT params (gridmove's _buildInsertMaps shape)
  //   fidByGuid / guidByFid — the §ARC-1 bridge
  //   fills         — window.swXEdges.fills rows (real rel_fills_host); absent ⇒ hop 2 no-ops byte-identically
  //   ridersFor     — SdgCascade.ridersFor (INJECTED — this module never rewrites sdg_cascade.js)
  // Returns { members:[{featureId, guid, via}], skippedNoBridge:[guid…], byVia:{via:count} }.
  function enumerateMembers(ctx) {
    ctx = ctx || {};
    var fidByGuid = ctx.fidByGuid || {}, guidByFid = ctx.guidByFid || {};
    var boxByFid = ctx.boxByFid || {}, classByFid = ctx.classByFid || {};
    var structural = ctx.structuralClasses || STRUCTURAL_CLASSES;
    var members = [], seen = {}, skippedNoBridge = [];

    function add(guid, fid, via) {
      if (seen[fid]) return false;                       // first (most REAL) leg wins — leg order below is the rule
      seen[fid] = 1; members.push({ featureId: fid, guid: guid, via: via }); return true;
    }
    // A member with no fid↔guid bridge entry is SKIPPED with a logged count, never guessed (spec §2.7,
    // mirrors ridersFor's "no guid → no ride").
    function addByGuid(guid, via) {
      var fid = fidByGuid[guid];
      if (fid == null) { skippedNoBridge.push(guid); return false; }
      return add(guid, fid, via);
    }

    // LEG 1 — real extracted containment edges. Primary, always-on.
    (ctx.containedGuids || []).forEach(function (g) { addByGuid(g, 'rel_contained_in_space'); });

    // LEG 2 — real space-boundary edges ONLY. Q1: no such table exists in any shipped extracted DB, so this
    // is empty in v1 and bounding walls stay put. NEVER synthesized from proximity (spec §2.2 leg 2).
    (ctx.spaceBoundary || []).forEach(function (g) { addByGuid(g, 'rel_space_boundary'); });

    // LEG 3 — disclosed geometric derivation: no containment edge anywhere + AABB centre inside the room
    // footprint + NON-structural class + NOT a hosted filling. Absent footprint ⇒ the leg cannot run (never a
    // fabricated footprint).
    // The filling exclusion is spec §2.3's own explicit invariant, not an extra rule: "a room's fillings move
    // only because their HOST wall moved (hop 2) or because they are themselves contained (leg 1)". Without it
    // the class filter alone would sweep a door/window in (IfcDoor/IfcWindow are not in _STRUCTURAL_CLASSES and
    // a door's AABB centre genuinely sits inside the room footprint — observed live on SampleHouse, W-ROOM-MOVE
    // T5), which would DIVORCE it from a host wall that Q1 leaves standing still — precisely the door-out-of-host
    // RED the conformity gate exists to flag (sdg_gate.js). Resolved ONLY over the real rel_fills_host edges.
    var fp = ctx.footprint, containedAny = ctx.containedAny || {};
    var isFilling = {};
    if (Array.isArray(ctx.fills)) ctx.fills.forEach(function (e) { if (e && e.filling_guid != null) isFilling[e.filling_guid] = 1; });
    if (fp) {
      Object.keys(boxByFid).forEach(function (k) {
        var fid = isNaN(+k) ? k : +k;
        if (seen[fid]) return;
        var guid = guidByFid[fid];
        if (guid != null && containedAny[guid]) return;         // owned by SOME room already → never footprint-swept
        if (guid != null && isFilling[guid]) return;            // a hosted filling rides its HOST (§2.3), never the footprint
        var cls = classByFid[fid];
        if (cls != null && structural.indexOf(cls) !== -1) return;   // known STRUCTURAL class → excluded
        var b = boxByFid[k];
        if (!b) return;
        var cxc = (b[0] + b[1]) / 2, cyc = (b[2] + b[3]) / 2;
        if (cxc < fp[0] || cxc > fp[1] || cyc < fp[2] || cyc > fp[3]) return;
        add(guid != null ? guid : null, fid, 'derived-footprint');
      });
    }

    // HOP 2 — §2.3: CALL sdg_cascade.js's existing pure one-hop function once. A moved wall's hosted fillings
    // join the set (deduped by ridersFor itself against `movedSet`). Where `fills` is absent (SampleCastle per
    // RESUME_CASCADE_INTO_STRETCH.md recon) this no-ops byte-identically — same graceful degradation as
    // §STRETCH-RIDE. Directionality is sdg_cascade.js's own: fillings never drag hosts.
    var ridersFor = ctx.ridersFor ||
      (typeof window !== 'undefined' && window.SdgCascade ? window.SdgCascade.ridersFor : null);
    if (ridersFor && ctx.fills) {
      var movedFids = members.map(function (m) { return m.featureId; });
      var movedSet = new Set(movedFids);
      var riders = ridersFor(movedFids, guidByFid, fidByGuid, ctx.fills, movedSet) || [];
      riders.forEach(function (rfid) { add(guidByFid[rfid] != null ? guidByFid[rfid] : null, rfid, 'rel_fills_host'); });
    }

    var byVia = {};
    members.forEach(function (m) { byVia[m.via] = (byVia[m.via] || 0) + 1; });
    return { members: members, skippedNoBridge: skippedNoBridge, byVia: byVia };
  }

  // ── §2.4 OP SHAPE ───────────────────────────────────────────────────────────────────────────────────
  // ONE op per drag-release carrying the full resolved member list, so the fold has one unambiguous branch and
  // undo is ONE step (the GEOM_GRID_MOVE precedent). `dz` is carried in the shape but v1 REFUSES a non-zero one
  // (Q4, see assertInPlane).
  function roomMoveOp(spaceGuid, dx, dy, dz, members) {
    return {
      op_type: 'GEOM_ROOM_MOVE',
      parameters: {
        spaceGuid: spaceGuid, dx: dx || 0, dy: dy || 0, dz: dz || 0,
        members: (members || []).map(function (m) { return { featureId: m.featureId, guid: m.guid, via: m.via }; })
      },
      input_guids: (members || []).map(function (m) { return m.guid; }).filter(function (g) { return g != null; }),
      output_guid: spaceGuid
    };
  }

  // Q4 — RESOLVED: HARD-REJECT `dz != 0` at commit, not merely hide it in the UI. Verified against the live
  // code: an element's storey is EXTRACTED SUBSTRATE — `elements_meta.storey` is read by bom_tree.js:77/83 and
  // never written by any op, and no op type in this codebase expresses a storey reassignment (grep of every
  // committed op_type: GEOM_INSERT/MOVE/ROTATE/SCALE/CUT/FILLET/GRID_MOVE/… + BOM_REPARENT, which
  // bom_tree.js:127-136 defines as a PURE POINTER MOVE that "TOUCHES NO GEOMETRY"). A `dz` would therefore
  // silently carry geometry out of the storey the substrate still records it in, with no op able to say so.
  // Refuse instead — spec §1 item 5, and §4's "no room-to-different-storey move" non-goal.
  function assertInPlane(dz) {
    if (dz) throw new Error(TAG + ' REFUSED dz=' + dz + ' — GEOM_ROOM_MOVE is in-plane only (storey assignment is ' +
      'extracted substrate; no op expresses a storey change). Spec §4 / Q4.');
  }

  // ── THE FOLD (spec §2.4: "semantically N GEOM_MOVEs, folded from one row") ───────────────────────────
  // Q2 — RESOLVED: the fold lives in BOTH paths, exactly as GEOM_GRID_MOVE does:
  //   • HOST side — bonsai_kernel.js `foldChainToScene` accumulates a net per-featureId delta (`moveBy`,
  //     bonsai_kernel.js:238-247) which bonsai_library.js `foldInsert(op, mv, …)` applies to every GEOM_INSERT
  //     (bonsai_library.js:395/463). This function IS that accumulation — bonsai_kernel.js calls it, and so do
  //     the witnesses, so there is exactly ONE definition of what a GEOM_ROOM_MOVE means to the fold.
  //   • WORKER side — bonsai_kernel_worker.js's B-rep branch (mirrors its GEOM_GRID_MOVE TRANSLATE at :478).
  // `moveBy` is a Map fid → {dx,dy,dz,drot,fx,fy,fz} in bonsai_kernel.js's own accumulator shape.
  function accumulate(params, moveBy) {
    var P = typeof params === 'string' ? JSON.parse(params) : params;
    if (!P) return moveBy;
    var dx = P.dx || 0, dy = P.dy || 0, dz = P.dz || 0;
    (P.members || []).forEach(function (m) {
      if (!m || m.featureId == null) return;
      var a = moveBy.get(m.featureId) || { dx: 0, dy: 0, dz: 0, drot: 0, fx: 1, fy: 1, fz: 1 };
      a.dx += dx; a.dy += dy; a.dz += dz;
      moveBy.set(m.featureId, a);
    });
    return moveBy;
  }

  var API = {
    STRUCTURAL_CLASSES: STRUCTURAL_CLASSES,
    qualifiedRooms: qualifiedRooms, readContainment: readContainment,
    enumerateMembers: enumerateMembers, roomMoveOp: roomMoveOp,
    assertInPlane: assertInPlane, accumulate: accumulate
  };

  // ── §2.5 INTERACTION LIFECYCLE (browser) — mirrors bonsai_gridmove.js verbatim in STRUCTURE ──────────
  // beginRoomDragSession → previewCommands(dx,dy) per frame → commit(dx,dy) → endDragSession. §SCALE_CHECK_FIX:
  // membership + the box/mesh/class maps are built ONCE at grab and reused every pointermove frame (membership
  // cannot change mid-drag — nothing commits until pointerup). The SAME previewCommands() drives both the tint
  // and the commit, so preview and commit can NEVER disagree (spec §1 item 3).
  if (typeof window !== 'undefined') {
    var RM = {
      _session: null,

      // fid → ifc_class off the REAL committed GEOM_INSERT rows. Same query + same shape bonsai_gridmove.js
      // `_buildInsertMaps` uses (bonsai_gridmove.js:80-95) — read here independently so this feature never
      // has to touch the grid adapter.
      _buildClassByFid: function () {
        var out = {}, O = window.Bonsai && window.Bonsai.oplog;
        if (!O || !O.db) return out;
        try {
          var r = O.db.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
          if (r.length) r[0].values.forEach(function (v) {
            try { var p = JSON.parse(v[1]); if (p && p.ifc_class) out[v[0]] = p.ifc_class; } catch (e) { }
          });
        } catch (e) { }
        return out;
      },
      // Pre-drag world AABBs of every authored mesh — the _gateBoxes/_buildBoxByFid shape. A snapshot of the
      // PRE-edit state, so it is invariant across every frame of the same drag (§SCALE_CHECK_FIX).
      _buildBoxByFid: function () {
        var g = window.Bonsai && window.Bonsai.group && window.Bonsai.group(), out = {};
        if (!g) return out;
        g.children.forEach(function (m) {
          if (m.isMesh && m.userData && m.userData.featureId != null) {
            m.geometry.computeBoundingBox(); var b = m.geometry.boundingBox;
            out[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
          }
        });
        return out;
      },
      _buildMeshByFid: function () {
        var g = window.Bonsai && window.Bonsai.group && window.Bonsai.group(), out = {};
        if (!g) return out;
        g.children.forEach(function (m) { if (m.isMesh && m.userData && m.userData.featureId != null) out[m.userData.featureId] = m; });
        return out;
      },

      // Grab. `room` = {guid, footprint} (from qualifiedRooms) or just a guid when the caller already has the
      // building db on window.__roomMoveDb. Returns the session, or NULL on a refusal (spec §2.7):
      //   • space not qualified as a room → not grabbable
      //   • room resolves but has ZERO members across all legs → refuse the grab, nothing honest to move
      beginRoomDragSession: function (spaceGuid, opts) {
        opts = opts || {};
        var db = opts.db || window.__roomMoveDb || null;
        var room = opts.room || null;
        if (!room && db) {
          room = qualifiedRooms(db, opts).filter(function (r) { return r.guid === spaceGuid; })[0] || null;
        }
        if (!room) {
          console.error(TAG + ' REFUSED grab space=' + spaceGuid + ' — not a qualified room (layer storey / sub-height / unknown). Spec §2.7');
          return null;
        }
        var cont = db ? readContainment(db) : { bySpace: {}, contained: {} };
        var boxByFid = this._buildBoxByFid();
        var res = enumerateMembers({
          spaceGuid: spaceGuid,
          containedGuids: cont.bySpace[spaceGuid] || [],
          spaceBoundary: opts.spaceBoundary || null,     // Q1: no extracted DB carries this table today
          footprint: room.footprint,
          containedAny: cont.contained,
          boxByFid: boxByFid,
          classByFid: this._buildClassByFid(),
          fidByGuid: window.__arcFidByGuid || {},
          guidByFid: window.__arcGuidByFid || {},
          fills: (window.swXEdges && window.swXEdges.fills) || null,
          ridersFor: window.SdgCascade && window.SdgCascade.ridersFor
        });
        if (!res.members.length) {
          console.error(TAG + ' REFUSED grab room="' + room.name + '" space=' + spaceGuid +
            ' — ZERO members across all legs (contained/boundary/footprint/fills); nothing honest to move. Spec §2.7');
          return null;
        }
        if (res.skippedNoBridge.length)
          console.log(TAG + ' skipped=' + res.skippedNoBridge.length + ' member(s) with no fid↔guid bridge entry (never guessed) — spec §2.7');
        this._session = {
          spaceGuid: spaceGuid, room: room, members: res.members, byVia: res.byVia,
          boxByFid: boxByFid, meshByFid: this._buildMeshByFid()
        };
        console.log(TAG + ' §SESSION begin room="' + room.name + '" space=' + spaceGuid + ' members=' + res.members.length +
          ' via[' + Object.keys(res.byVia).map(function (k) { return k + '=' + res.byVia[k]; }).join(' ') + ']' +
          ' — enumerated ONCE, reused every pointermove frame (§SCALE_CHECK_FIX)');
        return this._session;
      },

      // PURE per-frame: the member/delta list. Drives the tint AND is called by commit() below — one pipeline.
      previewCommands: function (dx, dy) {
        var s = this._session;
        if (!s) return { members: [], dx: 0, dy: 0, dz: 0 };
        return { members: s.members, dx: dx || 0, dy: dy || 0, dz: 0, spaceGuid: s.spaceGuid };
      },

      // Commit ONE signed GEOM_ROOM_MOVE per drag-release (spec §2.4). Single op — the gesture-group path
      // bonsai_gridmove.js uses for §STRETCH-RIDE is NOT needed: there are no per-member deltas to split out,
      // every member shares the ONE rigid delta.
      commit: async function (dx, dy, dz) {
        var s = this._session;
        if (!s) { console.error(TAG + ' commit with no active session — refused'); return null; }
        assertInPlane(dz || 0);                                  // Q4: hard-reject, never silently drop
        var p = this.previewCommands(dx, dy);
        var op = roomMoveOp(s.spaceGuid, p.dx, p.dy, 0, p.members);
        var res = await window.Bonsai.oplog.commit({ op_type: op.op_type, parameters: op.parameters }, {});
        console.log(TAG + ' commit space=' + s.spaceGuid + ' Δ(' + p.dx.toFixed(3) + ',' + p.dy.toFixed(3) + ',0.000)' +
          ' members=' + p.members.length + ' via[' + Object.keys(s.byVia).map(function (k) { return k + '=' + s.byVia[k]; }).join(' ') + ']' +
          ' verify=' + res.verify + ' tris=' + res.triangleCount);
        return Object.assign({}, res, { members: p.members, dx: p.dx, dy: p.dy });
      },

      endDragSession: function () {
        if (this._session) console.log(TAG + ' §SESSION end — member/box/mesh caches cleared');
        this._session = null;
      }
    };
    Object.keys(API).forEach(function (k) { if (RM[k] === undefined) RM[k] = API[k]; });
    window.Bonsai = window.Bonsai || {};
    window.Bonsai.roommove = RM;
    console.log(TAG + ' module loaded');
  }

  return API;
});
