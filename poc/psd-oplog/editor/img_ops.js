// Photo layer op for the editor log: {op:'img', id, sha}. Spec: witness_log/HYPOTHESES.md "Level 1d" (I1-I8). The blob (W*W*4 straight RGBA8, already scaled to the canvas) lives in st.blobs, keyed by its sha256.
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, F = Math.fround;
  function apply(st, o) {
    if (o.op !== 'img') return false;
    const W = st.W, blob = st.blobs && st.blobs.get(o.sha);
    if (!blob) throw new Error('img: missing blob ' + String(o.sha).slice(0, 12)); if (blob.length !== W * W * 4) throw new Error('img: blob has ' + blob.length + ' bytes, expected ' + W * W * 4);
    if (st.L[o.id]) throw new Error('img: layer ' + o.id + ' already exists');
    S.apply(st, { op: 'layer', id: o.id, mode: 'normal', opacity: 1, mask: false }); const pix = st.L[o.id].pix;
    for (let i = 0; i < W * W; i++) { const a = F(blob[i * 4 + 3] / 255); pix[i * 4 + 3] = a; for (let k = 0; k < 3; k++) pix[i * 4 + k] = F(F(blob[i * 4 + k] / 255) * a); }
    return true;
  }
  // contain-fit placement of an iw x ih picture into a W x W canvas
  function fit(iw, ih, W) { const sc = Math.min(W / iw, W / ih), dw = Math.max(1, Math.round(iw * sc)), dh = Math.max(1, Math.round(ih * sc)); return { dw, dh, dx: Math.floor((W - dw) / 2), dy: Math.floor((W - dh) / 2) }; }
  const b64 = { enc(u8) { if (node) return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
    dec(str) { if (node) return new Uint8Array(Buffer.from(str, 'base64')); const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; } };
  function packBlobs(blobs, ops) { const used = {}; for (const o of ops) if (o.op === 'img') used[o.sha] = b64.enc(blobs.get(o.sha)); return used; }
  function unpackBlobs(obj) { const m = new Map(); for (const sha of Object.keys(obj || {})) { const u = b64.dec(obj[sha]); if (S.sha256(u) !== sha) throw new Error('blob sha mismatch for ' + sha.slice(0, 12)); m.set(sha, u); } return m; }
  const api = { apply, fit, b64, packBlobs, unpackBlobs };
  if (node) module.exports = api; else root.ImgOps = api;
})(this);
