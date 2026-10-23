#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §D53 "your last job is your library" (prompts/DXF2BIM_FOUNDATION_LANE.md §D53). Read the §CATALOGUE lines after every run.
// A firm's own model (IFC) -> catalogue.json: wall thickness (mm) -> materials seen (layer set names + thickness) with counts; door leaf width (mm) -> types + heights with counts; slab thickness ->
// materials. The reader takes it as a best-effort default (the most frequent entry, the count stated); nothing in it is invented: every row is a count of what the model holds.
// usage: NODE_PATH=~/bim-compiler/node_modules node modeller/tools/catalogue_from_ifc.js <a.ifc> [<b.ifc> ...] -o <catalogue.json> [--name <firm or set name>] [--storeys <name,name>]
'use strict';
const fs = require('fs'), path = require('path');
const WebIFC = require(process.env.WEB_IFC || 'web-ifc');
// module: learn(files, {name, storeys}) -> { cat, byGuid: { <wall guid>: { material, t, storey } } } (byGuid: the per-wall truth a witness compares with)
async function learn(files, opt) {
  opt = opt || {}; const byGuid = {};
  const api = new WebIFC.IfcAPI(); await api.Init();
  const cat = { version: 1, about: 'Learned from a model (modeller/tools/catalogue_from_ifc.js, §D53): counts of what the model holds. The reader uses the most frequent entry per thickness / width as a best-effort default and states the count; edit or replace this file to change it.',
    name: opt.name || files.map(f => path.basename(f, '.ifc')).join('+'), source: files.map(f => path.basename(f)), storeys: opt.storeys, walls: {}, slabs: {}, doors: {} };
  const bump = (tab, k, entry, keyOf) => { const L = tab[k] = tab[k] || []; const id = keyOf(entry), h = L.find(x => keyOf(x) === id); if (h) h.n++; else L.push(Object.assign({ n: 1 }, entry)); };
  for (const f of files) {
    const m = api.OpenModel(new Uint8Array(fs.readFileSync(f))), L = id => api.GetLine(m, id, false), val = x => x && x.value !== undefined ? x.value : x;
    const unit = (() => { try { const u = api.GetLineIDsWithType(m, WebIFC.IFCSIUNIT); for (let i = 0; i < u.size(); i++) { const e = L(u.get(i)); if (val(e.UnitType) === 'LENGTHUNIT') return val(e.Prefix) === 'MILLI' ? 0.001 : 1; } } catch (e) { void e; } return 1; })();
    const storeyOf = {}; const rel = api.GetLineIDsWithType(m, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rel.size(); i++) { const r = L(rel.get(i)), s = L(val(r.RelatingStructure)); r.RelatedElements.forEach(o => { storeyOf[val(o)] = val(s.Name); }); }
    const matOf = {}, rm = api.GetLineIDsWithType(m, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < rm.size(); i++) { const r = L(rm.get(i)), mat = L(val(r.RelatingMaterial)); let layers = null;
      const ls = mat.ForLayerSet ? L(val(mat.ForLayerSet)) : mat.MaterialLayers ? mat : null;
      if (ls) layers = ls.MaterialLayers.map(x => L(val(x))).map(l => ({ material: val(L(val(l.Material)).Name) || '?', mm: Math.round(val(l.LayerThickness) * unit * 1000 * 10) / 10 }));
      else if (mat.Name) layers = [{ material: val(mat.Name), mm: null }];
      r.RelatedObjects.forEach(o => { matOf[val(o)] = layers; }); }
    const qOf = {}, rq = api.GetLineIDsWithType(m, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rq.size(); i++) { const r = L(rq.get(i)), pd = L(val(r.RelatingPropertyDefinition)); if (!pd.Quantities) continue; const q = {};
      pd.Quantities.forEach(x => { const e = L(val(x)); q[val(e.Name)] = val(e.LengthValue) ?? val(e.AreaValue) ?? val(e.VolumeValue); }); r.RelatedObjects.forEach(o => { qOf[val(o)] = Object.assign(qOf[val(o)] || {}, q); }); }
    const keep = id => !opt.storeys || opt.storeys.indexOf(storeyOf[id]) >= 0;
    for (const T of [WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE]) { const ids = api.GetLineIDsWithType(m, T); for (let i = 0; i < ids.size(); i++) { const id = ids.get(i); if (!keep(id)) continue;
      const lay = matOf[id], tq = qOf[id] && qOf[id].Width, t = lay && lay.every(l => l.mm !== null) ? lay.reduce((a, l) => a + l.mm, 0) : typeof tq === 'number' ? Math.round(tq * unit * 1000 * 10) / 10 : null; if (t === null) continue;
      const mat = lay ? lay.map(l => l.material).join(' + ') : null; byGuid[val(L(id).GlobalId)] = { material: mat, t: Math.round(t), storey: storeyOf[id] };
      bump(cat.walls, String(Math.round(t)), { material: mat, layers: lay, type: val(L(id).ObjectType) || null }, x => x.material + '|' + x.type); } }
    { const ids = api.GetLineIDsWithType(m, WebIFC.IFCSLAB); for (let i = 0; i < ids.size(); i++) { const id = ids.get(i); if (!keep(id)) continue; const lay = matOf[id], tq = qOf[id] && (qOf[id].Width || qOf[id].Depth);
      const t = lay && lay.every(l => l.mm !== null) ? lay.reduce((a, l) => a + l.mm, 0) : typeof tq === 'number' ? Math.round(tq * unit * 1000 * 10) / 10 : null; if (t === null) continue;
      bump(cat.slabs, String(Math.round(t)), { material: lay ? lay.map(l => l.material).join(' + ') : null, layers: lay, type: val(L(id).ObjectType) || null }, x => x.material + '|' + x.type); } }
    { const ids = api.GetLineIDsWithType(m, WebIFC.IFCDOOR); for (let i = 0; i < ids.size(); i++) { const id = ids.get(i); if (!keep(id)) continue; const e = L(id), w = val(e.OverallWidth), h = val(e.OverallHeight); if (!(w > 0)) continue;
      bump(cat.doors, String(Math.round(w * unit * 1000)), { type: val(e.ObjectType) || val(e.Name) || null, height_mm: h > 0 ? Math.round(h * unit * 1000) : null }, x => x.type + '|' + x.height_mm); } }
    api.CloseModel(m);
  }
  [cat.walls, cat.slabs, cat.doors].forEach(t => Object.values(t).forEach(L => L.sort((a, b) => b.n - a.n)));
  return { cat, byGuid };
}
module.exports = { learn };
if (require.main === module) (async () => {
  const args = process.argv.slice(2), files = [], opt = { o: null, name: null, storeys: null };
  for (let i = 0; i < args.length; i++) { if (args[i] === '-o') opt.o = args[++i]; else if (args[i] === '--name') opt.name = args[++i]; else if (args[i] === '--storeys') opt.storeys = args[++i].split(','); else files.push(args[i]); }
  if (!files.length || !opt.o) { console.log('§CATALOGUE FAIL usage: <ifc...> -o <catalogue.json> [--name n] [--storeys a,b]'); process.exit(1); }
  const { cat } = await learn(files, opt);
  fs.writeFileSync(opt.o, JSON.stringify(cat, null, 1) + '\n');
  const n = t => Object.values(t).reduce((a, L) => a + L.reduce((k, x) => k + x.n, 0), 0);
  console.log(`§CATALOGUE OK name=${cat.name} walls=${Object.keys(cat.walls).length} thicknesses / ${n(cat.walls)} walls, slabs=${Object.keys(cat.slabs).length} / ${n(cat.slabs)}, doors=${Object.keys(cat.doors).length} widths / ${n(cat.doors)} -> ${opt.o}`);
  Object.keys(cat.walls).sort((a, b) => a - b).forEach(k => console.log(`§CATALOGUE wall ${k} mm: ${cat.walls[k].map(x => x.n + 'x ' + x.material).join(' | ')}`));
})();
