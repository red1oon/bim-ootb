// Implements prompts/PDF2BIM_VECTOR_PROBE.md §41 — port of scripts/pdf2bim/tag_reader.py (§36: which of these candidate strings is drawn in this tag cell? Compares ink with ink, in mm). Pure; UMD: window.Pdf2DxfTR.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./py_rt.js')); else root.Pdf2DxfTR = factory(root.Pdf2DxfRt); })(typeof self !== 'undefined' ? self : this, function (RT) {
  'use strict';
  const CLAMP = 18.0, STEP = 4.3, BUCKET = 18.0;
  // Python round(x/2) (half to even) as an int key, '//' as float floor division
  class Cell {
    constructor(ink) { this.ink = ink; this.D = new Map(); this.c = new Map(); this.g = new Map(); for (const p of ink) { const k = RT.floordiv(p[0], BUCKET) + ',' + RT.floordiv(p[1], BUCKET); if (!this.g.has(k)) this.g.set(k, []); this.g.get(k).push(p); } }
    d(x, y) {
      const k = RT.pyRoundInt(x / 2) + ',' + RT.pyRoundInt(y / 2); const v = this.D.get(k); if (v !== undefined) return v;
      const i = RT.floordiv(x, BUCKET), j = RT.floordiv(y, BUCKET); let b = CLAMP;
      for (let a = i - 1; a < i + 2; a++) for (let c = j - 1; c < j + 2; c++) { const l = this.g.get(a + ',' + c); if (!l) continue; for (const p of l) { const e = RT.hypot(p[0] - x, p[1] - y); if (e < b) b = e; } }
      this.D.set(k, b); return b;
    }
    cost(ch, x, A) {
      const k = ch + '|' + x; const v = this.c.get(k); if (v) return v;
      const X = x * STEP; let best = null; const S = A.get(ch);
      for (let i = 0; i < S.length; i++) {
        const pts = S[i];
        for (const dy of [-STEP, 0, STEP]) { const f = RT.pySum(pts.map(([a, b]) => this.d(X + a, b + dy))) / pts.length; if (best === null || f < best[0]) best = [f, i, dy]; }
      }
      this.c.set(k, best); return best;
    }
  }
  function score(cell, st, A) {
    // mm: the string placed glyph by glyph where it fits best, template to ink plus ink to template. null if a character has no sample: unjudgeable, not a bad score.
    const chars = Array.from(st);
    if (!cell.ink.length || chars.some(c => !A.get(c) || !A.get(c).length)) return null;
    let F = new Map(); for (let x = 0; x < 36; x++) F.set(x, [0.0, []]);
    for (const ch of chars) {
      const N = new Map();
      for (const [x, [c0, path]] of F) {
        const [f, i, dy] = cell.cost(ch, x, A); const pts = A.get(ch)[i]; const w = Math.max(...pts.map(q => q[0])); const e = c0 + f; const np = path.concat([[x * STEP, pts, dy]]);
        for (let adv = 1; adv < 6; adv++) { const nx = x + RT.pyRoundInt(w / STEP) + adv; if (!N.has(nx) || e < N.get(nx)[0]) N.set(nx, [e, np]); }
      }
      F = N;
    }
    let bestv = null; for (const v of F.values()) if (bestv === null || v[0] < bestv[0]) bestv = v;
    const [c, p] = bestv; const placed = []; for (const [x, pts, dy] of p) for (const [a, b] of pts) placed.push([x + a, b + dy]);
    const pm = new Cell(placed); const x0 = p[0][0]; const x1 = Math.max(...placed.map(q => q[0])); const rv = [];
    for (const [a, b] of cell.ink) if (x0 - 4 <= a && a <= x1 + 4) rv.push(pm.d(a, b));
    return c / chars.length + (rv.length ? RT.pySum(rv) / rv.length : CLAMP);
  }
  function choose(ink, cands, A, read_max, margin, suffix) {
    suffix = suffix === undefined ? 'sqm' : suffix;
    const C = new Cell(ink); const r = cands.map(c => [score(C, c + suffix, A), c]);
    const un = r.filter(q => q[0] === null).map(q => q[1]); const kn = r.filter(q => q[0] !== null).sort((a, b) => RT.cmpT(a, b));
    if (!kn.length) return { value: null, score: null, next: null, next_score: null, unjudgeable: un };
    const nx = kn.length > 1 ? kn[1] : [null, null];
    const ok = !un.length && kn[0][0] <= read_max && (nx[0] === null || nx[0] - kn[0][0] >= margin);
    return { value: ok ? kn[0][1] : null, best: kn[0][1], score: RT.pyRound(kn[0][0], 2), next: nx[1], next_score: nx[0] === null ? null : RT.pyRound(nx[0], 2), unjudgeable: un };
  }
  return { Cell, score, choose };
});
