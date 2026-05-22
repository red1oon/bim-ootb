/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// scene_to_db.js — S228: Convert parsed 3D scene → DB contract
// Depends: SemanticEnrichment (from semantic_enrichment.js)
// Implementing S228_import_format_to_db.md §File 2 — Witness: W-SCENEDB

function extractMesh(mesh, prefix, index, yUpSwap, scaleFactor) {
  var geom = mesh.geometry;
  var pos = geom.attributes.position;
  var vCount = pos.count;
  if (vCount === 0) return null;

  // World transform
  mesh.updateWorldMatrix(true, false);
  var m = mesh.matrixWorld.elements;

  // Transform vertices to world space
  var worldVerts = new Float32Array(vCount * 3);
  var sumX = 0, sumY = 0, sumZ = 0;
  var minX = Infinity, minY = Infinity, minZ = Infinity;
  var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (var i = 0; i < vCount; i++) {
    var lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
    var wx = m[0]*lx + m[4]*ly + m[8]*lz  + m[12];
    var wy = m[1]*lx + m[5]*ly + m[9]*lz  + m[13];
    var wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
    // S228c: Y-up → IFC Z-up per-vertex swap (same as import_worker.js)
    // (x, y, z) → (x, -z, y) — viewer's ifc2three then renders correctly
    if (yUpSwap) {
      var tmp = wy;
      wy = -wz;
      wz = tmp;
    }
    // Apply global scale (computed from height axis range)
    wx *= scaleFactor; wy *= scaleFactor; wz *= scaleFactor;
    worldVerts[i*3] = wx; worldVerts[i*3+1] = wy; worldVerts[i*3+2] = wz;
    sumX += wx; sumY += wy; sumZ += wz;
    if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
  }

  // Centroid
  var cx = sumX / vCount, cy = sumY / vCount, cz = sumZ / vCount;

  // Re-center at origin
  var centered = new Float32Array(vCount * 3);
  for (var j = 0; j < vCount; j++) {
    centered[j*3]   = worldVerts[j*3]   - cx;
    centered[j*3+1] = worldVerts[j*3+1] - cy;
    centered[j*3+2] = worldVerts[j*3+2] - cz;
  }

  // Faces
  var indices;
  if (geom.index) {
    indices = new Int32Array(geom.index.array);
  } else {
    indices = new Int32Array(vCount);
    for (var j = 0; j < vCount; j++) indices[j] = j;
  }

  // Semantic enrichment
  var SE = self.SemanticEnrichment;
  var nodeName   = mesh.name || 'unnamed';
  var parentName = mesh.parent ? (mesh.parent.name || '') : '';
  var matObj     = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  var matName    = matObj ? (matObj.name || '') : '';
  var cls        = SE.classify(nodeName, matName, parentName);
  var storey     = SE.classifyStorey(cz);
  var rgba       = SE.extractRGBA(mesh.material);
  var guid       = SE.generateGUID(prefix, nodeName, vCount, [minX,minY,minZ], [maxX,maxY,maxZ]);
  var displayName = (nodeName !== 'unnamed') ? nodeName : (matName || 'Element_' + index);

  return {
    element:   { guid: guid, ifcClass: cls.ifcClass, name: displayName, storey: storey, discipline: cls.disc, material: rgba },
    transform: { guid: guid, cx: cx, cy: cy, cz: cz, rx: 0, ry: 0, rz: 0 },
    geometry:  { guid: guid, geomHash: guid, vertices: centered.buffer, indices: indices.buffer },
  };
}

