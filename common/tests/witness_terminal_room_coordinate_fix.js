#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TERMINAL-ROOM-COORD-FIX scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §22-§24 — the fleet connectivity
 * survey found Terminal only 28.2% graph-connected (51 components for 142 real+circulation nodes,
 * 47 of them totally isolated singleton rooms — 80% of Terminal's 59 rooms). Root-caused: NOT a
 * sparse-data or algorithm problem — Terminal's self-heal patch (`Terminal_extracted.db.sql`,
 * compiler-owned rooms per its own v2 header) had gone STALE relative to the current extracted
 * geometry. Measured directly: compiled room centers sat at x∈[91,149] y∈[-39,-1], while the
 * building's own real doors sit at x∈[634,696] y∈[11,51] — a consistent ~(+543,+51)m offset, same
 * building footprint size, just translated (not a rotation/scale bug). Rerunning
 * `scripts/compile_rooms.py` (bim-compiler) fresh against the CURRENT `Terminal_extracted.db` (no
 * code change, no manual edits — same rules, fresh data) reproduces rooms whose x/y range matches
 * the real doors almost exactly. This witness pins the fix: fullConnectivity() must land at
 * Clinic-control quality (~90%+), not the old 28.2%.
 * RUN: node witness_terminal_room_coordinate_fix.js   (from the worktree root)
 */
'use strict';
const fs = require('fs');
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('../room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const RAW_DB = '/home/red1/bim-ootb/buildings/Terminal_extracted.db';
const OLD_PATCH = require('path').join(__dirname, '..', '..', 'viewer/buildings/patches/Terminal_extracted.db.sql');
const NEW_PATCH = require('path').join(__dirname, '..', '..', 'buildings/patches/Terminal_extracted.db.sql');

function loadCopy(sqlSlices) {
  const tmp = '/tmp/_witness_terminal_coord_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(RAW_DB, tmp);
  const db = new Database(tmp);
  sqlSlices.forEach(s => db.exec(s));
  return db;
}

function measureConnectivity(db) {
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const rooms = graph.nodes.filter(n => n.kind === 'room');
  const conn = RoomGraph.fullConnectivity(graph);
  const largest = conn.sizes.length ? Math.max(...conn.sizes) : 0;
  const singletons = conn.sizes.filter(s => s === 1).length;
  return { rooms: rooms.length, components: conn.components, totalNodes: conn.totalNodes,
    largest, pct: conn.totalNodes ? 100 * largest / conn.totalNodes : 0, singletons };
}

const oldDb = loadCopy([fs.readFileSync(OLD_PATCH, 'utf8')]);
const before = measureConnectivity(oldDb);
oldDb.close();
console.log('§TERMINAL_OLD_PATCH (stale, offset rooms) rooms=' + before.rooms + ' components=' + before.components +
  ' largest=' + before.largest + '/' + before.totalNodes + ' (' + before.pct.toFixed(1) + '%) singletons=' + before.singletons);

const newDb = loadCopy([fs.readFileSync(NEW_PATCH, 'utf8')]);
const after = measureConnectivity(newDb);
newDb.close();
console.log('§TERMINAL_NEW_PATCH (recompiled, correctly-positioned rooms) rooms=' + after.rooms +
  ' components=' + after.components + ' largest=' + after.largest + '/' + after.totalNodes +
  ' (' + after.pct.toFixed(1) + '%) singletons=' + after.singletons);

chk('G1 old patch reproduces the measured 28.2% pre-fix baseline (confirms the bug is real, not already gone)',
  before.pct < 30, 'pct=' + before.pct.toFixed(1) + '%');
chk('G2 old patch\'s severe fragmentation (47+ singleton islands) is reproduced',
  before.singletons >= 40, 'singletons=' + before.singletons);
chk('G3 new patch reaches Clinic-control-level connectivity (>=90%, was 95.7% for Clinic)',
  after.pct >= 90, 'pct=' + after.pct.toFixed(1) + '%');
chk('G4 new patch has few or no isolated singleton rooms (was 47, real doors now resolve to real rooms)',
  after.singletons <= 10, 'singletons=' + after.singletons);
chk('G5 room count is in a plausible range versus the old (stale) compile (55 vs 59 — a fresh, real compile, not a bogus explosion/collapse)',
  after.rooms >= 40 && after.rooms <= 70, 'rooms=' + after.rooms);

console.log('\n§W-TERMINAL-ROOM-COORD-FIX DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
