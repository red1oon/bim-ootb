#!/usr/bin/env node
/**
 * W-E2E-LAYERS-RESIDENTS — §LOD400-LAYERS reaches the live Modeller residents + §LAYER-GATE refusal
 * (bim-compiler RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §LOD400-ENVELOPE, Modeller half).
 *
 * ISSUE UNDER TEST: the Duplex party wall `2O2Fr$t4X7Zf8NOew3FNbT` is authored as 7 material layers
 * (Plasterboard 16 / Stud 41 / CMU 193 / Air 50 / CMU 193 / Stud 41 / Plasterboard 16 mm) but the
 * resident geo store shipped ONE 14-triangle envelope box presented as its real geometry — the exact
 * fallback the doctrine forbids. The fix ships (a) layer tables into Duplex_ARC.db via the
 * patches/Duplex_ARC.db.sql self-heal loader, (b) a rebuilt Duplex_geo.db whose multi-layer buffers
 * are per-layer slab compilations indexed by `component_geometry_layers`, and (c) a seed-time gate
 * (arc_editable.js §LAYER-GATE) that REFUSES any authored-multi-layer element still resolving an
 * envelope-only mesh.
 *
 * Exercises the REAL user path: the shipped Duplex_ARC.db bytes + the shipped patch SQL (same text
 * _applyPendingPatch feeds sql.js) + the geo file (live object-storage URL by default — the same
 * bytes a browser fetches; DUPLEX_GEO=<path> overrides for pre-upload local runs).
 *
 * Checks (each names what it proves):
 *   L1 party-slabs     — party wall hash resolves 124 tris (pre-fix envelope: 14 — a box cannot carry 5 slabs)
 *   L2 layer-index     — exactly 7 component_geometry_layers rows; SUM(thickness_m) == 0.550 m authored total
 *   L3 slab-extents    — per-slab thin-axis extents 16/41/193/50/193 mm (±1.5mm) + exactly 2 honest empty
 *                        rows (L5/L6 authored outside this element's own body — §LAYER-PARTIAL, never invented)
 *   L4 full-coverage   — the layer rows tile the whole buffer (Σ face_count == total tris): no un-indexed
 *                        envelope residue hiding behind the hash
 *   L5 all-resolve     — buildSeedOps(patched ARC, geo): 196 seeded ops (measured origin/main baseline,
 *                        unchanged), hardfail=0, layerRefused=0, gate ARMED (multiLayer=80,
 *                        layeredHashes=71), AND all 215 element_instances resolve (155/155 distinct
 *                        hashes present in the rebuilt geo) — the fix empties nothing
 *   L6 refusal-fires   — FALSIFICATION: delete the party hash's layer rows from a COPY → the SAME seed
 *                        refuses the party-wall guid with a §LAYER-ENVELOPE-REFUSE console.error and
 *                        drops exactly that op (proves the gate is live, not decorative)
 *   L7 unarmed-safe    — UNPATCHED ARC bytes + the same geo db: gate stays DISARMED, 196 ops, 0 refusals
 *                        (a resident whose layer tables never shipped — SampleCastle today — is untouched)
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
var GEO_URL = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/modeller/Duplex_geo.db?v=4';
var PARTY_GUID = '2O2Fr$t4X7Zf8NOew3FNbT';
var PARTY_GUID2 = '2O2Fr$t4X7Zf8NOew3FKRi';   // the sibling demising wall — same authored layer set

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
    console.log('═══ W-E2E-LAYERS-RESIDENTS — §LOD400-LAYERS layered walls reach the residents + §LAYER-GATE ═══');
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

    var hash = adb.exec("SELECT geometry_hash FROM element_instances WHERE guid='" + PARTY_GUID + "'")[0].values[0][0];
    var g = gdb.exec("SELECT length(faces)/12, length(vertices)/12 FROM component_geometries WHERE geometry_hash='" + hash + "'");
    var tris = g.length ? g[0].values[0][0] : -1;
    chk('L1 party-slabs', tris === 124, 'hash=' + hash + ' tris=' + tris + ' (pre-fix envelope: 14)');

    var rows = gdb.exec("SELECT layer_seq, material_name, thickness_m, face_start, face_count FROM component_geometry_layers WHERE geometry_hash='" + hash + "' ORDER BY layer_seq");
    var rv = rows.length ? rows[0].values : [];
    var sum = rv.reduce(function (a, r) { return a + r[2]; }, 0);
    chk('L2 layer-index', rv.length === 7 && Math.abs(sum - 0.550) < 1e-9,
      'rows=' + rv.length + ' Σthickness=' + sum.toFixed(3) + 'm (authored total 0.550)');

    // per-slab thin-axis extents from the actual buffer — the geometry, not just the index
    var vb = gdb.exec("SELECT vertices, faces FROM component_geometries WHERE geometry_hash='" + hash + "'")[0].values[0];
    var verts = new Float32Array(vb[0].buffer, vb[0].byteOffset, vb[0].byteLength / 4);
    var faces = new Uint32Array(vb[1].buffer, vb[1].byteOffset, vb[1].byteLength / 4);
    var expect = [16, 41, 193, 50, 193];   // mm, the 5 in-body slabs; L5/L6 authored-outside-body ⇒ empty
    var extOk = true, emptyN = 0, got = [];
    rv.forEach(function (r) {
      var fs0 = r[3], fc = r[4];
      if (fc === 0) { emptyN++; return; }
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
    chk('L3 slab-extents', extOk && got.length === 5 && emptyN === 2,
      'thin-extents [' + got.join(',') + ']mm vs authored [' + expect.join(',') + '] + ' + emptyN + ' honest empty rows');

    var totalFc = rv.reduce(function (a, r) { return a + r[4]; }, 0);
    chk('L4 full-coverage', totalFc === tris, 'Σface_count=' + totalFc + ' == buffer tris=' + tris + ' (no envelope residue)');

    // capture §LAYER-ENVELOPE-REFUSE console.error lines (the loud path is part of the contract)
    var errs = [];
    var origErr = console.error;
    console.error = function (m) { errs.push(String(m)); origErr.apply(console, arguments); };

    var built = ArcEditable.buildSeedOps(adb, gdb);
    console.error = origErr;
    // instance-level resolution over the WHOLE building (215 instances / 155 distinct hashes),
    // independent of the ARC-discipline seed subset (196 ops — measured origin/main baseline)
    var nInst = adb.exec("SELECT count(*) FROM element_instances WHERE geometry_hash IS NOT NULL")[0].values[0][0];
    var hashList = adb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0]
      .values.map(function (v) { return "'" + v[0] + "'"; });
    var nHave = gdb.exec("SELECT count(DISTINCT geometry_hash) FROM component_geometries WHERE geometry_hash IN (" +
      hashList.join(',') + ")")[0].values[0][0];
    chk('L5 all-resolve',
      built.ops.length === 196 && built.hardfail === 0 && built.layerRefused === 0 && built.skipped.length === 0 &&
      !!built.layerGate && built.layerGate.multiLayer === 80 && built.layerGate.layeredHashes === 71 &&
      nInst === 215 && nHave === hashList.length && hashList.length === 155,
      'ops=' + built.ops.length + ' hardfail=' + built.hardfail + ' layerRefused=' + built.layerRefused +
      ' gate=' + JSON.stringify(built.layerGate) + ' instances=' + nInst + ' hashesResolved=' + nHave + '/' + hashList.length);

    // L6 FALSIFICATION: strip ONE hash's layer rows from a COPY — the gate must fire for its guids
    var gdb2 = new SQL.Database(new Uint8Array(geoBuf));
    gdb2.run("DELETE FROM component_geometry_layers WHERE geometry_hash='" + hash + "'");
    errs = [];
    console.error = function (m) { errs.push(String(m)); origErr.apply(console, arguments); };
    var built2 = ArcEditable.buildSeedOps(adb, gdb2);
    console.error = origErr;
    var refusedGuids = built2.skipped.filter(function (s) { return s.reason === 'envelope-no-layers'; })
      .map(function (s) { return s.guid; });
    var loud = errs.filter(function (m) { return m.indexOf('§LAYER-ENVELOPE-REFUSE') >= 0; });
    chk('L6 refusal-fires',
      built2.layerRefused === 1 && refusedGuids.indexOf(PARTY_GUID) >= 0 &&
      loud.length === 1 && built2.ops.length === 196 - 1,
      'layerRefused=' + built2.layerRefused + ' guids=' + JSON.stringify(refusedGuids) +
      ' console.error lines=' + loud.length + ' ops=' + built2.ops.length +
      ' (sibling ' + PARTY_GUID2 + ' keeps its OWN hash+rows, still rendered: ' +
      (refusedGuids.indexOf(PARTY_GUID2) < 0) + ')');

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
