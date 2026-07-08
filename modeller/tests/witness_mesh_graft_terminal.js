// witness_mesh_graft_terminal.js -- whole-building minimal-footprint proof, per user request 2026-07-09:
// "test on Terminal, see if it can recall all the meshes with new rehash on minimal meshes, then compare
// with its original copy." Uses Terminal's OWN real geometry substrate (Terminal_geo.db, ARC-only scope
// per the standing embed decision -- RESUME_ARC_ONLY_RESIDENT_AND_CROSSSECTION.md), not the generic parts
// catalog. Two passes:
//   (1) build_mesh_templates.js's §3a clustering run against Terminal_geo.db directly (read-only, never
//       written) -- reports how few distinct templates ("minimal meshes") are needed to cover every
//       geometry_hash Terminal's ARC-only element_instances actually reference.
//   (2) for EVERY referenced hash that landed in a confirmed (>1 member) family, graft-reconstruct it from
//       its family's template via mesh_graft.js §3c (using ITS OWN real bbox as the target size) and
//       compare the grafted result against Terminal's actual stored mesh for that hash -- aggregate bbox
//       fidelity + shape RMS across the whole building, not one cherry-picked case.
// Pure node, read-only on Terminal_geo.db/Terminal_meta.db throughout (md5-verified untouched after).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const MeshGraft = require('../mesh_graft.js');

const GEO_PATH = process.argv[2] || path.join(__dirname, '..', 'Terminal_geo.db');
const META_PATH = process.argv[3] || path.join(__dirname, '..', 'Terminal_meta.db');
const RMS_THRESHOLD = 0.001;
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

function toF32(b) { return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function toU32(b) { return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function bboxOf(p) { return MeshGraft.bboxOf(p); }
function sizeOf(p) { const bb = bboxOf(p); return [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]]; }
function normalizeAxes(positions) {
  const bb = bboxOf(positions);
  const min = [bb[0], bb[2], bb[4]], size = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
  const n = positions.length / 3, axes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const s = size[a]; axes[a][i] = s > 0 ? (positions[i * 3 + a] - min[a]) / s : 0; }
  return { axes, size };
}
function subsampleRms(memberAxes, perm, templateAxes) {
  const n = memberAxes[0].length, step = Math.max(1, Math.floor(n / 64));
  let sumSq = 0, count = 0;
  for (let a = 0; a < 3; a++) { const mArr = memberAxes[perm[a]], tArr = templateAxes[a]; for (let i = 0; i < n; i += step) { const d = mArr[i] - tArr[i]; sumSq += d * d; count++; } }
  return Math.sqrt(sumSq / count);
}
function rmsDiff(memberAxes, perm, templateAxes) {
  const n = memberAxes[0].length; let sumSq = 0;
  for (let a = 0; a < 3; a++) { const mArr = memberAxes[perm[a]], tArr = templateAxes[a]; for (let i = 0; i < n; i++) { const d = mArr[i] - tArr[i]; sumSq += d * d; } }
  return Math.sqrt(sumSq / (n * 3));
}
function shapeRmsBetween(a, b) {
  const bbA = bboxOf(a), bbB = bboxOf(b);
  const sizeA = [bbA[1] - bbA[0], bbA[3] - bbA[2], bbA[5] - bbA[4]], sizeB = [bbB[1] - bbB[0], bbB[3] - bbB[2], bbB[5] - bbB[4]];
  const n = a.length / 3; let sumSq = 0;
  for (let i = 0; i < n; i++) for (let ax = 0; ax < 3; ax++) {
    const sa = sizeA[ax] > 0 ? sizeA[ax] : 1, sb = sizeB[ax] > 0 ? sizeB[ax] : 1;
    const minA = ax === 0 ? bbA[0] : ax === 1 ? bbA[2] : bbA[4], minB = ax === 0 ? bbB[0] : ax === 1 ? bbB[2] : bbB[4];
    const na = (a[i * 3 + ax] - minA) / sa, nb = (b[i * 3 + ax] - minB) / sb;
    const d = na - nb; sumSq += d * d;
  }
  return Math.sqrt(sumSq / (n * 3));
}
function recentre(p) {
  const bb = bboxOf(p), cx = (bb[0] + bb[1]) / 2, cy = (bb[2] + bb[3]) / 2, cz = (bb[4] + bb[5]) / 2;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { out[i] = p[i] - cx; out[i + 1] = p[i + 1] - cy; out[i + 2] = p[i + 2] - cz; }
  return out;
}

