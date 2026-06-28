// bonsai_library.js — Bonsai "Insert library component @ LOD" provider (§OOTB Item 2 = the bulk of real
// authoring: ASSEMBLE, don't draw). prompts/BONSAI_KERNEL_RESEARCH.md §SPEC W-BONSAI-INSERT. A picked catalog
// component is placed as ONE signed GEOM_INSERT op-row; geometry = a HOST-side fold (a baked mesh, NOT an occt
// B-rep), so it never touches the occt worker. LOD is a RENDER override over the immutable signed row: LOD-200 =
// a bbox box proxy (12 tris), LOD-300 = the real extracted mesh — "same row refined", op_hash/chain-tip unchanged.
//
// CATALOG = 3 REAL components extracted NON-INVENT from library/component_library.db (Column/Beam/Door): bbox +
// real mesh blobs (vertices=Float32 3/vtx, faces=Uint32 3/tri, base64). The full 23888-row db via httpvfs
// range-load is the production follow-on; this fixture proves the mechanism (the lane's witness-first method).
(function () {
  'use strict';
  const TAG = '§LIBRARY';
  const CATALOG = [
    { hash:"3e6348624e89b507", name:"M_Rectangular Column", ifc_class:"IfcColumn", category:"COLUMN", bbox:[-0.225, 0.225, -0.4, 0.4, -2.0, 2.0], vc:16, fc:24,
      v:"/2ZmPtrMzD4CAADA/2ZmPtrMzD79//8//2GZPdrMzD79//8//2GZPdrMzD4CAADA/2GZPebMzL79//8//2GZPebMzL4CAADA/2ZmPubMzL79//8//2ZmPubMzL4CAADAAWdmvubMzL4CAADAAWdmvubMzL79//8/Ac6ZvebMzL79//8/Ac6ZvebMzL4CAADAAc6ZvdrMzD79//8/Ac6ZvdrMzD4CAADAAWdmvtrMzD79//8/AWdmvtrMzD4CAADA",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAAAAAAAQAAAAYAAAAAAAAAAwAAAAAAAAAFAAAAAAAAAAcAAAAFAAAABAAAAAEAAAACAAAABAAAAAYAAAABAAAACQAAAAgAAAALAAAACgAAAAkAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAIAAAACQAAAA4AAAAIAAAACwAAAAgAAAANAAAACAAAAA8AAAANAAAADAAAAAkAAAAKAAAADAAAAA4AAAAJAAAA" },
    { hash:"9cbb780e8801984f", name:"M_Concrete-Rectangular Beam", ifc_class:"IfcBeam", category:"BEAM", bbox:[-2.75, 2.75, -0.15, 0.15, -0.3, 0.3], vc:16, fc:24,
      v:"DQAwQLeZGT6MmZk+8/8vwLeZGT6MmZk+8/8vwLeZGT7MzIw+DQAwQLeZGT7MzIw+8/8vwMmZGb7MzIw+DQAwQMmZGb7MzIw+8/8vwMmZGb6MmZk+DQAwQMmZGb6MmZk+DQAwQLeZGT6xmZk98/8vwLeZGT6xmZk98/8vwLeZGT6UmZm+DQAwQLeZGT6UmZm+8/8vwMmZGb6UmZm+DQAwQMmZGb6UmZm+8/8vwMmZGb6xmZk9DQAwQMmZGb6xmZk9",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAAAAAAAQAAAAYAAAAAAAAAAwAAAAAAAAAFAAAAAAAAAAcAAAAFAAAABAAAAAEAAAACAAAABAAAAAYAAAABAAAACQAAAAgAAAALAAAACgAAAAkAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAIAAAACQAAAA4AAAAIAAAACwAAAAgAAAANAAAACAAAAA8AAAANAAAADAAAAAkAAAAKAAAADAAAAA4AAAAJAAAA" },
    { hash:"ed1eee29900658a8", name:"Double glassdoor", ifc_class:"IfcDoor", category:"DOOR", bbox:[-0.89, 0.89, -0.075, 0.075, -1.05, 1.05], vc:32, fc:52,
      v:"P9djv0SZmb1mZoY/P9djv7yYmT1mZoY/QddjP7yYmT1mZoY/QddjP0SZmb1mZoY/QddjP7yYmT1qZoa/QddjP0SZmb1qZoa/wZlZP7yYmT1qZoa/wZlZP0SZmb1qZoa/wZlZP7yYmT2uR4E/wZlZP0SZmb2uR4E/v5lZv7yYmT2uR4E/v5lZv0SZmb2uR4E/v5lZv7yYmT1qZoa/v5lZv0SZmb1qZoa/P9djv7yYmT1qZoa/P9djv0SZmb1qZoa/wdRYP3ghMD3iqYW/wdRYP3ghMD1e5YA/wdRYP7yYmT1e5YA/wdRYP7yYmT3iqYW/1oHEOryYmT1e5YA/1oHEOryYmT3iqYW/1oHEOnghMD1e5YA/1oHEOnghMD3iqYW/Kn7EunghMD3iqYW/Kn7EunghMD1e5YA/Kn7EuryYmT1e5YA/Kn7EuryYmT3iqYW/v9RYv7yYmT1e5YA/v9RYv7yYmT3iqYW/v9RYv3ghMD1e5YA/v9RYv3ghMD3iqYW/",
      f:"AQAAAAAAAAADAAAAAgAAAAEAAAADAAAAAgAAAAMAAAAFAAAABAAAAAIAAAAFAAAABAAAAAUAAAAHAAAABgAAAAQAAAAHAAAABgAAAAcAAAAJAAAACAAAAAYAAAAJAAAACAAAAAkAAAALAAAACgAAAAgAAAALAAAACgAAAAsAAAANAAAADAAAAAoAAAANAAAADAAAAA0AAAAPAAAADgAAAAwAAAAPAAAADgAAAA8AAAAAAAAAAQAAAA4AAAAAAAAACwAAAAkAAAADAAAAAAAAAAsAAAADAAAACwAAAAAAAAAPAAAACwAAAA8AAAANAAAACQAAAAcAAAAFAAAAAwAAAAkAAAAFAAAAAgAAAAgAAAAKAAAAAgAAAAoAAAABAAAADgAAAAEAAAAKAAAADAAAAA4AAAAKAAAABAAAAAYAAAAIAAAABAAAAAgAAAACAAAAEQAAABAAAAATAAAAEgAAABEAAAATAAAAEgAAABMAAAAVAAAAFAAAABIAAAAVAAAAFAAAABUAAAAXAAAAFgAAABQAAAAXAAAAFgAAABcAAAAQAAAAEQAAABYAAAAQAAAAEwAAABAAAAAVAAAAEAAAABcAAAAVAAAAFAAAABEAAAASAAAAFAAAABYAAAARAAAAGQAAABgAAAAbAAAAGgAAABkAAAAbAAAAGgAAABsAAAAdAAAAHAAAABoAAAAdAAAAHAAAAB0AAAAfAAAAHgAAABwAAAAfAAAAHgAAAB8AAAAYAAAAGQAAAB4AAAAYAAAAGwAAABgAAAAdAAAAGAAAAB8AAAAdAAAAHAAAABkAAAAaAAAAHAAAAB4AAAAZAAAA" }
  ];

  // ── Practical BOM-hierarchy catalog (EXTRACTED NON-INVENT from library/archive/BOM.db via
  // scripts/extract_dagevu_catalog.py): 80 products in groups Structure/Openings/Furniture + an 18-pick cheat
  // sheet. LOD-200 box proxies come from w/d/h dims (no 220MB/httpvfs to browse or insert); real meshes via
  // component_library.db range-load are a later enhancement. Loaded async on module init (14KB, fast).
  let DB_PRODUCTS = [], GROUPS = [], CHEAT = [], ASSEMBLIES = [], ASM_BY_ID = {};
  function bboxFromDims(w, d, h) { return [-w / 2, w / 2, -d / 2, d / 2, 0, h]; }   // centred in x/y, base on ground
  const _base = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src
    : (typeof location !== 'undefined' ? location.href : '');
  const ready = (typeof fetch === 'function')
    ? fetch(new URL('dagevu_catalog.json?v=11', _base).href).then(function (r) { return r.json(); }).then(function (j) {
        GROUPS = j.groups || []; CHEAT = j.cheatsheet || [];
        DB_PRODUCTS = (j.products || []).map(function (p) {
          return { hash: p.id, id: p.id, name: p.name, ifc_class: p.ifc_class, category: p.catLabel || p.cat,
                   cat: p.cat, group: p.group, gh: p.gh, bbox: bboxFromDims(p.w, p.d, p.h), w: p.w, d: p.d, h: p.h, fc: 12, asmOnly: !!p.asmOnly, boxOnly: !!p.boxOnly };
        });
        ASSEMBLIES = j.assemblies || []; ASM_BY_ID = {};
        ASSEMBLIES.forEach(function (a) { ASM_BY_ID[a.id] = a; });
        console.log(TAG + ' catalog loaded products=' + DB_PRODUCTS.length + ' groups=' + GROUPS.length +
          ' cheat=' + CHEAT.length + ' assemblies=' + ASSEMBLIES.length);
        return true;
      }).catch(function (e) { console.warn(TAG + ' catalog load failed ' + e); return false; })
    : Promise.resolve(false);
  function ALL() { return CATALOG.concat(DB_PRODUCTS); }   // 3 legacy mesh-bearing + the DB box-proxy catalog

  // actual extent of a position buffer (Float32 x,y,z) → [minx,maxx,miny,maxy,minz,maxz] for correct seating.
  function bboxOf(p) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
    }
    return [a, b, c, d, e, f];
  }
  function b64ToBuf(b64) {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  // rotate (yaw, about +Z) about the component's local origin → translate to placement.
  // GROUND-SEAT: the component's local bbox BOTTOM (zmin) lands at placement.z (default 0) so a
  // component sits ON the ground, not half-buried (a door spanning local z ∈ [−1.05,+1.05] at z=0
  // would otherwise sink 1.05 below grade). Yaw is about Z so it does not change z → seat is yaw-invariant.
  function place(positions, pl, bbox) {
    const rad = ((pl && pl.rot) || 0) * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    const ox = (pl && pl.x) || 0, oy = (pl && pl.y) || 0;
    const seatZ = ((pl && pl.z) || 0) - (bbox ? bbox[4] : 0);   // bbox[4] = local zmin → placement.z (elevation)
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      out[i] = cs * x - sn * y + ox; out[i + 1] = sn * x + cs * y + oy; out[i + 2] = z + seatZ;
    }
    return out;
  }
  // 12-tri box from a local bbox = the LOD-200 proxy (corner-indexed, two tris per face).
  // bbox layout is [minx,maxx,miny,maxy,minz,maxz] (NOT [x0,y0,z0,x1,y1,z1]) — map axes explicitly.
  function boxArrays(bb) {
    const x0 = bb[0], x1 = bb[1], y0 = bb[2], y1 = bb[3], z0 = bb[4], z1 = bb[5];
    const p = [x0,y0,z0, x1,y0,z0, x1,y1,z0, x0,y1,z0, x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1];
    const positions = new Float32Array(p);
    const idx = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  1,5,6, 1,6,2,  2,6,7, 2,7,3,  3,7,4, 3,4,0];
    return { positions, indices: new Uint32Array(idx) };
  }

  const Library = {
    _lod: {},                                   // featureId -> render-LOD override ('200'|'300')
    ready() { return ready; },                  // resolves when the BOM catalog JSON has loaded
    catalog() { return ALL().map(c => ({ hash: c.hash, name: c.name, ifc_class: c.ifc_class, category: c.category, group: c.group, bbox: c.bbox, fc: c.fc, boxOnly: c.boxOnly })); },
    get(hash) { return ALL().find(c => c.hash === hash) || null; },
    // BOM-catalog browse helpers (the filterable tree + the cheat sheet) — the panel renders over these.
    groups() { return GROUPS; },                                          // [{key,label,categories:[{cat,label,ifc_class,count}]}]
    productsIn(cat) { return DB_PRODUCTS.filter(p => p.cat === cat); },    // leaf products of a category
    cheatsheet() { return CHEAT.map(id => this.get(id)).filter(Boolean); },// the popular quick-picks (resolved)
    search(q) {                                                           // live filter over name + ifc_class + category
      q = String(q || '').trim().toLowerCase(); if (!q) return [];
      return ALL().filter(c => (c.name + ' ' + c.ifc_class + ' ' + (c.category || '')).toLowerCase().indexOf(q) !== -1).slice(0, 40);
    },
    // ── RECURSIVE BOM ASSEMBLIES (W-BOM-ASSEMBLY). An assembly is a non-leaf BOM (BUILDING/FLOOR/ROOM/SET);
    // dropping it folds its m_bom_line subtree into N LEAF placements — each child seated at its parent-relative
    // (dx,dy,dz)+rotation, recursing through nested BOMs. The host commits one signed GEOM_INSERT per leaf.
    assemblies() { return ASSEMBLIES; },                                  // [{id,name,level,category,w,d,h,children:[…]}]
    assembly(id) { return ASM_BY_ID[id] || null; },
    isAssembly(id) { return !!ASM_BY_ID[id]; },
    // expand to a flat list of leaf placements [{hash,x,y,z,rot,role}] in WORLD space — a FAITHFUL port of the
    // Java PlacementCollectorVisitor (the proven Rosetta BOM-chain). Per child:
    //   • the parent yaw rotates the child's (dx,dy); dz is unaffected (yaw is about +Z)
    //   • a cumulative MIRROR:X/Y reflection NEGATES the child's (dx,dy) instead of rotating it, and propagates
    //     down the stack (PlacementCollectorVisitor.java:347-356, 391, 1144-1149)
    //   • this BOM's OWN origin (a.ox/oy/oz, from m_bom.origin_x/y/z) is folded onto every child anchor on
    //     descent (PlacementCollectorVisitor.java:393-399)
    //   • a LEAF child whose offset is LBD-corner (ch.lbd, the §4 tack convention) gets its half-extent added
    //     AXIS-ALIGNED to recover the box CENTRE (cx=anchor+offset+xySign*halfW, onLeaf:1276-1280) — exactly
    //     what place() then seats the centred box on. WALL_LINEAR children already encode the centre → not lbd.
    // depth-cap + cycle-guard (visited set).
    expandAssembly(id, placement, _depth, _seen) {
      const a = ASM_BY_ID[id]; if (!a) return [];
      _depth = _depth || 0; _seen = _seen || {};
      if (_depth > 12 || _seen[id]) { console.warn(TAG + ' assembly recursion stop at ' + id + ' depth=' + _depth); return []; }
      _seen = Object.assign({}, _seen); _seen[id] = true;
      placement = placement || {};
      const px = placement.x || 0, py = placement.y || 0, pz = placement.z || 0, pr = placement.rot || 0;
      const pm = placement.mirror || '';                                   // cumulative mirror axis ('' | 'X' | 'Y')
      const rad = pr * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      const ox = a.ox || 0, oy = a.oy || 0, oz = a.oz || 0;                // this BOM's own origin (folded on descent)
      const out = [];
      (a.children || []).forEach(ch => {
        let dx = ch.dx, dy = ch.dy;
        if (pm) { dx = -dx; dy = -dy; }                                    // MIRROR:X/Y reflects X&Y (no rotation)
        else { const x2 = cs * dx - sn * dy, y2 = sn * dx + cs * dy; dx = x2; dy = y2; }
        const wx = px + dx + ox, wy = py + dy + oy, wz = pz + (ch.dz || 0) + oz;
        const childMir = ch.mirror || pm;                                  // set by this line, else inherit parent's
        const wrot = ((pr + (ch.rotDeg || 0)) % 360 + 360) % 360;
        if (ch.isBom) {
          const sub = this.expandAssembly(ch.ref, { x: wx, y: wy, z: wz, rot: wrot, mirror: childMir }, _depth + 1, _seen);
          for (let i = 0; i < sub.length; i++) out.push(sub[i]);
        } else {
          const c = this.get(ch.ref); if (!c) return;
          let cx = wx, cy = wy, cz = wz;
          if (ch.lbd && c.bbox) {                                          // LBD-corner offset → +half = box CENTRE
            const sign = pm ? -1 : 1;                                      // xySign under mirror (onLeaf:1277)
            const hw = (c.bbox[1] - c.bbox[0]) / 2, hd = (c.bbox[3] - c.bbox[2]) / 2;
            cx = wx + sign * hw; cy = wy + sign * hd;     // x/y get +half = box CENTRE (place() centres in x/y).
            // cz stays wz: bboxFromDims bases the proxy box at z=0, so place() seats the BASE at z = LBD bottom
            // (= the BOM dz); the Java AABB minZ is exactly dz, so NO half is added in z (would float the box).
            // NOTE: the +half is on WORLD axes, which is correct because expandAssembly is the CANONICAL placer —
            // for a drop it is only ever called at rot=0 (faithful Java orientation); the user drop YAW is applied
            // OUTSIDE, as a rigid rotation about the cursor, by dropLeaves (PlacementCollectorVisitor has no drop
            // yaw — cumRot/cumMirror are the building's intrinsic transforms). So no yaw reaches this half-extent.
          }
          // toFixed(7) = 0.1µm quantum (trims float noise, keeps the op-log clean) — was toFixed(4) = 0.1mm, which
          // floored the all-pairs spatial offset at 50× the Java's attested 0.002mm bar (W-DROP-VS-JAVA GAP-1).
          out.push({ hash: ch.ref, x: +cx.toFixed(7), y: +cy.toFixed(7), z: +cz.toFixed(7), rot: wrot, role: ch.role });
        }
      });
      return out;
    },

    // ── §GEO_SUMMARY — the drop's OWN runtime drift verdict (the JS twin of the Java compiler's `[GEO] SUMMARY`,
    // LAST_MILE_PROBLEM.md §7 "Next step for coder"). After a BOM is dropped, the modeller recomputes the proven
    // IntraBOM invariant over the EXPANDED placement and emits ONE self-contained §-log line — so expandAssembly
    // POLICES ITSELF at runtime, instead of correctness living only in the external witness (W-MODELLER-DROP).
    // Faithful to IntraBOMRelativeTest (= scripts/witness_modeller_drop.js checkInvariant), scoped by bom_TYPE:
    //   • R1 |dx|,|dy| < 10m  and  R2 |dz| < 4.5m  for every SET/ROOM bom leaf offset
    //   • R3 absolute-leak gate: a SET/ROOM expanded at origin keeps its all-pairs leaf-CENTRE span within its own
    //     footprint env = max(declared bbox, 10m room-scale) + 3m. A leaf flung to building-absolute coords (the
    //     PR#478 scatter — DX ±22.8m when MIRROR was mis-handled or the sub-BOM origin / ½-extent dropped) blows
    //     the span past env → DRIFT. FLOOR/BUILDING boms are EXEMPT from R1/R2/R3 (legit building-scale offsets
    //     the Java resolves additively against the tack origin) — only their SET/ROOM descendants are gated.
    // worst = the worst single excess (R1/R2 overage or R3 pair-span excess) in mm; DRIFT = total violations.
    // LOG-ONLY: reads the catalog + expandAssembly output, never mutates geometry or the op-log → cannot regress
    // geometry. On the proven catalog every droppable root is `worst=0mm, DRIFT=0`; DRIFT>0 = a port regression.
    geoSummary(rootId) {
      const root = ASM_BY_ID[rootId]; if (!root) return null;
      const R1 = 10, R2 = 4.5, ENV_FLOOR = 10, ENV_TOL = 3;
      let viol = 0, worst = 0; const detail = [], seen = {};
      const span = (vals) => { let mn = Infinity, mx = -Infinity; for (let i = 0; i < vals.length; i++) { const v = vals[i]; if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn; };
      const walk = (id) => {
        const a = ASM_BY_ID[id]; if (!a || seen[id]) return; seen[id] = true;
        const scoped = !(a.level === 'FLOOR' || a.level === 'BUILDING');   // IntraBOM scoping: SET/ROOM only
        (a.children || []).forEach(ch => {
          if (ch.isBom) { walk(ch.ref); return; }
          if (!scoped) return;
          const e1 = Math.max(Math.abs(ch.dx) - R1, Math.abs(ch.dy) - R1);
          if (e1 > 0) { viol++; worst = Math.max(worst, e1); detail.push('R1 ' + id + '/' + ch.role + ' dx=' + ch.dx + ' dy=' + ch.dy); }
          const e2 = Math.abs(ch.dz || 0) - R2;
          if (e2 > 0) { viol++; worst = Math.max(worst, e2); detail.push('R2 ' + id + '/' + ch.role + ' dz=' + ch.dz); }
        });
        if (scoped) {                                                      // R3 all-pairs span vs own envelope
          const ex = this.expandAssembly(id, { x: 0, y: 0, z: 0, rot: 0 });
          if (ex.length > 1) {
            const sX = span(ex.map(l => l.x)), sY = span(ex.map(l => l.y));
            const envX = Math.max(a.w || 0, ENV_FLOOR) + ENV_TOL, envY = Math.max(a.d || 0, ENV_FLOOR) + ENV_TOL;
            const e3 = Math.max(sX - envX, sY - envY);
            if (e3 > 0) { viol++; worst = Math.max(worst, e3); detail.push('R3 ' + id + ' span=' + sX.toFixed(1) + 'x' + sY.toFixed(1) + ' env=' + envX.toFixed(1) + 'x' + envY.toFixed(1)); }
          }
        }
      };
      walk(rootId);
      const all = this.expandAssembly(rootId, { x: 0, y: 0, z: 0, rot: 0 });
      const n = all.length, pairs = n * (n - 1) / 2, worstMm = Math.round(worst * 1000);
      console.log('§GEO_SUMMARY ' + rootId + ' [' + root.level + '] ' + n + ' leaves, ' + pairs + ' pairs, worst=' + worstMm + 'mm, DRIFT=' + viol);
      if (viol) console.warn(TAG + ' §GEO_SUMMARY DRIFT ' + viol + ' — port regression (expected 0): ' + detail.slice(0, 6).join(' | '));
      return { rootId, level: root.level, leaves: n, pairs, worstMm, drift: viol, detail };
    },

    // ── TRUE leaf-footprint AABB of a dropped assembly (W-BOM-DROP-CENTER). Expand the BOM to its N leaf boxes
    // and union their world AABBs — the ACTUAL footprint the parts occupy. This is NOT the catalog's declared
    // aabb (asm.w/d): that is the parent-PRODUCT box, not the laid-out children (e.g. BED_SET declares 1.2×0.6m
    // but its 5 children span 3.5×2.0m). Used to (a) centre the drop on the cursor and (b) size the ghost box so
    // both match where the parts really land. Returns null for a leafless assembly.
    footprintAABB(id, placement) {
      const lv = this.expandAssembly(id, placement || { x: 0, y: 0, z: 0, rot: 0 });
      if (!lv.length) return null;
      let xn = Infinity, xx = -Infinity, yn = Infinity, yx = -Infinity, zn = Infinity, zx = -Infinity;
      for (let i = 0; i < lv.length; i++) {
        const lf = lv[i], c = this.get(lf.hash), bb = c && c.bbox;
        const hw = bb ? (bb[1] - bb[0]) / 2 : 0, hd = bb ? (bb[3] - bb[2]) / 2 : 0, hh = bb ? (bb[5] - bb[4]) : 0;
        if (lf.x - hw < xn) xn = lf.x - hw; if (lf.x + hw > xx) xx = lf.x + hw;
        if (lf.y - hd < yn) yn = lf.y - hd; if (lf.y + hd > yx) yx = lf.y + hd;
        if (lf.z < zn) zn = lf.z; if (lf.z + hh > zx) zx = lf.z + hh;   // box base = lf.z, top = base + height
      }
      return { minX: xn, maxX: xx, minY: yn, maxY: yx, minZ: zn, maxZ: zx,
               cx: (xn + xx) / 2, cy: (yn + yx) / 2, cz: (zn + zx) / 2, w: xx - xn, d: yx - yn, h: zx - zn };
    },

    // ── HOST-ROTATION INHERITANCE (W-DAGEVU-DROP openings / project_openings_inherit_host_rotation). A door, window
    // or opening-element VOIDS INTO a wall (IfcRelVoidsElement → IfcRelFillsElement) and must rotate EN BLOC with
    // that host wall — never sit flat at rot=0 while the wall turns. The BOM dropped the host link (host_element_ref
    // is 100% empty in SH/DX_BOM.db) AND carries no numeric door rotation (rotation_rule=0; the FACE_* symbolic
    // rules go unresolved with no wall context), so the opening lands at rot=0 — the "missed one-fetch save". We
    // RECOVER the host at PLACEMENT time, over the FULLY-EXPANDED building (world space, every wall present — the
    // sub-BOM partition that hides the host at extract time, e.g. exterior shell walls living in a different BOM
    // than the mirror-unit's openings, is gone here). Each opening inherits the rotation of the wall it is provably
    // EMBEDDED in: perpendicular offset < wall½thickness + tol AND within the wall's run segment. NON-INVENT: we
    // read the host wall's OWN world rotation (itself derived from the BOM's numeric rotation_rule) and copy it —
    // we never fabricate an angle. An opening matching NO wall keeps rot=0 (HONEST, logged) — never a guessed wall.
    // This is the empirical fold of CONSTRUCTION_VERB_BOM_GRAMMAR.md §4.4 OPENING (host-relative placement).
    _HOST_TOL_PERP: 0.15, _HOST_TOL_ALONG: 0.25,
    _inheritHostRotation(leaves) {
      const cls = (h) => { const c = this.get(h); return c ? (c.ifc_class || '') : ''; };
      const walls = leaves.filter(l => /IfcWall/.test(cls(l.hash)));
      const opens = leaves.filter(l => /IfcDoor|IfcWindow|IfcOpening/.test(cls(l.hash)));
      if (!walls.length || !opens.length) return { openings: opens.length, resolved: 0, unresolved: opens.length };
      const runAx = (rot) => { const d = Math.abs((rot || 0) % 180); return Math.abs(d - 90) < 45 ? 'NS' : 'EW'; };
      let resolved = 0, unresolved = 0;
      for (const op of opens) {
        let best = null, bd = Infinity;
        for (const w of walls) {
          const wp = this.get(w.hash); if (!wp) continue;
          const ax = runAx(w.rot);                                          // wall runs N-S (along Y) or E-W (along X)
          const wlen = ax === 'NS' ? (wp.d || 0) : (wp.w || 0);             // run length along the wall axis
          const wth  = ax === 'NS' ? (wp.w || 0) : (wp.d || 0);             // wall thickness (perpendicular)
          const perp  = ax === 'NS' ? Math.abs(op.x - w.x) : Math.abs(op.y - w.y);
          const along = ax === 'NS' ? Math.abs(op.y - w.y) : Math.abs(op.x - w.x);
          if (perp < wth / 2 + this._HOST_TOL_PERP && along < wlen / 2 + this._HOST_TOL_ALONG && perp < bd) {
            bd = perp; best = w;                                            // closest wall the opening is embedded in
          }
        }
        if (best) { op.rot = best.rot; op.hostRef = best.hash; resolved++; }  // inherit host wall rotation EN BLOC
        else { unresolved++; }                                               // no embedding wall → honest rot=0
      }
      console.log(TAG + ' §HOST-ROT openings=' + opens.length + ' inherited=' + resolved + ' unresolved=' +
        unresolved + ' (each inherits its embedded host-wall rotation EN BLOC; unresolved kept honest at rot=0)');
      return { openings: opens.length, resolved, unresolved };
    },

    // ── DROP an assembly onto the canvas: the N leaf placements with the footprint CENTRE on (cursorX,cursorY) and
    // a user DROP YAW applied (W-BOM-DROP-CENTER). KEY (from reading PlacementCollectorVisitor.java:347-374): the
    // Java compiler has NO external drop rotation — its cumRot/cumMirror are the building's INTRINSIC transforms,
    // and MIRROR:X is defined as rot=π (negate X&Y), so `if(mirror) else if(rot)` is correct THERE. The modeller
    // adds a yaw the Java never had; threading it through the BOM recursion's cumRot gets it SWALLOWED under mirror
    // (a rotated mirror-building drop scattered 45m). So expand at the CANONICAL orientation (rot=0 = the proven
    // Java path, expandAssembly UNTOUCHED) and apply the drop yaw as a RIGID rotation about the drop point — an
    // external rigid-body transform, where it belongs. yaw=0 reduces to "centre the true footprint on the cursor".
    dropLeaves(id, cursorX, cursorY, yaw, z) {
      const canonical = this.expandAssembly(id, { x: 0, y: 0, z: 0, rot: 0 });  // faithful Java building, no drop yaw
      this._inheritHostRotation(canonical);                                     // openings rotate EN BLOC with host wall
      const fp = this.footprintAABB(id, { x: 0, y: 0, z: 0, rot: 0 });
      if (!fp) return canonical;
      const r = (yaw || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), ez = z || 0;
      const out = [];
      for (let i = 0; i < canonical.length; i++) {
        const lf = canonical[i], lx = lf.x - fp.cx, ly = lf.y - fp.cy;          // leaf relative to footprint centre
        out.push({ hash: lf.hash, role: lf.role,
          x: +(cursorX + (cs * lx - sn * ly)).toFixed(7),                       // rigid-rotate the canonical cluster
          y: +(cursorY + (sn * lx + cs * ly)).toFixed(7),                       // about the cursor by the drop yaw
          z: +(lf.z + ez).toFixed(7),                                          // toFixed(7) = 0.1µm (GAP-1 precision)
          rot: (((lf.rot || 0) + (yaw || 0)) % 360 + 360) % 360 });             // mesh orientation += drop yaw
      }
      return out;
    },

    setLod(featureId, lod) { this._lod[featureId] = String(lod); return this; },
    lodFor(featureId, fallback) { return this._lod[featureId] || fallback || '200'; },

    // ── LAZY real-mesh store (component_library.db geometry, extracted per curated product as `gh`). The
    // geometries JSON is fetched ON DEMAND — only when a real mesh is first needed (an insert), never at boot
    // (the box-proxy catalog already loaded). The SAME wiring scales to the full 220MB db via httpvfs later.
    _geom: null, _geomP: null,
    hasMesh(hash) { const c = this.get(hash); return !!(c && ((c.gh && this._geom && this._geom[c.gh]) || (c.v && c.f))); },
    ensureMesh(hash) {                          // resolves once the real mesh for `hash` is available (or null)
      const c = this.get(hash);
      if (!c || !c.gh || (this._geom && this._geom[c.gh])) return Promise.resolve(this.hasMesh(hash));
      // RESILIENT load (W-BONSAI-LOD-RESILIENT): the geometries store is a SINGLE point of failure for every
      // GEOM_INSERT (an assembly = many leaves all riding this one fetch). A transient hiccup must NOT poison the
      // session into LOD-200 boxes — so on ANY failure we DROP _geomP (leave _geom null) so the NEXT ensureMesh
      // retries cleanly, and we check r.ok (a 404/empty service-worker response must not flow into r.json()).
      if (!this._geomP) {
        this._geomP = (typeof fetch === 'function')
          ? fetch(new URL('dagevu_geometries.json?v=7', _base).href)
              .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
              .then(j => { this._geom = j; console.log(TAG + ' geometries lazy-loaded meshes=' + Object.keys(j).length); return j; })
              .catch(e => { console.warn(TAG + ' geometries load failed (will retry next insert) ' + e); this._geomP = null; return null; })
          : Promise.resolve(this._geom = {});
      }
      return this._geomP.then(() => this.hasMesh(hash));
    },

    meshArrays(hash) {                          // LOD-300: real extracted mesh if loaded, else box proxy (dims-only)
      const c = this.get(hash); if (!c) throw new Error('no component ' + hash);
      const g = (c.gh && this._geom && this._geom[c.gh]) ? this._geom[c.gh] : (c.v && c.f ? c : null);
      if (!g) return boxArrays(c.bbox);
      const positions = new Float32Array(b64ToBuf(g.v)), indices = new Uint32Array(b64ToBuf(g.f));
      return { positions, indices, bbox: bboxOf(positions) };   // real mesh carries its OWN bbox for correct seating
    },

    // THE FOLD for a GEOM_INSERT op-row -> a transferable mesh payload (same shape the worker returns).
    // `mv` (optional {dx,dy,dz}) = the NET translation of any GEOM_MOVE op-rows referencing this insert (W-BONSAI-MOVE
    // PATH B). It is a pure FOLD OVERRIDE over the immutable signed GEOM_INSERT row — same doctrine as the LOD
    // override (lodFor): the signed placement is never rewritten; the move is its own signed row, summed by the
    // host and applied here BEFORE place() so the existing yaw + ground-seat math (place() subtracts bbox[4]) runs
    // unchanged and the delta lands in the position BUFFER → geo.computeBoundingBox sees world coords for free
    // (gridmove.elementData + bCut bbox stay correct with zero consumer edits).
    foldInsert(op, mv) {
      const P = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
      // §ARC-1: a RAW-BBOX insert (no catalog hash, P.bbox = a MEASURED box from element_transforms) is the
      // editable-ARC substrate path — a real building wall/door seeded as a signed GEOM_INSERT carrying its own
      // measured extent. Box-proxy (LOD-200) only: there is no catalog mesh to refine to. A declared hash that is
      // UNKNOWN still errors (unchanged); a hash-less op with no bbox is a malformed insert.
      const c = P.hash ? this.get(P.hash) : null;
      if (P.hash && !c) throw new Error('GEOM_INSERT unknown component ' + P.hash);
      const rawBox = (!c && Array.isArray(P.bbox)) ? P.bbox : null;
      if (!c && !rawBox) throw new Error('GEOM_INSERT needs a hash or a measured bbox');
      const lod = this.lodFor(op.id, P.lod);
      let base = (c && lod === '300') ? this.meshArrays(P.hash) : boxArrays(c ? c.bbox : rawBox);
      let pl = P.placement;
      // W-BONSAI-SCALE PATH B: net GEOM_SCALE folds host-side on the insert's LOCAL geometry — EDGE-ANCHORED at the
      // local bbox min per axis (stretch the object along its own length), so it composes with the existing yaw +
      // ground-seat math (place() seats on the SCALED bbox). SIZE only — scales geometry, never the placement.
      if (mv && ((mv.fx != null && mv.fx !== 1) || (mv.fy != null && mv.fy !== 1) || (mv.fz != null && mv.fz !== 1))) {
        const fx = mv.fx != null ? mv.fx : 1, fy = mv.fy != null ? mv.fy : 1, fz = mv.fz != null ? mv.fz : 1;
        const bb = base.bbox || c.bbox;                                  // [xmin,xmax,ymin,ymax,zmin,zmax]
        const ax = bb[0], ay = bb[2], az = bb[4];
        const sp = base.positions.slice();                              // don't mutate the cached catalog arrays
        for (let i = 0; i < sp.length; i += 3) {
          sp[i] = ax + fx * (sp[i] - ax); sp[i + 1] = ay + fy * (sp[i + 1] - ay); sp[i + 2] = az + fz * (sp[i + 2] - az);
        }
        const sbb = [ax, ax + fx * (bb[1] - ax), ay, ay + fy * (bb[3] - ay), az, az + fz * (bb[5] - az)];
        base = { positions: sp, indices: base.indices, bbox: sbb };
      }
      if (mv && (mv.dx || mv.dy || mv.dz || mv.drot)) {
        let ox = (P.placement.x || 0) + (mv.dx || 0), oy = (P.placement.y || 0) + (mv.dy || 0);
        const oz = (P.placement.z || 0) + (mv.dz || 0), pr = P.placement.rot || 0;
        let rot = pr;
        if (mv.drot) {
          // W-BONSAI-ROTATE: yaw the insert about its bbox CENTRE (the visible centre, == the gizmo ring centre) so it
          // SPINS in place rather than orbiting the placement origin. place() rotates local coords about (0,0) then
          // adds (ox,oy); to keep the world centre fixed under the new yaw, solve (ox,oy) from the centre invariant.
          const bb = base.bbox || (c ? c.bbox : rawBox), lcx = (bb[0] + bb[1]) / 2, lcy = (bb[2] + bb[3]) / 2;
          const r0 = pr * Math.PI / 180, c0 = Math.cos(r0), s0 = Math.sin(r0);
          const wcx = c0 * lcx - s0 * lcy + ox, wcy = s0 * lcx + c0 * lcy + oy;   // current world centre
          rot = pr + mv.drot;
          const r1 = rot * Math.PI / 180, c1 = Math.cos(r1), s1 = Math.sin(r1);
          ox = wcx - (c1 * lcx - s1 * lcy); oy = wcy - (s1 * lcx + c1 * lcy);     // re-anchor so the centre stays put
        }
        pl = { x: ox, y: oy, z: oz, rot };
      }
      const positions = place(base.positions, pl, base.bbox || (c ? c.bbox : rawBox));   // real mesh seats on its own bbox
      // PER-MESH colour: a signed GEOM_INSERT may carry parameters.color (hex int) — RouteWalker fixtures persist
      // their discipline colour there so each box keeps it through scrub/replay (the fold is otherwise one colour).
      return { featureId: op.id, triangleCount: base.indices.length / 3, positions, normals: null, indices: base.indices, color: (P.color != null ? P.color : undefined) };
    },

    // GHOST preview (uncommitted): a LOD-200 box of the component at a candidate placement, so the host can
    // show where/how an insert will land (with current yaw + elevation) BEFORE the user clicks to commit.
    previewArrays(hash, placement) {
      const c = this.get(hash); if (!c) return null;
      const base = boxArrays(c.bbox);
      return { positions: place(base.positions, placement, c.bbox), indices: base.indices, bbox: c.bbox };
    },
    // GHOST for an ASSEMBLY: its aabb box (the whole set's footprint) at the candidate placement.
    previewBox(bbox, placement) {
      const base = boxArrays(bbox);
      return { positions: place(base.positions, placement, bbox), indices: base.indices, bbox };
    },
    // RICH ASSEMBLY GHOST (M7 / RESUME_MODELLER_POLISH.md #6): the N CHILD boxes at their REAL landing positions
    // — the SAME dropLeaves transform the commit uses (footprint centred on the cursor + drop yaw + host-rotation),
    // merged into one geometry — so the preview shows the actual child set, not just the enclosing aabb. Capped at
    // MAX leaves: a whole-building drop returns {tooMany:n} and the caller falls back to the footprint box (logged),
    // protecting the per-pointermove path. Returns {positions,indices,count} | {tooMany:n} | null.
    previewLeafBoxes(id, placement) {
      const pl = placement || { x: 0, y: 0, z: 0, rot: 0 };
      const leaves = this.dropLeaves(id, pl.x || 0, pl.y || 0, pl.rot || 0, pl.z || 0);
      if (!leaves || !leaves.length) return null;
      const MAX = 2000;
      if (leaves.length > MAX) return { tooMany: leaves.length };
      let nv = 0, ni = 0; const parts = [];
      for (let i = 0; i < leaves.length; i++) {
        const lf = leaves[i], c = this.get(lf.hash), bb = (c && c.bbox) || [-0.05, 0.05, -0.05, 0.05, 0, 0.1];
        const ba = boxArrays(bb);
        const pos = place(ba.positions, { x: lf.x, y: lf.y, z: lf.z, rot: lf.rot }, bb);
        parts.push({ pos: pos, idx: ba.indices }); nv += pos.length / 3; ni += ba.indices.length;
      }
      const positions = new Float32Array(nv * 3), indices = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j]; positions.set(p.pos, vo * 3);
        for (let k = 0; k < p.idx.length; k++) indices[io + k] = p.idx[k] + vo;
        vo += p.pos.length / 3; io += p.idx.length;
      }
      return { positions: positions, indices: indices, count: leaves.length };
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.library = Library;
  console.log(TAG + ' module loaded legacy=' + CATALOG.length + ' (BOM catalog loads async)');
})();
