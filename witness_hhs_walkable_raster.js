#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HHS-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §21/§22 — HHS's mesh-derived
 * `storey_walkable_raster` self-heal patch (viewer/buildings/patches/HHS_Office_Federated_
 * extracted.db.sql, the file the LIVE Viewer actually fetches for HHS) had NEVER reached that
 * file — it only ever lived in the top-level `buildings/patches/` copy, which nothing serves in
 * production (confirmed via that file's own header comment). Investigating this surfaced a SECOND,
 * more serious problem: the raster committed there was built against the RAW, unpatched HHS db
 * (23 real-compiled rooms) — production's true room set, after this SAME file's own
 * `spatial_structure` self-heal fix is applied, is 105 rooms. A raster built from the wrong,
 * smaller room set REGRESSED routing when combined with the true 105-room graph (33.7%->40.5%
 * DETOUR_FAIL rate, worse than shipping no raster at all) — the opposite of a raster's whole
 * purpose. Rebuilt correctly via
 *   node scripts/build_storey_walkable_raster.js buildings/HHS_Office_Federated_extracted.db \
 *     <spatial_structure-patch-only.sql> <outSqlPath>
 * (i.e. ALWAYS pass this db's own companion self-heal patch as `patchPathToApplyFirst` when a
 * raster is (re)built for a building that has one — the one general lesson this investigation
 * produced). Measured floor: DETOUR_FAIL rate on the TRUE 105-room graph must go DOWN with the
 * raster applied, not up — a raster patch that doesn't clear this bar is worse than shipping none.
 * RUN: node witness_hhs_walkable_raster.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const RAW_DB = '/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db';
// Patch files are git-tracked (travel with THIS checkout/worktree, unlike the gitignored db
// binaries above) — resolve relative to this script so the witness checks whatever branch it's
// actually run from, not always the main checkout.
const PATCH = require('path').join(__dirname, 'viewer/buildings/patches/HHS_Office_Federated_extracted.db.sql');

function loadCopy(sqlSlices) {
  const tmp = '/tmp/_witness_hhs_raster_' + Math.random().toString(36).slice(2) + '.db';
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

const fullPatch = fs.readFileSync(PATCH, 'utf8');
const marker = fullPatch.indexOf('CREATE TABLE IF NOT EXISTS storey_walkable_raster');
const sstructOnly = fullPatch.slice(0, marker); // spatial_structure section, before the raster CREATE TABLE

const baselineDb = loadCopy([sstructOnly]);
const baseline = sweepDetourFail(baselineDb);
baselineDb.close();
console.log('§HHS_BASELINE (spatial_structure patch, no raster) rooms=' + baseline.rooms +
  ' pairs=' + baseline.pairCount + ' fail=' + baseline.pairsWithFail + ' pct=' + baseline.pct.toFixed(1) + '%');

const rasteredDb = loadCopy([fullPatch]);
const rastered = sweepDetourFail(rasteredDb);
rasteredDb.close();
console.log('§HHS_WITH_RASTER (spatial_structure + raster patch) rooms=' + rastered.rooms +
  ' pairs=' + rastered.pairCount + ' fail=' + rastered.pairsWithFail + ' pct=' + rastered.pct.toFixed(1) + '%');

chk('G1 raster patch applies onto the TRUE production room set (105 rooms, matching the spatial_structure patch — not the raw db\'s 23)',
  rastered.rooms === 105, 'rooms=' + rastered.rooms);
chk('G2 baseline (spatial_structure patch alone) reproduces the measured 33.7% DETOUR_FAIL floor',
  Math.abs(baseline.pct - 33.7) < 1.5, 'pct=' + baseline.pct.toFixed(1) + '%');
chk('G3 raster makes routing STRICTLY BETTER than no-raster on the true room set (the whole point of shipping it — a raster that doesn\'t clear this is worse than none)',
  rastered.pct < baseline.pct, 'baseline=' + baseline.pct.toFixed(1) + '% withRaster=' + rastered.pct.toFixed(1) + '%');
chk('G4 raster-improved rate matches the measured ~28.7% floor (real number, not re-derived on the fly)',
  rastered.pct <= 28.7 + 1.5, 'pct=' + rastered.pct.toFixed(1) + '%');

console.log('\n§W-HHS-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
