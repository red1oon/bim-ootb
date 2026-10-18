// bonsai_ifc.js — Bonsai IFC export: the authored signed op-log -> a standards IFC4 file via web-ifc.
// prompts/BONSAI_KERNEL_RESEARCH.md Item 3(c). Completes author -> sign -> EXPORT: each GEOM feature in
// the op-log becomes a real IFC product. GEOM_EXTRUDE_POLY -> IfcWall + IfcArbitraryClosedProfileDef
// (the solved sketch polygon) extruded; GEOM_CUT -> IfcOpeningElement (the void prism) + IfcRelVoidsElement
// linking it to the parent wall. The W-KERNEL-WEBIFC round-trip (proven headless) is now driven from the
// in-viewer model. HONEST SCOPE: geometry envelope + wall/opening shell + voids relation; Psets, materials,
// owner history, full spatial containment and styling are dropped by design (web-ifc CAN write them).
(function () {
  'use strict';
  const TAG = '§IFC';
  const _base = (typeof document !== 'undefined' && document.currentScript) ? document.currentScript.src : location.href;
  const GUID_AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
  function guid(n) {                          // deterministic 22-char IfcGloballyUniqueId (no Math.random), UNIQUE per n
    // Bug fixed 2026-10-18: the old LCG took x % 64 (its LOW bits have period 64), so at most 64 distinct ids existed: a 457-product export
    // had 64 duplicated GlobalIds and the extractor collapsed products. Now: the last 6 chars ARE n (base-64, unique for n < 2^36), the first
    // char is 0-3 (IFC compressed-GUID rule), the middle 15 chars are mixed from n (high bits, murmur finalizer).
    let h = (n + 1) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    let s = GUID_AB[52 + ((h >>> 30) & 3)];
    for (let i = 1; i < 16; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; s += GUID_AB[h >>> 26]; }
    let m = n; const t = []; for (let i = 0; i < 6; i++) { t.unshift(GUID_AB[m % 64]); m = Math.floor(m / 64); }
    return s + t.join('');
  }

  // ── GEOM_ARRAY export mapping (prompts/BONSAI_ARRAY_PATTERN_SPEC.md Task 5) ────────────────────────
  // NON-INVENT, corrected 2026-07-07 per the spec's own "2026-07-07 Research finding": IfcElementAssembly
  // (+ IfcRelAggregates) is COMPOSITIONAL only (trusses/frames/slab-fields — a designed sub-system), NOT
  // how real IFC exporters represent repetition — confirmed via a cited OSArch/IfcOpenShell community
  // discussion: "IFC doesn't support 'arrays' ... the number of IfcBeam elements in the file IS the
  // number of beams." So an array's N instances export as N INDEPENDENT IfcMember occurrences (no fake
  // "IfcArray" grouping entity — IFC has none), all sharing ONE IfcMemberType via IfcRelDefinesByType
  // (the real IFC typing relationship — cheap, correct, and expresses "these N came from the same
  // template" without misusing an aggregation relationship). Where instances are geometrically IDENTICAL
  // (no formula), their geometry is further shared via ONE IfcRepresentationMap + per-instance
  // IfcMappedItem (the standard IFC "block insert" reuse pattern) instead of N duplicated B-reps; a
  // formula-varied array can't share geometry (the shapes differ), so each instance keeps its own
  // full ExtrudedAreaSolid representation — still typed by the same shared IfcMemberType.
  const _arrayDeltas = (P, count) => {
    const out = [];
    if (P.mode === 'along_curve') {
      const pts = P.curve; const seglen = []; let total = 0;
      for (let k = 0; k < pts.length - 1; k++) { const d = Math.hypot(pts[k+1][0]-pts[k][0], pts[k+1][1]-pts[k][1], pts[k+1][2]-pts[k][2]); seglen.push(d); total += d; }
      const at = (s) => { let acc = 0; for (let k = 0; k < seglen.length; k++) { if (s <= acc + seglen[k] || k === seglen.length - 1) { const t = seglen[k] > 0 ? (s - acc) / seglen[k] : 0; const a = pts[k], b = pts[k+1]; return [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]), a[2]+t*(b[2]-a[2])]; } acc += seglen[k]; } return pts[pts.length-1]; };
      const p0 = pts[0];
      for (let i = 0; i < count; i++) { const s = count > 1 ? (i/(count-1))*total : 0; const p = at(s); out.push({ dx: p[0]-p0[0], dy: p[1]-p0[1], dz: p[2]-p0[2] }); }
    } else {
      const axis = P.axis || [1,0,0]; const al = Math.hypot(axis[0],axis[1],axis[2]) || 1;
      const ux = axis[0]/al, uy = axis[1]/al, uz = axis[2]/al, sp = P.spacing != null ? P.spacing : 1;
      for (let i = 0; i < count; i++) out.push({ dx: ux*sp*i, dy: uy*sp*i, dz: uz*sp*i });
    }
    return out;
  };
  const _getPath = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
  // Same whitelisted grammar as bonsai_kernel_worker.js's evalFormula — never eval()/Function(). Kept as
  // an independent copy (host context vs. worker context share no module scope in this codebase's pattern).
  const _evalFormula = (expr, vars) => {
    const s = String(expr == null ? '' : expr);
    if (!/^[0-9.+\-*/()\s a-zA-Z_]*$/.test(s)) throw new Error('GEOM_ARRAY formula: illegal character');
    let pos = 0; const peek = () => s[pos]; const skip = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
    function pExpr() { skip(); let v = pTerm(); for (;;) { skip(); const c = peek(); if (c === '+') { pos++; v += pTerm(); } else if (c === '-') { pos++; v -= pTerm(); } else break; } return v; }
    function pTerm() { skip(); let v = pFactor(); for (;;) { skip(); const c = peek(); if (c === '*') { pos++; v *= pFactor(); } else if (c === '/') { pos++; v /= pFactor(); } else break; } return v; }
    function pFactor() { skip(); if (peek() === '-') { pos++; return -pFactor(); } if (peek() === '+') { pos++; return pFactor(); }
      if (peek() === '(') { pos++; const v = pExpr(); skip(); if (peek() !== ')') throw new Error('GEOM_ARRAY formula: expected )'); pos++; return v; }
      const nm = /^[0-9]*\.?[0-9]+/.exec(s.slice(pos)); if (nm) { pos += nm[0].length; return parseFloat(nm[0]); }
      const im = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(pos)); if (im) { pos += im[0].length; if (!(im[0] in vars)) throw new Error('GEOM_ARRAY formula: unknown identifier ' + im[0]); return vars[im[0]]; }
      throw new Error('GEOM_ARRAY formula: unexpected token'); }
    const r = pExpr(); skip(); if (pos !== s.length) throw new Error('GEOM_ARRAY formula: trailing input'); return r;
  };

  const Ifc = {
    _api: null,

    async _init() {
      if (this._api) return this._api;
      const api = new WebIFC.IfcAPI();
      await api.Init((p) => new URL('lib/' + p, _base).href);   // locate web-ifc.wasm next to the api
      this._api = api;
      console.log(TAG + ' web-ifc ready');
      return api;
    },

    // Build an IFC4 model from the op-log GEOM features; returns { bytes, walls, openings, rels }.
    async build() {
      const api = await this._init();
      const T = WebIFC;
      const ops = window.Bonsai.oplog._geomOps();          // [{id, op_type, parameters, parent}]
      const _cutMoves = window.CutMove ? window.CutMove.netOverrides(ops) : null;   // §CUT-MOVE/§CUT-RESIZE: net void overrides (cut_move.js, one definition)
      if (!ops.length) throw new Error('nothing authored to export');
      const mID = api.CreateModel({ schema: 'IFC4', name: 'bonsai_model.ifc' });
      const len = v => api.CreateIfcType(mID, T.IFCLENGTHMEASURE, v);
      const real = v => api.CreateIfcType(mID, T.IFCREAL, v);
      const plm = v => api.CreateIfcType(mID, T.IFCPOSITIVELENGTHMEASURE, v);
      const label = v => api.CreateIfcType(mID, T.IFCLABEL, v);
      const pos1 = v => api.CreateIfcType(mID, T.IFCPOSITIVEINTEGER, v);   // §IFC-EXPORT-SEED: 1-based tessellation index
      const z3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(0), real(0), real(1)]);
      const x3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(1), real(0), real(0)]);
      const place3 = (o) => api.CreateIfcEntity(mID, T.IFCAXIS2PLACEMENT3D,
        api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(o[0]), len(o[1]), len(o[2])]), z3(), x3());

      // §IFC-SPATIAL (prompts/DXF2BIM_MODELLER_LANE.md L3): IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey, every
      // product contained. Until 2026-10-16 the file had NO spatial structure at all (no IfcProject), so it was not a valid IFC4
      // model. A product goes to a storey ONLY when its op carries parameters.storey (+ storey_elev); otherwise it is contained
      // in the building itself, never a guessed storey. Units: SI metre / square metre / cubic metre / radian.
      const enumOf = (E, v) => (T.IFC4 && T.IFC4[E] && T.IFC4[E][v]) || { type: 3, value: v };
      const siUnit = (ut, nm) => api.CreateIfcEntity(mID, T.IFCSIUNIT, enumOf('IfcUnitEnum', ut), null, enumOf('IfcSIUnitName', nm));
      const units = api.CreateIfcEntity(mID, T.IFCUNITASSIGNMENT, [siUnit('LENGTHUNIT', 'METRE'), siUnit('AREAUNIT', 'SQUARE_METRE'), siUnit('VOLUMEUNIT', 'CUBIC_METRE'), siUnit('PLANEANGLEUNIT', 'RADIAN')]);
      const ctx = api.CreateIfcEntity(mID, T.IFCGEOMETRICREPRESENTATIONCONTEXT, null, label('Model'), api.CreateIfcType(mID, T.IFCDIMENSIONCOUNT, 3), real(1e-5), place3([0, 0, 0]), null);
      const spatialGid = (k) => api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(1000000 + k));
      const localPl = (rel, z) => api.CreateIfcEntity(mID, T.IFCLOCALPLACEMENT, rel, place3([0, 0, z || 0]));
      const project = api.CreateIfcEntity(mID, T.IFCPROJECT, spatialGid(0), null, label('Bonsai model'), null, null, null, null, [ctx], units);
      const sitePl = localPl(null, 0), bldPl = localPl(sitePl, 0);
      const site = api.CreateIfcEntity(mID, T.IFCSITE, spatialGid(1), null, label('Site'), null, null, sitePl, null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), null, null, null, null, null);
      const building = api.CreateIfcEntity(mID, T.IFCBUILDING, spatialGid(2), null, label('Building'), null, null, bldPl, null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), null, null, null);
      [project, site, building].forEach(e => api.WriteLine(mID, e));
      const storeys = new Map();                      // storey name -> { e, elev, products: [] }
      const buildingProducts = [];
      let _curOp = null;
      const storeyFor = (op) => {
        const P = op && op.parameters;
        if (!P || P.storey == null || P.storey_elev == null || !isFinite(+P.storey_elev)) return null;
        if (!storeys.has(P.storey)) {
          const e = api.CreateIfcEntity(mID, T.IFCBUILDINGSTOREY, spatialGid(10 + storeys.size), null, label(String(P.storey)), null, null,
            localPl(bldPl, +P.storey_elev), null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), len(+P.storey_elev));
          api.WriteLine(mID, e); storeys.set(P.storey, { e, elev: +P.storey_elev, products: [] });
        }
        return storeys.get(P.storey);
      };
      const contain = (e, type) => { if (type === T.IFCOPENINGELEMENT) return; const st = storeyFor(_curOp); (st ? st.products : buildingProducts).push(e); };

      const productFromRep = (rep, type, name, gn, extra, objType) => {   // an already-built IfcShapeRepresentation -> a product
        const pds = api.CreateIfcEntity(mID, T.IFCPRODUCTDEFINITIONSHAPE, null, null, [rep]);
        const g = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn));
        const args = [g, null, label(name), null, objType ? label(objType) : null, null, pds, null];
        if (extra) args.push(...extra);                       // IfcOpeningElement adds Tag + PredefinedType
        const e = api.CreateIfcEntity(mID, type, ...args);
        api.WriteLine(mID, e);
        contain(e, type);
        return e;
      };
      const product = (solid, type, name, gn, extra) => {     // shape shell -> IfcWall / IfcOpeningElement
        const rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('SweptSolid'), [solid]);
        return productFromRep(rep, type, name, gn, extra);
      };

      const wallByFeature = new Map();
      let walls = 0, openings = 0, rels = 0, gn = 0, arrays = 0, arrayMembers = 0;
      let firstWall = null, firstArray = null;

      // ── §IFC-EXPORT-SEED (MODELLER_MASTER.md row 36 / §IFC-EXPORT-SEED) ───────────────────────────
      // Until 2026-09-18 this loop handled GEOM_EXTRUDE_POLY / GEOM_CUT / GEOM_ARRAY only. EVERY
      // ARC-seeded element is a GEOM_INSERT (arc_editable.js), so exporting an opened resident matched
      // ZERO ops and produced an empty file — measured on Duplex: 196 meshes on screen, build() returned
      // {walls:0, openings:0, arrays:0, bytes:592}. That is a header and nothing else.
      //
      // GEOMETRY SOURCE — the renderer's OWN vertices, deliberately NOT a re-derived transform.
      // This is the direct lesson of §XEDGE-GEOWIRE (bim-ootb #1744), same day: cross_edges.js
      // re-implemented "world = centre + R·vert", its header called that "the same final numbers, fewer
      // steps", and it was wrong for 798 of 934 elements because center_xyz is the placement ANCHOR, not
      // the volumetric centre. The folded meshes already hold WORLD-space positions baked into their
      // geometry — measured: matrixWorld is identity on all 3,290 SampleCastle meshes and
      // geometry.boundingBox equals Box3.setFromObject to 0.000e+0. So read those coordinates verbatim
      // and parity with what the user sees is structural, not something a witness has to chase.
      const _scene = (typeof window !== 'undefined' && window.Bonsai && window.Bonsai.group) ? window.Bonsai.group() : null;
      const _meshByFid = new Map();
      if (_scene) for (const m of _scene.children) if (m.isMesh && m.userData && m.userData.featureId != null) _meshByFid.set(m.userData.featureId, m);
      const _fidByGuid = (typeof window !== 'undefined' && window.__arcFidByGuid) || {};
      // ifc_class -> IFC4 entity. EXTRACTED from the residents, never invented; an unmapped real class
      // becomes IfcBuildingElementProxy, which is IFC's own honest answer for "a real product whose
      // specific type this exporter does not model" — counted and logged, never silently dropped.
      // EXTRACTED, not invented: this is the complete `ifc_class` census of all EIGHT shipped residents
      // (SampleHouse/Duplex/SampleCastle/HHS/Clinic/Hospital/Garage/Terminal) — 23 distinct classes,
      // every one of which web-ifc's vendored build can create. Counts across the fleet, for scale:
      //   IfcPlate 36,427 · IfcMember 9,534 · IfcWallStandardCase 3,105 · IfcBuildingElementProxy 2,404
      //   IfcCovering 2,256 · IfcDoor 1,193 · IfcWall 1,163 · IfcSlab 1,121 · IfcWindow 740 · IfcColumn 489
      //   IfcFurniture 391 · IfcBuildingElementPart 277 · IfcCurtainWall 263 · IfcRailing 244 · IfcBeam 203
      //   IfcFurnishingElement 179 · IfcFlowTerminal 102 · IfcStair 74 · IfcStairFlight 40 · IfcRoof 28
      //   IfcFooting 24 · IfcController 6 · IfcRampFlight 1
      // Mapping the class the SOURCE declares is the PRIME RULE (extract, never invent) — proxying a real
      // IfcStair would be throwing away information the DB already holds. Anything genuinely absent from
      // this list still falls to IfcBuildingElementProxy, counted in §IFC-SEED's proxyTyped so a new class
      // arriving in a future building is visible rather than silent.
      const _CLASS_MAP = {
        IfcWall: 'IFCWALL', IfcWallStandardCase: 'IFCWALL', IfcSlab: 'IFCSLAB', IfcDoor: 'IFCDOOR',
        IfcWindow: 'IFCWINDOW', IfcColumn: 'IFCCOLUMN', IfcBeam: 'IFCBEAM', IfcCovering: 'IFCCOVERING',
        IfcRailing: 'IFCRAILING', IfcFurnishingElement: 'IFCFURNISHINGELEMENT', IfcFurniture: 'IFCFURNISHINGELEMENT',
        IfcStairFlight: 'IFCSTAIRFLIGHT', IfcRampFlight: 'IFCRAMPFLIGHT', IfcRoof: 'IFCROOF',
        IfcPlate: 'IFCPLATE', IfcMember: 'IFCMEMBER', IfcBuildingElementProxy: 'IFCBUILDINGELEMENTPROXY',
        IfcBuildingElementPart: 'IFCBUILDINGELEMENTPART', IfcCurtainWall: 'IFCCURTAINWALL',
        IfcFlowTerminal: 'IFCFLOWTERMINAL', IfcStair: 'IFCSTAIR', IfcFooting: 'IFCFOOTING',
        IfcController: 'IFCCONTROLLER', IfcFan: 'IFCFAN'
      };
      let seedTyped = 0, seeded = 0, seedAnchors = 0, seedNoMesh = 0, seedProxy = 0, seedTris = 0;
      const seedByClass = {};

      // One IfcTriangulatedFaceSet from a mesh's WORLD-space position/index buffers (IFC4 native
      // triangle form — no tessellation, no approximation, no box standing in for authored geometry).
      const triFaceSet = (mesh) => {
        const pos = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
        if (!pos || !pos.count) return null;
        const coords = [];
        for (let i = 0; i < pos.count; i++) coords.push([len(pos.getX(i)), len(pos.getY(i)), len(pos.getZ(i))]);
        const ptList = api.CreateIfcEntity(mID, T.IFCCARTESIANPOINTLIST3D, coords, null);
        const idx = mesh.geometry.index;
        const tris = [];
        if (idx) { for (let i = 0; i + 2 < idx.count; i += 3) tris.push([pos1(idx.getX(i) + 1), pos1(idx.getX(i + 1) + 1), pos1(idx.getX(i + 2) + 1)]); }
        else { for (let i = 0; i + 2 < pos.count; i += 3) tris.push([pos1(i + 1), pos1(i + 2), pos1(i + 3)]); }
        if (!tris.length) return null;
        seedTris += tris.length;
        return api.CreateIfcEntity(mID, T.IFCTRIANGULATEDFACESET, ptList, null, null, tris, null);
      };

      const matProducts = {};
      for (const op of ops) {
        _curOp = op;
        if (op.op_type === 'GEOM_INSERT') {
          const P = op.parameters;
          // §ANCHOR — void-consumed hosts are invisible ride anchors. The user's binding condition is
          // that they stay out of EVERY count, pick and audit; an export IS an audit. Duplex has 0 of
          // these, SampleCastle has 65, so this is load-bearing, not theoretical.
          if (P.anchorOnly) { seedAnchors++; continue; }
          const fid = op.outputGuid != null && _fidByGuid[op.outputGuid] != null ? _fidByGuid[op.outputGuid] : op.id;
          const mesh = _meshByFid.get(fid);
          if (!mesh) { seedNoMesh++; continue; }   // NO SILENT BOX — counted and named in §IFC-SEED below
          const fs = triFaceSet(mesh);
          if (!fs) { seedNoMesh++; continue; }
          const cls = P.ifc_class || 'IfcBuildingElementProxy';
          const ent = _CLASS_MAP[cls] || 'IFCBUILDINGELEMENTPROXY';
          if (!_CLASS_MAP[cls]) seedProxy++;
          seedByClass[cls] = (seedByClass[cls] || 0) + 1;
          const rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('Tessellation'), [fs]);
          // §L7.4 typing for 4D/5D: the importer's per-body IFC typing (provenance.ifc) travels into the file: Name + ObjectType = the drawing's type label, PredefinedType from the IFC4 enum
          const tp = P.provenance && P.provenance.ifc && P.provenance.ifc.ifc_class === cls ? P.provenance.ifc : null, PDE = { IFCCOLUMN: 'IfcColumnTypeEnum', IFCBEAM: 'IfcBeamTypeEnum', IFCFOOTING: 'IfcFootingTypeEnum', IFCMEMBER: 'IfcMemberTypeEnum', IFCPLATE: 'IfcPlateTypeEnum', IFCROOF: 'IfcRoofTypeEnum', IFCWALL: 'IfcWallTypeEnum', IFCSLAB: 'IfcSlabTypeEnum', IFCFAN: 'IfcFanTypeEnum' };
          const pdx = tp && tp.PredefinedType && PDE[ent] ? [enumOf(PDE[ent], tp.PredefinedType)] : null;
          const prodE = productFromRep(rep, T[ent], (tp && tp.type_name) || ((P.ifc_class || 'Element') + ' ' + op.id), gn++, pdx, tp && tp.type_name);
          if (tp) seedTyped++;
          if (tp && tp.material) (matProducts[tp.material] = matProducts[tp.material] || []).push(prodE);   // §L13.3 material dress
          seeded++;
          continue;
        }
        if (op.op_type === 'GEOM_EXTRUDE_POLY') {
          const pts = op.parameters.profile.points, depth = op.parameters.depth;
          if (!pts) continue;   // HONEST SCOPE: circle profile (profile.circle) → IfcCircleProfileDef export is a scoped follow-up; arc/sector profile (profile.arc) IFC export likewise a follow-up (compound arc+line profile); skip, don't crash the export
          const cpts = pts.map(pt => api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(pt[0]), len(pt[1])]));
          cpts.push(cpts[0]);                                 // close the ring
          const poly = api.CreateIfcEntity(mID, T.IFCPOLYLINE, cpts);
          const prof = api.CreateIfcEntity(mID, T.IFCARBITRARYCLOSEDPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Wall'), poly);
          const solid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, prof, place3([0, 0, 0]), z3(), plm(depth));
          const wall = product(solid, T.IFCWALL, 'Wall ' + op.id, gn++);
          wallByFeature.set(op.id, wall); walls++;
          if (!firstWall) firstWall = { points: pts, depth };
        } else if (op.op_type === 'GEOM_CUT') {
          // §CUT-MOVE/§CUT-RESIZE: the IfcOpeningElement is the SAME net-overridden void the worker subtracts — an
          // active GEOM_CUT_MOVE/GEOM_CUT_RESIZE on this cut moves/resizes the exported void too; the signed
          // GEOM_CUT row is never rewritten.
          const _cmOv = _cutMoves ? _cutMoves.byCut[String(op.id)] : null;
          const { c1, c2 } = _cmOv ? window.CutMove.applyOverrides(op.parameters.void, _cmOv) : op.parameters.void;
          const dx = Math.abs(c2[0] - c1[0]), dy = Math.abs(c2[1] - c1[1]), dz = Math.abs(c2[2] - c1[2]);
          const cx = (c1[0] + c2[0]) / 2, cy = (c1[1] + c2[1]) / 2, z0 = Math.min(c1[2], c2[2]);
          const rectPlace = api.CreateIfcEntity(mID, T.IFCAXIS2PLACEMENT2D, api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(0), len(0)]), null);
          const rect = api.CreateIfcEntity(mID, T.IFCRECTANGLEPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Void'), rectPlace, plm(dx || 1e-3), plm(dy || 1e-3));
          const voidSolid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, rect, place3([cx, cy, z0]), z3(), plm(dz || 1e-3));
          const opening = product(voidSolid, T.IFCOPENINGELEMENT, 'Opening ' + op.id, gn++, [null, null]);
          openings++;
          const wall = wallByFeature.get(op.parent);
          if (wall) {
            const rel = api.CreateIfcEntity(mID, T.IFCRELVOIDSELEMENT, api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn++)),
              null, null, null, new T.Handle(wall.expressID), new T.Handle(opening.expressID));
            api.WriteLine(mID, rel); rels++;
          }
        } else if (op.op_type === 'GEOM_ARRAY') {
          const parentOp = ops.find(o => o.id === op.parent);
          if (!parentOp || parentOp.op_type !== 'GEOM_EXTRUDE_POLY') continue;   // HONEST SCOPE: only the demoed leaf types export
          const P = op.parameters, pp = parentOp.parameters;
          const count = Math.max(1, P.count | 0);
          const deltas = _arrayDeltas(P, count);
          const v0 = P.formula ? _getPath(pp, P.paramPath) : null;
          const pts = pp.profile.points;
          if (!pts) continue;   // HONEST SCOPE: array of a circle- or arc/sector-profile parent — same skip as the parent above
          const memberHandles = [];
          // No formula → every instance is geometrically IDENTICAL to the template → build the B-rep
          // representation ONCE and reuse it via an IfcRepresentationMap + per-instance IfcMappedItem
          // (the standard IFC "block insert" pattern) instead of duplicating N identical solids.
          let repMap = null;
          if (!P.formula) {
            const cpts = pts.map(pt => api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(pt[0]), len(pt[1])]));
            cpts.push(cpts[0]);
            const poly = api.CreateIfcEntity(mID, T.IFCPOLYLINE, cpts);
            const prof = api.CreateIfcEntity(mID, T.IFCARBITRARYCLOSEDPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Member'), poly);
            const solid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, prof, place3([0, 0, 0]), z3(), plm(pp.depth));
            const baseRep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('SweptSolid'), [solid]);
            repMap = api.CreateIfcEntity(mID, T.IFCREPRESENTATIONMAP, place3([0, 0, 0]), baseRep);
          }
          for (let i = 0; i < count; i++) {
            const d = deltas[i];
            let rep;
            if (repMap) {
              // pure translation: Axis1/Axis2/Axis3=null (identity rotation), Scale=null (1.0)
              const xform = api.CreateIfcEntity(mID, T.IFCCARTESIANTRANSFORMATIONOPERATOR3D, null, null,
                api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(d.dx), len(d.dy), len(d.dz)]), null, null);
              const mapped = api.CreateIfcEntity(mID, T.IFCMAPPEDITEM, repMap, xform);
              rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('MappedRepresentation'), [mapped]);
            } else {
              const depth = _evalFormula(P.formula, { i, n: count, v0 });
              const cpts = pts.map(pt => api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(pt[0]), len(pt[1])]));
              cpts.push(cpts[0]);
              const poly = api.CreateIfcEntity(mID, T.IFCPOLYLINE, cpts);
              const prof = api.CreateIfcEntity(mID, T.IFCARBITRARYCLOSEDPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Member'), poly);
              const solid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, prof, place3([d.dx, d.dy, d.dz]), z3(), plm(depth));
              rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('SweptSolid'), [solid]);
            }
            // IfcMember: base8 (GlobalId..Tag) + PredefinedType = 9 args
            const member = productFromRep(rep, T.IFCMEMBER, 'Array ' + op.id + ' #' + i, gn++, [T.IFC4.IfcMemberTypeEnum.MULLION]);
            memberHandles.push(member); arrayMembers++;
          }
          // ONE shared IfcMemberType + IfcRelDefinesByType — the real IFC TYPING relationship (not
          // aggregation) expressing "these N instances came from the same array template" (see file header).
          const typeGuid = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn++));
          const memberType = api.CreateIfcEntity(mID, T.IFCMEMBERTYPE, typeGuid, null, label('Array ' + op.id + ' Type'), null, null, null, null, null,
            T.IFC4.IfcMemberTypeEnum.MULLION);
          api.WriteLine(mID, memberType);
          const relGuid = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn++));
          const relType = api.CreateIfcEntity(mID, T.IFCRELDEFINESBYTYPE, relGuid, null, null, null,
            memberHandles.map(m => new T.Handle(m.expressID)), new T.Handle(memberType.expressID));
          api.WriteLine(mID, relType);
          arrays++;
          if (!firstArray) firstArray = { count, memberCount: memberHandles.length, sharedGeometry: !!repMap };
        }
      }

      // §IFC-SPATIAL: aggregation + containment, then one log line with the counts (read it).
      const rel = (type, a, b) => api.WriteLine(mID, api.CreateIfcEntity(mID, type, spatialGid(500000 + (gn++)), null, null, null, a, b));
      rel(T.IFCRELAGGREGATES, project, [site]);
      rel(T.IFCRELAGGREGATES, site, [building]);
      const stList = [...storeys.values()].sort((a, b) => a.elev - b.elev);
      if (stList.length) rel(T.IFCRELAGGREGATES, building, stList.map(s => s.e));
      for (const st of stList) if (st.products.length) rel(T.IFCRELCONTAINEDINSPATIALSTRUCTURE, st.products, st.e);
      if (buildingProducts.length) rel(T.IFCRELCONTAINEDINSPATIALSTRUCTURE, buildingProducts, building);
      Object.keys(matProducts).sort().forEach(name => { const mat = api.CreateIfcEntity(mID, T.IFCMATERIAL, label(name), null, null); api.WriteLine(mID, mat); rel(T.IFCRELASSOCIATESMATERIAL, matProducts[name], mat); });
      if (Object.keys(matProducts).length) console.log(TAG + ' §IFC-MATERIAL ' + JSON.stringify(Object.keys(matProducts).sort().map(n => [n, matProducts[n].length])));
      console.log(TAG + ' §IFC-SPATIAL storeys=' + stList.length + ' ' + JSON.stringify(stList.map(s => [s.e.Name && s.e.Name.value, s.elev, s.products.length])) +
        ' inBuilding=' + buildingProducts.length + ' contexts=1');
      const bytes = api.SaveModel(mID);
      api.CloseModel(mID);
      console.log(TAG + ' build walls=' + walls + ' openings=' + openings + ' rels=' + rels + ' arrays=' + arrays + ' arrayMembers=' + arrayMembers + ' bytes=' + bytes.length);
      // §IFC-SEED — the seeded half, with its refusals NAMED. seedNoMesh > 0 means real elements were
      // left out rather than exported as a fake box; that is deliberate (§PRIME LESSON) and must stay loud.
      console.log(TAG + ' §IFC-SEED seeded=' + seeded + ' tris=' + seedTris + ' anchorsExcluded=' + seedAnchors +
        ' noMeshSkipped=' + seedNoMesh + ' proxyTyped=' + seedProxy + ' typed=' + seedTyped + ' byClass=' + JSON.stringify(seedByClass));
      return { bytes, walls, openings, rels, arrays, arrayMembers, firstWall, firstArray,
               seeded, seedTris, seedAnchors, seedNoMesh, seedProxy, seedTyped, seedByClass };
    },

    // Build + trigger a browser download of the .ifc file.
    async exportModel(opts) {
      const r = await this.build();
      if (!opts || opts.download !== false) {
        try {
          const blob = new Blob([r.bytes], { type: 'application/x-step' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = (opts && opts.name) || 'bonsai_model.ifc'; document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        } catch (e) { console.warn(TAG + ' download failed ' + e); }
      }
      return r;
    },

    // Re-import exported bytes and read geometry back (used by the witness to prove the round-trip).
    async reimport(bytes) {
      const api = await this._init();
      const T = WebIFC;
      const id = api.OpenModel(bytes);
      const wallIds = api.GetLineIDsWithType(id, T.IFCWALL);
      const openIds = api.GetLineIDsWithType(id, T.IFCOPENINGELEMENT);
      const relIds = api.GetLineIDsWithType(id, T.IFCRELVOIDSELEMENT);
      const solidIds = api.GetLineIDsWithType(id, T.IFCEXTRUDEDAREASOLID);
      const memberIds = api.GetLineIDsWithType(id, T.IFCMEMBER);
      const memberTypeIds = api.GetLineIDsWithType(id, T.IFCMEMBERTYPE);
      const relTypeIds = api.GetLineIDsWithType(id, T.IFCRELDEFINESBYTYPE);
      const mappedItemIds = api.GetLineIDsWithType(id, T.IFCMAPPEDITEM);
      const repMapIds = api.GetLineIDsWithType(id, T.IFCREPRESENTATIONMAP);
      // read back the FIRST member's extruded depth (proves a formula-varied instance round-trips exact)
      let memberDepths = [];
      for (let i = 0; i < memberIds.size(); i++) {
        const m = api.GetLine(id, memberIds.get(i), true);
        const rep = m.Representation && m.Representation.Representations && m.Representation.Representations[0];
        const solid = rep && rep.Items && rep.Items[0];
        if (solid && solid.Depth != null) memberDepths.push(Number(solid.Depth.value));
      }
      // read the WALL solid's profile polygon + extrude depth back — find the extruded solid whose
      // SweptArea is an arbitrary-closed profile (the wall), NOT the rectangle void prism.
      let firstProfile = null, firstDepth = null;
      for (let i = 0; i < solidIds.size(); i++) {
        const s = api.GetLine(id, solidIds.get(i), true);
        const sa = s.SweptArea;
        if (sa && sa.OuterCurve) {
          firstProfile = (sa.OuterCurve.Points || []).map(pt => pt.Coordinates.map(c => Number(c.value !== undefined ? c.value : c)));
          firstDepth = Number(s.Depth.value);
          break;
        }
      }
      // §IFC-SPATIAL read-back: the spatial tree and how many products are contained
      const nOf = t => api.GetLineIDsWithType(id, t).size();
      const cIds = api.GetLineIDsWithType(id, T.IFCRELCONTAINEDINSPATIALSTRUCTURE);
      let contained = 0; for (let i = 0; i < cIds.size(); i++) { const r = api.GetLine(id, cIds.get(i)); contained += (r.RelatedElements || []).length; }
      const spatial = { projects: nOf(T.IFCPROJECT), sites: nOf(T.IFCSITE), buildings: nOf(T.IFCBUILDING), storeys: nOf(T.IFCBUILDINGSTOREY),
        aggregates: nOf(T.IFCRELAGGREGATES), containRels: cIds.size(), contained };
      console.log(TAG + ' §IFC-SPATIAL reimport ' + JSON.stringify(spatial));
      // §DXF-CONVERT C2 (DXF2BIM lane L3): products read back BY CLASS, so a converted model's walls/slabs/roof/doors/windows
      // can be compared with what was committed (additive read-back; nothing written changes).
      const byClass = { IfcWall: nOf(T.IFCWALL), IfcSlab: nOf(T.IFCSLAB), IfcRoof: nOf(T.IFCROOF), IfcDoor: nOf(T.IFCDOOR), IfcWindow: nOf(T.IFCWINDOW),
        IfcOpeningElement: nOf(T.IFCOPENINGELEMENT), IfcBuildingElementProxy: nOf(T.IFCBUILDINGELEMENTPROXY) };
      console.log(TAG + ' reimport byClass ' + JSON.stringify(byClass));
      const out = { walls: wallIds.size(), openings: openIds.size(), rels: relIds.size(), solids: solidIds.size(), firstProfile, firstDepth,
        members: memberIds.size(), memberTypes: memberTypeIds.size(), relTypes: relTypeIds.size(), memberDepths,
        mappedItems: mappedItemIds.size(), repMaps: repMapIds.size(), spatial, byClass };
      api.CloseModel(id);
      console.log(TAG + ' reimport walls=' + out.walls + ' openings=' + out.openings + ' rels=' + out.rels + ' solids=' + out.solids +
        ' members=' + out.members + ' memberTypes=' + out.memberTypes + ' relTypes=' + out.relTypes + ' mappedItems=' + out.mappedItems + ' repMaps=' + out.repMaps);
      return out;
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.ifc = Ifc;
  console.log(TAG + ' module loaded');
})();
