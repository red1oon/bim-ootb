/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// wizard_orientation.js — Orientation & coordinate frame concern
// Extracted from wizard.js: Y-up vs Z-up detection, scene rotation, axis flip, reframe logic

(function() {
  'use strict';

  // ── Reframe camera to fit scene bounding box after flip ──
  // S230b: Compute bbox from mesh geometry bounds (not just obj.position)
  // Uses local-space geometry bounds to avoid scene rotation blowup
  function reframeCameraToBbox(wizState) {
    if (typeof APP === 'undefined' || !APP.scene || !APP.camera) return;
    // S233: Compute local-space bbox (without scene rotation), then transform center to world
    // This avoids expandByObject blowing up when scene.rotation.x = -PI/2
    var savedRx = APP.scene.rotation.x;
    APP.scene.rotation.x = 0;
    APP.scene.updateMatrixWorld(true);
    var localBox = new THREE.Box3();
    APP.scene.traverse(function(obj) {
      if (obj.isMesh && obj.geometry) localBox.expandByObject(obj);
    });
    APP.scene.rotation.x = savedRx;
    APP.scene.updateMatrixWorld(true);
    if (localBox.isEmpty()) return;
    var localCenter = localBox.getCenter(new THREE.Vector3());
    var localSize = localBox.getSize(new THREE.Vector3());
    // Prefer DB analysis for maxDim (reliable), fall back to Three.js bbox
    var maxDim;
    if (wizState && wizState.analysis) {
      maxDim = Math.max(wizState.analysis.rangeX, wizState.analysis.rangeY, wizState.analysis.rangeZ, 1);
    } else {
      maxDim = Math.max(localSize.x, localSize.y, localSize.z, 1);
    }
    // Transform center to world space (through current scene rotation)
    var worldCenter = localCenter.applyMatrix4(APP.scene.matrixWorld);

    var fov = APP.camera.fov * (Math.PI / 180);
    var dist = maxDim / (2 * Math.tan(fov / 2)) * 1.8;
    // S233: Camera from above-front so floors are visually separated after flip
    APP.camera.position.set(
      worldCenter.x + dist * 0.3,
      worldCenter.y + dist * 0.9,
      worldCenter.z + dist * 0.5
    );
    APP.camera.lookAt(worldCenter);
    // S230b: Adjust near/far clipping to match building scale
    APP.camera.near = Math.max(0.01, dist * 0.005);
    APP.camera.far = Math.max(1000, dist * 10);
    APP.camera.updateProjectionMatrix();
    if (APP.controls) {
      APP.controls.target.copy(worldCenter);
      APP.controls.update();
    }
    console.log('[S233] §WIZARD_REFRAME center=' + worldCenter.x.toFixed(1) + ',' + worldCenter.y.toFixed(1) + ',' + worldCenter.z.toFixed(1) + ' dist=' + dist.toFixed(1) + ' maxDim=' + maxDim.toFixed(1) + ' near=' + APP.camera.near.toFixed(2) + ' far=' + APP.camera.far.toFixed(0));
  }

  // ── Detect height axis (Y-up vs Z-up) from DB ──
  function detectHeightAxis(db) {
    var orientR = db.exec("SELECT MAX(center_y)-MIN(center_y), MAX(center_z)-MIN(center_z) FROM element_transforms");
    var yRange = (orientR.length && orientR[0].values[0][0]) || 0;
    var zRange = (orientR.length && orientR[0].values[0][1]) || 0;
    return (yRange > zRange * 1.5) ? 'y' : 'z';
  }

  // ── Restore scene rotation if DB was previously flipped ──
  function restoreFlipIfNeeded(db) {
    try {
      var orientRow = db.exec("SELECT value FROM project_metadata WHERE key = 'orientation'");
      if (orientRow.length > 0 && orientRow[0].values[0][0] === 'z_up' &&
          typeof APP !== 'undefined' && APP.scene) {
        APP.scene.rotation.x = -Math.PI / 2;
        APP.scene.updateMatrixWorld(true);
        console.log('[S233] §WIZARD_RESTORE_FLIP orientation=z_up, scene.rotation.x=-1.571');
        return true;
      }
    } catch(e) { /* project_metadata may not exist */ }
    return false;
  }

  // ── Apply orientation flip (Y↔Z swap) ──
  function applyFlip(db, wizState) {
    // Flip: swap Y↔Z in transforms DB
    db.run("UPDATE element_transforms SET center_y = -center_z, center_z = center_y");
    // S233: Persist flip state so reopen skips re-flipping
    db.run("CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT)");
    db.run("INSERT OR REPLACE INTO project_metadata (key, value) VALUES ('orientation', 'z_up')");
    console.log('[S229] §WIZARD_FLIP swapped Y↔Z in element_transforms, orientation=z_up saved');

    // S230b: After Y↔Z swap, height is now in Z
    wizState._heightAxis = 'z';

    // S230: Toggle scene between 0 and -90deg around X (Y-up <-> Z-up)
    if (typeof APP !== 'undefined' && APP.scene) {
      // Toggle -- not accumulate
      var flipped = Math.abs(APP.scene.rotation.x + Math.PI / 2) < 0.01;
      APP.scene.rotation.x = flipped ? 0 : -Math.PI / 2;
      APP.scene.updateMatrixWorld(true);

      // S230b: Reframe camera to fit rotated bounding box
      reframeCameraToBbox(wizState);
      console.log('[S230] §WIZARD_FLIP_3D rotation.x=' + APP.scene.rotation.x.toFixed(3) + ' flipped=' + !flipped);
    }
  }

  // ── Init: called by wizard.js orchestrator ──
  function init(wizState) {
    // Nothing to initialize at startup; functions are called on demand
  }

  // ── Public namespace ──
  window.WizardOrientation = {
    init: init,
    reframeCameraToBbox: reframeCameraToBbox,
    detectHeightAxis: detectHeightAxis,
    restoreFlipIfNeeded: restoreFlipIfNeeded,
    applyFlip: applyFlip,
  };

})();
