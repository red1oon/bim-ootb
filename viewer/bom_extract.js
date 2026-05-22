/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bom_extract.js — JS BOM extractor (replaces Java IFCtoBOMPipeline for browser)
// Implementing NEW_FROM_REFERENCE.md §5 — Witness: W-BOM-JS
//
// Reads elements_meta + element_transforms from building.db (already in A.db),
// produces a BOM tree cached as JSON in IndexedDB.
// One building, one BOM, one pass. No verb expansion, no component_library.

(function(window) {
'use strict';

// ── BOM Tree Structure ──────────────────────────────────────────────────────
// {
//   building: 'SampleCastle',
//   envelope: { minX, maxX, minY, maxY, minZ, maxZ, width, depth, height },
//   storeys: [
//     { name: '00 begane grond', minZ, maxZ, height,
//       disciplines: [
//         { name: 'ARC',
//           classes: [
//             { ifc_class: 'IfcWall', count: 226, elements: [...guids],
//               aabb: { minX, maxX, minY, maxY, minZ, maxZ } },
//             ...
//           ]
//         }, ...
//       ]
//     }, ...
//   ],
//   storeyHeights: [3.6, 3.2, ...],    // floor-to-floor deltas
//   bayProportions: [1.0, 0.75, ...],   // from GridDims if available
//   elementCount: 3284,
//   extractedAt: '2026-05-21T...'
// }

var BOM_IDB_STORE = 'bim_ootb_bom';

/**
 * extractBOM(A) — main entry point
 * @param {object} A — the APP object with A.db, A.activeBuilding, A.dbQuery
 * @returns {object} BOM tree, also cached in IndexedDB
 */
function extractBOM(A) {
  if (!A || !A.db) {
    console.warn('§BOM_EXTRACT no db');
    return null;
  }
  var t0 = performance.now();
  var building = A.activeBuilding || 'unknown';

  // ── 1. Query all elements with transforms ──
  var rows = A.dbQuery(
    'SELECT m.guid, m.ifc_class, m.storey, m.discipline, m.material_name, m.material_rgba, ' +
    '       t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z ' +
    'FROM elements_meta m ' +
    'JOIN element_transforms t ON m.guid = t.guid ' +
    'ORDER BY m.storey, m.discipline, m.ifc_class'
  );

  if (!rows.length) {
    console.warn('§BOM_EXTRACT no elements found');
    return null;
  }

  // ── 2. Build grouped tree ──
  var storeyMap = {};  // storey_name → { disciplines: { disc → { classes: { class → {elements} } } } }
  // Envelope from structural classes only — outliers (proxy, site, furniture) stretch AABB.
  // Fallback to all elements if no structural classes found.
  var ENV_CLASSES = {
    IfcColumn: 1, IfcPile: 1, IfcWall: 1, IfcWallStandardCase: 1,
    IfcSlab: 1, IfcBeam: 1, IfcFooting: 1, IfcCurtainWall: 1, IfcRoof: 1
  };
  var envMinX = Infinity, envMaxX = -Infinity;
  var envMinY = Infinity, envMaxY = -Infinity;
  var envMinZ = Infinity, envMaxZ = -Infinity;
  var allMinX = Infinity, allMaxX = -Infinity;
  var allMinY = Infinity, allMaxY = -Infinity;
  var allMinZ = Infinity, allMaxZ = -Infinity;
  var hasStructural = false;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var guid = r[0], ifcClass = r[1], storey = r[2] || 'Unknown';
    var disc = r[3] || 'ARC', matName = r[4], matRgba = r[5];
    var cx = r[6], cy = r[7], cz = r[8];
    var bx = r[9], by = r[10], bz = r[11];  // half-extents

    // element AABB from center + half-extents
    var eMinX = cx - bx, eMaxX = cx + bx;
    var eMinY = cy - by, eMaxY = cy + by;
    var eMinZ = cz - bz, eMaxZ = cz + bz;

    // All-elements envelope (fallback)
    if (eMinX < allMinX) allMinX = eMinX;
    if (eMaxX > allMaxX) allMaxX = eMaxX;
    if (eMinY < allMinY) allMinY = eMinY;
    if (eMaxY > allMaxY) allMaxY = eMaxY;
    if (eMinZ < allMinZ) allMinZ = eMinZ;
    if (eMaxZ > allMaxZ) allMaxZ = eMaxZ;

    // Structural-only envelope
    if (ENV_CLASSES[ifcClass]) {
      hasStructural = true;
      if (eMinX < envMinX) envMinX = eMinX;
      if (eMaxX > envMaxX) envMaxX = eMaxX;
      if (eMinY < envMinY) envMinY = eMinY;
      if (eMaxY > envMaxY) envMaxY = eMaxY;
      if (eMinZ < envMinZ) envMinZ = eMinZ;
      if (eMaxZ > envMaxZ) envMaxZ = eMaxZ;
    }

    // group: storey → discipline → ifc_class
    if (!storeyMap[storey]) storeyMap[storey] = { minZ: Infinity, maxZ: -Infinity, disciplines: {} };
    var s = storeyMap[storey];
    if (eMinZ < s.minZ) s.minZ = eMinZ;
    if (eMaxZ > s.maxZ) s.maxZ = eMaxZ;

    if (!s.disciplines[disc]) s.disciplines[disc] = {};
    var d = s.disciplines[disc];

    if (!d[ifcClass]) d[ifcClass] = {
      count: 0, guids: [],
      minX: Infinity, maxX: -Infinity,
      minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
      materials: {}
    };
    var c = d[ifcClass];
    c.count++;
    c.guids.push(guid);
    if (eMinX < c.minX) c.minX = eMinX;
    if (eMaxX > c.maxX) c.maxX = eMaxX;
    if (eMinY < c.minY) c.minY = eMinY;
    if (eMaxY > c.maxY) c.maxY = eMaxY;
    if (eMinZ < c.minZ) c.minZ = eMinZ;
    if (eMaxZ > c.maxZ) c.maxZ = eMaxZ;
    if (matName) c.materials[matName] = (c.materials[matName] || 0) + 1;
  }

  // ── 3. Sort storeys by Z, compute heights ──
  var storeyNames = Object.keys(storeyMap);
  storeyNames.sort(function(a, b) { return storeyMap[a].minZ - storeyMap[b].minZ; });

  var storeys = [];
  var storeyHeights = [];
  for (var si = 0; si < storeyNames.length; si++) {
    var sName = storeyNames[si];
    var sData = storeyMap[sName];
    var height = sData.maxZ - sData.minZ;

    // floor-to-floor: delta to next storey's minZ, or own height if last
    var floorToFloor = height;
    if (si < storeyNames.length - 1) {
      floorToFloor = storeyMap[storeyNames[si + 1]].minZ - sData.minZ;
    }
    storeyHeights.push(Math.round(floorToFloor * 1000) / 1000);

    // build discipline array
    var discArr = [];
    var discNames = Object.keys(sData.disciplines).sort();
    for (var di = 0; di < discNames.length; di++) {
      var dName = discNames[di];
      var dData = sData.disciplines[dName];
      var classArr = [];
      var classNames = Object.keys(dData).sort();
      for (var ci = 0; ci < classNames.length; ci++) {
        var cName = classNames[ci];
        var cData = dData[cName];
        classArr.push({
          ifc_class: cName,
          count: cData.count,
          elements: cData.guids,
          aabb: {
            minX: cData.minX, maxX: cData.maxX,
            minY: cData.minY, maxY: cData.maxY,
            minZ: cData.minZ, maxZ: cData.maxZ
          },
          materials: cData.materials
        });
      }
      discArr.push({ name: dName, classes: classArr });
    }

    storeys.push({
      name: sName,
      minZ: sData.minZ,
      maxZ: sData.maxZ,
      height: Math.round(height * 1000) / 1000,
      disciplines: discArr
    });
  }

  // ── 4. Bay proportions from GridDims (if available) ──
  var bayProportions = null;
  if (window.GridDims && typeof GridDims.detectGrids === 'function') {
    try {
      var grids = GridDims.detectGrids();
      if (grids && grids.xSpans && grids.xSpans.length > 1) {
        var maxSpan = Math.max.apply(null, grids.xSpans);
        bayProportions = grids.xSpans.map(function(s) {
          return Math.round((s / maxSpan) * 100) / 100;
        });
      }
      console.log('§BOM_GRIDS xSpans=' + (grids && grids.xSpans ? grids.xSpans.length : 0));
    } catch(e) {
      console.warn('§BOM_GRIDS_ERR', e.message);
    }
  }

  // ── 5. Structural cadence — column positions per storey ──
  var columnPositions = A.dbQuery(
    'SELECT t.center_x, t.center_y, t.center_z, m.storey ' +
    'FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid ' +
    'WHERE m.ifc_class IN (\'IfcColumn\', \'IfcPile\') ' +
    'ORDER BY m.storey, t.center_x, t.center_y'
  );
  var cadence = null;
  if (columnPositions.length >= 2) {
    var colX = columnPositions.map(function(r) { return r[0]; });
    colX.sort(function(a, b) { return a - b; });
    // deduplicate close positions (within 0.1m)
    var uniqueX = [colX[0]];
    for (var ui = 1; ui < colX.length; ui++) {
      if (colX[ui] - uniqueX[uniqueX.length - 1] > 0.1) uniqueX.push(colX[ui]);
    }
    if (uniqueX.length >= 2) {
      var spacings = [];
      for (var xi = 1; xi < uniqueX.length; xi++) {
        spacings.push(Math.round((uniqueX[xi] - uniqueX[xi - 1]) * 1000) / 1000);
      }
      cadence = { uniqueX: uniqueX, spacings: spacings, count: columnPositions.length };
    }
  }

  // ── 6. Assemble BOM tree ──
  // Fallback: if no structural classes, use all-elements envelope
  if (!hasStructural) {
    envMinX = allMinX; envMaxX = allMaxX;
    envMinY = allMinY; envMaxY = allMaxY;
    envMinZ = allMinZ; envMaxZ = allMaxZ;
    console.log('§BOM_ENVELOPE fallback to all elements (no structural classes)');
  } else {
    console.log('§BOM_ENVELOPE structural-only' +
      ' all=' + Math.round((allMaxX-allMinX)*1000)/1000 + 'x' + Math.round((allMaxY-allMinY)*1000)/1000 +
      ' struct=' + Math.round((envMaxX-envMinX)*1000)/1000 + 'x' + Math.round((envMaxY-envMinY)*1000)/1000);
  }
  var bom = {
    building: building,
    envelope: {
      minX: envMinX, maxX: envMaxX,
      minY: envMinY, maxY: envMaxY,
      minZ: envMinZ, maxZ: envMaxZ,
      width:  Math.round((envMaxX - envMinX) * 1000) / 1000,
      depth:  Math.round((envMaxY - envMinY) * 1000) / 1000,
      height: Math.round((envMaxZ - envMinZ) * 1000) / 1000
    },
    storeys: storeys,
    storeyHeights: storeyHeights,
    bayProportions: bayProportions,
    cadence: cadence,
    elementCount: rows.length,
    extractedAt: new Date().toISOString()
  };

  var ms = Math.round(performance.now() - t0);
  console.log('§BOM_EXTRACT building=' + building +
    ' storeys=' + storeys.length +
    ' elements=' + rows.length +
    ' envelope=' + bom.envelope.width + 'x' + bom.envelope.depth + 'x' + bom.envelope.height + 'm' +
    ' cadence=' + (cadence ? cadence.count + 'cols' : 'none') +
    ' ms=' + ms);

  // ── 7. Cache to IndexedDB ──
  cacheBOM(building, bom);

  return bom;
}

// ── IndexedDB cache ──────────────────────────────────────────────────────────
function cacheBOM(building, bom) {
  try {
    var req = indexedDB.open(BOM_IDB_STORE, 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('bom')) {
        db.createObjectStore('bom', { keyPath: 'building' });
      }
    };
    req.onsuccess = function(e) {
      var db = e.target.result;
      var tx = db.transaction('bom', 'readwrite');
      tx.objectStore('bom').put(bom);
      tx.oncomplete = function() {
        console.log('§BOM_CACHE saved building=' + building +
          ' size=' + Math.round(JSON.stringify(bom).length / 1024) + 'KB');
      };
    };
    req.onerror = function(e) {
      console.warn('§BOM_CACHE_ERR', e.target.error);
    };
  } catch(e) {
    console.warn('§BOM_CACHE_ERR', e.message);
  }
}

