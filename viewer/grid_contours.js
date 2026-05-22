/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_contours.js — 2D Line Renderer (Single Responsibility: engine output → Three.js lines)
 *
 * Does NOT call engines. Receives pre-computed geometry and GridConfig styles,
 * produces Three.js line objects in a managed THREE.Group.
 *
 * API:
 *   GridContours.renderContours(APP, contourData, viewMode, cutZ)  → THREE.Group
 *   GridContours.renderEdges(APP, edgeData, viewMode, env)         → THREE.Group
 *   GridContours.renderLevelMarkers(APP, storeys, viewMode, env)   → THREE.Group
 *   GridContours.addDoorArcs(APP, doorArcs, viewMode, cutZ)
 *   GridContours.clear(APP)
 *   GridContours.activeGroup()
 *
 * Log tags: §CONTOUR_RENDER, §EDGE_RENDER, §LEVEL_MARKER, §CONTOUR_CLEAR
 */
var GridContours = (function() {
  'use strict';

  var _group = null;       // THREE.Group holding all contour/edge lines

  function log(msg) { console.log('[GridContours] ' + msg); }

  /** Ensure the contour group exists and is in the scene */
  function ensureGroup(APP) {
    if (!_group) {
      _group = new THREE.Group();
      _group.name = 'contourOverlay';
      _group.renderOrder = 1100;
    }
    if (!_group.parent) {
      APP.scene.add(_group);
    }
    return _group;
  }

  /** Dispose a Three.js object's geometry and material */
  function disposeObj(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  }

  // ── Section Contour Renderer ──────────────────────────────────────

  /**
   * Render section cut contours as Three.js Lines.
   * @param {Object} APP — viewer app
   * @param {Array} contourData — from SectionCut.sectionCut(): [{ifcClass, contours: [{points}]}]
   * @param {string} viewMode — 'floor' or 'floor1'
   * @param {number} cutZ — IFC Z of section cut
   * @returns {THREE.Group}
   */
  // Minimum wall outline width in metres — ensures walls remain visible on large buildings.
  // Computed from camera frustum: at least MIN_WALL_SCREEN_PX pixels wide.
  var MIN_WALL_SCREEN_PX = 3;

  /** Build a ribbon mesh along a polyline path — flat quad strip, width in metres.
   *  Used for structural outlines that must remain visible at any zoom. */
  function buildRibbon(threePoints, halfW, yPos, color) {
    if (threePoints.length < 2) return null;
    var positions = [];
    for (var i = 0; i < threePoints.length; i++) {
      // Compute perpendicular in XZ plane
      var dx, dz;
      if (i < threePoints.length - 1) {
        dx = threePoints[i + 1].x - threePoints[i].x;
        dz = threePoints[i + 1].z - threePoints[i].z;
      } else {
        dx = threePoints[i].x - threePoints[i - 1].x;
        dz = threePoints[i].z - threePoints[i - 1].z;
      }
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx = -dz / len * halfW;
      var nz = dx / len * halfW;
      // Two vertices per point — left and right of centerline
      positions.push(threePoints[i].x + nx, yPos, threePoints[i].z + nz);
      positions.push(threePoints[i].x - nx, yPos, threePoints[i].z - nz);
    }
    // Build triangle strip as indexed triangles
    var indices = [];
    for (var j = 0; j < threePoints.length - 1; j++) {
      var a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    var mat = new THREE.MeshBasicMaterial({
      color: color, side: THREE.DoubleSide, depthTest: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1101; // above fill (1099) and line (1100)
    return mesh;
  }

  function renderContours(APP, contourData, viewMode, cutZ) {
    var group = ensureGroup(APP);
    var lineCount = 0;
    var isDark = !APP.lightTheme;

    // Structural classes: filled polygons at true geometry — no artificial thickening.
    // White fill on dark bg → reverses to black on white (sunglasses toggle).
    var FILL_CLASSES = { 'IfcWall': 1, 'IfcWallStandardCase': 1, 'IfcColumn': 1 };
    var fillColor   = isDark ? '#ffffff' : '#000000';
    var strokeColor = isDark ? '#ffffff' : '#000000';
    var otherStroke = isDark ? '#aaaaaa' : '#666666';

    for (var i = 0; i < contourData.length; i++) {
      var el = contourData[i];
      var style = GridConfig.styleFor(viewMode, el.ifcClass);
      var contours = el.contours || [];
      var doFill = !!FILL_CLASSES[el.ifcClass];

      for (var c = 0; c < contours.length; c++) {
        var pts = contours[c].points || contours[c];
        if (!pts || pts.length < 2) continue;

        var threePoints = [];
        for (var p = 0; p < pts.length; p++) {
          var t = APP.ifc2three(pts[p][0], pts[p][1], cutZ);
          threePoints.push(new THREE.Vector3(t.x, t.y, t.z));
        }

        // Filled polygon for structural elements — true geometry, no ribbon
        if (doFill && threePoints.length >= 3) {
          var shape = new THREE.Shape();
          shape.moveTo(threePoints[0].x, threePoints[0].z);
          for (var sp = 1; sp < threePoints.length; sp++) {
            shape.lineTo(threePoints[sp].x, threePoints[sp].z);
          }
          shape.closePath();
          var shapeGeom = new THREE.ShapeGeometry(shape);
          shapeGeom.rotateX(-Math.PI / 2);
          var fillMat = new THREE.MeshBasicMaterial({
            color: fillColor, side: THREE.DoubleSide, depthTest: false
          });
          var fillMesh = new THREE.Mesh(shapeGeom, fillMat);
          fillMesh.position.y = threePoints[0].y;
          fillMesh.renderOrder = 1099;
          fillMesh.userData = { isContour: true, guid: el.guid, ifcClass: el.ifcClass };
          group.add(fillMesh);
        }

        // Outline stroke — white on dark, black on light. No invented colors.
        var lineColor = FILL_CLASSES[el.ifcClass] ? strokeColor : otherStroke;
        var geom = new THREE.BufferGeometry().setFromPoints(threePoints);
        var mat = new THREE.LineBasicMaterial({ color: lineColor, linewidth: style.weight || 1 });
        var line = new THREE.Line(geom, mat);
        line.renderOrder = 1100;
        line.userData = { isContour: true, guid: el.guid, ifcClass: el.ifcClass };
        group.add(line);
        lineCount++;
      }
    }

    APP.markDirty();
    log('§CONTOUR_RENDER mode=' + viewMode + ' elements=' + contourData.length + ' lines=' + lineCount);
    return group;
  }

  // ── Elevation Edge Renderer ───────────────────────────────────────

  /** Map elevation (h,v) back to IFC coords for a given face */
  function elevHVtoIFC(h, v, face, env) {
    var cy = (env.yMin + env.yMax) / 2;
    var cx = (env.xMin + env.xMax) / 2;
    switch (face) {
      case 'front': return { ix: h,  iy: cy, iz: v };
      case 'rear':  return { ix: -h, iy: cy, iz: v };
      case 'left':  return { ix: cx, iy: h,  iz: v };
      case 'right': return { ix: cx, iy: -h, iz: v };
      default:      return { ix: h,  iy: cy, iz: v };
    }
  }

  /**
   * Render elevation edges as Three.js LineSegments.
   * @param {Object} APP
   * @param {Array} edgeData — from Elevation.generateElevation(): [{ifcClass, edges: [[h0,v0,h1,v1]], depth}]
   * @param {string} viewMode — 'front','rear','left','right'
   * @param {Object} env — building envelope {xMin,xMax,yMin,yMax,zMin,zMax}
   * @returns {THREE.Group}
   */
  function renderEdges(APP, edgeData, viewMode, env) {
    var group = ensureGroup(APP);
    var segCount = 0;

    // Sort by depth (back to front) for proper overdraw
    edgeData.sort(function(a, b) { return b.depth - a.depth; });

    for (var i = 0; i < edgeData.length; i++) {
      var el = edgeData[i];
      var style = GridConfig.styleFor(viewMode, el.ifcClass);
      var edges = el.edges || [];
      if (edges.length === 0) continue;

      // Batch all edges of same element into one LineSegments
      var positions = [];
      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        var ifc0 = elevHVtoIFC(edge[0], edge[1], viewMode, env);
        var ifc1 = elevHVtoIFC(edge[2], edge[3], viewMode, env);
        var t0 = APP.ifc2three(ifc0.ix, ifc0.iy, ifc0.iz);
        var t1 = APP.ifc2three(ifc1.ix, ifc1.iy, ifc1.iz);
        positions.push(t0.x, t0.y, t0.z, t1.x, t1.y, t1.z);
      }

      var geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      var mat = new THREE.LineBasicMaterial({ color: style.color, linewidth: style.weight || 1 });
      var segs = new THREE.LineSegments(geom, mat);
      segs.renderOrder = 1100;
      segs.userData = { isContour: true, guid: el.guid, ifcClass: el.ifcClass };
      group.add(segs);
      segCount += edges.length;
    }

    // 3D meshes stay visible — elevation edges overlay on top.
    // User can toggle mesh visibility independently if desired.

    APP.markDirty();
    log('§EDGE_RENDER mode=' + viewMode + ' elements=' + edgeData.length + ' segments=' + segCount);
    return group;
  }

  // ── Level Markers ─────────────────────────────────────────────────

  /**
   * Render horizontal level markers on elevation views.
   * @param {Object} APP
   * @param {Array} storeys — from SectionCut.detectStoreys(): [{name, floorZ}]
   * @param {string} viewMode
   * @param {Object} env — building envelope
   * @returns {THREE.Group}
   */
  function renderLevelMarkers(APP, storeys, viewMode, env) {
    var markerCfg = GridConfig.levelMarkersFor(viewMode);
    if (!markerCfg || !markerCfg.enabled) return null;

    var group = ensureGroup(APP);
    var style = markerCfg.style || { color: '#666666', weight: 0.5 };
    var dash = style.dash || [0.3, 0.15];

    // Building width in the elevation's horizontal axis
    var hMin, hMax;
    if (viewMode === 'front' || viewMode === 'rear') {
      hMin = env.xMin; hMax = env.xMax;
    } else {
      hMin = env.yMin; hMax = env.yMax;
    }
    var margin = (hMax - hMin) * 0.15;

    for (var i = 0; i < storeys.length; i++) {
      var storey = storeys[i];
      var z = storey.floorZ;

      // Two endpoints of the level line
      var ifc0 = elevHVtoIFC(hMin - margin, z, viewMode, env);
      var ifc1 = elevHVtoIFC(hMax + margin, z, viewMode, env);
      var t0 = APP.ifc2three(ifc0.ix, ifc0.iy, ifc0.iz);
      var t1 = APP.ifc2three(ifc1.ix, ifc1.iy, ifc1.iz);
      var p0 = new THREE.Vector3(t0.x, t0.y, t0.z);
      var p1 = new THREE.Vector3(t1.x, t1.y, t1.z);

      var geom = new THREE.BufferGeometry().setFromPoints([p0, p1]);
      var mat = new THREE.LineDashedMaterial({
        color: style.color,
        linewidth: style.weight || 0.5,
        dashSize: dash[0],
        gapSize: dash[1]
      });
      var line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      line.renderOrder = 1050;
      line.userData = { isContour: true, isLevelMarker: true, storey: storey.name };
      group.add(line);

      log('§LEVEL_MARKER storey=' + storey.name + ' z=' + z.toFixed(2));
    }

    APP.markDirty();
    return group;
  }

  // ── Door Arcs ─────────────────────────────────────────────────────

  /**
   * Add door arcs to the contour group.
   * @param {Object} APP
   * @param {Array} arcs — from DoorArcs.generateArcs()
   * @param {string} viewMode
   * @param {number} cutZ
   */
  function addDoorArcs(APP, arcs, viewMode, cutZ) {
    if (!arcs || arcs.length === 0) return;
    var group = ensureGroup(APP);
    var style = GridConfig.styleFor(viewMode, 'IfcDoor');

    for (var i = 0; i < arcs.length; i++) {
      var arcLine = DoorArcs.createArcLine(arcs[i], APP.ifc2three, cutZ, style);
      arcLine.userData.isContour = true;
      group.add(arcLine);
    }

    APP.markDirty();
    log('§CONTOUR_RENDER door_arcs=' + arcs.length);
  }

  // ── Furniture Footprints (2D Pick Identity) ────────────────────────

  /**
   * Render furniture elements as 2D top-down bbox footprints.
   * Each rectangle carries userData.guid + userData.ifcClass for picking.
   * @param {Object} APP
   * @param {Array} furnitureData — [{guid, ifcClass, elementName, cx, cy, bx, by}] in IFC coords
   * @param {number} cutZ — IFC Z of section cut (for Y position in Three.js)
   */
  function renderFurniture(APP, furnitureData, cutZ) {
    if (!furnitureData || furnitureData.length === 0) return;
    var group = ensureGroup(APP);
    var isDark = !APP.lightTheme;
    var fillColor = isDark ? '#888888' : '#999999';
    var strokeColor = isDark ? '#aaaaaa' : '#666666';

    for (var i = 0; i < furnitureData.length; i++) {
      var el = furnitureData[i];
      var hw = (el.bx || 0.3) / 2;  // half-width in IFC X
      var hd = (el.by || 0.3) / 2;  // half-depth in IFC Y

      // Four corners of bbox footprint in IFC coords
      var corners = [
        [el.cx - hw, el.cy - hd],
        [el.cx + hw, el.cy - hd],
        [el.cx + hw, el.cy + hd],
        [el.cx - hw, el.cy + hd]
      ];

      // Convert to Three.js
      var threeCorners = corners.map(function(c) {
        var t = APP.ifc2three(c[0], c[1], cutZ);
        return new THREE.Vector3(t.x, t.y, t.z);
      });

      // Filled rectangle (subtle fill)
      var shape = new THREE.Shape();
      shape.moveTo(threeCorners[0].x, threeCorners[0].z);
      for (var s = 1; s < threeCorners.length; s++) {
        shape.lineTo(threeCorners[s].x, threeCorners[s].z);
      }
      shape.closePath();
      var shapeGeom = new THREE.ShapeGeometry(shape);
      shapeGeom.rotateX(-Math.PI / 2);
      var fillMat = new THREE.MeshBasicMaterial({
        color: fillColor, side: THREE.DoubleSide, depthTest: false,
        transparent: true, opacity: 0.4
      });
      var fillMesh = new THREE.Mesh(shapeGeom, fillMat);
      fillMesh.position.y = threeCorners[0].y;
      fillMesh.renderOrder = 1095;
      fillMesh.userData = { isContour: true, isFurniture: true, guid: el.guid, ifcClass: el.ifcClass, elementName: el.elementName };
      group.add(fillMesh);

      // Outline stroke
      threeCorners.push(threeCorners[0].clone()); // close the loop
      var geom = new THREE.BufferGeometry().setFromPoints(threeCorners);
      var mat = new THREE.LineBasicMaterial({ color: strokeColor, linewidth: 1 });
      var line = new THREE.Line(geom, mat);
      line.renderOrder = 1096;
      line.userData = { isContour: true, isFurniture: true, guid: el.guid, ifcClass: el.ifcClass, elementName: el.elementName };
      group.add(line);
    }

    APP.markDirty();
    log('§FURNITURE_RENDER count=' + furnitureData.length);
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  function clear(APP) {
    if (_group) {
      _group.traverse(function(obj) {
        if (obj !== _group) disposeObj(obj);
      });
      if (_group.parent) _group.parent.remove(_group);
      _group = null;
    }
    if (APP.markDirty) APP.markDirty();
    log('§CONTOUR_CLEAR done');
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    renderContours:     renderContours,
    renderEdges:        renderEdges,
    renderLevelMarkers: renderLevelMarkers,
    addDoorArcs:        addDoorArcs,
    renderFurniture:    renderFurniture,
    clear:              clear,
    activeGroup:        function() { return _group; }
  };
})();
