#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DXF-IMPORT-PORT (C1-PORT): prompts/DXF2BIM_MODELLER_LANE.md §L3 "L3 build spec". Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: modeller/dxf2bim_import.js is a PORT of BIMCompiler rosetta_dx_shell.js pipeline() (the
 * orchestration; the geometry modules are verbatim copies). A port can drift: a call in the wrong order, a config value copied
 * wrong, an elevation order changed, a storey paired with the wrong lower storey. This runs the module in Node on the SAME input
 * files with the SAME library rows and labels the Node run reads, and compares with the Node run's own element summary
 * (out/duplex_basic_shapes_elements.json, BASIC_SHAPES_SPEC §11 CF-4):
 *   P1 RUN-ID   — run_id equal (also proves the inlined SHA-256 == Node crypto: run_id hashes every sheet text).
 *   P2 ELEMENTS — same element ids; each with the same class, storey, bbox (1 mm) and volume (1e-6 m3); fills incl. element_ref.
 *   P3 COUNTS   — counts by storey/class equal.
 *   P4 SHA      — the module's sync SHA-256 equals Node crypto on 3 fixed strings incl. non-ASCII.
 *   P5 FALSIFY  — the P2 comparator against the Node summary with one element moved 2 mm must report exactly that one.
 *   P6 SUBSET   — §L3.2: the module with the LOCAL library subset JSON (BIMCompiler scripts/export_library_subset.js, generated here
 *                 first into modeller/dxf2bim/local/, git-ignored) instead of the DB equals the Node run element-for-element incl.
 *                 the 26 fills. Issue: the subset lost a candidate row, a mesh or a label, so a fill binds or sits differently.
 *   P7 DETERMINISM — two exports of the subset are byte-identical. Issue: the export is not a function of its inputs.
 *   P8 VERDICT  — §L3.3: the module's dxf2qualify verdict (its own gaps + qualify input) equals the verdict on the Node run's
 *                 dx_shell_gaps.json built as rosetta_qualify.js does (verdict, blocking and advisory by code). Issue: the port's
 *                 gaps or qualify input drift, so the Modeller gate would pass/refuse a set the Node run judges otherwise.
 * DXSET=std (§L3.3): the std set (out/marked_std + out/marked_std_shell, 8 sheets incl. ROOF + SECTION), the _std summary.
 *
 * Inputs (not in git): $DXF2BIM_BC (default ~/Projects/bim-compiler) tests/dxf2bim/out/{marked,marked_shell}, deploy/component_library.db,
 * 2D_Layout/input/DX_extracted.db (labels only, exactly as the Node run: round trip, stated). Run the BIMCompiler rosetta_dx_shell.js first.
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const I = require(path.join(__dirname, '..', 'dxf2bim_import.js'));
const BC = process.env.DXF2BIM_BC || path.join(process.env.HOME, 'Projects', 'bim-compiler');
const OUT = path.join(BC, 'tests/dxf2bim/out');
const LOG = path.join(__dirname, 'logs', 'witness_dxf_import_node.log');
const lines = []; let fail = 0;
const say = s => { lines.push(s); console.log(s); };
const check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const sqlj = (db, q) => JSON.parse(cp.execFileSync('sqlite3', ['-json', '-readonly', db, q], { encoding: 'utf8', maxBuffer: 1 << 28 }) || '[]');
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
say('BC=' + BC);

const STD = process.env.DXSET === 'std', SFX = STD ? '_std' : '', MD = STD ? 'marked_std' : 'marked', MS = STD ? 'marked_std_shell' : 'marked_shell';
const fileList = [['DX_FLOOR_GF_marked.dxf', MD], ['DX_FLOOR_FF_marked.dxf', MD], ['DX_FRONT_shell.dxf', MS], ['DX_REAR_shell.dxf', MS], ['DX_LEFT_shell.dxf', MS], ['DX_RIGHT_shell.dxf', MS]]
  .concat(STD ? [['DX_ROOF_marked.dxf', MD], ['DX_SECTION_marked.dxf', MD]] : [['DX_ROOF_shell.dxf', MS]]);
