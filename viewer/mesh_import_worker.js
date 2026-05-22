/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// mesh_import_worker.js — S228: Parse non-IFC 3D files via Three.js loaders
// Input:  postMessage({ arrayBuffer, filename, ext })
// Output: same contract as import_worker.js (IFC worker)
//         { type: 'done', meta, elements, geometries, transforms }
// Implementing S228_drop_zone_multi_format.md §Part C — Witness: W-MESH-WORKER

// ── Load dependencies ──
// Three.js r128 (same version as viewer) provides global THREE
importScripts('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
// fflate required by FBXLoader for binary decompression
importScripts('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/fflate.min.js');
importScripts('semantic_enrichment.js');
importScripts('scene_to_db.js');

// ── Loader CDN map (r128 examples/js — sets THREE.<Loader>) ──
var LOADER_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/';
var LOADER_MAP = {
  'obj':  { script: 'OBJLoader.js',      className: 'OBJLoader',      parse: 'text' },
  'stl':  { script: 'STLLoader.js',      className: 'STLLoader',      parse: 'buffer' },
  'dae':  { script: 'ColladaLoader.js',  className: 'ColladaLoader',  parse: 'text' },
  'glb':  { script: 'GLTFLoader.js',     className: 'GLTFLoader',     parse: 'buffer' },
  'gltf': { script: 'GLTFLoader.js',     className: 'GLTFLoader',     parse: 'text' },
  'fbx':  { script: 'FBXLoader.js',      className: 'FBXLoader',      parse: 'buffer' },
  '3ds':  { script: 'TDSLoader.js',      className: 'TDSLoader',      parse: 'buffer' },
};

function postProgress(pct, phase) {
  postMessage({ type: 'progress', pct: pct, phase: phase });
}

// ── Parse OBJ text into a Three.js scene ──
function parseOBJ(text) {
  var loader = new THREE.OBJLoader();
  return loader.parse(text);
}

// ── Parse DAE text into a Three.js scene ──
// S228d: ColladaLoader returns { scene } not a scene directly.
// Needs DOMParser — available in workers (Chrome 76+, Firefox 65+, Safari 15+).
function parseDAE(text) {
  var loader = new THREE.ColladaLoader();
  var result = loader.parse(text);
  return result.scene;
}

// ── Parse STL buffer into a Three.js scene ──
function parseSTL(buffer) {
  var loader = new THREE.STLLoader();
  var geom = loader.parse(buffer);
  var mesh = new THREE.Mesh(geom);
  mesh.name = 'STL_solid';
  var scene = new THREE.Group();
  scene.add(mesh);
  return scene;
}

// ── Parse GLB/GLTF → Three.js scene ──
// GLTFLoader.parse is async (callback-based). Returns { scene }.
function parseGLB(buffer) {
  return new Promise(function(resolve, reject) {
    var loader = new THREE.GLTFLoader();
    loader.parse(buffer, '', function(gltf) {
      resolve(gltf.scene);
    }, function(err) {
      reject(new Error('GLTFLoader: ' + (err.message || err)));
    });
  });
}

function parseGLTF(text) {
  // GLTF text → parse as JSON buffer
  var encoder = new TextEncoder();
  var buffer = encoder.encode(text).buffer;
  return parseGLB(buffer);
}

// ── Parse FBX buffer → Three.js scene ──
function parseFBX(buffer) {
  var loader = new THREE.FBXLoader();
  return loader.parse(buffer);
}

// ── Parse 3DS buffer → Three.js scene ──
function parse3DS(buffer) {
  var loader = new THREE.TDSLoader();
  return loader.parse(buffer);
}

// ── Entry point (async for GLB/GLTF callback-based parsing) ──
self.onmessage = async function(e) {
  var data = e.data;
  var arrayBuffer = data.arrayBuffer;
  var filename = data.filename;
  var ext = data.ext;

  try {
    postProgress(5, 'Loading 3D engine...');

    var loaderInfo = LOADER_MAP[ext];
    if (!loaderInfo) {
      postMessage({ type: 'error', message: 'Unsupported format in worker: .' + ext +
        '. Supported: ' + Object.keys(LOADER_MAP).join(', ') });
      return;
    }

    // Load the format-specific loader
    importScripts(LOADER_CDN + loaderInfo.script);

    postProgress(20, 'Parsing ' + ext.toUpperCase() + ' file...');

    var scene;
    if (loaderInfo.parse === 'text') {
      var text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
      if (ext === 'obj')       scene = parseOBJ(text);
      else if (ext === 'dae')  scene = parseDAE(text);
      else if (ext === 'gltf') scene = await parseGLTF(text);
    } else if (loaderInfo.parse === 'buffer') {
      if (ext === 'stl')       scene = parseSTL(arrayBuffer);
      else if (ext === 'glb')  scene = await parseGLB(arrayBuffer);
      else if (ext === 'fbx')  scene = parseFBX(arrayBuffer);
      else if (ext === '3ds')  scene = parse3DS(arrayBuffer);
    }

    if (!scene) {
      postMessage({ type: 'error', message: 'Failed to parse ' + ext.toUpperCase() + ' file' });
      return;
    }

    postProgress(50, 'Classifying elements...');

    // Use scene_to_db.js from S228a
    var STD = self.SceneToDb;
    var result = STD.sceneToDb(scene, filename, ext, { yUpToZUp: true });

    postProgress(90, 'Packaging ' + result.meta.elementCount + ' elements...');

    console.log('[S228] §WORKER_DONE elements=' + result.meta.elementCount +
      ' geom=' + result.meta.geomCount + ' format=' + result.meta.sourceFormat +
      ' storeys=' + result.meta.storeys.join(',') +
      ' disciplines=' + JSON.stringify(result.meta.disciplines));

    // Transfer ArrayBuffers for zero-copy
    var transferables = [];
    for (var i = 0; i < result.geometries.length; i++) {
      transferables.push(result.geometries[i].vertices);
      transferables.push(result.geometries[i].indices);
    }

    postMessage({
      type: 'done',
      meta: result.meta,
      elements: result.elements,
      transforms: result.transforms,
      geometries: result.geometries,
    }, transferables);

  } catch(err) {
    console.error('[S228] §WORKER_ERROR', err);
    postMessage({ type: 'error', message: err.message || String(err) });
  }
};
