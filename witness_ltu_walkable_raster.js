#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LTU-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/LARGE_DB_BAKE.md §2 L1 — LTU_AHouse was the one fleet building shipped
 * with NO storey_walkable_raster table (622,330-element `_silent.db`, 397 rooms across 4 storeys with
 * resolved IfcSlab geometry), so every room->exit path was legalized from scratch at bake time (560s of
 * a 627s startup, CPE_4D_PERF_MEM_FINDINGS.md §8). Same generator as the four siblings
 * (scripts/build_storey_walkable_raster.js), same G2/G3 invariant (witness_hospital_walkable_raster.js's
 * own header): the raster must IMPROVE the DETOUR_FAIL baseline and break nothing, never widen it.
 * Same sampling convention as witness_hospital_walkable_raster.js (LTU's 397 rooms = 78,606 pairs, too
 * many to sweep exhaustively like JKR's 66-room fleet — same MAX_PAIRS=3000 stride).
 * RUN: node witness_ltu_walkable_raster.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// §NO-RASTER-BASELINE-MUST-BE-RAW (found running this witness the first time, 2026-09-15): the raster
// was applied IN PLACE to the live LTU_AHouse_silent.db (unlike Hospital/JKR/HHS/Terminal, whose raw
// extracted db never carries a raster — theirs is layered on at query time from a separate patch file),
// so a "baseline" copy of the LIVE file already has storey_walkable_raster and is not a baseline at all
// — G3 read fixed=0 because both sides of the comparison were the same already-patched bytes. The
// baseline MUST come from the pre-raster backup; the live file is checked separately (G5) to confirm it
// actually carries what the patch produces.
const RAW_DB = process.env.HOME + '/Downloads/LTU_AHouse_silent.db.pre-raster-backup';
const LIVE_DB = process.env.HOME + '/Downloads/LTU_AHouse_silent.db';
const PATCH = require('path').join(__dirname, 'buildings/patches/LTU_AHouse_silent.db.sql');
const MAX_PAIRS = 3000;

function loadCopy(sqlSlices, srcDb) {
  const tmp = '/tmp/_witness_ltu_raster_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(srcDb || RAW_DB, tmp);
  const db = new Database(tmp);
  sqlSlices.forEach(s => db.exec(s));
  return { db, tmp };
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
  return { rooms: rooms.length, pairCount: sample.length, failSet, pct: 100 * failSet.size / sample.length, graph };
}

const { db: baseDb, tmp: baseTmp } = loadCopy([]);
const baseline = sweepDetourFail(baseDb);
baseDb.close(); fs.unlinkSync(baseTmp);
console.log('§LTU_BASELINE (no raster) rooms=' + baseline.rooms + ' sampledPairs=' + baseline.pairCount +
  ' fail=' + baseline.failSet.size + ' pct=' + baseline.pct.toFixed(1) + '%');

const { db: rasDb, tmp: rasTmp } = loadCopy([fs.readFileSync(PATCH, 'utf8')]);
const rastered = sweepDetourFail(rasDb);
rasDb.close(); fs.unlinkSync(rasTmp);
console.log('§LTU_WITH_RASTER rooms=' + rastered.rooms + ' sampledPairs=' + rastered.pairCount +
  ' fail=' + rastered.failSet.size + ' pct=' + rastered.pct.toFixed(1) + '% rasterStoreys=' +
  Object.keys(rastered.graph.rasters || {}).length);

let onlyBase = 0, onlyRastered = 0, both = 0;
baseline.failSet.forEach(p => { if (rastered.failSet.has(p)) both++; else onlyBase++; });
rastered.failSet.forEach(p => { if (!baseline.failSet.has(p)) onlyRastered++; });

chk('G1 raster patch applies cleanly (397 rooms, matches the raw db — LTU has no companion self-heal patch)',
  rastered.rooms === 397, 'rooms=' + rastered.rooms);
chk('G2 baseline reproduces the measured ~4.1% DETOUR_FAIL floor',
  Math.abs(baseline.pct - 4.1) < 1.0, 'pct=' + baseline.pct.toFixed(1) + '%');
chk('G3 raster IMPROVES the baseline and breaks nothing (fixed=93 newlyBroken=0 measured 2026-09-14)',
  onlyBase > 0 && onlyRastered === 0, 'fixed=' + onlyBase + ' newlyBroken=' + onlyRastered + ' overlap=' + both);
chk('G4 4 storeys carry a raster (VÅNING 1-4, the only ones with resolved IfcSpace/IfcSlab geometry)',
  Object.keys(rastered.graph.rasters || {}).length === 4, 'rasterStoreys=' + Object.keys(rastered.graph.rasters || {}).length);

// G5 — the LIVE file (the one every worktree symlinks to and every bake actually reads) must match
// the reconstructed with-raster result above, not just the patch-in-isolation. Confirms the in-place
// edit actually took, independent of the patch .sql being readable at all.
const { db: liveDb, tmp: liveTmp } = loadCopy([], LIVE_DB);
const live = sweepDetourFail(liveDb);
liveDb.close(); fs.unlinkSync(liveTmp);
console.log('§LTU_LIVE_DB rooms=' + live.rooms + ' sampledPairs=' + live.pairCount + ' fail=' + live.failSet.size +
  ' pct=' + live.pct.toFixed(1) + '% rasterStoreys=' + Object.keys(live.graph.rasters || {}).length);
chk('G5 the LIVE db (~/Downloads/LTU_AHouse_silent.db, what bakes actually read) already carries the raster',
  Object.keys(live.graph.rasters || {}).length === 4 && Math.abs(live.pct - rastered.pct) < 0.1,
  'rasterStoreys=' + Object.keys(live.graph.rasters || {}).length + ' pct=' + live.pct.toFixed(1) + '%');

console.log('\n§W-LTU-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail +
  ' — if G3 ever REGRESSES (newlyBroken>0, or fixed drops toward 0), the raster patch in ' +
  'buildings/patches/LTU_AHouse_silent.db.sql has gone stale against the room set; re-run ' +
  'scripts/build_storey_walkable_raster.js against the current DB, don\'t relax this assertion.');
process.exit(fail ? 1 : 0);