const files = fileList.map(([n, d]) => ({ name: n, text: fs.readFileSync(path.join(OUT, d, n), 'utf8') }));
const ref = JSON.parse(fs.readFileSync(path.join(OUT, 'duplex_basic_shapes_elements' + SFX + '.json'), 'utf8'));
say('set=' + (STD ? 'std' : 'dx') + ' sheets=' + files.length);

// library rows: the SAME queries rosetta_dx_shell.js runs (read-only)
const LIBDB = path.join(BC, 'deploy/component_library.db'), SRC = path.join(BC, '2D_Layout/input/DX_extracted.db');
const fams = sqlj(LIBDB, 'select family_id id, opening_type ot, ifc_class, default_width_mm w, default_height_mm h, description d from ad_opening_family where is_active=1');
const wallTypes = sqlj(LIBDB, 'select wall_type_id id, total_mm t from ad_wall_type where is_active=1');
const grows = sqlj(LIBDB, "select m.element_ref, m.ifc_class, m.geometry_hash, hex(g.vertices) v, hex(g.faces) f from ad_geometry_map m join component_geometries g on g.geometry_hash=m.geometry_hash where m.ifc_class in ('IfcDoor','IfcWindow')");
const seenG = {}, geoms = [];
grows.forEach(r => { const k = r.element_ref + '|' + r.geometry_hash; if (seenG[k]) return; seenG[k] = 1;
  const vb = Buffer.from(r.v, 'hex'), fb = Buffer.from(r.f, 'hex'), V = [], F = [];
  for (let i = 0; i + 11 < vb.length; i += 12) V.push([vb.readFloatLE(i), vb.readFloatLE(i + 4), vb.readFloatLE(i + 8)]);
  for (let i = 0; i + 11 < fb.length; i += 12) F.push([fb.readInt32LE(i), fb.readInt32LE(i + 4), fb.readInt32LE(i + 8)]);
  const mn = [0, 1, 2].map(a => Math.min(...V.map(v => v[a]))), mx = [0, 1, 2].map(a => Math.max(...V.map(v => v[a])));
  geoms.push({ element_ref: r.element_ref, ifc_class: r.ifc_class, geometry_hash: r.geometry_hash, vertices: V, faces: F, bbox: { min: mn, max: mx } }); });
const LABELMAP = { M_Fixed: 'DUPLEX_SMALL_FIXED', M_Casement: 'DUPLEX_CASEMENT' };   // as rosetta_dx_shell.js (labels FROM the source model, round trip)
const labels = {};
// BIMCompiler §14 LF-4: the std set states these windows as @TAG markings in its plans; the Node std run applies no source-model labels
if (!STD) ['Level 1', 'Level 2'].forEach(st => { labels[st] = sqlj(SRC, "select substr(m.element_name,1,instr(m.element_name,':')-1) k, r.minX a, r.minY b, r.maxX c, r.maxY d, r.minZ z0, r.maxZ z1 from elements_meta m join elements_rtree r on r.id=m.id where m.ifc_class='IfcWindow' and m.storey='" + st + "' and m.element_type='819mm x 759mm'")
  .map(x => ({ class: 'window', x: (x.a + x.c) / 2, y: (x.b + x.d) / 2, z: (x.z0 + x.z1) / 2, text: LABELMAP[x.k] })); });

const sheets = I.readSheets(files, { hashHex });
say('roles: ' + sheets.map(s => s.name + '=' + (s.role || 'NONE:' + s.why) + (s.level !== undefined ? '@' + s.level : '') + (s.face ? ':' + s.face : '') + (s.roofZ !== undefined ? '@' + s.roofZ : '')).join(' | '));
const R = I.convert(sheets, { hashHex, library: { families: fams, wallTypes, geoms, labels } });
if (R.refused) { say('REFUSED ' + JSON.stringify(R.refused)); }
const r6 = v => Math.round(v * 1e6) / 1e6;
const bb = e => { const mn = [0, 1, 2].map(a => Math.min(...e.vertices.map(v => v[a]))), mx = [0, 1, 2].map(a => Math.max(...e.vertices.map(v => v[a]))); return mn.concat(mx).map(r6); };
const ours = (R.els || []).map(e => ({ guid: e.guid, class: e.class, storey: e.storey, bbox: bb(e), volume: e.volume, element_ref: e.element_ref, infill: !!R.infillGuid[e.guid] }));

