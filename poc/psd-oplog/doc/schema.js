// Op-log schema v1 for a colour-managed layered raster document. Strict: unknown ops and unknown fields are rejected, so
// replay can never silently depend on something the log does not say. All numbers are JSON-safe; colour is never implied.
//
//  {op:'doc',    v:1, w, h, working, gamma}                 first op, exactly once. w == h in v1.
//                  working: 'srgb'|'p3'|'adobe'|'icc:<sha256 of profile bytes>'   gamma: 'encoded'|'linear'
//                  gamma 'linear' composites in linear light (built-in working spaces only); 'encoded' = Photoshop default.
//  {op:'layer',  id, mode, opacity, mask, space}            space = the colour space of this layer's pixel values (same set as working)
//  {op:'fill',   layer, c:[r,g,b], a}                       colours are encoded values in the layer's space
//  {op:'dab',    layer, x, y, r, c:[r,g,b], a}
//  {op:'mdab',   layer, x, y, r, v, a}                      mask paint, layer must have mask:true
//  {op:'set',    layer, mode?, opacity?}
//  {op:'raster', layer, pixels:<sha256>}                    replaces layer pixels with a content-addressed blob: w*h*4 bytes straight RGBA8
//  {op:'maskraster', layer, pixels:<sha256>}                mask from a blob of w*h bytes (requires mask:true)
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack;
  const MODES = S.MODES, BUILTIN = ['srgb', 'p3', 'adobe'], SHA = /^[0-9a-f]{64}$/;
  const FIELDS = { doc: ['op', 'v', 'w', 'h', 'working', 'gamma'], layer: ['op', 'id', 'mode', 'opacity', 'mask', 'space'], fill: ['op', 'layer', 'c', 'a'], dab: ['op', 'layer', 'x', 'y', 'r', 'c', 'a'],
    mdab: ['op', 'layer', 'x', 'y', 'r', 'v', 'a'], set: ['op', 'layer', 'mode', 'opacity'], raster: ['op', 'layer', 'pixels'], maskraster: ['op', 'layer', 'pixels'] };
  const REQUIRED = { doc: FIELDS.doc, layer: FIELDS.layer, fill: FIELDS.fill, dab: FIELDS.dab, mdab: FIELDS.mdab, set: ['op', 'layer'], raster: FIELDS.raster, maskraster: FIELDS.maskraster };
  const num = (x) => typeof x === 'number' && Number.isFinite(x), unit = (x) => num(x) && x >= 0 && x <= 1;
  const spaceOk = (s) => BUILTIN.includes(s) || (typeof s === 'string' && /^icc:[0-9a-f]{64}$/.test(s));
  // blobs: Map<sha256, Uint8Array> (optional: when given, referenced blobs are checked for existence, size and hash)
  function validate(ops, blobs) {
    const err = [], e = (i, m) => err.push('op ' + i + ': ' + m); if (!Array.isArray(ops) || !ops.length) return ['empty or non-array op-log'];
    let doc = null; const layers = {};
    ops.forEach((o, i) => {
      if (!o || typeof o !== 'object' || !FIELDS[o.op]) return e(i, 'unknown op ' + (o && o.op));
      for (const k of Object.keys(o)) if (!FIELDS[o.op].includes(k)) e(i, 'unknown field ' + k);
      for (const k of REQUIRED[o.op]) if (!(k in o)) e(i, 'missing field ' + k);
      if (o.op === 'doc') {
        if (i !== 0) e(i, 'doc op must be first and unique'); else doc = o;
        if (o.v !== 1) e(i, 'unsupported version ' + o.v); if (!Number.isInteger(o.w) || o.w < 1 || o.w > 16384 || o.w !== o.h) e(i, 'w,h must be equal integers in 1..16384 (v1)');
        if (!spaceOk(o.working)) e(i, 'bad working space'); if (!['encoded', 'linear'].includes(o.gamma)) e(i, 'bad gamma'); if (o.gamma === 'linear' && !BUILTIN.includes(o.working)) e(i, 'linear compositing needs a built-in working space');
        return;
      }
      if (i === 0) return e(i, 'first op must be doc');
      if (o.op === 'layer') {
        if (!Number.isInteger(o.id) || o.id < 0) e(i, 'bad layer id'); else if (layers[o.id]) e(i, 'duplicate layer ' + o.id); else layers[o.id] = o;
        if (!MODES.includes(o.mode)) e(i, 'bad blend mode ' + o.mode); if (!unit(o.opacity)) e(i, 'opacity outside 0..1'); if (typeof o.mask !== 'boolean') e(i, 'mask must be boolean'); if (!spaceOk(o.space)) e(i, 'bad layer space');
        return;
      }
      const l = layers[o.layer]; if (!l) return e(i, 'unknown layer ' + o.layer);
      if (o.op === 'set') { if (o.mode !== undefined && !MODES.includes(o.mode)) e(i, 'bad blend mode'); if (o.opacity !== undefined && !unit(o.opacity)) e(i, 'opacity outside 0..1'); }
      if (o.op === 'fill' || o.op === 'dab') { if (!Array.isArray(o.c) || o.c.length !== 3 || !o.c.every(unit)) e(i, 'c must be 3 numbers in 0..1'); if (!unit(o.a)) e(i, 'a outside 0..1'); }
      if (o.op === 'dab' || o.op === 'mdab') { if (!num(o.x) || !num(o.y) || !num(o.r) || o.r <= 0) e(i, 'bad dab geometry'); if (!unit(o.a)) e(i, 'a outside 0..1'); }
      if (o.op === 'mdab') { if (!unit(o.v)) e(i, 'v outside 0..1'); if (!l.mask) e(i, 'layer has no mask'); }
      if (o.op === 'raster' || o.op === 'maskraster') {
        if (o.op === 'maskraster' && !l.mask) e(i, 'layer has no mask'); if (!SHA.test(o.pixels)) return e(i, 'pixels must be a sha256 hex');
        if (blobs) { const b = blobs.get(o.pixels); if (!b) e(i, 'missing blob ' + o.pixels.slice(0, 8)); else { const want = doc ? doc.w * doc.h * (o.op === 'raster' ? 4 : 1) : -1; if (b.length !== want) e(i, 'blob size ' + b.length + ' != ' + want); if (S.sha256(b) !== o.pixels) e(i, 'blob hash mismatch'); } }
      }
    });
    if (doc && blobs) for (const sp of [doc.working, ...Object.values(layers).map((l) => l.space)]) if (typeof sp === 'string' && sp.startsWith('icc:')) { const b = blobs.get(sp.slice(4)); if (!b) err.push('missing ICC profile blob ' + sp.slice(4, 12)); else if (S.sha256(b) !== sp.slice(4)) err.push('ICC profile hash mismatch'); }
    return err;
  }
  const api = { validate, BUILTIN, MODES, FIELDS };
  if (node) module.exports = api; else root.DocSchema = api;
})(this);
