#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-NORTH: prompts/DXF2BIM_FOUNDATION_LANE.md F7 (north on the plan sheets). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a plan / roof sheet carries a north arrow ONLY when a real north is stated (true_north_source = 'ifc_truenorth'), it points where true north is IN THE SHEET'S
 * FRAME (turned with the wing), and a building with no stated north says so in words instead of drawing a guess. Asking for no north leaves every sheet byte-identical.
 *   N1 LEGACY  — opts.north undefined: every file equals the file written with no north option at all.
 *   N2 ARROW   — north {5 deg, ifc_truenorth}: every plan and the roof sheet has the arrow (circle + 'N' + 'TRUE NORTH (ifc_truenorth)'); the logged sheet vector equals the model vector (-sin B, cos B) turned by -turn,
 *                for turn 0 / 90 / 180 / 270 and a 70 deg wing.
 *   N3 UNSTATED— north null, source 'default_zero', 'malformed_truenorth_ignored', a missing angle: no arrow, the words 'NORTH NOT STATED' on every plan and the roof sheet.
 *   N4 CONTROL — the arrow differs between turn 0 and turn 180 (the witness can see a missing turn).
 * Usage: NODE_PATH=<dir with sql.js> node modeller/tests/witness_dxf_north.js <Node model .db>
 */
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js'), S = require(path.join(__dirname, '..', 'dxf2bim', 'std2d.js'));
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2])));
  const q = sql => { const r = db.exec(sql); if (!r.length) return []; return r[0].values.map(v => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))); };
  const fam = S.wingAngles(S.loadModel(q, { add() {}, gap() {} }))[0].deg, W = t => ({ name: 'W', angle: fam, turn: t });
  const planFiles = R => Object.keys(R.files).filter(f => /FLOOR_LEVEL|ROOF/.test(f)), has = (R, re) => planFiles(R).every(f => re.test(R.files[f]));
  const a = S.writeStdSet(q, 'N', { wing: W(0) }), b = S.writeStdSet(q, 'N', { wing: W(0), north: undefined });
  check('N1', 'north undefined: every sheet byte-identical', Object.keys(a.files).every(k => a.files[k] === b.files[k]) && !/NORTH/.test(Object.values(a.files).join('')), Object.keys(a.files).length + ' sheets');
  const B = 5, tn = [-Math.sin(B * Math.PI / 180), Math.cos(B * Math.PI / 180)], vecs = {};
  [0, 90, 180, 270].forEach(t => {
    const R = S.writeStdSet(q, 'N', { wing: W(fam + t), north: { angle: B, source: 'ifc_truenorth' } }), line = R.log.filter(l => /§NORTH stated/.test(l))[0] || '', m = /sheet_arrow=\(([-\d.]+),([-\d.]+)\)/.exec(line), ang = R.wing.angle * Math.PI / 180;
    const want = [Math.cos(-ang) * tn[0] - Math.sin(-ang) * tn[1], Math.sin(-ang) * tn[0] + Math.cos(-ang) * tn[1]]; vecs[t] = m && [Number(m[1]), Number(m[2])];
    check('N2', 'turn ' + t + ': the arrow is on every plan + roof sheet and points where true north is in the sheet frame', has(R, /TRUE NORTH \(ifc_truenorth\)/) && m && Math.hypot(vecs[t][0] - want[0], vecs[t][1] - want[1]) < 1e-4, `sheets=${planFiles(R).length} logged=${m ? m[1] + ',' + m[2] : 'none'} expected=${want.map(v => v.toFixed(5))}`);
  });
  [['null', null], ['default_zero', { angle: 0, source: 'default_zero' }], ['malformed', { angle: -90, source: 'malformed_truenorth_ignored' }], ['no angle', { source: 'ifc_truenorth' }]].forEach(([nm, n]) => {
    const R = S.writeStdSet(q, 'N', { wing: W(fam), north: n });
    check('N3', nm + ': no arrow, the words NORTH NOT STATED on every plan + roof sheet', has(R, /NORTH NOT STATED/) && !/TRUE NORTH \(/.test(Object.values(R.files).join('')), 'sheets=' + planFiles(R).length);
  });
  check('N4', 'CONTROL the arrow of turn 0 and turn 180 differ', vecs[0] && vecs[180] && Math.hypot(vecs[0][0] - vecs[180][0], vecs[0][1] - vecs[180][1]) > 1, JSON.stringify([vecs[0], vecs[180]]));
  const sb = S.writeStdSet(q, 'N', { wing: W(fam), scaleBar: true }), plain = S.writeStdSet(q, 'N', { wing: W(fam) });
  const barLen = t => { const m = /\n0\nLINE\n[^]*?8\nA-ANNO-TTLB\n[^]*?10\n([-\d.]+)\n20\n([-\d.]+)\n30\n0.0\n11\n([-\d.]+)\n21\n([-\d.]+)\n/g; let r, best = null; while ((r = m.exec(t))) { const L = Math.hypot(r[3] - r[1], r[4] - r[2]); if (Math.abs(L - 5000) < 1e-6) best = L; } return best; };
  check('N5', 'scaleBar: a 5 m bar (5000 mm sheet units at 1:100) and the labels 0 / 5 m on every plan + roof sheet; none without the option', planFiles(sb).every(f => barLen(sb.files[f]) === 5000 && /\n1\n5 m\n/.test(sb.files[f])) && !planFiles(plain).some(f => /\n1\n5 m\n/.test(plain.files[f])), 'sheets=' + planFiles(sb).length);
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})();
