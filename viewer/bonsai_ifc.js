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

      const product = (solid, type, name, gn, extra) => {     // shape shell -> IfcWall / IfcOpeningElement
        const rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, null, label('Body'), label('SweptSolid'), [solid]);
        const pds = api.CreateIfcEntity(mID, T.IFCPRODUCTDEFINITIONSHAPE, null, null, [rep]);
        const g = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn));
        const args = [g, null, label(name), null, null, null, pds, null];
        if (extra) args.push(...extra);                       // IfcOpeningElement adds Tag + PredefinedType
        const e = api.CreateIfcEntity(mID, type, ...args);
        api.WriteLine(mID, e);
        return e;
      };

      const wallByFeature = new Map();
      let walls = 0, openings = 0, rels = 0, gn = 0;
      let firstWall = null;

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
        }
      }

      const bytes = api.SaveModel(mID);
      api.CloseModel(mID);
      console.log(TAG + ' build walls=' + walls + ' openings=' + openings + ' rels=' + rels + ' bytes=' + bytes.length);
      return { bytes, walls, openings, rels, firstWall };
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
      const out = { walls: wallIds.size(), openings: openIds.size(), rels: relIds.size(), solids: solidIds.size(), firstProfile, firstDepth };
      api.CloseModel(id);
      console.log(TAG + ' reimport walls=' + out.walls + ' openings=' + out.openings + ' rels=' + out.rels + ' solids=' + out.solids);
      return out;
    }
  };

  window.Bonsai = window.Bonsai || {};
  window.Bonsai.ifc = Ifc;
  console.log(TAG + ' module loaded');
})();
