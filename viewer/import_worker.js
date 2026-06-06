/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Calls web-ifc API (MPL-2.0, That Open Company) — loaded from CDN at runtime, not bundled here.
 * All code in this file is original work by the author:
 *   4x4 transform, Y→Z-up swap, centroid re-centre, discipline classification,
 *   storey mapping, material extraction, auto-scale heuristic, geometry dedup (FNV-1a).
 */
// import_worker.js — Web Worker: parse IFC via web-ifc, extract to sql.js DBs
// Runs off main thread to avoid UI freeze.
// Input:  postMessage({ arrayBuffer, filename })
// Output: postMessage({ type: 'progress', pct, phase }) or { type: 'done', extracted, library, meta }

// §S284c: Local-first — load web-ifc from same-origin lib/ so the service worker
// can serve it offline (PWA imports IFC with no internet). CDN is fallback only.
console.log('[S220] §WORKER_START loading web-ifc (local-first)...');
try {
  importScripts('lib/web-ifc-api-iife.js');
  console.log('[S220] §WORKER_SRC local lib/web-ifc-api-iife.js');
} catch (e) {
  console.warn('[S220] §WORKER_SRC_FALLBACK local failed (' + e.message + '), trying CDN');
  importScripts('https://unpkg.com/web-ifc@0.0.77/web-ifc-api-iife.js');
  console.log('[S220] §WORKER_SRC cdn unpkg');
}
console.log('[S220] §WORKER_LOADED web-ifc IIFE loaded, WebIFC=' + typeof WebIFC);

// Discipline classification (same as Python pipeline)
const DISC_MAP = {
  // ARC
  IfcWall: 'ARC', IfcWallStandardCase: 'ARC', IfcSlab: 'ARC', IfcDoor: 'ARC',
  IfcWindow: 'ARC', IfcRoof: 'ARC', IfcStair: 'ARC', IfcStairFlight: 'ARC',
  IfcRailing: 'ARC', IfcCovering: 'ARC', IfcCurtainWall: 'ARC', IfcPlate: 'ARC',
  IfcFurnishingElement: 'ARC', IfcBuildingElementProxy: 'ARC', IfcSpace: 'ARC',
  IfcFurniture: 'ARC', IfcSystemFurnitureElement: 'ARC', IfcBuildingElementPart: 'ARC',
  IfcRamp: 'ARC', IfcRampFlight: 'ARC', IfcTransportElement: 'ARC',
  // STR
  IfcBeam: 'STR', IfcColumn: 'STR', IfcFooting: 'STR', IfcPile: 'STR',
  IfcMember: 'STR', IfcReinforcingBar: 'STR', IfcReinforcingMesh: 'STR',
  IfcTendon: 'STR', IfcTendonAnchor: 'STR',
  // ELEC
  IfcCableSegment: 'ELEC', IfcCableCarrierSegment: 'ELEC', IfcCableCarrierFitting: 'ELEC',
  IfcElectricAppliance: 'ELEC', IfcLightFixture: 'ELEC', IfcOutlet: 'ELEC',
  IfcJunctionBox: 'ELEC', IfcSwitchingDevice: 'ELEC', IfcElectricDistributionBoard: 'ELEC',
  // PLB
  IfcPipeSegment: 'PLB', IfcPipeFitting: 'PLB', IfcSanitaryTerminal: 'PLB',
  IfcValve: 'PLB', IfcWasteTerminal: 'PLB', IfcStackTerminal: 'PLB',
  // ACMV
  IfcDuctSegment: 'ACMV', IfcDuctFitting: 'ACMV', IfcAirTerminal: 'ACMV',
  IfcAirTerminalBox: 'ACMV', IfcUnitaryEquipment: 'ACMV', IfcCoil: 'ACMV',
  IfcFan: 'ACMV', IfcCompressor: 'ACMV', IfcChiller: 'ACMV',
  // FP
  IfcFireSuppressionTerminal: 'FP', IfcAlarm: 'FP',
  // MEP generic
  IfcFlowSegment: 'MEP', IfcFlowTerminal: 'MEP', IfcFlowFitting: 'MEP',
  IfcFlowController: 'MEP', IfcFlowMovingDevice: 'MEP', IfcFlowStorageDevice: 'MEP',
  IfcFlowTreatmentDevice: 'MEP', IfcEnergyConversionDevice: 'MEP',
  IfcDistributionElement: 'MEP', IfcDistributionFlowElement: 'MEP',
  IfcDistributionControlElement: 'MEP',
};

// Reverse lookup: IFCWALLSTANDARDCASE → IfcWallStandardCase (from DISC_MAP keys)
const CLASS_NAME_MAP = {};
for (var k in DISC_MAP) { CLASS_NAME_MAP[k.toUpperCase()] = k; }
// Add extras not in DISC_MAP
CLASS_NAME_MAP['IFCOPENINGELEMENT'] = 'IfcOpeningElement';
CLASS_NAME_MAP['IFCSITE'] = 'IfcSite';
CLASS_NAME_MAP['IFCGEOGRAPHICELEMENT'] = 'IfcGeographicElement';

function properClassName(typeCode) {
  var upper = typeCode.toUpperCase();
  return CLASS_NAME_MAP[upper] || ('Ifc' + typeCode.substring(3).charAt(0).toUpperCase() + typeCode.substring(4).toLowerCase());
}

var VALID_DISCS = ['ARC','STR','MEP','PLB','ACMV','ELEC','FP','VENT','HEAT','SAN','COOL','VOID','AIR','DUCT','HVAC','MECH','FIRE','SPR','GAS','LIFT','CONV','CIV','LAND','EXT','INT','CEIL','ROOF','SITE','DEMO'];

function discFromFilename(fname) {
  // Extract discipline from filename: LTU_AHouse_HEAT.ifc → HEAT
  var stem = fname.replace(/\.ifc$/i, '');
  var parts = stem.split(/[_\-]/);
  for (var i = parts.length - 1; i >= 0; i--) {
    if (VALID_DISCS.indexOf(parts[i].toUpperCase()) >= 0) return parts[i].toUpperCase();
  }
  return null;
}

function classifyDisc(ifcClass, filenameDisc) {
  if (filenameDisc) return filenameDisc;
  return DISC_MAP[ifcClass] || 'ARC';
}

