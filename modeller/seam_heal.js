// seam_heal.js -- SPEC_SEAM_HEALING_ENGINE.md §2 Tier 1: trim-to-neighbor-face-plane seam healing.
// Answers "does this element look natural where it MEETS its neighbors" -- the gap the mesh-fit/graft
// engine (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md) deliberately left open (§4 "seam-healing... out of scope for
// the first version"). Applies UNIFORMLY to MEASURED and GRAFTED elements alike (healing isn't graft-
// specific, per §2's mechanism step 1).
//
// §1 (explicitly rejected, not deferred): true CSG boolean union. This is Revit's own wall-join mechanism
// instead -- trim each element to stop at its neighbor's nearest face PLANE, a real half-space clip against
// a flat plane. No self-intersection risk, no CSG robustness problem (see arXiv:1605.01760 for why that
// tool class is genuinely hard) -- this project's "own the mid-ground" bar (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md
// §2) explicitly does not need construction-grade seam precision.
//
// REUSE, not reinvent (per this project's standing rule):
//   - junction DETECTION reuses cross_edges.js's own faceTouch/deriveAdjacency/readBoxes (the same real-
//     AABB-with-yaw machinery cross_edges.js already built and proved for the SDG `abuts` edge) -- just
//     called with a WIDER tolerance suited to "is this close enough to need healing" rather than
//     cross_edges.js's own tight 0.03m "is this a real measured touch" tolerance.
//   - axis-permutation-under-yaw math mirrors mesh_graft.js's own trusted axis-permutation convention
//     (§6 of the mesh-fit spec) -- extended here to invert a WORLD-space plane back into local mesh space.
//   - REFUSE-over-FABRICATE for anything outside the well-tested case (a gap that would need geometry
//     ADDED, not clipped; a non-yaw-multiple-of-90 rotation) mirrors disc_walker.js's own hostBind
//     discipline: a junction with no honest trim stays untouched and is counted as refused, never guessed.
//
// PURE, dual-export (node + browser) like real_geometry.js/mesh_graft.js/cross_edges.js -- no THREE/DOM
// dependency, witnessable headless in node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./cross_edges.js'));
  else root.SeamHeal = factory(root.CrossEdges);
})(typeof window !== 'undefined' ? window : this, function (CrossEdges) {
  'use strict';
  var TAG = '§SEAMHEAL';

  // Wider than cross_edges.js's TOL=0.03 (tuned to confirm a REAL measured touch already exists) -- this
  // tier's whole job is to catch the cases a grafted/placed element MISSES that mark, i.e. a real corner
  // overlap or short-of-corner gap on the order of a wall thickness, not sub-cm noise. Exposed as opts.tol
  // for callers with a different real scale (e.g. MEP fittings, much smaller than walls).
  var JUNCTION_TOL = 0.5;      // metres
  var MIN_OVERLAP = CrossEdges ? CrossEdges.MIN_OVERLAP : 0.02;

  function toFloat32(blob) { return blob instanceof Float32Array ? blob : new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
  function toUint32(blob) { return blob instanceof Uint32Array ? blob : new Uint32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }

  // detectJunctions(db, opts) -> [{a, b, aAabb, bAabb, axis ('X'|'Y'|'Z'), gap_m, contact_m2}]
  // aAabb/bAabb = [minX,maxX,minY,maxY,minZ,maxZ] REAL world AABBs (cross_edges.js's own §REAL-AABB
  // convention -- rotated+translated real mesh envelope when resolvable, coarse element_transforms bbox
  // otherwise). gap_m > 0 == a real gap on the touch axis (short-of-corner); < 0 == real overlap
  // (past-the-corner) -- cross_edges.js's own faceTouch reports |gap| only, so this recomputes the SIGNED
  // value directly off the AABBs (needed to tell "trim" from "cannot honestly close a gap" apart).
  function detectJunctions(db, opts) {
    opts = opts || {};
    if (!CrossEdges || !CrossEdges.readBoxes || !CrossEdges.faceTouch) return [];
    var tol = opts.tol != null ? opts.tol : JUNCTION_TOL;
    var minOv = opts.minOverlap != null ? opts.minOverlap : MIN_OVERLAP;
    var boxes = CrossEdges.readBoxes(db, opts.geoDb);
    var byGuid = {};
    boxes.forEach(function (b) { byGuid[b.guid] = b.aabb; });
    // sweep-and-prune on X, same shape as cross_edges.js's own deriveAdjacency (proven at Terminal's 48k-
    // element scale) -- duplicated rather than imported because cross_edges.js's version is tuned to DEDUP
    // into an unordered edge set for the SDG graph; this tier wants the AABBs riding along with each pair.
    var sorted = boxes.slice().sort(function (p, q) { return p.aabb[0] - q.aabb[0]; });
    var pairs = [], active = [];
    for (var i = 0; i < sorted.length; i++) {
      var e = sorted[i], minX = e.aabb[0];
      var keep = [];
      for (var j = 0; j < active.length; j++) if (active[j].aabb[1] >= minX - tol) keep.push(active[j]);
      active = keep;
      for (var k = 0; k < active.length; k++) {
        var o = active[k];
        var ft = CrossEdges.faceTouch(e.aabb, o.aabb, tol, minOv);
        if (!ft) continue;
        var ax = 'XYZ'.indexOf(ft.axis);
        // signed gap on the touch axis: which of the two sits "lo" decides the sign convention, but callers
        // only need "is there real overlap to clip" -- recomputed directly, not trusted from |gap_m|.
        var eLo = e.aabb[2 * ax], eHi = e.aabb[2 * ax + 1], oLo = o.aabb[2 * ax], oHi = o.aabb[2 * ax + 1];
        var signedOverlap = Math.min(eHi, oHi) - Math.max(eLo, oLo);   // >0 = interpenetrate, <0 = gap
        pairs.push({ a: e.guid, b: o.guid, aAabb: e.aabb, bAabb: o.aabb, axis: ft.axis,
          gap_m: -signedOverlap, contact_m2: ft.contact_m2 });
      }
      active.push(e);
    }
    return pairs;
  }

  // worldAxisToLocal(rotationZ, worldAxisIdx) -> {localAxis, sign} | null
  // Inverts a YAW-ONLY rotation (rotation_x=rotation_y=0, the only case measured anywhere in this project
  // so far -- see cross_edges.js §REAL-AABB / arc_editable.js §ARC-3AXIS) restricted to multiples of 90°,
  // the only angles where an axis-aligned WORLD plane is also axis-aligned in the element's own LOCAL mesh
  // space (any other yaw would need clipping against a genuinely tilted plane -- a real generalization, not
  // in scope here; refused, not guessed, same as disc_walker.js's hostBind out-of-reach refusal).
  // World axis Z always maps directly to local Z (rotation is about Z only) regardless of yaw.
  function worldAxisToLocal(rotationZ, worldAxisIdx) {
    if (worldAxisIdx === 2) return { localAxis: 2, sign: 1 };
    var rz = rotationZ || 0;
    var quarter = Math.PI / 2;
    var k = Math.round(rz / quarter);
    if (Math.abs(rz - k * quarter) > 1e-6) return null;     // not a clean 0/90/180/270 -- refuse, don't guess
    k = ((k % 4) + 4) % 4;
    // R(k*90)-applied-to-local: worldX = cosθ·x − sinθ·y, worldY = sinθ·x + cosθ·y.
    //   k=0: worldX=x, worldY=y            k=1 (90°): worldX=−y, worldY=x
    //   k=2 (180°): worldX=−x, worldY=−y   k=3 (270°): worldX=y, worldY=−x
    var MAP = [
      { x: { localAxis: 0, sign: 1 }, y: { localAxis: 1, sign: 1 } },
      { x: { localAxis: 1, sign: -1 }, y: { localAxis: 0, sign: 1 } },
      { x: { localAxis: 0, sign: -1 }, y: { localAxis: 1, sign: -1 } },
      { x: { localAxis: 1, sign: 1 }, y: { localAxis: 0, sign: -1 } }
    ];
    return worldAxisIdx === 0 ? MAP[k].x : MAP[k].y;
  }

  // clipMeshToPlane(positions, faces, localAxis, localPlaneCoord, keepSign) -> {positions, faces}
  // Sutherland-Hodgman clip of every triangle against ONE axis-aligned plane in the mesh's own LOCAL space.
  // keepSign=+1 keeps vertices with coord >= localPlaneCoord (clips the LO side); keepSign=-1 keeps coord
  // <= localPlaneCoord (clips the HI side). A genuinely cheap, robust primitive -- one flat plane against
  // one mesh's own triangles, no other-mesh face data involved, no self-intersection possible (§1's whole
  // point: this is NOT a boolean against an arbitrary solid).
  function clipMeshToPlane(positions, faces, localAxis, localPlaneCoord, keepSign) {
    var outPos = [];      // flat x,y,z triples, built incrementally (vertex count changes at the cut)
    var outFaces = [];
    function side(vi) { var c = positions[vi * 3 + localAxis]; return keepSign * (c - localPlaneCoord); }  // >=0 keep
    function emit(x, y, z) { outPos.push(x, y, z); return outPos.length / 3 - 1; }
    function lerp(ia, ib, t) {
      var ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
      var bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
      return emit(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    }
    for (var f = 0; f < faces.length; f += 3) {
      var vi = [faces[f], faces[f + 1], faces[f + 2]];
      var s = vi.map(side);
      var insideCount = s.filter(function (v) { return v >= 0; }).length;
      if (insideCount === 0) continue;                     // fully clipped away
      if (insideCount === 3) {                              // fully kept -- re-emit its own vertices (dedup not required, a small size cost for a large robustness/simplicity win)
        var k0 = emit(positions[vi[0] * 3], positions[vi[0] * 3 + 1], positions[vi[0] * 3 + 2]);
        var k1 = emit(positions[vi[1] * 3], positions[vi[1] * 3 + 1], positions[vi[1] * 3 + 2]);
        var k2 = emit(positions[vi[2] * 3], positions[vi[2] * 3 + 1], positions[vi[2] * 3 + 2]);
        outFaces.push(k0, k1, k2);
        continue;
      }
      // mixed triangle: walk the 3 edges, building the clipped polygon (3 or 4 verts), fan-triangulate.
      var poly = [];
      for (var e = 0; e < 3; e++) {
        var curI = vi[e], nextI = vi[(e + 1) % 3], curS = s[e], nextS = s[(e + 1) % 3];
        if (curS >= 0) poly.push(emit(positions[curI * 3], positions[curI * 3 + 1], positions[curI * 3 + 2]));
        if ((curS >= 0) !== (nextS >= 0)) {
          var t = curS / (curS - nextS);
          poly.push(lerp(curI, nextI, t));
        }
      }
      for (var p = 1; p + 1 < poly.length; p++) outFaces.push(poly[0], poly[p], poly[p + 1]);
    }
    return { positions: new Float32Array(outPos), faces: new Uint32Array(outFaces) };
  }

  function bboxOf(p) {
    var a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
    }
    return [a, b, c, d, e, f];
  }

  // healElementAtJunction(resolved, placement, junction) -> patch | null
  //   resolved: {positions (LOCAL, recentred), faces, anchorOffset, source_status, ...} -- real_geometry.js's
  //     buildGeometryIndex().resolved[hash] shape (MEASURED or GRAFTED, healing is uniform per §2 step 1).
  //   placement: {center_x, center_y, center_z, rotation_z} -- the RESOLVING element's own world placement.
  //   junction: one row from detectJunctions() naming the neighbor's AABB + touch axis.
  // Returns null (REFUSED, not guessed) when: the overlap is actually a GAP (clipping cannot honestly close
  // it -- would need geometry ADDED, out of scope, see file header), or the yaw isn't a clean 0/90/180/270
  // multiple (worldAxisToLocal's own refusal). Otherwise returns a NEW positions/faces/bbox/anchorOffset --
  // `source_status` is carried through UNCHANGED (trimming is a display-geometry adjustment at a shared
  // face, not a new provenance claim, per SPEC_SEAM_HEALING_ENGINE.md §2 Labeling) -- plus
  // `trimmed_at_junction: true` + `trimmed_neighbor`/`trimmed_axis` so the trim is inspectable/reversible
  // (sdg_cascade.js's own non-destructive-annotation pattern: the base geometry record is never mutated,
  // only a derived render-time patch is produced).
  function healElementAtJunction(resolved, placement, junction) {
    var ax = 'XYZ'.indexOf(junction.axis);
    var neighborIsA = junction.b === undefined ? false : null;   // caller passes the junction already oriented so `b` is the neighbor
    var selfAabb = junction.selfAabb, neighborAabb = junction.neighborAabb;
    var sLo = selfAabb[2 * ax], sHi = selfAabb[2 * ax + 1];
    var nLo = neighborAabb[2 * ax], nHi = neighborAabb[2 * ax + 1];
    var selfCenter = (sLo + sHi) / 2, neighborCenter = (nLo + nHi) / 2;
    var selfIsLoSide = selfCenter < neighborCenter;
    // the plane is the neighbor's NEAR face; only a genuine overlap past it is clippable.
    var worldPlaneCoord = selfIsLoSide ? nLo : nHi;
    var overlaps = selfIsLoSide ? (sHi > worldPlaneCoord + 1e-6) : (sLo < worldPlaneCoord - 1e-6);
    if (!overlaps) return null;   // flush already, or a GAP -- REFUSE (cannot honestly clip a gap shut)

    var inv = worldAxisToLocal(placement.rotation_z || 0, ax);
    if (!inv) return null;        // non-90°-multiple yaw -- REFUSE, don't guess a tilted plane

    var centerWorld = [placement.center_x, placement.center_y, placement.center_z];
    var localPlaneCoord = (worldPlaneCoord - centerWorld[ax]) / inv.sign;
    // the LOCAL mesh is RECENTRED about its own bbox centre (real_geometry.js convention) but positions
    // are stored pre-anchorOffset-addback (see cross_edges.js's own _buildRealVerts for this exact undo) --
    // add anchorOffset back on inv.localAxis before clipping so the plane coordinate lines up correctly.
    var ao = resolved.anchorOffset || [0, 0, 0];
    var rawPositions = new Float32Array(resolved.positions.length);
    for (var i = 0; i < resolved.positions.length; i += 3) {
      rawPositions[i] = resolved.positions[i] + ao[0];
      rawPositions[i + 1] = resolved.positions[i + 1] + ao[1];
      rawPositions[i + 2] = resolved.positions[i + 2] + ao[2];
    }
    // keepSign: if self sits on the LO side of the neighbor, we keep the LO half of self's own mesh
    // (coord <= plane) -- i.e. keepSign=-1 in clipMeshToPlane's convention (keeps coord*keepSign>=plane*keepSign).
    // Combine with inv.sign: a negative axis mapping (sign=-1) flips which raw-local direction is "world-lo".
    var keepSign = (selfIsLoSide ? -1 : 1) * inv.sign;
    var clipped = clipMeshToPlane(rawPositions, resolved.faces, inv.localAxis, localPlaneCoord, keepSign);
    if (!clipped.positions.length || !clipped.faces.length) return null;   // degenerate clip -- REFUSE, keep original

    var bb = bboxOf(clipped.positions);
    var cx = (bb[0] + bb[1]) / 2, cy = (bb[2] + bb[3]) / 2, cz = (bb[4] + bb[5]) / 2;
    var recentred = new Float32Array(clipped.positions.length);
    for (var j = 0; j < clipped.positions.length; j += 3) {
      recentred[j] = clipped.positions[j] - cx; recentred[j + 1] = clipped.positions[j + 1] - cy; recentred[j + 2] = clipped.positions[j + 2] - cz;
    }
    return {
      positions: recentred, faces: clipped.faces,
      bbox: [bb[0] - cx, bb[1] - cx, bb[2] - cy, bb[3] - cy, bb[4] - cz, bb[5] - cz],
      anchorOffset: [cx, cy, cz],
      source_status: resolved.source_status,                 // UNCHANGED -- §2 Labeling, trim is not a new provenance claim
      source_template_hash: resolved.source_template_hash,
      source_building: resolved.source_building,
      trimmed_at_junction: true, trimmed_neighbor: junction.neighborGuid, trimmed_axis: junction.axis
    };
  }

  // healAll(db, geometryIndex, opts) -> {healed: [{guid, patch}], refused: [{guid, neighbor, reason}]}
  // Batch driver for witnessing/offline use: treats EVERY element with real geometry as "the element being
  // resolved" against each of its detected neighbors (§2 mechanism step 4 -- only the resolving element is
  // trimmed per pair; two elements meeting each get their OWN independent resolution pass here, matching
  // "healing isn't graft-specific" / applies uniformly). geometryIndex = real_geometry.js's
  // buildGeometryIndex(db, geoDb[, templateIndex]) result.
  function healAll(db, geometryIndex, opts) {
    opts = opts || {};
    var junctions = detectJunctions(db, opts);
    var placementByGuid = {};
    try {
      var r = db.exec('SELECT guid, center_x, center_y, center_z, rotation_z FROM element_transforms');
      if (r.length) r[0].values.forEach(function (v) { placementByGuid[v[0]] = { center_x: v[1], center_y: v[2], center_z: v[3], rotation_z: v[4] }; });
    } catch (e) { /* no element_transforms -- nothing to heal */ }

    var healed = [], refused = [];
    function attempt(selfGuid, neighborGuid, selfAabb, neighborAabb, axis) {
      var hash = geometryIndex.byGuid[selfGuid];
      var resolved = hash != null ? geometryIndex.resolved[hash] : null;
      var placement = placementByGuid[selfGuid];
      if (!resolved || !placement) { refused.push({ guid: selfGuid, neighbor: neighborGuid, reason: 'no_real_geometry' }); return; }
      var patch = healElementAtJunction(resolved, placement, { axis: axis, selfAabb: selfAabb, neighborAabb: neighborAabb, neighborGuid: neighborGuid });
      if (patch) healed.push({ guid: selfGuid, patch: patch });
      else refused.push({ guid: selfGuid, neighbor: neighborGuid, reason: 'no_overlap_or_non_yaw90' });
    }
    junctions.forEach(function (j) {
      attempt(j.a, j.b, j.aAabb, j.bAabb, j.axis);
      attempt(j.b, j.a, j.bAabb, j.aAabb, j.axis);
    });
    return { healed: healed, refused: refused, junctionsDetected: junctions.length };
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return {
    TAG: TAG, JUNCTION_TOL: JUNCTION_TOL,
    detectJunctions: detectJunctions, worldAxisToLocal: worldAxisToLocal, clipMeshToPlane: clipMeshToPlane,
    healElementAtJunction: healElementAtJunction, healAll: healAll, bboxOf: bboxOf
  };
});
