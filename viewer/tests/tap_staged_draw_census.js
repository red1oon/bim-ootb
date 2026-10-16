// ⚠ DO NOT REMOVE — §SDC page tap (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.7)
// Installed by `cli_silent_bake.js --tap` at document start. Scope: in a frame rendered THROUGH
// photoreal staging by the real bake loop, census what the GPU is actually handed versus what the
// scene graph says is visible and inside the capture camera's frustum. Read the log after every run.
// Reads real object state only: BatchedMesh `_indirectTexture.image.data[0.._multiDrawCount)` is the
// instance-id list three r185 submits (class Eo.onBeforeRender in three.core.min.js — extracted,
// not assumed); InstancedMesh has no per-instance culling (frustumCulled=false, streaming.js §S271b).
(function () {
  'use strict';
  var T = window.__sdc = { frames: [], cur: null, passes: 0, installed: false, mats: {}, matLines: [], bounds: null, err: [] };
  var MARGIN = 0.05;   // metres: a sphere must be inside every plane by this much to count as in-frustum
  var prevTap = window.__maxqPoseTap;
  window.__maxqPoseTap = function (i, x, y, z, tx, ty, tz) {
    if (prevTap) try { prevTap.apply(null, arguments); } catch (e) {}
    try { install(); } catch (e) { T.err.push('install ' + e.message); }
    T.cur = { i: i, pose: [x, y, z, tx, ty, tz], passes: 0, colorPasses: 0, bm: {}, im: {}, captured: false };
  };
  function install() {
    var A = window.APP, THREE = window.THREE;
    if (T.installed || !A || !A.renderer || !THREE || !THREE.BatchedMesh) return;
    T.installed = true;
    if (typeof window.tmSetCursor === 'function' && !window.__sdcCursorWrapped) { var _tsc = window.tmSetCursor; window.__sdcCursorWrapped = true; window.tmSetCursor = function (c) { window.__sdcCursor = c; return _tsc.apply(this, arguments); }; }
    var R = A.renderer, origRender = R.render.bind(R);
    R.render = function (scene, camera) {
      T.pass = { color: !scene.overrideMaterial && scene === A.scene, n: ++T.passes };
      if (T.cur) { T.cur.passes++; if (T.pass.color) T.cur.colorPasses++; }
      return origRender(scene, camera);
    };
    var bmO = THREE.BatchedMesh.prototype.onBeforeRender;
    THREE.BatchedMesh.prototype.onBeforeRender = function (r, s, c, g, m) {
      var ret = bmO.apply(this, arguments);
      try { recBm(this, m); } catch (e) { T.err.push('recBm ' + e.message); }
      return ret;
    };
    var o3 = THREE.Object3D.prototype.onBeforeRender;
    THREE.Object3D.prototype.onBeforeRender = function (r, s, c, g, m) {
      try { if (this.isInstancedMesh) recIm(this, m); } catch (e) { T.err.push('recIm ' + e.message); }
      return o3.apply(this, arguments);
    };
    // capture moment: _captureFrame's own drawImage(renderer.domElement)
    var ctxP = window.CanvasRenderingContext2D.prototype, di = ctxP.drawImage;
    ctxP.drawImage = function (src) {
      if (src === A.renderer.domElement && T.cur && !T.cur.captured) { try { finalize(); } catch (e) { T.err.push('finalize ' + e.message); } }
      return di.apply(this, arguments);
    };
  }
  function recBm(o, mat) {
    var F = T.cur; if (!F || !T.pass || !T.pass.color) return;
    var meta = window.APP._batchMeta && window.APP._batchMeta[o.id]; if (!meta) return;
    var n = o._multiDrawCount, data = o._indirectTexture.image.data, ids = new Uint32Array(n);
    for (var k = 0; k < n; k++) ids[k] = data[k];
    F.bm[o.id] = { ids: ids, pass: T.pass.n, mat: mat && mat.uuid };   // last colour pass wins
    if (mat) snapMat(mat, F.i);
  }
  function recIm(o, mat) {
    var F = T.cur; if (!F || !T.pass || !T.pass.color) return;
    var meta = window.APP._instanceMeta && window.APP._instanceMeta[o.id]; if (!meta) return;
    F.im[o.id] = { count: o.count, pass: T.pass.n, mat: mat && mat.uuid };
    if (mat) snapMat(mat, F.i);
  }
  function snapMat(m, i) {
    var A = window.APP, p = null; try { p = A.renderer.properties.get(m); } catch (e) {}
    var cp = p && p.currentProgram;
    var s = { type: m.type, visible: m.visible, opacity: +(+m.opacity).toFixed(3), transparent: !!m.transparent,
      transmission: m.transmission == null ? null : +(+m.transmission).toFixed(3), envMap: !!m.envMap,
      depthWrite: !!m.depthWrite, diag: !!(cp && cp.diagnostics), prog: !!(cp && cp.program) };
    var key = JSON.stringify(s), prev = T.mats[m.uuid];
    if (prev && prev.key !== key) {
      var d = []; for (var k in s) if (String(prev.s[k]) !== String(s[k])) d.push(k + ':' + prev.s[k] + '→' + s[k]);
      T.matLines.push('§SDC_MAT i=' + i + ' uuid=' + m.uuid.slice(0, 8) + ' type=' + s.type + ' ' + d.join(' '));
    }
    T.mats[m.uuid] = { key: key, s: s };
  }
  function treeVisible(o) { for (var p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  function finalize() {
    var A = window.APP, THREE = window.THREE, F = T.cur; F.captured = true;
    var cam = A.camera, fr = new THREE.Frustum(), pv = new THREE.Matrix4();
    cam.updateMatrixWorld(); pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pv);
    var planes = fr.planes, m4 = new THREE.Matrix4(), sph = new THREE.Sphere();
    function inside(s) { for (var k = 0; k < 6; k++) if (planes[k].distanceToPoint(s.center) < -s.radius + MARGIN) return false; return true; }
    var per = {}, bmObjs = 0, imObjs = 0, drawnBm = 0, drawnIm = 0;
    function row(c) { return per[c] || (per[c] = { visible: 0, inFrustum: 0, drawn: 0, notDrawn: 0, sample: [], imObjs: 0, imDrawn: 0, countShort: 0, imPlaced: 0, imVisible: 0, imDrawnSlots: 0, imNotDrawn: 0 }); }
    A.scene.traverse(function (o) {
      if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
        bmObjs++; var meta = A._batchMeta[o.id], rec = F.bm[o.id]; if (rec) drawnBm++;
        var drawn = {}; if (rec) for (var k = 0; k < rec.ids.length; k++) drawn[rec.ids[k]] = 1;
        var tv = treeVisible(o); o.updateMatrixWorld();
        for (var j = 0; j < meta.length; j++) {
          var mt = meta[j], R = row(mt.ifcClass || '?'), sid = mt.slotId;
          var info = o._instanceInfo[sid]; if (!info || !info.active) continue;
          if (!(tv && info.visible)) continue;
          R.visible++;
          o.getMatrixAt(sid, m4); o.getBoundingSphereAt(info.geometryIndex, sph); sph.applyMatrix4(m4).applyMatrix4(o.matrixWorld);
          if (!inside(sph)) continue;
          R.inFrustum++;
          if (drawn[sid]) R.drawn++; else { R.notDrawn++; if (R.sample.length < 5) R.sample.push(mt.guid + (rec ? '' : '(objNotDrawn)')); }
        }
      } else if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
        imObjs++; var im = A._instanceMeta[o.id], rc = F.im[o.id]; if (rc) drawnIm++;
        var Ri = row((im[0] && im[0].ifcClass) || '?'); Ri.imObjs++; if (rc) Ri.imDrawn++;
        if (rc && rc.count < im.length) Ri.countShort += im.length - rc.count;
        // per-instance: a placed instance has a non-zero matrix (TM zero-scales the unplaced ones);
        // it reaches the GPU iff the object was drawn (no per-instance culling, §S271b) and i < count.
        var tvI = treeVisible(o);
        for (var q = 0; q < im.length; q++) {
          var ii = im[q].instanceIndex; o.getMatrixAt(ii, m4); var el = m4.elements;
          if (el[0] === 0 && el[5] === 0 && el[10] === 0) continue;
          Ri.imPlaced++; if (tvI && o.visible !== false) Ri.imVisible++;
          if (rc && ii < rc.count) Ri.imDrawnSlots++; else if (tvI && o.visible !== false) { Ri.imNotDrawn++; if (Ri.sample.length < 5) Ri.sample.push(im[q].guid + '(I)'); }
        }
      }
    });
    var lines = [], filmT = null;
    var hid = A.hiddenDiscs ? Array.from(A.hiddenDiscs).join('|') : '?';
    lines.push('§SDC_FRAME i=' + F.i + ' passes=' + F.passes + ' colorPasses=' + F.colorPasses + ' bmObjs=' + bmObjs + ' drawnBm=' + drawnBm + ' imObjs=' + imObjs + ' drawnIm=' + drawnIm +
      ' hiddenDiscs=[' + hid + '] revealKey=' + (A._cpeRevealVisualKey || '-') + ' tmPlaced=' + (window.tmPlacedCount && window.__sdcCursor ? window.tmPlacedCount(window.__sdcCursor) : '?'));
    var rows = [];
    for (var c in per) {
      var P = per[c];
      if (P.visible || P.imObjs) rows.push({ i: F.i, cls: c, visible: P.visible, inFrustum: P.inFrustum, drawn: P.drawn, notDrawn: P.notDrawn + P.imNotDrawn, imObjs: P.imObjs, imDrawn: P.imDrawn, countShort: P.countShort, imPlaced: P.imPlaced, imVisible: P.imVisible, imDrawnSlots: P.imDrawnSlots, sample: P.sample });
      if (P.notDrawn || P.imNotDrawn || P.countShort || /Plate|Window|Furni|Member|Column|Beam|Slab|Wall|Door/.test(c))
        lines.push('§SDC_CLASS i=' + F.i + ' cls=' + c + ' visible=' + P.visible + ' inFrustum=' + P.inFrustum + ' drawn=' + P.drawn + ' notDrawn=' + P.notDrawn +
          (P.imObjs ? ' imObjs=' + P.imObjs + ' imDrawn=' + P.imDrawn + ' imPlaced=' + P.imPlaced + ' imVisible=' + P.imVisible + ' imDrawnSlots=' + P.imDrawnSlots + ' imNotDrawn=' + P.imNotDrawn + ' countShort=' + P.countShort : '') + (P.sample.length ? ' sample=' + P.sample.join(',') : ''));
    }
    T.frames.push({ i: F.i, pose: F.pose, passes: F.passes, colorPasses: F.colorPasses, bmObjs: bmObjs, drawnBm: drawnBm, imObjs: imObjs, drawnIm: drawnIm, rows: rows, lines: lines });
    if (!T.bounds) T.bounds = boundsCheck();
  }
  function boundsCheck() {
    // over the INDEX range (info.start/count), the way r185 getBoundingSphereAt computes a null one —
    // a VERTEX-range scan counts vertices the index never references and reported 14,138 false stales.
    var A = window.APP, THREE = window.THREE, out = { bm: 0, geoms: 0, stale: 0, worst: 0 }, sph = new THREE.Sphere(), v = new THREE.Vector3(), box = new THREE.Box3();
    A.scene.traverse(function (o) {
      if (!(o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id])) return;
      out.bm++; var pos = o.geometry.attributes.position, idx = o.geometry.getIndex();
      for (var g = 0; g < o._geometryInfo.length; g++) {
        var gi = o._geometryInfo[g]; if (!gi || !gi.active) continue;
        out.geoms++; o.getBoundingSphereAt(g, sph); box.makeEmpty();
        for (var i = gi.start, l = gi.start + gi.count; i < l; i++) { var iv = idx ? idx.getX(i) : i; v.fromBufferAttribute(pos, iv); box.expandByPoint(v); }
        var c = box.getCenter(new THREE.Vector3()), r2 = 0;
        for (i = gi.start, l = gi.start + gi.count; i < l; i++) { iv = idx ? idx.getX(i) : i; v.fromBufferAttribute(pos, iv); r2 = Math.max(r2, c.distanceToSquared(v)); }
        var over = c.distanceTo(sph.center) + Math.sqrt(r2) - sph.radius;
        if (over > 0.01) { out.stale++; if (over > out.worst) out.worst = over; }
      }
    });
    return out;
  }
  window.__maxqTapReport = function () {
    var lines = [], rows = [];
    T.frames.forEach(function (f) { lines.push.apply(lines, f.lines); rows.push.apply(rows, f.rows); });
    lines.push.apply(lines, T.matLines);
    if (T.bounds) lines.push('§SDC_BOUNDS_STALE bm=' + T.bounds.bm + ' geoms=' + T.bounds.geoms + ' stale=' + T.bounds.stale + ' worstM=' + T.bounds.worst.toFixed(3));
    if (T.err.length) lines.push('§SDC_ERR ' + T.err.slice(0, 5).join(' | '));
    if (!T.frames.length) lines.push('§SDC_VERDICT INCONCLUSIVE reason=no frame captured (installed=' + T.installed + ')');
    else {
      var nd = 0, cs = 0, noColor = 0; rows.forEach(function (r) { nd += r.notDrawn; cs += r.countShort; });
      T.frames.forEach(function (f) { if (!f.colorPasses) noColor++; });
      lines.push(noColor === T.frames.length ? '§SDC_VERDICT INCONCLUSIVE reason=no colour pass seen in any frame'
        : '§SDC_VERDICT ' + (nd || cs ? 'FAIL' : 'PASS') + ' frames=' + T.frames.length + ' notDrawnTotal=' + nd + ' countShortTotal=' + cs + ' framesWithoutColorPass=' + noColor);
    }
    return { lines: lines, rows: rows, frames: T.frames.map(function (f) { return { i: f.i, pose: f.pose, passes: f.passes, colorPasses: f.colorPasses, bmObjs: f.bmObjs, drawnBm: f.drawnBm, imObjs: f.imObjs, drawnIm: f.drawnIm }; }), bounds: T.bounds, err: T.err };
  };
})();
