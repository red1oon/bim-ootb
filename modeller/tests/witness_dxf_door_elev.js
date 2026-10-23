#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-ELEV (rule D74, prompts/DXF2BIM_FOUNDATION_LANE.md §D74). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: a door's height was read off an elevation almost never (Duplex 0 of 14, Clinic 0 of 244, LTU 6 of 571): the pairing used the plan leaf span against an elevation box that carries the casing,
 * the door pass lost every host wall the height pass had swapped for a gap, and the writer drew no recessed door. The schedule masked it.
 *   D2 DRAWN    — the writer's recessed doors (§ELEV_DOOR_RECESSED) = the witness's own recount (a door in a wall, not flush, nothing in front, the stated refusals among doors), guid by guid.
 *   D4 READ     — every door read off an elevation has height = its model door's z-range to 3 mm: 0 wrong.
 *   D5 NO LOSS  — against BASE: doors, elevation-read doors, blocking and height gaps do not get worse.
 *   D6 FALSIFIER — DXF_RECESSED_DOOR=0 gives no recessed read; DXF_DOORBOX=0 as well gives fewer elevation reads.
 *   D8 FILLS    — with the library (OCI; unreachable -> INCONCLUSIVE) the Duplex fills/types do not get worse: an elevation-read door binds by its leaf height.
 *   D7 SAME     — window ops byte-identical to BASE.
 * Usage: NODE_PATH=<dir with better-sqlite3> BASE=<modeller dir at origin/main> node modeller/tests/witness_dxf_door_elev.js <Node model .db> [<more .db>]
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

