// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf_import_ui.js — DXF2BIM lane L3 in the Modeller (prompts/DXF2BIM_MODELLER_LANE.md §L3 "L3 build spec"):
// Open ▸ "Open 2D drawings (.dxf)…" → read the sheets (roles from DXF2BIM-MARK markings only) → draw them on the canvas
// (plan at its @LEVEL, elevation on its face plane, roof plan at @ROOF; one toggleable group) → Convert = ONE commitGesture
// in the ARC-seed form (rg: bodies as GEOM_INSERT + one GEOM_CUT per opening). The pipeline is dxf2bim_import.js (a port
// of the witness's orchestration) over the verbatim BIMCompiler modules in dxf2bim/. Logs §DXF-IMPORT / §DXF-CONVERT.
// No unicode glyphs: Lucide line icons inline. Loads its scripts lazily on first use (none at boot).
(function () {
  'use strict';
  var TAG = '§DXF-IMPORT', TAGC = '§DXF-CONVERT';
  var V = '6';
  var SCRIPTS = ['lib/dxf-parser.js', 'dxf2bim/dxf2bim.js', 'dxf2bim/dxf2marks.js', 'dxf2bim/dxf2elev.js', 'dxf2bim/dxf2mesh.js',
    'dxf2bim/dxf2types.js', 'dxf2bim/dxf2shell.js', 'dxf2bim/dxf2shell_config.js', 'dxf2bim/dxf2qualify.js', 'dxf2hatch.js', 'dxf2bim_import.js', 'dxf2prep.js', 'dxf2defaults.js', 'dxf2typology.js', 'dxf2pair.js', 'dxf2bodies.js', 'dxf2panels.js', 'dxf2section.js', 'dxf2doors.js', 'dxf2synth.js', 'dxf2notes.js', 'dxf2ledger.js', 'dxf2bill.js', 'dxf2suggest.js', 'dxf2structure.js', 'dxf_meta_editor.js'];   // §L4.1 + the Drawing metadata editor
  var _base = (document.currentScript && document.currentScript.src) || location.href;
  var _loaded = null;
  function loadScripts() {
    if (_loaded) return _loaded;
    _loaded = SCRIPTS.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = new URL(src + '?v=' + V, _base).href;
          s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return fetch(new URL('synthetic_ref.json?v=' + V, _base).href).then(function (r) { return r.json(); }).then(function (j) { state.ref = j; }).catch(function () { state.ref = null; }); }).then(function () { return fetch(new URL('element_defaults.json?v=' + V, _base).href).then(function (r) { return r.json(); }).then(function (j) { state.defaultsRef = j; }).catch(function () { state.defaultsRef = null; }); })   // §L13 the reference: materials (and the bill's formulas)
      .then(function () { console.log(TAG + ' modules loaded n=' + SCRIPTS.length + ' ref=' + (state.ref ? 'v' + state.ref.version : 'none')); return true; })
      .catch(function (e) { _loaded = null; console.error(TAG + ' ' + e.message); throw e; });
    return _loaded;
  }

  // ---- Lucide line icons (verbatim paths), no unicode glyphs ----
  var SVG = function (inner) { return '<svg class="dxf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'; };
  var ICON = {
    layers: SVG('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
    fileText: SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    eye: SVG('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: SVG('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>'),
    box: SVG('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
    x: SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    meta: SVG('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'),
    alert: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'),
    play: SVG('<polygon points="6 3 20 12 6 21 6 3"/>'),
    stop: SVG('<rect width="18" height="18" x="3" y="3" rx="2"/>')
  };

  var state = { sheets: null, gate: null, group: null, panel: null, last: null, linesOn: true, arr: null,
    arrangeOnOpen: !(typeof navigator !== 'undefined' && navigator.webdriver) };   // §D34 play on open from the chooser; an automated browser (the witnesses) opens without it unless it sets this
  var COL = { plan: 0x4fc3f7, elev: 0xffb74d, roof: 0x81c784, section: 0xce93d8, none: 0x8a8f99 };

  // ---- canvas: segments per sheet (drawing units) → world (metres) by role ----
  function segs2d(ents) {
    var out = [], skipped = {};
    function seg(a, b) { out.push(a[0], a[1], b[0], b[1]); }
    function arc(c, r, a0, a1) {
      if (a1 < a0) a1 += 2 * Math.PI;
      var n = Math.max(2, Math.ceil(64 * (a1 - a0) / (2 * Math.PI))), prev = null;
      for (var i = 0; i <= n; i++) { var t = a0 + (a1 - a0) * i / n, p = [c.x + r * Math.cos(t), c.y + r * Math.sin(t)]; if (prev) seg(prev, p); prev = p; }
    }
    ents.forEach(function (e) {
      if (e.layer === 'DXF2BIM-MARK') return;
      if (e.type === 'LINE' && e.vertices && e.vertices.length >= 2) seg([e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]);
      else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices && e.vertices.length >= 2) {
        for (var i = 0; i + 1 < e.vertices.length; i++) seg([e.vertices[i].x, e.vertices[i].y], [e.vertices[i + 1].x, e.vertices[i + 1].y]);
        if (e.shape) { var l = e.vertices[e.vertices.length - 1]; seg([l.x, l.y], [e.vertices[0].x, e.vertices[0].y]); }
      } else if (e.type === 'ARC' && e.center) arc(e.center, e.radius, e.startAngle, e.endAngle);
      else if (e.type === 'CIRCLE' && e.center) arc(e.center, e.radius, 0, 2 * Math.PI);
      else skipped[e.type] = (skipped[e.type] || 0) + 1;
    });
    return { s: out, skipped: skipped };
  }
  // Display rule (stated, not geometry): entities on layers the pipeline READS (a non-ignore type in the sheet's layer map) are drawn
  // bright; every other entity (title block, grid, annotation, furniture) dim. Nothing is filtered out.
  function mapsFor(role, Cf) { return role === 'plan' ? [Cf.MAP_PLAN] : role === 'elev' ? [Cf.MAP_ELEV, Cf.MAP_LEVL] : role === 'roof' ? [Cf.MAP_ROOF] : role === 'section' ? [Cf.MAP_SECT] : []; }
  function readLayer(Bm, maps, layer) { for (var i = 0; i < maps.length; i++) { var r = Bm.matchRule(layer, maps[i].rules); if (r && r.type !== 'ignore') return r.type; } return null; }
  // §D34 the ONE placement of a sheet (buildCanvas and Arrange share it): w(h, v) drawing units -> world metres by role, or null + the reason it is not drawn
  function envelopeOf(text, Cf) {   // the face planes: the lowest storey's outer wall envelope (Dxf2Shell.envelope of its plan pieces)
    var I = window.Dxf2BimImport, Bm = window.Dxf2Bim, Sh = window.Dxf2Shell;
    try { var run = Bm.run(text, Cf.MAP_PLAN, Cf.CFG, { DxfParser: window.DxfParser, hashHex: I.sha256Hex, library: [] });
      var ws = run.ops.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect; }); if (ws.length) return Sh.envelope(ws); } catch (e) { console.warn(TAG + ' envelope failed ' + e.message); }
    return null;
  }
  var ALIGN_TOL = 0.001;   // Dxf2Bodies.buildBodies' alignTol default (the structure judge passes none)
  function planOff(s, plans) {   // a plan after the base: the bodies' plan-to-plan alignment (Dxf2Bodies.planOffset, shared GRIDX / GRIDY labels); the base: none
    if (s.role !== 'plan' || !plans.length || s === plans[0] || !window.Dxf2Bodies || !window.Dxf2Bodies.planOffset) return null;
    return window.Dxf2Bodies.planOffset(plans[0], s, ALIGN_TOL);
  }
  function faceOf(face, plans, env) {   // the face plane: the lowest plan's wall envelope; without one, the panel.plane default (the end grid line of the base plan, Dxf2Panels.facePlane)
    if (env) return { v: { minX: env[0], minY: env[1], maxX: env[2], maxY: env[3] }[face], dflt: false };
    var g = window.Dxf2Panels && window.Dxf2Panels.facePlane ? window.Dxf2Panels.facePlane(plans[0], face) : null;
    return g === null ? null : { v: g, dflt: true };
  }
  function placeOf(s, plans, env, Cf) {
    var MK = window.Dxf2Marks, k = s.factor || 1;
    if (s.role === 'plan' || s.role === 'roof') { var z = s.role === 'plan' ? s.level : s.roofZ, off = planOff(s, plans);
      if (off && off.ok && (off.x || off.y)) { var ox = off.x, oy = off.y; return { k: k, z: z, off: off, w: function (x, y) { return [x * k + ox, y * k + oy, z]; } }; }
      return { k: k, z: z, off: off, w: function (x, y) { return [x * k, y * k, z]; } }; }
    if (s.role === 'elev' && plans.length) {
      var al = MK.align(plans[0].desc, s.desc, Cf.MARK_ALIGN_TOL), fp = faceOf(s.face, plans, env);
      if (!fp) return { k: k, w: null, why: 'not drawn (role=elev): no wall envelope and no grid on the face side of the base plan' };
      if (!al.map || !al.map.zOf) return { k: k, w: null, warn: 'elevation does not align: not drawn ' + JSON.stringify(al.errors) };
      var fc = fp.v, ax = al.map.axis;
      return { k: k, map: al.map, fc: fc, faceDefault: fp.dflt, w: function (h, v) { var a = al.map.toPlan(h), zz = al.map.zOf(v); return ax === 'X' ? [a, fc, zz] : [fc, a, zz]; } };
    }
    if (s.role === 'section' && plans.length) {   // §L3.3 R5: on its cut plane; (h, v) -> map.axis = toPlan(h), cut axis = @CUT x units, z = zOf(v)
      var sa = MK.align(plans[0].desc, s.desc, Cf.MARK_ALIGN_TOL), cp = String(s.cut).split(','), cutAx = cp[0], cutV = Number(cp[1]) * k;
      if (!sa.map || !sa.map.zOf) return { k: k, w: null, warn: 'section does not align: not drawn ' + JSON.stringify(sa.errors) };
      return { k: k, map: sa.map, cutPlane: { axis: cutAx, value: cutV }, w: function (h, v) { var a = sa.map.toPlan(h), zz = sa.map.zOf(v); return cutAx === 'X' ? [cutV, a, zz] : [a, cutV, zz]; } };
    }
    return { k: k, w: null, why: 'not drawn (role=' + (s.role || 'none') + ')' };
  }
  function setCfg() { var I = window.Dxf2BimImport, Cf0 = window.Dxf2ShellConfig; return Object.assign({ CFG: Cf0.CFG, MARK_ALIGN_TOL: Cf0.MARK_ALIGN_TOL }, I.setWith((state.gate && state.gate.set) || 'DX')); }   // §L3.3 the set's layer maps
  function buildCanvas(sheets, noFrame) {
    var THREE = window.THREE, A = window.A;
    if (!THREE || !A || !A.scene) { console.warn(TAG + ' canvas: no scene'); return null; }
    if (state.group) { A.scene.remove(state.group); state.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    var MK = window.Dxf2Marks, Bm = window.Dxf2Bim, Cf = setCfg();
    var g = new THREE.Group(); g.name = 'dxf-sheets'; g.userData.dxfSheets = true;
    state.canvas = {};
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var env = plans.length ? envelopeOf(plans[0].text, Cf) : null;
    state.envelope = env;
    sheets.forEach(function (s) {
      var maps = mapsFor(s.role, Cf).map(function (m) { return MK.withLayers(m, s.desc); }), pl = placeOf(s, plans, env, Cf), k = pl.k, z = pl.z, w = pl.w;   // §L4.2 the sheet's @LAYER rules
      if (!w) { if (pl.warn) console.warn(TAG + ' sheet=' + s.name + ' ' + pl.warn); else console.log(TAG + ' sheet=' + s.name + ' ' + pl.why); return; }
      if (pl.cutPlane) s.cutPlane = pl.cutPlane;
      if (pl.off) console.log(TAG + ' sheet=' + s.name + ' plan aligned to ' + plans[0].name + ' by its shared grid labels: ' + (pl.off.ok ? 'dx=' + Math.round(pl.off.x * 1e6) / 1e6 + ' dy=' + Math.round(pl.off.y * 1e6) / 1e6 + ' m' : 'refused (' + pl.off.why.join('; ') + '): drawn where it is'));
      if (pl.faceDefault) console.log(TAG + ' sheet=' + s.name + ' face plane ' + s.face + '=' + Math.round(pl.fc * 1e6) / 1e6 + ' m: the end grid line of ' + plans[0].name + ' (panel.plane default: no wall envelope), drawn tinted as a default');
      var bright = [], dim = [], skipped = {}, typeBox = {}, hB = [], hD = [], segOf = {};   // §L4.1: per-segment handle + per-handle world segments (editor zoom / highlight / Tag pick)
      s.dxf.entities.forEach(function (e) {
        var t = readLayer(Bm, maps, e.layer), sg = segs2d([e]);
        Object.keys(sg.skipped).forEach(function (q) { skipped[q] = (skipped[q] || 0) + sg.skipped[q]; });
        var P = t ? bright : dim, PH = t ? hB : hD;
        for (var i = 0; i < sg.s.length; i += 4) {
          var p0 = w(sg.s[i], sg.s[i + 1]), p1 = w(sg.s[i + 2], sg.s[i + 3]); P.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]); PH.push(e.handle); (segOf[e.handle] = segOf[e.handle] || []).push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
          if (t) { var b = typeBox[t] || (typeBox[t] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
            [p0, p1].forEach(function (p) { for (var a = 0; a < 3; a++) { if (p[a] < b[a]) b[a] = p[a]; if (p[a] > b[a + 3]) b[a + 3] = p[a]; } }); }
        }
      });
      [[bright, 0.95, hB], [dim, 0.16, hD]].forEach(function (pair) {
        if (!pair[0].length) return;
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pair[0], 3));
        var ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: pl.faceDefault ? new THREE.Color(COL[s.role]).lerp(new THREE.Color(YEL), 0.75) : COL[s.role] || COL.none, transparent: true, opacity: pair[1], depthWrite: false }));
        ls.name = 'dxf:' + s.name + (pair[1] < 0.5 ? ':dim' : ''); ls.userData.dxfSheet = s.name; ls.userData.segHandles = pair[2]; ls.renderOrder = 2; g.add(ls);
      });
      state.canvas[s.name] = { role: s.role, bright: bright.length / 6, dim: dim.length / 6, typeBox: typeBox, face: s.face || null, cut: s.cutPlane || null, toWorld: w, segOf: segOf, k: k, z: z };
      if (pl.faceDefault) state.canvas[s.name].faceDefault = 'panel.plane';
      if (pl.off && pl.off.ok && (pl.off.x || pl.off.y)) state.canvas[s.name].offset = [pl.off.x, pl.off.y];
      console.log(TAG + ' canvas sheet=' + s.name + ' role=' + s.role + ' segments read-layers=' + (bright.length / 6) + ' other=' + (dim.length / 6) + ' notDrawn=' + JSON.stringify(skipped) +
        ' box=' + JSON.stringify(Object.keys(typeBox).reduce(function (o, q) { o[q] = typeBox[q].map(function (v) { return Math.round(v * 1000) / 1000; }); return o; }, {})));
    });
    A.scene.add(g); state.group = g; g.visible = state.linesOn && !(state.arr && state.arr.live);   // §D34: hidden while the Arrange view stands in for it
    if (!noFrame) frameObject(g);
    return g;
  }
  function frameObject(obj) {   // camera only (the Modeller's iso direction, as frameBox)
    var THREE = window.THREE, A = window.A; if (!obj || !A || !A.camera || !A.controls) return;
    var box = new THREE.Box3().setFromObject(obj); if (box.isEmpty()) return;
    var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), r = Math.max(sz.x, sz.y, sz.z, 0.5) * 0.5;
    var dist = r / Math.sin((A.camera.fov * Math.PI / 180) / 2) * 1.3 + r, d = new THREE.Vector3(1, -1, 1.3).normalize();
    A.camera.up.set(0, 0, 1); A.controls.target.copy(c); A.camera.position.copy(c).addScaledVector(d, dist); A.controls.update();
    if (A.requestRender) A.requestRender();
  }
  function setLines(on) {
    state.linesOn = !!on; if (state.group) state.group.visible = state.linesOn && !(state.arr && state.arr.live); if (state.arr && state.arr.group) state.arr.group.visible = state.linesOn;
    var b = document.getElementById('dxf-lines'); if (b) b.innerHTML = (state.linesOn ? ICON.eye : ICON.eyeOff) + '<span>' + (state.linesOn ? 'Lines shown' : 'Lines hidden') + '</span>';
    if (window.A && window.A.requestRender) window.A.requestRender();
    console.log(TAG + ' lines visible=' + state.linesOn);
  }

  // ---- §D34 ARRANGE (prompts/DXF2BIM_ARRANGE.md): every sheet as drawn (1 drawing unit = 1 mm, z = 0: a stated starting point, not a reading), then placed one
  // marking / one yellow band at a time by its EFFECTIVE markings (its markings + the editor's yellow suggestions, the later rounds computed as if the earlier yellow
  // values were in place: DxfMetaEditor.preview). A VIEW: nothing is marked, accepted or saved; verdict / gate / Convert read the accepted markings only. A stage is
  // computed only from the values applied so far; the last stage of a sheet the canvas places IS placeOf's w (buildCanvas). Log §DXF-ARRANGE. ----
  var TAGA = '§DXF-ARRANGE', K0 = 0.001, YEL = 0xf5d90a;
  var KEY_ORDER = ['UNITS', 'VIEW', 'LEVEL', 'ROOF', 'Z', 'HAXIS', 'GRIDX', 'GRIDY', 'GRIDH', 'FACE', 'CUT'];   // the placing keys, in the order a sheet is placed
  var NEED = { PLAN: ['UNITS', 'VIEW', 'LEVEL', 'GRIDX', 'GRIDY'], ROOF: ['UNITS', 'VIEW', 'ROOF'], ELEV: ['UNITS', 'VIEW', 'Z', 'HAXIS', 'GRIDH', 'FACE'], SECTION: ['UNITS', 'VIEW', 'Z', 'HAXIS', 'GRIDH', 'CUT'] };
  var VIEW_ROLE = { PLAN: 'plan', ROOF: 'roof', ELEV: 'elev', SECTION: 'section' }, RANK = { PLAN: 0, ROOF: 1, ELEV: 2, SECTION: 3 };
  var _envMemo = {};
  function arrPlan() {   // the items (one per sheet: effective desc, its placement parts, its steps) from the editor's preview
    var MK = window.Dxf2Marks, Cf = setCfg(), pv = window.DxfMetaEditor.preview();
    var bcPlans = state.sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var items = pv.map(function (P) {
      var s = state.sheets.filter(function (q) { return q.name === P.name; })[0], d = P.yellow.length ? P.desc : s.desc;   // no yellow: the sheet as the canvas read it
      return { si: P.si, name: P.name, s: s, P: P, d: d, view: d.view, k: MK.UNITS[d.units] || null };
    });
    var ref = items.filter(function (it) { return it.view === 'PLAN' && typeof it.d.level === 'number' && it.k; }).sort(function (a, b) { return a.d.level - b.d.level || a.si - b.si; })[0] || null, env = null;
    if (ref) { if (!ref.P.yellow.length && bcPlans[0] === ref.s) env = state.envelope; else { var tx = ref.P.effText(); env = tx in _envMemo ? _envMemo[tx] : (_envMemo[tx] = envelopeOf(tx, Cf)); } }
    items.forEach(function (it) {
      var d = it.d, v = it.view;
      it.ref = ref; it.env = env; it.need = NEED[v] || ['UNITS']; it.zs = d.zs && d.zs.length ? d.zs[0] : null;
      if ((v === 'ELEV' || v === 'SECTION') && d.haxis) it.hax = { axis: d.haxis.slice(1), s: d.haxis[0] === '+' ? 1 : -1 };
      if (it.hax && ref && it.k) { var al = MK.align(ref.d, d, Cf.MARK_ALIGN_TOL); it.map = al.map; it.alErr = (al.errors || []).map(function (e) { return e.code; }).filter(function (c) { return c !== 'MARK:level_scale_fail'; }); }
      var refP = ref ? { desc: ref.d, factor: ref.k } : null, fp = v === 'ELEV' && d.face && refP ? faceOf(d.face, [refP], env) : null;
      it.fc = fp ? fp.v : null; it.fcDefault = !!(fp && fp.dflt);
      if (v === 'PLAN' && ref && it !== ref && it.k && window.Dxf2Bodies && window.Dxf2Bodies.planOffset) it.off = window.Dxf2Bodies.planOffset(refP, { desc: d, factor: it.k }, ALIGN_TOL);
      if (v === 'SECTION' && d.cut && it.k) { var cp = String(d.cut).split(','); it.cut = { ax: cp[0], v: Number(cp[1]) * it.k }; }
      var exact = !it.P.yellow.length && it.s.role ? placeOf(it.s, bcPlans, state.envelope, Cf) : null;   // the canvas's own placement (same w)
      if (exact && exact.w) it.place = exact;
      else if (ref && (v === 'PLAN' || v === 'ROOF' || v === 'ELEV' || v === 'SECTION') && it.k) {   // the same placeOf over the effective desc (one datum is enough here: the preview rule, the gate still needs 2)
        var ps = { role: VIEW_ROLE[v], factor: it.k, desc: d, level: d.level, roofZ: d.roof, face: d.face, cut: d.cut };
        if ((v === 'PLAN' && typeof d.level === 'number') || (v === 'ROOF' && typeof d.roof === 'number') || (v === 'ELEV' && d.face && d.haxis && it.zs) || (v === 'SECTION' && d.cut && d.haxis && it.zs)) {
          var pl = placeOf(ps, [it === ref ? ps : refP], env, Cf); if (pl.w) it.place = pl; }
      }
      // the steps: accepted placing markings (one per key) + yellow bands (one per key, all rows of that key), merged in KEY_ORDER; other yellow keys after
      var acc = {}; it.P.marks.forEach(function (m) { if (it.need.indexOf(m.key) >= 0) acc[m.key] = acc[m.key] || []; if (acc[m.key]) acc[m.key].push(m); });
      var yk = []; it.P.yellow.forEach(function (y) { if (yk.indexOf(y.key) < 0) yk.push(y.key); });
      var rank = function (k) { var i = KEY_ORDER.indexOf(k); return i < 0 ? 50 : i; };
      it.steps = [];
      Object.keys(acc).forEach(function (k) { it.steps.push({ key: k, yellow: false, rows: acc[k] }); });
      yk.forEach(function (k) { it.steps.push({ key: k, yellow: true, rows: it.P.yellow.filter(function (y) { return y.key === k; }) }); });
      it.steps.sort(function (a, b) { return rank(a.key) - rank(b.key) || (a.yellow ? 1 : 0) - (b.yellow ? 1 : 0) || (a.yellow && b.yellow ? yk.indexOf(a.key) - yk.indexOf(b.key) : 0); });
      it.steps.forEach(function (st) { st.value = st.rows.map(function (r) { return r.value; }).join('|'); });
    });
    items.sort(function (a, b) { var ra = a.view in RANK ? RANK[a.view] : 9, rb = b.view in RANK ? RANK[b.view] : 9;
      return ra - rb || (a.view === 'PLAN' ? (typeof a.d.level === 'number' ? a.d.level : 1e9) - (typeof b.d.level === 'number' ? b.d.level : 1e9) : 0) || a.si - b.si; });
    return items;
  }
  function stageFn(it, A) {   // the stage after the values in A: drawing units -> world metres
    if (it.place && it.need.every(function (k) { return A[k]; })) return it.place.w;
    var k = A.UNITS && it.k ? it.k : K0, v = it.view, d = it.d;
    if ((v === 'ELEV' || v === 'SECTION') && A.VIEW) {
      var z0 = it.zs, zf = A.Z && A.UNITS && it.k && z0 ? function (y) { return z0.z + (y - z0.y) * k; } : function (y) { return y * k; };
      var ax = 'X', sg = 1, tp = null, cx = (it.hc || 0) * k;   // HAXIS turns / mirrors the sheet about its own centre (where it stands, x = cx); GRIDH then puts it on the plan grid
      if (A.HAXIS && it.hax) { ax = it.hax.axis; sg = it.hax.s; if (A.GRIDH && it.map && A.UNITS) tp = it.map.toPlan; }
      var face = v === 'ELEV' && A.FACE && A.HAXIS && it.hax && it.fc !== null && it.fc !== undefined ? it.fc : v === 'SECTION' && A.CUT && A.HAXIS && A.UNITS && it.hax && it.cut && it.cut.ax !== it.hax.axis ? it.cut.v : null;
      var pp = face !== null ? face : ax === 'X' ? 0 : cx, c0 = ax === 'X' ? cx : 0, hc = it.hc || 0;
      if (!(A.HAXIS && it.hax)) return function (h, y) { return [h * k, pp, zf(y)]; };
      return function (h, y) { var a = tp ? tp(h) : c0 + sg * (h - hc) * k, z = zf(y); return ax === 'X' ? [a, pp, z] : [pp, a, z]; };
    }
    var zz = v === 'PLAN' && A.LEVEL && typeof d.level === 'number' ? d.level : v === 'ROOF' && A.ROOF && typeof d.roof === 'number' ? d.roof : 0;
    var ox = A.GRIDX && A.UNITS && it.off && it.off.ok ? it.off.x : 0, oy = A.GRIDY && A.UNITS && it.off && it.off.ok ? it.off.y : 0;   // a plan after the base: moved onto it by the bodies' alignment
    if (ox || oy) return function (x, y) { return [x * k + ox, y * k + oy, zz]; };
    return function (x, y) { return [x * k, y * k, zz]; };
  }
  function whyStill(it, key, A) {   // a step that moves nothing says why
    var v = it.view, d = it.d;
    if (key === 'UNITS') return !it.k ? 'units unknown' : it.k === K0 ? 'mm: unchanged (the starting point was 1 unit = 1 mm)' : 'unchanged';
    if (key === 'VIEW') return v === 'PLAN' || v === 'ROOF' ? 'a plan lies flat: unchanged' : 'not a placing view';
    if (key === 'LEVEL') return v === 'ROOF' ? 'a roof plan is lifted by @ROOF' : 'level ' + d.level + ': already at z = 0';
    if (key === 'ROOF') return v === 'ROOF' ? 'roof at z = 0' : 'the roof top: read by the pipeline, nothing moves';
    if (key === 'GRIDX' || key === 'GRIDY') return v !== 'PLAN' ? 'not a placing value' : !it.ref || it.ref === it ? 'the reference plan: the grid the elevations and the other plans align to' : !it.off ? 'needs @UNITS' : !it.off.ok ? 'not aligned to ' + it.ref.name + ': ' + it.off.why.join('; ') + ' (drawn where it is)' : 'already on ' + it.ref.name + '\'s grid';
    if (key === 'Z') return !A.UNITS ? 'needs @UNITS' : 'the datum is at its own height';
    if (key === 'HAXIS') return d.haxis === '+X' ? '+X: unchanged' : 'unchanged';
    if (key === 'GRIDH') return !it.hax || !A.HAXIS ? 'needs @HAXIS' + (it.ref ? '' : ' (no plan with @LEVEL to fit against)') : !it.map ? 'does not align: ' + (it.alErr || []).join(',') : 'already on the grid';
    if (key === 'FACE') return !it.hax || !A.HAXIS ? 'needs @HAXIS' : it.fc === null || it.fc === undefined ? 'no face plane: no wall envelope and no grid on that side of the base plan' : 'already on its face';
    if (key === 'CUT') return !it.hax || !A.HAXIS ? 'needs @HAXIS' : it.cut && it.cut.ax === it.hax.axis ? 'the cut runs along @HAXIS' : 'already on its cut';
    return key === 'NAME' ? 'names the sheet' : key === 'SET' ? 'names the set' : 'not a placing value';
  }
  function lacksOf(it) {   // what the effective values do not give, after every step
    var d = it.d, v = it.view, L = [];
    if (!v) return ['no role (' + ((it.P.refused || []).filter(function (r) { return r.rule === 'PR-VIEW'; }).map(function (r) { return r.why; })[0] || 'no @VIEW') + ')'];
    if (!it.k) L.push('@UNITS');
    if (v === 'PLAN' && typeof d.level !== 'number') L.push('@LEVEL (no rule suggests it)');
    if (v === 'ROOF' && typeof d.roof !== 'number') L.push('@ROOF');
    if (v === 'ELEV' || v === 'SECTION') {
      if (!d.zs.length) L.push('@Z'); else if (d.zs.length < 2) L.push('one height: a second is needed to convert');
      if (!d.haxis) L.push('@HAXIS' + (it.ref ? '' : ' (no plan with @LEVEL to fit against)'));
      else if (!it.map) L.push('grid alignment (' + ((it.alErr || []).join(',') || 'no reference plan') + ')');
      if (v === 'ELEV' && !d.face) L.push('@FACE'); else if (v === 'ELEV' && (it.fc === null || it.fc === undefined)) L.push('a face plane (no wall envelope, no grid on that side of the base plan)');
      if (v === 'SECTION' && !d.cut) L.push('@CUT');
    }
    return L;
  }
  function rawOf(it) {   // segment ends in drawing units, per handle, bright / dim as the canvas reads the layers
    var MK = window.Dxf2Marks, Bm = window.Dxf2Bim, Cf = setCfg(), maps = mapsFor(VIEW_ROLE[it.view], Cf).map(function (m) { return MK.withLayers(m, it.d); }), R = { b: [], d: [], hb: [], hd: [] };
    it.s.dxf.entities.forEach(function (e) {
      var t = readLayer(Bm, maps, e.layer), sg = segs2d([e]).s, P = t ? R.b : R.d, H = t ? R.hb : R.hd;
      for (var i = 0; i < sg.length; i += 4) { P.push(sg[i], sg[i + 1], sg[i + 2], sg[i + 3]); H.push(e.handle); }
    });
    return R;
  }
  function posOfRaw(raw, f) { var out = new Float64Array(raw.length / 2 * 3); for (var i = 0, j = 0; i < raw.length; i += 2, j += 3) { var p = f(raw[i], raw[i + 1]); out[j] = p[0]; out[j + 1] = p[1]; out[j + 2] = p[2]; } return out; }
  function maxDiff(a, b) { var m = 0; for (var i = 0; i < a.length; i++) { var x = Math.abs(a[i] - b[i]); if (x > m) m = x; } return m; }
  function colOf(it) { var c = new window.THREE.Color(COL[VIEW_ROLE[it.view]] || COL.none); return it.tint || it.dtint ? c.lerp(new window.THREE.Color(YEL), 0.75) : c; }
  function chain(it) {   // the stages of the sheet (stage 0 .. one per step) as world positions, + which steps move it
    var A = {}, raw = it.raw.b.concat(it.raw.d), hs = []; for (var i = 0; i < raw.length; i += 2) hs.push(raw[i]); hs.sort(function (a, b) { return a - b; });
    it.hc = hs.length ? (hs[Math.floor(hs.length * 0.01)] + hs[Math.ceil(hs.length * 0.99) - 1]) / 2 : 0;   // the sheet's own horizontal centre (drawing units, 1st..99th percentile)
    var st = [posOfRaw(raw, stageFn(it, A))];
    it.steps.forEach(function (s) { A[s.key] = true; var p = posOfRaw(raw, stageFn(it, A)); s.moves = maxDiff(p, st[st.length - 1]) > 1e-12; if (!s.moves) s.why = whyStill(it, s.key, A); st.push(p); });
    it.stages = st; it.tintFinal = it.steps.some(function (s) { return s.yellow && s.moves; });
    it.steps.forEach(function (s) { s.dflt = s.key === 'FACE' && s.moves && it.fcDefault; }); it.defFinal = it.steps.some(function (s) { return s.dflt; });   // the panel.plane default places it
  }
  function arrObjects(it, g) {
    var THREE = window.THREE, nb = it.raw.b.length / 2, nd = it.raw.d.length / 2; it.obj = [];
    [[0, nb, 0.95], [nb, nd, 0.16]].forEach(function (q) {
      if (!q[1]) return;
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(q[1] * 3), 3));
      var ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: colOf(it), transparent: true, opacity: q[2], depthWrite: false }));
      ls.name = 'arr:' + it.name + (q[2] < 0.5 ? ':dim' : ''); ls.userData.arrSheet = it.name; ls.userData.base = q[2]; ls.userData.off = q[0]; ls.userData.n = q[1]; ls.renderOrder = 2; ls.frustumCulled = false; g.add(ls); it.obj.push(ls);
    });
  }
  function arrWrite(it, P) { it.cur = P; it.obj.forEach(function (ls) { var a = ls.geometry.attributes.position, o = ls.userData.off * 3; a.array.set(P.subarray(o, o + ls.userData.n * 3)); a.needsUpdate = true; ls.geometry.computeBoundingSphere(); }); }
  function arrStyle(active) { var R = state.arr; if (!R) return; R.items.forEach(function (it) { var c = colOf(it); it.obj.forEach(function (ls) { ls.material.color.copy(c); ls.material.opacity = ls.userData.base * (active && active !== it ? 0.3 : !it.view && !active ? 0.5 : 1); }); }); }
  function boxOf(arrs) {   // the 1st..99th percentile per axis (a stray far entity of a sheet does not set the frame)
    var ax = [[], [], []]; arrs.forEach(function (P) { var st = Math.max(3, Math.floor(P.length / 3 / 4000) * 3); for (var i = 0; i < P.length; i += st) for (var a = 0; a < 3; a++) ax[a].push(P[i + a]); });
    if (!ax[0].length) return null;
    var q = ax.map(function (v) { v.sort(function (x, y) { return x - y; }); return [v[Math.floor(v.length * 0.01)], v[Math.min(v.length - 1, Math.ceil(v.length * 0.99) - 1)]]; });
    return [[q[0][0], q[1][0], q[2][0]], [q[0][1], q[1][1], q[2][1]]];
  }
  function camFor(b) {   // frameObject's view of a box, fitted into the canvas strip the panels leave free (right of the open panels, as the editor's zoom)
    var THREE = window.THREE, A = window.A, c = new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2), r = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2], 0.5) * 0.5;
    var cv = A.renderer.domElement.getBoundingClientRect(), pr = cv.left;
    ['dxf-panel', 'dm-panel'].forEach(function (id) { var e = document.getElementById(id); if (e && e.style.display !== 'none' && e.getBoundingClientRect().width > 0) pr = Math.max(pr, e.getBoundingClientRect().right); });
    var W = Math.max(cv.right - pr - 24, cv.width * 0.3), th = Math.tan((A.camera.fov * Math.PI / 180) / 2);
    var dist = Math.max(r / th, r / (th * W / cv.height)) * 1.3 + r, d = new THREE.Vector3(1, -1, 1.3).normalize(), p = c.clone().addScaledVector(d, dist), t = c.clone();
    var dxPx = (pr + (cv.right - pr) / 2) - (cv.left + cv.width / 2);
    if (dxPx > 0) { var m = new THREE.Matrix4().lookAt(p, t, new THREE.Vector3(0, 0, 1)), right = new THREE.Vector3().setFromMatrixColumn(m, 0), wpp = 2 * dist * th / cv.height; right.multiplyScalar(-dxPx * wpp); p.add(right); t.add(right); }
    return { t: t, p: p };
  }
  function followCam() {   // the camera follows the moving sheet (its current box), blending in from where it is over the first 40 % of the step
    var A = window.A, p0 = A.camera.position.clone(), t0 = A.controls.target.clone(), n = 0;
    return function (e, P) { if (!P) return; if (e < 1 && (n++ % 2)) return; var b = boxOf([P]); if (!b) return; var to = camFor(b), w = ease(Math.min(1, e / 0.4));
      A.camera.up.set(0, 0, 1); A.controls.target.lerpVectors(t0, to.t, w); A.camera.position.lerpVectors(p0, to.p, w); A.controls.update(); if (A.requestRender) A.requestRender(); };
  }
  function ease(e) { return e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2; }
  function tween(ms, fn) { return new Promise(function (res) { var R = state.arr; if (ms <= 0 || R.stop) { fn(1); res(); return; } var t0 = performance.now();
    (function f() { var e = R.stop ? 1 : Math.min(1, (performance.now() - t0) / ms); fn(e); if (window.A.requestRender) window.A.requestRender(); if (e < 1) requestAnimationFrame(f); else res(); })(); }); }
  function camTween(to) { var A = window.A, p0 = A.camera.position.clone(), t0 = A.controls.target.clone(); A.camera.up.set(0, 0, 1);
    return function (e) { var q = ease(e); A.controls.target.lerpVectors(t0, to.t, q); A.camera.position.lerpVectors(p0, to.p, q); A.controls.update(); if (A.requestRender) A.requestRender(); }; }
  function stepMotion(it, st, P0, P1) {   // the frame positions of one step: VIEW stands the sheet up (a turn about its own horizontal axis), HAXIS turns it about Z / mirrors it, the rest moves (picked up, set down)
    var out = new Float64Array(P0.length), n = P0.length, hop = 0;
    if (st.key === 'GRIDH' || st.key === 'FACE' || st.key === 'CUT') { for (var i = 0; i < n; i += 3) hop = Math.max(hop, Math.hypot(P1[i] - P0[i], P1[i + 1] - P0[i + 1])); hop = Math.min(hop * 0.15, 3); }
    var stand = st.key === 'VIEW' && (it.view === 'ELEV' || it.view === 'SECTION'), turn = st.key === 'HAXIS' && it.hax, cx = (it.hc || 0) * (it.k || K0);
    return function (e) {
      if (e >= 1) return P1;
      var q = ease(e);
      for (var i = 0; i < n; i += 3) {
        if (stand) { var th = q * Math.PI / 2; out[i] = P0[i] + (P1[i] - P0[i]) * q; out[i + 1] = P0[i + 1] * Math.cos(th); out[i + 2] = P0[i + 1] * Math.sin(th) + P0[i + 2]; }
        else if (turn) { var ph = q * (it.hax.axis === 'Y' ? Math.PI / 2 : 0), m = 1 + (it.hax.s - 1) * q, u = P0[i] - cx; out[i] = cx + m * u * Math.cos(ph); out[i + 1] = P0[i + 1] + m * u * Math.sin(ph); out[i + 2] = P0[i + 2] + (P1[i + 2] - P0[i + 2]) * q; }
        else { out[i] = P0[i] + (P1[i] - P0[i]) * q; out[i + 1] = P0[i + 1] + (P1[i + 1] - P0[i + 1]) * q; out[i + 2] = P0[i + 2] + (P1[i + 2] - P0[i + 2]) * q + hop * Math.sin(Math.PI * q); }
      }
      return out;
    };
  }
  function finalSegOf(it) { var o = {}, P = it.stages[it.stages.length - 1], H = it.raw.hb.concat(it.raw.hd); for (var s = 0; s < H.length; s++) { var a = o[H[s]] = o[H[s]] || []; for (var j = 0; j < 6; j++) a.push(P[s * 6 + j]); } return o; }
  function compareCanvas(R) {   // A1: the arrangement's last stage against buildCanvas, per handle (1e-6 m)
    var n = 0, worst = 0, bad = [];
    R.items.forEach(function (it) { var c = state.canvas && state.canvas[it.name]; if (!c) return; n++; var F = finalSegOf(it), hs = Object.keys(c.segOf), w = 0;
      if (hs.length !== Object.keys(F).length) { bad.push(it.name + ':handles'); return; }
      hs.forEach(function (h) { var a = c.segOf[h], b = F[h]; if (!b || a.length !== b.length) { w = Infinity; return; } for (var i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i])); });
      if (w > 1e-6) bad.push(it.name + ':' + w); worst = Math.max(worst, w); });
    return { compared: n, worst: worst, bad: bad, equal: !bad.length };
  }
  function arrClear() {
    var R = state.arr, A = window.A; if (!R) return; R.stop = true;
    if (R.group && A && A.scene) { A.scene.remove(R.group); R.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    window.removeEventListener('keydown', R.onKey, true); state.arr = null;
    if (state.group) state.group.visible = state.linesOn;
    if (window.DxfMetaEditor && window.DxfMetaEditor.state.pv) window.DxfMetaEditor.pvSet(null);
  }
  function arrNeeded(R) { return R.items.some(function (it) { return it.tintFinal || (it.view && lacksOf(it).length && it.stages.length > 1 && maxDiff(it.stages[it.stages.length - 1], it.stages[0]) > 1e-12 && !(state.canvas && state.canvas[it.name])); }); }
  function handOver(why) { console.log(TAGA + ' hand-over to the canvas (' + why + ')'); arrClear(); if (state.panel) renderPanel(); if (window.A && window.A.requestRender) window.A.requestRender(); }
  function minimise(on) { var p = document.getElementById('dxf-panel'); if (p) p.classList.toggle('dxf-min', !!on); }
  function arrange(opts) {
    opts = opts || {};
    if (!state.sheets || !window.DxfMetaEditor || !window.THREE || !window.A) return Promise.resolve(null);
    if (state.arr && state.arr.playing) { arrangeStop(); return state.arr.done; }
    arrClear();
    var stepMs = opts.stepMs === undefined ? 900 : opts.stepMs, holdMs = opts.holdMs === undefined ? 1400 : opts.holdMs, t0 = performance.now(), ME = window.DxfMetaEditor;
    var items = arrPlan(), g = new window.THREE.Group(); g.name = 'dxf-arrange';
    items.forEach(function (it) { it.raw = rawOf(it); chain(it); it.tint = false; it.applied = 0; arrObjects(it, g); arrWrite(it, it.stages[0]); });
    var R = state.arr = { items: items, group: g, live: true, playing: true, stop: false, steps: [], log: [] };
    R.onKey = function (e) { if (e.key !== 'Escape') return; if (R.playing) arrangeStop(); else if (state.arr === R) handOver('Esc'); };
    window.addEventListener('keydown', R.onKey, true);
    window.A.scene.add(g); if (state.group) state.group.visible = false; g.visible = state.linesOn;
    var all = []; items.forEach(function (it) { it.steps.forEach(function (st) { all.push({ it: it, st: st }); }); });
    var nY = all.filter(function (x) { return x.st.yellow; }).length;
    console.log(TAGA + ' start sheets=' + items.length + ' steps=' + all.length + ' yellow=' + nY + ' stage0="1 drawing unit = 1 mm, z = 0: a starting point, not a reading"');
    var noRole = items.filter(function (it) { return !it.view; });
    if (noRole.length) console.log(TAGA + ' finding sheets without a role=' + noRole.length + ' (' + noRole.map(function (it) { return it.name + ': ' + lacksOf(it)[0]; }).join('; ') + '): they stay flat as drawn');
    items.forEach(function (it) { if (it.off) console.log(TAGA + ' note sheet=' + it.name + (it.off.ok ? (it.off.x || it.off.y ? ' moves onto ' : ' is already on ') + it.ref.name + ' by its shared grid labels (Dxf2Bodies.planOffset, as Convert\'s bodies): dx=' + Math.round(it.off.x * 1e6) / 1e6 + ' dy=' + Math.round(it.off.y * 1e6) / 1e6 + ' m' + ((it.off.x || it.off.y) && !(state.gate && state.gate.structure) ? ' (a wall set: its Convert does not move plans)' : '') : ' stays where drawn: ' + it.off.why.join('; '))); });
    minimise(true); setArrBtn(); status('Arrange: the ' + items.length + ' sheets as drawn, 1 drawing unit = 1 mm, z = 0 (a starting point, not a reading).');
    var pb = {}; ME.pvSet({ bands: pb });
    var bx = boxOf(items.map(function (it) { return it.stages[0]; }));
    R.done = (async function () {
      if (bx) { var c0 = camTween(camFor(bx)); c0(1); }
      arrStyle(null); await tween(holdMs, function () {});
      for (var i = 0; i < all.length && !R.stop; i++) {
        var it = all[i].it, st = all[i].st, j = it.applied + 1, P0 = it.stages[j - 1], P1 = it.stages[j];
        if (st.yellow) { (pb[it.si] = pb[it.si] || []).push(st.key); ME.state.pv.fresh = { si: it.si, key: st.key }; }
        var T = ME.focusField(it.si, st.key, st.yellow);
        var line = 'step ' + (i + 1) + ' sheet=' + it.name + ' key=' + st.key + ' value=' + st.value + ' src=' + (st.yellow ? 'yellow' : st.rows[0].source) + ' morph=' + (st.moves ? (st.key === 'GRIDX' && it.off ? 'move dx=' + Math.round(it.off.x * 1e6) / 1e6 : st.key === 'GRIDY' && it.off ? 'move dy=' + Math.round(it.off.y * 1e6) / 1e6 : st.key === 'VIEW' ? 'stand' : st.key === 'HAXIS' ? (it.hax.axis === 'Y' ? 'turn' : '') + (it.hax.s < 0 ? 'mirror' : '') || 'none' : st.key === 'UNITS' ? 'scale' : st.key === 'LEVEL' || st.key === 'ROOF' || st.key === 'Z' ? 'lift' : 'move') + (st.dflt ? ' default=panel.plane (the end grid line ' + Math.round(it.fc * 1e6) / 1e6 + ' m, no wall envelope)' : '') : 'none why=' + st.why);
        console.log(TAGA + ' ' + line); R.log.push(line);
        status('Step ' + (i + 1) + '/' + all.length + ' · ' + it.name.replace(/\.dxf$/i, '') + ' · @' + st.key + '=' + st.value + (st.yellow ? ' (yellow: not yours yet)' : '') + (st.moves ? '' : ' · ' + st.why));
        var info = { i: i + 1, sheet: it.name, si: it.si, key: st.key, value: st.value, yellow: st.yellow, moves: st.moves, focused: T.map(function (e) { return e.id || e.getAttribute('data-pv') || e.getAttribute('data-mark'); }) };
        R.steps.push(info);
        if (opts.onStep) await opts.onStep(info);
        arrStyle(it);
        var mv = stepMotion(it, st, P0, P1), cam = followCam();
        var wasT = it.tint || it.dtint; if (st.yellow && st.moves) it.tint = true; if (st.dflt) it.dtint = true;
        await tween(st.moves ? stepMs : stepMs * 0.4, function (e) { var P = mv(e); arrWrite(it, P); cam(e, P); if (!wasT && (it.tint || it.dtint)) it.obj.forEach(function (ls) { ls.material.color.copy(new window.THREE.Color(COL[VIEW_ROLE[it.view]] || COL.none).lerp(new window.THREE.Color(YEL), 0.75 * ease(e))); }); });
        it.applied = j; arrWrite(it, P1);
      }
      if (R.stop) console.log(TAGA + ' stopped at step ' + R.steps.length + ': every sheet to its last stage');
      items.forEach(function (it) { it.applied = it.steps.length; it.tint = it.tintFinal; it.dtint = it.defFinal; arrWrite(it, it.stages[it.stages.length - 1]); });
      R.playing = false; R.stop = false; arrStyle(null);
      ME.focusEnd(); minimise(false);
      var cmp = compareCanvas(R); R.final = {}; items.forEach(function (it) { R.final[it.name] = finalSegOf(it); });
      R.lacks = {}; items.forEach(function (it) { var L = lacksOf(it); R.lacks[it.name] = L;
        if (!it.view) console.log(TAGA + ' skip sheet=' + it.name + ' why=' + L[0]);
        else console.log(TAGA + ' stands sheet=' + it.name + ' placed=' + (state.canvas && state.canvas[it.name] ? 'canvas' : it.place && it.steps.length && it.need.every(function (k) { return it.steps.some(function (s) { return s.key === k; }); }) ? 'full-preview' : 'partial') + (it.tintFinal ? ' tint=yellow' : '') + (it.defFinal ? ' face=panel.plane-default' : '') + ' lacks=' + (L.join('; ') || 'nothing')); });
      var fb = boxOf(items.filter(function (it) { return it.view; }).map(function (it) { return it.stages[it.stages.length - 1]; })); if (fb) { var cf = camTween(camFor(fb)); cf(1); }
      R.ms = Math.round(performance.now() - t0); R.cmp = cmp; state.arrLast = { final: R.final, cmp: cmp, steps: R.steps, lacks: R.lacks, ms: R.ms, tinted: items.filter(function (it) { return it.tintFinal; }).map(function (it) { return it.name; }) };
      console.log(TAGA + ' done steps=' + R.steps.length + '/' + all.length + ' ms=' + R.ms + ' final_equal=' + cmp.equal + ' compared=' + cmp.compared + ' worst=' + cmp.worst + (cmp.bad.length ? ' bad=' + cmp.bad.join(',') : '') + ' tinted=' + items.filter(function (it) { return it.tintFinal; }).length);
      var res = { steps: R.steps.length, total: all.length, ms: R.ms, final_equal: cmp.equal, compared: cmp.compared, worst: cmp.worst };
      if (R.dirty) { R.dirty = false; console.log(TAGA + ' values changed during play: sync'); arrSync(); }
      else if (!arrNeeded(R)) handOver('nothing yellow or partly placed: the canvas shows the same'); else { ME.pvSet({ all: true, order: orderOf(items) }); setArrBtn(); if (state.panel) renderPanel(); }
      return res;
    })();
    return R.done;
  }
  function orderOf(items) { var o = {}; items.forEach(function (it) { o[it.si] = it.steps.filter(function (s) { return s.yellow; }).map(function (s) { return s.key; }); }); return o; }
  function arrangeStop() { var R = state.arr; if (!R) return; if (R.playing) R.stop = true; else handOver('stop'); }
  // the live view after play: an accepted / typed value turns the tint solid; a changed value moves the sheet from where it stands to the new place
  function arrSync() {
    var R = state.arr; if (!R) return; if (R.playing) { if (R.syncing) R.again = true; else R.dirty = true; return; }   // a value typed during play: re-synced when the play ends
    var items = arrPlan(), moved = [], old = {}; R.items.forEach(function (it) { old[it.name] = it; });
    items.forEach(function (it) { it.raw = rawOf(it); chain(it); it.tint = it.tintFinal; it.dtint = it.defFinal; it.applied = it.steps.length; var o = old[it.name];
      var F = it.stages[it.stages.length - 1];
      if (o && o.cur && o.cur.length === F.length) { it.obj = o.obj; if (maxDiff(o.cur, F) > 1e-9) moved.push({ it: it, P0: o.cur, P1: F }); else arrWrite(it, F); }
      else { (o ? o.obj : []).forEach(function (ls) { R.group.remove(ls); ls.geometry.dispose(); }); arrObjects(it, R.group); arrWrite(it, F); } });
    R.items = items; arrStyle(null);
    console.log(TAGA + ' sync moved=' + moved.length + (moved.length ? ' (' + moved.map(function (m) { return m.it.name; }).join(',') + ') tween=700ms' : '') + ' tinted=' + items.filter(function (it) { return it.tintFinal; }).length);
    R.final = {}; items.forEach(function (it) { R.final[it.name] = finalSegOf(it); }); R.cmp = compareCanvas(R); R.lacks = {}; items.forEach(function (it) { R.lacks[it.name] = lacksOf(it); });
    state.arrLast = { final: R.final, cmp: R.cmp, steps: R.steps, lacks: R.lacks, ms: R.ms, sync: true, tinted: items.filter(function (it) { return it.tintFinal; }).map(function (it) { return it.name; }) };
    var fin = function () { if (!arrNeeded(R)) handOver('every placing value is yours: the canvas shows the same (final_equal=' + R.cmp.equal + ' compared=' + R.cmp.compared + ')'); else { window.DxfMetaEditor.pvSet({ all: true, order: orderOf(items) }); if (state.panel) renderPanel(); } };
    if (!moved.length) { fin(); return; }
    R.playing = true; R.syncing = true;
    tween(700, function (e) { moved.forEach(function (m) { var q = ease(e), P = new Float64Array(m.P1.length); for (var i = 0; i < P.length; i++) P[i] = m.P0[i] + (m.P1[i] - m.P0[i]) * q; arrWrite(m.it, e >= 1 ? m.P1 : P); }); }).then(function () { R.playing = false; R.syncing = false; if (R.again) { R.again = false; arrSync(); return; } fin(); });
  }
  function setArrBtn() { var b = document.getElementById('dxf-arrange'), R = state.arr; if (b) b.innerHTML = R && R.playing ? ICON.stop + '<span>Stop</span>' : ICON.play + '<span>Arrange</span>'; }

  // ---- panel (#ins-panel pattern) ----
  function css() {
    if (document.getElementById('dxf-css')) return;
    var st = document.createElement('style'); st.id = 'dxf-css';
    st.textContent = '.dxf-complete{display:flex;gap:6px;align-items:center;margin:8px 10px 2px;font-size:11px;color:#ffb347;cursor:pointer}.dxf-complete input{accent-color:#ffb347}#dxf-panel{position:fixed;left:252px;top:60px;width:264px;background:#1b1d23;border:1px solid #2c303a;border-radius:10px;z-index:31;color:#c7cdd8;font:12px system-ui,sans-serif;overflow:hidden;transition:left .18s ease}' +
      'body.ol-collapsed #dxf-panel{left:12px}#dxf-panel .ip-head{display:flex;align-items:center;gap:8px;padding:10px 10px 9px;border-bottom:1px solid #23262e}' +
      '#dxf-panel .ip-title{font-size:10px;letter-spacing:.14em;color:#5b6473}#dxf-panel .dxf-x{margin-left:auto;background:transparent;border:0;color:#7f8aa0;cursor:pointer;padding:2px;display:inline-flex}' +
      '#dxf-body{max-height:300px;overflow:auto;padding:6px 8px 8px}.dxf-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}.dxf-row:hover{background:#23262e}' +
      '.dxf-row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dxf-role{font-size:9px;font-family:ui-monospace,monospace;border:1px solid #2c303a;border-radius:6px;padding:2px 6px;color:#9aa3b2}' +
      '.dxf-role.none{border-color:#7a3b3b;color:#f2a3a3}.dxf-ico{width:14px;height:14px;flex:0 0 auto;color:#7f8aa0}.dxf-why{font-size:10px;color:#f2a3a3;margin:0 8px 4px 30px}' +
      '#dxf-panel .ip-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #23262e}' +
      '.dxf-btn{display:inline-flex;align-items:center;gap:6px;background:#13151a;border:1px solid #2c303a;border-radius:8px;color:#c7cdd8;padding:6px 10px;cursor:pointer;font:inherit}' +
      '.dxf-btn:hover{background:#1b1f27}.dxf-btn.primary{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dxf-btn:disabled{opacity:.45;cursor:not-allowed}' +
      '#dxf-status{width:100%;font-size:11px;color:#7f8aa0;line-height:1.4}#dxf-panel.dxf-min #dxf-body{display:none}.dxf-pv{font-size:10px;color:#e0c64a;margin:0 8px 4px 30px}';
    document.head.appendChild(st);
  }
  function roleChip(s) {
    if (!s.role) return '<span class="dxf-role none">NO ROLE</span>';
    if (s.role === 'plan') return '<span class="dxf-role">PLAN @' + s.level + '</span>';
    if (s.role === 'elev') return '<span class="dxf-role">ELEV ' + s.face + '</span>';
    if (s.role === 'section') return '<span class="dxf-role">SECTION ' + esc(s.cut) + '</span>';
    return '<span class="dxf-role">ROOF @' + s.roofZ + '</span>';
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPanel() {
    css();
    var p = state.panel || document.createElement('div'); p.id = 'dxf-panel';
    var h = '<div class="ip-head">' + ICON.layers + '<span class="ip-title">2D DRAWINGS · ' + state.sheets.length + ' SHEETS</span><button class="dxf-x" id="dxf-close" title="Close">' + ICON.x + '</button></div><div id="dxf-body">';
    state.sheets.forEach(function (s) {
      h += '<div class="dxf-row" data-sheet="' + esc(s.name) + '">' + (s.role ? ICON.fileText : ICON.alert) + '<span class="nm" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' + roleChip(s) + '</div>';
      if (!s.role) h += '<div class="dxf-why">' + esc(s.why || 'no role') + '</div>';
      var L = state.arr && state.arr.live && !state.arr.playing && state.arr.lacks && state.arr.lacks[s.name];   // §D34 the Arrange view: what the effective values do not give
      if (L && L.length) h += '<div class="dxf-pv">Arrange: ' + esc(L.join('; ')) + '</div>';
    });
    if (state.gate.structure) h += '<label class="dxf-complete" title="Add the floor slab and the gabled roof the drawings imply. They are computed from drawn evidence plus stated conventions, shown amber, and listed as yellow defaults."><input type="checkbox" id="dxf-complete"' + (state.complete ? ' checked' : '') + '> Complete the building (floor slab, roof): amber, estimated</label>';
    if (state.gate.structure) h += '<label class="dxf-complete" style="color:#9fb4c8" title="Show how each body is evidenced instead of its material: derived = amber, assumed = red. Off: each material in its standard colour."><input type="checkbox" id="dxf-evidence"' + (state.evidence ? ' checked' : '') + '> Evidence colours (drawn / derived / assumed)</label>';
    state.gate.refused.filter(function (r) { return r.sheet === '(set)'; }).forEach(function (r) { h += '<div class="dxf-why">' + esc(r.reason) + '</div>'; });
    if (state.gate.verdict && state.gate.verdict.blocking.length) state.gate.verdict.blocking.slice(0, 6).forEach(function (x) {
      h += '<div class="dxf-why dxf-block">' + esc(x.code + ' · ' + x.sheet + (x.handles.length ? ' · ' + x.handles.slice(0, 3).join(',') : '') + ' · ' + x.message) + '</div>'; });
    h += '</div><div class="ip-foot"><button class="dxf-btn" id="dxf-lines"></button><button class="dxf-btn" id="dxf-meta" title="Drawing metadata">' + ICON.meta + '<span>Metadata</span></button><button class="dxf-btn" id="dxf-arrange" title="Arrange: the sheets as drawn, placed one marking / yellow default at a time (Esc stops)"></button><button class="dxf-btn primary" id="dxf-convert"' + (state.gate.ok ? '' : ' disabled') + '>' + ICON.box + '<span>Convert</span></button>' +
      '<div id="dxf-status">' + (state.gate.structure ? (state.gate.ok ? 'Structure set: ' + state.gate.structure.bodies + ' bodies will be built' + (state.gate.structure.left_out ? ', ' + state.gate.structure.left_out + ' left out (listed as advisory: no elevation or conflicting heights)' : '') + '. Walls, slabs and roof are not read in a structure set.' : 'Convert refused: ' + (state.gate.refused.length ? state.gate.refused.map(function (r) { return r.reason; }).join('; ') : 'qualify verdict blocked')) : state.gate.ok ? 'Qualifies (' + (state.gate.set || '') + ' set, ' + state.gate.verdict.advisory.length + ' advisory). Convert builds walls, slabs, roof, cuts the openings and places the fills.'
        : state.gate.verdict ? 'Convert refused: qualify verdict blocked, ' + state.gate.verdict.blocking.length + ' blocking item(s).' : 'Convert refused: ' + state.gate.refused.length + ' sheet(s) or set rule(s) unresolved (roles come from DXF2BIM-MARK markings).') + '</div></div>';
    p.innerHTML = h;
    if (!state.panel) { document.body.appendChild(p); state.panel = p; }
    p.style.display = 'block';
    document.getElementById('dxf-close').onclick = function () { p.style.display = 'none'; };
    document.getElementById('dxf-convert').onclick = function () { convert().catch(function (e) { console.error(TAGC + ' failed ' + (e && e.message)); }); };
    var cb = document.getElementById('dxf-complete');
    var ev = document.getElementById('dxf-evidence'); if (ev) ev.onchange = function () { state.evidence = !!ev.checked; };   // read at Convert
    if (cb) cb.onchange = function () { state.complete = !!cb.checked; state.defaults = (state.defaults || []).filter(function (d) { return !/^synth\./.test(d.key); }); structureGate(); };
    document.getElementById('dxf-lines').onclick = function () { setLines(!state.linesOn); };
    document.getElementById('dxf-meta').onclick = function () { if (window.DxfMetaEditor) window.DxfMetaEditor.show(); };
    document.getElementById('dxf-arrange').onclick = function () { arrange().catch(function (e) { console.error(TAGA + ' failed ' + (e && e.stack || e)); }); }; setArrBtn();
    if (state.arr && state.arr.playing) p.classList.add('dxf-min');
    if (window.DxfMetaEditor && window.DxfMetaEditor.attention) window.DxfMetaEditor.attention();   // §L7.2 shiver while suggestions are unconfirmed
    setLines(state.linesOn);
  }
  function status(t) { var s = document.getElementById('dxf-status'); if (s) s.textContent = t; }

  // ---- import: File objects (the chooser) or {name,text} (tests) ----
  async function openFiles(files, how) {
    await loadScripts(); arrClear();
    var list = await Promise.all(Array.prototype.map.call(files, function (f) {
      return (typeof f.text === 'function' ? f.text() : Promise.resolve(f.text)).then(function (t) { return { name: f.name, text: t }; });
    }));
    list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    state.sheets = window.Dxf2BimImport.readSheets(list, { prepChoices: (window.DxfMetaEditor && window.DxfMetaEditor.defaultChoices && window.DxfMetaEditor.defaultChoices()) || {} });
    state.last = null; state.linesOn = true; state.setOverride = null;
    runPrep();
    await convertGate();
    state.sheets.forEach(function (s) {
      console.log(TAG + ' sheet=' + s.name + ' bytes=' + s.text.length + ' sha=' + s.sha.slice(0, 12) + ' marks=' + s.marks + ' role=' + (s.role || 'NONE') +
        (s.role === 'plan' ? ' level=' + s.level : s.role === 'elev' ? ' face=' + s.face : s.role === 'roof' ? ' roof=' + s.roofZ : ' why=' + s.why) + ' units=' + s.desc.units);
    });
    buildCanvas(state.sheets);
    renderPanel();
    if (window.DxfMetaEditor) window.DxfMetaEditor.load(state.sheets);   // §L4.1: every marking shown and editable; it re-judges through convertGate()
    if (how && how.chooser && state.arrangeOnOpen && window.DxfMetaEditor) arrange(state.arrangeOpts).catch(function (e) { console.error(TAGA + ' failed ' + (e && e.stack || e)); });   // §D34 play on open
    return { sheets: state.sheets.map(function (s) { return { name: s.name, role: s.role, why: s.why, level: s.level, face: s.face, roofZ: s.roofZ }; }), gate: state.gate };
  }

  // ---- convert: ONE gesture, ARC-seed form ----
  async function convert() {
    if (!state.sheets) throw new Error('no drawings open');
    var I = window.Dxf2BimImport;
    if (!state.gate || !state.gate.ok) { var gr = (state.gate && state.gate.refused) || [{ sheet: '(set)', reason: 'no gate' }]; console.log(TAGC + ' REFUSED ' + JSON.stringify(gr).slice(0, 600)); status('Convert refused: ' + gr.map(function (r) { return r.sheet + ' (' + r.reason + ')'; }).join('; ')); return { refused: gr }; }
    var t0 = performance.now();
    var lib = state.gate.lib, R = state.gate.R;   // the run the gate judged (qualifies): converted as judged, not re-run
    if (R.refused) { console.log(TAGC + ' REFUSED ' + JSON.stringify(R.refused)); status('Convert refused: ' + R.refused.map(function (r) { return r.sheet + ' (' + r.reason + ')'; }).join('; ')); return { refused: R.refused }; }
    var colorFor = window.ArcEditable && window.ArcEditable.colorFor ? function (c) { return window.ArcEditable.colorFor(c); } : null;
    if (R.frame && R.frame.error) { console.log(TAGC + ' REFUSED frame ' + JSON.stringify(R.frame.error)); status('Convert refused: @FRAME ' + R.frame.error.reason + ' (' + R.frame.error.sheet + ')'); return { refused: [R.frame.error] }; }
    var T = I.toOps(R, { colorFor: colorFor, frame: R.frame || null, evidenceColours: !!state.evidence });   // §L1.16: a wing set is turned back by its @FRAME
    if (R.frame) console.log(TAGC + ' wing frame angle=' + R.frame.angle + ' centre=' + R.frame.ox + ',' + R.frame.oy + ' (openings baked, bodies turned back)');
    var bad = T.skipped.filter(function (x) { return x.refuse; });
    if (bad.length) { console.log(TAGC + ' REFUSED body ' + JSON.stringify(bad)); status('Convert refused: an opening body does not add up (' + bad.length + ')'); return { refused: bad }; }
    T.skipped.forEach(function (x) { console.log(TAGC + ' void skipped storey=' + x.storey + ' openings=' + x.openings.join('+') + ' reason=' + x.reason); });
    var Lb = window.Bonsai.library, O = window.Bonsai.oplog;
    Lb.registerRealGeometry(T.assets.map(function (a) { return { hash: a.hash, v: a.v, f: a.f, bbox: a.bbox, anchorOffset: a.anchorOffset, uncut: a.uncut }; }));
    var db = await O._ensureDb();
    var mr = db.exec('SELECT COALESCE(MAX(id),0) FROM kernel_ops'), nextId = (mr.length ? Number(mr[0].values[0][0]) : 0) + 1;
    var ops = T.inserts.map(function (o) { return { op_type: o.op_type, params: o.params, outputGuid: o.outputGuid }; })
      .concat(T.cuts.map(function (c) { return { op_type: c.op_type, params: Object.assign({}, c.params, { parent: nextId + c.params.parent }), outputGuid: c.outputGuid }; }));
    console.log(TAGC + ' commit nextId=' + nextId + ' ops=' + ops.length + ' (inserts ' + T.inserts.length + ', cuts ' + T.cuts.length + ') oplog=' + O.length);
    var res = await O.commitGesture(ops);
    var okIds = res.ids.length === ops.length && res.ids.every(function (id, i) { return id === nextId + i; });
    if (!okIds) {   // the parent fids were predicted from KernelOps' contiguous ids; a mismatch would point cuts at the wrong bodies
      await O.undo();
      console.error(TAGC + ' REFUSED ids not contiguous from ' + nextId + ' got ' + JSON.stringify(res.ids.slice(0, 5)) + ' — undone');
      status('Convert refused: op ids not contiguous (undone)'); return { refused: [{ sheet: '(set)', reason: 'ids not contiguous' }] };
    }
    var byCS = {}; T.inserts.forEach(function (o) { var k = o.params.storey + '/' + o.params.ifc_class; byCS[k] = (byCS[k] || 0) + 1; });
    var fillNeed = R.ST.reduce(function (n, st) { return n + st.fills.gaps.filter(function (g) { return g.code === 'GAP:lod400_library_unreachable'; }).length; }, 0);
    var fillGaps = (R.fillGaps || []), nFills = (T.fills || []).length;
    var fid = {}; T.inserts.forEach(function (o, i) { fid[o.outputGuid] = res.ids[i]; });
    state.last = { run_id: R.run_id, ids: res.ids, gid: res.gid, nInserts: T.inserts.length, nCuts: T.cuts.length, fidByGuid: fid,
      groups: T.groups.map(function (g) { return Object.assign({}, g, { fid: res.ids[g.body] }); }), counts: byCS, fillsNeeded: fillNeed,
      fills: (T.fills || []).map(function (i) { return { fid: res.ids[i], guid: T.inserts[i].outputGuid }; }), fillGaps: fillGaps, library: lib ? lib.header : null, ms: Math.round(performance.now() - t0) };
    console.log(TAGC + ' counts=' + JSON.stringify(byCS) + ' inserts=' + T.inserts.length + ' cuts=' + T.cuts.length + ' bodies=' + T.groups.length + ' fills=' + nFills + ' run_id=' + R.run_id + ' gid=' + res.gid + ' verify=' + res.verify + ' ms=' + state.last.ms);
    if (fillNeed) console.error(TAGC + ' HARD-FAIL fills: GAP:lod400_library_unreachable x' + fillNeed + ' — no library (no local subset ' + LIB_URL + ', OCI unreachable: see §DXF-LIB); no fill placed, never a box');
    var placedH = {}; (T.fills || []).forEach(function (i) { placedH[T.inserts[i].params.storey + '|' + T.inserts[i].params.provenance.dxf_handle] = 1; });
    fillGaps.forEach(function (g) { if (placedH[g.storey + '|' + g.handle]) { console.warn(TAGC + ' fill gap ' + g.code + ' storey=' + g.storey + ' handle=' + g.handle + ' (fill placed; the gap stays in the verdict)'); return; }
      if (g.code !== 'GAP:lod400_library_unreachable') console.error(TAGC + ' HARD-FAIL fill ' + g.code + ' storey=' + g.storey + ' ' + g.kind + ' handle=' + g.handle + ' type=' + g.type_id + (g.element_ref ? ' product=' + g.element_ref : '') + (g.missing ? ' missing=' + g.missing.join(',') : '') + ' — not placed, never a box'); });
    status('Converted: ' + T.inserts.length + ' elements (' + nFills + ' door/window fills), ' + T.cuts.length + ' openings cut.' + (fillGaps.length ? ' Fills not placed: ' + fillGaps.length + (fillNeed ? ' (LOD400 library not reachable here).' : ' (named GAPs, see console).') : ''));
    setLines(false);
    if (window.Bonsai.frameSelection) window.Bonsai.frameSelection();
    return state.last;
  }

  // ---- §L3.3 the ONE convert gate (shared with the L4 metadata editor): roles R1-R5 -> the pipeline with the local library subset
  // -> Dxf2Qualify verdict on the run's own gaps. Convert is allowed only when roles pass AND the verdict qualifies. ----
  // §L7.12 STRUCTURE set: any sheet states a body kind (column, beam, ...). The wall/slab/roof pipeline is not run; Dxf2Bodies builds the bodies (plan footprint x elevation z range),
  // roles are judged as in the standard gate, every GAP:body_* is advisory (those bodies are left out, never defaulted), mixed sets are refused (stated).
  // §L7.12 STRUCTURE set: the judgement is the pure module dxf2structure.js (lane §L8); this only wires it to the page state.
  function isStructure(sheets) { return !!window.Dxf2Structure && window.Dxf2Structure.isStructure(sheets, window.Dxf2Bodies); }
  function structureGate() {
    var choices = (window.DxfMetaEditor && window.DxfMetaEditor.defaultChoices && window.DxfMetaEditor.defaultChoices()) || {};
    var out = window.Dxf2Structure.judge(state.sheets, { I: window.Dxf2BimImport, B: window.Dxf2Bodies, choices: choices, complete: state.complete ? {} : null, ref: state.ref || null, defaultsRef: state.defaultsRef || null }), g = out.gate;
    if (out.defaults.length) state.defaults = (state.defaults || []).concat(out.defaults);
    state.gate = g;
    console.log(TAG + ' ' + out.log);
    if (state.panel) renderPanel();
    return g;
  }
  async function convertGate() {
    if (isStructure(state.sheets)) return structureGate();
    var I = window.Dxf2BimImport, roles = I.gate(state.sheets, { set: state.setOverride });   // §L4.1: + the set the editor states (layer rules are @LAYER markings, §L4.2)
    var g = { ok: false, set: roles.set, setFrom: roles.setFrom, roles: roles, refused: roles.refused.slice(), verdict: null, R: null, lib: null };
    if (roles.ok) {
      g.lib = await loadLibrary(state.sheets);
      var R = I.convert(state.sheets, { library: g.lib || undefined, set: state.setOverride }); g.R = R;
      if (R.refused) g.refused = R.refused;
      else {
        g.verdict = R.verdict;
        if (R.verdict.verdict !== 'qualifies') g.refused = [{ sheet: '(set)', reason: 'qualify verdict blocked: ' + R.verdict.blocking.length + ' blocking ' + JSON.stringify(R.verdict.counts) }];
      }
    }
    // §L4.1: the pipeline did not run -> its gaps are unknown: the verdict still lists the markings / layers / units / dims / grid items + GAP:pipeline_not_run
    if (!g.verdict) g.verdict = I.qualifyNotRun(state.sheets, { set: g.set, why: g.refused.map(function (r) { return r.sheet + ': ' + r.reason; }).join('; ') });
    g.ok = g.refused.length === 0 && g.verdict.verdict === 'qualifies';
    state.gate = g;
    console.log(TAG + ' gate ok=' + g.ok + ' set=' + g.set + ' roles=' + roles.ok + (g.verdict ? ' verdict=' + g.verdict.verdict + ' blocking=' + g.verdict.blocking.length + ' advisory=' + g.verdict.advisory.length + ' counts=' + JSON.stringify(g.verdict.counts) : '') +
      (g.ok ? '' : ' refused=' + JSON.stringify(g.refused).slice(0, 500)));
    if (state.panel) renderPanel();
    return g;
  }

  // ---- §L3.2 / §L3.4: the LOD400 library. A LOCAL subset (git-ignored dxf2bim/local/, BIMCompiler scripts/export_library_subset.js)
  // overrides; else the library on OCI (export_library_subset.js --full: latest.json → index → only the shards the run's bound products
  // need). Unreachable → null → GAP:lod400_library_unreachable (no box). Log §DXF-LIB source=local|oci|none.
  var LIB_URL = 'dxf2bim/local/library_subset_duplex.json';
  var OCI_LIB = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/';
  var _ociMemo = {};   // url → parsed JSON (index and shards are immutable per name; latest.json is never memoised)
  async function fetchJson(u) {
    var r = await fetch(u, /latest\.json$/.test(u) ? { cache: 'no-store' } : undefined);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(u + ' HTTP ' + r.status);
    return r.json();
  }
  // §L7.8/L7.9 the pre-processor: a line-work ELEV/SECTION sheet had its closed rectangles synthesised by the reader (sheet.synth); the tolerance it applied is a default row
  // (yellow in the editor) unless the user chose it. Sheets the reader did not use it on emit nothing.
  function runPrep() {
    var P = window.Dxf2Prep; state.prep = {}; state.defaults = [];
    if (!P) return;
    var D = P.Defaults();
    state.sheets.forEach(function (s) {
      if (!s.synth) return;
      state.prep[s.name] = { segments: s.synth.segments, loops: s.synth.rects, nonRect: s.synth.nonRect, mixed: s.synth.mixed, tol: s.synth.tol };
      if (!D.rows().some(function (r) { return r.key === 'loops.snap_tol'; })) D.assume('loops.snap_tol', P.SNAP_TOL_DEFAULT, 'line ends closer than this are joined into one corner; the drawing does not state a tolerance (drawing units)', [0.001, 0.01, 0.1]);
      if (s.synth.chosen) D.override('loops.snap_tol', s.synth.tol);
      console.log('§DXF-PREP sheet=' + s.name + ' line-work segments=' + s.synth.segments + ' wall-rectangles=' + s.synth.rects + ' non-rect=' + s.synth.nonRect + ' mixed-layer=' + s.synth.mixed + ' snap_tol=' + s.synth.tol + (s.synth.chosen ? ' (chosen)' : ' (default)'));
    });
    state.defaults = D.rows();
  }
  async function loadLibrary(sheets) {
    try {
      var r = await fetch(LIB_URL, { cache: 'no-store' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) {   // (an offline SW answers HTML: not a subset)
        var L = window.Dxf2BimImport.librarySubset(await r.json());
        console.log('§DXF-LIB source=local sha=' + L.header.source.sha256.slice(0, 12) + ' url=' + LIB_URL + ' rows=' + JSON.stringify(L.header.counts) + ' meshes missing=' + L.missing.length + ' withheld=' + JSON.stringify(Object.keys(L.withheld)));
        return L;
      }
      console.log(TAGC + ' no local library subset (' + LIB_URL + ' HTTP ' + r.status + ') → OCI');
    } catch (e) { console.error('§DXF-LIB source=none reason=local subset unreadable: ' + (e && e.message)); return null; }
    try {
      var t0 = performance.now();
      var o = await window.Dxf2BimImport.loadOci(sheets, { base: OCI_LIB, fetchJson: fetchJson, memo: _ociMemo, convertOpts: { set: state.setOverride } });
      console.log('§DXF-LIB source=oci sha=' + o.sha.slice(0, 12) + ' shards=' + o.shards.length + ' families=' + o.families.length + ' passes=' + o.passes + ' ms=' + Math.round(performance.now() - t0));
      return o.library;
    } catch (e) { console.error('§DXF-LIB source=none reason=' + (e && e.message) + ' → GAP:lod400_library_unreachable, no fill placed, never a box'); return null; }
  }

  // ---- the chooser row's input (multiple .dxf) ----
  var inp = null;
  function pick() {
    if (!inp) {
      inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.dxf'; inp.id = 'm-open-dxf'; inp.style.display = 'none';
      inp.onchange = function () {
        var fs = inp.files ? Array.prototype.slice.call(inp.files) : [];
        console.log(TAG + ' chooser picked n=' + fs.length + ' ' + fs.map(function (f) { return f.name; }).join(','));
        if (fs.length) openFiles(fs, { chooser: true }).catch(function (e) { console.error(TAG + ' open failed ' + (e && e.message)); });
        inp.value = '';
      };
      document.body.appendChild(inp);
    }
    inp.click();
  }

  // §L4.1: the editor hands in the EFFECTIVE sheets (its markings), its layer rules and the set it states; the ONE gate re-judges them;
  // the canvas is rebuilt (camera kept) only when a role / placement / map changed
  var _gateSeq = 0;
  async function applySheets(sheets, setOverride) {
    var sig = function () { return JSON.stringify(state.sheets.map(function (s) { return [s.name, s.role, s.level, s.face, s.roofZ, s.cut, s.factor, s.desc && [s.desc.gridsX, s.desc.gridsY, s.desc.gridsH, s.desc.zs, s.desc.haxis]]; })) +
      JSON.stringify(state.sheets.map(function (s) { return s.desc && s.desc.layers || null; })) + (state.gate && state.gate.set); };
    var before = state.sheets ? sig() : null, seq = ++_gateSeq;
    state.sheets = sheets; state.setOverride = setOverride || null; runPrep();
    var g = await convertGate();
    if (seq === _gateSeq && sig() !== before) { console.log(TAG + ' canvas rebuilt from the edited markings'); buildCanvas(state.sheets, true); }
    if (seq === _gateSeq) arrSync();   // §D34 the Arrange view follows the accepted / typed values
    return g;
  }
  function holdGate(why) {   // markings changed, verdict pending: Convert off until the gate has re-judged
    if (state.gate) state.gate = Object.assign({}, state.gate, { ok: false });
    var b = document.getElementById('dxf-convert'); if (b) b.disabled = true; status(why);
  }

  window.DxfImportUI = { arrange: arrange, arrangeStop: arrangeStop, segs2d: segs2d, pick: pick, openFiles: openFiles, convert: convert, convertGate: convertGate, applySheets: applySheets, holdGate: holdGate, setLines: setLines, loadScripts: loadScripts, state: state, ICON: ICON };
  console.log(TAG + ' ui loaded');
})();
