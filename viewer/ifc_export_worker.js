/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ifc_export_worker.js — S229: Browser IFC Export (STEP text builder)
// Pure STEP/ISO-10303-21 text generation. No web-ifc dependency.
// Input:  { elements[], transforms[], geometries[], guidHashMap{}, meta{} }
// Output: { type:'done', ifcData: ArrayBuffer } or { type:'error', message }

self.onmessage = function(e) {
  try {
    postMessage({ type: 'progress', pct: 5, phase: 'Building IFC structure...' });
    var text = buildIFC(e.data);
    postMessage({ type: 'progress', pct: 90, phase: 'Encoding...' });
    var buf = new TextEncoder().encode(text);
    postMessage({ type: 'done', ifcData: buf.buffer }, [buf.buffer]);
  } catch(err) {
    postMessage({ type: 'error', message: err.message });
  }
};

// IFC base64 GUID alphabet (22 chars from 128-bit)
var IFC64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

function newGuid() {
  var c = [];
  for (var i = 0; i < 22; i++) c.push(IFC64[Math.floor(Math.random() * 64)]);
  return c.join('');
}

// Convert element GUID (hex or IFC) to valid 22-char IFC GlobalId
function toIfcGuid(guid) {
  if (!guid) return newGuid();
  if (guid.length === 22 && /^[0-9A-Za-z_$]+$/.test(guid)) return guid;
  // Hex GUID → pad/convert to 22 chars
  var result = '';
  for (var i = 0; i < guid.length && result.length < 22; i++) {
    var v = parseInt(guid[i], 16);
    if (!isNaN(v)) result += IFC64[v] + IFC64[(v * 7 + i) % 64];
  }
  while (result.length < 22) result += IFC64[result.length % 64];
  return result.substring(0, 22);
}