const doorOps = o => [].concat(...(o.ST || []).map(st => st.after.filter(x => x.op_type === 'DXF_OPENING' && (x.params.kind === 'door' || x.params.category === 'door')).map(x => ({ x, level: st.level }))));
const winJson = o => JSON.stringify([].concat(...(o.ST || []).map(st => st.after.filter(x => x.op_type === 'DXF_OPENING' && x.params.kind === 'window').map(x => Object.assign({}, x, { params: Object.assign({}, x.params, { elev_members: undefined, run_id: undefined, host_wall: undefined, host_handle: undefined, handle: undefined }), output_guid: undefined, input_guids: undefined })))));   // the sheets' entity handles and the run id (hence the guids) move whenever an earlier rule adds an entity or a layer to the map; nothing else about a window does
const srcOf = o => { const c = { elevation: 0, recessed: 0, schedule: 0, other: 0 }; doorOps(o).forEach(({ x }) => { if (x.params.height_source === 'elevation') { c.elevation++; if (x.params.face_recessed) c.recessed++; } else if (x.params.height_source === 'schedule') c.schedule++; else c.other++; }); return c; };
const gapN = (v, re) => v ? v.blocking.concat(v.advisory).filter(b => re.test(b.code)).length : 0;
if (process.argv.includes('--count')) { const con = new Database(dbs[0], { readonly: true }), r = roundTrip(load(M), s => con.prepare(s).all()); say('§COUNT ' + JSON.stringify(srcOf(r.o))); process.exit(0); }
const NEW = load(M), BASEL = process.env.BASE ? load(process.env.BASE) : null;
dbs.forEach(db => {
  const name = path.basename(db, '.db'), con = new Database(db, { readonly: true }), q = s => con.prepare(s).all();
  const { R, o, ms } = roundTrip(NEW, q); if (!o.ST) { check('D0[' + name + ']', 'converts', false, JSON.stringify(o.refused).slice(0, 200)); return; }
  const m = R.model, Dr = m.els.filter(e => e.cls === 'IfcDoor'), rec = R.log.filter(l => /^§ELEV_DOOR_RECESSED /.test(l));
  if (!Dr.length) { say('INCONCLUSIVE D*[' + name + '] no IfcDoor in the model: nothing judged'); return; }
  // D2: the expected recessed set, recomputed here (door in a wall, not flush on the faces along its run, nothing in front covering its h x z rect; the stated refusals among doors)
  const FN = { LEFT: ['x0', e => e.x0, e => e.x1, 'y'], RIGHT: ['x1', e => -e.x1, e => -e.x0, 'y'], FRONT: ['y0', e => e.y0, e => e.y1, 'x'], REAR: ['y1', e => -e.y1, e => -e.y0, 'x'] };
  const gw = m.walls.filter(w => w.storey === m.grid_storey), env = { x0: Math.min(...gw.map(w => w.x0)), x1: Math.max(...gw.map(w => w.x1)), y0: Math.min(...gw.map(w => w.y0)), y1: Math.max(...gw.map(w => w.y1)) };
  const covers = m.walls.concat(m.curtains || []), want = new Set();
  Dr.forEach(e => { const h = m.by_guid[m.host_all[e.guid]]; if (!h || !/^IfcWall/.test(h.cls)) return; const ax = (e.x1 - e.x0) >= (e.y1 - e.y0) ? 'x' : 'y', perp = ax === 'x' ? ['y0', 'y1'] : ['x0', 'x1'];
    const se = m.rules && m.rules.l118 ? (() => { const sw = m.walls.filter(w => w.storey === h.storey); return sw.length ? { x0: Math.min(...sw.map(w => w.x0)), x1: Math.max(...sw.map(w => w.x1)), y0: Math.min(...sw.map(w => w.y0)), y1: Math.max(...sw.map(w => w.y1)) } : null; })() : null;
    if (perp.some(s => Math.abs(h[s] - env[s]) <= 0.010 || (se && Math.abs(h[s] - se[s]) <= 0.010))) return;
    const run = o => ax === 'x' ? [o.x0, o.x1] : [o.y0, o.y1], r0 = run(e);
    if (Dr.some(o => o !== e && m.host_all[o.guid] !== m.host_all[e.guid] && (o.storey === e.storey || (o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002)) && ((o.x1 - o.x0) >= (o.y1 - o.y0)) === (ax === 'x') && Math.abs(run(o)[0] - r0[0]) <= 0.002 && Math.abs(run(o)[1] - r0[1]) <= 0.002)) return;
    Object.keys(FN).filter(f => FN[f][3] === ax).forEach(f => { const F = FN[f], a0 = ax === 'x' ? e.x0 : e.y0, a1 = ax === 'x' ? e.x1 : e.y1, n0 = F[1](e);
      if (Dr.some(o => o !== e && F[1](o) < n0 - 0.010 && run(o)[0] <= a1 + 0.002 && run(o)[1] >= a0 - 0.002 && o.z0 <= e.z1 + 0.002 && o.z1 >= e.z0 - 0.002)) return;
      if (!covers.some(c => c.guid !== h.guid && F[2](c) <= n0 + 0.010 && (ax === 'x' ? c.x0 <= a0 + 1e-6 && c.x1 >= a1 - 1e-6 : c.y0 <= a0 + 1e-6 && c.y1 >= a1 - 1e-6) && c.z0 <= e.z0 + 1e-6 && c.z1 >= e.z1 - 1e-6)) want.add(f + ' ' + e.guid); }); });
  const got = new Set(rec.map(l => l.split(' ')[1] + ' ' + /guid=(\S+)/.exec(l)[1])), miss = [...want].filter(k => !got.has(k)), extra = [...got].filter(k => !want.has(k));
  check('D2[' + name + ']', 'the writer draws exactly the recessed doors a face sees (recomputed here)', !miss.length && !extra.length, `recessed_drawn=${got.size} expected=${want.size} missing=${miss.length} extra=${extra.length}`);
  // D4: every door read off an elevation = its model door's z-range to 3 mm (plan footprint: the hinge inside the model door's box + 0.15 m, same storey)
  const ops = doorOps(o).filter(({ x }) => x.params.height_source === 'elevation'), lvls = o.ST.map(st => st.level).sort((a, b) => a - b);
  let wrong = 0, unmatched = 0, nRec = 0; const bad = [];
  ops.forEach(({ x, level }) => { const hg = x.params.hinge, top = lvls.find(l => l > level + 0.01), z0 = level, z1 = level + x.params.height; if (x.params.face_recessed) nRec++;
    const ms = Dr.filter(e => hg[0] >= e.x0 - 0.15 && hg[0] <= e.x1 + 0.15 && hg[1] >= e.y0 - 0.15 && hg[1] <= e.y1 + 0.15 && e.z0 >= level - 0.05 && (top === undefined || e.z0 < top - 0.01));
    if (!ms.length) { unmatched++; return; }
    if (!ms.some(e => Math.abs(e.z0 - z0) <= 0.003 && Math.abs(e.z1 - z1) <= 0.003)) { wrong++; if (bad.length < 6) bad.push(`${x.params.handle} read ${z0.toFixed(3)}..${z1.toFixed(3)} model ${ms.map(e => e.z0.toFixed(3) + '..' + e.z1.toFixed(3)).join('/')}`); } });
  check('D4[' + name + ']', 'every door read off an elevation = its model door\'s z-range to 3 mm (0 wrong)', wrong === 0, `from_elevation=${ops.length} recessed=${nRec} wrong=${wrong} no_model_match=${unmatched} ${bad.join('; ')}`);
  say(`§D74 ${name} doors_by_source ${JSON.stringify(srcOf(o))} new_ms=${ms}`);
  if (BASEL) { const b = roundTrip(BASEL, q), c1 = srcOf(o), c0 = srcOf(b.o), nb = doorOps(b.o).length, nn = doorOps(o).length, G = /^GAP:(no_elevation_height|elevation_height_conflict)$/;
    check('D5[' + name + ']', 'no loss against BASE: doors read not fewer, elevation-read not fewer, blocking and height gaps do not rise', nn >= nb && c1.elevation >= c0.elevation && o.verdict.blocking.length <= b.o.verdict.blocking.length && gapN(o.verdict, G) <= gapN(b.o.verdict, G),
      `doors ${nb}->${nn} elevation ${c0.elevation}->${c1.elevation} blocking ${b.o.verdict.blocking.length}->${o.verdict.blocking.length} height_gaps ${gapN(b.o.verdict, G)}->${gapN(o.verdict, G)}`);
    check('D7[' + name + ']', 'the windows are untouched: window ops identical to BASE but for entity handles and the run-id guids', winJson(o) === winJson(b.o), `equal=${winJson(o) === winJson(b.o)}`);
    say(`§D74-TIME ${name} base_ms=${b.ms} new_ms=${ms}`);
    const run = env => { const r = cp.spawnSync('node', [__filename, db, '--count'], { encoding: 'utf8', env: Object.assign({}, process.env, env) }); return JSON.parse((/§COUNT (.*)/.exec(r.stdout || '') || [0, 'null'])[1]); };
    const offR = run({ DXF_RECESSED_DOOR: '0' }), offB = run({ DXF_RECESSED_DOOR: '0', DXF_DOORBOX: '0' });
    check('D6[' + name + ']', 'FALSIFIER: DXF_RECESSED_DOOR=0 loses the recessed reads; with DXF_DOORBOX=0 too, fewer still (never more)', offR && offB && offR.recessed === 0 && offB.recessed === 0 && offB.elevation <= offR.elevation && offR.elevation <= c1.elevation, `recessed_off=${JSON.stringify(offR)} both_off=${JSON.stringify(offB)} base=${JSON.stringify(c0)} new=${JSON.stringify(c1)}`);
  } else say('INCONCLUSIVE D5/D6/D7[' + name + '] no BASE');
});
(async () => {   // D8: with the library, an elevation-read door binds by its LEAF height (the schedule path's rule): the fills that bind do not fall, none go unbound that BASE bound
  const dx = dbs.find(d => /DXARC/.test(d));
  if (!dx || !BASEL) { say('INCONCLUSIVE D8 | needs the Duplex db (DXARC) and BASE'); }
  else {
    const con = new Database(dx, { readonly: true }), q = s => con.prepare(s).all(), one = L => { const R = L.S.writeStdSet(q, 'X', {}), Dm = L.Mk.deriveMarks(R, { B: L.B, DxfParser: L.DxfParser, hashHex, MK: L.MK, SHC: L.SHC, SCOPES: L.SC }, { set: 'X' }); return L.I.readSheets(Object.keys(Dm.files).map(n => ({ name: n, text: Dm.files[n] }))); };
    let lib = null; try { lib = (await NEW.I.loadOci(one(NEW), { fetchJson: async u => (await fetch(u)).json(), base: 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/dxf2bim/library/' })).library; } catch (e) { say('  (library: ' + e.message + ')'); }
    if (!lib) say('INCONCLUSIVE D8 | no library reachable: nothing judged');
    else { const cnt = (L, c) => { const v = L.I.convert(one(L), { library: lib, defaultsRef: { defaults: { 'type.size_tie': { value: 'none' } } } }).verdict; return v.blocking.concat(v.advisory).filter(b => b.code === c).length; };
      const a = [cnt(BASEL, 'GAP:fill_unbound'), cnt(BASEL, 'GAP:type_unbound')], n = [cnt(NEW, 'GAP:fill_unbound'), cnt(NEW, 'GAP:type_unbound')];
      check('D8[DXARC]', 'with the library the fills do not get worse: fill_unbound and type_unbound not above BASE (elevation-read doors bind by leaf height)', n[0] <= a[0] && n[1] <= a[1], `fill_unbound ${a[0]}->${n[0]} type_unbound ${a[1]}->${n[1]}`); }
  }
  say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})();
