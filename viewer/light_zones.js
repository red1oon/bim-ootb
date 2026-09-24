// ══ §LIGHT_ZONE — light zones from the building's own geometry (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SOURCED_LIGHT — BUILD LOG + SPEC CHANGE", gated by red1-4b 2026-09-25) ══
// red1: "light cannot leak through walls in real life except through glass." Room rects cannot carry this (0 of 2275
// fixtures fall in a compiled room, fleet-wide), so the zones come from the geometry: voxelise the room-boundary classes
// (walls, slabs, roofs, ceilings, closed doors, glazing) at CELL m, flood-fill the empty cells 6-connected. The
// component touching the grid edge is OUTSIDE (zone 0: unbound, lit as today); every other component is one light zone.
// A doorless opening, an atrium or a stairwell is connected empty space, so it is one zone with no room data at all.
// Grid space = the THREE scene (the same space as the lamps and portals). Built once per building and cached.
(function (global) {
  var CELL = 0.5, SOLID = 65535;
  var BOUNDARY = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcRoof', 'IfcCovering', 'IfcDoor', 'IfcWindow', 'IfcCurtainWall', 'IfcPlate'];
  var cache = null;

  function boundaryGuids(A) {
    var s = new Set();
    try { A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN ('" + BOUNDARY.join("','") + "')").forEach(function (r) { s.add(r[0]); }); } catch (e) {}
    return s;
  }

  // Every boundary draw: { geo, matrix, start, count } in world space. Instanced/plain meshes carry ifcClass per mesh;
  // a BatchedMesh carries one element per instance (guidMap[bm.id + '_' + i]).
  function boundaryDraws(A, THREE, guids) {
    var out = [], cls = new Set(BOUNDARY), stats = { mesh: 0, inst: 0, batched: 0, skippedHidden: 0 };
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.geometry) return;
      if (o === A.ground || o === A._sky || (o.userData && (o.userData.skyPortal || o.userData.excludeFromShadow))) return;
      o.updateMatrixWorld();
      var g = o.geometry, idx = g.index, full = idx ? idx.count : (g.attributes.position ? g.attributes.position.count : 0);
      if (o.isBatchedMesh) {
        var n = (typeof o.instanceCount === 'number') ? o.instanceCount : (o._instanceInfo ? o._instanceInfo.length : 0);
        for (var i = 0; i < n; i++) {
          var gd = A.guidMap[o.id + '_' + i]; if (!gd || !guids.has(gd)) continue;
          var gid, rng; try { gid = o.getGeometryIdAt(i); rng = o.getGeometryRangeAt(gid); } catch (e) { continue; }
          if (!rng) continue;
          var m = new THREE.Matrix4(); o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
          out.push({ geo: g, matrix: m, start: idx ? rng.indexStart : rng.vertexStart, count: idx ? rng.indexCount : rng.vertexCount }); stats.batched++;
        }
        return;
      }
      if (!cls.has(o.userData && o.userData.ifcClass)) return;
      if (o.isInstancedMesh) {
        for (var k = 0; k < o.count; k++) { var mi = new THREE.Matrix4(); o.getMatrixAt(k, mi); if (mi.elements[0] === 0 && mi.elements[5] === 0 && mi.elements[10] === 0) continue;
          mi.premultiply(o.matrixWorld); out.push({ geo: g, matrix: mi, start: 0, count: full }); stats.inst++; }
      } else { out.push({ geo: g, matrix: o.matrixWorld.clone(), start: 0, count: full }); stats.mesh++; }
    });
    return { draws: out, stats: stats };
  }

  function build(A, opts) {
    var THREE = global.THREE; opts = opts || {};
    if (cache && cache.bld === A.activeBuilding && cache.n === Object.keys(A.guidMap || {}).length && !opts.force) return cache;
    var t0 = performance.now(), guids = boundaryGuids(A), bd = boundaryDraws(A, THREE, guids), draws = bd.draws;
    // bounds from the boundary geometry (skyline props / ground excluded by construction)
    var box = new THREE.Box3(), tb = new THREE.Box3();
    draws.forEach(function (d) { if (!d.geo.boundingBox) d.geo.computeBoundingBox(); tb.copy(d.geo.boundingBox).applyMatrix4(d.matrix); box.union(tb); });
    if (box.isEmpty()) { console.log('§LIGHT_ZONE bld=' + A.activeBuilding + ' VACUOUS no boundary geometry (guids=' + guids.size + ')'); return null; }
    var org = box.min.clone().subScalar(CELL * 2), size = box.getSize(new THREE.Vector3()).addScalar(CELL * 4);
    var nx = Math.ceil(size.x / CELL), ny = Math.ceil(size.y / CELL), nz = Math.ceil(size.z / CELL), N = nx * ny * nz;
    var zone = new Uint16Array(N), nxy = nx * ny;
    function cellIdx(x, y, z) { var i = Math.floor((x - org.x) / CELL), j = Math.floor((y - org.y) / CELL), k = Math.floor((z - org.z) / CELL);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1; return i + j * nx + k * nxy; }
    // rasterise: sample each triangle on a barycentric grid no coarser than CELL/2 (conservative enough for 0.1 m walls)
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tris = 0, samples = 0, step = CELL / 2;
    var tRas = performance.now();
    draws.forEach(function (d) {
      var pos = d.geo.attributes.position, ix = d.geo.index, e = d.matrix.elements;
      for (var t = d.start; t + 2 < d.start + d.count; t += 3) {
        var i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(d.matrix); b.fromBufferAttribute(pos, i1).applyMatrix4(d.matrix); c.fromBufferAttribute(pos, i2).applyMatrix4(d.matrix);
        var L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), n = Math.max(1, Math.ceil(L / step)); tris++;
        for (var u = 0; u <= n; u++) for (var v = 0; v <= n - u; v++) {
          var w = n - u - v, x = (a.x * u + b.x * v + c.x * w) / n, y = (a.y * u + b.y * v + c.y * w) / n, z = (a.z * u + b.z * v + c.z * w) / n;
          var ci = cellIdx(x, y, z); if (ci >= 0) zone[ci] = SOLID; samples++;
        }
      }
    });
    var rasMs = performance.now() - tRas;
    // EARTH: below the ground plane the grid's edge is soil, not open air. Without this the interior leaked out through
    // a slab opening into the under-slab void and out of the grid's floor (Hospital café, 2026-09-25 leak trace). Only
    // the edge ring + bottom layer below ground are made solid, so a basement stays empty space (its own zone).
    var gy = (A.ground && isFinite(A.ground.position.y)) ? A.ground.position.y : null, earth = 0;
    if (gy != null) { var jg = Math.min(ny, Math.max(0, Math.floor((gy - org.y) / CELL)));
      for (var kk = 0; kk < nz; kk++) for (var jj = 0; jj < jg; jj++) for (var ii = 0; ii < nx; ii++) {
        if (jj < 2 || ii < 2 || kk < 2 || ii >= nx - 2 || kk >= nz - 2) { var ce = ii + jj * nx + kk * nxy; if (zone[ce] !== SOLID) { zone[ce] = SOLID; earth++; } } } }
    // flood fill, 6-connected; label 1 = outside (grid edge) is written as 0 at the end
    var q = new Int32Array(N), label = 1, sizes = [0], solid = 0;
    for (var s0 = 0; s0 < N; s0++) if (zone[s0] === SOLID) solid++;
    function fill(seed, lab) {
      var h = 0, tl = 0, cnt = 0; q[tl++] = seed; zone[seed] = lab;
      while (h < tl) { var p = q[h++]; cnt++; var i = p % nx, j = ((p / nx) | 0) % ny, k = (p / nxy) | 0;
        if (i > 0 && zone[p - 1] === 0) { zone[p - 1] = lab; q[tl++] = p - 1; } if (i < nx - 1 && zone[p + 1] === 0) { zone[p + 1] = lab; q[tl++] = p + 1; }
        if (j > 0 && zone[p - nx] === 0) { zone[p - nx] = lab; q[tl++] = p - nx; } if (j < ny - 1 && zone[p + nx] === 0) { zone[p + nx] = lab; q[tl++] = p + nx; }
        if (k > 0 && zone[p - nxy] === 0) { zone[p - nxy] = lab; q[tl++] = p - nxy; } if (k < nz - 1 && zone[p + nxy] === 0) { zone[p + nxy] = lab; q[tl++] = p + nxy; } }
      return cnt;
    }
    // OUTSIDE, with doorways closed. Real models have unfilled openings to the outdoors — Hospital's front entry is a
    // curtain-wall bay with no panel and no door, its roof plant room an IfcOpeningElement with no door (2026-09-25 leak
    // traces) — and one such hole floods a whole building to "outside". So outside is found on a copy of the grid with
    // the solids grown by CLOSE_R cells (openings narrower than (2*CLOSE_R+1)*CELL = 4.5 m are shut (Hospital front entry: 3.6 m, two panel-less curtain-wall bays, no door modelled), like the closed
    // doors), then grown back CLOSE_R+1 cells into the real empty space (a doorway's own cells). Interior zones are then
    // labelled on the UNgrown grid, so a doorless opening between two rooms still joins them.
    var CLOSE_R = (typeof A._lightZoneCloseR === "number") ? A._lightZoneCloseR : 4, S = new Uint8Array(N), D = new Uint8Array(N), T = new Uint8Array(N), OUT = new Uint8Array(N);
    for (var c0 = 0; c0 < N; c0++) S[c0] = zone[c0] === SOLID ? 1 : 0;
    function dil(src, dst, stride, len) {   // box max of radius CLOSE_R along one axis
      for (var c = 0; c < N; c++) { var pos = ((c / stride) | 0) % len, v = 0;
        for (var o = -CLOSE_R; o <= CLOSE_R && !v; o++) { var pp = pos + o; if (pp >= 0 && pp < len && src[c + o * stride]) v = 1; } dst[c] = v; } }
    dil(S, T, 1, nx); dil(T, D, nx, ny); dil(D, T, nxy, nz); var DD = T;   // DD = solids grown in x, y, z
    var outN = 0, h0 = 0, t0q = 0;
    function isEdge(c) { var i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0; return i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1; }
    for (var ke = 0; ke < nz; ke++) for (var je = 0; je < ny; je++) for (var ie = 0; ie < nx; ie++) {
      if (!(ie === 0 || je === 0 || ke === 0 || ie === nx - 1 || je === ny - 1 || ke === nz - 1)) { if (ie === 1) ie = nx - 2; continue; }
      var ce0 = ie + je * nx + ke * nxy; if (!DD[ce0] && !OUT[ce0]) { OUT[ce0] = 1; q[t0q++] = ce0; } }
    function nbrs(c, f) { var i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      if (i > 0) f(c - 1); if (i < nx - 1) f(c + 1); if (j > 0) f(c - nx); if (j < ny - 1) f(c + nx); if (k > 0) f(c - nxy); if (k < nz - 1) f(c + nxy); }
    while (h0 < t0q) { var cc = q[h0++]; nbrs(cc, function (d) { if (!OUT[d] && !DD[d]) { OUT[d] = 1; q[t0q++] = d; } }); }
    // grow back into the real empty space, CLOSE_R+1 steps
    var front = [], nf; for (var cf = 0; cf < t0q; cf++) front.push(q[cf]);
    for (var step = 0; step <= CLOSE_R; step++) { nf = []; front.forEach(function (c) { nbrs(c, function (d) { if (!OUT[d] && !S[d]) { OUT[d] = 1; nf.push(d); } }); }); front = nf; }
    for (var co = 0; co < N; co++) if (OUT[co] && zone[co] === 0) { zone[co] = 1; outN++; }
    var closedOpenings = 0; for (var cz = 0; cz < N; cz++) if (!S[cz] && DD[cz] && !OUT[cz]) closedOpenings++;
    var DBG = opts.debug ? DD : null; S = D = OUT = null;
    sizes.push(outN);
    // INTERIOR SPLIT (measured option, A._lightZoneInnerR, default 0 = the gated spec: every connected space is one zone).
    // With INNER_R > 0 the zones are seeded on a grid whose solids are grown by INNER_R cells (openings narrower than
    // (2*INNER_R+1)*CELL close, like doors), then every remaining empty cell takes the label of the nearest seed through
    // real empty space (multi-source BFS). Hospital, 2026-09-25: one zone held 68% of the indoor volume.
    var INNER_R = (typeof A._lightZoneInnerR === 'number') ? A._lightZoneInnerR : 0;
    if (INNER_R > 0) {
      var SI = new Uint8Array(N), T1 = new Uint8Array(N), T2 = new Uint8Array(N);
      for (var ci1 = 0; ci1 < N; ci1++) SI[ci1] = zone[ci1] === SOLID ? 1 : 0;
      var saveR = CLOSE_R; CLOSE_R = INNER_R; dil(SI, T1, 1, nx); dil(T1, T2, nx, ny); dil(T2, T1, nxy, nz); CLOSE_R = saveR;
      for (var ci2 = 0; ci2 < N; ci2++) if (zone[ci2] === 0 && T1[ci2]) zone[ci2] = SOLID - 1;   // provisional: grown-away empty cell
      for (var s1 = 0; s1 < N; s1++) if (zone[s1] === 0) { label++; if (label >= SOLID - 1) { console.warn('§LIGHT_ZONE zone ids exhausted'); break; } sizes.push(fill(s1, label)); }
      // regrow labels into the provisional cells
      var qh = 0, qt = 0; for (var c3 = 0; c3 < N; c3++) { var zv = zone[c3]; if (zv > 1 && zv < SOLID - 1) q[qt++] = c3; }
      while (qh < qt) { var c4 = q[qh++], lab4 = zone[c4]; nbrs(c4, function (d) { if (zone[d] === SOLID - 1) { zone[d] = lab4; sizes[lab4]++; q[qt++] = d; } }); }
      for (var c5 = 0; c5 < N; c5++) if (zone[c5] === SOLID - 1) zone[c5] = 0;   // isolated leftovers: labelled below
      SI = T1 = T2 = null;
    }
    for (var s = 0; s < N; s++) if (zone[s] === 0) { label++; if (label >= SOLID) { console.warn('§LIGHT_ZONE zone ids exhausted'); break; } sizes.push(fill(s, label)); }
    for (var r = 0; r < N; r++) if (zone[r] === 1) zone[r] = 0; else if (zone[r] !== SOLID && zone[r] > 1) zone[r] -= 1;   // outside -> 0, zones 1..
    var zsizes = sizes.slice(2);   // zone z (1..) has zsizes[z-1] cells
    var indoor = zsizes.reduce(function (x, y) { return x + y; }, 0), largest = zsizes.reduce(function (m, v) { return Math.max(m, v); }, 0);
    var cv = CELL * CELL * CELL;
    var hist = { lt2m3: 0, lt50m3: 0, lt500m3: 0, lt5000m3: 0, ge5000m3: 0 };
    zsizes.forEach(function (n) { var m3 = n * cv; if (m3 < 2) hist.lt2m3++; else if (m3 < 50) hist.lt50m3++; else if (m3 < 500) hist.lt500m3++; else if (m3 < 5000) hist.lt5000m3++; else hist.ge5000m3++; });
    cache = { dd: DBG, bld: A.activeBuilding, n: Object.keys(A.guidMap || {}).length, org: org, nx: nx, ny: ny, nz: nz, cell: CELL, zone: zone, zones: zsizes.length, sizes: zsizes };
    cache.stats = { cells: N, MB: +(N * 2 / 1e6).toFixed(1), solid: solid, outsideCells: sizes[1], indoorCells: indoor, zones: zsizes.length, largestZoneM3: Math.round(largest * cv),
      largestShareOfIndoor: indoor ? +(largest / indoor).toFixed(3) : 0, hist: hist, tris: tris, samples: samples, draws: bd.stats, rasMs: Math.round(rasMs), ms: Math.round(performance.now() - t0),
      innerR: INNER_R, closeR: CLOSE_R, closeM: (2 * CLOSE_R + 1) * CELL, groundY: gy == null ? null : +gy.toFixed(2), earthCells: earth, grid: [nx, ny, nz], org: [org.x, org.y, org.z].map(function (v) { return +v.toFixed(1); }) };
    console.log('§LIGHT_ZONE bld=' + A.activeBuilding + ' ' + JSON.stringify(cache.stats));
    return cache;
  }

  function cellOf(Z, x, y, z) { var i = Math.floor((x - Z.org.x) / Z.cell), j = Math.floor((y - Z.org.y) / Z.cell), k = Math.floor((z - Z.org.z) / Z.cell);
    if (i < 0 || j < 0 || k < 0 || i >= Z.nx || j >= Z.ny || k >= Z.nz) return -1; return i + j * Z.nx + k * Z.nx * Z.ny; }
  // raw cell value: -1 off grid, SOLID, 0 outside, 1.. zone
  function at(p) { var Z = cache; if (!Z) return -1; var ci = cellOf(Z, p.x, p.y, p.z); return ci < 0 ? -1 : Z.zone[ci]; }
  // a surface point: step along the normal (+0.2/+0.5/+0.8 m), first EMPTY cell wins (a 0.2 m wall rasterises solid)
  // If every step is solid (the point is at the foot of a wall / in a door threshold: a 0.1 m panel rasterises a whole
  // 0.5 m cell), try 0.5 m and 1 m sideways (the 4 directions in the surface plane) at +0.5 m along the normal.
  function atSurface(p, nrm) {
    for (var s = 0.2; s <= 0.81; s += 0.3) { var v = at({ x: p.x + nrm.x * s, y: p.y + nrm.y * s, z: p.z + nrm.z * s }); if (v !== SOLID) return v; }
    var ax = Math.abs(nrm.y) > 0.7 ? [[1, 0, 0], [0, 0, 1]] : [[0, 1, 0], [-nrm.z, 0, nrm.x]];
    for (var r = 0.5; r <= 1.01; r += 0.5) for (var a = 0; a < 2; a++) for (var sg = -1; sg <= 1; sg += 2) {
      var e = ax[a], w = at({ x: p.x + nrm.x * 0.5 + e[0] * r * sg, y: p.y + nrm.y * 0.5 + e[1] * r * sg, z: p.z + nrm.z * 0.5 + e[2] * r * sg }); if (w !== SOLID) return w; }
    return SOLID; }
  // a lamp: walk down from it in 0.25 m steps to 1.5 m. A fixture sits in the ceiling plane, sometimes a hair above the
  // ceiling panel (IfcCovering) — the first empty cell is then the ceiling void, not the room it lights (Clinic corridor,
  // 2026-09-25: 0 of its 6 in-sight lamps bound to the corridor). So: the first empty cell AFTER crossing a solid wins;
  // with no solid crossed, the first empty cell; then +-x/z 0.5 m at 0.5 m below.
  function atLamp(p) {
    var first = null, crossed = false;
    for (var d = 0; d <= 1.51; d += 0.25) { var v = at({ x: p.x, y: p.y - d, z: p.z });
      if (v === SOLID) { if (first !== null) crossed = true; continue; }
      if (v === -1) continue;
      if (crossed) return v; if (first === null) first = v; }
    if (first !== null) return first;
    var offs = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]; for (var i = 0; i < offs.length; i++) { var w = at({ x: p.x + offs[i][0], y: p.y - 0.5, z: p.z + offs[i][1] }); if (w !== SOLID) return w; }
    return SOLID; }

  // §LIGHT_ZONE_LEAK — why is p "outside"? BFS through the empty cells from p to the grid edge, return the path, sampled.
  // Rebuilds a raw empty/solid view (zone 0 = outside is also empty), so it works after build().
  function leakPath(p, every) {
    var Z = cache; if (!Z) return null; var nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz;
    var s0 = -1, O = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var oi = 0; oi < O.length && s0 < 0; oi++) for (var up = 0.2; up <= 3.01; up += 0.25) { s0 = cellOf(Z, p.x + O[oi][0], p.y + up, p.z + O[oi][1]); if (s0 >= 0 && Z.zone[s0] !== SOLID && !(Z.dd && Z.dd[s0])) break; s0 = -1; }
    if (s0 < 0) return { err: 'start solid/off' };
    var par = new Int32Array(N).fill(-1), q = new Int32Array(N), h = 0, t = 0, end = -1; q[t++] = s0; par[s0] = s0;
    while (h < t) { var c = q[h++], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) { end = c; break; }
      var nb = [c - 1, c + 1, c - nx, c + nx, c - nxy, c + nxy];
      for (var m = 0; m < 6; m++) { var d = nb[m]; if (par[d] === -1 && Z.zone[d] !== SOLID && !(Z.dd && Z.dd[d])) { par[d] = c; q[t++] = d; } } }
    if (end < 0) return { enclosed: true, visited: t };
    var path = []; for (var e = end; ; e = par[e]) { path.push(e); if (e === s0) break; }
    path.reverse(); var pts = [];
    for (var a = 0; a < path.length; a += (a >= path.length - 12 ? 1 : (every || 4))) { var cc = path[a]; pts.push([+(Z.org.x + (cc % nx + 0.5) * Z.cell).toFixed(1), +(Z.org.y + ((((cc / nx) | 0) % ny) + 0.5) * Z.cell).toFixed(1), +(Z.org.z + (((cc / nxy) | 0) + 0.5) * Z.cell).toFixed(1)]); }
    return { len: path.length, visited: t, pts: pts };
  }

  // §LIGHT_ZONE_BAND — the empty run of the voxel column through p: [floorY, ceilY] = the nearest SOLID cell below / above
  // (world y of the solid cell's inner face). A lamp above the ceiling or below the floor of a point lights it only through
  // a slab — the same-zone leak zones alone cannot stop (Hospital atrium, 2026-09-25).
  function band(p) { var Z = cache; if (!Z) return null; var ci = cellOf(Z, p.x, p.y, p.z); if (ci < 0) return null;
    var nxy = Z.nx * Z.ny, k = (ci / Z.nx | 0) % Z.ny, base = ci - k * Z.nx, lo = k, hi = k;
    if (Z.zone[ci] === SOLID) return null;
    while (lo > 0 && Z.zone[base + (lo - 1) * Z.nx] !== SOLID) lo--; while (hi < Z.ny - 1 && Z.zone[base + (hi + 1) * Z.nx] !== SOLID) hi++;
    return { floorY: Z.org.y + lo * Z.cell, ceilY: Z.org.y + (hi + 1) * Z.cell, open: lo === 0 || hi === Z.ny - 1 }; }

  // §LIGHT_ZONE_BAND v2 (red1-4b, 2026-09-25): a lamp's band comes from its BOUND empty cell (below the ceiling panel), not
  // the fixture's own cell: { zone, floorY, topY } = that cell's empty column run. A fragment is lit by the lamp only if it
  // is in the lamp's zone AND (its y is inside [floorY - CELL, topY + CELL], OR it is at/below the lamp's floor inside a
  // column that is empty from the fragment up to that floor — the atrium void). fragCeilY = top of the fragment's own run.
  function lampInfo(p) { var z = atLamp(p); if (!(z > 0) || z === SOLID) return { zone: 0 };
    for (var d = 0; d <= 1.51; d += 0.25) { var q = { x: p.x, y: p.y - d, z: p.z }; if (at(q) === z) { var bd = band(q); if (bd) return { zone: z, floorY: bd.floorY, topY: bd.ceilY }; } }
    var offs = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]; for (var i = 0; i < offs.length; i++) { var w = { x: p.x + offs[i][0], y: p.y - 0.5, z: p.z + offs[i][1] }; if (at(w) === z) { var b2 = band(w); if (b2) return { zone: z, floorY: b2.floorY, topY: b2.ceilY }; } }
    return { zone: z }; }
  function bandPass(li, fragY, fragCeilY) { var c = cache ? cache.cell : CELL; if (li.floorY == null) return true;
    if (fragY >= li.floorY - c && fragY <= li.topY + c) return true;
    return fragY <= li.floorY && fragCeilY != null && fragCeilY >= li.floorY - c; }

  global.LightZones = { lampInfo: lampInfo, bandPass: bandPass, band: band, leakPath: leakPath, build: build, at: at, atSurface: atSurface, atLamp: atLamp, SOLID: SOLID, get: function () { return cache; }, CELL: CELL };
})(typeof window !== 'undefined' ? window : this);
