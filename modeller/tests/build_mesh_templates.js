// build_mesh_templates.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §3a (family-clustering) + §3b (template
// storage). Groups a component_geometries-shaped table's rows by (vertex_count, face_count) -- the
// proven-safe grouping key already used by apply_mesh_dedup.js -- then, WITHIN each bucket, clusters
// members into real-template families by testing all 6 axis permutations before computing a normalized-
// unit-bbox RMS diff (§3a's stated fix over this session's earlier per-axis-only check, which under-
// detected rotated real matches, e.g. an IfcWindow pair that is the same window with X/Y swapped).
//
// READ-ONLY on the source library (never writes it -- opened via fs.readFileSync into an in-memory sql.js
// copy, md5-verified byte-identical before/after, same discipline as build_component_catalog.js). Writes
// a brand-new, separate output db -- no existing file is touched.
//
// Usage: node build_mesh_templates.js <library.db> <output_templates.db> [--rms-threshold=0.001]
//
// Output db (§1 schema -- source_status/provenance columns baked in from the start, per spec):
//   mesh_templates(template_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, vertex_count INTEGER,
//     face_count INTEGER, bbox_x REAL, bbox_y REAL, bbox_z REAL, source_building TEXT, member_count INTEGER)
//   mesh_template_map(geometry_hash TEXT PRIMARY KEY, template_hash TEXT, axis_permutation TEXT,
//     rms_confidence REAL)
//     -- axis_permutation is "p0,p1,p2": output axis i of the MEMBER maps to axis p[i] of the TEMPLATE
//     -- (identity "0,1,2" for the template's own row, which is always present as one of its own members).
//     -- rms_confidence is the raw normalized-unit-bbox RMS at the winning permutation (lower = better
//     -- match; 0.0 = byte-identical shape). Low-confidence (near-threshold) matches are kept, not
//     -- discarded -- queryable/auditable per §3a.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const LIB_PATH = process.argv[2] || path.join(__dirname, '..', '..', 'library', 'component_library.db');
const OUT_PATH = process.argv[3] || path.join(__dirname, '..', 'mesh_templates.db');
const RMS_ARG = process.argv.find(a => a.startsWith('--rms-threshold='));
const RMS_THRESHOLD = RMS_ARG ? parseFloat(RMS_ARG.split('=')[1]) : 0.001;

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// §6 (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md, IFC-standard-alignment): mesh_template_map rows carry IFC
// IfcCartesianTransformationOperator3DnonUniform's own field shape -- Axis1/2/3 (one-hot direction
// vectors: axis_k is the unit vector along the TEMPLATE's own local axis k, pointing at which OUTPUT axis
// it feeds) + Scale/Scale2/Scale3 (precomputed once here, not re-derived at graft time). scale_k =
// memberSize[perm[k]] / templateSize[k] -- see mesh_graft.js's applyMeshTransform for the consuming math.
function identityMapRow(geometryHash, templateHash, rms) {
  return { geometry_hash: geometryHash, template_hash: templateHash,
    axis1: [1, 0, 0], axis2: [0, 1, 0], axis3: [0, 0, 1], scale: 1, scale2: 1, scale3: 1, rms_confidence: rms };
}
function permMapRow(geometryHash, templateHash, perm, rms, memberSize, templateSize) {
  function oneHot(axis) { const v = [0, 0, 0]; v[axis] = 1; return v; }
  function scaleFor(k) { return templateSize[k] > 0 ? memberSize[perm[k]] / templateSize[k] : 0; }
  return { geometry_hash: geometryHash, template_hash: templateHash,
    axis1: oneHot(perm[0]), axis2: oneHot(perm[1]), axis3: oneHot(perm[2]),
    scale: scaleFor(0), scale2: scaleFor(1), scale3: scaleFor(2), rms_confidence: rms };
}

function toF32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
function toU32(blob) { return new Uint32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }

function bboxOf(p) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
  }
  return [a, b, c, d, e, f];
}

// per-axis-normalized coordinate arrays (3 Float32Arrays, one per axis 0/1/2), independent of vertex order
// -- axis a: (v[a]-min[a]) / size[a], clamped to 0 when the mesh is flat on that axis (size[a]===0).
function normalizeAxes(positions) {
  const bb = bboxOf(positions);
  const min = [bb[0], bb[2], bb[4]];
  const size = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
  const n = positions.length / 3;
  const axes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const s = size[a];
      axes[a][i] = s > 0 ? (positions[i * 3 + a] - min[a]) / s : 0;
    }
  }
  return { axes, size };
}

// RMS of memberAxes permuted by perm against templateAxes (both already per-axis-normalized, same vertex
// count -- direct index correspondence, no vertex reordering, only AXIS reordering).
function rmsDiff(memberAxes, perm, templateAxes) {
  const n = memberAxes[0].length;
  let sumSq = 0;
  for (let a = 0; a < 3; a++) {
    const mArr = memberAxes[perm[a]], tArr = templateAxes[a];
    for (let i = 0; i < n; i++) { const d = mArr[i] - tArr[i]; sumSq += d * d; }
  }
  return Math.sqrt(sumSq / (n * 3));
}

