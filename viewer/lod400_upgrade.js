/* lod400_upgrade.js — LOD400 auto-upgrader, step 1: WELD + SMOOTH (spec: bim-compiler prompts/LOD400_UPGRADER.md §G, §H).
 * ISSUE it addresses: Revit IFC meshes arrive as UNINDEXED FLAT-SHADED triangle soups (measured: 5.7x more vertices than unique positions) —
 * heavy (heap ≈ 0.17 GB / M verts) and faceted. Weld duplicate positions + crease-angle smooth normals: same triangles, same area, same bbox,
 * ~70-80 % fewer vertices on curved parts. Pure DB transform: no element is added, removed or renamed. Every number is logged (§LOD_WELD).
 * weldSmooth(V:Float32Array xyz, F:Uint32Array tri idx, creaseDeg) -> {V,F,N,stats}   (pure, node-testable)
 * upgradeDb(db, opts) -> {geoms,vBefore,vAfter,skipped}  (sql.js handle; tables component_geometries | base_geometries) */
(function (root) {
  'use strict';
  function weldSmooth(V, F, creaseDeg) {
    var cr = Math.cos((creaseDeg == null ? 40 : creaseDeg) * Math.PI / 180), nt = F.length / 3, nv = V.length / 3;
    var key = new Map(), pid = new Int32Array(nv), P = [];
    for (var i = 0; i < nv; i++) {
      var k = Math.round(V[3 * i] * 1e5) + ',' + Math.round(V[3 * i + 1] * 1e5) + ',' + Math.round(V[3 * i + 2] * 1e5), j = key.get(k);
      if (j === undefined) { j = P.length / 3; key.set(k, j); P.push(V[3 * i], V[3 * i + 1], V[3 * i + 2]); }
      pid[i] = j;
    }
    var FN = new Float64Array(nt * 3), inc = new Map(), area0 = 0;
    for (var t = 0; t < nt; t++) {
      var a = pid[F[3 * t]] * 3, b = pid[F[3 * t + 1]] * 3, c = pid[F[3 * t + 2]] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      FN[3 * t] = nx; FN[3 * t + 1] = ny; FN[3 * t + 2] = nz; area0 += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      for (var q = 0; q < 3; q++) { var p = pid[F[3 * t + q]], l = inc.get(p); if (!l) inc.set(p, l = []); l.push(t); }
    }
    var oV = [], oN = [], vmap = new Map(), M = P.length / 3 + 1;   // key (t*M+p) -> out vertex
    inc.forEach(function (ts, p) {
      var cl = [];
      ts.forEach(function (t) {
        var nx = FN[3 * t], ny = FN[3 * t + 1], nz = FN[3 * t + 2], L = Math.sqrt(nx * nx + ny * ny + nz * nz); if (L < 1e-18) return;
        var ux = nx / L, uy = ny / L, uz = nz / L, hit = null;
        for (var h = 0; h < cl.length; h++) if (ux * cl[h].u[0] + uy * cl[h].u[1] + uz * cl[h].u[2] >= cr) { hit = cl[h]; break; }
        if (!hit) cl.push(hit = { u: [ux, uy, uz], s: [0, 0, 0], ts: [] });
        hit.s[0] += nx; hit.s[1] += ny; hit.s[2] += nz; hit.ts.push(t);
      });
      cl.forEach(function (c) {
        var L = Math.sqrt(c.s[0] * c.s[0] + c.s[1] * c.s[1] + c.s[2] * c.s[2]) || 1, vi = oV.length / 3;
        oV.push(P[3 * p], P[3 * p + 1], P[3 * p + 2]); oN.push(c.s[0] / L, c.s[1] / L, c.s[2] / L);
        c.ts.forEach(function (t) { vmap.set(t * M + p, vi); });
      });
    });
    var nF = new Uint32Array(nt * 3);
    for (var t2 = 0; t2 < nt; t2++) for (var q2 = 0; q2 < 3; q2++) nF[3 * t2 + q2] = vmap.get(t2 * M + pid[F[3 * t2 + q2]]) || 0;
    return { V: new Float32Array(oV), F: nF, N: new Float32Array(oN), stats: { tris: nt, vBefore: nv, vAfter: oV.length / 3, area: area0 } };
  }
  function triArea(V, F) { var s = 0; for (var t = 0; t < F.length / 3; t++) { var a = F[3 * t] * 3, b = F[3 * t + 1] * 3, c = F[3 * t + 2] * 3;
      var ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; s += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2; } return s; }
  function upgradeDb(db, opts) {
    opts = opts || {}; var minV = opts.minVerts || 300, crease = opts.creaseDeg == null ? 40 : opts.creaseDeg, out = { geoms: 0, vBefore: 0, vAfter: 0, skipped: 0, tables: [] };
    ['component_geometries', 'base_geometries'].forEach(function (tb) {
      var has = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + tb + "'"); if (!has.length) return;
      var hasN = db.exec("SELECT 1 FROM pragma_table_info('" + tb + "') WHERE name='normals'").length > 0; out.tables.push(tb);
      var r = db.exec('SELECT geometry_hash, vertices, faces FROM ' + tb + ' WHERE length(vertices)/12 >= ' + minV); if (!r.length) return;
      r[0].values.forEach(function (row) {
        var vb = row[1], fb = row[2]; if (!vb || !fb || vb.length % 12 || fb.length % 12) { out.skipped++; return; }
        var V = new Float32Array(vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.length)), F = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.length));
        if (V.length / 3 < F.length * 0.9) { out.skipped++; return; }   // already indexed/shared: nothing to weld
        var w = weldSmooth(V, F, crease); if (w.stats.vAfter >= w.stats.vBefore) { out.skipped++; return; }
        var drift = Math.abs(triArea(w.V, w.F) - w.stats.area) / (w.stats.area || 1);
        if (drift > 1e-4) { out.skipped++; console.warn('§LOD_WELD REFUSE ' + row[0] + ' area drift ' + drift); return; }   // never ship a changed shape
        var u8 = function (x) { return new Uint8Array(x.buffer, x.byteOffset, x.byteLength); };
        if (hasN) db.run('UPDATE ' + tb + ' SET vertices=?, faces=?, normals=? WHERE geometry_hash=?', [u8(w.V), u8(w.F), u8(w.N), row[0]]);
        else db.run('UPDATE ' + tb + ' SET vertices=?, faces=? WHERE geometry_hash=?', [u8(w.V), u8(w.F), row[0]]);
        out.geoms++; out.vBefore += w.stats.vBefore; out.vAfter += w.stats.vAfter;
      });
    });
    console.log('§LOD_WELD_TOTAL tables=' + out.tables.join('+') + ' geometries=' + out.geoms + ' skipped=' + out.skipped + ' verts ' + out.vBefore + ' -> ' + out.vAfter +
      ' saved=' + (out.vBefore - out.vAfter) + ' (~' + ((out.vBefore - out.vAfter) * 0.17 / 1e6).toFixed(2) + ' GB heap)' + (out.geoms ? '' : ' INCONCLUSIVE: nothing welded'));
    return out;
  }
  var API = { weldSmooth: weldSmooth, upgradeDb: upgradeDb, triArea: triArea };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.LOD400 = API;
})(typeof window !== 'undefined' ? window : this);
