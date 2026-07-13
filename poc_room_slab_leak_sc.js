#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — POC-ROOM-SLAB-LEAK scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/FUNCTIONAL_SPACES_ENSEMBLE.md Step 3 — MEASURE (not fix) how many of
 * SampleCastle's 51 carried flood-fill rooms have a bbox that extends past the building's REAL
 * slab footprint (a leak through a glass/open wall — the same failure shape §G3-REVISED/073336f
 * fixed for chord legality with a mesh-derived storey raster instead of a lossy bbox union).
 * METHOD (slab-ONLY footprint — deliberately NOT the shipped raster, which unions room rects into
 * the bitset and would therefore be self-fulfilling for this question): reuse §G3-REVISED's own
 * slab-triangle placement (slabTrianglesForStorey logic, ported verbatim from
 * scripts/build_storey_walkable_raster.js @ 073336f — z-window, ROT_TOL tilt fallback, rotation_z
 * world placement), then sample each room rect at the same RES=0.25m cell centers and count cells
 * NOT covered by any slab triangle / fallback slab bbox. Geometry: the resident's own
 * element_instances hashes resolved against the shared modeller/mesh.db registry (same pairing the
 * Modeller runtime uses). Duplex is run first as the ground-truth control (real rooms, real slabs
 * — its leak numbers calibrate what "normal" looks like before reading SampleCastle's).
 * HONEST CAVEAT (named up front): a slab triangulation has real interior holes (stair wells); a
 * room over a hole legitimately shows some uncovered cells — numbers reported raw, per room.
 * RUN: node poc_room_slab_leak_sc.js   (worktree root; needs /tmp/wt-xray-fixture-fix for the
 *      §G3-REVISED modules, which are not on main yet)
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
const XRAY = '/tmp/wt-xray-fixture-fix'; // branch fix/xray-fixture-classification @ 073336f modules
const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
const RealGeometry = require(path.join(XRAY, 'modeller', 'real_geometry.js'));
const RoomGraph = require(path.join(ROOT, 'common', 'room_graph.js'));

const RES = 0.25, Z_LO = -2, Z_HI = 1, ROT_TOL = 1e-3; // same constants as build_storey_walkable_raster.js

function sign(px, py, ax, ay, bx, by) { return (px - bx) * (ay - by) - (ax - bx) * (py - by); }
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by), d2 = sign(px, py, bx, by, cx, cy), d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0), hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}
function pointInRect(px, py, rc) { return px >= rc.x0 && px <= rc.x1 && py >= rc.y0 && py <= rc.y1; }

// ported verbatim from scripts/build_storey_walkable_raster.js slabTrianglesForStorey (073336f)
function slabTrianglesForStorey(dbQuery, geomIdx, storeyZ, log, tag) {
  let rows = [];
  try {
    rows = dbQuery("SELECT m.guid, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, " +
      "t.bbox_x, t.bbox_y FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid " +
      "WHERE m.ifc_class LIKE 'IfcSlab%' AND t.center_x IS NOT NULL AND t.center_z >= " + (storeyZ + Z_LO) +
      " AND t.center_z <= " + (storeyZ + Z_HI)) || [];
  } catch (e) { log('§LEAK_SLAB_ERR ' + e.message); }
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
      triangles.push([wx[f[i]], wy[f[i]], wx[f[i + 1]], wy[f[i + 1]], wx[f[i + 2]], wy[f[i + 2]]]);
    }
  });
  log('§LEAK_SLABS ' + tag + ' slabs=' + rows.length + ' resolved=' + resolved + ' unresolved=' + unresolved +
    ' tilted=' + tilted + ' triangles=' + triangles.length);
  return { triangles, fallbackRects };
}

async function measure(SQL, meshDb, building, out) {
  const S = m => { out.push(m); console.log(m); };
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'modeller', building + '_ARC.db'))));
  const dbQuery = (q) => { const r = db.exec(q); return r.length ? r[0].values : []; };
  const geomIdx = RealGeometry.buildGeometryIndex(db, meshDb);
  S('§LEAK_GEOM ' + building + ' table=' + geomIdx.table + ' guids=' + Object.keys(geomIdx.byGuid).length +
    ' resolvedHashes=' + Object.keys(geomIdx.resolved).length);
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const storeys = Array.from(new Set(graph.nodes.map(n => n.storey)));
  let leaky = 0, clean = 0;
  const leakRows = [];
  storeys.forEach(storey => {
    const roomsHere = graph.nodes.filter(n => n.storey === storey);
    const storeyZ = roomsHere.reduce((s, n) => s + n.cz, 0) / (roomsHere.length || 1);
    const { triangles, fallbackRects } = slabTrianglesForStorey(dbQuery, geomIdx, storeyZ, S, building + '/' + storey);
    const triBoxes = triangles.map(t => ({
      x0: Math.min(t[0], t[2], t[4]), x1: Math.max(t[0], t[2], t[4]),
      y0: Math.min(t[1], t[3], t[5]), y1: Math.max(t[1], t[3], t[5])
    }));
    const coveredAt = (px, py) => {
      for (let i = 0; i < fallbackRects.length; i++) if (pointInRect(px, py, fallbackRects[i])) return true;
      for (let i = 0; i < triangles.length; i++) {
        const b = triBoxes[i];
        if (px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1) continue;
        const t = triangles[i];
        if (pointInTriangle(px, py, t[0], t[1], t[2], t[3], t[4], t[5])) return true;
      }
      return false;
    };
    roomsHere.forEach(n => {
      let total = 0, outside = 0;
      n.rects.forEach(rc => {
        for (let px = rc.x0 + RES / 2; px < rc.x1; px += RES)
          for (let py = rc.y0 + RES / 2; py < rc.y1; py += RES) { total++; if (!coveredAt(px, py)) outside++; }
      });
      if (!total) return;
      const pct = 100 * outside / total;
      if (outside > 0) { leaky++; leakRows.push({ name: n.name, storey, total, outside, pct }); }
      else clean++;
    });
  });
  leakRows.sort((a, b) => b.pct - a.pct);
  leakRows.forEach(r => S('  §LEAK_ROOM ' + building + ' ' + r.name + ' storey="' + r.storey + '" cells=' +
    r.total + ' outsideSlab=' + r.outside + ' (' + r.pct.toFixed(1) + '%)'));
  S('§LEAK_RESULT ' + building + ' rooms=' + (leaky + clean) + ' fullyOnSlab=' + clean + ' anyLeak=' + leaky);
  db.close();
}

(async () => {
  const out = [];
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const meshDb = new initSql.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'modeller', 'mesh.db'))));
  await measure(initSql, meshDb, 'Duplex', out);        // ground-truth control FIRST (standing discipline)
  await measure(initSql, meshDb, 'SampleCastle', out);
  fs.writeFileSync(path.join(ROOT, 'poc_room_slab_leak_sc.log'), out.join('\n') + '\n');
  console.log('§POC-ROOM-SLAB-LEAK done — log: poc_room_slab_leak_sc.log');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
