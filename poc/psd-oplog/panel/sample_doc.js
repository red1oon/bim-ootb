// A demo composition (schema v2) built only from the engine's ops: soft discs, masks, groups, clipping. Used by panel.html for the screenshot.
(function (root) {
  function sampleDoc(W) {
    let s = 20261009; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296, r4 = (x) => Math.round(x * 1e4) / 1e4, ops = [];
    const dab = (layer, x, y, r, c, a) => ops.push({ op: 'dab', layer, x: r4(x), y: r4(y), r: r4(r), c: c.map(r4), a: r4(a) });
    const layer = (id, name, mode, opacity, space, extra = {}) => { ops.push({ op: 'layer', id, mode, opacity, mask: !!extra.mask, space, ...(extra.parent !== undefined ? { parent: extra.parent } : {}), ...(extra.clip ? { clip: true } : {}) }); names[id] = name; };
    const group = (id, name, mode, opacity, extra = {}) => { ops.push({ op: 'group', id, mode, opacity, mask: !!extra.mask, ...(extra.parent !== undefined ? { parent: extra.parent } : {}) }); names[id] = name; }, names = {};
    ops.push({ op: 'doc', v: 2, w: W, h: W, working: 'p3', gamma: 'encoded' });
    layer(0, 'Sky gradient', 'normal', 1, 'srgb'); ops.push({ op: 'fill', layer: 0, c: [0.16, 0.2, 0.42], a: 1 });
    for (let i = 0; i < 14; i++) dab(0, W / 2 + (rnd() - 0.5) * W * 0.9, W * (0.18 + i * 0.05), W * 0.5, i < 8 ? [0.26 + i * 0.07, 0.24 + i * 0.045, 0.5 - i * 0.02] : [0.95, 0.5 + (i - 8) * 0.05, 0.25], 0.5);
    group(10, 'Sunset glow', 'pass-through', 0.9);
    layer(1, 'Horizon fire', 'screen', 0.9, 'p3', { parent: 10 }); for (let i = 0; i < 16; i++) dab(1, W * (0.1 + i * 0.055), W * 0.62, W * (0.16 + rnd() * 0.1), [1, 0.45 + rnd() * 0.2, 0.12], 0.55);
    layer(2, 'Violet haze', 'multiply', 0.6, 'srgb', { parent: 10 }); for (let i = 0; i < 12; i++) dab(2, rnd() * W, W * (0.1 + rnd() * 0.3), W * (0.2 + rnd() * 0.15), [0.6, 0.45, 0.85], 0.6);
    layer(3, 'Sun', 'screen', 1, 'p3'); dab(3, W * 0.62, W * 0.55, W * 0.16, [1, 0.93, 0.7], 1); dab(3, W * 0.62, W * 0.55, W * 0.06, [1, 1, 1], 1);
    layer(4, 'Far ridge', 'normal', 0.85, 'srgb'); for (let i = 0; i < 46; i++) { const x = (i / 45) * W * 1.1 - W * 0.05; dab(4, x, W * (0.66 + 0.05 * Math.sin(i * 0.5) + 0.03 * Math.sin(i * 1.3)), W * 0.1, [0.2, 0.18, 0.4], 0.95); }
    layer(5, 'Near ridge', 'normal', 1, 'srgb'); for (let i = 0; i < 52; i++) { const x = (i / 51) * W * 1.1 - W * 0.05; dab(5, x, W * (0.8 + 0.05 * Math.sin(i * 0.35 + 1) + 0.025 * Math.sin(i * 1.1)), W * 0.13, [0.06, 0.07, 0.16], 1); }
    layer(6, 'Mist (clipped to near ridge)', 'screen', 0.55, 'p3', { clip: true }); for (let i = 0; i < 20; i++) dab(6, rnd() * W, W * (0.74 + rnd() * 0.1), W * (0.12 + rnd() * 0.08), [0.75, 0.7, 0.9], 0.7);
    layer(7, 'Rim light (clipped)', 'overlay', 0.8, 'p3', { clip: true }); for (let i = 0; i < 10; i++) dab(7, W * (0.45 + rnd() * 0.3), W * (0.76 + rnd() * 0.04), W * 0.08, [1, 0.6, 0.2], 0.9);
    group(11, 'Bokeh', 'overlay', 0.8); layer(8, 'Discs', 'screen', 0.9, 'p3', { parent: 11 }); for (let i = 0; i < 34; i++) dab(8, rnd() * W, rnd() * W * 0.7, W * (0.015 + rnd() * 0.045), [1, 0.85 + rnd() * 0.15, 0.6 + rnd() * 0.4], 0.35 + rnd() * 0.3);
    layer(9, 'Vignette', 'multiply', 0.9, 'srgb', { mask: true }); ops.push({ op: 'fill', layer: 9, c: [0.05, 0.04, 0.1], a: 0.9 }); for (let i = 0; i < 12; i++) ops.push({ op: 'mdab', layer: 9, x: r4(W / 2 + (rnd() - 0.5) * W * 0.3), y: r4(W * 0.5 + (rnd() - 0.5) * W * 0.3), r: r4(W * 0.35), v: 0, a: 0.55 });
    layer(12, 'Warm grade', 'soft-light', 0.55, 'p3'); ops.push({ op: 'fill', layer: 12, c: [1, 0.62, 0.3], a: 0.5 });
    return { ops, names };
  }
  if (typeof module !== 'undefined') module.exports = { sampleDoc }; else root.SampleDoc = { sampleDoc };
})(this);
