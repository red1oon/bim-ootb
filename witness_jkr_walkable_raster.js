#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-JKR-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §22/§23 — the "is it general?"
 * fleet survey found JKR's chord-legality DETOUR_FAIL rate (81.2% within its largest connected
 * component) even worse than HHS's pre-fix state, with none of HHS's complications (JKR has no
 * companion self-heal patch, so the raw db already reflects production's true room set — unlike
 * HHS/Terminal). Built its walkable raster the same way (scripts/build_storey_walkable_raster.js,
 * all 4 storeys have real resolved IfcSlab geometry so §RASTER-CORRIDOR-PARITY's corridor-rect
 * union — the fix that Hospital needed and still didn't fully resolve — isn't even load-bearing
 * here). Measured, real improvement: 34.2%->21.3% DETOUR_FAIL rate (full 2145-pair sweep, not
 * sampled). This witness pins both floors.
 * RUN: node witness_jkr_walkable_raster.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const RAW_DB = '/home/red1/bim-ootb/buildings/JKR_extracted.db';
const PATCH = require('path').join(__dirname, 'viewer/buildings/patches/JKR_extracted.db.sql');

function loadCopy(sqlSlices) {
  const tmp = '/tmp/_witness_jkr_raster_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(RAW_DB, tmp);
  const db = new Database(tmp);
  sqlSlices.forEach(s => db.exec(s));
  return db;
}

function sweepDetourFail(db) {
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const rooms = graph.nodes.filter(n => n.kind === 'room');
  let detourFailHits = 0, pairsWithFail = 0, pairCount = 0, noPath = 0;
  const realLog = console.log.bind(console);
  console.log = (m) => { if (typeof m === 'string' && m.indexOf('§PATH_LEGAL_DETOUR_FAIL') === 0) detourFailHits++; };
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    pairCount++;
    const before = detourFailHits;
    const r = RoomGraph.shortestPath(graph, rooms[i].guid, rooms[j].guid);
    if (detourFailHits > before) pairsWithFail++;
    if (!r) noPath++;
  }
  console.log = realLog;
  return { rooms: rooms.length, pairCount, pairsWithFail, noPath, pct: 100 * pairsWithFail / pairCount };
}

const baselineDb = loadCopy([]);
const baseline = sweepDetourFail(baselineDb);
baselineDb.close();
console.log('§JKR_BASELINE (no raster) rooms=' + baseline.rooms + ' pairs=' + baseline.pairCount +
  ' fail=' + baseline.pairsWithFail + ' pct=' + baseline.pct.toFixed(1) + '%');

const rasteredDb = loadCopy([fs.readFileSync(PATCH, 'utf8')]);
const rastered = sweepDetourFail(rasteredDb);
rasteredDb.close();
console.log('§JKR_WITH_RASTER rooms=' + rastered.rooms + ' pairs=' + rastered.pairCount +
  ' fail=' + rastered.pairsWithFail + ' pct=' + rastered.pct.toFixed(1) + '%');

chk('G1 raster patch applies cleanly (66 rooms, same as the raw db — JKR has no companion self-heal patch to worry about, unlike HHS)',
  rastered.rooms === 66, 'rooms=' + rastered.rooms);
chk('G2 baseline reproduces the measured 34.2% DETOUR_FAIL floor',
  Math.abs(baseline.pct - 34.2) < 1.5, 'pct=' + baseline.pct.toFixed(1) + '%');
chk('G3 raster makes routing STRICTLY BETTER than no-raster',
  rastered.pct < baseline.pct, 'baseline=' + baseline.pct.toFixed(1) + '% withRaster=' + rastered.pct.toFixed(1) + '%');
chk('G4 raster-improved rate matches the measured ~21.3% floor',
  rastered.pct <= 21.3 + 1.5, 'pct=' + rastered.pct.toFixed(1) + '%');

console.log('\n§W-JKR-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
