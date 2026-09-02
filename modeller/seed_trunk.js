/**
 * seed_trunk.js — the human-in-the-loop SEED → 3D corridor trunk, promoted from the W-SEED-TRUNK / W-CORRIDOR-TRUNK /
 * W-RISER-TRUNK witness spikes into ONE reusable engine module (bim-compiler + bim-ootb modeller).
 *
 * DOCTRINE (docs/internal/WalkerDoctrine.md + WalkerMaturity.md SEED-TRUNK): a GENERATED discipline (one the building
 * LACKS) is filled by density + host-bind, but WHERE it starts is the engineer's call. The human assigns a SEED (a real
 * entry element); planTrunk routes a service trunk from it — corridor-aware per storey (around walls, through real doors)
 * and joined across storeys by RISERS at real stairs. NON-INVENT: every blocked nav cell is a real wall, every passage a
 * real door, every riser a real IfcStair; an unreachable fixture is REFUSED, never forced. The route is GENERATED/
 * plausible (no ground truth for an absent discipline) — the guarantees are falsifiable: it does not cross walls, it
 * rises only at real stairs, and it refuses what it cannot reach.
 *
 * API:  planTrunk(bdb, fixtures, seedPt, risers, opts) -> {
 *          storeys:[{name,z,served,refused,len,cross,edges:[[x,y,z]..polyline]}], risers:[{x,y,z0,z1,guid}],
 *          served, refused, totalLen, seed, oneNetwork:bool }
 *   bdb       = a building extracted.db handle (exec(sql) → sql.js result) for wall/door queries.
 *   fixtures  = [{x,y,z,storey,host?}]  (e.g. DiscWalker.dwWalk(disc,bdb).placements)
 *   seedPt    = {x,y,storey}            (e.g. DiscWalker.defaultSeed(bdb))  — the ground entry
 *   risers    = [{x,y,guid}]            real IfcStair columns (deduped by XY)
 *   opts.cell (0.25), opts.groundStorey (else lowest-z storey present in fixtures)
 */
