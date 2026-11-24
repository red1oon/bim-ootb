#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L41 (a scanned German set converts in the Modeller, prompts/DXF2BIM_MODELLER_LANE.md §L41). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the scan's 7 sheets (BIMCompiler scan2dxf.py, PDF2BIM_VECTOR_PROBE.md §46) were blocked by 11 rows no person could accept:
 * 9 QF:grid_missing (a dimensioned set has no grid) and the EG's slab_inner_face_conflict + slab_no_underside although every EG slab is drawn with its own top and thickness.
 *   S1  (L41a, pure)  QF:grid_missing accepted by a person leaves blocking and keeps its fields; falsifier: @BY=model is refused, the row still blocks.
 *   S2  (L41b, real sheets) every EG drawn piece states top + thickness: no slab_no_underside / slab_inner_face_conflict in blocking, ONE advisory
 *       GAP:slab_derivation_superseded naming them with the drawn and envelope areas; falsifier: one piece's thickness (group 39) stripped -> the rows block again.
 *   S3  (real sheets + library) the whole set qualifies: blocking 0, accepted = every dim + grid row, the house ground slab built at z -0.275..0.
 * Usage: node modeller/tests/witness_dxf_scan_set.js   (S2/S3 need SCAN_SET_DIR=<scan2dxf out>/std and SCAN_LIB_DIR=<export_library_subset.js --full dir/>; §SKIP without them: private client set)
 */
'use strict';
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
const Q = require(path.join(R, 'dxf2bim/dxf2qualify.js')), C = require(path.join(R, 'dxf2bim/dxf2shell_config.js')), DxfParser = require(path.join(R, 'lib/dxf-parser.js'));
const S = (C.STD && C.STD.QUALIFY) || C.QUALIFY;
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };

