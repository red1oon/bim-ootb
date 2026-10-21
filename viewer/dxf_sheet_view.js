/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — the 2D overlay's sheet renderer (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-OVERLAY-ENTITIES). Read the log after every run.
// Draws the DXF text the 2D writer produces (what you see is what you save): LINE, ARC, CIRCLE, LWPOLYLINE, solid HATCH, TEXT, and DIMENSION via its *D block.
// No DOM at load; `paintCanvas` / `toSVG` are the two sinks over ONE draw list so the picture can be checked headless. Colours are AutoCAD ACI 1-9 only; a colour
// outside that table is drawn grey and COUNTED in `stats.unknown_colour`, never guessed. Log tags: §SHEET_PARSE §SHEET_DRAW.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.DxfSheetView = factory(); })(this, function () {
  'use strict';
  const ACI = { 1: '#ff3b3b', 2: '#ffe14d', 3: '#3ddc84', 4: '#3de0e0', 5: '#4d7dff', 6: '#ff4dff', 7: '#f2f2f2', 8: '#8a8a8a', 9: '#c0c0c0' };
  const N = Number;
  // group-code pairs -> {layers:{name:aci}, ents:[{type, layer, g:[[code,value]...]}], blocks:{name:[ents]}}
  function parse(text) {
    const L = text.split(/\r?\n/), pairs = []; for (let i = 0; i + 1 < L.length; i += 2) pairs.push([L[i].trim(), L[i + 1]]);
    const out = { layers: {}, ents: [], blocks: {}, header: {} }; let sec = null, tab = null, cur = null, blk = null, layer = null;
    const push = e => { (blk ? out.blocks[blk] : out.ents).push(e); };
    for (let i = 0; i < pairs.length; i++) {
      const c = pairs[i][0], v = pairs[i][1];
      if (c === '0' && v === 'SECTION') { sec = pairs[i + 1][1]; continue; }
      if (c === '0' && v === 'ENDSEC') { sec = null; cur = null; continue; }
      if (sec === 'TABLES') {
        if (c === '0') { layer = v === 'LAYER' ? {} : null; if (layer) tab = layer; continue; }
        if (layer && c === '2') layer.name = v; if (layer && c === '62' && layer.name) out.layers[layer.name] = N(v);
        if (layer && c === '62' && !layer.name) layer.aci = N(v); if (layer && c === '2' && layer.aci !== undefined && !(layer.name in out.layers)) out.layers[v] = layer.aci;
        continue;
      }
      if (sec === 'BLOCKS' || sec === 'ENTITIES') {
        if (c === '0') { if (v === 'BLOCK') { cur = null; blk = '?'; continue; } if (v === 'ENDBLK') { blk = null; cur = null; continue; } if (sec === 'BLOCKS' && !blk) continue; cur = { type: v, layer: '0', g: [] }; push(cur); continue; }
        if (!cur) { if (blk === '?' && c === '2') { blk = v; out.blocks[blk] = []; } continue; }
        if (c === '8') cur.layer = v; else cur.g.push([c, v]);
      }
    }
    return out;
  }
  const gv = (e, code, i) => { let k = 0; for (const p of e.g) if (p[0] === code) { if (k === (i || 0)) return p[1]; k++; } return undefined; };
  const num = (e, code, d) => { const v = gv(e, code); return v === undefined ? d : N(v); };
  // draw list: [{k:'line'|'poly'|'fill'|'circle'|'arc'|'text', layer, ...}] in sheet units (mm); y UP (flipped by the sinks)
  function toDrawList(P) {
    const list = [], stats = { by_type: {}, drawn_by_type: {}, unknown_colour: 0 };
    const col = (aci) => { if (aci in ACI) return ACI[aci]; stats.unknown_colour++; (stats.unknown_aci = stats.unknown_aci || {})[aci] = 1 + ((stats.unknown_aci || {})[aci] || 0); return '#9a9a9a'; };
    const lay = n => col(P.layers[n] === undefined ? 7 : P.layers[n]);
    const draw = (e, inBlk) => {
      const t = e.type, layer = e.layer, c = lay(layer); if (!inBlk) stats.by_type[t] = (stats.by_type[t] || 0) + 1;
      const ok = k => { if (inBlk) stats.dim_parts = (stats.dim_parts || 0) + 1; else stats.drawn_by_type[t] = (stats.drawn_by_type[t] || 0) + 1; return k; };
      if (t === 'LINE') list.push(ok({ k: 'line', layer, c, a: [num(e, '10'), num(e, '20')], b: [num(e, '11'), num(e, '21')] }));
      else if (t === 'CIRCLE') list.push(ok({ k: 'circle', layer, c, o: [num(e, '10'), num(e, '20')], r: num(e, '40') }));
      else if (t === 'ARC') list.push(ok({ k: 'arc', layer, c, o: [num(e, '10'), num(e, '20')], r: num(e, '40'), a0: num(e, '50'), a1: num(e, '51') }));
      else if (t === 'LWPOLYLINE') { const pts = []; const xs = e.g.filter(p => p[0] === '10'), ys = e.g.filter(p => p[0] === '20'); xs.forEach((p, i) => pts.push([N(p[1]), N(ys[i][1])])); list.push(ok({ k: 'poly', layer, c, pts, closed: (num(e, '70', 0) & 1) === 1 })); }
      else if (t === 'HATCH') { const hc = num(e, '62', 256); const i93 = e.g.findIndex(p => p[0] === '93'), pts = []; for (let i = i93 + 1; i < e.g.length; i++) { if (e.g[i][0] === '10' && e.g[i + 1] && e.g[i + 1][0] === '20') pts.push([N(e.g[i][1]), N(e.g[i + 1][1])]); if (e.g[i][0] === '97') break; } list.push(ok({ k: 'fill', layer, c: hc === 256 ? c : col(hc), pts })); }
      else if (t === 'TEXT') list.push(ok({ k: 'text', layer, c, p: [num(e, '10'), num(e, '20')], h: num(e, '40'), s: gv(e, '1') || '', rot: num(e, '50', 0), mid: num(e, '72', 0) === 1 }));
      else if (t === 'DIMENSION') { ok(); (P.blocks[gv(e, '2')] || []).forEach(b => draw(b, true)); }
      else stats.unsupported = (stats.unsupported || 0) + 1;
    };
    P.ents.forEach(e => draw(e));
    return { list, stats };
  }
  function bounds(list) {
    let x0 = 1e300, y0 = 1e300, x1 = -1e300, y1 = -1e300; const ext = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    list.forEach(d => { if (d.k === 'line') { ext(d.a); ext(d.b); } else if (d.k === 'poly' || d.k === 'fill') d.pts.forEach(ext); else if (d.k === 'circle' || d.k === 'arc') { ext([d.o[0] - d.r, d.o[1] - d.r]); ext([d.o[0] + d.r, d.o[1] + d.r]); } else if (d.k === 'text') ext(d.p); });
    return x0 > x1 ? null : { x0, y0, x1, y1 };
  }
  // view = {cx, cy (sheet point at the canvas centre), s (px per sheet unit)}; sheet y is UP, canvas y is DOWN
    // the scale is never <= 0: a card still flying out is a few px wide, and a negative scale gives a negative arc radius (IndexSizeError in WebKit)
  const fit = (b, w, h, pad) => { pad = pad === undefined ? 24 : pad; const s = Math.max(1e-9, Math.min((w - 2 * pad) / ((b.x1 - b.x0) || 1), (h - 2 * pad) / ((b.y1 - b.y0) || 1))); return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s }; };
  const sx = (v, x, w) => w / 2 + (x - v.cx) * v.s, sy = (v, y, h) => h / 2 - (y - v.cy) * v.s;
  function paintCanvas(ctx, list, v, w, h) {
    ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.lineJoin = 'round';
    list.forEach(d => {
      ctx.strokeStyle = d.c; ctx.fillStyle = d.c; ctx.beginPath();
      if (d.k === 'line') { ctx.moveTo(sx(v, d.a[0], w), sy(v, d.a[1], h)); ctx.lineTo(sx(v, d.b[0], w), sy(v, d.b[1], h)); ctx.stroke(); }
      else if (d.k === 'poly') { d.pts.forEach((p, i) => i ? ctx.lineTo(sx(v, p[0], w), sy(v, p[1], h)) : ctx.moveTo(sx(v, p[0], w), sy(v, p[1], h))); if (d.closed) ctx.closePath(); ctx.stroke(); }
      else if (d.k === 'fill') { ctx.globalAlpha = 0.35; d.pts.forEach((p, i) => i ? ctx.lineTo(sx(v, p[0], w), sy(v, p[1], h)) : ctx.moveTo(sx(v, p[0], w), sy(v, p[1], h))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      else if (d.k === 'circle') { ctx.arc(sx(v, d.o[0], w), sy(v, d.o[1], h), Math.max(0, d.r * v.s), 0, Math.PI * 2); ctx.stroke(); }
      else if (d.k === 'arc') { ctx.arc(sx(v, d.o[0], w), sy(v, d.o[1], h), Math.max(0, d.r * v.s), -d.a0 * Math.PI / 180, -d.a1 * Math.PI / 180, true); ctx.stroke(); }
      else if (d.k === 'text') { const px = Math.max(6, d.h * v.s); ctx.font = px + 'px sans-serif'; ctx.textAlign = d.mid ? 'center' : 'left'; ctx.textBaseline = d.mid ? 'middle' : 'alphabetic'; ctx.save(); ctx.translate(sx(v, d.p[0], w), sy(v, d.p[1], h)); if (d.rot) ctx.rotate(-d.rot * Math.PI / 180); ctx.fillText(d.s, 0, 0); ctx.restore(); }
    });
  }
  function toSVG(list, b, bg) {
    const f = n => Number(n.toFixed(2)), W = b.x1 - b.x0, H = b.y1 - b.y0, Y = y => f(b.y1 - y), X = x => f(x - b.x0), o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" width="1400" height="' + Math.round(1400 * H / W) + '"><rect width="100%" height="100%" fill="' + (bg || '#14171c') + '"/>');
    list.forEach(d => {
      const st = 'stroke="' + d.c + '" fill="none" stroke-width="' + f(W / 1400) + '"';
      if (d.k === 'line') o.push('<line x1="' + X(d.a[0]) + '" y1="' + Y(d.a[1]) + '" x2="' + X(d.b[0]) + '" y2="' + Y(d.b[1]) + '" ' + st + '/>');
      else if (d.k === 'poly') o.push('<polyline points="' + d.pts.concat(d.closed ? [d.pts[0]] : []).map(p => X(p[0]) + ',' + Y(p[1])).join(' ') + '" ' + st + '/>');
      else if (d.k === 'fill') o.push('<polygon points="' + d.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ') + '" fill="' + d.c + '" fill-opacity="0.35"/>');
      else if (d.k === 'circle') o.push('<circle cx="' + X(d.o[0]) + '" cy="' + Y(d.o[1]) + '" r="' + f(d.r) + '" ' + st + '/>');
      else if (d.k === 'arc') { const p = a => [X(d.o[0] + d.r * Math.cos(a * Math.PI / 180)), Y(d.o[1] + d.r * Math.sin(a * Math.PI / 180))], a = p(d.a0), z = p(d.a1), sweep = ((d.a1 - d.a0) % 360 + 360) % 360; o.push('<path d="M' + a + ' A' + f(d.r) + ' ' + f(d.r) + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 0 ' + z + '" ' + st + '/>'); }
      else if (d.k === 'text') o.push('<text x="' + X(d.p[0]) + '" y="' + Y(d.p[1]) + '" font-size="' + f(Math.max(d.h, 1)) + '" fill="' + d.c + '"' + (d.mid ? ' text-anchor="middle" dominant-baseline="middle"' : '') + (d.rot ? ' transform="rotate(' + (-d.rot) + ' ' + X(d.p[0]) + ' ' + Y(d.p[1]) + ')"' : '') + '>' + String(d.s).replace(/[<&]/g, '') + '</text>');
    });
    o.push('</svg>'); return o.join('\n');
  }
  return { parse, toDrawList, bounds, fit, paintCanvas, toSVG, ACI };
});
