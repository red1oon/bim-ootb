// civil_sections.js — §LONG_SECTION + §CROSS_SECTION (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §NEXT_WAVE).
// Implementing CIVIL_HIGHWAY_JELAPANG.md §LONG_SECTION / §CROSS_SECTION — Witness: viewer/tests/witness_civil_sections.js
//
// GATE (NON-IMPACT RULE): A.isCivilModel() (streaming.js) AND a route from A.civilDriveRoute() (effects.js). A building
// has neither -> no button, no panel, every function returns null. Nothing here runs at load except a 1.5 s poll that
// reads the already-cached A.isCivilModel().
//
// OWNERS REUSED (no second implementation):
//   route                A.civilDriveRoute()          effects.js  (§CHAINAGE_V2 — the film's drive route, three coords)
//   chainage convention  horizontal (xz) cumulative length, identical to cpe_road_panels.js _chainager / A.civilChainageAt
//   ground / road hit    A.raycaster-style Raycaster over scene meshes (merged meshes carry their own AABB-culled
//                        raycast, streaming.js A._installMergedRaycast); discipline = mesh.userData.disc
//   section box          A.sectionPlane / A.sectionOn / A.toggleSection  tools.js (§CROSS_SECTION orients that plane)
//   element extents      A._mergedMeta[meshId][i] {guid, disc, minX..maxZ} (streaming.js §MERGED_GUID)
//
// SAMPLING Δs: 10 m. Why: the route itself is built from 50 m median bins (tour.js BIN_M) and then smoothed, so anything
// finer than ~10 m samples noise not road; 10 m keeps a 2-3 km road at 200-300 samples (3 rays each) and is raised
// automatically so n never exceeds MAX_N = 500. The chart is for navigation/hand-off, not gradient design — it is
// labelled "chainage (inferred)" because the chainage is the inferred route's, not an IFC alignment's.
function setupCivilSections(A) {
  'use strict';
  var DS_M = 10, MAX_N = 500, SLAB_M = 2;   // presentation/engineering constants, stated above
  var _ls = null;                            // cached long section {db, ds, r}
  var _ray = null;

  function _civil() { return !!(A.db && A.isCivilModel && A.isCivilModel() && typeof A.civilDriveRoute === 'function'); }
  function _route() { if (!_civil()) return null; var r = A.civilDriveRoute(); return (r && r.length >= 2) ? r : null; }

  // cumulative horizontal length + point/tangent at s on the polyline
  function _cum(r) { var c = [0]; for (var i = 1; i < r.length; i++) c.push(c[i - 1] + Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z)); return c; }
  var _cumRoute = null, _cumVal = null;
  function _cumOf(r) { if (_cumRoute !== r) { _cumRoute = r; _cumVal = _cum(r); } return _cumVal; }
  A.civilRouteAt = function (s) {
    var r = _route(); if (!r) return null;
    var c = _cumOf(r), L = c[c.length - 1]; s = Math.max(0, Math.min(L, s));
    var j = 1; while (j < r.length - 1 && c[j] <= s) j++;
    var seg = c[j] - c[j - 1], u = seg > 1e-9 ? (s - c[j - 1]) / seg : 0;
    var a = r[j - 1], b = r[j], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    return { s: s, len: L, x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), z: a.z + u * (b.z - a.z), tx: tx / tl, tz: tz / tl };
  };

  // discipline of a raycast hit: uniform meshes carry userData.disc (batched buckets always; instanced when every instance
  // shares one); a mixed InstancedMesh leaves it unset, so the per-instance meta (A._instanceMeta, §S280d) decides.
  function _discOfHit(h) {
    var o = h.object, d = o.userData && o.userData.disc;
    if (d != null) return d;
    if (o.isInstancedMesh && h.instanceId != null && A._instanceMeta && A._instanceMeta[o.id]) { var m = A._instanceMeta[o.id][h.instanceId]; return m ? m.disc : null; }
    return null;
  }
  // meshes that CAN hold the discipline (uniform match, or an instanced mesh whose discipline is per-instance)
  function _targets(disc) {
    return A.collectMeshes(function (o) { return o.isMesh && o.userData && (o.userData.disc === disc || (o.userData.disc == null && o.isInstancedMesh)); });
  }
  var _yr = {};   // world y extent of a discipline's meshes, per db (ray origin heights)
  function _yRange(disc, tg) {
    var c = _yr[disc]; if (c && c.db === A.db) return c.v;
    var lo = Infinity, hi = -Infinity, bx = new THREE.Box3();
    tg.forEach(function (o) { try { bx.setFromObject(o); } catch (e) { return; } if (isFinite(bx.min.y)) { lo = Math.min(lo, bx.min.y); hi = Math.max(hi, bx.max.y); } });
    var v = isFinite(lo) ? { lo: lo, hi: hi } : null; _yr[disc] = { db: A.db, v: v }; return v;
  }
  // ── fast path for BatchedMesh targets (§PROFILE_LENS precompute). THREE's BatchedMesh.raycast re-tests every triangle of the bucket
  // per ray (measured 0.6-8 ms/ray, DoubleSide, no BVH on the batched geometry) -> 2111 x 3 rays = 49 s. Instead: per slot, the slot's
  // world AABB (xz) selects the few elements under (x,z), and the ray is cast in the slot's LOCAL space against the slot's source
  // geometry (userData.slotGeo = the shared meshCache geometry, which already carries a three-mesh-bvh boundsTree when loader built
  // one; built lazily here only when a candidate lacks it and has > BVH_MIN_TRIS). Same triangles, same DoubleSide rule as THREE.
  var BVH_MIN_TRIS = 400, _bi = {}, _bvhBuilt = 0, _bvhReused = 0;
  function _batchIndex(o) {
    var c = _bi[o.id]; if (c && c.db === A.db && c.gen === A._metaGen) return c.v;
    var v = [], m4 = new THREE.Matrix4(), bx = new THREE.Box3(), sg = o.userData.slotGeo || {}, meta = A._batchMeta && A._batchMeta[o.id] || [];
    meta.forEach(function (m) {
      var g = sg[m.slotId]; if (!g) return; if (!g.boundingBox) g.computeBoundingBox();
      o.getMatrixAt(m.slotId, m4); var full = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, m4);
      bx.copy(g.boundingBox).applyMatrix4(full); v.push({ g: g, full: full, inv: full.clone().invert(), minX: bx.min.x, maxX: bx.max.x, minZ: bx.min.z, maxZ: bx.max.z });
    });
    _bi[o.id] = { db: A.db, gen: A._metaGen, v: v }; return v;
  }
  var _lr = null, _tri = null, _hit = null;
  function _batchedBest(o, x, z, y0, dir, far) {   // best world y among this batched mesh's elements under (x,z): highest for dir -1, lowest for dir +1
    if (!_lr) { _lr = new THREE.Ray(); _tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; _hit = new THREE.Vector3(); }
    var idx = _batchIndex(o), best = null, side = o.material && o.material.side != null ? o.material.side : THREE.FrontSide;
    for (var i = 0; i < idx.length; i++) {
      var e = idx[i]; if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) continue;
      var g = e.g; _lr.origin.set(x, y0, z); _lr.direction.set(0, dir, 0); _lr.applyMatrix4(e.inv);
      var py = null;
      if (!g.boundsTree && window._bvhReady && g.computeBoundsTree && ((g.index ? g.index.count : g.attributes.position.count) / 3) > BVH_MIN_TRIS) { try { g.computeBoundsTree(); _bvhBuilt++; } catch (er) {} }
      if (g.boundsTree) {
        _bvhReused++; var h = g.boundsTree.raycastFirst(_lr, side);
        if (h) { _hit.copy(h.point).applyMatrix4(e.full); py = _hit.y; }
      } else {
        var pos = g.attributes.position, ix = g.index, n = ix ? ix.count : pos.count, bd = Infinity;
        for (var t = 0; t < n; t += 3) {
          var a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
          _tri[0].fromBufferAttribute(pos, a); _tri[1].fromBufferAttribute(pos, b); _tri[2].fromBufferAttribute(pos, c);
          if (_lr.intersectTriangle(_tri[0], _tri[1], _tri[2], side === THREE.FrontSide, _hit)) { _hit.applyMatrix4(e.full); if (py == null || (dir < 0 ? _hit.y > py : _hit.y < py)) py = _hit.y; }
        }
      }
      if (py != null && Math.abs(py - y0) <= far && (best == null || (dir < 0 ? py > best : py < best))) best = py;
    }
    return best;
  }
  A._civilFastStats = function () { return { bvhBuilt: _bvhBuilt, bvhReused: _bvhReused }; };
  // one vertical cast: dir -1 = down from above (the HIGHEST hit of `disc`), +1 = up from below (the LOWEST hit of `disc`)
  function _cast(tg, disc, x, z, y0, dir, far) {
    if (!_ray) { _ray = new THREE.Raycaster(); _ray.firstHitOnly = false; }
    A._civilRayCount = (A._civilRayCount || 0) + 1;   // §PROFILE_LENS: the witness proves hover/drag/wheel make 0 casts
    var best = null, rest = [];
    for (var k = 0; k < tg.length; k++) {
      if (tg[k].isBatchedMesh && tg[k].userData.disc === disc && A._batchMeta && A._batchMeta[tg[k].id]) { var b = _batchedBest(tg[k], x, z, y0, dir, far); if (b != null && (best == null || (dir < 0 ? b > best : b < best))) best = b; }
      else rest.push(tg[k]);
    }
    if (rest.length) {
      _ray.set(new THREE.Vector3(x, y0, z), new THREE.Vector3(0, dir, 0)); _ray.near = 0; _ray.far = far;
      var h; try { h = _ray.intersectObjects(rest, false); } catch (e) { h = []; }
      for (var i = 0; i < h.length; i++) if (_discOfHit(h[i]) === disc) { var y = h[i].point.y; if (best == null || (dir < 0 ? y > best : y < best)) best = y; break; }   // sorted by distance from the origin
    }
    return best;
  }
  // Public: the vertical cast the long section uses, so a witness/other caller reaches the SAME owner.
  A.civilCastZ = function (x, z, disc, up) {
    if (!_civil()) return null;
    var tg = _targets(disc), yr = _yRange(disc, tg); if (!yr) return null;
    return up ? _cast(tg, disc, x, z, yr.lo - 1, 1, yr.hi - yr.lo + 2) : _cast(tg, disc, x, z, yr.hi + 1, -1, yr.hi - yr.lo + 2);
  };

  A.civilLongSection = function (opts) {
    var r = _route(); if (!r) return null;
    var t0 = performance.now();
    var c = _cumOf(r), L = c[c.length - 1], ds = Math.max((opts && opts.ds) || DS_M, L / (MAX_N - 1));
    if (_ls && _ls.db === A.db && _ls.ds === ds && !(opts && opts.fresh)) return _ls.r;
    var n = Math.floor(L / ds) + 2, out = { ds: ds, len: L, n: n, s: [], road: [], ground: [], drain: [], gate: 'civil+route' };
    var tR = _targets('ROAD'), tG = _targets('EARTHWORK'), tD = _targets('DRAINAGE');
    var yR = _yRange('ROAD', tR), yG = _yRange('EARTHWORK', tG), yD = _yRange('DRAINAGE', tD);
    for (var i = 0; i < n; i++) {
      var s = (i === n - 1) ? L : i * ds, p = A.civilRouteAt(s);
      out.s.push(s);
      out.road.push(yR ? _cast(tR, 'ROAD', p.x, p.z, yR.hi + 1, -1, yR.hi - yR.lo + 2) : null);
      out.ground.push(yG ? _cast(tG, 'EARTHWORK', p.x, p.z, yG.hi + 1, -1, yG.hi - yG.lo + 2) : null);
      out.drain.push(yD ? _cast(tD, 'DRAINAGE', p.x, p.z, yD.lo - 1, 1, yD.hi - yD.lo + 2) : null);
    }
    var cnt = function (a) { return a.filter(function (v) { return v != null; }).length; };
    var ms = performance.now() - t0, heap = (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'NA');
    console.log('§LONG_SECTION samples=' + n + ' ds=' + ds.toFixed(2) + 'm routeLen=' + L.toFixed(1) + 'm road=' + cnt(out.road) + ' ground=' + cnt(out.ground) +
      ' drain=' + cnt(out.drain) + ' targets=' + tR.length + '/' + tG.length + '/' + tD.length + ' rays=' + 3 * n + ' ms=' + ms.toFixed(0) + ' heapMB=' + heap + ' vertsAdded=0 label=chainage(inferred)');
    _ls = { db: A.db, ds: ds, r: out }; return out;
  };

  // ── §CROSS_SECTION: the existing section plane (tools.js A.sectionPlane), oriented square to the route tangent ──
  var _plane2 = null;
  A.civilCrossSection = function (s, widthM) {
    var p = A.civilRouteAt(s); if (!p) return null;
    var w = widthM > 0 ? widthM : SLAB_M, T = new THREE.Vector3(p.tx, 0, p.tz);
    var d = T.x * p.x + T.z * p.z;                       // T . P  (y component of T is 0)
    if (!_plane2) _plane2 = new THREE.Plane();
    A.sectionPlane.normal.copy(T); A.sectionPlane.constant = -d + w / 2;      // keeps  T.x >= s0 - w/2
    _plane2.normal.copy(T).negate(); _plane2.constant = d + w / 2;            // keeps  T.x <= s0 + w/2
    A.renderer.localClippingEnabled = true; A.sectionOn = true;
    A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) { o.material.clippingPlanes = [A.sectionPlane, _plane2]; o.material.clipShadows = true; o.material.needsUpdate = true; });
    var b = document.getElementById('section-btn'); if (b) { b.style.background = '#4fc3f7'; b.style.color = '#000'; }
    if (A.markDirty) A.markDirty();
    A._civilSection = { s: p.s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, w: w, d: d };
    var cut = A.civilSectionCut();
    console.log('§CROSS_SECTION s=' + p.s.toFixed(1) + ' tangent=(' + p.tx.toFixed(4) + ',0,' + p.tz.toFixed(4) + ') normal·tangent=' +
      (A.sectionPlane.normal.dot(T)).toFixed(6) + ' slabM=' + w + ' elementsCut=' + cut.guids.length + ' ofIndexed=' + cut.indexed + ' byDisc=' + JSON.stringify(cut.byDisc));
    return A._civilSection;
  };
  A.civilCrossSectionOff = function (keepOn) {   // keepOn: the Cut tool stays open (switching to X/Y/Z re-applies its one plane)
    A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) { o.material.clippingPlanes = []; o.material.needsUpdate = true; });
    A._civilSection = null;
    if (!keepOn) { A.sectionOn = false; var b = document.getElementById('section-btn'); if (b) { b.style.background = '#444'; b.style.color = '#fff'; } }
    if (A.markDirty) A.markDirty();
  };
  // World AABB per element = Box3.applyMatrix4 of the element's LOCAL geometry bbox (the 8 transformed corners), for the three
  // scene paths: BatchedMesh slot (userData.slotGeo[slot] + getMatrixAt), InstancedMesh (shared geometry + instance matrix),
  // merged (A._mergedMeta, already world). Cached per db + _metaGen.
  var _boxes = null;
  A.civilElementBoxes = function () {
    if (_boxes && _boxes.db === A.db && _boxes.gen === A._metaGen) return _boxes.v;
    var v = [], m4 = new THREE.Matrix4(), bx = new THREE.Box3();
    var push = function (g, d, b) { v.push({ guid: g, disc: d, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }); };
    A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) {
      if (A._mergedMeta && A._mergedMeta[o.id]) { A._mergedMeta[o.id].forEach(function (m) { v.push({ guid: m.guid, disc: m.disc, minX: m.minX, maxX: m.maxX, minZ: m.minZ, maxZ: m.maxZ }); }); return; }
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
        var sg = o.userData.slotGeo || {};
        A._batchMeta[o.id].forEach(function (m) {
          var g = sg[m.slotId]; if (!g) return; if (!g.boundingBox) g.computeBoundingBox();
          o.getMatrixAt(m.slotId, m4); bx.copy(g.boundingBox).applyMatrix4(m4).applyMatrix4(o.matrixWorld); push(m.guid, m.disc, bx);
        });
      } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
        var g2 = o.geometry; if (!g2.boundingBox) g2.computeBoundingBox();
        A._instanceMeta[o.id].forEach(function (m, i) { o.getMatrixAt(i, m4); bx.copy(g2.boundingBox).applyMatrix4(m4).applyMatrix4(o.matrixWorld); push(m.guid, m.disc, bx); });
      }
    });
    _boxes = { db: A.db, gen: A._metaGen, v: v }; return v;
  };
  // elements whose world AABB spans the section mid-plane: signed distance (along the route tangent) of its 4 xz corners straddles 0
  A.civilSectionCut = function () {
    var S = A._civilSection; if (!S) return { guids: [], indexed: 0, byDisc: {} };
    var guids = [], byDisc = {}, all = A.civilElementBoxes(), hit = [];
    all.forEach(function (m) {
      var lo = Infinity, hi = -Infinity, xs = [m.minX, m.maxX], zs = [m.minZ, m.maxZ];
      for (var i = 0; i < 2; i++) for (var k = 0; k < 2; k++) { var dd = S.tx * xs[i] + S.tz * zs[k] - S.d; if (dd < lo) lo = dd; if (dd > hi) hi = dd; }
      if (lo <= 0 && hi >= 0) { guids.push(m.guid); hit.push(m); byDisc[m.disc] = (byDisc[m.disc] || 0) + 1; }
    });
    return { guids: guids, indexed: all.length, byDisc: byDisc, items: hit };
  };

  // ══ §CROSS_OUTPUT (CIVIL_HIGHWAY_JELAPANG.md §CROSS_OUTPUT) ═══════════════════════════════════════════════════
  // The REAL cut: for each element of the civilSectionCut set ONLY (one owner of "which elements"), intersect its world
  // triangles with the mid-plane T.p = d (T horizontal) -> segments. Same three scene paths as civilElementBoxes
  // (merged idx slice / BatchedMesh slot / InstancedMesh instance). Segment = [x0,y0,z0,x1,y1,z1] WORLD metres.
  var DISC_COL = { ROAD: '#0277bd', EARTHWORK: '#8d6e00', DRAINAGE: '#c62828', STRUCTURE: '#6a1b9a', STRUCT: '#6a1b9a', UTILITY: '#2e7d32', MEP: '#2e7d32', ARC: '#455a64' };
  function _shortDisc(d) { var t = String(d || '?').replace(/^_+/, ''); return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); }   // GEOTECH → Geotech
  function _discCol(d) { if (DISC_COL[d]) return DISC_COL[d]; var h = 0, t = String(d); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return 'hsl(' + h + ',60%,38%)'; }
  function _triCut(pos, idx, i0, i1, M, T, d, out, g) {   // idx may be null (non-indexed); i0/i1 = vertex-slot range [i0,i1) in index units
    var a = new Array(3), n, k, e, v = new THREE.Vector3(), P = [0, 0, 0], D = [0, 0, 0], pts, q, ea, eb;
    var VX = [0, 0, 0], VY = [0, 0, 0], VZ = [0, 0, 0];
    for (var t = i0; t + 2 < i1; t += 3) {
      for (k = 0; k < 3; k++) {
        var vi = idx ? idx.getX(t + k) : t + k; v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(M);
        VX[k] = v.x; VY[k] = v.y; VZ[k] = v.z; D[k] = T.x * v.x + T.z * v.z - d;
      }
      if (D[0] < 0 === D[1] < 0 && D[1] < 0 === D[2] < 0) continue;
      pts = [];
      for (e = 0; e < 3; e++) {
        ea = e; eb = (e + 1) % 3;
        if ((D[ea] < 0) !== (D[eb] < 0)) { q = D[ea] / (D[ea] - D[eb]); pts.push(VX[ea] + q * (VX[eb] - VX[ea]), VY[ea] + q * (VY[eb] - VY[ea]), VZ[ea] + q * (VZ[eb] - VZ[ea])); }
      }
      if (pts.length === 6) { out.push(pts); g.n++; }
    }
  }
  // returns { segs: {guid:[seg...]}, nSeg }
  A.civilCrossSegments = function (cut) {
    var S = A._civilSection; if (!S) return null; cut = cut || A.civilSectionCut();
    var want = {}; cut.guids.forEach(function (g) { want[g] = 1; });
    var T = { x: S.tx, z: S.tz }, d = S.d, segs = {}, m4 = new THREE.Matrix4(), M = new THREE.Matrix4(), cnt = { n: 0 };
    var put = function (guid) { return segs[guid] || (segs[guid] = []); };
    A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) {
      var geo = o.geometry; if (!geo || !geo.attributes || !geo.attributes.position) return;
      if (A._mergedMeta && A._mergedMeta[o.id]) {
        A._mergedMeta[o.id].forEach(function (m) { if (want[m.guid] && geo.index) _triCut(geo.attributes.position, geo.index, m.idxStart, m.idxStart + m.idxCount, o.matrixWorld, T, d, put(m.guid), cnt); });
      } else if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
        var sg = o.userData.slotGeo || {};
        A._batchMeta[o.id].forEach(function (m) {
          if (!want[m.guid]) return; var g = sg[m.slotId]; if (!g || !g.attributes.position) return;
          o.getMatrixAt(m.slotId, m4); M.multiplyMatrices(o.matrixWorld, m4);
          _triCut(g.attributes.position, g.index, 0, g.index ? g.index.count : g.attributes.position.count, M, T, d, put(m.guid), cnt);
        });
      } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
        A._instanceMeta[o.id].forEach(function (m, i) {
          if (!want[m.guid]) return; o.getMatrixAt(i, m4); M.multiplyMatrices(o.matrixWorld, m4);
          _triCut(geo.attributes.position, geo.index, 0, geo.index ? geo.index.count : geo.attributes.position.count, M, T, d, put(m.guid), cnt);
        });
      }
    });
    return { segs: segs, nSeg: cnt.n };
  };
  function _nameMap(guids) {
    var map = {}; if (!A.dbQuery) return map;
    for (var i = 0; i < guids.length; i += 400) {
      var ch = guids.slice(i, i + 400);
      try { A.dbQuery('SELECT guid, element_name FROM elements_meta WHERE guid IN (' + ch.map(function () { return '?'; }).join(',') + ')', ch).forEach(function (r) { map[r[0]] = r[1]; }); } catch (e) {}
    }
    return map;
  }
  // One result object: segments (+ per-disc), table rows (disc · name · count, from the SAME cut), bboxOnly rows.
  A.civilCrossOutput = function () {
    var S = A._civilSection; if (!S) return null;
    var t0 = performance.now(), cut = A.civilSectionCut(), sg = A.civilCrossSegments(cut), nm = _nameMap(cut.guids), rows = {}, bb = {}, nBB = 0;
    cut.items.forEach(function (m) {
      var name = nm[m.guid] || '(unnamed)', key = m.disc + '\u0001' + name, has = sg.segs[m.guid] && sg.segs[m.guid].length > 0;
      var tgt = has ? rows : bb; if (!has) nBB++;
      tgt[key] = tgt[key] || { disc: m.disc, name: name, count: 0 }; tgt[key].count++;
    });
    var sortR = function (o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return a.disc < b.disc ? -1 : a.disc > b.disc ? 1 : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }); };
    var segList = [];   // flat: {disc, p:[x0,y0,z0,x1,y1,z1]}
    cut.items.forEach(function (m) { (sg.segs[m.guid] || []).forEach(function (p) { segList.push({ disc: m.disc, p: p }); }); });
    var res = { s: S.s, tx: S.tx, tz: S.tz, x: S.x, z: S.z, d: S.d, segments: segList, nSeg: sg.nSeg, elements: cut.guids.length, rows: sortR(rows), bboxOnly: sortR(bb), nBboxOnly: nBB, byDisc: cut.byDisc };
    var ms = performance.now() - t0, heap = (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'NA');
    console.log('§CROSS_OUTPUT s=' + S.s.toFixed(1) + ' segments=' + sg.nSeg + ' elements=' + cut.guids.length + ' bboxOnly=' + nBB + ' ms=' + ms.toFixed(0) + ' heapMB=' + heap);
    return res;
  };
  // Offscreen RECTANGULAR canvas, one scale (equal x/z metres). u = offset from centreline along n=(-tz,tx), v = world y.
  function _crossCanvas(R, W, H) {
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    var Lm = 56, Rm = 14, Tm = 54, Bm = 40, u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity, i, p;
    var U = function (x, z) { return -R.tz * (x - R.x) + R.tx * (z - R.z); };
    R.segments.forEach(function (sg) { p = sg.p; [[p[0], p[2]], [p[3], p[5]]].forEach(function (a) { var u = U(a[0], a[1]); if (u < u0) u0 = u; if (u > u1) u1 = u; }); if (p[1] < z0) z0 = p[1]; if (p[4] < z0) z0 = p[4]; if (p[1] > z1) z1 = p[1]; if (p[4] > z1) z1 = p[4]; });
    // §CROSS_POPUP_COMPACT (user 2026-10-07: popup "text at the top is all jumbled up … make them short or simple names"):
    //   a small canvas (the live popup) drops the in-canvas title (its header carries chainage + counts) and lays the
    //   legend out left-to-right in wrapping rows with short names, so nothing overlaps.
    var compact = W < 600, lgRects = [];
    if (compact) {
      g.font = '10px sans-serif'; var lgx = 6, lgy = 4, discs = {};
      R.segments.forEach(function (sg) { discs[sg.disc] = 1; });
      Object.keys(discs).sort().forEach(function (dn) { var t = _shortDisc(dn), w = g.measureText(t).width + 16; if (lgx + w > W - 4) { lgx = 6; lgy += 13; } lgRects.push([lgx, lgy, lgx + w - 4, lgy + 11]); g.fillStyle = _discCol(dn); g.fillRect(lgx, lgy + 1, 8, 8); g.fillStyle = '#000'; g.fillText(t, lgx + 11, lgy + 9); lgx += w; });
      Tm = lgy + 18; Lm = 34; Bm = 22;
    } else {
    g.fillStyle = '#000'; g.font = 'bold 14px sans-serif'; g.fillText('Cross-section — chainage ' + R.s.toFixed(1) + ' m (inferred)', Lm, 20);
    g.font = '11px sans-serif'; g.fillStyle = '#555'; g.fillText('elements cut ' + R.elements + ' · segments ' + R.nSeg + ' · bbox only ' + R.nBboxOnly + ' · scale 1:1 (offset m × z m)', Lm, 36);
    }
    if (!isFinite(u0)) { g.fillStyle = '#c00'; g.fillText('no triangle crosses the plane here (bbox only)', Lm, 70); return cv; }
    var du = Math.max(1, u1 - u0), dz = Math.max(1, z1 - z0), sc = Math.min((W - Lm - Rm) / du, (H - Tm - Bm) / dz);
    var ox = Lm + ((W - Lm - Rm) - du * sc) / 2, oy = H - Bm - ((H - Tm - Bm) - dz * sc) / 2;
    var X = function (u) { return ox + (u - u0) * sc; }, Y = function (z) { return oy - (z - z0) * sc; };
    var stepM = _niceStep(Math.max(du, dz) / 8);
    g.strokeStyle = '#ddd'; g.lineWidth = 1; g.fillStyle = '#555'; g.textAlign = 'center';
    for (var a = Math.ceil(u0 / stepM) * stepM; a <= u1 + 1e-9; a += stepM) { g.beginPath(); g.moveTo(X(a), Y(z0)); g.lineTo(X(a), Y(z1)); g.stroke(); g.fillText(a.toFixed(stepM < 1 ? 1 : 0), X(a), H - Bm + 14); }
    g.textAlign = 'right';
    for (var b = Math.ceil(z0 / stepM) * stepM; b <= z1 + 1e-9; b += stepM) { g.beginPath(); g.moveTo(X(u0), Y(b)); g.lineTo(X(u1), Y(b)); g.stroke(); g.fillText(b.toFixed(stepM < 1 ? 1 : 0), Lm - 4, Y(b) + 4); }
    g.textAlign = 'center'; g.fillText(compact ? 'offset (m)' : 'offset from centreline (m)', (Lm + W - Rm) / 2, H - 6);
    if (u0 <= 0 && u1 >= 0) { g.strokeStyle = '#999'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(0), Y(z0)); g.lineTo(X(0), Y(z1)); g.stroke(); g.setLineDash([]); }
    g.lineWidth = 1.4; var seen = {};
    R.segments.forEach(function (sg) { p = sg.p; seen[sg.disc] = 1; g.strokeStyle = _discCol(sg.disc); g.beginPath(); g.moveTo(X(U(p[0], p[2])), Y(p[1])); g.lineTo(X(U(p[3], p[5])), Y(p[4])); g.stroke(); });
    if (compact) { cv.__legend = lgRects; cv.__plotTop = Tm; return cv; }
    g.textAlign = 'left'; var lx = W - Rm; Object.keys(seen).reverse().forEach(function (dn) { var w = g.measureText(dn).width + 18; lx -= w; g.fillStyle = _discCol(dn); g.fillRect(lx, 8, 10, 10); g.fillStyle = '#000'; g.fillText(dn, lx + 14, 17); });
    return cv;
  }
  A.civilCrossPNG = function (download) {
    var R = A.civilCrossOutput(); if (!R) return Promise.resolve(null);
    var cv = _crossCanvas(R, 1000, 600), name = 'cross_' + Math.round(R.s) + 'm.png';
    return new Promise(function (res) {
      cv.toBlob(function (bl) {
        if (download && bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
        console.log('§CROSS_OUTPUT_PNG name=' + name + ' type=' + (bl && bl.type) + ' bytes=' + (bl && bl.size) + ' px=' + cv.width + 'x' + cv.height); res({ blob: bl, name: name, out: R });
      }, 'image/png');
    });
  };
  function _esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  A.civilCrossSheetHTML = function () {
    var R = A.civilCrossOutput(); if (!R) return null;
    var img = _crossCanvas(R, 1400, 840).toDataURL('image/png'), tr = function (list, extra) { return list.map(function (r) { return '<tr><td style="text-align:left">' + _esc(r.disc) + '</td><td style="text-align:left">' + _esc(r.name) + '</td><td>' + r.count + extra + '</td></tr>'; }).join(''); };
    return '<!doctype html><html><head><meta charset="utf-8"><title>Cross-section ' + R.s.toFixed(0) + ' m (inferred)</title><style>body{font:13px sans-serif;margin:16px}img{width:100%;max-width:1000px;border:1px solid #bbb}' +
      'table{border-collapse:collapse;margin-top:8px}td,th{border:1px solid #bbb;padding:2px 8px;text-align:right}th{text-align:left}@page{size:A4 landscape;margin:12mm}</style></head><body>' +
      '<h1>Cross-section — chainage ' + R.s.toFixed(1) + ' m (inferred)</h1><img alt="cross-section" src="' + img + '"><h2>Elements cut (' + R.elements + ')</h2>' +
      '<table id="cross-table"><thead><tr><th>discipline</th><th>element</th><th>count</th></tr></thead><tbody>' + tr(R.rows, '') + tr(R.bboxOnly, ' (bbox only)') + '</tbody></table></body></html>';
  };
  A.civilCrossPDF = function () {
    var html = A.civilCrossSheetHTML(); if (!html) return null;
    var w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank'); console.log('§CROSS_OUTPUT_SHEET htmlKB=' + (html.length / 1024).toFixed(0) + ' opened=' + !!w); return w;
  };

  // ── camera (linked view) ──
  A.civilGotoChainage = function (s) {
    var p = A.civilRouteAt(s); if (!p || !A.camera) return null;
    var q = A.civilRouteAt(Math.min(p.len, p.s + 40)), look = q && (q.s - p.s) > 1 ? q : { x: p.x + p.tx * 40, y: p.y, z: p.z + p.tz * 40 };
    A.camera.position.set(p.x, p.y, p.z);
    if (A.controls && A.controls.target) { A.controls.target.set(look.x, look.y - 20, look.z); if (A.controls.update) A.controls.update(); }
    else A.camera.lookAt(look.x, look.y - 20, look.z);
    if (A.markDirty) A.markDirty();
    console.log('§LONG_SECTION goto s=' + p.s.toFixed(1) + ' cam=(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ',' + p.z.toFixed(1) + ')');
    return p;
  };

  // ══ §PROFILE_LENS v1 (CIVIL_HIGHWAY_JELAPANG.md §PROFILE_LENS) ═══════════════════════════════════════════════════
  // Long mode of the Cut tool = a round 2D lens over the 3D canvas. Profile arrays are pre-computed ONCE at 1 m
  // (A.civilProfilePrepare); every lens gesture (rim drag, inside drag, wheel, pinch) only SLICES them — zero raycasts.
  // Raycast cost: the same _cast owner as §LONG_SECTION (merged meshes: element-AABB slab test + stock triangles,
  // streaming.js _installMergedRaycast; no BVH exists on baked merged buckets, so none is reusable) — measured, see §PROFILE_LENS_PRECOMPUTE.
  var SPAN_DEFAULT_M = 100;   // the ONE named setting: lens span in metres (fixed unless the user zooms); PDF sheet span = same value
  var SPAN_MIN_M = 50, RIM_PX = 14, DRAG_PX = 4, PROFILE_DS = 1;
  var _prof = null, _profP = null, _lens = null;
  function _el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  // 1 m profile: road top / ground / drain invert; NaN = no surface under that point. Async in ~25 ms chunks so the page stays alive.
  // §PROFILE_AFTER_LOAD (user 2026-10-08 "speed number only 100 and 32"): sampled before the EARTHWORK ground had streamed, every
  //   terrain window read "unmeasured" → all FLAT → the 80 km/h zone vanished, and the result was cached for the session. Wait until
  //   streaming has stopped and the element count is stable for 2 s, then sample.
  function _afterLoad() {
    return new Promise(function (res) {
      var last = -1, since = performance.now(), t0 = performance.now(), waited = false;
      (function tick() {
        var n = A.streamedCount || 0, busy = !!A.streaming;
        if (busy || n !== last) { last = n; since = performance.now(); waited = waited || busy; }
        if (!busy && performance.now() - since >= 2000) { if (waited || performance.now() - t0 > 2100) console.log('§PROFILE_AFTER_LOAD waitedMs=' + Math.round(performance.now() - t0) + ' elements=' + n); return res(); }
        setTimeout(tick, 250);
      })();
    });
  }
  A.civilProfilePrepare = function () {
    var r = _route(); if (!r) return Promise.resolve(null);
    if (_prof && _prof.db === A.db) return Promise.resolve(_prof);
    if (_profP && _profP.db === A.db) return _profP.p;
    var _db0 = A.db, _p0 = _afterLoad().then(function () { _profP = null; return A.civilProfilePrepareNow(); });
    _profP = { db: _db0, p: _p0 }; return _p0;
  };
  A.civilProfilePrepareNow = function () {
    var r = _route(); if (!r) return Promise.resolve(null);
    var t0 = performance.now(), c = _cumOf(r), L = c[c.length - 1], n = Math.floor(L / PROFILE_DS) + 1;
    var P = { db: A.db, ds: PROFILE_DS, len: L, n: n, road: new Float32Array(n), ground: new Float32Array(n), drain: new Float32Array(n), rx: new Float32Array(n), ry: new Float32Array(n), rz: new Float32Array(n), ms: 0, rays: 0 };
    var tR = _targets('ROAD'), tG = _targets('EARTHWORK'), tD = _targets('DRAINAGE');
    var yR = _yRange('ROAD', tR), yG = _yRange('EARTHWORK', tG), yD = _yRange('DRAINAGE', tD), r0 = A._civilRayCount || 0, i = 0;
    var nn = function (v) { return v == null ? NaN : v; };
    var pr = new Promise(function (res) {
      (function step() {
        var t = performance.now();
        while (i < n && performance.now() - t < 25) {
          var q = A.civilRouteAt(i * PROFILE_DS); P.rx[i] = q.x; P.ry[i] = q.y; P.rz[i] = q.z;
          P.road[i] = nn(yR ? _cast(tR, 'ROAD', q.x, q.z, yR.hi + 1, -1, yR.hi - yR.lo + 2) : null);
          P.ground[i] = nn(yG ? _cast(tG, 'EARTHWORK', q.x, q.z, yG.hi + 1, -1, yG.hi - yG.lo + 2) : null);
          P.drain[i] = nn(yD ? _cast(tD, 'DRAINAGE', q.x, q.z, yD.lo - 1, 1, yD.hi - yD.lo + 2) : null);
          i++;
        }
        A._civilProfileProgress = i / n; if (_lens) _draw();
        if (i < n) return setTimeout(step, 0);
        P.ms = performance.now() - t0; P.rays = (A._civilRayCount || 0) - r0; _prof = P; _profP = null;
        var cnt = function (a) { var k = 0; for (var j = 0; j < a.length; j++) if (a[j] === a[j]) k++; return k; };
        console.log('§PROFILE_LENS_PRECOMPUTE samples=' + n + ' ds=' + PROFILE_DS + 'm routeLen=' + L.toFixed(1) + 'm road=' + cnt(P.road) + ' ground=' + cnt(P.ground) + ' drain=' + cnt(P.drain) +
          ' rays=' + P.rays + ' ms=' + P.ms.toFixed(0) + ' heapMB=' + (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'NA') + ' bvhBuilt=' + _bvhBuilt + ' bvhUsed=' + _bvhReused + ' arrayKB=' + (n * 6 * 4 / 1024).toFixed(0) + ' vertsAdded=0');
        if (_lens) _draw(); res(P);
      })();
    });
    _profP = { db: A.db, p: pr }; return pr;
  };
  A.civilProfile = function () { return _prof && _prof.db === A.db ? _prof : null; };

  function _niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
  function _canvasBox() { var c = A.renderer && A.renderer.domElement; return c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; }
  function _diam() { var b = _canvasBox(); return Math.max(120, Math.floor(Math.min(b.width / 3, b.height))); }

  // nearest route point (1 m array) to a screen point, by projecting the array — no raycast
  function _nearestRouteS(px, py) {
    var P = _prof, b = _canvasBox(), v = new THREE.Vector3(), best = Infinity, bs = null;
    A.camera.updateMatrixWorld(); if (A.camera.updateProjectionMatrix) A.camera.updateProjectionMatrix();
    for (var i = 0; i < P.n; i++) {
      v.set(P.rx[i], P.ry[i], P.rz[i]).project(A.camera); if (v.z < -1 || v.z > 1) continue;
      var sx = b.left + (v.x * 0.5 + 0.5) * b.width, sy = b.top + (-v.y * 0.5 + 0.5) * b.height, d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (d < best) { best = d; bs = i * P.ds; }
    }
    return bs;
  }
  function _clampS(s) { return Math.max(0, Math.min(_prof ? (_prof.n - 1) * _prof.ds : A.civilRouteAt(0).len, s)); }
  function _setSpan(w) { var L = _prof ? _prof.len : A.civilRouteAt(0).len; _lens.span = Math.max(Math.min(SPAN_MIN_M, L), Math.min(L, w)); }

  function _draw() {
    var Ls = _lens; if (!Ls) return; var cv = Ls.canvas, g = cv.getContext('2d'), D = Ls.D, dpr = Ls.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, D, D);
    g.save();   // no clip(): the canvas is round via CSS border-radius (an AA arc clip doubled the draw cost in a microbench)
    g.fillStyle = '#16181d'; g.fillRect(0, 0, D, D); g.font = '10px sans-serif'; g.textAlign = 'center';
    var P = _prof;
    if (!P) { g.fillStyle = '#ddd'; g.fillText('preparing profile… ' + Math.round(100 * (A._civilProfileProgress || 0)) + '%', D / 2, D / 2); }
    else {
      var w = Ls.span, a = Ls.s0 - w / 2, b = Ls.s0 + w / 2, i0 = Math.max(0, Math.ceil(a / P.ds)), i1 = Math.min(P.n - 1, Math.floor(b / P.ds)), stride = Math.max(1, Math.ceil((i1 - i0 + 1) / D));
      var lo = Infinity, hi = -Infinity, K = ['road', 'ground', 'drain'], k, i, v;
      for (k = 0; k < 3; k++) for (i = i0; i <= i1; i += stride) { v = P[K[k]][i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      var Y0 = D * 0.2, Y1 = D * 0.68, X = function (s) { return (s - a) / w * D; };
      if (!isFinite(lo)) { g.fillStyle = '#aaa'; g.fillText('no surface under this stretch', D / 2, D / 2); }
      else {
        var pad = Math.max(0.5, (hi - lo) * 0.1); lo -= pad; hi += pad; var Y = function (z) { return Y1 - (Y1 - Y0) * (z - lo) / (hi - lo); };
        g.fillStyle = '#9aa'; g.textAlign = 'left'; g.fillText(hi.toFixed(1) + ' m', D * 0.1, Y0 + 3); g.fillText(lo.toFixed(1) + ' m', D * 0.1, Y1 + 3); g.textAlign = 'center';
        g.lineWidth = 2;
        [['road', '#4fc3f7'], ['ground', '#c8a064'], ['drain', '#e57373']].forEach(function (sr) {
          g.strokeStyle = sr[1]; g.beginPath(); var pen = false;
          for (var q = i0; q <= i1; q += stride) { var z = P[sr[0]][q]; if (z !== z) { pen = false; continue; } if (!pen) { g.moveTo(X(q * P.ds), Y(z)); pen = true; } else g.lineTo(X(q * P.ds), Y(z)); }
          g.stroke();
        });
      }
      var st = _niceStep(w / 5); g.strokeStyle = '#444'; g.lineWidth = 1; g.fillStyle = '#9aa';
      for (var t = Math.ceil(a / st) * st; t <= b; t += st) { var x = X(t); g.beginPath(); g.moveTo(x, Y1); g.lineTo(x, Y1 + 5); g.stroke(); g.fillText(t.toFixed(0), x, Y1 + 16); }
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(D / 2, Y0 - 6); g.lineTo(D / 2, Y1); g.stroke();
      g.fillStyle = '#ccc'; g.fillText('chainage (inferred) ' + Ls.s0.toFixed(0) + ' m · span ' + w.toFixed(0) + ' m', D / 2, D * 0.84);
      g.fillStyle = '#4fc3f7'; g.fillText('road', D * 0.36, D * 0.12); g.fillStyle = '#c8a064'; g.fillText('ground', D * 0.5, D * 0.12); g.fillStyle = '#e57373'; g.fillText('drain', D * 0.64, D * 0.12);
    }
    g.restore();
    g.lineWidth = RIM_PX; g.strokeStyle = 'rgba(79,195,247,0.55)'; g.beginPath(); g.arc(D / 2, D / 2, D / 2 - RIM_PX / 2, 0, 2 * Math.PI); g.stroke();
  }
  function _place() {
    var L = _lens, b = _canvasBox(), R = L.D / 2;
    L.cx = Math.max(b.left + R, Math.min(b.left + b.width - R, L.cx)); L.cy = Math.max(b.top + R, Math.min(b.top + b.height - R, L.cy));
    L.canvas.style.left = (L.cx - R) + 'px'; L.canvas.style.top = (L.cy - R) + 'px';
  }
  function _resize() {
    var L = _lens; if (!L) return; var D = _diam(); L.D = D; L.dpr = window.devicePixelRatio || 1;
    L.canvas.width = Math.round(D * L.dpr); L.canvas.height = Math.round(D * L.dpr); L.canvas.style.width = D + 'px'; L.canvas.style.height = D + 'px'; _place(); _draw();
  }
  function _lensTo(s, fly) {   // s0 := s ; optional camera fly + slider sync
    _lens.s0 = _clampS(s); _lastS = _lens.s0; _slider(_lens.s0); _showScrub(_lens.s0); _draw();
    if (fly) { A.civilGotoChainage(_lens.s0); if (A._civilSection) A.civilCrossSection(_lens.s0); }
  }
  function _buildLens() {
    if (_lens) return;
    var cv = _el('canvas', 'position:fixed;z-index:60;display:none;border-radius:50%;touch-action:none;box-shadow:0 2px 14px #000a;cursor:grab'); cv.id = 'civil-lens';
    document.body.appendChild(cv);
    var b = _canvasBox(); _lens = { canvas: cv, D: 0, dpr: 1, cx: b.left + b.width / 2, cy: b.top + b.height / 2, s0: 0, span: SPAN_DEFAULT_M, ptr: {}, mode: null, moved: 0 };
    var L = _lens, inRim = function (e) { var r = cv.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); return d >= L.D / 2 - RIM_PX; };
    var stop = function (e) { e.stopPropagation(); };
    ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend'].forEach(function (n) { cv.addEventListener(n, function (e) { stop(e); if (n === 'contextmenu' || n === 'touchstart' || n === 'touchmove') e.preventDefault(); }, { passive: false }); });
    cv.addEventListener('pointermove', function (e) {
      stop(e); var p = L.ptr[e.pointerId];
      if (!p) { cv.style.cursor = inRim(e) ? 'move' : 'ew-resize'; return; }
      var n = Object.keys(L.ptr).length, ox = p.x, oy = p.y;
      if (n === 2) {   // pinch (zoom span) + two-finger pan (slide)
        var ids = Object.keys(L.ptr), a = L.ptr[ids[0]], c = L.ptr[ids[1]], d0 = Math.hypot(a.x - c.x, a.y - c.y), mx0 = (a.x + c.x) / 2;
        p.x = e.clientX; p.y = e.clientY; var d1 = Math.hypot(a.x - c.x, a.y - c.y), mx1 = (a.x + c.x) / 2;
        if (d0 > 1 && d1 > 1) _setSpan(L.span * d0 / d1);
        L.s0 = _clampS(L.s0 - (mx1 - mx0) * L.span / L.D); L.moved += 99; _lastS = L.s0; _draw(); return;
      }
      p.x = e.clientX; p.y = e.clientY; L.moved += Math.abs(p.x - ox) + Math.abs(p.y - oy);
      if (L.mode === 'rim') { L.cx += p.x - ox; L.cy += p.y - oy; _place(); }
      else if (L.mode === 'pan') { L.s0 = _clampS(L.s0 - (p.x - ox) * L.span / L.D); _lastS = L.s0; _draw(); }
    });
    cv.addEventListener('pointerdown', function (e) {
      stop(e); e.preventDefault(); if (!_prof) return; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      L.ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; var n = Object.keys(L.ptr).length;
      if (n === 1) { L.mode = inRim(e) ? 'rim' : 'pan'; L.moved = 0; L.down = { x: e.clientX, y: e.clientY }; cv.style.cursor = L.mode === 'rim' ? 'move' : 'grabbing'; } else L.mode = 'pinch';
    });
    var up = function (e) {
      stop(e); if (!L.ptr[e.pointerId]) return; delete L.ptr[e.pointerId]; try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
      if (Object.keys(L.ptr).length) return;
      var mode = L.mode; L.mode = null; cv.style.cursor = 'grab';
      if (mode === 'rim' && L.moved >= DRAG_PX) { var s = _nearestRouteS(L.cx, L.cy); if (s != null) _lensTo(s, false); console.log('§PROFILE_LENS drop centre=(' + L.cx.toFixed(0) + ',' + L.cy.toFixed(0) + ') s0=' + L.s0.toFixed(1)); }
      else if (mode === 'pan' && L.moved < DRAG_PX) {   // click inside = pin + camera fly to the clicked chainage
        var r = cv.getBoundingClientRect(); _lensTo(L.s0 + ((e.clientX - r.left) / L.D - 0.5) * L.span, true);
      } else if (mode === 'pan') { _slider(L.s0); _showScrub(L.s0); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // wheel: capture on window so it fires before any other window wheel handler (cpe_walk glide); inside the lens it is ours alone.
    A._civilLensWheel = function (e) {
      if (!_lens || _lens.canvas.style.display === 'none' || !(e.target === cv)) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (!_prof) return;
      var f = e.ctrlKey ? Math.exp(e.deltaY * 0.01) : Math.pow(1.15, Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1));   // wheel-down / pinch-in = wider
      _setSpan(L.span * f); _draw();
    };
    window.addEventListener('wheel', A._civilLensWheel, { capture: true, passive: false });
    window.addEventListener('resize', _resize);
    _resize();
  }
  // PNG of the lens's current view (canvas.toBlob). Filename carries the chainage range.
  A.civilLensPNG = function (download) {
    var L = _lens; if (!L || !_prof) return Promise.resolve(null);
    var name = 'profile_' + Math.round(L.s0 - L.span / 2) + '-' + Math.round(L.s0 + L.span / 2) + 'm.png';
    return new Promise(function (res) {
      L.canvas.toBlob(function (bl) {
        if (download && bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
        console.log('§PROFILE_LENS_PNG name=' + name + ' type=' + (bl && bl.type) + ' bytes=' + (bl && bl.size) + ' px=' + L.canvas.width + 'x' + L.canvas.height); res({ blob: bl, name: name });
      }, 'image/png');
    });
  };
  // Whole road as fixed-span sheets (same span as the lens default) + data band every 10 m, print CSS -> browser "Save as PDF".
  A.civilProfileSheetsHTML = function () {
    var P = _prof; if (!P) return null; var W = SPAN_DEFAULT_M, ns = Math.ceil(P.len / W), r3 = function (a) { var o = []; for (var i = 0; i < P.n; i++) o.push(a[i] === a[i] ? +a[i].toFixed(3) : null); return o; };
    var fz = function (v) { return v === v ? v.toFixed(3) : '–'; }, h = [];
    for (var k = 0; k < ns; k++) {
      var s0 = k * W, s1 = Math.min(P.len, s0 + W), rows = '';
      for (var s = s0; s <= s1 + 1e-9 && s <= P.n - 1; s += 10) rows += '<tr data-s="' + s + '"><td>' + s + '</td><td class="g">' + fz(P.ground[s]) + '</td><td class="r">' + fz(P.road[s]) + '</td></tr>';
      h.push('<section class="sheet" data-k="' + k + '" data-s0="' + s0 + '"><h2>Road profile — chainage ' + s0 + ' to ' + (s0 + W) + ' m (inferred) · sheet ' + (k + 1) + ' of ' + ns + '</h2>' +
        '<canvas width="1000" height="360"></canvas><p class="no-print"><button class="png">PNG</button></p><table><thead><tr><th>chainage m</th><th>ground z m</th><th>road z m</th></tr></thead><tbody>' + rows + '</tbody></table></section>');
    }
    var js = '(' + (function (D) {
      var P = D.p, W = D.w; document.querySelectorAll('.sheet').forEach(function (sh) {
        var cv = sh.querySelector('canvas'), g = cv.getContext('2d'), s0 = +sh.dataset.s0, a = s0, b = s0 + W, lo = 1e9, hi = -1e9, i, k, W2 = cv.width, H = cv.height, L = 50, B = 30;
        ['road', 'ground', 'drain'].forEach(function (n) { for (i = Math.max(0, a); i <= Math.min(D.n - 1, b); i++) { var v = P[n][i]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
        g.fillStyle = '#fff'; g.fillRect(0, 0, W2, H); g.font = '11px sans-serif'; g.fillStyle = '#000';
        if (lo > hi) { g.fillText('no surface under this sheet', 20, 30); } else {
          var pad = Math.max(0.5, (hi - lo) * 0.1); lo -= pad; hi += pad; var X = function (s) { return L + (W2 - L - 10) * (s - a) / W; }, Y = function (z) { return H - B - (H - B - 12) * (z - lo) / (hi - lo); };
          g.strokeStyle = '#ccc'; for (k = 0; k <= 4; k++) { var z = lo + (hi - lo) * k / 4; g.beginPath(); g.moveTo(L, Y(z)); g.lineTo(W2 - 10, Y(z)); g.stroke(); g.fillText(z.toFixed(1), 6, Y(z) + 4); }
          for (var t = a; t <= b; t += 10) { g.beginPath(); g.moveTo(X(t), H - B); g.lineTo(X(t), H - B + 5); g.stroke(); g.fillText(t, X(t) - 8, H - B + 18); }
          g.lineWidth = 2; [['road', '#0277bd'], ['ground', '#8d6e00'], ['drain', '#c62828']].forEach(function (sr) { g.strokeStyle = sr[1]; g.beginPath(); var pen = false; for (i = Math.max(0, a); i <= Math.min(D.n - 1, b); i++) { var v = P[sr[0]][i]; if (v == null) { pen = false; continue; } if (!pen) { g.moveTo(X(i), Y(v)); pen = true; } else g.lineTo(X(i), Y(v)); } g.stroke(); });
          g.fillStyle = '#0277bd'; g.fillText('road top', L + 6, 10); g.fillStyle = '#8d6e00'; g.fillText('ground (earthwork)', L + 80, 10); g.fillStyle = '#c62828'; g.fillText('drain invert', L + 220, 10);
        }
        sh.querySelector('.png').onclick = function () { cv.toBlob(function (bl) { var an = document.createElement('a'); an.href = URL.createObjectURL(bl); an.download = 'profile_sheet_' + a + '-' + b + 'm.png'; an.click(); }, 'image/png'); };
      });
    }).toString() + ')(' + JSON.stringify({ p: { road: r3(P.road), ground: r3(P.ground), drain: r3(P.drain) }, n: P.n, w: W }) + ');';
    return '<!doctype html><html><head><meta charset="utf-8"><title>Road profile (inferred chainage)</title><style>body{font:13px sans-serif;margin:16px}.sheet{page-break-after:always;break-after:page;margin-bottom:24px}canvas{width:100%;max-width:1000px;border:1px solid #999}' +
      'table{border-collapse:collapse;margin-top:6px}td,th{border:1px solid #bbb;padding:2px 8px;text-align:right}@page{size:A4 landscape;margin:12mm}@media print{.no-print{display:none}}</style></head><body><h1>Road profile — ' +
      P.len.toFixed(0) + ' m, ' + ns + ' sheets of ' + W + ' m</h1>' + h.join('') + '<script>' + js.replace(/<\//g, '<\\/') + '<\/script></body></html>';
  };
  A.civilProfilePDF = function () {
    var html = A.civilProfileSheetsHTML(); if (!html) return null;
    var u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); var w = window.open(u, '_blank'); console.log('§PROFILE_LENS_PDF sheets=' + Math.ceil(_prof.len / SPAN_DEFAULT_M) + ' htmlKB=' + (html.length / 1024).toFixed(0) + ' opened=' + !!w); return u;
  };
  function _tools(show) {
    var panel = document.getElementById('section-slider-panel'); if (!panel) return; var t = document.getElementById('civil-lens-tools');
    if (!t && show) {
      t = _el('div', 'margin-top:6px;display:flex;gap:6px'); t.id = 'civil-lens-tools';
      [['Profile PDF', 'civil-profile-pdf', function () { A.civilProfilePrepare().then(function () { A.civilProfilePDF(); }); }], ['PNG', 'civil-profile-png', function () { A.civilLensPNG(true); }]].forEach(function (d) {
        var b = _el('button', 'background:#444;color:#fff;border:1px solid #666;border-radius:4px;padding:3px 8px;cursor:pointer', d[0]); b.id = d[1]; b.onclick = d[2]; t.appendChild(b);
      }); panel.appendChild(t);
    }
    if (t) t.style.display = show ? 'flex' : 'none';
  }
  // ── §SECTION_CIVIL_MODES: Long / Cross are extra axis modes of the Cut section tool (tools.js A.sectionModes).
  function _showScrub(s) {
    var v = document.getElementById('section-val'), L = A.civilRouteAt(0).len;
    if (v) v.textContent = 'chainage ' + s.toFixed(0) + ' m of ' + L.toFixed(0) + ' m (inferred)';
  }
  function _slider(s) {
    var sl = document.getElementById('section-slider'), L = A.civilRouteAt(0).len;
    sl.min = '0'; sl.max = String(L); sl.step = '1'; sl.value = String(s);
  }
  var _lastS = 0;
  function _crossTools(show) {
    var panel = document.getElementById('section-slider-panel'); if (!panel) return; var t = document.getElementById('civil-cross-tools');
    if (!t && show) {
      t = _el('div', 'margin-top:6px;display:flex;gap:6px'); t.id = 'civil-cross-tools';
      [['PNG', 'civil-cross-png', function () { A.civilCrossPNG(true); }], ['Section sheet', 'civil-cross-sheet', function () { A.civilCrossPDF(); }], ['Popup', 'civil-cross-popup', function () { A._civilLiveReopen(); }]].forEach(function (d) {
        var b = _el('button', 'background:#444;color:#fff;border:1px solid #666;border-radius:4px;padding:3px 8px;cursor:pointer', d[0]); b.id = d[1]; b.onclick = d[2]; t.appendChild(b);
      }); panel.appendChild(t);
    }
    if (t) t.style.display = show ? 'flex' : 'none';
  }
  // ── §CROSS_LIVE_POPUP: draggable floating drawing that redraws while the Cross scrubber moves. Drawing = A.civilCrossOutput + _crossCanvas
  // (the §CROSS_OUTPUT owner; no second cut). One redraw per animation frame, latest chainage wins.
  var LV_W = 360, LV_H = 240, _live = { el: null, cv: null, hd: null, pinned: false, closed: false, left: 0, top: 0, pending: 0, drawn: null, redraws: 0, scrubs: 0, frames: 0, active: false };
  function _liveAnchor() {   // screen position beside the cut: projection of the route point at s, offset right/up, clamped into the canvas
    var S = A._civilSection, b = _canvasBox(), L = _live; if (!S || !A.camera) return;
    var rp = A.civilRouteAt(S.s), v = new THREE.Vector3(rp.x, rp.y, rp.z).project(A.camera), px = b.left + (v.x * 0.5 + 0.5) * b.width, py = b.top + (-v.y * 0.5 + 0.5) * b.height;
    if (!(v.z > -1 && v.z < 1)) { px = b.left + b.width / 2; py = b.top + b.height / 2; }
    var h = L.el.offsetHeight || (LV_H + 26);
    L.left = Math.max(b.left, Math.min(b.left + b.width - LV_W, px + 24)); L.top = Math.max(b.top, Math.min(b.top + b.height - h, py - h - 12));
    L.el.style.left = L.left + 'px'; L.el.style.top = L.top + 'px';
  }
  function _liveBuild() {
    var L = _live; if (L.el) return;
    var el = _el('div', 'position:fixed;z-index:60;width:' + LV_W + 'px;background:#fff;border:1px solid #666;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.4);font:12px sans-serif;color:#000;touch-action:none;display:none'); el.id = 'civil-cross-live';
    var hd = _el('div', 'display:flex;align-items:center;gap:6px;padding:3px 6px;background:#263238;color:#fff;cursor:move;border-radius:6px 6px 0 0;user-select:none'); hd.id = 'civil-cross-live-head';
    var tt = _el('span', 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', ''); tt.id = 'civil-cross-live-title';
    var bk = _el('button', 'background:#455a64;color:#fff;border:0;border-radius:3px;cursor:pointer;padding:0 6px', '⟲'); bk.id = 'civil-cross-live-anchor'; bk.title = 'Re-anchor beside the cut';
    var bx = _el('button', 'background:#455a64;color:#fff;border:0;border-radius:3px;cursor:pointer;padding:0 6px', '✕'); bx.id = 'civil-cross-live-close'; bx.title = 'Close';
    hd.appendChild(tt); hd.appendChild(bk); hd.appendChild(bx);
    var cv = document.createElement('canvas'); cv.width = LV_W; cv.height = LV_H; cv.style.cssText = 'display:block;width:' + LV_W + 'px;height:' + LV_H + 'px';
    el.appendChild(hd); el.appendChild(cv); document.body.appendChild(el);
    ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'contextmenu'].forEach(function (n) { el.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true }); });
    var drag = null;
    hd.addEventListener('pointerdown', function (e) { if (e.target === bk || e.target === bx) return; e.stopPropagation(); drag = { dx: e.clientX - L.left, dy: e.clientY - L.top }; try { hd.setPointerCapture(e.pointerId); } catch (x) {} });
    hd.addEventListener('pointermove', function (e) {
      if (!drag) return; var b = _canvasBox();
      L.left = Math.max(b.left, Math.min(b.left + b.width - LV_W, e.clientX - drag.dx)); L.top = Math.max(b.top, Math.min(b.top + b.height - el.offsetHeight, e.clientY - drag.dy));
      el.style.left = L.left + 'px'; el.style.top = L.top + 'px'; L.pinned = true;
    });
    var end = function () { if (drag) { drag = null; console.log('§CROSS_LIVE pinned left=' + L.left.toFixed(0) + ' top=' + L.top.toFixed(0)); } };
    hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
    bk.onclick = function () { L.pinned = false; _liveAnchor(); }; bx.onclick = function () { L.closed = true; _liveShow(false); };
    L.el = el; L.cv = cv; L.hd = tt;
  }
  function _liveShow(on) {
    var L = _live; L.active = on && !L.closed;
    if (L.active) { _liveBuild(); L.el.style.display = 'block'; if (!L.pinned) _liveAnchor(); _liveSchedule(); } else if (L.el) { L.el.style.display = 'none'; }
  }
  function _liveSchedule() {
    var L = _live; if (!L.active || L.pending) return;
    L.pending = requestAnimationFrame(function () {
      L.pending = 0; L.frames++; if (!L.active || !A._civilSection) return;
      var R = A.civilCrossOutput(); if (!R) return;
      var c = _crossCanvas(R, LV_W, LV_H), g = L.cv.getContext('2d'); g.clearRect(0, 0, LV_W, LV_H); g.drawImage(c, 0, 0);
      L.hd.textContent = 'Ch ' + R.s.toFixed(0) + ' m · ' + R.elements + ' items';
      L.hd.title = 'chainage ' + R.s.toFixed(1) + ' m (inferred) · ' + R.elements + ' elements cut · ' + R.nSeg + ' segments';
      if (!L.pinned) _liveAnchor();
      L.redraws++; L.drawn = { s: R.s, nSeg: R.nSeg, elements: R.elements, legend: c.__legend || [], plotTop: c.__plotTop };
      console.log('§CROSS_LIVE s=' + R.s.toFixed(1) + ' segments=' + R.nSeg + ' redraws=' + L.redraws + ' scrubs=' + L.scrubs + ' frames=' + L.frames + ' pinned=' + L.pinned);
    });
  }
  A._civilLive = function () { var L = _live; return { shown: !!(L.el && L.el.style.display !== 'none'), closed: L.closed, pinned: L.pinned, left: L.left, top: L.top, redraws: L.redraws, scrubs: L.scrubs, frames: L.frames, drawn: L.drawn, title: L.hd ? L.hd.textContent : null, canvasW: L.cv ? L.cv.width : 0, canvasH: L.cv ? L.cv.height : 0, pending: !!L.pending }; };
  A._civilLiveReset = function () { _live.redraws = 0; _live.scrubs = 0; _live.frames = 0; };
  A._civilLiveReopen = function () { _live.closed = false; _liveShow(!!A._civilSection); };
  A.sectionModes.Cross = {
    label: 'Cross', avail: function () { return !!_route(); },
    enter: function () { var s = Math.min(_lastS, A.civilRouteAt(0).len); _slider(s); _crossTools(true); _liveShow(true); this.scrub(s); },
    scrub: function (s) { _lastS = s; A.civilCrossSection(s); _showScrub(s); _live.scrubs++; _liveSchedule(); },
    exit: function () { _liveShow(false); _crossTools(false); A.civilCrossSectionOff(true); }
  };
  A.sectionModes.Long = {
    label: 'Long', avail: function () { return !!_route(); },
    enter: function () {
      A.civilCrossSectionOff(true); _buildLens(); _tools(true); _lens.canvas.style.display = 'block'; _resize();
      var s = Math.min(_lastS, A.civilRouteAt(0).len); _lens.s0 = s; _slider(s); _showScrub(s); _draw();
      A.civilProfilePrepare().then(function () { if (_lens && _lens.canvas.style.display !== 'none') { _lens.s0 = _clampS(_lens.s0); _draw(); } });
    },
    scrub: function (s) { _lastS = s; if (_lens) { _lens.s0 = _clampS(s); _draw(); } A.civilGotoChainage(s); _showScrub(s); },
    exit: function () { if (_lens) _lens.canvas.style.display = 'none'; _tools(false); }
  };
  A._civilLens = function () { return _lens; };
  A._civilSectionPoll = setInterval(function () { try { A.refreshSectionModes && A.sectionOn && A.refreshSectionModes(); } catch (e) {} }, 1500);   // route may appear after the tool opened
}
if (typeof window !== 'undefined') window.setupCivilSections = setupCivilSections;
