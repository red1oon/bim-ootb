// bay_add.js — §D89 ADD A BAY to a repeating-bay building (prompts/DXF2BIM_FOUNDATION_LANE.md §D89 / §D90, W-DXF-ADD-BAY). Read the log after every run.
// PURE planner (no DOM / THREE): the rule comes from the building type's own row (element_defaults.json building_types[<type>].edits.bay_repeat); the page
// (dxf_import_ui.js) supplies the op rows, every insert's measured world box and the grid, and commits the plan as ONE gesture (modeller.html Bonsai.commitBay).
// Nothing is invented: a copy is the source op's own parameters one pitch on; a stretch is (L + pitch) / L of a measured length; a bay is "typical" by its class counts.
// Log tags: §DXF-BAY.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BayAdd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAG = '§DXF-BAY', ON_LINE = 0.3;   // ON_LINE: an element whose centre is this close (m) to a grid line belongs to that line's frame (the §D88 bay probe's tolerance)

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function sig(counts) { return Object.keys(counts).sort().map(function (k) { return k + ':' + counts[k]; }).join(','); }

  // rows: [{ id, cls, params, box: [x0,y0,z0,x1,y1,z1] world }], grid: { xs, ys, xlabels, ylabels }, rule: edits.bay_repeat, end: 'max' | 'min'
  function plan(rows, grid, rule, end) {
    var out = { ok: false, why: null, ops: [], moved: [], copied: [], stretched: [], left: [] };
    if (!rule) { out.why = 'no bay_repeat rule for this building type'; return out; }
    var axis = rule.axis === 'grid-long' ? ((grid.xs || []).length >= (grid.ys || []).length ? 'x' : 'y') : rule.axis, k = axis === 'x' ? 0 : 1;
    var L = (axis === 'x' ? grid.xs : grid.ys).slice(), labs = (axis === 'x' ? grid.xlabels : grid.ylabels) || [];
    if (L.length < 3) { out.why = 'the grid has ' + L.length + ' lines on ' + axis + ' (needs 3 or more)'; return out; }
    var copyC = rule.copy || [], lineC = rule.line_copy || [], strC = rule.stretch || [];
    // classify every insert: on a line, in a bay, or spanning several bays
    var bays = L.slice(0, -1).map(function () { return { counts: {}, rows: [] }; }), lines = L.map(function () { return { rows: [] }; }), span = [];
    rows.forEach(function (r) {
      var a = r.box[k], b = r.box[k + 3], c = (a + b) / 2, len = b - a, li = -1, bi = -1;
      for (var i = 0; i < L.length; i++) if (Math.abs(c - L[i]) <= ON_LINE) { li = i; break; }
      var pitchHere = L[1] - L[0];
      if (len > 1.5 * pitchHere) { span.push(r); return; }
      if (li >= 0 && len < pitchHere / 2) { lines[li].rows.push(r); return; }
      for (var j = 0; j < L.length - 1; j++) if (c > L[j] && c < L[j + 1]) { bi = j; break; }
      if (bi < 0) { out.left.push({ id: r.id, cls: r.cls, why: 'outside the grid' }); return; }
      bays[bi].rows.push(r); bays[bi].counts[r.cls] = (bays[bi].counts[r.cls] || 0) + 1;
    });
    // the typical bay: the most common class signature; it must repeat min_identical times
    var by = {}; bays.forEach(function (B, i) { var s = sig(B.counts); (by[s] = by[s] || []).push(i); });
    var best = Object.keys(by).sort(function (p, q) { return by[q].length - by[p].length; })[0], typ = by[best] || [];
    out.signature = best; out.identical = typ.length; out.axis = axis;
    if (typ.length < (rule.min_identical || 3)) { out.why = 'only ' + typ.length + ' identical bays (the rule needs ' + (rule.min_identical || 3) + ')'; return out; }
    var bk = end === 'min' ? typ[0] : typ[typ.length - 1], pitch = L[bk + 1] - L[bk];
    if (typ.some(function (i) { return Math.abs((L[i + 1] - L[i]) - pitch) > 1e-6; })) { out.why = 'the identical bays do not share one pitch'; return out; }
    // insert after bay bk (end max) or before it (end min): the hinge line, the side that moves, the direction
    var hinge = end === 'min' ? bk : bk + 1, dir = end === 'min' ? -1 : 1, d = dir * pitch, X = L[hinge];
    var beyond = function (r) { var c = (r.box[k] + r.box[k + 3]) / 2; return dir > 0 ? c > X + ON_LINE : c < X - ON_LINE; };
    var badSpan = span.filter(function (r) { return strC.indexOf(r.cls) < 0 || Math.abs(((r.params.placement || {}).rot || 0) % 180) > 1e-6; });
    if (badSpan.length) { out.why = badSpan.length + ' full-length element(s) the rule does not stretch or that are yawed (first: #' + badSpan[0].id + ' ' + badSpan[0].cls + ')'; return out; }
    var id = 'bay-' + axis + hinge + '-' + Date.now().toString(36), mv = { dx: 0, dy: 0, dz: 0 }; mv['d' + axis] = d;
    var tag = { id: id, axis: axis, index: end === 'min' ? hinge : hinge + 1, pos: X + d, pitch: pitch, dir: dir, from: bk };
    // 1 move everything beyond the hinge
    rows.forEach(function (r) { if (span.indexOf(r) >= 0 || !beyond(r)) return; out.ops.push({ op_type: 'GEOM_MOVE', params: Object.assign({ parent: r.id, induced: 'bay-add' }, mv) }); out.moved.push(r.id); });
    // 2 copies: the typical bay's elements (copy classes) and the hinge line's frame (line_copy classes), one pitch on
    var put = function (r) { var p = clone(r.params); p.placement = Object.assign({}, p.placement); p.placement[axis] = +(((p.placement[axis] || 0) + d).toFixed(6));
      p.provenance = 'derived:user-edit'; p.bayCopy = Object.assign({ src: r.id }, tag); out.ops.push({ op_type: 'GEOM_INSERT', params: p }); out.copied.push({ from: r.id, cls: r.cls }); };
    bays[bk].rows.filter(function (r) { return copyC.indexOf(r.cls) >= 0; }).forEach(put);
    lines[hinge].rows.filter(function (r) { return lineC.indexOf(r.cls) >= 0; }).forEach(put);
    // 3 stretch the full-length members / coverings by one pitch (local axis = the longest of the op's own bbox; GEOM_SCALE is anchored at the local min edge)
    span.forEach(function (r) { var b = r.params.bbox, ld = [b[1] - b[0], b[3] - b[2], b[5] - b[4]], lk = ld.indexOf(Math.max.apply(null, ld)), Lm = ld[lk], f = (Lm + pitch) / Lm;
      var sp = { parent: r.id, fx: 1, fy: 1, fz: 1, induced: 'bay-add' }; sp['f' + 'xyz'[lk]] = +f.toFixed(9); out.ops.push({ op_type: 'GEOM_SCALE', params: sp });
      if (dir < 0) out.ops.push({ op_type: 'GEOM_MOVE', params: Object.assign({ parent: r.id, induced: 'bay-add' }, mv) });
      out.stretched.push({ id: r.id, cls: r.cls, length: Lm, factor: f }); });
    out.ok = true; out.tag = tag; out.pitch = pitch; out.hingeLabel = labs[hinge] || String(hinge);
    out.counts = out.copied.reduce(function (a, c) { a[c.cls] = (a[c.cls] || 0) + 1; return a; }, {});
    out.never = Object.keys(rule.never_copy || {}).map(function (c) { return { cls: c, why: rule.never_copy[c], inBay: bays[bk].counts[c] || 0 }; });
    return out;
  }

  // cost of a plan through the §S8 owner (viewer/edit_delta.js deltaFor): a copy = its own row amount (ADDED x1.0), a stretched element = deltaFor(rec, net) (CHANGED); a move = 0
  function cost(p, rows, ED, env, ctx) {
    var BD = env.BigDecimal, added = BD.of('0'), changed = BD.of('0'), byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
    var rec = function (r) { var b = r.params.bbox; return { guid: 'bay:' + r.id, cls: r.cls, name: null, dims: [b[1] - b[0], b[3] - b[2], b[5] - b[4]] }; };
    p.copied.forEach(function (c) { added = added.add(BD.of(ED.deltaFor(rec(byId[c.from]), null, ctx, env).costBefore)); });
    var net = ED.netEdits(p.ops.filter(function (o) { return o.op_type === 'GEOM_SCALE'; }).map(function (o) { return { op_type: o.op_type, parameters: o.params }; }));
    p.stretched.forEach(function (s) { changed = changed.add(BD.of(ED.deltaFor(rec(byId[s.id]), net.get(s.id), ctx, env).costDelta)); });
    return { added: added.toString(), changed: changed.toString(), total: added.add(changed).toString() };
  }

  return { plan: plan, cost: cost, TAG: TAG, ON_LINE: ON_LINE };
});
