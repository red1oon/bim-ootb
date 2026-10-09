// §VERT_WELD — M4 Phase A (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH M4): merge duplicate corners at DATA level.
// Look-neutral by construction: the viewer derives vertex normals (A.blobToGeometry -> computeVertexNormals, area-weighted sum of
// incident face normals). Two vertices at the same position whose DERIVED normals agree (cos >= COS_MIN) are merged; the merged
// vertex's incident-face sum is a+b with a||b||n, so its derived normal stays n. Never merges across a crease.
// Input/output are the raw blob layouts (vertices Float32 xyz, faces Uint32). One function, shared by probe + import + save.
(function (root) {
  var EPS = 0, COS_MIN = 0.999999, MIN_MAG = 1e-8;   // MIN_MAG: |cross| (=2*area, m^2) below which a vertex normal is sub-EPS noise (a position snap of EPS flips it)
  function weld(vArr, fArr) {
    var nv = vArr.length / 3, nf = fArr.length / 3, i, k;
    var acc = new Float64Array(nv * 3), mag = new Float64Array(nv);   // area-weighted normal sums (cross product, unnormalised = 2*area*n)
    for (i = 0; i < nf; i++) {
      var a = fArr[3*i], b = fArr[3*i+1], c = fArr[3*i+2];
      if (a >= nv || b >= nv || c >= nv) return null;
      var ux = vArr[3*b]-vArr[3*a], uy = vArr[3*b+1]-vArr[3*a+1], uz = vArr[3*b+2]-vArr[3*a+2];
      var wx = vArr[3*c]-vArr[3*a], wy = vArr[3*c+1]-vArr[3*a+1], wz = vArr[3*c+2]-vArr[3*a+2];
      var nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx;
      var m = Math.hypot(nx, ny, nz); mag[a]+=m; mag[b]+=m; mag[c]+=m;
      acc[3*a]+=nx; acc[3*a+1]+=ny; acc[3*a+2]+=nz; acc[3*b]+=nx; acc[3*b+1]+=ny; acc[3*b+2]+=nz; acc[3*c]+=nx; acc[3*c+1]+=ny; acc[3*c+2]+=nz;
    }
    var groups = new Map(), map = new Int32Array(nv), reps = [];   // reps: [{v, nx,ny,nz}]
    for (i = 0; i < nv; i++) {
      var l = Math.hypot(acc[3*i], acc[3*i+1], acc[3*i+2]) || 1;
      var n0 = acc[3*i]/l, n1 = acc[3*i+1]/l, n2 = acc[3*i+2]/l;
      var key = vArr[3*i] + ',' + vArr[3*i+1] + ',' + vArr[3*i+2];   // EXACT float32 equality: no position snap, so no triangle can change shape (a 1e-5 snap flipped 0.1 mm slivers, measured)
      var list = groups.get(key), hit = -1;
      // incoherent vertex (faces of differing normals = a crease / smooth-shaded mix) is never merged: a+b would change the mix
      var coherent = mag[i] > MIN_MAG && l / mag[i] >= COS_MIN;
      if (!coherent) { hit = reps.length; reps.push({ v: i, x: 2, y: 2, z: 2 }); map[i] = hit; continue; }
      if (list) for (k = 0; k < list.length; k++) { var r = reps[list[k]]; if (r.x*n0 + r.y*n1 + r.z*n2 >= COS_MIN) { hit = list[k]; break; } }
      if (hit < 0) { hit = reps.length; reps.push({ v: i, x: n0, y: n1, z: n2 }); if (list) list.push(hit); else groups.set(key, [hit]); }
      map[i] = hit;
    }
    var out = new Float32Array(reps.length * 3);
    for (i = 0; i < reps.length; i++) { out[3*i] = vArr[3*reps[i].v]; out[3*i+1] = vArr[3*reps[i].v+1]; out[3*i+2] = vArr[3*reps[i].v+2]; }
    var f2 = new Uint32Array(fArr.length);
    for (i = 0; i < fArr.length; i++) f2[i] = map[fArr[i]];
    return { vertices: out, faces: f2, before: nv, after: reps.length };
  }
  // per-triangle-corner derived normal (what computeVertexNormals would give) -> max angle delta between two indexed meshes
  function cornerNormals(vArr, fArr) {
    var nv = vArr.length / 3, nf = fArr.length / 3, acc = new Float64Array(nv * 3), mg = new Float64Array(nv), i;
    for (i = 0; i < nf; i++) {
      var a = fArr[3*i], b = fArr[3*i+1], c = fArr[3*i+2];
      var ux = vArr[3*b]-vArr[3*a], uy = vArr[3*b+1]-vArr[3*a+1], uz = vArr[3*b+2]-vArr[3*a+2];
      var wx = vArr[3*c]-vArr[3*a], wy = vArr[3*c+1]-vArr[3*a+1], wz = vArr[3*c+2]-vArr[3*a+2];
      var nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx;
      var mm = Math.hypot(nx, ny, nz); [a,b,c].forEach(function (q) { mg[q]+=mm; acc[3*q]+=nx; acc[3*q+1]+=ny; acc[3*q+2]+=nz; });
    }
    var res = new Float64Array(nf * 9);
    for (i = 0; i < nf; i++) for (var j = 0; j < 3; j++) { var q = fArr[3*i+j]; if (mg[q] < MIN_MAG) continue; var l = Math.hypot(acc[3*q], acc[3*q+1], acc[3*q+2]) || 1;
      res[9*i+3*j] = acc[3*q]/l; res[9*i+3*j+1] = acc[3*q+1]/l; res[9*i+3*j+2] = acc[3*q+2]/l; }
    return res;
  }
  function cornerNormalsNoop(){}
  function maxNormalDeltaDeg(v0, f0, v1, f1) {
    var A = cornerNormals(v0, f0), B = cornerNormals(v1, f1), m = 1;
    for (var i = 0; i < A.length; i += 3) { if ((A[i]===0&&A[i+1]===0&&A[i+2]===0) || (B[i]===0&&B[i+1]===0&&B[i+2]===0)) continue; /* ill-defined (cancelling) normal: skip */ var d = A[i]*B[i] + A[i+1]*B[i+1] + A[i+2]*B[i+2]; if (d < m) m = d; }
    return Math.acos(Math.min(1, m)) * 180 / Math.PI;
  }
  var api = { weld: weld, derive: cornerNormals, maxNormalDeltaDeg: maxNormalDeltaDeg, EPS: EPS, COS_MIN: COS_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VertexWeld = api;
})(typeof window !== 'undefined' ? window : globalThis);
