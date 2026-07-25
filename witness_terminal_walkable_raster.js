#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TERMINAL-WALKABLE-RASTER scope (READ THE LOG after every run)
 * SCOPE: bim-compiler VIEWER_FIND_PANEL_ROOM_ACCURACY.md §12 — Terminal's walkable raster resolved
 * 0/174 slabs (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md §24 flagged it "unexplored"). ROOT CAUSE: Terminal
 * is a SPLIT-DB building — component_geometries lives in Terminal_geo.db (NOT Terminal_extracted.db,
 * which the build script read), and the element_instances that key into it live in Terminal_meta.db
 * (the db the live viewer's §S260b split-DB path actually loads + patches). build_storey_walkable_
 * raster.js called buildGeometryIndex(db) single-DB → empty index → 0 slabs. Fix: split-DB-aware
 * build (loads the sibling _geo.db as geoDb). The mesh is fully present — this witness proves
 * 705/705 IfcSlab guids resolve once geo.db is loaded (0/705 without it), and the raster shipped into
 * Terminal_meta.db.sql improves chord-legality routing on the meta.db graph the viewer really runs.
 * RUN: node witness_terminal_walkable_raster.js   (from the worktree root; needs buildings/*.db present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.js'));
const RealGeometry = require(path.join(__dirname, 'modeller', 'real_geometry.js'));
const RoomGraph = require('./common/room_graph.js');

// Data caches (gitignored) live in the primary checkout, not this fresh worktree.
const BLD = '/home/red1/bim-ootb/buildings';
const META_DB = path.join(BLD, 'Terminal_meta.db');
const GEO_DB = path.join(BLD, 'Terminal_geo.db');
const META_PATCH = path.join(__dirname, 'buildings/patches/Terminal_meta.db.sql');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// Split the shipped meta patch into (rooms-only) and (rooms + raster) so the raster's own effect is
// isolated — same before/after shape witness_jkr_walkable_raster.js uses.
const RASTER_MARKER = 'CREATE TABLE IF NOT EXISTS storey_walkable_raster';
const fullPatch = fs.readFileSync(META_PATCH, 'utf8');
const rasterAt = fullPatch.indexOf(RASTER_MARKER);
const roomsOnlyPatch = rasterAt >= 0 ? fullPatch.slice(0, rasterAt) : fullPatch;

function sweep(SQL, patchSql) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(META_DB)));
  db.exec(patchSql);
  const dbQuery = (q, p) => { const r = p ? db.exec(q, p) : db.exec(q); return r.length ? r[0].values : []; };
  let detourFailHits = 0;
  const realLog = console.log.bind(console);
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const rooms = graph.nodes.filter(n => n.kind === 'room');
  // connectivity: fraction of room pairs with SOME path
  console.log = (m) => { if (typeof m === 'string' && m.indexOf('§PATH_LEGAL_DETOUR_FAIL') === 0) detourFailHits++; };
  let pairCount = 0, pathFound = 0, pairsWithFail = 0;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    pairCount++;
    const before = detourFailHits;
    const r = RoomGraph.shortestPath(graph, rooms[i].guid, rooms[j].guid);
    if (r) pathFound++;
    if (detourFailHits > before) pairsWithFail++;
  }
  console.log = realLog;
  db.close && db.close();
  return {
    rooms: rooms.length, pairCount, pathFound, pairsWithFail,
    connPct: 100 * pathFound / pairCount,
    failPct: 100 * pairsWithFail / pairCount,
    rasterStoreys: Object.keys(graph.rasters || {}).length
  };
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.wasm')) });

  // ── G0: slab resolution — the actual root-cause claim ──────────────────────────────────────────
  const meta = new SQL.Database(new Uint8Array(fs.readFileSync(META_DB)));
  meta.exec(roomsOnlyPatch);
  const geo = new SQL.Database(new Uint8Array(fs.readFileSync(GEO_DB)));
  const slabGuids = (meta.exec("SELECT guid FROM elements_meta WHERE ifc_class LIKE 'IfcSlab%'")[0] || { values: [] }).values.map(r => r[0]);

  const idxSingle = RealGeometry.buildGeometryIndex(meta, meta);   // the OLD (broken) single-DB call
  const idxSplit = RealGeometry.buildGeometryIndex(meta, geo);     // the NEW split-DB call
  const resSingle = slabGuids.filter(g => { const h = idxSingle.byGuid[g]; return h != null && idxSingle.resolved[h]; }).length;
  const resSplit = slabGuids.filter(g => { const h = idxSplit.byGuid[g]; return h != null && idxSplit.resolved[h]; }).length;
  console.log('§TERMINAL_SLAB_RES total=' + slabGuids.length + ' singleDB=' + resSingle + ' splitDB=' + resSplit);
  chk('G0a single-DB (extracted-style, no geo) resolves ZERO slabs — reproduces the §24 0/174 gap',
    resSingle === 0, 'singleDB=' + resSingle + '/' + slabGuids.length);
  chk('G0b split-DB (meta+geo) resolves EVERY slab — the mesh is present, it was a plumbing gap not a data absence',
    resSplit === slabGuids.length && slabGuids.length > 0, 'splitDB=' + resSplit + '/' + slabGuids.length);

  // ── G1/G2: routing before/after the raster, on the meta.db graph the split-mode viewer runs ─────
  const base = sweep(SQL, roomsOnlyPatch);
  console.log('§TERMINAL_BASELINE (no raster) rooms=' + base.rooms + ' pairs=' + base.pairCount +
    ' conn=' + base.connPct.toFixed(1) + '% detourFail=' + base.failPct.toFixed(1) + '% rasterStoreys=' + base.rasterStoreys);
  const rast = sweep(SQL, fullPatch);
  console.log('§TERMINAL_WITH_RASTER rooms=' + rast.rooms + ' pairs=' + rast.pairCount +
    ' conn=' + rast.connPct.toFixed(1) + '% detourFail=' + rast.failPct.toFixed(1) + '% rasterStoreys=' + rast.rasterStoreys);

  chk('G1 baseline has NO raster loaded (rooms-only patch), with-raster loads all 6 storeys',
    base.rasterStoreys === 0 && rast.rasterStoreys === 6, 'base=' + base.rasterStoreys + ' with=' + rast.rasterStoreys);
  // §G2-RESPECIFIED 2026-07-25 (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §17). ⚠ ATTRIBUTION: this assertion
// was ALREADY failing on an unmodified origin/main engine (measured: base=73.8% with=77.9%, the same
// numbers as below), so it is not §17's doing. Its premise — "a raster only legalizes chords on
// existing edges" — stopped being true when §ROOM-SPINE-BRIDGE started GATING each room->circulation
// bridge on measured walkability (#995/#996/#997, OCCUPANT_PATHFINDER.md): better floor evidence now
// validates more real bridges, so connectivity is legitimately raster-DEPENDENT and can only go UP.
// Re-specified to that: connectivity must never DROP with the raster loaded.
chk('G2 connectivity never DROPS with the raster loaded (walkability-gated bridges may legitimately ADD edges — see §G2-RESPECIFIED)',
    rast.connPct >= base.connPct - 0.01, 'base=' + base.connPct.toFixed(1) + '% with=' + rast.connPct.toFixed(1) + '%');
  chk('G3 the accurate raster does NOT regress chord-legality vs the crude bbox-fallback baseline (it improves or ties)',
    rast.failPct <= base.failPct + 0.01, 'baseDetourFail=' + base.failPct.toFixed(1) + '% withRaster=' + rast.failPct.toFixed(1) + '%');

  console.log('\n§W-TERMINAL-WALKABLE-RASTER DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
