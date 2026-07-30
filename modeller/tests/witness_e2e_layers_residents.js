#!/usr/bin/env node
/**
 * W-E2E-LAYERS-RESIDENTS — §LOD400-LAYERS reaches the live Modeller residents + §LAYER-GATE refusal
 * (bim-compiler RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §LOD400-ENVELOPE, Modeller half; updated for
 * ROW 33, 2026-07-31: an empty layer slab is a REFUSAL, not a row).
 *
 * ISSUE UNDER TEST: the Duplex party walls are authored as 7 material layers (Plasterboard 16 /
 * Stud 41 / CMU 193 / Air 50 / CMU 193 / Stud 41 / Plasterboard 16 mm). Two of the four
 * (`2O2Fr$t4X7Zf8NOew3FNbT`, `2O2Fr$t4X7Zf8NOew3FKRi`) are trimmed in the SOURCE by an authored
 * IfcPolygonalBoundedHalfSpace at the layer-4/5 boundary (Revit unit-demising — the neighbour-side
 * stud+plasterboard belong to the neighbour wall's body; ZERO openings involved, measured
 * 2026-07-30). The first ship compiled those two as 5 slabs + 2 face_count=0 index rows — a partial
 * ship whose witness sums were blind by construction (Watchdog, MODELLER_MASTER row 33). Under the
 * row-33 directive the partial ship is withdrawn: the two trimmed walls revert to their original
 * envelope buffers with NO layer rows, and the armed §LAYER-GATE refuses them LOUDLY on seed — the
 * "honestly RED" end-state on the surface the user sees. The layered proof moves to the full-span
 * party wall `2O2Fr$t4X7Zf8NOew3FKRH` (7 real slabs, every row face_count>0).
 *
 * Exercises the REAL user path: the shipped Duplex_ARC.db bytes + the shipped patch SQL (same text
 * _applyPendingPatch feeds sql.js) + the geo file (live object-storage URL by default — the same
 * bytes a browser fetches; DUPLEX_GEO=<path> overrides for pre-upload local runs).
 *
 * Checks (each names what it proves):
 *   L1 trimmed-envelope — trimmed wall's hash resolves its ORIGINAL 14-tri envelope again with ZERO
 *                         layer rows (partial-ship 124-tri buffer + 7 rows is GONE)
 *   L2 layer-index      — full-span exemplar resolves exactly 7 rows; SUM(thickness_m) == 0.550 m
 *   L3 slab-extents     — exemplar per-slab thin-axis extents 16/41/193/50/193/41/16 mm (±1.5mm),
 *                         ALL SEVEN real — no empty rows
 *   L4 full-coverage    — exemplar rows tile its whole buffer; AND store-wide 0 rows with
 *                         face_count<=0 (row 33: an empty slab is a refusal, not a row)
 *   L5 refusal-live     — buildSeedOps(patched ARC, geo): the 2 trimmed walls are REFUSED BY NAME
 *                         with 2 loud §LAYER-ENVELOPE-REFUSE console.error lines; ops 196→194;
 *                         hardfail=0; gate ARMED (multiLayer=80, layeredHashes=69); all 215
 *                         instances / 155 hashes still resolve — nothing else lost
 *   L6 refusal-fires    — FALSIFICATION: delete the EXEMPLAR's layer rows from a COPY → the SAME
 *                         seed refuses it too (layerRefused=3, ops=193) — the gate is live per-hash,
 *                         not hardcoded to the two known walls
 *   L7 unarmed-safe     — UNPATCHED ARC bytes + the same geo db: gate stays DISARMED, 196 ops,
 *                         0 refusals (a resident whose layer tables never shipped is untouched)
 */
'use strict';
var fs = require('fs'), path = require('path'), https = require('https');

global.window = global.window || {};
global.fetch = undefined;
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));

var ARC_PATH = path.join(ROOT, 'Duplex_ARC.db');
var PATCH_PATH = path.join(ROOT, 'patches', 'Duplex_ARC.db.sql');
var GEO_URL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/modeller/Duplex_geo.db?v=5';
var TRIMMED_GUID = '2O2Fr$t4X7Zf8NOew3FNbT';   // clip-trimmed demising wall — refused (row 33)
var TRIMMED_GUID2 = '2O2Fr$t4X7Zf8NOew3FKRi';  // its sibling — same authored set, same trim, refused
var EXEMPLAR_GUID = '2O2Fr$t4X7Zf8NOew3FKRH';  // full-span 7-layer party wall — the layered proof

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

