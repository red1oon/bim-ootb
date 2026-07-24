#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — bake_demo_graft.js scope (read the log after every run)
 * SCOPE: SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §10 -- offline, one-time, LOCAL-ONLY demo bake. Copies a
 * building's *_extracted.db, replaces ONE malformed element's geometry with a real, well-shaped
 * Terminal-sourced template (via the ALREADY-PROVEN mesh_graft.js/real_geometry.js functions -- graftFit/
 * applyMeshTransform/placeInWorld/compareToGroundTruth are called here, never reimplemented), and writes
 * the result to a NEW, separately-named file. This is NOT the live/dynamic templateIndex path (§1/§3c) --
 * no Viewer/Modeller runtime file is touched, no OCI upload, the original source db is NEVER mutated
 * in place (always copied first). No binary DB is committed to git -- the --out file stays local.
 *
 * Subcommands:
 *   scan   -- Step 0/1: find malformed elements of an IFC class in a source db (MEASURED signals, not
 *             assumed) + list candidate donor templates from a library/templates db. Read-only, never writes.
 *   bake   -- Step 2/3: copy source-db -> out, graft the target guid's geometry from the chosen template,
 *             write it back into --out's own geometry table, then IMMEDIATELY re-verify by (a) re-opening
 *             --out fresh from disk and resolving the target guid through real_geometry.js's NORMAL
 *             MEASURED code path, and (b) running a real bonsai_oplog.js/kernel_ops.js commit+restore+
 *             verifyChain cycle to prove an op-log session survives on top of the baked base db, with the
 *             baked geometry bytes confirmed byte-identical before/after.
 *
 * See "How to run this for a different building/element" in SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §10 for a
 * full walkthrough. Every claim below is proven by a real §-tagged log line, not by exit code alone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const MeshGraft = require('../mesh_graft.js');
const RealGeometry = require('../real_geometry.js');

const TAG = '§DEMO_GRAFT';
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

function toF32(b) { return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function toU32(b) { return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function bboxOf(p) { return MeshGraft.bboxOf(p); }
function sizeOf(bb) { return [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]]; }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) { out[a.slice(2, eq)] = a.slice(eq + 1); }
    else { const v = argv[i + 1]; out[a.slice(2)] = (v && !v.startsWith('--')) ? (i++, v) : true; }
  }
  return out;
}

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

// §10 Step 2.7 helper -- element_transforms.bbox_x/y/z is WORLD-space (post-rotation), confirmed on real
// data by mesh_graft.js's own §PLACEMENT-FINDING header + witness_mesh_graft_placement.js CASE2. Recovering
// the LOCAL (pre-rotation) size a template must be scaled to is exactly invertible only for an axis-aligned
// (clean 90°-multiple) rotation -- same limitation §8/§9 of the spec already name, not a new gap. Refuses
// (returns null) rather than silently producing a wrong local size for an oblique rotation.
function localSizeFromWorldBboxYawOnly(worldSize, rotZ) {
  const twoPi = Math.PI * 2, r = ((rotZ % twoPi) + twoPi) % twoPi;
  const nearQuarter = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(r - nearQuarter) > 1e-6) return null;
  const quarterSteps = Math.round(nearQuarter / (Math.PI / 2)) % 2;
  return quarterSteps === 0 ? worldSize.slice() : [worldSize[1], worldSize[0], worldSize[2]];
}

// pick the axis permutation that requires the most UNIFORM per-axis scale (least distortion) -- a
// data-driven, non-invented heuristic: a well-matched permutation shouldn't need wildly different scale
// factors on different axes. Ties (e.g. a target with two equal axes) resolve to the first PERMS entry,
// deterministic. Returns null if every permutation is degenerate (a zero-size template axis).
function pickBestPermutation(templateSize, targetSize) {
  let best = null;
  for (const perm of PERMS) {
    const scales = [0, 1, 2].map(k => templateSize[k] > 0 ? targetSize[perm[k]] / templateSize[k] : -1);
    if (scales.some(s => !(s > 0) || !isFinite(s))) continue;
    const logs = scales.map(Math.log);
    const mean = logs.reduce((a, b) => a + b, 0) / 3;
    const variance = logs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / 3;
    if (!best || variance < best.variance - 1e-12) best = { perm, scales, variance };
  }
  return best;
}

async function openDb(SQL, p) { return new SQL.Database(fs.readFileSync(p)); }

