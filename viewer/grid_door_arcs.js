/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_door_arcs.js — Door Swing Arc Rendering
 *
 * Implementing BBC.md §2D_023 — Witness: W-DOOR-ARCS
 *
 * Generates quarter-circle door swing arcs from section cut contours.
 * The door contour from SectionCut.sectionCut() gives us the door panel edge
 * as a line segment. The arc is computed from:
 *   - Hinge point: the endpoint of the door contour closest to a wall contour
 *   - Swing radius: length of the door contour segment (= door width)
 *   - Arc direction: determined by which side the door opens to
 *
 * Extracted, not invented: the hinge point and radius come from mesh geometry.
 *
 * API:
 *   DoorArcs.generateArcs(doorElements, wallElements) → [{hinge, radius, startAngle, endAngle, points}]
 *   DoorArcs.createArcLine(arc, ifc2threeFn, cutZ, style) → THREE.Line
 *
 * Log tags:
 *   §DOOR_ARC_DETECT  — hinge/radius extraction
 *   §DOOR_ARC_RENDER  — Three.js line creation
 */
var DoorArcs = (function() {
  'use strict';

  var ARC_SEGMENTS = 16;  // polyline segments per quarter-circle

  function log(msg) { console.log('[DoorArcs] ' + msg); }

  /**
   * Find the hinge point of a door from its section contour and nearby wall contours.
   * The hinge is the door contour endpoint closest to any wall contour endpoint.
   *
   * @param {Array} doorContour  - [[x,y], ...] polyline from SectionCut
   * @param {Array} wallContours - array of [[x,y], ...] wall contour polylines
   * @returns {{ hinge: [x,y], free: [x,y], radius: number }} or null
   */
  /**
   * Extract the door leaf axis from a closed contour polygon.
   * A door panel cross-section is a thin rectangle: long axis = door width,
   * short axis = panel thickness (~0.04m). We find the bbox, determine the
   * long axis, and return its midpoint endpoints as p0 and p1.
   *
   * @param {Array} pts - [[x,y], ...] closed polygon
   * @returns {{ p0: [x,y], p1: [x,y], radius: number }} or null
   */
  function extractLeafAxis(pts) {
    if (!pts || pts.length < 4) return null;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][0] < minX) minX = pts[i][0];
      if (pts[i][0] > maxX) maxX = pts[i][0];
      if (pts[i][1] < minY) minY = pts[i][1];
      if (pts[i][1] > maxY) maxY = pts[i][1];
    }
    var w = maxX - minX, h = maxY - minY;
    var longAxis = Math.max(w, h);
    if (longAxis < 0.3) return null; // too small to be a door leaf (< 30cm)

    var midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    var p0, p1;
    if (w >= h) {
      // Long axis is X — endpoints at left/right midpoints
      p0 = [minX, midY];
      p1 = [maxX, midY];
    } else {
      // Long axis is Y — endpoints at bottom/top midpoints
      p0 = [midX, minY];
      p1 = [midX, maxY];
    }
    return { p0: p0, p1: p1, radius: longAxis };
  }

  function findHinge(leafAxis, wallContours) {
    if (!leafAxis) return null;
    var p0 = leafAxis.p0, p1 = leafAxis.p1, radius = leafAxis.radius;

    // Find which endpoint is closest to any wall contour point — that's the hinge
    var bestDist0 = Infinity, bestDist1 = Infinity;

    for (var w = 0; w < wallContours.length; w++) {
      var wc = wallContours[w];
      for (var wi = 0; wi < wc.length; wi++) {
        var wp = wc[wi];
        var d0 = Math.sqrt((wp[0] - p0[0]) * (wp[0] - p0[0]) + (wp[1] - p0[1]) * (wp[1] - p0[1]));
        var d1 = Math.sqrt((wp[0] - p1[0]) * (wp[0] - p1[0]) + (wp[1] - p1[1]) * (wp[1] - p1[1]));
        if (d0 < bestDist0) bestDist0 = d0;
        if (d1 < bestDist1) bestDist1 = d1;
      }
    }

    // The endpoint closer to a wall is the hinge
    if (bestDist0 <= bestDist1) {
      return { hinge: p0, free: p1, radius: radius };
    } else {
      return { hinge: p1, free: p0, radius: radius };
    }
  }

  /**
   * Determine swing direction from wall orientation.
   * The door opens AWAY from the wall centre line, into the room.
   * Uses 2D cross product: wallDir × doorDir > 0 → CCW, else CW.
   *
   * @param {{ hinge: [x,y], free: [x,y] }} hingeResult
   * @param {Array} wallContours — wall polylines to find host wall direction
   * @returns {number} +1 (CCW) or -1 (CW)
   */
  function detectSwingDirection(hingeResult, wallContours) {
    var hx = hingeResult.hinge[0], hy = hingeResult.hinge[1];
    var fx = hingeResult.free[0], fy = hingeResult.free[1];

    // Door direction: hinge → free
    var doorDx = fx - hx, doorDy = fy - hy;

    // Find the nearest wall segment to the hinge — its direction gives wall axis
    var bestDist = Infinity, wallDx = 1, wallDy = 0;
    for (var w = 0; w < wallContours.length; w++) {
      var wc = wallContours[w];
      for (var wi = 0; wi < wc.length - 1; wi++) {
        var mx = (wc[wi][0] + wc[wi + 1][0]) / 2;
        var my = (wc[wi][1] + wc[wi + 1][1]) / 2;
        var d = Math.sqrt((mx - hx) * (mx - hx) + (my - hy) * (my - hy));
        if (d < bestDist) {
          bestDist = d;
          wallDx = wc[wi + 1][0] - wc[wi][0];
          wallDy = wc[wi + 1][1] - wc[wi][1];
        }
      }
    }

    // 2D cross product: wallDir × doorDir
    // Positive → door opens to the left of wall direction (CCW sweep)
    // Negative → door opens to the right (CW sweep = negative π/2)
    var cross = wallDx * doorDy - wallDy * doorDx;
    return cross >= 0 ? 1 : -1;
  }

  /**
   * Generate quarter-circle arc points from hinge → free endpoint.
   * Arc sweeps 90 degrees — direction determined by swing sign.
   *
   * @param {{ hinge: [x,y], free: [x,y], radius: number, swing: number }} arc
   * @returns {Array} [[x,y], ...] polyline points for the arc
   */
  function computeArcPoints(arc) {
    var hx = arc.hinge[0], hy = arc.hinge[1];
    var fx = arc.free[0], fy = arc.free[1];
    var r = arc.radius;

    // Start angle: direction from hinge to free point
    var startAngle = Math.atan2(fy - hy, fx - hx);
    // Sweep: +π/2 (CCW) or -π/2 (CW) based on detected swing direction
    var sweep = (arc.swing || 1) * Math.PI / 2;

    var points = [];
    for (var i = 0; i <= ARC_SEGMENTS; i++) {
      var t = i / ARC_SEGMENTS;
      var angle = startAngle + t * sweep;
      points.push([
        hx + r * Math.cos(angle),
        hy + r * Math.sin(angle)
      ]);
    }
    return points;
  }

  /**
   * Generate arcs for all door elements given section cut results.
   *
   * @param {Array} doorElements - section cut results filtered to IfcDoor
   * @param {Array} wallElements - section cut results filtered to IfcWall/IfcWallStandardCase
   * @returns {Array} [{ guid, hinge, free, radius, points }]
   */
  /** Extract raw point array from contour (handles both {points} objects and raw arrays) */
  function contourPoints(c) {
    return c && c.points ? c.points : c;
  }

  function generateArcs(doorElements, wallElements) {
    // Collect all wall contour polylines (unwrap {points, isOuter} if needed)
    var wallContours = [];
    for (var w = 0; w < wallElements.length; w++) {
      var wContours = wallElements[w].contours || [];
      for (var wc = 0; wc < wContours.length; wc++) {
        var pts = contourPoints(wContours[wc]);
        if (pts && pts.length >= 2) wallContours.push(pts);
      }
    }

    var arcs = [];
    for (var d = 0; d < doorElements.length; d++) {
      var door = doorElements[d];
      var dContours = door.contours || [];

      // Find the leaf contour — the one with the largest long-axis (= door width).
      // Small contours are hinges, handles, frame details — skip them.
      var bestLeaf = null;
      for (var dc = 0; dc < dContours.length; dc++) {
        var pts = contourPoints(dContours[dc]);
        var leaf = extractLeafAxis(pts);
        if (leaf && (!bestLeaf || leaf.radius > bestLeaf.radius)) {
          bestLeaf = leaf;
        }
      }

      if (!bestLeaf) {
        log('§DOOR_ARC_SKIP guid=' + door.guid + ' reason=no_leaf contours=' + dContours.length);
        continue;
      }
      var hingeResult = findHinge(bestLeaf, wallContours);
      if (!hingeResult) {
        log('§DOOR_ARC_SKIP guid=' + door.guid + ' reason=no_hinge radius=' + bestLeaf.radius.toFixed(3));
        continue;
      }

      var swing = detectSwingDirection(hingeResult, wallContours);
      hingeResult.swing = swing;

      var arcPoints = computeArcPoints(hingeResult);
      arcs.push({
        guid: door.guid,
        hinge: hingeResult.hinge,
        free: hingeResult.free,
        radius: hingeResult.radius,
        swing: swing,
        points: arcPoints
      });
      log('§DOOR_ARC_DETECT guid=' + door.guid + ' radius=' + hingeResult.radius.toFixed(3) +
          ' hinge=(' + hingeResult.hinge[0].toFixed(2) + ',' + hingeResult.hinge[1].toFixed(2) +
          ') swing=' + (swing > 0 ? 'CCW' : 'CW'));
    }
    return arcs;
  }

  /**
   * Create a Three.js Line for a door arc.
   *
   * @param {Object} arc       - from generateArcs()
   * @param {Function} ifc2three - coordinate transform function
   * @param {number} cutZ      - IFC Z of the section cut
   * @param {Object} style     - { color, weight } from GridConfig
   * @returns {THREE.Line}
   */
  function createArcLine(arc, ifc2three, cutZ, style) {
    var color = (style && style.color) ? style.color : '#333333';
    var weight = (style && style.weight) ? style.weight : 1.0;

    var threePoints = [];
    for (var i = 0; i < arc.points.length; i++) {
      var p = arc.points[i];
      var t = ifc2three(p[0], p[1], cutZ);
      threePoints.push(new THREE.Vector3(t.x, t.y, t.z));
    }

    var geom = new THREE.BufferGeometry().setFromPoints(threePoints);
    var mat = new THREE.LineBasicMaterial({ color: color, linewidth: weight });
    var line = new THREE.Line(geom, mat);
    line.renderOrder = 1000;
    line.userData = { isDoorArc: true, isContour: true, guid: arc.guid, ifcClass: 'IfcDoor' };
    log('§DOOR_ARC_RENDER guid=' + arc.guid + ' segments=' + threePoints.length);
    return line;
  }

  // Implementing 2D_027 §5.2 — Witness: W-2D27
  /**
   * Generate stair tread-line symbol for IfcStair elements in a section cut.
   *
   * @param {Array} stairElements - section cut results filtered to IfcStair
   * @param {Object} APP          - viewer app (for ifc2three, scene)
   * @param {number} cutZ         - IFC Z of the section cut
   * @param {THREE.Group} [group] - contour group to add to (default: APP.scene)
   * @returns {Array} THREE.Line objects added to group
   */
  function generateStairSymbol(stairElements, APP, cutZ, group) {
    var parent = group || APP.scene;
    if (!stairElements || !stairElements.length) return [];
    var objects = [];

    stairElements.forEach(function(el) {
      // bbox2d = [minX, minY, maxX, maxY] in IFC XY coords
      var b = el.bbox2d;
      if (!b) return;
      var bw = b[2] - b[0]; // X extent
      var bd = b[3] - b[1]; // Y extent
      if (bw <= 0 || bd <= 0) return;

      // Only draw if aspect ratio > 2:1 (stairs are elongated)
      var aspect = Math.max(bw, bd) / Math.min(bw, bd);
      if (aspect < 2) return;

      var stairH = Math.max(bw, bd);
      var stairW = Math.min(bw, bd);
      var longInX = bw >= bd; // true if long axis runs along X

      // Riser estimate: standard riser 0.15–0.21m
      var riserDepth = stairH / Math.ceil(stairH / 0.18);
      var numTreads = Math.min(8, Math.max(3, Math.round(stairH / riserDepth)));

      var mat = new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.8 });

      // Draw tread lines as short dashes across the stair width (perpendicular to long axis)
      for (var t = 0; t < numTreads; t++) {
        var frac = (t + 0.5) / numTreads;
        var pts2d;
        if (longInX) {
          // Long axis = X: tread lines are perpendicular (Y direction) at intervals along X
          var tx = b[0] + frac * bw;
          pts2d = [[tx, b[1]], [tx, b[3]]];
        } else {
          // Long axis = Y: tread lines are perpendicular (X direction) at intervals along Y
          var ty = b[1] + frac * bd;
          pts2d = [[b[0], ty], [b[2], ty]];
        }
        var threePoints = pts2d.map(function(p) {
          var tc = APP.ifc2three(p[0], p[1], cutZ);
          return new THREE.Vector3(tc.x, tc.y, tc.z);
        });
        var geom = new THREE.BufferGeometry().setFromPoints(threePoints);
        var line = new THREE.Line(geom, mat);
        line.renderOrder = 1050;
        line.userData = { isDoorArc: true, isContour: true, isStairSymbol: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcStairFlight' };
        parent.add(line);
        objects.push(line);
      }

      // Diagonal arrow: bottom-left to top-right (convention = direction of ascent)
      var arrowPts2d = [[b[0], b[1]], [b[2], b[3]]];
      var arrowThreePoints = arrowPts2d.map(function(p) {
        var tc = APP.ifc2three(p[0], p[1], cutZ);
        return new THREE.Vector3(tc.x, tc.y, tc.z);
      });
      var arrowGeom = new THREE.BufferGeometry().setFromPoints(arrowThreePoints);
      var arrowMat = new THREE.LineBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.9 });
      var arrow = new THREE.Line(arrowGeom, arrowMat);
      arrow.renderOrder = 1050;
      arrow.userData = { isDoorArc: true, isContour: true, isStairSymbol: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcStairFlight' };
      parent.add(arrow);
      objects.push(arrow);

      log('§DOOR_ARC_STAIR guid=' + (el.guid || '?') + ' treads=' + numTreads + ' riserEst=' + riserDepth.toFixed(3));
    });
    return objects;
  }

  // Implementing 2D_027 §5.3 — Witness: W-2D27
  /**
   * Generate window opening dashes + width label for IfcWindow elements in a section cut.
   *
   * @param {Array} windowElements - section cut results filtered to IfcWindow
   * @param {Object} APP           - viewer app (for ifc2three, scene)
   * @param {number} cutZ          - IFC Z of the section cut
   * @param {THREE.Group} [group] - contour group to add to (default: APP.scene)
   * @returns {Array} THREE.Line + THREE.Sprite objects added to group
   */
  function generateWindowOpenings(windowElements, APP, cutZ, group) {
    var parent = group || APP.scene;
    if (!windowElements || !windowElements.length) return [];
    var objects = [];

    windowElements.forEach(function(el) {
      // bbox2d = [minX, minY, maxX, maxY] in IFC XY coords
      var b = el.bbox2d;
      if (!b) return;
      var bw = b[2] - b[0]; // X extent
      var bd = b[3] - b[1]; // Y extent
      if (bw <= 0 && bd <= 0) return;

      var openingW = Math.max(bw, bd);
      var openingD = Math.min(bw, bd);
      var dashLen = Math.max(openingD * 0.5, 0.05); // dash length perpendicular to opening
      var cx = (b[0] + b[2]) / 2;
      var cy = (b[1] + b[3]) / 2;
      var longInX = bw >= bd;

      var mat = new THREE.LineBasicMaterial({ color: 0x99bbdd, transparent: true, opacity: 0.7 });

      // Dimension line offset perpendicular to wall face
      var dimOffset = dashLen + 0.05;

      if (longInX) {
        // Opening runs in X — jamb ticks at left and right ends, dashes in Y direction
        [[b[0], cy], [b[2], cy]].forEach(function(jPt) {
          var p0 = APP.ifc2three(jPt[0], jPt[1] - dashLen, cutZ);
          var p1 = APP.ifc2three(jPt[0], jPt[1] + dashLen, cutZ);
          var geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p0.x, p0.y, p0.z),
            new THREE.Vector3(p1.x, p1.y, p1.z)
          ]);
          var line = new THREE.Line(geom, mat);
          line.renderOrder = 1050;
          line.userData = { isDoorArc: true, isContour: true, isWindowOpening: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcWindow' };
          parent.add(line);
          objects.push(line);
        });
        // Connecting dimension line between the two jamb ticks
        var dp0 = APP.ifc2three(b[0], cy + dimOffset, cutZ);
        var dp1 = APP.ifc2three(b[2], cy + dimOffset, cutZ);
        var dimGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(dp0.x, dp0.y, dp0.z),
          new THREE.Vector3(dp1.x, dp1.y, dp1.z)
        ]);
        var dimLine = new THREE.Line(dimGeom, mat);
        dimLine.renderOrder = 1050;
        dimLine.userData = { isDoorArc: true, isContour: true, isWindowOpening: true, isDimLine: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcWindow' };
        parent.add(dimLine);
        objects.push(dimLine);
      } else {
        // Opening runs in Y — jamb ticks at top and bottom ends, dashes in X direction
        [[cx, b[1]], [cx, b[3]]].forEach(function(jPt) {
          var p0 = APP.ifc2three(jPt[0] - dashLen, jPt[1], cutZ);
          var p1 = APP.ifc2three(jPt[0] + dashLen, jPt[1], cutZ);
          var geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p0.x, p0.y, p0.z),
            new THREE.Vector3(p1.x, p1.y, p1.z)
          ]);
          var line = new THREE.Line(geom, mat);
          line.renderOrder = 1050;
          line.userData = { isDoorArc: true, isContour: true, isWindowOpening: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcWindow' };
          parent.add(line);
          objects.push(line);
        });
        // Connecting dimension line between the two jamb ticks
        var dp0 = APP.ifc2three(cx + dimOffset, b[1], cutZ);
        var dp1 = APP.ifc2three(cx + dimOffset, b[3], cutZ);
        var dimGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(dp0.x, dp0.y, dp0.z),
          new THREE.Vector3(dp1.x, dp1.y, dp1.z)
        ]);
        var dimLine = new THREE.Line(dimGeom, mat);
        dimLine.renderOrder = 1050;
        dimLine.userData = { isDoorArc: true, isContour: true, isWindowOpening: true, isDimLine: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcWindow' };
        parent.add(dimLine);
        objects.push(dimLine);
      }

      // Width label: sprite centred above the opening
      if (typeof THREE !== 'undefined' && THREE.CanvasTexture) {
        var labelText = (openingW * 1000).toFixed(0) + ' W';
        var canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        var ctx = canvas.getContext('2d');
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#aaccdd';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, 64, 16);
        var tex = new THREE.CanvasTexture(canvas);
        var spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        var sprite = new THREE.Sprite(spriteMat);
        var center3 = APP.ifc2three(cx, cy, cutZ);
        sprite.position.set(center3.x, center3.y, center3.z);
        var worldScale = openingW * 0.5;
        sprite.scale.set(worldScale, worldScale * 0.25, 1);
        sprite.renderOrder = 1051;
        sprite.userData = { isDoorArc: true, isContour: true, isWindowOpening: true, guid: el.guid, ifcClass: el.ifcClass || 'IfcWindow' };
        parent.add(sprite);
        objects.push(sprite);
      }

      log('§DOOR_ARC_WINDOW guid=' + (el.guid || '?') + ' width=' + openingW.toFixed(3));
    });
    return objects;
  }

  // Implementing 2D_029 §1.1–§1.3 — Witness: W-2D29
  /**
   * Add opening callout label: width (mm) + type tag.
   * Placed as a canvas-textured sprite offset perpendicular to wall face.
   *
   * @param {THREE.Group|THREE.Scene} group - parent to add sprite to
   * @param {Function} ifc2three - coordinate transform
   * @param {number} cx       - IFC X centre of opening
   * @param {number} cy       - IFC Y centre of opening
   * @param {number} cutZ     - IFC Z of section cut
   * @param {string} wallAxis - 'X' or 'Y' (long axis of host wall)
   * @param {number} widthM   - opening width in metres
   * @param {string} tag      - type name (e.g. "Single-Flush" or "DOOR")
   * @param {string} guid     - element GUID
   * @param {Object} rules    - grid_rules.json (optional)
   * @returns {THREE.Sprite|null}
   */
  function addOpeningLabel(group, ifc2three, cx, cy, cutZ, wallAxis, widthM, tag, guid, rules) {
    if (typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
    var fp = (rules && rules.floor_plan) || {};
    var offset = fp.opening_label_offset_m || 0.15;
    var fontSize = fp.opening_label_font_px || 9;

    var widthMM = Math.round(widthM * 1000);
    var line1 = widthMM + 'W';
    var line2 = tag || '';

    var canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.font = 'bold ' + (fontSize * 2) + 'px sans-serif';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(line1, 128, 2);
    if (line2) {
      ctx.font = (fontSize * 2 - 4) + 'px sans-serif';
      ctx.fillStyle = '#999999';
      ctx.fillText(line2, 128, fontSize * 2 + 4);
    }

    var tex = new THREE.CanvasTexture(canvas);
    var spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    var sprite = new THREE.Sprite(spriteMat);

    // Offset perpendicular to wall axis
    var ox = wallAxis === 'Y' ? offset : 0;
    var oy = wallAxis === 'X' ? offset : 0;
    var p = ifc2three(cx + ox, cy + oy, cutZ);
    sprite.position.set(p.x, p.y, p.z);
    var worldScale = widthM * 0.6;
    sprite.scale.set(worldScale, worldScale * 0.25, 1);
    sprite.renderOrder = 1060;
    sprite.userData = { isDoorArc: true, isContour: true, isOpeningLabel: true, guid: guid, ifcClass: tag && tag.match(/^WIN|WINDOW/i) ? 'IfcWindow' : 'IfcDoor' };
    group.add(sprite);

    log('§DOOR_ARC_LABEL guid=' + guid + ' width=' + widthMM + 'mm tag=' + (tag || '(none)'));
    return sprite;
  }

  return {
    generateArcs:  generateArcs,
    createArcLine: createArcLine,
    extractLeafAxis: extractLeafAxis,
    findHinge:     findHinge,
    computeArcPoints: computeArcPoints,
    detectSwingDirection: detectSwingDirection,
    generateStairSymbol:    generateStairSymbol,
    generateWindowOpenings: generateWindowOpenings,
    addOpeningLabel: addOpeningLabel
  };
})();
