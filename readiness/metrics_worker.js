/**
 * OpenBIM Readiness Assessment Toolkit — Track B metrics worker
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Calls web-ifc (MPL-2.0, That Open Company), vendored same-origin at ../viewer/lib/.
 *
 * WHAT THIS IS
 *   Track B of the assessment: what the respondent's model actually contains, measured rather
 *   than reported. Implements SCORING_SPEC.md §5.1 metrics M1-M15.
 *
 * WHY IT IS NOT import_worker.js
 *   PROMPT.md §ROADMAP is explicit: "Track B metrics at the web-ifc layer ... NEVER from the
 *   extracted DB (lossy projection)." import_worker.js exists to build renderable geometry and
 *   sql.js DBs; that projection drops exactly the semantic detail these metrics count. So this
 *   reads the same parser at the same layer, and computes nothing but counts.
 *   It requests NO geometry, writes NO database and touches NO storage.
 *
 * PRIVACY — this is load-bearing, not a nicety
 *   Nothing leaves the browser. No fetch, no upload, no IndexedDB. The only thing that ever
 *   crosses back to the page is the counts object below: integers, percentages and booleans.
 *   No GUID, no coordinate, no element name, no free text. The one string taken from the model
 *   is the schema; the exporting application is matched against a fixed allowlist and anything
 *   unrecognised becomes "other".
 *
 * Input:  postMessage({ arrayBuffer, filename })
 * Output: postMessage({ type:'progress', pct, phase })
 *         postMessage({ type:'done', metrics })
 *         postMessage({ type:'error', message })
 */

try {
  importScripts('../viewer/lib/web-ifc-api-iife.js');
  console.log('[READINESS] §MW_SRC local ../viewer/lib/web-ifc-api-iife.js');
} catch (e) {
  console.warn('[READINESS] §MW_SRC_FALLBACK local failed (' + e.message + '), trying CDN');
  importScripts('https://unpkg.com/web-ifc@0.0.77/web-ifc-api-iife.js');
  console.log('[READINESS] §MW_SRC cdn unpkg');
}

function post(type, extra) {
  var msg = { type: type };
  for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
  self.postMessage(msg);
}
function progress(pct, phase) { post('progress', { pct: pct, phase: phase }); }

/* M2: a fixed allowlist. Anything not on it is reported as "other" — we never ship a vendor
   string we did not anticipate, because that is free text off someone's model. */
var EXPORTERS = [
  ['revit', 'Autodesk Revit'], ['autodesk', 'Autodesk'], ['archicad', 'Graphisoft Archicad'],
  ['graphisoft', 'Graphisoft'], ['tekla', 'Trimble Tekla'], ['trimble', 'Trimble'],
  ['allplan', 'Allplan'], ['vectorworks', 'Vectorworks'], ['bentley', 'Bentley'],
  ['microstation', 'Bentley MicroStation'], ['aecosim', 'Bentley AECOsim'],
  ['solibri', 'Solibri'], ['blender', 'Blender / Bonsai'], ['bonsai', 'Blender / Bonsai'],
  ['ifcopenshell', 'IfcOpenShell'], ['freecad', 'FreeCAD'], ['sketchup', 'SketchUp'],
  ['rhino', 'Rhino'], ['civil 3d', 'Autodesk Civil 3D'], ['advance steel', 'Autodesk Advance Steel'],
  ['edificius', 'Edificius'], ['bricscad', 'BricsCAD'], ['plannerly', 'Plannerly'],
  ['bim-ootb', 'BIM-OOTB'], ['bimootb', 'BIM-OOTB']
];
function matchExporter(s) {
  if (!s) return 'other';
  var low = String(s).toLowerCase();
  for (var i = 0; i < EXPORTERS.length; i++) if (low.indexOf(EXPORTERS[i][0]) !== -1) return EXPORTERS[i][1];
  return 'other';
}

