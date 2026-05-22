/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_dim_chains.js — On-Scene Dimension Chain Rendering
 *
 * Single concern: renders measurement annotations (lines + ticks + labels)
 * as Three.js sprites/lines in a given THREE.Group.
 *
 * Does NOT detect grids, does NOT manage state — pure rendering from grid data.
 *
 * API:
 *   DimChains.build(APP, gridGroup, grids, env, opts)  → adds dim objects to gridGroup
 *   DimChains.remove(gridGroup)                        → removes dim objects from gridGroup
 *
 * Log tags: §DIM_CHAIN
 */
var DimChains = (function() {
  'use strict';

  function log(msg) { console.log('[DimChains] ' + msg); }

  /** Theme-aware: light or dark text */
  function isLight(APP) { return !!APP.lightTheme; }

  /** Create a text sprite showing a dimension value */
  function createDimLabel(APP, text, position, bubbleScale) {
    var canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 48;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 192, 48);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isLight(APP)) {
      ctx.fillStyle = '#000000';
      ctx.fillText(text, 96, 24);
    } else {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeText(text, 96, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 96, 24);
    }
    var texture = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    var sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(bubbleScale * 2.0, bubbleScale * 0.5, 1);
    sprite.renderOrder = 1001;
    sprite.userData.isDimChain = true;
    return sprite;
  }

  /** Draw one dimension segment: line + ticks + label */
  function addDimSegment(APP, p0, p1, tickDir, label, group, bubbleScale) {
    var dimMat = new THREE.LineBasicMaterial({
      color: isLight(APP) ? 0x555555 : 0x999999,
      transparent: true,
      opacity: 0.7
    });

    // Main dimension line
    var lineGeom = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    var dimLine = new THREE.Line(lineGeom, dimMat);
    dimLine.renderOrder = 999;
    dimLine.userData.isDimChain = true;
    group.add(dimLine);

    // Tick (witness) lines at each end
    var tickLen = bubbleScale * 0.3;
    var t0a = p0.clone().add(tickDir.clone().multiplyScalar(tickLen));
    var t0b = p0.clone().add(tickDir.clone().multiplyScalar(-tickLen));
    var tick0Geom = new THREE.BufferGeometry().setFromPoints([t0a, t0b]);
    var tick0 = new THREE.Line(tick0Geom, dimMat);
    tick0.renderOrder = 999;
    tick0.userData.isDimChain = true;
    group.add(tick0);

    var t1a = p1.clone().add(tickDir.clone().multiplyScalar(tickLen));
    var t1b = p1.clone().add(tickDir.clone().multiplyScalar(-tickLen));
    var tick1Geom = new THREE.BufferGeometry().setFromPoints([t1a, t1b]);
    var tick1 = new THREE.Line(tick1Geom, dimMat);
    tick1.renderOrder = 999;
    tick1.userData.isDimChain = true;
    group.add(tick1);

    // Label at midpoint
    var mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    group.add(createDimLabel(APP, label, mid, bubbleScale));
  }

  /**
   * Build all dimension chain objects and add to gridGroup.
   * @param {Object} APP — viewer app
   * @param {THREE.Group} gridGroup — parent group to attach to
   * @param {Object} grids — { xLines: [{label, position}], yLines: [...] }
   * @param {Object} env — building envelope { xMin, xMax, yMin, yMax, zMin, zMax }
   * @param {Object} opts — { bubbleScale: number }
   */
  function build(APP, gridGroup, grids, env, opts) {
    if (!gridGroup) return;

    var bubbleScale = (opts && opts.bubbleScale) || 1.0;
    var bldW = env.xMax - env.xMin;
    var bldD = env.yMax - env.yMin;
    var maxDim = Math.max(bldW, bldD);
    var dimGap = Math.max(1.0, maxDim * 0.03);

    var groundY = (env.zMin - APP.modelOffset.z) - 0.05;
    var xLines = grids.xLines || [];
    var yLines = grids.yLines || [];

    // X-axis dimension chains — both sides (yMin = near, yMax = far)
    if (xLines.length > 1) {
      var tickDirX = new THREE.Vector3(0, 0, 1);

      // Near side (yMin)
      var refZNear = APP.ifc2three(0, env.yMin, env.zMin);
      var t1Near = refZNear.z + bubbleScale + dimGap;
      // Far side (yMax)
      var refZFar = APP.ifc2three(0, env.yMax, env.zMin);
      var t1Far = refZFar.z - bubbleScale - dimGap;

      // Implementing 2D_027 §1.3 — Witness: W-2D27
      // Use rawPosition for label (actual IFC distance); position for geometry (snapped display)
      for (var i = 0; i < xLines.length - 1; i++) {
        var paN = APP.ifc2three(xLines[i].position, env.yMin, env.zMin);
        var pbN = APP.ifc2three(xLines[i + 1].position, env.yMin, env.zMin);
        var rawA = xLines[i].rawPosition !== undefined ? xLines[i].rawPosition : xLines[i].position;
        var rawB = xLines[i + 1].rawPosition !== undefined ? xLines[i + 1].rawPosition : xLines[i + 1].position;
        var distX = Math.abs(rawB - rawA);
        var label = (distX * 1000).toFixed(0);
        // Near
        addDimSegment(APP, new THREE.Vector3(paN.x, groundY, t1Near),
          new THREE.Vector3(pbN.x, groundY, t1Near), tickDirX, label, gridGroup, bubbleScale);
        // Far
        addDimSegment(APP, new THREE.Vector3(paN.x, groundY, t1Far),
          new THREE.Vector3(pbN.x, groundY, t1Far), tickDirX, label, gridGroup, bubbleScale);
      }

      // Overall — near side only (avoids clutter)
      var t3Near = refZNear.z + bubbleScale + dimGap * 3;
      var pFirst = APP.ifc2three(xLines[0].position, env.yMin, env.zMin);
      var pLast = APP.ifc2three(xLines[xLines.length - 1].position, env.yMin, env.zMin);
      var rawFirst = xLines[0].rawPosition !== undefined ? xLines[0].rawPosition : xLines[0].position;
      var rawLast = xLines[xLines.length - 1].rawPosition !== undefined ? xLines[xLines.length - 1].rawPosition : xLines[xLines.length - 1].position;
      var totalX = Math.abs(rawLast - rawFirst);
      addDimSegment(APP, new THREE.Vector3(pFirst.x, groundY, t3Near),
        new THREE.Vector3(pLast.x, groundY, t3Near), tickDirX, (totalX * 1000).toFixed(0), gridGroup, bubbleScale);
    }

    // Y-axis dimension chains — both sides (xMin = left, xMax = right)
    if (yLines.length > 1) {
      var tickDirY = new THREE.Vector3(1, 0, 0);

      // Left side (xMin)
      var refXLeft = APP.ifc2three(env.xMin, 0, env.zMin);
      var t1Left = refXLeft.x - bubbleScale - dimGap;
      // Right side (xMax)
      var refXRight = APP.ifc2three(env.xMax, 0, env.zMin);
      var t1Right = refXRight.x + bubbleScale + dimGap;

      // Implementing 2D_027 §1.3 — Witness: W-2D27
      // Use rawPosition for label (actual IFC distance); position for geometry (snapped display)
      for (var j = 0; j < yLines.length - 1; j++) {
        var raL = APP.ifc2three(env.xMin, yLines[j].position, env.zMin);
        var rbL = APP.ifc2three(env.xMin, yLines[j + 1].position, env.zMin);
        var rawYA = yLines[j].rawPosition !== undefined ? yLines[j].rawPosition : yLines[j].position;
        var rawYB = yLines[j + 1].rawPosition !== undefined ? yLines[j + 1].rawPosition : yLines[j + 1].position;
        var distY = Math.abs(rawYB - rawYA);
        var labelY = (distY * 1000).toFixed(0);
        // Left
        addDimSegment(APP, new THREE.Vector3(t1Left, groundY, raL.z),
          new THREE.Vector3(t1Left, groundY, rbL.z), tickDirY, labelY, gridGroup, bubbleScale);
        // Right
        addDimSegment(APP, new THREE.Vector3(t1Right, groundY, raL.z),
          new THREE.Vector3(t1Right, groundY, rbL.z), tickDirY, labelY, gridGroup, bubbleScale);
      }

      // Overall — left side only
      var t3Left = refXLeft.x - bubbleScale - dimGap * 3;
      var sFirst = APP.ifc2three(env.xMin, yLines[0].position, env.zMin);
      var sLast = APP.ifc2three(env.xMin, yLines[yLines.length - 1].position, env.zMin);
      var rawYFirst = yLines[0].rawPosition !== undefined ? yLines[0].rawPosition : yLines[0].position;
      var rawYLast = yLines[yLines.length - 1].rawPosition !== undefined ? yLines[yLines.length - 1].rawPosition : yLines[yLines.length - 1].position;
      var totalY = Math.abs(rawYLast - rawYFirst);
      addDimSegment(APP, new THREE.Vector3(t3Left, groundY, sFirst.z),
        new THREE.Vector3(t3Left, groundY, sLast.z), tickDirY, (totalY * 1000).toFixed(0), gridGroup, bubbleScale);
    }

    log('§DIM_CHAIN built');
  }

  /** Remove all dimension chain objects from a group */
  function remove(gridGroup) {
    if (!gridGroup) return;
    var toRemove = [];
    gridGroup.traverse(function(obj) {
      if (obj.userData.isDimChain) toRemove.push(obj);
    });
    for (var i = 0; i < toRemove.length; i++) {
      if (toRemove[i].geometry) toRemove[i].geometry.dispose();
      if (toRemove[i].material) {
        if (toRemove[i].material.map) toRemove[i].material.map.dispose();
        toRemove[i].material.dispose();
      }
      gridGroup.remove(toRemove[i]);
    }
  }

  /** Clamp dim label sprites + density filter: hide labels that would overlap at current zoom.
   *  visW = visible world width — labels whose text sprite width > gap between them get hidden.
   *  Zooming in shrinks visW → reveals progressively more labels. */
  function clampScales(gridGroup, origBubbleScale, clampedScale, visW) {
    if (!gridGroup) return;
    // Collect dim sprites with positions for density check
    var dimSprites = [];
    gridGroup.traverse(function(obj) {
      if (obj.isSprite && obj.userData.isDimChain) {
        obj.scale.set(clampedScale * 2.0, clampedScale * 0.5, 1);
        dimSprites.push(obj);
      }
    });
    // Density filter: hide labels whose screen-space width would overlap neighbours
    if (!visW || dimSprites.length < 2) return;
    var labelScreenW = clampedScale * 2.0; // world-unit width of label sprite
    // Min gap between labels to stay readable (2× label width)
    var minGap = labelScreenW * 2.0;
    // Sort by X then Z for proximity checks (works for both horizontal and vertical chains)
    dimSprites.sort(function(a, b) {
      var dx = a.position.x - b.position.x;
      return dx !== 0 ? dx : a.position.z - b.position.z;
    });
    // Show first, then only show next if far enough from last shown
    var lastShown = dimSprites[0];
    lastShown.visible = true;
    for (var i = 1; i < dimSprites.length; i++) {
      var dist = dimSprites[i].position.distanceTo(lastShown.position);
      if (dist < minGap) {
        dimSprites[i].visible = false;
      } else {
        dimSprites[i].visible = true;
        lastShown = dimSprites[i];
      }
    }
  }

  return {
    build:       build,
    remove:      remove,
    clampScales: clampScales
  };
})();
