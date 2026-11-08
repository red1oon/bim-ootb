// ⚠ DO NOT REMOVE — ONE FRAME (prompts/MODELLER_ONE_FRAME.md §2, Witness: W-ONE-FRAME). Read the log after every run.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// georef_frame.js — the ONE owner of "which local frame does an opened IFC land in". Both IFC routes call it: the Viewer import (viewer/import_worker.js) and the
// Modeller open (modeller/dxf2bim/ifc_extract_core.js). Lifted verbatim from import_worker.js (the §GEOREF_REBASE and §GEOREF blocks); the import's behaviour
// does not change. Pure (no DOM, no DB): UMD, global `GeorefFrame`.
//   pin(min, max, forced)  the rebase rule: per axis, a centre midpoint more than 10 km from the origin => a whole-metre offset on that axis; a federation pin
//                          (the offset of an earlier file opened together) is used verbatim unless this file's own offset disagrees with it by more than 1 km
//                          (a zeroed IfcSite): then the file keeps its OWN offset and the mismatch is flagged.
//   readSite(...)          the site facts the file states: IfcSite RefLatitude/RefLongitude (compound angle -> decimal degrees), RefElevation, the geometric
//                          context's TrueNorth, IfcMapConversion (IFC4). Read, never invented; absent stays absent.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeorefFrame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FAR_M = 10000;        // an axis whose midpoint sits further than this from the origin is georeferenced => rebased
  var DISAGREE_M = 1000;    // a file whose own offset differs from the federation pin by more than this is not in the pin's frame

  // min/max/maxBbox of element centres {cx,cy,cz,bx,by,bz} — the import's own scan
  function range(transforms) {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], maxBbox = 0;
    for (var i = 0; i < transforms.length; i++) {
      var t = transforms[i], cs = [t.cx, t.cy, t.cz];
      for (var a = 0; a < 3; a++) { if (cs[a] < mn[a]) mn[a] = cs[a]; if (cs[a] > mx[a]) mx[a] = cs[a]; }
      maxBbox = Math.max(maxBbox, t.bx || 0, t.by || 0, t.bz || 0);
    }
    return { min: mn, max: mx, maxBbox: maxBbox, span: Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], maxBbox) };
  }

  // → { offset:[x,y,z] whole metres, computed:[..] this file's own, forced:[..]|null, usedForced:bool, mismatch:bool, dev:number }
  function pin(min, max, forced) {
    var computed = [0, 0, 0], a;
    for (a = 0; a < 3; a++) {
      var mid = (min[a] + max[a]) / 2;
      if (Math.abs(mid) > FAR_M) computed[a] = Math.round(mid);
    }
    var out = { offset: computed, computed: computed, forced: forced || null, usedForced: false, mismatch: false, dev: 0 };
    if (forced && (forced[0] || forced[1] || forced[2])) {
      out.dev = Math.max(Math.abs(computed[0] - forced[0]), Math.abs(computed[1] - forced[1]), Math.abs(computed[2] - forced[2]));
      if (out.dev > DISAGREE_M) out.mismatch = true;               // keep the file's OWN honest offset, never force the alien one
      else { out.offset = [forced[0], forced[1], forced[2]]; out.usedForced = true; }
    }
    return out;
  }

  function isShifted(offset) { return !!(offset && (offset[0] || offset[1] || offset[2])); }

  // the import's in-place subtraction on element centres
  function rebase(transforms, offset) {
    if (!isShifted(offset)) return 0;
    for (var i = 0; i < transforms.length; i++) { transforms[i].cx -= offset[0]; transforms[i].cy -= offset[1]; transforms[i].cz -= offset[2]; }
    return transforms.length;
  }

  // the two log lines both routes print (tag per route)
  function logLines(tag, filename, p) {
    var l = [];
    if (p.mismatch) l.push('[S220] §GEOREF_MISMATCH ' + filename + ' computed=(' + p.computed.join(',') + ') vs federation frame=(' + p.forced.join(',') +
      ') — this file sits >1km from its siblings (zeroed IfcSite / different base point?). Kept at its OWN frame (not force-shifted into the federation frame — that would move it further, not closer); repair the source or use the offline extractor.');
    if (isShifted(p.offset)) l.push('[S220] §GEOREF_REBASE offset=(' + p.offset.join(',') + ') — georeferenced site rebased to local origin (offset kept in project_metadata)');
    return l;
  }

  // ── site facts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function num(x) {
    if (x == null) return null;
    if (typeof x === 'number') return x;
    if (typeof x.value === 'number') return x.value;
    if (typeof x._representationValue === 'number') return x._representationValue;
    return null;
  }
  // IfcCompoundPlaneAngleMeasure -> decimal degrees. Components are [deg, min, sec, millionths-of-sec] and web-ifc hands each one back wrapped, so unwrap before
  // arithmetic. Per the IFC spec every component carries the SAME sign, but exporters disagree: a real file writes RefLongitude = (0, -7, -34, -450321) with an
  // UNSIGNED zero degrees component. Take the sign from ANY negative component, then sum magnitudes.
  function cpaToDegrees(parts) {
    // web-ifc 0.0.77 returns a compound angle WRAPPED: RefLatitude = { value: [41,52,27,840000], type: 10 } (measured on a public IFC), so `.length` of the wrapper is undefined.
    // The import's own copy of this reader tested `parts.length` on the wrapper, returned null for every file, and so wrote site_latlong_source='unknown' on files that state a location.
    if (parts && !Array.isArray(parts) && Array.isArray(parts.value)) parts = parts.value;
    if (!parts || !parts.length) return null;
    var v = [], i, p;
    for (i = 0; i < 4; i++) {
      p = parts[i];
      if (p == null) { v.push(0); continue; }
      if (typeof p === 'number') v.push(p);
      else if (typeof p.value === 'number') v.push(p.value);
      else if (typeof p._representationValue === 'number') v.push(p._representationValue);
      else return null;
    }
    var sign = (v[0] < 0 || v[1] < 0 || v[2] < 0 || v[3] < 0) ? -1 : 1;
    return sign * (Math.abs(v[0]) + Math.abs(v[1]) / 60 + Math.abs(v[2]) / 3600 + Math.abs(v[3]) / 3600000000);
  }

  // lengthUnitScale: the file's declared LENGTHUNIT in metres (raw GetLine values are in the file's own unit); null => elevation is not converted (left null)
  // → { trueNorthAngle, trueNorthSource, latitude, longitude, elevationM, latLongSource, mapConversion: {project_metadata key: string}|null }
  // `say` is an optional log function.
  function readSite(ifcApi, modelID, WebIFC, lengthUnitScale, say) {
    say = say || function () {};
    var georef = { trueNorthAngle: 0, trueNorthSource: 'default_zero', latitude: null, longitude: null, elevationM: null, latLongSource: 'unknown', mapConversion: null };
    // ⚠ SIGN: TrueNorth points at true north IN MODEL COORDINATES, so true north sits at model-bearing atan2(tx, ty). The consumers want the bearing of MODEL north
    // measured from TRUE north: the stored value is atan2(-tx, ty) in DEGREES (same formula as DAGCompiler/python/extractIFCtoDB.py extract_georef).
    try {
      var ctxIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT);
      for (var gci = 0; gci < ctxIds.size(); gci++) {
        var ctx = ifcApi.GetLine(modelID, ctxIds.get(gci));
        if (!ctx || !ctx.TrueNorth || ctx.TrueNorth.value == null) continue;
        var dir = ifcApi.GetLine(modelID, ctx.TrueNorth.value), dr = dir && dir.DirectionRatios;
        if (!dr || dr.length < 2) continue;
        // ⚠ TRUE NORTH MUST LIE IN THE GROUND PLANE. Four shipped files write TrueNorth = IFCDIRECTION((2.0, 6.1e-17, 1.0)), a THREE-component direction with z = 1.0:
        // its first two ratios give atan2(-2, 0) = -90 deg exactly, a quarter turn wrong. REFUSE it, and say it was refused (a different fact from "the file had none").
        var tz = dr.length > 2 ? num(dr[2]) : 0;
        if (tz != null && Math.abs(tz) > 1e-6) { georef.trueNorthSource = 'malformed_truenorth_ignored'; continue; }
        var tx = num(dr[0]), ty = num(dr[1]);
        if (tx == null || ty == null || (!tx && !ty)) continue;
        var ang = Math.atan2(-tx, ty) * 180 / Math.PI;
        // Revit writes cos(90 deg) as 6.123e-17 rather than 0: snap that float noise (1e-9 deg is 0.1 mm of arc).
        georef.trueNorthAngle = Math.abs(ang) < 1e-9 ? 0 : ang;
        georef.trueNorthSource = 'ifc_truenorth';   // a REAL authored 0 — not the old stub 0
        break;
      }
    } catch (tnErr) { say('[S220] §GEOREF_TRUENORTH_ERROR ' + tnErr.message); }
    try {
      var gsIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
      for (var gsi = 0; gsi < gsIds.size(); gsi++) {
        var gs = ifcApi.GetLine(modelID, gsIds.get(gsi));
        var lat = cpaToDegrees(gs && gs.RefLatitude), lon = cpaToDegrees(gs && gs.RefLongitude);
        if (lat == null || lon == null) continue;  // a federated drop can carry a bare IfcSite
        georef.latitude = lat; georef.longitude = lon; georef.latLongSource = 'ifc_site';
        var re = num(gs && gs.RefElevation);
        if (re != null && lengthUnitScale != null) georef.elevationM = re * lengthUnitScale;
        break;
      }
    } catch (geoErr) { say('[S220] §GEOREF_SITE_ERROR ' + geoErr.message); }
    // IfcMapConversion (IFC4): the file's own statement of how its local frame sits on the map. Recorded AS STATED (the file's numbers, no unit change), never used to move anything.
    try {
      if (WebIFC.IFCMAPCONVERSION) {
        var mcIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION);
        if (mcIds.size() > 0) {
          var mc = ifcApi.GetLine(modelID, mcIds.get(0)), m = {}, put = function (k, v) { if (v != null && !(typeof v === 'number' && isNaN(v))) m[k] = String(v); };
          put('map_conversion_eastings', num(mc.Eastings)); put('map_conversion_northings', num(mc.Northings)); put('map_conversion_orthogonal_height', num(mc.OrthogonalHeight));
          put('map_conversion_x_axis_abscissa', num(mc.XAxisAbscissa)); put('map_conversion_x_axis_ordinate', num(mc.XAxisOrdinate)); put('map_conversion_scale', num(mc.Scale));
          try { if (mc.TargetCRS && mc.TargetCRS.value != null) { var crs = ifcApi.GetLine(modelID, mc.TargetCRS.value); if (crs && crs.Name && crs.Name.value != null) put('map_conversion_target_crs', crs.Name.value); } } catch (e2) { /* CRS name stays absent */ }
          if (Object.keys(m).length) { m.map_conversion_source = 'ifc_mapconversion'; georef.mapConversion = m; }
        }
      }
    } catch (mcErr) { say('[S220] §GEOREF_MAPCONVERSION_ERROR ' + mcErr.message); }
    say('[S220] §GEOREF true_north=' + georef.trueNorthAngle.toFixed(6) + 'deg src=' + georef.trueNorthSource + ' lat=' + (georef.latitude == null ? 'n/a' : georef.latitude.toFixed(8)) +
      ' lon=' + (georef.longitude == null ? 'n/a' : georef.longitude.toFixed(8)) + ' elev=' + (georef.elevationM == null ? 'n/a' : georef.elevationM.toFixed(4) + 'm') + ' src=' + georef.latLongSource +
      ' mapConversion=' + (georef.mapConversion ? 'yes' : 'none'));
    return georef;
  }

  // project_metadata rows both routes write (key, value). Offset rows only when the file was shifted (the import's rule: an unshifted file's DB stays as it was);
  // the site rows are ALWAYS written, "" when the file states nothing (never 0/0: that is a real place in the Gulf of Guinea).
  function metadataRows(offset, georef, unitScale) {
    var r = [];
    if (isShifted(offset)) r.push(['georef_offset_x', String(offset[0])], ['georef_offset_y', String(offset[1])], ['georef_offset_z', String(offset[2])], ['unit_scale', String(unitScale || 1)]);
    var g = georef || {};
    r.push(['true_north_angle', String(g.trueNorthAngle == null ? 0 : g.trueNorthAngle)], ['true_north_source', String(g.trueNorthSource || 'default_zero')],
      ['site_latitude', g.latitude == null ? '' : String(g.latitude)], ['site_longitude', g.longitude == null ? '' : String(g.longitude)],
      ['site_elevation_m', g.elevationM == null ? '' : String(g.elevationM)], ['site_latlong_source', String(g.latLongSource || 'unknown')]);
    if (g.mapConversion) Object.keys(g.mapConversion).forEach(function (k) { r.push([k, g.mapConversion[k]]); });
    return r;
  }

  return { FAR_M: FAR_M, DISAGREE_M: DISAGREE_M, range: range, pin: pin, isShifted: isShifted, rebase: rebase, logLines: logLines, cpaToDegrees: cpaToDegrees, readSite: readSite, metadataRows: metadataRows };
});