check('P1 RUN-ID', 'the port computes another run_id for the same inputs (different identity, or the inlined SHA-256 differs from Node crypto)', R.run_id === ref.run_id, 'module=' + R.run_id + ' node=' + ref.run_id);
function compare(A, Bref) {
  const byG = {}; A.forEach(x => { byG[x.guid] = x; });
  const bad = [];
  Bref.forEach(r => { const x = byG[r.guid];
    if (!x) { bad.push(r.guid.slice(0, 8) + ' missing ' + r.class); return; }
    const d = Math.max(...r.bbox.map((v, i) => Math.abs(v - x.bbox[i])));
    if (x.class !== r.class || x.storey !== r.storey || d > 0.001 || Math.abs(x.volume - r.volume) > 1e-6 || (r.element_ref || null) !== (x.element_ref || null) || !!r.infill !== x.infill)
      bad.push(r.guid.slice(0, 8) + ' ' + r.class + ' bboxΔ=' + d.toFixed(4) + ' vol ' + x.volume + '/' + r.volume + ' ' + (x.storey !== r.storey ? 'storey ' + x.storey + '/' + r.storey : ''));
  });
  const extra = A.filter(x => !Bref.some(r => r.guid === x.guid)).map(x => x.guid.slice(0, 8) + ' extra ' + x.class);
  return bad.concat(extra);
}
const diff = compare(ours, ref.elements);
check('P2 ELEMENTS', 'an element differs from the Node run (id, class, storey, bbox 1 mm, volume, fill product, infill flag)', diff.length === 0 && ours.length === ref.elements.length,
  'module=' + ours.length + ' node=' + ref.elements.length + ' differ=' + diff.length + (diff.length ? ' ' + diff.slice(0, 6).join('; ') : ''));
const cnt = a => a.reduce((o, e) => { const k = e.storey + '/' + e.class + (e.infill ? '(infill)' : ''); o[k] = (o[k] || 0) + 1; return o; }, {});
const sortObj = o => JSON.stringify(Object.keys(o).sort().reduce((q, k) => (q[k] = o[k], q), {}));
check('P3 COUNTS', 'counts by storey/class differ', sortObj(cnt(ours)) === sortObj(cnt(ref.elements)), sortObj(cnt(ours)));
const tv = ['', 'abc', 'Ä ROOF LEVEL +6.500 ∅ ' + 'x'.repeat(200)];
check('P4 SHA', 'the inlined sync SHA-256 differs from Node crypto', tv.every(s => I.sha256Hex(s) === hashHex(s)), tv.map(s => I.sha256Hex(s).slice(0, 8)).join(','));
const moved = JSON.parse(JSON.stringify(ref.elements)); const mi = moved.findIndex(e => e.class === 'IfcWall'); moved[mi].bbox[0] += 0.002; moved[mi].bbox[3] += 0.002;
const fd = compare(ours, moved);
check('P5 FALSIFY', 'the element comparator cannot fail (one element moved 2 mm must be the only difference)', fd.length === 1 && fd[0].indexOf(moved[mi].guid.slice(0, 8)) === 0, 'reported=' + fd.length + ' ' + fd.join('; '));
// ---- §L3.2 P6/P7: the local library subset ----
const SUBSET = path.join(__dirname, '..', 'dxf2bim', 'local', 'library_subset_duplex.json'), SUB2 = SUBSET.replace(/\.json$/, '.det2.json');
const exportSubset = out => cp.execFileSync('node', [path.join(BC, 'scripts/export_library_subset.js'), '--elements', path.join(OUT, 'duplex_basic_shapes_elements' + SFX + '.json'),
  '--labels', path.join(OUT, 'duplex_basic_shapes_labels' + SFX + '.json'), '--lib', LIBDB, '--out', out], { encoding: 'utf8' });
