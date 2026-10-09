// Canonical CPU layer-stack fold: premultiplied alpha, per-layer blend mode / opacity / mask, W3C compositing.
// Rules for canonical code: only + - * / and Math.sqrt (IEEE-exact), every intermediate through Math.fround.
// Op-log entries are plain JSON; a SHA-256 hash chain makes tampering and reordering detectable.
(function (root) {
  const F = Math.fround;
  const MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'difference', 'exclusion'];

  // ---------- pure-JS SHA-256 (works in Node and non-secure browser pages) ----------
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function sha256(data) {
    const u8 = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data);
    const l = u8.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(u8); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; w[i] = (w[i-16] + (rr(a,7)^rr(a,18)^(a>>>3)) + w[i-7] + (rr(b,17)^rr(b,19)^(b>>>10))) >>> 0; }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e&f)^(~e&g)) + K[i] + w[i]) >>> 0, t2 = ((rr(a,2)^rr(a,13)^rr(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      H[0]+=a;H[1]+=b;H[2]+=c;H[3]+=d;H[4]+=e;H[5]+=f;H[6]+=g;H[7]+=h;
    }
    return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
  }

  // ---------- hash-chained op-log ----------
  const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
  function chain(ops) { let prev = '0'.repeat(64); return ops.map((op, n) => { const h = sha256(prev + canon(op)); const e = { n, op, prev, h }; prev = h; return e; }); }
  function verifyChain(log) { let prev = '0'.repeat(64); for (let n = 0; n < log.length; n++) { const e = log[n]; if (e.n !== n || e.prev !== prev || e.h !== sha256(prev + canon(e.op))) return n; prev = e.h; } return -1; }

  // ---------- scene generation (seeded, ops are JSON-safe) ----------
  function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  const r4 = (x) => Math.round(x * 1e4) / 1e4;   // keep op params short & exactly representable in JSON
  function makeScene(seed, W) {
    const rnd = rng(seed), ops = [{ op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [0.62, 0.55, 0.48], a: 1 }];
    for (let i = 0; i < 25; i++) ops.push({ op: 'dab', layer: 0, x: r4(rnd()*W), y: r4(rnd()*W), r: r4(6+rnd()*W*0.2), c: [r4(rnd()),r4(rnd()),r4(rnd())], a: r4(0.2+rnd()*0.7) });
    MODES.slice(1).forEach((m, k) => {
      const id = k + 1, masked = k % 3 === 0;
      ops.push({ op: 'layer', id, mode: m, opacity: r4(0.4 + rnd()*0.6), mask: masked });
      for (let i = 0; i < 40; i++) ops.push({ op: 'dab', layer: id, x: r4(rnd()*W), y: r4(rnd()*W), r: r4(5+rnd()*W*0.18), c: [r4(rnd()),r4(rnd()),r4(rnd())], a: r4(0.15+rnd()*0.8) });
      if (masked) for (let i = 0; i < 14; i++) ops.push({ op: 'mdab', layer: id, x: r4(rnd()*W), y: r4(rnd()*W), r: r4(8+rnd()*W*0.25), v: [0, 1, 0.5][i % 3], a: r4(0.5+rnd()*0.5) });
    });
    ops.push({ op: 'set', layer: 3, opacity: 0.55 }, { op: 'set', layer: 5, mode: 'multiply' });   // order/edit sensitivity
    return ops;
  }
  function makeModeScene(mode, seed, W) {   // bg + one semi-transparent layer in `mode`
    const rnd = rng(seed), ops = [{ op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }];
    for (let i = 0; i < 60; i++) ops.push({ op: 'dab', layer: 0, x: r4(rnd()*W), y: r4(rnd()*W), r: r4(8+rnd()*W*0.25), c: [r4(rnd()),r4(rnd()),r4(rnd())], a: r4(0.5+rnd()*0.5) });
    ops.push({ op: 'layer', id: 1, mode, opacity: 0.8, mask: false });
    for (let i = 0; i < 60; i++) ops.push({ op: 'dab', layer: 1, x: r4(rnd()*W), y: r4(rnd()*W), r: r4(8+rnd()*W*0.25), c: [r4(rnd()),r4(rnd()),r4(rnd())], a: r4(0.1+rnd()*0.9) });
    return ops;
  }

  // ---------- blend functions (separable, W3C compositing-1) ----------
  const mul = (b, s) => F(b * s), scr = (b, s) => F(F(b + s) - F(b * s));
  const hardlight = (b, s) => s <= 0.5 ? mul(b, F(2 * s)) : scr(b, F(F(2 * s) - 1));
  const BLEND = {
    normal: (b, s) => s, multiply: mul, screen: scr,
    overlay: (b, s) => hardlight(s, b), 'hard-light': hardlight,
    darken: (b, s) => b < s ? b : s, lighten: (b, s) => b > s ? b : s,
    difference: (b, s) => F(Math.abs(F(b - s))), exclusion: (b, s) => F(F(b + s) - F(2 * F(b * s))),
    'soft-light': (b, s) => {
      if (s <= 0.5) return F(b - F(F(F(1 - F(2 * s)) * b) * F(1 - b)));
      const d = b <= 0.25 ? F(F(F(F(F(16 * b) - 12) * b) + 4) * b) : F(Math.sqrt(b));
      return F(b + F(F(F(2 * s) - 1) * F(d - b)));
    },
  };

  // ---------- fold ----------
  function newState(W) { return { W, order: [], L: {} }; }
  function apply(st, o) {
    const W = st.W;
    if (o.op === 'layer') { st.L[o.id] = { mode: o.mode, opacity: F(o.opacity), pix: new Float32Array(W*W*4), mask: o.mask ? new Float32Array(W*W).fill(1) : null }; st.order.push(o.id); return; }
    const l = st.L[o.layer];
    if (o.op === 'set') { if (o.mode) l.mode = o.mode; if (o.opacity !== undefined) l.opacity = F(o.opacity); return; }
    if (o.op === 'fill') { const a = F(o.a); for (let i = 0; i < W*W; i++) { l.pix[i*4] = F(F(o.c[0])*a); l.pix[i*4+1] = F(F(o.c[1])*a); l.pix[i*4+2] = F(F(o.c[2])*a); l.pix[i*4+3] = a; } return; }
    const r2 = F(o.r * o.r), x0 = Math.max(0, Math.floor(o.x - o.r)), x1 = Math.min(W-1, Math.ceil(o.x + o.r)), y0 = Math.max(0, Math.floor(o.y - o.r)), y1 = Math.min(W-1, Math.ceil(o.y + o.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = F(F(x + 0.5) - F(o.x)), dy = F(F(y + 0.5) - F(o.y)), d2 = F(F(dx*dx) + F(dy*dy));
      let t = F(1 - F(d2 / r2)); if (t <= 0) continue; t = F(t * t); const cov = F(F(o.a) * t), i = y*W + x;
      if (o.op === 'dab') {   // premultiplied source-over of a coloured dab onto the layer
        const ia = F(1 - cov);
        for (let k = 0; k < 3; k++) l.pix[i*4+k] = F(F(F(o.c[k]) * cov) + F(l.pix[i*4+k] * ia));
        l.pix[i*4+3] = F(cov + F(l.pix[i*4+3] * ia));
      } else if (o.op === 'mdab') l.mask[i] = F(l.mask[i] + F(F(F(o.v) - l.mask[i]) * cov));
    }
  }
  function fold(ops, W) { const st = newState(W); for (const o of ops) apply(st, o); return st; }
  // composite -> premultiplied backdrop Float32Array(W*W*4)
  function composite(st) {
    const W = st.W, back = new Float32Array(W*W*4);
    for (const id of st.order) {
      const l = st.L[id], bf = BLEND[l.mode];
      for (let i = 0; i < W*W; i++) {
        const la = l.pix[i*4+3]; if (la <= 0) continue;
        const as = F(la * F(l.opacity * (l.mask ? l.mask[i] : 1))); if (as <= 0) continue;
        const ab = back[i*4+3], oneMinusAb = F(1 - ab), oneMinusAs = F(1 - as);
        for (let k = 0; k < 3; k++) {
          const Cs = F(l.pix[i*4+k] / la), Cb = ab > 0 ? F(back[i*4+k] / ab) : 0, B = bf(Cb, Cs);
          back[i*4+k] = F(F(F(F(as * oneMinusAb) * Cs) + F(F(as * ab) * B)) + F(oneMinusAs * back[i*4+k]));
        }
        back[i*4+3] = F(F(as + ab) - F(as * ab));
      }
    }
    return back;
  }
  // premultiplied float -> straight RGBA8 (round to nearest)
  function toRGBA8(back) {
    const n = back.length / 4, out = new Uint8Array(n * 4), q = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
    for (let i = 0; i < n; i++) { const a = back[i*4+3]; for (let k = 0; k < 3; k++) out[i*4+k] = a > 0 ? q(F(back[i*4+k] / a)) : 0; out[i*4+3] = q(a); }
    return out;
  }
  const hashF32 = (f) => sha256(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
  function diff(a, b, alphaAware) {   // compare RGBA8 arrays; if alphaAware ignore RGB where both alpha==0
    let max = 0, sum = 0, over1 = 0, over2 = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 4; k++) {
      if (alphaAware && k < 3 && a[i+3] === 0 && b[i+3] === 0) continue;
      const d = Math.abs(a[i+k] - b[i+k]); if (d > max) max = d; sum += d; n++; if (d > 1) over1++; if (d > 2) over2++;
    }
    return { max, mean: +(sum / n).toFixed(4), pct_over_1: +(100*over1/n).toFixed(3), pct_over_2: +(100*over2/n).toFixed(3) };
  }
  const api = { MODES, sha256, chain, verifyChain, makeScene, makeModeScene, fold, newState, apply, composite, toRGBA8, hashF32, diff, BLEND };
  if (typeof module !== 'undefined') module.exports = api; else root.Stack = api;
})(this);
