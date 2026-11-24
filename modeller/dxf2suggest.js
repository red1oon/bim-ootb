// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2suggest.js — the editor's SUGGESTION rules (§L4.1 PR-UNITS/VIEW/NAME/SET/FACE/HAXIS/GRID/Z, §L7.11 PR-GRID-TICK + PR-Z-GROUND), extracted from dxf_meta_editor.js (lane §L8):
// pure, no window, no editor state. create(ctx) -> { proposalsFor(sheet), unitsK, txtPos, get1, viewOf, canonOne }.
//   sheet  = { name, dxf (parsed), marks: [{ key, value, x, y, source? }] }
//   ctx    = { MK: Dxf2Marks, sheets(): all sheets, gridLayers(sheet): grid layer names (the set's + stated), levelLayers(): level-line layer names }
// A suggestion is NEVER a marking until the caller accepts it; ambiguous or absent evidence is `refused` with the reason.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./element_defaults.json'));
  else root.Dxf2Suggest = factory(null);
})(typeof self !== 'undefined' ? self : this, function (REF) {
  'use strict';
  // §D115 item 3: the layer rules judge a layer by what it draws, through the READERS' own tests (exported by dxf2bodies / dxf2doors / dxf2panels / dxf2section / dxf2hatch); node: require, page: the loaded globals
  var G = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : {});
  function dep(name, file) { return typeof module === 'object' && module.exports && typeof require === 'function' ? require('./' + file) : G[name]; }
  var LAYER = 'DXF2BIM-MARK';
  var SET_PLACEHOLDER = 'BUILD-NAME';   // §D98: the set name offered when no sheet states one (DXF2BIM_ARCHITECT_REVIEW.md §D98)
  var HEADER_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };   // DXF $INSUNITS codes (the reader's table, dxf2qualify.js)
  var SINGLE_POS = { GRIDX: 'x', GRIDH: 'x', GRIDY: 'y', Z: 'y', TAG: 'xy', GRIDA: 'xy' };   // canonical: the position that carries meaning
  function num(v) { return String(Number(Number(v).toFixed(6))); }
  function get1(sh, key) { var m = sh.marks.filter(function (q) { return q.key === key; })[0]; return m || null; }
  function viewOf(sh) { var m = get1(sh, 'VIEW'); return m ? m.value : null; }
  function posOf(key, x, y) { var p = SINGLE_POS[key]; return p === 'x' ? { x: x, y: 0 } : p === 'y' ? { x: 0, y: y } : p === 'xy' ? { x: x, y: y } : { x: 0, y: 0 }; }
  function canonOne(m) { var p = SINGLE_POS[m.key], s = '@' + m.key + '=' + m.value; return p === 'x' ? s + '@x=' + num(m.x) : p === 'y' ? s + '@y=' + num(m.y) : p === 'xy' ? s + '@' + num(m.x) + ',' + num(m.y) : s; }
  // §D107 a text as read: MTEXT format codes stripped (\\fArial;, \\L, \\P, braces); a TEXT comes through unchanged
  function plain(e) { return String((e && e.text) || '').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/\\P/g, ' ').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').trim(); }
  function family(l) { var m = /^([A-Z])[A-Z0-9]+$/.exec(String(l)); return m ? m[1] : ''; }
  function layerOf(m) { var c = m.value.lastIndexOf(','); return c > 0 ? { layer: m.value.slice(0, c).trim(), type: m.value.slice(c + 1).trim() } : null; }

  // stripMarks(original): drop every TEXT/MTEXT entity on DXF2BIM-MARK from the ENTITIES section (group-code walk; nothing else touched)
  function stripMarks(text) {
    var eol = text.indexOf('\r\n') >= 0 ? '\r\n' : '\n', L = text.split(/\r?\n/), out = [], inEnt = false, i = 0;
    while (i + 1 < L.length) {
      var c = L[i].trim(), v = L[i + 1].trim();
      if (c === '0' && v === 'SECTION' && L[i + 2] !== undefined && L[i + 2].trim() === '2' && L[i + 3] !== undefined && L[i + 3].trim() === 'ENTITIES') inEnt = true;
      else if (inEnt && c === '0' && v === 'ENDSEC') inEnt = false;
      if (inEnt && c === '0' && (v === 'TEXT' || v === 'MTEXT')) {
        var j = i + 2, isMark = false;
        while (j + 1 < L.length && L[j].trim() !== '0') { if (L[j].trim() === '8' && L[j + 1].trim() === LAYER) isMark = true; j += 2; }
        if (isMark) { i = j; continue; }
        for (var k = i; k < j; k++) out.push(L[k]); i = j; continue;
      }
      out.push(L[i], L[i + 1]); i += 2;
    }
    for (; i < L.length; i++) out.push(L[i]);
    return out.join(eol);
  }
  // markText: a marking as its DXF text (the user's carry the source suffix when the grammar accepts it)
  function markText(m, byOk) { return m.raw !== undefined ? m.raw : '@' + m.key + '=' + m.value + (m.source === 'user' && byOk ? ' @BY=user' : ''); }
  // effText: the sheet's text with ITS markings (the file's own when unchanged), written through Dxf2Marks
  function effText(sh, MK, byOk) {
    var sig = JSON.stringify(sh.marks.map(function (m) { return [markText(m, byOk), m.x, m.y]; }));
    if (sh.fileSig && JSON.stringify(sh.fileSig) === sig) return sh.text;
    return MK.writeMarks(sh.stripped || (sh.stripped = stripMarks(sh.text)), sh.marks.map(function (m) { return { text: markText(m, byOk), x: m.x, y: m.y }; }));
  }

  function create(ctx) {
    var MK = ctx.MK, RULE_TOL = { reach: 0.700, along: 0.060, stated_grids: 2, flat: 1e-9, name_dx: 3.5, name_dy: 0.9, joint_row: 0.5, joint_cover: 0.9, most: 0.5, band_max: 0.5, mark_reach: 5.0, conc: 0.001 };   // §D115 layer rules: most = more than half; band_max = the bodies' widest band (m, registry bodies.pair_max_width); mark_reach = the bodies' type-mark reach (m); conc = concentric centres within (m, the fan reader's). §D115 joint_row: a beam line is at least half the longest; joint_cover: a joint line runs across 90 % of the rows' span   // §D107: reach, along = the earlier values, when a page has no registry; flat = the rule's horizontal line test; stated_grids = the fewest lines that make an axis a grid (the gate's own GRIDX(>=2))
    // §D107 a rule's setting: a sheet's @DEFAULT > the caller's choice > the registry. No registry at all (a page whose fetch failed) = undefined = the earlier behaviour
    function setting(key) {
      var v; ctx.sheets().some(function (o) { return (o.marks || []).some(function (m) { if (m.key === 'DEFAULT' && String(m.value).indexOf(key + ',') === 0) { v = String(m.value).slice(key.length + 1).trim(); return true; } return false; }); });
      if (v !== undefined) return v;
      if (ctx.setting) { v = ctx.setting(key); if (v !== undefined && v !== null && v !== '') return v; }
      return REF && REF.defaults && REF.defaults[key] ? REF.defaults[key].value : undefined;
    }
    function regionOf(sh) { var r = get1(sh, 'REGION'); if (!r) return null; var n = String(r.value).split(',').map(Number); return n.length === 4 && n.every(isFinite) ? [Math.min(n[0], n[2]), Math.min(n[1], n[3]), Math.max(n[0], n[2]), Math.max(n[1], n[3])] : null; }
  // ---- proposals (§L4.1 PR-*; evidence only; ambiguous -> refused with the reason) ----
    function unitsK(sh) { var u = get1(sh, 'UNITS'); if (u && MK.UNITS[u.value]) return MK.UNITS[u.value]; var h = HEADER_UNITS[sh.dxf.header && sh.dxf.header.$INSUNITS]; return h ? MK.UNITS[h] : null; }
    function txtPos(e) { var p = e.startPoint || e.position || {}; return [p.x, p.y]; }
    function propGrid(sh, vertical, out, refused, key) {     // mark_dx_set.js gridLines: grid-layer LINEs + exactly one 1-char label near an end
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-GRID', why: 'units unknown (no @UNITS, no $INSUNITS)' }); return; }
      var tolAx = 0.001 / k, along = (Number(setting('suggest.grid_along')) || RULE_TOL.along) / k, perp = (Number(setting('suggest.grid_reach')) || RULE_TOL.reach) / k, GL = ctx.gridLayers(sh).slice();
      if (setting('suggest.grid_layer') === 'name_has_grid') sh.dxf.entities.forEach(function (e) { if (e.type === 'LINE' && e.layer !== LAYER && /GRID/i.test(e.layer) && GL.indexOf(e.layer) < 0) GL.push(e.layer); });
      var labelRe = setting('suggest.grid_label') === 'letters_digits' ? /^([A-Z]{1,2}\d{0,2}|\d{1,3})$/ : /^([A-Z]{1,2}|\d{1,3})$/;
      if (vertical) { var skew = sh.dxf.entities.filter(function (e) { if (GL.indexOf(e.layer) < 0 || e.type !== 'LINE' || !e.vertices || e.vertices.length < 2) return false; var a = e.vertices[0], b = e.vertices[1]; return Math.abs(a.x - b.x) > tolAx && Math.abs(a.y - b.y) > tolAx; }).length;
        if (skew) {   // §D108 a rotated line with its label at one end is a plan grid line in its own direction
          var rotRead = 0, rotOn = setting('suggest.grid_rotated') === 'read' && key === 'GRIDX';
          if (rotOn) sh.dxf.entities.forEach(function (e) { if (GL.indexOf(e.layer) < 0 || e.type !== 'LINE' || !e.vertices || e.vertices.length < 2) return; var a = e.vertices[0], b = e.vertices[1]; if (Math.abs(a.x - b.x) <= tolAx || Math.abs(a.y - b.y) <= tolAx) return;
            var best = null, bd = Infinity, reachU = perp + along; sh.dxf.entities.forEach(function (t) { if ((t.type !== 'TEXT' && t.type !== 'MTEXT') || t.layer === LAYER || !labelRe.test(plain(t))) return; var p = txtPos(t); [a, b].forEach(function (en) { var dd = Math.hypot(p[0] - en.x, p[1] - en.y); if (dd <= reachU && dd < bd) { bd = dd; best = plain(t); } }); });
            if (!best) return; var ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 180) % 180; rotRead++;
            out.push({ rule: 'PR-GRID-A', key: 'GRIDA', value: best + ',' + Number(ang.toFixed(6)), x: Number(a.x.toFixed(3)), y: Number(a.y.toFixed(3)), why: 'grid line ' + e.handle + ' + label ' + best + ', at ' + Number(ang.toFixed(3)) + ' deg' }); });
          if (skew - rotRead > 0) refused.push({ rule: 'PR-GRID', why: (skew - rotRead) + ' grid line(s) not parallel to the sheet axes: not read' + (rotOn ? ' (no label at an end)' : ' (a rotated wing? suggest.grid_rotated)') }); } }
      var T = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && labelRe.test(plain(e)); });   // §D48 two-character labels (10..99, AA); §D107 A1, codes stripped
      var res = {};
      sh.dxf.entities.filter(function (e) { return GL.indexOf(e.layer) >= 0 && e.type === 'LINE' && e.vertices && e.vertices.length >= 2; }).forEach(function (l) {
        var a = l.vertices[0], b = l.vertices[1], isV = Math.abs(a.x - b.x) <= tolAx, isH = Math.abs(a.y - b.y) <= tolAx;
        if (vertical ? !isV : !isH) return;
        var c = vertical ? a.x : a.y;
        var labs = {}; T.forEach(function (t) { var p = txtPos(t), al = vertical ? p[0] : p[1], pp = vertical ? p[1] : p[0], d = Math.abs(al - c), lb = plain(t);
          if (d <= along && [a, b].some(function (en) { return Math.abs(pp - (vertical ? en.y : en.x)) <= perp; })) labs[lb] = Math.min(labs[lb] === undefined ? Infinity : labs[lb], d); });
        var L = Object.keys(labs);
        if (L.length > 1) {   // §D48 the label on the line wins: the one strictly nearest the axis (staggered bubbles of grids 40 mm apart put the neighbour's label within the tolerance)
          var dm = Math.min.apply(null, L.map(function (x) { return labs[x]; })), near = L.filter(function (x) { return labs[x] - dm <= tolAx; });
          if (near.length === 1) L = near;
        }
        if (L.length !== 1) { refused.push({ rule: 'PR-GRID', why: 'grid line ' + l.handle + ' has ' + L.length + ' candidate labels' + (L.length ? ' [' + L.join(',') + ']' : '') }); return; }
        if (res[L[0]] !== undefined && Math.abs(res[L[0]].c - c) > 1e-9) { refused.push({ rule: 'PR-GRID', why: 'label ' + L[0] + ' on two lines' }); res[L[0]].bad = true; return; }
        res[L[0]] = { c: Number(c.toFixed(3)), h: l.handle };
      });
      Object.keys(res).sort().forEach(function (lab) { if (res[lab].bad) return; var p = posOf(key, res[lab].c, res[lab].c);
        out.push({ rule: 'PR-GRID', key: key, value: lab, x: p.x, y: p.y, why: 'grid line ' + res[lab].h + ' + label ' + lab }); });
    }
    // §L7.11 PR-GRID-TICK: CAD grid labels sit next to the dimension chain's short extension ticks (the label text is inserted a little off the grid position).
    // A label's tick = the ONE short axis-aligned line within 0.5 m along / 1.0 m across; none or several -> refused with the reason; a tick shared by two labels -> both refused.
    function propGridTicks(sh, vertical, out, refused, key) {
      var k = unitsK(sh); if (!k) return;
      var tickMode = setting('suggest.grid_ticks'), bounded = tickMode === 'unless_stated', rg = bounded ? regionOf(sh) : null;
      if (tickMode === 'off') return;
      if (bounded) {   // §D107 a stated or read grid on this axis stands: guesses would only add false lines. Rows this rule itself wrote do not count, so a partly accepted list stays complete.
        var known = sh.marks.filter(function (m) { return m.key === key && m.rule !== 'PR-GRID-TICK'; }).length + out.filter(function (p) { return p.key === key && p.rule === 'PR-GRID'; }).length;
        if (known >= RULE_TOL.stated_grids) { refused.push({ rule: 'PR-GRID-TICK', why: known + ' grid lines are stated or read on this axis: no guesses (suggest.grid_ticks)' }); return; }
      }
      var have = {}; out.forEach(function (p) { if (p.key === key) have[p.value] = 1; });
      var along = 0.5 / k, across = 1.0 / k, shortL = 1.0 / k, tolAx = 0.001 / k;
      var T = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && /^([A-Z]|\d{1,3})$/.test(String(e.text || '').trim()); });
      var ticks = sh.dxf.entities.filter(function (e) { if (e.type !== 'LINE' || !e.vertices || e.vertices.length < 2) return false; var a = e.vertices[0], b = e.vertices[1];
        var axisOk = vertical ? Math.abs(a.x - b.x) <= tolAx : Math.abs(a.y - b.y) <= tolAx; return axisOk && Math.hypot(a.x - b.x, a.y - b.y) <= shortL && Math.hypot(a.x - b.x, a.y - b.y) > tolAx; });
      var claims = {}, pick = {};
      T.forEach(function (t) {
        var lab = String(t.text).trim(); if (have[lab]) return;
        var p = txtPos(t), al = vertical ? p[0] : p[1], ac = vertical ? p[1] : p[0];
        if (rg && !(p[0] >= rg[0] && p[0] <= rg[2] && p[1] >= rg[1] && p[1] <= rg[3])) return;   // §D107 outside the view this sheet states
        var cand = ticks.filter(function (e) { var a = e.vertices[0], b = e.vertices[1], c = vertical ? a.x : a.y;
          var ends = vertical ? [a.y, b.y] : [a.x, b.x]; return Math.abs(c - al) <= along && ends.some(function (v) { return Math.abs(v - ac) <= across; }); });
        if (cand.length > 1) refused.push({ rule: 'PR-GRID-TICK', why: 'label ' + lab + ': ' + cand.length + ' ticks within 0.5 m (ambiguous)' });
        if (cand.length !== 1) return;   // no tick near: not a grid label (dimension texts, elevations numbers): no noise
        var tk = cand[0], key2 = tk.handle; (claims[key2] = claims[key2] || []).push(lab); pick[lab] = { tick: tk, off: (vertical ? tk.vertices[0].x : tk.vertices[0].y) - al };
      });
      Object.keys(pick).sort().forEach(function (lab) {
        var tk = pick[lab].tick;
        if (claims[tk.handle].length > 1) { refused.push({ rule: 'PR-GRID-TICK', why: 'label ' + lab + ': its tick ' + tk.handle + ' is also claimed by ' + claims[tk.handle].filter(function (l) { return l !== lab; }).join(',') }); return; }
        var c = Number((vertical ? tk.vertices[0].x : tk.vertices[0].y).toFixed(3)), q = posOf(key, c, c);
        out.push({ rule: 'PR-GRID-TICK', key: key, value: lab, x: q.x, y: q.y, why: 'dimension tick ' + tk.handle + ' (label text is ' + Number(pick[lab].off.toFixed(2)) + ' ' + (unitsOf(sh) || 'units') + ' off it)' });
      });
    }
    function unitsOf(sh) { var u = get1(sh, 'UNITS'); return u ? u.value : null; }
    // §L7.11 PR-Z-GROUND: the lowest horizontal line group that is at least 60% of the longest one (and 30% of the sheet) = the ground line = z 0. No second @Z is invented.
    function propZGround(sh, out, refused) {
      var H = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.layer !== LAYER && e.vertices && e.vertices.length >= 2 && Math.abs(e.vertices[0].y - e.vertices[1].y) <= 1e-9; });
      var xs = []; sh.dxf.entities.forEach(function (e) { if (e.layer === LAYER || !e.vertices) return; e.vertices.forEach(function (v) { if (typeof v.x === 'number') xs.push(v.x); }); });
      if (!H.length || !xs.length) { refused.push({ rule: 'PR-Z-GROUND', why: 'no horizontal line' }); return; }
      var W = Math.max.apply(null, xs) - Math.min.apply(null, xs), by = {};
      H.forEach(function (e) { var y = Number(e.vertices[0].y.toFixed(4)); (by[y] = by[y] || { n: 0, len: 0, h: e.handle, max: 0 }); var L = Math.abs(e.vertices[0].x - e.vertices[1].x); by[y].len += L; by[y].n++; if (L > by[y].max) { by[y].max = L; by[y].h = e.handle; } });
      // the ground line may be drawn in segments: the lines at one y together must cover >= 80% of the sheet; of those y the LOWEST is the ground
      // reference = the longest line group (not the sheet width: text, leaders and a title block widen the sheet, the shed's West elevation draws its 764 in ground line on a 962 in wide sheet = 79%); of the groups
      // >= 60% of the longest, the LOWEST is the ground
      var maxLen = Math.max.apply(null, Object.keys(by).map(function (y) { return by[y].len; }));
      var ys = Object.keys(by).map(Number).filter(function (y) { return by[y].len >= 0.6 * maxLen && by[y].len >= 0.3 * W; }).sort(function (a, b) { return a - b; });
      if (!ys.length) { var best = Math.max.apply(null, Object.keys(by).map(function (y) { return by[y].len; })); refused.push({ rule: 'PR-Z-GROUND', why: 'no horizontal line (or line group at one height) covers 80% of the sheet; best ' + Math.round(100 * best / W) + '%' }); return; }
      var y0 = ys[0], g = by[y0];
      out.push({ rule: 'PR-Z-GROUND', key: 'Z', value: '0', x: 0, y: Number(y0.toFixed(3)), why: 'ground line ' + g.h + (g.n > 1 ? ' + ' + (g.n - 1) + ' more segment(s)' : '') + ' (lowest line group covering ' + Math.round(100 * g.len / maxLen) + '% of the longest one); a second @Z is yours to state' });
    }
    // §D96 PR-Z-DIM: the second height from the drawing's own dimension. A DIMENSION the CAD measures (no text override), whose measurement equals the vertical span of its
    // defpoints, on a file whose dimension scale factor is 1, states the sheet is drawn at full size: the line at its top is then z0 + (top - y0) x units. Inferred (orange).
    var ZDIM_TOL = { measure: 1e-6, factor: 1e-9, sameY: 1e-3 };   // §D96: measure = |dy| (relative), a scale factor other than 1, two y's taken as one line
    function dimScale(sh) {   // the file's $DIMLFAC and every DIMSTYLE record's 144 (the parser does not read the DIMSTYLE table): the first factor that is not 1, else 1
      var h = sh.dxf.header && sh.dxf.header.$DIMLFAC; if (h !== undefined && Math.abs(Number(h) - 1) > ZDIM_TOL.factor) return Number(h);
      var t = String(sh.text || ''), i = t.search(/\n\s*0\r?\n\s*TABLE\r?\n\s*2\r?\n\s*DIMSTYLE\r?\n/); if (i < 0) return 1;
      var j = t.indexOf('ENDTAB', i), seg = t.slice(i, j < 0 ? undefined : j), re = /\n\s*144\r?\n\s*([^\r\n]+)/g, m;
      while ((m = re.exec(seg))) if (Math.abs(Number(m[1]) - 1) > ZDIM_TOL.factor) return Number(m[1]);
      return 1; }
    function selfDims(sh) {   // §D96 the vertical dimensions the CAD measured itself (no text override, no per-dimension style, measure = the vertical span of its defpoints)
      return sh.dxf.entities.filter(function (e) { if (e.type !== 'DIMENSION' || e.layer === LAYER || !e.linearOrAngularPoint1 || !e.linearOrAngularPoint2) return false;
        if (e.text !== undefined && String(e.text).trim() !== '' && String(e.text).trim() !== '<>') return false;   // typed over: a person's figure, not the CAD's measure
        if ((e.extendedData && (e.extendedData.customStrings || []).some(function (q) { return /^DSTYLE$/i.test(String(q)); }))) return false;   // a per-dimension style override
        var m = Number(e.actualMeasurement), dy = Math.abs(e.linearOrAngularPoint1.y - e.linearOrAngularPoint2.y); return m > 0 && Math.abs(m - dy) <= ZDIM_TOL.measure * Math.max(1, m); }); }
    // §D114 the falsifier's switch of the three pre-fill rules (PR-Z-LABEL, PR-SET-TITLE, PR-BODYZ-DRAWN): CLI env / page global
    function noPrefill() { return !!((typeof process !== 'undefined' && process.env && process.env.DXF_NO_PREFILL) || (typeof window !== 'undefined' && window.DXF_NO_PREFILL)); }
    // §D114 PR-Z-LABEL: a level label (PL, FFL) written on a horizontal line whose y is an end of a CAD-measured vertical dimension: that line's height above the ground line is a datum
    var ZLABEL_RE = /^(?:P\.?\s?L\.?|PLINTH(?:\s+LEVEL)?|F\.?\s?F\.?\s?L\.?)$/i;
    function propZLabel(sh, out, refused) {
      if (noPrefill()) return;
      var labs = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && ZLABEL_RE.test(plain(e)); }); if (!labs.length) return;
      var zs = sh.marks.filter(function (q) { return q.key === 'Z'; }), g = zs.filter(function (q) { return Number(q.value) === 0; })[0];
      if (!g) { refused.push({ rule: 'PR-Z-LABEL', why: 'no ground @Z=0 on this sheet yet (accept the ground line first)' }); return; }
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-Z-LABEL', why: 'units unknown (no @UNITS, no $INSUNITS)' }); return; }
      var f = dimScale(sh); if (f !== 1) { refused.push({ rule: 'PR-Z-LABEL', why: 'dimension scale factor ' + f + ': the sheet is not drawn at full size' }); return; }
      var D = selfDims(sh), H = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.layer !== LAYER && e.vertices && e.vertices.length >= 2 && Math.abs(e.vertices[0].y - e.vertices[1].y) <= RULE_TOL.flat; });
      var gl = H.filter(function (l) { return Math.abs(l.vertices[0].y - g.y) <= ZDIM_TOL.sameY; })[0], yg = gl ? gl.vertices[0].y : g.y;   // the ground LINE's own y (the mark keeps 3 decimals)
      labs.forEach(function (t) {
        var p = txtPos(t), th = Number(t.textHeight || t.height) || 0, lab = plain(t);
        if (!(th > 0)) { refused.push({ rule: 'PR-Z-LABEL', why: 'label "' + lab + '" ' + t.handle + ' has no text height' }); return; }
        var below = H.filter(function (l) { var y = l.vertices[0].y; return y <= p[1] + RULE_TOL.flat && p[1] - y <= th; }); if (!below.length) { refused.push({ rule: 'PR-Z-LABEL', why: 'label "' + lab + '" ' + t.handle + ': no horizontal line within one text height under it' }); return; }
        var y = Math.max.apply(null, below.map(function (l) { return l.vertices[0].y; })), ln = below.filter(function (l) { return l.vertices[0].y === y; })[0];
        var dm = D.filter(function (d) { return Math.abs(d.linearOrAngularPoint1.y - y) <= ZDIM_TOL.sameY || Math.abs(d.linearOrAngularPoint2.y - y) <= ZDIM_TOL.sameY; })[0];
        if (!dm) { refused.push({ rule: 'PR-Z-LABEL', why: 'label "' + lab + '" ' + t.handle + ': its line ' + ln.handle + ' is no end of a CAD-measured dimension' }); return; }
        var z = Number((Number(g.value) + (y - yg) * k).toFixed(6)); if (Math.abs(z - Number(g.value)) < RULE_TOL.flat) return;
        if (zs.some(function (q) { return Math.abs(Number(q.value) - z) <= RULE_TOL.flat; }) || out.some(function (q) { return q.key === 'Z' && Math.abs(Number(q.value) - z) <= RULE_TOL.flat; })) return;   // a datum of that height stands (a typed one wins)
        out.push({ rule: 'PR-Z-LABEL', key: 'Z', value: String(z), x: 0, y: Number(y.toFixed(4)), why: 'label "' + lab + '" ' + t.handle + ' on line ' + ln.handle + ', an end of the CAD-measured dimension ' + dm.handle + ': ' + Number((y - yg).toFixed(4)) + ' drawing units above the ground line' });
      });
    }
    // §D114 PR-SET-TITLE: one "<X> FLOOR PLAN" title in the set, <X> not a storey, names the building (one word)
    var NOT_A_NAME = /^(?:TYPICAL|UPPER|LOWER|ROOF|GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|BASEMENT|MEZZANINE|\d+(?:ST|ND|RD|TH)|LEVEL\s*[-+]?\d+)$/i;
    function setFromTitles() {
      var by = {}; ctx.sheets().forEach(function (o) { (o.dxf.entities || []).forEach(function (e) { if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === LAYER) return;
        var m = /^(.+?)\s+FLOOR\s+PLAN$/i.exec(noScale(plain(e))); if (!m) return; var x = m[1].trim(); if (NOT_A_NAME.test(x) || STOREY_RE.test(x)) return;
        (by[x.toUpperCase()] = by[x.toUpperCase()] || []).push(o.name.replace(/\.dxf$/i, '') + ' "' + plain(e) + '"'); }); });
      return by; }
    function propZDim(sh, out, refused) {
      if ((typeof process !== 'undefined' && process.env && process.env.DXF_NO_ZDIM) || (typeof window !== 'undefined' && window.DXF_NO_ZDIM)) return;   // the falsifier's switch (CLI env / page global)
      var zs = sh.marks.filter(function (q) { return q.key === 'Z' && q.rule !== 'PR-Z-LABEL'; }); if (zs.length !== 1) return;   // §D114 a PL datum accepted first does not take this row away
      if (out.some(function (q) { return q.key === 'Z' && Math.abs(q.y - zs[0].y) > ZDIM_TOL.sameY; })) return;   // a datum the sheet's own texts give is proposed already (PR-Z): that one first
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-Z-DIM', why: 'units unknown (no @UNITS, no $INSUNITS)' }); return; }
      var f = dimScale(sh); if (f !== 1) { refused.push({ rule: 'PR-Z-DIM', why: 'dimension scale factor ' + f + ': the dimensions do not show the drawn size, a height is yours to state' }); return; }
      var c = selfDims(sh);
      if (!c.length) { refused.push({ rule: 'PR-Z-DIM', why: 'no self-measured vertical dimension (text not typed over, measure = its vertical span)' }); return; }
      var b = c.sort(function (p, q) { return q.actualMeasurement - p.actualMeasurement; })[0], top = Math.max(b.linearOrAngularPoint1.y, b.linearOrAngularPoint2.y), z0 = Number(zs[0].value), y0 = zs[0].y;
      if (!isFinite(z0) || !isFinite(y0) || Math.abs(top - y0) < ZDIM_TOL.measure) { refused.push({ rule: 'PR-Z-DIM', why: 'the dimension ends on the known datum' }); return; }
      var z = Number((z0 + (top - y0) * k).toFixed(6));
      out.push({ rule: 'PR-Z-DIM', key: 'Z', value: String(z), x: 0, y: Number(top.toFixed(4)), why: 'the drawing\'s own dimension ' + b.handle + ' (' + b.actualMeasurement + ', measured by the CAD, scale factor 1) shows the sheet at full size: the line at its top is @Z=' + zs[0].value + ' + ' + Number((top - y0).toFixed(4)) + ' drawing units' });
    }
    function propZ(sh, out, refused) {                          // mark_dx_set.js levelPairs: level text +-z.zzz paired by its own y or a level line
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-Z', why: 'units unknown' }); return; }
      var LL = ctx.levelLayers(), tol = 0.001 / k, seen = {};
      var labs = sh.dxf.entities.filter(function (e) { return e.type === 'TEXT' && e.layer !== LAYER && /([+-]\d+\.\d+)\s*$/.test(String(e.text || '').trim()) && (/LEVEL/.test(e.text) || LL.indexOf(e.layer) >= 0); })
        .map(function (e) { return { z: Number(/([+-]\d+\.\d+)\s*$/.exec(String(e.text).trim())[1]), y: txtPos(e)[1], h: e.handle }; });
      var lines = sh.dxf.entities.filter(function (e) { return LL.indexOf(e.layer) >= 0 && e.type === 'LINE' && e.vertices && Math.abs(e.vertices[0].y - e.vertices[1].y) <= 1e-9; });
      labs.forEach(function (l) { if (!seen[l.z] && Math.abs(l.y - l.z / k) <= tol) seen[l.z] = { y: Number(l.y.toFixed(3)), why: 'level text ' + l.h + ' at its own height' }; });
      labs.forEach(function (l) { if (seen[l.z]) return; var ln = lines.filter(function (q) { return Math.abs(q.vertices[0].y - l.z / k) <= tol; })[0];
        if (ln) seen[l.z] = { y: Number(ln.vertices[0].y.toFixed(3)), why: 'level text ' + l.h + ' + level line ' + ln.handle }; });
      if (setting('suggest.level_text') === 'value_on_line') {   // §D107 the value and the line are two facts that must agree: TEXT or MTEXT [EL:] +n.nn [m] + a horizontal line at exactly that height, on any layer
        var anyH = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.layer !== LAYER && e.vertices && e.vertices.length >= 2 && Math.abs(e.vertices[0].y - e.vertices[1].y) <= RULE_TOL.flat; });
        sh.dxf.entities.forEach(function (e) { if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === LAYER) return; var m = /^(?:EL[:.]?\s*)?([+-]\d+\.\d+)\s*m?$/i.exec(plain(e)); if (!m) return;
          var z = Number(m[1]); if (seen[z]) return; var ln = anyH.filter(function (q) { return Math.abs(q.vertices[0].y - z / k) <= tol; })[0];
          if (ln) seen[z] = { y: Number(ln.vertices[0].y.toFixed(3)), why: 'level text ' + e.handle + ' + line ' + ln.handle + ' at that height' }; });
      }
      Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }).forEach(function (z) { if (!out.some(function (q) { return q.rule === 'PR-Z' && Number(q.value) === z; })) out.push({ rule: 'PR-Z', key: 'Z', value: String(z), x: 0, y: seen[z].y, why: seen[z].why }); });
      if (!Object.keys(seen).length) refused.push({ rule: 'PR-Z', why: 'no level text pairs with its height or a level line' });
    }
    // §D46: '_' separates words in sheet names (FLOOR_LEVEL_1), so the storey test does not use \b, which treats '_' as a letter
    var STOREY_RE = /(?:^|[^A-Za-z0-9])(LEVEL[\s_]*[-+]?\d+|STOREY|STORY|BASEMENT|MEZZANINE|(GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|\d+(ST|ND|RD|TH))[\s_]+FLOOR)(?![A-Za-z0-9])/i;
    // §D46 (a) a title's core: its scale, a trailing parenthetical and a "PLAN - qualifier" tail removed (LEVEL 2 PLAN (FFL +3.800)  1:100 -> LEVEL 2 PLAN; ROOF PLAN - ROOF LEVEL (+10.900) -> ROOF PLAN)
    function noScale(t) { return String(t || '').trim().replace(/\s+(?:SCALE\s*)?1\s*:\s*\d+(?:\.\d+)?\s*$/i, '').trim(); }
    function titleCore(t) { return noScale(t).replace(/\s*\([^()]*\)\s*$/, '').replace(/^(.*?\b(?:PLAN|ELEVATION|SECTION))\s+-\s+.*$/i, '$1').trim(); }
    // §D46 (b) PR-LEVEL-TITLE: a plan / roof title holding "(<words> <signed decimal>)" states the level (metres, as PR-Z reads level texts)
    function propLevelTitle(sh, tl, out) {
      if (tl.length !== 1 || get1(sh, 'LEVEL')) return false;
      var m = /\(\s*(?:[A-Za-z][A-Za-z ./]*?\s*)?([+-]\d+\.\d+)\s*\)/.exec(noScale(tl[0])); if (!m) return false;
      out.push({ rule: 'PR-LEVEL-TITLE', key: 'LEVEL', value: String(Number(m[1])), x: 0, y: 0, why: 'title text "' + tl[0] + '"' }); return true;
    }
    // §D46 (c) PR-ROOF: "T/ROOF +10.695" / "TOP OF ROOF +10.695" on an elevation, section or roof plan states the roof top; two values on one sheet = refused
    function propRoof(sh, out, refused) {
      if (get1(sh, 'ROOF')) return;
      var vals = {}; sh.dxf.entities.forEach(function (e) { if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER) { var m = /^(?:T\/ROOF|TOP OF ROOF)\s*([+-]\d+\.\d+)$/i.exec(String(e.text || '').trim()); if (m) vals[String(Number(m[1]))] = String(e.text).trim(); } });
      var v = Object.keys(vals); if (!v.length) return;
      if (v.length > 1) { refused.push({ rule: 'PR-ROOF', why: v.length + ' different roof-top texts: ' + v.map(function (k) { return '"' + vals[k] + '"'; }).join(', ') }); return; }
      out.push({ rule: 'PR-ROOF', key: 'ROOF', value: v[0], x: 0, y: 0, why: 'text "' + vals[v[0]] + '"' });
    }
    // §D108 PR-LEVEL-NAME: an elevation names its level lines (HALL LEVEL 01 beside EL: +4.800 m); a plan whose title names the same level is at that value
    function levelNames() {
      var res = []; ctx.sheets().forEach(function (o) { var v = viewOf(o); if (v !== 'ELEV' && v !== 'SECTION') return; var k = unitsK(o); if (!k) return;
        var T = o.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER; }).map(function (e) { var p = txtPos(e); return { t: plain(e), x: p[0], y: p[1] }; });
        var vRe = /^(?:EL[:.]?\s*)?([+-]\d+\.\d+)\s*m?$/i, vals = T.filter(function (q) { return vRe.test(q.t); });
        T.forEach(function (n) { if (vRe.test(n.t) || !/[A-Za-z]{3}/.test(n.t)) return; var near = null, nd = Infinity;   // a name takes its nearest value, so a value between two names cannot be claimed by the wrong one
          vals.forEach(function (q) { if (Math.abs(n.x - q.x) > RULE_TOL.name_dx / k || Math.abs(n.y - q.y) > RULE_TOL.name_dy / k) return; var dd = Math.hypot(n.x - q.x, n.y - q.y); if (dd < nd) { nd = dd; near = q; } });
          if (near) res.push({ name: n.t.toUpperCase(), z: Number(vRe.exec(near.t)[1]) }); }); });
      return res; }
    function propLevelName(sh, tl, out, refused) {
      if (setting('suggest.level_name') !== 'read' || tl.length !== 1 || get1(sh, 'LEVEL')) return false;
      var t = String(tl[0]).toUpperCase(), L = /\bLEVEL\s*0*(\d+)\b/.exec(t), N = levelNames(), tests = [];
      if (L) tests.push(new RegExp('\\bLEVEL\\s*0*' + L[1] + '\\b'));
      ['ROOF', 'GROUND', 'BASEMENT'].forEach(function (w) { if (new RegExp('\\b' + w + '\\b').test(t)) tests.push(new RegExp('\\b' + w + '\\b')); });
      for (var i = 0; i < tests.length; i++) { var hit = N.filter(function (n) { return tests[i].test(n.name); }); if (!hit.length) continue;
        var cnt = {}; hit.forEach(function (h) { cnt[h.z] = (cnt[h.z] || 0) + 1; });   // the most-named value wins (best effort, the others are said in the row); a tie refuses with all of them
        var zs = Object.keys(cnt).map(Number).sort(function (a, b) { return cnt[b] - cnt[a]; });
        if (zs.length > 1 && cnt[zs[0]] === cnt[zs[1]]) { refused.push({ rule: 'PR-LEVEL-NAME', why: 'title "' + tl[0] + '" matches levels at ' + zs.join(' and ') }); return true; }
        var others = zs.slice(1).map(function (z) { return z + ' (' + cnt[z] + 'x)'; }).join(', ');
        out.push({ rule: 'PR-LEVEL-NAME', key: 'LEVEL', value: String(zs[0]), x: 0, y: 0, why: 'title "' + tl[0] + '" = level "' + hit.filter(function (h) { return h.z === zs[0]; })[0].name + '" on an elevation, ' + cnt[zs[0]] + 'x' + (others ? '; also named at ' + others : '') }); return true; }
      return false; }
    // §D109 P1 PR-LEVEL-FOOTING: a foundation plan no title or level name places states its own level: one distinct T/FOOTING value on the sheet; two values = refused with both
    function propLevelFooting(sh, out, refused) {
      if (setting('suggest.level_footing') !== 'read' || get1(sh, 'LEVEL')) return false;
      var v = {}; sh.dxf.entities.forEach(function (e) { if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER) { var m = /^T\/FOOTING\s*:?\s*([+-]\d+\.\d+)\s*m?$/i.exec(plain(e)); if (m) v[String(Number(m[1]))] = 1; } });
      var k = Object.keys(v); if (!k.length) return false;
      if (k.length > 1) { refused.push({ rule: 'PR-LEVEL-FOOTING', why: k.length + ' different T/FOOTING values: ' + k.join(', ') }); return true; }
      out.push({ rule: 'PR-LEVEL-FOOTING', key: 'LEVEL', value: k[0], x: 0, y: 0, why: 'the sheet states T/FOOTING ' + k[0] + ' m' }); return true;
    }
    function propLevel(sh, tl, out, refused) {   // §D37 PR-LEVEL: no plan of the set states a level and no title names a storey -> @LEVEL=0, inferred (orange)
      if (typeof process !== 'undefined' && process.env && process.env.DXF_NO_PRLEVEL) return;
      if (get1(sh, 'LEVEL')) return;
      var stated = ctx.sheets().filter(function (o) { var l = get1(o, 'LEVEL'); return viewOf(o) === 'PLAN' && l && l.rule !== 'PR-LEVEL'; });   // a level this rule's own accept wrote is not a stated one: the other plans keep their default
      if (stated.length) return;
      var names = []; ctx.sheets().filter(function (o) { return viewOf(o) === 'PLAN'; }).forEach(function (o) {   // the set's plans: sheet names + their title texts (a text ending PLAN)
        names.push(o.name); o.dxf.entities.forEach(function (e) { if (e.type === 'TEXT' && e.layer !== LAYER && /PLAN\s*$/i.test(String(e.text || '').trim())) names.push(String(e.text).trim()); }); });
      names = names.concat(tl);
      var hit = names.filter(function (n) { return STOREY_RE.test(String(n)); })[0];
      if (hit) { refused.push({ rule: 'PR-LEVEL', why: 'title "' + hit + '" names a storey: its level is not a default' }); return; }
      out.push({ rule: 'PR-LEVEL', key: 'LEVEL', value: '0', x: 0, y: 0, why: 'no plan of the set states a level and no title names a storey: the default ground level (the CLI\'s --level 0)' });
    }
    // §D114 PR-BODYZ-DRAWN: bodies of a kind on this plan that no elevation shows take the ONE z range the same kind's drawn bodies on this plan read from an elevation;
    // every other z range the elevations draw for that kind is named in the row (the open conflict). Needs the last check's result (ctx.bodies); none = no row.
    // §D115 PR-BODYZ-CHAIN (heights by precedence: the sheet that DIMENSIONS a height wins): a "<KIND> SECTION" detail whose vertical chain of ticks starts at a ground label (FGL / GL / NGL / EGL),
    // the lengths written between the ticks, one interval named by a letter a "<KIND> SCHEDULE" states (T = 12"): that interval is the body, z from the ground (z 0) down the chain
    var GROUND_RE = /^(?:F\.?G\.?L|N\.?G\.?L|E\.?G\.?L|G\.?L)\.?$/i, KIND_SEC = /^(FOOTING|COLUMN|BEAM)\s+SECTION$/i;
    function lenIn(t, k) { var s = String(t).replace(/\s+/g, ''), m = /^(\d+)'-?(\d+(?:\.\d+)?)?"?$/.exec(s); if (m) return (Number(m[1]) * 12 + Number(m[2] || 0)) * 0.0254;   // feet-inch -> metres
      m = /^(\d+(?:\.\d+)?)"$/.exec(s); if (m) return Number(m[1]) * 0.0254; m = /^(\d+(?:\.\d+)?)(?:mm)?$/.exec(s); return m && k ? Number(m[1]) * k : null; }
    function chainHeights() {
      var res = {}; ctx.sheets().forEach(function (o) { var k = unitsK(o); if (!k) return;
        var T = o.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER; }).map(function (e) { var p = txtPos(e); return { t: plain(e), x: p[0], y: p[1], h: Number(e.textHeight || e.height) || 0, handle: e.handle }; });
        T.filter(function (q) { return KIND_SEC.test(q.t); }).forEach(function (title) { var kind = KIND_SEC.exec(title.t)[1].toLowerCase();
          var ticks = o.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.layer !== LAYER && e.vertices && Math.abs(e.vertices[0].y - e.vertices[1].y) <= RULE_TOL.flat; });
          var grp = {}; ticks.forEach(function (e) { var a = Math.min(e.vertices[0].x, e.vertices[1].x), b = Math.max(e.vertices[0].x, e.vertices[1].x), key = a.toFixed(2) + '|' + b.toFixed(2); (grp[key] = grp[key] || { a: a, b: b, ys: [], h: [] }).ys.push(e.vertices[0].y); grp[key].h.push(e.handle); });
          var chains = Object.keys(grp).map(function (q) { return grp[q]; }).filter(function (g) { return g.ys.length >= 3; });
          var found = [];
          chains.forEach(function (g) { g.ys.sort(function (p, q) { return q - p; });   // top down
            var gl = T.filter(function (q) { return GROUND_RE.test(q.t) && q.h > 0 && g.ys.some(function (y) { return y <= q.y && q.y - y <= 2 * q.h; }); })[0]; if (!gl) return;
            var gi = g.ys.findIndex(function (y) { return y <= gl.y && gl.y - y <= 2 * gl.h; }), lab = [];
            for (var i = gi; i + 1 < g.ys.length; i++) { var y0 = g.ys[i], y1 = g.ys[i + 1], hit = T.filter(function (q) { return q.y < y0 && q.y > y1 && q.x >= g.a - 3 * q.h && q.x <= g.b + q.h && (lenIn(q.t, k) !== null || /^[A-Z]$/.test(q.t)); });
              if (hit.length !== 1) break; lab.push(hit[0]); }
            var li = lab.findIndex(function (q) { return /^[A-Z]$/.test(q.t); }); if (li < 0) return;
            var sched = T.filter(function (q) { return new RegExp('^' + kind + '\\s+SCHEDULE$', 'i').test(q.t); })[0]; if (!sched) return;
            var lv = T.filter(function (q) { return q.t === lab[li].t && q.handle !== lab[li].handle; }).map(function (q) { var b = T.filter(function (r) { return r.y < q.y && q.y - r.y <= 2 * q.h && Math.abs(r.x - q.x) <= 2 * q.h && lenIn(r.t, k) !== null; }).sort(function (p, r) { return r.y - p.y; })[0]; return b ? { v: lenIn(b.t, k), t: b.t, h: b.handle } : null; }).filter(Boolean);
            if (lv.length !== 1) return;
            var top = 0; for (var j = 0; j < li; j++) top -= lenIn(lab[j].t, k);
            found.push({ z0: Number((top - lv[0].v).toFixed(6)), z1: Number(top.toFixed(6)), why: o.name.replace(/\.dxf$/i, '') + ' "' + title.t + '": from the ground label "' + gl.t + '" down its dimension chain ' + lab.slice(0, li + 1).map(function (q) { return '"' + q.t + '"'; }).join(' + ') + ', "' + lab[li].t + '" = ' + lv[0].t + ' in the ' + sched.t });
          });
          if (found.length === 1) res[kind] = found[0]; else if (found.length > 1) res[kind] = { refused: found.length + ' chains in "' + title.t + '"' }; }); });
      return res; }
    function propBodyz(sh, out, refused) {
      if (noPrefill() || !ctx.bodies) return; var R = ctx.bodies(); if (!R || !R.gaps || !R.els) return;
      var CH = chainHeights();
      var need = {}; R.gaps.forEach(function (x) { if (x.code === 'GAP:body_no_elevation' && x.kind && x.sheet === sh.name) need[x.kind] = (need[x.kind] || 0) + 1; });
      Object.keys(need).sort().forEach(function (kind) {
        if (sh.marks.some(function (m) { return m.key === 'BODYZ' && String(m.value).split(',')[0] === kind; })) return;
        var src = R.els.filter(function (b) { return b.kind === kind && b.sheet === sh.name && b.height_source === 'elevation'; });
        var ch = CH[kind];   // §D115 precedence: a detail / section that dimensions the height outranks the elevation reading
        if (ch && ch.refused) refused.push({ rule: 'PR-BODYZ-CHAIN', why: ch.refused });
        else if (ch) { var dz = []; src.forEach(function (b) { if (!dz.some(function (r) { return r[0] === b.z0 && r[1] === b.z1; })) dz.push([b.z0, b.z1]); });
          out.push({ rule: 'PR-BODYZ-CHAIN', key: 'BODYZ', value: kind + ',' + num(ch.z0) + ',' + num(ch.z1), x: 0, y: 0, why: need[kind] + ' ' + kind + ' on this plan wait for a height: ' + ch.why + (dz.length ? '; OPEN: the elevation band reads ' + dz.map(function (r) { return num(r[0]) + '..' + num(r[1]); }).join(', ') + ' (the dimensioned detail outranks it)' : '') }); return; }
        if (!src.length) { refused.push({ rule: 'PR-BODYZ-DRAWN', why: need[kind] + ' ' + kind + ' waiting: no ' + kind + ' on this plan takes its z from an elevation' }); return; }
        var d = []; src.forEach(function (b) { var q = d.filter(function (r) { return r.z0 === b.z0 && r.z1 === b.z1; })[0]; if (q) q.n++; else d.push({ z0: b.z0, z1: b.z1, n: 1 }); });
        if (d.length > 1) { refused.push({ rule: 'PR-BODYZ-DRAWN', why: need[kind] + ' ' + kind + ' waiting: the drawn ones read ' + d.length + ' z ranges: ' + d.map(function (r) { return r.z0 + '..' + r.z1 + ' (' + r.n + 'x)'; }).join(', ') }); return; }
        var kr = R.bodies && R.bodies.report && R.bodies.report.kinds && R.bodies.report.kinds[kind], ez = (kr && kr.elev_z) || [], tol = 1e-6;
        var same = ez.filter(function (r) { return Math.abs(r.z0 - d[0].z0) <= tol && Math.abs(r.z1 - d[0].z1) <= tol; }), others = ez.filter(function (r) { return same.indexOf(r) < 0; });
        var from = []; same.forEach(function (r) { r.sheets.forEach(function (s) { if (from.indexOf(s) < 0) from.push(s.replace(/\.dxf$/i, '')); }); });
        out.push({ rule: 'PR-BODYZ-DRAWN', key: 'BODYZ', value: kind + ',' + num(d[0].z0) + ',' + num(d[0].z1), x: 0, y: 0,
          why: need[kind] + ' ' + kind + ' on this plan have no elevation: the ' + d[0].n + ' drawn here read z ' + num(d[0].z0) + '..' + num(d[0].z1) + ' m from the elevation band' + (from.length ? ' (' + from.join(', ') + ')' : '') +
            (others.length ? '; OPEN: the elevations also draw ' + kind + ' at ' + others.map(function (r) { return num(r.z0) + '..' + num(r.z1) + ' (' + r.n + 'x, ' + r.sheets.map(function (s) { return s.replace(/\.dxf$/i, ''); }).join('+') + ')'; }).join(', ') + ': check which is right' : '') });
      });
    }
    // §D115 PR-EXCLUDE-JOINT: on a plan layer typed beam, two merged parallel lines closer than the beam width that run across every beam row, nothing between them = an expansion joint
    function propJoint(sh, out, refused) {
      if (noPrefill() || (typeof process !== 'undefined' && process.env && process.env.DXF_NO_JOINT) || (typeof window !== 'undefined' && window.DXF_NO_JOINT)) return;   // DXF_NO_JOINT: the falsifier of this rule alone
      sh.marks.forEach(function (lm) { var l = lm.key === 'LAYER' && layerOf(lm); if (!l || l.type !== 'beam') return; var L = l.layer;
        if (sh.marks.some(function (m) { return m.key === 'EXCLUDE' && m.rule !== 'PR-EXCLUDE-JOINT'; })) return;   // a box the person drew stands
        var segs = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.layer === L && e.vertices && e.vertices.length >= 2; });
        [true, false].forEach(function (vert) {   // vert: joint lines vertical, beam rows horizontal
          var A = vert ? 'x' : 'y', B = vert ? 'y' : 'x', flat = RULE_TOL.flat * 1e3;
          var rowsL = segs.filter(function (e) { return Math.abs(e.vertices[0][A] - e.vertices[1][A]) > flat && Math.abs(e.vertices[0][B] - e.vertices[1][B]) <= flat; });
          var rows = {}; rowsL.forEach(function (e) { var c = Number(e.vertices[0][B].toFixed(3)); rows[c] = (rows[c] || 0) + Math.abs(e.vertices[0][A] - e.vertices[1][A]); });
          var rl = Object.keys(rows).map(Number), longest = Math.max.apply(null, rl.map(function (c) { return rows[c]; }).concat([0])); rl = rl.filter(function (c) { return rows[c] >= RULE_TOL.joint_row * longest; }).sort(function (a, b) { return a - b; });
          if (rl.length < 2) return;
          var gaps = []; for (var i = 1; i < rl.length; i++) gaps.push(rl[i] - rl[i - 1]); var w = Math.min.apply(null, gaps);   // the beam width: the smallest gap between the long rows
          var lo = rl[0], hi = rl[rl.length - 1], cols = {};
          segs.forEach(function (e) { if (Math.abs(e.vertices[0][A] - e.vertices[1][A]) > flat) return; var c = Number(e.vertices[0][A].toFixed(3)), a = Math.min(e.vertices[0][B], e.vertices[1][B]), b = Math.max(e.vertices[0][B], e.vertices[1][B]); (cols[c] = cols[c] || { pieces: [], h: [] }).pieces.push([a, b]); cols[c].h.push(e.handle); });
          var full = Object.keys(cols).map(Number).filter(function (c) { var cov = 0; cols[c].pieces.forEach(function (p) { cov += Math.max(0, Math.min(p[1], hi) - Math.max(p[0], lo)); }); return cov >= RULE_TOL.joint_cover * (hi - lo); }).sort(function (a, b) { return a - b; });
          var allC = Object.keys(cols).map(Number);
          for (var j = 1; j < full.length; j++) { var c1 = full[j - 1], c2 = full[j], g = c2 - c1;
            if (!(g > 0 && g < w) || allC.some(function (c) { return c > c1 && c < c2; })) continue;
            var ext = cols[c1].pieces.concat(cols[c2].pieces), e0 = Math.min.apply(null, ext.map(function (p) { return p[0]; })), e1 = Math.max.apply(null, ext.map(function (p) { return p[1]; }));
            var bx = [c1 - g, e0 - g, c2 + g, e1 + g], inside = rowsL.filter(function (e) { var a = Math.min(e.vertices[0][A], e.vertices[1][A]), b = Math.max(e.vertices[0][A], e.vertices[1][A]); return a > bx[0] && a < bx[2] && b > bx[2] && Math.abs(a - c2) > flat && Math.abs(a - c1) > flat; });
            if (inside.length) { refused.push({ rule: 'PR-EXCLUDE-JOINT', why: 'the close pair at ' + A + ' ' + c1 + ' / ' + c2 + ': a beam edge starts inside its box (' + inside[0].handle + ')' }); continue; }
            var box = vert ? bx : [bx[1], bx[0], bx[3], bx[2]];
            out.push({ rule: 'PR-EXCLUDE-JOINT', key: 'EXCLUDE', value: box.map(function (q) { return Number(q.toFixed(3)); }).join(','), x: 0, y: 0, why: 'layer ' + L + ' (beam): lines ' + cols[c1].h.concat(cols[c2].h).join('+') + ' at ' + A + ' ' + c1 + ' / ' + c2 + ' are ' + Number(g.toFixed(3)) + ' apart, closer than the beam width ' + Number(w.toFixed(3)) + ', and cross all ' + rl.length + ' beam lines: an expansion joint, not a member (box = the pair padded by its own gap)' });
          } }); });
    }

    // ---- §D115 item 3 layer meanings (PR-LAYER-*): a layer is judged by what it draws, through the readers' own tests; exactly ONE kind may fit it (two = a refusal naming both) ----
    var LAYER_RULE = { column: { rule: 'PR-LAYER-COLUMN' }, footing: { rule: 'PR-LAYER-FOOTING' }, beam: { rule: 'PR-LAYER-BEAM' }, doorswing: { rule: 'PR-LAYER-DOORSWING' }, panel: { rule: 'PR-LAYER-PANEL' }, net: { rule: 'PR-LAYER-NET' }, fan: { rule: 'PR-LAYER-FAN' }, bar: { rule: 'PR-LAYER-BAR' }, elevdoor: { rule: 'PR-LAYER-ELEVDOOR' } };   // one tier each (dxf_meta_editor TIER)
    var KIND_WORD = { column: /\bcolumn\b/i, beam: /\bbeam\b/i, fan: /\bfan\b/i };
    var SIZE_TOK = /((?:\d+'-?)?\d+(?:\.\d+)?["']?)\s*[xX×]\s*((?:\d+'-?)?\d+(?:\.\d+)?["']?)/;
    var LF = typeof WeakMap === 'function' ? new WeakMap() : null;   // the facts a drawing gives (memo per parsed drawing: the page asks again after every change)
    function textsOf(sh) { return sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER; }).map(function (e) { var p = txtPos(e); return { t: plain(e), x: p[0], y: p[1] }; }).filter(function (q) { return typeof q.x === 'number'; }); }
    function statedSizes() {   // the sizes the set states for a kind: one text holding the kind's word and `a"xb"` -> [{ a, b (m), text }]; and the type marks a long form `<Word>-<n>` names (Beam-1 -> B-1)
      var out = { column: [], beam: [], marks: { column: {}, beam: {}, fan: {} } };
      ctx.sheets().forEach(function (o) { textsOf(o).forEach(function (q) { Object.keys(KIND_WORD).forEach(function (kind) { if (!KIND_WORD[kind].test(q.t)) return;
        var sz = SIZE_TOK.exec(q.t); if (sz && /["']/.test(sz[1]) && /["']/.test(sz[2]) && out[kind]) { var a = lenIn(sz[1], null), b = lenIn(sz[2], null); if (a !== null && b !== null) out[kind].push({ a: a, b: b, text: q.t, sheet: o.name }); }
        var lf = new RegExp('(?:^|[^A-Za-z])' + KIND_WORD[kind].source.replace(/\\b/g, '') + '-(\\d+)', 'i').exec(q.t); if (lf) out.marks[kind][kind.charAt(0).toUpperCase() + '-' + lf[1]] = q.t; }); }); });
      return out; }
    function drawFacts(sh) {   // per sheet, from the drawing alone: texts, hatches, leaders with the labels they end at
      var f = LF && LF.get(sh.dxf); if (f && f.text === sh.text) return f;
      var H = dep('Dxf2Hatch', 'dxf2hatch.js'), k = unitsK(sh);
      f = { text: sh.text, T: textsOf(sh), hatches: sh.text && H ? H.parseHatches(sh.text).hatches : [], leaders: sh.text && H ? H.parseLeaders(sh.text) : [] };
      if (LF) LF.set(sh.dxf, f); return f; }
    function layersOf(sh) { var o = {}; sh.dxf.entities.forEach(function (e) { if (e.layer !== LAYER) o[e.layer] = 1; }); Object.keys(sh.hatchLayers || {}).forEach(function (l) { o[l] = 1; }); return Object.keys(o).sort(); }
    function rectsOf(sh, L) {   // closed 4-vertex axis-aligned rectangles of layer L: [{ x0, y0, x1, y1 }]
      return sh.dxf.entities.filter(function (e) { return e.type === 'LWPOLYLINE' && e.shape && e.layer === L && (e.vertices || []).length === 4; }).map(function (e) { var xs = e.vertices.map(function (v) { return v.x; }), ys = e.vertices.map(function (v) { return v.y; });
        return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys), e: e }; })
        .filter(function (r) { return r.e.vertices.every(function (v) { return (Math.abs(v.x - r.x0) <= RULE_TOL.flat * 1e3 || Math.abs(v.x - r.x1) <= RULE_TOL.flat * 1e3) && (Math.abs(v.y - r.y0) <= RULE_TOL.flat * 1e3 || Math.abs(v.y - r.y1) <= RULE_TOL.flat * 1e3); }); }); }
    function nIn(v) { return Number(Number(v).toFixed(3)); }
    function evColumn(sh, L, st, k) {   // 1: one square size, stated for a column anywhere in the set
      var R = rectsOf(sh, L); if (!R.length) return null; var w = R[0].x1 - R[0].x0, d = R[0].y1 - R[0].y0, tol = RULE_TOL.flat * 1e3;
      if (!R.every(function (r) { return Math.abs(r.x1 - r.x0 - w) <= tol && Math.abs(r.y1 - r.y0 - d) <= tol; }) || Math.abs(w - d) > tol) return null;
      var hit = st.column.filter(function (q) { return Math.abs(q.a - w * k) <= tol * k && Math.abs(q.b - d * k) <= tol * k; })[0]; if (!hit) return null;
      return { rects: R, why: R.length + ' closed squares ' + nIn(w) + ' x ' + nIn(d) + ' ' + (unitsOf(sh) || 'units') + ', the size "' + hit.text + '" (' + hit.sheet.replace(/\.dxf$/i, '') + ') states for a column' }; }
    function evFooting(sh, L, cols) {   // 2: one size, each encloses the centre of exactly ONE column square of this sheet
      var R = rectsOf(sh, L), C = []; cols.forEach(function (c) { C = C.concat(c.rects); }); if (!R.length || !C.length) return null; var w = R[0].x1 - R[0].x0, d = R[0].y1 - R[0].y0, tol = RULE_TOL.flat * 1e3;
      if (!R.every(function (r) { return Math.abs(r.x1 - r.x0 - w) <= tol && Math.abs(r.y1 - r.y0 - d) <= tol; })) return null;
      var own = R.map(function (r) { return C.filter(function (c) { var cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2; return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; }).length; });
      if (!own.every(function (n) { return n === 1; })) return null;
      return { why: R.length + ' closed rectangles ' + nIn(w) + ' x ' + nIn(d) + ', each under exactly one column square of this sheet (' + C.length + ' squares)' }; }
    function evBeam(sh, L, cols, st, k, refused) {   // 3: the bodies' own bands, a stated beam width, both ends on a column face, the marks beside them name a beam
      var B = dep('Dxf2Bodies', 'dxf2bodies.js'), P = dep('Dxf2Prep', 'dxf2prep.js'); if (!B || !P || !st.beam.length || !cols.length) return null;
      var snap = P.SNAP_TOL_DEFAULT, wmax = RULE_TOL.band_max / k, C = []; cols.forEach(function (c) { C = C.concat(c.rects); });
      var touch = function (x, y) { return C.some(function (c) { return x >= c.x0 - snap && x <= c.x1 + snap && y >= c.y0 - snap && y <= c.y1 + snap; }); };
      var bands = []; [true, false].forEach(function (hz) { B.bandRegions({ dxf: sh.dxf }, [L], snap, wmax, hz).forEach(function (b) { b.hz = hz; bands.push(b); }); });
      var cand = bands.filter(function (b) { return st.beam.some(function (q) { return Math.abs(q.a - b.width * k) <= snap * k; }); }); if (!cand.length) return null;
      var both = cand.filter(function (b) { var e0 = b.hz ? touch(b.x0, b.y0) || touch(b.x0, b.y1) : touch(b.x0, b.y0) || touch(b.x1, b.y0), e1 = b.hz ? touch(b.x1, b.y0) || touch(b.x1, b.y1) : touch(b.x0, b.y1) || touch(b.x1, b.y1); return e0 && e1; });
      if (!(both.length > RULE_TOL.most * cand.length)) return null;
      var T = textsOf(sh).filter(function (q) { return B.MARK_RE.test(q.t); }), marks = {}, nm = 0;
      both.forEach(function (b) { var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, best = null; T.forEach(function (q) { var d = Math.hypot(q.x - cx, q.y - cy); if (d <= RULE_TOL.mark_reach / k && (!best || d < best.d)) best = { t: q.t, d: d }; }); if (best) { marks[best.t] = (marks[best.t] || 0) + 1; nm++; } });
      var names = Object.keys(marks).sort(), unk = names.filter(function (m) { return !st.marks.beam[m]; });
      if (unk.length) { refused.push({ rule: LAYER_RULE.beam.rule, why: 'layer ' + L + ' on ' + sh.name + ': ' + both.length + ' bands of the stated beam width run column to column, but the marks beside them (' + unk.join(', ') + ') have no long form "<Word>-<n>" that names a beam: their kind is not stated' }); return null; }
      if (!names.length) return null;
      return { why: both.length + ' of ' + cand.length + ' bands of width ' + nIn(cand[0].width) + ' (the stated beam width) run column to column; marks ' + names.map(function (m) { return m + ' x' + marks[m] + ' = "' + st.marks.beam[m] + '"'; }).join(', ') }; }
    function evSwing(sh, L) {   // 4: the door reader's swing test (sweep + open leaf)
      var D = dep('Dxf2Doors', 'dxf2doors.js'); if (!D) return null; var sw = D.swingLeaves(sh.dxf.entities, [L]), ok = sw.filter(function (q) { return q.leaf.length; });
      return ok.length ? { why: ok.length + ' of ' + sw.length + ' quarter-turn arcs have an open leaf from the hinge (the door reader\'s swing symbol)' } : null; }
    function hatchesOn(sh, L) { return drawFacts(sh).hatches.filter(function (h) { return h.layer === L; }); }
    function evPanel(sh, L, k) {   // 5: a thickness label's leader tip inside a loop of this layer's (non-net) hatch
      var H = dep('Dxf2Hatch', 'dxf2hatch.js'), PN = dep('Dxf2Panels', 'dxf2panels.js'); if (!H || !PN) return null; var F = drawFacts(sh);
      var cands = F.T.filter(function (q) { return PN.LABEL.test(q.t); }).map(function (q) { return { text: q.t, at: [q.x, q.y], tips: [] }; }); H.attachTips(F.leaders, cands, PN.LABEL_REACH / k);
      var hs = hatchesOn(sh, L).filter(function (h) { return !PN.NET_RE.test(h.pattern || ''); }), n = 0, lab = {};
      cands.forEach(function (c) { c.tips.forEach(function (t) { if (hs.some(function (h) { return h.loops.some(function (l) { return l.closed && H.inPoly(t, l.pts); }); })) { n++; lab[c.text] = 1; } }); });
      return n ? { why: n + ' leader tip(s) of "' + Object.keys(lab).join('", "') + '" end inside a loop of its ' + hs.length + ' hatch(es) (' + hs.map(function (h) { return h.pattern; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')' } : null; }
    function evNet(sh, L) {   // 6: the net reader's own pattern list
      var PN = dep('Dxf2Panels', 'dxf2panels.js'); if (!PN) return null; var hs = hatchesOn(sh, L).filter(function (h) { return PN.NET_RE.test(h.pattern || '') && h.loops.some(function (l) { return l.closed; }); });
      return hs.length ? { why: hs.length + ' hatch(es) of the mesh pattern ' + hs.map(function (h) { return h.pattern; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') } : null; }
    function evFan(sh, L, k) {   // 7: concentric rings + a fan label whose leader ends inside the outer ring
      var H = dep('Dxf2Hatch', 'dxf2hatch.js'), PN = dep('Dxf2Panels', 'dxf2panels.js'); if (!H || !PN) return null; var F = drawFacts(sh), g = [];
      sh.dxf.entities.forEach(function (c) { if (c.type !== 'CIRCLE' || c.layer !== L || !c.center || !(c.radius > 0)) return; var q = g.filter(function (o) { return Math.hypot(o.cx - c.center.x, o.cy - c.center.y) <= RULE_TOL.conc / k; })[0]; if (!q) g.push({ cx: c.center.x, cy: c.center.y, r: c.radius, n: 1 }); else { q.n++; q.r = Math.max(q.r, c.radius); } });
      g = g.filter(function (o) { return o.n >= 2; }); if (!g.length) return null;
      var cands = F.T.filter(function (q) { return KIND_WORD.fan.test(q.t); }).map(function (q) { return { text: q.t, at: [q.x, q.y], tips: [] }; }); H.attachTips(F.leaders, cands, PN.LABEL_REACH / k);
      var hit = 0; cands.forEach(function (c) { c.tips.forEach(function (t) { if (g.some(function (o) { return Math.hypot(t[0] - o.cx, t[1] - o.cy) <= o.r; })) hit++; }); });
      return hit ? { why: g.length + ' groups of concentric rings; ' + hit + ' leader tip(s) of "' + (cands.filter(function (c) { return c.tips.length; })[0] || {}).text + '" end inside a ring' } : null; }
    function evBar(sh, L, k) {   // 8: a member-size label's leader tip on a LINE of this layer (the section reader's own tip distance)
      var H = dep('Dxf2Hatch', 'dxf2hatch.js'), SC = dep('Dxf2Section', 'dxf2section.js'); if (!H || !SC) return null; var F = drawFacts(sh);
      var cands = F.T.filter(function (q) { return !SC.NOT_SECTION.test(q.t) && SC.SIZE_RE.test(q.t); }).map(function (q) { return { text: q.t, at: [q.x, q.y], tips: [] }; }); H.attachTips(F.leaders, cands, SC.LABEL_REACH / k);
      var all = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.vertices && e.vertices.length >= 2; }), lines = all.filter(function (e) { return e.layer === L; }), n = 0, lab = {};
      var on = function (t, e) { return SC.segDist(t, [e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]) <= SC.TIP_ON / k; };
      cands.forEach(function (c) { c.tips.forEach(function (t) { if (lines.some(function (e) { return on(t, e); }) && !all.some(function (e) { return e.layer !== L && on(t, e); })) { n++; lab[c.text] = 1; } }); });   // a tip at a joint of two layers names neither
      return n ? { why: n + ' member-size label leader(s) ("' + Object.keys(lab).join('", "') + '") end on its ' + lines.length + ' lines' } : null; }
    function evElevDoor(sh, L, k) {   // 9: every cluster of the layer's line work is an inverted U (a head, no bottom line) standing on a floor line that runs past it
      var D = dep('Dxf2Doors', 'dxf2doors.js'), P = dep('Dxf2Prep', 'dxf2prep.js'); if (!D || !P) return null; var snap = P.SNAP_TOL_DEFAULT, items = [], bad = false;
      sh.dxf.entities.forEach(function (e) { if (e.layer !== L) return; if (e.type !== 'LINE' || !e.vertices || e.vertices.length < 2) { bad = true; return; } var a = e.vertices[0], b = e.vertices[1]; items.push([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), e]); });
      if (bad || !items.length) return null;
      var g = D.clusterItems(items, D.CLUSTER_SNAP / k), floor = sh.dxf.entities.filter(function (e) { return e.type === 'LINE' && e.vertices && e.vertices.length >= 2 && Math.abs(e.vertices[0].y - e.vertices[1].y) <= snap; }), n = 0;
      var ok = Object.keys(g).every(function (key) { var c = g[key], x0 = Math.min.apply(null, c.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, c.map(function (q) { return q[2]; })), y0 = Math.min.apply(null, c.map(function (q) { return q[1]; })), y1 = Math.max.apply(null, c.map(function (q) { return q[3]; }));
        var hz = c.filter(function (q) { return q[3] - q[1] <= snap; }), vt = c.filter(function (q) { return q[2] - q[0] <= snap; });
        if (hz.length + vt.length !== c.length || vt.length < 2 || !hz.length || !hz.every(function (q) { return Math.abs(q[1] - y1) <= snap; })) return false;   // head only, at the top
        var foot = vt.every(function (q) { return Math.abs(q[1] - y0) <= snap; }); if (!foot) return false;
        var fl = floor.some(function (e) { var a = Math.min(e.vertices[0].x, e.vertices[1].x), b = Math.max(e.vertices[0].x, e.vertices[1].x); return Math.abs(e.vertices[0].y - y0) <= snap && a < x0 - snap && b > x1 + snap; }); if (fl) n++; return fl; });
      return ok && n ? { why: n + ' door frame(s): an inverted U (head, no bottom line) standing on a floor line that runs past it on both sides' } : null; }
    function layerKinds(sh, v) {   // per layer of this sheet: the kinds that fit it, each with its evidence (the sheet's own geometry and texts)
      var k = unitsK(sh), res = {}; if (!k || noPrefill()) return res; var st = statedSizes(), refusedHere = [];
      var add = function (L, kind, ev) { if (ev) (res[L] = res[L] || []).push({ kind: kind, rule: LAYER_RULE[kind].rule, why: ev.why }); };
      if (v === 'PLAN') {
        var cols = []; layersOf(sh).forEach(function (L) { var ev = evColumn(sh, L, st, k); if (ev) { cols.push(ev); add(L, 'column', ev); } });
        var colL = layersOf(sh).filter(function (L) { return evColumn(sh, L, st, k); });
        layersOf(sh).forEach(function (L) { if (colL.indexOf(L) < 0) add(L, 'footing', evFooting(sh, L, cols)); add(L, 'beam', evBeam(sh, L, cols, st, k, refusedHere)); add(L, 'doorswing', evSwing(sh, L)); });
      } else if (v === 'ELEV') {
        layersOf(sh).forEach(function (L) { add(L, 'panel', evPanel(sh, L, k)); add(L, 'net', evNet(sh, L)); add(L, 'fan', evFan(sh, L, k)); add(L, 'elevdoor', evElevDoor(sh, L, k)); });
      } else if (v === 'SECTION') layersOf(sh).forEach(function (L) { add(L, 'bar', evBar(sh, L, k)); });
      res.__refused = refusedHere; return res; }
    function propLayers(sh, v, out, refused) {
      if (noPrefill() || (v !== 'PLAN' && v !== 'ELEV' && v !== 'SECTION')) return;
      var mine = layerKinds(sh, v), pooled = {};
      if (v === 'ELEV') ctx.sheets().forEach(function (o) { if (o === sh || viewOf(o) !== 'ELEV') return; var r = layerKinds(o, 'ELEV'); Object.keys(r).forEach(function (L) { if (L !== '__refused') pooled[L] = (pooled[L] || []).concat(r[L].map(function (q) { return Object.assign({ sheet: o.name }, q); })); }); });   // one layer, one meaning, per role: the pooled select
      (mine.__refused || []).forEach(function (r) { refused.push(r); });
      layersOf(sh).forEach(function (L) {
        if (sh.marks.some(function (m) { var l = m.key === 'LAYER' && layerOf(m); return l && l.layer === L; })) return;   // a typed / stated layer stands
        var own = mine[L] || [], other = pooled[L] || [], all = own.concat(other), kinds = all.map(function (q) { return q.kind; }).filter(function (q, i, a) { return a.indexOf(q) === i; });
        if (!kinds.length) return;
        if (kinds.length > 1) { refused.push({ rule: own.length ? own[0].rule : all[0].rule, why: 'layer ' + L + ' on ' + sh.name + ' fits ' + kinds.length + ' readings: ' + kinds.map(function (kd) { var q = all.filter(function (z) { return z.kind === kd; })[0]; return kd + ' (' + q.why + ')'; }).join(' | ') + ': no row, pick one' }); return; }
        var q = own[0] || other[0], via = own.length ? '' : ' [read on ' + other[0].sheet.replace(/\.dxf$/i, '') + '; the same layer on every elevation takes one meaning]';
        out.push({ rule: q.rule, key: 'LAYER', value: L + ',' + q.kind, x: 0, y: 0, why: 'layer ' + L + ' = ' + q.kind + ': ' + q.why + via });
      });
    }
    function proposalsFor(sh) {
      var out = [], refused = [], v = viewOf(sh);
      var iu = sh.dxf.header && sh.dxf.header.$INSUNITS;
      if (HEADER_UNITS[iu]) out.push({ rule: 'PR-UNITS', key: 'UNITS', value: HEADER_UNITS[iu], x: 0, y: 0, why: 'file says ' + HEADER_UNITS[iu] + ' ($INSUNITS=' + iu + ')' });
      else refused.push({ rule: 'PR-UNITS', why: '$INSUNITS ' + (iu === undefined ? 'absent' : iu + ' not a length unit') });
      var titleAll = setting('suggest.title_text') === 'text_and_mtext', titleSeen = {};
      var titles = {}; sh.dxf.entities.forEach(function (e) {
        var isT = e.type === 'TEXT' || (titleAll && e.type === 'MTEXT'), txt = titleAll ? plain(e) : e.text, c = isT && e.layer !== LAYER ? titleCore(txt) : '';
        if (c && titleAll && (/,|\b(?:SEE|REFER)\b/i.test(c) || /^KEY\s*PLAN$/i.test(c))) c = '';   // §D107 a note, not a title ("BEAM, SEE PLAN"); §D109 a title block's KEYPLAN names no sheet
        if (c && e.type === 'MTEXT' && c !== c.toUpperCase()) c = '';   // §D107 an MTEXT counts as a title only in capitals ("Footing Section" on a details sheet is a label; regression W-ARRANGE A9a, W-DATUM-PICK P0)
        if (c && (/(PLAN|ELEVATION|SECTION)\s*$/i.test(c) || (titleAll && setting('suggest.title_layout') === 'read' && /\bLAYOUT$/.test(c)) || /^Section\s+[A-Z0-9]+\s*-\s*[A-Z0-9]+\b/i.test(c) || (titleAll && (/\bSCHEDULE$/.test(c) || /ELEVATION\s+GRID\s+\S+$/i.test(c) || /^(?:LEVEL\s*\d+|GROUND|BASEMENT)\s+FLOOR$/i.test(c))))) {   // §D109 a storey's name alone (LEVEL 01 FLOOR) titles a plan
          var norm = titleAll ? c.replace(/[\s-]+/g, ' ').toUpperCase() : String(txt).trim();   // §D107 two spellings of one title are one
          if (!titleSeen[norm]) { titleSeen[norm] = 1; titles[String(txt).trim()] = c; } } });   // §D46 (a) on the title's core   // "Section A-A" / "Section A-A (Truss Detail)"
      // §D110 a sheet holding the set's drawing list under a number header is read as a drawing: its rows are other sheets' titles, so they must not name its view
      var listText = null; if (titleAll && setting('guide.gap_sheets') !== 'off') { var lhead = false; sh.dxf.entities.forEach(function (e) { if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === LAYER) return; var q = plain(e).replace(/\s+/g, ' ').trim(); if (/^(?:SHEET|DRAWING) (?:NUMBER|NO\.?)$/i.test(q)) lhead = true; if (/^(?:(?:DRAWING|SHEET)S? (?:LIST|REGISTER|INDEX)\b|(?:LIST|INDEX) OF (?:DRAWINGS|SHEETS)$)/i.test(q) && !listText) listText = q; }); if (!lhead) listText = null; }
      if (listText) titles = (function () { var o = {}; o[listText] = 'DRAWING LIST'; return o; })();
      var tl = Object.keys(titles), fullT = tl.filter(function (q) { return !/^(?:LEVEL\s*\d+|GROUND|BASEMENT)\s+FLOOR$/i.test(titles[q]); });   // §D109 a storey's name titles a sheet only when nothing else does: it is also a key plan's label
      if (fullT.length) tl = fullT;
      if (tl.length === 1) {
        var t = tl[0], tc = titles[t], vw = tc === 'DRAWING LIST' || /\bSCHEDULE$/.test(tc) ? 'DRAWING' : /ROOF PLAN$/i.test(tc) ? 'ROOF' : /PLAN$/i.test(tc) || /\bLAYOUT$/.test(tc) || /^(?:LEVEL\s*\d+|GROUND|BASEMENT)\s+FLOOR$/i.test(tc) ? 'PLAN' : /ELEVATION(\s+GRID\s+\S+)?$/i.test(tc) ? 'ELEV' : 'SECTION';
        out.push({ rule: 'PR-VIEW', key: 'VIEW', value: vw, x: 0, y: 0, why: 'title text "' + t + '"' });
        out.push({ rule: 'PR-NAME', key: 'NAME', value: noScale(t), x: 0, y: 0, why: 'title text' });
      } else refused.push({ rule: 'PR-VIEW', why: tl.length ? tl.length + ' title texts disagree' : 'no title text ending PLAN / ELEVATION / SECTION' });
      // §D107 PR-SHEETNO: exactly one sheet number (A-100, S-012) in the file name
      var noT = {}; String(sh.name).replace(/(?:^|[^A-Za-z0-9-])([A-Z]{1,2}-\d{3})(?![0-9])/g, function (_, n) { noT[n] = 1; return _; });
      if (Object.keys(noT).length === 1) out.push({ rule: 'PR-SHEETNO', key: 'SHEETNO', value: Object.keys(noT)[0], x: 0, y: 0, why: 'the file name states it' });
      // §D98: a set no sheet names gets the placeholder (inferred, stays yellow until renamed: never counts as stated); a real set on another sheet wins over it; two real sets still ask
      var sets = {}; ctx.sheets().forEach(function (o) { if (o !== sh) { var m = get1(o, 'SET'); if (m) sets[m.value] = 1; } });
      var real = Object.keys(sets).filter(function (k) { return k !== SET_PLACEHOLDER; }), own = get1(sh, 'SET');
      var ts = !real.length && (!own || own.value === SET_PLACEHOLDER) && !noPrefill() ? setFromTitles() : {}, tsk = Object.keys(ts);   // §D114 PR-SET-TITLE
      if (tsk.length > 1) refused.push({ rule: 'PR-SET-TITLE', why: tsk.length + ' floor-plan titles name different buildings: ' + tsk.map(function (q) { return ts[q][0]; }).join(', ') });
      if (tsk.length === 1 && !/^[A-Z][A-Z0-9_-]{0,31}$/.test(tsk[0])) { refused.push({ rule: 'PR-SET-TITLE', why: 'the title ' + ts[tsk[0]][0] + ' names "' + tsk[0] + '", not one word' }); tsk = []; }
      if (real.length === 1) out.push({ rule: 'PR-SET', key: 'SET', value: real[0], x: 0, y: 0, why: 'the other sheets state it' });
      else if (tsk.length === 1) out.push({ rule: 'PR-SET-TITLE', key: 'SET', value: tsk[0], x: 0, y: 0, why: 'the floor plan title ' + ts[tsk[0]].join(', ') + ' names the building (no sheet states a set name)' });
      else if (!real.length && !own) out.push({ rule: 'PR-SET-PLACEHOLDER', key: 'SET', value: SET_PLACEHOLDER, x: 0, y: 0, why: 'no sheet names the set: a placeholder, rename it' });
      var nm = (sh.name + ' ' + tl.join(' ')).toUpperCase(), faces = [['FRONT', 'minY'], ['REAR', 'maxY'], ['LEFT', 'minX'], ['RIGHT', 'maxX'], ['SOUTH', 'minY'], ['NORTH', 'maxY'], ['WEST', 'minX'], ['EAST', 'maxX']].filter(function (f) { return nm.indexOf(f[0]) >= 0; });
      if (v === 'PLAN') { propGrid(sh, true, out, refused, 'GRIDX'); propGrid(sh, false, out, refused, 'GRIDY'); propGridTicks(sh, true, out, refused, 'GRIDX'); propGridTicks(sh, false, out, refused, 'GRIDY'); }
      if (v === 'PLAN' || v === 'ROOF') { if (!propLevelTitle(sh, tl, out) && v === 'PLAN' && !propLevelName(sh, tl, out, refused) && !propLevelFooting(sh, out, refused)) propLevel(sh, tl, out, refused); }   // §D46 (b) the title's level first, then the D37 default
      if (v === 'ELEV' || v === 'SECTION' || v === 'ROOF') propRoof(sh, out, refused);   // §D46 (c)
      if (v === 'ELEV' || v === 'SECTION') { propGrid(sh, true, out, refused, 'GRIDH'); propGridTicks(sh, true, out, refused, 'GRIDH'); var nz = out.length; propZ(sh, out, refused); if (!out.some(function (q) { return q.key === 'Z'; })) propZGround(sh, out, refused); propZDim(sh, out, refused); propZLabel(sh, out, refused); }   // §D114 after PR-Z-DIM (its "a text datum first" test must not see this row)
      if (v === 'PLAN') { propBodyz(sh, out, refused); propJoint(sh, out, refused); }   // §D114, §D115
      propLayers(sh, v, out, refused);   // §D115 item 3
      if (v === 'SECTION') {   // §L14 PR-CUT: the section line on the plan is two equal one-letter labels (the line's ends) at one x (cut across X) or one y; the sheet title names the letter ("Section A-A")
        var secName = (/^Section\s+([A-Z0-9]+)\s*-\s*\1\b/i.exec(tl[0] || '') || [])[1], cutDone = false;
        var ct = /\bAT\s+([XY])\s*=\s*([-+]?\d+(?:\.\d+)?)\b/i.exec(noScale(tl[0] || ''));   // §D46 (d) the title states the cut: the label pairs are not looked at
        if (ct && !get1(sh, 'CUT')) { cutDone = true; out.push({ rule: 'PR-CUT-TITLE', key: 'CUT', value: ct[1].toUpperCase() + ',' + Number(ct[2]), x: 0, y: 0, why: 'title text "' + tl[0] + '"' }); }
        if (secName && !cutDone && get1(sh, 'HAXIS') !== undefined) {
          ctx.sheets().filter(function (o) { return o !== sh && viewOf(o) === 'PLAN'; }).forEach(function (pl) {
            var ks = unitsK(sh), kp = unitsK(pl), at = pl.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && String(e.text || '').trim().toUpperCase() === secName.toUpperCase(); }).map(txtPos);
            var pairs = []; for (var i = 0; i < at.length; i++) for (var j = i + 1; j < at.length; j++) {
              if (Math.abs(at[i][0] - at[j][0]) <= 1e-6 * Math.max(1, Math.abs(at[i][0])) * 1e3 && Math.abs(at[i][1] - at[j][1]) > 0) pairs.push(['X', at[i][0]]);
              else if (Math.abs(at[i][1] - at[j][1]) <= 1e-6 * Math.max(1, Math.abs(at[i][1])) * 1e3 && Math.abs(at[i][0] - at[j][0]) > 0) pairs.push(['Y', at[i][1]]);
            }
            if (pairs.length === 1 && kp && ks && !cutDone) { cutDone = true; out.push({ rule: 'PR-CUT', key: 'CUT', value: pairs[0][0] + ',' + Number((pairs[0][1] * kp / ks).toFixed(4)), x: 0, y: 0, why: 'the two "' + secName + '" labels of the section line on ' + pl.name }); }
            else if (!cutDone) refused.push({ rule: 'PR-CUT', why: pairs.length + ' aligned pairs of the label "' + secName + '" on ' + pl.name + ' (need exactly 1)' });
          });
        } else if (!secName && !cutDone) refused.push({ rule: 'PR-CUT', why: 'the title does not name the section as "Section X-X"' });
      }
      if (v === 'SECTION') { var hxs = propHaxis(sh); if (hxs.value) out.push(hxs); else refused.push(hxs); }
      if (v === 'ELEV') {
        if (faces.length === 1) out.push({ rule: 'PR-FACE', key: 'FACE', value: faces[0][1], x: 0, y: 0, why: 'sheet name / title ' + faces[0][0] + (/^(SOUTH|NORTH|WEST|EAST)$/.test(faces[0][0]) ? ' = the ' + faces[0][1] + ' face with north up (convention, not evidence)' : ' (repo convention R11, not evidence)') });
        var hx = propHaxis(sh); if (hx.value) out.push(hx); else refused.push(hx);
        // §D107 PR-PLANE: the title names the grid line this elevation stands on, and the plan holds that line
        var onG = {}; sh.dxf.entities.forEach(function (e) { if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || e.layer === LAYER) return; var m = /\bELEVATION\s+GRID\s+([A-Z0-9]+)$/i.exec(plain(e)); if (m) onG[m[1].toUpperCase()] = 1; });
        var onL = Object.keys(onG); if (onL.length === 1) { var bp = ctx.sheets().filter(function (o) { return viewOf(o) === 'PLAN'; }).some(function (o) { return o.marks.some(function (q) { return ((q.key === 'GRIDX' || q.key === 'GRIDY') && q.value === onL[0]) || (q.key === 'GRIDA' && String(q.value).split(',')[0] === onL[0]); }); });
          if (bp) { out.push({ rule: 'PR-PLANE', key: 'PLANE', value: onL[0], x: 0, y: 0, why: 'the title names grid line ' + onL[0] });
            // the line is one end of its family on the plan: that end is the face (inferred: an interior line has none, and the row is left to the person)
            var pp = ctx.sheets().filter(function (o) { return viewOf(o) === 'PLAN'; }), fam = family(onL[0]), axis = null, vals = [], at = null;
            pp.forEach(function (o) { o.marks.forEach(function (q) { if ((q.key === 'GRIDX' || q.key === 'GRIDY') && q.value === onL[0]) { axis = q.key; at = q.key === 'GRIDX' ? q.x : q.y; } }); });
            if (axis && !get1(sh, 'FACE')) { pp.forEach(function (o) { o.marks.forEach(function (q) { if (q.key === axis && family(q.value) === fam) vals.push(axis === 'GRIDX' ? q.x : q.y); }); });
              var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), dir = axis === 'GRIDX' ? 'X' : 'Y';
              if (fam && hi > lo && (at === lo || at === hi)) out.push({ rule: 'PR-FACE-PLANE', key: 'FACE', value: (at === lo ? 'min' : 'max') + dir, x: 0, y: 0, why: 'grid line ' + onL[0] + ' is the ' + (at === lo ? 'lowest' : 'highest') + ' ' + dir + ' line of family ' + fam }); } }
          else refused.push({ rule: 'PR-PLANE', why: 'the title names grid line ' + onL[0] + ', which no plan states' }); }
      }
      var have = {}; sh.marks.forEach(function (m) { have[canonOne(m)] = 1; });
      out = out.filter(function (p) { if (have[canonOne(p)]) return false; return !(SINGLE_POS[p.key] === undefined && ['GRIDX', 'GRIDY', 'GRIDH', 'GRIDA', 'Z', 'TAG', 'EXCLUDE', 'WALLTOP', 'BODYZ', 'LAYER'].indexOf(p.key) < 0 && get1(sh, p.key) && !(p.key === 'SET' && get1(sh, p.key).value === SET_PLACEHOLDER)); });   // §D98: a real set name replaces the placeholder
      return { list: out, refused: refused };
    }
    function propHaxis(sh) {                                    // mark_dx_set.js: unique axis/sign fit of @GRIDH against the lowest plan's grids
      var plans = ctx.sheets().filter(function (o) { return viewOf(o) === 'PLAN' && get1(o, 'LEVEL'); }).sort(function (a, b) { return Number(get1(a, 'LEVEL').value) - Number(get1(b, 'LEVEL').value); });
      if (!plans.length) return { rule: 'PR-HAXIS', why: 'no plan with @LEVEL to fit against' };
      var P = plans[0], kp = unitsK(P), ke = unitsK(sh); if (!kp || !ke) return { rule: 'PR-HAXIS', why: 'units unknown' };
      var bag = function (s, key, pos) { var o = {}; s.marks.filter(function (m) { return m.key === key; }).forEach(function (m) { o[m.value] = Number(m[pos]); }); return o; };
      var gh = bag(sh, 'GRIDH', 'x'), fits = [];
      [['X', bag(P, 'GRIDX', 'x')], ['Y', bag(P, 'GRIDY', 'y')]].forEach(function (ab) { [1, -1].forEach(function (sg) {
        var ls = Object.keys(gh).filter(function (l) { return l in ab[1]; }); if (ls.length < 2) return;
        var offs = ls.map(function (l) { return ab[1][l] * kp - sg * gh[l] * ke; }), spread = Math.max.apply(null, offs) - Math.min.apply(null, offs);
        if (spread <= 0.001 + 1e-9) fits.push((sg > 0 ? '+' : '-') + ab[0]); }); });
      if (fits.length !== 1) return { rule: 'PR-HAXIS', why: fits.length + ' axis fits of @GRIDH against ' + P.name + ' (need exactly 1)' };
      return { rule: 'PR-HAXIS', key: 'HAXIS', value: fits[0], x: 0, y: 0, why: 'unique grid fit against ' + P.name };
    }

    return { proposalsFor: proposalsFor, unitsK: unitsK, txtPos: txtPos };
  }
  // §D47 tag doors by width, ONE decision per schedule row (pure). doors [{handle, width (m), tagged}], rows [{mark, w (plan units)}], opts {factor (units -> m), tol (m)}.
  // A door takes a row's mark when its drawn leaf width equals exactly one row's width; two rows of one width -> refused (both named); no row -> left (with the width). Tagged doors are not touched.
  function tagByWidth(doors, rows, opts) {
    var f = opts.factor, tol = opts.tol, R = [], groups = {}, left = [], refused = [];
    rows.forEach(function (r) { var w = Number(r.w); if (w > 0 && !R.some(function (q) { return q.mark === r.mark; })) R.push({ mark: r.mark, w: w }); });
    doors.forEach(function (d) {
      if (d.tagged) return;
      var dw = d.width / f, hit = R.filter(function (r) { return Math.abs(dw - r.w) <= tol / f; });
      if (hit.length === 1) (groups[hit[0].mark] = groups[hit[0].mark] || { mark: hit[0].mark, w: hit[0].w, doors: [] }).doors.push(d.handle);
      else if (hit.length > 1) refused.push({ handle: d.handle, width: Number(dw.toFixed(3)), marks: hit.map(function (r) { return r.mark; }) });
      else left.push({ handle: d.handle, width: Number(dw.toFixed(3)) });
    });
    return { groups: Object.keys(groups).sort().map(function (k) { return groups[k]; }), left: left, refused: refused };
  }
  return { create: create, family: family, plain: plain, tagByWidth: tagByWidth, stripMarks: stripMarks, markText: markText, effText: effText, get1: get1, viewOf: viewOf, canonOne: canonOne, posOf: posOf, layerOf: layerOf, HEADER_UNITS: HEADER_UNITS, SINGLE_POS: SINGLE_POS, LAYER: LAYER, SET_PLACEHOLDER: SET_PLACEHOLDER };
});
