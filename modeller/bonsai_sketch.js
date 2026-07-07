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
    dims: {},            // { 0: number, 1: number } — user-pinned edge lengths (rect/square mode only,
                          // edges 0/1 are the two independent dimensions; ∥/eq constraints carry 2→0, 3→1)
    _gcs: null,
    AXIS_TOL: 0.35,      // |dy| < AXIS_TOL*|dx| ⇒ treat edge as horizontal (and vice-versa)
    mode: 'axis',        // constraint intent: 'axis' (per-edge H/V) | 'rect' (∥ + ⊥) | 'square' (rect + equal sides)
    MODES: ['axis', 'rect', 'square'],
    setMode(m) { if (this.MODES.includes(m)) this.mode = m; return this.mode; },
    cycleMode() { this.mode = this.MODES[(this.MODES.indexOf(this.mode) + 1) % this.MODES.length]; return this.mode; },
    setDimension(i, value) { this.dims[i] = +value; },
    clearDims() { this.dims = {}; },

    async _ensure() {
      if (!this._gcs) {
        const mod = await import(new URL('lib/planegcs/index.js', _base).href);
        this._gcs = await mod.make_gcs_wrapper(new URL('lib/planegcs/planegcs_dist/planegcs.wasm', _base).href);
        console.log(TAG + ' solver ready');
      }
      return this._gcs;
    },

    reset() { this.points = []; this.dims = {}; },
    addPoint(x, y) { this.points.push({ id: 'p' + this.points.length, x: +x, y: +y }); return this.points.length; },

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
    _buildConstraints() {
      const n = this.points.length;
      if (this.mode === 'axis' || n !== 4) return { lines: [], constraints: this._autoConstraints() };
      const lines = [];
      for (let i = 0; i < n; i++) lines.push({ id: 'L' + i, type: 'line', p1_id: this.points[i].id, p2_id: this.points[(i + 1) % n].id });
      const cons = [
        { id: 'par02', type: 'parallel', l1_id: 'L0', l2_id: 'L2' },        // opposite edges parallel
        { id: 'par13', type: 'parallel', l1_id: 'L1', l2_id: 'L3' },
        { id: 'perp01', type: 'perpendicular_ll', l1_id: 'L0', l2_id: 'L1' } // one right angle ⇒ all four (with the ∥ pair)
      ];
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
      return { lines, constraints: cons };
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
      // Solve cleans up the rough clicked points — write the solved coords back so the NEXT solve (e.g. after
      // a dimension edit) starts from the current shape, and so callers can redraw the live/updated ring.
      solved.forEach((p, i) => { this.points[i].x = p.x; this.points[i].y = p.y; });
      console.log(TAG + ' solve mode=' + this.mode + ' status=' + status + ' pts=' + solved.length +
        ' lines=' + built.lines.length + ' constraints=' + built.constraints.length +
        ' dims=' + JSON.stringify(this.dims) + ' edgeLengths=[' + edgeLengths.map(x => x.toFixed(3)).join(',') + ']');
      return { status, points: solved, constraints: built.constraints.length, mode: this.mode, edgeLengths };
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
