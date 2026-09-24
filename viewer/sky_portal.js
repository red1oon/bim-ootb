// ══ §SKY_PORTAL — window panes as sky light sources in Alt+S (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md
// "§SKY_PORTAL spec") ══ red1, 2026-09-24: "the outside sky must hit the windows and carry on indoors, stronger, as in
// real life. Now it's drab and false." The archviz "sky portal": a light at each pane, aimed inward.
// Panes come from §SURFACE_R10's split (aPane = 1 triangles); nothing is placed for an unsplit window (logged).
// SpotLights, not RectAreaLights: RectAreaLightUniformsLib is not in viewer/lib. The nearest few cast shadows (the pane
// itself casts nothing since R10, so frames throw mullion shadows); the rest are unshadowed and CAN leak through walls.
(function (global) {
  var PORTAL_RANGE = 40;          // m — candidate panes near the camera
  var LIGHT_RESERVE = 320, PORTAL_SHARE = 0.25;   // §LIGHT_UNIFORM_BUDGET
  var PORTAL_EXPOSURE = 10;       // start value for red1's eye (see spec): the unoccluded hemi drowns a physical portal
  var PORTAL_ANGLE = 70 * Math.PI / 180, PORTAL_SHADOW_SIZE = 512, UPRAY_OFF = 0.5, UPRAY_MAX = 30;
  var placed = [], film = null;   // film: §FILM_PARITY per-frame state (cached panes + the fixed light set's assignments)

  function dial(A, key, name, def, lo, hi) {
    var v = (typeof A[key] === 'number') ? A[key] : null;
    if (v == null) { var m = new RegExp('[?&]' + name + '=([0-9.]+)').exec(location.search); v = m ? parseFloat(m[1]) : def; }
    return Math.max(lo, Math.min(hi, isFinite(v) ? v : def));
  }

  // §SKY_PORTAL_SOURCES (watcher): portal sources are ANY planar transparent glazing (material transparent, opacity < 0.95,
  // any class: R10 panes, IfcPlate, curtain-wall panels), per triangle via the material groups. Triangles are grouped by
  // plane (normal quantised to ~5 deg, plane offset to 0.25 m), then cut into PORTAL_TILE_M cells on that plane, so a
  // whole facade becomes a few facade-sized sources instead of many tiny panels. Each cell = { c: area-weighted centre,
  // n, area: glass area in the cell, hue, cls }. BatchedMesh glazing is not read (logged).
  var PORTAL_TILE_M = 6;
  function collectPanes(A, THREE) {
    var planes = new Map(), stats = { byClass: {}, batchedSkipped: 0 };
    var inst = new THREE.Matrix4(), M = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(),
      ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
    function glassy(m) { return m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial'; }
    A.scene.traverse(function (o) {
      if (!o.visible || !o.geometry || !o.material || (o.userData && o.userData.skyPortal)) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(glassy)) return;
      if (o.isBatchedMesh) { stats.batchedSkipped++; return; }
      if (!(o.isMesh || o.isInstancedMesh)) return;
      var g = o.geometry, pos = g.getAttribute('position'), idx = g.index; if (!pos) return;
      var groups = (g.groups && g.groups.length) ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
      var cls = (o.userData && o.userData.ifcClass) || '?';
      o.updateMatrixWorld();
      var n = o.isInstancedMesh ? o.count : 1;
      for (var k = 0; k < n; k++) {
        if (o.isInstancedMesh) { o.getMatrixAt(k, inst); M.multiplyMatrices(o.matrixWorld, inst); } else M.copy(o.matrixWorld);
        groups.forEach(function (gr) {
          var m = mats[gr.materialIndex || 0]; if (!glassy(m)) return;
          var hue = m.color.clone(), mx = Math.max(hue.r, hue.g, hue.b) || 1; hue.multiplyScalar(1 / mx);   // HUE only
          for (var t = gr.start; t + 2 < gr.start + gr.count; t += 3) {
            var i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
            a.fromBufferAttribute(pos, i0).applyMatrix4(M); b.fromBufferAttribute(pos, i1).applyMatrix4(M); c.fromBufferAttribute(pos, i2).applyMatrix4(M);
            nn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)); var ar = nn.length() / 2; if (ar < 1e-4) continue;
            nn.normalize(); if (nn.y < 0 || (nn.y === 0 && (nn.x < 0 || (nn.x === 0 && nn.z < 0)))) nn.negate();   // one orientation per plane
            if (Math.abs(nn.y) > 0.7) continue;                                   // skylights/roof glass: not a window portal
            var d = nn.dot(a), key = [Math.round(nn.x * 12), Math.round(nn.y * 12), Math.round(nn.z * 12), Math.round(d / 0.25)].join(',');
            var P = planes.get(key);
            if (!P) { var u = new THREE.Vector3(0, 1, 0).cross(nn).normalize(); if (u.lengthSq() < 0.5) u.set(1, 0, 0);
              P = { n: nn.clone(), u: u, v: nn.clone().cross(u).normalize(), cells: new Map(), cls: cls, hue: hue }; planes.set(key, P); }
            var cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
            var pu = P.u.x * cx + P.u.y * cy + P.u.z * cz, pv = P.v.x * cx + P.v.y * cy + P.v.z * cz;
            var ck = Math.floor(pu / PORTAL_TILE_M) + ':' + Math.floor(pv / PORTAL_TILE_M), C = P.cells.get(ck);
            if (!C) { C = { x: 0, y: 0, z: 0, area: 0 }; P.cells.set(ck, C); }
            C.x += cx * ar; C.y += cy * ar; C.z += cz * ar; C.area += ar;
            stats.byClass[cls] = (stats.byClass[cls] || 0) + ar;
          }
        });
      }
    });
    var out = [];
    planes.forEach(function (P) { P.cells.forEach(function (C) { if (C.area < 0.5) return;   // < 0.5 m2 of glass in a cell: not a window
      out.push({ c: new THREE.Vector3(C.x / C.area, C.y / C.area, C.z / C.area), n: P.n, u: P.u, area: C.area, hue: P.hue, cls: P.cls }); }); });
    Object.keys(stats.byClass).forEach(function (k) { stats.byClass[k] = +stats.byClass[k].toFixed(1); });
    stats.planes = planes.size;
    return { panes: out, stats: stats };
  }

  // §LIGHT_UNIFORM_BUDGET, part 1 — called at staging, BEFORE the still's lamp set is built, so tools.js caps the lamps.
  var budgetCap = null, budgetShadow = null;
  function budget(A) {
    var gain = dial(A, '_stillPortal', 'portal', 1, 0, 3), cap = Math.round(dial(A, '_stillPortalCap', 'portalcap', 32, 0, 128));
    var nShadow = Math.round(dial(A, '_stillPortalShadow', 'portalshadow', 8, 0, 32));
    var maxFrag = (A.renderer && A.renderer.capabilities && A.renderer.capabilities.maxFragmentUniforms) || 1024;
    var avail = Math.max(0, maxFrag - LIGHT_RESERVE), portalVec = (gain > 0 && cap > 0) ? Math.floor(avail * PORTAL_SHARE) : 0;
    var c = 0, sh = 0, used = 0;
    while (c < cap) { var need = (sh < nShadow) ? 12 : 7; if (used + need > portalVec) break; used += need; c++; if (sh < nShadow) sh++; }
    budgetCap = c; budgetShadow = sh;
    A._stillLampCap = Math.min(200, Math.floor((avail - used) / 4), Math.round(dial(A, '_stillLampCapMax', 'lampcap', 200, 0, 200)));   // &lampcap= (§STILL_LAG)
    console.log('§LIGHT_UNIFORM_BUDGET maxFragmentUniforms=' + maxFrag + ' reserve=' + LIGHT_RESERVE + ' portalCap=' + c + ' (shadowed ' + sh +
      ', ' + used + ' vectors) lampCap=' + A._stillLampCap + ' (' + (A._stillLampCap * 4) + ' vectors) total=' + (used + A._stillLampCap * 4) + '/' + avail +
      ' — set before the lamps are built; one light count per still');
  }

  function stage(A) {
    var THREE = global.THREE; if (!THREE || !A || !A.scene || !A.hemi) return;
    unstage(A, true);
    var t0 = performance.now();
    var gain = dial(A, '_stillPortal', 'portal', 1, 0, 3), cap = Math.round(dial(A, '_stillPortalCap', 'portalcap', 32, 0, 128));
    var nShadow = Math.round(dial(A, '_stillPortalShadow', 'portalshadow', 8, 0, 32));
    if (gain <= 0 || cap <= 0) { console.log('§SKY_PORTAL off portal=' + gain + ' cap=' + cap); return; }
    if (budgetCap == null) budget(A);
    cap = budgetCap; nShadow = budgetShadow;
    var cam = A.camera.position, col0 = collectPanes(A, THREE), panes = col0.panes, near;
    // §SKY_PORTAL_PRIORITY (watcher: are the atrium's tall panes lost to nearest-first?): &portalsort=area ranks by
    // glass area x how squarely the pane faces the camera; default stays nearest-first.
    var byArea = /[?&]portalsort=area/.test(location.search) || A._stillPortalSort === 'area';
    near = panes.filter(function (p) { return p.c.distanceTo(cam) <= PORTAL_RANGE; });
    near.forEach(function (p) { var to = cam.clone().sub(p.c).normalize(); p._facing = Math.abs(to.dot(p.n)); p._dist = p.c.distanceTo(cam); p._score = p.area * Math.max(0.05, p._facing); });
    near.sort(byArea ? function (a, b) { return b._score - a._score; } : function (a, b) { return a._dist - b._dist; });
    var _allNearArea = near.reduce(function (s, p) { return s + p.area; }, 0);
    var capped = 0, byCls = {}, placedInfo = [];
    // Inward side: the up-ray from 0.5 m off the pane hits building geometry (under a slab = inside).
    var targets = []; A.scene.traverse(function (o) { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A.ground && o !== A._sky && !(o.userData && o.userData.excludeFromShadow)) targets.push(o); });
    var rc = new THREE.Raycaster(); rc.far = UPRAY_MAX; var up = new THREE.Vector3(0, 1, 0);
    // §SKY_PORTAL_SIDE (watcher): 5 rays per side from 0.5 m off the glass — up, straight out, out+up, out+/-along
    // the facade — and count SKY (no hit within UPRAY_MAX). The side with more sky is outside; a tie is skipped.
    rc.far = 60;
    function skyCount(pt, out, along) {
      var dirs = [up, out, out.clone().add(up).normalize(), out.clone().add(along).normalize(), out.clone().sub(along).normalize()], k = 0;
      dirs.forEach(function (d) { rc.set(pt, d); if (!rc.intersectObjects(targets, false).length) k++; }); return k;
    }
    var skipped = 0, H = A.hemi.intensity, sky = A.hemi.color, shadowed = 0, unsh = 0, iSum = 0;
    near.forEach(function (p) {
      if (placed.length >= cap) { capped++; return; }
      var nNeg = p.n.clone().negate();
      var sa = skyCount(p.c.clone().addScaledVector(p.n, UPRAY_OFF), p.n, p.u), sb = skyCount(p.c.clone().addScaledVector(nNeg, UPRAY_OFF), nNeg, p.u);
      if (sa === sb) { skipped++; return; }
      var inward = sa < sb ? p.n.clone() : nNeg;   // fewer sky hits = inside
      p._inward = inward;
      byCls[p.cls] = (byCls[p.cls] || 0) + 1;
      var I = H * p.area / Math.PI * PORTAL_EXPOSURE * gain;
      var col = sky.clone().multiply(p.hue);
      var L = new THREE.SpotLight(col, I, 0, PORTAL_ANGLE, 1, 2);
      L.position.copy(p.c).addScaledVector(inward, -0.05);
      L.target.position.copy(p.c).addScaledVector(inward, 5);
      if (shadowed < nShadow) {
        L.castShadow = true; L.shadow.mapSize.set(PORTAL_SHADOW_SIZE, PORTAL_SHADOW_SIZE);
        L.shadow.camera.near = 0.1; L.shadow.camera.far = PORTAL_RANGE; L.shadow.bias = -0.0005; shadowed++;
        // §STILL_LAG: the scene is frozen for a still — render this shadow map ONCE, not on every accumulation frame.
        L.shadow.autoUpdate = false; L.shadow.needsUpdate = true;
      } else unsh++;
      L.userData.skyPortal = true;
      A.scene.add(L); A.scene.add(L.target); placed.push(L); iSum += I;
      placedInfo.push({ cls: p.cls, area: +p.area.toFixed(1), dist: +p._dist.toFixed(1), facing: +p._facing.toFixed(2), y: +p.c.y.toFixed(1) });
    });
    // §FILM_PARITY (films): classify EVERY pane's inward side ONCE here (camera-independent), cache it; frame() then only
    // re-ranks the cached panes from the moving camera and re-aims this same fixed light set (count, pads, shadowed count
    // unchanged — a count change would recompile every material).
    film = null;
    if (A._maxqActive && A._filmParity) {
      var tC = performance.now(), cached = [];
      panes.forEach(function (p) {
        if (p._inward) { cached.push(p); return; }
        var nNeg = p.n.clone().negate();
        var sa = skyCount(p.c.clone().addScaledVector(p.n, UPRAY_OFF), p.n, p.u), sb = skyCount(p.c.clone().addScaledVector(nNeg, UPRAY_OFF), nNeg, p.u);
        if (sa === sb) return; p._inward = sa < sb ? p.n.clone() : nNeg; cached.push(p);
      });
      film = { panes: cached, H: H, sky: sky.clone(), gain: gain, byArea: byArea, nShadow: shadowed, assign: [] };
      console.log('§SKY_PORTAL_FILM_CACHE panes=' + cached.length + ' of ' + panes.length + ' classified once ms=' + (performance.now() - tC).toFixed(0));
    }
    // §STILL_LIGHT_PAD — pad to the budget's fixed counts (intensity 0) so every still has the same spot-light count
    // and the same shadowed-spot count: no recompile between presses.
    var pads = 0;
    while (placed.length < cap) {
      var D = new THREE.SpotLight(0xffffff, 0, 1, PORTAL_ANGLE, 1, 2); D.userData.skyPortal = true; D.userData.pad = true;
      D.position.copy(cam); D.target.position.copy(cam).add(new THREE.Vector3(0, -1, 0));
      if (shadowed < nShadow) { D.castShadow = true; D.shadow.mapSize.set(PORTAL_SHADOW_SIZE, PORTAL_SHADOW_SIZE); D.shadow.autoUpdate = false; D.shadow.needsUpdate = true; shadowed++; }
      A.scene.add(D); A.scene.add(D.target); placed.push(D); pads++;
    }
    if (A.markDirty) A.markDirty();
    var _plArea = placedInfo.reduce(function (s, q) { return s + q.area; }, 0);
    A._skyPortalLast = placedInfo;
    console.log('§SKY_PORTAL_PRIORITY sort=' + (byArea ? 'area x facing' : 'nearest') + ' candidates=' + near.length + ' candidateGlassM2=' + _allNearArea.toFixed(0) +
      ' placedGlassM2=' + _plArea.toFixed(0) + ' placedAreaMax=' + (placedInfo.length ? Math.max.apply(null, placedInfo.map(function (q) { return q.area; })) : 0) +
      ' placedDistMax=' + (placedInfo.length ? Math.max.apply(null, placedInfo.map(function (q) { return q.dist; })) : 0));
    console.log('§STILL_LIGHT_PAD portals padded=' + pads + ' to ' + placed.length + ' (shadowed ' + shadowed + ')');
    console.log('§SKY_PORTAL placed=' + (placed.length - pads) + ' (+' + pads + ' intensity-0 pads) shadowed=' + shadowed + ' unshadowed=' + unsh + ' (unshadowed can leak through walls)' +
      ' capped=' + capped + ' skipped=' + skipped + ' (5 rays per side, equal sky) sources=' + panes.length + ' in ' + col0.stats.planes + ' planes' +
      ' placedByClass=' + JSON.stringify(byCls) + ' glassM2ByClass=' + JSON.stringify(col0.stats.byClass) + ' batchedGlassSkipped=' + col0.stats.batchedSkipped +
      ' portal=' + gain + ' exposure=' + PORTAL_EXPOSURE + ' hemi=' + H.toFixed(3) + ' intensitySum=' + iSum.toFixed(2) +
      ' meanI=' + (placed.length ? (iSum / placed.length).toFixed(3) : 0) + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  // §FILM_PARITY — per frame: rank the cached panes from THIS camera, re-aim the fixed lights (shadowed ones first, as in
  // stage), park the rest at intensity 0. A shadowed light's map re-renders only when its pane changed.
  function frame(A) {
    if (!film || !placed.length) return null;
    var t0 = performance.now(), cam = A.camera.position;
    var near = film.panes.filter(function (p) { p._dist = p.c.distanceTo(cam); return p._dist <= PORTAL_RANGE; });
    if (film.byArea) { near.forEach(function (p) { var to = cam.clone().sub(p.c).normalize(); p._score = p.area * Math.max(0.05, Math.abs(to.dot(p.n))); }); near.sort(function (a, b) { return b._score - a._score; }); }
    else near.sort(function (a, b) { return a._dist - b._dist; });
    var reaimed = 0, shadowRe = 0, lit = 0;
    for (var i = 0; i < placed.length; i++) {
      var L = placed[i], p = near[i] || null;
      if (film.assign[i] === p) continue;
      film.assign[i] = p; reaimed++;
      if (p) {
        L.position.copy(p.c).addScaledVector(p._inward, -0.05); L.target.position.copy(p.c).addScaledVector(p._inward, 5);
        L.color.copy(film.sky).multiply(p.hue); L.intensity = film.H * p.area / Math.PI * PORTAL_EXPOSURE * film.gain; L.distance = 0;
      } else { L.intensity = 0; L.position.copy(cam); L.target.position.copy(cam).add(new global.THREE.Vector3(0, -1, 0)); }
      L.target.updateMatrixWorld();
      if (L.castShadow) { L.shadow.needsUpdate = true; shadowRe++; }
    }
    for (var j = 0; j < placed.length; j++) if (placed[j].intensity > 0) lit++;
    return 'lit' + lit + '/' + placed.length + ' reaimed' + reaimed + ' shadowRe' + shadowRe + ' ' + (performance.now() - t0).toFixed(1) + 'ms';
  }

  function unstage(A, keepBudget) {
    film = null;
    if (!keepBudget) { A._stillLampCap = undefined; budgetCap = null; budgetShadow = null; }   // §LIGHT_UNIFORM_BUDGET — nav/films keep their own caps
    if (!placed.length) return;
    var n = placed.length;
    placed.forEach(function (L) { A.scene.remove(L.target); A.scene.remove(L); if (L.shadow && L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } L.dispose(); });
    placed = [];
    if (A.markDirty) A.markDirty();
    console.log('§SKY_PORTAL removed=' + n);
  }

  global.SkyPortal = { budget: budget, stage: stage, unstage: unstage, frame: frame, placedCount: function () { return placed.length; } };
})(typeof window !== 'undefined' ? window : this);
