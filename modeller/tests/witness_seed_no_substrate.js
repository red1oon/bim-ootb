#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SEED-NO-SUBSTRATE: an ARC seed with NO geometry substrate draws NOTHING, never boxes.
 * Read the log after every run — exit code alone is not evidence.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (bim-compiler prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §WALK-LOD400-ONLY
 * "Next: ARC seed §GEO-SERVED-DEGRADED"; red1 2026-09-27: "no BBoxes or cubes, or LOD200 fallback. All must be LOD400 or
 * fail hard"). When a building's _geo.db fetch fails, or a local file carries no mesh tables, arc_editable.buildSeedOps
 * found no geometry table and seeded EVERY element as its measured bounding box — the whole building drawn as boxes,
 * only a console.error saying so. This proves the seed now refuses instead.
 *
 *   N0 NON-VACUOUS — the REAL SampleHouse db (with its mesh tables) seeds every element from a real mesh:
 *                    ops == realResolved > 0, hardfail 0, noSubstrate 0.
 *   N1 REFUSE      — the SAME db with its geometry tables dropped: 0 element ops, every one of those elements skipped
 *                    'no-geometry-substrate', noSubstrate == N0's op count, and the §GEOM-HARDFAIL NO-substrate line logged.
 *   N2 NO-BOX      — folding what N1 seeded produces zero 8-vertex/12-triangle box solids (there is nothing to fold).
 *
 * RED-first: MODELLER_ROOT=<a checkout of origin/main>/modeller node witness_seed_no_substrate.js — main seeds N0's
 * count of box ops in N1 and fails N1/N2.
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }

var errs = [], _err = console.error;
console.error = function () { var m = Array.prototype.join.call(arguments, ' '); errs.push(m); _err.apply(console, arguments); };

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-SEED-NO-SUBSTRATE — ARC seed without a geometry substrate (node, REAL SampleHouse) root=' + ROOT + ' ═══');
  async function seed(db, tag) {
    var oplog = new SQL.Database(); KernelOps.ensureTable(oplog);
    var r = await ArcEditable.seedArc(db, { building: tag,
      registerGeometry: function (a) { Library.registerRealGeometry(a); },
      commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); } });
    return r;
  }
  // fresh Uint8Array per db — two sql.js Databases on one buffer share storage (MODELLER_MASTER §NEW TRAPS)
  var full = new SQL.Database(new Uint8Array(fs.readFileSync(DBPATH)));
  var A = await seed(full, 'SampleHouse');
  var nA = A.ops.filter(function (o) { return !(o.params && o.params.anchorOnly); }).length;
  console.log('  §NOSUB full ops=' + nA + ' realResolved=' + A.realResolved + ' hardfail=' + A.hardfail + ' noSubstrate=' + A.noSubstrate);
  chk('N0 NON-VACUOUS (real SampleHouse seeds every element from a real mesh: ops == realResolved > 0, hardfail 0)',
    nA > 0 && A.realResolved === nA && A.hardfail === 0 && !A.noSubstrate, 'ops=' + nA + ' realResolved=' + A.realResolved + ' hardfail=' + A.hardfail);

  var bare = new SQL.Database(new Uint8Array(fs.readFileSync(DBPATH)));
  var dropped = [];
  ['base_geometries', 'component_geometries', 'component_geometry_layers'].forEach(function (t) {
    if (bare.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length) { bare.run('DROP TABLE ' + t); dropped.push(t); }
  });
  var e0 = errs.length;
  var B = await seed(bare, 'SampleHouse-bare');
  var nB = B.ops.filter(function (o) { return !(o.params && o.params.anchorOnly); }).length;
  var bareBuilt = ArcEditable.buildSeedOps(new SQL.Database(bare.export()));
  var reasons = {}; bareBuilt.skipped.forEach(function (s) { reasons[s.reason] = (reasons[s.reason] || 0) + 1; });
  var line = errs.slice(e0).filter(function (m) { return /§GEOM-HARDFAIL building=SampleHouse-bare NO geometry substrate/.test(m); })[0] || '';
  console.log('  §NOSUB bare dropped=' + dropped.join(',') + ' ops=' + nB + ' noSubstrate=' + B.noSubstrate + ' skipped=' + JSON.stringify(reasons));
  chk('N1 REFUSE (geometry tables dropped: 0 element ops, every element skipped no-geometry-substrate, loud §GEOM-HARDFAIL)',
    dropped.length > 0 && nB === 0 && B.noSubstrate === nA && reasons['no-geometry-substrate'] === nA && !!line,
    'dropped=' + dropped.length + ' ops=' + nB + ' noSubstrate=' + B.noSubstrate + '/' + nA + ' log="' + line.slice(0, 80) + '"');

  var boxes = 0;
  B.ops.forEach(function (op, i) {
    if (op.params && op.params.anchorOnly) return;
    try { var d = Library.foldInsert({ id: 1000 + i, op_type: 'GEOM_INSERT', parameters: op.params });
      if (d && d.positions.length / 3 === 8 && d.indices.length / 3 === 12) boxes++; } catch (e) { }
  });
  chk('N2 NO-BOX (nothing N1 seeded folds to an 8-vertex/12-triangle box)', boxes === 0 && nB === 0, 'boxes=' + boxes + ' of ' + nB + ' ops');

  console.log('W-SEED-NO-SUBSTRATE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
