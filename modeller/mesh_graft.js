// mesh_graft.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §3c: runtime graft/fit renderer.
// Given a template mesh (from mesh_templates.db, built by tests/build_mesh_templates.js's §3a/§3b pass)
// and a target element's real bbox size (element_transforms.bbox_x/y/z), applies a non-uniform per-axis
// affine rescale -- NOT true parametric assembly semantics (constant frame thickness, connection ports)
// -- per §2's explicit "own the mid-ground" bar: fast, visually-plausible reuse of a real measured shape
// at a NEW real size, not construction-grade dimensional accuracy at the seam.
//
// PURE, dual-export (node + browser) like real_geometry.js -- no THREE/DOM dependency, so the witness can
// run headless in node exactly the same way W-ARC-EDITABLE and the other real_geometry-based witnesses do.
//
// §1 (LOCKED, non-optional): every value this module returns carries `source_status: 'GRAFTED'` plus
// `source_template_hash` and `source_building` -- a grafted result is NEVER the same epistemic status as
// MEASURED (untouched extracted geometry) and must stay distinguishable downstream (rendering, QTO/BOM,
// walker confidence, any future export). See WalkerDoctrine.md §11 -- this is what makes a graft an
// honest, labeled approximation rather than invented content dressed up as real.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MeshGraft = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§MESHGRAFT';

  function toFloat32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
  function toUint32(blob) { return new Uint32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }

  function bboxOf(p) {
    var a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
    }
    return [a, b, c, d, e, f];
  }

  // invert a permutation array [p0,p1,p2] (each in {0,1,2}) -> inv[pi] = i
  function invertPerm(perm) {
    var inv = [0, 0, 0];
    for (var i = 0; i < 3; i++) inv[perm[i]] = i;
    return inv;
  }

  // §6 (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md, 2026-07-09 -- main session's IFC-standard-alignment research):
  // IFC already has a native entity for "one template + non-uniform per-axis scale":
  // IfcRepresentationMap + IfcMappedItem + IfcCartesianTransformationOperator3DnonUniform, carrying three
  // independent per-axis scale factors (Scale/Scale2/Scale3) and three axis direction vectors (Axis1/
  // Axis2/Axis3). This engine's transform is reshaped to carry EXACTLY those field names/shapes instead of
  // a bespoke permutation index -- mechanical, not a redesign (§6's own framing) -- so a GRAFTED result
  // could in principle be re-serialized as a real IfcMappedItem later, and so orientation-preserving
  // placement rides IFC's own well-tested axis/scale convention instead of a reinvented one.
  //
  // permToTransform(perm) -> { axis1, axis2, axis3, scaleFactors } -- converts the engine's internal
  // axis-permutation index (still how §3a's clustering finds the best-matching axis order, permutation-
  // only, no arbitrary rotation) into IFC-shaped ONE-HOT axis vectors. axis_k is the unit vector along the
  // template's own axis `perm[k]` -- i.e. "template axis perm[k] feeds output axis k", the same convention
  // §3a's clustering already fixed. scaleFactors is filled in by the caller (needs the real target size).
  function permToTransform(perm) {
    function oneHot(axis) { var v = [0, 0, 0]; v[axis] = 1; return v; }
    return { axis1: oneHot(perm[0]), axis2: oneHot(perm[1]), axis3: oneHot(perm[2]) };
  }

  // applyMeshTransform(template, transform) -> { positions, faces, bbox, anchorOffset, source_status,
  //   source_template_hash, source_building }
  //
  // template: { template_hash, vertices (Float32Array RAW, un-normalized, as stored in mesh_templates.db),
  //   faces (Uint32Array), source_building }
  // transform: IFC IfcCartesianTransformationOperator3DnonUniform shape --
  //   { axis1, axis2, axis3 : [x,y,z] unit direction vectors (which local template axis feeds this output
  //     axis -- one-hot for today's permutation-only engine, but the field shape is NOT limited to that:
  //     a future true-rotation graft could populate non-one-hot vectors without a schema change),
  //     scale, scale2, scale3 : per-axis scale factors (targetSize[axis] / templateSize[sourceAxis],
  //     precomputed once at build time by build_mesh_templates.js, not re-derived here) }
  //   LocalOrigin is NOT a field here -- this function always outputs RECENTRED positions about their own
  //   new bbox centre (real_geometry.js's recenter()/anchorOffset convention), i.e. LocalOrigin is
  //   implicitly wherever the caller later places anchorOffset in world space.
  //
  // result[axis b] = sum_k( scale_k * axis_k[b] * (rawVertex[k] - templateMin[k]) )
  function applyMeshTransform(template, transform) {
    var positions = template.vertices instanceof Float32Array ? template.vertices : toFloat32(template.vertices);
    var faces = template.faces instanceof Uint32Array ? template.faces : toUint32(template.faces);
    var bb = bboxOf(positions);
    var tMin = [bb[0], bb[2], bb[4]];
    var axes = [transform.axis1, transform.axis2, transform.axis3];
    var scales = [transform.scale, transform.scale2, transform.scale3];

    var n = positions.length / 3;
    var out = new Float32Array(positions.length);
    for (var i = 0; i < n; i++) {
      var local0 = positions[i * 3] - tMin[0], local1 = positions[i * 3 + 1] - tMin[1], local2 = positions[i * 3 + 2] - tMin[2];
      var local = [local0, local1, local2];
      for (var b = 0; b < 3; b++) {
        var v = 0;
        for (var k = 0; k < 3; k++) v += scales[k] * axes[k][b] * local[k];
        out[i * 3 + b] = v;
      }
    }
    var outBb = bboxOf(out);
    var cx = (outBb[0] + outBb[1]) / 2, cy = (outBb[2] + outBb[3]) / 2, cz = (outBb[4] + outBb[5]) / 2;
    var recentred = new Float32Array(out.length);
    for (var j = 0; j < n; j++) {
      recentred[j * 3] = out[j * 3] - cx;
      recentred[j * 3 + 1] = out[j * 3 + 1] - cy;
      recentred[j * 3 + 2] = out[j * 3 + 2] - cz;
    }

    return {
      positions: recentred,
      faces: faces,
      bbox: [outBb[0] - cx, outBb[1] - cx, outBb[2] - cy, outBb[3] - cy, outBb[4] - cz, outBb[5] - cz],
      anchorOffset: [cx, cy, cz],
      source_status: 'GRAFTED',
      source_template_hash: template.template_hash,
      source_building: template.source_building || null
    };
  }

  // graftFit(template, targetSize, axisPermutation) -> convenience wrapper kept for callers still working
  // in permutation+targetSize terms (e.g. a runtime caller that only has the target's real bbox on hand
  // and the legacy permutation index) -- builds an IFC-shaped transform (degenerate axis -> scale 0,
  // honest, not invented-detail) and delegates to applyMeshTransform. New code should prefer storing/
  // passing a real transform object (see build_mesh_templates.js's mesh_template_map columns) so the
  // scale factors are the ones actually computed+recorded at build time, not re-derived at graft time.
  function graftFit(template, targetSize, axisPermutation) {
    var positions = template.vertices instanceof Float32Array ? template.vertices : toFloat32(template.vertices);
    var bb = bboxOf(positions);
    var tSize = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
    var transform = permToTransform(axisPermutation);
    // axis_k (template's own local axis k) maps to output axis perm[k] -- so scale_k must convert template
    // axis k's extent into the target's real size on axis perm[k]: scale_k = targetSize[perm[k]] / tSize[k].
    transform.scale = tSize[0] > 0 ? targetSize[axisPermutation[0]] / tSize[0] : 0;
    transform.scale2 = tSize[1] > 0 ? targetSize[axisPermutation[1]] / tSize[1] : 0;
    transform.scale3 = tSize[2] > 0 ? targetSize[axisPermutation[2]] / tSize[2] : 0;
    return applyMeshTransform(template, transform);
  }

  // ---------------------------------------------------------------------------------------------------
  // placeInWorld -- orientation-preserving PLACEMENT: compose a graft's recentred local mesh with its
  // target element's REAL world placement (element_transforms: center_xyz + rotation_xyz), so a grafted
  // element lands exactly where the real building measurement says it should, oriented correctly.
  //
  // Ground truth for this composition (traced directly from bonsai_library.js/arc_editable.js, not
  // guessed -- both are QUOTED below because getting rotation composition wrong is a silent, hard-to-spot
  // failure mode):
  //  - arc_editable.js §ARC-3AXIS: "bbox is already centred at local origin... translate the rotated box
  //    directly by the MEASURED centre, no ground-seat step... places centres not bottoms."
  //  - bonsai_library.js §REAL-GEOM RE-SEAT: "seat on the MATCHED CATALOG's own half-height... so the
  //    swapped-in mesh's WORLD CENTRE still lands exactly on the measured (cx,cy,cz)" -- i.e. the ground-
  //    seat branch's seatHalfZ/re-seat machinery is `place()`'s bottom-seating primitive achieving the
  //    SAME end goal as the 3-axis branch's direct centre placement, once real per-element geometry (or,
  //    here, a GRAFTED result carrying its own honest recentred bbox) is involved.
  //  => both branches converge on ONE formula once you already have your own recentred-about-centre mesh:
  //       worldVertex = R(rotX,rotY,rotZ) · localRecentredVertex + (cx, cy, cz)
  //
  // Rotation itself has TWO real conventions in this codebase, both replicated bit-exact (not approximated):
  //  - tilted (rotX||rotY truthy): bonsai_library.js's place() 3-axis branch literally does
  //    `new THREE.Euler(pl.rotX, pl.rotZRad, -(pl.rotY))` (THREE's default 'XYZ' order) then
  //    `Quaternion.setFromEuler(euler)` -- quaternionFromEulerXYZ() below implements THREE.js's OWN
  //    published algorithm for that exact case (half-angle products, order 'XYZ'), so a grafted tilted
  //    element rotates IDENTICALLY to how the Modeller already rotates real/box geometry -- not a
  //    reinvented convention that happens to look similar.
  //  - ground-seat / yaw-only (rotX=rotY=0): plain rotation about +Z by rotZ (radians) -- unambiguous,
  //    matches place()'s `cs*x-sn*y, sn*x+cs*y` ground-seat rotation shape with no axis relabeling quirk.
  function quaternionFromEulerXYZ(x, y, z) {
    var c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    var s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return {
      x: s1 * c2 * c3 + c1 * s2 * s3,
      y: c1 * s2 * c3 - s1 * c2 * s3,
      z: c1 * c2 * s3 + s1 * s2 * c3,
      w: c1 * c2 * c3 - s1 * s2 * s3
    };
  }
  // THREE.Vector3.applyQuaternion's own algorithm, replicated exactly (not the shorter but numerically-
  // different "conjugate sandwich" formula) so results match bit-for-bit, not just "close."
  function applyQuaternion(v, q) {
    var vx = v[0], vy = v[1], vz = v[2], qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    var ix = qw * vx + qy * vz - qz * vy;
    var iy = qw * vy + qz * vx - qx * vz;
    var iz = qw * vz + qx * vy - qy * vx;
    var iw = -qx * vx - qy * vy - qz * vz;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
  }
  function rotateZ(v, rad) {
    var cs = Math.cos(rad), sn = Math.sin(rad);
    return [cs * v[0] - sn * v[1], sn * v[0] + cs * v[1], v[2]];
  }

  // placeInWorld(graftedOrRealResult, targetPlacement) -> { positions (world-space Float32Array), faces,
  //   worldBbox: [xmin,xmax,ymin,ymax,zmin,zmax] }
  // graftedOrRealResult: { positions (RECENTRED about own bbox centre, per applyMeshTransform's/
  //   real_geometry.js's shared convention), faces }
  // targetPlacement: { cx, cy, cz, rotX, rotY, rotZ } -- element_transforms' own columns, RADIANS
  // (rotation_x/y/z are stored in radians throughout this project -- §ARC-ROT-UNIT).
  function placeInWorld(result, targetPlacement) {
    var rotX = targetPlacement.rotX || 0, rotY = targetPlacement.rotY || 0, rotZ = targetPlacement.rotZ || 0;
    var tilted = !!(rotX || rotY);
    var q = tilted ? quaternionFromEulerXYZ(rotX, rotZ, -rotY) : null;
    var n = result.positions.length / 3;
    var out = new Float32Array(result.positions.length);
    for (var i = 0; i < n; i++) {
      var local = [result.positions[i * 3], result.positions[i * 3 + 1], result.positions[i * 3 + 2]];
      var rotated = tilted ? applyQuaternion(local, q) : rotateZ(local, rotZ);
      out[i * 3] = rotated[0] + targetPlacement.cx;
      out[i * 3 + 1] = rotated[1] + targetPlacement.cy;
      out[i * 3 + 2] = rotated[2] + targetPlacement.cz;
    }
    return { positions: out, faces: result.faces, worldBbox: bboxOf(out) };
  }

  // expectedWorldBbox(targetPlacement) -- the GROUND-TRUTH world AABB, derived ONLY from element_transforms'
  // own coarse box (center_xyz + bbox_x/y/z), completely independently of any mesh at all.
  //
  // §PLACEMENT-FINDING (2026-07-09, real data, Duplex): `element_transforms.bbox_x/y/z` is the element's
  // WORLD-SPACE (post-rotation) AABB size, NOT a local pre-rotation box to be rotated again here --
  // verified directly on a real rotated (rotation_z=-90°) Duplex wall: its RAW base_geometries vertex
  // blob's own local extent is (17.383, 0.417, 3.1), while element_transforms reports bbox=(0.417, 17.383,
  // 3.1) -- axes SWAPPED, matching "rotate local by -90°" exactly, i.e. bbox_x/y/z is already the final
  // world answer. (An earlier version of this function WRONGLY rotated the coarse box a second time --
  // caught by this exact real-data test disagreeing with placeInWorld's independently-correct output by
  // 8.48, a huge, obviously-wrong delta -- fixed here.) So the ground-truth box is just centered directly
  // at (cx,cy,cz), NO rotation applied -- an AABB has no orientation of its own to rotate.
  //
  // Real, NOT-yet-investigated implication flagged here, not fixed (out of this session's scope --
  // arc_editable.js is a live-rendering file this session has deliberately not touched): arc_editable.js's
  // OWN coarse box-fallback path (`bbox = [-bx/2,bx/2,...]` then rotated via place()) would, per this same
  // finding, DOUBLE-ROTATE for any ARC element that (a) has NO real geometry link (uses the box-fallback
  // path at all) AND (b) has a non-0/180° rotation_z -- e.g. exactly the -90°/270° cases measured here.
  // Currently unobserved in practice because every tested ARC-only resident's rotated elements all resolve
  // to REAL geometry (0 box-fallback), per the existing M3 witness (`boxFallback=0`) -- but this could bite
  // a FUTURE onboarded building with both traits. Flag only, not investigated/fixed further this session.
  function expectedWorldBbox(targetPlacement) {
    var hx = (targetPlacement.bx || 0) / 2, hy = (targetPlacement.by || 0) / 2, hz = (targetPlacement.bz || 0) / 2;
    return [targetPlacement.cx - hx, targetPlacement.cx + hx, targetPlacement.cy - hy, targetPlacement.cy + hy, targetPlacement.cz - hz, targetPlacement.cz + hz];
  }

  // compareToGroundTruth(placedResult, targetPlacement, tolerance) -> { pass, maxDelta, actual, expected }
  // tolerance default 0.031 (30mm + 1mm float-noise slack) -- reuses this project's OWN previously-
  // validated real-vs-noise threshold (witness_cross_edges_real_aabb.js G4), not an invented number.
  function compareToGroundTruth(placedResult, targetPlacement, tolerance) {
    tolerance = tolerance == null ? 0.031 : tolerance;
    var actual = placedResult.worldBbox;
    var expected = expectedWorldBbox(targetPlacement);
    var deltas = actual.map(function (v, i) { return Math.abs(v - expected[i]); });
    var maxDelta = Math.max.apply(null, deltas);
    return { pass: maxDelta <= tolerance, maxDelta: maxDelta, actual: actual, expected: expected, tolerance: tolerance };
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return {
    graftFit: graftFit, applyMeshTransform: applyMeshTransform, permToTransform: permToTransform, invertPerm: invertPerm,
    placeInWorld: placeInWorld, expectedWorldBbox: expectedWorldBbox, compareToGroundTruth: compareToGroundTruth,
    quaternionFromEulerXYZ: quaternionFromEulerXYZ, applyQuaternion: applyQuaternion,
    bboxOf: bboxOf, TAG: TAG
  };
});
