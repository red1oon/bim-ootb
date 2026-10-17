#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-L116-BACK: prompts/DXF2BIM_MODELLER_LANE.md §L1.16. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a wing drawn rotated (set written with `wing`, markings carry @FRAME) is imported by the Modeller importer and turned back
 * into place: every baked body lands where the SAME building drawn straight, rotated by +angle, puts it. The synthetic building is the Duplex rotated in memory by ANGLE.
 *   B1 FRAME    — frameOfSheets reads @FRAME from the wing set's sheets (angle, centre) and nothing from the straight set.
 *   B2 BODIES   — wing import (frame = the marking) vs straight import baked with angle 0 and then rotated by +ANGLE about the same centre: same body count, same classes,
 *                 every body's world vertex set equal within TOL (1e-4 m, DXF is mm with 3 decimals).
 *   B4 VERDICT  — the reader's verdict (blocking codes with counts) on the wing set equals the one on the straight set: no rule may change what the reader sees as a door/window.
 *   B3 CONTROL  — the same wing import with the frame IGNORED (not turned back) must NOT match (the witness can see a missing rotation).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_wing_back.js <Node model .db> [ANGLE=30]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const initSqlJs = require('sql.js');
const M = path.join(__dirname, '..'), D = path.join(M, 'dxf2bim') + '/';
const S = require(D + 'std2d.js'), Mk = require(D + 'std2d_marks.js'), MK = require(D + 'dxf2marks.js'), B = require(D + 'dxf2bim.js'), SHC = require(D + 'dxf2shell_config.js');
const DxfParser = require(path.join(M, 'lib/dxf-parser.js')), I = require(path.join(M, 'dxf2bim_import.js'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const db = process.argv[2], ANG = Number(process.argv[3] || 30), TOL = 1e-4;
  const SQL = await initSqlJs(), sdb = new SQL.Database(new Uint8Array(fs.readFileSync(db)));
  const q = sql => { const r = sdb.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const w0 = S.loadModel(q, { add() {}, gap() {} }).walls, e0 = [Math.min(...w0.map(a => a.x0)), Math.max(...w0.map(a => a.x1)), Math.min(...w0.map(a => a.y0)), Math.max(...w0.map(a => a.y1))], O = [(e0[0] + e0[1]) / 2, (e0[2] + e0[3]) / 2];
  const pre = m => S.rotateModel(m, ANG, O[0], O[1]);
  const run = (R, opts) => {
    const Dm = Mk.deriveMarks(R, { B, DxfParser, hashHex, MK, SHC }, { set: 'W' }), sheets = I.readSheets(Object.keys(Dm.files).map(f => ({ name: f, text: Dm.files[f] })));
    const out = I.convert(sheets, {}), frame = I.frameOfSheets(sheets);
    return { out, frame, T: I.toOps(out, Object.assign({ hashHex }, opts(frame))) };
  };
  const straight = run(S.writeStdSet(q, 'W'), () => ({ frame: { angle: 0, ox: 0, oy: 0 } }));       // baked, not turned
  const wing = run(S.writeStdSet(q, 'W', { wing: { name: 'W' }, premodel: pre }), f => ({ frame: f }));
  const ignored = run(S.writeStdSet(q, 'W', { wing: { name: 'W' }, premodel: pre }), () => ({ frame: { angle: 0, ox: 0, oy: 0 } }));
  check('B1 FRAME', '@FRAME not read from the wing set, or read from a straight set', straight.frame === null && wing.frame && !wing.frame.error && Math.abs(wing.frame.angle - (ANG % 90)) <= 1, `straight=${JSON.stringify(straight.frame)} wing=${JSON.stringify(wing.frame)}`);
  const th = ANG * Math.PI / 180, co = Math.cos(th), si = Math.sin(th);
  const world = a => { const out = []; for (let i = 0; i < a.v.length; i += 3) out.push([a.v[i] + a.centre[0], a.v[i + 1] + a.centre[1], a.v[i + 2] + a.centre[2]]); return out; };
  const bodies = (T, rotate) => T.assets.map(a => ({ cls: (T.inserts[T.assets.indexOf(a)] || { params: {} }).params.ifc_class || '?',
    pts: world(a).map(p => rotate ? [co * (p[0] - O[0]) - si * (p[1] - O[1]) + O[0], si * (p[0] - O[0]) + co * (p[1] - O[1]) + O[1], p[2]] : p) }));
  // two bodies match when they have the same class and vertex count and every vertex of one has a vertex of the other within TOL (symmetric Hausdorff); nearest-first greedy, no quantising
  const dist = (P, Q) => { let w = 0; for (const p of P) { let m = Infinity; for (const q of Q) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < m) m = d; } if (m > w) w = m; } return w; };
  const match = (X, Y) => { const used = new Set(); let bad = 0, worst = 0;
    X.forEach(x => { let bi = -1, bd = Infinity; Y.forEach((y, j) => { if (used.has(j) || y.cls !== x.cls || y.pts.length !== x.pts.length) return;
      const c = (P => P.reduce((s2, p) => [s2[0] + p[0], s2[1] + p[1]], [0, 0]).map(v => v / P.length)); const cx = c(x.pts), cy = c(y.pts); if (Math.hypot(cx[0] - cy[0], cx[1] - cy[1]) > 0.05) return;
      const d = Math.max(dist(x.pts, y.pts), dist(y.pts, x.pts)); if (d < bd) { bd = d; bi = j; } });
      if (bi < 0 || bd > TOL) bad++; else { used.add(bi); worst = Math.max(worst, bd); } });
    return { bad, worst }; };
  const A = bodies(straight.T, true), Bv = bodies(wing.T, false), mAB = match(A, Bv), miss = mAB.bad;
  check('B2 BODIES', 'a wing body is not where the straight building rotated by +angle puts it', A.length === Bv.length && A.length > 0 && miss === 0, `straight bodies=${A.length} wing bodies=${Bv.length} unmatched=${miss} worst vertex deviation=${mAB.worst.toExponential(2)} m (TOL ${TOL} m) fills straight=${straight.T.fills.length} wing=${wing.T.fills.length}`);
  const missI = match(A, bodies(ignored.T, false)).bad;
  const codes = r => { const m = {}; (r.out.verdict ? r.out.verdict.blocking : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
  check('B4 VERDICT', 'the wing set is judged differently by the reader than the same building drawn straight (a rule changed what a door/window looks like: the L1.20 lesson)', codes(straight) === codes(wing) && !!wing.out.verdict, `straight=${codes(straight)} wing=${codes(wing)} verdicts ${straight.out.verdict && straight.out.verdict.verdict}/${wing.out.verdict && wing.out.verdict.verdict}`);
  check('B3 CONTROL', 'ignoring @FRAME (no turn-back) still matches: the witness cannot see the rotation', missI > 0, `unmatched without the turn-back=${missI}`);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