function loadCachedBOM(building, callback) {
  try {
    var req = indexedDB.open(BOM_IDB_STORE, 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('bom')) {
        db.createObjectStore('bom', { keyPath: 'building' });
      }
    };
    req.onsuccess = function(e) {
      var db = e.target.result;
      var tx = db.transaction('bom', 'readonly');
      var get = tx.objectStore('bom').get(building);
      get.onsuccess = function() {
        var bom = get.result || null;
        console.log('§BOM_CACHE_LOAD building=' + building + ' found=' + !!bom);
        callback(bom);
      };
      get.onerror = function() { callback(null); };
    };
    req.onerror = function() { callback(null); };
  } catch(e) {
    console.warn('§BOM_CACHE_LOAD_ERR', e.message);
    callback(null);
  }
}

// ── STD_MEP — default MEP template for small buildings ───────────────────────
// When a building has no MEP discipline data, use standard counts per room area.
var STD_MEP = {
  ELEC: {
    desc: 'Electrical',
    perRoomM2: { lightPoint: 0.15, powerPoint: 0.1, switchPoint: 0.05 },
    perStorey: { dbBoard: 1, riserCable: 1 }
  },
  ACMV: {
    desc: 'Air Conditioning',
    perRoomM2: { diffuser: 0.05, ductRunM: 0.3 },
    perStorey: { ahuUnit: 1 }
  },
  FP: {
    desc: 'Fire Protection',
    perStoreyM2: { sprinklerHead: 0.08, smokeDetector: 0.04 },
    perStorey: { riser: 1, extinguisher: 2 }
  },
  PLMB: {
    desc: 'Plumbing',
    perBathroom: { wcPan: 1, basin: 1, shower: 1, floorTrap: 1 },
    perKitchen: { sink: 1, floorTrap: 1 }
  },
  SANI: {
    desc: 'Sanitary',
    perBathroom: { supplyPoint: 2, wastePoint: 2 },
    perKitchen: { supplyPoint: 1, wastePoint: 1 }
  }
};

