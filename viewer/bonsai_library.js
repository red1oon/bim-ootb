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
    ? fetch(new URL('dagevu_catalog.json?v=5', _base).href).then(function (r) { return r.json(); }).then(function (j) {
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
    // expand to a flat list of leaf placements [{hash,x,y,z,rot,role}] in WORLD space. Yaw is about +Z so a
    // child's local (dx,dy) rotates by the parent yaw; dz is unaffected. depth-cap + cycle-guard (visited set).
    expandAssembly(id, placement, _depth, _seen) {
      const a = ASM_BY_ID[id]; if (!a) return [];
      _depth = _depth || 0; _seen = _seen || {};
      if (_depth > 12 || _seen[id]) { console.warn(TAG + ' assembly recursion stop at ' + id + ' depth=' + _depth); return []; }
      _seen = Object.assign({}, _seen); _seen[id] = true;
      placement = placement || {};
      const px = placement.x || 0, py = placement.y || 0, pz = placement.z || 0, pr = placement.rot || 0;
      const rad = pr * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
      const out = [];
      (a.children || []).forEach(ch => {
        const wx = px + (cs * ch.dx - sn * ch.dy), wy = py + (sn * ch.dx + cs * ch.dy), wz = pz + (ch.dz || 0);
        const wrot = ((pr + (ch.rotDeg || 0)) % 360 + 360) % 360;
        if (ch.isBom) { const sub = this.expandAssembly(ch.ref, { x: wx, y: wy, z: wz, rot: wrot }, _depth + 1, _seen); for (let i = 0; i < sub.length; i++) out.push(sub[i]); }
        else if (this.get(ch.ref)) out.push({ hash: ch.ref, x: +wx.toFixed(4), y: +wy.toFixed(4), z: +wz.toFixed(4), rot: wrot, role: ch.role });
      });
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
          ? fetch(new URL('dagevu_geometries.json?v=4', _base).href)
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
      const c = this.get(P.hash); if (!c) throw new Error('GEOM_INSERT unknown component ' + P.hash);
      const lod = this.lodFor(op.id, P.lod);
      const base = (lod === '300') ? this.meshArrays(P.hash) : boxArrays(c.bbox);
      let pl = P.placement;
      if (mv && (mv.dx || mv.dy || mv.dz || mv.drot)) {
        let ox = (P.placement.x || 0) + (mv.dx || 0), oy = (P.placement.y || 0) + (mv.dy || 0);
        const oz = (P.placement.z || 0) + (mv.dz || 0), pr = P.placement.rot || 0;
        let rot = pr;
        if (mv.drot) {
          // W-BONSAI-ROTATE: yaw the insert about its bbox CENTRE (the visible centre, == the gizmo ring centre) so it
          // SPINS in place rather than orbiting the placement origin. place() rotates local coords about (0,0) then
          // adds (ox,oy); to keep the world centre fixed under the new yaw, solve (ox,oy) from the centre invariant.
          const bb = base.bbox || c.bbox, lcx = (bb[0] + bb[1]) / 2, lcy = (bb[2] + bb[3]) / 2;
          const r0 = pr * Math.PI / 180, c0 = Math.cos(r0), s0 = Math.sin(r0);
          const wcx = c0 * lcx - s0 * lcy + ox, wcy = s0 * lcx + c0 * lcy + oy;   // current world centre
          rot = pr + mv.drot;
          const r1 = rot * Math.PI / 180, c1 = Math.cos(r1), s1 = Math.sin(r1);
          ox = wcx - (c1 * lcx - s1 * lcy); oy = wcy - (s1 * lcx + c1 * lcy);     // re-anchor so the centre stays put
        }
        pl = { x: ox, y: oy, z: oz, rot };
      }
      const positions = place(base.positions, pl, base.bbox || c.bbox);   // real mesh seats on its own bbox
      return { featureId: op.id, triangleCount: base.indices.length / 3, positions, normals: null, indices: base.indices };
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
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.library = Library;
  console.log(TAG + ' module loaded legacy=' + CATALOG.length + ' (BOM catalog loads async)');
})();