function fetchGeo() {
  if (process.env.DUPLEX_GEO) {
    console.log('  §GEO-SRC local override ' + process.env.DUPLEX_GEO);
    return Promise.resolve(fs.readFileSync(process.env.DUPLEX_GEO));
  }
  console.log('  §GEO-SRC live ' + GEO_URL);
  return new Promise(function (resolve, reject) {
    https.get(GEO_URL, function (res) {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      var bufs = [];
      res.on('data', function (d) { bufs.push(d); });
      res.on('end', function () { resolve(Buffer.concat(bufs)); });
    }).on('error', reject);
  });
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  return fetchGeo().then(function (geoBuf) {
    console.log('═══ W-E2E-LAYERS-RESIDENTS — layered walls + §LAYER-GATE, row-33 refusal posture ═══');
    // §PRIME LESSON (GEO-SERVED): a 200 is not evidence — assert the bytes ARE a SQLite db
    var magic = geoBuf.slice(0, 16).toString('utf8');
    chk('L0 geo-bytes-real', magic.indexOf('SQLite format 3') === 0,
      'first bytes "' + magic.replace(/\0.*$/, '') + '" (' + (geoBuf.length / 1024 / 1024).toFixed(2) + 'MB)');

    var rawArc = fs.readFileSync(ARC_PATH);
    var patchSql = fs.readFileSync(PATCH_PATH, 'utf8');

    // the REAL loader path: patch applied to the RAW shipped bytes (str_walker_outliner._applyPendingPatch)
    var adb = new SQL.Database(new Uint8Array(rawArc));
    adb.run(patchSql);
    var gdb = new SQL.Database(new Uint8Array(geoBuf));

    // L1: the trimmed wall is an ENVELOPE again — its partial layered ship is withdrawn
    var tHash = adb.exec("SELECT geometry_hash FROM element_instances WHERE guid='" + TRIMMED_GUID + "'")[0].values[0][0];
    var g = gdb.exec("SELECT length(faces)/12 FROM component_geometries WHERE geometry_hash='" + tHash + "'");
    var tTris = g.length ? g[0].values[0][0] : -1;
    var tRowsQ = gdb.exec("SELECT count(*) FROM component_geometry_layers WHERE geometry_hash='" + tHash + "'");
    var tRows = tRowsQ.length ? tRowsQ[0].values[0][0] : -1;
    chk('L1 trimmed-envelope', tTris === 14 && tRows === 0,
      'hash=' + tHash + ' tris=' + tTris + ' (original envelope; partial ship was 124) layerRows=' + tRows);

    // L2: the full-span exemplar carries the real 7-slab compile
    var hash = adb.exec("SELECT geometry_hash FROM element_instances WHERE guid='" + EXEMPLAR_GUID + "'")[0].values[0][0];
    var rows = gdb.exec("SELECT layer_seq, material_name, thickness_m, face_start, face_count FROM component_geometry_layers WHERE geometry_hash='" + hash + "' ORDER BY layer_seq");
    var rv = rows.length ? rows[0].values : [];
    var sum = rv.reduce(function (a, r) { return a + r[2]; }, 0);
    chk('L2 layer-index', rv.length === 7 && Math.abs(sum - 0.550) < 1e-9,
      'exemplar hash=' + hash + ' rows=' + rv.length + ' Σthickness=' + sum.toFixed(3) + 'm (authored total 0.550)');

    // L3: per-slab thin-axis extents from the actual buffer — all SEVEN slabs real
    var vb = gdb.exec("SELECT vertices, faces, length(faces)/12 FROM component_geometries WHERE geometry_hash='" + hash + "'")[0].values[0];
    var verts = new Float32Array(vb[0].buffer, vb[0].byteOffset, vb[0].byteLength / 4);
    var faces = new Uint32Array(vb[1].buffer, vb[1].byteOffset, vb[1].byteLength / 4);
    var tris = vb[2];
    var expect = [16, 41, 193, 50, 193, 41, 16];   // mm — the full authored set, no empties allowed
    var extOk = true, emptyN = 0, got = [];
    rv.forEach(function (r) {
      var fs0 = r[3], fc = r[4];
      if (!fc) { emptyN++; return; }
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var i = fs0 * 3; i < (fs0 + fc) * 3; i++) {
        var vi = faces[i] * 3;
        for (var k = 0; k < 3; k++) {
          var c = verts[vi + k];
          if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c;
        }
      }
      var thin = Math.min(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1000;
      got.push(thin.toFixed(1));
      if (Math.abs(thin - expect[got.length - 1]) > 1.5) extOk = false;
    });
    chk('L3 slab-extents', extOk && got.length === 7 && emptyN === 0,
      'thin-extents [' + got.join(',') + ']mm vs authored [' + expect.join(',') + '], empty rows=' + emptyN);

    // L4: exemplar tiles its buffer + ROW 33 store-wide: no face_count<=0 row anywhere
    var totalFc = rv.reduce(function (a, r) { return a + r[4]; }, 0);
    var nEmptyAll = gdb.exec("SELECT count(*) FROM component_geometry_layers WHERE face_count<=0 OR face_count IS NULL")[0].values[0][0];
    chk('L4 full-coverage', totalFc === tris && nEmptyAll === 0,
      'Σface_count=' + totalFc + ' == exemplar tris=' + tris + '; store-wide empty rows=' + nEmptyAll +
      ' (an empty slab is a refusal, not a row)');

    // L5: the armed gate refuses BOTH trimmed walls loudly on the real seed path
    var errs = [];
    var origErr = console.error;
    console.error = function (m) { errs.push(String(m)); origErr.apply(console, arguments); };
    var built = ArcEditable.buildSeedOps(adb, gdb);
    console.error = origErr;
    var refused = built.skipped.filter(function (s) { return s.reason === 'envelope-no-layers'; })
      .map(function (s) { return s.guid; });
    var loud = errs.filter(function (m) { return m.indexOf('§LAYER-ENVELOPE-REFUSE') >= 0; });
    var nInst = adb.exec("SELECT count(*) FROM element_instances WHERE geometry_hash IS NOT NULL")[0].values[0][0];
    var hashList = adb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0]
      .values.map(function (v) { return "'" + v[0] + "'"; });
    var nHave = gdb.exec("SELECT count(DISTINCT geometry_hash) FROM component_geometries WHERE geometry_hash IN (" +
      hashList.join(',') + ")")[0].values[0][0];
    chk('L5 refusal-live',
      built.layerRefused === 2 && refused.indexOf(TRIMMED_GUID) >= 0 && refused.indexOf(TRIMMED_GUID2) >= 0 &&
      loud.length === 2 && built.ops.length === 194 && built.hardfail === 0 &&
      !!built.layerGate && built.layerGate.multiLayer === 80 && built.layerGate.layeredHashes === 69 &&
      nInst === 215 && nHave === hashList.length && hashList.length === 155,
      'layerRefused=' + built.layerRefused + ' guids=' + JSON.stringify(refused) +
      ' console.error lines=' + loud.length + ' ops=' + built.ops.length + ' (was 196 pre-row-33)' +
      ' gate=' + JSON.stringify(built.layerGate) + ' instances=' + nInst +
      ' hashesResolved=' + nHave + '/' + hashList.length);

    // L6 FALSIFICATION: strip the EXEMPLAR's rows from a COPY — the gate must fire for it too
    var gdb2 = new SQL.Database(new Uint8Array(geoBuf));
    gdb2.run("DELETE FROM component_geometry_layers WHERE geometry_hash='" + hash + "'");
    errs = [];
    console.error = function (m) { errs.push(String(m)); origErr.apply(console, arguments); };
    var built2 = ArcEditable.buildSeedOps(adb, gdb2);
    console.error = origErr;
    var refused2 = built2.skipped.filter(function (s) { return s.reason === 'envelope-no-layers'; })
      .map(function (s) { return s.guid; });
    var loud2 = errs.filter(function (m) { return m.indexOf('§LAYER-ENVELOPE-REFUSE') >= 0; });
    chk('L6 refusal-fires',
      built2.layerRefused === 3 && refused2.indexOf(EXEMPLAR_GUID) >= 0 &&
      loud2.length === 3 && built2.ops.length === 193,
      'layerRefused=' + built2.layerRefused + ' guids=' + JSON.stringify(refused2) +
      ' console.error lines=' + loud2.length + ' ops=' + built2.ops.length +
      ' (gate live per-hash, not hardcoded to the trimmed pair)');

    // L7 unarmed: the UNPATCHED shipped bytes (no rel_material_layer_set) — zero new code paths
    var adb0 = new SQL.Database(new Uint8Array(rawArc));
    var built0 = ArcEditable.buildSeedOps(adb0, gdb);
    chk('L7 unarmed-safe',
      built0.layerGate == null && built0.layerRefused === 0 && built0.ops.length === 196 && built0.hardfail === 0,
      'gate=' + JSON.stringify(built0.layerGate) + ' ops=' + built0.ops.length +
      ' (a resident without shipped layer tables is untouched)');

    console.log('\nW-E2E-LAYERS-RESIDENTS RESULT: ' + pass + ' PASS, ' + fail + ' FAIL');
    process.exit(fail ? 1 : 0);
  });
}).catch(function (e) {
  console.error('WITNESS ERROR: ' + (e && e.stack || e));
  process.exit(1);
});
