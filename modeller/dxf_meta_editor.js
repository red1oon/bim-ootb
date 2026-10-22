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
    door: SVG('<path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/>'),
    walltop: SVG('<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>'),
    verdict: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
    ok: SVG('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    warn: SVG('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    bulb: SVG('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
    save: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'),
    chevR: SVG('<path d="m9 18 6-6-6-6"/>'),
    chevD: SVG('<path d="m6 9 6 6 6-6"/>'),
    crosshair: SVG('<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>'),
    loader: SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'),
    pencil: SVG('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>')
  };

  var ROLE_VIEW = { PLAN: 'plan', ELEV: 'elev', ROOF: 'roof', SECTION: 'section' };
  var HEADER_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };   // DXF $INSUNITS codes (the reader's table, dxf2qualify.js)
  var SINGLE_POS = { GRIDX: 'x', GRIDH: 'x', GRIDY: 'y', Z: 'y', TAG: 'xy' };   // §L4.1 canonical: the position that carries meaning
  // §D36 EVIDENCE TIERS (prompts/DXF2BIM_EVIDENCE_TIERS.md): the KIND of evidence a rule reads, fixed per rule (no rule states a confidence number): stated = the file
  // states it, read = a text names it, inferred = geometry or a convention (orange). Every suggestion stays yellow, not yours, until accepted. W-EVIDENCE E1: every
  // `rule:` of dxf2suggest.js has one tier. The door rules read the drawing's text; an applied default is a convention.
  var TAGE = '§DXF-EVIDENCE';
  var TIER = { 'PR-UNITS': 'stated', 'PR-SET': 'stated', 'PR-VIEW': 'read', 'PR-NAME': 'read', 'PR-Z': 'read', 'PR-GRID': 'read', 'PR-SCHEDULE': 'read', 'PR-TAG': 'read',
    'PR-GRID-TICK': 'inferred', 'PR-Z-GROUND': 'inferred', 'PR-FACE': 'inferred', 'PR-HAXIS': 'inferred', 'PR-CUT': 'inferred', 'PR-LEVEL': 'inferred', 'default': 'inferred' };
  var TIER_WHY = { stated: 'stated: the file states it', read: 'read: a text in the drawing names it', inferred: 'inferred: geometry or a convention, check it (click the row to see the evidence)' };
  function tierOf(rule) { return TIER[rule] || null; }
  function tierMark(t) { t = t || 'inferred'; return '<span class="dm-tier ' + t + '" data-tier-mark="' + t + '" title="' + TIER_WHY[t] + '">' + t + '</span>'; }
  function evId(si, p) { return si + '|' + p.rule + '|' + p.key + '|' + p.value + '|' + num(p.x || 0) + '|' + num(p.y || 0); }
  function prOpen(si, p, extra) {   // a suggestion row: tier class + mark, clickable (fly to its evidence); its id registered for the click
    var t = tierOf(p.rule) || 'inferred', id = evId(si, p); S.evRows[id] = { si: si, rule: p.rule, key: p.key, value: p.value, x: p.x, y: p.y, why: p.why };
    return '<div class="dm-pr' + (t === 'inferred' ? ' inf' : '') + (S.ev === id ? ' dm-evon' : '') + (extra || '') + '" data-tier="' + t + '" data-rule="' + esc(p.rule) + '" data-ev="' + esc(id) + '" title="Click: fly to the evidence on the sheet as it stands">';
  }
  function prTail(si, p) { var id = evId(si, p); return tierMark(tierOf(p.rule)) + (S.ev === id ? '<button class="dm-ib dm-tyo" title="Type over: the field with this value, yours once you change or confirm it" data-act="typeover" data-ev="' + esc(id) + '">' + IC.pencil + '</button>' : ''); }
  function prNote(si, p) { return S.ev === evId(si, p) && S.evNote ? '<div class="dm-evnote">' + esc(S.evNote) + '</div>' : ''; }
  var BODY_KINDS = window.Dxf2Prep.BODY_KINDS;   // §L24 one table (dxf2prep; dxf2marks LAYER_TYPES.BODY must equal it: W-KINDS)
  var LAYER_TYPES = ['wall', 'door', 'glazing', 'dims', 'grid', 'level', 'ignore'].concat(BODY_KINDS);
  var S = { sheets: [], verdict: null, busy: false, token: 0, open: {}, sec: { sheets: true, yellows: true, bodyz: true, sizes: true, edefaults: false, typology: false, units: true, defaults: true, layers: false, tags: false, doors: false, excludes: false, walltops: false, verdict: true },
    vtab: 'blocking', split: {}, wtLevel: {}, draft: {}, evRows: {}, ev: null, evNote: null, tool: null, pick: null, exSheet: null, byOk: false, lib: undefined, cache: {}, panel: null, saved: null, sched: [], dpick: null, dcache: {}, dmsg: null };

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

  // strip(original): drop every TEXT/MTEXT entity on DXF2BIM-MARK (the pure Dxf2Suggest.stripMarks, lane §L8)
  function strip(text) { return window.Dxf2Suggest.stripMarks(text); }
  function effText(sh) {
    if (sameAsFile(sh)) return sh.text;
    return MK.writeMarks(sh.stripped || (sh.stripped = strip(sh.text)), sh.marks.map(function (m) { return { text: markText(m), x: m.x, y: m.y }; }));
  }
  function effSheet(sh) {   // Dxf2BimImport.readSheet of the effective text, cached per marking signature
    var k = sh.name + '|' + sigOf(sh) + '|' + JSON.stringify(S.defaultChoices || {});
    if (!S.cache[k]) { var t = effText(sh); S.cache[k] = I.readSheet(sh.name, t, I.sha256Hex, { prepChoices: S.defaultChoices || {} }); S.cache[k].effText = t; }
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

  // ---- proposals (§L4.1 PR-*, §L7.11): the rules live in the pure module dxf2suggest.js (lane §L8); the editor supplies its sheets and the layer-set context ----
  function gridLayers(sh) { var st = sh ? sh.marks.filter(function (q) { var l = q.key === 'LAYER' && layerOf(q); return l && l.type === 'grid'; }).map(function (q) { return layerOf(q).layer; }) : [];
    return tmplQualify().layers.grid.concat(st); }   // the set's grid layers + the sheet's @LAYER …,grid
  function levelLayers() { var M = maps(); return M.levl.rules.filter(function (r) { return r.type === 'levelline'; }).map(function (r) { return r.pattern; }); }
  var _SUG = null;   // created on first use: MK is bound lazily (bind())
  function SUG() { return _SUG || (_SUG = window.Dxf2Suggest.create({ MK: MK, sheets: function () { return S.sheets; }, gridLayers: gridLayers, levelLayers: levelLayers })); }
  function proposalsFor(sh) { return SUG().proposalsFor(sh); }
  function unitsK(sh) { return SUG().unitsK(sh); }
  function txtPos(e) { return SUG().txtPos(e); }

  // ---- layer maps: the layer-map set of the ONE gate (Dxf2BimImport.SETS: DX / STD, from the copied dxf2shell_config.js; chosen from the
  // elevation-wall layer evidence, or stated by the user here). A layer the set does not read is mapped by a @LAYER=<layer>,<reader type>
  // MARKING on each sheet of that role (§L4.2): it travels with the drawing and the readers apply it (Dxf2Marks.withLayers). ----
  function gateNow() { return window.DxfImportUI && window.DxfImportUI.state.gate; }
  function curSet() { var g = gateNow(); return S.setOverride || (g && g.set) || 'DX'; }
  function maps() { var X = I.setWith(curSet()); return { plan: X.MAP_PLAN, elev: X.MAP_ELEV, levl: X.MAP_LEVL, roof: X.MAP_ROOF, sect: X.MAP_SECT }; }
  function tmplQualify() { return I.setWith(curSet()).QUALIFY; }
  var VIEW_OF_ROLE = { plan: 'PLAN', elev: 'ELEV', roof: 'ROOF', section: 'SECTION' };
  function ruleType(ui, role) {
    if (ui === 'wall') return role === 'elev' ? 'elevwall' : role === 'section' ? 'sectwall' : 'wall';
    if (ui === 'door') return role === 'elev' ? 'elevdoor' : 'opening';
    if (ui === 'level') return 'levelline';
    return ui;   // glazing, roof, dims, grid, ignore
  }
  function uiOf(type) { return { wall: 'wall', elevwall: 'wall', sectwall: 'wall', opening: 'door', elevdoor: 'door', levelline: 'level', glazing: 'glazing', roof: 'roof', dims: 'dims', grid: 'grid', ignore: 'ignore', column: 'column', beam: 'beam', footing: 'footing', gradebeam: 'gradebeam', member: 'member', plate: 'plate' }[type] || null; }
  function uiChoices(role) {   // only the choices the reader of that view accepts (Dxf2Marks.LAYER_TYPES)
    var T = MK.LAYER_TYPES, ok = (T[VIEW_OF_ROLE[role]] || []).concat(T.ANY, T.BODY || []);
    return LAYER_TYPES.concat(['roof']).filter(function (u, i, a) { return a.indexOf(u) === i && ok.indexOf(ruleType(u, role)) >= 0; });
  }
  function templateType(role, layer) {
    var X = I.setWith(curSet()), ms = role === 'plan' ? [X.MAP_PLAN] : role === 'elev' ? [X.MAP_ELEV, X.MAP_LEVL].concat(X.EXCL_ELEV ? [X.EXCL_ELEV] : []) : role === 'roof' ? [X.MAP_ROOF] : role === 'section' ? [X.MAP_SECT] : [];
    for (var i = 0; i < ms.length; i++) { var r = B.matchRule(layer, ms[i].rules); if (r) return r.type; }
    return null;
  }
  function layerOf(m) { var c = m.value.lastIndexOf(','); return c > 0 ? { layer: m.value.slice(0, c).trim(), type: m.value.slice(c + 1).trim() } : null; }
  function statedLayer(role, layer) {   // the first @LAYER marking for that layer on a sheet of that role
    for (var i = 0; i < S.sheets.length; i++) { var sh = S.sheets[i]; if (ROLE_VIEW[viewOf(sh)] !== role) continue;
      var m = sh.marks.filter(function (q) { var l = q.key === 'LAYER' && layerOf(q); return l && l.layer === layer; })[0]; if (m) return { mark: m, type: layerOf(m).type }; }
    return null;
  }
  function setLayerRule(role, layer, ui, only) {   // only (§L9): one sheet by name; otherwise every sheet of the role that holds the layer
    var n = 0;
    S.sheets.forEach(function (sh) {
      if (ROLE_VIEW[viewOf(sh)] !== role || (only && sh.name !== only) || !(sh.dxf.entities.some(function (e) { return e.layer === layer; }) || (sh.hatchLayers && sh.hatchLayers[layer]))) return;
      sh.marks = sh.marks.filter(function (q) { var l = q.key === 'LAYER' && layerOf(q); return !(l && l.layer === layer); });
      if (ui) { sh.marks.push({ key: 'LAYER', value: layer + ',' + ruleType(ui, role), x: 0, y: 0, source: 'user' }); n++; }
    });
    console.log(TAG + ' layer role=' + role + ' layer=' + layer + (only ? ' sheet=' + only : '') + ' -> ' + (ui ? '@LAYER=' + layer + ',' + ruleType(ui, role) + ' on ' + n + ' sheet(s)' : '(cleared)'));
    changed();
  }

  // ---- the live verdict: the ONE gate (DxfImportUI.convertGate via applySheets) judges the EFFECTIVE sheets; this editor only shows it ----
  var _t = null;
  function changed() { S.saved = null; syncSchedule(); render(); schedule(); }
  function schedule(ms) { clearTimeout(_t); S.busy = true; renderHead(); if (window.DxfImportUI.holdGate) window.DxfImportUI.holdGate('Checking the drawings…'); _t = setTimeout(run, ms === undefined ? 250 : ms); }
  async function run() {
    var tok = ++S.token, t0 = performance.now();
    try {
      var eff = S.sheets.map(effSheet);
      var g = await window.DxfImportUI.applySheets(eff, S.setOverride || null);
      if (tok !== S.token) return;
      var v = g.verdict; v.pipeline = g.R && !g.R.refused ? { ran: true, run_id: g.R.run_id } : { ran: false, why: g.refused.map(function (r) { return r.sheet + ': ' + r.reason; }).join('; ') };
      S.verdict = v; S.busy = false; S.lib = g.lib;
      var ac = {}; v.advisory.forEach(function (x) { ac[x.code] = (ac[x.code] || 0) + 1; });
      console.log(TAG + ' verdict=' + v.verdict + ' blocking=' + v.blocking.length + ' advisory=' + v.advisory.length + ' pipeline=' + (v.pipeline.ran ? 'ran run_id=' + v.pipeline.run_id.slice(0, 12) : 'NOT RUN (' + v.pipeline.why.slice(0, 200) + ')') +
        ' counts=' + JSON.stringify(v.counts) + ' ms=' + Math.round(performance.now() - t0));
      render(); attention();
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
      var objs = st.group ? st.group.children.filter(function (o) { var c = st.canvas[o.userData.dxfSheet]; return c && (c.role === 'plan' || c.role === 'roof' || c.role === 'elev'); }) : [];
      var hits = ray.intersectObjects(objs, false);
      // §L4.4: an elevation OPENING under the pointer wins (the drafting way: a stacked window is picked where it is drawn, z from the
      // elevation); a hit on an elevation line that is not an opening is reported, never guessed; otherwise the nearest plan/roof entity
      var eh = null, ewhy = null;
      for (var hi = 0; hi < hits.length && !eh; hi++) {
        var ho = hits[hi].object; if (st.canvas[ho.userData.dxfSheet].role !== 'elev') continue;
        var eS = S.sheets.filter(function (q) { return q.name === ho.userData.dxfSheet; })[0], eHd = ho.userData.segHandles[Math.floor(hits[hi].index / 2)];
        var r = I.elevPick(plans().map(effSheet), effSheet(eS), curSet(), eHd);
        if (r.ok) eh = { r: r, sheet: eS.name, handle: eHd }; else if (!ewhy) ewhy = eS.name.replace(/\.dxf$/i, '') + ' handle ' + eHd + ': ' + r.why;
      }
      if (eh) {
        S.pick = { sheet: eh.r.plan, handle: eh.r.opening, layer: '(from ' + eh.sheet.replace(/\.dxf$/i, '') + ' ' + eh.handle + ')', x: eh.r.x, y: eh.r.y, z: eh.r.z, cls: eh.r.cls, elev: eh.sheet, elevHandle: eh.handle };
        console.log(TAG + ' tag picked elevation=' + eh.sheet + ' handle=' + eh.handle + ' -> plan=' + eh.r.plan + ' opening=' + eh.r.opening + ' at ' + eh.r.x + ',' + eh.r.y + ' z=' + eh.r.z + ' class=' + eh.r.cls + ' faceDist=' + eh.r.faceDist);
        S.tmsg = null; S.sec.tags = true; render(); highlight({ code: 'tag', sheet: eh.sheet, handles: eh.r.elevHandles, pos: null });
        ev.stopPropagation(); ev.preventDefault(); return;
      }
      var hit = hits.filter(function (x) { var c = st.canvas[x.object.userData.dxfSheet]; return c.role === 'plan' || c.role === 'roof'; })[0];
      if (ewhy && (!hit || hits.indexOf(hit) > 0 && st.canvas[hits[0].object.userData.dxfSheet].role === 'elev')) {
        S.pick = null; S.tmsg = 'No tag: ' + ewhy; console.log(TAG + ' tag: ' + S.tmsg); S.sec.tags = true; render(); ev.stopPropagation(); ev.preventDefault(); return; }
      if (!hit) { console.log(TAG + ' tag: no entity under the pointer'); return; }
      S.tmsg = null;
      var hnd = hit.object.userData.segHandles[Math.floor(hit.index / 2)], sn = hit.object.userData.dxfSheet;
      var sh = S.sheets.filter(function (s) { return s.name === sn; })[0], e = sh.dxf.entities.filter(function (q) { return q.handle === hnd; })[0];
      var bb = entBox(e);
      S.pick = { sheet: sn, handle: hnd, layer: e.layer, x: Number(((bb[0] + bb[2]) / 2).toFixed(3)), y: Number(((bb[1] + bb[3]) / 2).toFixed(3)), cls: guessCls(sh, e.layer) };
      console.log(TAG + ' tag picked sheet=' + sn + ' handle=' + hnd + ' layer=' + e.layer + ' centre=' + S.pick.x + ',' + S.pick.y);
      S.sec.tags = true; render(); highlight({ code: 'tag', sheet: sn, handles: [hnd], pos: null });
      ev.stopPropagation(); ev.preventDefault();
    } else if (S.tool === 'door') {
      var rd = rayFrom(ev); rd.params.Line = { threshold: 0.12 };
      var po = st.group ? st.group.children.filter(function (o) { var c = st.canvas[o.userData.dxfSheet]; return c && c.role === 'plan'; }) : [];
      // the plans whose lines pass under the pointer, nearest first; the first one with a door under the pointer (plans stack: an upper
      // plan's line can lie between the camera and the door the user aims at on a lower plan)
      var hs = rd.intersectObjects(po, false), seen = {}, cand = [];
      hs.forEach(function (x) { var n = x.object.userData.dxfSheet; if (!seen[n]) { seen[n] = 1; cand.push(n); } });
      if (!cand.length) { S.dmsg = 'No plan line under the pointer: click a door\'s arc or leaf.'; console.log(TAG + ' door pick: no plan line under the pointer'); render(); return; }
      var chosen = cand[0], at = null;
      for (var ci = 0; ci < cand.length; ci++) { var pc = planeHit(rd, st.canvas[cand[ci]].z); if (!pc) continue; var shc = S.sheets.filter(function (q) { return q.name === cand[ci]; })[0], Dc = shc && doorsOf(shc);
        if (Dc && Dc.doors.some(function (d) { return inDoor(d, pc.x, pc.y, Dc.snap_tol); })) { chosen = cand[ci]; at = pc; break; } }
      if (!at) at = planeHit(rd, st.canvas[chosen].z) || hs[0].point;
      pickDoor(chosen, at.x, at.y);
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
    S.tool = S.tool === t ? null : t; S.pick = null; S.dpick = null; S.dmsg = null;
    var el = window.A && window.A.renderer && window.A.renderer.domElement;
    if (el && !el._dmBound) { el.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); el._dmBound = true; }
    if (el) el.style.cursor = S.tool ? 'crosshair' : '';
    console.log(TAG + ' tool=' + (S.tool || 'none')); render();
  }


  // ---- §L4.3 Doors: the door schedule (@SCHEDULE=<mark>,door,<w>,<h>) and door tags (@TAG=door,<mark>) ----
  // The reader reads the schedule per plan (Dxf2Types.scheduleFromDesc) and binds a tag to the door whose swing box or drawn opening box
  // holds it (lane §L2.7 rule 3, Dxf2Types hits). The door geometry is the reader's own (Dxf2BimImport.planDoors = Dxf2Bim.run).
  function plans() { return S.sheets.filter(function (sh) { return viewOf(sh) === 'PLAN'; }); }
  function planUnits() {
    var P = plans(), u = {}; P.forEach(function (sh) { var m = get1(sh, 'UNITS'); u[m ? m.value : ''] = 1; });
    var k = Object.keys(u);
    if (!P.length) return { why: 'no plan sheet yet (choose a PLAN role first)' };
    if (k.length !== 1 || !k[0] || !MK.UNITS[k[0]]) return { why: k.indexOf('') >= 0 ? 'a plan has no @UNITS yet' : 'the plans state different units (' + k.join(', ') + '); no conversion is guessed' };
    return { units: k[0] };
  }
  function doorsOf(sh) {   // the plan's doors (metres), cached on the markings that shape the plan run (not its tags / schedule / wall tops)
    if (viewOf(sh) !== 'PLAN' || !get1(sh, 'UNITS')) return null;
    var base = { name: sh.name, text: sh.text, dxf: sh.dxf, fileSig: sh.fileSig, stripped: sh.stripped, marks: sh.marks.filter(function (m) { return ['TAG', 'SCHEDULE', 'WALLTOP'].indexOf(m.key) < 0; }) };
    var key = sh.name + '|' + curSet() + '|' + sigOf(base);
    if (!S.dcache[key]) { try { S.dcache[key] = I.planDoors(effSheet(base), curSet()) || { doors: [], factor: 1, snap_tol: 0 }; } catch (e) { console.warn(TAG + ' doors: plan run failed ' + sh.name + ' ' + e.message); S.dcache[key] = { doors: [], factor: 1, snap_tol: 0, err: e.message }; } }
    return S.dcache[key];
  }
  function inDoor(d, x, y, tol) {   // metres; mirrors Dxf2Types hits (door): swing box (hinge + both arc ends) or the drawn opening box
    var H = d.hinge, pts = [H].concat([d.swing_start_deg, d.swing_end_deg].map(function (a) { return [H[0] + d.width * Math.cos(a * Math.PI / 180), H[1] + d.width * Math.sin(a * Math.PI / 180)]; }));
    var sx = pts.map(function (q) { return q[0]; }), sy = pts.map(function (q) { return q[1]; });
    if (x >= Math.min.apply(null, sx) - tol && x <= Math.max.apply(null, sx) + tol && y >= Math.min.apply(null, sy) - tol && y <= Math.max.apply(null, sy) + tol) return true;
    var b = d.opening_box; if (!b) return false;
    var u = b.axis === 'x' ? x : y, v = b.axis === 'x' ? y : x, L = b.along || b.s;
    return u >= L[0] - tol && u <= L[1] + tol && v >= b.band[0] - tol && v <= b.band[1] + tol;
  }
  function doorCentre(d) {   // the drawn opening-box centre, else the swing-box centre (metres)
    var b = d.opening_box;
    if (b) { var L = b.along || b.s, a = (L[0] + L[1]) / 2, c = (b.band[0] + b.band[1]) / 2; return b.axis === 'x' ? [a, c] : [c, a]; }
    var H = d.hinge, pts = [H].concat([d.swing_start_deg, d.swing_end_deg].map(function (a) { return [H[0] + d.width * Math.cos(a * Math.PI / 180), H[1] + d.width * Math.sin(a * Math.PI / 180)]; }));
    var sx = pts.map(function (q) { return q[0]; }), sy = pts.map(function (q) { return q[1]; });
    return [(Math.min.apply(null, sx) + Math.max.apply(null, sx)) / 2, (Math.min.apply(null, sy) + Math.max.apply(null, sy)) / 2];
  }
  function tagText(m) { var p = m.value.split(','); return p[0] === 'door' && !/^z=/.test(p[1] || '') ? p.slice(1).join(',') : null; }
  function doorTags(sh, D, d) { return sh.marks.filter(function (m) { return m.key === 'TAG' && tagText(m) !== null && inDoor(d, m.x * D.factor, m.y * D.factor, D.snap_tol); }); }
  function schedRows() {   // the table: the user's rows, the plans' file rows, and marks tags name with no size (red)
    var rows = [], by = {}, U = planUnits();
    S.sched.forEach(function (r) { by[r.mark] = { mark: r.mark, w: r.w, h: r.h, src: 'user', n: 0, conflict: false }; rows.push(by[r.mark]); });
    plans().forEach(function (sh) { sh.marks.forEach(function (m) {
      if (m.key !== 'SCHEDULE' || m.source === 'user') return; var p = m.value.split(','); if (p[1] !== 'door' || p.length !== 4) return;
      var r = by[p[0]];
      if (!r) { r = by[p[0]] = { mark: p[0], w: p[2], h: p[3], src: m.by === 'model' ? 'model' : m.by === 'user' ? 'user' : 'file', fileBy: m.by, n: 0, conflict: false, file: true }; rows.push(r); }
      else if (r.file && (String(r.w) !== p[2] || String(r.h) !== p[3])) r.conflict = true;
    }); });
    plans().forEach(function (sh) { sh.marks.forEach(function (m) { var t = m.key === 'TAG' ? tagText(m) : null; if (t === null) return;
      if (!by[t]) { by[t] = { mark: t, w: '', h: '', src: null, n: 0, missing: true }; rows.push(by[t]); } by[t].n++; }); });
    rows.forEach(function (r) { r.units = U.units || ''; });
    return rows.sort(function (a, b) { return a.mark < b.mark ? -1 : a.mark > b.mark ? 1 : 0; });
  }
  function syncSchedule() {   // a user row is written on every plan whose @TAG names it; a row no tag names yet on every plan (nothing typed is lost)
    var P = plans(); if (!P.length) return;
    P.forEach(function (sh) { sh.marks = sh.marks.filter(function (m) { return !(m.key === 'SCHEDULE' && m.source === 'user' && m.door); }); });
    S.sched.forEach(function (r) {
      var on = P.filter(function (sh) { return sh.marks.some(function (m) { return m.key === 'TAG' && tagText(m) === r.mark; }); });
      (on.length ? on : P).forEach(function (sh) { sh.marks.push({ key: 'SCHEDULE', value: r.mark + ',door,' + r.w + ',' + r.h, x: 0, y: 0, source: 'user', door: true }); });
    });
  }
  function markOk(t) { return t !== '' && t.indexOf(',') < 0 && !/^z=/.test(t); }
  function setRow(mark, w, h, rule) {
    mark = String(mark).trim(); w = String(w).trim(); h = String(h).trim();
    if (!markOk(mark)) { S.dmsg = 'A mark needs text, no comma.'; console.log(TAG + ' schedule refused: mark "' + mark + '"'); render(); return false; }
    if (!(Number(w) > 0) || !(Number(h) > 0)) { S.dmsg = 'Width and height are positive numbers in the plans\' units.'; console.log(TAG + ' schedule refused: ' + mark + ' w=' + w + ' h=' + h); render(); return false; }
    S.dmsg = null;
    S.sheets.forEach(function (sh) { sh.marks = sh.marks.filter(function (m) { return !(m.key === 'SCHEDULE' && m.source !== 'user' && m.value.split(',')[0] === mark && m.value.split(',')[1] === 'door'); }); });   // a file row edited becomes the user's
    var r = S.sched.filter(function (q) { return q.mark === mark; })[0]; if (r) { r.w = w; r.h = h; } else S.sched.push({ mark: mark, w: w, h: h });
    console.log(TAG + ' schedule row ' + mark + ' door ' + w + ' x ' + h + (rule ? ' (confirmed proposal ' + rule + ')' : ''));
    changed(); return true;
  }
  function removeRow(mark) {
    S.sched = S.sched.filter(function (q) { return q.mark !== mark; });
    S.sheets.forEach(function (sh) { sh.marks = sh.marks.filter(function (m) { return !(m.key === 'SCHEDULE' && m.value.split(',')[0] === mark && m.value.split(',')[1] === 'door'); }); });
    console.log(TAG + ' schedule row ' + mark + ' removed'); changed();
  }
  function writeTag(sheetName, handle, mark, rule) {
    var sh = S.sheets.filter(function (q) { return q.name === sheetName; })[0], D = sh && doorsOf(sh), d = D && D.doors.filter(function (q) { return q.handle === handle; })[0];
    mark = String(mark || '').trim();
    if (!d) { S.dmsg = 'That door is no longer on the plan.'; render(); return false; }
    if (!markOk(mark)) { S.dmsg = 'A mark needs text, no comma.'; render(); return false; }
    var c = doorCentre(d), n = D.doors.filter(function (q) { return inDoor(q, c[0], c[1], D.snap_tol); });
    if (n.length !== 1) { S.dmsg = 'Not tagged: the door centre lies in ' + n.length + ' doors\' boxes (the reader would call the tag ambiguous).'; console.log(TAG + ' tag refused door ' + handle + ' centre in ' + n.length + ' boxes'); render(); return false; }
    var old = doorTags(sh, D, d); sh.marks = sh.marks.filter(function (m) { return old.indexOf(m) < 0; });
    var x = Number((c[0] / D.factor).toFixed(3)), y = Number((c[1] / D.factor).toFixed(3));
    S.dmsg = null; S.dpick = null;
    console.log(TAG + ' door tag sheet=' + sheetName + ' door=' + handle + ' mark=' + mark + ' at ' + x + ',' + y + (old.length ? ' (replaces ' + old.map(markText).join(' | ') + ')' : '') + (rule ? ' (confirmed proposal ' + rule + ')' : ''));
    addMulti(sh, 'TAG', 'door,' + mark, x, y, rule);
    return true;
  }
  function pickDoor(sn, xm, ym) {   // a canvas click resolved by the reader's door rule
    var sh = S.sheets.filter(function (q) { return q.name === sn; })[0], D = sh && doorsOf(sh);
    if (!D) { S.dmsg = 'Not a plan with units: no doors to tag here.'; render(); return; }
    var hit = D.doors.filter(function (d) { return inDoor(d, xm, ym, D.snap_tol); });
    console.log(TAG + ' door pick sheet=' + sn + ' at ' + xm.toFixed(3) + ',' + ym.toFixed(3) + ' doors=' + hit.map(function (d) { return d.handle; }).join(','));
    if (hit.length !== 1) { S.dpick = null; S.dmsg = hit.length ? hit.length + ' doors here (' + hit.map(function (d) { return d.handle; }).join(', ') + '): click closer to one.' : 'No door here: click a door\'s arc or leaf.'; render(); return; }
    var d = hit[0], cur = doorTags(sh, D, d)[0];
    S.dmsg = null; S.dpick = { sheet: sn, handle: d.handle, width: Number((d.width / D.factor).toFixed(3)), mark: cur ? tagText(cur) : null };
    S.sec.doors = true; render(); highlight({ code: 'door', sheet: sn, handles: [d.handle], pos: null });
  }
  var MARK_HDR = /\bMARK\b/i, SIZE_HDR = /\b(SIZE|WIDTH)\b/i;
  var ROW_RE = /^\s*([A-Za-z0-9][A-Za-z0-9._\/-]*)\s*(?:\^I|\t|\s)\s*(\d+(?:\.\d+)?)\s*("|mm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*("|mm)?\s*(.*)$/;
  function cleanText(t) { return String(t || '').replace(/\{\\[^;]*;/g, '').replace(/[{}]/g, '').replace(/\\[A-Za-z]\d*;?/g, function (m) { return m === '\\P' ? m : ''; }); }
  function doorProposals() {   // §L4.3 PR-SCHEDULE / PR-TAG: evidence only (the drawing's own text), never a marking until ticked
    var out = [], refused = [], have = {}; schedRows().forEach(function (r) { if (!r.missing) have[r.mark] = r; });
    plans().forEach(function (sh) {
      var u = get1(sh, 'UNITS'), T = sh.dxf.entities.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== LAYER; });
      var lines = []; T.forEach(function (e) { cleanText(e.text).split('\\P').forEach(function (l) { lines.push({ t: l, h: e.handle }); }); });
      if (lines.some(function (l) { return MARK_HDR.test(l.t) && SIZE_HDR.test(l.t); })) {
        lines.forEach(function (l) {
          var m = ROW_RE.exec(l.t); if (!m || MARK_HDR.test(l.t)) return;
          var desc = m[6] || '', cls = /DOOR|PANEL|GLAZED/i.test(desc) ? 'door' : /WINDOW|DOUBLE HUNG|CASEMENT|FIXED/i.test(desc) ? 'window' : null, sym = m[3] || m[5] || '';
          if (!cls) { refused.push({ rule: 'PR-SCHEDULE', why: 'row "' + l.t.trim().slice(0, 40) + '" (text ' + l.h + ') names neither a door nor a window' }); return; }
          if (cls === 'window') { refused.push({ rule: 'PR-SCHEDULE', why: 'row ' + m[1] + ' (text ' + l.h + '): window, not a door row' }); return; }
          if (!u) { refused.push({ rule: 'PR-SCHEDULE', why: 'row ' + m[1] + ': the plan has no @UNITS yet' }); return; }
          if (sym && ({ '"': 'in', mm: 'mm' })[sym] !== u.value) { refused.push({ rule: 'PR-SCHEDULE', why: 'row ' + m[1] + ': size written in ' + sym + ', the plan states ' + u.value }); return; }
          if (have[m[1]] && String(have[m[1]].w) === m[2] && String(have[m[1]].h) === m[4]) return;
          if (out.some(function (p) { return p.rule === 'PR-SCHEDULE' && p.mark === m[1]; })) return;
          out.push({ rule: 'PR-SCHEDULE', mark: m[1], w: m[2], h: m[4], sheet: sh.name, why: 'schedule text ' + l.h + ' on ' + sh.name.replace(/\.dxf$/i, '') });
        });
      }
      var D = doorsOf(sh); if (!D || !D.doors.length) return;
      sh.dxf.entities.filter(function (e) { return e.type === 'TEXT' && e.layer !== LAYER && have[String(e.text || '').trim()]; }).forEach(function (e) {
        var mk = String(e.text).trim(), p = txtPos(e), x = p[0] * D.factor, y = p[1] * D.factor, hit = D.doors.filter(function (d) { return inDoor(d, x, y, D.snap_tol); });
        if (hit.length !== 1) { refused.push({ rule: 'PR-TAG', why: 'text "' + mk + '" (' + e.handle + ') lies in ' + hit.length + ' door boxes' }); return; }
        var cur = doorTags(sh, D, hit[0]); if (cur.some(function (m) { return tagText(m) === mk; })) return;
        out.push({ rule: 'PR-TAG', mark: mk, sheet: sh.name, handle: hit[0].handle, why: 'text ' + e.handle + ' "' + mk + '" in door ' + hit[0].handle + '\'s box' });
      });
    });
    return { list: out, refused: refused };
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
      '.dm-src{font-size:9px;color:#5b6473;white-space:nowrap;width:52px;text-align:right;flex:0 0 auto}.dm-src.user{color:#8ec5ff}.dm-src.model{color:#c9b0ff}.dm-src.default{background:#f5d90a;color:#1a1a1a;border-radius:3px;padding:0 4px;width:auto}',
      '.dm-sub{font-size:9px;letter-spacing:.1em;color:#5b6473;text-transform:uppercase;margin:9px 0 3px;display:flex;align-items:center;gap:6px}.dm-sub.need{color:#f2a3a3}.dm-hs{display:block;color:#e8ecf3;font-size:11px;margin-top:1px}.dm-ask{font-size:11px;line-height:1.45;color:#f2a3a3;margin:2px 0 5px}',
      '.dm-mk{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:6px;font-family:ui-monospace,monospace;font-size:10.5px}.dm-mk:hover{background:#20232b}.dm-mk .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dm-ib{background:transparent;border:0;color:#7f8aa0;cursor:pointer;padding:2px;display:inline-flex;border-radius:5px}.dm-ib:hover{color:#c7cdd8;background:#2a2e38}.dm-ib .dm-ico{width:13px;height:13px}',
      '.dm-pr{display:flex;align-items:center;gap:6px;padding:3px 4px;border:1px dashed #3a4150;border-radius:6px;margin:3px 0;font-size:10.5px}.dm-pr .t{flex:1;min-width:0}.dm-pr .t b{font-family:ui-monospace,monospace;font-weight:500;color:#d7dce5}.dm-pr .w{display:block;color:#5b6473;font-size:9.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dm-pr{background:rgba(245,217,10,.16);border:1px solid #b89f06}.dm-defrow{background:rgba(245,217,10,.16);border-radius:6px}.dm-pr .dm-ib{border:1px solid #2f6b45;color:#9be0b4}@keyframes dxfshiver{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px) rotate(-3deg)}40%{transform:translateX(2px) rotate(3deg)}60%{transform:translateX(-2px) rotate(-2deg)}80%{transform:translateX(2px) rotate(2deg)}}#dxf-meta.dxf-shiver{animation:dxfshiver .6s ease-in-out 3,dxfshiver .6s ease-in-out 8s 3;box-shadow:0 0 0 2px #f5d90a}@media (prefers-reduced-motion:reduce){#dxf-meta.dxf-shiver{animation:none}}.dm-ref{font-size:9.5px;color:#5b6473;margin:2px 4px}',
      '.dm-btn{display:inline-flex;align-items:center;gap:6px;background:#13151a;border:1px solid #2c303a;border-radius:8px;color:#c7cdd8;padding:5px 9px;cursor:pointer;font:inherit;font-size:11px}',
      '.dm-btn:hover{background:#1b1f27}.dm-btn.on{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dm-btn.primary{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dm-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.dm-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0}',
      '.dm-lay{display:flex;align-items:center;gap:6px;padding:3px 4px}.dm-lay-sub{padding-left:22px;background:rgba(255,255,255,.03)}.dm-lay .nm{flex:1;font-family:ui-monospace,monospace;font-size:10.5px;overflow:hidden;text-overflow:ellipsis}.dm-lay .n{color:#5b6473;font-size:9.5px;width:28px;text-align:right}',
      '.dm-tt{font-size:9.5px;border:1px solid #2c303a;border-radius:6px;padding:1px 6px;color:#9aa3b2}',
      '.dm-shape{display:grid;grid-template-columns:1fr 46px 46px;gap:2px 6px;font-size:11px;margin:2px 0 6px}.dm-shape .h{font-size:9px;color:#5b6473;letter-spacing:.08em;text-transform:uppercase}.dm-shape .b{color:#f2a3a3;text-align:right;font-family:ui-monospace,monospace}.dm-shape .a{color:#f0c674;text-align:right;font-family:ui-monospace,monospace}.dm-shape .z{color:#5b6473}',
      '.dm-tabs{display:flex;gap:5px;margin:4px 0}',
      '.dm-sched{display:grid;grid-template-columns:minmax(0,1fr) 58px 58px 30px 44px 22px;gap:3px 5px;align-items:center;font-size:10.5px;margin:2px 0 6px}.dm-sched .h{font-size:9px;color:#5b6473;letter-spacing:.08em;text-transform:uppercase}.dm-sched .mk{font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dm-sched .mk.bad{color:#f2a3a3}.dm-sched .n{color:#9aa3b2;text-align:right;font-family:ui-monospace,monospace}.dm-sched .dm-in.n{width:auto}.dm-sched .dm-src{width:auto}',
      '.dm-it{display:flex;gap:7px;align-items:flex-start;padding:4px 5px;border-radius:6px;cursor:pointer;font-size:10.5px;line-height:1.35}.dm-it:hover{background:#20232b}.dm-it.nopos{cursor:default}',
      '.dm-it .c{font-family:ui-monospace,monospace;color:#f2a3a3;flex:0 0 auto;width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dm-it.adv .c{color:#f0c674}.dm-it .m{color:#9aa3b2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '#dm-panel .ip-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #23262e}#dm-note{width:100%;font-size:10.5px;color:#7f8aa0;line-height:1.4}',
      '@keyframes dmspin{to{transform:rotate(360deg)}}.dm-spin{animation:dmspin 1s linear infinite}',
      '.dm-pr.inf{background:rgba(255,122,26,.16);border-color:#c2560a}.dm-tier{font-size:9px;font-family:ui-monospace,monospace;border:1px solid #8a7d2a;color:#e0c64a;border-radius:4px;padding:0 4px;flex:0 0 auto}.dm-tier.inferred{border-color:#c2560a;color:#ff9a4d}' +
      '.dm-pr[data-ev]{cursor:pointer}.dm-pr[data-ev]:hover{filter:brightness(1.18)}.dm-pr.dm-evon{outline:2px solid #f5d90a;outline-offset:1px}.dm-pr.inf.dm-evon{outline-color:#ff7a1a}.dm-pr .dm-tyo{border-color:#3a6ea5;color:#cfe3f6}.dm-evnote{font-size:9.5px;color:#ff9a4d;margin:0 4px 5px;line-height:1.35}.dm-btn.inf{background:#2a1a10;border-color:#c2560a;color:#ffc59a}',
      '.dm-focus{outline:2px solid #f5d90a!important;outline-offset:1px;border-radius:6px}@keyframes dmpv{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.dm-pv.dm-new{animation:dmpv .35s ease-out}.dm-pv .dm-later{font-size:9px;color:#8a7d2a;white-space:nowrap}'
    ].join('');
    document.head.appendChild(st);
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function srcLabel(m) { var by = m.source === 'user' ? 'user' : m.by; if (m.source === 'default' || by === 'default') return '<span class="dm-src default" data-src="default" title="the drawing does not state this; a default was used. Change it to confirm.">default</span>'; return by === 'user' ? '<span class="dm-src user" data-src="user">you</span>' : by === 'model' ? '<span class="dm-src model" data-src="model">from model</span>' : '<span class="dm-src" data-src="file">from file</span>'; }
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
    var isZ = needKey === 'Z', nd = need && isZ ? ' need' : '';
    if (need && isZ) {   // §D40 the question, from what the sheet already states
      var z0 = sh.marks.filter(function (m) { return m.key === 'Z'; })[0];
      h += '<div class="dm-ask" data-ask="Z">' + (z0 ? 'One height is known: ' + esc(z0.value) + ' m at y ' + num(z0.y) + '. Give a second:' : 'No height is known yet. Give two:') + ' read a level text or a dimension on this sheet, type it in metres, and the y where it is drawn.</div>';
    }
    h += '<div class="dm-row">' + kSel + '<input class="dm-in lab' + nd + '" id="dm-av-' + si + '-' + needKey + '" placeholder="' + (isZ ? 'height, m' : 'label') + '" data-add-val="' + si + '-' + needKey + '" spellcheck="false">' +
      '<input class="dm-in n' + nd + '" id="dm-ap-' + si + '-' + needKey + '" placeholder="' + (isZ ? 'y where drawn' : keys.length > 1 ? 'x or y' : 'x') + '" data-add-pos="' + si + '-' + needKey + '" inputmode="decimal">' +
      '<button class="dm-btn" data-act="add" data-sheet="' + si + '" data-group="' + needKey + '" data-keys="' + keys.join(',') + '">' + IC.plus + '<span>Add</span></button></div>';
    return h;
  }
  function proposalBlock(sh, si, keysOnly) {
    var P = sh.prop || { list: [], refused: [] }, list = P.list.filter(function (p) { return !keysOnly || keysOnly.indexOf(p.key) >= 0; }), h = '';
    if (!list.length) return '';
    h += '<div class="dm-sub">' + IC.bulb + 'Suggestions (not markings until ticked)</div>';
    list.forEach(function (p) {
      var pi = P.list.indexOf(p), ps = SINGLE_POS[p.key];
      h += prOpen(si, p).replace('<div class="dm-pr', '<div data-prop="' + esc(p.rule + ':' + p.key + '=' + p.value) + '" class="dm-pr') + '<span class="t"><b>@' + p.key + '=' + esc(p.value) + (ps === 'x' ? ' x ' + num(p.x) : ps === 'y' ? ' y ' + num(p.y) : '') + '</b><span class="dm-hs">' + esc(humanMark(p.key, p.value, p.x, p.y)) + '</span><span class="w">' + esc(p.rule + ': ' + p.why) + '</span></span>' + prTail(si, p) +
        '<button class="dm-ib" title="Confirm this suggestion" data-act="confirm" data-sheet="' + si + '" data-pi="' + pi + '">' + IC.check + '</button></div>' + prNote(si, p);
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
        if (v === 'SECTION') h += field(sh, si, 'HAXIS', 'H axis', mi.miss, 'select', ['+X', '-X', '+Y', '-Y']) + field(sh, si, 'CUT', 'Cut', mi.miss) + field(sh, si, 'ROOF', 'Roof top (m)', mi.miss, 'num');   // §L4.3: the section states @ROOF (§L2.6 E)
        if (v === 'ELEV' || v === 'SECTION') { h += multiBlock(sh, si, ['GRIDH'], 'Grid lines', mi.miss, 'GRIDH') + multiBlock(sh, si, ['Z'], 'Level datums (@Z)', mi.miss, 'Z'); }
        mi.errors.forEach(function (e) { h += '<div class="dm-ref" style="color:#f2a3a3">' + esc(e.code + ' ' + e.message) + '</div>'; });
        h += S.pv ? previewBlock(si) : proposalBlock(sh, si, ['VIEW', 'NAME', 'SET', 'LEVEL', 'FACE', 'HAXIS', 'GRIDX', 'GRIDY', 'GRIDH', 'Z']);   // §D34: while the Arrange view stands, the card lists every yellow value placing it (all rounds)
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
      h += '<div class="dm-f' + (p && !m ? ' dm-defrow' : '') + '"><label class="' + (m ? '' : 'need') + '" title="' + esc(sh.name) + '" style="width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sh.name.replace(/\.dxf$/i, '')) + '</label>' +
        '<select class="dm-sel' + (m ? '' : ' need') + '" id="dm-f-' + si + '-UNITS" data-act="single" data-sheet="' + si + '" data-key="UNITS">' + ['', 'mm', 'cm', 'm', 'in', 'ft'].map(function (u) { return opt(u, m ? m.value : ''); }).join('') + '</select>' +
        '<span class="dm-ref" style="margin:0;flex:1;white-space:nowrap" title="$INSUNITS=' + esc(iu) + '">file says ' + esc(fs || 'nothing') + '</span>' +
        (p && !m ? '<button class="dm-ib" style="border:1px solid #2f6b45;color:#9be0b4" title="Confirm: use the file\'s ' + esc(p.value) + '" data-act="confirm" data-sheet="' + si + '" data-pi="' + pi + '">' + IC.check + '</button>' : '') + (m ? srcLabel(m) : '') + '</div>';
    });
    h = '<div class="dm-ref" style="margin:2px 0 6px">Units are never taken from the header by themselves: pick one, or tick the file\'s value.</div>' + h;
    return secHead('units', IC.ruler, 'Units', nBad ? nBad + ' unconfirmed' : 'confirmed', nBad) + (S.sec.units ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function renderLayers() {
    var byRole = {}, nBad = 0, h = '', onSheets = {};
    S.sheets.forEach(function (sh) { var role = ROLE_VIEW[viewOf(sh)] || 'none'; var seenHere = {}; sh.dxf.entities.concat(Object.keys(sh.hatchLayers || {}).map(function (l) { return { layer: l, hatchOnly: sh.hatchLayers[l] }; })).forEach(function (e) { if (e.layer === LAYER) return; var R = byRole[role] = byRole[role] || {}; R[e.layer] = (R[e.layer] || 0) + (e.hatchOnly || 1); if (!seenHere[e.layer]) { seenHere[e.layer] = 1; (onSheets[role + '|' + e.layer] = onSheets[role + '|' + e.layer] || []).push(sh); } }); });
    ['plan', 'elev', 'roof', 'section', 'none'].forEach(function (role) {
      if (!byRole[role]) return;
      h += '<div class="dm-sub">' + (role === 'none' ? 'Sheets without a role (choose a role first)' : role.toUpperCase() + ' sheets') + '</div>';
      Object.keys(byRole[role]).sort().forEach(function (L) {
        var tt = role === 'none' ? null : templateType(role, L), st = role === 'none' ? null : statedLayer(role, L);
        h += '<div class="dm-lay" data-layer-row="' + esc(role + '|' + L) + '"><span class="nm" title="' + esc(L) + '">' + esc(L) + '</span><span class="n">' + byRole[role][L] + '</span>';
        if (role === 'none') h += '<span class="dm-tt">no role</span>';
        else if (tt && !st) h += '<span class="dm-tt" title="layer set ' + esc(curSet()) + ' (dxf2shell_config.js)">' + esc(tt) + ' · template</span>';
        else if (st && (tt || !uiOf(st.type))) h += '<span class="dm-tt" title="@LAYER marking: overrides the set">' + esc(st.type) + ' · stated</span>' + srcLabel(st.mark);
        else { if (!st) nBad++;
          var cur = st ? uiOf(st.type) : '', multi = (onSheets[role + '|' + L] || []).length > 1, kinds = multi ? (onSheets[role + '|' + L]).map(function (sh) { var m = sh.marks.filter(function (q) { var l = q.key === 'LAYER' && layerOf(q); return l && l.layer === L; })[0]; return m ? layerOf(m).type : ''; }) : [], mixed = multi && kinds.some(function (k) { return k !== kinds[0]; });
          if (mixed) cur = '__mixed';
          h += '<select class="dm-sel' + (st ? '' : ' need') + '" data-act="layer" data-role="' + role + '" data-layer="' + esc(L) + '">' + (mixed ? '<option value="__mixed" selected disabled>(per sheet)</option>' : '') + [''].concat(uiChoices(role)).map(function (t) { return opt(t, cur, t === 'gradebeam' ? 'grade beam' : undefined); }).join('') + '</select>' + (st ? srcLabel(st.mark) : ''); }
        var key = role + '|' + L, shs = onSheets[key] || [];
        if (role !== 'none' && shs.length > 1) h += '<button class="dm-ib" title="Type this layer sheet by sheet" data-act="laysplit" data-key="' + esc(key) + '">' + (S.split[key] ? IC.chevD : IC.chevR) + '</button>';
        h += '</div>';
        if (role !== 'none' && shs.length > 1 && S.split[key]) shs.forEach(function (sh) {   // §L9: one select per sheet (a layer name shared by several sheets, e.g. Dim, is a beam on ONE of them)
          var m1 = sh.marks.filter(function (q) { var l = q.key === 'LAYER' && layerOf(q); return l && l.layer === L; })[0], c1 = m1 ? uiOf(layerOf(m1).type) : '';
          h += '<div class="dm-lay dm-lay-sub" data-layer-row="' + esc(key + '|' + sh.name) + '"><span class="nm" title="' + esc(sh.name) + '">' + esc(sh.name.replace(/\.dxf$/i, '')) + '</span><span class="n">' + sh.dxf.entities.filter(function (e) { return e.layer === L; }).length + '</span>' +
            '<select class="dm-sel' + (m1 ? '' : ' need') + '" data-act="layer" data-role="' + role + '" data-layer="' + esc(L) + '" data-sheet="' + esc(sh.name) + '">' + [''].concat(uiChoices(role)).map(function (t) { return opt(t, c1, t === 'gradebeam' ? 'grade beam' : undefined); }).join('') + '</select></div>'; });
      });
    });
    var g = gateNow(), ev = g && g.roles ? (g.roles.evidence !== undefined ? g.roles.evidence : g.roles.set) : null;
    h = '<div class="dm-f"><label style="width:auto">Layer set</label><select class="dm-sel" data-act="tpl" style="flex:1">' + opt('', S.setOverride || '', 'From the drawings' + (ev ? ' (' + ev + ')' : ' (none fits)')) +
      Object.keys(I.SETS).map(function (k) { return opt(k, S.setOverride || '', k === 'DX' ? 'NCS/AIA, Duplex DX' : k === 'STD' ? 'NCS/AIA R12, standard set' : k); }).join('') + '</select></div>' +
      '<div class="dm-ref" style="margin:2px 0 6px">Set in use: ' + esc(curSet()) + (S.setOverride ? ' (you)' : ' (elevation-wall layers)') + ', maps from dxf2shell_config.js. Red = a layer the set does not read; your choice is saved as a @LAYER marking on each sheet of that role.</div>' + h;
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
        '<input class="dm-in" id="dm-tag-z" style="flex:0 0 72px" title="z (m, optional): the opening\'s height for stacked openings" placeholder="z (m)" value="' + (S.pick.z !== undefined ? esc(String(S.pick.z)) : '') + '">' +
        '<button class="dm-btn primary" data-act="tagadd"' + (V.length ? '' : ' disabled') + '>' + IC.check + '<span>Tag</span></button></div></div>';
    }
    if (S.tmsg) h += '<div class="dm-ref" id="dm-tag-msg" style="color:#ffb74d">' + esc(S.tmsg) + '</div>';
    return secHead('tags', IC.tag, 'Tags', L.n || '') + (S.sec.tags ? '<div class="dm-sb">' + h + L.h + '</div>' : '');
  }

  function renderDoors() {
    var v = S.verdict, isDoorItem = function (x) { return x.shape === 'openings' && (x.code === 'GAP:no_elevation_height' || x.code === 'GAP:no_host_cut') && x.sheet && x.handles; };
    var nB = v ? v.blocking.filter(isDoorItem).length : 0, rows = schedRows();
    var head = secHead('doors', IC.door, 'Doors', nB ? nB + ' blocking' : rows.length ? rows.length + ' marks' : '', nB);
    if (!S.sec.doors) return head;
    var U = planUnits(), h = '', DP = doorProposals();
    var blk = {}; if (v) v.blocking.filter(isDoorItem).forEach(function (x) { x.handles.forEach(function (hd) { blk[x.sheet + '|' + hd] = (blk[x.sheet + '|' + hd] || []).concat([x.code.replace(/^GAP:/, '')]); }); });
    h += '<div class="dm-sub">Door schedule' + (U.units ? ' · sizes in ' + esc(U.units) : '') + '</div>';
    if (!U.units) h += '<div class="dm-ref" style="color:#f2a3a3">' + esc(U.why) + '</div>';
    h += '<div class="dm-sched"><span class="h">mark</span><span class="h">width</span><span class="h">height</span><span class="h">doors</span><span class="h"></span><span class="h"></span>';
    rows.forEach(function (r) {
      var bad = r.missing || r.conflict, dis = U.units ? '' : ' disabled';
      h += '<span class="mk' + (bad ? ' bad' : '') + '" data-srow="' + esc(r.mark) + '" title="' + esc(r.missing ? 'a tag names this mark: enter its width and height' : r.conflict ? 'two sizes on the plans' : r.mark) + '">' + esc(r.mark) + '</span>' +
        '<input class="dm-in n' + (r.missing && !r.w ? ' need' : '') + '" data-act="dsz" data-mark="' + esc(r.mark) + '" data-dim="w" value="' + esc(r.w) + '" inputmode="decimal"' + dis + '>' +
        '<input class="dm-in n' + (r.missing && !r.h ? ' need' : '') + '" data-act="dsz" data-mark="' + esc(r.mark) + '" data-dim="h" value="' + esc(r.h) + '" inputmode="decimal"' + dis + '>' +
        '<span class="n">' + r.n + '</span>' + (r.src ? srcLabel({ source: r.src === 'user' ? 'user' : 'file', by: r.fileBy }) : '<span class="dm-src" style="color:#f2a3a3">no size</span>') +
        '<button class="dm-ib" title="Remove this row (its @SCHEDULE markings)" data-act="drm" data-mark="' + esc(r.mark) + '">' + IC.trash + '</button>';
    });
    h += '<input class="dm-in" id="dm-ds-mark" placeholder="mark" spellcheck="false"' + (U.units ? '' : ' disabled') + '><input class="dm-in n" id="dm-ds-w" placeholder="width" inputmode="decimal"' + (U.units ? '' : ' disabled') + '><input class="dm-in n" id="dm-ds-h" placeholder="height" inputmode="decimal"' + (U.units ? '' : ' disabled') + '>' +
      '<span></span><span></span><button class="dm-ib" title="Add the row" data-act="dsadd"' + (U.units ? '' : ' disabled') + '>' + IC.plus + '</button></div>';
    if (DP.list.length) {
      h += '<div class="dm-sub">' + IC.bulb + 'Suggestions from the drawing text (not markings until ticked)</div>';
      DP.list.forEach(function (p, i) { h += '<div class="dm-pr" data-dprop="' + esc(p.rule + ':' + p.mark + (p.handle ? '@' + p.handle : '')) + '"><span class="t"><b>' + esc(p.rule === 'PR-SCHEDULE' ? '@SCHEDULE=' + p.mark + ',door,' + p.w + ',' + p.h : '@TAG=door,' + p.mark + '  door ' + p.handle) + '</b><span class="w">' + esc(p.rule + ': ' + p.why) + '</span></span>' +
        '<button class="dm-ib" title="Confirm this suggestion" data-act="dconfirm" data-i="' + i + '">' + IC.check + '</button></div>'; });
    }
    DP.refused.slice(0, 8).forEach(function (r) { h += '<div class="dm-ref">' + esc(r.rule + ' not proposed: ' + r.why) + '</div>'; });
    S.dprops = DP.list;
    h += '<div class="dm-row"><button class="dm-btn' + (S.tool === 'door' ? ' on' : '') + '" data-act="tool" data-tool="door">' + IC.crosshair + '<span>' + (S.tool === 'door' ? 'Click a door on a plan' : 'Tag doors') + '</span></button></div>';
    if (S.dmsg) h += '<div class="dm-ref" style="color:#f0c674">' + esc(S.dmsg) + '</div>';
    if (S.dpick) {
      var marks = rows.filter(function (r) { return !r.missing; }).map(function (r) { return r.mark; });
      h += '<div class="dm-card" style="padding:6px 8px" id="dm-dpick"><div class="dm-ref" style="margin:0 0 4px">' + esc(S.dpick.sheet.replace(/\.dxf$/i, '') + ' · door ' + S.dpick.handle + ' · leaf ' + num(S.dpick.width) + (U.units ? ' ' + U.units : '') + (S.dpick.mark ? ' · tagged ' + S.dpick.mark : ' · no tag')) + '</div>' +
        '<div class="dm-row"><select class="dm-sel" id="dm-dt-sel" style="flex:1">' + [''].concat(marks).map(function (m) { return opt(m, S.dpick.mark || '', m === '' ? '— schedule mark —' : m); }).join('') + '</select>' +
        '<input class="dm-in" id="dm-dt-new" placeholder="or a new mark" style="width:96px;flex:0 0 auto" spellcheck="false">' +
        '<button class="dm-btn primary" data-act="dtag">' + IC.check + '<span>Tag</span></button></div></div>';
    }
    plans().forEach(function (sh) {
      var D = doorsOf(sh); if (!D) return;
      h += '<div class="dm-sub">' + esc(sh.name.replace(/\.dxf$/i, '')) + ' · ' + D.doors.length + ' door(s)</div>';
      D.doors.forEach(function (d) {
        var t = doorTags(sh, D, d), b = blk[sh.name + '|' + d.handle];
        h += '<div class="dm-it' + (b ? '' : ' adv') + '" data-act="dzoom" data-sheet="' + esc(sh.name) + '" data-h="' + esc(d.handle) + '" data-door="' + esc(sh.name + '|' + d.handle) + '"><span class="c" style="width:96px">door ' + esc(d.handle) + ' · ' + num(Number((d.width / D.factor).toFixed(3))) + '</span><span class="m">' +
          esc(t.length ? t.map(tagText).join(', ') + (t.length > 1 ? ' (two tags)' : '') : 'no tag') + (b ? ' · blocking: ' + esc(b.join(', ')) : '') + '</span></div>';
      });
    });
    return head + '<div class="dm-sb">' + h + '</div>';
  }
  function renderExcludes() {
    var L = listMarks('EXCLUDE'), horiz = S.sheets.filter(function (sh) { var v = viewOf(sh); return v === 'PLAN' || v === 'ROOF'; });
    if (!S.exSheet && horiz.length) S.exSheet = horiz[0].name;
    var h = '<div class="dm-row"><select class="dm-sel" data-act="exsheet" style="flex:1">' + horiz.map(function (sh) { return opt(sh.name, S.exSheet, sh.name.replace(/\.dxf$/i, '')); }).join('') + '</select>' +
      '<button class="dm-btn' + (S.tool === 'exclude' ? ' on' : '') + '" data-act="tool" data-tool="exclude"' + (horiz.length ? '' : ' disabled') + '>' + IC.exclude + '<span>' + (S.tool === 'exclude' ? 'Drag a box' : 'Exclude area') + '</span></button></div>';
    return secHead('excludes', IC.exclude, 'Exclude areas', L.n || '') + (S.sec.excludes ? '<div class="dm-sb">' + h + L.h + '</div>' : '');
  }
  // §L7.2 values the import APPLIED because the drawing does not state them (rows of state.defaults, from the pre-processor/importer): yellow while they are defaults; a change makes them the user's.
  function defRows() { var st = window.DxfImportUI && window.DxfImportUI.state; return (st && st.defaults) || []; }
  function refeed() { schedule(0); }   // §L7.8: a choice changes the cache key of effSheet, so the sheets are re-read with it and the gate re-runs
  function renderDefaults() {
    var rows = defRows(); if (!rows.length) return '';
    var nDef = rows.filter(function (r) { return r.kind === 'default'; }).length, h = '';
    rows.filter(function (r) { return r.kind === 'default' || r.kind === 'chosen'; }).forEach(function (r, i) {
      var isDef = r.kind === 'default', opts = (r.options || []).slice(); if (opts.indexOf(r.value) < 0) opts.unshift(r.value);
      h += '<div class="dm-f' + (isDef ? ' dm-defrow' : '') + '" data-default="' + esc(r.key) + '"><label title="' + esc(r.why || '') + '" style="width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.key) + '</label>' +
        '<select class="dm-sel" data-act="defchoose" data-key="' + esc(r.key) + '">' + opts.map(function (o) { return opt(o, r.value); }).join('') + '</select>' +
        (isDef ? '<span class="dm-src default" data-src="default" title="' + esc(r.why || 'not stated in the drawing') + '">default</span>' : '<span class="dm-src user" data-src="user">you</span>') + '</div>';
    });
    var pr = (window.DxfImportUI && window.DxfImportUI.state.prep) || {};
    Object.keys(pr).forEach(function (n) { h += '<div class="dm-ref" data-prep="' + esc(n) + '">' + esc(n.replace(/\.dxf$/i, '')) + ': line work: <b>' + pr[n].loops + '</b> wall rectangles synthesised (' + pr[n].segments + ' segments, snap ' + pr[n].tol + (pr[n].nonRect ? ', ' + pr[n].nonRect + ' non-rectangular skipped' : '') + (pr[n].mixed ? ', ' + pr[n].mixed + ' mixed-layer skipped' : '') + '); which layers are walls is the Layers section</div>'; });
    h = '<div class="dm-ref" style="margin:2px 0 6px">Applied because the drawing does not state them. Change one to make it yours.</div>' + h;
    return secHead('defaults', IC.warn, 'Defaults applied', nDef ? nDef + ' default' : 'all confirmed', nDef) + (S.sec.defaults ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  // §L7.2 ONE place that repeats every yellow item (suggestions per sheet, door suggestions, applied defaults); each row has its own tick, "Accept all" takes the lot.
  // Nothing here gates Convert: ignoring it (and the shiver) keeps the defaults and the DB can be saved for a trial.
  function renderYellows() {
    var items = [], DP = doorProposals(), n = { stated: 0, read: 0, inferred: 0 }, src = { sug: 0, door: 0, def: 0 }; S.dprops = DP.list;
    S.sheets.forEach(function (sh, si) { sh.prop = proposalsFor(sh); sh.prop.list.forEach(function (p, pi) { n[tierOf(p.rule) || 'inferred']++; src.sug++;
      items.push(prOpen(si, p) + '<span class="t"><b>@' + p.key + '=' + esc(p.value) + '</b><span class="w">' + esc(sh.name.replace(/\.dxf$/i, '') + ' · ' + p.rule + ': ' + p.why) + '</span></span>' + prTail(si, p) +
        '<button class="dm-ib" title="Confirm" data-act="confirm" data-sheet="' + si + '" data-pi="' + pi + '">' + IC.check + '</button></div>' + prNote(si, p)); }); });
    DP.list.forEach(function (p, i) { var t = tierOf(p.rule) || 'inferred', si = S.sheets.map(function (q) { return q.name; }).indexOf(p.sheet); n[t]++; src.door++;   // §L4.3 the door rules: the drawing's text
      var row = { rule: p.rule, key: p.rule === 'PR-SCHEDULE' ? 'SCHEDULE' : 'TAG', value: p.mark + (p.handle ? '@' + p.handle : ''), x: 0, y: 0, why: p.why };
      items.push((si >= 0 ? prOpen(si, row) : '<div class="dm-pr' + (t === 'inferred' ? ' inf' : '') + '" data-tier="' + t + '" data-rule="' + esc(p.rule) + '">') + '<span class="t"><b>' + esc(p.rule === 'PR-SCHEDULE' ? '@SCHEDULE=' + p.mark + ',door,' + p.w + ',' + p.h : '@TAG=' + p.mark) + '</b><span class="w">' + esc(p.rule) + '</span></span>' + (si >= 0 ? prTail(si, row) : tierMark(t)) +
      '<button class="dm-ib" title="Confirm" data-act="dconfirm" data-i="' + i + '">' + IC.check + '</button></div>' + (si >= 0 ? prNote(si, row) : '')); });
    defRows().filter(function (r) { return r.kind === 'default'; }).forEach(function (r) { var t = TIER['default']; n[t]++; src.def++;   // an applied default: a convention (no sheet entity to fly to)
      items.push('<div class="dm-pr' + (t === 'inferred' ? ' inf' : '') + '" data-tier="' + t + '" data-rule="default"><span class="t"><b>' + esc(r.key) + ' = ' + esc(r.value) + '</b><span class="w">applied default: ' + esc(r.why || 'not stated in the drawing') + '</span></span>' + tierMark(t) +
      '<button class="dm-ib" title="Keep this value" data-act="defkeep" data-key="' + esc(r.key) + '">' + IC.check + '</button></div>'); });
    var sig = n.stated + '/' + n.read + '/' + n.inferred + '/' + src.sug + '/' + src.door + '/' + src.def;   // §D36 the tier counts of the list, logged when they change
    if (sig !== S.tierSig && !S.tierHold) { S.tierSig = sig; S.tiers = { stated: n.stated, read: n.read, inferred: n.inferred, rows: items.length, sug: src.sug, door: src.door, def: src.def };
      console.log(TAGE + ' tiers stated=' + n.stated + ' read=' + n.read + ' inferred=' + n.inferred + ' rows=' + items.length + ' (the list: sheet suggestions ' + src.sug + ', door ' + src.door + ', applied defaults ' + src.def + ')'); }
    if (!items.length) return '';
    var both = n.stated + n.read > 0 && n.inferred > 0;   // §D36 split accept: one button per kind of evidence; the single Accept all only when one kind is present
    var btns = both ? '<div class="dm-row" style="margin-top:6px"><button class="dm-btn primary" data-act="acceptsr" title="Accept every row the file states or a text names (the inferred rows stay)">' + IC.check + '<span>Accept stated + read</span></button>' +
      '<button class="dm-btn inf" data-act="acceptinf" title="Accept every inferred row (geometry or a convention): check them first, a click on a row shows its evidence">' + IC.check + '<span>Accept inferred</span></button></div>'
      : '<button class="dm-btn primary" data-act="acceptall" style="margin-top:6px">' + IC.check + '<span>Accept all</span></button>';
    return secHead('yellows', IC.warn, 'All defaults', items.length + ' yellow', items.length) + (S.sec.yellows ? '<div class="dm-sb" id="dm-yellows"><div class="dm-ref" style="margin:2px 0 6px">Everything below is yellow elsewhere in this panel; orange rows are inferred (geometry or a convention). Click a row to see its evidence on the sheet. Accept them, tick one by one, or ignore: the defaults stay applied and Convert is not held up by them.</div>' + items.join('') + btns + '</div>' : '');
  }
  // §L7.14 "Body heights": kinds typed on a plan that no elevation shows get a z range STATED by the user (@BODYZ=<kind>,<z0>,<z1>, metres); it is the user's own statement, not a default
  function bodyzRows() { var out = []; S.sheets.forEach(function (sh, si) { sh.marks.forEach(function (m, mi) { if (m.key === 'BODYZ') { var p = String(m.value).split(','); out.push({ si: si, mi: mi, kind: p[0], z0: p[1], z1: p[2], mark: m }); } }); }); return out; }
  function renderBodyZ() {
    var g = gateNow(); if (!g || !g.structure) return '';
    var need = {}; ((g.R && g.R.gaps) || []).forEach(function (x) { if (x.code === 'GAP:body_no_elevation' && x.kind) need[x.kind] = (need[x.kind] || 0) + 1; });
    var rows = bodyzRows(); if (!Object.keys(need).length && !rows.length) return '';
    var h = '<div class="dm-ref" style="margin:2px 0 6px">No elevation shows these. State the z range (metres, from the drawing\'s detail) and they are built; until then they are left out.</div>';
    Object.keys(need).sort().forEach(function (k) {
      h += '<div class="dm-f" data-bodyz="' + esc(k) + '"><label style="width:118px">' + esc(k === 'gradebeam' ? 'grade beam' : k) + ' <span class="dm-ref" style="margin:0">' + need[k] + ' waiting</span></label>' +
        '<input class="dm-in n" id="dm-bz-' + esc(k) + '-0" placeholder="z0 m" inputmode="decimal"><input class="dm-in n" id="dm-bz-' + esc(k) + '-1" placeholder="z1 m" inputmode="decimal">' +
        '<button class="dm-btn" data-act="bodyzadd" data-kind="' + esc(k) + '">' + IC.plus + '<span>Add</span></button></div>';
    });
    rows.forEach(function (r) { h += '<div class="dm-f" data-bodyz-row="' + esc(r.kind) + '"><label style="width:auto;flex:1" title="@BODYZ marking">@BODYZ=' + esc(r.kind + ',' + r.z0 + ',' + r.z1) + '</label>' + srcLabel(r.mark) +
      '<button class="dm-ib" title="Remove" data-act="bodyzdel" data-sheet="' + r.si + '" data-mi="' + r.mi + '">' + IC.trash + '</button></div>'; });
    return secHead('bodyz', IC.ruler, 'Body heights', Object.keys(need).length ? Object.keys(need).reduce(function (n, k) { return n + need[k]; }, 0) + ' waiting' : 'stated', Object.keys(need).length) + (S.sec.bodyz ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  // §L10.9 "Stated sizes": where a stated number (legend label / dimension) replaced a drawn extent, or the user wants another number, the NUMBER is what is checked and corrected.
  // A row per conflicting body side shows drawn -> stated; typing a number and Set writes @SIZE=<body id>,<x|y|w|d>,<metres> (the user's own statement); removing it restores the label's number.
  function sizeRows() { var out = []; S.sheets.forEach(function (sh, si) { sh.marks.forEach(function (m, mi) { if (m.key === 'SIZE') { var p = String(m.value).split(','); out.push({ si: si, mi: mi, id: p[0], axis: p[1], value: p[2], mark: m }); } }); }); return out; }
  function renderSizes() {
    var g = gateNow(); if (!g || !g.structure) return '';
    var conf = (g.R && g.R.bodies && g.R.bodies.report && g.R.bodies.report.size_conflicts) || [], rows = sizeRows(); if (!conf.length && !rows.length) return '';
    var h = '<div class="dm-ref" style="margin:2px 0 6px">The drawing\'s stated number (label or dimension) differs from the drawn length. The number is used. Type another number (metres) to correct it; the body is recalculated.</div>';
    conf.forEach(function (c, i) {
      h += '<div class="dm-f" data-size-conf="' + esc(c.guid + '|' + c.axis) + '"><label style="width:auto;flex:1" title="drawn ' + c.drawn + ' m, stated ' + c.number + ' m (' + esc(c.source) + ')">' + esc(c.guid) + ' <b>' + esc(c.axis) + '</b> <span class="dm-ref" style="margin:0">' + c.drawn + ' &rarr; ' + c.number + ' m</span></label>' +
        '<input class="dm-in n" id="dm-sz-' + i + '" placeholder="m" inputmode="decimal" value="' + esc(c.number) + '"><button class="dm-btn" data-act="sizeadd" data-guid="' + esc(c.guid) + '" data-axis="' + esc(c.axis) + '" data-i="' + i + '">' + IC.check + '<span>Set</span></button></div>';
    });
    rows.forEach(function (r) { h += '<div class="dm-f" data-size-row="' + esc(r.id + '|' + r.axis) + '"><label style="width:auto;flex:1" title="@SIZE marking">@SIZE=' + esc(r.id + ',' + r.axis + ',' + r.value) + '</label>' + srcLabel(r.mark) +
      '<button class="dm-ib" title="Remove" data-act="sizedel" data-sheet="' + r.si + '" data-mi="' + r.mi + '">' + IC.trash + '</button></div>'; });
    return secHead('sizes', IC.ruler, 'Stated sizes', conf.length + ' differ', conf.length) + (S.sec.sizes ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  // §L18 "Element defaults": EVERY setting a 2D layout may not carry (a door's height, a window's sill, a stair's riser...), with the value in force and where it came from. A yellow tag says std (a named
  // source) or guess; typing a value and Set writes @DEFAULT=<key>,<value> into the drawing set (the user's own statement); removing it returns to the default. Unstated defaults are used to determine measurements.
  function defaultMarks() { var out = []; S.sheets.forEach(function (sh, si) { sh.marks.forEach(function (m, mi) { if (m.key === 'DEFAULT') { var i = String(m.value).indexOf(','); out.push({ si: si, mi: mi, key: String(m.value).slice(0, i), value: String(m.value).slice(i + 1) }); } }); }); return out; }
  function renderElementDefaults() {
    var g = gateNow(); if (!g || !g.structure || !g.R || !g.R.defaults_table) return '';
    var tb = g.R.defaults_table, stated = defaultMarks(), nStated = tb.filter(function (r) { return r.source === 'file'; }).length, nUsed = tb.filter(function (r) { return r.used; }).length, h = '', last = '';
    h += '<div class="dm-ref" style="margin:2px 0 6px">Settings the drawings may not carry. A value you state is kept in the drawing set; otherwise the default (a standard value or a guess, tagged) is used to determine the measurement. Highlighted = used in this model.</div>';
    tb.slice().sort(function (a, b) { return a.element < b.element ? -1 : a.element > b.element ? 1 : a.key < b.key ? -1 : 1; }).forEach(function (r, i) {
      if (r.element !== last) { last = r.element; h += '<div class="dm-sub">' + esc(r.element) + '</div>'; }
      h += '<div class="dm-f' + (r.used ? ' dm-defrow' : '') + '" data-edef="' + esc(r.key) + '"><label style="width:auto;flex:1" title="' + esc(r.basis) + '">' + esc(r.key) + ' <span class="dm-ref" style="margin:0">' + esc(r.kind === 'std' ? 'standard' : 'guess') + (r.unit && r.unit !== 'text' ? ' · ' + esc(r.unit) : '') + (r.source !== 'default' ? ' · ' + (r.source === 'file' ? 'stated' : r.source === 'type' ? 'type default' : 'chosen') : '') + '</span></label>' +
        (r.key === 'building.type' && r.options ? '<select class="dm-in" id="dm-ed-' + i + '">' + r.options.map(function (o) { return '<option' + (o === String(r.value) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' : '<input class="dm-in n" id="dm-ed-' + i + '" value="' + esc(r.value) + '" ' + (r.unit === 'text' ? '' : 'inputmode="decimal"') + '>') + '<button class="dm-btn" data-act="edefset" data-key="' + esc(r.key) + '" data-i="' + i + '">' + IC.check + '<span>Set</span></button>' +
        (r.source === 'file' ? '<button class="dm-ib" title="Remove (back to the default)" data-act="edefdel" data-key="' + esc(r.key) + '">' + IC.trash + '</button>' : '') + '</div>';
    });
    return secHead('edefaults', IC.ruler, 'Element defaults', nStated + ' stated · ' + nUsed + ' used', 0) + (S.sec.edefaults ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  // §L22 "Typology": advisories (never blocking) that set the model next to the cited ranges of the building type in force; nothing here changes a body or a default.
  function renderTypology() {
    var g = gateNow(); if (!g || !g.structure || !g.R || !g.R.defaults_table || !window.Dxf2Typology) return '';
    var tr = g.R.defaults_table.filter(function (r) { return r.key === 'building.type'; })[0], T = window.Dxf2Typology.advise(g.R.els || [], tr ? tr.value : null, window.DxfImportUI.state.defaultsRef);
    if (!T.rows.length) return '';
    var h = '<div class="dm-ref" style="margin:2px 0 6px">' + esc(T.type) + ': advisories from cited ranges (' + esc(T.rows[0].source) + '). They compare; they never change a body or a setting.</div>';
    T.rows.forEach(function (r) { h += '<div class="dm-f" data-typ="' + esc(r.code) + '"><label style="width:auto;flex:1" title="' + esc(r.source) + '">' + esc(r.message) + '</label></div>'; });
    return secHead('typology', IC.ruler, 'Typology', T.rows.length + ' advisories', 0) + (S.sec.typology ? '<div class="dm-sb">' + h + '</div>' : '');
  }
  function sheetHasKind(sh, kind) { return sh.marks.some(function (m) { var l = m.key === 'LAYER' && layerOf(m); return l && l.type === kind; }); }
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
  function pending() { var n = 0; S.sheets.forEach(function (sh) { n += proposalsFor(sh).list.length; }); n += doorProposals().list.length; n += defRows().filter(function (r) { return r.kind === 'default'; }).length; return n; }
  function attention() {   // §L7.2: a value the drawing does not state, only suggested, is a default until confirmed: the Metadata button shivers (yellow ring) while any stands
    var n = 0; try { n = pending(); } catch (e) { console.error(TAG + ' attention failed ' + (e && e.message)); }
    S.attn = n; var b = document.getElementById('dxf-meta'), closed = !S.panel || S.panel.style.display === 'none';
    if (b) { b.classList.toggle('dxf-shiver', n > 0 && closed); b.title = n ? 'Drawing metadata: ' + n + ' suggested value(s) not confirmed yet, click to review' : 'Drawing metadata'; }
    console.log(TAG + ' attention unconfirmed=' + n); return n;
  }
  function renderHead() { var c = document.getElementById('dm-chip'); if (c) c.outerHTML = chip(); }
  function render() {
    if (!S.panel || S.panel.style.display === 'none') return;
    var body = document.getElementById('dm-body'), top = body ? body.scrollTop : 0, ae = document.activeElement, fid = ae && ae.id;
    // keep what the user is typing: unsent "Add" rows and the focused field survive a re-render (a verdict landing mid-typing)
    if (S.panel) S.panel.querySelectorAll('[data-add-val],[data-add-pos],[data-add-key]').forEach(function (el) { var k = el.getAttribute('data-add-val') ? 'v' + el.getAttribute('data-add-val') : el.getAttribute('data-add-pos') ? 'p' + el.getAttribute('data-add-pos') : 'k' + el.getAttribute('data-add-key'); S.draft[k] = el.value; });
    ['dm-ds-mark', 'dm-ds-w', 'dm-ds-h'].forEach(function (id) { var el = document.getElementById(id); if (el) S.draft[id] = el.value; });
    var focusVal = ae && S.panel && S.panel.contains(ae) && ae.tagName === 'INPUT' ? { sel: ae.id ? '#' + ae.id : null, v: ae.value, s: ae.selectionStart } : null;
    S.sheets.forEach(function (sh) { sh.prop = proposalsFor(sh); }); S.evRows = {};   // §D36 the rows register themselves as they are drawn
    var h = '<div class="ip-head">' + IC.clipboard + '<span class="ip-title">Drawing metadata</span>' + chip() + '<button class="dm-x" id="dm-close" title="Close">' + IC.x + '</button></div>' +
      '<div id="dm-body">' + '<div class="dm-sec">' + renderYellows() + '</div>' + renderSheets() + '<div class="dm-sec">' + renderUnits() + '</div><div class="dm-sec">' + renderLayers() + '</div><div class="dm-sec">' + renderTags() + '</div><div class="dm-sec">' + renderDoors() + '</div><div class="dm-sec">' + renderBodyZ() + renderSizes() + renderElementDefaults() + renderTypology() + '</div><div class="dm-sec">' + renderDefaults() + '</div><div class="dm-sec">' + renderExcludes() + '</div><div class="dm-sec">' + renderWalltops() + '</div><div class="dm-sec">' + renderVerdict() + '</div></div>' +
      '<div class="ip-foot"><button class="dm-btn primary" id="dm-save">' + IC.save + '<span>Save marked copies</span></button><div id="dm-note">' +
      (S.saved ? 'Downloaded: ' + esc(S.saved.join(', ')) + '. The opened files are unchanged.' : 'Save writes the markings as DXF2BIM-MARK texts into downloaded copies (&lt;name&gt;_marked.dxf).') +
      (S.byOk ? '' : ' Source suffix @BY=user: not yet accepted by the synced grammar, so not written.') + '</div></div>';
    S.panel.innerHTML = h;
    if (S.tierHold) { /* an accept loop: logged once at its end */ } else if (S.pv && S.pv.all) { var pn = { stated: 0, read: 0, inferred: 0 }; preview().forEach(function (P) { P.yellow.forEach(function (y) { pn[tierOf(y.rule) || 'inferred']++; }); });   // §D36 every round, while the Arrange view stands
      var ps = pn.stated + '/' + pn.read + '/' + pn.inferred; if (ps !== S.pvTierSig) { S.pvTierSig = ps; S.pvTiers = pn; console.log(TAGE + ' preview-tiers stated=' + pn.stated + ' read=' + pn.read + ' inferred=' + pn.inferred + ' rows=' + (pn.stated + pn.read + pn.inferred) + ' (every round: the Arrange view, in the sheet cards)'); } }
    else S.pvTierSig = null;
    var nb = document.getElementById('dm-body'); nb.scrollTop = top;
    S.panel.querySelectorAll('[data-add-val],[data-add-pos],[data-add-key]').forEach(function (el) { var k = el.getAttribute('data-add-val') ? 'v' + el.getAttribute('data-add-val') : el.getAttribute('data-add-pos') ? 'p' + el.getAttribute('data-add-pos') : 'k' + el.getAttribute('data-add-key'); if (S.draft[k] !== undefined) el.value = S.draft[k]; });
    ['dm-ds-mark', 'dm-ds-w', 'dm-ds-h'].forEach(function (id) { var el = document.getElementById(id); if (el && S.draft[id] !== undefined) el.value = S.draft[id]; });
    if (fid) { var f = document.getElementById(fid); if (f) { f.focus(); if (focusVal && focusVal.sel === '#' + fid && f.value !== focusVal.v) { f.value = focusVal.v; try { f.setSelectionRange(focusVal.s, focusVal.s); } catch (e) { /* select */ } } } }
    if (S.focus) focusTargets(S.focus).forEach(function (el) { el.classList.add('dm-focus'); });
    wire();
  }
  function sheetAt(el) { return S.sheets[Number(el.getAttribute('data-sheet'))]; }
  function wire() {
    var P = S.panel;
    document.getElementById('dm-close').onclick = function () { close(); };
    document.getElementById('dm-save').onclick = function () { save(); };
    P.querySelectorAll('[data-act]').forEach(function (el) {
      var a = el.getAttribute('data-act');
      if (a === 'bodyzadd') el.onclick = function () { var k = el.getAttribute('data-kind'), a0 = document.getElementById('dm-bz-' + k + '-0').value.trim(), a1 = document.getElementById('dm-bz-' + k + '-1').value.trim(), z0 = Number(a0), z1 = Number(a1);
        if (!a0 || !a1 || !isFinite(z0) || !isFinite(z1) || !(z0 < z1)) { console.log(TAG + ' bodyz refused: two numbers with z0 < z1 are needed'); return; }
        var sh = S.sheets.filter(function (q) { return ROLE_VIEW[viewOf(q)] === 'plan' && sheetHasKind(q, k); })[0] || S.sheets.filter(function (q) { return ROLE_VIEW[viewOf(q)] === 'plan'; })[0]; if (!sh) return;
        sh.marks.push({ key: 'BODYZ', value: k + ',' + a0 + ',' + a1, x: 0, y: 0, source: 'user' }); console.log(TAG + ' add sheet=' + sh.name + ' @BODYZ=' + k + ',' + a0 + ',' + a1); changed(); };
      if (a === 'sizeadd') el.onclick = function () { var gd = el.getAttribute('data-guid'), ax = el.getAttribute('data-axis'), raw = document.getElementById('dm-sz-' + el.getAttribute('data-i')).value.trim(), v = Number(raw);
        if (!raw || !isFinite(v) || !(v > 0)) { console.log(TAG + ' size refused: a number of metres above zero is needed'); return; }
        var sh = S.sheets.filter(function (q) { return ROLE_VIEW[viewOf(q)] === 'plan'; })[0]; if (!sh) return;
        sh.marks = sh.marks.filter(function (q) { return !(q.key === 'SIZE' && String(q.value).split(',').slice(0, 2).join(',') === gd + ',' + ax); });
        sh.marks.push({ key: 'SIZE', value: gd + ',' + ax + ',' + raw, x: 0, y: 0, source: 'user' }); console.log(TAG + ' add sheet=' + sh.name + ' @SIZE=' + gd + ',' + ax + ',' + raw); changed(); };
      if (a === 'sizedel') el.onclick = function () { var sh = S.sheets[Number(el.getAttribute('data-sheet'))]; if (sh) removeMark(sh, Number(el.getAttribute('data-mi'))); };
      if (a === 'edefset') el.onclick = function () { var key = el.getAttribute('data-key'), raw = document.getElementById('dm-ed-' + el.getAttribute('data-i')).value.trim(); if (!raw) return;
        var row = ((gateNow().R || {}).defaults_table || []).filter(function (q) { return q.key === key; })[0]; if (row && row.unit !== 'text' && !(isFinite(Number(raw)) && Number(raw) >= 0)) { console.log(TAG + ' default refused: ' + key + ' needs a non-negative number'); return; }
        var sh = S.sheets.filter(function (q) { return ROLE_VIEW[viewOf(q)] === 'plan'; })[0]; if (!sh) return;
        sh.marks = sh.marks.filter(function (q) { return !(q.key === 'DEFAULT' && String(q.value).split(',')[0] === key); });
        sh.marks.push({ key: 'DEFAULT', value: key + ',' + raw, x: 0, y: 0, source: 'user' }); console.log(TAG + ' add sheet=' + sh.name + ' @DEFAULT=' + key + ',' + raw); changed(); };
      if (a === 'edefdel') el.onclick = function () { var key = el.getAttribute('data-key'); S.sheets.forEach(function (sh) { var n = sh.marks.length; sh.marks = sh.marks.filter(function (q) { return !(q.key === 'DEFAULT' && String(q.value).split(',')[0] === key); }); if (sh.marks.length !== n) console.log(TAG + ' remove sheet=' + sh.name + ' @DEFAULT=' + key); }); changed(); };
      if (a === 'bodyzdel') el.onclick = function () { var sh = S.sheets[Number(el.getAttribute('data-sheet'))]; if (sh) removeMark(sh, Number(el.getAttribute('data-mi'))); };
      if (a === 'defkeep') el.onclick = function () { var k = el.getAttribute('data-key'); defRows().forEach(function (r) { if (r.key === k && r.kind === 'default') r.kind = 'chosen'; }); S.defaultChoices = S.defaultChoices || {}; S.defaultChoices[k] = String(defRows().filter(function (r) { return r.key === k; })[0].value); console.log(TAG + ' default-kept ' + k); refeed(); render(); attention(); };
      if (a === 'acceptall') el.onclick = function () { var n = 0, b; S.tierHold = true; while (n++ < 300 && (b = S.panel.querySelector('#dm-yellows [data-act="confirm"],#dm-yellows [data-act="dconfirm"],#dm-yellows [data-act="defkeep"]'))) b.click(); S.tierHold = false; console.log(TAG + ' accept-all clicks=' + (n - 1)); render(); attention(); };
      if (a === 'acceptsr' || a === 'acceptinf') el.onclick = function () { var ts = a === 'acceptsr' ? ['stated', 'read'] : ['inferred'], sel = [], n = 0, b;   // §D36 each takes only its rows (and the rows of its kind a later round brings)
        ts.forEach(function (t) { ['confirm', 'dconfirm', 'defkeep'].forEach(function (k) { sel.push('#dm-yellows .dm-pr[data-tier="' + t + '"] [data-act="' + k + '"]'); }); });
        S.tierHold = true; while (n++ < 300 && (b = S.panel.querySelector(sel.join(',')))) b.click(); S.tierHold = false; console.log(TAG + ' accept tier=' + ts.join('+') + ' clicks=' + (n - 1)); render(); attention(); };
      if (a === 'typeover') el.onclick = function (e) { e.stopPropagation(); typeOver(el.getAttribute('data-ev')); };
      if (a === 'defchoose') el.onchange = function () { var k = el.getAttribute('data-key'), v = el.value, num = Number(v);
        defRows().forEach(function (r) { if (r.key === k && (r.kind === 'default' || r.kind === 'chosen')) { r.value = (typeof r.value === 'number' && isFinite(num)) ? num : v; r.kind = 'chosen'; } });
        S.defaultChoices = S.defaultChoices || {}; S.defaultChoices[k] = v; console.log(TAG + ' default-chosen ' + k + '=' + v); refeed(); render(); attention(); };
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
      else if (a === 'layer') el.onchange = function () { setLayerRule(el.getAttribute('data-role'), el.getAttribute('data-layer'), el.value && el.value !== '__mixed' ? el.value : null, el.getAttribute('data-sheet') || undefined); };
      else if (a === 'laysplit') el.onclick = function () { var k = el.getAttribute('data-key'); S.split[k] = !S.split[k]; render(); };
      else if (a === 'tool') el.onclick = function () { setTool(el.getAttribute('data-tool')); };
      else if (a === 'exsheet') el.onchange = function () { S.exSheet = el.value; };
      else if (a === 'tpl') el.onchange = function () { S.setOverride = el.value || null; console.log(TAG + ' layer set=' + (S.setOverride || 'from the drawings')); changed(); };
      else if (a === 'tagadd') el.onclick = function () { var c = document.getElementById('dm-tag-cls').value, val = document.getElementById('dm-tag-val').value, pk = S.pick, zt = (document.getElementById('dm-tag-z').value || '').trim(); if (!val) return;
        if (zt !== '' && !isFinite(Number(zt))) { S.tmsg = 'z must be a number in metres (or empty)'; render(); return; }   // §L4.4 optional z (m)
        S.pick = null; S.tmsg = null; addMulti(S.sheets.filter(function (s) { return s.name === pk.sheet; })[0], 'TAG', c + ',' + (zt !== '' ? 'z=' + Number(zt) + ',' : '') + val, pk.x, pk.y); };
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
      else if (a === 'dsadd') el.onclick = function () { var mk = document.getElementById('dm-ds-mark').value, w = document.getElementById('dm-ds-w').value, hh = document.getElementById('dm-ds-h').value;
        ['dm-ds-mark', 'dm-ds-w', 'dm-ds-h'].forEach(function (id) { document.getElementById(id).value = ''; delete S.draft[id]; });
        if (!setRow(mk, w, hh)) [['dm-ds-mark', mk], ['dm-ds-w', w], ['dm-ds-h', hh]].forEach(function (q) { var e = document.getElementById(q[0]); if (e) e.value = q[1]; }); };
      else if (a === 'dsz') { el.onkeydown = function (e) { if (e.key === 'Enter') el.blur(); }; el.onchange = function () { var mk = el.getAttribute('data-mark'), r = schedRows().filter(function (q) { return q.mark === mk; })[0] || {};
        var w = el.getAttribute('data-dim') === 'w' ? el.value : r.w, hh = el.getAttribute('data-dim') === 'h' ? el.value : r.h; if (String(w).trim() !== '' && String(hh).trim() !== '') setRow(mk, w, hh); }; }
      else if (a === 'drm') el.onclick = function () { removeRow(el.getAttribute('data-mark')); };
      else if (a === 'dconfirm') el.onclick = function () { var p = S.dprops[Number(el.getAttribute('data-i'))]; if (!p) return;
        if (p.rule === 'PR-SCHEDULE') setRow(p.mark, p.w, p.h, p.rule); else writeTag(p.sheet, p.handle, p.mark, p.rule); };
      else if (a === 'dtag') el.onclick = function () { var pk = S.dpick; if (!pk) return; var nw = document.getElementById('dm-dt-new').value.trim(), mk = nw || document.getElementById('dm-dt-sel').value; if (!mk) { S.dmsg = 'Pick a schedule mark or type a new one.'; render(); return; } writeTag(pk.sheet, pk.handle, mk); };
      else if (a === 'dzoom') el.onclick = function () { highlight({ code: 'door', sheet: el.getAttribute('data-sheet'), handles: [el.getAttribute('data-h')], pos: null }); };
      else if (a === 'vtab') el.onclick = function () { S.vtab = el.getAttribute('data-tab'); render(); };
      else if (a === 'item') el.onclick = function () { var x = (S.vtab === 'blocking' ? S.verdict.blocking : S.verdict.advisory)[Number(el.getAttribute('data-i'))]; highlight(x); };
    });
    P.querySelectorAll('.dm-pr[data-ev]').forEach(function (el) { el.addEventListener('click', function (e) { if (e.target.closest('button,select,input')) return; fly(el.getAttribute('data-ev')); }); });   // §D36 a row = fly to its evidence
  }
  // ---- §D36 FLY TO THE EVIDENCE: a click on a suggestion row hands it to the import UI (the camera eases to its evidence on the sheet as it stands); the same row
  // again restores; the row stays in view and offers Accept (its tick) and Type over (its field, filled with the value: yours once changed or confirmed) ----
  function fly(id) {
    var r = S.evRows[id], U = window.DxfImportUI; if (!r || !U || !U.evidence) return;
    if (S.ev === id) { U.evidenceClear('the row again'); return; }
    S.ev = id; S.evNote = null; render();
    return U.evidence({ sheet: S.sheets[r.si].name, si: r.si, rule: r.rule, key: r.key, value: r.value, x: r.x, y: r.y, why: r.why }).then(function (info) {
      if (S.ev !== id) return info; S.evNote = info ? (info.notes.length ? info.notes.join('. ') : '') : 'nothing to show for this row'; S.evNote = S.evNote || null; render(); return info; });
  }
  function evOff() { if (S.ev === null) return; S.ev = null; S.evNote = null; render(); }   // the import UI restored the view (Esc, a click on the canvas, the values changed)
  function typeOver(id) {
    var r = S.evRows[id]; if (!r) return; var si = r.si, k = r.key, multi = SINGLE_POS[k] !== undefined && k !== 'TAG', g = k === 'GRIDX' || k === 'GRIDY' ? 'GRID' : k;
    S.sec.sheets = true; S.open[si] = true; if (k === 'UNITS') S.sec.units = true;
    render();
    if (multi) [['dm-av-' + si + '-' + g, String(r.value)], ['dm-ap-' + si + '-' + g, String(SINGLE_POS[k] === 'y' ? r.y : r.x)]].forEach(function (q) { var e = document.getElementById(q[0]); if (e) e.value = q[1]; });   // the Add row: the value + its position (a render keeps them as drafts)
    if (multi && g === 'GRID') { var ks = S.panel.querySelector('[data-add-key="' + si + '-GRID"]'); if (ks) ks.value = k; }
    var el = multi ? document.getElementById('dm-av-' + si + '-' + g) : document.getElementById('dm-f-' + si + '-' + k);
    if (!el) { el = document.getElementById('dm-f-' + si + '-VIEW'); console.log(TAGE + ' type-over sheet=' + S.sheets[si].name + ' key=' + k + ': no field yet (its role is not yours yet), the Role field'); }
    if (!el) return;
    if (!multi && el.tagName === 'INPUT') el.value = String(r.value);
    el.scrollIntoView({ block: 'nearest' }); el.focus(); if (el.select) el.select();
    console.log(TAGE + ' type-over sheet=' + S.sheets[si].name + ' key=' + k + ' field=' + el.id + (multi ? ' (Add row filled: value + position)' : ''));
  }
  // ---- §D34 ARRANGE (prompts/DXF2BIM_ARRANGE.md): the effective markings of every sheet = its markings + the yellow suggestions, the later rounds computed
  // as if the earlier yellow values were in place (a second Dxf2Suggest over shadow copies; nothing is accepted, saved or added to S.sheets) ----
  var PV_ROUNDS = 6, _pv = null;
  function preview() {
    var key = JSON.stringify(S.sheets.map(sigOf)) + '|' + JSON.stringify(S.defaultChoices || {}) + '|' + (S.setOverride || '') + '|' + curSet();
    if (_pv && _pv.key === key) return _pv.out;
    var sh0 = S.sheets.map(function (sh) { return { name: sh.name, text: sh.text, dxf: sh.dxf, hatchLayers: sh.hatchLayers, marks: sh.marks.slice() }; });
    var SG = window.Dxf2Suggest.create({ MK: MK, sheets: function () { return sh0; }, gridLayers: gridLayers, levelLayers: levelLayers });
    var yel = sh0.map(function () { return []; }), refused = sh0.map(function () { return []; }), r;
    for (r = 1; r <= PV_ROUNDS; r++) {
      var round = sh0.map(function (sh) { return SG.proposalsFor(sh); }), n = 0;
      round.forEach(function (P, si) {
        if (r === 1) refused[si] = P.refused;
        P.list.forEach(function (p, pi) {
          var row = { key: p.key, value: p.value, x: p.x, y: p.y, rule: p.rule, why: p.why, round: r, pi: r === 1 ? pi : -1 }, single = SINGLE_POS[p.key] === undefined && ['EXCLUDE', 'WALLTOP', 'TAG'].indexOf(p.key) < 0, q = posOf(p.key, p.x, p.y);
          if (single) sh0[si].marks = sh0[si].marks.filter(function (m) { return m.key !== p.key; });
          sh0[si].marks.push({ key: p.key, value: String(p.value), x: single ? 0 : q.x, y: single ? 0 : q.y, source: 'yellow' });
          yel[si].push(row); n++;
        });
      });
      if (!n) break;
    }
    var out = S.sheets.map(function (sh, si) {
      var d = MK.describe(sh0[si].marks.map(function (m, i) { return { raw: markText(m), x: m.x, y: m.y, handle: (i + 1).toString(16) }; }));
      return { si: si, name: sh.name, marks: sh.marks.map(function (m) { return { key: m.key, value: m.value, x: m.x, y: m.y, source: m.source === 'user' ? 'user' : 'file' }; }), yellow: yel[si], refused: refused[si], desc: d.desc, errors: d.errors,
        effText: function () { return MK.writeMarks(sh.stripped || (sh.stripped = strip(sh.text)), sh0[si].marks.map(function (m) { return { text: markText(m), x: m.x, y: m.y }; })); } };
    });
    _pv = { key: key, out: out };
    console.log(TAG + ' preview rounds=' + Math.min(r, PV_ROUNDS) + ' yellow=' + out.map(function (o) { return o.yellow.length; }).join(','));
    return out;
  }
  // §D41.4 the same row in plain words (a function of key / value / position only), shown under the @KEY=value text: WHAT the row says about the sheet
  function humanMark(k, v, x, y) {
    var u = { in: 'inches', ft: 'feet', mm: 'millimetres', cm: 'centimetres', m: 'metres' };
    switch (k) {
      case 'UNITS': return 'The drawing is in ' + (u[v] || v);
      case 'VIEW': return v === 'PLAN' ? 'This sheet is a plan: it lies flat' : v === 'ELEV' ? 'This sheet is an elevation: it stands up' : v === 'SECTION' ? 'This sheet is a section: it stands up' : v === 'ROOF' ? 'This sheet is a roof plan' : 'Role: ' + v;
      case 'NAME': return 'The sheet is titled "' + v + '"';
      case 'LEVEL': return 'This plan sits at level ' + v + ' m' + (Number(v) === 0 ? ' (the ground)' : '');
      case 'GRIDX': return 'Grid line ' + v + ' runs at x ' + num(x);
      case 'GRIDY': return 'Grid line ' + v + ' runs at y ' + num(y);
      case 'GRIDH': return 'Grid line ' + v + ' of this elevation sits at x ' + num(x);
      case 'Z': return 'Height ' + v + ' m is drawn at y ' + num(y);
      case 'HAXIS': return 'Its horizontal runs along ' + v + ' of the plan';
      case 'FACE': return 'It faces the ' + ({ minY: 'front (-Y)', maxY: 'rear (+Y)', minX: 'west end (-X)', maxX: 'east end (+X)' }[v] || v) + ' of the building';
      case 'CUT': return 'The section is cut along ' + String(v).replace(',', ' = ');
      case 'ROOF': return 'The roof top is at ' + v + ' m';
      default: return '';
    }
  }
  function previewBlock(si) {   // S.pv: { all: true } (the view stands: every yellow row) | { bands: { si: [KEY, ...] } } (play: the bands revealed so far)
    var P = preview()[si], keys = S.pv.all ? null : (S.pv.bands[si] || []), h = '';
    var rows = P.yellow.filter(function (y) { return !keys || keys.indexOf(y.key) >= 0; });
    if (keys) rows.sort(function (a, b) { return keys.indexOf(a.key) - keys.indexOf(b.key); });
    else if (S.pv.order && S.pv.order[si]) { var o = S.pv.order[si]; rows.sort(function (a, b) { return (o.indexOf(a.key) < 0 ? 99 : o.indexOf(a.key)) - (o.indexOf(b.key) < 0 ? 99 : o.indexOf(b.key)); }); }
    if (!rows.length) return '';
    h += '<div class="dm-sub">' + IC.bulb + 'Defaults placing ' + esc(String(S.sheets[si].name).replace(/\.dxf$/i, '')) + ' (yellow: not yours yet)</div>';
    rows.forEach(function (y) {
      var ps = SINGLE_POS[y.key], fresh = S.pv.fresh && S.pv.fresh.si === si && S.pv.fresh.key === y.key;
      h += prOpen(si, y, ' dm-pv' + (fresh ? ' dm-new' : '')).replace('<div class="dm-pr', '<div data-pv-key="' + esc(y.key) + '" data-pv="' + esc(y.key + '=' + y.value) + '" class="dm-pr') + '<span class="t"><b>@' + y.key + '=' + esc(y.value) + (ps === 'x' ? ' x ' + num(y.x) : ps === 'y' ? ' y ' + num(y.y) : '') + '</b><span class="dm-hs">' + esc(humanMark(y.key, y.value, y.x, y.y)) + '</span><span class="w">' + esc(y.rule + ': ' + y.why) + '</span></span>' + prTail(si, y) +
        (y.pi >= 0 ? '<button class="dm-ib" title="Confirm this suggestion" data-act="confirm" data-sheet="' + si + '" data-pi="' + y.pi + '">' + IC.check + '</button>' : '<span class="dm-later" title="suggested once the values above are yours">after the above</span>') + '</div>' + prNote(si, y);
    });
    return h;
  }
  function pvSet(pv) { S.pv = pv || null; render(); }
  function focusTargets(F) {
    var P = S.panel; if (!P) return [];
    if (F.yellow) return Array.prototype.slice.call(P.querySelectorAll('[data-card="' + F.si + '"] .dm-pv[data-pv-key="' + F.key + '"]'));
    if (F.key === 'Z' || F.key === 'GRIDH' || F.key === 'GRIDX' || F.key === 'GRIDY') return Array.prototype.slice.call(P.querySelectorAll('[data-card="' + F.si + '"] .dm-mk[data-mark^="' + F.key + '="]'));
    var el = document.getElementById('dm-f-' + F.si + '-' + F.key); return el ? [el] : [];
  }
  // focusField: every section but Sheets collapsed (+ Units for an accepted @UNITS: its field lives there), every other card closed, the field / rows / yellow band in view and outlined
  function focusField(si, key, yellow) {
    if (!S.panel) return [];
    if (!S.fsave) S.fsave = { sec: Object.assign({}, S.sec), open: Object.assign({}, S.open), top: (document.getElementById('dm-body') || {}).scrollTop || 0, shown: S.panel.style.display !== 'none' };
    Object.keys(S.sec).forEach(function (k) { S.sec[k] = k === 'sheets' || (k === 'units' && key === 'UNITS' && !yellow); });
    S.open = {}; S.open[si] = true; S.focus = { si: si, key: key, yellow: !!yellow };
    S.panel.style.display = 'flex'; render();
    var T = focusTargets(S.focus), body = document.getElementById('dm-body');
    if (T.length && body) {
      var br = body.getBoundingClientRect(), top = Math.min.apply(null, T.map(function (e) { return e.getBoundingClientRect().top; })), bot = Math.max.apply(null, T.map(function (e) { return e.getBoundingClientRect().bottom; }));
      var want = bot - top <= br.height - 16 ? (top + bot) / 2 - (br.top + br.height / 2) : top - br.top - 8;   // the band centred when it fits, else its first row at the top
      body.scrollTop += want;
    }
    return T;
  }
  function focusEnd() {
    var F = S.fsave; S.focus = null; S.fsave = null; if (!F) return;
    S.sec = F.sec; S.open = F.open; if (!F.shown && S.panel) S.panel.style.display = 'none';
    render(); var b = document.getElementById('dm-body'); if (b) b.scrollTop = F.top;
  }
  function close() { if (S.panel) S.panel.style.display = 'none'; if (S.tool) setTool(S.tool); console.log(TAG + ' panel closed'); attention(); }

  // ---- open: from the import (dxf_import_ui.js openFiles) ----
  function bind() { MK = window.Dxf2Marks; Q = window.Dxf2Qualify; I = window.Dxf2BimImport; B = window.Dxf2Bim; Cf = window.Dxf2ShellConfig;
    // the @BY suffix is accepted only when the grammar reads '@LEVEL=1 @BY=user' as LEVEL 1 with no error (today it is a malformed number)
    var t = MK.describe([{ raw: '@LEVEL=1 @BY=user', x: 0, y: 0, handle: '1' }]); S.byOk = t.desc.level === 1 && !t.errors.some(function (e) { return e.code !== 'MARK:missing'; }); }
  function load(sheets) {   // sheets: Dxf2BimImport.readSheets output of the OPENED files
    bind(); S.cache = {};
    S.sheets = sheets.map(function (s) {
      var marks = MK.readMarks(s.dxf.entities).map(function (m) { var p = parseRaw(m.raw); return { key: p.key, value: p.value, by: p.by, raw: m.raw, x: m.x, y: m.y, handle: m.handle, source: 'file' }; });
      var sh = { name: s.name, text: s.text, dxf: s.dxf, marks: marks, hatchLayers: s.hatchLayers || null };
      sh.fileSig = marks.map(function (m) { return [m.raw, m.x, m.y]; });
      S.cache[s.name + '|' + sigOf(sh)] = Object.assign(s, { effText: s.text });   // unedited = the opened file itself
      return sh;
    });
    S.defaultChoices = {}; S.split = {}; S.verdict = null; S.open = {}; S.setOverride = null; S.saved = null; S.pick = null; S.sched = []; S.dpick = null; S.dcache = {}; S.dmsg = null; S.dprops = []; S.exSheet = null; S.wtLevel = {}; S.draft = {}; S.pv = null; S.focus = null; S.fsave = null; _pv = null; S.evRows = {}; S.ev = null; S.evNote = null; S.tierSig = null; S.pvTierSig = null;
    S.sheets.forEach(function (sh, i) { var mi = missingOf(sh); if (!viewOf(sh) || mi.miss.length) S.open[i] = true; });
    console.log(TAG + ' loaded sheets=' + S.sheets.length + ' markings from file=' + S.sheets.map(function (sh) { return sh.name + ':' + sh.marks.length; }).join(',') + ' bySuffixAccepted=' + S.byOk);
    css();
    if (!S.panel) { S.panel = document.createElement('div'); S.panel.id = 'dm-panel'; document.body.appendChild(S.panel); }
    S.panel.style.display = 'flex';
    var g = gateNow();   // the import already judged the opened files: show that verdict, no second run
    if (g && g.verdict) { S.verdict = g.verdict; S.verdict.pipeline = g.R && !g.R.refused ? { ran: true, run_id: g.R.run_id } : { ran: false, why: g.refused.map(function (r) { return r.sheet + ': ' + r.reason; }).join('; ') }; S.lib = g.lib; S.busy = false; render();
      console.log(TAG + ' verdict=' + g.verdict.verdict + ' blocking=' + g.verdict.blocking.length + ' advisory=' + g.verdict.advisory.length + ' (the import gate) counts=' + JSON.stringify(g.verdict.counts)); }
    else { render(); schedule(0); }
    attention();
  }
  function show() { if (!S.panel) return; S.panel.style.display = 'flex'; render(); attention(); }

  window.DxfMetaEditor = { defaultChoices: function () { return S.defaultChoices || {}; }, attention: attention, load: load, show: show, close: close, save: save, state: S, strip: strip, canon: canon, parseRaw: parseRaw, saveName: saveName,
    effText: effText, highlight: highlight, preview: preview, TIER: TIER, tierOf: tierOf, evOff: evOff, fly: fly, pvSet: pvSet, focusField: focusField, focusEnd: focusEnd, focusTargets: function () { return S.focus ? focusTargets(S.focus) : []; }, setTool: setTool, ICON: IC, doorsOf: function (n) { var sh = S.sheets.filter(function (q) { return q.name === n; })[0]; return sh ? doorsOf(sh) : null; }, schedRows: function () { return schedRows(); },
    whenIdle: function () { return new Promise(function (res) { (function w() { if (!S.busy && S.verdict) res(S.verdict); else setTimeout(w, 50); })(); }); } };
  console.log(TAG + ' ui loaded');
})();
