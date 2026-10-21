#!/usr/bin/env node
// ⚠ DO NOT REMOVE — gen_storey_patch.js: prompts/DXF2BIM_FOUNDATION_LANE.md F7 CLINIC STOREYS (spec there). Read the §STOREY_PATCH lines after every run.
// ONE job: write the `spatial_structure` storey block of a Viewer patch (`buildings/patches/<served db>.sql`) from the IFC files the served db was built from.
// Every value is read from the STEP text: IfcBuilding / IfcBuildingStorey GlobalId + Name, IfcBuildingStorey.Elevation x the file's own IfcSIUnit LENGTHUNIT
// prefix, parent = the IfcRelAggregates whose RelatingObject is an IfcBuilding. A GUID declared by two files is one row when every value agrees; a REFUSAL
// (exit 1, no file written) when not. Nothing is computed beyond the unit factor; center / size / object_type / predefined_type stay NULL.
// Usage: node scripts/gen_storey_patch.js --ifc a.ifc [--ifc b.ifc ...] -o buildings/patches/X.db.sql [--header '<comment line>']
'use strict';
const fs = require('fs'), path = require('path');

const PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };

// split one STEP attribute list at its top-level commas (strings and nested lists kept whole)
function attrs(s) {
  const out = []; let cur = '', depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else inStr = false; } continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim()); return out;
}
const str = a => (a === '$' || a === '*') ? null : (a[0] === "'" ? a.slice(1, -1).replace(/''/g, "'") : a);
const ref = a => (a && a[0] === '#') ? Number(a.slice(1)) : null;

// one IFC -> { file, unit, scale, buildings: [{guid,name}], storeys: [{guid,name,elevation_raw,elevation,parent}] }
function storeysFromIfc(text, file) {
  const ent = {}, re = /#(\d+)\s*=\s*(IFCBUILDINGSTOREY|IFCBUILDING|IFCRELAGGREGATES|IFCSIUNIT)\s*\(([\s\S]*?)\)\s*;/g;
  let m; while ((m = re.exec(text))) ent[Number(m[1])] = { type: m[2], a: attrs(m[3]) };
  const units = Object.values(ent).filter(e => e.type === 'IFCSIUNIT' && e.a[1] === '.LENGTHUNIT.' && e.a[3] === '.METRE.');
  if (units.length !== 1) return { file, error: 'LENGTHUNIT IfcSIUnit rows = ' + units.length + ' (need exactly 1)' };
  const pre = units[0].a[2] === '$' ? null : units[0].a[2].replace(/\./g, ''), scale = pre ? PREFIX[pre] : 1;
  if (scale == null) return { file, error: 'unknown SI prefix ' + pre };
  const parentOf = {};
  Object.values(ent).filter(e => e.type === 'IFCRELAGGREGATES').forEach(e => {
    const relating = ent[ref(e.a[4])]; if (!relating || relating.type !== 'IFCBUILDING') return;
    e.a[5].replace(/^\(|\)$/g, '').split(',').map(x => ref(x.trim())).forEach(id => { if (ent[id] && ent[id].type === 'IFCBUILDINGSTOREY') parentOf[id] = str(relating.a[0]); });
  });
  const buildings = [], storeys = [];
  Object.keys(ent).map(Number).sort((x, y) => x - y).forEach(id => {
    const e = ent[id];
    if (e.type === 'IFCBUILDING') buildings.push({ guid: str(e.a[0]), name: str(e.a[2]) });
    if (e.type === 'IFCBUILDINGSTOREY') { const raw = e.a[9] === '$' ? null : Number(e.a[9]); storeys.push({ guid: str(e.a[0]), name: str(e.a[2]), elevation_raw: raw, elevation: raw == null ? null : raw * scale, parent: parentOf[id] || null }); }
  });
  return { file, unit: (pre ? pre + ' ' : '') + 'METRE', scale, buildings, storeys };
}

