// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2ifc.js — IFC4 writer for the typed BODIES the structure chain produces (lane §L8): no window, no scene; web-ifc is INJECTED (Node: require('web-ifc'); browser: WebIFC global),
// exactly like ifc_extract_core.js. It mirrors the seeded-product path of bonsai_ifc.js (IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey, products contained, each body an
// IfcTriangulatedFaceSet shape, Name + ObjectType = the drawing's type label, PredefinedType from the IFC4 enum) so the CLI and the page give the same file (witnessed: W-CLI-IFC).
//   build(elements, { api, WebIFC, name }) -> { bytes, seeded, typed, byClass, proxyTyped, storeys }
//   element = { class: 'IfcColumn', name, objectType, predefined, storey, storey_elev, vertices: [[x,y,z]...] (world, metres), faces: [[a,b,c]...] (0-based) }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Ifc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GUID_AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$';
  function guid(n) {   // deterministic 22-char IfcGloballyUniqueId, unique per n (same construction as bonsai_ifc.js)
    let h = (n + 1) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    let s = GUID_AB[52 + ((h >>> 30) & 3)];
    for (let i = 1; i < 16; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; s += GUID_AB[h >>> 26]; }
    let m = n; const t = []; for (let i = 0; i < 6; i++) { t.unshift(GUID_AB[m % 64]); m = Math.floor(m / 64); }
    return s + t.join('');
  }
  const EVIDENCE_PSET = 'Dxf2Bim_Evidence';
  // §F1 (prompts/DXF2BIM_FOUNDATION_LANE.md): IfcDoor / IfcWindow carry five attributes after Tag (OverallHeight, OverallWidth, PredefinedType, OperationType | PartitioningType, UserDefined...). web-ifc fills missing ones with `*`
  // (the derived-attribute marker), which is invalid IFC4 (ifcopenshell.validate: 5 errors per door). Heights and widths come from the body's own bounding box (height = z extent, width = the larger plan extent: the leaf); an unknown or non-positive size is written as `$`, never invented; the type is the plain enum, the operation / partitioning NOTDEFINED (no hinge side or panel layout is read).
  function openingAttrs(ent, bb, H, predefined) {
    if (ent !== 'IFCDOOR' && ent !== 'IFCWINDOW') return null;
    const dz = bb ? bb.mx[2] - bb.mn[2] : 0, dp = bb ? Math.max(bb.mx[0] - bb.mn[0], bb.mx[1] - bb.mn[1]) : 0, pm = v => (v > 1e-6 ? H.api.CreateIfcType(H.mID, H.T.IFCPOSITIVELENGTHMEASURE, Number(v.toFixed(6))) : null);
    return ent === 'IFCDOOR' ? [pm(dz), pm(dp), H.enumOf('IfcDoorTypeEnum', predefined || 'DOOR'), H.enumOf('IfcDoorTypeOperationEnum', 'NOTDEFINED'), null]
                             : [pm(dz), pm(dp), H.enumOf('IfcWindowTypeEnum', predefined || 'WINDOW'), H.enumOf('IfcWindowTypePartitioningEnum', 'NOTDEFINED'), null];
  }
  // bounding box of a flat [x,y,z] vertex list or of three.js position data
  function bboxOf(verts) { if (!verts || !verts.length) return null; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const v of verts) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } return { mn, mx }; }
  // §F1 the STEP header web-ifc writes has `($)` author and organisation lists and a `$` authorisation: FILE_NAME requires strings there. Only the header text is touched.
  function fixHeader(bytes) {
    const n = Math.min(bytes.length, 1500); let h = ''; for (let i = 0; i < n; i++) h += String.fromCharCode(bytes[i]);
    const h2 = h.replace(/(FILE_NAME\('[^']*','[^']*',)\(\$\),\(\$\),('[^']*','[^']*',)\$\)/, "$1(''),(''),$2'')");
    if (h2 === h) return bytes;
    const out = new Uint8Array(bytes.length - n + h2.length); for (let i = 0; i < h2.length; i++) out[i] = h2.charCodeAt(i); out.set(bytes.subarray(n), h2.length); return out;
  }
  const CLASS_MAP = { IfcWall: 'IFCWALL', IfcSlab: 'IFCSLAB', IfcColumn: 'IFCCOLUMN', IfcBeam: 'IFCBEAM', IfcRoof: 'IFCROOF', IfcPlate: 'IFCPLATE', IfcMember: 'IFCMEMBER',
    IfcFooting: 'IFCFOOTING', IfcFan: 'IFCFAN', IfcCovering: 'IFCCOVERING', IfcBuildingElementProxy: 'IFCBUILDINGELEMENTPROXY', IfcDoor: 'IFCDOOR', IfcWindow: 'IFCWINDOW' };
  const PD_ENUM = { IFCCOLUMN: 'IfcColumnTypeEnum', IFCBEAM: 'IfcBeamTypeEnum', IFCFOOTING: 'IfcFootingTypeEnum', IFCMEMBER: 'IfcMemberTypeEnum', IFCPLATE: 'IfcPlateTypeEnum', IFCROOF: 'IfcRoofTypeEnum', IFCWALL: 'IfcWallTypeEnum', IFCSLAB: 'IfcSlabTypeEnum', IFCFAN: 'IfcFanTypeEnum', IFCCOVERING: 'IfcCoveringTypeEnum' };

  // §L26 appearance + per-mesh metadata. ctx = { api, T (web-ifc), mID, enumOf, label, gid(n) -> IfcGloballyUniqueId }. style(fs, [r,g,b]) = one shared IfcSurfaceStyle per colour, applied by an IfcStyledItem
  // on the product's tessellated item (the way every IFC reader takes a colour); pset(product, props) = one IfcPropertySet 'Dxf2Bim_Evidence' (the `Pset_` prefix is reserved for buildingSMART-defined sets) of IfcText values + the IfcRelDefinesByProperties.
  function appearance(c) {
    const api = c.api, T = c.T, mID = c.mID, ratio = v => api.CreateIfcType(mID, T.IFCNORMALISEDRATIOMEASURE, v), cache = {}; let n = 0;
    function style(item, rgb) {
      if (!rgb) return false;
      const key = rgb.join(',');
      if (!cache[key]) {
        const col = api.CreateIfcEntity(mID, T.IFCCOLOURRGB, null, ratio(rgb[0]), ratio(rgb[1]), ratio(rgb[2]));
        const rend = api.CreateIfcEntity(mID, T.IFCSURFACESTYLERENDERING, col, null, null, null, null, null, null, null, c.enumOf('IfcReflectanceMethodEnum', 'NOTDEFINED'));
        cache[key] = api.CreateIfcEntity(mID, T.IFCSURFACESTYLE, c.label('colour ' + key), c.enumOf('IfcSurfaceSide', 'BOTH'), [rend]);
      }
      api.WriteLine(mID, api.CreateIfcEntity(mID, T.IFCSTYLEDITEM, item, [cache[key]], null)); return true;
    }
    function pset(prod, props) {
      const names = written(props); if (!names.length) return false;
      const hp = names.map(k => api.CreateIfcEntity(mID, T.IFCPROPERTYSINGLEVALUE, c.label(k), null, api.CreateIfcType(mID, T.IFCTEXT, String(props[k])), null));
      const ps = api.CreateIfcEntity(mID, T.IFCPROPERTYSET, c.gid(3000000 + 2 * n), null, c.label(EVIDENCE_PSET), null, hp); api.WriteLine(mID, ps);
      api.WriteLine(mID, api.CreateIfcEntity(mID, T.IFCRELDEFINESBYPROPERTIES, c.gid(3000000 + 2 * n + 1), null, null, null, [prod], ps)); n++; return true;
    }
    return { style: style, pset: pset, styles: () => Object.keys(cache).length, psets: () => n };
  }

  // T13.5 (prompts/STRUCTURAL_SANITY.md): the STATED building type goes on the IfcBuilding as the IFC4 standard property Pset_BuildingCommon.OccupancyType, so the rule panel can read it back
  // (extractor -> project_metadata building_type). Nothing is written when no type is stated: a missing property means "not stated", never a guessed "General".
  function buildingType(c, building, type) {
    type = type == null ? '' : String(type).trim(); if (!type) return false;
    const api = c.api, T = c.T, mID = c.mID;
    const hp = [api.CreateIfcEntity(mID, T.IFCPROPERTYSINGLEVALUE, c.label('OccupancyType'), null, c.label(type), null)];
    const ps = api.CreateIfcEntity(mID, T.IFCPROPERTYSET, c.gid(3999000), null, c.label('Pset_BuildingCommon'), null, hp); api.WriteLine(mID, ps);
    api.WriteLine(mID, api.CreateIfcEntity(mID, T.IFCRELDEFINESBYPROPERTIES, c.gid(3999001), null, null, null, [building], ps)); return true;
  }

  function build(elements, o) {
    const api = o.api, T = o.WebIFC;
    const mID = api.CreateModel({ schema: 'IFC4', name: o.name || 'dxf2bim.ifc' });
    const len = v => api.CreateIfcType(mID, T.IFCLENGTHMEASURE, v), real = v => api.CreateIfcType(mID, T.IFCREAL, v), label = v => api.CreateIfcType(mID, T.IFCLABEL, v), pos1 = v => api.CreateIfcType(mID, T.IFCPOSITIVEINTEGER, v);
    const z3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(0), real(0), real(1)]), x3 = () => api.CreateIfcEntity(mID, T.IFCDIRECTION, [real(1), real(0), real(0)]);
    const place3 = p => api.CreateIfcEntity(mID, T.IFCAXIS2PLACEMENT3D, api.CreateIfcEntity(mID, T.IFCCARTESIANPOINT, [len(p[0]), len(p[1]), len(p[2])]), z3(), x3());
    const enumOf = (E, v) => (T.IFC4 && T.IFC4[E] && T.IFC4[E][v]) || { type: 3, value: v };
    const siUnit = (ut, nm) => api.CreateIfcEntity(mID, T.IFCSIUNIT, enumOf('IfcUnitEnum', ut), null, enumOf('IfcSIUnitName', nm));
    const units = api.CreateIfcEntity(mID, T.IFCUNITASSIGNMENT, [siUnit('LENGTHUNIT', 'METRE'), siUnit('AREAUNIT', 'SQUARE_METRE'), siUnit('VOLUMEUNIT', 'CUBIC_METRE'), siUnit('PLANEANGLEUNIT', 'RADIAN')]);
    const ctx = api.CreateIfcEntity(mID, T.IFCGEOMETRICREPRESENTATIONCONTEXT, null, label('Model'), api.CreateIfcType(mID, T.IFCDIMENSIONCOUNT, 3), real(1e-5), place3([0, 0, 0]), null);
    const spatialGid = k => api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(1000000 + k));
    const worldPl = api.CreateIfcEntity(mID, T.IFCLOCALPLACEMENT, null, place3([0, 0, 0]));
    const localPl = (rel, z) => api.CreateIfcEntity(mID, T.IFCLOCALPLACEMENT, rel, place3([0, 0, z || 0]));
    const project = api.CreateIfcEntity(mID, T.IFCPROJECT, spatialGid(0), null, label('Bonsai model'), null, null, null, null, [ctx], units);
    const sitePl = localPl(null, 0), bldPl = localPl(sitePl, 0);
    const site = api.CreateIfcEntity(mID, T.IFCSITE, spatialGid(1), null, label('Site'), null, null, sitePl, null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), null, null, null, null, null);
    const building = api.CreateIfcEntity(mID, T.IFCBUILDING, spatialGid(2), null, label('Building'), null, null, bldPl, null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), null, null, null);
    [project, site, building].forEach(e => api.WriteLine(mID, e));
    buildingType({ api, T, mID, label, gid: spatialGid }, building, o.buildingType);
    const storeys = new Map(), buildingProducts = [];
    const storeyFor = el => {
      if (el.storey == null || el.storey_elev == null || !isFinite(+el.storey_elev)) return null;
      if (!storeys.has(el.storey)) {
        const e = api.CreateIfcEntity(mID, T.IFCBUILDINGSTOREY, spatialGid(10 + storeys.size), null, label(String(el.storey)), null, null, localPl(bldPl, +el.storey_elev), null, null, enumOf('IfcElementCompositionEnum', 'ELEMENT'), len(+el.storey_elev));
        api.WriteLine(mID, e); storeys.set(el.storey, { e, elev: +el.storey_elev, products: [] });
      }
      return storeys.get(el.storey);
    };
    const AP = appearance({ api, T, mID, enumOf, label, gid: spatialGid}); let gn = 0, seeded = 0, typed = 0, proxy = 0, coloured = 0, withPset = 0; const byClass = {}, matProducts = {};
    elements.forEach(el => {
      const coords = el.vertices.map(v => [len(v[0]), len(v[1]), len(v[2])]);
      const ptList = api.CreateIfcEntity(mID, T.IFCCARTESIANPOINTLIST3D, coords, null);
      const tris = el.faces.map(f => [pos1(f[0] + 1), pos1(f[1] + 1), pos1(f[2] + 1)]);
      const fs = api.CreateIfcEntity(mID, T.IFCTRIANGULATEDFACESET, ptList, null, null, tris, null);
      const ent = CLASS_MAP[el.class] || 'IFCBUILDINGELEMENTPROXY'; if (!CLASS_MAP[el.class]) proxy++;
      byClass[el.class] = (byClass[el.class] || 0) + 1;
      const rep = api.CreateIfcEntity(mID, T.IFCSHAPEREPRESENTATION, ctx, label('Body'), label('Tessellation'), [fs]);
      const pds = api.CreateIfcEntity(mID, T.IFCPRODUCTDEFINITIONSHAPE, null, null, [rep]);
      const g = api.CreateIfcType(mID, T.IFCGLOBALLYUNIQUEID, guid(gn++));
      const args = [g, null, label(el.name || (el.class + ' ' + gn)), null, el.objectType ? label(el.objectType) : null, worldPl, pds, null];   // §F1: IfcProduct.WR1 (EXPRESS): a product with a Representation needs an ObjectPlacement; the geometry is in world coordinates, so the placement is the shared identity
      const oa = openingAttrs(ent, bboxOf(el.vertices ? el.vertices.map(v => [v[0], v[1], v[2]]) : null), { api, T, mID, enumOf }, el.predefined);
      if (oa) args.push(...oa); else if (el.predefined && PD_ENUM[ent]) args.push(enumOf(PD_ENUM[ent], el.predefined));
      const e = api.CreateIfcEntity(mID, T[ent], ...args); api.WriteLine(mID, e);
      if (AP.style(fs, el.colour)) coloured++; if (AP.pset(e, el.props)) withPset++;
      const st = storeyFor(el); (st ? st.products : buildingProducts).push(e);
      if (el.material) (matProducts[el.material] = matProducts[el.material] || []).push(e);
      if (el.name || el.objectType) typed++;
      seeded++;
    });
    const rel = (type, a, b) => api.WriteLine(mID, api.CreateIfcEntity(mID, type, spatialGid(500000 + (gn++)), null, null, null, a, b));
    rel(T.IFCRELAGGREGATES, project, [site]); rel(T.IFCRELAGGREGATES, site, [building]);
    const stList = [...storeys.values()].sort((a, b) => a.elev - b.elev);
    if (stList.length) rel(T.IFCRELAGGREGATES, building, stList.map(s => s.e));
    for (const st of stList) if (st.products.length) rel(T.IFCRELCONTAINEDINSPATIALSTRUCTURE, st.products, st.e);
    if (buildingProducts.length) rel(T.IFCRELCONTAINEDINSPATIALSTRUCTURE, buildingProducts, building);
    Object.keys(matProducts).sort().forEach(name => { const mat = api.CreateIfcEntity(mID, T.IFCMATERIAL, label(name), null, null); api.WriteLine(mID, mat); rel(T.IFCRELASSOCIATESMATERIAL, matProducts[name], mat); });
    const bytes = fixHeader(api.SaveModel(mID)); api.CloseModel(mID);
    return { bytes, seeded, typed, coloured, withPset, styles: AP.styles(), byClass, materials: Object.keys(matProducts).sort(), proxyTyped: proxy, storeys: stList.map(s => [s.e.Name && s.e.Name.value, s.elev, s.products.length]) };
  }

  // the pset's property names as the file carries them: an empty or null value is not written; sorted (U1: the Properties panel shows exactly these)
  function written(props) { return Object.keys(props || {}).filter(k => props[k] !== '' && props[k] != null).sort(); }
  // §D105: the evidence pset also carries what a downstream reader needs and the tessellation cannot say: the body's own guid (SourceGuid), its stated base / top (Z0, Z1) and each numeric size the body states
  // (Size_<key>, metres; the key's source stays in SizeBasis). A reader of the IFC never goes back to the drawing for them.
  const SIZE_KEYS = ['x', 'y', 'w', 'd', 't', 'slope_deg'];
  function evidence(e) {
    const p = e.ifc && e.ifc.props; if (!p) return null;
    const o = Object.assign({}, p); if (e.guid) o.SourceGuid = e.guid;
    if (isFinite(Number(e.z0)) && isFinite(Number(e.z1)) && e.z0 !== undefined && e.z1 !== undefined) { o.Z0 = String(Number(e.z0)); o.Z1 = String(Number(e.z1)); }   /* the body's stated base / top: a sloped prism's tessellation does not say them */
    SIZE_KEYS.forEach(k => { const v = e.size && e.size[k], n = v && typeof v === 'object' ? v.number : v; if (n !== undefined && n !== null && isFinite(Number(n))) o['Size_' + k] = String(Number(n)); });
    return o;
  }
  // the importer's `els` (Dxf2Bodies / toOps form) -> writer elements
  function fromEls(els, ST) {
    const elev = {}; (ST || []).forEach(s => { elev[s.name] = s.level; });
    return els.map((e, i) => ({ class: e.class, name: (e.ifc && e.ifc.type_name) || (e.class + ' ' + (i + 1)),   // unnamed: class + its 1-based order (the page's names are class + op id: the same when the set is the page's first convert)
      objectType: e.ifc && e.ifc.type_name || null, predefined: e.ifc && e.ifc.PredefinedType || null, material: e.ifc && e.ifc.material || null, colour: e.ifc && e.ifc.colour || null, props: evidence(e),
      storey: e.storey, storey_elev: elev[e.storey], vertices: e.vertices, faces: e.faces }));
  }
  return { build: build, buildingType: buildingType, fromEls: fromEls, guid: guid, appearance: appearance, openingAttrs: openingAttrs, bboxOf: bboxOf, fixHeader: fixHeader, EVIDENCE_PSET: EVIDENCE_PSET, written: written };
});
