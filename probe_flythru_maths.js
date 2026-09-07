#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FLYTHRU-MATHS scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §FLYTHRU_DIMENSIONS §3 — run the TWO
 * PRIMITIVES against a real building DB and report the B1-B3 CANDIDATES (§3.8 rudiment set).
 * NO GPU, NO browser, NO scene: B1-B3 are pure DB reads, so the DB->scene transform (§3.9) cannot
 * corrupt these numbers. That is the point of doing this leg first.
 * RUN: node probe_flythru_maths.js <dbPath>
 */
'use strict';
const path = require('path');
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const M = require(path.join(__dirname, 'common', 'flythru_maths.js'));
const SR = require(path.join(__dirname, 'common', 'storey_raster.js'));

const DB = process.argv[2] || '/home/red1/Downloads/Hospital_silent.db';
const log = (s) => { console.log(s); };
const f2 = (n) => Number(n).toFixed(2);
const int = (n) => Math.round(n).toLocaleString('en-US');

const db = new Database(DB, { readonly: true });
log('§FT_PROBE db=' + DB);

// ── candidate source: elements_meta JOIN element_transforms (§2 — never the scene metadata) ──────
const rows = db.prepare(
  'SELECT t.guid,t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z,m.ifc_class,m.storey,m.building,m.discipline ' +
  'FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid').all();
const boxes = rows.map(r => ({ cx: r.center_x, cy: r.center_y, cz: r.center_z,
                               sx: r.bbox_x, sy: r.bbox_y, sz: r.bbox_z,
                               cls: r.ifc_class, storey: r.storey, bld: r.building, disc: r.discipline }));
log('§FT_SOURCE elements=' + int(boxes.length) + ' (element_transforms JOIN elements_meta)');

// ══ B1 — BUILDING ENVELOPE ═══════════════════════════════════════════════════════════════════════
const e = M.ftExtents(boxes);
const t0 = Date.now();
const gr = M.ftRasterizeBoxes(boxes, M.RES, 'ENVELOPE');
const grArea = M.ftRasterArea(gr), grPerim = M.ftRasterPerimeter(gr);
log('§FT_B1_EXTENT X=' + f2(e.sx) + 'm Y=' + f2(e.sy) + 'm Z=' + f2(e.sz) + 'm  (chord, stop=outermost material)');
log('§FT_B1_GROUND bboxArea=' + int(e.sx * e.sy) + 'm2  rasterArea=' + int(grArea) + 'm2  ratio=' +
    f2((e.sx * e.sy) / grArea) + 'x  perimeter=' + int(grPerim) + 'm  cells=' + gr.cols + 'x' + gr.rows +
    ' res=' + gr.res + ' ms=' + (Date.now() - t0));
log('§FT_B1_VOLUME bboxVolume=' + int(e.sx * e.sy * e.sz) + 'm3 (AIR — label "envelope volume")  ' +
    'prismVolume=' + int(grArea * e.sz) + 'm3 (rasterArea x height)');

// ══ B2 — STOREY FLOOR SPACE ══════════════════════════════════════════════════════════════════════
// elements_meta.storey is granular ("Level 3", "Level 3 Ceiling", "Level 3 TOS") — a storey's floor
// space is the base level, so fold the Ceiling/TOS variants into it. Derived from the data, not a list.
const base = (s) => String(s || 'Unknown').replace(/\s+(Ceiling|TOS)$/i, '');
const byStorey = new Map();
for (const b of boxes) { const k = base(b.storey); if (!byStorey.has(k)) byStorey.set(k, []); byStorey.get(k).push(b); }
const walk = new Map();
for (const r of db.prepare('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster').all()) {
  const R = SR.fromRow([r.storey, r.res, r.x0, r.y0, r.cols, r.rows, r.bits]);
  walk.set(r.storey, { area: M.ftRasterArea(R), perim: M.ftRasterPerimeter(R) });
}
log('§FT_B2_WALKABLE_ROWS n=' + walk.size + ' (precomputed from REAL MESH by scripts/build_storey_walkable_raster.js)');
const b2 = [];
for (const [k, arr] of byStorey) {
  if (k === 'Unknown') continue;
  const ex = M.ftExtents(arr); if (!ex) continue;
  const R = M.ftRasterizeBoxes(arr, M.RES, k);
  const a = M.ftRasterArea(R), w = walk.get(k);
  b2.push({ storey: k, n: arr.length, gross: a, bbox: ex.sx * ex.sy, perim: M.ftRasterPerimeter(R),
            walk: w ? w.area : null, sx: ex.sx, sy: ex.sy, z: ex.minz });
}
b2.sort((a, b) => a.z - b.z);
for (const s of b2)
  log('§FT_B2_STOREY ' + s.storey.padEnd(14) + ' n=' + String(s.n).padStart(6) +
      ' grossRaster=' + int(s.gross).padStart(7) + 'm2  bbox=' + int(s.bbox).padStart(7) + 'm2 (' +
      f2(s.bbox / s.gross) + 'x)  walkable=' + (s.walk == null ? 'none' : int(s.walk) + 'm2') +
      '  perim=' + int(s.perim) + 'm');

// ══ B3 — ROOMS (injected; union of sub-rects) ════════════════════════════════════════════════════
const rr = db.prepare("SELECT guid,name,room_guid,center_x,center_y,center_z,size_x,size_y,size_z " +
                      "FROM spatial_structure WHERE type='IfcSpace' AND room_guid IS NOT NULL").all();
const byRoom = new Map();
for (const r of rr) {
  if (!byRoom.has(r.room_guid)) byRoom.set(r.room_guid, { name: r.name, rects: [] });
  byRoom.get(r.room_guid).rects.push({ cx: r.center_x, cy: r.center_y, cz: r.center_z,
                                       sx: r.size_x, sy: r.size_y, sz: r.size_z });
}
log('§FT_B3_ROOMS logical=' + byRoom.size + ' subRects=' + rr.length +
    ' (all RM_/marked names => COMPILED, draw fainter per §5 SYNTHETIC-HONESTY)');
const b3 = [];
for (const [g, v] of byRoom) {
  const m = M.ftUnionMeasure(v.rects);
  b3.push({ guid: g, name: v.name, area: m.area, vol: m.volume, h: m.height, parts: m.parts,
            sx: m.extents.sx, sy: m.extents.sy });
}
b3.sort((a, b) => b.area - a.area);
for (const r of b3)
  log('§FT_B3_ROOM ' + r.guid.padEnd(16) + ' "' + r.name + '" parts=' + r.parts +
      ' area=' + f2(r.area) + 'm2 vol=' + f2(r.vol) + 'm3 h=' + f2(r.h) + 'm span=' + f2(r.sx) + 'x' + f2(r.sy) + 'm');

// ══ VERDICT — is the rudiment set filmable? ══════════════════════════════════════════════════════
const okB1 = !!e, okB2 = b2.length > 0, okB3 = b3.length > 0;
const bigRooms = b3.filter(r => r.area >= 9).length;
log('§FT_VERDICT B1=' + (okB1 ? 'OK' : 'FAIL') + ' B2=' + (okB2 ? 'OK n=' + b2.length : 'FAIL') +
    ' B3=' + (okB3 ? 'OK n=' + b3.length + ' (>=9m2: ' + bigRooms + ')' : 'FAIL'));
if (!bigRooms) log('§FT_B3_WEAK no injected room reaches 9 m2 — B3 would state a closet as "a room"');
db.close();
