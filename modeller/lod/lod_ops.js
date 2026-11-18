// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_ops.js: turns a pack's parts into Modeller op-log rows + element_parts rows + the change list (.txt). Read the §LODUP_* log after every run.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md §2 "Writes through the op-log" and §5 "Part centres" — Witness: W-LODUP-REBAR.
// Every part becomes ONE GEOM_INSERT op (the same realGeomHash + placement shape dxf2bim_import.js insert() writes) with provenance 'generated:<pack>' and params.parts_of = its hosts (aggregate children) or params.attached_to (parts that join elements, e.g. welds; no element_parts row).
// Each part's centre = its OWN bbox centre (not the host's: the Python film defect, spec §5). Pure; node + browser (window.LodOps).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodOps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function colorInt(rgba) { var p = String(rgba).split(',').map(parseFloat); return (Math.round(p[0] * 255) << 16) | (Math.round(p[1] * 255) << 8) | Math.round(p[2] * 255); }
  function build(parts, packId, meta) {
    var assets = [], ops = [], rows = [];
    parts.forEach(function (p) {
      var W = p.tris, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], i, a;
      for (i = 0; i < W.length; i += 3) for (a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; }
      var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];                 // the part's own bbox centre
      var v = new Float32Array(W.length), f = new Uint32Array(W.length / 3);
      for (i = 0; i < W.length; i += 3) { v[i] = W[i] - c[0]; v[i + 1] = W[i + 1] - c[1]; v[i + 2] = W[i + 2] - c[2]; }
      for (i = 0; i < f.length; i++) f[i] = i;
      var bbox = [lo[0] - c[0], hi[0] - c[0], lo[1] - c[1], hi[1] - c[1], lo[2] - c[2], hi[2] - c[2]], halfZ = (hi[2] - lo[2]) / 2, hash = 'lodup-' + p.guid;
      assets.push({ hash: hash, v: v, f: f, bbox: bbox, anchorOffset: [0, 0, 0], uncut: false });
      ops.push({ op_type: 'GEOM_INSERT', outputGuid: p.guid, params: { realGeomHash: hash, bbox: bbox, placement: { x: c[0], y: c[1], z: c[2] - halfZ, rot: 0 }, ifc_class: p.cls, storey: p.storey,
        provenance: 'generated:' + packId, color: colorInt(p.rgba), name: p.name, note: 'configuration only, capacity not checked' } });
      // a part is either an aggregate child (parts_of -> element_parts rows, the parent is hidden on reload) or attached to elements it joins (attached_to, no element_parts row: a weld must not hide its member)
      var P = ops[ops.length - 1].params; if (p.parents && p.parents.length) P.parts_of = p.parents.slice(); if (p.attach && p.attach.length) P.attached_to = p.attach.slice();
      (p.parents || []).forEach(function (h) { rows.push({ parent_guid: h, child_guid: p.guid, parent_class: meta && meta[h] ? meta[h].cls : null, child_class: p.cls }); });
    });
    return { assets: assets, ops: ops, elementParts: rows };
  }
  // the change list, written FROM the rows (one line per row: seq | change | element id | IFC class | host GlobalId | rule | detail)
  function changeText(changes, head) {
    var cnt = { ADDED: 0, NOT_BUILT: 0, REFUSED: 0 }; changes.forEach(function (c) { cnt[c.kind]++; });
    var L = [];
    L.push((head.model || 'model') + ' upgrade change list (' + head.pack + ')');
    L.push('Every line below is one row of the table upgrade_changes inside the model (same order). The source elements were not changed.');
    L.push('Rule rows: ' + head.rules.total + ', of which defaults (not stated by the drawings): ' + head.rules.default + ', stated: ' + head.rules.stated + (head.rules.unset ? ', unset: ' + head.rules.unset : ''));
    L.push('Totals: ADDED ' + cnt.ADDED + ' | NOT_BUILT ' + cnt.NOT_BUILT + ' | REFUSED ' + cnt.REFUSED);
    L.push('Generated steel parts: configuration only, capacity not checked');
    L.push('Columns: seq | change | element id | IFC class | host GlobalId | rule | detail');
    L.push('');
    changes.forEach(function (c, i) { L.push([i + 1, c.kind, c.guid, c.cls, c.host, c.rule, c.detail].join(' | ')); });
    return L.join('\n') + '\n';
  }
  return { build: build, changeText: changeText, colorInt: colorInt };
});