// cheap subsample pre-check (every 8th vertex, capped at 64 samples) -- avoids running the full O(n)
// RMS across all 6 permutations for buckets with thousands of members when most pairs are obviously not
// a match. Only permutations that pass the loose subsample gate get the full-precision check.
function subsampleRms(memberAxes, perm, templateAxes) {
  const n = memberAxes[0].length;
  const step = Math.max(1, Math.floor(n / 64));
  let sumSq = 0, count = 0;
  for (let a = 0; a < 3; a++) {
    const mArr = memberAxes[perm[a]], tArr = templateAxes[a];
    for (let i = 0; i < n; i += step) { const d = mArr[i] - tArr[i]; sumSq += d * d; count++; }
  }
  return Math.sqrt(sumSq / count);
}

(async () => {
  const SQL = await initSqlJs();
  const libBuf = fs.readFileSync(LIB_PATH);
  const md5Before = crypto.createHash('md5').update(libBuf).digest('hex');
  const libDb = new SQL.Database(libBuf);

  console.log('§MESHFIT-BUILD source=' + LIB_PATH + ' md5=' + md5Before);

  const geomRows = libDb.exec(
    "SELECT geometry_hash, vertices, faces, vertex_count, face_count FROM component_geometries"
  )[0];
  console.log('§MESHFIT-BUILD total_geometry_rows=' + geomRows.values.length);

  // hash -> source_building, from ad_geometry_map (§1: never anonymize provenance). A hash CAN appear
  // under >1 building_type in principle -- pick the first seen deterministically (sorted) and log if a
  // real ambiguity exists, don't silently hide it.
  let mapRows = null;
  try { mapRows = libDb.exec("SELECT geometry_hash, building_type FROM ad_geometry_map WHERE building_type IS NOT NULL")[0]; }
  catch (e) { /* table absent in some libraries -- source_building stays null, honest */ }
  const buildingsByHash = new Map();
  if (mapRows) {
    for (const [hash, bt] of mapRows.values) {
      if (!buildingsByHash.has(hash)) buildingsByHash.set(hash, new Set());
      buildingsByHash.get(hash).add(bt);
    }
  }
  let ambiguousBuildingCount = 0;
  function sourceBuildingFor(hash) {
    const s = buildingsByHash.get(hash);
    if (!s || s.size === 0) return null;
    const sorted = Array.from(s).sort();
    if (sorted.length > 1) ambiguousBuildingCount++;
    return sorted[0];
  }

  // group by (vertex_count, face_count) -- the proven-safe grouping key (RESUME_MESH_DEDUP_AND_ONBOARDING.md)
  const buckets = new Map();
  for (const [hash, vBlob, fBlob, vc, fc] of geomRows.values) {
    const key = vc + ':' + fc;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ hash, vBlob, fBlob, vc, fc });
  }
  console.log('§MESHFIT-BUILD buckets=' + buckets.size + ' multi_member_buckets=' +
    Array.from(buckets.values()).filter(m => m.length > 1).length);

  // families: array of { templateHash, axesNorm (own normalized axes, identity), size, faces, positions,
  //   memberCount, sourceBuilding }
  const templateMapRows = []; // { geometry_hash, template_hash, axis_permutation, rms_confidence }
  const templates = [];       // { template_hash, vertices, faces, vertex_count, face_count, bbox, source_building, member_count }

  let bucketsProcessed = 0, singletonFamilies = 0, matchedIntoFamily = 0;
  const t0 = Date.now();
  for (const [key, members] of buckets) {
    bucketsProcessed++;
    if (members.length === 1) {
      const m = members[0];
      const positions = toF32(m.vBlob);
      const bb = bboxOf(positions);
      templates.push({
        template_hash: m.hash, vertices: m.vBlob, faces: m.fBlob, vertex_count: m.vc, face_count: m.fc,
        bbox: [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]], source_building: sourceBuildingFor(m.hash), member_count: 1
      });
      templateMapRows.push(identityMapRow(m.hash, m.hash, 0));
      singletonFamilies++;
      continue;
    }

    // family representatives local to this bucket only (same vertex/face count required for index-aligned
    // RMS, so families never span buckets).
    const families = []; // { templateHash, axes (normalized, identity orientation), size, vBlob, fBlob, vc, fc, memberCount }
    for (const m of members) {
      const positions = toF32(m.vBlob);
      const norm = normalizeAxes(positions);
      let best = null; // { familyIdx, perm, rms }
      for (let fi = 0; fi < families.length; fi++) {
        const fam = families[fi];
        for (const perm of PERMS) {
          const sub = subsampleRms(norm.axes, perm, fam.axes);
          if (sub > RMS_THRESHOLD * 5) continue; // loose gate -- obviously not a match, skip full check
          const full = rmsDiff(norm.axes, perm, fam.axes);
          if (full <= RMS_THRESHOLD && (!best || full < best.rms)) best = { familyIdx: fi, perm, rms: full };
        }
      }
      if (best) {
        const fam = families[best.familyIdx];
        fam.memberCount++;
        templateMapRows.push(permMapRow(m.hash, fam.templateHash, best.perm, best.rms, norm.size, fam.size));
        matchedIntoFamily++;
      } else {
        families.push({ templateHash: m.hash, axes: norm.axes, size: norm.size, vBlob: m.vBlob, fBlob: m.fBlob, vc: m.vc, fc: m.fc, memberCount: 1 });
        templateMapRows.push(identityMapRow(m.hash, m.hash, 0));
      }
    }
    for (const fam of families) {
      templates.push({
        template_hash: fam.templateHash, vertices: fam.vBlob, faces: fam.fBlob, vertex_count: fam.vc, face_count: fam.fc,
        bbox: fam.size, source_building: sourceBuildingFor(fam.templateHash), member_count: fam.memberCount
      });
      if (fam.memberCount === 1) singletonFamilies++;
    }

    if (bucketsProcessed % 200 === 0) {
      console.log('§MESHFIT-BUILD progress buckets=' + bucketsProcessed + '/' + buckets.size +
        ' elapsed_ms=' + (Date.now() - t0));
    }
  }

  const confirmedFamilies = templates.filter(t => t.member_count > 1);
  console.log('§MESHFIT-BUILD done elapsed_ms=' + (Date.now() - t0) +
    ' total_templates=' + templates.length + ' confirmed_families(>1 member)=' + confirmedFamilies.length +
    ' singleton_templates=' + singletonFamilies + ' matched_into_family=' + matchedIntoFamily +
    ' ambiguous_source_building=' + ambiguousBuildingCount);
  console.log('§MESHFIT-BUILD top confirmed families by member_count: ' +
    confirmedFamilies.sort((a, b) => b.member_count - a.member_count).slice(0, 10)
      .map(t => t.template_hash.slice(0, 12) + '(' + t.member_count + ',vc=' + t.vertex_count + ')').join(' '));

  // write output db (new file, separate from the source)
  const outDb = new SQL.Database();
  outDb.run(`CREATE TABLE mesh_templates (
    template_hash TEXT PRIMARY KEY, vertices BLOB NOT NULL, faces BLOB NOT NULL,
    vertex_count INTEGER NOT NULL, face_count INTEGER NOT NULL,
    bbox_x REAL NOT NULL, bbox_y REAL NOT NULL, bbox_z REAL NOT NULL,
    source_building TEXT, member_count INTEGER NOT NULL
  )`);
  // §6: IFC IfcCartesianTransformationOperator3DnonUniform field shape -- Axis1/2/3 (direction vector
  // components) + Scale/Scale2/Scale3, instead of a bespoke axis_permutation index string.
  outDb.run(`CREATE TABLE mesh_template_map (
    geometry_hash TEXT PRIMARY KEY, template_hash TEXT NOT NULL,
    axis1_x REAL NOT NULL, axis1_y REAL NOT NULL, axis1_z REAL NOT NULL,
    axis2_x REAL NOT NULL, axis2_y REAL NOT NULL, axis2_z REAL NOT NULL,
    axis3_x REAL NOT NULL, axis3_y REAL NOT NULL, axis3_z REAL NOT NULL,
    scale REAL NOT NULL, scale2 REAL NOT NULL, scale3 REAL NOT NULL,
    rms_confidence REAL NOT NULL
  )`);
  const tplStmt = outDb.prepare("INSERT INTO mesh_templates VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const t of templates) {
    tplStmt.run([t.template_hash, t.vertices, t.faces, t.vertex_count, t.face_count,
      t.bbox[0], t.bbox[1], t.bbox[2], t.source_building, t.member_count]);
  }
  tplStmt.free();
  const mapStmt = outDb.prepare("INSERT INTO mesh_template_map VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const r of templateMapRows) {
    mapStmt.run([r.geometry_hash, r.template_hash,
      r.axis1[0], r.axis1[1], r.axis1[2], r.axis2[0], r.axis2[1], r.axis2[2], r.axis3[0], r.axis3[1], r.axis3[2],
      r.scale, r.scale2, r.scale3, r.rms_confidence]);
  }
  mapStmt.free();
  fs.writeFileSync(OUT_PATH, Buffer.from(outDb.export()));
  console.log('§MESHFIT-BUILD wrote ' + OUT_PATH + ' size_bytes=' + fs.statSync(OUT_PATH).size +
    ' mesh_templates_rows=' + templates.length + ' mesh_template_map_rows=' + templateMapRows.length);

  // re-verify the source library was never mutated
  const md5After = crypto.createHash('md5').update(fs.readFileSync(LIB_PATH)).digest('hex');
  console.log('§MESHFIT-BUILD source_untouched=' + (md5After === md5Before) + ' md5_after=' + md5After);
  if (md5After !== md5Before) { console.error('§MESHFIT-BUILD FATAL source library was modified'); process.exit(1); }
})().catch(e => { console.error('§MESHFIT-BUILD FATAL', e); process.exit(1); });
