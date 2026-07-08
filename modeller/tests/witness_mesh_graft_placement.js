// witness_mesh_graft_placement.js -- proves mesh_graft.js's placeInWorld + compareToGroundTruth (the
// orientation-preserving placement mechanism + RosettaStone-style spatial compare gate) on REAL data
// where real data exists, and on a clearly-labeled SYNTHETIC case for the tilted branch (no ARC-only
// resident on hand has a real rotation_x/rotation_y!=0 element -- SampleCastle's earlier-documented 497/
// 3317 tilted count was from a different pre-strip snapshot; today's ARC-only copies here all have 0).
// Never presents the synthetic case as if it were measured -- same discipline as witness_meshfit_thirdtier.js.
const fs = require('fs');
const initSqlJs = require('sql.js');
const MeshGraft = require('../mesh_graft.js');

function toF32(b) { return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }

(async () => {
  const SQL = await initSqlJs();

  // ---- CASE 1: REAL data -- a real yaw-rotated element from Duplex, with REAL geometry (not even a
  // graft needed for this part -- prove placement fidelity against MEASURED geometry first, the strongest
  // possible ground truth, before trusting it on a GRAFTED result).
  const duplexDb = new SQL.Database(fs.readFileSync('../Duplex_extracted.db'));
  const rotRow = duplexDb.exec(
    "SELECT t.guid, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z, t.rotation_x,t.rotation_y,t.rotation_z, i.geometry_hash " +
    "FROM element_transforms t JOIN element_instances i ON i.guid=t.guid WHERE t.rotation_z!=0 AND i.geometry_hash IS NOT NULL LIMIT 1"
  )[0];
  if (!rotRow) { console.error('§W-PLACEMENT FATAL no rotated+geometry-linked Duplex element found'); process.exit(1); }
  const [guid, cx, cy, cz, bx, by, bz, rotX, rotY, rotZ, hash] = rotRow.values[0];
  console.log('§W-PLACEMENT CASE1(real,yaw-only) guid=' + guid + ' center=' + [cx, cy, cz].map(v => v.toFixed(3)) +
    ' bbox=' + [bx, by, bz].map(v => v.toFixed(3)) + ' rotZ=' + rotZ.toFixed(4) + ' rad');

  const geomRow = duplexDb.exec("SELECT vertices, faces FROM base_geometries WHERE geometry_hash=?", [hash])[0];
  const rawPos = toF32(geomRow.values[0][0]);
  // recentre about own bbox centre (real_geometry.js's own convention -- placeInWorld expects this input shape)
  function bboxOf(p) { return MeshGraft.bboxOf(p); }
  const bb = bboxOf(rawPos);
  const ccx = (bb[0] + bb[1]) / 2, ccy = (bb[2] + bb[3]) / 2, ccz = (bb[4] + bb[5]) / 2;
  const recentred = new Float32Array(rawPos.length);
  for (let i = 0; i < rawPos.length; i += 3) { recentred[i] = rawPos[i] - ccx; recentred[i + 1] = rawPos[i + 1] - ccy; recentred[i + 2] = rawPos[i + 2] - ccz; }

  const placed1 = MeshGraft.placeInWorld({ positions: recentred, faces: geomRow.values[0][1] }, { cx, cy, cz, rotX, rotY, rotZ });
  const cmp1 = MeshGraft.compareToGroundTruth(placed1, { cx, cy, cz, bx, by, bz, rotX, rotY, rotZ });
  console.log('§W-PLACEMENT CASE1 actual_world_bbox=' + cmp1.actual.map(v => v.toFixed(4)).join(',') +
    ' expected_world_bbox=' + cmp1.expected.map(v => v.toFixed(4)).join(',') +
    ' maxDelta=' + cmp1.maxDelta.toFixed(5) + ' tolerance=' + cmp1.tolerance + ' pass=' + cmp1.pass);

  // ---- CASE 2: REAL data -- graft a family member INTO this same real Duplex slot, proving a GRAFTED
  // result (not just measured geometry) also places correctly.
  //
  // §PLACEMENT-FINDING continued: since bbox_x/y/z is WORLD-space (post-rotation), grafting onto a
  // ROTATED target needs the target's LOCAL (pre-rotation) size to scale the template correctly -- NOT
  // bbox_x/y/z directly (that would size the graft using the WRONG axis assignment under rotation, a
  // second real bug this test setup would have hidden if left uncorrected). For an EXACT axis-aligned
  // rotation (multiple of 90°, which is what real ARC data actually contains -- confirmed on Duplex's 134
  // rotated elements, all exact ±90°/180°) the local size is exactly recoverable by un-permuting the world
  // bbox; this engine's own clustering (§3a) only ever produces axis-PERMUTATION grafts anyway (never true
  // oblique rotation), so this is the ONLY case grafting-onto-rotation needs to handle, and it IS solvable.
  function localSizeFromWorldBboxYawOnly(worldSize, rotZ) {
    var twoPi = Math.PI * 2, r = ((rotZ % twoPi) + twoPi) % twoPi;
    var nearQuarter = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(r - nearQuarter) > 1e-6) return null; // not axis-aligned -- honestly refuse, don't invent
    var quarterSteps = Math.round(nearQuarter / (Math.PI / 2)) % 2; // 0 or 2 -> unchanged; 1 or 3 -> x/y swap
    return quarterSteps === 0 ? worldSize : [worldSize[1], worldSize[0], worldSize[2]];
  }
  const localTargetSize = localSizeFromWorldBboxYawOnly([bx, by, bz], rotZ);
  console.log('§W-PLACEMENT CASE2 local_target_size(recovered)=' + localTargetSize.map(v => v.toFixed(4)).join(','));

  const tplDb = new SQL.Database(fs.readFileSync('../mesh_templates.db'));
  const famRow = tplDb.exec("SELECT template_hash, vertices, faces, member_count FROM mesh_templates WHERE member_count > 1 ORDER BY member_count DESC LIMIT 1")[0];
  const [templateHash, tVBlob, tFBlob] = famRow.values[0];
  const mapRow = tplDb.exec(
    "SELECT axis1_x,axis1_y,axis1_z, axis2_x,axis2_y,axis2_z, axis3_x,axis3_y,axis3_z, scale,scale2,scale3 " +
    "FROM mesh_template_map WHERE template_hash=? AND geometry_hash!=? LIMIT 1", [templateHash, templateHash])[0];
  const [a1x, a1y, a1z, a2x, a2y, a2z, a3x, a3y, a3z] = mapRow.values[0];
  const template = { template_hash: templateHash, vertices: toF32(tVBlob), faces: tFBlob, source_building: null };
  // rescale the template to the RECOVERED LOCAL target size (not bx/by/bz directly -- see finding above)
  const tRaw = toF32(tVBlob), tBb = bboxOf(tRaw), tSize = [tBb[1] - tBb[0], tBb[3] - tBb[2], tBb[5] - tBb[4]];
  const axis1 = [a1x, a1y, a1z], axis2 = [a2x, a2y, a2z], axis3 = [a3x, a3y, a3z];
  const axes = [axis1, axis2, axis3];
  function axisIndex(v) { return v[0] ? 0 : v[1] ? 1 : 2; }
  const rescaled = { scale: localTargetSize[axisIndex(axis1)] / tSize[0], scale2: localTargetSize[axisIndex(axis2)] / tSize[1], scale3: localTargetSize[axisIndex(axis3)] / tSize[2] };
  const grafted = MeshGraft.applyMeshTransform(template, { axis1, axis2, axis3, scale: rescaled.scale, scale2: rescaled.scale2, scale3: rescaled.scale3 });
  console.log('§W-PLACEMENT CASE2 grafted_local_bbox_size=' + [grafted.bbox[1] - grafted.bbox[0], grafted.bbox[3] - grafted.bbox[2], grafted.bbox[5] - grafted.bbox[4]].map(v => v.toFixed(4)).join(','));

  const placed2 = MeshGraft.placeInWorld(grafted, { cx, cy, cz, rotX, rotY, rotZ });
  const cmp2 = MeshGraft.compareToGroundTruth(placed2, { cx, cy, cz, bx, by, bz, rotX, rotY, rotZ });
  console.log('§W-PLACEMENT CASE2(GRAFTED,real-yaw-placement) source_status=' + grafted.source_status +
    ' maxDelta=' + cmp2.maxDelta.toFixed(5) + ' pass=' + cmp2.pass);

  // ---- CASE 3: SYNTHETIC -- tilted (rotX/rotY nonzero) placement composition, checked against a plain
  // 3x3 rotation MATRIX built fresh here (a genuinely independent implementation, not a reuse of
  // placeInWorld's own quaternion code -- a quaternion-vs-quaternion check would be circular). Deliberately
  // does NOT touch the bbox_x/y/z-is-world-space question above (no bbox comparison here at all) -- purely
  // proves placeInWorld rotates+translates individual points to the mathematically correct world location.
  // Labeled explicitly synthetic: no ARC-only resident on hand has a real tilted+geometry-linked element.
  function rotationMatrixXYZ(ex, ey, ez) {
    // standard intrinsic-XYZ rotation matrix R = Rx(ex)*Ry(ey)*Rz(ez), built from first principles
    // (elementary rotation matrices + matrix multiplication), independent of the quaternion code path.
    var cx = Math.cos(ex), sx = Math.sin(ex), cy = Math.cos(ey), sy = Math.sin(ey), cz = Math.cos(ez), sz = Math.sin(ez);
    var Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
    var Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    var Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
    function matmul(A, B) {
      var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
      return C;
    }
    return matmul(matmul(Rx, Ry), Rz);
  }
  function matVec(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }

  const synthTarget = { cx: 12.5, cy: -3.2, cz: 4.1, rotX: 0.35, rotY: -0.6, rotZ: 1.1 };
  const placed3 = MeshGraft.placeInWorld(grafted, synthTarget);
  // bonsai_library.js's own 3-axis branch: new THREE.Euler(rotX, rotZRad, -rotY) -- replicate that EXACT
  // axis relabeling with the independent matrix here too, so this is a like-for-like cross-check.
  const R = rotationMatrixXYZ(synthTarget.rotX, synthTarget.rotZ, -synthTarget.rotY);
  var maxPointErr = 0;
  for (var i = 0; i < grafted.positions.length; i += 3) {
    var local = [grafted.positions[i], grafted.positions[i + 1], grafted.positions[i + 2]];
    var expectedWorld = matVec(R, local);
    expectedWorld = [expectedWorld[0] + synthTarget.cx, expectedWorld[1] + synthTarget.cy, expectedWorld[2] + synthTarget.cz];
    var actualWorld = [placed3.positions[i], placed3.positions[i + 1], placed3.positions[i + 2]];
    var err = Math.max(Math.abs(expectedWorld[0] - actualWorld[0]), Math.abs(expectedWorld[1] - actualWorld[1]), Math.abs(expectedWorld[2] - actualWorld[2]));
    if (err > maxPointErr) maxPointErr = err;
  }
  const cmp3pass = maxPointErr < 1e-4;
  console.log('§W-PLACEMENT CASE3(SYNTHETIC,tilted,point-by-point-vs-independent-matrix) target=' + JSON.stringify(synthTarget) +
    ' vertices_checked=' + (grafted.positions.length / 3) + ' max_point_error=' + maxPointErr.toExponential(3) + ' pass=' + cmp3pass);

  const pass = cmp1.pass && cmp2.pass && cmp3pass;
  console.log('§W-PLACEMENT RESULT ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-PLACEMENT FATAL', e); process.exit(1); });
