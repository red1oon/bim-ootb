/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// wizard.js — S229: Guided Classification Wizard for non-IFC mesh imports
// Implementing S228_drop_zone_multi_format.md §S229 — Witness: W-WIZARD
// Trigger: mesh import completion (not IFC). Amber panel, one question at a time.
// Dependencies: sql.js (already loaded by import flow), semantic_enrichment.js
// Sub-modules: wizard_orientation.js, wizard_storeys.js, wizard_classify.js

(function() {
  'use strict';

  // ── CSS injection ──
  var style = document.createElement('style');
  style.textContent = [
    '#wizard-panel {',
    '  position: fixed; top: 50%; right: 24px; transform: translateY(-50%);',
    '  z-index: 50; min-width: 320px; max-width: 420px;',
    '  background: rgba(45, 35, 10, 0.55); backdrop-filter: blur(12px);',
    '  -webkit-backdrop-filter: blur(12px);',
    '  border: 1px solid rgba(255, 191, 0, 0.25); border-radius: 16px;',
    '  padding: 20px 24px; font-family: "Segoe UI", system-ui, sans-serif;',
    '  color: #ffe0a0; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 1px rgba(255,191,0,0.3);',
    '  transition: opacity 0.3s, transform 0.3s;',
    '}',
    '#wizard-panel.wizard-enter { opacity: 0; transform: translateY(-50%) translateX(20px); }',
    '#wizard-panel.wizard-visible { opacity: 1; transform: translateY(-50%) translateX(0); }',
    '#wizard-question { font-size: 15px; font-weight: 500; line-height: 1.5; margin-bottom: 12px; }',
    '#wizard-evidence { font-size: 11px; color: rgba(255, 224, 160, 0.5); margin-bottom: 14px; letter-spacing: 0.3px; line-height: 1.5; }',
    '#wizard-buttons { display: flex; gap: 10px; justify-content: center; }',
    '#wizard-buttons button { padding: 8px 28px; border-radius: 8px; border: 1px solid rgba(255, 191, 0, 0.3); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }',
    '.wizard-yes { background: rgba(255, 191, 0, 0.25); color: #ffd54f; }',
    '.wizard-yes:hover { background: rgba(255, 191, 0, 0.4); }',
    '.wizard-no { background: rgba(255, 255, 255, 0.05); color: rgba(255, 224, 160, 0.6); }',
    '.wizard-no:hover { background: rgba(255, 255, 255, 0.1); color: #ffe0a0; }',
    '.wizard-alt { background: rgba(255, 255, 255, 0.05); color: rgba(255, 224, 160, 0.6); font-size: 12px !important; padding: 6px 16px !important; }',
    '.wizard-alt:hover { background: rgba(255, 255, 255, 0.1); color: #ffe0a0; }',
    '#wizard-progress { display: flex; justify-content: center; gap: 6px; margin-top: 14px; }',
    '#wizard-progress .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 191, 0, 0.2); transition: background 0.2s; }',
    '#wizard-progress .dot.done { background: rgba(255, 191, 0, 0.7); }',
    '#wizard-progress .dot.active { background: #ffd54f; box-shadow: 0 0 6px rgba(255, 191, 0, 0.5); }',
    '#wizard-select { width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.3); color: #ffe0a0; border: 1px solid rgba(255,191,0,0.2); border-radius: 6px; font-size: 13px; margin-bottom: 12px; }',
    '#wizard-select option { background: #2d230a; color: #ffe0a0; }',
  ].join('\n');
  document.head.appendChild(style);

  // ── State ──
  var wizState = {
    db: null,          // sql.js Database instance
    projectKey: null,  // IndexedDB key
    meta: null,        // import meta
    steps: [],         // computed step list
    stepIdx: 0,        // current step
    analysis: null,    // pre-computed DB analysis
    onComplete: null,  // callback when wizard finishes
  };

  // ── Verify sub-modules loaded ──
  if (typeof WizardOrientation !== 'undefined') WizardOrientation.init(wizState);
  if (typeof WizardStoreys !== 'undefined') WizardStoreys.init(wizState);
  if (typeof WizardClassify !== 'undefined') WizardClassify.init(wizState);

  // ── Delegate helpers — safe calls to sub-modules ──
  function reframeCameraToBbox() {
    if (typeof WizardOrientation !== 'undefined') WizardOrientation.reframeCameraToBbox(wizState);
  }
  function applyDisciplineColors(db) {
    if (typeof WizardClassify !== 'undefined') WizardClassify.applyDisciplineColors(db);
  }
  function revertDisciplineColors() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.revertDisciplineColors();
  }
  function applyStoreyHighlight(db) {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.applyStoreyHighlight(db, wizState);
  }
  function revertStoreyHighlight() {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.revertStoreyHighlight();
  }
  function reclassifyStoreys(db, heightAxis) {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.reclassifyStoreys(db, heightAxis);
  }
  function revertClassifyHighlight() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.revertClassifyHighlight();
  }
  function initClassifyPool() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.initClassifyPool(wizState);
  }
  function renderClassifyStep() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.renderClassifyStep(wizState, advanceStep);
  }

  // ── Analyse the imported DB to build wizard steps ──
  function analyseDb(db) {
    var analysis = {};

    // Element count
    var r = db.exec("SELECT COUNT(*) FROM elements_meta");
    analysis.totalElements = r.length ? r[0].values[0][0] : 0;

    // Storey bands
    r = db.exec("SELECT DISTINCT storey FROM elements_meta ORDER BY storey");
    analysis.storeys = r.length ? r[0].values.map(function(v) { return v[0]; }) : [];

    // Storey counts + elevation ranges
    analysis.storeyCounts = {};
    analysis.storeyElevations = {};
    r = db.exec("SELECT storey, COUNT(*) as cnt FROM elements_meta GROUP BY storey ORDER BY cnt DESC");
    if (r.length) {
      for (var i = 0; i < r[0].values.length; i++) {
        analysis.storeyCounts[r[0].values[i][0]] = r[0].values[i][1];
      }
    }
    // S230b: Elevation ranges per storey (for smart labels), normalized to 0-based
    try {
      r = db.exec("SELECT m.storey, MIN(t.center_z), MAX(t.center_z) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid GROUP BY m.storey ORDER BY MIN(t.center_z)");
      if (r.length) {
        var globalMinZ = Infinity;
        for (var i = 0; i < r[0].values.length; i++) {
          var lo = r[0].values[i][1] || 0;
          if (lo < globalMinZ) globalMinZ = lo;
        }
        if (!isFinite(globalMinZ)) globalMinZ = 0;
        for (var i = 0; i < r[0].values.length; i++) {
          analysis.storeyElevations[r[0].values[i][0]] = {
            minZ: (r[0].values[i][1] || 0) - globalMinZ,
            maxZ: (r[0].values[i][2] || 0) - globalMinZ,
          };
        }
      }
    } catch(e) { /* element_transforms may not exist for some DBs */ }

    // Discipline counts
    analysis.disciplines = {};
    r = db.exec("SELECT discipline, COUNT(*) as cnt FROM elements_meta GROUP BY discipline ORDER BY cnt DESC");
    if (r.length) {
      for (var i = 0; i < r[0].values.length; i++) {
        analysis.disciplines[r[0].values[i][0]] = r[0].values[i][1];
      }
    }

    // IFC class counts
    analysis.ifcClasses = {};
    r = db.exec("SELECT ifc_class, COUNT(*) as cnt FROM elements_meta GROUP BY ifc_class ORDER BY cnt DESC");
    if (r.length) {
      for (var i = 0; i < r[0].values.length; i++) {
        analysis.ifcClasses[r[0].values[i][0]] = r[0].values[i][1];
      }
    }

    // Unclassified (IfcBuildingElementProxy) count
    analysis.proxyCount = analysis.ifcClasses['IfcBuildingElementProxy'] || 0;

    // Coordinate ranges (for orientation check)
    r = db.exec("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms");
    if (r.length && r[0].values.length) {
      var v = r[0].values[0];
      analysis.rangeX = (v[1] || 0) - (v[0] || 0);
      analysis.rangeY = (v[3] || 0) - (v[2] || 0);
      analysis.rangeZ = (v[5] || 0) - (v[4] || 0);
      analysis.minZ = v[4] || 0;
      analysis.maxZ = v[5] || 0;
    } else {
      analysis.rangeX = 0; analysis.rangeY = 0; analysis.rangeZ = 0;
      analysis.minZ = 0; analysis.maxZ = 0;
    }

    // Repeating geometry hashes (instances)
    analysis.repeats = [];
    r = db.exec("SELECT geometry_hash, COUNT(*) as cnt FROM element_instances GROUP BY geometry_hash HAVING cnt > 1 ORDER BY cnt DESC LIMIT 10");
    if (r.length) {
      for (var i = 0; i < r[0].values.length; i++) {
        var hash = r[0].values[i][0];
        var cnt = r[0].values[i][1];
        var r2 = db.exec("SELECT em.element_name, em.ifc_class, em.material_rgba FROM elements_meta em JOIN element_instances ei ON em.guid = ei.guid WHERE ei.geometry_hash = '" + hash + "' LIMIT 1");
        if (r2.length && r2[0].values.length) {
          analysis.repeats.push({
            hash: hash,
            count: cnt,
            name: r2[0].values[0][0],
            ifcClass: r2[0].values[0][1],
            material: r2[0].values[0][2],
          });
        }
      }
    }

    // Material groups (for material inference)
    analysis.materialGroups = [];
    r = db.exec("SELECT material_rgba, ifc_class, COUNT(*) as cnt FROM elements_meta WHERE material_rgba IS NOT NULL AND material_rgba != '' GROUP BY material_rgba ORDER BY cnt DESC LIMIT 10");
    if (r.length) {
      for (var i = 0; i < r[0].values.length; i++) {
        analysis.materialGroups.push({
          material: r[0].values[i][0],
          ifcClass: r[0].values[i][1],
          count: r[0].values[i][2],
        });
      }
    }

    // Unclassified element names
    analysis.proxyNames = [];
    r = db.exec("SELECT element_name, COUNT(*) as cnt FROM elements_meta WHERE ifc_class = 'IfcBuildingElementProxy' GROUP BY element_name ORDER BY cnt DESC LIMIT 20");
    if (r.length) {
      analysis.proxyNames = r[0].values.map(function(v) { return { name: v[0], count: v[1] }; });
    }

    console.log('[S229] §WIZARD_ANALYSE elements=' + analysis.totalElements +
      ' storeys=' + analysis.storeys.length +
      ' disciplines=' + Object.keys(analysis.disciplines).join(',') +
      ' proxies=' + analysis.proxyCount +
      ' repeats=' + analysis.repeats.length);

    return analysis;
  }

  // ── Build step list from analysis ──
  function buildSteps(analysis) {
    var steps = [];

    // Step 0: Orientation
    steps.push({
      type: 'orientation',
      question: 'Is the building upright?',
      evidence: analysis.totalElements + ' meshes \u00b7 height: ' +
        analysis.rangeZ.toFixed(1) + 'm \u00b7 footprint: ' +
        analysis.rangeX.toFixed(1) + ' \u00d7 ' + analysis.rangeY.toFixed(1) + 'm',
    });

    // Step 1: Storeys overview
    if (analysis.storeys.length > 0) {
      var bandList = analysis.storeys.map(function(s) {
        var elev = analysis.storeyElevations[s];
        var range = elev ? elev.minZ.toFixed(1) + '\u2013' + elev.maxZ.toFixed(1) + 'm' : '';
        var cnt = analysis.storeyCounts[s] || 0;
        return s + (range ? ' [' + range + ']' : '') + ' (' + cnt + ' el)';
      }).join('\n');
      steps.push({
        type: 'storeys',
        question: analysis.storeys.length + ' storeys detected. Correct?',
        evidence: bandList,
      });
    }

    // Step 2: Element classification (draining pool) -- only for non-IFC imports
    if (analysis.proxyCount > analysis.totalElements * 0.5) {
      steps.push({
        type: 'classify',
        question: analysis.proxyCount + ' unclassified elements to identify',
        evidence: 'Toggle through types, confirm with Yes. Pool drains as you go.',
      });
    }

    // Step 3: Summary
    var classEntries = Object.entries(analysis.ifcClasses);
    var classSummary = classEntries.map(function(e) {
      return e[1] + ' ' + e[0].replace('Ifc', '');
    }).join(' \u00b7 ');
    var proxyNote = analysis.proxyCount > 0
      ? '\n' + analysis.proxyCount + ' unclassified \u2014 kept as generic'
      : '';
    steps.push({
      type: 'summary',
      question: 'Classification complete.',
      evidence: classSummary + proxyNote,
    });

    return steps;
  }

  // ── Render panel ──
  function renderPanel() {
    var panel = document.getElementById('wizard-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'wizard-panel';
      panel.className = 'wizard-enter';
      document.body.appendChild(panel);
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          panel.className = 'wizard-visible';
        });
      });
    }

    var step = wizState.steps[wizState.stepIdx];
    var totalSteps = wizState.steps.length;

    // Progress dots
    var dots = '';
    for (var i = 0; i < totalSteps; i++) {
      var cls = 'dot';
      if (i < wizState.stepIdx) cls += ' done';
      if (i === wizState.stepIdx) cls += ' active';
      dots += '<span class="' + cls + '"></span>';
    }

    // Buttons depend on step type
    var buttons = '';
    var selectHtml = '';

    if (step.type === 'summary') {
      buttons = '<button class="wizard-yes" onclick="window._wizardAnswer(\'done\')">Done</button>';
    } else if (step.type === 'orientation') {
      buttons = '<button class="wizard-yes" onclick="window._wizardAnswer(true)">Yes</button>' +
                '<button class="wizard-no" onclick="window._wizardAnswer(false)">Flip</button>';
    } else if (step.type === 'classify') {
      buttons = '';
    } else if (step.type === 'storeys') {
      buttons = '<button class="wizard-yes" onclick="window._wizardAnswer(true)">Yes</button>' +
                '<button class="wizard-alt" onclick="window._wizToggleStoreys()" title="Cycle: shift Ground Floor label up/down">Toggle</button>' +
                '<button class="wizard-alt" onclick="window._wizardAnswer(\'walk_storeys\')" title="Isolate floors one at a time">Walk</button>' +
                '<button class="wizard-alt" onclick="window._wizardAnswer(\'edit_storeys\')" title="Change storey count">Edit</button>';
    } else {
      buttons = '<button class="wizard-yes" onclick="window._wizardAnswer(true)">Yes</button>' +
                '<button class="wizard-no" onclick="window._wizardAnswer(\'done\')">Done</button>';
    }

    // S230b: For storeys step, build evidence with colored legend dots
    var evidenceHtml = step.evidence;
    if (step.type === 'storeys' && wizState.analysis && typeof WizardStoreys !== 'undefined') {
      evidenceHtml = WizardStoreys.buildStoreyEvidenceHtml(wizState);
    }

    panel.innerHTML =
      '<div id="wizard-question">' + step.question + '</div>' +
      '<div id="wizard-evidence">' + evidenceHtml + '</div>' +
      selectHtml +
      '<div id="wizard-buttons">' + buttons + '</div>' +
      '<div id="wizard-progress">' + dots + '</div>';

    // S230b: Apply/revert storey highlighting based on current step
    if (step.type === 'storeys' && wizState.db) {
      applyStoreyHighlight(wizState.db);
    } else {
      revertStoreyHighlight();
    }

    // S234: Classify step — init pool and render guess after panel is in DOM
    if (step.type === 'classify' && wizState.db) {
      initClassifyPool();
      renderClassifyStep();
    }
  }

  // ── Handle answer ──
  window._wizardAnswer = function(answer) {
    var step = wizState.steps[wizState.stepIdx];
    var db = wizState.db;

    console.log('[S229] §WIZARD_ANSWER step=' + wizState.stepIdx +
      ' type=' + step.type + ' answer=' + answer);

    if (step.type === 'orientation' && answer === false) {
      // Delegate flip to orientation module
      if (typeof WizardOrientation !== 'undefined') {
        WizardOrientation.applyFlip(db, wizState);
      }

      // S230b: After flip, reclassify storeys
      reclassifyStoreys(db, wizState._heightAxis || 'z');

      // Re-apply discipline colors after flip
      applyDisciplineColors(db);

      // Re-analyse and rebuild steps from current position
      wizState.analysis = analyseDb(db);
      wizState.steps = buildSteps(wizState.analysis);
      wizState.steps[wizState.stepIdx].evidence =
        wizState.analysis.totalElements + ' meshes \u00b7 height range: ' +
        wizState.analysis.rangeZ.toFixed(1) + 'm \u00b7 footprint: ' +
        wizState.analysis.rangeX.toFixed(1) + ' \u00d7 ' + wizState.analysis.rangeY.toFixed(1) + 'm';
      renderPanel();
      return;
    }

    // S230b: Storey walkthrough
    if (step.type === 'storeys' && answer === 'walk_storeys') {
      if (typeof WizardStoreys !== 'undefined') WizardStoreys.enterStoreyWalk(wizState);
      return;
    }

    // S230b: Storey edit
    if (step.type === 'storeys' && answer === 'edit_storeys') {
      if (typeof WizardStoreys !== 'undefined') WizardStoreys.enterStoreyEdit(wizState, analyseDb, buildSteps, renderPanel);
      return;
    }

    // S233: Storey rename
    if (step.type === 'storeys' && answer === 'rename_storeys') {
      if (typeof WizardStoreys !== 'undefined') WizardStoreys.enterStoreyRename(wizState, analyseDb, buildSteps, applyDisciplineColors);
      return;
    }

    if (step.type === 'summary') {
      finishWizard();
      return;
    }

    if (answer === 'done') {
      advanceStep();
      return;
    }

    advanceStep();
  };

  function advanceStep() {
    wizState.stepIdx++;
    if (wizState.stepIdx >= wizState.steps.length) {
      finishWizard();
      return;
    }
    var panel = document.getElementById('wizard-panel');
    if (panel) {
      panel.style.opacity = '0';
      panel.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(function() {
        renderPanel();
        panel.style.opacity = '1';
        panel.style.transform = 'translateX(-50%) translateY(0)';
      }, 150);
    } else {
      renderPanel();
    }
  }

  // ── Window callbacks — delegate to sub-modules ──
  window._wizToggleStoreys = function() {
    if (typeof WizardStoreys !== 'undefined') {
      WizardStoreys.toggleStoreys(wizState, analyseDb, buildSteps, applyDisciplineColors, renderPanel);
    }
  };

  window._wizApplyStoreyEdit = function() {
    if (typeof WizardStoreys !== 'undefined') {
      WizardStoreys.applyStoreyEdit(wizState, analyseDb, buildSteps, renderPanel);
    }
  };

  window._wizApplyStoreyRename = function() {
    if (typeof WizardStoreys !== 'undefined') {
      WizardStoreys.applyStoreyRename(wizState, analyseDb, buildSteps, applyDisciplineColors, renderPanel);
    }
  };

  window._wizMergeStoreys = function(idx) {
    if (typeof WizardStoreys !== 'undefined') {
      WizardStoreys.mergeStoreys(idx, wizState, analyseDb, buildSteps, applyDisciplineColors);
    }
  };

  window._wizWalkNext = function() {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.walkNext(wizState);
  };

  window._wizWalkPrev = function() {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.walkPrev(wizState);
  };

  window._wizWalkDone = function() {
    if (typeof WizardStoreys !== 'undefined') WizardStoreys.walkDone(wizState, renderPanel);
  };

  window._wizClassifyYes = function() {
    if (typeof WizardClassify !== 'undefined') {
      WizardClassify.classifyYes(wizState, analyseDb, advanceStep);
    }
  };

  window._wizClassifyToggle = function() {
    if (typeof WizardClassify !== 'undefined') {
      WizardClassify.classifyToggle(wizState, advanceStep);
    }
  };

  window._wizardExitPicker = function() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.exitPicker();
  };

  window._wizDiscChanged = function() {
    if (typeof WizardClassify !== 'undefined') WizardClassify.discChanged();
  };

  window._wizPickerApply = function(guid) {
    if (typeof WizardClassify !== 'undefined') {
      WizardClassify.pickerApply(guid, wizState, analyseDb);
    }
  };

  // ── Check if wizard already completed for this DB ──
  function isWizardComplete(db) {
    try {
      var r = db.exec("SELECT value FROM project_metadata WHERE key = 'wizard_complete'");
      return r.length > 0 && r[0].values.length > 0 && r[0].values[0][0] === '1';
    } catch(e) {
      return false;
    }
  }

  // ── Mark wizard complete in DB ──
  function markWizardComplete(db) {
    db.run("CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT)");
    db.run("INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('wizard_complete', '1')");
    console.log('[S230b] §WIZARD_MARK_COMPLETE');
  }

  function finishWizard() {
    // Cleanup classify/picker state
    if (typeof WizardClassify !== 'undefined') WizardClassify.cleanup();

    // S230b: Mark wizard complete in DB BEFORE export
    markWizardComplete(wizState.db);

    // Export DB and analyse BEFORE any async saves
    var dbData = wizState.db.export();
    var dbBuf = dbData.buffer;
    var finalAnalysis = analyseDb(wizState.db);
    var projectKey = wizState.projectKey;

    console.log('[S229] §WIZARD_COMPLETE steps=' + wizState.steps.length +
      ' project=' + projectKey);

    // Close DB now — we have the buffer and analysis
    if (wizState.db) { wizState.db.close(); wizState.db = null; }

    // S230b: Revert storey highlighting but KEEP discipline colors
    revertStoreyHighlight();

    // Show "Saving..." in panel while async writes complete
    var panel = document.getElementById('wizard-panel');
    if (panel) {
      panel.querySelector('#wizard-question').textContent = 'Saving\u2026';
      panel.querySelector('#wizard-evidence').textContent = '';
      panel.querySelector('#wizard-buttons').innerHTML = '';
    }

    var savesPending = 0;
    var savesComplete = 0;
    function onSaveDone(label) {
      savesComplete++;
      console.log('[S230] §WIZARD_SAVE ' + label + ' (' + savesComplete + '/' + savesPending + ')');
      if (savesComplete >= savesPending) {
        dismissPanel();
        if (wizState.onComplete) wizState.onComplete();
      }
    }

    function dismissPanel() {
      var p = document.getElementById('wizard-panel');
      if (p) {
        p.style.opacity = '0';
        p.style.transform = 'translateY(-50%) translateX(20px)';
        setTimeout(function() { p.remove(); }, 300);
      }
    }

    // Save 1: Update import project record
    if (projectKey) {
      savesPending++;
      try {
        var importReq = indexedDB.open('bim_ootb_imports', 2);
        importReq.onsuccess = function() {
          var importDb = importReq.result;
          if (!importDb.objectStoreNames.contains('buildings')) { onSaveDone('import-skip'); return; }
          var tx = importDb.transaction('buildings', 'readwrite');
          var store = tx.objectStore('buildings');
          var getReq = store.get(projectKey);
          getReq.onsuccess = function() {
            var record = getReq.result;
            if (record && record.versions) {
              record.versions[record.latestVersion || 0].db = dbBuf;
              record.meta.disciplines = finalAnalysis.disciplines;
              record.meta.storeys = finalAnalysis.storeys;
              record.meta.wizard_complete = true;
              store.put(record, projectKey);
              console.log('[S230] §WIZARD_IMPORT_SAVED key=' + projectKey + ' size=' + (dbBuf.byteLength/1024).toFixed(0) + 'KB');
            }
          };
          tx.oncomplete = function() { onSaveDone('import'); };
          tx.onerror = function() { onSaveDone('import-err'); };
        };
        importReq.onerror = function() { onSaveDone('import-open-err'); };
      } catch(e) { onSaveDone('import-catch'); }
    }

    // Save 2: Update viewer cache
    if (projectKey) {
      savesPending++;
      try {
        var cacheReq = indexedDB.open('bim_ootb_cache', 1);
        cacheReq.onsuccess = function() {
          var cacheDb = cacheReq.result;
          if (!cacheDb.objectStoreNames.contains('dbs')) { onSaveDone('cache-skip'); return; }
          var tx = cacheDb.transaction('dbs', 'readwrite');
          var store = tx.objectStore('dbs');
          var dbKey = 'import://' + projectKey + '/v0';
          store.put(dbBuf, dbKey);
          try {
            var viewerDbUrl = new URLSearchParams(location.search).get('db');
            if (viewerDbUrl && viewerDbUrl !== dbKey) {
              store.put(dbBuf, viewerDbUrl);
              console.log('[S230b] §WIZARD_CACHE_VIEWER_URL key=' + viewerDbUrl);
            }
          } catch(e2) { /* ignore */ }
          tx.oncomplete = function() {
            console.log('[S230] §WIZARD_CACHE_SAVED key=' + dbKey);
            onSaveDone('cache');
          };
          tx.onerror = function() { onSaveDone('cache-err'); };
        };
        cacheReq.onerror = function() { onSaveDone('cache-open-err'); };
      } catch(e) { onSaveDone('cache-catch'); }
    }

    if (savesPending === 0) {
      dismissPanel();
      if (wizState.onComplete) wizState.onComplete();
    }

    // Safety timeout
    setTimeout(function() {
      var p = document.getElementById('wizard-panel');
      if (p) {
        console.log('[S230b] §WIZARD_SAVE_TIMEOUT forcing dismiss');
        dismissPanel();
        if (wizState.onComplete) wizState.onComplete();
      }
    }, 5000);
  }

  // ── Public API ──
  window.startWizard = async function(projectKey, dbBuffer, meta, onComplete) {
    // Load sql.js if needed
    if (typeof initSqlJs === 'undefined') {
      await new Promise(function(resolve) {
        var s = document.createElement('script');
        s.src = 'lib/sql-wasm.js';
        s.onload = resolve;
        document.head.appendChild(s);
      });
    }
    var SQL = await initSqlJs({ locateFile: function(f) { return 'lib/' + f; } });
    var db = new SQL.Database(new Uint8Array(dbBuffer));

    // S230b: Skip wizard if already completed for this project
    if (isWizardComplete(db)) {
      // S233: Restore scene rotation if DB was flipped
      if (typeof WizardOrientation !== 'undefined') {
        WizardOrientation.restoreFlipIfNeeded(db);
      }
      console.log('[S230b] §WIZARD_SKIP_COMPLETE project=' + projectKey);
      db.close();
      if (onComplete) onComplete();
      return;
    }

    wizState.db = db;
    wizState.projectKey = projectKey;
    wizState.meta = meta;
    wizState.onComplete = onComplete || null;

    // S230b: Detect Y-up vs Z-up and reclassify storeys
    if (typeof WizardOrientation !== 'undefined') {
      wizState._heightAxis = WizardOrientation.detectHeightAxis(db);
    } else {
      var orientR = db.exec("SELECT MAX(center_y)-MIN(center_y), MAX(center_z)-MIN(center_z) FROM element_transforms");
      var yRange = (orientR.length && orientR[0].values[0][0]) || 0;
      var zRange = (orientR.length && orientR[0].values[0][1]) || 0;
      wizState._heightAxis = (yRange > zRange * 1.5) ? 'y' : 'z';
    }
    reclassifyStoreys(db, wizState._heightAxis);

    wizState.analysis = analyseDb(db);
    wizState.steps = buildSteps(wizState.analysis);
    wizState.stepIdx = 0;

    console.log('[S229] §WIZARD_START project=' + projectKey +
      ' elements=' + wizState.analysis.totalElements +
      ' steps=' + wizState.steps.length);

    // S230b: Apply discipline colors + camera clipping once meshes are in scene
    var _colorRetries = 0;
    function tryApplyVisuals() {
      if (typeof APP === 'undefined' || !APP.scene) return;
      var meshCount = 0;
      APP.scene.traverse(function(o) { if (o.isMesh && o.userData.guid) meshCount++; });
      if (meshCount > 0) {
        applyDisciplineColors(wizState.db);
        reframeCameraToBbox();
        return;
      }
      _colorRetries++;
      if (_colorRetries < 30) setTimeout(tryApplyVisuals, 500);
    }
    tryApplyVisuals();

    renderPanel();
  };

  // ── Skip/dismiss without saving ──
  window.dismissWizard = function() {
    var panel = document.getElementById('wizard-panel');
    if (panel) {
      panel.style.opacity = '0';
      panel.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(function() { panel.remove(); }, 300);
    }
    if (wizState.db) { wizState.db.close(); wizState.db = null; }
  };

})();
