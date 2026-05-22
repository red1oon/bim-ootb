/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// wizard_storeys.js — Storey detection & reclassification concern
// Extracted from wizard.js: band analysis, storey highlighting, walkthrough, rename/merge UI

(function() {
  'use strict';

  // ── Storey highlighting colors ──
  var STOREY_COLORS = [
    0x4488ff, 0xff8844, 0x44cc88, 0xcc44cc, 0xcccc44,
    0x44cccc, 0xff4488, 0x88ff44, 0x8844ff, 0xff8888,
  ];
  var _savedMaterials = [];  // [{mesh, origMaterial}] for reverting

  // ── Storey bands (same as semantic_enrichment.js) ──
  var STOREY_BANDS = [
    { min: -Infinity, max: -0.5,      name: 'Basement' },
    { min: -0.5,      max: 3.5,       name: 'Ground Floor' },
    { min: 3.5,       max: 6.5,       name: 'Level 1' },
    { min: 6.5,       max: 9.5,       name: 'Level 2' },
    { min: 9.5,       max: 12.5,      name: 'Level 3' },
    { min: 12.5,      max: Infinity,  name: 'Upper Levels' },
  ];

  function classifyStoreyZ(z) {
    for (var i = 0; i < STOREY_BANDS.length; i++) {
      if (z >= STOREY_BANDS[i].min && z < STOREY_BANDS[i].max) return STOREY_BANDS[i].name;
    }
    return 'Upper Levels';
  }

  // ── Re-classify storeys using Z-gap clustering ──
  // S234: Replaces fixed 3m bands with gap detection. Fixes Bug 6b (sign-flip
  // inversion) and Bug 6c (wrong storey count from equal bands).
  // heightAxis: 'z' (default, Z-up) or 'y' (Y-up OBJ before flip)
  function reclassifyStoreys(db, heightAxis) {
    try {
      var col = (heightAxis === 'y') ? 'center_y' : 'center_z';
      var r = db.exec("SELECT guid, " + col + " FROM element_transforms ORDER BY " + col);
      if (!r.length || !r[0].values.length) return;
      var rows = r[0].values;

      // 1. Round Z values to 0.1m, sort ascending (fixes Bug 6b -- always bottom-up)
      var zValues = rows.map(function(v) { return Math.round((v[1] || 0) * 10) / 10; });
      zValues.sort(function(a, b) { return a - b; });

      // 2. Find gap threshold -- median gap x 5 or 1.5m, whichever is larger
      var gaps = [];
      for (var i = 1; i < zValues.length; i++) gaps.push(zValues[i] - zValues[i - 1]);
      gaps.sort(function(a, b) { return a - b; });
      var medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0.1;
      var threshold = Math.max(1.5, medianGap * 5);

      // 3. Split into floors at gaps > threshold
      var floors = [{ minZ: zValues[0], maxZ: zValues[0] }];
      for (var i = 1; i < zValues.length; i++) {
        if (zValues[i] - zValues[i - 1] > threshold) {
          floors.push({ minZ: zValues[i], maxZ: zValues[i] });
        } else {
          floors[floors.length - 1].maxZ = zValues[i];
        }
      }
      // Cap at 10 floors
      if (floors.length > 10) floors = floors.slice(0, 10);

      // 4. Assign names bottom-up: Ground Floor, Level 1, Level 2...
      var stmt = db.prepare("UPDATE elements_meta SET storey = ? WHERE guid = ?");
      var assigned = 0;
      for (var i = 0; i < rows.length; i++) {
        var guid = rows[i][0];
        var z = Math.round((rows[i][1] || 0) * 10) / 10;
        for (var f = 0; f < floors.length; f++) {
          if (z >= floors[f].minZ - 0.05 && z <= floors[f].maxZ + 0.05) {
            var name = floors.length === 1 ? 'Ground Floor' :
              f === 0 ? 'Ground Floor' : 'Level ' + f;
            stmt.run([name, guid]);
            assigned++;
            break;
          }
        }
      }
      stmt.free();
      console.log('[S234] §WIZARD_RECLASSIFY_STOREYS count=' + assigned +
        ' floors=' + floors.length + ' threshold=' + threshold.toFixed(1) + 'm' +
        ' median_gap=' + medianGap.toFixed(2) + 'm');
    } catch(e) {
      console.log('[S234] §WIZARD_RECLASSIFY_ERR ' + e.message);
    }
  }

  function applyStoreyHighlight(db, wizState) {
    if (typeof APP === 'undefined' || !APP.scene) return;
    revertStoreyHighlight();

    // Build guid -> storey map
    var guidStorey = {};
    try {
      var r = db.exec("SELECT guid, storey FROM elements_meta WHERE storey IS NOT NULL");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          guidStorey[r[0].values[i][0]] = r[0].values[i][1];
        }
      }
    } catch(e) { return; }

    // Map storey names to color indices
    var storeyIdx = {};
    var storeys = wizState.analysis ? wizState.analysis.storeys : [];
    for (var s = 0; s < storeys.length; s++) {
      storeyIdx[storeys[s]] = s;
    }

    // Create materials per storey
    var storeyMats = {};
    for (var name in storeyIdx) {
      var ci = storeyIdx[name] % STOREY_COLORS.length;
      storeyMats[name] = new THREE.MeshStandardMaterial({
        color: STOREY_COLORS[ci],
        transparent: true,
        opacity: 0.85,
        roughness: 0.6,
      });
    }

    // Traverse scene and apply
    APP.scene.traverse(function(obj) {
      if (!obj.isMesh || !obj.userData.guid) return;
      var storey = guidStorey[obj.userData.guid];
      if (storey && storeyMats[storey]) {
        _savedMaterials.push({ mesh: obj, origMaterial: obj.material });
        obj.material = storeyMats[storey];
      }
    });

    console.log('[S230b] §WIZARD_STOREY_HIGHLIGHT applied=' + _savedMaterials.length + ' storeys=' + storeys.length);
  }

  function revertStoreyHighlight() {
    for (var i = 0; i < _savedMaterials.length; i++) {
      _savedMaterials[i].mesh.material = _savedMaterials[i].origMaterial;
    }
    if (_savedMaterials.length > 0) {
      console.log('[S230b] §WIZARD_STOREY_REVERT count=' + _savedMaterials.length);
    }
    _savedMaterials = [];
  }

  // ── S233: Storey toggle — cycle naming by shifting "Ground Floor" one band up ──
  var _groundOffset = 0;
  var _roofOn = false;

  function toggleStoreys(wizState, analyseDb, buildSteps, applyDisciplineColors, renderPanel) {
    var db = wizState.db;
    if (!db || !wizState.analysis) return;
    var storeys = wizState.analysis.storeys;
    var n = storeys.length;
    if (n <= 1) return;

    // Advance offset: 0 -> 1 -> 2 -> ... -> n-1 -> 0 (with roof flip at wrap)
    _groundOffset++;
    if (_groundOffset >= n) {
      _groundOffset = 0;
      _roofOn = !_roofOn;
    }

    // Sort storeys by elevation (lowest first)
    var sorted = storeys.slice().sort(function(a, b) {
      var ea = wizState.analysis.storeyElevations[a];
      var eb = wizState.analysis.storeyElevations[b];
      return (ea ? ea.minZ : 0) - (eb ? eb.minZ : 0);
    });

    // Two-phase rename to avoid cascade collisions (e.g. A→B then B→C catches A).
    // Phase 1: rename each changing storey to a unique temp name.
    // Phase 2: rename temp names to final names.
    var renames = [];
    for (var i = 0; i < sorted.length; i++) {
      var relIdx = i - _groundOffset;
      var newName;
      if (_roofOn && i === sorted.length - 1) {
        newName = 'Roof';
      } else if (relIdx < 0) {
        newName = relIdx === -1 ? 'Basement' : 'Basement ' + Math.abs(relIdx);
      } else if (relIdx === 0) {
        newName = 'Ground Floor';
      } else {
        newName = 'Level ' + relIdx;
      }
      if (newName !== sorted[i]) {
        renames.push({ from: sorted[i], tmp: '__wiz_tmp_' + i, to: newName });
      }
    }
    var tmpStmt = db.prepare("UPDATE elements_meta SET storey = ? WHERE storey = ?");
    for (var r = 0; r < renames.length; r++) tmpStmt.run([renames[r].tmp, renames[r].from]);
    tmpStmt.free();
    var finalStmt = db.prepare("UPDATE elements_meta SET storey = ? WHERE storey = ?");
    for (var r = 0; r < renames.length; r++) finalStmt.run([renames[r].to, renames[r].tmp]);
    finalStmt.free();

    var scheme = sorted.map(function(_, i) {
      var r = i - _groundOffset;
      if (_roofOn && i === sorted.length - 1) return 'Roof';
      return r < 0 ? (r === -1 ? 'B' : 'B' + Math.abs(r)) : r === 0 ? 'G' : 'L' + r;
    }).join(',');
    console.log('[S233] §WIZARD_STOREY_TOGGLE offset=' + _groundOffset + ' roof=' + _roofOn + ' scheme=' + scheme);

    // Re-analyse and re-render (colors update)
    wizState.analysis = analyseDb(db);
    wizState.steps = buildSteps(wizState.analysis);
    applyDisciplineColors(db);
    renderPanel();
  }

  // ── Storey edit — user corrects storey count ──
  function enterStoreyEdit(wizState, analyseDb, buildSteps, renderPanel) {
    var panel = document.getElementById('wizard-panel');
    if (!panel || !wizState.db || !wizState.analysis) return;
    var a = wizState.analysis;

    panel.querySelector('#wizard-question').textContent = 'How many storeys?';
    panel.querySelector('#wizard-evidence').innerHTML =
      'Height: 0.0m to ' + a.rangeZ.toFixed(1) + 'm (' + a.rangeZ.toFixed(1) + 'm total)<br>' +
      '<input id="wiz-storey-count" type="number" min="1" max="20" value="' + a.storeys.length + '" ' +
        'style="width:60px;padding:6px;background:rgba(0,0,0,0.3);color:#ffe0a0;border:1px solid rgba(255,191,0,0.2);border-radius:4px;font-size:14px;text-align:center;margin-top:8px">';
    panel.querySelector('#wizard-buttons').innerHTML =
      '<button class="wizard-yes" onclick="window._wizApplyStoreyEdit()">Apply</button>' +
      '<button class="wizard-no" onclick="window._wizardAnswer(true)">Cancel</button>';

    console.log('[S230b] §WIZARD_STOREY_EDIT current=' + a.storeys.length);
  }

  function applyStoreyEdit(wizState, analyseDb, buildSteps, renderPanel) {
    var input = document.getElementById('wiz-storey-count');
    if (!input || !wizState.db || !wizState.analysis) return;
    var n = parseInt(input.value) || 1;
    if (n < 1) n = 1;
    if (n > 20) n = 20;

    var db = wizState.db;
    var col = wizState._heightAxis === 'y' ? 'center_y' : 'center_z';
    var hRng = db.exec("SELECT MIN(" + col + "), MAX(" + col + ") FROM element_transforms");
    var hMin = (hRng.length && hRng[0].values[0][0]) || 0;
    var hMax = (hRng.length && hRng[0].values[0][1]) || 0;
    var totalHeight = hMax - hMin;
    if (totalHeight <= 0) totalHeight = 3;
    var bandHeight = totalHeight / n;

    try {
      // Reset all elements to 'Ground Floor' first — catches elements without transform entries
      db.run("UPDATE elements_meta SET storey = 'Ground Floor'");
      var r = db.exec("SELECT t.guid, t." + col + " FROM element_transforms t");
      if (!r.length) return;
      var stmt = db.prepare("UPDATE elements_meta SET storey = ? WHERE guid = ?");
      for (var i = 0; i < r[0].values.length; i++) {
        var guid = r[0].values[i][0];
        var z = r[0].values[i][1] || 0;
        var band = Math.floor((z - hMin) / bandHeight);
        if (band >= n) band = n - 1;
        if (band < 0) band = 0;
        var storeyName = n === 1 ? 'Ground Floor' :
          band === 0 ? 'Ground Floor' : 'Level ' + band;
        stmt.run([storeyName, guid]);
      }
      stmt.free();
      console.log('[S230b] §WIZARD_STOREY_REBAND count=' + n + ' bandHeight=' + bandHeight.toFixed(1) + 'm');
    } catch(e) {
      console.log('[S230b] §WIZARD_STOREY_REBAND_ERR ' + e.message);
    }

    wizState.analysis = analyseDb(db);
    wizState.steps = buildSteps(wizState.analysis);
    renderPanel();
  }

  // ── S233: Storey rename — editable names + merge adjacent ──
  function enterStoreyRename(wizState, analyseDb, buildSteps, applyDisciplineColors) {
    var panel = document.getElementById('wizard-panel');
    if (!panel || !wizState.db || !wizState.analysis) return;
    var storeys = wizState.analysis.storeys;

    panel.querySelector('#wizard-question').textContent = 'Rename storeys or merge adjacent floors';

    var html = '';
    for (var i = 0; i < storeys.length; i++) {
      var s = storeys[i];
      var color = '#' + (STOREY_COLORS[i % STOREY_COLORS.length]).toString(16).padStart(6, '0');
      var elev = wizState.analysis.storeyElevations[s];
      var range = elev ? elev.minZ.toFixed(1) + '\u2013' + elev.maxZ.toFixed(1) + 'm' : '';
      var cnt = wizState.analysis.storeyCounts[s] || 0;
      html += '<div style="display:flex;align-items:center;gap:6px;margin:3px 0">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
        '<input class="wiz-storey-name" data-old="' + s.replace(/"/g, '&quot;') + '" value="' + s.replace(/"/g, '&quot;') + '" ' +
          'style="flex:1;padding:4px 6px;background:rgba(0,0,0,0.3);color:#ffe0a0;border:1px solid rgba(255,191,0,0.2);border-radius:3px;font-size:12px">' +
        '<span style="font-size:10px;color:#ccc">' + range + ' (' + cnt + ')</span>';
      if (i < storeys.length - 1) {
        html += '<button class="wiz-merge-btn" data-idx="' + i + '" onclick="window._wizMergeStoreys(' + i + ')" ' +
          'style="padding:2px 6px;font-size:10px;background:rgba(255,191,0,0.15);color:#ffe0a0;border:1px solid rgba(255,191,0,0.3);border-radius:3px;cursor:pointer" ' +
          'title="Merge with floor below">\u2193 merge</button>';
      }
      html += '</div>';
    }
    panel.querySelector('#wizard-evidence').innerHTML = html;
    panel.querySelector('#wizard-buttons').innerHTML =
      '<button class="wizard-yes" onclick="window._wizApplyStoreyRename()">Apply</button>' +
      '<button class="wizard-no" onclick="window._wizardAnswer(true)">Cancel</button>';

    console.log('[S233] §WIZARD_STOREY_RENAME_ENTER storeys=' + storeys.length);
  }

  function applyStoreyRename(wizState, analyseDb, buildSteps, applyDisciplineColors, renderPanel) {
    var db = wizState.db;
    if (!db) return;
    var inputs = document.querySelectorAll('.wiz-storey-name');
    var renamed = 0;
    var stmt = db.prepare("UPDATE elements_meta SET storey = ? WHERE storey = ?");
    for (var i = 0; i < inputs.length; i++) {
      var oldName = inputs[i].getAttribute('data-old');
      var newName = inputs[i].value.trim();
      if (newName && newName !== oldName) {
        stmt.run([newName, oldName]);
        renamed++;
        console.log('[S233] §WIZARD_STOREY_RENAME "' + oldName + '" \u2192 "' + newName + '"');
      }
    }
    stmt.free();
    console.log('[S233] §WIZARD_STOREY_RENAME_APPLY renamed=' + renamed);

    wizState.analysis = analyseDb(db);
    wizState.steps = buildSteps(wizState.analysis);
    applyDisciplineColors(db);
    renderPanel();
  }

  function mergeStoreys(idx, wizState, analyseDb, buildSteps, applyDisciplineColors) {
    var db = wizState.db;
    if (!db || !wizState.analysis) return;
    var storeys = wizState.analysis.storeys;
    if (idx < 0 || idx >= storeys.length - 1) return;
    var keepName = storeys[idx];
    var mergeName = storeys[idx + 1];
    db.run("UPDATE elements_meta SET storey = ? WHERE storey = ?", [keepName, mergeName]);
    console.log('[S233] §WIZARD_STOREY_MERGE "' + mergeName + '" into "' + keepName + '"');

    wizState.analysis = analyseDb(db);
    wizState.steps = buildSteps(wizState.analysis);
    applyDisciplineColors(db);
    enterStoreyRename(wizState, analyseDb, buildSteps, applyDisciplineColors);
  }

  // ── Storey walkthrough — show one floor at a time ──
  var _walkState = { active: false, idx: 0, storeys: [], hiddenMeshes: [] };

  function enterStoreyWalk(wizState) {
    if (typeof APP === 'undefined' || !APP.scene || !wizState.analysis) return;
    var storeys = wizState.analysis.storeys;
    if (storeys.length < 2) return;

    _walkState.active = true;
    _walkState.idx = 0;
    _walkState.storeys = storeys;
    _walkState.hiddenMeshes = [];

    console.log('[S230b] §WIZARD_STOREY_WALK_START floors=' + storeys.length);
    showWalkFloor(0, wizState);
  }

  function showWalkFloor(idx, wizState) {
    if (!wizState.db || !wizState.analysis) return;
    var storeys = _walkState.storeys;
    var targetStorey = storeys[idx];

    // Build guid->storey map
    var guidStorey = {};
    try {
      var r = wizState.db.exec("SELECT guid, storey FROM elements_meta WHERE storey IS NOT NULL");
      if (r.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          guidStorey[r[0].values[i][0]] = r[0].values[i][1];
        }
      }
    } catch(e) { return; }

    // Show only meshes belonging to target storey, hide others
    _walkState.hiddenMeshes = [];
    APP.scene.traverse(function(obj) {
      if (!obj.isMesh || !obj.userData.guid) return;
      var s = guidStorey[obj.userData.guid];
      if (s && s !== targetStorey) {
        if (obj.visible) {
          _walkState.hiddenMeshes.push(obj);
          obj.visible = false;
        }
      } else {
        obj.visible = true;
      }
    });

    // Update panel
    var panel = document.getElementById('wizard-panel');
    if (!panel) return;
    var elev = wizState.analysis.storeyElevations[targetStorey];
    var range = elev ? elev.minZ.toFixed(1) + '\u2013' + elev.maxZ.toFixed(1) + 'm' : '';
    var cnt = wizState.analysis.storeyCounts[targetStorey] || 0;
    var ci = idx % STOREY_COLORS.length;
    var color = '#' + STOREY_COLORS[ci].toString(16).padStart(6, '0');

    panel.querySelector('#wizard-question').textContent =
      'Floor ' + (idx + 1) + '/' + storeys.length + ': ' + targetStorey;
    panel.querySelector('#wizard-evidence').innerHTML =
      '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle"></span>' +
      range + ' (' + cnt + ' elements)';

    var prevBtn = idx > 0
      ? '<button class="wizard-alt" onclick="window._wizWalkPrev()">Prev</button>' : '';
    var nextBtn = idx < storeys.length - 1
      ? '<button class="wizard-yes" onclick="window._wizWalkNext()">Next</button>'
      : '<button class="wizard-yes" onclick="window._wizWalkDone()">Done</button>';
    panel.querySelector('#wizard-buttons').innerHTML = prevBtn + nextBtn;

    console.log('[S230b] §WIZARD_STOREY_WALK floor=' + (idx + 1) + ' name=' + targetStorey + ' elements=' + cnt);
  }

  function restoreWalkVisibility() {
    for (var i = 0; i < _walkState.hiddenMeshes.length; i++) {
      _walkState.hiddenMeshes[i].visible = true;
    }
    _walkState.hiddenMeshes = [];
  }

  function walkNext(wizState) {
    restoreWalkVisibility();
    _walkState.idx++;
    showWalkFloor(_walkState.idx, wizState);
  }

  function walkPrev(wizState) {
    restoreWalkVisibility();
    _walkState.idx--;
    showWalkFloor(_walkState.idx, wizState);
  }

  function walkDone(wizState, renderPanel) {
    restoreWalkVisibility();
    _walkState.active = false;
    console.log('[S230b] §WIZARD_STOREY_WALK_DONE');
    renderPanel();
  }

  // ── Build storey evidence HTML with colored legend dots ──
  function buildStoreyEvidenceHtml(wizState) {
    var storeys = wizState.analysis.storeys;
    return storeys.map(function(s, i) {
      var color = '#' + (STOREY_COLORS[i % STOREY_COLORS.length]).toString(16).padStart(6, '0');
      var elev = wizState.analysis.storeyElevations[s];
      var range = elev ? elev.minZ.toFixed(1) + '\u2013' + elev.maxZ.toFixed(1) + 'm' : '';
      var cnt = wizState.analysis.storeyCounts[s] || 0;
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:5px;vertical-align:middle"></span>' +
        s + (range ? ' [' + range + ']' : '') + ' (' + cnt + ' el)';
    }).join('<br>');
  }

  // ── Init ──
  function init(wizState) {
    // Nothing to initialize at startup; functions are called on demand
  }

  // ── Public namespace ──
  window.WizardStoreys = {
    init: init,
    STOREY_COLORS: STOREY_COLORS,
    STOREY_BANDS: STOREY_BANDS,
    classifyStoreyZ: classifyStoreyZ,
    reclassifyStoreys: reclassifyStoreys,
    applyStoreyHighlight: applyStoreyHighlight,
    revertStoreyHighlight: revertStoreyHighlight,
    toggleStoreys: toggleStoreys,
    enterStoreyEdit: enterStoreyEdit,
    applyStoreyEdit: applyStoreyEdit,
    enterStoreyRename: enterStoreyRename,
    applyStoreyRename: applyStoreyRename,
    mergeStoreys: mergeStoreys,
    enterStoreyWalk: enterStoreyWalk,
    walkNext: walkNext,
    walkPrev: walkPrev,
    walkDone: walkDone,
    buildStoreyEvidenceHtml: buildStoreyEvidenceHtml,
  };

})();
