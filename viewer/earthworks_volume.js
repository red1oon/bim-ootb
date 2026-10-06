// §EW_VOLUME_SURFACE / §EARTHWORKS_VOLUME — the ONE owner of the earthworks volume (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md).
// Pure (no APP, no DOM): the Alt+C card (cpe_road_panels.js), model_check_report.html and boq_charts.html all call this; none computes it.
(function () {
'use strict';
  // §EARTHWORKS_VOLUME (spec 2026-10-06; bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md, queue item 3 + user ruling "option a").
  // V = |sum of signed tetra volumes| of the EARTHWORK solid's triangles. Rigid motion (stored rotation, the blob's Y/Z axis swap) keeps
  // volume, so the blob's own coordinates are used; element_transforms holds no scale.
  // Weld bit-identical positions (the blob repeats vertices), drop zero-area index-collapsed triangles. Edge census: each undirected edge
  //   used n times; open = n==1, nonManifold = n>2, wrongWay = n==2 but both uses in the SAME direction. E = open + nonManifold.
  // VERDICT per element:
  //   EXACT        closed (open = nonManifold = wrongWay = 0)           -> "N m3"
  //   APPROXIMATE  wrongWay == 0, not closed, B < V                     -> "≈ V m3 (E open edges, ±B m3)"
  //   INCONCLUSIVE wrongWay > 0, or B >= V, or no triangles              -> "not measurable", NO number
  // V = signed sum with the mesh's own BBOX CENTRE (all stored vertices) as origin. B = max |V(o) - V| over a FIXED set of origin shifts
  //   s from that centre (14): the 8 bbox corners (±hx,±hy,±hz, h = half extent) and ±5000 m on each axis; measured every time, never a
  //   constant. A closed surface is origin-independent (B = 0 up to rounding); an open one is not, and B states how much.
  //   Closed form: V(o) = V0 - o.S/6, S = sum(a x b + b x c + c x a) (the quadratic terms vanish) — the independent numpy witness
  //   instead re-translates every vertex and re-sums, so the two share no code path.
  // Several EARTHWORK elements: V and B and E add; any INCONCLUSIVE -> INCONCLUSIVE; any APPROXIMATE -> APPROXIMATE.
  function meshSolidVolume(vArr, fArr) {
    var nV = Math.floor(vArr.length / 3), nT = Math.floor(fArr.length / 3), map = new Map(), id = new Int32Array(nV), nU = 0, i;
    var f32 = new Float32Array(3), u32 = new Uint32Array(f32.buffer), U = [];
    var lo3 = [Infinity, Infinity, Infinity], hi3 = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < nV; i++) {
      f32[0] = vArr[3 * i]; f32[1] = vArr[3 * i + 1]; f32[2] = vArr[3 * i + 2];
      for (var d = 0; d < 3; d++) { if (f32[d] < lo3[d]) lo3[d] = f32[d]; if (f32[d] > hi3[d]) hi3[d] = f32[d]; }
      var k = u32[0] + ',' + u32[1] + ',' + u32[2], g = map.get(k);
      if (g === undefined) { g = nU++; map.set(k, g); U.push(f32[0], f32[1], f32[2]); }
      id[i] = g;
    }
    var cen = [(lo3[0] + hi3[0]) / 2, (lo3[1] + hi3[1]) / 2, (lo3[2] + hi3[2]) / 2], hal = [(hi3[0] - lo3[0]) / 2, (hi3[1] - lo3[1]) / 2, (hi3[2] - lo3[2]) / 2];
    var edges = new Map(), signed = 0, Sx = 0, Sy = 0, Sz = 0, tris = 0, collapsed = 0, t, j;
    for (t = 0; t < nT; t++) {
      var a = id[fArr[3 * t]], b = id[fArr[3 * t + 1]], c = id[fArr[3 * t + 2]];
      if (a === b || b === c || a === c) { collapsed++; continue; }
      tris++;
      var ax = U[3 * a] - cen[0], ay = U[3 * a + 1] - cen[1], az = U[3 * a + 2] - cen[2], bx = U[3 * b] - cen[0], by = U[3 * b + 1] - cen[1], bz = U[3 * b + 2] - cen[2],
          cx = U[3 * c] - cen[0], cy = U[3 * c + 1] - cen[1], cz = U[3 * c + 2] - cen[2];
      var abx = ay * bz - az * by, aby = az * bx - ax * bz, abz = ax * by - ay * bx,   // a x b
          bcx = by * cz - bz * cy, bcy = bz * cx - bx * cz, bcz = bx * cy - by * cx,   // b x c
          cax = cy * az - cz * ay, cay = cz * ax - cx * az, caz = cx * ay - cy * ax;   // c x a
      signed += ax * bcx + ay * bcy + az * bcz;                                         // a . (b x c)
      Sx += abx + bcx + cax; Sy += aby + bcy + cay; Sz += abz + bcz + caz;
      var tri = [a, b, c];
      for (j = 0; j < 3; j++) {
        var p = tri[j], q = tri[(j + 1) % 3], lo = p < q ? p : q, hi = p < q ? q : p, ek = lo * 4294967296 + hi, e = edges.get(ek);
        if (!e) { e = [0, 0]; edges.set(ek, e); }
        e[p < q ? 0 : 1]++;
      }
    }
    var open = 0, nonManifold = 0, wrongWay = 0;
    edges.forEach(function (e) { var n = e[0] + e[1];
      if (n === 1) open++; else if (n !== 2) nonManifold++; else if (e[0] !== 1) wrongWay++; });
    var closed = tris > 0 && open === 0 && nonManifold === 0 && wrongWay === 0;
    var V0 = signed / 6, shifts = [], sx, sy, sz, ax3 = [0, 1, 2], sgn = [-1, 1];
    for (var ix = 0; ix < 2; ix++) for (var iy = 0; iy < 2; iy++) for (var iz = 0; iz < 2; iz++) shifts.push([sgn[ix] * hal[0], sgn[iy] * hal[1], sgn[iz] * hal[2]]);
    ax3.forEach(function (d2) { sgn.forEach(function (sg) { var v = [0, 0, 0]; v[d2] = sg * 5000; shifts.push(v); }); });
    var B = 0;
    shifts.forEach(function (sh) { var Vs = V0 - (sh[0] * Sx + sh[1] * Sy + sh[2] * Sz) / 6; B = Math.max(B, Math.abs(Vs - V0)); });
    var Vabs = Math.abs(V0), E = open + nonManifold, verdict;
    if (tris === 0 || wrongWay > 0) verdict = 'INCONCLUSIVE';
    else if (closed) verdict = 'EXACT';
    else verdict = B >= Vabs ? 'INCONCLUSIVE' : 'APPROXIMATE';
    return { tris: tris, collapsed: collapsed, verts: nV, uniqueVerts: nU, edges: edges.size, openEdges: open, nonManifoldEdges: nonManifold,
             wrongWayEdges: wrongWay, closed: closed, signedSum: V0, V: Vabs, B: B, E: E, nShifts: shifts.length, verdict: verdict,
             volume: closed ? Vabs : null };
  }
  // the EARTHWORK elements of the open model -> one verdict (see above). None -> VACUOUS.
  // measure(query, libQuery): query(sql, params) -> array of row arrays (sql.js exec shape). libQuery optional (shared library DB).
  function measure(query, libQuery) {
    var rows = []; try { rows = query("SELECT m.guid, i.geometry_hash FROM elements_meta m JOIN element_instances i ON i.guid = m.guid WHERE m.discipline = 'EARTHWORK' AND i.geometry_hash IS NOT NULL") || []; } catch (e) {}
    var r = { n: rows.length, elements: [], V: null, B: null, E: 0, total: null, verdict: 'VACUOUS' };
    if (rows.length) {
      var anyInc = false, anyApprox = false, sumV = 0, sumB = 0;
      rows.forEach(function (row) {
        var g = []; try { g = query('SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?', [row[1]]) || []; } catch (e) {}
        if (!g.length && libQuery) { try { g = libQuery('SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?', [row[1]]) || []; } catch (e2) {} }
        var vb = g.length && g[0][0], fb = g.length && g[0][1], m;
        if (!vb || !fb) { m = { guid: row[0], closed: false, volume: null, noMesh: true, verdict: 'INCONCLUSIVE', E: 0 }; anyInc = true; }
        else {
          m = meshSolidVolume(new Float32Array(vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.byteLength)), new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength)));
          m.guid = row[0];
          if (m.verdict === 'INCONCLUSIVE') anyInc = true; else { sumV += m.V; sumB += m.B; if (m.verdict === 'APPROXIMATE') anyApprox = true; }
        }
        r.E += m.E || 0; r.elements.push(m);
        console.log('§EARTHWORKS_VOLUME guid=' + row[0] + ' tris=' + m.tris + ' uniqueVerts=' + m.uniqueVerts + ' openEdges=' + m.openEdges + ' nonManifoldEdges=' + m.nonManifoldEdges +
          ' wrongWayEdges=' + m.wrongWayEdges + ' E=' + m.E + ' V_m3=' + (m.V != null ? m.V.toFixed(3) : 'NA') + ' B_m3=' + (m.B != null ? m.B.toFixed(3) : 'NA') +
          ' shifts=' + m.nShifts + '(8 bbox corners from centre + ±5000 m per axis) origin=bbox-centre verdict=' + m.verdict);
      });
      r.verdict = anyInc ? 'INCONCLUSIVE' : (anyApprox ? 'APPROXIMATE' : 'EXACT');
      if (!anyInc) { r.V = sumV; r.B = sumB; if (r.verdict === 'EXACT') r.total = sumV; }
    }
    console.log('§EARTHWORKS_VOLUME verdict=' + r.verdict + ' elements=' + r.n + ' E=' + r.E + (r.V != null ? ' V_m3=' + r.V.toFixed(3) + ' B_m3=' + r.B.toFixed(3) : ' (NO NUMBER SHOWN)'));
    return r;
  }
  // §EW_VOLUME_SURFACE: the ONE formatter every surface shows. null for a model with no EARTHWORK body (buildings).
  function line(ev) {
    if (!ev || !ev.n) return null;
    if (ev.verdict === 'EXACT') return Math.round(ev.V).toLocaleString('en-US') + ' m³';
    if (ev.verdict === 'APPROXIMATE') return '≈ ' + Math.round(ev.V).toLocaleString('en-US') + ' m³ (' + ev.E + ' open edges, ±' + (Math.ceil(ev.B * 10) / 10).toFixed(1) + ' m³)';
    return 'not measurable — surface open (' + ev.E + ' edges)';
  }
  // sql.js Database -> measure(): the adapter the report and 4D/5D pages use (they have no APP).
  function measureSqlJs(db) {
    function qq(sql, p) { var st = db.prepare(sql), o = []; try { if (p && p.length) st.bind(p); while (st.step()) o.push(st.get()); } finally { st.free(); } return o; }
    return measure(qq, null);
  }
  var api = { meshSolidVolume: meshSolidVolume, measure: measure, line: line, measureSqlJs: measureSqlJs };
  if (typeof window !== 'undefined') window.EarthworksVolume = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
