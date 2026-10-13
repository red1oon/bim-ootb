// Photo layer op for the editor log: {op:'img', id, sha}. Spec: witness_log/HYPOTHESES.md "Level 1d" (I1-I8). The blob (W*W*4 straight RGBA8, already scaled to the canvas) lives in st.blobs, keyed by its sha256.
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack, F = Math.fround;
  // caption metadata (Level 1k): which words / style a caption layer was drawn from. Metadata only: the fold uses the blob.
  const AL = ['left', 'center', 'right'], FA = ['sans', 'serif', 'mono'], AN = ['top', 'middle', 'bottom'], rgb255 = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
  function validateTxt(t) {
    const bad = (m) => { throw new Error('txt: ' + m); };
    if (!t || typeof t !== 'object' || Array.isArray(t) || Object.keys(t).sort().join() !== 'align,anchor,color,family,outline,shadow,size,text') bad('needs exactly text, size, color, anchor, align, family, shadow, outline');
    if (typeof t.text !== 'string' || !t.text.trim() || t.text.length > 200) bad('text must be 1..200 characters'); if (!Number.isInteger(t.size) || t.size < 24 || t.size > 300) bad('size must be an integer 24..300');
    if (!rgb255(t.color)) bad('color must be [r,g,b] integers 0..255'); if (!AN.includes(t.anchor)) bad('anchor must be top, middle or bottom'); if (!AL.includes(t.align)) bad('align must be left, center or right'); if (!FA.includes(t.family)) bad('family must be sans, serif or mono'); if (typeof t.shadow !== 'boolean') bad('shadow must be a boolean');
    if (t.outline !== null && !(t.outline && typeof t.outline === 'object' && Object.keys(t.outline).sort().join() === 'color,w' && Number.isInteger(t.outline.w) && t.outline.w >= 1 && t.outline.w <= 20 && rgb255(t.outline.color))) bad('outline must be null or {w: 1..20, color: [r,g,b]}');
  }
  function fromBlob(st, o, tag) {
    const W = st.W, blob = st.blobs && st.blobs.get(o.sha); if (!blob) throw new Error(tag + ': missing blob ' + String(o.sha).slice(0, 12)); if (blob.length !== W * W * 4) throw new Error(tag + ': blob has ' + blob.length + ' bytes, expected ' + W * W * 4); return blob;
  }
  function apply(st, o) {
    if (o.op === 'imgset') {   // replace the pixels of an existing layer (editable text, Level 1k)
      const l = st.L[o.layer]; if (!l) throw new Error('imgset: unknown layer ' + o.layer); for (const k of Object.keys(o)) if (!['op', 'layer', 'sha', 'txt'].includes(k)) throw new Error('imgset: unknown field ' + k); if ('txt' in o) validateTxt(o.txt);
      const W = st.W, blob = fromBlob(st, o, 'imgset'), pix = l.pix; for (let i = 0; i < W * W; i++) { const a = F(blob[i * 4 + 3] / 255); pix[i * 4 + 3] = a; for (let k = 0; k < 3; k++) pix[i * 4 + k] = F(F(blob[i * 4 + k] / 255) * a); } return true;
    }
    if (o.op !== 'img') return false;
    if ('txt' in o) validateTxt(o.txt);
    const W = st.W, blob = st.blobs && st.blobs.get(o.sha);
    if (!blob) throw new Error('img: missing blob ' + String(o.sha).slice(0, 12)); if (blob.length !== W * W * 4) throw new Error('img: blob has ' + blob.length + ' bytes, expected ' + W * W * 4);
    if (st.L[o.id]) throw new Error('img: layer ' + o.id + ' already exists');
    S.apply(st, { op: 'layer', id: o.id, mode: 'normal', opacity: 1, mask: false }); const pix = st.L[o.id].pix;
    for (let i = 0; i < W * W; i++) { const a = F(blob[i * 4 + 3] / 255); pix[i * 4 + 3] = a; for (let k = 0; k < 3; k++) pix[i * 4 + k] = F(F(blob[i * 4 + k] / 255) * a); }
    return true;
  }
  // contain-fit placement of an iw x ih picture into a W x W canvas
  function fit(iw, ih, W) { const sc = Math.min(W / iw, W / ih), dw = Math.max(1, Math.round(iw * sc)), dh = Math.max(1, Math.round(ih * sc)); return { dw, dh, dx: Math.floor((W - dw) / 2), dy: Math.floor((W - dh) / 2) }; }
  // fill placement: the source rectangle to draw over the whole canvas; only the longer axis is cropped (anchor 'start' | 'q1' | 'centre' | 'q3' | 'end')
  function cover(iw, ih, W, anchor) { const s = Math.min(iw, ih), off = (long) => (anchor === 'start' ? 0 : anchor === 'end' ? long - s : anchor === 'q1' ? Math.floor((long - s) / 4) : anchor === 'q3' ? Math.floor(3 * (long - s) / 4) : Math.floor((long - s) / 2)); return iw >= ih ? { sx: off(iw), sy: 0, sw: s, sh: s } : { sx: 0, sy: off(ih), sw: s, sh: s }; }
  const b64 = { enc(u8) { if (node) return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
    dec(str) { if (node) return new Uint8Array(Buffer.from(str, 'base64')); const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; } };
  function packBlobs(blobs, ops) { const used = {}; for (const o of ops) if (o.op === 'img' || o.op === 'imgset') used[o.sha] = b64.enc(blobs.get(o.sha)); return used; }
  function unpackBlobs(obj) { const m = new Map(); for (const sha of Object.keys(obj || {})) { const u = b64.dec(obj[sha]); if (S.sha256(u) !== sha) throw new Error('blob sha mismatch for ' + sha.slice(0, 12)); m.set(sha, u); } return m; }
  const api = { apply, fit, cover, b64, packBlobs, unpackBlobs, validateTxt };
  if (node) module.exports = api; else root.ImgOps = api;
})(this);
