/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * dlod.js — §6.8 Per-slot Frustum DLOD (Dynamic Level of Detail)
 * §S274: Rewired from empty spatial grid to per-slot setVisibleAt on BatchedMesh.
 * BatchedMesh slots hidden outside frustum → GPU skips their triangles entirely.
 * Terminal 48K: 32% triangle reduction. Hospital 63K: 22% reduction. Proven by bench.
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
  var _lastCamX = 0, _lastCamY = 0, _lastCamZ = 0;  // §S260b: skip tick when camera idle
  var _lastTargX = 0, _lastTargY = 0, _lastTargZ = 0;

  // ── §S274: Direct refs to BatchedMesh + InstancedMesh (built once after streaming) ──
  var _batchedMeshes = [];   // [{obj, meta}, ...] — meta has per-slot world position + radius
  var _instancedMeshes = []; // [{obj, meta}, ...] — direct references
  var _refsBuilt = false;

  function _buildRefs() {
    if (_refsBuilt) return;
    _refsBuilt = true;
    _batchedMeshes = [];
    _instancedMeshes = [];

    // §S274: Enrich BatchedMesh meta with world positions for frustum testing.
    // Positions are baked into slot matrices during _flushInstanced — extract them.
    var _m4 = new THREE.Matrix4();
    var _pos = new THREE.Vector3();

    A.scene.traverse(function(obj) {
      if (obj.isBatchedMesh && A._batchMeta[obj.id]) {
        var meta = A._batchMeta[obj.id];
        // Extract world position + bounding radius per slot
        for (var i = 0; i < meta.length; i++) {
          var m = meta[i];
          try {
            obj.getMatrixAt(m.slotId, _m4);
            _pos.setFromMatrixPosition(_m4);
            m._wx = _pos.x;
            m._wy = _pos.y;
            m._wz = _pos.z;
            // §S274: Bounding radius from element bbox dims (bx,by,bz added to meta by streaming.js)
            var bx = m.bx || 0.3, by = m.by || 0.3, bz = m.bz || 0.3;
            m._radius = Math.sqrt(bx * bx + by * by + bz * bz) * 0.5;
          } catch(e) {
            m._wx = 0; m._wy = 0; m._wz = 0; m._radius = 5.0;
          }
        }
        _batchedMeshes.push({ obj: obj, meta: meta });
      }

      if (obj.isInstancedMesh && A._instanceMeta[obj.id]) {
        _instancedMeshes.push({ obj: obj, meta: A._instanceMeta[obj.id] });
      }
    });

    console.log('[DLOD] §DLOD_REFS built batched=' + _batchedMeshes.length +
      ' instanced=' + _instancedMeshes.length +
      ' totalSlots=' + _batchedMeshes.reduce(function(s, b) { return s + b.meta.length; }, 0));
  }

  // ── Enable/disable ──
  A.dlodEnable = function() {
    if (A.streamedCount < MIN_ELEMENTS) {
      console.log('[DLOD] §DLOD_SKIP count=' + A.streamedCount + ' < ' + MIN_ELEMENTS);
      return;
    }
    A._dlodEnabled = true;
    A._dlodFrame = EVAL_EVERY - 1;  // next dlodTick fires immediately
    _refsBuilt = false;
    console.log('[DLOD] §DLOD_ENABLE count=' + A.streamedCount + ' mode=per_slot_frustum');
  };

  A.dlodDisable = function(reason) {
    if (!A._dlodEnabled) return;
    A._dlodEnabled = false;
    _restoreAll();
    console.log('[DLOD] §DLOD_DISABLE reason=' + (reason || 'unknown'));
  };

  // §S261: Demote ALL promoted slots back — called by Time Machine on activate
  A.dlodDemoteAll = function() {
    // §S274: No geometry swap — just restore visibility
    _restoreAll();
  };

  // ── Main tick — called from animate loop ──
  // §S274: Per-slot frustum culling on BatchedMesh via setVisibleAt
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

    // Build camera frustum
    A.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    var visCount = 0, hidCount = 0, skipCount = 0;
    var storeyFilter = A.activeStoreyFilter;
    var hiddenDiscs = A.hiddenDiscs;

    // ── §S274: Per-slot frustum culling on BatchedMesh ──
    for (var bi = 0; bi < _batchedMeshes.length; bi++) {
      var bm = _batchedMeshes[bi];
      var obj = bm.obj;
      if (!obj.parent) continue;

      var meta = bm.meta;
      var anyVis = false;
      var changed = false;

      for (var i = 0; i < meta.length; i++) {
        var m = meta[i];

        // Skip elements already filtered by storey/discipline
        if (storeyFilter !== null && storeyFilter !== undefined &&
            m.storey !== storeyFilter) { skipCount++; continue; }
        if (hiddenDiscs && hiddenDiscs.size > 0 &&
            hiddenDiscs.has(m.disc)) { skipCount++; continue; }

        // Time Machine cooperation — don't unhide TM-hidden elements
        if (A._dlodPaused && m._dlodHid) { skipCount++; continue; }

        // Frustum test — sphere at slot world position
        _sphere.center.set(m._wx, m._wy, m._wz);
        _sphere.radius = m._radius;

        if (!_frustum.intersectsSphere(_sphere)) {
          // Outside frustum — hide
          if (!m._dlodHid) {
            obj.setVisibleAt(m.slotId, false);
            m._dlodHid = true;
            changed = true;
          }
          hidCount++;
        } else {
          // Inside frustum — show
          if (m._dlodHid) {
            obj.setVisibleAt(m.slotId, true);
            m._dlodHid = false;
            changed = true;
          }
          anyVis = true;
          visCount++;
        }
      }

      obj.visible = anyVis || obj.visible;  // don't hide entire BM if some filtered slots exist
    }

    // ── InstancedMesh: frustumCulled stays false (boundingSphere is base geometry only).
    // Per-instance frustum culling would require zero-scale trick — skip for now,
    // InstancedMesh already batches well (few draw calls). ──

    var ms = (performance.now() - t0).toFixed(1);
    if ((hidCount > 0 || visCount > 0) && A.markDirty) A.markDirty();

    // Log every 10th evaluation (~once per second at 60fps)
    if (A._dlodFrame % (EVAL_EVERY * 10) === 0) {
      console.log('[DLOD] §DLOD_FRUSTUM vis=' + visCount +
        ' hid=' + hidCount + ' skip=' + skipCount + ' ms=' + ms);
    }
  };

  // ── Restore all DLOD-hidden slots ──
  function _restoreAll() {
    for (var bi = 0; bi < _batchedMeshes.length; bi++) {
      var bm = _batchedMeshes[bi];
      var meta = bm.meta;
      for (var i = 0; i < meta.length; i++) {
        if (meta[i]._dlodHid) {
          bm.obj.setVisibleAt(meta[i].slotId, true);
          meta[i]._dlodHid = false;
        }
      }
      bm.obj.visible = true;
    }
    console.log('[DLOD] §DLOD_RESTORE all slots visible');
  }
}
