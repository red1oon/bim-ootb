/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * elevation.js — Architectural elevation generator from BIM database meshes.
 *
 * API: window.Elevation = { generateElevation(db, libDb, face), renderElevationEntities(elements, face) }
 *
 * Log tags: §EL_QUERY, §EL_LOAD, §EL_PROJECT, §EL_DEPTH_SORT, §EL_DONE
 *
 * face = 'front' | 'rear' | 'left' | 'right'
 * Projection: orthographic onto elevation plane, Z = vertical.
 * Hidden-line: back-to-front depth sort with overdraw.
 */
(function () {
  'use strict';

  // ── IFC class filter ──────────────────────────────────────────────
  var ELEVATION_CLASSES = new Set([
    'IfcWall', 'IfcWallStandardCase', 'IfcColumn', 'IfcSlab', 'IfcRoof',
    'IfcWindow', 'IfcDoor', 'IfcPlate', 'IfcBeam', 'IfcMember',
    'IfcCurtainWall', 'IfcStair', 'IfcRailing'
  ]);

  // ── Layer name mapping ────────────────────────────────────────────
  var CLASS_TO_LAYER = {
    'IfcWall':             'A-ELEV-WALL',
    'IfcWallStandardCase': 'A-ELEV-WALL',
    'IfcColumn':           'A-ELEV-COLS',
    'IfcSlab':             'A-ELEV-SLAB',
    'IfcRoof':             'A-ELEV-ROOF',
    'IfcWindow':           'A-ELEV-GLAZ',
    'IfcDoor':             'A-ELEV-DOOR',
    'IfcPlate':            'A-ELEV-GLAZ',
    'IfcBeam':             'A-ELEV-BEAM',
    'IfcMember':           'A-ELEV-MEMB',
    'IfcCurtainWall':      'A-ELEV-GLAZ',
    'IfcStair':            'A-ELEV-STRS',
    'IfcRailing':          'A-ELEV-RAIL'
  };

  // ── Projection axis config ────────────────────────────────────────
  // Each face defines: hAxis, vAxis, depthAxis, depthSign, and the
  // bounding-box column prefix used for pre-filtering (min/max on depth axis).
  var FACE_CONFIG = {
    //                   h(x)   v(z)   depth    depthSign  filterAxis
    front:  { hSign: 1,  vSign: 1, depthFn: function(x,y,z){ return -y; }, filterAxis: 'Y', filterSide: 'min' },
    rear:   { hSign: -1, vSign: 1, depthFn: function(x,y,z){ return  y; }, filterAxis: 'Y', filterSide: 'max' },
    left:   { hSign: 1,  vSign: 1, depthFn: function(x,y,z){ return -x; }, filterAxis: 'X', filterSide: 'min' },
    right:  { hSign: -1, vSign: 1, depthFn: function(x,y,z){ return  x; }, filterAxis: 'X', filterSide: 'max' }
  };

  // ── Helpers ───────────────────────────────────────────────────────

  function projectVertex(x, y, z, face) {
    switch (face) {
      case 'front': return { h:  x, v: z, d: -y };
      case 'rear':  return { h: -x, v: z, d:  y };
      case 'left':  return { h:  y, v: z, d: -x };
      case 'right': return { h: -y, v: z, d:  x };
    }
  }

  /** Round to 1mm precision for edge dedup. */
  function r1(val) {
    return Math.round(val * 1000) / 1000;
  }

  /** Canonical edge key — smaller point first. */
  function edgeKey(h0, v0, h1, v1) {
    var a0 = r1(h0), a1 = r1(v0), b0 = r1(h1), b1 = r1(v1);
    if (a0 < b0 || (a0 === b0 && a1 < b1)) {
      return a0 + ',' + a1 + ',' + b0 + ',' + b1;
    }
    return b0 + ',' + b1 + ',' + a0 + ',' + a1;
  }

  function hasTable(db, name) {
    var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + name + "'");
    return r.length > 0 && r[0].values.length > 0;
  }

  /** Load geometry from db, fallback to libDb. Tries both base_geometries and component_geometries. */
  function loadGeometry(db, libDb, geometryHash) {
    var escaped = geometryHash.replace(/'/g, "''");
    var tables = ['base_geometries', 'component_geometries'];
    var dbs = [db];
    if (libDb && libDb !== db) dbs.push(libDb);
    var result = null;
    for (var di = 0; di < dbs.length && !result; di++) {
      for (var ti = 0; ti < tables.length && !result; ti++) {
        try {
          if (!hasTable(dbs[di], tables[ti])) continue;
          var r = dbs[di].exec("SELECT vertices, faces, vertex_count, face_count FROM " +
                               tables[ti] + " WHERE geometry_hash = '" + escaped + "' LIMIT 1");
          if (r && r.length > 0 && r[0].values.length > 0) result = r;
        } catch (e) { /* ignore */ }
      }
    }
    if (!result || result.length === 0 || result[0].values.length === 0) return null;

    var row = result[0].values[0];
    var vertBlob = row[0];
    var faceBlob = row[1];
    var vertCount = row[2];
    var faceCount = row[3];

    if (!vertBlob || !faceBlob) return null;

    var verts, faces;
    // Handle Uint8Array blobs → typed arrays (copy to aligned buffer for safety)
    if (vertBlob instanceof Uint8Array || vertBlob instanceof ArrayBuffer) {
      var vBuf = new ArrayBuffer(vertCount * 3 * 4);
      new Uint8Array(vBuf).set(vertBlob instanceof Uint8Array ? vertBlob : new Uint8Array(vertBlob));
      verts = new Float32Array(vBuf);
    } else {
      return null;
    }
    if (faceBlob instanceof Uint8Array || faceBlob instanceof ArrayBuffer) {
      var fBuf = new ArrayBuffer(faceCount * 3 * 4);
      new Uint8Array(fBuf).set(faceBlob instanceof Uint8Array ? faceBlob : new Uint8Array(faceBlob));
      faces = new Int32Array(fBuf);
    } else if (faceBlob instanceof ArrayBuffer) {
      faces = new Int32Array(faceBlob, 0, faceCount * 3);
    } else {
      return null;
    }
    return { verts: verts, faces: faces };
  }

  /** Compute global bounding box on transform axis. */
  function getGlobalBounds(db, axis) {
    // Try rtree first, fall back to element_transforms
    var colMap = { X: 'center_x', Y: 'center_y', Z: 'center_z' };
    var col = colMap[axis];
    var useRtree = hasTable(db, 'elements_rtree');
    var sql;
    if (useRtree) {
      sql = 'SELECT MIN(min' + axis + '), MAX(max' + axis + ') FROM elements_rtree';
    } else {
      sql = 'SELECT MIN(' + col + '), MAX(' + col + ') FROM element_transforms';
    }
    var result;
    try { result = db.exec(sql); } catch (e) { return null; }
    if (!result || result.length === 0 || result[0].values.length === 0) return null;
    return { gmin: result[0].values[0][0], gmax: result[0].values[0][1] };
  }

  // ── generateElevation ─────────────────────────────────────────────

  function generateElevation(db, libDb, face) {
    var t0 = performance.now();
    var cfg = FACE_CONFIG[face];
    if (!cfg) throw new Error('Invalid face: ' + face);

    var axis = cfg.filterAxis;
    var bounds = getGlobalBounds(db, axis);
    if (!bounds) { console.warn('§EL_QUERY face=' + face + ' candidates=0 (no bounds data)'); return []; }

    // Project ALL elements — no depth filter. Architectural elevations flatten
    // the entire building onto the view plane. Depth sort handles visibility.
    var result = null;
    var sql = 'SELECT em.guid, em.ifc_class, ei.geometry_hash, ' +
              'et.center_x, et.center_y, et.center_z ' +
              'FROM elements_meta em ' +
              'JOIN element_instances ei ON ei.guid = em.guid ' +
              'JOIN element_transforms et ON et.guid = em.guid';
    try { result = db.exec(sql); } catch (e) { result = null; }

    if (!result || result.length === 0) {
      console.log('§EL_QUERY face=' + face + ' candidates=0');
      return [];
    }

    var rows = result[0].values;
    var candidates = [];
    for (var i = 0; i < rows.length; i++) {
      if (ELEVATION_CLASSES.has(rows[i][1])) {
        candidates.push(rows[i]);
      }
    }
    console.log('§EL_QUERY face=' + face + ' candidates=' + candidates.length +
                ' (from ' + rows.length + ' total elements, full projection)');

    if (candidates.length === 0) return [];

    // ── Project each element ──────────────────────────────────────
    var elements = [];
    var totalEdgesRaw = 0;
    var totalEdgesDedup = 0;
    var logged = 0;

    for (var c = 0; c < candidates.length; c++) {
      var row = candidates[c];
      var guid = row[0];
      var ifcClass = row[1];
      var geoHash = row[2];
      var cx = row[3], cy = row[4], cz = row[5];

      var geom = loadGeometry(db, libDb, geoHash);
      if (!geom) continue;

      var verts = geom.verts;
      var faces = geom.faces;
      var vertCount = verts.length / 3;
      var faceCount = faces.length / 3;

      if (logged < 5) {
        console.log('§EL_LOAD guid=' + guid.substring(0, 8) + '.. verts=' + vertCount + ' faces=' + faceCount);
        logged++;
      }

      // Project vertices
      var projected = new Array(vertCount);
      var depthSum = 0;
      for (var vi = 0; vi < vertCount; vi++) {
        var wx = verts[vi * 3]     + cx;
        var wy = verts[vi * 3 + 1] + cy;
        var wz = verts[vi * 3 + 2] + cz;
        var p = projectVertex(wx, wy, wz, face);
        projected[vi] = p;
        depthSum += p.d;
      }
      var meanDepth = vertCount > 0 ? depthSum / vertCount : 0;

      // Extract + deduplicate triangle edges
      var edgeSet = new Set();
      var edges = [];
      for (var fi = 0; fi < faceCount; fi++) {
        var i0 = faces[fi * 3], i1 = faces[fi * 3 + 1], i2 = faces[fi * 3 + 2];
        if (i0 >= vertCount || i1 >= vertCount || i2 >= vertCount) continue;

        var triEdges = [[i0, i1], [i1, i2], [i2, i0]];
        for (var ei = 0; ei < 3; ei++) {
          var a = projected[triEdges[ei][0]];
          var b = projected[triEdges[ei][1]];
          var key = edgeKey(a.h, a.v, b.h, b.v);
          totalEdgesRaw++;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([a.h, a.v, b.h, b.v]);
          }
        }
      }
      totalEdgesDedup += edges.length;

      if (edges.length > 0) {
        elements.push({
          guid: guid,
          ifcClass: ifcClass,
          edges: edges,
          depth: meanDepth
        });
      }
    }

    if (logged >= 5 && candidates.length > 5) {
      console.log('§EL_LOAD ... (' + (candidates.length - 5) + ' more elements)');
    }

    console.log('§EL_PROJECT elements=' + elements.length +
                ' edges=' + totalEdgesRaw + ' deduplicated=' + totalEdgesDedup);

    // ── Depth sort (back-to-front: largest depth first) ───────────
    elements.sort(function (a, b) { return a.depth - b.depth; });

    if (elements.length > 0) {
      var dMin = elements[0].depth;
      var dMax = elements[elements.length - 1].depth;
      console.log('§EL_DEPTH_SORT min=' + dMin.toFixed(3) + ' max=' + dMax.toFixed(3) +
                  ' range=' + (dMax - dMin).toFixed(3));
    }

    var elapsed = performance.now() - t0;
    console.log('§EL_DONE face=' + face + ' elements=' + elements.length +
                ' edges=' + totalEdgesDedup + ' time=' + elapsed.toFixed(0) + 'ms');

    return elements;
  }

  // ── renderElevationEntities ───────────────────────────────────────

  function renderElevationEntities(elements, face) {
    var commands = [];
    // Elements are already sorted back-to-front from generateElevation.
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var layer = CLASS_TO_LAYER[el.ifcClass] || 'A-ELEV-OTHR';
      var edges = el.edges;
      for (var e = 0; e < edges.length; e++) {
        commands.push({
          type: 'line',
          x0: edges[e][0],
          y0: edges[e][1],
          x1: edges[e][2],
          y1: edges[e][3],
          layer: layer,
          guid: el.guid,
          ifcClass: el.ifcClass,
          depth: el.depth
        });
      }
    }
    return commands;
  }

  // ── Expose API ────────────────────────────────────────────────────
  window.Elevation = {
    generateElevation: generateElevation,
    renderElevationEntities: renderElevationEntities
  };

})();
