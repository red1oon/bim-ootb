// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-DXF-HOVER), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 2. DEV-ONLY: never loaded by a shipped page.
// ISSUE: a wrong body on the Modeller canvas could not be traced to the code that built it. Hover it: this shows the trace key, the file:line that built it,
//        its class and its DXF handle / layer / sheet; V opens that line in VS Code (vscode://file/<root>/<file>:<line>).
// WHAT:  loaded into an open Modeller tab by a bookmarklet from the localhost server (see the spec). Installs the trace map (globalThis.__DXF_TRACE) if absent, reads
//        devtools/hover/trace_index.json (node devtools/hover/gen_trace_index.js), listens to the page's own 'dagevu:hover' event. A body converted BEFORE this loaded
//        has no key: the tooltip says so (convert again), it never guesses a line. Changes nothing in the model or the page's code.
// F.23 (decision F-18, "the provenance hover"): the tooltip is a title line (class · fid · handle · layer · sheet · prov) then SIX numbered layers, in the order they
//        happened, each read from data the body / the op log already carries, never guessed: 1 BUILDER · 2 PASS-THROUGH · 3 SIZES (+ the default row) · 4 CUTS · 5 EDITS
//        (EditDelta.netEdits, the one owner of "which ops edit fid X") · 6 EVIDENCE. Every layer row is always shown ("none" when empty). Keys 1-6 open that layer's first
//        line (Alt+1-6 in a text field); V = the builder line. layersFor() is pure: the page and W-BIM-LAYERS (tests/witness_bim_layers.js) call the same function.
// LOG:   §DXF_HOVER installed index_keys=N defaults=M · §DXF_HOVER fid= guid= key= at= layers=b,p,s,c,e,v   Read the log after every run - exit code is not evidence.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CONVERT_AGAIN = 'no trace for this body: it was converted before the hover tool loaded; Convert again (the trace is on now)';
  var UNSTAMPED = 'no trace key: the code that built this body has no trace stamp (run modeller/tests/witness_dxf_trace.js, it lists such bodies)';

  // resolve(fid, ctx) -> what the tooltip says. ctx = { guidByFid, trace (Map guid->key), index {root, keys}, op(fid) -> the GEOM_INSERT parameters, els (gate R.els) }.
  //   Pure: the witness calls it in Node too. The op is the first source (it survives a reload); R.els only fills a class the op lacks.
  function resolve(fid, ctx) {
    if (fid == null) return null;
    var g = ctx.guidByFid && ctx.guidByFid[fid];
    if (!g) return { fid: fid, other: true, text: 'feature #' + fid + ': not a converted DXF body' };
    var guid = String(g).replace(/^dxf-/, ''), raw = ctx.trace && ctx.trace.get(guid), el = null, op = ctx.op ? ctx.op(fid) : null, pv = (op && op.provenance) || {};
    (ctx.els || []).some(function (e) { if (e.guid === guid) { el = e; return true; } return false; });
    var info = { fid: fid, guid: guid, cls: (op && op.ifc_class) || (el && el['class']), handle: pv.dxf_handle || (el && el.handle), layer: pv.layer || (el && el.layer), sheet: pv.sheet || (el && el.sheet), prov: pv.prov_kind || (el && el.prov) };
    if (!raw) { info.key = null; info.at = null; info.text = ctx.trace && ctx.trace.size ? UNSTAMPED : CONVERT_AGAIN; info.unstamped = !!(ctx.trace && ctx.trace.size); return info; }
    var key = String(raw).split(' > ')[0], at = ctx.index && ctx.index.keys ? ctx.index.keys[key] : null;
    info.key = key; info.at = at || null;
    info.link = at && ctx.index.root ? 'vscode://file' + (String(ctx.index.root).charAt(0) === '/' ? '' : '/') + ctx.index.root + '/' + at : null;   // vscode://file/<abs path>:<line>
    info.text = key + '  ·  ' + (at || 'line not in the index: run node devtools/hover/gen_trace_index.js');
    return info;
  }


  // ---- F.23 the six layers ------------------------------------------------------------------------------------------------------------------------------------------
  var LAYER_NAMES = ['BUILDER', 'PASS-THROUGH', 'SIZES', 'CUTS', 'EDITS', 'EVIDENCE'];
  function linkOf(index, at) { return at && index && index.root ? 'vscode://file' + (String(index.root).charAt(0) === '/' ? '' : '/') + index.root + '/' + at : null; }
  function num(v) { return typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v); }
  function opP(o) { return (o && (o.parameters || o.params)) || {}; }
  function sideItems(size) {   // a side is {number|value, source, ...} or a plain value with no source (measured: both shapes, both number keys)
    var out = [];
    Object.keys(size || {}).forEach(function (k) {
      var v = size[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.source != null) out.push({ side: k, number: v.number != null ? v.number : v.value, source: String(v.source), key: v.key || null, text: v.text || null, rule: v.rule || null });
      else out.push({ side: k, number: v, source: null });
    });
    return out;
  }
  function basisItems(basis) {   // the op's SizeBasis "x:label y:label" (the IFC props writer's copy; survives a reload)
    return String(basis || '').split(/\s+/).filter(Boolean).map(function (t) { var i = t.indexOf(':'); return { side: t.slice(0, i), number: undefined, source: t.slice(i + 1), key: null }; });
  }
  // layersFor(fid, ctx) -> { title, layers: [{n, name, items: [{text, at, link}]}], ... resolve()'s fields }. ctx = resolve()'s ctx + { ops: the op log BEFORE the cursor
  //   ([{id, op_type, parameters}]), netEdits: EditDelta.netEdits }. Pure.
  function layersFor(fid, ctx) {
    var info = resolve(fid, ctx); if (!info || info.other) return info;
    var ix = ctx.index || {}, op = ctx.op ? ctx.op(fid) : null, P = op || {}, pv = P.provenance || {}, props = (pv.ifc && pv.ifc.props) || {}, el = null;
    (ctx.els || []).some(function (e) { if (e.guid === info.guid) { el = e; return true; } return false; });
    var L = LAYER_NAMES.map(function (nm, i) { return { n: i + 1, name: nm, items: [] }; });
    function add(n, text, at) { L[n - 1].items.push({ text: text, at: at || null, link: linkOf(ix, at) }); }
    // 1 + 2: the trace chain (first key = the builder, later keys = pass-through stamps)
    var raw = ctx.trace && ctx.trace.get(info.guid), chain = raw ? String(raw).split(' > ') : [];
    if (chain.length) add(1, chain[0] + '  ' + (info.at || '(line not in the index)'), info.at); else add(1, info.text, null);
    chain.slice(1).forEach(function (k) { var at = ix.keys ? ix.keys[k] : null; add(2, k + '  ' + (at || '(line not in the index)'), at); });
    // 3: sizes and their source
    var sides = el && el.size ? sideItems(el.size) : basisItems(props.SizeBasis);
    sides.forEach(function (s) {
      var t = s.side + ' ' + (s.number === undefined ? '' : num(s.number) + '  ');
      if (s.source == null) { add(3, t + '(no source recorded)', null); return; }
      t += s.source + (s.text ? ' "' + s.text + '"' : '') + (s.rule ? ' rule ' + s.rule : '');
      if (/^default/.test(s.source)) {
        var dat = s.key && ix.defaults ? ix.defaults[s.key] : null;
        add(3, t + (s.key ? '  ' + s.key + (dat ? '  ' + dat : ' (not in the defaults index)') : '  (which default is not recorded on the body)'), dat);
      } else add(3, t, null);
    });
    if (el && el.height_source) add(3, 'height  ' + el.height_source, null);
    // 4: cuts (as host) and the opening it fills (as a fill); a cut's own moves / resizes
    var ops = ctx.ops || [], myCuts = {};
    ops.forEach(function (o, i) {
      if (o.op_type !== 'GEOM_CUT') return; var q = opP(o), sl = q.slide || {}, qp = q.provenance && typeof q.provenance === 'object' ? q.provenance : { kind: q.provenance };
      if (q.parent === fid) { myCuts[String(o.id)] = 1; add(4, '#' + (o.id != null ? o.id : i) + ' GEOM_CUT ' + (sl.opening || '-') + (qp.rule ? '  rule ' + qp.rule : '') + (sl.fillingFid != null ? '  holds #' + sl.fillingFid : ''), null); }
      if (sl.fillingFid === fid) add(4, 'fills the opening of #' + q.parent + ' (cut #' + (o.id != null ? o.id : i) + ' ' + (sl.opening || '-') + ')', null);
    });
    ops.forEach(function (o, i) {
      if (o.op_type !== 'GEOM_CUT_MOVE' && o.op_type !== 'GEOM_CUT_RESIZE') return; var q = opP(o);
      if (q.cutId != null && myCuts[String(q.cutId)]) add(4, '#' + (o.id != null ? o.id : i) + ' ' + o.op_type + ' of cut #' + q.cutId + '  ' + (o.op_type === 'GEOM_CUT_MOVE' ? 'd=' + [q.dx, q.dy, q.dz].map(function (v) { return num(v || 0); }).join(',') : 'f=' + [q.fx, q.fy, q.fz].map(function (v) { return num(v == null ? 1 : v); }).join(',')), null);
    });
    // 5: edits after Convert: the ONE owner of "which ops edit fid X" is EditDelta.netEdits (viewer/edit_delta.js), asked per op
    if (ctx.netEdits) ops.forEach(function (o, i) {
      var m = ctx.netEdits([o]); if (!m || !m.has(fid)) return; var q = opP(o), d;
      if (o.op_type === 'GEOM_MOVE') d = 'd=' + [q.dx, q.dy, q.dz].map(function (v) { return num(v || 0); }).join(',');
      else if (o.op_type === 'GEOM_SCALE') d = 'f=' + [q.fx, q.fy, q.fz].map(function (v) { return num(v == null ? 1 : v); }).join(',');
      else if (o.op_type === 'GEOM_GRID_MOVE') d = (q.commands || []).filter(function (c) { return c.featureId === fid; }).map(function (c) { return c.action + ' ' + c.axis + (c.delta != null ? ' ' + num(c.delta) : '') + (c.newScale != null ? ' x' + num(c.newScale) : ''); }).join('; ');
      else d = '';
      add(5, '#' + (o.id != null ? o.id : i) + ' ' + o.op_type + (d ? '  ' + d : ''), null);
    });
    // 6: the evidence the converter attached (data: no code line)
    add(6, 'handle ' + (info.handle || '-') + '  layer ' + (info.layer || '-') + '  sheet ' + (info.sheet || '-') + '  prov ' + (info.prov || '-') + (pv.run_id ? '  run ' + String(pv.run_id).slice(0, 8) : ''), null);
    Object.keys(props).sort().forEach(function (k) { if (/^(NoteSource|SchedSource)_/.test(k)) add(6, k.replace(/^(NoteSource|SchedSource)_/, '$1 ').replace('Source', '') + '  ' + props[k], null); });
    info.layers = L;
    info.title = (info.cls || '?') + '  #' + fid + '  handle ' + (info.handle || '-') + '  layer ' + (info.layer || '-') + '  sheet ' + (info.sheet || '-') + '  ' + (info.prov || '');
    info.counts = L.map(function (l) { return l.items.length; });
    return info;
  }
  function render(info) {   // the tooltip text: title, then every layer (always shown; "none" when empty)
    if (!info) return '';
    if (info.other) return info.text;
    if (!info.layers) return info.text;
    var out = [info.title];
    info.layers.forEach(function (l) {
      var hasLink = l.items.some(function (it) { return it.link; });
      out.push(l.n + ' ' + l.name + (hasLink ? '  [' + l.n + ']' : ''));
      if (!l.items.length) out.push('    none');
      l.items.forEach(function (it) { out.push('    ' + it.text); });
    });
    out.push('1-6 open a layer\'s line · V = builder');
    return out.join('\n');
  }
  function keyLink(info, n) { var l = info && info.layers && info.layers[n - 1]; if (!l) return null; for (var i = 0; i < l.items.length; i++) if (l.items[i].link) return l.items[i].link; return null; }

  function install(win) {
    if (win.__DXF_HOVER) return win.__DXF_HOVER;
    if (!(win.__DXF_TRACE instanceof win.Map)) win.__DXF_TRACE = new win.Map();
    var state = { index: null, cur: null, last: null }, doc = win.document;
    var tip = doc.createElement('div'); tip.id = 'dxf-hover-tip';
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none;max-width:520px;padding:6px 8px;border-radius:4px;' +
      'font:12px/1.4 ui-monospace,monospace;background:rgba(20,24,30,.92);color:#e8eef5;box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:pre-wrap';
    doc.body.appendChild(tip);
    var mx = 0, my = 0;
    // F.23 fix: the layered tooltip is tall; keep it inside the window (beside the cursor, flipped above / left of it near an edge). Film 3's first page run found it 6 px past the bottom.
    function place() {
      var W = win.innerWidth, Hh = win.innerHeight, w = tip.offsetWidth, h = tip.offsetHeight, x = mx + 14, y = my + 14;
      if (x + w > W - 4) x = Math.max(4, mx - 14 - w);
      if (y + h > Hh - 4) y = Math.max(4, Math.min(Hh - 4 - h, my - 14 - h));
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    win.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; if (tip.style.display !== 'none') place(); }, true);
    function ctx() {
      var U = win.DxfImportUI && win.DxfImportUI.state, R = U && U.gate && U.gate.R;
      var O = win.Bonsai && win.Bonsai.oplog && win.Bonsai.oplog._geomOps ? win.Bonsai.oplog._geomOps() : [], byId = {};
      O.forEach(function (o) { if (o.op_type === 'GEOM_INSERT') byId[o.id] = o.parameters; });
      var cur = win.Bonsai && win.Bonsai.oplog && typeof win.Bonsai.oplog.cursor === 'number' ? win.Bonsai.oplog.cursor : O.length;
      return { guidByFid: win.__arcGuidByFid || {}, trace: win.__DXF_TRACE, index: state.index, els: R && R.els, op: function (fid) { return byId[fid] || null; },
        ops: O.slice(0, cur), netEdits: win.EditDelta && win.EditDelta.netEdits };
    }
    function show(info) {
      state.cur = info;
      if (!info) { tip.style.display = 'none'; return; }
      tip.textContent = render(info); tip.dataset.key = info.key || ''; tip.dataset.at = info.at || ''; tip.dataset.link = info.link || ''; tip.dataset.counts = (info.counts || []).join(',');
      tip.style.display = 'block'; place();
      if (state.last !== info.fid) { state.last = info.fid; console.log('§DXF_HOVER fid=' + info.fid + ' guid=' + (info.guid || '-') + ' key=' + (info.key || '-') + ' at=' + (info.at || '-') + ' layers=' + (info.counts || []).join(',')); }
    }
    win.addEventListener('dagevu:hover', function (e) { show(layersFor(e && e.detail ? e.detail.fid : null, ctx())); });
    win.addEventListener('keydown', function (e) {
      var inText = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || ''), c = state.cur; if (!c) return;
      if ((e.key === 'v' || e.key === 'V') && !inText && c.link) { win.open(c.link); return; }
      var dm = /^Digit([1-6])$/.exec(e.code || ''), n = dm ? Number(dm[1]) : 0;
      if (n && (!inText || e.altKey)) { var L = keyLink(c, n); state.lastKey = { n: n, link: L }; if (L) { e.preventDefault(); win.open(L); } }
    });
    var api = { resolve: resolve, layersFor: layersFor, render: render, keyLink: keyLink, state: state, ready: null };
    api.ready = win.fetch('/devtools/hover/trace_index.json?' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ix) {
      state.index = ix;
      console.log('§DXF_HOVER installed index_keys=' + (ix && ix.keys ? Object.keys(ix.keys).length : 0) + ' defaults=' + (ix && ix.defaults ? Object.keys(ix.defaults).length : 0) + (ix ? '' : ' (no trace_index.json: run node devtools/hover/gen_trace_index.js)') + ' trace_map=on edit_delta=' + (win.EditDelta ? 'Y' : 'loading'));
      return ix;
    }).then(function (ix) {   // layer 5 asks EditDelta.netEdits (the one owner); a page without it gets it once from the same server (dev overlay only)
      if (win.EditDelta) return ix;
      return new Promise(function (z) { var sc = doc.createElement('script'); sc.src = '/viewer/edit_delta.js'; sc.onload = function () { console.log('§DXF_HOVER edit_delta=' + (win.EditDelta && win.EditDelta.netEdits ? 'Y' : 'N')); z(ix); }; sc.onerror = function () { console.log('§DXF_HOVER edit_delta=MISSING (layer 5 shows none)'); z(ix); }; doc.head.appendChild(sc); });
    });
    win.__DXF_HOVER = api;
    return api;
  }

  return { resolve: resolve, layersFor: layersFor, render: render, keyLink: keyLink, LAYER_NAMES: LAYER_NAMES, install: install, CONVERT_AGAIN: CONVERT_AGAIN, UNSTAMPED: UNSTAMPED };
});
