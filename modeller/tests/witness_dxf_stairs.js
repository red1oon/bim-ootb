#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-STAIRS: prompts/DXF2BIM_FOUNDATION_LANE.md F7 (stairs on the plan sheets). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a plan sheet draws a stair's treads and its up direction FROM THE STAIR'S OWN MESH (no tread count assumed), only for the steps between the storey floor and the cut plane;
 * a building without stairs is untouched, a sheet without stairs is untouched, and the reader judges the set exactly as before.
 *   S1 NONE    — opts.stairSymbol=false is the legacy output; a model with no stair gives byte-identical files with the symbol on.
 *   S2 STEPS   — per stair on a plan: the drawn step count equals the number of distinct heights of up-facing horizontal faces between the floor and the cut plane, counted here independently from the mesh.
 *   S3 ARROW   — one arrowhead (closed 3-point polyline) and one 'UP' per stair with 2+ steps; the path starts at the lowest step and ends at the highest.
 *   S4 SCOPE   — files of the set that hold no stair are byte-identical with the symbol on and off.
 *   S5 READER  — the importer's blocking codes are identical with the symbol on and off (the new entities are on a layer it already knows, and add no gap).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_stairs.js <Node model .db>
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/', S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js')), hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2])));
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const m0 = S.loadModel(q, { add() {}, gap() {} }), stairs = m0.els.filter(e => /^IfcStair/.test(e.cls)), fam = S.wingAngles(m0);
  const opt = on => (fam.length ? { wing: { name: 'W', angle: fam[0].deg }, stairSymbol: on ? undefined : false } : { stairSymbol: on ? undefined : false });
  const on = S.writeStdSet(q, 'T', opt(true)), off = S.writeStdSet(q, 'T', opt(false));
  say('stairs in the model: ' + stairs.length);
  if (!stairs.length) { check('S1', 'no stair: byte-identical with the symbol on and off', Object.keys(on.files).every(k => on.files[k] === off.files[k]), Object.keys(on.files).length + ' files'); say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0); }
  // independent recount from the mesh: distinct heights (1 mm) of up-facing horizontal faces in [elev, cutZ]
  const stepsOf = (e, lo, hi) => { const z = new Set(); for (let t = 0; t + 2 < e.f.length; t += 3) { const P = [0, 1, 2].map(i => [e.v[e.f[t + i] * 3], e.v[e.f[t + i] * 3 + 1], e.v[e.f[t + i] * 3 + 2]]), u = P[1].map((v, k) => v - P[0][k]), w = P[2].map((v, k) => v - P[0][k]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n); if (l > 1e-12 && n[2] / l >= 0.99) { const zz = (P[0][2] + P[1][2] + P[2][2]) / 3 + e.c[2]; if (zz >= lo - 0.002 && zz <= hi + 0.002) z.add(Math.round(zz * 1000)); } } return z.size; };
  const logged = on.log.filter(l => /§STAIR_STEPS/.test(l)).map(l => ({ g: /guid=(\S+)/.exec(l)[1], n: Number(/steps=(\d+)/.exec(l)[1]) }));
  const cutOf = {}; (on.model || {}).els; const stor = S.planStoreys(on.model);
  let okSteps = true, detail = []; logged.forEach(L => { const e = on.model.by_guid[L.g], hits = stor.filter(s => e.z0 < s.elev + 1.2 && e.z1 > s.elev + 1.2).map(s => stepsOf(e, s.elev, s.elev + 1.2)); const want = hits.filter(h => h > 0); if (!want.includes(L.n)) okSteps = false; detail.push(L.n + '/' + want.join('|')); });
  check('S2', 'drawn step count == independent distinct-height count (floor..cut plane), per stair', logged.length > 0 && okSteps, 'stairs drawn=' + logged.length + ' (drawn/independent) ' + detail.slice(0, 8).join(' '));
  const planF = Object.keys(on.files).filter(f => on.views.plan.some(v => f.endsWith('_' + v.view + '_std.dxf'))),   // the set's own plan sheets (a storey need not be called 'Level': LTU's are 'VÅNING n')
    arrows = f => (on.files[f].match(/A-FLOR-STRS\n100\nAcDbPolyline\n90\n3\n70\n1\n/g) || []).length, ups = f => (on.files[f].match(/\n1\nUP\n/g) || []).length;
  const nArrow = planF.reduce((a, f) => a + arrows(f), 0), nUp = planF.reduce((a, f) => a + ups(f), 0), want2 = logged.filter(L => L.n >= 2).length;
  check('S3', 'one arrowhead and one UP per stair with 2+ steps', nArrow === want2 && nUp === want2, `arrowheads=${nArrow} UP=${nUp} stairs(2+)=${want2}`);
  const diff = Object.keys(on.files).filter(k => on.files[k] !== off.files[k]), hold = Object.keys(on.files).filter(f => /A-FLOR-STRS/.test(on.files[f]) && /\n1\nUP\n/.test(on.files[f]));
  check('S4', 'only sheets that hold a stair differ from the symbol off', diff.length > 0 && diff.every(k => hold.includes(k)) && hold.every(k => diff.includes(k)), `differ=${diff.length} hold-stairs=${hold.length}`);
  const verdict = R => { const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'T' }), out = I.convert(I.readSheets(Object.keys(Dm.files).map(f => ({ name: f, text: Dm.files[f] }))), {}), c = {}; (out.verdict ? out.verdict.blocking : []).forEach(b => { c[b.code] = (c[b.code] || 0) + 1; }); return JSON.stringify(c); };
  const vOn = verdict(on), vOff = verdict(off);
  check('S5', 'the reader judges the set identically with and without the symbol', vOn === vOff && vOn.length > 2, vOn.slice(0, 140));
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})();
