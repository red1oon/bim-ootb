/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * dlod.js — §6.8 Frustum + Storey DLOD (Dynamic Level of Detail)
 * S258: R-tree tested but SQL WASM overhead (~90ms/tick) > JS traverse (~4ms/tick).
 * Kept: frustum + storey with orbit-target tracking + time machine cooperate.
 * 48K → ~2K visible, 122K → ~3K visible, sub-6ms per tick.
 */
function setupDLOD(A) {
  // ── State ──
  A._dlodEnabled = false;
  A._dlodFrame = 0;
  A._dlodPaused = false;     // true = cooperate with time machine (skip TM-hidden meshes)

  var EVAL_EVERY = 6;             // frames between evaluations
  var MIN_ELEMENTS = 5000;        // §S271: frustum culling for all non-trivial buildings (was 100K)
  var STOREY_RANGE = 3;           // show N storeys above/below look target
  var _frustum = new THREE.Frustum();
  var _projScreenMatrix = new THREE.Matrix4();
  var _sphere = new THREE.Sphere();
  var _zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
  var _lastCamX = 0, _lastCamY = 0, _lastCamZ = 0;  // §S260b: skip tick when camera idle
  var _lastTargX = 0, _lastTargY = 0, _lastTargZ = 0;

  // Storey Y-positions cache (built once after streaming)
  var _storeyLevels = [];  // [{name, y}, ...] sorted by y ascending
  var _storeyBuilt = false;

  function _buildStoreyLevels() {
    if (_storeyBuilt) return;
    _storeyBuilt = true;
    var storeyY = {};
    // §S260b: Build from _batchStoreyMap (BatchedMesh) + individual meshes
    // BatchedMesh doesn't have per-element positions, so query A.db for storey→avg Z
    if (A.db && A._batchStoreyMap && Object.keys(A._batchStoreyMap).length > 0) {
      try {
        var rows = A.db.exec("SELECT storey, AVG(center_z) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE storey != '' GROUP BY storey");
        if (rows.length && rows[0].values) {
          for (var ri = 0; ri < rows[0].values.length; ri++) {
            var s = rows[0].values[ri][0];
            var z = rows[0].values[ri][1];
            if (s) {
              var p = A.ifc2three(0, 0, z);
              storeyY[s] = p.y;
            }
          }
        }
      } catch(e) {}
    }
    // Fallback: individual meshes (non-BatchedMesh path or mixed)
    if (Object.keys(storeyY).length === 0) {
      A.scene.traverse(function(obj) {
        if (obj.isMesh && obj.userData.storey && obj.userData.guid) {
          var s = obj.userData.storey;
          if (storeyY[s] === undefined) storeyY[s] = obj.position.y;
        }
      });
    }
    _storeyLevels = Object.entries(storeyY)
      .map(function(e) { return { name: e[0], y: e[1] }; })
      .sort(function(a, b) { return a.y - b.y; });
    console.log('[DLOD] §DLOD_STOREYS count=' + _storeyLevels.length +
      ' levels=' + _storeyLevels.map(function(s) { return s.name; }).join(','));
  }

  // §S262: Storey culling disabled — too aggressive, hides visible floors on head-on views.
  // DLOD = frustum culling only (individual meshes). Safe: never hides what you're looking at.
  function _visibleStoreys() { return null; }

  // ── Enable/disable ──
  A.dlodEnable = function() {
    if (A.streamedCount < MIN_ELEMENTS) {
      console.log('[DLOD] §DLOD_SKIP count=' + A.streamedCount + ' < ' + MIN_ELEMENTS);
      return;
    }
    A._dlodEnabled = true;
    A._dlodFrame = EVAL_EVERY - 1;  // next dlodTick fires immediately (no 6-frame delay)
    _storeyBuilt = false;
    console.log('[DLOD] §DLOD_ENABLE count=' + A.streamedCount + ' mode=visibility_only');
  };

  A.dlodDisable = function(reason) {
    if (!A._dlodEnabled) return;
    A._dlodEnabled = false;
    _restoreAll();
    console.log('[DLOD] §DLOD_DISABLE reason=' + (reason || 'unknown'));
  };

  // §S261: Demote ALL promoted slots back to bbox — called by Time Machine on activate
  // Ensures clean baseline: TM controls visibility, DLOD geometry state is reset.
  A.dlodDemoteAll = function() {
    if (!A._dlodSlots) return;
    var bboxGeo = A._dlodBboxGeo;
    if (!bboxGeo) return;
    var count = 0;
    for (var bmId in A._dlodSlots) {
      var slots = A._dlodSlots[bmId];
      var bm = slots._bmRef;
      if (!bm || !bm.parent) continue;
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (s.promoted) {
          try {
            bm.setGeometryAt(s.slotId, bboxGeo);
            bm.setMatrixAt(s.slotId, s.bboxMatrix);
          } catch(e) { /* skip */ }
          s.promoted = false;
          count++;
        }
      }
    }
    _totalPromoted = 0;
    if (count > 0) {
      console.log('[DLOD] §DLOD_DEMOTE_ALL count=' + count + ' reason=time_machine');
      if (A.markDirty) A.markDirty();
    }
  };

  // ── Main tick — called from animate loop ──
  A.dlodTick = function() {
    if (!A._dlodEnabled) return;
    A._dlodFrame++;
    if (A._dlodFrame % EVAL_EVERY !== 0) return;

    // §S260b: Skip when camera hasn't moved — no work needed, prevents micro-stutter
    var cp = A.camera.position, ct = A.controls ? A.controls.target : cp;
    if (Math.abs(cp.x - _lastCamX) < 0.01 && Math.abs(cp.y - _lastCamY) < 0.01 &&
        Math.abs(cp.z - _lastCamZ) < 0.01 && Math.abs(ct.x - _lastTargX) < 0.01 &&
        Math.abs(ct.y - _lastTargY) < 0.01 && Math.abs(ct.z - _lastTargZ) < 0.01) {
      return;
    }
    _lastCamX = cp.x; _lastCamY = cp.y; _lastCamZ = cp.z;
    _lastTargX = ct.x; _lastTargY = ct.y; _lastTargZ = ct.z;

    _buildStoreyLevels();
    var t0 = performance.now();

    // Build camera frustum
    A.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    var visStoreys = _visibleStoreys();

    var visCount = 0, hidCount = 0, skipCount = 0;
    var storeyFilter = A.activeStoreyFilter;
    var hiddenDiscs = A.hiddenDiscs;

    A.scene.traverse(function(obj) {
      // ── Individual meshes ──
      if (obj.isMesh && obj.userData.guid && !obj.userData.isBboxPlaceholder) {
        // Respect existing storey/disc filters
        if (storeyFilter !== null && storeyFilter !== undefined &&
            obj.userData.storey !== storeyFilter) { skipCount++; return; }
        if (hiddenDiscs && hiddenDiscs.size > 0 &&
            hiddenDiscs.has(obj.userData.disc)) { skipCount++; return; }

        // Cooperate with time machine: don't override TM-hidden elements
        if (A._dlodPaused && !obj.visible) { skipCount++; return; }

        // Storey distance check
        if (visStoreys && obj.userData.storey && !visStoreys[obj.userData.storey]) {
          obj.visible = false;
          obj.userData._dlodHidden = true;
          hidCount++;
          return;
        }

        // Frustum check — use bounding sphere
        if (obj.geometry && obj.geometry.boundingSphere) {
          _sphere.copy(obj.geometry.boundingSphere);
          _sphere.applyMatrix4(obj.matrixWorld);
          if (!_frustum.intersectsSphere(_sphere)) {
            obj.visible = false;
            obj.userData._dlodHidden = true;
            hidCount++;
            return;
          }
        }

        obj.visible = true;
        obj.userData._dlodHidden = false;
        visCount++;
      }

      // ── InstancedMesh: storey-based culling per instance ──
      if (obj.isInstancedMesh && A._instanceMeta[obj.id]) {
        var meta = A._instanceMeta[obj.id];
        var changed = false;
        for (var i = 0; i < meta.length; i++) {
          var m = meta[i];
          if (storeyFilter !== null && storeyFilter !== undefined &&
              m.storey !== storeyFilter) continue;
          if (hiddenDiscs && hiddenDiscs.size > 0 &&
              hiddenDiscs.has(m.disc)) continue;

          if (visStoreys && !visStoreys[m.storey]) {
            if (!m._origMatrix) {
              m._origMatrix = new THREE.Matrix4();
              obj.getMatrixAt(i, m._origMatrix);
            }
            obj.setMatrixAt(i, _zeroScale);
            changed = true;
            hidCount++;
          } else if (m._origMatrix) {
            // §S262: Restore when visStoreys=null (show all) or storey now visible
            obj.setMatrixAt(i, m._origMatrix);
            m._origMatrix = null;
            changed = true;
            visCount++;
          }
        }
        if (changed) obj.instanceMatrix.needsUpdate = true;
      }

      // ── BatchedMesh: storey-based culling per slot ──
      if (obj.isBatchedMesh && A._batchMeta[obj.id]) {
        var meta = A._batchMeta[obj.id];
        var anyVis = false;
        for (var i = 0; i < meta.length; i++) {
          var m = meta[i];
          if (storeyFilter !== null && storeyFilter !== undefined &&
              m.storey !== storeyFilter) continue;
          if (hiddenDiscs && hiddenDiscs.size > 0 &&
              hiddenDiscs.has(m.disc)) continue;

          if (visStoreys && !visStoreys[m.storey]) {
            obj.setVisibleAt(m.slotId, false);
            m._dlodHid = true;
            hidCount++;
          } else {
            // §S262: Restore when visStoreys=null (show all) or storey now visible
            if (m._dlodHid) { obj.setVisibleAt(m.slotId, true); m._dlodHid = false; }
            anyVis = true;
            visCount++;
          }
        }
        obj.visible = anyVis;
      }
    });

    var ms = (performance.now() - t0).toFixed(1);
    if ((hidCount > 0 || visCount > 0) && A.markDirty) A.markDirty();  // §S262: trigger render on any visibility change
    // Log every 10th evaluation (once per second at 60fps)
    if (A._dlodFrame % (EVAL_EVERY * 10) === 0) {
      var camStorey = visStoreys ? Object.keys(visStoreys).join('+') : 'all';
      console.log('[DLOD] §DLOD_FRUSTUM vis=' + visCount +
        ' hid=' + hidCount + ' skip=' + skipCount +
        ' storeys=' + camStorey + ' ms=' + ms);
    }

    // §S262: No geometry swap — real geometry always. DLOD = visibility culling only.
  };

  // ── §S261: Geometry-swap promote/demote ──
  var PROMOTE_BUDGET = 20;    // max slots to promote per tick
  var DEMOTE_BUDGET = 40;     // max slots to demote per tick (cheaper)
  var PROMOTE_DIST = 50;      // metres — swap bbox→real when closer
  var DEMOTE_DIST = 80;       // metres — swap real→bbox when farther (hysteresis)
  var _totalPromoted = 0;
  var _promoteLogThrottle = 0;

  function _promotePass() {
    var camX = A.camera.position.x;
    var camY = A.camera.position.y;
    var camZ = A.camera.position.z;
    var promoted = 0, demoted = 0;
    var bboxGeo = A._dlodBboxGeo;
    if (!bboxGeo) return;

    for (var bmId in A._dlodSlots) {
      var slots = A._dlodSlots[bmId];
      var bm = slots._bmRef;
      if (!bm || !bm.parent) continue;  // mesh removed from scene

      var changed = false;
      for (var i = 0; i < slots.length; i++) {
        if (promoted >= PROMOTE_BUDGET && demoted >= DEMOTE_BUDGET) break;
        var s = slots[i];

        // Distance from camera to element world position
        var dx = s.wx - camX, dy = s.wy - camY, dz = s.wz - camZ;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (!s.promoted && dist < PROMOTE_DIST && promoted < PROMOTE_BUDGET) {
          // PROMOTE: bbox → real geometry
          var realGeo = A.meshCache[s.hash];
          if (!realGeo) continue;  // geometry not in cache yet
          var vc = realGeo.attributes.position ? realGeo.attributes.position.count : 0;
          var ic = realGeo.index ? realGeo.index.count : vc;
          if (vc > s.reservedVerts || ic > s.reservedIdx) continue;  // doesn't fit

          try {
            bm.setGeometryAt(s.slotId, realGeo);
            bm.setMatrixAt(s.slotId, s.realMatrix);
            s.promoted = true;
            promoted++;
            _totalPromoted++;
            changed = true;
          } catch(e) { /* skip on error */ }
        }
        else if (s.promoted && dist > DEMOTE_DIST && demoted < DEMOTE_BUDGET) {
          // DEMOTE: real → bbox (free GPU detail for far elements)
          try {
            bm.setGeometryAt(s.slotId, bboxGeo);
            bm.setMatrixAt(s.slotId, s.bboxMatrix);
            s.promoted = false;
            demoted++;
            _totalPromoted--;
            changed = true;
          } catch(e) { /* skip on error */ }
        }
      }
      // No needsUpdate needed for BatchedMesh — setGeometryAt/setMatrixAt handle it
    }

    if ((promoted > 0 || demoted > 0) && A.markDirty) A.markDirty();

    // Throttled logging — every 10th tick with activity
    _promoteLogThrottle++;
    if ((promoted > 0 || demoted > 0) && _promoteLogThrottle % 10 === 0) {
      console.log('[DLOD] §DLOD_SWAP promote=' + promoted + ' demote=' + demoted +
        ' total_promoted=' + _totalPromoted +
        ' cached=' + Object.keys(A.meshCache).length);
    }
  }

  // ── Restore all DLOD-hidden meshes ──
  function _restoreAll() {
    A.scene.traverse(function(obj) {
      if (obj.isMesh && obj.userData._dlodHidden) {
        obj.visible = true;
        obj.userData._dlodHidden = false;
      }
      if (obj.isInstancedMesh && A._instanceMeta[obj.id]) {
        var meta = A._instanceMeta[obj.id];
        var changed = false;
        for (var i = 0; i < meta.length; i++) {
          if (meta[i]._origMatrix) {
            obj.setMatrixAt(i, meta[i]._origMatrix);
            meta[i]._origMatrix = null;
            changed = true;
          }
        }
        if (changed) obj.instanceMatrix.needsUpdate = true;
      }
      if (obj.isBatchedMesh && A._batchMeta[obj.id]) {
        var meta = A._batchMeta[obj.id];
        for (var i = 0; i < meta.length; i++) {
          obj.setVisibleAt(meta[i].slotId, true);
        }
        obj.visible = true;
      }
    });
    console.log('[DLOD] §DLOD_RESTORE all meshes visible');
  }
}
