#!/usr/bin/env node
// §VERT_WELD probe — read-only, no browser/GPU. Spec: bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH M4 (Phase A).
// Usage: node --max-old-space-size=8192 scripts/probe_vertex_weld.js <db> [maxRows]   (opens the file read-only; writes nothing)
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb/node_modules/sql.js/dist/sql-asm.js'));
const VW = require('../viewer/vertex_weld.js');
(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(process.argv[2]));
  const cls = {};
  db.exec("SELECT i.geometry_hash, group_concat(DISTINCT m.ifc_class) FROM element_instances i JOIN elements_meta m ON m.guid=i.guid GROUP BY i.geometry_hash")[0].values.forEach(r => cls[r[0]] = r[1]);
  const st = db.prepare('SELECT geometry_hash, vertices, faces FROM component_geometries');
  const per = {}, T = { rows: 0, b: 0, a: 0, dbB: 0, dbA: 0, maxDeg: 0, skipped: 0 }, lim = +process.argv[3] || Infinity;
  while (st.step() && T.rows < lim) {
    const r = st.get(), vb = r[1], fb = r[2];
    if (!vb || !fb) continue;
    const v = new Float32Array(vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.byteLength));
    const f = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength));
    let t0 = process.hrtime.bigint(); const w = VW.weld(v, f); T.weldMs = (T.weldMs || 0) + Number(process.hrtime.bigint() - t0) / 1e6;
    if (w) { /* §VERT_WELD_BENCH: load-side CPU proxy = derive normals (what computeVertexNormals does) before vs after */
      t0 = process.hrtime.bigint(); VW.derive(v, f); T.dBefore = (T.dBefore || 0) + Number(process.hrtime.bigint() - t0) / 1e6;
      t0 = process.hrtime.bigint(); VW.derive(w.vertices, w.faces); T.dAfter = (T.dAfter || 0) + Number(process.hrtime.bigint() - t0) / 1e6; }
    if (!w) { T.skipped++; continue; }
    const deg = VW.maxNormalDeltaDeg(v, f, w.vertices, w.faces);
    T.rows++; T.b += w.before; T.a += w.after; T.dbB += vb.byteLength; T.dbA += w.vertices.byteLength; if (deg > T.maxDeg) T.maxDeg = deg;
    const c = cls[r[0]] || '(unmapped)', p = per[c] || (per[c] = { rows: 0, b: 0, a: 0 }); p.rows++; p.b += w.before; p.a += w.after;
  }
  console.log('§VERT_WELD db=' + path.basename(process.argv[2]) + ' rows=' + T.rows + ' skipped=' + T.skipped + ' vertsBefore=' + T.b + ' vertsAfter=' + T.a +
    ' dbBytesBefore=' + T.dbB + ' dbBytesAfter=' + T.dbA + ' (vertex blob only) maxNormalDeltaDeg=' + T.maxDeg.toExponential(2) + ' eps=' + VW.EPS + ' cos>=' + VW.COS_MIN);
  console.log('§VERT_WELD_BENCH weldMs=' + T.weldMs.toFixed(0) + ' deriveNormalsMsBefore=' + T.dBefore.toFixed(0) + ' deriveNormalsMsAfter=' + T.dAfter.toFixed(0) + ' (node CPU proxy; browser heapMB/loadMs witness still owed)');
  Object.entries(per).sort((x, y) => (y[1].b - y[1].a) - (x[1].b - x[1].a)).slice(0, 10)
    .forEach(([c, p]) => console.log('§VERT_WELD_CLASS ' + c + ' rows=' + p.rows + ' before=' + p.b + ' after=' + p.a + ' saved=' + (p.b - p.a)));
  console.log(T.rows === 0 || T.b === T.a ? '§VERT_WELD verdict=INCONCLUSIVE (nothing welded)' : '§VERT_WELD verdict=SAVED ' + (100 * (1 - T.a / T.b)).toFixed(1) + '%');
})();
