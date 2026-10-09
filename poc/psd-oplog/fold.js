// Canonical CPU fold of a raster op-log. Pure +,-,*,/ on IEEE floats (no Math.pow/exp/sin: those
// are not bit-exact across engines). f32=true rounds every step with Math.fround.
(function (root) {
  function makeOps(n, W, seed) {
    let s = seed >>> 0;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const modes = ['normal', 'multiply', 'screen'], ops = [];
    for (let i = 0; i < n; i++)
      ops.push({ x: rnd() * W, y: rnd() * W, r: 6 + rnd() * W * 0.18, c: [rnd(), rnd(), rnd()],
                 a: 0.15 + rnd() * 0.7, m: modes[i % 3] });
    return ops;
  }
  const blend = {
    normal: (b, s) => s,
    multiply: (b, s) => b * s,
    screen: (b, s) => b + s - b * s,
  };
  function foldCPU(ops, W, f32) {
    const F = f32 ? Math.fround : (x) => x;
    const buf = f32 ? new Float32Array(W * W * 3) : new Float64Array(W * W * 3);
    buf.fill(F(0.5));
    for (const o of ops) {
      const r2 = F(o.r * o.r), x0 = Math.max(0, Math.floor(o.x - o.r)), x1 = Math.min(W - 1, Math.ceil(o.x + o.r));
      const y0 = Math.max(0, Math.floor(o.y - o.r)), y1 = Math.min(W - 1, Math.ceil(o.y + o.r));
      const bf = blend[o.m];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = F(F(x + 0.5) - F(o.x)), dy = F(F(y + 0.5) - F(o.y));
        const d2 = F(F(dx * dx) + F(dy * dy));
        let t = F(1 - F(d2 / r2)); if (t <= 0) continue;
        t = F(t * t); const cov = F(F(o.a) * t), i = (y * W + x) * 3;
        for (let k = 0; k < 3; k++) {
          const b = buf[i + k], s = F(o.c[k]);
          buf[i + k] = F(b + F(F(bf(b, s) - b) * cov));
        }
      }
    }
    const out = new Uint8Array(W * W * 3);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.floor(buf[i] * 255 + 0.5)));
    return out;
  }
  function fnv(u8) { let h = 2166136261; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function diff(a, b) {
    let max = 0, sum = 0, over1 = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; sum += d; if (d > 1) over1++; }
    return { max, mean: +(sum / a.length).toFixed(4), pct_over_1_level: +(100 * over1 / a.length).toFixed(3) };
  }
  const api = { makeOps, foldCPU, fnv, diff };
  if (typeof module !== 'undefined') module.exports = api; else root.Fold = api;
})(this);
