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

  function sig(counts) { return Object.keys(counts).sort().map(function (k) { return k + ':' + counts[k]; }).join(','); }

  // rows: [{ id, cls, params, box: [x0,y0,z0,x1,y1,z1] world }], grid: { xs, ys, xlabels, ylabels }, rule: edits.bay_repeat, end: 'max' | 'min'
  // cascade (optional): { ridersFor, guidByFid, fidByGuid, fills } = SdgCascade.ridersFor + the §ARC-1 bridge + swXEdges.fills (§D89 step 3: a filling rides its host, never moves on its own)
  // copier: { build: Clipboard.build, ops: the active geom ops, firstId: the id the gesture's first op will get } — the Modeller's ONE copy path (clipboard.js, §D89 step 4)
  function plan(rows, grid, rule, end, cascade, copier) {
    var out = { ok: false, why: null, ops: [], moved: [], riders: [], copied: [], stretched: [], left: [] };
    if (!rule) { out.why = 'no bay_repeat rule for this building type'; return out; }
    var axis = rule.axis === 'grid-long' ? ((grid.xs || []).length >= (grid.ys || []).length ? 'x' : 'y') : rule.axis, k = axis === 'x' ? 0 : 1;
    var L = (axis === 'x' ? grid.xs : grid.ys).slice(), labs = (axis === 'x' ? grid.xlabels : grid.ylabels) || [];
    if (L.length < 3) { out.why = 'the grid has ' + L.length + ' lines on ' + axis + ' (needs 3 or more)'; return out; }
    var strC = rule.stretch || [], never = rule.never_copy || {};
    if (!copier || !copier.build) { out.why = 'no copy path (clipboard.js not loaded)'; return out; }
    // an element's CURRENT local size = its insert bbox x the product of the GEOM_SCALEs already on it (the fold multiplies them, bonsai_kernel.js foldChainToScene)
    var netF = function (fid) { var f3 = [1, 1, 1]; (copier.ops || []).forEach(function (o) { var q = o.parameters || {}; if (o.op_type === 'GEOM_SCALE' && q.parent === fid) { f3[0] *= q.fx != null ? q.fx : 1; f3[1] *= q.fy != null ? q.fy : 1; f3[2] *= q.fz != null ? q.fz : 1; } }); return f3; };
    var dimsOf = function (r) { var b = r.params.bbox, n3 = netF(r.id); return [(b[1] - b[0]) * n3[0], (b[3] - b[2]) * n3[1], (b[5] - b[4]) * n3[2]]; };
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
    // fillings (a fills edge names the row as filling_guid, its host is a row): hostOf[filling fid] = host fid
    var C = cascade && cascade.ridersFor && cascade.guidByFid && cascade.fidByGuid && Array.isArray(cascade.fills) ? cascade : null, hostOf = {}, isRow = {};
    rows.forEach(function (r) { isRow[r.id] = 1; });
    if (C) C.fills.forEach(function (e) { var f = C.fidByGuid[e.filling_guid], h = C.fidByGuid[e.host_guid]; if (f != null && h != null && isRow[f] && isRow[h] && hostOf[f] == null) hostOf[f] = h; });
    var onSpan = Object.keys(hostOf).filter(function (f) { return span.some(function (r) { return r.id === hostOf[f]; }); });
    if (onSpan.length) { out.why = onSpan.length + ' filling(s) hosted by a full-length element that the bay stretches (first: #' + onSpan[0] + ' in #' + hostOf[onSpan[0]] + '): a stretch rides proportionally, not one pitch on'; return out; }
    var id = 'bay-' + axis + hinge + '-' + Date.now().toString(36), mv = { dx: 0, dy: 0, dz: 0 }; mv['d' + axis] = d;
    var tag = { id: id, axis: axis, index: end === 'min' ? hinge : hinge + 1, pos: X + d, pitch: pitch, dir: dir, from: bk };
    // 1 move the hosts + free elements beyond the hinge; their fillings ride as hosted-by (SdgCascade.ridersFor, as commitMove does); a filling never moves on its own
    rows.forEach(function (r) { if (span.indexOf(r) >= 0 || !beyond(r) || hostOf[r.id] != null) return; out.ops.push({ op_type: 'GEOM_MOVE', params: Object.assign({ parent: r.id, induced: 'bay-add' }, mv) }); out.moved.push(r.id); });
    if (C && out.moved.length) C.ridersFor(out.moved, C.guidByFid, C.fidByGuid, C.fills, new Set(out.moved)).forEach(function (f) { out.ops.push({ op_type: 'GEOM_MOVE', params: Object.assign({ parent: f, induced: 'hosted-by' }, mv) }); out.riders.push(f); });
    // 2 copies: the typical bay and the hinge line's frame AS THEY ARE, one pitch on, through the clipboard (each copy carries its source's later edits, cuts and hosted fillings,
    //   §D89 step 4); never_copy = building-wide sizing only; fillings are not handed in — they come as riders of their copied host
    var src = bays[bk].rows.concat(lines[hinge].rows).filter(function (r) { return !never[r.cls] && hostOf[r.id] == null; }).map(function (r) { return r.id; });
    var sh = [0, 0, 0]; sh[k] = d;
    var cp = copier.build(src, sh, copier.ops, copier.firstId, C, { at: out.ops.length, nonce: id, tag: function (p, f) { return { bayCopy: Object.assign({ src: f }, tag) }; } });
    if (!cp.ok) { out.why = 'the bay copy refused: ' + cp.why; out.ops = []; out.moved = []; out.riders = []; return out; }
    cp.ops.forEach(function (o) { out.ops.push(o); }); var rowOf = {}; rows.forEach(function (r) { rowOf[r.id] = r; });
    cp.items.forEach(function (it) { out.copied.push({ from: it.from, cls: it.cls, to: it.to, dims: rowOf[it.from] ? dimsOf(rowOf[it.from]) : null }); });
    out.copy = { edges: cp.edges, guidOf: cp.guidOf, copyOf: cp.copyOf, riders: cp.riders, cuts: cp.cuts, firstId: copier.firstId };
    // 3 stretch the full-length members / coverings by one pitch (local axis = the longest of the op's CURRENT local size = its bbox x the product of the GEOM_SCALEs already on it,
    //   as the fold multiplies them; GEOM_SCALE is anchored at the local min edge). Before: the insert's own bbox, so a second bay over-stretched what the first had stretched.
    span.forEach(function (r) { var ld = dimsOf(r), lk = ld.indexOf(Math.max.apply(null, ld)), Lm = ld[lk], f = (Lm + pitch) / Lm;
      var sp = { parent: r.id, fx: 1, fy: 1, fz: 1, induced: 'bay-add' }; sp['f' + 'xyz'[lk]] = +f.toFixed(9); out.ops.push({ op_type: 'GEOM_SCALE', params: sp });
      if (dir < 0) out.ops.push({ op_type: 'GEOM_MOVE', params: Object.assign({ parent: r.id, induced: 'bay-add' }, mv) });
      out.stretched.push({ id: r.id, cls: r.cls, length: Lm, factor: f, dims: ld }); });
    out.ok = true; out.tag = tag; out.pitch = pitch; out.hingeLabel = labs[hinge] || String(hinge);
    out.counts = out.copied.reduce(function (a, c) { a[c.cls] = (a[c.cls] || 0) + 1; return a; }, {});
    out.never = Object.keys(never).map(function (c) { return { cls: c, why: never[c], inBay: bays[bk].counts[c] || 0 }; });
    return out;
  }

  // cost of a plan through the §S8 owner (viewer/edit_delta.js deltaFor): a copy = its own row amount (ADDED x1.0), a stretched element = deltaFor(rec, net) (CHANGED); a move = 0
  function cost(p, rows, ED, env, ctx) {
    var BD = env.BigDecimal, added = BD.of('0'), changed = BD.of('0'), byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
    var rec = function (r) { var b = r.params.bbox; return { guid: 'bay:' + r.id, cls: r.cls, name: null, dims: [b[1] - b[0], b[3] - b[2], b[5] - b[4]] }; };
    // §D92 the lines the total is the sum of: one per (added | changed, class): count, unit, quantity (added: the copies' own; changed: after - before), rate, amount
    var L = {}, line = function (kind, d, q, amt) { var k = kind + '|' + d.cls, x = L[k] || (L[k] = { kind: kind, cls: d.cls, n: 0, unit: d.unit, qty: 0, rate: d.rate, amount: BD.of('0') });
      x.n++; x.qty += q; x.amount = x.amount.add(BD.of(amt)); };
    p.copied.forEach(function (c) { var r0 = rec(byId[c.from]); if (c.dims) r0.dims = c.dims; var d = ED.deltaFor(r0, null, ctx, env); added = added.add(BD.of(d.costBefore)); line('added', d, d.qtyBefore, d.costBefore); });   // a copy is priced at its source's CURRENT size
    var net = ED.netEdits(p.ops.filter(function (o) { return o.op_type === 'GEOM_SCALE'; }).map(function (o) { return { op_type: o.op_type, parameters: o.params }; }));
    p.stretched.forEach(function (s) { var r0 = rec(byId[s.id]); if (s.dims) r0.dims = s.dims; var d = ED.deltaFor(r0, net.get(s.id), ctx, env); changed = changed.add(BD.of(d.costDelta)); line('changed', d, d.qtyAfter - d.qtyBefore, d.costDelta); });   // priced on the CURRENT size
    var lines = Object.keys(L).sort().map(function (k) { var x = L[k]; return { kind: x.kind, cls: x.cls, n: x.n, unit: x.unit, qty: +x.qty.toFixed(3), rate: x.rate, amount: x.amount.toString() }; });
    return { added: added.toString(), changed: changed.toString(), total: added.add(changed).toString(), lines: lines };
  }

  return { plan: plan, cost: cost, TAG: TAG, ON_LINE: ON_LINE };
});
