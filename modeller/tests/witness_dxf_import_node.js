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

const files = [['DX_FLOOR_GF_marked.dxf', 'marked'], ['DX_FLOOR_FF_marked.dxf', 'marked'], ['DX_FRONT_shell.dxf', 'marked_shell'], ['DX_REAR_shell.dxf', 'marked_shell'],
  ['DX_LEFT_shell.dxf', 'marked_shell'], ['DX_RIGHT_shell.dxf', 'marked_shell'], ['DX_ROOF_shell.dxf', 'marked_shell']].map(([n, d]) => ({ name: n, text: fs.readFileSync(path.join(OUT, d, n), 'utf8') }));
const ref = JSON.parse(fs.readFileSync(path.join(OUT, 'duplex_basic_shapes_elements.json'), 'utf8'));

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
['Level 1', 'Level 2'].forEach(st => { labels[st] = sqlj(SRC, "select substr(m.element_name,1,instr(m.element_name,':')-1) k, r.minX a, r.minY b, r.maxX c, r.maxY d, r.minZ z0, r.maxZ z1 from elements_meta m join elements_rtree r on r.id=m.id where m.ifc_class='IfcWindow' and m.storey='" + st + "' and m.element_type='819mm x 759mm'")
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
say('fills hard=' + JSON.stringify(R.fillHard) + ' fills=' + ours.filter(e => /Door|Window/.test(e.class)).length);
say('SUMMARY fail=' + fail);
fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, lines.join('\n') + '\n');
process.exit(fail ? 1 : 0);
