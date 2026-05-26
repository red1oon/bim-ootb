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

    // §S280: Route templates built lazily on first navigate (per-storey), not eagerly on load.
    // buildRouteTemplate() already caches per storey — no pre-warming needed.
    A.preProcessRouteTemplates = function() {
      console.log('[S233] §NAV_PREPROCESS deferred (lazy on navigate)');
    };

    console.log('[S233] §NAV_MODULE_LOADED');
  }

  window.NavigateControls = { init: init };
})();
