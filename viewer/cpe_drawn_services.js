/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — cpe_drawn_services.js, prompts/DRAWN_SERVICES_FILM.md §3-§4. Read the §DRAWN-OVERLAY / §DRAWN-ONLY lines after every run.
// A FILM BEAT of the cpe_escape_route.js kind, not an engine: it draws what the drawings STATE and the Modeller's walk committed — ducts as lines, equipment as labelled markers — read from the two
// tables the Modeller's Export Viewer DB writes (drawn_walk_line, drawn_walk_marker). Nothing is drawn when the tables are absent. Same lifetime handling as the escape route's 3D part:
// objects are tracked, added to A.scene, and disposed (geometry, material, label texture) on teardown. Lines use the escape route's own material (LineBasicMaterial, depthTest:false so they read through).
// LAZY: viewer.html has no tag for this file. maxq_start.js (A.drawnServicesEnable) loads it on the first use, the way wing_2d.js loads its parts.
// Also here: the "drawn-only" VIEW state for a bake: the walked and borrowed meshes (elements whose BIMOOTB_Walk Provenance is not 'drawn:*') are hidden through the viewer's own
// A.filterByGuids isolate; no data is written, no count changes.
function setupCpeDrawnServices(A) {
  'use strict';
  var THREE = window.THREE, TAG = '§DRAWN', LINE_HEX = 0x00e5ff, MARK_HEX = 0xff5252;
  var _objs = [], _on = false, _rec = null, _only = null, LAYER = 'drawn.services';
  // §CEASE_SUBJECT (§7.1): every object this beat adds is registered as the film layer 'drawn.services', the NAMED subject layer the
  // ending-orbit cease keeps. A.filmLayer is attached by maxq_start.js drawnServicesEnable before this file is set up; the tag is the contract.
  function _add(o) { A.scene.add(o); _objs.push(o); if (A.filmLayer) A.filmLayer(LAYER, o); else { o.userData = o.userData || {}; o.userData.filmLayer = LAYER; } }

  function _hasTable(n) {
    try { var r = A.db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + n + "'"); return !!(r && r.length); } catch (e) { return false; }
  }
  function _rows(sql) {
    try { var r = A.db.exec(sql); if (!r || !r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); } catch (e) { return []; }
  }
  function _read() {
    if (!A.db) return { lines: [], markers: [] };
    return { lines: _hasTable('drawn_walk_line') ? _rows('SELECT * FROM drawn_walk_line') : [], markers: _hasTable('drawn_walk_marker') ? _rows('SELECT * FROM drawn_walk_marker') : [] };
  }
  function _label(text) {   // a flat plate, the same plain language as the escape route's labels (dark plate, white text)
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    var cx = cv.getContext('2d'); cx.fillStyle = 'rgba(20,20,24,0.85)'; cx.fillRect(0, 0, 256, 64);
    cx.strokeStyle = '#ff5252'; cx.lineWidth = 3; cx.strokeRect(1.5, 1.5, 253, 61);
    cx.fillStyle = '#ffffff'; cx.font = 'bold 22px sans-serif'; cx.textBaseline = 'middle'; cx.textAlign = 'center'; cx.fillText(String(text).slice(0, 22), 128, 33);
    var tex = new THREE.CanvasTexture(cv), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 1006; return sp;
  }
  function _tearDown() {
    _objs.forEach(function (o) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    if (A._filmLayers) A._filmLayers = A._filmLayers.filter(function (e) { return _objs.indexOf(e.obj) < 0; });   // disposed objects leave the registry
    _objs = []; _on = false;
  }
  function _build(d) {
    var byBasis = {}, nl = 0, nm = 0, i, p;
    if (d.lines.length) {
      var pos = new Float32Array(d.lines.length * 6);
      d.lines.forEach(function (r, k) {
        var a = A.ifc2three(r.x0, r.y0, r.z0), b = A.ifc2three(r.x1, r.y1, r.z1);
        pos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); nl++; byBasis[r.basis] = (byBasis[r.basis] || 0) + 1;
      });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var ln = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: LINE_HEX, transparent: true, opacity: 0.95, depthTest: false }));
      ln.renderOrder = 1005; ln.name = 'drawnServicesLines'; ln.userData.drawnLines = nl;
      _add(ln);
    }
    d.markers.forEach(function (r) {
      p = A.ifc2three(r.x, r.y, r.z);
      var m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: MARK_HEX, depthTest: false, depthWrite: false }));
      m.position.set(p.x, p.y, p.z); m.renderOrder = 1005; m.name = 'drawnServicesMarker'; m.userData.drawnMarker = { sheet: r.sheet, item: r.item };
      _add(m); nm++; byBasis[r.basis] = (byBasis[r.basis] || 0) + 1;
      var sp = _label(r.label || r.kind || ''); sp.position.set(p.x, p.y + 0.35, p.z); sp.name = 'drawnServicesLabel';
      _add(sp);
    });
    return { lines: nl, markers: nm, byBasis: byBasis };
  }

  // on=true: read the two tables and draw them; on=false: dispose. Returns the counts drawn (the §DRAWN-OVERLAY line), null when nothing is drawn.
  A.drawnServicesApply = function (on) {
    if (!on) { var was = _on; _tearDown(); _rec = null; if (was) console.log(TAG + '-OVERLAY off (disposed)'); return null; }
    if (!THREE || !A.scene || !A.db || !A.ifc2three) { console.log(TAG + '-OVERLAY INCONCLUSIVE no scene/db yet'); return null; }
    _tearDown();
    var d = _read();
    if (!d.lines.length && !d.markers.length) { console.log(TAG + '-OVERLAY lines=0 markers=0 byBasis={} (this DB states no drawn services: nothing drawn)'); _rec = { lines: 0, markers: 0, byBasis: {} }; return _rec; }
    _rec = _build(d); _on = true;
    console.log(TAG + '-OVERLAY lines=' + _rec.lines + ' markers=' + _rec.markers + ' byBasis=' + JSON.stringify(_rec.byBasis) + ' sceneObjects=' + _objs.length);
    if (A.markDirty) A.markDirty();
    return _rec;
  };
  A.drawnServicesStats = function () { return { on: _on, rec: _rec, objects: _objs.length, only: !!_only }; };

  // The drawn-only view. hide = elements the walk placed that no drawing states (BIMOOTB_Walk Provenance not 'drawn:*': borrowed bands, schedule placements, routed fixtures).
  A.drawnOnlyView = function (on) {
    if (!A.db || !A.filterByGuids) { console.log(TAG + '-ONLY INCONCLUSIVE no db/filter'); return null; }
    if (!on) { if (_only) { A.filterByGuids(_only.prev || null); console.log(TAG + '-ONLY off restored=' + (_only.prev ? 'previous isolate' : 'all')); _only = null; } return null; }
    var all = _rows('SELECT guid, ifc_class FROM elements_meta'), hide = {}, byClass = {}, n = 0;
    if (_hasTable('element_pset_common')) _rows("SELECT p.guid g FROM element_pset_common p WHERE p.pset='BIMOOTB_Walk' AND p.name='Provenance' AND p.value NOT LIKE 'drawn:%'").forEach(function (r) { hide[r.g] = 1; });
    var keep = new Set();
    all.forEach(function (r) { if (hide[r.guid]) { byClass[r.ifc_class] = (byClass[r.ifc_class] || 0) + 1; n++; } else keep.add(r.guid); });
    if (!_only) _only = { prev: A.activeGuidFilter || null };
    _only.hide = new Set(Object.keys(hide));   // §7.3: the frame witness reads it
    A.filterByGuids(keep);
    var ov = _rec ? _rec.lines + _rec.markers : 0;
    console.log(TAG + '-ONLY hidden=' + JSON.stringify(byClass) + ' hiddenTotal=' + n + ' shown=' + keep.size + ' overlay=' + ov + ' elements=' + all.length +
      (n ? '' : ' VACUOUS (no BIMOOTB_Walk rows: nothing was hidden, nothing is proven)'));
    return { hidden: byClass, hiddenTotal: n, shown: keep.size, overlay: ov, elements: all.length };
  };
  // §DRAWN-OVERLAY-FRAME (§7.3): what ONE frame shows, read from scene state (no re-derivation). visible = overlay objects visible with every
  // ancestor; hiddenGuidVisible = drawn-only hidden elements whose slot is visible (single mesh + ancestors, batched getVisibleAt, instanced
  // non-zero matrix: the __tmSnapshotVisible reads). Returns the log line, or null when the overlay is off.
  var _fm4 = null;
  function _chainVisible(o) { for (var p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  A.drawnServicesFrame = function (i) {
    if (!_on) return null;
    var v = 0; _objs.forEach(function (o) { if (o.parent && _chainVisible(o)) v++; });
    var H = _only && _only.hide, hv = 0, hn = H ? H.size : 0;
    if (H && hn) {
      if (!_fm4) _fm4 = new THREE.Matrix4();
      A.scene.traverse(function (o) {
        if (!o.userData) return;
        if (o.userData.guid !== undefined) { if (H.has(o.userData.guid) && _chainVisible(o)) hv++; return; }
        if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) { if (!_chainVisible(o)) return;
          A._batchMeta[o.id].forEach(function (b) { if (H.has(b.guid) && (o.getVisibleAt ? o.getVisibleAt(b.slotId) : true)) hv++; }); return; }
        if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) { if (!_chainVisible(o)) return;
          A._instanceMeta[o.id].forEach(function (m, k) { if (!H.has(m.guid)) return; o.getMatrixAt(k, _fm4); var e = _fm4.elements; if (!(e[0] === 0 && e[5] === 0 && e[10] === 0)) hv++; }); }
      });
    }
    return TAG + '-OVERLAY-FRAME i=' + i + ' visible=' + v + '/' + _objs.length + ' hiddenGuidVisible=' + hv + '/' + hn;
  };
  console.log(TAG + '-SERVICES wired (lazy; no allocation until drawnServicesApply)');
}
if (typeof window !== 'undefined') window.setupCpeDrawnServices = setupCpeDrawnServices;
if (typeof module !== 'undefined' && module.exports) module.exports = { setupCpeDrawnServices: setupCpeDrawnServices };
