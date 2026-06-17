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
    _gcs: null,
    AXIS_TOL: 0.35,      // |dy| < AXIS_TOL*|dx| ⇒ treat edge as horizontal (and vice-versa)

    async _ensure() {
      if (!this._gcs) {
        const mod = await import(new URL('lib/planegcs/index.js', _base).href);
        this._gcs = await mod.make_gcs_wrapper(new URL('lib/planegcs/planegcs_dist/planegcs.wasm', _base).href);
        console.log(TAG + ' solver ready');
      }
      return this._gcs;
    },

    reset() { this.points = []; },
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

    async solve() {
      if (this.points.length < 3) throw new Error('need >=3 points to solve a profile');
      const gcs = await this._ensure();
      gcs.clear_data();
      // p0 is the fixed anchor; the rest are free for the solver to clean up.
      this.points.forEach((p, i) => gcs.push_primitive({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: i === 0 }));
      const cons = this._autoConstraints();
      cons.forEach(c => gcs.push_primitive(c));
      const status = gcs.solve();
      gcs.apply_solution();
      const solved = this.points.map(p => { const s = gcs.sketch_index.get_sketch_point(p.id); return { x: s.x, y: s.y }; });
      console.log(TAG + ' solve status=' + status + ' pts=' + solved.length + ' constraints=' + cons.length);
      return { status, points: solved, constraints: cons.length };
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
