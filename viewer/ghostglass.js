/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ghostglass.js — S240b: 4D construction animation via glass-to-solid transitions
// On Play: all meshes go transparent glass. Tasks progressively snap to solid.
// No new geometry — glass casing IS the existing meshes at near-zero opacity.

function setupGhostGlass(APP) {
  var _state = 'IDLE';    // IDLE | PLAYING | PAUSED
  var _tasks = [];
  var _taskIndex = -1;
  var _materialCache = null;  // Map: mesh.id → { color, opacity, transparent, emissive, emissiveIntensity, depthWrite }
  var _guidMeshMap = null;    // guid → [mesh, ...]
  var _guidPhaseColor = {};   // guid → hex color

  // Phase colours (match rates.js PHASE_COLORS)
  var PHASE_HEX = {
    'Substructure':0xA5A5A5, 'Superstructure':0x4472C4, 'MEP Rough-in':0x70AD47,
    'Architecture':0xED7D31, 'MEP Final':0x5B9BD5, 'Finishes':0xFFC000,
    'Commissioning':0xC55A11, 'Unknown':0x888888
  };

  // Build GUID → mesh lookup (once)
  function buildGuidMap() {
    if (_guidMeshMap) return;
    _guidMeshMap = {};
    // Map ALL guidMap entries (including instanced mesh "_N" suffixes) back to meshes
    var meshById = {};
    APP.collectMeshes(function(o) { return o.isMesh || o.isInstancedMesh; }).forEach(function(obj) {
      meshById[obj.id] = obj;
      var g = APP.guidMap[obj.id] || obj.userData.guid;
      if (g) {
        if (!_guidMeshMap[g]) _guidMeshMap[g] = [];
        _guidMeshMap[g].push(obj);
      }
    });
    // Also scan guidMap for instanced entries (mesh.id + '_' + i)
    for (var key in APP.guidMap) {
      var parts = key.split('_');
      if (parts.length >= 2) {
        var baseId = parseInt(parts[0]);
        var mesh = meshById[baseId];
        if (mesh && mesh.isInstancedMesh) {
          var g = APP.guidMap[key];
          if (g && !_guidMeshMap[g]) _guidMeshMap[g] = [];
          if (g && _guidMeshMap[g].indexOf(mesh) < 0) _guidMeshMap[g].push(mesh);
        }
      }
    }
    console.log('§4D_GLASS_MAP guids=' + Object.keys(_guidMeshMap).length);
  }

  // Snapshot all materials (once per session)
  function snapshotMaterials() {
    if (_materialCache) return;
    _materialCache = new Map();
    APP.collectMeshes(function(o) { return o.isMesh || o.isInstancedMesh; }).forEach(function(obj) {
      var mat = obj.material;
      _materialCache.set(obj.id, {
        color: mat.color.getHex(),
        opacity: mat.opacity,
        transparent: mat.transparent,
        emissive: mat.emissive ? mat.emissive.getHex() : 0,
        emissiveIntensity: mat.emissiveIntensity || 0,
        depthWrite: mat.depthWrite !== false
      });
    });
    console.log('§4D_GLASS_SNAPSHOT meshes=' + _materialCache.size);
  }

  // Clone material if shared (prevent cross-contamination)
  function ensureOwnMaterial(mesh) {
    if (!mesh._4dOwnMaterial) {
      mesh.material = mesh.material.clone();
      mesh._4dOwnMaterial = true;
    }
  }

  function makeGlass(mesh) {
    ensureOwnMaterial(mesh);
    var mat = mesh.material;
    mat.transparent = true;
    mat.opacity = 0.03;
    mat.color.setHex(0xaabbcc);
    mat.depthWrite = false;
    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
    mat.needsUpdate = true;
    mesh._4dColor = undefined;
  }

  // S240c §P2: Active colour = phase colour (not rotating rainbow)
  function makeActive(mesh, phaseColor) {
    ensureOwnMaterial(mesh);
    var mat = mesh.material;
    var c = phaseColor || 0xff8c00;
    mat.transparent = true;
    mat.opacity = 0.85;
    mat.color.setHex(c);
    mat.depthTest = false;      // shine through built structure — shows active work behind walls
    mat.depthWrite = false;
    if (mat.emissive) { mat.emissive.setHex(c); mat.emissiveIntensity = 0.6; }
    mat.needsUpdate = true;
    mesh._4dColor = c;
    mesh.renderOrder = 999;     // draw on top
  }

  function makeBuilt(mesh, phaseColor) {
    ensureOwnMaterial(mesh);
    var mat = mesh.material;
    var cached = _materialCache ? _materialCache.get(mesh.id) : null;
    mat.transparent = false;
    mat.opacity = 1.0;
    if (cached) mat.color.setHex(cached.color);
    mat.depthTest = true;
    mat.depthWrite = true;
    if (mat.emissive) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
    mat.needsUpdate = true;
    mesh._4dColor = undefined;
    mesh.renderOrder = 0;
  }

  // Restore all materials AND instance matrices from cache
  function restoreAll() {
    if (!_materialCache) return;
    var restored = 0;
    APP.collectMeshes(function(o) { return o.isMesh || o.isInstancedMesh; }).forEach(function(obj) {
      var cached = _materialCache.get(obj.id);
      if (!cached) return;
      var mat = obj.material;
      mat.color.setHex(cached.color);
      mat.opacity = cached.opacity;
      mat.transparent = cached.transparent;
      mat.depthWrite = cached.depthWrite;
      mat.depthTest = true;
      if (mat.emissive) { mat.emissive.setHex(cached.emissive); mat.emissiveIntensity = cached.emissiveIntensity; }
      mat.needsUpdate = true;
      obj.renderOrder = 0;
      delete obj._4dColor;
      // Restore InstancedMesh matrices — undo zero-scale from ghost glass
      if (obj.isInstancedMesh && APP._instanceMeta && APP._instanceMeta[obj.id]) {
        var metas = APP._instanceMeta[obj.id];
        for (var i = 0; i < metas.length; i++) {
          if (metas[i]._origMatrix) {
            obj.setMatrixAt(i, metas[i]._origMatrix);
          }
        }
        obj.instanceMatrix.needsUpdate = true;
        obj.visible = true;
      }
      restored++;
    });
    console.log('§4D_GLASS_RESET restored=' + restored);
  }

  // Seek to task N — the core state applicator
  function seekTo(n) {
    if (!_tasks.length) return;
    n = Math.max(0, Math.min(n, _tasks.length - 1));
    _taskIndex = n;

    var t0 = performance.now();

    // S240c §P2: Phase colour for active task
    var activePhaseColor = PHASE_HEX[_tasks[n].phase] || 0xff8c00;

    // Collect GUID sets — each GUID belongs to ONE state only (first assignment wins)
    var builtGuids = {};   // guid → phaseColor
    var activeGuids = {};  // guid → true
    var assigned = {};     // guid → true (prevent duplicates across tasks)
    // First pass: active task GUIDs
    var activeTask = _tasks[n];
    var aGuids = activeTask.guids || [];
    for (var j = 0; j < aGuids.length; j++) {
      if (!assigned[aGuids[j]]) {
        activeGuids[aGuids[j]] = true;
        assigned[aGuids[j]] = true;
      }
    }
    // Second pass: built tasks (0..n-1) — skip GUIDs already assigned to active
    for (var i = 0; i < n; i++) {
      var guids = _tasks[i].guids || [];
      var pc = _guidPhaseColor;
      for (var j = 0; j < guids.length; j++) {
        if (!assigned[guids[j]]) {
          builtGuids[guids[j]] = pc[guids[j]] || 0x888888;
          assigned[guids[j]] = true;
        }
      }
    }

    // Collect ALL guids that belong to any task (for "leftover" detection)
    var allTaskGuids = {};
    for (var ti = 0; ti < _tasks.length; ti++) {
      var tguids = _tasks[ti].guids || [];
      for (var gi = 0; gi < tguids.length; gi++) allTaskGuids[tguids[gi]] = true;
    }

    var isLastTask = (n >= _tasks.length - 1);
    var counts = {glass:0, active:0, built:0};
    // S240c §P2: Apply states — all immediate, no stagger (scrubber is the animation)
    APP.collectMeshes(function(o) { return o.isMesh || o.isInstancedMesh; }).forEach(function(obj) {
      // S240c: InstancedMesh — per-instance state via zero-scale (same pattern as outliner)
      // Glass = hidden (zero-scale). Built = visible + solid. Active = visible + glow + ripple.
      if (obj.isInstancedMesh && APP._instanceMeta && APP._instanceMeta[obj.id]) {
        var metas = APP._instanceMeta[obj.id];
        var _zero = new THREE.Matrix4().makeScale(0, 0, 0);
        var activeIndices = [];
        var builtIndices = [];
        var glassIndices = [];
        for (var mi = 0; mi < metas.length; mi++) {
          var ig = metas[mi].guid;
          // Save original matrix on first encounter
          if (!metas[mi]._origMatrix) {
            metas[mi]._origMatrix = new THREE.Matrix4();
            obj.getMatrixAt(mi, metas[mi]._origMatrix);
          }
          if (activeGuids[ig] !== undefined) { activeIndices.push(mi); }
          else if (builtGuids[ig] !== undefined) { builtIndices.push(mi); }
          else if (isLastTask) { builtIndices.push(mi); }
          else { glassIndices.push(mi); }
        }
        // Glass instances → zero-scale (invisible = ghost glass effect)
        for (var gi = 0; gi < glassIndices.length; gi++) {
          obj.setMatrixAt(glassIndices[gi], _zero);
        }
        // Built instances → restore matrix (visible)
        for (var bi = 0; bi < builtIndices.length; bi++) {
          obj.setMatrixAt(builtIndices[bi], metas[builtIndices[bi]]._origMatrix);
        }
        // Decide material: active glow if any active, else built solid
        if (activeIndices.length > 0) {
          makeActive(obj, activePhaseColor);
          // Active instances: zero-scale first, then ripple reveal
          for (var ai = 0; ai < activeIndices.length; ai++) {
            obj.setMatrixAt(activeIndices[ai], _zero);
          }
          obj.instanceMatrix.needsUpdate = true;
          // Ripple: batch-reveal ~10K per frame
          var BATCH = Math.max(500, Math.ceil(activeIndices.length / 6));
          var revealed = 0;
          (function ripple() {
            var end = Math.min(revealed + BATCH, activeIndices.length);
            for (var ri = revealed; ri < end; ri++) {
              obj.setMatrixAt(activeIndices[ri], metas[activeIndices[ri]]._origMatrix);
            }
            obj.instanceMatrix.needsUpdate = true;
            revealed = end;
            APP.markDirty();
            if (revealed < activeIndices.length) requestAnimationFrame(ripple);
          })();
          counts.active++;
        } else if (builtIndices.length > 0) {
          makeBuilt(obj, _guidPhaseColor[metas[builtIndices[0]].guid] || 0x888888);
          obj.instanceMatrix.needsUpdate = true;
          counts.built++;
        } else {
          // All glass — hide entire mesh
          makeGlass(obj);
          obj.instanceMatrix.needsUpdate = true;
          counts.glass++;
        }
        obj.visible = (activeIndices.length + builtIndices.length) > 0;
        return;
      }
      // Regular Mesh — single GUID lookup
      var g = APP.guidMap[obj.id] || obj.userData.guid;
      if (!g) {
        if (isLastTask) { makeBuilt(obj, 0x888888); counts.built++; }
        else { makeGlass(obj); counts.glass++; }
        return;
      }
      if (activeGuids[g] !== undefined) {
        makeActive(obj, activePhaseColor);
        counts.active++;
      }
      else if (builtGuids[g] !== undefined) { makeBuilt(obj, builtGuids[g]); counts.built++; }
      else if (isLastTask) {
        makeBuilt(obj, _guidPhaseColor[g] || 0x888888); counts.built++;
      }
      else { makeGlass(obj); counts.glass++; }
    });

    var elapsed = (performance.now() - t0).toFixed(1);
    console.log('§4D_GLASS_SEEK task=' + n + '/' + _tasks.length +
      ' phase=' + _tasks[n].phase +
      ' active=' + counts.active + ' built=' + counts.built + ' glass=' + counts.glass +
      ' ms=' + elapsed + ' name="' + _tasks[n].name + '"');
    APP.markDirty();
  }

  // No internal timer — Gantt controls all pacing via 4D_SEEK messages.
  // ghostglass is a pure renderer: 4D_PLAY=glass, 4D_SEEK=show, 4D_RESET=restore.

  // Build phase color lookup from task list
  function buildPhaseColors(tasks) {
    _guidPhaseColor = {};
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var color = PHASE_HEX[t.phase] || 0x888888;
      var guids = t.guids || [];
      for (var j = 0; j < guids.length; j++) {
        _guidPhaseColor[guids[j]] = color;
      }
    }
  }

  // Public API — called by main.js BroadcastChannel handler
  APP._ghostGlass = {
    play: function(tasks, speed) {
      // S240c §P1c: Wait for streaming to finish before applying glass
      function applyGlass() {
        buildGuidMap();
        snapshotMaterials();
        _tasks = tasks;
        buildPhaseColors(tasks);
        APP.collectMeshes(function(o) { return o.isMesh || o.isInstancedMesh; }).forEach(makeGlass);
        APP.markDirty();
        _state = 'PLAYING';
        _taskIndex = -1;
        console.log('§4D_GLASS_PLAY tasks=' + tasks.length);
      }
      if (APP.streamedCount > 0) { applyGlass(); return; }
      var retries = 0;
      function waitForStream() {
        if (APP.streamedCount > 0) { applyGlass(); return; }
        retries++;
        if (retries > 60) { console.warn('§4D_GLASS_WAIT timeout — no meshes after 60 frames'); applyGlass(); return; }
        requestAnimationFrame(waitForStream);
      }
      requestAnimationFrame(waitForStream);
    },

    pause: function() {
      _state = 'PAUSED';
      console.log('§4D_GLASS_PAUSE task=' + _taskIndex + '/' + _tasks.length);
    },

    resume: function(speed) {
      _state = 'PLAYING';
      console.log('§4D_GLASS_RESUME task=' + _taskIndex);
    },

    seek: function(taskIndex) {
      buildGuidMap();
      snapshotMaterials();
      if (_tasks.length) {
        buildPhaseColors(_tasks);
        seekTo(taskIndex);
      }
    },

    reset: function() {
      _state = 'IDLE';
      _tasks = [];
      _taskIndex = -1;
      restoreAll();
      APP.markDirty();
    },

    getState: function() { return _state; },
    getTaskIndex: function() { return _taskIndex; },
    getTaskCount: function() { return _tasks.length; }
  };

  console.log('§GHOSTGLASS_READY');
}
