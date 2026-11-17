#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MOD-PARTS: the Modeller's ARC seed draws an element's PARTS instead of its body, and draws non-ARC parts.
 * Spec: prompts/DXF2BIM_MODELLER_LANE.md §S-G2 fix. Read the log after every run (§MOD_PARTS_VIEW, §P*) — exit code alone is not evidence.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the Modeller draws a host and its parts overlapping (a wall AND its layer pieces), and draws none of the
 * parts whose discipline is not ARC (connection plates/bolts, rebar, gusset)". Cause: arc_editable.buildSeedOps seeded `discipline='ARC'` only and
 * never read element_parts.
 *
 * Fixture = the repo's REAL SampleHouse_extracted.db (39 ARC rows, real meshes) with element_parts / discipline / transform_source set in a COPY:
 *   P0 NON-VACUOUS  the unmodified DB seeds N ops (the baseline) and no §MOD_PARTS_VIEW line.
 *   P1 HOSTS        2 hosts with present parts are NOT seeded; a host whose only child is missing (orphan) IS still seeded.
 *   P2 PARTS        every element_parts child (relabelled STR = non-ARC) AND the `generated:` row (not a child) is seeded, with a real mesh.
 *   P3 RESIDENTS    unrelated ARC rows stay seeded, an unrelated non-ARC row stays NOT seeded (existing-resident behaviour), nothing else changes.
 *   P4 NO-TABLE     the unmodified DB's seeded guid list equals the discipline filter's (zero new code path).
 *   P5 VACUOUS      element_parts whose every child is missing -> `§MOD_PARTS_VIEW VACUOUS`, seed == P0.
 *   P6 REAL         if $PARTS_REAL_DB: prints {LY,CR,RB,GU,layerHostsAlsoSeededWhole} on it; expects {220,150,306,3,0} when it is the layer-split film DB
 *                   (else INCONCLUSIVE with the measured counts; never PASS on an empty population).
 * Break switch MOD_PARTS_BREAK=1: the witness removes element_parts and the `generated:` markers before seeding (= the old ARC-only filter), so
 * P1/P2/P6 must FAIL. RED-first alternative: MODELLER_ROOT=<origin/main export>/modeller.
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var BREAK = !!process.env.MOD_PARTS_BREAK;
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0, inconclusive = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  §PASS ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  §FAIL ' + n + (e ? '  ' + e : '')); } }
var logs = [], _log = console.log;
console.log = function () { var m = Array.prototype.join.call(arguments, ' '); logs.push(m); _log.apply(console, arguments); };

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-MOD-PARTS — Modeller seed of element parts (node, REAL SampleHouse fixture) root=' + ROOT + ' break=' + BREAK + ' ═══');
  async function seed(db, tag) {
    var oplog = new SQL.Database(); KernelOps.ensureTable(oplog);
    logs.length = 0;
    var r = await ArcEditable.seedArc(db, { building: tag,
      registerGeometry: function (a) { Library.registerRealGeometry(a); },
      commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); } });
    var guids = r.ops.filter(function (o) { return !(o.params && o.params.anchorOnly); }).map(function (o) { return o.outputGuid; });
    var line = logs.filter(function (l) { return /§MOD_PARTS_VIEW/.test(l); })[0] || null;
    return { r: r, guids: guids, set: new Set(guids), line: line };
  }
  function fresh() { return new SQL.Database(new Uint8Array(fs.readFileSync(DBPATH))); }
  function q(db, sql) { var x = db.exec(sql); return x.length ? x[0].values : []; }
  function breakIt(db) { if (!BREAK) return; try { db.run('DROP TABLE IF EXISTS element_parts'); db.run("UPDATE element_transforms SET transform_source=NULL WHERE transform_source LIKE 'generated:%'"); } catch (e) { } }

  // P0 baseline
  var B = await seed(fresh(), 'base');
  var all = q(fresh(), "SELECT guid FROM elements_meta m WHERE discipline='ARC' AND guid IN (SELECT guid FROM element_transforms)").map(function (v) { return v[0]; });
  chk('P0 NON-VACUOUS (unmodified SampleHouse seeds ops, no §MOD_PARTS_VIEW line)', B.guids.length > 10 && !B.line, 'ops=' + B.guids.length + ' line=' + B.line);
  var g = B.guids;   // seeded ARC guids in order

  // P4 no table: guid list == discipline filter (the ARC rows with a transform that did not skip)
  chk('P4 NO-TABLE (no element_parts / no marker -> seeded guids are ARC rows only, as before)',
    g.every(function (x) { return all.indexOf(x) >= 0; }) && !B.line, 'seeded=' + g.length + ' arcRows=' + all.length);

  // fixture
  var H1 = g[0], H2 = g[1], C1 = g[2], C2 = g[3], C3 = g[4], C4 = g[5], GEN = g[6], U1 = g[7], U2 = g[8], H3 = g[9];
  var db = fresh();
  [C1, C2, C3, GEN, U2].forEach(function (x) { db.run("UPDATE elements_meta SET discipline='STR' WHERE guid=?", [x]); });
  db.run('CREATE TABLE element_parts (parent_guid TEXT, child_guid TEXT, parent_class TEXT, child_class TEXT, PRIMARY KEY (parent_guid, child_guid))');
  [[H1, C1], [H1, C2], [H2, C3], [H2, C4], [H3, 'MISSING-CHILD-GUID']].forEach(function (p) { db.run('INSERT INTO element_parts VALUES (?,?,?,?)', [p[0], p[1], 'X', 'Y']); });
  db.run("UPDATE element_transforms SET transform_source='generated:test-rules' WHERE guid=?", [GEN]);
  breakIt(db);
  var F = await seed(db, 'fixture');
  console.log('  §P_FIXTURE hosts=' + [H1, H2] + ' parts(STR)=' + [C1, C2, C3] + ' arcPart=' + C4 + ' generated=' + GEN + ' orphanHost=' + H3);
  chk('P1 HOSTS (2 hosts with present parts not seeded; orphan-link host still seeded)',
    !F.set.has(H1) && !F.set.has(H2) && F.set.has(H3), 'H1=' + F.set.has(H1) + ' H2=' + F.set.has(H2) + ' orphanHost=' + F.set.has(H3));
  chk('P2 PARTS (3 STR children + 1 ARC child + the generated row all seeded)',
    [C1, C2, C3, C4, GEN].every(function (x) { return F.set.has(x); }), [C1, C2, C3, C4, GEN].map(function (x) { return F.set.has(x); }).join(','));
  var want = new Set(g.filter(function (x) { return x !== H1 && x !== H2 && x !== U2; }));
  var extra = F.guids.filter(function (x) { return !want.has(x); }), missing = Array.from(want).filter(function (x) { return !F.set.has(x); });
  chk('P3 RESIDENTS (seeded == baseline - 2 hosts, plus the relabelled parts; unrelated ARC kept, unrelated non-ARC not seeded)',
    F.set.has(U1) && !F.set.has(U2) && !extra.length && !missing.length, 'extra=' + extra.length + ' missing=' + missing.length + ' U1=' + F.set.has(U1) + ' U2(STR)=' + F.set.has(U2));
  chk('P3b LOG (§MOD_PARTS_VIEW hosts=2 hostsHidden=2: the orphan-link host is not counted)',
    !!F.line && /hosts=2 hostsHidden=2 /.test(F.line), F.line);

  // P5 vacuous
  var dv = fresh();
  dv.run('CREATE TABLE element_parts (parent_guid TEXT, child_guid TEXT, parent_class TEXT, child_class TEXT, PRIMARY KEY (parent_guid, child_guid))');
  dv.run("INSERT INTO element_parts VALUES (?, 'NOPE', 'X', 'Y')", [H1]);
  var V = await seed(dv, 'vacuous');
  chk('P5 VACUOUS (every child missing: VACUOUS line, seed == baseline)', !!V.line && /VACUOUS/.test(V.line) && V.guids.join() === B.guids.join(), V.line);

  // P6 real
  if (process.env.PARTS_REAL_DB) {
    var rdb = new SQL.Database(new Uint8Array(fs.readFileSync(process.env.PARTS_REAL_DB)));
    var layerHosts = new Set(q(rdb, "SELECT parent_guid FROM element_parts WHERE child_guid LIKE 'GEN-LY-%'").map(function (v) { return v[0]; }));   // read BEFORE the break switch drops the table
    breakIt(rdb);
    var R = await seed(rdb, 'real');
    var cnt = { LY: 0, CR: 0, RB: 0, GU: 0 };
    R.guids.forEach(function (x) { var m = /^GEN-(LY|CR|RB|GU)-/.exec(x); if (m) cnt[m[1]]++; });
    var both = 0; layerHosts.forEach(function (h) { if (R.set.has(h)) both++; });
    var out = { LY: cnt.LY, CR: cnt.CR, RB: cnt.RB, GU: cnt.GU, layerHostsAlsoSeededWhole: both, layerHosts: layerHosts.size, total: R.guids.length };
    console.log('  §G2_SEEDED ' + JSON.stringify(out) + ' | ' + (R.line || 'no §MOD_PARTS_VIEW line'));
    if (!layerHosts.size && !cnt.CR && !cnt.RB && !cnt.GU) { inconclusive++; console.log('  §INCONCLUSIVE P6 REAL (no GEN-* parts in this DB: nothing judged)'); }
    else chk('P6 REAL ({LY:220,CR:150,RB:306,GU:3,layerHostsAlsoSeededWhole:0})', out.LY === 220 && out.CR === 150 && out.RB === 306 && out.GU === 3 && out.layerHostsAlsoSeededWhole === 0, JSON.stringify(out));
  } else { inconclusive++; console.log('  §INCONCLUSIVE P6 REAL ($PARTS_REAL_DB not set)'); }

  console.log('═══ W-MOD-PARTS ' + (fail ? 'FAIL' : (pass ? 'PASS' : 'INCONCLUSIVE')) + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive + ' ═══');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('§FAIL harness ' + (e && e.stack || e)); process.exit(2); });
