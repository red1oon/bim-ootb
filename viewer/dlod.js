/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * dlod.js — §6.8 Per-slot/instance Frustum DLOD (Dynamic Level of Detail)
 * §S274: Per-slot setVisibleAt on BatchedMesh + zero-scale on InstancedMesh.
 * Both mesh types hidden outside frustum → GPU skips their triangles entirely.
 * Terminal 48K (80% IM): now culls all element types.
 * Hospital 63K (64% IM): full coverage.
 */
function setupDLOD(A) {
  // ── State ──
  A._dlodEnabled = false;
  A._dlodFrame = 0;
  A._dlodPaused = false;     // true = cooperate with time machine (skip TM-hidden meshes)

  var EVAL_EVERY = 6;             // frames between evaluations
  var MIN_ELEMENTS = 5000;        // §S271: frustum culling for all non-trivial buildings
  var _tmGateLogged = false;      // §DLOD_TM_OWNERSHIP — one line per gate episode
  var _frustum = new THREE.Frustum();
  // §CPE_DLOD_VF_UNION (2026-08-05, CINEMA_PATH_EDITOR.md OPEN 4) — this culler zero-scales
  // InstancedMesh instances GLOBALLY (both cameras share the same real geometry, this is not a
  // per-camera visibility flag), but was built keyed to A.camera (the main camera) exclusively —
  // predates B/vfCam entirely. During a POV-only rehearsal (§CPE_SCRUB_POV_ONLY) the main camera is
  // PARKED at the overview pose for the whole flight while vfCam walks through the building, so
  // anything the walk passes near that's outside the parked main frustum gets zeroed here — invisible
  // to B's render too, looking exactly like "buildup not reflected in POV" even though Time Machine's
  // own visibility flags are correct (confirmed separately, see time_machine.js §DLOD_VF_CAMGUARD).
  // Fix: while B is on, an instance is only hidden if it's outside BOTH frustums (union), not just
  // the main camera's — same `activePOVCamera()` accessor time_machine.js's own §DLOD_VF_CAMGUARD
  // already established, no new coupling.
  var _frustumVF = new THREE.Frustum();
  var _projScreenMatrixVF = new THREE.Matrix4();
  var _projScreenMatrix = new THREE.Matrix4();
  var _sphere = new THREE.Sphere();
  var _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
  var _lastCamX = 0, _lastCamY = 0, _lastCamZ = 0;  // §S260b: skip tick when camera idle
  var _lastTargX = 0, _lastTargY = 0, _lastTargZ = 0;
  var _lastVfX = 0, _lastVfY = 0, _lastVfZ = 0;  // §CPE_DLOD_VF_UNION: vfCam's own idle check —
  // main camera can be PARKED (POV-only rehearsal) while vfCam alone is moving; without this the
  // §S260b skip above would never re-evaluate at all during that flight.
  // §DLOD_TICK whitebox (2026-07-23): testing whether this always-on, UNCHUNKED per-slot culler
  // (full instancedMatrix re-upload on any flip — see §S274 comment below) is the source of
  // bbox-mode's fly > orbit lag reported after nav-DLOD (dlod_nav.js, separate module) was ruled
  // out — bbox mode gates dlod_nav off entirely but this tick still runs unconditionally.
  var _tickN = 0, _tickMs = 0, _tickFlips = 0, _tickLastLogT = 0;

  // ── §S274: Direct refs built once after streaming ──
  var _instancedMeshes = []; // [{obj, meta}, ...] — IM only, BM handled by r160 native
  var _refsBuilt = false;
  var _totalIMInstances = 0;

  function _buildRefs() {
    if (_refsBuilt) return;
    _refsBuilt = true;
    _batchedMeshes = [];
    _instancedMeshes = [];
    _totalBMSlots = 0;
    _totalIMInstances = 0;

    var _m4 = new THREE.Matrix4();
    var _pos = new THREE.Vector3();

    A.scene.traverse(function(obj) {
      // BatchedMesh: Three.js r160 perObjectFrustumCulled handles natively — no indexing needed.

      // ── InstancedMesh: extract world position per instance (desktop only) ──
      // §S274: On mobile, skip IM indexing entirely — saves 35K Matrix4 allocations
      if (!A._isMobile && obj.isInstancedMesh && A._instanceMeta[obj.id]) {
        var meta = A._instanceMeta[obj.id];
        for (var i = 0; i < meta.length; i++) {
          var m = meta[i];
          try {
            obj.getMatrixAt(m.instanceIndex, _m4);
            _pos.setFromMatrixPosition(_m4);
            m._wx = _pos.x;
            m._wy = _pos.y;
            m._wz = _pos.z;
            var bx = m.bx || 0.3, by = m.by || 0.3, bz = m.bz || 0.3;
            m._radius = Math.sqrt(bx * bx + by * by + bz * bz) * 0.5;
            m._origMatrix = new THREE.Matrix4().copy(_m4);
          } catch(e) {
            m._wx = 0; m._wy = 0; m._wz = 0; m._radius = 5.0;
            m._origMatrix = null;
          }
        }
        _instancedMeshes.push({ obj: obj, meta: meta });
        _totalIMInstances += meta.length;
      }
    });

    console.log('[DLOD] §DLOD_REFS built instanced=' + _instancedMeshes.length +
      ' imInstances=' + _totalIMInstances +
      ' (BM handled by r184 perObjectFrustumCulled)');
  }

  // ── Enable/disable ──
  A.dlodEnable = function() {
    // §DLOD_TM_OWNERSHIP (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.8): while
    // the Time Machine owns instance matrices this module must not — refs captured after TM has
    // zero-scaled the unplaced instances are zero, and every later "restore" writes zero back
    // (measured: 24,992 instances lost at frame 718 of the first Hospital CLI silent bake, never
    // recovered to Day 310/310). TM's deactivate() re-enables this module.
    if (A._tmOn) {
      console.log('[DLOD] §DLOD_SKIP_TM count=' + A.streamedCount + ' — Time Machine owns instance matrices; re-enabled when it closes');
      return;
    }
    if (A.streamedCount < MIN_ELEMENTS) {
      console.log('[DLOD] §DLOD_SKIP count=' + A.streamedCount + ' < ' + MIN_ELEMENTS);
      return;
    }
    // §S274: On mobile, Three.js r160 perObjectFrustumCulled handles BatchedMesh natively.
    // InstancedMesh zero-scale is too expensive (buffer re-upload). Skip DLOD entirely.
    if (A._isMobile) {
      console.log('[DLOD] §DLOD_SKIP_MOBILE count=' + A.streamedCount + ' — r160 perObjectFrustumCulled handles BM natively');
      return;
    }
    A._dlodEnabled = true;
    A._dlodFrame = EVAL_EVERY - 1;
    _refsBuilt = false;
    console.log('[DLOD] §DLOD_ENABLE count=' + A.streamedCount + ' mode=per_slot_frustum');
  };

  A.dlodDisable = function(reason) {
    if (!A._dlodEnabled) return;
    A._dlodEnabled = false;
    _restoreAll();
    console.log('[DLOD] §DLOD_DISABLE reason=' + (reason || 'unknown'));
  };

  A.dlodDemoteAll = function() {
    _restoreAll();
  };

  // ── Main tick — called from animate loop ──
  A.dlodTick = function() {
    if (!A._dlodEnabled) return;
    if (A._tmOn) {   // §DLOD_TM_OWNERSHIP — a re-enable that slipped past dlodEnable's guard must still not touch matrices
      if (!_tmGateLogged) { _tmGateLogged = true; console.log('[DLOD] §DLOD_TM_GATED tick refused — Time Machine owns instance matrices'); }
      return;
    }
    _tmGateLogged = false;
    A._dlodFrame++;
    if (A._dlodFrame % EVAL_EVERY !== 0) return;

    // §CPE_DLOD_VF_UNION: resolve B's POV camera the SAME way time_machine.js's own
    // §DLOD_VF_CAMGUARD already does — no new coupling, just reused.
    var _cpe = A.cinemaPathEditor;
    var vfCam = (_cpe && _cpe.activePOVCamera) ? _cpe.activePOVCamera() : null;

    // §S260b: Skip when NEITHER camera has moved (vfCam included — see _lastVfX above).
    var cp = A.camera.position, ct = A.controls ? A.controls.target : cp;
    var vfp = vfCam ? vfCam.position : null;
    var camIdle = Math.abs(cp.x - _lastCamX) < 0.01 && Math.abs(cp.y - _lastCamY) < 0.01 &&
        Math.abs(cp.z - _lastCamZ) < 0.01 && Math.abs(ct.x - _lastTargX) < 0.01 &&
        Math.abs(ct.y - _lastTargY) < 0.01 && Math.abs(ct.z - _lastTargZ) < 0.01;
    var vfIdle = !vfp || (Math.abs(vfp.x - _lastVfX) < 0.01 && Math.abs(vfp.y - _lastVfY) < 0.01 &&
        Math.abs(vfp.z - _lastVfZ) < 0.01);
    if (camIdle && vfIdle) return;
    _lastCamX = cp.x; _lastCamY = cp.y; _lastCamZ = cp.z;
    _lastTargX = ct.x; _lastTargY = ct.y; _lastTargZ = ct.z;
    if (vfp) { _lastVfX = vfp.x; _lastVfY = vfp.y; _lastVfZ = vfp.z; }

    _buildRefs();
    var t0 = performance.now();

    A.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    if (vfCam) {
      vfCam.updateMatrixWorld();
      _projScreenMatrixVF.multiplyMatrices(vfCam.projectionMatrix, vfCam.matrixWorldInverse);
      _frustumVF.setFromProjectionMatrix(_projScreenMatrixVF);
    }

    var imVis = 0, imHid = 0, skipCount = 0;
    var hiddenDiscs = A.hiddenDiscs;

    // ── BatchedMesh: Three.js r160 perObjectFrustumCulled handles per-slot frustum natively.
    // No JS tick needed — renderer.render() does it at zero cost. ──

    // ── InstancedMesh: per-instance zero-scale (desktop only) ──
    // §S274: On mobile, instanceMatrix.needsUpdate re-uploads entire buffer to GPU per tick.
    // Cost exceeds savings. BatchedMesh setVisibleAt is cheap (indirect draw flag only).
    var flips = 0; // §DLOD_TICK whitebox
    if (A._isMobile) { /* skip IM culling on mobile */ }
    else for (var ii = 0; ii < _instancedMeshes.length; ii++) {
      var im = _instancedMeshes[ii];
      var obj = im.obj;
      if (!obj.parent) continue;

      var meta = im.meta;
      var changed = false;

      for (var i = 0; i < meta.length; i++) {
        var m = meta[i];

        if (!A._storeyVisible(m.storey)) { skipCount++; continue; }
        if (hiddenDiscs && hiddenDiscs.size > 0 &&
            hiddenDiscs.has(m.disc)) { skipCount++; continue; }
        if (A._dlodPaused && m._dlodHid) { skipCount++; continue; }
        if (!m._origMatrix) { skipCount++; continue; }

        _sphere.center.set(m._wx, m._wy, m._wz);
        _sphere.radius = m._radius;

        // §CPE_DLOD_VF_UNION: hidden only if outside BOTH the main camera's frustum AND (when B is
        // on) vfCam's — an instance visible to either camera must survive, since this culling is
        // global (zero-scale), not per-camera.
        if (!_frustum.intersectsSphere(_sphere) && (!vfCam || !_frustumVF.intersectsSphere(_sphere))) {
          if (!m._dlodHid) {
            obj.setMatrixAt(m.instanceIndex, _zeroScale);
            m._dlodHid = true;
            changed = true;
            flips++;
          }
          imHid++;
        } else {
          if (m._dlodHid) {
            obj.setMatrixAt(m.instanceIndex, m._origMatrix);
            m._dlodHid = false;
            changed = true;
            flips++;
          }
          imVis++;
        }
      }

      // §DLOD_TICK partial-upload idea EXPLORED, NOT APPLIED (2026-07-24, FLY_TOUR_DLOD_SCALE.md):
      // instanceMatrix.addUpdateRange(idx*16,16) per flip would shrink this full-buffer re-upload
      // (confirmed via vendored three.js source: empty updateRanges = full bufferSubData) to just
      // the changed instances — real, verified win in isolation. NOT applied: helpers.js
      // (filterInstancedMesh — Find isolate/room-isolate/storey+discipline filters),
      // navigate_find.js, and time_machine.js's own DLOD ALL call setMatrixAt+needsUpdate on these
      // SAME InstancedMesh objects without ever calling addUpdateRange. If any of them mutate the
      // same mesh in the same frame as a dlod.js flip, a non-empty updateRanges (from this file
      // alone) would make the renderer upload ONLY dlod.js's ranges — silently dropping the other
      // caller's change for that frame. Before this exploration, every plain needsUpdate=true
      // always forced a full upload, so no caller could ever starve another's write; partial
      // ranges break that safety net for everyone else unless every setMatrixAt caller on shared
      // buffers adopts the same convention. That's real cross-file work, not a dlod.js-only fix —
      // exactly the kind of thing the DLOD consolidation (dlod.js/dlod_nav.js/time_machine.js DLOD/
      // Find's filter, unified) should settle once, not something to patch piecemeal per-caller.
      // Left as plain needsUpdate=true here, unchanged from before this session.
      if (changed) obj.instanceMatrix.needsUpdate = true;
    }

    // §DLOD_TICK whitebox — throttled ~2s like every other §-log in this codebase (dlod_nav.js's
    // own idiom). ms = this tick's own cost; flips = instances whose full-buffer re-upload fired.
    var _tms = performance.now() - t0;
    _tickN++; _tickMs += _tms; _tickFlips += flips;
    var _now = performance.now();
    if (_now - _tickLastLogT >= 2000) {
      console.log('§DLOD_TICK n=' + _tickN + ' ms_mean=' + (_tickMs / _tickN).toFixed(2) +
        ' ms_max=' + _tms.toFixed(2) + ' flips_mean=' + (_tickFlips / _tickN).toFixed(1) +
        ' fly=' + (A.flyActive ? 1 : 0) +
        ' vfCamActive=' + (vfCam ? 1 : 0) + ' imHid=' + imHid + ' imVis=' + imVis);
      _tickN = 0; _tickMs = 0; _tickFlips = 0; _tickLastLogT = _now;
    }

    if ((imHid > 0 || imVis > 0) && A.markDirty) A.markDirty();
  };

  // ── Restore all hidden elements ──
  function _restoreAll() {
    // InstancedMesh
    for (var ii = 0; ii < _instancedMeshes.length; ii++) {
      var im = _instancedMeshes[ii];
      var meta = im.meta;
      var changed = false;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i]._dlodHid && meta[i]._origMatrix) {
          im.obj.setMatrixAt(meta[i].instanceIndex, meta[i]._origMatrix);
          meta[i]._dlodHid = false;
          changed = true;
        }
      }
      if (changed) im.obj.instanceMatrix.needsUpdate = true;
    }
    console.log('[DLOD] §DLOD_RESTORE all visible');
  }
}
