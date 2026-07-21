/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// dlod_nav.js — Implementing FLY_TOUR_DLOD_SCALE.md §9 (v1) — Witnesses: W-DLOD-NAV-EQUIV,
// W-DLOD-NAV-PROXY, W-DLOD-NAV-PERF, W-DLOD-NAV-NO-REBUILD.
// §ROOM_OCCL step 1 — Implementing FLY_TOUR_DLOD_SCALE.md §13 — Witnesses: W-ROOM-OCCL-EQUIV,
// W-ROOM-OCCL-PROXY, W-ROOM-OCCL-PERF, W-ROOM-OCCL-STABILITY. Room-mismatch (camera's current
// room ≠ element's contained room) as a THIRD OR'd demote criterion in the same _boxIndex state
// machine; live point-in-rect current-room test with the walker's floor-anchor Z-join; N-eval
// membership-stability gate; interior legs only. window.__dlodNav.roomOcclEnabled (default
// false) — when false, behavior is identical to the pre-§13 module.
//
// Nav-scope DLOD box-proxy: during free orbit/pan and Fly Tour on large buildings (>50k
// elements), far/out-of-frustum elements render as wireframe boxes (TM_DLOD_SCALE.md §9's
// established proxy look), real mesh otherwise. SIBLING of time_machine.js's TM-only DLOD —
// reuses the PATTERN, shares NO state with it (four prior retractions all involved coupled
// visibility systems; mutual exclusion instead: this module disengages whenever TM is open).
//
// §8 FINDINGS combo (measured, both SwiftShader + RTX 4060): hysteresis (promote ≤50m in-frustum,
// demote >80m or 5m-outside-frustum) + 10-frame overlay-hoist cross-fade + depthWrite:false on
// fading materials. Overlay-hoist (§8 ADDENDUM B) because BatchedMesh has no per-instance alpha
// on r185 — hide slot + same-frame standalone copy measured pixel-identical.
//
// ENGAGE GATE (§9; any failure ⇒ full disengage+restore): pill ON, >50k elements, !streaming,
// !TM (_tmOn), !Find isolation (activeGuidFilter — §3 USER-DICTATED scope), !storey/disc filter,
// !Cinema (_cinemaOrbitActive/_maxqActive), !Photoreal still (_stillRefineActive).
(function () {
  'use strict';

  function A() { return window.APP || window.A; }

  var NAV_MIN_ELEMENTS = 50000;    // LARGE_BUILDING, time_machine.js:471 — same proven gate
  var PROMOTE_DIST = 50, DEMOTE_DIST = 80;          // §8: S261's band, now with fade on top
  var PROMOTE_SQ = PROMOTE_DIST * PROMOTE_DIST, DEMOTE_SQ = DEMOTE_DIST * DEMOTE_DIST;
  var FRUSTUM_MARGIN = 5;          // §9: angular hysteresis — must be 5m OUTSIDE frustum to demote
  var FADE_FRAMES = 10;            // §8 FINDINGS #4: N=10 sufficed; 5 and 20 both worse
  var FADE_CAP = 128;              // §9: transitions beyond cap SNAP (= shipped TM-DLOD behavior)
                                   // (a per-frame TRANSITION_BUDGET was tried 2026-07-21 and
                                   // MEASURED WORSE — throttling convergence left the scene
                                   // half-real through the demote wave, draw calls 3245→7984,
                                   // sweep mean 19.9→92.5ms. Transitions are not the flight
                                   // bottleneck; do not re-add without new numbers.)
  var EVAL_CHUNK = 16384;          // §FLY_SMOOTH (2026-07-21 user "still lagging in flight"):
                                   // one monolithic 122k-element eval measured 42ms/hit at a
                                   // 150ms cadence = 28% main-thread duty cycle + 7k-transition
                                   // bursts per hit (473k snaps/600 flight frames). The scan is
                                   // now CHUNKED — ~16k elements per rAF tick (~3-4ms), a full
                                   // pass every ~8 frames — same partition, amortized cost,
                                   // transition bursts spread across frames.
  var DEPTH_MAX_RADIUS = 25;       // §9 shine-thru fix: no depth pass for oversized bboxes — a
                                   // giant slab's invisible occluder would erase REAL nearby
                                   // geometry (center-distance ≠ bbox extent); wireframe-only there
  var ROOM_STABLE_N = 12;          // §13 membership-stability gate (§11.2 Q4: 10-15 frames —
                                   // filters all 17 measured A→B→A flaps at ~0.2s switch latency,
                                   // well under the 500ms median room dwell)

  var _pillOn = false;             // user toggle — OFF = this module does exactly nothing
  var _engaged = false;            // gate currently satisfied and proxy state applied
  var _rafId = null;
  var _boxIndex = null;            // guid → {mesh, idx, matrix, pos, radius, state:'real'|'box', boxVisible}
  var _boxMeshes = null;           // wireframe InstancedMesh per discipline (nav-owned set)
  var _boxBld = null;
  var _realIndex = null;           // guid → {kind:'mesh'|'inst'|'batch', obj, idx|slotId, meta}
  var _fades = [];                 // active transitions
  var _unitBox = null, _zeroM = null, _frustum = null, _psm = null, _sphere = null, _m4 = null;
  var _lastCamSig = null;
  var _guidArr = null, _evalCursor = 0, _scanPending = false; // §FLY_SMOOTH: chunked-scan state
  var _passReal = 0, _passBoxed = 0; // partition counters accumulated across a pass
  var _logAccStarted = 0, _lastLogT = 0; // 2026-07-21 user "remove history log spam": eval line ≤1 per 2s
  // §ROOM_OCCL state (§13) — ALL of it inert unless _stats.roomOcclEnabled is flipped true
  var _roomIdx = null, _roomIdxBld = null, _roomIdxTriedT = 0, _roomStampRef = null;
  var _roomCur = null, _roomPend, _roomPendN = 0, _roomActive = false, _roomEvals = 0;
  var _stats = { mutations: 0, active: 0, boxed: 0, fades: 0, snaps: 0, evalMs: 0,
    // §13 step-1 testing lever: plain boolean, default false, live-flippable from the console
    // (window.__dlodNav.roomOcclEnabled = true) — NOT a UI toggle; false ⇒ identical to shipped.
    roomOcclEnabled: false, roomCur: null, roomLeg: false, roomEvals: 0, roomChanges: 0,
    roomIdxRects: 0, roomIdxStamped: 0 };
  window.__dlodNav = _stats;

  function _gateBlockReason(app) {
    if (!app || !app.scene || !app.camera || typeof THREE === 'undefined') return 'no-app';
    if (!(app.activeBuildingTotal > NAV_MIN_ELEMENTS)) return 'small-building';
    if (app.streaming) return 'streaming';
    if (app._tmOn) return 'tm-open';                          // TM owns visibility when open
    if (app.activeGuidFilter) return 'find-isolation';        // §3 scope decision: full disengage
    if (app.activeStoreyFilter !== null && app.activeStoreyFilter !== undefined) return 'storey-filter';
    if (app.hiddenDiscs && app.hiddenDiscs.size > 0) return 'disc-filter';
    if (app._cinemaOrbitActive || app._maxqActive) return 'cinema';   // §3: Alt+C excluded
    if (app._stillRefineActive) return 'photoreal';                   // §3: Alt+P excluded
    return null;
  }

  // ── Box set + index (pattern: time_machine.js _dlodBuildBoxes, TM_DLOD_SCALE.md §9) ──
  function _buildBoxes(app) {
    if (_boxIndex && _boxBld === app.activeBuilding) return true;
    if (!app.dbQuery || !app.ifc2three) { console.log('§DLOD_NAV_BUILD_SKIP deps'); return false; }
    var t0 = performance.now(), rows;
    try {
      rows = app.dbQuery("SELECT t.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z, m.discipline" +
        " FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid WHERE t.center_x IS NOT NULL") || [];
    } catch (e) { console.log('§DLOD_NAV_BUILD_SKIP query ' + e.message); return false; }
    _disposeBoxes();
    var byDisc = {};
    for (var i = 0; i < rows.length; i++) { var d = rows[i][7] || '_'; (byDisc[d] = byDisc[d] || []).push(rows[i]); }
    var discs = Object.keys(byDisc);
    if (!discs.length) { console.log('§DLOD_NAV_BUILD_EMPTY rows=' + rows.length); return false; }
    if (!_unitBox) _unitBox = new THREE.BoxGeometry(1, 1, 1);
    if (!_zeroM) _zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    var index = Object.create(null), meshes = [], total = 0;
    var m4 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _q = new THREE.Quaternion();
    for (var di = 0; di < discs.length; di++) {
      var disc = discs[di], drows = byDisc[disc];
      var color = (app.DISC_COLORS && app.DISC_COLORS[disc]) || app.DEFAULT_COLOR || 0x8899aa;
      // Wireframe look verbatim — feedback_no_fake_lod_unbreakable.md: boxes must read as proxy
      var mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.4 });
      var im = new THREE.InstancedMesh(_unitBox, mat, drows.length);
      im.frustumCulled = false;
      im.userData.isBboxPlaceholder = true;  // proven pick-exclusion (picking.js:257)
      im.userData.isDlodNavProxy = true;     // nav-scope marker (vs isDlodTmProxy)
      // §9 addition (user: "bboxes must not shine thru"): paired depth-only pass — boxed masses
      // self-occlude, so interior boxes stop X-raying through boxed facades. Opaque pass
      // (transparent:false) ⇒ depth is laid down before the transparent wireframes render.
      var depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
      var imDepth = new THREE.InstancedMesh(_unitBox, depthMat, drows.length);
      imDepth.frustumCulled = false;
      imDepth.userData.isBboxPlaceholder = true;
      imDepth.userData.isDlodNavDepth = true;
      // NEVER registered in _instanceMeta/_batchMeta — landmine 1 (TM_DLOD_SCALE.md §5.1)
      for (var j = 0; j < drows.length; j++) {
        var r = drows[j], p = app.ifc2three(r[1], r[2], r[3]);
        var bx = r[4] || 0.3, by = r[5] || 0.3, bz = r[6] || 0.3;
        _pos.set(p.x, p.y, p.z);
        _scl.set(bx, bz, by); // axis swap matches _buildMergedGhost / TM box build
        m4.compose(_pos, _q, _scl);
        im.setMatrixAt(j, _zeroM);
        imDepth.setMatrixAt(j, _zeroM);
        index[r[0]] = { mesh: im, depthMesh: imDepth, idx: j, matrix: m4.clone(), pos: _pos.clone(),
          radius: Math.sqrt(bx * bx + by * by + bz * bz) * 0.5, state: 'real', boxVisible: false };
        total++;
      }
      im.instanceMatrix.needsUpdate = true;
      imDepth.instanceMatrix.needsUpdate = true;
      app.scene.add(imDepth); app.scene.add(im);
      meshes.push(im); meshes.push(imDepth);
    }
    _boxIndex = index; _boxMeshes = meshes; _boxBld = app.activeBuilding;
    _guidArr = Object.keys(index); _evalCursor = 0; _scanPending = false; // §FLY_SMOOTH chunk state
    console.log('§DLOD_NAV_BUILD bld=' + app.activeBuilding + ' boxes=' + total + ' discs=' + discs.length +
      ' build_ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  function _disposeBoxes() {
    if (_boxMeshes) for (var i = 0; i < _boxMeshes.length; i++) {
      var m = _boxMeshes[i];
      if (m.parent) m.parent.remove(m);
      m.material.dispose(); // geometry (_unitBox) is shared — disposed never, module-lifetime
    }
    _boxMeshes = null; _boxIndex = null; _boxBld = null; _realIndex = null;
  }

  // ── Real-mesh reverse index: guid → where its real representation lives ──
  function _buildRealIndex(app) {
    if (_realIndex) return;
    var t0 = performance.now(), idx = Object.create(null), n = 0, aggs = 0;
    app.scene.traverse(function (obj) {
      if (!obj.userData) return;
      if (obj.userData.isBboxPlaceholder) return; // never index proxies (ours or TM's or load-time)
      if (obj.userData.guid && obj.isMesh) { idx[obj.userData.guid] = { kind: 'mesh', obj: obj }; n++; return; }
      // Per-mesh aggregate: per-slot hiding (zero-scale/setVisibleAt) never removes the mesh
      // OBJECT's draw call — when every slot of a mesh is DLOD-hidden, drop the whole mesh from
      // the render list (mesh.visible=false), same lever as A.filterInstancedMesh's anyVisible.
      // Measured on LTU (W-DLOD-NAV-PERF run 2): without this, all-boxed only cut 15675→13639
      // draw calls — the scene is ~15K small mesh objects, the object-level flag is the lever.
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        var metas = app._instanceMeta[obj.id];
        var agg = { obj: obj, total: metas.length, hidden: 0 }; aggs++;
        for (var i = 0; i < metas.length; i++) { idx[metas[i].guid] = { kind: 'inst', obj: obj, idx: i, meta: metas[i], agg: agg }; n++; }
        return;
      }
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id];
        var bagg = { obj: obj, total: bmetas.length, hidden: 0 }; aggs++;
        for (var b = 0; b < bmetas.length; b++) { idx[bmetas[b].guid] = { kind: 'batch', obj: obj, slotId: bmetas[b].slotId, meta: bmetas[b], agg: bagg }; n++; }
      }
    });
    _realIndex = idx;
    console.log('§DLOD_NAV_REALIDX entries=' + n + ' meshAggs=' + aggs + ' ms=' + (performance.now() - t0).toFixed(0));
  }

  function _hideReal(r) {
    _stats.mutations++;
    if (r.kind === 'mesh') { r.obj.visible = false; return; }
    if (r.kind === 'inst') {
      if (!r.meta._origMatrix) { r.meta._origMatrix = new THREE.Matrix4(); r.obj.getMatrixAt(r.idx, r.meta._origMatrix); }
      r.obj.setMatrixAt(r.idx, _zeroM); r.obj.instanceMatrix.needsUpdate = true;
    } else {
      r.obj.setVisibleAt(r.slotId, false);
    }
    r.agg.hidden++;
    if (r.agg.hidden >= r.agg.total) r.obj.visible = false; // whole mesh boxed — kill its draw call
  }
  function _showReal(r) {
    _stats.mutations++;
    if (r.kind === 'mesh') { r.obj.visible = true; return; }
    if (r.kind === 'inst') {
      if (r.meta._origMatrix) { r.obj.setMatrixAt(r.idx, r.meta._origMatrix); r.obj.instanceMatrix.needsUpdate = true; }
    } else {
      r.obj.setVisibleAt(r.slotId, true);
    }
    r.agg.hidden--;
    if (!r.obj.visible) r.obj.visible = true;
  }
  function _realMatrix(r, out) {
    if (r.kind === 'mesh') { out.copy(r.obj.matrixWorld); return true; }
    if (r.kind === 'inst') {
      if (r.meta._origMatrix) out.copy(r.meta._origMatrix); else r.obj.getMatrixAt(r.idx, out);
      out.premultiply(r.obj.matrixWorld); return true;
    }
    r.obj.getMatrixAt(r.slotId, out); out.premultiply(r.obj.matrixWorld); return true;
  }
  function _realGeometry(r) {
    if (r.kind === 'mesh') return r.obj.geometry;
    if (r.kind === 'inst') return r.obj.geometry;
    var sg = r.obj.userData.slotGeo; // recorded at flush (streaming.js §9 additive line)
    return (sg && sg[r.slotId]) || null;
  }
  function _realMaterial(r) {
    var m = r.obj.material;
    return Array.isArray(m) ? m[0] : m;
  }

  function _setBoxInstance(e, visible) {
    if (e.boxVisible === visible) return;
    e.boxVisible = visible;
    var m = visible ? e.matrix : _zeroM;
    e.mesh.setMatrixAt(e.idx, m);
    e.mesh.instanceMatrix.needsUpdate = true;
    // §9: paired depth-only pass tracks the wireframe — except oversized bboxes (see DEPTH_MAX_RADIUS)
    e.depthMesh.setMatrixAt(e.idx, (visible && e.radius <= DEPTH_MAX_RADIUS) ? e.matrix : _zeroM);
    e.depthMesh.instanceMatrix.needsUpdate = true;
    _stats.mutations++;
  }

  // ── Cross-fade transitions (§8 FINDINGS #4: overlay-hoist + depthWrite:false, N=10) ──
  function _startFade(app, guid, e, r, toBox) {
    var geo = _realGeometry(r);
    if (!geo) { _snap(app, e, r, toBox); return; }   // no slot geometry recorded → snap (graceful)
    if (_fades.length >= FADE_CAP) { _snap(app, e, r, toBox); _stats.snaps++; return; }
    var m4 = new THREE.Matrix4();
    _realMatrix(r, m4);
    var realMat = _realMaterial(r);
    if (!realMat) { _snap(app, e, r, toBox); return; }
    var rm = realMat.clone(); rm.transparent = true; rm.depthWrite = false;
    var realCopy = new THREE.Mesh(geo, rm);
    realCopy.matrixAutoUpdate = false; realCopy.matrix.copy(m4);
    realCopy.userData.isDlodNavOverlay = true; realCopy.userData.isBboxPlaceholder = true; // pick-excluded
    var bm = e.mesh.material.clone(); bm.depthWrite = false; // wireframe, already transparent
    var boxCopy = new THREE.Mesh(_unitBox, bm);
    boxCopy.matrixAutoUpdate = false; boxCopy.matrix.copy(e.matrix);
    boxCopy.userData.isDlodNavOverlay = true; boxCopy.userData.isBboxPlaceholder = true;
    // same-frame swap: hide both canonical representations, overlays take over (pixel-identical, §8 ADDENDUM P3)
    _hideReal(r);
    _setBoxInstance(e, false);
    rm.opacity = toBox ? 1 : 0;
    bm.opacity = toBox ? 0 : 0.4;
    app.scene.add(realCopy); app.scene.add(boxCopy);
    e.state = toBox ? 'box' : 'real'; // target state owned immediately; fade is presentation only
    _fades.push({ e: e, r: r, toBox: toBox, frame: 0, realCopy: realCopy, boxCopy: boxCopy });
    _stats.fades++;
  }

  function _snap(app, e, r, toBox) {
    if (toBox) { _hideReal(r); _setBoxInstance(e, true); } else { _setBoxInstance(e, false); _showReal(r); }
    e.state = toBox ? 'box' : 'real';
  }

  function _finishFade(app, f) {
    app.scene.remove(f.realCopy); app.scene.remove(f.boxCopy);
    f.realCopy.material.dispose(); f.boxCopy.material.dispose(); // clones only; geometries shared
    if (f.toBox) { _setBoxInstance(f.e, true); } else { _showReal(f.r); }
  }

  function _stepFades(app) {
    if (!_fades.length) return false;
    for (var i = _fades.length - 1; i >= 0; i--) {
      var f = _fades[i];
      f.frame++;
      var t = Math.min(1, f.frame / FADE_FRAMES);
      var real01 = f.toBox ? 1 - t : t;
      f.realCopy.material.opacity = real01;
      f.boxCopy.material.opacity = 0.4 * (1 - real01);
      if (t >= 1) { _finishFade(app, f); _fades.splice(i, 1); }
    }
    return true;
  }

  function _cancelFadesSnap(app) {
    for (var i = 0; i < _fades.length; i++) {
      var f = _fades[i];
      _finishFade(app, f); // jump to target state instantly
    }
    _fades.length = 0;
  }

  // ══ §ROOM_OCCL — FLY_TOUR_DLOD_SCALE.md §13: room-mismatch demote, STEP 1 ══
  // §11.2 Q3 gate: room-criterion active only on interior legs. During a tour, interior =
  // flyPath legs plus the interior pause/lookAround beats between them (they hold camera
  // position, so interior-ness persists; the finale lookAround is distinguished by carrying
  // lookAtX). Tour-driven orbit/moveTo/Bird's-eye/Final legs disable it. Outside a tour there
  // is no aerial/orbit leg concept — free navigation counts as interior by default (§13).
  function _roomLegActive(app) {
    if (app.flyActive && app.walkActions && app.walkActions.length) {
      var act = app.walkActions[app.walkActionIdx];
      if (!act) return false;
      if (act.type === 'flyPath') return true;
      if ((act.type === 'pause' || act.type === 'lookAround') && act.lookAtX === undefined) return true;
      return false; // orbit / moveTo / rise / riseAndTilt / finale lookAround
    }
    return true;
  }

  // Lazy, building-keyed camera-room index + per-element room stamp. Only ever called when
  // roomOcclEnabled — zero queries, zero cost otherwise. Rooms may not be compiled yet when the
  // flag is first flipped (ensureRooms is idle-deferred on 'o'): retry throttled, never spin.
  function _roomIdxEnsure(app) {
    if (_roomIdx && _roomIdxBld === app.activeBuilding && _roomStampRef === _boxIndex) return true;
    var now = performance.now();
    if (now - _roomIdxTriedT < 3000) return false;
    _roomIdxTriedT = now;
    if (!window.RoomWalker || !window.RoomWalker.buildCameraRoomIndex || !app.db || !app.dbQuery || !_boxIndex) return false;
    var t0 = performance.now(), idx;
    try { idx = window.RoomWalker.buildCameraRoomIndex(app.db); }
    catch (e) { console.log('§ROOM_OCCL_INDEX_ERR ' + e.message); return false; }
    if (!idx || !idx.rects) { console.log('§ROOM_OCCL_INDEX rects=0 (rooms not compiled yet — will retry)'); return false; }
    // Stamp each element's LOGICAL contained room from rel_contained_in_space (compiled RM_ rows
    // only — the same domain roomAt() resolves into). Elements with no row keep room=undefined and
    // are simply never eligible for the room-criterion (§13: distance/frustum unchanged for them).
    var stamped = 0;
    try {
      var rel = app.dbQuery("SELECT element_guid, space_guid FROM rel_contained_in_space " +
        "WHERE space_guid LIKE 'RM\\_%' ESCAPE '\\'") || [];
      for (var i = 0; i < rel.length; i++) { var be = _boxIndex[rel[i][0]]; if (be) { be.room = rel[i][1]; stamped++; } }
    } catch (e2) { console.log('§ROOM_OCCL_INDEX_ERR rel ' + e2.message); return false; }
    _roomIdx = idx; _roomIdxBld = app.activeBuilding; _roomStampRef = _boxIndex;
    _stats.roomIdxRects = idx.rects; _stats.roomIdxStamped = stamped;
    console.log('§ROOM_OCCL_INDEX bld=' + app.activeBuilding + ' rects=' + idx.rects +
      ' floors=' + idx.anchorNames.length + ' stamped=' + stamped + ' ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  function _roomReset() {
    if (_roomCur !== null) _scanPending = true; // room dropped — re-partition so room-demoted elements can promote
    _roomCur = null; _roomPend = undefined; _roomPendN = 0; _roomActive = false;
    _stats.roomCur = null; _stats.roomLeg = false;
  }

  // Per-frame current-room eval (same rAF loop as everything else — no second timer, §13). The
  // stability window is counted in FRAMES per §11.2 Q4's measurement; a room ACCEPTANCE re-arms
  // the chunked scan so the partition updates even when the camera pose itself is unchanged
  // (e.g. stability maturing while hovering). The point-in-rect test is one camera point vs the
  // compiled rect rows on ONE floor — trivial next to the element scan (§11.2 Q2).
  function _roomEval(app) {
    if (!_roomIdxEnsure(app)) { _roomReset(); return; }
    if (!_roomLegActive(app)) { _roomReset(); return; }
    _stats.roomLeg = true;
    var off = app.modelOffset, c = app.camera.position;
    if (!off) { _roomReset(); return; }
    // three→IFC: inverse of A.ifc2three (same mapping navigate_engine.js startNavigation uses)
    var raw = _roomIdx.roomAt(c.x + off.x, -c.z + off.y, c.y + off.z);
    _roomEvals++; _stats.roomEvals = _roomEvals;
    // §13 membership-stability gate: accept a NEW current room (including null) only after
    // ROOM_STABLE_N consecutive evals agree — filters the measured A→B→A flap churn (§11.2 Q4).
    if (raw === _roomPend) { _roomPendN++; } else { _roomPend = raw; _roomPendN = 1; }
    if (_roomPendN >= ROOM_STABLE_N && raw !== _roomCur) {
      _roomCur = raw; _stats.roomCur = raw; _stats.roomChanges++;
      console.log('§ROOM_OCCL_ROOM room=' + (raw || 'none') + ' stableN=' + _roomPendN +
        ' changes=' + _stats.roomChanges);
      _scanPending = true;
    }
    // §13 explicit no-room state: camera outside all compiled rects ⇒ criterion contributes
    // nothing this tick — distance/frustum alone still govern. Never "no room = demote all."
    _roomActive = (_roomCur !== null);
  }

  // ── Per-element wanted state under hysteresis (FLY_TOUR_DLOD_SCALE.md §9 decision rule) ──
  function _wantedReal(e, camPos) {
    var d2 = camPos.distanceToSquared(e.pos);
    // §13 room-mismatch: THIRD OR'd demote criterion (promote = inverse AND-of-NOTs). Only bites
    // when roomOcclEnabled+interior-leg+camera-in-a-room (_roomActive) AND the element has a
    // compiled containment row (e.room). false ⇒ short-circuits to the shipped decision rule.
    var roomMis = _roomActive && e.room !== undefined && e.room !== _roomCur;
    if (e.state === 'real') {
      // demote only when clearly out: >80m OR sphere+5m margin outside frustum OR room mismatch
      if (d2 > DEMOTE_SQ) return false;
      if (roomMis) return false;
      _sphere.center.copy(e.pos); _sphere.radius = e.radius + FRUSTUM_MARGIN;
      return _frustum.intersectsSphere(_sphere);
    }
    // promote only when clearly in: ≤50m AND exact frustum AND (room matches or criterion inert)
    if (d2 > PROMOTE_SQ) return false;
    if (roomMis) return false;
    _sphere.center.copy(e.pos); _sphere.radius = e.radius;
    return _frustum.intersectsSphere(_sphere);
  }

  // §FLY_SMOOTH: one CHUNK of the scan per rAF tick. Camera pose is re-read per chunk — elements
  // in different chunks see slightly different poses within a pass; the 50/80m + 5m-frustum
  // hysteresis bands absorb that skew by design (they exist to absorb pose jitter).
  function _evalChunk(app) {
    if (!_guidArr || !_guidArr.length) return;
    var t0 = performance.now();
    if (!_frustum) { _frustum = new THREE.Frustum(); _psm = new THREE.Matrix4(); _sphere = new THREE.Sphere(); _m4 = new THREE.Matrix4(); }
    _psm.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_psm);
    var camPos = app.camera.position;
    var end = Math.min(_evalCursor + EVAL_CHUNK, _guidArr.length);
    var started = 0;
    for (var i = _evalCursor; i < end; i++) {
      var guid = _guidArr[i], e = _boxIndex[guid];
      var want = _wantedReal(e, camPos);
      if (want === (e.state === 'real')) { if (e.state === 'box') _passBoxed++; else _passReal++; continue; }
      var r = _realIndex[guid];
      if (!r) { e.state = want ? 'real' : 'box'; continue; } // no real mesh resident — index only
      _startFade(app, guid, e, r, !want);
      started++;
      if (e.state === 'box') _passBoxed++; else _passReal++;
    }
    _evalCursor = end;
    _stats.evalMs = +(performance.now() - t0).toFixed(1); // per-CHUNK cost now (was per full pass)
    _logAccStarted += started;
    if (_evalCursor >= _guidArr.length) { // pass complete — publish partition, rearm on next pose change
      _stats.active = _passReal; _stats.boxed = _passBoxed;
      _passReal = 0; _passBoxed = 0;
      _evalCursor = 0;
      _scanPending = false;
      var _nowLog = performance.now();
      if (_logAccStarted && (_nowLog - _lastLogT) >= 2000) {
        console.log('§DLOD_NAV active=' + _stats.active + ' boxed=' + _stats.boxed + ' mode=on started=' + _logAccStarted +
          ' fades=' + _fades.length + ' chunk_ms=' + _stats.evalMs +
          (_stats.roomOcclEnabled === true ? ' room=' + (_roomActive ? (_roomCur || 'none') : (_stats.roomLeg ? 'none' : 'leg-off')) : ''));
        _logAccStarted = 0; _lastLogT = _nowLog;
      }
    }
    if (started && app.markDirty) app.markDirty();
  }

  function _camSig(app) {
    var p = app.camera.position, q = app.camera.quaternion;
    return p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + '|' +
           q.x.toFixed(3) + ',' + q.y.toFixed(3) + ',' + q.z.toFixed(3) + ',' + q.w.toFixed(3);
  }

  function _restoreAll(app, reason) {
    _roomReset(); // §ROOM_OCCL: disengage clears current-room state (index stays, building-keyed)
    _cancelFadesSnap(app);
    if (_boxIndex) {
      for (var guid in _boxIndex) {
        var e = _boxIndex[guid];
        if (e.state === 'box') {
          var r = _realIndex && _realIndex[guid];
          _setBoxInstance(e, false);
          if (r) _showReal(r);
          e.state = 'real';
        }
      }
    }
    // Belt-and-braces: if a filter turned on while we were engaged, reassert it after restore
    if (app.activeGuidFilter && app.filterByGuids) app.filterByGuids(app.activeGuidFilter);
    else if ((app.activeStoreyFilter !== null && app.activeStoreyFilter !== undefined) && app.filterStorey) app.filterStorey(app.activeStoreyFilter);
    if (app.markDirty) app.markDirty();
    console.log('§DLOD_NAV_DISENGAGE reason=' + reason + ' mutations=' + _stats.mutations);
  }

  function _tick() {
    _rafId = null;
    if (!_pillOn) return; // pill off mid-flight — _toggleOff already restored
    var app = A();
    var block = _gateBlockReason(app);
    if (block) {
      if (_engaged) { _restoreAll(app, block); _engaged = false; _lastCamSig = null; }
      _rafId = requestAnimationFrame(_tick); // stay alive; re-engage when the gate clears
      return;
    }
    if (!_engaged) {
      if (!_buildBoxes(app)) { _rafId = requestAnimationFrame(_tick); return; }
      _buildRealIndex(app);
      _engaged = true; _lastCamSig = null;
      console.log('§DLOD_NAV_ENGAGE bld=' + app.activeBuilding + ' elements=' + app.activeBuildingTotal);
    }
    // §ROOM_OCCL (§13): evaluated only when the console lever is on; the else-branch is a pure
    // var reset (fires once after a live flip back to false, restoring the shipped partition).
    if (_stats.roomOcclEnabled === true) _roomEval(app);
    else if (_roomActive || _roomCur !== null || _roomPendN) _roomReset();
    var fading = _stepFades(app);
    if (fading && app.markDirty) app.markDirty();
    var sig = _camSig(app);
    if (sig !== _lastCamSig) { _lastCamSig = sig; _scanPending = true; } // pose changed — (re)arm scan
    if (_scanPending) _evalChunk(app); // one chunk per frame until the pass completes
    _rafId = requestAnimationFrame(_tick);
  }

  // 2026-07-21 user ask: momentary status-bar confirmation on toggle (same convention as Fly's
  // "Fly stopped." — A.status.textContent). Auto-clears after 5s ONLY if nothing overwrote it.
  var _statusClearT = null;
  function _statusMsg(app, msg) {
    if (!app || !app.status) return;
    app.status.textContent = msg;
    if (_statusClearT) clearTimeout(_statusClearT);
    _statusClearT = setTimeout(function () {
      if (app.status.textContent === msg) app.status.textContent = '';
    }, 5000);
  }
  window.toggleDlodNav = function () {
    var app = A();
    if (!_pillOn) {
      if (!app || !(app.activeBuildingTotal > NAV_MIN_ELEMENTS)) {
        console.log('§DLOD_NAV_GATE elements=' + (app ? app.activeBuildingTotal : 0) + ' threshold=' + NAV_MIN_ELEMENTS + ' verdict=too-small');
        if (app && app.toast) app.toast('Nav LOD needs a large building (>50k elements)');
        return;
      }
      _pillOn = true; window._dlodNavOn = true;
      console.log('§DLOD_NAV_TOGGLE on=true');
      _statusMsg(app, 'Nav LOD ON — boxing far elements (o to turn off)');
      if (!_rafId) _rafId = requestAnimationFrame(_tick);
      // §DLOD_NAV_ROOMS: a >50k-element building crossing the nav-LOD gate is the same "about to
      // navigate seriously" signal Fly Tour already treats as "make sure rooms are fresh"
      // (tour.js's A._prepareGraphTour: A.loadNavigate() then A.ensureRooms()) — reuses that exact
      // call, not a fork. Deferred via requestIdleCallback (same idiom as effects.js's staffage
      // preload and navigate_find.js's ghost-shell build) rather than fired immediately: measured
      // live, loadNavigate()'s 10-script chain contends hard with an in-flight geometry-streaming
      // pipeline on exactly the large buildings this gate targets — firing it the instant 'o' is
      // pressed risks competing with the box-proxy's own frame budget for the one thing DLOD-nav
      // exists to protect. Idle-deferred, this only warms rooms up opportunistically once the main
      // thread is actually free, for whatever Find/Fly/Cinema feature runs next.
      if (app && app.loadNavigate) {
        var _warmRooms = function() {
          app.loadNavigate().then(function() {
            return app.ensureRooms ? app.ensureRooms({}) : null;
          }).then(function(res) {
            if (res) console.log('§DLOD_NAV_ROOMS status=' + res.status + ' source=' + (res.source || 'none') + ' rooms=' + (res.rooms != null ? res.rooms : '-'));
          }).catch(function(e) { console.warn('§DLOD_NAV_ROOMS_ERR ' + (e && e.message)); });
        };
        if (window.requestIdleCallback) window.requestIdleCallback(_warmRooms, { timeout: 8000 });
        else setTimeout(_warmRooms, 5000);
      }
    } else {
      _pillOn = false; window._dlodNavOn = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      if (_engaged) { _restoreAll(app, 'pill-off'); _engaged = false; }
      _disposeBoxes();
      console.log('§DLOD_NAV_TOGGLE on=false');
      _statusMsg(app, 'Nav LOD OFF — full detail restored');
    }
    if (app && app.markDirty) app.markDirty();
  };

  // W-DLOD-NAV-PROXY: recompute the wanted partition from scratch, compare to applied state.
  // Elements mid-fade count as their target state (state is set at fade START by design).
  window.__dlodNavAudit = function () {
    var app = A();
    if (!_engaged || !_boxIndex) return { engaged: false, mismatch: -1 };
    _psm.multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_psm);
    var camPos = app.camera.position, mismatch = 0, boxed = 0, real = 0, roomOnly = 0;
    for (var guid in _boxIndex) {
      var e = _boxIndex[guid];
      var want = _wantedReal(e, camPos);
      if (want !== (e.state === 'real')) mismatch++;
      if (e.state === 'box') boxed++; else real++;
      // §ROOM_OCCL (W-ROOM-OCCL-PROXY support): boxed PURELY because of room mismatch — i.e.
      // within promote distance and in-frustum, so distance/frustum alone would have it real.
      if (e.state === 'box' && _roomActive && e.room !== undefined && e.room !== _roomCur) {
        if (camPos.distanceToSquared(e.pos) <= PROMOTE_SQ) {
          _sphere.center.copy(e.pos); _sphere.radius = e.radius;
          if (_frustum.intersectsSphere(_sphere)) roomOnly++;
        }
      }
    }
    var res = { engaged: true, mismatch: mismatch, real: real, boxed: boxed, fades: _fades.length, snaps: _stats.snaps,
      roomOccl: { enabled: _stats.roomOcclEnabled === true, active: _roomActive, room: _roomCur,
        legActive: _stats.roomLeg, roomOnlyBoxed: roomOnly } };
    console.log('§DLOD_NAV_AUDIT mismatch=' + mismatch + ' real=' + real + ' boxed=' + boxed + ' fades=' + _fades.length +
      (_stats.roomOcclEnabled === true ? ' §ROOM_OCCL_AUDIT active=' + _roomActive + ' room=' + (_roomCur || 'none') + ' roomOnlyBoxed=' + roomOnly : ''));
    return res;
  };

  console.log('§DLOD_NAV_READY pill=off engaged=false');
})();
