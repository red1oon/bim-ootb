#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HALLWAY-BACKBONE scope (READ THE LOG after every run)
 * SCOPE: common/hallway_backbone.js exercised against the REAL Clinic building — same building
 * §HALLWAY-BACKBONE's scratch-script investigation (bim-compiler
 * prompts/FUNCTIONAL_SPACE_MGMT_NEXT_SESSION.md) verified the algorithm on before that code was
 * deleted per housekeeping. This is a REBUILD, not a byte-for-byte port (the scratch code is gone) —
 * numbers here are freshly measured against real data, not asserted to match the old scratch run's
 * exact counts.
 * DB: full merged extraction (all disciplines), NOT the ARC-only modeller/Clinic_ARC.db — the
 * trusted stair extractor (room_graph.js getStairGroups) needs the STR-tagged "Monolithic Concrete
 * Stair" that Clinic's ARC-only extract omits (verified 2026-07-14: Clinic_ARC.db has 6 stairflight
 * rows / 3 physical stairs; the full extracted.db has 8 rows / 4 physical stairs — the real,
 * trusted count, matching Building Parts Taxonomy's live-shipped answer).
 * RUN: node witness_hallway_backbone.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const HallwayBackbone = require('../hallway_backbone.js');
const RoomGraph = require('../room_graph.js');

const DB_PATH = '/home/red1/bim-ootb/buildings/Clinic_extracted.db';
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

console.log('§W-HALLWAY-BACKBONE building=' + DB_PATH);
const db = new Database(DB_PATH, { readonly: true });
function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }

// ── Independent ground truth: stair count, re-derived directly (not via the module) ──
const stairFlightRows = dbQuery("SELECT m.element_name FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
  "WHERE (m.ifc_class LIKE 'IfcStairFlight%' OR m.ifc_class LIKE 'IfcRampFlight%') AND t.center_z IS NOT NULL");
const RUN_SUFFIX_RE = /\s+Run\s+\d+$/, INDEX_SUFFIX_RE = /:\d+$/;
function baseKey(n) { n = String(n || ''); return RUN_SUFFIX_RE.test(n) ? n.replace(RUN_SUFFIX_RE, '') : n.replace(INDEX_SUFFIX_RE, ''); }
const gtGroups = new Set(stairFlightRows.map(r => baseKey(r[0])));
const gtStairs = [...gtGroups].filter(k => /Stair/i.test(k));
const gtRamps = [...gtGroups].filter(k => /Ramp/i.test(k));
console.log('§GROUND-TRUTH flight_rows=' + stairFlightRows.length + ' stair_groups=' + gtStairs.length + ' ramp_groups=' + gtRamps.length);
chk('G0 real stair count matches trusted Building Parts Taxonomy ground truth (4)', gtStairs.length === 4, 'stairs=' + gtStairs.length);

// ── getStairGroups() reused correctly ──
const sg = RoomGraph.getStairGroups(dbQuery, () => {});
const sgStairs = sg.order.filter(k => /Stair/i.test(k));
chk('G1 RoomGraph.getStairGroups() (the reused trusted extractor) also yields 4 stairs', sgStairs.length === 4, 'stairs=' + sgStairs.length);
sgStairs.forEach(k => { const g = sg.groups[k]; console.log('    stair "' + k + '" footprint x=[' + g.xlo.toFixed(1) + ',' + g.xhi.toFixed(1) + '] y=[' + g.ylo.toFixed(1) + ',' + g.yhi.toFixed(1) + '] z=[' + g.zlo.toFixed(1) + ',' + g.zhi.toFixed(1) + ']'); });

// ── Full backbone build ──
const t0 = Date.now();
const result = HallwayBackbone.buildBackbone(dbQuery, { log: (m) => console.log('  ' + m) });
console.log('§TIMING buildBackbone took ' + (Date.now() - t0) + 'ms');

chk('G2 doors and walls were actually read (non-zero)', result.stats.doors > 0 && result.stats.walls > 0,
  'doors=' + result.stats.doors + ' walls=' + result.stats.walls);
chk('G3 at least one hallway-candidate bucket joined (>=3 aligned doors)', result.stats.joined > 0, 'joined=' + result.stats.joined);
chk('G4 at least one backbone chain formed', result.stats.chains > 0, 'chains=' + result.stats.chains);

// ── Real-data spot check: the biggest chain should span many real doors, not a handful ──
const chainsBySize = result.chains.slice().sort((a, b) => {
  const da = a.buckets.reduce((s, bk) => s + bk.doors.length, 0);
  const db_ = b.buckets.reduce((s, bk) => s + bk.doors.length, 0);
  return db_ - da;
});
if (chainsBySize.length) {
  const big = chainsBySize[0];
  const doorTouches = big.buckets.reduce((s, bk) => s + bk.doors.length, 0);
  console.log('§BIGGEST_CHAIN storey=' + big.storey + ' buckets=' + big.buckets.length + ' doorTouches=' + doorTouches +
    ' crossings=' + big.crossings.length);
  chk('G5 biggest chain plausibly a real multi-segment corridor (>=3 buckets, >=15 door touches)',
    big.buckets.length >= 3 && doorTouches >= 15, 'buckets=' + big.buckets.length + ' doorTouches=' + doorTouches);
  chk('G6 chain ordering is crossing-backed, not invented (>=1 real crossing for a multi-bucket chain)',
    big.buckets.length === 1 || big.crossings.length >= big.buckets.length - 1,
    'buckets=' + big.buckets.length + ' crossings=' + big.crossings.length);
}

// ── Stair-termination: how many open ends now resolve to a real trusted stair ──
console.log('§STAIR_TERMINATION openEnds=' + result.stats.openEnds + ' stairTerminated=' + result.stats.stairTerminated +
  ' (' + (result.stats.openEnds ? (100 * result.stats.stairTerminated / result.stats.openEnds).toFixed(0) : 0) + '%)');

console.log('\n§W-HALLWAY-BACKBONE DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
