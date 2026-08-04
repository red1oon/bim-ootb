#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HOSPITAL-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §22-§24 + VIEWER_FIND_PANEL_ROOM_
 * ACCURACY.md §17 — Hospital's walkable raster vs the no-raster baseline, measured pair by pair.
 *
 * ⚠ THIS WITNESS'S PREMISE WAS REWRITTEN 2026-07-25, per its OWN closing instruction ("if G3 ever
 * shows onlyBase>0 ... re-derive numbers, don't just bump this witness's floor"). It previously
 * asserted that Hospital's raster is a permanent TIE with the baseline — same 1197/3023 pairs
 * failing before and after — and existed to stop sessions re-attempting "make Hospital's raster
 * better" as if it were an open bug. That premise was FALSE, and the reason was found by measurement,
 * not by re-attempting the thing it warned against: the raster BUILDER selected slabs in a hardcoded
 * z window `[storeyZ-2, storeyZ+1]` around the average ROOM-CENTRE z, and on this building that
 * missed the real floor plate by FIVE CENTIMETRES (Level 4 window [181.79,184.79] vs floor slab
 * z=181.74, area 8270 m²; same on Level 1 and Level 5). So the shipped raster carried rooms and
 * corridors only, and a "tie" was the best it could do. With the floor plane DERIVED instead
 * (§FLOOR-PLANE-NOT-FIXED-WINDOW in scripts/build_storey_walkable_raster.js) the same building's
 * coverage goes Level 1 39.8%->69.3%, Level 4 20.5%->41.2%, and this sweep goes from
 * baseline 63.3% (1914/3023 pairs) to 0.0% (0/3023) with ZERO newly-broken pairs.
 * The old note also blamed hallway_backbone.js's corridor-join ratio (17.8% vs Clinic's ~45%). That
 * gap is real and still open (witness_hospital_corridor_baseline.js owns it) but it was NOT what
 * capped this metric — do not re-derive the two as the same finding.
 * G3 now asserts the real invariant: the raster must IMPROVE the baseline and break nothing.
 * RUN: node witness_hospital_walkable_raster.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('../room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const RAW_DB = '/home/red1/bim-ootb/buildings/Hospital_extracted.db';
const PATCH = require('path').join(__dirname, '..', '..', 'viewer/buildings/patches/Hospital_extracted.db.sql');
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
// G3 (rewritten 2026-07-25, see the scope block): the raster must FIX pairs and break none. The old
// assertion demanded an exact tie, which now fails BY SUCCEEDING — the floor-plane fix turns 1914
// failing pairs into 0. `newlyBroken===0` keeps the guarantee that mattered in the tie era: more
// walkable evidence can only turn illegal->legal, never the reverse.
chk('G3 raster IMPROVES the baseline and breaks nothing (was asserted as a permanent TIE until the ' +
  'builder\'s floor-plane bug was found — see scope block)',
  onlyBase > 0 && onlyRastered === 0, 'fixed=' + onlyBase + ' newlyBroken=' + onlyRastered + ' overlap=' + both);

console.log('\n§W-HOSPITAL-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail +
  ' — if G3 ever REGRESSES (newlyBroken>0, or fixed drops toward 0), the raster patch in ' +
  'buildings/patches/ has gone stale against the room set or the builder\'s floor-plane detection ' +
  'broke; re-derive from scripts/build_storey_walkable_raster.js\'s §RASTER_FLOOR_PLANE log, don\'t ' +
  'relax this assertion.');
process.exit(fail ? 1 : 0);
