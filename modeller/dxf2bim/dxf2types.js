// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2types.js — type binding for DXF2BIM ops. Spec: docs/DXF2BIM_SPEC.md §38. Pure functions, no DB, no DOM.
// 2D→3D outline stays as measured; this module only ATTACHES a type request and, when the library answers unambiguously, a type id.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Types = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var DIMS = { wall: ['thickness'], window: ['width', 'height'], door: ['width', 'height'] };

  // class + measured size of an op, or null when the op takes no type
  function request(op) {
    var p = op.params, cls;
    if (op.op_type === 'DXF_WALL') cls = 'wall';
    else if (op.op_type === 'DXF_OPENING' && (p.category === 'window' || p.category === 'door')) cls = p.category;
    else if (op.op_type === 'DXF_OPENING' && p.category === undefined && (p.kind === 'window' || p.kind === 'door')) cls = p.kind;   // door arcs / glazing clusters carry kind only
    else return null;
    var m = {}; DIMS[cls].forEach(function (d) { m[d] = p[d]; });
    return { class: cls, measured: m, label: p.label === undefined ? null : p.label, label_source: p.label_source === undefined ? null : p.label_source };
  }
  function deltas(req, entry) {
    var d = {}; DIMS[req.class].forEach(function (k) { d[k] = r6(req.measured[k] - entry[k]); }); return d;
  }
  function within(d, tol) { return Object.keys(d).every(function (k) { return Math.abs(d[k]) <= tol + 1e-9; }); }
  function layerSum(entry) { return entry.layers ? r6(entry.layers.reduce(function (s, l) { return s + l.thickness; }, 0)) : null; }
  function matches(sel, op) {
    return Object.keys(sel).every(function (k) { return k === 'handle' ? op.params.handle === sel.handle : k === 'guid' ? op.output_guid === sel.guid : k === 'label' ? op.params.label === sel.label : false; });
  }

  // ops: pipeline ops. library: {wall:[{id,thickness,layers?}], window:[{id,width,height}], door:[...]} in metres.
  // cfg.bind.size_tol (m, required). opts.bindings: [{select:{handle|guid|label}, type_id}]. opts.schedule: {label:{width,height}|{thickness}} (data from markings).
  function bindTypes(ops, library, cfg, opts) {
    opts = opts || {};
    var runOp = ops.find(function (o) { return o.op_type === 'DXF_RUN'; });
    var runId = runOp ? runOp.params.run_id : null;
    var gaps = [];
    function gap(code, op, extra) { gaps.push({ op_type: 'DXF_GAP', params: Object.assign({ run_id: runId, code: code, handle: op.params.handle, guid: op.output_guid }, extra), input_guids: [], output_guid: null }); }
    var tol = cfg && cfg.bind && typeof cfg.bind.size_tol === 'number' ? cfg.bind.size_tol : null;
    var out = ops.map(clone), stats = { bound: 0, unbound: 0, requests: 0 };
    out.forEach(function (op) {
      var req = request(op); if (!req) return;
      op.params.type_request = req; stats.requests++;
      if (tol === null) return;
      var missing = DIMS[req.class].filter(function (k) { return typeof req.measured[k] !== 'number'; });
      if (missing.length) { gap('GAP:type_request_incomplete', op, { class: req.class, missing: missing }); stats.unbound++; return; }
      var lib = (library && library[req.class]) || [], hit = null, src = null;
      // 1 explicit binding
      var b = (opts.bindings || []).filter(function (x) { return matches(x.select, op); });
      if (b.length > 1 && b.some(function (x) { return x.type_id !== b[0].type_id; })) { gap('GAP:type_binding_conflict', op, { type_ids: b.map(function (x) { return x.type_id; }) }); stats.unbound++; return; }
      if (b.length) {
        hit = lib.find(function (e) { return e.id === b[0].type_id; }) || null; src = 'explicit';
        if (!hit) { gap('GAP:type_unknown', op, { type_id: b[0].type_id, bind_source: 'explicit' }); stats.unbound++; return; }
      } else if (req.label !== null) {   // 2 label equals a library id (exact, case-sensitive)
        hit = lib.find(function (e) { return e.id === req.label; }) || null; if (hit) src = 'label';
      }
      if (!hit) {                         // 3 size: exactly one candidate in tolerance
        var cand = lib.filter(function (e) { return within(deltas(req, e), tol); }), pref = null, narrowed = null;
        if (cand.length > 1 && cfg.bind.prefer) {   // S2: first listed set with candidates breaks the tie
          for (var pi = 0; pi < cfg.bind.prefer.length && !narrowed; pi++) {
            var inSet = cand.filter(function (e) { return e.set === cfg.bind.prefer[pi]; });
            if (inSet.length) narrowed = inSet;
          }
          if (narrowed && narrowed.length === 1) { pref = cand.filter(function (e) { return e !== narrowed[0]; }).map(function (e) { return e.id; }).sort(); hit = narrowed[0]; src = 'size_prefer'; }
        }
        if (!hit) {
          if (cand.length === 1) { hit = cand[0]; src = 'size'; }
          else { var ex = { class: req.class, measured: req.measured, candidates: cand.map(function (e) { return e.id; }).sort() }; if (narrowed) ex.prefer_narrowed = narrowed.map(function (e) { return e.id; }).sort(); gap('GAP:type_unbound', op, ex); stats.unbound++; return; }
        }
      }
      if (req.class === 'wall') {         // B6 layer sum must equal measured thickness
        var ls = layerSum(hit);
        if (ls !== null && Math.abs(ls - req.measured.thickness) > tol + 1e-9) { gap('GAP:layers_sum_mismatch', op, { type_id: hit.id, layers_sum: ls, measured: req.measured.thickness }); stats.unbound++; return; }
      }
      var d = deltas(req, hit);
      op.params.type = { type_id: hit.id, bind_source: src, delta: d }; if (src === 'size_prefer') { op.params.type.set = hit.set; op.params.type.preferred_over = pref; } stats.bound++;
      if (!within(d, tol)) gap('GAP:type_size_mismatch', op, { type_id: hit.id, bind_source: src, delta: d });
    });
    // B5 schedule vs measured
    if (opts.schedule) out.forEach(function (op) {
      var req = op.params.type_request; if (!req || req.label === null || !opts.schedule[req.label]) return;
      var s = opts.schedule[req.label], diff = {};
      if (s.class !== undefined && s.class !== req.class) return;   // L5: another class's schedule entry
      var al = (opts.allowance && opts.allowance[req.class]) || {};
      DIMS[req.class].forEach(function (k) { var a = typeof al[k] === 'number' ? al[k] : 0;
        if (typeof s[k] === 'number' && Math.abs(req.measured[k] - (s[k] + a)) > (tol === null ? 0 : tol) + 1e-9) { diff[k] = { schedule: s[k], measured: req.measured[k] }; if (typeof al[k] === 'number') diff[k].allowance = al[k]; } });
      if (Object.keys(diff).length) gap('GAP:schedule_conflict', op, { label: req.label, diff: diff });
    });
    if (tol === null) gaps.push({ op_type: 'DXF_GAP', params: { run_id: runId, code: 'GAP:no_dimension', need: 'bind.size_tol' }, input_guids: [], output_guid: null });
    gaps.sort(function (a, b) { var x = a.params.code + (a.params.guid || ''), y = b.params.code + (b.params.guid || ''); return x < y ? -1 : x > y ? 1 : 0; });
    return { ops: out.concat(gaps), gaps: gaps, stats: stats };
  }
  // ---- labels and schedules from markings (SPEC §44) ----
  function footprint(op) {
    var p = op.params;
    if (op.op_type === 'DXF_WALL') return p.rect || null;
    if (p.bbox) return p.bbox;
    if (p.centre && typeof p.width === 'number' && typeof p.depth === 'number') {
      var hx = (p.angle_deg === 90 ? p.depth : p.width) / 2, hy = (p.angle_deg === 90 ? p.width : p.depth) / 2;
      return [p.centre[0] - hx, p.centre[1] - hy, p.centre[0] + hx, p.centre[1] + hy];
    }
    return null;
  }
  function classOf(op) { var r = request(op); return r ? r.class : null; }
  function zInterval(op, level) {
    var p = op.params, a, h;
    if (op.op_type === 'DXF_WALL') { a = p.base; h = p.height; } else { a = p.sill; h = p.height; if (typeof a !== 'number' && p.kind === 'door' && p.category === undefined) a = 0; }   // arc doors stand on the floor
    return typeof a === 'number' && typeof h === 'number' ? [level + a, level + a + h] : null;
  }
  function hits(op, cls, x, y, tol, z, level) {
    if (classOf(op) !== cls) return false;
    if (z !== undefined) { var zi = zInterval(op, level); if (!zi || z < zi[0] - tol || z > zi[1] + tol) return false; }
    if (cls === 'door' && op.params.hinge) { var h = op.params.hinge; return !!h && Math.sqrt((h[0] - x) * (h[0] - x) + (h[1] - y) * (h[1] - y)) <= op.params.width + tol; }   // SANDBOX rule: swing disc around the hinge
    var f = footprint(op); return !!f && x >= f[0] - tol && x <= f[2] + tol && y >= f[1] - tol && y <= f[3] + tol;
  }
  // desc: Dxf2Marks.describe(...).desc (PLAN view); units: Dxf2Marks.UNITS map; opts.snap_tol in metres (required)
  function applyLabels(ops, desc, units, opts) {
    var f = units[desc.units], tol = opts && opts.snap_tol, gaps = [], out = ops.map(clone);
    var runOp = ops.find(function (o) { return o.op_type === 'DXF_RUN'; }), runId = runOp ? runOp.params.run_id : null;
    function gp(code, extra) { gaps.push({ op_type: 'DXF_GAP', params: Object.assign({ run_id: runId, code: code }, extra), input_guids: [], output_guid: null }); }
    if (typeof f !== 'number' || typeof tol !== 'number') { gp('GAP:no_dimension', { need: 'desc.units,snap_tol' }); return { ops: out.concat(gaps), gaps: gaps, labelled: 0 }; }
    var n = 0, lvl = opts && opts.level;
    if ((desc.labels || []).some(function (L) { return L.z !== undefined; }) && typeof lvl !== 'number') { gp('GAP:no_dimension', { need: 'opts.level (labels with z)' }); return { ops: out.concat(gaps), gaps: gaps, labelled: 0 }; }
    (desc.labels || []).forEach(function (L) {
      var x = L.x * f, y = L.y * f, hit = out.filter(function (o) { return hits(o, L.class, x, y, tol, L.z, lvl); });
      if (!hit.length) { gp('GAP:label_unmatched', { class: L.class, text: L.text, point: [x, y], z: L.z }); return; }
      if (hit.length > 1) { gp('GAP:label_ambiguous', { class: L.class, text: L.text, point: [x, y], z: L.z, guids: hit.map(function (o) { return o.output_guid; }).sort() }); return; }
      var o = hit[0];
      if (o.params.label !== undefined && o.params.label !== L.text) { gp('GAP:label_conflict', { class: L.class, text: L.text, existing: o.params.label, guid: o.output_guid, handle: o.params.handle }); return; }
      o.params.label = L.text; o.params.label_source = 'marking'; n++;
    });
    gaps.sort(function (a, b) { var k1 = a.params.code + JSON.stringify(a.params.point || ''), k2 = b.params.code + JSON.stringify(b.params.point || ''); return k1 < k2 ? -1 : k1 > k2 ? 1 : 0; });
    return { ops: out.concat(gaps), gaps: gaps, labelled: n };
  }
  // SPEC §52: tags placed on the drawing. views: [{desc, map?}] (described PLAN/ELEV views; map from Dxf2Marks.align for ELEV). opts {snap_tol, level, vocab}
  function applyTags(ops, views, units, opts) {
    opts = opts || {};
    var tol = opts.snap_tol, lvl = opts.level, vocab = opts.vocab, gaps = [], out = ops.map(clone), n = 0;
    var runOp = ops.find(function (o) { return o.op_type === 'DXF_RUN'; }), runId = runOp ? runOp.params.run_id : null;
    function gp(code, extra) { gaps.push({ op_type: 'DXF_GAP', params: Object.assign({ run_id: runId, code: code }, extra), input_guids: [], output_guid: null }); }
    if (typeof tol !== 'number') { gp('GAP:no_dimension', { need: 'snap_tol' }); return { ops: out.concat(gaps), gaps: gaps, labelled: 0 }; }
    function assign(hit, tag, text, where) {
      if (!hit.length) { gp('GAP:label_unmatched', { class: tag.class, text: text, tag: where }); return; }
      if (hit.length > 1) { gp('GAP:label_ambiguous', { class: tag.class, text: text, tag: where, guids: hit.map(function (o) { return o.output_guid; }).sort() }); return; }
      var o = hit[0];
      if (o.params.label !== undefined && o.params.label !== text) { gp('GAP:label_conflict', { class: tag.class, text: text, existing: o.params.label, guid: o.output_guid, handle: o.params.handle }); return; }
      o.params.label = text; o.params.label_source = 'tag'; n++;
    }
    views.forEach(function (view) {
      var desc = view.desc, f = units[desc.units];
      (desc.tags || []).forEach(function (tag) {
        var text = tag.text;
        if (vocab) {
          if (!Object.prototype.hasOwnProperty.call(vocab, tag.text)) { gp('GAP:label_unknown_text', { class: tag.class, text: tag.text, tag: [tag.x, tag.y], view: desc.view }); return; }
          text = vocab[tag.text];
        }
        if (typeof f !== 'number') { gp('GAP:no_dimension', { need: 'desc.units' }); return; }
        if (desc.view === 'ELEV') {
          var map = view.map; if (!map) { gp('GAP:no_dimension', { need: 'alignment map for ELEV tags' }); return; }
          if (typeof lvl !== 'number') { gp('GAP:no_dimension', { need: 'opts.level (ELEV tags)' }); return; }
          var ai = desc.haxis.slice(1) === 'X' ? 0 : 1, c = map.toPlan(tag.x), z = map.zOf(tag.y);
          var hit = out.filter(function (o) {
            if (classOf(o) !== tag.class || o.op_type !== 'DXF_OPENING' || o.params.face !== desc.face) return false;
            var lo, hi, p = o.params;
            if (tag.class === 'door' && p.hinge) { lo = p.hinge[ai] - p.width; hi = p.hinge[ai] + p.width; }
            else { if (!p.bbox) return false; lo = p.bbox[ai]; hi = p.bbox[ai + 2]; }   // windows and gap-classified doors (no hinge) use their bbox
            var zi = zInterval(o, lvl);
            return c >= lo - tol && c <= hi + tol && !!zi && z >= zi[0] - tol && z <= zi[1] + tol;
          });
          assign(hit, tag, text, [tag.x, tag.y]);
        } else {
          if (tag.z !== undefined && typeof lvl !== 'number') { gp('GAP:no_dimension', { need: 'opts.level (tags with z)' }); return; }
          var x = tag.x * f, y = tag.y * f;
          assign(out.filter(function (o) { return hits(o, tag.class, x, y, tol, tag.z, lvl); }), tag, text, [x, y]);
        }
      });
    });
    gaps.sort(function (a, b) { var k1 = a.params.code + JSON.stringify(a.params.tag || '') + a.params.text, k2 = b.params.code + JSON.stringify(b.params.tag || '') + b.params.text; return k1 < k2 ? -1 : k1 > k2 ? 1 : 0; });
    return { ops: out.concat(gaps), gaps: gaps, labelled: n };
  }
  function allowanceFromDesc(desc, units) {
    var f = units[desc.units], out = {};
    if (typeof f !== 'number') return out;
    Object.keys(desc.allowance || {}).sort().forEach(function (c) { out[c] = { width: r6(desc.allowance[c].w * f), height: r6(desc.allowance[c].h * f) }; });
    return out;
  }
  function scheduleFromDesc(desc, units) {
    var f = units[desc.units], out = {};
    if (typeof f !== 'number') return out;
    (desc.schedule || []).forEach(function (e) {
      var v = { class: e.class }; if (e.class === 'wall') v.thickness = r6(e.t * f); else { v.width = r6(e.w * f); v.height = r6(e.h * f); }
      out[e.text] = v;
    });
    return out;
  }
  return { bindTypes: bindTypes, request: request, applyLabels: applyLabels, applyTags: applyTags, scheduleFromDesc: scheduleFromDesc, allowanceFromDesc: allowanceFromDesc };
});
