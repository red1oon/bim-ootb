#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RASTER-BUILD scope (READ THE LOG after every run)
 * SCOPE: PATH_LEGAL_SEGMENTS.md §G3-REVISED — offline precompute of a per-storey walkable-space
 * bitset raster from the building's OWN real triangulated mesh (component_geometries, via
 * modeller/real_geometry.js) + room rects, so room_graph.js's chord-legality test at query time is
 * a plain O(1) bitset lookup instead of a live bbox-union sample. Emits a self-heal patch SQL
 * fragment (CREATE TABLE IF NOT EXISTS + INSERT OR REPLACE per storey) — append this project's
 * standing DB-change doctrine (CLAUDE.md §DB CHANGES: migration/patch, never a committed binary).
 * RUN: node scripts/build_storey_walkable_raster.js <dbPath> [patchPathToApplyFirst] [outSqlPath]
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const RealGeometry = require(path.join(ROOT, 'modeller', 'real_geometry.js'));
const RoomGraph = require(path.join(ROOT, 'common', 'room_graph.js'));
const StoreyRaster = require(path.join(ROOT, 'common', 'storey_raster.js'));

const RES = 0.25;      // matches PATH_LEGAL_SEGMENTS.md's own chord-sampling step
const Z_LO = -2, Z_HI = 1; // storeyZ window — same as the spec's G3 (wall-center z sits above the slab)
const PAD = 1.0;
const ROT_TOL = 1e-3;  // rotation_x/rotation_y beyond this -> tilted mesh, degrade to bbox for that element

function sign(px, py, ax, ay, bx, by) { return (px - bx) * (ay - by) - (ax - bx) * (py - by); }
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by), d2 = sign(px, py, bx, by, cx, cy), d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0), hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}
function pointInRect(px, py, rc) { return px >= rc.x0 && px <= rc.x1 && py >= rc.y0 && py <= rc.y1; }
function inflateRect(rc, slack) { return { x0: rc.x0 - slack, x1: rc.x1 + slack, y0: rc.y0 - slack, y1: rc.y1 + slack }; }

async function loadDb(SQL, dbPath, patchPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  if (patchPath && fs.existsSync(patchPath)) db.exec(fs.readFileSync(patchPath, 'utf8'));
  function dbQuery(q, params) {
    const r = params ? db.exec(q, params) : db.exec(q);
    if (!r.length) return [];
    return r[0].values;
  }
  return { db, dbQuery };
}

// World-XY triangles for every slab guid on `storey` (z window [storeyZ+Z_LO, storeyZ+Z_HI]).
// Returns { triangles: [[x0,y0,x1,y1,x2,y2],...], fallbackRects: [rect,...] (unresolved/tilted guids) }.
function slabTrianglesForStorey(dbQuery, geomIdx, storey, storeyZ, log) {
  let rows = [];
  try {
    rows = dbQuery("SELECT m.guid, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, " +
      "t.bbox_x, t.bbox_y, m.element_name FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid " +
      "WHERE m.ifc_class LIKE 'IfcSlab%' AND t.center_x IS NOT NULL AND t.center_z >= ? AND t.center_z <= ?",
      [storeyZ + Z_LO, storeyZ + Z_HI]) || [];
  } catch (e) { log('§RASTER_SLAB_ERR ' + e.message); }
  const triangles = [], fallbackRects = [];
  let resolved = 0, unresolved = 0, tilted = 0;
  rows.forEach(r => {
    const guid = r[0], cx = r[1], cy = r[2], rx = r[4] || 0, ry = r[5] || 0, rz = r[6] || 0, bx = r[7] || 0, by = r[8] || 0;
    const bboxRect = { x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 };
    if (Math.abs(rx) > ROT_TOL || Math.abs(ry) > ROT_TOL) { tilted++; fallbackRects.push(bboxRect); return; }
    const hash = geomIdx.byGuid[guid];
    const g = hash != null ? geomIdx.resolved[hash] : null;
    if (!g) { unresolved++; fallbackRects.push(bboxRect); return; }
    resolved++;
    const cosR = Math.cos(rz), sinR = Math.sin(rz);
    const pos = g.positions, off = g.anchorOffset;
    const wx = new Float64Array(pos.length / 3), wy = new Float64Array(pos.length / 3);
    for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
      const lx = pos[i] + off[0], ly = pos[i + 1] + off[1];
      wx[v] = cx + cosR * lx - sinR * ly;
      wy[v] = cy + sinR * lx + cosR * ly;
    }
    const f = g.faces;
    for (let i = 0; i + 2 < f.length; i += 3) {
      const a = f[i], b = f[i + 1], c = f[i + 2];
      triangles.push([wx[a], wy[a], wx[b], wy[b], wx[c], wy[c]]);
    }
  });
  log('§RASTER_SLABS storey=' + storey + ' slabs=' + rows.length + ' resolved=' + resolved +
    ' unresolved=' + unresolved + ' tilted=' + tilted + ' triangles=' + triangles.length);
  return { triangles, fallbackRects };
}

