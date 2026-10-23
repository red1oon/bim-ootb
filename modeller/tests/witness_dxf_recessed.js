#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RECESSED-WIN (rule D68, prompts/DXF2BIM_FOUNDATION_LANE.md §D68; architect review F16). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: the writer drew an opening on an elevation only when its host was a flush face wall and the reader gave a window a face only when it touched the plan envelope,
 * so a window in a recessed face (Clinic 34, JKR 10, LTU 335 by full-3D visibility) was never read off an elevation: the schedule masked it.
 *   R1 DRAWN    — the writer's recessed windows (§ELEV_WIN_RECESSED) > 0 where the model has seen recessed windows; each is seen: no wall / curtain wall in front covers its h x z rect (recomputed here).
 *   R2 READ     — every window op read from an elevation (from_elevation) has sill + height = its model window's (plan footprint, same storey) to 3 mm: 0 wrong; the recessed ones (face_recessed) > 0.
 *   R3 NO LOSS  — against BASE: no_elevation_for_face + no_elevation_match do not rise; the blocking total does not rise; windows read (any source) not fewer.
 *   R4 FALSIFIER — DXF_RECESSED_WIN=0 gives BASE's window ops back (count by source equal; no face_recessed op).
 *   R5 SAME     — a model with no IfcWindow: bodies byte-identical to BASE.
 *   R6 TIME     — writer + convert wall time against BASE (stated; a pairwise rule is timed on LTU).
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<modeller dir at origin/main> node modeller/tests/witness_dxf_recessed.js <Node model .db> [<more .db>]
 */
'use strict';
const path = require('path'), crypto = require('crypto'), cp = require('child_process'), M = process.env.MDIR || path.join(__dirname, '..');
const Database = require(path.join(process.env.HOME, 'bim-compiler/node_modules/better-sqlite3'));
const hashHex = s => crypto.createHash('sha256').update(s).digest('hex');
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const dbs = process.argv.slice(2).filter(a => a[0] !== '-'); if (!dbs.length) { say('MISSING input: a Node model .db (e.g. /tmp/db2/CLINIC2.db)'); process.exit(2); }
function load(dir) { const D = path.join(dir, 'dxf2bim') + '/';
  return { S: require(D + 'std2d.js'), Mk: require(D + 'std2d_marks.js'), MK: require(D + 'dxf2marks.js'), B: require(D + 'dxf2bim.js'), SHC: require(D + 'dxf2shell_config.js'), SC: require(D + 'std2d_scopes.js'),
    DxfParser: require(path.join(dir, 'lib/dxf-parser.js')), I: require(path.join(dir, 'dxf2bim_import.js')) }; }
function roundTrip(L, q) { const t0 = Date.now(), R = L.S.writeStdSet(q, 'X', {}), Dm = L.Mk.deriveMarks(R, { B: L.B, DxfParser: L.DxfParser, hashHex, MK: L.MK, SHC: L.SHC, SCOPES: L.SC }, { set: 'X' });
  const o = L.I.convert(L.I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))), {}); return { R, o, ms: Date.now() - t0 }; }
