#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WIN-SCHED (rules D24 / D24b, prompts/DXF2BIM_FOUNDATION_LANE.md §F8). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a window on no envelope face (courtyard, inner corner, interior glazing) had no height source on our 2D sets: the reader took sill / head
 * ONLY from the four envelope elevations (`GAP:no_elevation_for_face`: LTU 809, Clinic 18, Hospital wings 12 / 31 / 38), and our writer wrote no window schedule.
 *   S1 SCHEDULE — every window drawn on a plan with a gap carries one @TAG=window,<label> (or a stated §MARK_GAP) and its label one 5-value @SCHEDULE=<label>,window,w,h,sill.
 *   S2 VALUES   — each schedule entry equals the model: w = the gap the writer cut (0.1 mm), h = the window's z extent, sill = z0 minus the storey elevation (0.1 mm).
 *   S3 READ     — every window the reader resolves from the schedule (height_source=schedule) has the model's sill and height (1 mm) (matched by its plan centre).
 *   S4 ELEV WINS — a window on an elevated face keeps its elevation: the count of windows read from an elevation is the same with and without the window schedule.
 *   S5 IN WALL  — a window read inside a thicker wall band (D24b) gets a void whose band contains the window band and lies within both bounding pieces.
 *   INFO        — no_elevation_for_face before (schedule stripped) / after.
 * Usage: NODE_PATH=<dir with better-sqlite3 + sql.js> node modeller/tests/witness_dxf_window_schedule.js <Node model .db> [FI]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const con = new Database(process.argv[2], { readonly: true }), q = s => con.prepare(s).all(), FI = process.argv[3];
const m0 = S.loadModel(q, { add() {}, gap() {} }), fam = S.wingAngles(m0), opts = FI !== undefined && FI !== 'none' ? { wing: { angle: fam[+FI].deg, name: 'W' } } : undefined;
const R = S.writeStdSet(q, 'X', opts), Mo = R.model, Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X' });
const read = files => { const sh = I.readSheets(Object.keys(files).map(n => ({ name: n, text: files[n] }))); return { sh, out: I.convert(sh, {}) }; };
const A = read(Dm.files);
const B0 = read(Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'X', windowSchedule: false }).files);   // the same set without the window schedule + tags
const gapsOf = o => (o.verdict ? o.verdict.blocking : []).filter(b => b.code === 'GAP:no_elevation_for_face').length;
say(`INFO no_elevation_for_face without the window schedule ${gapsOf(B0.out)} -> with ${gapsOf(A.out)}   blocking ${B0.out.verdict ? B0.out.verdict.blocking.length : '-'} -> ${A.out.verdict ? A.out.verdict.blocking.length : '-'}`);
// S1 / S2 from the marked sheets
const alongOf = {}; R.log.forEach(l => { if (l.indexOf('§OPENING ') !== 0 || l.indexOf('cls=IfcWindow') < 0 || / pos=above /.test(l)) return; const a = /along=\(([-\d.]+),([-\d.]+)\)/.exec(l) || /along=([-\d.]+)\.\.([-\d.]+)/.exec(l); if (a) alongOf[/guid=(\S+)/.exec(l)[1]] = Math.abs(+a[2] - +a[1]); });
let nWin = 0, untagged = [], badVal = [], refusedStated = Dm.log.filter(l => /SCHEDULE window .*REFUSED|§MARK_GAP TAG window/.test(l)).length;
R.views.plan.forEach(({ view, storey }) => { const name = Object.keys(Dm.files).find(n => n.endsWith('_' + view + '_std.dxf')); if (!name) return; const txt = Dm.files[name];
  const sched = {}; (txt.match(/@SCHEDULE=[^\n]*,window,[^\n]*/g) || []).forEach(t => { const v = t.replace(/ @BY=\w+$/, '').slice(10).split(','); sched[v.slice(0, -5).join(',') || v[0]] = v.slice(-4).map(Number); });
  const tags = (txt.match(/@TAG=window,[^\n]*/g) || []).map(t => t.replace(/ @BY=\w+$/, '').slice(12));
  Mo.els.filter(e => e.cls === 'IfcWindow' && e.storey === storey.name && alongOf[e.guid] !== undefined).forEach(e => { nWin++;
    const mine = Object.keys(sched).filter(l => l === e.etype || l.indexOf(e.etype + ' [') === 0);
    if (!mine.length) { untagged.push(e.guid); return; }
    const want = [alongOf[e.guid], (e.z1 - e.z0) * 1000, (e.z0 - storey.elev) * 1000];
    if (!mine.some(l => sched[l].length === 4 && sched[l].slice(1).every((v, i) => Math.abs(v - want[i]) <= 0.1 + 1e-6))) badVal.push(e.guid + ':' + want.map(v => v.toFixed(1)).join('/'));
  });
  if (!tags.length && Object.keys(sched).length) untagged.push(name + ':no_tags'); });
