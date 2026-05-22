/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_controls.js — S233 Section E: Keyboard, pointer lock, voice preprocessing
// Interface: NavigateControls.init(A, nav)
// Reads from A (NavigateEngine): A.advanceNavStep, A.goBackStep, A.resetToStart,
//   A.stopNavigation
// Reads from A (NavigateFind): A.closeFindPanel
// Reads from A (NavigateGrid): A.buildRouteTemplate
// Reads: A.db, A.activeBuilding, A.camera
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav) {

    // ══════════════════════════════════════════════════════════════
    // SECTION E: CONTROLS — WALK BUTTON OVERRIDE + DESKTOP
    // ══════════════════════════════════════════════════════════════

    // Re-acquire panel for ESC check
    var panel = document.getElementById('find-panel');

    // ── Desktop pointer lock (FPS mouse look) ──
    function setupPointerLock() {
      if ('ontouchstart' in window) return;
      var canvas = document.getElementById('canvas') || document.querySelector('canvas');
      if (!canvas) return;

      canvas.addEventListener('click', function plClick() {
        if (nav.active && !document.pointerLockElement) {
          canvas.requestPointerLock();
        }
      });

      document.addEventListener('pointerlockchange', function() {
        nav.pointerLocked = !!document.pointerLockElement;
      });

      document.addEventListener('mousemove', function(e) {
        if (!nav.active || !nav.pointerLocked) return;
        var sensitivity = 0.002;
        A.camera.rotation.y -= e.movementX * sensitivity;
        A.camera.rotation.x -= e.movementY * sensitivity;
        A.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, A.camera.rotation.x));
      });

      canvas.addEventListener('mousedown', function(e) {
        if (nav.active && nav.pointerLocked && e.button === 0) {
          A.advanceNavStep();
        }
      });
    }
    setupPointerLock();

    // ── ESC from keyboard (non-nav mode closes find panel) ──
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && panel && panel.style.display !== 'none' && !nav.active) {
        if (A.closeFindPanel) A.closeFindPanel();
      }
    });

    // ── Pre-process route templates on streaming complete ──
    A.preProcessRouteTemplates = function() {
      if (!A.db) { console.log('[S233] §NAV_PREPROCESS no db'); return; }
      var bld = A.activeBuilding || '';
      try {
        var sql = 'SELECT DISTINCT storey FROM elements_meta WHERE storey IS NOT NULL';
        var params = [];
        if (bld) { sql += ' AND building = ?'; params.push(bld); }
        var rows = A.db.exec(sql, params);
        if (!rows.length || !rows[0].values.length) { console.log('[S233] §NAV_PREPROCESS no storeys'); return; }
        var storeys = rows[0].values.map(function(r) { return r[0]; });
        var totalNodes = 0, totalEdges = 0;
        for (var i = 0; i < storeys.length; i++) {
          var tmpl = A.buildRouteTemplate(storeys[i]);
          if (tmpl) { totalNodes += tmpl.nodes.length; totalEdges += tmpl.edges.length; }
        }
        console.log('[S233] §NAV_PREPROCESS storeys=' + storeys.length + ' totalNodes=' + totalNodes +
          ' totalEdges=' + totalEdges + ' storeyList=[' + storeys.join(', ') + ']');
      } catch(e) { console.warn('[S233] §NAV_PREPROCESS_ERR', e.message); }
    };

    // Auto-preprocess when streaming completes
    var _ppObserver = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var el = mutations[i].target;
        if (el && el.textContent && el.textContent.indexOf('DONE') >= 0) {
          _ppObserver.disconnect();
          setTimeout(function() { A.preProcessRouteTemplates(); }, 500);
          return;
        }
      }
    });
    var _sActive = document.getElementById('s-active');
    if (_sActive) {
      if (_sActive.textContent.indexOf('DONE') >= 0) {
        setTimeout(function() { A.preProcessRouteTemplates(); }, 500);
      } else {
        _ppObserver.observe(_sActive, { childList: true, characterData: true, subtree: true });
      }
    }

    console.log('[S233] §NAV_MODULE_LOADED');
  }

  window.NavigateControls = { init: init };
})();
