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

// IFC base64 GUID alphabet (22 chars from 128 bits; the FIRST char carries only 2 bits, so it must be 0-3).
var IFC64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
var _mix32 = function(x) { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
function _enc128(w) {            // w = 4 x uint32, most significant first -> 22-char IfcGloballyUniqueId
  var v = 0n, i;
  for (i = 0; i < 4; i++) v = (v << 32n) | BigInt(w[i] >>> 0);
  var s = '';
  for (i = 0; i < 21; i++) { s = IFC64[Number(v & 63n)] + s; v >>= 6n; }
  return IFC64[Number(v & 3n)] + s;
}
// §IFCX-X1 (prompts/IFC_COMPLIANCE_SELFCHECK.md §EXPORTER_FIX): DETERMINISTIC + unique. Pre-fix newGuid() used Math.random over all 64
// chars: non-deterministic and the first char was invalid ~94% of the time (ifcopenshell: IfcGloballyUniqueId base64 validation).
// The last word IS the counter (injective), the other three are Math.imul mixes of it.
var _guidSeq = 0, _usedGuids = {};
function newGuid() {
  var g;
  do { var n = _guidSeq++; g = _enc128([_mix32(n + 0x9e3779b9), _mix32(n ^ 0x7f4a7c15), _mix32(Math.imul(n + 1, 0x2545f491)), n]); } while (_usedGuids[g]);
  _usedGuids[g] = 1; return g;
}

// Source GUID -> valid, UNIQUE 22-char IFC GlobalId. A valid 22-char source id is kept as is; a 32-hex UUID is converted EXACTLY
// (128 bits -> 22 chars); anything else, or a repeat, gets a deterministic synthetic id. Never random.
function toIfcGuid(guid) {
  var g = null;
  if (guid && guid.length === 22 && /^[0-3][0-9A-Za-z_$]{21}$/.test(guid)) g = guid;
  else if (guid && /^[0-9a-fA-F]{32}$/.test(guid)) g = _enc128([parseInt(guid.substr(0, 8), 16), parseInt(guid.substr(8, 8), 16), parseInt(guid.substr(16, 8), 16), parseInt(guid.substr(24, 8), 16)]);
  if (g && !_usedGuids[g]) { _usedGuids[g] = 1; return g; }
  return newGuid();
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
  // §IFCX-X1 determinism: the stamp comes from the SOURCE (project_metadata.import_date via meta.importDate), never the wall clock, so the
  // same building gives the same bytes. No source stamp -> fixed epoch, logged (never silent).
  var _impMs = meta.importDate ? Date.parse(meta.importDate) : NaN;
  var _stampSrc = isNaN(_impMs) ? 'none(epoch)' : 'project_metadata.import_date';
  if (isNaN(_impMs)) _impMs = 0;
  var timestamp = Math.floor(_impMs / 1000);
  var dateStr = new Date(_impMs).toISOString().substring(0, 19);   // IFC header time_stamp is ISO 8601 (YYYY-MM-DDTHH:MM:SS)
  _guidSeq = 0; _usedGuids = {};                                    // per-export GUID state (a worker is reused across exports)
  console.log('[S229] §IFCX_B_TIMESTAMP source=' + _stampSrc + ' value=' + dateStr);

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
  var exportedCount = 0, skipped = [];

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    // Resolve geometry hash for this element
    var elHash = guidHashMap[el.guid];
    var repInfo = elHash ? hashToRepMap[elHash] : null;
    var skipWhy = null;
    if (!repInfo) {
      // Legacy fallback: try geoMap directly
      var geo = geoMap[el.guid];
      if (!geo || !geo.vertices || !geo.faces) skipWhy = (!elHash ? 'no-geometry-row-for-guid(no element_instances join)' : 'hash-has-no-usable-geometry');
      else {
        elHash = geo.hash || el.guid;
        repInfo = hashToRepMap[elHash];
        if (!repInfo) skipWhy = 'geometry-not-tessellated(verts<3 or faces<1)';
      }
    }
    if (skipWhy) {   // §IFCX: every skipped element is NAMED (pre-fix: 3 of 1122 vanished with no logged reason)
      skipped.push(skipWhy);
      console.log('[S229] §IFCX_B_SKIP guid=' + el.guid + ' class=' + (el.ifcClass || '?') + ' reason=' + skipWhy);
      continue;
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
    var _ar = IFC4_ARITY[stepType] || 9, _pad = '';
    for (var _k = 8; _k < _ar; _k++) _pad += ',$';              // §IFCX pad to the IFC4 arity (trailing optional attributes -> `$`)
    lines.push('#' + idElement + '=' + stepType + '(' + stepStr(elGuid) + ',#' + idOwner + ',' + stepStr(elName) + ',$,$,#' + idElLP + ',#' + idProdShape + ',$' + _pad + ');');

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
  console.log('[S229] §IFCX_B_COUNTS exported=' + exportedCount + ' skipped=' + skipped.length + ' skippedReasons=' + JSON.stringify(skipped.reduce(function(a, r) { a[r] = (a[r] || 0) + 1; return a; }, {})) +
    ' guidsUnique=' + Object.keys(_usedGuids).length);

  return header + lines.join('\n') + '\n' + footer;
}

// §IFCX: IFC4 STEP attribute counts per mapped entity — EXTRACTED from ifcopenshell.ifcopenshell_wrapper schema_by_name('IFC4') all_attributes()
// (prompts/IFC_COMPLIANCE_SELFCHECK.md §EXPORTER_FIX). Products are padded with `$` to this arity; a missing trailing attribute is invalid.
var IFC4_ARITY = {IFCAIRTERMINAL: 9, IFCALARM: 9, IFCBEAM: 9, IFCBUILDINGELEMENTPART: 9, IFCBUILDINGELEMENTPROXY: 9, IFCCABLECARRIERSEGMENT: 9, IFCCABLESEGMENT: 9, IFCCHILLER: 9, IFCCOIL: 9, IFCCOLUMN: 9, IFCCOMPRESSOR: 9, IFCCOVERING: 9, IFCCURTAINWALL: 9, IFCDISTRIBUTIONELEMENT: 8, IFCDOOR: 13, IFCDUCTFITTING: 9, IFCDUCTSEGMENT: 9, IFCELECTRICAPPLIANCE: 9, IFCFAN: 9, IFCFIRESUPPRESSIONTERMINAL: 9, IFCFLOWCONTROLLER: 8, IFCFLOWFITTING: 8, IFCFLOWSEGMENT: 8, IFCFLOWTERMINAL: 8, IFCFOOTING: 9, IFCFURNISHINGELEMENT: 8, IFCFURNITURE: 9, IFCJUNCTIONBOX: 9, IFCLIGHTFIXTURE: 9, IFCMEMBER: 9, IFCOPENINGELEMENT: 9, IFCOUTLET: 9, IFCPILE: 10, IFCPIPEFITTING: 9, IFCPIPESEGMENT: 9, IFCPLATE: 9, IFCRAILING: 9, IFCRAMP: 9, IFCRAMPFLIGHT: 9, IFCREINFORCINGBAR: 14, IFCROOF: 9, IFCSANITARYTERMINAL: 9, IFCSLAB: 9, IFCSPACE: 11, IFCSTACKTERMINAL: 9, IFCSTAIR: 9, IFCSTAIRFLIGHT: 13, IFCSWITCHINGDEVICE: 9, IFCTRANSPORTELEMENT: 9, IFCUNITARYEQUIPMENT: 9, IFCVALVE: 9, IFCWALL: 9, IFCWALLSTANDARDCASE: 9, IFCWASTETERMINAL: 9, IFCWINDOW: 13};

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
