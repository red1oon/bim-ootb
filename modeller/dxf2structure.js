// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2structure.js — the STRUCTURE-set judgement (lane §L7.12, extracted from dxf_import_ui.js, lane §L8): pure, no window, no UI state.
// A set that states a body kind (column, beam, ...) is a structure set: the wall/slab/roof pipeline is not run; roles are judged as in the standard gate, Dxf2Bodies builds the bodies,
// every GAP:body_* is ADVISORY (left out, never defaulted), mixed sets (a body kind AND a wall/slab/opening/roof layer) are refused with the reason.
//   isStructure(sheets)                       -> bool
//   judge(sheets, { I: Dxf2BimImport, B: Dxf2Bodies, choices }) -> { gate, defaults, log }   (gate = the importer's gate shape: ok, set:null, roles, refused, verdict, R, structure)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Structure = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BODY_KINDS = ['column', 'beam', 'footing', 'gradebeam', 'member', 'plate', 'panel'];
  var WALLISH = ['wall', 'wallline', 'slab', 'component', 'opening', 'glazing', 'elevwall', 'elevdoor', 'sectslab', 'sectwall', 'roof', 'levelline'];
  function isStructure(sheets, B) { return !!B && sheets.some(function (s) { return ((s.desc && s.desc.layers) || []).some(function (l) { return BODY_KINDS.indexOf(l.type) >= 0; }); }); }
  function judge(sheets, ctx) {
    var I = ctx.I, B = ctx.B, refused = [];
    sheets.filter(function (s) { return !s.role; }).forEach(function (s) { refused.push({ sheet: s.name, reason: s.why || 'no role' }); });
    if (sheets.some(function (s) { return ((s.desc && s.desc.layers) || []).some(function (l) { return WALLISH.indexOf(l.type) >= 0; }); }))
      refused.push({ sheet: '(set)', reason: 'mixed sets are not supported yet: body kinds and wall / slab / opening / roof layers are typed together' });
    var n = function (r) { return sheets.filter(function (s) { return s.role === r; }).length; };
    if (!n('plan')) refused.push({ sheet: '(set)', reason: 'no storey plan (@VIEW=PLAN + @LEVEL)' });
    if (!n('elev')) refused.push({ sheet: '(set)', reason: 'no elevation (@VIEW=ELEV + @FACE)' });
    var choices = ctx.choices || {};
    var res = refused.length ? { els: [], gaps: [], defaults: [], report: {} } : B.buildBodies(sheets, { prepChoices: choices });
    // §L11.2 wall panels from elevation hatch loops (a hatch layer typed `panel`): built alongside the plan/elevation bodies, same gaps/defaults channels
    var PN = ctx.PN || (typeof module === 'object' && module.exports ? require('./dxf2panels.js') : (typeof self !== 'undefined' ? self.Dxf2Panels : null));
    if (PN && !refused.length && sheets.some(function (s) { return ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'panel'; }); })) {
      var pn = PN.buildPanels(sheets, { numbers: ctx.numbers });
      res.els = res.els.concat(pn.els); res.gaps = res.gaps.concat(pn.gaps); res.defaults = (res.defaults || []).concat(pn.defaults); res.report = Object.assign({}, res.report, { panels: pn.report });
    }
    // §L13.2 best-effort completion (opt-in: ctx.complete = { slabT, roofT, overhang }): the floor slab and the gabled roof the drawings imply, derived + yellow defaults
    var SY = ctx.SY || (typeof module === 'object' && module.exports ? require('./dxf2synth.js') : (typeof self !== 'undefined' ? self.Dxf2Synth : null));
    if (SY && ctx.complete && !refused.length) {
      var sy = SY.complete(sheets, res.els, ctx.complete);
      res.els = res.els.concat(sy.els); res.gaps = res.gaps.concat(sy.gaps); res.defaults = (res.defaults || []).concat(sy.defaults);
    }
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var blocking = [], advisory = res.gaps.map(function (x) { return { code: x.code, sheet: x.sheet || '(set)', handles: x.handle ? [x.handle] : [], message: (x.kind ? x.kind + ': ' : '') + (x.detail || '') }; });
    if (!refused.length && !res.els.length && !advisory.some(function (a) { return a.code === 'GAP:body_elevation_not_aligned'; }))
      blocking.push({ code: 'QF:no_bodies', sheet: '(set)', handles: [], message: 'no body could be built: type the body layers on a plan AND an elevation' });
    advisory.filter(function (a) { return a.code === 'GAP:body_elevation_not_aligned'; }).forEach(function (a) { blocking.push(a); });
    var counts = { bodies: res.els.length, left_out: res.gaps.length }; res.gaps.forEach(function (x) { counts[x.code] = (counts[x.code] || 0) + 1; });
    var verdict = { verdict: blocking.length || refused.length ? 'blocked' : 'qualifies', blocking: blocking, advisory: advisory, counts: counts, by_shape: { walls: { blocking: 0, advisory: 0 }, slabs: { blocking: 0, advisory: 0 }, roof: { blocking: 0, advisory: 0 }, openings: { blocking: 0, advisory: 0 } } };   // by_shape: the editor's wall/slab/roof/opening table (a structure set reads none of them)
    var runId = I.sha256Hex(JSON.stringify({ structure: 1, sheets: sheets.map(function (s) { return s.sha; }), snap: res.report && res.report.snap_tol }));
    var R = { els: res.els, ST: plans.map(function (p) { return p.level; }).filter(function (l, i, arr) { return arr.indexOf(l) === i; }).sort(function (x, y) { return x - y; }).map(function (l, i) { return { name: 'Level ' + (i + 1), sheet: plans.filter(function (p) { return p.level === l; })[0].name, level: l, bridge: { voids: [] }, infill: [], fills: { gaps: [] } }; }),
      infillGuid: {}, libGeom: {}, run_id: runId, set: 'STRUCT', gaps: res.gaps, refused: null, fillGaps: [], bodies: res };
    var g = { ok: !refused.length && !blocking.length, set: null, setFrom: 'structure', roles: { ok: !refused.length, set: null, evidence: 'structure', refused: refused }, refused: refused,
      verdict: verdict, R: R, lib: null, structure: { bodies: res.els.length, left_out: res.gaps.length } };
    return { gate: g, defaults: res.defaults || [], log: 'gate STRUCTURE ok=' + g.ok + ' bodies=' + res.els.length + ' left_out=' + res.gaps.length + ' blocking=' + blocking.length + ' refused=' + JSON.stringify(refused).slice(0, 300) };
  }

  return { isStructure: isStructure, judge: judge, BODY_KINDS: BODY_KINDS, WALLISH: WALLISH };
});
