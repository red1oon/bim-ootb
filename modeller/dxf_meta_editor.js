// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf_meta_editor.js — DXF2BIM lane L4 "Drawing metadata" editor (prompts/DXF2BIM_MODELLER_LANE.md §L4 + §L4.1 build spec).
// For a raw 2D set the user states what the reader needs (roles, units, levels, faces, grids, layers, tags, excludes, wall tops) as
// DXF2BIM-MARK markings; evidence-based proposals show as suggestions and become markings ONLY when ticked; the live L2 verdict
// (dxf2bim/dxf2qualify.js, verbatim) runs after every change and gates Convert; Save downloads marked COPIES (originals untouched).
// No geometry or rule lives here: markings are read/written by Dxf2Marks, the verdict is Dxf2Qualify, the pipeline is Dxf2BimImport.
// Lucide line icons inline, no unicode glyphs. Log tag §DXF-META.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;   // Node (sync check): only the template above
  var TAG = '§DXF-META', LAYER = 'DXF2BIM-MARK';
  var MK, Q, I, B, Cf;   // bound on open (lazy modules)

  // ---- Lucide line icons (verbatim path data) ----
  var SVG = function (inner, cls) { return '<svg class="' + (cls || 'dm-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'; };
  var IC = {
    clipboard: SVG('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'),
    x: SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    check: SVG('<path d="M20 6 9 17l-5-5"/>'),
    plus: SVG('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    trash: SVG('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'),
    file: SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    ruler: SVG('<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>'),
    layers: SVG('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
    tag: SVG('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
    exclude: SVG('<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>'),
    walltop: SVG('<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>'),
    verdict: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
    ok: SVG('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    warn: SVG('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    bulb: SVG('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
    save: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'),
    chevR: SVG('<path d="m9 18 6-6-6-6"/>'),
    chevD: SVG('<path d="m6 9 6 6 6-6"/>'),
    crosshair: SVG('<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>'),
    loader: SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>')
  };

  var ROLE_VIEW = { PLAN: 'plan', ELEV: 'elev', ROOF: 'roof', SECTION: 'section' };
  var HEADER_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };   // DXF $INSUNITS codes (the reader's table, dxf2qualify.js)
  var SINGLE_POS = { GRIDX: 'x', GRIDH: 'x', GRIDY: 'y', Z: 'y', TAG: 'xy' };   // §L4.1 canonical: the position that carries meaning
  var LAYER_TYPES = ['wall', 'door', 'glazing', 'dims', 'grid', 'level', 'ignore'];
  var S = { sheets: [], layerRules: [], verdict: null, busy: false, token: 0, open: {}, sec: { sheets: true, units: true, layers: false, tags: false, excludes: false, walltops: false, verdict: true },
    vtab: 'blocking', wtLevel: {}, draft: {}, tool: null, pick: null, exSheet: null, byOk: false, lib: undefined, cache: {}, panel: null, saved: null };

  // ---- markings: parse / write (Dxf2Marks owns the grammar; this only splits the lead-decided " @BY=" suffix for display) ----
  function parseRaw(raw) {
    var by = null, t = raw, mb = /^(.*\S)\s+@BY=(\S+)$/.exec(raw);
    if (mb) { t = mb[1]; by = mb[2]; }
    var m = /^@([A-Z]+)=(.*)$/.exec(t);
    return m ? { key: m[1], value: m[2], by: by } : { key: null, value: t, by: by };
  }
  function markText(m) { return m.raw !== undefined ? m.raw : '@' + m.key + '=' + m.value + (m.source === 'user' && S.byOk ? ' @BY=user' : ''); }
  function posOf(key, x, y) {
    var p = SINGLE_POS[key];
    return p === 'x' ? { x: x, y: 0 } : p === 'y' ? { x: 0, y: y } : p === 'xy' ? { x: x, y: y } : { x: 0, y: 0 };
  }
  function canonOne(m) { var p = SINGLE_POS[m.key], s = '@' + m.key + '=' + m.value; return p === 'x' ? s + '@x=' + num(m.x) : p === 'y' ? s + '@y=' + num(m.y) : p === 'xy' ? s + '@' + num(m.x) + ',' + num(m.y) : s; }
  function canon(marks) { return marks.map(canonOne).sort(); }
  function num(v) { return String(Number(Number(v).toFixed(6))); }
  function sigOf(sh) { return JSON.stringify(sh.marks.map(function (m) { return [markText(m), m.x, m.y]; })); }
  function sameAsFile(sh) { return JSON.stringify(sh.fileSig) === JSON.stringify(sh.marks.map(function (m) { return [markText(m), m.x, m.y]; })); }

  // strip(original): drop every TEXT/MTEXT entity on DXF2BIM-MARK from the ENTITIES section (group-code walk; nothing else touched)
  function strip(text) {
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
  function effText(sh) {
    if (sameAsFile(sh)) return sh.text;
    return MK.writeMarks(sh.stripped || (sh.stripped = strip(sh.text)), sh.marks.map(function (m) { return { text: markText(m), x: m.x, y: m.y }; }));
  }
  function effSheet(sh) {   // Dxf2BimImport.readSheet of the effective text, cached per marking signature
    var k = sh.name + '|' + sigOf(sh);
    if (!S.cache[k]) { var t = effText(sh); S.cache[k] = I.readSheet(sh.name, t, I.sha256Hex); S.cache[k].effText = t; }
    return S.cache[k];
  }
  function describeOf(sh) { return MK.describe(sh.marks.map(function (m, i) { return { raw: markText(m), x: m.x, y: m.y, handle: (i + 1).toString(16) }; })); }
  function get1(sh, key) { var m = sh.marks.filter(function (q) { return q.key === key; })[0]; return m || null; }
  function viewOf(sh) { var m = get1(sh, 'VIEW'); return m ? m.value : null; }

  // ---- edits (every edit = a user marking; a changed file marking becomes the user's) ----
  function setSingle(sh, key, value) {
    var had = sh.marks.filter(function (q) { return q.key === key; });
    sh.marks = sh.marks.filter(function (q) { return q.key !== key; });
    value = String(value === undefined || value === null ? '' : value).trim();
    if (value !== '') { var p = posOf(key, 0, 0); sh.marks.push({ key: key, value: value, x: p.x, y: p.y, source: 'user' }); }
    console.log(TAG + ' edit sheet=' + sh.name + ' @' + key + '=' + (value || '(cleared)') + (had.length ? ' was ' + had.map(function (h) { return h.value; }).join('|') : ''));
    changed();
  }
  function addMulti(sh, key, value, x, y, rule) {
    var p = posOf(key, x, y);
    sh.marks.push({ key: key, value: String(value).trim(), x: p.x, y: p.y, source: 'user', rule: rule || null });
    console.log(TAG + ' add sheet=' + sh.name + ' @' + key + '=' + value + ' at ' + p.x + ',' + p.y + (rule ? ' (confirmed proposal ' + rule + ')' : ''));
    changed();
  }
  function removeMark(sh, idx) { var m = sh.marks[idx]; sh.marks.splice(idx, 1); console.log(TAG + ' remove sheet=' + sh.name + ' ' + markText(m)); changed(); }

  // ---- proposals (§L4.1 PR-*; evidence only; ambiguous -> refused with the reason) ----
  function unitsK(sh) { var u = get1(sh, 'UNITS'); if (u && MK.UNITS[u.value]) return MK.UNITS[u.value]; var h = HEADER_UNITS[sh.dxf.header && sh.dxf.header.$INSUNITS]; return h ? MK.UNITS[h] : null; }
  function txtPos(e) { var p = e.startPoint || e.position || {}; return [p.x, p.y]; }
  function gridLayers() { return tmplQualify().layers.grid; }
  function levelLayers() { var M = maps(); return M.levl.rules.filter(function (r) { return r.type === 'levelline'; }).map(function (r) { return r.pattern; }); }
  function propGrid(sh, vertical, out, refused, key) {     // mark_dx_set.js gridLines: grid-layer LINEs + exactly one 1-char label near an end
    var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-GRID', why: 'units unknown (no @UNITS, no $INSUNITS)' }); return; }
    var tolAx = 0.001 / k, along = 0.060 / k, perp = 0.700 / k, GL = gridLayers();
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
  function propZ(sh, out, refused) {                          // mark_dx_set.js levelPairs: level text +-z.zzz paired by its own y or a level line
    var k = unitsK(sh); if (!k) { refused.push({ rule: 'PR-Z', why: 'units unknown' }); return; }
    var LL = levelLayers(), tol = 0.001 / k, seen = {};
    var labs = sh.dxf.entities.filter(function (e) { return e.type === 'TEXT' && e.layer !== LAYER && /([+-]\d+\.\d+)\s*$/.test(String(e.text || '').trim()) && (/LEVEL/.test(e.text) || LL.indexOf(e.layer) >= 0); })
      .map(function (e) { return { z: Number(/([+-]\d+\.\d+)\s*$/.exec(String(e.text).trim())[1]), y: txtPos(e)[1], h: e.handle }; });
    var lines = sh.dxf.entities.filter(function (e) { return LL.indexOf(e.layer) >= 0 && e.type === 'LINE' && e.vertices && Math.abs(e.vertices[0].y - e.vertices[1].y) <= 1e-9; });
    labs.forEach(function (l) { if (!seen[l.z] && Math.abs(l.y - l.z / k) <= tol) seen[l.z] = { y: Number(l.y.toFixed(3)), why: 'level text ' + l.h + ' at its own height' }; });
    labs.forEach(function (l) { if (seen[l.z]) return; var ln = lines.filter(function (q) { return Math.abs(q.vertices[0].y - l.z / k) <= tol; })[0];
      if (ln) seen[l.z] = { y: Number(ln.vertices[0].y.toFixed(3)), why: 'level text ' + l.h + ' + level line ' + ln.handle }; });
    Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }).forEach(function (z) { out.push({ rule: 'PR-Z', key: 'Z', value: String(z), x: 0, y: seen[z].y, why: seen[z].why }); });
    if (!Object.keys(seen).length) refused.push({ rule: 'PR-Z', why: 'no level text pairs with its height or a level line' });
  }
  function proposalsFor(sh) {
    var out = [], refused = [], v = viewOf(sh);
    var iu = sh.dxf.header && sh.dxf.header.$INSUNITS;
    if (HEADER_UNITS[iu]) out.push({ rule: 'PR-UNITS', key: 'UNITS', value: HEADER_UNITS[iu], x: 0, y: 0, why: 'file says ' + HEADER_UNITS[iu] + ' ($INSUNITS=' + iu + ')' });
    else refused.push({ rule: 'PR-UNITS', why: '$INSUNITS ' + (iu === undefined ? 'absent' : iu + ' not a length unit') });
    var titles = {}; sh.dxf.entities.forEach(function (e) { if (e.type === 'TEXT' && e.layer !== LAYER && /(PLAN|ELEVATION|SECTION)\s*$/.test(String(e.text || '').trim())) titles[String(e.text).trim()] = 1; });
    var tl = Object.keys(titles);
    if (tl.length === 1) {
      var t = tl[0], vw = /ROOF PLAN$/.test(t) ? 'ROOF' : /PLAN$/.test(t) ? 'PLAN' : /ELEVATION$/.test(t) ? 'ELEV' : 'SECTION';
      out.push({ rule: 'PR-VIEW', key: 'VIEW', value: vw, x: 0, y: 0, why: 'title text "' + t + '"' });
      out.push({ rule: 'PR-NAME', key: 'NAME', value: t, x: 0, y: 0, why: 'title text' });
    } else refused.push({ rule: 'PR-VIEW', why: tl.length ? tl.length + ' title texts disagree' : 'no title text ending PLAN / ELEVATION / SECTION' });
    var sets = {}; S.sheets.forEach(function (o) { if (o !== sh) { var m = get1(o, 'SET'); if (m) sets[m.value] = 1; } });
    if (Object.keys(sets).length === 1) out.push({ rule: 'PR-SET', key: 'SET', value: Object.keys(sets)[0], x: 0, y: 0, why: 'the other sheets state it' });
    var nm = sh.name.toUpperCase(), faces = [['FRONT', 'minY'], ['REAR', 'maxY'], ['LEFT', 'minX'], ['RIGHT', 'maxX']].filter(function (f) { return nm.indexOf(f[0]) >= 0; });
    if (v === 'PLAN') { propGrid(sh, true, out, refused, 'GRIDX'); propGrid(sh, false, out, refused, 'GRIDY'); }
    if (v === 'ELEV' || v === 'SECTION') { propGrid(sh, true, out, refused, 'GRIDH'); propZ(sh, out, refused); }
    if (v === 'ELEV') {
      if (faces.length === 1) out.push({ rule: 'PR-FACE', key: 'FACE', value: faces[0][1], x: 0, y: 0, why: 'sheet name ' + faces[0][0] + ' (repo convention R11, not evidence)' });
      var hx = propHaxis(sh); if (hx.value) out.push(hx); else refused.push(hx);
    }
    var have = {}; sh.marks.forEach(function (m) { have[canonOne(m)] = 1; });
    out = out.filter(function (p) { if (have[canonOne(p)]) return false; return !(SINGLE_POS[p.key] === undefined && ['GRIDX', 'GRIDY', 'GRIDH', 'Z', 'TAG', 'EXCLUDE', 'WALLTOP'].indexOf(p.key) < 0 && get1(sh, p.key)); });
    return { list: out, refused: refused };
  }
  function propHaxis(sh) {                                    // mark_dx_set.js: unique axis/sign fit of @GRIDH against the lowest plan's grids
    var plans = S.sheets.filter(function (o) { return viewOf(o) === 'PLAN' && get1(o, 'LEVEL'); }).sort(function (a, b) { return Number(get1(a, 'LEVEL').value) - Number(get1(b, 'LEVEL').value); });
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

  // ---- layer maps: the layer-map set of the ONE gate (Dxf2BimImport.SETS: DX / STD, from the copied dxf2shell_config.js; chosen from the
  // elevation-wall layer evidence, or stated by the user here) + the user's rules for layers the set does not match ----
  function gateNow() { return window.DxfImportUI && window.DxfImportUI.state.gate; }
  function curSet() { var g = gateNow(); return S.setOverride || (g && g.set) || 'DX'; }
  function rulesOut() { return S.layerRules.map(function (r) { return { role: r.role, layer: r.layer, type: r.type, ui: r.ui }; }); }
  function maps() { var X = I.setWith(curSet(), rulesOut()); return { plan: X.MAP_PLAN, elev: X.MAP_ELEV, levl: X.MAP_LEVL, roof: X.MAP_ROOF, sect: X.MAP_SECT }; }
  function tmplQualify() { return I.setWith(curSet(), rulesOut()).QUALIFY; }
  function ruleType(ui, role) {
    if (ui === 'wall') return role === 'elev' ? 'elevwall' : 'wall';
    if (ui === 'door') return role === 'elev' ? 'elevdoor' : 'opening';
    if (ui === 'glazing') return 'glazing'; if (ui === 'roof') return 'roof'; if (ui === 'level') return 'levelline';
    return 'ignore';
  }
  function templateType(role, layer) {
    var X = I.setWith(curSet(), []), ms = role === 'plan' ? [X.MAP_PLAN] : role === 'elev' ? [X.MAP_ELEV, X.MAP_LEVL].concat(X.EXCL_ELEV ? [X.EXCL_ELEV] : []) : role === 'roof' ? [X.MAP_ROOF] : role === 'section' ? [X.MAP_SECT] : [];
    for (var i = 0; i < ms.length; i++) { var r = B.matchRule(layer, ms[i].rules); if (r) return r.type; }
    return null;
  }
  function setLayerRule(role, layer, ui) {
    S.layerRules = S.layerRules.filter(function (r) { return !(r.uiRole === role && r.layer === layer); });
    if (ui) S.layerRules.push({ role: role === 'elev' && ui === 'level' ? 'levl' : role === 'section' ? 'sect' : role, uiRole: role, layer: layer, type: ruleType(ui, role), ui: ui });
    console.log(TAG + ' layer role=' + role + ' layer=' + layer + ' -> ' + (ui || '(unset)'));
    changed();
  }

  // ---- the live verdict: the ONE gate (DxfImportUI.convertGate via applySheets) judges the EFFECTIVE sheets; this editor only shows it ----
  var _t = null;
  function changed() { S.saved = null; render(); schedule(); }
  function schedule(ms) { clearTimeout(_t); S.busy = true; renderHead(); if (window.DxfImportUI.holdGate) window.DxfImportUI.holdGate('Checking the drawings…'); _t = setTimeout(run, ms === undefined ? 250 : ms); }
  async function run() {
    var tok = ++S.token, t0 = performance.now();
    try {
      var eff = S.sheets.map(effSheet);
      var g = await window.DxfImportUI.applySheets(eff, rulesOut(), S.setOverride || null);
      if (tok !== S.token) return;
      var v = g.verdict; v.pipeline = g.R && !g.R.refused ? { ran: true, run_id: g.R.run_id } : { ran: false, why: g.refused.map(function (r) { return r.sheet + ': ' + r.reason; }).join('; ') };
      S.verdict = v; S.busy = false; S.lib = g.lib;
      var ac = {}; v.advisory.forEach(function (x) { ac[x.code] = (ac[x.code] || 0) + 1; });
      console.log(TAG + ' verdict=' + v.verdict + ' blocking=' + v.blocking.length + ' advisory=' + v.advisory.length + ' pipeline=' + (v.pipeline.ran ? 'ran run_id=' + v.pipeline.run_id.slice(0, 12) : 'NOT RUN (' + v.pipeline.why.slice(0, 200) + ')') +
        ' counts=' + JSON.stringify(v.counts) + ' ms=' + Math.round(performance.now() - t0));
      render();
    } catch (e) { S.busy = false; console.error(TAG + ' verdict failed ' + (e && e.stack || e)); renderHead(); }
  }
  // ---- canvas: zoom + highlight, Tag and Exclude tools ----
  function canvasOf(name) { var st = window.DxfImportUI && window.DxfImportUI.state; return st && st.canvas ? st.canvas[name] : null; }
  var hl = null;
  function highlight(item) {
    var THREE = window.THREE, A = window.A; if (!THREE || !A) return false;
    if (hl) { A.scene.remove(hl); hl.geometry.dispose(); hl = null; }
    var c = item.sheet ? canvasOf(item.sheet) : null; if (!c || !c.toWorld) { console.log(TAG + ' zoom: sheet ' + item.sheet + ' not on the canvas'); return false; }
    var P = []; (item.handles || []).forEach(function (h) { (c.segOf[h] || []).forEach(function (v) { P.push(v); }); });
    var pts = [];
    if (P.length) for (var i = 0; i < P.length; i += 3) pts.push([P[i], P[i + 1], P[i + 2]]);
    if (item.pos && typeof item.pos.x === 'number' && typeof item.pos.y === 'number') pts.push(c.toWorld(item.pos.x, item.pos.y));
    if (!pts.length) { console.log(TAG + ' zoom: item has no position'); return false; }
    if (P.length) {
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      hl = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff4fd8, depthTest: false })); hl.renderOrder = 5; hl.name = 'dxf-meta-highlight'; A.scene.add(hl);
    }
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { for (var a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } });
    var ctr = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), r = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1.5) * 0.5 + 1.0;
    var d = new THREE.Vector3(1, -1, 1.3).normalize(), dist = r / Math.sin((A.camera.fov * Math.PI / 180) / 2) * 1.2;
    A.camera.up.set(0, 0, 1); A.controls.target.copy(ctr); A.camera.position.copy(ctr).addScaledVector(d, dist); A.controls.update();
    // keep the item in the canvas area the panels do not cover: pan so it sits at the centre of the free strip right of the editor
    var cv = A.renderer.domElement.getBoundingClientRect(), pr = S.panel && S.panel.style.display !== 'none' ? S.panel.getBoundingClientRect().right : cv.left;
    var dxPx = (pr + (cv.right - pr) / 2) - (cv.left + cv.width / 2);
    if (dxPx > 0) { A.camera.updateMatrixWorld(); var right = new THREE.Vector3().setFromMatrixColumn(A.camera.matrixWorld, 0), wpp = 2 * dist * Math.tan(A.camera.fov * Math.PI / 360) / cv.height;
      right.multiplyScalar(-dxPx * wpp); A.camera.position.add(right); A.controls.target.add(right); A.controls.update(); }
    if (A.requestRender) A.requestRender();
    console.log(TAG + ' zoom item=' + item.code + ' sheet=' + item.sheet + ' handles=' + (item.handles || []).slice(0, 6).join(',') + ' highlighted segments=' + P.length / 6 + ' centre=' + [ctr.x, ctr.y, ctr.z].map(function (v) { return v.toFixed(3); }).join(','));
    S.lastZoom = { code: item.code, sheet: item.sheet, segs: P.length / 6, centre: [ctr.x, ctr.y, ctr.z] };
    return true;
  }
  function rayFrom(ev) {
    var THREE = window.THREE, A = window.A, el = A.renderer.domElement, rc = el.getBoundingClientRect();
    var ndc = new THREE.Vector2(((ev.clientX - rc.left) / rc.width) * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1);
    var ray = new THREE.Raycaster(); ray.setFromCamera(ndc, A.camera); return ray;
  }
  function planeHit(ray, z) { var THREE = window.THREE, p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p) ? p : null; }
  var exBox = null, drag = null;
  function onDown(ev) {
    if (!S.tool || ev.button !== 0) return;
    var st = window.DxfImportUI.state;
    if (S.tool === 'tag') {
      var ray = rayFrom(ev); ray.params.Line = { threshold: 0.12 };
      var objs = st.group ? st.group.children.filter(function (o) { var c = st.canvas[o.userData.dxfSheet]; return c && (c.role === 'plan' || c.role === 'roof'); }) : [];
      var hit = ray.intersectObjects(objs, false)[0];
      if (!hit) { console.log(TAG + ' tag: no entity under the pointer'); return; }
      var hnd = hit.object.userData.segHandles[Math.floor(hit.index / 2)], sn = hit.object.userData.dxfSheet;
      var sh = S.sheets.filter(function (s) { return s.name === sn; })[0], e = sh.dxf.entities.filter(function (q) { return q.handle === hnd; })[0];
      var bb = entBox(e);
      S.pick = { sheet: sn, handle: hnd, layer: e.layer, x: Number(((bb[0] + bb[2]) / 2).toFixed(3)), y: Number(((bb[1] + bb[3]) / 2).toFixed(3)), cls: guessCls(sh, e.layer) };
      console.log(TAG + ' tag picked sheet=' + sn + ' handle=' + hnd + ' layer=' + e.layer + ' centre=' + S.pick.x + ',' + S.pick.y);
      S.sec.tags = true; render(); highlight({ code: 'tag', sheet: sn, handles: [hnd], pos: null });
      ev.stopPropagation(); ev.preventDefault();
    } else if (S.tool === 'exclude') {
      var c = S.exSheet && canvasOf(S.exSheet); if (!c || c.z === undefined) { console.log(TAG + ' exclude: choose a plan or roof sheet first'); return; }
      var p0 = planeHit(rayFrom(ev), c.z); if (!p0) return;
      drag = { p0: p0, p1: p0.clone(), c: c }; console.log(TAG + ' exclude drag start sheet=' + S.exSheet + ' at ' + p0.x.toFixed(3) + ',' + p0.y.toFixed(3)); window.A.controls.enabled = false; ev.stopPropagation(); ev.preventDefault(); drawBox();
    }
  }
  function onMove(ev) { if (!drag) return; var p = planeHit(rayFrom(ev), drag.c.z); if (p) { drag.p1 = p; drawBox(); } ev.stopPropagation(); }
  function onUp(ev) {
    if (!drag) return; var d = drag; drag = null; window.A.controls.enabled = true;
    var k = d.c.k, r = [Math.min(d.p0.x, d.p1.x) / k, Math.min(d.p0.y, d.p1.y) / k, Math.max(d.p0.x, d.p1.x) / k, Math.max(d.p0.y, d.p1.y) / k].map(function (v) { return Number(v.toFixed(3)); });
    if (exBox) { window.A.scene.remove(exBox); exBox = null; }
    if (r[2] - r[0] <= 0 || r[3] - r[1] <= 0) { console.log(TAG + ' exclude: empty box, nothing written'); return; }
    var sh = S.sheets.filter(function (s) { return s.name === S.exSheet; })[0];
    addMulti(sh, 'EXCLUDE', r.join(','), r[0], r[1]);
    ev.stopPropagation();
  }
  function drawBox() {
    var THREE = window.THREE, A = window.A; if (exBox) { A.scene.remove(exBox); exBox.geometry.dispose(); }
    var a = drag.p0, b = drag.p1, z = drag.c.z + 0.01, P = [a.x, a.y, z, b.x, a.y, z, b.x, a.y, z, b.x, b.y, z, b.x, b.y, z, a.x, b.y, z, a.x, b.y, z, a.x, a.y, z];
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    exBox = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffb74d, depthTest: false })); exBox.renderOrder = 6; A.scene.add(exBox); if (A.requestRender) A.requestRender();
  }
  function entBox(e) {
    var pts = (e.vertices || []).slice(); ['center', 'position', 'startPoint', 'endPoint'].forEach(function (k) { if (e[k]) pts.push(e[k]); });
    if (e.center && e.radius) { pts.push({ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius }); }
    return [Math.min.apply(null, pts.map(function (p) { return p.x; })), Math.min.apply(null, pts.map(function (p) { return p.y; })), Math.max.apply(null, pts.map(function (p) { return p.x; })), Math.max.apply(null, pts.map(function (p) { return p.y; }))];
  }
  function guessCls(sh, layer) { var t = templateType(ROLE_VIEW[viewOf(sh)] || 'plan', layer); return t === 'opening' || t === 'elevdoor' ? 'door' : t === 'glazing' ? 'window' : t === 'wall' || t === 'wallline' ? 'wall' : ''; }
  function vocab() {     // canned: library product family ids (local subset) + the set's @SCHEDULE texts; never free text
    var v = []; if (S.lib && S.lib.families) S.lib.families.forEach(function (f) { v.push({ id: f.id, src: 'library', cls: f.ot === 'DOOR' ? 'door' : f.ot === 'WINDOW' ? 'window' : null }); });
    S.sheets.forEach(function (sh) { sh.marks.filter(function (m) { return m.key === 'SCHEDULE'; }).forEach(function (m) { var p = m.value.split(','); if (!v.some(function (q) { return q.id === p[0]; })) v.push({ id: p[0], src: 'schedule', cls: p[1] }); }); });
    return v.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }
  function setTool(t) {
    S.tool = S.tool === t ? null : t; S.pick = null;
    var el = window.A && window.A.renderer && window.A.renderer.domElement;
    if (el && !el._dmBound) { el.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); el._dmBound = true; }
    if (el) el.style.cursor = S.tool ? 'crosshair' : '';
    console.log(TAG + ' tool=' + (S.tool || 'none')); render();
  }

  // ---- save: one marked COPY per sheet (originals never written) ----
  function saveName(name) { return name.replace(/\.dxf$/i, '').replace(/_marked$/i, '') + '_marked.dxf'; }
  function save() {
    var out = S.sheets.map(function (sh) { return { name: saveName(sh.name), text: effText(sh), from: sh.name }; });
    out.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/dxf' })); a.download = f.name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      }, i * 250);
    });
    S.saved = out.map(function (f) { return f.name; });
    console.log(TAG + ' save ' + out.map(function (f) { return f.name + ' bytes=' + f.text.length; }).join(' , ') + ' by-suffix=' + (S.byOk ? 'written' : 'NOT accepted by the synced grammar yet'));
    render();
    return out;
  }

  // ---- panel ----
  function css() {
    if (document.getElementById('dm-css')) return;
    var st = document.createElement('style'); st.id = 'dm-css';
    st.textContent = [
      '#dm-panel{position:fixed;left:528px;top:60px;width:372px;max-height:calc(100vh - 140px);display:flex;flex-direction:column;background:#1b1d23;border:1px solid #2c303a;border-radius:10px;z-index:31;color:#c7cdd8;font:12px system-ui,sans-serif;overflow:hidden;transition:left .18s ease}',
      'body.ol-collapsed #dm-panel{left:288px}',
      '#dm-panel .ip-head{display:flex;align-items:center;gap:8px;padding:10px 10px 9px;border-bottom:1px solid #23262e}',
      '#dm-panel .ip-title{font-size:10px;letter-spacing:.14em;color:#5b6473;text-transform:uppercase}',
      '.dm-ico{width:14px;height:14px;flex:0 0 auto;color:#7f8aa0}',
      '.dm-x{margin-left:6px;background:transparent;border:0;color:#7f8aa0;cursor:pointer;padding:2px;display:inline-flex}',
      '.dm-chip{display:inline-flex;align-items:center;gap:5px;font-size:10px;border:1px solid #2c303a;border-radius:8px;padding:2px 8px;margin-left:auto;white-space:nowrap}',
      '.dm-chip .dm-ico{width:12px;height:12px}.dm-chip.ok{border-color:#2f6b45;color:#9be0b4}.dm-chip.ok .dm-ico{color:#9be0b4}.dm-chip.bad{border-color:#7a3b3b;color:#f2a3a3}.dm-chip.bad .dm-ico{color:#f2a3a3}.dm-chip.busy{color:#9aa3b2}',
      '#dm-body{overflow:auto;padding:4px 8px 8px;flex:1 1 auto}',
      '.dm-sec{border-bottom:1px solid #23262e}.dm-sec:last-child{border-bottom:0}',
      '.dm-sh{display:flex;align-items:center;gap:7px;padding:8px 4px;cursor:pointer;font-size:10px;letter-spacing:.12em;color:#7f8aa0;text-transform:uppercase;user-select:none}',
      '.dm-sh:hover{color:#c7cdd8}.dm-sh .cnt{margin-left:auto;font-family:ui-monospace,monospace;letter-spacing:0;text-transform:none}.dm-sh .cnt.bad{color:#f2a3a3}',
      '.dm-sb{padding:0 2px 8px}',
      '.dm-card{border:1px solid #23262e;border-radius:8px;margin:4px 0;background:#181a20}',
      '.dm-ch{display:flex;align-items:center;gap:7px;padding:6px 8px;cursor:pointer}.dm-ch .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dm-cb{padding:2px 8px 8px}',
      '.dm-role{font-size:9px;font-family:ui-monospace,monospace;border:1px solid #2c303a;border-radius:6px;padding:2px 6px;color:#9aa3b2}.dm-role.need{border-color:#7a3b3b;color:#f2a3a3}',
      '.dm-f{display:flex;align-items:center;gap:6px;margin:4px 0}.dm-f>label{width:64px;flex:0 0 auto;color:#9aa3b2;font-size:11px}.dm-f>label.need{color:#f2a3a3}',
      '.dm-in,.dm-sel{background:#13151a;border:1px solid #2c303a;border-radius:7px;color:#c7cdd8;padding:4px 7px;font:inherit;font-size:11px;outline:none;min-width:0}',
      '.dm-in{flex:1}.dm-in:focus,.dm-sel:focus{border-color:#3a6ea5}.dm-in.need,.dm-sel.need{border-color:#a04848;background:#211517}',
      '.dm-in.n{width:62px;flex:0 0 auto}.dm-in.lab{width:38px;flex:0 0 auto}',
      '.dm-src{font-size:9px;color:#5b6473;white-space:nowrap;width:52px;text-align:right;flex:0 0 auto}.dm-src.user{color:#8ec5ff}.dm-src.model{color:#c9b0ff}',
      '.dm-sub{font-size:9px;letter-spacing:.1em;color:#5b6473;text-transform:uppercase;margin:9px 0 3px;display:flex;align-items:center;gap:6px}.dm-sub.need{color:#f2a3a3}',
      '.dm-mk{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:6px;font-family:ui-monospace,monospace;font-size:10.5px}.dm-mk:hover{background:#20232b}.dm-mk .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dm-ib{background:transparent;border:0;color:#7f8aa0;cursor:pointer;padding:2px;display:inline-flex;border-radius:5px}.dm-ib:hover{color:#c7cdd8;background:#2a2e38}.dm-ib .dm-ico{width:13px;height:13px}',
      '.dm-pr{display:flex;align-items:center;gap:6px;padding:3px 4px;border:1px dashed #3a4150;border-radius:6px;margin:3px 0;font-size:10.5px}.dm-pr .t{flex:1;min-width:0}.dm-pr .t b{font-family:ui-monospace,monospace;font-weight:500;color:#d7dce5}.dm-pr .w{display:block;color:#5b6473;font-size:9.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dm-pr .dm-ib{border:1px solid #2f6b45;color:#9be0b4}.dm-ref{font-size:9.5px;color:#5b6473;margin:2px 4px}',
      '.dm-btn{display:inline-flex;align-items:center;gap:6px;background:#13151a;border:1px solid #2c303a;border-radius:8px;color:#c7cdd8;padding:5px 9px;cursor:pointer;font:inherit;font-size:11px}',
      '.dm-btn:hover{background:#1b1f27}.dm-btn.on{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dm-btn.primary{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dm-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.dm-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0}',
      '.dm-lay{display:flex;align-items:center;gap:6px;padding:3px 4px}.dm-lay .nm{flex:1;font-family:ui-monospace,monospace;font-size:10.5px;overflow:hidden;text-overflow:ellipsis}.dm-lay .n{color:#5b6473;font-size:9.5px;width:28px;text-align:right}',
      '.dm-tt{font-size:9.5px;border:1px solid #2c303a;border-radius:6px;padding:1px 6px;color:#9aa3b2}',
      '.dm-shape{display:grid;grid-template-columns:1fr 46px 46px;gap:2px 6px;font-size:11px;margin:2px 0 6px}.dm-shape .h{font-size:9px;color:#5b6473;letter-spacing:.08em;text-transform:uppercase}.dm-shape .b{color:#f2a3a3;text-align:right;font-family:ui-monospace,monospace}.dm-shape .a{color:#f0c674;text-align:right;font-family:ui-monospace,monospace}.dm-shape .z{color:#5b6473}',
      '.dm-tabs{display:flex;gap:5px;margin:4px 0}',
      '.dm-it{display:flex;gap:7px;align-items:flex-start;padding:4px 5px;border-radius:6px;cursor:pointer;font-size:10.5px;line-height:1.35}.dm-it:hover{background:#20232b}.dm-it.nopos{cursor:default}',
      '.dm-it .c{font-family:ui-monospace,monospace;color:#f2a3a3;flex:0 0 auto;width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dm-it.adv .c{color:#f0c674}.dm-it .m{color:#9aa3b2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '#dm-panel .ip-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #23262e}#dm-note{width:100%;font-size:10.5px;color:#7f8aa0;line-height:1.4}',
      '@keyframes dmspin{to{transform:rotate(360deg)}}.dm-spin{animation:dmspin 1s linear infinite}'
    ].join('');
    document.head.appendChild(st);
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function srcLabel(m) { var by = m.source === 'user' ? 'user' : m.by; return by === 'user' ? '<span class="dm-src user" data-src="user">you</span>' : by === 'model' ? '<span class="dm-src model" data-src="model">from model</span>' : '<span class="dm-src" data-src="file">from file</span>'; }
  function opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label === undefined ? (v === '' ? '—' : v) : label) + '</option>'; }
  function missingOf(sh) { var d = describeOf(sh), miss = []; d.errors.forEach(function (e) { if (e.code === 'MARK:missing') miss = miss.concat(e.keys || []); }); return { miss: miss, errors: d.errors.filter(function (e) { return e.code !== 'MARK:missing'; }), desc: d.desc }; }
  function field(sh, si, key, label, miss, kind, choices) {
    var m = get1(sh, key), need = miss.indexOf(key) >= 0, id = 'dm-f-' + si + '-' + key;
    var h = '<div class="dm-f"><label class="' + (need ? 'need' : '') + '" for="' + id + '">' + label + '</label>';
    if (kind === 'select') h += '<select class="dm-sel' + (need ? ' need' : '') + '" id="' + id + '" data-act="single" data-sheet="' + si + '" data-key="' + key + '">' + [''].concat(choices).map(function (c) { return opt(c, m ? m.value : ''); }).join('') + '</select><span style="flex:1"></span>';
    else h += '<input class="dm-in' + (need ? ' need' : '') + '" id="' + id + '" data-act="single" data-sheet="' + si + '" data-key="' + key + '" value="' + esc(m ? m.value : '') + '"' + (kind === 'num' ? ' inputmode="decimal"' : '') + ' spellcheck="false">';
    return h + (m ? srcLabel(m) : '<span class="dm-src"></span>') + '</div>';
  }
  function multiBlock(sh, si, keys, title, miss, needKey) {
    var need = miss.some(function (k) { return k.indexOf(needKey) === 0; }), h = '<div class="dm-sub' + (need ? ' need' : '') + '">' + title + (need ? ' (need 2 or more)' : '') + '</div>';
    sh.marks.forEach(function (m, idx) {
      if (keys.indexOf(m.key) < 0) return;
      var p = SINGLE_POS[m.key];
      h += '<div class="dm-mk" data-mark="' + esc(m.key + '=' + m.value) + '"><span class="t">@' + m.key + '=' + esc(m.value) + (p === 'x' ? '  x ' + num(m.x) : p === 'y' ? '  y ' + num(m.y) : '') + '</span>' + srcLabel(m) +
        '<button class="dm-ib" title="Remove" data-act="rm" data-sheet="' + si + '" data-idx="' + idx + '">' + IC.trash + '</button></div>';
    });
    var kSel = keys.length > 1 ? '<select class="dm-sel" data-add-key="' + si + '-' + needKey + '">' + keys.map(function (k) { return opt(k, keys[0]); }).join('') + '</select>' : '';
    var isZ = needKey === 'Z';
    h += '<div class="dm-row">' + kSel + '<input class="dm-in lab" id="dm-av-' + si + '-' + needKey + '" placeholder="' + (isZ ? 'z m' : 'label') + '" data-add-val="' + si + '-' + needKey + '" spellcheck="false">' +
      '<input class="dm-in n" id="dm-ap-' + si + '-' + needKey + '" placeholder="' + (isZ ? 'drawing y' : keys.length > 1 ? 'x or y' : 'x') + '" data-add-pos="' + si + '-' + needKey + '" inputmode="decimal">' +
      '<button class="dm-btn" data-act="add" data-sheet="' + si + '" data-group="' + needKey + '" data-keys="' + keys.join(',') + '">' + IC.plus + '<span>Add</span></button></div>';
    return h;
  }
  function proposalBlock(sh, si, keysOnly) {
    var P = sh.prop || { list: [], refused: [] }, list = P.list.filter(function (p) { return !keysOnly || keysOnly.indexOf(p.key) >= 0; }), h = '';
    if (!list.length) return '';
    h += '<div class="dm-sub">' + IC.bulb + 'Suggestions (not markings until ticked)</div>';
    list.forEach(function (p) {
      var pi = P.list.indexOf(p), ps = SINGLE_POS[p.key];
      h += '<div class="dm-pr" data-prop="' + esc(p.rule + ':' + p.key + '=' + p.value) + '"><span class="t"><b>@' + p.key + '=' + esc(p.value) + (ps === 'x' ? ' x ' + num(p.x) : ps === 'y' ? ' y ' + num(p.y) : '') + '</b><span class="w">' + esc(p.rule + ': ' + p.why) + '</span></span>' +
        '<button class="dm-ib" title="Confirm this suggestion" data-act="confirm" data-sheet="' + si + '" data-pi="' + pi + '">' + IC.check + '</button></div>';
    });
    return h;
  }
  function roleChip(sh, miss) {
    var v = viewOf(sh), bad = !v || miss.miss.length || miss.errors.length;
    var t = !v ? 'NO ROLE' : v === 'PLAN' ? 'PLAN' + (get1(sh, 'LEVEL') ? ' @' + get1(sh, 'LEVEL').value : '') : v === 'ELEV' ? 'ELEV' + (get1(sh, 'FACE') ? ' ' + get1(sh, 'FACE').value : '') : v === 'ROOF' ? 'ROOF' + (get1(sh, 'ROOF') ? ' @' + get1(sh, 'ROOF').value : '') : v;
    return '<span class="dm-role' + (bad ? ' need' : '') + '">' + esc(t) + '</span>';
  }
  function secHead(id, icon, title, cnt, bad) {
    return '<div class="dm-sh" data-act="sec" data-sec="' + id + '">' + (S.sec[id] ? IC.chevD : IC.chevR) + icon + '<span>' + title + '</span><span class="cnt' + (bad ? ' bad' : '') + '">' + (cnt === undefined ? '' : esc(cnt)) + '</span></div>';
  }
  function renderSheets() {
    var nBad = 0, h = '';
    S.sheets.forEach(function (sh, si) {
      var mi = missingOf(sh), v = viewOf(sh), open = !!S.open[si];
      if (!v || mi.miss.length || mi.errors.length) nBad++;
      h += '<div class="dm-card" data-card="' + si + '"><div class="dm-ch" data-act="card" data-sheet="' + si + '">' + (open ? IC.chevD : IC.chevR) + IC.file + '<span class="nm" title="' + esc(sh.name) + '">' + esc(sh.name) + '</span>' + roleChip(sh, mi) + '</div>';
      if (open) {
        h += '<div class="dm-cb">';
        h += field(sh, si, 'VIEW', 'Role', mi.miss.indexOf('VIEW') >= 0 || !v ? ['VIEW'] : [], 'select', ['PLAN', 'ELEV', 'ROOF', 'SECTION']);
        h += field(sh, si, 'SET', 'Set', mi.miss) + field(sh, si, 'NAME', 'Name', mi.miss);
        if (v === 'PLAN') { h += field(sh, si, 'LEVEL', 'Level (m)', mi.miss, 'num'); h += multiBlock(sh, si, ['GRIDX', 'GRIDY'], 'Grid lines', mi.miss, 'GRID'); }
        if (v === 'ELEV') { h += field(sh, si, 'FACE', 'Face', mi.miss, 'select', ['minX', 'maxX', 'minY', 'maxY']) + field(sh, si, 'HAXIS', 'H axis', mi.miss, 'select', ['+X', '-X', '+Y', '-Y']) + field(sh, si, 'ROOF', 'Roof top (m)', mi.miss, 'num'); }
        if (v === 'ROOF') h += field(sh, si, 'LEVEL', 'Level (m)', mi.miss, 'num') + field(sh, si, 'ROOF', 'Roof top (m)', mi.miss, 'num');
        if (v === 'SECTION') h += field(sh, si, 'HAXIS', 'H axis', mi.miss, 'select', ['+X', '-X', '+Y', '-Y']) + field(sh, si, 'CUT', 'Cut', mi.miss);
        if (v === 'ELEV' || v === 'SECTION') { h += multiBlock(sh, si, ['GRIDH'], 'Grid lines', mi.miss, 'GRIDH') + multiBlock(sh, si, ['Z'], 'Level datums (@Z)', mi.miss, 'Z'); }
        mi.errors.forEach(function (e) { h += '<div class="dm-ref" style="color:#f2a3a3">' + esc(e.code + ' ' + e.message) + '</div>'; });
        h += proposalBlock(sh, si, ['VIEW', 'NAME', 'SET', 'FACE', 'HAXIS', 'GRIDX', 'GRIDY', 'GRIDH', 'Z']);
        (sh.prop ? sh.prop.refused : []).filter(function (r) { return r.rule !== 'PR-UNITS'; }).forEach(function (r) { h += '<div class="dm-ref">' + esc(r.rule + ' not proposed: ' + r.why) + '</div>'; });
        h += '</div>';
      }
      h += '</div>';
    });
    return secHead('sheets', IC.file, 'Sheets', nBad ? nBad + ' need input' : 'complete', nBad) + (S.sec.sheets ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function renderUnits() {
    var nBad = 0, h = '';
    S.sheets.forEach(function (sh, si) {
      var m = get1(sh, 'UNITS'), iu = sh.dxf.header && sh.dxf.header.$INSUNITS, fs = HEADER_UNITS[iu];
      if (!m) nBad++;
      var p = (sh.prop ? sh.prop.list : []).filter(function (q) { return q.key === 'UNITS'; })[0], pi = p ? sh.prop.list.indexOf(p) : -1;
      h += '<div class="dm-f"><label class="' + (m ? '' : 'need') + '" title="' + esc(sh.name) + '" style="width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sh.name.replace(/\.dxf$/i, '')) + '</label>' +
        '<select class="dm-sel' + (m ? '' : ' need') + '" data-act="single" data-sheet="' + si + '" data-key="UNITS">' + ['', 'mm', 'cm', 'm', 'in', 'ft'].map(function (u) { return opt(u, m ? m.value : ''); }).join('') + '</select>' +
        '<span class="dm-ref" style="margin:0;flex:1;white-space:nowrap" title="$INSUNITS=' + esc(iu) + '">file says ' + esc(fs || 'nothing') + '</span>' +
        (p && !m ? '<button class="dm-ib" style="border:1px solid #2f6b45;color:#9be0b4" title="Confirm: use the file\'s ' + esc(p.value) + '" data-act="confirm" data-sheet="' + si + '" data-pi="' + pi + '">' + IC.check + '</button>' : '') + (m ? srcLabel(m) : '') + '</div>';
    });
    h = '<div class="dm-ref" style="margin:2px 0 6px">Units are never taken from the header by themselves: pick one, or tick the file\'s value.</div>' + h;
    return secHead('units', IC.ruler, 'Units', nBad ? nBad + ' unconfirmed' : 'confirmed', nBad) + (S.sec.units ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function renderLayers() {
    var byRole = {}, nBad = 0, h = '';
    S.sheets.forEach(function (sh) { var role = ROLE_VIEW[viewOf(sh)] || 'none'; sh.dxf.entities.forEach(function (e) { if (e.layer === LAYER) return; var R = byRole[role] = byRole[role] || {}; R[e.layer] = (R[e.layer] || 0) + 1; }); });
    ['plan', 'elev', 'roof', 'section', 'none'].forEach(function (role) {
      if (!byRole[role]) return;
      h += '<div class="dm-sub">' + (role === 'none' ? 'Sheets without a role (choose a role first)' : role.toUpperCase() + ' sheets') + '</div>';
      Object.keys(byRole[role]).sort().forEach(function (L) {
        var tt = role === 'none' ? null : templateType(role, L), ur = S.layerRules.filter(function (r) { return r.uiRole === role && r.layer === L; })[0];
        h += '<div class="dm-lay"><span class="nm" title="' + esc(L) + '">' + esc(L) + '</span><span class="n">' + byRole[role][L] + '</span>';
        if (role === 'none' || (role === 'section' && !tt)) h += '<span class="dm-tt">' + (role === 'none' ? 'no role' : 'not read') + '</span>';
        else if (tt) h += '<span class="dm-tt" title="NCS/AIA template (dxf2shell_config.js)">' + esc(tt) + ' · template</span>';
        else { if (!ur) nBad++;
          h += '<select class="dm-sel' + (ur ? '' : ' need') + '" data-act="layer" data-role="' + role + '" data-layer="' + esc(L) + '">' + [''].concat(LAYER_TYPES, role === 'roof' ? ['roof'] : []).map(function (t) { return opt(t, ur ? ur.ui : ''); }).join('') + '</select>' + (ur ? '<span class="dm-src user" data-src="user">you</span>' : ''); }
        h += '</div>';
      });
    });
    var g = gateNow(), ev = g && g.roles ? (g.roles.evidence !== undefined ? g.roles.evidence : g.roles.set) : null;
    h = '<div class="dm-f"><label style="width:auto">Layer set</label><select class="dm-sel" data-act="tpl" style="flex:1">' + opt('', S.setOverride || '', 'From the drawings' + (ev ? ' (' + ev + ')' : ' (none fits)')) +
      Object.keys(I.SETS).map(function (k) { return opt(k, S.setOverride || '', k === 'DX' ? 'NCS/AIA, Duplex DX' : k === 'STD' ? 'NCS/AIA R12, standard set' : k); }).join('') + '</select></div>' +
      '<div class="dm-ref" style="margin:2px 0 6px">Set in use: ' + esc(curSet()) + (S.setOverride ? ' (you)' : ' (elevation-wall layers)') + ', maps from dxf2shell_config.js. Red = a layer the set does not read; choose what it is.</div>' + h;
    return secHead('layers', IC.layers, 'Layers', nBad ? nBad + ' unmapped' : 'mapped', nBad) + (S.sec.layers ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function listMarks(key) {
    var h = '', n = 0;
    S.sheets.forEach(function (sh, si) { sh.marks.forEach(function (m, idx) { if (m.key !== key) return; n++;
      h += '<div class="dm-mk"><span class="t">' + esc(sh.name.replace(/\.dxf$/i, '')) + '  @' + key + '=' + esc(m.value) + (key === 'TAG' ? ' at ' + num(m.x) + ',' + num(m.y) : '') + '</span>' + srcLabel(m) +
        '<button class="dm-ib" title="Remove" data-act="rm" data-sheet="' + si + '" data-idx="' + idx + '">' + IC.trash + '</button></div>'; }); });
    return { h: h, n: n };
  }
  function renderTags() {
    var L = listMarks('TAG'), h = '<div class="dm-row"><button class="dm-btn' + (S.tool === 'tag' ? ' on' : '') + '" data-act="tool" data-tool="tag">' + IC.crosshair + '<span>' + (S.tool === 'tag' ? 'Click an element on a plan' : 'Tag tool') + '</span></button></div>';
    if (S.pick) {
      var V = vocab().filter(function (q) { return !q.cls || !S.pick.cls || q.cls === S.pick.cls; });
      h += '<div class="dm-card" style="padding:6px 8px"><div class="dm-ref" style="margin:0 0 4px">' + esc(S.pick.sheet.replace(/\.dxf$/i, '') + ' · ' + S.pick.layer + ' · handle ' + S.pick.handle) + '</div>' +
        '<div class="dm-row"><select class="dm-sel" id="dm-tag-cls">' + ['door', 'window', 'wall'].map(function (c) { return opt(c, S.pick.cls || 'door'); }).join('') + '</select>' +
        '<select class="dm-sel" id="dm-tag-val" style="flex:1">' + (V.length ? V.map(function (q) { return opt(q.id, '', q.id + ' (' + q.src + ')'); }).join('') : '<option value="">no vocabulary (no library subset, no @SCHEDULE)</option>') + '</select>' +
        '<button class="dm-btn primary" data-act="tagadd"' + (V.length ? '' : ' disabled') + '>' + IC.check + '<span>Tag</span></button></div></div>';
    }
    return secHead('tags', IC.tag, 'Tags', L.n || '') + (S.sec.tags ? '<div class="dm-sb">' + h + L.h + '</div>' : '');
  }
  function renderExcludes() {
    var L = listMarks('EXCLUDE'), horiz = S.sheets.filter(function (sh) { var v = viewOf(sh); return v === 'PLAN' || v === 'ROOF'; });
    if (!S.exSheet && horiz.length) S.exSheet = horiz[0].name;
    var h = '<div class="dm-row"><select class="dm-sel" data-act="exsheet" style="flex:1">' + horiz.map(function (sh) { return opt(sh.name, S.exSheet, sh.name.replace(/\.dxf$/i, '')); }).join('') + '</select>' +
      '<button class="dm-btn' + (S.tool === 'exclude' ? ' on' : '') + '" data-act="tool" data-tool="exclude"' + (horiz.length ? '' : ' disabled') + '>' + IC.exclude + '<span>' + (S.tool === 'exclude' ? 'Drag a box' : 'Exclude area') + '</span></button></div>';
    return secHead('excludes', IC.exclude, 'Exclude areas', L.n || '') + (S.sec.excludes ? '<div class="dm-sb">' + h + L.h + '</div>' : '');
  }
  function renderWalltops() {
    var h = '', v = S.verdict, nB = 0;
    S.sheets.forEach(function (sh, si) {
      if (viewOf(sh) !== 'PLAN') return;
      var lv = get1(sh, 'LEVEL'), conv = sh.marks.filter(function (m) { return m.key === 'WALLTOP' && /,slab_above$/.test(m.value); })[0];
      h += '<div class="dm-sub">' + esc(sh.name.replace(/\.dxf$/i, '')) + '</div>';
      h += '<div class="dm-f"><input type="checkbox" data-act="walltop" data-sheet="' + si + '"' + (conv ? ' checked' : '') + '><label style="width:auto;flex:1">Interior walls run to the slab above</label>' +
        '<input class="dm-in n" id="dm-wt-' + si + '" value="' + esc(conv ? conv.value.split(',')[0] : S.wtLevel[si] !== undefined ? S.wtLevel[si] : lv ? lv.value : '') + '" title="the storey level the convention names" data-act="walltoplevel" data-sheet="' + si + '">' + (conv ? srcLabel(conv) : '') + '</div>';
      var gaps = v ? v.blocking.concat(v.advisory).filter(function (x) { return x.sheet === sh.name && (x.code === 'GAP:no_elevation_height' || (x.code === 'QF:convention_applied' || x.code === 'QF:height_stated') && x.gap === 'GAP:no_elevation_height') && /WALL/.test((x.detail && x.detail.layer) || x.layer || (x.message || '')); }) : [];
      var walls = gaps.filter(function (x) { return x.code !== 'GAP:no_elevation_height' || !x.detail || /WALL/.test(x.detail.layer || ''); });
      if (walls.length) h += '<div class="dm-ref">' + walls.length + ' wall(s) without a height from the elevations:</div>';
      walls.forEach(function (x) {
        var blk = x.code === 'GAP:no_elevation_height'; if (blk) nB++;
        var hd = x.handles[0], pw = sh.marks.filter(function (m) { return m.key === 'WALLTOP' && m.value.indexOf('handle:' + hd + ',') === 0; })[0];
        h += '<div class="dm-it' + (blk ? '' : ' adv') + '" data-act="zoomwall" data-sheet="' + si + '" data-h="' + esc(hd) + '"><span class="c">' + esc(hd) + (blk ? ' blocking' : ' covered') + '</span>' +
          '<input class="dm-in n" placeholder="top z m" data-act="wallz" data-sheet="' + si + '" data-h="' + esc(hd) + '" value="' + esc(pw ? pw.value.split(',')[1] : '') + '"></div>';
      });
    });
    return secHead('walltops', IC.walltop, 'Wall tops', nB ? nB + ' blocking' : '', nB) + (S.sec.walltops ? '<div class="dm-sb">' + (h || '<div class="dm-ref">No plan sheet yet.</div>') + '</div>' : '');
  }
  function renderVerdict() {
    var v = S.verdict, h = '';
    if (!v) return secHead('verdict', IC.verdict, 'Verdict', S.busy ? 'checking' : '') ;
    h += '<div class="dm-shape"><span class="h">shape</span><span class="h" style="text-align:right">block</span><span class="h" style="text-align:right">advice</span>';
    ['walls', 'slabs', 'roof', 'openings'].forEach(function (k) { var b = v.by_shape[k]; h += '<span>' + k + '</span><span class="' + (b.blocking ? 'b' : 'z') + '">' + b.blocking + '</span><span class="' + (b.advisory ? 'a' : 'z') + '">' + b.advisory + '</span>'; });
    h += '</div>';
    if (!v.pipeline.ran) h += '<div class="dm-ref" style="color:#f2a3a3">Pipeline not run: ' + esc(v.pipeline.why.slice(0, 240)) + '</div>';
    h += '<div class="dm-tabs"><button class="dm-btn' + (S.vtab === 'blocking' ? ' on' : '') + '" data-act="vtab" data-tab="blocking">Blocking ' + v.blocking.length + '</button><button class="dm-btn' + (S.vtab === 'advisory' ? ' on' : '') + '" data-act="vtab" data-tab="advisory">Advisory ' + v.advisory.length + '</button></div>';
    var L = S.vtab === 'blocking' ? v.blocking : v.advisory;
    L.forEach(function (x, i) {
      var c = x.sheet ? canvasOf(x.sheet) : null, can = !!(c && ((x.pos && typeof x.pos.x === 'number' && typeof x.pos.y === 'number') || (x.handles || []).some(function (hh) { return c.segOf && c.segOf[hh]; })));
      h += '<div class="dm-it' + (S.vtab === 'advisory' ? ' adv' : '') + (can ? '' : ' nopos') + '" data-act="item" data-i="' + i + '" title="' + esc(x.message) + '"><span class="c">' + esc(x.code.replace(/^(QF|GAP):/, '')) + '</span><span class="m">' + esc(x.message) + '</span></div>';
    });
    return secHead('verdict', IC.verdict, 'Verdict', v.blocking.length + ' / ' + v.advisory.length, v.blocking.length) + (S.sec.verdict ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function chip() {
    if (S.busy || !S.verdict) return '<span class="dm-chip busy" id="dm-chip">' + IC.loader.replace('dm-ico', 'dm-ico dm-spin') + 'Checking</span>';
    return S.verdict.verdict === 'qualifies' ? '<span class="dm-chip ok" id="dm-chip" data-verdict="qualifies">' + IC.ok + 'Qualifies</span>'
      : '<span class="dm-chip bad" id="dm-chip" data-verdict="blocked">' + IC.warn + 'Blocked · ' + S.verdict.blocking.length + '</span>';
  }
  function renderHead() { var c = document.getElementById('dm-chip'); if (c) c.outerHTML = chip(); }
  function render() {
    if (!S.panel || S.panel.style.display === 'none') return;
    var body = document.getElementById('dm-body'), top = body ? body.scrollTop : 0, ae = document.activeElement, fid = ae && ae.id;
    // keep what the user is typing: unsent "Add" rows and the focused field survive a re-render (a verdict landing mid-typing)
    if (S.panel) S.panel.querySelectorAll('[data-add-val],[data-add-pos],[data-add-key]').forEach(function (el) { var k = el.getAttribute('data-add-val') ? 'v' + el.getAttribute('data-add-val') : el.getAttribute('data-add-pos') ? 'p' + el.getAttribute('data-add-pos') : 'k' + el.getAttribute('data-add-key'); S.draft[k] = el.value; });
    var focusVal = ae && S.panel && S.panel.contains(ae) && ae.tagName === 'INPUT' ? { sel: ae.id ? '#' + ae.id : null, v: ae.value, s: ae.selectionStart } : null;
    S.sheets.forEach(function (sh) { sh.prop = proposalsFor(sh); });
    var h = '<div class="ip-head">' + IC.clipboard + '<span class="ip-title">Drawing metadata</span>' + chip() + '<button class="dm-x" id="dm-close" title="Close">' + IC.x + '</button></div>' +
      '<div id="dm-body">' + renderSheets() + '<div class="dm-sec">' + renderUnits() + '</div><div class="dm-sec">' + renderLayers() + '</div><div class="dm-sec">' + renderTags() + '</div><div class="dm-sec">' + renderExcludes() + '</div><div class="dm-sec">' + renderWalltops() + '</div><div class="dm-sec">' + renderVerdict() + '</div></div>' +
      '<div class="ip-foot"><button class="dm-btn primary" id="dm-save">' + IC.save + '<span>Save marked copies</span></button><div id="dm-note">' +
      (S.saved ? 'Downloaded: ' + esc(S.saved.join(', ')) + '. The opened files are unchanged.' : 'Save writes the markings as DXF2BIM-MARK texts into downloaded copies (&lt;name&gt;_marked.dxf).') +
      (S.byOk ? '' : ' Source suffix @BY=user: not yet accepted by the synced grammar, so not written.') + '</div></div>';
    S.panel.innerHTML = h;
    var nb = document.getElementById('dm-body'); nb.scrollTop = top;
    S.panel.querySelectorAll('[data-add-val],[data-add-pos],[data-add-key]').forEach(function (el) { var k = el.getAttribute('data-add-val') ? 'v' + el.getAttribute('data-add-val') : el.getAttribute('data-add-pos') ? 'p' + el.getAttribute('data-add-pos') : 'k' + el.getAttribute('data-add-key'); if (S.draft[k] !== undefined) el.value = S.draft[k]; });
    if (fid) { var f = document.getElementById(fid); if (f) { f.focus(); if (focusVal && focusVal.sel === '#' + fid && f.value !== focusVal.v) { f.value = focusVal.v; try { f.setSelectionRange(focusVal.s, focusVal.s); } catch (e) { /* select */ } } } }
    wire();
  }
  function sheetAt(el) { return S.sheets[Number(el.getAttribute('data-sheet'))]; }
  function wire() {
    var P = S.panel;
    document.getElementById('dm-close').onclick = function () { close(); };
    document.getElementById('dm-save').onclick = function () { save(); };
    P.querySelectorAll('[data-act]').forEach(function (el) {
      var a = el.getAttribute('data-act');
      if (a === 'sec') el.onclick = function () { var k = el.getAttribute('data-sec'); S.sec[k] = !S.sec[k]; render(); };
      else if (a === 'card') el.onclick = function () { var k = el.getAttribute('data-sheet'); S.open[k] = !S.open[k]; render(); };
      else if (a === 'single') { el.onchange = function () { setSingle(sheetAt(el), el.getAttribute('data-key'), el.value); }; if (el.tagName === 'INPUT') el.onkeydown = function (e) { if (e.key === 'Enter') el.blur(); }; }
      else if (a === 'rm') el.onclick = function () { removeMark(sheetAt(el), Number(el.getAttribute('data-idx'))); };
      else if (a === 'add') el.onclick = function () {
        var si = el.getAttribute('data-sheet'), g = el.getAttribute('data-group'), keys = el.getAttribute('data-keys').split(',');
        var ks = P.querySelector('[data-add-key="' + si + '-' + g + '"]'), key = ks ? ks.value : keys[0];
        var val = P.querySelector('[data-add-val="' + si + '-' + g + '"]').value.trim(), pos = Number(P.querySelector('[data-add-pos="' + si + '-' + g + '"]').value);
        if (!val || !isFinite(pos) || P.querySelector('[data-add-pos="' + si + '-' + g + '"]').value.trim() === '') { console.log(TAG + ' add refused: value and position are both needed'); return; }
        if (key === 'Z' && !isFinite(Number(val))) { console.log(TAG + ' add refused: @Z needs a number'); return; }
        delete S.draft['v' + si + '-' + g]; delete S.draft['p' + si + '-' + g];
        P.querySelector('[data-add-val="' + si + '-' + g + '"]').value = ''; P.querySelector('[data-add-pos="' + si + '-' + g + '"]').value = '';
        addMulti(S.sheets[si], key, val, pos, pos);
      };
      else if (a === 'confirm') el.onclick = function () { var sh = sheetAt(el), p = sh.prop.list[Number(el.getAttribute('data-pi'))];
        if (SINGLE_POS[p.key] === undefined && ['EXCLUDE', 'WALLTOP', 'TAG'].indexOf(p.key) < 0) { sh.marks = sh.marks.filter(function (q) { return q.key !== p.key; }); sh.marks.push({ key: p.key, value: p.value, x: 0, y: 0, source: 'user', rule: p.rule }); console.log(TAG + ' confirm sheet=' + sh.name + ' ' + p.rule + ' @' + p.key + '=' + p.value); changed(); }
        else addMulti(sh, p.key, p.value, p.x, p.y, p.rule); };
      else if (a === 'layer') el.onchange = function () { setLayerRule(el.getAttribute('data-role'), el.getAttribute('data-layer'), el.value || null); };
      else if (a === 'tool') el.onclick = function () { setTool(el.getAttribute('data-tool')); };
      else if (a === 'exsheet') el.onchange = function () { S.exSheet = el.value; };
      else if (a === 'tpl') el.onchange = function () { S.setOverride = el.value || null; console.log(TAG + ' layer set=' + (S.setOverride || 'from the drawings')); changed(); };
      else if (a === 'tagadd') el.onclick = function () { var c = document.getElementById('dm-tag-cls').value, val = document.getElementById('dm-tag-val').value, pk = S.pick; if (!val) return;
        S.pick = null; addMulti(S.sheets.filter(function (s) { return s.name === pk.sheet; })[0], 'TAG', c + ',' + val, pk.x, pk.y); };
      else if (a === 'walltop' || a === 'walltoplevel') el.onchange = function () {
        var sh = sheetAt(el), si = el.getAttribute('data-sheet'), cb = P.querySelector('[data-act="walltop"][data-sheet="' + si + '"]'), lv = document.getElementById('dm-wt-' + si).value.trim();
        S.wtLevel[si] = lv;   // the typed level survives a re-render while the convention is off
        sh.marks = sh.marks.filter(function (m) { return !(m.key === 'WALLTOP' && /,slab_above$/.test(m.value)); });
        if (cb.checked && lv !== '') addMulti(sh, 'WALLTOP', lv + ',slab_above', 0, 0); else changed(); };
      else if (a === 'wallz') { el.onclick = function (e) { e.stopPropagation(); }; el.onchange = function () {
        var sh = sheetAt(el), hd = el.getAttribute('data-h'), z = el.value.trim();
        sh.marks = sh.marks.filter(function (m) { return !(m.key === 'WALLTOP' && m.value.indexOf('handle:' + hd + ',') === 0); });
        if (z !== '' && isFinite(Number(z))) addMulti(sh, 'WALLTOP', 'handle:' + hd + ',' + z, 0, 0); else changed(); }; }
      else if (a === 'zoomwall') el.onclick = function () { highlight({ code: 'wall', sheet: sheetAt(el).name, handles: [el.getAttribute('data-h')], pos: null }); };
      else if (a === 'vtab') el.onclick = function () { S.vtab = el.getAttribute('data-tab'); render(); };
      else if (a === 'item') el.onclick = function () { var x = (S.vtab === 'blocking' ? S.verdict.blocking : S.verdict.advisory)[Number(el.getAttribute('data-i'))]; highlight(x); };
    });
  }
  function close() { if (S.panel) S.panel.style.display = 'none'; if (S.tool) setTool(S.tool); console.log(TAG + ' panel closed'); }

  // ---- open: from the import (dxf_import_ui.js openFiles) ----
  function bind() { MK = window.Dxf2Marks; Q = window.Dxf2Qualify; I = window.Dxf2BimImport; B = window.Dxf2Bim; Cf = window.Dxf2ShellConfig;
    // the @BY suffix is accepted only when the grammar reads '@LEVEL=1 @BY=user' as LEVEL 1 with no error (today it is a malformed number)
    var t = MK.describe([{ raw: '@LEVEL=1 @BY=user', x: 0, y: 0, handle: '1' }]); S.byOk = t.desc.level === 1 && !t.errors.some(function (e) { return e.code !== 'MARK:missing'; }); }
  function load(sheets) {   // sheets: Dxf2BimImport.readSheets output of the OPENED files
    bind(); S.cache = {};
    S.sheets = sheets.map(function (s) {
      var marks = MK.readMarks(s.dxf.entities).map(function (m) { var p = parseRaw(m.raw); return { key: p.key, value: p.value, by: p.by, raw: m.raw, x: m.x, y: m.y, handle: m.handle, source: 'file' }; });
      var sh = { name: s.name, text: s.text, dxf: s.dxf, marks: marks };
      sh.fileSig = marks.map(function (m) { return [m.raw, m.x, m.y]; });
      S.cache[s.name + '|' + sigOf(sh)] = Object.assign(s, { effText: s.text });   // unedited = the opened file itself
      return sh;
    });
    S.layerRules = []; S.verdict = null; S.open = {}; S.setOverride = null; S.saved = null; S.pick = null; S.exSheet = null; S.wtLevel = {}; S.draft = {};
    S.sheets.forEach(function (sh, i) { var mi = missingOf(sh); if (!viewOf(sh) || mi.miss.length) S.open[i] = true; });
    console.log(TAG + ' loaded sheets=' + S.sheets.length + ' markings from file=' + S.sheets.map(function (sh) { return sh.name + ':' + sh.marks.length; }).join(',') + ' bySuffixAccepted=' + S.byOk);
    css();
    if (!S.panel) { S.panel = document.createElement('div'); S.panel.id = 'dm-panel'; document.body.appendChild(S.panel); }
    S.panel.style.display = 'flex';
    var g = gateNow();   // the import already judged the opened files: show that verdict, no second run
    if (g && g.verdict) { S.verdict = g.verdict; S.verdict.pipeline = g.R && !g.R.refused ? { ran: true, run_id: g.R.run_id } : { ran: false, why: g.refused.map(function (r) { return r.sheet + ': ' + r.reason; }).join('; ') }; S.lib = g.lib; S.busy = false; render();
      console.log(TAG + ' verdict=' + g.verdict.verdict + ' blocking=' + g.verdict.blocking.length + ' advisory=' + g.verdict.advisory.length + ' (the import gate) counts=' + JSON.stringify(g.verdict.counts)); }
    else { render(); schedule(0); }
  }
  function show() { if (!S.panel) return; S.panel.style.display = 'flex'; render(); }

  window.DxfMetaEditor = { load: load, show: show, close: close, save: save, state: S, strip: strip, canon: canon, parseRaw: parseRaw, saveName: saveName,
    effText: effText, highlight: highlight, setTool: setTool, ICON: IC,
    whenIdle: function () { return new Promise(function (res) { (function w() { if (!S.busy && S.verdict) res(S.verdict); else setTimeout(w, 50); })(); }); } };
  console.log(TAG + ' ui loaded');
})();
