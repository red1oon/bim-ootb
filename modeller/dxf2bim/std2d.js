// ⚠ DO NOT REMOVE — std2d JS port (slices S2-S4: grid, hosts, openings, plans, elevations, roof, section). Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L5.6.
// Port of BIMCompiler 2D_Layout/python/std2d.py (the oracle). Pure: takes a query function (Node schema DB rows), returns {files:{name:dxfText}, log, gaps}.
// Every value is from the model DB or a named convention constant (same constants as the oracle); unresolvable values are logged `§GAP`, nothing is guessed.
// Read the log after every run (tests/dxf2bim/witness_std2d_set.js compares it with the Python log line for line).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./std2d_geom.js'), require('./std2d_dxf.js'), require('./polygon-clipping.js'), require('./std2d_scopes.js'));
  else root.Std2d = factory(root.Std2dGeom, root.Std2dDxf, root.polygonClipping, root.Std2dScopes);
})(this, function (G, DXF, PC, SCOPES) {
  'use strict';
  // §L1.26: the wing-only rules are promoted to every set; STD2D_NO_PROMOTE=<l117,l118,l119,l121> switches rules OFF (tests only: the falsifier; no effect in a browser)
  const OFF = new Set(((typeof process === 'object' && process.env && process.env.STD2D_NO_PROMOTE) || '').split(',')), promote = r => !OFF.has(r);
  const GRID_READABLE_MAX = 40, GRID_SUPPORT_MIN = 3;   // §L1.11
  const GRID_MERGE_TOL = 0.010, GRID_MIN_WALL_LEN = 1.0, EXT_FACE_TOL = 0.010, BEAR_OVERLAP = 0.50, FACE_PT_TOL = 0.010, PT_MERGE = 0.001;
  const LEAF_MIRROR_TOL = 0.001, VERTICAL_TOL = 1e-6, SINGLE_SWING = ['SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT'], CUT_OFFSET = 1.2;
  const SCALE = 100, DIM_T3 = 10, DIM_T2 = 18, DIM_T1 = 26, GRID_END = 33, BUBBLE_C = 37, BUBBLE_R = 4.0;
  const TXT_DIM = 2.5, TXT_BUBBLE = 3.5, TXT_NOTE = 2.0, TXT_TITLE = 5.0, TXT_LEVEL = 2.5, ELEV_GRID_END = 12, ELEV_BUBBLE_C = 16, ELEV_DIM_CHAIN = 10, ELEV_DIM_OVERALL = 18;
  const BUBBLE_MIN_SPACING = 840, GRID_STAGGER = 900;   // §L1.10 mm model: lines closer than 1.05 x bubble diameter get staggered bubbles; tier t extends line + bubble outward by t x GRID_STAGGER
  const DIM_NARROW = 4.5, LEVEL_EXT = 6, ROMAN_SKIP = ['I', 'O'];
  const WALLS = ['IfcWall', 'IfcWallStandardCase'], OPENINGS = ['IfcDoor', 'IfcWindow'];
  const PLAN_CUT_CLASSES = WALLS.concat(OPENINGS, ['IfcColumn', 'IfcStair', 'IfcStairFlight']);
  const CURTAIN_MAX_THICK = 0.6;   // m, §L1.14: a curtain-wall band is thinner than this and at least 2 x its thickness long
  const GAP_MIN_AREA = 1.0, HOST_TOL = 0.001, GAP_ACROSS = 0.001, LEVEL_DIFF_TOL = 0.001;
  const LAYERS = {
    'A-WALL-FULL': [7, 50, 'Continuous'], 'A-WALL-PRTN': [7, 35, 'Continuous'], 'A-WALL-PATT': [8, 13, 'Continuous'], 'A-WALL': [7, 35, 'Continuous'], 'A-WALL-CURT': [4, 25, 'Continuous'],
    'A-DOOR': [3, 25, 'Continuous'], 'A-GLAZ': [4, 18, 'Continuous'], 'A-GLAZ-SILL': [4, 25, 'Continuous'], 'A-GRID': [1, 18, 'CENTER'],
    'A-ANNO-DIMS': [7, 18, 'Continuous'], 'A-ANNO-LEVL': [6, 18, 'Continuous'], 'A-ANNO-NOTE': [1, 18, 'Continuous'], 'A-ANNO-TTLB': [7, 25, 'Continuous'],
    'A-ROOF': [5, 35, 'Continuous'], 'A-SECT': [7, 50, 'Continuous'], 'S-SLAB': [2, 50, 'Continuous'], 'S-COLS': [2, 50, 'Continuous'], 'A-COLS': [7, 50, 'Continuous'],
    'A-GLAZ-OVHD': [4, 18, 'DASHED'], 'A-DOOR-OVHD': [3, 18, 'DASHED'], 'A-FLOR-STRS': [7, 18, 'Continuous'],
    'A-FLOR-OTLN': [7, 25, 'Continuous']   // §D70.1 the floor (slab) outline, NCS / AIA "Floor or building outline": a visible edge below the cut, lighter than the cut walls
  };
  // §D70.1 the drafted slab edge. Window as §D70 measured (slabs >= 50 mm whose top is within -0.5 / +0.3 m of the storey); the two values are best-effort defaults (amber) that equal
  // element_defaults.json slab.edge_joint_close / slab.edge_void_min_area (witnessed); opts.slabEdge overrides them. EDGE_COVER = the §D44 coverage margin.
  const SLAB_EDGE = { joint_close: 0.05, void_min_area: 0.0645, level_step_min: 0.1 }, SLAB_TOP_BELOW = 0.5, SLAB_TOP_ABOVE = 0.3, SLAB_MIN_THICK = 0.05, EDGE_COVER = 0.9;
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
    const hasParts = q("SELECT name FROM sqlite_master WHERE type='table' AND name='element_parts'").length > 0;   // §L1.14
    const rows = q(`SELECT m.guid guid, m.ifc_class cls, m.element_name name, COALESCE(m.storey,'') storey, (SELECT type_name FROM element_type et WHERE et.guid = m.guid) etype,
        r.minX x0, r.maxX x1, r.minY y0, r.maxY y1, r.minZ z0, r.maxZ z1, COALESCE(t.center_x,0) cx, COALESCE(t.center_y,0) cy, COALESCE(t.center_z,0) cz,
        b.vertices vb, b.faces fb
      FROM elements_meta m JOIN element_world_bbox r ON r.guid = m.guid LEFT JOIN element_transforms t ON t.guid = m.guid
      LEFT JOIN element_instances i ON i.guid = m.guid LEFT JOIN component_geometries b ON b.geometry_hash = i.geometry_hash
      WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcDoor','IfcWindow','IfcSlab','IfcRoof','IfcFooting','IfcColumn','IfcOpeningElement','IfcStair','IfcStairFlight')
         ${hasParts ? "OR m.guid IN (SELECT child_guid FROM element_parts WHERE parent_class = 'IfcCurtainWall' AND child_class IN ('IfcPlate','IfcMember'))" : ''}
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
    const curtains = [], byEl = {}; els.forEach(e => { byEl[e.guid] = e; });   // §L1.14
    const partRows = hasParts ? q("SELECT parent_guid, child_guid, child_class FROM element_parts WHERE parent_class = 'IfcCurtainWall' ORDER BY parent_guid, child_guid") : [];
    if (partRows.length) {
      const pk = {}; partRows.forEach(r => { (pk[r.parent_guid] = pk[r.parent_guid] || []).push(r); });
      q("SELECT guid, element_name name FROM elements_meta WHERE ifc_class = 'IfcCurtainWall' ORDER BY guid").forEach(r => {
        const kids = (pk[r.guid] || []).filter(p => (p.child_class === 'IfcPlate' || p.child_class === 'IfcMember') && byEl[p.child_guid]).map(p => byEl[p.child_guid]);
        const doors = (pk[r.guid] || []).filter(p => p.child_class === 'IfcDoor').map(p => p.child_guid);
        if (!kids.length) return;
        const cw = { guid: r.guid, cls: 'IfcCurtainWall', name: r.name || '', storey: '', x0: Math.min(...kids.map(k => k.x0)), x1: Math.max(...kids.map(k => k.x1)), y0: Math.min(...kids.map(k => k.y0)), y1: Math.max(...kids.map(k => k.y1)),
          z0: Math.min(...kids.map(k => k.z0)), z1: Math.max(...kids.map(k => k.z1)), c: [0, 0, 0], v: new Float32Array(0), f: new Int32Array(0), parts: kids, doors };
        curtains.push(cw);
        doors.forEach(dg => { if (!(dg in hosts)) hosts[dg] = r.guid; });   // C2: a door that is a part of the curtain wall is hosted by it
      });
      log.add(`§CURTAINS walls=${curtains.length} parts=${curtains.reduce((a, c) => a + c.parts.length, 0)} doors=${curtains.reduce((a, c) => a + c.doors.length, 0)}`);
    }
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
    let fe = storeys.find(s => s.name === fnd), fndElev = fe ? fe.elev : null;
    if (fnd !== null && !storeys.some(s => s.has_walls && s.elev > fndElev) && storeys.some(s => s.name === fnd && s.has_walls)) {   // R2' (lane §L21): footings share the only walled storey (a single-storey shed): no foundation storey, that storey is the grid storey
      log.add(`§STOREY_SINGLE footings share the walled storey '${fnd}': no foundation storey (R2')`);
      fnd = null; fndElev = null;
    }
    const above = storeys.filter(s => s.has_walls && (fndElev === null || s.elev > fndElev));
    const gridStorey = above.length ? above[0].name : null;
    log.add(`§STOREY foundation=${fnd === null ? 'None' : "'" + fnd + "'"} grid_storey=${gridStorey === null ? 'None' : "'" + gridStorey + "'"} (R2)`);
    let roofs = els.filter(e => e.cls === 'IfcRoof');
    if (!roofs.length) { const sl = els.filter(e => e.cls === 'IfcSlab'); if (sl.length) { const top = Math.max(...sl.map(e => e.z1)); roofs = sl.filter(e => e.z1 === top); } }
    const roofTop = roofs.length ? Math.max(...roofs.map(e => e.z1)) : null;
    if (roofTop === null) log.gap('GAP:roof_top', '-', 'no IfcRoof / IfcSlab'); else log.add(`§LEVEL T/ROOF=${fx(roofTop, 4)} m from ${pyList(roofs.map(r => r.guid))} (R11)`);
    curtains.forEach(cw => cw.doors.forEach(dg => {   // C2: a curtain wall's door parts carry storey 'Unknown': they stand on the highest storey at or below their base
      const d = byEl[dg]; if (!d || (d.storey !== '' && d.storey !== 'Unknown')) return;
      const below = storeys.filter(st => st.elev <= d.z0 + 0.05);
      if (below.length) { d.storey = below[below.length - 1].name; log.add(`§STOREY_BY_Z guid=${dg} z0=${fx(d.z0, 3)} -> '${d.storey}' (curtain-wall door part)`); }
    }));
    const doorOps = {};
    const dop = q("SELECT name FROM sqlite_master WHERE type='table' AND name='door_operation'").length
      ? q('SELECT guid, operation_type op, source, x_axis x, y_axis y, z_axis z, overall_width w, overall_height h FROM door_operation ORDER BY guid') : null;
    if (dop) { dop.forEach(r => { doorOps[r.guid] = { op: r.op, source: r.source, x: r.x ? JSON.parse(r.x) : null, y: r.y ? JSON.parse(r.y) : null, z: r.z ? JSON.parse(r.z) : null, w: r.w, h: r.h }; }); log.add(`§DOOR_OPS table=door_operation db=model rows=${dop.length}`); }
    else log.add('§DOOR_OPS none (no door_operation table): every door keeps GAP:door_hinge');
    const byGuid = {}; els.forEach(e => { byGuid[e.guid] = e; }); curtains.forEach(c => { byGuid[c.guid] = c; });
    return { rules: { l117: promote('l117'), l118: promote('l118'), l119: promote('l119'), l121: promote('l121') }, els, walls, storeys, foundation: fnd, grid_storey: gridStorey, roofs, roof_top: roofTop, hosts, opening_of: openingOf, psets, voided_hosts: voided, curtains, by_guid: byGuid, door_ops: doorOps };
  }

  // ───────────────────────── geometry helpers ─────────────────────────
  function wallAxis(w) {
    const dx = w.x1 - w.x0, dy = w.y1 - w.y0;
    return dx >= dy ? ['y', (w.y0 + w.y1) / 2, [w.x0, w.x1], dx] : ['x', (w.x0 + w.x1) / 2, [w.y0, w.y1], dy];
  }
  const envelope = ws => [Math.min(...ws.map(w => w.x0)), Math.max(...ws.map(w => w.x1)), Math.min(...ws.map(w => w.y0)), Math.max(...ws.map(w => w.y1))];
  // §L1.17 (wing sets only, model.longFaceR3): a wall is orthogonal when the vertical faces parallel/perpendicular to its axes carry >= ORTHO_LONG_SHARE of the vertical-face area;
  // the rest are end faces (mitred / angled junction ends). The contour is NOT changed: the plan still draws the true polygon.
  const ORTHO_LONG_SHARE = 0.9;
  function orthogonalLong(V, F) {
    let on = 0, all = 0;
    for (let t = 0; t + 2 < F.length; t += 3) {
      const a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
      const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], w = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], ln = Math.hypot(n[0], n[1], n[2]);
      if (!(ln > 1e-12) || Math.abs(n[2] / ln) >= 0.01) continue;
      all += ln; if (Math.abs(n[0] / ln) < 1e-3 || Math.abs(n[1] / ln) < 1e-3) on += ln;
    }
    return all > 0 && on / all >= ORTHO_LONG_SHARE;
  }
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
  // §L1.19: drop every vertex on the straight line through its two neighbours (perpendicular distance <= COLLINEAR_TOL mm); same polygon, fewer vertices. Repeats until stable; never below 3.
  const COLLINEAR_TOL = 0.001;
  function dropCollinear(pl) {
    let p = pl.slice(), changed = true;
    while (changed && p.length > 3) {
      changed = false;
      for (let i = 0; i < p.length && p.length > 3; i++) {
        const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy);
        const d = L > 0 ? Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / L : Math.hypot(b[0] - a[0], b[1] - a[1]);
        const between = L > 0 ? ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (L * L) : 0;
        if (d <= COLLINEAR_TOL && between >= 0 && between <= 1) { p.splice(i, 1); changed = true; i--; }
      }
    }
    return p;
  }
  function planStoreys(model) {
    const g = model.storeys.find(s => s.name === model.grid_storey).elev;
    const base = model.storeys.filter(s => s.elev >= g && model.walls.some(w => w.storey === s.name && w.z0 <= s.elev + CUT_OFFSET && s.elev + CUT_OFFSET < w.z1));
    // §D50: a storey whose cut plane lies above the next plan storey's level has no floor of its own (JKR 00 Aras Tanah +81.0 under 01 Aras Satu +81.2): its plan would draw the next
    // storey's walls and door / window bodies again with no openings. The next plan absorbs it (its openings, swings, windows, slabs).
    const out = [];
    base.forEach((s, i) => { const nx = base[i + 1];
      if (nx && s.elev + CUT_OFFSET > nx.elev + 1e-9) { nx.absorbs = nx.absorbs || []; if (nx.absorbs.indexOf(s.name) < 0) { nx.absorbs.push(s.name); if (model._log) model._log.add(`§STOREY_ABSORBED storey='${s.name}' elev=${fx(s.elev, 4)} into='${nx.name}' elev=${fx(nx.elev, 4)}: its cut ${fx(s.elev + CUT_OFFSET, 3)} lies above the next level (D50)`); } return; }
      out.push(s); });
    return out;
  }
  function ofPlan(storey, e) { return e.storey === storey.name || !!(storey.absorbs && storey.absorbs.indexOf(e.storey) >= 0); }   // §D50 the plan's own storey and the storeys it absorbs
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
  // §F7 D25: a wall as THIS plan draws it: the bounding box of its cut contour(s) at cutZ (a coordinate within PT_MERGE of the model bbox keeps the bbox value), or null when the plane draws none of it.
  // The contours are cached per element and cut plane (writePlan draws the same ones).
  function cutContours(model, e, cutZ) {
    const C = model._ctr = model._ctr || new WeakMap(); let m = C.get(e); if (!m) C.set(e, m = {});
    const k = String(cutZ); if (!(k in m)) m[k] = G.elementContours(e.v, e.f, e.c, cutZ); return m[k];
  }
  function drawnWall(model, w, cutZ, log) {
    const cs = cutContours(model, w, cutZ).filter(ct => ct.points.length >= 3); if (!cs.length) return null;
    const xs = [].concat(...cs.map(ct => ct.points.map(p => p[0]))), ys = [].concat(...cs.map(ct => ct.points.map(p => p[1])));
    const keep = (d, b) => (Math.abs(d - b) <= PT_MERGE ? b : d), r = { x0: keep(Math.min(...xs), w.x0), x1: keep(Math.max(...xs), w.x1), y0: keep(Math.min(...ys), w.y0), y1: keep(Math.max(...ys), w.y1) };
    if (log && (r.x0 !== w.x0 || r.x1 !== w.x1 || r.y0 !== w.y0 || r.y1 !== w.y1)) log.add(`§GRID_DRAWN_WALL guid=${w.guid} cut_z=${fx(cutZ, 3)} bbox=(${fx(w.x0, 4)},${fx(w.y0, 4)})-(${fx(w.x1, 4)},${fx(w.y1, 4)}) drawn=(${fx(r.x0, 4)},${fx(r.y0, 4)})-(${fx(r.x1, 4)},${fx(r.y1, 4)}) (D25)`);
    const along = (r.x1 - r.x0) >= (r.y1 - r.y0) ? 0 : 1, len = cs.reduce((t, ct) => { const q = ct.points.map(p => p[along]); return t + Math.max(...q) - Math.min(...q); }, 0);   // the length the plane draws: the pieces' extents along the wall (end slivers beside a curtain wall's void draw ~0)
    return Object.assign({ guid: w.guid, storey: w.storey, cls: w.cls, v: w.v, f: w.f, c: w.c, drawnLen: len, pieces: cs.length }, r);
  }
  function deriveGrid(model, log) {
    const fnd = model.foundation, gs = model.grid_storey, fw = model.walls.filter(w => w.storey === fnd);
    const wallStoreys = model.storeys.filter(s => s.has_walls).map(s => s.name), ent = { x: [], y: [] }, gridded = new Set(), extGuids = new Set();
    log.add(`§GRID_EVIDENCE regime=${fnd ? 'footing (R4a on the grid storey)' : 'no footing (LB1 pset, LB2 continuity, LB3 exterior, LB4 columns)'}`);
    const seenEv = new Set(), seenGap = new Set(), push = (ax, pos, g) => { const key = g + '|' + ax + '|' + pos.toFixed(6); if (seenEv.has(key)) return; seenEv.add(key); ent[ax].push([pos, g]); };   // D25: one entry per element and position
    const adjOf = {}; wallStoreys.forEach((n, k) => { const adjN = wallStoreys.slice(Math.max(0, k - 1), k).concat(wallStoreys.slice(k + 1, k + 2)); adjOf[n] = model.walls.filter(w => adjN.indexOf(w.storey) >= 0); });
    for (const st of planStoreys(model)) {
      const sname = st.name, cutZ = st.elev + CUT_OFFSET, cutW = model.walls.filter(w => w.v.length && w.f.length && w.z0 < cutZ && cutZ < w.z1);   // D25: the walls this plan draws (any storey)
      const sw = cutW.map(w => drawnWall(model, w, cutZ, log)).filter(Boolean);
      log.add(`§GRID_DRAWN storey='${sname}' cut_z=${fx(cutZ, 3)} walls=${sw.length} (other storeys ${sw.filter(w => w.storey !== sname).length}, cut but no contour ${cutW.length - sw.length}) storey walls not cut=${model.walls.filter(w => w.storey === sname && !(w.z0 < cutZ && cutZ < w.z1)).length} (D25)`);
      let env = envelope(sw);
      Object.values(curtainBands(model, cutZ, log)).forEach(cb => { const e = cb.env; env = [Math.min(env[0], e[0]), Math.max(env[1], e[1]), Math.min(env[2], e[2]), Math.max(env[3], e[3])]; });   // C3
      for (const w of sw) {
        const ortho = model.rules.l117 ? (orthogonal(w.v, w.f) || orthogonalLong(w.v, w.f)) : orthogonal(w.v, w.f);
        if (!ortho) { if (!seenGap.has(w.guid)) log.gap('GAP:wall_not_orthogonal', w.guid, 'not gridded (R3)'); seenGap.add(w.guid); continue; }
        if (model.rules.l117 && !orthogonal(w.v, w.f) && !seenGap.has(w.guid)) { log.add(`§ENDFACE_R3 guid=${w.guid} axes from the long faces; end faces off-axis, contour unchanged`); seenGap.add(w.guid); }
        const [ax, pos, [a, b], L] = wallAxis(w);
        let bear = false, lb = false, stack = null;
        if (fnd) bear = w.storey === gs && bearsOn(ax, pos, a, b, L, fw) !== null;
        else {
          const stated = model.psets[w.guid + '|LoadBearing']; lb = stated === 'TRUE';
          stack = (stated !== 'TRUE' && stated !== 'FALSE') ? bearsOn(ax, pos, a, b, L, adjOf[w.storey] || []) : null;
        }
        const ext = ax === 'y' ? (Math.abs(w.y0 - env[2]) <= EXT_FACE_TOL || Math.abs(w.y1 - env[3]) <= EXT_FACE_TOL) : (Math.abs(w.x0 - env[0]) <= EXT_FACE_TOL || Math.abs(w.x1 - env[1]) <= EXT_FACE_TOL);
        const Ld = Math.min(L, w.drawnLen), keep = (bear || ext || lb || stack !== null) && Ld >= GRID_MIN_WALL_LEN;   // D25: the drawn length (pieces along the wall), never more than the bbox length
        const B = x => (x ? 'True' : 'False');
        log.add(`§WALL guid=${w.guid} storey='${w.storey}'${w.storey !== sname ? ` plan='${sname}'` : ''} axis=${ax}=${fx(pos, 4)} len=${fx(L, 3)}${Ld < L - PT_MERGE ? ` drawn_len=${fx(Ld, 3)} pieces=${w.pieces}` : ''} bear=${B(bear)} ext=${B(ext)} pset_lb=${B(lb)} stacked=${stack === null ? 'None' : "'" + stack + "'"} gridded=${B(keep)}`);
        if (keep) { push(ax, pos, w.guid); gridded.add(w.guid); if (ext) extGuids.add(w.guid); }
      }
      Object.keys(curtainBands(model, cutZ, log)).sort().forEach(cwg => {   // C6: a curtain-wall facade is an exterior wall: its axis is grid evidence
        const [x0, x1, y0, y1] = curtainBands(model, cutZ, log)[cwg].env, cax = (x1 - x0) >= (y1 - y0) ? 'y' : 'x', cpos = cax === 'y' ? (y0 + y1) / 2 : (x0 + x1) / 2, cL = cax === 'y' ? x1 - x0 : y1 - y0;
        const bandsAll = Object.values(curtainBands(model, cutZ, log)), envC = [Math.min(...bandsAll.map(b => b.env[0])), Math.max(...bandsAll.map(b => b.env[1])), Math.min(...bandsAll.map(b => b.env[2])), Math.max(...bandsAll.map(b => b.env[3]))];
        const ex = e => cax === 'y' ? (Math.abs(y0 - e[2]) <= EXT_FACE_TOL || Math.abs(y1 - e[3]) <= EXT_FACE_TOL) : (Math.abs(x0 - e[0]) <= EXT_FACE_TOL || Math.abs(x1 - e[1]) <= EXT_FACE_TOL), cext = ex(env) || ex(envC), ckeep = cext && cL >= GRID_MIN_WALL_LEN;   // exterior: on the storey envelope or on the envelope of the curtain bands (the facade)
        log.add(`§CURTAIN_GRID guid=${cwg} storey='${sname}' axis=${cax}=${fx(cpos, 4)} len=${fx(cL, 3)} ext=${cext ? 'True' : 'False'} gridded=${ckeep ? 'True' : 'False'}`);
        if (ckeep) { push(cax, cpos, cwg); gridded.add(cwg); extGuids.add(cwg); }
      });
      model.els.filter(e => e.cls === 'IfcColumn' && e.v.length && e.f.length && e.z0 < cutZ && cutZ < e.z1).sort((p, q) => (p.guid < q.guid ? -1 : 1)).forEach(c => {   // D25: the columns this plan cuts (any storey)
        const ca = columnAxis(c.v, c.c);
        if (!ca) { if (!seenGap.has(c.guid)) log.gap('GAP:column_not_symmetric', c.guid, 'plan section neither point-symmetric nor a ring about its vertex mean; not gridded (C2)'); seenGap.add(c.guid); return; }
        push('x', ca[0], c.guid); push('y', ca[1], c.guid); gridded.add(c.guid);
        log.add(`§COLUMN_GRID guid=${c.guid} storey='${c.storey}'${c.storey !== sname ? ` plan='${sname}'` : ''} centre=(${fx(ca[0], 4)},${fx(ca[1], 4)}) (C2)`);
      });
      model.els.filter(e => e.cls === 'IfcColumn' && e.storey === sname && !(e.z0 < cutZ && cutZ < e.z1)).forEach(c => log.add(`§COLUMN_UNCUT guid=${c.guid} storey='${sname}' z=${fx(c.z0, 3)}..${fx(c.z1, 3)} cut_z=${fx(cutZ, 3)}: not drawn on the plan, no grid evidence (D25)`));
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
        const hw = model.by_guid[h];
        hostAll[g] = h; hostSrc[g] = (hw && hw.cls === 'IfcCurtainWall') ? 'ifc_part' : 'ifc'; n.ifc++;   // C2
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
  // §F7 D16: the gap of a door in an angled wall, a rectangle in the door's placement frame: along X = centre +- OverallWidth / 2, across Y = the host contour's extent (vertices within
  // 1 m along X, else all) +- GAP_ACROSS. null = no frame / width (the gap stays a listed GAP as before)
  function rotatedGap(model, e, contours, fr) {
    let X, Y, sc, w; const cx = (e.x0 + e.x1) / 2 * 1000, cy = (e.y0 + e.y1) / 2 * 1000;
    if (fr) { X = fr.X; Y = fr.Y; sc = (fr.s0 + fr.s1) / 2; w = fr.s1 - fr.s0; if (!contours.length || !(w > 0)) return null; }   // §F7 D21: the window's frame from its host edge
    else {
      const op = model.door_ops[e.guid]; if (!op || !op.x || !op.y || !op.w || !contours.length) return null;
      X = [op.x[0], op.x[1]]; Y = [op.y[0], op.y[1]]; if (!horizFrame(X, Y)) return null; sc = cx * X[0] + cy * X[1]; w = Number(op.w) * 1000;
    }
    const tcen = cx * Y[0] + cy * Y[1];
    const pts = [].concat(...contours), S = p => p[0] * X[0] + p[1] * X[1], T = p => p[0] * Y[0] + p[1] * Y[1];
    let near = pts.filter(p => Math.abs(S(p) - sc) <= w / 2 + 1000); if (near.length < 2) near = pts;
    const ts = near.map(T), t0 = Math.min(...ts, tcen) - GAP_ACROSS * 1000, t1 = Math.max(...ts, tcen) + GAP_ACROSS * 1000, s0 = sc - w / 2, s1 = sc + w / 2;
    const P = (a, b) => [a * X[0] + b * Y[0], a * X[1] + b * Y[1]], R = [[P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1), P(s0, t0)]], out = []; let changed = false;
    for (const c of contours) {   // a removed piece counts as in the axis path (overlapPieces): area > GAP_MIN_AREA and wider than PT_MERGE along the opening; else the contour is kept as is (no float slivers)
      let I; try { I = PC.intersection(toPoly(c), R); } catch (x) { I = []; }
      const real = I.some(q => { const ss = q[0].map(S); return polyArea(q) > GAP_MIN_AREA && Math.max(...ss) - Math.min(...ss) > PT_MERGE * 1000; });
      if (!real) { out.push(c); continue; }
      let D; try { D = PC.difference(toPoly(c), R); } catch (x) { D = [toPoly(c)]; } changed = true;
      D.forEach(poly => { if (polyArea(poly) < GAP_MIN_AREA) return; out.push(poly[0].slice(0, -1).map(p => [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))])); }); }
    return { out, changed, X, s0: s0 / 1000, s1: s1 / 1000, t0: t0 / 1000, t1: t1 / 1000 };
  }
  // §F7 D21: a window in an angled wall has no placement axes: its frame is the direction of a host contour EDGE (>= 100 mm), the one across which the window's own
  // mesh is THINNEST (a window is thin across its wall; a jamb return or an end face is not its wall's direction), X = that edge's direction; along X = the host wall's
  // void at the window's mid height in that frame (as hole() does on an axis), else the window's own mesh on X. The gap is then cut as D16's rotated rectangle.
  // null = no mesh / no edge (the GAP stays)
  function edgeGap(model, e, hw, contours, cache) {
    if (!contours.length || !e.v || !e.v.length) return null;
    const cx = (e.x0 + e.x1) / 2 * 1000, cy = (e.y0 + e.y1) / 2 * 1000, nv = e.v.length / 3, wx = [], wy = []; let best = null;
    for (let i = 0; i < nv; i++) { wx.push(e.v[i * 3] + e.c[0]); wy.push(e.v[i * 3 + 1] + e.c[1]); }
    const across = Y => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < nv; i++) { const t = wx[i] * Y[0] + wy[i] * Y[1]; if (t < lo) lo = t; if (t > hi) hi = t; } return hi - lo; };
    for (const c of contours) for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 100) continue;
      const X = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], th = across([-X[1], X[0]]);
      if (!best || th < best.th - 1e-6) best = { th, X, d: 0 };
    }
    if (!best) return null;
    const X = best.X, Y = [-X[1], X[0]], S = p => p[0] * X[0] + p[1] * X[1], T = p => p[0] * Y[0] + p[1] * Y[1], sc = S([cx / 1000, cy / 1000]);
    let s0 = null, s1 = null, src = 'host_void';
    const zm = Number(((e.z0 + e.z1) / 2).toFixed(6)), key = hw.guid + '@' + zm; if (!(key in cache)) cache[key] = sliceRings(hw, zm);
    if (cache[key]) {
      const iv = []; cache[key].forEach(r => ringIntervals(r.map(p => [S(p), T(p)]), 0, T([cx / 1000, cy / 1000])).forEach(i => iv.push(i)));
      const merged = []; iv.sort((a, b) => a[0] - b[0]).forEach(i => { const l = merged[merged.length - 1]; if (l && i[0] <= l[1]) l[1] = Math.max(l[1], i[1]); else merged.push(i.slice()); });
      const left = merged.filter(i => i[1] <= sc).map(i => i[1]), right = merged.filter(i => i[0] >= sc).map(i => i[0]);
      if (!merged.some(i => i[0] <= sc && sc <= i[1]) && left.length && right.length) { s0 = Math.max(...left) * 1000; s1 = Math.min(...right) * 1000; }
    }
    if (s0 === null) {   // no void at the window's height: the window's own mesh along X
      src = 'window_mesh'; s0 = Infinity; s1 = -Infinity;
      for (let i = 0; i < e.v.length / 3; i++) { const v = (e.v[i * 3] + e.c[0]) * X[0] + (e.v[i * 3 + 1] + e.c[1]) * X[1]; if (v < s0) s0 = v; if (v > s1) s1 = v; }
      s0 *= 1000; s1 *= 1000;
    }
    return { X, Y, s0, s1, thick: best.th * 1000, src };
  }
  function planOpenings(model, storey, cutZ, cutWalls, polys, log) {
    const res = [];
    for (const e of model.els) {
      if (OPENINGS.indexOf(e.cls) < 0 || !ofPlan(storey, e)) continue;
      const g = e.guid, pos = e.z0 >= cutZ ? 'above' : (e.z1 <= cutZ ? 'below' : 'cut'), h = model.host_all[g];
      if (h === undefined) { log.add(`§OPENING guid=${g} cls=${e.cls} host=None pos=${pos} gap=none`); res.push([e, pos]); continue; }
      const hw = model.by_guid[h];
      if (!hw && model.voided_hosts.has(h)) { log.add(`§OPENING guid=${g} cls=${e.cls} host=${h} host_source=${model.host_src[g]} pos=${pos} gap=host_voided (§L1.7 V1)`); res.push([e, pos]); continue; }
      if (!hw) { log.gap('GAP:opening_host_no_geometry', g, `host=${h} has no mesh/bbox in the DB (not drawn on any plan)`); res.push([e, pos]); continue; }
      if (hw.cls === 'IfcCurtainWall') {   // §L1.14 C2: the gap in the curtain band, from the door's own extent along the run
        const band = ((model._cb && model._cb[String(Number(cutZ.toFixed(6)))] || {}).out || {})[h];
        if (!band) { log.gap('GAP:opening_host_not_cut', g, `host=${h} curtain wall not drawn at cut_z=${fx(cutZ, 3)}`); res.push([e, pos]); continue; }
        const r = band.rect, ax = (r[2] - r[0]) >= (r[3] - r[1]) ? 'y' : 'x', [a0, a1] = ax === 'y' ? [e.x0, e.x1] : [e.y0, e.y1];
        const rr = ax === 'y' ? [mm(a0), r[1] - GAP_ACROSS * 1000, mm(a1), r[3] + GAP_ACROSS * 1000] : [r[0] - GAP_ACROSS * 1000, mm(a0), r[2] + GAP_ACROSS * 1000, mm(a1)];
        const [np, changed] = subtractGap(polys[h] || [], rr, ax === 'y' ? 0 : 1); polys[h] = np;
        log.add(`§OPENING guid=${g} cls=${e.cls} host=${h} host_source=${model.host_src[g]} pos=${pos} gap=${changed ? 'drawn' : 'in_cut'} along=(${fx(a0 * 1000, 2)},${fx(a1 * 1000, 2)}) from=part_bbox`);
        res.push([e, pos]); continue;
      }
      if (WALLS.indexOf(hw.cls) < 0) { log.gap('GAP:opening_host_not_wall', g, `host=${h} class=${hw.cls}`); res.push([e, pos]); continue; }
      if (!cutWalls.has(h)) { log.gap('GAP:opening_host_not_cut', g, `host=${h} z=(${fx(hw.z0, 3)},${fx(hw.z1, 3)}) cut_z=${fx(cutZ, 3)}`); res.push([e, pos]); continue; }
      const [[a0, a1], hsrc] = model.hole[g], ax = wallAxis(hw)[0];
      const rect = ax === 'y' ? [mm(a0), mm(hw.y0 - GAP_ACROSS), mm(a1), mm(hw.y1 + GAP_ACROSS)] : [mm(hw.x0 - GAP_ACROSS), mm(a0), mm(hw.x1 + GAP_ACROSS), mm(a1)];
      const k = ax === 'y' ? 0 : 1;
      if (!planOrthogonal(polys[h] || [], rect, k)) {
        const ef = e.cls === 'IfcWindow' ? edgeGap(model, e, hw, polys[h] || [], model._d21 || (model._d21 = {})) : null;   // §F7 D21: a window: the frame of the host edge it sits on
        const rg = e.cls === 'IfcDoor' ? rotatedGap(model, e, polys[h] || []) : ef ? rotatedGap(model, e, polys[h] || [], ef) : null;   // §F7 D16: a door in an angled wall: the gap in the door's own frame
        if (rg) { polys[h] = rg.out; log.add(`§OPENING guid=${g} cls=${e.cls} host=${h} host_source=${model.host_src[g]} pos=${pos} gap=${rg.changed ? 'drawn_rotated' : 'in_cut'} frame=(${fx(rg.X[0], 6)},${fx(rg.X[1], 6)}) along=${fx(rg.s0 * 1000, 2)}..${fx(rg.s1 * 1000, 2)} across=${fx(rg.t0 * 1000, 2)}..${fx(rg.t1 * 1000, 2)} ${ef ? 'frame_from=host_edge window_across=' + fx(ef.thick, 1) + 'mm along_from=' + ef.src + ' (D21)' : '(D16)'}`); res.push([e, pos]); continue; }
        log.gap('GAP:opening_host_not_orthogonal', g, `host=${h}: its plan contour inside the gap has an edge neither X- nor Y-aligned`); res.push([e, pos]); continue;
      }
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
  // §F7 D16: the same leaf-offset test (R9) along the door's OWN placement Y, for a door in an angled wall (world x / y say nothing there)
  function doorSwingFrame(d, Y) {
    if (!d.v.length) return null;
    const n = d.v.length / 3, t = Array.from({ length: n }, (_, i) => d.v[i * 3] * Y[0] + d.v[i * 3 + 1] * Y[1]), tm = (Math.min(...t) + Math.max(...t)) / 2;
    const vals = uniq(t.map(x => r4(x - tm))), inner = vals.filter(x => !vals.some(y => Math.abs(y + x) <= LEAF_MIRROR_TOL));
    if (!inner.length) return null;
    if (inner.every(x => x > 0)) return ['frame', 1];
    if (inner.every(x => x < 0)) return ['frame', -1];
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
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]], [ta, sgn] = swing, r9 = ta === 'frame' ? [sgn * Y[0], sgn * Y[1]] : ta === 'x' ? [sgn, 0] : [0, sgn];
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
  const horizFrame = (X, Y) => Math.abs(Math.hypot(X[0], X[1]) - 1) < 1e-3 && Math.abs(Math.hypot(Y[0], Y[1]) - 1) < 1e-3 && Math.abs(X[0] * Y[0] + X[1] * Y[1]) < 1e-3;
  const axisAligned = (X, Y) => Math.min(Math.abs(X[0]), Math.abs(X[1])) < 1e-6 && Math.min(Math.abs(Y[0]), Math.abs(Y[1])) < 1e-6;
  function doorHingeIfc(d, op) {
    if (!op || SINGLE_SWING.indexOf(op.op) < 0) return ['GAP:door_swing', 'leaf offset not found (R9)'];
    if (!(op.x && op.y && op.z) || Math.max(Math.abs(op.z[0]), Math.abs(op.z[1]), Math.abs(op.z[2] - 1)) > VERTICAL_TOL) return ['GAP:door_swing', 'leaf offset not found (R9); placement axes missing or not vertical, no IFC-convention swing (§L1.12)'];
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]];
    // §F7 D16: any horizontal orthogonal frame (an angled wall's door), not only axis-aligned; the projections below hold at any angle
    if (!horizFrame(X, Y) || !op.w) return ['GAP:door_swing', 'leaf offset not found (R9); placement X / Y not a horizontal orthogonal frame or no OverallWidth, no IFC-convention swing (§L1.12)'];
    const cn = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]], cs = cn.map(c => c[0] * X[0] + c[1] * X[1]), ct = cn.map(c => c[0] * Y[0] + c[1] * Y[1]);
    const sc = (Math.min(...cs) + Math.max(...cs)) / 2, tc = d._tc !== undefined ? d._tc : (Math.min(...ct) + Math.max(...ct)) / 2, w = Number(op.w), left = op.op.endsWith('LEFT'), sh = left ? sc - w / 2 : sc + w / 2;   // _tc: §F7 D23
    return ['ok', { hinge: [sh * X[0] + tc * Y[0], sh * X[1] + tc * Y[1]], width: w, X, Y, closed: left ? X : [-X[0], -X[1]] }];
  }

  // §F7 D17: DOUBLE_DOOR_SINGLE_SWING = two leaves of OverallWidth / 2 hinged at the two jambs (bbox centre along X -/+ OverallWidth / 2, at the bbox centre along Y), both opening to +Y
  function doorDouble(d, op) {
    if (!(op.x && op.y && op.z) || Math.max(Math.abs(op.z[0]), Math.abs(op.z[1]), Math.abs(op.z[2] - 1)) > VERTICAL_TOL) return ['GAP:door_hinge', `double door: placement axes missing or not vertical (D17); no arc drawn`];
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]]; if (!horizFrame(X, Y) || !op.w) return ['GAP:door_hinge', 'double door: no horizontal orthogonal frame or no OverallWidth (D17); no arc drawn'];
    const cn = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]], cs = cn.map(c => c[0] * X[0] + c[1] * X[1]), ct = cn.map(c => c[0] * Y[0] + c[1] * Y[1]);
    const sc = (Math.min(...cs) + Math.max(...cs)) / 2, tc = d._tc !== undefined ? d._tc : (Math.min(...ct) + Math.max(...ct)) / 2, w = Number(op.w), P = a => [a * X[0] + tc * Y[0], a * X[1] + tc * Y[1]];   // _tc: §F7 D23
    return ['ok', { leaves: [{ hinge: P(sc - w / 2), width: w / 2, X, Y, closed: X }, { hinge: P(sc + w / 2), width: w / 2, X, Y, closed: [-X[0], -X[1]] }] }];
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
  function gridPlan(doc, E0, grid) {
    const gxs = grid.x.map(g => mm(g[1])), gys = grid.y.map(g => mm(g[1]));   // D28: the bubbles stand beyond the outermost grid line, not only beyond the walls of this plan (a line outside the plan crossed the other axis' bubble row)
    const E = [Math.min(E0[0], ...gxs), Math.max(E0[1], ...gxs), Math.min(E0[2], ...gys), Math.max(E0[3], ...gys)];
    const ge = GRID_END * SCALE, bc = BUBBLE_C * SCALE;
    const tx = tiersOf(grid.x.map(g => mm(g[1]))), ty = tiersOf(grid.y.map(g => mm(g[1])));
    grid.x.forEach(([lab, p], i) => { const x = mm(p), o = tx[i] * GRID_STAGGER, g = { axis: 'x', pos: x }; doc.line('A-GRID', [x, E[2] - ge - o], [x, E[3] + ge + o], { grid: g }); bubble(doc, x, E[2] - bc - o, lab, g); bubble(doc, x, E[3] + bc + o, lab, g); });
    grid.y.forEach(([lab, p], i) => { const y = mm(p), o = ty[i] * GRID_STAGGER, g = { axis: 'y', pos: y }; doc.line('A-GRID', [E[0] - ge - o, y], [E[1] + ge + o, y], { grid: g }); bubble(doc, E[0] - bc - o, y, lab, g); bubble(doc, E[1] + bc + o, y, lab, g); });
  }
  function planDims(doc, E0, grid, log, view, faceRuns, F) {
    const E = F || E0;   // D10: the drawn extents when given (the reader's envelope), else the model envelope
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

  // §L1.14 C1: per curtain wall the union of its parts' sections at the cut plane is ONE band when thin (<= CURTAIN_MAX_THICK) and at least twice as long; else GAP:curtainwall_not_a_run.
  // Cached per cut plane (the log is written once, by the first call).
  function curtainBands(model, cutZ, log) {
    const cache = model._cb = model._cb || {}, key = String(Number(cutZ.toFixed(6)));
    if (!cache[key]) {
      const out = {}, lines = [], gaps = [];
      for (const cw of model.curtains) {
        if (!(cw.z0 < cutZ && cutZ < cw.z1)) continue;
        let xs0 = Infinity, xs1 = -Infinity, ys0 = Infinity, ys1 = -Infinity, n = 0, any = false;
        for (const k of cw.parts) {
          if (!(k.z0 < cutZ && cutZ < k.z1) || !k.v.length || !k.f.length) continue;
          for (const ch of G.chainSegments(G.sliceMesh(worldVerts(k), k.f, cutZ))) if (ch.length >= 3) { n++; any = true; ch.forEach(q => { xs0 = Math.min(xs0, q[0]); xs1 = Math.max(xs1, q[0]); ys0 = Math.min(ys0, q[1]); ys1 = Math.max(ys1, q[1]); }); }
        }
        if (!any) continue;
        const thin = Math.min(xs1 - xs0, ys1 - ys0), length = Math.max(xs1 - xs0, ys1 - ys0);
        if (thin <= CURTAIN_MAX_THICK && length >= 2 * thin) {
          out[cw.guid] = { rect: [mm(xs0), mm(ys0), mm(xs1), mm(ys1)], env: [xs0, xs1, ys0, ys1], parts: cw.parts.length, cut: n };
          lines.push(`§CURTAIN guid=${cw.guid} cut_z=${fx(cutZ, 3)} rect=(${fx(mm(xs0), 2)},${fx(mm(ys0), 2)})-(${fx(mm(xs1), 2)},${fx(mm(ys1), 2)}) parts=${cw.parts.length} cut=${n}`);
        } else gaps.push(['GAP:curtainwall_not_a_run', cw.guid, `section at cut_z=${fx(cutZ, 3)} is ${fx(thin * 1000, 0)} x ${fx(length * 1000, 0)} mm (band needs thickness <= ${fx(CURTAIN_MAX_THICK * 1000, 0)} and length >= 2 x thickness); not drawn`]);
      }
      cache[key] = { out, lines, gaps, emitted: false };
    }
    const c = cache[key];
    if (log && !c.emitted) { c.emitted = true; c.lines.forEach(l => log.add(l)); c.gaps.forEach(g => log.gap(g[0], g[1], g[2])); }   // the first caller with a log writes them (deriveGrid runs before the plans)
    return c.out;
  }
  function buildingEnv(model, gs, gEl, log) {   // walls of the grid storey + the curtain bands at its cut plane (C3)
    let env = envelope(model.walls.filter(w => w.storey === gs));
    Object.values(curtainBands(model, gEl + CUT_OFFSET, log)).forEach(c => { const e = c.env; env = [Math.min(env[0], e[0]), Math.max(env[1], e[1]), Math.min(env[2], e[2]), Math.max(env[3], e[3])]; });
    return env;
  }

  // §F7 north: opts.north = { angle, source } with angle = the bearing of MODEL north measured from TRUE north (the georef's `true_north_angle`, atan2(-x, y) of the IFC TrueNorth,
  // prompts/GEOREF_SUNPATH_COMPASS.md §2) and source = its `true_north_source`; only 'ifc_truenorth' is a stated north. opts.north === null = the caller has no georef: the sheet says so.
  // undefined = not asked (the legacy sheets are byte-identical). True north in MODEL coordinates is (-sin B, cos B); a wing sheet is turned by -angle, so the vector is turned with it.
  function northOf(north) {
    if (north === undefined) return undefined; if (north === null) return { stated: false, why: 'north not stated' };
    if (north.source !== 'ifc_truenorth' || !Number.isFinite(north.angle)) return { stated: false, why: 'north not stated (' + (north.source || 'no source') + ')' };
    const b = north.angle * Math.PI / 180; return { stated: true, x: -Math.sin(b), y: Math.cos(b), source: north.source, angle: north.angle };
  }
  function turnNorth(n, deg) { if (!n || !n.stated || !deg) return n; const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return Object.assign({}, n, { x: c * n.x - s * n.y, y: s * n.x + c * n.y }); }
  function northMark(doc, n, E, log) {   // a north arrow at the lower right, level with the sheet title (no circle, no lone N: both read as a grid bubble / label); or the words "north not stated"
    if (n === undefined) return; const cx = E[1] - 1500, cy = E[2] - (BUBBLE_C + 14) * SCALE + 500, R = 800;
    if (!n.stated) { doc.text('A-ANNO-NOTE', n.why.toUpperCase(), [cx, cy], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER' }); log.add('§NORTH ' + n.why); return; }
    const L = Math.hypot(n.x, n.y) || 1, ux = n.x / L, uy = n.y / L, px = -uy, py = ux, tip = [cx + ux * R * 1.1, cy + uy * R * 1.1], back = [cx - ux * R * 0.8, cy - uy * R * 0.8];
    doc.line('A-ANNO-TTLB', back, tip);   // no circle: the importer reads a circle + a text as a grid bubble, and an 'N' bubble beside a grid line gave grid_label_conflict / grid_label_order
    doc.lwpoly('A-ANNO-TTLB', [tip, [cx + ux * R * 0.35 + px * R * 0.3, cy + uy * R * 0.35 + py * R * 0.3], [cx + ux * R * 0.35 - px * R * 0.3, cy + uy * R * 0.35 - py * R * 0.3]], true);
    // no lone 'N' text either: the importer reads a one-letter text near a grid line as that grid line's label (grid_label_conflict); the caption says what the arrow is
    doc.text('A-ANNO-NOTE', `N = TRUE NORTH (${n.source})`, [cx, cy - R - 450], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER' });
    log.add(`§NORTH stated source=${n.source} model_north_from_true=${fx(n.angle, 4)} sheet_arrow=(${fx(ux, 5)},${fx(uy, 5)})`);
  }
  // §F7 stairs: tread outlines and the up direction, READ from the stair's own mesh (no tread count is assumed): the horizontal up-facing faces at each distinct height are the treads and landings of
  // that step; their outline = the edges that belong to ONE face of the step; the up path joins the step centroids from the lowest to the highest and ends in an arrowhead.
  // Only steps between the storey floor and the cut plane are drawn (what a plan shows below its cut). Returns { steps: [{z, edges:[[x0,y0,x1,y1] mm]}], path: [[x,y] mm] } or null.
  function stairSteps(e, zLo, zHi) {
    const V = e.v, F = e.f, byZ = new Map();
    for (let t = 0; t + 2 < F.length; t += 3) {
      const ia = [F[t], F[t + 1], F[t + 2]], P = ia.map(i => [V[i * 3] + e.c[0], V[i * 3 + 1] + e.c[1], V[i * 3 + 2] + e.c[2]]);
      const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], w = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]);
      if (!(l > 1e-12) || n[2] / l < 0.99) continue;
      const z = (P[0][2] + P[1][2] + P[2][2]) / 3; if (z < zLo - 0.002 || z > zHi + 0.002) continue;
      const k = Math.round(z * 1000); (byZ.get(k) || byZ.set(k, []).get(k)).push(P);
    }
    const steps = [], key = p => Math.round(p[0] * 10000) + ',' + Math.round(p[1] * 10000);
    [...byZ.keys()].sort((a, b) => a - b).forEach(k => {
      const cnt = new Map(), seg = new Map(); let cx = 0, cy = 0, ca = 0;
      byZ.get(k).forEach(P => {
        const a = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); const ar = Math.abs(a) / 2; ca += ar; cx += ar * (P[0][0] + P[1][0] + P[2][0]) / 3; cy += ar * (P[0][1] + P[1][1] + P[2][1]) / 3;
        for (let i = 0; i < 3; i++) { const A = P[i], B = P[(i + 1) % 3], ka = key(A), kb = key(B), ek = ka < kb ? ka + '|' + kb : kb + '|' + ka; cnt.set(ek, (cnt.get(ek) || 0) + 1); seg.set(ek, [A[0], A[1], B[0], B[1]]); }
      });
      const edges = []; cnt.forEach((n, ek) => { if (n === 1) edges.push(seg.get(ek).map(mm)); });
      if (edges.length && ca > 0) steps.push({ z: k / 1000, edges, c: [mm(cx / ca), mm(cy / ca)] });
    });
    return steps.length ? { steps, path: steps.map(st => st.c) } : null;
  }
  function stairMark(doc, e, zLo, zHi, log) {
    const R = stairSteps(e, zLo, zHi); if (!R) return 0;
    R.steps.forEach(st => st.edges.forEach(g => doc.line('A-FLOR-STRS', [g[0], g[1]], [g[2], g[3]], tag(e.guid))));
    if (R.path.length >= 2) {
      const pth = R.path; doc.lwpoly('A-FLOR-STRS', pth, false, tag(e.guid));
      const a = pth[pth.length - 2], b = pth[pth.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d, h = 250;
      doc.lwpoly('A-FLOR-STRS', [b, [b[0] - ux * 2 * h + uy * h, b[1] - uy * 2 * h - ux * h], [b[0] - ux * 2 * h - uy * h, b[1] - uy * 2 * h + ux * h]], true, tag(e.guid));
      doc.text('A-FLOR-STRS', 'UP', [pth[0][0], pth[0][1]], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER', guid: e.guid });
    }
    log.add(`§STAIR_STEPS guid=${e.guid} steps=${R.steps.length} z=${fx(R.steps[0].z, 3)}..${fx(R.steps[R.steps.length - 1].z, 3)}`); return R.steps.length;
  }
  // §F7 scale bar (opt-in: opts.scaleBar === true): a 5 m bar in five 1 m segments (alternate segments filled), labelled 0 and 5 m, at the lower left level with the sheet title; drawn at the sheet's own
  // scale (1:SCALE, sheet units = model mm), so it is a derivation, not a value.
  function scaleBarMark(doc, E) {
    const x0 = E[0] + 1500, y0 = E[2] - (BUBBLE_C + 14) * SCALE + 300, seg = 1000, h = 200;
    doc.line('A-ANNO-TTLB', [x0, y0], [x0 + 5 * seg, y0]);
    for (let i = 0; i < 5; i++) { const a = x0 + i * seg, r = [[a, y0], [a + seg, y0], [a + seg, y0 + h], [a, y0 + h]]; doc.lwpoly('A-ANNO-TTLB', r, true); if (i % 2 === 0) doc.hatch('A-ANNO-TTLB', 7, r); }
    doc.text('A-ANNO-TTLB', '0', [x0, y0 - 350], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER' }); doc.text('A-ANNO-TTLB', '5 m', [x0 + 5 * seg, y0 - 350], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER' });
  }
  // one leaf: the open line from the hinge along +Y and the arc from the closed direction to +Y (the same drawing as a single swing)
  function drawLeaf(doc, d, L, layer) {
    layer = layer || 'A-DOOR';
    if (layer === 'A-DOOR-DFLT' && !doc.layers[layer]) doc.layers = Object.assign({}, doc.layers, { 'A-DOOR-DFLT': [2, 25, 'Continuous'] });   // only a sheet that draws a default carries the yellow layer
    const H = L.hinge, w = L.width, Y = L.Y, C = L.closed, hm = [mm(H[0]), mm(H[1])], O = [H[0] + w * Y[0], H[1] + w * Y[1]];
    doc.line(layer, hm, [mm(O[0]), mm(O[1])], tag(d.guid));
    const ac = Math.atan2(C[1], C[0]) * 180 / Math.PI, ao = Math.atan2(Y[1], Y[0]) * 180 / Math.PI, ccw = C[0] * Y[1] - C[1] * Y[0] > 0, mod = a => ((a % 360) + 360) % 360, st = ccw ? ac : ao, en = ccw ? ao : ac;
    doc.arc(layer, hm, mm(w), Number(mod(st).toFixed(6)), Number(mod(en).toFixed(6)), tag(d.guid));
  }
  // §F7 D23: a door drawn by the IFC convention or the standard stands on its bbox centre across the door; when that centre lies OFF its host wall's drawn contour
  // (LTU overhead doors: the bbox holds a 3.1 m track, the centre stood 1.55 m inside the room) the hinge line is the host contour's centre across the door,
  // from the contour vertices within the door's half width + 1 m along it. undefined = no frame / no host contour / the centre is in the wall (nothing changes)
  function acrossFromHost(model, d, op, polys, log) {
    const h = model.host_all && model.host_all[d.guid], C = h !== undefined ? polys[h] : null; if (!C || !C.length || !op || !op.x || !op.y || !op.w) return undefined;
    const X = [op.x[0], op.x[1]], Y = [op.y[0], op.y[1]]; if (!horizFrame(X, Y)) return undefined;
    const cn = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]], cs = cn.map(c => c[0] * X[0] + c[1] * X[1]), ct = cn.map(c => c[0] * Y[0] + c[1] * Y[1]);
    const sc = (Math.min(...cs) + Math.max(...cs)) / 2, tb = (Math.min(...ct) + Math.max(...ct)) / 2, w = Number(op.w);
    const near = [].concat(...C).map(p => [p[0] / 1000, p[1] / 1000]).filter(p => Math.abs(p[0] * X[0] + p[1] * X[1] - sc) <= w / 2 + 1); if (near.length < 2) return undefined;
    const ts = near.map(p => p[0] * Y[0] + p[1] * Y[1]), t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (tb >= t0 - 0.001 && tb <= t1 + 0.001) return undefined;
    const tc = (t0 + t1) / 2; log.add(`§DOOR_ACROSS_HOST guid=${d.guid} host=${h} bbox_centre_across=${fx(tb, 4)} host_contour=${fx(t0, 4)}..${fx(t1, 4)} -> ${fx(tc, 4)} (D23: the bbox centre is off its wall)`); return tc;
  }
  // §F7 D18 the building's RUNNING STANDARD for a door whose operation the IFC does not state: from its own stated single-swing doors (widest leaf, majority side; ties LEFT). null = none stated
  function doorStandard(model) {
    if (model._doorStd !== undefined) return model._doorStd;
    const st = Object.values(model.door_ops || {}).filter(o => SINGLE_SWING.indexOf(o.op) >= 0 && Number(o.w) > 0), L = st.filter(o => o.op.endsWith('LEFT')).length;
    model._doorStd = st.length ? { n: st.length, left: L, right: st.length - L, side: L >= st.length - L ? 'LEFT' : 'RIGHT', maxW: Math.max(...st.map(o => Number(o.w))), minW: Math.min(...st.map(o => Number(o.w))) } : null;
    return model._doorStd;
  }
  function doorDefault(d, op, std) {
    if (!std) return ['GAP:door_hinge', 'operation not stated and the building states no single-swing door: no standard to draw from (D18)'];
    if (!op || !op.w) return ['GAP:door_hinge', 'operation not stated and no OverallWidth: the standard cannot place it (D18)'];
    const dbl = Number(op.w) > std.maxW && Number(op.w) / 2 >= std.minW, as = Object.assign({}, op, { op: dbl ? 'DOUBLE_DOOR_SINGLE_SWING' : 'SINGLE_SWING_' + std.side });
    const [c, r] = dbl ? doorDouble(d, as) : doorHingeIfc(d, as); if (c !== 'ok') return [c, r + ' (D18 default)'];
    return ['ok', { leaves: dbl ? r.leaves : [r], value: as.op, basis: `${std[std.side.toLowerCase()]} of ${std.n} stated single-swing doors swing ${std.side}; single leaves ${fx(std.minW * 1000, 0)}..${fx(std.maxW * 1000, 0)} mm; this door ${fx(op.w * 1000, 0)} mm -> ${dbl ? 'double (wider than any stated leaf, each half within the stated range)' : 'single'}` }];
  }
  // §F7 D22 ROOMS on the plans, from the caller (the Viewer's Room Injection, A.allRoomVolumes): rects in model metres, grouped by logical room guid; turned with the wing,
  // kept by the box (label point in the box), placed on the plan of the storey whose elevation is the highest <= the room's mid height. Compiled rooms (guid RM_*) are YELLOW.
  function loadRooms(model, rooms, src, wing, log) {
    if (!Array.isArray(rooms) || !rooms.length) return;
    const by = {}, order = []; let bad = 0;
    rooms.forEach(r => { if (!r || ![r.cx, r.cy, r.cz, r.sx, r.sy].every(Number.isFinite) || !(r.sx > 0 && r.sy > 0)) { bad++; return; } const g = String(r.guid || '');
      if (!by[g]) { by[g] = { guid: g, name: String(r.name || ''), compiled: /^RM_/.test(g), rects: [] }; order.push(g); } by[g].rects.push(r); });
    const th = wing ? -wing.angle * Math.PI / 180 : 0, co = Math.cos(th), si = Math.sin(th), T = (x, y) => wing ? [co * (x - wing.ox) - si * (y - wing.oy) + wing.ox, si * (x - wing.ox) + co * (y - wing.oy) + wing.oy] : [x, y];
    model.rooms = order.map(g => { const R = by[g], big = R.rects.slice().sort((a, b) => b.sx * b.sy - a.sx * a.sy)[0];
      return { guid: g, name: R.name, compiled: R.compiled, at: T(big.cx, big.cy), cz: R.rects.reduce((a, r) => a + r.cz, 0) / R.rects.length, area: R.rects.reduce((a, r) => a + r.sx * r.sy, 0), n: R.rects.length }; });
    model.roomsSource = String(src || 'not stated');
    log.add(`§ROOMS source="${model.roomsSource}" rects=${rooms.length} rooms=${model.rooms.length} compiled=${model.rooms.filter(r => r.compiled).length} malformed=${bad} (D22)`);
  }
  function boxRooms(model, bx, log) {
    if (!model.rooms) return; const n0 = model.rooms.length;
    model.rooms = model.rooms.filter(r => r.at[0] >= bx.a && r.at[0] < bx.b && r.at[1] >= bx.y0 && r.at[1] < bx.y1);
    log.add(`§ROOMS_BOX kept=${model.rooms.length}/${n0} (label point in the box)`);
  }
  function roomLabel(r, storey) {   // the name as given, without its leading marks (the compiler's approximate / suspect signs) or the storey name it repeats
    let t = r.name.replace(/^[^A-Za-z0-9]+/, '').trim(); if (storey && t.toLowerCase().indexOf(storey.name.toLowerCase() + ' ') === 0) t = t.slice(storey.name.length + 1).trim();
    return t || r.guid;
  }
  function planRooms(doc, model, storey, E, log) {
    if (!model.rooms || !model.rooms.length) return 0;
    const st = model.storeys.slice().sort((a, b) => a.elev - b.elev), mine = model.rooms.filter(r => { let o = null; st.forEach(s => { if (s.elev <= r.cz) o = s; }); return o && o.name === storey.name; });
    if (!mine.length) return 0;
    mine.forEach(r => { const layer = r.compiled ? 'A-AREA-IDEN-DFLT' : 'A-AREA-IDEN';
      if (!doc.layers[layer]) doc.layers = Object.assign({}, doc.layers, { [layer]: [r.compiled ? 2 : 7, 25, 'Continuous'] });   // only a sheet that draws a room carries the layer
      const txt = roomLabel(r, storey), p = [mm(r.at[0]), mm(r.at[1])], h = TXT_NOTE * SCALE;
      doc.text(layer, txt.toUpperCase(), [p[0], p[1] + h * 0.7], h, { align: 'MIDDLE_CENTER' }); doc.text(layer, `${fx(r.area, 1)} M2`, [p[0], p[1] - h * 0.7], h, { align: 'MIDDLE_CENTER' });
      log.add(`§ROOM_LABEL guid=${r.guid} storey='${storey.name}' at=(${fx(p[0], 1)},${fx(p[1], 1)}) layer=${layer} text="${txt}" area=${fx(r.area, 2)} rects=${r.n} (D22)`); });
    const nc = mine.filter(r => r.compiled).length;
    doc.text('A-ANNO-NOTE', `ROOMS: ${mine.length} FROM ${model.roomsSource.toUpperCase()}${nc ? `; YELLOW = ${nc} COMPILED FROM THE WALL ENCLOSURE, NOT IN THE IFC` : ''}`, [E[0], E[2] - (BUBBLE_C + 32) * SCALE], TXT_NOTE * SCALE, { align: 'BOTTOM_LEFT' });
    log.add(`§ROOMS_PLAN storey='${storey.name}' drawn=${mine.length} compiled=${nc} (D22)`);
    return mine.length;
  }
  // ───────────────────────── §D70.1 the slab edge as plans are drafted ─────────────────────────
  // rings are closed ([..., first]) in metres; P = polygon-clipping MultiPolygon
  const ringArea = r => { let a = 0; for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
  const mpArea = P => P.reduce((s, p) => s + Math.abs(ringArea(p[0])) - p.slice(1).reduce((t, h) => t + Math.abs(ringArea(h)), 0), 0);
  const ringBox = r => r.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const closeRing = pts => { const r = pts.map(q => [Number(q[0].toFixed(6)), Number(q[1].toFixed(6))]); r.push(r[0].slice()); return r; };
  function convexHull(pts) {   // monotone chain, closed ring (CCW)
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1)); h.push(h[0].slice()); return h;
  }
  function edgeSweeps(P, h) {   // the boundary of P swept by a square of half-side h: one convex hull per edge (Minkowski sum of a segment and an axis-aligned square)
    const out = [], sq = c => [[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]];
    P.forEach(p => p.forEach(r => { for (let i = 0; i + 1 < r.length; i++) out.push([convexHull(sq(r[i]).concat(sq(r[i + 1])))]); }));
    return out;
  }
  function closing(P, w) {   // morphological closing by a square of side w: dilate (P plus its swept boundary), then erode (minus the swept boundary of the dilation). Rectilinear corners stay exact.
    if (!(w > 0) || !P.length) return P;
    const D = PC.union(P, ...edgeSweeps(P, w / 2));
    return PC.difference(D, ...edgeSweeps(D, w / 2)).map(p => p.map(r => closeRing(r.slice(0, -1))));
  }
  function slabsAt(model, storey) {   // §D70 window
    const roofG = new Set(model.roofs.map(r => r.guid));
    return model.els.filter(e => e.cls === 'IfcSlab' && !roofG.has(e.guid) && e.v.length && e.f.length && e.z1 >= storey.elev - SLAB_TOP_BELOW && e.z1 <= storey.elev + SLAB_TOP_ABOVE && e.z1 - e.z0 >= SLAB_MIN_THICK)
      .sort((a, b) => (a.guid < b.guid ? -1 : 1));
  }
  // model: the loaded model; drawn: [ring m] the contours of the columns and walls this plan draws. Returns { pieces: [[outer, ...holes]] (closed rings, m), report } or null (no slab in the window)
  function slabEdge(model, storey, drawn, log) {
    const t0 = Date.now(), sl = slabsAt(model, storey); if (!sl.length) return null;
    const o = Object.assign({}, SLAB_EDGE, model.slabEdge || {});
    // §D75 level groups: slabs whose tops lie closer than level_step_min are one group (finishes); each group is drawn as its own pieces carrying its top and thickness
    const byTop = sl.slice().sort((a, b) => a.z1 - b.z1 || (a.guid < b.guid ? -1 : 1)), groups = [];
    byTop.forEach(e => { const g = groups[groups.length - 1]; if (g && e.z1 - g.last < o.level_step_min - 1e-9) { g.els.push(e); g.last = e.z1; } else groups.push({ els: [e], last: e.z1 }); });
    let bad = 0;
    groups.forEach(g => {
      g.U = [];
      g.els.forEach(e => {   // even-odd per element: the slicer's ring orientation is arbitrary (§D70.1 correction), its parity is not
        const cs = G.elementContours(e.v, e.f, e.c, (e.z0 + e.z1) / 2); if (!cs.length) { bad++; return; }
        try { const P = PC.xor(...cs.map(c => [[closeRing(c.points)]])); g.U = g.U.length ? PC.union(g.U, P) : P; } catch (x) { bad++; }
      });
      g.area = mpArea(g.U);
      const rep0 = g.els.slice().sort((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0)) || (a.guid < b.guid ? -1 : 1))[0];   // the group's largest slab states its level
      g.top = rep0.z1; g.thick = rep0.z1 - rep0.z0;
    });
    groups.sort((a, b) => b.area - a.area || a.top - b.top);
    const D = drawn.map(r => ({ r, b: ringBox(r) }));
    const rep = { slabs: sl.length, no_contour: bad, union_m2: 0, closed_m2: 0, holes_kept: 0, holes_filled_drawn: 0, holes_filled_small: 0, filled_m2: 0, pieces_dropped: 0, dropped_m2: 0, joint: o.joint_close, void_min: o.void_min_area, groups: groups.length, overlap_m2: 0, step: o.level_step_min };
    const pieces = [], levels = []; let prev = null;
    groups.forEach(g => {
      let U = g.U; if (prev && U.length) { try { const c = PC.difference(U, prev); rep.overlap_m2 += g.area - mpArea(c); U = c; } catch (x) { /* an unclippable pair keeps the group whole */ } }
      rep.union_m2 += mpArea(U); let C = U;
      try { C = closing(U, o.joint_close); } catch (x) { log.add(`§SLAB_EDGE_CLOSING_FAIL storey='${storey.name}' ${String(x.message).slice(0, 80)} (the union drawn unclosed)`); }
      if (prev && C.length) { try { C = PC.difference(C, prev).map(p => p.map(r => closeRing(r.slice(0, -1)))); } catch (x) { /* kept */ } }
      rep.closed_m2 += mpArea(C);
      C.forEach(p => {
        const holes = [];
        p.slice(1).forEach(h => {
          const a = Math.abs(ringArea(h)), hb = ringBox(h); let cov = 0;
          D.filter(d => d.b[0] < hb[2] && d.b[2] > hb[0] && d.b[1] < hb[3] && d.b[3] > hb[1]).forEach(d => { try { cov += mpArea(PC.intersection([[h]], [[d.r]])) / a; } catch (x) { /* an unclippable pair covers nothing */ } });
          if (cov >= EDGE_COVER) { rep.holes_filled_drawn++; rep.filled_m2 += a; } else if (a < o.void_min_area) { rep.holes_filled_small++; rep.filled_m2 += a; } else { rep.holes_kept++; holes.push(h); }
        });
        const pa = Math.abs(ringArea(p[0])) - holes.reduce((t, h) => t + Math.abs(ringArea(h)), 0);
        if (pa < o.void_min_area) { rep.pieces_dropped++; rep.dropped_m2 += pa; return; }
        pieces.push([p[0]].concat(holes)); levels.push({ top: g.top, thick: g.thick, group: groups.indexOf(g) });
      });
      prev = prev ? PC.union(prev, C) : C;
    });
    rep.drawn_m2 = mpArea(pieces); rep.pieces = pieces.length; rep.ms = Date.now() - t0;
    log.add(`§SLAB_EDGE storey='${storey.name}' slabs=${rep.slabs} no_contour=${bad} union_m2=${fx(rep.union_m2, 2)} closed_m2=${fx(rep.closed_m2, 2)} pieces=${rep.pieces} drawn_m2=${fx(rep.drawn_m2, 2)} holes_kept=${rep.holes_kept} holes_filled_drawn=${rep.holes_filled_drawn} holes_filled_small=${rep.holes_filled_small} filled_m2=${fx(rep.filled_m2, 2)} pieces_dropped=${rep.pieces_dropped} dropped_m2=${fx(rep.dropped_m2, 3)} joint=${o.joint_close} void_min=${o.void_min_area} ms=${rep.ms} (§D70.1)`);
    log.add(`§SLAB_LEVELS storey='${storey.name}' groups=${groups.length} step=${o.level_step_min} main_top=${fx(groups[0].top, 3)} overlap_m2=${fx(rep.overlap_m2, 4)} tops=${groups.map(g => fx(g.top, 3) + '/' + fx(g.thick, 3)).join(' ')} (§D75)`);
    return { pieces, levels, mainTop: groups[0].top, report: rep };
  }

  function writePlan(model, grid, storey, view, log) {
    log.add(`§VIEW ${view} storey='${storey.name}' elev=${fx(storey.elev, 4)}`);
    const doc = newDoc(), cutZ = storey.elev + CUT_OFFSET;
    const cut = model.els.filter(e => PLAN_CUT_CLASSES.indexOf(e.cls) >= 0 && e.v.length && e.f.length && e.z0 < cutZ && cutZ < e.z1).sort((a, b) => (a.guid < b.guid ? -1 : 1));
    const sw = model.walls.filter(w => w.z0 < cutZ && cutZ < w.z1), other = sw.filter(w => w.storey !== storey.name).map(w => w.guid + '@' + w.storey).sort();
    log.add(`§PLAN_CUT view=${view} cut_z=${fx(cutZ, 3)} walls=${sw.length} (other-storey walls=${other.length}: ${other.join(' ')})`);
    const curt = curtainBands(model, cutZ, log);   // §L1.14
    let env = envelope(sw);
    Object.values(curt).forEach(c => { env = [Math.min(env[0], c.env[0]), Math.max(env[1], c.env[1]), Math.min(env[2], c.env[2]), Math.max(env[3], c.env[3])]; });   // C3
    const E = env.map(mm), faceRuns = { S: [], N: [], W: [], E: [] }, onAxis = new Set();
    for (const w of sw) { const dw = drawnWall(model, w, cutZ) || w, [ax, pos] = wallAxis(dw); if (grid[ax].some(g => Math.abs(pos - g[1]) <= GRID_MERGE_TOL)) onAxis.add(w.guid); }   // D25: the drawn axis
    const polys = {};
    cut.forEach(c => {
      polys[c.guid] = cutContours(model, c, cutZ).map(ct => ct.points.map(p => [mm(p[0]), mm(p[1])])).filter(p => p.length >= 3);
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
    if (model.rules.l119) cut.forEach(c => { polys[c.guid] = (polys[c.guid] || []).map(pl => { const q = dropCollinear(pl); if (q.length !== pl.length) log.add(`§COLLINEAR_DROP guid=${c.guid} cls=${c.cls} before=${pl.length} after=${q.length}`); return q; }); });   // §L1.19 (wing sets)
    if (model.rules.l121) cut.forEach(c => {   // §L1.21: a door whose swing cannot be drawn is ONE footprint rectangle (a door WITH an arc is not touched)
      if (c.cls !== 'IfcDoor') return;
      const parts = polys[c.guid] || []; if (parts.length < 2) return;
      const sw_ = doorSwing(c), op = model.door_ops[c.guid], code = (sw_ ? doorHinge(c, op, sw_) : doorHingeIfc(c, op))[0];
      if (code === 'ok' || code === 'GAP:door_handing_conflict' && doorHingeIfc(c, op)[0] === 'ok') return;   // §F7 D19: a handing conflict is drawn (yellow)
      const axisRect = P => P.length === 4 && P.every((q, i) => { const n = P[(i + 1) % 4]; return Math.abs(q[0] - n[0]) <= 0.001 || Math.abs(q[1] - n[1]) <= 0.001; });
      if (!parts.every(axisRect)) { log.add(`§DOOR_NOSWING_SKIP guid=${c.guid} reason=part_not_axis_rect`); return; }
      const xs = [].concat(...parts.map(P => P.map(q => q[0]))), ys = [].concat(...parts.map(P => P.map(q => q[1]))), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      polys[c.guid] = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
      log.add(`§DOOR_NOSWING_BBOX guid=${c.guid} parts=${parts.length} bbox=${fx(x1 - x0, 1)} x ${fx(y1 - y0, 1)} mm (${code})`);
    });
    Object.keys(curt).forEach(g => { const r = curt[g].rect; polys[g] = [[[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]]; });   // C1
    // §F6 D10: the face the wall-run dimension points are measured against is the DRAWN face (the contours of the walls and curtain bands drawn on this plan), as the reader's envelope is: the model bounding box can stand 25 mm outside the drawn contour on a rotated wing (Hospital Level 1), which left 22 wall ends without a dimension point
    const dr = [Infinity, -Infinity, Infinity, -Infinity], sideOf = pl => { const xs = pl.map(q => q[0]), ys = pl.map(q => q[1]); return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 1000; };
    const gidsF = cut.filter(c => WALLS.indexOf(c.cls) >= 0).map(c => c.guid).concat(Object.keys(curt));
    // (e) the reader does not read a piece thinner than the plan's reading limit (D11: the thinnest piece >= 10 mm when some are under the 50 mm default, else 50 mm): such a piece is not part of its envelope either
    const thinSides = []; gidsF.forEach(g => (polys[g] || []).forEach(pl => { const t = sideOf(pl); if (t >= 0.010 && t < 0.05) thinSides.push(t); }));
    const readMin = thinSides.length ? Math.floor(Math.min(...thinSides) * 1000) / 1000 : 0.05;
    gidsF.forEach(g => (polys[g] || []).forEach(pl => { if (sideOf(pl) < readMin - 1e-9) return; pl.forEach(q => { dr[0] = Math.min(dr[0], q[0]); dr[1] = Math.max(dr[1], q[0]); dr[2] = Math.min(dr[2], q[1]); dr[3] = Math.max(dr[3], q[1]); }); }));
    const F = isFinite(dr[0]) ? dr : E;
    const ops = planOpenings(model, storey, cutZ, new Set(sw.map(w => w.guid).concat(Object.keys(curt))), polys, log);
    let nW = 0, nC = 0, thinRun = 0, colRun = 0;
    for (const c of cut) for (const pts of (polys[c.guid] || [])) {
      if (WALLS.indexOf(c.cls) >= 0 || c.cls === 'IfcColumn') {
        if (c.cls === 'IfcColumn') {
          const layer = model.psets[c.guid + '|LoadBearing'] === 'FALSE' ? 'A-COLS' : 'S-COLS';
          doc.lwpoly(layer, pts, true, tag(c.guid)); doc.hatch(layer, 256, pts, tag(c.guid)); nC++;
        } else {
          doc.lwpoly(onAxis.has(c.guid) ? 'A-WALL-FULL' : 'A-WALL-PRTN', pts, true, tag(c.guid)); doc.hatch('A-WALL-PATT', 8, pts); nW++;
        }
        [['S', q => Math.abs(q[1] - F[2]) <= FACE_PT_TOL * 1000, 0], ['N', q => Math.abs(q[1] - F[3]) <= FACE_PT_TOL * 1000, 0],
         ['W', q => Math.abs(q[0] - F[0]) <= FACE_PT_TOL * 1000, 1], ['E', q => Math.abs(q[0] - F[1]) <= FACE_PT_TOL * 1000, 1]].forEach(([side, on, along]) => {
          const run = pts.some(on) ? pts.map(q => q[along]) : [];   // D10: a piece touching the face counts with its whole extent along it (the reader reads a wall piece as its bounding rectangle)
          if (run.length >= 2 && Math.max(...run) - Math.min(...run) > PT_MERGE * 1000) { if (c.cls === 'IfcColumn') { colRun++; return; } if (sideOf(pts) < readMin - 1e-9) { thinRun++; return; } faceRuns[side].push([Math.min(...run), Math.max(...run)]); }   // D27: a column, or a piece the reader does not read, is in no wall run
        });
      } else if (c.cls === 'IfcStair' || c.cls === 'IfcStairFlight') doc.lwpoly('A-FLOR-STRS', pts, true, tag(c.guid));
      else doc.lwpoly(c.cls === 'IfcDoor' ? 'A-DOOR' : 'A-GLAZ', pts, true, tag(c.guid));
    }
    if (model.stairSymbol !== false) cut.filter(c => c.cls === 'IfcStair' || c.cls === 'IfcStairFlight').forEach(c => stairMark(doc, c, storey.elev, cutZ, log));   // §F7: treads + up arrow from the mesh
    // §D70.1 the slab edge: the floor outline with its real openings (no plank joints), from the slabs at this level; the columns and walls this plan draws fill the holes they stand in
    const se = slabEdge(model, storey, [].concat(...cut.filter(c => WALLS.indexOf(c.cls) >= 0 || c.cls === 'IfcColumn').map(c => (polys[c.guid] || []).map(pl => closeRing(pl.map(q => [q[0] / 1000, q[1] / 1000]))))), log);
    if (se) se.pieces.forEach((p, i) => { const L = se.levels[i], lv = { elevation: mm(L.top), thickness: mm(L.thick) };   // §D75 the piece's own top level and thickness (DXF groups 38 / 39)
      p.forEach(r => doc.lwpoly('A-FLOR-OTLN', r.slice(0, -1).map(q => [mm(q[0]), mm(q[1])]), true, lv));
      if (Math.abs(L.top - se.mainTop) > 1e-6) doc.lwpoly('A-FLOR-LEVL', p[0].slice(0, -1).map(q => [mm(q[0]), mm(q[1])]), true, lv); });   // a level change from the storey's main level: its own layer (level-change line)
    log.add(`§PLAN wall contours=${nW} column contours=${nC} cut_z=${fx(cutZ, 3)}`);
    let nCw = 0;
    Object.keys(curt).sort().forEach(g => (polys[g] || []).forEach(pts => {   // C1: layer A-WALL-CURT, tagged with the curtain wall GUID, no hatch (glazing)
      doc.lwpoly('A-WALL-CURT', pts, true, tag(g)); nCw++;
      [['S', q => Math.abs(q[1] - F[2]) <= FACE_PT_TOL * 1000, 0], ['N', q => Math.abs(q[1] - F[3]) <= FACE_PT_TOL * 1000, 0],
       ['W', q => Math.abs(q[0] - F[0]) <= FACE_PT_TOL * 1000, 1], ['E', q => Math.abs(q[0] - F[1]) <= FACE_PT_TOL * 1000, 1]].forEach(([side, on, along]) => {
        const run = pts.some(on) ? pts.map(q => q[along]) : [];   // D10: a piece touching the face counts with its whole extent along it (the reader reads a wall piece as its bounding rectangle)
        if (run.length >= 2 && Math.max(...run) - Math.min(...run) > PT_MERGE * 1000) { if (sideOf(pts) < readMin - 1e-9) { thinRun++; return; } faceRuns[side].push([Math.min(...run), Math.max(...run)]); }   // D27
      });
    }));
    if (thinRun || colRun) log.add(`§FACE_RUN_DROP view=${view} thin=${thinRun} (pieces under the reading limit ${fx(readMin, 3)} m) columns=${colRun} touching a face: not wall-run points (D30)`);
    if (Object.keys(curt).length) log.add(`§PLAN curtain walls=${nCw}`);
    const nO = { above: 0, below: 0 };
    for (const [e, pos] of ops) {
      if (pos === 'cut') continue;
      const door = e.cls === 'IfcDoor', layer = pos === 'above' ? (door ? 'A-DOOR-OVHD' : 'A-GLAZ-OVHD') : (door ? 'A-DOOR' : 'A-GLAZ');
      const x0 = mm(e.x0), x1 = mm(e.x1), y0 = mm(e.y0), y1 = mm(e.y1);
      doc.lwpoly(layer, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, tag(e.guid)); nO[pos]++;
    }
    log.add(`§PLAN openings above cut=${nO.above} (dashed) below cut=${nO.below}`);
    const dflt = [], dfltAt = {}, conf = [];   // conf: §F7 D19 doors whose mesh contradicts their stated handing (yellow)   // §F7 D18 doors drawn from the building's standard (yellow); a default is drawn once per footprint
    for (const d of model.els.filter(e => e.cls === 'IfcDoor' && ofPlan(storey, e))) {
      const op = model.door_ops[d.guid], cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2; let basis = '', code, res;
      d._tc = acrossFromHost(model, d, op, polys, log);   // §F7 D23
      const oY = op && op.x && op.y ? [op.y[0], op.y[1]] : null, angled = oY && horizFrame([op.x[0], op.x[1]], oY) && !axisAligned([op.x[0], op.x[1]], oY);
      if (!op || SINGLE_SWING.indexOf(op.op) < 0 && op.op !== 'DOUBLE_DOOR_SINGLE_SWING') {   // §F7 D18: the operation is not stated: the building's running standard, YELLOW (A-DOOR-DFLT), never A-DOOR
        const fk = [d.x0, d.x1, d.y0, d.y1].map(v => Math.round(v * 1000)).join(',');
        if (dfltAt[fk]) { log.add(`§DOOR_DEFAULT_DUP guid=${d.guid} same footprint as ${dfltAt[fk]}: two door elements at one place in the model, the default drawn once (finding)`); continue; }
        const [fc, fr] = doorDefault(d, op, doorStandard(model)); if (fc !== 'ok') { log.gap(fc, d.guid, fr); continue; } dfltAt[fk] = d.guid;
        fr.leaves.forEach(L => drawLeaf(doc, d, L, 'A-DOOR-DFLT')); dflt.push(d.guid);
        log.add(`§DOOR_DEFAULT guid=${d.guid} op_stated=${op ? op.op : 'none'} drawn=${fr.value} leaves=${fr.leaves.length} layer=A-DOOR-DFLT basis="${fr.basis}" (D18)`); continue;
      }
      if (op && op.op === 'DOUBLE_DOOR_SINGLE_SWING') {   // §F7 D17
        const [dc, dr] = doorDouble(d, op); if (dc !== 'ok') { log.gap(dc, d.guid, dr); continue; }
        dr.leaves.forEach(L => drawLeaf(doc, d, L)); log.add(`§DOOR_ARC guid=${d.guid} op=${op.op} source=${op.source} leaves=2 width=${fx(dr.leaves[0].width * 2000, 1)} basis=ifc_convention_double (D17)`); continue;
      }
      const sw_ = angled ? doorSwingFrame(d, oY) : doorSwing(d);   // §F7 D16: an angled door's leaf is found along its own Y
      if (!sw_) {   // §L1.12: no leaf offset in the mesh: the IFC-stated swing, or the gap as before
        [code, res] = doorHingeIfc(d, op);
        if (code !== 'ok') { log.gap(code, d.guid, res); continue; }
        basis = axisAligned(res.X, res.Y) ? ' basis=ifc_convention' : ' basis=ifc_convention_rotated';
        log.add(`§DOOR guid=${d.guid} swing=ifc_convention (R9 leaf offset not found; opens toward +Y of the IFC placement)`);
      } else {
        var ta = sw_[0], sgn = sw_[1];
        log.add(`§DOOR guid=${d.guid} swing_axis=${ta} swing_sign=${sgn > 0 ? '+1' : '-1'} (R9 leaf offset)`);
        [code, res] = doorHinge(d, op, sw_);
        if (code === 'GAP:door_handing_conflict') {   // §F7 D19: the stated handing outranks the R9 inference, drawn YELLOW (unchecked), the conflict stated; unplaceable keeps the GAP
          const [ic, ir] = doorHingeIfc(d, op);
          if (ic === 'ok') {
            drawLeaf(doc, d, ir, 'A-DOOR-DFLT'); conf.push(d.guid);
            log.add(`§DOOR_HANDING_CONFLICT guid=${d.guid} ${res} (finding)`);
            log.add(`§DOOR_DEFAULT guid=${d.guid} op_stated=${op.op} drawn=${op.op} leaves=1 layer=A-DOOR-DFLT basis="handing conflict: the mesh leaf lies on the -Y side, the IFC opens +Y; drawn as the IFC states (§L1.12)" (D19)`);
            continue;
          }
        }
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
      if (ta === 'frame') continue;   // D16: no axis-aligned spot for the HINGE ? note of an angled door; the gap line states it
      const half = (ta === 'x' ? d.x1 - d.x0 : d.y1 - d.y0) / 2, off = half + 0.2;
      const [nx, ny] = ta === 'x' ? [cx + sgn * off, cy] : [cx, cy + sgn * off];
      doc.text('A-ANNO-NOTE', 'HINGE ?', [mm(nx), mm(ny)], TXT_NOTE * SCALE, { align: 'MIDDLE_CENTER', rot: ta === 'x' ? 90 : 0, guid: d.guid });
    }
    const seen = new Set();
    for (const wd of model.els.filter(e => e.cls === 'IfcWindow' && ofPlan(storey, e))) {
      const host = model.by_guid[model.host_all[wd.guid]];
      if (!host || WALLS.indexOf(host.cls) < 0) { log.gap('GAP:window_no_host', wd.guid, 'no wall host (rel_fills_host or mesh void, §L1.6 O1)'); continue; }
      const segs = wallAxis(host)[0] === 'y' ? [host.y0, host.y1].map(f => [[mm(wd.x0), mm(f)], [mm(wd.x1), mm(f)]]) : [host.x0, host.x1].map(f => [[mm(f), mm(wd.y0)], [mm(f), mm(wd.y1)]]);
      for (const s of segs) { const key = JSON.stringify(s); if (seen.has(key)) continue; seen.add(key); doc.line('A-GLAZ-SILL', s[0], s[1], tag(wd.guid)); }
    }
    gridPlan(doc, E, grid);
    planDims(doc, E, grid, log, view, faceRuns, F);
    doc.text('A-ANNO-TTLB', `${storey.name.toUpperCase()} PLAN (FFL ${fs(storey.elev, 3)})  1:${SCALE}`, [(E[0] + E[1]) / 2, E[2] - (BUBBLE_C + 14) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    northMark(doc, model.north, E, log); if (model.scaleBar === true) scaleBarMark(doc, E);
    planRooms(doc, model, storey, E, log);   // §F7 D22
    if (se && se.pieces.length) { const o = Object.assign({}, SLAB_EDGE, model.slabEdge || {});   // §D70.1 the drafted edge states its two values on the sheet (a general note), as the yellow doors do
      doc.text('A-ANNO-NOTE', `SLAB EDGE (A-FLOR-OTLN): JOINTS UNDER ${fx(o.joint_close * 1000, 0)} MM CLOSED, OPENINGS UNDER ${fx(o.void_min_area, 4)} M2 AND HOLES A COLUMN OR WALL FILLS NOT SHOWN (DEFAULTS, element_defaults.json)`, [E[0], E[2] - (BUBBLE_C + 32) * SCALE], TXT_NOTE * SCALE, { align: 'BOTTOM_LEFT' }); }
    if (dflt.length) {   // §F7 D18: the yellow band states itself on the sheet (the basis), and the set carries @DEFAULT=door.operation_standard (marks)
      const sd = doorStandard(model); model.doorDefaults = (model.doorDefaults || []).concat(dflt);
      doc.text('A-ANNO-NOTE', `YELLOW = DEFAULT: ${dflt.length} DOOR(S) THE MODEL GIVES NO OPERATION FOR, DRAWN FROM THIS BUILDING'S STANDARD (${sd.left} LEFT / ${sd.right} RIGHT OF ${sd.n} STATED; SINGLE LEAVES ${fx(sd.minW * 1000, 0)}-${fx(sd.maxW * 1000, 0)} MM)`, [E[0], E[2] - (BUBBLE_C + 20) * SCALE], TXT_NOTE * SCALE, { align: 'BOTTOM_LEFT' });
      log.add(`§DOOR_STANDARD storey='${storey.name}' defaults=${dflt.length} stated=${sd.n} left=${sd.left} right=${sd.right} side=${sd.side} widest_single=${fx(sd.maxW * 1000, 0)}mm`);
    }
    if (conf.length) {   // §F7 D19
      model.doorConflicts = (model.doorConflicts || []).concat(conf);
      doc.text('A-ANNO-NOTE', `YELLOW = UNCHECKED: ${conf.length} DOOR(S) WHOSE LEAF IN THE MODEL LIES ON THE OTHER SIDE THAN THE STATED SWING, DRAWN AS THE IFC STATES`, [E[0], E[2] - (BUBBLE_C + (dflt.length ? 26 : 20)) * SCALE], TXT_NOTE * SCALE, { align: 'BOTTOM_LEFT' });
      log.add(`§DOOR_CONFLICTS storey='${storey.name}' drawn_yellow=${conf.length} (D19)`);
    }
    doc.E = E;   // storey envelope (mm), for the scoped split (§L6)
    return doc;
  }

  // §F7 D26: the levels an elevation / the section draws are the levels the set STATES: each plan's @LEVEL, the roof plan's @LEVEL, T/ROOF (@ROOF); a storey without a plan in this set is not drawn (logged once per sheet)
  function levelsStated(model, log, tagName) {
    const gEl = model.storeys.find(s => s.name === model.grid_storey).elev, ps = planStoreys(model), rs = roofStorey(model), names = new Set(ps.map(s => s.name));
    const levels = ps.map(s => [s.name.toUpperCase(), s.elev]);
    if (rs && !names.has(rs.name)) { levels.push([rs.name.toUpperCase(), rs.elev]); names.add(rs.name); }
    if (model.roof_top !== null) levels.push(['T/ROOF', model.roof_top]);
    model.storeys.filter(s => s.elev >= gEl && !names.has(s.name)).forEach(s => log.add(`§LEVEL_UNSTATED ${tagName} storey='${s.name}' elev=${fx(s.elev, 4)}: no plan of this set states it, not drawn (D26)`));
    return levels.sort((a, b) => a[1] - b[1]);
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
    const env = buildingEnv(model, model.grid_storey, gEl), fv = { x0: env[0], x1: env[1], y0: env[2], y1: env[3] }[side];   // C3
    const hr = e => { const a = hp(e.x0, e.y0), b = hp(e.x1, e.y1); return [mm(Math.min(a, b)), mm(Math.max(a, b))]; };
    const rect = (h0, h1, z0, z1) => [[h0, mm(z0)], [h1, mm(z0)], [h1, mm(z1)], [h0, mm(z1)]];
    // §L1.18 (wing sets only, model.perStoreyEnv): a stepped building has a different outline per storey; the exterior walls of a storey are the walls on THAT storey's own envelope face
    const sideIdx = { x0: 0, x1: 1, y0: 2, y1: 3 }[side], storeyFace = {};
    if (model.rules.l118) model.storeys.forEach(s => { const sw = model.walls.filter(w => w.storey === s.name); if (sw.length) storeyFace[s.name] = envelope(sw)[sideIdx]; });
    const fw = model.walls.filter(w => vis.has(w.storey) && Math.abs(w[side] - (model.rules.l118 && w.storey in storeyFace ? storeyFace[w.storey] : fv)) <= EXT_FACE_TOL);
    fw.forEach(w => { const [h0, h1] = hr(w); doc.lwpoly('A-WALL', rect(h0, h1, w.z0, w.z1), true, tag(w.guid)); });
    const fcw = model.curtains.filter(c => Math.abs(c[side] - fv) <= EXT_FACE_TOL), pst = planStoreys(model);   // C4: an elevation rectangle PER STOREY with a band (importer pairing by storey level)
    fcw.forEach(w => { const [h0, h1] = hr(w); pst.forEach((ps, i) => {
      if (!curtainBands(model, ps.elev + CUT_OFFSET)[w.guid]) return;
      const zt = Math.min(i + 1 < pst.length ? pst[i + 1].elev : w.z1, w.z1);
      doc.lwpoly('A-WALL', rect(h0, h1, ps.elev, zt), true, tag(w.guid));
    }); });
    // §F8 D31: a curtain wall set into the facade (behind the face by more than 10 mm, at most the depth of the face's flush walls; for a stepped wing the storey's own face) is
    // visible: drawn per storey band on A-WALL-CURT, stated by @LAYER=A-WALL-CURT,elevcurtain (marks); a band wholly behind a flush wall rectangle is hidden, not drawn
    const xf = side === 'x0' || side === 'x1', par = w => xf ? (w.y1 - w.y0) > (w.x1 - w.x0) : (w.x1 - w.x0) > (w.y1 - w.y0), thick = w => xf ? w.x1 - w.x0 : w.y1 - w.y0, back = (c, ref) => side === 'x0' ? c.x0 - ref : side === 'x1' ? ref - c.x1 : side === 'y0' ? c.y0 - ref : ref - c.y1;
    const fcwSet = new Set(fcw.map(c => c.guid)), wr = fw.map(w => { const [h0, h1] = hr(w); return { h0, h1, z0: w.z0, z1: w.z1, st: w.storey }; }); let nSet = 0;
    // only a curtain wall running ALONG this face (seen edge-on it is a sliver another face's plan band would pair with)
    // opts.curtainSetBack=false: test hook (W-CURTAIN-ELEV C4)
    if (model.curtainSetBack !== false) model.curtains.filter(c => !fcwSet.has(c.guid) && par(c)).forEach(w => { const [h0, h1] = hr(w); pst.forEach((ps, i) => {
      if (!curtainBands(model, ps.elev + CUT_OFFSET)[w.guid]) return;
      const ref = model.rules.l118 && ps.name in storeyFace ? storeyFace[ps.name] : fv, pf = fw.filter(par), sw = pf.filter(x => x.storey === ps.name), depth = Math.max(EXT_FACE_TOL, ...(sw.length ? sw : pf).map(thick)), d = back(w, ref);
      if (d < -EXT_FACE_TOL || d > depth + 1e-9 || (ref === fv && d <= EXT_FACE_TOL)) return;
      const zt = Math.min(i + 1 < pst.length ? pst[i + 1].elev : w.z1, w.z1);
      if (wr.some(r => r.h0 <= h0 + 1 && r.h1 >= h1 - 1 && r.z0 <= ps.elev + LEVEL_DIFF_TOL && r.z1 >= zt - LEVEL_DIFF_TOL)) return;
      const zb = Math.max(ps.elev, w.z0);   // the glazing's own bottom (a sill wall below it is a wall, drawn as such)
      if (zt <= zb + LEVEL_DIFF_TOL) return;
      doc.lwpoly('A-WALL-CURT', rect(h0, h1, zb, zt), true, tag(w.guid)); nSet++;
      log.add(`§ELEV_CURTAIN_SET ${face} guid=${w.guid} storey='${ps.name}' set_back=${fx(d * 1000, 1)}mm depth=${fx(depth * 1000, 1)}mm z=${fx(zb, 3)}..${fx(zt, 3)} (D31)`);
    }); });
    const fwg = new Set(fw.map(w => w.guid).concat(fcw.map(w => w.guid))); let nOp = 0, nRec = 0;
    // §D68 (F16): a window whose host is not a flush face wall is drawn when the face SEES it: no wall or curtain wall (any storey, its host excluded) lies between it and the face covering its h x z rect
    const nearOf = { x0: e => [e.x0, e.x1], x1: e => [-e.x1, -e.x0], y0: e => [e.y0, e.y1], y1: e => [-e.y1, -e.y0] }[side], alongX = side === 'y0' || side === 'y1';
    const covers = model.walls.concat(model.curtains), recessedOn = !(typeof process === 'object' && process.env && process.env.DXF_RECESSED_WIN === '0'), recessedDoorOn = !(typeof process === 'object' && process.env && process.env.DXF_RECESSED_DOOR === '0');
    const envS = { x0: env[0], x1: env[1], y0: env[2], y1: env[3] }, stE = {}; if (model.rules.l118) model.storeys.forEach(s => { const sw = model.walls.filter(w => w.storey === s.name); if (sw.length) { const v = envelope(sw); stE[s.name] = { x0: v[0], x1: v[1], y0: v[2], y1: v[3] }; } });
    const flushAny = h => !!h && (alongX ? ['y0', 'y1'] : ['x0', 'x1']).some(s => Math.abs(h[s] - envS[s]) <= EXT_FACE_TOL || (h.storey in stE && Math.abs(h[s] - stE[h.storey][s]) <= EXT_FACE_TOL));   // a window in the face wall of the opposite elevation: as before
    const seen = e => { const n0 = nearOf(e)[0], a0 = alongX ? e.x0 : e.y0, a1 = alongX ? e.x1 : e.y1, hg = model.host_all[e.guid];
      return !covers.some(o => o.guid !== hg && nearOf(o)[1] <= n0 + EXT_FACE_TOL && (alongX ? o.x0 <= a0 + 1e-6 && o.x1 >= a1 - 1e-6 : o.y0 <= a0 + 1e-6 && o.y1 >= a1 - 1e-6) && o.z0 <= e.z0 + 1e-6 && o.z1 >= e.z1 - 1e-6); };
    for (const e of model.els) {
      if (OPENINGS.indexOf(e.cls) < 0) continue;
      if (((e.x1 - e.x0) >= (e.y1 - e.y0)) !== (side === 'y0' || side === 'y1')) continue;
      if (!fwg.has(model.host_all[e.guid])) {
        const hw = model.by_guid[model.host_all[e.guid]];
        if (!(e.cls === 'IfcWindow' ? recessedOn : e.cls === 'IfcDoor' && recessedDoorOn) || !hw || WALLS.indexOf(hw.cls) < 0 || flushAny(hw) || !seen(e)) continue;   // a window (D68) or a door (D74) in a wall (a roof light is not on an elevation)
        const a0 = alongX ? e.x0 : e.y0, a1 = alongX ? e.x1 : e.y1, twin = model.els.find(o => o !== e && o.cls === e.cls && model.host_all[o.guid] !== model.host_all[e.guid] && (o.storey === e.storey || (o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002)) && ((o.x1 - o.x0) >= (o.y1 - o.y0)) === alongX &&
          Math.abs((alongX ? o.x0 : o.y0) - a0) <= 0.002 && Math.abs((alongX ? o.x1 : o.y1) - a1) <= 0.002);
        const n0e = nearOf(e)[0], front = model.els.find(o => o !== e && o.cls === e.cls && nearOf(o)[0] < n0e - EXT_FACE_TOL && (alongX ? o.x0 : o.y0) <= a1 + 0.002 && (alongX ? o.x1 : o.y1) >= a0 - 0.002 && o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002);
        if (front) { log.add(`§ELEV_${e.cls === 'IfcDoor' ? 'DOOR' : 'WIN'}_RECESSED_SKIP ${face} guid=${e.guid} behind ${e.cls === 'IfcDoor' ? 'door' : 'window'} ${front.guid} (its glazing would join the nearer one's on the sheet) (D68)`); continue; }
        if (twin) { log.add(`§ELEV_${e.cls === 'IfcDoor' ? 'DOOR' : 'WIN'}_RECESSED_SKIP ${face} guid=${e.guid} same run as ${twin.guid} (another wall, its storey or touching): the elevation could not tell them apart (D68)`); continue; }
        nRec++; log.add(`§ELEV_${e.cls === 'IfcDoor' ? 'DOOR' : 'WIN'}_RECESSED ${face} guid=${e.guid} set_back=${fx(nearOf(e)[0] - (side[1] === '0' ? fv : -fv), 3)} (${e.cls === 'IfcDoor' ? 'D74' : 'D68'})`);
      }
      const [h0, h1] = hr(e);
      doc.lwpoly(e.cls === 'IfcDoor' ? 'A-DOOR' : 'A-GLAZ', rect(h0, h1, e.z0, e.z1), true, tag(e.guid));
      if (e.cls === 'IfcWindow') doc.line('A-GLAZ-SILL', [h0, mm(e.z0)], [h1, mm(e.z0)], tag(e.guid));
      nOp++;
    }
    model.roofs.forEach(r => { const [h0, h1] = hr(r); doc.lwpoly('A-ROOF', rect(h0, h1, r.z0, r.z1), true, tag(r.guid)); });
    log.add(`§ELEV ${face} walls=${fw.length} openings=${nOp} roofs=${model.roofs.length}${nSet ? ' curtain_set_back=' + nSet : ''}${nRec ? ' windows_recessed=' + nRec : ''}`);
    const xs = [hp(env[0], env[2]), hp(env[1], env[3])], H0 = mm(Math.min(...xs)), H1 = mm(Math.max(...xs));
    const levels = levelsStated(model, log, face);   // D26
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
  // §F7 the view AT the plane: the box's elements as seen from the plane (looking to its facing side), nearest first, hidden parts removed. A drawing export (@VIEW=DRAWING), not read back.
  function writePlaneView(model, grid, box, log) {
    const doc = newDoc(), dir = box.dir, hx = x => mm(dir > 0 ? x : -x), OPEN = ['IfcDoor', 'IfcWindow'], skip = ['IfcOpeningElement'];
    const layerOf = c => c === 'IfcDoor' ? 'A-DOOR' : c === 'IfcWindow' ? 'A-GLAZ' : (c === 'IfcPlate' || c === 'IfcMember' || c === 'IfcCurtainWall') ? 'A-WALL-CURT' : c === 'IfcRoof' ? 'A-ROOF' : 'A-WALL';
    const near = e => (dir > 0 ? e.y0 - box.oy : box.oy - e.y1);
    const items = model.els.filter(e => skip.indexOf(e.cls) < 0 && Number.isFinite(e.z0) && Number.isFinite(e.z1) && e.z1 > e.z0 && e.x1 > e.x0).map(e => {
      let d = near(e); if (OPEN.indexOf(e.cls) >= 0) { const h = model.by_guid[model.host_all && model.host_all[e.guid]]; if (h) d = Math.min(d, near(h)) - 0.001; }   // an opening shows in its wall
      const a = hx(e.x0), b = hx(e.x1); return { e, d, r: [[[Math.min(a, b), mm(e.z0)], [Math.max(a, b), mm(e.z0)], [Math.max(a, b), mm(e.z1)], [Math.min(a, b), mm(e.z1)], [Math.min(a, b), mm(e.z0)]]] };
    }).sort((p, q) => p.d - q.d || (p.e.guid < q.e.guid ? -1 : 1));
    let U = [], drawn = 0, hidden = 0, pieces = 0, quick = 0; const vis = {}, seen = [];
    // §F7 W1 (speed): every item is an axis-aligned rect, so "wholly behind the nearer items" is decided exactly by rect subtraction against the rects already drawn;
    // only an item with something left goes through polygon-clipping (LTU: 7,117 of 7,555 items are hidden)
    const sub = (p, q) => { if (q[0] >= p[2] || q[2] <= p[0] || q[1] >= p[3] || q[3] <= p[1]) return [p]; const o = [];
      if (q[0] > p[0]) o.push([p[0], p[1], q[0], p[3]]); if (q[2] < p[2]) o.push([q[2], p[1], p[2], p[3]]);
      const x0 = Math.max(p[0], q[0]), x1 = Math.min(p[2], q[2]); if (q[1] > p[1]) o.push([x0, p[1], x1, q[1]]); if (q[3] < p[3]) o.push([x0, q[3], x1, p[3]]); return o; };
    const covered = b => { let left = [b]; for (let i = 0; i < seen.length && left.length; i++) { const q = seen[i]; if (q[0] >= b[2] || q[2] <= b[0] || q[1] >= b[3] || q[3] <= b[1]) continue; left = [].concat(...left.map(p => sub(p, q))); } return !left.length; };
    items.forEach(it => {
      const b = [it.r[0][0][0], it.r[0][0][1], it.r[0][2][0], it.r[0][2][1]];
      if (seen.length && covered(b)) { hidden++; quick++; vis[it.e.guid] = 0; return; }   // U already holds b: the union would not change
      seen.push(b);
      let V; try { V = U.length ? PC.difference(it.r, U) : [it.r]; } catch (e) { V = [it.r]; }
      if (!V.length) { hidden++; vis[it.e.guid] = 0; } else { drawn++; vis[it.e.guid] = V.length; V.forEach(poly => { pieces++; doc.lwpoly(layerOf(it.e.cls), poly[0].slice(0, -1), true, tag(it.e.guid)); }); }
      try { U = U.length ? PC.union(U, it.r) : [it.r]; } catch (e) { }
    });
    const zs0 = items.map(i => i.e.z0), zs1 = items.map(i => i.e.z1), zmin = Math.min(...zs0), zmax = Math.max(...zs1), H0 = Math.min(hx(box.a), hx(box.b)), H1 = Math.max(hx(box.a), hx(box.b));
    const levels = model.storeys.filter(s => s.elev >= zmin - 0.01 && s.elev <= zmax + 0.01).map(s => [s.name.toUpperCase(), s.elev]).sort((a, b) => a[1] - b[1]);
    if (!levels.length || zmax - levels[levels.length - 1][1] > 0.5) levels.push(['TOP OF BOX', zmax]);
    levelsDrawn(doc, log, 'PLANE_VIEW', levels, H0 - LEVEL_EXT * SCALE, H1 + LEVEL_EXT * SCALE);
    const zb = mm(levels[0][1]), zt = mm(levels[levels.length - 1][1]) + LEVEL_EXT * SCALE;
    const gx = grid.x.filter(g => g[1] >= box.a && g[1] < box.b), hs = gx.map(g => hx(g[1])), te = tiersOf(hs);
    gx.forEach(([lab], i) => { const h = hs[i], o = te[i] * GRID_STAGGER; doc.line('A-GRID', [h, zb - ELEV_GRID_END * SCALE - o], [h, zt]); bubble(doc, h, zb - ELEV_BUBBLE_C * SCALE - o, lab); });
    doc.text('A-ANNO-TTLB', `VIEW AT THE PLANE  1:${SCALE}`, [(H0 + H1) / 2, zb - (ELEV_BUBBLE_C + 12) * SCALE], TXT_TITLE * SCALE, { align: 'MIDDLE_CENTER' });
    model.planeView = { items: items.length, drawn, hidden, pieces, vis };
    log.add(`§PLANE_VIEW items=${items.length} drawn=${drawn} hidden=${hidden} (by rect cover ${quick}) pieces=${pieces} levels=${levels.map(l => l[0]).join(',')} dir=${dir}`);
    return doc;
  }
  function writeRoofPlan(model, grid, storey, log) {
    log.add(`§VIEW ROOF storey='${storey.name}' elev=${fx(storey.elev, 4)}`);
    const doc = newDoc(); let rw = model.walls.filter(w => w.storey === storey.name).sort((a, b) => (a.guid < b.guid ? -1 : 1)), src = 'envelope of the roof storey walls';
    if (!rw.length) { rw = model.roofs.slice().sort((a, b) => (a.guid < b.guid ? -1 : 1)); src = 'envelope of the roof element(s), §L1.9'; }   // §L1.9
    const hasRoofSrc = rw.length > 0, E = envelope(hasRoofSrc ? rw : model.walls).map(mm);   // §F7: a wing with no wall and no roof element on the roof storey has no roof envelope (it was +-Infinity: invalid DXF); the sheet keeps the wing's wall extent for its grid and draws NO outline
    if (hasRoofSrc) {
      doc.lwpoly('A-ROOF', [[E[0], E[2]], [E[1], E[2]], [E[1], E[3]], [E[0], E[3]]], true, tag(rw.map(w => w.guid).join(',').slice(0, 255)));
      log.add(`§ROOF_OUTLINE env=(${fx(E[0], 2)},${fx(E[2], 2)})-(${fx(E[1], 2)},${fx(E[3], 2)}) walls=${rw.length} (${src})`);
    } else log.gap('GAP:roof_no_envelope', '-', `no wall and no roof element on the roof storey '${storey.name}' in this set: no outline drawn`);
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
    northMark(doc, model.north, E, log); if (model.scaleBar === true) scaleBarMark(doc, E);
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
  function writeSection(model, grid, log, Xat) {   // Xat (§F7): a stated cut position in model metres (the 2D wand's plane midpoint); undefined = midway between the first two grid lines, as always
    const xs = grid.x.map(g => g[1]);
    let X = Number.isFinite(Xat) ? Number(Xat.toFixed(6)) : xs.length >= 2 ? Number(((xs[0] + xs[1]) / 2).toFixed(6)) : null;
    if (!Number.isFinite(Xat) && xs.length >= 2) {   // §F8 D30: no stated cut: the first grid bay whose midpoint crosses a slab of the most plan storeys (the floors the reader reads from the section); the first bay when it already shows them all
      const sts = planStoreys(model), slabs = model.els.filter(e => e.cls === 'IfcSlab'), cov = x => sts.filter(st => slabs.some(e => ofPlan(st, e) && e.x0 < x && x < e.x1)).length;
      let bi = 0, bc = -1; for (let i = 0; i + 1 < xs.length; i++) { const c = cov((xs[i] + xs[i + 1]) / 2); if (c > bc) { bc = c; bi = i; } }
      const c0 = cov((xs[0] + xs[1]) / 2); if (bi > 0 && bc > c0) X = Number(((xs[bi] + xs[bi + 1]) / 2).toFixed(6));
      log.add(`§SECTION_CUT_CHOICE bays=${xs.length - 1} first_bay_floors=${c0}/${sts.length} chosen_bay=${bi > 0 && bc > c0 ? bi : 0} floors=${Math.max(bc, c0)}/${sts.length} (D30)`);
    }
    model.sectionX = X;
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
    // §F7: the plates / members of a curtain wall the cut passes through, on their own layer (the reader's section rules read S-SLAB / A-ROOF / A-SECT only, so they add no reading)
    if (model.sectionCurtain !== false) { let nc = 0; (model.curtains || []).forEach(cw => cw.parts.forEach(pt => cutX(pt, X).forEach(ct => { const pts = ct.map(p => [mm(p[0]), mm(p[1])]); doc.lwpoly('A-WALL-CURT', pts, true, tag(pt.guid)); nc++; const z = pts.map(p => p[1]); zlo.push(Math.min(...z)); zhi.push(Math.max(...z)); }))); if (nc) log.add(`§SECTION_CURTAIN contours=${nc}`); }
    log.add(`§SECTION contours={'S-SLAB': ${n['S-SLAB']}, 'A-ROOF': ${n['A-ROOF']}, 'A-SECT': ${n['A-SECT']}}`);
    const gEl = model.storeys.find(s => s.name === model.grid_storey).elev, levels = levelsStated(model, log, 'SECTION');   // D26
    const env = buildingEnv(model, model.grid_storey, gEl), H0 = mm(env[2]), H1 = mm(env[3]);   // C3
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
    if (M.doorDefaults && M.doorDefaults.length) { const sd = M._doorStd; row('Doors drawn from the building standard (yellow, A-DOOR-DFLT)', M.doorDefaults.length, `${sd.left} LEFT / ${sd.right} RIGHT of ${sd.n} stated; single leaves ${fx(sd.minW * 1000, 0)}..${fx(sd.maxW * 1000, 0)} mm`, 'default'); }
    if (M.rooms) row('Rooms labelled on the plans (D22)', R.log.filter(l => l.indexOf('§ROOM_LABEL') === 0).length + ' of ' + M.rooms.length, M.roomsSource + '; compiled rooms yellow (A-AREA-IDEN-DFLT)', 'default');
    if (M.doorConflicts && M.doorConflicts.length) row('Doors whose model leaf contradicts the stated swing (yellow, A-DOOR-DFLT, D19)', M.doorConflicts.length, 'drawn as the IFC states (§L1.12); the mesh leaf lies on the other side: a model finding (§DOOR_HANDING_CONFLICT)', 'default');
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
    const model = loadModel(q, log); Object.defineProperty(model, '_log', { value: log, enumerable: false });   // §D50 planStoreys states an absorbed storey once
    if (opts.premodel) opts.premodel(model);
    let wing = null;
    if (opts.wing) wing = frameWing(model, opts.wing, log, !!opts.extent);   // §L1.16: this set is ONE wing, drawn in its own frame (§F7 with a box: every angle, the box decides)
    loadRooms(model, opts.rooms, opts.roomsSource, wing, log);   // §F7 D22
    model.slabEdge = opts.slabEdge; model.stairSymbol = opts.stairSymbol; model.curtainSetBack = opts.curtainSetBack; model.sectionCurtain = opts.sectionCurtain; model.scaleBar = opts.scaleBar; model.north = northOf(opts.north); if (wing) model.north = turnNorth(model.north, wing.angle);   // §F7: the north arrow turns with the sheet
    let grid;
    if (opts.extent && wing) {   // §F7 W-WAND-BOX: the grid of the family wing (same labels as the whole wing set; its host / grid lines are not this set's), then the box at any angle, hosts resolved on the box
      const L0 = new Log(); resolveHosts(model, L0); const g0 = deriveGrid(model, L0), bx = boxWing(model, wing, opts.extent, opts.depth, log);
      if (bx) boxRooms(model, bx, log); resolveHosts(model, log); grid = bx ? boxGrid(g0, bx, log) : deriveGrid(model, log);
    } else {
      if (opts.extent) log.add('§EXTENT ignored=no_wing');
      resolveHosts(model, log); grid = deriveGrid(model, log);
    }
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
    if (model.box) put(`${prefix}_PLANE_VIEW_std.dxf`, writePlaneView(model, grid, model.box, log));   // §F7: the box seen from the plane (a DRAWING, not read back)
    const sec = writeSection(model, grid, log, opts.sectionAt === 'pivot' ? (wing ? wing.ox : undefined) : (typeof opts.sectionAt === 'number' ? opts.sectionAt : undefined)); if (sec) put(`${prefix}_SECTION_std.dxf`, sec);
    const codes = {}; log.gaps.forEach(g => { codes[g[0]] = (codes[g[0]] || 0) + 1; });
    log.add(`§SUMMARY views=${Object.keys(files).length} grid_x=${pyList(grid.x.map(g => g[0]))} grid_y=${pyList(grid.y.map(g => g[0]))} gaps=${log.gaps.length}`);
    log.add('§GAP_SUMMARY {' + Object.keys(codes).map(k => `'${k}': ${codes[k]}`).join(', ') + '}');
    return { files, whole, scoped, scopes, wing, log: log.lines, gaps: log.gaps, grid, model, views: { plan: planStoreys(model).map(st => ({ view: planView(st.name), storey: st })), roof: rs } };
  }

  // ───────────────────────── §L1.16 per-wing frame ─────────────────────────
  // The principal plan direction of an element, from its vertical faces: area-weighted circular mean of the face-normal angle folded mod 90 deg (4-theta trick).
  // Returns {deg: [0,90), q: 0..1} (q = 1 when every vertical face is parallel/perpendicular to deg), or null when the element has no vertical face.
  function elementAngle(e) {
    const V = e.v, F = e.f; let sx = 0, sy = 0, w = 0;
    for (let t = 0; t + 2 < F.length; t += 3) {
      const a = F[t] * 3, b = F[t + 1] * 3, c = F[t + 2] * 3;
      const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], ln = Math.hypot(n[0], n[1], n[2]);
      if (!(ln > 1e-12) || Math.abs(n[2] / ln) > 0.01) continue;
      const th = Math.atan2(n[1], n[0]), area = ln / 2; sx += area * Math.cos(4 * th); sy += area * Math.sin(4 * th); w += area;
    }
    if (!(w > 0)) return null;
    let d = Math.atan2(sy, sx) / 4 * 180 / Math.PI; d = ((d % 90) + 90) % 90;
    return { deg: d, q: Math.hypot(sx, sy) / w };
  }
  const angDiff90 = (a, b) => { const d = Math.abs(a - b) % 90; return Math.min(d, 90 - d); };
  // Rotate the plan coordinates of every element about (ox, oy) by deg (CCW). World = v + c, so c moves with the rotation and v turns about the origin. Bboxes are recomputed
  // from the mesh (an element without a mesh: from its rotated bbox corners). Door-operation axes turn with the model. Pure on the arrays; mutates the model.
  function rotateModel(model, deg, ox, oy) {
    const th = deg * Math.PI / 180, co = Math.cos(th), si = Math.sin(th), rot = (x, y) => [co * x - si * y, si * x + co * y];
    const done = new Set();
    const each = e => {
      if (done.has(e)) return; done.add(e);
      if (e.parts) { e.parts.forEach(each); const k = e.parts; e.x0 = Math.min(...k.map(p => p.x0)); e.x1 = Math.max(...k.map(p => p.x1)); e.y0 = Math.min(...k.map(p => p.y0)); e.y1 = Math.max(...k.map(p => p.y1)); return; }
      const cs = [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1]].map(p => { const r = rot(p[0] - ox, p[1] - oy); return [r[0] + ox, r[1] + oy]; });
      const c = rot(e.c[0] - ox, e.c[1] - oy); e.c = [c[0] + ox, c[1] + oy, e.c[2]];
      if (e.v.length) {
        const V = e.v; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let k = 0; k < V.length; k += 3) { const r = rot(V[k], V[k + 1]); V[k] = r[0]; V[k + 1] = r[1]; x0 = Math.min(x0, r[0] + e.c[0]); x1 = Math.max(x1, r[0] + e.c[0]); y0 = Math.min(y0, r[1] + e.c[1]); y1 = Math.max(y1, r[1] + e.c[1]); }
        e.x0 = x0; e.x1 = x1; e.y0 = y0; e.y1 = y1;
      } else { e.x0 = Math.min(...cs.map(p => p[0])); e.x1 = Math.max(...cs.map(p => p[0])); e.y0 = Math.min(...cs.map(p => p[1])); e.y1 = Math.max(...cs.map(p => p[1])); }
    };
    model.els.forEach(each); (model.curtains || []).forEach(each);
    Object.values(model.door_ops || {}).forEach(d => ['x', 'y', 'z'].forEach(k => { if (d[k] && d[k].length >= 2) { const r = rot(d[k][0], d[k][1]); d[k] = [r[0], r[1]].concat(d[k].slice(2)); } }));
    return model;
  }
  // Keep only the elements that sit in the wing's frame: walls (and columns/stairs) whose principal direction is within `tol` deg of `angle` (mod 90) and whose faces are
  // consistent, plus the doors/windows hosted by a kept wall. Everything else is NOT framed: it is counted, never drawn in this wing, never snapped.
  // Returns {kept, unframed:{cls:n}, total} and replaces the model's element lists.
  const WING_Q_MIN = 0.5, WING_TOL = 1.0;
  // §F6 D14: the wing is rotated by the MODAL direction of its kept walls (0.1-deg buckets, mean of the walls within 0.15 deg of the mode), not by the 1-deg bin that selected them
  // (a family at 2.5 deg, binned to 3, left every door 0.5 deg off its wall: the closed leaf ended ~8 mm off the hinge's axis line and `door_no_strip` stood). The mode, not the
  // mean: a few skewed walls moved the mean of the 70-deg wing by 0.1 deg and made it worse. A result within 0.01 deg of the bin is the bin (integer families unchanged).
  function wingMeanAngle(walls, bin) {
    const as = []; walls.forEach(w => { const a = elementAngle(w); if (a && a.q >= WING_Q_MIN) { let d = a.deg; if (d - bin > 45) d -= 90; if (bin - d > 45) d += 90; as.push(d); } });
    if (!as.length) return bin;
    const h = {}; as.forEach(d => { const k = Math.round(d * 10); h[k] = (h[k] || 0) + 1; });
    const mode = Number(Object.keys(h).sort((x, y) => h[y] - h[x] || x - y)[0]) / 10, near = as.filter(d => Math.abs(d - mode) <= 0.15), d = near.reduce((x, y) => x + y, 0) / near.length;
    return Math.abs(d - bin) < 0.01 || Math.abs(d - bin) > WING_TOL ? bin : Number(d.toFixed(6));
  }
  function frameModel(model, angle, tol) {
    tol = tol === undefined ? WING_TOL : tol;
    const keep = new Set(), FRAMED = WALLS.concat(['IfcColumn', 'IfcStair', 'IfcStairFlight', 'IfcSlab', 'IfcRoof', 'IfcFooting']);
    model.els.forEach(e => { if (FRAMED.indexOf(e.cls) < 0) return; const a = elementAngle(e); if (a && a.q >= WING_Q_MIN && angDiff90(a.deg, angle) <= tol) keep.add(e.guid); });
    // §L1.23: a curtain wall is framed like a wall: the most common consistent angle of its plate/member parts decides; kept ones keep their parts and (via the host) their door parts
    const curtKept = [];
    (model.curtains || []).forEach(cw => {
      const h = {}; cw.parts.forEach(p => { const a = elementAngle(p); if (a && a.q >= WING_Q_MIN) { const b = Math.round(a.deg) % 90; h[b] = (h[b] || 0) + 1; } });
      const ks = Object.keys(h).map(Number).sort((a, b) => h[b] - h[a] || a - b);
      if (ks.length && angDiff90(ks[0], angle) <= tol) { keep.add(cw.guid); cw.parts.forEach(p => keep.add(p.guid)); curtKept.push(cw); }
    });
    frameModel.lastCurt = { kept: curtKept.length, unframed: (model.curtains || []).length - curtKept.length };
    const unframed = {}; let total = 0;
    model.els.forEach(e => { if (FRAMED.indexOf(e.cls) >= 0) { total++; if (!keep.has(e.guid)) unframed[e.cls] = (unframed[e.cls] || 0) + 1; } });
    const hostEls = model.els.filter(e => keep.has(e.guid)), inBox = (e, h) => { const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2; return cx >= h.x0 && cx <= h.x1 && cy >= h.y0 && cy <= h.y1; };
    model.els.forEach(e => {   // an opening follows its host (wall, roof, slab); one with no IFC host follows the kept element whose bbox holds its centre (resolved later by the mesh void, as in the whole set)
      if (OPENINGS.indexOf(e.cls) < 0) return;
      if ((model.hosts[e.guid] !== undefined && model.by_guid[model.hosts[e.guid]]) ? keep.has(model.hosts[e.guid]) : hostEls.some(h => inBox(e, h))) keep.add(e.guid);
    });
    // §L1.22b: a rotationally symmetric column (round: no direction) belongs to the wing of its NEAREST wall (plan-bbox distance, ties to the smaller wall guid); one owner per column
    {
      const allWalls = model.els.filter(e => WALLS.indexOf(e.cls) >= 0).sort((p, q) => (p.guid < q.guid ? -1 : 1));
      let symKept = 0, symOther = 0;
      if (allWalls.length) model.els.forEach(e => {
        if (e.cls !== 'IfcColumn' || keep.has(e.guid)) return;
        const a = elementAngle(e); if (a && a.q >= WING_Q_MIN) return;   // has a direction: the angle rule already decided
        if (columnAxis(e.v, e.c) === null) return;                       // not symmetric either: stays unframed
        const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2; let best = null, bd = Infinity;
        allWalls.forEach(w => { const dx = Math.max(w.x0 - cx, 0, cx - w.x1), dy = Math.max(w.y0 - cy, 0, cy - w.y1), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = w; } });
        if (best && keep.has(best.guid)) { keep.add(e.guid); symKept++; } else symOther++;
      });
      unframed.IfcColumn = model.els.filter(e => e.cls === 'IfcColumn' && !keep.has(e.guid)).length; if (!unframed.IfcColumn) delete unframed.IfcColumn;
      frameModel.lastSym = { kept: symKept, outside: symOther };
    }
    model.els = model.els.filter(e => keep.has(e.guid)); model.walls = model.els.filter(e => WALLS.indexOf(e.cls) >= 0);
    model.curtains = curtKept; model.roofs = model.roofs.filter(r => keep.has(r.guid)); model.by_guid = {}; model.els.forEach(e => { model.by_guid[e.guid] = e; }); curtKept.forEach(c => { model.by_guid[c.guid] = c; });
    return { kept: keep.size, unframed, total };
  }
  // §F7 W-WAND-BOX (owner 2026-10-21: "just a wing", "clip all to plane", a depth handle): in the turned frame the plane lies along X at the pivot's Y; its ends give X = [a, b]; depth d (m,
  // signed: + = the plane's facing side, the sheet's +Y) gives Y = [oy, oy + d]; no depth = Y unbounded. Keeps the elements whose plan centre lies in the box (half-open [lo, hi)); an opening follows
  // its host, a curtain wall's parts follow the curtain wall. Every sheet (plans, elevations, section, roof, grid) is then written from the box alone.
  function boxWing(model, wing, ex, depth, log) {
    const ok = Array.isArray(ex) && ex.length === 2 && ex.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
    if (!ok) { log.add('§EXTENT ignored=malformed'); return null; } if (!wing) { log.add('§EXTENT ignored=no_wing'); return null; }
    const th = -wing.angle * Math.PI / 180, tx = p => Math.cos(th) * (p[0] - wing.ox) - Math.sin(th) * (p[1] - wing.oy) + wing.ox;
    const a = Math.min(tx(ex[0]), tx(ex[1])), b = Math.max(tx(ex[0]), tx(ex[1])), d = Number.isFinite(depth) && depth !== 0 ? depth : null;
    const y0 = d === null ? -Infinity : Math.min(wing.oy, wing.oy + d), y1 = d === null ? Infinity : Math.max(wing.oy, wing.oy + d);
    const inBox = e => { const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2; return cx >= a && cx < b && cy >= y0 && cy < y1; };
    if (model._extra) {   // every angle back in (turned already, frameWing)
      model.els = model.els.concat(model._extra.els); model.curtains = (model.curtains || []).concat(model._extra.curtains); model.roofs = model.roofs.concat(model._extra.roofs); model._extra = null;
      model.by_guid = {}; model.els.forEach(e => { model.by_guid[e.guid] = e; }); model.curtains.forEach(c => { model.by_guid[c.guid] = c; });
    }
    const keep = new Set(), n0 = model.els.length;
    model.els.forEach(e => { if (OPENINGS.indexOf(e.cls) < 0 && inBox(e)) keep.add(e.guid); });
    const curt = (model.curtains || []).filter(c => inBox(c)); curt.forEach(c => { keep.add(c.guid); c.parts.forEach(p => keep.add(p.guid)); });
    model.els.forEach(e => {   // after the curtain walls: a door can be hosted by one
      if (OPENINGS.indexOf(e.cls) < 0) return; const h = model.hosts[e.guid]; if (h !== undefined && model.by_guid[h] ? keep.has(h) : inBox(e)) keep.add(e.guid); });
    model.els = model.els.filter(e => keep.has(e.guid)); model.walls = model.els.filter(e => WALLS.indexOf(e.cls) >= 0);
    model.curtains = curt; model.roofs = model.roofs.filter(r => keep.has(r.guid)); model.by_guid = {}; model.els.forEach(e => { model.by_guid[e.guid] = e; }); curt.forEach(c => { model.by_guid[c.guid] = c; });
    log.add(`§EXTENT p0=${fx(ex[0][0], 4)},${fx(ex[0][1], 4)} p1=${fx(ex[1][0], 4)},${fx(ex[1][1], 4)} box_x=${fx(a, 3)}..${fx(b, 3)} box_y=${d === null ? 'unbounded' : fx(y0, 3) + '..' + fx(y1, 3)} kept=${model.els.length}/${n0} walls=${model.walls.length} curtains=${curt.length}`);
    model.box = { a, b, y0, y1, oy: wing.oy, dir: d === null || d > 0 ? 1 : -1 };
    // the box's own height: storeys above the top of its elements are not drawn (levels, plans) and T/ROOF is the box top (stated: the highest element top in the box)
    const tops = model.els.filter(e => Number.isFinite(e.z1)).map(e => e.z1);
    if (tops.length) { const zt = Math.max(...tops), n1 = model.storeys.length; model.storeys = model.storeys.filter(st => st.elev <= zt + 0.01 || st.name === model.grid_storey);
      if (model.roof_top === null || model.roof_top > zt) model.roof_top = zt; log.add(`§EXTENT_TOP top=${fx(zt, 4)} storeys=${model.storeys.length}/${n1} T/ROOF=${fx(model.roof_top, 4)} (the highest element top in the box)`); }
    return { a, b, y0, y1 };
  }
  // the box keeps the grid lines inside its range plus the nearest one beyond each side (as an §L6 scope sheet does): labels stay the whole wing's
  function boxGrid(grid, bx, log) {
    const clip = (lines, lo, hi) => { const inR = lines.filter(g => g[1] >= lo && g[1] < hi), below = lines.filter(g => g[1] < lo).sort((p, q) => q[1] - p[1])[0], above = lines.filter(g => g[1] >= hi).sort((p, q) => p[1] - q[1])[0];
      return lines.filter(g => inR.indexOf(g) >= 0 || g === below || g === above); };
    const out = Object.assign({}, grid, { x: clip(grid.x, bx.a, bx.b), y: clip(grid.y, bx.y0, bx.y1) });
    log.add(`§EXTENT_GRID x=${out.x.map(g => g[0]).join(',')} (${out.x.length}/${grid.x.length}) y=${out.y.map(g => g[0]).join(',')} (${out.y.length}/${grid.y.length})`);
    return out;
  }
  function wingDominant(model) {   // the angle (deg, mod 90) carrying the most walls, 1-deg bins, ties to the smaller angle
    const h = {}; model.walls.forEach(w => { const a = elementAngle(w); if (a && a.q >= WING_Q_MIN) { const b = Math.round(a.deg) % 90; h[b] = (h[b] || 0) + 1; } });
    const ks = Object.keys(h).map(Number).sort((a, b) => h[b] - h[a] || a - b); return ks.length ? { deg: ks[0], n: h[ks[0]], hist: h } : null;
  }
  // the angle families of a model's walls (deg mod 90, 1-deg bins) that carry >= minShare of the walls with a consistent direction: [{deg, n}] largest first. The export panel offers these as wings.
  function wingAngles(model, minShare) {
    const d = wingDominant(model); if (!d) return [];
    const tot = Object.values(d.hist).reduce((a, b) => a + b, 0), min = Math.max(1, (minShare === undefined ? 0.05 : minShare) * tot);
    return Object.keys(d.hist).map(Number).filter(k => d.hist[k] >= min).sort((a, b) => d.hist[b] - d.hist[a] || a - b).map(k => ({ deg: k, n: d.hist[k] }));
  }
  // wingOpts: { name, angle (deg; default = dominant), tol }. Filters the model to the wing and rotates it by -angle about the centre of the kept walls. Logs §WING.
  function frameWing(model, wo, log, allAngles) {
    // §F7 the 2D wand: `turn` (deg, any real) is the direction of the plane's edge = the sheet's +X, full circle: the family (mod 90) picks the walls, the sheet is turned by the family's own
    // direction plus the quarter turns `turn` asks for (0 / 90 / 180 / 270 = four sheet orientations of one frame); `pivot` [x, y] (model metres) replaces the envelope centre. Both are stated in @FRAME.
    const hasTurn = typeof wo.turn === 'number' && isFinite(wo.turn), turn = hasTurn ? ((wo.turn % 360) + 360) % 360 : null;
    const dom = wo.angle !== undefined ? { deg: wo.angle } : hasTurn ? { deg: Math.round(turn % 90) % 90 } : wingDominant(model);
    if (!dom) { log.gap('GAP:wing_no_walls', '-', 'no wall with a consistent plan direction'); return null; }
    const bin = dom.deg, name = wo.name || 'WING' + bin, tol = wo.tol === undefined ? WING_TOL : wo.tol;
    const full = allAngles ? { els: model.els.slice(), curtains: (model.curtains || []).slice(), roofs: model.roofs.slice() } : null;
    const fr = frameModel(model, bin, tol), wl = model.walls, fam = wingMeanAngle(wl, bin);
    if (!wl.length) { log.gap('GAP:wing_no_walls', '-', `no wall within ${tol} deg of ${fam}`); return null; }
    const angle = hasTurn ? Number((fam + 90 * Math.round((turn - fam) / 90)).toFixed(6)) : fam;
    const env0 = envelope(wl), pv = Array.isArray(wo.pivot) && wo.pivot.length === 2 && wo.pivot.every(Number.isFinite) ? wo.pivot : null, ox = pv ? pv[0] : (env0[0] + env0[1]) / 2, oy = pv ? pv[1] : (env0[2] + env0[3]) / 2;
    rotateModel(model, -angle, ox, oy);
    if (full) {   // §F7 W-WAND-BOX: the family sets the frame (angle, grid); the elements of every other angle are turned the same way and wait for the box, which decides what is kept
      const kept = new Set(model.els.map(e => e.guid)), kc = new Set((model.curtains || []).map(c => c.guid)), kr = new Set(model.roofs.map(r => r.guid));
      const ex = { els: full.els.filter(e => !kept.has(e.guid)), curtains: full.curtains.filter(c => !kc.has(c.guid)) }; rotateModel(ex, -angle, ox, oy);
      model._extra = { els: ex.els, curtains: ex.curtains, roofs: full.roofs.filter(r => !kr.has(r.guid)) };
    }
    model.rules = { l117: true, l118: true, l119: true, l121: true };   // §L1.17-§L1.21: a wing set always takes them
    if (frameModel.lastCurt) log.add(`§WING_CURTAINS kept=${frameModel.lastCurt.kept} unframed=${frameModel.lastCurt.unframed}`);
    if (frameModel.lastSym) log.add(`§WING_COLUMNS_SYMMETRIC kept=${frameModel.lastSym.kept} owned_by_another_wing=${frameModel.lastSym.outside}`);
    log.add(`§WING name=${name} angle=${angle} tol=${tol} centre=${fx(ox, 4)},${fx(oy, 4)}${pv ? ' pivot=stated' : ''} kept=${fr.kept} framed_walls=${wl.length} unframed=${JSON.stringify(fr.unframed)}`);
    return { name, angle, ox, oy, framed: wl.length, unframed: fr.unframed, total: fr.total };
  }
  // opts: { name, angle (deg; default = dominant), tol, premodel(model) (test hook: applied right after loading) } -> plan sheets of ONE wing, in the wing's own frame
  function writeWingSet(q, prefix, opts) {
    opts = opts || {};
    const log = new Log(), files = {};
    log.add(`§ENTRY std2d wing db=model prefix=${prefix}`);
    const model = loadModel(q, log); Object.defineProperty(model, '_log', { value: log, enumerable: false });   // §D50 planStoreys states an absorbed storey once
    if (opts.premodel) opts.premodel(model);
    const dom = opts.angle === undefined ? wingDominant(model) : { deg: opts.angle };
    if (!dom) { log.gap('GAP:wing_no_walls', '-', 'no wall with a consistent plan direction'); return { files, log: log.lines, gaps: log.gaps }; }
    const bin = dom.deg, name = opts.name || 'WING' + bin;
    const fr = frameModel(model, bin, opts.tol);
    const wl = model.walls, angle = wingMeanAngle(wl, bin); if (!wl.length) { log.gap('GAP:wing_no_walls', '-', `no wall within ${opts.tol === undefined ? WING_TOL : opts.tol} deg of ${angle}`); return { files, log: log.lines, gaps: log.gaps }; }
    const env0 = envelope(wl), ox = (env0[0] + env0[1]) / 2, oy = (env0[2] + env0[3]) / 2;
    rotateModel(model, -angle, ox, oy);
    log.add(`§WING name=${name} angle=${angle} tol=${opts.tol === undefined ? WING_TOL : opts.tol} centre=${fx(ox, 4)},${fx(oy, 4)} kept=${fr.kept} framed_walls=${wl.length} unframed=${JSON.stringify(fr.unframed)}`);
    resolveHosts(model, log);
    const grid = deriveGrid(model, log);
    for (const s of planStoreys(model)) { const view = planView(s.name), doc = writePlan(model, grid, s, view, log); files[`${prefix}_${view}__${name}_std.dxf`] = doc.toString(); log.add(`§WRITE ${prefix}_${view}__${name}_std.dxf`); }
    log.add(`§SUMMARY wing=${name} views=${Object.keys(files).length} grid_x=${pyList(grid.x.map(g => g[0]))} grid_y=${pyList(grid.y.map(g => g[0]))} gaps=${log.gaps.length}`);
    return { files, log: log.lines, gaps: log.gaps, grid, model, wing: { name, angle, ox, oy, framed: wl.length, unframed: fr.unframed, total: fr.total } };
  }
  return { primaryClusters, drawableReport, ELEV_FACES, ELEV_HP: ELEV_FACES, columnAxis, writeStdSet, writeWingSet, wingAngles, dropCollinear, elementAngle, rotateModel, frameModel, wingDominant, loadModel, deriveGrid, resolveHosts, planStoreys, LAYERS, PLAN_CUT_CLASSES, SLAB_EDGE, slabEdge, slabsAt };
});
