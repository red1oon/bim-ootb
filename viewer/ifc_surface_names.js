/**
 * BIM OOTB — Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ifc_surface_names.js — §IFC_SURFACE_NAMES (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §IFC_SURFACE_NAMES).
// Extracts the AUTHORED finish names the IFC already carries, which the import used to drop:
//   - styleOfItem: IfcStyledItem.Item (a representation item) -> IfcSurfaceStyle.Name (2x3: via IfcPresentationStyleAssignment)
//   - materialOfElement: IfcRelAssociatesMaterial -> IfcMaterial.Name | layer-set / list / constituent names joined ' | '
// Per element, per placed geometry (web-ifc PlacedGeometry.geometryExpressID == IfcStyledItem.Item, measured on Clinic doors 17/17):
// a part {style, rgba, tris}. material_name = the associated material name, else the style covering the most triangles, else null.
// Nothing is invented: a name is only ever copied from the file. One module, two callers: import_worker.js (user IFC load) and
// scripts/ifc_surface_patch.js (node, shipped buildings -> buildings/patches/<db>.sql).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IfcSurfaceNames = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function val(v) { return v && typeof v === 'object' && 'value' in v ? v.value : v; }
  function line(api, m, ref) { var id = val(ref); if (id == null || typeof id !== 'number') return null; try { return api.GetLine(m, id); } catch (e) { return null; } }
  function ids(api, m, type) { var out = []; if (type == null) return out; var v = api.GetLineIDsWithType(m, type); for (var i = 0; i < v.size(); i++) out.push(v.get(i)); return out; }

  // W = the web-ifc namespace (WebIFC in the worker, require('web-ifc') in node)
  function build(api, W, m) {
    var ctx = { styleOfItem: {}, materialOfElement: {}, parts: {}, styledItems: 0, styledNamed: 0, rels: 0 };
    var styleName = function (o, depth) {
      if (!o || depth > 3) return null;
      if (o.type === W.IFCSURFACESTYLE) return val(o.Name) || null;
      var ss = o.Styles || [];   // IfcPresentationStyleAssignment (2x3) / nested select
      for (var i = 0; i < ss.length; i++) { var n = styleName(line(api, m, ss[i]), depth + 1); if (n) return n; }
      return null;
    };
    ids(api, m, W.IFCSTYLEDITEM).forEach(function (id) {
      var s = null; try { s = api.GetLine(m, id); } catch (e) { return; }
      ctx.styledItems++; if (!s || !s.Item) return;
      var n = null, st = s.Styles || [];
      for (var i = 0; i < st.length && !n; i++) n = styleName(line(api, m, st[i]), 0);
      if (n) { ctx.styleOfItem[val(s.Item)] = n; ctx.styledNamed++; }
    });
    var matName = function (o) {
      if (!o) return null;
      if (o.type === W.IFCMATERIAL) return val(o.Name) || null;
      if (o.type === W.IFCMATERIALLAYERSETUSAGE) return matName(line(api, m, o.ForLayerSet));
      if (o.type === W.IFCMATERIALLAYERSET) return joinAll((o.MaterialLayers || []).map(function (l) { var L = line(api, m, l); return L ? matName(line(api, m, L.Material)) : null; }));
      if (o.type === W.IFCMATERIALLAYER) return matName(line(api, m, o.Material));
      if (o.type === W.IFCMATERIALLIST) return join((o.Materials || []).map(function (x) { return matName(line(api, m, x)); }));
      if (W.IFCMATERIALCONSTITUENTSET != null && o.type === W.IFCMATERIALCONSTITUENTSET) return join((o.MaterialConstituents || []).map(function (c) { var C = line(api, m, c); return C ? matName(line(api, m, C.Material)) : null; }));
      if (W.IFCMATERIALPROFILESETUSAGE != null && o.type === W.IFCMATERIALPROFILESETUSAGE) return matName(line(api, m, o.ForProfileSet));
      if (W.IFCMATERIALPROFILESET != null && o.type === W.IFCMATERIALPROFILESET) return join((o.MaterialProfiles || []).map(function (p) { var P = line(api, m, p); return P ? matName(line(api, m, P.Material)) : null; }));
      return null;
    };
    // layer sets keep EVERY layer in order (no de-dup): the first and last layers are the two visible faces
    function joinAll(a) { var u = a.filter(function (x) { return !!x; }); return u.length ? u.join(' | ') : null; }
    function join(a) { var u = []; a.forEach(function (x) { if (x && u.indexOf(x) < 0) u.push(x); }); return u.length ? u.join(' | ') : null; }
    ids(api, m, W.IFCRELASSOCIATESMATERIAL).forEach(function (id) {
      var r = null; try { r = api.GetLine(m, id); } catch (e) { return; }
      if (!r) return; ctx.rels++;
      var n = matName(line(api, m, r.RelatingMaterial)); if (!n) return;
      (r.RelatedObjects || []).forEach(function (o) { var oid = val(o); if (ctx.materialOfElement[oid] == null) ctx.materialOfElement[oid] = n; });
    });
    return ctx;
  }

  // one placed geometry of element expressID; color = web-ifc {x,y,z,w}; tris = index count / 3
  function addPart(ctx, expressID, geometryExpressID, color, tris) {
    var p = ctx.parts[expressID] || (ctx.parts[expressID] = []);
    p.push({ style: ctx.styleOfItem[geometryExpressID] || null,
      rgba: color && color.x !== undefined ? [color.x, color.y, color.z, color.w].map(function (v) { return (+v).toFixed(3); }).join(',') : null,
      tris: tris | 0 });
  }

  // element {expressID} -> {matName, parts}; matName = dominant style by triangles, else associated material, else null
  function resolve(ctx, expressID) {
    var parts = ctx.parts[expressID] || [], by = {}, best = null, bn = -1;
    parts.forEach(function (p) { if (p.style) by[p.style] = (by[p.style] || 0) + Math.max(1, p.tris); });
    for (var k in by) if (by[k] > bn) { bn = by[k]; best = k; }
    var mat = ctx.materialOfElement[expressID] || null;
    // material_name keeps its IFC meaning (the associated IfcMaterial); the surface style is the fallback when none is associated
    // (MEASURED Clinic: 1,062 walls style 'Default Wall' but material 'Plasterboard | Metal - Stud Layer'; the per-part styles stay in parts)
    return { matName: mat || best, style: best, material: mat, parts: parts };
  }

  function statsLine(ctx, elements) {
    var n = 0, ws = 0, wm = 0, np = 0, none = 0;
    elements.forEach(function (el) { var r = resolve(ctx, el.expressID); n++; np += r.parts.length; if (r.style) ws++; if (r.material) wm++; if (!r.matName) none++; });
    var verdict = ctx.styledItems === 0 && ctx.rels === 0 ? 'INCONCLUSIVE (file carries no IfcStyledItem and no IfcRelAssociatesMaterial)' : 'ok';
    return '§IFC_SURFACE_NAMES elements=' + n + ' withStyle=' + ws + ' withMaterial=' + wm + ' unnamed=' + none + ' parts=' + np +
      ' styledItems=' + ctx.styledItems + ' styledNamed=' + ctx.styledNamed + ' materialRels=' + ctx.rels + ' ' + verdict;
  }

  return { build: build, addPart: addPart, resolve: resolve, statsLine: statsLine };
});