// ------------------------------------------------------------------------------------------------------
// scan -- Step 0 (find the malformed element(s)) + Step 1 (list donor template candidates)
// ------------------------------------------------------------------------------------------------------
async function cmdScan(args) {
  const SQL = await initSqlJs();
  const sourcePath = args['source-db'];
  const ifcClass = args['ifc-class'] || 'IfcFireSuppressionTerminal';
  if (!sourcePath) { console.error(TAG + ' FATAL scan requires --source-db'); process.exit(1); }

  const db = await openDb(SQL, sourcePath);
  const rows = db.exec(
    "SELECT m.guid, i.geometry_hash, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m " +
    "JOIN element_instances i ON i.guid = m.guid LEFT JOIN element_transforms t ON t.guid = m.guid " +
    "WHERE m.ifc_class = ?", [ifcClass])[0];
  const total = rows ? rows.values.length : 0;
  console.log(TAG + '_SCAN source=' + sourcePath + ' ifc_class=' + ifcClass + ' total_instances=' + total);
  if (!total) { console.log(TAG + '_SCAN no elements of this class found'); return; }

  const byHash = new Map();
  for (const [guid, hash, bx, by, bz] of rows.values) {
    if (!byHash.has(hash)) byHash.set(hash, { count: 0, guids: [] });
    const e = byHash.get(hash); e.count++; e.guids.push(guid);
  }
  const shapes = [];
  for (const [hash, info] of byHash) {
    const g = db.exec('SELECT vertices, faces, building FROM component_geometries WHERE geometry_hash=?', [hash])[0];
    if (!g) { shapes.push({ hash, count: info.count, guids: info.guids, verts: 0, faces: 0, size: null }); continue; }
    const [vBlob, fBlob, building] = g.values[0];
    const pos = toF32(vBlob), faces = toU32(fBlob);
    const bb = bboxOf(pos), size = sizeOf(bb);
    shapes.push({ hash, count: info.count, guids: info.guids, verts: pos.length / 3, faces: faces.length / 3, size, building });
  }
  shapes.sort((a, b) => a.verts - b.verts);
  const vertsSorted = shapes.map(s => s.verts).slice().sort((a, b) => a - b);
  const medianVerts = vertsSorted[Math.floor(vertsSorted.length / 2)];

  console.log(TAG + '_SCAN distinct_hashes=' + byHash.size + ' median_verts_across_distinct_shapes=' + medianVerts);
  for (const s of shapes) {
    const maxAxis = s.size ? Math.max(...s.size) : 0, minAxis = s.size ? Math.min(...s.size) : 0;
    const aspect = minAxis > 0 ? (maxAxis / minAxis) : Infinity;
    const reasons = [];
    if (s.verts < medianVerts * 0.5 && shapes.length > 1) reasons.push('verts<' + (medianVerts * 0.5).toFixed(0) + '(50%-of-median)');
    if (aspect > 3) reasons.push('aspect_ratio=' + aspect.toFixed(2) + '(elongated/degenerate)');
    if (s.size && minAxis < 0.005) reasons.push('min_axis<5mm(near-flat)');
    console.log(TAG + '_CANDIDATE guid=' + s.guids[0] + ' hash=' + s.hash + ' member_count=' + s.count +
      ' bbox=' + (s.size ? s.size.map(v => v.toFixed(5)).join(',') : 'NONE') +
      ' verts=' + s.verts + ' faces=' + s.faces + ' building=' + s.building +
      ' reason=' + (reasons.length ? reasons.join(';') : 'none(looks-plausible)'));
  }

  // Step 1 -- reference distribution + donor candidates from a library db (component_library.db-shaped:
  // component_types/component_definitions/component_geometries/ad_geometry_map), if supplied.
  const refPath = args['reference-lib'];
  if (refPath) {
    const refDb = await openDb(SQL, refPath);
    const cand = refDb.exec(
      "SELECT cd.geometry_hash, cd.vertex_count, cd.face_count, cd.instance_count, cd.name " +
      "FROM component_types ct JOIN component_definitions cd ON cd.type_id = ct.id WHERE ct.ifc_class=?", [ifcClass])[0];
    console.log(TAG + '_REFERENCE reference_lib=' + refPath + ' candidates=' + (cand ? cand.values.length : 0));
    if (cand && cand.values.length) {
      // rank by (a) real member_count already confirmed in a templates.db if given, else just report the
      // richest single geometry (highest vertex_count) grouped by name -- a real, non-degenerate donor shape.
      const byName = new Map();
      for (const [hash, vc, fc, ic, name] of cand.values) {
        if (!byName.has(name)) byName.set(name, { hash, vc, fc, ic, count: 0 });
        byName.get(name).count++;
      }
      const ranked = Array.from(byName.entries()).sort((a, b) => b[1].vc - a[1].vc);
      for (const [name, info] of ranked.slice(0, 10)) {
        console.log(TAG + '_REFERENCE name="' + name + '" sample_hash=' + info.hash + ' verts=' + info.vc +
          ' faces=' + info.fc + ' distinct_geometry_hashes_under_this_name=' + info.count);
      }
    }
  }
  const templatesPath = args['templates-db'];
  if (templatesPath) {
    const tplDb = await openDb(SQL, templatesPath);
    // find which templates the reference-lib candidates above clustered into (best donor = real member_count>1)
    const refHashArg = args['probe-hash'];
    if (refHashArg) {
      const m = tplDb.exec('SELECT template_hash, rms_confidence FROM mesh_template_map WHERE geometry_hash=?', [refHashArg])[0];
      if (m && m.values.length) {
        const [templateHash, rms] = m.values[0];
        const t = tplDb.exec('SELECT vertex_count, face_count, bbox_x, bbox_y, bbox_z, source_building, member_count FROM mesh_templates WHERE template_hash=?', [templateHash])[0];
        const [vc, fc, bx, by, bz, sb, mc] = t.values[0];
        console.log(TAG + '_TEMPLATE probe_hash=' + refHashArg + ' -> template_hash=' + templateHash + ' rms_confidence=' + rms +
          ' verts=' + vc + ' faces=' + fc + ' bbox=' + [bx, by, bz].map(v => v.toFixed(5)).join(',') +
          ' source_building=' + sb + ' member_count=' + mc);
      } else {
        console.log(TAG + '_TEMPLATE probe_hash=' + refHashArg + ' not found in mesh_template_map');
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------
// bake -- Step 2 (graft + write) + Step 3 (re-open verify + oplog-survival verify)
// ------------------------------------------------------------------------------------------------------
async function cmdBake(args) {
  const SQL = await initSqlJs();
  const sourcePath = args['source-db'], outPath = args['out'], targetGuid = args['target-guid'],
    templateHashArg = args['template-hash'], templatesPath = args['templates-db'];
  if (!sourcePath || !outPath || !targetGuid || !templateHashArg || !templatesPath) {
    console.error(TAG + ' FATAL bake requires --source-db --target-guid --template-hash --templates-db --out');
    process.exit(1);
  }

  // Step 2.1 -- copy first, NEVER mutate the original source in place.
  const srcBufBefore = fs.readFileSync(sourcePath);
  const md5Before = md5(srcBufBefore);
  fs.copyFileSync(sourcePath, outPath);
  const md5After = md5(fs.readFileSync(sourcePath));
  console.log(TAG + '_BAKE source_untouched=' + (md5Before === md5After) + ' source=' + sourcePath + ' -> out=' + outPath);
  if (md5Before !== md5After) { console.error(TAG + ' FATAL source db was mutated by the copy step'); process.exit(1); }

  const db = await openDb(SQL, outPath);

  // Step 2.2 -- real target placement + current geometry_hash.
  const tRow = db.exec(
    "SELECT t.center_x,t.center_y,t.center_z,t.rotation_x,t.rotation_y,t.rotation_z,t.bbox_x,t.bbox_y,t.bbox_z,i.geometry_hash " +
    "FROM element_transforms t JOIN element_instances i ON i.guid=t.guid WHERE t.guid=?", [targetGuid])[0];
  if (!tRow || !tRow.values.length) { console.error(TAG + ' FATAL target guid ' + targetGuid + ' not found in element_transforms/element_instances'); process.exit(1); }
  const [cx, cy, cz, rotX, rotY, rotZ, bx, by, bz, oldHash] = tRow.values[0];
  console.log(TAG + '_BAKE target guid=' + targetGuid + ' center=' + [cx, cy, cz].map(v => v.toFixed(4)) +
    ' rotation=' + [rotX, rotY, rotZ].map(v => v.toFixed(4)) + ' world_bbox=' + [bx, by, bz].map(v => v.toFixed(5)) + ' old_hash=' + oldHash);

  // Step 2.4 -- check instance-sharing BEFORE deciding in-place-update vs new-hash-insert.
  const shareCount = db.exec('SELECT COUNT(*) FROM element_instances WHERE geometry_hash=?', [oldHash])[0].values[0][0];
  console.log(TAG + '_BAKE old_hash_shared_by=' + shareCount + ' instances -> ' +
    (shareCount > 1 ? 'NOT 1:1, inserting a NEW hash + updating ONLY the target guid (never touching the other ' + (shareCount - 1) + ' shared instances)' : '1:1, would be safe to update in place, but still inserting a new hash for a clean audit trail'));

  const oldGeomRow = db.exec('SELECT vertices, building FROM component_geometries WHERE geometry_hash=?', [oldHash])[0];
  const oldPos = toF32(oldGeomRow.values[0][0]);
  const oldSize = sizeOf(bboxOf(oldPos));
  const buildingLabel = oldGeomRow.values[0][1];

  // recover the LOCAL (pre-rotation) target size from the WORLD-space element_transforms bbox (§10 Step 2.7).
  const localTargetSize = localSizeFromWorldBboxYawOnly([bx, by, bz], rotZ);
  if (!localTargetSize) { console.error(TAG + ' FATAL rotation_z=' + rotZ + ' is not a clean 90°-multiple -- local size not recoverable, refusing to graft (per spec §8/§9 scope)'); process.exit(1); }
  console.log(TAG + '_BAKE local_target_size(recovered)=' + localTargetSize.map(v => v.toFixed(5)).join(','));

  // Step 1 (confirm) -- load the chosen donor template.
  const tplDb = await openDb(SQL, templatesPath);
  const tplRow = tplDb.exec('SELECT vertices, faces, vertex_count, face_count, bbox_x, bbox_y, bbox_z, source_building, member_count FROM mesh_templates WHERE template_hash=?', [templateHashArg])[0];
  if (!tplRow || !tplRow.values.length) { console.error(TAG + ' FATAL template_hash ' + templateHashArg + ' not found in ' + templatesPath); process.exit(1); }
  const [tVBlob, tFBlob, tVc, tFc, tBx, tBy, tBz, sourceBuilding, memberCount] = tplRow.values[0];
  console.log(TAG + '_BAKE donor template=' + templateHashArg + ' verts=' + tVc + ' faces=' + tFc +
    ' bbox=' + [tBx, tBy, tBz].map(v => v.toFixed(5)).join(',') + ' source_building=' + sourceBuilding + ' member_count=' + memberCount);

  const template = { template_hash: templateHashArg, vertices: toF32(tVBlob), faces: toU32(tFBlob), source_building: sourceBuilding };
  const templateSize = [tBx, tBy, tBz];
  const permInfo = pickBestPermutation(templateSize, localTargetSize);
  if (!permInfo) { console.error(TAG + ' FATAL no valid axis permutation (degenerate template or target size)'); process.exit(1); }
  console.log(TAG + '_BAKE axis_permutation=' + JSON.stringify(permInfo.perm) + ' scale_factors=' + permInfo.scales.map(v => v.toFixed(4)).join(',') +
    ' (picked by minimum per-axis-scale variance, ln-space=' + permInfo.variance.toExponential(3) + ')');

  // Step 2.3 -- graft via the ALREADY-PROVEN mesh_graft.js primitives, never reimplemented.
  const grafted = MeshGraft.graftFit(template, localTargetSize, permInfo.perm);
  const placed = MeshGraft.placeInWorld({ positions: grafted.positions, faces: grafted.faces }, { cx, cy, cz, rotX, rotY, rotZ });
  const cmp = MeshGraft.compareToGroundTruth(placed, { cx, cy, cz, bx, by, bz });
  console.log(TAG + '_BAKE guid=' + targetGuid + ' old_hash=' + oldHash + ' template=' + templateHashArg +
    ' maxDelta=' + cmp.maxDelta.toExponential(3) + ' tolerance=' + cmp.tolerance + ' compareToGroundTruth.pass=' + cmp.pass);
  if (!cmp.pass) { console.error(TAG + ' FATAL compareToGroundTruth failed -- refusing to write a bad bake'); process.exit(1); }

  // Step 2 (write) -- RECENTRED LOCAL positions/faces (applyMeshTransform/graftFit output), NOT the
  // world-placed output -- matches component_geometries/base_geometries's own local/recentred convention.
  const newHash = crypto.createHash('sha1').update(Buffer.from(grafted.positions.buffer)).update(Buffer.from(grafted.faces.buffer)).update(targetGuid).digest('hex').slice(0, 16);
  const clash = db.exec('SELECT COUNT(*) FROM component_geometries WHERE geometry_hash=?', [newHash])[0].values[0][0];
  if (clash > 0) { console.error(TAG + ' FATAL new_hash ' + newHash + ' collides with an existing row -- aborting'); process.exit(1); }

  // §1 labeling (LOCKED, non-optional, applies to a demo copy too): additive provenance columns.
  const cols = db.exec('PRAGMA table_info(component_geometries)')[0].values.map(v => v[1]);
  if (!cols.includes('source_status')) db.run('ALTER TABLE component_geometries ADD COLUMN source_status TEXT');
  if (!cols.includes('source_template_hash')) db.run('ALTER TABLE component_geometries ADD COLUMN source_template_hash TEXT');
  if (!cols.includes('source_building')) db.run('ALTER TABLE component_geometries ADD COLUMN source_building TEXT');

  const posBlob = new Uint8Array(grafted.positions.buffer, grafted.positions.byteOffset, grafted.positions.byteLength);
  const faceBlob = new Uint8Array(grafted.faces.buffer, grafted.faces.byteOffset, grafted.faces.byteLength);
  db.run('INSERT INTO component_geometries (geometry_hash, vertices, faces, building, source_status, source_template_hash, source_building) VALUES (?,?,?,?,?,?,?)',
    [newHash, posBlob, faceBlob, buildingLabel, 'GRAFTED', templateHashArg, sourceBuilding]);
  db.run('UPDATE element_instances SET geometry_hash=? WHERE guid=?', [newHash, targetGuid]);

  fs.writeFileSync(outPath, Buffer.from(db.export()));
  const newSize = sizeOf(bboxOf(grafted.positions));
  console.log(TAG + '_BAKE wrote out=' + outPath + ' size_bytes=' + fs.statSync(outPath).size +
    ' new_hash=' + newHash + ' old_local_size=' + oldSize.map(v => v.toFixed(5)).join(',') +
    ' new_local_size=' + newSize.map(v => v.toFixed(5)).join(',') +
    ' old_verts=' + (oldPos.length / 3) + ' new_verts=' + (grafted.positions.length / 3));

  // sidecar manifest -- machine-readable provenance, redundant with the additive columns above (belt+braces).
  const manifest = {
    target_guid: targetGuid, old_geometry_hash: oldHash, new_geometry_hash: newHash,
    template_hash: templateHashArg, source_building: sourceBuilding, template_member_count: memberCount,
    axis_permutation: permInfo.perm, scale_factors: permInfo.scales, local_target_size: localTargetSize,
    world_target_bbox: [bx, by, bz], center: [cx, cy, cz], rotation: [rotX, rotY, rotZ],
    compare_to_ground_truth: cmp, baked_at: new Date().toISOString(), source_db: path.resolve(sourcePath)
  };
  fs.writeFileSync(outPath + '.graft_manifest.json', JSON.stringify(manifest, null, 2));
  console.log(TAG + '_BAKE manifest=' + outPath + '.graft_manifest.json');

  db.close();
  tplDb.close();

  // ------------------------------------------------------------------------------------------------
  // Step 3.1 -- OPEN TEST: fresh re-open of --out from disk (new sql.js instance, real file I/O, not the
  // same in-memory handle above), resolve the target guid through real_geometry.js's NORMAL code path.
  // ------------------------------------------------------------------------------------------------
  const reopenDb = await openDb(SQL, outPath);
  const idx = RealGeometry.buildGeometryIndex(reopenDb); // 2-arg call -- byte-identical to every live call site, no templateIndex tier
  const resolvedHash = idx.byGuid[targetGuid];
  const resolved = idx.resolved[resolvedHash];
  const opensClean = resolvedHash === newHash && !!resolved && resolved.source_status === 'MEASURED';
  console.log(TAG + '_OPEN_TEST reopened=' + outPath + ' byGuid_hash=' + resolvedHash + ' expected_hash=' + newHash +
    ' resolved_present=' + !!resolved + ' resolved_source_status=' + (resolved && resolved.source_status) +
    ' resolved_verts=' + (resolved ? resolved.positions.length / 3 : 0) + ' resolves_normal_MEASURED_path=' + opensClean);

  // re-derive placement + ground-truth check fresh from the REOPENED file's own element_transforms row.
  const freshT = reopenDb.exec(
    "SELECT center_x,center_y,center_z,rotation_x,rotation_y,rotation_z,bbox_x,bbox_y,bbox_z FROM element_transforms WHERE guid=?", [targetGuid])[0].values[0];
  const [fcx, fcy, fcz, frx, fry, frz, fbx, fby, fbz] = freshT;
  const freshPlaced = MeshGraft.placeInWorld({ positions: resolved.positions, faces: resolved.faces, anchorOffset: resolved.anchorOffset }, { cx: fcx, cy: fcy, cz: fcz, rotX: frx, rotY: fry, rotZ: frz });
  const freshCmp = MeshGraft.compareToGroundTruth(freshPlaced, { cx: fcx, cy: fcy, cz: fcz, bx: fbx, by: fby, bz: fbz });
  console.log(TAG + '_OPEN_TEST fresh_placement maxDelta=' + freshCmp.maxDelta.toExponential(3) + ' pass=' + freshCmp.pass);
  reopenDb.close();

  const openTestPass = opensClean && freshCmp.pass;

  // ------------------------------------------------------------------------------------------------
  // Step 3.2 -- LIVE SAVE/RELOAD OP-LOG TEST: real bonsai_oplog.js + real kernel_ops.js (node-shimmed,
  // same pattern as witness_modeller_redo_order.js), proving a signed op-log session survives a base db
  // with baked-in graft geometry underneath it. bonsai_oplog.js's persistence is localStorage-based and
  // NEVER touches the sqlite base file -- so the honest, narrow claim (per spec §10 Step 3.2) is: (a) the
  // op-log itself commits/persists/reloads/verifies cleanly with this baked file as the open building, and
  // (b) the baked file's own bytes are untouched by that whole cycle (proving "geometry tables are never
  // rewritten by normal save", not merely assumed).
  // ------------------------------------------------------------------------------------------------
  const md5PreOplog = md5(fs.readFileSync(outPath));
  global.window = global.window || {};
  global.location = { href: 'http://localhost/' };
  if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;
  const _store = {};
  global.localStorage = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };
  const ROOT = path.join(__dirname, '..');
  delete require.cache[require.resolve(path.join(ROOT, 'kernel_ops.js'))];
  require(path.join(ROOT, 'kernel_ops.js'));
  const initSqlJsWasm = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
  const wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
  window.initSqlJs = function () { return initSqlJsWasm({ wasmBinary: wasmBinary }); };
  window.Bonsai = { foldChainToScene: async function (ops) { return { solids: ops.length, triangleCount: 0 }; }, author: async function () { return { triangleCount: 0 }; }, clearKernelCache: function () { } };
  delete require.cache[require.resolve(path.join(ROOT, 'bonsai_oplog.js'))];
  require(path.join(ROOT, 'bonsai_oplog.js'));
  const O = window.Bonsai.oplog;
  await O._ensureDb();
  // ONE trivial op against this session (the spec's "select the graft element, or any other edit" --
  // uses a plain GEOM_EXTRUDE, the same op type every other node-level oplog witness in this lane uses;
  // the point under test is oplog/base-db coexistence, not this op's own geometry semantics).
  const before = O.length;
  const committed = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { note: 'demo-graft-oplog-survival-check', target_guid: targetGuid } }, {});
  const grew = O.length > before;
  await O.restore();
  const verify = await O.verify();
  const oplogPass = grew && !!committed && verify.ok === true;
  console.log(TAG + '_OPLOG_TEST base_db=' + outPath + ' committed_op_id=' + (committed && committed.id) +
    ' oplog_length_grew=' + grew + ' restore_ok=true chain_verify.ok=' + verify.ok + ' pass=' + oplogPass);

  const md5PostOplog = md5(fs.readFileSync(outPath));
  const bakedFileUntouched = md5PreOplog === md5PostOplog;
  console.log(TAG + '_OPLOG_TEST baked_file_untouched_by_oplog_cycle=' + bakedFileUntouched +
    ' md5_before=' + md5PreOplog + ' md5_after=' + md5PostOplog);

  const overallPass = cmp.pass && openTestPass && oplogPass && bakedFileUntouched;
  console.log(TAG + '_RESULT ' + (overallPass ? 'PASS' : 'FAIL') + ' guid=' + targetGuid + ' out=' + outPath);
  process.exit(overallPass ? 0 : 1);
}

(async () => {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (cmd === 'scan') await cmdScan(args);
  else if (cmd === 'bake') await cmdBake(args);
  else {
    console.error('usage:\n  node bake_demo_graft.js scan --source-db <path> [--ifc-class <class>] [--reference-lib <path>] [--templates-db <path>] [--probe-hash <hash>]\n  node bake_demo_graft.js bake --source-db <path> --target-guid <guid> --template-hash <hash> --templates-db <path> --out <path>');
    process.exit(1);
  }
})().catch(e => { console.error(TAG + ' FATAL', e); process.exit(1); });