// S228c: scan scene bounding box to detect up-axis and compute scale factor
// Returns { upAxis: 'y-up'|'z-up', heightRange: number, scaleFactor: number }
function analyseScene(scene) {
  var minY = Infinity, maxY = -Infinity;
  var minZ = Infinity, maxZ = -Infinity;
  scene.traverse(function(child) {
    if (!child.isMesh || !child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) return;
    child.updateWorldMatrix(true, false);
    var pos = child.geometry.attributes.position;
    var m = child.matrixWorld.elements;
    // Sample every 100th vertex (fast, covers full range)
    var step = Math.max(1, Math.floor(pos.count / 100));
    for (var i = 0; i < pos.count; i += step) {
      var lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      var wy = m[1]*lx + m[5]*ly + m[9]*lz  + m[13];
      var wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
    }
  });
  var rangeY = maxY - minY;
  var rangeZ = maxZ - minZ;

  // Detect up-axis: height axis has smaller range for buildings
  var upAxis;
  if (rangeZ > 0 && rangeY > 0 && rangeZ < rangeY * 0.5) {
    upAxis = 'z-up';
  } else if (rangeY > 0 && rangeZ > 0 && rangeY < rangeZ * 0.5) {
    upAxis = 'y-up';
  } else if (minY >= -1 && minZ < -1) {
    upAxis = 'y-up';
  } else if (minZ >= -1 && minY < -1) {
    upAxis = 'z-up';
  } else {
    upAxis = 'y-up';  // OBJ/DAE/GLB default
  }

  // Height range in the detected up-axis
  var heightRange = (upAxis === 'y-up') ? rangeY : rangeZ;

  // Auto-scale based on height range (buildings are 3-100m tall)
  // height < 50       → metres, no scale
  // height 50-500     → could be feet or decimetres, scale ÷ 0.3048 is fragile, use ÷10
  // height 500-5000   → centimetres, ÷100
  // height > 5000     → millimetres, ÷1000
  var scaleFactor = 1.0;
  if (heightRange > 5000) {
    scaleFactor = 0.001;  // mm → m
  } else if (heightRange > 500) {
    scaleFactor = 0.01;   // cm → m
  } else if (heightRange > 50) {
    scaleFactor = 0.1;    // dm or mixed → m
  }
  // else: already metres

  return { upAxis: upAxis, heightRange: heightRange, scaleFactor: scaleFactor };
}

function sceneToDb(scene, filename, ext, options) {
  var opts = options || {};
  var yUpToZUp = (opts.yUpToZUp !== false);  // default true
  var prefix = ext.toUpperCase();

  // S228c: analyse scene for up-axis and scale
  var Y_UP_FORMATS = { dae:1, obj:1, glb:1, gltf:1 };
  var analysis = analyseScene(scene);
  var yUpSwap = false;
  if (yUpToZUp && Y_UP_FORMATS[ext]) {
    yUpSwap = (analysis.upAxis === 'y-up');
  }
  var scaleFactor = analysis.scaleFactor;
  console.log('[S228c] §SCENE_ANALYSE ext=' + ext +
    ' upAxis=' + analysis.upAxis + ' yUpSwap=' + yUpSwap +
    ' heightRange=' + analysis.heightRange.toFixed(1) +
    ' scaleFactor=' + scaleFactor);

  var elements = [], geometries = [], transforms = [];
  var discCounts = {};
  var storeySet = {};
  var meshIndex = 0;

  scene.traverse(function(child) {
    if (!child.isMesh) return;
    var geom = child.geometry;
    if (!geom || !geom.attributes || !geom.attributes.position) return;

    var result = extractMesh(child, prefix, meshIndex, yUpSwap, scaleFactor);
    if (!result) return;

    elements.push(result.element);
    transforms.push(result.transform);
    geometries.push(result.geometry);

    discCounts[result.element.discipline] = (discCounts[result.element.discipline] || 0) + 1;
    storeySet[result.element.storey] = true;
    meshIndex++;
  });

  return {
    elements: elements,
    geometries: geometries,
    transforms: transforms,
    meta: {
      name: filename.replace(/\.[^.]+$/, ''),
      filename: filename,
      elementCount: elements.length,
      geomCount: geometries.length,
      disciplines: discCounts,
      storeys: Object.keys(storeySet),
      sourceFormat: '.' + ext,
    },
  };
}

// Export
if (typeof self !== 'undefined') {
  self.SceneToDb = { sceneToDb: sceneToDb, extractMesh: extractMesh };
}
if (typeof module !== 'undefined') {
  module.exports = { sceneToDb: sceneToDb, extractMesh: extractMesh };
}