function buildStoreyRaster(dbQuery, geomIdx, graph, storey, log) {
  const roomsHere = graph.nodes.filter(n => n.storey === storey);
  const storeyZ = roomsHere.reduce((s, n) => s + n.cz, 0) / (roomsHere.length || 1);
  const roomRects = [];
  roomsHere.forEach(n => n.rects.forEach(rc => roomRects.push(rc)));
  const { triangles, fallbackRects } = slabTrianglesForStorey(dbQuery, geomIdx, storey, storeyZ, log);
  // §RASTER-CORRIDOR-PARITY (2026-07-15, real regression found+fixed): a raster used to be built
  // from slab triangles + room rects ONLY — but room_graph.js's own _pointWalkable() fallback (the
  // behavior this raster REPLACES once shipped) also trusts corridorRectsByStorey (real,
  // wall+door-verified hallway_backbone.js buckets). Omitting them here meant a storey with real
  // corridor evidence but little/no resolved IfcSlab geometry (measured on Hospital: 5 of 7
  // storeys had ZERO slabs) got a raster that was STRICTLY WORSE than the fallback it replaced —
  // Hospital's DETOUR_FAIL rate regressed 39.6%->44.1% before this fix. A raster must never drop
  // evidence the fallback already had.
  const corridorRects = (graph.corridorRectsByStorey && graph.corridorRectsByStorey[storey]) || [];
  // §RASTER-SLACK-PARITY (2026-07-15, found while Hospital's raster still lagged the no-raster
  // baseline even after §RASTER-CORRIDOR-PARITY above): _pointWalkable()'s fallback path inflates
  // room rects by DOOR_BUFFER_SLACK (0.20m) and corridor rects by CORRIDOR_RECT_SLACK (0.30m) —
  // real, already-justified margins (wall-thickness/measurement rounding, see room_graph.js's own
  // comments on each) — but this build script's plain pointInRect() test applies neither, so a
  // raster cell within that margin of a real rect's edge flips from walkable (fallback) to
  // not-walkable (raster). A raster must be a superset of what its own fallback already granted,
  // never stricter — same principle as the corridor-rect fix above, same DOOR_BUFFER_SLACK /
  // CORRIDOR_RECT_SLACK constants (not new magic numbers).
  const DOOR_BUFFER_SLACK = 0.20, CORRIDOR_RECT_SLACK = 0.30;
  const allRects = roomRects.map(rc => inflateRect(rc, DOOR_BUFFER_SLACK))
    .concat(fallbackRects)
    .concat(corridorRects.map(rc => inflateRect(rc, CORRIDOR_RECT_SLACK)));

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  allRects.forEach(rc => { x0 = Math.min(x0, rc.x0); x1 = Math.max(x1, rc.x1); y0 = Math.min(y0, rc.y0); y1 = Math.max(y1, rc.y1); });
  triangles.forEach(t => {
    for (let i = 0; i < 6; i += 2) { x0 = Math.min(x0, t[i]); x1 = Math.max(x1, t[i]); y0 = Math.min(y0, t[i + 1]); y1 = Math.max(y1, t[i + 1]); }
  });
  if (!isFinite(x0)) { log('§RASTER_SKIP storey=' + storey + ' no geometry'); return null; }
  x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
  const cols = Math.max(1, Math.ceil((x1 - x0) / RES)), rows = Math.max(1, Math.ceil((y1 - y0) / RES));
  if (cols * rows > 6000000) { log('§RASTER_SKIP storey=' + storey + ' grid too large cols=' + cols + ' rows=' + rows); return null; }

  // broad-phase: per-triangle 2D bbox, so a cell only tests triangles it could plausibly hit.
  const triBoxes = triangles.map(t => ({
    x0: Math.min(t[0], t[2], t[4]), x1: Math.max(t[0], t[2], t[4]),
    y0: Math.min(t[1], t[3], t[5]), y1: Math.max(t[1], t[3], t[5])
  }));

  const bits = StoreyRaster.makeBitset(cols, rows);
  let covered = 0;
  StoreyRaster.forEachCellCenter(x0, y0, RES, cols, rows, (col, row, px, py) => {
    for (let i = 0; i < allRects.length; i++) { if (pointInRect(px, py, allRects[i])) { StoreyRaster.setBit(bits, cols, col, row); covered++; return; } }
    for (let i = 0; i < triangles.length; i++) {
      const b = triBoxes[i];
      if (px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1) continue;
      const t = triangles[i];
      if (pointInTriangle(px, py, t[0], t[1], t[2], t[3], t[4], t[5])) { StoreyRaster.setBit(bits, cols, col, row); covered++; return; }
    }
  });
  log('§RASTER_BUILT storey=' + storey + ' res=' + RES + ' cols=' + cols + ' rows=' + rows +
    ' covered=' + covered + '/' + (cols * rows) + ' (' + (100 * covered / (cols * rows)).toFixed(1) + '%) bytes=' + bits.length);
  return StoreyRaster.makeRaster(storey, RES, x0, y0, cols, rows, bits);
}

