/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// wizard_classify.js — Classification pooling & discipline coloring concern
// Extracted from wizard.js: element pool, guess rendering, material application,
// discipline color assignment, picker mode

(function() {
  'use strict';

  // ── Discipline colors (shared across all highlighting) ──
  var DISC_COLORS = {
    ARC: 0x4488ff, STR: 0x44cccc, MEP: 0x44cc44,
    ELEC: 0xcccc44, FP: 0xcc8844, ACMV: 0xcc4444, PLB: 0x8844cc,
  };
  var DEFAULT_DISC_COLOR = 0x888888;

  // ── IFC class list for picker dropdown ──
  var IFC_CLASSES = [
    'IfcWall', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcRoof', 'IfcCovering',
    'IfcStairFlight', 'IfcRailing', 'IfcRamp', 'IfcCurtainWall',
    'IfcColumn', 'IfcBeam', 'IfcFooting', 'IfcPile',
    'IfcPipeSegment', 'IfcSanitaryTerminal', 'IfcDuctSegment',
    'IfcCableSegment', 'IfcLightFixture', 'IfcOutlet', 'IfcElectricAppliance',
    'IfcFireSuppressionTerminal', 'IfcFurnishingElement',
    'IfcBuildingElementProxy',
  ];

  var _baseMaterials = [];   // [{mesh, origMaterial}] for discipline base colors

  // ── Apply discipline-based base colors to all meshes ──
  function applyDisciplineColors(db) {
    if (typeof APP === 'undefined' || !APP.scene) return;
    revertDisciplineColors();

    var guidDisc = {};
    try {
      var r = db.exec("SELECT guid, discipline FROM elements_meta");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          guidDisc[r[0].values[i][0]] = r[0].values[i][1];
        }
      }
    } catch(e) { return; }

    var discMats = {};
    for (var d in DISC_COLORS) {
      discMats[d] = new THREE.MeshStandardMaterial({
        color: DISC_COLORS[d], roughness: 0.7, metalness: 0.1,
      });
    }
    var defaultMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_DISC_COLOR, roughness: 0.7, metalness: 0.1,
    });

    APP.scene.traverse(function(obj) {
      if (!obj.isMesh || !obj.userData.guid) return;
      var disc = guidDisc[obj.userData.guid];
      var mat = disc ? (discMats[disc] || defaultMat) : defaultMat;
      _baseMaterials.push({ mesh: obj, origMaterial: obj.material });
      obj.material = mat;
    });

    console.log('[S230b] §WIZARD_DISC_COLORS applied=' + _baseMaterials.length);
  }

  function revertDisciplineColors() {
    for (var i = 0; i < _baseMaterials.length; i++) {
      _baseMaterials[i].mesh.material = _baseMaterials[i].origMaterial;
    }
    _baseMaterials = [];
  }

  // ── S234: Draining-pool element classification ──
  var CLASSIFY_TYPES = [
    { type: 'Wall',    ifcClass: 'IfcWall',    disc: 'ARC', color: 0x4488ff,
      test: function(w, h, d) { return h > 2 * Math.max(w, d) && Math.min(w, d) < 0.5; },
      reason: 'tall, thin, vertical' },
    { type: 'Slab',    ifcClass: 'IfcSlab',    disc: 'ARC', color: 0x888888,
      test: function(w, h, d) { return h < 0.5 && w * d > 5; },
      reason: 'flat, wide footprint' },
    { type: 'Column',  ifcClass: 'IfcColumn',  disc: 'STR', color: 0x44bb44,
      test: function(w, h, d) { return h > 2 && w < 0.5 && d < 0.5; },
      reason: 'tall, narrow' },
    { type: 'Roof',    ifcClass: 'IfcRoof',    disc: 'ARC', color: 0xbb6622,
      test: function(w, h, d, z, maxZ) { return z > maxZ * 0.7 && w * d > 3; },
      reason: 'top elevation, wide' },
    { type: 'Beam',    ifcClass: 'IfcBeam',    disc: 'STR', color: 0xcc8844,
      test: function(w, h, d) {
        var dims = [w, h, d].sort(function(a, b) { return b - a; });
        return dims[0] > 3 * dims[1] && h > 0.5;
      },
      reason: 'horizontal, elongated' },
  ];

  var _classPool = [];      // [{guid, w, h, d, z}] -- unclassified elements
  var _classGuesses = [];   // [{type, ifcClass, disc, color, guids, reason}]
  var _classIdx = 0;        // current guess index
  var _classHighlighted = [];  // [{mesh, origMaterial}] for reverting classify highlight

  // Compute per-element bbox dimensions from component_geometries vertices BLOB
  function computeElementBboxes(db) {
    var bboxes = {};
    try {
      var hashBbox = {};
      var r = db.exec("SELECT geometry_hash, vertices FROM component_geometries WHERE vertices IS NOT NULL");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var hash = r[0].values[i][0];
          var blob = r[0].values[i][1];
          if (!blob || blob.length < 12) continue;
          var verts = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
          var minX = Infinity, maxX = -Infinity;
          var minY = Infinity, maxY = -Infinity;
          var minZ = Infinity, maxZ = -Infinity;
          for (var j = 0; j < verts.length; j += 3) {
            if (verts[j] < minX) minX = verts[j];
            if (verts[j] > maxX) maxX = verts[j];
            if (verts[j + 1] < minY) minY = verts[j + 1];
            if (verts[j + 1] > maxY) maxY = verts[j + 1];
            if (verts[j + 2] < minZ) minZ = verts[j + 2];
            if (verts[j + 2] > maxZ) maxZ = verts[j + 2];
          }
          hashBbox[hash] = {
            w: maxX - minX,
            h: maxY - minY,
            d: maxZ - minZ,
          };
        }
      }
      r = db.exec("SELECT ei.guid, ei.geometry_hash, t.center_z FROM element_instances ei JOIN element_transforms t ON t.guid = ei.guid");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var guid = r[0].values[i][0];
          var hash = r[0].values[i][1];
          var z = r[0].values[i][2] || 0;
          var bb = hashBbox[hash];
          if (bb) {
            bboxes[guid] = { w: bb.w, h: bb.h, d: bb.d, z: z };
          }
        }
      }
    } catch(e) {
      console.log('[S234] §CLASSIFY_BBOX_ERR ' + e.message);
    }
    return bboxes;
  }

  // Run all heuristics on pool, return sorted guesses
  function classifyPool(pool, maxZ) {
    var guesses = [];
    for (var t = 0; t < CLASSIFY_TYPES.length; t++) {
      var ct = CLASSIFY_TYPES[t];
      var matched = [];
      for (var i = 0; i < pool.length; i++) {
        var el = pool[i];
        if (ct.test(el.w, el.h, el.d, el.z, maxZ)) {
          matched.push(el.guid);
        }
      }
      if (matched.length > 0) {
        guesses.push({
          type: ct.type,
          ifcClass: ct.ifcClass,
          disc: ct.disc,
          color: ct.color,
          guids: matched,
          reason: ct.reason,
          confidence: matched.length,
        });
      }
    }
    guesses.sort(function(a, b) { return b.confidence - a.confidence; });
    return guesses;
  }

  // Apply highlight to guessed elements, dim everything else
  function applyClassifyHighlight(guids, color) {
    revertClassifyHighlight();
    if (typeof APP === 'undefined' || !APP.scene) return;

    var guidSet = {};
    for (var i = 0; i < guids.length; i++) guidSet[guids[i]] = true;

    var hlMat = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.5, metalness: 0.1,
    });
    var dimMat = new THREE.MeshStandardMaterial({
      color: 0x333333, transparent: true, opacity: 0.2, roughness: 1.0,
    });

    APP.scene.traverse(function(obj) {
      if (!obj.isMesh || !obj.userData.guid) return;
      _classHighlighted.push({ mesh: obj, origMaterial: obj.material });
      obj.material = guidSet[obj.userData.guid] ? hlMat : dimMat;
    });
  }

  function revertClassifyHighlight() {
    for (var i = 0; i < _classHighlighted.length; i++) {
      _classHighlighted[i].mesh.material = _classHighlighted[i].origMaterial;
    }
    _classHighlighted = [];
  }

  // Initialize the classify step -- build pool from unclassified elements
  function initClassifyPool(wizState) {
    var db = wizState.db;
    if (!db) return;

    var proxyGuids = {};
    try {
      var r = db.exec("SELECT guid FROM elements_meta WHERE ifc_class = 'IfcBuildingElementProxy' OR ifc_class IS NULL");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) proxyGuids[r[0].values[i][0]] = true;
      }
    } catch(e) { return; }

    var bboxes = computeElementBboxes(db);
    _classPool = [];
    for (var guid in proxyGuids) {
      var bb = bboxes[guid];
      if (bb) {
        _classPool.push({ guid: guid, w: bb.w, h: bb.h, d: bb.d, z: bb.z });
      }
    }

    var maxZ = wizState.analysis ? wizState.analysis.maxZ : 0;
    _classGuesses = classifyPool(_classPool, maxZ);
    _classIdx = 0;

    console.log('[S234] §CLASSIFY_INIT pool=' + _classPool.length +
      ' guesses=' + _classGuesses.length +
      (_classGuesses.length > 0 ? ' best=' + _classGuesses[0].type + '(' + _classGuesses[0].guids.length + ')' : ''));
  }

  // Render the current classify guess
  function renderClassifyStep(wizState, advanceStep) {
    var panel = document.getElementById('wizard-panel');
    if (!panel) return;

    if (_classPool.length === 0 || _classGuesses.length === 0) {
      if (_classPool.length > 0) {
        markRemainingUnknown(wizState);
      }
      revertClassifyHighlight();
      advanceStep();
      return;
    }

    var guess = _classGuesses[_classIdx % _classGuesses.length];
    var colorHex = '#' + guess.color.toString(16).padStart(6, '0');

    panel.querySelector('#wizard-question').innerHTML =
      guess.guids.length + ' elements look like <b style="color:' + colorHex + '">' + guess.type + 's</b>';
    panel.querySelector('#wizard-evidence').innerHTML =
      '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + colorHex + ';margin-right:6px;vertical-align:middle"></span>' +
      guess.reason + '<br>' +
      '<span style="font-size:10px;color:#888">' + _classPool.length + ' unclassified remaining</span>';
    panel.querySelector('#wizard-buttons').innerHTML =
      '<button class="wizard-yes" onclick="window._wizClassifyYes()">Yes</button>' +
      '<button class="wizard-alt" onclick="window._wizClassifyToggle()">Toggle</button>';

    applyClassifyHighlight(guess.guids, guess.color);
  }

  // Yes -- confirm current guess, drain pool, save immediately
  function classifyYes(wizState, analyseDb, advanceStep) {
    if (_classGuesses.length === 0) return;
    var guess = _classGuesses[_classIdx % _classGuesses.length];
    var db = wizState.db;
    if (!db) return;

    var stmt = db.prepare("UPDATE elements_meta SET ifc_class = ?, discipline = ? WHERE guid = ?");
    for (var i = 0; i < guess.guids.length; i++) {
      stmt.run([guess.ifcClass, guess.disc, guess.guids[i]]);
    }
    stmt.free();

    console.log('[S234] §CLASSIFY_YES type=' + guess.type + ' count=' + guess.guids.length +
      ' class=' + guess.ifcClass + ' disc=' + guess.disc);

    var confirmed = {};
    for (var i = 0; i < guess.guids.length; i++) confirmed[guess.guids[i]] = true;
    _classPool = _classPool.filter(function(el) { return !confirmed[el.guid]; });

    saveClassifyProgress(wizState);

    var maxZ = wizState.analysis ? wizState.analysis.maxZ : 0;
    _classGuesses = classifyPool(_classPool, maxZ);
    _classIdx = 0;

    wizState.analysis = analyseDb(db);

    renderClassifyStep(wizState, advanceStep);
  }

  // Toggle -- cycle to next guess type
  function classifyToggle(wizState, advanceStep) {
    if (_classGuesses.length === 0) return;
    _classIdx++;
    if (_classIdx >= _classGuesses.length) {
      console.log('[S234] §CLASSIFY_TOGGLE_EXHAUSTED all types cycled, remaining=' + _classPool.length);
      markRemainingUnknown(wizState);
      revertClassifyHighlight();
      advanceStep();
      return;
    }
    console.log('[S234] §CLASSIFY_TOGGLE idx=' + _classIdx + ' type=' + _classGuesses[_classIdx].type);
    renderClassifyStep(wizState, advanceStep);
  }

  function markRemainingUnknown(wizState) {
    var db = wizState.db;
    if (!db || _classPool.length === 0) return;
    var stmt = db.prepare("UPDATE elements_meta SET discipline = 'ARC' WHERE guid = ? AND (discipline IS NULL OR discipline = '')");
    for (var i = 0; i < _classPool.length; i++) {
      stmt.run([_classPool[i].guid]);
    }
    stmt.free();
    _classPool = [];
    saveClassifyProgress(wizState);
    console.log('[S234] §CLASSIFY_REMAINING_UNKNOWN');
  }

  // Save DB to IndexedDB after each Yes (incremental, crash-safe)
  function saveClassifyProgress(wizState) {
    var db = wizState.db;
    var projectKey = wizState.projectKey;
    if (!db || !projectKey) return;
    try {
      var dbData = db.export();
      var dbBuf = dbData.buffer;
      var req = indexedDB.open('bim_ootb_imports', 2);
      req.onsuccess = function() {
        var idb = req.result;
        if (!idb.objectStoreNames.contains('buildings')) return;
        var tx = idb.transaction('buildings', 'readwrite');
        var store = tx.objectStore('buildings');
        var getReq = store.get(projectKey);
        getReq.onsuccess = function() {
          var record = getReq.result;
          if (record && record.versions) {
            record.versions[record.latestVersion || 0].db = dbBuf;
            store.put(record, projectKey);
          }
        };
        tx.oncomplete = function() {
          console.log('[S234] §CLASSIFY_SAVE key=' + projectKey);
        };
      };
    } catch(e) {
      console.log('[S234] §CLASSIFY_SAVE_ERR ' + e.message);
    }
  }

  // ── Picker mode — click mesh to reassign disc/class ──
  var _pickerActive = false;
  var _pickerClickHandler = null;

  var DISC_TO_CLASSES = {
    ARC:  ['IfcWall','IfcDoor','IfcWindow','IfcSlab','IfcRoof','IfcCovering','IfcStairFlight','IfcRailing','IfcRamp','IfcCurtainWall','IfcFurnishingElement'],
    STR:  ['IfcColumn','IfcBeam','IfcFooting','IfcPile','IfcSlab'],
    MEP:  ['IfcPipeSegment','IfcDuctSegment','IfcCableSegment'],
    ELEC: ['IfcCableSegment','IfcLightFixture','IfcOutlet','IfcElectricAppliance'],
    PLB:  ['IfcPipeSegment','IfcSanitaryTerminal'],
    ACMV: ['IfcDuctSegment'],
    FP:   ['IfcFireSuppressionTerminal'],
    NONE: ['IfcBuildingElementProxy'],
  };

  function enterPickerMode(wizState, advanceStep) {
    _pickerActive = true;
    var panel = document.getElementById('wizard-panel');
    if (panel) {
      panel.querySelector('#wizard-question').textContent = 'Click any element to inspect';
      panel.querySelector('#wizard-evidence').innerHTML = 'Click a mesh in the 3D view.<br>Its classification will appear here.';
      panel.querySelector('#wizard-buttons').innerHTML =
        '<button class="wizard-no" onclick="window._wizardExitPicker()">Done</button>';
    }
    console.log('[S230b] §WIZARD_PICKER_ENTER');

    if (typeof APP !== 'undefined' && APP.canvas) {
      _pickerClickHandler = function(e) { handlePickerClick(e, wizState); };
      APP.canvas.addEventListener('pointerup', _pickerClickHandler);
    }

    // Store advanceStep for exit
    _pickerAdvanceStep = advanceStep;
  }

  var _pickerAdvanceStep = null;

  function exitPicker() {
    _pickerActive = false;
    if (_pickerClickHandler && typeof APP !== 'undefined' && APP.canvas) {
      APP.canvas.removeEventListener('pointerup', _pickerClickHandler);
      _pickerClickHandler = null;
    }
    if (window._wizPickHL) {
      window._wizPickHL.parent.remove(window._wizPickHL);
      window._wizPickHL = null;
    }
    console.log('[S230b] §WIZARD_PICKER_EXIT');
    if (_pickerAdvanceStep) _pickerAdvanceStep();
  }

  function handlePickerClick(e, wizState) {
    if (!_pickerActive || !wizState.db) return;
    if (typeof APP === 'undefined' || !APP.scene || !APP.camera) return;

    var mouse = new THREE.Vector2();
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, APP.camera);

    var meshes = [];
    APP.scene.traverse(function(o) { if (o.isMesh && o.visible) meshes.push(o); });
    var hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;

    var mesh = hits[0].object;
    var guid = (APP.guidMap && APP.guidMap[mesh.id]) || mesh.userData.guid;
    if (!guid) return;

    if (window._wizPickHL) {
      window._wizPickHL.parent.remove(window._wizPickHL);
      window._wizPickHL = null;
    }
    mesh.geometry.computeBoundingBox();
    var bb = mesh.geometry.boundingBox;
    var sz = new THREE.Vector3(); bb.getSize(sz);
    var ct = new THREE.Vector3(); bb.getCenter(ct);
    var hlGeo = new THREE.BoxGeometry(sz.x, sz.y, sz.z);
    var hlEdges = new THREE.EdgesGeometry(hlGeo);
    var hlLine = new THREE.LineSegments(hlEdges, A._bboxMaterial || new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2, depthTest: false }));
    hlLine.position.copy(ct);
    mesh.add(hlLine);
    window._wizPickHL = hlLine;

    try {
      var r = wizState.db.exec("SELECT element_name, ifc_class, discipline, storey FROM elements_meta WHERE guid = '" + guid + "'");
      if (!r.length || !r[0].values.length) return;
      var row = r[0].values[0];
      var elName = row[0] || 'Unknown';
      var curClass = row[1] || 'IfcBuildingElementProxy';
      var curDisc = row[2] || 'ARC';
      var curStorey = row[3] || '';

      showPickerPanel(guid, elName, curClass, curDisc, curStorey, wizState);
    } catch(ex) {
      console.log('[S230b] §WIZARD_PICKER_ERR ' + ex.message);
    }
  }

  function showPickerPanel(guid, elName, curClass, curDisc, curStorey, wizState) {
    var panel = document.getElementById('wizard-panel');
    if (!panel) return;

    var discOpts = Object.keys(DISC_TO_CLASSES).map(function(d) {
      var sel = (d === curDisc) ? ' selected' : '';
      return '<option value="' + d + '"' + sel + '>' + d + '</option>';
    }).join('');

    var classOpts = buildClassOptions(curDisc, curClass);

    panel.querySelector('#wizard-question').innerHTML =
      '<span style="font-size:13px;color:#ffe0a0">' + elName + '</span>';
    panel.querySelector('#wizard-evidence').innerHTML =
      '<span style="color:#888">Storey:</span> ' + (curStorey || '\u2014') + '<br>' +
      '<div style="margin-top:8px">' +
        '<label style="font-size:11px;color:#888">Discipline</label>' +
        '<select id="wiz-disc-sel" onchange="window._wizDiscChanged()" style="width:100%;padding:6px;background:rgba(0,0,0,0.3);color:#ffe0a0;border:1px solid rgba(255,191,0,0.2);border-radius:4px;font-size:12px;margin:4px 0">' + discOpts + '</select>' +
      '</div>' +
      '<div>' +
        '<label style="font-size:11px;color:#888">IFC Class</label>' +
        '<select id="wiz-class-sel" style="width:100%;padding:6px;background:rgba(0,0,0,0.3);color:#ffe0a0;border:1px solid rgba(255,191,0,0.2);border-radius:4px;font-size:12px;margin:4px 0">' + classOpts + '</select>' +
      '</div>';
    panel.querySelector('#wizard-buttons').innerHTML =
      '<button class="wizard-yes" onclick="window._wizPickerApply(\'' + guid + '\')">Apply</button>' +
      '<button class="wizard-no" onclick="window._wizardExitPicker()">Done</button>';

    wizState._pickerGuid = guid;
  }

  function buildClassOptions(disc, curClass) {
    var classes = DISC_TO_CLASSES[disc] || ['IfcBuildingElementProxy'];
    return classes.map(function(c) {
      var sel = (c === curClass) ? ' selected' : '';
      var label = c.replace('Ifc', '');
      return '<option value="' + c + '"' + sel + '>' + label + '</option>';
    }).join('');
  }

  function discChanged() {
    var discSel = document.getElementById('wiz-disc-sel');
    var classSel = document.getElementById('wiz-class-sel');
    if (!discSel || !classSel) return;
    var disc = discSel.value;
    classSel.innerHTML = buildClassOptions(disc, '');
  }

  function pickerApply(guid, wizState, analyseDb) {
    if (!wizState.db) return;
    var discSel = document.getElementById('wiz-disc-sel');
    var classSel = document.getElementById('wiz-class-sel');
    if (!discSel || !classSel) return;

    var newDisc = discSel.value;
    var newClass = classSel.value;

    wizState.db.run("UPDATE elements_meta SET discipline = ?, ifc_class = ? WHERE guid = ?",
      [newDisc === 'NONE' ? null : newDisc, newClass, guid]);

    console.log('[S230b] §WIZARD_PICKER_APPLY guid=' + guid + ' disc=' + newDisc + ' class=' + newClass);

    applyDisciplineColors(wizState.db);
    wizState.analysis = analyseDb(wizState.db);

    var panel = document.getElementById('wizard-panel');
    if (panel) {
      panel.querySelector('#wizard-question').textContent = 'Updated. Click another element or Done.';
      panel.querySelector('#wizard-evidence').innerHTML =
        'Changed to <b>' + newDisc + ' / ' + newClass.replace('Ifc','') + '</b>';
      panel.querySelector('#wizard-buttons').innerHTML =
        '<button class="wizard-no" onclick="window._wizardExitPicker()">Done</button>';
    }
  }

  // ── Cleanup on wizard finish ──
  function cleanup() {
    revertClassifyHighlight();
    if (_pickerActive) {
      _pickerActive = false;
      if (_pickerClickHandler && typeof APP !== 'undefined' && APP.canvas) {
        APP.canvas.removeEventListener('pointerup', _pickerClickHandler);
        _pickerClickHandler = null;
      }
    }
    if (window._wizPickHL) {
      window._wizPickHL.parent.remove(window._wizPickHL);
      window._wizPickHL = null;
    }
  }

  // ── Init ──
  function init(wizState) {
    // Nothing to initialize at startup; functions are called on demand
  }

  // ── Public namespace ──
  window.WizardClassify = {
    init: init,
    DISC_COLORS: DISC_COLORS,
    DEFAULT_DISC_COLOR: DEFAULT_DISC_COLOR,
    IFC_CLASSES: IFC_CLASSES,
    applyDisciplineColors: applyDisciplineColors,
    revertDisciplineColors: revertDisciplineColors,
    initClassifyPool: initClassifyPool,
    renderClassifyStep: renderClassifyStep,
    classifyYes: classifyYes,
    classifyToggle: classifyToggle,
    revertClassifyHighlight: revertClassifyHighlight,
    enterPickerMode: enterPickerMode,
    exitPicker: exitPicker,
    discChanged: discChanged,
    pickerApply: pickerApply,
    cleanup: cleanup,
  };

})();