check('S1', 'every plan window with a gap has its label in a 5-value window @SCHEDULE on its plan (refusals stated)', nWin === 0 || untagged.length <= refusedStated, `windows=${nWin} unscheduled=${untagged.length} stated_refusals=${refusedStated} ${untagged.slice(0, 3).join(' ')}`);
check('S2', 'every schedule entry equals the model (gap width, z extent, sill above the storey; 0.1 mm)', badVal.length === 0, `bad=${badVal.length} ${badVal.slice(0, 3).join(' ')}`);
// S3 / S4 / S5 from the reader's ops
let fromSched = 0, schedBad = [], inBand = 0, bandBad = [], elevA = 0, elevB = 0;
const opsOf = out => { const st = out.ST || []; return [].concat(...st.map(s => (s.after || []).map(o => ({ o, s })))); };
const lvlOf = s => s.level;
opsOf(A.out).forEach(({ o, s }) => { const P = o.params || {}; if (o.op_type !== 'DXF_OPENING' || P.kind !== 'window') return;
  if (P.from_elevation) elevA++;
  if (P.height_source === 'schedule') { fromSched++; const bb = P.bbox, w = Mo.els.find(e => e.cls === 'IfcWindow' && (e.x0 + e.x1) / 2 >= bb[0] - 0.01 && (e.x0 + e.x1) / 2 <= bb[2] + 0.01 && (e.y0 + e.y1) / 2 >= bb[1] - 0.01 && (e.y0 + e.y1) / 2 <= bb[3] + 0.01 && Math.abs(e.z0 - (lvlOf(s) + P.sill)) <= 0.001);
    if (!w || Math.abs((w.z1 - w.z0) - P.height) > 0.001) schedBad.push(P.handle); }
  if (P.in_wall_band) { inBand++; const bb = P.bbox, hz = (bb[2] - bb[0]) >= (bb[3] - bb[1]), ci = hz ? 1 : 0; if (!(P.in_wall_band[0] <= bb[ci] + 0.011 && P.in_wall_band[1] >= bb[ci + 2] - 0.011)) bandBad.push(P.handle); } });
opsOf(B0.out).forEach(({ o }) => { if (o.op_type === 'DXF_OPENING' && o.params && o.params.kind === 'window' && o.params.from_elevation) elevB++; });
const exposed = opsOf(A.out).length > 0;
check('S3', 'every window resolved from the schedule has the model sill and height (1 mm)', exposed && schedBad.length === 0, `from_schedule=${fromSched} bad=${schedBad.length} ${schedBad.slice(0, 3).join(' ')}${exposed ? '' : ' (reader ops not exposed)'}`);
check('S4', 'windows on elevated faces keep their elevation (count equal with and without the schedule)', exposed && elevA === elevB, `from_elevation with=${elevA} without=${elevB}`);
check('S5', 'a window read inside a thicker wall band (D24b) gets a band containing the window band', exposed && bandBad.length === 0, `in_wall_band=${inBand} bad=${bandBad.length} ${bandBad.slice(0, 3).join(' ')}`);
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
