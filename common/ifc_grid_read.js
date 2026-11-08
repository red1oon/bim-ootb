// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-IFC-GRID. ifc_grid_read.js: the ONE owner of "read the grid out of the IFC" (IfcGrid / IfcGridAxis).
// SCOPE: prompts/DISC_WALK_DRAWN_MAINS.md §4.2a. Read the log (§IFC-GRID) after every run; exit code is not evidence.
// Two callers, one reader: modeller/dxf2bim/ifc_extract_core.js (route=open) and viewer/import_worker.js (route=import).
// Each caller passes its OWN frame (opts.lengthScale, opts.scaleOut, opts.offset), so a row sits in that route's element_transforms frame.
// Axis curves are in the IfcGrid's ObjectPlacement; the whole IfcLocalPlacement chain (location + Axis/RefDirection, recursively) is applied.
// Curves read: IfcPolyline (first and last point) and IfcTrimmedCurve over IfcLine. Anything else is skipped and counted.
(function (root) {
  'use strict';
  function ref(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }
  function num(v) { return (v && typeof v === 'object') ? Number(v.value) : Number(v); }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function pad3(c) { c = c.map(num); while (c.length < 3) c.push(0); return c; }

  // Build the reader for one open model. T = the web-ifc namespace.
  function make(api, id, T) {
    function line(x) { return api.GetLine(id, ref(x)); }
    function dirOf(h) { return pad3(line(h).DirectionRatios); }
    function pointOf(h) { return pad3(line(h).Coordinates); }
    function axis2(eid) {   // IfcAxis2Placement3D/2D -> { o, x, y, z } in file units
      var p = line(eid), z = [0, 0, 1], xr = [1, 0, 0];
      if (p.type === T.IFCAXIS2PLACEMENT3D) { if (p.Axis) z = norm(dirOf(p.Axis)); if (p.RefDirection) xr = dirOf(p.RefDirection); }
      else if (p.type === T.IFCAXIS2PLACEMENT2D) { if (p.RefDirection) xr = dirOf(p.RefDirection); }
      else return null;
      if (!z) return null;
      var k = dot(xr, z), x = norm([xr[0] - k * z[0], xr[1] - k * z[1], xr[2] - k * z[2]]);
      if (!x) return null;
      return { o: pointOf(p.Location), x: x, y: cross(z, x), z: z };
    }
    function compose(P, L) {   // world = P.o + P.[x y z] * L
      return {
        o: [0, 1, 2].map(function (i) { return P.o[i] + P.x[i] * L.o[0] + P.y[i] * L.o[1] + P.z[i] * L.o[2]; }),
        x: [0, 1, 2].map(function (i) { return P.x[i] * L.x[0] + P.y[i] * L.x[1] + P.z[i] * L.x[2]; }),
        y: [0, 1, 2].map(function (i) { return P.x[i] * L.y[0] + P.y[i] * L.y[1] + P.z[i] * L.y[2]; }),
        z: [0, 1, 2].map(function (i) { return P.x[i] * L.z[0] + P.y[i] * L.z[1] + P.z[i] * L.z[2]; }) };
    }
    function placement(pid, depth) {   // the full IfcLocalPlacement chain, recursively
      if (depth > 64) return null;
      var lp = line(pid);
      if (!lp || lp.type !== T.IFCLOCALPLACEMENT) return null;
      var L = axis2(ref(lp.RelativePlacement));
      if (!L) return null;
      if (!lp.PlacementRelTo) return L;
      var P = placement(ref(lp.PlacementRelTo), depth + 1);
      return P ? compose(P, L) : null;
    }
    function placementParents(pid) {   // express ids of every placement above pid (for the storey fallback)
      var out = [], d = 0, lp = line(pid);
      while (lp && lp.type === T.IFCLOCALPLACEMENT && lp.PlacementRelTo && d++ < 64) { var up = ref(lp.PlacementRelTo); out.push(up); lp = line(up); }
      return out;
    }
    // The two ends of an axis curve in the grid's local frame (file units), or null when the curve type is not read.
    function ends(cid) {
      var c = line(cid);
      if (!c) return null;
      if (c.type === T.IFCPOLYLINE) {
        var pts = c.Points || [];
        if (pts.length < 2) return null;
        return [pointOf(pts[0]), pointOf(pts[pts.length - 1])];
      }
      if (c.type === T.IFCTRIMMEDCURVE) {
        var b = line(c.BasisCurve);
        if (!b || b.type !== T.IFCLINE) return null;
        var P0 = pointOf(b.Pnt), V = line(b.Dir), D = norm(dirOf(V.Orientation)), mag = num(V.Magnitude);
        if (!D || !isFinite(mag)) return null;
        var trim = function (list) {
          list = list || [];
          for (var i = 0; i < list.length; i++) {   // a cartesian point wins over a parameter (IFC: either may be given; the point is the stated place)
            var it = list[i], e = it && typeof it === 'object' ? it : null;
            if (e && e.type === 5) return pointOf(e);
          }
          for (var j = 0; j < list.length; j++) {
            var it2 = list[j];
            if (it2 && typeof it2 === 'object' && it2.type !== 5 && it2.value !== undefined && isFinite(Number(it2.value))) {
              var t = Number(it2.value) * mag; return [P0[0] + D[0] * t, P0[1] + D[1] * t, P0[2] + D[2] * t];
            }
          }
          return null;
        };
        var a = trim(c.Trim1), z = trim(c.Trim2);
        return a && z ? [a, z] : null;
      }
      return null;
    }
    return { line: line, placement: placement, placementParents: placementParents, ends: ends };
  }

  /**
   * @param {Object} api web-ifc IfcAPI @param {number} id model id @param {Object} T the web-ifc namespace
   * @param {{lengthScale:?number, scaleOut:?number, offset:?number[], storeyName:?function(number):?string}} opts
   *   lengthScale: metres per file unit (null: nothing is assumed, nothing is read, counted in unitless).
   *   scaleOut: a further factor the route applies to its own centres (the open route's span heuristic); default 1.
   *   offset: [x, y] the route subtracts from its own centres (the import route's whole-metre rebase); default 0.
   *   storeyName: express id of an IfcBuildingStorey -> the name elements_meta.storey uses for it.
   * @returns {{grids:number, axes:number, tagged:number, skippedCurves:number, unitless:boolean, rows:Object[]}}
   */
  function read(api, id, T, opts) {
    opts = opts || {};
    var res = { grids: 0, axes: 0, tagged: 0, skippedCurves: 0, unitless: false, rows: [] };
    var gids = api.GetLineIDsWithType(id, T.IFCGRID);
    if (!gids.size()) return res;
    res.grids = gids.size();
    var S = opts.lengthScale, out = (opts.scaleOut == null ? 1 : opts.scaleOut), off = opts.offset || [0, 0];
    var R = make(api, id, T);
    var nameOf = opts.storeyName || function () { return null; };
    // storey of each grid: IfcRelContainedInSpatialStructure first, else the storey whose ObjectPlacement sits above the grid's
    var storeyOfEl = {}, storeyByPlacement = {}, sids = api.GetLineIDsWithType(id, T.IFCBUILDINGSTOREY), i, j, k;
    for (i = 0; i < sids.size(); i++) { var sl = R.line(sids.get(i)); if (sl && sl.ObjectPlacement) storeyByPlacement[ref(sl.ObjectPlacement)] = sids.get(i); }
    var rels = api.GetLineIDsWithType(id, T.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (i = 0; i < rels.size(); i++) {
      var rl = R.line(rels.get(i)), st = ref(rl.RelatingStructure);
      if (nameOf(st) == null) continue;
      (rl.RelatedElements || []).forEach(function (e) { storeyOfEl[ref(e)] = st; });
    }
    for (i = 0; i < gids.size(); i++) {
      var gid = gids.get(i), g = R.line(gid), gGuid = ref(g.GlobalId), gName = g.Name ? ref(g.Name) : null;
      var sid = storeyOfEl[gid];
      if (sid == null && g.ObjectPlacement) {
        var ps = R.placementParents(ref(g.ObjectPlacement));
        for (j = 0; j < ps.length; j++) if (storeyByPlacement[ps[j]] != null) { sid = storeyByPlacement[ps[j]]; break; }
      }
      var storey = sid != null ? nameOf(sid) : null;
      var P = null, placeFail = false;
      if (g.ObjectPlacement) { P = R.placement(ref(g.ObjectPlacement), 0); placeFail = !P; }
      var sets = [['U', g.UAxes], ['V', g.VAxes], ['W', g.WAxes]];
      for (k = 0; k < sets.length; k++) {
        var list = sets[k][1] || [];
        for (j = 0; j < list.length; j++) {
          res.axes++;
          var ax = R.line(list[j]), tag = ax.AxisTag != null ? ref(ax.AxisTag) : null, e = null;
          if (S == null) { res.unitless = true; res.skippedCurves++; continue; }
          if (placeFail) { res.skippedCurves++; continue; }
          try { e = R.ends(ax.AxisCurve); } catch (err) { e = null; }
          if (!e) { res.skippedCurves++; continue; }
          var w = e.map(function (p) {
            var q = P ? [0, 1, 2].map(function (n) { return P.o[n] + P.x[n] * p[0] + P.y[n] * p[1] + P.z[n] * p[2]; }) : p;
            return [q[0] * S * out - off[0], q[1] * S * out - off[1]];
          });
          if (tag != null && tag !== '') res.tagged++;
          res.rows.push({ grid_guid: gGuid, grid_name: gName, storey: storey, axis_guid: gGuid + ':' + sets[k][0] + j, axis_set: sets[k][0], tag: tag,
            x0: w[0][0], y0: w[0][1], x1: w[1][0], y1: w[1][1] });
        }
      }
    }
    return res;
  }

  var DDL = 'CREATE TABLE ifc_grid_axis (grid_guid TEXT, grid_name TEXT, storey TEXT, axis_guid TEXT, tag TEXT, x0 REAL, y0 REAL, x1 REAL, y1 REAL, axis_set TEXT)';
  var API = { read: read, DDL: DDL, line: function (route, r) {
    return '§IFC-GRID grids=' + r.grids + ' axes=' + r.rows.length + ' tagged=' + r.tagged + ' skippedCurves=' + r.skippedCurves + ' route=' + route +
      (r.unitless ? ' unitless=1' : '') + (r.grids ? '' : ' (no IfcGrid in the file: no rows, no table)');
  } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.IfcGridRead = API;
})(typeof self !== 'undefined' ? self : this);
