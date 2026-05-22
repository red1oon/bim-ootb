/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_views.js — Orthographic View Presets (elevation, roof, floor plan)
 *
 * Implementing BBC.md §2D_022/§2D_023 — Witness: W-GRID-VIEWS
 *
 * Single-responsibility functions:
 *   Camera:    saveCameraState, positionOrthoCamera, swapCamera
 *   Clipping:  computeCutZ, classifyMesh, applyFloorClip, clearFloorClip
 *   Lighting:  boostLighting, restoreLighting
 *   Orchestration: lockView, unlockView
 *
 * Log tags: §VIEW_LOCK §VIEW_UNLOCK §VIEW_CLIP §VIEW_LIGHT
 */
var GridViews = (function() {
  'use strict';

  // ── View Definitions (pure data) ─────────────────────────────────
  var VIEW_DEFS = {
    front:  { dx: 0, dy: 0, dz:+1, fw:'W', fh:'H', up:[0,1,0] },
    rear:   { dx: 0, dy: 0, dz:-1, fw:'W', fh:'H', up:[0,1,0] },
    left:   { dx:-1, dy: 0, dz: 0, fw:'D', fh:'H', up:[0,1,0] },
    right:  { dx:+1, dy: 0, dz: 0, fw:'D', fh:'H', up:[0,1,0] },
    roof:   { dx: 0, dy:+1, dz: 0, fw:'W', fh:'D', up:[0,0,-1] },
    floor:  { dx: 0, dy:+1, dz: 0, fw:'W', fh:'D', up:[0,0,-1], clip: true },
    floor1: { dx: 0, dy:+1, dz: 0, fw:'W', fh:'D', up:[0,0,-1], clip: true }
  };

  // ── State ────────────────────────────────────────────────────────
  var _savedCamera = null;
  var _orthoCamera = null;
  var _origCamera = null;
  var _activeView = null;
  var _floorClipPlane = null;
  var _hiddenMeshes = [];
  var _fadedMeshes = [];
  var _savedLighting = null;
  var _resizeHandler = null;

  function log(msg) { console.log('[GridViews] ' + msg); }

  // ── 1. Camera (pure geometry) ────────────────────────────────────

  function buildingCentre3(A, env) {
    var cx = (env.xMin + env.xMax) / 2;
    var cy = (env.yMin + env.yMax) / 2;
    var cz = (env.zMin + env.zMax) / 2;
    var t = A.ifc2three(cx, cy, cz);
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  function saveCameraState(A) {
    if (_savedCamera) return;
    _origCamera = A.camera;
    _savedCamera = {
      pos: A.camera.position.clone(),
      target: A.controls.target.clone(),
      up: A.camera.up.clone(),
      fov: A.camera.fov
    };
  }

  function getOrthoCamera(halfW, halfH, near, far) {
    if (!_orthoCamera) {
      _orthoCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, near, far);
    } else {
      _orthoCamera.left = -halfW;
      _orthoCamera.right = halfW;
      _orthoCamera.top = halfH;
      _orthoCamera.bottom = -halfH;
      _orthoCamera.near = near;
      _orthoCamera.far = far;
    }
    _orthoCamera.updateProjectionMatrix();
    return _orthoCamera;
  }

  function swapCamera(A, cam) {
    A.camera = cam;
    A.controls.object = cam;
    cam.updateProjectionMatrix();
    A.controls.update();

    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }
    if (cam.isOrthographicCamera) {
      _resizeHandler = function() {
        A.renderer.setSize(window.innerWidth, window.innerHeight);
        var newAspect = window.innerWidth / window.innerHeight;
        var curHalfH = cam.top;
        var curHalfW = curHalfH * newAspect;
        cam.left = -curHalfW;
        cam.right = curHalfW;
        cam.updateProjectionMatrix();
      };
      window.addEventListener('resize', _resizeHandler);
    }
    A.markDirty();
  }

  function positionOrthoCamera(A, mode, env, centre) {
    var def = VIEW_DEFS[mode];
    if (!def) return null;

    var bldW = env.xMax - env.xMin;
    var bldD = env.yMax - env.yMin;
    var bldH = env.zMax - env.zMin;
    var margin = 1.5;
    var dist = Math.max(bldW, bldD, bldH) * 2;

    var dims = { W: bldW, D: bldD, H: bldH };
    var halfW = (dims[def.fw] / 2) * margin;
    var halfH = (dims[def.fh] / 2) * margin;

    var viewportAspect = window.innerWidth / window.innerHeight;
    var buildingAspect = halfW / halfH;
    if (viewportAspect > buildingAspect) {
      halfW = halfH * viewportAspect;
    } else {
      halfH = halfW / viewportAspect;
    }

    var frustumAspect = halfW / halfH;
    if (Math.abs(frustumAspect - viewportAspect) > 0.01) {
      log('§VIEW_LOCK ABORT — aspect mismatch');
      return null;
    }

    var camPos = new THREE.Vector3(
      centre.x + def.dx * dist,
      centre.y + def.dy * dist,
      centre.z + def.dz * dist
    );
    var upVec = new THREE.Vector3(def.up[0], def.up[1], def.up[2]);

    var cam = getOrthoCamera(halfW, halfH, 0.1, dist * 4);
    cam.position.copy(camPos);
    cam.up.copy(upVec);
    cam.lookAt(centre);
    return cam;
  }

  // ── 2. Mesh Classification (pure function — no side effects) ─────

  // Classes fully hidden in floor plan — roof geometry spans below clip plane
  // IfcCovering REMOVED: it includes wall tiles, floor tiles, insulation — not just roof.
  var HIDE_IN_FLOOR = {
    'IfcRoof': 1, 'IfcRoofing': 1
  };

  // Classes rendered as faint outline in floor plan — slab fights wall contrast
  var FADE_IN_FLOOR = {
    'IfcSlab': 1, 'IfcPlate': 1
  };

  /** Classify a mesh for floor plan treatment.
   *  @param {Object} [hideSet] — card-specific hide set (overrides HIDE_IN_FLOOR)
   *  @returns 'hide' | 'retain' | 'fade' | 'clip' */
  function classifyMesh(ifcClass, retainSet, hideSet) {
    var hs = hideSet || HIDE_IN_FLOOR;
    if (hs[ifcClass]) return 'hide';
    if (retainSet[ifcClass]) return 'retain';
    if (FADE_IN_FLOOR[ifcClass]) return 'fade';
    return 'clip';
  }

  // ── 3. Clipping (floor plan only) ────────────────────────────────

  /** Compute the IFC Z for the clip plane.
   *  Priority: explicit override > ratio-based > offset-based. */
  function computeCutZ(env, viewMode, cutZOverride) {
    if (cutZOverride != null) return cutZOverride;
    var clipCfg = (typeof GridConfig !== 'undefined') ? GridConfig.clipFor(viewMode) : null;
    var bldH = env.zMax - env.zMin;
    if (clipCfg && clipCfg.offset_ratio) return env.zMin + bldH * clipCfg.offset_ratio;
    return env.zMin + ((clipCfg && clipCfg.offset_m) || 1.0);
  }

  /** Apply horizontal clip plane + hide roof meshes.
   *  Each mesh gets exactly ONE treatment: hide, retain, or clip.
   *  @param {Object} [hideSet] — card-specific hide set (overrides HIDE_IN_FLOOR) */
  function applyFloorClip(A, env, viewMode, cutZOverride, hideSet) {
    var cutZ = computeCutZ(env, viewMode, cutZOverride);
    var cutY = cutZ - A.modelOffset.z;

    _floorClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY);
    A.renderer.localClippingEnabled = true;
    _hiddenMeshes = [];

    var retainSet = (typeof GridConfig !== 'undefined')
      ? GridConfig.retainSet(viewMode)
      : { 'IfcFurnishingElement': 1, 'IfcFurniture': 1 };

    var clipped = 0, retained = 0, hidden = 0, faded = 0;
    _fadedMeshes = [];
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(obj) {
      var cls = (obj.userData && obj.userData.ifcClass) || '';
      var action = classifyMesh(cls, retainSet, hideSet);

      if (action === 'hide') {
        obj.visible = false;
        _hiddenMeshes.push(obj);
        hidden++;
      } else if (action === 'retain') {
        retained++;
      } else if (action === 'fade') {
        // Slab: clip + make near-transparent so it doesn't fight wall contrast
        obj.material.clippingPlanes = [_floorClipPlane];
        obj.material.clipShadows = true;
        if (obj.userData._origOpacity == null) {
          obj.userData._origOpacity = obj.material.opacity;
          obj.userData._origTransparent = obj.material.transparent;
        }
        obj.material.opacity = 0.08;
        obj.material.transparent = true;
        obj.material.needsUpdate = true;
        _fadedMeshes.push(obj);
        faded++;
      } else {
        obj.material.clippingPlanes = [_floorClipPlane];
        obj.material.clipShadows = true;
        obj.material.needsUpdate = true;
        clipped++;
      }
    });
    // §S260: BatchedMesh — apply clip plane and per-element hide via setVisibleAt
    A.collectMeshes(function(o) { return o.isBatchedMesh; }).forEach(function(bm) {
      bm.material.clippingPlanes = [_floorClipPlane];
      bm.material.clipShadows = true;
      bm.material.needsUpdate = true;
      var meta = A._batchMeta && A._batchMeta[bm.id];
      if (meta) {
        for (var i = 0; i < meta.length; i++) {
          var action = classifyMesh(meta[i].ifcClass || '', retainSet, hideSet);
          if (action === 'hide') {
            bm.setVisibleAt(meta[i].slotId, false);
            _hiddenMeshes.push({ _batchRef: bm, _slotId: meta[i].slotId });
            hidden++;
          } else {
            clipped++;
          }
        }
      }
    });

    log('§VIEW_CLIP apply cutZ=' + cutZ.toFixed(2) + ' cutY=' + cutY.toFixed(2) +
        ' clipped=' + clipped + ' retained=' + retained + ' hidden=' + hidden + ' faded=' + faded);
  }

  /** Clear clip planes and restore hidden + faded meshes. */
  function clearFloorClip(A) {
    if (!_floorClipPlane && !_hiddenMeshes.length && !_fadedMeshes.length) return;

    A.collectMeshes(function(o) { return o.isMesh || o.isBatchedMesh; }).forEach(function(obj) {
      obj.material.clippingPlanes = null;
      obj.material.clipShadows = false;
      obj.material.needsUpdate = true;
    });

    for (var i = 0; i < _hiddenMeshes.length; i++) {
      var hm = _hiddenMeshes[i];
      // §S260: Restore BatchedMesh hidden elements
      if (hm._batchRef) {
        hm._batchRef.setVisibleAt(hm._slotId, true);
        hm._batchRef.visible = true;
      } else {
        hm.visible = true;
      }
    }

    // Restore faded meshes (slabs) to original opacity
    for (var f = 0; f < _fadedMeshes.length; f++) {
      var fm = _fadedMeshes[f];
      if (fm.userData._origOpacity != null) {
        fm.material.opacity = fm.userData._origOpacity;
        fm.material.transparent = fm.userData._origTransparent;
        fm.material.needsUpdate = true;
        delete fm.userData._origOpacity;
        delete fm.userData._origTransparent;
      }
    }

    log('§VIEW_CLIP cleared restored=' + _hiddenMeshes.length + ' unfaded=' + _fadedMeshes.length);
    _hiddenMeshes = [];
    _fadedMeshes = [];
    _floorClipPlane = null;
    A.renderer.localClippingEnabled = false;
  }

  // ── 4. Lighting ──────────────────────────────────────────────────

  function boostLighting(A) {
    if (_savedLighting || !A.ambient || !A.sun) return;
    _savedLighting = { ambInt: A.ambient.intensity, sunInt: A.sun.intensity };
    A.ambient.intensity = 1.2;
    A.sun.intensity = 0.6;
    log('§VIEW_LIGHT boost (was ' + _savedLighting.ambInt.toFixed(1) + '/' + _savedLighting.sunInt.toFixed(1) + ')');
  }

  function restoreLighting(A) {
    if (!_savedLighting || !A.ambient || !A.sun) return;
    A.ambient.intensity = _savedLighting.ambInt;
    A.sun.intensity = _savedLighting.sunInt;
    log('§VIEW_LIGHT restored');
    _savedLighting = null;
  }

  // ── 5. Orchestration (composes atomic functions) ─────────────────

  /** Lock to ortho 2D view.
   *  @param {boolean} [cameraOnly] — true = camera + lighting only, skip clip.
   *    Card-first restore uses this: camera → band → clip (avoids band un-hiding roofs). */
  function lockView(A, mode, env, cutZ, hideSet, cameraOnly) {
    if (!env || !VIEW_DEFS[mode]) return;
    saveCameraState(A);
    clearFloorClip(A);

    var centre = buildingCentre3(A, env);
    var cam = positionOrthoCamera(A, mode, env, centre);
    if (!cam) return;

    A.controls.target.copy(centre);
    swapCamera(A, cam);
    A.controls.enableRotate = false;
    A.controls.enablePan = true;
    A.controls.enableZoom = true;
    A.controls.update();

    if (!cameraOnly && VIEW_DEFS[mode].clip) {
      applyFloorClip(A, env, mode, cutZ, hideSet);
    }

    boostLighting(A);
    _activeView = mode;
    A.markDirty();
    log('§VIEW_LOCK mode=' + mode + (cameraOnly ? ' (cameraOnly)' : ''));
  }

  function unlockView(A) {
    if (!_savedCamera || !_origCamera) {
      _activeView = null;
      return;
    }

    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }

    _origCamera.position.copy(_savedCamera.pos);
    _origCamera.up.copy(_savedCamera.up);
    _origCamera.fov = _savedCamera.fov;
    _origCamera.aspect = window.innerWidth / window.innerHeight;
    _origCamera.updateProjectionMatrix();

    A.camera = _origCamera;
    A.controls.object = _origCamera;
    A.controls.target.copy(_savedCamera.target);
    A.controls.enableRotate = true;
    A.controls.enablePan = true;
    A.controls.update();

    if (A._onResize) A._onResize();

    clearFloorClip(A);
    restoreLighting(A);

    _savedCamera = null;
    _activeView = null;
    A.markDirty();
    log('§VIEW_UNLOCK restored');
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    VIEW_DEFS:      VIEW_DEFS,
    HIDE_IN_FLOOR:  HIDE_IN_FLOOR,
    lockView:       lockView,
    unlockView:     unlockView,
    applyFloorClip: applyFloorClip,
    clearFloorClip: clearFloorClip,
    activeView:     function() { return _activeView; },
    /** Read current ortho camera state for card persistence */
    getCameraState: function(A) {
      if (!_orthoCamera) return null;
      var tgt = A.controls ? A.controls.target : null;
      return {
        x: _orthoCamera.position.x,
        y: _orthoCamera.position.y,
        z: _orthoCamera.position.z,
        zoom: _orthoCamera.zoom,
        targetX: tgt ? tgt.x : null,
        targetY: tgt ? tgt.y : null,
        targetZ: tgt ? tgt.z : null
      };
    },
    /** Apply saved camera state from a card */
    applyCameraState: function(A, camState) {
      if (!_orthoCamera || !camState) return;
      _orthoCamera.position.set(camState.x, camState.y, camState.z);
      _orthoCamera.zoom = camState.zoom || 1;
      _orthoCamera.updateProjectionMatrix();
      if (camState.targetX != null) {
        A.controls.target.set(camState.targetX, camState.targetY, camState.targetZ);
      }
      A.controls.update();
      A.markDirty();
      log('§VIEW_CAM restored zoom=' + _orthoCamera.zoom.toFixed(2));
    }
  };
})();
