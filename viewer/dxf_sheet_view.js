/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — the 2D overlay's sheet renderer (prompts/DXF2BIM_FOUNDATION_LANE.md F7, W-OVERLAY-ENTITIES). Read the log after every run.
// Draws the DXF text the 2D writer produces (what you see is what you save): LINE, ARC, CIRCLE, LWPOLYLINE, solid HATCH, TEXT, and DIMENSION via its *D block;
// since §D82 also what a CAD office hands over: MTEXT (formatting codes stripped, attachment, rotation, box-width wrap), LEADER (its vertices + arrowhead) and SOLID.
// §D101 (prompts/DXF2BIM_ARCHITECT_REVIEW.md): DXF special codes (%%c Ø, %%d °, %%p ±); INSERT inside a block (dimension arrow ticks); a DIMENSION with no block name takes the *D block whose
// POINTs are its own definition points, and one with no block at all is drawn from those points (extension + dimension lines, the value per its DIMSTYLE); counted in stats.dim_*.
// No DOM at load; `paintCanvas` / `toSVG` are the two sinks over ONE draw list so the picture can be checked headless. Colours are AutoCAD ACI 1-9 only; a colour
// outside that table is drawn grey and COUNTED in `stats.unknown_colour`, never guessed. Log tags: §SHEET_PARSE §SHEET_DRAW.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.DxfSheetView = factory(); })(this, function () {
  'use strict';
  const ACI = { 1: '#ff3b3b', 2: '#ffe14d', 3: '#3ddc84', 4: '#3de0e0', 5: '#4d7dff', 6: '#ff4dff', 7: '#f2f2f2', 8: '#8a8a8a', 9: '#c0c0c0' };
  const N = Number;
  // group-code pairs -> {layers:{name:aci}, ents:[{type, layer, g:[[code,value]...]}], blocks:{name:[ents]}}
  function parse(text) {
    const L = text.split(/\r?\n/), pairs = []; for (let i = 0; i + 1 < L.length; i += 2) pairs.push([L[i].trim(), L[i + 1]]);
    const out = { layers: {}, ents: [], blocks: {}, header: {}, dimstyles: {}, blockBase: {} }; let sec = null, tab = null, cur = null, blk = null, layer = null, ds = null;
    const push = e => { (blk ? out.blocks[blk] : out.ents).push(e); };
    for (let i = 0; i < pairs.length; i++) {
      const c = pairs[i][0], v = pairs[i][1];
      if (c === '0' && v === 'SECTION') { sec = pairs[i + 1][1]; continue; }
      if (c === '0' && v === 'ENDSEC') { sec = null; cur = null; continue; }
      if (sec === 'TABLES') {
        if (c === '0') { layer = v === 'LAYER' ? {} : null; if (layer) tab = layer; ds = v === 'DIMSTYLE' ? {} : null; continue; }
        if (ds) { if (c === '2') out.dimstyles[v] = ds; else ds[c] = v; continue; }   // §D101 a dimension style's own values (140 DIMTXT, 271 DIMDEC, 277 DIMLUNIT, 40 DIMSCALE, 144 DIMLFAC)
        if (layer && c === '2') layer.name = v; if (layer && c === '62' && layer.name) out.layers[layer.name] = N(v);
        if (layer && c === '62' && !layer.name) layer.aci = N(v); if (layer && c === '2' && layer.aci !== undefined && !(layer.name in out.layers)) out.layers[v] = layer.aci;
        continue;
      }
      if (sec === 'BLOCKS' || sec === 'ENTITIES') {
        if (c === '0') { if (v === 'BLOCK') { cur = null; blk = '?'; continue; } if (v === 'ENDBLK') { blk = null; cur = null; continue; } if (sec === 'BLOCKS' && !blk) continue; cur = { type: v, layer: '0', g: [] }; push(cur); continue; }
        if (!cur) { if (blk === '?' && c === '2') { blk = v; out.blocks[blk] = []; } else if (blk && blk !== '?' && (c === '10' || c === '20')) (out.blockBase[blk] = out.blockBase[blk] || [0, 0])[c === '10' ? 0 : 1] = N(v); continue; }
        if (c === '8') cur.layer = v; else cur.g.push([c, v]);
      }
    }
    return out;
  }
  const gv = (e, code, i) => { let k = 0; for (const p of e.g) if (p[0] === code) { if (k === (i || 0)) return p[1]; k++; } return undefined; };
  const num = (e, code, d) => { const v = gv(e, code); return v === undefined ? d : N(v); };
  const all = (e, code) => e.g.filter(p => p[0] === code).map(p => p[1]);
  // §D101 the DXF special codes (TEXT and MTEXT): %%c diameter, %%d degree, %%p plus/minus, %%% percent, %%nnn a character code; %%u / %%o (underline / overline toggles) dropped
  function specials(s) { return String(s).replace(/%%(\d{3}|[cdpuo%])/gi, (m, k) => /^\d/.test(k) ? String.fromCharCode(N(k)) : ({ c: '\u00d8', d: '\u00b0', p: '\u00b1', '%': '%', u: '', o: '' })[k.toLowerCase()]); }
  // §D82 MTEXT's own markup -> plain lines: \P paragraph, \~ hard space, \S a^b; stacked, {...} groups and every \X...; or \X code dropped (fonts, heights, colours, widths)
  function mtextPlain(s) {
    return specials(s).replace(/\\\\/g, '\u0000').replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ').replace(/\\S([^;]*);/g, (m, a) => a.replace(/[#^]/, '/'))
      .replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '').replace(/\\[LlOoKkNnX]/g, '').replace(/[{}]/g, '').replace(/\u0000/g, '\\').split('\n');
  }
  // §D82 a box width (41) wraps a paragraph at the word before it would pass the width; a character is taken as 0.6 x the text height wide (no font metrics in a DOM-free module)
  function wrap(lines, h, width) { if (!(width > 0)) return lines; const max = Math.max(1, Math.floor(width / (0.6 * h))), out = [];
    lines.forEach(l => { let cur = ''; l.split(' ').forEach(w => { if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }); out.push(cur); }); return out; }
  // draw list: [{k:'line'|'poly'|'fill'|'circle'|'arc'|'text', layer, ...}] in sheet units (mm); y UP (flipped by the sinks)
  function toDrawList(P) {
    const list = [], stats = { by_type: {}, drawn_by_type: {}, unknown_colour: 0 };
    const col = (aci) => { if (aci in ACI) return ACI[aci]; stats.unknown_colour++; (stats.unknown_aci = stats.unknown_aci || {})[aci] = 1 + ((stats.unknown_aci || {})[aci] || 0); return '#9a9a9a'; };
    const lay = n => col(P.layers[n] === undefined ? 7 : P.layers[n]);
    const draw = (e, inBlk, depth) => {
      const t = e.type, layer = e.layer, c = lay(layer); if (!inBlk) stats.by_type[t] = (stats.by_type[t] || 0) + 1;
      const ok = k => { if (inBlk) stats.block_parts = (stats.block_parts || 0) + 1; else stats.drawn_by_type[t] = (stats.drawn_by_type[t] || 0) + 1; return k; };
      if (t === 'LINE') list.push(ok({ k: 'line', layer, c, a: [num(e, '10'), num(e, '20')], b: [num(e, '11'), num(e, '21')] }));
      else if (t === 'CIRCLE') list.push(ok({ k: 'circle', layer, c, o: [num(e, '10'), num(e, '20')], r: num(e, '40') }));
      else if (t === 'ARC') list.push(ok({ k: 'arc', layer, c, o: [num(e, '10'), num(e, '20')], r: num(e, '40'), a0: num(e, '50'), a1: num(e, '51') }));
      else if (t === 'LWPOLYLINE') { const pts = []; const xs = e.g.filter(p => p[0] === '10'), ys = e.g.filter(p => p[0] === '20'); xs.forEach((p, i) => pts.push([N(p[1]), N(ys[i][1])])); list.push(ok({ k: 'poly', layer, c, pts, closed: (num(e, '70', 0) & 1) === 1 })); }
      else if (t === 'HATCH') { const hc = num(e, '62', 256); const i93 = e.g.findIndex(p => p[0] === '93'), pts = []; for (let i = i93 + 1; i < e.g.length; i++) { if (e.g[i][0] === '10' && e.g[i + 1] && e.g[i + 1][0] === '20') pts.push([N(e.g[i][1]), N(e.g[i + 1][1])]); if (e.g[i][0] === '97') break; } list.push(ok({ k: 'fill', layer, c: hc === 256 ? c : col(hc), pts })); }
      else if (t === 'TEXT') list.push(ok({ k: 'text', layer, c, p: [num(e, '10'), num(e, '20')], h: num(e, '40'), s: specials(gv(e, '1') || ''), rot: num(e, '50', 0), mid: num(e, '72', 0) === 1 }));
      else if (t === 'DIMENSION') dimension(e, inBlk, depth);
      else if (t === 'INSERT') { if (insert(e, depth) && !inBlk) stats.drawn_by_type.INSERT = (stats.drawn_by_type.INSERT || 0) + 1; }
      else if (t === 'POINT') stats.points = (stats.points || 0) + 1;   // a definition point: not plotted
      else if (t === 'MTEXT') { const h = num(e, '40', 1), dx = gv(e, '11'), rot = dx !== undefined ? Math.atan2(num(e, '21', 0), N(dx)) * 180 / Math.PI : num(e, '50', 0);
        list.push(ok({ k: 'mtext', layer, c: num(e, '62', 256) === 256 ? c : col(num(e, '62')), p: [num(e, '10'), num(e, '20')], h, rot, ap: num(e, '71', 1), lines: wrap(mtextPlain(all(e, '3').join('') + (gv(e, '1') || '')), h, num(e, '41', 0)) })); }
      else if (t === 'LEADER') { const xs = all(e, '10'), ys = all(e, '20'), pts = xs.map((x, i) => [N(x), N(ys[i])]);
        list.push(ok({ k: 'poly', layer, c, pts, closed: false }));
        if (num(e, '71', 1) === 1 && pts.length > 1) { const [a, b] = pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]), al = L / 8, ux = (b[0] - a[0]) / (L || 1), uy = (b[1] - a[1]) / (L || 1);   // presentation: an arrowhead 1/8 of the first segment, its base half as wide
          list.push({ k: 'fill', layer, c, solid: true, pts: [a, [a[0] + ux * al - uy * al / 4, a[1] + uy * al + ux * al / 4], [a[0] + ux * al + uy * al / 4, a[1] + uy * al - ux * al / 4]] }); } }
      else if (t === 'SOLID') { const q = ['10', '11', '12', '13'].map(k => gv(e, k) === undefined ? null : [num(e, k), num(e, String(N(k) + 10))]);   // DXF order 1, 2, 4, 3; no 4th corner = a triangle
        const pts = q[3] && !(q[3][0] === q[2][0] && q[3][1] === q[2][1]) ? [q[0], q[1], q[3], q[2]] : [q[0], q[1], q[2]]; list.push(ok({ k: 'fill', layer, c: num(e, '62', 256) === 256 ? c : col(num(e, '62')), solid: true, pts })); }
      else stats.unsupported = (stats.unsupported || 0) + 1;
    };
    // §D101 INSERT: the block's entities through the insert's point (10/20), scale (41/42) and rotation (50), about the block's base point; nesting <= 4
    function insert(e, depth) {
      const d = (depth || 0) + 1, name = gv(e, '2'), B = P.blocks[name]; if (!B || d > 4) { stats.insert_skipped = (stats.insert_skipped || 0) + 1; return false; }
      const from = list.length, base = P.blockBase[name] || [0, 0], ix = num(e, '10', 0), iy = num(e, '20', 0), sx = num(e, '41', 1), sy = num(e, '42', 1), r = num(e, '50', 0) * Math.PI / 180;
      B.forEach(b => draw(b, true, d));
      const cs = Math.cos(r), sn = Math.sin(r), m = p => { const x = (p[0] - base[0]) * sx, y = (p[1] - base[1]) * sy; return [ix + x * cs - y * sn, iy + x * sn + y * cs]; }, k = Math.abs(sx), deg = r * 180 / Math.PI;
      for (let i = from; i < list.length; i++) { const q = list[i];
        if (q.a) { q.a = m(q.a); q.b = m(q.b); } if (q.pts) q.pts = q.pts.map(m); if (q.o) { q.o = m(q.o); q.r *= k;
          if (q.k === 'arc') { const a0 = sx * sy < 0 ? (sx < 0 ? 180 - q.a1 : -q.a1) : q.a0, a1 = sx * sy < 0 ? (sx < 0 ? 180 - q.a0 : -q.a0) : q.a1; q.a0 = a0 + deg; q.a1 = a1 + deg; } }
        if (q.p) { q.p = m(q.p); q.h *= Math.abs(sy); q.rot = (q.rot || 0) + deg; } }
      stats.insert_parts = (stats.insert_parts || 0) + (list.length - from); return true;
    }
    // §D101 a DIMENSION: its named *D block; no name -> the *D block whose POINTs are its own definition points (13/23, 14/24, 10/20; tolerance 1e-6 x the point's magnitude);
    // no block at all -> a linear dimension (type 0 rotated / 1 aligned) drawn from those points: extension lines to the dimension line, the line, the value (group 1, '<>' = the measurement) per its
    // DIMSTYLE (DIMLUNIT 2 decimal with DIMDEC places x DIMLFAC; text height DIMTXT x DIMSCALE); any other type or unit format, or a style the file does not carry (U4) -> counted, the value not invented
    const defPts = e => [['13', '23'], ['14', '24'], ['10', '20']].filter(c => gv(e, c[0]) !== undefined).map(c => [num(e, c[0]), num(e, c[1])]);
    const near = (p, q) => Math.abs(p[0] - q[0]) <= 1e-6 * Math.max(1, Math.abs(p[0])) && Math.abs(p[1] - q[1]) <= 1e-6 * Math.max(1, Math.abs(p[1]));
    let dimBlocks = null;
    function dimension(e, inBlk, depth) {
      let name = gv(e, '2');
      if (name === undefined || !P.blocks[name]) {
        if (!dimBlocks) dimBlocks = Object.keys(P.blocks).filter(n => /^\*D/i.test(n)).map(n => ({ n, pts: P.blocks[n].filter(b => b.type === 'POINT').map(b => [num(b, '10', 0), num(b, '20', 0)]) })).filter(b => b.pts.length);
        const dp = defPts(e), hit = dp.length ? dimBlocks.filter(b => dp.every(p => b.pts.some(q => near(p, q)))) : [];
        name = hit.length === 1 ? hit[0].n : undefined; if (hit.length > 1) stats.dim_ambiguous = (stats.dim_ambiguous || 0) + 1;
      }
      if (name !== undefined && P.blocks[name]) { const from = list.length; P.blocks[name].forEach(b => draw(b, true, (depth || 0) + 1)); stats.dim_parts = (stats.dim_parts || 0) + (list.length - from); stats.dim_block = (stats.dim_block || 0) + 1; if (!inBlk) stats.drawn_by_type.DIMENSION = (stats.drawn_by_type.DIMENSION || 0) + 1; return; }
      const type = num(e, '70', 0) & 7, p13 = gv(e, '13') !== undefined ? [num(e, '13'), num(e, '23')] : null, p14 = gv(e, '14') !== undefined ? [num(e, '14'), num(e, '24')] : null, p10 = [num(e, '10', 0), num(e, '20', 0)];
      if ((type !== 0 && type !== 1) || !p13 || !p14) { stats.dim_unmatched = (stats.dim_unmatched || 0) + 1; return; }
      const ang = type === 0 ? num(e, '50', 0) * Math.PI / 180 : Math.atan2(p14[1] - p13[1], p14[0] - p13[0]), u = [Math.cos(ang), Math.sin(ang)];
      const foot = p => { const t = (p[0] - p10[0]) * u[0] + (p[1] - p10[1]) * u[1]; return [p10[0] + t * u[0], p10[1] + t * u[1]]; }, f1 = foot(p13), f2 = foot(p14), layer = e.layer, c = lay(layer);
      [[p13, f1], [p14, f2], [f1, f2]].forEach(s => list.push({ k: 'line', layer, c, a: s[0], b: s[1] }));
      const S = P.dimstyles[gv(e, '3') || 'Standard'] || null, sv = (k, d) => S[k] === undefined ? d : N(S[k]), unit = S ? sv('277', 2) : null, dec = S ? sv('271', 4) : 4, lf = S ? sv('144', 1) : 1, sc = S ? sv('40', 1) || 1 : 1, h = S ? sv('140', 0.18) * sc : 0.18;   // U4: a style the file does not carry formats nothing (the value is drawn only if stated literally); the defaults apply to a key the carried style omits (the DXF reference's)
      const meas = gv(e, '42') !== undefined ? num(e, '42') : Math.hypot(f2[0] - f1[0], f2[1] - f1[1]), given = gv(e, '1'), fmt = unit === 2 ? (meas * lf).toFixed(dec) : null;
      const txt = given && given !== '<>' && given.indexOf('<>') < 0 ? specials(given) : fmt === null ? null : given ? specials(given).replace('<>', fmt) : fmt;
      if (txt === null) { if (!S) stats.dim_style_missing = (stats.dim_style_missing || 0) + 1; else stats.dim_text_unformatted = (stats.dim_text_unformatted || 0) + 1; }
      else { let deg = ang * 180 / Math.PI; while (deg > 90) deg -= 180; while (deg <= -90) deg += 180;
        list.push({ k: 'text', layer, c, p: gv(e, '11') !== undefined ? [num(e, '11'), num(e, '21')] : [(f1[0] + f2[0]) / 2, (f1[1] + f2[1]) / 2], h, s: txt, rot: deg, mid: true }); }
      stats.dim_geom = (stats.dim_geom || 0) + 1; if (!inBlk) stats.drawn_by_type.DIMENSION = (stats.drawn_by_type.DIMENSION || 0) + 1;
    }
    P.ents.forEach(e => draw(e));
    return { list, stats };
  }
  function bounds(list) {
    let x0 = 1e300, y0 = 1e300, x1 = -1e300, y1 = -1e300; const ext = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    list.forEach(d => { if (d.k === 'line') { ext(d.a); ext(d.b); } else if (d.k === 'poly' || d.k === 'fill') d.pts.forEach(ext); else if (d.k === 'circle' || d.k === 'arc') { ext([d.o[0] - d.r, d.o[1] - d.r]); ext([d.o[0] + d.r, d.o[1] + d.r]); } else if (d.k === 'text' || d.k === 'mtext') ext(d.p); });
    return x0 > x1 ? null : { x0, y0, x1, y1 };
  }
  // view = {cx, cy (sheet point at the canvas centre), s (px per sheet unit)}; sheet y is UP, canvas y is DOWN
    // the scale is never <= 0: a card still flying out is a few px wide, and a negative scale gives a negative arc radius (IndexSizeError in WebKit)
  const fit = (b, w, h, pad) => { pad = pad === undefined ? 24 : pad; const s = Math.max(1e-9, Math.min((w - 2 * pad) / ((b.x1 - b.x0) || 1), (h - 2 * pad) / ((b.y1 - b.y0) || 1))); return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s }; };
  const sx = (v, x, w) => w / 2 + (x - v.cx) * v.s, sy = (v, y, h) => h / 2 - (y - v.cy) * v.s;
  function paintCanvas(ctx, list, v, w, h) {
    ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1; ctx.lineJoin = 'round';
    list.forEach(d => {
      ctx.strokeStyle = d.c; ctx.fillStyle = d.c; ctx.setLineDash(d.dash ? [6, 4] : []); ctx.lineWidth = d.w || 1; ctx.beginPath();
      if (d.k === 'line') { ctx.moveTo(sx(v, d.a[0], w), sy(v, d.a[1], h)); ctx.lineTo(sx(v, d.b[0], w), sy(v, d.b[1], h)); ctx.stroke(); }
      else if (d.k === 'poly') { d.pts.forEach((p, i) => i ? ctx.lineTo(sx(v, p[0], w), sy(v, p[1], h)) : ctx.moveTo(sx(v, p[0], w), sy(v, p[1], h))); if (d.closed) ctx.closePath(); ctx.stroke(); }
      else if (d.k === 'fill') { ctx.globalAlpha = d.solid ? 1 : 0.35; d.pts.forEach((p, i) => i ? ctx.lineTo(sx(v, p[0], w), sy(v, p[1], h)) : ctx.moveTo(sx(v, p[0], w), sy(v, p[1], h))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      else if (d.k === 'circle') { ctx.arc(sx(v, d.o[0], w), sy(v, d.o[1], h), Math.max(0, d.r * v.s), 0, Math.PI * 2); ctx.stroke(); }
      else if (d.k === 'arc') { ctx.arc(sx(v, d.o[0], w), sy(v, d.o[1], h), Math.max(0, d.r * v.s), -d.a0 * Math.PI / 180, -d.a1 * Math.PI / 180, true); ctx.stroke(); }
      else if (d.k === 'text') { const px = Math.max(6, d.h * v.s); ctx.font = px + 'px sans-serif'; ctx.textAlign = d.mid ? 'center' : 'left'; ctx.textBaseline = d.mid ? 'middle' : 'alphabetic'; ctx.save(); ctx.translate(sx(v, d.p[0], w), sy(v, d.p[1], h)); if (d.rot) ctx.rotate(-d.rot * Math.PI / 180); ctx.fillText(d.s, 0, 0); ctx.restore(); }
      else if (d.k === 'mtext') { const px = Math.max(6, d.h * v.s), col3 = (d.ap - 1) % 3, row = Math.floor((d.ap - 1) / 3), n = d.lines.length, y0 = row === 0 ? 0 : row === 1 ? -(n - 1) * 1.4 * px / 2 : -(n - 1) * 1.4 * px;
        ctx.font = px + 'px sans-serif'; ctx.textAlign = ['left', 'center', 'right'][col3]; ctx.textBaseline = ['top', 'middle', 'bottom'][row]; ctx.save(); ctx.translate(sx(v, d.p[0], w), sy(v, d.p[1], h)); if (d.rot) ctx.rotate(-d.rot * Math.PI / 180);
        d.lines.forEach((l, i) => ctx.fillText(l, 0, y0 + i * 1.4 * px)); ctx.restore(); }
    });
  }
  // opts (§D82): { mm: [w, h] } states the paper size (width / height in mm); items with d.grp go into <g id="dxf2bim-<grp>"> after the drawing, so a print without them drops that group whole
  function toSVG(list, b, bg, opts) {
    opts = opts || {}; const f = n => Number(n.toFixed(2)), W = b.x1 - b.x0, H = b.y1 - b.y0, Y = y => f(b.y1 - y), X = x => f(x - b.x0), o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" ' + (opts.mm ? 'width="' + opts.mm[0] + 'mm" height="' + opts.mm[1] + 'mm"' : 'width="1400" height="' + Math.round(1400 * H / W) + '"') + '><rect width="100%" height="100%" fill="' + (bg || '#14171c') + '"/>');
    const groups = []; list.forEach(d => { if (d.grp && groups.indexOf(d.grp) < 0) groups.push(d.grp); });
    const one = d => {
      const st = 'stroke="' + d.c + '" fill="none" stroke-width="' + f(W / 1400 * (d.w || 1)) + '"' + (d.dash ? ' stroke-dasharray="' + f(W / 230) + ' ' + f(W / 350) + '"' : '');
      if (d.k === 'line') o.push('<line x1="' + X(d.a[0]) + '" y1="' + Y(d.a[1]) + '" x2="' + X(d.b[0]) + '" y2="' + Y(d.b[1]) + '" ' + st + '/>');
      else if (d.k === 'poly') o.push('<polyline points="' + d.pts.concat(d.closed ? [d.pts[0]] : []).map(p => X(p[0]) + ',' + Y(p[1])).join(' ') + '" ' + st + '/>');
      else if (d.k === 'fill') o.push('<polygon points="' + d.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ') + '" fill="' + d.c + '" fill-opacity="' + (d.solid ? 1 : 0.35) + '"/>');
      else if (d.k === 'circle') o.push('<circle cx="' + X(d.o[0]) + '" cy="' + Y(d.o[1]) + '" r="' + f(d.r) + '" ' + st + '/>');
      else if (d.k === 'arc') { const p = a => [X(d.o[0] + d.r * Math.cos(a * Math.PI / 180)), Y(d.o[1] + d.r * Math.sin(a * Math.PI / 180))], a = p(d.a0), z = p(d.a1), sweep = ((d.a1 - d.a0) % 360 + 360) % 360; o.push('<path d="M' + a + ' A' + f(d.r) + ' ' + f(d.r) + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 0 ' + z + '" ' + st + '/>'); }
      else if (d.k === 'text') o.push('<text x="' + X(d.p[0]) + '" y="' + Y(d.p[1]) + '" font-size="' + f(Math.max(d.h, 1)) + '" fill="' + d.c + '"' + (d.mid ? ' text-anchor="middle" dominant-baseline="middle"' : '') + (d.rot ? ' transform="rotate(' + (-d.rot) + ' ' + X(d.p[0]) + ' ' + Y(d.p[1]) + ')"' : '') + '>' + String(d.s).replace(/[<&]/g, '') + '</text>');
      else if (d.k === 'mtext') { const c3 = (d.ap - 1) % 3, row = Math.floor((d.ap - 1) / 3), n = d.lines.length, hh = Math.max(d.h, 1), y0 = row === 0 ? hh : row === 1 ? -(n - 1) * 1.4 * hh / 2 + hh / 2 : -(n - 1) * 1.4 * hh;
        o.push('<text font-size="' + f(hh) + '" fill="' + d.c + '" text-anchor="' + ['start', 'middle', 'end'][c3] + '"' + (d.rot ? ' transform="rotate(' + (-d.rot) + ' ' + X(d.p[0]) + ' ' + Y(d.p[1]) + ')"' : '') + '>' +
          d.lines.map((l, i) => '<tspan x="' + X(d.p[0]) + '" y="' + f(Y(d.p[1]) + y0 + i * 1.4 * hh) + '">' + String(l).replace(/[<&]/g, '') + '</tspan>').join('') + '</text>'); }
    };
    list.forEach(d => { if (!d.grp) one(d); });
    groups.forEach(g => { o.push('<g id="dxf2bim-' + g + '">'); list.forEach(d => { if (d.grp === g) one(d); }); o.push('</g>'); });
    o.push('</svg>'); return o.join('\n');
  }
  return { parse, toDrawList, bounds, fit, paintCanvas, toSVG, ACI };
});
