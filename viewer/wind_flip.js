// §WIND_FLIP (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§WIND_FLIP — SPEC", 2026-10-02) — ONE rule, two users:
// scene.js A.blobToGeometry (live, for imports / a DB without the baked table) and scripts/wind_flip_patch.js (bakes the
// geometry_wind_flip table into buildings/patches/<db>.sql, applied by A._applyPendingPatch). Same input both ways: viewer-space
// positions (x, z, -y of the DB blob) and the face index. Counts flipped-winding edges: an undirected edge (vertices welded at
// 0.1 mm) used by exactly 2 triangles in the SAME direction. RULE names the rule; a baked table whose rule differs is ignored.
(function (global) {
  var RULE = 'wf1:weld1e-4:pair2same';
  function count(positions, index) {
    var nv = positions.length / 3, wid = new Uint32Array(nv), wk = new Map();
    for (var v = 0; v < nv; v++) { var ks = Math.round(positions[v*3]*1e4) + ',' + Math.round(positions[v*3+1]*1e4) + ',' + Math.round(positions[v*3+2]*1e4);
      var w = wk.get(ks); if (w === undefined) { w = wk.size; wk.set(ks, w); } wid[v] = w; }
    var de = new Map(), nw = wk.size;
    function add(a, b) { var k = a * nw + b; de.set(k, (de.get(k) || 0) + 1); }
    for (var t = 0; t + 2 < index.length; t += 3) { var a = wid[index[t]], b = wid[index[t+1]], c = wid[index[t+2]];
      if (a === b || b === c || a === c) continue; add(a, b); add(b, c); add(c, a); }
    var flips = 0;
    de.forEach(function (n, k) { var a = Math.floor(k / nw), b = k - a * nw, r = de.get(b * nw + a) || 0;
      if (n === 2 && r === 0) flips++; });   // each such undirected edge is seen once (its reverse is absent)
    return flips;
  }
  // viewer-space positions from a DB vertex blob (Float32 x,y,z -> x, z, -y), same swap as A.blobToGeometry
  function fromBlob(vArr) { var p = new Float32Array(vArr.length); for (var i = 0; i < vArr.length; i += 3) { p[i] = vArr[i]; p[i+1] = vArr[i+2]; p[i+2] = -vArr[i+1]; } return p; }
  var api = { RULE: RULE, count: count, fromBlob: fromBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.WindFlip = api;
})(typeof window !== 'undefined' ? window : this);
