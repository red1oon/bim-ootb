// witness_mesh_graft.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md real-data proof for §3a/§3b/§3c end to end.
// Proves the issue this engine exists to solve: a confirmed real-template family (found by
// build_mesh_templates.js against bim-compiler's actual component_library.db) can be reconstructed at a
// DIFFERENT member's real dimensions via mesh_graft.js's non-uniform rescale, landing close to (not
// identical to) that member's own true extracted mesh -- and that the result is honestly labeled GRAFTED,
// never silently presented as MEASURED (§1/WalkerDoctrine.md §11).
//
// Usage: node witness_mesh_graft.js [templates.db] [library.db]
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const MeshGraft = require('../mesh_graft.js');

const TPL_PATH = process.argv[2] || path.join(__dirname, '..', 'mesh_templates.db');
const LIB_PATH = process.argv[3] || path.join(__dirname, '..', '..', 'library', 'component_library.db');

function toF32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
function bboxOf(p) { return MeshGraft.bboxOf(p); }
function sizeOf(p) { var bb = bboxOf(p); return [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]]; }

function rmsBetween(a, b) {
  // both already same vertex count (same family, same vertex_count bucket) -- direct index compare on
  // RECENTRED positions, normalized by the larger of the two extents per axis so scale differences don't
  // dominate the score (this is a shape-closeness check, not a duplicate check).
  var bbA = bboxOf(a), bbB = bboxOf(b);
  var sizeA = [bbA[1] - bbA[0], bbA[3] - bbA[2], bbA[5] - bbA[4]];
  var sizeB = [bbB[1] - bbB[0], bbB[3] - bbB[2], bbB[5] - bbB[4]];
  var n = a.length / 3, sumSq = 0;
  for (var i = 0; i < n; i++) {
    for (var ax = 0; ax < 3; ax++) {
      var sa = sizeA[ax] > 0 ? sizeA[ax] : 1, sb = sizeB[ax] > 0 ? sizeB[ax] : 1;
      var na = (a[i * 3 + ax] - (ax === 0 ? bbA[0] : ax === 1 ? bbA[2] : bbA[4])) / sa;
      var nb = (b[i * 3 + ax] - (ax === 0 ? bbB[0] : ax === 1 ? bbB[2] : bbB[4])) / sb;
      var d = na - nb; sumSq += d * d;
    }
  }
  return Math.sqrt(sumSq / (n * 3));
}

