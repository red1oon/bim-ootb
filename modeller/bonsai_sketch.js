// bonsai_sketch.js — Bonsai 2D sketch front (host side): a planegcs-solved profile drives an extrude.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 2 leg 2 (interactive sketch UI). The FreeCAD constraint solver
// (planegcs, LGPL) runs in-browser on the main thread; roughly-clicked points are cleaned up by auto
// horizontal/vertical constraints, then the SOLVED polygon is authored as a GEOM_EXTRUDE_POLY op-row
// through the SAME worker kernel as the rest of the modeller (this is the front of W-SKETCH-SOLVE, in-viewer).
(function () {
  'use strict';
  const TAG = '§SKETCH';
  const _base = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : location.href;

  const Sketch = {
    points: [],          // [{ id, x, y }] in sketch-plane (XY) coords, in click order
    dims: {},            // { 0: number, 1: number, angle: number(deg) } — user-pinned edge lengths (rect/
                          // square mode only, edges 0/1 are the two independent dimensions; ∥/eq constraints
                          // carry 2→0, 3→1) + an optional corner angle override (default 90°, l2l_angle_ll).
    weld: {},            // { pointIndex: targetPointIndex } — a click that landed near an EARLIER point in
                          // THIS sketch is pinned p2p_coincident to it (a real solver constraint, tracks the
                          // target's SOLVED position through later edits) instead of a near-duplicate point.
    WELD_TOL: 0.4,       // same value as bonsai_grid.js's own snapTol — one shared "close enough" convention.
    // Circle primitive (BONSAI_KERNEL_RESEARCH.md §Follow-up spec — circle/arc sketch primitive — Witness:
    // W-E2E-SKETCH-CIRCLE): a REAL geometric-primitive list alongside the point-ring, NOT a repurposing of
    // it (a circle isn't a closed point loop). Placement = the standard CAD convention: click sets CENTER,
    // then a second click (distance center→click) OR a typed #dim-radius value sets the radius. A lone
    // circle has nothing to constrain against, so it does NOT round-trip through planegcs (tangent/
    // circle_radius solver wiring is the explicitly deferred next increment). The arc sibling landed as
    // the next increment (W-E2E-SKETCH-ARC, below).
    circles: [],         // [{ id, cx, cy, r }] committed circles, in placement order
    pendingCircle: null, // { cx, cy } — center clicked, radius not yet set
    // Arc primitive (BONSAI_KERNEL_RESEARCH.md §Follow-up spec — circle/arc sketch primitive, arc leg —
    // Witness: W-E2E-SKETCH-ARC): FreeCAD Sketcher's "Arc by center" convention, deliberately the SAME
    // gesture shape as circle above — click 1 = CENTER (same as circle's click 1), click 2 = START point
    // (radius = distance center→click, same maths as circle's click 2), click 3 = END point where ONLY the
    // DIRECTION matters (its distance from center is IGNORED — the radius stays what click 2 set, matching
    // FreeCAD's actual behavior). Angles are RADIANS via Math.atan2 (kernel convention, same as
    // GEOM_REVOLVE's angleRad — NOT the degree convention of the unrelated dims.angle field above).
    // A lone arc, like a lone circle, has nothing to constrain against → no planegcs round-trip.
    arcs: [],            // [{ id, cx, cy, r, startAngle, endAngle }] committed arcs, in placement order
    pendingArc: null,    // { cx, cy } center clicked · then { cx, cy, r, startAngle } start clicked · commit on end click
    _gcs: null,
    AXIS_TOL: 0.35,      // |dy| < AXIS_TOL*|dx| ⇒ treat edge as horizontal (and vice-versa)
    mode: 'axis',        // constraint intent: 'axis' (per-edge H/V) | 'rect' (∥ + ⊥) | 'square' (rect + equal sides) | 'circle' (center+radius primitive) | 'arc' (center+start+end primitive)
    MODES: ['axis', 'rect', 'square', 'circle', 'arc'],
    setMode(m) { if (this.MODES.includes(m)) this.mode = m; return this.mode; },
    cycleMode() { this.mode = this.MODES[(this.MODES.indexOf(this.mode) + 1) % this.MODES.length]; return this.mode; },
    setDimension(i, value) { this.dims[i] = +value; },
    setAngle(deg) { this.dims.angle = +deg; },
    clearDims() { this.dims = {}; },

    async _ensure() {
      if (!this._gcs) {
        const mod = await import(new URL('lib/planegcs/index.js', _base).href);
        this._gcs = await mod.make_gcs_wrapper(new URL('lib/planegcs/planegcs_dist/planegcs.wasm', _base).href);
        console.log(TAG + ' solver ready');
      }
      return this._gcs;
    },

    reset() { this.points = []; this.dims = {}; this.weld = {}; this.circles = []; this.pendingCircle = null; this.arcs = []; this.pendingArc = null; },
    addPoint(x, y) { this.points.push({ id: 'p' + this.points.length, x: +x, y: +y }); return this.points.length; },

    // ── Circle placement (mode 'circle') — standard CAD center-then-radius convention ──────────────────
    // First click = center (pending); second click = radius as the Euclidean distance center→click.
    addCirclePoint(x, y) {
      if (!this.pendingCircle) { this.pendingCircle = { cx: +x, cy: +y }; return { state: 'center', cx: +x, cy: +y }; }
      return this.commitCircleRadius(Math.hypot(+x - this.pendingCircle.cx, +y - this.pendingCircle.cy));
    },
    commitCircleRadius(r) {
      if (!this.pendingCircle || !(r > 0)) return null;
      const c = { id: 'c' + this.circles.length, cx: this.pendingCircle.cx, cy: this.pendingCircle.cy, r: +r };
      this.circles.push(c); this.pendingCircle = null;
      console.log(TAG + ' circle committed id=' + c.id + ' center=(' + c.cx.toFixed(3) + ',' + c.cy.toFixed(3) + ') r=' + c.r.toFixed(3));
      return { state: 'committed', circle: c };
    },
    // Typed #dim-radius path: commits the pending circle at exactly r, or retro-edits the most recent one.
    setCircleRadius(r) {
      if (!(r > 0)) return null;
      if (this.pendingCircle) return this.commitCircleRadius(+r);
      const last = this.circles[this.circles.length - 1];
      if (!last) return null;
      last.r = +r;
      console.log(TAG + ' circle radius set id=' + last.id + ' r=' + last.r.toFixed(3));
      return { state: 'committed', circle: last };
    },

    // ── Arc placement (mode 'arc') — FreeCAD Sketcher "Arc by center": center, start, end ─────────────────
    // Click 1 = center; click 2 = start point (radius = distance center→click, startAngle = its direction);
    // click 3 = end point — DIRECTION ONLY (distance from center IGNORED, the radius stays click 2's).
    addArcPoint(x, y) {
      x = +x; y = +y;
      if (!this.pendingArc) { this.pendingArc = { cx: x, cy: y }; return { state: 'center', cx: x, cy: y }; }
      const p = this.pendingArc;
      if (p.r == null) {
        const r = Math.hypot(x - p.cx, y - p.cy);
        if (!(r > 0)) return null;                               // start click ON the center — no direction, ignore
        p.r = r; p.startAngle = Math.atan2(y - p.cy, x - p.cx);
        return { state: 'start', cx: p.cx, cy: p.cy, r: p.r, startAngle: p.startAngle };
      }
      const endAngle = Math.atan2(y - p.cy, x - p.cx);            // click 3's direction only — distance ignored
      const a = { id: 'a' + this.arcs.length, cx: p.cx, cy: p.cy, r: p.r, startAngle: p.startAngle, endAngle };
      this.arcs.push(a); this.pendingArc = null;
      console.log(TAG + ' arc committed id=' + a.id + ' center=(' + a.cx.toFixed(3) + ',' + a.cy.toFixed(3) + ') r=' + a.r.toFixed(3) +
        ' startAngle=' + a.startAngle.toFixed(4) + ' endAngle=' + a.endAngle.toFixed(4));
      return { state: 'committed', arc: a };
    },

    // Same as addPoint, but if (x,y) lands within WELD_TOL of an EARLIER point already in this sketch, pin
    // the new point p2p_coincident to that one (BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2) — the
    // standard CAD-sketch "click near an existing vertex to weld onto it" convention, instead of silently
    // adding a near-duplicate point a few cm off. Returns the new count + the welded-to index (or null).
    addPointWeld(x, y, tol) {
      tol = tol == null ? this.WELD_TOL : tol;
      let target = null, bestD = Infinity;
      for (let i = 0; i < this.points.length; i++) {
        const d = Math.hypot(this.points[i].x - x, this.points[i].y - y);
        if (d <= tol && d < bestD) { bestD = d; target = i; }
      }
      const idx = this.points.length;
      this.points.push({ id: 'p' + idx, x: +x, y: +y });
      if (target != null) this.weld[idx] = target;
      return { count: this.points.length, weldedTo: target };
    },

    // Classify each ring edge as horizontal / vertical from the clicked deltas, so the solver snaps
    // a hand-drawn quad to clean axis-aligned edges (minimal-movement solution).
    _autoConstraints() {
      const n = this.points.length, cons = [];
      for (let i = 0; i < n; i++) {
        const a = this.points[i], b = this.points[(i + 1) % n];
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        if (dy <= this.AXIS_TOL * dx) cons.push({ id: 'h' + i, type: 'horizontal_pp', p1_id: a.id, p2_id: b.id });
        else if (dx <= this.AXIS_TOL * dy) cons.push({ id: 'v' + i, type: 'vertical_pp', p1_id: a.id, p2_id: b.id });
      }
      return cons;
    },

    // Richer constraints (the planegcs shoulders): treat each ring edge as a LINE primitive, then express
    // GEOMETRIC INTENT over those lines — opposite edges PARALLEL, adjacent edges PERPENDICULAR (mode 'rect'),
    // plus EQUAL_LENGTH of two adjacent edges (mode 'square'). Only the H/V mode used point-pair constraints;
    // these use the line + parallel/perpendicular_ll/equal_length family (we previously wired just 2 of ~60).
    // Returns { lines, constraints } so solve() can push both. Falls back to axis for non-quad rings.
    // Weld constraints apply regardless of shape-intent mode — a click landing near an earlier point means
    // "pin these together," independent of whether the rest of the ring is axis/rect/square.
    _weldConstraints() {
      const cons = [];
      for (const i in this.weld) {
        const j = this.weld[i];
        cons.push({ id: 'weld' + i, type: 'p2p_coincident', p1_id: this.points[i].id, p2_id: this.points[j].id });
      }
      return cons;
    },

    _buildConstraints() {
      const n = this.points.length;
      // Circle/arc modes bypass the point-ring solver machinery entirely — a lone circle/arc has nothing
      // to constrain against (tangent/circle_radius solver wiring is the deferred follow-up increment).
      if (this.mode === 'circle' || this.mode === 'arc') return { lines: [], constraints: [] };
      if (this.mode === 'axis' || n !== 4) return { lines: [], constraints: this._autoConstraints().concat(this._weldConstraints()) };
      const lines = [];
      for (let i = 0; i < n; i++) lines.push({ id: 'L' + i, type: 'line', p1_id: this.points[i].id, p2_id: this.points[(i + 1) % n].id });
      const cons = [
        { id: 'par02', type: 'parallel', l1_id: 'L0', l2_id: 'L2' },        // opposite edges parallel
        { id: 'par13', type: 'parallel', l1_id: 'L1', l2_id: 'L3' }
      ];
      // Corner angle L0/L1 — a parallelogram in general (par02+par13 alone), a RECTANGLE when this angle is
      // 90°. Was hardcoded `perpendicular_ll` (rigidly 90° only); now `l2l_angle_ll` with a typed override
      // (BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2) — the same "one right angle ⇒ all four (with
      // the ∥ pair)" geometric fact still holds for ANY pinned angle, not just 90°, on a closed quad.
      // ⚠ Found+fixed live: l2l_angle_ll's own "angle" measures L0/L1's direction vectors (p1_id→p2_id,
      // i.e. L0=p0->p1, L1=p1->p2) as rays from a common origin — the TURN angle, not the polygon's
      // INTERIOR corner angle a user means by "70° corner." They're supplementary (turn = 180 - interior),
      // identical only at 90° (why this was invisible until a non-90° value was actually typed and
      // measured independently — confirmed empirically: typing 70 produced a measured 110° corner before
      // this fix). Complement here so the USER-FACING angle is the intuitive interior one.
      const angleDeg = this.dims.angle != null ? this.dims.angle : 90;
      const turnAngleDeg = 180 - angleDeg;
      cons.push({ id: 'ang01', type: 'l2l_angle_ll', l1_id: 'L0', l2_id: 'L1', angle: turnAngleDeg * Math.PI / 180 });
      if (this.mode === 'square') cons.push({ id: 'eq01', type: 'equal_length', l1_id: 'L0', l2_id: 'L1' });
      // Explicit dimension pins — the real "drag/type one dimension, everything else updates" primitive
      // (BONSAI_KERNEL_RESEARCH.md §GAP-TO-COMPETITIVE Tier 2, p2p_distance). Only edges 0/1 are independent
      // here: edge 2 follows edge 0 via par02, edge 3 follows edge 1 via par13 (and in 'square' mode eq01
      // ties edge 1 to edge 0 too, so pinning either pins both).
      for (const i of [0, 1]) {
        if (this.dims[i] != null) {
          const a = this.points[i], b = this.points[(i + 1) % n];
          cons.push({ id: 'dim' + i, type: 'p2p_distance', p1_id: a.id, p2_id: b.id, distance: this.dims[i] });
        }
      }
      return { lines, constraints: cons.concat(this._weldConstraints()) };
    },

    async solve() {
      if (this.points.length < 3) throw new Error('need >=3 points to solve a profile');
      const gcs = await this._ensure();
      gcs.clear_data();
      // p0 is the fixed anchor; the rest are free for the solver to clean up.
      this.points.forEach((p, i) => gcs.push_primitive({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: i === 0 }));
      const built = this._buildConstraints();
      built.lines.forEach(l => gcs.push_primitive(l));         // line primitives must precede the constraints that reference them
      built.constraints.forEach(c => gcs.push_primitive(c));
      const status = gcs.solve();
      gcs.apply_solution();
      const solved = this.points.map(p => { const s = gcs.sketch_index.get_sketch_point(p.id); return { x: s.x, y: s.y }; });
      const n = solved.length, edgeLengths = [];
      for (let i = 0; i < n; i++) {
        const a = solved[i], b = solved[(i + 1) % n];
        edgeLengths.push(Math.hypot(b.x - a.x, b.y - a.y));
      }
      // Corner angle at p1 (between L0=p0->p1 and L1=p1->p2), degrees — for UI prefill/display. Independent
      // of the constraint machinery above (plain vector maths on the SOLVED points), not re-derived from dims.
      let cornerAngleDeg = null;
      if (n === 4) {
        const v01 = [solved[1].x - solved[0].x, solved[1].y - solved[0].y];
        const v12 = [solved[2].x - solved[1].x, solved[2].y - solved[1].y];
        const dot = v01[0] * v12[0] + v01[1] * v12[1], cr = v01[0] * v12[1] - v01[1] * v12[0];
        cornerAngleDeg = Math.atan2(Math.abs(cr), -dot) * 180 / Math.PI;   // interior angle at p1, 0-180
      }
      // Solve cleans up the rough clicked points — write the solved coords back so the NEXT solve (e.g. after
      // a dimension edit) starts from the current shape, and so callers can redraw the live/updated ring.
      solved.forEach((p, i) => { this.points[i].x = p.x; this.points[i].y = p.y; });
      console.log(TAG + ' solve mode=' + this.mode + ' status=' + status + ' pts=' + solved.length +
        ' lines=' + built.lines.length + ' constraints=' + built.constraints.length +
        ' dims=' + JSON.stringify(this.dims) + ' edgeLengths=[' + edgeLengths.map(x => x.toFixed(3)).join(',') +
        ']' + (cornerAngleDeg != null ? ' cornerAngleDeg=' + cornerAngleDeg.toFixed(3) : ''));
      return { status, points: solved, constraints: built.constraints.length, mode: this.mode, edgeLengths, cornerAngleDeg };
    },

    // Solve the sketch, then author the solved profile as a real solid in A.scene via the worker kernel.
    async solveAndExtrude(depth, opts) {
      depth = depth || 3;
      const r = await this.solve();
      const pts = r.points.map(p => [p.x, p.y]);
      const res = await window.Bonsai.author(
        { op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: pts }, depth } },
        opts || { color: 0x9fb4c8 });
      // axis-aligned check: how many solved edges came out clean H/V (within a tight tol)
      let axisClean = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
        if (dx < 1e-3 || dy < 1e-3) axisClean++;
      }
      console.log(TAG + ' solveAndExtrude status=' + r.status + ' depth=' + depth + ' tris=' + res.triangleCount +
        ' bbox=[' + res.bbox + '] axisCleanEdges=' + axisClean + '/' + pts.length);
      return { solveStatus: r.status, axisClean, edges: pts.length, solved: r.points, ...res };
    },

    // Leg 3: commit the solved profile as a FEATURE in the op-log (vs solveAndExtrude's one-shot author).
    async commitExtrude(depth, opts) {
      depth = depth || 3;
      // Circle profile: the payload carries profile.circle {cx,cy,r} as a SIBLING key to profile.points
      // (same convention as the other leaf ops' payload extensions), consumed by the GEOM_EXTRUDE_POLY
      // handler's makeCircleEdge branch in bonsai_kernel_worker.js. No planegcs round-trip needed.
      if (this.mode === 'circle') {
        const c = this.circles[this.circles.length - 1];
        if (!c) throw new Error('no circle to extrude — click a centre, then set the radius');
        const res = await window.Bonsai.oplog.commit(
          { op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { circle: { cx: c.cx, cy: c.cy, r: c.r } }, depth } },
          opts || { color: 0x9fd6b4 });
        console.log(TAG + ' commitExtrude circle center=(' + c.cx.toFixed(3) + ',' + c.cy.toFixed(3) + ') r=' + c.r.toFixed(3) +
          ' depth=' + depth + ' tris=' + res.triangleCount);
        return { solveStatus: 'circle', solved: [], ...res };
      }
      // Arc profile (W-E2E-SKETCH-ARC): payload carries profile.arc {cx,cy,r,startAngle,endAngle} as a
      // SIBLING key to profile.points/profile.circle. A lone arc is an OPEN curve — the kernel handler
      // closes it as the circular SECTOR (pie slice) center→start line + arc + end→center line, the only
      // closure that uses ONLY the 3 authored points (a chord closure would silently discard the center).
      if (this.mode === 'arc') {
        const a = this.arcs[this.arcs.length - 1];
        if (!a) throw new Error('no arc to extrude — click center, start, then end');
        const res = await window.Bonsai.oplog.commit(
          { op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { arc: { cx: a.cx, cy: a.cy, r: a.r, startAngle: a.startAngle, endAngle: a.endAngle } }, depth } },
          opts || { color: 0x9fd6b4 });
        console.log(TAG + ' commitExtrude arc center=(' + a.cx.toFixed(3) + ',' + a.cy.toFixed(3) + ') r=' + a.r.toFixed(3) +
          ' startAngle=' + a.startAngle.toFixed(4) + ' endAngle=' + a.endAngle.toFixed(4) +
          ' depth=' + depth + ' tris=' + res.triangleCount);
        return { solveStatus: 'arc', solved: [], ...res };
      }
      const r = await this.solve();
      const pts = r.points.map(p => [p.x, p.y]);
      const res = await window.Bonsai.oplog.commit(
        { op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: pts }, depth } },
        opts || { color: 0x9fd6b4 });
      return { solveStatus: r.status, solved: r.points, ...res };
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.sketch = Sketch;
  console.log(TAG + ' module loaded');
})();
