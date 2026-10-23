// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_order.js — total order WITHOUT a sequencer.
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.4 + §12.2 (CL2) — Witness: W-ORDER-PERMUTE.
 * Decision D1 (user 2026-10-23): nobody assigns order; every device computes the same order from the ops.
 *
 * linearize(ops) — ops = [{hash, author, seq, prev, deps}] in ANY arrival order.
 *   An op is READY once its prev (own chain) and every dep (other authors' heads it had seen) are placed.
 *   Among ready ops the lowest hash goes first. Same set in → same order out, whatever the arrival order.
 *   Reads ONLY hash/author/seq/prev/deps — never ts, so a device's clock cannot move its op earlier.
 *   Missing prev/dep → the op (and anything waiting on it) is PARKED, never guessed.
 *   Two ops at the same (author, seq) = the author signed a fork of its own chain → EQUIVOCATION;
 *   neither is placed, and nothing that depends on either is placed.
 * PURE: no DOM, no storage, no clock.
 */
(function (global) {
  'use strict';

  // tiny binary min-heap on hash strings (lexicographic = numeric for fixed-length lowercase hex)
  function Heap() { this.a = []; }
  Heap.prototype.push = function (x) { var a = this.a; a.push(x); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p].hash <= a[i].hash) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
  Heap.prototype.pop = function () { var a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; var i = 0, n = a.length;
      for (;;) { var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && a[l].hash < a[m].hash) m = l; if (r < n && a[r].hash < a[m].hash) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } }
    return top; };
  Heap.prototype.size = function () { return this.a.length; };

  function linearize(ops) {
    var byHash = Object.create(null), bySlot = Object.create(null), equivocations = [], bad = Object.create(null);
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], n = { hash: o.hash, author: o.author, seq: o.seq, prev: o.prev, deps: (o.deps || []).slice() };
      if (byHash[n.hash]) continue;                               // same op twice = the same op (name = hash)
      byHash[n.hash] = n;
      var slot = n.author + '#' + n.seq;
      if (bySlot[slot]) { equivocations.push({ author: n.author, seq: n.seq, a: bySlot[slot].hash, b: n.hash });
        bad[bySlot[slot].hash] = 1; bad[n.hash] = 1; }
      else bySlot[slot] = n;
    }
    var waiting = Object.create(null), need = Object.create(null), heap = new Heap();
    Object.keys(byHash).forEach(function (h) {
      var n = byHash[h], pre = (n.prev ? [n.prev] : []).concat(n.deps), missing = 0;
      pre.forEach(function (p) {
        missing++;
        (waiting[p] = waiting[p] || []).push(h);
      });
      need[h] = missing;
      if (!missing && !bad[h]) heap.push(n);
    });
    var order = [], placed = Object.create(null);
    while (heap.size()) {
      var n = heap.pop(); order.push(n.hash); placed[n.hash] = 1;
      (waiting[n.hash] || []).forEach(function (w) {
        if (--need[w] === 0 && !bad[w]) heap.push(byHash[w]);
      });
    }
    var parked = Object.keys(byHash).filter(function (h) { return !placed[h] && !bad[h]; }).sort();
    return { order: order, parked: parked, equivocations: equivocations };
  }

  var API = { linearize: linearize };
  global.CommOrder = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
