#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MATERIAL (rule D53, prompts/DXF2BIM_FOUNDATION_LANE.md §D53). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the standard path built walls, slabs and roofs with NO material (5D / BOM had none); the owner asked for fast best-effort defaults, editable in JSON.
 *   M1 REFERENCE — no catalogue: every wall / curtain wall / slab / roof carries synthetic_ref.json's material for its class, source 'reference'.
 *   M2 OWN       — a catalogue learned from the same model's IFC: for a thickness with ONE material the pieces in one model wall take it (>= 99%); for a thickness with several the
 *                  most frequent is taken and the others are named (material_alt): the model's material is always among them (thickness alone cannot choose; measured HHS 115 mm Ziegel / Lamellen).
 *   M3 FOREIGN   — a catalogue from another firm's IFC: where it applies (a thickness matches), its materials equal the model's for < 10% (catalogues are per firm).
 *   M4 HELD OUT  — learned on the model's first two storeys, the same two claims on the remaining storeys.
 *   M5 GEOMETRY  — guid, class, vertices of every element identical with and without materials.
 * Usage: NODE_PATH=<dir with better-sqlite3, web-ifc> node modeller/tests/witness_dxf_material.js <Node model .db> <its architecture .ifc> [<another firm's .ifc>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), CAT = require(path.join(M, 'tools/catalogue_from_ifc.js')), REF = require(path.join(M, 'synthetic_ref.json'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const [db, ifc, foreign] = process.argv.slice(2); if (!db || !ifc) { say('MISSING input: <model .db> <its architecture .ifc> [<another firm\'s .ifc>]'); process.exit(2); }
(async () => {
  const con = new Database(db, { readonly: true }), q = s => con.prepare(s).all(), name = path.basename(db, '.db');
  const R = S.writeStdSet(q, 'X', {}), Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), sheets = I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] })));
  const mw = q("SELECT m.guid, b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ FROM elements_meta m JOIN element_world_bbox b ON b.guid = m.guid WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase')");
  const own = await CAT.learn([ifc], { name: 'own' });
  const hostOf = e => { const xs = e.vertices.map(v => v[0]), ys = e.vertices.map(v => v[1]), zs = e.vertices.map(v => v[2]), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    const h = mw.filter(w => c[0] >= w.minX - 1e-3 && c[0] <= w.maxX + 1e-3 && c[1] >= w.minY - 1e-3 && c[1] <= w.maxY + 1e-3 && c[2] >= w.minZ - 1e-3 && c[2] <= w.maxZ + 1e-3); return h.length === 1 ? h[0].guid : null; };
  const run = opts => I.convert(sheets, opts), geo = o => JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices]));
  const score = (o, hostStoreys, cat) => { let n = 0, hit = 0, applied = 0, amb = 0, ambHit = 0, ambAlt = 0, unseen = 0; o.els.filter(e => e.class === 'IfcWall').forEach(e => { const g = hostOf(e), t = g && own.byGuid[g]; if (!t || !t.material || (hostStoreys && hostStoreys.indexOf(t.storey) < 0)) return;   // held out by the host wall's own (IFC) storey
    const src = e.ifc && e.ifc.material_source || ''; if (/^reference/.test(src)) return; applied++;
    if (e.ifc.material_alt) { amb++; if (e.ifc.material === t.material) ambHit++; const row = cat && cat.walls[String(e.ifc.thickness_mm)]; if (row && !row.some(r => r.material === t.material)) unseen++; if (e.ifc.material_alt.some(a => a.indexOf(t.material) >= 0) || e.ifc.material === t.material) ambAlt++; return; }
    n++; if (e.ifc.material === t.material) hit++; }); return { n, hit, applied, amb, ambHit, ambAlt, unseen, rate: n ? hit / n : 0 }; };
  const fmt = s2 => `one_material_rows: pieces=${s2.n} same=${s2.hit} rate=${s2.rate.toFixed(3)} | ambiguous_rows: pieces=${s2.amb} same=${s2.ambHit} model_material_named(first or alt)=${s2.ambAlt} unseen_by_the_catalogue=${s2.unseen}`;
  const o0 = run({}), bad = o0.els.filter(e => REF.parts[e.class] && !(e.ifc && e.ifc.material === REF.parts[e.class].material && /^reference/.test(e.ifc.material_source)));
  const bycls = {}; o0.els.forEach(e => { if (REF.parts[e.class]) bycls[e.class + ':' + (e.ifc && e.ifc.material)] = (bycls[e.class + ':' + (e.ifc && e.ifc.material)] || 0) + 1; });
  check('M1[' + name + ']', 'no catalogue: every wall / curtain wall / slab / roof carries the reference material of its class', !bad.length && o0.els.some(e => e.ifc && e.ifc.material), `${JSON.stringify(bycls)} wrong=${bad.length}`);
  const o1 = run({ catalogue: own.cat }), s1 = score(o1, null, own.cat);
  check('M2[' + name + ']', 'own catalogue: a thickness with one material gives the model\'s material (>= 99%); a thickness with several names the model\'s among first + alternatives (>= 99%; a piece matched to its neighbour wall is the 1%)', s1.n > 0 && s1.rate >= 0.99 && s1.ambAlt >= 0.99 * s1.amb, fmt(s1));
  if (foreign) { const fc = await CAT.learn([foreign], { name: 'foreign' }), o2 = run({ catalogue: fc.cat }); let n = 0, hit = 0;
    o2.els.filter(e => e.class === 'IfcWall' && e.ifc && !/^reference/.test(e.ifc.material_source)).forEach(e => { const g = hostOf(e), t = g && own.byGuid[g]; if (!t) return; n++; if (e.ifc.material === t.material) hit++; });
    check('M3[' + name + ']', 'a foreign catalogue: where it applies its materials are the model\'s for < 10%', n === 0 || hit / n < 0.1, `applied_and_judged=${n} same=${hit} rate=${n ? (hit / n).toFixed(3) : '-'} (${path.basename(foreign)})`); }
  else say('INCONCLUSIVE M3 | no foreign IFC given');
  const sts = Array.from(new Set(Object.values(own.byGuid).map(x => x.storey))).filter(Boolean).sort(), first = sts.slice(0, 2), rest = sts.filter(n => first.indexOf(n) < 0);
  if (sts.length >= 3) { const h = await CAT.learn([ifc], { name: 'held-out', storeys: first }), o3 = run({ catalogue: h.cat }), s3 = score(o3, rest, h.cat);
    check('M4[' + name + ']', 'learned on the first two storeys: on the rest, one-material thicknesses give the model material (>= 99%); ambiguous ones name it unless the training storeys never used it (unseen, counted)', s3.n > 0 && s3.rate >= 0.99 && s3.ambAlt >= 0.99 * (s3.amb - s3.unseen), `learned_on=${first.join(',')} judged_on=${rest.join(',')} ` + fmt(s3)); }
  else say('INCONCLUSIVE M4 | fewer than 3 storeys');
  const B0 = I.convert(sheets, { ref: { parts: {} } });
  check('M5[' + name + ']', 'geometry identical with and without materials', geo(o0) === geo(B0) && geo(o1) === geo(B0), `els=${o0.els.length}`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})();
