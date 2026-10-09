// PSD -> op-log import (Node; needs ag-psd). RGB, 8-bit, square, flat layers only; everything else is rejected loudly.
const { readPsd, initializeCanvas } = require('ag-psd'), S = require('../stack.js'), PI = require('./psd_icc.js');
initializeCanvas(() => { throw new Error('no canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
const MODE_BACK = { normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft light': 'soft-light', 'hard light': 'hard-light', darken: 'darken', lighten: 'lighten', difference: 'difference', exclusion: 'exclusion' };
function importPsd(bytes) {
  const m = PI.meta(bytes), info = { header: { w: m.width, h: m.height, depth: m.depth, mode: m.mode }, resourceIds: m.resourceIds };
  if (m.mode !== 3) throw new Error('unsupported PSD colour mode ' + m.mode + ' (only RGB=3; CMYK needs its own import path)');
  if (m.depth !== 8) throw new Error('unsupported PSD bit depth ' + m.depth + ' (only 8)');
  if (m.width !== m.height) throw new Error('non-square PSD ' + m.width + 'x' + m.height + ' (schema v1 is square-only)');
  const blobs = new Map(); let space;
  if (m.icc && m.untaggedFlag !== 1) { const id = PI.identify(m.icc); info.profile = id.why; if (id.space) space = id.space; else { const sha = S.sha256(m.icc); blobs.set(sha, m.icc); space = 'icc:' + sha; } }
  else { space = 'srgb'; info.profile = m.icc ? 'profile present but "untagged" flag set: assumed sRGB' : 'no embedded profile: assumed sRGB'; info.untagged = true; }
  info.space = space; const W = m.width, put = (b) => { const sha = S.sha256(b); blobs.set(sha, b); return sha; };
  const psd = readPsd(Buffer.from(bytes), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true }), ops = [{ op: 'doc', v: 1, w: W, h: W, working: space, gamma: 'encoded' }];
  (psd.children || []).forEach((c, i) => {
    if (c.children) throw new Error('layer groups are not supported yet (layer "' + c.name + '")'); const mode = MODE_BACK[c.blendMode || 'normal']; if (!mode) throw new Error('unsupported blend mode "' + c.blendMode + '"');
    ops.push({ op: 'layer', id: i, mode, opacity: c.opacity === undefined ? 1 : c.opacity, mask: !!(c.mask && c.mask.imageData), space });
    const full = new Uint8Array(W * W * 4), d = c.imageData, ox = c.left || 0, oy = c.top || 0;
    if (d) for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) { const X = ox + x, Y = oy + y; if (X >= 0 && Y >= 0 && X < W && Y < W) full.set(d.data.subarray((y * d.width + x) * 4, (y * d.width + x) * 4 + 4), (Y * W + X) * 4); }
    ops.push({ op: 'raster', layer: i, pixels: put(full) });
    if (c.mask && c.mask.imageData) { const mk = new Uint8Array(W * W).fill(c.mask.defaultColor === undefined ? 255 : c.mask.defaultColor), md = c.mask.imageData;
      for (let y = 0; y < md.height; y++) for (let x = 0; x < md.width; x++) { const X = (c.mask.left || 0) + x, Y = (c.mask.top || 0) + y; if (X >= 0 && Y >= 0 && X < W && Y < W) mk[Y * W + X] = md.data[(y * md.width + x) * 4]; }
      ops.push({ op: 'maskraster', layer: i, pixels: put(mk) }); }
  });
  return { ops, blobs, info };
}
module.exports = { importPsd, MODE_BACK };