/**
 * applySTDMEP(bom) — inject standard MEP into storeys that have no MEP discipline
 */
function applySTDMEP(bom) {
  if (!bom || !bom.storeys) return;
  var applied = 0;
  for (var i = 0; i < bom.storeys.length; i++) {
    var s = bom.storeys[i];
    var hasMEP = s.disciplines.some(function(d) {
      return d.name === 'MEP' || d.name === 'FP' || d.name === 'ELEC' || d.name === 'ACMV';
    });
    if (!hasMEP) {
      // compute storey floor area from AABB
      var arcDisc = s.disciplines.find(function(d) { return d.name === 'ARC'; });
      if (arcDisc) {
        var slabs = arcDisc.classes.find(function(c) { return c.ifc_class === 'IfcSlab'; });
        if (slabs && slabs.aabb) {
          var areaM2 = (slabs.aabb.maxX - slabs.aabb.minX) * (slabs.aabb.maxY - slabs.aabb.minY);
          s._stdMep = {
            source: 'STD_MEP',
            areaM2: Math.round(areaM2 * 100) / 100,
            elec: Math.round(areaM2 * STD_MEP.ELEC.perRoomM2.lightPoint),
            fp: Math.round(areaM2 * STD_MEP.FP.perStoreyM2.sprinklerHead),
            acmv: Math.round(areaM2 * STD_MEP.ACMV.perRoomM2.diffuser)
          };
          applied++;
        }
      }
    }
  }
  if (applied) console.log('§BOM_STD_MEP applied=' + applied + ' storeys (no MEP data)');
}

// ── Public API ───────────────────────────────────────────────────────────────
window.BOMExtract = {
  extract: extractBOM,
  loadCached: loadCachedBOM,
  applySTDMEP: applySTDMEP,
  STD_MEP: STD_MEP
};

})(window);
