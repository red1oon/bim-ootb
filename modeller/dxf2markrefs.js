// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2markrefs.js — a type mark (B-1, GB-1, C-1 ...) checked as one across the set: where it is TAGGED (role sheets), where it is DETAILED (a notes sheet's "Long Section of"
// title or a schedule row) and how many BODIES carry it (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D102). Advisories only: it never builds or drops a body. Pure, Node + browser. Log §MARKREFS.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2MarkRefs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // sheets: readSheets output (role, name, dxf.entities); els: the bodies; o: { B (Dxf2Bodies: MARK_RE + cleanText, the one grammar), notesSheets: [names] }
  function build(sheets, els, o) {
    var B = o.B, RE = B.MARK_RE, clean = B.cleanText, by = {}, notes = o.notesSheets || [];
    var row = function (m) { return by[m] || (by[m] = { mark: m, tags: {}, nTags: 0, bodies: 0, details: [] }); };
    var texts = function (sh) { return ((sh.dxf && sh.dxf.entities) || []).filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== 'DXF2BIM-MARK'; }).map(function (e) { return clean(e.text || ''); }); };
    (sheets || []).filter(function (s) { return s.role; }).forEach(function (sh) { texts(sh).forEach(function (t) { if (!RE.test(t)) return; var r = row(t); r.tags[sh.name] = (r.tags[sh.name] || 0) + 1; r.nTags++; }); });
    (els || []).forEach(function (e) { var p = (e.ifc && e.ifc.props) || {}, ms = [e.mark].concat(Object.keys(p).filter(function (k) { return /^Sched_[A-Za-z]+_Type$/.test(k); }).map(function (k) { return p[k]; }));
      ms.filter(function (m, i) { return m && RE.test(m) && ms.indexOf(m) === i; }).forEach(function (m) { row(m).bodies++; });
      Object.keys(p).filter(function (k) { return /^Sched_[A-Za-z]+_Type$/.test(k); }).forEach(function (k) { var r = row(p[k]); var src = p['SchedSource_' + k.replace(/^Sched_|_Type$/g, '').toLowerCase()] || 'schedule';
        if (!r.details.some(function (d) { return d.via === 'schedule'; })) r.details.push({ title: 'schedule row ' + p[k], via: 'schedule', source: src }); }); });
    // a notes sheet's "Long Section of <name>": the mark itself, or its spelled-out form (Beam-1 -> B-1: first letter + number, a stated convention)
    (sheets || []).filter(function (s) { return notes.indexOf(s.name) >= 0; }).forEach(function (sh) { texts(sh).forEach(function (t) {
      var m = /long\s+section\s+of\s+([A-Za-z]+-\d+)/i.exec(t); if (!m) return;
      var name = m[1], mk = RE.test(name.toUpperCase()) && name === name.toUpperCase() ? name : name.charAt(0).toUpperCase() + '-' + name.split('-')[1], via = mk === name ? 'exact' : 'abbreviation';
      row(mk).details.push({ title: t.trim(), via: via, source: sh.name }); }); });
    var rows = Object.keys(by).sort().map(function (k) { return by[k]; }), adv = [];
    rows.forEach(function (r) {
      r.status = !r.bodies ? (r.nTags ? 'not_modelled' : 'detail_only') : !r.details.length ? 'no_detail' : 'modelled';   /* §D106: no body is never 'modelled'; detailed only (no tag) asks for nothing */
      var where = Object.keys(r.tags).map(function (s) { return s.replace(/(_marked)?\.dxf$/i, '') + ' x' + r.tags[s]; }).join(', ') || 'no tag';
      if (r.status === 'not_modelled') adv.push({ code: 'GAP:mark_not_modelled', sheet: '(set)', handles: [], message: 'mark ' + r.mark + ': tagged (' + where + ') but no body carries it' + (r.details.length ? '; detailed: ' + r.details.map(function (d) { return d.title; }).join('; ') : '; no detail either') + ' — nothing in the set is built for it' });
      if (!r.details.length) adv.push({ code: 'GAP:mark_no_detail', sheet: '(set)', handles: [], message: 'mark ' + r.mark + ' (' + where + ', ' + r.bodies + ' bodies): no long section and no schedule row states its section or bars' });
    });
    var n = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    return { rows: rows, advisories: adv, log: '§MARKREFS marks=' + rows.length + ' modelled=' + n('modelled') + ' not_modelled=' + n('not_modelled') + ' detail_only=' + n('detail_only') + ' no_detail=' + rows.filter(function (r) { return !r.details.length; }).length +
      ' ' + rows.map(function (r) { return r.mark + ':' + r.status + '(t' + r.nTags + ',b' + r.bodies + ',d' + r.details.length + (r.details.some(function (d) { return d.via === 'abbreviation'; }) ? ',abbr' : '') + ')'; }).join(' ') };
  }
  return { build: build };
});
