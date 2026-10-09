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
//  --- schema v2 only (doc.v === 2); a v1 document may not use any of this ---
//  {op:'group',  id, mode, opacity, mask, parent?}            mode: a blend mode or 'pass-through'. Ids are shared with layers. 'pass-through': children blend with the backdrop
//                  directly, then the result is lerped with the backdrop by opacity*mask. Any other mode: isolated (children composite on transparency, then blend like a layer).
//  layer.parent? = id of an earlier group (nesting depth <= 16, bottom-to-top order within a parent); layer.clip? = true clips it to the nearest unclipped layer below it
//                  in the same parent (source-atop; blended with the BASE layer's mode/opacity/mask). A clip base must be a layer, not a group.
//  non-separable blend modes 'hue' | 'saturation' | 'color' | 'luminosity' are valid in v2 documents only.
//  {op:'adjust', id, kind, params, opacity, mask, parent?}   adjustment layer (v2, gamma 'encoded' only): transforms the composite beneath it within its parent, lerped by opacity*mask; alpha untouched.
//                  kind 'invert' {} | 'levels' {in_black 0..254, in_white 1..255, gamma_x100 1..999, out_black 0..255, out_white 0..255} | 'threshold' {level 1..255} | 'posterize' {levels 2..255}; all integers.
//  mdab/set/maskraster may target a group or an adjustment (set: opacity only); fill/dab/raster may not.
//  {op:'raster', layer, pixels:<sha256>}                    replaces layer pixels with a content-addressed blob: w*h*4 bytes straight RGBA8
//  {op:'maskraster', layer, pixels:<sha256>}                mask from a blob of w*h bytes (requires mask:true)
(function (root) {
  const node = typeof require !== 'undefined', S = node ? require('../stack.js') : root.Stack;
  const MODES = S.MODES, NONSEP = S.NONSEP, ADJ = S.ADJ_KINDS, BUILTIN = ['srgb', 'p3', 'adobe'], SHA = /^[0-9a-f]{64}$/;
  const FIELDS = { doc: ['op', 'v', 'w', 'h', 'working', 'gamma'], layer: ['op', 'id', 'mode', 'opacity', 'mask', 'space', 'parent', 'clip'], group: ['op', 'id', 'mode', 'opacity', 'mask', 'parent'], adjust: ['op', 'id', 'kind', 'params', 'opacity', 'mask', 'parent'], fill: ['op', 'layer', 'c', 'a'], dab: ['op', 'layer', 'x', 'y', 'r', 'c', 'a'],
    mdab: ['op', 'layer', 'x', 'y', 'r', 'v', 'a'], set: ['op', 'layer', 'mode', 'opacity'], raster: ['op', 'layer', 'pixels'], maskraster: ['op', 'layer', 'pixels'] };
  const REQUIRED = { doc: FIELDS.doc, layer: ['op', 'id', 'mode', 'opacity', 'mask', 'space'], group: ['op', 'id', 'mode', 'opacity', 'mask'], adjust: ['op', 'id', 'kind', 'params', 'opacity', 'mask'], fill: FIELDS.fill, dab: FIELDS.dab, mdab: FIELDS.mdab, set: ['op', 'layer'], raster: FIELDS.raster, maskraster: FIELDS.maskraster };
  const num = (x) => typeof x === 'number' && Number.isFinite(x), unit = (x) => num(x) && x >= 0 && x <= 1;
  const spaceOk = (s) => BUILTIN.includes(s) || (typeof s === 'string' && /^icc:[0-9a-f]{64}$/.test(s));
  // blobs: Map<sha256, Uint8Array> (optional: when given, referenced blobs are checked for existence, size and hash)
  function validate(ops, blobs) {
    const err = [], e = (i, m) => err.push('op ' + i + ': ' + m); if (!Array.isArray(ops) || !ops.length) return ['empty or non-array op-log'];
    let doc = null; const nodes = {}, lists = { '-1': [] };
    const depthOf = (id) => { let d = 0, p = id; while (p !== -1 && nodes[p]) { d++; p = nodes[p].parent; if (d > 64) break; } return d; };
    ops.forEach((o, i) => {
      if (!o || typeof o !== 'object' || !FIELDS[o.op]) return e(i, 'unknown op ' + (o && o.op));
      for (const k of Object.keys(o)) if (!FIELDS[o.op].includes(k)) e(i, 'unknown field ' + k);
      for (const k of REQUIRED[o.op]) if (!(k in o)) e(i, 'missing field ' + k);
      if (o.op === 'doc') {
        if (i !== 0) e(i, 'doc op must be first and unique'); else doc = o;
        if (o.v !== 1 && o.v !== 2) e(i, 'unsupported version ' + o.v); if (!Number.isInteger(o.w) || o.w < 1 || o.w > 16384 || o.w !== o.h) e(i, 'w,h must be equal integers in 1..16384 (v1/v2)');
        if (!spaceOk(o.working)) e(i, 'bad working space'); if (!['encoded', 'linear'].includes(o.gamma)) e(i, 'bad gamma'); if (o.gamma === 'linear' && !BUILTIN.includes(o.working)) e(i, 'linear compositing needs a built-in working space');
        return;
      }
      if (i === 0) return e(i, 'first op must be doc');
      const v2 = doc && doc.v === 2;
      if (o.op === 'adjust') {
        if (!v2) e(i, 'adjust needs doc.v 2'); if (doc && doc.gamma === 'linear') e(i, 'adjustment layers need gamma "encoded"');
        if (!Number.isInteger(o.id) || o.id < 0) e(i, 'bad id'); else if (nodes[o.id]) e(i, 'duplicate id ' + o.id); if (!unit(o.opacity)) e(i, 'opacity outside 0..1'); if (typeof o.mask !== 'boolean') e(i, 'mask must be boolean');
        const parent = o.parent === undefined ? -1 : o.parent; if (parent !== -1 && !(Number.isInteger(parent) && nodes[parent] && nodes[parent].kind === 'group')) e(i, 'parent ' + o.parent + ' is not an earlier group');
        const P = o.params, ints = (keys) => P && typeof P === 'object' && Object.keys(P).sort().join() === [...keys].sort().join() && keys.every((k) => Number.isInteger(P[k])), inr = (k, a, b) => P[k] >= a && P[k] <= b;
        if (!ADJ.includes(o.kind)) e(i, 'unknown adjustment kind ' + o.kind);
        else if (o.kind === 'invert') { if (!ints([])) e(i, 'invert takes no params'); }
        else if (o.kind === 'levels') { if (!ints(['in_black', 'in_white', 'gamma_x100', 'out_black', 'out_white'])) e(i, 'levels params must be exactly in_black, in_white, gamma_x100, out_black, out_white (integers)'); else if (!(inr('in_black', 0, 254) && inr('in_white', 1, 255) && P.in_black < P.in_white && inr('gamma_x100', 1, 999) && inr('out_black', 0, 255) && inr('out_white', 0, 255))) e(i, 'levels params out of range'); }
        else if (o.kind === 'threshold') { if (!ints(['level']) || !inr('level', 1, 255)) e(i, 'threshold needs integer level 1..255'); }
        else if (o.kind === 'posterize') { if (!ints(['levels']) || !inr('levels', 2, 255)) e(i, 'posterize needs integer levels 2..255'); }
        const list = lists[parent] || (lists[parent] = []); if (Number.isInteger(o.id) && o.id >= 0 && !nodes[o.id]) { nodes[o.id] = { kind: 'adjust', parent, clip: false, mask: o.mask === true }; list.push(o.id); if (depthOf(o.id) > 16) e(i, 'group nesting deeper than 16'); }
        return;
      }
      if (o.op === 'group' || o.op === 'layer') {
        if (o.op === 'group' && !v2) e(i, 'group needs doc.v 2'); if (o.op === 'layer' && !v2 && ('parent' in o || 'clip' in o)) e(i, 'parent/clip need doc.v 2');
        if (!Number.isInteger(o.id) || o.id < 0) e(i, 'bad id'); else if (nodes[o.id]) e(i, 'duplicate id ' + o.id);
        if (!(o.op === 'group' ? [...MODES, ...(v2 ? NONSEP : []), 'pass-through'] : [...MODES, ...(v2 ? NONSEP : [])]).includes(o.mode)) e(i, 'bad blend mode ' + o.mode); if (!unit(o.opacity)) e(i, 'opacity outside 0..1'); if (typeof o.mask !== 'boolean') e(i, 'mask must be boolean');
        const parent = o.parent === undefined ? -1 : o.parent;
        if (parent !== -1 && !(Number.isInteger(parent) && nodes[parent] && nodes[parent].kind === 'group')) e(i, 'parent ' + o.parent + ' is not an earlier group');
        if (o.op === 'layer') { if (!spaceOk(o.space)) e(i, 'bad layer space'); if (o.clip !== undefined && typeof o.clip !== 'boolean') e(i, 'clip must be boolean'); }
        const list = lists[parent] || (lists[parent] = []);
        if (o.op === 'layer' && o.clip === true) { let k = list.length - 1; while (k >= 0 && nodes[list[k]].clip) k--; if (k < 0) e(i, 'clipped layer has no base layer below it in its list'); else if (nodes[list[k]].kind !== 'layer') e(i, 'clip base must be a layer, not a group or adjustment'); }
        if (Number.isInteger(o.id) && o.id >= 0 && !nodes[o.id]) { nodes[o.id] = { kind: o.op, parent, clip: o.op === 'layer' && o.clip === true, mask: o.mask === true }; list.push(o.id); if (o.op === 'group') lists[o.id] = []; if (depthOf(o.id) > 16) e(i, 'group nesting deeper than 16'); }
        return;
      }
      const l = nodes[o.layer]; if (!l) return e(i, 'unknown layer ' + o.layer);
      if ((o.op === 'fill' || o.op === 'dab' || o.op === 'raster') && l.kind !== 'layer') e(i, o.op + ' needs a layer, not a group');
      if (o.op === 'set') { if (l.kind === 'adjust' && o.mode !== undefined) e(i, 'adjustment layers have no blend mode'); if (o.mode !== undefined && l.kind !== 'adjust' && !(l.kind === 'group' ? [...MODES, ...(v2 ? NONSEP : []), 'pass-through'] : [...MODES, ...(v2 ? NONSEP : [])]).includes(o.mode)) e(i, 'bad blend mode'); if (o.opacity !== undefined && !unit(o.opacity)) e(i, 'opacity outside 0..1'); }
      if (o.op === 'fill' || o.op === 'dab') { if (!Array.isArray(o.c) || o.c.length !== 3 || !o.c.every(unit)) e(i, 'c must be 3 numbers in 0..1'); if (!unit(o.a)) e(i, 'a outside 0..1'); }
      if (o.op === 'dab' || o.op === 'mdab') { if (!num(o.x) || !num(o.y) || !num(o.r) || o.r <= 0) e(i, 'bad dab geometry'); if (!unit(o.a)) e(i, 'a outside 0..1'); }
      if (o.op === 'mdab') { if (!unit(o.v)) e(i, 'v outside 0..1'); if (!l.mask) e(i, 'layer has no mask'); }
      if (o.op === 'raster' || o.op === 'maskraster') {
        if (o.op === 'maskraster' && !l.mask) e(i, 'layer has no mask'); if (!SHA.test(o.pixels)) return e(i, 'pixels must be a sha256 hex');
        if (blobs) { const b = blobs.get(o.pixels); if (!b) e(i, 'missing blob ' + o.pixels.slice(0, 8)); else { const want = doc ? doc.w * doc.h * (o.op === 'raster' ? 4 : 1) : -1; if (b.length !== want) e(i, 'blob size ' + b.length + ' != ' + want); if (S.sha256(b) !== o.pixels) e(i, 'blob hash mismatch'); } }
      }
    });
    const spaces = []; ops.forEach((o) => { if (o && o.op === 'layer' && typeof o.space === 'string') spaces.push(o.space); });
    if (doc && blobs) for (const sp of [doc.working, ...spaces]) if (typeof sp === 'string' && sp.startsWith('icc:')) { const b = blobs.get(sp.slice(4)); if (!b) err.push('missing ICC profile blob ' + sp.slice(4, 12)); else if (S.sha256(b) !== sp.slice(4)) err.push('ICC profile hash mismatch'); }
    return err;
  }
  const api = { validate, BUILTIN, MODES, FIELDS };
  if (node) module.exports = api; else root.DocSchema = api;
})(this);
