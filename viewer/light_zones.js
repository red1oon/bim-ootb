// ══ §LIGHT_ZONE — light zones from the building's own geometry (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SOURCED_LIGHT — BUILD LOG + SPEC CHANGE", gated by red1-4b 2026-09-25; "§ZONE_OPEN_SKY — SPEC" 2026-09-25) ══
// red1: "light cannot leak through walls in real life except through glass." Room rects cannot carry this (0 of 2275
// fixtures fall in a compiled room, fleet-wide), so the zones come from the geometry: voxelise the room-boundary classes
// (walls, slabs, roofs, ceilings, closed doors, glazing) at CELL m, flood-fill the empty cells 6-connected.
// §ZONE_OPEN_SKY: OUTSIDE is physical, not a connectivity class — a cell with no SOLID cell above it in its own column is
// OPEN-TO-SKY (value 0: sky kept); every other empty cell is COVERED, and the light zones are the 6-connected components of
// the covered cells (ids 1..). The faces between a zone and the open cells are its DAYLIGHT APERTURES (m2, up / side, per
// zone on cache.zoneInfo). A covered cell that still sees the sky along one of the grid's 9 upward directions through empty
// cells (a porch, an arcade, an eave soffit: BRE's "no-sky line" sampled on the lattice) is SKY-LIT: its zone id carries
// SKY_BIT in the texture; at() strips it, skyAt()/surfaceInfo() read it.
// A doorless opening, an atrium or a stairwell is connected empty space, so it is one zone with no room data at all.
// Grid space = the THREE scene (the same space as the lamps and portals). Built once per building and cached.
(function LZMOD(global) {
  var CELL = 0.5, SOLID = 65535, SKY_BIT = 0x4000, ZONE_MASK = 0x3FFF;
  var BOUNDARY = ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcRoof', 'IfcCovering', 'IfcDoor', 'IfcWindow', 'IfcCurtainWall', 'IfcPlate'];
  // the 24 upward lattice directions (dx, dz in -2..2, dy = +1) besides the zenith: elevations 45 / 35.3 / 26.6 / 19.5 deg.
  // The 8 directions of the 26-neighbourhood alone left a cell-parity checkerboard under a canopy (a lattice ray meets or
  // misses the one-cell layer a thin slab's face rasterises into), and reach only one canopy height deep. Each direction
  // carries the cells its centre-to-centre segment crosses (mids; a segment on a cell boundary counts both sides), so a
  // ray never tunnels through a one-cell wall or a diagonal crack: every mid cell must be non-solid.
  var SKY_DIRS = [];
  for (var sdx = -2; sdx <= 2; sdx++) for (var sdz = -2; sdz <= 2; sdz++) { if (!sdx && !sdz) continue;
    var mids = {}, EPS = 1e-6;
    for (var st = 1; st < 64; st++) { var t = st / 64, px = 0.5 + sdx * t, py = 0.5 + t, pz = 0.5 + sdz * t, ax = [], ay = [], az = [];
      [[px, ax], [py, ay], [pz, az]].forEach(function (q) { var v = q[0], f = Math.floor(v); if (Math.abs(v - Math.round(v)) < EPS) { q[1].push(Math.round(v) - 1, Math.round(v)); } else q[1].push(f); });
      ax.forEach(function (i) { ay.forEach(function (j) { az.forEach(function (k) { if ((i || j || k) && !(i === sdx && j === 1 && k === sdz)) mids[i + ',' + j + ',' + k] = [i, j, k]; }); }); }); }
    SKY_DIRS.push({ dx: sdx, dz: sdz, mids: Object.keys(mids).map(function (k) { return mids[k]; }) }); }
  var cache = null;

  function boundaryGuids(A) {
    var s = new Set();
    try { A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN ('" + BOUNDARY.join("','") + "')").forEach(function (r) { s.add(r[0]); }); } catch (e) {}
    return s;
  }

  // Every boundary draw: { geo, matrix, start, count } in world space. Instanced/plain meshes carry ifcClass per mesh;
  // a BatchedMesh carries one element per instance (guidMap[bm.id + '_' + i]).
  // §SKY_VIEW_FIELD V3: glassy = sky_portal.js's glazing test; a draw carries its material(s) + groups so the rasteriser can
  // mark GLASS cells (hit only by glassy triangles) with their T = 1 - opacity
  function glassyMat(m) { return !!(m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial'); }
  function boundaryDraws(A, THREE, guids) {
    var out = [], cls = new Set(BOUNDARY), stats = { mesh: 0, inst: 0, batched: 0, skippedHidden: 0 };
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.geometry) return;
      if (o === A.ground || o === A._sky || (o.userData && (o.userData.skyPortal || o.userData.excludeFromShadow))) return;
      o.updateMatrixWorld();
      var g = o.geometry, idx = g.index, full = idx ? idx.count : (g.attributes.position ? g.attributes.position.count : 0);
      var mats = Array.isArray(o.material) ? o.material : [o.material], groups = (g.groups && g.groups.length && mats.length > 1) ? g.groups : null;
      if (o.isBatchedMesh) {
        var n = (typeof o.instanceCount === 'number') ? o.instanceCount : (o._instanceInfo ? o._instanceInfo.length : 0);
        for (var i = 0; i < n; i++) {
          var gd = A.guidMap[o.id + '_' + i]; if (!gd || !guids.has(gd)) continue;
          var gid, rng; try { gid = o.getGeometryIdAt(i); rng = o.getGeometryRangeAt(gid); } catch (e) { continue; }
          if (!rng) continue;
          var m = new THREE.Matrix4(); o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
          out.push({ geo: g, matrix: m, start: idx ? rng.indexStart : rng.vertexStart, count: idx ? rng.indexCount : rng.vertexCount, mats: mats, groups: null }); stats.batched++;
        }
        return;
      }
      if (!cls.has(o.userData && o.userData.ifcClass)) return;
      if (o.isInstancedMesh) {
        for (var k = 0; k < o.count; k++) { var mi = new THREE.Matrix4(); o.getMatrixAt(k, mi); if (mi.elements[0] === 0 && mi.elements[5] === 0 && mi.elements[10] === 0) continue;
          mi.premultiply(o.matrixWorld); out.push({ geo: g, matrix: mi, start: 0, count: full, mats: mats, groups: groups }); stats.inst++; }
      } else { out.push({ geo: g, matrix: o.matrixWorld.clone(), start: 0, count: full, mats: mats, groups: groups }); stats.mesh++; }
    });
    return { draws: out, stats: stats };
  }

  // the 24-direction sky sweep on any grid: ray[c] = 1 for an open cell or a covered cell that reaches an open cell along one
  // of SKY_DIRS through non-solid cells (a dynamic sweep per direction, top layer first: seen(c) = open(c) | (empty(c) &
  // seen(c + d) & every mid cell non-solid)). A covered cell never lies within 2 cells of the grid's x/z edge (padding above
  // ground is open, below ground soil) nor in the top layer, so the target and mid cells are in range (guarded anyway).
  function skySweep(zone, nx, ny, nz, open) {
    var N = nx * ny * nz, nxy = nx * ny, sky = new Uint8Array(N), T = new Uint8Array(N);
    for (var c0 = 0; c0 < N; c0++) if (open[c0]) sky[c0] = 1;
    SKY_DIRS.forEach(function (d) { var dx = d.dx, dz = d.dz, off = dx + nx + dz * nxy, mo = d.mids.map(function (m) { return m[0] + m[1] * nx + m[2] * nxy; }), nm = mo.length;
      for (var j = ny - 1; j >= 0; j--) for (var k = 0; k < nz; k++) for (var i = 0; i < nx; i++) { var c = i + j * nx + k * nxy, v = zone[c];
        if (v === SOLID) { T[c] = 0; continue; } if (open[c]) { T[c] = 1; continue; }
        var t = 0; if (j + 1 < ny && i >= 2 && i < nx - 2 && k >= 2 && k < nz - 2 && T[c + off]) { t = 1; for (var m = 0; m < nm; m++) if (zone[c + mo[m]] === SOLID) { t = 0; break; } }
        T[c] = t; if (t) sky[c] = 1; } });
    return sky;
  }
  // open-to-sky mask of any grid: an empty cell with no SOLID above it in its column
  function openMask(zone, nx, ny, nz) {
    var nxy = nx * ny, open = new Uint8Array(nx * ny * nz);
    for (var k = 0; k < nz; k++) for (var i = 0; i < nx; i++) { var covered = false;
      for (var j = ny - 1; j >= 0; j--) { var c = i + j * nx + k * nxy; if (zone[c] === SOLID) { covered = true; continue; } if (!covered) open[c] = 1; } }
    return open;
  }
  // ══ §GLARE (watchdog red1-c6, 2026-09-25): three CPU facts of the zone grid, computed at build time — no render, no pose
  // walk. Z = any grid { zone, nx, ny, nz, org, cell }; rule(p, nrm) -> { zone, sky } = the fragment lookup under test;
  // cellSky(v) -> 0/1 = the sky class of a raw cell value under that rule (open cells are sky under every rule).
  //   blackExteriorFaces  faces between a SOLID cell and an OPEN cell (an exterior surface under the sky) whose lookup at the
  //                       face centre, normal toward the open cell, withholds sky: would render black in sun shadow.
  //   junctionFlips       for every empty cell E with a solid cell below (a floor) and a solid side neighbour W (a wall,
  //                       column or partition base): the lookup at the floor point INSIDE W's column 0.2 m from E, 0.05 m
  //                       above W's bottom, normal up, must give E's zone and sky class — red1's bright junction strips.
  //   canopyCells         covered cells that see the sky sideways (the 24-direction sweep, no dilation) whose cell class
  //                       withholds sky: a porch / canopy / recessed entrance that would render black with no daylight term.
  function audit(Z, rule, cellSky) {
    var t0 = performance.now(), nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz, zone = Z.zone, cl = Z.cell, o = Z.org;
    var open = openMask(zone, nx, ny, nz), ray = skySweep(zone, nx, ny, nz, open);
    var r = { blackExteriorFaces: 0, exteriorFaces: 0, junctionFlips: 0, junctionZoneFlips: 0, junctionTested: 0, canopyCells: 0, rayLitCoveredCells: 0, openCells: 0, coveredCells: 0 };
    var DIRS = [[1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, 0, nx], [0, -1, 0, -nx], [0, 0, 1, nxy], [0, 0, -1, -nxy]];
    for (var c = 0; c < N; c++) { var v = zone[c], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      if (v === SOLID) {
        for (var d = 0; d < 6; d++) { var D = DIRS[d], ni = i + D[0], nj = j + D[1], nk = k + D[2]; if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue;
          if (!open[c + D[3]]) continue; r.exteriorFaces++;
          var p = { x: o.x + (i + 0.5 + 0.5 * D[0]) * cl, y: o.y + (j + 0.5 + 0.5 * D[1]) * cl, z: o.z + (k + 0.5 + 0.5 * D[2]) * cl };
          if (!rule(p, { x: D[0], y: D[1], z: D[2] }).sky) r.blackExteriorFaces++; }
        continue; }
      if (open[c]) { r.openCells++; continue; }
      r.coveredCells++;
      if (ray[c]) { r.rayLitCoveredCells++; if (!cellSky(v)) r.canopyCells++; }
      if (j > 0 && zone[c - nx] === SOLID) {   // a floor cell: test each solid side neighbour
        var zE = v & ZONE_MASK, sE = cellSky(v);
        for (var d2 = 0; d2 < 4; d2++) { var D2 = DIRS[d2], wi = i + D2[0], wk = k + D2[2]; if (wi < 0 || wk < 0 || wi >= nx || wk >= nz) continue;
          if (zone[c + D2[3]] !== SOLID) continue; r.junctionTested++;
          var q = { x: o.x + (wi + 0.5 - 0.4 * D2[0]) * cl, y: o.y + j * cl + 0.05, z: o.z + (wk + 0.5 - 0.4 * D2[2]) * cl };   // 0.2 m inside W's column from E
          var g = rule(q, { x: 0, y: 1, z: 0 }), gz = (g.zone === SOLID || g.zone < 0) ? -1 : g.zone;
          if (gz !== zE) r.junctionZoneFlips++; if (gz !== zE || (g.sky ? 1 : 0) !== sE) r.junctionFlips++; } } }
    r.ms = Math.round(performance.now() - t0);
    return r;
  }

  // ══ §ZONE_IDB_CACHE (red1 2026-09-26: "cache the 1-time work"): the zone grid (build) and the sky-view field (field) are
  // camera-free BUILD data (~6.5 s on Hospital's first Alt+S). They are kept per building in IndexedDB — not in the .db file.
  // A record is used only when ALL of its key matches: SRC = a hash of this file's code (any edit here rebuilds), fp = the
  // boundary geometry's fingerprint (guid count, boundary guids, draws, index count, bounds, per-draw bounds sum, glass
  // opacities), and for the field part the IRC switch. prime(A) is awaited before staging; build()/field() stay synchronous.
  // &zonecache=0 skips it (no read, no write).
  var IDB_NAME = 'bim_ootb_lightzones', IDB_STORE = 'z', primed = null, saveTimer = 0;
  var KEYS = ['bld', 'n', 'nx', 'ny', 'nz', 'cell', 'zone', 'zones', 'sizes', 'zoneInfo', 'aperture', 'groundJ', 'glassT', 'glassCells', 'glassMats', 'stats'];
  var SRC = (function () { var s = String(LZMOD), h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ':' + s.length; })();
  function cacheOff() { return typeof indexedDB === 'undefined' || (typeof location !== 'undefined' && /[?&]zonecache=0/.test(location.search)); }
  function ircFlag(A) { return A._stillIrc === true || (typeof location !== 'undefined' && /[?&]irc=1/.test(location.search)); }
  function idb() { return new Promise(function (res, rej) { var rq; try { rq = indexedDB.open(IDB_NAME, 1); } catch (e) { return rej(e); }
    rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); }; rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); }; rq.onblocked = function () { rej(new Error('blocked')); }; }); }
  function prime(A) {
    if (cacheOff() || !A || !A.activeBuilding || (cache && cache.bld === A.activeBuilding) || (primed && primed.bld === A.activeBuilding)) return Promise.resolve(primed);
    var bld = A.activeBuilding, t0 = performance.now();
    var rd = idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction(IDB_STORE, 'readonly'), g = tx.objectStore(IDB_STORE).get(bld);
      g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; tx.oncomplete = tx.onabort = function () { db.close(); }; }); })
      .then(function (r) { primed = r && r.src === SRC ? r : null;
        console.log('§ZONE_IDB_CACHE prime bld=' + bld + ' ' + (r ? (primed ? 'loaded' : 'stale-code (will rebuild; stored ' + r.src + ' now ' + SRC + ')') : 'none') + ' readMs=' + Math.round(performance.now() - t0) + (r ? ' MB=' + r.mb + ' field=' + (r.field ? 1 : 0) + ' saved=' + r.when : ''));
        return primed; })
      .catch(function (e) { console.warn('§ZONE_IDB_CACHE prime failed: ' + (e && e.message)); return null; });
    // never hold Alt+S on a slow or blocked store: after 3 s staging builds as before
    return Promise.race([rd, new Promise(function (r) { setTimeout(function () { r(null); }, 3000); })]);
  }
  function scheduleSave() {
    if (cacheOff() || !cache || !cache.fp) return; clearTimeout(saveTimer); var Z = cache;
    saveTimer = setTimeout(function () { if (cache !== Z) return;
      var t0 = performance.now(), rec = { src: SRC, fp: Z.fp, org: [Z.org.x, Z.org.y, Z.org.z], field: Z.field || null, when: new Date().toISOString() };
      KEYS.forEach(function (k) { rec[k] = Z[k]; });
      rec.mb = +((Z.zone.byteLength + Z.glassT.byteLength + (Z.aperture ? Z.aperture.byteLength : 0) + (Z.field ? Z.field.G.byteLength : 0)) / 1e6).toFixed(1);
      idb().then(function (db) { var tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(rec, Z.bld);
        tx.oncomplete = function () { db.close(); console.log('§ZONE_IDB_CACHE saved bld=' + Z.bld + ' MB=' + rec.mb + ' field=' + (rec.field ? 1 : 0) + ' ms=' + Math.round(performance.now() - t0)); };
        tx.onerror = tx.onabort = function () { db.close(); console.warn('§ZONE_IDB_CACHE save failed: ' + (tx.error && tx.error.message)); }; })
        .catch(function (e) { console.warn('§ZONE_IDB_CACHE save failed: ' + (e && e.message)); }); }, 0);
  }
  function logBuilt(A) {
    console.log('§LIGHT_ZONE bld=' + A.activeBuilding + ' ' + JSON.stringify(cache.stats));
    var gl = cache.stats.glare, gfail = gl.blackExteriorFaces > 0 || gl.junctionFlips > 0 || gl.canopyCells > 0;
    console.log('§GLARE bld=' + A.activeBuilding + ' ' + (gfail ? 'FAIL' : 'PASS') + ' black_exterior=' + gl.blackExteriorFaces + ' junction_zone_flip=' + gl.junctionFlips + ' covered_open_side_black=' + gl.canopyCells +
      ' (exteriorFaces=' + gl.exteriorFaces + ' junctionTested=' + gl.junctionTested + ' rayLitCoveredCells=' + gl.rayLitCoveredCells + ' auditMs=' + gl.ms + ')');
  }
  function restore(A, r, THREE, t0) {
    cache = { dd: null, org: new THREE.Vector3(r.org[0], r.org[1], r.org[2]), fp: r.fp }; KEYS.forEach(function (k) { cache[k] = r[k]; });
    var ms = Math.round(performance.now() - t0);
    cache.stats = Object.assign({}, r.stats, { ms: ms, rasMs: 0, skyMs: 0, cached: 1, glare: Object.assign({}, r.stats.glare, { ms: 0 }) });
    var fOk = !!(r.field && r.field.irc && r.field.irc.on === ircFlag(A)), fMs = r.field ? r.field.ms : 0;
    if (fOk) cache.field = Object.assign(r.field, { ms: 0, cached: 1 });
    console.log('§ZONE_IDB_CACHE hit bld=' + A.activeBuilding + ' ms=' + ms + ' (build was ' + r.stats.ms + ' ms + audit ' + r.stats.glare.ms + ' ms) field=' + (fOk ? 'hit (was ' + fMs + ' ms)' : r.field ? 'irc-switch changed (rebuild)' : 'none'));
    logBuilt(A);
    return cache;
  }

  function build(A, opts) {
    var THREE = global.THREE; opts = opts || {};
    if (cache && cache.bld === A.activeBuilding && cache.n === Object.keys(A.guidMap || {}).length && !opts.force) return cache;
    var t0 = performance.now(), guids = boundaryGuids(A), bd = boundaryDraws(A, THREE, guids), draws = bd.draws;
    // bounds from the boundary geometry (skyline props / ground excluded by construction)
    var box = new THREE.Box3(), tb = new THREE.Box3();
    var bsum = 0, idxN = 0, glN = 0, glO = 0;   // §ZONE_IDB_CACHE fingerprint parts (per-draw bounds sum catches a moved element)
    draws.forEach(function (d) { if (!d.geo.boundingBox) d.geo.computeBoundingBox(); tb.copy(d.geo.boundingBox).applyMatrix4(d.matrix); box.union(tb);
      bsum += tb.min.x + tb.min.y + tb.min.z + tb.max.x + tb.max.y + tb.max.z; idxN += d.count; d.mats.forEach(function (m) { if (glassyMat(m)) { glN++; glO += m.opacity; } }); });
    if (box.isEmpty()) { console.log('§LIGHT_ZONE bld=' + A.activeBuilding + ' VACUOUS no boundary geometry (guids=' + guids.size + ')'); return null; }
    var fp = [A.activeBuilding, Object.keys(A.guidMap || {}).length, guids.size, draws.length, idxN, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z, bsum, glN, glO]
      .map(function (v) { return typeof v === 'number' ? +v.toFixed(3) : v; }).join('|');
    if (primed && primed.bld === A.activeBuilding && !opts.force) { var pr = primed; primed = null;
      if (pr.fp === fp) return restore(A, pr, THREE, t0);
      console.log('§ZONE_IDB_CACHE miss bld=' + A.activeBuilding + ' geometry changed (stored ' + pr.fp + ' now ' + fp + ') — rebuilding'); }
    var org = box.min.clone().subScalar(CELL * 2), size = box.getSize(new THREE.Vector3()).addScalar(CELL * 4);
    var nx = Math.ceil(size.x / CELL), ny = Math.ceil(size.y / CELL), nz = Math.ceil(size.z / CELL), N = nx * ny * nz;
    var zone = new Uint16Array(N), nxy = nx * ny;
    function cellIdx(x, y, z) { var i = Math.floor((x - org.x) / CELL), j = Math.floor((y - org.y) / CELL), k = Math.floor((z - org.z) / CELL);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1; return i + j * nx + k * nxy; }
    // rasterise: sample each triangle on a barycentric grid no coarser than CELL/2 (conservative enough for 0.1 m walls)
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tris = 0, samples = 0, step = CELL / 2;
    var tRas = performance.now(), glassT = new Uint8Array(N), gHits = new Uint8Array(N), oHits = new Uint8Array(N), glassMat = new Map();
    draws.forEach(function (d) {
      var pos = d.geo.attributes.position, ix = d.geo.index, e = d.matrix.elements, gi = 0;
      for (var t = d.start; t + 2 < d.start + d.count; t += 3) {
        var mat = d.mats[0];
        if (d.groups) { while (gi < d.groups.length - 1 && t >= d.groups[gi].start + d.groups[gi].count) gi++; mat = d.mats[d.groups[gi].materialIndex || 0]; }
        var isG = glassyMat(mat), tq = isG ? Math.max(1, Math.round((1 - mat.opacity) * 255)) : 0;
        var i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(d.matrix); b.fromBufferAttribute(pos, i1).applyMatrix4(d.matrix); c.fromBufferAttribute(pos, i2).applyMatrix4(d.matrix);
        var L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), n = Math.max(1, Math.ceil(L / step)); tris++;
        if (isG) { var gm = glassMat.get(mat); if (!gm) { gm = { name: mat.name || mat.uuid.slice(0, 8), opacity: mat.opacity, T: +(1 - mat.opacity).toFixed(3), m2: 0 }; glassMat.set(mat, gm); }
          var cr = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)); gm.m2 += cr.length() / 2; }
        for (var u = 0; u <= n; u++) for (var v = 0; v <= n - u; v++) {
          var w = n - u - v, x = (a.x * u + b.x * v + c.x * w) / n, y = (a.y * u + b.y * v + c.y * w) / n, z = (a.z * u + b.z * v + c.z * w) / n;
          var ci = cellIdx(x, y, z); if (ci >= 0) { zone[ci] = SOLID; if (isG) { if (!glassT[ci] || tq < glassT[ci]) glassT[ci] = tq; if (gHits[ci] < 255) gHits[ci]++; } else if (oHits[ci] < 255) oHits[ci]++; } samples++;
        }
      }
    });
    var rasMs = performance.now() - tRas, solid = 0, glassCells = 0;
    // V3 (rev. after the Hospital smoke, see spec): the cell's MAJORITY surface decides — glass when its glassy samples
    // (the rasteriser's uniform barycentric samples ~ area) are at least its opaque ones. "Any opaque wins" shrank every
    // window opening by up to a cell per side (the fattened wall reveal around the pane): ADF cross-check Fwp/ADF 0.044.
    for (var gc = 0; gc < N; gc++) { if (glassT[gc] && oHits[gc] > gHits[gc]) glassT[gc] = 0; if (glassT[gc]) glassCells++; }
    gHits = oHits = null;
    for (var s0 = 0; s0 < N; s0++) if (zone[s0] === SOLID) solid++;
    // §ZONE_OPEN_SKY — one top-down scan per column: an empty cell with no SOLID above it is OPEN-TO-SKY (label 1 here,
    // written as 0 at the end); every other empty cell is COVERED (stays 0, labelled below). No closing radius, no
    // connectivity to the grid edge. The grid keeps 2 padding cells, so its top layer is always open.
    // EARTH: below the ground plane an UNCOVERED cell is soil = SOLID (the viewer draws the ground plane there; this
    // subsumes the old edge-ring rule: the interior leaked out through a slab opening into the under-slab void and out of
    // the grid's floor, Hospital café 2026-09-25). A cell below ground WITH a solid above it (a basement) stays empty, and
    // the bottom two layers below ground are solid so a basement zone keeps a floor.
    var gy = (A.ground && isFinite(A.ground.position.y)) ? A.ground.position.y : null, earth = 0, openN = 0;
    var jg = (gy == null) ? 0 : Math.min(ny, Math.max(0, Math.floor((gy - org.y) / CELL)));   // cells with j < jg lie below the ground plane
    var tSky = performance.now();
    for (var kk = 0; kk < nz; kk++) for (var ii = 0; ii < nx; ii++) { var covered = false;
      for (var jj = ny - 1; jj >= 0; jj--) { var ce = ii + jj * nx + kk * nxy, cv0 = zone[ce];
        if (cv0 === SOLID) { covered = true; continue; }
        if (!covered) { if (jj < jg) { zone[ce] = SOLID; earth++; } else { zone[ce] = 1; openN++; } } } }
    if (jg > 0) for (var kb = 0; kb < nz; kb++) for (var jb = 0; jb < Math.min(2, jg); jb++) for (var ib = 0; ib < nx; ib++) { var cb = ib + jb * nx + kb * nxy; if (zone[cb] !== SOLID) { zone[cb] = SOLID; earth++; } }
    // flood fill, 6-connected, over the covered empty cells (0); label 1 = open-to-sky is written as 0 at the end
    var q = new Int32Array(N), label = 1, sizes = [0, openN];
    function fill(seed, lab) {
      var h = 0, tl = 0, cnt = 0; q[tl++] = seed; zone[seed] = lab;
      while (h < tl) { var p = q[h++]; cnt++; var i = p % nx, j = ((p / nx) | 0) % ny, k = (p / nxy) | 0;
        if (i > 0 && zone[p - 1] === 0) { zone[p - 1] = lab; q[tl++] = p - 1; } if (i < nx - 1 && zone[p + 1] === 0) { zone[p + 1] = lab; q[tl++] = p + 1; }
        if (j > 0 && zone[p - nx] === 0) { zone[p - nx] = lab; q[tl++] = p - nx; } if (j < ny - 1 && zone[p + nx] === 0) { zone[p + nx] = lab; q[tl++] = p + nx; }
        if (k > 0 && zone[p - nxy] === 0) { zone[p - nxy] = lab; q[tl++] = p - nxy; } if (k < nz - 1 && zone[p + nxy] === 0) { zone[p + nxy] = lab; q[tl++] = p + nxy; } }
      return cnt;
    }
    function nbrs(c, f) { var i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      if (i > 0) f(c - 1); if (i < nx - 1) f(c + 1); if (j > 0) f(c - nx); if (j < ny - 1) f(c + nx); if (k > 0) f(c - nxy); if (k < nz - 1) f(c + nxy); }
    // INTERIOR SPLIT (measured option, A._lightZoneInnerR, default 0 = the gated spec: every connected space is one zone).
    // With INNER_R > 0 the zones are seeded on a grid whose solids are grown by INNER_R cells (openings narrower than
    // (2*INNER_R+1)*CELL close, like doors), then every remaining empty cell takes the label of the nearest seed through
    // real empty space (multi-source BFS). Hospital, 2026-09-25: one zone held 68% of the indoor volume.
    var INNER_R = (typeof A._lightZoneInnerR === 'number') ? A._lightZoneInnerR : 0;
    if (INNER_R > 0) {
      var SI = new Uint8Array(N), T1 = new Uint8Array(N), T2 = new Uint8Array(N);
      for (var ci1 = 0; ci1 < N; ci1++) SI[ci1] = zone[ci1] === SOLID ? 1 : 0;
      var dil = function (src, dst, stride, len) {   // box max of radius INNER_R along one axis
        for (var c = 0; c < N; c++) { var pos = ((c / stride) | 0) % len, v = 0;
          for (var o = -INNER_R; o <= INNER_R && !v; o++) { var pp = pos + o; if (pp >= 0 && pp < len && src[c + o * stride]) v = 1; } dst[c] = v; } };
      dil(SI, T1, 1, nx); dil(T1, T2, nx, ny); dil(T2, T1, nxy, nz);
      for (var ci2 = 0; ci2 < N; ci2++) if (zone[ci2] === 0 && T1[ci2]) zone[ci2] = SOLID - 1;   // provisional: grown-away empty cell
      for (var s1 = 0; s1 < N; s1++) if (zone[s1] === 0) { label++; if (label >= SOLID - 1) { console.warn('§LIGHT_ZONE zone ids exhausted'); break; } sizes.push(fill(s1, label)); }
      // regrow labels into the provisional cells
      var qh = 0, qt = 0; for (var c3 = 0; c3 < N; c3++) { var zv = zone[c3]; if (zv > 1 && zv < SOLID - 1) q[qt++] = c3; }
      while (qh < qt) { var c4 = q[qh++], lab4 = zone[c4]; nbrs(c4, function (d) { if (zone[d] === SOLID - 1) { zone[d] = lab4; sizes[lab4]++; q[qt++] = d; } }); }
      for (var c5 = 0; c5 < N; c5++) if (zone[c5] === SOLID - 1) zone[c5] = 0;   // isolated leftovers: labelled below
      SI = T1 = T2 = null;
    }
    for (var s = 0; s < N; s++) if (zone[s] === 0) { label++; if (label > ZONE_MASK) { console.warn('§LIGHT_ZONE zone ids exhausted (' + ZONE_MASK + ')'); break; } sizes.push(fill(s, label)); }
    for (var r = 0; r < N; r++) if (zone[r] === 1) zone[r] = 0; else if (zone[r] !== SOLID && zone[r] > 1) zone[r] -= 1;   // open -> 0, zones 1..
    var zsizes = sizes.slice(2);   // zone z (1..) has zsizes[z-1] cells
    var nzones = zsizes.length, cv = CELL * CELL * CELL, cf = CELL * CELL;
    // §ZONE_OPEN_SKY apertures: every face between a zone cell and an open cell (+y: up; +-x/+-z: side; the open set is
    // upward-closed, so a face downwards cannot occur — counted to prove it) and the zone's solid surface (faces to SOLID).
    var aperture = new Uint8Array(N), apUp = new Int32Array(nzones + 1), apSide = new Int32Array(nzones + 1), apDown = 0, surf = new Int32Array(nzones + 1), apCells = [];
    for (var zi0 = 0; zi0 <= nzones; zi0++) apCells.push([]);
    for (var ca = 0; ca < N; ca++) { var za = zone[ca]; if (za === 0 || za === SOLID) continue;
      var ia = ca % nx, ja = ((ca / nx) | 0) % ny, ka = (ca / nxy) | 0, bits = 0, sf = 0;
      var vxm = ia > 0 ? zone[ca - 1] : SOLID, vxp = ia < nx - 1 ? zone[ca + 1] : SOLID, vzm = ka > 0 ? zone[ca - nxy] : SOLID, vzp = ka < nz - 1 ? zone[ca + nxy] : SOLID;
      var vyp = ja < ny - 1 ? zone[ca + nx] : 0, vym = ja > 0 ? zone[ca - nx] : SOLID;
      if (vyp === 0) { bits |= 1; apUp[za]++; } else if (vyp === SOLID) sf++;
      if (vxm === 0) { bits |= 2; apSide[za]++; } else if (vxm === SOLID) sf++;
      if (vxp === 0) { bits |= 4; apSide[za]++; } else if (vxp === SOLID) sf++;
      if (vzm === 0) { bits |= 8; apSide[za]++; } else if (vzm === SOLID) sf++;
      if (vzp === 0) { bits |= 16; apSide[za]++; } else if (vzp === SOLID) sf++;
      if (vym === 0) apDown++; else if (vym === SOLID) sf++;
      surf[za] += sf; if (bits) { aperture[ca] = bits; apCells[za].push(ca); } }
    // SKY-LIT covered cells (BRE's "no-sky line" on the lattice): from the cell, one of the 24 non-zenith upward lattice
    // directions reaches an open cell through empty cells only (a dynamic sweep per direction, top layer first:
    // seen(c) = open(c) | (empty(c) & seen(c + d))), then one 6-neighbour dilation through empty cells (the grid's own
    // resolution: the fragment lookup itself reads a +-1-cell neighbourhood).
    var open0 = new Uint8Array(N); for (var co = 0; co < N; co++) if (zone[co] === 0) open0[co] = 1;
    var sky = skySweep(zone, nx, ny, nz, open0), T = new Uint8Array(N), skyLitN = 0, skyLitZ = new Int32Array(nzones + 1), skyRay = 0; open0 = null;
    for (var cr = 0; cr < N; cr++) if (sky[cr] && zone[cr] !== 0) skyRay++;
    for (var cd = 0; cd < N; cd++) { var vd = zone[cd]; if (vd === 0 || vd === SOLID || sky[cd]) { T[cd] = sky[cd]; continue; }
      var id = cd % nx, jd = ((cd / nx) | 0) % ny, kd = (cd / nxy) | 0;
      T[cd] = ((id > 0 && sky[cd - 1]) || (id < nx - 1 && sky[cd + 1]) || (jd > 0 && sky[cd - nx]) || (jd < ny - 1 && sky[cd + nx]) || (kd > 0 && sky[cd - nxy]) || (kd < nz - 1 && sky[cd + nxy])) ? 1 : 0; }
    sky = T; T = null;
    for (var cz = 0; cz < N; cz++) { var zz = zone[cz]; if (zz !== 0 && zz !== SOLID && sky[cz]) { zone[cz] |= SKY_BIT; skyLitN++; skyLitZ[zz]++; } }
    var skyMs = performance.now() - tSky;
    var zoneInfo = [], apTotUp = 0, apTotSide = 0, zonesWithAp = 0;
    for (var zi = 1; zi <= nzones; zi++) { var um = apUp[zi] * cf, sm = apSide[zi] * cf; apTotUp += um; apTotSide += sm; if (apUp[zi] + apSide[zi]) zonesWithAp++;
      zoneInfo.push({ cells: zsizes[zi - 1], m3: +(zsizes[zi - 1] * cv).toFixed(1), apertureM2: +(um + sm).toFixed(2), upM2: +um.toFixed(2), sideM2: +sm.toFixed(2), surfaceM2: +(surf[zi] * cf).toFixed(1), skyLitCells: skyLitZ[zi], apertureCells: Int32Array.from(apCells[zi]) }); }
    apCells = null;
    var topAp = zoneInfo.map(function (z, i) { return [i + 1, z.apertureM2, z.upM2, z.sideM2, z.cells]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 5);
    var indoor = zsizes.reduce(function (x, y) { return x + y; }, 0), largest = zsizes.reduce(function (m, v) { return Math.max(m, v); }, 0);
    var hist = { lt2m3: 0, lt50m3: 0, lt500m3: 0, lt5000m3: 0, ge5000m3: 0 };
    zsizes.forEach(function (n) { var m3 = n * cv; if (m3 < 2) hist.lt2m3++; else if (m3 < 50) hist.lt50m3++; else if (m3 < 500) hist.lt500m3++; else if (m3 < 5000) hist.lt5000m3++; else hist.ge5000m3++; });
    cache = { dd: null, bld: A.activeBuilding, n: Object.keys(A.guidMap || {}).length, org: org, nx: nx, ny: ny, nz: nz, cell: CELL, zone: zone, zones: nzones, sizes: zsizes, zoneInfo: zoneInfo, aperture: aperture, groundJ: jg,
      glassT: glassT, glassCells: glassCells, glassMats: Array.from(glassMat.values()) };
    cache.stats = { cells: N, MB: +(N * 2 / 1e6).toFixed(1), solid: solid, outsideCells: openN, openSkyCells: openN, soilCells: earth, indoorCells: indoor, zones: nzones, largestZoneM3: Math.round(largest * cv),
      largestShareOfIndoor: indoor ? +(largest / indoor).toFixed(3) : 0, hist: hist, zonesWithAperture: zonesWithAp, apertureM2: +(apTotUp + apTotSide).toFixed(1), apertureUpM2: +apTotUp.toFixed(1), apertureSideM2: +apTotSide.toFixed(1),
      apertureDownFaces: apDown, skyLitCells: skyLitN, skyRayCells: skyRay, skyDirs: SKY_DIRS.length, topApertureZones: topAp, tris: tris, samples: samples, draws: bd.stats, rasMs: Math.round(rasMs), skyMs: Math.round(skyMs), ms: Math.round(performance.now() - t0),
      innerR: INNER_R, groundY: gy == null ? null : +gy.toFixed(2), earthCells: earth, grid: [nx, ny, nz], org: [org.x, org.y, org.z].map(function (v) { return +v.toFixed(1); }) };
    cache.stats.glare = audit(cache, surfaceInfo, cellSkyNew);
    cache.fp = fp; logBuilt(A); scheduleSave();
    return cache;
  }
  function cellSkyNew(v) { return (v === 0 || (v !== SOLID && (v & SKY_BIT))) ? 1 : 0; }

  function cellOf(Z, x, y, z) { var i = Math.floor((x - Z.org.x) / Z.cell), j = Math.floor((y - Z.org.y) / Z.cell), k = Math.floor((z - Z.org.z) / Z.cell);
    if (i < 0 || j < 0 || k < 0 || i >= Z.nx || j >= Z.ny || k >= Z.nz) return -1; return i + j * Z.nx + k * Z.nx * Z.ny; }
  // raw cell value: -1 off grid, SOLID, 0 open-to-sky (outside), 1.. zone (SKY_BIT stripped; atRaw keeps it)
  function at(p) { var Z = cache; if (!Z) return -1; var ci = cellOf(Z, p.x, p.y, p.z); if (ci < 0) return -1; var v = Z.zone[ci]; return v === SOLID ? SOLID : (v & ZONE_MASK); }
  function atRaw(p) { var Z = cache; if (!Z) return -1; var ci = cellOf(Z, p.x, p.y, p.z); return ci < 0 ? -1 : Z.zone[ci]; }
  // does the cell see the sky? 1 open / sky-lit covered, 0 covered, -1 off grid or solid
  function skyAt(p) { var v = atRaw(p); if (v === -1 || v === SOLID) return -1; return (v === 0 || (v & SKY_BIT)) ? 1 : 0; }
  // §ZONE_OPEN_SKY fragment lookup (the CPU mirror of the shader's slFragZone, same order): C0 = the cell of p + 0.25 m
  // along the eye-facing normal; the nearest non-solid cell CENTRE (from p) among C0's 27 cells whose centre lies on the
  // eye side of the surface wins (a floor within a wall's rasterised column takes the room cell beside it, never the void
  // under the slab: red1's bright junction strips, 2026-09-25); none -> walk up C0's column to the first non-solid cell
  // (open above = sky, a covered cell = its zone); a fully solid column above = unknown (SOLID, sky 0).
  // Returns { zone: -1 off grid | 0 open | 1.. zone | SOLID unknown, sky: 0/1 }.
  function surfaceInfo(p, nrm) { var Z = cache; if (!Z) return { zone: -1, sky: 1 };
    var cl = Z.cell, qx = p.x + nrm.x * 0.25, qy = p.y + nrm.y * 0.25, qz = p.z + nrm.z * 0.25;
    var i0 = Math.floor((qx - Z.org.x) / cl), j0 = Math.floor((qy - Z.org.y) / cl), k0 = Math.floor((qz - Z.org.z) / cl);
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= Z.nx || j0 >= Z.ny || k0 >= Z.nz) return { zone: -1, sky: 1 };
    var best = Infinity, bt = SOLID, bc = -1, nxy = Z.nx * Z.ny;
    for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var i = i0 + dx, j = j0 + dy, k = k0 + dz; if (i < 0 || j < 0 || k < 0 || i >= Z.nx || j >= Z.ny || k >= Z.nz) continue;
      var t = Z.zone[i + j * Z.nx + k * nxy]; if (t === SOLID) continue;
      var ex = Z.org.x + (i + 0.5) * cl - p.x, ey = Z.org.y + (j + 0.5) * cl - p.y, ez = Z.org.z + (k + 0.5) * cl - p.z;
      if (ex * nrm.x + ey * nrm.y + ez * nrm.z <= 0) continue;
      var l = ex * ex + ey * ey + ez * ez; if (l < best) { best = l; bt = t; bc = i + j * Z.nx + k * nxy; } }
    if (bt === SOLID) { var base = i0 + k0 * nxy; bt = 0; bc = -1;
      for (var jj = j0 + 1; jj < Z.ny; jj++) { var tt = Z.zone[base + jj * Z.nx]; if (tt !== SOLID) { bt = tt; bc = base + jj * Z.nx; break; } if (jj === Z.ny - 1) bt = SOLID; } }
    if (bt === SOLID) return { zone: SOLID, sky: 0, cell: -1 };
    // cell = the texel index the shader reads (its .g = §SOURCED_DAYLIGHT); -1 = none (a column walk that ran off the top)
    var z = bt & ZONE_MASK; return { zone: z, sky: (z === 0 || (bt & SKY_BIT)) ? 1 : 0, cell: bc }; }
  // a surface point's raw zone (-1 off grid, 0 open, 1.. zone, SOLID unknown)
  function atSurface(p, nrm) { return surfaceInfo(p, nrm).zone; }
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

  // §LIGHT_ZONE_LEAK — is the empty cell at p connected to the grid edge? BFS through the empty cells (open cells are empty
  // too), return the path, sampled. Works after build().
  function leakPath(p, every) {
    var Z = cache; if (!Z) return null; var nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz;
    var s0 = -1, O = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var oi = 0; oi < O.length && s0 < 0; oi++) for (var up = 0.2; up <= 3.01; up += 0.25) { s0 = cellOf(Z, p.x + O[oi][0], p.y + up, p.z + O[oi][1]); if (s0 >= 0 && Z.zone[s0] !== SOLID) break; s0 = -1; }
    if (s0 < 0) return { err: 'start solid/off' };
    var par = new Int32Array(N).fill(-1), q = new Int32Array(N), h = 0, t = 0, end = -1; q[t++] = s0; par[s0] = s0;
    while (h < t) { var c = q[h++], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0;
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) { end = c; break; }
      var nb = [c - 1, c + 1, c - nx, c + nx, c - nxy, c + nxy];
      for (var m = 0; m < 6; m++) { var d = nb[m]; if (par[d] === -1 && Z.zone[d] !== SOLID) { par[d] = c; q[t++] = d; } } }
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

  // v3 (red1-4b): the LAMP's column decides. A lamp lights fragments inside its own empty column run [floorY - CELL,
  // topY + CELL] only — a lamp hanging over the atrium void has a run reaching the void's floor, a balcony lamp with its own
  // slab under it lights its storey band only. No fragment-side test. overVoid = run taller than OVER_VOID_M.
  var OVER_VOID_M = 5;
  function bandPass3(li, fragY) { var c = cache ? cache.cell : CELL; if (li.floorY == null) return true; return fragY >= li.floorY - c && fragY <= li.topY + c; }


  // ══ §SOURCED_DAYLIGHT v2 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§SOURCED_DAYLIGHT v2 — SPEC UPDATE", watchdog
  // gate G1-G3, build decisions D1-D6) — per-zone BRE average daylight factor (Littlefair, BRE Digest 309/310):
  //   DF_z = sum(T A theta) / (A_z (1 - R^2))  [%],  R = 0.5 (BRE's typical area-weighted reflectance, light room; stated),
  //   A_z = zoneInfo.surfaceM2 (faces to SOLID cells, glass included) + apertureM2 (D7: BRE's A includes the openings). Sources: every glazing tile incl. roof glass (T = 1 - opacity; theta =
  //   90 x sky fraction of the 5 §SKY_PORTAL_SIDE rays marched on the grid from the outward cell's centre, roof 180 x), except tiles carrying a live portal this still; and the
  //   zone's open apertures (T = 1; up theta 180, side 90 x the mean sky fraction of <= 64 sampled faces).
  //   Per cell: DF_z/100 x f(d)/mean_z f, f(d) = 1/(1+(d/D_z)^2), d = BFS distance through zone cells from the source cells,
  //   D_z = source-m2-weighted source-centre height above the floor below it. Only covered, non-sky-lit cells carry it (the
  //   sky-lit ones already take the full hemi). The camera-independent part (tiles, sides, theta, heights, apertures) is
  //   cached on the zone cache; the per-still part (portal exclusion, DF, BFS, G) runs per press.
  var R_BRE = 0.5, RAY_MAX = 60, SIDE_SAMPLES = 64;
  function cCentre(Z, c) { var nx = Z.nx, i = c % nx, j = ((c / nx) | 0) % Z.ny, k = (c / (nx * Z.ny)) | 0; return [Z.org.x + (i + 0.5) * Z.cell, Z.org.y + (j + 0.5) * Z.cell, Z.org.z + (k + 0.5) * Z.cell]; }
  function cIdx(Z, x, y, z) { var i = Math.floor((x - Z.org.x) / Z.cell), j = Math.floor((y - Z.org.y) / Z.cell), k = Math.floor((z - Z.org.z) / Z.cell);
    if (i < 0 || j < 0 || k < 0 || i >= Z.nx || j >= Z.ny || k >= Z.nz) return -1; return i + j * Z.nx + k * Z.nx * Z.ny; }
  // D1: one ray through the grid, step CELL/4 from p; SOLID = blocked (0), off grid or RAY_MAX reached = sky (1)
  function march(Z, px, py, pz, dx, dy, dz) { var st = Z.cell / 4;
    for (var t = 0; t <= RAY_MAX; t += st) { var c = cIdx(Z, px + dx * t, py + dy * t, pz + dz * t); if (c < 0) return 1; if (Z.zone[c] === SOLID) return 0; }
    return 1; }
  function nrm3(x, y, z) { var l = Math.sqrt(x * x + y * y + z * z) || 1; return [x / l, y / l, z / l]; }
  // the 5 §SKY_PORTAL_SIDE directions from p (the outward non-solid cell centre): up, out, out+up, out+along, out-along
  function skyFrac(Z, p, o, a) { var D = [[0, 1, 0], o, nrm3(o[0], o[1] + 1, o[2]), nrm3(o[0] + a[0], o[1] + a[1], o[2] + a[2]), nrm3(o[0] - a[0], o[1] - a[1], o[2] - a[2])], k = 0;
    for (var i = 0; i < 5; i++) k += march(Z, p[0], p[1], p[2], D[i][0], D[i][1], D[i][2]); return k / 5; }
  // top of the first SOLID cell below cell c (the floor under it); the grid floor when none
  function floorTop(Z, c) { var nx = Z.nx, j = ((c / nx) | 0) % Z.ny, base = c - j * nx;
    for (var jj = j - 1; jj >= 0; jj--) if (Z.zone[base + jj * nx] === SOLID) return Z.org.y + (jj + 1) * Z.cell;
    return Z.org.y; }
  function dayBase(A, Z) {
    if (Z.day0) return Z.day0;
    var THREE = global.THREE, t0 = performance.now(), SP = global.SkyPortal, cl = Z.cell, cf = cl * cl, nx = Z.nx, nxy = nx * Z.ny;
    var col = (SP && SP.collectPanes) ? SP.collectPanes(A, THREE, { roof: true }) : { panes: [], stats: {} }, panes = [], cnt = { tiles: col.panes.length, roof: 0, sidesOpen: 0, sidesEave: 0, skipped: 0, theta0: 0 };
    col.panes.forEach(function (p) {
      var n = p.n, sd = [1, -1].map(function (s) { var q = { x: p.c.x + s * 0.3 * n.x, y: p.c.y + s * 0.3 * n.y, z: p.c.z + s * 0.3 * n.z }; return surfaceInfo(q, { x: s * n.x, y: s * n.y, z: s * n.z }); });
      var cov = sd.map(function (r) { return r.zone > 0 && r.zone !== SOLID && r.cell >= 0; }), opn = sd.map(function (r) { return r.zone === 0 || r.zone === -1; }), inward = -1, kind = '';
      if (cov[0] && opn[1]) { inward = 0; kind = 'open'; } else if (cov[1] && opn[0]) { inward = 1; kind = 'open'; }
      else if (cov[0] && cov[1] && sd[0].sky !== sd[1].sky) { inward = sd[0].sky ? 1 : 0; kind = 'eave'; }   // D2: the sky-lit side (under an eave) is outward
      if (inward < 0) { cnt.skipped++; return; }
      if (kind === 'open') cnt.sidesOpen++; else cnt.sidesEave++;
      var s = inward === 0 ? -1 : 1, o = [s * n.x, s * n.y, s * n.z], oc = sd[1 - inward].cell;   // outward = away from the inward side
      // rays start at the CENTRE of the outward side's non-solid cell (the grid's own "air outside the pane": a fixed 0.5 m
      // offset landed inside the wall face's rasterised cell — unit test, 2026-09-25); off grid (no cell) = all sky
      var fr = oc < 0 ? 1 : skyFrac(Z, cCentre(Z, oc), o, [p.u.x, p.u.y, p.u.z]);
      var theta = (p.roof ? 180 : 90) * fr, cell = sd[inward].cell; if (p.roof) cnt.roof++; if (!(theta > 0)) cnt.theta0++;
      panes.push({ key: p.key, zone: sd[inward].zone, cell: cell, area: p.area, T: p.T, roof: p.roof, theta: theta, h: Math.max(cl / 2, p.c.y - floorTop(Z, cell)), dir: o });
    });
    // apertures per zone (§ZONE_OPEN_SKY faces to open cells): up faces theta 180; side faces 90 x mean sky fraction (D5)
    var ap = new Map(), SIDE = [[2, -1, 0, 0], [4, 1, 0, 0], [8, 0, 0, -1], [16, 0, 0, 1]];
    Z.zoneInfo.forEach(function (zi, i0) { var z = i0 + 1, cells = zi.apertureCells; if (!cells || !cells.length) return;
      var r = { upM2: 0, sideM2: 0, hA: 0, dir: [0, 0, 0], upCells: [], sideCells: [], sideFrac: 0, sideSamples: 0 }, faces = [];
      for (var q = 0; q < cells.length; q++) { var c = cells[q], b = Z.aperture[c], i = c % nx, j = ((c / nx) | 0) % Z.ny, k = (c / nxy) | 0, fl = floorTop(Z, c);
        if (b & 1) { r.upM2 += cf; r.hA += cf * Math.max(cl / 2, Z.org.y + (j + 1) * cl - fl); r.dir[1] += cf; r.upCells.push(c); }
        var side = false; for (var sI = 0; sI < 4; sI++) { var S = SIDE[sI]; if (!(b & S[0])) continue; side = true;
          r.sideM2 += cf; r.hA += cf * Math.max(cl / 2, Z.org.y + (j + 0.5) * cl - fl); r.dir[0] += cf * S[1]; r.dir[2] += cf * S[3];
          faces.push([Z.org.x + (i + 0.5 + 0.5 * S[1]) * cl, Z.org.y + (j + 0.5) * cl, Z.org.z + (k + 0.5 + 0.5 * S[3]) * cl, S[1], S[3]]); }
        if (side) r.sideCells.push(c); }
      if (faces.length) { var stride = Math.max(1, Math.ceil(faces.length / SIDE_SAMPLES)), sum = 0, m = 0;
        for (var f = 0; f < faces.length; f += stride) { var F = faces[f], o2 = [F[3], 0, F[4]];
          sum += skyFrac(Z, [F[0] + o2[0] * cl / 2, F[1], F[2] + o2[2] * cl / 2], o2, [o2[2], 0, -o2[0]]); m++; }   // from the open cell's centre
        r.sideFrac = sum / m; r.sideSamples = m; }
      ap.set(z, r); });
    Z.day0 = { panes: panes, ap: ap, cnt: cnt, byClass: col.stats.byClass, ms: Math.round(performance.now() - t0) };
    return Z.day0;
  }
  // per still. exclude = Set of pane keys carrying a live portal; kept = Set of keys of blocked portals (count in the DF).
  // Returns stats; writes Z.dayG (Uint16Array per cell: round(fraction x 10000), cap 65535) and Z.dayZones.
  function daylight(A, exclude, kept, dfOnly) {
    var Z = cache; if (!Z) return null;
    var t0 = performance.now(), B = dayBase(A, Z), tb = performance.now(), N = Z.zone.length, nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, cl = Z.cell;
    var zs = new Map(), portaled = 0, portaledKept = 0, keptKeys = [];
    function zrec(z) { var r = zs.get(z); if (!r) { r = { num: 0, vert: 0, roof: 0, apUp: 0, apSide: 0, hA: 0, A: 0, dir: [0, 0, 0], src: [], panes: 0 }; zs.set(z, r); } return r; }
    B.panes.forEach(function (p) {
      if (exclude && exclude.has(p.key)) { portaled++; return; }
      if (kept && kept.has(p.key)) { portaledKept++; keptKeys.push(p.key); }
      var r = zrec(p.zone); r.panes++; var w = p.T * p.area * p.theta; r.num += w; if (p.roof) r.roof += p.area; else r.vert += p.area;
      r.hA += p.area * p.h; r.A += p.area; r.dir[0] += p.area * p.dir[0]; r.dir[1] += p.area * p.dir[1]; r.dir[2] += p.area * p.dir[2];
      if (w > 0) r.src.push(p.cell); });
    B.ap.forEach(function (a, z) { var r = zrec(z), ts = 90 * a.sideFrac; r.num += a.upM2 * 180 + a.sideM2 * ts; r.apUp += a.upM2; r.apSide += a.sideM2;
      r.hA += a.hA; r.A += a.upM2 + a.sideM2; r.dir[0] += a.dir[0]; r.dir[1] += a.dir[1]; r.dir[2] += a.dir[2]; r.sideTheta = ts;
      for (var i = 0; i < a.upCells.length; i++) r.src.push(a.upCells[i]); if (ts > 0) for (var j = 0; j < a.sideCells.length; j++) r.src.push(a.sideCells[j]); });
    var zones = Z.zones, DF = new Float32Array(zones + 1), Dz = new Float32Array(zones + 1), lit = [];
    // D7: BRE's A = total area of the room surfaces INCLUDING the windows. Glass is SOLID, so the panes are already in
    // surfaceM2; the open apertures (faces to open-sky cells) are not, so they are added (a zone with open sides otherwise
    // divided its aperture light by its solid surface only).
    zs.forEach(function (r, z) { var zi = Z.zoneInfo[z - 1], surf = zi.surfaceM2 + zi.apertureM2; r.surf = surf; r.DF = surf > 0 ? r.num / (surf * (1 - R_BRE * R_BRE)) : 0; r.D = r.A > 0 ? r.hA / r.A : cl / 2;
      DF[z] = r.DF; Dz[z] = r.D; if (r.DF > 0) lit.push(z); });
    if (dfOnly) return { zones: zones, litZones: lit.length, B: B, zs: zs, DF: DF, R: R_BRE, buildMs: Math.round(performance.now() - t0) };   // §SKY_VIEW_FIELD V7: ADF cross-check only
    // multi-source BFS through zone cells (6-connected: a zone cell's non-solid neighbours are its own zone or open cells)
    if (!Z.dayBuf) Z.dayBuf = { dist: new Uint16Array(N), q: new Int32Array(N), G: new Uint16Array(N) };
    var dist = Z.dayBuf.dist, q = Z.dayBuf.q, G = Z.dayBuf.G, zone = Z.zone, h = 0, t = 0; dist.fill(65535); G.fill(0);
    zs.forEach(function (r) { if (!(r.DF > 0)) return; for (var i = 0; i < r.src.length; i++) { var c = r.src[i]; if (dist[c] !== 0) { dist[c] = 0; q[t++] = c; } } });
    while (h < t) { var c = q[h++], d1 = dist[c] + 1, i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0, v;
      if (d1 > 65534) continue;
      if (i > 0) { v = zone[c - 1]; if (v !== SOLID && v !== 0 && dist[c - 1] === 65535) { dist[c - 1] = d1; q[t++] = c - 1; } }
      if (i < nx - 1) { v = zone[c + 1]; if (v !== SOLID && v !== 0 && dist[c + 1] === 65535) { dist[c + 1] = d1; q[t++] = c + 1; } }
      if (j > 0) { v = zone[c - nx]; if (v !== SOLID && v !== 0 && dist[c - nx] === 65535) { dist[c - nx] = d1; q[t++] = c - nx; } }
      if (j < ny - 1) { v = zone[c + nx]; if (v !== SOLID && v !== 0 && dist[c + nx] === 65535) { dist[c + nx] = d1; q[t++] = c + nx; } }
      if (k > 0) { v = zone[c - nxy]; if (v !== SOLID && v !== 0 && dist[c - nxy] === 65535) { dist[c - nxy] = d1; q[t++] = c - nxy; } }
      if (k < nz - 1) { v = zone[c + nxy]; if (v !== SOLID && v !== 0 && dist[c + nxy] === 65535) { dist[c + nxy] = d1; q[t++] = c + nxy; } } }
    // mean f per zone over ALL its cells (D4), then G on the covered non-sky-lit cells
    var fs = new Float64Array(zones + 1), fn = new Int32Array(zones + 1), cells = 0, capped = 0;
    for (var a = 0; a < N; a++) { var va = zone[a]; if (va === SOLID || va === 0) continue; var za = va & ZONE_MASK; if (!(DF[za] > 0) || dist[a] === 65535) continue;
      var x = dist[a] * cl / Dz[za]; fs[za] += 1 / (1 + x * x); fn[za]++; }
    for (var b = 0; b < N; b++) { var vb = zone[b]; if (vb === SOLID || vb === 0 || (vb & SKY_BIT)) continue; var zb = vb & ZONE_MASK; if (!(DF[zb] > 0) || dist[b] === 65535 || !fn[zb]) continue;
      var y = dist[b] * cl / Dz[zb], g = Math.round(DF[zb] / 100 * (1 / (1 + y * y)) / (fs[zb] / fn[zb]) * 10000); if (g > 65535) { g = 65535; capped++; } G[b] = g; if (g) cells++; }
    Z.dayG = G; Z.dayZones = zs;
    var dfs = lit.map(function (z) { return DF[z]; }).sort(function (x, y2) { return x - y2; }), bands = [0, 0, 0];
    dfs.forEach(function (v2) { if (v2 < 2) bands[0]++; else if (v2 <= 5) bands[1]++; else bands[2]++; });
    var Tw = 0, Ta = 0; B.panes.forEach(function (p) { Tw += p.T * p.area; Ta += p.area; });
    return { zones: zones, litZones: lit.length, B: B, portaled: portaled, portaledKept: portaledKept, keptKeys: keptKeys, DF: DF, Dz: Dz, zs: zs, R: R_BRE,
      T: Ta ? Tw / Ta : 0, DFmedian: dfs.length ? dfs[Math.floor(dfs.length / 2)] : 0, DFmax: dfs.length ? dfs[dfs.length - 1] : 0, bands: bands, gCells: cells, gCapped: capped,
      bfsReached: t, baseMs: Math.round(tb - t0), buildMs: Math.round(performance.now() - t0) };
  }

  // ══ §SKY_VIEW_FIELD (bim-compiler PHOTOREAL_STILL_RENDER.md "§SKY_VIEW_FIELD — SPEC" + build decisions V1-V10) ══
  // ONE camera-independent field per covered cell: F = sum_d w_d v_d / sum_d w_d, v_d = 1 at an open-to-sky cell, carried
  // through empty cells, x T through a GLASS layer (once per pane: entering glass from air), 0 at any other solid (V2). CIE standard overcast sky (CIE S 011/E:2003
  // type 1): L ~ (1 + 2 sin(elev)); w_d = integral of cos(zenith) (1 + 2 sin(elev)) dOmega over the direction's nearest-
  // direction cell of the plane y = 1 square |x|,|z| <= 6 (V1). Cached per building (lazy: first Alt+S).
  var FIELD_DIRS = (function () {
    var D = [[0, 0]]; for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) if (dx || dz) D.push([dx, dz]);
    [4, 6].forEach(function (k) { [[k, 0], [-k, 0], [0, k], [0, -k], [k, k], [k, -k], [-k, k], [-k, -k]].forEach(function (q) { D.push(q); }); });
    var U = D.map(function (q) { var l = Math.sqrt(q[0] * q[0] + 1 + q[1] * q[1]); return [q[0] / l, 1 / l, q[1] / l]; }), W = new Float64Array(D.length), st = 0.05, tot = 0;
    for (var x = -6 + st / 2; x < 6; x += st) for (var z = -6 + st / 2; z < 6; z += st) {
      var r = Math.sqrt(x * x + 1 + z * z), ux = x / r, uy = 1 / r, uz = z / r, best = -2, bi = 0;
      for (var i = 0; i < U.length; i++) { var dd = ux * U[i][0] + uy * U[i][1] + uz * U[i][2]; if (dd > best) { best = dd; bi = i; } }
      var w = uy * (1 + 2 * uy) * st * st / (r * r * r); W[bi] += w; tot += w; }   // cos(zenith) = sin(elev) = 1/r; dOmega = dA/r^3
    var out = D.map(function (q, i) { var mids = {}, EPS = 1e-6;   // cells the centre-to-centre segment crosses (as SKY_DIRS)
      for (var s2 = 1; s2 < 256; s2++) { var t = s2 / 256, px = 0.5 + q[0] * t, py = 0.5 + t, pz = 0.5 + q[1] * t, ax = [], ay = [], az = [];
        [[px, ax], [py, ay], [pz, az]].forEach(function (p) { var v = p[0]; if (Math.abs(v - Math.round(v)) < EPS) p[1].push(Math.round(v) - 1, Math.round(v)); else p[1].push(Math.floor(v)); });
        ax.forEach(function (a) { ay.forEach(function (b) { az.forEach(function (c) { if ((a || b || c) && !(a === q[0] && b === 1 && c === q[1])) mids[a + ',' + b + ',' + c] = [a, b, c]; }); }); }); }
      return { dx: q[0], dz: q[1], u: U[i], w: W[i] / tot, elev: Math.asin(U[i][1]) * 180 / Math.PI, mids: Object.keys(mids).map(function (k) { return mids[k]; }) }; });
    return out; })();
  function field(A) {
    var Z = cache; if (!Z) return null; if (Z.field) return Z.field;
    var t0 = performance.now(), nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, N = nx * ny * nz, zone = Z.zone, gT = Z.glassT;
    // active = covered cells + glass cells, top layer first
    var nAct = 0; for (var c0 = 0; c0 < N; c0++) { var v0 = zone[c0]; if ((v0 !== SOLID && v0 !== 0) || (v0 === SOLID && gT[c0])) nAct++; }
    var act = new Int32Array(nAct), ai = 0;
    for (var j = ny - 1; j >= 0; j--) for (var k = 0; k < nz; k++) for (var i = 0; i < nx; i++) { var c = i + j * nx + k * nxy, v = zone[c]; if ((v !== SOLID && v !== 0) || (v === SOLID && gT[c])) act[ai++] = c; }
    var val = new Float32Array(N), acc = new Float32Array(N), zb = new Float64Array((Z.zones + 1) * 3), T = new Float32Array(256);
    for (var q = 0; q < 256; q++) T[q] = q / 255;
    for (var c1 = 0; c1 < N; c1++) if (zone[c1] === 0) val[c1] = 1;
    FIELD_DIRS.forEach(function (d) {
      var dx = d.dx, dz = d.dz, off = dx + nx + dz * nxy, M = d.mids, nm = M.length, mo = new Int32Array(nm), mx = new Int32Array(nm), my = new Int32Array(nm), mz = new Int32Array(nm), w = d.w, ux = d.u[0], uy = d.u[1], uz = d.u[2];
      for (var m = 0; m < nm; m++) { mx[m] = M[m][0]; my[m] = M[m][1]; mz[m] = M[m][2]; mo[m] = M[m][0] + M[m][1] * nx + M[m][2] * nxy; }
      for (var a = 0; a < nAct; a++) { var c = act[a], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0, ti = i + dx, tk = k + dz, vt;
        if (j + 1 >= ny || ti < 0 || tk < 0 || ti >= nx || tk >= nz) vt = 1; else vt = val[c + off];   // off the grid = sky
        var zc = zone[c], inG = zc === SOLID, gmin = 256;   // inG: c is a glass cell (its value is "seen from inside the glass")
        if (vt > 0) { if (!inG && j + 1 < ny && ti >= 0 && tk >= 0 && ti < nx && tk < nz && gT[c + off]) gmin = gT[c + off];
          for (var m2 = 0; m2 < nm; m2++) { var ii = i + mx[m2], jj = j + my[m2], kk = k + mz[m2]; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || jj >= ny) continue;
            var cm = c + mo[m2]; if (zone[cm] === SOLID) { var gq = gT[cm]; if (gq) { if (gq < gmin) gmin = gq; } else { vt = 0; break; } } }
          // one pane = one T: the fattened glass layer spans 1-3 cells, so T is applied ONCE when a ray enters glass from air
          // (a segment that touches glass: target or mid cells), never between glass cells; a second pane after air counts again
          if (!inG && gmin < 256) vt *= T[gmin]; }
        val[c] = vt; if (zc !== SOLID && vt > 0) { acc[c] += w * vt; var zz = (zc & ZONE_MASK) * 3; zb[zz] += w * vt * ux; zb[zz + 1] += w * vt * uy; zb[zz + 2] += w * vt * uz; } } });
    // V12 interreflected component per zone (flux balance, Sumpner; the relation BRE's ADF is derived from):
    // F_ir = R (mean working-plane F x floor m2) / (A_z (1 - R)), R = R_BRE, A_z = surfaceM2 + apertureM2; uniform over the zone
    var nzn = Z.zones, up = Math.floor(0.8 / Z.cell) * nx, fl = new Float64Array(nzn + 1), wpS = new Float64Array(nzn + 1), wpN = new Int32Array(nzn + 1), cf = Z.cell * Z.cell;
    for (var c3 = nx; c3 < N; c3++) { var v3 = zone[c3]; if (v3 === SOLID || v3 === 0 || zone[c3 - nx] !== SOLID) continue; var z3 = v3 & ZONE_MASK; fl[z3] += cf;
      var w3 = c3 + up; if (w3 < N && zone[w3] !== SOLID && (zone[w3] & ZONE_MASK) === z3) { wpS[z3] += acc[w3]; wpN[z3]++; } }
    var irc = new Float32Array(nzn + 1), ircAll = new Float32Array(nzn + 1), ircL = [];   // ircAll: V12 per zone whether or not IRC is in F (§IRC_MAX v2 reads it)
    // IRC OFF by default (watchdog, 2026-09-25): the still's GI bounce pass (gi_still.js) already carries interreflection, so
    // V12 would count it twice and is a flat per-zone fill; &irc=1 / APP._stillIrc = true keeps it for A/B (logged)
    var ircOn = ircFlag(A);
    for (var z4 = 1; z4 <= nzn; z4++) { var zi4 = Z.zoneInfo[z4 - 1], Az = zi4.surfaceM2 + zi4.apertureM2; if (!wpN[z4] || !(Az > 0)) continue;
      var ir = R_BRE * (wpS[z4] / wpN[z4]) * fl[z4] / (Az * (1 - R_BRE)); if (ir > 0) ircL.push(ir); ircAll[z4] = ir; if (ircOn) irc[z4] = ir; }
    ircL.sort(function (x, y) { return x - y; });
    // G: F x 10000 in every non-solid cell (open = 10000)
    var G = new Uint16Array(N), maxF = 0, covered = 0, maxSC = 0;
    for (var c2 = 0; c2 < N; c2++) { var v2 = zone[c2]; if (v2 === SOLID) continue; if (v2 === 0) { G[c2] = 10000; continue; } covered++; var sc = acc[c2]; if (sc > maxSC) maxSC = sc;
      var f = Math.min(1, sc + irc[v2 & ZONE_MASK]); if (f > maxF) maxF = f; G[c2] = Math.round(f * 10000); }
    val = acc = null;
    var minElev = FIELD_DIRS.reduce(function (m, d) { return Math.min(m, d.elev); }, 90);
    Z.field = { G: G, maxF: maxF, maxSC: maxSC, ircZ: irc, ircAll: ircAll, irc: { on: ircOn, zones: ircL.length, median: ircL.length ? ircL[ircL.length >> 1] : 0, max: ircL.length ? ircL[ircL.length - 1] : 0 }, covered: covered, active: nAct, bent: zb, dirs: FIELD_DIRS.length, minElevDeg: minElev, ms: Math.round(performance.now() - t0),
      weights: FIELD_DIRS.map(function (d) { return +d.w.toFixed(4); }) };
    scheduleSave();
    return Z.field;
  }
  // CPU mirror of the shader's filtered read (V5): p = surface point, nrm = eye-facing normal; returns { zone, F } where zone
  // is surfaceInfo's; outside (0 / off grid) F = 1; unknown (SOLID) F = null (the shader uses indoorSky there)
  function skyField(p, nrm) {
    var Z = cache, si = surfaceInfo(p, nrm); if (!Z || !Z.field) return { zone: si.zone, F: null, si: si };
    if (si.zone === -1) return { zone: si.zone, F: 1, si: si };   // off grid; open (0): filtered, every non-solid cell accepted
    if (si.zone === SOLID) return { zone: si.zone, F: null, si: si };
    var cl = Z.cell, G = Z.field.G, nxy = Z.nx * Z.ny, gx = (p.x + nrm.x * 0.5 * cl - Z.org.x) / cl - 0.5, gy = (p.y + nrm.y * 0.5 * cl - Z.org.y) / cl - 0.5, gz = (p.z + nrm.z * 0.5 * cl - Z.org.z) / cl - 0.5;
    var bx = Math.floor(gx), by = Math.floor(gy), bz = Math.floor(gz), fx = gx - bx, fy = gy - by, fz = gz - bz, sw = 0, sf = 0;
    for (var o = 0; o < 8; o++) { var ox = o & 1, oy = (o >> 1) & 1, oz = (o >> 2) & 1, i = bx + ox, j = by + oy, k = bz + oz;
      if (i < 0 || j < 0 || k < 0 || i >= Z.nx || j >= Z.ny || k >= Z.nz) continue; var c = i + j * Z.nx + k * nxy, t = Z.zone[c]; if (t === SOLID) continue;
      var tz = t & ZONE_MASK; if (si.zone !== 0 && tz !== si.zone && tz !== 0) continue;
      var w = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy) * (oz ? fz : 1 - fz); sw += w; sf += w * G[c] / 10000; }
    return { zone: si.zone, F: sw > 0 ? sf / sw : (si.cell >= 0 ? G[si.cell] / 10000 : 0), si: si };
  }

  // §GLASS_SPEC_GATE CPU mirror (sourced_light.js slSpecKeep, same order): the reflection gate at surface point p seen from eye.
  // base = what slSkyKeep gives (sky-view F; unknown/solid 0 = indoorSky default); the mirror ray marched 0.25 m x 32 from
  // p + 0.25 n: off grid / OPEN -> 1, SOLID (after the first 1 m) -> base.
  function specVis(p, nrm, eye) {
    var Z = cache; if (!Z || !Z.field) return null;
    var vx = p.x - eye.x, vy = p.y - eye.y, vz = p.z - eye.z, vl = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1; vx /= vl; vy /= vl; vz /= vl;
    var nx = nrm.x, ny = nrm.y, nz = nrm.z; if (nx * vx + ny * vy + nz * vz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    var sf = skyField(p, { x: nx, y: ny, z: nz }), base = sf.F == null ? 0 : sf.F; if (base >= 0.999) return { base: base, spec: base };
    var d = vx * nx + vy * ny + vz * nz, rx = vx - 2 * d * nx, ry = vy - 2 * d * ny, rz = vz - 2 * d * nz, st = 0.5 * Z.cell, qx = p.x + nx * st, qy = p.y + ny * st, qz = p.z + nz * st;
    for (var k = 0; k < 32; k++) { var c = cellOf(Z, qx, qy, qz); if (c < 0) return { base: base, spec: 1 }; var t = Z.zone[c];
      if (t === SOLID) { if (k >= 4) return { base: base, spec: base }; } else if ((t & ZONE_MASK) === 0) return { base: base, spec: 1 };
      qx += rx * st; qy += ry * st; qz += rz * st; }
    return { base: base, spec: base };
  }
  global.LightZones = { specVis: specVis, prime: prime, primed: function (A) { return !!(primed && A && primed.bld === A.activeBuilding); }, cacheKey: function () { return SRC; }, field: field, skyField: skyField, FIELD_DIRS: FIELD_DIRS, daylight: daylight, dayBase: dayBase, audit: audit, cellSky: cellSkyNew, skySweep: skySweep, openMask: openMask, bandPass3: bandPass3, OVER_VOID_M: OVER_VOID_M, lampInfo: lampInfo, bandPass: bandPass, band: band, leakPath: leakPath, build: build, at: at, atRaw: atRaw, skyAt: skyAt, surfaceInfo: surfaceInfo, atSurface: atSurface, atLamp: atLamp,
    SOLID: SOLID, SKY_BIT: SKY_BIT, ZONE_MASK: ZONE_MASK, get: function () { return cache; }, CELL: CELL };
})(typeof window !== 'undefined' ? window : this);
