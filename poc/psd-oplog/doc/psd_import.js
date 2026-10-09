// PSD -> op-log import (Node; needs ag-psd). RGB, 8-bit, square, flat layers only; everything else is rejected loudly.
const { readPsd, initializeCanvas } = require('ag-psd'), S = require('../stack.js'), PI = require('./psd_icc.js');
initializeCanvas(() => { throw new Error('no canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
const MODE_BACK = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft light': 'soft-light', 'hard light': 'hard-light', darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };
function importPsd(bytes) {
  const m = PI.meta(bytes), info = { header: { w: m.width, h: m.height, depth: m.depth, mode: m.mode }, resourceIds: m.resourceIds };
  if (m.mode !== 3) throw new Error('unsupported PSD colour mode ' + m.mode + ' (only RGB=3; CMYK needs its own import path)');
  if (m.depth !== 8 && m.depth !== 16) throw new Error('unsupported PSD bit depth ' + m.depth + ' (only 8 and 16)');
  const D16 = m.depth === 16;
  if (m.width !== m.height) throw new Error('non-square PSD ' + m.width + 'x' + m.height + ' (schema v1 is square-only)');
  const blobs = new Map(); let space;
  if (m.icc && m.untaggedFlag !== 1) { const id = PI.identify(m.icc); info.profile = id.why; if (id.space) space = id.space; else { const sha = S.sha256(m.icc); blobs.set(sha, m.icc); space = 'icc:' + sha; } }
  else { space = 'srgb'; info.profile = m.icc ? 'profile present but "untagged" flag set: assumed sRGB' : 'no embedded profile: assumed sRGB'; info.untagged = true; }
  info.space = space; const W = m.width, put = (b) => { const sha = S.sha256(b); blobs.set(sha, b); return sha; };
  const psd = readPsd(Buffer.from(bytes), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true }), ops = [{ op: 'doc', v: 1, w: W, h: W, working: space, gamma: 'encoded' }];
  let nextId = 0, usesTree = false; const maskOps = (c, id, ops2) => { const dc = c.mask.defaultColor === undefined ? 255 : c.mask.defaultColor, md = c.mask.imageData;
    if (D16) { const mk = new Uint16Array(W * W).fill(dc * 257); for (let y = 0; y < md.height; y++) for (let x = 0; x < md.width; x++) { const X = (c.mask.left || 0) + x, Y = (c.mask.top || 0) + y; if (X >= 0 && Y >= 0 && X < W && Y < W) mk[Y * W + X] = md.data[(y * md.width + x) * 4]; }
      const le = new Uint8Array(W * W * 2); for (let k = 0; k < mk.length; k++) { le[k * 2] = mk[k] & 255; le[k * 2 + 1] = mk[k] >> 8; } ops2.push({ op: 'maskraster16', layer: id, pixels: put(le) }); usesTree = true; return; }
    const mk = new Uint8Array(W * W).fill(dc); for (let y = 0; y < md.height; y++) for (let x = 0; x < md.width; x++) { const X = (c.mask.left || 0) + x, Y = (c.mask.top || 0) + y; if (X >= 0 && Y >= 0 && X < W && Y < W) mk[Y * W + X] = md.data[(y * md.width + x) * 4]; }
    ops2.push({ op: 'maskraster', layer: id, pixels: put(mk) }); };
  const walk = (list, parent) => list.forEach((c) => {
    const id = nextId++, hasMask = !!(c.mask && c.mask.imageData), opacity = c.opacity === undefined ? 1 : c.opacity, pf = parent >= 0 ? { parent } : {};
    if (c.adjustment) {   // adjustment layer
      const A = c.adjustment; let kind, params; if (A.type === 'invert') { kind = 'invert'; params = {}; } else if (A.type === 'threshold') { kind = 'threshold'; params = { level: A.level }; } else if (A.type === 'posterize') { kind = 'posterize'; params = { levels: A.levels }; }
      else if (A.type === 'curves') { const idc = (ch) => !ch || !ch.length || (ch.length === 2 && ch[0].input === 0 && ch[0].output === 0 && ch[1].input === 255 && ch[1].output === 255);
        if (!A.rgb || !A.rgb.length || ![A.red, A.green, A.blue].every(idc)) throw new Error('unsupported adjustment layer "curves" (per-channel curves or no master curve)'); kind = 'curves'; params = { points: A.rgb.map((q) => [q.input, q.output]) }; }
      else if (A.type === 'levels' && A.rgb && [A.red, A.green, A.blue].every((ch) => !ch || (ch.shadowInput === 0 && ch.highlightInput === 255 && ch.shadowOutput === 0 && ch.highlightOutput === 255 && ch.midtoneInput === 1))) { kind = 'levels'; params = { in_black: A.rgb.shadowInput, in_white: A.rgb.highlightInput, gamma_x100: Math.round(A.rgb.midtoneInput * 100), out_black: A.rgb.shadowOutput, out_white: A.rgb.highlightOutput }; }
      else throw new Error('unsupported adjustment layer "' + A.type + '"' + (A.type === 'levels' ? ' (per-channel levels)' : ''));
      usesTree = true; ops.push({ op: 'adjust', id, kind, params, opacity, mask: hasMask, ...pf }); if (hasMask) maskOps(c, id, ops); return; }
    if (c.children) {   // group
      const mode = c.blendMode === 'pass through' ? 'pass-through' : MODE_BACK[c.blendMode || 'normal']; if (!mode) throw new Error('unsupported group blend mode "' + c.blendMode + '"'); usesTree = true;
      ops.push({ op: 'group', id, mode, opacity, mask: hasMask, ...pf }); if (hasMask) maskOps(c, id, ops); walk(c.children, id); return; }
    const mode = MODE_BACK[c.blendMode || 'normal']; if (!mode) throw new Error('unsupported blend mode "' + c.blendMode + '"'); if (parent >= 0 || c.clipping || S.NONSEP.includes(mode)) usesTree = true;   // non-separable modes need schema v2
    ops.push({ op: 'layer', id, mode, opacity, mask: hasMask, space, ...pf, ...(c.clipping ? { clip: true } : {}) });
    const d = c.imageData, ox = c.left || 0, oy = c.top || 0;
    if (D16) { const full = new Uint16Array(W * W * 4);
      if (d) for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) { const X = ox + x, Y = oy + y; if (X >= 0 && Y >= 0 && X < W && Y < W) full.set(d.data.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4), (Y * W + X) * 4); }
      const le = new Uint8Array(W * W * 8); for (let k = 0; k < full.length; k++) { le[k * 2] = full[k] & 255; le[k * 2 + 1] = full[k] >> 8; } ops.push({ op: 'raster16', layer: id, pixels: put(le) }); usesTree = true; }
    else { const full = new Uint8Array(W * W * 4);
      if (d) for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) { const X = ox + x, Y = oy + y; if (X >= 0 && Y >= 0 && X < W && Y < W) full.set(d.data.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4), (Y * W + X) * 4); }
      ops.push({ op: 'raster', layer: id, pixels: put(full) }); } if (hasMask) maskOps(c, id, ops); });
  walk(psd.children || [], -1); if (usesTree) ops[0].v = 2; info.groups = ops.filter((o) => o.op === 'group').length; info.clipped = ops.filter((o) => o.clip).length;
  return { ops, blobs, info };
}
module.exports = { importPsd, MODE_BACK };
