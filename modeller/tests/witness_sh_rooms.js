#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SH-ROOMS: real-user witness for bim-compiler prompts/MODELLER_MASTER.md §SH-ROOMS. Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: SampleHouse's source IFC states 4 IfcSpace rooms, but the shipped SampleHouse_ARC.db carries no
 * spatial_structure, so the walker never sees them, walks measured bands and places no ELEC/PLB device (no real mesh). With the rooms
 * shipped in the self-heal patch it must walk from ROOM SCHEDULES, each device inside its room, each with its own real mesh.
 * CLAIMS (RED on main: S1, S3, S4):
 *   S1 ROOMS     the opened building holds the IFC's own 4 IfcSpace rooms (count read from the opened DB = the IFC's count).
 *   S2 FRAME     every ground-storey room box lies inside the ARC elements' own envelope (the frame is measured, not assumed).
 *   S3 SCHEDULE  ELEC and PLB placements with prov sched:space-schedule:* > 0, and every one lies inside the box of a room.
 *   S4 REAL MESH every schedule placement carries a mesh (geometry hash); refusals are printed.
 *   S5 TYPING    reported as measured (§DW-SPACE-TYPE); the Roof space gets no device.
 *   S6 DUPLEX    control: Duplex ELEC/PLB/ACMV counts printed (compare with a run of this witness on main).
 * INCONCLUSIVE, never PASS, when the walk placed nothing.
 * Usage: node modeller/tests/witness_sh_rooms.js   (software GL, headless)
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const TAG = '§W-SH-ROOMS';
const IFC = path.join(__dirname, '..', '..', 'IFC', 'SampleHouse_ARC.ifc');
const ifcSpaces = (fs.readFileSync(IFC, 'latin1').match(/=\s*IFCSPACE\s*\(/g) || []).length;   // the IFC's own count

const walk = async (t, key, discs) => { const out = {};
  for (const disc of discs) { const n0 = t.slog.length;
    await t.pg.evaluate((d, k) => { window.__dwLastDoneDisc = null; window.discWalk(d, { building: k }); }, disc, key);
    await t.pg.waitForFunction(d => window.__dwLastDoneDisc === d, { timeout: 600000, polling: 500 }, disc).catch(() => {}); await t.sleep(500);
    const lines = t.slog.slice(n0);
    out[disc] = { lines, placed: await t.pg.evaluate(d => ((window.__dwWalks || {})[d] || []).map(p => ({ device: p.device || null, cls: p.ifc_class || null, prov: p.prov || null, x: +p.x, y: +p.y, z: +p.z,
      hash: p.geometry_hash || p.geometryHash || p.hash || null, provisional: !!p.provisional, keys: Object.keys(p).slice(0, 30) })), disc) };
    lines.filter(l => /§DW-SPACE-SOURCE|§DW-SPACE-TYPE|§DW-LOD400-REFUSE|§DW-PRIM-LOD|§DISC-WALK /.test(l)).slice(0, 8).forEach(l => console.log(TAG + ' ' + key + ' ' + disc + ' | ' + l.slice(0, 330)));
  } return out; };

runE2E('W-SH-ROOMS', async (t) => {
  // ── SampleHouse
  await t.open('SampleHouse');
  const db = await t.pg.evaluate(async () => { const d = window.OpenBuildingDb ? await window.OpenBuildingDb.get() : null; if (!d) return { noDb: true };   // the one reader of the open building's DB
    const has = d.exec("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='spatial_structure'")[0].values[0][0]; if (!has) return { table: 0, rooms: [] };
    const r = d.exec("SELECT guid, name, object_type, parent_guid, center_x, center_y, center_z, size_x, size_y, size_z FROM spatial_structure WHERE type='IfcSpace'");
    const st = d.exec("SELECT guid, name FROM spatial_structure WHERE type='IfcBuildingStorey'"), sn = {}; (st.length ? st[0].values : []).forEach(v => sn[v[0]] = v[1]);
    const e = d.exec('SELECT min(center_x-bbox_x/2), max(center_x+bbox_x/2), min(center_y-bbox_y/2), max(center_y+bbox_y/2), min(center_z-bbox_z/2), max(center_z+bbox_z/2) FROM element_transforms')[0].values[0];
    return { table: 1, env: e, rooms: (r.length ? r[0].values : []).map(v => ({ guid: v[0], name: v[1], type: v[2], storey: sn[v[3]] || null, x0: v[4] - v[7] / 2, x1: v[4] + v[7] / 2, y0: v[5] - v[8] / 2, y1: v[5] + v[8] / 2, z0: v[6] - v[9] / 2, z1: v[6] + v[9] / 2 })) }; });
  console.log(TAG + ' opened db ' + JSON.stringify(db).slice(0, 900));
  const rooms = (db && db.rooms) || [];
  t.assert('S1 ROOMS (the opened building holds the IFC\'s own IfcSpace rooms)', ifcSpaces > 0 && rooms.length === ifcSpaces, 'opened=' + rooms.length + ' ifc=' + ifcSpaces + ' table=' + (db && db.table) + (db && db.noDb ? ' NO DB HANDLE' : ''));
  const TOL = 0.05, ground = rooms.filter(r => r.z0 < 1), e = (db && db.env) || [];
  const out = ground.filter(r => r.x0 < e[0] - TOL || r.x1 > e[1] + TOL || r.y0 < e[2] - TOL || r.y1 > e[3] + TOL || r.z0 < e[4] - TOL || r.z1 > e[5] + TOL);
  if (!ground.length) console.log(TAG + ' S2 FRAME INCONCLUSIVE no ground room to judge');
  else t.assert('S2 FRAME (ground rooms inside the ARC envelope, tol ' + TOL + ' m)', out.length === 0, 'rooms=' + ground.length + ' outside=' + JSON.stringify(out.map(r => r.name)) + ' env=' + JSON.stringify(e.map(v => +(+v).toFixed(2))));

  const W = await walk(t, 'SampleHouse', ['ELEC', 'PLB']);
  const inRoom = (p) => rooms.find(r => p.x >= r.x0 - TOL && p.x <= r.x1 + TOL && p.y >= r.y0 - TOL && p.y <= r.y1 + TOL && p.z >= r.z0 - TOL && p.z <= r.z1 + TOL);
  let total = 0;
  for (const disc of ['ELEC', 'PLB']) {
    const pl = W[disc].placed, sched = pl.filter(p => /^sched:space-schedule:/.test(p.prov || '')), outside = sched.filter(p => !inRoom(p)), noMesh = sched.filter(p => !p.hash);
    const byRoom = {}; sched.forEach(p => { const r = inRoom(p); const k = r ? r.name : 'OUTSIDE'; byRoom[k] = (byRoom[k] || 0) + 1; }); total += sched.length;
    console.log(TAG + ' SampleHouse ' + disc + ' placed=' + pl.length + ' fromSchedule=' + sched.length + ' byRoom=' + JSON.stringify(byRoom) + ' provs=' + JSON.stringify(Array.from(new Set(pl.map(p => String(p.prov).split(':').slice(0, 2).join(':'))))) + (pl[0] ? ' keys=' + JSON.stringify(pl[0].keys) : ''));
    if (!sched.length) {   // no room of this building has a schedule for this service: then nothing may be placed without a real mesh, and the log must say why
      const ty = (W[disc].lines.filter(l => /§DW-SPACE-TYPE /.test(l))[0] || ''), tns = Number((/typedNoSchedule=(\d+)/.exec(ty) || [])[1]), none = Number((/ none=(\d+)/.exec(ty) || [])[1]);
      const explained = rooms.length > 0 && tns + none === rooms.length, noBox = pl.every(p => p.hash);
      if (disc === 'ELEC') t.assert('S3 SCHEDULE ELEC (devices from room schedules)', false, 'fromSchedule=0 placed=' + pl.length);
      else t.assert('S3 SCHEDULE ' + disc + ' (no room has a schedule for it: stated, and nothing placed without a real mesh)', explained && noBox, 'typedNoSchedule=' + tns + ' untyped=' + none + ' rooms=' + rooms.length + ' placed=' + pl.length + ' refusal=' + ((W[disc].lines.filter(l => /§DW-LOD400-REFUSE/.test(l))[0] || 'none').slice(0, 160)));
      continue; }
    t.assert('S3 SCHEDULE ' + disc + ' (every schedule device inside a room box)', outside.length === 0, 'fromSchedule=' + sched.length + ' outside=' + outside.length + (outside[0] ? ' first=' + JSON.stringify(outside[0]).slice(0, 200) : ''));
    t.assert('S4 REAL MESH ' + disc + ' (every schedule device carries its mesh)', noMesh.length === 0, 'withMesh=' + (sched.length - noMesh.length) + ' of ' + sched.length);
    const roof = sched.filter(p => { const r = inRoom(p); return r && /Roof/.test(r.type || r.name || ''); });
    t.assert('S5 TYPING ' + disc + ' (the Roof space gets no device)', roof.length === 0, 'inRoof=' + roof.length);
  }
  if (!total) console.log(TAG + ' INCONCLUSIVE the SampleHouse walk placed no schedule device: S3-S5 judged nothing');

  // ── S6 Duplex control (numbers to compare with this witness run on main)
  await t.pg.reload({ waitUntil: 'load' }); await t.pg.waitForFunction('window.__sceneReady===true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await t.open('Duplex');
  const D = await walk(t, 'Duplex', ['ELEC', 'PLB', 'ACMV']);
  console.log(TAG + ' S6 Duplex counts ' + JSON.stringify(Object.keys(D).reduce((o, d) => { o[d] = D[d].placed.length; return o; }, {})));
  t.assert('S6 DUPLEX walks (control is not vacuous)', D.ELEC.placed.length > 0, 'ELEC=' + D.ELEC.placed.length);
});
