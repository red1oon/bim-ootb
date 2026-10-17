#!/usr/bin/env node
// ⚠ DO NOT REMOVE — fixture for W-E2E-DXF-WING: a Node-schema model .db with the whole building rotated by ANGLE deg about the centre of its walls (synthetic, stated).
// Rotation = std2d.rotateModel on the loaded model, written back: element_world_bbox, element_transforms centre, mesh vertices (once per geometry_hash), door_operation axes.
// Usage: node make_rotated_db.js <in.db> <out.db> [ANGLE=30] [dir holding better-sqlite3]
'use strict';
const fs = require('fs'), path = require('path');
const [inDb, outDb, ang = '30', nm = path.join(process.env.HOME, 'bim-compiler/node_modules')] = process.argv.slice(2);
const Database = require(path.join(nm, 'better-sqlite3')), S = require(path.join(__dirname, '..', 'dxf2bim', 'std2d.js'));
fs.copyFileSync(inDb, outDb);
const db = new Database(outDb), q = sql => db.prepare(sql).all(), A = Number(ang);
const M = S.loadModel(q, { add() {}, gap() {} }), w = M.walls, ox = (Math.min(...w.map(a => a.x0)) + Math.max(...w.map(a => a.x1))) / 2, oy = (Math.min(...w.map(a => a.y0)) + Math.max(...w.map(a => a.y1))) / 2;
S.rotateModel(M, A, ox, oy);
const inst = {}; q('SELECT guid, geometry_hash h FROM element_instances').forEach(r => { inst[r.guid] = r.h; });
const updB = db.prepare('UPDATE element_world_bbox SET minX=?, maxX=?, minY=?, maxY=? WHERE guid=?'), updC = db.prepare('UPDATE element_transforms SET center_x=?, center_y=? WHERE guid=?'), updG = db.prepare('UPDATE component_geometries SET vertices=? WHERE geometry_hash=?');
const doneG = new Set(); let nb = 0, ng = 0;
db.transaction(() => {
  M.els.forEach(e => {
    updB.run(e.x0, e.x1, e.y0, e.y1, e.guid); updC.run(e.c[0], e.c[1], e.guid); nb++;
    const h = inst[e.guid]; if (h && e.v.length && !doneG.has(h)) { doneG.add(h); updG.run(Buffer.from(e.v.buffer, e.v.byteOffset, e.v.byteLength), h); ng++; }
  });
  const updD = db.prepare('UPDATE door_operation SET x_axis=?, y_axis=?, z_axis=? WHERE guid=?');
  Object.keys(M.door_ops).forEach(g => { const d = M.door_ops[g]; updD.run(d.x ? JSON.stringify(d.x) : null, d.y ? JSON.stringify(d.y) : null, d.z ? JSON.stringify(d.z) : null, g); });
})();
console.log(`rotated ${nb} elements, ${ng} meshes by ${A} deg about (${ox.toFixed(4)}, ${oy.toFixed(4)}) -> ${outDb}`);