function stepStr(s) {
  if (!s) return "''";
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function stepFloat(v) {
  var n = Number(v) || 0;
  var s = n.toFixed(6);
  // Ensure decimal point
  if (s.indexOf('.') === -1) s += '.';
  return s;
}

function buildIFC(data) {
  var id = 0;
  function next() { return ++id; }
  var lines = [];

  var elements = data.elements || [];
  var transforms = data.transforms || [];
  var geometries = data.geometries || [];
  var meta = data.meta || {};

  // Index transforms and geometries by guid
  var txMap = {};
  for (var i = 0; i < transforms.length; i++) txMap[transforms[i].guid] = transforms[i];
  var guidHashMap = data.guidHashMap || {};
  // Build hash→geometry lookup from unique geometries
  var hashGeoMap = {};
  for (var i = 0; i < geometries.length; i++) {
    var g = geometries[i];
    hashGeoMap[g.hash || g.guid] = g;  // support both old (guid) and new (hash) format
  }
  // Build geoMap: guid → geometry via hash lookup
  var geoMap = {};
  if (Object.keys(guidHashMap).length > 0) {
    for (var guid in guidHashMap) {
      var geo = hashGeoMap[guidHashMap[guid]];
      if (geo) geoMap[guid] = geo;
    }
  } else {
    // Legacy: geometries already keyed by guid
    for (var i = 0; i < geometries.length; i++) {
      if (!geoMap[geometries[i].guid]) geoMap[geometries[i].guid] = geometries[i];
    }
  }

  var buildingName = meta.buildingName || meta.name || 'Building';
  var projectName = meta.projectName || buildingName;
  var timestamp = Math.floor(Date.now() / 1000);
  var dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

  postMessage({ type: 'progress', pct: 10, phase: 'Writing header + spatial hierarchy...' });

  // ── Fixed infrastructure entities ──
  var idPerson = next();
  lines.push('#' + idPerson + '=IFCPERSON($,$,' + stepStr('') + ',$,$,$,$,$);');

  var idOrg = next();
  lines.push('#' + idOrg + '=IFCORGANIZATION($,' + stepStr('BIM OOTB') + ',$,$,$);');

  var idPersOrg = next();
  lines.push('#' + idPersOrg + '=IFCPERSONANDORGANIZATION(#' + idPerson + ',#' + idOrg + ',$);');

  var idApp = next();
  lines.push('#' + idApp + '=IFCAPPLICATION(#' + idOrg + ',' + stepStr('1.0') + ',' + stepStr('BIM OOTB') + ',' + stepStr('BIMOOTB') + ');');

  var idOwner = next();
  lines.push('#' + idOwner + '=IFCOWNERHISTORY(#' + idPersOrg + ',#' + idApp + ',$,.ADDED.,$,#' + idPersOrg + ',#' + idApp + ',' + timestamp + ');');

  // Units
  var idUnitM = next();
  lines.push('#' + idUnitM + '=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);');
  var idUnitA = next();
  lines.push('#' + idUnitA + '=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);');
  var idUnitV = next();
  lines.push('#' + idUnitV + '=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);');
  var idUnitR = next();
  lines.push('#' + idUnitR + '=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);');
  var idUnits = next();
  lines.push('#' + idUnits + '=IFCUNITASSIGNMENT((#' + idUnitM + ',#' + idUnitA + ',#' + idUnitV + ',#' + idUnitR + '));');

  // Shared geometry primitives
  var idOrigin = next();
  lines.push('#' + idOrigin + '=IFCCARTESIANPOINT((0.,0.,0.));');
  var idDirZ = next();
  lines.push('#' + idDirZ + '=IFCDIRECTION((0.,0.,1.));');
  var idDirX = next();
  lines.push('#' + idDirX + '=IFCDIRECTION((1.,0.,0.));');
  var idWorldPlacement = next();
  lines.push('#' + idWorldPlacement + '=IFCAXIS2PLACEMENT3D(#' + idOrigin + ',#' + idDirZ + ',#' + idDirX + ');');
  var idWorldLP = next();
  lines.push('#' + idWorldLP + '=IFCLOCALPLACEMENT($,#' + idWorldPlacement + ');');

  // Representation context
  var idRepCtx = next();
  lines.push('#' + idRepCtx + '=IFCGEOMETRICREPRESENTATIONCONTEXT($,' + stepStr('Model') + ',3,1.E-5,#' + idWorldPlacement + ',$);');
  var idSubCtx = next();
  lines.push('#' + idSubCtx + '=IFCGEOMETRICREPRESENTATIONSUBCONTEXT(' + stepStr('Body') + ',' + stepStr('Model') + ',*,*,*,*,#' + idRepCtx + ',$,.MODEL_VIEW.,$);');

  // Project
  var idProject = next();
  lines.push('#' + idProject + '=IFCPROJECT(' + stepStr(newGuid()) + ',#' + idOwner + ',' + stepStr(projectName) + ',$,$,$,$,(#' + idRepCtx + '),#' + idUnits + ');');

  // Site
  var idSite = next();
  lines.push('#' + idSite + '=IFCSITE(' + stepStr(newGuid()) + ',#' + idOwner + ',' + stepStr('Site') + ',$,$,#' + idWorldLP + ',$,$,.ELEMENT.,$,$,$,$,$);');

  // Building
  var idBuilding = next();
  lines.push('#' + idBuilding + '=IFCBUILDING(' + stepStr(newGuid()) + ',#' + idOwner + ',' + stepStr(buildingName) + ',$,$,#' + idWorldLP + ',$,$,.ELEMENT.,$,$,$);');

  // Aggregation: Project → Site → Building
  var idRelPS = next();
  lines.push('#' + idRelPS + '=IFCRELAGGREGATES(' + stepStr(newGuid()) + ',#' + idOwner + ',$,$,#' + idProject + ',(#' + idSite + '));');
  var idRelSB = next();
  lines.push('#' + idRelSB + '=IFCRELAGGREGATES(' + stepStr(newGuid()) + ',#' + idOwner + ',$,$,#' + idSite + ',(#' + idBuilding + '));');

  // ── Storeys ──
  var storeySet = {};
  for (var i = 0; i < elements.length; i++) {
    var s = elements[i].storey || 'Default';
    if (!storeySet[s]) storeySet[s] = [];
    storeySet[s].push(i);
  }
  var storeyNames = Object.keys(storeySet).sort();

  // Estimate storey elevation from element transforms
  var storeyIds = {};
  var storeyIdList = [];
  for (var si = 0; si < storeyNames.length; si++) {
    var sName = storeyNames[si];
    var elIndices = storeySet[sName];
    // Average Z of elements in this storey
    var sumZ = 0, countZ = 0;
    for (var j = 0; j < elIndices.length; j++) {
      var tx = txMap[elements[elIndices[j]].guid];
      if (tx) { sumZ += (tx.cz || 0); countZ++; }
    }
    var elevation = countZ > 0 ? sumZ / countZ : si * 3.0;

    var idStorey = next();
    storeyIds[sName] = idStorey;
    storeyIdList.push(idStorey);

    // Storey placement at its elevation
    var idStoreyPt = next();
    lines.push('#' + idStoreyPt + '=IFCCARTESIANPOINT((0.,0.,' + stepFloat(elevation) + '));');
    var idStoreyAx = next();
    lines.push('#' + idStoreyAx + '=IFCAXIS2PLACEMENT3D(#' + idStoreyPt + ',#' + idDirZ + ',#' + idDirX + ');');
    var idStoreyLP = next();
    lines.push('#' + idStoreyLP + '=IFCLOCALPLACEMENT(#' + idWorldLP + ',#' + idStoreyAx + ');');

    lines.push('#' + idStorey + '=IFCBUILDINGSTOREY(' + stepStr(newGuid()) + ',#' + idOwner + ',' + stepStr(sName) + ',$,$,#' + idStoreyLP + ',$,$,.ELEMENT.,' + stepFloat(elevation) + ');');
  }

  // Aggregate storeys under building
  if (storeyIdList.length > 0) {
    var idRelBS = next();
    lines.push('#' + idRelBS + '=IFCRELAGGREGATES(' + stepStr(newGuid()) + ',#' + idOwner + ',$,$,#' + idBuilding + ',(' + storeyIdList.map(function(x) { return '#' + x; }).join(',') + '));');
  }

  postMessage({ type: 'progress', pct: 25, phase: 'Writing geometry maps (' + geometries.length + ' unique)...' });

  // ── Phase 1: Build IfcRepresentationMap for each unique geometry hash ──
  var hashToRepMap = {};  // hash → { repMapId, faceSetId }

  function decodeBLOB(blob, TypedArray) {
    if (blob instanceof TypedArray) return blob;
    if (blob instanceof ArrayBuffer) return new TypedArray(blob);
    if (blob instanceof Uint8Array) return new TypedArray(blob.buffer, blob.byteOffset, blob.byteLength / (TypedArray === Float32Array ? 4 : 4));
    return null;
  }

  for (var gi = 0; gi < geometries.length; gi++) {
    var geo = geometries[gi];
    var hash = geo.hash || geo.guid;
    if (!geo.vertices || !geo.faces) continue;

    var verts = decodeBLOB(geo.vertices, Float32Array);
    var faces = decodeBLOB(geo.faces, Int32Array);
    if (!verts || !faces || verts.length < 9 || faces.length < 3) continue;

    var numVerts = verts.length / 3;
    var coordParts = [];
    for (var v = 0; v < numVerts; v++) {
      coordParts.push('(' + stepFloat(verts[v * 3]) + ',' + stepFloat(verts[v * 3 + 1]) + ',' + stepFloat(verts[v * 3 + 2]) + ')');
    }

    var idCoordList = next();
    lines.push('#' + idCoordList + '=IFCCARTESIANPOINTLIST3D((' + coordParts.join(',') + '));');

    var numTris = faces.length / 3;
    var triParts = [];
    for (var t = 0; t < numTris; t++) {
      triParts.push('(' + (faces[t * 3] + 1) + ',' + (faces[t * 3 + 1] + 1) + ',' + (faces[t * 3 + 2] + 1) + ')');
    }

    var idFaceSet = next();
    lines.push('#' + idFaceSet + '=IFCTRIANGULATEDFACESET(#' + idCoordList + ',$,.F.,(' + triParts.join(',') + '),$);');

    // RepresentationMap: origin at 0,0,0 + shape rep
    var idMapShapeRep = next();
    lines.push('#' + idMapShapeRep + '=IFCSHAPEREPRESENTATION(#' + idSubCtx + ',' + stepStr('Body') + ',' + stepStr('Tessellation') + ',(#' + idFaceSet + '));');
    var idMapOrigin = next();
    lines.push('#' + idMapOrigin + '=IFCAXIS2PLACEMENT3D(#' + idOrigin + ',#' + idDirZ + ',#' + idDirX + ');');
    var idRepMap = next();
    lines.push('#' + idRepMap + '=IFCREPRESENTATIONMAP(#' + idMapOrigin + ',#' + idMapShapeRep + ');');

    hashToRepMap[hash] = { repMapId: idRepMap, faceSetId: idFaceSet };

    if (gi % 5000 === 0 && gi > 0) {
      postMessage({ type: 'progress', pct: 25 + Math.round(gi / geometries.length * 30), phase: 'Geometry maps ' + gi + '/' + geometries.length });
    }
  }

  postMessage({ type: 'progress', pct: 55, phase: 'Writing elements (' + elements.length + ')...' });

  // ── Phase 2: Elements — reference RepresentationMap via IfcMappedItem ──
  var storeyElements = {};  // storeyId → [elementId]
  var exportedCount = 0;

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    // Resolve geometry hash for this element
    var elHash = guidHashMap[el.guid];
    var repInfo = elHash ? hashToRepMap[elHash] : null;
    if (!repInfo) {
      // Legacy fallback: try geoMap directly
      var geo = geoMap[el.guid];
      if (!geo || !geo.vertices || !geo.faces) continue;
      elHash = geo.hash || el.guid;
      repInfo = hashToRepMap[elHash];
      if (!repInfo) continue;
    }

    var tx = txMap[el.guid] || { cx: 0, cy: 0, cz: 0 };

    // Element placement
    var idElPt = next();
    lines.push('#' + idElPt + '=IFCCARTESIANPOINT((' + stepFloat(tx.cx) + ',' + stepFloat(tx.cy) + ',' + stepFloat(tx.cz) + '));');
    var idElAx = next();
    lines.push('#' + idElAx + '=IFCAXIS2PLACEMENT3D(#' + idElPt + ',#' + idDirZ + ',#' + idDirX + ');');
    var idElLP = next();
    lines.push('#' + idElLP + '=IFCLOCALPLACEMENT(#' + idWorldLP + ',#' + idElAx + ');');

    // IfcMappedItem referencing the RepresentationMap
    var idMapTarget = next();
    lines.push('#' + idMapTarget + '=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#' + idOrigin + ',1.,$);');
    var idMappedItem = next();
    lines.push('#' + idMappedItem + '=IFCMAPPEDITEM(#' + repInfo.repMapId + ',#' + idMapTarget + ');');

    // Material colour as styled item on the mapped item
    if (el.material) {
      var rgba = String(el.material).split(',').map(Number);
      if (rgba.length >= 3 && !isNaN(rgba[0])) {
        var r = rgba[0] > 1 ? rgba[0] / 255 : rgba[0];
        var g = rgba[1] > 1 ? rgba[1] / 255 : rgba[1];
        var b = rgba[2] > 1 ? rgba[2] / 255 : rgba[2];
        var idColour = next();
        lines.push('#' + idColour + '=IFCCOLOURRGB($,' + stepFloat(r) + ',' + stepFloat(g) + ',' + stepFloat(b) + ');');
        var idRendering = next();
        lines.push('#' + idRendering + '=IFCSURFACESTYLERENDERING(#' + idColour + ',0.,$,$,$,$,$,$,.FLAT.);');
        var idSurfStyle = next();
        lines.push('#' + idSurfStyle + "=IFCSURFACESTYLE('',.BOTH.,(#" + idRendering + '));');
        var idPresStyle = next();
        lines.push('#' + idPresStyle + '=IFCPRESENTATIONSTYLEASSIGNMENT((#' + idSurfStyle + '));');
        var idStyledItem = next();
        lines.push('#' + idStyledItem + '=IFCSTYLEDITEM(#' + idMappedItem + ',(#' + idPresStyle + '),$);');
      }
    }

    // Shape representation referencing the MappedItem
    var idShapeRep = next();
    lines.push('#' + idShapeRep + '=IFCSHAPEREPRESENTATION(#' + idSubCtx + ',' + stepStr('Body') + ',' + stepStr('MappedRepresentation') + ',(#' + idMappedItem + '));');
    var idProdShape = next();
    lines.push('#' + idProdShape + '=IFCPRODUCTDEFINITIONSHAPE($,$,(#' + idShapeRep + '));');

    // Element entity
    var ifcClass = el.ifcClass || 'IfcBuildingElementProxy';
    var stepType = ifcClassToStep(ifcClass);
    var elGuid = toIfcGuid(el.guid);
    var elName = el.name || el.guid || '';

    var idElement = next();
    lines.push('#' + idElement + '=' + stepType + '(' + stepStr(elGuid) + ',#' + idOwner + ',' + stepStr(elName) + ',$,$,#' + idElLP + ',#' + idProdShape + ',$);');

    // Track for storey containment
    var storeyName = el.storey || 'Default';
    var sId = storeyIds[storeyName];
    if (sId) {
      if (!storeyElements[sId]) storeyElements[sId] = [];
      storeyElements[sId].push(idElement);
    }

    exportedCount++;
    if (exportedCount % 200 === 0) {
      var pct = 25 + Math.round((exportedCount / elements.length) * 60);
      postMessage({ type: 'progress', pct: pct, phase: 'Writing element ' + exportedCount + '/' + elements.length + '...' });
    }
  }

  postMessage({ type: 'progress', pct: 85, phase: 'Writing containment relations...' });

  // ── Spatial containment: elements → storeys ──
  for (var sId in storeyElements) {
    var elRefs = storeyElements[sId].map(function(x) { return '#' + x; }).join(',');
    var idRel = next();
    lines.push('#' + idRel + '=IFCRELCONTAINEDINSPATIALSTRUCTURE(' + stepStr(newGuid()) + ',#' + idOwner + ',$,$,(' + elRefs + '),#' + sId + ');');
  }

  // ── Assemble STEP file ──
  var header =
    "ISO-10303-21;\n" +
    "HEADER;\n" +
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n" +
    "FILE_NAME(" + stepStr(buildingName + '.ifc') + "," + stepStr(dateStr) + ",(" + stepStr('BIM OOTB') + "),(" + stepStr('') + ")," + stepStr('') + "," + stepStr('BIM OOTB IFC Export') + "," + stepStr('') + ");\n" +
    "FILE_SCHEMA(('IFC4'));\n" +
    "ENDSEC;\n" +
    "DATA;\n";

  var footer =
    "ENDSEC;\n" +
    "END-ISO-10303-21;\n";

  console.log('[S229] §EXPORT_BUILD elements=' + exportedCount + '/' + elements.length + ' lines=' + lines.length);

  return header + lines.join('\n') + '\n' + footer;
}

