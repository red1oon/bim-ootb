#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HOSPITAL-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §22-§24 — unlike HHS (PR #802)
 * and JKR (PR #803), Hospital's walkable raster does NOT reduce its DETOUR_FAIL rate, and this is
 * an intentional, understood, PERMANENT state, not a bug still to be fixed. Two real build-script
 * bugs were found and fixed along the way (missing corridorRectsByStorey union; missing
 * DOOR_BUFFER_SLACK/CORRIDOR_RECT_SLACK parity with _pointWalkable()'s fallback) which took
 * Hospital's raster from a REGRESSION (39.6%->44.1%) to a dead-even TIE with the no-raster
 * baseline (still 39.6%) - proven via exact pair-level identity, not just a matching percentage
 * (the SAME 1197/3023 sampled pairs fail before and after, zero pairs flipped either direction).
 * Root cause: even Hospital's Level 1 §PATH_LEGAL_DETOUR_FAIL log shows "no legal detour among 128
 * doors" - plenty of real candidate waypoints exist, but Hospital's real floor-evidence coverage is
 * still only 20-40% per storey even after both fixes (vs Clinic's ~65-75%), so almost any
 * cross-floor chord between two arbitrary doors crosses at least one uncovered patch somewhere
 * along its length. This is the SAME already-tracked corridor-coverage gap as
 * witness_hospital_corridor_baseline.js (17.8% join ratio vs Clinic/HHS's ~45%) - a real geometry-
 * recognition gap in hallway_backbone.js, not something a walkable-raster fix can touch. Ships
 * Hospital's raster anyway (most-accurate available walkable-floor ground truth, valuable for this
 * spec's own VISUAL rendering purpose independent of pathfinding), but this witness's whole point
 * is to stop a future session from re-attempting "make Hospital's raster better" as if it were an
 * open bug - it is not, until hallway_backbone.js's corridor-join gap for Hospital closes further.
 * RUN: node witness_hospital_walkable_raster.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const RAW_DB = '/home/red1/bim-ootb/buildings/Hospital_extracted.db';
const PATCH = require('path').join(__dirname, 'viewer/buildings/patches/Hospital_extracted.db.sql');
const MAX_PAIRS = 3000;

function loadCopy(sqlSlices) {
  const tmp = '/tmp/_witness_hospital_raster_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(RAW_DB, tmp);
  const db = new Database(tmp);
  sqlSlices.forEach(s => db.exec(s));
  return db;
}

function sweepDetourFail(db) {
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const rooms = graph.nodes.filter(n => n.kind === 'room');
  const allPairs = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) allPairs.push([i, j]);
  const step = Math.max(1, Math.floor(allPairs.length / MAX_PAIRS));
  const sample = allPairs.filter((_, idx) => idx % step === 0);
  const failSet = new Set();
  let detourFailHits = 0;
  const realLog = console.log.bind(console);
  console.log = (m) => { if (typeof m === 'string' && m.indexOf('§PATH_LEGAL_DETOUR_FAIL') === 0) detourFailHits++; };
  for (const [i, j] of sample) {
    const before = detourFailHits;
    RoomGraph.shortestPath(graph, rooms[i].guid, rooms[j].guid);
    if (detourFailHits > before) failSet.add(rooms[i].guid + '|' + rooms[j].guid);
  }
  console.log = realLog;
  return { rooms: rooms.length, pairCount: sample.length, failSet, pct: 100 * failSet.size / sample.length };
}

const baselineDb = loadCopy([]);
const baseline = sweepDetourFail(baselineDb);
baselineDb.close();
console.log('§HOSPITAL_BASELINE (no raster) rooms=' + baseline.rooms + ' sampledPairs=' + baseline.pairCount +
  ' fail=' + baseline.failSet.size + ' pct=' + baseline.pct.toFixed(1) + '%');

const rasteredDb = loadCopy([fs.readFileSync(PATCH, 'utf8')]);
const rastered = sweepDetourFail(rasteredDb);
rasteredDb.close();
console.log('§HOSPITAL_WITH_RASTER rooms=' + rastered.rooms + ' sampledPairs=' + rastered.pairCount +
  ' fail=' + rastered.failSet.size + ' pct=' + rastered.pct.toFixed(1) + '%');

let onlyBase = 0, onlyRastered = 0, both = 0;
baseline.failSet.forEach(p => { if (rastered.failSet.has(p)) both++; else onlyBase++; });
rastered.failSet.forEach(p => { if (!baseline.failSet.has(p)) onlyRastered++; });

chk('G1 raster patch applies cleanly (156 rooms, matches the raw db — Hospital has no companion self-heal patch)',
  rastered.rooms === 156, 'rooms=' + rastered.rooms);
chk('G2 raster does NOT regress the baseline (this is the thing both earlier attempts got wrong)',
  rastered.pct <= baseline.pct + 0.5, 'baseline=' + baseline.pct.toFixed(1) + '% withRaster=' + rastered.pct.toFixed(1) + '%');
chk('G3 documents the honest finding: it is a TIE, not an improvement — same failing pairs, not just a matching count',
  onlyBase === 0 && onlyRastered === 0, 'fixed=' + onlyBase + ' newlyBroken=' + onlyRastered + ' overlap=' + both);

console.log('\n§W-HOSPITAL-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail +
  ' — if G3 ever shows onlyBase>0, hallway_backbone.js\'s corridor coverage genuinely improved for Hospital; re-derive numbers, don\'t just bump this witness\'s floor.');
process.exit(fail ? 1 : 0);
