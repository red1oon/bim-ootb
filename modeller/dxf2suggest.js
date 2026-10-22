// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2suggest.js — the editor's SUGGESTION rules (§L4.1 PR-UNITS/VIEW/NAME/SET/FACE/HAXIS/GRID/Z, §L7.11 PR-GRID-TICK + PR-Z-GROUND), extracted from dxf_meta_editor.js (lane §L8):
// pure, no window, no editor state. create(ctx) -> { proposalsFor(sheet), unitsK, txtPos, get1, viewOf, canonOne }.
//   sheet  = { name, dxf (parsed), marks: [{ key, value, x, y, source? }] }
//   ctx    = { MK: Dxf2Marks, sheets(): all sheets, gridLayers(sheet): grid layer names (the set's + stated), levelLayers(): level-line layer names }
// A suggestion is NEVER a marking until the caller accepts it; ambiguous or absent evidence is `refused` with the reason.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Suggest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LAYER = 'DXF2BIM-MARK';
  var HEADER_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };   // DXF $INSUNITS codes (the reader's table, dxf2qualify.js)
  var SINGLE_POS = { GRIDX: 'x', GRIDH: 'x', GRIDY: 'y', Z: 'y', TAG: 'xy' };   // canonical: the position that carries meaning
  function num(v) { return String(Number(Number(v).toFixed(6))); }
  function get1(sh, key) { var m = sh.marks.filter(function (q) { return q.key === key; })[0]; return m || null; }
  function viewOf(sh) { var m = get1(sh, 'VIEW'); return m ? m.value : null; }
  function posOf(key, x, y) { var p = SINGLE_POS[key]; return p === 'x' ? { x: x, y: 0 } : p === 'y' ? { x: 0, y: y } : p === 'xy' ? { x: x, y: y } : { x: 0, y: 0 }; }
  function canonOne(m) { var p = SINGLE_POS[m.key], s = '@' + m.key + '=' + m.value; return p === 'x' ? s + '@x=' + num(m.x) : p === 'y' ? s + '@y=' + num(m.y) : p === 'xy' ? s + '@' + num(m.x) + ',' + num(m.y) : s; }
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
    var MK = ctx.MK;
  // ---- proposals (§L4.1 PR-*; evidence only; ambiguous -> refused with the reason) ----
    function unitsK(sh) { var u = get1(sh, 'UNITS'); if (u && MK.UNITS[u.value]) return MK.UNITS[u.value]; var h = HEADER_UNITS[sh.dxf.header && sh.dxf.header.$INSUNITS]; return h ? MK.UNITS[h] : null; }
    function txtPos(e) { var p = e.startPoint || e.position || {}; return [p.x, p.y]; }
    function propGrid(sh, vertical, out, refused, key) {     // mark_dx_set.js gridLines: grid-layer LINEs + exactly one 1-char label near an end
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-GRID', why: 'units unknown (no @UNITS, no $INSUNITS)' }); return; }
      var tolAx = 0.001 / k, along = 0.060 / k, perp = 0.700 / k, GL = ctx.gridLayers(sh);
      var T = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && /^[A-Z0-9]$/.test(String(e.text || '').trim()); });
      var res = {};
      sh.dxf.entities.filter(function (e) { return GL.indexOf(e.layer) >= 0 && e.type === 'LINE' && e.vertices && e.vertices.length >= 2; }).forEach(function (l) {
        var a = l.vertices[0], b = l.vertices[1], isV = Math.abs(a.x - b.x) <= tolAx, isH = Math.abs(a.y - b.y) <= tolAx;
        if (vertical ? !isV : !isH) return;
        var c = vertical ? a.x : a.y;
        var labs = {}; T.forEach(function (t) { var p = txtPos(t), al = vertical ? p[0] : p[1], pp = vertical ? p[1] : p[0];
          if (Math.abs(al - c) <= along && [a, b].some(function (en) { return Math.abs(pp - (vertical ? en.y : en.x)) <= perp; })) labs[String(t.text).trim()] = 1; });
        var L = Object.keys(labs);
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
      var have = {}; out.forEach(function (p) { if (p.key === key) have[p.value] = 1; });
      var along = 0.5 / k, across = 1.0 / k, shortL = 1.0 / k, tolAx = 0.001 / k;
      var T = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER && /^([A-Z]|\d{1,3})$/.test(String(e.text || '').trim()); });
      var ticks = sh.dxf.entities.filter(function (e) { if (e.type !== 'LINE' || !e.vertices || e.vertices.length < 2) return false; var a = e.vertices[0], b = e.vertices[1];
        var axisOk = vertical ? Math.abs(a.x - b.x) <= tolAx : Math.abs(a.y - b.y) <= tolAx; return axisOk && Math.hypot(a.x - b.x, a.y - b.y) <= shortL && Math.hypot(a.x - b.x, a.y - b.y) > tolAx; });
      var claims = {}, pick = {};
      T.forEach(function (t) {
        var lab = String(t.text).trim(); if (have[lab]) return;
        var p = txtPos(t), al = vertical ? p[0] : p[1], ac = vertical ? p[1] : p[0];
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
    function propZ(sh, out, refused) {                          // mark_dx_set.js levelPairs: level text +-z.zzz paired by its own y or a level line
      var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-Z', why: 'units unknown' }); return; }
      var LL = ctx.levelLayers(), tol = 0.001 / k, seen = {};
      var labs = sh.dxf.entities.filter(function (e) { return e.type === 'TEXT' && e.layer !== LAYER && /([+-]\d+\.\d+)\s*$/.test(String(e.text || '').trim()) && (/LEVEL/.test(e.text) || LL.indexOf(e.layer) >= 0); })
        .map(function (e) { return { z: Number(/([+-]\d+\.\d+)\s*$/.exec(String(e.text).trim())[1]), y: txtPos(e)[1], h: e.handle }; });
      var lines = sh.dxf.entities.filter(function (e) { return LL.indexOf(e.layer) >= 0 && e.type === 'LINE' && e.vertices && Math.abs(e.vertices[0].y - e.vertices[1].y) <= 1e-9; });
      labs.forEach(function (l) { if (!seen[l.z] && Math.abs(l.y - l.z / k) <= tol) seen[l.z] = { y: Number(l.y.toFixed(3)), why: 'level text ' + l.h + ' at its own height' }; });
      labs.forEach(function (l) { if (seen[l.z]) return; var ln = lines.filter(function (q) { return Math.abs(q.vertices[0].y - l.z / k) <= tol; })[0];
        if (ln) seen[l.z] = { y: Number(ln.vertices[0].y.toFixed(3)), why: 'level text ' + l.h + ' + level line ' + ln.handle }; });
      Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }).forEach(function (z) { out.push({ rule: 'PR-Z', key: 'Z', value: String(z), x: 0, y: seen[z].y, why: seen[z].why }); });
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
    function proposalsFor(sh) {
      var out = [], refused = [], v = viewOf(sh);
      var iu = sh.dxf.header && sh.dxf.header.$INSUNITS;
      if (HEADER_UNITS[iu]) out.push({ rule: 'PR-UNITS', key: 'UNITS', value: HEADER_UNITS[iu], x: 0, y: 0, why: 'file says ' + HEADER_UNITS[iu] + ' ($INSUNITS=' + iu + ')' });
      else refused.push({ rule: 'PR-UNITS', why: '$INSUNITS ' + (iu === undefined ? 'absent' : iu + ' not a length unit') });
      var titles = {}; sh.dxf.entities.forEach(function (e) { var c = e.type === 'TEXT' && e.layer !== LAYER ? titleCore(e.text) : ''; if (c && (/(PLAN|ELEVATION|SECTION)\s*$/i.test(c) || /^Section\s+[A-Z0-9]+\s*-\s*[A-Z0-9]+\b/i.test(c))) titles[String(e.text).trim()] = c; });   // §D46 (a) on the title's core   // "Section A-A" / "Section A-A (Truss Detail)"
      var tl = Object.keys(titles);
      if (tl.length === 1) {
        var t = tl[0], tc = titles[t], vw = /ROOF PLAN$/i.test(tc) ? 'ROOF' : /PLAN$/i.test(tc) ? 'PLAN' : /ELEVATION$/i.test(tc) ? 'ELEV' : 'SECTION';
        out.push({ rule: 'PR-VIEW', key: 'VIEW', value: vw, x: 0, y: 0, why: 'title text "' + t + '"' });
        out.push({ rule: 'PR-NAME', key: 'NAME', value: noScale(t), x: 0, y: 0, why: 'title text' });
      } else refused.push({ rule: 'PR-VIEW', why: tl.length ? tl.length + ' title texts disagree' : 'no title text ending PLAN / ELEVATION / SECTION' });
      var sets = {}; ctx.sheets().forEach(function (o) { if (o !== sh) { var m = get1(o, 'SET'); if (m) sets[m.value] = 1; } });
      if (Object.keys(sets).length === 1) out.push({ rule: 'PR-SET', key: 'SET', value: Object.keys(sets)[0], x: 0, y: 0, why: 'the other sheets state it' });
      var nm = (sh.name + ' ' + tl.join(' ')).toUpperCase(), faces = [['FRONT', 'minY'], ['REAR', 'maxY'], ['LEFT', 'minX'], ['RIGHT', 'maxX'], ['SOUTH', 'minY'], ['NORTH', 'maxY'], ['WEST', 'minX'], ['EAST', 'maxX']].filter(function (f) { return nm.indexOf(f[0]) >= 0; });
      if (v === 'PLAN') { propGrid(sh, true, out, refused, 'GRIDX'); propGrid(sh, false, out, refused, 'GRIDY'); propGridTicks(sh, true, out, refused, 'GRIDX'); propGridTicks(sh, false, out, refused, 'GRIDY'); }
      if (v === 'PLAN' || v === 'ROOF') { if (!propLevelTitle(sh, tl, out) && v === 'PLAN') propLevel(sh, tl, out, refused); }   // §D46 (b) the title's level first, then the D37 default
      if (v === 'ELEV' || v === 'SECTION' || v === 'ROOF') propRoof(sh, out, refused);   // §D46 (c)
      if (v === 'ELEV' || v === 'SECTION') { propGrid(sh, true, out, refused, 'GRIDH'); propGridTicks(sh, true, out, refused, 'GRIDH'); var nz = out.length; propZ(sh, out, refused); if (!out.some(function (q) { return q.key === 'Z'; })) propZGround(sh, out, refused); }
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
      }
      var have = {}; sh.marks.forEach(function (m) { have[canonOne(m)] = 1; });
      out = out.filter(function (p) { if (have[canonOne(p)]) return false; return !(SINGLE_POS[p.key] === undefined && ['GRIDX', 'GRIDY', 'GRIDH', 'Z', 'TAG', 'EXCLUDE', 'WALLTOP'].indexOf(p.key) < 0 && get1(sh, p.key)); });
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
  return { create: create, stripMarks: stripMarks, markText: markText, effText: effText, get1: get1, viewOf: viewOf, canonOne: canonOne, posOf: posOf, layerOf: layerOf, HEADER_UNITS: HEADER_UNITS, SINGLE_POS: SINGLE_POS, LAYER: LAYER };
});
