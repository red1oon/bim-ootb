/**
 * BIM OOTB — Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// contact_floor.js — §FLOOR_CONTACT + §OBJECT_CONTACT (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md, red1 2026-10-01: "the shadow
// under furniture on floor … has to give some shadow play … holistic balance"; then "not abstract even over other items close to the
// floor, ie railings, stairs" + "or ducts close to walls").
// The ceiling lamps, the sky field and the room bounce reach a surface with no geometric blocking by the objects in a room (lamps are
// data with no shadow maps, the sky field is 0.5 m cells, screen-space AO measured no difference). Two camera-independent CPU maps
// restore the blocking from the REAL geometry; the shader (sourced_light.js slCF) scales the lamps' direct light and the diffuse
// irradiance by the visibility. The sun and the torch keep their own shadow maps.
//  1. FLOOR (upward fragments, exact): objects that stand on a floor (furniture, railings, stairs, ramps) are rasterised top-down on a
//     CELL grid per floor level, keeping the LOWEST underside above the floor (> 3 cm); per floor texel occ = sum of the exact
//     differential form factor of each covered texel, dF = A h^2 / (pi (r^2 + h^2)^2), within RADIUS; clamped 1.
//  2. OBJECTS NEAR WALLS / CEILINGS (every other fragment, standard approximation): a distance field of the in-room objects (ducts,
//     pipes, cable trays, MEP fittings / terminals, furniture, railings, stairs, columns, beams, proxies) in a box around the camera
//     (VOX voxels, distances to 1 m); the shader takes the classic distance-field occlusion along the surface normal (samples at 6, 12,
//     24, 48, 96 cm: occ += max(0, d - sdf(p + n d)) / d, averaged — the same estimator as Unreal's distance-field AO).
// Walls / slabs / coverings are never occluders here (they are the receivers; their own corners are the existing AO's job).
// AUTHORED grid / reach choices (not light values): CELL 0.10 m, RADIUS 1.5 m, 3 cm, VOX 0.10 m, box 25.6 x 6.4 x 25.6 m, 1 m cap.
// &floorcontact=0 / &objcontact=0 = off; =s = strength.
(function (global) {
  var FLOOR_CLASSES = ['IfcFurniture', 'IfcFurnishingElement', 'IfcRailing', 'IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight'];
  // IfcBeam / IfcMember left out (red1 v1530 Hospital …846906842 'some patchy'): beams and members are framed INTO ceilings and walls —
  // that corner is the existing AO's job, and 6,635 Hospital members (mullions, posts, frames) gave blotchy ceiling patches.
  var OBJ_CLASSES = FLOOR_CLASSES.concat(['IfcColumn', 'IfcBuildingElementProxy',
    'IfcDuctSegment', 'IfcDuctFitting', 'IfcPipeSegment', 'IfcPipeFitting', 'IfcCableCarrierSegment', 'IfcCableCarrierFitting',
    'IfcFlowSegment', 'IfcFlowFitting', 'IfcFlowController', 'IfcSanitaryTerminal', 'IfcValve',
    'IfcEnergyConversionDevice', 'IfcFlowMovingDevice', 'IfcUnitaryEquipment', 'IfcElectricAppliance']);
  // NOT occluders (red1 v1529 Terminal …844515926 'a bit too strong': dark halos on the ceiling round flush diffusers / light fittings):
  // IfcLightFixture (it emits, it does not shade the ceiling it lights) and IfcAirTerminal (flush ceiling diffusers).
  var CELL = 0.10, RADIUS = 1.5, MAXLEV = 4, VOX = 0.10, BX = 256, BY = 64, BZ = 256, DMAX = 1.0, TRI_CAP = 3000000;
  var floorCache = null, triCache = null, sdfCache = null;

  function classGuids(A, classes) {
    var s = new Set();
    try { (A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN ('" + classes.join("','") + "')") || []).forEach(function (r) { s.add(r[0]); }); } catch (e) {}
    return s;
  }

  // world draws of the elements in `guids` (BatchedMesh per instance, InstancedMesh per instance, plain mesh); box = world AABB if cheap
  function draws(A, THREE, guids) {
    var out = [];
    A.scene.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.geometry || !o.visible) return;
      if (o === A.ground || o === A._sky) return;
      o.updateMatrixWorld(); var g = o.geometry, idx = g.index;
      if (o.isBatchedMesh) {
        var n = (typeof o.instanceCount === 'number') ? o.instanceCount : (o._instanceInfo ? o._instanceInfo.length : 0);
        for (var i = 0; i < n; i++) {
          var gd = A.guidMap && A.guidMap[o.id + '_' + i]; if (!gd || !guids.has(gd)) continue;
          var gid, rng; try { gid = o.getGeometryIdAt(i); rng = o.getGeometryRangeAt(gid); } catch (e) { continue; } if (!rng) continue;
          var m = new THREE.Matrix4(); o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
          var bb = null; try { if (o.getBoundingBoxAt) { bb = o.getBoundingBoxAt(gid, new THREE.Box3()); if (bb) bb = bb.clone().applyMatrix4(m); } } catch (e) { bb = null; }
          out.push({ guid: gd, geo: g, matrix: m, start: idx ? rng.indexStart : rng.vertexStart, count: idx ? rng.indexCount : rng.vertexCount, box: bb });
        }
        return;
      }
      var gm = (o.userData && o.userData.guid) || (A.guidMap && A.guidMap[o.id]), full = idx ? idx.count : (g.attributes.position ? g.attributes.position.count : 0);
      if (!g.boundingBox) try { g.computeBoundingBox(); } catch (e) {}
      if (o.isInstancedMesh) { for (var k = 0; k < o.count; k++) { var gk = (A.guidMap && A.guidMap[o.id + '_' + k]) || gm; if (!gk || !guids.has(gk)) continue;
          var mi = new THREE.Matrix4(); o.getMatrixAt(k, mi); mi.premultiply(o.matrixWorld); out.push({ guid: gk, geo: g, matrix: mi, start: 0, count: full, box: g.boundingBox ? g.boundingBox.clone().applyMatrix4(mi) : null }); } return; }
      if (!gm || !guids.has(gm)) return;
      out.push({ guid: gm, geo: g, matrix: o.matrixWorld.clone(), start: 0, count: full, box: g.boundingBox ? g.boundingBox.clone().applyMatrix4(o.matrixWorld) : null });
    });
    return out;
  }

  // world-space triangles of one draw -> Float32Array (9 per triangle) + its min y
  function tris(THREE, d) {
    var pos = d.geo.attributes.position, idx = d.geo.index, v = new THREE.Vector3(), n = Math.floor(d.count / 3) * 9, out = new Float32Array(n), k = 0, minY = Infinity;
    for (var t = d.start; t + 2 < d.start + d.count; t += 3) for (var c = 0; c < 3; c++) {
      var vi = idx ? idx.getX(t + c) : t + c; v.fromBufferAttribute(pos, vi).applyMatrix4(d.matrix); out[k++] = v.x; out[k++] = v.y; out[k++] = v.z; if (v.y < minY) minY = v.y; }
    return { t: out, minY: minY };
  }

  // ── 1. FLOOR: the MAXLEV floor levels nearest the camera's own floor (eye ~1.6 m above it) ──
  function build(A) {
    var THREE = global.THREE; if (!A || !THREE || !A.scene) return null;
    var t0 = performance.now();
    if (!triCache || triCache.bld !== A.activeBuilding) {
      var guids = classGuids(A, FLOOR_CLASSES), byLev = {}, nT = 0, nD = 0;
      draws(A, THREE, guids).forEach(function (d) { var T = tris(THREE, d); if (!T.t.length) return; nD++; nT += T.t.length / 9;
        var key = Math.round(T.minY / 0.05) * 0.05, L = byLev[key] || (byLev[key] = { y: key, t: [], n: 0 }); L.n++; L.t.push(T.t); });
      // merge bins within 10 cm (the larger wins)
      var levs = Object.keys(byLev).map(function (k) { return byLev[k]; }).sort(function (a, b) { return b.n - a.n; }), merged = [];
      levs.forEach(function (L) { var h = merged.filter(function (K) { return Math.abs(K.y - L.y) <= 0.10; })[0]; if (h) { h.t = h.t.concat(L.t); h.n += L.n; } else merged.push(L); });
      merged.forEach(function (L) { var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        L.t.forEach(function (T) { for (var i = 0; i < T.length; i += 3) { var x = T[i], z = T[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } });
        L.x0 = x0 - RADIUS; L.z0 = z0 - RADIUS; L.x1 = x1 + RADIUS; L.z1 = z1 + RADIUS; });
      triCache = { bld: A.activeBuilding, levels: merged, elements: guids.size, draws: nD, tris: nT };
    }
    var floorY = A.camera ? A.camera.position.y - 1.6 : 0;
    var chosen = triCache.levels.slice().sort(function (a, b) { return Math.abs(a.y - floorY) - Math.abs(b.y - floorY); }).slice(0, MAXLEV);
    var key = A.activeBuilding + '|' + chosen.map(function (L) { return L.y.toFixed(2); }).join(',');
    if (floorCache && floorCache.key === key) return floorCache;
    if (floorCache && floorCache.tex) floorCache.tex.dispose();
    var res = { key: key, bld: A.activeBuilding, levels: [], nx: 0, nz: 0, cell: CELL, radius: RADIUS, elements: triCache.elements, draws: triCache.draws, tris: triCache.tris,
      levelsAll: triCache.levels.length, tex: null, data: null, ms: 0 };
    if (!chosen.length) { res.ms = Math.round(performance.now() - t0); floorCache = res; return res; }
    var nx = 1, nz = 1; chosen.forEach(function (L) { nx = Math.max(nx, Math.ceil((L.x1 - L.x0) / CELL)); nz = Math.max(nz, Math.ceil((L.z1 - L.z0) / CELL)); });
    var CAP = 2048; if (nx > CAP || nz > CAP) { res.capped = nx + 'x' + nz; nx = Math.min(nx, CAP); nz = Math.min(nz, CAP); }
    var rowsPer = nz + 1, H = rowsPer * chosen.length, occ = new Float32Array(nx * H), R = Math.ceil(RADIUS / CELL);
    var off = []; for (var dj = -R; dj <= R; dj++) for (var di = -R; di <= R; di++) { var r2 = (di * di + dj * dj) * CELL * CELL; if (r2 <= RADIUS * RADIUS) off.push(di, dj, r2); }
    var A2 = CELL * CELL, covered = 0, h = new Float32Array(nx * nz);
    chosen.forEach(function (L, li) {
      h.fill(Infinity);
      L.t.forEach(function (T) { for (var i = 0; i < T.length; i += 9) {
        var ax = T[i], ay = T[i + 1], az = T[i + 2], bx = T[i + 3], by = T[i + 4], bz = T[i + 5], cx = T[i + 6], cy = T[i + 7], cz = T[i + 8];
        var den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-12) continue;   // vertical / degenerate in plan
        var i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - L.x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - L.x0) / CELL));
        var j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - L.z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - L.z0) / CELL));
        for (var j = j0; j <= j1; j++) for (var ii = i0; ii <= i1; ii++) {
          var px = L.x0 + (ii + 0.5) * CELL, pz = L.z0 + (j + 0.5) * CELL;
          var w0 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, w1 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          var y = w0 * ay + w1 * by + w2 * cy - L.y; if (y > 0.03 && y < h[ii + j * nx]) h[ii + j * nx] = y; } } });
      var row0 = li * rowsPer, nOff = off.length;
      for (var q = 0; q < nx * nz; q++) { var hq = h[q]; if (hq === Infinity) continue; covered++;
        var qi = q % nx, qj = (q / nx) | 0, h2 = hq * hq;
        for (var o = 0; o < nOff; o += 3) { var pi = qi + off[o], pj = qj + off[o + 1]; if (pi < 0 || pj < 0 || pi >= nx || pj >= nz) continue;
          var s2 = off[o + 2] + h2; occ[pi + (row0 + pj) * nx] += A2 * h2 / (Math.PI * s2 * s2); } }
      res.levels.push({ x0: L.x0, z0: L.z0, y: L.y, row0: row0, elements: L.n });
    });
    var data = new Uint8Array(nx * H), sum = 0, nn = 0, mx = 0;
    for (var k = 0; k < occ.length; k++) { var v = Math.min(1, occ[k]); data[k] = Math.round(v * 255); if (v > 0.01) { sum += v; nn++; } if (v > mx) mx = v; }
    var tex = new THREE.DataTexture(data, nx, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
    res.tex = tex; res.data = data; res.nx = nx; res.nz = nz; res.H = H; res.coveredTexels = covered; res.occMean = nn ? sum / nn : 0; res.occMax = mx; res.occTexels = nn;
    res.ms = Math.round(performance.now() - t0); floorCache = res; return res;
  }

  // squared Euclidean distance transform, 1D (Felzenszwalb & Huttenlocher 2012) over a strided line of f
  function edt1(f, off, stride, n, d, v, z) {
    var k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (var q = 1; q < n; q++) { var fq = f[off + q * stride], s;
      while (true) { var vk = v[k]; s = ((fq + q * q) - (f[off + vk * stride] + vk * vk)) / (2 * q - 2 * vk); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[0] = q; z[0] = -1e20; z[1] = 1e20; k = 0; continue; }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (var q2 = 0; q2 < n; q2++) { while (z[k + 1] < q2) k++; var r = q2 - v[k]; d[q2] = r * r + f[off + v[k] * stride]; }
    for (var q3 = 0; q3 < n; q3++) f[off + q3 * stride] = d[q3];
  }

  // ── 2. OBJECTS: distance field of the in-room objects in a box around the camera ──
  function buildSdf(A) {
    var THREE = global.THREE; if (!A || !THREE || !A.scene || !A.camera) return null;
    var t0 = performance.now(), cp = A.camera.position;
    var org = [Math.floor((cp.x - BX * VOX / 2) / VOX) * VOX, Math.floor((cp.y - 2.4) / VOX) * VOX, Math.floor((cp.z - BZ * VOX / 2) / VOX) * VOX];
    var key = A.activeBuilding + '|' + org.map(function (v) { return v.toFixed(1); }).join(',');
    if (sdfCache && sdfCache.key === key) return sdfCache;
    if (sdfCache && sdfCache.tex) sdfCache.tex.dispose();
    var box = new THREE.Box3(new THREE.Vector3(org[0], org[1], org[2]), new THREE.Vector3(org[0] + BX * VOX, org[1] + BY * VOX, org[2] + BZ * VOX)).expandByScalar(DMAX);
    var guids = classGuids(A, OBJ_CLASSES), ds = draws(A, THREE, guids), N = BX * BY * BZ, f = new Float32Array(N), INF = 1e20;
    f.fill(INF);
    var used = 0, culled = 0, nT = 0, capped = false, marked = 0;
    var mark = function (x, y, z) { var i = Math.floor((x - org[0]) / VOX), j = Math.floor((y - org[1]) / VOX), k = Math.floor((z - org[2]) / VOX);
      if (i < 0 || j < 0 || k < 0 || i >= BX || j >= BY || k >= BZ) return; var c = i + j * BX + k * BX * BY; if (f[c] !== 0) { f[c] = 0; marked++; } };
    for (var di = 0; di < ds.length; di++) { var d = ds[di];
      if (d.box && !d.box.intersectsBox(box)) { culled++; continue; }
      if (nT > TRI_CAP) { capped = true; break; }
      var T = tris(THREE, d).t; used++; nT += T.length / 9;
      for (var i = 0; i < T.length; i += 9) {
        var ax = T[i], ay = T[i + 1], az = T[i + 2], bx = T[i + 3] - ax, by = T[i + 4] - ay, bz = T[i + 5] - az, cx = T[i + 6] - ax, cy = T[i + 7] - ay, cz = T[i + 8] - az;
        var e = Math.max(Math.sqrt(bx * bx + by * by + bz * bz), Math.sqrt(cx * cx + cy * cy + cz * cz)), s = Math.max(1, Math.ceil(e / (0.5 * VOX)));
        if (s > 400) s = 400;
        for (var u = 0; u <= s; u++) for (var w = 0; u + w <= s; w++) { var a = u / s, b = w / s; mark(ax + a * bx + b * cx, ay + a * by + b * cy, az + a * bz + b * cz); } } }
    // squared distance in voxel units, 3 separable passes
    var nmax = Math.max(BX, BY, BZ), dd = new Float32Array(nmax), vv = new Int32Array(nmax), zz = new Float32Array(nmax + 1);
    for (var k2 = 0; k2 < BZ; k2++) for (var j2 = 0; j2 < BY; j2++) edt1(f, j2 * BX + k2 * BX * BY, 1, BX, dd, vv, zz);
    for (var k3 = 0; k3 < BZ; k3++) for (var i3 = 0; i3 < BX; i3++) edt1(f, i3 + k3 * BX * BY, BX, BY, dd, vv, zz);
    for (var j4 = 0; j4 < BY; j4++) for (var i4 = 0; i4 < BX; i4++) edt1(f, i4 + j4 * BX, BX * BY, BZ, dd, vv, zz);
    var data = new Uint8Array(N), near = 0;
    for (var c = 0; c < N; c++) { var m = Math.min(DMAX, Math.sqrt(f[c]) * VOX); data[c] = Math.round(m / DMAX * 255); if (m < 0.5) near++; }
    var tex = new THREE.Data3DTexture(data, BX, BY, BZ); tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
    sdfCache = { key: key, bld: A.activeBuilding, org: org, n: [BX, BY, BZ], vox: VOX, dmax: DMAX, tex: tex, data: data, elements: guids.size, drawsAll: ds.length, used: used, culled: culled, tris: nT, capped: capped,
      voxelsMarked: marked, voxelsNear50cm: near, mb: +(N / 1048576).toFixed(1), ms: Math.round(performance.now() - t0) };
    return sdfCache;
  }

  // CPU mirror of the floor lookup (witness): occ at a world point on a level (nearest texel)
  function occAt(x, y, z) {
    var c = floorCache; if (!c || !c.tex) return null;
    for (var i = 0; i < c.levels.length; i++) { var L = c.levels[i], dy = y - L.y; if (dy < -0.05 || dy > 0.15) continue;
      var gi = Math.floor((x - L.x0) / c.cell), gj = Math.floor((z - L.z0) / c.cell); if (gi < 0 || gj < 0 || gi >= c.nx || gj >= c.nz) continue;
      return c.data[gi + (L.row0 + gj) * c.nx] / 255; }
    return 0;
  }
  // CPU mirror of the distance field (witness): metres to the nearest object surface (nearest voxel), null outside the box
  function sdfAt(x, y, z) {
    var c = sdfCache; if (!c) return null; var i = Math.floor((x - c.org[0]) / c.vox), j = Math.floor((y - c.org[1]) / c.vox), k = Math.floor((z - c.org[2]) / c.vox);
    if (i < 0 || j < 0 || k < 0 || i >= c.n[0] || j >= c.n[1] || k >= c.n[2]) return null; return c.data[i + j * c.n[0] + k * c.n[0] * c.n[1]] / 255 * c.dmax;
  }

  global.ContactFloor = { build: build, buildSdf: buildSdf, occAt: occAt, sdfAt: sdfAt, get: function () { return floorCache; }, sdf: function () { return sdfCache; },
    CELL: CELL, RADIUS: RADIUS, FLOOR_CLASSES: FLOOR_CLASSES, OBJ_CLASSES: OBJ_CLASSES };
})(typeof window !== 'undefined' ? window : this);
