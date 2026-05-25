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

console.log('[S220] §WORKER_START loading web-ifc from CDN...');
importScripts('https://unpkg.com/web-ifc@0.0.77/web-ifc-api-iife.js');
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
  try {
    // Phase 1: Initialize web-ifc (10%)
    post('progress', 5, 'Starting IFC parser...');
    const ifcApi = new WebIFC.IfcAPI();
    console.log('[S220] §WASM_INIT starting with CDN locateFile...');
    await ifcApi.Init(function(path) {
      var resolved = 'https://unpkg.com/web-ifc@0.0.77/' + path;
      console.log('[S220] §WASM_LOCATE ' + path + ' → ' + resolved);
      return resolved;
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

    // Get storeys
    const storeyMap = {}; // expressID → storey name
    const storeyLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyLines.size(); i++) {
      try {
        const s = ifcApi.GetLine(modelID, storeyLines.get(i));
        storeyMap[storeyLines.get(i)] = s.Name ? s.Name.value : 'Level ' + i;
      } catch(e) { /* skip */ }
    }

    // Get containment (element → storey)
    const elementToStorey = {};
    const relLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relLines.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relLines.get(i));
        const storeyId = rel.RelatingStructure ? rel.RelatingStructure.value : null;
        const storeyName = storeyMap[storeyId] || 'Unknown';
        if (rel.RelatedElements) {
          for (let j = 0; j < rel.RelatedElements.length; j++) {
            const elId = rel.RelatedElements[j].value;
            elementToStorey[elId] = storeyName;
          }
        }
      } catch(e) { /* skip */ }
    }

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
    console.log('[S220] §GEOM_SUMMARY elements=' + elements.length + ' renderable=' + renderableElements.length + ' ghosts=' + ghosts.length + ' materials=' + matCount);

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
      }
    }
    console.log('[S220] §UNITS autoScale=' + autoScale + (autoScale !== 1.0 ? ' (mm→m heuristic)' : ' (already metres)'));
    console.log('[S220] §GEOM_DONE elements=' + elements.length + ' withGeometry=' + geometries.length + ' skipped=' + (elements.length - geometries.length) + ' withMaterial=' + matCount);
    post('progress', 95, 'Packaging results...');

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
      transforms: transforms,
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
