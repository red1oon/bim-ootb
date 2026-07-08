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

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { graftFit: graftFit, applyMeshTransform: applyMeshTransform, permToTransform: permToTransform, invertPerm: invertPerm, bboxOf: bboxOf, TAG: TAG };
});
