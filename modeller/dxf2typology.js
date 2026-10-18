// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2typology.js — building-type plausibility advisories (prompts/DXF2BIM_MODELLER_LANE.md §L22). Pure, Node + browser.
// Measures the built bodies against the cited `typical` ranges and `expect`ed classes of the building type in force (element_defaults.json `building_types`). Rows are advisory information:
// never blocking, never a default, never ground truth. A type without `typical`/`expect` (General, unknown) says nothing.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ REF: require('./element_defaults.json') });
  else root.Dxf2Typology = factory({ REF: null });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var FT = 0.3048, f1 = function (v) { return Number(Number(v).toFixed(1)); };
  function advise(els, typeName, ref) {
    var REFJ = ref || D.REF || {}, T = (REFJ.building_types || {})[typeName], res = { type: typeName || null, measured: {}, rows: [] };
    if (!T || (!T.typical && !T.expect)) return res;
    var typ = T.typical || {}, src = (T.sources || []).map(function (s) { return s.label; }).join('; ') || 'building type data', rows = res.rows;
    var row = function (code, message, extra) { rows.push(Object.assign({ code: 'TYP:' + code, level: 'advisory', message: message, source: src }, extra || {})); };
    els = els || [];
    var cols = els.filter(function (e) { return e.class === 'IfcColumn'; }), M = res.measured;
    if (cols.length) {
      var xs = [], ys = [];
      cols.forEach(function (c) { c.vertices.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); });
      var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs), dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      M.width_m = Math.min(dx, dy); M.length_m = Math.max(dx, dy); M.width_ft = f1(M.width_m / FT); M.length_ft = f1(M.length_m / FT);
    }
    var top = function (cls) { var z = els.filter(function (e) { return e.class === cls; }).map(function (e) { return e.z1; }); return z.length ? Math.max.apply(null, z) : null; };
    var eave = top('IfcBeam'); if (eave === null) eave = top('IfcColumn');
    var ridge = top('IfcRoof');
    if (eave !== null) { M.eave_m = eave; M.eave_ft = f1(eave / FT); }
    if (ridge !== null) { M.centre_m = ridge; M.centre_ft = f1(ridge / FT); }
    var range = function (code, label, v, r) {
      if (v === undefined || !r) { if (r) row(code, label + ' not measured (no ' + (code === 'eave_range' ? 'beam/column' : 'roof') + ' body)', { measured: null, range_ft: r }); return; }
      var lo = r[0], hi = r[1], d = v < lo ? lo - v : v > hi ? v - hi : 0;
      row(code, label + ' ' + v + ' ft (' + f1(v * FT) + ' m) is ' + (d === 0 ? 'inside' : (v > hi ? 'above' : 'below') + ' by ' + f1(d) + ' ft') + ' the cited ' + lo + '-' + hi + ' ft', { measured_ft: v, measured_m: f1(v * FT), range_ft: r, outside_by_ft: f1(d) });
    };
    var ec = false;
    if (typ.width_open_sided_ft) {
      if (M.width_ft === undefined) row('width_class', 'width not measured (no IfcColumn body)', { measured: null });
      else {
        var w = M.width_ft, lo = typ.width_open_sided_ft[0], hi = typ.width_open_sided_ft[1], ecMin = typ.width_environment_controlled_ft_min, cls;
        if (ecMin !== undefined && w >= ecMin) { cls = 'the environment-controlled class: tunnel features (end fans, evaporative pads) expected'; ec = true; }
        else if (w > hi) cls = 'between the open-sided range and the environment-controlled class';
        else if (w < lo) cls = 'narrower than the open-sided range';
        else cls = 'the open-sided range';
        row('width_class', 'width ' + w + ' ft (' + f1(M.width_m) + ' m) reads as ' + cls + ' (cited open-sided ' + lo + '-' + hi + ' ft' + (ecMin !== undefined ? ', environment-controlled from ' + ecMin + ' ft' : '') + ')', { measured_ft: w, measured_m: f1(M.width_m), range_ft: typ.width_open_sided_ft, environment_controlled_min_ft: ecMin === undefined ? null : ecMin });
      }
    }
    range('eave_range', 'eave', M.eave_ft, typ.eave_ft);
    range('centre_range', 'centre (ridge)', M.centre_ft, typ.centre_ft);
    if (T.expect) {
      var n = {}; els.forEach(function (e) { n[e.class] = (n[e.class] || 0) + 1; });
      var present = [];
      T.expect.forEach(function (c) { if (!n[c]) row('expected_missing', c + ' is expected in a ' + typeName + ' and none is in the model', { class: c }); else present.push(c + ' ' + n[c]); });
      row('expected_present', 'expected classes present: ' + (present.join(', ') || 'none'), { present: present });
    }
    if (ec && els.some(function (e) { return e.class === 'IfcFan'; }) && !els.some(function (e) { return e.kind === 'pad'; }))
      row('tunnel_no_pad', 'fans are drawn, no evaporative pad is drawn (the pad thickness and extent are not on the plan)', {});
    return res;
  }
  return { advise: advise };
});
