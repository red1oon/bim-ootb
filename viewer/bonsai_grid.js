// bonsai_grid.js — Bonsai architectural authoring grid: the "2D correlation" substrate.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 3 (2D grid overlay). In the VIEWER the column grid is
// DETECTED from a BIM db (grid_dims.js GridDims.detectGrids); in the MODELLER the grid is the INPUT
// you author against — define a column grid (A/B/C × 1/2/3), render it on the XY sketch plane, and
// SNAP sketch clicks to gridlines so every authored wall corner carries a grid reference (A-1, B-1…).
// This is the lean authoring counterpart to the shipped grid overlay; gridline-drag recomposition via
// grid_kinematics is a follow-on leg.
(function () {
  'use strict';
  const TAG = '§GRID';

  function labelSprite(text, x, y) {
    const THREE = window.THREE;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const cx = cv.getContext('2d'); cx.fillStyle = '#6fb0e8'; cx.font = 'bold 40px ui-monospace, monospace';
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.position.set(x, y, 0.02); sp.scale.set(0.6, 0.6, 1); return sp;
  }

  const Grid = {
    // xs/ys = gridline coordinates; xlabels/ylabels = their architectural refs (A.. / 1..).
    xs: [], ys: [], xlabels: [], ylabels: [], active: false, _group: null, snapTol: 0.4,

    define(spec) {
      spec = spec || {};
      this.xs = spec.xs || [0, 4, 8, 12];
      this.ys = spec.ys || [0, 3, 6];
      this.xlabels = spec.xlabels || this.xs.map((_, i) => String.fromCharCode(65 + i));   // A,B,C…
      this.ylabels = spec.ylabels || this.ys.map((_, i) => String(i + 1));                  // 1,2,3…
      if (this.snapTol == null && spec.snapTol) this.snapTol = spec.snapTol;
      console.log(TAG + ' define xs=[' + this.xs + '] ys=[' + this.ys + '] labels=' + this.xlabels.join('') + '/' + this.ylabels.join(''));
      if (this._group) this.render();
      return this;
    },

    render() {
      const THREE = window.THREE; if (!THREE || !window.A || !window.A.scene) return;
      if (!this.xs.length) this.define();
      if (!this._group) { this._group = new THREE.Group(); this._group.name = 'BonsaiGrid'; window.A.scene.add(this._group); }
      while (this._group.children.length) this._group.remove(this._group.children[0]);
      const mat = new THREE.LineBasicMaterial({ color: 0x35506e });
      const x0 = this.xs[0], x1 = this.xs[this.xs.length - 1], y0 = this.ys[0], y1 = this.ys[this.ys.length - 1];
      this.xs.forEach((x, i) => {
        this._group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, 0), new THREE.Vector3(x, y1, 0)]), mat));
        this._group.add(labelSprite(this.xlabels[i], x, y0 - 0.6));
      });
      this.ys.forEach((y, j) => {
        this._group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, 0), new THREE.Vector3(x1, y, 0)]), mat));
        this._group.add(labelSprite(this.ylabels[j], x0 - 0.6, y));
      });
      console.log(TAG + ' render lines=' + (this.xs.length + this.ys.length));
    },

    show(on) {
      this.active = on !== false;
      if (this.active) this.render(); else if (this._group) this._group.visible = false;
      if (this.active && this._group) this._group.visible = true;
      return this.active;
    },

    _nearest(v, arr) {
      let bi = 0, bd = Infinity;
      arr.forEach((a, i) => { const d = Math.abs(a - v); if (d < bd) { bd = d; bi = i; } });
      return { i: bi, d: bd, v: arr[bi] };
    },

    // Snap a point to the nearest gridlines (independently per axis, within snapTol). Returns the
    // snapped coords + the architectural grid reference of any axis that snapped (the 2D correlation).
    snap(x, y) {
      if (!this.active || !this.xs.length) return { x, y, ref: null, snappedX: false, snappedY: false };
      const nx = this._nearest(x, this.xs), ny = this._nearest(y, this.ys);
      const sx = nx.d <= this.snapTol, sy = ny.d <= this.snapTol;
      const ox = sx ? nx.v : x, oy = sy ? ny.v : y;
      const ref = (sx ? this.xlabels[nx.i] : '·') + '-' + (sy ? this.ylabels[ny.i] : '·');
      return { x: ox, y: oy, ref, snappedX: sx, snappedY: sy };
    },

    // Which gridlines does a coordinate lie on (exact)? Used to report a wall's grid correlation.
    refAt(x, y, tol) {
      tol = tol || 1e-6;
      const xi = this.xs.findIndex(a => Math.abs(a - x) <= tol);
      const yi = this.ys.findIndex(a => Math.abs(a - y) <= tol);
      return { x: xi >= 0 ? this.xlabels[xi] : null, y: yi >= 0 ? this.ylabels[yi] : null };
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.grid = Grid;
  console.log(TAG + ' module loaded');
})();