(async () => {
  const SQL = await initSqlJs();
  const tplDb = new SQL.Database(fs.readFileSync(TPL_PATH));
  const libDb = new SQL.Database(fs.readFileSync(LIB_PATH));

  // pick the largest confirmed MEP family (real, measured this session: IfcPipeSegment, genuine scale
  // spread) as the proof case, per §0's finding that MEP is this engine's real highest-value target.
  const famRows = tplDb.exec(
    "SELECT template_hash, vertices, faces, vertex_count, bbox_x, bbox_y, bbox_z, source_building, member_count " +
    "FROM mesh_templates WHERE member_count > 1 ORDER BY member_count DESC"
  )[0];
  if (!famRows || !famRows.values.length) { console.error('§W-MESHGRAFT FATAL no confirmed families in ' + TPL_PATH); process.exit(1); }

  // find a family whose members show REAL scale variation (not just fp-noise duplicates) -- pick the
  // first family (by member_count desc) with >5% spread on any axis, matching the spec's actual target case.
  let chosen = null, chosenMember = null;
  for (const row of famRows.values) {
    const [templateHash, vBlob, fBlob, vc, bx, by, bz, sourceBuilding, memberCount] = row;
    // §6: mesh_template_map now carries IFC IfcCartesianTransformationOperator3DnonUniform's own field
    // shape (Axis1/2/3 + Scale/Scale2/Scale3) instead of a bespoke axis_permutation string.
    const mapRows = tplDb.exec(
      "SELECT geometry_hash, axis1_x,axis1_y,axis1_z, axis2_x,axis2_y,axis2_z, axis3_x,axis3_y,axis3_z, scale,scale2,scale3, rms_confidence " +
      "FROM mesh_template_map WHERE template_hash=? AND geometry_hash!=?", [templateHash, templateHash])[0];
    if (!mapRows) continue;
    for (const row2 of mapRows.values) {
      const [hash, a1x, a1y, a1z, a2x, a2y, a2z, a3x, a3y, a3z, scale, scale2, scale3, rms] = row2;
      const memRow = libDb.exec("SELECT vertices FROM component_geometries WHERE geometry_hash=?", [hash])[0];
      if (!memRow) continue;
      const memPos = toF32(memRow.values[0][0]);
      const memSize = sizeOf(memPos);
      const spreadX = bx > 0 ? Math.abs(memSize[0] - bx) / bx : 0;
      const spreadY = by > 0 ? Math.abs(memSize[1] - by) / by : 0;
      const spreadZ = bz > 0 ? Math.abs(memSize[2] - bz) / bz : 0;
      if (spreadX > 0.05 || spreadY > 0.05 || spreadZ > 0.05) {
        chosen = { templateHash, vBlob, fBlob, vc, bbox: [bx, by, bz], sourceBuilding, memberCount };
        chosenMember = { hash, positions: memPos, size: memSize, rms,
          transform: { axis1: [a1x, a1y, a1z], axis2: [a2x, a2y, a2z], axis3: [a3x, a3y, a3z], scale, scale2, scale3 } };
        break;
      }
    }
    if (chosen) break;
  }

  if (!chosen) { console.error('§W-MESHGRAFT FATAL no family with real (>5%) scale variation found -- cannot prove the target case'); process.exit(1); }

  console.log('§W-MESHGRAFT chosen_family template=' + chosen.templateHash + ' members=' + chosen.memberCount +
    ' template_bbox=' + chosen.bbox.map(v => v.toFixed(4)).join('x') + ' source_building=' + chosen.sourceBuilding);
  console.log('§W-MESHGRAFT chosen_member hash=' + chosenMember.hash + ' real_size=' + chosenMember.size.map(v => v.toFixed(4)).join('x') +
    ' build_time_transform_scale=' + [chosenMember.transform.scale, chosenMember.transform.scale2, chosenMember.transform.scale3].map(v => v.toFixed(4)).join(',') +
    ' build_time_rms=' + chosenMember.rms);

  // §6: canonical path -- IFC-shaped transform straight from mesh_template_map into applyMeshTransform,
  // no permutation index or re-derived scale involved (both were only ever true of the legacy graftFit
  // convenience wrapper, kept for callers that don't have a stored transform).
  const template = { template_hash: chosen.templateHash, vertices: toF32(chosen.vBlob), faces: chosen.fBlob, source_building: chosen.sourceBuilding };
  const grafted = MeshGraft.applyMeshTransform(template, chosenMember.transform);

  // §1 label check -- non-negotiable per spec
  const labelOk = grafted.source_status === 'GRAFTED' && grafted.source_template_hash === chosen.templateHash &&
    grafted.source_building === chosen.sourceBuilding;
  console.log('§W-MESHGRAFT label source_status=' + grafted.source_status + ' source_template_hash=' + grafted.source_template_hash +
    ' source_building=' + grafted.source_building + ' labelOk=' + labelOk);

  // bbox-size fidelity -- the grafted result's OWN bbox must match the target size we asked for (that's
  // the whole point of the non-uniform rescale)
  const gSize = sizeOf(grafted.positions);
  const bboxErr = [0, 1, 2].map(a => Math.abs(gSize[a] - chosenMember.size[a]));
  const bboxOk = bboxErr.every(e => e < 1e-4);
  console.log('§W-MESHGRAFT bbox_fidelity grafted_size=' + gSize.map(v => v.toFixed(6)).join('x') +
    ' target_size=' + chosenMember.size.map(v => v.toFixed(6)).join('x') + ' bboxOk=' + bboxOk);

  // shape-closeness vs the member's OWN real mesh -- should be CLOSE (the whole premise: same real
  // template) but NOT byte-identical (a graft is not a substitute for the real per-element extraction;
  // §2 explicitly does not aim for undetectable/seamless grafts).
  const memberRecentred = (() => {
    var bb = bboxOf(chosenMember.positions);
    var cx = (bb[0] + bb[1]) / 2, cy = (bb[2] + bb[3]) / 2, cz = (bb[4] + bb[5]) / 2;
    var out = new Float32Array(chosenMember.positions.length);
    for (var i = 0; i < out.length; i += 3) { out[i] = chosenMember.positions[i] - cx; out[i + 1] = chosenMember.positions[i + 1] - cy; out[i + 2] = chosenMember.positions[i + 2] - cz; }
    return out;
  })();
  const shapeRms = rmsBetween(grafted.positions, memberRecentred);
  const identical = grafted.positions.every((v, i) => Math.abs(v - memberRecentred[i]) < 1e-6);
  console.log('§W-MESHGRAFT shape_closeness normalized_rms_vs_own_real_mesh=' + shapeRms.toFixed(6) + ' byte_identical=' + identical);

  const pass = labelOk && bboxOk && shapeRms < 0.05;
  console.log('§W-MESHGRAFT RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' (label=' + labelOk + ' bbox=' + bboxOk + ' shape_rms<0.05=' + (shapeRms < 0.05) + ')');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-MESHGRAFT FATAL', e); process.exit(1); });
