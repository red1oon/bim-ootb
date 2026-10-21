/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — the 2D wand: a Section Cut mode "2D" (prompts/DXF2BIM_FOUNDATION_LANE.md F7). Read the log after every run.
// A vertical PLANE with two draggable EDGES stands on the model and cuts nothing. Drag the plane onto a wing; drag an edge to turn it (full 360 deg, snapping to the wall
// directions the model really has); its facing side is the sheet's UP. The `2D` button writes that wing's layout (Std2d.writeStdSet via the Modeller's DxfExportUI.make, from the
// building's own `_2d.db` sidecar, fetched on the first press, never at load), shows it as an overlay, click = fill the canvas, Save = a zip of the marked sheets, Close = nothing
// saved; the plane stays where it was. The gesture is ops: WING_PLANE (on release) and EXPORT_2D (on save) through KernelOps + UniversalHistory.
// Log tags: §WING2D_ENTER §WING2D_PLANE §WING2D_SIDECAR §WING2D_EXPORT §WING2D_OVERLAY §WING2D_SAVE §WING2D_CLOSE §WING2D_OFFER
var _WING2D_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || (typeof location !== 'undefined' ? location.href : '');
function setupWing2D(A) {
  'use strict';
  var TAG = '§WING2D', SNAP_DEG = 3, FAM_TOL = 1;
  var _base = _WING2D_SRC;
  var S = { on: false, p0: null, p1: null, z0: 0, z1: 10, g: null, parts: {}, drag: null, side: null, sideLoading: null, fam: [], walls: [], gizmoSig: '', tools: null, last: null };
  var ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path d="M7 17V7h10"/></svg>';
  function log(m) { console.log(TAG + m); }
  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt !== undefined) e.textContent = txt; return e; }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = new URL(src, _base).href; s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s);
    });
  }
  function q1(sql) { try { var r = A.db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } }
  function rows(db, sql) { var r = db.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }

  // ---- the offer rule: more than 2 storeys, or more than one block (more than one wall family: known only once the sidecar is read) ----
  function storeyCount() {
    if (!A.db) return 0; if (A._w2dStoreys && A._w2dStoreys.db === A.db) return A._w2dStoreys.n;
    var n = (q1("SELECT count(*) FROM spatial_structure WHERE type='IfcBuildingStorey'")[0] || [0])[0] || 0; A._w2dStoreys = { db: A.db, n: n }; return n;
  }
  function offered() {
    var force = /[?&]wing2d=1\b/.test(location.search), ok = !!(A.db && (force || storeyCount() > 2));
    if (A._w2dLastOffer !== ok) { A._w2dLastOffer = ok; log('_OFFER ok=' + ok + ' storeys=' + storeyCount() + (force ? ' forced' : '') + ' (rule: more than 2 storeys, or more than one block)'); }
    return ok;
  }

  // ---- the sidecar: the building's `<name>_2d.db`, on its own (the writer's whole input from one extraction) ----
  function sidecarUrl() {
    var u = A.DB_URL || ''; var p = new URLSearchParams(location.search).get('db2d'); if (p) return p;
    if (/_extracted\.db$/.test(u)) return u.replace(/_extracted\.db$/, '_2d.db'); return u.replace(/\.db$/, '_2d.db');
  }
  function loadSide() {
    if (S.side) return Promise.resolve(S.side); if (S.sideLoading) return S.sideLoading;
    var url = sidecarUrl(), t0 = performance.now();
    S.sideLoading = fetch(url).then(function (r) { if (!r.ok) throw new Error('no 2D sidecar for this building (' + r.status + ' ' + url + ')'); return r.arrayBuffer(); })
      .then(function (buf) {
        var db = new A.db.constructor(new Uint8Array(buf)); log('_SIDECAR url=' + url + ' bytes=' + buf.byteLength + ' ms=' + Math.round(performance.now() - t0)); return loadModules().then(function () { S.side = db; analyse(); return db; });
      }).catch(function (e) { S.sideLoading = null; throw e; });
    return S.sideLoading;
  }
  var _mods = null;
  function loadModules() {
    if (_mods) return _mods;
    var t0 = performance.now();
    _mods = loadScript('../modeller/dxf_export_ui.js?v=1').then(function () { return window.DxfExportUI.loadScripts(); }).then(function () { return window.DxfSheetView || loadScript('dxf_sheet_view.js?v=1'); })
      .then(function () { log('_MODULES ms=' + Math.round(performance.now() - t0)); }).catch(function (e) { _mods = null; throw e; });
    return _mods;
  }
  function qOf(db) { return function (sql) { return rows(db, sql); }; }
  function angDiff90(a, b) { var d = Math.abs(a - b) % 90; return Math.min(d, 90 - d); }
  function analyse() {   // the wall directions (mod 90) of the model, for snapping and the live count
    var t0 = performance.now(), Sd = window.Std2d, m = Sd.loadModel(qOf(S.side), { add: function () {}, gap: function () {} });
    S.walls = m.walls.map(function (w) { var a = Sd.elementAngle(w); return a && a.q >= 0.5 ? a.deg : null; }).filter(function (v) { return v !== null; });
    S.fam = Sd.wingAngles(m); log('_SIDECAR walls=' + S.walls.length + ' families=' + JSON.stringify(S.fam) + ' analyse_ms=' + Math.round(performance.now() - t0));
    refreshTools();
  }
  function framedCount(turn) { var b = ((turn % 90) + 90) % 90; return S.walls.filter(function (d) { return angDiff90(d, b) <= FAM_TOL; }).length; }
  function snapTurn(turn) {   // nearest family direction (any quarter turn) within SNAP_DEG, else the free angle
    var best = null; S.fam.forEach(function (f) { for (var k = 0; k < 4; k++) { var c = f.deg + 90 * k, d = Math.abs(((turn - c + 540) % 360) - 180); if (d <= SNAP_DEG && (best === null || d < best.d)) best = { c: c, d: d }; } });
    return best ? best.c % 360 : turn;
  }

  // ---- the plane: P0 / P1 in IFC plan metres; up = the left of P0 -> P1; the angle is the direction of P0 -> P1 (0..360) ----
  function geom() { var dx = S.p1[0] - S.p0[0], dy = S.p1[1] - S.p0[1], L = Math.hypot(dx, dy) || 1e-9, turn = ((Math.atan2(dy, dx) * 180 / Math.PI) % 360 + 360) % 360; return { L: L, turn: turn, mid: [(S.p0[0] + S.p1[0]) / 2, (S.p0[1] + S.p1[1]) / 2], up: [-dy / L, dx / L] }; }
  function three(ix, iy, iz) { return A.ifc2three(ix, iy, iz); }
  function buildGizmo() {
    if (S.g) return; var T = window.THREE, g = new T.Group(); g.name = 'wing2d'; g.renderOrder = 999;
    var mat = function (c, o) { return new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: T.DoubleSide }); };
    var plane = new T.Mesh(new T.PlaneGeometry(1, 1), mat(0x4fc3f7, 0.16)); plane.name = 'plane'; g.add(plane);
    var edge = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1)), new T.LineBasicMaterial({ color: 0x4fc3f7, depthTest: false })); edge.name = 'edges'; plane.add(edge);
    var h0 = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat(0xffd54f, 0.9)), h1 = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat(0xffd54f, 0.9)); h0.name = 'h0'; h1.name = 'h1'; g.add(h0, h1);
    var arrow = new T.ArrowHelper(new T.Vector3(0, 0, 1), new T.Vector3(0, 0, 0), 1, 0x4fc3f7, 0.25, 0.15); arrow.name = 'up'; arrow.traverse(function (o) { if (o.material) { o.material.depthTest = false; } o.renderOrder = 999; }); g.add(arrow);
    // §F7 W-WAND-BOX: the depth handle (green) + the box footprint on the plane's base: the 2D is clipped to the box (plane length x depth)
    var hd = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat(0x81c784, 0.95)); hd.name = 'hd'; g.add(hd);
    var fg = new T.BufferGeometry(); fg.setAttribute('position', new T.BufferAttribute(new Float32Array(18), 3)); var foot = new T.Mesh(fg, mat(0x81c784, 0.22)); foot.name = 'foot'; g.add(foot);
    var fl = new T.LineLoop(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3)), new T.LineBasicMaterial({ color: 0x81c784, depthTest: false })); fl.name = 'footline'; g.add(fl);
    S.parts = { plane: plane, h0: h0, h1: h1, arrow: arrow, hd: hd, foot: foot, footline: fl }; S.g = g; A.scene.add(g);
  }
  function updateGizmo() {
    if (!S.g) return; var T = window.THREE, G = geom(), a = three(S.p0[0], S.p0[1], S.z0), b = three(S.p1[0], S.p1[1], S.z0), H = S.z1 - S.z0;
    var c = three(G.mid[0], G.mid[1], (S.z0 + S.z1) / 2), p = S.parts.plane;
    p.position.set(c.x, c.y, c.z); p.scale.set(G.L, H, 1);
    p.rotation.set(0, 0, 0); p.rotation.y = Math.atan2(-(b.z - a.z), (b.x - a.x));   // the plane's width axis (local +X) turned about the vertical onto P0 -> P1 in three space (x east, z = -north)
    var hw = Math.max(0.25, Math.min(1.2, G.L * 0.02));
    [[S.parts.h0, a], [S.parts.h1, b]].forEach(function (pr) { pr[0].position.set(pr[1].x, c.y, pr[1].z); pr[0].scale.set(hw, H, hw); });
    var up = three(G.mid[0] + G.up[0] * 3, G.mid[1] + G.up[1] * 3, (S.z0 + S.z1) / 2); S.parts.arrow.position.set(c.x, c.y, c.z);
    S.parts.arrow.setDirection(new T.Vector3(up.x - c.x, 0, up.z - c.z).normalize()); S.parts.arrow.setLength(3, 0.8, 0.5);
    var dd = S.depth || 0, hp = three(G.mid[0] + G.up[0] * (dd || 4), G.mid[1] + G.up[1] * (dd || 4), (S.z0 + S.z1) / 2); S.parts.hd.position.set(hp.x, hp.y, hp.z); S.parts.hd.scale.set(hw * 1.6, hw * 1.6, hw * 1.6);
    var q = [S.p0, S.p1, [S.p1[0] + G.up[0] * dd, S.p1[1] + G.up[1] * dd], [S.p0[0] + G.up[0] * dd, S.p0[1] + G.up[1] * dd]].map(function (v) { return three(v[0], v[1], S.z0 + 0.05); });
    var fp = S.parts.foot.geometry.attributes.position, ix = [0, 1, 2, 0, 2, 3]; ix.forEach(function (k, i) { fp.setXYZ(i, q[k].x, q[k].y, q[k].z); }); fp.needsUpdate = true;
    var lp = S.parts.footline.geometry.attributes.position; q.forEach(function (v, i) { lp.setXYZ(i, v.x, v.y, v.z); }); lp.needsUpdate = true;
    S.parts.foot.visible = S.parts.footline.visible = dd > 0;
    if (A.markDirty) A.markDirty();
  }
  function initPlane() {
    var r = q1("SELECT min(t.center_x),max(t.center_x),min(t.center_y),max(t.center_y),min(t.center_z),max(t.center_z) FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcSlab')")[0];
    if (!r || r[0] === null) r = [-10, 10, -10, 10, 0, 10];
    S.p0 = [r[0], r[2] - 2]; S.p1 = [r[1], r[2] - 2]; S.z0 = r[4] - 1; S.z1 = r[5] + 2; S.bb = [r[0], r[1], r[2], r[3], r[4], r[5]];
  }

  // ---- pointer: drag the plane (body) or an edge handle; OrbitControls is parked while a drag runs ----
  function ndc(e) { var b = A.canvas.getBoundingClientRect(); return { x: ((e.clientX - b.left) / b.width) * 2 - 1, y: -((e.clientY - b.top) / b.height) * 2 + 1 }; }
  function hitGround(e) {
    var T = window.THREE, rc = new T.Raycaster(), n = ndc(e); rc.setFromCamera(new T.Vector2(n.x, n.y), A.camera);
    var c = three(0, 0, (S.z0 + S.z1) / 2), pl = new T.Plane(new T.Vector3(0, 1, 0), -c.y), pt = new T.Vector3();
    if (!rc.ray.intersectPlane(pl, pt)) return null; var i = A.three2ifc(pt.x, pt.y, pt.z); return [i.ix, i.iy];
  }
  function pick(e) {
    var T = window.THREE, rc = new T.Raycaster(), n = ndc(e); rc.setFromCamera(new T.Vector2(n.x, n.y), A.camera);
    var hit = rc.intersectObjects([S.parts.hd, S.parts.h0, S.parts.h1, S.parts.plane], false)[0]; return hit ? hit.object.name : null;
  }
  function onDown(e) {
    if (!S.on || e.button !== 0) return; var what = pick(e); if (!what) return;
    var g = hitGround(e); if (!g) return; e.stopPropagation(); e.preventDefault();
    S.drag = { what: what, g0: g, p0: S.p0.slice(), p1: S.p1.slice(), depth: S.depth || 0 }; if (A.controls) A.controls.enabled = false;
    try { A.canvas.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function onMove(e) {
    if (!S.on) return;
    if (!S.drag) { A.canvas.style.cursor = pick(e) ? 'grab' : ''; return; }
    var g = hitGround(e); if (!g) return; var D = S.drag, dx = g[0] - D.g0[0], dy = g[1] - D.g0[1];
    if (D.what === 'plane') { S.p0 = [D.p0[0] + dx, D.p0[1] + dy]; S.p1 = [D.p1[0] + dx, D.p1[1] + dy]; }
    else if (D.what === 'hd') { var G0 = geom(), d = (g[0] - G0.mid[0]) * G0.up[0] + (g[1] - G0.mid[1]) * G0.up[1]; S.depth = d < 1 ? 0 : d; }   // under 1 m = no depth (unbounded across the plane)
    else {
      var fixed = D.what === 'h1' ? D.p0 : D.p1, mv = [(D.what === 'h1' ? D.p1[0] : D.p0[0]) + dx, (D.what === 'h1' ? D.p1[1] : D.p0[1]) + dy];
      var vx = mv[0] - fixed[0], vy = mv[1] - fixed[1], L = Math.hypot(vx, vy); if (L < 0.5) return;
      var th = ((Math.atan2(vy, vx) * 180 / Math.PI) % 360 + 360) % 360, sn = D.what === 'h1' ? snapTurn(th) : snapTurn((th + 180) % 360);
      if (D.what === 'h0') sn = (sn + 180) % 360;   // P0 -> P1 direction is the reverse of fixed -> P0
      var r = sn * Math.PI / 180; mv = [fixed[0] + L * Math.cos(r), fixed[1] + L * Math.sin(r)];
      if (D.what === 'h1') { S.p0 = fixed.slice(); S.p1 = mv; } else { S.p1 = fixed.slice(); S.p0 = [fixed[0] - L * Math.cos(r), fixed[1] - L * Math.sin(r)]; }
    }
    updateGizmo(); refreshTools();
  }
  function onUp(e) {
    if (!S.drag) return; var D = S.drag; S.drag = null; if (A.controls) A.controls.enabled = true; try { A.canvas.releasePointerCapture(e.pointerId); } catch (x) {}
    commitPlane(D.what);
  }
  function planeParams() { var G = geom(); return { turn: Number(G.turn.toFixed(4)), pivot: [Number(G.mid[0].toFixed(4)), Number(G.mid[1].toFixed(4))], length: Number(G.L.toFixed(3)), p0: S.p0.map(function (v) { return Number(v.toFixed(4)); }), p1: S.p1.map(function (v) { return Number(v.toFixed(4)); }), z: [Number(S.z0.toFixed(3)), Number(S.z1.toFixed(3))], depth: Number((S.depth || 0).toFixed(3)) }; }
  function commitPlane(how) {
    var P = planeParams(); S.last = P; log('_PLANE how=' + how + ' turn=' + P.turn + ' pivot=' + JSON.stringify(P.pivot) + ' length=' + P.length + ' depth=' + P.depth + ' framed=' + framedCount(P.turn));
    try { if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'WING_PLANE', P); } catch (e) { log('_PLANE op failed ' + e.message); }
    try { if (window.UniversalHistory && UniversalHistory.recordEvent) UniversalHistory.recordEvent('WING_PLANE', 'Wing plane ' + P.turn.toFixed(1) + '°', P); } catch (e) { }
  }

  // ---- the panel tools (inside the Section Cut panel) ----
  function refreshTools() {
    if (!S.tools) return; var G = S.p0 ? geom() : null, st = S.tools.querySelector('#wing-2d-state');
    st.textContent = G ? G.turn.toFixed(1) + '° · ' + G.L.toFixed(1) + ' m' + (S.depth ? ' × ' + S.depth.toFixed(1) + ' m' : '') + ' · ' + (S.side ? framedCount(G.turn) + ' walls framed' : 'reading walls…') : '';
  }
  function buildTools(show) {
    var panel = document.getElementById('section-slider-panel'); if (!panel) return;
    if (!S.tools) {
      var t = el('div', 'margin-top:6px;display:flex;flex-direction:column;gap:6px'); t.id = 'wing-2d-tools';
      t.appendChild(el('div', 'font-size:11px;color:#ccc', 'Drag the plane onto a wing; drag an edge to turn it; drag the green handle to set how deep the box reaches. Nothing is cut.'));
      var row = el('div', 'display:flex;gap:6px;align-items:center'), b = el('button', 'background:#4fc3f7;color:#000;border:1px solid #666;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px'); b.id = 'wing-2d-btn'; b.innerHTML = ICON + ' 2D'; b.title = 'Draw this wing as a 2D layout'; b.onclick = function () { A.wing2dExport(); };
      var st = el('span', 'font-size:11px;color:#9ad;white-space:nowrap'); st.id = 'wing-2d-state'; row.appendChild(b); row.appendChild(st); t.appendChild(row);
      var msg = el('div', 'font-size:11px;color:#f90;display:none'); msg.id = 'wing-2d-msg'; t.appendChild(msg); panel.appendChild(t); S.tools = t;
    }
    S.tools.style.display = show ? 'flex' : 'none';
  }
  function say(m) { var e = document.getElementById('wing-2d-msg'); if (e) { e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; } if (m) log('_MSG ' + m); }

  // true north from the Viewer's own db (the georef the extractor wrote or `buildings/patches/<name>.sql` injected at load: project_metadata true_north_angle + true_north_source);
  // null = the building has none, and the sheet says "north not stated" instead of drawing a guess
  function georefNorth() {
    var m = {}; q1("SELECT key,value FROM project_metadata WHERE key IN ('true_north_angle','true_north_source')").forEach(function (r) { m[r[0]] = r[1]; });
    var a = parseFloat(m.true_north_angle); if (!isFinite(a) || !m.true_north_source) { log('_NORTH none in the Viewer db (' + JSON.stringify(m) + ')'); S.north = null; return null; }
    log('_NORTH angle=' + a + ' source=' + m.true_north_source); S.north = { angle: a, source: m.true_north_source }; return S.north;
  }
  // ---- export + overlay ----

  // where the building stands on the screen (its 8 bound corners projected), and the corner of the canvas where the card rests: the one that covers the least of the building and of
  // the Section Cut panel (a person must see the model and the layout side by side: the layout is projected OUT of the building area)
  function buildingRect() {
    try {
      if (!S.bb) return null; var b = S.bb, cv = A.canvas.getBoundingClientRect(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      [b[0], b[1]].forEach(function (x) { [b[2], b[3]].forEach(function (y) { [b[4], b[5]].forEach(function (z) {
        var c = three(x, y, z), v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera), px = cv.left + (v.x * 0.5 + 0.5) * cv.width, py = cv.top + (-v.y * 0.5 + 0.5) * cv.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }); }); });
      return { x0: x0, y0: y0, x1: x1, y1: y1 };
    } catch (e) { return null; }
  }
  function overlap(a, b) { var w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h : 0; }
  function restRect(w, h) {
    var cv = A.canvas.getBoundingClientRect(), m = 16, bld = buildingRect(), pn = document.getElementById('section-slider-panel'), pr = pn && pn.offsetParent !== null ? pn.getBoundingClientRect() : null;
    var obst = [bld, pr && { x0: pr.left, y0: pr.top, x1: pr.right, y1: pr.bottom }].filter(Boolean), best = null;
    [['br', cv.right - w - m, cv.bottom - h - 70], ['bl', cv.left + m, cv.bottom - h - 70], ['tl', cv.left + m, cv.top + m], ['tr', cv.right - w - m, cv.top + m]].forEach(function (c) {
      var r = { x0: c[1], y0: c[2], x1: c[1] + w, y1: c[2] + h }, sc = obst.reduce(function (a, o) { return a + overlap(r, o); }, 0);
      if (!best || sc < best.sc) best = { sc: sc, name: c[0], x0: r.x0, y0: r.y0, w: w, h: h };
    });
    return best;
  }
  var OV = null;
  function prefixOf() { var n = (A.activeBuilding || (new URLSearchParams(location.search).get('db') || 'MODEL').split('/').pop()).replace(/_extracted\.db$|\.db$/i, ''); return n.split(/[_\s.-]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MODEL'; }
  A.wing2dExport = function () {
    if (!S.p0) return Promise.resolve(null); say(''); var P = planeParams(), t0 = performance.now(), b = document.getElementById('wing-2d-btn'); if (b) b.disabled = true;
    return loadSide().then(function () { return loadModules(); }).then(function () {
      var bin = (S.fam.filter(function (f) { return angDiff90(f.deg, P.turn) <= FAM_TOL; })[0] || {}).deg;
      if (bin === undefined) throw new Error('No wall of this model runs along ' + P.turn.toFixed(1) + '° (families: ' + S.fam.map(function (f) { return f.deg + '°'; }).join(', ') + '). Drag the edge onto a wall direction.');
      var wing = { name: 'W' + Math.round(P.turn), angle: bin, turn: P.turn, pivot: P.pivot }, M = window.DxfExportUI.make(qOf(S.side), prefixOf(), null, null, wing, georefNorth(), { scaleBar: true, sectionAt: 'pivot', extent: [P.p0, P.p1], depth: P.depth || undefined });
      if (!M.R.wing) throw new Error('This plane frames no walls.');
      log('_EXPORT turn=' + P.turn + ' bin=' + bin + ' box=' + (((M.R.log || []).filter(function (l) { return /§EXTENT/.test(l); })[0]) || '-').replace(/^§EXTENT /, '') + ' sheets=' + Object.keys(M.R.files).length + ' gaps=' + M.R.gaps.length + ' drawable=' + M.report.drawable + ' ms=' + Math.round(performance.now() - t0));
      showOverlay(M, P, wing);
    }).catch(function (e) { say(e.message); log('_EXPORT_FAIL ' + e.message); }).then(function () { if (b) b.disabled = false; });
  };
  // the elevation that faces the plane (owner 2026-10-21): in the sheet frame the plane lies along X at the pivot's Y; FRONT = the writer's y0 face, REAR = y1
  function facingFace(R) {
    var w = R && R.model && R.model.walls, oy = R && R.wing && R.wing.oy; if (!w || !w.length || typeof oy !== 'number') return null;
    var y0 = Infinity, y1 = -Infinity; w.forEach(function (a) { y0 = Math.min(y0, a.y0); y1 = Math.max(y1, a.y1); });
    var f = oy < (y0 + y1) / 2 ? 'FRONT' : 'REAR'; log('_FACE face=' + f + ' plane_y=' + oy.toFixed(3) + ' walls_y=' + y0.toFixed(3) + '..' + y1.toFixed(3)); return f;
  }
  function showOverlay(M, P, wing) {
    closeOverlay(true, true); var V = window.DxfSheetView, names = Object.keys(M.R.files).sort(), fc = facingFace(M.R), pick = function (v) { return names.filter(function (n) { return n.slice(-('_' + v + '_std.dxf').length) === '_' + v + '_std.dxf'; })[0]; }, cur = pick('PLANE_VIEW') || (fc && pick(fc)) || names[0], view = null, drag = null;
    var card = el('div', 'position:fixed;z-index:70;background:#14171c;border:1px solid #4fc3f7;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.55);overflow:hidden;font:12px sans-serif;color:#ddd;transition:left .3s cubic-bezier(.2,.8,.2,1),top .3s cubic-bezier(.2,.8,.2,1),width .3s cubic-bezier(.2,.8,.2,1),height .3s cubic-bezier(.2,.8,.2,1),opacity .2s;touch-action:none'); card.id = 'wing-2d-overlay';
    var head = el('div', 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1d242d;user-select:none'), tabs = el('div', 'display:flex;gap:4px;flex:1;overflow:auto');
    var save = el('button', 'background:#2e7d32;color:#fff;border:0;border-radius:4px;padding:3px 10px;cursor:pointer', 'Save'), close = el('button', 'background:#555;color:#fff;border:0;border-radius:4px;padding:3px 10px;cursor:pointer', 'Cancel');
    save.id = 'wing-2d-save'; close.id = 'wing-2d-close'; head.appendChild(tabs); head.appendChild(save); head.appendChild(close);
    var cv = document.createElement('canvas'); cv.style.cssText = 'display:block;width:100%;flex:1;cursor:zoom-in'; cv.id = 'wing-2d-canvas';
    var foot = el('div', 'padding:3px 8px;background:#1d242d;color:#9ab;font-size:11px'); foot.id = 'wing-2d-foot';
    foot.textContent = M.R.gaps.length + ' writer gap(s) · ' + names.length + ' sheets · turn ' + P.turn.toFixed(1) + '° · pivot ' + P.pivot.join(', ') + ' · click the drawing to fill the canvas';
    card.style.display = 'flex'; card.style.flexDirection = 'column'; card.appendChild(head); card.appendChild(cv); card.appendChild(foot); document.body.appendChild(card);
    var big = false, small = (function () { var cw = A.canvas.getBoundingClientRect().width, w = Math.round(Math.min(380, cw * 0.6)); return { w: w, h: Math.round(w * 0.74) }; })();   // a phone gets a smaller card
    function place() {
      var b = A.canvas.getBoundingClientRect();
      if (big) { card.style.left = b.left + 'px'; card.style.top = b.top + 'px'; card.style.width = b.width + 'px'; card.style.height = b.height + 'px'; cv.style.cursor = 'grab'; }
      else { var rr = restRect(small.w, small.h); card.__rest = rr; card.style.left = rr.x0 + 'px'; card.style.top = rr.y0 + 'px'; card.style.width = small.w + 'px'; card.style.height = small.h + 'px'; cv.style.cursor = 'zoom-in'; }
    }
    function draw() {
      if (!card.isConnected || cv.getBoundingClientRect().width < 60 || cv.getBoundingClientRect().height < 60) return;   // removed, or still a few px wide mid-flight: nothing to draw yet
      var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height)); cv.width = w * dpr; cv.height = h * dpr;
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); var D = V.toDrawList(V.parse(M.R.files[cur])), bb = V.bounds(D.list); if (!bb) return; if (!view || view.cur !== cur) view = Object.assign(V.fit(bb, w, h), { cur: cur, bb: bb });
      V.paintCanvas(ctx, D.list, view, w, h); card.__drawn = { sheet: cur, entities: D.list.length, stats: D.stats };
    }
    function tabsRender() { tabs.innerHTML = ''; names.forEach(function (n) { var t = el('button', 'background:' + (n === cur ? '#4fc3f7' : '#333') + ';color:' + (n === cur ? '#000' : '#ddd') + ';border:0;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:11px;white-space:nowrap', n.replace(/^[^_]*_/, '').replace(/_std\.dxf$/, '')); t.onclick = function (e) { e.stopPropagation(); cur = n; view = null; tabsRender(); draw(); }; tabs.appendChild(t); }); }
    cv.addEventListener('click', function () { if (!big && !drag) { big = true; place(); view = null; setTimeout(draw, 380); log('_OVERLAY expand sheet=' + cur); } });
    cv.addEventListener('wheel', function (e) { if (!big) return; e.preventDefault(); var f = e.deltaY < 0 ? 1.15 : 1 / 1.15, r = cv.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2, wx = view.cx + mx / view.s, wy = view.cy - my / view.s; view.s *= f; view.cx = wx - mx / view.s; view.cy = wy + my / view.s; draw(); }, { passive: false });
    cv.addEventListener('pointerdown', function (e) { if (!big) return; drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.cx = drag.cx - dx / view.s; view.cy = drag.cy + dy / view.s; draw(); });
    cv.addEventListener('pointerup', function () { setTimeout(function () { drag = null; }, 0); });
    ['mousedown', 'dblclick', 'contextmenu', 'touchstart'].forEach(function (n) { card.addEventListener(n, function (e) { e.stopPropagation(); }); });
    save.onclick = function () { doSave(M, P, wing); }; close.onclick = function () { closeOverlay(false); };
    var from = projectPlane(); if (from) { card.style.left = from.x + 'px'; card.style.top = from.y + 'px'; card.style.width = '10px'; card.style.height = '10px'; card.style.opacity = '0'; requestAnimationFrame(function () { card.style.opacity = '1'; place(); setTimeout(draw, 380); }); } else { place(); draw(); }
    tabsRender(); OV = { card: card, M: M, P: P, redraw: draw, state: function () { var r = card.getBoundingClientRect(); return { big: big, sheet: cur, view: view, drawn: card.__drawn, rect: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }, rest: card.__rest && card.__rest.name, building: buildingRect(), overlapBuilding: big ? null : overlap({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }, buildingRect() || { x0: 0, y0: 0, x1: 0, y1: 0 }) }; } }; window.addEventListener('resize', place); OV.place = place;
    log('_OVERLAY shown sheets=' + names.length);
  }
  function projectPlane() { try { var G = geom(), c = three(G.mid[0], G.mid[1], (S.z0 + S.z1) / 2), v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera), b = A.canvas.getBoundingClientRect(); return { x: b.left + (v.x * 0.5 + 0.5) * b.width, y: b.top + (-v.y * 0.5 + 0.5) * b.height }; } catch (e) { return null; } }
  // where "saved" lives: the first VISIBLE of the Save pill, the icon pill, the mobile trigger (the right-side pill area); null = no visible pill
  function savedTarget() {
    var ids = ['pill-save', 'icon-pill', 'mobile-trigger'];
    for (var i = 0; i < ids.length; i++) { var e = document.getElementById(ids[i]); if (!e) continue; var r = e.getBoundingClientRect(); if (r.width > 4 && r.height > 4 && e.offsetParent !== null) return { el: e, x: r.left + r.width / 2, y: r.top + r.height / 2, id: ids[i] }; }
    return null;
  }
  // a few quick frames: Cancel returns to the plane in the building area; Save (to = savedTarget()) flies to the pill area and shrinks into it (nothing is animated on the pill itself)
  function closeOverlay(silent, instant, to) {
    if (!OV) return; var c = OV.card, from = instant ? null : (to || projectPlane()); try { window.removeEventListener('resize', OV.place); } catch (e) { } OV = null;
    if (from) { c.style.pointerEvents = 'none'; c.style.left = from.x + 'px'; c.style.top = from.y + 'px'; c.style.width = '10px'; c.style.height = '10px'; c.style.opacity = '0'; setTimeout(function () { c.remove(); }, 320); } else c.remove();
    if (!silent) log('_CLOSE nothing saved; plane stays turn=' + (S.last ? S.last.turn : '-'));
  }
  function doSave(M, P, wing) {
    var X = window.DxfExportUI, enc = new TextEncoder(), files = M.marked || M.R.files, names = Object.keys(files).sort(), z = X.zip(names.map(function (n) { return { name: n, bytes: enc.encode(files[n]) }; }));
    var name = prefixOf() + '_W' + Math.round(P.turn) + '_2D.zip', a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z], { type: 'application/zip' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    var rec = { turn: P.turn, pivot: P.pivot, sheets: names.length, file: name, gaps: M.R.gaps.length, marked: !!M.marked };
    log('_SAVE ' + JSON.stringify(rec)); try { if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'EXPORT_2D', Object.assign({ plane: P }, rec)); } catch (e) { }
    try { if (window.UniversalHistory && UniversalHistory.recordEvent) UniversalHistory.recordEvent('EXPORT_2D', '2D layout ' + P.turn.toFixed(1) + '°', rec); } catch (e) { }
    var to = savedTarget(); log('_SAVE flies to ' + (to ? to.id : 'no visible pill (returns to the plane)')); closeOverlay(true, false, to);
  }

  // ---- the Section Cut mode ----
  function clearClipping() { try { A.renderer.localClippingEnabled = false; A.collectMeshes(function (o) { return o.isMesh; }).forEach(function (o) { o.material.clippingPlanes = []; o.material.needsUpdate = true; }); } catch (e) { } }
  A.sectionModes.Wing = {
    label: '2D', avail: function () { return offered(); },
    enter: function () {
      clearClipping(); S.on = true; var sl = document.getElementById('section-slider'); if (sl) sl.parentNode.style.display = 'none'; var sv = document.getElementById('section-val'); if (sv) sv.textContent = '2D wing plane';
      if (!S.p0) initPlane(); buildGizmo(); S.g.visible = true; updateGizmo(); buildTools(true); refreshTools(); say('');
      A.canvas.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
      loadSide().catch(function (e) { say(e.message); }); log('_ENTER plane=' + JSON.stringify(planeParams()));
    },
    scrub: function () {},
    exit: function () {
      S.on = false; if (S.g) S.g.visible = false; buildTools(false); var sl = document.getElementById('section-slider'); if (sl) sl.parentNode.style.display = '';
      A.canvas.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (A.controls) A.controls.enabled = true; closeOverlay(true, true); if (A.markDirty) A.markDirty();
    }
  };
  // test / replay hooks: the same state a person drags, set directly
  A.wing2dSet = function (p0, p1, depth) { if (!S.p0) initPlane(); if (p0) S.p0 = p0.slice(); if (p1) S.p1 = p1.slice(); if (typeof depth === 'number') S.depth = depth > 0 ? depth : 0; if (S.g) updateGizmo(); refreshTools(); commitPlane('set'); return planeParams(); };
  A.wing2dState = function () { return { on: S.on, plane: S.p0 ? planeParams() : null, fam: S.fam, side: !!S.side, north: S.north, overlay: OV ? OV.state() : null }; };
  A.wing2dClose = function () { closeOverlay(false); };
  A._wing2d = S;
  setInterval(function () { try { if (A.sectionOn && A.refreshSectionModes) A.refreshSectionModes(); } catch (e) { } }, 1500);
}
if (typeof window !== 'undefined') window.setupWing2D = setupWing2D;
