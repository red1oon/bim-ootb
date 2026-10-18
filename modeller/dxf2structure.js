// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2structure.js — the STRUCTURE-set judgement (lane §L7.12, extracted from dxf_import_ui.js, lane §L8): pure, no window, no UI state.
// A set that states a body kind (column, beam, ...) is a structure set: the wall/slab/roof pipeline is not run; roles are judged as in the standard gate, Dxf2Bodies builds the bodies,
// every GAP:body_* is ADVISORY (left out, never defaulted), mixed sets (a body kind AND a wall/slab/opening/roof layer) are refused with the reason.
//   isStructure(sheets)                       -> bool
//   judge(sheets, { I: Dxf2BimImport, B: Dxf2Bodies, choices }) -> { gate, defaults, log }   (gate = the importer's gate shape: ok, set:null, roles, refused, verdict, R, structure)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2prep.js'));
  else root.Dxf2Structure = factory(root.Dxf2Prep);
})(typeof self !== 'undefined' ? self : this, function (PREP) {
  'use strict';
  var BODY_KINDS = PREP.BODY_KINDS;   // §L24 one table (dxf2prep)
  var WALLISH = ['wall', 'wallline', 'slab', 'component', 'opening', 'glazing', 'elevwall', 'sectslab', 'sectwall', 'roof', 'levelline'];
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
    // §L18 the element-defaults registry: the drawing's @DEFAULT markings > the editor's choices > element_defaults.json; modules call DF.use(key) when they APPLY a default; the yellow rows come from DF
    var DFM = ctx.DFM || (typeof module === 'object' && module.exports ? require('./dxf2defaults.js') : (typeof self !== 'undefined' ? self.Dxf2Defaults : null)), DF = DFM ? DFM.create(ctx.defaultsRef || null, sheets, choices) : null;
    if (DF && DF.has('building.type')) DF.use('building.type');   // the building type is always a visible setting (yellow until stated)
    // §L11.2 wall panels from elevation hatch loops (a hatch layer typed `panel`): built alongside the plan/elevation bodies, same gaps/defaults channels
    var PN = ctx.PN || (typeof module === 'object' && module.exports ? require('./dxf2panels.js') : (typeof self !== 'undefined' ? self.Dxf2Panels : null));
    if (PN && !refused.length && sheets.some(function (s) { return ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'panel' || l.type === 'fan' || l.type === 'net'; }); })) {
      var pn = PN.buildPanels(sheets, { numbers: ctx.numbers, DF: DF });
      res.els = res.els.concat(pn.els); res.gaps = res.gaps.concat(pn.gaps); res.defaults = (res.defaults || []).concat(pn.defaults); res.report = Object.assign({}, res.report, { panels: pn.report });
    }
    // §L16 door leaves from plan swing symbols (a plan layer typed `doorswing`), after the other bodies (the floor level comes from the drawn columns)
    var DR = ctx.DR || (typeof module === 'object' && module.exports ? require('./dxf2doors.js') : (typeof self !== 'undefined' ? self.Dxf2Doors : null));
    if (DR && !refused.length && sheets.some(function (s) { return s.role === 'plan' && ((s.desc && s.desc.layers) || []).some(function (l) { return l.type === 'doorswing'; }); })) {
      var dr = DR.buildDoors(sheets, res.els, { numbers: ctx.numbers, DF: DF });
      res.els = res.els.concat(dr.els); res.gaps = res.gaps.concat(dr.gaps); res.defaults = (res.defaults || []).concat(dr.defaults);
    }
    // §L14 typed SECTION sheets (bar / plate / member layers): the drawn section at its cut, repeated along the building (the copies are assumed, red)
    var SC = ctx.SC || (typeof module === 'object' && module.exports ? require('./dxf2section.js') : (typeof self !== 'undefined' ? self.Dxf2Section : null));
    if (SC && !refused.length && sheets.some(function (s) { return s.role === 'section' && ((s.desc && s.desc.layers) || []).some(function (l) { return ['bar', 'plate', 'member'].indexOf(l.type) >= 0; }); })) {
      var sc = SC.buildSections(sheets, { numbers: ctx.numbers, DF: DF });
      res.els = res.els.concat(sc.els); res.gaps = res.gaps.concat(sc.gaps); res.defaults = (res.defaults || []).concat(sc.defaults); res.report = Object.assign({}, res.report, { sections: sc.report });
    }
    // §L13.2 best-effort completion (opt-in: ctx.complete = { slabT, roofT, overhang }): the floor slab and the gabled roof the drawings imply, derived + yellow defaults
    var SY = ctx.SY || (typeof module === 'object' && module.exports ? require('./dxf2synth.js') : (typeof self !== 'undefined' ? self.Dxf2Synth : null));
    if (SY && ctx.complete && !refused.length) {
      var sy = SY.complete(sheets, res.els, { DF: DF });
      res.els = res.els.concat(sy.els); res.gaps = res.gaps.concat(sy.gaps); res.defaults = (res.defaults || []).concat(sy.defaults);
    }
    if (DF) { res.defaults = (res.defaults || []).concat(DF.rows()); res.defaults_table = DF.table(); res.defaults_invalid = DF.invalid(); }
    // §L13.3 material dress: every body's IFC typing carries the reference's material (IfcMaterial + IfcRelAssociatesMaterial in the IFC writers)
    var BL = ctx.BL || (typeof module === 'object' && module.exports ? require('./dxf2bill.js') : (typeof self !== 'undefined' ? self.Dxf2Bill : null));
    if (BL && ctx.ref) res.els.forEach(function (e) { var m = BL.materialOf(e.class, e.ifc && e.ifc.type_name, ctx.ref); if (m && e.ifc) e.ifc = Object.assign({}, e.ifc, { material: m }); });
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var blocking = [], advisory = res.gaps.map(function (x) { return { code: x.code, sheet: x.sheet || '(set)', handles: x.handle ? [x.handle] : [], message: (x.kind ? x.kind + ': ' : '') + (x.detail || '') }; });
    if (!refused.length && !res.els.length && !advisory.some(function (a) { return a.code === 'GAP:body_elevation_not_aligned'; }))
      blocking.push({ code: 'QF:no_bodies', sheet: '(set)', handles: [], message: 'no body could be built: type the body layers on a plan AND an elevation' });
    advisory.filter(function (a) { return a.code === 'GAP:body_elevation_not_aligned'; }).forEach(function (a) { blocking.push(a); });
    var counts = { bodies: res.els.length, left_out: res.gaps.length }; res.gaps.forEach(function (x) { counts[x.code] = (counts[x.code] || 0) + 1; });
    var verdict = { verdict: blocking.length || refused.length ? 'blocked' : 'qualifies', blocking: blocking, advisory: advisory, counts: counts, by_shape: { walls: { blocking: 0, advisory: 0 }, slabs: { blocking: 0, advisory: 0 }, roof: { blocking: 0, advisory: 0 }, openings: { blocking: 0, advisory: 0 } } };   // by_shape: the editor's wall/slab/roof/opening table (a structure set reads none of them)
    var runId = I.sha256Hex(JSON.stringify({ structure: 1, sheets: sheets.map(function (s) { return s.sha; }), snap: res.report && res.report.snap_tol }));
    var R = { els: res.els, ST: plans.map(function (p) { return p.level; }).filter(function (l, i, arr) { return arr.indexOf(l) === i; }).sort(function (x, y) { return x - y; }).map(function (l, i) { return { name: 'Level ' + (i + 1), sheet: plans.filter(function (p) { return p.level === l; })[0].name, level: l, bridge: { voids: [] }, infill: [], fills: { gaps: [] } }; }),
      infillGuid: {}, libGeom: {}, run_id: runId, set: 'STRUCT', gaps: res.gaps, refused: null, fillGaps: [], bodies: res, defaults_table: res.defaults_table || null, defaults_invalid: res.defaults_invalid || [] };
    var g = { ok: !refused.length && !blocking.length, set: null, setFrom: 'structure', roles: { ok: !refused.length, set: null, evidence: 'structure', refused: refused }, refused: refused,
      verdict: verdict, R: R, lib: null, structure: { bodies: res.els.length, left_out: res.gaps.length } };
    return { gate: g, defaults: res.defaults || [], log: 'gate STRUCTURE ok=' + g.ok + ' bodies=' + res.els.length + ' left_out=' + res.gaps.length + ' blocking=' + blocking.length + ' refused=' + JSON.stringify(refused).slice(0, 300) };
  }

  return { isStructure: isStructure, judge: judge, BODY_KINDS: BODY_KINDS, WALLISH: WALLISH };
});
