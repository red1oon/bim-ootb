// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2ledger.js — the layer ledger (prompts/DXF2BIM_FOUNDATION_LANE.md §3c, guardrail G5). Pure, Node + browser.
// The entity account (dxf2account.js) only says the DXF PARSER read every entity. It does not say any builder USED it: a layer nobody reads (or a whole set read by the wrong pipeline) still reports `dropped=none`.
// This ledger answers the question a new drawing set needs answered first: for every layer of every sheet, what is on it, how was it typed, and how many of its entities produced a body?
//   build(sheets, els) -> { rows: [{ sheet, layer, role, entities: {TYPE: n}, geometry, annotation, typed, used_entities, bodies, status }], totals, flagged }
// status: settings (the product's own layer) | annotation (text, dimensions: nothing to build) | ignored_by_choice (typed ignore / dims / grid) | used (all geometry entities produced a body) | partly_used (some did: the ratio is in used_entities / geometry)
//         | evidence (an elevation / section layer typed with a body kind whose bodies exist: it gave heights or profiles, entity-level use is not recorded) | typed_no_output (typed with a body kind, nothing built) | unread (geometry on a layer nobody typed).
// A layer holding HATCH entities is judged at layer level only (no handles). An evidence-only layer type (elevdoor, elevwall, glazing, levelline, sectslab, sectwall) is `evidence` when the bodies it feeds exist.
// `used_entities` counts DISTINCT source handles that appear on a body of that sheet and layer; a body from several entities lists them joined by '+'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Ledger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var GEOM = { LINE: 1, LWPOLYLINE: 1, POLYLINE: 1, ARC: 1, CIRCLE: 1, ELLIPSE: 1, SPLINE: 1, HATCH: 1, INSERT: 1, SOLID: 1, '3DFACE': 1, TRACE: 1 };
  var QUIET = { ignore: 1, dims: 1, grid: 1 }, MARK_LAYER = 'DXF2BIM-MARK';
  var FEEDS = { elevdoor: ['doorswing'], elevwall: ['panel', 'wall'], glazing: ['window'], levelline: null, sectslab: ['slab'], sectwall: ['wall'] };   // evidence-only layer types: what they give heights / levels to (null = any body)
  function base(n) { return String(n || '').replace(/_marked(?=\.dxf$)/i, ''); }
  function build(sheets, els) {
    var rows = [], builtKinds = {}, byKey = {};
    (els || []).forEach(function (e) {
      builtKinds[e.kind] = (builtKinds[e.kind] || 0) + 1;
      String(e.layer || '').split(/[+|,]/).forEach(function (L) {
        var k = base(e.sheet) + '\u0001' + L, o = byKey[k] || (byKey[k] = { bodies: 0, handles: {} }); o.bodies++;
        String(e.handle || '').split('+').forEach(function (h) { if (h && h !== 'synth') o.handles[h] = 1; });
      });
    });
    (sheets || []).forEach(function (sh) {
      var per = {}, ents = (sh.dxf && sh.dxf.entities) || [];
      ents.forEach(function (e) { var L = e.layer || '0', o = per[L] || (per[L] = { types: {}, handles: {} }); o.types[e.type] = (o.types[e.type] || 0) + 1; if (e.handle) o.handles[e.handle] = 1; });
      Object.keys(sh.hatchLayers || {}).forEach(function (L) { var o = per[L] || (per[L] = { types: {}, handles: {} }); o.types.HATCH = (o.types.HATCH || 0) + sh.hatchLayers[L]; });   // dxf-parser has no HATCH: dxf2hatch counted them
      var typedOf = {}; ((sh.desc && sh.desc.layers) || []).forEach(function (l) { if (!(l.layer in typedOf)) typedOf[l.layer] = l.type; });
      Object.keys(per).sort().forEach(function (L) {
        var o = per[L], g = 0, a = 0; Object.keys(o.types).forEach(function (t) { if (GEOM[t]) g += o.types[t]; else a += o.types[t]; });
        var typed = typedOf[L] || null, hit = byKey[base(sh.name) + '\u0001' + L] || { bodies: 0, handles: {} }, used = Object.keys(hit.handles).filter(function (h) { return o.handles[h]; }).length, status;
        if (L === MARK_LAYER) status = 'settings';
        else if (!g) status = 'annotation';
        else if (typed && QUIET[typed]) status = 'ignored_by_choice';
        else if (hit.bodies > 0) status = (o.types.HATCH || used >= g) ? 'used' : 'partly_used';   // a layer with hatches cannot be matched by handle (dxf-parser has none): the layer-level answer is all that is known
        else if (typed && sh.role && sh.role !== 'plan' && (builtKinds[typed] || (typed in FEEDS && (FEEDS[typed] === null ? (els || []).length > 0 : FEEDS[typed].some(function (k) { return builtKinds[k]; }))))) status = 'evidence';
        else if (typed) status = 'typed_no_output';
        else status = 'unread';
        rows.push({ sheet: base(sh.name), layer: L, role: sh.role || null, entities: o.types, geometry: g, annotation: a, typed: typed, used_entities: used, bodies: hit.bodies, status: status });
      });
    });
    var totals = {}, flagged = [];
    rows.forEach(function (r) { var t = totals[r.status] || (totals[r.status] = { layers: 0, geometry: 0 }); t.layers++; t.geometry += r.geometry; if (r.status === 'unread' || r.status === 'typed_no_output' || r.status === 'partly_used') flagged.push(r); });
    return { rows: rows, totals: totals, flagged: flagged };
  }
  return { build: build, GEOM: GEOM };
});