function rasterToSql(raster) {
  const hex = StoreyRaster.bitsToHex(raster.bits);
  const storeyEsc = raster.storey.replace(/'/g, "''");
  return "INSERT OR REPLACE INTO storey_walkable_raster (storey,res,x0,y0,cols,rows,bits) VALUES " +
    "('" + storeyEsc + "'," + raster.res + "," + raster.x0.toFixed(4) + "," + raster.y0.toFixed(4) + "," +
    raster.cols + "," + raster.rows + ",X'" + hex + "');";
}

async function main() {
  const dbPath = process.argv[2], patchPath = process.argv[3], outSqlPath = process.argv[4];
  if (!dbPath) { console.error('usage: build_storey_walkable_raster.js <dbPath> [patchPath] [outSqlPath]'); process.exit(1); }
  const log = console.log;
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const { db, dbQuery } = await loadDb(initSql, dbPath, patchPath);
  const geomIdx = RealGeometry.buildGeometryIndex(db);
  log('§RASTER_GEOM_INDEX table=' + geomIdx.table + ' guids=' + Object.keys(geomIdx.byGuid).length +
    ' resolvedHashes=' + Object.keys(geomIdx.resolved).length);
  const graph = RoomGraph.buildGraph(dbQuery, { log });
  const storeys = Array.from(new Set(graph.nodes.map(n => n.storey)));
  const statements = ["CREATE TABLE IF NOT EXISTS storey_walkable_raster (storey TEXT PRIMARY KEY, res REAL, x0 REAL, y0 REAL, cols INTEGER, rows INTEGER, bits BLOB);"];
  storeys.forEach(storey => {
    const raster = buildStoreyRaster(dbQuery, geomIdx, graph, storey, log);
    if (raster) statements.push(rasterToSql(raster));
  });
  const sql = statements.join('\n') + '\n';
  if (outSqlPath) {
    fs.writeFileSync(outSqlPath, sql);
    log('§RASTER_WROTE ' + outSqlPath + ' bytes=' + sql.length);
  } else {
    console.log(sql);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
