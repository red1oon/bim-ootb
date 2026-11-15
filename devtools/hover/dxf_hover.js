// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-DXF-HOVER), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 2. DEV-ONLY: never loaded by a shipped page.
// ISSUE: a wrong body on the Modeller canvas could not be traced to the code that built it. Hover it: this shows the trace key, the file:line that built it,
//        its class and its DXF handle / layer / sheet; V opens that line in VS Code (vscode://file/<root>/<file>:<line>).
// WHAT:  loaded into an open Modeller tab by a bookmarklet from the localhost server (see the spec). Installs the trace map (globalThis.__DXF_TRACE) if absent, reads
//        devtools/hover/trace_index.json (node devtools/hover/gen_trace_index.js), listens to the page's own 'dagevu:hover' event. A body converted BEFORE this loaded
//        has no key: the tooltip says so (convert again), it never guesses a line. Changes nothing in the model or the page's code.
// LOG:   §DXF_HOVER installed index_keys=N · §DXF_HOVER fid= guid= key= at=   Read the log after every run - exit code is not evidence.
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

  function install(win) {
    if (win.__DXF_HOVER) return win.__DXF_HOVER;
    if (!(win.__DXF_TRACE instanceof win.Map)) win.__DXF_TRACE = new win.Map();
    var state = { index: null, cur: null, last: null }, doc = win.document;
    var tip = doc.createElement('div'); tip.id = 'dxf-hover-tip';
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none;max-width:520px;padding:6px 8px;border-radius:4px;' +
      'font:12px/1.4 ui-monospace,monospace;background:rgba(20,24,30,.92);color:#e8eef5;box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:pre-wrap';
    doc.body.appendChild(tip);
    var mx = 0, my = 0;
    win.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; if (tip.style.display !== 'none') { tip.style.left = (mx + 14) + 'px'; tip.style.top = (my + 14) + 'px'; } }, true);
    function ctx() {
      var U = win.DxfImportUI && win.DxfImportUI.state, R = U && U.gate && U.gate.R;
      var O = win.Bonsai && win.Bonsai.oplog && win.Bonsai.oplog._geomOps ? win.Bonsai.oplog._geomOps() : [], byId = {};
      O.forEach(function (o) { if (o.op_type === 'GEOM_INSERT') byId[o.id] = o.parameters; });
      return { guidByFid: win.__arcGuidByFid || {}, trace: win.__DXF_TRACE, index: state.index, els: R && R.els, op: function (fid) { return byId[fid] || null; } };
    }
    function show(info) {
      state.cur = info;
      if (!info) { tip.style.display = 'none'; return; }
      var lines = [info.text];
      if (!info.other) lines.push((info.cls || '?') + '  handle ' + (info.handle || '-') + '  layer ' + (info.layer || '-') + '  sheet ' + (info.sheet || '-') + '  ' + (info.prov || ''));
      if (info.link) lines.push('V = open in VS Code');
      tip.textContent = lines.join('\n'); tip.dataset.key = info.key || ''; tip.dataset.at = info.at || ''; tip.dataset.link = info.link || '';
      tip.style.left = (mx + 14) + 'px'; tip.style.top = (my + 14) + 'px'; tip.style.display = 'block';
      if (state.last !== info.fid) { state.last = info.fid; console.log('§DXF_HOVER fid=' + info.fid + ' guid=' + (info.guid || '-') + ' key=' + (info.key || '-') + ' at=' + (info.at || '-')); }
    }
    win.addEventListener('dagevu:hover', function (e) { show(resolve(e && e.detail ? e.detail.fid : null, ctx())); });
    win.addEventListener('keydown', function (e) { if ((e.key === 'v' || e.key === 'V') && state.cur && state.cur.link && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) win.open(state.cur.link); });
    var api = { resolve: resolve, state: state, ready: null };
    api.ready = win.fetch('/devtools/hover/trace_index.json?' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ix) {
      state.index = ix;
      console.log('§DXF_HOVER installed index_keys=' + (ix && ix.keys ? Object.keys(ix.keys).length : 0) + (ix ? '' : ' (no trace_index.json: run node devtools/hover/gen_trace_index.js)') + ' trace_map=on');
      return ix;
    });
    win.__DXF_HOVER = api;
    return api;
  }

  return { resolve: resolve, install: install, CONVERT_AGAIN: CONVERT_AGAIN, UNSTAMPED: UNSTAMPED };
});
