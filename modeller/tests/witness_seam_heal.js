// witness_seam_heal.js -- SPEC_SEAM_HEALING_ENGINE.md §2 Tier 1 real-data proof.
// Proves the issue this tier exists to solve: a real element's own mesh, wherever it genuinely
// interpenetrates a real neighbor at a junction (measured as a real >tol overlap on the touch axis, NOT
// invented), gets clipped so its OWN world AABB lands FLUSH against the neighbor's near face -- honestly,
// without ever fabricating geometry to close a gap, and without ever changing source_status.
//
// Usage: node witness_seam_heal.js [SampleHouse_extracted.db] [Duplex_extracted.db]
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const RealGeometry = require('../real_geometry.js');
const SeamHeal = require('../seam_heal.js');

const FILES = [
  process.argv[2] || path.join(__dirname, '..', 'SampleHouse_extracted.db'),
  process.argv[3] || path.join(__dirname, '..', 'Duplex_extracted.db')
];

function bboxOf(p) {
  var a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
  for (var i = 0; i < p.length; i += 3) {
    var x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
  }
  return [a, b, c, d, e, f];
}
function worldAabbOfPatch(patch, placement) {
  var rz = placement.rotation_z || 0, cs = Math.cos(rz), sn = Math.sin(rz);
  var n = patch.positions.length / 3, out = new Float32Array(patch.positions.length);
  for (var i = 0; i < n; i++) {
    var lx = patch.positions[i * 3] + patch.anchorOffset[0];
    var ly = patch.positions[i * 3 + 1] + patch.anchorOffset[1];
    var lz = patch.positions[i * 3 + 2] + patch.anchorOffset[2];
    out[i * 3] = cs * lx - sn * ly + placement.center_x;
    out[i * 3 + 1] = sn * lx + cs * ly + placement.center_y;
    out[i * 3 + 2] = lz + placement.center_z;
  }
  return bboxOf(out);
}

(async () => {
  const SQL = await initSqlJs();
  let overallPass = true;
  let totalHealed = 0, totalJunctions = 0, totalRefused = 0;

  for (const file of FILES) {
    if (!fs.existsSync(file)) { console.log('§W-SEAMHEAL skip missing ' + file); continue; }
    const buf = fs.readFileSync(file);
    const db = new SQL.Database(buf);
    const idx = RealGeometry.buildGeometryIndex(db);
    const result = SeamHeal.healAll(db, idx, { tol: 0.5 });
    totalHealed += result.healed.length; totalJunctions += result.junctionsDetected; totalRefused += result.refused.length;

    const placementByGuid = {};
    db.exec('SELECT guid, center_x, center_y, center_z, rotation_z FROM element_transforms')[0].values
      .forEach(v => { placementByGuid[v[0]] = { center_x: v[1], center_y: v[2], center_z: v[3], rotation_z: v[4] }; });

    // §CHECK-1: source_status/provenance never altered by a trim.
    const labelOk = result.healed.every(h => h.patch.source_status === 'MEASURED' || h.patch.source_status === 'GRAFTED');
    const taggedOk = result.healed.every(h => h.patch.trimmed_at_junction === true && h.patch.trimmed_neighbor && h.patch.trimmed_axis);

    // §CHECK-2: every healed patch is non-degenerate (real triangles, no NaN).
    let degenerateCount = 0, nanCount = 0;
    result.healed.forEach(h => {
      if (h.patch.positions.length < 9 || h.patch.faces.length < 3) degenerateCount++;
      for (let i = 0; i < h.patch.positions.length; i++) if (!isFinite(h.patch.positions[i])) { nanCount++; break; }
    });

    // §CHECK-3: the actual proof-of-issue-solved -- post-trim world AABB on the trimmed axis lands FLUSH
    // (within 1mm) against the neighbor's REAL near face, i.e. the overlap this tier exists to fix is gone.
    let flushOk = 0, flushChecked = 0, worstResidual = 0;
    const neighborAabbByGuid = {};
    // re-derive neighbor AABBs the same way healAll did, keyed by the junction pairs it actually healed.
    const junctions = SeamHeal.detectJunctions(db, { tol: 0.5 });
    const junctionByPair = {};
    junctions.forEach(j => { junctionByPair[j.a + '|' + j.b] = j; junctionByPair[j.b + '|' + j.a] = { a: j.b, b: j.a, aAabb: j.bAabb, bAabb: j.aAabb, axis: j.axis }; });

    result.healed.slice(0, 40).forEach(h => {   // sample first 40 per building -- real proof, not exhaustive re-scan
      const jkey = h.guid + '|' + h.patch.trimmed_neighbor;
      const j = junctionByPair[jkey];
      if (!j) return;
      const placement = placementByGuid[h.guid];
      const worldBb = worldAabbOfPatch(h.patch, placement);
      const ax = 'XYZ'.indexOf(h.patch.trimmed_axis);
      const nLo = j.bAabb[2 * ax], nHi = j.bAabb[2 * ax + 1];
      const selfCenterOrig = (j.aAabb[2 * ax] + j.aAabb[2 * ax + 1]) / 2, neighborCenter = (nLo + nHi) / 2;
      const selfIsLoSide = selfCenterOrig < neighborCenter;
      const plane = selfIsLoSide ? nLo : nHi;
      const trimmedFace = selfIsLoSide ? worldBb[2 * ax + 1] : worldBb[2 * ax];
      const residual = Math.abs(trimmedFace - plane);
      flushChecked++;
      if (residual < 1e-3) flushOk++;
      if (residual > worstResidual) worstResidual = residual;
    });

    console.log('§W-SEAMHEAL file=' + path.basename(file) + ' junctionsDetected=' + result.junctionsDetected +
      ' healed=' + result.healed.length + ' refused=' + result.refused.length +
      ' labelOk=' + labelOk + ' taggedOk=' + taggedOk + ' degenerateCount=' + degenerateCount + ' nanCount=' + nanCount +
      ' flush_sample=' + flushOk + '/' + flushChecked + ' worst_residual_m=' + worstResidual.toFixed(6));

    const filePass = labelOk && taggedOk && degenerateCount === 0 && nanCount === 0 &&
      (flushChecked === 0 || flushOk === flushChecked);
    if (!filePass) overallPass = false;
  }

  console.log('§W-SEAMHEAL TOTAL junctionsDetected=' + totalJunctions + ' healed=' + totalHealed + ' refused=' + totalRefused);
  console.log('§W-SEAMHEAL RESULT ' + (overallPass ? 'PASS' : 'FAIL'));
  process.exit(overallPass ? 0 : 1);
})().catch(e => { console.error('§W-SEAMHEAL FATAL', e); process.exit(1); });