(async () => {
  const SQL = await initSqlJs();
  const geoBufBefore = fs.readFileSync(GEO_PATH);
  const md5Before = crypto.createHash('md5').update(geoBufBefore).digest('hex');
  const geoDb = new SQL.Database(geoBufBefore);
  const metaDb = new SQL.Database(fs.readFileSync(META_PATH));

  console.log('§W-TERMINAL-MESHFIT source=' + GEO_PATH + ' md5=' + md5Before);

  // which hashes does Terminal's ARC-only element_instances actually reference?
  const usedRows = metaDb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0];
  const usedHashes = new Set(usedRows.values.map(v => v[0]));
  console.log('§W-TERMINAL-MESHFIT arc_only_referenced_distinct_hashes=' + usedHashes.size);

  // element_transforms for real target bbox size per guid -- but we need bbox PER HASH (a hash can be
  // instanced by many guids at different real sizes only if this is a component/box style resident; for
  // Terminal's per-element extraction each hash is normally 1 real shape -- verify below by checking if any
  // hash's own stored geometry disagrees with its own bbox, which it can't since it's the SAME row).
  // The bbox we graft TO here is the hash's OWN real geometry bbox (same methodology as the component_library
  // witness) -- proves "can the template+permutation reconstruct what is ACTUALLY stored under this hash".

  // §3a clustering, restricted to the geometry rows (all 8679 -- clustering doesn't care which are ARC-referenced)
  // Terminal_geo.db's component_geometries has no vertex_count/face_count columns (different extraction
  // schema than component_library.db) -- use blob byte-length as the bucket key instead, the SAME proven
  // grouping proxy apply_mesh_dedup.js already uses (vertex_count/face_count are themselves just vl/12,
  // fl/12 -- byte-length is equally exact for this purpose, same rows land in the same bucket either way).
  const geomRows = geoDb.exec("SELECT geometry_hash, vertices, faces, building FROM component_geometries")[0];
  console.log('§W-TERMINAL-MESHFIT total_geometry_rows=' + geomRows.values.length);
  const buildingByHash = new Map(geomRows.values.map(v => [v[0], v[3]]));

  const buckets = new Map();
  for (const [hash, vBlob, fBlob] of geomRows.values) {
    const key = vBlob.byteLength + ':' + fBlob.byteLength;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ hash, vBlob, fBlob });
  }

  const templateOf = new Map(); // hash -> { templateHash, perm, rms }
  const templates = new Map();  // templateHash -> { vBlob, fBlob, memberCount }
  const t0 = Date.now();
  for (const [key, members] of buckets) {
    if (members.length === 1) {
      const m = members[0];
      templates.set(m.hash, { vBlob: m.vBlob, fBlob: m.fBlob, memberCount: 1 });
      templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      continue;
    }
    const families = [];
    for (const m of members) {
      const positions = toF32(m.vBlob);
      const norm = normalizeAxes(positions);
      let best = null;
      for (let fi = 0; fi < families.length; fi++) {
        const fam = families[fi];
        for (const perm of PERMS) {
          const sub = subsampleRms(norm.axes, perm, fam.axes);
          if (sub > RMS_THRESHOLD * 5) continue;
          const full = rmsDiff(norm.axes, perm, fam.axes);
          if (full <= RMS_THRESHOLD && (!best || full < best.rms)) best = { familyIdx: fi, perm, rms: full };
        }
      }
      if (best) {
        const fam = families[best.familyIdx];
        fam.memberCount++;
        templateOf.set(m.hash, { templateHash: fam.templateHash, perm: best.perm, rms: best.rms });
      } else {
        families.push({ templateHash: m.hash, axes: norm.axes, vBlob: m.vBlob, fBlob: m.fBlob, memberCount: 1 });
        templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      }
    }
    for (const fam of families) templates.set(fam.templateHash, { vBlob: fam.vBlob, fBlob: fam.fBlob, memberCount: fam.memberCount });
  }
  console.log('§W-TERMINAL-MESHFIT clustering_elapsed_ms=' + (Date.now() - t0) + ' total_templates=' + templates.size +
    ' confirmed_families(>1)=' + Array.from(templates.values()).filter(t => t.memberCount > 1).length);

  // minimal footprint: of the 977 ARC-referenced hashes, how many DISTINCT templates cover them?
  const usedTemplates = new Set();
  let usedInConfirmedFamily = 0, usedSingleton = 0;
  for (const h of usedHashes) {
    const t = templateOf.get(h);
    if (!t) continue; // shouldn't happen -- every referenced hash must exist in component_geometries
    usedTemplates.add(t.templateHash);
    if (templates.get(t.templateHash).memberCount > 1) usedInConfirmedFamily++; else usedSingleton++;
  }
  console.log('§W-TERMINAL-MESHFIT MINIMAL-FOOTPRINT arc_referenced_hashes=' + usedHashes.size +
    ' distinct_templates_needed=' + usedTemplates.size +
    ' compression_ratio=' + (usedHashes.size / usedTemplates.size).toFixed(2) + 'x' +
    ' (in_confirmed_family=' + usedInConfirmedFamily + ' singleton_no_reuse=' + usedSingleton + ')');

  // graft-reconstruct EVERY referenced hash that is a non-canonical member of a confirmed family, compare
  // against its own real stored mesh.
  const geomByHash = new Map();
  for (const [hash, vBlob, fBlob] of geomRows.values) geomByHash.set(hash, { vBlob, fBlob });

  let tested = 0, bboxFailures = 0, sumRms = 0, maxRms = 0, worstHash = null, rmsUnder1pct = 0, rmsUnder5pct = 0;
  for (const h of usedHashes) {
    const t = templateOf.get(h);
    if (!t || t.templateHash === h) continue; // skip the family's own canonical row -- trivially identical, not a graft
    const own = geomByHash.get(h);
    const ownPositions = toF32(own.vBlob);
    const ownSize = sizeOf(ownPositions);
    const tplRow = templates.get(t.templateHash);
    const template = { template_hash: t.templateHash, vertices: toF32(tplRow.vBlob), faces: tplRow.fBlob, source_building: buildingByHash.get(t.templateHash) || null };
    const grafted = MeshGraft.graftFit(template, ownSize, t.perm);

    const gSize = sizeOf(grafted.positions);
    const bboxErr = [0, 1, 2].map(a => Math.abs(gSize[a] - ownSize[a]));
    if (!bboxErr.every(e => e < 1e-3)) bboxFailures++;

    const rms = shapeRmsBetween(grafted.positions, recentre(ownPositions));
    sumRms += rms;
    if (rms > maxRms) { maxRms = rms; worstHash = h; }
    if (rms < 0.01) rmsUnder1pct++;
    if (rms < 0.05) rmsUnder5pct++;
    tested++;
  }
  const meanRms = tested ? sumRms / tested : 0;
  console.log('§W-TERMINAL-MESHFIT GRAFT-RECONSTRUCT tested=' + tested + ' bbox_failures=' + bboxFailures +
    ' mean_shape_rms=' + meanRms.toFixed(6) + ' max_shape_rms=' + maxRms.toFixed(6) + ' worst_hash=' + worstHash +
    ' within_1pct_rms=' + rmsUnder1pct + '/' + tested + ' within_5pct_rms=' + rmsUnder5pct + '/' + tested);

  const md5After = crypto.createHash('md5').update(fs.readFileSync(GEO_PATH)).digest('hex');
  const untouched = md5After === md5Before;
  console.log('§W-TERMINAL-MESHFIT source_untouched=' + untouched);

  const pass = untouched && bboxFailures === 0 && (tested === 0 || rmsUnder5pct === tested);
  console.log('§W-TERMINAL-MESHFIT RESULT ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-TERMINAL-MESHFIT FATAL', e); process.exit(1); });
