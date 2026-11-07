// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_report.js — §EDIT-REPORT (bim-compiler prompts/MODELLER_MASTER.md, row 41). After an edit: what changed, what was checked,
// how the red ink moved, and what was NOT checked. A PURE COMPOSER, the same pattern as reg_report.js: every number is handed in by
// its owner (SdgGate, GridSpanGate, the grid-move commit), so this file holds no rule and no threshold. It reports only and stops nothing.
// A row is one of: JUDGED (same population both sides) · INCONCLUSIVE (populations differ, so no delta) · NOT_JUDGED (refused, with why).
// Witness: modeller/tests/witness_edit_report.js. Log tag §EDIT_REPORT.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NEW_KINDS = [
    ['clash', 'New or deeper box overlap', 'red'],
    ['abuts-clash', 'Driven into a wall it touches', 'red'],
    ['door-out', 'Door or window off its wall', 'red'],
    ['door-crush', 'Door or window no longer fits its wall', 'red'],
    ['clearance', 'New clearance under the limit', 'orange'],
    ['abuts-realign', 'Gap opened at a touching element', 'orange']
  ];
  var MAX_PAIRS = 20, NOTHING_MOVED = 'no scene element moved in this edit, so there was nothing to judge';

  function judged(id, label, scope, before, after, note) {
    return { id: id, label: label, scope: scope, state: 'JUDGED', before: before, after: after, delta: after - before, note: note || '' };
  }
  function notNumbered(id, label, scope, state, reason) {
    return { id: id, label: label, scope: scope, state: state, before: null, after: null, delta: null, note: reason };
  }

  function overlapRow(o) {
    var mm = o && o.tolMm != null ? Math.round(o.tolMm) : null;
    var label = 'Box overlap over ' + (mm == null ? '?' : mm) + ' mm', id = 'overlap';
    if (!o || !o.before || !o.after) return notNumbered(id, label, 'moved elements', 'NOT_JUDGED', (o && o.refused) || 'the conformity gate did not run');
    var scope = o.after.moved + ' moved element' + (o.after.moved === 1 ? '' : 's') + ' against ' + o.after.against;
    if (!o.after.moved) return notNumbered(id, label, 'moved elements', 'NOT_JUDGED', NOTHING_MOVED);   // a clean 0 here would be a witness that judged nothing
    if (o.before.moved !== o.after.moved || o.before.against !== o.after.against) {
      return notNumbered(id, label, scope, 'INCONCLUSIVE', 'different elements before (' + o.before.moved + ' against ' + o.before.against + ') and after');
    }
    return judged(id, label, scope, o.before.count, o.after.count, 'bounding boxes; touching and hosted pairs are left out');
  }

  function spanRows(s) {
    var R = 'span_red', O = 'span_orange', RL = 'Beam spans over limit', OL = 'Beam spans needing a depth check', scope = 'whole building';
    if (!s || s.refused || !s.before || !s.after) {
      var why = (s && s.refused) || 'the span check did not run';
      return [notNumbered(R, RL, scope, 'NOT_JUDGED', why), notNumbered(O, OL, scope, 'NOT_JUDGED', why)];
    }
    if (s.before.pieces !== s.after.pieces) {
      var d = 'girder count changed: ' + s.before.pieces + ' before, ' + s.after.pieces + ' after';
      return [notNumbered(R, RL, scope, 'INCONCLUSIVE', d), notNumbered(O, OL, scope, 'INCONCLUSIVE', d)];
    }
    var note = s.prelim || '', sc = s.after.pieces + ' walked girders' + (s.material ? ', ' + s.material : '') + (s.mixed ? ' (mixed building)' : '');
    return [judged(R, RL, sc, s.before.RED, s.after.RED, note), judged(O, OL, sc, s.before.ORANGE, s.after.ORANGE, note)];
  }

  function newRows(gate, nothingMoved) {
    if (!gate || nothingMoved) return NEW_KINDS.map(function (k) { return { id: k[0], label: k[1], level: k[2], state: 'NOT_JUDGED', count: null }; });
    var all = (gate.red || []).concat(gate.orange || []);
    var rows = NEW_KINDS.map(function (k) {
      return { id: k[0], label: k[1], level: k[2], state: 'JUDGED', count: all.filter(function (x) { return x.kind === k[0]; }).length };
    });
    all.forEach(function (x) {   // a kind this file has not heard of is still counted, never dropped
      if (!NEW_KINDS.some(function (k) { return k[0] === x.kind; }) && !rows.some(function (r) { return r.id === x.kind; })) {
        rows.push({ id: x.kind, label: x.kind, level: (gate.red || []).indexOf(x) >= 0 ? 'red' : 'orange', state: 'JUDGED',
          count: all.filter(function (y) { return y.kind === x.kind; }).length });
      }
    });
    return rows;
  }

  function newPairs(o) {
    if (!o || !o.before || !o.after) return [];
    var had = {}; o.before.pairs.forEach(function (p) { had[p.a + '|' + p.b] = 1; });
    return o.after.pairs.filter(function (p) { return !had[p.a + '|' + p.b]; }).slice(0, MAX_PAIRS);
  }

  // input: { change:{kind,grid,delta,recomposed,riders,verify}, overlap:{tolMm,before,after,refused}, span:{before,after,refused,prelim,material,mixed},
  //          gate:{red,orange}|null, notChecked:[...] }. No NOT-checked list, no report: a table without it reads as an all-clear.
  function compose(input) {
    if (!input || !Array.isArray(input.notChecked) || !input.notChecked.length) throw new Error('refused: no NOT-checked list');
    return {
      tag: 'EDIT_REPORT', version: 1, change: input.change,
      rows: [overlapRow(input.overlap)].concat(spanRows(input.span)),
      newRows: newRows(input.gate, !!(input.overlap && input.overlap.after && !input.overlap.after.moved)),
      newPairs: newPairs(input.overlap),
      notChecked: input.notChecked.slice()
    };
  }
  return { compose: compose, MAX_PAIRS: MAX_PAIRS };
});
