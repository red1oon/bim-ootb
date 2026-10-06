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
  // one vertical cast: dir -1 = down from above (the HIGHEST hit of `disc`), +1 = up from below (the LOWEST hit of `disc`)
  function _cast(tg, disc, x, z, y0, dir, far) {
    if (!_ray) { _ray = new THREE.Raycaster(); _ray.firstHitOnly = false; }
    _ray.set(new THREE.Vector3(x, y0, z), new THREE.Vector3(0, dir, 0)); _ray.near = 0; _ray.far = far;
    var h; try { h = _ray.intersectObjects(tg, false); } catch (e) { return null; }
    for (var i = 0; i < h.length; i++) if (_discOfHit(h[i]) === disc) return h[i].point.y;   // sorted by distance from the origin
    return null;
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
    A.sectionAxis = 'R';
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
  A.civilCrossSectionOff = function () {
    A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) { o.material.clippingPlanes = []; o.material.needsUpdate = true; });
    A.sectionOn = false; A._civilSection = null; var b = document.getElementById('section-btn'); if (b) { b.style.background = '#444'; b.style.color = '#fff'; }
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
    var guids = [], byDisc = {}, all = A.civilElementBoxes();
    all.forEach(function (m) {
      var lo = Infinity, hi = -Infinity, xs = [m.minX, m.maxX], zs = [m.minZ, m.maxZ];
      for (var i = 0; i < 2; i++) for (var k = 0; k < 2; k++) { var dd = S.tx * xs[i] + S.tz * zs[k] - S.d; if (dd < lo) lo = dd; if (dd > hi) hi = dd; }
      if (lo <= 0 && hi >= 0) { guids.push(m.guid); byDisc[m.disc] = (byDisc[m.disc] || 0) + 1; }
    });
    return { guids: guids, indexed: all.length, byDisc: byDisc };
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

  // ── UI (civil only) ──
  var _ui = null;
  function _el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function _draw() {
    var ls = _ui && _ui.data; if (!ls) return;
    var cv = _ui.canvas, g = cv.getContext('2d'), W = cv.width, H = cv.height, P = { l: 52, r: 12, t: 12, b: 34 };
    g.clearRect(0, 0, W, H); g.fillStyle = '#16181d'; g.fillRect(0, 0, W, H);
    var lo = Infinity, hi = -Infinity;
    ['road', 'ground', 'drain'].forEach(function (k) { ls[k].forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    if (!isFinite(lo)) { g.fillStyle = '#aaa'; g.font = '12px sans-serif'; g.fillText('no road / earthwork surface under the route', 12, 24); return; }
    var pad = Math.max(0.5, (hi - lo) * 0.08); lo -= pad; hi += pad;
    var X = function (s) { return P.l + (W - P.l - P.r) * s / ls.len; }, Y = function (z) { return H - P.b - (H - P.t - P.b) * (z - lo) / (hi - lo); };
    _ui.map = { P: P, W: W, len: ls.len };
    g.strokeStyle = '#444'; g.lineWidth = 1; g.fillStyle = '#9aa'; g.font = '10px sans-serif';
    for (var i = 0; i <= 4; i++) { var z = lo + (hi - lo) * i / 4, y = Y(z); g.beginPath(); g.moveTo(P.l, y); g.lineTo(W - P.r, y); g.stroke(); g.fillText(z.toFixed(1), 6, y + 3); }
    for (var k = 0; k <= 4; k++) { var s = ls.len * k / 4; g.fillText(s.toFixed(0), X(s) - 8, H - P.b + 12); }
    g.fillText('chainage (inferred), m', P.l + 4, H - 6); g.save(); g.translate(10, H / 2); g.rotate(-Math.PI / 2); g.fillText('z (m)', -12, 0); g.restore();
    var SER = [['road', 'road top', '#4fc3f7'], ['ground', 'ground (earthwork)', '#c8a064'], ['drain', 'drain invert', '#e57373']];
    g.lineWidth = 2;
    SER.forEach(function (sr) {
      g.strokeStyle = sr[2]; g.beginPath(); var pen = false;
      ls.s.forEach(function (s, i) { var v = ls[sr[0]][i]; if (v == null) { pen = false; return; } if (!pen) { g.moveTo(X(s), Y(v)); pen = true; } else g.lineTo(X(s), Y(v)); });
      g.stroke();
    });
    SER.forEach(function (sr, i) { g.fillStyle = sr[2]; g.fillRect(P.l + 110 + i * 150, 8, 14, 3); g.fillStyle = '#ccc'; g.fillText(sr[1], P.l + 128 + i * 150, 13); });
    if (_ui.cur != null) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(_ui.cur), P.t); g.lineTo(X(_ui.cur), H - P.b); g.stroke(); }
  }
  A.civilSectionPanelOpen = function () {
    if (!_ui) return null;
    _ui.data = A.civilLongSection(); _ui.box.style.display = 'block'; _draw(); return _ui.data;
  };
  function _chainFromEvent(e) {
    var rc = _ui.canvas.getBoundingClientRect(), px = (e.clientX - rc.left) * (_ui.canvas.width / rc.width), m = _ui.map; if (!m) return null;
    return Math.max(0, Math.min(m.len, (px - m.P.l) / (m.W - m.P.l - m.P.r) * m.len));
  }
  function _build() {
    if (_ui) return;
    var btn = _el('button', 'position:fixed;right:10px;bottom:70px;z-index:30;padding:6px 10px;font:12px sans-serif;background:#2b3340;color:#fff;border:1px solid #4fc3f7;border-radius:4px;cursor:pointer', 'Road profile');
    btn.id = 'civil-section-btn'; btn.setAttribute('aria-label', 'Road long section and cross section');
    var box = _el('div', 'position:fixed;left:10px;right:10px;bottom:110px;max-width:860px;z-index:30;background:#16181d;border:1px solid #4fc3f7;border-radius:6px;padding:6px;display:none;font:12px sans-serif;color:#ddd');
    box.id = 'civil-section-panel';
    var cv = _el('canvas', 'width:100%;height:200px;display:block;cursor:crosshair'); cv.id = 'civil-section-canvas'; cv.width = 840; cv.height = 200;
    var row = _el('div', 'margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap');
    var lab = _el('span', null, 'chainage (inferred) m'), inp = _el('input', 'width:80px'); inp.type = 'number'; inp.id = 'civil-section-s'; inp.min = '0'; inp.step = '10';
    var go = _el('button', null, 'Go'), cut = _el('button', null, 'Cross-section'), off = _el('button', null, 'Clear cut'), close = _el('button', 'margin-left:auto', 'Close');
    go.id = 'civil-section-go'; cut.id = 'civil-section-cut'; off.id = 'civil-section-off';
    row.appendChild(lab); row.appendChild(inp); row.appendChild(go); row.appendChild(cut); row.appendChild(off); row.appendChild(close);
    box.appendChild(cv); box.appendChild(row); document.body.appendChild(btn); document.body.appendChild(box);
    _ui = { btn: btn, box: box, canvas: cv, input: inp, data: null, cur: null, map: null };
    var at = function (s) { if (s == null || isNaN(s)) return; _ui.cur = s; inp.value = s.toFixed(1); A.civilGotoChainage(s); _draw(); };
    btn.onclick = function () { if (box.style.display === 'block') box.style.display = 'none'; else A.civilSectionPanelOpen(); };
    cv.addEventListener('click', function (e) { at(_chainFromEvent(e)); });
    go.onclick = function () { at(parseFloat(inp.value)); };
    cut.onclick = function () { var s = parseFloat(inp.value); if (isNaN(s)) s = _ui.cur; if (s != null && !isNaN(s)) { _ui.cur = s; A.civilCrossSection(s); _draw(); } };
    off.onclick = function () { A.civilCrossSectionOff(); };
    close.onclick = function () { box.style.display = 'none'; };
    console.log('§LONG_SECTION ui=built (civil model with route)');
  }
  function _teardown() { if (!_ui) return; _ui.btn.remove(); _ui.box.remove(); _ui = null; _ls = null; }
  A._civilSectionUI = function () { return _ui; };
  var _poll = setInterval(function () {
    var ok = false; try { ok = !!_route(); } catch (e) {}
    if (ok && !_ui) _build(); else if (!ok && _ui) _teardown();
  }, 1500);
  A._civilSectionPoll = _poll;
}
if (typeof window !== 'undefined') window.setupCivilSections = setupCivilSections;
