#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SLAB-EDGE (rule D70.1, prompts/DXF2BIM_FOUNDATION_LANE.md §D70.1). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the writer drew no slab edge on the plans (F15), so the reader had to infer every slab: the inner-face rectangle (§D44) or the walls-bounded estimate (§D51,
 * HHS -10 %, L3 +125 %). The owner chose the drafting convention "if it is practical and in practice": the floor outline with its real openings, no plank joints (§D70.1 sources (a)-(e)).
 *   E1 WRITER   — every plan with slabs in the §D70 window draws closed A-FLOR-OTLN polylines; no drawn hole is under slab.edge_void_min_area; no two drawn pieces are nearer than
 *                 slab.edge_joint_close; drawn area = the model's even-odd union + the filled holes + the closed joints - the dropped pieces (each stated in the §SLAB_EDGE line).
 *   E2 READER   — per storey the converted slab bodies' top area = the drawn area to 0.5 %, every body watertight, none amber, no GAP:slab_outline_* on that storey.
 *   E3 EDITABLE — opts.slabEdge.void_min_area = 0 draws every hole no column / wall fills (>= the default count), the value is the user's to change.
 *   E4 FALSIFIER— the A-FLOR-OTLN entities stripped from the plans: the slabs are §D51 / §D44's again (an estimated or rectangle slab, or none + the gap), not the drawn edge.
 *                 Run with M=<origin/main modeller dir>: E1 FAILS (main draws no slab edge).
 *   E5 ONLY SLABS — every non-slab element equal (class + vertices) with and without the layer.
 *   E6 REGISTRY — element_defaults.json slab.edge_joint_close / slab.edge_void_min_area = the writer's built-in defaults.
 * Usage: NODE_PATH=<dir with better-sqlite3> [M=<modeller dir>] node modeller/tests/witness_dxf_slab_edge.js [<Node model .db> ...]   (default /tmp/db2/{DXARC,HHSM2,JKR3}.db)
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), M = process.env.M ? path.resolve(process.env.M) : path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js'), SC = require(D + 'std2d_scopes.js');
const G = require(D + 'std2d_geom.js'), PC = require(D + 'polygon-clipping.js'), Mesh = require(D + 'dxf2mesh.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
let dbs = process.argv.slice(2); if (!dbs.length) dbs = ['DXARC', 'HHSM2', 'JKR3'].map(n => '/tmp/db2/' + n + '.db');
const missing = dbs.filter(f => !fs.existsSync(f)); if (missing.length) { say('MISSING input: ' + missing.join(' ') + ' (regenerate: extractIFC2DB.js, RESUME block of prompts/DXF2BIM_ARCHITECT_REVIEW.md)'); process.exit(2); }
const topArea = e => { let a = 0; e.faces.forEach(f => { const p = f.map(i => e.vertices[i]); if (!p.every(q => Math.abs(q[2] - p[0][2]) < 1e-9)) return; const cr = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]); if (cr > 0 && p[0][2] >= Math.max(...e.vertices.map(v => v[2])) - 1e-9) a += cr / 2; }); return a; };
const ringA = r => { let a = 0; for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const mpA = P => P.reduce((s, p) => s + Math.abs(ringA(p[0])) - p.slice(1).reduce((t, h) => t + Math.abs(ringA(h)), 0), 0);
// the drawn A-FLOR-OTLN rings of a plan text (m), straight from the DXF (independent of the writer's own report)
const drawnRings = text => { const d = new DxfParser().parseSync(text); return (d.entities || []).filter(e => e.layer === 'A-FLOR-OTLN').map(e => ({ closed: !!e.shape, p: e.vertices.map(v => [v.x / 1000, v.y / 1000]) })); };
const strip = text => { // remove every entity on A-FLOR-OTLN (the falsifier): LWPOLYLINE groups from "0\nLWPOLYLINE" to the next "0\n"
  const L = text.split('\n'), out = []; let i = 0;
  while (i < L.length) { if (L[i].trim() === '0' && L[i + 1] !== undefined && /^(LWPOLYLINE|POLYLINE)$/.test(L[i + 1].trim())) { let j = i + 2, layer = null; while (j < L.length && L[j].trim() !== '0') { if (L[j].trim() === '8') layer = L[j + 1].trim(); j += 2; } if (layer === 'A-FLOR-OTLN') { i = j; continue; } } out.push(L[i]); i++; }
  return out.join('\n'); };
{ // E6
  const R = JSON.parse(fs.readFileSync(path.join(M, 'element_defaults.json'), 'utf8')).defaults || {}, jc = R['slab.edge_joint_close'], vm = R['slab.edge_void_min_area'], W = S.SLAB_EDGE || {};
  check('E6', 'element_defaults.json slab.edge_* = the writer defaults (amber guesses with a basis)', !!(jc && vm && jc.value === W.joint_close && vm.value === W.void_min_area && jc.kind === 'guess' && vm.kind === 'guess' && jc.basis && vm.basis),
    `registry=${jc && jc.value}/${vm && vm.value} writer=${W.joint_close}/${W.void_min_area}`);
}
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const t0 = Date.now(), R = S.writeStdSet(q, 'X', {}), tw = Date.now() - t0, model = R.model, se = R.log.filter(l => /^§SLAB_EDGE /.test(l));
  se.forEach(l => say('  ' + l));
  // E1: every plan with slabs in the window draws the edge; check the drawn rings directly
  const bad = [], per = {}, W = S.SLAB_EDGE || { joint_close: 0.05, void_min_area: 0.0645 };
  R.views.plan.forEach(({ view, storey }) => {
    const nSlabs = S.slabsAt ? S.slabsAt(model, storey).length : model.els.filter(e => e.cls === 'IfcSlab' && e.z1 >= storey.elev - 0.5 && e.z1 <= storey.elev + 0.3 && e.z1 - e.z0 >= 0.05).length;
    const f = 'X_' + view + '_std.dxf'; if (!R.files[f]) { if (nSlabs) bad.push(storey.name + ':no_sheet'); return; }
    const rings = drawnRings(R.files[f]); per[view] = rings;
    if (!nSlabs) { if (rings.length) bad.push(storey.name + ':edge_without_slab'); return; }
    if (!rings.length) { bad.push(storey.name + ':no_A-FLOR-OTLN'); return; }
    if (rings.some(r => !r.closed)) bad.push(storey.name + ':open_ring');
    const line = se.find(l => l.indexOf("storey='" + storey.name + "'") > 0) || '', num = k => Number((new RegExp(' ' + k + '=([-0-9.]+)').exec(line) || [])[1]);
    // nesting: area-sorted, inside = vertex test (the reader's rule is checked in E2; here area bookkeeping): holes = rings inside another ring
    const rs = rings.map(r => ({ p: r.p.concat([r.p[0]]), a: Math.abs(ringA(r.p.concat([r.p[0]]))) })).sort((x, y) => y.a - x.a);
    const depth = (r, i) => rs.slice(0, i).filter(o => { try { return mpA(PC.difference([[r.p]], [[o.p]])) < 1e-6 * r.a; } catch (x) { return false; } }).length;   // rings containing it
    const holes = rs.filter((r, i) => depth(r, i) % 2 === 1);   // even-odd: a piece inside a courtyard hole (LTU) is a piece again
    const outers = rs.filter(r => holes.indexOf(r) < 0), drawnA = outers.reduce((s, r) => s + r.a, 0) - holes.reduce((s, r) => s + r.a, 0);
    if (holes.some(h => h.a < W.void_min_area - 1e-9)) bad.push(storey.name + ':hole_under_min');
    // no two pieces nearer than half the joint (a lower bound: a square of side w closes any gap narrower than w along x or y; a diagonal gap it leaves is >= w / 2 wide), and none overlap
    const box = r => r.p.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    let minGap = Infinity;
    for (let i = 0; i < outers.length; i++) for (let j = i + 1; j < outers.length; j++) {
      const A = box(outers[i]), Bx = box(outers[j]), w = W.joint_close; if (A[0] > Bx[2] + w || Bx[0] > A[2] + w || A[1] > Bx[3] + w || Bx[1] > A[3] + w) continue;
      const P = outers[i].p, Q = outers[j].p; let d = Infinity;
      for (let k = 0; k + 1 < P.length; k++) for (let l = 0; l + 1 < Q.length; l++) d = Math.min(d, segD(P[k], Q[l], Q[l + 1]), segD(Q[l], P[k], P[k + 1]));
      minGap = Math.min(minGap, d);
    }
    if (minGap < W.joint_close / 2 - 1e-6) bad.push(storey.name + ':pieces_' + (minGap * 1000).toFixed(1) + 'mm_apart');
    const union = num('union_m2'), filled = num('filled_m2'), dropped = num('dropped_m2'), closed = num('closed_m2');
    if (!(Math.abs(drawnA - Number(num('drawn_m2'))) <= 0.01 + 1e-4 * drawnA)) bad.push(storey.name + ':drawn ' + drawnA.toFixed(2) + '!=' + num('drawn_m2'));
    if (!(Math.abs(drawnA - (closed + filled - dropped)) <= 0.01 + 1e-4 * drawnA) || !(closed >= union - 0.01)) bad.push(storey.name + ':bookkeeping');
    per[view] = { drawnA, holes: holes.length, pieces: outers.length, minGap };
  });
  // pieces nearer than the joint: measured by the closing itself (a closing of the drawn pieces by the joint width must not merge any two)
  check('E1[' + name + ']', 'every plan with slabs draws the A-FLOR-OTLN edge: closed rings, no hole under the minimum, area = union + filled + closed joints - dropped', !bad.length && se.length > 0,
    `plans=${R.views.plan.length} edge_lines=${se.length} ${Object.keys(per).map(k => k + ':' + (per[k].pieces || 0) + 'p/' + (per[k].holes || 0) + 'h/' + (per[k].drawnA || 0).toFixed(2) + 'm2/gap' + (isFinite(per[k].minGap) ? (per[k].minGap * 1000).toFixed(0) + 'mm' : '-')).join(' ')} write_ms=${tw} ${bad.slice(0, 6).join(' ')}`);
  // E2: the reader
  const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC, SCOPES: SC }, { set: 'X' }), files = Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }));
  const t1 = Date.now(), o = I.convert(I.readSheets(files), {}), tc = Date.now() - t1;
  if (!o.els) { check('E2[' + name + ']', 'the marked set converts', false, JSON.stringify(o.refused || o).slice(0, 200)); return; }
  const bad2 = [], rep = [];
  o.ST.forEach(st => {
    const vk = Object.keys(per).find(v => st.sheet.indexOf('X_' + v + '_') === 0), drawn = vk && per[vk].drawnA, sl = o.els.filter(e => e.class === 'IfcSlab' && e.storey === st.name);
    if (!drawn) return;
    const fromEdge = sl.filter(e => e.layer === 'A-FLOR-OTLN'), A = fromEdge.reduce((s, e) => s + topArea(e), 0);
    const g = o.verdict.advisory.concat(o.verdict.blocking || []).filter(a => a.sheet === st.sheet && /^GAP:slab_outline_/.test(a.code)).length;
    const thick = o.slabZ && o.slabZ[st.name] && typeof o.slabZ[st.name].thickness === 'number';
    rep.push(`${st.name}:${fromEdge.length}b/${A.toFixed(2)}m2${thick ? '' : '(no_thickness)'}`);
    if (!thick) return;   // no slab level from the section / elevations: nothing to build (stated)
    if (Math.abs(A - drawn) > 0.005 * drawn) bad2.push(st.name + ':area ' + A.toFixed(2) + '!=' + drawn.toFixed(2));
    if (fromEdge.some(e => !Mesh.watertight(e))) bad2.push(st.name + ':not_watertight ' + fromEdge.filter(e => !Mesh.watertight(e)).length);
    if (fromEdge.some(e => e.prov === 'derived')) bad2.push(st.name + ':amber');
    if (sl.length !== fromEdge.length) bad2.push(st.name + ':other_slabs ' + (sl.length - fromEdge.length));
    if (g) bad2.push(st.name + ':slab_outline_gap');
  });
  check('E2[' + name + ']', 'the reader builds the drawn edge: top area = drawn to 0.5 %, watertight, read (not amber), no GAP:slab_outline_*', !bad2.length && rep.length > 0, `${rep.join(' ')} convert_ms=${tc} ${bad2.slice(0, 6).join(' ')}`);
  // E3: editable
  const R3 = S.writeStdSet(q, 'X', { slabEdge: { void_min_area: 0 } }), h0 = R.log.filter(l => /^§SLAB_EDGE /.test(l)).reduce((s, l) => s + Number(/holes_kept=(\d+)/.exec(l)[1]), 0), h3 = R3.log.filter(l => /^§SLAB_EDGE /.test(l)).reduce((s, l) => s + Number(/holes_kept=(\d+)/.exec(l)[1]), 0);
  const v3 = R3.log.filter(l => /^§SLAB_EDGE /.test(l)).every(l => / void_min=0 /.test(l));
  check('E3[' + name + ']', 'opts.slabEdge.void_min_area = 0: every hole no column or wall fills is drawn (>= the default count), the value stated in the log', v3 && h3 >= h0 && R3.log.some(l => /^§SLAB_EDGE /.test(l)), `holes_kept default=${h0} void_min_0=${h3}`);
  // E4 / E5: the layer stripped
  const f4 = files.map(f => /_FLOOR_/.test(f.name) ? { name: f.name, text: strip(f.text) } : f), still = f4.filter(f => /_FLOOR_/.test(f.name)).reduce((s, f) => s + drawnRings(f.text).length, 0);
  const o4 = I.convert(I.readSheets(f4), {});
  const s4 = o4.els ? o4.els.filter(e => e.class === 'IfcSlab') : [], est = o4.verdict ? o4.verdict.advisory.filter(a => /^GAP:slab_outline_/.test(a.code)).length : -1;
  check('E4[' + name + ']', 'falsifier: A-FLOR-OTLN stripped -> no slab from the edge; the slabs are the §D44 rectangle / §D51 estimate (or none + the gap) again', still === 0 && !!o4.els && !s4.some(e => e.layer === 'A-FLOR-OTLN') && (s4.length > 0 || est > 0),
    `stripped_rings_left=${still} slabs=${s4.length} (${s4.map(e => (e.prov || 'read') + ':' + topArea(e).toFixed(1)).join(',')}) slab_outline_gaps=${est}`);
  const key = e => e.class + '|' + JSON.stringify(e.vertices), A5 = o.els.filter(e => e.class !== 'IfcSlab').map(key).sort(), B5 = (o4.els || []).filter(e => e.class !== 'IfcSlab').map(key).sort();
  check('E5[' + name + ']', 'only slabs change: every non-slab element equal (class + vertices) with and without the layer', JSON.stringify(A5) === JSON.stringify(B5), `non_slab=${A5.length}/${B5.length}`);
});
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
