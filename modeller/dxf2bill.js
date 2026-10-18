// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bill.js — a bill of quantities with STATED formulas (prompts/DXF2BIM_MODELLER_LANE.md §L13.1). Pure, Node + browser.
// Every body gets a line: material from synthetic_ref.json, quantity = formula(measures of the mesh), rate = the rate pack's class rate. Nothing is guessed:
// a class with no pack rate costs 0 and is flagged, a unit that disagrees with the formula's basis is flagged, the evaluator runs arithmetic only (never code).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Bill = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var r6 = function (v) { return Number(Number(v).toFixed(6)); };

  // arithmetic only: numbers, + - * / ( ) and the names given in vars. Anything else throws.
  function evalFormula(src, vars) {
    var s = String(src), i = 0;
    function ws() { while (i < s.length && /\s/.test(s[i])) i++; }
    function num() { var m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return Number(m[0]); }
    function id() { var m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)); if (!m) return null; i += m[0].length; return m[0]; }
    function atom() {
      ws(); var c = s[i];
      if (c === '(') { i++; var v = expr(); ws(); if (s[i] !== ')') throw new Error('Dxf2Bill: ")" expected in "' + s + '"'); i++; return v; }
      if (c === '-') { i++; return -atom(); }
      var n = num(); if (n !== null) return n;
      var name = id(); if (name === null) throw new Error('Dxf2Bill: unexpected "' + (c || 'end') + '" in "' + s + '"');
      ws(); if (s[i] === '(') throw new Error('Dxf2Bill: function calls are not allowed: "' + s + '"');
      if (!Object.prototype.hasOwnProperty.call(vars, name)) throw new Error('Dxf2Bill: unknown name "' + name + '" in "' + s + '"');
      return vars[name];
    }
    function term() { var v = atom(); for (;;) { ws(); var c = s[i]; if (c === '*') { i++; v *= atom(); } else if (c === '/') { i++; var d = atom(); if (d === 0) throw new Error('Dxf2Bill: division by zero in "' + s + '"'); v /= d; } else return v; } }
    function expr() { var v = term(); for (;;) { ws(); var c = s[i]; if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v; } }
    var out = expr(); ws(); if (i < s.length) throw new Error('Dxf2Bill: unexpected "' + s.slice(i) + '" in "' + s + '"');
    return out;
  }

  // measures of a triangle mesh (metres): V, A (largest pair of parallel faces), t = V/A, L, N
  function measures(mesh) {
    var v = mesh.vertices, f = mesh.faces, vol = 0, buckets = {}, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    v.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } });
    f.forEach(function (t) {
      var a = v[t[0]], b = v[t[1]], c = v[t[2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, area = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      if (area < 1e-12) return;
      nx /= 2 * area; ny /= 2 * area; nz /= 2 * area;
      if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && (ny < -1e-9 || (Math.abs(ny) <= 1e-9 && nz < 0)))) { nx = -nx; ny = -ny; nz = -nz; }   // opposite faces share a bucket
      var key = Math.round(nx * 1000) + ',' + Math.round(ny * 1000) + ',' + Math.round(nz * 1000);
      buckets[key] = (buckets[key] || 0) + area;
    });
    vol = Math.abs(vol);
    var big = 0; Object.keys(buckets).forEach(function (k) { if (buckets[k] > big) big = buckets[k]; });
    var A = big / 2, dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    return { V: vol, A: A, t: A > 0 ? vol / A : 0, L: Math.max.apply(null, dims), N: 1 };
  }

  function tRefOf(packEntry) {   // the thickness the pack rate is quoted at, from its description ("Blockwork Wall 150mm" -> 0.15 m)
    var m = packEntry && /(\d+(?:\.\d+)?)\s*mm/i.exec(packEntry.desc || ''); return m ? Number(m[1]) / 1000 : null;
  }
  var BASIS_UNIT = { area: 'M2', volume: 'M3', length: 'M', count: 'EA' };

  // the material a body is dressed in: the reference's part material, overridden by the first materialByLabel entry whose pattern the type label matches
  function materialOf(cls, label, ref) {
    var part = ref && ref.parts && ref.parts[cls]; if (!part) return null;
    var mat = part.material; (part.materialByLabel || []).forEach(function (m) { if (label && new RegExp(m.match, 'i').test(label)) mat = m.material; });
    return mat;
  }
  // bodies: [{guid, kind, class, prov, vertices, faces, ifc:{type_name}}]; opts: { ref, pack: {meta, materials}, packName }
  function bill(bodies, opts) {
    var ref = opts.ref, pack = opts.pack || { materials: {} }, lines = [], flags = [], tot = { amount: 0, by_prov: { drawn: 0, derived: 0, assumed: 0 }, by_class: {} };
    bodies.forEach(function (b) {
      var part = ref.parts[b.class], prov = b.prov || 'drawn', ms = measures(b), flagsL = [];
      var line = { id: b.guid, kind: b.kind || null, class: b.class, prov: prov, material: null, measures: { V: r6(ms.V), A: r6(ms.A), t: r6(ms.t), L: r6(ms.L), N: 1 }, quantity: 0, unit: null, rate: 0, pack_class: null, pack_desc: null, factor: 1, amount: 0, formula: null, flags: flagsL };
      if (!part) { flagsL.push('no_part_entry'); lines.push(line); flags.push({ id: b.guid, flag: 'no_part_entry', class: b.class }); return; }
      var label = (b.ifc && b.ifc.type_name) || '', mat = part.material;
      (part.materialByLabel || []).forEach(function (m) { if (new RegExp(m.match, 'i').test(label)) mat = m.material; });
      line.material = mat;
      var q = evalFormula(part.quantity.formula, ms); line.quantity = r6(q); line.unit = part.quantity.unit; line.formula = part.quantity.formula;
      var pe = pack.materials[(part.rate_ref && part.rate_ref.class) || b.class];
      if (!pe || !(pe.rate > 0)) { flagsL.push('no_rate'); flags.push({ id: b.guid, flag: 'no_rate', class: b.class }); }
      else {
        line.rate = pe.rate; line.pack_class = part.rate_ref.class; line.pack_desc = pe.desc;
        if (pe.unit !== part.quantity.unit) { flagsL.push('unit_mismatch'); flags.push({ id: b.guid, flag: 'unit_mismatch', class: b.class, formula_unit: part.quantity.unit, pack_unit: pe.unit }); }
        else {
          var fct = 1;
          if (part.factor) {
            var tr = tRefOf(pe);
            if (tr && ms.t > 0) { fct = evalFormula(part.factor.formula, { t: ms.t, t_ref: tr }); line.factor_formula = part.factor.formula + ' (t_ref = ' + tr + ' m from the pack description)'; }
            else flagsL.push('no_t_ref');
          }
          line.factor = r6(fct); line.amount = r6(q * pe.rate * fct);
        }
      }
      tot.amount += line.amount; tot.by_prov[prov] = (tot.by_prov[prov] || 0) + line.amount; tot.by_class[b.class] = (tot.by_class[b.class] || 0) + line.amount;
      lines.push(line);
    });
    tot.amount = r6(tot.amount); Object.keys(tot.by_prov).forEach(function (k) { tot.by_prov[k] = r6(tot.by_prov[k]); }); Object.keys(tot.by_class).forEach(function (k) { tot.by_class[k] = r6(tot.by_class[k]); });
    var cur = (pack.meta && pack.meta.currency) || null;
    return { pack: opts.packName || (pack.meta && pack.meta.name) || null, currency: cur, lines: lines, totals: tot, flags: flags,
      log: '§BILL lines=' + lines.length + ' amount=' + tot.amount + (cur ? ' ' + cur : '') + ' drawn=' + tot.by_prov.drawn + ' derived=' + tot.by_prov.derived + ' assumed=' + tot.by_prov.assumed + ' flags=' + flags.length };
  }
  return { evalFormula: evalFormula, measures: measures, bill: bill, tRefOf: tRefOf, materialOf: materialOf };
});