// ---- S1 pure: the qualifier's real entry, a small sheet, a fed QF:grid_missing row ----
const mark = (t, i) => ['0', 'TEXT', '5', (0x100 + i).toString(16).toUpperCase(), '8', 'DXF2BIM-MARK', '10', '-3000', '20', String(-2500 - 300 * i), '30', '0', '40', '150', '1', t];
const dxf = marks => new DxfParser().parseSync(['0', 'SECTION', '2', 'ENTITIES'].concat(...marks.map(mark), ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n');
const BASE = ['@UNITS=mm @BY=user', '@SET=STD @BY=user', '@VIEW=PLAN @BY=user', '@LEVEL=0 @BY=user'];
const GAPS = [{ code: 'QF:grid_missing', sheet: 'plan.dxf', shape: 'set', handle: '4' }];
const run = extra => Q.qualify({ files: [{ name: 'plan.dxf', dxf: dxf(BASE.concat(extra || [])), layer_maps: [] }], plan_ops: {}, gaps: GAPS, resolved: {} }, S);
const WHY = 'the first-release rule of this building type (owner),2026-11-23,a scanned Werkplan with no grid';
const s0 = run(), has = (v, c) => v.blocking.some(b => b.code === c);
if (!has(s0, 'QF:grid_missing')) { console.log('§VACUOUS the unmarked sheet does not block on the fed QF:grid_missing row: ' + JSON.stringify(s0.counts)); process.exit(2); }
const s1 = run(['@ACCEPT=QF:grid_missing,' + WHY + ' @BY=user']);
ok('S1 L41a QF:grid_missing accepted by a person leaves blocking, kept with who/when/why', !has(s1, 'QF:grid_missing') && (s1.accepted || []).some(a => a.code === 'QF:grid_missing' && a.accepted_by && a.accepted_by.date === '2026-11-23'), 'blocking ' + s0.blocking.length + ' -> ' + s1.blocking.length + ', accepted ' + (s1.accepted || []).length);
const s1f = run(['@ACCEPT=QF:grid_missing,' + WHY + ' @BY=model']);
ok('S1-F falsifier: @BY=model refused, the row still blocks', has(s1f, 'QF:accept_refused') && has(s1f, 'QF:grid_missing'));

// ---- S2 / S3: the real scan sheets ----
const DIR = process.env.SCAN_SET_DIR, LIB = process.env.SCAN_LIB_DIR;
if (!DIR || !fs.existsSync(DIR)) { console.log('§SKIP S2/S3: SCAN_SET_DIR not set or missing (the scanned set is a private client set, never committed)'); finish(); }
else (async () => {
  const I = require(path.join(R, 'dxf2bim_import.js')), P = require(path.join(R, 'dxf2prep.js'));
  const names = fs.readdirSync(DIR).filter(f => f.endsWith('.dxf')).sort(), text = Object.fromEntries(names.map(n => [n, fs.readFileSync(path.join(DIR, n), 'utf8')]));
  const convert = async T => {
    const read = I.readSheets(names.map(n => ({ name: n, text: T[n] })), { prep: P, prepChoices: {} });
    if (!LIB) return { R: I.convert(read, {}) };
    const fetchJson = async u => { try { return JSON.parse(fs.readFileSync(u.startsWith('/') ? u : path.join(LIB, u), 'utf8')); } catch (e) { return null; } };
    return I.loadOci(read, { base: LIB, fetchJson, convertOpts: { set: 'STD' } });
  };
  const SLABROWS = ['GAP:slab_no_underside', 'GAP:slab_inner_face_conflict'];
  const r = (await convert(text)).R, v = r.verdict, bl = c => v.blocking.filter(b => b.code === c).length;
  const sup = v.advisory.filter(a => a.code === 'GAP:slab_derivation_superseded');
  ok('S2 L41b drawn pieces with top+thickness: no EG slab derivation row blocks, one advisory names them with the areas',
    SLABROWS.every(c => !bl(c)) && sup.length === 1 && SLABROWS.every(c => JSON.stringify(sup[0]).includes(c)) && /drawn [0-9.]+ m2 of a [0-9.]+ m2/.test(JSON.stringify(sup[0])),
    'advisory: ' + (sup[0] ? sup[0].message + ' ' + JSON.stringify(sup[0].detail || {}).slice(0, 200) : 'none'));
  // falsifier: strip the thickness (group 39) of the FIRST A-FLOR-OTLN piece on plan_eg.dxf -> not every piece states it -> the rows are judged as before
  const eg = names.find(n => /plan_eg/.test(n)), t = text[eg].split('\n'); let k = t.findIndex((l, i) => l.trim() === 'A-FLOR-OTLN' && t[i - 1].trim() === '8'), cut = -1;
  for (let i = k; k >= 0 && i < t.length - 1; i += 1) { if (t[i].trim() === '39') { cut = i; break; } if (t[i].trim() === '0' && i > k) break; }
  if (cut < 0) ok('S2-F falsifier input: a thickness code on the EG slab piece', false, 'no group 39 after the first A-FLOR-OTLN');
  else {
    const T2 = Object.assign({}, text, { [eg]: t.slice(0, cut).concat(t.slice(cut + 2)).join('\n') }), v2 = (await convert(T2)).R.verdict;
    ok('S2-F falsifier: one piece without thickness -> the EG slab rows block again, no superseded advisory', SLABROWS.some(c => v2.blocking.some(b => b.code === c)) && !v2.advisory.some(a => a.code === 'GAP:slab_derivation_superseded'),
      'blocking ' + JSON.stringify(v2.blocking.filter(b => /slab/.test(b.code)).map(b => b.code)));
  }
  if (!LIB) { console.log('§SKIP S3: SCAN_LIB_DIR not set (a local library export with the DEWP families)'); return finish(); }
  const acc = v.accepted || [], codes = {}; acc.forEach(a => { codes[a.code] = (codes[a.code] || 0) + 1; });
  const els = r.els || [], hs = els.filter(e => e.class === 'IfcSlab' && e.storey === 'Level 1' && e.layer === 'A-FLOR-OTLN');
  const zr = e => { const z = e.vertices.map(q => q[2]); return [Math.round(Math.min(...z) * 1000), Math.round(Math.max(...z) * 1000)]; };   // vertices = [[x,y,z],...] in m
  ok('S3 the set qualifies: blocking 0, every accepted row a dimension or grid lack', v.verdict === 'qualifies' && v.blocking.length === 0 && acc.length > 0 && Object.keys(codes).every(c => /^QF:(dim_missing|dim_point_missing|elev_height_dim_missing|grid_missing)$/.test(c)),
    'verdict=' + v.verdict + ' blocking=' + v.blocking.length + ' accepted=' + acc.length + ' ' + JSON.stringify(codes) + ' elements=' + els.length);
  ok('S3b the house ground slab is built at z -275..0 (A-A base slab, READ-GEOM)', hs.some(e => { const z = zr(e); return z[0] === -275 && z[1] === 0; }), 'EG drawn slabs z(mm)=' + JSON.stringify(hs.map(zr)));
  // S4 (§L42, BIMCompiler §48): the entrance = a door + a side light in ONE wall gap: each fill on its own span, no size row; only when the set draws one
  const box = e => { const a = e.vertices; const r = i => [Math.min(...a.map(q => q[i])), Math.max(...a.map(q => q[i]))].map(v => Math.round(v * 1000)); return [r(0), r(1), r(2)]; };
  const sl = (r.els || []).filter(e => e.class === 'IfcWindow' && e.family_id && /x2275$/.test(e.family_id) && e.storey === 'Level 1');
  if (!sl.length) console.log('§SKIP S4: no side light in this set (sheets before BIMCompiler §48)');
  else {
    // BIMCompiler §52.2: every EG window is now x2275 (window doors), so the side light = the x2275 window a Level 1 door ends at (not merely the first x2275 window)
    const doorAt = Sb => (r.els || []).filter(e => e.class === 'IfcDoor' && e.storey === 'Level 1').map(e => [e, box(e)]).find(([e, b]) => b[1][0] === Sb[1][0] && Math.abs(b[0][1] - Sb[0][0]) <= 1);
    const si = Math.max(0, sl.findIndex(e => !!doorAt(box(e)))), S = box(sl[si]), D = doorAt(S);
    const fg = (r.fillGaps || []).filter(x => x.code === 'GAP:fill_size_mismatch');
    ok('S4 §L42 door + side light share one gap: the door ends where the side light starts, both 0..2275, no fill_size_mismatch', !!D && D[1][2][0] === 0 && S[2][0] === 0 && D[1][2][1] === S[2][1] && !fg.length,
      'door ' + (D ? JSON.stringify(D[1]) + ' ' + D[0].family_id : 'none') + ' | side light ' + JSON.stringify(S) + ' ' + sl[si].family_id + ' (of ' + sl.length + ' x2275 windows) | size rows ' + fg.length);
  }
  // S5 (§L43, BIMCompiler §50): a two-storey set that states a stair gets ONE IfcStairFlight on the lower storey, its treads inside the outline, the last tread one riser below the upper level
  const sf = (r.els || []).filter(e => e.class === 'IfcStairFlight'), stl = (r.stairs || [])[0];
  if (!(r.stairs || []).length && !sf.length) console.log('§SKIP S5: this set states no stair (sheets before BIMCompiler §50)');
  else {
    const b = sf[0] && box(sf[0]), up = 2855, n_ = stl && stl.info.risers;
    ok('S5 §L43 one IfcStairFlight on Level 1: 15 treads, top = 15/16 of the storey, inside the outline 5246..7447 x 5050..7432', sf.length === 1 && sf[0].storey === 'Level 1' && stl.treads.length === n_ - 1 && b[2][0] === 0 && Math.abs(b[2][1] - Math.round(up * (n_ - 1) / n_)) <= 1 &&
      b[0][0] >= 5246 - 1 && b[0][1] <= 7447 + 1 && b[1][0] >= -7432 - 1 && b[1][1] <= -5050 + 1,
      'box ' + JSON.stringify(b) + ' treads ' + (stl ? stl.treads.length : 0) + ' info ' + JSON.stringify(stl && stl.info));
  }
  // S6 (§L44) the stairwell: the Level 2 slab's top area = the full slab - the stair outline; falsifier: the same set without @STAIR keeps the full slab
  const topArea = e => { const V = e.vertices, zt = Math.max(...V.map(v => v[2])); let a = 0; for (const f of e.faces) { const [p, q, t] = f.map(i => V[i]); if ([p, q, t].every(v => Math.abs(v[2] - zt) < 1e-9)) a += Math.abs((q[0] - p[0]) * (t[1] - p[1]) - (t[0] - p[0]) * (q[1] - p[1])) / 2; } return a; };
  const s2 = (r.els || []).filter(e => e.class === 'IfcSlab' && e.storey === 'Level 2');
  if (!(r.stairs || []).length) console.log('§SKIP S6: no stair in this set');
  else {
    const T2 = Object.assign({}, text);
    for (const k of Object.keys(T2)) { const t = T2[k].split('\n'), i = t.findIndex(l => /^@STAIR=/.test(l.trim())); if (i < 0) continue;   // drop the whole @STAIR TEXT entity (from its '0' / 'TEXT' pair)
      let j = i; while (j > 0 && !(t[j].trim() === 'TEXT' && t[j - 1].trim() === '0')) j--; T2[k] = t.slice(0, j - 1).concat(t.slice(i + 1)).join('\n'); }
    const r0 = (await convert(T2)).R, s20 = (r0.els || []).filter(e => e.class === 'IfcSlab' && e.storey === 'Level 2');
    const a1 = s2.reduce((m, e) => m + topArea(e), 0), a0 = s20.reduce((m, e) => m + topArea(e), 0), hole = 2.201 * 2.382;
    ok('S6 §L44 the Level 2 slab has the stairwell: top area = full - the stair outline; without @STAIR the slab is full', s2.length === 1 && Math.abs(a0 - a1 - hole) < 1e-6 && !(r0.els || []).some(e => e.class === 'IfcStairFlight'),
      'full ' + a0.toFixed(6) + ' m2, with the stair ' + a1.toFixed(6) + ' m2, difference ' + (a0 - a1).toFixed(6) + ' vs outline ' + hole.toFixed(6));
  }
  finish();
})().catch(e => { console.log('§FAIL S2/S3 threw ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); fails++; finish(); });
function finish() { console.log('§RESULT judged=' + judged + ' fails=' + fails + ' ' + (!judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : judged ? 0 : 2); }
