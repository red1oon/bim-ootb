// clipboard.js — the Modeller's ONE copy path (BIMCompiler prompts/MODELLER_CLIPBOARD_COPY_PASTE.md §REGROUND 2026-10-28; W-CLIPBOARD, W-CLIPBOARD-KEYS). Read the log after every run.
// A copied element is its GEOM_INSERT row PLUS every later op on it (what the fold applies: bonsai_kernel.js foldChainToScene, bonsai_library.js foldInsert,
// bonsai_kernel_worker.js), re-pointed at the copy and shifted rigidly; a copied host brings its fillings (SdgCascade.ridersFor) and its cuts, and the fills edges of the
// copied pairs are re-keyed to the copies. "Add a bay" (bay_add.js, §D89) calls build() too: one copy path. Pure core (no DOM / THREE) + page glue (Ctrl+C / Ctrl+V).
// Log tags: §CLIPBOARD.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Clipboard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAG = '§CLIPBOARD';
  // per-parent ops the copy carries (re-pointed); any OTHER op type naming a copied element refuses the copy (never a guess at what it means)
  var PER_PARENT = { GEOM_MOVE: 1, GEOM_ROTATE: 1, GEOM_SCALE: 1, GEOM_CUT: 1, GEOM_CUT_MOVE: 1, GEOM_CUT_RESIZE: 1, GEOM_FILLET: 1 };
  var DROP = ['bayCopy', 'spanSplit', '_gsg', 'copyOf'];   // grid-line tags of the source: a copy never re-inserts its source's grid line

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function P_(op) { return typeof op.parameters === 'string' ? JSON.parse(op.parameters) : (op.parameters || op.params || {}); }
  function add3(a, s) { return [a[0] + s[0], a[1] + s[1], a[2] + s[2]]; }

  // srcFids: the elements to copy; shift: [dx,dy,dz]; ops: the active geom ops up to the cursor ({id, op_type, parameters}); firstId: the id KernelOps will give the
  // first op of the gesture that carries these ops at its offset `opts.at` (default 0); cascade: { ridersFor, guidByFid, fidByGuid, fills } | null;
  // opts: { nonce, tag(params, srcFid) -> extra params, at }
  function build(srcFids, shift, ops, firstId, cascade, opts) {
    opts = opts || {}; shift = shift || [0, 0, 0];
    var out = { ok: false, why: null, ops: [], items: [], riders: [], cuts: 0, edges: [] }, at = opts.at || 0, nonce = opts.nonce || 'c';
    var ins = {}; ops.forEach(function (o) { if (o.op_type === 'GEOM_INSERT') ins[o.id] = o; });
    var set = {}, order = [];
    (srcFids || []).forEach(function (f) { var o = ins[f]; if (o && !P_(o).anchorOnly && !set[f]) { set[f] = 1; order.push(f); } });
    if (!order.length) { out.why = 'nothing to copy (no live element among ' + JSON.stringify((srcFids || []).slice(0, 5)) + ')'; return out; }
    var C = cascade && cascade.ridersFor && cascade.guidByFid && cascade.fidByGuid && Array.isArray(cascade.fills) ? cascade : null;
    if (C) C.ridersFor(order.slice(), C.guidByFid, C.fidByGuid, C.fills, new Set(order)).forEach(function (f) { if (ins[f] && !set[f] && !P_(ins[f]).anchorOnly) { set[f] = 1; order.push(f); out.riders.push(f); } });
    // pass 1: which source ops the copy carries, in op order (the fold is order-sensitive on the worker), and the id each will get
    var plan = [], refuse = null;
    ops.forEach(function (o) {
      if (refuse) return;
      var p = P_(o);
      if (o.op_type === 'GEOM_INSERT') { if (set[o.id]) plan.push({ src: o, kind: 'insert', el: o.id }); return; }
      if (o.op_type === 'GEOM_ROOM_MOVE') { (p.members || []).forEach(function (m) { if (m && set[m.featureId]) plan.push({ src: o, kind: 'room', el: m.featureId }); }); return; }
      if (o.op_type === 'GEOM_GRID_MOVE') { var cm = (p.commands || []).filter(function (c) { return c && set[c.featureId]; }); if (cm.length) plan.push({ src: o, kind: 'grid', cmds: cm }); return; }
      if (p.parent != null && set[p.parent]) { if (!PER_PARENT[o.op_type]) { refuse = 'element #' + p.parent + ' carries a ' + o.op_type + ' (op #' + o.id + ') the copy does not know how to carry'; return; } plan.push({ src: o, kind: 'parent', el: p.parent }); }
    });
    if (refuse) { out.why = refuse; return out; }
    var newId = {}, copyOf = {};   // newId[source op id] = the copy op's id; copyOf[source element fid] = the copy's fid
    plan.forEach(function (x, i) { if (x.kind === 'insert') copyOf[x.el] = firstId + at + i; else if (x.kind === 'parent') newId[x.src.id] = firstId + at + i; });
    var gOf = function (f) { return C && C.guidByFid[f] != null ? C.guidByFid[f] : null; }, guidOf = {};
    // pass 2: the ops
    plan.forEach(function (x, i) {
      var p = clone(P_(x.src));
      if (x.kind === 'insert') {
        DROP.forEach(function (k) { delete p[k]; });
        p.placement = Object.assign({}, p.placement); ['x', 'y', 'z'].forEach(function (a, k) { p.placement[a] = +(((p.placement[a] || 0) + shift[k]).toFixed(6)); });
        p.provenance = 'derived:user-edit'; p.copyOf = x.el; if (opts.tag) Object.assign(p, opts.tag(p, x.el) || {});
        var g = (gOf(x.el) || ('fid' + x.el)) + '~' + nonce + '.' + i; guidOf[copyOf[x.el]] = g;
        out.ops.push({ op_type: 'GEOM_INSERT', params: p, outputGuid: g });
        out.items.push({ from: x.el, cls: p.ifc_class || null, to: copyOf[x.el] });
      } else if (x.kind === 'room') {
        out.ops.push({ op_type: 'GEOM_MOVE', params: { parent: copyOf[x.el], dx: p.dx || 0, dy: p.dy || 0, dz: p.dz || 0, induced: 'copy-of-room-move' } });
      } else if (x.kind === 'grid') {   // the copy's own commands at the source op's place; gridId null: the grid fold (bonsai_grid.js foldFromOplog) moves no line for it
        out.ops.push({ op_type: 'GEOM_GRID_MOVE', params: { gridId: null, delta: 0, induced: 'copy-of-grid-move', commands: x.cmds.map(function (c) { return Object.assign(clone(c), { featureId: copyOf[c.featureId] }); }) } });
      } else {
        p.parent = copyOf[x.el];
        if (p.cutId != null) { if (newId[p.cutId] == null) { refuse = 'op #' + x.src.id + ' ' + x.src.op_type + ' names cut #' + p.cutId + ', which is not copied'; return; } p.cutId = newId[p.cutId]; }
        if (x.src.op_type === 'GEOM_CUT') {
          if (p.void && p.void.c1 && p.void.c2) p.void = { c1: add3(p.void.c1, shift), c2: add3(p.void.c2, shift) };
          if (p.slide && p.slide.fillingFid != null) p.slide = Object.assign({}, p.slide, { fillingFid: copyOf[p.slide.fillingFid] != null ? copyOf[p.slide.fillingFid] : null });
          out.cuts++;
        }
        out.ops.push({ op_type: x.src.op_type, params: p, outputGuid: x.src.op_type === 'GEOM_CUT' ? ((x.src.output_guid || ('cut' + x.src.id)) + '~' + nonce + '.' + i) : undefined });
        if (x.src.op_type === 'GEOM_CUT') guidOf['cut:' + x.src.id] = out.ops[out.ops.length - 1].outputGuid;
      }
    });
    if (refuse) { out.why = refuse; out.ops = []; return out; }
    // the fills edges of the copied pairs, re-keyed to the copies (published by the page after the commit)
    if (C) C.fills.forEach(function (e) {
      var h = C.fidByGuid[e.host_guid], f = C.fidByGuid[e.filling_guid];
      if (h == null || f == null || copyOf[h] == null || copyOf[f] == null) return;
      var cutSrc = ops.filter(function (o) { return o.op_type === 'GEOM_CUT' && P_(o).parent === h && (o.output_guid === e.opening_guid || (P_(o).slide && P_(o).slide.fillingFid === f)); })[0];
      out.edges.push(Object.assign({}, e, { a: guidOf[copyOf[f]], b: guidOf[copyOf[h]], host_guid: guidOf[copyOf[h]], filling_guid: guidOf[copyOf[f]],
        opening_guid: cutSrc ? (guidOf['cut:' + cutSrc.id] || null) : null, provenance: 'clipboard:copy-of ' + (e.provenance || '') }));
    });
    out.copyOf = copyOf; out.guidOf = guidOf; out.ok = true;
    return out;
  }

  return { build: build, TAG: TAG, PER_PARENT: PER_PARENT };
});
