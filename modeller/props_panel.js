// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// props_panel.js — the Modeller's Properties panel (prompts/DXF2BIM_ARCHITECT_REVIEW.md U1, W-PROPS-PANEL). Read the log after every run.
// Select a part: see what the model knows about it. The content is the IFC writer's own element for that part (Dxf2Ifc.fromEls: class, name, ObjectType, PredefinedType, material
// and the Dxf2Bim_Evidence pset), so the panel shows what the IFC carries, by construction; nothing here reads a drawing or computes a value. The part -> body mapping is the convert's bridge
// (__arcGuidByFid: fid -> 'dxf-' + body guid). rowsFor / render are pure (Node + browser); the DOM half is one fixed panel driven by update(ids, primary). Log tag §PROPS.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PropsPanel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAG = '§PROPS';
  // the pset's keys, grouped by prefix in a fixed order; a key no group claims goes to Other (never dropped)
  var GROUPS = [
    { title: 'Source', test: function (k) { return /^(Provenance|Kind|SourceSheet|SourceHandle|SourceLayer|SourceGuid|SizeBasis)$/.test(k); } },
    { title: 'Size (m)', test: function (k) { return /^(Size_.+|Z0|Z1)$/.test(k); } },
    { title: 'Drawing notes', test: function (k) { return /^Note(Source)?_/.test(k); } },
    { title: 'Schedule', test: function (k) { return /^Sched(Source|Basis)?_/.test(k); } }
  ];
  var _cache = { els: null, by: null };
  // the writer's elements for the gate's bodies, keyed by body guid (recomputed only when the bodies array changes)
  function writerElements(els, Dxf2Ifc, ST) {
    if (_cache.els === els && _cache.by) return _cache.by;
    var W = Dxf2Ifc.fromEls(els, ST), by = {};
    els.forEach(function (e, i) { by[e.guid] = { el: e, w: W[i] }; });
    _cache.els = els; _cache.by = by; return by;
  }
  // ctx: { guidByFid (the bridge), R (the gate's run: els, ST), Dxf2Ifc, ifcClassOf(fid) (the op's class, for parts with no body) }
  function rowsFor(fid, ctx) {
    var g = ctx.guidByFid && ctx.guidByFid[fid], guid = g && /^dxf-/.test(g) ? g.slice(4) : null, R = ctx.R;
    var hit = guid && R && R.els && ctx.Dxf2Ifc ? writerElements(R.els, ctx.Dxf2Ifc, R.ST)[guid] : null;
    if (!hit && ctx.part) return buildingRows(fid, ctx.part, ctx.via);   // U7: an opened building's part — what its DB states
    if (!hit) {
      var cls = (ctx.ifcClassOf && ctx.ifcClassOf(fid)) || null;
      if (ctx.pending) return { fid: fid, guid: g || null, cls: cls, source: 'pending', head: [['IFC class', cls || 'not known'], ['GlobalId / guid', g || 'not known']], groups: [], note: 'reading the building\'s data…' };
      return { fid: fid, guid: g || null, cls: cls, source: 'other', head: [['IFC class', cls || 'not known'], ['GlobalId / guid', g || 'not known']],
        groups: [], note: 'no drawing evidence: this part was not converted from the 2D set' };
    }
    var w = hit.w, p = w.props || {}, keys = ctx.Dxf2Ifc.written(p), used = {}, groups = [];   /* the names the file carries (the writer's own filter) */
    GROUPS.forEach(function (G) {
      var rows = keys.filter(function (k) { return !used[k] && G.test(k); });
      if (G.title === 'Drawing notes') {   // each note beside its source: Note_X then NoteSource_X
        var notes = rows.filter(function (k) { return /^Note_/.test(k); }), out = [];
        notes.forEach(function (k) { out.push(k); var s = 'NoteSource_' + k.slice(5); if (rows.indexOf(s) >= 0) out.push(s); });
        rows.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); }); rows = out;
      }
      rows.forEach(function (k) { used[k] = 1; });
      if (rows.length) groups.push({ title: G.title, rows: rows.map(function (k) { return [k, String(p[k])]; }) });
    });
    var rest = keys.filter(function (k) { return !used[k]; });
    if (rest.length) groups.push({ title: 'Other', rows: rest.map(function (k) { return [k, String(p[k])]; }) });
    return { fid: fid, guid: guid, cls: w['class'], source: 'drawing',
      head: [['IFC class', w['class']], ['Name', w.name], ['ObjectType (label)', w.objectType || '—'], ['PredefinedType', w.predefined || '—'], ['Material', w.material || '—']],
      groups: groups, pset: 'Dxf2Bim_Evidence' };
  }
  // U7: a part of an opened building, from the building's DB (OpenBuildingDb.partOf): elements_meta + element_type head, one group per Pset_*Common set (occurrence / type stated)
  function buildingRows(fid, P, via) {
    var m = P.meta, head = [['IFC class', m.ifc_class], ['Name', m.element_name || '—'], ['Storey', m.storey || '—'], ['Material', m.material_name || '—']];
    if (P.type) head.push(['Type', P.type.type_name || '—']);
    head.push(['GlobalId', P.guid]);
    var groups = [], by = {};
    (P.psets || []).forEach(function (r) { var k = r.pset; if (!by[k]) { by[k] = { title: k, rows: [], src: {} }; groups.push(by[k]); } by[k].rows.push([r.name, String(r.value)]); by[k].src[r.source || 'occurrence'] = 1; });
    groups.forEach(function (G) { G.title = G.title + ' (' + Object.keys(G.src).sort().join(' + ') + ')'; delete G.src; });
    var note = P.psets === null ? 'this building\'s database stores no property sets' : !P.psets.length ? 'its IFC states no Pset_*Common set for this part' : null;
    return { fid: fid, guid: P.guid, cls: m.ifc_class, source: via === 'ifc-extract' ? 'ifc-extract' : 'building', head: head, groups: groups, note: note,
      intro: via === 'ifc-extract' ? 'Its standard property sets, read from the opened IFC by the shared extractor:' : 'Its standard property sets, from the building\'s database:' };
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render(m, nSel) {
    var row = function (r) { return '<div class="pp-r" data-pp-key="' + esc(r[0]) + '"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; };
    var h = '<div class="pp-h"><span>PROPERTIES' + (nSel > 1 ? ' · ' + nSel + ' selected, the last one shown' : '') + '</span><button id="pp-close" title="Close until the selection changes">×</button></div>';
    h += m.head.map(row).join('');
    if (m.source === 'other' || m.source === 'pending') return h + '<div class="pp-n" data-pp-note>' + esc(m.note) + '</div>';
    if (m.intro) { h += '<div class="pp-n" data-pp-source="' + esc(m.source) + '">' + esc(m.intro) + '</div>'; if (m.note) h += '<div class="pp-n" data-pp-note>' + esc(m.note) + '</div>'; }
    else h += '<div class="pp-n">What its IFC carries (property set ' + esc(m.pset) + '):</div>';
    m.groups.forEach(function (G) { h += '<div class="pp-g" data-pp-group="' + esc(G.title) + '">' + esc(G.title) + '</div>' + G.rows.map(row).join(''); });
    return h;
  }
  function logLine(m) { return TAG + ' fid=' + m.fid + ' guid=' + m.guid + ' source=' + m.source + ' groups=' + m.groups.length + ' rows=' + m.groups.reduce(function (n, G) { return n + G.rows.length; }, 0); }

  // ---- browser only below ----
  var panel = null, closedFor = null;
  function ensure() {
    if (panel) return panel;
    var st = document.createElement('style');
    st.textContent = '#pp-panel{position:fixed;top:60px;right:70px;width:300px;max-height:calc(100vh - 190px);overflow:auto;z-index:30;background:#1b1d23;border:1px solid #2c303a;border-radius:10px;' +
      'color:#c7cdd8;font:12px system-ui,sans-serif;padding:8px 10px;box-shadow:0 8px 30px rgba(0,0,0,.45);display:none}' +
      '#pp-panel .pp-h{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.14em;color:#5b6473;margin-bottom:6px}' +
      '#pp-panel .pp-h button{background:none;border:0;color:#8a93a0;font-size:16px;cursor:pointer;padding:0 2px}' +
      '#pp-panel .pp-r{display:flex;gap:8px;justify-content:space-between;padding:2px 0;border-bottom:1px solid #23262e}#pp-panel .pp-r span{color:#8a93a0;flex:0 0 auto;max-width:48%;overflow-wrap:anywhere}' +
      '#pp-panel .pp-r b{font-weight:500;color:#e6e9ef;text-align:right;overflow-wrap:anywhere}#pp-panel .pp-g{margin:8px 0 2px;color:#9fb4c8;font-size:11px}#pp-panel .pp-n{margin:8px 0 2px;color:#8a93a0}';
    document.head.appendChild(st);
    panel = document.createElement('div'); panel.id = 'pp-panel'; document.body.appendChild(panel); return panel;
  }
  // U1 (runner find: W-SHED-WALL-EDIT E1a could not click #b-move): the panel never covers a toolbar control or a left-side panel. It sits left of the right-hand rail (right: 70px,
  // the side panels' convention), below every visible #bar control in its column, and narrows (to 220 px) so it clears the outliner / 2D / meta-editor panels; with less room than that (a 1024 px screen with the meta editor open) it opens on top of them.
  function visible(b) { var cs = getComputedStyle(b); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.getClientRects().length > 0; }   /* offsetParent is null for fixed controls */
  function place(P) {
    var W = window.innerWidth, H = window.innerHeight, leftLim = 0;
    ['bonsai-outliner', 'dxf-panel', 'dm-panel', 'ins-panel'].forEach(function (id) { var e = document.getElementById(id); if (e && visible(e)) { var q = e.getBoundingClientRect(); if (q.top < H / 2) leftLim = Math.max(leftLim, Math.ceil(q.right) + 8); } });
    var room = W - 70 - leftLim, width = Math.max(220, Math.min(300, room)); P.style.width = width + 'px';
    P.style.zIndex = room < 220 ? '32' : '30'; P.setAttribute('data-pp-overlay', room < 220 ? '1' : '0');   /* no room beside the open panels: on top of them (x closes it), still clear of the toolbar */
    var x0 = W - 70 - width, x1 = W - 70, top = 60;
    Array.prototype.forEach.call(document.querySelectorAll('#bar button, #bar input, #bar select, #bar label'), function (b) {
      if (!visible(b)) return; var q = b.getBoundingClientRect(); if (!q.width || !q.height) return;
      if (q.right > x0 && q.left < x1 && q.top < H / 2) top = Math.max(top, Math.ceil(q.bottom) + 8); });
    P.style.top = top + 'px'; P.style.maxHeight = 'calc(100vh - ' + (top + 130) + 'px)';
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', function () { if (panel && panel.style.display === 'block') place(panel); });
  // ids: the selection; primary: the part shown. Called by the Modeller's setSelectionIds (its one owner of the selection).
  function update(ids, primary, ctx) {
    var P = ensure(), key = (ids || []).join(',') + '|' + primary;
    if (primary == null) { P.style.display = 'none'; closedFor = null; return null; }
    if (closedFor === key) return null;
    closedFor = null;
    var m = rowsFor(primary, ctx);
    P.innerHTML = render(m, (ids || []).length); P.style.display = 'block'; place(P);
    P.querySelector('#pp-close').onclick = function () { closedFor = key; P.style.display = 'none'; console.log(TAG + ' closed fid=' + primary); };
    console.log(logLine(m));
    return m;
  }
  return { rowsFor: rowsFor, buildingRows: buildingRows, render: render, update: update, logLine: logLine, GROUPS: GROUPS };
});
