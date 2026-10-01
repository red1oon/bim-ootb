// grid_span_gate.js — §GRID-SPAN-GATE (prompts/MODELLER_MASTER.md §GRID-SPAN-GATE SPEC 2026-10-02, row 38).
// A grid drag must not stretch a structural bay past its span limit. PURE logic (no DOM/THREE): the modeller wiring
// (modeller.html) paints and prompts; everything numeric lives here so a node witness can pin it.
//   NO new thresholds: the ONLY rule source is str_walker.js SW_SPAN_RULES + swCheckGirder (Eurocode-cited, PRELIMINARY).
//   ORANGE uses a MEASURED number: proposedDepth = the building's own median beam depth (walker section) — so
//   ORANGE <=> span > measuredDepth x depthRatio; RED <=> span > maxBeamSpan (table). Material is READ from the
//   building's own IfcColumn/IfcBeam names — unreadable => REFUSED (never guessed).
//   Spans are a FOLD of the pristine walker base + the ACTIVE op-log (GEOM_GRID_MOVE deltas, GEOM_INSERT params.spanSplit),
//   so undo/redo/scrub revert them; the walker's own imperative state is never read.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./str_walker.js'));
  else root.GridSpanGate = factory(root);
})(typeof window !== 'undefined' ? window : this, function (SW) {
  'use strict';
  var TAG = '§GRID-SPAN';
  var PRELIM = 'Preliminary — the structural engineer confirms.';

  // The rule lookup. `__gsgBreakRule` is the falsifier switch (witness GSG_BREAK=1): a broken lookup must make the
  // witness go RED, so it returns nothing and the gate then refuses to colour.
  function ruleFor(mat) {
    if (typeof window !== 'undefined' && window.__gsgBreakRule) return null;
    return (SW.SW_SPAN_RULES && SW.SW_SPAN_RULES[mat]) || null;
  }

  var RC_RE = /concrete|precast|reinforced|\brc\b|cast[- ]in[- ]place/i;
  var STEEL_RE = /\bsteel\b|wide[- ]?flange|hollow structural|(^|[^a-z])hss\d|(^|[^a-z])hss[- ]|\bw\d+x\d|i[- ]beam|rolled|universal (beam|column)/i;
  // Material from the building's own STR IfcColumn/IfcBeam rows (db = sql.js Database of the building's meta DB).
  // The span rule is a BEAM rule: the material is the one carried by a STRICT MAJORITY of the building's own IfcBeam rows
  // (all STR column/beam rows when it has no beams). A tie or no readable name => null (REFUSED). `mixed` is reported, never hidden.
  function readMaterial(db) {
    var out = { material: null, rc: 0, steel: 0, none: 0, n: 0, beams: { rc: 0, steel: 0, none: 0, n: 0 }, mixed: false,
                source: 'elements_meta.element_name+material_name (STR IfcColumn/IfcBeam; majority of IfcBeam rows)' };
    try {
      var r = db.exec("SELECT ifc_class, element_name, material_name FROM elements_meta WHERE discipline='STR' AND ifc_class IN ('IfcColumn','IfcBeam')");
      (r.length ? r[0].values : []).forEach(function (v) {
        var t = (v[1] || '') + ' ' + (v[2] || ''); out.n++;
        var rc = RC_RE.test(t), st = STEEL_RE.test(t), k = rc && !st ? 'rc' : (st && !rc ? 'steel' : 'none');
        out[k]++; if (v[0] === 'IfcBeam') { out.beams[k]++; out.beams.n++; }
      });
    } catch (e) { out.error = String(e && e.message || e); }
    var c = out.beams.n ? out.beams : out;
    out.mixed = c.rc > 0 && c.steel > 0;
    if (c.rc > c.steel && c.rc > 0) out.material = 'RC'; else if (c.steel > c.rc && c.steel > 0) out.material = 'STEEL';
    return out;
  }

  // ── the fold ───────────────────────────────────────────────────────────────────────────────────────────────────
  // info = swbGateInfo(); ops = Bonsai.oplog._geomOps(); cursor = Bonsai.oplog.cursor.
  // -> { lines:{x:[u..],y:[v..]}, pieces:[{guid,spanAxis,a,b,onAxis,onDatum,srcFrom,srcTo}] }  (lattice frame)
  function _idx(lines, v) { for (var i = 0; i < lines.length; i++) if (lines[i] === v) return i; return -1; }
  function fold(info, ops, cursor) {
    var g0 = info.base0.grid;
    var lines = { x: g0.xLines.slice(), y: g0.yLines.slice() };
    var colAt = {};   // "x|y" lattice -> srcGuid, for the FROM/TO column of each girder
    info.base0.walked.forEach(function (w) { colAt[w.x + '|' + w.y] = w.srcGuid; });
    var pieces = info.base0.girders.map(function (gd) {
      var spanAxis = gd.axis === 'Xline@' ? 'y' : 'x';
      var from = gd.from, to = gd.to;   // [x,y] lattice endpoints
      var onAxis = spanAxis === 'x' ? 'y' : 'x';
      return { guid: gd.guid, spanAxis: spanAxis, onAxis: onAxis, onDatum: gd.onDatum, onIdx: _idx(lines[onAxis], gd.onDatum),
               a: _idx(lines[spanAxis], gd.fromDatum), b: _idx(lines[spanAxis], gd.toDatum),
               srcFrom: colAt[from[0] + '|' + from[1]] || null, srcTo: colAt[to[0] + '|' + to[1]] || null };
    });
    var upto = Math.min(cursor == null ? ops.length : cursor, ops.length);
    var splitDone = {};
    for (var i = 0; i < upto; i++) {
      var op = ops[i]; if (!op) continue; var p = op.parameters || {};
      if (op.op_type === 'GEOM_GRID_MOVE') {
        var mm = /^g([xy])(\d+)$/.exec(p.gridId || ''); if (!mm || !p.delta) continue;
        var arr = lines[mm[1]], k = +mm[2]; if (k >= 0 && k < arr.length) arr[k] += p.delta;
      } else if (op.op_type === 'GEOM_INSERT' && p.spanSplit) {
        var sp = p.spanSplit; if (splitDone[sp.id]) continue; splitDone[sp.id] = 1;
        var gs = {}; for (var j = 0; j < upto; j++) { var q = ops[j] && ops[j].parameters; if (q && q.spanSplit && q.spanSplit.id === sp.id) gs[q.spanSplit.girder] = q.spanSplit.srcGuid || null; }
        lines[sp.axis].splice(sp.index, 0, sp.u);
        var next = [];
        pieces.forEach(function (pc) {
          if (pc.spanAxis !== sp.axis) { next.push(pc.onAxis === sp.axis && pc.onIdx >= sp.index ? Object.assign({}, pc, { onIdx: pc.onIdx + 1 }) : pc); return; }
          var a = pc.a >= sp.index ? pc.a + 1 : pc.a, b = pc.b >= sp.index ? pc.b + 1 : pc.b;
          if (Object.prototype.hasOwnProperty.call(gs, pc.guid)) {
            next.push(Object.assign({}, pc, { guid: pc.guid + '#1', a: a, b: sp.index, srcTo: gs[pc.guid] }));
            next.push(Object.assign({}, pc, { guid: pc.guid + '#2', a: sp.index, b: b, srcFrom: gs[pc.guid] }));
          } else next.push(Object.assign({}, pc, { a: a, b: b }));
        });
        pieces = next;
      }
    }
    return { lines: lines, pieces: pieces };
  }

  function spanOf(state, pc) { var L = state.lines[pc.spanAxis]; return Math.abs(L[pc.b] - L[pc.a]); }

  // ── the check (the ONLY rule path) ─────────────────────────────────────────────────────────────────────────────
  function check(span, mat, depth) {
    var rule = ruleFor(mat); if (!rule) return null;
    var r = SW.swCheckGirder(span, { material: mat, proposedDepth: depth == null ? undefined : depth });
    r.maxSpan = rule.maxBeamSpan; r.depthRatio = rule.depthRatio;
    return r;
  }
  function fmt(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function message(r) {
    if (r.signal === 'RED') return 'Limit for this column span (' + r.maxSpan + ' m, ' + r.material + '). Add one more? ' + PRELIM;
    if (r.signal === 'ORANGE') return 'Span ' + fmt(r.span) + ' m needs a beam depth of at least ' + fmt(r.requiredDepth) + ' m (span/' + r.depthRatio + ', ' + r.material + '). ' + PRELIM;
    return 'OK — span ' + fmt(r.span) + ' m (' + r.material + '). ' + PRELIM;
  }
  var RANK = { GREEN: 0, ORANGE: 1, RED: 2 };

  // Preview a drag of line `index` on `axis` by `delta` (on top of the current fold). Affected = pieces whose span
  // runs between that line and another (a girder ALONG the dragged line translates; its span is unchanged).
  function preview(info, ops, cursor, axis, index, delta, mat, depth) {
    var st = fold(info, ops, cursor);
    var after = { lines: { x: st.lines.x.slice(), y: st.lines.y.slice() }, pieces: st.pieces };
    after.lines[axis][index] += delta;
    var out = [];
    st.pieces.forEach(function (pc) {
      if (pc.spanAxis !== axis || (pc.a !== index && pc.b !== index)) return;
      var span0 = spanOf(st, pc), span1 = spanOf(after, pc);
      var r = check(span1, mat, depth); if (!r) return;
      var L = after.lines[axis];
      out.push({ guid: pc.guid, spanAxis: pc.spanAxis, a: pc.a, b: pc.b, onAxis: pc.onAxis, onDatum: pc.onDatum, onPos: after.lines[pc.onAxis][pc.onIdx],
                 u0: Math.min(L[pc.a], L[pc.b]), u1: Math.max(L[pc.a], L[pc.b]), span0: span0, span: span1, signal: r.signal,
                 requiredDepth: r.requiredDepth, maxSpan: r.maxSpan, depthRatio: r.depthRatio, message: message(r), srcFrom: pc.srcFrom });
    });
    var bays = {};
    out.forEach(function (pc) {
      var k = pc.a + '-' + pc.b; var b = bays[k] || (bays[k] = { a: pc.a, b: pc.b, n: 0, span0: pc.span0, span: pc.span, signal: 'GREEN', pieces: [] });
      b.n++; b.pieces.push(pc); if (RANK[pc.signal] > RANK[b.signal]) b.signal = pc.signal;
    });
    var list = Object.keys(bays).map(function (k) { return bays[k]; });
    var worst = list.reduce(function (w, b) { return (!w || RANK[b.signal] > RANK[w.signal] || (RANK[b.signal] === RANK[w.signal] && b.span > w.span)) ? b : w; }, null);
    return { axis: axis, index: index, delta: delta, pieces: out, bays: list, worst: worst, lines: after.lines };
  }

  // Largest |delta| in the drag's direction at which no affected bay exceeds the limit (Cancel keeps the drag stopped here).
  function clampDelta(info, ops, cursor, axis, index, delta, mat, depth) {
    var p0 = preview(info, ops, cursor, axis, index, 0, mat, depth); if (!p0.pieces.length) return delta;
    var rule = ruleFor(mat); if (!rule) return delta;
    var lim = delta;
    p0.pieces.forEach(function (pc) {
      var dir = (pc.a === index) ? -1 : 1;                 // line `index` is the LOW end (a) -> moving negative widens; HIGH end (b) -> moving positive widens
      var room = Math.max(0, rule.maxBeamSpan - pc.span0); // metres of widening left before the table limit
      if (dir * delta > 0 && Math.abs(delta) > room && room < Math.abs(lim)) lim = Math.sign(delta) * room;
    });
    return lim;
  }

  return { TAG: TAG, PRELIM: PRELIM, ruleFor: ruleFor, readMaterial: readMaterial, fold: fold, spanOf: spanOf, check: check,
           message: message, preview: preview, clampDelta: clampDelta, RANK: RANK };
});