(function (root) {
  'use strict';
  function _rows(bdb, sql) { var r = bdb.exec(sql); if (!r.length) return [];
    return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }
  function _esc(s) { return String(s).replace(/'/g, "''"); }

  function Heap() { this.a = []; }
  Heap.prototype.push = function (n, d) { var a = this.a; a.push([d, n]); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
  Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; var i = 0, n = a.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i;
      if (l < n && a[l][0] < a[m][0]) m = l; if (r < n && a[r][0] < a[m][0]) m = r; if (m === i) break;
      var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } } return top; };
  Heap.prototype.size = function () { return this.a.length; };

  // nav grid from REAL walls (blocked) + REAL doors (carved passages)
  function makeGrid(walls, doors, bb, CELL) {
    var PAD = CELL / 2, DOOR_R = 0.6, x0 = bb.x0 - 1, y0 = bb.y0 - 1;
    var nx = Math.ceil((bb.x1 - bb.x0 + 2) / CELL), ny = Math.ceil((bb.y1 - bb.y0 + 2) / CELL);
    function cx(ix) { return x0 + (ix + 0.5) * CELL; } function cy(iy) { return y0 + (iy + 0.5) * CELL; }
    function inWall(px, py, w, pad) { return px >= w.x - w.bx / 2 - pad && px <= w.x + w.bx / 2 + pad &&
      py >= w.y - w.by_ / 2 - pad && py <= w.y + w.by_ / 2 + pad; }
    function nearDoor(px, py) { for (var i = 0; i < doors.length; i++) if (Math.hypot(px - doors[i].x, py - doors[i].y) <= DOOR_R) return true; return false; }
    var blocked = new Uint8Array(nx * ny);
    for (var iy = 0; iy < ny; iy++) for (var ix = 0; ix < nx; ix++) { var px = cx(ix), py = cy(iy), hit = false;
      for (var k = 0; k < walls.length; k++) if (inWall(px, py, walls[k], PAD)) { hit = true; break; }
      if (hit && nearDoor(px, py)) hit = false; if (hit) blocked[iy * nx + ix] = 1; }
    function snap(px, py) { var ix0 = Math.round((px - x0) / CELL - 0.5), iy0 = Math.round((py - y0) / CELL - 0.5);
      for (var r = 0; r < Math.max(nx, ny); r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; var ix = ix0 + dx, iy = iy0 + dy;
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue; if (!blocked[iy * nx + ix]) return iy * nx + ix; } return -1; }
    function dijkstra(srcCells) { var n = nx * ny, dist = new Float64Array(n).fill(Infinity), pred = new Int32Array(n).fill(-1), h = new Heap();
      srcCells.forEach(function (c) { if (c >= 0) { dist[c] = 0; h.push(c, 0); } });
      var NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
      while (h.size()) { var top = h.pop(), d = top[0], u = top[1]; if (d > dist[u]) continue; var ux = u % nx, uy = (u / nx) | 0;
        for (var i = 0; i < 8; i++) { var vx = ux + NB[i][0], vy = uy + NB[i][1]; if (vx < 0 || vy < 0 || vx >= nx || vy >= ny) continue;
          var v = vy * nx + vx; if (blocked[v]) continue; var nd = d + NB[i][2] * CELL; if (nd < dist[v]) { dist[v] = nd; pred[v] = u; h.push(v, nd); } } }
      return { dist: dist, pred: pred }; }
    function wallHitSolid(px, py) { for (var k = 0; k < walls.length; k++) if (inWall(px, py, walls[k], 0) && !nearDoor(px, py)) return true; return false; }
    return { nx: nx, cx: cx, cy: cy, snap: snap, dijkstra: dijkstra, wallHitSolid: wallHitSolid };
  }
  // union of each reached node's shortest path back to its nearest source → backbone polylines + length + wall-crossings
  function backbone(grid, srcCells, nodeCells, z) {
    var dj = grid.dijkstra(srcCells), used = {}, reached = [], cross = 0, len = 0, polys = [];
    nodeCells.forEach(function (c, idx) {
      if (c < 0 || !isFinite(dj.dist[c])) return; reached.push(idx);
      var cur = c, g = 0, poly = [];
      while (cur !== -1 && g++ < 1e5) { poly.push([grid.cx(cur % grid.nx), grid.cy((cur / grid.nx) | 0), z]);
        var p = dj.pred[cur]; if (p === -1) break;
        var key = cur < p ? cur + '_' + p : p + '_' + cur;
        if (!used[key]) { used[key] = 1;
          var mx = (grid.cx(cur % grid.nx) + grid.cx(p % grid.nx)) / 2, my = (grid.cy((cur / grid.nx) | 0) + grid.cy((p / grid.nx) | 0)) / 2;
          if (grid.wallHitSolid(mx, my)) cross++;
          len += Math.hypot(grid.cx(cur % grid.nx) - grid.cx(p % grid.nx), grid.cy((cur / grid.nx) | 0) - grid.cy((p / grid.nx) | 0)); }
        cur = p; }
      polys.push(poly);
    });
    return { reached: reached, len: len, cross: cross, polys: polys };
  }

  function planTrunk(bdb, fixtures, seedPt, risers, opts) {
    opts = opts || {}; var CELL = opts.cell || 0.25;
    var bb = _rows(bdb, "SELECT MIN(center_x) x0, MAX(center_x) x1, MIN(center_y) y0, MAX(center_y) y1 FROM element_transforms")[0];
    var byS = {}; fixtures.forEach(function (p) { (byS[p.storey] = byS[p.storey] || []).push(p); });
    var storeys;
    if (opts.storeys && opts.storeys.length) {
      // CALLER-SUPPLIED storey levels (the modeller has the storey tree → structural floor z, not fixture-mount z).
      // This is the intended path: a riser climbs structural levels, not the elevated fixture median.
      storeys = opts.storeys.filter(function (s) { return byS[s.name]; })
        .map(function (s) { return { name: s.name, z: s.z, fx: byS[s.name] }; }).sort(function (a, b) { return a.z - b.z; });
    } else {
      // FALLBACK (no storey tree): structural floor level ≈ the LOW fixture z per storey (fixtures mount above the floor),
      // and serve only storeys with ≥1 fixture. Coarser than caller-supplied; the modeller should pass opts.storeys.
      storeys = Object.keys(byS).map(function (name) { var zs = byS[name].map(function (p) { return p.z; }).sort(function (a, b) { return a - b; });
        return { name: name, z: zs[Math.floor(zs.length * 0.1)], fx: byS[name] }; }).sort(function (a, b) { return a.z - b.z; });
    }
    if (!storeys.length) return { refused: true, reason: 'no fixtures to route' };
    // ground = the storey the SEED sits on (the service enters there), else the caller's groundStorey, else lowest.
    var gName = opts.groundStorey || (seedPt && seedPt.storey);
    var ground = gName ? storeys.filter(function (s) { return s.name === gName; })[0] : storeys[0];
    if (!ground) ground = storeys[0];
    // NOTE: parenthesize z — a NEGATIVE storey z (e.g. a foundation at -1.4) would render `center_z--1.4`, and SQLite
    // reads `--` as a line comment, truncating the query ("incomplete input"). `(z)` keeps it a subtraction.
    function wallsNear(z) { return _rows(bdb, "SELECT t.center_x x, t.center_y y, t.bbox_x bx, t.bbox_y by_ FROM elements_meta m " +
      "JOIN element_transforms t ON m.guid=t.guid WHERE (m.ifc_class LIKE '%Wall%' OR m.ifc_class LIKE '%Column%') AND ABS(t.center_z-(" + z + "))<1.8"); }
    function doorsOn(name) { return _rows(bdb, "SELECT t.center_x x, t.center_y y FROM elements_meta m JOIN element_transforms t " +
      "ON m.guid=t.guid WHERE m.ifc_class LIKE '%Door%' AND m.storey='" + _esc(name) + "'"); }

    var out = { seed: seedPt, risers: [], storeys: [], served: 0, refused: 0, totalLen: 0, oneNetwork: true };
    // GROUND: corridor backbone from the seed; must also reach every riser base
    var gGrid = makeGrid(wallsNear(ground.z), doorsOn(ground.name), bb, CELL);
    var seedCell = gGrid.snap(seedPt.x, seedPt.y);
    var riserBaseCells = risers.map(function (r) { return gGrid.snap(r.x, r.y); });
    var gFxCells = ground.fx.map(function (p) { return gGrid.snap(p.x, p.y); });
    var gBB = backbone(gGrid, [seedCell], riserBaseCells.concat(gFxCells), ground.z);
    var risersFed = risers.map(function (r, i) { return gBB.reached.indexOf(i) >= 0; });
    var gReached = gBB.reached.filter(function (idx) { return idx >= risers.length; }).length;
    out.storeys.push({ name: ground.name, z: ground.z, served: gReached, refused: ground.fx.length - gReached,
      len: gBB.len, cross: gBB.cross, edges: gBB.polys });
    out.served += gReached; out.refused += ground.fx.length - gReached; out.totalLen += gBB.len;
    var fedRisers = risers.filter(function (r, i) { return risersFed[i]; });
    fedRisers.forEach(function (r) { out.risers.push({ x: r.x, y: r.y, guid: r.guid, z0: ground.z, z1: null }); });

    // UPPER storeys: each fixture fed by its NEAREST REACHABLE fed-riser (multi-source); refuse the rest
    storeys.forEach(function (S) {
      if (S === ground) return;
      var grid = makeGrid(wallsNear(S.z), doorsOn(S.name), bb, CELL);
      var srcCells = fedRisers.map(function (r) { return grid.snap(r.x, r.y); });
      var fxCells = S.fx.map(function (p) { return grid.snap(p.x, p.y); });
      var bbk = srcCells.length ? backbone(grid, srcCells, fxCells, S.z) : { reached: [], len: 0, cross: 0, polys: [] };
      out.storeys.push({ name: S.name, z: S.z, served: bbk.reached.length, refused: S.fx.length - bbk.reached.length,
        len: bbk.len, cross: bbk.cross, edges: bbk.polys });
      out.served += bbk.reached.length; out.refused += S.fx.length - bbk.reached.length; out.totalLen += bbk.len;
      // riser vertical edges to this storey (length)
      fedRisers.forEach(function (r) { out.totalLen += (S.z - ground.z); });
    });
    out.risers.forEach(function (r) { r.z1 = storeys[storeys.length - 1].z; });
    out.oneNetwork = risersFed.some(Boolean) || storeys.length === 1;
    return out;
  }

  var API = { planTrunk: planTrunk, makeGrid: makeGrid, backbone: backbone };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.SeedTrunk = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
