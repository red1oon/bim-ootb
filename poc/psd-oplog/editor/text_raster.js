// Caption drawing for the editor (page only: needs a canvas). Spec: witness_log/HYPOTHESES.md "Level 1f" (T1-T9). Returns straight-alpha RGBA8 of a W x W transparent canvas with the caption drawn on it; the log stores these pixels (img op), so replay is exact on every device even though the glyph drawing is not.
(function (root) {
  const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  function wrap(ctx, text, maxW) {
    const lines = []; for (const para of String(text).split('\n')) { let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word; while (ctx.measureText(w).width > maxW) { let k = w.length - 1; while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxW) k--; if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, k)); w = w.slice(k); }
        const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width <= maxW) line = t; else { lines.push(line); line = w; } }
      lines.push(line); }
    return lines.filter((l, i, a) => l || (i > 0 && i < a.length - 1));
  }
  // opts: { text, size (24..300), color [r,g,b] 0..255, anchor 'top'|'middle'|'bottom', shadow bool }
  function render(W, opts) {
    const size = Math.max(24, Math.min(300, Math.round(opts.size))), cv = document.createElement('canvas'); cv.width = cv.height = W; const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    const lines = wrap(ctx, opts.text, W * 0.9), lh = Math.round(size * 1.2), bh = lines.length * lh, m = Math.round(W * 0.06), y0 = opts.anchor === 'top' ? m : opts.anchor === 'bottom' ? W - m - bh : Math.round((W - bh) / 2);
    ctx.fillStyle = 'rgb(' + opts.color.map((v) => Math.round(v)).join(',') + ')';
    if (opts.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = Math.round(size * 0.08); ctx.shadowOffsetX = ctx.shadowOffsetY = Math.round(size * 0.04); }
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
    return new Uint8Array(ctx.getImageData(0, 0, W, W).data.buffer);
  }
  const api = { render, wrap };
  if (typeof module !== 'undefined') module.exports = api; else root.TextRaster = api;
})(this);