self.onmessage = async function(e) {
  const { arrayBuffer, filename } = e.data;
  // §S284d: main thread transfers the web-ifc WASM bytes here (offline-safe source of truth).
  // Stash them so locateFile mints the Blob URL in-worker — emscripten never fetches the wasm
  // itself, which is what aborted offline imports ("both async and sync fetching ... failed").
  if (e.data.wasmBytes) self._WEBIFC_WASM_BYTES = e.data.wasmBytes;
  try {
    // Phase 1: Initialize web-ifc (10%)
    post('progress', 5, 'Starting IFC parser...');
    const ifcApi = new WebIFC.IfcAPI();
    console.log('[S220] §WASM_INIT starting...');
    await ifcApi.Init(function(path) {
      // 0. §S284d: bytes transferred from the main thread (PWA + offline). Mint the Blob URL
      // IN-worker — emscripten never does its own fetch, so it can't abort offline.
      if (self._WEBIFC_WASM_BYTES) {
        var _b = new Uint8Array(self._WEBIFC_WASM_BYTES);
        var _u = URL.createObjectURL(new Blob([_b], { type: 'application/wasm' }));
        console.log('[S220] §WASM_LOCATE ' + path + ' → blob (from main-thread bytes, size=' + _b.length + ')');
        return _u;
      }
      // 1. Standalone HTML — decode embedded base64 wasm HERE (in-worker) so the Blob URL
      // is minted in the worker's own context. Main-thread blob URLs aren't fetchable from
      // a null-origin (file://) blob worker — that silently aborts the wasm fetch.
      if (self._WEBIFC_WASM_B64) {
        var _bin = atob(self._WEBIFC_WASM_B64);
        var _arr = new Uint8Array(_bin.length);
        for (var _i = 0; _i < _bin.length; _i++) _arr[_i] = _bin.charCodeAt(_i);
        var _url = URL.createObjectURL(new Blob([_arr], { type: 'application/wasm' }));
        console.log('[S220] §WASM_LOCATE ' + path + ' → blob (decoded in-worker, offline)');
        return _url;
      }
      // 2. PWA / online — same-origin lib/ so the service worker serves it offline
      var local = 'lib/' + path;
      console.log('[S220] §WASM_LOCATE ' + path + ' → ' + local + ' (local, SW-cached)');
      return local;
    }, true);
    console.log('[S220] §WASM_INIT done');
    post('progress', 10, 'Reading building structure...');

    // Phase 2: Parse IFC (10-30%)
    const data = new Uint8Array(arrayBuffer);
    console.log('[S220] §PARSE_START size=' + (data.byteLength / 1024 / 1024).toFixed(1) + 'MB');
    var modelID;
    try {
      modelID = ifcApi.OpenModel(data, {
        COORDINATE_TO_ORIGIN: false,
        USE_FAST_BOOLS: true,       // subtract IfcOpeningElement from walls
        OPTIMIZE_PROFILES: true,
      });
    } catch(parseErr) {
      var msg = String(parseErr.message || parseErr);
      console.log('[S220] §PARSE_FAIL ' + msg);
      if (msg.includes('Unsupported Schema')) {
        var schema = msg.match(/Schema[:\s]*([\w.]+)/);
        self.postMessage({ type: 'error', message: 'Unsupported IFC version' + (schema ? ' (' + schema[1] + ')' : '') + '. Supported: IFC2x3, IFC4, IFC4x3.' });
      } else {
        self.postMessage({ type: 'error', message: 'Failed to parse IFC: ' + msg });
      }
      return;
    }
    console.log('[S220] §PARSE_OK modelID=' + modelID);
    if (modelID < 0) {
      console.log('[S220] §PARSE_FAIL modelID=' + modelID + ' (unsupported schema?)');
      self.postMessage({ type: 'error', message: 'Failed to parse IFC. Check schema version — supported: IFC2x3, IFC4, IFC4x3.' });
      return;
    }
    // Unit scaling applied AFTER tessellation via heuristic (web-ifc is inconsistent)

    // ── S252: Build expressID → {r,g,b,a} colour map ──────────────────────
    // web-ifc 0.0.77 returns white for IFC4 Revit files that use IFCINDEXEDCOLOURMAP.
    // Fix: walk IFCINDEXEDCOLOURMAP → face set → shape rep → product def → element.
    const _colorMap = {}; // element expressID → {x,y,z,w}
    try {
      if (WebIFC.IFCINDEXEDCOLOURMAP) {
        // Step 1: IFCINDEXEDCOLOURMAP → faceSetId → colour
        var faceSetColour = {};
        var icmIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCINDEXEDCOLOURMAP);
        for (var i = 0; i < icmIds.size(); i++) {
          try {
            var icm = ifcApi.GetLine(modelID, icmIds.get(i));
            var fsId = icm.MappedTo.value;
            var colId = icm.Colours.value;
            var opacity = 1.0;
            if (icm.Opacity && typeof icm.Opacity === 'object' && icm.Opacity.value !== undefined)
              opacity = icm.Opacity.value;
            else if (typeof icm.Opacity === 'number') opacity = icm.Opacity;
            var crl = ifcApi.GetLine(modelID, colId);
            if (crl && crl.ColourList && crl.ColourList.length > 0) {
              var rgb = crl.ColourList[0];
              var r = typeof rgb[0] === 'object' ? rgb[0]._representationValue : rgb[0];
              var g = typeof rgb[1] === 'object' ? rgb[1]._representationValue : rgb[1];
              var b = typeof rgb[2] === 'object' ? rgb[2]._representationValue : rgb[2];
              faceSetColour[fsId] = { x: r, y: g, z: b, w: opacity };
            }
          } catch(e) {}
        }
        console.log('[S252] §ICM faceSet_colours=' + Object.keys(faceSetColour).length);

        if (Object.keys(faceSetColour).length > 0) {
          // Step 2: IFCSHAPEREPRESENTATION → items contain face sets
          var shapeRepColour = {};
          var srIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSHAPEREPRESENTATION);
          for (var si = 0; si < srIds.size(); si++) {
            try {
              var sr = ifcApi.GetLine(modelID, srIds.get(si));
              if (!sr.Items) continue;
              for (var ji = 0; ji < sr.Items.length; ji++) {
                var itemId = sr.Items[ji].value;
                if (faceSetColour[itemId]) {
                  shapeRepColour[sr.expressID] = faceSetColour[itemId];
                  break;
                }
              }
            } catch(e) {}
          }

          // Step 3: IFCPRODUCTDEFINITIONSHAPE → representations
          var prodDefColour = {};
          var pdsIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCTDEFINITIONSHAPE);
          for (var pi = 0; pi < pdsIds.size(); pi++) {
            try {
              var pds = ifcApi.GetLine(modelID, pdsIds.get(pi));
              if (!pds.Representations) continue;
              for (var ri = 0; ri < pds.Representations.length; ri++) {
                var repId = pds.Representations[ri].value;
                if (shapeRepColour[repId]) {
                  prodDefColour[pds.expressID] = shapeRepColour[repId];
                  break;
                }
              }
            } catch(e) {}
          }

          // Step 4 deferred: element lookup happens in Phase 3 element loop below
          // Store prodDefColour for use there
          console.log('[S252] §CHAIN shapeReps=' + Object.keys(shapeRepColour).length +
            ' prodDefs=' + Object.keys(prodDefColour).length);
        }
      }
    } catch(colErr) {
      console.log('[S252] §ICM_ERR ' + (colErr.message || colErr));
    }
    // Make prodDefColour available to element loop
    var _prodDefColour = (typeof prodDefColour !== 'undefined') ? prodDefColour : {};

    post('progress', 30, 'Extracting building elements...');

    // Phase 3: Extract spatial structure + elements (30-70%)
    const lines = ifcApi.GetAllLines(modelID);
    const totalLines = lines.size();
    console.log('[S220] §EXTRACT_START totalLines=' + totalLines);

    // Get project info
    const projectLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    let projectName = filename.replace(/\.ifc$/i, '');
    if (projectLines.size() > 0) {
      try {
        const proj = ifcApi.GetLine(modelID, projectLines.get(0));
        if (proj.Name && proj.Name.value) projectName = proj.Name.value;
      } catch(e) { /* use filename */ }
    }

    // §STOREY_NORMALIZE: Revit exports reference PLANES (Ceiling, Top-of-Steel…) as IfcBuildingStorey,
    // so MEP/STR elements land on "Level 2 Ceiling"/"Level 2 TOS" — junk sibling storeys that pollute
    // the Find Storey/Room trees. Fold them into the base level. Mirrors tools/extract.py normalize_storey.
    const REF_LEVEL_SUFFIXES = [' Ceiling', ' TOS', ' T.O.S.', ' Top of Steel', ' Soffit'];
    const normalizeStorey = (nm) => {
      if (!nm) return nm;
      const s = String(nm).trim(), low = s.toLowerCase();
      for (const suf of REF_LEVEL_SUFFIXES) {
        if (low.endsWith(suf.toLowerCase())) return s.slice(0, -suf.length).trim();
      }
      return s;
    };
    // Get storeys
    const storeyMap = {}; // expressID → storey name (normalized)
    // §LENS_SPATIAL: collect spatial_structure rows (IfcBuilding / IfcBuildingStorey /
    // IfcSpace) for the Find Room lens. Keyed by expressID so IfcRelAggregates can wire
    // parent_guid (building→storey→space) the way the served _extracted.db files do.
    const spatialById = {}; // expressID → { guid, type, name, parentGuid, objectType, predefinedType, cx.. }
    const storeyLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyLines.size(); i++) {
      try {
        const _sid = storeyLines.get(i);
        const s = ifcApi.GetLine(modelID, _sid);
        storeyMap[_sid] = normalizeStorey(s.Name ? s.Name.value : 'Level ' + i);
        spatialById[_sid] = {
          guid: s.GlobalId ? s.GlobalId.value : 'GUID_' + _sid,
          type: 'IfcBuildingStorey',
          name: normalizeStorey(s.Name ? s.Name.value : 'Level ' + i),
          parentGuid: null,
          objectType: s.ObjectType ? s.ObjectType.value : null,
          predefinedType: null,
        };
      } catch(e) { /* skip */ }
    }

    // §LENS_SPATIAL: IfcBuilding rows (parent of storeys in the served schema).
    try {
      const bldgLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
      for (let bi = 0; bi < bldgLines.size(); bi++) {
        try {
          const _bid = bldgLines.get(bi);
          const b = ifcApi.GetLine(modelID, _bid);
          spatialById[_bid] = {
            guid: b.GlobalId ? b.GlobalId.value : 'GUID_' + _bid,
            type: 'IfcBuilding',
            name: b.Name ? b.Name.value : '',
            parentGuid: null,
            objectType: b.ObjectType ? b.ObjectType.value : null,
            predefinedType: null,
          };
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCBUILDING not in schema */ }

    // §LENS_SPATIAL: native IfcSpace rows → spatial_structure (type='IfcSpace').
    // We do NOT add IfcSpace to PRODUCT_TYPES (its solid box still obscures render);
    // we only capture it as METADATA here. Geometry bbox (center/size) is tessellated
    // below in a dedicated pass so the lens can highlight the room volume.
    const spaceExpressIds = []; // expressIDs of IfcSpace, for the bbox pass
    try {
      const spaceLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSPACE);
      for (let spi = 0; spi < spaceLines.size(); spi++) {
        try {
          const _spid = spaceLines.get(spi);
          const sp = ifcApi.GetLine(modelID, _spid);
          spatialById[_spid] = {
            guid: sp.GlobalId ? sp.GlobalId.value : 'GUID_' + _spid,
            type: 'IfcSpace',
            name: sp.Name ? sp.Name.value : (sp.LongName ? sp.LongName.value : 'Space_' + _spid),
            parentGuid: null,
            objectType: sp.ObjectType ? sp.ObjectType.value : null,
            predefinedType: sp.PredefinedType ? sp.PredefinedType.value : null,
          };
          spaceExpressIds.push(_spid);
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCSPACE not in schema */ }

    // Get containment (element → storey)
    const elementToStorey = {};
    // §LENS_SPATIAL: element → space containment (RelatingStructure is an IfcSpace).
    // Keyed by expressIDs here; resolved to GUIDs after elements are collected.
    const relContainedRaw = []; // { elementId, spaceId } where spaceId ∈ spatialById(IfcSpace)
    const relLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relLines.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relLines.get(i));
        const storeyId = rel.RelatingStructure ? rel.RelatingStructure.value : null;
        const storeyName = storeyMap[storeyId] || 'Unknown';
        const _isSpace = storeyId != null && spatialById[storeyId] && spatialById[storeyId].type === 'IfcSpace';
        if (rel.RelatedElements) {
          for (let j = 0; j < rel.RelatedElements.length; j++) {
            const elId = rel.RelatedElements[j].value;
            if (storeyName !== 'Unknown') elementToStorey[elId] = storeyName;
            if (_isSpace) relContainedRaw.push({ elementId: elId, spaceId: storeyId });
          }
        }
      } catch(e) { /* skip */ }
    }

    // §LENS_SPATIAL: parent_guid wiring + space→element containment via IfcRelAggregates.
    // Aggregates nests building→storey→space (RelatingObject parent, RelatedObjects kids)
    // AND, in some authoring tools, space→furnishing. We set parent_guid on spatial rows
    // and treat space→element aggregation as containment for the lens (same as the served DB).
    try {
      const aggSpId = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
      for (let agi = 0; agi < aggSpId.size(); agi++) {
        try {
          const agg = ifcApi.GetLine(modelID, aggSpId.get(agi));
          const parentEx = agg.RelatingObject ? agg.RelatingObject.value : null;
          if (parentEx == null || !agg.RelatedObjects) continue;
          const parentSp = spatialById[parentEx];
          for (let agj = 0; agj < agg.RelatedObjects.length; agj++) {
            const kidEx = agg.RelatedObjects[agj] ? agg.RelatedObjects[agj].value : null;
            if (kidEx == null) continue;
            // wire parent_guid for nested spatial rows (storey under building, space under storey)
            if (parentSp && spatialById[kidEx]) spatialById[kidEx].parentGuid = parentSp.guid;
            // space → element containment (parent is an IfcSpace, kid is a product)
            if (parentSp && parentSp.type === 'IfcSpace' && !spatialById[kidEx]) {
              relContainedRaw.push({ elementId: kidEx, spaceId: parentEx });
            }
          }
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCRELAGGREGATES not in schema */ }

    // §S267: Extract IFC relationships for bom_tree (parent→child hierarchy)
    // Implementing S267_BOM_TREE_EXTRACTION.md §B — Witness: W-BOM-IFC-REL
    const bomTreeRels = [];
    const _idToGuid = {}; // expressID → guid, built later after elements collected

    // IfcRelVoidsElement: wall → opening
    try {
      var voidRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELVOIDSELEMENT);
      for (let vi = 0; vi < voidRels.size(); vi++) {
        try {
          var vr = ifcApi.GetLine(modelID, voidRels.get(vi));
          var parentId = vr.RelatingBuildingElement ? vr.RelatingBuildingElement.value : null;
          var childId = vr.RelatedOpeningElement ? vr.RelatedOpeningElement.value : null;
          if (parentId && childId) bomTreeRels.push({ parentId: parentId, childId: childId, relType: 'VOIDS' });
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCRELVOIDSELEMENT not in schema */ }

    // IfcRelFillsElement: opening → door/window
    try {
      var fillRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELFILLSELEMENT);
      for (let fi = 0; fi < fillRels.size(); fi++) {
        try {
          var fr = ifcApi.GetLine(modelID, fillRels.get(fi));
          var openingId = fr.RelatingOpeningElement ? fr.RelatingOpeningElement.value : null;
          var fillingId = fr.RelatedBuildingElement ? fr.RelatedBuildingElement.value : null;
          if (openingId && fillingId) bomTreeRels.push({ parentId: openingId, childId: fillingId, relType: 'FILLS' });
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCRELFILLSELEMENT not in schema */ }

    // IfcRelAggregates: assembly → parts
    try {
      var aggRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
      for (let ai = 0; ai < aggRels.size(); ai++) {
        try {
          var ar = ifcApi.GetLine(modelID, aggRels.get(ai));
          var relObj = ar.RelatingObject ? ar.RelatingObject.value : null;
          if (relObj && ar.RelatedObjects) {
            for (let ri = 0; ri < ar.RelatedObjects.length; ri++) {
              var relChild = ar.RelatedObjects[ri].value;
              if (relChild) bomTreeRels.push({ parentId: relObj, childId: relChild, relType: 'AGGREGATES' });
            }
          }
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCRELAGGREGATES not in schema */ }

    console.log('[S267] §BOM_TREE_RELS voids=' +
      bomTreeRels.filter(r => r.relType === 'VOIDS').length +
      ' fills=' + bomTreeRels.filter(r => r.relType === 'FILLS').length +
      ' aggregates=' + bomTreeRels.filter(r => r.relType === 'AGGREGATES').length);

    // §LENS_MATERIAL: element expressID → IfcMaterial.Name via IfcRelAssociatesMaterial.
    // Populates elements_meta.material_name (the Material lens groups on it). NON-INVENT:
    // if the IFC carries no IfcMaterial association, the entry is absent → material_name
    // stays NULL (the viewer's colour-naming falls back). Handles the common relating types:
    // IfcMaterial (.Name), IfcMaterialLayerSetUsage/LayerSet (first layer's material),
    // IfcMaterialList (first), IfcMaterialConstituentSet (first constituent).
    const materialNameById = {}; // element expressID → material name string
    function _matNameFrom(relMatId) {
      if (relMatId == null) return null;
      try {
        var rm = ifcApi.GetLine(modelID, relMatId);
        if (!rm) return null;
        // Direct IfcMaterial
        if (rm.Name && typeof rm.Name.value === 'string') return rm.Name.value;
        // IfcMaterialLayerSetUsage → ForLayerSet, or IfcMaterialLayerSet directly
        var layerSet = rm.ForLayerSet ? ifcApi.GetLine(modelID, rm.ForLayerSet.value) : rm;
        if (layerSet && layerSet.MaterialLayers && layerSet.MaterialLayers.length) {
          var lyr = ifcApi.GetLine(modelID, layerSet.MaterialLayers[0].value);
          if (lyr && lyr.Material) {
            var lm = ifcApi.GetLine(modelID, lyr.Material.value);
            if (lm && lm.Name && typeof lm.Name.value === 'string') return lm.Name.value;
          }
        }
        // IfcMaterialList → Materials[]
        if (rm.Materials && rm.Materials.length) {
          var fm = ifcApi.GetLine(modelID, rm.Materials[0].value);
          if (fm && fm.Name && typeof fm.Name.value === 'string') return fm.Name.value;
        }
        // IfcMaterialConstituentSet → MaterialConstituents[]
        if (rm.MaterialConstituents && rm.MaterialConstituents.length) {
          var con = ifcApi.GetLine(modelID, rm.MaterialConstituents[0].value);
          if (con && con.Material) {
            var cm = ifcApi.GetLine(modelID, con.Material.value);
            if (cm && cm.Name && typeof cm.Name.value === 'string') return cm.Name.value;
          }
        }
      } catch(e) { /* unreadable association → leave NULL */ }
      return null;
    }
    try {
      var matRelIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
      for (var mri = 0; mri < matRelIds.size(); mri++) {
        try {
          var mrel = ifcApi.GetLine(modelID, matRelIds.get(mri));
          var nm = _matNameFrom(mrel.RelatingMaterial ? mrel.RelatingMaterial.value : null);
          if (nm && mrel.RelatedObjects) {
            for (var mrj = 0; mrj < mrel.RelatedObjects.length; mrj++) {
              var moid = mrel.RelatedObjects[mrj] ? mrel.RelatedObjects[mrj].value : null;
              if (moid != null) materialNameById[moid] = nm;
            }
          }
        } catch(e) { /* skip */ }
      }
    } catch(e) { /* IFCRELASSOCIATESMATERIAL not in schema */ }
    console.log('[LENS] §MATERIAL_NAMES associations=' + Object.keys(materialNameById).length);

    // Collect product types to extract
    const PRODUCT_TYPES = [
      // ARC
      WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCSLAB, WebIFC.IFCDOOR,
      WebIFC.IFCWINDOW, WebIFC.IFCROOF, WebIFC.IFCSTAIR, WebIFC.IFCSTAIRFLIGHT,
      WebIFC.IFCRAILING, WebIFC.IFCCOVERING, WebIFC.IFCCURTAINWALL, WebIFC.IFCPLATE,
      WebIFC.IFCFURNISHINGELEMENT, WebIFC.IFCBUILDINGELEMENTPROXY,
      WebIFC.IFCFURNITURE, WebIFC.IFCSYSTEMFURNITUREELEMENT,
      WebIFC.IFCBUILDINGELEMENTPART, WebIFC.IFCRAMP, WebIFC.IFCRAMPFLIGHT,
      WebIFC.IFCTRANSPORTELEMENT,
      // STR
      WebIFC.IFCBEAM, WebIFC.IFCCOLUMN, WebIFC.IFCFOOTING, WebIFC.IFCMEMBER,
      WebIFC.IFCPILE, WebIFC.IFCREINFORCINGBAR, WebIFC.IFCREINFORCINGMESH,
      WebIFC.IFCTENDON, WebIFC.IFCTENDONANCHOR,
      // MEP
      WebIFC.IFCFLOWSEGMENT, WebIFC.IFCFLOWTERMINAL, WebIFC.IFCFLOWFITTING,
      WebIFC.IFCFLOWCONTROLLER, WebIFC.IFCFLOWMOVINGDEVICE, WebIFC.IFCFLOWSTORAGEDEVICE,
      WebIFC.IFCFLOWTREATMENTDEVICE, WebIFC.IFCENERGYCONVERSIONDEVICE,
      WebIFC.IFCPIPESEGMENT, WebIFC.IFCPIPEFITTING,
      WebIFC.IFCDUCTSEGMENT, WebIFC.IFCDUCTFITTING,
      WebIFC.IFCCABLESEGMENT, WebIFC.IFCCABLECARRIERSEGMENT, WebIFC.IFCCABLECARRIERFITTING,
      WebIFC.IFCLIGHTFIXTURE, WebIFC.IFCOUTLET, WebIFC.IFCJUNCTIONBOX,
      WebIFC.IFCSWITCHINGDEVICE, WebIFC.IFCELECTRICDISTRIBUTIONBOARD,
      WebIFC.IFCELECTRICAPPLIANCE, WebIFC.IFCCONTROLLER,
      WebIFC.IFCSANITARYTERMINAL, WebIFC.IFCUNITARYEQUIPMENT,
      WebIFC.IFCVALVE, WebIFC.IFCWASTETERMINAL, WebIFC.IFCSTACKTERMINAL,
      WebIFC.IFCAIRTERMINAL, WebIFC.IFCAIRTERMINALBOX,
      WebIFC.IFCCOIL, WebIFC.IFCFAN, WebIFC.IFCCOMPRESSOR, WebIFC.IFCCHILLER,
      WebIFC.IFCFIRESUPPRESSIONTERMINAL, WebIFC.IFCALARM,
      WebIFC.IFCDISTRIBUTIONFLOWELEMENT, WebIFC.IFCDISTRIBUTIONCONTROLELEMENT,
      WebIFC.IFCDISTRIBUTIONELEMENT,
      // INFRA (IFC4x3)
      WebIFC.IFCGEOGRAPHICELEMENT,
      // Note: IfcSpace + IfcSite excluded — render as solid boxes/terrain, obscure model
    ];

    // Filter out undefined types (some IFC versions don't have all)
    const validTypes = PRODUCT_TYPES.filter(t => t !== undefined);

    // Collect all elements
    const elements = [];
    const elementIds = new Set();
    for (const typeId of validTypes) {
      const ids = ifcApi.GetLineIDsWithType(modelID, typeId);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        if (elementIds.has(id)) continue;
        elementIds.add(id);
        try {
          const el = ifcApi.GetLine(modelID, id);
          const typeName = ifcApi.GetNameFromTypeCode(typeId) || 'IFCBUILDINGELEMENT';
          const ifcClass = properClassName(typeName);
          // S252: Look up colour from IFCINDEXEDCOLOURMAP chain
          var _repId = el.Representation ? (el.Representation.value || el.Representation) : null;
          var _icmCol = _repId && _prodDefColour[_repId] ? _prodDefColour[_repId] : null;
          if (_icmCol) _colorMap[id] = _icmCol;
          elements.push({
            expressID: id,
            guid: el.GlobalId ? el.GlobalId.value : 'GUID_' + id,
            ifcClass: ifcClass,
            name: el.Name ? el.Name.value : ifcClass + '_' + id,
            storey: elementToStorey[id] || 'Unknown',
            discipline: classifyDisc(ifcClass, discFromFilename(filename)),
            material: '',
            // §LENS_MATERIAL: IfcMaterial.Name (null if no association — non-invent)
            materialName: materialNameById[id] || null,
          });
        } catch(e) { /* skip unreadable */ }
      }
    }

    // §S267: Resolve bomTreeRels expressIDs → GUIDs
    for (var ei = 0; ei < elements.length; ei++) {
      _idToGuid[elements[ei].expressID] = elements[ei].guid;
    }
    var bomTree = [];
    for (var bi = 0; bi < bomTreeRels.length; bi++) {
      var pGuid = _idToGuid[bomTreeRels[bi].parentId];
      var cGuid = _idToGuid[bomTreeRels[bi].childId];
      if (pGuid && cGuid) {
        bomTree.push({ parentGuid: pGuid, childGuid: cGuid, relType: bomTreeRels[bi].relType });
      }
    }
    console.log('[S267] §BOM_TREE_RESOLVED raw=' + bomTreeRels.length + ' resolved=' + bomTree.length);

    // §LENS_SPATIAL: IfcSpace bbox pass — tessellate each space ONLY to derive center/size
    // (world Z-up, mm→m heuristic applied later with the rest). Space geometry is NOT added
    // to `geometries` (render stays clean); we only read extents for the room highlight.
    var _spaceBboxOk = 0;
    for (var sbi = 0; sbi < spaceExpressIds.length; sbi++) {
      var _spEx = spaceExpressIds[sbi];
      var _row = spatialById[_spEx];
      if (!_row) continue;
      try {
        var _fm = ifcApi.GetFlatMesh(modelID, _spEx);
        var _minX = Infinity, _minY = Infinity, _minZ = Infinity;
        var _maxX = -Infinity, _maxY = -Infinity, _maxZ = -Infinity;
        var _gc = _fm.geometries.size();
        for (var _gi = 0; _gi < _gc; _gi++) {
          var _geo = _fm.geometries.get(_gi);
          var _md = ifcApi.GetGeometry(modelID, _geo.geometryExpressID);
          var _vs = _md.GetVertexDataSize();
          if (_vs === 0) continue;
          var _vts = ifcApi.GetVertexArray(_md.GetVertexData(), _vs);
          var _m = _geo.flatTransformation;
          var _vc = _vts.length / 6;
          for (var _vi = 0; _vi < _vc; _vi++) {
            var _lx = _vts[_vi*6], _ly = _vts[_vi*6+1], _lz = _vts[_vi*6+2];
            var _wx = _m[0]*_lx + _m[4]*_ly + _m[8]*_lz  + _m[12];
            var _wy = _m[1]*_lx + _m[5]*_ly + _m[9]*_lz  + _m[13];
            var _wz = _m[2]*_lx + _m[6]*_ly + _m[10]*_lz + _m[14];
            // same Y-up → Z-up swap the element loop uses: (wx, -wz, wy)
            var _px = _wx, _py = -_wz, _pz = _wy;
            if (_px < _minX) _minX = _px; if (_px > _maxX) _maxX = _px;
            if (_py < _minY) _minY = _py; if (_py > _maxY) _maxY = _py;
            if (_pz < _minZ) _minZ = _pz; if (_pz > _maxZ) _maxZ = _pz;
          }
        }
        if (_minX !== Infinity) {
          _row.cx = (_minX + _maxX) / 2; _row.cy = (_minY + _maxY) / 2; _row.cz = (_minZ + _maxZ) / 2;
          _row.sx = _maxX - _minX; _row.sy = _maxY - _minY; _row.sz = _maxZ - _minZ;
          _spaceBboxOk++;
        }
      } catch(e) { /* space without geometry → center/size stay null */ }
    }

    // §LENS_SPATIAL: assemble spatial_structure rows + element→space containment (GUID-keyed).
    var spatialStructure = [];
    for (var _sk in spatialById) {
      var _r = spatialById[_sk];
      spatialStructure.push({
        guid: _r.guid, type: _r.type, name: _r.name, parentGuid: _r.parentGuid,
        objectType: _r.objectType, predefinedType: _r.predefinedType,
        cx: _r.cx, cy: _r.cy, cz: _r.cz, sx: _r.sx, sy: _r.sy, sz: _r.sz,
      });
    }
    // expressID → guid for the lens: products (elements) + spatial rows
    var _spaceExToGuid = {};
    for (var _sk2 in spatialById) _spaceExToGuid[_sk2] = spatialById[_sk2].guid;
    var relContainedInSpace = [];
    var _seenRC = {};
    for (var rcx = 0; rcx < relContainedRaw.length; rcx++) {
      var _eGuid = _idToGuid[relContainedRaw[rcx].elementId];
      var _sGuid = _spaceExToGuid[relContainedRaw[rcx].spaceId];
      if (!_eGuid || !_sGuid) continue;
      var _rk = _sGuid + '|' + _eGuid;
      if (_seenRC[_rk]) continue;
      _seenRC[_rk] = 1;
      relContainedInSpace.push({ elementGuid: _eGuid, spaceGuid: _sGuid });
    }
    var _nSpaces = spatialStructure.filter(function(r){ return r.type === 'IfcSpace'; }).length;
    console.log('[LENS] §SPATIAL_EXTRACT spatial_rows=' + spatialStructure.length + ' spaces=' + _nSpaces +
      ' spaceBbox=' + _spaceBboxOk + ' rel_contained=' + relContainedInSpace.length);

    console.log('[S220] §ELEMENTS_FOUND count=' + elements.length + ' storeys=' + Object.keys(storeyMap).length);
    console.log('[S252] §ELEM_COLORS icm_mapped=' + Object.keys(_colorMap).length + '/' + elements.length);
    post('progress', 45, 'Found ' + elements.length + ' elements across ' + Object.keys(storeyMap).length + ' storeys');
    post('progress', 50, 'Building 3D shapes — this may take a minute for large buildings...');

    // Phase 4: Tessellate geometry (50-90%)
    // Same pipeline as Java: apply 4x4 transform → compute centroid → re-center at origin
    // Viewer expects: library vertices centered at origin, center_x/y/z = world position
    const geometries = []; // { guid, geomHash, vertices: ArrayBuffer, indices: ArrayBuffer }
    const transforms = []; // { guid, cx, cy, cz, rx, ry, rz }
    let geomDone = 0;
    const geomTotal = elements.length;
    let matCount = 0;

    // §S274: Skip classes that never have renderable geometry — avoids 607 OOM-throw-catch cycles
    // on TerminalMerged.ifc (527 IfcFireSuppressionTerminal + 80 IfcAlarm = ~30s wasted).
    var _SKIP_GEOM = { IfcFireSuppressionTerminal: 1, IfcAlarm: 1, IfcSensor: 1, IfcActuator: 1,
      IfcController: 1, IfcFlowInstrument: 1, IfcProtectiveDeviceTrippingUnit: 1 };
    var _skipCount = 0;

    for (const el of elements) {
      if (_SKIP_GEOM[el.ifcClass]) { _skipCount++; geomDone++; continue; }
      try {
        const flatMesh = ifcApi.GetFlatMesh(modelID, el.expressID);
        // Try all geometries in flatMesh, merge vertices
        var allVerts = [], allIdx = [], vertOffset = 0;
        var bestColor = null;
        var geoCount = flatMesh.geometries.size();
        for (let gi = 0; gi < geoCount; gi++) {
          var geo = flatMesh.geometries.get(gi);
          var meshData = ifcApi.GetGeometry(modelID, geo.geometryExpressID);
          var vSize = meshData.GetVertexDataSize();
          var iSize = meshData.GetIndexDataSize();
          if (vSize === 0 || iSize === 0) continue;
          var verts = ifcApi.GetVertexArray(meshData.GetVertexData(), vSize);
          var idx = ifcApi.GetIndexArray(meshData.GetIndexData(), iSize);
          // Extract IfcBoundingBox dimensions (8 verts + 36 indices) before skipping
          if (verts.length / 6 === 8 && idx.length === 36) {
            // Extract bbox extents from the 8 box vertices
            var bxs = [], bys = [], bzs = [];
            for (var bvi = 0; bvi < 8; bvi++) {
              bxs.push(verts[bvi * 6]); bys.push(verts[bvi * 6 + 1]); bzs.push(verts[bvi * 6 + 2]);
            }
            el._bboxX = Math.max.apply(null, bxs) - Math.min.apply(null, bxs);
            el._bboxY = Math.max.apply(null, bys) - Math.min.apply(null, bys);
            el._bboxZ = Math.max.apply(null, bzs) - Math.min.apply(null, bzs);
            if (geoCount > 1) continue; // skip box geometry, keep dimensions
          }
          var m = geo.flatTransformation;
          var vc = verts.length / 6;
          // Transform vertices: web-ifc Y-up → IFC Z-up
          for (var vi = 0; vi < vc; vi++) {
            var lx = verts[vi * 6], ly = verts[vi * 6 + 1], lz = verts[vi * 6 + 2];
            var wx = m[0]*lx + m[4]*ly + m[8]*lz  + m[12];
            var wy = m[1]*lx + m[5]*ly + m[9]*lz  + m[13];
            var wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
            allVerts.push(wx, -wz, wy);
          }
          // Offset indices for merged geometry
          for (var ii = 0; ii < idx.length; ii++) {
            allIdx.push(idx[ii] + vertOffset);
          }
          vertOffset += vc;
          if (!bestColor && geo.color && geo.color.x !== undefined) bestColor = geo.color;
        }
        // S252: If geo.color was white/missing, use material association colour map
        if ((!bestColor || (bestColor.x > 0.95 && bestColor.y > 0.95 && bestColor.z > 0.95)) && _colorMap[el.expressID]) {
          bestColor = _colorMap[el.expressID];
        }
        if (allVerts.length >= 9) {  // at least 3 vertices (1 triangle)
          var vertCount = allVerts.length / 3;
          // Compute centroid
          var sumX = 0, sumY = 0, sumZ = 0;
          for (var vi = 0; vi < vertCount; vi++) {
            sumX += allVerts[vi * 3];
            sumY += allVerts[vi * 3 + 1];
            sumZ += allVerts[vi * 3 + 2];
          }
          var cx = sumX / vertCount, cy = sumY / vertCount, cz = sumZ / vertCount;
          // Re-center at origin
          var positions = new Float32Array(allVerts.length);
          for (var vi = 0; vi < vertCount; vi++) {
            positions[vi * 3]     = allVerts[vi * 3]     - cx;
            positions[vi * 3 + 1] = allVerts[vi * 3 + 1] - cy;
            positions[vi * 3 + 2] = allVerts[vi * 3 + 2] - cz;
          }
          // Content-hash geometry for dedup: identical shapes share one BLOB
          var idxBuf = new Int32Array(allIdx).buffer;
          var hashSrc = new Uint8Array(positions.byteLength + idxBuf.byteLength);
          hashSrc.set(new Uint8Array(positions.buffer), 0);
          hashSrc.set(new Uint8Array(idxBuf), positions.byteLength);
          var h = 0x811c9dc5;
          for (var hi = 0; hi < hashSrc.length; hi++) {
            h ^= hashSrc[hi]; h = Math.imul(h, 0x01000193);
          }
          var h2 = 0x6c62272e;
          for (var hi = hashSrc.length - 1; hi >= 0; hi--) {
            h2 ^= hashSrc[hi]; h2 = Math.imul(h2, 0x01000193);
          }
          var geomHash = (h >>> 0).toString(16).padStart(8,'0') + (h2 >>> 0).toString(16).padStart(8,'0');
          // Compute vertex normals (area-weighted, same algorithm as Three.js)
          var normals = new Float32Array(positions.length);
          var idxArr = new Int32Array(idxBuf);
          for (var fi = 0; fi < idxArr.length; fi += 3) {
            var ia = idxArr[fi], ib = idxArr[fi+1], ic = idxArr[fi+2];
            if (ia >= vertCount || ib >= vertCount || ic >= vertCount) continue;
            var e1x = positions[ib*3] - positions[ia*3],     e1y = positions[ib*3+1] - positions[ia*3+1], e1z = positions[ib*3+2] - positions[ia*3+2];
            var e2x = positions[ic*3] - positions[ia*3],     e2y = positions[ic*3+1] - positions[ia*3+1], e2z = positions[ic*3+2] - positions[ia*3+2];
            var nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
            for (var ni = 0; ni < 3; ni++) {
              var idx2 = idxArr[fi+ni];
              normals[idx2*3] += nx; normals[idx2*3+1] += ny; normals[idx2*3+2] += nz;
            }
          }
          for (var ni2 = 0; ni2 < vertCount; ni2++) {
            var nnx = normals[ni2*3], nny = normals[ni2*3+1], nnz = normals[ni2*3+2];
            var len = Math.sqrt(nnx*nnx + nny*nny + nnz*nnz);
            if (len > 0) { normals[ni2*3] /= len; normals[ni2*3+1] /= len; normals[ni2*3+2] /= len; }
          }
          geometries.push({
            guid: el.guid,
            geomHash: geomHash,
            vertices: positions.buffer,
            indices: idxBuf,
            normals: normals.buffer,
          });
          // If no IFC bbox was extracted, compute from vertices
          if (!el._bboxX) {
            var vxs = [], vys = [], vzs = [];
            for (var vi2 = 0; vi2 < vertCount; vi2++) {
              vxs.push(positions[vi2*3]); vys.push(positions[vi2*3+1]); vzs.push(positions[vi2*3+2]);
            }
            el._bboxX = Math.max.apply(null, vxs) - Math.min.apply(null, vxs);
            el._bboxY = Math.max.apply(null, vys) - Math.min.apply(null, vys);
            el._bboxZ = Math.max.apply(null, vzs) - Math.min.apply(null, vzs);
          }
          transforms.push({ guid: el.guid, cx: cx, cy: cy, cz: cz, rx: 0, ry: 0, rz: 0,
            bx: el._bboxX, by: el._bboxY, bz: el._bboxZ });
          if (bestColor) {
            // S252: Don't store pure white — it means web-ifc couldn't resolve the style
            var _isWhite = bestColor.x > 0.99 && bestColor.y > 0.99 && bestColor.z > 0.99;
            if (!_isWhite) {
              el.material = bestColor.x.toFixed(3) + ',' + bestColor.y.toFixed(3) + ',' + bestColor.z.toFixed(3) + ',' + bestColor.w.toFixed(3);
              matCount++;
            }
          }
        }
      } catch(e) {
        console.log('[S220] §GEOM_SKIP guid=' + el.guid + ' class=' + el.ifcClass + ' err=' + (e.message || e));
      }

      geomDone++;
      if (geomDone % 50 === 0 || geomDone === geomTotal) {
        const pct = 50 + Math.floor((geomDone / geomTotal) * 40);
        post('progress', pct, 'Building 3D shapes — ' + geomDone + ' of ' + geomTotal + ' done...');
      }
    }

    // Ghost admission: elements without geometry are BOM containers (IfcCurtainWall, IfcStair).
    // They have no spatial representation — don't write them to elements_meta.
    const geomGuids = new Set(geometries.map(g => g.guid));
    const ghosts = elements.filter(el => !geomGuids.has(el.guid));
    const renderableElements = elements.filter(el => geomGuids.has(el.guid));
    if (ghosts.length) {
      const ghostSummary = {};
      ghosts.forEach(g => { ghostSummary[g.ifcClass] = (ghostSummary[g.ifcClass] || 0) + 1; });
      console.log('[S220] §GHOST_ADMISSION skipped=' + ghosts.length +
        ' classes=' + JSON.stringify(ghostSummary) +
        ' (no geometry → not a spatial element)');
    }
    const skipped = elements.length - geometries.length;
    if (_skipCount) console.log('[S220] §GEOM_FAST_SKIP classes=' + Object.keys(_SKIP_GEOM).join(',') + ' count=' + _skipCount + ' (no GetFlatMesh call — saves OOM cycles)');
    var _namedMatCount = renderableElements.filter(function(el){ return el.materialName != null; }).length;
    console.log('[S220] §GEOM_SUMMARY elements=' + elements.length + ' renderable=' + renderableElements.length + ' ghosts=' + ghosts.length + ' materials=' + matCount);
    console.log('[LENS] §NAMED_MATERIALS renderable_with_material_name=' + _namedMatCount + '/' + renderableElements.length);

    post('progress', 92, 'Building database — almost done...');

    // Phase 5: Build sql.js databases (90-100%)
    // We send raw data back to main thread — it builds sql.js DBs there
    // (sql.js WASM can't run in all workers easily)
    const discCounts = {};
    for (const el of renderableElements) {
      discCounts[el.discipline] = (discCounts[el.discipline] || 0) + 1;
    }

    const storeys = [...new Set(renderableElements.map(e => e.storey))].sort();

    // Post-hoc unit heuristic: if bounding box > 500m in any axis, assume mm → divide by 1000
    var autoScale = 1.0;
    if (transforms.length > 0) {
      var maxCoord = 0;
      for (var ti = 0; ti < transforms.length; ti++) {
        maxCoord = Math.max(maxCoord, Math.abs(transforms[ti].cx), Math.abs(transforms[ti].cy), Math.abs(transforms[ti].cz));
      }
      if (maxCoord > 500) {
        autoScale = 0.001;
        for (var ti = 0; ti < transforms.length; ti++) {
          transforms[ti].cx *= 0.001;
          transforms[ti].cy *= 0.001;
          transforms[ti].cz *= 0.001;
        }
        // Also scale library vertices
        for (var gi = 0; gi < geometries.length; gi++) {
          var vBuf = new Float32Array(geometries[gi].vertices);
          for (var vi = 0; vi < vBuf.length; vi++) vBuf[vi] *= 0.001;
          geometries[gi].vertices = vBuf.buffer;
        }
        // §LENS_SPATIAL: scale IfcSpace bbox center/size to match (mm→m heuristic)
        for (var ssx = 0; ssx < spatialStructure.length; ssx++) {
          var _ssr = spatialStructure[ssx];
          if (_ssr.cx != null) { _ssr.cx *= 0.001; _ssr.cy *= 0.001; _ssr.cz *= 0.001; }
          if (_ssr.sx != null) { _ssr.sx *= 0.001; _ssr.sy *= 0.001; _ssr.sz *= 0.001; }
        }
      }
    }
    console.log('[S220] §UNITS autoScale=' + autoScale + (autoScale !== 1.0 ? ' (mm→m heuristic)' : ' (already metres)'));
    console.log('[S220] §GEOM_DONE elements=' + elements.length + ' withGeometry=' + geometries.length + ' skipped=' + (elements.length - geometries.length) + ' withMaterial=' + matCount);
    post('progress', 95, 'Packaging results...');

    // ── 4D extraction (if present) ──────────────────────────────────────────
    // Implementing 4D_CAPTURE_AND_FALLBACK.md T1/T1b — Witness W-CAPTURE / W-VOCAB.
    // Dual-direction task↔element links (IfcRelAssignsToProduct is the Hospital/Bonsai fix).
    // Widened (§5.2): CPM dates, float, is_critical, WBS (wbs_parent+is_summary), calendar.
    // ifcApi + modelID are still valid here (S274: this worker never calls CloseModel).
    var schedules = [], tasks = [], taskSequences = [], taskElements = [], calendars = [];
    try {
      var schedIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWORKSCHEDULE);
      for (var sci = 0; sci < schedIds.size(); sci++) {
        try {
          var sch = ifcApi.GetLine(modelID, schedIds.get(sci));
          schedules.push({
            id: sch.GlobalId ? sch.GlobalId.value : 'SCHED_' + sci,
            name: sch.Name ? sch.Name.value : 'Schedule ' + sci,
            status: sch.Status ? sch.Status.value : null,
            created: sch.CreationDate ? sch.CreationDate.value : null,
          });
        } catch(e) {}
      }
    } catch(e) {}

    // WBS hierarchy (§5.2): IfcRelNests parent→children. wbs_parent (parent GUID) +
    // is_summary (a task that HAS children — NOT reliable from PredefinedType, per W-VOCAB).
    var _childToParentEx = {}, _hasKids = {};
    try {
      var nestIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELNESTS);
      for (var ni = 0; ni < nestIds.size(); ni++) {
        try {
          var nst = ifcApi.GetLine(modelID, nestIds.get(ni));
          var parentEx = nst.RelatingObject ? nst.RelatingObject.value : null;
          if (parentEx == null || !nst.RelatedObjects) continue;
          _hasKids[parentEx] = true;
          for (var nj = 0; nj < nst.RelatedObjects.length; nj++) {
            var kidEx = nst.RelatedObjects[nj] ? nst.RelatedObjects[nj].value : null;
            if (kidEx != null) _childToParentEx[kidEx] = parentEx;
          }
        } catch(e) {}
      }
    } catch(e) {}

    var _exToGuid = {};
    try {
      var taskIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCTASK);
      for (var tki = 0; tki < taskIds.size(); tki++) {
        try {
          var _ex = taskIds.get(tki);
          var tsk = ifcApi.GetLine(modelID, _ex);
          var taskTime = tsk.TaskTime ? ifcApi.GetLine(modelID, tsk.TaskTime.value) : null;
          var _guid = tsk.GlobalId ? tsk.GlobalId.value : 'TASK_' + tki;
          _exToGuid[_ex] = _guid;
          tasks.push({
            _ex: _ex,
            id: _guid,
            name: tsk.Name ? tsk.Name.value : 'Task ' + tki,
            predefinedType: tsk.PredefinedType ? tsk.PredefinedType.value : null,
            // EXTRACT VERBATIM — ISO-8601 durations/floats ("P15D"/"P0D"); never re-derive (PRIME RULE).
            scheduleStart: taskTime && taskTime.ScheduleStart ? taskTime.ScheduleStart.value : null,
            scheduleFinish: taskTime && taskTime.ScheduleFinish ? taskTime.ScheduleFinish.value : null,
            scheduleDuration: taskTime && taskTime.ScheduleDuration ? taskTime.ScheduleDuration.value : null,
            earlyStart: taskTime && taskTime.EarlyStart ? taskTime.EarlyStart.value : null,
            earlyFinish: taskTime && taskTime.EarlyFinish ? taskTime.EarlyFinish.value : null,
            lateStart: taskTime && taskTime.LateStart ? taskTime.LateStart.value : null,
            lateFinish: taskTime && taskTime.LateFinish ? taskTime.LateFinish.value : null,
            freeFloat: taskTime && taskTime.FreeFloat ? taskTime.FreeFloat.value : null,
            totalFloat: taskTime && taskTime.TotalFloat ? taskTime.TotalFloat.value : null,
            isCritical: (taskTime && taskTime.IsCritical != null) ? (taskTime.IsCritical.value ? 1 : 0) : null,
            status: tsk.Status ? tsk.Status.value : null,
          });
        } catch(e) {}
      }
    } catch(e) {}
    for (var twi = 0; twi < tasks.length; twi++) {
      var _pex = _childToParentEx[tasks[twi]._ex];
      tasks[twi].wbsParent = (_pex != null && _exToGuid[_pex]) ? _exToGuid[_pex] : null;
      tasks[twi].isSummary = _hasKids[tasks[twi]._ex] ? 1 : 0;
    }

    try {
      var seqIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELSEQUENCE);
      for (var sqi = 0; sqi < seqIds.size(); sqi++) {
        try {
          var sq = ifcApi.GetLine(modelID, seqIds.get(sqi));
          var pred = sq.RelatingProcess ? ifcApi.GetLine(modelID, sq.RelatingProcess.value) : null;
          var succ = sq.RelatedProcess ? ifcApi.GetLine(modelID, sq.RelatedProcess.value) : null;
          if (pred && succ) {
            taskSequences.push({
              predId: pred.GlobalId ? pred.GlobalId.value : null,
              succId: succ.GlobalId ? succ.GlobalId.value : null,
              type: sq.SequenceType ? sq.SequenceType.value : 'FINISH_START',
              lag: sq.TimeLag ? (parseFloat(sq.TimeLag.value) || 0) : 0,
            });
          }
        } catch(e) {}
      }
    } catch(e) {}

    // Work calendar (§5.2): thin {name, recurrence_type, raw} carrier. Conversion DEFERRED
    // (round-the-clock for now) — capture the carrier so a later Settings option can use it.
    try {
      var calIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWORKCALENDAR);
      for (var cIx = 0; cIx < calIds.size(); cIx++) {
        try {
          var cal = ifcApi.GetLine(modelID, calIds.get(cIx));
          var calName = cal.Name ? cal.Name.value : null;
          var wts = cal.WorkingTimes ? (Array.isArray(cal.WorkingTimes) ? cal.WorkingTimes : [cal.WorkingTimes]) : [];
          var wtName = null, recType = null;
          if (wts.length) {
            try {
              var wkt = ifcApi.GetLine(modelID, wts[0].value);
              wtName = wkt.Name ? wkt.Name.value : null;
              if (wkt.RecurrencePattern) {
                var rp = ifcApi.GetLine(modelID, wkt.RecurrencePattern.value);
                recType = (rp && rp.RecurrenceType) ? rp.RecurrenceType.value : null;
              }
            } catch(e) {}
          }
          calendars.push({
            name: wtName || calName,
            recurrenceType: recType,
            raw: JSON.stringify({ calendarName: calName, workingTimeName: wtName, recurrenceType: recType, workingTimes: wts.length }),
          });
        } catch(e) {}
      }
    } catch(e) {}

    // task→element links — read BOTH directions, dedupe on taskId|guid
    var _seenTE = {};
    var _pushTE = function(taskId, guid) {
      if (!taskId || !guid) return;
      var k = taskId + '|' + guid;
      if (_seenTE[k]) return;
      _seenTE[k] = 1;
      taskElements.push({ taskId: taskId, guid: guid });
    };
    // Direction 1 — IfcRelAssignsToProcess: RelatingProcess=task, RelatedObjects=elements
    try {
      var assignIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSIGNSTOPROCESS);
      for (var apx = 0; apx < assignIds.size(); apx++) {
        try {
          var asg = ifcApi.GetLine(modelID, assignIds.get(apx));
          var process = asg.RelatingProcess ? ifcApi.GetLine(modelID, asg.RelatingProcess.value) : null;
          if (process && process.GlobalId && asg.RelatedObjects) {
            var taskGuid = process.GlobalId.value;
            for (var aj = 0; aj < asg.RelatedObjects.length; aj++) {
              try {
                var obj = ifcApi.GetLine(modelID, asg.RelatedObjects[aj].value);
                if (obj && obj.GlobalId) _pushTE(taskGuid, obj.GlobalId.value);
              } catch(e) {}
            }
          }
        } catch(e) {}
      }
    } catch(e) {}
    // Direction 2 — IfcRelAssignsToProduct: RelatingProduct=element, RelatedObjects=tasks (Bonsai)
    try {
      var prodIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSIGNSTOPRODUCT);
      for (var pri = 0; pri < prodIds.size(); pri++) {
        try {
          var rpr = ifcApi.GetLine(modelID, prodIds.get(pri));
          var product = rpr.RelatingProduct ? ifcApi.GetLine(modelID, rpr.RelatingProduct.value) : null;
          if (product && product.GlobalId && rpr.RelatedObjects) {
            var elemGuid = product.GlobalId.value;
            for (var pj = 0; pj < rpr.RelatedObjects.length; pj++) {
              try {
                var tobj = ifcApi.GetLine(modelID, rpr.RelatedObjects[pj].value);
                if (tobj && tobj.GlobalId) _pushTE(tobj.GlobalId.value, elemGuid);
              } catch(e) {}
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    if (schedules.length || tasks.length) {
      console.log('§4D_FOUND schedules=' + schedules.length + ' tasks=' + tasks.length + ' sequences=' + taskSequences.length + ' taskElements=' + taskElements.length);
      // T1b W-VOCAB witness — widened fields populated at the §5.2 evidence rates.
      var _cnt4d = function(f) { var n = 0; for (var z = 0; z < tasks.length; z++) if (tasks[z][f] != null) n++; return n; };
      var _nSummary = 0; for (var z2 = 0; z2 < tasks.length; z2++) if (tasks[z2].isSummary) _nSummary++;
      console.log('§4D_WIDE earlyStart=' + _cnt4d('earlyStart') + ' totalFloat=' + _cnt4d('totalFloat') +
        ' isCritical=' + _cnt4d('isCritical') + ' wbsParent=' + _cnt4d('wbsParent') +
        ' summary=' + _nSummary + ' calendars=' + calendars.length);
    } else {
      console.log('§4D_NONE no scheduling data in this IFC');
    }

    const result = {
      type: 'done',
      meta: {
        name: projectName,
        filename: filename,
        elementCount: elements.length,
        geomCount: geometries.length,
        disciplines: discCounts,
        storeys: storeys,
      },
      elements: renderableElements,
      geometries: geometries,
      bomTree: bomTree,  // §S267: parent→child IFC relationships for bom_tree table
      // §LENS_SPATIAL: Find Room lens — IfcBuilding/Storey/Space rows + element→space links
      spatialStructure: spatialStructure,
      relContainedInSpace: relContainedInSpace,
      transforms: transforms,
      // 4D_CAPTURE_AND_FALLBACK.md T1/T1b — native IFC 4D schedule (W-CAPTURE / W-VOCAB)
      schedules: schedules,
      tasks: tasks,
      taskSequences: taskSequences,
      taskElements: taskElements,
      calendars: calendars,  // T1b §5.2 — thin work-calendar carrier
    };

    // Transfer array buffers for zero-copy
    const transferables = [];
    for (const g of geometries) {
      transferables.push(g.vertices, g.indices);
      if (g.normals) transferables.push(g.normals);
    }

    post('progress', 100, 'Done');
    self.postMessage(result, transferables);

    // §S274: Do NOT call ifcApi.CloseModel() — on large buildings (>40K elements)
    // it hits the 4GB WASM memory ceiling and throws, which would send a spurious
    // error message after the result is already posted. Worker.terminate() from the
    // main thread reclaims all WASM + JS memory cleanly. No leak.
  } catch(err) {
    console.log('[S220] §IMPORT_FATAL ' + (err.message || String(err)));
    console.log('[S220] §IMPORT_STACK ' + (err.stack || 'no stack'));
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};

function post(type, pct, phase) {
  self.postMessage({ type: type, pct: pct, phase: phase });
}