// Map IfcClass name to STEP entity type
function ifcClassToStep(cls) {
  var map = {
    'IfcWall': 'IFCWALL',
    'IfcWallStandardCase': 'IFCWALLSTANDARDCASE',
    'IfcSlab': 'IFCSLAB',
    'IfcDoor': 'IFCDOOR',
    'IfcWindow': 'IFCWINDOW',
    'IfcRoof': 'IFCROOF',
    'IfcColumn': 'IFCCOLUMN',
    'IfcBeam': 'IFCBEAM',
    'IfcStair': 'IFCSTAIR',
    'IfcStairFlight': 'IFCSTAIRFLIGHT',
    'IfcRailing': 'IFCRAILING',
    'IfcCovering': 'IFCCOVERING',
    'IfcFooting': 'IFCFOOTING',
    'IfcCurtainWall': 'IFCCURTAINWALL',
    'IfcFurnishingElement': 'IFCFURNISHINGELEMENT',
    'IfcFurniture': 'IFCFURNITURE',
    'IfcBuildingElementProxy': 'IFCBUILDINGELEMENTPROXY',
    'IfcPlate': 'IFCPLATE',
    'IfcMember': 'IFCMEMBER',
    'IfcRamp': 'IFCRAMP',
    'IfcRampFlight': 'IFCRAMPFLIGHT',
    'IfcPipeSegment': 'IFCPIPESEGMENT',
    'IfcPipeFitting': 'IFCPIPEFITTING',
    'IfcDuctSegment': 'IFCDUCTSEGMENT',
    'IfcDuctFitting': 'IFCDUCTFITTING',
    'IfcCableSegment': 'IFCCABLESEGMENT',
    'IfcCableCarrierSegment': 'IFCCABLECARRIERSEGMENT',
    'IfcLightFixture': 'IFCLIGHTFIXTURE',
    'IfcSanitaryTerminal': 'IFCSANITARYTERMINAL',
    'IfcOutlet': 'IFCOUTLET',
    'IfcValve': 'IFCVALVE',
    'IfcAirTerminal': 'IFCAIRTERMINAL',
    'IfcFlowSegment': 'IFCFLOWSEGMENT',
    'IfcFlowTerminal': 'IFCFLOWTERMINAL',
    'IfcFlowFitting': 'IFCFLOWFITTING',
    'IfcFlowController': 'IFCFLOWCONTROLLER',
    'IfcDistributionElement': 'IFCDISTRIBUTIONELEMENT',
    'IfcFireSuppressionTerminal': 'IFCFIRESUPPRESSIONTERMINAL',
    'IfcElectricAppliance': 'IFCELECTRICAPPLIANCE',
    'IfcSwitchingDevice': 'IFCSWITCHINGDEVICE',
    'IfcBuildingElementPart': 'IFCBUILDINGELEMENTPART',
    'IfcSpace': 'IFCSPACE',
    'IfcOpeningElement': 'IFCOPENINGELEMENT',
    'IfcTransportElement': 'IFCTRANSPORTELEMENT',
    'IfcReinforcingBar': 'IFCREINFORCINGBAR',
    'IfcPile': 'IFCPILE',
    'IfcUnitaryEquipment': 'IFCUNITARYEQUIPMENT',
    'IfcCoil': 'IFCCOIL',
    'IfcFan': 'IFCFAN',
    'IfcCompressor': 'IFCCOMPRESSOR',
    'IfcChiller': 'IFCCHILLER',
    'IfcAlarm': 'IFCALARM',
    'IfcJunctionBox': 'IFCJUNCTIONBOX',
    'IfcWasteTerminal': 'IFCWASTETERMINAL',
    'IfcStackTerminal': 'IFCSTACKTERMINAL',
  };
  return map[cls] || 'IFCBUILDINGELEMENTPROXY';
}
