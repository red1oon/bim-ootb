// PSD container: image resources (ICC profile = 1039, "untagged" flag = 1041), profile identification, and ops import.
// Parsing follows Adobe's PSD file-format spec directly; the pixel/layer decode is delegated to ag-psd.
(function (root) {
  const node = typeof require !== 'undefined', CM = node ? require('../icc/color_math.js') : root.ColorMath, S = node ? require('../stack.js') : root.Stack;
  const u32 = (b, o) => ((b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]) >>> 0, u16 = (b, o) => (b[o] << 8) | b[o+1];
  function sections(b) {   // header 26 bytes | color mode data | image resources | rest
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== '8BPS') throw new Error('not a PSD (bad signature)');
    if (u16(b, 4) !== 1) throw new Error('unsupported PSD version ' + u16(b, 4) + ' (PSB not handled)');
    const cmLen = u32(b, 26), resStart = 30 + cmLen, resLen = u32(b, resStart);
    return { header: { channels: u16(b, 12), height: u32(b, 14), width: u32(b, 18), depth: u16(b, 22), mode: u16(b, 24) }, cmEnd: resStart, resBodyStart: resStart + 4, resBodyEnd: resStart + 4 + resLen };
  }
  function readResources(b) {
    const sec = sections(b), res = new Map(), blocks = []; let o = sec.resBodyStart;
    while (o + 12 <= sec.resBodyEnd) {
      if (String.fromCharCode(b[o], b[o+1], b[o+2], b[o+3]) !== '8BIM') throw new Error('bad image resource signature at ' + o);
      const id = u16(b, o + 4), nameLen = b[o + 6], nameTotal = ((1 + nameLen) % 2) ? 2 + nameLen : 1 + nameLen, ds = o + 6 + nameTotal, size = u32(b, ds), dataStart = ds + 4, next = dataStart + size + (size % 2);
      res.set(id, b.slice(dataStart, dataStart + size)); blocks.push({ id, start: o, end: next }); o = next; }
    return { sec, res, blocks };
  }
  function meta(b) { const { sec, res } = readResources(b); return { ...sec.header, icc: res.get(1039) || null, untaggedFlag: res.has(1041) ? res.get(1041)[0] : null, resourceIds: [...res.keys()] }; }
  function setResource(b, id, data) {   // add or replace an image resource, keep everything else byte-identical
    const { sec, blocks } = readResources(b), nb = new Uint8Array(12 + data.length + (data.length % 2)); nb.set([0x38, 0x42, 0x49, 0x4d, id >> 8, id & 255, 0, 0]); // name = empty pascal string, padded
    new DataView(nb.buffer).setUint32(8, data.length); nb.set(data, 12); const keep = []; let body = [];
    for (const bl of blocks) if (bl.id !== id) body.push(b.slice(bl.start, bl.end)); body.push(nb);
    const total = body.reduce((a, x) => a + x.length, 0), out = new Uint8Array(sec.cmEnd + 4 + total + (b.length - sec.resBodyEnd)); out.set(b.slice(0, sec.cmEnd));
    new DataView(out.buffer).setUint32(sec.cmEnd, total); let p = sec.cmEnd + 4; for (const x of body) { out.set(x, p); p += x.length; } out.set(b.slice(sec.resBodyEnd), p); return out;
  }
  // ---- ICC profile parsing (just enough to identify matrix/TRC RGB profiles)
  const tag4 = (b, o) => String.fromCharCode(b[o], b[o+1], b[o+2], b[o+3]), s15 = (b, o) => ((b[o] << 24) | (b[o+1] << 16) | (b[o+2] << 8) | b[o+3]) / 65536;
  function iccTags(b) { const n = u32(b, 128), t = {}; for (let i = 0; i < n; i++) t[tag4(b, 132 + 12*i)] = [u32(b, 136 + 12*i), u32(b, 140 + 12*i)]; return t; }
  function evalTrc(b, off, x) {
    const ty = tag4(b, off);
    if (ty === 'curv') { const n = u32(b, off + 8); if (n === 0) return x; if (n === 1) return Math.pow(x, (b[off+12] * 256 + b[off+13]) / 256); const p = x * (n - 1), i = Math.min(n - 2, Math.floor(p)), f = p - i, a = u16(b, off + 12 + 2*i), c = u16(b, off + 12 + 2*i + 2); return (a + (c - a) * f) / 65535; }
    if (ty === 'para') { const t = u16(b, off + 8), p = [0, 1, 2, 3, 4, 5, 6].map((i) => (i * 4 + 12 + 4 <= b.length) ? s15(b, off + 12 + 4*i) : 0), [g, a, bb, c, d] = p;
      if (t === 0) return Math.pow(x, g); if (t === 3) return x >= d ? Math.pow(a * x + bb, g) : c * x; throw new Error('para type ' + t + ' not handled'); }
    throw new Error('TRC type ' + ty + ' not handled');
  }
  // Identify by what the profile *does* (colorants and curve), never by its name. Returns {space, why} where space is a built-in or null.
  function identify(icc, tol = { xyz: 6e-4, trc: 2e-3 }) {
    if (tag4(icc, 36) !== 'acsp' || tag4(icc, 16) !== 'RGB ' || tag4(icc, 20) !== 'XYZ ') return { space: null, why: 'not a matrix/TRC RGB profile (class ' + tag4(icc, 12) + ', space ' + tag4(icc, 16) + ', PCS ' + tag4(icc, 20) + ')' };
    const t = iccTags(icc); if (!t.rXYZ || !t.gXYZ || !t.bXYZ || !t.rTRC || !t.gTRC || !t.bTRC) return { space: null, why: 'LUT-based or incomplete RGB profile' };
    const col = ['rXYZ', 'gXYZ', 'bXYZ'].map((k) => [s15(icc, t[k][0] + 8), s15(icc, t[k][0] + 12), s15(icc, t[k][0] + 16)]);
    for (const cand of ['srgb', 'p3', 'adobe']) { const M = CM.M[cand]; let dx = 0; for (let k = 0; k < 3; k++) for (let r = 0; r < 3; r++) dx = Math.max(dx, Math.abs(col[k][r] - M[r][k]));
      if (dx > tol.xyz) continue;
      // curve check: compare linearised grey ramp of the profile with the candidate's decode
      let dt = 0; for (const ch of ['rTRC', 'gTRC', 'bTRC']) for (let i = 0; i <= 32; i++) { const x = i / 32, want = CM.isLinear(cand) ? x : (CM.GAMMAS[cand] ? Math.pow(x, CM.GAMMAS[cand]) : CM.dec(x)); dt = Math.max(dt, Math.abs(evalTrc(icc, t[ch][0], x) - want)); }
      if (dt <= tol.trc) return { space: cand, why: 'colorants within ' + dx.toExponential(1) + ', curve within ' + dt.toExponential(1) }; }
    return { space: null, why: 'matches no built-in space (kept as an embedded profile)' };
  }
  const api = { meta, setResource, identify, readResources };
  if (node) module.exports = api; else root.PsdIcc = api;
})(this);
