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
  var V = '1';
  var SCRIPTS = ['lib/dxf-parser.js', 'dxf2bim/dxf2bim.js', 'dxf2bim/dxf2marks.js', 'dxf2bim/dxf2elev.js', 'dxf2bim/dxf2mesh.js',
    'dxf2bim/dxf2types.js', 'dxf2bim/dxf2shell.js', 'dxf2bim/dxf2shell_config.js', 'dxf2bim_import.js'];
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
    }, Promise.resolve()).then(function () { console.log(TAG + ' modules loaded n=' + SCRIPTS.length); return true; })
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
    alert: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>')
  };

  var state = { sheets: null, gate: null, group: null, panel: null, last: null, linesOn: true };
  var COL = { plan: 0x4fc3f7, elev: 0xffb74d, roof: 0x81c784, none: 0x8a8f99 };

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
  function mapsFor(role, Cf) { return role === 'plan' ? [Cf.MAP_PLAN] : role === 'elev' ? [Cf.MAP_ELEV, Cf.MAP_LEVL] : role === 'roof' ? [Cf.MAP_ROOF] : []; }
  function readLayer(Bm, maps, layer) { for (var i = 0; i < maps.length; i++) { var r = Bm.matchRule(layer, maps[i].rules); if (r && r.type !== 'ignore') return r.type; } return null; }
  function buildCanvas(sheets) {
    var THREE = window.THREE, A = window.A;
    if (!THREE || !A || !A.scene) { console.warn(TAG + ' canvas: no scene'); return null; }
    if (state.group) { A.scene.remove(state.group); state.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    var I = window.Dxf2BimImport, MK = window.Dxf2Marks, Cf = window.Dxf2ShellConfig, Bm = window.Dxf2Bim, Sh = window.Dxf2Shell;
    var g = new THREE.Group(); g.name = 'dxf-sheets'; g.userData.dxfSheets = true;
    state.canvas = {};
    var plans = sheets.filter(function (s) { return s.role === 'plan'; }).sort(function (a, b) { return a.level - b.level; });
    var env = null;
    if (plans.length) {   // the face planes: the lowest storey's outer wall envelope (Dxf2Shell.envelope of its plan pieces)
      try { var run = Bm.run(plans[0].text, Cf.MAP_PLAN, Cf.CFG, { DxfParser: window.DxfParser, hashHex: I.sha256Hex, library: [] });
        var ws = run.ops.filter(function (o) { return o.op_type === 'DXF_WALL' && o.params.rect; }); if (ws.length) env = Sh.envelope(ws); } catch (e) { console.warn(TAG + ' envelope failed ' + e.message); }
    }
    state.envelope = env;
    sheets.forEach(function (s) {
      var maps = mapsFor(s.role, Cf), k = s.factor || 1, z, w = null;
      if (s.role === 'plan' || s.role === 'roof') { z = s.role === 'plan' ? s.level : s.roofZ; w = function (x, y) { return [x * k, y * k, z]; }; }
      else if (s.role === 'elev' && plans.length && env) {
        var al = MK.align(plans[0].desc, s.desc, Cf.MARK_ALIGN_TOL);
        if (!al.map || !al.map.zOf) { console.warn(TAG + ' sheet=' + s.name + ' elevation does not align: not drawn ' + JSON.stringify(al.errors)); return; }
        var fc = { minX: env[0], minY: env[1], maxX: env[2], maxY: env[3] }[s.face], ax = al.map.axis;
        w = function (h, v) { var a = al.map.toPlan(h), zz = al.map.zOf(v); return ax === 'X' ? [a, fc, zz] : [fc, a, zz]; };
      } else { console.log(TAG + ' sheet=' + s.name + ' not drawn (role=' + (s.role || 'none') + ')'); return; }
      var bright = [], dim = [], skipped = {}, typeBox = {};
      s.dxf.entities.forEach(function (e) {
        var t = readLayer(Bm, maps, e.layer), sg = segs2d([e]);
        Object.keys(sg.skipped).forEach(function (q) { skipped[q] = (skipped[q] || 0) + sg.skipped[q]; });
        var P = t ? bright : dim;
        for (var i = 0; i < sg.s.length; i += 4) {
          var p0 = w(sg.s[i], sg.s[i + 1]), p1 = w(sg.s[i + 2], sg.s[i + 3]); P.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
          if (t) { var b = typeBox[t] || (typeBox[t] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
            [p0, p1].forEach(function (p) { for (var a = 0; a < 3; a++) { if (p[a] < b[a]) b[a] = p[a]; if (p[a] > b[a + 3]) b[a + 3] = p[a]; } }); }
        }
      });
      [[bright, 0.95], [dim, 0.16]].forEach(function (pair) {
        if (!pair[0].length) return;
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pair[0], 3));
        var ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL[s.role] || COL.none, transparent: true, opacity: pair[1], depthWrite: false }));
        ls.name = 'dxf:' + s.name + (pair[1] < 0.5 ? ':dim' : ''); ls.userData.dxfSheet = s.name; ls.renderOrder = 2; g.add(ls);
      });
      state.canvas[s.name] = { role: s.role, bright: bright.length / 6, dim: dim.length / 6, typeBox: typeBox, face: s.face || null };
      console.log(TAG + ' canvas sheet=' + s.name + ' role=' + s.role + ' segments read-layers=' + (bright.length / 6) + ' other=' + (dim.length / 6) + ' notDrawn=' + JSON.stringify(skipped) +
        ' box=' + JSON.stringify(Object.keys(typeBox).reduce(function (o, q) { o[q] = typeBox[q].map(function (v) { return Math.round(v * 1000) / 1000; }); return o; }, {})));
    });
    A.scene.add(g); state.group = g; g.visible = state.linesOn;
    frameObject(g);
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
    state.linesOn = !!on; if (state.group) state.group.visible = state.linesOn;
    var b = document.getElementById('dxf-lines'); if (b) b.innerHTML = (state.linesOn ? ICON.eye : ICON.eyeOff) + '<span>' + (state.linesOn ? 'Lines shown' : 'Lines hidden') + '</span>';
    if (window.A && window.A.requestRender) window.A.requestRender();
    console.log(TAG + ' lines visible=' + state.linesOn);
  }

  // ---- panel (#ins-panel pattern) ----
  function css() {
    if (document.getElementById('dxf-css')) return;
    var st = document.createElement('style'); st.id = 'dxf-css';
    st.textContent = '#dxf-panel{position:fixed;left:252px;top:60px;width:264px;background:#1b1d23;border:1px solid #2c303a;border-radius:10px;z-index:31;color:#c7cdd8;font:12px system-ui,sans-serif;overflow:hidden;transition:left .18s ease}' +
      'body.ol-collapsed #dxf-panel{left:12px}#dxf-panel .ip-head{display:flex;align-items:center;gap:8px;padding:10px 10px 9px;border-bottom:1px solid #23262e}' +
      '#dxf-panel .ip-title{font-size:10px;letter-spacing:.14em;color:#5b6473}#dxf-panel .dxf-x{margin-left:auto;background:transparent;border:0;color:#7f8aa0;cursor:pointer;padding:2px;display:inline-flex}' +
      '#dxf-body{max-height:300px;overflow:auto;padding:6px 8px 8px}.dxf-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}.dxf-row:hover{background:#23262e}' +
      '.dxf-row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dxf-role{font-size:9px;font-family:ui-monospace,monospace;border:1px solid #2c303a;border-radius:6px;padding:2px 6px;color:#9aa3b2}' +
      '.dxf-role.none{border-color:#7a3b3b;color:#f2a3a3}.dxf-ico{width:14px;height:14px;flex:0 0 auto;color:#7f8aa0}.dxf-why{font-size:10px;color:#f2a3a3;margin:0 8px 4px 30px}' +
      '#dxf-panel .ip-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #23262e}' +
      '.dxf-btn{display:inline-flex;align-items:center;gap:6px;background:#13151a;border:1px solid #2c303a;border-radius:8px;color:#c7cdd8;padding:6px 10px;cursor:pointer;font:inherit}' +
      '.dxf-btn:hover{background:#1b1f27}.dxf-btn.primary{background:#23364a;border-color:#3a6ea5;color:#cfe3f6}.dxf-btn:disabled{opacity:.45;cursor:not-allowed}' +
      '#dxf-status{width:100%;font-size:11px;color:#7f8aa0;line-height:1.4}';
    document.head.appendChild(st);
  }
  function roleChip(s) {
    if (!s.role) return '<span class="dxf-role none">NO ROLE</span>';
    if (s.role === 'plan') return '<span class="dxf-role">PLAN @' + s.level + '</span>';
    if (s.role === 'elev') return '<span class="dxf-role">ELEV ' + s.face + '</span>';
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
    });
    state.gate.refused.filter(function (r) { return r.sheet === '(set)'; }).forEach(function (r) { h += '<div class="dxf-why">' + esc(r.reason) + '</div>'; });
    h += '</div><div class="ip-foot"><button class="dxf-btn" id="dxf-lines"></button><button class="dxf-btn primary" id="dxf-convert"' + (state.gate.ok ? '' : ' disabled') + '>' + ICON.box + '<span>Convert</span></button>' +
      '<div id="dxf-status">' + (state.gate.ok ? 'Every sheet has a role. Convert builds walls, slabs, roof and cuts the openings.' : 'Convert refused: ' + state.gate.refused.length + ' sheet(s) or set rule(s) unresolved (roles come from DXF2BIM-MARK markings).') + '</div></div>';
    p.innerHTML = h;
    if (!state.panel) { document.body.appendChild(p); state.panel = p; }
    p.style.display = 'block';
    document.getElementById('dxf-close').onclick = function () { p.style.display = 'none'; };
    document.getElementById('dxf-convert').onclick = function () { convert().catch(function (e) { console.error(TAGC + ' failed ' + (e && e.message)); }); };
    document.getElementById('dxf-lines').onclick = function () { setLines(!state.linesOn); };
    setLines(state.linesOn);
  }
  function status(t) { var s = document.getElementById('dxf-status'); if (s) s.textContent = t; }

  // ---- import: File objects (the chooser) or {name,text} (tests) ----
  async function openFiles(files) {
    await loadScripts();
    var list = await Promise.all(Array.prototype.map.call(files, function (f) {
      return (typeof f.text === 'function' ? f.text() : Promise.resolve(f.text)).then(function (t) { return { name: f.name, text: t }; });
    }));
    list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    state.sheets = window.Dxf2BimImport.readSheets(list);
    state.gate = window.Dxf2BimImport.gate(state.sheets);
    state.last = null; state.linesOn = true;
    state.sheets.forEach(function (s) {
      console.log(TAG + ' sheet=' + s.name + ' bytes=' + s.text.length + ' sha=' + s.sha.slice(0, 12) + ' marks=' + s.marks + ' role=' + (s.role || 'NONE') +
        (s.role === 'plan' ? ' level=' + s.level : s.role === 'elev' ? ' face=' + s.face : s.role === 'roof' ? ' roof=' + s.roofZ : ' why=' + s.why) + ' units=' + s.desc.units);
    });
    console.log(TAG + ' gate ok=' + state.gate.ok + (state.gate.ok ? '' : ' refused=' + JSON.stringify(state.gate.refused)));
    buildCanvas(state.sheets);
    renderPanel();
    return { sheets: state.sheets.map(function (s) { return { name: s.name, role: s.role, why: s.why, level: s.level, face: s.face, roofZ: s.roofZ }; }), gate: state.gate };
  }

  // ---- convert: ONE gesture, ARC-seed form ----
  async function convert() {
    if (!state.sheets) throw new Error('no drawings open');
    var I = window.Dxf2BimImport;
    if (!state.gate.ok) { console.log(TAGC + ' REFUSED ' + JSON.stringify(state.gate.refused)); status('Convert refused: ' + state.gate.refused.map(function (r) { return r.sheet + ' (' + r.reason + ')'; }).join('; ')); return { refused: state.gate.refused }; }
    var t0 = performance.now();
    var lib = await loadLibrary();
    var R = I.convert(state.sheets, lib ? { library: lib } : {});
    if (R.refused) { console.log(TAGC + ' REFUSED ' + JSON.stringify(R.refused)); status('Convert refused: ' + R.refused.map(function (r) { return r.sheet + ' (' + r.reason + ')'; }).join('; ')); return { refused: R.refused }; }
    var colorFor = window.ArcEditable && window.ArcEditable.colorFor ? function (c) { return window.ArcEditable.colorFor(c); } : null;
    var T = I.toOps(R, { colorFor: colorFor });
    var bad = T.skipped.filter(function (x) { return x.refuse; });
    if (bad.length) { console.log(TAGC + ' REFUSED body ' + JSON.stringify(bad)); status('Convert refused: an opening body does not add up (' + bad.length + ')'); return { refused: bad }; }
    T.skipped.forEach(function (x) { console.log(TAGC + ' void skipped storey=' + x.storey + ' openings=' + x.openings.join('+') + ' reason=' + x.reason); });
    var Lb = window.Bonsai.library, O = window.Bonsai.oplog;
    Lb.registerRealGeometry(T.assets.map(function (a) { return { hash: a.hash, v: a.v, f: a.f, bbox: a.bbox, anchorOffset: a.anchorOffset, uncut: a.uncut }; }));
    var db = await O._ensureDb();
    var mr = db.exec('SELECT COALESCE(MAX(id),0) FROM kernel_ops'), nextId = (mr.length ? Number(mr[0].values[0][0]) : 0) + 1;
    var ops = T.inserts.map(function (o) { return { op_type: o.op_type, params: o.params, outputGuid: o.outputGuid }; })
      .concat(T.cuts.map(function (c) { return { op_type: c.op_type, params: Object.assign({}, c.params, { parent: nextId + c.params.parent }), outputGuid: c.outputGuid }; }));
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
    if (fillNeed) console.error(TAGC + ' HARD-FAIL fills: GAP:lod400_library_unreachable x' + fillNeed + ' — no local library subset (' + LIB_URL + ', generated by BIMCompiler scripts/export_library_subset.js); no fill placed, never a box');
    fillGaps.forEach(function (g) { if (g.code !== 'GAP:lod400_library_unreachable') console.error(TAGC + ' HARD-FAIL fill ' + g.code + ' storey=' + g.storey + ' ' + g.kind + ' handle=' + g.handle + ' type=' + g.type_id + (g.element_ref ? ' product=' + g.element_ref : '') + (g.missing ? ' missing=' + g.missing.join(',') : '') + ' — not placed, never a box'); });
    status('Converted: ' + T.inserts.length + ' elements (' + nFills + ' door/window fills), ' + T.cuts.length + ' openings cut.' + (fillGaps.length ? ' Fills not placed: ' + fillGaps.length + (fillNeed ? ' (LOD400 library not reachable here).' : ' (named GAPs, see console).') : ''));
    setLines(false);
    if (window.Bonsai.frameSelection) window.Bonsai.frameSelection();
    return state.last;
  }

  // ---- §L3.2: the LOCAL library subset (git-ignored; BIMCompiler scripts/export_library_subset.js). Absent → null → GAP:lod400_library_unreachable ----
  var LIB_URL = 'dxf2bim/local/library_subset_duplex.json';
  async function loadLibrary() {
    try {
      var r = await fetch(LIB_URL, { cache: 'no-store' });
      if (!r.ok) { console.log(TAGC + ' library subset not found (' + LIB_URL + ' HTTP ' + r.status + ')'); return null; }
      var L = window.Dxf2BimImport.librarySubset(await r.json());
      console.log(TAGC + ' library subset ' + LIB_URL + ' source=' + L.header.source.db + ' sha256=' + L.header.source.sha256.slice(0, 12) + ' rows=' + JSON.stringify(L.header.counts) + ' meshes missing=' + L.missing.length + ' withheld=' + JSON.stringify(Object.keys(L.withheld)));
      return L;
    } catch (e) { console.error(TAGC + ' library subset unreadable: ' + (e && e.message)); return null; }
  }

  // ---- the chooser row's input (multiple .dxf) ----
  var inp = null;
  function pick() {
    if (!inp) {
      inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.dxf'; inp.id = 'm-open-dxf'; inp.style.display = 'none';
      inp.onchange = function () {
        var fs = inp.files ? Array.prototype.slice.call(inp.files) : [];
        console.log(TAG + ' chooser picked n=' + fs.length + ' ' + fs.map(function (f) { return f.name; }).join(','));
        if (fs.length) openFiles(fs).catch(function (e) { console.error(TAG + ' open failed ' + (e && e.message)); });
        inp.value = '';
      };
      document.body.appendChild(inp);
    }
    inp.click();
  }

  window.DxfImportUI = { pick: pick, openFiles: openFiles, convert: convert, setLines: setLines, loadScripts: loadScripts, state: state, ICON: ICON };
  console.log(TAG + ' ui loaded');
})();