function idsOf(api, modelID, typeConst) {
  if (typeConst === undefined || typeConst === null) return [];
  try {
    var v = api.GetLineIDsWithType(modelID, typeConst), out = [];
    for (var i = 0; i < v.size(); i++) out.push(v.get(i));
    return out;
  } catch (e) { return []; }
}
function line(api, modelID, id) { try { return api.GetLine(modelID, id); } catch (e) { return null; } }
function val(x) { return (x && typeof x === 'object' && 'value' in x) ? x.value : x; }
function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function pc(n, d) { return d > 0 ? +( (n / d) * 100 ).toFixed(1) : 0; }

self.onmessage = async function (e) {
  var arrayBuffer = e.data.arrayBuffer;
  if (!arrayBuffer) { post('error', { message: 'No file data received.' }); return; }

  var api, modelID = -1;
  try {
    progress(4, 'Starting the IFC parser');
    api = new WebIFC.IfcAPI();
    await api.Init(function (path) { return '../viewer/lib/' + path; }, true);

    progress(12, 'Reading the file');
    var data = new Uint8Array(arrayBuffer);
    try {
      /* No geometry is requested anywhere in this worker — these are parse settings only. */
      modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false, USE_FAST_BOOLS: false, OPTIMIZE_PROFILES: false });
    } catch (parseErr) {
      var m = String(parseErr && parseErr.message || parseErr);
      post('error', { message: m.indexOf('Unsupported Schema') !== -1
        ? 'That IFC schema is not supported. This reads IFC2x3, IFC4 and IFC4x3.'
        : 'The file could not be parsed as IFC.' });
      return;
    }
    if (modelID < 0) { post('error', { message: 'The file could not be parsed as IFC. Supported: IFC2x3, IFC4, IFC4x3.' }); return; }

    var M = {};

    /* ---- M1 schema ------------------------------------------------------------------ */
    var schema = 'unknown';
    try { schema = String(api.GetModelSchema(modelID) || 'unknown').toUpperCase(); } catch (e2) {}
    M.schema = schema;

    /* ---- M2 exporting application (allowlist, else "other") -------------------------- */
    var exporter = 'other';
    try {
      var hdr = api.GetHeaderLine(modelID, WebIFC.FILE_NAME);
      if (hdr && hdr.arguments) {
        var joined = hdr.arguments.map(function (a) {
          return asArray(a).map(function (x) { return val(x); }).join(' ');
        }).join(' ');
        exporter = matchExporter(joined);
      }
    } catch (e3) {}
    if (exporter === 'other') {
      var apps = idsOf(api, modelID, WebIFC.IFCAPPLICATION);
      for (var ai = 0; ai < apps.length && exporter === 'other'; ai++) {
        var app = line(api, modelID, apps[ai]);
        if (app) exporter = matchExporter([val(app.ApplicationFullName), val(app.ApplicationIdentifier)].join(' '));
      }
    }
    M.exporter = exporter;

    progress(30, 'Counting elements');

    /* ---- element set: every type the schema calls an IfcElement ---------------------- */
    var elementIds = new Set(), byType = {};
    var allTypes = [];
    try { allTypes = api.GetIfcEntityList(modelID) || []; } catch (e4) {}
    for (var t = 0; t < allTypes.length; t++) {
      var code = allTypes[t];
      var isEl = false;
      try { isEl = api.IsIfcElement(code); } catch (e5) { isEl = false; }
      if (!isEl) continue;
      var ids = idsOf(api, modelID, code);
      if (!ids.length) continue;
      var name = 'IFCELEMENT';
      try { name = api.GetNameFromTypeCode(code) || name; } catch (e6) {}
      byType[name] = (byType[name] || 0) + ids.length;
      for (var q = 0; q < ids.length; q++) elementIds.add(ids[q]);
    }
    var elements = Array.from(elementIds);
    var N = elements.length;
    M.elements = N;                                   /* M3 */
    M.types_present = Object.keys(byType).length;
    M.top_types = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; })
                    .slice(0, 8).map(function (k) { return { type: k, n: byType[k] }; });

    if (N === 0) { post('error', { message: 'The file parsed, but it contains no IFC elements.' }); return; }

    progress(45, 'Checking the spatial chain');

    /* ---- M4 spatial chain, M5 spaces -------------------------------------------------- */
    var projects = idsOf(api, modelID, WebIFC.IFCPROJECT);
    var sites    = idsOf(api, modelID, WebIFC.IFCSITE);
    var bldgs    = idsOf(api, modelID, WebIFC.IFCBUILDING);
    var storeys  = idsOf(api, modelID, WebIFC.IFCBUILDINGSTOREY);
    var spaces   = idsOf(api, modelID, WebIFC.IFCSPACE);
    M.spatial_chain = { project: projects.length, site: sites.length, building: bldgs.length, storey: storeys.length };
    M.spatial_chain_complete = !!(projects.length && sites.length && bldgs.length && storeys.length);
    M.spaces = spaces.length;                          /* M5 */

    /* which storeys carry at least one space — via IfcRelAggregates */
    var storeySet = new Set(storeys), spaceSet = new Set(spaces), storeysWithSpace = new Set();
    var aggs = idsOf(api, modelID, WebIFC.IFCRELAGGREGATES);
    for (var g = 0; g < aggs.length; g++) {
      var rel = line(api, modelID, aggs[g]); if (!rel) continue;
      var parent = val(rel.RelatingObject && rel.RelatingObject.value !== undefined ? rel.RelatingObject : rel.RelatingObject);
      var pid = (rel.RelatingObject && rel.RelatingObject.value) || parent;
      if (!storeySet.has(pid)) continue;
      var kids = asArray(rel.RelatedObjects);
      for (var kk = 0; kk < kids.length; kk++) if (spaceSet.has(kids[kk] && kids[kk].value)) { storeysWithSpace.add(pid); break; }
    }
    M.storeys = storeys.length;
    M.storeys_with_spaces_pc = pc(storeysWithSpace.size, storeys.length);

    progress(58, 'Checking classification and properties');

    /* ---- M6 classification ------------------------------------------------------------ */
    var classified = new Set();
    var relCls = idsOf(api, modelID, WebIFC.IFCRELASSOCIATESCLASSIFICATION);
    for (var c = 0; c < relCls.length; c++) {
      var rc = line(api, modelID, relCls[c]); if (!rc) continue;
      asArray(rc.RelatedObjects).forEach(function (o) { if (o && elementIds.has(o.value)) classified.add(o.value); });
    }
    M.classified_pc = pc(classified.size, N);

    /* ---- M7 property sets, standard vs vendor ---------------------------------------- */
    var withPsets = new Set(), stdPset = 0, vendorPset = 0;
    var relProps = idsOf(api, modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (var pI = 0; pI < relProps.length; pI++) {
      var rp = line(api, modelID, relProps[pI]); if (!rp) continue;
      var defId = rp.RelatingPropertyDefinition && rp.RelatingPropertyDefinition.value;
      var isSet = false, nm = '';
      if (defId != null) {
        var def = line(api, modelID, defId);
        if (def) { nm = String(val(def.Name) || ''); isSet = true; }
      }
      if (isSet) { if (nm.indexOf('Pset_') === 0 || nm.indexOf('Qto_') === 0) stdPset++; else vendorPset++; }
      asArray(rp.RelatedObjects).forEach(function (o) { if (o && elementIds.has(o.value)) withPsets.add(o.value); });
    }
    M.psets_pc = pc(withPsets.size, N);
    M.psets_standard = stdPset;
    M.psets_vendor = vendorPset;
    M.psets_standard_pc = pc(stdPset, stdPset + vendorPset);

    progress(70, 'Checking materials, types and quantities');

    /* ---- M8 materials ----------------------------------------------------------------- */
    var withMaterial = new Set();
    var relMat = idsOf(api, modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (var mI = 0; mI < relMat.length; mI++) {
      var rm = line(api, modelID, relMat[mI]); if (!rm) continue;
      asArray(rm.RelatedObjects).forEach(function (o) { if (o && elementIds.has(o.value)) withMaterial.add(o.value); });
    }
    M.materials_pc = pc(withMaterial.size, N);

    /* ---- M12 type objects -------------------------------------------------------------- */
    var typed = new Set();
    var relType = idsOf(api, modelID, WebIFC.IFCRELDEFINESBYTYPE);
    for (var tI = 0; tI < relType.length; tI++) {
      var rt = line(api, modelID, relType[tI]); if (!rt) continue;
      asArray(rt.RelatedObjects).forEach(function (o) { if (o && elementIds.has(o.value)) typed.add(o.value); });
    }
    M.typed_pc = pc(typed.size, N);

    /* ---- M11 quantities ---------------------------------------------------------------- */
    var qtoSets = idsOf(api, modelID, WebIFC.IFCELEMENTQUANTITY);
    var withQto = new Set();
    if (qtoSets.length) {
      var qtoIds = new Set(qtoSets);
      for (var pJ = 0; pJ < relProps.length; pJ++) {
        var rq = line(api, modelID, relProps[pJ]); if (!rq) continue;
        var dq = rq.RelatingPropertyDefinition && rq.RelatingPropertyDefinition.value;
        if (!qtoIds.has(dq)) continue;
        asArray(rq.RelatedObjects).forEach(function (o) { if (o && elementIds.has(o.value)) withQto.add(o.value); });
      }
    }
    M.quantities = qtoSets.length > 0;
    M.quantities_pc = pc(withQto.size, N);

    progress(82, 'Checking integrity');

    /* ---- M13 space boundaries ---------------------------------------------------------- */
    M.space_boundaries = idsOf(api, modelID, WebIFC.IFCRELSPACEBOUNDARY).length > 0;

    /* ---- M14 orphans: elements in no spatial container --------------------------------- */
    var contained = new Set();
    var relCont = idsOf(api, modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (var sI = 0; sI < relCont.length; sI++) {
      var rs = line(api, modelID, relCont[sI]); if (!rs) continue;
      asArray(rs.RelatedElements).forEach(function (o) { if (o && elementIds.has(o.value)) contained.add(o.value); });
    }
    M.orphans = N - contained.size;
    M.orphans_pc = pc(N - contained.size, N);

    /* ---- M15 duplicate GUIDs, M9 naming, M10 georeferencing ---------------------------- */
    var seen = new Set(), dup = 0, named = 0;
    /* M9 is a heuristic and is labelled as one wherever it is shown: a name counts as
       meaningful when it is non-empty and is not a bare vendor default like "Wall:0815". */
    var DEFAULT_NAME = /^[A-Za-z]+[:_-]\s*\d+$/;
    for (var eI = 0; eI < N; eI++) {
      var el = line(api, modelID, elements[eI]); if (!el) continue;
      var g = val(el.GlobalId);
      if (g) { if (seen.has(g)) dup++; else seen.add(g); }
      var nmv = val(el.Name);
      if (nmv && String(nmv).trim() && !DEFAULT_NAME.test(String(nmv).trim())) named++;
      if ((eI & 1023) === 0) progress(82 + Math.round((eI / N) * 14), 'Checking integrity');
    }
    M.dup_guids = dup;
    M.named_pc = pc(named, N);

    var geo = false;
    for (var gI = 0; gI < sites.length && !geo; gI++) {
      var st = line(api, modelID, sites[gI]);
      if (st && (st.RefLatitude != null || st.RefLongitude != null)) geo = true;
    }
    if (!geo && idsOf(api, modelID, WebIFC.IFCMAPCONVERSION).length) geo = true;
    M.georef = geo;   /* boolean only — the coordinate itself is never read out */

    progress(98, 'Done');
    post('done', { metrics: M });
  } catch (err) {
    post('error', { message: 'Measurement failed: ' + String(err && err.message || err) });
  } finally {
    /* Free the wasm model. This worker holds no geometry, so closing is cheap and safe here. */
    try { if (api && modelID >= 0) api.CloseModel(modelID); } catch (e7) {}
  }
};