const ex1 = exportSubset(SUBSET); say(ex1.trim().split('\n').map(l => '  ' + l).join('\n')); exportSubset(SUB2);
const b1 = fs.readFileSync(SUBSET), b2 = fs.readFileSync(SUB2); fs.unlinkSync(SUB2);
check('P7 DETERMINISM', 'two exports of the library subset differ (not a function of its inputs)', Buffer.compare(b1, b2) === 0, 'bytes=' + b1.length + ' sha256=' + crypto.createHash('sha256').update(b1).digest('hex'));
const SL = I.librarySubset(JSON.parse(b1.toString('utf8')));
const RS = I.convert(sheets, { hashHex, library: SL });
const oursS = (RS.els || []).map(e => ({ guid: e.guid, class: e.class, storey: e.storey, bbox: bb(e), volume: e.volume, element_ref: e.element_ref, infill: !!RS.infillGuid[e.guid] }));
const dS = compare(oursS, ref.elements);
check('P6 SUBSET', 'the module with the library subset JSON differs from the Node run (a lost candidate, mesh or label binds or places a fill differently)',
  dS.length === 0 && oursS.length === ref.elements.length && RS.fillHard.length === 0 && RS.run_id === ref.run_id,
  'module=' + oursS.length + ' node=' + ref.elements.length + ' fills=' + oursS.filter(e => /Door|Window/.test(e.class)).length + ' hard=' + JSON.stringify(RS.fillHard) + ' differ=' + dS.length + (dS.length ? ' ' + dS.slice(0, 6).join('; ') : ''));
// ---- §L3.3 P8: the module's verdict == the verdict on the Node run's gaps, built as rosetta_qualify.js builds it ----
{
  const DD = path.join(BC, 'deploy/dev/'), QN = require(DD + 'dxf2qualify.js'), BN = require(DD + 'dxf2bim.js'), CN = require(DD + 'dxf2shell_config.js'), PN = require(DD + 'dxf-parser.js');
  const SETN = STD ? CN.STD : Object.assign({}, CN, { QUALIFY: CN.QUALIFY }), G = JSON.parse(fs.readFileSync(path.join(OUT, MS, 'dx_shell_gaps.json'), 'utf8'));
  const idOf = n => n.replace(/_(marked|shell)\.dxf$/, '');
  const mapsOf = id => /FLOOR/.test(id) ? [SETN.MAP_PLAN] : id === 'DX_ROOF' ? [SETN.MAP_ROOF] : id === 'DX_SECTION' ? [CN.STD.MAP_SECT] : [SETN.MAP_ELEV, SETN.MAP_LEVL].concat(STD ? [CN.STD.EXCL_ELEV] : []);
  const nf = files.map(f => ({ name: idOf(f.name), dxf: new PN().parseSync(f.text), layer_maps: mapsOf(idOf(f.name)) })).sort((a, b) => (a.name < b.name ? -1 : 1));
  const pdeps = { DxfParser: PN, hashHex, library: [] };
  const pops = {}; nf.filter(f => /FLOOR/.test(f.name)).forEach(f => { pops[f.name] = BN.run(files.find(x => idOf(x.name) === f.name).text, SETN.MAP_PLAN, CN.CFG, pdeps).ops; });
  const vN = QN.qualify({ files: nf, plan_ops: pops, gaps: G.gaps, resolved: G.resolved }, SETN.QUALIFY), vM = RS.verdict;
  const sum = v => JSON.stringify({ verdict: v.verdict, blocking: v.blocking.length, advisory: v.advisory.length, counts: v.counts, adv: v.advisory.map(x => x.code).sort(), shapes: v.by_shape });
  check('P8 VERDICT', 'the module\'s qualify verdict differs from the verdict on the Node run\'s gaps (the gate would judge the set otherwise)', !!vM && sum(vM) === sum(vN),
    'module=' + (vM ? sum(vM).slice(0, 300) : 'none') + (vM && sum(vM) === sum(vN) ? '' : ' | node=' + sum(vN).slice(0, 300)));
}
say('fills hard=' + JSON.stringify(R.fillHard) + ' fills=' + ours.filter(e => /Door|Window/.test(e.class)).length);
say('SUMMARY fail=' + fail);
fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
process.exit(fail ? 1 : 0);
