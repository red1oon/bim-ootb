// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2account.js — entity accounting (prompts/DXF2BIM_MODELLER_LANE.md §L12). Pure, Node + browser.
// Every entity in the ENTITIES (model space) section of an ASCII DXF is either READ by the product or reported; nothing is dropped silently.
//   account(text, parsedEntities) -> { total, types: { TYPE: { raw, parsed, extra, dropped } }, dropped: [{type, n}], log }
// `raw` = entities of that type in the file, `parsed` = what dxf-parser returned, `extra` = read by a module of ours (HATCH by dxf2hatch, LEADER by parseLeaders).
// dropped = raw - parsed - extra when positive: those entities exist in the drawing and no code reads them (the parser's gap list).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Account = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // types a module of ours reads directly from the text (dxf-parser has no parser for them)
  var OWN = { HATCH: 'dxf2hatch.parseHatches', LEADER: 'dxf2hatch.parseLeaders' };
  function rawTypes(text) {
    var L = String(text).split(/\r?\n/), inEnt = false, c = {};
    for (var i = 0; i + 1 < L.length; i += 2) {
      var code = L[i].trim(), v = L[i + 1].trim();
      if (code === '0' && v === 'SECTION' && L[i + 3] && L[i + 2].trim() === '2') { inEnt = L[i + 3].trim() === 'ENTITIES'; continue; }
      if (code === '0' && v === 'ENDSEC') { inEnt = false; continue; }
      if (inEnt && code === '0') c[v] = (c[v] || 0) + 1;
    }
    return c;
  }
  function account(text, parsed, own) {
    var raw = rawTypes(text), got = {}, extra = own || {}, types = {}, dropped = [], total = 0;
    (parsed || []).forEach(function (e) { got[e.type] = (got[e.type] || 0) + 1; });
    Object.keys(raw).sort().forEach(function (t) {
      var r = raw[t], p = got[t] || 0, x = OWN[t] && extra[t] !== undefined ? extra[t] : 0, d = Math.max(0, r - p - x);
      types[t] = { raw: r, parsed: p, extra: x, reader: x ? OWN[t] : null, dropped: d }; total += r;
      if (d) dropped.push({ type: t, n: d });
    });
    return { total: total, types: types, dropped: dropped, log: '§ACCOUNT total=' + total + ' dropped=' + (dropped.map(function (q) { return q.type + ':' + q.n; }).join(',') || 'none') };
  }
  return { account: account, rawTypes: rawTypes, OWN: OWN };
});
