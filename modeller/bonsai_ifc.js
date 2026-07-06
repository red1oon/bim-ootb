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
  function guid(n) {                          // deterministic 22-char IfcGloballyUniqueId (no Math.random)
    let s = '', x = (n + 1) * 2654435761 >>> 0;
    for (let i = 0; i < 22; i++) { s += GUID_AB[x % 64]; x = (x * 1103515245 + 12345) >>> 0; }
    return s;
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
      if (!ops.length) throw new Error('nothing authored to export');
      const mID = api.CreateModel({ schema: 'IFC4', name: 'bonsai_model.ifc' });
      const len = v => api.CreateIfcType(mID, T.IFCLENGTHMEASURE, v);
      const real = v => api.CreateIfcType(mID, T.IFCREAL, v);
      const plm = v => api.CreateIfcType(mID, T.IFCPOSITIVELENGTHMEASURE, v);
      const label = v => api.CreateIfcType(mID, T.IFCLABEL, v);
      const z3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(0), real(0), real(1)]);
      const x3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(1), real(0), real(0)]);
      const place3 = (o) => api.CreateIfcEntity(mID, T.IFCAXIS2PLACEMENT3D,
        api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(o[0]), len(o[1]), len(o[2])]), z3(), x3());

      const productFromRep = (rep, type, name, gn, extra) => {   // an already-built IfcShapeRepresentation -> a product
        const pds = api.CreateIfcEntity(mID, T.IFCPRODUCTDEFINITIONSHAPE, null, null, [rep]);
        const g = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn));
        const args = [g, null, label(name), null, null, null, pds, null];
        if (extra) args.push(...extra);                       // IfcOpeningElement adds Tag + PredefinedType
        const e = api.CreateIfcEntity(mID, type, ...args);
        api.WriteLine(mID, e);
        return e;
      };
      const product = (solid, type, name, gn, extra) => {     // shape shell -> IfcWall / IfcOpeningElement
        const rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, null, label('Body'), label('SweptSolid'), [solid]);
        return productFromRep(rep, type, name, gn, extra);
      };

      const wallByFeature = new Map();
      let walls = 0, openings = 0, rels = 0, gn = 0, arrays = 0, arrayMembers = 0;
      let firstWall = null, firstArray = null;

      for (const op of ops) {
        if (op.op_type === 'GEOM_EXTRUDE_POLY') {
          const pts = op.parameters.profile.points, depth = op.parameters.depth;
          const cpts = pts.map(pt => api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(pt[0]), len(pt[1])]));
          cpts.push(cpts[0]);                                 // close the ring
          const poly = api.CreateIfcEntity(mID, T.IFCPOLYLINE, cpts);
          const prof = api.CreateIfcEntity(mID, T.IFCARBITRARYCLOSEDPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Wall'), poly);
          const solid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, prof, place3([0, 0, 0]), z3(), plm(depth));
          const wall = product(solid, T.IFCWALL, 'Wall ' + op.id, gn++);
          wallByFeature.set(op.id, wall); walls++;
          if (!firstWall) firstWall = { points: pts, depth };
        } else if (op.op_type === 'GEOM_CUT') {
          const { c1, c2 } = op.parameters.void;
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
            const baseRep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, null, label('Body'), label('SweptSolid'), [solid]);
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
              rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, null, label('Body'), label('MappedRepresentation'), [mapped]);
            } else {
              const depth = _evalFormula(P.formula, { i, n: count, v0 });
              const cpts = pts.map(pt => api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(pt[0]), len(pt[1])]));
              cpts.push(cpts[0]);
              const poly = api.CreateIfcEntity(mID, T.IFCPOLYLINE, cpts);
              const prof = api.CreateIfcEntity(mID, T.IFCARBITRARYCLOSEDPROFILEDEF, T.IFC4.IfcProfileTypeEnum.AREA, label('Member'), poly);
              const solid = api.CreateIfcEntity(mID, T.IFCEXTRUDEDAREASOLID, prof, place3([d.dx, d.dy, d.dz]), z3(), plm(depth));
              rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, null, label('Body'), label('SweptSolid'), [solid]);
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

      const bytes = api.SaveModel(mID);
      api.CloseModel(mID);
      console.log(TAG + ' build walls=' + walls + ' openings=' + openings + ' rels=' + rels + ' arrays=' + arrays + ' arrayMembers=' + arrayMembers + ' bytes=' + bytes.length);
      return { bytes, walls, openings, rels, arrays, arrayMembers, firstWall, firstArray };
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
      const out = { walls: wallIds.size(), openings: openIds.size(), rels: relIds.size(), solids: solidIds.size(), firstProfile, firstDepth,
        members: memberIds.size(), memberTypes: memberTypeIds.size(), relTypes: relTypeIds.size(), memberDepths,
        mappedItems: mappedItemIds.size(), repMaps: repMapIds.size() };
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