// many IFCs -> rows (one per GUID) or a refusal
function rowsFromIfcs(files) {
  const per = files.map(f => storeysFromIfc(fs.readFileSync(f, 'latin1'), path.basename(f))), rows = new Map(), refusals = [];
  per.forEach(p => {
    if (p.error) { refusals.push(p.file + ': ' + p.error); return; }
    const add = (r, from) => { const k = r.guid, prev = rows.get(k); if (!prev) { rows.set(k, Object.assign({ from: [from] }, r)); return; }
      const same = prev.type === r.type && prev.name === r.name && prev.parent_guid === r.parent_guid && (prev.elevation === r.elevation || (prev.elevation != null && r.elevation != null && Math.abs(prev.elevation - r.elevation) < 1e-9));
      if (!same) refusals.push('GUID ' + k + ' declared twice with different values: ' + JSON.stringify(prev) + ' vs ' + JSON.stringify(r) + ' (' + from + ')'); else prev.from.push(from); };
    p.buildings.forEach(b => add({ guid: b.guid, type: 'IfcBuilding', name: b.name, parent_guid: null, elevation: null }, p.file));
    p.storeys.forEach(s => add({ guid: s.guid, type: 'IfcBuildingStorey', name: s.name, parent_guid: s.parent, elevation: s.elevation }, p.file));
  });
  return { per, rows: [...rows.values()], refusals };
}

const q = v => v == null ? 'NULL' : (typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
function patchSql(rows, header) {
  const L = [];
  (header || []).forEach(h => L.push('-- ' + h));
  L.push('CREATE TABLE IF NOT EXISTS spatial_structure (guid TEXT, type TEXT, name TEXT, parent_guid TEXT, object_type TEXT, predefined_type TEXT, center_x REAL, center_y REAL, center_z REAL, size_x REAL, size_y REAL, size_z REAL, elevation REAL);');
  L.push('DELETE FROM spatial_structure WHERE guid IN (' + rows.map(r => q(r.guid)).join(',') + ');');
  rows.forEach(r => L.push('INSERT INTO spatial_structure (guid,type,name,parent_guid,object_type,predefined_type,center_x,center_y,center_z,size_x,size_y,size_z,elevation) VALUES (' +
    [r.guid, r.type, r.name, r.parent_guid].map(q).join(',') + ',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,' + q(r.elevation) + ');'));
  return L.join('\n') + '\n';
}

module.exports = { storeysFromIfc, rowsFromIfcs, patchSql };

if (require.main === module) {
  const a = process.argv.slice(2), ifcs = [], hdr = []; let out = null;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--ifc') ifcs.push(a[++i]); else if (a[i] === '-o') out = a[++i]; else if (a[i] === '--header') hdr.push(a[++i]); }
  if (!ifcs.length || !out) { console.error('usage: gen_storey_patch.js --ifc <file> [--ifc <file> ...] -o <patch.sql> [--header <line>]'); process.exit(2); }
  const R = rowsFromIfcs(ifcs);
  R.per.forEach(p => console.log('§STOREY_PATCH file=' + p.file + (p.error ? ' ERROR ' + p.error : ' unit=' + p.unit + ' scale=' + p.scale + ' buildings=' + p.buildings.length + ' storeys=' + p.storeys.length + ' withParent=' + p.storeys.filter(s => s.parent).length)));
  R.rows.forEach(r => console.log('§STOREY_PATCH row ' + r.type + ' ' + r.guid + ' "' + r.name + '" parent=' + r.parent_guid + ' elevation=' + r.elevation + ' from=' + r.from.join('+')));
  if (R.refusals.length) { R.refusals.forEach(x => console.log('§STOREY_PATCH REFUSED ' + x)); process.exit(1); }
  fs.writeFileSync(out, patchSql(R.rows, hdr));
  console.log('§STOREY_PATCH wrote ' + out + ' rows=' + R.rows.length + ' (IfcBuilding ' + R.rows.filter(r => r.type === 'IfcBuilding').length + ', IfcBuildingStorey ' + R.rows.filter(r => r.type === 'IfcBuildingStorey').length + ')');
}