const winOps = o => [].concat(...(o.ST || []).map(st => st.after.filter(x => x.op_type === 'DXF_OPENING' && x.params.kind === 'window').map(x => ({ x, level: st.level }))));
const src = o => { const c = { elevation: 0, recessed: 0, schedule: 0, other: 0 }; winOps(o).forEach(({ x }) => { if (x.params.face_recessed) c.recessed++; if (x.params.from_elevation) c.elevation++; else if (x.params.height_source === 'schedule') c.schedule++; else c.other++; }); return c; };
const codes = v => { const m = {}; (v ? v.blocking : []).forEach(b => { m[b.code] = (m[b.code] || 0) + 1; }); return m; };
if (process.argv.includes('--count')) { const con = new Database(dbs[0], { readonly: true }), r = roundTrip(load(M), s => con.prepare(s).all()); say('§COUNT ' + JSON.stringify(src(r.o))); process.exit(0); }
const NEW = load(M), BASEL = process.env.BASE ? load(process.env.BASE) : null;
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const { R, o, ms } = roundTrip(NEW, q); if (!o.ST) { check('R0[' + name + ']', 'converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const m = R.model, W = m.els.filter(e => e.cls === 'IfcWindow'), rec = R.log.filter(l => /^§ELEV_WIN_RECESSED /.test(l));
  if (!W.length) {   // R5
    if (BASELL()) { const b = roundTrip(BASEL, q); check('R5[' + name + ']', 'no IfcWindow: bodies byte-identical to BASE', JSON.stringify(o.els.map(e => [e.guid, e.class, e.vertices])) === JSON.stringify(b.o.els.map(e => [e.guid, e.class, e.vertices])), `els=${o.els.length}`); }
    else say('INCONCLUSIVE R5[' + name + '] no BASE');
    return;
  }
  // R1: recompute the expected set independently (a window in a wall, the wall not flush on the faces along its run, nothing in front covering its h x z rect) and compare with the writer's log
  const FN = { LEFT: ['x0', e => e.x0, e => e.x1, 'y'], RIGHT: ['x1', e => -e.x1, e => -e.x0, 'y'], FRONT: ['y0', e => e.y0, e => e.y1, 'x'], REAR: ['y1', e => -e.y1, e => -e.y0, 'x'] };
  const gs = m.storeys.find(s => s.name === m.grid_storey), gw = m.walls.filter(w => w.storey === m.grid_storey);
  const env = { x0: Math.min(...gw.map(w => w.x0)), x1: Math.max(...gw.map(w => w.x1)), y0: Math.min(...gw.map(w => w.y0)), y1: Math.max(...gw.map(w => w.y1)) };
  const covers = m.walls.concat(m.curtains || []), want = new Set();
  W.forEach(e => { const h = m.by_guid[m.host_all[e.guid]]; if (!h || !/^IfcWall/.test(h.cls)) return; const ax = (e.x1 - e.x0) >= (e.y1 - e.y0) ? 'x' : 'y', perp = ax === 'x' ? ['y0', 'y1'] : ['x0', 'x1'];
    const se = m.rules && m.rules.l118 ? (() => { const sw = m.walls.filter(w => w.storey === h.storey); return sw.length ? { x0: Math.min(...sw.map(w => w.x0)), x1: Math.max(...sw.map(w => w.x1)), y0: Math.min(...sw.map(w => w.y0)), y1: Math.max(...sw.map(w => w.y1)) } : null; })() : null;   // §L1.18 a stepped storey's own face
    if (perp.some(s => Math.abs(h[s] - env[s]) <= 0.010 || (se && Math.abs(h[s] - se[s]) <= 0.010))) return;
    const run = o => ax === 'x' ? [o.x0, o.x1] : [o.y0, o.y1], r0 = run(e);   // the stated twin rule: another window in another wall on the same run (its storey, or touching in z) is not drawn recessed
    if (W.some(o => o !== e && m.host_all[o.guid] !== m.host_all[e.guid] && (o.storey === e.storey || (o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002)) && ((o.x1 - o.x0) >= (o.y1 - o.y0)) === (ax === 'x') && Math.abs(run(o)[0] - r0[0]) <= 0.002 && Math.abs(run(o)[1] - r0[1]) <= 0.002)) return;
    Object.keys(FN).filter(f => FN[f][3] === ax).forEach(f => { const F = FN[f], a0 = ax === 'x' ? e.x0 : e.y0, a1 = ax === 'x' ? e.x1 : e.y1, n0 = F[1](e);
      if (W.some(o => o !== e && F[1](o) < n0 - 0.010 && run(o)[0] <= a1 + 0.002 && run(o)[1] >= a0 - 0.002 && o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002)) return;   // the stated rule: a window behind another window's glazing is not drawn
      if (!covers.some(c => c.guid !== h.guid && F[2](c) <= n0 + 0.010 && (ax === 'x' ? c.x0 <= a0 + 1e-6 && c.x1 >= a1 - 1e-6 : c.y0 <= a0 + 1e-6 && c.y1 >= a1 - 1e-6) && c.z0 <= e.z0 + 1e-6 && c.z1 >= e.z1 - 1e-6)) want.add(f + ' ' + e.guid); }); });
  const got = new Set(rec.map(l => l.split(' ')[1] + ' ' + /guid=(\S+)/.exec(l)[1])), miss = [...want].filter(k => !got.has(k)), extra = [...got].filter(k => !want.has(k));
  check('R1[' + name + ']', 'the writer draws exactly the recessed windows a face sees (recomputed here)', !miss.length && !extra.length, `recessed_drawn=${got.size} expected=${want.size} missing=${miss.length} extra=${extra.length} per_face=${JSON.stringify(rec.reduce((a, l) => { const f = l.split(' ')[1]; a[f] = (a[f] || 0) + 1; return a; }, {}))} ${miss.concat(extra).slice(0, 2).join(';')}`);
  // R2: every elevation-read window = its model window(s) (plan footprint inside the op bbox + 0.05 m, z inside the storey) to 3 mm
  const ops = winOps(o).filter(({ x }) => x.params.from_elevation), lvls = o.ST.map(st => st.level).sort((a, b) => a - b);
  let wrong = 0, unmatched = 0, nRec = 0; const bad = [];
  ops.forEach(({ x, level }) => { const b = x.params.bbox, top = lvls.find(l => l > level + 0.01), z0 = level + x.params.sill, z1 = z0 + x.params.height; if (x.params.face_recessed) nRec++;
    const ms = W.filter(e => e.x0 >= b[0] - 0.05 && e.x1 <= b[2] + 0.05 && e.y0 >= b[1] - 0.05 && e.y1 <= b[3] + 0.05 && e.z0 >= level - 0.05 && (top === undefined || e.z0 < top - 0.01));
    if (!ms.length) { unmatched++; return; }
    const ok = ms.some(e => Math.abs(e.z0 - z0) <= 0.003 && Math.abs(e.z1 - z1) <= 0.003) || (Math.abs(Math.min(...ms.map(e => e.z0)) - z0) <= 0.003 && Math.abs(Math.max(...ms.map(e => e.z1)) - z1) <= 0.003);
    if (!ok) { wrong++; if (bad.length < 8) bad.push(`${x.params.handle}${x.params.face_recessed ? '(rec)' : ''} read ${z0.toFixed(3)}..${z1.toFixed(3)} model ${ms.map(e => e.z0.toFixed(3) + '..' + e.z1.toFixed(3)).join('/')}`); } });
  check('R2[' + name + ']', 'every window read off an elevation = its model window to 3 mm (0 wrong), recessed ones read', wrong === 0 && (want.size === 0 || nRec > 0), `from_elevation=${ops.length} recessed=${nRec} wrong=${wrong} no_model_match=${unmatched} ${bad.join('; ')}`);
  const cNew = src(o); say(`§D68 ${name} windows_by_source ${JSON.stringify(cNew)} new_ms=${ms}`);
  if (BASEL) { const b = roundTrip(BASEL, q), c0 = codes(b.o.verdict), c1 = codes(o.verdict), cBase = src(b.o), nb = winOps(b.o).length, nn = winOps(o).length;
    const k = c => (c['GAP:no_elevation_for_face'] || 0) + (c['GAP:no_elevation_match'] || 0);
    check('R3[' + name + ']', 'no loss against BASE: face / match gaps and the blocking total do not rise; windows read not fewer', k(c1) <= k(c0) && o.verdict.blocking.length <= b.o.verdict.blocking.length && nn >= nb,
      `face+match ${k(c0)}->${k(c1)} blocking ${b.o.verdict.blocking.length}->${o.verdict.blocking.length} windows ${nb}->${nn} base_by_source ${JSON.stringify(cBase)}`);
    say(`§D68-TIME ${name} base_ms=${b.ms} new_ms=${ms}`);
    const r = cp.spawnSync('node', [__filename, db, '--count'], { encoding: 'utf8', env: Object.assign({}, process.env, { DXF_RECESSED_WIN: '0' }) }), off = JSON.parse((/§COUNT (.*)/.exec(r.stdout || '') || [0, 'null'])[1]);
    check('R4[' + name + ']', 'FALSIFIER DXF_RECESSED_WIN=0: BASE\'s window ops by source come back, no recessed op', off && JSON.stringify(off) === JSON.stringify(cBase) && off.recessed === 0, `off=${JSON.stringify(off)} base=${JSON.stringify(cBase)}`);
  } else say('INCONCLUSIVE R3/R4[' + name + '] no BASE');
});
function BASELL() { return BASEL; }
say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
