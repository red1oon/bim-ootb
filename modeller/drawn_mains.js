// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — drawn-mains READER, prompts/DISC_WALK_DRAWN_MAINS.md §3, §4, §4.2a, §4.3, §5. Witness: modeller/tests/witness_drawn_mains.js (W-DRAWN-MAINS). Read the log after every run.
// Reads plan-level duct centrelines from ALREADY-PARSED DXF entities into a route record: a piece is a drawn piece and nothing else (no bridging, no z, no depth, no invented main).
// Also reads drawn FIRE-FIGHTING EQUIPMENT as point items (prompts/DISC_WALK_DRAWN_MAINS.md §10): own role, independent of the centreline role.
// Pure: no DOM, no fs, no parsing. Layer patterns and terminal words are data rows (modeller/drawn_mains_rules.json), passed in by the caller.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.DrawnMains = factory(); })(this, function () {
  'use strict';
  const JOIN_M = 0.05, TERM_M = 1.0, OVER_M = 5, FIT_MEDIAN_MM = 50, FIT_MIN_TAGS = 5, WIDTH_EQ_M = 0.010, PAR_SIN = Math.sin(Math.PI / 180);
  const log = s => console.log(s);
  const f3 = v => (Math.round(v * 1000) / 1000).toString();

  // ---- entity helpers (units: sheet entities in sheet units; everything below is metres in the sheet frame) ----
  function segsOf(e, k) {   // [[x0,y0,x1,y1],...] in metres; LINE and (LW)POLYLINE segments, nothing else
    const v = e.vertices || []; if (e.type === 'LINE') return v.length >= 2 ? [[v[0].x * k, v[0].y * k, v[1].x * k, v[1].y * k]] : [];
    if (e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') return [];
    const o = []; for (let i = 0; i + 1 < v.length; i++) o.push([v[i].x * k, v[i].y * k, v[i + 1].x * k, v[i + 1].y * k]);
    if (e.shape && v.length > 2) o.push([v[v.length - 1].x * k, v[v.length - 1].y * k, v[0].x * k, v[0].y * k]);
    return o;
  }
  const matcher = rx => { const r = rx ? new RegExp(rx, 'i') : null; return l => !!r && r.test(l || ''); };
  function ptSeg(px, py, s) {   // distance point -> segment
    const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy; let t = L2 ? ((px - s[0]) * dx + (py - s[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s[0] + t * dx), py - (s[1] + t * dy));
  }
  function segSeg(a, b) {       // distance segment -> segment (0 when they cross)
    const d1x = a[2] - a[0], d1y = a[3] - a[1], d2x = b[2] - b[0], d2y = b[3] - b[1], den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) > 1e-12) { const t = ((b[0] - a[0]) * d2y - (b[1] - a[1]) * d2x) / den, u = ((b[0] - a[0]) * d1y - (b[1] - a[1]) * d1x) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0; }
    return Math.min(ptSeg(a[0], a[1], b), ptSeg(a[2], a[3], b), ptSeg(b[0], b[1], a), ptSeg(b[2], b[3], a));
  }
  function segBox(s, bx, tol) {  // segment meets box expanded by tol (Liang-Barsky)
    const x0 = bx[0] - tol, y0 = bx[1] - tol, x1 = bx[2] + tol, y1 = bx[3] + tol, dx = s[2] - s[0], dy = s[3] - s[1]; let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy], q = [s[0] - x0, x1 - s[0], s[1] - y0, y1 - s[1]];
    for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; } else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
    return true;
  }
  function blockBox(b, k) {     // local AABB of a block definition's geometry, metres; null when it holds none
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    ((b && b.entities) || []).forEach(e => {
      if (e.type === 'CIRCLE' && e.center) { add((e.center.x - e.radius) * k, (e.center.y - e.radius) * k); add((e.center.x + e.radius) * k, (e.center.y + e.radius) * k); }
      else (e.vertices || []).forEach(v => add(v.x * k, v.y * k));
    });
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }
  function insertBox(ins, lb, k) {   // block local box -> parent frame, the insert's own transform as drawn (a negative scale is applied as drawn)
    if (!lb) return null; const px = (ins.position ? ins.position.x : 0) * k, py = (ins.position ? ins.position.y : 0) * k, sx = ins.xScale == null ? 1 : ins.xScale, sy = ins.yScale == null ? 1 : ins.yScale;
    const a = (ins.rotation || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [[lb[0], lb[1]], [lb[2], lb[1]], [lb[2], lb[3]], [lb[0], lb[3]]].forEach(p => { const lx = p[0] * sx, ly = p[1] * sy, x = px + c * lx - s * ly, y = py + s * lx + c * ly; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    return [x0, y0, x1, y1];
  }
  // MTEXT carries formatting codes: {\fArial|b0;A}, \H2.5;, \P. Strip them; the tag is what is left.
  function plainText(e) {
    let t = String(e.text == null ? '' : e.text); if (e.type !== 'MTEXT') return t.trim();
    t = t.replace(/\\[Pp]/g, ' ').replace(/\\[fFHhWwQqTtAaCc][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/\\([\\{}])/g, '$1').replace(/[{}]/g, ''); return t.trim();
  }

  // ---- frame fit (§4.2, §4.2a): one grid_guid at a time ----
  function sheetGridTags(entities, rows, k, reach) {
    const isL = matcher(rows.grid_line), isT = matcher(rows.grid_tag), lines = [], texts = [];
    entities.forEach(e => { if (e.type === 'TEXT' || e.type === 'MTEXT') { if (isT(e.layer)) { const p = e.startPoint || e.position; if (p) texts.push({ tag: plainText(e), x: p.x * k, y: p.y * k }); } } else if (isL(e.layer)) segsOf(e, k).forEach(s => lines.push(s)); });
    const claim = new Map();   // line index -> nearest tag
    texts.forEach(t => { let bi = -1, bd = Infinity; lines.forEach((s, i) => { const d = Math.min(Math.hypot(t.x - s[0], t.y - s[1]), Math.hypot(t.x - s[2], t.y - s[3])); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0 && bd <= reach) { const c = claim.get(bi); if (!c || bd < c.d) claim.set(bi, { tag: t.tag, d: bd }); } });
    const byTag = {}; claim.forEach((c, i) => { (byTag[c.tag] = byTag[c.tag] || []).push(lines[i]); });
    const out = {}; let dup = 0; Object.keys(byTag).forEach(t => { if (byTag[t].length === 1) out[t] = byTag[t][0]; else dup++; });   // a tag drawn on two lines of one sheet is ambiguous: left out
    return { tags: out, lines: lines.length, texts: texts.length, dup };
  }
  function fitOne(sheetTags, axes) {   // axes: [{tag,x0..y1}] of ONE grid. returns { pass, rot, tx, ty, medMm, n }
    const pairs = []; axes.forEach(a => { const s = sheetTags[a.tag]; if (s) pairs.push({ s, b: [a.x0, a.y0, a.x1, a.y1] }); });
    const n = pairs.length; if (!n) return { pass: false, n: 0, medMm: null, why: 'no tag in common' };
    let sS = 0, sC = 0; pairs.forEach(p => { const d = Math.atan2(p.b[3] - p.b[1], p.b[2] - p.b[0]) - Math.atan2(p.s[3] - p.s[1], p.s[2] - p.s[0]); sS += Math.sin(2 * d); sC += Math.cos(2 * d); });
    const phi0 = 0.5 * Math.atan2(sS, sC); let best = null;
    [phi0, phi0 + Math.PI].forEach(phi => {
      const c = Math.cos(phi), s = Math.sin(phi); let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0; const eq = [];
      pairs.forEach(p => { const bx = p.b[2] - p.b[0], by = p.b[3] - p.b[1], bl = Math.hypot(bx, by) || 1, nx = -by / bl, ny = bx / bl, mx = (p.s[0] + p.s[2]) / 2, my = (p.s[1] + p.s[3]) / 2, rx = c * mx - s * my, ry = s * mx + c * my, r = nx * p.b[0] + ny * p.b[1] - (nx * rx + ny * ry); eq.push([nx, ny, r]); a11 += nx * nx; a12 += nx * ny; a22 += ny * ny; b1 += nx * r; b2 += ny * r; });
      const det = a11 * a22 - a12 * a12; if (!(det > 1e-9 * n * n)) return;   // all axes parallel: offset along them is undetermined
      const tx = (a22 * b1 - a12 * b2) / det, ty = (a11 * b2 - a12 * b1) / det, res = eq.map(q => Math.abs(q[0] * tx + q[1] * ty - q[2]) * 1000).sort((x, y) => x - y), med = n % 2 ? res[(n - 1) / 2] : (res[n / 2 - 1] + res[n / 2]) / 2;
      if (!best || med < best.medMm) best = { rot: phi, tx, ty, medMm: med, n };
    });
    if (!best) return { pass: false, n, medMm: null, why: 'axes do not fix an offset' };
    best.pass = n >= FIT_MIN_TAGS && best.medMm < FIT_MEDIAN_MM; if (!best.pass) best.why = n < FIT_MIN_TAGS ? 'only ' + n + ' tags matched (need ' + FIT_MIN_TAGS + ')' : 'median residual ' + f3(best.medMm) + ' mm (need < ' + FIT_MEDIAN_MM + ')';
    return best;
  }


  // ---- data rows -> reader arguments. rows: [{discipline, role, pattern, ...}] ----
  function rulesFrom(rows) {
    const by = {}, words = {}, equip = { layers: [], kinds: [] }; let heightRule = null, voidRule = null; (rows || []).forEach(r => { if (r.role === 'mount_height') heightRule = r; else if (r.role === 'no_void_height') voidRule = r; else if (r.role === 'equipment_layer') equip.layers.push(matcher(r.pattern)); else if (r.role === 'equipment_kind') equip.kinds.push({ kind: r.kind, rx: new RegExp(r.pattern, 'i'), ifc_class: r.ifc_class, predefined: r.predefined, object_type: r.object_type }); else if (/^terminal_/.test(r.role) && r.role !== 'terminal_layer') { const k = r.role.slice(9); (words[k] = words[k] || []).push(r.pattern); } else { const o = (by[r.discipline] = by[r.discipline] || { discipline: r.discipline }); o[r.role === 'terminal_layer' ? 'terminal' : r.role] = r.pattern; if (r.entity) o[(r.role === 'terminal_layer' ? 'terminal' : r.role) + '_entity'] = r.entity; } });
    return { layerRows: Object.keys(by).map(d => by[d]), terminalWords: words, equip: equip.layers.length && equip.kinds.length ? equip : null, heightRule, voidRule };
  }
  // ---- nested content (spec 4.3 amendment 1): lines, tags and inserts inside block inserts, recursively, each insert's transform applied (position, rotation, x/y scale; a negative scale is applied as drawn) ----
  function expand(ents, blocks, skip) {
    const out = ents.slice(); let nested = 0; const missing = new Set();
    const tf = (m, x, y) => { const lx = x * m.sx, ly = y * m.sy; return { x: m.px + m.c * lx - m.s * ly, y: m.py + m.s * lx + m.c * ly }; };
    const walk = (ins, m, depth, seen) => {
      const b = (blocks || {})[ins.name]; if (!b) { missing.add(String(ins.name)); return; } if (depth > 8 || seen.indexOf(ins.name) >= 0) return; const bp = b.position || { x: 0, y: 0 };
      const mm = { px: m.px, py: m.py, c: m.c, s: m.s, sx: m.sx, sy: m.sy };
      (b.entities || []).forEach(e => {
        const T = (p) => tf(mm, p.x - bp.x, p.y - bp.y), c = Object.assign({}, e);
        if (e.type === 'INSERT') { const p = T(e.position || { x: 0, y: 0 }), sx = (e.xScale == null ? 1 : e.xScale) * mm.sx, sy = (e.yScale == null ? 1 : e.yScale) * mm.sy, rot = (e.rotation || 0) + Math.atan2(mm.s, mm.c) * 180 / Math.PI;
          c.position = { x: p.x, y: p.y, z: 0 }; c.xScale = sx; c.yScale = sy; c.rotation = rot; out.push(c); nested++;
          const a = rot * Math.PI / 180; if (!(skip && skip(c))) walk(c, { px: p.x, py: p.y, c: Math.cos(a), s: Math.sin(a), sx, sy }, depth + 1, seen.concat(ins.name)); return; }
        if (e.vertices) c.vertices = e.vertices.map(v => { const p = T(v); return { x: p.x, y: p.y, z: 0 }; });
        if (e.startPoint) c.startPoint = T(e.startPoint); if (e.position && e.type !== 'INSERT') c.position = T(e.position);
        out.push(c); nested++;
      });
    };
    ents.forEach(e => { if (e.type === 'INSERT' && !(skip && skip(e))) { const a = (e.rotation || 0) * Math.PI / 180; walk(e, { px: (e.position ? e.position.x : 0), py: (e.position ? e.position.y : 0), c: Math.cos(a), s: Math.sin(a), sx: e.xScale == null ? 1 : e.xScale, sy: e.yScale == null ? 1 : e.yScale }, 0, []); } });
    return { ents: out, nested, missing: Array.from(missing) };
  }
  // revision order: both numeric -> by number; else upper-case by length then text (A < B < ... < Z < AA). Equal = same.
  function cmpRev(a, b) { a = String(a == null ? '' : a).trim().toUpperCase(); b = String(b == null ? '' : b).trim().toUpperCase(); if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Math.sign(+a - +b); return (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0); }
  const sheetId = s => (s && typeof s === 'object') ? { number: String(s.number == null ? '?' : s.number), revision: String(s.revision == null ? '' : s.revision) } : { number: String(s == null ? '?' : s), revision: '' };

  // ---- reader ----
  /**
   * @param {{entities:Array, sheet:string, layerRows:Array, terminalWords:Object, grid:Array, blocks?:Object, unitM?:number, tagReachM?:number, variant?:Object}} a
   *   entities: parsed DXF entities. blocks: parsed DXF block table (name -> {entities}), gives a fitting block its box. variant: witness-only switches {touchJoin,noMirrorFix,nearestSystem}.
   * @returns {{sheet:Object, rows:Array}}
   */
  function read(a) {
    const t0 = Date.now(), sid = sheetId(a.sheet), sheet = sid.number, V = a.variant || {}, ents0 = a.entities || [], k = a.unitM || 0.001, reach = a.tagReachM || 2.0, res = { sheet: { sheet, revision: sid.revision }, rows: [] };
    const fin = () => { const ms = Date.now() - t0, heap = (typeof performance !== 'undefined' && performance.memory) ? performance.memory.usedJSHeapSize : (typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : null); log('§MAINS-COST sheet=' + sheet + ' ms=' + ms + ' heap_mb=' + (heap == null ? 'n/a' : (heap / 1048576).toFixed(1))); return res; };
    const rl = a.rules ? rulesFrom(a.rules) : { layerRows: a.layerRows, terminalWords: a.terminalWords, equip: null, heightRule: null }, EQ = rl.equip;
    res.equipment_height_rule = rl.heightRule || null;   // a data row (code default), exposed as held; the reader gives no z: it has no floor plane, placing at height is the walk's job
    // nested content: grid lines, tags and run layers may sit inside block inserts (amendment 1). Fitting-layer inserts keep their block as the box, not as content.
    const fitRx = (rl.layerRows || []).reduce((l, r) => l.concat([matcher(r.fitting), matcher(r.grid_tag)]), []); let nestedN = 0, ents = ents0, missingBlocks = [];   // fitting inserts keep their block as the box; a grid bubble is not content
    if (!V.topLevelOnly) { const ex = expand(ents0, a.blocks, e => fitRx.some(m => m(e.layer))); ents = ex.ents; nestedN = ex.nested; missingBlocks = ex.missing; }
    // layers by data row (§4.1)
    const runsDef = (rl.layerRows || []).filter(r => ents.some(e => matcher(r.centreline)(e.layer)))[0];
    // equipment is its own role (§10): top-level INSERTs only (the layer-0 linked model is background), independent of the centreline role
    const eqIns = EQ ? ents0.filter(e => e.type === 'INSERT' && e.position && EQ.layers.some(m => m(e.layer))) : [];
    const rowsDef = runsDef || (eqIns.length ? ((rl.layerRows || []).filter(r => r.grid_line)[0] || {}) : null);   // equipment-only sheet: the grid patterns come from any row that holds them
    if (!rowsDef) { res.sheet.inconclusive = 'no centreline layer'; log('§MAINS-INCONCLUSIVE sheet=' + sheet + ' reason=no centreline layer'); return fin(); }
    const isC = matcher(rowsDef.centreline), isO = matcher(rowsDef.outline), isF = e => e.type === 'INSERT' && (!rowsDef.fitting_entity || rowsDef.fitting_entity === 'INSERT') && matcher(rowsDef.fitting)(e.layer), isTm = matcher(rowsDef.terminal);
    // frame (§4.2, §4.2a)
    const grid = a.grid || [];
    if (!grid.length) return refuse('no named grid held on this route');
    const st = sheetGridTags(ents, rowsDef, k, reach), byG = {}; grid.forEach(g => { (byG[g.grid_guid] = byG[g.grid_guid] || []).push(g); });
    // Grid choice (amendment 3): lowest median; within TIE_MM the grid with more matched tags; then the grid on the sheet's own storey, if the caller states it.
    // A grid's storey only breaks a tie: it never gives a row a level.
    const TIE_MM = 1, sheetStorey = (a.sheet && typeof a.sheet === 'object' && a.sheet.storey) || null;
    const better = (f, b) => { if (!b) return true; if (f.medMm < b.medMm - TIE_MM) return true; if (f.medMm > b.medMm + TIE_MM) return false; if (f.n !== b.n) return f.n > b.n; if (sheetStorey && (f.storey === sheetStorey) !== (b.storey === sheetStorey)) return f.storey === sheetStorey; return f.medMm < b.medMm; };
    let best = null; const tried = [];
    Object.keys(byG).forEach(gid => { const f = fitOne(st.tags, byG[gid]); f.gid = gid; tried.push(f); log('§MAINS-FIT sheet=' + sheet + ' grid=' + gid + ' tags=' + f.n + ' median_mm=' + (f.medMm == null ? 'n/a' : f3(f.medMm)) + ' ' + (f.pass ? 'PASS' : 'FAIL ' + f.why)); f.storey = byG[gid][0].storey == null ? null : byG[gid][0].storey; if (f.pass && better(f, best)) best = f; });
    if (best && tried.filter(f => f.pass).length > 1) log('§MAINS-FIT-CHOICE sheet=' + sheet + ' grid=' + best.gid + ' tags=' + best.n + ' median_mm=' + f3(best.medMm) + ' of passing=' + tried.filter(f => f.pass).length + ' rule=lowest median, within ' + TIE_MM + ' mm the most tags, then the sheet storey' + (sheetStorey ? ' (' + sheetStorey + ')' : ' (none given)'));
    if (!best) { const nb = tried.slice().sort((x, y) => (y.n - x.n) || ((x.medMm == null ? 1e9 : x.medMm) - (y.medMm == null ? 1e9 : y.medMm)))[0]; return refuse('frame fit failed: ' + (nb ? 'best grid ' + nb.gid + ' ' + nb.why : 'no grid') + '; sheet tags=' + Object.keys(st.tags).length); }
    const cR = Math.cos(best.rot), sR = Math.sin(best.rot), toB = (x, y) => [cR * x - sR * y + best.tx, sR * x + cR * y + best.ty];
    // pieces: drawn centreline segments, nothing else (§3.1)
    const pieces = []; ents.forEach(e => { if (isC(e.layer)) segsOf(e, k).forEach(s => pieces.push({ s, kind: e.type })); });
    const outl = []; ents.forEach(e => { if (isO(e.layer)) segsOf(e, k).forEach(s => outl.push(s)); });
    const N = pieces.length, par = pieces.map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, uni = (i, j) => { i = find(i); j = find(j); if (i !== j) par[Math.max(i, j)] = Math.min(i, j); };
    // joints (§4.4): end to end within 50 mm, or both touching one fitting box. Interior touch with no fitting is not a joint.
    const bucket = new Map(), key = (x, y) => Math.floor(x / JOIN_M) + ',' + Math.floor(y / JOIN_M);
    pieces.forEach((p, i) => [[p.s[0], p.s[1]], [p.s[2], p.s[3]]].forEach(pt => { const kk = key(pt[0], pt[1]); (bucket.get(kk) || bucket.set(kk, []).get(kk)).push({ i, x: pt[0], y: pt[1] }); }));
    pieces.forEach((p, i) => [[p.s[0], p.s[1]], [p.s[2], p.s[3]]].forEach(pt => { const cx = Math.floor(pt[0] / JOIN_M), cy = Math.floor(pt[1] / JOIN_M); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (bucket.get((cx + dx) + ',' + (cy + dy)) || []).forEach(o => { if (o.i !== i && Math.hypot(o.x - pt[0], o.y - pt[1]) <= JOIN_M) uni(i, o.i); }); }));
    // Mirror (amendment 2.3): the converter negates an insert's X insertion point. Reflect the box about the Y axis only when it falls outside the sheet's own drawn extents (centreline + outline) and the reflection lands inside.
    let mirrored = 0, emptyBoxes = 0, fittings = 0, unjoined = 0, unjoinedRaw = 0, ex0 = Infinity, ey0 = Infinity, ex1 = -Infinity, ey1 = -Infinity;
    pieces.map(p => p.s).concat(outl).forEach(s => { ex0 = Math.min(ex0, s[0], s[2]); ex1 = Math.max(ex1, s[0], s[2]); ey0 = Math.min(ey0, s[1], s[3]); ey1 = Math.max(ey1, s[1], s[3]); });
    const hitsExt = b => b[2] >= ex0 - JOIN_M && b[0] <= ex1 + JOIN_M && b[3] >= ey0 - JOIN_M && b[1] <= ey1 + JOIN_M;
    ents.forEach(e => { if (isF(e)) {
      fittings++; let bx = insertBox(e, blockBox((a.blocks || {})[e.name], k), k); if (!bx) { emptyBoxes++; return; } const raw = bx;
      if (!V.noMirrorFix && N && !hitsExt(bx)) { const rf = [-bx[2], bx[1], -bx[0], bx[3]], cx = (rf[0] + rf[2]) / 2, cy = (rf[1] + rf[3]) / 2; if (cx >= ex0 && cx <= ex1 && cy >= ey0 - JOIN_M && cy <= ey1 + JOIN_M) { bx = rf; mirrored++; } }
      const hit = []; pieces.forEach((p, i) => { if (segBox(p.s, bx, JOIN_M)) hit.push(i); }); for (let q = 1; q < hit.length; q++) uni(hit[0], hit[q]);
      // fittings_unjoined (amendment 3): a fitting whose box touches no centreline piece; the same count with the mirror correction off, so the correction's effect reads from the log.
      if (!hit.length) unjoined++;
      if (bx !== raw) { if (!pieces.some(p => segBox(p.s, raw, JOIN_M))) unjoinedRaw++; } else if (!hit.length) unjoinedRaw++;
    } });
    if (V.touchJoin) for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (segSeg(pieces[i].s, pieces[j].s) <= JOIN_M) uni(i, j);   // witness-only broken variant
    const cid = {}; let nc = 0; const comp = pieces.map((_, i) => { const r = find(i); if (cid[r] == null) cid[r] = ++nc; return cid[r]; });
    // width (§4.5): a parallel outline each side at equal offset (<= 10 mm). No match = null.
    const width = pieces.map(p => {
      const s = p.s, L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (!L) return null; const ux = (s[2] - s[0]) / L, uy = (s[3] - s[1]) / L, nx = -uy, ny = ux, left = [], right = [];
      outl.forEach(q => { const qx = q[2] - q[0], qy = q[3] - q[1], ql = Math.hypot(qx, qy); if (!ql || Math.abs(qx * uy - qy * ux) / ql > PAR_SIN) return;
        const da = nx * (q[0] - s[0]) + ny * (q[1] - s[1]), db = nx * (q[2] - s[0]) + ny * (q[3] - s[1]); if (Math.abs(da - db) > 0.005) return;
        const ta = ux * (q[0] - s[0]) + uy * (q[1] - s[1]), tb = ux * (q[2] - s[0]) + uy * (q[3] - s[1]); if (Math.min(ta, tb) > L / 2 || Math.max(ta, tb) < L / 2) return;
        const d = (da + db) / 2; if (Math.abs(d) < WIDTH_EQ_M || Math.abs(d) > 2) return; (d > 0 ? left : right).push(Math.abs(d)); });
      let bw = null, bd = Infinity; left.forEach(l => right.forEach(r => { const dd = Math.abs(l - r); if (dd <= WIDTH_EQ_M && dd < bd) { bd = dd; bw = Math.round((l + r) * 1000); } })); return bw;
    });
    // system (§4.6): terminal kinds within 1 m of a component
    const words = rl.terminalWords || {}, terms = [];
    ents.forEach(e => { if (e.type !== 'INSERT' || isF(e) || !e.position) return; const nm = String(e.name || '').toUpperCase(); const kind = Object.keys(words).filter(w => (words[w] || []).some(x => nm.indexOf(String(x).toUpperCase()) >= 0))[0]; if (kind || isTm(e.layer)) terms.push({ kind: kind || null, x: e.position.x * k, y: e.position.y * k }); });   // a diffuser insert with no known word is a terminal of no kind
    const cand = {}; let noRun = 0;
    terms.forEach(t => { const dm = {}; pieces.forEach((p, i) => { const d = ptSeg(t.x, t.y, p.s); if (dm[comp[i]] == null || d < dm[comp[i]]) dm[comp[i]] = d; });
      let any = false; Object.keys(dm).forEach(c => { if (dm[c] <= TERM_M) { any = true; if (t.kind) (cand[c] = cand[c] || []).push({ kind: t.kind, d: dm[c] }); } }); if (!any) noRun++; });
    const sysOf = c => { const l = cand[c]; if (!l) return 'unknown'; if (V.nearestSystem) return l.slice().sort((x, y) => x.d - y.d)[0].kind; const ks = new Set(l.map(x => x.kind)); return ks.size === 1 ? Array.from(ks)[0] : 'mixed'; };
    // record: building coordinates, a drawn piece each
    let len = 0, wlen = 0; const clen = {};
    pieces.forEach((p, i) => { const L = Math.hypot(p.s[2] - p.s[0], p.s[3] - p.s[1]), a0 = toB(p.s[0], p.s[1]), a1 = toB(p.s[2], p.s[3]); len += L; clen[comp[i]] = (clen[comp[i]] || 0) + L; if (width[i] != null) wlen += L;
      res.rows.push({ sheet, piece: i + 1, x0: a0[0], y0: a0[1], x1: a1[0], y1: a1[1], component: comp[i], system: sysOf(comp[i]), width_drawn_mm: width[i], provenance: 'position=drawn;width=' + (width[i] == null ? 'none' : 'drawn') + ';system=derived;height=none' }); });
    // equipment (§10): point items at their drawn spots, building coordinates through the same fit; no z (no height is stated)
    let eqStacked = 0, eqUnknown = 0, eqMirrored = 0; const eqBy = {}, eqUnk = {}; res.equipment = [];
    if (eqIns.length) {
      let gx0 = ex0, gy0 = ey0, gx1 = ex1, gy1 = ey1; const isGL = matcher(rowsDef.grid_line); ents.forEach(e => { if (isGL(e.layer)) segsOf(e, k).forEach(s => { gx0 = Math.min(gx0, s[0], s[2]); gx1 = Math.max(gx1, s[0], s[2]); gy0 = Math.min(gy0, s[1], s[3]); gy1 = Math.max(gy1, s[1], s[3]); }); });
      const inX = (x, y) => x >= gx0 - JOIN_M && x <= gx1 + JOIN_M && y >= gy0 - JOIN_M && y <= gy1 + JOIN_M, kept = [];
      eqIns.forEach(e => {
        const nm = String(e.name || ''), hit = EQ.kinds.filter(q => q.rx.test(nm)), kinds = Array.from(new Set(hit.map(q => q.kind)));
        if (kinds.length !== 1) { eqUnknown++; eqUnk[nm] = (eqUnk[nm] || 0) + 1; return; }   // no word, or two kinds: not placed
        const q = hit[0]; let x = e.position.x * k, y = e.position.y * k;
        if (!V.noMirrorFix && !inX(x, y) && inX(-x, y)) { x = -x; eqMirrored++; }
        if (!V.noCollapse && kept.some(o => o.kind === q.kind && o.block === nm && Math.hypot(o.sx - x, o.sy - y) <= 0.010)) { eqStacked++; return; }
        const b = toB(x, y); kept.push({ kind: q.kind, block: nm, sx: x, sy: y });
        res.equipment.push({ sheet, item: res.equipment.length + 1, kind: q.kind, block: nm, x: b[0], y: b[1], z: null, ifc_class: q.ifc_class, predefined: q.predefined, object_type: q.object_type, provenance: 'drawn', fit_median_mm: best.medMm, fit_tags: best.n, grid_guid: best.gid });
        eqBy[q.kind] = (eqBy[q.kind] || 0) + 1;
      });
    }
    const over5 = Object.keys(clen).filter(c => clen[c] > OVER_M).length, share = len ? wlen / len : 0;
    res.sheet = { sheet, revision: sid.revision, nested: nestedN, fittings_unjoined: unjoined, fittings_unjoined_nomirror: unjoinedRaw, fit_rot_deg: best.rot * 180 / Math.PI, fit_dx: best.tx, fit_dy: best.ty, fit_median_mm: best.medMm, fit_tags: best.n, grid_guid: best.gid, pieces: N, length_m: len, components: nc, over5m: over5, width_share: share, terminals: terms.length, no_run: noRun, mirrored, refused: null, emptyBoxes, fittings, missingBlocks: missingBlocks.length };
    if (!runsDef) { res.sheet.inconclusive = 'no centreline layer'; log('§MAINS-INCONCLUSIVE sheet=' + sheet + ' reason=no centreline layer (runs only; equipment read)'); } else
    log('§MAINS-READ sheet=' + sheet + ' fit=rot:' + f3(res.sheet.fit_rot_deg) + 'deg,dx:' + f3(best.tx) + 'm,dy:' + f3(best.ty) + 'm,med:' + f3(best.medMm) + 'mm,tags:' + best.n + ',grid:' + best.gid + ' pieces=' + N + ' length=' + f3(len) + 'm components=' + nc + ' over5m=' + over5 + ' width_share=' + f3(share) + ' terminals=' + terms.length + ' no_run=' + noRun + ' mirrored=' + mirrored + ' fittings=' + fittings + ' fittings_unjoined=' + unjoined + ' fittings_unjoined_nomirror=' + unjoinedRaw + ' missingBlocks=' + missingBlocks.length);
    if (runsDef) log('§MAINS-MIRROR sheet=' + sheet + ' fired=' + (mirrored ? 'yes' : 'no') + ' n=' + mirrored + ' of fittings=' + fittings + ' extents=' + (N ? f3(ex0) + ',' + f3(ey0) + ',' + f3(ex1) + ',' + f3(ey1) : 'none'));
    if (eqIns.length) {
      res.sheet.equipment = res.equipment.length; res.sheet.equip_stacked = eqStacked; res.sheet.equip_unknown_kind = eqUnknown; res.sheet.equip_mirrored = eqMirrored;
      log('§MAINS-MIRROR sheet=' + sheet + ' role=equipment fired=' + (eqMirrored ? 'yes' : 'no') + ' n=' + eqMirrored + ' of inserts=' + eqIns.length);
      Object.keys(eqUnk).forEach(n => log('§MAINS-EQUIP-UNKNOWN sheet=' + sheet + ' block=' + n + ' n=' + eqUnk[n] + ' not placed'));
      log('§MAINS-EQUIP sheet=' + sheet + ' fit=rot:' + f3(res.sheet.fit_rot_deg) + 'deg,dx:' + f3(best.tx) + 'm,dy:' + f3(best.ty) + 'm,med:' + f3(best.medMm) + 'mm,tags:' + best.n + ',grid:' + best.gid + ' items=' + res.equipment.length + ' stacked=' + eqStacked + ' unknownKind=' + eqUnknown + ' byKind=' + JSON.stringify(eqBy) + ' mirrored=' + eqMirrored + ' missingBlocks=' + missingBlocks.length + ' height=none (not stated)');
    }
    if (missingBlocks.length) log('§MAINS-MISSING-BLOCKS sheet=' + sheet + ' n=' + missingBlocks.length + ' names=' + missingBlocks.join(','));
    return fin();
    function refuse(why) { res.sheet = { sheet, revision: sid.revision, refused: why }; log('§MAINS-REFUSE sheet=' + sheet + ' reason=' + why); return fin(); }
  }

  // ---- record (§4.3, §5): sql.js-style db.run. Only these three tables are written (drawn_route, drawn_route_sheet, drawn_equipment); re-reading a sheet replaces its rows. ----
  function write(db, result) {
    db.run('CREATE TABLE IF NOT EXISTS drawn_route(sheet TEXT, piece INTEGER, x0 REAL, y0 REAL, x1 REAL, y1 REAL, component INTEGER, system TEXT, width_drawn_mm REAL, provenance TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS drawn_route_sheet(sheet TEXT, sheet_number TEXT, revision TEXT, fit_rot_deg REAL, fit_dx REAL, fit_dy REAL, fit_median_mm REAL, fit_tags INTEGER, grid_guid TEXT, pieces INTEGER, length_m REAL, components INTEGER, over5m INTEGER, width_share REAL, terminals INTEGER, no_run INTEGER, mirrored INTEGER, refused TEXT)');
    const s = result.sheet; if (!s || !s.sheet) return 0;
    // the key is sheet number + revision, not the file name: a newer or same revision replaces, an older one is refused and the held rows stay
    const held = (db.exec('SELECT revision FROM drawn_route_sheet WHERE sheet_number=?', [s.sheet])[0] || { values: [] }).values;
    if (held.length && cmpRev(s.revision, held[0][0]) < 0) { s.writeRefused = 'older revision held (' + held[0][0] + ' > ' + (s.revision == null ? '' : s.revision) + ')'; log('§MAINS-REFUSE sheet=' + s.sheet + ' reason=' + s.writeRefused); return 0; }
    // drawn_equipment is created only when equipment exists (a mains-only database keeps exactly the two route tables)
    const eqRows = s.refused ? [] : (result.equipment || []), eqHeld = (db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='drawn_equipment'")[0] || { values: [] }).values.length > 0;
    if (eqRows.length && !eqHeld) db.run('CREATE TABLE drawn_equipment(sheet TEXT, item INTEGER, kind TEXT, block TEXT, x REAL, y REAL, ifc_class TEXT, predefined TEXT, object_type TEXT, provenance TEXT)');
    if (eqRows.length || eqHeld) db.run('DELETE FROM drawn_equipment WHERE sheet=?', [s.sheet]);
    eqRows.forEach(q => db.run('INSERT INTO drawn_equipment VALUES(?,?,?,?,?,?,?,?,?,?)', [q.sheet, q.item, q.kind, q.block, q.x, q.y, q.ifc_class, q.predefined, q.object_type, q.provenance]));   // equipment is its own role: a runs-INCONCLUSIVE sheet still keeps its equipment
    db.run('DELETE FROM drawn_route WHERE sheet=?', [s.sheet]); db.run('DELETE FROM drawn_route_sheet WHERE sheet_number=?', [s.sheet]);
    const why = s.refused || (s.inconclusive ? 'inconclusive: ' + s.inconclusive : null), v = f => (why ? null : f);
    db.run('INSERT INTO drawn_route_sheet VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [s.sheet, s.sheet, s.revision || '', v(s.fit_rot_deg), v(s.fit_dx), v(s.fit_dy), v(s.fit_median_mm), v(s.fit_tags), v(s.grid_guid), v(s.pieces), v(s.length_m), v(s.components), v(s.over5m), v(s.width_share), v(s.terminals), v(s.no_run), v(s.mirrored), why]);
    if (!why) result.rows.forEach(r => db.run('INSERT INTO drawn_route VALUES(?,?,?,?,?,?,?,?,?,?)', [r.sheet, r.piece, r.x0, r.y0, r.x1, r.y1, r.component, r.system, r.width_drawn_mm, r.provenance]));
    return why ? 0 : result.rows.length;
  }
  return { read, write, rulesFrom, expand, cmpRev, plainText };
});
