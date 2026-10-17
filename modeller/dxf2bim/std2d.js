// ⚠ DO NOT REMOVE — std2d JS port (slices S2-S4: grid, hosts, openings, plans, elevations, roof, section). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.6.
// Port of BIMCompiler 2D_Layout/python/std2d.py (the oracle). Pure: takes a query function (Node schema DB rows), returns {files:{name:dxfText}, log, gaps}.
// Every value is from the model DB or a named convention constant (same constants as the oracle); unresolvable values are logged `§GAP`, nothing is guessed.
// Read the log after every run (tests/dxf2bim/witness_std2d_set.js compares it with the Python log line for line).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./std2d_geom.js'), require('./std2d_dxf.js'), require('./polygon-clipping.js'), require('./std2d_scopes.js'));
  else root.Std2d = factory(root.Std2dGeom, root.Std2dDxf, root.polygonClipping, root.Std2dScopes);
})(this, function (G, DXF, PC, SCOPES) {
  'use strict';
  const GRID_READABLE_MAX = 40, GRID_SUPPORT_MIN = 3;   // §L1.11
  const GRID_MERGE_TOL = 0.010, GRID_MIN_WALL_LEN = 1.0, EXT_FACE_TOL = 0.010, BEAR_OVERLAP = 0.50, FACE_PT_TOL = 0.005, PT_MERGE = 0.001;
  const LEAF_MIRROR_TOL = 0.001, VERTICAL_TOL = 1e-6, SINGLE_SWING = ['SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT'], CUT_OFFSET = 1.2;
  const SCALE = 100, DIM_T3 = 10, DIM_T2 = 18, DIM_T1 = 26, GRID_END = 33, BUBBLE_C = 37, BUBBLE_R = 4.0;
  const TXT_DIM = 2.5, TXT_BUBBLE = 3.5, TXT_NOTE = 2.0, TXT_TITLE = 5.0, TXT_LEVEL = 2.5, ELEV_GRID_END = 12, ELEV_BUBBLE_C = 16, ELEV_DIM_CHAIN = 10, ELEV_DIM_OVERALL = 18;
  const BUBBLE_MIN_SPACING = 840, GRID_STAGGER = 900;   // §L1.10 mm model: lines closer than 1.05 x bubble diameter get staggered bubbles; tier t extends line + bubble outward by t x GRID_STAGGER
  const DIM_NARROW = 4.5, LEVEL_EXT = 6, ROMAN_SKIP = ['I', 'O'];
  const WALLS = ['IfcWall', 'IfcWallStandardCase'], OPENINGS = ['IfcDoor', 'IfcWindow'];
  const PLAN_CUT_CLASSES = WALLS.concat(OPENINGS, ['IfcColumn', 'IfcStair', 'IfcStairFlight']);
  const GAP_MIN_AREA = 1.0, HOST_TOL = 0.001, GAP_ACROSS = 0.001, LEVEL_DIFF_TOL = 0.001;
  const LAYERS = {
    'A-WALL-FULL': [7, 50, 'Continuous'], 'A-WALL-PRTN': [7, 35, 'Continuous'], 'A-WALL-PATT': [8, 13, 'Continuous'], 'A-WALL': [7, 35, 'Continuous'],
    'A-DOOR': [3, 25, 'Continuous'], 'A-GLAZ': [4, 18, 'Continuous'], 'A-GLAZ-SILL': [4, 25, 'Continuous'], 'A-GRID': [1, 18, 'CENTER'],
    'A-ANNO-DIMS': [7, 18, 'Continuous'], 'A-ANNO-LEVL': [6, 18, 'Continuous'], 'A-ANNO-NOTE': [1, 18, 'Continuous'], 'A-ANNO-TTLB': [7, 25, 'Continuous'],
    'A-ROOF': [5, 35, 'Continuous'], 'A-SECT': [7, 50, 'Continuous'], 'S-SLAB': [2, 50, 'Continuous'], 'S-COLS': [2, 50, 'Continuous'], 'A-COLS': [7, 50, 'Continuous'],
    'A-GLAZ-OVHD': [4, 18, 'DASHED'], 'A-DOOR-OVHD': [3, 18, 'DASHED'], 'A-FLOR-STRS': [7, 18, 'Continuous']
  };
  const ELEV_FACES = { FRONT: ['y0', (x, y) => x], REAR: ['y1', (x, y) => -x], LEFT: ['x0', (x, y) => -y], RIGHT: ['x1', (x, y) => y] };

  // ── numeric helpers matching numpy / python formatting ──
  const rint = x => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r; };   // round half to even
  const r4 = x => rint(x * 1e4) / 1e4;
  const mm = v => Number((Number(v) * 1000).toFixed(2));
  const fx = (x, d) => Number(x).toFixed(d), fs = (x, d) => (x >= 0 ? '+' : '') + Number(x).toFixed(d);
  // CPython >= 3.12 sum() of floats is Neumaier-compensated; the oracle's grid-line means use it (ties in the 4th decimal depend on it)
  const pySum = a => { let s = 0, c = 0; for (const x of a) { const t = s + x; c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s; s = t; } return s + c; };
  const sortNum = a => a.slice().sort((p, q) => p - q);
  const uniq = a => { const s = sortNum(a), o = []; s.forEach(v => { if (!o.length || o[o.length - 1] !== v) o.push(v); }); return o; };
  const pyList = a => '[' + a.map(x => "'" + x + "'").join(', ') + ']';
  class Log {
    constructor() { this.lines = []; this.gaps = []; }
    add(m) { this.lines.push(m); }
    gap(code, guid, detail) { this.gaps.push([code, guid, detail]); this.lines.push('§GAP ' + code + ' guid=' + guid + ' ' + detail); }
  }
  const asF32 = b => !b ? new Float32Array(0) : (b instanceof Float32Array ? b : new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  const asI32 = b => !b ? new Int32Array(0) : (b instanceof Int32Array ? b : new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));

  // ───────────────────────── model (Node-schema DB through q(sql) -> [{...}]) ─────────────────────────
  function loadModel(q, log) {
    log.add('§DB schema=node');
    const rows = q(`SELECT m.guid guid, m.ifc_class cls, m.element_name name, COALESCE(m.storey,'') storey, (SELECT type_name FROM element_type et WHERE et.guid = m.guid) etype,
        r.minX x0, r.maxX x1, r.minY y0, r.maxY y1, r.minZ z0, r.maxZ z1, COALESCE(t.center_x,0) cx, COALESCE(t.center_y,0) cy, COALESCE(t.center_z,0) cz,
        b.vertices vb, b.faces fb
      FROM elements_meta m JOIN element_world_bbox r ON r.guid = m.guid LEFT JOIN element_transforms t ON t.guid = m.guid
      LEFT JOIN element_instances i ON i.guid = m.guid LEFT JOIN component_geometries b ON b.geometry_hash = i.geometry_hash
      WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcDoor','IfcWindow','IfcSlab','IfcRoof','IfcFooting','IfcColumn','IfcOpeningElement','IfcStair','IfcStairFlight')
      ORDER BY m.guid`);
    const storeyNames = q("SELECT name FROM spatial_structure WHERE type='IfcBuildingStorey' ORDER BY guid").map(r => r.name);
    const fills = q('SELECT opening_guid o, host_guid h, filling_guid f FROM rel_fills_host');
    const hosts = {}, openingOf = {};
    fills.filter(r => r.f).sort((a, b) => (a.f < b.f ? -1 : 1)).forEach(r => { hosts[r.f] = r.h; if (r.o) openingOf[r.f] = r.o; });
    const bbox = new Set(q('SELECT guid FROM element_world_bbox').map(r => r.guid));
    const wallGuids = new Set(q("SELECT guid FROM elements_meta WHERE ifc_class IN ('IfcWall','IfcWallStandardCase')").map(r => r.guid));
    const voided = new Set(fills.filter(r => r.h && !bbox.has(r.h) && wallGuids.has(r.h)).map(r => r.h));   // §L1.7 V1
    const psets = {};
    q('SELECT guid, pset, name, value FROM element_pset_common ORDER BY guid, pset, name').forEach(r => { psets[r.guid + '|' + r.name] = r.value; });
    const selev = {};
    q('SELECT name, placement_z_m z FROM storey_elevation WHERE placement_z_m IS NOT NULL ORDER BY guid').forEach(r => {
      if (r.name in selev && selev[r.name] !== null && Math.abs(selev[r.name] - r.z) > 1e-9) { log.gap('GAP:storey_name_duplicate', r.name, 'two storeys share a name with different placements; R1 used'); selev[r.name] = null; }
      else if (!(r.name in selev)) selev[r.name] = r.z;
    });
    const els = rows.map(r => ({ guid: r.guid, cls: r.cls, name: r.name || '', storey: r.storey, etype: r.etype || '', x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, z0: r.z0, z1: r.z1,
      c: [r.cx, r.cy, r.cz], v: asF32(r.vb), f: asI32(r.fb) }));
    const walls = els.filter(e => WALLS.indexOf(e.cls) >= 0);
    const storeys = [];
    Array.from(new Set(storeyNames)).sort().forEach(s => {
      const sw = walls.filter(w => w.storey === s), r1 = sw.length ? Math.min(...sw.map(w => w.z0)) : null, pz = selev[s];
      if (pz !== undefined && pz !== null) {
        storeys.push({ name: s, elev: pz, src: "R1' storey placement", has_walls: sw.length > 0 });
        if (r1 !== null && Math.abs(r1 - pz) > LEVEL_DIFF_TOL) log.add(`§LEVEL_R1_DIFF storey='${s}' placement=${fx(pz, 4)} R1_min_wall=${fx(r1, 4)} diff=${fs(r1 - pz, 4)} m`);
      } else if (sw.length) storeys.push({ name: s, elev: r1, src: 'R1 min wall minZ', has_walls: true });
      else log.gap('GAP:storey_no_walls', s, 'no IfcWall in storey and no storey placement; no datum drawn');
    });
    storeys.sort((a, b) => a.elev - b.elev || (a.name < b.name ? -1 : 1));
    storeys.forEach(s => log.add(`§LEVEL storey='${s.name}' elev=${fx(s.elev, 4)} m (${s.src})`));
    const fndSt = Array.from(new Set(els.filter(e => e.cls === 'IfcFooting').map(e => e.storey))).sort();
    let fnd = null;
    if (fndSt.length !== 1) log.gap('GAP:foundation_storey', '-', 'storeys with IfcFooting=' + pyList(fndSt) + '; need exactly 1'); else fnd = fndSt[0];
    const fe = storeys.find(s => s.name === fnd), fndElev = fe ? fe.elev : null;
    const above = storeys.filter(s => s.has_walls && (fndElev === null || s.elev > fndElev));
    const gridStorey = above.length ? above[0].name : null;
    log.add(`§STOREY foundation=${fnd === null ? 'None' : "'" + fnd + "'"} grid_storey=${gridStorey === null ? 'None' : "'" + gridStorey + "'"} (R2)`);
    let roofs = els.filter(e => e.cls === 'IfcRoof');
    if (!roofs.length) { const sl = els.filter(e => e.cls === 'IfcSlab'); if (sl.length) { const top = Math.max(...sl.map(e => e.z1)); roofs = sl.filter(e => e.z1 === top); } }
    const roofTop = roofs.length ? Math.max(...roofs.map(e => e.z1)) : null;
    if (roofTop === null) log.gap('GAP:roof_top', '-', 'no IfcRoof / IfcSlab'); else log.add(`§LEVEL T/ROOF=${fx(roofTop, 4)} m from ${pyList(roofs.map(r => r.guid))} (R11)`);
    const doorOps = {};
    const dop = q("SELECT name FROM sqlite_master WHERE type='table' AND name='door_operation'").length
      ? q('SELECT guid, operation_type op, source, x_axis x, y_axis y, z_axis z, overall_width w, overall_height h FROM door_operation ORDER BY guid') : null;
    if (dop) { dop.forEach(r => { doorOps[r.guid] = { op: r.op, source: r.source, x: r.x ? JSON.parse(r.x) : null, y: r.y ? JSON.parse(r.y) : null, z: r.z ? JSON.parse(r.z) : null, w: r.w, h: r.h }; }); log.add(`§DOOR_OPS table=door_operation db=model rows=${dop.length}`); }
    else log.add('§DOOR_OPS none (no door_operation table): every door keeps GAP:door_hinge');
    const byGuid = {}; els.forEach(e => { byGuid[e.guid] = e; });
    return { els, walls, storeys, foundation: fnd, grid_storey: gridStorey, roofs, roof_top: roofTop, hosts, opening_of: openingOf, psets, voided_hosts: voided, by_guid: byGuid, door_ops: doorOps };
  }

  // ───────────────────────── geometry helpers ─────────────────────────
  function wallAxis(w) {
    const dx = w.x1 - w.x0, dy = w.y1 - w.y0;
    return dx >= dy ? ['y', (w.y0 + w.y1) / 2, [w.x0, w.x1], dx] : ['x', (w.x0 + w.x1) / 2, [w.y0, w.y1], dy];
  }
  const envelope = ws => [Math.min(...ws.map(w => w.x0)), Math.max(...ws.map(w => w.x1)), Math.min(...ws.map(w => w.y0)), Math.max(...ws.map(w => w.y1))];
  function orthogonal(V, F) {   // R3
    for (let t = 0; t + 2 < F.length; t += 3) {
      const a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
      const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], w = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], ln = Math.hypot(n[0], n[1], n[2]);
      if (!(ln > 1e-12)) continue;
      if (Math.abs(n[2] / ln) < 0.01 && !(Math.abs(n[0] / ln) < 1e-3 || Math.abs(n[1] / ln) < 1e-3)) return false;
    }
    return true;
  }
  function columnAxis(V, c) {   // §L1.6 C2 on world vertices
    if (!V.length) return null;
    const seen = new Set(), u = [];
    for (let k = 0; k < V.length; k += 3) { const p = [r4(V[k] + c[0]), r4(V[k + 1] + c[1])], key = p[0] + ',' + p[1]; if (!seen.has(key)) { seen.add(key); u.push(p); } }
    u.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // np.unique(axis=0) order: the mean sums in this order
    const cx = u.reduce((s, p) => s + p[0], 0) / u.length, cy = u.reduce((s, p) => s + p[1], 0) / u.length;
    const d = u.map(p => [p[0] - cx, p[1] - cy]), r = d.map(p => Math.hypot(p[0], p[1]));
    if (Math.max(...r) - Math.min(...r) <= 0.001) return [cx, cy];
    const sym = d.every(p => Math.min(...d.map(q => Math.hypot(q[0] + p[0], q[1] + p[1]))) <= 0.001);
    return sym ? [cx, cy] : null;
  }
  function bearsOn(ax, pos, a, b, L, others) {
    for (const f of others) {
      const [fax, , [fa, fb]] = wallAxis(f);
      if (fax !== ax) continue;
      const lo = ax === 'y' ? f.y0 : f.x0, hi = ax === 'y' ? f.y1 : f.x1;
      if (lo < pos && pos < hi && Math.min(b, fb) - Math.max(a, fa) >= BEAR_OVERLAP * L) return f.guid;
    }
    return null;
  }
  function gridLabel(ax, i) {
    if (ax === 'x') return String(i + 1);
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(c => ROMAN_SKIP.indexOf(c) < 0);
    return i < L.length ? L[i] : L[Math.floor(i / L.length) - 1] + L[i % L.length];
  }
  function planStoreys(model) {
    const g = model.storeys.find(s => s.name === model.grid_storey).elev;
    return model.storeys.filter(s => s.elev >= g && model.walls.some(w => w.storey === s.name && w.z0 <= s.elev + CUT_OFFSET && s.elev + CUT_OFFSET < w.z1));
  }
  function roofStorey(model) {   // §L1.4 F4 + §L1.9 (a roof storey without walls takes the roof plan when the model states a roof element)
    const g = model.storeys.find(s => s.name === model.grid_storey).elev, planned = new Set(planStoreys(model).map(s => s.name));
    const cand = model.storeys.filter(s => s.elev > g && !planned.has(s.name) && s.has_walls);
    if (cand.length) return cand[cand.length - 1];
    const nowall = model.storeys.filter(s => s.elev > g && !planned.has(s.name) && model.roofs.length);
    if (nowall.length) return nowall[nowall.length - 1];
    if (model.roofs.length && Math.min(...model.roofs.map(r => r.z0)) > g) return { name: 'ROOF', elev: Math.min(...model.roofs.map(r => r.z0)), src: 'roof element z0', has_walls: false };   // §L1.13
    return null;
  }
  const planView = name => 'FLOOR_' + ((name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')) || 'UNNAMED');

  // §L1.11 pure: clusters = [[ [pos, guid], ... ], ...]; keep a cluster with >= k distinct supporting elements or an exterior wall; k from GRID_SUPPORT_MIN up until <= GRID_READABLE_MAX
  function primaryClusters(clusters, extGuids) {
    const support = cl => new Set(cl.map(c => c[1])).size, top = Math.max(...clusters.map(support)); let k = GRID_SUPPORT_MIN, keep;
    for (;;) { keep = clusters.filter(cl => support(cl) >= k || cl.some(c => extGuids.has(c[1]))); if (keep.length <= GRID_READABLE_MAX || k > top) break; k++; }
    return { keep, k };
  }
  function deriveGrid(model, log) {
    const fnd = model.foundation, gs = model.grid_storey, fw = model.walls.filter(w => w.storey === fnd);
    const wallStoreys = model.storeys.filter(s => s.has_walls).map(s => s.name), ent = { x: [], y: [] }, gridded = new Set(), extGuids = new Set();
    log.add(`§GRID_EVIDENCE regime=${fnd ? 'footing (R4a on the grid storey)' : 'no footing (LB1 pset, LB2 continuity, LB3 exterior, LB4 columns)'}`);
    for (const st of planStoreys(model)) {
      const sname = st.name, sw = model.walls.filter(w => w.storey === sname), env = envelope(sw), k = wallStoreys.indexOf(sname);
      const adjN = wallStoreys.slice(Math.max(0, k - 1), k).concat(wallStoreys.slice(k + 1, k + 2));
      const adj = model.walls.filter(w => adjN.indexOf(w.storey) >= 0);
      for (const w of sw) {
        if (!orthogonal(w.v, w.f)) { log.gap('GAP:wall_not_orthogonal', w.guid, 'not gridded (R3)'); continue; }
        const [ax, pos, [a, b], L] = wallAxis(w);
        let bear = false, lb = false, stack = null;
        if (fnd) bear = sname === gs && bearsOn(ax, pos, a, b, L, fw) !== null;
        else {
          const stated = model.psets[w.guid + '|LoadBearing']; lb = stated === 'TRUE';
          stack = (stated !== 'TRUE' && stated !== 'FALSE') ? bearsOn(ax, pos, a, b, L, adj) : null;
        }
        const ext = ax === 'y' ? (Math.abs(w.y0 - env[2]) <= EXT_FACE_TOL || Math.abs(w.y1 - env[3]) <= EXT_FACE_TOL) : (Math.abs(w.x0 - env[0]) <= EXT_FACE_TOL || Math.abs(w.x1 - env[1]) <= EXT_FACE_TOL);
        const keep = (bear || ext || lb || stack !== null) && L >= GRID_MIN_WALL_LEN;
        const B = x => (x ? 'True' : 'False');
        log.add(`§WALL guid=${w.guid} storey='${sname}' axis=${ax}=${fx(pos, 4)} len=${fx(L, 3)} bear=${B(bear)} ext=${B(ext)} pset_lb=${B(lb)} stacked=${stack === null ? 'None' : "'" + stack + "'"} gridded=${B(keep)}`);
        if (keep) { ent[ax].push([pos, w.guid]); gridded.add(w.guid); if (ext) extGuids.add(w.guid); }
      }
      model.els.filter(e => e.cls === 'IfcColumn' && e.storey === sname).sort((p, q) => (p.guid < q.guid ? -1 : 1)).forEach(c => {
        const ca = columnAxis(c.v, c.c);
        if (!ca) { log.gap('GAP:column_not_symmetric', c.guid, 'plan section neither point-symmetric nor a ring about its vertex mean; not gridded (C2)'); return; }
        ent.x.push([ca[0], c.guid]); ent.y.push([ca[1], c.guid]); gridded.add(c.guid);
        log.add(`§COLUMN_GRID guid=${c.guid} storey='${sname}' centre=(${fx(ca[0], 4)},${fx(ca[1], 4)}) (C2)`);
      });
    }
    const out = {};
    let primary = false;
    for (const ax of ['x', 'y']) {
      let clusters = [];
      ent[ax].sort((p, q) => p[0] - q[0] || (p[1] < q[1] ? -1 : 1)).forEach(([pos, g]) => {
        const last = clusters[clusters.length - 1];
        if (last && pos - last[last.length - 1][0] <= GRID_MERGE_TOL) last.push([pos, g]); else clusters.push([[pos, g]]);
      });
      if (clusters.length > GRID_READABLE_MAX) {   // §L1.11: primary lines only
        const n0 = clusters.length, P = primaryClusters(clusters, extGuids), keep = P.keep, k = P.k;
        primary = true;
        log.add(`§GRID_PRIMARY axis=${ax} lines=${n0} -> ${keep.length} support>=${k} dropped=${n0 - keep.length}` + (keep.length <= GRID_READABLE_MAX ? '' : ` (only exterior lines remain, above the cap ${GRID_READABLE_MAX})`));
        clusters = keep;
      }
      out[ax] = clusters.map((cl, i) => [gridLabel(ax, i), Number((pySum(cl.map(c => c[0])) / cl.length).toFixed(4)), cl.map(c => c[1]).sort()]);
      out[ax].forEach(([lab, p, g]) => log.add(`§GRID ${lab} axis=${ax} pos=${fx(p, 4)} m walls=${g.length}`));
    }
    if (primary) { const onLine = new Set(); ['x', 'y'].forEach(ax => out[ax].forEach(L => L[2].forEach(g => onLine.add(g)))); Array.from(gridded).forEach(g => { if (!onLine.has(g)) gridded.delete(g); }); }
    out.gridded = gridded; out.env = envelope(model.walls.filter(w => w.storey === gs));
    return out;
  }

  // ── hosts (§L1.6 O1): the void of a wall around an opening, from the wall's own mesh sliced at the opening's mid-height ──
  function worldVerts(e) { const V = new Float64Array(e.v.length);   // float64 like numpy (float32 world coordinates flip degenerate contours at site elevations ~170 m)
    for (let k = 0; k < V.length; k += 3) { V[k] = e.v[k] + e.c[0]; V[k + 1] = e.v[k + 1] + e.c[1]; V[k + 2] = e.v[k + 2] + e.c[2]; } return V; }
  function sliceRings(e, z) {
    if (!e.v.length || !e.f.length) return null;
    const rings = [];
    G.chainSegments(G.sliceMesh(worldVerts(e), e.f, z)).forEach(ch => { if (ch.length >= 3 && Math.abs(G.signedArea(ch)) > 0) rings.push(ch); });
    return rings.length ? rings : null;
  }
  function ringIntervals(ring, k, pos) {   // intersection of the line (other coordinate = pos) with the ring interior: crossings on the k axis, paired
    const xs = [], o = 1 - k;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if ((p[o] <= pos) !== (q[o] <= pos)) xs.push(p[k] + (pos - p[o]) / (q[o] - p[o]) * (q[k] - p[k]));
    }
    xs.sort((a, b) => a - b); const iv = [];
    for (let i = 0; i + 1 < xs.length; i += 2) iv.push([xs[i], xs[i + 1]]);
    return iv;
  }
  function hole(w, e, cache) {
    const zm = Number(((e.z0 + e.z1) / 2).toFixed(6)), key = w.guid + '@' + zm;
    if (!(key in cache)) cache[key] = sliceRings(w, zm);
    const U = cache[key]; if (!U) return null;
    const [ax, pos, [wa, wb]] = wallAxis(w), oc = ax === 'y' ? (e.x0 + e.x1) / 2 : (e.y0 + e.y1) / 2, k = ax === 'y' ? 0 : 1;
    let iv = [];
    U.forEach(r => { ringIntervals(r, k, pos).forEach(i => iv.push(i)); });
    iv = iv.map(i => [Math.max(i[0], wa - 1), Math.min(i[1], wb + 1)]).filter(i => i[1] > i[0]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    iv.forEach(i => { const l = merged[merged.length - 1]; if (l && i[0] <= l[1]) l[1] = Math.max(l[1], i[1]); else merged.push(i.slice()); });
    if (merged.some(([a, b]) => a <= oc && oc <= b)) return null;
    const left = merged.filter(([a, b]) => b <= oc).map(i => i[1]), right = merged.filter(([a, b]) => a >= oc).map(i => i[0]);
    if (!left.length || !right.length) return null;
    return [Math.max(...left), Math.min(...right)];
  }
  function resolveHosts(model, log) {
    const cache = {}, hostAll = {}, hostSrc = {}, holeM = {}, n = { ifc: 0, mesh_void: 0, none: 0, ambiguous: 0 };
    for (const e of model.els) {
      if (OPENINGS.indexOf(e.cls) < 0) continue;
      const g = e.guid, h = model.hosts[g];
      if (h !== undefined) {
        hostAll[g] = h; hostSrc[g] = 'ifc'; n.ifc++;
        const hw = model.by_guid[h];
        if (hw && WALLS.indexOf(hw.cls) >= 0) {
          const hv = hole(hw, e, cache);
          if (hv) holeM[g] = [hv, 'mesh_hole'];
          else {
            const o = model.by_guid[model.opening_of[g]], se = o || e, src = o ? 'opening_bbox' : 'filling_bbox';
            holeM[g] = [wallAxis(hw)[0] === 'y' ? [se.x0, se.x1] : [se.y0, se.y1], src];
          }
        }
        continue;
      }
      const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2, cz = (e.z0 + e.z1) / 2, cand = [];
      for (const w of model.walls) {
        if (!(w.x0 - HOST_TOL <= cx && cx <= w.x1 + HOST_TOL && w.y0 - HOST_TOL <= cy && cy <= w.y1 + HOST_TOL && w.z0 < cz && cz < w.z1)) continue;
        const hv = hole(w, e, cache); if (hv) cand.push([w.guid, hv]);
      }
      if (cand.length === 1) { hostAll[g] = cand[0][0]; hostSrc[g] = 'mesh_void'; holeM[g] = [cand[0][1], 'mesh_hole']; n.mesh_void++; }
      else if (!cand.length) { log.gap('GAP:opening_no_host', g, `${e.cls} storey='${e.storey}': no rel_fills_host row and no wall has a void at it`); n.none++; }
      else { log.gap('GAP:opening_no_host', g, `${e.cls}: ${cand.length} walls have a void at it ${pyList(cand.map(c => c[0]))} (ambiguous)`); n.ambiguous++; }
    }
    log.add(`§HOSTS openings=${n.ifc + n.mesh_void + n.none + n.ambiguous} ifc=${n.ifc} mesh_void=${n.mesh_void} none=${n.none} ambiguous=${n.ambiguous} (O1)`);
    model.host_all = hostAll; model.host_src = hostSrc; model.hole = holeM;
  }

  // ── plan opening gaps (§L1.6 O2) on polygons in mm via polygon-clipping ──
  const toPoly = pts => [pts.concat([pts[0]])];
  const polyArea = rings => { let a = 0; rings.forEach((r, i) => { let s = 0; for (let k = 0; k < r.length - 1; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; a += (i === 0 ? 1 : -1) * Math.abs(s / 2); }); return a; };
  const boxPoly = r => [[[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]], [r[0], r[1]]]];
  function overlapPieces(pts, R, k) {
    let I; try { I = PC.intersection(toPoly(pts), R); } catch (e) { I = []; }
    return I.filter(poly => {
      const xs = poly[0].map(p => p[0]), ys = poly[0].map(p => p[1]), b = k === 0 ? [Math.min(...xs), Math.max(...xs)] : [Math.min(...ys), Math.max(...ys)];
      return polyArea(poly) > GAP_MIN_AREA && b[1] - b[0] > PT_MERGE * 1000;
    });
  }
  function planOrthogonal(contours, rect, k) {
    const R = boxPoly(rect);
    for (const pts of contours) for (const g of overlapPieces(pts, R, k)) {
      const q = g[0].slice(0, -1);
      for (let i = 0; i < q.length; i++) {
        const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % q.length], L = Math.hypot(x1 - x0, y1 - y0);
        if (L > 1.0 && Math.abs(x1 - x0) > 1e-3 * L && Math.abs(y1 - y0) > 1e-3 * L) return false;
      }
    }
    return true;
  }
  function subtractGap(contours, rect, k) {
    const R = boxPoly(rect), out = []; let changed = false;
    for (const pts of contours) {
      if (!overlapPieces(pts, R, k).length) { out.push(pts); continue; }
      changed = true;
      let D; try { D = PC.difference(toPoly(pts), R); } catch (e) { D = []; }
      D.forEach(poly => { if (polyArea(poly) < GAP_MIN_AREA) return; out.push(poly[0].slice(0, -1).map(p => [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))])); });
    }
    return [out, changed];
  }
  function planOpenings(model, storey, cutZ, cutWalls, polys, log) {
    const res = [];
    for (const e of model.els) {
      if (OPENINGS.indexOf(e.cls) < 0 || e.storey !== storey.name) continue;
      const g = e.guid, pos = e.z0 >= cutZ ? 'above' : (e.z1 <= cutZ ? 'below' : 'cut'), h = model.host_all[g];
      if (h === undefined) { log.add(`§OPENING guid=${g} cls=${e.cls} host=None pos=${pos} gap=none`); res.push([e, pos]); continue; }
      const hw = model.by_guid[h];
      if (!hw && model.voided_hosts.has(h)) { log.add(`§OPENING guid=${g} cls=${e.cls} host=${h} host_source=${model.host_src[g]} pos=${pos} gap=host_voided (§L1.7 V1)`); res.push([e, pos]); continue; }
      if (!hw) { log.gap('GAP:opening_host_no_geometry', g, `host=${h} has no mesh/bbox in the DB (not drawn on any plan)`); res.push([e, pos]); continue; }
      if (WALLS.indexOf(hw.cls) < 0) { log.gap('GAP:opening_host_not_wall', g, `host=${h} class=${hw.cls}`); res.push([e, pos]); continue; }
      if (!cutWalls.has(h)) { log.gap('GAP:opening_host_not_cut', g, `host=${h} z=(${fx(hw.z0, 3)},${fx(hw.z1, 3)}) cut_z=${fx(cutZ, 3)}`); res.push([e, pos]); continue; }
      const [[a0, a1], hsrc] = model.hole[g], ax = wallAxis(hw)[0];
      const rect = ax === 'y' ? [mm(a0), mm(hw.y0 - GAP_ACROSS), mm(a1), mm(hw.y1 + GAP_ACROSS)] : [mm(hw.x0 - GAP_ACROSS), mm(a0), mm(hw.x1 + GAP_ACROSS), mm(a1)];
      const k = ax === 'y' ? 0 : 1;
      if (!planOrthogonal(polys[h] || [], rect, k)) { log.gap('GAP:opening_host_not_orthogonal', g, `host=${h}: its plan contour inside the gap has an edge neither X- nor Y-aligned`); res.push([e, pos]); continue; }
      const [np, changed] = subtractGap(polys[h] || [], rect, k); polys[h] = np;
      log.add(`§OPENING guid=${g} cls=${e.cls} host=${h} host_source=${model.host_src[g]} pos=${pos} gap=${changed ? 'drawn' : 'in_cut'} along=(${fx(a0 * 1000, 2)},${fx(a1 * 1000, 2)}) from=${hsrc}`);
      res.push([e, pos]);
    }
    return res;
  }

  // ── doors (R9, §L1.2) ──
  function doorSwing(d) {
    if (!d.v.length) return null;
    const n = d.v.length / 3, mn = [1e300, 1e300, 1e300], mx = [-1e300, -1e300, -1e300];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const x = d.v[i * 3 + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    const cen = [0, 1, 2].map(a => (mx[a] + mn[a]) / 2), ext = [0, 1, 2].map(a => (mx[a] - cen[a]) - (mn[a] - cen[a]));
    const ta = ext[0] < ext[1] ? 0 : 1, vals = uniq(Array.from({ length: n }, (_, i) => r4(d.v[i * 3 + ta] - cen[ta])));
    const inner = vals.filter(x => !vals.some(y => Math.abs(y + x) <= LEAF_MIRROR_TOL));
    if (!inner.length) return null;
    if (inner.every(x => x > 0)) return [ta === 0 ? 'x' : 'y', 1];
    if (inner.every(x => x < 0)) return [ta === 0 ? 'x' : 'y', -1];
    return null;
  }
  function components(n, F) {
    const par = Array.from({ length: n }, (_, i) => i), find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t + 2 < F.length; t += 3) for (const [x, y] of [[F[t], F[t + 1]], [F[t + 1], F[t + 2]]]) { const rx = find(x), ry = find(y); if (rx !== ry) par[rx] = ry; }
    return Array.from({ length: n }, (_, i) => find(i));
  }
  function doorHinge(d, op, swing) {
    if (!op) return ['GAP:door_hinge', 'no door_operation row; no arc drawn'];
    if (SINGLE_SWING.indexOf(op.op) < 0) return ['GAP:door_hinge', `operation_type=${op.op} not drawn (H1: single swing only); no arc drawn`];
    if (!(op.x && op.y && op.z) || Math.max(Math.abs(op.z[0]), Math.abs(op.z[1]), Math.abs(op.z[2] - 1)) > VERTICAL_TOL) return ['GAP:door_hinge', `placement axes missing or not vertical z=${JSON.stringify(op.z)} (H1); no arc drawn`];
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]], [ta, sgn] = swing, r9 = ta === 'x' ? [sgn, 0] : [0, sgn];
    if (r9[0] * Y[0] + r9[1] * Y[1] <= 0.5) return ['GAP:door_handing_conflict', `mesh leaf offset ${ta}${sgn > 0 ? '+1' : '-1'} vs IFC +Y=[${Y.map(v => Number(v.toFixed(6)))}] op=${op.op}; no arc drawn`];
    const n = d.v.length / 3, t = Array.from({ length: n }, (_, i) => d.v[i * 3] * Y[0] + d.v[i * 3 + 1] * Y[1]);
    const tmid = (Math.min(...t) + Math.max(...t)) / 2, tc = t.map(x => x - tmid), vals = uniq(tc.map(r4)), inner = vals.filter(x => !vals.some(y => Math.abs(y + x) <= LEAF_MIRROR_TOL));
    if (!inner.length) return ['GAP:door_swing', 'no leaf along y_axis (H4)'];
    const comp = components(n, d.f), seedComp = new Set();
    for (let i = 0; i < n; i++) { const rt = r4(tc[i]); if (inner.some(x => Math.abs(rt - x) <= 1e-9)) seedComp.add(comp[i]); }
    let s0 = 1e300, s1 = -1e300, t1 = -1e300;
    for (let i = 0; i < n; i++) if (seedComp.has(comp[i])) {
      const wx = d.v[i * 3] + d.c[0], wy = d.v[i * 3 + 1] + d.c[1], s = wx * X[0] + wy * X[1], tt = wx * Y[0] + wy * Y[1];
      s0 = Math.min(s0, s); s1 = Math.max(s1, s); t1 = Math.max(t1, tt);
    }
    const left = op.op.endsWith('LEFT'), sh = left ? s0 : s1;
    return ['ok', { hinge: [sh * X[0] + t1 * Y[0], sh * X[1] + t1 * Y[1]], width: s1 - s0, X, Y, closed: left ? X : [-X[0], -X[1]] }];
  }

  // §L1.12 the swing when the mesh gives no leaf offset (R9) but the IFC states everything a swing needs (single-swing type, vertical z, axis-aligned X/Y, OverallWidth):
  // a swing door opens toward +Y of its placement; hinge = LEFT/RIGHT jamb = bbox centre along X -/+ OverallWidth/2, at the bbox centre along Y.
  function doorHingeIfc(d, op) {
    if (!op || SINGLE_SWING.indexOf(op.op) < 0) return ['GAP:door_swing', 'leaf offset not found (R9)'];
    if (!(op.x && op.y && op.z) || Math.max(Math.abs(op.z[0]), Math.abs(op.z[1]), Math.abs(op.z[2] - 1)) > VERTICAL_TOL) return ['GAP:door_swing', 'leaf offset not found (R9); placement axes missing or not vertical, no IFC-convention swing (§L1.12)'];
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]];
    if (!(Math.min(Math.abs(X[0]), Math.abs(X[1])) < 1e-6 && Math.min(Math.abs(Y[0]), Math.abs(Y[1])) < 1e-6) || !op.w) return ['GAP:door_swing', 'leaf offset not found (R9); axes not axis-aligned or no OverallWidth, no IFC-convention swing (§L1.12)'];
    const cn = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]], cs = cn.map(c => c[0] * X[0] + c[1] * X[1]), ct = cn.map(c => c[0] * Y[0] + c[1] * Y[1]);
    const sc = (Math.min(...cs) + Math.max(...cs)) / 2, tc = (Math.min(...ct) + Math.max(...ct)) / 2, w = Number(op.w), left = op.op.endsWith('LEFT'), sh = left ? sc - w / 2 : sc + w / 2;
    return ['ok', { hinge: [sh * X[0] + tc * Y[0], sh * X[1] + tc * Y[1]], width: w, X, Y, closed: left ? X : [-X[0], -X[1]] }];
  }

  // ───────────────────────── drawing ─────────────────────────
  const newDoc = () => new DXF.Doc({ layers: LAYERS, scale: SCALE, dim: { txt: TXT_DIM, asz: 1.2 } });
  function bubble(doc, cx, cy, label, g) { doc.circle('A-GRID', [cx, cy], BUBBLE_R * SCALE, { linetype: 'Continuous', grid: g }); doc.text('A-GRID', label, [cx, cy], TXT_BUBBLE * SCALE, { align: 'MIDDLE_CENTER', grid: g }); }
  function dim(doc, p1, p2, base, angle, log, tag, outward) {
    const meas = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), need = (String(Math.round(meas)).length * 0.9 * TXT_DIM + 1.0) * SCALE;
    let loc = null;
    if (meas < need) loc = angle === 0 ? [(p1[0] + p2[0]) / 2, base[1] + outward[1] * DIM_NARROW * SCALE] : [base[0] + outward[0] * DIM_NARROW * SCALE, (p1[1] + p2[1]) / 2];
    doc.dimension('A-ANNO-DIMS', base, p1, p2, angle, loc);
    log.add(`§DIM ${tag} p1=(${fx(p1[0], 2)},${fx(p1[1], 2)}) p2=(${fx(p2[0], 2)},${fx(p2[1], 2)}) value=${fx(meas, 2)}`);
    return meas;
  }
  function runEnds(runs, envEnds) {
    const merged = [];
    runs.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([a, b]) => { const l = merged[merged.length - 1]; if (l && a - l[1] <= PT_MERGE * 1000) l[1] = Math.max(l[1], b); else merged.push([a, b]); });
    const pts = uniq([].concat(...merged).map(v => Number(v.toFixed(2))).concat(envEnds.map(v => Number(v.toFixed(2))))), out = [];
    pts.forEach(v => { if (!out.length || v - out[out.length - 1] > PT_MERGE * 1000) out.push(v); });
    return out;
  }
  function tiersOf(pos) {   // §L1.10: greedy in ascending position (ties by index); aligned to the input order
    const t = {}; Array.from(pos.keys()).sort((a, b) => pos[a] - pos[b] || a - b).forEach(i => {
      let k = 0; while (Object.keys(t).some(j => t[j] === k && Math.abs(pos[j] - pos[i]) < BUBBLE_MIN_SPACING)) k++;
      t[i] = k;
    });
    return Array.from(pos.keys()).map(i => t[i]);
  }
  function gridPlan(doc, E, grid) {
    const ge = GRID_END * SCALE, bc = BUBBLE_C * SCALE;
    const tx = tiersOf(grid.x.map(g => mm(g[1]))), ty = tiersOf(grid.y.map(g => mm(g[1])));
    grid.x.forEach(([lab, p], i) => { const x = mm(p), o = tx[i] * GRID_STAGGER, g = { axis: 'x', pos: x }; doc.line('A-GRID', [x, E[2] - ge - o], [x, E[3] + ge + o], { grid: g }); bubble(doc, x, E[2] - bc - o, lab, g); bubble(doc, x, E[3] + bc + o, lab, g); });
    grid.y.forEach(([lab, p], i) => { const y = mm(p), o = ty[i] * GRID_STAGGER, g = { axis: 'y', pos: y }; doc.line('A-GRID', [E[0] - ge - o, y], [E[1] + ge + o, y], { grid: g }); bubble(doc, E[0] - bc - o, y, lab, g); bubble(doc, E[1] + bc + o, y, lab, g); });
  }
  function planDims(doc, E, grid, log, view, faceRuns) {
    const gx = grid.x.map(g => mm(g[1])), gy = grid.y.map(g => mm(g[1]));
    const sides = { S: [E[2], -1, true], N: [E[3], 1, true], W: [E[0], -1, false], E: [E[1], 1, false] };
    for (const side of Object.keys(sides)) {
      const [fc, sg, horiz] = sides[side], strings = [];
      if (faceRuns) strings.push(['T3', DIM_T3, runEnds(faceRuns[side], horiz ? [E[0], E[1]] : [E[2], E[3]])]);
      strings.push(['T2', DIM_T2, horiz ? gx : gy], ['T1', DIM_T1, horiz ? [E[0], E[1]] : [E[2], E[3]]]);
      for (const [tier, off, pts] of strings) {
        const baseC = fc + sg * off * SCALE;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          if (horiz) dim(doc, [a, fc], [b, fc], [a, baseC], 0, log, `${view}/${side}/${tier}`, [0, sg]);
          else dim(doc, [fc, a], [fc, b], [baseC, a], 90, log, `${view}/${side}/${tier}`, [sg, 0]);
        }
      }
    }
  }
  const tag = guid => ({ guid });

  function writePlan(model, grid, storey, view, log) {
    log.add(`§VIEW ${view} storey='${storey.name}' elev=${fx(storey.elev, 4)}`);
    const doc = newDoc(), cutZ = storey.elev + CUT_OFFSET;
    const cut = model.els.filter(e => PLAN_CUT_CLASSES.indexOf(e.cls) >= 0 && e.v.length && e.f.length && e.z0 < cutZ && cutZ < e.z1).sort((a, b) => (a.guid < b.guid ? -1 : 1));
    const sw = model.walls.filter(w => w.z0 < cutZ && cutZ < w.z1), other = sw.filter(w => w.storey !== storey.name).map(w => w.guid + '@' + w.storey).sort();
    log.add(`§PLAN_CUT view=${view} cut_z=${fx(cutZ, 3)} walls=${sw.length} (other-storey walls=${other.length}: ${other.join(' ')})`);
    const env = envelope(sw), E = env.map(mm), faceRuns = { S: [], N: [], W: [], E: [] }, onAxis = new Set();
    for (const w of sw) { const [ax, pos] = wallAxis(w); if (grid[ax].some(g => Math.abs(pos - g[1]) <= GRID_MERGE_TOL)) onAxis.add(w.guid); }
    const polys = {};
    cut.forEach(c => {
      polys[c.guid] = G.elementContours(c.v, c.f, c.c, cutZ).map(ct => ct.points.map(p => [mm(p[0]), mm(p[1])])).filter(p => p.length >= 3);
      // §L1.8 S1: an orthogonal wall is rectilinear (R3); a contour of it whose mean width (area / longest bbox side) is below the plan merge tolerance is a
      // tessellation sliver of a rectilinear remnant (web-ifc meshes a 0.6 mm wall end as a wedge) and becomes its bounding rectangle
      if (WALLS.indexOf(c.cls) >= 0 && orthogonal(c.v, c.f)) polys[c.guid] = polys[c.guid].map(pl => {
        const xs = pl.map(q => q[0]), ys = pl.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), L = Math.max(x1 - x0, y1 - y0);
        let a = 0; for (let k = 0; k < pl.length; k++) { const q = pl[(k + 1) % pl.length]; a += pl[k][0] * q[1] - q[0] * pl[k][1]; } a = Math.abs(a) / 2;
        const rect = new Set(xs).size <= 2 && new Set(ys).size <= 2;
        if (L > 0 && a / L < PT_MERGE * 1000 && !rect) { log.add(`§SLIVER_RECT guid=${c.guid} cls=${c.cls} area=${fx(a, 2)} mm2 mean_width=${fx(a / L, 3)} mm -> bounding rectangle (§L1.8 S1)`); return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
        return pl;
      });
    });
    const ops = planOpenings(model, storey, cutZ, new Set(sw.map(w => w.guid)), polys, log);
    let nW = 0, nC = 0;
    for (const c of cut) for (const pts of (polys[c.guid] || [])) {
      if (WALLS.indexOf(c.cls) >= 0 || c.cls === 'IfcColumn') {
        if (c.cls === 'IfcColumn') {
          const layer = model.psets[c.guid + '|LoadBearing'] === 'FALSE' ? 'A-COLS' : 'S-COLS';
          doc.lwpoly(layer, pts, true, tag(c.guid)); doc.hatch(layer, 256, pts, tag(c.guid)); nC++;
        } else {
          doc.lwpoly(onAxis.has(c.guid) ? 'A-WALL-FULL' : 'A-WALL-PRTN', pts, true, tag(c.guid)); doc.hatch('A-WALL-PATT', 8, pts); nW++;
        }
        [['S', q => Math.abs(q[1] - E[2]) <= FACE_PT_TOL * 1000, 0], ['N', q => Math.abs(q[1] - E[3]) <= FACE_PT_TOL * 1000, 0],
         ['W', q => Math.abs(q[0] - E[0]) <= FACE_PT_TOL * 1000, 1], ['E', q => Math.abs(q[0] - E[1]) <= FACE_PT_TOL * 1000, 1]].forEach(([side, on, along]) => {
          const run = pts.filter(on).map(q => q[along]);
          if (run.length >= 2 && Math.max(...run) - Math.min(...run) > PT_MERGE * 1000) faceRuns[side].push([Math.min(...run), Math.max(...run)]);
        });
      } else if (c.cls === 'IfcStair' || c.cls === 'IfcStairFlight') doc.lwpoly('A-FLOR-STRS', pts, true, tag(c.guid));
      else doc.lwpoly(c.cls === 'IfcDoor' ? 'A-DOOR' : 'A-GLAZ', pts, true, tag(c.guid));
    }
    log.add(`§PLAN wall contours=${nW} column contours=${nC} cut_z=${fx(cutZ, 3)}`);
    const nO = { above: 0, below: 0 };
    for (const [e, pos] of ops) {
      if (pos === 'cut') continue;
      const door = e.cls === 'IfcDoor', layer = pos === 'above' ? (door ? 'A-DOOR-OVHD' : 'A-GLAZ-OVHD') : (door ? 'A-DOOR' : 'A-GLAZ');
      const x0 = mm(e.x0), x1 = mm(e.x1), y0 = mm(e.y0), y1 = mm(e.y1);
      doc.lwpoly(layer, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, tag(e.guid)); nO[pos]++;
    }
    log.add(`§PLAN openings above cut=${nO.above} (dashed) below cut=${nO.below}`);
    for (const d of model.els.filter(e => e.cls === 'IfcDoor' && e.storey === storey.name)) {
      const sw_ = doorSwing(d), cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
      const op = model.door_ops[d.guid]; let basis = '', code, res;
      if (!sw_) {   // §L1.12: no leaf offset in the mesh: the IFC-stated swing, or the gap as before
        [code, res] = doorHingeIfc(d, op);
        if (code !== 'ok') { log.gap(code, d.guid, res); continue; }
        basis = ' basis=ifc_convention';
        log.add(`§DOOR guid=${d.guid} swing=ifc_convention (R9 leaf offset not found; opens toward +Y of the IFC placement)`);
      } else {
        var ta = sw_[0], sgn = sw_[1];
        log.add(`§DOOR guid=${d.guid} swing_axis=${ta} swing_sign=${sgn > 0 ? '+1' : '-1'} (R9 leaf offset)`);
        [code, res] = doorHinge(d, op, sw_);
      }
      if (code === 'ok') {
        const H = res.hinge, w = res.width, Y = res.Y, C = res.closed, hm = [mm(H[0]), mm(H[1])], O = [H[0] + w * Y[0], H[1] + w * Y[1]];
        doc.line('A-DOOR', hm, [mm(O[0]), mm(O[1])], tag(d.guid));
        const ac = Math.atan2(C[1], C[0]) * 180 / Math.PI, ao = Math.atan2(Y[1], Y[0]) * 180 / Math.PI, ccw = C[0] * Y[1] - C[1] * Y[0] > 0;
        const mod = a => ((a % 360) + 360) % 360, st = ccw ? ac : ao, en = ccw ? ao : ac;
        doc.arc('A-DOOR', hm, mm(w), Number(mod(st).toFixed(6)), Number(mod(en).toFixed(6)), tag(d.guid));
        log.add(`§DOOR_ARC guid=${d.guid} op=${op.op} source=${op.source} hinge=(${fx(hm[0], 2)},${fx(hm[1], 2)}) width=${fx(w * 1000, 1)} swing=+Y(${fx(Y[0], 6)},${fx(Y[1], 6)}) arc=${fx(mod(st), 1)}->${fx(mod(en), 1)}${basis}`);
        continue;
      }
      log.gap(code, d.guid, res);
      const half = (ta === 'x' ? d.x1 - d.x0 : d.y1 - d.y0) / 2, off = half + 0.2;
      const [nx, ny] = ta === 'x' ? [cx + sgn * off, cy] : [cx, cy + sgn * off];
      doc.text('A-ANNO-NOTE', 'HINGE ?', [mm(nx), mm(ny)], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER', rot: ta === 'x' ? 90 : 0, guid: d.guid });
    }
    const seen = new Set();
    for (const wd of model.els.filter(e => e.cls === 'IfcWindow' && e.storey === storey.name)) {
      const host = model.by_guid[model.host_all[wd.guid]];
      if (!host || WALLS.indexOf(host.cls) < 0) { log.gap('GAP:window_no_host', wd.guid, 'no wall host (rel_fills_host or mesh void, §L1.6 O1)'); continue; }
      const segs = wallAxis(host)[0] === 'y' ? [host.y0, host.y1].map(f => [[mm(wd.x0), mm(f)], [mm(wd.x1), mm(f)]]) : [host.x0, host.x1].map(f => [[mm(f), mm(wd.y0)], [mm(f), mm(wd.y1)]]);
      for (const s of segs) { const key = JSON.stringify(s); if (seen.has(key)) continue; seen.add(key); doc.line('A-GLAZ-SILL', s[0], s[1], tag(wd.guid)); }
    }
    gridPlan(doc, E, grid);
    planDims(doc, E, grid, log, view, faceRuns);
    doc.text('A-ANNO-TTLB', `${storey.name.toUpperCase()} PLAN (FFL ${fs(storey.elev, 3)})  1:${SCALE}`, [(E[0] + E[1]) / 2, E[2] - (BUBBLE_C + 14) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    doc.E = E;   // storey envelope (mm), for the scoped split (§L6)
    return doc;
  }

  function levelsDrawn(doc, log, tagName, levels, lx0, lx1) {
    for (const [name, z] of levels) {
      const Z = mm(z), t = 1.5 * SCALE;
      doc.line('A-ANNO-LEVL', [lx0, Z], [lx1, Z], { linetype: 'DASHED' });
      doc.lwpoly('A-ANNO-LEVL', [[lx1, Z], [lx1 - t, Z + t], [lx1 + t, Z + t]], true);
      doc.text('A-ANNO-LEVL', `${name} ${fs(z, 3)}`, [lx1 + 2.5 * SCALE, Z + 0.4 * SCALE], TXT_LEVEL * SCALE, { align: 'BOTTOM_LEFT' });
      log.add(`§LEVEL_DRAWN ${tagName} ${name} z=${fx(z, 4)}`);
    }
  }
  function writeElevation(model, grid, face, log) {
    const [side, hp] = ELEV_FACES[face];
    log.add(`§VIEW ${face} face=${side}`);
    const doc = newDoc(), gEl = model.storeys.find(s => s.name === model.grid_storey).elev, vis = new Set(model.storeys.filter(s => s.elev >= gEl).map(s => s.name));
    model.storeys.forEach(s => { if (!vis.has(s.name)) log.add(`§ELEV_SKIP storey='${s.name}' elev=${fx(s.elev, 4)} below grid storey (R11)`); });
    const env = envelope(model.walls.filter(w => w.storey === model.grid_storey)), fv = { x0: env[0], x1: env[1], y0: env[2], y1: env[3] }[side];
    const hr = e => { const a = hp(e.x0, e.y0), b = hp(e.x1, e.y1); return [mm(Math.min(a, b)), mm(Math.max(a, b))]; };
    const rect = (h0, h1, z0, z1) => [[h0, mm(z0)], [h1, mm(z0)], [h1, mm(z1)], [h0, mm(z1)]];
    const fw = model.walls.filter(w => vis.has(w.storey) && Math.abs(w[side] - fv) <= EXT_FACE_TOL);
    fw.forEach(w => { const [h0, h1] = hr(w); doc.lwpoly('A-WALL', rect(h0, h1, w.z0, w.z1), true, tag(w.guid)); });
    const fwg = new Set(fw.map(w => w.guid)); let nOp = 0;
    for (const e of model.els) {
      if (OPENINGS.indexOf(e.cls) < 0 || !fwg.has(model.host_all[e.guid])) continue;
      if (((e.x1 - e.x0) >= (e.y1 - e.y0)) !== (side === 'y0' || side === 'y1')) continue;
      const [h0, h1] = hr(e);
      doc.lwpoly(e.cls === 'IfcDoor' ? 'A-DOOR' : 'A-GLAZ', rect(h0, h1, e.z0, e.z1), true, tag(e.guid));
      if (e.cls === 'IfcWindow') doc.line('A-GLAZ-SILL', [h0, mm(e.z0)], [h1, mm(e.z0)], tag(e.guid));
      nOp++;
    }
    model.roofs.forEach(r => { const [h0, h1] = hr(r); doc.lwpoly('A-ROOF', rect(h0, h1, r.z0, r.z1), true, tag(r.guid)); });
    log.add(`§ELEV ${face} walls=${fw.length} openings=${nOp} roofs=${model.roofs.length}`);
    const xs = [hp(env[0], env[2]), hp(env[1], env[3])], H0 = mm(Math.min(...xs)), H1 = mm(Math.max(...xs));
    const levels = model.storeys.filter(s => vis.has(s.name)).map(s => [s.name.toUpperCase(), s.elev]);
    if (model.roof_top !== null) levels.push(['T/ROOF', model.roof_top]);
    levels.sort((a, b) => a[1] - b[1]);
    levelsDrawn(doc, log, face, levels, H0 - LEVEL_EXT * SCALE, H1 + LEVEL_EXT * SCALE);
    const zs = levels.map(l => mm(l[1]));
    for (let i = 0; i + 1 < zs.length; i++) dim(doc, [H0, zs[i]], [H0, zs[i + 1]], [H0 - ELEV_DIM_CHAIN * SCALE, zs[i]], 90, log, `${face}/H/chain`, [-1, 0]);
    if (zs.length > 1) dim(doc, [H0, zs[0]], [H0, zs[zs.length - 1]], [H0 - ELEV_DIM_OVERALL * SCALE, zs[0]], 90, log, `${face}/H/overall`, [-1, 0]);
    const ax = (face === 'FRONT' || face === 'REAR') ? 'x' : 'y', zb = zs[0], zt = zs[zs.length - 1] + LEVEL_EXT * SCALE;
    const hs = grid[ax].map(g => mm(ax === 'x' ? hp(g[1], 0) : hp(0, g[1]))), te = tiersOf(hs);   // §L1.10
    grid[ax].forEach(([lab, p], i) => { const h = hs[i], o = te[i] * GRID_STAGGER; doc.line('A-GRID', [h, zb - ELEV_GRID_END * SCALE - o], [h, zt]); bubble(doc, h, zb - ELEV_BUBBLE_C * SCALE - o, lab); });
    doc.text('A-ANNO-TTLB', `${face} ELEVATION  1:${SCALE}`, [(H0 + H1) / 2, zb - (ELEV_BUBBLE_C + 12) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    return doc;
  }
  function writeRoofPlan(model, grid, storey, log) {
    log.add(`§VIEW ROOF storey='${storey.name}' elev=${fx(storey.elev, 4)}`);
    const doc = newDoc(); let rw = model.walls.filter(w => w.storey === storey.name).sort((a, b) => (a.guid < b.guid ? -1 : 1)), src = 'envelope of the roof storey walls';
    if (!rw.length) { rw = model.roofs.slice().sort((a, b) => (a.guid < b.guid ? -1 : 1)); src = 'envelope of the roof element(s), §L1.9'; }   // §L1.9
    const E = envelope(rw).map(mm);
    doc.lwpoly('A-ROOF', [[E[0], E[2]], [E[1], E[2]], [E[1], E[3]], [E[0], E[3]]], true, tag(rw.map(w => w.guid).join(',').slice(0, 255)));
    log.add(`§ROOF_OUTLINE env=(${fx(E[0], 2)},${fx(E[2], 2)})-(${fx(E[1], 2)},${fx(E[3], 2)}) walls=${rw.length} (${src})`);
    model.els.filter(e => e.cls === 'IfcWindow' && e.storey === storey.name).sort((a, b) => (a.guid < b.guid ? -1 : 1)).forEach(k => {
      const x0 = mm(k.x0), x1 = mm(k.x1), y0 = mm(k.y0), y1 = mm(k.y1);
      doc.lwpoly('A-GLAZ', [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, tag(k.guid));
      log.add(`§SKYLIGHT guid=${k.guid} box=(${fx(x0, 2)},${fx(y0, 2)})-(${fx(x1, 2)},${fx(y1, 2)})`);
    });
    gridPlan(doc, E, grid); planDims(doc, E, grid, log, 'ROOF', null);
    const tx = E[0] + 1.0 * SCALE, ty = E[3] - 4.0 * SCALE;
    doc.text('A-ANNO-LEVL', `${storey.name.toUpperCase()} ${fs(storey.elev, 3)}`, [tx, ty], TXT_LEVEL * SCALE, { align: 'BOTTOM_LEFT' });
    if (model.roof_top !== null) doc.text('A-ANNO-LEVL', `T/ROOF ${fs(model.roof_top, 3)}`, [tx, ty - 4.0 * SCALE], TXT_LEVEL * SCALE, { align: 'BOTTOM_LEFT' });
    doc.text('A-ANNO-TTLB', `ROOF PLAN - ${storey.name.toUpperCase()} (${fs(storey.elev, 3)})  1:${SCALE}`, [(E[0] + E[1]) / 2, E[2] - (BUBBLE_C + 14) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    return doc;
  }
  function cutX(e, x) {
    if (!e.v.length || !e.f.length) return [];
    const W = worldVerts(e); let mn = 1e300, mx = -1e300;
    for (let k = 0; k < W.length; k += 3) { mn = Math.min(mn, W[k]); mx = Math.max(mx, W[k]); }
    if (!(mn < x && x < mx)) return [];
    const P = new Float64Array(W.length); for (let k = 0; k < W.length; k += 3) { P[k] = W[k + 1]; P[k + 1] = W[k + 2]; P[k + 2] = W[k]; }
    return G.chainSegments(G.sliceMesh(P, e.f, x)).filter(c => c.length >= 3);
  }
  function writeSection(model, grid, log) {
    const xs = grid.x.map(g => g[1]), X = xs.length >= 2 ? Number(((xs[0] + xs[1]) / 2).toFixed(6)) : null;
    if (X === null) { log.gap('GAP:section_no_bay', '-', 'fewer than 2 X grid lines; no section'); return null; }
    log.add(`§VIEW SECTION cut X=${fx(X * 1000, 2)} mm viewed toward -X (h = +y)`);
    const doc = newDoc(), roofG = new Set(model.roofs.map(r => r.guid)), n = { 'S-SLAB': 0, 'A-ROOF': 0, 'A-SECT': 0 }, zlo = [], zhi = [];
    for (const e of model.els.slice().sort((a, b) => (a.guid < b.guid ? -1 : 1))) {
      let layer;
      if (roofG.has(e.guid)) layer = 'A-ROOF'; else if (e.cls === 'IfcSlab' || e.cls === 'IfcRoof') layer = 'S-SLAB'; else if (WALLS.indexOf(e.cls) >= 0) layer = 'A-SECT'; else continue;
      for (const ct of cutX(e, X)) {
        const pts = ct.map(p => [mm(p[0]), mm(p[1])]);
        doc.lwpoly(layer, pts, true, tag(e.guid));
        if (layer === 'A-SECT') doc.hatch('A-WALL-PATT', 8, pts);
        n[layer]++;
        const z = pts.map(p => p[1]); zlo.push(Math.min(...z)); zhi.push(Math.max(...z));
        log.add(`§SECT_CUT guid=${e.guid} class=${e.cls} layer=${layer} z=(${fx(Math.min(...z), 2)},${fx(Math.max(...z), 2)}) h=(${fx(Math.min(...pts.map(p => p[0])), 2)},${fx(Math.max(...pts.map(p => p[0])), 2)})`);
      }
    }
    log.add(`§SECTION contours={'S-SLAB': ${n['S-SLAB']}, 'A-ROOF': ${n['A-ROOF']}, 'A-SECT': ${n['A-SECT']}}`);
    const gEl = model.storeys.find(s => s.name === model.grid_storey).elev, levels = model.storeys.filter(s => s.elev >= gEl).map(s => [s.name.toUpperCase(), s.elev]);
    if (model.roof_top !== null) levels.push(['T/ROOF', model.roof_top]);
    levels.sort((a, b) => a[1] - b[1]);
    const env = envelope(model.walls.filter(w => w.storey === model.grid_storey)), H0 = mm(env[2]), H1 = mm(env[3]);
    levelsDrawn(doc, log, 'SECTION', levels, H0 - LEVEL_EXT * SCALE, H1 + LEVEL_EXT * SCALE);
    const zs = levels.map(l => mm(l[1]));
    for (let i = 0; i + 1 < zs.length; i++) dim(doc, [H0, zs[i]], [H0, zs[i + 1]], [H0 - ELEV_DIM_CHAIN * SCALE, zs[i]], 90, log, 'SECTION/H/chain', [-1, 0]);
    if (zs.length > 1) dim(doc, [H0, zs[0]], [H0, zs[zs.length - 1]], [H0 - ELEV_DIM_OVERALL * SCALE, zs[0]], 90, log, 'SECTION/H/overall', [-1, 0]);
    const zb = Math.min(...zs.concat(zlo)), zt = Math.max(...zs.concat(zhi)) + LEVEL_EXT * SCALE;
    const hy = grid.y.map(g => mm(g[1])), ts = tiersOf(hy);   // §L1.10
    grid.y.forEach(([lab, p], i) => { const h = hy[i], o = ts[i] * GRID_STAGGER; doc.line('A-GRID', [h, zb - ELEV_GRID_END * SCALE - o], [h, zt]); bubble(doc, h, zb - ELEV_BUBBLE_C * SCALE - o, lab); });
    doc.text('A-ANNO-TTLB', `SECTION A-A AT X=${fx(X * 1000, 2)}  1:${SCALE}`, [(H0 + H1) / 2, zb - (ELEV_BUBBLE_C + 12) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    return doc;
  }


  // "Drawable?" report (lane spec §L5.1 b): what the model states and what the export can and cannot draw, every line with its count and source. Pure.
  // R = writeStdSet result. Returns { drawable, reasons, rows:[{label, value, source, status:'ok'|'gap'|'info'}] }.
  function drawableReport(R) {
    const M = R.model, rows = [], reasons = [], gapN = {};
    R.gaps.forEach(g => { gapN[g[0]] = (gapN[g[0]] || 0) + 1; });
    const row = (label, value, source, status) => rows.push({ label, value, source, status: status || 'info' });
    const walls = M.walls.length, doors = M.els.filter(e => e.cls === 'IfcDoor').length, wins = M.els.filter(e => e.cls === 'IfcWindow').length, cols = M.els.filter(e => e.cls === 'IfcColumn').length;
    const plans = R.views.plan, ps = M.storeys;
    row('Storeys', `${ps.length} (${plans.length} drawn as plans)`, 'IfcBuildingStorey, ' + (ps.some(s => /placement/.test(s.src)) ? 'placement' : 'min wall z'), plans.length ? 'ok' : 'gap');
    if (!plans.length) reasons.push('no storey has walls reaching its cut plane (1.2 m above the storey)');
    plans.forEach(v => row('  Plan ' + v.storey.name, `FFL ${fs(v.storey.elev, 3)} m`, v.storey.src, 'ok'));
    row('Walls / doors / windows / columns', `${walls} / ${doors} / ${wins} / ${cols}`, 'IfcWall*, IfcDoor, IfcWindow, IfcColumn', walls ? 'ok' : 'gap');
    if (!walls) reasons.push('the model has no IfcWall');
    const hosts = (R.log.find(l => l.indexOf('§HOSTS') === 0) || '').match(/ifc=(\d+) mesh_void=(\d+) none=(\d+) ambiguous=(\d+)/);
    if (hosts) {
      const voided = R.log.filter(l => l.indexOf('gap=host_voided') > 0).length;
      row('Openings with a stated host wall', `${hosts[1]} of ${+hosts[1] + +hosts[2] + +hosts[3] + +hosts[4]}`, 'IfcRelFillsElement', +hosts[3] || +hosts[4] ? 'gap' : 'ok');
      row('Openings hosted by the wall mesh void', hosts[2], 'void in the wall mesh at the opening (not a guess)', 'info');
      row('Openings in a wall the voids remove entirely', voided, 'model states the wall is only its void (§L1.7)', 'info');
      row('Openings with no host in the model', hosts[3], 'listed as GAP:opening_no_host; not drawn as a gap, never guessed', +hosts[3] ? 'gap' : 'ok');
    }
    const arcs = R.log.filter(l => l.indexOf('§DOOR_ARC') === 0).length;
    row('Doors with hinge and swing drawn', `${arcs} of ${doors}`, 'IfcDoor OperationType + axes (door_operation)', doors && arcs < doors ? 'gap' : 'ok');
    row('Columns on the building grid', `${R.grid.gridded ? Array.from(R.grid.gridded).filter(g => M.by_guid[g] && M.by_guid[g].cls === 'IfcColumn').length : 0} of ${cols}`, 'column axis (point-symmetric section)', 'info');
    row('Building grid', `${R.grid.x.length} x ${R.grid.y.length} lines`, 'load-bearing / exterior walls, columns (R4-R6, LB1-LB4)', R.grid.x.length >= 2 && R.grid.y.length >= 2 ? 'ok' : 'gap');
    if (R.grid.x.length < 2 || R.grid.y.length < 2) reasons.push(`the building grid has ${R.grid.x.length} x ${R.grid.y.length} lines; the standard set needs at least 2 in each direction`);
    row('Roof storey / T/ROOF', `${R.views.roof ? R.views.roof.name : 'none'} / ${M.roof_top === null ? 'none' : fs(M.roof_top, 3) + ' m'}`, 'IfcRoof or highest IfcSlab (R11)', R.views.roof && M.roof_top !== null ? 'ok' : 'gap');
    if (!R.views.roof) reasons.push('no roof storey above the grid storey: no roof plan, and the importer needs one to qualify the set');
    row('Sheets written', Object.keys(R.files).length, Object.keys(R.files).map(f => f.replace(/^.*?_(.*)_std\.dxf$/, '$1')).join(', '), 'ok');
    const codes = Object.keys(gapN).sort();
    if (codes.length) row('Gaps (listed, none filled in)', codes.map(c => c.replace('GAP:', '') + ' ' + gapN[c]).join(', '), 'log lines §GAP', 'gap');
    return { drawable: reasons.length === 0, reasons, rows };
  }

  // q(sql) -> array of row objects (Node-schema model DB). prefix names the files: <prefix>_<VIEW>_std.dxf
  // opts (optional, §L6): { scopes: [{name, rect:[x0,y0,x1,y1] mm}] } or { suggest: true, budget } -> each plan storey is written as a KEY sheet + one sheet per scope that owns elements
  function writeStdSet(q, prefix, opts) {
    opts = opts || {};
    const log = new Log(), files = {}, whole = {}, scoped = {};
    log.add(`§ENTRY std2d db=model prefix=${prefix}`);
    const model = loadModel(q, log);
    resolveHosts(model, log);
    const grid = deriveGrid(model, log);
    let scopes = opts.scopes || null;
    if (!scopes && opts.suggest) {
      scopes = SCOPES.suggest({ model, grid, views: { plan: planStoreys(model).map(st => ({ view: planView(st.name), storey: st })) } }, opts.budget);
      log.add(`§SCOPE_SUGGEST budget=${opts.budget || SCOPES.BUDGET} scopes=${scopes.length} ` + scopes.map(s => `${s.name}[${s.rect.map(v => Number.isFinite(v) ? Math.round(v) : v).join(',')}]`).join(' '));
    }
    const put = (name, doc) => { files[name] = doc.toString(); log.add(`§WRITE ${name}`); };
    for (const s of planStoreys(model)) {
      const view = planView(s.name), doc = writePlan(model, grid, s, view, log);
      whole[view] = doc.toString();
      const sp = scopes && scopes.length > 1 ? SCOPES.split(doc, { model, grid, storey: s, view, E: doc.E, scopes }) : null;
      if (!sp || sp.sheets.length < 2) { files[`${prefix}_${view}_std.dxf`] = whole[view]; log.add(`§WRITE ${prefix}_${view}_std.dxf`); continue; }
      scoped[view] = sp;
      const kn = `${prefix}_${view}__KEY_std.dxf`; files[kn] = sp.key; log.add(`§WRITE ${kn}`);
      sp.sheets.forEach(sh => { const n = `${prefix}_${view}__${sh.name}_std.dxf`; files[n] = sh.text; log.add(`§WRITE ${n}`); });
      log.add(`§SCOPE view=${view} sheets=${sp.sheets.length} owned=${sp.sheets.map(sh => sh.name + ':' + sh.owned).join(',')}`);
    }
    for (const face of Object.keys(ELEV_FACES)) put(`${prefix}_${face}_std.dxf`, writeElevation(model, grid, face, log));
    const rs = roofStorey(model);
    if (!rs) log.gap('GAP:no_roof_storey', '-', 'no storey above the grid storey without a floor plan; no roof plan'); else put(`${prefix}_ROOF_std.dxf`, writeRoofPlan(model, grid, rs, log));
    const sec = writeSection(model, grid, log); if (sec) put(`${prefix}_SECTION_std.dxf`, sec);
    const codes = {}; log.gaps.forEach(g => { codes[g[0]] = (codes[g[0]] || 0) + 1; });
    log.add(`§SUMMARY views=${Object.keys(files).length} grid_x=${pyList(grid.x.map(g => g[0]))} grid_y=${pyList(grid.y.map(g => g[0]))} gaps=${log.gaps.length}`);
    log.add('§GAP_SUMMARY {' + Object.keys(codes).map(k => `'${k}': ${codes[k]}`).join(', ') + '}');
    return { files, whole, scoped, scopes, log: log.lines, gaps: log.gaps, grid, model, views: { plan: planStoreys(model).map(st => ({ view: planView(st.name), storey: st })), roof: rs } };
  }
  return { primaryClusters, drawableReport, ELEV_FACES, ELEV_HP: ELEV_FACES, columnAxis, writeStdSet, loadModel, deriveGrid, resolveHosts, planStoreys, LAYERS, PLAN_CUT_CLASSES };
});
