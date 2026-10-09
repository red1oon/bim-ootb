// earthworks_overlay.js — §INSPECT_EARTH_ROAD E1/E5/E6 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §INSPECT_EARTH_ROAD).
// Implementing CIVIL_HIGHWAY_JELAPANG.md §E1 + §E1/E5 REFINEMENT + §E6 — Witness: viewer/tests/witness_ew_cutfill.js
//
// Inspect → EW (Earthworks) and RW (Roadworks) panels. ONE live feature: Cut & Fill [ ] — an INFERRED overlay on the existing
// ground surface: ground ABOVE the road on both sides (slope running through) = CUT (orange); ground BELOW the road
// on both sides = FILL (blue — not green, to avoid reading as vegetation, user 2026-10-09); one of each = side-hill,
// each side keeps its own colour. Every other row is listed greyed PENDING with its spec id.
//
// GATE (NON-IMPACT RULE): A.isCivilModel() AND a drive route. A building never gets the icons (panels.js civilOnly), the
// panels, or the mesh; every public function returns null off a civil model.
// OWNERS REUSED (no second implementation): route/ground/road casts = civil_sections.js (A.civilRouteAt, A.civilCastZ,
// A.civilProfile); thresholds + colours = std_values.json `_cut_fill` (editable, SUGGESTED); chainage text = A.civilChainLabel.
// Non-destructive: one separate draped mesh (raycast disabled, no userData.disc) — no element, colour or DB row is edited.
// Not built here (spec'd, PENDING): bar-progress contraction toward Day 0, DB overlay save, canvas editing, 4D hookup.
function setupEarthworksOverlay(A) {
  'use strict';
  var EW = 'ew-panel', RW = 'rw-panel', MESH = 'ew_cutfill_overlay', _res = null, _mesh = null, _busy = false, _cfg = null;

  function _civil() { return !!(A.db && A.isCivilModel && A.isCivilModel() && typeof A.civilRouteAt === 'function'); }
  function _std() {
    if (_cfg) return Promise.resolve(_cfg);
    var ld = (typeof window.loadJsonWithOverrides === 'function') ? window.loadJsonWithOverrides('std_values.json?v=3', 'json_std_values') : fetch('std_values.json?v=3').then(function (r) { return r.json(); });
    return ld.then(function (s) { A._civilStd = A._civilStd || s; _cfg = { cut: s._cut_fill || {}, mm: (s.geometric && s.geometric.model_map) || {} }; return _cfg; });
  }
  function _hex(h, d) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); var v = parseInt(m ? m[1] : d, 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function LBL(s) { return A.civilChainLabel ? A.civilChainLabel(s) : Math.round(s) + ' m (inferred)'; }
  function RNG(a, b) { return A.civilChainRange ? A.civilChainRange(a, b) : Math.round(a) + '–' + Math.round(b) + ' m (inferred)'; }

  // ── inference: per station, lateral samples left/right until daylight or the cap ────────────────────────────────────────
  // Pure core (node-testable): castG(x,z)->ground y|null, castR(x,z)->road y|null (road surface under the cell), route(s)->{x,z,tx,tz}.
  function infer(route, len, roadAt, castG, castR, c) {
    var ds = c.station_m, step = c.step_m, K = Math.max(1, Math.floor(c.reach_max_m / step)), tol = c.tol_m;
    var nS = Math.floor(len / ds) + 1, grid = [], st = [], i, side, k;
    for (i = 0; i < nS; i++) {
      var s = i * ds, q = route(s), yr = roadAt(s), row = { s: s, y: yr, side: { 1: [], '-1': [] }, kind: 'NO-GROUND' };
      if (q && yr != null && yr === yr) {
        [1, -1].forEach(function (sd) {
          var nx = -q.tz * sd, nz = q.tx * sd, sgn = 0;
          for (var kk = 1; kk <= K; kk++) {
            var x = q.x + nx * kk * step, z = q.z + nz * kk * step, g = castG(x, z);
            // no ground here is NOT the end: the terrain surface has a hole along the road corridor (live 2026-10-09: ground under only
            // 509 of ~2,100 centre-line points), so keep scanning outward to the first ground beyond it
            if (g == null) { row.side[sd].push(null); continue; }
            var d = g - yr, onRoad = castR(x, z) != null;
            row.side[sd].push({ x: x, z: z, g: g, d: d, onRoad: onRoad });
            if (onRoad) continue;
            // a flat shoulder at road level is NOT daylight: the sign is only established once ground leaves the road level
            // (2026-10-09 live: stopping at the first |d|<=tol cell hid every cut slope beyond a level shoulder -> CUT 0 m3).
            // Daylight = after that, ground returns to road level or crosses it.
            var sg = d > tol ? 1 : d < -tol ? -1 : 0;
            if (!sgn) { if (sg) sgn = sg; }
            else if (sg !== sgn) break;                         // daylight: ground meets / crosses road level
          }
        });
      }
      grid.push(row);
    }
    // station kind from the first off-road cell that leaves road level, per side
    var vols = { cut: 0, fill: 0 }, cells = [], bands = [], cur = null, disagree = 0, judged = 0;
    for (i = 0; i < nS; i++) {
      var r = grid[i], ks = [];
      [1, -1].forEach(function (sd) {
        var arr = r.side[sd], f = null;
        for (var j = 0; j < arr.length; j++) if (arr[j] && !arr[j].onRoad && Math.abs(arr[j].d) > tol) { f = arr[j]; break; }   // first cell off the road level (a level shoulder is skipped)
        var anyG = arr.some(function (v) { return v && !v.onRoad; });
        ks.push(f ? (f.d > tol ? 'cut' : 'fill') : anyG ? 'flat' : null);   // flat = ground exists but never leaves road level
      });
      var a = ks[0], b = ks[1];
      var hasC = a === 'cut' || b === 'cut', hasF = a === 'fill' || b === 'fill';
      r.kind = (a == null && b == null) ? 'NO-GROUND' : (hasC && hasF) ? 'SIDE-HILL' : hasC ? 'CUT' : hasF ? 'FILL' : 'AT-GRADE';
      if (cur && cur.kind === r.kind) { cur.s1 = r.s; } else { cur = { kind: r.kind, s0: r.s, s1: r.s, cut: 0, fill: 0 }; bands.push(cur); }
    }
    // cells between consecutive stations (4 corners must be valid, none on the road) -> tint + volume (|d| x step x ds)
    for (i = 0; i + 1 < nS; i++) {
      [1, -1].forEach(function (sd) {
        var A0 = grid[i].side[sd], B0 = grid[i + 1].side[sd], n = Math.min(A0.length, B0.length);
        for (var j = 0; j + 1 < n; j++) {
          var p = [A0[j], A0[j + 1], B0[j + 1], B0[j]];
          if (p.some(function (v) { return !v || v.onRoad; })) continue;
          var md = (p[0].d + p[1].d + p[2].d + p[3].d) / 4, kind = md > tol ? 'cut' : md < -tol ? 'fill' : null;
          if (!kind) continue;
          var vol = Math.abs(md) * step * ds; vols[kind] += vol;
          var bi = bands.length - 1; for (var q2 = 0; q2 < bands.length; q2++) if (grid[i].s >= bands[q2].s0 && grid[i].s <= bands[q2].s1) { bi = q2; break; }
          bands[bi][kind] += vol; cells.push({ kind: kind, p: p, s: grid[i].s });
        }
      });
    }
    return { grid: grid, bands: bands, cells: cells, vols: vols, stations: nS };
  }

  function compute() {
    if (!_civil()) { console.log('§CUT_FILL_INFERRED VACUOUS not a civil model'); return Promise.resolve(null); }
    if (_busy) return Promise.resolve(_res);
    _busy = true;
    return _std().then(function (C) {
      var c = Object.assign({ station_m: 10, step_m: 3, reach_max_m: 60, tol_m: 0.3, color_cut: '#ff8c1a', color_fill: '#3388ff' }, C.cut);
      return (A.civilProfilePrepare ? A.civilProfilePrepare() : Promise.resolve(null)).then(function (P) {
        if (!P) { _busy = false; console.log('§CUT_FILL_INFERRED NOT CHECKED no profile (no route/road/ground)'); return null; }
        var GD = C.mm.ground_discipline || 'EARTHWORK', RD = C.mm.road_discipline || 'ROAD', t0 = performance.now(), rays0 = A._civilRayCount || 0;
        var run = infer(function (s) { return A.civilRouteAt(s); }, P.len,
          function (s) { var v = P.road[Math.min(P.n - 1, Math.round(s / P.ds))]; return v === v ? v : null; },
          function (x, z) { return A.civilCastZ(x, z, GD); }, function (x, z) { return A.civilCastZ(x, z, RD); }, c);
        var gs = 0; for (var i = 0; i < P.n; i++) if (P.ground[i] === P.ground[i]) gs++;
        // cross-check: station kind vs centre-line d (profile) — disagreements are counted, not hidden
        var dis = 0, judged = 0;
        run.grid.forEach(function (r) {
          var j = Math.min(P.n - 1, Math.round(r.s / P.ds)), dc = P.ground[j] - P.road[j];
          if (dc !== dc || r.kind === 'NO-GROUND' || r.kind === 'SIDE-HILL') return; judged++;
          var ck = dc > c.tol_m ? 'CUT' : dc < -c.tol_m ? 'FILL' : 'AT-GRADE'; if (ck !== r.kind) dis++;
        });
        _res = Object.assign(run, { cfg: c, groundSamples: gs, xcheck: { judged: judged, disagree: dis }, rays: (A._civilRayCount || 0) - rays0, ms: performance.now() - t0 });
        _busy = false;
        var by = {}; run.bands.forEach(function (b) { by[b.kind] = (by[b.kind] || 0) + 1; });
        console.log('§CUT_FILL_INFERRED stations=' + run.stations + ' bands=' + run.bands.length + ' cutM3=' + Math.round(run.vols.cut) + ' fillM3=' + Math.round(run.vols.fill) + ' cells=' + run.cells.length +
          ' kinds=' + JSON.stringify(by) + ' groundSamples=' + gs + ' xcheck=' + dis + '/' + judged + ' rays=' + _res.rays + ' ms=' + _res.ms.toFixed(0) + ' status=INFERRED');
        if (gs < 30) console.log('§CUT_FILL_INFERRED FLAT-ASSUMED groundSamples=' + gs + ' < 30 — treat as thin');
        return _res;
      });
    }).catch(function (e) { _busy = false; console.warn('§CUT_FILL_INFERRED failed ' + (e && e.message)); return null; });
  }

  // ── overlay mesh (draped, tinted, non-destructive) ───────────────────────────────────────────────────────────────────
  function hide() {
    if (_mesh) { if (A.scene) A.scene.remove(_mesh); _mesh.geometry.dispose(); _mesh.material.dispose(); _mesh = null; if (A.markDirty) A.markDirty(); }
  }
  function show(res) {
    hide(); if (!res || !res.cells.length || !A.scene) return null;
    var c = res.cfg, ck = _hex(c.color_cut, 'ff8c1a'), fk = _hex(c.color_fill, '3388ff'), lift = c.lift_m != null ? c.lift_m : 0.08;
    var n = res.cells.length, pos = new Float32Array(n * 18), col = new Float32Array(n * 18), o = 0;
    res.cells.forEach(function (cl) {
      var p = cl.p, k = cl.kind === 'cut' ? ck : fk, idx = [0, 1, 2, 0, 2, 3];
      idx.forEach(function (ix) { var v = p[ix]; pos[o] = v.x; pos[o + 1] = v.g + lift; pos[o + 2] = v.z; col[o] = k[0]; col[o + 1] = k[1]; col[o + 2] = k[2]; o += 3; });
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: c.opacity != null ? c.opacity : 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = MESH; m.renderOrder = 5; m.raycast = function () {}; m.frustumCulled = false; A.scene.add(m); _mesh = m; if (A.markDirty) A.markDirty();
    console.log('§EARTH_TINT tris=' + (n * 2) + ' verts=' + (n * 6) + ' heapMB=' + (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'NA') + ' protectedUntouched=true (separate mesh, no element recoloured)');
    return m;
  }
  A.ewCutFillOn = function () { return !!_mesh; };
  A.ewCutFill = function (on) {
    if (!_civil()) { console.log('§CUT_FILL_INFERRED VACUOUS not a civil model'); return Promise.resolve(null); }
    if (!on) { hide(); console.log('§CUT_FILL_INFERRED overlay=off'); return Promise.resolve(null); }
    return compute().then(function (r) { if (r) show(r); return r; });
  };
  A.ewCutFillResult = function () { return _res; };
  A._ewInfer = infer;   // witness hook (pure core)

  // ── panels ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  var EW_ROWS = [['E2 Cost of earthworks', 'PENDING', 'E2a'], ['E2b Duration (owner output rate)', 'PENDING', 'E2b'], ['E2c Plant: excavator / truck / dozer / roller', 'PENDING', 'E2c'], ['E4 Resource caps', 'PENDING', 'E4'], ['Mass haul', 'PENDING', 'E1']];
  var RW_ROWS = [['Stopping sight distance', 'PENDING', 'R1/E-list'], ['Curve radius vs speed', 'PENDING', 'ATJ 8/86 T4.5'], ['Edge-line audit', 'PENDING', 'R1'], ['Road-furniture audit (studs, barriers, posts)', 'PENDING', 'F1'], ['Pavement layers (4D)', 'PENDING', 'E3'], ['Markings / no-passing', 'DEFERRED — single-carriageway road', 'R1']];
  // §PANEL_COLLAPSED (user 2026-10-09): long lists fold into a closed group whose summary carries the count.
  function fold(label, n, inner) { return '<details style="margin:4px 0"><summary style="cursor:pointer;color:#9ad;font-size:12px">' + label + ' (' + n + ')</summary>' + inner + '</details>'; }
  function rows(list) { return list.map(function (r) { return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0;color:#888"><input type="checkbox" disabled><span style="flex:1">' + esc(r[0]) + '</span><span style="font-size:10px">' + esc(r[1]) + ' · ' + esc(r[2]) + '</span></div>'; }).join(''); }
  function panel(id, title, bodyHtml, bind) {
    var old = document.getElementById(id); if (old) old.remove();
    var body = document.createElement('div'); body.style.cssText = 'font-size:12px;color:#ccc;max-height:66vh;overflow-y:auto'; body.innerHTML = '<div style="color:#4fc3f7;font-weight:700;font-size:16px">' + esc(title) + '</div>' + bodyHtml;
    var p = A.createPanel(id, { closable: true, style: { position: 'fixed', top: '70px', left: '928px', zIndex: '1101', width: '380px', padding: '12px 14px' }, content: body });
    document.body.appendChild(p); p.style.display = ''; if (bind) bind(body); return p;
  }
  function summary(res) {
    if (!res) return '<div style="color:#888">Not computed.</div>';
    var c = res.cfg, bl = res.bands.filter(function (b) { return b.kind !== 'NO-GROUND'; }).map(function (b) {
      var col = b.kind === 'CUT' ? c.color_cut : b.kind === 'FILL' ? c.color_fill : '#999';
      return '<div class="ew-band" data-s="' + b.s0 + '" style="padding:2px 6px;border-left:3px solid ' + col + ';margin:2px 0">' + esc(b.kind) + ' · ' + esc(RNG(b.s0, b.s1 + res.cfg.station_m)) + ' · cut ' + Math.round(b.cut) + ' m³ · fill ' + Math.round(b.fill) + ' m³</div>'; }).join('');
    return '<div style="margin:6px 0"><span style="color:' + c.color_cut + ';font-weight:700">■ CUT ' + Math.round(res.vols.cut) + ' m³</span> &nbsp; <span style="color:' + c.color_fill + ';font-weight:700">■ FILL ' + Math.round(res.vols.fill) + ' m³</span></div>' +
      '<div style="color:#aaa;font-size:11px">INFERRED from the contour IFC (not extracted from the authoring tool): ground above the road on both sides = cut; ground falling away both sides = fill. Reach ≤ ' + c.reach_max_m + ' m each side (editable, std_values.json _cut_fill). Ground samples ' + res.groundSamples + (res.groundSamples < 30 ? ' — FLAT-ASSUMED' : '') + '. Volumes are rough prisms (|d| × ' + c.step_m + ' m × ' + c.station_m + ' m).</div>' + fold('Bands', res.bands.filter(function (b) { return b.kind !== 'NO-GROUND'; }).length, bl);
  }
  A.showEarthworksPanel = function () {
    if (!_civil()) { console.log('§EW_PANEL VACUOUS not a civil model'); return null; }
    var html = '<div style="color:#888;font-size:11px;margin-bottom:4px">Earthworks · inferred from the model</div>' +
      '<label style="display:flex;gap:6px;align-items:center;padding:4px 0;color:#eee;font-weight:700"><input type="checkbox" id="ew-cutfill-cb"' + (_mesh ? ' checked' : '') + '> Cut &amp; Fill overlay <span style="font-weight:400;color:#9ad;font-size:10px">LIVE · INFERRED</span></label>' +
      '<div id="ew-cutfill-out">' + summary(_mesh ? _res : null) + '</div><div style="margin-top:6px;border-top:1px solid #444;padding-top:4px">' + fold('Pending features', EW_ROWS.length, rows(EW_ROWS)) + '</div>';
    console.log('§EW_PANEL open features=' + (1 + EW_ROWS.length) + ' live=1 pending=' + EW_ROWS.length);
    return panel(EW, 'Earthworks', html, function (b) {
      var cb = b.querySelector('#ew-cutfill-cb'), out = b.querySelector('#ew-cutfill-out');
      cb.addEventListener('change', function () { out.innerHTML = cb.checked ? '<div style="color:#888">Computing…</div>' : ''; A.ewCutFill(cb.checked).then(function (r) { out.innerHTML = cb.checked ? summary(r) : ''; if (cb.checked && !r) cb.checked = false; }); });
      b.addEventListener('click', function (ev) { var el = ev.target.closest && ev.target.closest('.ew-band'); if (el && A.civilGotoChainage) A.civilGotoChainage(+el.getAttribute('data-s')); });
    });
  };
  A.hideEarthworksPanel = function () { var p = document.getElementById(EW); if (p) p.remove(); };
  A.earthworksPanelOpen = function () { var p = document.getElementById(EW); return !!(p && p.style.display !== 'none'); };
  A.toggleEarthworksPanel = function () { if (A.earthworksPanelOpen()) { A.hideEarthworksPanel(); return null; } return A.showEarthworksPanel(); };
  A.showRoadworksPanel = function () {
    if (!_civil()) { console.log('§RW_PANEL VACUOUS not a civil model'); return null; }
    console.log('§RW_PANEL open features=' + RW_ROWS.length + ' live=0 pending=' + RW_ROWS.length);
    return panel(RW, 'Roadworks', '<div style="color:#888;font-size:11px;margin-bottom:4px">Roadworks · all features pending (spec: CIVIL_HIGHWAY_JELAPANG.md §INSPECT_EARTH_ROAD)</div>' + fold('Pending features', RW_ROWS.length, rows(RW_ROWS)));
  };
  A.hideRoadworksPanel = function () { var p = document.getElementById(RW); if (p) p.remove(); };
  A.roadworksPanelOpen = function () { var p = document.getElementById(RW); return !!(p && p.style.display !== 'none'); };
  A.toggleRoadworksPanel = function () { if (A.roadworksPanelOpen()) { A.hideRoadworksPanel(); return null; } return A.showRoadworksPanel(); };
  A._ewRowSets = { ew: EW_ROWS, rw: RW_ROWS };
  console.log('§EW_RW_SETUP ready (civil-gated)');
}
if (typeof window !== 'undefined') window.setupEarthworksOverlay = setupEarthworksOverlay;
if (typeof module !== 'undefined' && module.exports) module.exports = { setupEarthworksOverlay: setupEarthworksOverlay };
