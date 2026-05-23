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
  var _frustum = new THREE.Frustum();
  var _projScreenMatrix = new THREE.Matrix4();
  var _sphere = new THREE.Sphere();
  var _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
  var _lastCamX = 0, _lastCamY = 0, _lastCamZ = 0;  // §S260b: skip tick when camera idle
  var _lastTargX = 0, _lastTargY = 0, _lastTargZ = 0;

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
      ' (BM handled by r160 perObjectFrustumCulled)');
  }

  // ── Enable/disable ──
  A.dlodEnable = function() {
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
    A._dlodFrame++;
    if (A._dlodFrame % EVAL_EVERY !== 0) return;

    // §S260b: Skip when camera hasn't moved
    var cp = A.camera.position, ct = A.controls ? A.controls.target : cp;
    if (Math.abs(cp.x - _lastCamX) < 0.01 && Math.abs(cp.y - _lastCamY) < 0.01 &&
        Math.abs(cp.z - _lastCamZ) < 0.01 && Math.abs(ct.x - _lastTargX) < 0.01 &&
        Math.abs(ct.y - _lastTargY) < 0.01 && Math.abs(ct.z - _lastTargZ) < 0.01) {
      return;
    }
    _lastCamX = cp.x; _lastCamY = cp.y; _lastCamZ = cp.z;
    _lastTargX = ct.x; _lastTargY = ct.y; _lastTargZ = ct.z;

    _buildRefs();
    var t0 = performance.now();

    A.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    var imVis = 0, imHid = 0, skipCount = 0;
    var storeyFilter = A.activeStoreyFilter;
    var hiddenDiscs = A.hiddenDiscs;

    // ── BatchedMesh: Three.js r160 perObjectFrustumCulled handles per-slot frustum natively.
    // No JS tick needed — renderer.render() does it at zero cost. ──

    // ── InstancedMesh: per-instance zero-scale (desktop only) ──
    // §S274: On mobile, instanceMatrix.needsUpdate re-uploads entire buffer to GPU per tick.
    // Cost exceeds savings. BatchedMesh setVisibleAt is cheap (indirect draw flag only).
    if (A._isMobile) { /* skip IM culling on mobile */ }
    else for (var ii = 0; ii < _instancedMeshes.length; ii++) {
      var im = _instancedMeshes[ii];
      var obj = im.obj;
      if (!obj.parent) continue;

      var meta = im.meta;
      var changed = false;

      for (var i = 0; i < meta.length; i++) {
        var m = meta[i];

        if (storeyFilter !== null && storeyFilter !== undefined &&
            m.storey !== storeyFilter) { skipCount++; continue; }
        if (hiddenDiscs && hiddenDiscs.size > 0 &&
            hiddenDiscs.has(m.disc)) { skipCount++; continue; }
        if (A._dlodPaused && m._dlodHid) { skipCount++; continue; }
        if (!m._origMatrix) { skipCount++; continue; }

        _sphere.center.set(m._wx, m._wy, m._wz);
        _sphere.radius = m._radius;

        if (!_frustum.intersectsSphere(_sphere)) {
          if (!m._dlodHid) {
            obj.setMatrixAt(m.instanceIndex, _zeroScale);
            m._dlodHid = true;
            changed = true;
          }
          imHid++;
        } else {
          if (m._dlodHid) {
            obj.setMatrixAt(m.instanceIndex, m._origMatrix);
            m._dlodHid = false;
            changed = true;
          }
          imVis++;
        }
      }

      if (changed) obj.instanceMatrix.needsUpdate = true;
    }

    var ms = (performance.now() - t0).toFixed(1);
    if ((bmHid > 0 || imHid > 0 || bmVis > 0 || imVis > 0) && A.markDirty) A.markDirty();

    // Log every 10th evaluation (~once per second at 60fps)
    if (A._dlodFrame % (EVAL_EVERY * 10) === 0) {
      console.log('[DLOD] §DLOD_FRUSTUM im=' + imVis + '/' + (imVis + imHid) +
        ' skip=' + skipCount + ' ms=' + ms);
    }
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
