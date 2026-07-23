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
// membership-stability gate; interior legs only. window.__dlodNav.roomOcclEnabled — DEFAULT
// TRUE as of §18/§19 (2026-07-23): PROMOTE/DEMOTE tightened (below) on the condition the camera's
// own current room stays solid regardless of distance, which needs this criterion always live, not
// console-only. Flip to false for the old §9-only distance/frustum behavior.
// §ROOM_OCCL step 2 (portal/PVS) — Implementing FLY_TOUR_DLOD_SCALE.md §16 — Witnesses:
// W-PVS-EQUIV, W-PVS-CORRECT, W-PVS-STABILITY, W-PVS-PERF. window.__dlodNav.pvsEnabled (default
// false) REPLACES the plain room-equality mismatch test with room-graph-derived visible-room-set
// membership (common/room_graph.js's buildRoomPVS) when true; false ⇒ behavior identical to the
// shipped §13 mechanism (this flag is a pure superset gated behind its OWN lever, never implied by
// roomOcclEnabled alone — §13's own EQUIV/PROXY/STABILITY witnesses stay valid unchanged).
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
  // §19 (2026-07-23, user: "tightening distances OK as long as in-room remain solid" — §18
  // measured ~4.5→~8.4fps mean at the §8 band, full-ghost ceiling ~13.4fps): tightened from
  // 50/80 now that _wantedReal has a same-room-as-camera bypass (below) protecting whatever room
  // the camera is actually in from distance demotion regardless of these numbers.
  var PROMOTE_DIST = 38, DEMOTE_DIST = 60;
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
  // §20 (2026-07-24) adaptive mesh-budget distance boost. Real sweep on LTU_AHouse (RTX 4060,
  // headless hardware-GL, witness/w_budget_perf.log — real frame_ms at a fixed aerial pose with
  // forceBoost pinned across 11 values, active count 46→43,422): the ~16.6-16.7ms fully-boxed
  // floor (matches §10's 17.3ms) holds flat through ~3,700 active, is still only +9% at 7,795
  // (18.1ms), but is ALREADY +33% by 11,094 (22.2ms) and +65% by 15,616 (27.5ms) — the real knee
  // sits around 10-12k active, notably EARLIER than the 20k figure floated in conversation
  // (§20.2's own warning, confirmed: that figure was not measured). Watermarks placed with
  // margin on both sides of the real knee, not at its edge:
  var BUDGET_LOW = 6000;           // comfortably below the +9%-at-7,795 point — genuine headroom
  var BUDGET_HIGH = 12000;         // just past the +33% mark, before the steeper +65%/+90% climb
                                    // at 15,616/20,001 — decrements before the expensive zone
  var BUDGET_STEP = 2;             // meters per eval cycle (150ms throttle) — slow ramp, no pop;
                                    // ≈500-750 active elements/meter in the transition zone per
                                    // the sweep, so one step moves the count by roughly 1,000-1,500
  var MAX_BOOST = 60;              // meters (PROMOTE 38→98, DEMOTE 60→120 at full boost) — the
                                    // sweep's own boost=60 point (active=20,001, 31.6ms, ~1.9x
                                    // floor) is where BUDGET_HIGH's decrement would already be
                                    // firing; capped here as a sanity ceiling, not the primary
                                    // safety valve (BUDGET_HIGH's count-based decrement is)
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
  // §20 (2026-07-24) — persisted closed-loop distance-boost state. At 0 (shipped default, and
  // whenever budgetBoostEnabled is false) PROMOTE_DIST/DEMOTE_DIST are used completely unmodified
  // — byte-identical to §19 (W-BUDGET-EQUIV). forceBoost, when non-null, pins _budgetBoost for
  // witness use (sweep/delta) and disables the controller's own ramp/decay that cycle.
  var _budgetBoost = 0;
  var _appliedBoost = 0;           // effective boost baked into the CURRENT partition (change ⇒ rearm scan)
  var _lastBudgetT = 0;            // periodic-tick throttle clock (150ms — see _tick)
  var _passPromoteSq = 0, _passDemoteSq = 0; // effective thresholds, frozen per-pass (see _evalChunk)
  var _passBoostVal = 0;           // the boost value the CURRENTLY-COMPLETING pass was frozen at
  // §ROOM_OCCL state (§13) — live by default since §19; inert only if roomOcclEnabled is set false
  var _roomIdx = null, _roomIdxBld = null, _roomIdxTriedT = 0, _roomStampRef = null;
  var _roomCur = null, _roomPend, _roomPendN = 0, _roomActive = false, _roomEvals = 0;
  // §ROOM_OCCL step 2 (§16) — portal/PVS state, ALL inert unless _stats.pvsEnabled is flipped true
  var _pvs = null, _pvsBld = null, _pvsTriedT = 0;
  var _stats = { mutations: 0, active: 0, boxed: 0, fades: 0, snaps: 0, evalMs: 0,
    // §19: default TRUE — see file-header note. Still live-flippable from the console
    // (window.__dlodNav.roomOcclEnabled = false) to fall back to plain distance/frustum.
    roomOcclEnabled: true, roomCur: null, roomLeg: false, roomEvals: 0, roomChanges: 0,
    roomIdxRects: 0, roomIdxStamped: 0,
    // §16 step-2 testing lever: same convention — console-only (window.__dlodNav.pvsEnabled =
    // true), independent of roomOcclEnabled's own default; false ⇒ §13's exact shipped behavior.
    pvsEnabled: false, pvsRooms: 0, pvsAvgVisible: 0,
    // §20 (2026-07-24) — console-only lever, same convention: false ⇒ §19's exact shipped
    // PROMOTE_DIST/DEMOTE_DIST behavior, byte-identical (W-BUDGET-EQUIV). forceBoost (null =
    // controller-driven) lets a witness pin the effective boost directly for a sweep/delta
    // measurement without waiting for the ramp to converge.
    budgetBoostEnabled: true, budgetBoost: 0, forceBoost: null };
  window.__dlodNav = _stats;

  // §20 — effective boost this pass: forceBoost (witness pin) wins outright; otherwise the
  // controller's own ramped value when enabled; 0 (shipped) when disabled.
  function _effBoost() {
    if (_stats.forceBoost !== null && _stats.forceBoost !== undefined) return _stats.forceBoost;
    if (_stats.budgetBoostEnabled !== true) return 0;
    return _budgetBoost;
  }

  // §20 closed-loop controller — called on the periodic 150ms budget-tick (below), driven off
  // the LAST PUBLISHED active count (_stats.active, from the most recently completed scan pass —
  // reads the same field §18/§19 already log, no new counting). Returns the resulting effective
  // boost. A forced boost (witness pin) short-circuits the ramp entirely — ramp state (_budgetBoost)
  // itself does not move while pinned, so releasing the pin resumes from wherever it was, not 0.
  function _budgetControl() {
    if (_stats.forceBoost !== null && _stats.forceBoost !== undefined) { _stats.budgetBoost = _stats.forceBoost; return _stats.forceBoost; }
    if (_stats.budgetBoostEnabled !== true) { _budgetBoost = 0; _stats.budgetBoost = 0; return 0; }
    if (_stats.active < BUDGET_LOW) _budgetBoost = Math.min(MAX_BOOST, _budgetBoost + BUDGET_STEP);
    else if (_stats.active > BUDGET_HIGH) _budgetBoost = Math.max(0, _budgetBoost - BUDGET_STEP);
    // between watermarks: hold steady, no assignment — this dead band IS the hysteresis
    _stats.budgetBoost = _budgetBoost;
    return _budgetBoost;
  }

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

  // §16 — lazy, building-keyed room-to-room PVS. Only ever called when pvsEnabled; reuses the
  // SAME cached graph navigate_find.js's Find panel / room-path routing already builds
  // (app.getRoomGraph()), never a second graph build (FLY_TOUR_CORRIDOR_GRAPH.md R2's "one cache"
  // rule). Retry-throttled like _roomIdxEnsure — the graph may not exist yet the instant the
  // console flag is flipped (loadNavigate()'s chain is async, §DLOD_NAV_ROOMS idle-defers it).
  function _pvsEnsure(app) {
    if (_pvs && _pvsBld === app.activeBuilding) return true;
    var now = performance.now();
    if (now - _pvsTriedT < 3000) return false;
    _pvsTriedT = now;
    if (!app.getRoomGraph || !window.RoomGraph || !window.RoomGraph.buildRoomPVS) return false;
    var graph;
    try { graph = app.getRoomGraph(); } catch (eG) { console.log('§ROOM_PVS_ERR graph ' + eG.message); return false; }
    if (!graph || !graph.edges || !graph.edges.length) {
      console.log('§ROOM_PVS graph not ready (edges=0) — will retry'); return false;
    }
    var t0 = performance.now(), pvs;
    try { pvs = window.RoomGraph.buildRoomPVS(graph, { maxDoorCrossings: 1 }); }
    catch (eB) { console.log('§ROOM_PVS_ERR build ' + eB.message); return false; }
    _pvs = pvs; _pvsBld = app.activeBuilding;
    var roomKeys = Object.keys(pvs), totalVis = 0;
    roomKeys.forEach(function (k) { totalVis += Object.keys(pvs[k]).length; });
    _stats.pvsRooms = roomKeys.length;
    _stats.pvsAvgVisible = roomKeys.length ? +(totalVis / roomKeys.length).toFixed(1) : 0;
    console.log('§ROOM_PVS_BUILD bld=' + app.activeBuilding + ' rooms=' + roomKeys.length +
      ' avgVisible=' + _stats.pvsAvgVisible + ' ms=' + (performance.now() - t0).toFixed(0));
    return true;
  }

  // §16 — room-mismatch test, shared by _wantedReal and __dlodNavAudit so both always agree.
  // pvsEnabled=false (default) ⇒ IDENTICAL to §13's shipped equality test, byte-for-byte — the
  // PVS set (when built) always contains the room itself, so pvsEnabled=true is a pure superset
  // of "same room", never a stricter test.
  function _roomMismatch(e) {
    if (!_roomActive || e.room === undefined) return false;
    if (_stats.pvsEnabled === true && _pvs && _pvs[_roomCur]) return !_pvs[_roomCur][e.room];
    return e.room !== _roomCur;
  }

  // Per-frame current-room eval (same rAF loop as everything else — no second timer, §13). The
  // stability window is counted in FRAMES per §11.2 Q4's measurement; a room ACCEPTANCE re-arms
  // the chunked scan so the partition updates even when the camera pose itself is unchanged
  // (e.g. stability maturing while hovering). The point-in-rect test is one camera point vs the
  // compiled rect rows on ONE floor — trivial next to the element scan (§11.2 Q2).
  function _roomEval(app) {
    if (!_roomIdxEnsure(app)) { _roomReset(); return; }
    // §16: best-effort, never blocks the §13 path — until the PVS is ready, _roomMismatch()
    // degrades to the plain equality test (§13's shipped behavior), never a crash or a stall.
    if (_stats.pvsEnabled === true) _pvsEnsure(app);
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
  // §20: promoteSq/demoteSq are passed in (effective PROMOTE_DIST/DEMOTE_DIST + boost, squared,
  // precomputed ONCE per pass by the caller) rather than read as fixed module constants — at
  // boost=0 these equal PROMOTE_SQ/DEMOTE_SQ exactly, so this is a pure generalization, not a
  // behavior change on the boost=0 path (W-BUDGET-EQUIV).
  function _wantedReal(e, camPos, promoteSq, demoteSq) {
    var d2 = camPos.distanceToSquared(e.pos);
    // §13/§16 room-mismatch: THIRD OR'd demote criterion (promote = inverse AND-of-NOTs). Only
    // bites when roomOcclEnabled+interior-leg+camera-in-a-room (_roomActive) AND the element has a
    // compiled containment row (e.room). false ⇒ short-circuits to the shipped decision rule.
    var roomMis = _roomMismatch(e);
    // §19: element is contained in the room the camera is CURRENTLY in — exempt from the distance
    // gate entirely (frustum/hysteresis still applies below). Without this, tightening
    // PROMOTE/DEMOTE for far-field aggression would also box out the room the user is standing in.
    var sameRoom = _roomActive && e.room !== undefined && e.room === _roomCur;
    if (e.state === 'real') {
      // demote only when clearly out: >60m (+boost) OR sphere+5m margin outside frustum OR room
      // mismatch (distance skipped entirely when sameRoom — see §19 above)
      if (!sameRoom && d2 > demoteSq) return false;
      if (roomMis) return false;
      _sphere.center.copy(e.pos); _sphere.radius = e.radius + FRUSTUM_MARGIN;
      return _frustum.intersectsSphere(_sphere);
    }
    // promote only when clearly in: ≤38m (+boost) AND exact frustum AND (room matches or inert)
    if (!sameRoom && d2 > promoteSq) return false;
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
    // §20: effective thresholds frozen at PASS START (_evalCursor===0), not recomputed every
    // chunk-tick — the periodic 150ms budget-tick (in _tick) can fire mid-pass (a pass takes
    // ~8 chunk-ticks to cover 122k elements, close to the same 150ms cadence), and letting the
    // threshold drift mid-pass left early-chunk elements evaluated under an older boost than
    // late-chunk elements in the SAME pass — a smear that never got a follow-up clean pass to
    // reconcile once the ramp stopped (found via W-BUDGET-DELTA: mismatch stuck at 804 after 20s
    // with boost visibly steady). Freezing per-pass fixes it: at boost=0 this is still exactly
    // PROMOTE_SQ/DEMOTE_SQ every pass (W-BUDGET-EQUIV unaffected).
    if (_evalCursor === 0) {
      _passBoostVal = _effBoost();
      _passPromoteSq = _passBoostVal ? (PROMOTE_DIST + _passBoostVal) * (PROMOTE_DIST + _passBoostVal) : PROMOTE_SQ;
      _passDemoteSq = _passBoostVal ? (DEMOTE_DIST + _passBoostVal) * (DEMOTE_DIST + _passBoostVal) : DEMOTE_SQ;
    }
    var promoteSq = _passPromoteSq, demoteSq = _passDemoteSq;
    var end = Math.min(_evalCursor + EVAL_CHUNK, _guidArr.length);
    var started = 0;
    for (var i = _evalCursor; i < end; i++) {
      var guid = _guidArr[i], e = _boxIndex[guid];
      var want = _wantedReal(e, camPos, promoteSq, demoteSq);
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
      // §20: if the boost moved on (periodic tick fired) WHILE this pass was still mid-flight —
      // a real race, a pass takes ~8 chunk-ticks (~130ms) at close to the same 150ms cadence the
      // boost can change on — this pass was frozen at a now-stale value (_passBoostVal). Clearing
      // _scanPending here would silently strand the partition at that stale value forever (no
      // camera/room change left to re-arm it) — found via W-BUDGET-DELTA (mismatch stuck at
      // 1000+ indefinitely after boost visibly stopped changing). Instead, leave _scanPending
      // true so a fresh pass starts IMMEDIATELY under the current boost — at most one extra pass,
      // and only while boost is still actively moving; a converged/steady boost never re-triggers.
      _scanPending = (_passBoostVal !== _effBoost());
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

  // §FPS_MODE finding (2026-07-23): the old _restoreAll was a single synchronous loop over the
  // whole box index — measured 2.5-3.6s frame_ms spike on LTU_AHouse (122k) on every disengage,
  // worse than the cold-engage burst it mirrors. Chunked the same way _evalChunk already is
  // (EVAL_CHUNK per rAF tick). _restoreFlush lets a re-engage force-finish a still-draining
  // restore synchronously first, so _buildBoxes never races a stale in-flight drain — bounded to
  // "whatever's left undone" rather than always the full 122k.
  var _restoreFlush = null;
  function _restoreAllNow(app, reason, onDone) {
    _roomReset(); // §ROOM_OCCL: disengage clears current-room state (index stays, building-keyed)
    _cancelFadesSnap(app);
    var idx = _boxIndex, ridx = _realIndex;
    var guids = idx ? Object.keys(idx) : [];
    var i = 0;
    function runTo(end) {
      for (; i < end; i++) {
        var guid = guids[i], e = idx[guid];
        if (e.state === 'box') {
          var r = ridx && ridx[guid];
          _setBoxInstance(e, false);
          if (r) _showReal(r);
          e.state = 'real';
        }
      }
    }
    function finish() {
      runTo(guids.length); // no-op if step() already finished the loop
      _restoreFlush = null;
      // Belt-and-braces: if a filter turned on while we were engaged, reassert it after restore
      if (app.activeGuidFilter && app.filterByGuids) app.filterByGuids(app.activeGuidFilter);
      else if ((app.activeStoreyFilter !== null && app.activeStoreyFilter !== undefined) && app.filterStorey) app.filterStorey(app.activeStoreyFilter);
      if (app.markDirty) app.markDirty();
      console.log('§DLOD_NAV_DISENGAGE reason=' + reason + ' mutations=' + _stats.mutations);
      if (onDone) onDone();
    }
    function step() {
      runTo(Math.min(i + EVAL_CHUNK, guids.length));
      if (i < guids.length) requestAnimationFrame(step);
      else finish();
    }
    _restoreFlush = finish;
    step();
  }

  function _tick() {
    _rafId = null;
    if (!_pillOn) return; // pill off mid-flight — _toggleOff already restored
    var app = A();
    var block = _gateBlockReason(app);
    if (block) {
      if (_engaged) { _engaged = false; window._dlodNavEngaged = false; _lastCamSig = null; _restoreAllNow(app, block); }
      _rafId = requestAnimationFrame(_tick); // stay alive; re-engage when the gate clears
      return;
    }
    if (!_engaged) {
      if (_restoreFlush) _restoreFlush(); // finish any still-draining restore before rebuilding the index
      if (!_buildBoxes(app)) { _rafId = requestAnimationFrame(_tick); return; }
      _buildRealIndex(app);
      _engaged = true; window._dlodNavEngaged = true; _lastCamSig = null;
      // §20: fresh engage starts the boost ramp at 0 (never carries a stale value across a
      // disengage/re-engage cycle — same discipline as _lastCamSig reset above).
      _budgetBoost = 0; _stats.budgetBoost = 0; _appliedBoost = 0; _lastBudgetT = 0;
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
    // §20: periodic 150ms budget-tick, INDEPENDENT of camera movement — this is the one new
    // periodic driver this feature adds (everything else in this file only re-evaluates on pose
    // change). Reads the last-published _stats.active (guarded until a pass has actually
    // completed at least once, so the cold-engage active=0 burst can't be misread as "empty,
    // ramp up"). Only re-arms a scan pass when the effective boost actually CHANGED — a converged,
    // steady boost costs nothing extra per frame beyond this one cheap comparison (self-limiting,
    // §20.1's own design goal: near-zero overhead once settled, whether settled at 0 or at max).
    if (_stats.budgetBoostEnabled === true || (_stats.forceBoost !== null && _stats.forceBoost !== undefined)) {
      var nowB = performance.now();
      if (nowB - _lastBudgetT >= 150) {
        _lastBudgetT = nowB;
        if ((_stats.active + _stats.boxed) > 0) {
          var newBoost = _budgetControl();
          if (newBoost !== _appliedBoost) {
            _appliedBoost = newBoost;
            _scanPending = true; // partition must be recomputed under the new effective distance
            console.log('§DLOD_NAV_BUDGET boost=' + newBoost + ' active=' + _stats.active + ' boxed=' + _stats.boxed);
          }
        }
      }
    }
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
      // §DLOD_NAV_TOGGLE_BLOCKED: toggling on while a gate condition already holds (e.g. bbox/ghost
      // mode's filterByGuids(new Set()) leaves activeGuidFilter truthy) used to log on=true and stay
      // silently disengaged — no ENGAGE line, no toast, no way to tell it did nothing. Surface it now;
      // _tick still auto-engages once the block clears, this is feedback-only, no behavior change.
      var _armBlock = _gateBlockReason(app);
      if (_armBlock) {
        console.log('§DLOD_NAV_TOGGLE on=true blocked=' + _armBlock);
        _statusMsg(app, 'Nav LOD armed but blocked (' + _armBlock + ') — will engage once cleared');
      } else {
        console.log('§DLOD_NAV_TOGGLE on=true');
        _statusMsg(app, 'Nav LOD ON — boxing far elements (o to turn off)');
      }
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
      console.log('§DLOD_NAV_TOGGLE on=false');
      _statusMsg(app, 'Nav LOD OFF — full detail restored');
      if (_engaged) {
        _engaged = false; window._dlodNavEngaged = false;
        _restoreAllNow(app, 'pill-off', _disposeBoxes); // dispose only once the chunked drain finishes
      } else {
        _disposeBoxes();
      }
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
    // §20: same effective-threshold generalization as _evalChunk — at boost=0 (or the mechanism
    // disabled) this is PROMOTE_SQ/DEMOTE_SQ exactly, so the audit still agrees with a boost=0
    // partition byte-for-byte (W-BUDGET-EQUIV covers this path too).
    var _boost = _effBoost();
    var _promoteSq = _boost ? (PROMOTE_DIST + _boost) * (PROMOTE_DIST + _boost) : PROMOTE_SQ;
    var _demoteSq = _boost ? (DEMOTE_DIST + _boost) * (DEMOTE_DIST + _boost) : DEMOTE_SQ;
    for (var guid in _boxIndex) {
      var e = _boxIndex[guid];
      var want = _wantedReal(e, camPos, _promoteSq, _demoteSq);
      if (want !== (e.state === 'real')) mismatch++;
      if (e.state === 'box') boxed++; else real++;
      // §ROOM_OCCL/§16 (W-ROOM-OCCL-PROXY / W-PVS-CORRECT support): boxed PURELY because of room
      // mismatch (equality OR PVS-membership, whichever _roomMismatch is currently using) — i.e.
      // within promote distance and in-frustum, so distance/frustum alone would have it real.
      if (e.state === 'box' && _roomMismatch(e)) {
        if (camPos.distanceToSquared(e.pos) <= PROMOTE_SQ) {
          _sphere.center.copy(e.pos); _sphere.radius = e.radius;
          if (_frustum.intersectsSphere(_sphere)) roomOnly++;
        }
      }
    }
    var res = { engaged: true, mismatch: mismatch, real: real, boxed: boxed, fades: _fades.length, snaps: _stats.snaps,
      budget: { enabled: _stats.budgetBoostEnabled === true, boost: _boost,
        promoteDist: PROMOTE_DIST + _boost, demoteDist: DEMOTE_DIST + _boost },
      roomOccl: { enabled: _stats.roomOcclEnabled === true, active: _roomActive, room: _roomCur,
        legActive: _stats.roomLeg, roomOnlyBoxed: roomOnly,
        pvsEnabled: _stats.pvsEnabled === true, pvsRooms: _stats.pvsRooms, pvsAvgVisible: _stats.pvsAvgVisible } };
    console.log('§DLOD_NAV_AUDIT mismatch=' + mismatch + ' real=' + real + ' boxed=' + boxed + ' fades=' + _fades.length +
      (_stats.roomOcclEnabled === true ? ' §ROOM_OCCL_AUDIT active=' + _roomActive + ' room=' + (_roomCur || 'none') + ' roomOnlyBoxed=' + roomOnly : '') +
      (_stats.pvsEnabled === true ? ' §PVS_AUDIT rooms=' + _stats.pvsRooms + ' avgVisible=' + _stats.pvsAvgVisible : ''));
    return res;
  };

  console.log('§DLOD_NAV_READY pill=off engaged=false');
})();
